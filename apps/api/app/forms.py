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
    gps        lokasi HP saat ini (lat, lon, akurasi) → auto=True: langsung diambil saat form dibuka
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

PENTING saat mengubah teks:
  • Label pertanyaan, hint, dan placeholder boleh diubah kapan saja (hanya tampilan).
  • Pilihan berbentuk pasangan ("KODE", "Label"): ubah LABEL-nya saja, jangan KODE-nya.
  • Pilihan teks biasa ("Kios") IKUT TERSIMPAN di laporan. Kalau teksnya diubah, laporan lama tetap memakai
    teks lama dan dashboard akan menghitungnya sebagai pilihan berbeda. Kalau perlu ganti tampilan tanpa
    memisahkan data, ubah menjadi pasangan: ("Kios", "Kios / lapak kecil").
  • Gaya bahasa: santai dan jelas, seperti SPG bertanya langsung ("Udah kenal Tanda Tambah belum?").
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
    "jenisPembeli": [("RETAIL", "Buat dijual lagi (punya toko/warung)"), ("KONSUMEN", "Buat dirokok sendiri")],
    "tipeToko": ["Warung Madura", "Kios", "Kelontong", "Kantin", "Lainnya"],
    "statusRetail": [("BELUM", "Belum kenal TT"), ("TAHU_TIDAK_JUAL", "Udah kenal, tapi belum jual"), ("JUAL", "Udah jual TT")],
    "statusKonsumen": [("BELUM", "Belum kenal TT"), ("TAHU_BELUM_COBA", "Udah kenal, belum pernah nyoba"), ("PERNAH_COBA", "Udah kenal & pernah nyoba")],
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
    "statusHoreca": [("BELUM", "Belum kenal TT"), ("TAHU_BELUM_COBA", "Udah kenal, belum nyoba"), ("BERHENTI", "Pernah beli, sekarang udah nggak"),
                     ("BARU", "Baru pakai (kurang dari 3 bulan)"), ("LAMA", "Udah lama pakai (lebih dari 3 bulan)")],
    "alasanPengguna": ["Rasa", "Asap", "Harga", "Kebiasaan / rekomendasi", "Lainnya"],
    "alasanBerhenti": ["Rasa", "Asap", "Harga", "Susah dicari", "Pindah ke rokok lain", "Lainnya"],
    "alasanBelumCoba": ["Belum pernah ditawari", "Ragu dengan rasa", "Sudah cocok rokok lain", "Lainnya"],
    # ("SPG", "SPG sekarang"): kode lama "SPG" dipertahankan agar laporan lama tetap terhitung sama
    "tahuDariHoreca": ["Etalase toko", "Event", "Billboard / banner", "Teman / keluarga", ("SPG", "SPG sekarang"), "SPG sebelumnya", "Media sosial"],
    "kekuatan": ["Terlalu ringan", "Pas", "Terlalu kuat"],
    "asap": ["Halus, nyaman", "Tebal, mengepul", "Menyengat / perih", "Tipis", "Bau mengganggu"],
    "alasanBeliHoreca": ["Rasa cocok", "Asap nyaman", "Harga sesuai", "Promo menarik", "Kemasan menarik"],
    "alasanTidakHoreca": ["Sudah cocok rokok lain", "Rasa kurang cocok", "Asap menyengat", "Harga tidak sesuai", "Lainnya"],
    "fotoSetuju": [("YA", "Mau difoto"), ("TIDAK", "Nggak mau")],
    # SPG Reguler
    "tipeOutlet": ["Warung Madura", "Kios", "Kelontong", "Kantin", "Minimarket", "Swalayan", "Lainnya"],
    "statusOutlet": [("JUAL", "Udah jual TT"), ("PERNAH", "Dulu jual, sekarang nggak"), ("BELUM", "Belum pernah jual")],
    "stok": [("ADA", "Ada"), ("KOSONG", "Kosong"), ("TIDAK", "Nggak jual")],
    "posm": ["Terpasang baik", "Terpasang, rusak / kusam", "Tidak ada", "Dipasang hari ini"],
    "alasanTidakOrder": ["Stok masih banyak", "Belum laku", "Harga / margin kurang", "Pemilik tidak ada", "Sudah order lewat grosir", "Lainnya"],
    "promoKompOutlet": ["Tidak ada", "Diskon", "Bonus / gratis", "Hadiah / undian", "Display / rak baru", "Lainnya"],
}

TYPES = {"GROSIR": "Grosir", "HORECA": "HORECA", "REGULER": "Reguler"}
SUPERVISOR_HINT = "Ini nentuin supervisor yang bakal ngecek laporanmu."

# ───────────────────────────── SPG GROSIR ─────────────────────────────
retail = when("jenis", eq="RETAIL")
ada_status = when("statusTT")

GPS_HINT = "Ketuk tombolnya kalau lokasi belum muncul. Nyalakan GPS & izinkan lokasi untuk aplikasi ini."

GROSIR_START = [
    q("grosir", "Nama grosirnya apa?", "text", True, suggest="grosirs", titlecase=True),
    q("kecGrosir", "Grosirnya di kecamatan mana?", "kecamatan", True, hint=SUPERVISOR_HINT, location=True),
    q("lokasi", "Lokasi kamu sekarang", "gps", True, auto=True, hint=GPS_HINT),
]
GROSIR_ENTRY = [
    q("jenis", "Rokoknya buat dijual lagi atau dirokok sendiri?", "single", True, options=O["jenisPembeli"], hint="Tanya langsung ke pembelinya."),
    q("tipeToko", "Tokonya jenis apa?", "single", True, options=O["tipeToko"], show=retail),
    q("namaToko", "Nama tokonya?", "text", True, show=retail, placeholder="Misal: Toko Kaka", titlecase=True),
    q("namaPembeli", "Nama pembelinya (kalau mau kasih tahu)", "text", False, show=when("jenis", eq="KONSUMEN")),
    q("kecamatan", "Toko / rumahnya di kecamatan mana?", "kecamatan", True, show=when("jenis")),
    q("statusTT", "Sebelum kamu tawarin, dia udah kenal Tanda Tambah belum?", "single", True,
      options=by("jenis", RETAIL=O["statusRetail"], KONSUMEN=O["statusKonsumen"]), show=when("jenis")),
    q("tahuDari", "Pertama kali tahu Tanda Tambah dari mana?", "single", True, options=O["tahuDariGrosir"], show=when("statusTT", ne="BELUM")),
    q("beli", "Dia beli Tanda Tambah berapa bungkus?", "variants", False, hint="Isi per varian. Kalau nggak beli, biarin 0.", show=ada_status),
    q("kupon", "Kupon yang kamu kasih (lembar)", "number", False, show=ada_status, placeholder="0"),
    q("alasanBeli", "Kenapa dia mau beli?", "single", True, options=by("jenis", RETAIL=O["alasanBeliRetail"], KONSUMEN=O["alasanBeliKonsumen"]),
      show=all_of(ada_status, when("beli", sum_gt=0))),
    q("alasanTidak", "Kenapa nggak jadi beli?", "single", True, options=by("jenis", RETAIL=O["alasanTidakRetail"], KONSUMEN=O["alasanTidakKonsumen"]),
      show=all_of(ada_status, when("beli", sum_eq=0))),
    q("tier2", "Biasanya dia beli / ngerokok merek apa?", "text", True, hint="Tulis bebas, misal: Camel Purple.", show=ada_status, suggest="brands", titlecase=True),
    q("hargaGrosir", "Merek itu harga grosirnya berapa di sini? (Rp/bungkus)", "number", False, show=ada_status),
    q("hargaEceran", "Kalau di tokonya dijual berapa? (Rp/bungkus)", "number", False, show=all_of(retail, ada_status)),
    q("ambil", "Kamu beli merek itu berapa bungkus di grosir ini?", "number", False, hint="Isi 0 kalau nggak.", show=ada_status),
    q("catatan", "Ada catatan lain?", "textarea", False, show=ada_status),
]
GROSIR_SECTIONS = [
    {"key": "promos", "sheet": "Promo kompetitor", "title": "Bagian 2 · Ada promo dari merek lain di grosir?", "none_label": "Hari ini nggak ada promo merek lain", "questions": [
        q("merek", "Merek apa?", "text", True, suggest="brands", placeholder="Misal: L.A Lights", titlecase=True),
        q("aktivitas", "Promonya kayak gimana?", "single", True, options=O["aktivitasKompetitor"]),
        q("detail", "Detail promonya", "text", False, placeholder="Misal: beli 2 bungkus gratis kopi sachet"),
        q("sejak", "Udah dari kapan?", "single", True, options=O["sejak"]),
    ]},
    {"key": "promotors", "sheet": "Promotor kompetitor", "title": "Bagian 3 · Ada SPG / promotor merek lain?", "none_label": "Hari ini nggak ada promotor lain", "questions": [
        q("merek", "Promotor merek apa?", "text", True, suggest="brands", titlecase=True),
        q("jumlah", "Berapa orang?", "number", True, rules={"min": 1, "min_message": "Minimal 1 orang"}),
        q("aktivitas", "Mereka lagi ngapain?", "single", True, options=O["aktivitasPromotor"]),
    ]},
]
GROSIR_CLOSING = [
    q("terlaris", "Bagian 4 · Hari ini merek apa yang paling laku di grosir?", "brandcounts", True, rows=3, hint="Kira-kira jumlah batangnya. Minimal isi 1 merek."),
    q("catatan", "Catatan tambahan", "textarea", False),
    q("pic", "Nama orang grosir yang ngecek laporan ini", "text", True, hint="Pengganti tanda tangan & cap."),
]

# ───────────────────────────── SURVEI HORECA (konsumen di venue) ─────────────────────────────
dewasa = when("dewasa")
sudah_sampel = all_of(dewasa, when("sampel"))
mencoba = all_of(dewasa, when("sampel", ne="Tidak mencoba"))

HORECA_START = [
    q("venue", "Nama tempatnya?", "text", True, titlecase=True),
    q("alamat", "Alamatnya?", "text", True),
    q("kecVenue", "Tempatnya di kecamatan mana?", "kecamatan", True, hint=SUPERVISOR_HINT, location=True),
    q("jenisVenue", "Tempatnya jenis apa?", "single", True, options=O["jenisVenue"]),
    q("kebijakan", "Di sini boleh ngerokok nggak?", "single", True, options=O["kebijakan"]),
    q("lokasi", "Lokasi kamu sekarang", "gps", True, auto=True, hint=GPS_HINT),
]
HORECA_ENTRY = [
    q("dewasa", "Cek dulu ya", "confirm", True, text="Orangnya perokok & umurnya 18 tahun ke atas", hint="Survei & sampel cuma buat perokok dewasa."),
    q("usia", "Umurnya kira-kira?", "single", True, options=O["usia"], show=dewasa),
    q("domisili", "Tinggalnya di kecamatan mana?", "kecamatan", True, show=dewasa),
    q("rokokBiasa", "Biasanya ngerokok merek apa?", "text", True, hint="Tulis bebas, misal: Sampoerna Mild.", show=dewasa, suggest="brands", titlecase=True),
    q("tempatBeli", "Biasanya beli rokok di mana?", "single", True, options=O["tempatBeli"], show=dewasa),
    q("rasa", "Sukanya rasa yang kayak gimana?", "single", True, options=O["rasaDisukai"], show=dewasa),
    q("statusTT", "Udah kenal Tanda Tambah belum?", "single", True, options=O["statusHoreca"], show=dewasa),
    q("alasan", "Kenapa begitu?", "single", True, hint="Kalau pakai TT: kenapa suka. Kalau berhenti: kenapa berhenti. Kalau belum nyoba: kenapa belum.",
      options=by("statusTT", BARU=O["alasanPengguna"], LAMA=O["alasanPengguna"], BERHENTI=O["alasanBerhenti"], BELUM=O["alasanBelumCoba"], TAHU_BELUM_COBA=O["alasanBelumCoba"]),
      show=all_of(dewasa, when("statusTT"))),
    q("tahuDari", "Tahu Tanda Tambah dari mana?", "single", True, options=O["tahuDariHoreca"], show=all_of(dewasa, when("statusTT", ne="BELUM"))),
    q("sampel", "Nyobain sampel varian apa?", "single", True, options=variants_plus("Lebih dari 1 varian", "Tidak mencoba"), show=all_of(dewasa, when("statusTT"))),
    q("kekuatan", "Habis nyoba, rasanya gimana?", "single", True, options=O["kekuatan"], show=mencoba),
    q("asap", "Asapnya gimana?", "single", True, options=O["asap"], show=mencoba),
    q("beli", "Jadi beli berapa bungkus?", "variants", False, hint="Isi per varian. Kalau nggak beli, biarin 0.", show=sudah_sampel),
    q("alasanBeli", "Kenapa mau beli?", "single", True, options=O["alasanBeliHoreca"], show=all_of(sudah_sampel, when("beli", sum_gt=0))),
    q("alasanTidak", "Kenapa nggak beli?", "single", True, options=O["alasanTidakHoreca"], show=all_of(sudah_sampel, when("beli", sum_eq=0))),
    q("fotoSetuju", "Boleh difoto bareng kamu?", "single", True, options=O["fotoSetuju"], show=sudah_sampel,
      hint="Tanya izin dulu ya. Fotonya cuma buat bukti internal, nggak disebar."),
    q("foto", "Foto bareng respondennya", "photo", True, capture="user", show=all_of(dewasa, when("fotoSetuju", eq="YA")),
      hint="Pastikan wajah & produk Tanda Tambah kelihatan. Tanggal, jam, dan namamu otomatis tercetak di foto."),
    q("catatan", "Ada catatan lain?", "textarea", False, show=sudah_sampel, placeholder="Misal: dia nanya stok di warung dekat rumahnya"),
]
HORECA_CLOSING = [
    q("terlaris", "Di tempat ini, merek apa yang paling banyak dirokok?", "brandcounts", True, rows=3, hint="Kira-kira jumlah batangnya. Minimal isi 1 merek."),
    q("korek", "Korek yang kamu bagiin", "number", False),
    q("catatan", "Catatan tambahan", "textarea", False),
    q("pic", "Nama pengelola tempat yang ngecek laporan ini", "text", True, hint="Pengganti tanda tangan & cap."),
]

# ───────────────────────────── SPG REGULER (kunjungan outlet) ─────────────────────────────
jual = when("statusOutlet", eq="JUAL")
ada_outlet = when("statusOutlet")

REGULER_START = [
    q("rute", "Nama rutenya (boleh dikosongin)", "text", False, placeholder="Misal: Rute Sokaraja – Selasa", titlecase=True),
    q("kecRute", "Rute hari ini utamanya di kecamatan mana?", "kecamatan", True, location=True,
      hint="Ini nentuin supervisor yang ngecek. Outlet di kecamatan lain tetap bisa kamu catat."),
    q("lokasi", "Lokasi kamu sekarang", "gps", True, auto=True, hint=GPS_HINT),
]
REGULER_ENTRY = [
    q("gps", "Lokasi outlet ini", "gps", True, auto=True, hint="Diambil otomatis saat kamu di depan outlet. " + GPS_HINT),
    q("namaOutlet", "Nama outletnya?", "text", True, suggest="outlets", placeholder="Misal: Toko Berkah", titlecase=True),
    q("tipeOutlet", "Outletnya jenis apa?", "single", True, options=O["tipeOutlet"]),
    q("kecOutlet", "Outletnya di kecamatan mana?", "kecamatan", True),
    q("statusOutlet", "Outlet ini jual Tanda Tambah nggak?", "single", True, options=O["statusOutlet"]),
    q("stok", "Stok tiap varian gimana?", "stok", True, options=O["stok"], hint="Cek di rak & stok cadangan.", show=jual),
    q("hargaJual", "Tanda Tambah dijual berapa di sini? (Rp/bungkus)", "number", False, show=jual),
    q("facingTotal", "Ada berapa muka bungkus rokok di rak? (semua merek)", "number", True, hint="Hitung bungkus yang kelihatan dari depan.", show=ada_outlet),
    q("facingTT", "Dari itu, berapa yang Tanda Tambah?", "number", True, show=jual, rules={"lte_field": "facingTotal", "lte_message": "Nggak boleh lebih dari total di rak"}),
    q("posm", "Materi promo Tanda Tambah (poster / stiker / rak) gimana?", "single", True, options=O["posm"], show=ada_outlet),
    q("beli", "Hari ini order berapa bungkus?", "variants", False, hint="Isi per varian. Kalau nggak order, biarin 0.", show=ada_outlet),
    q("alasanTidak", "Kenapa nggak order?", "single", True, options=O["alasanTidakOrder"], show=all_of(ada_outlet, when("beli", sum_eq=0))),
    q("kompetitor", "Merek lain yang paling laku di sini apa?", "text", True, hint="Tulis bebas, misal: Surya 16.", suggest="brands", show=ada_outlet, titlecase=True),
    q("hargaKompetitor", "Merek itu dijual berapa? (Rp/bungkus)", "number", False, show=ada_outlet),
    q("promoKomp", "Ada promo dari merek lain?", "single", True, options=O["promoKompOutlet"], show=ada_outlet),
    q("fotoDisplay", "Foto rak / display", "photo", False, capture="environment", hint="Buat bukti kunjungan & kondisi rak.", show=ada_outlet),
    q("catatan", "Ada catatan lain?", "textarea", False, show=ada_outlet),
]
REGULER_CLOSING = [q("catatan", "Catatan penutup rute (kalau ada)", "textarea", False)]

# ───────────────────── nama kolom untuk Excel & halaman Persetujuan ─────────────────────
# Label di atas memakai bahasa santai untuk SPG. Untuk laporan manajemen, setiap pertanyaan punya nama kolom
# singkat yang formal. Pertanyaan baru tanpa nama kolom akan memakai labelnya.
def _cols(questions: list[dict], names: dict[str, str]) -> None:
    for x in questions:
        if x["id"] in names:
            x["col"] = names[x["id"]]


_cols(GROSIR_START, {"grosir": "Nama grosir", "kecGrosir": "Kecamatan grosir", "lokasi": "GPS"})
_cols(GROSIR_ENTRY, {"jenis": "Jenis pembeli", "tipeToko": "Tipe toko", "namaToko": "Nama toko", "namaPembeli": "Nama pembeli", "kecamatan": "Kecamatan",
                     "statusTT": "Status TT sebelum ditawari", "tahuDari": "Tahu TT dari", "beli": "TT dibeli", "kupon": "Kupon",
                     "alasanBeli": "Alasan membeli", "alasanTidak": "Alasan tidak membeli", "tier2": "Merek lain", "hargaGrosir": "Harga grosir merek lain",
                     "hargaEceran": "Harga eceran merek lain", "ambil": "Merek lain dibeli di grosir (bks)", "catatan": "Catatan"})
for _sec in GROSIR_SECTIONS:
    _cols(_sec["questions"], {"merek": "Merek", "aktivitas": "Aktivitas", "detail": "Detail", "sejak": "Sejak", "jumlah": "Jumlah orang"})
_cols(GROSIR_CLOSING, {"terlaris": "Merek terlaris (batang)", "catatan": "Catatan", "pic": "PIC grosir"})
_cols(HORECA_START, {"venue": "Nama venue", "alamat": "Alamat", "kecVenue": "Kecamatan venue", "jenisVenue": "Jenis venue", "kebijakan": "Kebijakan merokok", "lokasi": "GPS"})
_cols(HORECA_ENTRY, {"dewasa": "Konfirmasi 18+", "usia": "Usia", "domisili": "Domisili", "rokokBiasa": "Rokok biasa", "tempatBeli": "Tempat beli",
                     "rasa": "Rasa disukai", "statusTT": "Status TT", "alasan": "Alasan", "tahuDari": "Tahu TT dari", "sampel": "Sampel dicoba",
                     "kekuatan": "Kesan kekuatan", "asap": "Kesan asap", "beli": "TT dibeli", "alasanBeli": "Alasan membeli",
                     "alasanTidak": "Alasan tidak membeli", "fotoSetuju": "Bersedia difoto", "foto": "Foto", "catatan": "Catatan"})
_cols(HORECA_CLOSING, {"terlaris": "Merek terbanyak dihisap (batang)", "korek": "Korek dibagikan", "catatan": "Catatan", "pic": "PIC venue"})
_cols(REGULER_START, {"rute": "Nama rute", "kecRute": "Kecamatan rute", "lokasi": "GPS awal rute"})
_cols(REGULER_ENTRY, {"gps": "GPS outlet", "namaOutlet": "Nama outlet", "tipeOutlet": "Tipe outlet", "kecOutlet": "Kecamatan outlet", "statusOutlet": "Status TT di outlet",
                      "stok": "Stok", "hargaJual": "Harga eceran TT", "facingTotal": "Facing total", "facingTT": "Facing TT", "posm": "POSM",
                      "beli": "TT diorder", "alasanTidak": "Alasan tidak order", "kompetitor": "Kompetitor terlaris", "hargaKompetitor": "Harga kompetitor",
                      "promoKomp": "Promo kompetitor", "fotoDisplay": "Foto display", "catatan": "Catatan"})
_cols(REGULER_CLOSING, {"catatan": "Catatan"})

# ───────────────────────────── daftar form per tugas ─────────────────────────────
FORMS = {
    "GROSIR": {"title": "Laporan Harian Grosir", "start_title": "Mulai laporan di grosir", "entry_word": "pembeli",
               "entry_hint": "Pertanyaan berikutnya muncul sesuai jawaban", "start": GROSIR_START, "entry": GROSIR_ENTRY,
               "sections": GROSIR_SECTIONS, "closing": GROSIR_CLOSING, "title_field": "grosir", "location_field": "kecGrosir",
               "entry_location": "kecamatan", "min_minutes_per_entry": 2},
    "HORECA": {"title": "Survei Konsumen HORECA", "start_title": "Mulai survei di tempat nongkrong", "entry_word": "responden",
               "entry_hint": "Tanya dulu profilnya sebelum kasih sampel, lalu tanya kesannya setelah nyoba", "start": HORECA_START, "entry": HORECA_ENTRY,
               "sections": [], "closing": HORECA_CLOSING, "title_field": "venue", "location_field": "kecVenue",
               "entry_location": "domisili", "min_minutes_per_entry": 2},
    "REGULER": {"title": "Kunjungan Outlet Reguler", "start_title": "Mulai rute kunjungan outlet", "entry_word": "kunjungan outlet",
                "entry_hint": "Satu isian untuk satu outlet yang kamu datangi", "start": REGULER_START, "entry": REGULER_ENTRY,
                "sections": [], "closing": REGULER_CLOSING, "title_field": "rute", "location_field": "kecRute",
                "entry_location": "kecOutlet", "min_minutes_per_entry": 3},
}
