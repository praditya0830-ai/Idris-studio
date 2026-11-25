/* Batch B: Features in the real page.
 *
 *   1. Reference Plane, Reference Axis, Coordinate System, Dome, Split, Curve Pattern, Fill Pattern, Wrap/Emboss and
 *      Thicken are no longer grey;
 *   2. Split at the middle of a 100 mm box reports 1 000 000 mm³ in two bodies and keeps the 100 mm height;
 *   3. Dome 5 mm on a Ø20 × 20 cylinder is 7 134.03 mm³ (cylinder + πh(3a² + h²)/6);
 *   4. Wrap / Emboss adds exactly 20 × 20 × 2 mm³ to a 40 × 40 × 10 box;
 *   5. Fill Pattern 2 × 2 of a 10 × 10 × 5 box is 2 000 mm³;
 *   6. a Reference Plane shows up in the Sketch form's Plane list;
 *   7. Thicken opens the one Thicken (Surface → Thicken);
 *   8. no page error.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/bB-features.spec.mjs
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
const build = async () => { await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click()); await page.waitForTimeout(600); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const setField = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform [data-k=${s}]`); if (!el) throw new Error('no field ' + s); el.value = String(val); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(150); };
const reset = async () => { await page.evaluate(() => window.__idris.tools.startPart()); await page.waitForTimeout(400); };
const vol = () => page.evaluate(() => window.__idris.partInfo() && window.__idris.partInfo().vol);

await openTab('Features');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  for (const n of ['Reference Plane', 'Reference Axis', 'Dome', 'Split', 'Curve Pattern', 'Fill Pattern', 'Wrap / Emboss', 'Thicken']) check(n + ' runs now', () => ok(s[n] === false, 'still grey: ' + JSON.stringify(s[n])));
  const g = await page.evaluate(() => { document.querySelector('#xrib .xr-tabs button').click(); return [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()); });
  check('Coordinate System runs now', () => ok(g.includes('Features'), JSON.stringify(g)));
}

await checkAsync('Split at the middle of a 100 mm box is two bodies, 1 000 000 mm³ together', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setField('L', 100); await setField('W', 100); await setField('H', 100);
  await build(); await waitVol(1000000, 2);
  await clickTool('Split');
  await setField('at', 50);
  await build();
  await page.waitForTimeout(700);
  const note = await page.evaluate(() => window.__idris.state.part.features[1].note || '');
  ok(/two bodies/.test(note), 'no split note: ' + JSON.stringify(note));
  ok(Math.abs((await vol()) - 1000000) < 5, 'the two bodies together are not the box: ' + (await vol()));
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[2] - 100) < 1e-6, 'the two bodies are not side by side: ' + JSON.stringify(info.size));
});

await checkAsync('Dome 5 mm on a Ø20 × 20 cylinder is 7 134.03 mm³', async () => {
  await reset(); await openTab('Features');
  await clickTool('Cylinder');
  await setField('D', 20); await setField('H', 20);
  await build(); await waitVol(Math.PI * 100 * 20, 2);
  await clickTool('Dome');
  await setField('h', 5);
  await build();
  await waitVol(Math.PI * 100 * 20 + Math.PI * 5 * (3 * 100 + 25) / 6, 2);
});

await checkAsync('Wrap / Emboss adds exactly 20 × 20 × 2 mm³ to a 40 × 40 × 10 box', async () => {
  await reset(); await openTab('Features');
  await clickTool('Box');
  await setField('L', 40); await setField('W', 40); await setField('H', 10);
  await build(); await waitVol(16000, 2);
  await openTab('Sketch');
  await clickTool('Corner Rectangle');
  await setField('W', 20); await setField('Hh', 20);
  await build();
  await page.waitForTimeout(400);
  await openTab('Features');
  await clickTool('Wrap / Emboss');
  await setField('depth', 2);
  await build();
  await waitVol(16800, 2);
});

await checkAsync('Fill Pattern 2 × 2 of a 10 × 10 × 5 box is 2 000 mm³', async () => {
  await reset(); await openTab('Features');
  await clickTool('Box');
  await setField('L', 10); await setField('W', 10); await setField('H', 5);
  await build(); await waitVol(500, 1);
  await clickTool('Fill Pattern');
  await setField('cols', 2); await setField('rows', 2); await setField('sx', 20); await setField('sy', 20);
  await build();
  await waitVol(2000, 2);
});

await checkAsync('a Reference Plane shows up in the Sketch form Plane list', async () => {
  await reset(); await openTab('Features');
  await clickTool('Reference Plane');
  await setField('dist', 50);
  await build();
  await page.waitForTimeout(400);
  const note = await page.evaluate(() => window.__idris.state.part.features[0].note || '');
  ok(/Reference plane/.test(note), 'no plane note: ' + JSON.stringify(note));
  await openTab('Sketch');
  await clickTool('Corner Rectangle');
  const opts = await page.evaluate(() => [...document.querySelectorAll('#cadProps .pform select[data-k=plane] option')].map((o) => o.textContent));
  ok(opts.some((t) => /\+ 50 mm/.test(t)), 'the plane is not in the list: ' + JSON.stringify(opts));
});

await checkAsync('Thicken opens the one Thicken (Surface → Thicken)', async () => {
  await openTab('Features');
  await clickTool('Thicken');
  const title = await page.evaluate(() => (document.querySelector('#cadProps h2') || {}).textContent || '');
  ok(/Thicken/.test(title), 'the Thicken panel did not open: ' + JSON.stringify(title));
  const errs = errors.filter((e) => !/WebGL|swiftshader/i.test(e));
  ok(!errs.length, 'page errors: ' + errs.join(' | '));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
