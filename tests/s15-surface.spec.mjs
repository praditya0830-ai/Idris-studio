/* S15: the Surface tab in the real page (Batch 1).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. the eight surface tools are runnable (not aria-disabled), and the one the kernel cannot do yet stays grey
 *      (Boundary, Filled and Trim Surface left this list as batches 5–6 shipped them);
 *   2. a sketch → Extruded Surface → Thicken chain built through the forms gives a surface body (area from the
 *      kernel, no volume claimed) and then a solid of 3120 mm3 for a 20×10 profile pushed 30 mm, 2 mm thick;
 *   3. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s15-surface.spec.mjs
 *
 * SHOTS=1 writes docs/s15-surface-<w>x<h>.png after the surface and after the solid.
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(800);

/* 1. the tab and its honest statuses */
const tabNames = () => page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()));
const tabs = await tabNames();
check('the Surface tab is in the ribbon', () => ok((tabs || []).includes('Surface'), 'no Surface tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Surface');
const tools = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const slot = await tools();
const live = ['Extruded Surface', 'Revolved Surface', 'Swept Surface', 'Lofted Surface', 'Planar Surface', 'Offset Surface', 'Knit Surface', 'Thicken'];
const grey = ['Delete Face'];
check('the eight surface tools are runnable', () => { const off = live.filter((n) => slot[n] !== false); ok(!off.length, 'still grey: ' + off.join(', ')); });
check('the one the kernel cannot do stays grey', () => { const on = grey.filter((n) => slot[n] !== true); ok(!on.length, 'runnable although not built: ' + on.join(', ')); });

/* build through the forms, the way an engineer does */
async function runTool(type, values) {
  await page.evaluate((t) => window.__idris.tools.partTool(t), type);
  await page.waitForSelector('#cadProps .pform', { timeout: 30000 });
  for (const [k, v] of Object.entries(values)) {
    const sel = `#cadProps .pform [data-k="${k}"]`;
    const tag = await page.$eval(sel, (n) => n.tagName).catch(() => null);
    if (!tag) throw new Error('no field ' + k + ' in the form');
    if (tag === 'SELECT') await page.selectOption(sel, String(v));
    else { await page.fill(sel, String(v)); }
    await page.waitForTimeout(120);
  }
  await page.click('#cadProps .pact .chip.primary');
  await page.waitForTimeout(1200);
}

await runTool('sketch', { prof: 'rect', plane: 'XY', at: 'value', W: 20, Hh: 10, off: 0 });
await runTool('surfext', { len: 30 });
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.surface; }, null, { timeout: 120000 });
const surf = await page.evaluate(() => { const I = window.__idris.partInfo(); return { surface: !!I.surface, area: I.area, vol: I.vol }; });
check('a surface body reports an area and no volume', () => { ok(surf.surface, 'not a surface body'); ok(Math.abs(surf.area - 1800) < 1, 'area ' + surf.area); ok(surf.vol == null, 'claims a volume: ' + surf.vol); });
const formText = await page.evaluate(() => (document.querySelector('#cadProps') || {}).textContent || '');
check('the step says the area came from the kernel', () => ok(/1,?800\.0 mm²/.test(formText), 'no kernel area in the panel: ' + formText.slice(0, 300)));
if (process.env.SHOTS) await page.screenshot({ path: `docs/s15-surface-${VP.width}x${VP.height}.png` });

/* 2. Thicken, then the solid numbers */
await runTool('surfthick', { t: 2 });
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && !I.surface && I.vol > 1000; }, null, { timeout: 120000 });
const solid = await page.evaluate(() => { const I = window.__idris.partInfo(); return { vol: I.vol, area: I.area, surface: !!I.surface }; });
check('Thicken gives a solid of 3120 mm3 (20×10 pushed 30, 2 mm wall)', () => ok(Math.abs(solid.vol - 3120) < 1, 'volume ' + solid.vol));
check('the solid has its own kernel area', () => ok(solid.area > 3000, 'area ' + solid.area));
if (process.env.SHOTS) await page.screenshot({ path: `docs/s15-solid-${VP.width}x${VP.height}.png` });

check('no page errors', () => ok(errors.length === 0, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP.width}×${VP.height})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
