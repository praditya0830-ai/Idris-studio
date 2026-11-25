/* S21j: Delete Face — Batch 6, the last kernel tool of the batch. The picked face leaves the body, the opening it
 * leaves is patched by the kernel's own filling builder (BRepOffsetAPI_MakeFilling) from the opening's boundary, the
 * remaining faces and the patch are sewn back (BRepBuilderAPI_Sewing) and made a solid again
 * (BRepBuilderAPI_MakeSolid); the step only exists if the result passes BRepCheck_Analyzer.
 *
 *   * deleting the top face of a 40 × 30 × 20 box removes 1 200 mm² and the kernel's patch of that opening is
 *     1 200 mm² too, so the healed body is a valid 6-face solid of 24 000 mm³ again — both volumes measured;
 *   * the step is a normal step in the tree: replaying the same body without it gives the untouched box, and
 *     replaying it twice gives the same numbers, because buildPart rebuilds from the features;
 *   * a face index that is not on the body is refused with the face count;
 *   * a face with an opening inside it (the top of a box with a through hole has two boundary loops) is refused,
 *     because patching only the outer loop would cover the hole;
 *   * a boundary the kernel cannot fill (the barrel of a cylinder: the seam splits it into three edges) is refused
 *     by the kernel's own failure, and nothing is deleted.
 *
 *   node tests/s21j-delface.test.mjs
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
const jStart = html.indexOf('/* ---- S21j: Delete Face.');
const jEnd = html.indexOf('/* ---- end S21j helpers ---- */');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, gStart, gEnd, hStart, hEnd, iStart, iEnd, jStart, jEnd, tAt].some((x) => x < 0) || bEnd < bStart || gEnd < gStart || hEnd < hStart || iEnd < iStart || jEnd < jStart) {
  throw new Error('the S21g/S21h/S21i/S21j block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(gStart, gEnd)}\n${html.slice(hStart, hEnd)}\n${html.slice(iStart, iEnd)}\n${html.slice(jStart, jEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21jDelete };` )(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const pt = (p) => (Array.isArray(p) ? p.map(Number) : p && typeof p.toTuple === 'function' ? p.toTuple() : [p && p.x, p && p.y, p && p.z]);
const digits = (x) => String(x).replace(/[^0-9.]/g, '');

/* the box the feature builds, so the face index is the one buildPart will see: face 5 is the z = 20 top */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const top = ref.faces.map((fc, i) => ({ fc, i })).find((x) => Math.abs(pt(x.fc.boundingBox.center)[2] - 20) < 1e-6 && R.measureArea(x.fc) > 1000);
ok(top, 'the reference box has no top face');
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const del = (face = top.i) => ({ id: 'd1', type: 'delface', p: { face } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };

await check('the top face of the box is deleted and its 1 200 mm² opening is patched back into a valid 24 000 mm³ solid', async () => {
  const { r, features } = await run([box(), del()]);
  const ft = features[1];
  ok(!ft.err, 'the delete step failed: ' + ft.err);
  ok(ft.del, 'the step records no measurements: ' + JSON.stringify(ft));
  eq(ft.del.areaRemoved, 1200, 1e-6, 'removed area');
  eq(ft.del.areaPatch, 1200, 1e-6, 'patch area');
  eq(ft.del.volBefore, 24000, 1e-6, 'volume before');
  eq(ft.del.volAfter, 24000, 1e-3, 'volume after');
  ok(ft.del.faces === 6, 'the healed body is not six faces: ' + ft.del.faces);
  eq(R.measureVolume(r.body), 24000, 1e-3, 'the body in the part');
  const an = new oc.BRepCheck_Analyzer(r.body.wrapped, true, false);
  const good = an.IsValid_2 ? an.IsValid_2() : an.IsValid_1 ? an.IsValid_1() : an.IsValid();
  ok(good, 'the kernel says the healed body is not valid');
  ok(digits(ft.note).includes('1200'), 'the note does not carry the removed/patch area: ' + JSON.stringify(ft.note));
  ok(digits(ft.note).includes('24'), 'the note does not carry the volume: ' + JSON.stringify(ft.note));
});

await check('the step is in the tree: replaying the same body without it leaves the untouched box', async () => {
  const { r, features } = await run([box()]);
  ok(features.length === 1 && !features[0].err, 'the box itself failed to build: ' + JSON.stringify(features[0]));
  ok(r.body.faces.length === 6, 'the untouched box is not six faces: ' + r.body.faces.length);
  eq(R.measureVolume(r.body), 24000, 1e-6, 'untouched volume');
});

await check('replaying the delete step twice gives the same body and the same numbers', async () => {
  const a = await run([box(), del()]);
  const b = await run([box(), del()]);
  ok(!a.features[1].err && !b.features[1].err, 'a rebuild failed: ' + (a.features[1].err || b.features[1].err));
  eq(a.features[1].del.volAfter, b.features[1].del.volAfter, 1e-9, 'volume after on the second build');
  eq(a.features[1].del.areaPatch, b.features[1].del.areaPatch, 1e-9, 'patch area on the second build');
});

await check('a face index that is not on the body is refused with the face count', async () => {
  const { features } = await run([box(), del(99)]);
  const err = features[1].err || '';
  ok(/is not on this body/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/6 faces/.test(err), 'the refusal does not carry the face count: ' + JSON.stringify(err));
});

await check('delete with no solid body before it is refused', async () => {
  const { features } = await run([del()]);
  ok(/needs a solid body/i.test(features[0].err || ''), 'no refusal: ' + JSON.stringify(features[0].err));
});

await check('a face with an opening inside it is refused instead of covering the hole', async () => {
  /* the top of a box with a 20 mm through hole has two boundary loops: the outer rectangle and the hole */
  const holed = R.makeBox([0, 0, 0], [40, 30, 20]).cut(R.makeCylinder(10, 40, [20, 15, -5], [0, 0, 1]));
  const k = holed.faces.map((fc, i) => ({ fc, i })).find((x) => Math.abs(pt(x.fc.boundingBox.center)[2] - 20) < 1e-6 && R.measureArea(x.fc) > 500).i;
  let threw = '';
  try { build.s21jDelete(R, holed, k); } catch (e) { threw = e.message; }
  ok(/boundary loops/i.test(threw), 'no refusal: ' + JSON.stringify(threw));
  ok(/2 boundary loops/.test(threw), 'the refusal does not carry the loop count: ' + JSON.stringify(threw));
  eq(R.measureVolume(holed), 24000 - Math.PI * 100 * 20, 1, 'the refused body was modified');
});

await check('a boundary the kernel cannot fill is refused, and nothing is deleted', async () => {
  /* the cylinder's barrel is one face bounded by the seam: the kernel's filling builder throws on that loop */
  const cyl = R.makeCylinder(20, 30, [0, 0, 0], [0, 0, 1]);
  const barrel = cyl.faces.map((fc, i) => ({ fc, i })).find((x) => R.measureArea(x.fc) > 3000).i;
  let threw = '';
  try { build.s21jDelete(R, cyl, barrel); } catch (e) { threw = e.message; }
  ok(/could not patch the opening/i.test(threw), 'no refusal: ' + JSON.stringify(threw));
  eq(R.measureVolume(cyl), Math.PI * 400 * 30, 1, 'the refused body was modified');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
