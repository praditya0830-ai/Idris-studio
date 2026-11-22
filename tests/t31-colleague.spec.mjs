/* v0.41 colleague layer in the chat (doc: chat rekan engineer, bagian B).
 *
 * The page is driven against a mock engine: /chat answers like `colleague.py` and /references/design like
 * `research/design_refs.py`, so the UI is tested without an AI and without the web.
 *
 *   BASE_URL=http://127.0.0.1:3000 OUT=docs VP=1366x768 node tests/t31-colleague.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || 'docs';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const REPLY = {
  success: true, intent: 'discuss', answer: 'Snow plow-nya masih di tahap konsep. Dudukan ke pikap belum kita tentukan.',
  reply: 'Snow plow-nya masih di tahap konsep. Dudukan ke pikap belum kita tentukan.', language: 'id',
  suggestions: [{ label: 'Sesuaikan dudukan ke kendaraanmu', action: { route: 'continue', params: {} } },
    { label: 'Tambah mekanisme angkat', action: { route: 'continue', params: {} } },
    { label: 'Cek sambungan las', action: { route: 'continue', params: {} } }],
  questions: [{ id: 'q1', text: 'Kendaraannya apa?', stage: 2, allow_other: true,
    options: [{ label: 'Pikap', note: 'bak terbuka', recommended: true, source: 'reference' },
      { label: 'Traktor', note: '', recommended: false },
      { label: 'Tidak yakin — pilih saja', note: 'IDRIS memakai rekomendasi', recommended: false }] }],
  action: null, stage: 2, stage_name: 'References', numbers_verified: true, provider: 'claude',
};

const REFS = {
  success: true, ok: true, queries: ['S355 steel snow plow'], steps: ['Searching: S355 steel snow plow', 'Found 12, reading 4'],
  cards: [{ title: 'Truck snow plow blade mount', source_url: 'https://example.com/a', thumbnail_url: null,
    what_it_is: 'The blade is laser cut from 6 mm S355 steel.', key_features: ['TIG weld', 'gusset'],
    numbers_found: [{ value: 6, unit: 'mm', source_url: 'https://example.com/a', label: 'web — not verified' }] }],
  patterns: ['TIG weld appears in 3 of 4 sources', 'gusset appears in 2 of 4 sources'],
  proposal: 'I would start from the pattern the sources share: TIG weld appears in 3 of 4 sources.',
  note: 'Numbers from the web are candidates until the engineer confirms them.',
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
const sent = [];
page.on('pageerror', (e) => results.push([false, 'page error: ' + e.message]));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/.test(t)) results.push([false, 'console error: ' + t]); });

await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('**/chat', async (route) => {
  try { sent.push(JSON.parse(route.request().postData() || '{}')); } catch (e) { sent.push({}); }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REPLY) });
});
await page.route('**/references/design', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REFS) }));

await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cv', { state: 'attached', timeout: 30000 });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#inp', { timeout: 30000 });
const home = page.getByRole('button', { name: 'Open the workspace' });
if (await home.count()) { await home.first().click(); await page.waitForTimeout(700); }
await page.evaluate(() => { window.__idris.state.part = { title: 'snow plow', material: 'steel' }; });
await page.evaluate(() => { try { window.__idris.state.part = window.__idris.state.part; } catch (e) { /* ignore */ } });
await page.evaluate(() => { const b = window.__idris; if (b && b.state) b.state.part = Object.assign(b.state.part || {}, { title: 'snow plow' }); });

await page.fill('#inp', 'cuy');
await page.click('#send');
await page.waitForSelector('.sug-btn', { timeout: 30000 });
await page.waitForSelector('.ref-card', { timeout: 30000 });
await page.waitForTimeout(400);

const dom = await page.evaluate(() => ({
  stage: (document.querySelector('#chat .msg.ai:last-child .via') || {}).textContent || '',
  sug: [...document.querySelectorAll('.sug-btn')].map((b) => b.textContent),
  qText: (document.querySelector('.q-t') || {}).textContent || '',
  rec: [...document.querySelectorAll('.q-chip')].map((b) => ({ label: b.textContent, rec: b.classList.contains('rec') })),
  other: !!document.querySelector('.q-other'),
  cards: [...document.querySelectorAll('.ref-card')].map((c) => c.textContent),
  nums: [...document.querySelectorAll('.ref-num')].map((n) => n.textContent),
  live: (document.querySelector('.ref-live') || {}).textContent || '',
  chat: document.querySelector('#chat').innerText,
}));
const first = sent[0] || {};
check('stage label above the reply', () => { if (!/Stage 2/.test(dom.stage)) throw new Error('via shows: ' + dom.stage); });
check('the reply is in Indonesian and says the project', () => eq(true, /Snow plow/.test(dom.chat), 'reply text in #chat'));
check('three suggestions as buttons', () => eq(3, dom.sug.length, 'suggestions'));
check('the question is shown with a recommended option marked', () => {
  eq('Kendaraannya apa?', dom.qText, 'question');
  const rec = dom.rec.filter((r) => r.rec);
  eq(1, rec.length, 'recommended count');
  if (!/Recommended/.test(rec[0].label)) throw new Error('badge missing: ' + rec[0].label);
});
check('an "other" field is offered', () => eq(true, dom.other, 'other input'));
check('reference card with its source and a labelled number', () => {
  eq(1, dom.cards.length, 'cards');
  if (!/Truck snow plow blade mount/.test(dom.cards[0])) throw new Error('title missing');
  if (!/web — not verified/.test(dom.nums[0])) throw new Error('number label missing: ' + dom.nums[0]);
});
check('the research status line is shown', () => { if (!/Found 12/.test(dom.live)) throw new Error('live: ' + dom.live); });
const useBtns = await page.evaluate(() => [...document.querySelectorAll('.ref-num button')].map((b) => b.textContent));
check('a web number carries a Use this number button, still labelled as a candidate', () => {
  eq(1, useBtns.length, 'use buttons');
  if (!/Use this number/.test(useBtns[0])) throw new Error('button: ' + useBtns[0]);
});
check('the history and the project travel with the message (B1)', () => {
  eq(true, Array.isArray(first.history), 'history array');
  eq(true, first.history.length >= 1 && first.history[0].role === 'user', 'first history row');
});

await page.click('.sug-btn');
await page.waitForTimeout(600);
check('clicking a suggestion sends it as the next message', () => {
  eq(2, sent.length, 'requests');
  eq('Sesuaikan dudukan ke kendaraanmu', sent[1].message, 'sent message');
});

await page.click('.q-chip.rec');
await page.waitForTimeout(600);
check('clicking a question chip answers it', () => { eq('Pikap', sent[2] && sent[2].message, 'answer message'); });

await page.click('.ref-num button');
await page.waitForTimeout(600);
const used = await page.evaluate(() => { const b = document.querySelector('.ref-num button'); return { text: b.textContent, disabled: b.disabled }; });
check('Use this number sends the engineer\'s confirmation, not an applied value', () => {
  const msg = String((sent[3] || {}).message || '');
  if (!/^Use this number \(I confirm it\): 6 mm/.test(msg)) throw new Error('sent: ' + msg);
  if (!/not as a computed value/.test(msg)) throw new Error('not marked as the engineer\'s input: ' + msg);
  eq(true, used.disabled, 'button goes quiet after one confirmation');
});

const pats = await page.evaluate(() => [...document.querySelectorAll('.pat-btn')].map((b) => b.textContent));
check('the patterns are offered as choices, not applied', () => {
  eq('Use this pattern|Combine|Skip', pats.join('|'), 'pattern buttons');
});
await page.click('.pat-btn');
await page.waitForTimeout(600);
check('Use this pattern sends the chosen pattern', () => {
  const msg = String((sent[4] || {}).message || '');
  if (!/^Use this pattern as the base: TIG weld appears in 3 of 4 sources/.test(msg)) throw new Error('sent: ' + msg);
});

if (process.env.SHOT !== '0') {
  await page.screenshot({ path: `${root}/${OUT}/t31-colleague-${VP[0]}.png`, fullPage: false });
}
await browser.close();
const bad = results.filter((r) => !r[0]);
bad.forEach((r) => console.log('  FAILED: ' + r[1] + (r[2] ? ' — ' + r[2].message : '')));
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
