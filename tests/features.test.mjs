/* Tests for the part feature pipeline in index.html.
 *
 * The build function is not re-implemented here: it is lifted out of index.html
 * and run against the real OpenCascade kernel (kernel/replicad*.js), so these
 * tests exercise the code that ships in the browser.
 *
 *   node tests/features.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

/* ---- lift the shipped code ------------------------------------------------ */
const START = 'async function buildPart(pArg)';
const END = '\n/* triangles \u2192 binary STL';
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) throw new Error('buildPart not found in index.html');
const src = html.slice(a, b);
const tapSrc = html.match(/const TAP = (\{[^}]*\});/);
if (!tapSrc) throw new Error('TAP table not found in index.html');

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const makeBuild = (TAP) => new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f', `${src}\nreturn buildPart;`)(
  async () => R, L, TAP, async () => null, {}, f);

/* ---- kernel ----------------------------------------------------------------- */
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const buildPart = makeBuild(new Function('return ' + tapSrc[1])());
const vol = (s) => (s ? R.measureVolume(s) : 0);

/* ---- tiny test runner ------------------------------------------------------- */
let pass = 0; const fails = [];
function check(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
function eq(actual, expected, tol, what) {
  if (Math.abs(actual - expected) > tol) throw new Error(`${what}: ${actual} != ${expected} (±${tol})`);
}
function ok(cond, what) { if (!cond) throw new Error(what); }

/* features are plain objects, exactly what the tree stores */
let n = 0;
const F = (type, p, extra) => ({ id: 'f' + (++n), type, p, ...(extra || {}) });
const errs = (features) => features.map((x) => x.err).filter(Boolean);

/* ---------------------------------------------------------------- revolve --- */
const SK = (p) => F('sketch', { prof: 'rect', W: 10, Hh: 30, D: 20, n: 6, plane: 'XZ', at: 'value', off: 0, u: 10, v: 15, ...(p || {}) });

console.log('\nRevolved Boss/Base');
const run = async (features) => { const part = { features }; const r = await buildPart(part); return { body: r.body, features }; };

const revOk = await run([SK(), F('revolve', { axis: 'Z', angle: 360, op: 'add' })]);
check('revolve 360° volume', () => eq(vol(revOk.body), 18849.6, 2, 'volume'));
check('revolve 360° outer size 30 mm', () => eq(revOk.body.boundingBox.bounds[1][0], 15, 0.01, 'max X'));

const revHalf = await run([SK(), F('revolve', { axis: 'Z', angle: 180, op: 'add' })]);
check('revolve 180° volume is half', () => eq(vol(revHalf.body), 18849.6 / 2, 2, 'volume'));

/* S0: the volume is locked on both sides of the cut, not just "less than the box" */
const cutBox = await run([F('shape', { kind: 'box', L: 40, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' })]);
check('the box before the revolved cut is 32000 mm³', () => eq(vol(cutBox.body), 32000, 0.01, 'volume'));

const revCut = await run([F('shape', { kind: 'box', L: 40, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' }),
  SK({ plane: 'XY', at: 'value', off: 10, u: 15, v: 0 }), F('revolve', { axis: 'Y', angle: 360, op: 'cut' })]);
const cutVol = vol(revCut.body);
check('revolved cut removes material', () => ok(revCut.body && cutVol < 32000, `cut ran, ${cutVol.toFixed(1)} mm³ of 32000 left`));
check('revolved cut leaves no error on any step', () => ok(!errs(revCut.features).length, 'errors: ' + JSON.stringify(revCut.features.map((x) => x.err || null))));
check('revolved cut removes the amount the geometry gives (13534 mm³)',
  () => ok(32000 - cutVol > 13000 && cutVol > 18000 && cutVol < 19000, `removed ${(32000 - cutVol).toFixed(1)} mm³, ${cutVol.toFixed(1)} left`));

const revBadAngle = await run([SK(), F('revolve', { axis: 'Z', angle: 0, op: 'add' })]);
check('revolve rejects 0°', () => ok(/angle must be above 0/.test(revBadAngle.features[1].err), 'got: ' + revBadAngle.features[1].err));
const revBadAngle2 = await run([SK(), F('revolve', { axis: 'Z', angle: 400, op: 'add' })]);
check('revolve rejects 400°', () => ok(/at most 360/.test(revBadAngle2.features[1].err), 'got: ' + revBadAngle2.features[1].err));

const revCrossing = await run([SK({ u: 0 }), F('revolve', { axis: 'Z', angle: 360, op: 'add' })]);
check('revolve profile on the axis fails with an actionable message',
  () => ok(revCrossing.features[1].err && /clear of the axis/.test(revCrossing.features[1].err), 'got: ' + revCrossing.features[1].err));

const revNoSketch = await run([F('shape', { kind: 'box', L: 20, W: 20, H: 20, x: 0, y: 0, z: 0, op: 'add' }), F('revolve', { axis: 'Z', angle: 360, op: 'add' })]);
check('revolve without a sketch explains what is missing',
  () => ok(/needs a Sketch before it/.test(revNoSketch.features[1].err), 'got: ' + revNoSketch.features[1].err));

/* ------------------------------------------------------------------ draft --- */
const BOX = () => F('shape', { kind: 'box', L: 50, W: 30, H: 20, x: 0, y: 0, z: 0, op: 'add' });

console.log('\nDraft');
const d5 = await run([BOX(), F('draft', { sides: 'X', angle: 5, neutral: 'bottom' })]);
check('draft 5° on ±X removes the expected wedge', () => eq(vol(d5.body), 30000 - 2 * 524.9, 3, 'volume'));

const d3 = await run([BOX(), F('draft', { sides: 'X', angle: 3, neutral: 'bottom' })]);
check('draft 3° is smaller than 5°', () => ok(vol(d3.body) > vol(d5.body) && vol(d3.body) < 30000, `3°=${vol(d3.body).toFixed(1)} 5°=${vol(d5.body).toFixed(1)}`));
check('draft 3° matches the geometry', () => eq(vol(d3.body), 30000 - 12000 * Math.tan(3 * Math.PI / 180), 3, 'volume'));

const dY = await run([BOX(), F('draft', { sides: 'Y', angle: 5, neutral: 'bottom' })]);
check('draft on ±Y removes the wedge on the other axis', () => eq(vol(dY.body), 30000 - 20000 * Math.tan(5 * Math.PI / 180), 4, 'volume'));

const dAll = await run([BOX(), F('draft', { sides: 'XY', angle: 5, neutral: 'bottom' })]);
/* four faces at once = a prismoid: 50×30 at the bottom, smaller by h·tanθ on each side at the top */
const topW = 50 - 2 * 20 * Math.tan(5 * Math.PI / 180), topD = 30 - 2 * 20 * Math.tan(5 * Math.PI / 180);
const prismoid = 20 / 6 * (50 * 30 + topW * topD + 4 * ((50 + topW) / 2) * ((30 + topD) / 2));
check('draft on all four sides matches the prismoid volume', () => eq(vol(dAll.body), prismoid, 4, 'volume'));

const dTop = await run([BOX(), F('draft', { sides: 'X', angle: 5, neutral: 'top' })]);
check('draft about the top neutral plane gives the mirrored taper', () => ok(Math.abs(vol(dTop.body) - vol(d5.body)) < 3, `top=${vol(dTop.body).toFixed(1)} bottom=${vol(d5.body).toFixed(1)}`));

const dRebuild = await run([BOX(), F('draft', { sides: 'X', angle: 8, neutral: 'bottom' })]);
check('changing only the angle rebuilds a different body', () => ok(vol(dRebuild.body) < vol(d5.body), 'bigger angle = less material'));

const dBad = await run([BOX(), F('draft', { sides: 'X', angle: 60, neutral: 'bottom' })]);
check('draft rejects 60°', () => ok(/at most 45/.test(dBad.features[1].err), 'got: ' + dBad.features[1].err));

const dNoBody = await run([F('draft', { sides: 'X', angle: 5, neutral: 'bottom' })]);
check('draft without a body explains what is missing', () => ok(/needs a body/.test(dNoBody.features[0].err), 'got: ' + dNoBody.features[0].err));

const dCyl = await run([F('shape', { kind: 'cyl', D: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' }), F('draft', { sides: 'X', angle: 5, neutral: 'bottom' })]);
check('draft on a round body fails with a readable message, not a crash',
  () => ok(/no flat .* face|could not draft/.test(dCyl.features[1].err || ''), 'got: ' + dCyl.features[1].err));

/* ------------------------------------------------------ smart dimension ----- */
console.log('\nSmart Dimension');
const sk = () => SK({ prof: 'rect', W: 30, Hh: 20, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 });
const push10 = () => F('push', { dist: 10, op: 'add', both: 'one' });
const dim = (target, param, value, extra) => F('dim', { step: target.id, param, value }, extra);

const plain = await run([sk(), push10()]);
check('sketch 30×20 extruded 10 = 6000 mm³', () => eq(vol(plain.body), 6000, 1, 'volume'));
/* S0: buildPart runs here in a bare function scope, the way it runs on a page without the Studio's other
   globals. A step that records something in an outer variable fails here instead of in production. */
check('a sketch step never fails on bookkeeping outside buildPart',
  () => ok(!errs(plain.features).length, 'errors: ' + JSON.stringify(plain.features.map((x) => x.err || null))));

const driven = (() => { const s = sk(); return [s, push10(), dim(s, 'W', 50)]; })();
const r1 = await run(driven);
check('a dimension drives the sketch: W 30 → 50 gives 10000 mm³', () => eq(vol(r1.body), 10000, 1, 'volume'));

const driven2 = driven.map((x) => (x.type === 'dim' ? { ...x, p: { ...x.p, value: 60 } } : x));
const r2 = await run(driven2);
check('rebuild after the dimension changes: W 60 gives 12000 mm³', () => eq(vol(r2.body), 12000, 1, 'volume'));
check('the dimension step reports what it drives', () => ok(/W = 60 mm drives step 1/.test(driven2[2].note || ''), 'got: ' + driven2[2].note));

const suppressed = await run(driven.map((x) => (x.type === 'dim' ? { ...x, off: true } : x)));
check('suppressing the dimension leaves the sketch its own size', () => eq(vol(suppressed.body), 6000, 1, 'volume'));

const zeroTarget = sk();
const zero = await run([zeroTarget, push10(), dim(zeroTarget, 'W', 0)]);
check('a dimension of 0 is refused', () => ok(/greater than 0/.test(zero.features[2].err), 'got: ' + zero.features[2].err));

const wrongParam = (() => { const s = SK({ prof: 'circle', D: 20, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }); return [s, push10(), dim(s, 'W', 40)]; })();
const wrong = await run(wrongParam);
check('a width dimension on a circle is refused', () => ok(/no width to drive/.test(wrongParam[2].err || ''), 'got: ' + wrongParam[2].err));

const sidesBad = (() => { const s = SK({ prof: 'poly', D: 20, n: 6, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }); return [s, push10(), dim(s, 'n', 2.5)]; })();
const sb = await run(sidesBad);
check('a side count of 2.5 is refused', () => ok(/whole number, 3 or more/.test(sidesBad[2].err || ''), 'got: ' + sidesBad[2].err));

const noTarget = await run([sk(), push10(), F('dim', { step: 'missing', param: 'W', value: 20 })]);
check('a dimension pointing at no sketch is refused', () => ok(/Pick the sketch/.test(noTarget.features[2].err), 'got: ' + noTarget.features[2].err));

const polyOk = (() => { const s = SK({ prof: 'poly', D: 20, n: 6, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }); return [s, push10(), dim(s, 'n', 8)]; })();
const po = await run(polyOk);
check('a side count of 8 rebuilds a different polygon', () => ok(!polyOk[2].err && po.body && vol(po.body) > 0, 'built'));

/* ------------------------------------------------------------ regression --- */
console.log('\nRegression: tools that were already active');
const box = await run([BOX()]);
check('Shape box 50×30×20', () => eq(vol(box.body), 30000, 0.01, 'volume'));

const tube = await run([F('shape', { kind: 'tube', D: 40, Di: 20, H: 20, x: 0, y: 0, z: 0, op: 'add' })]);
check('Primitive tube', () => eq(vol(tube.body), Math.PI * (400 - 100) * 20, 5, 'volume'));

const hole = await run([BOX(), F('hole', { type: 'simple', D: 8, depthMode: 'thru', depth: 10, x: 0, y: 0 })]);
check('Hole (through) removes material', () => ok(vol(hole.body) < 30000 && vol(hole.body) > 25000, 'volume ' + vol(hole.body).toFixed(1)));

const fillet = await run([BOX(), F('edge', { mode: 'fillet', r: 2, which: 'all' })]);
check('Edge fillet builds', () => ok(vol(fillet.body) > 0 && vol(fillet.body) < 30000, 'volume ' + vol(fillet.body).toFixed(1)));

const pat = await run([F('shape', { kind: 'cyl', D: 10, H: 10, x: 0, y: 0, z: 0, op: 'add' }), F('repeat', { kind: 'line', count: 4, dx: 20, dy: 0, cx: 0, cy: 0, plane: 'YZ' })]);
check('Linear pattern repeats the step before', () => eq(vol(pat.body), 4 * Math.PI * 25 * 10, 5, 'volume'));

const shell = await run([BOX(), F('wall', { t: 2, open: 'top' })]);
check('Shell hollows the body', () => ok(vol(shell.body) > 0 && vol(shell.body) < 30000, 'volume ' + vol(shell.body).toFixed(1)));

const mirror = await run([F('shape', { kind: 'box', L: 10, W: 10, H: 10, x: 10, y: 0, z: 0, op: 'add' }), F('bodies', { kind: 'mirror', plane: 'YZ', dx: 0, dy: 0, dz: 0 })]);
check('Mirror body doubles the part', () => eq(vol(mirror.body), 2000, 1, 'volume'));

const badSize = await run([F('shape', { kind: 'box', L: 0, W: 30, H: 20, x: 0, y: 0, z: 0, op: 'add' })]);
check('a 0 mm size is still refused', () => ok(/above 0 mm/.test(badSize.features[0].err), 'got: ' + badSize.features[0].err));

const suppressedShape = await run([F('shape', { kind: 'box', L: 10, W: 10, H: 10, x: 0, y: 0, z: 0, op: 'add', }, { off: true }), F('shape', { kind: 'box', L: 20, W: 20, H: 20, x: 0, y: 0, z: 0, op: 'add' })]);
check('a suppressed step is skipped and the rest still builds', () => eq(vol(suppressedShape.body), 8000, 0.01, 'volume'));

/* ------------------------------------------------------------------------ */

/* --------------------------------------------------------------------- S9 --- */
/* the DFM and AP242 answers, lifted from index.html and checked as data */
const s9Start = html.indexOf('/* ---- S9 helpers'), s9End = html.indexOf('/* ---- end S9 helpers */');
if (s9Start < 0 || s9End < 0) throw new Error('S9 helpers not found in index.html');
const S9 = new Function('f', 'L', `${html.slice(s9Start, s9End)}\nreturn { dfmWallNote, dfmIsCoarse, dfmDrillRows, dfmFindingValue, ap242Solids };`)(f, L);

check('an exact wall measurement is named as exact', () => {
  const n = S9.dfmWallNote({ method_id: 'exact-ray-triangle', resolution_mm: 0.0001, min_mm: 5 });
  ok(n.known && n.exact, 'the exact cast must be known and exact');
  eq(n.resolution_mm, 0.0001, 1e-9, 'resolution');
});

check('a voxel fallback is reported with its cell and never as exact', () => {
  const n = S9.dfmWallNote({ method_id: 'voxel-fallback', resolution_mm: 0.25 });
  ok(n.known && !n.exact, 'the fallback must not claim exact');
  eq(n.resolution_mm, 0.25, 1e-9, 'cell');
});

check('the solver contract from main (method + resolution_mm) is read too', () => {
  const n = S9.dfmWallNote({ method: 'ray cast on the mesh, quantised by resolution_mm (±1 voxel)', resolution_mm: 5, min_mm: 7.5, p5_mm: 7.5 });
  ok(n.known && !n.exact, 'voxel method is known and not exact');
  eq(n.method_id, null, 0, 'no invented method_id');
  ok(/ray cast/.test(n.text), 'the solver wording is kept');
  eq(n.resolution_mm, 5, 1e-9, 'resolution');
});

check('the wall line shows the cell size next to the values, not only in prose', () => {
  ok(/\$\{pm\}/.test(html) && /one cell|satu sel/.test(html), 'the values carry ± resolution');
  ok(/coarser than the/.test(html), 'the coarse warning names the grid and the wall');
});

check('a solver that does not say how it measured is not credited with a method', () => {
  const n = S9.dfmWallNote({ min_mm: 5 });
  ok(!n.known && n.method_id === null && n.resolution_mm === null, 'no method claimed');
});

check('a coarse measurement is not a pass', () => {
  ok(S9.dfmIsCoarse({ id: 'min_wall', status: 'not_checked', message: 'measurement too coarse for this wall limit' }), 'coarse should be flagged');
  ok(!S9.dfmIsCoarse({ id: 'min_wall', status: 'pass', message: 'measured 5 mm >= 3 mm' }), 'a pass is not coarse');
  ok(!S9.dfmIsCoarse({ id: 'min_wall', status: 'not_checked', message: 'no wall could be measured' }), 'another not_checked is not coarse');
  ok(!S9.dfmIsCoarse(undefined), 'nothing is not coarse');
});

check('the drill table names each diameter and the drill that makes it', () => {
  const rows = S9.dfmDrillRows({ id: 'drill_size', unit: 'count', value: 3, diameters_mm: [
    { d_mm: 6, standard_drill_mm: 6, in_series: true, holes: 2 },
    { d_mm: 6.2, standard_drill_mm: 6, in_series: false, holes: 1 }] });
  eq(rows.length, 2, 0, 'rows');
  eq(rows[0].d, 6, 0, 'diameter');
  eq(rows[0].holes, 2, 0, 'holes');
  ok(rows[0].in_series && !rows[1].in_series, 'the series flags survive');
  eq(rows[1].drill, 6, 0, 'nearest drill');
});

check('the drill check shows a hole count whatever unit the solver sends', () => {
  eq(S9.dfmFindingValue({ id: 'drill_size', unit: 'mm', value: 1 }), '1 hole(s)', 'main solver sends unit mm');
  eq(S9.dfmFindingValue({ id: 'drill_size', unit: 'count', value: 3 }), '3 hole(s)', 'X1 count contract');
  eq(S9.dfmFindingValue({ id: 'min_wall', unit: 'mm', value: 7.5 }), '7.500 mm', 'wall keeps its unit');
  eq(S9.dfmFindingValue({ id: 'draft', unit: 'fraction', value: 0.25 }), '25.0 %', 'fraction stays a percentage');
});

check('the real POST /dfm/part answer from main is read, not guessed', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures-dfm-main.json', import.meta.url), 'utf8'));
  const w = fx.wall || (fx.outputs || {}).wall, note = S9.dfmWallNote(w);
  ok(note.known, 'method is known'); ok(note.exact, 'main solver sends exact-ray-triangle');
  eq(note.resolution_mm, 0.0001, 1e-9, 'resolution');
  const findings = fx.findings || (fx.outputs || {}).findings || [];
  const drill = findings.find((x) => x.id === 'drill_size'), wall = findings.find((x) => x.id === 'min_wall');
  eq(S9.dfmFindingValue(drill), '1 hole(s)', 'hole count, not a diameter in mm');
  eq(S9.dfmFindingValue(wall), '40.000 mm', 'wall keeps mm');
  ok(!S9.dfmIsCoarse(wall), 'an exact measurement with a real pass is not coarse');
});

check('the review\u2019s coarse voxel answer shows its grid and a hole count, not mm', () => {
  const w = { method: 'ray cast on the mesh, quantised by resolution_mm (±1 voxel)', resolution_mm: 5, min_mm: 7.5, p5_mm: 7.5, median_mm: 7.5 };
  const note = S9.dfmWallNote(w);
  ok(note.known && !note.exact, 'voxel fallback is known and not exact');
  eq(note.resolution_mm, 5, 0, 'grid');
  eq(S9.dfmFindingValue({ id: 'drill_size', value: 1, unit: 'mm' }), '1 hole(s)', 'unit mm must still read as a hole count');
  ok(/coarser than the/.test(html), 'the view warns that the grid is coarser than the wall');
});

check('a solver without diameters_mm gives no table instead of an invented one', () => {
  ok(S9.dfmDrillRows({ id: 'drill_size', unit: 'count', value: 1 }) === null, 'no table without the data');
});

check('solids per part: one is quiet, more than one is flagged, silence is not a claim', () => {
  const one = S9.ap242Solids({ solids_per_part: { bracket: 1 } });
  ok(one.reported && one.over.length === 0, 'one solid should not be flagged');
  const many = S9.ap242Solids({ stats: { solids_per_part: { bracket: 3 } }, warnings: ['part bracket is 3 separate closed bodies'] });
  eq(many.over.length, 1, 0, 'over count');
  eq(many.by_part.bracket, 3, 0, 'solid count per part');
  eq(many.warnings.length, 1, 0, 'warnings are carried');
  const none = S9.ap242Solids({});
  ok(!none.reported && none.over.length === 0, 'an unreported count is not a claim');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const [name, e] of fails) console.log('FAILED: ' + name + ' -> ' + (e && e.message)); process.exit(1); }
