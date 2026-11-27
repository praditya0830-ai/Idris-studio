/* S17: the weldment batch (Batch 3). Every step below is geometry the kernel built, and every number is worked out
 * by hand first and then read back from OpenCascade:
 *
 *   gusset legs 40,30 t4 at (0,0)      ½·40·30·sin 90°·4 = 2400 mm³, standing on the top face (z 20..24)
 *   fillet bead leg 6 at (0,0)         ½·36·sin 90°·40 = 720 mm³, from z −20 to 20
 *   fillet bead leg 6 at a 60° corner  ½·36·sin 60°·40 = 623.538 mm³
 *   gusset at a 60° corner             ½·40·30·sin 60°·4 = 2078.46 mm³
 *
 * Trim/Extend stays grey, and this file measures why: cutting the crossing walls of one corner of two SHS 40×40×3
 * members removes 2706 mm³ and leaves four separate solids instead of one, so the tool would be drawing a broken
 * part. The measurement is the same one the button's reason quotes.
 *
 *   node tests/s17-weldments.test.mjs
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
const wStart = html.indexOf('/* ---- P1d: welded frames');
const feStart = html.indexOf('const FEAT = {');
if ([bStart, bEnd, pStart, pEnd, wStart, feStart].some((x) => x < 0) || feStart < wStart) throw new Error('helpers or buildPart not found');
const src = html.slice(pStart, pEnd) + '\n' + html.slice(wStart, feStart) + '\n' + html.slice(bStart, bEnd);

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${src}\nreturn { buildPart, WELD_PROFILES, weldCorner, weldFaceCorner, weldBeadSolid, weldGussetSolid, weldMemberSolid };`);
const { buildPart, WELD_PROFILES, weldCorner, weldFaceCorner, weldBeadSolid, weldMemberSolid } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const line = (id, ax, ay, bx, by) => ({ id, t: 'line', a: [ax, ay], b: [bx, by], c: 0 });
const sketch = (id, ents) => ({ id, type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents, rels: [], dims: [] } });
const frame = (w = 500, h = 300) => sketch('fr', [line('b', 0, 0, w, 0), line('r', w, 0, w, h), line('t', w, h, 0, h), line('l', 0, h, 0, 0)]);
const member = (id = 'm', p = {}) => ({ id, type: 'member', p: { profile: 'SHS 40x40x3', trim: 'none', op: 'add', ...p } });
const errsOf = (p) => p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`).join(' | ');
const vol = (res) => (res.body ? R.measureVolume(res.body) : 0);
const bb = (res) => res.body.boundingBox.bounds;
const SHS40 = WELD_PROFILES['SHS 40x40x3'];

/* 1. reading a corner from the sketch: two lines that share an end, and the inside corner of their faces */
{
  const ents = [line('b', 0, 0, 500, 0), line('l', 0, 300, 0, 0)];
  const k = weldCorner(ents, 0, 0);
  t('two lines that end at (0,0) give a corner', !!k, JSON.stringify(k));
  near(k.angle * 180 / Math.PI, 90, 1e-9, 'its angle is 90°');
  t('their directions leave the corner (+X and +Y)', Math.abs(k.u[0] - 1) < 1e-9 && Math.abs(k.v[1] - 1) < 1e-9, JSON.stringify([k.u, k.v]));
  const fc = weldFaceCorner(k, 40);
  near(fc.p[0], 20, 1e-9, 'the inside corner of two SHS 40 faces is at x = w/2 = 20');
  near(fc.p[1], 20, 1e-9, 'and at y = w/2 = 20');
  t('a point with no two lines has no corner', weldCorner(ents, 99, 99) === null);
  t('two collinear lines are not a corner', weldCorner([line('a', 0, 0, 100, 0), line('b', 100, 0, 200, 0)], 100, 0) === null);
  const k60 = weldCorner([line('a', 0, 0, 400, 0), line('b', 0, 0, 100, 173.20508075688772)], 0, 0);
  near(k60.angle * 180 / Math.PI, 60, 1e-6, 'a 60° corner is measured as 60°');
  const fc60 = weldFaceCorner(k60, 40);
  near(fc60.p[1] / fc60.p[0], Math.tan(Math.PI / 6), 1e-6, 'its face corner sits on the bisector (offset (w/2)/(1+cos 60°) = w)');
  near(Math.hypot(fc60.p[0], fc60.p[1]), 40, 1e-6, 'a 60° corner puts the two faces 40 mm from the sketch corner');
}

/* 2. the gusset is a real prism: ½·lg·lh·sin θ·t, standing on the members' top face */
{
  const p0 = { features: [frame(), member()] };
  const v0 = vol(await buildPart(p0));
  const p = { features: [frame(), member(), { id: 'g', type: 'gusset', p: { sketch: 'fr', profile: 'SHS 40x40x3', lg: 40, lh: 30, t: 4, cx: 0, cy: 0, op: 'add' } }] };
  const res = await buildPart(p);
  t('the gusset builds without an error', !p.features[2].err, errsOf(p));
  near(vol(res) - v0, 0.5 * 40 * 30 * 4, 0.5, 'the gusset adds ½·40·30·4 = 2400 mm³ (kernel)');
  const [mn, mx] = bb(res);
  near(mn[2], -20, 1e-6, 'the members still start at z = −20');
  near(mx[2], 24, 1e-6, 'and the plate stands 4 mm above their top face: z = 24');
  near(mn[0], -20, 1e-6, 'the frame outline is the profiles: x from −w/2');
  near(mx[0], 520, 1e-6, 'to 500 + w/2');
  t('the note gives the prism volume and the growth', /2,?400/.test(p.features[2].note || '') && /grew|\u2192/.test(p.features[2].note || ''), p.features[2].note);
}

/* 3. the bead fills the inside corner: ½·a²·sin θ·w, over the profile's own height */
{
  const p0 = { features: [frame(), member()] };
  const v0 = vol(await buildPart(p0));
  const p = { features: [frame(), member(), { id: 'w', type: 'weld', p: { sketch: 'fr', profile: 'SHS 40x40x3', leg: 6, cx: 0, cy: 0, op: 'add' } }] };
  const res = await buildPart(p);
  t('the bead builds without an error', !p.features[2].err, errsOf(p));
  near(vol(res) - v0, 0.5 * 36 * 40, 0.5, 'the bead adds ½·6²·40 = 720 mm³ (kernel)');
  const [mn, mx] = bb(res);
  near(mn[2], -20, 1e-6, 'it runs the profile height: from z = −20');
  near(mx[2], 20, 1e-6, 'to z = 20');
  t('the note names the leg, the section angle and the prism', /leg 6\.0 mm/.test(p.features[2].note || '') && /sin 90\.0°/.test(p.features[2].note || ''), p.features[2].note);
  /* a bigger leg grows the section by its square: 12 mm legs are four times the 6 mm ones */
  const p2 = { features: [frame(), member(), { id: 'w', type: 'weld', p: { sketch: 'fr', profile: 'SHS 40x40x3', leg: 12, cx: 0, cy: 0, op: 'add' } }] };
  const res2 = await buildPart(p2);
  near(vol(res2) - v0, 4 * 720, 0.5, 'a 12 mm leg adds four times the steel: 2880 mm³');
}

/* 4. an oblique corner: the section area is ½·a²·sin φ, not ½·a² */
{
  const ents = [line('a', 0, 0, 400, 0), line('b', 0, 0, 100, 173.20508075688772)];
  const base = { features: [sketch('ob', ents), member()] };
  const v0 = vol(await buildPart(base));
  const p = { features: [sketch('ob', ents), member(), { id: 'w', type: 'weld', p: { sketch: 'ob', profile: 'SHS 40x40x3', leg: 6, cx: 0, cy: 0, op: 'add' } }] };
  const b = await buildPart(p);
  t('the 60° bead builds without an error', !p.features[2].err, errsOf(p));
  near(vol(b) - v0, 0.5 * 36 * Math.sin(Math.PI / 3) * 40, 0.5, 'a 60° bead adds ½·36·sin 60°·40 = 623.538 mm³');
  const g = { features: [sketch('ob', ents), member(), { id: 'g', type: 'gusset', p: { sketch: 'ob', profile: 'SHS 40x40x3', lg: 40, lh: 30, t: 4, cx: 0, cy: 0, op: 'add' } }] };
  const c = await buildPart(g);
  t('the 60° gusset builds without an error', !g.features[2].err, errsOf(g));
  near(vol(c) - v0, 0.5 * 40 * 30 * Math.sin(Math.PI / 3) * 4, 0.5, 'a 60° gusset adds ½·40·30·sin 60°·4 = 2078.46 mm³');
}

/* 5. every step refuses what it cannot do, and says why */
{
  const noCorner = { features: [frame(), member(), { id: 'g', type: 'gusset', p: { sketch: 'fr', profile: 'SHS 40x40x3', lg: 40, lh: 30, t: 4, cx: 999, cy: 999, op: 'add' } }] };
  await buildPart(noCorner);
  t('a gusset at a point with no corner is refused', /No two straight lines|Tidak ada dua garis/.test(noCorner.features[2].err || ''), noCorner.features[2].err);
  const chs = { features: [frame(), { id: 'g', type: 'gusset', p: { sketch: 'fr', profile: 'CHS 42.4x3.2', lg: 40, lh: 30, t: 4, cx: 0, cy: 0, op: 'add' } }] };
  await buildPart(chs);
  t('a gusset on a round tube is refused (no flat face)', /round tube|tabung bundar/.test(chs.features[1].err || ''), chs.features[1].err);
  const chsBead = { features: [frame(), member(), { id: 'w', type: 'weld', p: { sketch: 'fr', profile: 'CHS 42.4x3.2', leg: 6, cx: 0, cy: 0, op: 'add' } }] };
  await buildPart(chsBead);
  t('a bead needs an SHS: a round tube is refused', /SHS/.test(chsBead.features[2].err || ''), chsBead.features[2].err);
  const noSketch = { features: [frame(), member(), { id: 'w', type: 'weld', p: { sketch: 'nope', profile: 'SHS 40x40x3', leg: 6, cx: 0, cy: 0, op: 'add' } }] };
  await buildPart(noSketch);
  t('a bead with no sketch says so', /Pick an existing Sketch|Pilih langkah Sketch/.test(noSketch.features[2].err || ''), noSketch.features[2].err);
  const zero = { features: [frame(), member(), { id: 'w', type: 'weld', p: { sketch: 'fr', profile: 'SHS 40x40x3', leg: 0, cx: 0, cy: 0, op: 'add' } }] };
  await buildPart(zero);
  t('a bead with no leg size is refused', /above 0|di atas 0/.test(zero.features[2].err || ''), zero.features[2].err);
}

/* 6. Trim/Extend is grey, and here is the measurement that keeps it grey */
{
  const a = weldMemberSolid(R, SHS40, 500);
  const b = weldMemberSolid(R, SHS40, 300).rotate(90, [0, 0, 0], [0, 0, 1]).translate([500, 0, 0]);
  const union = a.fuse(b), inter = a.intersect(b);
  const after = union.cut(inter);
  t('the corner of two SHS 40×40×3 members shares 2706 mm³ of crossing walls', Math.abs(R.measureVolume(inter) - 2706) < 1, String(R.measureVolume(inter)));
  t('cutting that overlap leaves four separate solids, not one', after.solids.length === 4, String(after.solids.length));
  t('the frame loses 2706 mm³ and breaks apart: this is why the button is grey', Math.abs(R.measureVolume(after) - (R.measureVolume(union) - 2706)) < 1, `${R.measureVolume(after)}`);
  t('the button is built now, and its reason for refusing a splitting cut is on the step', /'Trim\/Extend', 'trim', 'on', '[^']*refuses when that cut would leave more than one solid/.test(html), 'Trim/Extend is not an active tool, or the reason is gone');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
