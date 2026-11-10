"""Isi awal database: master wilayah Jawa + DKI dan akun admin pertama.

    python -m app.seed --admin-username admin --admin-name "Admin Pusat"
Password admin dibaca dari environment variable ADMIN_PASSWORD (tidak pernah ditulis di kode).
Aman dijalankan berulang: data yang sudah ada tidak diubah.
"""
import argparse
import json
import os
import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import Kabupaten, Kecamatan, User
from .security import hash_password
from .services.master import DEFAULT_APP, save_app_settings, app_settings

DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "wilayah_jawa.json")


def seed_wilayah(db) -> tuple[int, int]:
    """Sumber: Kepmendagri No. 300.2.2-2138 Tahun 2025 (via cahyadsn/wilayah, MIT)."""
    nk = nc = 0
    for k in json.load(open(DATA, encoding="utf-8")):
        if not db.get(Kabupaten, k["kode"]):
            db.add(Kabupaten(kode=k["kode"], nama=k["nama"], prov_kode=k["provKode"], provinsi=k["provinsi"])); nk += 1
        db.flush()
        for c in k["kecamatan"]:
            if not db.get(Kecamatan, c["kode"]):
                db.add(Kecamatan(kode=c["kode"], kab_kode=k["kode"], nama=c["nama"])); nc += 1
    return nk, nc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--admin-username", default=os.getenv("ADMIN_USERNAME", "admin"))
    ap.add_argument("--admin-name", default=os.getenv("ADMIN_NAME", "Admin Pusat"))
    a = ap.parse_args()
    with SessionLocal() as db:
        nk, nc = seed_wilayah(db)
        save_app_settings(db, app_settings(db) or DEFAULT_APP)
        if not db.scalar(select(User).where(User.role == "ADMIN")):
            pw = os.getenv("ADMIN_PASSWORD")
            if not pw or len(pw) < 8:
                sys.exit("Set ADMIN_PASSWORD (minimal 8 karakter) untuk membuat akun admin pertama.")
            db.add(User(username=a.admin_username.lower(), name=a.admin_name, password_hash=hash_password(pw), role="ADMIN", tugas=[]))
            print(f"Akun admin '{a.admin_username}' dibuat.")
        db.commit()
    print(f"Wilayah: {nk} kab/kota dan {nc} kecamatan baru ditambahkan.")


if __name__ == "__main__":
    main()
