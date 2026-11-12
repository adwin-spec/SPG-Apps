"""Titik masuk server: uvicorn app.main:app --reload --port 4000"""
import logging

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import func, select, text

from .config import settings
from .db import SessionLocal
from .errors import install
from .routers import admin, auth, dashboard, meta, photos, reports, review, users

logging.basicConfig(level=logging.INFO)
settings.check()
app = FastAPI(title="Tanda Tambah SPG API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
install(app)


class JsonGZip:
    """Kompres respons data (JSON) agar hemat kuota & cepat di sinyal lemah. Foto & file unduhan sudah terkompresi → dilewati."""
    def __init__(self, inner):
        self.inner = inner; self.gz = GZipMiddleware(inner, minimum_size=1024)

    async def __call__(self, scope, receive, send):
        p = scope.get("path", "") if scope["type"] == "http" else ""
        use = scope["type"] == "http" and not p.startswith("/api/v1/photos") and "export" not in p
        await (self.gz if use else self.inner)(scope, receive, send)


app.add_middleware(JsonGZip)
for r in (auth.router, meta.router, users.router, photos.router, reports.router, review.router, dashboard.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.api_route("/api/v1/health", methods=["GET", "HEAD"])  # HEAD dipakai load balancer / pemeriksa kesiapan
def health():
    with SessionLocal() as db:
        db.execute(text("select 1"))
    return {"data": {"status": "ok"}}
