/* S4: the Engineering calculators panel, against the real solver.
 *
 * Checks the contract the panel promises:
 *   * the form comes from GET /solvers and every field starts empty (no silent defaults);
 *   * "Fill the published example" marks each untouched field "example value" and the mark clears on typing;
 *   * results are the solver's outputs, and three calculators are checked against hand numbers:
 *       pressure_vessel p 1 MPa, D 100, t 2      -> hoop 25.0 MPa (thin wall), 25.01 (Lamé)
 *       bolt_proof_load M10 8.8                  -> proof load compared with ISO 898-1 (58.0 mm² × 580 MPa)
 *       oil_viscosity VG46 (46 / 6.8 mm²/s) at 40 °C -> 46 mm²/s
 *
 *   SOLVER=http://127.0.0.1:8010 BASE_URL=http://127.0.0.1:3018/index.html node tests/s4-calculators.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3018/index.html';
const SOLVER = process.env.SOLVER || 'http://127.0.0.1:8010';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || '1366';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what || 'value'}: ${a} vs ${b} (tol ${tol})`); return true; };
const solve = async (name, body) => (await (await fetch(SOLVER + '/solve/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json());

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

const openCalc = async (id) => {
  await page.selectOption('#calcPick', id);
  await page.waitForTimeout(250);
};
const setVal = (id, v) => page.evaluate(([i, x]) => { const el = document.getElementById(i); el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, [id, String(v)]);
const solveClick = () => page.evaluate(() => { const b = [...document.querySelectorAll('#calcdlg button')].find((x) => x.innerText.trim() === 'Solve'); if (!b) throw new Error('no Solve button'); b.click(); });
const waitOut = () => page.waitForSelector('#calcOut table, #calcOut .warnbox', { timeout: 30000 });
const table = () => page.evaluate(() => {
  const t = document.querySelector('#calcOut table'); if (!t) return {};
  const o = {}; for (const tr of t.querySelectorAll('tr')) { const td = tr.querySelectorAll('td'); if (td.length === 2) o[td[0].innerText.trim()] = td[1].innerText.trim(); } return o;
});
const num = (s) => parseFloat(String(s).replace(/,/g, '').replace(/[^0-9eE+.-]/g, ''));

await page.goto(BASE + '?api=' + encodeURIComponent(SOLVER), { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); window.__idris.tools.startPart(); });
await page.waitForTimeout(800);
await page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => /Simulation/.test(b.textContent)).click());
await page.waitForTimeout(200);
await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Calculators'); if (b) b.click(); });
await page.waitForSelector('#calcdlg', { state: 'visible', timeout: 10000 });
await page.waitForSelector('#calc_pressure_mpa', { timeout: 15000 });

console.log('\npressure vessel');
const blanks = await page.evaluate(() => [...document.querySelectorAll('#calcForm input')].map((i) => i.value));
check('every field starts empty (no silent defaults)', () => ok(blanks.length >= 4 && blanks.every((v) => v === ''), JSON.stringify(blanks)));
const hasAll = await page.evaluate(() => ['pressure_mpa', 'mean_diameter_mm', 'wall_mm', 'yield_mpa', 'factor_of_safety'].every((k) => !!document.getElementById('calc_' + k)));
check('the form is the solver schema', () => ok(hasAll, 'a schema field is missing'));

await page.click('text=Fill the published example');
const marks = await page.evaluate(() => [...document.querySelectorAll('#calcForm .calc-ex')].filter((b) => /example value/.test(b.textContent)).length);
check('the example fills the fields and each is marked "example value"', () => ok(marks >= 3, `only ${marks} marks`));
await setVal('calc_wall_mm', 2.5);
const after = await page.evaluate(() => document.querySelector('#calc_wall_mm').closest('label').querySelector('.calc-ex').textContent);
check('typing my own value clears its example mark', () => ok(!/example value/.test(after), JSON.stringify(after)));
await setVal('calc_wall_mm', 2);
await setVal('calc_pressure_mpa', 1);
await setVal('calc_mean_diameter_mm', 100);
await setVal('calc_yield_mpa', 250);
await solveClick();
await waitOut();
const pv = await table();
const want = await solve('pressure_vessel', { pressure_mpa: 1, mean_diameter_mm: 100, wall_mm: 2, yield_mpa: 250 });
check('hoop stress (thin wall) = p·D/(2t) = 25.0 MPa', () => near(num(pv['hoop thin_MPa'] ?? pv['hoop thin MPa']), 25.0, 0.02, 'hoop'));
check('Lamé inner hoop 25.01 MPa matches the solver', () => near(num(pv['hoop lame inner_MPa'] ?? pv['hoop lame inner MPa']), want.outputs.hoop_lame_inner_MPa, 0.005, 'lame'));
check('longitudinal 12.5 MPa', () => near(num(pv['longitudinal thin_MPa'] ?? pv['longitudinal thin MPa']), 12.5, 0.02));
const outText = await page.evaluate(() => document.querySelector('#calcOut').textContent);
check('the solver checks come back on screen', () => ok(/margin of safety/.test(outText), 'no checks'));
check('the benchmark the solver ships with is shown', () => ok(/Lamé exact thick-cylinder/.test(outText), 'no benchmark'));
await page.screenshot({ path: `${OUT}/s4-pressure-vessel-${TAG}.png` });

console.log('\nbolt M10 8.8');
await openCalc('bolt_proof_load');
await page.selectOption('#calc_size', 'M10');
await page.selectOption('#calc_property_class', '8.8');
await solveClick();
await waitOut();
const bolt = await table();
const wantB = await solve('bolt_proof_load', { size: 'M10', property_class: '8.8' });
const boltVal = Object.entries(bolt).find(([k]) => /proof/i.test(k) && / n$/.test(k));
const wantKey = Object.keys(wantB.outputs).find((k) => /proof/i.test(k));
check('the proof load equals the solver answer', () => ok(boltVal && wantKey && near(num(boltVal[1]), wantB.outputs[wantKey], 1, boltVal[0]), boltVal + ' vs ' + wantKey + ' ' + JSON.stringify(bolt)));
/* ISO 898-1: M10 8.8 -> stress area 58.0 mm², proof stress 580 MPa -> 33 640 N */
check('and it agrees with ISO 898-1 hand value 58.0 mm² × 580 MPa ≈ 33 640 N', () => near(num(boltVal[1]), 33640, 60, 'proof load'));
await page.screenshot({ path: `${OUT}/s4-bolt-${TAG}.png` });

console.log('\noil VG46 at 40 °C');
await openCalc('oil_viscosity');
await setVal('calc_nu40_mm2_s', 46);
await setVal('calc_nu100_mm2_s', 6.8);
await setVal('calc_temp_c', 40);
await solveClick();
await waitOut();
const oil = await table();
const wantO = await solve('oil_viscosity', { nu40_mm2_s: 46, nu100_mm2_s: 6.8, temp_c: 40 });
const oilVal = Object.values(oil).map(num).find((v) => Math.abs(v - 46) < 1);
check('VG46 at 40 °C comes back as 46 mm²/s', () => ok(oilVal != null, JSON.stringify(oil)));
check('and equals the solver answer', () => near(oilVal, wantO.outputs[Object.keys(wantO.outputs).find((k) => /nu|visc/i.test(k))], 0.05, 'oil'));
await page.screenshot({ path: `${OUT}/s4-oil-${TAG}.png` });

console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
