from collections.abc import Callable

from fastapi import Depends, Request
from sqlalchemy.orm import Session, selectinload

from .db import get_db
from .errors import ApiError
from .models import AuditLog, User
from .security import decode_access_token


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    h = request.headers.get("authorization", "")
    claims = decode_access_token(h[7:]) if h.lower().startswith("bearer ") else None
    if not claims:
        raise ApiError(401, "UNAUTHENTICATED", "Sesi berakhir, silakan masuk lagi")
    u = db.get(User, claims["sub"], options=[selectinload(User.coverage)])
    if not u or not u.active or u.token_version != claims.get("tv"):
        raise ApiError(401, "UNAUTHENTICATED", "Sesi berakhir, silakan masuk lagi")
    return u


def require(*roles: str) -> Callable[..., User]:
    def dep(u: User = Depends(current_user)) -> User:
        if u.role not in roles:
            raise ApiError(403, "FORBIDDEN", "Akses Anda tidak mengizinkan tindakan ini")
        return u
    return dep


def audit(db: Session, user: User | None, action: str, entity: str, entity_id: str | None = None, detail: dict | None = None) -> None:
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity=entity, entity_id=entity_id, detail=detail))


def ok(data=None, meta=None) -> dict:
    return {"data": data} if meta is None else {"data": data, "meta": meta}
