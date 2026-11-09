import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { paginationQuery, type AuthUser } from '@tanda/shared';
import { env } from '../config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../common/settings/settings.service';
import { Paginated, pageArgs } from '../common/http/paginated';
import { QueueService } from '../queue/queue.service';
import { OcrService } from '../ocr/ocr.service';
import { GoogleClient } from './google.client';

type SheetMap = Record<string, { sheet: string; columns: Record<string, string> }>;
export const jobQuery = paginationQuery.extend({ integration: z.string().max(40).optional(), status: z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']).optional() });

/**
 * Google Drive / Sheets are integration SOURCES and mirrors only – PostgreSQL stays the system of record.
 * Sheet and column names come from `integrations.googleSheets.mapping` so renames need no code change.
 */
@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly log = new Logger(IntegrationsService.name);
  constructor(private readonly prisma: PrismaService, private readonly settings: SettingsService, private readonly google: GoogleClient, private readonly ocr: OcrService, private readonly queue: QueueService) {}

  onModuleInit() {
    this.queue.register('integrations', 'drive-sync', async (d) => this.syncDrive(d.triggeredById as string | undefined));
    this.queue.register('integrations', 'sheets-sync', async (d) => this.syncSheets(d.triggeredById as string | undefined));
  }

  async status() {
    const e = env();
    const last = await Promise.all(['GOOGLE_DRIVE', 'GOOGLE_SHEETS'].map((i) => this.prisma.syncJob.findFirst({ where: { integration: i }, orderBy: { createdAt: 'desc' } })));
    return {
      googleConfigured: this.google.configured, driveFolderConfigured: !!e.GOOGLE_DRIVE_INBOX_FOLDER_ID, sheetsConfigured: !!e.GOOGLE_SHEETS_SPREADSHEET_ID,
      ocrProvider: e.OCR_PROVIDER, drivePollCron: e.DRIVE_POLL_CRON, queuesEnabled: e.QUEUES_ENABLED,
      lastDriveSync: last[0], lastSheetsSync: last[1], mapping: await this.settings.get<SheetMap>('integrations.googleSheets.mapping'),
      fileLogStatus: Object.fromEntries((await this.prisma.fileLog.groupBy({ by: ['status'], _count: true })).map((g) => [g.status, g._count])),
    };
  }

  async trigger(user: AuthUser, kind: 'drive-sync' | 'sheets-sync') {
    if (!this.google.configured) throw new ConflictException({ code: 'NOT_CONFIGURED', message: 'Google integration is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 and folder/sheet IDs.' });
    return this.queue.enqueue('integrations', kind, { triggeredById: user.id });
  }

  private async job<T>(integration: string, jobType: string, triggeredById: string | undefined, fn: (log: (level: 'INFO' | 'WARNING' | 'CRITICAL', message: string, context?: object) => Promise<void>) => Promise<T>) {
    const job = await this.prisma.syncJob.create({ data: { integration, jobType, status: 'RUNNING', startedAt: new Date(), triggeredById } });
    const log = async (level: 'INFO' | 'WARNING' | 'CRITICAL', message: string, context?: object) => { await this.prisma.integrationLog.create({ data: { syncJobId: job.id, level, message, context: context as Prisma.InputJsonValue } }); };
    try {
      const stats = await fn(log);
      await this.prisma.syncJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', finishedAt: new Date(), stats: stats as Prisma.InputJsonValue } });
      return stats;
    } catch (e) {
      await log('CRITICAL', (e as Error).message);
      await this.prisma.syncJob.update({ where: { id: job.id }, data: { status: 'FAILED', finishedAt: new Date(), error: (e as Error).message.slice(0, 2000) } });
      throw e;
    }
  }

  /** Detect new photos in the Drive inbox. File name convention (optional): FORMID_SPGCODE_GROSIRCODE_YYYYMMDD.ext */
  async syncDrive(triggeredById?: string) {
    const folder = env().GOOGLE_DRIVE_INBOX_FOLDER_ID;
    return this.job('GOOGLE_DRIVE', 'drive-sync', triggeredById, async (log) => {
      if (!folder) throw new Error('GOOGLE_DRIVE_INBOX_FOLDER_ID is not set');
      const last = await this.prisma.syncJob.findFirst({ where: { integration: 'GOOGLE_DRIVE', status: 'SUCCEEDED' }, orderBy: { createdAt: 'desc' } });
      const files = await this.google.listFolder(folder, (last?.stats as { cursor?: string } | null)?.cursor);
      let ingested = 0, skipped = 0, failed = 0; let cursor = (last?.stats as { cursor?: string } | null)?.cursor;
      for (const f of files) {
        cursor = f.modifiedTime;
        if (await this.prisma.fileObject.findFirst({ where: { externalId: f.id } })) { skipped++; continue; }
        try {
          const meta = await this.metaFromName(f.name);
          await this.ocr.ingest(await this.google.download(f.id), f.name, meta, { source: 'GOOGLE_DRIVE', externalId: f.id, uploadedById: null });
          ingested++;
        } catch (e) { failed++; await log('WARNING', `Failed to ingest ${f.name}: ${(e as Error).message}`, { driveFileId: f.id }); }
      }
      await log('INFO', `Drive sync: ${ingested} new, ${skipped} already known, ${failed} failed`);
      return { listed: files.length, ingested, skipped, failed, cursor };
    });
  }

  async metaFromName(name: string) {
    const m = name.replace(/\.[^.]+$/, '').split('_');
    if (m.length < 4) return {};
    const [formId, spgCode, grosirCode, date] = m;
    const [spg, ws] = await Promise.all([this.prisma.spg.findUnique({ where: { employeeCode: spgCode } }), this.prisma.outlet.findUnique({ where: { code: grosirCode } })]);
    const reportDate = /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : null;
    return { formId, spgId: spg?.id ?? null, wholesalerOutletId: ws?.channel === 'WHOLESALER' ? ws.id : null, reportDate };
  }

  /**
   * Sheets mirror: (1) import human transcriptions from INPUT_HARIAN into the review queue (as ocr_raw, provider "sheet"),
   * (2) append FILE_LOG / OCR_RAW / TRANSACTION_DB rows for records changed since the previous run.
   */
  async syncSheets(triggeredById?: string) {
    const sid = env().GOOGLE_SHEETS_SPREADSHEET_ID;
    const map = await this.settings.get<SheetMap>('integrations.googleSheets.mapping');
    return this.job('GOOGLE_SHEETS', 'sheets-sync', triggeredById, async (log) => {
      if (!sid) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set');
      const last = await this.prisma.syncJob.findFirst({ where: { integration: 'GOOGLE_SHEETS', status: 'SUCCEEDED' }, orderBy: { createdAt: 'desc' } });
      const since = last?.finishedAt ?? new Date(0);
      // (1) INPUT_HARIAN import
      const input = map.INPUT_HARIAN; let imported = 0;
      const values = await this.google.readSheet(sid, input.sheet);
      if (values.length > 1) {
        const header = values[0]; const col = (k: string) => header.indexOf(input.columns[k]);
        const byForm = new Map<string, string[][]>();
        for (const row of values.slice(1)) { const fid = row[col('formId')]; if (fid) byForm.set(fid, [...(byForm.get(fid) ?? []), row]); }
        for (const [formId, rows] of byForm) {
          const fl = await this.prisma.fileLog.findFirst({ where: { formId, status: { in: ['NEEDS_REVIEW', 'SYNC_FAILED', 'UPLOADED'] } }, include: { ocrRaw: true } });
          if (!fl || fl.ocrRaw.some((r) => r.provider === 'sheet:INPUT_HARIAN')) continue;
          const items = rows.map((r) => ({ sku: r[col('sku')], brand: r[col('brand')], quantity: Number(r[col('quantity')]), unit: r[col('unit')], price: Number(r[col('price')]), retailer: r[col('retailerName')] }));
          await this.prisma.ocrRaw.create({ data: { fileLogId: fl.id, provider: 'sheet:INPUT_HARIAN', rawText: rows.map((r) => r.join(' | ')).join('\n'), rawJson: { rows } as Prisma.InputJsonValue,
            parsedFields: { source: 'INPUT_HARIAN', items } as Prisma.InputJsonValue, confidence: 1 } });
          if (fl.status !== 'NEEDS_REVIEW') await this.prisma.fileLog.update({ where: { id: fl.id }, data: { status: 'NEEDS_REVIEW' } });
          imported++;
        }
      }
      // (2) mirrors
      const logs = await this.prisma.fileLog.findMany({ where: { updatedAt: { gt: since } }, include: { file: true } });
      const fc = map.FILE_LOG.columns;
      await this.google.appendRows(sid, map.FILE_LOG.sheet, logs.map((l) => Object.keys(fc).map((k) => ({ fileId: l.id, fileName: l.file.originalName, spgId: l.spgId, wholesalerId: l.wholesalerOutletId, reportDate: l.reportDate?.toISOString().slice(0, 10) ?? null, status: l.status } as Record<string, string | null>)[k] ?? null)));
      const raws = await this.prisma.ocrRaw.findMany({ where: { createdAt: { gt: since }, provider: { not: 'sheet:INPUT_HARIAN' } } });
      await this.google.appendRows(sid, map.OCR_RAW.sheet, raws.map((r) => [r.fileLogId, (r.rawText ?? '').slice(0, 45000), r.confidence == null ? null : Number(r.confidence)]));
      const txs = await this.prisma.retailerTransaction.findMany({ where: { validationStatus: 'APPROVED', approvedAt: { gt: since } }, include: { items: { include: { productVariant: true } }, retailer: true, wholesaler: true, spg: true } });
      await this.google.appendRows(sid, map.TRANSACTION_DB.sheet, txs.flatMap((t) => t.items.map((i) => [t.transactionNo, t.retailer.code, t.wholesaler?.code ?? null, t.spg.employeeCode, t.transactionDate.toISOString().slice(0, 10), i.productVariant?.sku ?? i.skuText, Number(i.quantity), i.lineTotal == null ? null : Number(i.lineTotal)])));
      await log('INFO', `Sheets sync: imported ${imported} INPUT_HARIAN forms; mirrored ${logs.length} file logs, ${raws.length} OCR rows, ${txs.length} transactions`);
      return { imported, fileLogs: logs.length, ocrRows: raws.length, transactions: txs.length };
    });
  }

  async jobs(q: z.infer<typeof jobQuery>) {
    const where: Prisma.SyncJobWhereInput = { ...(q.integration ? { integration: q.integration } : {}), ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([this.prisma.syncJob.findMany({ where, orderBy: { createdAt: 'desc' }, include: { logs: { orderBy: { createdAt: 'asc' }, take: 50 } }, ...pageArgs(q) }), this.prisma.syncJob.count({ where })]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  logs() { return this.prisma.integrationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); }
}
