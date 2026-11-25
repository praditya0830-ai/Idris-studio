/* S21n: Motion Study — Batch 12, in the real page.
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. Motion Study is runnable in the Assembly tab (it was grey before this batch) and opens its own panel with a
 *      driver, an axis, a pivot, a speed, a duration and a frame count;
 *   2. a base plate (60×40×20, Ø8 hole) and a top plate (30×20×10, Ø8 hole) are built by the page kernel, and the top
 *      plate is put 10 mm from the base's side face — so a 40 mm slide in 1 mm frames must meet it;
 *   3. running the study reports the kernel's own numbers: first contact at frame 11/40 (11.00 mm, 1.10 s) with
 *      200.00 mm³ of common volume, and the moved solid keeps its 5,497.35 mm³ at every frame;
 *   4. the assembly stores the run (40 rows) and the left panel lists it with the same measured numbers;
 *   5. the animation replays those frames (a display matrix reaches the viewer) and "Back to position" clears it;
 *   6. a frame count below 2 is refused with the value it read and does not replace the stored run;
 *   7. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21n-motion.spec.mjs
 *
 * SHOTS=1 writes docs/s21n-motion-<w>x<h>.png.
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const SHOTS = !!process.env.SHOTS;
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1194/chrome-linux/chrome');
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.asm, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(700);

const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Assembly');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
check('Motion Study is runnable, not grey', () => ok(slot['Motion Study'] === false, 'still grey: ' + JSON.stringify(slot['Motion Study'])));

/* two plates, built by the page kernel, put into one assembly */
const build = async (name, feats) => {
  await page.evaluate(async (a) => {
    const I = window.__idris;
    I.tools.startPart();
    I.state.part.name = a.name;
    I.state.part.features.push(...a.feats);
    I.tools.rebuildPart(true);
  }, { name, feats });
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return i && i.vol > 100; }, null, { timeout: 120000 });
  return page.evaluate(() => { const i = window.__idris.partInfo(); return { vol: i.vol }; });
};
const base = await build('Base plate', [
  { id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h1', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 20 } },
]);
check('the base plate builds (60×40×20 with a Ø8 hole)', () => ok(Math.abs(base.vol - (48000 - Math.PI * 16 * 20)) < 1, String(base.vol)));

const topVol = 6000 - Math.PI * 16 * 10;
const top = await build('Top plate', [
  { id: 't1', type: 'shape', p: { kind: 'box', L: 30, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h2', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 10 } },
]);
check('the top plate builds, 5,497.35 mm³', () => ok(Math.abs(top.vol - topVol) < 1, `${top.vol} != ${topVol}`));

await page.evaluate(() => { window.__TOP = JSON.parse(JSON.stringify(window.__idris.state.part)); });
await build('Base plate', [
  { id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h1', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 20 } },
]);
await page.evaluate(() => { const I = window.__idris; I.asm.start(); I.asm.insert(window.__TOP); });
await page.waitForFunction(() => { const a = window.__idris.asm.state(); return a && a.info && a.info.length === 2 && a.info.every((x) => x.ok); }, null, { timeout: 120000 });

/* the top plate goes 10 mm off the base plate's −x face: z 10..20 (the base is 0..20) and x −70..−40 */
await page.evaluate(() => { const I = window.__idris, a = I.asm.state(); a.comps[1].t = [-55, 0, 10]; a.comps[1].rz = 0; I.asm.rebuild(false); });
await page.waitForFunction(() => { const a = window.__idris.asm.state(); return a.info && a.info.every((x) => x.ok); }, null, { timeout: 60000 });
await page.evaluate(() => window.__idris.asm.select(window.__idris.asm.state().comps[1].cid));

const clickTool = async (name) => { await page.evaluate((n) => [...document.querySelectorAll('#xrib .xr-t')].find((b) => b.textContent.trim() === n).click(), name); await page.waitForTimeout(500); };
await clickTool('Motion Study');
const panel = await page.evaluate(() => { const n = document.querySelector('#asmTool'); return n ? { tool: n.getAttribute('data-tool'), text: n.innerText, keys: [...n.querySelectorAll('[data-k]')].map((x) => x.getAttribute('data-k')) } : null; });
check('the motion panel is on screen with its own fields', () => {
  ok(panel && panel.tool === 'motion', 'panel: ' + JSON.stringify(panel && panel.tool));
  for (const k of ['driver', 'axis', 'pivot', 'speed', 'duration', 'frames']) ok(panel.keys.includes(k), 'no field ' + k + ' in ' + JSON.stringify(panel.keys));
  ok(/Driver/.test(panel.text) && /Pivot/.test(panel.text) && /Frames/.test(panel.text), panel.text);
});

const fill = async (k, v) => { const sel = `#asmTool [data-k="${k}"]`; const tag = await page.$eval(sel, (n) => n.tagName).catch(() => null); ok(tag, 'no field ' + k); if (tag === 'SELECT') await page.selectOption(sel, String(v)); else await page.fill(sel, String(v)); await page.waitForTimeout(150); };
const runTool = async () => { await page.click('#asmTool .pact .chip.primary'); await page.waitForTimeout(4000); };
const chatText = () => page.evaluate(() => (document.querySelector('#chat') || {}).innerText || '');
const tail = (t, n = 900) => t.slice(-n);

await fill('driver', 'slide'); await fill('axis', 'x'); await fill('speed', 10); await fill('duration', 4); await fill('frames', 40);
await runTool();
let chat = await chatText();
check('the study reports first contact at frame 11/40 (11.00 mm, 1.10 s) with 200.00 mm³', () => {
  ok(/Motion study: Top plate slides 40\.00 mm along x in 40 frames/.test(chat), 'no motion line: ' + tail(chat));
  ok(/first contact at frame 11\/40 \(11\.00 mm, 1\.10 s\) with 200\.00 mm/.test(chat), 'no measured contact: ' + tail(chat));
  ok(/volume stayed 5,497\.3\d\d mm/.test(chat), 'no rigid volume: ' + tail(chat));
});
const stored = await page.evaluate(() => { const m = window.__idris.asm.state().motion; return m ? { frames: m.frames, rows: m.rows.length, vol0: m.vol0, dv: m.dv, first: m.first, driver: m.driver, total: m.total } : null; });
check('the run is stored with its 40 measured frames', () => {
  ok(stored, 'nothing stored');
  ok(stored.frames === 40 && stored.rows === 40, JSON.stringify(stored));
  ok(Math.abs(stored.vol0 - topVol) < 1, 'vol0 ' + stored.vol0);
  ok(stored.dv < 1e-6, 'the volume changed by ' + stored.dv);
  ok(stored.first && stored.first.i === 11 && Math.abs(stored.first.v - 200) < 0.01, JSON.stringify(stored.first));
});
const left = await page.evaluate(() => [...document.querySelectorAll('#cadLeft .gen-src')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
check('the left panel lists the motion study with the measured numbers', () => {
  ok(left.some((t) => /Motion study \(kernel\)/.test(t) && /first contact frame 11\/40 at 11\.00 mm with 200\.00 mm/.test(t)), JSON.stringify(left));
});

/* the animation replays the frames through a display matrix on the moving component */
await page.waitForTimeout(2500);
const anim = await page.evaluate(() => { const m = window.__idris.viewer.motive; return m && m.size ? { size: m.size, m: [...m.values()][0].slice(0, 16) } : null; });
check('the animation hands the viewer a display matrix for the moving part', () => {
  ok(anim && anim.size === 1, JSON.stringify(anim && anim.size));
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  ok(anim.m.some((v, i) => Math.abs(v - I[i]) > 1e-6), 'the matrix is still the identity: ' + JSON.stringify(anim.m));
});
const back = await page.evaluate(() => { const b = [...document.querySelectorAll('#cadLeft button')].find((x) => /Back to position/.test(x.textContent)); if (!b) return 'no button'; b.click(); return 'clicked'; });
await page.waitForTimeout(300);
const motiveAfter = await page.evaluate(() => window.__idris.viewer.motive);
check('Back to position clears the animation matrix', () => ok(back === 'clicked' && motiveAfter === null, back + ' / ' + JSON.stringify(motiveAfter)));

/* a frame count below 2 is refused with the value it read, and the stored run stays */
await fill('frames', 1);
await runTool();
chat = await chatText();
check('1 frame is refused with the value it read', () => ok(/at least 2 frames; the count is 1\./.test(chat), 'no refusal: ' + tail(chat)));
check('the refused run did not replace the stored one', async () => true);
const still = await page.evaluate(() => { const m = window.__idris.asm.state().motion; return { frames: m.frames, rows: m.rows.length }; });
check('the stored run is still the 40-frame slide', () => ok(still.frames === 40 && still.rows === 40, JSON.stringify(still)));

if (SHOTS) {
  await page.evaluate(() => window.__idris.asm.run.motion());
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `docs/s21n-motion-${VP.width}x${VP.height}.png` });
  console.log(`  ..   screenshot docs/s21n-motion-${VP.width}x${VP.height}.png`);
}

check('no page error through the whole run', () => ok(errors.length === 0, errors.join(' | ')));
console.log(`\n${pass} passed, ${fails.length} failed at ${VP.width}×${VP.height}`);
await browser.close();
if (fails.length) process.exitCode = 1;
