/**
 * DEMO DATA – development & testing only (Development Rule 7 / 23).
 * Refuses to run when NODE_ENV=production. Every master record is prefixed "DEMO".
 * Deterministic (seeded PRNG) so tests and screenshots are reproducible.
 */
import { PrismaClient, Prisma, SpgCategoryCode, OutletChannel, ValidationStatus } from '../index';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { normalizeOutletName, jakartaDate, shareOfShelf } from '@tanda/shared';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to load demo data in production.');
  process.exit(1);
}

const prisma = new PrismaClient();
let seed = 20261109;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo12345!';

const GEO = [
  { region: ['JATIM', 'Jawa Timur'], areas: [
    { code: 'SBY', name: 'Surabaya Raya', center: [-7.2575, 112.7521], districts: [
      ['SBY-KOTA', 'Kota Surabaya', ['Genteng', 'Tegalsari', 'Wonokromo', 'Rungkut']],
      ['SDA', 'Kab. Sidoarjo', ['Sidoarjo', 'Waru', 'Taman']]] },
    { code: 'MLG', name: 'Malang Raya', center: [-7.9666, 112.6326], districts: [
      ['MLG-KOTA', 'Kota Malang', ['Klojen', 'Lowokwaru', 'Blimbing']],
      ['BATU', 'Kota Batu', ['Batu', 'Junrejo']]] }] },
  { region: ['BALI', 'Bali Nusra'], areas: [
    { code: 'DPS', name: 'Denpasar & Badung', center: [-8.6705, 115.2126], districts: [
      ['DPS-KOTA', 'Kota Denpasar', ['Denpasar Selatan', 'Denpasar Barat', 'Denpasar Timur']],
      ['BADUNG', 'Kab. Badung', ['Kuta', 'Kuta Utara', 'Mengwi']]] }] },
] as const;

async function user(email: string, fullName: string, role: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const r = await prisma.role.findUniqueOrThrow({ where: { code: role } });
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: { email, fullName, passwordHash: await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id }), ...extra, roles: { create: [{ roleId: r.id }] } } as Prisma.UserUncheckedCreateInput });
}

async function main() {
  if (await prisma.spg.findFirst({ where: { employeeCode: { startsWith: 'DEMO' } } })) {
    console.log('Demo data already present – skipping.');
    return;
  }
  const company = await prisma.company.findUniqueOrThrow({ where: { code: 'TT' } });
  const cats = Object.fromEntries((await prisma.spgCategory.findMany()).map((c) => [c.code, c]));
  const ocats = await prisma.outletCategory.findMany();
  const ocat = (ch: OutletChannel) => ocats.filter((c) => c.channel === ch);

  // ── Geography ─────────────────────────────────────────
  const areas: { id: string; code: string; center: readonly [number, number]; regionId: string; districts: { id: string; subs: string[] }[] }[] = [];
  for (const g of GEO) {
    const region = await prisma.region.create({ data: { code: `DEMO-${g.region[0]}`, name: g.region[1], companyId: company.id } });
    for (const a of g.areas) {
      const area = await prisma.area.create({ data: { code: `DEMO-${a.code}`, name: a.name, regionId: region.id } });
      await prisma.territory.create({ data: { code: `DEMO-${a.code}-T1`, name: `${a.name} – Territory 1`, areaId: area.id } });
      const districts = [];
      for (const [dc, dn, subs] of a.districts) {
        const d = await prisma.district.create({ data: { code: `DEMO-${dc}`, name: dn, areaId: area.id } });
        const subIds: string[] = [];
        for (const s of subs) subIds.push((await prisma.subdistrict.create({ data: { code: `DEMO-${dc}-${s.replace(/\s/g, '').toUpperCase().slice(0, 10)}`, name: s, districtId: d.id } })).id);
        districts.push({ id: d.id, subs: subIds });
      }
      areas.push({ id: area.id, code: a.code, center: a.center, regionId: region.id, districts });
    }
  }

  // ── Management users ──────────────────────────────────
  await user('admin@demo.tanda-tambah.local', 'DEMO Admin', 'ADMIN');
  await user('national@demo.tanda-tambah.local', 'DEMO National Manager', 'NATIONAL_MANAGER');
  await user('analyst@demo.tanda-tambah.local', 'DEMO Business Analyst', 'BUSINESS_ANALYST');
  await user('viewer@demo.tanda-tambah.local', 'DEMO Viewer', 'VIEWER');
  await user('rm.jatim@demo.tanda-tambah.local', 'DEMO Regional Manager Jatim', 'REGIONAL_MANAGER', { regionId: areas[0].regionId });
  await user('am.sby@demo.tanda-tambah.local', 'DEMO Area Manager Surabaya', 'AREA_MANAGER', { areaId: areas[0].id, regionId: areas[0].regionId });

  const supervisors: { id: string; areaId: string }[] = [];
  for (const a of areas) {
    for (const n of [1, 2]) {
      const u = await user(`spv${n}.${a.code.toLowerCase()}@demo.tanda-tambah.local`, `DEMO Supervisor ${a.code} ${n}`, 'SUPERVISOR', { areaId: a.id, regionId: a.regionId });
      const s = await prisma.supervisor.create({ data: { userId: u.id, areaId: a.id } });
      supervisors.push({ id: s.id, areaId: a.id });
    }
  }

  // ── Products, brands, competitors ─────────────────────
  const companyBrand = await prisma.brand.create({ data: { code: 'DEMO-TT', name: 'DEMO Tanda Tambah', owner: 'COMPANY' } });
  const products: { id: string; sku: string; unit: string; price: number }[] = [];
  for (const [i, [name, cat, sizes]] of ([
    ['DEMO Kopi Susu', 'Beverage', [['200ML', 'botol', 6500], ['1L', 'botol', 24000]]],
    ['DEMO Teh Melati', 'Beverage', [['350ML', 'botol', 5000], ['CTN24', 'karton', 108000]]],
    ['DEMO Air Mineral', 'Beverage', [['600ML', 'botol', 3500], ['1500ML', 'botol', 6000]]],
    ['DEMO Biskuit Gandum', 'Snack', [['100G', 'pcs', 7500]]],
    ['DEMO Saus Sambal', 'Condiment', [['340ML', 'botol', 14000], ['1KG', 'jerigen', 38000]]],
  ] as const).entries()) {
    const p = await prisma.product.create({ data: { code: `DEMO-P${i + 1}`, name, category: cat, brandId: companyBrand.id } });
    for (const [size, unit, price] of sizes) {
      const v = await prisma.productVariant.create({ data: { productId: p.id, sku: `DEMO-${i + 1}-${size}`, name: `${name} ${size}`, size, unit, listPrice: price } });
      products.push({ id: v.id, sku: v.sku, unit, price });
    }
  }
  const competitorProducts: { id: string; brandId: string; price: number }[] = [];
  for (const [i, cname] of ['DEMO Kompetitor Alpha', 'DEMO Kompetitor Beta', 'DEMO Kompetitor Gamma'].entries()) {
    const c = await prisma.competitor.create({ data: { code: `DEMO-C${i + 1}`, name: cname } });
    const b = await prisma.brand.create({ data: { code: `DEMO-CB${i + 1}`, name: cname.replace('Kompetitor', 'Brand'), owner: 'COMPETITOR', competitorId: c.id } });
    for (const [vi, v] of ['Original', 'Less Sugar'].entries()) {
      const cp = await prisma.competitorProduct.create({ data: { competitorId: c.id, brandId: b.id, name: `${b.name} Drink`, variant: v, sku: `DEMO-C${i + 1}-${vi}`, unit: 'botol' } });
      competitorProducts.push({ id: cp.id, brandId: b.id, price: 5000 + i * 700 + vi * 300 });
    }
  }
  const program = await prisma.horecaProgram.create({ data: { code: 'DEMO-PRG-01', name: 'DEMO Menu Branding Q4', programType: 'BRANDING', startDate: new Date('2026-10-01'), endDate: new Date('2026-12-31'), budget: 50_000_000, status: 'ACTIVE' } });

  // ── SPGs & outlets ────────────────────────────────────
  type SpgRec = { id: string; userId: string; category: SpgCategoryCode; areaId: string; outlets: { id: string; lat: number; lng: number; channel: OutletChannel }[]; retailers: string[] };
  const spgs: SpgRec[] = [];
  let outletSeq = 1;
  const plan: [SpgCategoryCode, string][] = [['GROSIR', 'SPG_GROSIR'], ['HORECA', 'SPG_HORECA'], ['REGULER', 'SPG_REGULER']];
  let spgSeq = 1;
  for (const a of areas) {
    for (const [cat, role] of plan) {
      for (let n = 0; n < (a.code === 'DPS' && cat === 'GROSIR' ? 1 : 2); n++) {
        const code = `DEMO-SPG-${String(spgSeq++).padStart(3, '0')}`;
        const u = await user(`${code.toLowerCase()}@demo.tanda-tambah.local`, `DEMO ${cat} ${a.code} ${n + 1}`, role, { areaId: a.id, regionId: a.regionId });
        const sup = supervisors.filter((s) => s.areaId === a.id)[n % 2];
        const spg = await prisma.spg.create({ data: { employeeCode: code, userId: u.id, fullName: u.fullName, categoryId: cats[cat].id, joinDate: new Date('2025-06-01'), currentAreaId: a.id, currentSupervisorId: sup.id } });
        await prisma.spgAssignment.create({ data: { spgId: spg.id, areaId: a.id, supervisorId: sup.id, effectiveFrom: new Date('2025-06-01'), reason: 'DEMO initial assignment' } });
        await prisma.spgEmploymentHistory.create({ data: { spgId: spg.id, eventType: 'JOINED', toValue: { category: cat, areaId: a.id }, effectiveDate: new Date('2025-06-01') } });
        const rec: SpgRec = { id: spg.id, userId: u.id, category: cat, areaId: a.id, outlets: [], retailers: [] };
        const channel: OutletChannel = cat === 'GROSIR' ? 'WHOLESALER' : cat === 'HORECA' ? 'HORECA' : 'REGULAR';
        const count = cat === 'GROSIR' ? 4 : 8;
        for (let k = 0; k < count; k++) {
          const d = pick(a.districts);
          const lat = a.center[0] + (rnd() - 0.5) * 0.12;
          const lng = a.center[1] + (rnd() - 0.5) * 0.12;
          const prefix = channel === 'WHOLESALER' ? 'Grosir' : channel === 'HORECA' ? pick(['Hotel', 'Resto', 'Cafe', 'Bar']) : pick(['Minimarket', 'Toko', 'Swalayan']);
          const name = `DEMO ${prefix} ${pick(['Sumber', 'Makmur', 'Jaya', 'Sentosa', 'Abadi', 'Rejeki', 'Mulia', 'Lancar'])} ${outletSeq}`;
          const o = await prisma.outlet.create({ data: {
            code: `DEMO-O${String(outletSeq++).padStart(4, '0')}`, name, normalizedName: normalizeOutletName(name), channel,
            categoryId: pick(ocat(channel)).id, address: `Jl. Demo No. ${outletSeq}`, districtId: d.id, subdistrictId: pick(d.subs),
            latitude: lat, longitude: lng, picName: `PIC ${outletSeq}`, potentialClass: pick(['A', 'B', 'C']), assignedSpgId: spg.id,
          } });
          await prisma.outletAssignmentHistory.create({ data: { outletId: o.id, spgId: spg.id, effectiveFrom: new Date('2025-06-01'), reason: 'DEMO' } });
          rec.outlets.push({ id: o.id, lat, lng, channel });
          if (channel === 'WHOLESALER') {
            for (let r = 0; r < 6; r++) {
              const rname = `DEMO ${pick(['Warung', 'Toko', 'Kios'])} ${pick(['Bu', 'Pak', 'Mbak'])} ${pick(['Sri', 'Budi', 'Wati', 'Joko', 'Ani', 'Dedi', 'Rina'])} ${outletSeq}`;
              const ro = await prisma.outlet.create({ data: {
                code: `DEMO-O${String(outletSeq++).padStart(4, '0')}`, name: rname, normalizedName: normalizeOutletName(rname), channel: 'RETAILER',
                categoryId: pick(ocat('RETAILER')).id, districtId: d.id, subdistrictId: pick(d.subs), latitude: lat + (rnd() - 0.5) * 0.02, longitude: lng + (rnd() - 0.5) * 0.02,
              } });
              await prisma.retailerWholesaleRelationship.create({ data: { retailerOutletId: ro.id, wholesalerOutletId: o.id, relationType: 'PRIMARY' } });
              rec.retailers.push(ro.id);
            }
          }
        }
        spgs.push(rec);
      }
    }
  }

  // ── Activity: last 40 days ────────────────────────────
  const today = new Date();
  const finalStatus = (ageDays: number): ValidationStatus => {
    if (ageDays < 3) return pick(['SUBMITTED', 'VALIDATED', 'VALIDATED'] as ValidationStatus[]);
    const r = rnd();
    return r < 0.86 ? 'APPROVED' : r < 0.92 ? 'REJECTED' : r < 0.97 ? 'NEEDS_REVIEW' : 'VALIDATED';
  };
  let txSeq = 1, orderSeq = 1;
  for (const s of spgs) {
    const diligence = 0.55 + rnd() * 0.45; // individual performance variance
    for (let ageDays = 40; ageDays >= 1; ageDays--) {
      const day = new Date(today.getTime() - ageDays * 86400000);
      const dateStr = jakartaDate(day);
      if (new Date(dateStr).getUTCDay() === 0) continue; // Sunday off
      const date = new Date(`${dateStr}T00:00:00Z`);
      // planned visits for the day
      const planned = s.outlets.filter(() => rnd() < 0.5).slice(0, 4);
      const plans = [] as { id: string; outletId: string }[];
      for (const o of planned) plans.push(await prisma.visitPlan.create({ data: { spgId: s.id, outletId: o.id, plannedDate: date, status: 'PLANNED' } }));
      if (rnd() > 0.93 * diligence + 0.05) {
        for (const p of plans) await prisma.visitPlan.update({ where: { id: p.id }, data: { status: 'MISSED' } });
        continue; // absent day
      }
      const checkIn = new Date(`${dateStr}T${String(between(0, 2)).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00Z`); // 07:00–09:59 WIB
      await prisma.attendance.create({ data: { clientId: randomUUID(), spgId: s.id, workDate: date, status: 'CHECKED_OUT', checkInAt: checkIn,
        checkInLat: s.outlets[0].lat, checkInLng: s.outlets[0].lng, checkInAccuracyM: between(5, 40), checkOutAt: new Date(checkIn.getTime() + between(7, 9) * 3600000) } });
      let t = checkIn.getTime() + 30 * 60000;
      const visitTargets = [...plans.map((p) => ({ outletId: p.outletId, planId: p.id as string | null })),
        ...(rnd() < 0.3 ? [{ outletId: pick(s.outlets).id, planId: null }] : [])];
      for (const vt of visitTargets) {
        if (vt.planId && rnd() > 0.6 + diligence * 0.4) { await prisma.visitPlan.update({ where: { id: vt.planId }, data: { status: 'MISSED' } }); continue; }
        const o = s.outlets.find((x) => x.id === vt.outletId)!;
        const dur = between(3, 45);
        const inside = rnd() < 0.9;
        const status = finalStatus(ageDays);
        const visit = await prisma.visit.create({ data: {
          clientId: randomUUID(), spgId: s.id, outletId: o.id, channel: o.channel, visitPlanId: vt.planId, isPlanned: !!vt.planId, visitDate: date,
          status: 'COMPLETED', checkInAt: new Date(t), checkInLat: o.lat + (inside ? 0.0003 : 0.01), checkInLng: o.lng, checkInAccuracyM: between(5, 30),
          checkInDistanceM: inside ? between(5, 60) : between(400, 1500), geofenceStatus: inside ? 'INSIDE' : 'OUTSIDE',
          checkOutAt: new Date(t + dur * 60000), durationMin: dur, purpose: 'Routine visit', outcome: pick(['Order taken', 'Stock checked', 'PIC unavailable', 'Display improved']),
          orderStatus: rnd() < 0.55 ? 'ORDERED' : 'NO_ORDER', validationStatus: status === 'REJECTED' ? 'APPROVED' : 'APPROVED',
        } });
        if (vt.planId) await prisma.visitPlan.update({ where: { id: vt.planId }, data: { status: 'VISITED' } });
        t += (dur + between(15, 50)) * 60000;

        // competitor observation (all channels)
        if (rnd() < 0.55 * diligence + 0.2) {
          const cp = pick(competitorProducts);
          await prisma.competitorObservation.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, channel: o.channel, outletId: o.id,
            brandId: cp.brandId, competitorProductId: cp.id, observationDate: date, purchasePrice: cp.price, sellingPrice: cp.price + 1000,
            stockAvailability: pick(['IN_STOCK', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK']), quantityPurchased: between(0, 48), facing: between(0, 10),
            hasPromotion: rnd() < 0.3, promotionDetail: rnd() < 0.3 ? 'Buy 2 get 1' : null, validationStatus: finalStatus(ageDays) } });
        }

        if (s.category === 'GROSIR') {
          await prisma.wholesaleObservation.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, wholesalerOutletId: o.id, productVariantId: pick(products).id,
            observationDate: date, stockQuantity: between(0, 200), stockAvailability: pick(['IN_STOCK', 'LOW_STOCK']), restockFrequency: pick(['Weekly', 'Bi-weekly']) } });
          const myRetailers = (await prisma.retailerWholesaleRelationship.findMany({ where: { wholesalerOutletId: o.id }, select: { retailerOutletId: true } })).map((r) => r.retailerOutletId);
          for (let k = 0; k < between(1, 3); k++) {
            const items = Array.from({ length: between(1, 3) }, (_, li) => {
              const isCompany = rnd() < 0.65;
              const p = pick(products); const cp = pick(competitorProducts);
              const qty = between(1, 24); const price = isCompany ? p.price : cp.price;
              return { lineNo: li + 1, productOwner: isCompany ? 'COMPANY' : 'COMPETITOR', productVariantId: isCompany ? p.id : null, competitorProductId: isCompany ? null : cp.id,
                quantity: qty, unit: isCompany ? p.unit : 'botol', unitPrice: price, lineTotal: qty * price } as const;
            });
            const st = finalStatus(ageDays);
            await prisma.retailerTransaction.create({ data: {
              transactionNo: `DEMO-TRX-${String(txSeq++).padStart(6, '0')}`, clientId: randomUUID(), retailerOutletId: pick(myRetailers), wholesalerOutletId: o.id,
              spgId: s.id, visitId: visit.id, transactionDate: date, dataNature: rnd() < 0.9 ? 'ACTUAL' : 'ESTIMATE', validationStatus: st,
              totalQuantity: items.reduce((a, i) => a + i.quantity, 0), totalValue: items.reduce((a, i) => a + i.lineTotal, 0),
              approvedAt: st === 'APPROVED' ? new Date(date.getTime() + 2 * 86400000) : null, createdById: s.userId,
              items: { create: items.map((i) => ({ ...i })) },
            } });
          }
        }
        if (s.category === 'HORECA') {
          await prisma.horecaVisit.create({ data: { visitId: visit.id, visitPurpose: pick(['SALES', 'FOLLOW_UP', 'PROGRAM', 'RELATIONSHIP']), picRole: pick(['Purchasing', 'F&B Manager', 'Owner']), result: 'DEMO result' } });
          if (rnd() < 0.5 * diligence + 0.15) {
            const p = pick(products); const qty = between(6, 96);
            await prisma.horecaSale.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id, productVariantId: p.id, saleDate: date,
              quantity: qty, unit: p.unit, unitPrice: p.price, salesValue: qty * p.price, validationStatus: finalStatus(ageDays) } });
          }
          if (rnd() < 0.4) await prisma.posmRecord.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id, channel: 'HORECA', recordDate: date,
            posmType: pick(['MENU_BRANDING', 'TABLE_TENT', 'CHILLER']), status: rnd() < 0.75 * diligence + 0.2 ? 'INSTALLED' : pick(['MISSING', 'DAMAGED']), quantity: between(1, 5), validationStatus: finalStatus(ageDays) } });
          if (rnd() < 0.15) await prisma.horecaProgramImplementation.create({ data: { clientId: randomUUID(), programId: program.id, outletId: o.id, spgId: s.id, visitId: visit.id,
            implementationDate: date, status: rnd() < diligence ? 'EXECUTED' : pick(['PARTIAL', 'NOT_EXECUTED']), actualCost: between(200, 900) * 1000, validationStatus: finalStatus(ageDays) } });
        }
        if (s.category === 'REGULER') {
          for (const p of products.slice(0, 6)) {
            const avail = rnd() < 0.7 * diligence + 0.25;
            await prisma.availabilityRecord.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id, productVariantId: p.id, recordDate: date,
              isAvailable: avail, stockQuantity: avail ? between(1, 48) : 0, oosReason: avail ? null : pick(['Distributor late', 'Sold out', 'Not listed']), validationStatus: finalStatus(ageDays) } });
          }
          const total = between(20, 60); const company = between(2, Math.floor(total * 0.5)); const comp = between(0, total - company);
          await prisma.visibilityRecord.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id, recordDate: date, companyFacing: company,
            competitorFacing: comp, totalCategoryFacing: total, shareOfShelfPct: shareOfShelf(company, total), hasDisplay: rnd() < 0.4, validationStatus: finalStatus(ageDays) } });
          if (rnd() < 0.35) await prisma.posmRecord.create({ data: { clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id, channel: 'REGULAR', recordDate: date,
            posmType: pick(['BANNER', 'POSTER', 'SHELF_TALKER']), status: rnd() < 0.7 * diligence + 0.25 ? 'INSTALLED' : 'MISSING', validationStatus: finalStatus(ageDays) } });
          if (visit.orderStatus === 'ORDERED') {
            const items = Array.from({ length: between(1, 3) }, (_, li) => { const p = pick(products); const q = between(2, 36); return { lineNo: li + 1, productVariantId: p.id, quantity: q, unit: p.unit, unitPrice: p.price, lineTotal: q * p.price }; });
            const st = finalStatus(ageDays);
            await prisma.outletOrder.create({ data: { orderNo: `DEMO-ORD-${String(orderSeq++).padStart(6, '0')}`, clientId: randomUUID(), spgId: s.id, visitId: visit.id, outletId: o.id,
              orderDate: date, status: 'ORDERED', totalQuantity: items.reduce((a, i) => a + i.quantity, 0), totalValue: items.reduce((a, i) => a + i.lineTotal, 0),
              validationStatus: st, approvedAt: st === 'APPROVED' ? new Date() : null, items: { create: items } } });
          }
        }
      }
      // daily report (some missing, some late)
      if (rnd() < 0.8 * diligence + 0.15) {
        const late = rnd() < 0.15;
        const submittedAt = new Date(`${dateStr}T${late ? '16' : '12'}:${String(between(0, 59)).padStart(2, '0')}:00Z`);
        const channel: OutletChannel = s.category === 'GROSIR' ? 'WHOLESALER' : s.category === 'HORECA' ? 'HORECA' : 'REGULAR';
        const content = s.category === 'GROSIR' ? { wholesalersVisited: visitTargets.length, retailersRecorded: between(1, 6) }
          : s.category === 'HORECA' ? { outletsVisited: visitTargets.length, newOutletsApproached: between(0, 1), programsExecuted: between(0, 1) }
          : { outletsVisited: visitTargets.length, ordersTaken: between(0, 3) };
        await prisma.dailyReport.create({ data: { clientId: randomUUID(), spgId: s.id, reportDate: date, channel, summary: 'DEMO daily summary', content,
          status: ageDays > 3 ? 'APPROVED' : 'SUBMITTED', submittedAt, isLate: late, completenessScore: between(70, 100) } });
      }
    }
  }

  // ── DEMO targets (simulation; real targets are set by management) ─────
  const defs = await prisma.kpiDefinition.findMany({ include: { formulas: true } });
  const demoTarget: Record<string, number> = {
    'wholesale.visit_count': 90, 'visits.effective_count': 70, 'wholesale.retailer_coverage_pct': 80, 'wholesale.active_retailers': 18,
    'wholesale.productive_retailers': 15, 'wholesale.company_buying_retailers': 12, 'wholesale.tx_volume': 900, 'wholesale.tx_value': 7_000_000,
    'intel.competitor_coverage_pct': 70, 'data.validation_pass_pct': 95, 'wholesale.validation_rate_pct': 90, 'reports.compliance_pct': 95,
    'visits.plan_compliance_pct': 90, 'outlets.coverage_pct': 90, 'horeca.active_outlet_pct': 60, 'horeca.sales_volume': 600,
    'horeca.sales_value': 5_000_000, 'horeca.repeat_order_outlets': 4, 'horeca.posm_compliance_pct': 85, 'horeca.program_execution_pct': 80,
    'regular.productive_visit_pct': 60, 'regular.availability_pct': 90, 'regular.sku_penetration_pct': 80, 'regular.sales_value': 6_000_000,
    'regular.sales_volume': 700, 'regular.order_conversion_pct': 70, 'regular.share_of_shelf_pct': 30, 'regular.posm_compliance_pct': 85,
  };
  for (const offset of [0, 1]) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - offset, 1));
    for (const def of defs) {
      const key = def.formulas[0]?.metricKey;
      if (key && demoTarget[key] != null) await prisma.target.create({ data: { kpiDefinitionId: def.id, periodMonth: d, value: demoTarget[key], reason: 'DEMO simulation target' } });
    }
  }
  console.log(`Demo data loaded: ${spgs.length} SPGs, ${outletSeq - 1} outlets, ${txSeq - 1} retailer transactions, ${orderSeq - 1} orders. Password for all demo users: ${DEMO_PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
