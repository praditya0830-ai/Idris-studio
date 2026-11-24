/* S21e: named Parameters and Configurations — Batch 5 of the CAD backlog (the batch that needs no kernel work).
 *
 * The S21e block and buildPart are lifted out of index.html and run against the real kernel:
 *   * a Box whose L field holds the name `L` builds with the parameter's value: L = 40 → 40 · 30 · 20 = 24 000 mm³;
 *   * changing the parameter rebuilds the same tree at 50 → 50 · 30 · 20 = 30 000 mm³, so the step was never baked;
 *   * a configuration that overrides L builds at its own size, and switching back is the original volume again;
 *   * a field that names a parameter the part does not define is refused BY THAT STEP, with the name, and the part
 *     does not silently build at 0 or NaN;
 *   * a parameter also drives an Extrude distance, so one number can drive two different tools.
 *
 *   node tests/s21e-params.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const eStart = html.indexOf('/* ---- S21e: named parameters.');
const eEnd = html.indexOf('/* ---- end S21e helpers ---- */');
const fAt = html.indexOf('const N = (k, en, id, unit, def');
const fStart = fAt;
const fEnd = html.indexOf('\n};', html.indexOf('const FEAT = {')) + 3;
const tAt = html.indexOf('const TAP = {');
const tStart = html.indexOf('{', tAt);
const tEnd = html.indexOf('};', tStart) + 1;
if ([bStart, bEnd, eStart, eEnd, fAt, fEnd, tAt].some((x) => x < 0) || bEnd < bStart || eEnd < eStart) {
  throw new Error('the S21e block, the FEAT table or buildPart is not where the test expects it in index.html');
}
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
/* FEAT is huge; only the field specs the resolution reads are needed, and the real FEAT is lifted from the page */
const featSrc = html.slice(fStart, fEnd);
const build = new Function('kernel', 'L', 'TAP', 'catClearance', 'state', 'f', 'FEAT',
  `${html.slice(eStart, eEnd)}\n${html.slice(bStart, bEnd)}\nreturn { buildPart, s21eResolve, s21eTable };`)(
  async () => R, L, new Function('return ' + html.slice(tStart, tEnd))(), async () => null, {}, f,
  new Function('TAP', 'L', `${featSrc}\nreturn FEAT;`)(new Function('return ' + html.slice(tStart, tEnd))(), L));

let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const box = (len) => ({ id: 'b1', type: 'shape', p: { kind: 'box', L: len, W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } });
const part = (features, extra = {}) => ({ name: 'P', features, params: {}, configs: [{ name: 'Default', params: {} }], config: 'Default', ...extra });
const run = async (p) => { const r = await build.buildPart(p); return { body: r && r.body, p }; };

await check('a field that names a parameter builds with its value: L = 40 → 24 000 mm³', async () => {
  const p = part([box('L')], { params: { L: 40 } });
  const { body } = await run(p);
  ok(body, 'no body: ' + JSON.stringify(p.features.map((x) => x.err)));
  eq(R.measureVolume(body), 40 * 30 * 20, 1, 'volume');
  ok(!p.features[0].err, 'the step failed: ' + p.features[0].err);
});

await check('changing the parameter rebuilds the tree: L = 50 → 30 000 mm³', async () => {
  const p = part([box('L')], { params: { L: 40 } });
  await run(p);
  p.params.L = 50;
  const { body } = await run(p);
  eq(R.measureVolume(body), 50 * 30 * 20, 1, 'volume after the change');
  eq(body.boundingBox.bounds[1][0] - body.boundingBox.bounds[0][0], 50, 1e-6, 'size X');
});

await check('a configuration overrides the parameter, and switching back restores the first build', async () => {
  const p = part([box('L')], { params: { L: 40 } });
  p.configs.push({ name: 'Big', params: { L: 60 } });
  p.config = 'Big';
  const big = await run(p);
  eq(R.measureVolume(big.body), 60 * 30 * 20, 1, 'volume in the Big configuration');
  p.config = 'Default';
  const def = await run(p);
  eq(R.measureVolume(def.body), 40 * 30 * 20, 1, 'volume back on Default');
});

await check('an undefined parameter is refused by the step, with the name', async () => {
  const p = part([box('Width')], { params: { L: 40 } });
  const { body } = await run(p);
  const err = p.features[0].err || '';
  ok(/Unknown parameter/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/Width/.test(err), 'the refusal does not name the parameter: ' + JSON.stringify(err));
  ok(!body, 'it built something anyway');
});

await check('one parameter drives two different tools (Box L and the Extrude distance)', async () => {
  const p = part([
    { id: 'sk', type: 'sketch', p: { prof: 'rect', plane: 'XY', at: 'value', off: 0, W: 'L', Hh: 20, u: 0, v: 0 } },
    { id: 'pu', type: 'push', p: { dist: 'H', op: 'add', both: 'one' } },
  ], { params: { L: 40, H: 12 } });
  const { body } = await run(p);
  ok(body, 'no body: ' + JSON.stringify(p.features.map((x) => x.err)));
  eq(R.measureVolume(body), 40 * 20 * 12, 1, 'volume');
});

await check('a numeric field is untouched by the parameter table', async () => {
  const p = part([box(35)], { params: { L: 40 } });
  const { body } = await run(p);
  eq(R.measureVolume(body), 35 * 30 * 20, 1, 'volume with a typed number');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
