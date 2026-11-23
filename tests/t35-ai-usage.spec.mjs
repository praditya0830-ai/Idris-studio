/* AI spend badge (brief: sambungkan semua solver, Bagian 1 D). GET /ai/usage is read once at start and after every
 * chat answer — never on a timer — and the badge repeats the solver's own count. Red when the daily cap is close or
 * already blocking. The payloads here are exactly the keys `ai_budget.usage()` returns in solver 0.42.
 *
 *   BASE_URL=http://127.0.0.1:3022 VP=1366x768 node tests/t35-ai-usage.spec.mjs
 *   BASE_URL=http://127.0.0.1:3022 VP=1280x800 node tests/t35-ai-usage.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3022';
const OUT = process.env.OUT || 'docs';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const usage = (calls, extra = {}) => ({ success: true, date_utc: '2026-11-22', calls_today: calls, calls_today_cap: 60,
  calls_today_left: Math.max(0, 60 - calls), calls_month: calls, tokens_today: { input: 1200, output: 800 },
  estimated_cost_usd_today: 0.0412, estimated_cost_usd_month: 0.9104, monthly_budget_usd: 20,
  monthly_budget_left_usd: 19.0896, blocked: null, blocked_reason: null,
  price_source: 'List prices per million tokens (assumed, not billed)', price_assumed: ['claude', 'gemini'],
  unpriced_providers: [], note: 'Counted in memory and reset at 00:00 UTC.', ...extra });

let calls = 0;                       // how many times the studio asked for the usage
let payload = usage(3);
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push('console: ' + t.slice(0, 180)); });
/* Playwright matches the newest route first: the catch-all is registered before the two real ones */
await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('http://mock.local/chat', (route) => route.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ success: true, intent: 'discuss', answer: 'A plate it is.', provider: 'rules' }) }));
await page.route('http://mock.local/ai/usage', (route) => { calls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) }); });

await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, { timeout: 60000 });
await page.waitForFunction(() => !document.querySelector('#aiBadge').hidden, { timeout: 30000 });

const badge = () => page.evaluate(() => { const el = document.querySelector('#aiBadge');
  return { text: el.textContent, title: el.title, hidden: el.hidden, hot: el.classList.contains('hot'), blocked: el.classList.contains('blocked') }; });

const first = await badge();
check('the badge shows the solver count and the daily cap', () => eq('AI today: 3 / 60', first.text, 'badge'));
check('under the cap it is not red', () => { eq(false, first.hot, 'hot'); eq(false, first.blocked, 'blocked'); });
check('the tooltip carries the cost and the budget, from the solver', () => {
  if (!/Estimated cost today: \$0\.0412/.test(first.title)) throw new Error('title: ' + first.title);
  if (!/Monthly budget: \$20 · \$19\.0896 left/.test(first.title)) throw new Error('title: ' + first.title);
});
check('the usage was read at start, without polling', () => { if (calls < 1) throw new Error('no /ai/usage call'); });

/* a chat answer spends AI calls: the badge follows it */
payload = usage(5);
await page.fill('#inp', 'make me a plate');
await page.press('#inp', 'Enter');
await page.waitForFunction(() => /AI today: 5 \/ 60/.test((document.querySelector('#aiBadge') || {}).textContent || ''), { timeout: 30000 });
const afterChat = await badge();
check('a chat answer refreshes the badge', () => eq('AI today: 5 / 60', afterChat.text, 'badge after chat'));

/* near the cap: red; at the cap the solver names the block and the badge repeats it */
payload = usage(57);
await page.evaluate(() => window.__idris.tools.aiUsageRefresh(true));
let near = await badge();
check('near the daily cap the badge turns red', () => { eq(true, near.hot, 'hot'); eq('AI today: 57 / 60', near.text, 'text'); });
payload = usage(60, { blocked: 'Daily AI call cap reached (60 calls, IDRIS_DAILY_AI_CALLS).' });
await page.evaluate(() => window.__idris.tools.aiUsageRefresh(true));
const capped = await badge();
check('at the cap the badge is red and carries the solver reason', () => {
  eq(true, capped.blocked, 'blocked class');
  if (!/Daily AI call cap reached/.test(capped.title)) throw new Error('title: ' + capped.title);
});

if (process.env.SHOT !== '0') await page.screenshot({ path: `${root}/${OUT}/t35-ai-usage-${VP[0]}.png`, clip: { x: 0, y: 0, width: VP[0], height: 120 } });
check('no JavaScript errors on the page', () => { if (errors.length) throw new Error(errors.join(' | ')); });

await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
