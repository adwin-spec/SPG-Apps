import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, retailerTransactionSchema, reversalSchema, transactionCorrectionSchema, transactionDecisionSchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { requireSpg } from '../common/field-guard';
import { TransactionsService, txListQuery } from './transactions.service';

@ApiTags('SPG Grosir – Retailer Transactions')
@ApiBearerAuth()
@Controller('retailer-transactions')
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Post() @RequirePermissions(PERMISSIONS.WHOLESALE_SUBMIT) @ApiZodBody(retailerTransactionSchema)
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(retailerTransactionSchema)) b: z.infer<typeof retailerTransactionSchema>) {
    const spgId = requireSpg(u);
    return this.svc.create(b, { spgId, createdById: u.id, source: b.clientRecordedAt && Date.now() - Date.parse(b.clientRecordedAt) > 300000 ? 'OFFLINE_SYNC' : 'MANUAL' });
  }

  @Get() @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.WHOLESALE_SUBMIT)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(txListQuery)) q: z.infer<typeof txListQuery>) { return this.svc.list(u, q); }

  @Get(':id') @RequireAnyPermission(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.WHOLESALE_SUBMIT)
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post(':id/decision') @HttpCode(200) @RequirePermissions(PERMISSIONS.TRANSACTION_APPROVE) @ApiZodBody(transactionDecisionSchema)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(transactionDecisionSchema)) b: z.infer<typeof transactionDecisionSchema>) { return this.svc.decide(u, id, b.decision, b.note); }

  @Post(':id/corrections') @RequirePermissions(PERMISSIONS.TRANSACTION_CORRECT) @ApiZodBody(transactionCorrectionSchema)
  correct(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(transactionCorrectionSchema)) b: z.infer<typeof transactionCorrectionSchema>) { return this.svc.correct(u, id, b); }

  @Post(':id/reversal-requests') @RequirePermissions(PERMISSIONS.TRANSACTION_CORRECT) @ApiZodBody(reversalSchema)
  reverse(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(reversalSchema)) b: z.infer<typeof reversalSchema>) { return this.svc.requestReversal(u, id, b.reason); }
}
