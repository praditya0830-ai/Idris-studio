/* S18: the mould batch (Batch 4). Every step below is geometry the kernel built or measured, and every number is
 * worked out by hand first and then read back from OpenCascade:
 *
 *   box 60x40x20                   volume 48000 mm3
 *   shrink ABS 0.5 %               ×1.005 linear, ×1.005³ = ×1.0150751 volume -> 48723.02 mm³, 60.3 × 40.2 × 20.1
 *   shrink 2 % typed               ×1.02³ = ×1.061208 -> 50937.98 mm³
 *   parting line Z=10 on the box   rectangle 2(60+40) = 200 mm, 1 loop, 4 edges
 *   parting line Z=10, Ø8 hole     200 + 2π·4 = 225.1327 mm, 2 loops, 5 edges
 *   shut-off Ø8 through hole       π·4²·20 = 1005.31 mm³ filled -> 48000 mm³ again
 *   shut-off two holes Ø8 and Ø6   π·16·20 + π·9·20 = 1570.80 -> 48000 mm³ again
 *
 *   node tests/s18-mold.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const pStart = html.indexOf('/* ---- P1a:');
const pEnd = html.indexOf('/* ---- end P1a helpers */');
const mStart = html.indexOf('/* ---- S18: the mould steps');
const feStart = html.indexOf('const FEAT = {');
if ([bStart, bEnd, pStart, pEnd, mStart, feStart].some((x) => x < 0) || feStart < mStart) throw new Error('helpers or buildPart not found');
const src = html.slice(pStart, pEnd) + '\n' + html.slice(mStart, feStart) + '\n' + html.slice(bStart, bEnd);

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${src}\nreturn { buildPart, SHRINK, shrinkOptions, mouldHoles, mouldSection };`);
const { buildPart, SHRINK, shrinkOptions, mouldHoles } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const box = (Lx = 60, Wy = 40, Hz = 20) => ({ id: 'b', type: 'shape', p: { kind: 'box', L: Lx, W: Wy, H: Hz, x: 0, y: 0, z: 0, op: 'add' } });
const cyl = (id, d, h, x, y, z, dir = [0, 0, 1], op = 'cut') => ({ id, type: 'shape', p: { kind: 'cyl', D: d, H: h, x, y, z, op } });
const vol = (res) => (res.body ? R.measureVolume(res.body) : 0);
const errsOf = (p) => p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`).join(' | ');

/* 1. shrinkage: the kernel scales the body, and the volume grows by the factor cubed */
{
  const p = { features: [box(), { id: 's', type: 'shrink', p: { mat: 'ABS', pct: 0, about: 'centre' } }] };
  const res = await buildPart(p);
  t('shrinkage builds without an error', !p.features[1].err, errsOf(p));
  near(vol(res), 48000 * 1.005 ** 3, 0.01, 'ABS 0.5 % gives 48000 × 1.005³ = 48723.02 mm³');
  const b = res.body.boundingBox.bounds;
  near(b[1][0] - b[0][0], 60.3, 1e-6, 'the length becomes 60 × 1.005 = 60.3 mm');
  near(b[1][2] - b[0][2], 20.1, 1e-6, 'the height becomes 20.1 mm');
  near((b[0][0] + b[1][0]) / 2, 0, 1e-6, 'and it scales about the part centre, so the centre stays at x = 0 (Shape spans −30…30)');
  t('the note names the material, its range and both volumes', /ABS/.test(p.features[1].note || '') && /0\.3–0\.8/.test(p.features[1].note || '') && /48,?000/.test(p.features[1].note || ''), p.features[1].note);
  const typed = { features: [box(), { id: 's', type: 'shrink', p: { mat: 'ABS', pct: 2, about: 'origin' } }] };
  const r2 = await buildPart(typed);
  near(vol(r2), 48000 * 1.02 ** 3, 0.01, 'a typed 2 % gives 48000 × 1.02³ = 50937.98 mm³');
  near(r2.body.boundingBox.bounds[0][0], -30.6, 1e-6, 'scaled about the origin, the −30 face moves to −30.6');
  const bad = { features: [box(), { id: 's', type: 'shrink', p: { mat: 'ABS', pct: 20, about: 'centre' } }] };
  await buildPart(bad);
  t('a shrinkage above 10 % is refused', /above 0 %|0 %/.test(bad.features[1].err || ''), bad.features[1].err);
}

/* 2. the parting line is the kernel's section of the body with the plane */
{
  const p = { features: [box(), { id: 'pl', type: 'parting', p: { z: 10 } }] };
  await buildPart(p);
  t('the parting line builds without an error', !p.features[1].err, errsOf(p));
  const s = p.features[1].parting;
  near(s.per, 200, 1e-6, 'a 60×40 box at Z = 10 gives 2(60+40) = 200 mm of parting line');
  t('in one closed loop of four edges', s.loops === 1 && s.edges === 4, JSON.stringify(s));
  t('the note carries the measured length', /200\.00 mm/.test(p.features[1].note || ''), p.features[1].note);
  const holed = { features: [box(), cyl('h', 8, 40, 0, 0, -10), { id: 'pl', type: 'parting', p: { z: 10 } }] };
  await buildPart(holed);
  t('the parting line through a Ø8 hole builds without an error', !holed.features[2].err, errsOf(holed));
  const s2 = holed.features[2].parting;
  near(s2.per, 200 + 2 * Math.PI * 4, 1e-6, 'and adds the hole circle: 200 + 2π·4 = 225.1327 mm');
  t('in two closed loops', s2.loops === 2, JSON.stringify(s2));
  const out = { features: [box(), { id: 'pl', type: 'parting', p: { z: 30 } }] };
  await buildPart(out);
  t('a plane outside the part is refused with its range', /must cut through the part|harus memotong part/.test(out.features[1].err || ''), out.features[1].err);
}

/* 3. shut-off surfaces: the kernel measures the hole and fills it with a cylinder */
{
  const p = { features: [box(), cyl('h', 8, 40, 0, 0, -10), { id: 'so', type: 'shutoff', p: { minD: 0 } }] };
  const res = await buildPart(p);
  t('shut-off builds without an error', !p.features[2].err, errsOf(p));
  near(vol(res), 48000, 0.01, 'a Ø8 through hole is filled: the part is 48000 mm³ again');
  t('the hole is gone: no cylindrical wall is left', res.body.faces.filter((x) => x.geomType === 'CYLINDRE').length === 0, 'cylindrical faces remain');
  t('the note names the diameter and the volume filled', /Ø8\.0/.test(p.features[2].note || '') && /1,?005/.test(p.features[2].note || ''), p.features[2].note);
  near(p.features[2].shut.grew, Math.PI * 16 * 20, 0.01, 'it filled π·4²·20 = 1005.31 mm³');

  const two = { features: [box(), cyl('a', 8, 40, -15, 0, -10), cyl('b', 6, 40, 15, 0, -10), { id: 'so', type: 'shutoff', p: { minD: 0 } }] };
  const r2 = await buildPart(two);
  t('two holes build without an error', !two.features[3].err, errsOf(two));
  near(vol(r2), 48000, 0.01, 'both are filled: π·16·20 + π·9·20 = 1570.80 mm³ back to 48000');
  t('the note lists both diameters', /Ø8\.0, 6\.0/.test(two.features[3].note || ''), two.features[3].note);

  /* a blind hole is filled over its own depth, not the whole part */
  const blind = { features: [box(), cyl('h', 8, 10, 0, 0, 10), { id: 'so', type: 'shutoff', p: { minD: 0 } }] };
  const r3 = await buildPart(blind);
  near(vol(r3), 48000, 0.01, 'a 10 mm deep blind hole is filled exactly: 48000 mm³');

  /* the smallest-hole filter leaves the small one open */
  const filtered = { features: [box(), cyl('a', 8, 40, -15, 0, -10), cyl('b', 6, 40, 15, 0, -10), { id: 'so', type: 'shutoff', p: { minD: 7 } }] };
  const r4 = await buildPart(filtered);
  near(vol(r4), 48000 - Math.PI * 9 * 20, 0.01, 'minD 7 closes only the Ø8 hole and leaves Ø6 open: 47434.51 mm³');

  /* a rounded corner is a cylinder too, and must not be read as a hole */
  const fil = { features: [box(), { id: 'e', type: 'edge', p: { mode: 'fillet', r: 3, which: 'vertical' } }, { id: 'so', type: 'shutoff', p: { minD: 0 } }] };
  await buildPart(fil);
  t('a filleted box has no hole, so shut-off refuses instead of plugging the corners', /no round hole|tidak menemukan lubang/.test(fil.features[2].err || ''), fil.features[2].err);

  /* a hole across the pull direction is not a shut-off */
  const side = { features: [box(), cyl('h', 8, 80, -40, 0, 10, [1, 0, 0]), { id: 'so', type: 'shutoff', p: { minD: 0 } }] };
  await buildPart(side);
  t('a hole along X is not the pull direction, so it is refused with that reason', /pull direction|tarik/.test(side.features[2].err || ''), side.features[2].err);
}

/* 4. the table: every row carries a factor inside its own range, and the first is only a default */
{
  for (const [k, v] of Object.entries(SHRINK)) {
    const [lo, hi] = v.rng.split('–').map(Number);
    t(`${k}: ${v.s} % sits inside its range ${v.rng} %`, v.s >= lo && v.s <= hi, JSON.stringify(v));
  }
  const opts = shrinkOptions();
  t('the first material is marked a default selection, the others are not', /default selection/.test(opts[0][1][0]) && opts.slice(1).every((o) => !/default selection/.test(o[1][0])), opts[0][1][0]);
  t('every row names its range', opts.every((o) => /range|rentang|\d–\d/.test(o[1][0])), JSON.stringify(opts.map((o) => o[1][0])));
}

/* 5. the hole finder reads the wall, not the corner radius */
{
  const shape = R.makeBox([-30, -20, 0], [30, 20, 20]).cut(R.makeCylinder(4, 40, [0, 0, -10], [0, 0, 1]));
  const holes = mouldHoles(R, R.getOC(), shape);
  t('one concave cylinder is found in a Ø8 through hole', holes.length === 1, JSON.stringify(holes));
  near(holes[0].r, 4, 1e-9, 'with the radius the kernel measured: 4 mm');
  t('and its wall runs the full 20 mm the part is thick', Math.abs(holes[0].z1 - holes[0].z0 - 20) < 1e-6, JSON.stringify(holes[0]));
  const fil = R.makeBox([-30, -20, 0], [30, 20, 20]).fillet(3, (e) => e.inDirection('Z'));
  t('four fillet cylinders are not holes', mouldHoles(R, R.getOC(), fil).length === 0, 'a fillet was read as a hole');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
