"""Persetujuan laporan. Supervisor hanya bisa memutus laporan di kecamatan wilayahnya (ditegakkan di server);
admin pusat bisa memutus semua, termasuk wilayah tanpa supervisor."""
import copy

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import false, or_, select
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from ..deps import audit, ok, require
from ..errors import ApiError
from ..models import Approval, Report, ReportLog, User
from ..security import now
from ..services.access import active_items, active_spvs, can_decide, report_loc, spvs_for
from ..services.dashboard import invalidate_cache
from ..services.formengine import norm
from .reports import report_out

router = APIRouter(prefix="/review", tags=["review"])


def _area_filter(spv: User):
    items = active_items(spv)
    if not items:
        return false()
    return or_(*[Report.loc_kode == c.kode if c.level == "KEC" else Report.loc_kode.like(c.kode + ".%") for c in items])


@router.get("")
def queue(status: str = "SUBMITTED", scope: str = "mine", spv: str | None = None, type: str | None = None,
          limit: int = Query(200, le=500), me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    if status in ("DRAFT", "DELETED") and me.role != "ADMIN":
        raise ApiError(403, "FORBIDDEN", "Hanya admin pusat yang bisa melihat laporan ini")
    q = select(Report).options(selectinload(Report.spg))
    if status == "REJECTED":
        q = q.where(Report.status.in_(("REJECTED", "REVISION")))
    elif status == "DRAFT":
        q = q.where(Report.status == "DRAFT")  # sedang dikerjakan SPG
    elif status:
        q = q.where(Report.status == status)
    else:
        q = q.where(Report.status.notin_(("DRAFT", "DELETED")))
    if type:
        q = q.where(Report.type == type)
    spvs = active_spvs(db)
    if me.role == "SPV" and scope != "all":
        q = q.where(_area_filter(me))
    elif me.role == "ADMIN" and spv and spv != "_none":
        target = next((s for s in spvs if s.id == spv), None)
        q = q.where(_area_filter(target) if target else false())
    rows = db.scalars(q.order_by(Report.submitted_at.desc().nullslast(), Report.started_at.desc()).limit(limit)).all()
    if me.role == "ADMIN" and spv == "_none":
        rows = [r for r in rows if not spvs_for(spvs, report_loc(r))]
    from ..services.reports import flags
    out = [{**report_out(r, spvs, full=False), "flags": flags(r, me), "canDecide": can_decide(me, r)} for r in rows]
    pending = db.scalars(select(Report).where(Report.status == "SUBMITTED", *( [_area_filter(me)] if me.role == "SPV" else []))).all()
    return ok(out, {"pending": len(pending), "spvCount": len(spvs)})


@router.get("/{rid}")
def detail(rid: str, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    r = db.scalar(select(Report).where(Report.id == rid).options(selectinload(Report.spg)))
    if not r or (r.status in ("DRAFT", "DELETED") and me.role != "ADMIN"):
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    log = db.scalars(select(ReportLog).where(ReportLog.report_id == rid).order_by(ReportLog.id)).all()
    from ..services.reports import flags
    return ok({**report_out(r, active_spvs(db)), "flags": flags(r, me), "canDecide": can_decide(me, r),
               "log": [{"at": l.at.isoformat(), "action": l.action, "by": l.by_name, "note": l.note} for l in log]})


def _decide(db: Session, me: User, rid: str) -> Report:
    r = db.scalar(select(Report).where(Report.id == rid).options(selectinload(Report.spg)).with_for_update(of=Report))
    if not r or r.status == "DRAFT":
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    if r.status != "SUBMITTED":
        raise ApiError(409, "ALREADY_DECIDED", "Laporan ini sudah diputus atau sedang diperbaiki SPG")
    if not can_decide(me, r):
        raise ApiError(403, "OUT_OF_AREA", "Laporan ini di luar wilayah Anda")
    return r


def _by(me: User) -> str:
    return "Admin pusat" if me.role == "ADMIN" else me.name


@router.post("/{rid}/approve")
def approve(rid: str, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    r = _decide(db, me, rid)
    t = now()
    r.status, r.decided_at, r.reviewed_by, r.review_note = "APPROVED", t, _by(me), None
    r.version += 1
    snap = {"type": r.type, "date": r.date.isoformat(), "startedAt": r.started_at.isoformat(),
            "endedAt": r.ended_at.isoformat() if r.ended_at else None, **copy.deepcopy(r.data)}
    a = db.get(Approval, r.id)
    if a:
        db.delete(a); db.flush()
    db.add(Approval(report_id=r.id, type=r.type, date=r.date, loc_kode=r.loc_kode, spg_id=r.spg_id, spg_name=r.spg.name,
                    approver_id=me.id, approver_name=_by(me), approver_role=me.role, approved_at=t, snapshot=snap))
    db.add(ReportLog(report_id=r.id, action="DISETUJUI", user_id=me.id, by_name=_by(me)))
    audit(db, me, "APPROVE", "report", r.id)
    db.commit(); invalidate_cache()
    return ok(report_out(r, full=False))


class RejectIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)


@router.post("/{rid}/reject")
def reject(rid: str, body: RejectIn, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    note = norm(body.note)
    if len(note) < 5:
        raise ApiError(422, "VALIDATION_ERROR", "Tulis alasan penolakan agar SPG tahu apa yang harus diperbaiki")
    r = _decide(db, me, rid)
    r.status, r.decided_at, r.reviewed_by, r.review_note = "REJECTED", now(), _by(me), note
    r.version += 1
    db.add(ReportLog(report_id=r.id, action="DITOLAK", user_id=me.id, by_name=_by(me), note=note))
    audit(db, me, "REJECT", "report", r.id, {"note": note})
    db.commit(); invalidate_cache()
    return ok(report_out(r, full=False))


class DeleteIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


@router.post("/{rid}/delete")
def delete_report(rid: str, body: DeleteIn, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    """Admin pusat menghapus laporan (termasuk yang masih dikerjakan SPG). Tidak dibuang permanen:
    laporan disembunyikan dari SPG, antrean & dashboard, dan bisa dipulihkan. Salinan disetujuinya dihapus dari dashboard."""
    reason = norm(body.reason)
    if len(reason) < 5:
        raise ApiError(422, "VALIDATION_ERROR", "Tulis alasan penghapusan")
    r = db.scalar(select(Report).where(Report.id == rid).with_for_update())
    if not r:
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    if r.status == "DELETED":
        raise ApiError(409, "ALREADY_DELETED", "Laporan ini sudah dihapus")
    r.prev_status, r.status = r.status, "DELETED"
    r.deleted_at, r.deleted_by, r.delete_reason = now(), _by(me), reason
    r.version += 1
    a = db.get(Approval, r.id)
    if a:
        db.delete(a)
    db.add(ReportLog(report_id=r.id, action="DIHAPUS", user_id=me.id, by_name=_by(me), note=reason))
    audit(db, me, "DELETE", "report", r.id, {"reason": reason, "prev_status": r.prev_status})
    db.commit(); invalidate_cache()
    return ok(report_out(r, full=False))


class EntryDeleteIn(BaseModel):
    index: int = Field(ge=0, le=299)
    at: str | None = Field(default=None, max_length=40)   # jam input isian: memastikan yang dihapus memang isian yang dimaksud
    reason: str = Field(min_length=5, max_length=500)


EDITABLE = ("SUBMITTED", "APPROVED", "REJECTED")


@router.post("/{rid}/entries/delete")
def delete_entry(rid: str, body: EntryDeleteIn, me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    """Hapus satu isian (pembeli/responden/outlet) dari laporan yang sudah masuk. Admin: semua wilayah; supervisor: wilayahnya.
    Bila laporan sudah disetujui, salinan untuk dashboard & Excel ikut diperbarui. Isian yang dihapus TIDAK dibuang:
    disimpan di laporan (bagian "removed"), di riwayat laporan, dan di log audit."""
    from ..services.reports import entry_label
    reason = norm(body.reason)
    if len(reason) < 5:
        raise ApiError(422, "VALIDATION_ERROR", "Tulis alasan penghapusan")
    r = db.scalar(select(Report).where(Report.id == rid).options(selectinload(Report.spg)).with_for_update(of=Report))
    if not r or r.status == "DELETED" or (r.status == "DRAFT" and me.role != "ADMIN"):
        raise ApiError(404, "NOT_FOUND", "Laporan tidak ditemukan")
    if not can_decide(me, r):
        raise ApiError(403, "OUT_OF_AREA", "Laporan ini di luar wilayah Anda")
    if r.status not in EDITABLE:
        raise ApiError(409, "IN_PROGRESS", "Laporan ini sedang dikerjakan SPG. Isiannya bisa dihapus setelah dikirim.")
    ents = list(r.data.get("entries") or [])
    if body.index >= len(ents) or (body.at and ents[body.index].get("at") != body.at):
        raise ApiError(409, "CONFLICT", "Isian ini sudah berubah. Muat ulang halaman lalu coba lagi.")
    e = ents.pop(body.index)
    label = entry_label(r.type, e, body.index)
    rec = {"entry": e, "index": body.index, "label": label, "by": _by(me), "byId": me.id, "role": me.role, "at": now().isoformat(), "reason": reason}
    r.data = {**r.data, "entries": ents, "removed": [*(r.data.get("removed") or []), rec]}   # dict baru → tersimpan ke JSON
    r.version += 1
    a = db.get(Approval, r.id)
    if a:  # dashboard & Excel hanya membaca salinan ini
        a.snapshot = {**a.snapshot, "entries": [x for i, x in enumerate(a.snapshot.get("entries") or []) if not (i == body.index and x.get("at") == e.get("at"))],
                      "removed": [*(a.snapshot.get("removed") or []), rec]}
    db.add(ReportLog(report_id=r.id, action="ISIAN_DIHAPUS", user_id=me.id, by_name=_by(me), note=f"{label} – {reason}"))
    audit(db, me, "DELETE_ENTRY", "report", r.id, {"index": body.index, "label": label, "reason": reason, "entry": e})
    db.commit(); invalidate_cache()
    return ok(report_out(r, active_spvs(db)))


@router.post("/{rid}/restore")
def restore_report(rid: str, me: User = Depends(require("ADMIN")), db: Session = Depends(get_db)):
    """Pulihkan laporan yang dihapus. Laporan yang sudah dikirim kembali ke antrean (perlu disetujui ulang);
    draf kembali ke SPG sebagai draf – kecuali SPG itu sudah membuka laporan lain."""
    r = db.scalar(select(Report).where(Report.id == rid).with_for_update())
    if not r or r.status != "DELETED":
        raise ApiError(404, "NOT_FOUND", "Laporan yang dihapus tidak ditemukan")
    # Laporan yang masih dikerjakan kembali ke SPG apa adanya; yang sudah dikirim/diputus masuk antrean lagi.
    back = r.prev_status if r.prev_status in ("DRAFT", "REVISION") else "SUBMITTED"
    if back != "SUBMITTED" and db.scalar(select(Report.id).where(Report.spg_id == r.spg_id, Report.status.in_(("DRAFT", "REVISION")))):
        raise ApiError(409, "OPEN_REPORT", "SPG ini sedang mengerjakan laporan lain. Pulihkan setelah laporannya dikirim.")
    r.status, r.deleted_at, r.deleted_by, r.delete_reason, r.prev_status = back, None, None, None, None
    r.version += 1
    db.add(ReportLog(report_id=r.id, action="DIPULIHKAN", user_id=me.id, by_name=_by(me)))
    audit(db, me, "RESTORE", "report", r.id, {"status": back})
    db.commit(); invalidate_cache()
    return ok(report_out(r, full=False))
