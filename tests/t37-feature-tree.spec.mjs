/* 2e: a feature recipe from the solver opens as a real, editable part (not "the AI sent no CAD code").
 * 2c: a step the kernel refuses is reported with its own sentence, and repairing it keeps the rest of the part.
 *
 * The /chat answers are stubbed; the part is built by the real OpenCascade kernel in the page.
 *
 *   BASE_URL=http://127.0.0.1:3021 VP=1366x768 node tests/t37-feature-tree.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const nums = (thick) => ([
  { k: 'length_mm', value: 100, unit: 'mm', source: 'you' },
  { k: 'thickness_mm', value: thick, unit: 'mm', source: 'computed', method: 't = 0.75 d', from_: ['hole_d_mm'] },
  { k: 'bolt', value: 8, unit: 'mm', source: 'table:ISO 273', assumed: true },
]);
const steps = (holeD) => ([
  { id: 'base', type: 'sketch', p: { prof: 'rect', W: 100, Hh: 60, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 } },
  { id: 'body', type: 'push', p: { sketch: 'base', dist: 8, op: 'add' } },
  { id: 'hole1', type: 'hole', p: { D: holeD, x: 20, y: 20, depthMode: 'thru' } },
]);
const answer = (tree, numbers) => ({
  success: true, intent: 'design', answer: 'A mounting plate as feature steps.', provider: 'test',
  cad: { title: 'Mounting plate', kind: 'functional', material: 'steel', params: [], code: null,
    read_by: 'IDRIS feature recipe (validated)', feature_tree: tree, numbers, missing: [] },
  fidelity: 'features', rung: 'features', validated: false, numbers,
});

let reply = answer(steps(8), nums(8));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push('console: ' + t.slice(0, 180)); });
await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }));
await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const hm = document.querySelector('#home'); if (hm) hm.hide ? hm.hide() : hm.remove(); document.body.classList.remove('at-home'); });
const send = async (text) => { await page.fill('#inp', text); await page.click('#send'); await page.waitForTimeout(1200); };
const tree = () => page.evaluate(() => ({
  steps: [...document.querySelectorAll('#cadLeft ol.pft li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
  off: document.querySelectorAll('#cadLeft ol.pft li.off').length,
  failed: (document.querySelector('#treeFailed') || {}).innerText || '',
  src: (document.querySelector('#treeSources') || {}).innerText || '',
  props: (document.querySelector('#cadProps') || {}).innerText || '',
  info: window.__idris.partInfo() || null,
  name: (window.__idris.state.part || {}).name || '',
  refused: (document.querySelector('#treeRefused') || {}).innerText || '',
}));

await send('mounting plate 100x60x8 steel');
await page.waitForSelector('#treeSources', { timeout: 60000 });
await page.waitForTimeout(800);
let t = await tree();

check('the recipe answer opens as a part with a feature tree', () => {
  ok(t.info, 'the part did not build: ' + t.failed);
  ok(Math.abs(t.info.size[0] - 100) < 0.01 && Math.abs(t.info.size[1] - 60) < 0.01 && Math.abs(t.info.size[2] - 8) < 0.01,
    'size ' + JSON.stringify(t.info.size));
  ok(t.steps.length === 3, 'steps: ' + JSON.stringify(t.steps));
});
check('every step carries the solver feature name and its numbers', () => {
  ok(/Sketch/.test(t.steps[0]) && /Rectangle 100×60/.test(t.steps[0]), t.steps[0]);
  ok(/Push\/Pull/.test(t.steps[1]) && /8 mm/.test(t.steps[1]), t.steps[1]);
  ok(/Hole/.test(t.steps[2]) && /Ø8/.test(t.steps[2]), t.steps[2]);
});
check('every number keeps the source the solver attached', () => {
  ok(/you gave it/.test(t.src), 'no "you gave it" in: ' + t.src);
  ok(/computed: t = 0\.75 d \(from hole_d_mm\)/.test(t.src), 'no computed method in: ' + t.src);
  ok(/table:ISO 273 — assumed, confirm it/.test(t.src), 'no table row in: ' + t.src);
});

reply = answer(steps(0), nums(8));
await send('same plate, hole with no diameter');
await page.waitForSelector('#treeFailed', { timeout: 60000 });
t = await tree();

check('a step the kernel refuses is reported with its own sentence', () => {
  ok(/3\. Hole/.test(t.failed), 'failed card: ' + t.failed);
  ok(/above 0 mm/.test(t.failed), 'the kernel sentence is missing: ' + t.failed);
  ok(/kept/.test(t.failed), 'the card does not say the earlier steps are kept');
});
check('the part is still there, built up to the failed step', () => {
  ok(t.info && Math.abs(t.info.size[2] - 8) < 0.01, 'part after the failure: ' + JSON.stringify(t.info && t.info.size));
});

await page.evaluate(() => [...document.querySelectorAll('#treeFailed button')].find((b) => /Fix this step/.test(b.textContent)).click());
await page.waitForTimeout(500);
t = await tree();
check('fixing the step opens that step, with the kernel sentence in the panel', () => {
  ok(/This step failed/.test(t.props), 'properties panel: ' + t.props.slice(0, 300));
  ok(/above 0 mm/.test(t.props), 'no sentence in the panel: ' + t.props.slice(0, 300));
});

await page.evaluate(() => [...document.querySelectorAll('#treeFailed button')].find((b) => /Skip it/.test(b.textContent)).click());
await page.waitForTimeout(1500);
t = await tree();
check('skipping one step keeps the rest of the part', () => {
  ok(!t.failed, 'the failed card is still there: ' + t.failed);
  ok(t.off === 1, 'suppressed steps: ' + t.off);
  ok(t.info && Math.abs(t.info.size[0] - 100) < 0.01, 'the part went away: ' + JSON.stringify(t.info && t.info.size));
});

reply = answer([{ id: 'base', type: 'sketch', p: { prof: 'rect', W: 100, Hh: 60, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 } },
  { id: 'spiral', type: 'helix', p: { D: 10, H: 20 } }], nums(8));
await send('plate with a helix');
await page.waitForSelector('#treeRefused', { timeout: 60000 });
t = await tree();
check('a feature this build cannot make is refused by name, not swapped for a guess', () => {
  ok(/Step 2/.test(t.refused), 'refusal: ' + t.refused);
  ok(/“helix”/.test(t.refused), 'the step type is not named: ' + t.refused);
  ok(/Nothing was replaced by a guess/.test(t.refused), 'no promise against guessing: ' + t.refused);
  ok(t.name === 'Mounting plate', 'the previous part was replaced anyway: ' + t.name);
});
check('no JavaScript errors on the page', () => ok(!errors.length, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP[0]}×${VP[1]})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
