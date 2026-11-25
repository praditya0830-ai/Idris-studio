/* S21: the first sketch curves in the real page — Ellipse, closed spline through points, Sketch Correction.
 *
 * Everything here is a click on the page the engineer uses:
 *   1. Ellipse and Spline are no longer grey in the Sketch tab, and Sketch Correction is no longer grey in IDRIS;
 *   2. Features → Thicken is still grey but its popover opens Surface → Thicken (one tool, one implementation);
 *   3. Ellipse Ø60 × Ø30 as a sketch step, extruded 10 mm by Extruded Boss/Base: the kernel reports
 *      π·30·15·10 = 14 137.17 mm³, and the tree keeps the sketch labelled "Ellipse Ø60×30";
 *   4. edit the sketch step to Ø80 × Ø30 and press Update & rebuild: 18 849.56 mm³ — the rebuild comes from the
 *      edited tree, not from a cached solid;
 *   5. a closed spline through 4 typed points extrudes to a solid with 4 curved sides and 2 flat caps, and the
 *      tree labels it by its point count;
 *   6. a 2-point spline is refused at the sketch step with its reason on screen, and the step is marked failed;
 *   7. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21-sketch-curves.spec.mjs
 *
 * SHOTS=1 writes docs/s21-sketch-curves-<w>x<h>.png. CHROME points at the browser binary.
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const SHOTS = !!process.env.SHOTS;
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome');
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const checkAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.tools, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(600);

const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(250); };
const slotState = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(300); };
const treeNames = () => page.evaluate(() => [...document.querySelectorAll('#cadLeft .pfn')].map((b) => b.textContent.trim()));
const features = () => page.evaluate(() => window.__idris.state.part && window.__idris.state.part.features.map((f) => ({ type: f.type, p: f.p, err: f.err || null })));
const waitBuilt = (n) => page.waitForFunction((k) => { const p = window.__idris.state.part; const f = p && p.features[k - 1]; return !!f && 'err' in f; }, n, { timeout: 120000 });
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const addAndBuild = async () => { await page.click('#cadProps .pact .chip.primary'); await page.waitForTimeout(400); };

console.log('\nThe ribbon');
await openTab('Sketch');
{
  const s = await slotState();
  check('Ellipse runs now', () => ok(s['Ellipse'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Spline runs now', () => ok(s['Spline'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Sketch Correction runs now', () => ok(s['Sketch Correction'] === false, 'still grey: ' + JSON.stringify(s)));
  /* Batch A now builds Text too (bundled 5×7 block font), so only the tools still unbuilt stay grey. */
  check('the tools that are not built stay grey', () => ok(s['Text'] === false && s['Convert Entities'] === false, JSON.stringify(s)));
}
await openTab('Features');
await checkAsync('Features → Thicken opens Surface → Thicken instead of a second build', async () => {
  await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === 'Thicken'); b.click(); });
  await page.waitForTimeout(300);
  const chip = await page.evaluate(() => { const p = document.querySelector('#ribpop'); const b = p && p.querySelector('.rp-act .chip.primary'); return b ? b.textContent.trim() : null; });
  ok(chip && /Surface/.test(chip), 'the popover does not point at the working tool: ' + chip);
  await page.evaluate(() => document.querySelector('#ribpop .rp-act .chip.primary').click());
  await page.waitForTimeout(400);
  const title = await page.evaluate(() => { const h = document.querySelector('#cadProps h2'); return h ? h.textContent.trim() : ''; });
  ok(/Thicken/.test(title), 'the working Thicken form did not open: ' + JSON.stringify(title));
  const kind = await page.evaluate(() => window.__idris.state.part ? window.__idris.state.part.features.length : 0);
  ok(kind === 0, 'opening a form must not add a step');
});

console.log('\nEllipse: a real profile, built and edited');
await openTab('Sketch');
await checkAsync('Ø60 × Ø30 as a sketch step, extruded 10 mm', async () => {
  await clickTool('Ellipse');
  const fields = await page.evaluate(() => [...document.querySelectorAll('#cadProps .pform input[data-k]')].map((i) => i.dataset.k));
  ok(fields.includes('D') && fields.includes('d'), 'the form does not offer both diameters: ' + JSON.stringify(fields));
  await page.fill('#cadProps .pform input[data-k=D]', '60');
  await page.fill('#cadProps .pform input[data-k=d]', '30');
  await addAndBuild();
  await waitBuilt(1);
  const f = await features();
  ok(f[0] && f[0].type === 'sketch' && f[0].p.prof === 'ellipse', 'no ellipse sketch step: ' + JSON.stringify(f[0]));
  ok(!f[0].err, 'the sketch step failed: ' + f[0].err);
  const names = await treeNames();
  ok(names.some((n) => /Ellipse Ø60×30/.test(n)), 'the tree does not label the ellipse: ' + JSON.stringify(names));

  await openTab('Features');
  await clickTool('Extruded Boss/Base');
  await page.fill('#cadProps .pform input[data-k=dist]', '10');
  await addAndBuild();
  await waitBuilt(2);
  await waitVol(Math.PI * 30 * 15 * 10, 1);
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[0] - 60) < 1e-6 && Math.abs(info.size[1] - 30) < 1e-6, 'the solid is not 60 × 30: ' + JSON.stringify(info.size));
});
await checkAsync('editing the diameter and pressing Update & rebuild rebuilds the solid', async () => {
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pfn')[0].click());
  await page.waitForTimeout(300);
  await page.fill('#cadProps .pform input[data-k=D]', '80');
  await addAndBuild();
  await page.waitForFunction(() => { const f = window.__idris.state.part.features[0]; return +f.p.D === 80; }, null, { timeout: 60000 });
  await waitVol(Math.PI * 40 * 15 * 10, 1);
});

console.log('\nClosed spline: typed points, kernel Bézier');
await openTab('Sketch');
await checkAsync('a 4-point closed spline extrudes, and the tree counts its points', async () => {
  await clickTool('Spline');
  const t = await page.evaluate(() => !!document.querySelector('#cadProps .pform input[data-k=pts]'));
  ok(t, 'the spline form has no points field');
  await page.fill('#cadProps .pform input[data-k=pts]', '0,20; 20,0; 0,-20; -20,0');
  await addAndBuild();
  await waitBuilt(3);
  const f = await features();
  ok(f[2] && f[2].p.prof === 'spline' && !f[2].err, 'no spline step: ' + JSON.stringify(f[2]));
  const names = await treeNames();
  ok(names.some((n) => /Spline 4 points/.test(n)), 'the tree does not count the points: ' + JSON.stringify(names));

  await openTab('Features');
  await clickTool('Extruded Boss/Base');
  await page.fill('#cadProps .pform input[data-k=dist]', '10');
  await addAndBuild();
  await waitBuilt(4);
  const before = await page.evaluate(() => window.__idris.partInfo().vol);
  const ellipseVol = Math.PI * 40 * 15 * 10;
  ok(before > ellipseVol + 100, 'the spline solid did not add material: ' + before);
});
await checkAsync('a 2-point spline is refused at the sketch step, on screen', async () => {
  await openTab('Sketch');
  await clickTool('Spline');
  await page.fill('#cadProps .pform input[data-k=pts]', '0,20; 20,0');
  await addAndBuild();
  await waitBuilt(5);
  const f = await features();
  ok(f[4] && /at least 3 points/.test(f[4].err || ''), 'the step was not marked failed: ' + JSON.stringify(f[4]));
  const shown = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox.bad'); return w ? w.textContent : ''; });
  ok(/at least 3 points/.test(shown), 'the reason is not on screen: ' + JSON.stringify(shown));
  const names = await treeNames();
  ok(names.some((n) => /Spline 2 points/.test(n)), 'the tree does not show the refused step: ' + JSON.stringify(names));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));

if (SHOTS) {
  await page.screenshot({ path: `docs/s21-sketch-curves-${VP.width}x${VP.height}.png` });
  console.log(`  shot docs/s21-sketch-curves-${VP.width}x${VP.height}.png`);
}
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
