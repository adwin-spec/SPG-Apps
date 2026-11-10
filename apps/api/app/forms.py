"""DEFINISI FORM SPG – file utama yang paling sering diubah.

Semua form di aplikasi HP (Grosir, HORECA, Reguler) dibangun dari file ini:
  • Server memakai definisi ini untuk MEMVALIDASI isian.
  • Aplikasi HP mengambilnya lewat GET /api/v1/forms lalu MENAMPILKAN pertanyaannya.
Jadi cukup ubah di sini (tanpa menyentuh frontend, tanpa migrasi database), lalu restart server.

Bentuk satu pertanyaan:
    q("id_unik", "Label pertanyaan", "jenis", required=True, options=..., show=..., hint=...)

Jenis pertanyaan:
    single     pilihan tunggal (chip)           → options wajib
    multi      pilihan ganda (chip, bisa > 1)   → options wajib
    text       teks bebas satu baris            → suggest="brands" | "grosirs" | "outlets" untuk saran isian
    textarea   teks panjang
    number     angka ≥ 0                        → rules={"min": 1} atau {"lte_field": "facingTotal"}
    variants   jumlah bungkus per varian merek (varian diatur di menu Pengaturan)
    stok       status stok per varian: Ada / Kosong / Tidak jual
    confirm    satu centang wajib (mis. konfirmasi 18+)
    kecamatan  pilih kecamatan dari master wilayah
    photo      foto dari kamera HP              → capture="user" (kamera depan) | "environment" (belakang)
    brandcounts  beberapa baris "merek + jumlah batang" → rows=3

Kapan pertanyaan tampil (show) – kondisi sederhana yang dimengerti server dan aplikasi HP:
    when("jenis", eq="RETAIL")              jawaban sama dengan
    when("statusTT", ne="BELUM")            jawaban terisi dan tidak sama dengan
    when("statusTT", isin=["BARU", "LAMA"]) jawaban salah satu dari
    when("dewasa")                          jawaban terisi / dicentang
    when("beli", sum_gt=0)                  total bungkus > 0
    when("beli", sum_eq=0)                  total bungkus = 0 (atau belum diisi)
    all_of(a, b, ...) / any_of(a, b, ...)   gabungan kondisi

Pilihan yang berubah mengikuti jawaban lain:
    options=by("jenis", RETAIL=[...], KONSUMEN=[...])
Pilihan berupa varian merek + tambahan:
    options=variants_plus("Lebih dari 1 varian", "Tidak mencoba")

Pilihan bisa ditulis sebagai teks biasa "Kios", atau pasangan ("KODE", "Label tampil") bila kode
yang disimpan berbeda dengan teks yang ditampilkan.
"""
from typing import Any

# ───────────────────────────── helper (tidak perlu diubah) ─────────────────────────────


def q(id: str, label: str, type: str, required: bool = False, **kw: Any) -> dict:
    return {"id": id, "label": label, "type": type, "required": required, **kw}


def when(field: str, eq: Any = None, ne: Any = None, isin: list | None = None, sum_gt: int | None = None, sum_eq: int | None = None) -> dict:
    c: dict = {"f": field}
    if eq is not None: c["eq"] = eq
    if ne is not None: c["ne"] = ne
    if isin is not None: c["in"] = isin
    if sum_gt is not None: c["sum_gt"] = sum_gt
    if sum_eq is not None: c["sum_eq"] = sum_eq
    return c


def all_of(*c: dict) -> dict:
    return {"all": list(c)}


def any_of(*c: dict) -> dict:
    return {"any": list(c)}


def by(field: str, **mapping: list) -> dict:
    return {"by": field, "map": mapping}


def variants_plus(*extra: str) -> dict:
    return {"variants": True, "extra": list(extra)}


# ───────────────────────────── MASTER PILIHAN ─────────────────────────────
O = {
    "jenisPembeli": [("RETAIL", "Dijual lagi (punya toko)"), ("KONSUMEN", "Dihisap sendiri (konsumen)")],
    "tipeToko": ["Warung Madura", "Kios", "Kelontong", "Kantin", "Lainnya"],
    "statusRetail": [("BELUM", "Belum tahu TT"), ("TAHU_TIDAK_JUAL", "Tahu, tidak jual"), ("JUAL", "Sudah jual TT")],
    "statusKonsumen": [("BELUM", "Belum tahu TT"), ("TAHU_BELUM_COBA", "Tahu, belum pernah coba"), ("PERNAH_COBA", "Tahu & pernah coba")],
    "tahuDariGrosir": ["Etalase toko", "Event", "Billboard", "Teman / keluarga", "SPG sebelumnya", "Media sosial", "Shopblind / banner", "Grosir / sales", "Baru tahu sekarang (ditawari SPG)", "Lainnya"],
    "alasanBeliRetail": ["Konsumen yang minta", "Harga / margin bagus", "Ada kupon / hadiah", "Ditawari SPG", "Coba-coba"],
    "alasanBeliKonsumen": ["Rasa cocok", "Harga sesuai", "Ada kupon / hadiah", "Ditawari SPG", "Coba-coba"],
    "alasanTidakRetail": ["Harga", "Belum laku", "Stok masih ada", "Belum tahu produk", "Lainnya"],
    "alasanTidakKonsumen": ["Harga tidak sesuai", "Rasa kurang cocok", "Sudah ada merek tetap", "Belum tahu produk", "Lainnya"],
    "aktivitasKompetitor": ["Diskon", "Bonus / gratis", "Hadiah / undian", "Promotor tambahan", "Display / rak baru", "Shopblind baru", "Lainnya"],
    "sejak": ["Hari ini", "Minggu ini", "Sekitar 3 bulan lalu", "Lebih dari 3 bulan"],
    "aktivitasPromotor": ["Menawari toko", "Bagi sampel / kupon", "Pasang / rapikan display", "Pasang shopblind", "Lainnya"],
    "jenisVenue": ["Cafe", "Warkop", "Warung makan", "Restaurant", "Kantin", "Angkringan", "Bar / hiburan", "Outdoor", "Lainnya"],
    "kebijakan": ["Boleh merokok di dalam", "Area merokok khusus", "Hanya teras / outdoor", "Dilarang merokok"],
    "usia": ["18–24", "25–34", "35–44", "45+"],
    "tempatBeli": ["Kelontong / Madura", "Minimarket", "Cafe / bar", "Warkop", "Di venue ini", "Grosir", "Ojol / aplikasi"],
    "rasaDisukai": ["Bold", "Sedang", "Soft", "Fruity / mentol", "Bebas"],
    "statusHoreca": [("BELUM", "Belum tahu TT"), ("TAHU_BELUM_COBA", "Tahu, belum coba"), ("BERHENTI", "Pernah beli, sudah berhenti"), ("BARU", "Pengguna baru (< 3 bulan)"), ("LAMA", "Pengguna lama (> 3 bulan)")],
    "alasanPengguna": ["Rasa", "Asap", "Harga", "Kebiasaan / rekomendasi", "Lainnya"],
    "alasanBerhenti": ["Rasa", "Asap", "Harga", "Susah dicari", "Pindah ke rokok lain", "Lainnya"],
    "alasanBelumCoba": ["Belum pernah ditawari", "Ragu dengan rasa", "Sudah cocok rokok lain", "Lainnya"],
    "tahuDariHoreca": ["Etalase toko", "Event", "Billboard / banner", "Teman / keluarga", "SPG", "Media sosial"],
    "kekuatan": ["Terlalu ringan", "Pas", "Terlalu kuat"],
    "asap": ["Halus, nyaman", "Tebal, mengepul", "Menyengat / perih", "Tipis", "Bau mengganggu"],
    "alasanBeliHoreca": ["Rasa cocok", "Asap nyaman", "Harga sesuai", "Promo menarik", "Kemasan menarik"],
    "alasanTidakHoreca": ["Sudah cocok rokok lain", "Rasa kurang cocok", "Asap menyengat", "Harga tidak sesuai", "Lainnya"],
    "promoDisukai": ["Diskon harga", "Beli banyak dapat bonus", "Tukar bungkus lama", "Hadiah / merchandise", "Kupon minuman venue", "Sampel gratis", "Tidak tertarik promo"],
    "fotoSetuju": [("YA", "Ya, bersedia difoto"), ("TIDAK", "Tidak bersedia")],
    # SPG Reguler
    "tipeOutlet": ["Warung Madura", "Kios", "Kelontong", "Kantin", "Minimarket", "Swalayan", "Lainnya"],
    "statusOutlet": [("JUAL", "Sudah jual TT"), ("PERNAH", "Pernah jual, sekarang tidak"), ("BELUM", "Belum pernah jual")],
    "stok": [("ADA", "Ada"), ("KOSONG", "Kosong"), ("TIDAK", "Tidak jual")],
    "posm": ["Terpasang baik", "Terpasang, rusak / kusam", "Tidak ada", "Dipasang hari ini"],
    "alasanTidakOrder": ["Stok masih banyak", "Belum laku", "Harga / margin kurang", "Pemilik tidak ada", "Sudah order lewat grosir", "Lainnya"],
    "promoKompOutlet": ["Tidak ada", "Diskon", "Bonus / gratis", "Hadiah / undian", "Display / rak baru", "Lainnya"],
}

TYPES = {"GROSIR": "Grosir", "HORECA": "HORECA", "REGULER": "Reguler"}

# ───────────────────────────── SPG GROSIR ─────────────────────────────
retail = when("jenis", eq="RETAIL")
ada_status = when("statusTT")

GROSIR_START = [
    q("grosir", "Nama grosir", "text", True, suggest="grosirs", titlecase=True),
    q("kecGrosir", "Kecamatan grosir", "kecamatan", True, hint="Menentukan supervisor yang menyetujui laporan.", location=True),
]
GROSIR_ENTRY = [
    q("jenis", "Rokoknya untuk dijual lagi atau dihisap sendiri?", "single", True, options=O["jenisPembeli"], hint="Tanyakan ke pembeli di grosir."),
    q("tipeToko", "Jenis toko", "single", True, options=O["tipeToko"], show=retail),
    q("namaToko", "Nama toko", "text", True, show=retail, placeholder="Contoh: Toko Kaka", titlecase=True),
    q("namaPembeli", "Nama pembeli", "text", False, show=when("jenis", eq="KONSUMEN")),
    q("kecamatan", "Kecamatan", "kecamatan", True, hint="Lokasi toko, atau asal konsumen.", show=when("jenis")),
    q("statusTT", "Status Tanda Tambah sebelum ditawari hari ini", "single", True,
      options=by("jenis", RETAIL=O["statusRetail"], KONSUMEN=O["statusKonsumen"]), show=when("jenis")),
    q("tahuDari", "Pertama kali tahu Tanda Tambah dari mana?", "single", True, options=O["tahuDariGrosir"], show=when("statusTT", ne="BELUM")),
    q("beli", "Tanda Tambah yang dibeli", "variants", False, hint="Jumlah bungkus per varian. Isi 0 bila tidak beli.", show=ada_status),
    q("kupon", "Kupon diberikan (lembar)", "number", False, show=ada_status, placeholder="0"),
    q("alasanBeli", "Alasan membeli", "single", True, options=by("jenis", RETAIL=O["alasanBeliRetail"], KONSUMEN=O["alasanBeliKonsumen"]),
      show=all_of(ada_status, when("beli", sum_gt=0))),
    q("alasanTidak", "Alasan tidak membeli", "single", True, options=by("jenis", RETAIL=O["alasanTidakRetail"], KONSUMEN=O["alasanTidakKonsumen"]),
      show=all_of(ada_status, when("beli", sum_eq=0))),
    q("tier2", "Merek lain yang sering dibeli / biasa dihisap", "text", True, hint="Tulis bebas merek dan varian, contoh: Camel Purple.", show=ada_status, suggest="brands", titlecase=True),
    q("hargaGrosir", "Harga grosir merek itu di sini (Rp/bks)", "number", False, show=ada_status),
    q("hargaEceran", "Harga eceran merek itu di toko (Rp/bks)", "number", False, show=all_of(retail, ada_status)),
    q("ambil", "Sampel merek itu yang dibeli SPG (bks)", "number", False, hint="Isi 0 bila tidak. Simpan bungkus dan struk.", show=ada_status),
    q("catatan", "Catatan", "textarea", False, show=ada_status),
]
GROSIR_SECTIONS = [
    {"key": "promos", "title": "Bagian 2 · Promo / aktivitas kompetitor di grosir", "none_label": "Tidak ada promo kompetitor hari ini", "questions": [
        q("merek", "Merek & varian kompetitor", "text", True, suggest="brands", placeholder="Contoh: L.A Lights", titlecase=True),
        q("aktivitas", "Aktivitas", "single", True, options=O["aktivitasKompetitor"]),
        q("detail", "Detail promo", "text", False, placeholder="Contoh: Beli 2 bks gratis kopi sachet"),
        q("sejak", "Sejak kapan", "single", True, options=O["sejak"]),
    ]},
    {"key": "promotors", "title": "Bagian 3 · Promotor kompetitor", "none_label": "Tidak ada promotor hari ini", "questions": [
        q("merek", "Merek", "text", True, suggest="brands", titlecase=True),
        q("jumlah", "Jumlah promotor (orang)", "number", True, rules={"min": 1}),
        q("aktivitas", "Aktivitas promotor", "single", True, options=O["aktivitasPromotor"]),
    ]},
]
GROSIR_CLOSING = [
    q("terlaris", "Bagian 4 · Merek terlaris di grosir hari ini", "brandcounts", True, rows=3, hint="Pengamatan SPG, jumlah batang."),
    q("catatan", "Catatan", "textarea", False),
    q("pic", "Nama PIC grosir yang mengonfirmasi (pengganti paraf & cap)", "text", True),
]

# ───────────────────────────── SURVEI HORECA ─────────────────────────────
dewasa = when("dewasa")
sudah_sampel = all_of(dewasa, when("sampel"))
mencoba = all_of(dewasa, when("sampel", ne="Tidak mencoba"))

HORECA_START = [
    q("venue", "Nama venue", "text", True, titlecase=True),
    q("alamat", "Alamat venue", "text", True),
    q("kecVenue", "Kecamatan venue", "kecamatan", True, hint="Menentukan supervisor yang menyetujui laporan.", location=True),
    q("jenisVenue", "Jenis venue", "single", True, options=O["jenisVenue"]),
    q("kebijakan", "Kebijakan merokok di venue", "single", True, options=O["kebijakan"]),
]
HORECA_ENTRY = [
    q("dewasa", "Konfirmasi responden", "confirm", True, text="Responden perokok aktif dan berusia 18 tahun ke atas", hint="Survei dan sampel hanya untuk perokok aktif dewasa."),
    q("usia", "Usia", "single", True, options=O["usia"], show=dewasa),
    q("domisili", "Domisili (kecamatan)", "kecamatan", True, show=dewasa),
    q("rokokBiasa", "Rokok yang biasa dihisap", "text", True, hint="Tulis bebas merek dan varian.", show=dewasa, suggest="brands", titlecase=True),
    q("tempatBeli", "Biasa beli rokok di mana?", "single", True, options=O["tempatBeli"], show=dewasa),
    q("rasa", "Rasa yang disukai", "single", True, options=O["rasaDisukai"], show=dewasa),
    q("statusTT", "Status Tanda Tambah", "single", True, options=O["statusHoreca"], show=dewasa),
    q("alasan", "Alasannya?", "single", True, hint="Pengguna: kenapa memakai TT. Berhenti: kenapa berhenti. Belum coba: kenapa belum.",
      options=by("statusTT", BARU=O["alasanPengguna"], LAMA=O["alasanPengguna"], BERHENTI=O["alasanBerhenti"], BELUM=O["alasanBelumCoba"], TAHU_BELUM_COBA=O["alasanBelumCoba"]),
      show=all_of(dewasa, when("statusTT"))),
    q("tahuDari", "Tahu Tanda Tambah dari mana?", "single", True, options=O["tahuDariHoreca"], show=all_of(dewasa, when("statusTT", ne="BELUM"))),
    q("sampel", "Varian sampel yang dicoba", "single", True, options=variants_plus("Lebih dari 1 varian", "Tidak mencoba"), show=all_of(dewasa, when("statusTT"))),
    q("kekuatan", "Setelah mencoba: kekuatan rasa", "single", True, options=O["kekuatan"], show=mencoba),
    q("asap", "Setelah mencoba: asapnya", "single", True, options=O["asap"], show=mencoba),
    q("beli", "Tanda Tambah yang dibeli", "variants", False, hint="Jumlah bungkus per varian. Isi 0 bila tidak beli.", show=sudah_sampel),
    q("alasanBeli", "Alasan membeli", "single", True, options=O["alasanBeliHoreca"], show=all_of(sudah_sampel, when("beli", sum_gt=0))),
    q("alasanTidak", "Alasan tidak membeli", "single", True, options=O["alasanTidakHoreca"], show=all_of(sudah_sampel, when("beli", sum_eq=0))),
    q("promo", "Promo yang paling disukai", "single", True, options=O["promoDisukai"], show=sudah_sampel),
    q("fotoSetuju", "Responden bersedia difoto bersama SPG?", "single", True, options=O["fotoSetuju"], show=sudah_sampel,
      hint="Minta izin dulu. Foto hanya untuk bukti kunjungan internal dan tidak dipublikasikan."),
    q("foto", "Foto SPG bersama responden", "photo", True, capture="user", show=all_of(dewasa, when("fotoSetuju", eq="YA")),
      hint="Wajah responden dan produk Tanda Tambah terlihat jelas. Tanggal, jam, dan nama SPG tercetak otomatis di foto."),
    q("catatan", "Catatan", "textarea", False, show=sudah_sampel, placeholder="Contoh: tanya stok di warung dekat rumah"),
]
HORECA_CLOSING = [
    q("terlaris", "Merek yang paling banyak dihisap di venue", "brandcounts", True, rows=3, hint="Pengamatan SPG, jumlah batang."),
    q("korek", "Korek api diberikan", "number", False),
    q("catatan", "Catatan", "textarea", False),
    q("pic", "Nama PIC venue yang mengonfirmasi (pengganti paraf & cap)", "text", True),
]

# ───────────────────────────── SPG REGULER (kunjungan outlet) ─────────────────────────────
jual = when("statusOutlet", eq="JUAL")
ada_outlet = when("statusOutlet")

REGULER_START = [
    q("rute", "Nama rute", "text", False, placeholder="Contoh: Rute Sokaraja – Selasa", titlecase=True),
    q("kecRute", "Kecamatan rute utama", "kecamatan", True, location=True,
      hint="Menentukan supervisor yang menyetujui laporan. Outlet di kecamatan lain tetap bisa dicatat."),
]
REGULER_ENTRY = [
    q("namaOutlet", "Nama outlet", "text", True, suggest="outlets", placeholder="Contoh: Toko Berkah", titlecase=True),
    q("tipeOutlet", "Tipe outlet", "single", True, options=O["tipeOutlet"]),
    q("kecOutlet", "Kecamatan outlet", "kecamatan", True),
    q("statusOutlet", "Status Tanda Tambah di outlet", "single", True, options=O["statusOutlet"]),
    q("stok", "Ketersediaan stok per varian", "stok", True, options=O["stok"], hint="Cek rak dan stok cadangan outlet.", show=jual),
    q("hargaJual", "Harga eceran Tanda Tambah di outlet (Rp/bks)", "number", False, show=jual),
    q("facingTotal", "Total facing rokok di rak (semua merek)", "number", True, hint="Jumlah muka bungkus yang terlihat di rak/etalase.", show=ada_outlet),
    q("facingTT", "Facing Tanda Tambah", "number", True, show=jual, rules={"lte_field": "facingTotal", "lte_message": "Tidak boleh melebihi total facing"}),
    q("posm", "Materi promosi (POSM) Tanda Tambah", "single", True, options=O["posm"], show=ada_outlet),
    q("beli", "Order Tanda Tambah hari ini", "variants", False, hint="Bungkus per varian yang dipesan outlet. Isi 0 bila tidak order.", show=ada_outlet),
    q("alasanTidak", "Alasan tidak order", "single", True, options=O["alasanTidakOrder"], show=all_of(ada_outlet, when("beli", sum_eq=0))),
    q("kompetitor", "Merek kompetitor terlaris di outlet", "text", True, hint="Tulis bebas merek dan varian.", suggest="brands", show=ada_outlet, titlecase=True),
    q("hargaKompetitor", "Harga eceran merek itu (Rp/bks)", "number", False, show=ada_outlet),
    q("promoKomp", "Promo kompetitor di outlet", "single", True, options=O["promoKompOutlet"], show=ada_outlet),
    q("fotoDisplay", "Foto rak / display", "photo", False, capture="environment", hint="Bukti kunjungan dan kondisi display.", show=ada_outlet),
    q("catatan", "Catatan", "textarea", False, show=ada_outlet),
]
REGULER_CLOSING = [q("catatan", "Catatan penutup rute", "textarea", False)]

# ───────────────────────────── daftar form per tugas ─────────────────────────────
FORMS = {
    "GROSIR": {"title": "Laporan Harian Grosir", "start_title": "Mulai laporan di grosir", "entry_word": "pembeli",
               "entry_hint": "Pertanyaan muncul sesuai jawaban", "start": GROSIR_START, "entry": GROSIR_ENTRY,
               "sections": GROSIR_SECTIONS, "closing": GROSIR_CLOSING, "title_field": "grosir", "location_field": "kecGrosir",
               "entry_location": "kecamatan", "min_minutes_per_entry": 2},
    "HORECA": {"title": "Survei Konsumen HORECA", "start_title": "Mulai survei di venue", "entry_word": "responden",
               "entry_hint": "Tanya profil sebelum memberi sampel, tanya kesan sesudah mencoba", "start": HORECA_START, "entry": HORECA_ENTRY,
               "sections": [], "closing": HORECA_CLOSING, "title_field": "venue", "location_field": "kecVenue",
               "entry_location": "domisili", "min_minutes_per_entry": 2},
    "REGULER": {"title": "Kunjungan Outlet Reguler", "start_title": "Mulai rute kunjungan outlet", "entry_word": "kunjungan outlet",
                "entry_hint": "Satu isian per outlet yang dikunjungi", "start": REGULER_START, "entry": REGULER_ENTRY,
                "sections": [], "closing": REGULER_CLOSING, "title_field": "rute", "location_field": "kecRute",
                "entry_location": "kecOutlet", "min_minutes_per_entry": 3},
}
