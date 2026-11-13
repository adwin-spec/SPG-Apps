"""Tabel database (SQLAlchemy). Setiap perubahan struktur tabel butuh migrasi Alembic baru:
    alembic revision --autogenerate -m "keterangan"   lalu   alembic upgrade head

Isi form (pembeli, responden, kunjungan outlet) disimpan sebagai JSON di kolom `data`, jadi menambah atau
mengubah pertanyaan di app/forms.py TIDAK memerlukan migrasi.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")


def new_id() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(10))  # ADMIN | SPV | SPG
    tugas: Mapped[list] = mapped_column(JsonType, default=list)  # SPG: ["GROSIR","HORECA","REGULER"]
    area: Mapped[str | None] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    deactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # akun dihapus (diarsipkan); laporannya tetap ada
    areas: Mapped[list] = mapped_column(JsonType, default=list, server_default=text("'[]'"))  # [{kode, nama}] kab/kota
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    coverage: Mapped[list["Coverage"]] = relationship(back_populates="spv", order_by="Coverage.since")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    family: Mapped[str] = mapped_column(String(36), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Coverage(Base):
    """Wilayah supervisor. Tidak pernah dihapus: saat dilepas diberi `until`, agar persetujuan lama tetap sah."""
    __tablename__ = "spv_coverage"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    spv_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    level: Mapped[str] = mapped_column(String(3))  # KAB | KEC
    kode: Mapped[str] = mapped_column(String(32), index=True)
    label: Mapped[str] = mapped_column(String(200))
    since: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    spv: Mapped[User] = relationship(back_populates="coverage")


class Kabupaten(Base):
    __tablename__ = "kabupaten"
    kode: Mapped[str] = mapped_column(String(32), primary_key=True)
    nama: Mapped[str] = mapped_column(String(120))
    prov_kode: Mapped[str] = mapped_column(String(8), index=True)
    provinsi: Mapped[str] = mapped_column(String(120))
    manual: Mapped[bool] = mapped_column(Boolean, default=False)


class Kecamatan(Base):
    __tablename__ = "kecamatan"
    kode: Mapped[str] = mapped_column(String(32), primary_key=True)
    kab_kode: Mapped[str] = mapped_column(ForeignKey("kabupaten.kode"), index=True)
    nama: Mapped[str] = mapped_column(String(120), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    manual: Mapped[bool] = mapped_column(Boolean, default=False)
    kab: Mapped[Kabupaten] = relationship()


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JsonType)


class Report(Base):
    """Satu laporan SPG: sesi grosir, survei venue HORECA, atau rute outlet Reguler.
    `id` dibuat di HP (UUID) sehingga kirim ulang saat sinyal putus tidak membuat laporan ganda."""
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    spg_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(10), index=True)  # GROSIR | HORECA | REGULER
    status: Mapped[str] = mapped_column(String(10), index=True)  # DRAFT | SUBMITTED | REJECTED | REVISION | APPROVED | DELETED
    date: Mapped[date] = mapped_column(Date, index=True)
    loc_kode: Mapped[str | None] = mapped_column(String(32), index=True)  # kecamatan lokasi → menentukan supervisor
    data: Mapped[dict] = mapped_column(JsonType)  # {header, entries, sections, closing}
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=0)
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[str | None] = mapped_column(String(120))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    # Dihapus admin: laporan tidak benar-benar dibuang (bisa dipulihkan & tetap ada untuk audit)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[str | None] = mapped_column(String(120))
    delete_reason: Mapped[str | None] = mapped_column(Text)
    prev_status: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    spg: Mapped[User] = relationship()


class ReportLog(Base):
    """Riwayat laporan (hanya ditambah, tidak pernah diubah)."""
    __tablename__ = "report_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String(36), index=True)  # tanpa FK: riwayat tetap ada walau draf dihapus
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    action: Mapped[str] = mapped_column(String(30))
    user_id: Mapped[str | None] = mapped_column(String(36))
    by_name: Mapped[str | None] = mapped_column(String(120))
    note: Mapped[str | None] = mapped_column(Text)


class Approval(Base):
    """Salinan laporan saat disetujui: satu-satunya sumber angka dashboard."""
    __tablename__ = "approvals"
    report_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    type: Mapped[str] = mapped_column(String(10), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    loc_kode: Mapped[str | None] = mapped_column(String(32), index=True)
    spg_id: Mapped[str | None] = mapped_column(String(36), index=True)
    spg_name: Mapped[str] = mapped_column(String(120))
    approver_id: Mapped[str] = mapped_column(String(36))
    approver_name: Mapped[str] = mapped_column(String(120))
    approver_role: Mapped[str] = mapped_column(String(10))
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    sample: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    snapshot: Mapped[dict] = mapped_column(JsonType)


Index("ix_approvals_type_date", Approval.type, Approval.date)


class Photo(Base):
    __tablename__ = "photos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    path: Mapped[str] = mapped_column(String(300))
    content_type: Mapped[str] = mapped_column(String(40))
    size: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    detail: Mapped[dict | None] = mapped_column(JsonType)
