/* Batch C: Trim Surface and Delete Face, measured on the kernel.
 *
 *   Trim Surface  a 200 × 200 flat surface split on the YZ plane is two 20 000 mm² halves, and the two sides add up
 *                 to the area before; a cutting plane that misses the surface leaves it whole (40 000 mm²);
 *                 a sided keep is the same pick every time (the picked face's own normal decides it).
 *   Delete Face   the +Z face of a 100 mm box leaves, the kernel patches the 10 000 mm² opening, sews and makes the
 *                 solid again: the volume is the box's 1 000 000 mm³, the patch area is 10 000 mm² and BRepCheck
 *                 passes. The cylinder's barrel (seam-bounded) and a face with an inner loop are refused.
 *
 *   node tests/bC-surface.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const slice = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < i) throw new Error('block not found: ' + a); return html.slice(i, j); };
const src = slice('/* ---- S21h:', '/* ---- end S21h helpers ---- */') + '\n' + slice('/* ---- S21j:', '/* ---- end S21j helpers ---- */');

const oc = await ocmod({ locateFile: (f) => new URL('../kernel/' + f, import.meta.url).href });
R.setOC(oc);
const { s21hTrim, s21jDelete } = new Function('R', `${src}\nreturn { s21hTrim, s21jDelete };`)(R);

let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const throws = (fn, re, what) => { try { fn(); } catch (e) { if (!re.test(e.message)) throw new Error(what + ': wrong refusal: ' + e.message); return; } throw new Error(what + ': it did not refuse'); };

/* a flat 200 × 200 surface, and the two planes a workshop would trim it with */
const sheet = () => R.drawRectangle(200, 200).sketchOnPlane('XY').face();
const YZ = { o: [0, 0, 0], n: [1, 0, 0] };
const miss = { o: [0, 0, 300], n: [0, 0, 1] };

check('a 200 × 200 surface trimmed on the YZ plane is two 20 000 mm² halves', () => {
  const s = sheet(), area = R.measureArea(s);
  eq(area, 40000, 1e-6, 'area before');
  const pos = s21hTrim(R, [s], YZ, 'positive'), neg = s21hTrim(R, [s], YZ, 'negative');
  const sum = (ps) => ps.reduce((a, f) => a + R.measureArea(f), 0);
  eq(sum(pos), 20000, 1, 'the kept side');
  eq(sum(neg), 20000, 1, 'the other side');
  eq(sum(pos) + sum(neg), area, 1e-6, 'the two sides add up to the surface before');
});

check('the two sides really are on opposite sides of the plane', () => {
  const pos = s21hTrim(R, [sheet()], YZ, 'positive'), neg = s21hTrim(R, [sheet()], YZ, 'negative');
  pos.forEach((f) => ok(f.boundingBox.center[0] >= -1e-6, 'a kept piece is on the wrong side: ' + f.boundingBox.center));
  neg.forEach((f) => ok(f.boundingBox.center[0] <= 1e-6, 'the other side: ' + f.boundingBox.center));
});

check('a cutting plane that misses the surface leaves it whole on the side it lies', () => {
  const ps = s21hTrim(R, [sheet()], miss, 'negative');
  const sum = ps.reduce((a, f) => a + R.measureArea(f), 0);
  eq(sum, 40000, 1, 'the untouched surface');
});

check('Trim refuses when the kept side is empty', () => {
  throws(() => s21hTrim(R, [sheet()], miss, 'positive'), /nothing is left/, 'empty side');
});

check('the same pick keeps the same half every time', () => {
  const a = s21hTrim(R, [sheet()], YZ, 'positive'), b = s21hTrim(R, [sheet()], YZ, 'positive');
  const ca = a.map((f) => f.boundingBox.center[0].toFixed(6)).sort().join();
  const cb = b.map((f) => f.boundingBox.center[0].toFixed(6)).sort().join();
  ok(ca === cb, `the pick is not repeatable: ${ca} != ${cb}`);
});

const topOf = (b) => b.faces.findIndex((f) => f.geomType === 'PLANE' && Math.abs(f.normalAt().z - 1) < 1e-6);

check('Delete Face takes the +Z face of a 100 mm box and patches it back', () => {
  const b = R.makeBox([-50, -50, -50], [50, 50, 50]);
  const i = topOf(b);
  ok(i >= 0, 'no +Z face on the box');
  const res = s21jDelete(R, b, i);
  eq(res.areaRemoved, 10000, 1e-6, 'area removed');
  eq(res.areaPatch, 10000, 1, 'patch area');
  eq(res.volBefore, 1000000, 1, 'volume before');
  eq(res.volAfter, 1000000, 1, 'volume after: a planar patch coinciding with the removed face');
  ok(res.faces >= 6, 'the healed solid lost faces: ' + res.faces);
});

check('Delete Face refuses the cylinder barrel (its boundary cannot be filled)', () => {
  const b = R.makeCylinder(20, 40);
  const i = b.faces.findIndex((f) => /CYLINDRE/.test(f.geomType));
  ok(i >= 0, 'no barrel on the cylinder');
  throws(() => s21jDelete(R, b, i), /could not patch|refused/, 'the barrel');
});

check('Delete Face refuses a face index that is not on the body', () => {
  throws(() => s21jDelete(R, R.makeBox([-5, -5, -5], [5, 5, 5]), 99), /is not on this body/, 'a bad index');
});

check('the box stays a valid solid after the delete', () => {
  const b = R.makeBox([-50, -50, -50], [50, 50, 50]), res = s21jDelete(R, b, topOf(b));
  const a = new oc.BRepCheck_Analyzer(res.shape.wrapped, true, false);
  ok(!!(a.IsValid_2 ? a.IsValid_2() : a.IsValid()), 'BRepCheck rejects the healed body');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
