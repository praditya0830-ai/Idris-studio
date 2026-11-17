# Rencana sampai 30 November: semua fitur benar-benar bisa dipakai

Dokumen ini hasil audit kode `index.html` (commit `92b40c6`, 850 KB) pada 17 Nov 2026.
Angka di bawah bukan perkiraan: dihitung dari array `RIBBON` di dalam `index.html`, satu entri `T(...)` = satu tombol.

## 1. Status hari ini

`RIBBON` berisi **139 tombol** di 11 tab. Legenda `RIB_ST` di kode menyebut empat status:

| status | arti di kode | jumlah |
|---|---|---|
| `on` | Active — jalan sekarang di browser (kernel OpenCascade / replicad) | **31** |
| `gb` | hanya di dalam desain gearbox, dihitung solver server | 14 |
| `mk1` | "Planned for IDRIS Mark 1. Not in this build." | **44** |
| `no` | tidak ada di build ini dan belum dijadwalkan | **50** |

Jadi 94 dari 139 tombol (68%) belum mengerjakan apa pun. Tombolnya sudah jujur (ada popover penjelasan),
tapi yang belum ada adalah bentuk nyata dari 94 tool itu.

Rincian per tab, `✔`=on, `g`=gb, `·`=mk1, `✗`=no:

**Sketch** — Sketch: Sketch✔, Exit Sketch✔ | Draw: Line·, Corner Rectangle✔, Circle✔, Arc·, Slot✔, Polygon✔, Spline✗, Ellipse✗, Point·, Centerline·, Text✗ | Modify: Sketch Fillet·, Offset Entities·, Convert Entities✗, Trim·, Extend·, Mirror Entities·, Sketch Pattern· | Constrain: Smart Dimension✔, Add Relation·

**Features** — Boss/Base: Extruded✔, Revolved✔, Swept·, Lofted·, Boundary✗ | Cut: Extruded Cut✔, Revolved Cut·, Swept Cut·, Lofted Cut·, Hole Wizard✔ | Primitives: Box✔, Cylinder✔, Tube✔, Sphere✔ | Dress-up: Fillet✔, Chamfer✔, Variable Fillet✗, Shell✔, Draft✔, Rib·, Thread✗, Dome✗, Wrap✗ | Pattern: Linear✔, Circular✔, Mirror✔, Curve✗, Fill✗ | Body: Combine✔, Mirror Body✔, Move/Copy✔, Split✗, Scale✗, Thicken✗

**Surface** — 7 tool, semuanya `✗`. Tidak ada satu pun surface tool.

**Sheet Metal** — 5 tool, semuanya `·` (Base/Edge/Miter Flange, Hem, Jog). Tidak ada.

**Weldments** — 5 tool: Structural Member·, Trim/Extend·, End Cap·, Gusset·, Weld Bead✗, Cut List·.

**Mold** — 5 tool, semuanya `✗` (Draft Analysis, Parting Line, Shut-off, Core/Cavity, Shrinkage).

**Assembly** — Insert Component·, Move/Rotate·, Component Pattern·, Mirror✗, Standard Parts·, Mate·, Auto Assembly·. **Tidak ada satu pun yang aktif**, padahal ini yang diminta paling keras.

**Evaluate** — Measure✔, Mass Properties✔, Section View (gb).

**Simulation · FEA** — 5 tool gearbox (gb), Part Stress (FEA)·.

**Drawing** — Working Drawings (gb), BOM Table (gb), Part Drawing·, Section/Detail✗, Dimensions✗, GD&T✗, Export PDF/DXF✗.

**Manage** — Library✔, Export STEP✔, Export STL✔, Import STEP·, Report (gb), Parameters·, Configurations✗, Rename✔.

## 2. Kenapa sepedanya jadi pelat

Bukan bug renderer. Bahasa bentuknya tidak punya cara menyatakan tabung miring:

- `cyl` dan `tube` dipaku ke arah `[0,0,1]` — `R.makeCylinder(r, h, base, [0,0,1])` — dan form-nya hanya punya `D`, `Di`, `H`, `x`, `y`, `z`. Tidak ada sudut.
- `sketchOnPlane(...).extrude(d)` selalu menembak tegak lurus bidang sketch.
- `Swept Boss/Base` berstatus `·`, jadi tidak ada.

Akibatnya satu-satunya bentuk yang bisa ditulis untuk batang diagonal adalah persegi panjang miring di
bidang XZ yang di-extrude beberapa mm: pelat. Roda jadi cincin pelat. Dan karena invarianya hanya
`watertight` + `volume > 0`, hasil berbentuk pancake tetap lolos "2/2 checks passed".

Perbaikan minimum yang mengubah ini: dua titik A→B + diameter, bukan H + posisi.

## 3. Kontrak part vs assembly

IDRIS harus memutuskan ini **sebelum** menggambar, dan keputusannya harus bisa dibaca manusia.
Endpoint baru `POST /model/plan` (engine) mengembalikan:

```json
{
  "kind": "assembly",
  "why": "frame + 2 wheels + drivetrain, 9 parts, joined by welds and bearings",
  "parts": [{"id": "tube_tt", "role": "structure", "qty": 1, "make": "cut tube"}],
  "interfaces": [{"a": "tube_tt", "b": "tube_st", "type": "weld", "at": [0, 0, 0]}],
  "needs": ["wheel diameter", "rider mass", "brake mount standard"]
}
```

Aturan penentu (deterministik, bukan selera LLM):

1. `kind = assembly` bila ada ≥2 body yang bergerak relatif terhadap satu sama lain, atau ada
   interface bukan-fusi (bolt, bearing, weld, slip), atau ada part standar (baut, bearing).
2. `kind = part` bila satu body monolitik dan semua fitur dipotong/ditambah pada material yang sama.
3. Bila ragu, `kind = assembly` + `needs` diisi — lebih baik bertanya daripada menggambar satu blok
   yang tidak bisa dirakit.

Studio menampilkan `why` di breadcrumb dan `needs` sebagai pertanyaan ke engineer, bukan sebagai chat bebas.

## 4. Umpan balik engineer

Setelah build, engine mengembalikan `review[]` yang **diturunkan dari geometri yang sudah diukur**:

| id | aturan | contoh pesan |
|---|---|---|
| `MEMBER_SLENDER` | L/D > 40 pada batang | "batang 620 mm Ø14 akan melentur; naikkan ke Ø19 atau tambah gusset" |
| `WALL_THIN` | tebal < 1.5 mm pada shell | "dinding 1.2 mm di bawah minimum cetak 1.5 mm" |
| `CORNER_SHARP` | sudut dalam < R0.5 | "sudut dalam tajam, tambah fillet R1" |
| `JOINT_GAP` | dua part berjarak <0.2 mm tapi tidak menyentuh | "sambungan tidak menyatu dan tidak bertumpu" |
| `UNSUPPORTED` | FEA: tumpuan < 3 titik / under-constrained | "model bisa berputar bebas, tambah tumpuan" |
| `NO_LOAD_PATH` | FEA: tegangan nol di area yang dibebani | "beban tidak sampai ke tumpuan" |

Semua pesan wajib menyebut angka yang diukur dan tindakan perbaikannya. Tidak ada kalimat tanpa angka.

## 5. Pembagian tugas

**B = Buffy (repo `Idris-ai`, engine + kernel + uji).** **C = GitHub Copilot (repo `Idris-studio`, UI).**

| id | tugas | pemilik | selesai bila |
|---|---|---|---|
| B1 | op `member(a, b, od, id?)`: tabung bundar antara dua titik 3D, ujung di-trim ke member tetangga | B | `/model/build` membangun rangka 6 batang, volume = Σ π/4(OD²−ID²)L, satu body |
| B2 | `boolean union/subtract` masuk graf fitur (`allow_multi`) | B | dua batang bersilangan jadi 1 body, invarian `solid.single` lulus |
| B3 | op `chamfer`, `shell`, `split`, `scale`, `thicken` | B | masing-masing punya uji matriks + angka analitik |
| B4 | `POST /model/plan` (kind, why, parts, interfaces, needs) + aturan §3 | B | 6 kasus uji: sepeda, gearbox, pelat, poros, bracket, bracket+bolt |
| B5 | `review[]` §4 di setiap jawaban build | B | tiap id punya uji yang memicu dan tidak memicu |
| B6 | assembly: resolver mate, `POST /assembly/check` (interference + clearance), BOM, transform explode | B | sepeda: 0 interferensi, BOM 12 baris, explode 8 part |
| B7 | FEA part: `/part-check` menerima beban + tumpuan, mengembalikan tegangan/defleksi + `UNSUPPORTED`/`NO_LOAD_PATH` | B | frame sepeda: tegangan maks < yield/2, defleksi < L/200 |
| B8 | invarian baru + matriks live (≥30 kasus) + semua uji hijau | B | CI hijau, angka live cocok analitik |
| C1 | Tidak ada tombol yang diam: setiap `T()` punya handler atau `disabled` dengan alasan | C | klik 139 tool, tidak ada yang no-op tanpa pesan |
| C2 | Sketch editor nyata: line, arc, trim, extend, mirror, relation, snapping, dimension-driven | C | gambar profil L-shape + 2 lubang dari nol, tanpa AI |
| C3 | `cyl`/`tube`/`member` menerima arah: `dir:[x,y,z]` atau dua titik | C | rangka 6 batang miring tampil sebagai tabung bulat |
| C4 | Semua tombol `·`/`✗` di-wire ke endpoint baru; status berubah ke `on` hanya setelah uji lulus | C | status di RIB_ST cocok dengan hasil klik |
| C5 | Assembly workspace: tree, insert/move/mate, badge interferensi, explode, tabel BOM | C | sepeda bisa dirakit dan diurai di layar |
| C6 | Drawing A3: 3 view + dimensi + export PDF/DXF | C | PDF sepeda dengan 12 dimensi |
| C7 | Panel FEA: pilih muka beban/tumpuan, colormap tegangan, panel DFM | C | frame sepeda menampilkan tegangan maks |
| C8 | Smoke test Playwright 10 alur inti | C | 10/10 hijau di CI |

## 6. Milestone

| tanggal | tema | B | C | DoD |
|---|---|---|---|---|
| 18–21 Nov | geometri jujur | B1, B2, B8 | C1, C3, C4 | batang sepeda jadi tabung; tidak ada tombol bohong |
| 22–25 Nov | part vs assembly | B4, B6, B5 | C5 | sepeda dirakit sebagai assembly, 0 interferensi, review tampil |
| 26–28 Nov | FEA + DFM + gambar | B7, B3 | C6, C7 | tegangan frame < yield/2, PDF A3 keluar |
| 29–30 Nov | acceptance | matriks live 30 kasus | C8 | semua uji hijau, sepeda lolos 5 cek acceptance |

## 7. Acceptance: sepeda 26" diamond frame

Kasus uji yang sama dipakai B dan C. Lulus bila:

1. `kind = assembly`, 9 part (6 batang rangka, 2 roda, 1 bottom bracket), bukan 1 pelat.
2. Semua batang tabung bundar Ø asli, sambungan menyatu (union) di 6 node.
3. Interference check = 0 pasangan bertumpuk.
4. FEA frame: tegangan maks < yield/2 pada beban 1200 N di sadel, defleksi < L/200.
5. Gambar A3 keluar dengan 3 view + BOM 9 baris + 12 dimensi.

Selama kelima ini belum hijau, tab Assembly dan Simulation belum boleh berstatus `on`.

## 8. Cara mengukur ulang audit ini

```bash
python3 - <<'PY'
import re
s=open('index.html',encoding='utf-8').read()
blk=s[s.find('const RIBBON = ['):s.find('const RIB_ALL')]
from collections import Counter
print(Counter(re.findall(r"T\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']*)'", blk)))
PY
```

Angka target 30 Nov: `{'on': 120+, 'gb': 10, 'mk1': 0, 'no': ≤5}` — sisanya hanya yang memang di luar lingkup
(Surface, Mold, GD&T) dan ditandai terang-terangan, bukan disembunyikan.
