/* P1e sheet metal: bend allowance, setback and the flat pattern (doc 22 Nov, item 6).
 * Plate 2 mm, bend 90° R2, K = 0.44 -> BA = pi/2 * (R + K t) = 4.524 mm, and the flat length is the straight
 * legs plus BA. The DXF carries the flat outline and the bend line.
 *
 *   BASE_URL=http://127.0.0.1:3000 OUT=docs VP=1366x768 node tests/t33-sheet-metal.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const OUT = process.env.OUT || 'docs';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] }, acceptDownloads: true });
page.on('pageerror', (e) => results.push([false, 'page error: ' + e.message]));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon/.test(t)) results.push([false, 'console error: ' + t]); });
await page.route('http://mock.local/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, { timeout: 40000 });
await page.evaluate(() => window.__idris.tools.sheetMetal());
await page.waitForSelector('#smdlg .sm-f', { timeout: 15000 });
await page.waitForTimeout(300);

const dom = await page.evaluate(() => ({
  ba: document.querySelector('#smdlg .sm-f').getAttribute('data-ba'),
  flat: document.querySelector('#smdlg .sm-f').getAttribute('data-flat'),
  text: document.querySelector('#smdlg .sm-f').innerText,
  pure: window.__idris.tools.bendAllowance({ t: 2, r: 2, k: 0.44, angleDeg: 90 }),
  pattern: window.__idris.tools.flatPattern({ t: 2, r: 2, k: 0.44, angleDeg: 90, legs: [60, 40] }),
  hintText: document.querySelector('#smdlg').innerText,
}));
check('bend allowance is pi/2*(R + K*t) = 4.524 mm', () => { eq('4.524', dom.ba, 'BA'); if (Math.abs(dom.pure - 4.524) > 0.001) throw new Error('pure BA ' + dom.pure); });
check('setback (R+t)tan(45) = 4 mm and the flat length is straight legs + BA', () => {
  eq('96.52', dom.flat, 'flat length');
  if (Math.abs(dom.pattern.setback_mm - 4) > 1e-9) throw new Error('setback ' + dom.pattern.setback_mm);
  if (Math.abs(dom.pattern.flat_mm - (92 + 4.5239)) > 0.002) throw new Error('flat ' + dom.pattern.flat_mm);
});
check('the panel prints the formula with the numbers', () => {
  if (!/Bend allowance BA = θ·\(R \+ K·t\) = 4\.524 mm/.test(dom.text)) throw new Error(dom.text);
  if (!/Flat pattern length = 96\.52 mm/.test(dom.text)) throw new Error(dom.text);
});
check('the K-factor default is labelled a default, not a standard', () => {
  if (!/workshop default/i.test(dom.hintText)) throw new Error('default not labelled');
});

await page.fill('#smdlg .sm-row:nth-child(1) .sm-in', '3');
await page.waitForTimeout(300);
const after = await page.evaluate(() => document.querySelector('#smdlg .sm-f').getAttribute('data-ba'));
check('changing the thickness recalculates the allowance', () => { if (after === '4.524') throw new Error('BA unchanged'); });

const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#sm-dxf')]);
const file = await dl.path();
check('the flat pattern DXF carries the outline, a BEND line and its numbers', () => {
  const t = readFileSync(file, 'utf8');
  if (!/SECTION/.test(t) || !/OUTLINE/.test(t)) throw new Error('no outline');
  if (!/BEND/.test(t)) throw new Error('no bend line');
  if (!/BA=/.test(t) || !/flat=/.test(t)) throw new Error('no numbers');
  eq('idris-flat-pattern.dxf', dl.suggestedFilename(), 'filename');
});
if (process.env.SHOT !== '0') await page.screenshot({ path: `${root}/${OUT}/t33-sheet-metal-${VP[0]}.png`, fullPage: false });
await browser.close();
const bad = results.filter((r) => !r[0]);
bad.forEach((r) => console.log('  FAILED: ' + r[1] + (r[2] ? ' — ' + r[2].message : '')));
console.log(`\n${results.length - bad.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
