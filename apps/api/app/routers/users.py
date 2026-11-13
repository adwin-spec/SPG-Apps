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
def list_users(role: str | None = None, deleted: bool = False, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    """Akun aktif/nonaktif. `deleted=1` (admin): akun yang sudah dihapus, untuk dipulihkan."""
    q = select(User).options(selectinload(User.coverage)).order_by(User.role, User.name)
    q = q.where(User.deleted_at.is_not(None) if deleted and me.role == "ADMIN" else User.deleted_at.is_(None))
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
    areas: list[str] = Field(default_factory=list, max_length=200)   # kode kab/kota yang dicentang


def _areas(db: Session, kodes: list[str]) -> list[dict]:
    """Kode kab/kota → [{kode, nama}] (urut sesuai master). Kode yang tidak dikenal ditolak."""
    kodes = list(dict.fromkeys(k for k in kodes if k))
    if not kodes:
        return []
    found = {k.kode: k for k in db.scalars(select(Kabupaten).where(Kabupaten.kode.in_(kodes)))}
    bad = [k for k in kodes if k not in found]
    if bad:
        raise ApiError(422, "VALIDATION_ERROR", f"Kabupaten/kota tidak dikenal: {', '.join(bad[:3])}")
    return [{"kode": k, "nama": short_kab(found[k].nama)} for k in sorted(kodes)]


def _area_text(areas: list[dict]) -> str | None:
    names = [a["nama"] for a in areas]
    if not names:
        return None
    t = ", ".join(names)
    return t if len(t) <= 120 else ", ".join(names[:3]) + f" +{len(names) - 3} lainnya"


def _add_kab(db: Session, u: User, k: Kabupaten) -> Coverage | None:
    items = active_items(u)
    if any(c.level == "KAB" and c.kode == k.kode for c in items):
        return None
    for c in items:  # kecamatan di dalamnya digantikan cakupan kab/kota
        if c.level == "KEC" and c.kode.startswith(k.kode + "."):
            c.until = now()
    cov = Coverage(spv_id=u.id, level="KAB", kode=k.kode, label=f"{short_kab(k.nama)} (seluruh)", since=now())
    db.add(cov); u.coverage.append(cov)
    return cov


@router.post("")
def create_user(body: UserIn, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    uname = body.username.strip().lower()
    if not USERNAME.match(uname):
        raise ApiError(422, "VALIDATION_ERROR", "Username 3–40 karakter: huruf kecil, angka, titik, minus, garis bawah")
    old = db.scalar(select(User).where(User.username == uname))
    if old:
        raise ApiError(409, "DUPLICATE", "Username ini milik akun yang sudah dihapus – pulihkan akun itu atau pakai username lain"
                       if old.deleted_at else "Username sudah dipakai")
    tg = _tugas(body.tugas)
    if body.role == "SPG" and not tg:
        raise ApiError(422, "VALIDATION_ERROR", "SPG harus punya minimal satu tugas")
    areas = _areas(db, body.areas)
    u = User(username=uname, name=title_case(body.name), password_hash=hash_password(body.password), role=body.role,
             tugas=tg if body.role == "SPG" else [], area=_area_text(areas) or body.area, areas=areas, coverage=[])
    db.add(u); db.flush()
    if body.role == "SPV":  # supervisor: kab/kota yang dicentang langsung menjadi wilayah persetujuannya
        for a in areas:
            _add_kab(db, u, db.get(Kabupaten, a["kode"]))
    audit(db, me, "CREATE", "user", u.id, {"username": uname, "role": body.role, "tugas": tg, "areas": [a["kode"] for a in areas]})
    db.commit(); invalidate_cache(); db.refresh(u)
    return ok(user_out(u))


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=120)
    tugas: list[str] | None = None
    area: str | None = Field(default=None, max_length=120)
    active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)
    areas: list[str] | None = Field(default=None, max_length=200)


@router.patch("/{uid}")
def patch_user(uid: str, body: UserPatch, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    if not u or u.deleted_at:
        raise ApiError(404, "NOT_FOUND", "Akun tidak ditemukan")
    changes: dict = {}
    if body.areas is not None:
        u.areas = _areas(db, body.areas); u.area = _area_text(u.areas); changes["areas"] = [a["kode"] for a in u.areas]
        if u.role == "SPV":  # samakan wilayah persetujuan tingkat kab/kota dengan centang
            want = {a["kode"] for a in u.areas}
            for c in active_items(u):
                if c.level == "KAB" and c.kode not in want:
                    c.until = now()
            for a in u.areas:
                _add_kab(db, u, db.get(Kabupaten, a["kode"]))
            invalidate_cache()
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
        if not _add_kab(db, u, k):
            raise ApiError(409, "DUPLICATE", "Kab/kota ini sudah termasuk wilayahnya")
        if not any(a["kode"] == k.kode for a in (u.areas or [])):
            u.areas = sorted([*(u.areas or []), {"kode": k.kode, "nama": short_kab(k.nama)}], key=lambda a: a["kode"]); u.area = _area_text(u.areas)
        audit(db, me, "ADD_COVERAGE", "user", u.id, {"level": "KAB", "kode": k.kode})
        db.commit(); invalidate_cache(); db.refresh(u)
        return ok(user_out(u))
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


@router.delete("/{uid}")
def delete_user(uid: str, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    """Hapus akun SPG/supervisor/admin. Akun diarsipkan (bukan dibuang): tidak bisa masuk, hilang dari daftar,
    wilayah supervisornya dilepas – tetapi laporan, persetujuan, dan riwayatnya tetap utuh. Bisa dipulihkan."""
    from ..models import RefreshToken, Report
    from sqlalchemy import func, update
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    if not u or u.deleted_at:
        raise ApiError(404, "NOT_FOUND", "Akun tidak ditemukan")
    if u.id == me.id:
        raise ApiError(422, "VALIDATION_ERROR", "Tidak bisa menghapus akun sendiri")
    t = now()
    u.deleted_at, u.active, u.deactivated_at, u.token_version = t, False, t, u.token_version + 1
    db.execute(update(RefreshToken).where(RefreshToken.user_id == u.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=t))
    released = [c.label for c in active_items(u)]
    for c in active_items(u):
        c.until = t
    n_rep = db.scalar(select(func.count()).select_from(Report).where(Report.spg_id == u.id)) or 0
    n_open = db.scalar(select(func.count()).select_from(Report).where(Report.spg_id == u.id, Report.status.in_(("DRAFT", "REVISION")))) or 0
    audit(db, me, "DELETE_USER", "user", u.id, {"username": u.username, "name": u.name, "role": u.role, "reports": n_rep, "released": released})
    db.commit(); invalidate_cache()
    return ok({**user_out(u), "reports": n_rep, "openReports": n_open, "released": released})


@router.post("/{uid}/restore")
def restore_user(uid: str, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    """Pulihkan akun yang dihapus (aktif lagi dengan password lama). Wilayah supervisor perlu dipasang ulang."""
    u = db.get(User, uid, options=[selectinload(User.coverage)])
    if not u or not u.deleted_at:
        raise ApiError(404, "NOT_FOUND", "Akun yang dihapus tidak ditemukan")
    u.deleted_at, u.active, u.deactivated_at = None, True, None
    audit(db, me, "RESTORE_USER", "user", u.id, {"username": u.username})
    db.commit(); invalidate_cache(); db.refresh(u)
    return ok(user_out(u))
