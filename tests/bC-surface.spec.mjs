/* Batch C: Trim Surface and Delete Face in the real page.
 *
 *   1. both buttons run (not grey) in Surface → Edit;
 *   2. Delete Face on a 100 mm box removes the +Z face, patches the 10 000 mm² opening, keeps 1 000 000 mm³ and the
 *      step says so — no page error;
 *   3. Trim Surface cuts a 300 × 300 planar surface on the box's +X face and keeps 60 000 mm² of the 90 000 mm².
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/bC-surface.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1194/chrome-linux/chrome');
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const checkAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon|WebGL|swiftshader/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.tools, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(600);

const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(250); };
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(400); };
const build = async () => { await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click()); await page.waitForTimeout(700); };
const setField = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform [data-k=${s}]`); if (!el) throw new Error('no field ' + s); el.value = String(val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(150); };
const reset = async () => { await page.evaluate(() => window.__idris.tools.startPart()); await page.waitForTimeout(400); };
const commit = async (sel) => { await page.evaluate((s) => document.querySelector(s).click(), sel); await page.waitForTimeout(800); };
const vol = () => page.evaluate(() => window.__idris.partInfo() && window.__idris.partInfo().vol);
const notes = () => page.evaluate(() => (window.__idris.state.part.features || []).map((x) => x.note || '').join(' | '));

await openTab('Surface');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Trim Surface runs now', () => ok(s['Trim Surface'] === false, 'still grey: ' + s['Trim Surface']));
  check('Delete Face runs now', () => ok(s['Delete Face'] === false, 'still grey: ' + s['Delete Face']));
}

await checkAsync('Delete Face removes the +Z face, patches it and keeps 1 000 000 mm³', async () => {
  await reset(); await openTab('Features');
  await clickTool('Box');
  await setField('L', 100); await setField('W', 100); await setField('H', 100);
  await build();
  await page.waitForTimeout(500);
  await openTab('Surface');
  await clickTool('Delete Face');
  /* the +Z face is the one whose centre is (0, 0, 50) */
  const picked = await page.evaluate(() => { const li = [...document.querySelectorAll('#cadProps li[data-del]')].find((x) => /\(0\.0, 0\.0, 100\.0\)/.test(x.textContent)); if (!li) return false; li.click(); return true; });
  ok(picked, 'the +Z face is not in the Delete Face list');
  await page.waitForTimeout(200);
  await commit('#cadProps [data-del-go]');
  const n = await notes();
  ok(/deleted/.test(n), 'no delete note: ' + n);
  ok(/10,000\.0 mm²/.test(n), 'the removed area is not 10 000 mm²: ' + n);
  ok(Math.abs((await vol()) - 1000000) < 5, 'the healed box is not 1 000 000 mm³: ' + (await vol()));
});

await checkAsync('Trim Surface cuts a 300 × 300 surface on the +X face and keeps 60 000 mm²', async () => {
  await reset(); await openTab('Features');
  await clickTool('Box');
  await setField('L', 100); await setField('W', 100); await setField('H', 100);
  await build(); await page.waitForTimeout(400);
  await openTab('Sketch');
  await clickTool('Corner Rectangle');
  await setField('W', 300); await setField('Hh', 300);
  await build(); await page.waitForTimeout(400);
  await openTab('Surface');
  await clickTool('Planar Surface');
  await build(); await page.waitForTimeout(500);
  await clickTool('Trim Surface');
  const picked = await page.evaluate(() => { const li = [...document.querySelectorAll('#cadProps li[data-trim]')].find((x) => /\(50\.0, 0\.0, /.test(x.textContent)); if (!li) return false; li.click(); return true; });
  ok(picked, 'the +X face is not in the Trim Surface list');
  await page.evaluate(() => { const s = document.querySelector('#cadProps [data-k=keep]'); s.value = 'negative'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  await commit('#cadProps [data-trim-go]');
  const n = await notes();
  ok(/Trimmed on the plane of face/.test(n), 'no trim note: ' + n);
  ok(/90,000\.0 mm² before/.test(n), 'the area before is not 90 000 mm²: ' + n);
  ok(/60,000\.0 mm² kept/.test(n), 'the kept area is not 60 000 mm²: ' + n);
  const errs = errors.filter((e) => !/WebGL|swiftshader/i.test(e));
  ok(!errs.length, 'page errors: ' + errs.join(' | '));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
