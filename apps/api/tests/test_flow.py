import uuid

from sqlalchemy import text

from .conftest import CILACAP_TENGAH, KEMBARAN, KUTASARI, SOKARAJA, jpeg

rid = lambda: str(uuid.uuid4())
GPS = {"lat": -7.4213, "lon": 109.2345, "acc": 12}


def horeca_entry(photo_id=None, setuju="YA"):
    e = {"dewasa": True, "usia": "25–34", "domisili": {"kode": KEMBARAN}, "rokokBiasa": "camel purple", "tempatBeli": "Minimarket", "rasa": "Sedang",
         "statusTT": "TAHU_BELUM_COBA", "alasan": "Ragu dengan rasa", "tahuDari": "Event", "sampel": "Guava", "kekuatan": "Pas", "asap": "Halus, nyaman",
         "beli": {"Guava": 1}, "alasanBeli": "Rasa cocok", "fotoSetuju": setuju}
    if photo_id: e["foto"] = {"id": photo_id}
    return e


def horeca_report(entries, kec=SOKARAJA):
    return {"type": "HORECA", "header": {"venue": "kopi senja", "alamat": "Jl. Raya 1", "kecVenue": {"kode": kec}, "jenisVenue": "Cafe", "kebijakan": "Area merokok khusus", "lokasi": GPS},
            "entries": entries, "closing": {"terlaris": [{"merek": "camel purple", "batang": 12}], "pic": "Mas Dani"}}


def test_auth_refresh_rotation_and_reuse(client, admin, monkeypatch):
    from fastapi.testclient import TestClient
    from app.config import settings
    from app.main import app
    # Sinyal putus saat sesi diperbarui (jawaban server tidak sampai ke HP): token lama dipakai lagi dalam jendela
    # tenggang → tetap dapat sesi baru, SPG tidak ter-logout.
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-1"}).status_code == 200
    first = c.cookies.get("tt_refresh")
    assert c.post("/api/v1/auth/refresh").status_code == 200                       # jawaban ini "hilang"
    lost = TestClient(app); lost.cookies.set("tt_refresh", first, path="/api/v1/auth")
    assert lost.post("/api/v1/auth/refresh").status_code == 200                    # HP mencoba lagi dengan token lama
    assert c.post("/api/v1/auth/refresh").status_code == 200 and lost.post("/api/v1/auth/refresh").status_code == 200
    import dataclasses
    from app.routers import auth as auth_router
    monkeypatch.setattr(auth_router, "settings", dataclasses.replace(settings, refresh_reuse_grace_s=0))   # di luar jendela tenggang: dianggap pencurian
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"username": "admin", "password": "salah"}).status_code == 401
    r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "admin-pass-1"}); assert r.status_code == 200
    old = c.cookies.get("tt_refresh")
    assert c.post("/api/v1/auth/refresh").status_code == 200
    c2 = TestClient(app); c2.cookies.set("tt_refresh", old, path="/api/v1/auth")
    assert c2.post("/api/v1/auth/refresh").status_code == 401           # token lama dipakai ulang → ditolak
    assert c.post("/api/v1/auth/refresh").status_code == 401            # dan seluruh rangkaian sesi dicabut


def test_forms_served_and_settings_admin_only(admin, make_user):
    f = admin.get("/forms").json()["data"]
    assert set(f["forms"]) == {"GROSIR", "HORECA", "REGULER"} and f["settings"]["variants"]
    spv = make_user("SPV")
    assert spv.put("/settings", json={"brand": "X", "variants": ["A"]}).status_code == 403
    r = admin.put("/settings", json={"brand": "Tanda Tambah", "variants": ["Original", "watermelon", "Guava", "original"], "grosirs": ["grosir makmur"]})
    assert r.json()["data"]["variants"] == ["Original", "Watermelon", "Guava"]


def test_spg_tugas_validation_and_isolation(make_user):
    a = make_user("SPG", ["GROSIR", "HORECA"]); b = make_user("SPG", ["REGULER"])
    assert b.put(f"/reports/{rid()}", json=horeca_report([])).status_code == 403          # tugas tidak diberikan
    r = a.put(f"/reports/{(i := rid())}", json={"type": "HORECA", "header": {"venue": "x"}})
    assert r.status_code == 422 and "kecVenue" in r.json()["error"]["details"]["header"]
    r = a.put(f"/reports/{i}", json=horeca_report([]))
    assert r.status_code == 200
    d = r.json()["data"]
    assert d["data"]["header"]["venue"] == "Kopi Senja" and d["data"]["header"]["kecVenue"]["nama"] == "Sokaraja"   # nama resmi dari master
    assert d["spvNames"] == []
    assert a.put(f"/reports/{rid()}", json=horeca_report([])).status_code == 409             # hanya satu laporan terbuka
    assert b.put(f"/reports/{i}", json={**horeca_report([]), "type": "HORECA"}).status_code == 404   # SPG lain tidak bisa menyentuh
    assert b.post(f"/reports/{i}/submit").status_code == 404
    assert a.delete(f"/reports/{i}").status_code == 200


def test_save_lite_and_gzip(make_user):
    s = make_user("SPG", ["HORECA"]); i = rid()
    r = s.c.put(f"/api/v1/reports/{i}?lite=1", json=horeca_report([{**horeca_entry(setuju="TIDAK"), "at": "2026-11-12T01:00:00+00:00"}] * 40),
                     headers={**s.h, "accept-encoding": "gzip"})
    d = r.json()["data"]
    assert r.status_code == 200 and "data" not in d and d["version"] == 1 and d["entryCount"] == 40   # HP cukup dapat versi & status
    r = s.c.get("/api/v1/reports/mine", headers={**s.h, "accept-encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"                                                 # data dikompres


def test_hidden_answers_dropped_and_rules(make_user):
    s = make_user("SPG", ["REGULER"])
    e = {"gps": GPS, "namaOutlet": "toko berkah", "tipeOutlet": "Minimarket", "kecOutlet": {"kode": KEMBARAN}, "statusOutlet": "BELUM", "facingTotal": 40,
         "stok": {"Original": "ADA"}, "facingTT": 5, "posm": "Tidak ada", "beli": {}, "alasanTidak": "Belum laku", "kompetitor": "surya 16", "promoKomp": "Diskon"}
    r = s.put(f"/reports/{(i := rid())}", json={"type": "REGULER", "header": {"kecRute": {"kode": KEMBARAN}, "lokasi": GPS}, "entries": [e]})
    assert r.status_code == 200, r.text
    got = r.json()["data"]["data"]["entries"][0]
    assert "stok" not in got and "facingTT" not in got          # hanya untuk outlet yang menjual TT
    e2 = {**e, "statusOutlet": "JUAL", "stok": {"Original": "ADA", "Watermelon": "KOSONG", "Guava": "ADA"}, "facingTT": 50}
    r = s.put(f"/reports/{i}", json={"type": "REGULER", "header": {"kecRute": {"kode": KEMBARAN}, "lokasi": GPS}, "entries": [e2]})
    assert r.status_code == 422 and "facingTT" in r.json()["error"]["details"]["entries.0"]


def test_photo_consent_and_ownership(make_user):
    a = make_user("SPG", ["HORECA"]); b = make_user("SPG", ["HORECA"])
    assert a.post("/photos", files={"file": ("x.txt", b"bukan gambar", "text/plain")}).status_code == 415
    pid = a.post("/photos", files={"file": ("a.jpg", jpeg(), "image/jpeg")}).json()["data"]["id"]
    assert a.get(f"/photos/{pid}").status_code == 200 and b.get(f"/photos/{pid}").status_code == 404
    k = rid()
    assert a.put(f"/reports/{k}", json=horeca_report([horeca_entry()])).status_code == 200       # setuju difoto tapi belum ada foto: draf boleh disimpan …
    r = a.post(f"/reports/{k}/submit")                                                          # … tapi tidak bisa dikirim
    assert r.status_code == 422 and "foto" in r.json()["error"]["details"]["entries.0"]
    assert a.delete(f"/reports/{k}").status_code == 200
    r = b.put(f"/reports/{rid()}", json=horeca_report([horeca_entry(pid)]))                 # foto milik SPG lain
    assert r.status_code == 422
    j = rid()
    r = a.put(f"/reports/{j}", json=horeca_report([{**horeca_entry(setuju="TIDAK"), "promo": "Diskon harga"}]))  # tidak bersedia → boleh tanpa foto
    assert r.status_code == 200
    assert "promo" not in r.json()["data"]["data"]["entries"][0]                               # pertanyaan promo sudah dihapus dari form
    for pilihan in ("SPG", "SPG sebelumnya"):                                                   # "SPG sekarang" (kode lama SPG) & "SPG sebelumnya"
        e = {**horeca_entry(setuju="TIDAK"), "tahuDari": pilihan}
        r = a.put(f"/reports/{j}", json=horeca_report([e]))                                  # perbarui laporan yang sama
        assert r.json()["data"]["data"]["entries"][0]["tahuDari"] == pilihan


def test_spv_routing_approval_and_dashboard(admin, make_user):
    spv = make_user("SPV", name="Sari Wulandari"); other = make_user("SPV", name="Budi Spv")
    assert admin.post(f"/users/{spv.user['id']}/coverage", json={"level": "KAB", "kode": "33.02"}).status_code == 200
    assert admin.post(f"/users/{spv.user['id']}/coverage", json={"level": "KEC", "kode": KUTASARI}).status_code == 200
    assert admin.post(f"/users/{spv.user['id']}/coverage", json={"level": "KEC", "kode": SOKARAJA}).status_code == 409   # sudah tercakup kab
    assert admin.post(f"/users/{other.user['id']}/coverage", json={"level": "KEC", "kode": KUTASARI}).status_code == 200
    users = admin.get("/users?role=SPV").json()["data"]
    assert any(u["overlaps"] for u in users if u["id"] == spv.user["id"])                  # tumpang tindih terdeteksi

    g = make_user("SPG", ["HORECA", "GROSIR"], name="Ani Lestari")
    pid = g.post("/photos", files={"file": ("a.jpg", jpeg(), "image/jpeg")}).json()["data"]["id"]
    i1 = rid()
    assert g.put(f"/reports/{i1}", json=horeca_report([horeca_entry(pid)])).json()["data"]["spvNames"] == ["Sari Wulandari"]
    assert g.post(f"/reports/{i1}/submit").status_code == 200
    q = spv.get("/review").json()
    assert [x["id"] for x in q["data"]] == [i1] and q["data"][0]["canDecide"]
    assert other.post(f"/review/{i1}/approve").status_code == 403                           # di luar wilayah
    assert spv.post(f"/review/{i1}/reject", json={"note": "x"}).status_code == 422
    assert spv.post(f"/review/{i1}/reject", json={"note": "Foto kurang jelas"}).status_code == 200
    assert g.post(f"/reports/{i1}/rework").status_code == 200
    assert g.post(f"/reports/{i1}/submit").json()["data"]["revision"] == 1
    assert spv.post(f"/review/{i1}/approve").status_code == 200
    assert spv.post(f"/review/{i1}/approve").status_code == 409                              # tidak bisa diputus dua kali
    d = spv.get("/dashboard?type=HORECA").json()["data"]
    assert d["reports"] == 1 and any(t["k"] == "Awareness Tanda Tambah" and t["v"] == "100,0%" for t in d["tiles"])
    assert any(t["k"] == "Umur terbanyak · 25–34 th" and t["v"] == "100,0%" for t in d["tiles"])
    assert not any("Responden 18+" in t["k"] or "difoto" in t["k"] for t in d["tiles"])
    spg_t = next(p for p in d["panels"] if p["title"].startswith("Kinerja SPG"))
    labels = [c["label"] for c in spg_t["columns"]]
    assert "Pembeli" in labels and "Kontak" not in " ".join(labels) and {"label": "Bungkus", "num": True, "unit": "bks"} in spg_t["columns"]
    assert other.get("/dashboard?type=HORECA").json()["data"]["reports"] == 0                # SPV lain tidak melihat wilayah ini
    assert admin.get(f"/dashboard?type=HORECA&spv={spv.user['id']}").json()["data"]["reports"] >= 1
    assert spv.get(f"/photos/{pid}").status_code == 200
    # Pelepasan wilayah tidak menghapus riwayat; laporan yang sudah disetujui tetap ada di dashboard admin
    cov = [c for c in admin.get("/users?role=SPV").json()["data"] if c["id"] == spv.user["id"]][0]["coverage"]
    kab = [c for c in cov if c["level"] == "KAB"][0]
    assert admin.delete(f"/users/{spv.user['id']}/coverage/{kab['id']}").status_code == 200
    assert admin.get("/dashboard?type=HORECA").json()["data"]["reports"] >= 1


def test_grosir_submit_rules_admin_no_spv_and_csv(admin, make_user):
    g = make_user("SPG", ["GROSIR"])
    i = rid()
    gros = {"type": "GROSIR", "header": {"grosir": "Grosir Makmur", "kecGrosir": {"kode": CILACAP_TENGAH}, "lokasi": GPS},
            "entries": [{"jenis": "KONSUMEN", "kecamatan": {"kode": CILACAP_TENGAH}, "statusTT": "BELUM", "beli": {"Original": 2}, "alasanBeli": "Coba-coba", "tier2": "=HYPERLINK(1)"}]}
    assert g.put(f"/reports/{i}", json=gros).status_code == 200
    r = g.post(f"/reports/{i}/submit"); assert r.status_code == 422
    det = r.json()["error"]["details"]
    assert "pic" in det["closing"] and len(det["submit"]) == 2
    gros |= {"sections": {"promos": {"none": True}, "promotors": {"none": True}}, "closing": {"terlaris": [{"merek": "Surya 16", "batang": 3}], "pic": "Pak Budi"}}
    assert g.put(f"/reports/{i}", json=gros).status_code == 200
    assert g.post(f"/reports/{i}/submit").status_code == 200
    assert g.put(f"/reports/{i}", json={**gros, "closing": {"pic": "ubah"}}).status_code == 409   # terkunci setelah dikirim
    assert admin.get("/review?spv=_none").json()["data"][0]["id"] == i
    assert admin.post(f"/review/{i}/approve").status_code == 200
    csv = admin.get("/dashboard/export?type=GROSIR").text
    assert "'=HYPERLINK(1)" in csv or "'=Hyperlink(1)" in csv


def test_append_only_and_samples(admin, make_user):
    from app.db import SessionLocal
    with SessionLocal() as db:
        try:
            db.execute(text("delete from audit_log")); db.commit(); assert False, "audit_log harus append-only"
        except Exception as e:
            db.rollback(); assert "append-only" in str(e)
    assert admin.post("/admin/samples?n=30").json()["data"]["created"] == 30
    for t in ("GROSIR", "HORECA", "REGULER"):
        d = admin.get(f"/dashboard?type={t}&days=90").json()["data"]
        assert d["reports"] >= 10 and len(d["tiles"]) == 6 and d["panels"]
    assert admin.get("/dashboard?type=REGULER&tipe=Minimarket&kab=33.02").status_code == 200
    assert admin.delete("/admin/samples").json()["data"]["deleted"] == 30
    spg = make_user("SPG", ["GROSIR"])
    assert spg.get("/dashboard").status_code == 403 and spg.post("/admin/samples").status_code == 403


def test_excel_export(admin, make_user):
    import io
    from openpyxl import load_workbook
    g = make_user("SPG", ["GROSIR"], name="Excel Uji")
    i = rid()
    body = {"type": "GROSIR", "header": {"grosir": "Grosir Excel", "kecGrosir": {"kode": CILACAP_TENGAH}, "lokasi": GPS},
            "entries": [{"jenis": "RETAIL", "tipeToko": "Kios", "namaToko": "=HYPERLINK(\"x\")", "kecamatan": {"kode": CILACAP_TENGAH}, "statusTT": "JUAL",
                         "tahuDari": "Event", "beli": {"Original": 3}, "alasanBeli": "Coba-coba", "tier2": "Surya 16", "hargaGrosir": 23000}],
            "sections": {"promos": {"items": [{"merek": "L.A Lights", "aktivitas": "Diskon", "sejak": "Hari ini"}]}, "promotors": {"none": True}},
            "closing": {"terlaris": [{"merek": "Surya 16", "batang": 9}], "pic": "Pak Excel"}}
    assert g.put(f"/reports/{i}", json=body).status_code == 200 and g.post(f"/reports/{i}/submit").status_code == 200
    assert admin.post(f"/review/{i}/approve").status_code == 200
    assert g.get("/dashboard/export.xlsx?type=GROSIR").status_code == 403
    r = admin.get("/dashboard/export.xlsx?type=GROSIR&spg=Excel Uji")
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/vnd.openxmlformats")
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames[:5] == ["Ringkasan", "Analisis", "Tren harian", "Laporan", "Detail pembeli"] and len(wb.sheetnames) == 8 and wb.sheetnames[-1] == "Log isian dihapus"
    assert len(wb["Analisis"]._charts) >= 5 and len(wb["Tren harian"]._charts) >= 2
    det = wb["Detail pembeli"]; head = [c.value for c in det[1]]; row = [c.value for c in det[2]]
    assert "TT dibeli – Original" in head and row[head.index("TT dibeli – Original")] == 3
    assert row[head.index("Status TT sebelum ditawari")] == "Udah jual TT"      # label, bukan kode
    cell = det.cell(row=2, column=head.index("Nama toko") + 1)
    assert cell.data_type == "s" and cell.value.startswith("=")                                    # tidak menjadi rumus
    lap = wb["Laporan"]; lh = [c.value for c in lap[1]]
    assert lap.cell(row=2, column=lh.index("Nama grosir") + 1).value == "Grosir Excel"
    assert lap.cell(row=2, column=1).is_date                                                      # tanggal asli, bukan teks
    assert wb.sheetnames[5].startswith("Promo") and wb[wb.sheetnames[5]].max_row == 2
    import zipfile
    z = zipfile.ZipFile(io.BytesIO(admin.get("/dashboard/export-all.zip?days=30").content))
    assert sorted(z.namelist()) == ["tanda-tambah-grosir-30hari.xlsx", "tanda-tambah-horeca-30hari.xlsx", "tanda-tambah-reguler-30hari.xlsx"]
    for n in z.namelist():
        load_workbook(io.BytesIO(z.read(n)))  # setiap file valid


def test_gps_map_delete_restore(admin, make_user):
    g = make_user("SPG", ["REGULER"], name="Gita Reguler")
    i = rid()
    head = {"kecRute": {"kode": KEMBARAN}}
    r = g.put(f"/reports/{i}", json={"type": "REGULER", "header": {**head, "lokasi": {"lat": 999, "lon": 1}}})
    assert r.status_code == 422 and "lokasi" in r.json()["error"]["details"]["header"]           # koordinat tidak masuk akal ditolak
    # Draf lama tanpa lokasi (dibuat sebelum ada pertanyaan GPS) tetap bisa disimpan & ditambah outlet …
    assert g.put(f"/reports/{i}", json={"type": "REGULER", "header": head}).status_code == 200
    assert g.put(f"/reports/{i}", json={"type": "REGULER", "header": head, "entries": [{"namaOutlet": "Toko Tanpa GPS", "kecOutlet": {"kode": KEMBARAN}}]}).status_code == 200
    r = g.post(f"/reports/{i}/submit")                                                           # … tapi tidak bisa dikirim sebelum lengkap
    d = r.json()["error"]["details"]
    assert r.status_code == 422 and "lokasi" in d["header"] and "gps" in d["entries.0"]
    assert g.put(f"/reports/{i}", json={"type": "REGULER", "header": {"lokasi": GPS}}).status_code == 422   # kecamatan rute tetap wajib
    outlet = {"gps": {"lat": -7.43, "lon": 109.25, "acc": 9}, "namaOutlet": "Toko Peta", "tipeOutlet": "Kios", "kecOutlet": {"kode": KEMBARAN},
              "statusOutlet": "BELUM", "facingTotal": 10, "posm": "Tidak ada", "beli": {"Original": 2}, "kompetitor": "Surya 16", "promoKomp": "Diskon"}
    body = {"type": "REGULER", "header": {**head, "lokasi": GPS}, "entries": [outlet]}
    assert g.put(f"/reports/{i}", json=body).status_code == 200 and g.post(f"/reports/{i}/submit").status_code == 200
    det = admin.get(f"/review/{i}").json()["data"]
    assert det["gps"]["lat"] == GPS["lat"]
    assert admin.post(f"/review/{i}/approve").status_code == 200
    d = admin.get("/dashboard?type=REGULER&spg=Gita Reguler").json()["data"]               # langsung terlihat (cache dikosongkan saat disetujui)
    peta = [p for p in d["panels"] if p["kind"] == "map"][0]
    assert [(p["lat"], p["lon"], p["label"]) for p in peta["points"]] == [(-7.43, 109.25, "Toko Peta")]
    assert admin.get("/dashboard?type=REGULER&spg=Gita Reguler&kab=33.01").json()["data"]["reports"] == 0   # peta & angka ikut filter
    # Hapus (admin saja, wajib alasan) → hilang dari SPG, antrean, dan dashboard
    spv = make_user("SPV")
    assert spv.post(f"/review/{i}/delete", json={"reason": "Data uji coba"}).status_code == 403
    assert admin.post(f"/review/{i}/delete", json={"reason": "x"}).status_code == 422
    assert admin.post(f"/review/{i}/delete", json={"reason": "Laporan ganda"}).status_code == 200
    assert i not in [x["id"] for x in g.get("/reports/mine").json()["data"]]
    assert g.put(f"/reports/{i}", json=body).status_code == 410
    assert admin.get("/dashboard?type=REGULER&spg=Gita Reguler").json()["data"]["reports"] == 0
    assert i in [x["id"] for x in admin.get("/review?status=DELETED").json()["data"]]
    assert spv.get("/review?status=DELETED").status_code == 403
    # Pulihkan → kembali ke antrean untuk disetujui ulang
    assert admin.post(f"/review/{i}/restore").json()["data"]["status"] == "SUBMITTED"
    assert [l["action"] for l in admin.get(f"/review/{i}").json()["data"]["log"]][-2:] == ["DIHAPUS", "DIPULIHKAN"]
    # Admin juga bisa menghapus laporan yang masih dikerjakan (draf) SPG
    j = rid()
    assert g.put(f"/reports/{j}", json={"type": "REGULER", "header": {**head, "lokasi": GPS}}).status_code == 200
    assert j in [x["id"] for x in admin.get("/review?status=DRAFT").json()["data"]]
    assert admin.post(f"/review/{j}/delete", json={"reason": "Draf tertinggal"}).status_code == 200
    assert g.put(f"/reports/{rid()}", json={"type": "REGULER", "header": {**head, "lokasi": GPS}}).status_code == 200   # SPG bisa mulai lagi


def test_delete_entry_by_spv_and_admin_keeps_log_and_updates_excel(admin, make_user):
    import io as _io
    from openpyxl import load_workbook
    spv = make_user("SPV", name="Sinta Hapus"); luar = make_user("SPV", name="Spv Luar")
    assert admin.post(f"/users/{spv.user['id']}/coverage", json={"level": "KAB", "kode": "33.02"}).status_code == 200
    g = make_user("SPG", ["HORECA"], name="Dewi Entri Hapus")
    ents = [{**horeca_entry(setuju="TIDAK"), "usia": u, "at": f"2026-11-12T0{n}:00:00+00:00"} for n, u in enumerate(["18–24", "25–34", "35–44"], start=1)]
    i = rid()
    assert g.put(f"/reports/{i}", json=horeca_report(ents)).status_code == 200
    body = {"index": 1, "at": ents[1]["at"], "reason": "Responden diisi dua kali"}
    assert spv.post(f"/review/{i}/entries/delete", json=body).status_code == 404               # draf belum terlihat supervisor
    assert admin.post(f"/review/{i}/entries/delete", json=body).status_code == 409             # SPG masih mengerjakan
    assert g.post(f"/reports/{i}/submit").status_code == 200
    assert g.post(f"/review/{i}/entries/delete", json=body).status_code == 403                 # SPG tidak boleh
    assert luar.post(f"/review/{i}/entries/delete", json=body).status_code == 403              # di luar wilayah
    assert spv.post(f"/review/{i}/entries/delete", json={**body, "reason": "x"}).status_code == 422
    assert spv.post(f"/review/{i}/entries/delete", json={**body, "at": "salah"}).status_code == 409
    r = spv.post(f"/review/{i}/entries/delete", json=body)
    assert r.status_code == 200 and [e["usia"] for e in r.json()["data"]["data"]["entries"]] == ["18–24", "35–44"]
    # ditolak → SPG memperbaiki & kirim ulang: catatan isian yang dihapus tetap ada
    assert spv.post(f"/review/{i}/reject", json={"note": "Lengkapi PIC venue"}).status_code == 200
    assert g.post(f"/reports/{i}/rework").status_code == 200
    d = g.get("/reports/mine").json()["data"][0]["data"]
    assert g.put(f"/reports/{i}", json={**horeca_report(d["entries"]), "version": None}).status_code == 200
    assert g.post(f"/reports/{i}/submit").status_code == 200
    assert spv.post(f"/review/{i}/approve").status_code == 200
    # setelah disetujui: admin menghapus satu isian lagi → salinan dashboard/Excel ikut berubah
    assert admin.post(f"/review/{i}/entries/delete", json={"index": 0, "at": ents[0]["at"], "reason": "Responden di bawah umur"}).status_code == 200
    det = admin.get(f"/review/{i}").json()["data"]
    assert len(det["data"]["entries"]) == 1 and [x["label"] for x in det["data"]["removed"]] == ["Responden 2 (25–34 th)", "Responden 1 (18–24 th)"]
    notes = [l["note"] for l in det["log"] if l["action"] == "ISIAN_DIHAPUS"]
    assert len(notes) == 2 and "Responden diisi dua kali" in notes[0] and det["log"][-1]["by"] == "Admin pusat"
    wb = load_workbook(_io.BytesIO(admin.get("/dashboard/export.xlsx?type=HORECA").content))
    detail = [row for row in wb["Detail responden"].iter_rows(values_only=True) if row[1] == "Dewi Entri Hapus"]
    log = [row for row in wb["Log isian dihapus"].iter_rows(values_only=True) if row[1] == "Dewi Entri Hapus"]
    assert len(detail) == 1 and len(log) == 2
    assert {row[6] for row in log} == {"Supervisor", "Admin"} and "Responden di bawah umur" in {row[8] for row in log}
    audit = admin.get("/admin/audit").json()["data"]
    assert any(a["action"] == "DELETE_ENTRY" for a in (audit.get("items") if isinstance(audit, dict) else audit))


def test_spg_history_reopen_and_activity_log(admin, make_user):
    spv = make_user("SPV", name="Spv Riwayat")
    assert admin.post(f"/users/{spv.user['id']}/coverage", json={"level": "KAB", "kode": "33.02"}).status_code == 200
    luar = make_user("SPV", name="Spv Lain Riwayat")
    g = make_user("SPG", ["HORECA"], name="Putri Riwayat")
    ent = {**horeca_entry(setuju="TIDAK"), "at": "2026-11-12T01:00:00+00:00"}
    i = rid()
    assert g.put(f"/reports/{i}", json=horeca_report([ent])).status_code == 200
    assert g.put(f"/reports/{i}", json=horeca_report([ent, {**ent, "at": "2026-11-12T02:00:00+00:00"}])).status_code == 200
    assert g.post(f"/reports/{i}/submit").status_code == 200
    # SPG menarik laporan yang belum diputus, mengubahnya, lalu mengirim lagi
    r = g.post(f"/reports/{i}/edit"); assert r.status_code == 200 and r.json()["data"]["status"] == "DRAFT"
    assert spv.get("/review").json()["data"] == [] or i not in [x["id"] for x in spv.get("/review").json()["data"]]
    assert g.put(f"/reports/{i}", json=horeca_report([ent])).status_code == 200
    assert g.post(f"/reports/{i}/submit").status_code == 200
    assert spv.post(f"/review/{i}/approve").status_code == 200
    before = spv.get("/dashboard?type=HORECA").json()["data"]["reports"]
    # Sudah disetujui → dibuka lagi sebagai revisi; angka lama tetap di dashboard sampai disetujui ulang
    j = rid()
    assert g.put(f"/reports/{j}", json=horeca_report([ent])).status_code == 200
    assert g.post(f"/reports/{i}/edit").status_code == 409                                   # masih ada laporan terbuka lain
    assert g.delete(f"/reports/{j}").status_code == 200
    r = g.post(f"/reports/{i}/edit"); assert r.json()["data"]["status"] == "REVISION"
    from app.services.dashboard import invalidate_cache; invalidate_cache()
    assert spv.get("/dashboard?type=HORECA").json()["data"]["reports"] == before             # angka lama tetap ada
    assert g.put(f"/reports/{i}", json=horeca_report([ent, {**ent, "at": "2026-11-12T03:00:00+00:00"}])).status_code == 200
    assert g.post(f"/reports/{i}/submit").json()["data"]["status"] == "SUBMITTED"
    # Riwayat milik SPG lengkap dengan log
    d = g.get(f"/reports/{i}").json()["data"]
    acts = [l["action"] for l in d["log"]]
    assert acts[0] == "DIBUAT" and "DISIMPAN" in acts and acts.count("DITARIK") == 2 and acts[-1] == "DIKIRIM_ULANG" and d["updatedAt"]
    assert make_user("SPG", ["HORECA"]).get(f"/reports/{i}").status_code == 404                 # SPG lain tidak bisa melihat
    # Log aktivitas: admin & supervisor wilayahnya; supervisor lain tidak melihat
    a = admin.get("/review/activity", params={"q": "Putri Riwayat"}).json()["data"]
    assert {x["action"] for x in a} >= {"DIBUAT", "DIKIRIM", "DITARIK", "DISETUJUI"} and all(x["spg"] == "Putri Riwayat" for x in a)
    assert any(x["reportId"] == i for x in spv.get("/review/activity").json()["data"])
    assert not any(x["reportId"] == i for x in luar.get("/review/activity").json()["data"])
    assert {x["action"] for x in admin.get("/review/activity", params={"kind": "putus", "q": "Putri Riwayat"}).json()["data"]} == {"DISETUJUI"}
    assert g.get("/review/activity").status_code == 403


def test_user_areas_checklist_delete_and_restore(admin, make_user):
    from fastapi.testclient import TestClient
    from app.main import app
    u = "spvarea" + uuid.uuid4().hex[:4]
    r = admin.post("/users", json={"username": u, "name": "Spv Area", "password": "pass-12345", "role": "SPV", "areas": ["33.02", "33.01"]})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert [a["kode"] for a in d["areas"]] == ["33.01", "33.02"] and {c["kode"] for c in d["coverage"]} == {"33.01", "33.02"}   # centang → wilayah persetujuan
    assert admin.post("/users", json={"username": "x" + u, "name": "Salah", "password": "pass-12345", "role": "SPG", "tugas": ["GROSIR"], "areas": ["99.99"]}).status_code == 422
    r = admin.patch(f"/users/{d['id']}", json={"areas": ["33.02"]})
    assert {c["kode"] for c in r.json()["data"]["coverage"]} == {"33.02"}                                      # hapus centang → wilayah dilepas
    g = make_user("SPG", ["HORECA"], name="Sinta Dihapus")
    assert admin.patch(f"/users/{g.user['id']}", json={"areas": ["33.03"]}).json()["data"]["area"].startswith("Kab.")
    i = rid()
    assert g.put(f"/reports/{i}", json=horeca_report([{**horeca_entry(setuju="TIDAK"), "at": "2026-11-12T01:00:00+00:00"}])).status_code == 200
    # hapus akun: tidak bisa masuk lagi, hilang dari daftar, laporan tetap ada
    assert make_user("SPV").delete(f"/users/{g.user['id']}").status_code == 403
    assert admin.delete(f"/users/{admin.user['id']}").status_code == 422                                     # tidak bisa hapus diri sendiri
    r = admin.delete(f"/users/{g.user['id']}")
    assert r.status_code == 200 and r.json()["data"]["reports"] == 1 and r.json()["data"]["openReports"] == 1
    assert g.get("/reports/mine").status_code == 401
    c = TestClient(app)
    assert c.post("/api/v1/auth/login", json={"username": g.user["username"], "password": "pass-12345"}).status_code == 401
    assert g.user["id"] not in [x["id"] for x in admin.get("/users").json()["data"]]
    assert g.user["id"] in [x["id"] for x in admin.get("/users?deleted=1").json()["data"]]
    assert admin.get(f"/review/{i}").json()["data"]["spg"]["name"] == "Sinta Dihapus"
    assert admin.post("/users", json={"username": g.user["username"], "name": "Baru", "password": "pass-12345", "role": "SPG", "tugas": ["GROSIR"]}).json()["error"]["message"].startswith("Username ini milik akun yang sudah dihapus")
    r = admin.delete(f"/users/{d['id']}")                                                                      # supervisor: wilayahnya dilepas
    assert r.json()["data"]["released"] == ["Kab. Banyumas (seluruh)"] or r.json()["data"]["released"]
    assert d["id"] not in [s["id"] for s in admin.get("/users?role=SPV").json()["data"]]
    # pulihkan
    assert admin.post(f"/users/{g.user['id']}/restore").status_code == 200
    assert c.post("/api/v1/auth/login", json={"username": g.user["username"], "password": "pass-12345"}).status_code == 200
    acts = {a["action"] for a in admin.get("/admin/audit").json()["data"]}
    assert {"DELETE_USER", "RESTORE_USER"} <= acts


def test_dashboard_produk_and_minat_filters(admin, make_user):
    from app.services.dashboard import invalidate_cache
    g = make_user("SPG", ["HORECA"], name="Filter Produk")
    base = {**horeca_entry(setuju="TIDAK")}
    ents = [{**base, "beli": {"Guava": 2, "Original": 1}, "at": "2026-11-13T01:00:00+00:00"},
            {**base, "beli": {"Original": 3}, "at": "2026-11-13T02:00:00+00:00"},
            {**base, "beli": {}, "alasanBeli": None, "alasanTidak": "Harga tidak sesuai", "at": "2026-11-13T03:00:00+00:00"}]
    i = rid()
    assert g.put(f"/reports/{i}", json=horeca_report(ents, kec=KUTASARI)).status_code == 200
    r = g.post(f"/reports/{i}/submit"); assert r.status_code == 200, r.text
    assert admin.post(f"/review/{i}/approve").status_code == 200
    invalidate_cache()
    q = {"type": "HORECA", "spg": "Filter Produk"}
    def tiles(**kw):
        d = admin.get("/dashboard", params={**q, **kw}).json()["data"]
        return {t["k"]: t["v"] for t in d["tiles"]}, d
    t, d = tiles()
    assert t["Bungkus terjual"] == "6 bks" and d["produkOptions"] == ["Original", "Watermelon", "Guava"]
    t, d = tiles(produk="Guava")
    assert t["Bungkus terjual"] == "2 bks"                                              # hanya varian Guava
    var = next(p for p in d["panels"] if p["title"] == "Penjualan per varian")
    assert [r["label"] for r in var["rows"]] == ["Guava"] and var["unit"] == " bks"
    spg_t = next(p for p in d["panels"] if p["title"].startswith("Kinerja SPG"))
    assert spg_t["rows"][0][2:4] == [3, 1]                                              # 3 responden, 1 pembeli Guava
    t, d = tiles(minat="beli")
    spg_t = next(p for p in d["panels"] if p["title"].startswith("Kinerja SPG"))
    assert spg_t["rows"][0][2:4] == [2, 2] and t["Bungkus terjual"] == "6 bks"         # hanya yang membeli
    t, d = tiles(minat="tidak")
    spg_t = next(p for p in d["panels"] if p["title"].startswith("Kinerja SPG"))
    assert spg_t["rows"][0][2:4] == [1, 0] and t["Bungkus terjual"] == "0 bks"         # hanya yang tidak minat beli
    t, d = tiles(produk="Watermelon", minat="beli")
    assert d["reports"] == 0                                                            # tidak ada yang membeli Watermelon
    assert admin.get("/dashboard", params={**q, "minat": "salah"}).status_code == 422
    r = admin.get("/dashboard/export.xlsx", params={**q, "produk": "Guava", "minat": "beli"})
    from openpyxl import load_workbook
    import io as _io
    wb = load_workbook(_io.BytesIO(r.content))
    summary = {row[0]: row[1] for row in wb["Ringkasan"].iter_rows(values_only=True)}
    assert summary["Filter produk"] == "Guava" and summary["Filter minat beli"].startswith("membeli")
