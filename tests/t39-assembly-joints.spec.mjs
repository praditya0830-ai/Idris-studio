/* Part 5 of the brief: a reliable assembly.
 * The joint check is the solver's POST /join/plan; its answer decides OK / FAILED / needs a fix, names the parts, and
 * a shift it proposes stays a proposal until the engineer accepts it. A part with no size is reported, not guessed.
 *
 * /chat, the assembly job and /join/plan are stubbed; the panel is the shipping one.
 *
 *   BASE_URL=http://127.0.0.1:3021 VP=1366x768 node tests/t39-assembly-joints.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const PLATE = 'const p = makeBaseBox(60, 40, 6); return p;';
const PLAN = { parts: [{ id: 'plate', name: 'Mount plate', qty: 1 }, { id: 'bracket', name: 'Sensor bracket', qty: 1 }],
  interfaces: [{ between: ['bracket', 'plate'], kind: 'bolted', params: { bolt_mm: 8 } }], questions: [] };
const JOB = { status: 'done', id: 'job-joint',
  parts: [
    { id: 'plate', name: 'Mount plate', qty: 1, status: 'done', fidelity: 'full', size_mm: [60, 40, 6], cad: { code: PLATE, params: [] } },
    { id: 'bracket', name: 'Sensor bracket', qty: 1, status: 'done', fidelity: 'full', size_mm: [30, 20, 10], cad: { code: PLATE, params: [] } },
  ],
  assembly: { frames_complete: true, parts: [{ id: 'plate', origin_mm: [0, 0, 0] }, { id: 'bracket', origin_mm: [20, 0, 0] }] },
  plan: PLAN };
const OVERLAP = { check: 'overlap', parts: ['Mount plate', 'Sensor bracket'], value_mm3: 120, status: 'fail', source: 'AABB overlap on the two parts' };
const union = (failed) => ({ success: true, ok: !failed, joints: [{ between: ['Sensor bracket', 'Mount plate'], kind: 'bolted' }],
  checks: [failed ? OVERLAP : { ...OVERLAP, value_mm3: 0, status: 'pass' }, { check: 'every part is joined', value: 0, status: 'pass' }],
  failed: failed ? [OVERLAP] : [], floating: [], fixes: [],
  proposed_fixes: failed ? [{ part: 'Sensor bracket', with: 'Mount plate', axis: 'z', shift_mm: 6, overlap_mm3: 120, accepted: false,
    why: 'Sensor bracket moved +6.0 mm on z would clear it (only if the engineer accepts — the parts may be meant to touch)' }] : [],
  assumptions: [], notes: [] });

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push('console: ' + t.slice(0, 180)); });
const sent = [];                                  // every /join/plan body the panel sends
await page.route('http://mock.local/**', async (route) => {
  const req = route.request(), url = req.url();
  let out = {};
  if (url.includes('/join/plan')) { sent.push(JSON.parse(req.postData() || '{}')); out = union(sent.length === 1); }
  else if (url.includes('/assembly/design')) out = { ...JOB };
  else if (url.endsWith('/chat')) out = { success: true, answer: 'Two parts, one bolted joint.', assembly: { job_id: 'job-joint', plan: PLAN } };
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
});
await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const hm = document.querySelector('#home'); if (hm) hm.remove(); document.body.classList.remove('at-home'); });
await page.fill('#inp', 'mount plate with a sensor bracket');
await page.evaluate(() => document.querySelector('#send').click());
await page.waitForSelector('#asmJoint', { timeout: 60000 });
await page.waitForTimeout(500);

const look = () => page.evaluate(() => ({
  joint: (document.querySelector('#asmJoint') || {}).innerText || '',
  fixes: [...document.querySelectorAll('#asmJoint .joint-fix li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
  bad: [...document.querySelectorAll('#asmJoint .joint-bad li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
}));
let v = await look();

check('the panel says the joints are not checked yet, and offers the check', () => {
  ok(/not checked yet/i.test(v.joint), 'joint card: ' + v.joint);
  ok(/Check the joints/i.test(v.joint), 'no check button: ' + v.joint);
  ok(!sent.length, 'the check ran without being asked');
});

await page.evaluate(() => [...document.querySelectorAll('#asmJoint button')].find((b) => /Check the joints/.test(b.textContent)).click());
await page.waitForTimeout(1200);
v = await look();

check('the check goes to the solver with the parts and their sizes, and the plan joints', () => {
  ok(sent.length === 1, 'calls: ' + sent.length);
  const b = sent[0];
  ok(Array.isArray(b.parts) && b.parts.length === 2, 'parts: ' + JSON.stringify(b.parts));
  ok(JSON.stringify(b.parts[0].shape.size) === '[60,40,6]', 'plate size: ' + JSON.stringify(b.parts[0]));
  ok(JSON.stringify(b.parts[1].shape.at) === '[20,0,0]', 'plate frame: ' + JSON.stringify(b.parts[1].shape));
  ok(Array.isArray(b.interfaces) && b.interfaces.length === 1 && b.interfaces[0].kind === 'bolted', 'interfaces: ' + JSON.stringify(b.interfaces));
  ok(b.fix === false, 'the check asked the solver to move parts itself');
});
check('a failing check is named with its parts and its numbers', () => {
  ok(/FAILED: 1 check/i.test(v.joint), 'status line: ' + v.joint);
  ok(v.bad.length === 1 && /overlap/i.test(v.bad[0]) && /Mount plate \+ Sensor bracket/.test(v.bad[0]), 'failed checks: ' + JSON.stringify(v.bad));
  ok(/120 mm³/.test(v.bad[0]), 'the number is missing: ' + v.bad[0]);
});
check('the proposed shift is shown as a proposal, with its part, axis and distance', () => {
  ok(v.fixes.length === 1, 'proposals: ' + JSON.stringify(v.fixes));
  ok(/Sensor bracket → Mount plate: \+6 mm z/.test(v.fixes[0]), 'proposal line: ' + v.fixes[0]);
  ok(/nothing is applied until you accept it/i.test(v.joint), 'no warning that it is only a proposal: ' + v.joint);
  ok(/Accept the shift/.test(v.fixes[0]), 'no accept button: ' + v.fixes[0]);
  ok(JSON.stringify(sent[0].parts[1].shape.at) === '[20,0,0]', 'the part was already moved before anyone accepted');
});

await page.evaluate(() => [...document.querySelectorAll('#asmJoint .joint-fix button')].find((b) => /Accept the shift/.test(b.textContent)).click());
await page.waitForTimeout(1500);
v = await look();

check('accepting the shift moves that part and checks again', () => {
  ok(sent.length === 2, 'checks after accepting: ' + sent.length);
  ok(JSON.stringify(sent[1].parts[1].shape.at) === '[20,0,6]', 'the accepted shift is not in the frame: ' + JSON.stringify(sent[1].parts[1].shape));
  ok(JSON.stringify(sent[1].parts[0].shape.at) === '[0,0,0]', 'a part nobody asked about moved: ' + JSON.stringify(sent[1].parts[0].shape));
});
check('a clean check says the assembly is OK', () => {
  ok(/Assembly OK/i.test(v.joint), 'status line: ' + v.joint);
  ok(!v.bad.length, 'failed checks are still listed: ' + JSON.stringify(v.bad));
});
check('no JavaScript errors on the page', () => ok(!errors.length, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP[0]}×${VP[1]})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
