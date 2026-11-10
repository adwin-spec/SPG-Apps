"""Titik masuk server: uvicorn app.main:app --reload --port 4000"""
import logging

from fastapi import FastAPI
from sqlalchemy import func, select, text

from .config import settings
from .db import SessionLocal
from .errors import install
from .routers import admin, auth, dashboard, meta, photos, reports, review, users

logging.basicConfig(level=logging.INFO)
settings.check()
app = FastAPI(title="Tanda Tambah SPG API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
install(app)
for r in (auth.router, meta.router, users.router, photos.router, reports.router, review.router, dashboard.router, admin.router):
    app.include_router(r, prefix="/api/v1")


@app.api_route("/api/v1/health", methods=["GET", "HEAD"])  # HEAD dipakai load balancer / pemeriksa kesiapan
def health():
    with SessionLocal() as db:
        db.execute(text("select 1"))
    return {"data": {"status": "ok"}}
