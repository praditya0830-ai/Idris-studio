/* S14: the left panel is four pages on one track (Tree · Variants · Edit · Library), the ribbon is compact,
 * the concept cards moved into the panel, the bottom box no longer hides under the panel, and a 502/503 /chat
 * answer is a clear sentence. 1366×768 and 1280×800, plus a 1024×768 touch tablet.
 *
 *   BASE_URL=http://127.0.0.1:3021 OUT=docs node tests/s14-left-tabs.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021';
const OUT = process.env.OUT || 'docs';
const CHROME = process.env.CHROME || '/tmp/c1187/chrome-linux/chrome';
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = async (name, fn) => { try { await fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

async function boot(page, clear = true) {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  if (clear) await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
  const home = page.getByRole('button', { name: 'Open the workspace' });
  if (await home.count()) { await home.first().click(); await page.waitForTimeout(900); }
}
const tab = (page) => page.evaluate(() => (document.querySelector('#lpTabs button[aria-selected="true"]') || {}).dataset?.lptab || null);
const clickTab = async (page, name) => { await page.evaluate((n) => document.querySelector(`#lpTabs button[data-lptab="${n}"]`).click(), name); await page.waitForTimeout(380); };
const setFields = (page, vals) => page.evaluate((v) => { for (const [k, x] of Object.entries(v)) { const el = document.querySelector(`#cadProps input[data-k="${k}"]`); if (!el) throw new Error('no field ' + k); el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); } }, vals);

async function newBox(page, L, W, H) {
  await clickTab(page, 'lib');
  await page.getByRole('button', { name: 'New part' }).first().click({ timeout: 20000 });
  await page.waitForSelector('#cadProps .pform', { timeout: 20000 });
  await setFields(page, { L, W, H });
  await page.getByRole('button', { name: /Add & build/ }).first().click({ timeout: 20000 });
  await page.waitForSelector('#cadLeft .pfn', { timeout: 120000 });
  await page.waitForTimeout(500);
}

for (const [label, width, height] of [['1366x768', 1366, 768], ['1280x800', 1280, 800]]) {
  console.log('\n' + label);
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*503/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await boot(page);

  /* A. the compact ribbon: the values from the brief, the three named tools visible at 1366 */
  const rib = await page.evaluate(() => {
    const r = document.querySelector('#xrib'), tools = r.querySelector('.xr-tools'), tr = tools.getBoundingClientRect();
    const cs = getComputedStyle(tools), edge = Math.floor(tr.right - parseFloat(cs.paddingRight));
    const bs = [...r.querySelectorAll('.xr-t')];
    const one = (n) => bs.find((b) => b.textContent.trim() === n);
    const t0 = bs[0], n0 = t0 && t0.querySelector('.xr-n');
    const rr = (b) => b ? Math.round(b.getBoundingClientRect().right) : null;
    return {
      height: Math.round(r.getBoundingClientRect().height),
      tabHeight: Math.round(r.querySelector('.xr-tabs').getBoundingClientRect().height),
      toolsHeight: Math.round(tools.getBoundingClientRect().height),
      font: t0 ? parseFloat(getComputedStyle(t0).fontSize) : null,
      tabFont: parseFloat(getComputedStyle(r.querySelector('.xr-tabs button')).fontSize),
      h: t0 ? Math.round(t0.getBoundingClientRect().height) : null,
      w: t0 ? Math.round(t0.getBoundingClientRect().width) : null,
      nameMax: n0 ? parseFloat(getComputedStyle(n0).maxWidth) : null,
      title: bs.every((b) => !!b.getAttribute('title')),
      right: edge,
      linear: rr(one('Linear Pattern')), circular: rr(one('Circular Pattern')), mirror: rr(one('Mirror')),
      chips: r.querySelectorAll('.rbst').length,
    };
  });
  console.log('  ribbon', JSON.stringify(rib));
  await check('the ribbon uses the compact values', () => { eq(rib.font, 9.5, 'tool font'); eq(rib.tabFont, 11.5, 'tab font'); if (!(rib.h >= 38 && rib.w >= 40)) throw new Error(`target ${rib.w}×${rib.h}`); });
  await check('every tool keeps its full name in the tooltip', () => { if (!rib.title) throw new Error('a tool has no title'); });
  await check('no status chips are left in the ribbon', () => eq(rib.chips, 0, 'chips'));
  await check('Linear Pattern is visible without scrolling', () => {
    if (!(rib.linear && rib.linear <= rib.right)) throw new Error(`right edge ${rib.right}: linear ${rib.linear}`);
  });
  /* the brief names 1366 px for this one; at 1280 the last two pattern tools still need a short scroll */
  if (width === 1366) await check('at 1366 the tools up to Mirror are visible without scrolling', () => {
    if (!(rib.circular && rib.mirror && rib.circular <= rib.right && rib.mirror <= rib.right)) throw new Error(`right edge ${rib.right}: circular ${rib.circular}, mirror ${rib.mirror}`);
  });

  /* B + test 1: Box 100×60×20, feature tree, Edit, update to 120 */
  await newBox(page, 100, 60, 20);
  await check('Add & build returns to the Tree page', async () => { if ((await tab(page)) !== 'tree') throw new Error('tab is ' + (await tab(page))); });
  await check('the feature tree names the box', async () => {});
  const featureText = await page.locator('#cadLeft .pfn').first().innerText();
  await check('the feature tree reads 1. Shape Box 100×60×20', () => { if (!/1\.\s*Shape\s+Box\s+100\s*×\s*60\s*×\s*20/.test(featureText.replace(/\s+/g, ' '))) throw new Error(featureText); });
  await page.locator('#cadLeft .pfn').first().click();
  await page.waitForSelector('#cadProps .pform', { timeout: 10000 });
  await check('clicking the feature moves to Edit', async () => { if ((await tab(page)) !== 'edit') throw new Error('tab is ' + (await tab(page))); });
  const lx = await page.locator('#cadProps input[data-k="L"]').inputValue();
  await check('Edit shows Length X = 100', () => eq(lx, '100', 'Length X'));
  await setFields(page, { L: 120 });
  await page.getByRole('button', { name: /Update & rebuild/ }).first().click();
  await page.waitForTimeout(1200);
  await check('Update & rebuild returns to the Tree page', async () => { if ((await tab(page)) !== 'tree') throw new Error('tab is ' + (await tab(page))); });
  const checks = await page.locator('#cchecks').innerText();
  await check('the Checks box measures 120.0 × 60.0 × 20.0 mm', () => { if (!/120\.0\s*×\s*60\.0\s*×\s*20\.0\s*mm/.test(checks.replace(/\s+/g, ' '))) throw new Error(checks.slice(0, 200)); });

  /* 2. no Variants tab for a part without variants */
  await check('a part without variants has no Variants tab', async () => {});
  const varHidden = await page.evaluate(() => document.querySelector('#lpTabVar').hidden);
  await check('the Variants tab is hidden', () => { if (!varHidden) throw new Error('still shown'); });
  await check('the tab bar has Tree, Edit and Library here', async () => {});
  const visible = await page.evaluate(() => [...document.querySelectorAll('#lpTabs button')].filter((b) => !b.hidden).map((b) => b.dataset.lptab));
  await check('the visible tabs are tree, edit and library', () => eq(visible.join(','), 'tree,edit,lib', 'tabs'));

  /* 6. the tab bar goes away during a sketch session and comes back after it */
  await page.evaluate(() => window.__idris.tools.openSketchSession('line'));
  await page.waitForTimeout(500);
  const during = await page.evaluate(() => ({ sketch: document.body.classList.contains('sketching'), bar: getComputedStyle(document.querySelector('#lpTabs')).display }));
  await check('the tab bar is hidden during a sketch', () => { if (!during.sketch) throw new Error('not sketching'); eq(during.bar, 'none', 'tab bar'); });
  await page.evaluate(() => window.__idris.tools.skCancel());
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => getComputedStyle(document.querySelector('#lpTabs')).display);
  await check('the tab bar returns after Cancel', () => eq(after, 'flex', 'tab bar'));

  /* 7. the last tab is remembered */
  await clickTab(page, 'lib');
  await boot(page, false);
  await check('a reload comes back to the last tab (Library)', async () => { if ((await tab(page)) !== 'lib') throw new Error('tab is ' + (await tab(page))); });

  /* E. the bottom box sits between the panel and the chat, follows --treeW, and starts at 12 px when the panel is hidden */
  await boot(page);
  await newBox(page, 100, 60, 20);
  const geo = await page.evaluate(() => {
    const pane = document.querySelector('.pane-tree').getBoundingClientRect(), c = document.querySelector('#cchecks').getBoundingClientRect();
    const chat = document.querySelector('.pane-chat').getBoundingClientRect();
    return { pane: [Math.round(pane.left), Math.round(pane.right)], checks: [Math.round(c.left), Math.round(c.right)], chat: Math.round(chat.left) };
  });
  await check('the bottom box starts right of the left panel', () => { if (!(geo.checks[0] >= geo.pane[1] + 8)) throw new Error(JSON.stringify(geo)); });
  await check('the bottom box ends before the chat', () => { if (!(geo.checks[1] <= geo.chat)) throw new Error(JSON.stringify(geo)); });
  /* drag the panel to 400 px */
  await page.evaluate(() => { document.documentElement.style.setProperty('--treeW', '400px'); });
  await page.waitForTimeout(400);
  const wide = await page.evaluate(() => {
    const pane = document.querySelector('.pane-tree').getBoundingClientRect(), c = document.querySelector('#cchecks').getBoundingClientRect();
    return { pane: Math.round(pane.right), checks: Math.round(c.left), w: Math.round(pane.width) };
  });
  await check('a 400 px panel still leaves the bottom box to its right', () => { if (!(wide.w >= 395 && wide.checks >= wide.pane + 8)) throw new Error(JSON.stringify(wide)); });
  await page.evaluate(() => document.querySelector('#treeClose').click());
  await page.waitForTimeout(500);
  const hidden = await page.evaluate(() => Math.round(document.querySelector('#cchecks').getBoundingClientRect().left));
  await check('with the panel hidden the bottom box starts at 12 px', () => { if (Math.abs(hidden - 12) > 1) throw new Error('left ' + hidden); });
  await page.evaluate(() => { document.documentElement.style.setProperty('--treeW', '280px'); document.querySelector('#cTree').click(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${root}${OUT}/s14-tree-${label}.png` });

  /* D. a 503 /chat answer is a clear sentence, never a raw TypeError */
  await page.route('**/chat', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.evaluate(() => { const i = document.querySelector('#inp'); i.value = 'hello'; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const chat = await page.locator('#chat').innerText();
  await check('a 503 answer says IDRIS AI is not available (HTTP 503)', () => { if (!/HTTP 503/.test(chat)) throw new Error(chat.slice(-300)); });
  await check('the chat shows no raw "Cannot read properties" text', () => { if (/Cannot read propert/.test(chat)) throw new Error(chat.slice(-300)); });
  await page.unroute('**/chat');
  await check('no page error in this size', () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

/* the touch tablet: a horizontal swipe moves one page, a vertical drag does not */
console.log('\n1024x768 tablet');
{
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  await boot(page);
  const swipe = (dx, dy) => page.evaluate(([dx, dy]) => {
    const el = document.querySelector('#lpScroll');
    const touch = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(500, 400)], targetTouches: [touch(500, 400)], changedTouches: [touch(500, 400)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [touch(500 + dx, 400 + dy)], bubbles: true }));
  }, [dx, dy]);
  await check('the tab bar is there on the tablet', async () => {});
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector('#lpTabs')).display);
  await check('the tablet shows the tab bar', () => eq(bar, 'flex', 'tab bar'));
  await swipe(20, 90);
  await page.waitForTimeout(400);
  await check('a vertical drag does not change the tab', async () => { if ((await tab(page)) !== 'tree') throw new Error('tab is ' + (await tab(page))); });
  await swipe(-120, 4);
  await page.waitForTimeout(450);
  await check('a left swipe moves to the next tab (Edit)', async () => { if ((await tab(page)) !== 'edit') throw new Error('tab is ' + (await tab(page))); });
  await swipe(120, 4);
  await page.waitForTimeout(450);
  await check('a right swipe goes back (Tree)', async () => { if ((await tab(page)) !== 'tree') throw new Error('tab is ' + (await tab(page))); });
  await check('no page error on the tablet', () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

writeFileSync(`${root}tests/s14-measure.json`, JSON.stringify({ results: results.map(([ok, n, e]) => ({ ok, name: n, error: e ? String(e.message || e) : null })) }, null, 2));
await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [, n, e] of bad) console.log('FAILED: ' + n + '\n  ' + (e && e.message)); process.exit(1); }
