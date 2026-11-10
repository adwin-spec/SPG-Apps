import time
from collections import defaultdict, deque
from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..db import get_db
from ..deps import audit, current_user, ok
from ..errors import ApiError
from ..models import RefreshToken, User, new_id
from ..security import hash_secret, make_access_token, new_refresh_secret, now, verify_password
from ..services.access import active_items

router = APIRouter(prefix="/auth", tags=["auth"])
COOKIE = "tt_refresh"
_attempts: dict[str, deque] = defaultdict(deque)  # batas percobaan login per IP+username (per proses)


def user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "name": u.name, "role": u.role, "tugas": u.tugas or [], "area": u.area, "active": u.active,
            "coverage": [{"id": c.id, "level": c.level, "kode": c.kode, "label": c.label, "since": c.since.isoformat()} for c in active_items(u)] if u.role == "SPV" else []}


def _issue(db: Session, resp: Response, u: User, family: str | None = None) -> dict:
    raw, h = new_refresh_secret()
    db.add(RefreshToken(user_id=u.id, family=family or new_id(), token_hash=h, expires_at=now() + timedelta(days=settings.refresh_ttl_days)))
    resp.set_cookie(COOKIE, raw, httponly=True, secure=settings.cookie_secure, samesite="strict", path="/api/v1/auth", max_age=settings.refresh_ttl_days * 86400)
    return {"accessToken": make_access_token(u.id, u.token_version), "user": user_out(u)}


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=200)


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else '-'}:{body.username.lower()}"
    q = _attempts[key]
    while q and q[0] < time.time() - 60:
        q.popleft()
    if len(q) >= settings.login_rate_limit:
        raise ApiError(429, "TOO_MANY_ATTEMPTS", "Terlalu banyak percobaan. Coba lagi 1 menit lagi.")
    q.append(time.time())
    u = db.scalar(select(User).where(User.username == body.username.strip().lower()).options(selectinload(User.coverage)))
    if not u or not u.active or not verify_password(body.password, u.password_hash):
        raise ApiError(401, "INVALID_CREDENTIALS", "Username atau password salah")
    q.clear()
    out = _issue(db, response, u)
    audit(db, u, "LOGIN", "user", u.id)
    db.commit()
    return ok(out)


@router.post("/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(COOKIE)
    if not raw:
        raise ApiError(401, "UNAUTHENTICATED", "Belum masuk")
    t = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_secret(raw)))
    if not t or t.revoked_at or t.expires_at < now():
        raise ApiError(401, "UNAUTHENTICATED", "Sesi berakhir")
    if t.used_at:  # token lama dipakai ulang → kemungkinan dicuri: cabut seluruh rangkaian sesi
        db.execute(update(RefreshToken).where(RefreshToken.family == t.family).values(revoked_at=now()))
        db.commit()
        raise ApiError(401, "UNAUTHENTICATED", "Sesi dicabut demi keamanan, silakan masuk lagi")
    u = db.get(User, t.user_id, options=[selectinload(User.coverage)])
    if not u or not u.active:
        raise ApiError(401, "UNAUTHENTICATED", "Akun nonaktif")
    t.used_at = now()
    out = _issue(db, response, u, t.family)
    db.commit()
    return ok(out)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(COOKIE)
    if raw:
        t = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_secret(raw)))
        if t:
            db.execute(update(RefreshToken).where(RefreshToken.family == t.family).values(revoked_at=now()))
            db.commit()
    response.delete_cookie(COOKIE, path="/api/v1/auth")
    return ok(True)


@router.get("/me")
def me(u: User = Depends(current_user)):
    return ok(user_out(u))
