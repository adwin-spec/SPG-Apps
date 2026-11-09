import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@tanda/database';
import { z } from 'zod';
import { jakartaDate, wholesaleObservationSchema, wholesaleReportSchema, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { SettingsService } from '../common/settings/settings.service';
import { FieldRecordsService } from '../common/field-records.service';
import { requireSpg } from '../common/field-guard';
import { toDate } from '../common/http/paginated';
import { num, statusList } from '../common/sql';

export const periodQuery = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@Injectable()
export class WholesaleService {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService, private readonly settings: SettingsService, private readonly field: FieldRecordsService) {}

  async observe(user: AuthUser, input: z.infer<typeof wholesaleObservationSchema>) {
    const spgId = requireSpg(user);
    const replay = await this.prisma.wholesaleObservation.findUnique({ where: { clientId: input.clientId } });
    if (replay) return replay;
    await this.field.outletFor(user, input.wholesalerOutletId, ['WHOLESALER']);
    await this.field.visitFor(spgId, input.visitId, input.wholesalerOutletId);
    this.field.assertNotFuture(input.observationDate);
    const { clientRecordedAt: _c, lastRestockDate, ...data } = input;
    return this.prisma.wholesaleObservation.create({ data: { ...data, spgId, observationDate: toDate(input.observationDate), lastRestockDate: lastRestockDate ? toDate(lastRestockDate) : null } });
  }

  async report(user: AuthUser, input: z.infer<typeof wholesaleReportSchema>) {
    const spgId = requireSpg(user);
    const v = await this.field.visitFor(spgId, input.visitId);
    if (!v || v.channel !== 'WHOLESALER') throw new BadRequestException({ code: 'NOT_WHOLESALE_VISIT', message: 'Visit is not a wholesaler visit' });
    const { visitId, ...data } = input;
    return this.prisma.wholesaleReport.upsert({ where: { visitId }, create: { visitId, wholesalerOutletId: v.outletId, ...data }, update: data });
  }

  private range(q: z.infer<typeof periodQuery>) {
    const to = q.to ?? jakartaDate();
    const from = q.from ?? new Date(Date.parse(to) - 29 * 86400000).toISOString().slice(0, 10);
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
    const prevTo = new Date(Date.parse(from) - 86400000).toISOString().slice(0, 10);
    const prevFrom = new Date(Date.parse(prevTo) - (days - 1) * 86400000).toISOString().slice(0, 10);
    return { from, to, prevFrom, prevTo };
  }

  /** Wholesale intelligence for one grosir (brief §1F). Uses only final-status ACTUAL data for commercial figures. */
  async intelligence(user: AuthUser, wholesalerId: string, q: z.infer<typeof periodQuery>) {
    const w = await this.prisma.outlet.findFirst({ where: { AND: [{ id: wholesalerId, channel: 'WHOLESALER' }, await this.scope.outletFilter(user)] },
      include: { assignedSpg: { select: { fullName: true } }, district: { select: { name: true } } } });
    if (!w) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Wholesaler not found' });
    const { from, to, prevFrom, prevTo } = this.range(q);
    const final = statusList(await this.settings.get<string[]>('kpi.finalStatuses'));
    const windowDays = await this.settings.get<number>('wholesale.activeRetailerWindowDays');
    const id = wholesalerId;

    const [counts] = num(await this.prisma.$queryRaw<Record<string, number>[]>`
      WITH linked AS (SELECT DISTINCT r.retailer_outlet_id AS rid FROM retailer_wholesale_relationships r JOIN outlets o ON o.id = r.retailer_outlet_id
                      WHERE r.wholesaler_outlet_id = ${id}::uuid AND r.effective_to IS NULL AND o.status <> 'CLOSED'),
      tx AS (SELECT t.* FROM retailer_transactions t WHERE t.wholesaler_outlet_id = ${id}::uuid AND t.validation_status IN (${final}) AND t.data_nature = 'ACTUAL')
      SELECT (SELECT count(*) FROM linked) AS registered_retailers,
             (SELECT count(*) FROM linked l JOIN outlets o ON o.id = l.rid WHERE o.status = 'ACTIVE') AS active_status_retailers,
             (SELECT count(DISTINCT retailer_outlet_id) FROM tx WHERE transaction_date > ${toDate(to)}::date - ${windowDays}::int) AS active_retailers,
             (SELECT count(DISTINCT retailer_outlet_id) FROM tx WHERE transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS transacting_retailers,
             (SELECT count(DISTINCT t.retailer_outlet_id) FROM tx t JOIN retailer_transaction_items i ON i.transaction_id = t.id WHERE i.product_owner = 'COMPANY' AND t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS company_buying_retailers,
             (SELECT count(DISTINCT t.retailer_outlet_id) FROM tx t JOIN retailer_transaction_items i ON i.transaction_id = t.id WHERE i.product_owner = 'COMPETITOR' AND t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS competitor_buying_retailers,
             (SELECT count(*) FROM visits v WHERE v.outlet_id = ${id}::uuid AND v.status = 'COMPLETED' AND v.visit_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS visits`);

    const productMovement = num(await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT i.product_owner AS owner, COALESCE(pv.sku, cp.sku, i.sku_text) AS sku, COALESCE(pv.name, cp.name || COALESCE(' ' || cp.variant, ''), i.product_text, i.brand_text) AS product,
             COALESCE(b.name, cb.name, i.brand_text) AS brand,
             sum(i.quantity) FILTER (WHERE t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS qty,
             sum(i.line_total) FILTER (WHERE t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS value,
             sum(i.quantity) FILTER (WHERE t.transaction_date BETWEEN ${toDate(prevFrom)}::date AND ${toDate(prevTo)}::date) AS prev_qty,
             avg(i.unit_price) FILTER (WHERE t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS avg_price,
             count(DISTINCT t.retailer_outlet_id) FILTER (WHERE t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS buyers
      FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN product_variants pv ON pv.id = i.product_variant_id LEFT JOIN products p ON p.id = pv.product_id LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN competitor_products cp ON cp.id = i.competitor_product_id LEFT JOIN brands cb ON cb.id = cp.brand_id
      WHERE t.wholesaler_outlet_id = ${id}::uuid AND t.validation_status IN (${final}) AND t.data_nature = 'ACTUAL'
        AND t.transaction_date BETWEEN ${toDate(prevFrom)}::date AND ${toDate(to)}::date
      GROUP BY 1,2,3,4 ORDER BY qty DESC NULLS LAST LIMIT 50`);

    const brandShare = num(await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(b.name, cb.name, i.brand_text, 'Unmapped') AS brand, i.product_owner AS owner, sum(i.quantity) AS qty, sum(i.line_total) AS value
      FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id
      LEFT JOIN product_variants pv ON pv.id = i.product_variant_id LEFT JOIN products p ON p.id = pv.product_id LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN competitor_products cp ON cp.id = i.competitor_product_id LEFT JOIN brands cb ON cb.id = cp.brand_id
      WHERE t.wholesaler_outlet_id = ${id}::uuid AND t.validation_status IN (${final}) AND t.data_nature = 'ACTUAL' AND t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date
      GROUP BY 1,2 ORDER BY qty DESC`);

    const stock = num(await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT DISTINCT ON (o.product_variant_id) pv.sku, pv.name, o.observation_date, o.stock_quantity, o.stock_availability, o.buy_price, o.sell_price, o.restock_frequency, o.last_restock_date
      FROM wholesale_observations o JOIN product_variants pv ON pv.id = o.product_variant_id
      WHERE o.wholesaler_outlet_id = ${id}::uuid AND o.observation_date <= ${toDate(to)}::date
      ORDER BY o.product_variant_id, o.observation_date DESC`);

    const retailerPotential = num(await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM (SELECT o.id, o.code, o.name, o.status,
             count(DISTINCT t.id) FILTER (WHERE t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date) AS tx_count,
             COALESCE(sum(i.line_total) FILTER (WHERE i.product_owner = 'COMPANY' AND t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date), 0) AS company_value,
             COALESCE(sum(i.line_total) FILTER (WHERE i.product_owner = 'COMPETITOR' AND t.transaction_date BETWEEN ${toDate(from)}::date AND ${toDate(to)}::date), 0) AS competitor_value,
             COALESCE(sum(i.line_total) FILTER (WHERE i.product_owner = 'COMPANY' AND t.transaction_date BETWEEN ${toDate(prevFrom)}::date AND ${toDate(prevTo)}::date), 0) AS prev_company_value,
             max(t.transaction_date) AS last_transaction_date
      FROM retailer_wholesale_relationships r JOIN outlets o ON o.id = r.retailer_outlet_id
      LEFT JOIN retailer_transactions t ON t.retailer_outlet_id = o.id AND t.wholesaler_outlet_id = ${id}::uuid AND t.validation_status IN (${final}) AND t.data_nature = 'ACTUAL'
      LEFT JOIN retailer_transaction_items i ON i.transaction_id = t.id
      WHERE r.wholesaler_outlet_id = ${id}::uuid AND r.effective_to IS NULL
      GROUP BY o.id) x ORDER BY x.competitor_value + x.company_value DESC, x.name LIMIT 100`);

    return { wholesaler: { id: w.id, code: w.code, name: w.name, district: w.district.name, assignedSpg: w.assignedSpg?.fullName ?? null },
      period: { from, to, previous: { from: prevFrom, to: prevTo } }, counts, productMovement, brandShare, stock, retailerPotential,
      definitions: { activeRetailerWindowDays: windowDays, finalStatuses: await this.settings.get<string[]>('kpi.finalStatuses'), commercialDataNature: 'ACTUAL' } };
  }

  /** Retailer master + relationship history + full transaction history (brief §1C). */
  async retailerHistory(user: AuthUser, retailerId: string) {
    const r = await this.prisma.outlet.findFirst({ where: { AND: [{ id: retailerId, channel: 'RETAILER' }, await this.scope.outletFilter(user)] },
      include: { district: { select: { name: true } }, subdistrict: { select: { name: true } }, category: { select: { name: true } },
        retailerLinks: { orderBy: { effectiveFrom: 'desc' }, include: { wholesaler: { select: { id: true, name: true, code: true } } } } } });
    if (!r) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Retailer not found' });
    const [transactions, monthly, observations, audit] = await Promise.all([
      this.prisma.retailerTransaction.findMany({ where: { retailerOutletId: retailerId }, orderBy: { transactionDate: 'desc' }, take: 200,
        include: { wholesaler: { select: { name: true } }, spg: { select: { fullName: true } }, items: { include: { productVariant: { select: { sku: true } }, competitorProduct: { select: { name: true } } } } } }),
      this.prisma.$queryRaw`SELECT to_char(t.transaction_date, 'YYYY-MM') AS month, i.product_owner AS owner, sum(i.quantity)::float AS qty, sum(i.line_total)::float AS value, count(DISTINCT t.id)::int AS tx
        FROM retailer_transactions t JOIN retailer_transaction_items i ON i.transaction_id = t.id
        WHERE t.retailer_outlet_id = ${retailerId}::uuid AND t.validation_status IN (${statusList(await this.settings.get<string[]>('kpi.finalStatuses'))}) AND t.data_nature = 'ACTUAL'
        GROUP BY 1,2 ORDER BY 1`,
      this.prisma.competitorObservation.findMany({ where: { outletId: retailerId }, orderBy: { observationDate: 'desc' }, take: 50, include: { brand: { select: { name: true } } } }),
      this.prisma.auditLog.findMany({ where: { entityType: 'Outlet', entityId: retailerId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { retailer: r, transactions, monthly, competitorObservations: observations, masterDataHistory: audit };
  }
}
