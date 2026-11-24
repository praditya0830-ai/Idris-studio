/* S21h: Trim Surface — Batch 6, the second surface tool built on the kernel's own algorithms
 * (BRepAlgoAPI_Splitter with a face made on the picked face's plane, through R.getOC()).
 *
 *   * a 32 000 mm² planar surface cut by the plane of the box's +X face keeps 12 800 mm² on the normal side;
 *   * the other side keeps the other 19 200 mm², and the two halves add up to the area before the cut;
 *   * the step writes both numbers (kept area and area before) into its note, from the kernel's measurements;
 *   * a trim with no surface before it is refused, and a face index that is not on the body is refused by name.
 *
 *   node tests/s21h-trim.test.mjs
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
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, gStart, gEnd, hStart, hEnd, tAt].some((x) => x < 0) || bEnd < bStart || gEnd < gStart || hEnd < hStart) {
  throw new Error('the S21g/S21h block or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(gStart, gEnd)}\n${html.slice(hStart, hEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21gFill, s21hTrim, s21hPlaneOf };`)(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const pt = (v) => (Array.isArray(v) ? v : v && typeof v.toTuple === 'function' ? v.toTuple() : [v && v.x, v && v.y, v && v.z]);

/* the box the feature builds (40 x 30 x 20 at the origin) and a 200 x 160 planar surface on z = 0, which the box's
   +X face plane (x = 20) really cuts: the kept half is 80 x 160 = 12 800 mm² and the other is 120 x 160 = 19 200 mm² */
const ref = R.makeBox([-20, -15, 0], [20, 15, 20]);
const xFace = ref.faces.map((fc, i) => ({ i, fc })).find((x) => x.fc.geomType === 'PLANE' && Math.abs(pt(x.fc.boundingBox.center)[0] - 20) < 1e-6);
ok(xFace, 'the reference box has no +X face');
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 40, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const sketch = () => ({ id: 's1', type: 'sketch', p: { prof: 'rect', W: 200, Hh: 160, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 } });
const plane = () => ({ id: 'p1', type: 'surfplane', p: { sketch: 's1' } });
const trim = (keep, face = xFace.i) => ({ id: 't1', type: 'surftrim', p: { keep, face } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };
const totalArea = (r) => (r.surfs || []).reduce((a, s) => a + R.measureArea(s), 0);
const digits = (x) => String(x).replace(/[^0-9.]/g, '');

await check('a 32 000 mm² planar surface cut at x = 20 keeps 12 800 mm² on the picked face normal side', async () => {
  const { r, features } = await run([sketch(), plane(), box(), trim('positive')]);
  ok(!features[3].err, 'the trim step failed: ' + features[3].err);
  eq(totalArea(r), 12800, 1e-6, 'kept area');
  ok(digits(features[3].note).includes('12800'), 'the note does not carry the kept area: ' + JSON.stringify(features[3].note));
  ok(digits(features[3].note).includes('32000'), 'the note does not carry the area before the cut: ' + JSON.stringify(features[3].note));
});

await check('the other side keeps the other half: 19 200 mm²', async () => {
  const { r, features } = await run([sketch(), plane(), box(), trim('negative')]);
  ok(!features[3].err, 'the trim step failed: ' + features[3].err);
  eq(totalArea(r), 19200, 1e-6, 'kept area on the other side');
});

await check('the kept pieces add up to the area before the cut: none is lost', async () => {
  const a = (await run([sketch(), plane(), box(), trim('positive')])).r;
  const b = (await run([sketch(), plane(), box(), trim('negative')])).r;
  eq(totalArea(a) + totalArea(b), 32000, 1e-6, 'both halves together');
});

await check('a trim with no surface before it is refused', async () => {
  const { features } = await run([box(), trim('positive')]);
  ok(/needs a surface/i.test(features[1].err || ''), 'no refusal: ' + JSON.stringify(features[1].err));
});

await check('a face index that is not on the body is refused', async () => {
  const { features } = await run([sketch(), plane(), box(), trim('positive', 99)]);
  ok(/is not on the body/i.test(features[3].err || ''), 'no refusal: ' + JSON.stringify(features[3].err));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
