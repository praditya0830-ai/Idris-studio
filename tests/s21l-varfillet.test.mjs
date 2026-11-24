/* S21l: Variable Fillet — Batch 7. One edge with a radius at each end, built by the kernel's own fillet builder
 * (BRepFilletAPI_MakeFillet with a radius law); the step records the material the kernel removed.
 *
 *   * on the vertical edge of a 40 × 30 × 20 box, two radii of 5 mm remove exactly the constant fillet's volume,
 *     (1 − π/4)·5²·20 = 107.30 mm³ — the kernel's number matches the closed form to 1e-6, so a variable fillet is
 *     the same tool when the two radii agree;
 *   * the same edge from 2 mm to 6 mm removes 75.81 mm³, which is inside the band the two constant fillets set
 *     (17.17 mm³ at 2 mm, 154.51 mm³ at 6 mm) and within 2.5 % of the rolling-ball integral
 *     (1 − π/4)·20·(2² + 2·6 + 6²)/3 = 74.39 mm³ — the rational fillet surface is not the exact corner arc at the
 *     intermediate radii, so the band and the tolerance are what the test asserts, and the step carries the
 *     kernel's own 75.81;
 *   * the fillet face the kernel returns for 2 → 6 mm is a BSPLINE surface (a radius law), not the cylinder a
 *     constant fillet gives;
 *   * a radius of 0 mm is refused with the number it read, and a radius of 100 mm — larger than the 30 mm face it
 *     would roll on — is refused with both radii named; neither changes the body;
 *   * an edge index that is not on the body is refused with the body's edge count;
 *   * a step with no body before it is refused (the edge comes from the body);
 *   * replaying the step twice gives the same volume, because the step is built from the features every time.
 *
 *   node tests/s21l-varfillet.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const lStart = html.indexOf('/* ---- S21l: Variable Fillet.');
const lEnd = html.indexOf('/* ---- end S21l helpers ---- */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, lStart, lEnd, tAt].some((x) => x < 0) || bEnd < bStart || lEnd < lStart) {
  throw new Error('the S21l block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(lStart, lEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21lVariableFillet };` )(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (\u00b1${tol})`); };
const pt = (p) => (Array.isArray(p) ? p.map(Number) : p && typeof p.toTuple === 'function' ? p.toTuple() : [p && p.x, p && p.y, p && p.z]);
const CORNER = (1 - Math.PI / 4);            /* the corner a fillet rounds off a square section, per radius² and length */

/* the box the shape step builds, so the edge indices are the ones buildPart will see */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const vertical = ref.edges.map((e, i) => ({ e, i })).filter((x) => {
  const a = pt(x.e.startPoint), b = pt(x.e.endPoint);
  return Math.abs(a[0] - 20) < 1e-6 && Math.abs(b[0] - 20) < 1e-6 && Math.abs(a[1] - 15) < 1e-6 && Math.abs(b[1] - 15) < 1e-6;
}).map((x) => x.i);

const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const fil = (edge, r1, r2) => ({ id: 'v1', type: 'vfillet', p: { edge, r1, r2 } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };

await check('two equal radii of 5 mm remove exactly the constant fillet volume, (1 \u2212 \u03c0/4)\u00b75\u00b2\u00b720', async () => {
  ok(vertical.length === 1, `expected one vertical edge at (20, 15), got ${JSON.stringify(vertical)}`);
  const { r, features } = await run([box(), fil(vertical[0], 5, 5)]);
  const ft = features[1];
  ok(!ft.err, 'the variable fillet step failed: ' + ft.err);
  ok(ft.vfil, 'the step records no measurements: ' + JSON.stringify(ft));
  eq(ft.vfil.r1, 5, 1e-9, 'first radius'); eq(ft.vfil.r2, 5, 1e-9, 'second radius');
  eq(ft.vfil.volBefore, 24000, 1e-6, 'volume before');
  eq(ft.vfil.removed, CORNER * 25 * 20, 1e-6, 'volume removed');
  eq(ft.vfil.volAfter, 24000 - CORNER * 25 * 20, 1e-6, 'volume after');
  eq(R.measureVolume(r.body), 24000 - CORNER * 25 * 20, 1e-6, 'the body in the part');
  ok(ft.vfil.constant === true, 'the kernel did not call two equal radii a constant fillet');
  ok(r.body.faces.length === 7, 'the filleted box is not seven faces: ' + r.body.faces.length);
  const an = new oc.BRepCheck_Analyzer(r.body.wrapped, true, false);
  const good = an.IsValid_2 ? an.IsValid_2() : an.IsValid_1 ? an.IsValid_1() : an.IsValid();
  ok(good, 'the kernel says the filleted body is not valid');
  ok(String(ft.note).includes('5.0 mm'), 'the note does not carry the radii: ' + JSON.stringify(ft.note));
  ok(String(ft.note).includes('0.107'), 'the note does not carry the material removed: ' + JSON.stringify(ft.note));
});

await check('2 mm to 6 mm sits between the two constant fillets and matches the rolling-ball integral within 2.5 %', async () => {
  const { r, features } = await run([box(), fil(vertical[0], 2, 6)]);
  const ft = features[1];
  ok(!ft.err, 'the variable fillet step failed: ' + ft.err);
  const lo = CORNER * 4 * 20, hi = CORNER * 36 * 20;          /* the constant 2 mm and 6 mm removals */
  const integral = CORNER * 20 * (4 + 2 * 6 + 36) / 3;          /* the rolling ball, r(z) linear along the edge */
  const got = ft.vfil.removed;
  ok(got > lo && got < hi, `the removal ${got} is not between the constant 2 mm (${lo}) and 6 mm (${hi}) fillets`);
  eq(got, 75.81025, 0.001, 'the kernel\u2019s removal for a 2 \u2192 6 mm radius law');
  ok(Math.abs(got - integral) / integral < 0.025, `the removal ${got} is more than 2.5 % off the rolling-ball integral ${integral}`);
  ok(ft.vfil.constant === false, 'the kernel called a 2 \u2192 6 mm fillet constant');
  eq(R.measureVolume(r.body), 24000 - got, 1e-6, 'the body in the part');
  const types = r.body.faces.map((x) => x.geomType);
  ok(types.includes('BSPLINE_SURFACE'), 'the radius-law face is not a B-spline surface: ' + JSON.stringify(types));
  ok(types.filter((x) => x === 'CYLINDRE').length === 0, 'a constant-radius cylindrical face is in the body: ' + JSON.stringify(types));
});

await check('a radius of 0 mm is refused with the number it read', async () => {
  const { r, features } = await run([box(), fil(vertical[0], 0, 6)]);
  const err = features[1].err || '';
  ok(/both radii must be above 0 mm/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/0\.0 mm/.test(err), 'the refusal does not carry the radius: ' + JSON.stringify(err));
  eq(R.measureVolume(r.body), 24000, 1e-6, 'the refused step changed the body');
});

await check('a radius the 30 mm face cannot carry is refused with both radii named', async () => {
  const { r, features } = await run([box(), fil(vertical[0], 2, 100)]);
  const err = features[1].err || '';
  ok(/cannot round edge|does not pass its validity check/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/2\.0 mm/.test(err) && /100\.0 mm/.test(err), 'the refusal does not carry both radii: ' + JSON.stringify(err));
  eq(R.measureVolume(r.body), 24000, 1e-6, 'the refused step changed the body');
});

await check('an edge that is not on the body is refused with the edge count', async () => {
  const { features } = await run([box(), fil(99, 2, 6)]);
  const err = features[1].err || '';
  ok(/is not on this body/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/it has 12 edges/.test(err), 'the refusal does not carry the count: ' + JSON.stringify(err));
});

await check('a step with no body before it is refused, because the edge comes from the body', async () => {
  const { features } = await run([fil(vertical[0], 2, 6)]);
  ok(/rounds an edge of a body/i.test(features[0].err || ''), 'no refusal: ' + JSON.stringify(features[0].err));
});

await check('replaying the same step twice gives the same body and the same numbers', async () => {
  const a = await run([box(), fil(vertical[0], 2, 6)]);
  const b = await run([box(), fil(vertical[0], 2, 6)]);
  ok(!a.features[1].err && !b.features[1].err, 'a rebuild failed: ' + (a.features[1].err || b.features[1].err));
  eq(a.features[1].vfil.removed, b.features[1].vfil.removed, 1e-9, 'removal on the second build');
  eq(R.measureVolume(a.r.body), R.measureVolume(b.r.body), 1e-9, 'body volume on the second build');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
