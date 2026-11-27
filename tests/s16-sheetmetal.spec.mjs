/* S16: the Sheet Metal tab in the real page (Batch 2).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. all thirteen sheet-metal steps are runnable, Hem, Jog and Forming Tool included;
 *   2. Base Flange → Edge Flange → Flatten built through the forms gives 12000 mm³, 16165.49 mm³ and the
 *      flattens to 134.52 mm, with the kernel's numbers on the step and in the report;
 *   3. Flat Pattern opens in the Edit page, reads the open part's chain and downloads its DXF;
 *   4. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s16-sheetmetal.spec.mjs
 *
 * SHOTS=1 writes docs/s16-sheet-<w>x<h>.png and docs/s16-flat-<w>x<h>.png.
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
const page = await browser.newPage({ viewport: VP, acceptDownloads: true });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(800);

const tabs = await page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()));
check('the Sheet Metal tab is in the ribbon', () => ok(tabs.includes('Sheet Metal'), 'no Sheet Metal tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Sheet Metal');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const live = ['Base Flange', 'Edge Flange', 'Miter Flange', 'Sketched Bend', 'Hem', 'Jog', 'Unfold / Fold', 'Bend Allowance', 'Flat Pattern', 'Flatten', 'Corner Relief', 'Forming Tool', 'Convert to Sheet Metal'];
check('the thirteen sheet-metal steps are runnable', () => { const off = live.filter((n) => slot[n] !== false); ok(!off.length, 'still grey: ' + off.join(', ')); });

async function runTool(type, values) {
  await page.evaluate((t) => window.__idris.tools.partTool(t), type);
  await page.waitForSelector('#cadProps .pform', { timeout: 30000 });
  for (const [k, v] of Object.entries(values)) {
    const sel = `#cadProps .pform [data-k="${k}"]`;
    const tag = await page.$eval(sel, (n) => n.tagName).catch(() => null);
    if (!tag) throw new Error('no field ' + k + ' in the form');
    if (tag === 'SELECT') await page.selectOption(sel, String(v)); else await page.fill(sel, String(v));
    await page.waitForTimeout(120);
  }
  await page.click('#cadProps .pact .chip.primary');
  await page.waitForTimeout(1400);
}

await runTool('smbase', { L: 100, W: 60, t: 2, R: 2, material: 'steel', k: 0 });
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.vol > 1000; }, null, { timeout: 120000 });
const p1 = await page.evaluate(() => { const I = window.__idris.partInfo(); return { vol: I.vol, sheet: I.sheet && { t: I.sheet.t, k: I.sheet.k, flat: I.sheet.flat } }; });
check('the base flange is 12000 mm³ with the table K-factor', () => { ok(Math.abs(p1.vol - 12000) < 1, 'volume ' + p1.vol); ok(p1.sheet && p1.sheet.k === 0.44, 'K ' + JSON.stringify(p1.sheet)); });

const noteText = () => page.evaluate(() => (document.querySelector('#cadProps') || {}).textContent || '');
const tx1 = await noteText();
check('the step names the K it used and the kernel volume', () => { ok(/K 0\.44/.test(tx1), 'no K in the panel: ' + tx1.slice(0, 240)); ok(/12,?000|12\.000/.test(tx1), 'no volume in the panel'); });

await runTool('smedge', { edge: 'x+', angle: '90', F: 30 });
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.vol > 15000; }, null, { timeout: 120000 });
const p2 = await page.evaluate(() => { const I = window.__idris.partInfo(); return { vol: I.vol, flat: I.sheet.flat, folds: I.sheet.folds.length }; });
check('the edge flange adds the bend and the leg: 16165.49 mm³', () => ok(Math.abs(p2.vol - 16165.49) < 1, 'volume ' + p2.vol));
check('the developed length is 134.523893 mm', () => ok(Math.abs(p2.flat - 134.523893) < 1e-6, 'flat ' + p2.flat));
check('the chain has one bend', () => ok(p2.folds === 1, 'folds ' + p2.folds));
const tx2 = await noteText();
check('the step shows the allowance it used', () => ok(/4\.524/.test(tx2), 'no 4.524 allowance in the panel: ' + tx2.slice(0, 240)));
if (process.env.SHOTS) await page.screenshot({ path: `docs/s16-sheet-${VP.width}x${VP.height}.png` });

await runTool('smflatten', {});
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.vol < 16200 && I.vol > 16000; }, null, { timeout: 120000 });
const p3 = await page.evaluate(() => { const I = window.__idris.partInfo(); return { vol: I.vol, size: I.size, flat: I.sheet.flat }; });
check('flatten gives the plate of the developed length: 16142.87 mm³', () => ok(Math.abs(p3.vol - 16142.87) < 1, 'volume ' + p3.vol));
check('and it is 134.52 mm long', () => ok(Math.abs(p3.size[0] - 134.523893) < 0.01, 'length ' + p3.size[0]));
if (process.env.SHOTS) await page.screenshot({ path: `docs/s16-flat-${VP.width}x${VP.height}.png` });

/* Flat Pattern reads the part that is open and hands over its DXF */
await openTab('Sheet Metal');
await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Flat Pattern'); if (b) b.click(); });
await page.waitForTimeout(1200);
const chain = await page.evaluate(() => { const el = document.querySelector('#lppEdit [data-chain]'); return el ? el.textContent : ''; });
check('Flat Pattern names the open part\'s chain', () => ok(/1 tekukan|1 bend/.test(chain), 'chain block: ' + JSON.stringify(chain.slice(0, 160))));
const dl = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
  page.evaluate(() => { const b = document.querySelector('#sm-chain-dxf'); if (b) b.click(); }),
]).then((r) => r[0]);
check('and the DXF of that chain downloads', () => ok(dl && /flat-chain\.dxf/.test(dl.suggestedFilename()), 'download ' + (dl && dl.suggestedFilename())));

check('no page errors', () => ok(errors.length === 0, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP.width}×${VP.height})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
