/**
 * Reference seed – safe for every environment (idempotent upserts).
 * Creates: company, SPG categories, roles/permissions, outlet categories, system settings,
 * simulation KPI definitions (weights only, NO targets), and the initial super admin.
 */
import { PrismaClient, SpgCategoryCode, OutletChannel } from '../index';
import * as argon2 from 'argon2';
import { ROLES, ROLE_PERMISSIONS, ROLE_LABELS, PERMISSIONS, DEFAULT_SETTINGS } from '@tanda/shared';
import { KPI_SEED } from './kpi-seed-config';

const prisma = new PrismaClient();

const OUTLET_CATEGORIES: { code: string; name: string; channel: OutletChannel }[] = [
  { code: 'WS_GROSIR', name: 'Grosir', channel: 'WHOLESALER' },
  { code: 'WS_AGEN', name: 'Agen / Sub-distributor', channel: 'WHOLESALER' },
  { code: 'RT_WARUNG', name: 'Warung', channel: 'RETAILER' },
  { code: 'RT_TOKO', name: 'Toko Kelontong', channel: 'RETAILER' },
  { code: 'RT_KIOS', name: 'Kios', channel: 'RETAILER' },
  { code: 'RT_MINIMARKET', name: 'Minimarket Lokal', channel: 'RETAILER' },
  { code: 'HO_HOTEL', name: 'Hotel', channel: 'HORECA' },
  { code: 'HO_RESTAURANT', name: 'Restaurant', channel: 'HORECA' },
  { code: 'HO_CAFE', name: 'Cafe', channel: 'HORECA' },
  { code: 'HO_BAR', name: 'Bar', channel: 'HORECA' },
  { code: 'HO_OTHER', name: 'Other HORECA', channel: 'HORECA' },
  { code: 'RG_MINIMARKET', name: 'Minimarket', channel: 'REGULAR' },
  { code: 'RG_SUPERMARKET', name: 'Supermarket', channel: 'REGULAR' },
  { code: 'RG_TOKO', name: 'Toko Retail', channel: 'REGULAR' },
  { code: 'RG_OTHER', name: 'Other Retail', channel: 'REGULAR' },
];

async function main() {
  const company = await prisma.company.upsert({ where: { code: 'TT' }, update: {}, create: { code: 'TT', name: 'Tanda Tambah' } });

  for (const c of [
    { code: SpgCategoryCode.GROSIR, name: 'SPG Grosir', description: 'Wholesale & retailer transaction monitoring' },
    { code: SpgCategoryCode.HORECA, name: 'SPG HORECA', description: 'Hotel, restaurant, cafe & bar development' },
    { code: SpgCategoryCode.REGULER, name: 'SPG Reguler', description: 'Retail outlet availability, visibility & sales' },
  ]) await prisma.spgCategory.upsert({ where: { code: c.code }, update: { name: c.name, description: c.description }, create: c });

  for (const code of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { code }, update: {}, create: { code, module: code.split('.')[0] } });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.code, p.id]));
  for (const [code, list] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { code }, update: { name: ROLE_LABELS[code as keyof typeof ROLE_LABELS] },
      create: { code, name: ROLE_LABELS[code as keyof typeof ROLE_LABELS], isSystem: true },
    });
    // sync system-role permissions to the catalogue
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: list.map((p) => ({ roleId: role.id, permissionId: permId.get(p)! })) });
  }

  for (const oc of OUTLET_CATEGORIES) await prisma.outletCategory.upsert({ where: { code: oc.code }, update: { name: oc.name }, create: oc });

  for (const s of DEFAULT_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: s.key }, update: { description: s.description },
      create: { key: s.key, value: s.value as object, description: s.description, isSimulationDefault: true },
    });
  }

  // KPI definitions (simulation). Effective from the first day of the current year.
  const effectiveFrom = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  for (const [cat, kpis] of Object.entries(KPI_SEED)) {
    const category = await prisma.spgCategory.findUniqueOrThrow({ where: { code: cat as SpgCategoryCode } });
    let order = 0;
    for (const k of kpis) {
      const existing = await prisma.kpiDefinition.findUnique({ where: { code: k.code } });
      if (existing) continue; // never overwrite admin-edited KPI config
      const def = await prisma.kpiDefinition.create({
        data: { code: k.code, name: k.name, categoryId: category.id, dimension: k.dimension, unit: k.unit, isActivity: k.isActivity,
          displayOrder: order++, dataSource: k.metricKey, description: 'SIMULATION DEFAULT – confirm before go-live' },
      });
      await prisma.kpiFormula.create({ data: { kpiDefinitionId: def.id, version: 1, metricKey: k.metricKey, params: {}, achievementCapPct: 100, thresholds: { good: 90, watch: 70 }, effectiveFrom } });
      await prisma.kpiWeight.create({ data: { kpiDefinitionId: def.id, weightPct: k.weight, effectiveFrom, reason: 'Simulation weight from project brief' } });
    }
  }

  const email = (process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@tanda-tambah.local').toLowerCase();
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error('SEED_SUPERADMIN_PASSWORD (≥10 chars) must be set');
  const superRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLES.SUPER_ADMIN } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, fullName: 'Super Administrator', passwordHash: await argon2.hash(password, { type: argon2.argon2id }), roles: { create: [{ roleId: superRole.id }] } },
    });
  }
  console.log(`Reference seed complete for company ${company.name}. Super admin: ${email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
