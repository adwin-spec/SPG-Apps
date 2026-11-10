"""Data contoh untuk demo dan log audit (admin pusat)."""
import random
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, ok, require
from ..forms import O, TYPES
from ..models import Approval, AuditLog, Kecamatan, User
from ..services.formengine import sum_variants, val
from ..services.master import app_settings, kec_obj

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/samples")
def load_samples(n: int = Query(60, ge=3, le=600), me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    """Laporan contoh bernama fiktif, langsung berstatus disetujui dan ditandai `sample` agar bisa dihapus."""
    rnd = random.Random()
    s = app_settings(db); variants, brand = s["variants"], s["brand"]
    kecs = [kec_obj(k) for k in db.scalars(select(Kecamatan).where(Kecamatan.kab_kode.in_(["33.01", "33.02", "33.03", "33.04"]), Kecamatan.active.is_(True)))]
    if not kecs:
        kecs = [kec_obj(k) for k in db.scalars(select(Kecamatan).where(Kecamatan.active.is_(True)).limit(40))]
    pick = rnd.choice
    comp = ["Camel Purple", "L.A Lights", "Sampoerna Mild", "Gudang Garam Filter", "Djarum Super", "Surya 16"]
    spg = {"GROSIR": ["SPG Contoh Grosir 1", "SPG Contoh Grosir 2"], "HORECA": ["SPG Contoh Grosir 1", "SPG Contoh HORECA 1"], "REGULER": ["SPG Contoh Reguler 1", "SPG Contoh Reguler 2"]}
    buy = lambda p: {v: (1 + rnd.randrange(4)) if rnd.random() < p else 0 for v in variants}
    types = list(TYPES)
    for i in range(n):
        t = types[i % 3]
        start = datetime.now(UTC) - timedelta(days=rnd.randrange(28), hours=2 + rnd.random() * 6)
        at = start.isoformat(); ents = []
        for k in range(4 + rnd.randrange(8)):
            if t == "GROSIR":
                jenis = "RETAIL" if rnd.random() < 0.6 else "KONSUMEN"
                st = val(pick(O["statusRetail"] if jenis == "RETAIL" else O["statusKonsumen"])); b = buy(0.25 if st == "BELUM" else 0.5)
                e = {"jenis": jenis, "kecamatan": pick(kecs), "statusTT": st, "beli": b, "kupon": rnd.randrange(3) if sum_variants(b) else 0,
                     "tier2": pick(comp), "hargaGrosir": 22000 + rnd.randrange(10) * 500, "at": at}
                if jenis == "RETAIL": e |= {"tipeToko": pick(O["tipeToko"]), "namaToko": f"Toko Contoh {i * 10 + k}", "hargaEceran": 25000 + rnd.randrange(8) * 500}
                if st != "BELUM": e["tahuDari"] = pick(O["tahuDariGrosir"])
                e["alasanBeli" if sum_variants(b) else "alasanTidak"] = pick(O[("alasanBeli" if sum_variants(b) else "alasanTidak") + ("Retail" if jenis == "RETAIL" else "Konsumen")])
            elif t == "HORECA":
                st = val(pick(O["statusHoreca"])); sampel = pick(variants + ["Lebih dari 1 varian"]) if rnd.random() < 0.85 else "Tidak mencoba"
                b = buy(0 if sampel == "Tidak mencoba" else 0.35); setuju = "YA" if rnd.random() < 0.75 else "TIDAK"
                e = {"dewasa": True, "usia": pick(O["usia"]), "domisili": pick(kecs), "rokokBiasa": pick(comp), "tempatBeli": pick(O["tempatBeli"]), "rasa": pick(O["rasaDisukai"]),
                     "statusTT": st, "alasan": pick(O["alasanPengguna"] if st in ("BARU", "LAMA") else O["alasanBerhenti"] if st == "BERHENTI" else O["alasanBelumCoba"]),
                     "sampel": sampel, "beli": b, "promo": pick(O["promoDisukai"]), "fotoSetuju": setuju, "at": at}
                if st != "BELUM": e["tahuDari"] = pick(O["tahuDariHoreca"])
                if sampel != "Tidak mencoba": e |= {"kekuatan": pick(["Pas", "Pas", "Terlalu ringan", "Terlalu kuat"]), "asap": pick(O["asap"])}
                e["alasanBeli" if sum_variants(b) else "alasanTidak"] = pick(O["alasanBeliHoreca" if sum_variants(b) else "alasanTidakHoreca"])
                if setuju == "YA": e["foto"] = {"sample": True}
            else:
                so = "JUAL" if rnd.random() < 0.65 else pick(["PERNAH", "BELUM"]); j = so == "JUAL"; b = buy(0.45 if j else 0.12)
                e = {"namaOutlet": f"Outlet Contoh {i * 10 + k}", "tipeOutlet": pick(O["tipeOutlet"]), "kecOutlet": pick(kecs), "statusOutlet": so,
                     "facingTotal": 20 + rnd.randrange(60), "posm": pick(O["posm"]), "beli": b, "kompetitor": pick(comp),
                     "hargaKompetitor": 23000 + rnd.randrange(10) * 500, "promoKomp": pick(O["promoKompOutlet"]), "at": at}
                if j: e |= {"stok": {v: "ADA" if rnd.random() < 0.68 else pick(["KOSONG", "TIDAK"]) for v in variants}, "hargaJual": 24000 + rnd.randrange(7) * 500, "facingTT": rnd.randrange(8)}
                if not sum_variants(b): e["alasanTidak"] = pick(O["alasanTidakOrder"])
                if rnd.random() < 0.6: e["fotoDisplay"] = {"sample": True}
            ents.append(e)
        home = pick(kecs)
        terl = [{"merek": m, "batang": 4 + rnd.randrange(20)} for m in dict.fromkeys([pick(comp), pick(comp), brand])]
        header = {"GROSIR": {"grosir": pick(["Grosir Makmur", "Grosir Sumber Rejeki", "Grosir Abadi"]), "kecGrosir": home},
                  "HORECA": {"venue": pick(["Kopi Senja", "Warkop Mbak Ning", "Angkringan Pojok", "Cafe Kopi Kita"]), "alamat": "Alamat contoh", "kecVenue": home,
                             "jenisVenue": pick(O["jenisVenue"]), "kebijakan": pick(O["kebijakan"])},
                  "REGULER": {"rute": f"Rute Contoh {home['nama']}", "kecRute": home}}[t]
        promos = [{"merek": pick(comp), "aktivitas": pick(O["aktivitasKompetitor"]), "sejak": pick(O["sejak"])}] if t == "GROSIR" and rnd.random() < 0.6 else []
        prom = [{"merek": pick(comp), "jumlah": 1 + rnd.randrange(2), "aktivitas": pick(O["aktivitasPromotor"])}] if t == "GROSIR" and rnd.random() < 0.4 else []
        sections = {"promos": {"none": not promos, "items": promos}, "promotors": {"none": not prom, "items": prom}} if t == "GROSIR" else {}
        closing = {"REGULER": {}, "GROSIR": {"terlaris": terl, "pic": "PIC Contoh"}, "HORECA": {"terlaris": terl, "pic": "PIC Contoh", "korek": rnd.randrange(10)}}[t]
        d = (start + timedelta(hours=7)).date()
        rid = str(uuid.uuid4())
        db.add(Approval(report_id=rid, type=t, date=d, loc_kode=home["kode"], spg_id=None, spg_name=pick(spg[t]), approver_id=me.id, approver_name="Admin pusat",
                        approver_role="ADMIN", sample=True, snapshot={"type": t, "date": d.isoformat(), "startedAt": at, "header": header, "entries": ents, "sections": sections, "closing": closing}))
    audit(db, me, "LOAD_SAMPLES", "approvals", None, {"n": n})
    db.commit()
    return ok({"created": n})


@router.delete("/samples")
def clear_samples(me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    r = db.execute(delete(Approval).where(Approval.sample.is_(True)))
    audit(db, me, "CLEAR_SAMPLES", "approvals", None, {"deleted": r.rowcount})
    db.commit()
    return ok({"deleted": r.rowcount})


@router.get("/audit")
def audit_log(limit: int = Query(200, le=1000), me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()
    names = {u.id: u.name for u in db.scalars(select(User))}
    return ok([{"at": a.at.isoformat(), "user": names.get(a.user_id, "–"), "action": a.action, "entity": a.entity, "entityId": a.entity_id, "detail": a.detail} for a in rows])
