/* S3: Export SolidWorks macro asks /model/validate first, and never downloads a macro for a graph that failed.
 *
 * The solver is stubbed with page.route, so the test is about the Studio's order and its message:
 *   A  validate answers ok:false with a problem on f4 -> no download, the feature and the message are shown;
 *   B  validate answers ok, macro answers -> one .bas download, and the graph sent to the macro carries the
 *      off-centre sketch, the cut, the blind hole? (through hole here), the chamfer and the mirror.
 *
 *   BASE_URL=http://127.0.0.1:3013/index.html node tests/s3-macro-guard.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3013/index.html';
const OUT = process.env.OUT || 'docs';
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const TAG = process.env.TAG || '1366';
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

/* the model the Studio sends for the plate */
const PART = { id: 'plate', name: 'Plate', features: [
  { id: 'a', type: 'shape', p: { kind: 'box', L: 80, W: 50, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'b', type: 'sketch', p: { prof: 'circle', plane: 'XY', at: 'value', off: 10, u: 20, v: 5, D: 20 } },
  { id: 'c', type: 'push', p: { dist: 3, op: 'cut', both: 'one' } },
  { id: 'd', type: 'hole', p: { type: 'simple', D: 6, depthMode: 'thru', depth: 8, x: -20, y: 0 } },
  { id: 'e', type: 'edge', p: { mode: 'chamfer', r: 1, which: 'top' } },
  { id: 'f', type: 'repeat', p: { kind: 'mirror', plane: 'YZ', count: 2, dx: 0, dy: 0 } },
] };

let calls = [], sent = null, validateBody = null;
await page.route('**/model/validate', async (route) => {
  calls.push('validate'); validateBody = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await validateAnswer()) });
});
await page.route('**/exchange/solidworks-macro', async (route) => {
  calls.push('macro'); sent = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, filename: 'plate.bas', macro: "Attribute VB_Name = \"plate\"\nSub main()\nEnd Sub\n", translated: ['f1s', 'f1e', 'f2', 'f3', 'f4', 'f5', 'f6'], manual: [], not_executed: 'this macro has not been run in SolidWorks' }) });
});
let mode = 'fail';
const validateAnswer = async () => mode === 'fail'
  ? { success: true, ok: false, errors: ['hole.d: must be > 0, got 0'], problems: [{ feature: 'f4', op: 'hole', error: 'hole.d: must be > 0, got 0' }] }
  : { success: true, ok: true, errors: [], problems: [], model: (validateBody || {}).model };

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate((p) => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home');
  window.__idris.state.part = p; window.__idris.tools.startPart(p); }, PART);
await page.waitForTimeout(900);

console.log('\nA graph that fails /model/validate');
let downloaded = false;
page.once('download', () => { downloaded = true; });
await page.evaluate(() => window.__idris.tools.exportSWMacro());
await page.waitForTimeout(900);
const chat = await page.evaluate(() => document.querySelector('#chat').innerText);
check('validate ran and the macro route was not called', () => ok(calls.join(',') === 'validate', 'calls: ' + calls.join(',')));
check('no file was downloaded', () => ok(!downloaded, 'a download happened'));
check('the message names the failing feature and what is wrong', () => ok(/did not pass \/model\/validate/.test(chat) && /f4/.test(chat) && /must be > 0/.test(chat), chat.slice(-400)));
await page.screenshot({ path: `${OUT}/s3-validate-failed-${TAG}.png` });

console.log('\nA graph that passes');
mode = 'ok'; calls = []; downloaded = false;
page.once('download', () => { downloaded = true; });
await page.evaluate(() => window.__idris.tools.exportSWMacro());
await page.waitForTimeout(1200);
const chat2 = await page.evaluate(() => document.querySelector('#chat').innerText);
check('validate ran before the macro', () => ok(calls.join(',') === 'validate,macro', 'calls: ' + calls.join(',')));
check('the .bas file was downloaded', () => ok(downloaded, 'no download'));
check('the message says the graph passed validation', () => ok(/passed \/model\/validate/.test(chat2), chat2.slice(-300)));
const f = (sent && sent.model && sent.model.features) || [];
check('the graph sent to the macro has 7 translated steps', () => ok(f.length === 7 && f.every((x) => x.op !== 'not_translated'), JSON.stringify(f.map((x) => x.op))));
check('the off-centre sketch keeps cx 20 / cy 5', () => { const s2 = f.find((x) => x.op === 'sketch' && x.params.w === 20); ok(s2 && s2.params.cx === 20 && s2.params.cy === 5, JSON.stringify(s2)); });
check('the cut is op cut 3 mm', () => { const c = f.find((x) => x.op === 'extrude' && x.params.op === 'cut'); ok(c && c.params.distance === 3, JSON.stringify(c)); });
await page.screenshot({ path: `${OUT}/s3-macro-ok-${TAG}.png` });
check('the chamfer and the mirror are in the graph', () => { ok(f.some((x) => x.op === 'chamfer' && x.params.distance === 1), 'chamfer'); ok(f.some((x) => x.op === 'mirror' && x.params.plane === 'YZ'), 'mirror'); });

console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 6).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
