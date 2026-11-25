/* S21: the two sketch curves Batch 1 turns on — Ellipse and the closed spline through points.
 *
 * The S21 block and buildPart are lifted out of index.html and run against the real OpenCascade kernel, so this
 * covers the code that ships in the page:
 *   * the point list parser takes `x,y; x,y` and ignores what is not a pair of numbers;
 *   * an ellipse Ø60 × Ø30 extruded 10 mm is 14 137.167 mm³ — the analytic π·a·b·h, because the kernel draws real
 *     ellipse arcs, and the bounding box is exactly 60 × 30 × 10;
 *   * a closed spline through 4 points is a real Bézier chain: 4 side faces + top + bottom = 6 faces, and the
 *     curve passes through each of the 4 points;
 *   * invalid input is refused with a reason and the step is marked failed: minor > major, fewer than 3 points,
 *     two points on top of each other, a self-crossing list, and a spline on a body with no solid;
 *   * the whole thing rebuilds: change a diameter or the point list and the volume follows, and Smart Dimension can
 *     drive the ellipse's major diameter;
 *   * every successful step is in the feature tree with no error, which is what the page draws.
 *
 *   node tests/s21-sketch-curves.test.mjs
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
const sStart = html.indexOf('/* ---- S21: the sketch curves');
const sEnd = html.indexOf('/* ---- end S21 helpers */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, pStart, pEnd, sStart, sEnd, tAt].some((x) => x < 0) || bEnd < bStart || pEnd < pStart || sEnd < sStart) {
  throw new Error('the S21 block or buildPart is not where the test expects it in index.html');
}

const p1src = html.slice(pStart, pEnd);
const s21src = html.slice(sStart, sEnd);
const buildSrc = html.slice(bStart, bEnd);
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);

const make = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${p1src}\n${s21src}\n${buildSrc}\nreturn { buildPart, s21SplinePts, s21SplineSelfCross, s21Check, s21Ellipse, s21Spline, s21Sketch, s21Curve };`);

const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const P = make(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);
const { buildPart } = P;

let pass = 0;
const fails = [];
const check = (name, fn) => {
  try { if (fn instanceof Promise || (fn && typeof fn.then === 'function')) throw new Error('use checkAsync'); fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
};
const checkAsync = async (name, fn) => {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
};
function ok(c, what) { if (!c) throw new Error(what); }
function eq(a, b, tol, what) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); }

const defaults = { plane: 'XY', at: 'top', off: 0, u: 0, v: 0, rels: [], dims: [] };
const sketch = (p) => ({ id: 'sk' + Math.random().toString(36).slice(2, 7), type: 'sketch', p: { ...defaults, ...p } });
const push = (dist) => ({ id: 'pu' + Math.random().toString(36).slice(2, 7), type: 'push', p: { dist, op: 'add', both: 'one' } });
const run = async (features) => { const part = { features }; const r = await buildPart(part); return { body: r && r.body, features }; };
const vol = (s) => (s ? R.measureVolume(s) : 0);
const D = (d, d2) => ({ prof: 'ellipse', D: d, d: d2 });
const SP = (pts) => ({ prof: 'spline', pts });

console.log('\nThe point list');
check('x,y pairs separated by ; or a new line', () => {
  const p = P.s21SplinePts('0,20; 20,0\n0,-20 ;  -20,0');
  ok(p.length === 4, 'four points: ' + JSON.stringify(p));
  eq(p[0][0], 0, 0, 'x of the first'); eq(p[3][1], 0, 0, 'y of the last');
});
check('anything that is not a pair of numbers is not a point', () => {
  const p = P.s21SplinePts('0,20; hello; ; 20');
  ok(p.length === 1, JSON.stringify(p));
});
check('an empty field has no points', () => { ok(P.s21SplinePts('').length === 0 && P.s21SplinePts(null).length === 0, 'empty'); });
check('a bow-tie list is detected as self-crossing', () => {
  ok(P.s21SplineSelfCross([[0, 0], [10, 10], [10, 0], [0, 10]]) === true, 'must cross');
  ok(P.s21SplineSelfCross([[0, 0], [10, 0], [10, 10], [0, 10]]) === false, 'a square must not');
});

console.log('\nEllipse');
await checkAsync('Ø60 × Ø30 extruded 10 mm is π·a·b·h', async () => {
  const { body, features } = await run([sketch(D(60, 30)), push(10)]);
  ok(features.every((x) => !x.err), 'a step failed: ' + JSON.stringify(features.map((x) => x.err)));
  eq(vol(body), Math.PI * 30 * 15 * 10, 1, 'volume');
  const [[x0, y0, z0], [x1, y1, z1]] = body.boundingBox.bounds;
  eq(x1 - x0, 60, 1e-6, 'size X'); eq(y1 - y0, 30, 1e-6, 'size Y'); eq(z1 - z0, 10, 1e-6, 'size Z');
});
await checkAsync('the ellipse is ellipse faces, not a polygon', async () => {
  const { body } = await run([sketch(D(60, 30)), push(10)]);
  const types = body.faces.map((q) => q.geomType);
  eq(types.filter((t) => t === 'PLANE').length, 2, 2, 'exactly the two flat caps');
  ok(types.every((t) => t === 'PLANE' || t === 'EXTRUSION_SURFACE'), 'the side is one extrusion of the ellipse, not facets: ' + JSON.stringify(types));
});
await checkAsync('a minor diameter larger than the major is refused', async () => {
  const { features } = await run([sketch(D(20, 40)), push(10)]);
  const e = features[0].err || '';
  ok(/minor diameter/i.test(e), 'no clear reason: ' + JSON.stringify(e));
});
await checkAsync('a diameter of 0 is refused', async () => {
  const { features } = await run([sketch(D(0, 10)), push(10)]);
  ok(/above 0 mm/i.test(features[0].err || ''), 'no clear reason: ' + JSON.stringify(features[0].err));
});

console.log('\nClosed spline');
await checkAsync('four points give a closed Bézier solid that passes through each point', async () => {
  const bez = (await run([sketch(SP('0,20; 20,0; 0,-20; -20,0')), push(10)])).body.faces.map((q) => q.geomType);
  eq(bez.filter((t) => t === 'PLANE').length, 2, 2, 'two flat caps');
  eq(bez.filter((t) => t === 'EXTRUSION_SURFACE').length, 4, 0, 'four curved sides, one Bézier per span');
  const pts = [[0, 20], [20, 0], [0, -20], [-20, 0]];
  const { body, features } = await run([sketch(SP('0,20; 20,0; 0,-20; -20,0')), push(10)]);
  ok(features.every((x) => !x.err), 'a step failed: ' + JSON.stringify(features.map((x) => x.err)));
  ok(vol(body) > 0, 'no volume');
  const [[x0, y0], [x1, y1]] = body.boundingBox.bounds;
  eq(x1, 20, 0.01, 'the curve reaches the +X point'); eq(x0, -20, 0.01, 'and the −X point');
  eq(y1, 20, 0.01, 'and the +Y point'); eq(y0, -20, 0.01, 'and the −Y point');
  ok(body.faces.length === 6, 'four Bézier side faces + top + bottom: ' + body.faces.length);
  const area = vol(body) / 10;
  ok(area > 900 && area < 1400, 'the enclosed area is between the diamond and its bounding square: ' + area.toFixed(2));
  ok(pts.length === 4, 'the points are the ones typed');
});
await checkAsync('the spline follows the points, not a fixed shape', async () => {
  const narrow = await run([sketch(SP('0,20; 8,0; 0,-20; -8,0')), push(10)]);
  const wide = await run([sketch(SP('0,20; 30,0; 0,-20; -30,0')), push(10)]);
  ok(vol(wide.body) > vol(narrow.body) * 2, 'moving the side points out must add material: ' + vol(narrow.body) + ' → ' + vol(wide.body));
});
await checkAsync('fewer than three points is refused', async () => {
  const { features } = await run([sketch(SP('0,20; 20,0')), push(10)]);
  ok(/at least 3 points/i.test(features[0].err || ''), 'no clear reason: ' + JSON.stringify(features[0].err));
});
await checkAsync('two points on top of each other are refused', async () => {
  const { features } = await run([sketch(SP('0,20; 20,0; 20,0; 0,-20')), push(10)]);
  ok(/same point/i.test(features[0].err || ''), 'no clear reason: ' + JSON.stringify(features[0].err));
});
await checkAsync('a self-crossing list is refused', async () => {
  const { features } = await run([sketch(SP('0,10; 10,0; 0,-10; 10,10')), push(10)]);
  ok(/cross itself/i.test(features[0].err || ''), 'no clear reason: ' + JSON.stringify(features[0].err));
});

console.log('\nRebuild and the tree');
await checkAsync('editing the diameter rebuilds the solid', async () => {
  const first = await run([sketch(D(60, 30)), push(10)]);
  const second = await run([sketch(D(80, 30)), push(10)]);
  eq(vol(first.body), Math.PI * 30 * 15 * 10, 1, 'the first build');
  eq(vol(second.body), Math.PI * 40 * 15 * 10, 1, 'the rebuild after the edit');
});
await checkAsync('editing the point list rebuilds the solid', async () => {
  const four = await run([sketch(SP('0,20; 20,0; 0,-20; -20,0')), push(10)]);
  const five = await run([sketch(SP('0,20; 20,0; 20,-20; 0,-20; -20,0')), push(10)]);
  ok(vol(five.body) > 0 && Math.abs(vol(five.body) - vol(four.body)) > 100, 'the new list must make a different solid: ' + vol(four.body) + ' vs ' + vol(five.body));
});
await checkAsync('Smart Dimension drives the ellipse major diameter', async () => {
  const sk = sketch(D(60, 30));
  const dim = { id: 'dm1', type: 'dim', p: { step: sk.id, param: 'D', value: 100 } };
  const { body, features } = await run([sk, dim, push(10)]);
  ok(features.every((x) => !x.err), 'a step failed: ' + JSON.stringify(features.map((x) => x.err)));
  eq(vol(body), Math.PI * 50 * 15 * 10, 1, 'volume follows the dimension');
});
await checkAsync('a sketch step of each curve type stays in the tree without an error', async () => {
  const features = [sketch(D(60, 30)), push(10), sketch(SP('0,20; 20,0; 0,-20; -20,0')), push(5)];
  const { body } = await run(features);
  ok(features.every((x) => !x.err && x.err !== undefined), 'the tree kept an error: ' + JSON.stringify(features.map((x) => x.err)));
  ok(vol(body) > Math.PI * 30 * 15 * 10, 'the second sketch adds its own solid on top');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
