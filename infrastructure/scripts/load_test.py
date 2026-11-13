"""Uji beban sederhana: N SPG mengisi & mengirim laporan HORECA bersamaan, sementara beberapa admin membuka dashboard.

Pakai di server UJI (bukan produksi — skrip ini membuat akun & laporan uji coba):

    pip install httpx
    python infrastructure/scripts/load_test.py --api http://localhost:4000/api/v1 \
        --admin-user admin --admin-pass '...' --spg 60 --admins 5 --rounds 3

Akun uji bernama `lt-<acak>-NN`. Hapus/nonaktifkan lewat halaman Pengguna setelah selesai.
Hasil: jumlah permintaan, error, dan waktu respons p50/p95/maks per jenis permintaan.
"""
import argparse
import asyncio
import statistics
import time
import uuid
from collections import defaultdict

import httpx

GPS = {"lat": -7.4213, "lon": 109.2345, "acc": 12}
KEMBARAN, SOKARAJA = "33.02.20", "33.02.19"
ENTRY = {"dewasa": True, "usia": "25–34", "domisili": {"kode": KEMBARAN}, "rokokBiasa": "camel purple", "tempatBeli": "Minimarket", "rasa": "Sedang",
         "statusTT": "TAHU_BELUM_COBA", "alasan": "Ragu dengan rasa", "tahuDari": "Event", "sampel": "Guava", "kekuatan": "Pas", "asap": "Halus, nyaman",
         "beli": {"Guava": 1}, "alasanBeli": "Rasa cocok", "fotoSetuju": "TIDAK"}


def report(n):
    return {"type": "HORECA", "header": {"venue": "kopi uji beban", "alamat": "Jl. Uji 1", "kecVenue": {"kode": SOKARAJA}, "jenisVenue": "Cafe",
                                         "kebijakan": "Area merokok khusus", "lokasi": GPS},
            "entries": [ENTRY] * n, "closing": {"terlaris": [{"merek": "camel purple", "batang": 12}], "pic": "Mas Uji"}}


class Stats:
    def __init__(self):
        self.t = defaultdict(list); self.err = defaultdict(list)

    async def call(self, c, name, method, url, ok=(200,), **kw):
        t0 = time.perf_counter()
        try:
            r = await c.request(method, url, **kw)
            code = r.status_code
        except httpx.HTTPError as e:
            r, code = None, type(e).__name__
        self.t[name].append(time.perf_counter() - t0)
        if code not in ok:
            self.err[name].append(code)
        return r


async def token(c, s, u, p):
    r = await s.call(c, "login", "POST", "/auth/login", json={"username": u, "password": p})
    return {"authorization": f"Bearer {r.json()['data']['accessToken']}"} if r is not None and r.status_code == 200 else None


async def spg(api, s, u, rounds):
    async with httpx.AsyncClient(base_url=api, timeout=60) as c:
        h = await token(c, s, u, "Rahasia123")
        if not h:
            return
        await s.call(c, "forms", "GET", "/forms", headers=h)
        for _ in range(rounds):
            await s.call(c, "mine", "GET", "/reports/mine", headers=h)
            rid = str(uuid.uuid4())
            for n in (1, 2, 3):                       # autosave setiap responden bertambah
                await s.call(c, "save", "PUT", f"/reports/{rid}", headers=h, json=report(n))
            await s.call(c, "submit", "POST", f"/reports/{rid}/submit", headers=h)


async def admin(api, s, user, pw, rounds):
    async with httpx.AsyncClient(base_url=api, timeout=60) as c:
        h = await token(c, s, user, pw)
        if not h:
            return
        for i in range(rounds * 3):
            await s.call(c, "dashboard", "GET", "/dashboard", headers=h, params={"type": "HORECA", **([{}, {"produk": "Guava"}, {"minat": "beli"}][i % 3])})
            await s.call(c, "review", "GET", "/review", headers=h)
            if i == 0:
                await s.call(c, "excel", "GET", "/dashboard/export.xlsx", headers=h, params={"type": "HORECA"})


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://localhost:4000/api/v1")
    ap.add_argument("--admin-user", default="admin"); ap.add_argument("--admin-pass", required=True)
    ap.add_argument("--spg", type=int, default=60); ap.add_argument("--admins", type=int, default=5); ap.add_argument("--rounds", type=int, default=3)
    a = ap.parse_args()
    tag = uuid.uuid4().hex[:5]; s = Stats()
    async with httpx.AsyncClient(base_url=a.api, timeout=60) as c:
        h = await token(c, s, a.admin_user, a.admin_pass)
        if not h:
            raise SystemExit("Login admin gagal")
        users = []
        for i in range(a.spg):
            u = f"lt-{tag}-{i:02d}"
            r = await c.post("/users", headers=h, json={"username": u, "name": f"Uji Beban {i:02d}", "password": "Rahasia123", "role": "SPG", "tugas": ["HORECA"]})
            r.raise_for_status(); users.append(u)
    s = Stats()  # login persiapan tidak dihitung
    print(f"Mulai: {a.spg} SPG + {a.admins} admin bersamaan, {a.rounds} laporan per SPG …")
    t0 = time.perf_counter()
    await asyncio.gather(*[spg(a.api, s, u, a.rounds) for u in users], *[admin(a.api, s, a.admin_user, a.admin_pass, a.rounds) for _ in range(a.admins)])
    dur = time.perf_counter() - t0
    total = sum(len(v) for v in s.t.values()); errs = sum(len(v) for v in s.err.values())
    print(f"\n{total} permintaan dalam {dur:.1f} dtk ({total / dur:.0f}/dtk) · error: {errs}")
    print(f"{'jenis':<10}{'jumlah':>8}{'p50 ms':>9}{'p95 ms':>9}{'maks ms':>9}  error")
    for k, v in s.t.items():
        v = sorted(v); p95 = v[min(len(v) - 1, int(len(v) * 0.95))]
        print(f"{k:<10}{len(v):>8}{statistics.median(v) * 1000:>9.0f}{p95 * 1000:>9.0f}{v[-1] * 1000:>9.0f}  {s.err.get(k) or ''}")
    raise SystemExit(1 if errs else 0)


if __name__ == "__main__":
    asyncio.run(main())
