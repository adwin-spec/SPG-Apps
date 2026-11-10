"""Tes memakai database terpisah yang namanya harus berakhiran _test (agar database kerja tidak pernah terhapus)."""
import io
import os
import uuid

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://tanda:tanda@localhost:5432/tanda_test")
os.environ.setdefault("STORAGE_DIR", "/tmp/tanda-test-storage")
os.environ["LOGIN_RATE_LIMIT_MAX"] = "1000"

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, text

from app.config import settings

assert settings.database_url.endswith("_test"), "Tes hanya boleh memakai database *_test"


@pytest.fixture(scope="session", autouse=True)
def database():
    base = settings.database_url.rsplit("/", 1)[0] + "/postgres"
    name = settings.database_url.rsplit("/", 1)[1]
    eng = create_engine(base, isolation_level="AUTOCOMMIT")
    with eng.connect() as c:
        c.execute(text(f'drop database if exists "{name}" with (force)'))
        c.execute(text(f'create database "{name}"'))
    eng.dispose()
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")
    from app.db import SessionLocal
    from app.models import User
    from app.security import hash_password
    from app.seed import seed_wilayah
    with SessionLocal() as db:
        seed_wilayah(db)
        db.add(User(username="admin", name="Admin Pusat", password_hash=hash_password("admin-pass-1"), role="ADMIN", tugas=[]))
        db.commit()
    yield


@pytest.fixture(scope="session")
def client():
    from app.main import app
    return TestClient(app)


class As:
    """Klien yang sudah login sebagai satu akun."""
    def __init__(self, client: TestClient, username: str, password: str):
        from app.main import app
        self.c = TestClient(app)
        r = self.c.post("/api/v1/auth/login", json={"username": username, "password": password})
        assert r.status_code == 200, r.text
        self.user = r.json()["data"]["user"]
        self.h = {"authorization": "Bearer " + r.json()["data"]["accessToken"]}

    def get(self, p, **kw): return self.c.get("/api/v1" + p, headers=self.h, **kw)
    def post(self, p, **kw): return self.c.post("/api/v1" + p, headers=self.h, **kw)
    def put(self, p, **kw): return self.c.put("/api/v1" + p, headers=self.h, **kw)
    def patch(self, p, **kw): return self.c.patch("/api/v1" + p, headers=self.h, **kw)
    def delete(self, p, **kw): return self.c.delete("/api/v1" + p, headers=self.h, **kw)


@pytest.fixture(scope="session")
def admin(client):
    return As(client, "admin", "admin-pass-1")


@pytest.fixture(scope="session")
def make_user(client, admin):
    def make(role: str, tugas=(), name=None):
        u = "u" + uuid.uuid4().hex[:10]
        r = admin.post("/users", json={"username": u, "name": name or f"Nama {u}", "password": "pass-12345", "role": role, "tugas": list(tugas)})
        assert r.status_code == 200, r.text
        return As(client, u, "pass-12345")
    return make


def jpeg() -> bytes:
    b = io.BytesIO(); Image.new("RGB", (40, 30), (200, 30, 30)).save(b, "JPEG"); return b.getvalue()


SOKARAJA, KEMBARAN, CILACAP_TENGAH, KUTASARI = "33.02.19", "33.02.20", "33.01.22", "33.03.07"
