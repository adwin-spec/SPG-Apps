"""UNDUH EXCEL – isi file .xlsx yang diunduh dari dashboard.

Hanya laporan yang SUDAH DISETUJUI, dengan filter yang sama seperti dashboard (periode, wilayah, tipe toko,
SPG, supervisor). Kolom detail dibentuk otomatis dari pertanyaan di app/forms.py, jadi pertanyaan baru
langsung ikut menjadi kolom baru tanpa mengubah file ini.

Satu file = satu jenis SPG (Grosir, HORECA, atau Reguler), sehingga setiap file bisa dianalisis sendiri.

Lembar:
  Ringkasan            angka utama dashboard + filter yang dipakai
  Analisis             semua grafik dashboard sebagai tabel kecil + grafik Excel asli (bisa diedit/disalin ke slide)
  Tren harian          angka per hari + grafik garis
  Laporan              satu baris per laporan (grosir / venue / rute)
  Detail <...>         satu baris per pembeli / responden / kunjungan outlet
  Promo, Promotor      (khusus Grosir) satu baris per catatan
"""
import io
import re
from datetime import UTC, date, datetime, timedelta

from openpyxl import Workbook
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy.orm import Session

from ..forms import FORMS, TYPES
from ..models import Kabupaten, Kecamatan, User
from .dashboard import Axis, Filters, build, load_approved, loc_of, scope
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
    ws = wb.create_sheet(re.sub(r"[\\/?*\[\]:]", "-", title).strip()[:31] or "Lembar")  # karakter yang dilarang Excel
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
        label = q.get("col") or q["label"].rstrip("?")
        if q["type"] in ("variants", "stok"):
            cols += [(q["id"], f"{label} – {v}", v) for v in variants]
        elif q["type"] == "gps":
            cols += [(q["id"], f"{label} – lat", "lat"), (q["id"], f"{label} – lon", "lon"), (q["id"], f"{label} – akurasi (m)", "acc")]
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
    if t == "gps":
        return (v or {}).get(sub, "") if isinstance(v, dict) else ""
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


RED, INK, GRAY, LIGHT = "D42A1F", "3A3733", "A39D93", "C4BFB6"
TONE = {"tt": RED, "comp": GRAY, None: RED, "ink": INK, "muted": LIGHT}


def _bar_chart(ws, title: str, min_row: int, max_row: int, cols: int, color: str | list[str], stacked: bool = False, height: float = 7):
    ch = BarChart()
    ch.type, ch.style, ch.title, ch.legend = "bar", 10, title, (None if cols == 1 else ch.legend)
    ch.y_axis.majorGridlines = None
    data = Reference(ws, min_col=2, max_col=1 + cols, min_row=min_row - 1, max_row=max_row)
    ch.add_data(data, titles_from_data=True)
    ch.set_categories(Reference(ws, min_col=1, min_row=min_row, max_row=max_row))
    ch.x_axis.scaling.orientation = "maxMin"  # urutan sama dengan tabel (teratas = pertama)
    ch.y_axis.scaling.min = 0
    for i, ser in enumerate(ch.series):
        ser.graphicalProperties.solidFill = color[i] if isinstance(color, list) else color
        ser.graphicalProperties.line.noFill = True
    if stacked:
        ch.grouping, ch.overlap = "percentStacked", 100
    ch.height, ch.width = height, 16
    return ch


def _analysis(wb: Workbook, panels: list[dict]) -> None:
    """Setiap panel dashboard → tabel kecil (kolom A–E) + grafik Excel di sebelah kanannya."""
    ws = wb.create_sheet("Analisis")
    ws.column_dimensions["A"].width = 34
    for c in "BCDE":
        ws.column_dimensions[c].width = 14
    r = 1
    bold = Font(bold=True, size=12)
    for p in panels:
        kind = p["kind"]
        if kind in ("gallery", "trend", "map"):
            continue
        ws.cell(row=r, column=1, value=p["title"]).font = bold
        if p.get("sub"):
            ws.cell(row=r + 1, column=1, value=p["sub"]).font = Font(italic=True, color="6B6760")
        head = r + 2
        if kind in ("bars", "segments", "funnel"):
            rows = p.get("rows") or p.get("steps") or []
            total = sum(x["n"] for x in rows) or 1
            ws.cell(row=head, column=1, value="Kategori"); ws.cell(row=head, column=2, value="Jumlah")
            ws.cell(row=head, column=2, value="Persen" if p.get("unit") == "%" else "Jumlah")
            ws.cell(row=head, column=3, value="% dari tahap pertama" if kind == "funnel" else None if p.get("unit") == "%" else "Persentase")
            base = (rows[0]["n"] if rows else 0) or 1
            for i, x in enumerate(rows):
                ws.cell(row=head + 1 + i, column=1, value=x["label"]); ws.cell(row=head + 1 + i, column=2, value=x["n"])
                if p.get("unit") != "%":
                    c = ws.cell(row=head + 1 + i, column=3, value=x["n"] / (base if kind == "funnel" else total)); c.number_format = "0.0%"
            n = len(rows)
            if n:
                color = [TONE.get(x.get("tone")) for x in rows][0] if kind == "bars" else RED
                ws.add_chart(_bar_chart(ws, p["title"], head + 1, head + n, 1, color, height=max(5, 1 + n * 0.7)), f"G{r}")
            r = head + max(n + 3, 14)
        elif kind == "stack":
            keys = p["keys"]
            ws.cell(row=head, column=1, value="Baris")
            for j, k in enumerate(keys):
                ws.cell(row=head, column=2 + j, value=k["label"])
            for i, row in enumerate(p["rows"]):
                ws.cell(row=head + 1 + i, column=1, value=row["label"])
                for j, k in enumerate(keys):
                    ws.cell(row=head + 1 + i, column=2 + j, value=row["values"].get(k["key"], 0))
            n = len(p["rows"])
            if n:
                ws.add_chart(_bar_chart(ws, p["title"], head + 1, head + n, len(keys), [TONE[k["tone"]] for k in keys], stacked=True,
                                        height=max(5, 2 + n * 0.8)), f"G{r}")
            r = head + max(n + 3, 14)
        elif kind == "table":
            cols = p["columns"]
            for j, c in enumerate(cols):
                ws.cell(row=head, column=1 + j, value=c["label"])
            for i, row in enumerate(p["rows"]):
                for j, v in enumerate(row):
                    ws.cell(row=head + 1 + i, column=1 + j, value=v["text"] if isinstance(v, dict) else v)
            r = head + len(p["rows"]) + 3
        for c in ws[head]:
            if c.value is not None:
                c.fill, c.font = HEAD_FILL, HEAD_FONT


def _trend(wb: Workbook, panels: list[dict], tiles_daily: dict[str, list]) -> None:
    ws = wb.create_sheet("Tren harian")
    series = {p["title"]: p["points"] for p in panels if p["kind"] == "trend"} | tiles_daily
    names = list(series)
    if not names:
        return
    days = [d for d, _ in next(iter(series.values()))]
    ws.append(["Tanggal", *names])
    for c in ws[1]:
        c.fill, c.font = HEAD_FILL, HEAD_FONT
    for i, d in enumerate(days):
        ws.append([date.fromisoformat(d), *[series[n][i][1] for n in names]])
        ws.cell(row=i + 2, column=1).number_format = "dd-mm-yyyy"
    ws.column_dimensions["A"].width = 13
    for j in range(len(names)):
        ws.column_dimensions[get_column_letter(2 + j)].width = 22
        ch = LineChart()
        ch.title, ch.legend, ch.height, ch.width = names[j], None, 7, 22
        ch.add_data(Reference(ws, min_col=2 + j, min_row=1, max_row=len(days) + 1), titles_from_data=True)
        ch.set_categories(Reference(ws, min_col=1, min_row=2, max_row=len(days) + 1))
        ch.series[0].graphicalProperties.line.solidFill = RED if j == 0 else INK
        ch.series[0].graphicalProperties.line.width = 22000
        ch.x_axis.number_format, ch.y_axis.majorGridlines = "dd-mm", None
        ws.add_chart(ch, f"{get_column_letter(len(names) + 3)}{1 + j * 16}")
    ws.freeze_panes = "A2"


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
    _analysis(wb, dash["panels"])
    X = Axis(f.days)
    _trend(wb, dash["panels"], {f"{F['entry_word'].capitalize()} per hari": [[d, v] for d, v in zip(X.days, X.daily(ents))],
                                "Laporan disetujui per hari": [[d, v] for d, v in zip(X.days, X.daily(ss, date=lambda s: s.get("date")))]})

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
        name = sec.get("sheet") or sec["title"].split("·")[-1].strip()
        _sheet(wb, name, ["Tanggal", "SPG", "Grosir", *[h for _, h, _ in scols]], rows)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_zip(db: Session, me: User, f: Filters) -> bytes:
    """Ketiga jenis SPG sekaligus: satu file Excel per jenis di dalam satu ZIP."""
    import copy
    import zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for t in TYPES:
            g = copy.copy(f); g.type = t
            if t == "HORECA":
                g.tipe = ""  # tipe toko tidak berlaku untuk HORECA
            z.writestr(f"tanda-tambah-{t.lower()}-{f.days}hari.xlsx", build_xlsx(db, me, g))
    return buf.getvalue()
