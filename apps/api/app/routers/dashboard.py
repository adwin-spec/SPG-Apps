import csv
import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import ok, require
from ..models import User
from ..services.dashboard import Filters, build, export_rows
from ..services.excel import build_xlsx, build_zip

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _f(type: str = Query("GROSIR", pattern="^(GROSIR|HORECA|REGULER)$"), days: int = Query(30, ge=1, le=366), spg: str = "", spv: str = "",
       prov: str = "", kab: str = "", kec: str = "", tipe: str = "", produk: str = Query("", max_length=60),
       minat: str = Query("", pattern="^(|beli|tidak)$")) -> Filters:
    return Filters(type, days, spg, spv, prov, kab, kec, tipe, produk, minat)


@router.get("")
def dashboard(f: Filters = Depends(_f), me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    if me.role != "ADMIN":
        f.spv = ""  # supervisor selalu dibatasi wilayahnya sendiri
    return ok(build(db, me, f))


@router.get("/export")
def export(f: Filters = Depends(_f), me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    if me.role != "ADMIN":
        f.spv = ""
    cols, rows = export_rows(db, me, f)
    buf = io.StringIO()
    buf.write("﻿")  # agar Excel membaca UTF-8
    w = csv.writer(buf, delimiter=";")
    w.writerow(cols)
    for r in rows:
        w.writerow(["'" + c if isinstance(c, str) and c[:1] in "=+-@" else c for c in r])  # cegah formula injection di Excel
    name = f"tanda-tambah-{f.type.lower()}-{f.days}hari.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/export.xlsx")
def export_xlsx(f: Filters = Depends(_f), me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    """File Excel berisi beberapa lembar (ringkasan, laporan, detail, promo). Isinya diatur di services/excel.py."""
    if me.role != "ADMIN":
        f.spv = ""
    name = f"tanda-tambah-{f.type.lower()}-{f.days}hari.xlsx"
    return StreamingResponse(iter([build_xlsx(db, me, f)]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/export-all.zip")
def export_all(f: Filters = Depends(_f), me: User = Depends(require("ADMIN", "SPV")), db: Session = Depends(get_db)):
    """Tiga file Excel (Grosir, HORECA, Reguler) dalam satu ZIP, dengan filter periode/wilayah/SPG yang sama."""
    if me.role != "ADMIN":
        f.spv = ""
    return StreamingResponse(iter([build_zip(db, me, f)]), media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="tanda-tambah-semua-{f.days}hari.zip"'})
