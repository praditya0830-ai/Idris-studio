/* v0.42 Manufacturing panel (doc tahap sambungan produksi, bagian B): the assembly goes to POST /join/plan and the
 * workshop documents come back as tables with CSV, next to the geometry checks the solver made.
 *
 * Mock engine: /join/plan answers exactly like `joining.plan()`. No AI, no kernel.
 *
 *   BASE_URL=http://127.0.0.1:3000 OUT=docs VP=1366x768 node tests/t32-manufacturing.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || 'docs';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const PLAN = {
  success: true, ok: true, fixes: ['push tube moved +6.0 mm on z; overlap 9600 mm3 removed'],
  issues: [{ code: 'overlap', parts: ['mount plate', 'push tube'], volume_mm3: 9600 }],
  checks: [{ check: 'overlap', parts: ['blade', 'mount plate'], value_mm3: 0, status: 'pass' },
    { check: 'contact at the weld', parts: ['blade', 'mount plate'], value_mm: 0, status: 'pass' },
    { check: 'every part is joined', value: 0, status: 'pass', parts: [] },
    { check: 'bolt holes on one axis', parts: ['a', 'b'], status: 'fail' }],
  joints: [{ between: ['blade', 'mount plate'], kind: 'fillet_weld', length_mm: 55.4,
    size: { value: 5, unit: 'mm', source: 'AWS D1.1 Table 7.7 … for 6.0 mm base metal' } }],
  bom: [{ part: 'blade', process: 'laser_cut', stock: 'plate', qty: 1, mass_kg: 11.3, material: 'S355' }],
  cut_list: [{ part: 'mount plate', stock: 'plate 6.0 mm', length_mm: 120, width_mm: 100, angle_deg: 90, qty: 1 }],
  welds: [{ between: ['blade', 'mount plate'], kind: 'fillet_weld', leg_mm: 5, length_mm: 55.4, source: 'AWS D1.1 Table 7.7' }],
  bolts: [{ between: ['a', 'b'], size: 'M8', length_mm: 30, clamp_mm: 12, source: 'ISO 273 + catalogue' }],
  assembly_order: [{ step: 1, what: 'weld the sub-assemblies', detail: 'blade + mount plate' },
    { step: 2, what: 'final check', detail: 'check the diagonal' }],
  joint_strength: [{ joint: ['blade', 'mount plate'], status: 'not_checked' }],
  notes: ['Overlap volume uses each part declared volume.'],
};

const PARTS = [{ name: 'blade', material: 'S355', shape: { type: 'box', size: [2400, 100, 6], at: [0, 0, 0] } },
  { name: 'mount plate', material: 'S355', shape: { type: 'box', size: [120, 100, 6], at: [-600, 0, 6] } }];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, acceptDownloads: true });
page.on('pageerror', (e) => results.push([false, 'page error: ' + e.message]));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/.test(t)) results.push([false, 'console error: ' + t]); });
let posted = null;
await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route('**/join/plan', async (route) => {
  try { posted = JSON.parse(route.request().postData() || '{}'); } catch (e) { posted = {}; }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PLAN) });
});

await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, { timeout: 40000 });
const d = await page.evaluate((parts) => window.__idris.tools.manufacturingFromParts(parts), PARTS);
await page.waitForSelector('#mfgdlg', { timeout: 20000 });
await page.waitForTimeout(400);

check('the parts are sent to the solver', () => {
  eq(2, (posted.parts || []).length, 'parts posted');
  eq('blade', posted.parts[0].name, 'first part');
  eq(2400, posted.parts[0].shape.size[0], 'blade length');
});
const dom = await page.evaluate(() => ({
  title: document.querySelector('#mfgdlg .lib-h b').textContent,
  checks: [...document.querySelectorAll('.mfg-chk')].map((c) => ({ t: c.textContent, bad: c.classList.contains('bad'), ok: c.classList.contains('ok') })),
  fix: (document.querySelector('.mfg-fix') || {}).innerText || '',
  tables: [...document.querySelectorAll('.mfg-t')].map((t) => t.getAttribute('data-t')),
  bom: (document.querySelector('.mfg-t[data-t="bom"]') || {}).innerText || '',
  cut: (document.querySelector('.mfg-t[data-t="cut_list"]') || {}).innerText || '',
  weld: (document.querySelector('.mfg-t[data-t="welds"]') || {}).innerText || '',
  order: [...document.querySelectorAll('.mfg-order li')].map((li) => li.textContent),
  csv: [...document.querySelectorAll('.mfg-h .chip')].map((b) => b.textContent),
  hint: [...document.querySelectorAll('#mfgdlg .hint')].map((p) => p.textContent).join(' | '),
}));
check('the panel is titled Manufacturing', () => eq('Manufacturing', dom.title, 'title'));
check('the geometry checks are shown, a failure marked red', () => {
  eq(true, dom.checks.length >= 4, 'check rows');
  const bad = dom.checks.filter((c) => c.bad);
  eq(1, bad.length, 'failed checks');
  if (!/bolt holes on one axis/.test(bad[0].t)) throw new Error('wrong failure: ' + bad[0].t);
});
check('the fix the solver made is shown', () => { if (!/moved \+6\.0 mm/.test(dom.fix)) throw new Error('fix: ' + dom.fix); });
check('BOM, cut list, welds and bolts are tables', () => {
  ['bom', 'cut_list', 'welds', 'bolts'].forEach((k) => { if (!dom.tables.includes(k)) throw new Error('missing table ' + k); });
});
check('a BOM row carries the process and a kernel mass', () => {
  if (!/laser_cut/.test(dom.bom) || !/11\.3/.test(dom.bom)) throw new Error('bom: ' + dom.bom);
});
check('the cut list carries the stock and the length', () => {
  if (!/plate 6\.0 mm/.test(dom.cut) || !/120/.test(dom.cut)) throw new Error('cut: ' + dom.cut);
});
check('the weld list carries the size and its source', () => {
  if (!/AWS D1\.1/.test(dom.weld)) throw new Error('weld: ' + dom.weld);
});
check('the assembly order lists weld first', () => {
  eq(true, dom.order.length >= 2, 'order rows');
  if (!/weld the sub-assemblies/.test(dom.order[0])) throw new Error('order: ' + dom.order[0]);
});
check('a joint strength is reported as not checked', () => { if (!/not_checked/.test(dom.hint)) throw new Error('hint: ' + dom.hint); });
check('every table has a CSV button', () => { eq(true, dom.csv.length >= 4, 'csv buttons'); });

const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('.mfg-h .chip')]);
const path = await download.path();
check('the CSV downloads from the first table', () => {
  if (!/\.csv$/.test(download.suggestedFilename())) throw new Error('filename: ' + download.suggestedFilename());
  if (!path) throw new Error('no downloaded file');
});

check('the solver answered with the documents', () => {
  eq(true, !!(d && d.ok), 'returned plan');
});

if (process.env.SHOT !== '0') await page.screenshot({ path: `${root}/${OUT}/t32-manufacturing-${VP[0]}.png`, fullPage: false });
await browser.close();
const bad = results.filter((r) => !r[0]);
bad.forEach((r) => console.log('  FAILED: ' + r[1] + (r[2] ? ' — ' + r[2].message : '')));
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
