/* S17: the Weldments tab in the real page (Batch 3).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. Structural Member, End Cap, Gusset, Weld Bead and Cut List are runnable; Trim/Extend stays grey;
 *   2. a 500×300 frame of SHS 40×40×3 built through the forms measures its kernel volume, then a gusset and a weld
 *      bead each add the prism the step says: 2400 mm³ and 720 mm³;
 *   3. the step notes carry the kernel numbers, and Cut List prints the members it built;
 *   4. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s17-weldments.spec.mjs
 *
 * SHOTS=1 writes docs/s17-weld-<w>x<h>.png.
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
check('the Weldments tab is in the ribbon', () => ok(tabs.includes('Weldments'), 'no Weldments tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Weldments');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const live = ['Structural Member', 'End Cap', 'Gusset', 'Weld Bead', 'Cut List'];
check('the five weldment steps are runnable', () => { const off = live.filter((n) => slot[n] !== false); ok(!off.length, 'still grey: ' + off.join(', ')); });
check('Trim/Extend stays grey', () => ok(slot['Trim/Extend'] === true, 'Trim/Extend is runnable although it is not built'));

/* the sketch the frame runs along: a page-level sketch step, then every tool below is run from the ribbon */
await page.evaluate(() => {
  const I = window.__idris;
  I.tools.startPart();
  const line = (id, ax, ay, bx, by) => ({ id, t: 'line', a: [ax, ay], b: [bx, by], c: 0 });
  I.state.part.features.push({ id: 'fr', type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0,
    ents: [line('b', 0, 0, 500, 0), line('r', 500, 0, 500, 300), line('t', 500, 300, 0, 300), line('l', 0, 300, 0, 0)], rels: [], dims: [] } });
  I.tools.rebuildPart(true);
});
await page.waitForTimeout(600);

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
const info = () => page.evaluate(() => { const I = window.__idris.partInfo(); return I && { vol: I.vol, size: I.size, mass: I.mass }; });
const noteText = () => page.evaluate(() => (document.querySelector('#cadProps') || {}).textContent || '');

await runTool('member', { profile: 'SHS 40x40x3', trim: 'none' });
await page.waitForFunction(() => { const I = window.__idris.partInfo(); return I && I.vol > 1000; }, null, { timeout: 120000 });
const p1 = await info();
check('the 500×300 SHS 40×40×3 frame is built by the kernel', () => {
  ok(p1.vol > 690000 && p1.vol < 710400, 'frame volume ' + p1.vol);
  ok(Math.abs(p1.size[0] - 540) < 0.01 && Math.abs(p1.size[1] - 340) < 0.01, 'size ' + JSON.stringify(p1.size));
});
const tx1 = await noteText();
check('the member step names the standard and the table area', () => { ok(/EN 10219-2/.test(tx1), 'no standard in the panel: ' + tx1.slice(0, 200)); ok(/421/.test(tx1), 'no table A in the panel'); });

const v1 = p1.vol;
await runTool('gusset', { sketch: 'fr', profile: 'SHS 40x40x3', lg: 40, lh: 30, t: 4, cx: 0, cy: 0 });
await page.waitForFunction((v) => { const I = window.__idris.partInfo(); return I && I.vol > v + 1000; }, v1, { timeout: 120000 });
const p2 = await info();
check('the gusset adds the 2400 mm³ prism', () => ok(Math.abs(p2.vol - v1 - 2400) < 1, `+${(p2.vol - v1).toFixed(1)} mm³`));
const tx2 = await noteText();
check('its note gives the legs, the angle and the prism volume', () => { ok(/Gusset plate/.test(tx2), 'no gusset note: ' + tx2.slice(0, 240)); ok(/2,?400/.test(tx2), 'no prism volume in the note'); ok(/sin 90\.0°/.test(tx2), 'no section angle in the note'); });

const v2 = p2.vol;
await runTool('weld', { sketch: 'fr', profile: 'SHS 40x40x3', leg: 6, cx: 0, cy: 0 });
await page.waitForFunction((v) => { const I = window.__idris.partInfo(); return I && I.vol > v + 300; }, v2, { timeout: 120000 });
const p3 = await info();
check('the weld bead adds the 720 mm³ fillet', () => ok(Math.abs(p3.vol - v2 - 720) < 1, `+${(p3.vol - v2).toFixed(1)} mm³`));
const tx3 = await noteText();
check('its note names the leg, the section and the prism', () => { ok(/Fillet bead/.test(tx3), 'no bead note: ' + tx3.slice(0, 240)); ok(/720/.test(tx3), 'no prism volume in the note'); ok(/6\.0 mm/.test(tx3), 'no leg size in the note'); });

if (process.env.SHOTS) await page.screenshot({ path: `docs/s17-weld-${VP.width}x${VP.height}.png` });

const tree = await page.evaluate(() => [...document.querySelectorAll('#cadLeft .pft .pfn')].map((n) => n.textContent.trim()));
check('the tree lists the sketch, the members, the gusset and the bead', () => ok(tree.some((x) => /Structural Member/.test(x) && /SHS 40x40x3/.test(x)) && tree.some((x) => /Gusset/.test(x) && /40×30×4/.test(x)) && tree.some((x) => /Weld Bead/.test(x) && /leg 6|6 mm/.test(x)), JSON.stringify(tree)));

/* Cut List reads the members the kernel built */
await openTab('Weldments');
await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Cut List'); if (b) b.click(); });
await page.waitForTimeout(1200);
const said = await page.evaluate(() => (document.querySelector('#chat') || {}).textContent || '');
check('Cut List prints the 2 × 500 mm and 2 × 300 mm members', () => { ok(/2× SHS 40x40x3 500\.0 mm/.test(said), 'no 500 mm row in ' + JSON.stringify(said.slice(-300))); ok(/2× SHS 40x40x3 300\.0 mm/.test(said), 'no 300 mm row'); });

check('no page errors', () => ok(errors.length === 0, errors.join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed (${VP.width}×${VP.height})`);
await browser.close();
process.exit(fails.length ? 1 : 0);
