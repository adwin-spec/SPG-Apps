"""ISI DASHBOARD – angka dan panel dihitung di sini, frontend hanya menampilkan.

Setiap fungsi `grosir()`, `horeca()`, `reguler()` mengembalikan daftar `tiles` (kotak angka di atas) dan
`panels` (grafik batang, tabel, galeri foto). Untuk menambah panel, cukup tambahkan satu baris, contoh:

    panels.append(bars("Usia responden", "", count(ents, "usia", O["usia"]), pct=True))

Bentuk panel:
    bars(judul, keterangan, rows, span=4, pct=False, tone=None)    rows = [(label, angka, "tt"|"comp"|None)]
    table(judul, keterangan, kolom, baris, span=12)                 kolom yang diawali "#" rata kanan
    gallery(judul, keterangan, items)                               items = [{"photo": {...}, "cap": "..."}]
`span` = lebar panel dalam 12 kolom (4 = sepertiga, 6 = setengah, 12 = penuh).

Sumber data hanya laporan yang SUDAH DISETUJUI (tabel approvals).
"""
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..forms import FORMS, O, TYPES
from ..models import Approval, Report, User
from .access import active_items, active_spvs, covers, spvs_for
from .formengine import lab, sum_variants, title_case, val
from .master import app_settings, short_kab

MAX_ROWS = 20000  # batas salinan per permintaan dashboard (cukup untuk ±90 hari operasi 100 SPG)

# ───────────────────────────── helper format ─────────────────────────────


def fmt(n: float | None) -> str:
    return "–" if n is None else f"{n:,.0f}".replace(",", ".")


def pct(a: float, b: float) -> str:
    return "–" if not b else f"{a / b * 100:,.1f}%".replace(".", ",")


def rp(v: float | None) -> str:
    return "–" if not v else "Rp " + fmt(round(v))


def avg(a: list) -> float | None:
    return sum(a) / len(a) if a else None


def tile(k: str, v: str, d: str = "") -> dict:
    return {"k": k, "v": v, "d": d}


def bars(title: str, sub: str, rows: list, span: int = 4, pct: bool = False, tone: str | None = None, money: bool = False) -> dict:
    return {"kind": "bars", "title": title, "sub": sub, "span": span, "pct": pct, "money": money,
            "rows": [{"label": r[0], "n": r[1], "tone": (r[2] if len(r) > 2 else None) or tone} for r in rows]}


def table(title: str, sub: str, columns: list[str], rows: list[list], span: int = 12, empty: str = "Belum ada data") -> dict:
    return {"kind": "table", "title": title, "sub": sub, "span": span, "empty": empty,
            "columns": [{"label": c.lstrip("#"), "num": c.startswith("#")} for c in columns], "rows": rows}


def gallery(title: str, sub: str, items: list[dict], span: int = 12) -> dict:
    return {"kind": "gallery", "title": title, "sub": sub, "span": span, "items": items[:18]}


def count(items: list[dict], key, order: list | None = None) -> list:
    m: dict = defaultdict(int)
    for x in items:
        k = key(x) if callable(key) else x.get(key)
        if k not in (None, ""):
            m[k] += 1
    if order:
        return [(lab(o), m.get(val(o), 0)) for o in order]
    return sorted(m.items(), key=lambda kv: -kv[1])


def kec_name(x) -> str:
    return x.get("nama", "") if isinstance(x, dict) else str(x or "")


# ───────────────────────────── filter & cakupan ─────────────────────────────


class Filters:
    def __init__(self, type: str = "GROSIR", days: int = 30, spg: str = "", spv: str = "", prov: str = "", kab: str = "", kec: str = "", tipe: str = ""):
        self.type, self.days, self.spg, self.spv, self.prov, self.kab, self.kec, self.tipe = type, days, spg, spv, prov, kab, kec, tipe

    @property
    def loc_on(self) -> bool:
        return bool(self.prov or self.kab or self.kec)

    def match_loc(self, x) -> bool:
        if not self.loc_on:
            return True
        if not isinstance(x, dict):
            return False
        return (not self.prov or x.get("provKode") == self.prov) and (not self.kab or x.get("kabKode") == self.kab) and (not self.kec or x.get("kode") == self.kec)

    def match_tipe(self, e: dict) -> bool:
        if not self.tipe:
            return True
        if self.type == "GROSIR":
            return e.get("jenis") == "RETAIL" and e.get("tipeToko") == self.tipe
        if self.type == "REGULER":
            return e.get("tipeOutlet") == self.tipe
        return True


def loc_of(snap: dict, t: str):
    return (snap.get("header") or {}).get(FORMS[t]["location_field"])


def load_approved(db: Session, me: User, f: Filters, all_types: bool = False) -> tuple[list[dict], bool]:
    since = ((datetime.now(UTC) + timedelta(hours=7)).date() - timedelta(days=f.days))
    q = select(Approval).where(Approval.date >= since)
    if not all_types:
        q = q.where(Approval.type == f.type)
    rows = db.scalars(q.order_by(Approval.date.desc()).limit(MAX_ROWS + 1)).all()
    trunc = len(rows) > MAX_ROWS
    spvs = active_spvs(db)
    target = next((s for s in spvs if s.id == f.spv), None) if f.spv not in ("", "_none") else None
    out = []
    for a in rows[:MAX_ROWS]:
        s = {**a.snapshot, "_id": a.report_id, "_spg": a.spg_name, "_by": a.approver_name, "_sample": a.sample, "type": a.type}
        loc = loc_of(s, a.type)
        if me.role == "SPV" and not covers(me, loc):
            continue
        if me.role == "ADMIN" and f.spv == "_none" and spvs_for(spvs, loc):
            continue
        if target and not covers(target, loc):
            continue
        if f.spg and a.spg_name != f.spg:
            continue
        out.append(s)
    return out, trunc


def scope(reports: list[dict], f: Filters) -> tuple[list[dict], list[dict]]:
    """Grosir & Reguler: filter wilayah/tipe berlaku per pembeli/outlet. HORECA: filter wilayah pada lokasi venue."""
    if f.type == "HORECA":
        ss = [s for s in reports if f.match_loc(loc_of(s, "HORECA"))]
        return ss, [{**e, "_s": s} for s in ss for e in s.get("entries") or []]
    el = FORMS[f.type]["entry_location"]
    keep = lambda e: f.match_loc(e.get(el)) and f.match_tipe(e)
    ents = [{**e, "_s": s} for s in reports for e in s.get("entries") or [] if keep(e)]
    ss = [s for s in reports if any(keep(e) for e in s.get("entries") or [])] if (f.loc_on or f.tipe) else reports
    return ss, ents


def geo_table(ents: list[dict], key: str, title: str, buy_word: str, f: Filters) -> dict:
    by_kec = bool(f.kab)
    m: dict = {}
    for e in ents:
        x = e.get(key)
        if isinstance(x, dict):
            k = x["kode"] if by_kec else x["kabKode"]
            label = x["nama"] if by_kec else short_kab(x["kab"])
            sub = short_kab(x["kab"]) if by_kec else x["prov"]
        else:
            k, label, sub = "free", "Belum terpetakan", "diketik bebas"
        r = m.setdefault(k, {"k": k, "label": label, "sub": sub, "n": 0, "buy": 0, "bks": 0})
        r["n"] += 1
        p = sum_variants(e.get("beli"))
        if p:
            r["buy"] += 1; r["bks"] += p
    rows = [[r["label"] if r["k"] == "free" else {"text": r["label"], "geo": r["k"]}, r["sub"], r["n"], r["buy"], pct(r["buy"], r["n"]), fmt(r["bks"])]
            for r in sorted(m.values(), key=lambda r: -r["n"])[:25]]
    return table(f"{title} per {'kecamatan' if by_kec else 'kabupaten/kota'}",
                 "Klik baris untuk menyaring kecamatan itu" if by_kec else "Klik baris untuk melihat rincian kecamatannya",
                 ["Kecamatan" if by_kec else "Kabupaten/kota", "Kab/kota" if by_kec else "Provinsi", "#Kontak", "#" + buy_word, "#Konversi", "#Bungkus"], rows)


def photo_items(ents: list[dict], field: str, cap) -> list[dict]:
    xs = [e for e in ents if isinstance(e.get(field), dict)]
    xs.sort(key=lambda e: e.get("at") or "", reverse=True)
    return [{"photo": e[field], "cap": cap(e)} for e in xs]


# ───────────────────────────── panel per kategori ─────────────────────────────


def grosir(ss: list[dict], ents: list[dict], variants: list[str], brand: str) -> tuple[list, list]:
    ret = [e for e in ents if e.get("jenis") == "RETAIL"]
    kon = [e for e in ents if e.get("jenis") == "KONSUMEN"]
    buyers = [e for e in ents if sum_variants(e.get("beli")) > 0]
    by_var = [(v, sum(int((e.get("beli") or {}).get(v) or 0) for e in ents), "tt") for v in variants]
    tiles = [
        tile("Laporan grosir", fmt(len(ss)), f"{len({s['header'].get('grosir') for s in ss})} grosir"),
        tile("Pembeli ditemui", fmt(len(ents)), f"{len(ret)} toko · {len(kon)} konsumen"),
        tile(f"Membeli {brand}", pct(len(buyers), len(ents)), f"{len(buyers)} dari {len(ents)} pembeli"),
        tile("Bungkus terjual", fmt(sum(r[1] for r in by_var)), "semua varian"),
        tile("Toko yang sudah jual TT", pct(len([e for e in ret if e.get("statusTT") == "JUAL"]), len(ret)), "status sebelum ditawari"),
        tile("Belum tahu TT", pct(len([e for e in ents if e.get("statusTT") == "BELUM"]), len(ents)), "peluang pengenalan"),
    ]
    p = [
        bars("Penjualan per varian", "Bungkus dibeli pembeli di grosir", by_var),
        bars("Status TT di toko (retail)", "Sebelum ditawari SPG hari ini", count(ret, "statusTT", O["statusRetail"]), pct=True),
        bars("Status TT di konsumen", "Sebelum ditawari SPG hari ini", count(kon, "statusTT", O["statusKonsumen"]), pct=True),
        bars("Tahu TT dari mana", "Pembeli yang sudah tahu TT", count(ents, "tahuDari"), pct=True),
        bars("Alasan membeli", "", count(ents, "alasanBeli"), pct=True, tone="tt"),
        bars("Alasan tidak membeli", "", count(ents, "alasanTidak"), pct=True, tone="comp"),
    ]
    t2: dict = {}
    for e in ents:
        if e.get("tier2"):
            r = t2.setdefault(title_case(e["tier2"]), {"n": 0, "g": [], "c": []})
            r["n"] += 1
            if e.get("hargaGrosir"): r["g"].append(e["hargaGrosir"])
            if e.get("hargaEceran"): r["c"].append(e["hargaEceran"])
    p.append(table("Merek kompetitor yang sering dibeli / dihisap", "Diisi bebas oleh SPG · harga rata-rata yang dilaporkan",
                   ["Merek", "#Disebut", "#Harga grosir", "#Harga eceran"],
                   [[k, r["n"], rp(avg(r["g"])), rp(avg(r["c"]))] for k, r in sorted(t2.items(), key=lambda kv: -kv[1]["n"])[:12]], span=6))
    promos = [{**x, "grosir": s["header"].get("grosir")} for s in ss for x in ((s.get("sections") or {}).get("promos") or {}).get("items", [])]
    no_promo = len([s for s in ss if ((s.get("sections") or {}).get("promos") or {}).get("none")])
    p.append(bars("Aktivitas kompetitor di grosir", f"{len(promos)} catatan promo · {no_promo} laporan tanpa promo", count(promos, "aktivitas"), span=6, tone="comp"))
    pm: dict = defaultdict(int)
    for s in ss:
        for x in ((s.get("sections") or {}).get("promotors") or {}).get("items", []):
            pm[x.get("merek")] += int(x.get("jumlah") or 0)
    p.append(bars("Promotor kompetitor", "Total orang terlihat", sorted(pm.items(), key=lambda kv: -kv[1]), tone="comp"))
    p.append(observed(ss, brand, "Merek terlaris di grosir", 8))
    p.append(tipe_table(ret, "tipeToko", O["tipeToko"], "toko (retail)", "Toko ditemui", "Membeli", "statusTT"))
    return tiles, p


def horeca(ss: list[dict], ents: list[dict], variants: list[str], brand: str) -> tuple[list, list]:
    tried = [e for e in ents if e.get("sampel") and e.get("sampel") != "Tidak mencoba"]
    photo = [e for e in ents if isinstance(e.get("foto"), dict)]
    by_var = [(v, sum(int((e.get("beli") or {}).get(v) or 0) for e in ents), "tt") for v in variants]
    tiles = [
        tile("Venue disurvei", fmt(len(ss)), f"{len({str(s['header'].get('venue')).lower() for s in ss})} venue berbeda"),
        tile("Responden 18+", fmt(len(ents)), f"{pct(len([e for e in ents if e.get('statusTT') == 'BELUM']), len(ents))} belum tahu TT"),
        tile("Mencoba sampel", pct(len(tried), len(ents)), f"{len(tried)} responden"),
        tile("Membeli setelah mencoba", pct(len([e for e in tried if sum_variants(e.get('beli')) > 0]), len(tried)), "konversi trial → beli"),
        tile("Bungkus terjual", fmt(sum(r[1] for r in by_var)), "semua varian"),
        tile("Responden difoto", pct(len(photo), len(ents)), f"{len([e for e in ents if e.get('fotoSetuju') == 'TIDAK'])} tidak bersedia"),
    ]
    p = [
        bars("Status Tanda Tambah", "Funnel kesadaran → penggunaan", count(ents, "statusTT", O["statusHoreca"]), pct=True),
        bars("Penjualan per varian", "Bungkus dibeli responden", by_var),
        bars("Sampel yang dicoba", "", count(tried, "sampel"), pct=True, tone="tt"),
        bars("Kesan kekuatan rasa", "Setelah mencoba", count(tried, "kekuatan", O["kekuatan"]), pct=True),
        bars("Kesan asap", "Setelah mencoba", count(tried, "asap", O["asap"]), pct=True),
        bars("Alasan membeli", "", count(ents, "alasanBeli"), pct=True, tone="tt"),
        bars("Alasan tidak membeli", "", count(ents, "alasanTidak"), pct=True, tone="comp"),
        bars("Promo yang disukai", "", count(ents, "promo"), pct=True),
        bars("Rokok yang biasa dihisap", "Diisi bebas oleh SPG", count(ents, lambda e: title_case(e["rokokBiasa"]) if e.get("rokokBiasa") else None), pct=True, tone="comp"),
        bars("Usia responden", "", count(ents, "usia", O["usia"]), pct=True),
        bars("Tempat biasa beli rokok", "", count(ents, "tempatBeli"), pct=True),
        bars("Jenis venue", f"{fmt(sum(int((s.get('closing') or {}).get('korek') or 0) for s in ss))} korek diberikan", count([s["header"] for s in ss], "jenisVenue"), pct=True),
        observed(ss, brand, "Merek paling banyak dihisap di venue", 12),
        gallery("Foto SPG bersama responden", "Terbaru · hanya untuk verifikasi internal",
                photo_items(ents, "foto", lambda e: f"{e['_s']['_spg']} · {e['_s']['header'].get('venue')} · {str(e.get('at'))[:10]}")),
    ]
    return tiles, p


def reguler(ss: list[dict], ents: list[dict], variants: list[str], brand: str) -> tuple[list, list]:
    jual = [e for e in ents if e.get("statusOutlet") == "JUAL"]
    buyers = [e for e in ents if sum_variants(e.get("beli")) > 0]
    by_var = [(v, sum(int((e.get("beli") or {}).get(v) or 0) for e in ents), "tt") for v in variants]
    st = []
    for v in variants:
        c = {"ADA": 0, "KOSONG": 0, "TIDAK": 0}
        for e in jual:
            x = (e.get("stok") or {}).get(v)
            if x in c: c[x] += 1
        st.append((v, c))
    ada, kosong = sum(c["ADA"] for _, c in st), sum(c["KOSONG"] for _, c in st)
    f_tt = sum(float(e.get("facingTT") or 0) for e in ents); f_all = sum(float(e.get("facingTotal") or 0) for e in ents)
    prices = [e["hargaJual"] for e in jual if e.get("hargaJual")]
    tiles = [
        tile("Kunjungan outlet", fmt(len(ents)), f"{len({str(e.get('namaOutlet')).lower() for e in ents})} outlet berbeda · {len(ss)} rute"),
        tile("Outlet jual TT", pct(len(jual), len(ents)), "distribusi numerik"),
        tile("Strike rate order", pct(len(buyers), len(ents)), f"{len(buyers)} outlet order"),
        tile("Bungkus diorder", fmt(sum(r[1] for r in by_var)), "semua varian"),
        tile("Share of shelf", pct(f_tt, f_all), f"facing TT {fmt(f_tt)} dari {fmt(f_all)}"),
        tile("Stok kosong (OOS)", pct(kosong, ada + kosong), f"harga rata-rata {rp(avg(prices))}"),
    ]
    km: dict = {}
    for e in ents:
        if e.get("kompetitor"):
            r = km.setdefault(title_case(e["kompetitor"]), {"n": 0, "p": []})
            r["n"] += 1
            if e.get("hargaKompetitor"): r["p"].append(e["hargaKompetitor"])
    t = avg(prices)
    def diff(p):
        return "–" if not (p and t) else ("+" if t - p > 0 else "−") + rp(abs(t - p))
    p = [
        table("Ketersediaan per varian", "Outlet yang menjual TT · OOS = kosong ÷ (ada + kosong)", ["Varian", "#Ada", "#Kosong", "#Tidak jual", "#OOS"],
              [[v, c["ADA"], c["KOSONG"], c["TIDAK"], pct(c["KOSONG"], c["ADA"] + c["KOSONG"])] for v, c in st], span=6),
        bars("Order per varian", "Bungkus dipesan outlet", by_var, span=6),
        bars("Status TT di outlet", "", count(ents, "statusOutlet", O["statusOutlet"]), pct=True),
        bars("POSM Tanda Tambah", "", count(ents, "posm"), pct=True),
        bars("Alasan tidak order", "", count(ents, "alasanTidak"), pct=True, tone="comp"),
        bars("Promo kompetitor di outlet", "", count(ents, "promoKomp"), pct=True, tone="comp"),
        table("Kompetitor terlaris di outlet", f"{brand} rata-rata {rp(t)} · + berarti {brand} lebih mahal", ["Merek", "#Outlet", "#Harga eceran", "#Selisih harga TT"],
              [[k, r["n"], rp(avg(r["p"])), diff(avg(r["p"]))] for k, r in sorted(km.items(), key=lambda kv: -kv[1]["n"])[:10]], span=8),
        tipe_table(ents, "tipeOutlet", O["tipeOutlet"], "outlet", "Kunjungan", "Order", "statusOutlet", sos=True),
        gallery("Foto rak / display terbaru", "", photo_items(ents, "fotoDisplay", lambda e: f"{e.get('namaOutlet')} · {e['_s']['_spg']} · {str(e.get('at'))[:10]}")),
    ]
    return tiles, p


def observed(ss: list[dict], brand: str, title: str, span: int) -> dict:
    m: dict = defaultdict(float)
    for s in ss:
        for t in (s.get("closing") or {}).get("terlaris") or []:
            m[t["merek"]] += float(t.get("batang") or 0)
    bk = brand.lower()
    return bars(title, "Pengamatan SPG, jumlah batang", [(k, int(n), "tt" if bk in k.lower() else "comp") for k, n in sorted(m.items(), key=lambda kv: -kv[1])], span=span)


def tipe_table(items: list[dict], key: str, order: list, word: str, n_label: str, buy_label: str, status_key: str, sos: bool = False) -> dict:
    m: dict = {}
    for e in items:
        r = m.setdefault(e.get(key), {"n": 0, "jual": 0, "buy": 0, "bks": 0, "ft": 0.0, "fa": 0.0})
        r["n"] += 1
        if e.get(status_key) == "JUAL": r["jual"] += 1
        p = sum_variants(e.get("beli"))
        if p: r["buy"] += 1; r["bks"] += p
        r["ft"] += float(e.get("facingTT") or 0); r["fa"] += float(e.get("facingTotal") or 0)
    cols = ["Tipe", "#" + n_label, "#Sudah jual TT", "#" + buy_label, "#Konversi", "#Bungkus"] + (["#Share of shelf"] if sos else [])
    rows = [[{"text": t, "tipe": t}, r["n"], pct(r["jual"], r["n"]), r["buy"], pct(r["buy"], r["n"]), fmt(r["bks"])] + ([pct(r["ft"], r["fa"])] if sos else [])
            for t in order if (r := m.get(t))]
    return table(f"Per tipe {word}", "Klik tipe untuk menyaring seluruh dashboard", cols, rows)


def spg_table(ss: list[dict], ents: list[dict], t: str, brand: str) -> dict:
    per: dict = {}
    for s in ss:
        per.setdefault(s["_spg"], {"lap": 0, "k": 0, "b": 0, "bks": 0})["lap"] += 1
    for e in ents:
        r = per.get(e["_s"]["_spg"])
        if r:
            r["k"] += 1
            p = sum_variants(e.get("beli"))
            if p: r["b"] += 1; r["bks"] += p
    w = "Order" if t == "REGULER" else "Membeli"
    return table(f"Kinerja SPG · {TYPES[t]}", f"Kontak = {FORMS[t]['entry_word']}; konversi = kontak yang {w.lower()} {brand}. SPG dengan beberapa tugas muncul di tiap kategori.",
                 ["SPG", "#Laporan", "#Kontak", "#Kontak / laporan", "#" + w, "#Konversi", "#Bungkus"],
                 [[n, r["lap"], r["k"], f"{r['k'] / r['lap']:.1f}".replace(".", ","), r["b"], pct(r["b"], r["k"]), fmt(r["bks"])]
                  for n, r in sorted(per.items(), key=lambda kv: -kv[1]["bks"])])


def spv_recap(db: Session, me: User, days: int) -> dict:
    """Admin pusat: rekap per supervisor (semua kategori)."""
    spvs = active_spvs(db)
    snaps, _ = load_approved(db, me, Filters(days=days), all_types=True)
    pending = db.scalars(select(Report).where(Report.status == "SUBMITTED")).all()
    def loc_r(r: Report): return (r.data.get("header") or {}).get(FORMS[r.type]["location_field"])
    rows = []
    for v in spvs:
        area = [s for s in snaps if covers(v, loc_of(s, s["type"]))]
        rows.append([v.name, ", ".join(c.label for c in active_items(v)) or "belum ada wilayah", len(area),
                     len([s for s in area if s["_by"] == v.name]), len([r for r in pending if covers(v, loc_r(r))]), len({s["_spg"] for s in area})])
    none = [s for s in snaps if not spvs_for(spvs, loc_of(s, s["type"]))]
    rows.append(["Tanpa SPV", "ditangani admin pusat", len(none), "–", len([r for r in pending if not spvs_for(spvs, loc_r(r))]), len({s["_spg"] for s in none})])
    return table("Rekap per supervisor wilayah", f"Semua kategori · {days} hari · laporan dihitung menurut kecamatan lokasinya",
                 ["Supervisor", "Wilayah", "#Laporan disetujui", "#Disetujui sendiri", "#Menunggu", "#SPG"], rows)


def build(db: Session, me: User, f: Filters) -> dict:
    s = app_settings(db)
    brand, variants = s["brand"], s["variants"]
    reports, trunc = load_approved(db, me, f)
    ss, ents = scope(reports, f)
    spg_names = sorted({r["_spg"] for r in reports} | {u.name for u in db.scalars(select(User).where(User.role == "SPG")) if f.type in (u.tugas or [])})
    head = {"title": "Dashboard " + ("Survei HORECA" if f.type == "HORECA" else "SPG " + TYPES[f.type]), "reports": len(ss), "truncated": trunc,
            "spgOptions": spg_names, "tipeOptions": O["tipeToko"] if f.type == "GROSIR" else O["tipeOutlet"] if f.type == "REGULER" else [],
            "coverage": [c.label for c in active_items(me)] if me.role == "SPV" else None}
    if not ss:
        return {**head, "tiles": [], "panels": [spv_recap(db, me, f.days)] if me.role == "ADMIN" else []}
    tiles, panels = {"GROSIR": grosir, "HORECA": horeca, "REGULER": reguler}[f.type](ss, ents, variants, brand)
    el = FORMS[f.type]["entry_location"]
    panels.append(geo_table(ents, el, {"GROSIR": "Pembeli", "HORECA": "Domisili responden", "REGULER": "Kunjungan outlet"}[f.type], "Order" if f.type == "REGULER" else "Membeli", f))
    panels.append(spg_table(ss, ents, f.type, brand))
    if me.role == "ADMIN":
        panels.append(spv_recap(db, me, f.days))
    return {**head, "tiles": tiles, "panels": panels}


def export_rows(db: Session, me: User, f: Filters) -> tuple[list[str], list[list]]:
    """Baris CSV: satu baris per pembeli/responden/kunjungan outlet yang lolos filter."""
    reports, _ = load_approved(db, me, f)
    ss, ents = scope(reports, f)
    q = [x for x in FORMS[f.type]["entry"] if x["type"] not in ("photo",)]
    variants = app_settings(db)["variants"]
    cols = ["tanggal", "spg", "lokasi_laporan", "kecamatan_laporan", "kab_kota"]
    for x in q:
        cols += [f"{x['id']}_{v}" for v in variants] if x["type"] in ("variants", "stok") else [x["id"]]
    rows = []
    for e in ents:
        s = e["_s"]; loc = loc_of(s, f.type) or {}
        row = [s.get("date"), s["_spg"], s["header"].get(FORMS[f.type]["title_field"]) or "", kec_name(loc), loc.get("kab", "") if isinstance(loc, dict) else ""]
        for x in q:
            v = e.get(x["id"])
            if x["type"] in ("variants", "stok"):
                row += [(v or {}).get(k, "") for k in variants]
            else:
                row.append(kec_name(v) if x["type"] == "kecamatan" else ("ya" if v is True else v if v is not None else ""))
        rows.append(row)
    return cols, rows
