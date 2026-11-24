/* S21c: Convert Entities — Batch 2b of the CAD backlog.
 *
 * The S21c block and buildPart are lifted out of index.html and run against the real kernel:
 *   * a 40 × 30 × 20 box projects onto XY as four lines, and the rectangle they make is 40 × 30 (not a
 *     bounding-box guess): the entities are the projected curves themselves;
 *   * that converted sketch extrudes: 40 · 30 · 12 = 14 400 mm³, so the conversion feeds the same build path as a
 *     drawn sketch;
 *   * the projection follows the sketch plane: XZ of the same box is 40 × 20;
 *   * a projected circle becomes two three-point arcs on the same circle, so a bore stays round;
 *   * an ellipse (or a spline) is refused by name instead of being flattened into a polygon, and a projected curve
 *     with no length is dropped with a count rather than turned into a zero-length line.
 *
 *   node tests/s21c-convert.test.mjs
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
const cStart = html.indexOf('/* ---- S21c: Convert Entities.');
const cEnd = html.indexOf('/* ---- end S21c helpers ---- */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, pStart, pEnd, cStart, cEnd, tAt].some((x) => x < 0) || bEnd < bStart || pEnd < pStart || cEnd < cStart) {
  throw new Error('the S21c block, the P1a block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(pStart, pEnd)}\n${html.slice(cStart, cEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21cConvert, s21cCurves, s21cCurveEnts };`)(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
let idn = 0;
const idf = () => 'c' + (++idn);
const runPart = async (features) => { const part = { features }; const r = await build.buildPart(part); return { body: r && r.body, features, R: r && r.R }; };
const span = (ents) => {
  const pts = ents.flatMap((e) => e.t === 'line' ? [e.a, e.b] : [e.s, e.m, e.e]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
};
const fakeCircle = (c = [0, 0], r = 10) => ({ geomType: 'CIRCLE', firstParameter: 0, lastParameter: 2 * Math.PI,
  get firstPoint() { return [c[0] + r, c[1]]; }, get lastPoint() { return [c[0] + r, c[1]]; },
  value: (t) => [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)] });

await check('a box projects onto XY as four real lines making 40 × 30', async () => {
  const { body } = await runPart([box()]);
  ok(body, 'the box did not build');
  const res = build.s21cConvert(R.drawProjection(body, 'XY').visible, idf);
  ok(res.refused.length === 0, 'refused: ' + res.refused.join(', '));
  ok(res.ents.length === 4, 'expected 4 lines, got ' + res.ents.length + ' (' + res.lines + ' lines, ' + res.circles + ' circles)');
  ok(res.ents.every((e) => e.t === 'line'), 'a projected line did not stay a line');
  const s = span(res.ents);
  eq(s.x, 40, 1e-6, 'width'); eq(s.y, 30, 1e-6, 'height');
});

await check('the converted sketch extrudes: 40 · 30 · 12 = 14 400 mm³', async () => {
  const first = await runPart([box()]);
  const res = build.s21cConvert(R.drawProjection(first.body, 'XY').visible, idf);
  const features = [{ id: 'sk', type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents: res.ents, rels: [], dims: [] } },
    { id: 'pu', type: 'push', p: { dist: 12, op: 'add', both: 'one' } }];
  const { body } = await runPart(features);
  ok(body, 'the converted sketch did not build: ' + JSON.stringify(features.map((x) => x.err)));
  eq(R.measureVolume(body), 40 * 30 * 12, 1, 'volume');
  const [[, , z0], [, , z1]] = body.boundingBox.bounds;
  eq(z1 - z0, 12, 1e-6, 'extrusion height');
});

await check('the projection follows the plane: XZ of the same box is 40 × 20', async () => {
  const { body } = await runPart([box()]);
  const res = build.s21cConvert(R.drawProjection(body, 'XZ').visible, idf);
  ok(res.ents.length >= 4, 'expected at least 4 lines, got ' + res.ents.length);
  const s = span(res.ents);
  eq(s.x, 40, 1e-6, 'width'); eq(s.y, 20, 1e-6, 'height');
});

await check('a projected circle becomes two three-point arcs on the same circle', async () => {
  const res = build.s21cConvert({ innerShape: { curves: [fakeCircle([0, 0], 10)] } }, idf);
  ok(res.circles === 1, 'the circle was not counted: ' + JSON.stringify(res));
  ok(res.ents.length === 2, 'expected 2 arcs, got ' + res.ents.length);
  ok(res.ents.every((e) => e.t === 'arc'), 'a projected circle did not stay arcs');
  for (const e of res.ents) for (const p of [e.s, e.m, e.e]) eq(Math.hypot(p[0], p[1]), 10, 1e-9, 'point radius');
  eq(Math.hypot(res.ents[0].e[0], res.ents[0].e[1]), 10, 1e-9, 'arc end radius');
});

await check('a projected ellipse is refused by name, not flattened', async () => {
  const ell = { geomType: 'ELLIPSE', firstParameter: 0, lastParameter: 1, firstPoint: [0, 0], lastPoint: [1, 0], value: () => [0, 0] };
  const res = build.s21cConvert({ innerShape: { curves: [ell] } }, idf);
  ok(res.ents.length === 0, 'an ellipse produced ' + res.ents.length + ' entities');
  ok(res.refused.includes('ELLIPSE'), 'the refusal does not name the type: ' + JSON.stringify(res.refused));
});

await check('a projected curve with no length is dropped with a count', async () => {
  const dot = { geomType: 'LINE', firstPoint: [5, 5], lastPoint: [5, 5] };
  const res = build.s21cConvert({ innerShape: { curves: [dot] } }, idf);
  ok(res.ents.length === 0, 'a zero-length line became an entity');
  ok(res.skipped === 1, 'the drop was not counted: ' + JSON.stringify(res));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
