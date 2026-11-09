import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { DuplicateType, FileSource, Prisma } from '@tanda/database';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ocrIngestMetaSchema, ocrReviewSchema, paginationQuery, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AuditService } from '../common/audit/audit.service';
import { ScopeService } from '../common/scope/scope.service';
import { Paginated, pageArgs, toDate } from '../common/http/paginated';
import { QueueService } from '../queue/queue.service';
import { TransactionsService } from '../transactions/transactions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OcrProvider } from './ocr-provider';
import { parseForm } from './form-parser';

export const fileLogQuery = paginationQuery.extend({
  status: z.enum(['UPLOADED', 'PROCESSING', 'OCR_COMPLETED', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'SYNC_FAILED']).optional(),
  duplicateType: z.enum(['NONE', 'EXACT_DUPLICATE', 'POTENTIAL_DUPLICATE', 'RE_UPLOAD', 'CORRECTED_SUBMISSION']).optional(),
  spgId: z.uuid().optional(),
});

/**
 * Paper-form pipeline (brief §K):
 * UPLOADED → PROCESSING → OCR_COMPLETED → NEEDS_REVIEW → (review) → APPROVED | REJECTED,  errors → SYNC_FAILED (retryable).
 * OCR output is immutable (ocr_raw), corrections are stored separately (ocr_reviews), and a retailer
 * transaction is created ONLY when a second person approves the reviewed payload.
 */
@Injectable()
export class OcrService implements OnModuleInit {
  private readonly log = new Logger(OcrService.name);
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly scope: ScopeService,
    private readonly queue: QueueService, private readonly provider: OcrProvider, private readonly transactions: TransactionsService, private readonly notifications: NotificationsService) {}

  onModuleInit() { this.queue.register('ocr', 'process', async (d) => this.process(d.fileLogId as string)); }

  /** Duplicate classification – flags only, nothing is ever deleted. */
  async classify(checksum: string, meta: z.infer<typeof ocrIngestMetaSchema>, excludeFileId?: string): Promise<{ type: DuplicateType; ofId: string | null }> {
    if (meta.correctionOfFileLogId) {
      const orig = await this.prisma.fileLog.findUnique({ where: { id: meta.correctionOfFileLogId } });
      if (!orig) throw new BadRequestException({ code: 'INVALID_CORRECTION', message: 'Original submission not found' });
      return { type: 'CORRECTED_SUBMISSION', ofId: orig.id };
    }
    const exact = await this.prisma.fileLog.findFirst({ where: { file: { checksumSha256: checksum, ...(excludeFileId ? { id: { not: excludeFileId } } : {}) }, status: { not: 'REJECTED' } }, orderBy: { createdAt: 'asc' } });
    if (exact) return { type: 'EXACT_DUPLICATE', ofId: exact.id };
    if (meta.formId) {
      const same = await this.prisma.fileLog.findFirst({ where: { formId: meta.formId, status: { not: 'REJECTED' } }, orderBy: { createdAt: 'asc' } });
      if (same) return { type: 'RE_UPLOAD', ofId: same.id };
    }
    if (meta.spgId && meta.wholesalerOutletId && meta.reportDate) {
      const p = await this.prisma.fileLog.findFirst({ where: { spgId: meta.spgId, wholesalerOutletId: meta.wholesalerOutletId, reportDate: toDate(meta.reportDate), status: { not: 'REJECTED' } } });
      if (p) return { type: 'POTENTIAL_DUPLICATE', ofId: p.id };
    }
    return { type: 'NONE', ofId: null };
  }

  async ingest(buf: Buffer, originalName: string, meta: z.infer<typeof ocrIngestMetaSchema>, opts: { uploadedById?: string | null; source: FileSource; externalId?: string | null }) {
    const stored = await this.storage.put(buf, 'ocr');
    const dup = await this.classify(stored.checksumSha256, meta);
    const { file, log } = await this.prisma.$transaction(async (tx) => {
      const file = await tx.fileObject.create({ data: { ...stored, originalName: originalName.replace(/[^\w.\- ]+/g, '_').slice(0, 200), source: opts.source, externalId: opts.externalId, uploadedById: opts.uploadedById } });
      const log = await tx.fileLog.create({ data: { fileId: file.id, formId: meta.formId, spgId: meta.spgId, wholesalerOutletId: meta.wholesalerOutletId, reportDate: meta.reportDate ? toDate(meta.reportDate) : null,
        status: 'UPLOADED', duplicateType: dup.type, duplicateOfId: dup.ofId } });
      await this.audit.log({ actorId: opts.uploadedById, action: 'OCR_INGEST', entityType: 'FileLog', entityId: log.id, after: { source: opts.source, duplicate: dup, meta } }, tx);
      return { file, log };
    });
    if (dup.type !== 'NONE') await this.notifications.emit('DUPLICATE_SUBMISSION', { title: `Paper form flagged ${dup.type.replace('_', ' ').toLowerCase()}`, link: `/integrations/ocr/${log.id}`, dedup: log.id, spgId: meta.spgId ?? undefined });
    // A processing failure must not lose the upload: the file log moves to SYNC_FAILED and can be retried.
    await this.queue.enqueue('ocr', 'process', { fileLogId: log.id }, { jobId: `ocr-${log.id}` }).catch((e) => this.log.warn(`OCR deferred: ${(e as Error).message}`));
    return { fileLogId: log.id, fileId: file.id, duplicate: dup };
  }

  /** Worker step. Idempotent per attempt; failures are recorded and retryable. */
  async process(fileLogId: string) {
    const log = await this.prisma.fileLog.findUnique({ where: { id: fileLogId }, include: { file: true } });
    if (!log || !['UPLOADED', 'SYNC_FAILED'].includes(log.status)) return;
    await this.prisma.fileLog.update({ where: { id: fileLogId }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lastError: null } });
    try {
      const buf = await this.storage.getBuffer(log.file.storageKey);
      const out = await this.provider.extract(buf, log.file.mimeType);
      const parsed = parseForm(out.rawText, out.confidence);
      await this.prisma.ocrRaw.create({ data: { fileLogId, provider: out.provider, rawText: out.rawText, rawJson: out.rawJson as Prisma.InputJsonValue,
        parsedFields: parsed as unknown as Prisma.InputJsonValue, confidence: out.confidence ?? (out.rawText ? parsed.overallConfidence : null) } });
      await this.prisma.fileLog.update({ where: { id: fileLogId }, data: { status: 'OCR_COMPLETED' } });
      // OCR is never final: always routed to human review.
      await this.prisma.fileLog.update({ where: { id: fileLogId }, data: { status: 'NEEDS_REVIEW', formId: log.formId ?? parsed.formId.value } });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 1000);
      this.log.error(`OCR failed for ${fileLogId}: ${msg}`);
      await this.prisma.fileLog.update({ where: { id: fileLogId }, data: { status: 'SYNC_FAILED', lastError: msg } });
      await this.prisma.integrationLog.create({ data: { level: 'CRITICAL', message: `OCR failed: ${msg}`, context: { fileLogId } } });
      throw e;
    }
  }

  async retry(user: AuthUser, id: string) {
    const log = await this.prisma.fileLog.findUniqueOrThrow({ where: { id } });
    if (log.status !== 'SYNC_FAILED') throw new ConflictException({ code: 'NOT_FAILED', message: `File log is ${log.status}` });
    await this.audit.log({ actorId: user.id, action: 'OCR_RETRY', entityType: 'FileLog', entityId: id });
    await this.queue.enqueue('ocr', 'process', { fileLogId: id }, { jobId: `ocr-${id}-retry-${log.attempts}` }).catch((e) => this.log.warn(`Retry failed: ${(e as Error).message}`));
    return { queued: true };
  }

  async list(user: AuthUser, q: z.infer<typeof fileLogQuery>) {
    const scoped = await this.scope.spgScope(user);
    const where: Prisma.FileLogWhereInput = { AND: [scoped.all ? {} : { OR: [{ spgId: null }, { spgId: { in: scoped.spgIds } }] },
      q.status ? { status: q.status } : {}, q.duplicateType ? { duplicateType: q.duplicateType } : {}, q.spgId ? { spgId: q.spgId } : {},
      q.q ? { OR: [{ formId: { contains: q.q, mode: 'insensitive' } }, { file: { originalName: { contains: q.q, mode: 'insensitive' } } }] } : {}] };
    const [items, total] = await Promise.all([
      this.prisma.fileLog.findMany({ where, include: { file: { select: { id: true, originalName: true, mimeType: true, source: true, sizeBytes: true } }, ocrRaw: { select: { confidence: true, provider: true }, orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' }, ...pageArgs(q) }),
      this.prisma.fileLog.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  async statusCounts() {
    return Object.fromEntries((await this.prisma.fileLog.groupBy({ by: ['status'], _count: true })).map((g) => [g.status, g._count]));
  }

  async get(id: string) {
    const log = await this.prisma.fileLog.findUnique({ where: { id }, include: { file: true, ocrRaw: { orderBy: { createdAt: 'desc' }, include: { reviews: { orderBy: { createdAt: 'desc' } } } } } });
    if (!log) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File log not found' });
    const [duplicateOf, spg, wholesaler, related] = await Promise.all([
      log.duplicateOfId ? this.prisma.fileLog.findUnique({ where: { id: log.duplicateOfId }, select: { id: true, status: true, formId: true, createdAt: true } }) : null,
      log.spgId ? this.prisma.spg.findUnique({ where: { id: log.spgId }, select: { id: true, fullName: true, employeeCode: true } }) : null,
      log.wholesalerOutletId ? this.prisma.outlet.findUnique({ where: { id: log.wholesalerOutletId }, select: { id: true, name: true, code: true } }) : null,
      this.prisma.retailerTransaction.findMany({ where: { fileLogId: id }, select: { id: true, transactionNo: true, validationStatus: true } }),
    ]);
    return { ...log, duplicateOf, spg, wholesaler, transactions: related };
  }

  /** Reviewer submits corrected payload. Original OCR values stay in ocr_raw; corrections are recorded field by field. */
  async review(user: AuthUser, fileLogId: string, input: z.infer<typeof ocrReviewSchema>) {
    const log = await this.prisma.fileLog.findUnique({ where: { id: fileLogId }, include: { ocrRaw: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!log) throw new NotFoundException({ code: 'NOT_FOUND', message: 'File log not found' });
    if (log.status !== 'NEEDS_REVIEW') throw new ConflictException({ code: 'NOT_REVIEWABLE', message: `File log is ${log.status}` });
    const raw = log.ocrRaw[0];
    if (!raw) throw new ConflictException({ code: 'NO_OCR', message: 'OCR has not completed yet' });
    if (!(await this.scope.canAccessSpg(user, input.final.spgId))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'SPG outside your scope' });
    // validate business references now so the approver sees a clean payload
    await this.transactions.validate({ retailerOutletId: input.final.retailerOutletId, wholesalerOutletId: input.final.wholesalerOutletId, transactionDate: input.final.transactionDate, items: input.final.items as never }, input.final.spgId);
    return this.prisma.$transaction(async (tx) => {
      await tx.ocrReview.updateMany({ where: { ocrRawId: raw.id, status: 'PENDING' }, data: { status: 'CANCELLED', decisionNote: 'Superseded by a newer review' } });
      const r = await tx.ocrReview.create({ data: { ocrRawId: raw.id, reviewerId: user.id, corrections: input.corrections as Prisma.InputJsonValue, finalPayload: input.final as Prisma.InputJsonValue } });
      await tx.fileLog.update({ where: { id: fileLogId }, data: { spgId: input.final.spgId, wholesalerOutletId: input.final.wholesalerOutletId, reportDate: toDate(input.final.transactionDate) } });
      await this.audit.log({ actorId: user.id, action: 'OCR_REVIEW', entityType: 'FileLog', entityId: fileLogId, after: { reviewId: r.id, corrections: input.corrections } }, tx);
      return r;
    });
  }

  /** Approver (≠ reviewer) decides. Only APPROVED creates the transaction (source = OCR). */
  async decide(user: AuthUser, reviewId: string, decision: 'APPROVED' | 'REJECTED', note?: string | null) {
    const review = await this.prisma.ocrReview.findUnique({ where: { id: reviewId }, include: { ocrRaw: { include: { fileLog: true } } } });
    if (!review) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Review not found' });
    if (review.status !== 'PENDING') throw new ConflictException({ code: 'ALREADY_DECIDED', message: `Review is ${review.status}` });
    if (review.reviewerId === user.id) throw new ForbiddenException({ code: 'MAKER_CHECKER', message: 'The reviewer cannot approve their own review' });
    const log = review.ocrRaw.fileLog;
    if (decision === 'APPROVED' && log.duplicateType === 'EXACT_DUPLICATE') throw new ConflictException({ code: 'EXACT_DUPLICATE', message: 'This file is an exact duplicate of an earlier submission; reject it instead' });
    const final = review.finalPayload as z.infer<typeof ocrReviewSchema>['final'];
    return this.prisma.$transaction(async (tx) => {
      let transactionId: string | null = null;
      if (decision === 'APPROVED') {
        const t = await this.transactions.create({ clientId: randomUUID(), retailerOutletId: final.retailerOutletId, wholesalerOutletId: final.wholesalerOutletId, transactionDate: final.transactionDate,
          dataNature: 'ACTUAL', evidenceFileId: log.fileId, notes: `From paper form ${log.formId ?? log.id}`, visitId: null, items: final.items as never },
          { spgId: final.spgId, createdById: review.reviewerId, source: 'OCR', fileLogId: log.id, forceStatus: 'APPROVED' }, tx);
        await tx.retailerTransaction.update({ where: { id: t.id }, data: { approvedById: user.id, approvedAt: new Date() } });
        transactionId = t.id;
      }
      await tx.ocrReview.update({ where: { id: reviewId }, data: { status: decision, approvedById: user.id, approvedAt: new Date(), decisionNote: note, resultTransactionId: transactionId } });
      await tx.fileLog.update({ where: { id: log.id }, data: { status: decision } });
      await this.audit.log({ actorId: user.id, action: `OCR_${decision}`, entityType: 'FileLog', entityId: log.id, after: { reviewId, transactionId }, reason: note }, tx);
      return { status: decision, transactionId };
    });
  }

  /** Reject a submission outright (e.g. unreadable, duplicate) without a review payload. */
  async reject(user: AuthUser, fileLogId: string, reason: string) {
    const log = await this.prisma.fileLog.findUniqueOrThrow({ where: { id: fileLogId } });
    if (['APPROVED', 'REJECTED'].includes(log.status)) throw new ConflictException({ code: 'ALREADY_DECIDED', message: `File log is ${log.status}` });
    await this.prisma.fileLog.update({ where: { id: fileLogId }, data: { status: 'REJECTED', lastError: reason } });
    await this.audit.log({ actorId: user.id, action: 'OCR_REJECTED', entityType: 'FileLog', entityId: fileLogId, reason });
    return { status: 'REJECTED' };
  }
}
