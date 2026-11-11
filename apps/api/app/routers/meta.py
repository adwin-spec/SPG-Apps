"""Form, pengaturan, dan master wilayah."""
import copy

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..services.dashboard import invalidate_cache
from ..deps import audit, current_user, ok, require
from ..errors import ApiError
from ..forms import FORMS, O, TYPES
from ..models import Kabupaten, Kecamatan, User
from ..services.formengine import norm, title_case
from ..services.access import active_items, active_spvs
from ..services.master import all_wilayah, app_settings, save_app_settings

router = APIRouter(tags=["master"])


def _json_q(qs: list[dict]) -> list[dict]:
    """Ubah tuple pilihan ("KODE","Label") menjadi list agar bisa dikirim sebagai JSON."""
    out = copy.deepcopy(qs)
    def fix(o):
        if isinstance(o, tuple):
            return list(o)
        if isinstance(o, list):
            return [fix(x) for x in o]
        if isinstance(o, dict):
            return {k: fix(v) for k, v in o.items()}
        return o
    return [fix(q) for q in out]


@router.get("/forms")
def forms(_: User = Depends(current_user), db: Session = Depends(get_db)):
    s = app_settings(db)
    out = {}
    for t, f in FORMS.items():
        out[t] = {**{k: v for k, v in f.items() if k not in ("start", "entry", "sections", "closing")},
                  "start": _json_q(f["start"]), "entry": _json_q(f["entry"]), "closing": _json_q(f["closing"]),
                  "sections": [{**sec, "questions": _json_q(sec["questions"])} for sec in f["sections"]]}
    # Nama supervisor + wilayahnya, agar SPG tahu siapa yang akan menyetujui laporan sejak memilih kecamatan.
    spvs = [{"name": v.name, "cover": [{"level": c.level, "kode": c.kode} for c in active_items(v)]} for v in active_spvs(db)]
    return ok({"types": TYPES, "forms": out, "settings": s, "supervisors": spvs,
               "options": {k: [list(x) if isinstance(x, tuple) else x for x in v] for k, v in O.items()}})


@router.get("/settings")
def get_settings(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return ok(app_settings(db))


class SettingsIn(BaseModel):
    brand: str = Field(min_length=1, max_length=80)
    variants: list[str] = Field(min_length=1, max_length=20)
    grosirs: list[str] = Field(default_factory=list, max_length=2000)


@router.put("/settings")
def put_settings(body: SettingsIn, u: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    variants, seen = [], set()
    for v in body.variants:
        v = title_case(v)[:40]
        if v and v.lower() not in seen:
            seen.add(v.lower()); variants.append(v)
    if not variants:
        raise ApiError(422, "VALIDATION_ERROR", "Minimal satu varian")
    grosirs = sorted({title_case(g)[:120] for g in body.grosirs if norm(g)})
    val = save_app_settings(db, {"brand": norm(body.brand), "variants": variants, "grosirs": grosirs})
    audit(db, u, "UPDATE", "settings", "app", val)
    db.commit(); invalidate_cache()
    return ok(val)


@router.get("/wilayah")
def wilayah(include_inactive: bool = False, u: User = Depends(current_user), db: Session = Depends(get_db)):
    return ok(all_wilayah(db, include_inactive and u.role == "ADMIN"))


class KabIn(BaseModel):
    prov_kode: str = Field(min_length=2, max_length=8)
    nama: str = Field(min_length=3, max_length=120)


@router.post("/wilayah/kabupaten")
def add_kab(body: KabIn, u: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    prov = db.scalar(select(Kabupaten).where(Kabupaten.prov_kode == body.prov_kode).limit(1))
    if not prov:
        raise ApiError(404, "NOT_FOUND", "Provinsi tidak dikenal")
    nama = title_case(body.nama)
    if db.scalar(select(func.count()).where(Kabupaten.prov_kode == body.prov_kode, func.lower(Kabupaten.nama) == nama.lower())):
        raise ApiError(409, "DUPLICATE", "Kabupaten/kota sudah ada")
    n = db.scalar(select(func.count()).where(Kabupaten.prov_kode == body.prov_kode, Kabupaten.manual.is_(True))) + 1
    k = Kabupaten(kode=f"{body.prov_kode}.X{n:02d}", nama=nama, prov_kode=body.prov_kode, provinsi=prov.provinsi, manual=True)
    db.add(k); audit(db, u, "CREATE", "kabupaten", k.kode, {"nama": nama}); db.commit()
    return ok({"kode": k.kode})


class KecIn(BaseModel):
    kab_kode: str
    nama: str = Field(min_length=3, max_length=120)


@router.post("/wilayah/kecamatan")
def add_kec(body: KecIn, u: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    if not db.get(Kabupaten, body.kab_kode):
        raise ApiError(404, "NOT_FOUND", "Kabupaten/kota tidak dikenal")
    nama = title_case(body.nama)
    if db.scalar(select(func.count()).where(Kecamatan.kab_kode == body.kab_kode, func.lower(Kecamatan.nama) == nama.lower())):
        raise ApiError(409, "DUPLICATE", "Kecamatan sudah ada di kab/kota ini")
    n = db.scalar(select(func.count()).where(Kecamatan.kab_kode == body.kab_kode, Kecamatan.manual.is_(True))) + 1
    c = Kecamatan(kode=f"{body.kab_kode}.X{n:02d}", kab_kode=body.kab_kode, nama=nama, manual=True)
    db.add(c); audit(db, u, "CREATE", "kecamatan", c.kode, {"nama": nama}); db.commit()
    return ok({"kode": c.kode})


class KecPatch(BaseModel):
    nama: str | None = Field(default=None, min_length=3, max_length=120)
    active: bool | None = None


@router.patch("/wilayah/kecamatan/{kode}")
def patch_kec(kode: str, body: KecPatch, u: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    c = db.get(Kecamatan, kode)
    if not c:
        raise ApiError(404, "NOT_FOUND", "Kecamatan tidak ditemukan")
    before = {"nama": c.nama, "active": c.active}
    if body.nama is not None:
        c.nama = title_case(body.nama)
    if body.active is not None:
        c.active = body.active
    audit(db, u, "UPDATE", "kecamatan", kode, {"before": before, "after": {"nama": c.nama, "active": c.active}})
    db.commit()
    return ok({"kode": c.kode, "nama": c.nama, "active": c.active})
