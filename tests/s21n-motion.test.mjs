/* S21n: Motion Study — Batch 12. One driven joint, a time step, and a measurement at every step, all by the kernel.
 *
 *   * the transform the animation uses (motMat) moves the corners to the same box the kernel's own rotate gives, on
 *     x, y and z — so the animation cannot drift away from the measured frames;
 *   * the display transform is the CAD transform conjugated by zUp, so the picture is the measured motion;
 *   * a speed of 0, a duration of 0, 1 frame or 200 frames is refused with the value it read;
 *   * a slide that closes a 20 mm gap in 1 mm frames hits at frame 21 with exactly 400.00 mm³ of common volume, and
 *     the frame before it touches at 0.000 mm with no volume — the kernel found the contact, not a formula;
 *   * the moved solid keeps its volume at every frame (a rigid motion removes nothing);
 *   * a bar turning about z meets a post in the first quadrant; every frame before that is clear;
 *   * the same bar with nothing near it reports no contact at all.
 *
 *   node tests/s21n-motion.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const sStart = html.indexOf('/* ---- S21n: motion study');
const sEnd = html.indexOf('/* ---- end S21n helpers ---- */');
if (sStart < 0 || sEnd < sStart) throw new Error('the S21n block is not where the test expects it in index.html');
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (x) => new URL('../kernel/' + x, import.meta.url).href });
R.setOC(oc);
const M = new Function('R', 'L', 'f', `${html.slice(sStart, sEnd)}\nreturn { motMat, motSlideMat, motApply, motDispMat, motMul4, motPlan, motStudy, motClear };`)(R, L, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const box = (sh) => { const b = sh.boundingBox.bounds; return [[...b[0]], [...b[1]]]; };
const corners = (b) => { const out = []; for (const x of [b[0][0], b[1][0]]) for (const y of [b[0][1], b[1][1]]) for (const z of [b[0][2], b[1][2]]) out.push([x, y, z]); return out; };
const bboxOf = (pts) => { const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { if (p[k] < mn[k]) mn[k] = p[k]; if (p[k] > mx[k]) mx[k] = p[k]; } return [mn, mx]; };
const zUp = (p) => [p[0], p[2], -p[1]];
const AX = { x: 0, y: 1, z: 2 };
const vec = (ax) => { const v = [0, 0, 0]; v[ax] = 1; return v; };

await check('the animation transform lands the corners on the box the kernel rotates to (x, y and z)', async () => {
  const shape = R.makeBox([0, 0, 0], [20, 10, 6]), pivot = [10, 5, 0], deg = 30;
  for (const [name, ax] of [['x', 0], ['y', 1], ['z', 2]]) {
    const k = box(shape.clone().rotate(deg, pivot, vec(ax)));
    const mine = bboxOf(corners(box(shape)).map((p) => M.motApply(M.motMat(ax, pivot, deg), p)));
    for (let k2 = 0; k2 < 3; k2++) { eq(mine[0][k2], k[0][k2], 1e-9, `${name} min ${k2}`); eq(mine[1][k2], k[1][k2], 1e-9, `${name} max ${k2}`); }
  }
});

await check('the display transform is the CAD transform conjugated by the viewer\u2019s zUp', async () => {
  const cases = [[M.motMat(2, [0, 0, 0], 90), [3, -7, 4]], [M.motMat(0, [2, 1, 5], -40), [-6, 3, 9]], [M.motMat(1, [0, 4, 0], 130), [11, -2, -8]], [M.motSlideMat(2, 12.5), [1, 2, 3]]];
  for (const [m, p] of cases) {
    const mine = M.motApply(M.motDispMat(m), zUp(p)), theirs = zUp(M.motApply(m, p));
    for (let k = 0; k < 3; k++) eq(mine[k], theirs[k], 1e-9, 'display point ' + k);
  }
});

await check('a speed of 0, a duration of 0, 1 frame or 200 frames is refused with the value it read', async () => {
  const base = { driver: 'slide', axis: 'x', speed: 10, duration: 3, frames: 30 };
  const r1 = M.motPlan({ ...base, speed: 0 }); ok(r1.refuse === 'speed' && r1.speed === 0, JSON.stringify(r1));
  const r2 = M.motPlan({ ...base, duration: 0 }); ok(r2.refuse === 'duration' && r2.dur === 0, JSON.stringify(r2));
  const r3 = M.motPlan({ ...base, frames: 1 }); ok(r3.refuse === 'frames' && r3.frames === 1, JSON.stringify(r3));
  const r4 = M.motPlan({ ...base, frames: 200 }); ok(r4.refuse === 'max' && r4.frames === 200, JSON.stringify(r4));
  const good = M.motPlan(base); ok(!good.refuse && good.step === 1 && good.total === 30, JSON.stringify(good));
});

/* a 20 × 20 × 10 mover under a 40 × 40 plate: the gap is exactly 20 mm, so 1 mm frames must meet at frame 21 with
 * 20 × 20 × 1 = 400 mm³ of common volume, and frame 20 must touch at 0.000 mm with no volume */
const slideCase = () => {
  const mover = R.makeBox([10, -10, 0], [30, 10, 10]), plate = R.makeBox([0, -20, 30], [40, 20, 40]);
  return { mover, plate };
};
await check('a slide that closes a 20 mm gap hits the plate at frame 21 with exactly 400.00 mm³', async () => {
  const { mover, plate } = slideCase();
  const r = M.motStudy(R, mover, [plate], { driver: 'slide', axis: 'z', speed: 10, duration: 3, frames: 30 }, [0, 0, 0]);
  ok(!r.refuse, JSON.stringify(r.refuse));
  ok(r.rows.length === 30, 'the run should have 30 frames: ' + r.rows.length);
  eq(r.rows[19].s, 20, 1e-9, 'frame 20 travel');
  ok(r.rows[19].v === 0, 'frame 20 already overlaps: ' + r.rows[19].v);
  eq(r.first.i, 21, 0, 'first contact frame');
  eq(r.first.s, 21, 1e-9, 'first contact travel');
  eq(r.first.v, 400, 1e-6, 'common volume at the first contact');
  eq(r.first.t, 2.1, 1e-9, 'time of the first contact');
  ok(r.worst && r.worst.i === 20, 'the smallest gap should be at frame 20: ' + JSON.stringify(r.worst));
  eq(r.worst.d, 0, 1e-6, 'gap at frame 20 (touching)');
});

await check('the moved solid keeps its volume at every frame (a rigid motion removes nothing)', async () => {
  const { mover, plate } = slideCase();
  const r = M.motStudy(R, mover, [plate], { driver: 'slide', axis: 'z', speed: 10, duration: 3, frames: 30 }, [0, 0, 0]);
  eq(r.vol0, 20 * 20 * 10, 1e-6, 'source volume');
  ok(r.dv < 1e-6, 'the volume changed during the motion by ' + r.dv);
});

await check('a bar turning about z meets a post in the first quadrant, and every frame before that is clear', async () => {
  const bar = R.makeBox([-30, -5, 10], [30, 5, 20]), post = R.makeBox([-5, 20, 10], [5, 30, 20]);
  const r = M.motStudy(R, bar, [post], { driver: 'rotate', axis: 'z', speed: 90, duration: 1, frames: 90 }, [0, 0, 0]);
  ok(!r.refuse && r.rows.length === 90, JSON.stringify(r.refuse || r.rows.length));
  ok(r.first, 'the bar never met the post');
  ok(r.first.s > 40 && r.first.s < 80, 'the first contact is at ' + r.first.s + '°, which is not the swept corner');
  ok(r.first.v > 0.01, 'no common volume at the contact: ' + r.first.v);
  for (const row of r.rows) if (row.i < r.first.i) ok(row.v <= 0.01, 'frame ' + row.i + ' already overlaps by ' + row.v + ' mm³');
  eq(r.total, 90, 1e-9, 'total angle');
});

await check('the same bar with nothing near it reports no contact at all', async () => {
  const bar = R.makeBox([-30, -5, 10], [30, 5, 20]), post = R.makeBox([-5, 200, 10], [5, 210, 20]);
  const r = M.motStudy(R, bar, [post], { driver: 'rotate', axis: 'z', speed: 90, duration: 1, frames: 90 }, [0, 0, 0]);
  ok(!r.first && r.crashed === false, 'a contact was reported: ' + JSON.stringify(r.first));
  ok(r.worst && r.worst.d > 100, 'the smallest gap should be far: ' + JSON.stringify(r.worst));
  ok(r.rows.every((row) => row.v === 0), 'a frame overlapped something');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exitCode = 1;
