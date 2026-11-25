/* Batch B: the Features batch, measured in the kernel.
 *
 *   * Reference Plane: a sketch on it extrudes to exactly the same volume as the equivalent XY + offset sketch
 *     (offset, 90° angle and three points are each checked by the box the solid really occupies);
 *   * Reference Axis: Revolve about it gives the shell the radii imply, which the built-in Z axis cannot;
 *   * Coordinate System: a circular Repeat turns about it, so 4 copies is 4 × the box;
 *   * Dome: a spherical cap on a round +Z face adds πh(3a² + h²)/6;
 *   * Split: a 100 mm box at its centre is two bodies of 500 000 mm³ each, both returned;
 *   * Curve Pattern: 4 copies along a measured 90 mm path is 4 boxes, 2 000 mm³;
 *   * Fill Pattern: 2 × 2 is 4 boxes, 2 000 mm³;
 *   * Wrap / Emboss: an emboss adds exactly profile × height, a deboss removes it.
 *
 *   node tests/bB-features.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('const IDRIS_FONT = {');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if (bStart < 0 || bEnd < bStart) throw new Error('font + buildPart not found');
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(bStart, bEnd)}\nreturn { buildPart, s22PathPoints, idrisTextRects };`)(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const id = (k) => k + Math.random().toString(36).slice(2, 5);
const box = (Lx = 100, Wy = 100, Hz = 100, extra = {}) => ({ id: id('b'), type: 'shape', p: { kind: 'box', L: Lx, W: Wy, H: Hz, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add', ...extra } });
const rect = (W, Hh, extra = {}) => ({ id: id('s'), type: 'sketch', p: { prof: 'rect', W, Hh, plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ...extra } });
const push = (dist, op = 'add') => ({ id: id('p'), type: 'push', p: { dist, op, both: 'one' } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };
const errs = (features) => features.map((x) => x.err).filter(Boolean);

await check('a sketch on an offset reference plane is the same volume as XY + offset', async () => {
  const A = await run([rect(40, 20, { plane: 'XY', at: 'value', off: 20 }), push(10)]);
  const feats = [{ id: 'rp', type: 'refplane', p: { mode: 'offset', base: 'XY', dist: 20, angle: 30, p1: '', p2: '', p3: '' } }, rect(40, 20, { plane: 'rp' }), push(10)];
  const B = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(B.r.body), 40 * 20 * 10, 1, 'volume on the reference plane');
  eq(R.measureVolume(B.r.body), R.measureVolume(A.r.body), 1e-6, 'same volume as XY + offset');
  const [[, , z0], [, , z1]] = B.r.body.boundingBox.bounds;
  eq(z0, 20, 1e-6, 'the solid starts on the plane'); eq(z1, 30, 1e-6, 'and is 10 mm tall');
});

await check('a 90° reference plane turns the sketch onto XZ for real', async () => {
  const feats = [{ id: 'rp', type: 'refplane', p: { mode: 'angle', base: 'XY', dist: 0, angle: 90, p1: '', p2: '', p3: '' } }, rect(40, 20, { plane: 'rp' }), push(10)];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 8000, 1, 'volume');
  const [[, y0, z0], [, y1, z1]] = r.body.boundingBox.bounds;
  eq(z1 - z0, 20, 1e-6, 'the profile lies across Z on the turned plane');
  eq(y1 - y0, 10, 1e-3, 'extruded 10 mm along the plane normal (−Y)');
});

await check('three points give the plane they define', async () => {
  const feats = [{ id: 'rp', type: 'refplane', p: { mode: 'three', base: 'XY', dist: 0, angle: 0, p1: '0,0,50', p2: '100,0,50', p3: '0,100,50' } }, rect(40, 20, { plane: 'rp' }), push(10)];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 8000, 1, 'volume');
  const [[, , z0]] = r.body.boundingBox.bounds; eq(z0, 50, 1e-6, 'the plane is at z = 50');
});

await check('a datum axis at x = 10 turns a profile 10–20 mm from it into its shell', async () => {
  const feats = [{ id: 'ax', type: 'refaxis', p: { mode: 'through', dir: 'Z', x: 10, y: 0, z: 0, p1: '', p2: '' } },
    rect(10, 20, { plane: 'XZ', u: 25, v: 10 }), { id: id('r'), type: 'revolve', p: { axis: 'ax', angle: 360, op: 'add' } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), Math.PI * (20 * 20 - 10 * 10) * 20, 2, 'shell volume');
});

await check('a circular Repeat turns about a coordinate system', async () => {
  const feats = [{ id: 'cs', type: 'csys', p: { x: 0, y: 0, z: 0, rz: 0 } }, box(20, 10, 10, { x: 50 }),
    { id: id('rep'), type: 'repeat', p: { kind: 'circle', count: 4, cx: 0, cy: 0, ref: 'cs' } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 4 * 20 * 10 * 10, 1, 'four copies about the CSYS');
});

await check('a dome on a Ø20 cylinder is the spherical cap πh(3a² + h²)/6', async () => {
  const cyl = { id: id('c'), type: 'shape', p: { kind: 'cyl', D: 20, H: 20, L: 10, W: 10, Di: 5, x: 0, y: 0, z: 0, op: 'add' } };
  const feats = [cyl, { id: id('d'), type: 'dome', p: { h: 5 } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  const cap = Math.PI * 5 * (3 * 100 + 25) / 6;
  eq(R.measureVolume(r.body), Math.PI * 100 * 20 + cap, 1, 'cylinder + cap');
  const [[, , z0], [, , z1]] = r.body.boundingBox.bounds;
  eq(z1 - z0, 25, 1e-2, 'the dome is 5 mm tall on the 20 mm cylinder');
});

await check('Split at the middle of a 100 mm box gives two bodies of 500 000 mm³', async () => {
  const feats = [box(100, 100, 100), { id: id('sp'), type: 'split', p: { plane: 'XY', at: 50 } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 500000, 1, 'first body');
  eq(r.bodies.length, 1, 0, 'a second body is returned');
  eq(R.measureVolume(r.bodies[0]), 500000, 1, 'second body');
});

await check('Split refuses a plane outside the part', async () => {
  const feats = [box(100, 100, 100), { id: id('sp'), type: 'split', p: { plane: 'XY', at: 200 } }];
  await run(feats);
  ok(/does not cut/.test(feats[1].err || ''), 'no refusal: ' + feats[1].err);
});

await check('Curve Pattern makes 4 boxes along a 90 mm path', async () => {
  const path = { id: id('path'), type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, rels: [], dims: [], ents: [{ id: 'L1', t: 'line', a: [0, 0], b: [0, 90] }] } };
  const feats = [box(10, 10, 5), path, { id: id('cp'), type: 'curvepat', p: { sketch: path.id, count: 4 } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 4 * 500, 1, 'four copies');
  ok(/90/.test(feats[2].note || ''), 'the note does not carry the measured path: ' + feats[2].note);
});

await check('Fill Pattern makes a 2 × 2 grid of the step before it', async () => {
  const feats = [box(10, 10, 5), { id: id('fp'), type: 'fillpat', p: { cols: 2, rows: 2, sx: 20, sy: 20 } }];
  const { r } = await run(feats);
  ok(!errs(feats).length, 'a step failed: ' + JSON.stringify(errs(feats)));
  eq(R.measureVolume(r.body), 4 * 500, 1, 'four copies');
});

await check('Wrap / Emboss adds and removes exactly the profile × height', async () => {
  const sk = rect(20, 20);
  const up = await run([box(40, 40, 10), sk, { id: id('w'), type: 'wrap', p: { sketch: sk.id, depth: 2, op: 'add' } }]);
  ok(!errs(up.features).length, 'a step failed: ' + JSON.stringify(errs(up.features)));
  eq(R.measureVolume(up.r.body), 16000 + 800, 1, 'emboss adds 800 mm³');
  const sk2 = rect(20, 20);
  const down = await run([box(40, 40, 10), sk2, { id: id('w'), type: 'wrap', p: { sketch: sk2.id, depth: 2, op: 'cut' } }]);
  eq(R.measureVolume(down.r.body), 16000 - 800, 1, 'deboss removes 800 mm³');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
