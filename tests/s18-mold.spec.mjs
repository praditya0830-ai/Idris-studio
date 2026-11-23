/* S18: the Mold tab in the real page (Batch 4).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. Draft Analysis, Parting Line, Shut-off Surfaces, Core/Cavity and Shrinkage Scale are all runnable;
 *   2. a 60×40×20 block with a Ø8 through hole, built through the page, has its simple hole when the kernel says so:
 *      parting line at Z = 10 measures 200 + 2π·4 = 225.13 mm in two loops; shut-off fills π·4²·20 = 1005.31 mm³ and
 *      the part is 48000 mm³ again; shrinkage at ABS 0.5 % scales it to 48000 × 1.005³ = 48723.02 mm³;
 *   3. the step notes carry those numbers, and the tree lists the steps;
 *   4. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s18-mold.spec.mjs
 *
 * SHOTS=1 writes docs/s18-mold-<w>x<h>.png.
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
check('the Mold tab is in the ribbon', () => ok(tabs.includes('Mold'), 'no Mold tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Mold');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const live = ['Draft Analysis', 'Parting Line', 'Shut-off Surfaces', 'Core / Cavity', 'Shrinkage Scale'];
check('all five mould steps are runnable', () => { const off = live.filter((n) => slot[n] !== false); ok(!off.length, 'still grey: ' + off.join(', ') + ' / ' + JSON.stringify(slot)); });

/* a 60×40×20 block with a Ø8 hole straight down the pull direction (+Z) */
await page.evaluate(() => {
  const I = window.__idris;
  I.tools.startPart();
  I.state.part.features.push({ id: 'blk', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } });
  I.state.part.features.push({ id: 'hole', type: 'shape', p: { kind: 'cyl', D: 8, H: 40, x: 0, y: 0, z: -10, op: 'cut' } });
  I.tools.rebuildPart(true);
});
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.vol > 40000; }, null, { timeout: 120000 });
const info = () => page.evaluate(() => { const I = window.__idris.partInfo(); return I && { vol: I.vol, size: I.size, mass: I.mass }; });
const holeVol = 48000 - Math.PI * 16 * 20;
const p0 = await info();
check('the block with the Ø8 hole is built by the kernel', () => ok(Math.abs(p0.vol - holeVol) < 1, `${p0.vol} != ${holeVol.toFixed(2)}`));

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
  await page.waitForTimeout(1600);
}
const noteText = () => page.evaluate(() => (document.querySelector('#cadProps') || {}).textContent || '');

/* 1. the parting line is the kernel's section of the body */
await runTool('parting', { z: 10 });
const tx1 = await noteText();
check('the parting line at Z = 10 measures the block plus the hole circle', () => {
  ok(/225\.13 mm/.test(tx1), 'no 225.13 mm in the panel: ' + tx1.slice(-400));
  ok(/2 closed loop/.test(tx1), 'no two loops in the panel');
});

/* 2. shut-off fills the measured hole */
const v1 = (await info()).vol;
await runTool('shutoff', { minD: 0 });
const p2 = await info();
check('shut-off fills π·4²·20 = 1005.31 mm³ and the part is 48000 mm³ again', () => ok(Math.abs(p2.vol - 48000) < 1, `${p2.vol}`));
const tx2 = await noteText();
check('its note names the diameter and the volume the kernel filled', () => {
  ok(/Ø8\.0/.test(tx2), 'no Ø8.0 in the panel: ' + tx2.slice(-400));
  ok(/1,?005/.test(tx2), 'no filled volume in the panel');
});

/* 3. shrinkage scales the body the kernel built */
await runTool('shrink', { mat: 'ABS', pct: 0, about: 'centre' });
const p3 = await info();
check('ABS at 0.5 % scales the part to 48000 × 1.005³ = 48723.02 mm³', () => ok(Math.abs(p3.vol - 48000 * 1.005 ** 3) < 2, `${p3.vol}`));
check('and the size follows: 60.3 × 40.2 × 20.1 mm', () => {
  ok(Math.abs(p3.size[0] - 60.3) < 0.02 && Math.abs(p3.size[2] - 20.1) < 0.02, JSON.stringify(p3.size));
});
const tx3 = await noteText();
check('the shrinkage note gives the factor, both volumes and both sizes', () => {
  ok(/×1\.0050/.test(tx3), 'no factor in the panel: ' + tx3.slice(-400));
  ok(/0\.3–0\.8/.test(tx3), 'no material range in the panel');
  ok(/48,?000 → 48,?7/.test(tx3), 'no volume before/after in the panel');
});

if (process.env.SHOTS) {
  await openTab('Mold');
  await page.screenshot({ path: `docs/s18-mold-${VP.width}x${VP.height}.png` });
}

const tree = await page.evaluate(() => [...document.querySelectorAll('#cadLeft .pft .pfn')].map((n) => n.textContent.trim()));
check('the tree lists the parting line, the shut-off and the shrinkage step', () => {
  ok(tree.some((x) => /Parting Line/.test(x) && /Z = 10/.test(x)), 'no parting step in ' + JSON.stringify(tree));
  ok(tree.some((x) => /Shut-off/.test(x)), 'no shut-off step');
  ok(tree.some((x) => /Shrinkage/.test(x) && /ABS/.test(x)), 'no shrinkage step with its material');
});

check('no page errors', () => ok(errors.length === 0, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP.width}×${VP.height})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
