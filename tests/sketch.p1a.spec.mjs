/* P1a in a real browser: draw with a mouse at 1366×768 and with a finger at tablet size.
 *
 * Everything goes through the interface: the home screen's "Open the workspace", the design tree's "New part", the
 * ribbon's Sketch tab and its Line tool, then real pointer events on the viewport. After drawing, Save sketch puts
 * the closed profile into the feature tree.
 *
 *   BASE_URL=http://127.0.0.1:3000 node tests/sketch.p1a.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

/* the full Chromium build; the headless shell on this VM has no font backend, so text would not render */
const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

async function boot(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cv', { timeout: 30000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cv', { timeout: 30000 });
  const home = page.getByRole('button', { name: 'Open the workspace' });
  if (await home.count()) { await home.first().click(); await page.waitForTimeout(900); }
  /* one column of room: the chat is not needed for sketching */
  const chatClose = page.locator('#chatClose');
  if (await chatClose.isVisible().catch(() => false)) await chatClose.click().catch(() => {});
  await page.locator('#tree').getByRole('button', { name: 'New part' }).first().click({ timeout: 15000 });
  await page.waitForSelector('#cadProps .pform', { timeout: 15000 });
}

async function openSession(page) {
  await page.getByRole('tab', { name: 'Sketch', exact: true }).first().click();
  await page.getByRole('button', { name: /^Line\b/ }).first().click();
  await page.waitForFunction(() => !!document.querySelector('.skstat'), null, { timeout: 15000 });
}

const boxOf = async (page, sel) => page.locator(sel).boundingBox();

async function drawLoopAt(page, cx, cy, tap, dx = 190, dy = 120) {
  const x0 = Math.round(cx), y0 = Math.round(cy), x1 = x0 + dx, y1 = y0 + dy;
  for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
    if (tap) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    await page.waitForTimeout(110);
  }
  if (tap) { await page.touchscreen.tap(x0, y0); await page.waitForTimeout(160); }
  else { await page.mouse.click(x0, y0); await page.mouse.dblclick(x0, y0); }
  await page.waitForTimeout(450);
}

/** a point that really hits the viewport: on a tablet the chat and the tree can cover the middle of the canvas */
const reachable = (page) => page.evaluate(() => {
  const cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
  for (let fy = 0.35; fy <= 0.75; fy += 0.1) for (let fx = 0.2; fx <= 0.8; fx += 0.1) {
    const x = r.x + r.width * fx, y = r.y + r.height * fy;
    if (document.elementFromPoint(x, y) === cv) return { x, y, room: Math.min(r.right - x - 20, 260), height: Math.min(r.bottom - y - 30, 160) };
  }
  return null;
});

const readSketch = (page) => page.evaluate(() => {
  const txt = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ') : ''; };
  return {
    stat: txt('.skstat'),
    entities: [...document.querySelectorAll('#cadProps .sklist li')].map((li) => li.innerText.replace(/\s+/g, ' ')),
    paths: document.querySelectorAll('#skSvg path').length,
    saved: [...document.querySelectorAll('#cadLeft .pfn b')].map((b) => b.textContent),
    panel: txt('#cadProps'),
  };
});

console.log('\nMouse at 1366×768');
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await openSession(page);
  const empty = await readSketch(page);
  check('the ribbon Line tool opens an empty sketch session', () => { if (!/Empty sketch/.test(empty.stat)) throw new Error(empty.stat); });
  const box = await boxOf(page, '#cv');
  check('the viewport has room to draw', () => { if (!(box && box.width > 600 && box.height > 300)) throw new Error(JSON.stringify(box)); });
  await drawLoopAt(page, box.x + box.width * 0.42, box.y + box.height * 0.42, false);
  const s = await readSketch(page);
  check('four mouse clicks draw four lines', () => eq(s.entities.length, 4, 'lines drawn'));
  check('the loop closes while drawing', () => { if (!/closed profile/.test(s.stat)) throw new Error(s.stat); });
  check('the status is under-defined, not over-defined', () => { if (!/^Under-defined/.test(s.stat)) throw new Error(s.stat); });
  check('the lines are visible in the viewport', () => eq(s.paths, 5, 'svg paths (4 lines + chain end)'));
  check('the panel lists the four lines', () => { if (!s.entities.every((e) => /^Line \d/.test(e))) throw new Error(JSON.stringify(s.entities)); });
  await page.screenshot({ path: root + 'docs/p1a-sketch-1366.png' });
  await page.getByRole('button', { name: 'Save sketch' }).click();
  await page.waitForTimeout(600);
  const saved = await readSketch(page);
  check('Save sketch puts the closed profile in the feature tree', () => { if (!saved.saved.some((n) => /Sketch/.test(n))) throw new Error(JSON.stringify(saved.saved)); });
  check('no page error while drawing with the mouse', () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

console.log('\nTouch at 800×1280 (tablet)');
{
  const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  await openSession(page);
  const close = page.locator('#chatClose');
  if (await close.isVisible().catch(() => false)) { await close.click(); await page.waitForTimeout(400); }
  const at = await reachable(page);
  check('the viewport stays reachable on a tablet', () => { if (!at) throw new Error('the chat or the tree covers the whole canvas'); });
  await drawLoopAt(page, at.x, at.y, true, Math.min(150, at.room), Math.min(100, at.height));
  const t = await readSketch(page);
  check('four taps draw four lines with a finger', () => eq(t.entities.length, 4, 'tapped lines'));
  check('the tapped loop closes', () => { if (!/closed profile/.test(t.stat)) throw new Error(t.stat); });
  await page.screenshot({ path: root + 'docs/p1a-sketch-tablet.png' });
  await page.getByRole('button', { name: 'Save sketch' }).click();
  await page.waitForTimeout(600);
  const saved = await readSketch(page);
  check('the touch sketch saves as a feature', () => eq(saved.saved.filter((n) => /Sketch/.test(n)).length, 1, 'sketch features'));
  check('no page error while drawing with a finger', () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [, n, e] of bad) console.log('FAILED: ' + n + '\n  ' + (e && e.message)); process.exit(1); }
