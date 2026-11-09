import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, availabilityBatchSchema, outletOrderSchema, visibilityRecordSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { RegularService, regularListQuery } from './regular.service';

@ApiTags('SPG Reguler')
@ApiBearerAuth()
@Controller('regular')
export class RegularController {
  constructor(private readonly svc: RegularService) {}

  @Post('availability') @RequirePermissions(PERMISSIONS.REGULAR_SUBMIT) @ApiZodBody(availabilityBatchSchema)
  availability(@CurrentUser() u: AuthUser, @Body(new ZodPipe(availabilityBatchSchema)) b: z.infer<typeof availabilityBatchSchema>) { return this.svc.availability(u, b); }

  @Get('availability') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.REGULAR_SUBMIT)
  availabilityList(@CurrentUser() u: AuthUser, @Query(new ZodPipe(regularListQuery)) q: z.infer<typeof regularListQuery>) { return this.svc.availabilityList(u, q); }

  @Post('visibility') @RequirePermissions(PERMISSIONS.REGULAR_SUBMIT) @ApiZodBody(visibilityRecordSchema)
  visibility(@CurrentUser() u: AuthUser, @Body(new ZodPipe(visibilityRecordSchema)) b: z.infer<typeof visibilityRecordSchema>) { return this.svc.visibility(u, b); }

  @Get('visibility') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.REGULAR_SUBMIT)
  visibilityList(@CurrentUser() u: AuthUser, @Query(new ZodPipe(regularListQuery)) q: z.infer<typeof regularListQuery>) { return this.svc.visibilityList(u, q); }

  @Post('orders') @RequirePermissions(PERMISSIONS.REGULAR_SUBMIT) @ApiZodBody(outletOrderSchema)
  order(@CurrentUser() u: AuthUser, @Body(new ZodPipe(outletOrderSchema)) b: z.infer<typeof outletOrderSchema>) { return this.svc.order(u, b); }

  @Get('orders') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.REGULAR_SUBMIT)
  orders(@CurrentUser() u: AuthUser, @Query(new ZodPipe(regularListQuery)) q: z.infer<typeof regularListQuery>) { return this.svc.orders(u, q); }
}
