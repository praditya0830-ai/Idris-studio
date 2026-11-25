/* Batch A: Sketch Text in the real page.
 *
 *   1. Sketch → Text is no longer grey;
 *   2. "I" at 14 mm, 3 mm deep builds 180 mm³ and 10 × 14 × 3 mm, with the kernel's own volume in the step note;
 *   3. the step is edited in the tree: height 7 → 45 mm³ (a quarter of the area);
 *   4. a deboss on a 40 × 40 × 10 box removes exactly 60 × 2 mm³;
 *   5. a character the bundled font does not carry is refused on screen with its name;
 *   6. no page error.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/bA-text.spec.mjs
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
const build = async () => { await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click()); await page.waitForTimeout(500); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const setField = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform [data-k=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(120); };
const vol = () => page.evaluate(() => window.__idris.partInfo() && window.__idris.partInfo().vol);

await openTab('Sketch');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Text runs now', () => ok(s['Text'] === false, 'still grey: ' + JSON.stringify(s['Text'])));
}

await checkAsync('"I" at 14 mm and 3 mm deep is 180 mm³ and 10 × 14 × 3 mm', async () => {
  await clickTool('Text');
  await setField('s', 'I'); await setField('h', 14); await setField('depth', 3);
  await build();
  await waitVol(180, 1);
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[0] - 10) < 1e-6 && Math.abs(info.size[1] - 14) < 1e-6 && Math.abs(info.size[2] - 3) < 1e-6, 'size: ' + JSON.stringify(info.size));
  const note = await page.evaluate(() => window.__idris.state.part.features[0].note || '');
  ok(/180/.test(note), 'the note does not carry the measured volume: ' + JSON.stringify(note));
});

await checkAsync('the step is edited in the tree: height 7 rebuilds to 45 mm³', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pfn')[0].click());
  await page.waitForTimeout(300);
  await setField('h', 7);
  await build();
  await waitVol(45, 0.5);
});

await checkAsync('a deboss removes exactly 60 × 2 mm³ from a 40 × 40 × 10 box', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setField('L', 40); await setField('W', 40); await setField('H', 10);
  await build();
  await waitVol(16000, 1);
  await openTab('Sketch');
  await clickTool('Text');
  await setField('s', 'I'); await setField('h', 14); await setField('depth', 2);
  await setField('u', -5); await setField('v', 5);
  await page.evaluate(() => { const el = [...document.querySelectorAll('#cadProps .pform select[data-k=op]')][0]; el.value = 'cut'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  await build();
  await waitVol(16000 - 120, 1);
});

await checkAsync('a character the bundled font does not carry is refused on screen', async () => {
  await openTab('Sketch');
  await clickTool('Text');
  await setField('s', 'A#B');
  await build();
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox.bad'); return w ? w.textContent : ''; });
  ok(/bundled font/.test(shown) && /#/.test(shown), 'no refusal naming the character: ' + JSON.stringify(shown));
  ok(Math.abs((await vol()) - (16000 - 120)) < 1, 'the failed step should leave the body as it was: ' + (await vol()));
  const errs = errors.filter((e) => !/WebGL|swiftshader/i.test(e));
  ok(!errs.length, 'page errors: ' + errs.join(' | '));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
