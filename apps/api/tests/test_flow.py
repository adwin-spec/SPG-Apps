import uuid

from sqlalchemy import text

from .conftest import CILACAP_TENGAH, KEMBARAN, KUTASARI, SOKARAJA, jpeg

rid = lambda: str(uuid.uuid4())


def horeca_entry(photo_id=None, setuju="YA"):
    e = {"dewasa": True, "usia": "25–34", "domisili": {"kode": KEMBARAN}, "rokokBiasa": "camel purple", "tempatBeli": "Minimarket", "rasa": "Sedang",
         "statusTT": "TAHU_BELUM_COBA", "alasan": "Ragu dengan rasa", "tahuDari": "Event", "sampel": "Guava", "kekuatan": "Pas", "asap": "Halus, nyaman",
         "beli": {"Guava": 1}, "alasanBeli": "Rasa cocok", "promo": "Diskon harga", "fotoSetuju": setuju}
    if photo_id: e["foto"] = {"id": photo_id}
    return e


def horeca_report(entries, kec=SOKARAJA):
    return {"type": "HORECA", "header": {"venue": "kopi senja", "alamat": "Jl. Raya 1", "kecVenue": {"kode": kec}, "jenisVenue": "Cafe", "kebijakan": "Area merokok khusus"},
            "entries": entries, "closing": {"terlaris": [{"merek": "camel purple", "batang": 12}], "pic": "Mas Dani"}}


def test_auth_refresh_rotation_and_reuse(client, admin):
    from fastapi.testclient import TestClient
    from app.main import app
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


def test_hidden_answers_dropped_and_rules(make_user):
    s = make_user("SPG", ["REGULER"])
    e = {"namaOutlet": "toko berkah", "tipeOutlet": "Minimarket", "kecOutlet": {"kode": KEMBARAN}, "statusOutlet": "BELUM", "facingTotal": 40,
         "stok": {"Original": "ADA"}, "facingTT": 5, "posm": "Tidak ada", "beli": {}, "alasanTidak": "Belum laku", "kompetitor": "surya 16", "promoKomp": "Diskon"}
    r = s.put(f"/reports/{(i := rid())}", json={"type": "REGULER", "header": {"kecRute": {"kode": KEMBARAN}}, "entries": [e]})
    assert r.status_code == 200, r.text
    got = r.json()["data"]["data"]["entries"][0]
    assert "stok" not in got and "facingTT" not in got          # hanya untuk outlet yang menjual TT
    e2 = {**e, "statusOutlet": "JUAL", "stok": {"Original": "ADA", "Watermelon": "KOSONG", "Guava": "ADA"}, "facingTT": 50}
    r = s.put(f"/reports/{i}", json={"type": "REGULER", "header": {"kecRute": {"kode": KEMBARAN}}, "entries": [e2]})
    assert r.status_code == 422 and "facingTT" in r.json()["error"]["details"]["entries.0"]


def test_photo_consent_and_ownership(make_user):
    a = make_user("SPG", ["HORECA"]); b = make_user("SPG", ["HORECA"])
    assert a.post("/photos", files={"file": ("x.txt", b"bukan gambar", "text/plain")}).status_code == 415
    pid = a.post("/photos", files={"file": ("a.jpg", jpeg(), "image/jpeg")}).json()["data"]["id"]
    assert a.get(f"/photos/{pid}").status_code == 200 and b.get(f"/photos/{pid}").status_code == 404
    r = a.put(f"/reports/{rid()}", json=horeca_report([horeca_entry()]))                     # setuju difoto tapi tanpa foto
    assert r.status_code == 422 and "foto" in r.json()["error"]["details"]["entries.0"]
    r = b.put(f"/reports/{rid()}", json=horeca_report([horeca_entry(pid)]))                 # foto milik SPG lain
    assert r.status_code == 422
    r = a.put(f"/reports/{rid()}", json=horeca_report([horeca_entry(setuju="TIDAK")]))      # tidak bersedia → boleh tanpa foto
    assert r.status_code == 200


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
    assert d["reports"] == 1 and any(t["k"] == "Responden difoto" and t["v"] == "100,0%" for t in d["tiles"])
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
    gros = {"type": "GROSIR", "header": {"grosir": "Grosir Makmur", "kecGrosir": {"kode": CILACAP_TENGAH}},
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
    body = {"type": "GROSIR", "header": {"grosir": "Grosir Excel", "kecGrosir": {"kode": CILACAP_TENGAH}},
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
    assert wb.sheetnames[:3] == ["Ringkasan", "Laporan", "Detail pembeli"] and len(wb.sheetnames) == 5
    det = wb["Detail pembeli"]; head = [c.value for c in det[1]]; row = [c.value for c in det[2]]
    assert "Tanda Tambah yang dibeli – Original" in head and row[head.index("Tanda Tambah yang dibeli – Original")] == 3
    assert row[head.index("Status Tanda Tambah sebelum ditawari hari ini")] == "Sudah jual TT"      # label, bukan kode
    cell = det.cell(row=2, column=head.index("Nama toko") + 1)
    assert cell.data_type == "s" and cell.value.startswith("=")                                    # tidak menjadi rumus
    lap = wb["Laporan"]; lh = [c.value for c in lap[1]]
    assert lap.cell(row=2, column=lh.index("Nama grosir") + 1).value == "Grosir Excel"
    assert lap.cell(row=2, column=1).is_date                                                      # tanggal asli, bukan teks
    assert wb.sheetnames[3].startswith("Promo") and wb[wb.sheetnames[3]].max_row == 2
