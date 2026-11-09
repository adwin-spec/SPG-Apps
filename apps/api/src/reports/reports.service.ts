import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { formatJakarta, type AnalyticsFilter, type AuthUser } from '@tanda/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { num } from '../common/sql';
import { FilterService, ResolvedFilter } from '../analytics/filter.service';
import { Column, REPORTS } from './report-definitions';

const MAX_ROWS = { csv: 100_000, xlsx: 100_000, pdf: 2_000 };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly filters: FilterService, private readonly audit: AuditService) {}

  catalog() { return Object.entries(REPORTS).map(([key, r]) => ({ key, title: r.title, columns: r.columns })); }

  async run(user: AuthUser, type: string, f: AnalyticsFilter, limit: number) {
    const def = REPORTS[type];
    if (!def) throw new NotFoundException({ code: 'UNKNOWN_REPORT', message: `Unknown report ${type}` });
    const r = await this.filters.resolve(user, f);
    const rows = num(await this.prisma.$queryRaw<Record<string, unknown>[]>(def.sql(r)));
    return { def, r, rows: rows.slice(0, limit), total: rows.length, truncated: rows.length > limit };
  }

  async preview(user: AuthUser, type: string, f: AnalyticsFilter) {
    const { def, r, rows, total, truncated } = await this.run(user, type, f, 500);
    return { key: type, title: def.title, columns: def.columns, rows, total, truncated, filter: this.filterSummary(r) };
  }

  filterSummary(r: ResolvedFilter) {
    const f = Object.fromEntries(Object.entries(r.raw).filter(([, v]) => v != null && v !== ''));
    return { ...f, from: r.from, to: r.to, finalStatuses: r.final, spgsInScope: r.spgIds.length };
  }

  async export(user: AuthUser, type: string, format: 'csv' | 'xlsx' | 'pdf', f: AnalyticsFilter): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const { def, r, rows, total, truncated } = await this.run(user, type, f, MAX_ROWS[format]);
    if (format === 'pdf' && truncated) throw new BadRequestException({ code: 'TOO_MANY_ROWS_FOR_PDF', message: `PDF export is limited to ${MAX_ROWS.pdf} rows (${total} found). Narrow the filter or use Excel/CSV.` });
    const summary = this.filterSummary(r);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const filename = `${type}_${r.from}_${r.to}_${stamp}.${format}`;
    await this.audit.log({ actorId: user.id, action: 'EXPORT', entityType: 'Report', entityId: null, after: { type, format, rows: rows.length, filter: summary } });
    if (format === 'csv') return { buffer: this.csv(def.columns, rows, def.title, summary), filename, mime: 'text/csv; charset=utf-8' };
    if (format === 'xlsx') return { buffer: await this.xlsx(def.title, def.columns, rows, summary, truncated), filename, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
    return { buffer: await this.pdf(def.title, def.columns, rows, summary), filename, mime: 'application/pdf' };
  }

  private cell(v: unknown, c: Column): string {
    if (v == null) return '';
    if (v instanceof Date) return c.type === 'date' ? v.toISOString().slice(0, 10) : formatJakarta(v);
    if (Array.isArray(v)) return v.join('; ');
    return String(v);
  }

  private csv(cols: Column[], rows: Record<string, unknown>[], title: string, summary: object) {
    const esc = (s: string) => (/[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    // Formula-injection guard for spreadsheet apps
    const safe = (s: string) => (/^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s);
    const lines = [`# ${title}`, `# Filter: ${JSON.stringify(summary)}`, cols.map((c) => esc(c.label)).join(',')];
    for (const r of rows) lines.push(cols.map((c) => esc(safe(this.cell(r[c.key], c)))).join(','));
    return Buffer.from('﻿' + lines.join('\n'), 'utf8');
  }

  private async xlsx(title: string, cols: Column[], rows: Record<string, unknown>[], summary: object, truncated: boolean) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tanda Tambah SPG System'; wb.created = new Date();
    const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(12, c.label.length + 2)),
      style: c.type === 'money' ? { numFmt: '#,##0' } : c.type === 'pct' ? { numFmt: '0.00' } : c.type === 'date' ? { numFmt: 'yyyy-mm-dd' } : {} }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1E3D' } };
    for (const r of rows) ws.addRow(Object.fromEntries(cols.map((c) => { const v = r[c.key]; return [c.key, Array.isArray(v) ? v.join('; ') : v]; })));
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    const info = wb.addWorksheet('Filter');
    info.addRow(['Report', title]); info.addRow(['Generated (UTC)', new Date().toISOString()]);
    for (const [k, v] of Object.entries(summary)) info.addRow([k, Array.isArray(v) ? v.join(', ') : String(v)]);
    if (truncated) info.addRow(['WARNING', 'Row limit reached – narrow the filter for a complete export']);
    info.getColumn(1).width = 24; info.getColumn(2).width = 60;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private pdf(title: string, cols: Column[], rows: Record<string, unknown>[], summary: object): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
      doc.fontSize(14).fillColor('#0F1E3D').text(`Tanda Tambah – ${title}`);
      doc.fontSize(7).fillColor('#555').text(`Generated ${formatJakarta(new Date())} WIB · Filter: ${JSON.stringify(summary)}`);
      doc.moveDown(0.5);
      const shown = cols.slice(0, 12);
      const width = (doc.page.width - 56) / shown.length;
      const drawHeader = () => {
        const y = doc.y; doc.rect(28, y - 2, doc.page.width - 56, 14).fill('#0F1E3D');
        doc.fillColor('#fff').fontSize(6.5); shown.forEach((c, i) => doc.text(c.label, 30 + i * width, y, { width: width - 4, height: 12, ellipsis: true }));
        doc.y = y + 14;
      };
      drawHeader();
      rows.forEach((r, idx) => {
        if (doc.y > doc.page.height - 40) { doc.addPage(); drawHeader(); }
        const y = doc.y;
        if (idx % 2) doc.rect(28, y - 1, doc.page.width - 56, 11).fill('#F3F5F9');
        doc.fillColor('#111').fontSize(6.5);
        shown.forEach((c, i) => doc.text(this.cell(r[c.key], c), 30 + i * width, y, { width: width - 4, height: 10, ellipsis: true }));
        doc.y = y + 11;
      });
      if (cols.length > shown.length) doc.moveDown().fontSize(7).fillColor('#a00').text(`${cols.length - shown.length} column(s) omitted in PDF; use Excel for the full dataset.`);
      doc.end();
    });
  }
}
