/* S21c: Scale in the real page (Batch 4).
 *
 *   1. Features → Scale is no longer grey;
 *   2. a 60 × 40 × 20 box is 48 000 mm³; Features → Scale, factor 2, Add & build → 384 000 mm³ and 120 × 80 × 40,
 *      with the kernel's own volume in the step note;
 *   3. the step is edited in the tree: factor 0.5, Update & rebuild → 6 000 mm³ (the original ×0.5³);
 *   4. a factor of 0 is refused with its reason on screen and the solid is left as it was;
 *   5. no page error.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21c-scale.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome');
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
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(350); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const setNum = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform input[data-k=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(120); };

await openTab('Features');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Scale runs now', () => ok(s['Scale'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Split stays grey until the part holds more than one body', () => ok(s['Split'] === true, JSON.stringify(s)));
}

await checkAsync('a 60 × 40 × 20 box, scaled ×2, is 384 000 mm³ and 120 × 80 × 40', async () => {
  await clickTool('Box');
  await setNum('L', 60); await setNum('W', 40); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await waitVol(48000, 1);
  await clickTool('Scale');
  await setNum('k', 2);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await waitVol(384000, 5);
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[0] - 120) < 1e-6 && Math.abs(info.size[1] - 80) < 1e-6, 'size is not 120 × 80: ' + JSON.stringify(info.size));
  const note = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return f.note || ''; });
  ok(/48000/.test(note.replace(/[^0-9.]/g, '')), 'the note does not carry the measured volume: ' + JSON.stringify(note));
});

await checkAsync('the step is edited in the tree: factor 0.5 rebuilds to 6 000 mm³', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pfn')[1].click());
  await page.waitForTimeout(300);
  await setNum('k', 0.5);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await waitVol(6000, 1);
});

await checkAsync('a factor of 0 is refused on screen and the solid stays', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pfn')[1].click());
  await page.waitForTimeout(300);
  await setNum('k', 0);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox.bad'); return w ? w.textContent : ''; });
  ok(/above 0/.test(shown), 'no refusal on screen: ' + JSON.stringify(shown));
  /* a failed step is marked and skipped, so the model is the box without the scale: 48 000 mm³, never a guess */
  const vol = await page.evaluate(() => window.__idris.partInfo() && window.__idris.partInfo().vol);
  ok(Math.abs(vol - 48000) < 1, 'the model should fall back to the unscaled box: ' + vol);
  const marked = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { err: f.err || '', dot: document.querySelectorAll('#cadLeft .pft li')[1].className }; });
  ok(/above 0/.test(marked.err), 'the step is not marked failed in the tree: ' + JSON.stringify(marked));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
