"""Akun SPG, supervisor, dan admin. Hanya admin pusat yang membuat/mengubah akun dan wilayah supervisor."""
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..services.dashboard import invalidate_cache
from ..deps import audit, current_user, ok, require
from ..errors import ApiError
from ..forms import TYPES
from ..models import Coverage, Kabupaten, Kecamatan, User
from ..security import hash_password, now
from ..services.access import active_items
from ..services.master import short_kab
from ..services.formengine import title_case
from .auth import user_out

router = APIRouter(prefix="/users", tags=["users"])
USERNAME = re.compile(r"^[a-z0-9._-]{3,40}$")


def _tugas(t: list[str]) -> list[str]:
    return [k for k in TYPES if k in set(t or [])]


def _overlaps(db: Session, u: User) -> dict[str, list[str]]:
    """Wilayah yang juga dipegang supervisor lain (peringatan, bukan larangan)."""
    others = db.scalars(select(User).where(User.role == "SPV", User.active.is_(True), User.id != u.id).options(selectinload(User.coverage))).all()
    res: dict[str, list[str]] = {}
    for c in active_items(u):
        names = []
        for o in others:
            for x in active_items(o):
                kab_c = c.kode if c.level == "KAB" else c.kode.rsplit(".", 1)[0]
                kab_x = x.kode if x.level == "KAB" else x.kode.rsplit(".", 1)[0]
                if x.kode == c.kode or (c.level == "KAB" and kab_x == c.kode) or (x.level == "KAB" and kab_c == x.kode):
                    names.append(o.name); break
        if names:
            res[c.id] = names
    return res


@router.get("")
def list_users(role: str | None = None, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    q = select(User).options(selectinload(User.coverage)).order_by(User.role, User.name)
    if me.role == "SPV":
        q = q.where(User.role == "SPG")
    elif role:
        q = q.where(User.role == role)
    out = []
    for u in db.scalars(q):
        d = user_out(u)
        if u.role == "SPV" and me.role == "ADMIN":
            d["overlaps"] = _overlaps(db, u)
        out.append(d)
    return ok(out)


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(pattern="^(ADMIN|SPV|SPG)$")
    tugas: list[str] = Field(default_factory=list)
    area: str | None = Field(default=None, max_length=120)


@router.post("")
def create_user(body: UserIn, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    uname = body.username.strip().lower()
    if not USERNAME.match(uname):
        raise ApiError(422, "VALIDATION_ERROR", "Username 3–40 karakter: huruf kecil, angka, titik, minus, garis bawah")
    if db.scalar(select(User).where(User.username == uname)):
        raise ApiError(409, "DUPLICATE", "Username sudah dipakai")
    tg = _tugas(body.tugas)
    if body.role == "SPG" and not tg:
        raise ApiError(422, "VALIDATION_ERROR", "SPG harus punya minimal satu tugas")
    u = User(username=uname, name=title_case(body.name), password_hash=hash_password(body.password), role=body.role,
             tugas=tg if body.role == "SPG" else [], area=body.area)
    db.add(u); db.flush()
    audit(db, me, "CREATE", "user", u.id, {"username": uname, "role": body.role, "tugas": tg})
    db.commit(); db.refresh(u)
    return ok(user_out(u))


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    tugas: list[str] | None = None
    area: str | None = Field(default=None, max_length=120)
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


@router.patch("/{uid}")
def patch_user(uid: str, body: UserPatch, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    if not u:
        raise ApiError(404, "NOT_FOUND", "Akun tidak ditemukan")
    changes: dict = {}
    if body.name is not None:
        u.name = title_case(body.name); changes["name"] = u.name
    if body.area is not None:
        u.area = body.area or None; changes["area"] = u.area
    if body.tugas is not None:
        tg = _tugas(body.tugas)
        if u.role == "SPG" and not tg:
            raise ApiError(422, "VALIDATION_ERROR", "SPG harus punya minimal satu tugas")
        u.tugas = tg; changes["tugas"] = tg
    if body.active is not None and body.active != u.active:
        if u.id == me.id:
            raise ApiError(422, "VALIDATION_ERROR", "Tidak bisa menonaktifkan akun sendiri")
        u.active = body.active; u.deactivated_at = None if body.active else now(); u.token_version += 1
        changes["active"] = u.active
    if body.password:
        u.password_hash = hash_password(body.password); u.token_version += 1; changes["password"] = "direset"
    audit(db, me, "UPDATE", "user", u.id, changes)
    db.commit()
    return ok(user_out(u))


class CoverageIn(BaseModel):
    level: str = Field(pattern="^(KAB|KEC)$")
    kode: str = Field(min_length=2, max_length=32)


@router.post("/{uid}/coverage")
def add_coverage(uid: str, body: CoverageIn, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    if not u or u.role != "SPV":
        raise ApiError(404, "NOT_FOUND", "Supervisor tidak ditemukan")
    items = active_items(u)
    if body.level == "KAB":
        k = db.get(Kabupaten, body.kode)
        if not k:
            raise ApiError(404, "NOT_FOUND", "Kabupaten/kota tidak dikenal")
        if any(c.level == "KAB" and c.kode == k.kode for c in items):
            raise ApiError(409, "DUPLICATE", "Kab/kota ini sudah termasuk wilayahnya")
        for c in items:  # kecamatan di dalamnya digantikan cakupan kab/kota
            if c.level == "KEC" and c.kode.startswith(k.kode + "."):
                c.until = now()
        label = f"{short_kab(k.nama)} (seluruh)"
    else:
        c = db.get(Kecamatan, body.kode)
        if not c:
            raise ApiError(404, "NOT_FOUND", "Kecamatan tidak dikenal")
        if any((x.level == "KEC" and x.kode == c.kode) or (x.level == "KAB" and x.kode == c.kab_kode) for x in items):
            raise ApiError(409, "DUPLICATE", "Kecamatan ini sudah termasuk wilayahnya")
        label = f"Kec. {c.nama} · {short_kab(c.kab.nama)}"
    cov = Coverage(spv_id=u.id, level=body.level, kode=body.kode, label=label, since=now())
    db.add(cov)
    audit(db, me, "ADD_COVERAGE", "user", u.id, {"level": body.level, "kode": body.kode})
    db.commit(); invalidate_cache(); db.refresh(u)
    return ok(user_out(u))


@router.delete("/{uid}/coverage/{cid}")
def remove_coverage(uid: str, cid: str, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    c = db.get(Coverage, cid)
    if not c or c.spv_id != uid or c.until:
        raise ApiError(404, "NOT_FOUND", "Wilayah tidak ditemukan")
    c.until = now()  # tidak dihapus: riwayat menjaga keabsahan persetujuan lama
    audit(db, me, "REMOVE_COVERAGE", "user", uid, {"kode": c.kode})
    db.commit(); invalidate_cache()
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    return ok(user_out(u))
