import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { jakartaDate } from '@tanda/shared';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/common/prisma/prisma.service';

/**
 * End-to-end API tests for the 12 mandatory scenarios (brief §Q) plus security regressions.
 * Runs against an isolated, freshly seeded test database (see global-setup.ts).
 */
const PW = 'Demo12345!';
const today = jakartaDate();
let app: INestApplication; let prisma: PrismaService; let http: ReturnType<typeof request>;
const tokens: Record<string, string> = {};

async function login(email: string) {
  if (tokens[email]) return tokens[email];
  const r = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: PW }).expect(200);
  return (tokens[email] = r.body.data.accessToken);
}
const as = (t: string) => ({ Authorization: `Bearer ${t}` });
const E = { admin: 'admin@demo.tanda-tambah.local', national: 'national@demo.tanda-tambah.local', viewer: 'viewer@demo.tanda-tambah.local',
  spv: 'spv1.sby@demo.tanda-tambah.local', spvMlg: 'spv1.mlg@demo.tanda-tambah.local', grosir1: 'demo-spg-001@demo.tanda-tambah.local', grosir2: 'demo-spg-002@demo.tanda-tambah.local',
  horeca: 'demo-spg-003@demo.tanda-tambah.local', reguler: 'demo-spg-005@demo.tanda-tambah.local' };

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication());
  await app.init();
  prisma = app.get(PrismaService);
  http = request(app.getHttpServer());
});
afterAll(async () => { await app?.close(); });

async function grosirContext(email = E.grosir1) {
  const t = await login(email);
  const boot = (await request(app.getHttpServer()).get('/api/v1/field/bootstrap').set(as(t)).expect(200)).body.data;
  const ws = boot.outlets[0];
  const retailer = boot.retailers.find((r: { retailerLinks: { wholesalerOutletId: string }[] }) => r.retailerLinks.some((l) => l.wholesalerOutletId === ws.id));
  return { t, boot, ws, retailer, variant: boot.variants[0], cp: boot.competitorProducts[0] };
}
const txBody = (c: Awaited<ReturnType<typeof grosirContext>>, qty = 5) => ({
  clientId: randomUUID(), retailerOutletId: c.retailer.id, wholesalerOutletId: c.ws.id, transactionDate: today,
  items: [{ productOwner: 'COMPANY', productVariantId: c.variant.id, quantity: qty, unit: c.variant.unit, unitPrice: Number(c.variant.listPrice) }],
});

describe('Authentication & authorisation', () => {
  it('rejects unauthenticated requests and accepts valid logins', async () => {
    await http.get('/api/v1/spgs').expect(401);
    await http.post('/api/v1/auth/login').send({ email: E.admin, password: 'wrong' }).expect(401);
    expect(await login(E.admin)).toBeTruthy();
  });

  it('(12) denies endpoints outside the user permissions', async () => {
    const spg = await login(E.grosir1); const viewer = await login(E.viewer);
    await http.get('/api/v1/users').set(as(spg)).expect(403);
    await http.get('/api/v1/audit-logs').set(as(spg)).expect(403);
    await http.post('/api/v1/outlets').set(as(viewer)).send({}).expect(403);
    await http.put('/api/v1/kpi/targets').set(as(viewer)).send({ items: [] }).expect(403);
    await http.post('/api/v1/performance/recalculate').set(as(await login(E.spv))).send({ period: today.slice(0, 7) }).expect(403);
  });

  it('(12) prevents an SPG from using another category workflow', async () => {
    const spg = await login(E.grosir1);
    const r = await http.post('/api/v1/regular/orders').set(as(spg)).send({ clientId: randomUUID(), outletId: randomUUID(), orderDate: today, items: [{ productVariantId: randomUUID(), quantity: 1, unit: 'pcs', unitPrice: 1 }] });
    expect(r.status).toBe(403);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/api/v1/auth/login').send({ email: E.viewer, password: PW }).expect(200);
    const first = await agent.post('/api/v1/auth/refresh').expect(200);
    const oldCookie = (first.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tt_rt='))!;
    await agent.post('/api/v1/auth/refresh').expect(200); // rotates again; `oldCookie` value is now revoked
    // replaying a revoked token ⇒ 401 and the whole family is revoked
    const replay = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', oldCookie.split(';')[0]);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('REFRESH_REUSED');
    await agent.post('/api/v1/auth/refresh').expect(401);
  });

  it('(11) a deactivated user cannot log in and existing tokens stop working', async () => {
    const admin = await login(E.admin);
    const created = (await http.post('/api/v1/users').set(as(admin)).send({ email: `tmp-${Date.now()}@test.local`, fullName: 'Temp User', password: 'Temporary123', roleCodes: ['VIEWER'] }).expect(201)).body.data;
    const tok = (await http.post('/api/v1/auth/login').send({ email: created.email, password: 'Temporary123' }).expect(200)).body.data.accessToken;
    await http.get('/api/v1/auth/me').set(as(tok)).expect(200);
    await http.patch(`/api/v1/users/${created.id}`).set(as(admin)).send({ isActive: false }).expect(200);
    const again = await http.post('/api/v1/auth/login').send({ email: created.email, password: 'Temporary123' });
    expect(again.status).toBe(401); expect(again.body.error.code).toBe('USER_INACTIVE');
    await http.get('/api/v1/auth/me').set(as(tok)).expect(401);
  });
});

describe('Row-level data scope', () => {
  it('(1) an SPG cannot see another SPG’s data', async () => {
    const own = await grosirContext(E.grosir1);
    const other = await prisma.spg.findFirstOrThrow({ where: { employeeCode: 'DEMO-SPG-002' } });
    const otherTx = await prisma.retailerTransaction.findFirstOrThrow({ where: { spgId: other.id } });
    await http.get(`/api/v1/retailer-transactions/${otherTx.id}`).set(as(own.t)).expect(404);
    const list = (await http.get('/api/v1/retailer-transactions?pageSize=200').set(as(own.t)).expect(200)).body.data;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((x: { spgId: string }) => x.spgId === own.boot.spg.id)).toBe(true);
    const visits = (await http.get(`/api/v1/visits?spgId=${other.id}`).set(as(own.t)).expect(200)).body.data;
    expect(visits.every((v: { spgId: string }) => v.spgId === own.boot.spg.id)).toBe(true);
    await http.get(`/api/v1/performance/spgs/${other.id}`).set(as(own.t)).expect(403);
  });

  it('(2) a supervisor only sees SPGs under them', async () => {
    const spv = await login(E.spv);
    const sup = await prisma.supervisor.findFirstOrThrow({ where: { user: { email: E.spv } } });
    const expected = await prisma.spg.count({ where: { currentSupervisorId: sup.id } });
    const r = (await http.get('/api/v1/spgs?pageSize=200').set(as(spv)).expect(200)).body;
    expect(r.meta.total).toBe(expected);
    const outsider = await prisma.spg.findFirstOrThrow({ where: { OR: [{ currentSupervisorId: { not: sup.id } }, { currentSupervisorId: null }] } });
    await http.get(`/api/v1/spgs/${outsider.id}`).set(as(spv)).expect(403);
    const exec = (await http.get('/api/v1/analytics/executive').set(as(spv)).expect(200)).body.data;
    expect(exec.cards.activeSpg).toBeLessThanOrEqual(expected);
    const outsiderTx = await prisma.retailerTransaction.findFirst({ where: { spg: { currentSupervisorId: { not: sup.id } }, validationStatus: 'VALIDATED' } });
    if (outsiderTx) await http.post(`/api/v1/retailer-transactions/${outsiderTx.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(404);
  });
});

describe('Transactions integrity', () => {
  it('(3) an approved transaction cannot be modified directly; corrections preserve the original', async () => {
    const c = await grosirContext(); const spv = await login(E.spv);
    const tx = (await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(txBody(c, 7)).expect(201)).body.data;
    await http.post(`/api/v1/retailer-transactions/${tx.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(200);
    // no update endpoint exists, and the database itself refuses value changes / deletes
    await expect(prisma.retailerTransaction.update({ where: { id: tx.id }, data: { totalValue: 1 } })).rejects.toThrow(/cannot be modified/);
    await expect(prisma.retailerTransaction.delete({ where: { id: tx.id } })).rejects.toThrow(/append-only|not permitted/);
    // a second decision is refused
    await http.post(`/api/v1/retailer-transactions/${tx.id}/decision`).set(as(spv)).send({ decision: 'REJECTED' }).expect(409);
    const corr = (await http.post(`/api/v1/retailer-transactions/${tx.id}/corrections`).set(as(c.t)).send({ clientId: randomUUID(), reason: 'Qty typo', items: txBody(c, 6).items }).expect(201)).body.data;
    expect(corr.correctionOfId).toBe(tx.id); expect(corr.duplicateType).toBe('CORRECTED_SUBMISSION');
    await http.post(`/api/v1/retailer-transactions/${corr.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(200);
    const orig = await prisma.retailerTransaction.findUniqueOrThrow({ where: { id: tx.id }, include: { items: true } });
    expect(orig.validationStatus).toBe('SUPERSEDED');
    expect(Number(orig.items[0].quantity)).toBe(7); // raw value untouched
  });

  it('enforces maker–checker: an SPG cannot approve and a reversal needs a second person', async () => {
    const c = await grosirContext(); const spv = await login(E.spv); const admin = await login(E.admin);
    const tx = (await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(txBody(c, 3)).expect(201)).body.data;
    await http.post(`/api/v1/retailer-transactions/${tx.id}/decision`).set(as(c.t)).send({ decision: 'APPROVED' }).expect(403);
    await http.post(`/api/v1/retailer-transactions/${tx.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(200);
    const req = (await http.post(`/api/v1/retailer-transactions/${tx.id}/reversal-requests`).set(as(spv)).send({ reason: 'Retailer returned goods' }).expect(201)).body.data;
    await http.post(`/api/v1/approvals/${req.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(403);
    await http.post(`/api/v1/approvals/${req.id}/decision`).set(as(admin)).send({ decision: 'APPROVED' }).expect(200);
    expect((await prisma.retailerTransaction.findUniqueOrThrow({ where: { id: tx.id } })).validationStatus).toBe('REVERSED');
  });

  it('(4) detects duplicate transactions without deleting them', async () => {
    const c = await grosirContext(E.grosir2);
    const body = txBody(c, 11);
    const a = (await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(body).expect(201)).body.data;
    const b = (await http.post('/api/v1/retailer-transactions').set(as(c.t)).send({ ...body, clientId: randomUUID() }).expect(201)).body.data;
    expect(a.duplicateType).toBe('NONE');
    expect(b.duplicateType).toBe('EXACT_DUPLICATE'); expect(b.duplicateOfId).toBe(a.id); expect(b.validationStatus).toBe('NEEDS_REVIEW');
    expect(await prisma.retailerTransaction.count({ where: { id: { in: [a.id, b.id] } } })).toBe(2);
  });

  it('rejects invalid input (negative quantity, future date, wrong product owner)', async () => {
    const c = await grosirContext();
    await http.post('/api/v1/retailer-transactions').set(as(c.t)).send({ ...txBody(c), items: [{ ...txBody(c).items[0], quantity: -2 }] }).expect(400);
    await http.post('/api/v1/retailer-transactions').set(as(c.t)).send({ ...txBody(c), transactionDate: '2099-01-01' }).expect(400);
    await http.post('/api/v1/retailer-transactions').set(as(c.t)).send({ ...txBody(c), items: [{ productOwner: 'COMPETITOR', productVariantId: c.variant.id, quantity: 1, unit: 'x' }] }).expect(400);
  });
});

describe('Offline synchronisation', () => {
  it('(6) replaying the same offline record never creates a duplicate', async () => {
    const c = await grosirContext();
    const body = txBody(c, 2); const key = randomUUID();
    const r1 = await http.post('/api/v1/retailer-transactions').set(as(c.t)).set('Idempotency-Key', key).send(body).expect(201);
    const r2 = await http.post('/api/v1/retailer-transactions').set(as(c.t)).set('Idempotency-Key', key).send(body).expect(201);
    expect(r2.headers['idempotent-replay']).toBe('true');
    expect(r2.body.data.id).toBe(r1.body.data.id);
    // same client_id without the header (e.g. app reinstalled) is still de-duplicated
    const r3 = await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(body).expect(201);
    expect(r3.body.data.id).toBe(r1.body.data.id);
    expect(await prisma.retailerTransaction.count({ where: { clientId: body.clientId } })).toBe(1);
    // reusing a key for a different payload is refused
    await http.post('/api/v1/retailer-transactions').set(as(c.t)).set('Idempotency-Key', key).send({ ...body, clientId: randomUUID() }).expect(409);
  });

  it('records an offline visit with geofence evaluation and idempotent check-in', async () => {
    const t = await login(E.horeca);
    const boot = (await http.get('/api/v1/field/bootstrap').set(as(t)).expect(200)).body.data;
    const o = boot.outlets[0];
    const att = { clientId: randomUUID(), gps: { lat: Number(o.latitude), lng: Number(o.longitude), accuracyM: 10 } };
    await http.post('/api/v1/attendance/check-in').set(as(t)).send(att).expect(201);
    await http.post('/api/v1/attendance/check-in').set(as(t)).send(att).expect(201); // replay
    await http.post('/api/v1/attendance/check-in').set(as(t)).send({ ...att, clientId: randomUUID() }).expect(409); // genuine conflict
    const visit = { clientId: randomUUID(), outletId: o.id, gps: { lat: Number(o.latitude) + 0.02, lng: Number(o.longitude), accuracyM: 10 }, clientRecordedAt: new Date(Date.now() - 3600_000).toISOString() };
    const v = (await http.post('/api/v1/visits/check-in').set(as(t)).send(visit).expect(201)).body.data;
    expect(v.geofenceStatus).toBe('OUTSIDE'); expect(v.validationStatus).toBe('NEEDS_REVIEW'); expect(v.source).toBe('OFFLINE_SYNC');
    const again = (await http.post('/api/v1/visits/check-in').set(as(t)).send(visit).expect(201)).body.data;
    expect(again.id).toBe(v.id);
    await http.post(`/api/v1/visits/${v.id}/check-out`).set(as(t)).send({ outcome: 'ok' }).expect(200);
  });
});

describe('OCR pipeline', () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

  it('(5) OCR output is never a final transaction until a second person approves', async () => {
    const c = await grosirContext(); const spv = await login(E.spv); const admin = await login(E.admin);
    const up = (await http.post('/api/v1/ocr/uploads').set(as(spv)).attach('file', png, 'form.png').field('formId', `F-${Date.now()}`).field('spgId', c.boot.spg.id).field('wholesalerOutletId', c.ws.id).expect(201)).body.data;
    const fl = (await http.get(`/api/v1/ocr/file-logs/${up.fileLogId}`).set(as(spv)).expect(200)).body.data;
    expect(fl.status).toBe('NEEDS_REVIEW'); expect(fl.ocrRaw).toHaveLength(1);
    expect(await prisma.retailerTransaction.count({ where: { fileLogId: up.fileLogId } })).toBe(0);
    // OCR raw output is immutable
    await expect(prisma.ocrRaw.update({ where: { id: fl.ocrRaw[0].id }, data: { rawText: 'x' } })).rejects.toThrow(/append-only/);
    const final = { retailerOutletId: c.retailer.id, wholesalerOutletId: c.ws.id, spgId: c.boot.spg.id, transactionDate: today, items: txBody(c, 4).items };
    const review = (await http.post(`/api/v1/ocr/file-logs/${up.fileLogId}/reviews`).set(as(spv)).send({ final, corrections: [{ path: 'items[0].quantity', originalValue: null, correctedValue: 4 }] }).expect(201)).body.data;
    expect(await prisma.retailerTransaction.count({ where: { fileLogId: up.fileLogId } })).toBe(0);
    await http.post(`/api/v1/ocr/reviews/${review.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(403);
    const ok = (await http.post(`/api/v1/ocr/reviews/${review.id}/decision`).set(as(admin)).send({ decision: 'APPROVED' }).expect(200)).body.data;
    const tx = await prisma.retailerTransaction.findUniqueOrThrow({ where: { id: ok.transactionId } });
    expect(tx.source).toBe('OCR'); expect(tx.validationStatus).toBe('APPROVED'); expect(tx.fileLogId).toBe(up.fileLogId);
    // the same image uploaded again is flagged as an exact duplicate (and cannot be approved)
    const dup = (await http.post('/api/v1/ocr/uploads').set(as(spv)).attach('file', png, 'again.png').expect(201)).body.data;
    expect(dup.duplicate.type).toBe('EXACT_DUPLICATE');
  });

  it('rejects files whose content does not match an allowed type', async () => {
    const spv = await login(E.spv);
    await http.post('/api/v1/ocr/uploads').set(as(spv)).attach('file', Buffer.from('<script>alert(1)</script>'), 'evil.png').expect(400);
  });
});

describe('KPI engine', () => {
  it('(7) computes KPIs per category, never scores missing data or undefined targets as zero', async () => {
    const admin = await login(E.admin); const period = today.slice(0, 7);
    const r = (await http.post('/api/v1/performance/recalculate').set(as(admin)).send({ period }).expect(200)).body.data;
    expect(r.categories.map((c: { category: string }) => c.category).sort()).toEqual(['GROSIR', 'HORECA', 'REGULER']);
    const grosir = await prisma.spg.findFirstOrThrow({ where: { employeeCode: 'DEMO-SPG-001' } });
    const results = await prisma.performanceResult.findMany({ where: { spgId: grosir.id, periodMonth: new Date(`${period}-01`) }, include: { kpiDefinition: { include: { category: true } } } });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((x) => x.kpiDefinition.category.code === 'GROSIR')).toBe(true);
    // remove one target → NO_TARGET (not 0); set an explicit zero → ZERO_TARGET
    const kpi = results[0].kpiDefinitionId;
    await http.put('/api/v1/kpi/targets').set(as(admin)).send({ items: [{ kpiDefinitionId: kpi, period, value: null, reason: 'test undefined' }] }).expect(200);
    await http.post('/api/v1/performance/recalculate').set(as(admin)).send({ period, category: 'GROSIR' }).expect(200);
    const after = await prisma.performanceResult.findFirstOrThrow({ where: { spgId: grosir.id, kpiDefinitionId: kpi, periodMonth: new Date(`${period}-01`) } });
    expect(after.dataStatus).toBe('NO_TARGET'); expect(after.weightedScore).toBeNull();
    await http.put('/api/v1/kpi/targets').set(as(admin)).send({ items: [{ kpiDefinitionId: kpi, period, value: 0, reason: 'test zero' }] }).expect(200);
    await http.post('/api/v1/performance/recalculate').set(as(admin)).send({ period, category: 'GROSIR' }).expect(200);
    expect((await prisma.performanceResult.findFirstOrThrow({ where: { spgId: grosir.id, kpiDefinitionId: kpi, periodMonth: new Date(`${period}-01`) } })).dataStatus).toBe('ZERO_TARGET');
    // history kept: both target rows exist, only the latest is current
    expect(await prisma.target.count({ where: { kpiDefinitionId: kpi, periodMonth: new Date(`${period}-01`) } })).toBeGreaterThanOrEqual(2);
    // an SPG with no activity has NO_DATA, not zero, for ratio KPIs
    const idle = await prisma.spg.create({ data: { employeeCode: `IDLE-${Date.now()}`, fullName: 'Idle SPG', categoryId: grosir.categoryId, joinDate: new Date(`${period}-01`), currentAreaId: grosir.currentAreaId } });
    await http.post('/api/v1/performance/recalculate').set(as(admin)).send({ period, spgId: idle.id, category: 'GROSIR' }).expect(200);
    const idleRes = await prisma.performanceResult.findMany({ where: { spgId: idle.id } });
    expect(idleRes.every((x) => x.dataStatus !== 'OK' || x.actualValue == null || Number(x.actualValue) >= 0)).toBe(true);
    expect(idleRes.some((x) => x.dataStatus === 'NO_DATA')).toBe(true);
    expect((await prisma.performanceSnapshot.findFirst({ where: { spgId: idle.id } }))?.totalScore ?? null).toBeNull();
  });

  it('only counts approved data in final KPIs', async () => {
    const c = await grosirContext(E.grosir2); const admin = await login(E.admin); const period = today.slice(0, 7);
    const before = await prisma.performanceResult.findFirst({ where: { spgId: c.boot.spg.id, periodMonth: new Date(`${period}-01`), kpiDefinition: { code: 'GR_TX_VALUE' } } });
    await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(txBody(c, 50)).expect(201); // stays VALIDATED
    await http.post('/api/v1/performance/recalculate').set(as(admin)).send({ period, spgId: c.boot.spg.id, category: 'GROSIR' }).expect(200);
    const after = await prisma.performanceResult.findFirst({ where: { spgId: c.boot.spg.id, periodMonth: new Date(`${period}-01`), kpiDefinition: { code: 'GR_TX_VALUE' } } });
    expect(Number(after?.actualValue ?? 0)).toBe(Number(before?.actualValue ?? 0));
  });
});

describe('Dashboards & exports', () => {
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  it('(8) dashboard filters are consistent across views', async () => {
    const t = await login(E.national);
    const all = (await http.get(`/api/v1/analytics/executive?from=${from}`).set(as(t)).expect(200)).body.data;
    const grosir = (await http.get(`/api/v1/analytics/executive?from=${from}&category=GROSIR`).set(as(t)).expect(200)).body.data;
    const byCat = all.cards.salesByCategory.find((x: { category: string }) => x.category === 'GROSIR');
    expect(grosir.cards.salesValue).toBeCloseTo(Number(byCat.value), 2);
    const regions = (await http.get(`/api/v1/analytics/drilldown?level=region&from=${from}`).set(as(t)).expect(200)).body.data.rows;
    const sum = regions.reduce((a: number, r: { sales_value: number }) => a + Number(r.sales_value), 0);
    expect(sum).toBeCloseTo(all.cards.salesValue, 2);
    const visits = regions.reduce((a: number, r: { visits: number }) => a + Number(r.visits), 0);
    expect(visits).toBe(all.cards.visits);
  });

  it('(9) exports follow the active filter exactly', async () => {
    const t = await login(E.national);
    const preview = (await http.get(`/api/v1/reports/retailer-transactions?from=${from}&category=GROSIR&areaId=`).set(as(t)).expect(200)).body.data;
    const csv = await http.get(`/api/v1/reports/retailer-transactions/export?format=csv&from=${from}&category=GROSIR`).set(as(t)).expect(200);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\n');
    expect(lines[1]).toContain('"from":"' + from + '"');
    expect(lines.length - 3).toBe(preview.total);
    const horeca = await http.get(`/api/v1/reports/horeca-performance/export?format=csv&from=${from}&category=GROSIR`).set(as(t)).expect(200);
    expect(horeca.text.trim().split('\n').length).toBe(3); // GROSIR filter ⇒ no HORECA outlets in scope
    const xlsx = await http.get(`/api/v1/reports/spg-ranking/export?format=xlsx&from=${from}`).set(as(t)).buffer(true).expect(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect(await prisma.auditLog.count({ where: { action: 'EXPORT' } })).toBeGreaterThanOrEqual(3);
  });

  it('scopes exports to the user (supervisor cannot export other teams)', async () => {
    const spv = await login(E.spv);
    const sup = await prisma.supervisor.findFirstOrThrow({ where: { user: { email: E.spv } } });
    const own = await prisma.spg.findMany({ where: { currentSupervisorId: sup.id }, select: { fullName: true } });
    const csv = await http.get(`/api/v1/reports/visit-productivity/export?format=csv&from=${from}`).set(as(spv)).expect(200);
    const rows = csv.text.trim().split('\n').slice(3);
    expect(rows.length).toBe(own.length);
  });
});

describe('Audit trail', () => {
  it('(10) records every change with before/after and cannot be altered', async () => {
    const admin = await login(E.admin);
    const o = (await http.get('/api/v1/outlets?channel=HORECA&pageSize=1').set(as(admin)).expect(200)).body.data[0];
    await http.patch(`/api/v1/outlets/${o.id}`).set(as(admin)).send({ expectedVersion: o.version, picName: 'New PIC', reason: 'PIC changed' }).expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'Outlet', entityId: o.id, action: 'UPDATE' }, orderBy: { createdAt: 'desc' } });
    expect((log.after as Record<string, unknown>).picName).toBe('New PIC');
    expect(log.reason).toBe('PIC changed');
    // optimistic concurrency: a stale version is refused, never silently overwritten
    const stale = await http.patch(`/api/v1/outlets/${o.id}`).set(as(admin)).send({ expectedVersion: o.version, picName: 'Other', reason: 'x' });
    expect(stale.status).toBe(409); expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.update({ where: { id: log.id }, data: { reason: 'tampered' } })).rejects.toThrow(/append-only/);
  });

  it('flags likely duplicate outlets before creating them', async () => {
    const admin = await login(E.admin);
    const o = await prisma.outlet.findFirstOrThrow({ where: { channel: 'RETAILER' } });
    const r = await http.post('/api/v1/outlets').set(as(admin)).send({ name: `TOKO ${o.name.replace('DEMO ', '')}.`, channel: 'RETAILER', districtId: o.districtId });
    expect(r.status).toBe(409); expect(r.body.error.code).toBe('POSSIBLE_DUPLICATE');
    await http.post('/api/v1/outlets').set(as(admin)).send({ name: `TOKO ${o.name.replace('DEMO ', '')}.`, channel: 'RETAILER', districtId: o.districtId, confirmNotDuplicate: true }).expect(201);
  });
});


describe('Approvals scope', () => {
  it('a supervisor of another area cannot see or decide approvals of SPGs outside their scope', async () => {
    const c = await grosirContext(); const spv = await login(E.spv); const other = await login(E.spvMlg);
    const tx = (await http.post('/api/v1/retailer-transactions').set(as(c.t)).send(txBody(c, 9)).expect(201)).body.data;
    await http.post(`/api/v1/retailer-transactions/${tx.id}/decision`).set(as(spv)).send({ decision: 'APPROVED' }).expect(200);
    const req = (await http.post(`/api/v1/retailer-transactions/${tx.id}/reversal-requests`).set(as(spv)).send({ reason: 'scope test' }).expect(201)).body.data;
    const seen = (await http.get('/api/v1/approvals?status=PENDING&pageSize=200').set(as(other)).expect(200)).body.data;
    expect(seen.some((a: { id: string }) => a.id === req.id)).toBe(false);
    await http.post(`/api/v1/approvals/${req.id}/decision`).set(as(other)).send({ decision: 'APPROVED' }).expect(404);
  });
});
