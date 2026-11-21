/* S7: Settings shows AI usage from GET /ai/usage and About shows GET /references/status (booleans + provider names).
 *
 * Every number on screen is compared with the solver's own JSON; nothing is hardcoded except the formatting.
 *
 *   SOLVER=http://127.0.0.1:8010 BASE_URL=http://127.0.0.1:3016/index.html node tests/s7-usage.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3016/index.html';
const SOLVER = process.env.SOLVER || 'http://127.0.0.1:8010';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || '1366';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const usage = await (await fetch(SOLVER + '/ai/usage')).json();
const refs = await (await fetch(SOLVER + '/references/status')).json();

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(BASE + '?api=' + encodeURIComponent(SOLVER), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.click('#apxBtn');
await page.waitForSelector('#aiUsage .apx-kv', { timeout: 15000 });
await page.waitForSelector('#refsStatus .apx-kv', { timeout: 15000 });

const txt = await page.evaluate(() => ({ ai: document.getElementById('aiUsage').innerText, refs: document.getElementById('refsStatus').innerText }));
const flat = (s) => String(s).replace(/\s+/g, ' ');

check('AI usage: calls today equal GET /ai/usage', () => {
  const want = `${usage.calls_today} / ${usage.calls_today_cap}`;
  ok(flat(txt.ai).includes(want), `expected "${want}" in: ${flat(txt.ai).slice(0, 220)}`);
});
check('AI usage: tokens today equal GET /ai/usage', () => {
  const want = `${usage.tokens_today.input} / ${usage.tokens_today.output}`;
  ok(flat(txt.ai).includes(want), `expected "${want}"`);
});
check('AI usage: estimated cost today equals GET /ai/usage', () => {
  ok(flat(txt.ai).includes('$' + usage.estimated_cost_usd_today.toFixed(4)), flat(txt.ai).slice(0, 220));
});
check('AI usage: the screen says there is no per-provider split', () => ok(/not a per-provider split/.test(flat(txt.ai)), flat(txt.ai).slice(-200)));
check('AI usage: assumed-price providers come from the solver', () => ok(flat(txt.ai).includes(usage.price_assumed.join(', ')), flat(txt.ai).slice(-260)));
check('AI usage: price source is quoted', () => ok(flat(txt.ai).includes(flat(usage.price_source).slice(0, 60)), 'price_source missing'));

check('About: web search status comes from the solver', () => ok(flat(txt.refs).includes(refs.search.configured ? 'configured' : 'not configured'), flat(txt.refs).slice(0, 200)));
check('About: reference database status and branch come from the solver', () => {
  ok(flat(txt.refs).includes(refs.database.branch), 'branch missing');
  ok(flat(txt.refs).includes(refs.database.configured ? 'configured' : 'not configured'), 'configured flag missing');
});
check('About: stored references and solver version come from the solver', () => {
  ok(flat(txt.refs).includes(String(refs.stored_count)), 'stored_count missing');
  ok(flat(txt.refs).includes(refs.solver_version), 'solver_version missing');
});
check('About: no key is shown', () => ok(!/sk-[A-Za-z0-9]|GITHUB_TOKEN\s*[:=]\s*\S{8,}/.test(flat(txt.refs)), 'something key-like is on screen'));

await page.screenshot({ path: `${OUT}/s7-usage-${TAG}.png` });
console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
