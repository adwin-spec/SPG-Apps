"""Siapa boleh melakukan apa. Wilayah supervisor menentukan laporan mana yang boleh ia putuskan."""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Coverage, Report, User
from ..forms import FORMS


def active_items(user: User, at: datetime | None = None) -> list[Coverage]:
    if at is None:
        return [c for c in user.coverage if c.until is None]
    return [c for c in user.coverage if c.since <= at and (c.until is None or at <= c.until)]


def covers(user: User, loc: dict | None, at: datetime | None = None) -> bool:
    if not loc or not isinstance(loc, dict):
        return False
    return any((c.level == "KAB" and c.kode == loc.get("kabKode")) or (c.level == "KEC" and c.kode == loc.get("kode")) for c in active_items(user, at))


def report_loc(r: Report | dict) -> dict | None:
    t = r.type if isinstance(r, Report) else r["type"]
    data = r.data if isinstance(r, Report) else r
    return (data.get("header") or {}).get(FORMS[t]["location_field"])


def active_spvs(db: Session) -> list[User]:
    return list(db.scalars(select(User).where(User.role == "SPV", User.active.is_(True)).options(selectinload(User.coverage))))


def spvs_for(spvs: list[User], loc: dict | None) -> list[User]:
    return [s for s in spvs if covers(s, loc)]


def can_decide(user: User, r: Report) -> bool:
    if user.role == "ADMIN":
        return True
    return user.role == "SPV" and user.active and covers(user, report_loc(r))
