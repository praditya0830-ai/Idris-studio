# Sketch / Photo → CAD (branch `ui/vision-to-cad`)

Tugas: sketsa tangan → CAD, foto → CAD, dan part hilang dari foto. Solver-nya ada di PR
`praditya0830-ai/Idris-ai` cabang `solver/vision-to-cad`; dokumen ini hanya sisi Studio.

## Kenapa patch, bukan `index.html` yang sudah diubah

`index.html` 8435 baris / 872 KB. Berkas sebesar itu tidak bisa diunggah ulang utuh dari sesi ini, dan
repo ini memang sudah menyimpan perubahan Studio sebagai patch (`docs/studio-variants-drawer.patch`).
Jadi perubahannya ada di `docs/vision-to-cad.patch`:

```bash
git apply --check docs/vision-to-cad.patch && git apply docs/vision-to-cad.patch
```

Patch menambah **satu blok** di dalam IIFE utama, tepat sebelum `window.__idris = ...`, plus satu blok
CSS yang disuntik dari JS. Tidak ada baris lama yang diubah (367 tambah, 1 hapus — baris `window.__idris`
diperluas agar `vis` bisa diperiksa dari konsol).

## Yang ditambahkan

- **Tombol “Sketch / Photo”** di kepala panel chat (`.phead`).
- **Modal** dengan tiga mode: Sketch to CAD, Recreate from photo, Design the missing part, dan tiga
  sumber: unggah berkas, kamera (`capture="environment"`), atau **kanvas tablet** (kertas berpetak,
  pena, penghapus, undo, bersihkan, dan tombol **“Write a size”** yang menulis angka ke gambar supaya
  terbaca AI sebagai ukuran tertulis).
- **Mode part hilang**: seret kotak di foto; koordinatnya dikirim sebagai `region` (fraksi 0–1).
- **Baca**: `POST /vision/read` → panel menampilkan objek, fitur, angka tertulis (dengan input untuk
  konfirmasi/ubah satu per satu), pertanyaan AI, tafsiran yang bisa dipilih saat sketsa ambigu, dan
  label skala.
- **Skala**: label solver ditampilkan apa adanya (`Scale not set - proportions from image` atau
  `Scale from: overall width 120 mm (engineer)`). Bila skala belum ada, desain hanya mulai setelah
  engineer mencentang “continue with a provisional scale”; jawaban solver `fea_allowed: false`
  ditampilkan sebagai alasan, bukan disembunyikan.
- **Desain**: `POST /vision/job` dengan `confirmed_dims`, `reading`, `accept_provisional`, lalu
  `GET /design/job/<id>` tiap 2 detik. Saat selesai, `cad` dari job masuk ke jalur `genFromAI` yang
  sudah ada, dan jawaban/tabel cek/label ditampilkan.
- **Overlay**: gambar sketsa/foto dipasang di belakang viewport (`mix-blend-mode: multiply`) dengan
  slider opasitas 0–100% dan tombol sembunyikan.
- **Shape match**: `POST /vision/similarity` dengan dua bitmap 128×128 — siluet model dari kanvas
  viewport (alpha > 16) dan siluet gambar (luminansi < ambang). Hasilnya ditulis
  `Shape match: NN% (silhouette, 128px)` beserta kotak perbedaan terbesar dan satu kalimat bahwa ini
  perbandingan 2D, bukan klaim bentuk 3D.

## Batas jujur yang ikut tampil

- Gambar memberi bentuk dan proporsi, bukan ukuran. Hanya angka tertulis (dikonfirmasi) dan ukuran
  acuan yang menjadi milimeter — itu keputusan solver, Studio hanya tidak mengarang sendiri.
- “Siluet gambar” diambil dari ambang luminansi, bukan deteksi tepi sungguhan. Untuk foto, latar polos
  dan objek gelap memberi hasil masuk akal; untuk foto ramai angka kemiripan akan rendah, dan itu
  memang jawaban yang benar untuk siluet yang salah ambil. Ambangnya belum punya slider di UI.
- Tampilan proses fitur-demi-fitur di atas overlay (Bagian G4) belum ada: job memperlihatkan
  status/tahap, dan urutan bangun (`cad.steps`) ditampilkan sebagai teks setelah selesai.
- Kamera memakai `capture` browser; tidak ada kontrol Exposure/zoom, dan orientasi EXIF dipakai
  browser saat memuat gambar (server juga membuang EXIF sebelum gambar dikirim ke AI).

## Yang sudah diuji di sini

- `git apply --check` lolos pada `index.html` commit `main` saat PR ini dibuat, dan `git apply` lalu
  `node --check` pada skrip hasil patch: **exit 0** (sintaks JS valid).
- `node tests/features.test.mjs` (tes pipeline fitur yang mengangkat `buildPart` dari `index.html`):
  **37 passed, 0 failed** setelah patch dipasang.
- **Belum** dicoba di browser sungguhan: tidak ada klik, unggah foto, atau gambar di tablet di sesi
  ini. Semua jalur jaringan (`/vision/read`, `/vision/job`, `/design/job/<id>`, `/vision/similarity`)
  belum pernah dijalankan dari UI ini.
