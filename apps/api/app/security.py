import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from .config import settings


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


def now() -> datetime:
    return datetime.now(UTC)


def make_access_token(user_id: str, token_version: int) -> str:
    exp = now() + timedelta(minutes=settings.access_ttl_min)
    return jwt.encode({"sub": user_id, "tv": token_version, "exp": exp, "typ": "access"}, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict | None:
    try:
        d = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return d if d.get("typ") == "access" else None
    except jwt.PyJWTError:
        return None


def new_refresh_secret() -> tuple[str, str]:
    raw = secrets.token_urlsafe(48)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_secret(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
