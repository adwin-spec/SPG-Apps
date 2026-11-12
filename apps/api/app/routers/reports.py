"""Laporan milik SPG (aplikasi HP). SPG hanya bisa membaca dan mengubah laporannya sendiri."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import current_user, ok
from ..errors import ApiError
from ..forms import FORMS
from ..models import Report, ReportLog, User
from ..security import now
from ..services.access import active_spvs, report_loc, spvs_for
from ..services.reports import OPEN, clean_report, jakarta_date, packs, title_of

router = APIRouter(prefix="/reports", tags=["reports"])


def report_out(r: Report, spvs: list[User] | None = None, full: bool = True) -> dict:
    loc = report_loc(r)
    d = {"id": r.id, "type": r.type, "status": r.status, "date": r.date.isoformat(), "title": title_of(r), "loc": loc,
         "startedAt": r.started_at.isoformat(), "endedAt": r.ended_at.isoformat() if r.ended_at else None,
         "submittedAt": r.submitted_at.isoformat() if r.submitted_at else None, "decidedAt": r.decided_at.isoformat() if r.decided_at else None,
         "revision": r.revision, "reviewNote": r.review_note, "reviewedBy": r.reviewed_by, "version": r.version,
         "spg": {"id": r.spg_id, "name": r.spg.name if r.spg else None}, "entryCount": len(r.data.get("entries") or []), "packs": packs(r.data),
         "gps": (r.data.get("header") or {}).get("lokasi"), "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
         **({"deletedAt": r.deleted_at.isoformat(), "deletedBy": r.deleted_by, "deleteReason": r.delete_reason, "prevStatus": r.prev_status} if r.deleted_at else {})}
    if spvs is not None:
        d["spvNames"] = [s.name for s in spvs_for(spvs, loc)]
    if full:
        d["data"] = r.data
    return d


def _own(db: Session, u: User, rid: str, lock: bool = False) -> Report:
    q = select(Report).where(Report.id == rid).options(selectinload(Report.spg))
    r = db.scalar(q.with_for_update(of=Report) if lock else q)
    if not r or r.spg_id != u.id:
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    if r.status == "DELETED":
        raise ApiError(410, "DELETED", "Laporan ini sudah dihapus admin pusat")
    return r


@router.get("/mine")
def mine(u: User = Depends(current_user), db: Session = Depends(get_db)):
    rs = db.scalars(select(Report).where(Report.spg_id == u.id, Report.status != "DELETED").options(selectinload(Report.spg)).order_by(Report.started_at.desc()).limit(60)).all()
    spvs = active_spvs(db)
    return ok([report_out(r, spvs, full=r.status in OPEN + ("REJECTED",) or i < 20) for i, r in enumerate(rs)])


@router.get("/{rid}")
def my_report(rid: str, lite: bool = False, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Satu laporan milik SPG + riwayatnya (dibuat, disimpan, dikirim, disetujui, …) untuk tab Riwayat di HP.
    `lite=1`: hanya status & versi (dipakai HP untuk menyamakan versi tanpa mengunduh seluruh isi)."""
    r = _own(db, u, rid)
    if lite:
        return ok(report_out(r, full=False))
    log = db.scalars(select(ReportLog).where(ReportLog.report_id == rid).order_by(ReportLog.id)).all()
    return ok({**report_out(r, active_spvs(db)), "log": [{"at": l.at.isoformat(), "action": l.action, "by": l.by_name, "note": l.note} for l in log]})


class ReportIn(BaseModel):
    type: str = Field(pattern="^(GROSIR|HORECA|REGULER)$")
    header: dict = Field(default_factory=dict)
    entries: list[dict] = Field(default_factory=list, max_length=300)
    sections: dict = Field(default_factory=dict)
    closing: dict = Field(default_factory=dict)
    version: int | None = None


@router.put("/{rid}")
def save(rid: str, body: ReportIn, lite: bool = False, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """Simpan draf (buat baru atau perbarui). Aman diulang: id laporan dibuat di HP."""
    if len(rid) != 36:
        raise ApiError(422, "VALIDATION_ERROR", "Id laporan tidak valid")
    r = db.scalar(select(Report).where(Report.id == rid).with_for_update())
    if r and r.spg_id != u.id:
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    if r and r.status == "DELETED":
        raise ApiError(410, "DELETED", "Laporan ini sudah dihapus admin pusat. Mulai laporan baru.")
    if r and r.type != body.type:
        raise ApiError(422, "VALIDATION_ERROR", "Jenis laporan tidak boleh diubah")
    if not r and body.type not in (u.tugas or []):
        raise ApiError(403, "FORBIDDEN", "Tugas ini tidak diberikan kepada Anda")
    data, errs = clean_report(db, u, body.type, body.model_dump(), final=False)
    if errs:
        raise ApiError(422, "FORM_INVALID", "Lengkapi isian yang ditandai", errs)
    if r and r.data.get("removed"):
        data["removed"] = r.data["removed"]  # catatan isian yang dihapus admin/supervisor tidak boleh hilang
    if r:
        if r.status not in OPEN:
            if r.data == data:
                return ok(report_out(r, full=not lite))  # kiriman ulang yang sama (mis. dari antrean offline)
            raise ApiError(409, "LOCKED", "Laporan sudah dikirim dan tidak bisa diubah")
        if body.version is not None and body.version != r.version and r.data != data:
            raise ApiError(409, "CONFLICT", "Laporan diubah dari perangkat lain. Muat ulang dulu.")
        changed = r.data != data
        r.data = data
        r.loc_kode = (data["header"].get(FORMS[r.type]["location_field"]) or {}).get("kode")
        r.version += 1
        if changed:  # riwayat simpan: paling banyak satu catatan "Disimpan" per 10 menit agar log tetap ringkas
            last = db.scalar(select(ReportLog).where(ReportLog.report_id == r.id).order_by(ReportLog.id.desc()).limit(1))
            if not last or last.action != "DISIMPAN" or (now() - last.at).total_seconds() > 600:
                db.add(ReportLog(report_id=r.id, action="DISIMPAN", user_id=u.id, by_name=u.name,
                                 note=f"{len(data['entries'])} {FORMS[r.type]['entry_word']}"))
    else:
        other = db.scalar(select(Report.id).where(Report.spg_id == u.id, Report.status.in_(OPEN)))
        if other:
            raise ApiError(409, "OPEN_REPORT", "Selesaikan atau kirim laporan yang sedang dibuka dulu")
        t = now()
        r = Report(id=rid, spg_id=u.id, type=body.type, status="DRAFT", date=jakarta_date(t), started_at=t, data=data,
                   loc_kode=(data["header"].get(FORMS[body.type]["location_field"]) or {}).get("kode"), version=1)
        db.add(r); db.flush()
        db.add(ReportLog(report_id=rid, action="DIBUAT", user_id=u.id, by_name=u.name))
    db.commit(); db.refresh(r)
    return ok(report_out(r, active_spvs(db), full=not lite))  # lite: HP cukup butuh versi & status, bukan seluruh isi


@router.post("/{rid}/submit")
def submit(rid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, u, rid, lock=True)
    if r.status not in OPEN:
        raise ApiError(409, "LOCKED", "Laporan sudah dikirim")
    data, errs = clean_report(db, u, r.type, r.data, final=True)
    if errs:
        raise ApiError(422, "FORM_INVALID", "Laporan belum lengkap", errs)
    if r.data.get("removed"):
        data["removed"] = r.data["removed"]
    again = r.status == "REVISION"
    r.data, r.status, r.submitted_at = data, "SUBMITTED", now()
    if not r.ended_at:
        r.ended_at = r.submitted_at
    if again:
        r.revision += 1
    r.version += 1
    db.add(ReportLog(report_id=r.id, action="DIKIRIM_ULANG" if again else "DIKIRIM", user_id=u.id, by_name=u.name))
    db.commit()
    return ok(report_out(r, active_spvs(db)))


@router.post("/{rid}/rework")
def rework(rid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, u, rid, lock=True)
    if r.status != "REJECTED":
        raise ApiError(409, "LOCKED", "Hanya laporan yang ditolak yang bisa diperbaiki")
    if db.scalar(select(Report.id).where(Report.spg_id == u.id, Report.status.in_(OPEN))):
        raise ApiError(409, "OPEN_REPORT", "Selesaikan atau kirim laporan yang sedang dibuka dulu")
    r.status = "REVISION"; r.version += 1
    db.add(ReportLog(report_id=r.id, action="DIKERJAKAN_ULANG", user_id=u.id, by_name=u.name))
    db.commit()
    return ok(report_out(r, active_spvs(db)))


@router.post("/{rid}/edit")
def reopen(rid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    """SPG membuka lagi laporannya untuk diubah dari tab Riwayat.
    - Menunggu persetujuan → ditarik kembali (keluar dari antrean supervisor), lalu dikirim lagi.
    - Sudah disetujui → jadi revisi; angka lama tetap di dashboard sampai versi baru disetujui lagi."""
    r = _own(db, u, rid, lock=True)
    if r.status in OPEN:
        return ok(report_out(r, active_spvs(db)))
    if r.status == "REJECTED":
        raise ApiError(409, "USE_REWORK", "Laporan ini ditolak – pakai tombol Perbaiki")
    if r.status not in ("SUBMITTED", "APPROVED"):
        raise ApiError(409, "LOCKED", "Laporan ini tidak bisa diubah")
    if db.scalar(select(Report.id).where(Report.spg_id == u.id, Report.status.in_(OPEN), Report.id != rid)):
        raise ApiError(409, "OPEN_REPORT", "Selesaikan atau kirim laporan yang sedang dibuka dulu")
    was = r.status
    r.status = "REVISION" if was == "APPROVED" or r.revision else "DRAFT"
    r.review_note = None
    r.version += 1
    db.add(ReportLog(report_id=r.id, action="DITARIK", user_id=u.id, by_name=u.name,
                     note="Laporan yang sudah disetujui dibuka lagi untuk diubah (perlu disetujui ulang)" if was == "APPROVED"
                     else "Ditarik dari antrean persetujuan untuk diubah"))
    db.commit()
    return ok(report_out(r, active_spvs(db)))


@router.delete("/{rid}")
def delete_draft(rid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _own(db, u, rid, lock=True)
    if r.status != "DRAFT" or r.submitted_at:
        raise ApiError(409, "LOCKED", "Hanya draf yang belum pernah dikirim yang bisa dihapus")
    db.delete(r); db.commit()
    return ok(True)
