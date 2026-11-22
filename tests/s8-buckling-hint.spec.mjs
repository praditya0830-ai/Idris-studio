/* S8: the buckling offer opens with length and material from the part, section and ends left to the engineer.
 *
 * This spec drives the chip's action (window.__idris.tools.buckPrefill) on a real part in the browser. The
 * compression rule itself is covered, with the solver's contract fields, in tests/s8-buckling-hint.test.mjs.
 *
 *   BASE_URL=http://127.0.0.1:3017/index.html node tests/s8-buckling-hint.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3017/index.html';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || '1366';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(25000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); window.__idris.tools.startPart(); });
await page.waitForTimeout(1200);

const part = await page.evaluate(() => ({ mat: window.__idris.state.part.material, hasBuck: !!window.__idris.state.part.buck }));
check('a part is open and has a material', () => ok(!!part.mat, 'no material on the part'));

await page.evaluate(() => window.__idris.tools.buckPrefill(window.__idris.state.part, 62));
await page.waitForSelector('#buckdlg', { state: 'visible', timeout: 10000 });

const dlg = await page.evaluate(() => {
  const d = document.querySelector('#buckdlg');
  const inputs = [...d.querySelectorAll('input')].map((i) => ({ v: i.value, ph: i.placeholder || '' }));
  const selects = [...d.querySelectorAll('select')].map((s) => s.value);
  return { text: d.innerText, inputs, selects, buck: window.__idris.state.part.buck };
});
check('the dialog opens from the part with its length filled in', () => ok(dlg.buck.L === '62' && dlg.inputs.some((i) => i.v === '62'), JSON.stringify(dlg.buck)));
check('the material select is the part material', () => ok(dlg.selects.includes(part.mat), `${part.mat} not in ${dlg.selects}`));
check('the dialog says where the length and material came from', () => ok(/copied from the part/.test(dlg.text), dlg.text.slice(0, 200)));
check('section and end conditions are left for the engineer', () => {
  ok(dlg.buck.D === undefined && dlg.buck.W === undefined && dlg.buck.H === undefined, 'a section was filled in: ' + JSON.stringify(dlg.buck));
  ok(dlg.buck.pre === 'part', 'prefill marker missing');
});
check('the note says the section and ends are not taken from the part', () => ok(/not taken from the part/.test(dlg.text), dlg.text.slice(0, 300)));

await page.screenshot({ path: `${OUT}/s8-buckling-prefill-${TAG}.png` });
console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
