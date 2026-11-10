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
    q = select(Report).options(selectinload(Report.spg)).where(Report.status != "DRAFT")
    if status == "REJECTED":
        q = q.where(Report.status.in_(("REJECTED", "REVISION")))
    elif status:
        q = q.where(Report.status == status)
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
    if not r or r.status == "DRAFT":
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
    db.commit()
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
    db.commit()
    return ok(report_out(r, full=False))
