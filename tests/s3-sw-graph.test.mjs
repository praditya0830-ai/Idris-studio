/* S3: the Studio feature tree → the SolidWorks macro graph, and the graph the macro route can take unchanged.
 *
 * Lifts the shipped `swGraph` out of index.html (like features.test.mjs lifts buildPart) and runs it on the UI
 * team's plate. With SOLVER_URL set it also posts the graph to a running solver: /model/validate must pass and
 * /exchange/solidworks-macro must translate every feature, with no not_translated left.
 *
 *   node tests/s3-sw-graph.test.mjs
 *   SOLVER_URL=http://127.0.0.1:8010 node tests/s3-sw-graph.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const START = 'function swGraph(p) {', END = '\nasync function exportSWMacro() {';
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0 || b < a) throw new Error('swGraph not found in index.html');
const src = html.slice(a, b);

const SW_AT = new WeakMap();
const partShape = { boundingBox: { bounds: [[0, 0, 0], [80, 50, 10]] } };
const TAP = { M3: 2.5, M4: 3.3, M5: 4.2, M6: 5.0, M8: 6.8, M10: 8.5, M12: 10.2, M16: 14.0 };
const L = (en) => en;
const swGraph = new Function('SW_AT', 'partShape', 'TAP', 'L', `${src}\nreturn swGraph;`)(SW_AT, partShape, TAP, L);

/* the UI team's plate: 80 x 50 x 10, an off-centre sketch (20, 5), a 3 mm cut, a blind 6 hole 8 deep,
 * a 1 mm chamfer and a mirror — everything the macro used to refuse */
const plate = { id: 'plate', features: [
  { id: 'a', type: 'shape', p: { kind: 'box', L: 80, W: 50, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'b', type: 'sketch', p: { prof: 'circle', plane: 'XY', at: 'top', off: 0, u: 20, v: 5, D: 20 } },
  { id: 'c', type: 'push', p: { dist: 3, op: 'cut', both: 'one' } },
  { id: 'd', type: 'hole', p: { type: 'simple', D: 6, depthMode: 'value', depth: 8, x: -20, y: 0 } },
  { id: 'e', type: 'edge', p: { mode: 'chamfer', r: 1, which: 'top' } },
  { id: 'f', type: 'repeat', p: { kind: 'mirror', plane: 'YZ', count: 2, dx: 0, dy: 0 } },
] };
SW_AT.set(plate.features[1], { s: plate.features[1].p, at: 10 });

const g = swGraph(plate), F = g.model.features;
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (x, y, what) => { const a = JSON.stringify(x), b = JSON.stringify(y); if (a !== b) throw new Error(`${what}: ${a} !== ${b}`); };
const ok = (c, what) => { if (!c) throw new Error(what); };

console.log('\nswGraph');
check('no feature is left untranslated', () => eq(F.filter((x) => x.op === 'not_translated').map((x) => x.id), [], 'not_translated'));
check('the ops follow the Studio tree', () => eq(F.map((x) => x.op), ['sketch', 'extrude', 'sketch', 'extrude', 'hole', 'chamfer', 'mirror'], 'ops'));
check('every step depends on the one before it', () => {
  for (let i = 1; i < F.length; i++) eq(F[i].deps, [F[i - 1].id], `deps of ${F[i].id}`);
});
const offSketch = F[2], cut = F[3], blind = F[4];
check('the off-centre sketch keeps its centre (cx 20, cy 5)', () => { eq(offSketch.params.cx, 20, 'cx'); eq(offSketch.params.cy, 5, 'cy'); eq(offSketch.params.w, 20, 'diameter'); eq(offSketch.params.offset, 10, 'offset'); });
check('the 3 mm cut is an extrude with op cut', () => { eq(cut.params.op, 'cut', 'op'); eq(cut.params.distance, 3, 'distance'); });
check('the blind hole carries depth 8 from the top face at z 10', () => { eq(blind.params.through, false, 'through'); eq(blind.params.depth, 8, 'depth'); eq(blind.params.from, 'top', 'from'); eq(blind.params.z_top, 10, 'z_top'); eq(blind.params.d, 6, 'd'); });
check('the chamfer is a chamfer, not a skip', () => { eq(F[5].op, 'chamfer', 'op'); eq(F[5].params.distance, 1, 'distance'); });
check('the mirror names its plane', () => { eq(F[6].op, 'mirror', 'op'); eq(F[6].params.plane, 'YZ', 'plane'); });
check('nothing is reported as untranslated in the Studio list', () => eq(g.local, [], 'local'));
check('the model is plain JSON with mm units', () => { eq(g.model.units, 'mm', 'units'); ok(JSON.parse(JSON.stringify(g.model)).features.length === 7, 'not JSON'); });

/* still refused, and stated: a tube has no macro mapping */
const tube = swGraph({ id: 't', features: [{ id: 'a', type: 'shape', p: { kind: 'tube', D: 20, d: 16, H: 30, x: 0, y: 0, z: 0, op: 'add' } }] });
check('a tube is still a stated not_translated, not a wrong feature', () => eq(tube.model.features.map((x) => x.op), ['not_translated'], 'ops'));

const URL_ = process.env.SOLVER_URL;
if (URL_) {
  console.log('\nreal solver');
  const post = async (path, body) => { const r = await fetch(URL_ + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, d: await r.json() }; };
  const v = await post('/model/validate', { model: g.model });
  check('/model/validate accepts the plate with 0 errors', () => { eq(v.status, 200, 'status'); eq(v.d.ok, true, 'ok'); eq(v.d.errors, [], 'errors'); eq(v.d.features, 7, 'features'); });
  const m = await post('/exchange/solidworks-macro', { name: 'plate', model: v.d.model || g.model });
  check('the macro translates every feature and skips none', () => { eq(m.status, 200, 'status'); eq(m.d.success, true, 'success'); eq(m.d.skipped, [], 'skipped'); eq(m.d.translated.length, 7, 'translated'); });
  check('the VBA structure check passed', () => eq(m.d.vba_check.ok, true, 'vba_check'));
  check('the answer still says it was not run in SolidWorks', () => ok(/not been run in SolidWorks/i.test(m.d.not_executed), 'not_executed: ' + m.d.not_executed));
  const lines = String(m.d.macro || m.d.vba || '').split('\n').filter((l) => /CreateCornerRectangle|CreateCircleByRadius|FeatureExtrusion2|FeatureCut4|InsertFeatureChamfer|InsertMirrorFeature2|AddDimension2/.test(l));
  console.log('  macro calls:\n    ' + lines.slice(0, 12).join('\n    '));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
