# Hasil Tes Fitur Website — Idris Studio

Tanggal: 28 November 2026
Diuji pada: `http://127.0.0.1:3200/index.html?api=http://127.0.0.1:8601` (build lokal cabang `studio/aktifkan-fitur-lanjutan`, basis `origin/main` `51432c3`)
Pembanding: situs live `https://praditya0830-ai.github.io/Idris-studio/` (HTTP 200) dan `origin/main`

## Ringkasan

| Yang diperiksa | Hasil |
| --- | --- |
| Halaman termuat, workspace terbuka | OK — 0 error JavaScript setelah perbaikan `ribWhy` |
| 11 tab ribbon terender | OK — 144 tombol, 142 aktif, 2 abu-abu (tab Simulation · FEA) |
| Pindah tab | OK di 1366×768 dan 1280×800 |
| Klik tombol non-geometri (11 sampel) | 3 OK (dialog terbuka), 7 tanpa jejak terdeteksi, 1 mematikan renderer |
| Klik seluruh 144 tombol | **Tidak selesai** — Chromium crash pada tombol geometri pertama |
| Label "Mark 1" di UI | 0 (sisa 3 hanya di komentar kode) |

## Metode

- Playwright + Chromium headless lokal, argumen `--no-sandbox --disable-dev-shm-usage`.
- Solver lokal `127.0.0.1:8601` (health 200, `solver_version` 0.43.0) sebagai backend, bukan solver produksi.
- Label per tombol diambil dari klik nyata: `OK`, `NA-REASON`, `NA-SILENT`, `SILENT`, `JS-ERROR`, `SOLVER-FAIL`, `NET-BLOCK`. Satu percobaan = satu halaman baru, tab diklik dulu, lalu tombol diklik.
- Tidak ada perubahan kode aplikasi selama pengujian.

## 1. Pemuatan dan struktur ribbon

11 tab: Sketch, Features, Surface, Sheet Metal, Weldments, Mold, Assembly, Evaluate, Simulation · FEA, Drawing, Manage.

| Tab | Tombol | Aktif | Abu-abu |
| --- | --- | --- | --- |
| Sketch | 23 | 23 | 0 |
| Features | 39 | 39 | 0 |
| Surface | 12 | 12 | 0 |
| Sheet Metal | 13 | 13 | 0 |
| Weldments | 6 | 6 | 0 |
| Mold | 5 | 5 | 0 |
| Assembly | 12 | 12 | 0 |
| Evaluate | 8 | 8 | 0 |
| Simulation · FEA | 10 | 8 | 2 |
| Drawing | 6 | 6 | 0 |
| Manage | 10 | 10 | 0 |
| **Total** | **144** | **142** | **2** |

Error konsol: 0 pada 1366×768 dan 1280×800 (sebelum perbaikan ada `capReason is not defined`; sudah diperbaiki dengan pemanggilan defensif di `ribWhy`).

## 2. Klik per tombol (sampel yang berhasil diukur)

Setiap baris adalah satu halaman baru, tab diklik, lalu tombol diklik dan ditunggu 2 detik.

| Tab | Tombol | Label | Bukti |
| --- | --- | --- | --- |
| Manage | Library | OK | dialog `.libdlg` terbuka |
| Simulation · FEA | Gear Rating ISO 6336 | OK | dialog kalkulator terbuka |
| Simulation · FEA | Thermal | OK | dialog kalkulator terbuka |
| Manage | Export STEP | SILENT | tidak ada dialog/panel/unduhan terdeteksi |
| Manage | Parameters | SILENT | tidak ada dialog/panel baru terdeteksi |
| Manage | Configurations | SILENT | idem |
| Manage | Import STEP | SILENT | idem |
| Drawing | Dimensions & Notes | SILENT | idem |
| Drawing | Export PDF / DXF | SILENT | idem |
| Evaluate | Measure | SILENT | idem |
| Features | Extruded Boss/Base | CRASH | renderer Chromium mati (event `crash`), halaman tertutup |

Catatan jujur: `SILENT` berarti harness tidak melihat dialog, panel, atau perubahan teks — bukan bukti tombol rusak. Di lingkungan ini teks UI tidak terender (font web tidak tersedia), sehingga deteksi perubahan berbasis teks tidak dapat diandalkan, dan panel yang hanya mengganti isi panel kiri tidak terdeteksi.

## 3. Yang memblokir uji klik penuh

Klik tombol geometri pertama (Extruded Boss/Base, dan juga Arc di tab Sketch) **mematikan renderer Chromium**. Percobaan dengan `--disable-gpu`, `--use-gl=swiftshader`, `--enable-unsafe-swiftshader`, dan `--use-angle=swiftshader` memberi hasil sama. Penyebab paling mungkin: inisialisasi kernel WASM OpenCascade di container tanpa GPU. Karena itu 144 label per tombol tidak bisa dikumpulkan di sini; hanya 11 sampel di atas yang benar-benar terukur.

Batasan lain:

- Teks UI tidak terender di screenshot (font tidak tersedia luring), jadi tata letak dan keterbacaan **tidak** dinilai secara visual.
- Perbandingan perilaku live vs main tidak bisa dilakukan lewat klik, hanya lewat isi berkas.

## 4. Live vs main vs cabang (isi berkas)

| Penanda | Live github.io | origin/main | Cabang ini |
| --- | --- | --- | --- |
| `Mark 1` (total) | 19 | 19 | 3 |
| `Mark 1` di teks yang tampil ke pengguna | ada | ada | 0 |
| `khusus gearbox` | 0 | 0 | 0 |
| `mk1` (kunci internal status) | 11 | 11 | 10 |

Tiga sisa `Mark 1` di cabang ini hanya komentar kode (baris 9269, 10321, 10560), bukan teks UI. Empat string yang tampil ke pengguna (pesan keselamatan stang dan pesan part hasil parameter, versi Inggris dan Indonesia) sudah diubah agar tidak menyebut nama fase.

## Kesimpulan

- Perubahan tombol (Gear Rating ISO 6336, Thermal, Parameters, Configurations, Import STEP, Dimensions & Notes, Export PDF/DXF) terverifikasi lewat unit test `tests/s22-activation.test.mjs` (23 check) dan lewat klik nyata untuk Gear Rating, Thermal, dan Library.
- Tujuh tombol lain belum terbukti berfungsi dari klik; statusnya `SILENT` karena keterbatasan harness, bukan karena kegagalan yang teramati.
- Uji klik menyeluruh perlu dijalankan di mesin dengan GPU/WebGL nyata atau Chromium non-headless.

## Cara mengulang

```
node tests/s22-activation.test.mjs      # 23 check
node tests/features.test.mjs            # 71 check
# uji klik: /tmp/audit/tabs.mjs (struktur ribbon) dan /tmp/audit/tools.mjs (klik per tombol)
```
