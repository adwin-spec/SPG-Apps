import { parseForm, parseIndonesianDate } from './form-parser';

describe('OCR form parser', () => {
  it('parses Indonesian dates', () => {
    expect(parseIndonesianDate('09/11/2026')).toBe('2026-11-09');
    expect(parseIndonesianDate('9-11-26')).toBe('2026-11-09');
    expect(parseIndonesianDate('31/13/2026')).toBeNull();
  });
  it('extracts header fields and item lines with confidences', () => {
    const text = ['FORM ID: GR-2026-0001', 'Tanggal: 09/11/2026', 'SPG ID: DEMO-SPG-001', 'Grosir ID: DEMO-O0001', 'Nama Toko: Warung Bu Sri',
      'DEMO-1-200ML 12 botol 6.500', 'DEMO-3-600ML x24 pcs @3.500', 'catatan tidak terbaca', 'TOTAL 162.000'].join('\n');
    const p = parseForm(text, 0.9);
    expect(p.formId.value).toBe('GR-2026-0001');
    expect(p.reportDate.value).toBe('2026-11-09');
    expect(p.spgCode.value).toBe('DEMO-SPG-001');
    expect(p.wholesalerCode.value).toBe('DEMO-O0001');
    expect(p.retailerName.value).toBe('Warung Bu Sri');
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toMatchObject({ sku: { value: 'DEMO-1-200ML' }, quantity: { value: 12 }, unit: { value: 'botol' }, unitPrice: { value: 6500 } });
    expect(p.items[1].quantity.value).toBe(24);
    expect(p.unparsedLines).toContain('catatan tidak terbaca');
    expect(p.overallConfidence).toBeGreaterThan(0.5);
  });
  it('returns low confidence and no items for unreadable text', () => {
    const p = parseForm('', null);
    expect(p.items).toHaveLength(0);
    expect(p.overallConfidence).toBe(0);
  });
});
