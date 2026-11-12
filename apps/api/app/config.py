"""Pengaturan dari environment variable. Jangan menulis rahasia (password, kunci) di file ini."""
import os
from dataclasses import dataclass


def _bool(v: str | None, default: bool) -> bool:
    return default if v is None else v.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    env: str = os.getenv("APP_ENV", "development")
    database_url: str = os.getenv("DATABASE_URL", "postgresql+psycopg://tanda:tanda@localhost:5432/tanda")
    jwt_secret: str = os.getenv("JWT_SECRET", "")
    access_ttl_min: int = int(os.getenv("ACCESS_TOKEN_TTL_MIN", "15"))
    refresh_ttl_days: int = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "14"))
    # Sinyal HP sering putus tepat saat sesi diperbarui: token lama yang dipakai lagi dalam jendela ini dianggap
    # kiriman ulang (bukan pencurian), jadi SPG tidak ter-logout di tengah hari.
    refresh_reuse_grace_s: int = int(os.getenv("REFRESH_REUSE_GRACE_S", "120"))
    cookie_secure: bool = _bool(os.getenv("COOKIE_SECURE"), False)
    storage_dir: str = os.getenv("STORAGE_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "storage"))
    max_photo_mb: int = int(os.getenv("MAX_PHOTO_MB", "8"))
    login_rate_limit: int = int(os.getenv("LOGIN_RATE_LIMIT_MAX", "10"))
    # Koneksi database per proses API. Total = jumlah proses × (pool + overflow); harus < max_connections PostgreSQL.
    db_pool_size: int = int(os.getenv("DB_POOL_SIZE", "5"))
    db_max_overflow: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    timezone_offset_hours: int = 7  # Asia/Jakarta (WIB); data disimpan dalam UTC

    def check(self) -> None:
        if self.env == "production" and len(self.jwt_secret) < 32:
            raise RuntimeError("JWT_SECRET wajib diisi (minimal 32 karakter) di production")


settings = Settings()
if not settings.jwt_secret:
    # Hanya untuk development/test: kunci acak per proses (sesi hilang saat restart).
    object.__setattr__(settings, "jwt_secret", os.urandom(32).hex())
