/* S21b: Mirror Entities and Sketch Pattern, Batch 2 of the CAD backlog.
 *
 * The P1a block (which now carries the mirror/pattern maths) and buildPart are lifted out of index.html and run
 * against the real kernel:
 *   * a reflection is exact: a point, a line and an arc mirror about a centre line, and the mirrored arc keeps its
 *     radius (three reflected points, not a flattened copy);
 *   * a mirror refuses when there is no centre line, nothing is selected, or the line itself is selected;
 *   * a linear pattern copies by (dx, dy) per instance and a circular one turns by the angle about the centre;
 *   * a pattern refuses 1 or 201 instances and a zero step, with the reason the panel shows;
 *   * the kernel builds a half-profile that was mirrored into a closed one: 3 lines + a centre line, mirrored, is a
 *     40 × 10 rectangle and extrudes to 40 · 10 · 5 = 2 000 mm³;
 *   * a patterned pair stays two closed loops with the area of the original.
 *
 *   node tests/s21b-sketch-modify.test.mjs
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
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, pStart, pEnd, tAt].some((x) => x < 0) || bEnd < bStart || pEnd < pStart) {
  throw new Error('the P1a block or buildPart is not where the test expects it in index.html');
}
const p1src = html.slice(pStart, pEnd);
const buildSrc = html.slice(bStart, bEnd);
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);

const make = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${p1src}\n${buildSrc}\nreturn { buildPart, p1Reflect, p1Rotate2, p1Mirror, p1Pattern, p1Loops, p1OuterLoop, p1AreaLoop, p1Radius, p1Length, p1Start, p1End };`);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const P = make(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0;
const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const checkAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const near = (p, q, tol = 1e-9) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;

let seq = 0;
const nid = () => 'm' + (++seq);
const L2 = (id, a, b, c = 0) => ({ id, t: 'line', a, b, c });
const A2 = (id, s, e, m, c = 0) => ({ id, t: 'arc', s, e, m, c });
const rect = (w, h, o = [0, 0]) => [
  L2('a', [o[0], o[1]], [o[0] + w, o[1]]), L2('b', [o[0] + w, o[1]], [o[0] + w, o[1] + h]),
  L2('c', [o[0] + w, o[1] + h], [o[0], o[1] + h]), L2('d', [o[0], o[1] + h], [o[0], o[1]]),
];

console.log('\nReflection');
check('a point mirrors across a horizontal line', () => {
  ok(near(P.p1Reflect([10, 5], [0, 0], [10, 0]), [10, -5]), 'wrong mirror');
  ok(near(P.p1Reflect([10, 5], [0, -10], [0, 10]), [-10, 5]), 'wrong mirror about the vertical');
});
check('a point on the mirror line does not move', () => { ok(near(P.p1Reflect([4, 0], [0, 0], [10, 0]), [4, 0]), 'moved'); });
check('a negative-step rotation is a rotation too', () => {
  const q = P.p1Rotate2([10, 0], [0, 0], Math.PI / 2); ok(near(q, [0, 10], 1e-9), JSON.stringify(q));
});

console.log('\nMirror Entities');
check('a line mirrors end for end, and an arc keeps its radius', () => {
  const line = L2('cx', [0, -20], [0, 20], 1);
  const ents = [line, L2('x', [5, 2], [15, 2]), A2('r', [10, 0], [0, 10], [7.07, 7.07])];
  const out = P.p1Mirror(ents, ['x', 'r'], line, nid);
  ok(out && out.length === 2, 'two copies: ' + JSON.stringify(out));
  const mir = out[0];
  ok(mir.t === 'line' && near(mir.a, [-5, 2]) && near(mir.b, [-15, 2]), 'the line did not mirror: ' + JSON.stringify(mir));
  ok(mir.c === 0, 'a copy must not be construction geometry');
  ok(P.p1Radius(out[1]) > 9.99 && P.p1Radius(out[1]) < 10.01, 'the mirrored arc lost its radius: ' + P.p1Radius(out[1]));
  ok(near(P.p1Start(out[1]), [-10, 0], 1e-9), 'the arc start did not mirror');
  ok(out[0].id !== 'x' && out[0].id !== out[1].id, 'copies need their own ids');
});
check('the mirror line cannot be one of the mirrored entities', () => {
  ok(P.p1Mirror([L2('cx', [0, 0], [0, 10], 1)], ['cx'], L2('cx', [0, 0], [0, 10], 1), nid) === null, 'must refuse');
});
check('nothing selected is refused', () => {
  ok(P.p1Mirror([L2('x', [0, 0], [1, 1])], [], L2('cx', [0, 0], [0, 10], 1), nid) === null, 'must refuse');
});
check('no centre line is refused', () => { ok(P.p1Mirror([L2('x', [0, 0], [1, 1])], ['x'], null, nid) === null, 'must refuse'); });

console.log('\nSketch Pattern');
check('a linear pattern steps by (dx, dy) per instance', () => {
  const ents = rect(20, 10), out = P.p1Pattern(ents, ['a'], { kind: 'line', count: 3, dx: 50, dy: 5 }, nid);
  ok(out && out.length === 2, 'two copies of one entity: ' + JSON.stringify(out));
  ok(near(out[0].a, [50, 5]) && near(out[0].b, [70, 5]), 'copy 1: ' + JSON.stringify(out[0]));
  ok(near(out[1].a, [100, 10]), 'copy 2: ' + JSON.stringify(out[1]));
});
check('a circular pattern turns about the centre (0 = one turn split evenly)', () => {
  const out = P.p1Pattern([L2('x', [10, 0], [12, 0])], ['x'], { kind: 'circle', count: 4, cx: 0, cy: 0, angle: 0 }, nid);
  ok(out && out.length === 3, 'three copies: ' + JSON.stringify(out));
  ok(near(out[0].a, [0, 10], 1e-9), 'the second instance sits a quarter turn away: ' + JSON.stringify(out[0].a));
  ok(near(out[2].a, [0, -10], 1e-9), 'the fourth sits three quarters away');
});
check('a typed angle is the step', () => {
  const out = P.p1Pattern([L2('x', [10, 0], [12, 0])], ['x'], { kind: 'circle', count: 2, cx: 0, cy: 0, angle: 45 }, nid);
  const want = [10 * Math.cos(Math.PI / 4), 10 * Math.sin(Math.PI / 4)];
  ok(near(out[0].a, want, 1e-9), JSON.stringify(out[0].a));
});
check('1 or 201 instances and a zero step are refused', () => {
  const ents = [L2('x', [0, 0], [1, 0])];
  ok(P.p1Pattern(ents, ['x'], { kind: 'line', count: 1, dx: 10 }, nid) === null, 'count 1');
  ok(P.p1Pattern(ents, ['x'], { kind: 'line', count: 201, dx: 10 }, nid) === null, 'count 201');
  ok(P.p1Pattern(ents, ['x'], { kind: 'line', count: 3, dx: 0, dy: 0 }, nid) === null, 'zero step');
  ok(P.p1Pattern([], ['x'], { kind: 'line', count: 3, dx: 10 }, nid) === null, 'nothing selected');
});

console.log('\nThe kernel builds what the tools copied');
await checkAsync('a half profile mirrored about its centre line extrudes to 40 × 10 × 5', async () => {
  const half = [L2('p', [0, 0], [20, 0]), L2('q', [20, 0], [20, 10]), L2('r', [20, 10], [0, 10])];
  const cl = L2('cl', [0, 0], [0, 10], 1);
  const ents = [...half, cl];
  const copies = P.p1Mirror(ents, ['p', 'q', 'r'], cl, (() => { let i = 0; return () => 'k' + (++i); })());
  const all = [...ents, ...copies];
  const loop = P.p1OuterLoop(all);
  ok(loop, 'no closed loop after the mirror');
  eq(Math.abs(P.p1AreaLoop(loop.ents)), 400, 1e-6, 'the mirrored profile is 40 × 10');
  const part = { features: [{ id: 'sk', type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents: all } },
    { id: 'pu', type: 'push', p: { dist: 5, op: 'add', both: 'one' } }] };
  const out = await P.buildPart(part);
  ok(out && out.body, 'the kernel built nothing');
  eq(R.measureVolume(out.body), 2000, 0.01, 'volume');
  ok(part.features.every((x) => !x.err), 'a step failed: ' + JSON.stringify(part.features.map((x) => x.err)));
});
await checkAsync('a patterned copy is a second closed loop with the same area', async () => {
  const ents = rect(20, 20);
  const copies = P.p1Pattern(ents, ['a', 'b', 'c', 'd'], { kind: 'line', count: 2, dx: 60, dy: 0 }, (() => { let i = 0; return () => 'p' + (++i); })());
  const all = [...ents, ...copies];
  const loops = P.p1Loops(all);
  eq(loops.length, 2, 0, 'two closed loops');
  for (const lp of loops) eq(Math.abs(P.p1AreaLoop(lp.ents)), 400, 1e-6, 'each loop is 20 × 20');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
