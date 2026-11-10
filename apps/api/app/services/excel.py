"""UNDUH EXCEL – isi file .xlsx yang diunduh dari dashboard.

Hanya laporan yang SUDAH DISETUJUI, dengan filter yang sama seperti dashboard (periode, wilayah, tipe toko,
SPG, supervisor). Kolom detail dibentuk otomatis dari pertanyaan di app/forms.py, jadi pertanyaan baru
langsung ikut menjadi kolom baru tanpa mengubah file ini.

Lembar:
  Ringkasan            angka utama dashboard + filter yang dipakai
  Laporan              satu baris per laporan (grosir / venue / rute)
  Detail <...>         satu baris per pembeli / responden / kunjungan outlet
  Promo, Promotor      (khusus Grosir) satu baris per catatan
"""
import io
import re
from datetime import UTC, date, datetime, timedelta

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from ..forms import FORMS, TYPES
from ..models import Kabupaten, Kecamatan, User
from .dashboard import Filters, build, load_approved, loc_of, scope
from .formengine import lab, options_of, val
from .master import app_settings, short_kab

HEAD_FILL = PatternFill("solid", fgColor="10203F")
HEAD_FONT = Font(bold=True, color="FFFFFF")


def _wib(v) -> datetime | None:
    if not v:
        return None
    d = v if isinstance(v, datetime) else datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    return (d.astimezone(UTC) + timedelta(hours=7)).replace(tzinfo=None)


def _sheet(wb: Workbook, title: str, headers: list[str], rows: list[list]):
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for c in ws[1]:
        c.fill, c.font, c.alignment = HEAD_FILL, HEAD_FONT, Alignment(wrap_text=True, vertical="top")
    for r in rows:
        ws.append([None if v == "" else v for v in r])
    for row in ws.iter_rows(min_row=2):
        for c in row:
            if isinstance(c.value, str) and c.value[:1] in "=+-@":
                c.data_type = "s"  # teks yang diawali = tidak boleh dijalankan sebagai rumus Excel
            elif isinstance(c.value, datetime):
                c.number_format = "dd-mm-yyyy hh:mm"
            elif isinstance(c.value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", c.value):
                c.value = date.fromisoformat(c.value)  # tanggal asli agar bisa difilter/diurutkan di Excel
                c.number_format = "dd-mm-yyyy"
    for i, h in enumerate(headers, 1):
        width = max([len(str(h))] + [len(str(ws.cell(row=j, column=i).value or "")) for j in range(2, min(ws.max_row, 200) + 1)])
        ws.column_dimensions[get_column_letter(i)].width = min(max(10, width + 2), 45)
    ws.freeze_panes = "A2"
    if rows:
        ws.auto_filter.ref = ws.dimensions
    return ws


def _columns(questions: list[dict], variants: list[str]) -> list[tuple[str, str, str | None]]:
    """(id pertanyaan, judul kolom, sub-kunci) untuk setiap kolom."""
    cols = []
    for q in questions:
        label = q["label"].rstrip("?")
        if q["type"] in ("variants", "stok"):
            cols += [(q["id"], f"{label} – {v}", v) for v in variants]
        elif q["type"] == "kecamatan":
            cols += [(q["id"], label, "nama"), (q["id"], f"{label} – kab/kota", "kab")]
        else:
            cols.append((q["id"], label, None))
    return cols


def _value(q: dict, v, sub: str | None, answers: dict, variants: list[str]):
    if v is None or v == "":
        return ""
    t = q["type"]
    if t == "variants":
        return int((v or {}).get(sub) or 0)
    if t == "stok":
        return {"ADA": "Ada", "KOSONG": "Kosong", "TIDAK": "Tidak jual"}.get((v or {}).get(sub), "")
    if t == "kecamatan":
        return (v.get("nama") if sub == "nama" else short_kab(v.get("kab", ""))) if isinstance(v, dict) else str(v)
    if t in ("single", "multi"):
        labels = {val(o): lab(o) for o in options_of(q, answers, variants)}
        return ", ".join(labels.get(x, x) for x in v) if isinstance(v, list) else labels.get(v, v)
    if t == "confirm":
        return "Ya" if v else ""
    if t == "photo":
        return "Contoh" if isinstance(v, dict) and v.get("sample") else "Ada foto"
    if t == "brandcounts":
        return "; ".join(f"{r.get('merek')} ({r.get('batang') if r.get('batang') is not None else '–'} btg)" for r in v)
    return v


def _region(db: Session, f: Filters) -> str:
    if f.kec and (k := db.get(Kecamatan, f.kec)):
        return f"Kec. {k.nama}, {short_kab(k.kab.nama)}"
    if f.kab and (k := db.get(Kabupaten, f.kab)):
        return short_kab(k.nama)
    if f.prov and (k := db.query(Kabupaten).filter(Kabupaten.prov_kode == f.prov).first()):
        return k.provinsi
    return "semua"


def build_xlsx(db: Session, me: User, f: Filters) -> bytes:
    F = FORMS[f.type]
    variants = app_settings(db)["variants"]
    reports, _ = load_approved(db, me, f)
    ss, ents = scope(reports, f)
    ss = sorted(ss, key=lambda s: (s.get("date") or "", s.get("startedAt") or ""))
    wb = Workbook()
    wb.remove(wb.active)

    # Ringkasan
    dash = build(db, me, f)
    rows = [["Kategori", TYPES[f.type]], ["Periode", f"{f.days} hari terakhir"], ["Diunduh", _wib(datetime.now(UTC))],
            ["Diunduh oleh", me.name], ["Filter wilayah", _region(db, f)],
            ["Filter tipe toko", f.tipe or "semua"], ["Filter SPG", f.spg or "semua"], ["Laporan disetujui", len(ss)], ["", ""]]
    rows += [[t["k"], t["v"] + (f"  ({t['d']})" if t["d"] else "")] for t in dash["tiles"]]
    _sheet(wb, "Ringkasan", ["Keterangan", "Nilai"], rows)

    # Laporan
    hcols, ccols = _columns(F["start"], variants), _columns(F["closing"], variants)
    qmap_h, qmap_c = {q["id"]: q for q in F["start"]}, {q["id"]: q for q in F["closing"]}
    rows = []
    for s in ss:
        loc = loc_of(s, f.type) or {}
        n = [e for e in ents if e["_s"] is s]
        rows.append([s.get("date"), s["_spg"], *[_value(qmap_h[i], s["header"].get(i), sub, s["header"], variants) for i, _, sub in hcols],
                     loc.get("prov", "") if isinstance(loc, dict) else "", len(n), sum(sum(int(x or 0) for x in (e.get("beli") or {}).values()) for e in n),
                     *[_value(qmap_c[i], (s.get("closing") or {}).get(i), sub, s.get("closing") or {}, variants) for i, _, sub in ccols],
                     _wib(s.get("startedAt")), _wib(s.get("endedAt")), s["_by"], _wib(s.get("_at")), "Ya" if s.get("_sample") else ""])
    _sheet(wb, "Laporan", ["Tanggal", "SPG", *[h for _, h, _ in hcols], "Provinsi", F["entry_word"].capitalize(), "Bungkus TT",
                           *[h for _, h, _ in ccols], "Mulai", "Selesai", "Disetujui oleh", "Disetujui pada", "Data contoh"], rows)

    # Detail per pembeli / responden / outlet
    ecols = _columns(F["entry"], variants)
    qmap_e = {q["id"]: q for q in F["entry"]}
    title_field = F["title_field"]
    rows = [[e["_s"].get("date"), e["_s"]["_spg"], e["_s"]["header"].get(title_field) or "", _wib(e.get("at")),
             *[_value(qmap_e[i], e.get(i), sub, e, variants) for i, _, sub in ecols]] for e in sorted(ents, key=lambda e: (e["_s"].get("date") or "", e.get("at") or ""))]
    _sheet(wb, f"Detail {F['entry_word']}", ["Tanggal", "SPG", {"GROSIR": "Grosir", "HORECA": "Venue", "REGULER": "Rute"}[f.type], "Jam input",
                                            *[h for _, h, _ in ecols]], rows)

    # Bagian tambahan (Grosir: promo & promotor kompetitor)
    for sec in F["sections"]:
        scols = _columns(sec["questions"], variants)
        qmap_s = {q["id"]: q for q in sec["questions"]}
        rows = []
        for s in ss:
            for it in ((s.get("sections") or {}).get(sec["key"]) or {}).get("items", []):
                rows.append([s.get("date"), s["_spg"], s["header"].get(title_field) or "", *[_value(qmap_s[i], it.get(i), sub, it, variants) for i, _, sub in scols]])
        name = sec["title"].split("·")[-1].strip()
        _sheet(wb, name.replace("/", "-")[:31], ["Tanggal", "SPG", "Grosir", *[h for _, h, _ in scols]], rows)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
