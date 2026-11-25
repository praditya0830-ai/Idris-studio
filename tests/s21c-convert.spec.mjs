/* S21c: Convert Entities in the real page (Batch 2b).
 *
 * The engineer's flow: build a box with the ribbon, open the sketcher, pick Convert Entities, press the button, then
 * save the sketch and extrude it with the kernel.
 *   1. Convert Entities is no longer grey in the Sketch tab;
 *   2. on a 40 × 30 × 20 box the button adds 4 projected lines to the sketch, and the panel note says they came
 *      from the model;
 *   3. saving that sketch and extruding it 12 mm adds 40 · 30 · 12 = 14 400 mm³ on top of the box (24 000 → 38 400);
 *   4. with no body the tool refuses and says what it needs;
 *   5. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21c-convert.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome');
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
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(350); };
const clickChip = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#cadProps .sktools button')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no sketch chip named ' + n); await page.waitForTimeout(300); };
const setNum = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform input[data-k=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(120); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const note = () => page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
const ents = () => page.evaluate(() => { const a = window.__idris.tools.skSession(); return a ? a.p.ents.map((e) => ({ id: e.id, t: e.t })) : []; });

console.log('\nThe ribbon');
await openTab('Sketch');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Convert Entities runs now', () => ok(s['Convert Entities'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nConvert Entities: the model becomes sketch lines');
await checkAsync('a 40 × 30 × 20 box projects as 4 lines, and they extrude 14 400 mm³', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await waitVol(24000, 1);

  await openTab('Sketch');
  await clickTool('Convert Entities');
  const opened = await page.evaluate(() => { const a = window.__idris.tools.skSession(); return a ? a.tool : null; });
  ok(opened === 'sconvert', 'the sketcher did not open on Convert Entities: ' + opened);
  await clickChip('Convert from the model');
  const e = await ents();
  ok(e.length === 4, 'expected 4 projected lines, got ' + e.length + ': ' + JSON.stringify(e));
  ok(e.every((x) => x.t === 'line'), 'a projected line did not stay a line: ' + JSON.stringify(e));
  const n = await note();
  ok(/converted/i.test(n), 'the note does not report the conversion: ' + JSON.stringify(n));

  await clickChip('Save sketch');
  await page.waitForTimeout(600);
  const f = await page.evaluate(() => window.__idris.state.part.features.map((x) => ({ type: x.type, n: (x.p.ents || []).length, err: x.err || null })));
  ok(f.some((x) => x.type === 'sketch' && x.n === 4), 'the tree does not hold the 4-entity sketch: ' + JSON.stringify(f));

  await openTab('Features');
  await clickTool('Extruded Boss/Base');
  await page.fill('#cadProps .pform input[data-k=dist]', '12');
  await page.click('#cadProps .pact .chip.primary');
  await waitVol(38400, 2);
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[0] - 40) < 1e-6 && Math.abs(info.size[1] - 30) < 1e-6, 'the converted profile is not 40 × 30: ' + JSON.stringify(info.size));
});

console.log('\nWith no body the tool refuses');
await checkAsync('a Convert with nothing built says what it needs', async () => {
  await page.evaluate(async () => { const p = window.__idris.state.part; p.features = []; await window.__idris.tools.rebuildPart(); });
  await page.waitForFunction(() => window.__idris.partInfo() === null, null, { timeout: 120000 });
  await openTab('Sketch');
  await page.evaluate(() => window.__idris.tools.openSketchSession('sconvert'));
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('#cadProps [data-sk=conv-go]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  const n = await note();
  ok(/build a body/i.test(n), 'no reason for the refusal: ' + JSON.stringify(n));
  const e = await ents();
  ok(e.length === 0, 'it added entities with no body: ' + JSON.stringify(e));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
