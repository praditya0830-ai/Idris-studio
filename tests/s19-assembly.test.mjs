/* S19: the assembly moves the kernel measures (pattern, mirror, mate, collision).
 *
 * The S19 block is lifted out of index.html and run against the real OpenCascade kernel:
 *   * a mirror across YZ of a 20 x 10 x 5 block at x 20..40 lands at x -40..-20 with the same 1 000 mm3;
 *   * a linear pattern of 3 copies at 40 mm pitch on that block spans x 10..110 = 100 mm;
 *   * a circular pattern of 4 copies spans 80 x 80 mm around the centre;
 *   * copies that overlap are found by common volume, so the tool can refuse them with a number;
 *   * a mate puts the upper hole on the lower hole and a 7.6 mm probe through both hits 0 mm3 while a
 *     9 mm probe hits the hole wall;
 *   * a collision along x in 5 mm steps first hits at 25 mm with 250 mm3 of common volume;
 *   * every refusal says which number was wrong.
 *
 *   node tests/s19-assembly.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const s = html.indexOf('/* ---- S19: the moves the kernel measures');
const e = html.indexOf('/* ---- S19 UI:');
if (s < 0 || e < s) throw new Error('S19 block not found');
const src = html.slice(s, e);
const oc = await ocmod({ locateFile: (f) => new URL('../kernel/' + f, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', `${src}\nreturn { asmBoxOf, asmEnvelope, asmPatternPlaces, asmPairVolumes, asmMirrorCopy, asmMateSolve, asmProbe, asmCollide };`);
const S = make(async () => R);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const plate = (min, max) => R.makeBox(min, max);

/* 1. mirror: the kernel's own mirrored solid keeps the volume and flips the box */
{
  const box = plate([20, -5, 0], [40, 5, 5]);
  const m = S.asmMirrorCopy(R, box, 'YZ');
  t('mirror YZ keeps the volume', Math.abs(m.volAfter - 1000) < 1e-6, String(m.volAfter));
  near(m.volBefore, 1000, 1e-6, 'the source measures 1 000 mm3 before the mirror');
  near(m.box[0][0], -40, 1e-6, 'mirrored box starts at x = -40');
  near(m.box[1][0], -20, 1e-6, 'mirrored box ends at x = -20');
  const env = S.asmEnvelope([S.asmBoxOf(box), m.box]);
  near(env.span[0], 80, 1e-6, 'the pair spans -40..40 = 80 mm across the mirror plane');
  const bad = S.asmMirrorCopy(R, plate([20, -5, 0], [40, 5, 5]), 'nope');
  t('an unknown plane falls back to YZ instead of inventing one', bad.plane === 'YZ' && bad.box[0][0] === -40, JSON.stringify(bad.box));
}

/* 2. linear pattern: 3 copies at 40 mm pitch on a 20 mm wide block */
{
  const box = plate([10, -5, 0], [30, 5, 5]);
  const p = S.asmPatternPlaces(box, { kind: 'linear', count: 3, dx: 40, dy: 0 });
  t('linear pattern makes count-1 copies', p.places.length === 2 && p.count === 3, JSON.stringify({ n: p.places.length, count: p.count }));
  near(p.pitch, 40, 1e-9, 'the pitch is the 40 mm the engineer typed');
  near(p.env.span[0], 100, 1e-6, 'the envelope is 10..110 = 100 mm wide');
  near(p.places[1].box[0][0], 90, 1e-6, 'the third copy starts at x = 90');
  t('no overlap between copies 40 mm apart on a 20 mm block', S.asmPairVolumes(R, [{ name: 'a', shape: box, box: S.asmBoxOf(box) }].concat(p.places.map((q) => ({ name: 'c', shape: q.shape, box: q.box })))).length === 0);
}

/* 3. circular pattern: 4 copies of a box at x 20..40 span 80 x 80 mm */
{
  const box = plate([20, -5, 0], [40, 5, 5]);
  const p = S.asmPatternPlaces(box, { kind: 'circular', count: 4, cx: 0, cy: 0 });
  near(p.pitch, 90, 1e-9, 'the pitch is 360/4 = 90 degrees');
  near(p.env.span[0], 80, 1e-6, 'envelope spans 80 mm in x (-40..40)');
  near(p.env.span[1], 80, 1e-6, 'envelope spans 80 mm in y (-40..40)');
  near(p.places[0].box[1][0], 5, 1e-6, 'the 90 degree copy is at x -5..5');
}

/* 4. overlapping copies are measured, not assumed */
{
  const box = plate([0, -20, 0], [60, 20, 20]);
  const p = S.asmPatternPlaces(box, { kind: 'linear', count: 3, dx: 30, dy: 0 });
  const clash = S.asmPairVolumes(R, [{ name: 'a', shape: box, box: S.asmBoxOf(box) }].concat(p.places.map((q) => ({ name: 'c' + q.i, shape: q.shape, box: q.box }))));
  t('copies 30 mm apart on a 60 mm block overlap and are found', clash.length > 0 && clash.every((x) => x.v > 0), JSON.stringify(clash));
  near(clash[0].v, 30 * 40 * 20, 1, 'the overlap is 30 x 40 x 20 = 24 000 mm3');
}

/* 5. mate: the upper hole lands on the lower hole, and the probe says whether it is clear */
{
  const lower = plate([-20, -20, 0], [20, 20, 4]).cut(R.makeCylinder(4, 20, [0, 0, -5], [0, 0, 1]));
  const upperBody = plate([-10, -10, 0], [10, 10, 4]).cut(R.makeCylinder(4, 20, [2, 0, -5], [0, 0, 1]));
  const sol = S.asmMateSolve({ lowerTop: 4, upperLocalBottom: 0, lowerHole: { x: 0, y: 0, d: 8 }, upperHole: { x: 2, y: 0 }, upperRot: 0 });
  near(sol.t[0], -2, 1e-9, 'the upper part moves -2 mm in x so its hole is on the lower hole');
  near(sol.t[2], 4, 1e-9, 'the upper part sits on the lower top face');
  const placed = upperBody.translate(sol.t);
  const clear = S.asmProbe(R, [lower, placed], sol.hole, -1, 9, -0.2);
  const wall = S.asmProbe(R, [lower, placed], sol.hole, -1, 9, 1);
  near(clear.vol, 0, 1e-6, 'a 7.6 mm probe through both holes hits nothing');
  t('a 10 mm probe hits the hole wall, so the holes are really drilled', wall.vol > 100, String(wall.vol));
  const shifted = placed.clone().translate([3, 0, 0]);
  t('a mate 3 mm off centre is caught by the same probe', S.asmProbe(R, [lower, shifted], sol.hole, -1, 9, -0.2).vol > 1, 'probe stayed at 0');
  const rot = S.asmMateSolve({ lowerTop: 4, upperLocalBottom: 0, lowerHole: { x: 0, y: 0, d: 8 }, upperHole: { x: 2, y: 0 }, upperRot: 180 });
  near(rot.t[0], 2, 1e-9, 'a 180 degree upper part is placed on the other side of its hole');
}

/* 6. collision: 5 mm steps along x, first contact at 25 mm with 250 mm3 */
{
  const a = plate([0, -5, 0], [20, 5, 5]), b = plate([40, -5, 0], [60, 5, 5]);
  const res = S.asmCollide(R, a, [b], { axis: 'x', travel: 60, step: 5 });
  t('a collision is reported at the first step that is not clear', !!res.first, JSON.stringify(res));
  near(res.first.d, 25, 1e-9, 'the first contact is 25 mm along x');
  near(res.first.v, 250, 1e-6, 'the overlap is 5 x 10 x 5 = 250 mm3');
  t('the contact step is named', res.first.step === 5 && res.steps === 12, JSON.stringify(res.first) + ' steps ' + res.steps);
  const none = S.asmCollide(R, plate([0, -5, 0], [20, 5, 5]), [plate([40, -5, 20], [60, 5, 25])], { axis: 'x', travel: 60, step: 5 });
  t('a part above the travel is not a collision', none.first === null && none.maxV === 0, JSON.stringify(none));
}

/* 7. refusals carry the number that was wrong */
{
  t('one copy is refused with its count', S.asmPatternPlaces(plate([0, 0, 0], [1, 1, 1]), { count: 1 }).refuse === 'count');
  t('more than 64 copies is refused with its count', S.asmPatternPlaces(plate([0, 0, 0], [1, 1, 1]), { count: 99 }).refuse === 'max');
  t('a zero pitch is refused', S.asmPatternPlaces(plate([0, 0, 0], [1, 1, 1]), { count: 3, dx: 0, dy: 0 }).refuse === 'pitch');
  t('a mate with no holes is refused', S.asmMateSolve({ lowerTop: 4, upperLocalBottom: 0 }).refuse === 'holes');
  const c = S.asmCollide(R, plate([0, 0, 0], [1, 1, 1]), [], { axis: 'x', travel: 0, step: 5 });
  t('a collision journey of 0 mm is refused with its travel', c.refuse === 'travel' && c.travel === 0, JSON.stringify(c));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
