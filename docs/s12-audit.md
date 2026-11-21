# S12 toolbar audit — hasil jalannya

Basis: cabang `studio/s11-toolbar-audit` (S11 + S10), karena v67.1 dan S0/S10/S11 belum masuk `main`.
Alat: Chromium 1440×900 lewat cloud browser, halaman dari server statis, solver dari API yang dipakai Studio.

## Cakupan

Dua keadaan, seperti perintah:

- **A** — workspace kosong (part baru tanpa fitur).
- **B** — part klasik: kotak 60×40×20 + lubang Ø6,6 di x = 15 (steel).

Tiap alat di setiap tab diklik; dicatat dialog/popover, perubahan panel kiri/properti, pesan chat baru, unduhan,
file picker, atau NOTHING.

| | A | B |
|---|---|---|
| Klik alat | 139 | 139 |
| Page error | 0 | 0 |
| Alat aktif yang NOTHING | 0 | 0 |

Angka 139, bukan 142 yang dicatat tim UI di v67.1: dua tombol ganda sudah digabung (Part Stress → Static
Stress, Part Drawing → Working Drawings) dan build ini berbeda tipis dari v67.1. Tidak ada alat yang
disembunyikan; alat yang belum ada tetap tampil abu-abu dengan `aria-disabled` dan alasannya.

## Tiga alat yang terlihat "kosong" tanpa event browser

`Export STEP`, `Export STL`, dan `Import STEP` mengubah halaman lewat unduhan/file picker, bukan panel.
Diperiksa terpisah dengan event Playwright:

- Export STEP → unduhan `Block.step`.
- Import STEP → file chooser terbuka.

Keduanya bukan NOTHING. Skrip `tests/toolbar.audit.spec.mjs` sudah menghitung `download` dan `filechooser`;
jalankan dengan `BASE_URL=… node tests/toolbar.audit.spec.mjs` (butuh `playwright` + Chromium).

## Angka yang dicek ulang di build ini

- Mass Properties kotak steel 60×40×20 + Ø6,6: volume 47,32 cm³, massa **371,4 g** (densitas 7,85 g/cm³,
  sumber Structural steel S235).
- Working Drawings (A3) untuk part klasik: teks SVG **60, 40, 20, 45, Ø6.6** — sama dengan bounds kernel.
- Bearing Life & Fatigue (S4, `POST /solve/bearing_life_iso281`): 6206, 2 000 N, 3 000 rpm, 20 mm²/s,
  normal cleanliness, umur diminta 20 000 h → **L_nm 30 518 h, L10 5 809 h, a_ISO 5,253, C_u 509 N**
  (solver 0.1.0, ISO 281:2007), status "meets the requirement".

## Yang belum

- Skrip audit belum dijalankan sebagai satu proses Node di mesin ini (paket `playwright` tidak terpasang);
  penyapuan di atas memakai aturan yang sama lewat browser cloud. Jalankan skrip saat dependensi tersedia.
- Solver untuk gearbox tidak dipakai di penyapuan ini; alat gearbox tetap tercatat lewat panel yang berubah.
