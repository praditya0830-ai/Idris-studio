/* T36: the design ladder is visible, and a failed part is a report — never a box.
 *
 * Drives the real page with a mocked /chat:
 *   1. a code-rung answer shows the "Code (generated)" badge and the sizes table with their sources
 *      (you / computed with its method / table marked assumed);
 *   2. a failed answer shows the red report card: what IDRIS tried, the sizes it needs, what would help,
 *      and no design badge;
 *   3. the card offers the background job, and "send to feedback" only when a job is waiting.
 *
 *   BASE_URL=http://127.0.0.1:3031/index.html node tests/t36-design-ladder.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031/index.html';
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const CODE_ANSWER = {
  success: true, intent: 'discuss', answer: 'Here is the bracket.', provider: 'test', cad: {
    title: 'Bracket', kind: 'functional', material: 'steel', params: [], code: 'return { body: makeBox([0, 0, 0], [100, 60, 8]) };', expect: [] },
  fidelity: 'code', rung: 'code', validated: false,
  numbers: [{ k: 'length_mm', value: 100, unit: 'mm', source: 'you' },
    { k: 'thickness_mm', value: 6, unit: 'mm', source: 'computed', method: 't = 0.75*d (wall rule)', from: ['hole_d_mm'] },
    { k: 'bolt', value: 8, unit: 'mm', source: 'table:ISO 273', assumed: true }],
  not_checked: ['strength (FEA): this path runs no analysis'],
};
const FAILED_ANSWER = {
  success: true, intent: 'discuss', answer: 'I could not build this part.', cad: null, fidelity: null, rung: 'failed',
  design_report: { part_id: 'bracket', part_name: 'Mounting bracket', shape_class: 'prismatic',
    requested: { dims: { length_mm: 100 }, intent: 'bracket 100x60x8' },
    rungs_tried: [{ rung: 'features', error: 'fillet R20 mm is too big for this part' }, { rung: 'code', error: 'kernel: zero-length segment' }],
    missing_numbers: [{ k: 'thickness_mm', question: 'What value should I use for thickness mm?' }],
    suggestion: 'Give the missing size(s): thickness_mm.' },
  numbers: [], not_checked: ['strength (FEA): this path runs no analysis'],
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
let mode = 'code';
await page.route('**/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify(mode === 'failed' ? FAILED_ANSWER : CODE_ANSWER) }));
await page.goto(BASE + '?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
const chatText = () => page.evaluate(() => document.querySelector('#chat').innerText);
const say = async (text) => { await page.evaluate((t) => window.__idris.chat(t), text); await page.waitForTimeout(1500); };

await say('bracket 100x60x8');
let t = await chatText();
check('code-rung badge is shown', () => ok(/Code \(generated\)/.test(t), 'no "Code (generated)" badge in: ' + t.slice(-600)));
check('sizes table names every source', () => {
  ok(/Sizes and their sources/.test(t), 'no sizes table');
  ok(/you/.test(t), 'no "you" source');
  ok(/computed — t = 0\.75\*d/.test(t), 'no computed method');
  ok(/table ISO 273 \(assumed — confirm it\)/.test(t), 'table source not marked assumed');
});

mode = 'failed';
await say('bracket 100x60x8 with a big fillet');
t = await chatText();
check('failed answer shows the red report card', () => ok(/Could not build this part — no design was made/.test(t), 'no failed card'));
check('the card lists both rungs and their errors', () => {
  ok(/features: fillet R20 mm is too big/.test(t), 'features rung error missing');
  ok(/code: kernel: zero-length segment/.test(t), 'code rung error missing');
});
check('the card asks for the missing size and says what helps', () => {
  ok(/What value should I use for thickness mm\?/.test(t), 'missing size question missing');
  ok(/Give the missing size\(s\): thickness_mm/.test(t), 'suggestion missing');
});
check('the card offers the background job, not a feedback promise without a job', () => {
  ok(/Design it as a background job/.test(t), 'no background job button');
  ok(!/Send the report to feedback/.test(t), 'feedback shown although no job is waiting');
});
check('no page errors', () => ok(errors.length === 0, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP.width}×${VP.height})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
