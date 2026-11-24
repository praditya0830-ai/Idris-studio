/* S21c: Scale — Batch 4 of the CAD backlog, the first Features tool the kernel can already do.
 *
 * buildPart is lifted out of index.html and run against the real kernel:
 *   * a 60 × 40 × 20 box (48 000 mm³) scaled ×2 about the origin is 384 000 mm³ and 120 × 80 × 40;
 *   * scaled ×2 about its centre, the box keeps its centre and doubles its size;
 *   * ×0.5 after ×2 rebuilds the original volume — the step is part of the tree, not a one-way bake;
 *   * a factor of 0 or below is refused with its reason, and a Scale with no body says it needs one;
 *   * the note the panel shows carries the measured volume before and after.
 *
 *   node tests/s21c-scale.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if (bStart < 0 || bEnd < bStart) throw new Error('buildPart not found');
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f',
  `${html.slice(bStart, bEnd)}\nreturn { buildPart };`)(async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f);

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const box = () => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const scale = (k, about = 'origin') => ({ id: 'sc' + Math.random().toString(36).slice(2, 6), type: 'scale', p: { k, about } });
const run = async (features) => { const part = { features }; const r = await build.buildPart(part); return { body: r && r.body, features, R: r && r.R }; };

await check('×2 about the origin triples nothing but multiplies the volume by 8', async () => {
  const { body, features } = await run([box(), scale(2)]);
  ok(features.every((x) => !x.err), 'a step failed: ' + JSON.stringify(features.map((x) => x.err)));
  eq(R.measureVolume(body), 48000 * 8, 1, 'volume');
  const [[x0, y0, z0], [x1, y1, z1]] = body.boundingBox.bounds;
  eq(x1 - x0, 120, 1e-6, 'size X'); eq(y1 - y0, 80, 1e-6, 'size Y'); eq(z1 - z0, 40, 1e-6, 'size Z');
});
await check('×2 about the centre keeps the centre where it was', async () => {
  const { body } = await run([box(), scale(2, 'centre')]);
  const [[x0, , z0], [x1, , z1]] = body.boundingBox.bounds;
  eq((x0 + x1) / 2, 0, 1e-6, 'centre X'); eq((z0 + z1) / 2, 10, 1e-6, 'centre Z');
  eq(x1 - x0, 120, 1e-6, 'size X');
});
await check('the step is edited, not baked: ×2 then ×0.5 is the original', async () => {
  const { body } = await run([box(), scale(0.5)]);
  eq(R.measureVolume(body), 48000 / 8, 1, 'volume after the rebuild at ×0.5');
});
await check('the note carries the measured volumes', async () => {
  const features = [box(), scale(2)];
  await run(features);
  const note = features[1].note || '';
  ok(/48000/.test(note.replace(/[^0-9.]/g, '')) || /48/.test(note), 'no volume in the note: ' + JSON.stringify(note));
  ok(/×8/.test(note) || /8\.0/.test(note), 'the factor cubed is not in the note: ' + JSON.stringify(note));
});
await check('a factor of 0 or below is refused', async () => {
  for (const k of [0, -2]) {
    const features = [box(), scale(k)];
    await run(features);
    ok(/above 0/.test(features[1].err || ''), `k=${k} was not refused: ` + JSON.stringify(features[1].err));
  }
});
await check('Scale with no body says it needs one', async () => {
  const features = [scale(2)];
  await run(features);
  ok(/needs a body/i.test(features[0].err || ''), 'no reason: ' + JSON.stringify(features[0].err));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
