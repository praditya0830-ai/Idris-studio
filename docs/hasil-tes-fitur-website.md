# Hasil Tes Fitur Website — Idris Studio

Tanggal: 28 November 2026 (revisi kedua)
Diuji pada: `http://127.0.0.1:3200/index.html` — build lokal cabang `studio/aktifkan-fitur-lanjutan`, basis `origin/main` `51432c3`, head `2b88acf`
Pembanding: situs live `https://praditya0830-ai.github.io/Idris-studio/` (HTTP 200) dan `origin/main` `51432c3`

Dokumen ini menggantikan versi pertama. Angka di sini diukur ulang; setiap klaim menyebut alat ukurnya, dan
bagian "Yang belum bisa dibuktikan" menyebut apa yang **tidak** diukur.

## Ringkasan

| Yang diperiksa | Hasil terukur |
| --- | --- |
| Status ribbon dari kode (literal + override halaman) | 144 alat · **142 jalan** · **2 abu-abu** (`tests/s23-ribbon-status.test.mjs`, 6 check) |
| Status ribbon dari DOM setelah render, 1366×768 | 144 alat · 142 jalan · 2 abu-abu · **0 error JavaScript** |
| Status ribbon dari DOM setelah render, 1280×800 | 144 alat · 142 jalan · 2 abu-abu · **0 error JavaScript** |
| 7 tombol yang dulu dicatat "SILENT" | **0 yang benar-benar silent** — 6 menampilkan pesan penolakan spesifik, 1 membuka pemilih berkas |
| Crash pada Extruded Boss/Base | **Reproduksi di semua kondisi**, juga di live github.io → temuan lingkungan (WebGL software tanpa GPU), bukan bug aplikasi |
| 12 tombol yang dulu belum aktif | **10 jalan** (dengan aksi dan dispatcher), **2 tetap abu-abu** dengan alasan dari `GET /solvers` → `planned` |
| `tests/s12.test.mjs` | **8 check lulus** (dulu gagal pada dua "Thicken") |
| Seluruh unit test `tests/*.test.mjs` | **30 berkas lulus, 0 gagal** |
| Solver buckling (Euler, toleransi 0,1%) | 4 kondisi ujung lulus, galat terbesar **0,0001%** |
| Live github.io vs `origin/main` | **identik byte-per-byte** (sha256 `6ad0881e…`, 1 673 132 byte) |
| "Mark 1" di kode live/main vs cabang | 19 kemunculan (16 di kode/teks, 3 komentar) vs **3 (semuanya komentar)** |

## Metode dan batasnya

- Playwright 1.49.1 + Chromium 1148 headless (`--no-sandbox --disable-dev-shm-usage`), Ubuntu 24.04 tanpa GPU,
  pustaka sistem dipasang lokal di `/tmp/chlibs` (tanpa root). Halaman dilayani `python3 -m http.server 3200`.
- **Tidak ada backend solver di lingkungan ini** (paket Python solver tidak terpasang dan tidak dijalankan).
  Artinya: klik yang memerlukan solver akan menampilkan galat jaringan, dan itu **bukan** bukti tombolnya rusak.
  Versi pertama laporan memakai solver lokal di `127.0.0.1:8601`; revisi ini tidak.
- Label klik diambil dari DOM nyata: `MutationObserver` pada `document.body` (node baru + teksnya), event
  `download`, event `filechooser`, event `crash`, dan `console`/`pageerror`. Bukan dari screenshot, karena font
  web tidak tersedia luring sehingga teks tidak terender (tata letak **tidak** dinilai).
- Tidak ada perubahan kode aplikasi selama pengujian klik.

## 1. Tujuh tombol yang dulu dicatat SILENT — sekarang ada namanya

Setiap baris = satu halaman baru, masuk workspace, tab diklik, tombol diklik, ditunggu 2,5 detik, lalu node DOM
yang muncul dicatat. Semua percobaan **tanpa part terbuka** (lihat batas di bagian 2).

| Tab | Tombol | Status awal | Yang terjadi setelah klik | Label |
| --- | --- | --- | --- | --- |
| Manage | Export STEP | `on` | pesan di panel chat: “Build a part first, then export it.” | OK-REFUSAL |
| Manage | Parameters | `on` | “Open a part first: Parameters drive the fields of its steps.” | OK-REFUSAL |
| Manage | Configurations | `on` | “Open a part first: Configurations store its parameter values.” | OK-REFUSAL |
| Manage | Import STEP | `on` | event `filechooser` + `<input type=file>` muncul | OK-FILECHOOSER |
| Drawing | Dimensions & Notes | `on` | “Open a part first.” | OK-REFUSAL |
| Drawing | Export PDF / DXF | `on` | “Open a part first.” | OK-REFUSAL |
| Evaluate | Measure | `on` | “Build or open a part first.” | OK-REFUSAL |

Keputusan: **tidak ada yang diperbaiki dan tidak ada yang diabu-abukan**, karena tidak ada satu pun yang benar-benar
diam. Ketujuh tombol menjawab klik dengan kalimat yang menyebut langkah berikutnya; harness versi pertama hanya
mendeteksi dialog/panel, sehingga pesan chat tidak terlihat dan tombolnya salah dicap SILENT.

Bukti bahwa handler-nya bekerja pada part yang benar ada di unit test (tanpa browser, tanpa solver):
`tests/s22-activation.test.mjs` membangun part dari parameter (1000 mm³ → 8000 mm³), tiga konfigurasi (1000/8000/27000 mm³),
dan STEP kubus 10 mm yang ditulis lalu dibaca kembali sebagai 1000 mm³.

## 2. Crash pada Extruded Boss/Base — temuan lingkungan, bukan bug aplikasi

Direproduksi dengan Chromium yang sama, argumen berbeda, pada dua jalur yang sama-sama memicu build kernel:

| Argumen Chromium | Jalur | Hasil |
| --- | --- | --- |
| `--no-sandbox --disable-dev-shm-usage` | Library → Mounting plate | renderer `crash` |
| `--no-sandbox --disable-dev-shm-usage` | Features → Extruded Boss/Base (tanpa sketsa) | renderer `crash` |
| `+ --disable-gpu` | Library → Mounting plate | renderer `crash` |
| `+ --use-gl=swiftshader --enable-unsafe-swiftshader` | Library → Mounting plate | renderer `crash` |
| `+ --use-angle=swiftshader --enable-unsafe-swiftshader` | Library → Mounting plate | renderer `crash` |
| `--no-sandbox --disable-dev-shm-usage` | **live github.io**, Library → Mounting plate | renderer `crash` |

Pesan konsol terakhir selalu sama sebelum mati:

```
warning: Automatic fallback to software WebGL has been deprecated.
warning: [.WebGL-…] GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
```

Kesimpulan: crash terjadi pada **setiap build kernel OpenCascade** di container tanpa GPU ini, dengan atau tanpa
sketsa, dengan empat set argumen, dan **juga pada build live yang identik dengan `main`**. Karena itu ini temuan
lingkungan (jalur WebGL software + `ReadPixels`), bukan regresi cabang dan bukan bug aplikasi. Tidak ada kode
aplikasi yang diubah untuk "memperbaiki" crash ini, karena penyebabnya di luar aplikasi.

Skenario "dengan sketsa lingkaran Ø20 sudah ada" tidak bisa diselesaikan: membuat sketsa itu sendiri memerlukan
build kernel, dan langkah itu sudah mematikan renderer lebih dulu. Itu dicatat sebagai batas, bukan ditebak.

## 3. Dua belas tombol yang dulu belum aktif

Status "awal" = status di literal `RIBBON` (yang dulu dibaca laporan versi pertama). Status "akhir" = status yang
benar-benar dirender halaman (literal + override `set(…)` saat load), dihitung `tests/s23-ribbon-status.test.mjs`.

| Tab | Tombol | Awal | Akhir | Dasar | Bukti |
| --- | --- | --- | --- | --- | --- |
| Assembly | Insert Component | `mk1` | `on` → `asmInsert` | memulai assembly + pemilih part/baut | s23: aksi + dispatcher `=== 'asmInsert'` |
| Assembly | Move / Rotate Component | `mk1` | `on` → `asmMove` | posisi X/Y/Z dan rotasi Z di panel kanan | s23: dispatcher `asmMove` |
| Assembly | Standard Parts | `mk1` | `on` → `asmBolt` | katalog baut ISO 4762 dari solver | s23: dispatcher `asmBolt` |
| Assembly | Auto Assembly | `mk1` | `on` → `asmAuto` | `assyAuto()`: susun, mate, baut, cek baut, clash kernel | s23: dispatcher `asmAuto` |
| Assembly | Interference Detection | `gb` | `on` → `interf` | `assyInterference()` — boolean kernel antar komponen | s23: dispatcher `interf` |
| Evaluate | Design for Manufacturing | `gb` | `on` → `dfmPart` | `POST /dfm/part`: tebal dinding, overhang, draft, ukuran bor | s23: dispatcher `dfmPart` |
| Evaluate | Thickness Analysis | `no` | `on` → `dfmWall` | ray casting solver: tebal dinding terukur per voxel | s23: dispatcher `dfmWall` |
| Simulation · FEA | Calculators | `no` | `on` → `calculators` | 18 kalkulator dari skema solver | s23: dispatcher `calculators` |
| Simulation · FEA | Buckling | `no` | `on` → `buckling` | `bucklingTool()` → `POST /solve/buckling_beam` | s23 + tes solver di bawah |
| Simulation · FEA | CFD → **Pipe Flow** | `no` | `on` → `pipeFlow` | Darcy-Weisbach/Colebrook dari solver; CFD 3D penuh **tidak** ada dan dialognya menyebut itu | s23: dispatcher `pipeFlow` |
| Simulation · FEA | Topology Optimisation | `no` | `no` (abu-abu) | `GET /solvers` → `planned`: `topology_simp_3d` | s23: peta `SOLVER_PLANNED.topo` |
| Simulation · FEA | Drop Test | `no` | `no` (abu-abu) | `GET /solvers` → `planned`: `drop_test` | s23: peta `SOLVER_PLANNED.drop` |

Catatan penting soal angka lama: 10 dari 12 tombol itu **sudah** jalan di halaman — blok `set(…)` saat load
mengubah statusnya menjadi `on` beserta aksinya. Laporan versi pertama menghitung 130 `on` / 12 belum aktif karena
membaca literal saja. Sekarang `s23` menjumlahkan literal **dan** override dengan urutan yang sama seperti halaman,
jadi angka kode dan angka DOM tidak bisa lagi berbeda tanpa tes gagal.

Dua alat yang tetap abu-abu memakai alasan solver kata per kata: popover memanggil `GET /solvers`, mencari entri
`planned` dengan nama yang sama, lalu menampilkan `reason`, `needs`, dan `status` dari solver. `s23` memastikan
kedua ikon alat itu memang ada di peta `SOLVER_PLANNED` (tidak ada alasan yang dikarang).

### Buckling terhadap rumus Euler

Solver `buckling_beam` dijalankan langsung (Python, `python3 -m pytest tests/test_buckling_beam.py` → **10 passed**),
lalu `P_cr` dibandingkan dengan π²EI/(KL)², diameter 20 mm, E 210 000 MPa, L 1000 mm, 40 elemen:

| Kondisi ujung | K | P_cr solver | π²EI/(KL)² | Galat |
| --- | --- | --- | --- | --- |
| fixed–free | 2,0 | 4 069,570 N | 4 069,574 N | 0,0001% |
| pinned–pinned | 1,0 | 16 278,300 N | 16 278,295 N | 0,0000% |
| fixed–fixed | 0,5 | 65 113,240 N | 65 113,181 N | 0,0001% |
| fixed–pinned | 0,6991557 | 33 301,310 N | 33 301,295 N | 0,0000% |

Keempatnya di bawah toleransi 0,1%.

### Perbaikan kecil yang ditemukan saat menghitung

`add('sim', 'Part', 'Natural Frequencies', …)` menulis ke grup `Part` yang tidak ada di tab Simulation · FEA,
jadi alat itu **tidak pernah** muncul di ribbon padahal kodenya menambahkannya. Baris mati itu dihapus;
`Modal / Frequency` (aksi `modalAny`) sudah menjadi pintu alat itu. Tidak ada tombol yang hilang dari UI.

## 4. Angka yang dihitung ulang

Dua hitungan, dipisah seperti diminta:

| Sumber | Alat | Total | Jalan | Abu-abu |
| --- | --- | --- | --- | --- |
| Kode (literal + override halaman) | `node tests/s23-ribbon-status.test.mjs` | 144 | 142 | 2 |
| DOM, 1366×768 | Playwright, hitung `.xr-t` tanpa kelas `run` | 144 | 142 | 2 |
| DOM, 1280×800 | idem | 144 | 142 | 2 |

Rincian DOM per tab (sama di kedua viewport):

| Tab | Tombol | Jalan | Abu-abu |
| --- | --- | --- | --- |
| Sketch | 23 | 23 | 0 |
| Features | 39 | 39 | 0 |
| Surface | 12 | 12 | 0 |
| Sheet Metal | 13 | 13 | 0 |
| Weldments | 6 | 6 | 0 |
| Mold | 5 | 5 | 0 |
| Assembly | 12 | 12 | 0 |
| Evaluate | 8 | 8 | 0 |
| Simulation · FEA | 10 | 8 | 2 (Topology Optimisation, Drop Test) |
| Drawing | 6 | 6 | 0 |
| Manage | 10 | 10 | 0 |
| **Total** | **144** | **142** | **2** |

"Jalan" di sini berarti tombol tidak abu-abu dan punya aksi dengan dispatcher — **bukan** berarti kliknya sudah
diuji sampai hasil geometri (lihat bagian 7). Error konsol: 0 di kedua viewport.

## 5. `tests/s12.test.mjs` — dua "Thicken"

Dua tombol bernama "Thicken" memang ada: satu di tab **Features** (grup Body) dan satu di tab **Surface** (grup Edit).
Keduanya menuju implementasi yang sama, `{ part: 'surfthick' }`; tombol Features adalah pintu yang membuka
Surface → Thicken, sesuai `docs/cad-backlog.md` (“one implementation, one name”) dan dua spec yang sudah ada
(`s21-sketch-curves.spec.mjs`, `bB-features.spec.mjs`).

Jadi yang salah bukan nama maupun status, melainkan aturan tesnya: ia mengizinkan pola "satu fungsi, dua pintu"
hanya untuk Draft Analysis, dan membandingkan rute dengan identitas objek (`prev.act === t.act`) — sementara kedua
pintu Thicken ditulis sebagai dua objek terpisah, sehingga rutenya tidak pernah dianggap sama.

Perbaikan di `tests/s12.test.mjs`:
- pintu ganda dibandingkan **secara struktural** pada rute (`part` + parameternya), bukan identitas objek;
- daftar pintu yang diizinkan eksplisit: `Draft Analysis`, `Thicken`;
- **dua pemeriksaan baru yang memperketat**: (a) kedua pintu Thicken harus ada di tab Features dan Surface dan
  keduanya `surfthick`; (b) tidak boleh ada nama runnable lain yang berulang di luar pasangan itu.

Bukti tes tidak dilonggarkan: salinan `index.html` dengan pintu Surface diubah menjadi `surfthick2` (build kedua)
membuat dua pemeriksaan gagal (`duplicate runnable tool "Thicken"` dan `does not open surfthick`).

## 6. Live github.io

| Yang diperiksa | Hasil |
| --- | --- |
| `GET https://praditya0830-ai.github.io/Idris-studio/` | HTTP 200, 1 673 132 byte |
| sha256 live vs `origin/main:index.html` | **sama** (`6ad0881e2fd0a959c16157d2…`), byte-per-byte identik |
| "Mark 1" di live | 19 kemunculan: 0 di HTML statis, 19 di dalam `<script>` (3 komentar, 16 di kode/teks) |
| "Mark 1" di `origin/main` | 19, sama persis |
| "Mark 1" di cabang ini | 3, semuanya komentar (baris 9269, 10321, 10560); 0 di kode/teks |
| "khusus gearbox" | 0 di live, 0 di main, 0 di cabang |

Live tidak punya penanda build/hash di halaman; kesamaan byte dengan `origin/main` adalah bukti terkuat yang bisa
didapat: yang tayang adalah `main` `51432c3` apa adanya.

## 7. Tes yang dijalankan

| Perintah | Hasil |
| --- | --- |
| `for f in tests/*.test.mjs; do node "$f"; done` | **30 berkas lulus, 0 gagal** |
| `node tests/s12.test.mjs` | 8 passed, 0 failed |
| `node tests/s23-ribbon-status.test.mjs` | 6 passed, 0 failed |
| `node tests/s22-activation.test.mjs` | 23 passed, 0 failed |
| `node tests/features.test.mjs` | 71 passed, 0 failed |
| `python3 -m pytest tests/test_buckling_beam.py` (di `idris-ai`) | 10 passed |
| Audit ribbon 1366×768 & 1280×800 | 144 tombol, 142 jalan, 2 abu-abu, **0 error JavaScript** |

## Yang belum bisa dibuktikan di lingkungan ini

1. **Klik seluruh 144 tombol sampai hasil geometri.** Setiap build kernel mematikan renderer (bagian 2), jadi
   jalur yang membangun part tidak bisa diuji lewat klik di sini. Ini perlu mesin dengan WebGL/GPU nyata.
2. **Klik yang memerlukan solver** (Gear Rating, Thermal, Calculators, Buckling, DFM, Thickness, Pipe Flow, Static
   Stress, Bearing Life). Tidak ada backend solver di lingkungan ini; yang terbukti adalah aksi + dispatcher +
   unit test handler, bukan angka solver lewat klik.
3. **Klik ketujuh tombol bagian 1 pada part yang sudah terbuka.** Refusal-nya terbukti; kelanjutannya tidak,
   karena membuka part memicu crash yang sama.
4. **Penilaian visual (screenshot).** Font web tidak tersedia luring sehingga teks tidak terender; tata letak dan
   keterbacaan tidak dinilai.
5. **Spec Playwright yang membangun geometri** (`b4-grey-tools.spec.mjs`, `s15`…`s21`, dll.) tidak dijalankan
   karena alasan yang sama dengan (1).

## Cara mengulang

```
# unit test, tanpa browser dan tanpa solver
for f in tests/*.test.mjs; do node "$f" || echo "FAIL $f"; done

# audit ribbon di browser (butuh Chromium + pustaka sistem, tanpa solver)
python3 -m http.server 3200 &        # di folder ini
node <skrip audit>.mjs               # Playwright: hitung .xr-t / .xr-t.run per tab, kedua viewport

# solver buckling (Python)
cd ../idris-ai && python3 -m pytest tests/test_buckling_beam.py
```
