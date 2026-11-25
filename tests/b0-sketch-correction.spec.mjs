/* Batch 0: Sketch Correction runs from the ribbon.
 *
 *   1. IDRIS → Sketch Correction is no longer grey;
 *   2. clicking it opens the line-and-arc sketcher with its correction list, not an empty form;
 *   3. the sketch panel carries the Sketch Correction tool and the panel says a fix is a proposal;
 *   4. no page error.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/b0-sketch-correction.spec.mjs
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
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.tools, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(600);

const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(250); };
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(400); };

await openTab('Sketch');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Sketch Correction runs now', () => ok(s['Sketch Correction'] === false, 'still grey: ' + JSON.stringify(s)));
}

await checkAsync('clicking it opens the sketcher on its correction list', async () => {
  await clickTool('Sketch Correction');
  const st = await page.evaluate(() => ({
    session: !!document.querySelector('#cadProps .skform'),
    chip: [...document.querySelectorAll('#cadProps .sktools .chip')].some((b) => /Sketch Correction/.test(b.textContent)),
    hint: (document.querySelector('#cadProps .hint') || {}).textContent || '',
  }));
  ok(st.session, 'no sketch panel: ' + JSON.stringify(st));
  ok(st.chip, 'the Sketch Correction tool is not in the sketch toolbar: ' + JSON.stringify(st.chip));
  ok(/proposal/.test(st.hint), 'the hint does not say a fix is a proposal: ' + JSON.stringify(st.hint));
});

await checkAsync('picking the Sketch Correction tool keeps the proposal hint', async () => {
  await page.evaluate(() => [...document.querySelectorAll('#cadProps .sktools .chip')].find((b) => /Sketch Correction/.test(b.textContent)).click());
  await page.waitForTimeout(300);
  const hint = await page.evaluate(() => (document.querySelector('#cadProps .hint') || {}).textContent || '');
  ok(/proposal/.test(hint), 'hint: ' + JSON.stringify(hint));
  const errs = errors.filter((e) => !/WebGL|swiftshader/i.test(e));
  ok(!errs.length, 'page errors: ' + errs.join(' | '));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
