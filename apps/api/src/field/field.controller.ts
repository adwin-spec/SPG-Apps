import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, jakartaDate, type AuthUser } from '@tanda/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';
import { ScopeService } from '../common/scope/scope.service';
import { CHANNELS_BY_CATEGORY, requireSpg } from '../common/field-guard';
import { toDate } from '../common/http/paginated';

/** Everything the SPG PWA caches in IndexedDB to work offline for a day. */
@ApiTags('Field (SPG mobile)')
@ApiBearerAuth()
@Controller('field')
export class FieldController {
  constructor(private readonly prisma: PrismaService, private readonly scope: ScopeService) {}

  @Get('bootstrap') @RequirePermissions(PERMISSIONS.VISIT_SELF)
  async bootstrap(@CurrentUser() user: AuthUser) {
    const spgId = requireSpg(user);
    const channels = CHANNELS_BY_CATEGORY[user.spgCategory ?? ''] ?? [];
    const today = jakartaDate();
    const areaFilter = await this.scope.outletFilter(user);
    const outletSelect = { id: true, code: true, name: true, channel: true, address: true, latitude: true, longitude: true, status: true, picName: true, phone: true, assignedSpgId: true,
      district: { select: { name: true } }, subdistrict: { select: { name: true } } } as const;
    const [spg, assigned, retailers, variants, competitorProducts, brands, programs, plans, attendance, openVisit] = await Promise.all([
      this.prisma.spg.findUniqueOrThrow({ where: { id: spgId }, include: { category: true, currentArea: { select: { id: true, name: true } } } }),
      this.prisma.outlet.findMany({ where: { assignedSpgId: spgId, status: { not: 'CLOSED' }, channel: { in: channels } }, select: outletSelect, orderBy: { name: 'asc' } }),
      user.spgCategory === 'GROSIR'
        ? this.prisma.outlet.findMany({ where: { AND: [areaFilter, { channel: 'RETAILER', status: { not: 'CLOSED' } }] }, select: { ...outletSelect,
            retailerLinks: { where: { effectiveTo: null }, select: { wholesalerOutletId: true, relationType: true } } }, orderBy: { name: 'asc' }, take: 5000 })
        : Promise.resolve([]),
      this.prisma.productVariant.findMany({ where: { isActive: true }, select: { id: true, sku: true, name: true, unit: true, listPrice: true, product: { select: { name: true, brand: { select: { name: true } } } } }, orderBy: { sku: 'asc' } }),
      this.prisma.competitorProduct.findMany({ where: { isActive: true }, select: { id: true, name: true, variant: true, sku: true, unit: true, brandId: true, brand: { select: { name: true } } } }),
      this.prisma.brand.findMany({ where: { isActive: true, owner: 'COMPETITOR' }, select: { id: true, name: true } }),
      user.spgCategory === 'HORECA' ? this.prisma.horecaProgram.findMany({ where: { status: 'ACTIVE' }, select: { id: true, code: true, name: true, programType: true } }) : Promise.resolve([]),
      this.prisma.visitPlan.findMany({ where: { spgId, plannedDate: toDate(today) }, select: { id: true, outletId: true, status: true } }),
      this.prisma.attendance.findUnique({ where: { spgId_workDate: { spgId, workDate: toDate(today) } } }),
      this.prisma.visit.findFirst({ where: { spgId, status: 'IN_PROGRESS' }, include: { outlet: { select: { id: true, name: true, channel: true } } } }),
    ]);
    return { serverTime: new Date().toISOString(), businessDate: today, spg: { id: spg.id, fullName: spg.fullName, employeeCode: spg.employeeCode, category: spg.category.code, area: spg.currentArea },
      outlets: assigned, retailers, variants, competitorProducts, competitorBrands: brands, programs, plans, attendance, openVisit };
  }
}
