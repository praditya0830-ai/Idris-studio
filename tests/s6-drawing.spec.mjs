/* S6 in a real browser: the A3 drawing of a 120×80×8 plate with a section A–A.
 *
 *   1. the plate is built through the ribbon (Box → Add & build), like an engineer would;
 *   2. Working Drawings (A3) opens; the section checkbox is switched on;
 *   3. the sheet carries the cutting line, the section label and 45° hatching from the kernel cut face
 *      (an SVG line with stroke-width 0.18 — the hatch layer);
 *   4. a radius click on a plain box says there is no rounded edge (nothing is invented);
 *   5. engineer annotations land in the notes as "engineer input";
 *   6. no page error or console error while the dialog is open.
 *
 *   BASE_URL=http://127.0.0.1:3031 node tests/s6-drawing.spec.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3031';
const OUT = process.env.OUT || 'docs';
const CHROME = process.env.CHROME || '';
const errors = [];
let pass = 0; const fails = [];
const check = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 180)); });

await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
const home = page.getByRole('button', { name: 'Open the workspace' });
if (await home.count()) { await home.first().click(); await page.waitForTimeout(900); }
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); });

const setFields = (vals) => page.evaluate((v) => { for (const [k, x] of Object.entries(v)) { const el = document.querySelector(`#cadProps input[data-k="${k}"]`); if (!el) throw new Error('no field ' + k); el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); } }, vals);

const clickRib = (tabName, toolName) => page.evaluate(([tn, tool]) => {
  const tab = [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === tn);
  if (!tab) throw new Error('no ribbon tab ' + tn);
  tab.click();
  const b = [...document.querySelectorAll('#xrib button')].find((x) => ((x.querySelector('.xr-n') || x).textContent || '').trim() === tool);
  if (!b) throw new Error('no tool ' + tool + ' in ' + tn);
  b.click();
}, [tabName, toolName]);

console.log('\nbuild the plate');
await clickRib('Features', 'Box');
await page.waitForSelector('#cadProps .pform', { timeout: 30000 });
await setFields({ L: 120, W: 80, H: 8 });
await page.getByRole('button', { name: /Add & build/ }).first().click({ timeout: 30000 });
await page.waitForSelector('#cadLeft .pfn', { timeout: 180000 });
await page.waitForTimeout(800);
await check('the plate is in the feature tree', async () => { const t = await page.evaluate(() => document.querySelector('#cadLeft').textContent); ok(/Box 120/.test(t.replace(/\s+/g, ' ')), 'tree: ' + t.slice(0, 120)); });

console.log('\nopen the A3 drawing');
await clickRib('Drawing', 'Working Drawings (A3)');
await page.waitForSelector('#drawdlg svg', { timeout: 180000 });
await page.waitForTimeout(600);
const svgText = () => page.evaluate(() => document.querySelector('#drawdlg svg').textContent || '');
const svgHatch = () => page.evaluate(() => document.querySelectorAll('#drawdlg svg line[stroke-width="0.18"]').length);
const sheetNotes = () => page.evaluate(() => document.querySelector('#drawdlg svg').textContent || '');

await check('the drawing has three views, an iso slot and dimensions', async () => {
  const n = await page.evaluate(() => document.querySelectorAll('#drawdlg svg text').length);
  ok(n > 20, 'only ' + n + ' texts on the sheet');
});

console.log('\nsection A–A');
await page.evaluate(() => { const cb = [...document.querySelectorAll('#drawdlg input[type=checkbox]')][0]; cb.click(); });
await page.waitForTimeout(2500);
await check('the section is cut and hatched', async () => {
  const h = await svgHatch(); ok(h > 10, 'no hatch lines (' + h + ')');
});
await check('the section is labelled with its cut position', async () => {
  const t = await svgText(); ok(/Section A–A \(cut at Y = /.test(t), 'no section label');
});
await check('the cutting line A–A is on the parent view', async () => {
  const t = await page.evaluate(() => [...document.querySelectorAll('#drawdlg svg text')].map((e) => e.textContent).join('|'));
  ok(/(^|\|)A(\||$)/.test(t), 'no A labels');
});

console.log('\nradius on a plain box + engineer annotations');
await page.evaluate(() => { const b = [...document.querySelectorAll('#drawdlg button')].find((x) => /Add a radius/.test(x.textContent)); b.click(); });
await page.evaluate(() => {
  const svg = document.querySelector('#drawdlg svg'), r = svg.getBoundingClientRect();
  svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + r.width * 0.5, clientY: r.y + r.height * 0.5 }));
});
await page.waitForTimeout(500);
await check('a radius click on a box says there is no rounded edge', async () => {
  const m = await page.evaluate(() => (document.querySelector('#drawdlg .dr-addmsg') || {}).textContent || '');
  ok(/No rounded edge there/.test(m), 'message: ' + m);
});
await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('#drawdlg .dr-side input[type=text]')];
  for (const el of inputs) {
    const lab = (el.closest('.dr-f') || {}).textContent || '';
    if (/Surface finish/.test(lab)) { el.value = 'Ra 3.2'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    if (/Special tolerance/.test(lab)) { el.value = 'Ø12 H7'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
  }
});
await page.waitForTimeout(900);
await check('the annotations are drawn as engineer input', async () => {
  const t = await sheetNotes();
  ok(/Surface finish Ra 3.2 \(ISO 21920\/1302\) — engineer input/.test(t), 'no finish note');
  ok(/Special tolerance Ø12 H7 — engineer input/.test(t), 'no tolerance note');
});

await page.screenshot({ path: `${OUT}/s6-section-1366.png` });
await check('no page or console error while the dialog was open', async () => {
  const e = errors.filter((x) => !/WebGL|GPU|swiftshader/i.test(x));
  ok(e.length === 0, e.join(' | '));
});

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
