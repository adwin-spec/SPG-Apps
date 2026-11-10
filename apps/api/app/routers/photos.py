"""Foto lapangan (responden HORECA, rak outlet). File disimpan di STORAGE_DIR, bukan di database."""
import io
import os

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import current_user, ok
from ..errors import ApiError
from ..models import Photo, User, new_id

router = APIRouter(prefix="/photos", tags=["photos"])
Image.MAX_IMAGE_PIXELS = 40_000_000


@router.post("")
async def upload(file: UploadFile = File(...), u: User = Depends(current_user), db: Session = Depends(get_db)):
    raw = await file.read(settings.max_photo_mb * 1024 * 1024 + 1)
    if len(raw) > settings.max_photo_mb * 1024 * 1024:
        raise ApiError(413, "TOO_LARGE", f"Foto maksimal {settings.max_photo_mb} MB")
    try:
        im = Image.open(io.BytesIO(raw))
        if im.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError
        im = ImageOps.exif_transpose(im).convert("RGB")  # tegakkan orientasi, buang metadata (termasuk lokasi GPS)
    except Exception:
        raise ApiError(415, "UNSUPPORTED_TYPE", "File harus foto JPEG, PNG, atau WebP")
    im.thumbnail((1600, 1600))
    pid = new_id()
    rel = os.path.join(pid[:2], pid + ".jpg")
    path = os.path.join(settings.storage_dir, "photos", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "JPEG", quality=82, optimize=True)
    p = Photo(id=pid, uploader_id=u.id, path=rel, content_type="image/jpeg", size=os.path.getsize(path), width=im.width, height=im.height)
    db.add(p); db.commit()
    return ok({"id": pid, "width": im.width, "height": im.height})


@router.get("/{pid}")
def get_photo(pid: str, u: User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(Photo, pid)
    if not p or (u.role == "SPG" and p.uploader_id != u.id):
        raise ApiError(404, "NOT_FOUND", "Foto tidak ditemukan")
    path = os.path.join(settings.storage_dir, "photos", p.path)
    if not os.path.isfile(path):
        raise ApiError(404, "NOT_FOUND", "File foto hilang")
    return FileResponse(path, media_type=p.content_type, headers={"Cache-Control": "private, max-age=86400"})
