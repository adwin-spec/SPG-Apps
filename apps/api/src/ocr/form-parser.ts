/**
 * Heuristic parser for the SPG Grosir paper form (OCR text → candidate fields).
 * Output is a SUGGESTION for the human reviewer – never a transaction (brief §K).
 * Each field carries its own confidence so reviewers know where to look.
 */
export interface ParsedField<T> { value: T | null; confidence: number; source?: string }
export interface ParsedItem { sku: ParsedField<string>; quantity: ParsedField<number>; unit: ParsedField<string>; unitPrice: ParsedField<number>; raw: string }
export interface ParsedForm {
  formId: ParsedField<string>; reportDate: ParsedField<string>; spgCode: ParsedField<string>; wholesalerCode: ParsedField<string>;
  retailerName: ParsedField<string>; items: ParsedItem[]; overallConfidence: number; unparsedLines: string[];
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const field = <T,>(value: T | null, confidence: number, source?: string): ParsedField<T> => ({ value, confidence, source });

export function parseIndonesianDate(s: string): string | null {
  const m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}

export function parseForm(text: string, providerConfidence: number | null = null): ParsedForm {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const base = providerConfidence ?? 0.5;
  const find = (re: RegExp) => { for (const l of lines) { const m = l.match(re); if (m) return { v: m[1].trim(), line: l }; } return null; };
  const formId = find(/(?:form\s*(?:id|no)|no\.?\s*form)\s*[:#]?\s*([A-Z0-9\-\/]{3,})/i);
  const date = find(/(?:tanggal|tgl|date)\s*[:#]?\s*([0-9\/\-.]{6,10})/i);
  const spg = find(/(?:spg\s*(?:id|kode)?)\s*[:#]?\s*([A-Z0-9\-]{3,})/i);
  const grosir = find(/(?:grosir\s*(?:id|kode)?|wholesaler)\s*[:#]?\s*([A-Z0-9\-]{3,})/i);
  const retailer = find(/(?:retailer|toko|nama\s*toko|pembeli)\s*[:#]?\s*(.{3,})/i);
  const used = new Set([formId?.line, date?.line, spg?.line, grosir?.line, retailer?.line]);
  // Item line: "<SKU> <qty> <unit> <price>" e.g. "TT-1-200ML 12 botol 6.500" or "SKU123 x24 pcs @5000"
  const itemRe = /^([A-Z0-9][A-Z0-9\-_.]{2,})\s+x?(\d+(?:[.,]\d+)?)\s*([a-zA-Z]{2,10})?\s*@?\s*(?:rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+|\d+)?/i;
  const items: ParsedItem[] = [];
  const unparsed: string[] = [];
  for (const l of lines) {
    if (used.has(l)) continue;
    const m = l.match(itemRe);
    if (m && !/^(form|tanggal|tgl|spg|grosir|total)/i.test(m[1])) {
      const qty = num(m[2]);
      const price = m[4] ? num(m[4]) : null;
      items.push({ raw: l, sku: field(m[1].toUpperCase(), base), quantity: field(Number.isFinite(qty) && qty > 0 ? qty : null, qty > 0 ? base : 0.1),
        unit: field(m[3]?.toLowerCase() ?? null, m[3] ? base : 0), unitPrice: field(price, price != null ? base * 0.9 : 0) });
    } else if (!/^(total|jumlah|ttd|tanda tangan)/i.test(l)) unparsed.push(l);
  }
  const parsedDate = date ? parseIndonesianDate(date.v) : null;
  const scored = [formId ? base : 0, parsedDate ? base : 0, spg ? base : 0, grosir ? base : 0, retailer ? base * 0.8 : 0, items.length ? base : 0];
  return {
    formId: field(formId?.v ?? null, formId ? base : 0), reportDate: field(parsedDate, parsedDate ? base : 0), spgCode: field(spg?.v ?? null, spg ? base : 0),
    wholesalerCode: field(grosir?.v ?? null, grosir ? base : 0), retailerName: field(retailer?.v ?? null, retailer ? base * 0.8 : 0), items,
    overallConfidence: Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10000) / 10000, unparsedLines: unparsed,
  };
}
