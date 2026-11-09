import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, horecaProgramSchema, horecaSaleSchema, horecaVisitDetailSchema, posmRecordSchema, programImplementationSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { HorecaService, horecaListQuery } from './horeca.service';

const programStatus = z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'CLOSED']) });

@ApiTags('SPG HORECA')
@ApiBearerAuth()
@Controller()
export class HorecaController {
  constructor(private readonly svc: HorecaService) {}

  @Post('horeca/visit-details') @RequirePermissions(PERMISSIONS.HORECA_SUBMIT) @ApiZodBody(horecaVisitDetailSchema)
  visitDetail(@CurrentUser() u: AuthUser, @Body(new ZodPipe(horecaVisitDetailSchema)) b: z.infer<typeof horecaVisitDetailSchema>) { return this.svc.visitDetail(u, b); }

  @Post('horeca/sales') @RequirePermissions(PERMISSIONS.HORECA_SUBMIT) @ApiZodBody(horecaSaleSchema)
  sale(@CurrentUser() u: AuthUser, @Body(new ZodPipe(horecaSaleSchema)) b: z.infer<typeof horecaSaleSchema>) { return this.svc.sale(u, b); }

  @Get('horeca/sales') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.HORECA_SUBMIT)
  sales(@CurrentUser() u: AuthUser, @Query(new ZodPipe(horecaListQuery)) q: z.infer<typeof horecaListQuery>) { return this.svc.sales(u, q); }

  /** POSM is shared by HORECA and Reguler SPGs. */
  @Post('posm-records') @RequireAnyPermission(PERMISSIONS.HORECA_SUBMIT, PERMISSIONS.REGULAR_SUBMIT) @ApiZodBody(posmRecordSchema)
  posm(@CurrentUser() u: AuthUser, @Body(new ZodPipe(posmRecordSchema)) b: z.infer<typeof posmRecordSchema>) { return this.svc.posm(u, b); }

  @Get('horeca/programs') @RequireAnyPermission(PERMISSIONS.INTEL_READ, PERMISSIONS.HORECA_SUBMIT)
  programs() { return this.svc.programs(); }

  @Post('horeca/programs') @RequirePermissions(PERMISSIONS.PROGRAM_MANAGE) @ApiZodBody(horecaProgramSchema)
  createProgram(@CurrentUser() u: AuthUser, @Body(new ZodPipe(horecaProgramSchema)) b: z.infer<typeof horecaProgramSchema>) { return this.svc.createProgram(u, b); }

  @Patch('horeca/programs/:id/status') @RequirePermissions(PERMISSIONS.PROGRAM_MANAGE) @ApiZodBody(programStatus)
  programStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(programStatus)) b: z.infer<typeof programStatus>) { return this.svc.updateProgramStatus(u, id, b.status); }

  @Get('horeca/programs/:id/performance') @RequirePermissions(PERMISSIONS.INTEL_READ)
  programPerformance(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.programPerformance(u, id); }

  @Post('horeca/program-implementations') @RequirePermissions(PERMISSIONS.HORECA_SUBMIT) @ApiZodBody(programImplementationSchema)
  implement(@CurrentUser() u: AuthUser, @Body(new ZodPipe(programImplementationSchema)) b: z.infer<typeof programImplementationSchema>) { return this.svc.implement(u, b); }
}
