/* S21m: Curvature / Zebra — Batch 11. Each B-rep face's own surface is sampled with D2 and the principal
 * curvatures come from the first and second fundamental forms; the colour mesh is the kernel's own triangulation.
 *
 *   * a cylinder Ø20 × 20 reports exactly 1/R = 0.1 1/mm on its curved face and 0 on both planar caps, with the
 *     areas the kernel measures (2πRH = 1256.64 mm² and 2 × πR² = 628.32 mm²);
 *   * a box reports 0 on all six faces and no curved face at all;
 *   * a sphere R5 reports 0.2 1/mm (1/5) everywhere, so the measure is not tied to cylinders;
 *   * a tube's inner wall reports 1/6 (its face is reversed, so only |κ| can be right — which is what is reported);
 *   * a 5 mm fillet on a box leaves a cylindrical face that reports exactly 1/5, the radius the kernel rolled;
 *   * the colour mesh carries one |κ| per vertex of the kernel's own triangles, with hi = the largest |κ|;
 *   * the step in the tree does not change the body (24 000 mm³ before and after) and records every face;
 *   * a step with no body, 1 sample, 99 samples or a non-number is refused with the value it read;
 *   * replaying the step twice gives the same measurement.
 *
 *   node tests/s21m-curvature.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const mStart = html.indexOf('/* ---- S21m: Curvature / Zebra.');
const mEnd = html.indexOf('/* ---- end S21m helpers ---- */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, mStart, mEnd, tAt].some((x) => x < 0) || bEnd < bStart || mEnd < mStart) {
  throw new Error('the S21m block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(mStart, mEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21mCurvature, s21mColorMesh, s21mSamples };` )(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (\u00b1${tol})`); };
const face = (m, type) => m.faces.find((x) => x.type === type);

const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const cyl = () => ({ id: 'c1', type: 'shape', p: { kind: 'cyl', L: 40, W: 30, H: 20, D: 20, Di: 10, x: 0, y: 0, z: 0, op: 'add' } });
const curv = (samples = 5) => ({ id: 'k1', type: 'curv', p: { samples } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };

await check('a cylinder Ø20 \u00d7 20 reports 1/R = 0.1 1/mm on its wall and 0 on both caps', async () => {
  const body = R.makeCylinder(10, 20);
  const m = build.s21mCurvature(R, body, 5);
  ok(m.faces.length === 3, 'the cylinder is not three faces: ' + m.faces.length);
  ok(m.byType.CYLINDRE === 1 && m.byType.PLANE === 2, 'the face types are wrong: ' + JSON.stringify(m.byType));
  const wall = face(m, 'CYLINDRE');
  eq(wall.kMax, 0.1, 1e-9, 'cylinder |\u03ba| max');
  eq(wall.radius, 10, 1e-9, 'cylinder radius');
  eq(wall.area, 2 * Math.PI * 10 * 20, 1e-6, 'cylinder wall area');
  const caps = m.faces.filter((x) => x.type === 'PLANE');
  ok(caps.every((x) => x.kMax === 0), 'a planar cap is not exactly 0: ' + JSON.stringify(caps.map((x) => x.kMax)));
  ok(caps.every((x) => x.radius === Infinity && !Number.isFinite(x.radius)), 'a planar cap got a finite radius');
  eq(m.planeArea, 2 * Math.PI * 100, 1e-6, 'planar area');
  eq(m.maxK, 0.1, 1e-9, 'largest |\u03ba|');
  eq(m.minRadius, 10, 1e-9, 'tightest radius');
  ok(m.curved === 1 && m.planar === 2, 'the summary miscounts: ' + JSON.stringify({ curved: m.curved, planar: m.planar }));
});

await check('a box is six planar faces: curvature 0 everywhere', async () => {
  const m = build.s21mCurvature(R, R.makeBox([-20, -15, 0], [20, 15, 20]), 5);
  ok(m.faces.length === 6 && m.planar === 6 && m.curved === 0, 'the box summary is wrong: ' + JSON.stringify({ n: m.faces.length, planar: m.planar, curved: m.curved }));
  ok(m.faces.every((x) => x.type === 'PLANE'), 'a box face is not planar: ' + JSON.stringify(m.faces.map((x) => x.type)));
  ok(m.faces.every((x) => x.kMax === 0), 'a box face reports curvature: ' + JSON.stringify(m.faces.map((x) => x.kMax)));
  eq(m.maxK, 0, 1e-12, 'largest |\u03ba| on a box');
  eq(m.area, 2 * (40 * 30 + 40 * 20 + 30 * 20), 1e-6, 'box surface area');
});

await check('a sphere R5 reports 0.2 1/mm, so the measure is not tied to cylinders', async () => {
  const m = build.s21mCurvature(R, R.makeSphere(5), 5);
  ok(m.faces.length === 1 && m.faces[0].type === 'SPHERE', 'the sphere is not one spherical face: ' + JSON.stringify(m.faces.map((x) => x.type)));
  /* both principal curvatures are 1/R, so the mean is 1/R too; the kernel's spherical surface carries ~2e-8 of
     round-off, which is why the tolerance here is 1e-6 and not 1e-9 like the analytic cylinder */
  eq(m.faces[0].kMax, 0.2, 1e-6, 'sphere |\u03ba|');
  eq(m.faces[0].radius, 5, 1e-5, 'sphere radius');
  ok(m.faces[0].kMax > 0.1999 && m.faces[0].kMax < 0.2001, 'the sphere is not 1/5 within a tenth of a percent: ' + m.faces[0].kMax);
  eq(m.faces[0].area, 4 * Math.PI * 25, 1e-6, 'sphere area');
});

await check('a tube\u2019s inner wall reports 1/6 whichever way its face is oriented', async () => {
  const tube = R.makeCylinder(10, 20).cut(R.makeCylinder(6, 20, [0, 0, -1], [0, 0, 1]));
  const m = build.s21mCurvature(R, tube, 5);
  const walls = m.faces.filter((x) => x.type === 'CYLINDRE').map((x) => x.kMax).sort((a, b) => a - b);
  ok(walls.length === 2, 'the tube does not have two cylindrical walls: ' + JSON.stringify(m.faces.map((x) => x.type)));
  eq(walls[0], 1 / 10, 1e-9, 'outer wall |\u03ba|');
  eq(walls[1], 1 / 6, 1e-9, 'inner wall |\u03ba|');
  eq(m.minRadius, 6, 1e-9, 'tightest radius of the tube');
});

await check('a 5 mm fillet leaves a cylindrical face that reports exactly 1/5', async () => {
  const fil = R.makeBox([-20, -15, 0], [20, 15, 20]).fillet(5, (e) => e.inDirection('Z'));
  const m = build.s21mCurvature(R, fil, 5);
  const walls = m.faces.filter((x) => x.type === 'CYLINDRE');
  ok(walls.length === 4, 'the fillet is not four cylindrical faces: ' + JSON.stringify(m.faces.map((x) => x.type)));
  ok(walls.every((x) => Math.abs(x.kMax - 0.2) < 1e-9), 'a fillet wall is not 1/5: ' + JSON.stringify(walls.map((x) => x.kMax)));
  ok(m.faces.filter((x) => x.type === 'PLANE').every((x) => x.kMax === 0), 'a planar face of the filleted box reports curvature');
});

await check('the colour mesh carries one |\u03ba| per vertex of the kernel\u2019s own triangles', async () => {
  const body = R.makeCylinder(10, 20);
  const m = build.s21mCurvature(R, body, 5), cm = build.s21mColorMesh(R, body, m);
  ok(cm.positions.length > 300, 'the colour mesh has too few vertices: ' + cm.positions.length / 3);
  ok(cm.vals.length === cm.positions.length / 3, `one value per vertex expected: ${cm.vals.length} values for ${cm.positions.length / 3} vertices`);
  ok(cm.indices.length > 0 && cm.indices.length % 3 === 0, 'the index list is not triangles: ' + cm.indices.length);
  const maxIx = Math.max(...cm.indices);
  ok(maxIx < cm.positions.length / 3, `index ${maxIx} is past the ${cm.positions.length / 3} vertices`);
  eq(cm.lo, 0, 1e-12, 'the colour scale starts at 0');
  eq(cm.hi, 0.1, 1e-9, 'the colour scale ends at the largest |\u03ba|');
  const set = new Set(cm.vals.map((v) => Number(v.toFixed(6))));
  ok(set.has(0.1) && set.has(0), 'the colour mesh does not carry both the wall and the flat caps: ' + JSON.stringify([...set]));
  /* the kernel's own vertex normals ride with the mesh: the zebra stripes are interpolated across a triangle, so a
     flat per-triangle normal would paint each triangle one band */
  ok(cm.normals.length === cm.positions.length, `one normal per vertex expected: ${cm.normals.length} for ${cm.positions.length / 3} vertices`);
  for (let i = 0; i < cm.normals.length; i += 3) {
    const l = Math.hypot(cm.normals[i], cm.normals[i + 1], cm.normals[i + 2]);
    ok(Math.abs(l - 1) < 1e-3, 'a vertex normal is not unit length: ' + l);
  }
  /* every vertex sits on the cylinder or on a cap: neither is invented geometry */
  for (let i = 0; i < cm.positions.length; i += 3) {
    const r = Math.hypot(cm.positions[i], cm.positions[i + 1]);
    ok(Math.abs(r - 10) < 1e-4 || r < 10 + 1e-4, 'a colour vertex is off the cylinder: ' + r);
  }
});

await check('the step records every face and leaves the body at 24 000 mm\u00b3', async () => {
  const { r, features } = await run([box(), curv(6)]);
  const ft = features[1];
  ok(!ft.err, 'the curvature step failed: ' + ft.err);
  ok(ft.curv, 'the step records no measurement: ' + JSON.stringify(ft));
  ok(ft.curv.faces.length === 6 && ft.curv.samples === 6, 'the step did not keep its faces and samples: ' + JSON.stringify(ft.curv).slice(0, 200));
  ok(ft.curv.faces.every((x) => x.area > 0), 'a recorded face has no area: ' + JSON.stringify(ft.curv.faces));
  eq(R.measureVolume(r.body), 24000, 1e-6, 'the curvature step changed the body');
  ok(/6 planar/.test(ft.note) && /0\.0000/.test(ft.note), 'the note does not carry the measurement: ' + JSON.stringify(ft.note));
});

await check('the step on a cylinder carries the kernel\u2019s 0.1000 1/mm and a 10 mm radius', async () => {
  const { r, features } = await run([cyl(), curv(5)]);
  const ft = features[1];
  ok(!ft.err, 'the curvature step failed on the cylinder: ' + ft.err);
  ok(/0\.1000/.test(ft.note), 'the note does not carry 0.1000 1/mm: ' + JSON.stringify(ft.note));
  ok(/10\.000 mm/.test(ft.note), 'the note does not carry the 10 mm radius: ' + JSON.stringify(ft.note));
  eq(ft.curv.maxK, 0.1, 1e-9, 'step largest |\u03ba|');
  eq(ft.curv.minRadius, 10, 1e-9, 'step tightest radius');
  eq(R.measureVolume(r.body), Math.PI * 100 * 20, 1e-6, 'the cylinder volume changed');
});

await check('a step with no body before it is refused', async () => {
  const { features } = await run([curv()]);
  ok(/measures the faces of a body/i.test(features[0].err || ''), 'no refusal: ' + JSON.stringify(features[0].err));
});

await check('a sample count outside 2 to 15 is refused with the value it read', async () => {
  for (const [v, shown] of [[1, '1.00'], [99, '99.00'], ['abc', 'abc']]) {
    const { features } = await run([box(), curv(v)]);
    const err = features[1].err || '';
    ok(/2 to 15/i.test(err), `no refusal for ${v}: ` + JSON.stringify(err));
    ok(err.includes(shown), `the refusal does not carry ${shown}: ` + JSON.stringify(err));
    ok(!features[1].curv, `the refused step ${v} carries a measurement`);
  }
});

await check('replaying the step twice gives the same numbers', async () => {
  const a = await run([cyl(), curv(4)]), b = await run([cyl(), curv(4)]);
  ok(!a.features[1].err && !b.features[1].err, 'a rebuild failed: ' + (a.features[1].err || b.features[1].err));
  eq(a.features[1].curv.maxK, b.features[1].curv.maxK, 1e-12, 'largest |\u03ba| on the second build');
  eq(a.features[1].curv.faces[0].area, b.features[1].curv.faces[0].area, 1e-9, 'first face area on the second build');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
