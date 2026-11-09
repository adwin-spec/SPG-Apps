import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Prisma } from '@tanda/database';
import { PERMISSIONS, brandSchema, competitorProductSchema, competitorSchema, paginationQuery, productSchema, productVariantSchema, METRIC_CATALOG, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Paginated, pageArgs } from '../common/http/paginated';

const variantQuery = paginationQuery.extend({ brandId: z.uuid().optional(), productId: z.uuid().optional(), active: z.enum(['true', 'false']).optional() });
const activeSchema = z.object({ isActive: z.boolean(), name: z.string().trim().min(1).max(200).optional(), listPrice: z.number().nonnegative().nullable().optional() });

@ApiTags('Products & Competitors')
@ApiBearerAuth()
@Controller()
export class ProductsController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Small reference lists for forms (cache-friendly, no pagination needed). */
  @Get('lookups') @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  async lookups() {
    const [brands, competitors, outletCategories, spgCategories, competitorProducts, programs] = await Promise.all([
      this.prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.competitor.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.outletCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.spgCategory.findMany(),
      this.prisma.competitorProduct.findMany({ where: { isActive: true }, include: { brand: { select: { name: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.horecaProgram.findMany({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } }),
    ]);
    return { brands, competitors, outletCategories, spgCategories, competitorProducts, programs, metricCatalog: METRIC_CATALOG };
  }

  @Get('product-variants') @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  async variants(@Query(new ZodPipe(variantQuery)) q: z.infer<typeof variantQuery>) {
    const where: Prisma.ProductVariantWhereInput = {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.brandId ? { product: { brandId: q.brandId } } : {}),
      ...(q.active ? { isActive: q.active === 'true' } : {}),
      ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.productVariant.findMany({ where, include: { product: { select: { id: true, name: true, category: true, brand: { select: { id: true, name: true } } } } }, orderBy: { sku: 'asc' }, ...pageArgs(q) }),
      this.prisma.productVariant.count({ where }),
    ]);
    return new Paginated(items, total, q.page, q.pageSize);
  }

  @Get('products') @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  products() { return this.prisma.product.findMany({ include: { brand: { select: { name: true } }, variants: { orderBy: { sku: 'asc' } } }, orderBy: { name: 'asc' } }); }

  @Post('products') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(productSchema)
  async createProduct(@Body(new ZodPipe(productSchema)) b: z.infer<typeof productSchema>, @CurrentUser() u: AuthUser) {
    const brand = await this.prisma.brand.findUniqueOrThrow({ where: { id: b.brandId } });
    if (brand.owner !== 'COMPANY') throw new BadRequestException({ code: 'NOT_COMPANY_BRAND', message: 'Company products must use a company brand; use competitor products for competitors' });
    const p = await this.prisma.product.create({ data: b });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'Product', entityId: p.id, after: p });
    return p;
  }

  @Post('product-variants') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(productVariantSchema)
  async createVariant(@Body(new ZodPipe(productVariantSchema)) b: z.infer<typeof productVariantSchema>, @CurrentUser() u: AuthUser) {
    const v = await this.prisma.productVariant.create({ data: b });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'ProductVariant', entityId: v.id, after: v });
    return v;
  }

  @Patch('product-variants/:id') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(activeSchema)
  async updateVariant(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(activeSchema)) b: z.infer<typeof activeSchema>, @CurrentUser() u: AuthUser) {
    const before = await this.prisma.productVariant.findUniqueOrThrow({ where: { id } });
    const v = await this.prisma.productVariant.update({ where: { id }, data: b });
    await this.audit.log({ actorId: u.id, action: 'UPDATE', entityType: 'ProductVariant', entityId: id, before, after: v });
    return v;
  }

  @Post('brands') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(brandSchema)
  async createBrand(@Body(new ZodPipe(brandSchema)) b: z.infer<typeof brandSchema>, @CurrentUser() u: AuthUser) {
    const r = await this.prisma.brand.create({ data: b });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'Brand', entityId: r.id, after: r });
    return r;
  }

  @Get('competitors') @RequirePermissions(PERMISSIONS.PRODUCT_READ)
  competitors() { return this.prisma.competitor.findMany({ include: { brands: true, products: { include: { brand: { select: { name: true } } } } }, orderBy: { name: 'asc' } }); }

  @Post('competitors') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(competitorSchema)
  async createCompetitor(@Body(new ZodPipe(competitorSchema)) b: z.infer<typeof competitorSchema>, @CurrentUser() u: AuthUser) {
    const r = await this.prisma.competitor.create({ data: b });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'Competitor', entityId: r.id, after: r });
    return r;
  }

  @Post('competitor-products') @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE) @ApiZodBody(competitorProductSchema)
  async createCompetitorProduct(@Body(new ZodPipe(competitorProductSchema)) b: z.infer<typeof competitorProductSchema>, @CurrentUser() u: AuthUser) {
    const r = await this.prisma.competitorProduct.create({ data: b });
    await this.audit.log({ actorId: u.id, action: 'CREATE', entityType: 'CompetitorProduct', entityId: r.id, after: r });
    return r;
  }
}
