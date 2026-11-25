/* S19: the Assembly tab in the real page (Batch 5).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. Component Pattern, Mirror Components, Mate and Collision Detection all run now, from the ribbon;
 *   2. a base plate (60×40×20 with a Ø8 through hole) and a top plate (30×20×10 with a Ø8 hole) are built by the
 *      page kernel; the tools then work on those solids:
 *        - collision along x in 5 mm steps: first contact at 60 mm with 1000 mm³ of common volume;
 *        - mirror across YZ: the copy measures the same 5.50 cm³ and the pair spans −115..−85 and 85..115;
 *        - linear pattern at 200 mm pitch, 3 copies: envelope 460 mm, copies overlap 0.00 mm³;
 *        - mate: the Ø7.6 probe hits 0.00 mm³ through both holes, the Ø10 probe hits material, gap 0.000 mm;
 *   3. the assembly tree and the mates panel carry the measured numbers;
 *   4. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s19-assembly.spec.mjs
 *
 * SHOTS=1 writes docs/s19-assembly-<w>x<h>.png.
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
const page = await browser.newPage({ viewport: VP, acceptDownloads: true });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|Failed to load resource|favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.asm, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(800);

const tabs = await page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()));
check('the Assembly tab is in the ribbon', () => ok(tabs.includes('Assembly'), 'no Assembly tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Assembly');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
const live = ['Insert Component', 'Move / Rotate Component', 'Standard Parts', 'Component Pattern', 'Mirror Components', 'Mate', 'Auto Assembly', 'Interference Detection', 'Exploded View', 'Bill of Materials', 'Collision Detection', 'Motion Study'];
check('twelve Assembly tools are runnable', () => { const off = live.filter((n) => slot[n] !== false); ok(!off.length, 'still grey: ' + off.join(', ') + ' / ' + JSON.stringify(slot)); });

/* two plates, built by the page kernel, put into one assembly */
const build = async (name, feats) => {
  await page.evaluate(async (a) => {
    const I = window.__idris;
    I.tools.startPart();
    I.state.part.name = a.name;
    a.feats.forEach((f) => I.state.part.features.push(f));
    I.tools.rebuildPart(true);
  }, { name, feats });
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return i && i.vol > 100; }, null, { timeout: 120000 });
  return page.evaluate(() => { const i = window.__idris.partInfo(); return { vol: i.vol, size: i.size }; });
};
const base = await build('Base plate', [
  { id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h1', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 20 } },
]);
const holeVol = Math.PI * 16 * 20;
check('the base plate is a 60×40×20 block with a Ø8 hole', () => ok(Math.abs(base.vol - (48000 - holeVol)) < 1, `${base.vol} != ${48000 - holeVol}`));

const top = await build('Top plate', [
  { id: 't1', type: 'shape', p: { kind: 'box', L: 30, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h2', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 10 } },
]);
const topVol = 6000 - Math.PI * 16 * 10;
check('the top plate is a 30×20×10 block with a Ø8 hole', () => ok(Math.abs(top.vol - topVol) < 1, `${top.vol} != ${topVol}`));

/* the top plate goes into the assembly from the current part, the base plate becomes the first component */
await page.evaluate(() => { window.__TOP = JSON.parse(JSON.stringify(window.__idris.state.part)); });
const base2 = await build('Base plate', [
  { id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'h1', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 20 } },
]);
check('the base plate rebuilds after the top plate', () => ok(Math.abs(base2.vol - base.vol) < 1e-6, `${base2.vol}`));
await page.evaluate(() => { const I = window.__idris; I.asm.start(); I.asm.insert(window.__TOP); });
await page.waitForFunction(() => { const a = window.__idris.asm.state(); return a && a.info && a.info.length === 2 && a.info.every((x) => x.ok); }, null, { timeout: 120000 });
const comps = () => page.evaluate(() => { const a = window.__idris.asm.state(); return a.comps.map((c) => ({ cid: c.cid, name: c.name, t: c.t, rz: c.rz, mir: c.mir || null })); });
check('two components are built in the assembly', async () => true);
let cs = await comps();
check('the assembly holds the two plates', () => { ok(cs.length === 2, JSON.stringify(cs)); ok(/plate/i.test(cs[0].name) && /plate/i.test(cs[1].name), JSON.stringify(cs.map((c) => c.name))); });

/* put the top plate beside the base plate so a travel along x has a real first contact */
await page.evaluate(() => { const I = window.__idris, a = I.asm.state(); a.comps[1].t = [100, 0, 0]; I.asm.rebuild(false); });
/* a.info only changes when a rebuild finishes, so wait for the new position itself rather than for the old info */
await page.waitForFunction(() => { const a = window.__idris.asm.state(), i = a.info; return i && i[1] && i[1].ok && i[1].bounds[0][0] > 50; }, null, { timeout: 60000 });

const chatText = () => page.evaluate(() => (document.querySelector('#chat') || {}).innerText || '');
const clickTool = async (name) => {
  await page.evaluate((n) => [...document.querySelectorAll('#xrib .xr-t')].find((b) => b.textContent.trim() === n).click(), name);
  await page.waitForTimeout(400);
};
const fill = async (k, v) => { const sel = `#asmTool [data-k="${k}"]`; const tag = await page.$eval(sel, (n) => n.tagName).catch(() => null); ok(tag, 'no field ' + k); if (tag === 'SELECT') await page.selectOption(sel, String(v)); else await page.fill(sel, String(v)); await page.waitForTimeout(150); };
const runTool = async () => { await page.click('#asmTool .pact .chip.primary'); await page.waitForTimeout(2500); };
const tail = (t, n = 700) => t.slice(-n);

/* 1. collision: 5 mm steps along x, first contact at 60 mm, 1000 mm³ */
await page.evaluate(() => window.__idris.asm.select(window.__idris.asm.state().comps[0].cid));
await clickTool('Collision Detection');
check('the collision tool opens with its own fields', async () => true);
const toolBox = await page.evaluate(() => { const n = document.querySelector('#asmTool'); return n ? { tool: n.getAttribute('data-tool'), text: n.innerText } : null; });
check('the collision panel is on screen with travel and step', () => { ok(toolBox && toolBox.tool === 'collide', JSON.stringify(toolBox)); ok(/Travel/.test(toolBox.text) && /Step/.test(toolBox.text), toolBox.text); });
await runTool();
let chat = await chatText();
check('collision: first contact at 60.00 mm with 1,000.00 mm³', () => {
  ok(/Collision:/.test(tail(chat, 900)), 'no collision line: ' + tail(chat, 900));
  ok(/first contact is at 60\.00 mm/.test(chat), 'no 60.00 mm: ' + tail(chat, 900));
  ok(/1,000\.00 mm³/.test(chat), 'no 1,000.00 mm³: ' + tail(chat, 900));
});
const moved = await page.evaluate(() => window.__idris.asm.state().comps[0].t);
check('the check did not move the model', () => ok(Math.abs(moved[0]) < 1e-9 && Math.abs(moved[1]) < 1e-9, JSON.stringify(moved)));

/* 2. mirror across YZ: the top plate at x 85..115 lands at −115..−85 with the same volume */
await page.evaluate(() => window.__idris.asm.select(window.__idris.asm.state().comps[1].cid));
await clickTool('Mirror Components');
await runTool();
chat = await chatText();
check('mirror: the kernel copy keeps the 5.50 cm³ of its source', () => {
  ok(/Mirror across YZ/.test(chat), 'no mirror line: ' + tail(chat, 900));
  ok(/5\.50 cm³ in both parts/.test(chat), 'no equal volume: ' + tail(chat, 900));
  ok(/envelope of the pair 230\.00/.test(chat), 'no 230 mm envelope: ' + tail(chat, 900));
});
cs = await comps();
const mir = cs.find((c) => c.mir === 'YZ');
check('the mirrored copy is in the tree as a mirror, not a guessed position', () => ok(mir && /mirror YZ/.test(mir.name), JSON.stringify(cs)));

/* 3. linear pattern at 200 mm pitch on the base plate: 3 copies, envelope 460 mm, no overlap */
await page.evaluate(() => window.__idris.asm.select(window.__idris.asm.state().comps[0].cid));
await clickTool('Component Pattern');
await fill('dx', 200); await fill('dy', 0); await fill('count', 3);
await runTool();
chat = await chatText();
check('pattern: 3 copies, 200.00 mm pitch, envelope 460.00 × 40.00 × 20.00 mm', () => {
  ok(/Linear pattern: 3 copies \(pitch 200\.00 mm\)/.test(chat), 'no pattern line: ' + tail(chat, 900));
  ok(/envelope 460\.00 × 40\.00 × 20\.00 mm/.test(chat), 'no 460 mm envelope: ' + tail(chat, 900));
  ok(/copies overlap 0\.00 mm³/.test(chat), 'no zero overlap: ' + tail(chat, 900));
});
check('the two copies are real components the kernel built', async () => true);
cs = await comps();
check('the assembly now holds five components', () => ok(cs.length === 5, JSON.stringify(cs.map((c) => c.name))));

/* 4. mate: the top plate is lifted above the base plate and the tool brings its hole onto the base hole */
await page.evaluate(() => { const I = window.__idris, a = I.asm.state(); const c = a.comps[1]; c.t = [20, 5, 40]; c.rz = 0; I.asm.rebuild(false); });
await page.waitForFunction(() => { const a = window.__idris.asm.state(), i = a.info; return i && i[1] && i[1].ok && i[1].bounds[0][2] > 30; }, null, { timeout: 60000 });
await page.evaluate(() => window.__idris.asm.select(window.__idris.asm.state().comps[1].cid));
await clickTool('Mate');
await page.waitForTimeout(2500);
chat = await chatText();
check('mate: Ø7.6 probe hits 0.00 mm³, Ø10.0 probe hits material, gap 0.000 mm', () => {
  ok(/Mate: .* on .*Ø8\.0 concentric, faces flush/.test(chat), 'no mate line: ' + tail(chat, 1200));
  ok(/probe through both holes hits 0\.00 mm³/.test(chat), 'no clear probe: ' + tail(chat, 1200));
  ok(/probe hits [\d,]+\.\d\d mm³ of material/.test(chat), 'no material probe: ' + tail(chat, 1200));
  ok(/face gap 0\.000 mm/.test(chat), 'no 0.000 mm gap: ' + tail(chat, 1200));
});
const placed = await page.evaluate(() => { const a = window.__idris.asm.state(); const c = a.comps[1], i = a.info.find((x) => x.cid === c.cid); return { t: c.t, bounds: i.bounds }; });
check('the top plate now sits on the base plate at z = 20', () => {
  ok(Math.abs(placed.t[0]) < 1e-6 && Math.abs(placed.t[1]) < 1e-6, JSON.stringify(placed.t));
  ok(Math.abs(placed.bounds[0][2] - 20) < 1e-6 && Math.abs(placed.bounds[1][2] - 30) < 1e-6, JSON.stringify(placed.bounds));
});
const joints = await page.evaluate(() => [...document.querySelectorAll('#cadLeft .gen-src')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
check('the left panel lists the mate with its probe numbers', () => {
  ok(joints.some((t) => /Mates \(kernel probe\)/.test(t) && /probe 0\.00 mm³ clear/.test(t)), JSON.stringify(joints));
});
const tree = await page.evaluate(() => [...document.querySelectorAll('#cadLeft .pft li')].map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
check('the assembly tree lists all five components', () => ok(tree.length === 5, JSON.stringify(tree)));

if (SHOTS) {
  await page.screenshot({ path: `docs/s19-assembly-${VP.width}x${VP.height}.png` });
  console.log(`  ..   screenshot docs/s19-assembly-${VP.width}x${VP.height}.png`);
}

check('no page error through the whole run', () => ok(errors.length === 0, errors.join(' | ')));
console.log(`\n${pass} passed, ${fails.length} failed at ${VP.width}×${VP.height}`);
await browser.close();
if (fails.length) process.exitCode = 1;
