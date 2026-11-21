/* P1a: a sketch made of lines, arcs, centre lines and points.
 *
 * The maths and the build path are lifted out of index.html and run against the real OpenCascade kernel, so these
 * tests cover the code that ships in the browser:
 *   * arc through three points, chained loops, closed-profile detection;
 *   * Trim, Extend, Sketch Fillet, Offset, tangent arc;
 *   * relations, dimensions and the under / fully / over-defined count;
 *   * a closed Line + Arc profile extruded and revolved by the kernel.
 *
 *   node tests/p1a.test.mjs
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
  throw new Error('P1a helpers or buildPart not found in index.html');
}

const p1src = html.slice(pStart, pEnd);
const buildSrc = html.slice(bStart, bEnd);
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);

const make = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${p1src}\n${buildSrc}\nreturn { buildPart, p1ArcFrom3, p1ArcPoint, p1Loops, p1OuterLoop, p1AreaLoop, p1Trim,
    p1Extend, p1Fillet, p1Offset, p1TangentArc, p1DOF, p1Solve, p1Length, p1Radius, p1Start, p1End, p1Drawing };`);

const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const P = make(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);
const { buildPart } = P;

/* ---- tiny runner ----------------------------------------------------------- */
let pass = 0;
const fails = [];
function check(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function ok(cond, what) { if (!cond) throw new Error(what); }
function eq(a, b, tol, what) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); }

const near = (p, q, tol = 1e-6) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;
const L2 = (id, a, b, c = 0) => ({ id, t: 'line', a, b, c });
const A2 = (id, s, e, m, c = 0) => ({ id, t: 'arc', s, e, m, c });
const square = (w = 40, h = 20, o = [0, 0]) => [
  L2('a', [o[0], o[1]], [o[0] + w, o[1]]),
  L2('b', [o[0] + w, o[1]], [o[0] + w, o[1] + h]),
  L2('c', [o[0] + w, o[1] + h], [o[0], o[1] + h]),
  L2('d', [o[0], o[1] + h], [o[0], o[1]]),
];
const F = (type, p) => ({ id: type + Math.random().toString(36).slice(2, 7), type, p });
const run = async (features) => { const part = { features }; const r = await buildPart(part); return { body: r.body, features }; };
const vol = (s) => (s ? R.measureVolume(s) : 0);

console.log('\nArc through three points');
check('three points give the circle through them', () => {
  const g = P.p1ArcFrom3([0, 0], [5, 5], [10, 0]);
  ok(g, 'no circle'); eq(g.r, 5, 1e-9, 'radius'); eq(g.c[0], 5, 1e-9, 'centre x'); eq(g.c[1], 0, 1e-9, 'centre y');
  eq(Math.abs(g.sweep), Math.PI, 1e-9, 'sweep'); ok(!g.ccw, 'travels clockwise from (0,0) through (5,5) to (10,0)');
  ok(near(P.p1ArcPoint(g, 0.5), [5, 5], 1e-9), 'the half-way point is the one the engineer clicked');
});
check('a point on the arc is where the engineer put it', () => {
  const g = P.p1ArcFrom3([10, 0], [0, 10], [-10, 0]);
  ok(near(P.p1ArcPoint(g, 0.5), [0, 10], 1e-9), 'mid of the arc');
});
check('three points on one line make no arc', () => { ok(P.p1ArcFrom3([0, 0], [5, 0], [10, 0]) === null, 'collinear must be null'); });

console.log('\nLoops and closed profiles');
check('four lines drawn end to end make one closed loop', () => {
  const loops = P.p1Loops(square());
  eq(loops.length, 1, 0, 'loops'); ok(loops[0].closed, 'closed'); eq(loops[0].ids.length, 4, 0, 'entities');
});
check('a line drawn the other way is turned to face the walk', () => {
  const s = square(); s[1] = L2('b', [40, 20], [40, 0]);            // drawn backwards
  const loop = P.p1OuterLoop(s);
  ok(loop, 'still closed');
  ok(near(P.p1End(loop.ents[1]), [40, 20], 1e-6), 'second entity now ends at the corner');
  eq(Math.abs(P.p1AreaLoop(loop.ents)), 800, 1e-6, 'area');
});
check('an open chain has no profile', () => { ok(P.p1OuterLoop(square().slice(0, 3)) === null, 'open chain'); });
check('a centre line is drawn but never part of the profile', () => {
  const s = square(); s.push(L2('cl', [-10, 10], [50, 10], 1));
  const loop = P.p1OuterLoop(s);
  ok(loop && loop.ids.length === 4, 'the construction line is left out');
});

console.log('\nTrim and Extend');
check('Trim removes the clicked piece between two crossings', () => {
  const base = [L2('x', [0, 10], [40, 10]), L2('v1', [10, 0], [10, 20]), L2('v2', [30, 0], [30, 20])];
  const out = P.p1Trim(base, 'x', [20, 10]);
  ok(out, 'trim ran');
  const xs = out.filter((e) => e.id.startsWith('x'));
  eq(xs.length, 2, 0, 'two pieces left');
  eq(xs.reduce((n, e) => n + P.p1Length(e), 0), 20, 1e-6, '20 mm of the line survives');
});
check('Trim says nothing when there is no crossing', () => {
  ok(P.p1Trim([L2('x', [0, 10], [40, 10]), L2('y', [0, 20], [40, 20])], 'x', [20, 10]) === null, 'null');
});
check('Extend lengthens the clicked end to the next line', () => {
  const out = P.p1Extend([L2('x', [0, 0], [10, 0]), L2('v', [20, -10], [20, 10])], 'x', [9, 0]);
  ok(out, 'extend ran');
  ok(near(out[0].b, [20, 0], 1e-6), 'the end reached the vertical line: ' + JSON.stringify(out[0].b));
});
check('Extend works on an arc too', () => {
  const base = [A2('a', [10, 0], [-10, 0], [0, 10]), L2('v', [-5, -20], [-5, 20])];
  const out = P.p1Extend(base, 'a', [-9.5, 1]);
  ok(out, 'extend ran');
  const end = out[0].e;
  ok(Math.abs(end[0] + 5) < 1e-6 && end[1] < 0, 'the arc continues past its end to x = -5: ' + JSON.stringify(end));
  ok(near(P.p1Start(out[0]), [10, 0], 1e-6), 'the other end did not move');
});

console.log('\nSketch Fillet and Offset');
check('Fillet rounds a right angle and shortens both lines', () => {
  const out = P.p1Fillet([L2('a', [0, 0], [30, 0]), L2('b', [0, 0], [0, 30])], 'a', 'b', 5);
  ok(out, 'fillet ran');
  const arc = out.find((e) => e.t === 'arc');
  ok(arc, 'an arc was added');
  eq(P.p1Radius(arc), 5, 1e-6, 'radius');
  ok(near(P.p1Start(arc), [5, 0], 1e-6) && near(P.p1End(arc), [0, 5], 1e-6), 'tangent points: ' + JSON.stringify([arc.s, arc.e]));
  const la = out.find((e) => e.id === 'a'), lb = out.find((e) => e.id === 'b');
  eq(P.p1Length(la), 25, 1e-6, 'line a shortened'); eq(P.p1Length(lb), 25, 1e-6, 'line b shortened');
});
check('Fillet refuses a radius bigger than the lines', () => {
  ok(P.p1Fillet([L2('a', [0, 0], [3, 0]), L2('b', [0, 0], [0, 3])], 'a', 'b', 50) === null, 'null');
});
check('Offset copies a closed loop outward at the distance', () => {
  const out = P.p1Offset(square(40, 20), 5);
  ok(out && out.length === 4, 'four offset entities');
  const loop = P.p1OuterLoop(out);
  eq(Math.abs(P.p1AreaLoop(loop.ents)), 50 * 30, 1e-4, 'area of the offset rectangle');
});
check('Offset keeps an arc round', () => {
  const base = [L2('a', [-10, 0], [10, 0]), A2('b', [10, 0], [-10, 0], [0, 10])];
  const out = P.p1Offset(base, 2);
  const arc = out && out.find((e) => e.t === 'arc');
  ok(arc, 'the arc survives');
  eq(P.p1Radius(arc), 12, 1e-6, 'the radius grew by the offset');
});

console.log('\nTangent arc, relations and dimensions');
check('a tangent arc leaves the line along its direction', () => {
  const t = P.p1TangentArc([0, 0], [1, 0], [10, 10]);
  const g = P.p1ArcFrom3(t.s, t.m, t.e);
  eq(g.c[0], 0, 1e-6, 'the centre sits on the line normal at the start');
  ok(near(t.s, [0, 0], 1e-9) && near(t.e, [10, 10], 1e-9), 'ends where asked');
});
check('a horizontal relation levels a line', () => {
  const out = P.p1Solve([L2('a', [0, 0], [30, 4])], [{ t: 'horizontal', e: ['a'] }], []);
  eq(out[0].b[1], 0, 1e-9, 'b.y');
});
check('a length dimension drives the line', () => {
  const out = P.p1Solve([L2('a', [0, 0], [30, 4])], [], [{ t: 'length', e: ['a'], value: 50 }]);
  eq(P.p1Length(out[0]), 50, 1e-9, 'length');
  const arc = P.p1Solve([A2('r', [5, 0], [-5, 0], [0, 5])], [], [{ t: 'radius', e: ['r'], value: 8 }])[0];
  eq(P.p1Radius(arc), 8, 1e-9, 'radius');
});
check('an empty sketch is not over-defined, and a point keeps its two parameters', () => {
  const empty = P.p1DOF([], [], []);
  ok(empty.status === 'under' && empty.dof === 0, 'empty: ' + JSON.stringify(empty));
  const one = P.p1DOF([{ t: 'point', id: 'p', x: 0, y: 0, p: [0, 0] }], [], []);
  eq(one.dof, 2, 0, 'a free point has two');
});
check('under, fully and over-defined are counted', () => {
  const s = square();
  const rels = s.map((e, i) => ({ t: 'coincident', e: [s[(i + 1) % 4].id, e.id], which: 1, other: 0 }));
  const base = P.p1DOF(s, rels, []);
  ok(base.status === 'under', 'a bare rectangle is under-defined: ' + JSON.stringify(base)); eq(base.dof, 5, 0, '5 free parameters');
  const two = P.p1DOF(s, rels, [{ t: 'length', e: ['a'], value: 40 }, { t: 'length', e: ['b'], value: 20 }]);
  eq(two.dof, 3, 0, 'width and height leave 3');
  const fixed = P.p1DOF(s, [...rels, { t: 'fix', e: ['a'] }, { t: 'horizontal', e: ['a'] }], [{ t: 'length', e: ['a'], value: 40 }, { t: 'length', e: ['b'], value: 20 }]);
  ok(fixed.status === 'fully', 'every parameter fixed: ' + JSON.stringify(fixed));
  const over = P.p1DOF(s, [...rels, { t: 'fix', e: ['a'] }, { t: 'horizontal', e: ['a'] }, { t: 'vertical', e: ['b'] }], [{ t: 'length', e: ['a'], value: 40 }, { t: 'length', e: ['b'], value: 20 }]);
  ok(over.status === 'over', 'one relation too many: ' + JSON.stringify(over));
});

console.log('\nThe kernel builds the profile');
const rect = await run([F('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: square(40, 20) }), F('push', { dist: 10, op: 'add', both: 'one' })]);
check('extrude volume', () => eq(vol(rect.body), 8000, 1, 'volume'));
check('no step failed', () => ok(!rect.features.some((x) => x.err), JSON.stringify(rect.features.map((x) => x.err))));

/* a half disc: straight diameter + one real arc, so the kernel must keep the arc */
const halfDisc = [L2('a', [-10, 0], [10, 0]), A2('b', [10, 0], [-10, 0], [0, 10])];
const disc = await run([F('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: halfDisc }), F('push', { dist: 5, op: 'add', both: 'one' })]);
check('a Line + Arc profile extrudes (half disc, 785 mm³)', () => eq(vol(disc.body), Math.PI * 100 / 2 * 5, 3, 'volume'));

const rev = await run([F('sketch', { prof: 'ents', plane: 'XZ', at: 'value', off: 0, ents: [
  L2('a', [10, 0], [20, 0]), L2('b', [20, 0], [20, 30]), L2('c', [20, 30], [10, 30]), L2('d', [10, 30], [10, 0])] }),
  F('revolve', { axis: 'Z', angle: 360, op: 'add' })]);
check('a closed Line profile revolves (π(20²−10²)·30)', () => eq(vol(rev.body), Math.PI * (400 - 100) * 30, 20, 'volume'));

const open = await run([F('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: square().slice(0, 3) }), F('push', { dist: 10, op: 'add', both: 'one' })]);
check('an open sketch explains that Extrude needs a closed loop', () => ok(open.features[1].err && /closed loop/.test(open.features[1].err), 'got: ' + open.features[1].err));

const centre = await run([F('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: [...square(), L2('cl', [-20, 10], [60, 10], 1)] }), F('push', { dist: 10, op: 'add', both: 'one' })]);
check('a centre line is not extruded as part of the profile', () => eq(vol(centre.body), 8000, 1, 'volume'));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  for (const [name, e] of fails) console.log('FAILED: ' + name + '\n  ' + (e && e.stack ? e.stack.split('\n')[1] : e));
  process.exit(1);
}
