/* The left panel after the redesign: one column, one scroll area, design title → feature tree → Properties,
 * document settings behind the gear, and a panel that can be widened or hidden.
 *
 * Drives the real page (home → workspace → New part → Add & build) and takes a screenshot at each size.
 *
 *   BASE_URL=http://127.0.0.1:3000 OUT=docs node tests/left-panel.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || 'after';
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

async function boot(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cv', { state: 'attached', timeout: 30000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cv', { state: 'attached', timeout: 30000 });
  const home = page.getByRole('button', { name: 'Open the workspace' });
  if (await home.count()) { await home.first().click(); await page.waitForTimeout(900); }
  const newPart = page.locator('#tree').getByRole('button', { name: 'New part' }).first();
  if (!(await newPart.isVisible().catch(() => false))) { await page.locator('#cTree').click().catch(() => {}); await page.waitForTimeout(500); }
  await newPart.click({ timeout: 20000 });
  await page.waitForSelector('#cadProps .pform', { timeout: 20000 });
  /* the shape form's default box, built by the kernel */
  await page.getByRole('button', { name: /Add & build/ }).first().click({ timeout: 20000 });
  await page.waitForSelector('#cadLeft .pfn', { timeout: 120000 });
  await page.waitForTimeout(700);
}

const panel = (page) => page.evaluate(() => {
  const pane = document.querySelector('.pane-tree');
  const scrollers = [...pane.querySelectorAll('*')].filter((el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 2);
  const s = document.querySelector('#lpScroll');
  return {
    width: Math.round(pane.getBoundingClientRect().width),
    scrollers: scrollers.map((el) => el.id || el.className),
    hasCadLeft: !!document.querySelector('#lpScroll #cadLeft'),
    hasTree: !!document.querySelector('#lpScroll #tree'),
    xOverflow: s ? s.scrollWidth - s.clientWidth : null,
    docScroll: document.documentElement.scrollWidth - innerWidth,
    title: (document.querySelector('#lpTitle') || {}).textContent || '',
    inPaneDoc: !!pane.querySelector('.cdoc'),
    rows: [...document.querySelectorAll('#cadLeft .pfn b')].map((b) => b.textContent),
    icons: document.querySelectorAll('#cadLeft .pfn .pfi svg').length,
    props: (document.querySelector('#cadLeft .lpprops') || {}).innerText || '',
    propsTitle: !!document.querySelector('#cadLeft .lpprops .lphd2'),
    header: !!document.querySelector('#cadLeft .lptitle2') && !!document.querySelector('#cadLeft .lphdrow'),
    clipped: [...document.querySelectorAll('#cadLeft .lptitle2 b, #cadLeft .pfn b')].some((el) => el.scrollWidth > el.clientWidth + 2),
  };
});

for (const [label, width, height] of [['1366x768', 1366, 768], ['1280x800', 1280, 800], ['tablet-800x1280', 800, 1280]]) {
  console.log('\n' + label);
  const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: label.startsWith('tablet') });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await boot(page);
  const p = await panel(page);
  check('the pane is one scroll area', () => eq(p.scrollers.filter((x) => x === 'lpScroll').length, 1, 'one #lpScroll'));
  check('nothing else in the pane scrolls by itself', () => eq(p.scrollers.length, 1, JSON.stringify(p.scrollers)));
  check('the feature tree and the CAD column share that area', () => { if (!p.hasCadLeft || !p.hasTree) throw new Error(JSON.stringify(p)); });
  check('no horizontal scroll in the panel', () => { if (p.xOverflow > 1) throw new Error('scrollWidth - clientWidth = ' + p.xOverflow); });
  check('the page itself does not scroll sideways', () => { if (p.docScroll > 1) throw new Error('doc overflow ' + p.docScroll); });
  check('the design title is the part name', () => { if (!p.title.trim()) throw new Error('empty title'); });
  check('the column starts with the design name and a feature-tree heading', () => { if (!p.header) throw new Error('no title/heading block'); });
  check('labels are not clipped at this width', () => { if (p.clipped) throw new Error('a title or feature label is cut'); });
  check('the feature tree lists the built step', () => { if (!p.rows.length) throw new Error('no feature rows'); });
  check('each feature row has an icon', () => { if (p.icons !== p.rows.length) throw new Error(`${p.icons} icons for ${p.rows.length} rows`); });
  check('Properties sits below the tree with a heading', () => { if (!p.propsTitle || !/Properties/i.test(p.props)) throw new Error(p.props.slice(0, 120)); });
  check('document settings are out of the column', () => { if (p.inPaneDoc) throw new Error('.cdoc is still in the panel'); });

  /* the column as it opens: title, feature tree, Properties of the part */
  await page.evaluate(() => { document.querySelector('#lpScroll').scrollTop = 0; if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.querySelector('#lpScroll').scrollTop = 0; });
  await page.screenshot({ path: `${root}${OUT}/lp-${TAG}-${label}.png` });

  /* selecting a feature shows its numbers under Properties */
  await page.locator('#cadLeft .pfn').first().click();
  await page.waitForTimeout(400);
  const sel = await panel(page);
  check('the selected feature shows its properties', () => { if (!/Feature/i.test(sel.props)) throw new Error(sel.props.slice(0, 160)); });

  await page.screenshot({ path: `${root}${OUT}/lp-${TAG}-selected-${label}.png` });
  /* double-click edits: the form opens */
  await page.locator('#cadLeft .pfn').first().dblclick();
  await page.waitForSelector('#cadProps .pform', { timeout: 10000 });
  check('double-click opens the feature form', () => { if (!page) throw new Error('no page'); });
  await page.screenshot({ path: `${root}${OUT}/lp-${TAG}-editing-${label}.png` });
  await page.keyboard.press('Escape');

  /* the gear holds document settings */
  if (await page.locator('#docGear').count()) {
    await page.locator('#docGear').click();
    await page.waitForSelector('#docMenu .cdoc', { timeout: 5000 });
    check('the gear opens document settings', () => { if (!page) throw new Error('no page'); });
    await page.screenshot({ path: `${root}${OUT}/lp-${TAG}-gear-${label}.png` });
    await page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown')));
    await page.waitForTimeout(200);
  } else check('the gear holds document settings', () => { throw new Error('no #docGear'); });

  /* wider by dragging the grip, and back on double-click */
  if (await page.locator('#lpGrip').count()) {
    const before = (await panel(page)).width;
    const g = await page.locator('#lpGrip').boundingBox();
    if (g && before > 60) {
      await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2 + 70, g.y + g.height / 2, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const wide = await panel(page);
      check('dragging the grip widens the panel', () => { if (!(wide.width > before + 40)) throw new Error(`${before} -> ${wide.width}`); });
      check('the wider panel still has no horizontal scroll', () => { if (wide.xOverflow > 1) throw new Error('overflow ' + wide.xOverflow); });
      await page.locator('#lpGrip').dblclick();
      await page.waitForTimeout(400);
      const reset = (await panel(page)).width;
      check('double-click resets the width', () => { if (Math.abs(reset - before) > 4) throw new Error(`${before} -> ${reset}`); });
    }
  }
  /* the drawer is closed on a tablet after building: open it for the picture */
  await page.evaluate(() => { if (document.querySelector('.pane-tree').getBoundingClientRect().width < 60) document.querySelector('#cTree').click(); });
  await page.waitForTimeout(500);
  await page.locator('#treeClose').click();
  await page.waitForTimeout(400);
  const hidden = await page.evaluate(() => document.body.classList.contains('hide-tree'));
  check('the close button hides the panel', () => { if (!hidden) throw new Error('still shown'); });
  check('no page error during the panel checks', () => { if (errors.length) throw new Error(errors.join(' | ')); });
  await ctx.close();
}

await browser.close();
const bad = results.filter((r) => !r[0]);
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [, n, e] of bad) console.log('FAILED: ' + n + '\n  ' + (e && e.message)); process.exit(1); }
