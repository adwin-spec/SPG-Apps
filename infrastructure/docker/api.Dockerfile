# syntax=docker/dockerfile:1.7
# Backend Python (FastAPI). Perintah default menjalankan server; layanan "migrate" di compose memakai image yang sama.
FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY apps/api/requirements.txt .
RUN pip install -r requirements.txt
COPY apps/api/ .
RUN useradd --system --uid 10001 api && mkdir -p /data/storage && chown api /data/storage
USER api
ENV STORAGE_DIR=/data/storage
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4000/api/v1/health')"
# WEB_CONCURRENCY = jumlah proses API (default 4: cukup untuk ±100 pengguna aktif bersamaan di server 2 vCPU)
ENV WEB_CONCURRENCY=4
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 4000 --workers ${WEB_CONCURRENCY} --proxy-headers --timeout-keep-alive 30"]
