import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, competitorObservationSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { CompetitorsService, obsListQuery } from './competitors.service';

@ApiTags('Competitor Intelligence')
@ApiBearerAuth()
@Controller('competitor-observations')
export class CompetitorsController {
  constructor(private readonly svc: CompetitorsService) {}

  @Post() @RequireAnyPermission(PERMISSIONS.WHOLESALE_SUBMIT, PERMISSIONS.HORECA_SUBMIT, PERMISSIONS.REGULAR_SUBMIT) @ApiZodBody(competitorObservationSchema)
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(competitorObservationSchema)) b: z.infer<typeof competitorObservationSchema>) { return this.svc.create(u, b); }

  @Get() @RequireAnyPermission(PERMISSIONS.INTEL_READ, PERMISSIONS.WHOLESALE_SUBMIT, PERMISSIONS.HORECA_SUBMIT, PERMISSIONS.REGULAR_SUBMIT)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(obsListQuery)) q: z.infer<typeof obsListQuery>) { return this.svc.list(u, q); }
}
