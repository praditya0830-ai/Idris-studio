/* S22: the tools that stopped being "planned" in this batch, tested on the code that ships.
 *
 *   Gear Rating ISO 6336 · Thermal · Parameters · Configurations · Import STEP · Dimensions & Notes ·
 *   Export PDF / DXF
 *
 * What is checked here is real, not structural where a number can be had:
 *   * a parameter drives two feature fields, changing it changes the kernel's volume (a^3);
 *   * three configurations of the same part give three different kernel volumes;
 *   * a field that names an undeclared parameter is an error on that step, and no volume is invented;
 *   * a 10 mm cube written as STEP and read back through stepImportInfo is 1000 mm3;
 *   * every activated tool is 'on' in the ribbon and routes to a handler that exists;
 *   * no chip or tooltip says "Mark 1" or "gearbox".
 *
 *   node tests/s22-activation.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

const pAt = html.indexOf('const PARAM_NAME =');
const pEnd = html.indexOf('const FEAT = {');
const bAt = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const hAt = html.indexOf('function stepBytes(b64)');
const hEnd = html.indexOf('\nfunction importStepTool()');
const p1At = html.indexOf('/* ---- P1a:');
const p1End = html.indexOf('/* ---- end P1c helpers */');
const tapAt = html.indexOf('const TAP = {');
const tapEnd = html.indexOf('};', tapAt) + 2;
const pitchAt = html.indexOf('const M_PITCH = {');
const pitchEnd = html.indexOf('};', pitchAt) + 2;
const kAt = html.indexOf('const K_DEFAULT = {');
const kEnd = html.indexOf('};', kAt) + 2;
const fxAt = html.indexOf('function smFlatDxf(model) {');
const fxEnd = html.indexOf('\n}\n', fxAt) + 3;
for (const [n, a, b] of [['params', pAt, pEnd], ['buildPart', bAt, bEnd], ['step helpers', hAt, hEnd], ['P1a', p1At, p1End], ['TAP', tapAt, tapEnd], ['M_PITCH', pitchAt, pitchEnd], ['K_DEFAULT', kAt, kEnd], ['smFlatDxf', fxAt, fxEnd]]) {
  if (a < 0 || b < 0 || b <= a) throw new Error(n + ' block not found in index.html');
}

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);

/* the field kinds resolveParams needs; the full FEAT table drags in form builders this test does not run */
const FEAT_STUB = `const FEAT = {
  shape: { fields: [{ k: 'kind', t: 'sel' }, { k: 'L', t: 'num' }, { k: 'W', t: 'num' }, { k: 'H', t: 'num' }, { k: 'D', t: 'num' }, { k: 'Di', t: 'num' }, { k: 'x', t: 'num' }, { k: 'y', t: 'num' }, { k: 'z', t: 'num' }, { k: 'op', t: 'sel' }] },
  hole: { fields: [{ k: 'type', t: 'sel' }, { k: 'D', t: 'num' }, { k: 'x', t: 'num' }, { k: 'y', t: 'num' }, { k: 'depth', t: 'num' }, { k: 'cbD', t: 'num' }, { k: 'cbH', t: 'num' }, { k: 'M', t: 'sel' }, { k: 'series', t: 'sel' }, { k: 'depthMode', t: 'sel' }] },
};\n`;
const src = [FEAT_STUB, html.slice(pAt, pEnd), html.slice(tapAt, tapEnd), html.slice(pitchAt, pitchEnd), html.slice(kAt, kEnd),
  html.slice(fxAt, fxEnd), html.slice(p1At, p1End), html.slice(bAt, bEnd), html.slice(hAt, hEnd)].join('\n');
const M = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${src}\nreturn { buildPart, resolveParams, paramScope, paramEval, paramField, stepImportInfo, bytesStep, stepBytes };`)(
  async () => R, L, async () => null, {}, f);

let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const acheck = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what || 'value'}: ${a} vs ${b} (±${tol})`); };
const feat = (type, p, id) => ({ type, p, id: id || type + Math.random().toString(36).slice(2) });

/* the ribbon as it ships */
const tAt = html.indexOf('const T = (n, ic, st'), tEnd = html.indexOf('const RIB_ALL = ', tAt);
const { RIBBON } = new Function(`${html.slice(tAt, tEnd)}\nreturn { RIBBON };`)();
const tool = (n) => RIBBON.flatMap((r) => r[3]).flatMap((g) => g[1]).find((t) => t.n === n);

console.log('\nBatch A/B/C · the ribbon');

for (const [name, act] of [['Gear Rating ISO 6336', 'gearCalc'], ['Thermal', 'thermCalc'], ['Parameters', 'paramTool'],
  ['Configurations', 'configTool'], ['Import STEP', 'impStep'], ['Dimensions & Notes', 'dwgNotes'], ['Export PDF / DXF', 'expPdf']]) {
  check(`${name} is an ordinary active tool that routes to ${act}`, () => {
    const t = tool(name);
    ok(t, name + ' is not in the ribbon');
    ok(t.st === 'on', `${name} status is ${t.st}`);
    ok(t.act === act, `${name} act is ${String(t.act)}`);
  });
  check(`${name} has a handler in ribAct`, () => {
    ok(new RegExp(`a === '${act}'`).test(html), `ribAct has no branch for ${act}`);
  });
}

check('no chip or tooltip names a product phase or a machine type', () => {
  const a = html.indexOf('const RIB_ST = {'), b = html.indexOf('const RI = {', a);
  const st = html.slice(a, b);
  ok(!/Mark 1/.test(st), 'RIB_ST still says Mark 1');
  ok(!/Gearbox/.test(st), 'RIB_ST still has a Gearbox label');
  const rw = html.indexOf('function ribWhy(t) {');
  const body = html.slice(rw, html.indexOf('\n}\n', rw));
  ok(!/Mark 1|gearbox/i.test(body), 'ribWhy still names Mark 1 or gearbox: ' + body);
});

console.log('\nBatch A · Parameters and Configurations');

check('a field that names a parameter resolves to the parameter value', () => {
  const p = { params: [{ name: 'a', value: 10 }], features: [feat('shape', { kind: 'box', L: 'a', W: 'a', H: 'a' })] };
  const q = M.resolveParams(p.features[0].p, M.paramScope(p), 'shape');
  ok(q.L === 10 && q.W === 10 && q.H === 10, JSON.stringify(q));
});

check('an expression over parameters resolves (`a*2`, `a-4`)', () => {
  const p = { params: [{ name: 'a', value: 10 }] };
  ok(M.paramEval('a*2', M.paramScope(p)) === 20, 'a*2');
  ok(M.paramEval('a-4', M.paramScope(p)) === 6, 'a-4');
  ok(M.paramEval('(a+2)/3', M.paramScope(p)) === 4, '(a+2)/3');
});

check('an undeclared name is an error that names it, not a silent 0 mm', () => {
  let msg = '';
  try { M.paramEval('nope*2', { a: 10 }); } catch (e) { msg = e.message; }
  ok(/nope/.test(msg), 'message was: ' + msg);
});

await acheck('one parameter used by two steps: 10 mm → 1000 mm3, 20 mm → 8000 mm3 (kernel)', async () => {
  const p = { name: 'P', material: 'steel', params: [{ name: 'a', value: 10 }],
    features: [feat('shape', { kind: 'box', L: 'a', W: 'a', H: 'a', x: 0, y: 0, z: 0, op: 'add' }),
      feat('hole', { type: 'simple', D: 'a/2', depthMode: 'thru', x: 0, y: 0 })], configs: [] };
  const out1 = await M.buildPart(p);
  ok(out1.body, 'the box did not build: ' + (p.features[0].err || p.features[1].err || ''));
  const v1 = R.measureVolume(out1.body);
  /* box a^3 minus a through hole of diameter a/2 through the a-high box: r = a/4, h = a */
  near(v1, 1000 - Math.PI * 2.5 * 2.5 * 10, 1e-6, 'volume at a=10');
  p.params[0].value = 20;
  const out2 = await M.buildPart(p);
  const v2 = R.measureVolume(out2.body);
  near(v2, 8000 - Math.PI * 5 * 5 * 20, 1e-6, 'volume at a=20');
  ok(p.features.every((x) => !x.err), 'a step reported an error: ' + p.features.map((x) => x.err).filter(Boolean).join('; '));
});

await acheck('three configurations of the same part give three kernel volumes', async () => {
  const p = { name: 'P', material: 'steel', params: [{ name: 'a', value: 10 }],
    features: [feat('shape', { kind: 'box', L: 'a', W: 'a', H: 'a', x: 0, y: 0, z: 0, op: 'add' })],
    configs: [{ name: 'S', values: { a: 10 } }, { name: 'M', values: { a: 20 } }, { name: 'L', values: { a: 30 } }] };
  const vols = [];
  for (const c of p.configs) { p.params[0].value = c.values.a; const out = await M.buildPart(p); vols.push(R.measureVolume(out.body)); }
  near(vols[0], 1000, 1e-6, 'S');
  near(vols[1], 8000, 1e-6, 'M');
  near(vols[2], 27000, 1e-6, 'L');
});

await acheck('an undeclared parameter in a field stops that step and invents no volume', async () => {
  const p = { name: 'P', material: 'steel', params: [{ name: 'a', value: 10 }],
    features: [feat('shape', { kind: 'box', L: 'nope', W: 'a', H: 'a', x: 0, y: 0, z: 0, op: 'add' })] };
  const out = await M.buildPart(p);
  ok(!out.body, 'a body was built from an undeclared name');
  ok(/nope/.test(String(p.features[0].err)), 'the step did not name the missing parameter: ' + p.features[0].err);
});

console.log('\nBatch B · Import STEP');

await acheck('a 10 mm cube written as STEP reads back as 1000 mm3', async () => {
  const cube = R.makeBox([0, 0, 0], [10, 10, 10]);
  const blob = cube.blobSTEP ? cube.blobSTEP() : R.exportSTEP(cube);
  const buf = await blob.arrayBuffer();
  ok(buf.byteLength > 0, 'the STEP blob is empty');
  const info = await M.stepImportInfo(R, { name: 'cube.step', arrayBuffer: async () => buf });
  near(info.vol, 1000, 1e-6, 'imported volume');
  near(info.area, 600, 1e-6, 'imported area');
  near(info.size[0], 10, 1e-9, 'size X');
  ok(info.b64.length > 0, 'the STEP text was not kept with the part');
  const back = await R.importSTEP(new Blob([M.stepBytes(info.b64)]));
  near(R.measureVolume(back), 1000, 1e-6, 'volume from the kept STEP');
});

await acheck('a part that carries an imported STEP builds that body, not a feature tree', async () => {
  const cube = R.makeBox([0, 0, 0], [10, 10, 10]);
  const blob = cube.blobSTEP ? cube.blobSTEP() : R.exportSTEP(cube);
  const b64 = M.bytesStep(await blob.arrayBuffer());
  const out = await M.buildPart({ name: 'cube', material: 'steel', features: [], step: { b64, name: 'cube.step' } });
  near(R.measureVolume(out.body), 1000, 1e-6, 'volume of the imported part');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
