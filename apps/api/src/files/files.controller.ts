import { BadRequestException, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { z } from 'zod';
import { PERMISSIONS, type AuthUser } from '@tanda/shared';
import { env } from '../config/env';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { ScopeService } from '../common/scope/scope.service';

const purposeQuery = z.object({ purpose: z.enum(['evidence', 'attendance', 'ocr', 'document']).default('evidence') });

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly scope: ScopeService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.FILE_UPLOAD)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: env().UPLOAD_MAX_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: Express.Multer.File | undefined, @Query(new ZodPipe(purposeQuery)) q: z.infer<typeof purposeQuery>, @CurrentUser() u: AuthUser) {
    if (!file) throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Multipart field "file" is required' });
    const stored = await this.storage.put(file.buffer, q.purpose);
    const safeName = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 200);
    const row = await this.prisma.fileObject.create({ data: { ...stored, originalName: safeName, uploadedById: u.id } });
    return { id: row.id, mimeType: row.mimeType, sizeBytes: row.sizeBytes, checksumSha256: row.checksumSha256, createdAt: row.createdAt };
  }

  /** Streams a file. SPG: own uploads only. Managers: files they can read through their scope. */
  @Get(':id/content')
  @RequireAnyPermission(PERMISSIONS.FILE_UPLOAD, PERMISSIONS.VISIT_READ, PERMISSIONS.OCR_REVIEW)
  async content(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    const f = await this.prisma.fileObject.findUniqueOrThrow({ where: { id } });
    const isManager = u.permissions.includes(PERMISSIONS.VISIT_READ) || u.permissions.includes(PERMISSIONS.OCR_REVIEW);
    if (!isManager && f.uploadedById !== u.id) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'File not accessible' });
    if (isManager && f.uploadedById && f.uploadedById !== u.id) {
      const owner = await this.prisma.spg.findFirst({ where: { userId: f.uploadedById }, select: { id: true } });
      if (owner && !(await this.scope.canAccessSpg(u, owner.id))) throw new ForbiddenException({ code: 'OUT_OF_SCOPE', message: 'File not accessible' });
    }
    const stream = await this.storage.getStream(f.storageKey);
    return new StreamableFile(stream, { type: f.mimeType, disposition: `inline; filename="${f.originalName.replace(/"/g, '')}"` });
  }
}
