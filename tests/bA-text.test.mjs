/* Batch A: Sketch Text, measured in the kernel.
 *
 *   * "I" at 14 mm tall, 3 mm deep: 15 cells of 2 × 2 mm = 60 mm² profile, so 180 mm³, 10 × 14 × 3 mm;
 *   * "IDRIS" at 14 mm is 5 glyphs at a 6-cell pitch: 58 mm wide, and taller text is the same shape at another size;
 *   * a character the bundled font does not carry is refused by name, and so is an empty string;
 *   * a deboss removes exactly the profile × depth the kernel measured from the solid.
 *
 *   node tests/bA-text.test.mjs
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
  `${html.slice(bStart, bEnd)}\nreturn { buildPart, idrisTextRects };`)(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const text = (s, extra = {}) => ({ id: 'tx' + Math.random().toString(36).slice(2, 6), type: 'text', p: { s, h: 14, depth: 3, plane: 'XY', off: 0, u: 0, v: 0, op: 'add', ...extra } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { r, features }; };
const box = (Lx = 40, Wy = 40, Hz = 10) => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: Lx, W: Wy, H: Hz, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });

await check('"I" is 15 cells: 60 mm² × 3 mm = 180 mm³, 10 × 14 × 3 mm', async () => {
  const { r, features } = await run([text('I')]);
  ok(!features[0].err, 'step failed: ' + features[0].err);
  eq(R.measureVolume(r.body), 180, 0.5, 'volume');
  const [[x0, y0, z0], [x1, y1, z1]] = r.body.boundingBox.bounds;
  eq(x1 - x0, 10, 1e-6, 'width'); eq(y1 - y0, 14, 1e-6, 'height'); eq(z1 - z0, 3, 1e-6, 'depth');
  ok(/180/.test(String(features[0].note)), 'the note does not carry the measured volume: ' + features[0].note);
});

await check('"IDRIS" is a real fused profile 58 mm wide', async () => {
  const { r, features } = await run([text('IDRIS')]);
  ok(!features[0].err, 'step failed: ' + features[0].err);
  const [[x0], [x1]] = r.body.boundingBox.bounds;
  eq(x1 - x0, 58, 1e-6, 'width');
  ok(R.measureVolume(r.body) > 400, 'volume is not a word: ' + R.measureVolume(r.body));
  const { rects } = build.idrisTextRects('I', 14);
  const one = R.measureVolume(r.body);
  ok(one > R.measureVolume((await run([text('I')])).r.body), 'a word is not bigger than one letter');
});

await check('the height scales the same cell table (h = 7 halves the area)', async () => {
  const a = (await run([text('I')])).r.body, b = (await run([text('I', { h: 7 })])).r.body;
  eq(R.measureVolume(b) / R.measureVolume(a), 0.25, 1e-9, 'area ratio');
  const [[, y0], [, y1]] = b.boundingBox.bounds; eq(y1 - y0, 7, 1e-6, 'height');
});

await check('a character the bundled font does not carry is refused by name', async () => {
  const { features } = await run([text('A#B')]);
  ok(/#/.test(features[0].err || ''), 'no name in the refusal: ' + features[0].err);
  ok(/bundled font/.test(features[0].err || ''), 'the refusal does not say the font is bundled: ' + features[0].err);
});

await check('empty text is refused, and text needs nothing built before it', async () => {
  const { features } = await run([text('   ')]);
  ok(/Type the text/.test(features[0].err || ''), 'no refusal: ' + features[0].err);
});

await check('a deboss removes exactly the measured profile × depth', async () => {
  const { r, features } = await run([box(), text('I', { op: 'cut', u: -5, v: 0, depth: 2, off: 6 })]);
  ok(!features.every((x) => x.err), 'a step failed: ' + JSON.stringify(features.map((x) => x.err)));
  eq(R.measureVolume(r.body), 16000 - 60 * 2, 0.5, 'volume after the deboss');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
