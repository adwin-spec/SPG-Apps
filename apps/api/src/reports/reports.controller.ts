import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS, analyticsFilter, type AuthUser } from '@tanda/shared';
import { ApiZodQuery, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { ReportsService } from './reports.service';

const exportQuery = analyticsFilter.extend({ format: z.enum(['csv', 'xlsx', 'pdf']) });
const keyParam = z.string().regex(/^[a-z-]{3,40}$/);

@ApiTags('Reports & Export')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get() @RequirePermissions(PERMISSIONS.DASHBOARD_READ)
  catalog() { return this.svc.catalog(); }

  @Get(':type') @RequirePermissions(PERMISSIONS.DASHBOARD_READ, PERMISSIONS.REPORT_READ) @ApiZodQuery(analyticsFilter)
  preview(@CurrentUser() u: AuthUser, @Param('type', new ZodPipe(keyParam)) type: string, @Query(new ZodPipe(analyticsFilter)) f: z.infer<typeof analyticsFilter>) { return this.svc.preview(u, type, f); }

  /** Export always applies exactly the same filter as the preview/dashboard (brief §M). */
  @Get(':type/export') @RequirePermissions(PERMISSIONS.REPORT_EXPORT) @ApiZodQuery(exportQuery)
  async export(@CurrentUser() u: AuthUser, @Param('type', new ZodPipe(keyParam)) type: string, @Query(new ZodPipe(exportQuery)) q: z.infer<typeof exportQuery>, @Res({ passthrough: true }) res: Response) {
    const { format, ...f } = q;
    const out = await this.svc.export(u, type, format, f);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(out.buffer, { type: out.mime, disposition: `attachment; filename="${out.filename}"`, length: out.buffer.length });
  }
}
