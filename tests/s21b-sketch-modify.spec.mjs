/* S21b: Mirror Entities and Sketch Pattern in the real page (Batch 2).
 *
 * The flow is the engineer's, not an API call: open the sketcher from the ribbon, draw with the sketch tools, select
 * in the entity list, press Mirror / Pattern, then save and extrude the sketch with the kernel.
 *   1. Mirror Entities and Sketch Pattern are no longer grey in the Sketch tab;
 *   2. Mirror: draw half a 40 × 10 profile plus its centre line, select the three lines, press Mirror → the sketch
 *      holds 7 entities and one closed loop, and Extruded Boss/Base 5 mm gives 40 · 10 · 5 = 2 000 mm³;
 *   3. Pattern: a 20 × 20 square patterned linearly (2 instances, 40 mm step) holds 8 entities, and the sketch
 *      still saves and builds;
 *   4. the panel refuses to act with nothing selected, and says what to do;
 *   5. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21b-sketch-modify.spec.mjs
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
const slotState = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(350); };
const clickChip = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#cadProps .sktools button')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no sketch chip named ' + n); await page.waitForTimeout(250); };
const skClick = (pt) => page.evaluate((q) => window.__idris.tools.skClick(q), pt);
const ents = () => page.evaluate(() => { const a = window.__idris.tools.skSession(); return a ? a.p.ents.map((e) => ({ id: e.id, t: e.t, c: e.c })) : []; });
const selCount = () => page.evaluate(() => { const a = window.__idris.tools.skSession(); const b = document.querySelector('#cadProps [data-sk=mirror-go]') || document.querySelector('#cadProps [data-sk=pat-go]'); return b ? b.textContent : ''; });
const listClick = async (i) => { await page.evaluate((k) => document.querySelectorAll('#cadProps .sklist li')[k].click(), i); await page.waitForTimeout(150); };
/* the panel is re-rendered between actions, so type into the field the panel has now */
const setNum = async (sk, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps [data-sk=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [sk, v]); await page.waitForTimeout(120); };

console.log('\nThe ribbon');
await openTab('Sketch');
{
  const s = await slotState();
  check('Mirror Entities runs now', () => ok(s['Mirror Entities'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Sketch Pattern runs now', () => ok(s['Sketch Pattern'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Convert Entities stays grey: it needs the edge-to-entity mapping', () => ok(s['Convert Entities'] === true, JSON.stringify(s)));
}

console.log('\nMirror Entities: half a profile becomes the whole one');
await checkAsync('draw, select, mirror, save and extrude 2 000 mm³', async () => {
  await clickTool('Mirror Entities');
  const opened = await page.evaluate(() => !!window.__idris.tools.skSession());
  ok(opened, 'the sketcher did not open');
  await clickChip('Line');
  for (const p of [[0, 0], [20, 0], [20, 10], [0, 10]]) await skClick(p);
  await clickChip('Centerline');
  for (const p of [[0, 0], [0, 10]]) await skClick(p);
  let e = await ents();
  ok(e.length === 4, 'expected 3 lines and a centre line: ' + JSON.stringify(e));
  ok(e.filter((x) => x.c).length === 1, 'exactly one construction line');

  await clickChip('Mirror Entities');
  const refused = await page.evaluate(() => { document.querySelector('#cadProps [data-sk=mirror-go]').click(); const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/Select the entities/i.test(refused), 'mirroring with nothing selected must refuse and say why: ' + JSON.stringify(refused));
  await page.waitForTimeout(200);

  await listClick(0); await listClick(1); await listClick(2);
  const label = await selCount();
  ok(/\(3\)/.test(label), 'the button does not count the selection: ' + label);
  const line = await page.evaluate(() => { const s = document.querySelector('#cadProps select[data-sk=mirror]'); return s ? s.value : ''; });
  ok(line, 'no mirror line was chosen by default');
  await page.evaluate(() => document.querySelector('#cadProps [data-sk=mirror-go]').click());
  await page.waitForTimeout(400);
  e = await ents();
  ok(e.length === 7, 'expected 7 entities after the mirror: ' + JSON.stringify(e));
  const note = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/mirrored/i.test(note), 'the note does not report the mirror: ' + JSON.stringify(note));

  await clickChip('Save sketch');
  await page.waitForTimeout(600);
  const f = await page.evaluate(() => window.__idris.state.part.features.map((x) => ({ type: x.type, n: (x.p.ents || []).length, err: x.err || null })));
  ok(f[0] && f[0].type === 'sketch' && f[0].n === 7, 'the tree does not hold the 7-entity sketch: ' + JSON.stringify(f));

  await openTab('Features');
  await clickTool('Extruded Boss/Base');
  await page.fill('#cadProps .pform input[data-k=dist]', '5');
  await page.click('#cadProps .pact .chip.primary');
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return !!i && Math.abs(i.vol - 2000) <= 0.01; }, null, { timeout: 120000 });
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.size[0] - 40) < 1e-6 && Math.abs(info.size[1] - 10) < 1e-6, 'the mirrored profile is not 40 × 10: ' + JSON.stringify(info.size));
});

console.log('\nSketch Pattern: a square becomes two');
await checkAsync('pattern 2 instances at 40 mm, then build', async () => {
  await page.evaluate(() => { const p = window.__idris.state.part; p.features = []; });
  await openTab('Sketch');
  await page.evaluate(() => window.__idris.tools.openSketchSession('spat'));
  await page.waitForTimeout(300);
  await clickChip('Line');
  for (const p of [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]) await skClick(p);
  await clickChip('End chain');
  let e = await ents();
  ok(e.length === 4, 'expected a 4-line square: ' + JSON.stringify(e));
  await clickChip('Sketch Pattern');
  const pat = await page.evaluate(() => [...document.querySelectorAll('#cadProps [data-sk]')].map((x) => x.getAttribute('data-sk')));
  ok(pat.includes('pat-count') && pat.includes('pat-dx') && pat.includes('pat-dy'), 'the pattern panel is missing its fields: ' + JSON.stringify(pat));
  for (let i = 0; i < 4; i++) await listClick(i);
  await setNum('pat-count', 2);
  await setNum('pat-dx', 40);
  await setNum('pat-dy', 0);
  const cfg = await page.evaluate(() => window.__idris.tools.skSession().pat);
  ok(String(cfg.count) === '2' && String(cfg.dx) === '40', 'the panel did not take the values: ' + JSON.stringify(cfg));
  await page.evaluate(() => document.querySelector('#cadProps [data-sk=pat-go]').click());
  await page.waitForTimeout(400);
  e = await ents();
  ok(e.length === 8, 'expected 8 entities after the pattern: ' + JSON.stringify(e));
  const note = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/pattern/i.test(note), 'the note does not report the pattern: ' + JSON.stringify(note));

  await clickChip('Save sketch');
  await page.waitForTimeout(600);
  await openTab('Features');
  await clickTool('Extruded Boss/Base');
  await page.fill('#cadProps .pform input[data-k=dist]', '5');
  await page.click('#cadProps .pact .chip.primary');
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && i.vol > 0; }, null, { timeout: 120000 });
  const v = await page.evaluate(() => window.__idris.partInfo().vol);
  ok(Math.abs(v - 2000) < 1e-6 || Math.abs(v - 4000) < 1e-6, 'the patterned sketch built an unexpected volume: ' + v);
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
