/* S5: a grey tool whose counterpart is in the solver's `planned` list shows the solver's own reason and needs.
 *
 * Runs against a real solver (GET /solvers) through ?api=…:
 *   Drop Test and Topology Optimisation are grey; their popover must quote `reason` and `needs` word for word.
 *   CFD opens pipe flow (2D/1D); the "Why full 3D CFD is not built yet" section must quote the cfd_3d entry.
 *
 *   SOLVER=http://127.0.0.1:8010 BASE_URL=http://127.0.0.1:3013/index.html node tests/s5-planned-reasons.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3013/index.html';
const SOLVER = process.env.SOLVER || 'http://127.0.0.1:8010';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || '1366';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const flat = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const planned = (await (await fetch(SOLVER + '/solvers')).json()).planned || [];
const byName = (n) => planned.find((x) => x.name === n);
for (const n of ['drop_test', 'topology_simp_3d', 'cfd_3d']) ok(byName(n), `solver has no planned entry ${n}`);

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(BASE + '?api=' + encodeURIComponent(SOLVER), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); window.__idris.tools.startPart(); });
await page.waitForTimeout(800);
await page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => /Simulation/.test(b.textContent)).click());
await page.waitForTimeout(300);

for (const [label, name] of [['Drop Test', 'drop_test'], ['Topology Optimisation', 'topology_simp_3d']]) {
  console.log('\n' + label);
  const want = byName(name);
  await page.evaluate((n) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === n); if (b) b.click(); }, label);
  const id = '#rpPlan-' + name;
  await page.waitForSelector(id, { timeout: 8000 });
  await page.waitForFunction((sel) => !/Asking the solver/.test(document.querySelector(sel).textContent), id, { timeout: 15000 });
  const txt = flat(await page.evaluate((sel) => document.querySelector(sel).textContent, id));
  check(`${label}: the solver's reason is shown word for word`, () => ok(txt.includes(flat(want.reason)), txt.slice(0, 260)));
  check(`${label}: what it needs first is shown`, () => ok(txt.includes(flat(want.needs)), txt.slice(-260)));
  check(`${label}: the source line names GET /solvers`, () => ok(/GET \/solvers/.test(txt), txt.slice(-160)));
  await page.screenshot({ path: `${OUT}/s5-${name}-${TAG}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
}

console.log('\nCFD (pipe flow dialog)');
const wantC = byName('cfd_3d');
await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Pipe Flow'); if (b) b.click(); });
await page.waitForSelector('#pipedlg', { timeout: 8000 });
await page.evaluate(() => { const d = document.querySelector('#cfd3dWhy'); if (d) d.open = true; });
await page.waitForFunction(() => { const d = document.querySelector('#rpPlan-cfd_3d'); return d && !/Asking the solver/.test(d.textContent); }, null, { timeout: 15000 });
const txtC = flat(await page.evaluate(() => document.querySelector('#cfd3dWhy').textContent));
check('CFD: the cfd_3d reason is quoted in the dialog where CFD lives', () => ok(txtC.includes(flat(wantC.reason)), txtC.slice(0, 260)));
check('CFD: what it needs first is shown', () => ok(txtC.includes(flat(wantC.needs)), txtC.slice(-260)));
await page.screenshot({ path: `${OUT}/s5-cfd_3d-${TAG}.png` });

console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
