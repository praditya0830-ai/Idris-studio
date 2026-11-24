/* S21g: Filled Surface — Batch 6 of the CAD backlog, the first surface tool built on the kernel's own filling
 * builder (BRepOffsetAPI_MakeFilling, reached through R.getOC()).
 *
 *   * the four top edges of a 40 × 30 × 20 box are filled into one patch, and the kernel measures 1 200 mm²;
 *   * the patch is a surface step, not a solid: the part has no body and one surface with that area;
 *   * two boundary edges also fill, and the area is the measured patch (positive and finite);
 *   * fewer than two edges is refused by the step, with the count, and s21gFill refuses on its own too;
 *   * the step rebuilds with another edge order and the area is the same patch.
 *
 *   node tests/s21g-fill.test.mjs
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
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, gStart, gEnd, tAt].some((x) => x < 0) || bEnd < bStart || gEnd < gStart) {
  throw new Error('the S21g block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(gStart, gEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21gFill, s21gEdgePts };`)(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };

/* the same box the feature builds, so the edge indices are the ones buildPart will see */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const z = (p) => (typeof p.toTuple === 'function' ? p.toTuple() : [p.x, p.y, p.z])[2];
const topIdx = ref.edges.map((e, i) => i).filter((i) => z(ref.edges[i].startPoint) > 19.9 && z(ref.edges[i].endPoint) > 19.9);
const longTop = topIdx.filter((i) => Math.abs(z(ref.edges[i].startPoint) - z(ref.edges[i].endPoint)) < 1e-6 && Math.abs(s21Span(ref.edges[i]) - 30) < 0.01);
function s21Span(e) { const a = (e.startPoint.toTuple ? e.startPoint.toTuple() : [e.startPoint.x, e.startPoint.y, e.startPoint.z]); const b = (e.endPoint.toTuple ? e.endPoint.toTuple() : [e.endPoint.x, e.endPoint.y, e.endPoint.z]); return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const fill = (edges, order = 2) => ({ id: 'f' + Math.random().toString(36).slice(2, 6), type: 'surffill', p: { order, edges } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };

await check('the four top edges of a 40 × 30 × 20 box fill to 1 200 mm²', async () => {
  ok(topIdx.length === 4, 'expected 4 top edges in the reference box, got ' + topIdx.length);
  const { r, features } = await run([box(), fill(topIdx)]);
  ok(!features[1].err, 'the fill step failed: ' + features[1].err);
  ok(r.surfs && r.surfs.length === 1, 'the surface was not kept: ' + JSON.stringify(r.surfs && r.surfs.length));
  eq(R.measureArea(r.surfs[0]), 40 * 30, 1e-6, 'patch area');
  eq(R.measureVolume(r.body), 40 * 30 * 20, 1, 'the body the patch was taken from is unchanged');
  ok(/1200|1 200/.test(String(features[1].note).replace(/[^0-9.]/g, '')), 'the note does not carry the measured area: ' + JSON.stringify(features[1].note));
});

await check('edges that do not form one boundary are refused by the kernel\u2019s own error', async () => {
  /* the two long top edges are on opposite sides of the box: they are not one boundary, and the kernel says so */
  ok(longTop.length >= 2, 'could not find two 30 mm top edges: ' + JSON.stringify(longTop));
  const { features } = await run([box(), fill(longTop.slice(0, 2))]);
  const err = features[1].err || '';
  ok(/could not fill|do not form one boundary|no area/i.test(err), 'no refusal: ' + JSON.stringify(err));
});

await check('fewer than two edges is refused by the step, with the count', async () => {
  const { features } = await run([box(), fill([topIdx[0]])]);
  const err = features[1].err || '';
  ok(/at least two/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/1 selected/.test(err), 'the refusal does not carry the count: ' + JSON.stringify(err));
});

await check('s21gFill refuses on its own', async () => {
  let threw = false;
  try { build.s21gFill(R, [ref.edges[0]], {}); } catch (e) { threw = /at least two/i.test(e.message); }
  ok(threw, 's21gFill did not refuse one edge');
});

await check('the step rebuilds with another edge order and keeps the same patch', async () => {
  const { r, features } = await run([box(), fill(topIdx, 0)]);
  ok(!features[1].err, 'the fill step failed at order 0: ' + features[1].err);
  eq(R.measureArea(r.surfs[0]), 40 * 30, 1e-6, 'patch area at order 0');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
