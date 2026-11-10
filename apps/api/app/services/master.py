"""Pengaturan aplikasi (merek, varian, daftar grosir) dan master wilayah."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Kabupaten, Kecamatan, Setting

DEFAULT_APP = {"brand": "Tanda Tambah", "variants": ["Original", "Watermelon", "Guava"], "grosirs": []}


def app_settings(db: Session) -> dict:
    s = db.get(Setting, "app")
    return {**DEFAULT_APP, **(s.value if s else {})}


def save_app_settings(db: Session, value: dict) -> dict:
    s = db.get(Setting, "app")
    if s:
        s.value = value
    else:
        db.add(Setting(key="app", value=value))
    return value


def short_kab(n: str) -> str:
    return n.replace("Kabupaten Administrasi ", "Kab. Adm. ").replace("Kabupaten ", "Kab. ").replace("Kota Administrasi ", "Kota Adm. ")


def kec_obj(k: Kecamatan) -> dict:
    return {"kode": k.kode, "nama": k.nama, "kab": k.kab.nama, "kabKode": k.kab_kode, "prov": k.kab.provinsi, "provKode": k.kab.prov_kode}


def kec_lookup(db: Session):
    cache: dict[str, dict | None] = {}

    def get(kode: str) -> dict | None:
        if kode not in cache:
            k = db.get(Kecamatan, kode)
            cache[kode] = kec_obj(k) if k and k.active else None
        return cache[kode]
    return get


def all_wilayah(db: Session, include_inactive: bool = False) -> list[dict]:
    kabs = db.scalars(select(Kabupaten).order_by(Kabupaten.kode)).all()
    q = select(Kecamatan).order_by(Kecamatan.kode)
    if not include_inactive:
        q = q.where(Kecamatan.active.is_(True))
    by: dict[str, list] = {}
    for c in db.scalars(q):
        by.setdefault(c.kab_kode, []).append({"kode": c.kode, "nama": c.nama, **({"nonaktif": True} if not c.active else {}), **({"manual": True} if c.manual else {})})
    return [{"kode": k.kode, "nama": k.nama, "provKode": k.prov_kode, "provinsi": k.provinsi, "manual": k.manual, "kecamatan": by.get(k.kode, [])} for k in kabs]
