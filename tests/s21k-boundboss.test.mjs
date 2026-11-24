/* S21k: Boundary Boss/Base — Batch 6. The two-direction boundary of Boundary Surface (the first direction is lofted
 * by the kernel, the second must land on that loft, both areas measured) made into a solid: the kernel offsets the
 * patch (BRepOffsetAPI_MakeOffsetShape), lofts a wall from every boundary curve of the patch to the matching curve of
 * the offset (BRepOffsetAPI_ThruSections), sews patch, offset and walls into one shell (BRepBuilderAPI_Sewing) and
 * makes it a solid (BRepBuilderAPI_MakeSolid); the side that adds material to the body is the one fused in.
 *
 *   * the four top edges of a 40 × 30 × 20 box bound a 1 200 mm² patch; 3 mm thickness adds 3 600 mm³ and the body
 *     goes from 24 000 to 27 600 mm³ — all three numbers are the kernel's measurements;
 *   * the two circle curves of a Ø40 × 30 cylinder and its seam curve bound the barrel (2π·20·30 = 3 769.9 mm²);
 *     2 mm thickness grows the body to π·22²·30 = 45 615.9 mm³, 7 916.8 mm³ added;
 *   * a thickness of 0 mm is refused with the number it read;
 *   * a step with no body before it is refused (the curves come from the body);
 *   * one curve in the first direction is refused with the count, carried through from the boundary itself;
 *   * replaying the step twice gives the same volume, because the step is built from the features every time.
 *
 *   node tests/s21k-boundboss.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const gStart = html.indexOf('/* ---- S21g: Filled Surface.');
const gEnd = html.indexOf('/* ---- end S21g helpers ---- */');
const hStart = html.indexOf('/* ---- S21h: Trim Surface.');
const hEnd = html.indexOf('/* ---- end S21h helpers ---- */');
const iStart = html.indexOf('/* ---- S21i: Boundary Surface.');
const iEnd = html.indexOf('/* ---- end S21i helpers ---- */');
const kStart = html.indexOf('/* ---- S21k: Boundary Boss/Base.');
const kEnd = html.indexOf('/* ---- end S21k helpers ---- */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, gStart, gEnd, hStart, hEnd, iStart, iEnd, kStart, kEnd, tAt].some((x) => x < 0) || bEnd < bStart || gEnd < gStart || hEnd < hStart || iEnd < iStart || kEnd < kStart) {
  throw new Error('the S21g/S21h/S21i/S21k block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(gStart, gEnd)}\n${html.slice(hStart, hEnd)}\n${html.slice(iStart, iEnd)}\n${html.slice(kStart, kEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21kBoundarySolid };` )(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const pt = (p) => (Array.isArray(p) ? p.map(Number) : p && typeof p.toTuple === 'function' ? p.toTuple() : [p && p.x, p && p.y, p && p.z]);
const z = (p) => pt(p)[2];
const span = (e) => { const a = pt(e.startPoint), b = pt(e.endPoint); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };
const digits = (x) => String(x).replace(/[^0-9.]/g, '');

/* the same box and cylinder the features build, so the curve indices are the ones buildPart will see */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const top = ref.edges.map((e, i) => i).filter((i) => z(ref.edges[i].startPoint) > 19.9 && z(ref.edges[i].endPoint) > 19.9);
const longTop = top.filter((i) => Math.abs(span(ref.edges[i]) - 40) < 0.01);
const shortTop = top.filter((i) => Math.abs(span(ref.edges[i]) - 30) < 0.01);

const cylRef = R.makeCylinder(20, 30, [0, 0, 0], [0, 0, 1]);
const circles = cylRef.edges.map((e, i) => ({ e, i })).filter((x) => x.e.geomType === 'CIRCLE').map((x) => x.i);
const seam = cylRef.edges.map((e, i) => ({ e, i })).filter((x) => x.e.geomType !== 'CIRCLE').map((x) => x.i)[0];

const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const cyl = () => ({ id: 'c1', type: 'shape', p: { kind: 'cyl', L: 40, W: 30, H: 30, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const boss = (u, v, t = 3) => ({ id: 'k1', type: 'boundboss', p: { u, v, t } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };

await check('the four top edges of a 40 × 30 × 20 box bound 1 200 mm², and 3 mm adds 3 600 mm³ to the body', async () => {
  ok(longTop.length === 2 && shortTop.length === 2, `expected 2 + 2 top edges, got ${JSON.stringify([longTop, shortTop])}`);
  const { r, features } = await run([box(), boss(longTop, shortTop, 3)]);
  const ft = features[1];
  ok(!ft.err, 'the boundary boss step failed: ' + ft.err);
  ok(ft.bound, 'the step records no measurements: ' + JSON.stringify(ft));
  eq(ft.bound.uArea, 1200, 1e-6, 'patch area');
  eq(ft.bound.vArea, 1200, 1e-6, 'second direction area');
  eq(ft.bound.t, 3, 1e-9, 'recorded thickness');
  eq(ft.bound.volBefore, 24000, 1e-6, 'volume before');
  eq(ft.bound.added, 3600, 1e-3, 'volume added');
  eq(ft.bound.volAfter, 27600, 1e-3, 'volume after');
  eq(R.measureVolume(r.body), 27600, 1e-3, 'the body in the part');
  ok(r.body.faces.length === 6, 'the bossed box is not six faces: ' + r.body.faces.length);
  const an = new oc.BRepCheck_Analyzer(r.body.wrapped, true, false);
  const good = an.IsValid_2 ? an.IsValid_2() : an.IsValid_1 ? an.IsValid_1() : an.IsValid();
  ok(good, 'the kernel says the bossed body is not valid');
  ok(digits(ft.note).includes('1200'), 'the note does not carry the patch area: ' + JSON.stringify(ft.note));
  ok(String(ft.note).includes('27.6'), 'the note does not carry the body volume: ' + JSON.stringify(ft.note));
});

await check('the two circles of a Ø40 × 30 cylinder bound the barrel, and 2 mm grows it to π·22²·30', async () => {
  ok(circles.length === 2 && seam != null, `the reference cylinder has ${circles.length} circle edges and seam ${seam}`);
  const { r, features } = await run([cyl(), boss(circles, [seam], 2)]);
  const ft = features[1];
  ok(!ft.err, 'the boundary boss step failed: ' + ft.err);
  eq(ft.bound.uArea, 2 * Math.PI * 20 * 30, 0.01, 'barrel area');
  eq(ft.bound.volBefore, Math.PI * 400 * 30, 0.01, 'volume before');
  eq(ft.bound.added, Math.PI * (484 - 400) * 30, 0.01, 'volume added');
  eq(ft.bound.volAfter, Math.PI * 484 * 30, 0.01, 'volume after');
  eq(R.measureVolume(r.body), Math.PI * 484 * 30, 0.01, 'the body in the part');
});

await check('a thickness of 0 mm is refused with the number it read', async () => {
  const { r, features } = await run([box(), boss(longTop, shortTop, 0)]);
  const err = features[1].err || '';
  ok(/thickness must be above 0 mm/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/0\.0 mm/.test(err), 'the refusal does not carry the thickness: ' + JSON.stringify(err));
  eq(R.measureVolume(r.body), 24000, 1e-6, 'the refused step changed the body');
});

await check('a step with no body before it is refused, because the curves come from the body', async () => {
  const { features } = await run([boss(longTop, shortTop)]);
  ok(/takes its curves from a body/i.test(features[0].err || ''), 'no refusal: ' + JSON.stringify(features[0].err));
});

await check('one curve in the first direction is refused with the count', async () => {
  const { features } = await run([box(), boss([longTop[0]], shortTop)]);
  const err = features[1].err || '';
  ok(/at least two curves in the first direction/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/this has 1/.test(err), 'the refusal does not carry the count: ' + JSON.stringify(err));
});

await check('replaying the same step twice gives the same body and the same numbers', async () => {
  const a = await run([box(), boss(longTop, shortTop, 3)]);
  const b = await run([box(), boss(longTop, shortTop, 3)]);
  ok(!a.features[1].err && !b.features[1].err, 'a rebuild failed: ' + (a.features[1].err || b.features[1].err));
  eq(a.features[1].bound.volAfter, b.features[1].bound.volAfter, 1e-9, 'volume after on the second build');
  eq(a.features[1].bound.added, b.features[1].bound.added, 1e-9, 'volume added on the second build');
  eq(R.measureVolume(a.r.body), R.measureVolume(b.r.body), 1e-9, 'body volume on the second build');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
