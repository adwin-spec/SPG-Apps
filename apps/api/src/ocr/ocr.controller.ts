import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { PERMISSIONS, ocrDecisionSchema, ocrIngestMetaSchema, ocrReviewSchema, type AuthUser } from '@tanda/shared';
import { env } from '../config/env';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { OcrService, fileLogQuery } from './ocr.service';

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });

@ApiTags('OCR – Paper forms')
@ApiBearerAuth()
@Controller('ocr')
export class OcrController {
  constructor(private readonly svc: OcrService) {}

  /** Direct upload of a photographed paper form (alternative to Google Drive). */
  @Post('uploads')
  @RequireAnyPermission(PERMISSIONS.OCR_REVIEW, PERMISSIONS.WHOLESALE_SUBMIT)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, formId: { type: 'string' }, spgId: { type: 'string' }, wholesalerOutletId: { type: 'string' }, reportDate: { type: 'string' }, correctionOfFileLogId: { type: 'string' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: env().UPLOAD_MAX_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, string>, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Multipart field "file" is required' });
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== '' && v != null));
    const meta = new ZodPipe(ocrIngestMetaSchema).transform(clean);
    if (u.spgId && !u.permissions.includes(PERMISSIONS.OCR_REVIEW)) meta.spgId = u.spgId; // SPGs can only upload their own forms
    return this.svc.ingest(file.buffer, file.originalname, meta, { uploadedById: u.id, source: 'APP_UPLOAD' });
  }

  @Get('file-logs') @RequirePermissions(PERMISSIONS.OCR_REVIEW)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(fileLogQuery)) q: z.infer<typeof fileLogQuery>) { return this.svc.list(u, q); }

  @Get('file-logs/status-counts') @RequirePermissions(PERMISSIONS.OCR_REVIEW)
  counts() { return this.svc.statusCounts(); }

  @Get('file-logs/:id') @RequirePermissions(PERMISSIONS.OCR_REVIEW)
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Post('file-logs/:id/retry') @HttpCode(200) @RequirePermissions(PERMISSIONS.OCR_REVIEW)
  retry(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.retry(u, id); }

  @Post('file-logs/:id/reviews') @RequirePermissions(PERMISSIONS.OCR_REVIEW) @ApiZodBody(ocrReviewSchema)
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ocrReviewSchema)) b: z.infer<typeof ocrReviewSchema>) { return this.svc.review(u, id, b); }

  @Post('file-logs/:id/reject') @HttpCode(200) @RequirePermissions(PERMISSIONS.OCR_REVIEW) @ApiZodBody(rejectSchema)
  reject(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(rejectSchema)) b: z.infer<typeof rejectSchema>) { return this.svc.reject(u, id, b.reason); }

  @Post('reviews/:id/decision') @HttpCode(200) @RequirePermissions(PERMISSIONS.OCR_APPROVE) @ApiZodBody(ocrDecisionSchema)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ocrDecisionSchema)) b: z.infer<typeof ocrDecisionSchema>) { return this.svc.decide(u, id, b.decision, b.note); }
}
