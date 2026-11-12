"""Aturan laporan SPG: struktur data, validasi, ringkasan, dan pemeriksaan kewajaran (flags)."""
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from ..forms import FORMS
from ..models import Photo, Report, User
from .formengine import Ctx, clean, sum_variants
from .master import app_settings, kec_lookup

OPEN = ("DRAFT", "REVISION")


def jakarta_date(dt: datetime):
    return (dt.astimezone(UTC) + timedelta(hours=7)).date()


def make_ctx(db: Session, user: User | None) -> Ctx:
    s = app_settings(db)
    def photo_ok(pid: str) -> bool:
        p = db.get(Photo, pid)
        return bool(p and user and p.uploader_id == user.id)
    return Ctx(variants=s["variants"], kecamatan=kec_lookup(db), photo_ok=photo_ok)


def clean_report(db: Session, user: User, rtype: str, body: dict, final: bool) -> tuple[dict, dict]:
    """Bersihkan seluruh isi laporan. `final=True` saat dikirim: semua isian penutup wajib lengkap."""
    f = FORMS[rtype]
    ctx = make_ctx(db, user)
    errs: dict = {}
    # Draf: isian wajib yang masih kosong tidak menghalangi penyimpanan (mis. laporan lama sebelum ada pertanyaan baru,
    # atau GPS sedang gagal). Hanya kecamatan lokasi yang wajib, karena dipakai untuk menentukan supervisor.
    # Saat dikirim (final) semuanya diperiksa lengkap.
    need = None if final else {f["location_field"]}
    header, e = clean(f["start"], body.get("header"), ctx, strict=True, need=need)
    if e: errs["header"] = e
    entries = []
    for i, raw in enumerate((body.get("entries") or [])[:300]):
        ent, e = clean(f["entry"], raw, ctx, strict=True, need=None if final else set())
        if e: errs[f"entries.{i}"] = e
        at = raw.get("at") if isinstance(raw, dict) else None
        ent["at"] = at if isinstance(at, str) and len(at) <= 40 else datetime.now(UTC).isoformat()
        entries.append(ent)
    sections = {}
    for sec in f["sections"]:
        raw = (body.get("sections") or {}).get(sec["key"]) or {}
        items = []
        for i, it in enumerate((raw.get("items") or [])[:50]):
            c, e = clean(sec["questions"], it, ctx, strict=True, need=None if final else set())
            if e: errs[f"{sec['key']}.{i}"] = e
            items.append(c)
        sections[sec["key"]] = {"none": bool(raw.get("none")) and not items, "items": items}
    closing, e = clean(f["closing"], body.get("closing"), ctx, strict=final)
    if e: errs["closing"] = e
    if final:
        miss = []
        if not entries: miss.append(f"minimal 1 {f['entry_word']}")
        for sec in f["sections"]:
            s = sections[sec["key"]]
            if not s["items"] and not s["none"]:
                miss.append(f"{sec['title'].split('·')[0].strip()} (isi atau centang \"tidak ada\")")
        if miss: errs["submit"] = miss
    return {"header": header, "entries": entries, "sections": sections, "closing": closing}, errs


def entry_label(t: str, e: dict, i: int) -> str:
    """Nama singkat satu isian, sama seperti di aplikasi HP."""
    if t == "GROSIR":
        return e.get("namaToko") or e.get("namaPembeli") or f"Konsumen {i + 1}"
    if t == "HORECA":
        return f"Responden {i + 1}" + (f" ({e['usia']} th)" if e.get("usia") else "")
    return e.get("namaOutlet") or f"Outlet {i + 1}"


def title_of(r: Report | dict) -> str:
    t = r.type if isinstance(r, Report) else r["type"]
    data = r.data if isinstance(r, Report) else r
    h = data.get("header") or {}
    if t == "REGULER":
        return h.get("rute") or "Rute " + ((h.get("kecRute") or {}).get("nama") or "")
    return h.get(FORMS[t]["title_field"]) or "–"


def packs(data: dict) -> int:
    return int(sum(sum_variants(e.get("beli")) for e in data.get("entries") or []))


def flags(r: Report, viewer: User) -> list[str]:
    f: list[str] = []
    ent = r.data.get("entries") or []
    if r.type == "GROSIR":
        for e in ent:
            if e.get("hargaEceran") and e.get("hargaGrosir") and e["hargaEceran"] < e["hargaGrosir"]:
                f.append(f"Harga eceran < grosir ({e.get('namaToko') or 'konsumen'})")
        names = [str(e.get("namaToko")).lower() for e in ent if e.get("namaToko")]
        if len(set(names)) < len(names): f.append("Nama toko tercatat dua kali")
    elif r.type == "HORECA":
        ph = [e for e in ent if e.get("foto")]
        if len(ent) >= 3 and len(ph) / len(ent) < 0.5: f.append(f"Hanya {len(ph)} dari {len(ent)} responden difoto")
    else:
        names = [str(e.get("namaOutlet")).lower() for e in ent]
        if len(set(names)) < len(names): f.append("Outlet tercatat dua kali")
    refs = [x["id"] for e in ent for x in (e.get("foto"), e.get("fotoDisplay")) if isinstance(x, dict) and x.get("id")]
    if len(set(refs)) < len(refs): f.append("Foto yang sama dipakai lebih dari sekali")
    loc = (r.data.get("header") or {}).get("lokasi")
    if not isinstance(loc, dict):
        f.append("Lokasi GPS awal tidak tercatat")
    elif (loc.get("acc") or 0) > 150:
        f.append(f"Akurasi GPS rendah (± {loc['acc']} m)")
    no_gps = [e for e in ent if r.type == "REGULER" and not isinstance(e.get("gps"), dict)]
    if no_gps:
        f.append(f"{len(no_gps)} outlet tanpa lokasi GPS")
    if r.spg_id == viewer.id: f.append("Laporan Anda sendiri – sebaiknya disetujui orang lain")
    if r.ended_at and ent:
        mins = (r.ended_at - r.started_at).total_seconds() / 60
        if mins / len(ent) < FORMS[r.type]["min_minutes_per_entry"]:
            f.append(f"Rata-rata {'< 1' if mins < 1 else round(mins / len(ent))} menit per {FORMS[r.type]['entry_word']}")
    return f
