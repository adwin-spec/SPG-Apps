const PREFIXES = /\b(toko|tk|warung|wr|kios|ud|cv|pt|grosir|agen|mini ?market|mm)\b\.?/g;

/**
 * Normalises an outlet name for duplicate detection (risk R6):
 * lower-case, strip punctuation & common business prefixes, collapse whitespace.
 * "TOKO  Sumber-Rejeki." and "Tk. Sumber Rejeki" → "sumber rejeki".
 */
export function normalizeOutletName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const stripped = base.replace(PREFIXES, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length > 0 ? stripped : base;
}
