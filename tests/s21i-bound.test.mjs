/* S21i: Boundary Surface — Batch 6, the two-direction surface built on the kernel's own loft
 * (BRepOffsetAPI_ThruSections through each curve as a wire) and its own distance (BRepExtrema_DistShapeShape),
 * both reached through R.getOC().
 *
 *   * the two long top edges of a 40 × 30 × 20 box loft to a 1 200 mm² patch, and the second direction (the two short
 *     top edges) lofts to the same 1 200 mm² — both areas are the kernel's measurements;
 *   * the patch is a surface step, not a solid: the body it was taken from is unchanged at 24 000 mm³;
 *   * fewer than two curves in the first direction, and no curve at all in the second, are refused with the count;
 *   * a second direction that lands on the loft but bounds a different patch (600 mm² against 1 200) is refused with
 *     both numbers;
 *   * a guide curve whose end is 20 mm off the lofted surface is refused with that measured gap.
 *
 *   node tests/s21i-bound.test.mjs
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
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, gStart, gEnd, hStart, hEnd, iStart, iEnd, tAt].some((x) => x < 0) || bEnd < bStart || gEnd < gStart || hEnd < hStart || iEnd < iStart) {
  throw new Error('the S21g/S21h/S21i block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(gStart, gEnd)}\n${html.slice(hStart, hEnd)}\n${html.slice(iStart, iEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21iBoundary };`)(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const pt = (p) => (p && typeof p.toTuple === 'function' ? p.toTuple() : [p && p.x, p && p.y, p && p.z]);
const z = (p) => pt(p)[2];
const span = (e) => { const a = pt(e.startPoint), b = pt(e.endPoint); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); };

/* the same box the feature builds, so the curve indices are the ones buildPart will see */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const top = ref.edges.map((e, i) => i).filter((i) => z(ref.edges[i].startPoint) > 19.9 && z(ref.edges[i].endPoint) > 19.9);
const longTop = top.filter((i) => Math.abs(span(ref.edges[i]) - 40) < 0.01);
const shortTop = top.filter((i) => Math.abs(span(ref.edges[i]) - 30) < 0.01);
const vert = ref.edges.map((e, i) => i).find((i) => Math.abs(z(ref.edges[i].startPoint) - z(ref.edges[i].endPoint)) > 1e-6);
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const bound = (u, v) => ({ id: 'x1', type: 'surfbound', p: { u, v } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };
const digits = (x) => String(x).replace(/[^0-9.]/g, '');

await check('two long top edges of a 40 × 30 × 20 box and two short ones bound a 1 200 mm² patch', async () => {
  ok(longTop.length === 2 && shortTop.length === 2, `expected 2 + 2 top edges, got ${JSON.stringify([longTop, shortTop])}`);
  const { r, features } = await run([box(), bound(longTop, shortTop)]);
  ok(!features[1].err, 'the boundary step failed: ' + features[1].err);
  ok(r.surfs && r.surfs.length === 1, 'the surface was not kept: ' + JSON.stringify(r.surfs && r.surfs.length));
  eq(R.measureArea(r.surfs[0]), 40 * 30, 1e-6, 'patch area');
  eq(R.measureVolume(r.body), 40 * 30 * 20, 1, 'the body the curves came from is unchanged');
  ok(digits(features[1].note).includes('1200'), 'the note does not carry the measured area: ' + JSON.stringify(features[1].note));
  ok(features[1].surf && features[1].surf.u === 2 && features[1].surf.v === 2, 'the step does not record both directions: ' + JSON.stringify(features[1].surf));
});

await check('one curve in the first direction is refused, with the count', async () => {
  const { features } = await run([box(), bound([longTop[0]], shortTop)]);
  const err = features[1].err || '';
  ok(/at least two curves in the first direction/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/this has 1/.test(err), 'the refusal does not carry the count: ' + JSON.stringify(err));
});

await check('no curve in the second direction is refused', async () => {
  const { features } = await run([box(), bound(longTop, [])]);
  ok(/at least one curve in the second direction/i.test(features[1].err || ''), 'no refusal: ' + JSON.stringify(features[1].err));
});

await check('a second direction that bounds another patch is refused with both measured areas', async () => {
  /* a 40 mm top edge and a 30 mm one both lie on the loft, but lofting them gives 600 mm²: the two directions do not
     bound the same patch, and the kernel measures both */
  const { features } = await run([box(), bound(longTop, [longTop[0], shortTop[0]])]);
  const err = features[1].err || '';
  ok(/do not bound the same patch/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(digits(err).includes('1200'), 'the refusal does not name the first area: ' + JSON.stringify(err));
  ok(digits(err).includes('600'), 'the refusal does not name the second area: ' + JSON.stringify(err));
});

await check('a guide whose end is 20 mm off the loft is refused with that gap', async () => {
  ok(vert != null, 'the reference box has no vertical edge');
  const { features } = await run([box(), bound(longTop, [shortTop[0], vert])]);
  const err = features[1].err || '';
  ok(/does not meet the lofted surface/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/20\.0 mm/.test(err), 'the refusal does not carry the measured gap: ' + JSON.stringify(err));
});

await check('s21iBoundary refuses on its own', async () => {
  let threw = '';
  try { build.s21iBoundary(R, [ref.edges[longTop[0]]], [ref.edges[shortTop[0]]], {}); } catch (e) { threw = e.message; }
  ok(/at least two curves in the first direction/i.test(threw), 's21iBoundary did not refuse one curve: ' + JSON.stringify(threw));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
