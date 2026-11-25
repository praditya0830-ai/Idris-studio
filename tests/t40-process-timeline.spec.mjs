/* The design process in the UI (doc: alur kerja IDRIS di UI, 25 Nov 2026, bagian B).
 *
 * The page is driven against a mock engine with a fixed set of /chat answers, so no AI is called and no solver is
 * needed: the nine-stage bar, "How IDRIS got here" and the saved failed report are tested as the UI renders them.
 *
 *   BASE_URL=http://127.0.0.1:3051 node tests/t40-process-timeline.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const TRACE = [
  { step: 'Read the request', status: 'done', detail: '"snow plow mount"', source: 'the message' },
  { step: 'Checked the brief', status: 'done', detail: 'open brief: snow plow, ready to design', source: 'brief.py' },
  { step: 'Picked a build route', status: 'done', detail: 'route "free_design" · a new part · shape class: plate', source: 'cad_router' },
  { step: 'Searched design references', status: 'skipped', detail: 'the message asks for no formula', source: '/references/design' },
];
const FAILED_TRACE = [
  { step: 'Read the request', status: 'done', detail: '"snow plow blade"', source: 'the message' },
  { step: 'Build failed', status: 'failed', detail: 'features: no template fits; code: the code did not build', source: 'design_ladder.py' },
];
const REPLY = (stage, name, extra = {}) => ({
  success: true, intent: 'discuss', answer: `Answer for stage ${stage}.`, reply: `Answer for stage ${stage}.`,
  language: 'en', suggestions: [], questions: [], action: null, stage, stage_name: name,
  numbers_verified: true, provider: 'claude', ...extra,
});
const REPLIES = [
  REPLY(1, 'Brief', { answer: 'What vehicle is the snow plow for?', trace: TRACE }),
  REPLY(2, 'References'),
  REPLY(3, 'Concept & layout'),
  REPLY(4, 'Part design', {
    answer: 'I could not build this part.',
    rung: 'failed', fidelity: null, cad: null,
    design_report: { part_name: 'blade', shape_class: 'plate',
      rungs_tried: [{ rung: 'features', error: 'no template fits' }, { rung: 'code', error: 'the code did not build' }],
      missing_numbers: [], suggestion: 'give the blade thickness' },
    trace: FAILED_TRACE,
  }),
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/.test(t)) pageErrors.push('console: ' + t); });

let turn = 0;
const reportPosts = [];
await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('**/chat', async (route) => {
  const reply = REPLIES[Math.min(turn, REPLIES.length - 1)];
  turn += 1;
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
});
await page.route('**/design/report', async (route) => {
  reportPosts.push(route.request().postData() || '');
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, success: true, id: 'rep-abc' }) });
});

await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cv', { state: 'attached', timeout: 30000 });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#inp', { timeout: 30000 });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 30000 });
const home = page.getByRole('button', { name: 'Open the workspace' });
if (await home.count()) { await home.first().click(); await page.waitForTimeout(600); }
await page.evaluate(() => { window.__idris.state.part = { title: 'snow plow', material: 'steel' }; });
await page.evaluate(() => {
  window.__scrolled = null;
  Element.prototype.scrollIntoView = function () { window.__scrolled = (this.textContent || '').slice(0, 120); };
});

const dom = () => page.evaluate(() => ({
  hidden: !!document.querySelector('#proc').hidden,
  stages: [...document.querySelectorAll('#procBar li')].map((li) => li.className),
  labels: [...document.querySelectorAll('#procBar .lab')].map((x) => x.textContent),
  now: (document.querySelector('#procNow') || {}).textContent || '',
  traces: [...document.querySelectorAll('.proc-trace')].map((d) => ({
    open: d.open, summary: (d.querySelector('summary') || {}).textContent || '',
    rows: [...d.querySelectorAll('li')].map((li) => ({ cls: li.className, text: li.textContent })),
  })),
  failed: !!document.querySelector('.failed-card'),
  saved: (document.querySelector('.rep-save') || {}).textContent || '',
  savedCls: (document.querySelector('.rep-save') || {}).className || '',
  dots: [...document.querySelectorAll('#procBar li .dot')].map((d) => getComputedStyle(d).backgroundColor),
}));

const before = await dom();
check('no project: the bar is not shown', () => eq(true, before.hidden, '#proc hidden'));

await page.evaluate(() => window.__idris.chat('snow plow for a pickup'));
await page.waitForSelector('#proc:not([hidden])', { timeout: 20000 });
const first = await dom();
check('nine stages are shown once the solver names a stage', () => eq(9, first.stages.length, 'stage count'));
check('stage 1 is the current one', () => { eq('now', first.stages[0].trim(), 'stage 1'); eq('todo', first.stages[1].trim(), 'stage 2'); });
check('the header names the current stage', () => { if (!/1\/9/.test(first.now) || !/Brief/.test(first.now)) throw new Error(first.now); });
check('the short stage labels are there', () => { if (first.labels[2] !== 'Concept' || first.labels[7] !== 'DFM') throw new Error(first.labels.join(',')); });

await page.evaluate(() => window.__idris.chat('search references for a snow plow blade'));
await page.waitForTimeout(300);
const second = await dom();
check('after the second answer stage 1 is done and stage 2 is current', () => { eq('done', second.stages[0].trim(), 'stage 1'); eq('now', second.stages[1].trim(), 'stage 2'); });
check('done, current and future stages are coloured differently', () => {
  const [done, now, todo] = second.dots;
  if (!done || !now || !todo || done === now || now === todo) throw new Error(JSON.stringify(second.dots.slice(0, 3)));
});
check('a reply with a trace has a closed "How IDRIS got here" row', () => {
  eq(1, second.traces.length, 'trace rows');
  eq(false, second.traces[0].open, 'closed by default');
  if (!/How IDRIS got here/.test(second.traces[0].summary)) throw new Error(second.traces[0].summary);
});
check('the trace lists exactly the solver steps, with their status', () => {
  const rows = second.traces[0].rows;
  eq(4, rows.length, 'steps');
  eq(true, /Read the request/.test(rows[0].text), 'step 1');
  eq(true, /Picked a build route/.test(rows[2].text), 'step 3');
  eq(true, /Searched design references/.test(rows[3].text) && /skipped|–/.test(rows[3].cls + rows[3].text), 'skipped step');
});

await page.evaluate(() => window.__idris.chat('show me the layout concept'));
await page.waitForTimeout(300);
const third = await dom();
check('three answers: two done, stage 3 current', () => {
  eq('done', third.stages[0].trim(), 'stage 1'); eq('done', third.stages[1].trim(), 'stage 2'); eq('now', third.stages[2].trim(), 'stage 3');
  if (!/3\/9/.test(third.now) || !/Concept & layout/.test(third.now)) throw new Error(third.now);
});
check('a reply without a trace has no "How IDRIS got here" row', () => eq(1, third.traces.length, 'only the first trace'));

await page.evaluate(() => { window.__scrolled = null; document.querySelector('#procBar li.done button').click(); });
await page.waitForTimeout(200);
const jumped = await page.evaluate(() => window.__scrolled);
check('stage 1 jumps to the first answer of that stage', () => {
  if (!jumped || !/What vehicle is the snow plow for\?/.test(jumped)) throw new Error(String(jumped));
  if (/Answer for stage 3/.test(jumped)) throw new Error('jumped to a later reply: ' + jumped);
});
await page.evaluate(() => { window.__scrolled = null; document.querySelectorAll('#procBar li button')[2].click(); });
await page.waitForTimeout(150);
const noJump = await page.evaluate(() => window.__scrolled);
check('the current stage is not a jump target', () => eq(null, noJump, 'no scroll'));

await page.evaluate(() => window.__idris.chat('make the snow plow blade'));
await page.waitForSelector('.rep-save.saved', { timeout: 20000 });
const failed = await dom();
check('a failed design still shows its report card', () => eq(true, failed.failed, '.failed-card'));
check('the failed report was saved and the card says which id it got', () => {
  if (!/Report saved to feedback \(#rep-abc\)/.test(failed.saved)) throw new Error(failed.saved);
  if (!/saved/.test(failed.savedCls)) throw new Error(failed.savedCls);
});
check('the failed reply trace marks the failed step', () => {
  const last = failed.traces[failed.traces.length - 1];
  if (!last || !last.rows.some((r) => /tr-failed/.test(r.cls) && /Build failed/.test(r.text))) throw new Error(JSON.stringify(last));
});
check('POST /design/report was called exactly once', () => eq(1, reportPosts.length, 'report posts'));
check('the posted body carries the report and the message, no identity', () => {
  const body = JSON.parse(reportPosts[0]);
  eq('blade', body.report.part_name, 'report');
  eq('make the snow plow blade', body.message, 'message');
  eq(false, 'email' in body || 'ip' in body, 'no identity fields');
});

await page.evaluate(() => window.__idris.chat('make the snow plow blade again'));
await page.waitForTimeout(600);
check('the same report is not posted a second time', () => eq(1, reportPosts.length, 'report posts after a repeat'));

const errorsNow = pageErrors.slice();
check('no page error and no console error', () => { if (errorsNow.length) throw new Error(errorsNow.join(' | ')); });

await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(`\n${results.length - bad.length}/${results.length} checks passed at ${VP[0]}x${VP[1]}`);
if (bad.length) process.exit(1);
