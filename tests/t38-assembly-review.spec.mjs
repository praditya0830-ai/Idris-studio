/* Part 4 of the brief: a review gate before the assembly build.
 * A part that failed (or was never designed, or has no code for the assembly build) is listed by name, and Assemble
 * stays disabled until it is designed again. Nothing is silently left out of the assembly.
 *
 * /chat and the assembly job are stubbed; the panel is the shipping one.
 *
 *   BASE_URL=http://127.0.0.1:3021 VP=1366x768 node tests/t38-assembly-review.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const PLATE = 'const p = makeBaseBox(60, 40, 6); return p;';
const PLAN = { parts: [{ id: 'plate', name: 'Mount plate', qty: 1, role: 'base' }, { id: 'bracket', name: 'Sensor bracket', qty: 1, role: 'holder' }],
  interfaces: [{ between: ['bracket', 'plate'], kind: 'bolted', params: { bolt_mm: 8 } }], questions: [] };
const JOB = {
  status: 'done', id: 'job-gate',
  parts: [
    { id: 'plate', name: 'Mount plate', qty: 1, status: 'done', fidelity: 'full', cad: { code: PLATE, params: [] } },
    { id: 'bracket', name: 'Sensor bracket', qty: 1, status: 'failed', error: 'kernel: the plate came out empty', cad: null },
  ],
  assembly: { frames_complete: true, parts: [{ id: 'plate', origin_mm: [0, 0, 0] }, { id: 'bracket', origin_mm: [80, 0, 0] }] },
  plan: PLAN,
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push('console: ' + t.slice(0, 180)); });
let redesigned = false;

await page.route('http://mock.local/**', async (route) => {
  const req = route.request();
  const url = req.url();
  const body = req.postData() || '';
  let out = {};
  if (url.includes('/assembly/design')) out = { status: 'done', ...JOB };
  else if (url.endsWith('/chat')) {
    if (/Design only this part/.test(body)) { redesigned = true; out = { success: true, answer: 'Here is the bracket again.', cad: { title: 'Sensor bracket', code: PLATE, params: [] } }; }
    else out = { success: true, answer: 'Two parts, one bolted joint.', assembly: { job_id: 'job-gate', plan: PLAN } };
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
});
await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const hm = document.querySelector('#home'); if (hm) hm.remove(); document.body.classList.remove('at-home'); });
await page.fill('#inp', 'mount plate with a sensor bracket');
await page.evaluate(() => document.querySelector('#send').click());
await page.waitForSelector('#asmPanel', { timeout: 60000 });
await page.waitForSelector('#asmReview', { timeout: 60000 });
await page.waitForTimeout(600);

const look = () => page.evaluate(() => {
  const box = document.querySelector('#asmPanel');
  const btn = [...(box ? box.querySelectorAll('button') : [])].find((b) => /^(Assemble|Rakit)$/.test(b.textContent.trim()));
  return {
    panel: box ? box.innerText : '',
    review: (document.querySelector('#asmReview') || {}).innerText || '',
    reviewParts: [...document.querySelectorAll('#asmReview li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
    disabled: btn ? btn.disabled : null,
    title: btn ? btn.title : '',
    hasBtn: !!btn,
    blockedNote: (document.querySelector('#asmBlockedNote') || {}).innerText || '',
    built: !!document.querySelector('#asmPanel .gen-checks'),
  };
});
let v = await look();

check('a failed part is listed by name with the reason it failed', () => {
  ok(/sensor bracket/i.test(v.review), 'review card: ' + v.review);
  ok(/came out empty/i.test(v.review), 'the failure reason is missing: ' + v.review);
  ok(!/mount plate/i.test(v.review), 'a good part was put under review: ' + v.review);
  ok(/review 1 part/i.test(v.review), 'the count is wrong: ' + v.review);
});
check('Assemble is disabled while a part is under review', () => {
  ok(v.hasBtn, 'no Assemble button in the panel');
  ok(v.disabled === true, 'Assemble is still clickable');
  ok(/Design the parts in Review first/.test(v.title), 'no title explaining why: ' + v.title);
});
check('the panel says why nothing is assembled, and offers Redesign', () => {
  ok(/is not an assembly/i.test(v.review), 'no reason in the card: ' + v.review);
  ok(/redesign/i.test(v.review), 'no Redesign button: ' + v.review);
});
await page.evaluate(() => { const b = [...document.querySelectorAll('#asmPanel button')].find((x) => /^(Assemble|Rakit)$/.test(x.textContent.trim())); if (b) { b.disabled = false; b.click(); } });
await page.waitForTimeout(800);
v = await look();
check('the guard speaks instead of assembling a part short', () => {
  ok(!v.built, 'the assembly was built with a missing part');
  ok(/waiting on 1 part/.test(v.blockedNote) && /sensor bracket/i.test(v.blockedNote), 'guard note: ' + v.blockedNote);
});

await page.evaluate(() => { const b = [...document.querySelectorAll('#asmReview button')].find((x) => /Redesign/.test(x.textContent)); if (b) b.click(); });
await page.waitForTimeout(1500);
v = await look();
check('designing the part again clears the gate', () => {
  ok(redesigned, 'Redesign did not ask the solver');
  ok(!v.review, 'the review card is still there: ' + v.review);
  ok(v.disabled === false, 'Assemble is still disabled');
});
check('no JavaScript errors on the page', () => ok(!errors.length, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP[0]}×${VP[1]})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
