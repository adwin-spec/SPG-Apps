# Design system – Expressive Glassmorphism

**Ekspresif di latar, disiplin di data.** Putih = primary, hitam = secondary, kaca = bahasa container,
tulisan tangan = karakter latar, tanda "+" = identitas.

## Token (`apps/web/app/globals.css`)
Semua warna, radius, bayangan, blur, dan durasi animasi adalah variabel CSS `--tt-*`; Tailwind membaca variabel
yang sama (`apps/web/tailwind.config.ts`). Halaman tidak boleh menulis warna mentah.

| Token | Nilai | Pakai untuk |
|---|---|---|
| `--tt-white` / `--tt-soft-white` | #FFFFFF / #F7F7F7 | latar |
| `--tt-glass` | rgba(255,255,255,.62) | container kaca |
| `--tt-black` / `--tt-deep-black` / `--tt-soft-black` | #111 / #1D1D1D / #333 | teks, permukaan gelap |
| `--tt-muted` | #6E6E6E | teks pendukung (≥ 4,5:1) |
| `--tt-muted-gray` | #858585 | ikon & dekorasi saja – kontrasnya terlalu rendah untuk teks kecil (3,7:1) |
| `--tt-red` / `--tt-orange` / `--tt-green` | #D94A43 / #E77B43 / #779A75 | sorotan & status; teks memakai varian `-text` yang lebih gelap |

## Kaca (kelas CSS)
`glass` (level 1: KPI, panel, grafik) · `glass-nested` (level 2) · `glass-minimal` (level 3) ·
`glass-elevated` (modal, laci, menu, panel filter) · `glass-dark` (sorotan terbatas: KPI utama, Insight) ·
`glass-hover` (naik 2px, bayangan lebih halus, 220ms ease-out). Bila browser tidak mendukung `backdrop-filter`,
kaca otomatis menjadi hampir solid. Di HP blur dikurangi (14px) demi performa.

## Komponen (`apps/web/components`)
`ui/glass-container · glass-card (KpiCard) · glass-panel · glass-modal · glass-drawer · glass-dropdown · glass-input ·
glass-button · glass-table (+ Pagination) · empty-state` · `branding/plus-mark (PlusMark, BrandLogo, PlusLoader, PlusDivider) ·
typography-background · decorative-layer` · `layout/app-sidebar · app-header · page-container (PageContainer, PageHeader)`.
`ui/button`, `ui/input`, `ui/dialog`, `ui/card` hanya meneruskan ke komponen glass (tidak ada styling ganda).

## Tipografi
Inter untuk semua konten, angka, tabel, form, navigasi. Permanent Marker **hanya** untuk teks latar dan sorotan
dekoratif (mis. "+ more growth" di login). Kata latar per halaman diatur di `branding/typography-background.tsx`
(`BG_WORDS`), dipilih halaman lewat `<PageContainer preset="…">`.

## Grafik (palet divalidasi dengan validator dataviz di atas permukaan #FBFBFB)
| Peran | Warna | Hasil uji |
|---|---|---|
| Satu seri netral | hitam #111 | – |
| Tanda Tambah / sorotan vs pembanding | merah #D94A43 vs abu #A6A6A6 | pemisahan buta warna ΔE 14,1 ✓ (abu < 3:1 → setiap batang berlabel angka + tampilan Tabel) |
| Kategori berurutan | #A8A8A8 → #858585 → #5E5E5E → #3A3A3A → #111 | uji ordinal lolos semua |
| Stok Ada / Kosong / Tidak jual | hitam / merah / abu muda | pemisahan ΔE 23,5 ✓ |
| Merah + oranye + hijau berdampingan | – | **gagal** (merah vs oranye ΔE 10,9 < 15): hanya dipakai sebagai status dengan ikon + teks, tidak sebagai seri grafik |

## Gerak & aksesibilitas
Fade/slide-up 320ms saat muncul, hover kaca, shimmer saat memuat, plus berputar sebagai indikator memuat, teks latar
bergeser sangat lambat. Semua dimatikan bila `prefers-reduced-motion`. Fokus keyboard bergaris hitam 2px; dekorasi
`aria-hidden` dan `pointer-events: none`; menu tarik-turun bisa dipakai dengan panah & Escape.
