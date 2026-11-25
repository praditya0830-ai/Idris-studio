/* S21m: Curvature / Zebra in the real page (Batch 11).
 *
 * The engineer's flow: build a body, Evaluate → Analysis → Curvature / Zebra, press Measure & colour, and read the
 * kernel's own curvature per face, drawn as colour on the part.
 *   1. Curvature / Zebra is no longer grey in Evaluate → Analysis;
 *   2. the panel has the sample field and a Measure & colour button;
 *   3. a cylinder Ø20 × 20 measures 3 faces: one CYLINDRE at 1/R = 0.1000 1/mm and two planar caps at 0.0000,
 *      with a radius of 10.000 mm — the kernel's numbers, on the step and in the panel's table;
 *   4. the part is drawn with that measurement: the field is on, the colour attribute exists, and the legend names
 *      the quantity (max |κ| per face, 1/mm) and says how many faces are planar and curved;
 *   5. switching the step's Display to Zebra puts the viewer in 12-stripe mode on the same measured mesh: the shader
 *      has its uniforms, the legend says "Zebra" and "12 stripes", the step keeps the mode, and the canvas pixels
 *      change; switching back to Colour brings the |κ| scale and different pixels again;
 *   6. suppressing the step takes the colours and the legend off without changing the body; turning it back on puts
 *      them back; deleting it leaves the cylinder at 6 283.19 mm³ and no colours;
 *   7. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/s21m-curvature.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const checkAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.tools, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(600);

const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(250); };
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(400); };
const setField = async (sel, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(s); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]); await page.waitForTimeout(120); };
const setNum = (k, v) => setField(`#cadProps .pform input[data-k=${k}]`, v);
const stepAt = (i) => page.evaluate((n) => { const f = window.__idris.state.part.features[n]; return f ? { type: f.type, err: f.err || '', note: f.note || '', curv: f.curv || null, off: !!f.off, p: f.p } : null; }, i);
const view = () => page.evaluate(() => { const v = window.__idris.viewer, lg = document.querySelector('#legend');
  return { ok: v.ok, fieldOn: !!v.fieldOn, hasField: !!v.field, hasScalar: !!(v.field && v.field.s), tris: v.field ? v.field.n : 0, parts: (v.parts || []).length,
    legendHidden: lg ? lg.hidden : null, legend: lg ? lg.textContent.replace(/\s+/g, ' ').trim() : '' }; });
const CYLVOL = Math.PI * 100 * 20;

console.log('\nThe ribbon');
await openTab('Evaluate');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Curvature / Zebra runs now', () => ok(s['Curvature / Zebra'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nA cylinder Ø20 × 20, then the measurement');
await checkAsync('build the cylinder and measure it', async () => {
  await openTab('Features');
  await clickTool('Cylinder');
  await setNum('D', 20); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await page.waitForFunction((v) => { const i = window.__idris.partInfo(); return !!i && Math.abs(i.vol - v) < 1; }, CYLVOL, { timeout: 120000 });
  await openTab('Evaluate');
  await clickTool('Curvature / Zebra');
  const has = await page.evaluate(() => ({ samples: !!document.querySelector('#cadProps input[data-k="samples"]'), go: !!document.querySelector('#cadProps [data-curv-go]') }));
  ok(has.samples, 'the panel has no sample field');
  ok(has.go, 'the panel has no Measure & colour button');
  await page.evaluate(() => document.querySelector('#cadProps [data-curv-go]').click());
  await page.waitForFunction(() => { const f = window.__idris.state.part.features[1]; return !!f && !!f.curv; }, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
});

await checkAsync('the step carries the kernel\u2019s 1/R on the wall and 0 on the caps', async () => {
  const st = await stepAt(1);
  ok(st.type === 'curv', 'the step is not a curvature step: ' + JSON.stringify(st).slice(0, 200));
  ok(!st.err, 'the curvature step failed: ' + st.err);
  ok(st.curv && st.curv.faces.length === 3, 'the step did not record three faces: ' + JSON.stringify(st.curv).slice(0, 200));
  ok(st.curv.byType.CYLINDRE === 1 && st.curv.byType.PLANE === 2, 'the face types are wrong: ' + JSON.stringify(st.curv.byType));
  ok(Math.abs(st.curv.maxK - 0.1) < 1e-6, 'the largest |κ| is not 0.1 1/mm: ' + st.curv.maxK);
  ok(Math.abs(st.curv.minRadius - 10) < 1e-6, 'the tightest radius is not 10 mm: ' + st.curv.minRadius);
  const wall = st.curv.faces.find((x) => x.type === 'CYLINDRE'), caps = st.curv.faces.filter((x) => x.type === 'PLANE');
  ok(Math.abs(wall.kMax - 0.1) < 1e-6, 'the cylinder wall is not 1/R: ' + JSON.stringify(wall));
  ok(caps.every((x) => x.kMax === 0), 'a planar cap is not 0: ' + JSON.stringify(caps));
  ok(/0\.1000/.test(st.note) && /10\.000 mm/.test(st.note), 'the note does not carry the measurement: ' + JSON.stringify(st.note));
  ok(/3 face/.test(st.note) && /2 planar/.test(st.note), 'the note does not count the faces: ' + JSON.stringify(st.note));
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.vol - CYLVOL) < 0.5, 'the curvature step changed the body: ' + info.vol);
});

await checkAsync('the part is drawn with that measurement, and the legend names the quantity', async () => {
  const v = await view();
  ok(v.ok, 'the viewer is not running');
  ok(v.parts === 1, 'there should be one part on screen: ' + v.parts);
  ok(v.fieldOn, 'the colour field is not shown');
  ok(v.hasField && v.hasScalar, 'the colour field has no mesh or no per-vertex value');
  ok(v.tris > 100, 'the colour mesh has too few triangles: ' + v.tris);
  ok(v.legendHidden === false, 'the legend is hidden');
  ok(/1\/mm/.test(v.legend), 'the legend does not name the quantity: ' + JSON.stringify(v.legend));
  ok(/planar/.test(v.legend) && /curved/.test(v.legend), 'the legend does not count the faces: ' + JSON.stringify(v.legend));
  ok(/0\.1000/.test(v.legend), 'the legend does not carry the largest |κ|: ' + JSON.stringify(v.legend));
});

await checkAsync('the panel lists what each face measured', async () => {
  const t = await page.evaluate(() => { const tb = document.querySelector('#cadProps table.cutlist'); return tb ? tb.textContent.replace(/\s+/g, ' ').trim() : null; });
  ok(t, 'the selected step shows no face table');
  ok(/CYLINDRE/.test(t) && (t.match(/PLANE/g) || []).length === 2, 'the table does not list the face types: ' + JSON.stringify(t));
  ok(/0\.1000/.test(t) && /10\.00 mm/.test(t), 'the table does not carry the radius or the curvature: ' + JSON.stringify(t));
});

console.log('\nZebra: reflection lines from the same measurement');
await checkAsync('switching the step to Zebra draws stripes and the legend says so', async () => {
  const before = await page.locator('#cv').screenshot();
  await page.evaluate(() => { const s = document.querySelector('#cadProps select[data-k="view"]'); s.value = 'zebra'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  const hasStripes = await page.evaluate(() => !!document.querySelector('#cadProps input[data-k="stripes"]'));
  ok(hasStripes, 'the zebra mode has no stripe count field');
  await page.evaluate(() => { const i = document.querySelector('#cadProps input[data-k="stripes"]'); i.value = '12'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => document.querySelector('#cadProps [data-curv-update]').click());
  await page.waitForFunction(() => window.__idris.viewer.zebra && window.__idris.viewer.zebra.on === true, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const v = await view();
  ok(v.fieldOn && v.hasScalar, 'zebra is on without the measured mesh behind it');
  const z = await page.evaluate(() => ({ on: window.__idris.viewer.zebra.on, stripes: window.__idris.viewer.zebra.stripes,
    uZebra: !!window.__idris.viewer.gl.getUniformLocation(window.__idris.viewer.pField, 'uZebra'),
    uStripes: !!window.__idris.viewer.gl.getUniformLocation(window.__idris.viewer.pField, 'uStripes'),
    uEye: !!window.__idris.viewer.gl.getUniformLocation(window.__idris.viewer.pField, 'uEye'),
    uViewR: !!window.__idris.viewer.gl.getUniformLocation(window.__idris.viewer.pField, 'uViewR') }));
  ok(z.on === true && z.stripes === 12, 'the viewer is not in 12-stripe zebra: ' + JSON.stringify(z));
  ok(z.uZebra && z.uStripes && z.uEye && z.uViewR, 'a zebra uniform is missing from the shader: ' + JSON.stringify(z));
  ok(/Zebra/.test(v.legend) && /12 stripes/.test(v.legend), 'the legend does not name the zebra mode: ' + JSON.stringify(v.legend));
  const st = await stepAt(1);
  ok(st.p.view === 'zebra' && Number(st.p.stripes) === 12, 'the step did not keep the display mode: ' + JSON.stringify(st.p));
  const after = await page.locator('#cv').screenshot();
  ok(Buffer.compare(before, after) !== 0, 'the picture did not change when zebra was switched on');
});

await checkAsync('switching back to colour draws the |\u03ba| scale again', async () => {
  const zebraShot = await page.locator('#cv').screenshot();
  await page.evaluate(() => { const s = document.querySelector('#cadProps select[data-k="view"]'); s.value = 'color'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('#cadProps [data-curv-update]').click());
  await page.waitForFunction(() => window.__idris.viewer.zebra && window.__idris.viewer.zebra.on === false, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const v = await view();
  ok(v.fieldOn, 'the field went off when the colour scale came back');
  ok(/1\/mm/.test(v.legend), 'the colour legend did not come back: ' + JSON.stringify(v.legend));
  const shot = await page.locator('#cv').screenshot();
  ok(Buffer.compare(shot, zebraShot) !== 0, 'the picture did not change when the colour scale came back');
  ok(v.legendHidden === false, 'the legend is hidden in colour mode');
});

console.log('\nThe colours follow the step');
await checkAsync('suppressing the step takes the colours off, turning it back on returns them', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pft li')[1].querySelectorAll('button.pfx')[0].click());
  await page.waitForFunction(() => window.__idris.viewer.fieldOn === false, null, { timeout: 120000 });
  const off = await view();
  ok(off.legendHidden === true, 'the legend stayed on a suppressed step');
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pft li')[1].querySelectorAll('button.pfx')[0].click());
  await page.waitForFunction(() => window.__idris.viewer.fieldOn === true, null, { timeout: 120000 });
  const on = await view();
  ok(on.hasScalar, 'the colours did not come back');
});

await checkAsync('deleting the step leaves the body and takes the colours with it', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pft li')[1].querySelectorAll('button.pfx')[1].click());
  await page.waitForFunction(() => window.__idris.state.part.features.length === 1, null, { timeout: 120000 });
  await page.waitForTimeout(2000);
  const v = await view();
  ok(!v.fieldOn, 'the colours are still on after the step was deleted');
  ok(v.legendHidden === true, 'the legend is still on after the step was deleted');
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.vol - CYLVOL) < 0.5, 'deleting the curvature step changed the body: ' + info.vol);
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
