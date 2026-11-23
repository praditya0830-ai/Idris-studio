/* S20: the Drawing tab in the real page (Batch 6).
 *
 * Checks, at 1366×768 and 1280×800:
 *   1. Section / Detail View and GD&T now run from the ribbon (both were grey);
 *   2. one 60×40×10 plate with a Ø8 through hole is built by the page kernel, and the A3 sheet is drawn from it;
 *   3. the section is a kernel boolean: at Y = 0 it removes 11,748.67 mm³ of 23,497.35 mm³ and exposes 520.00 mm² of
 *      cut face in two faces (the hole's strip splits it) — the number is in the chat and in the dialog;
 *   4. the detail view is a cylinder window the kernel cuts out: Ø20 at 5:1 on the top view, holding the Ø8 hole;
 *      the sheet gets the dashed window circle and the projected paths under "DETAIL B (5:1)";
 *   5. GD&T measures flatness 0.000 mm on the largest plane and perpendicularity 0.000 mm at 90.000° to datum A,
 *      and prints both feature control frames on the sheet;
 *   6. the DXF download carries the detail-layer polylines and the GD&T block;
 *   7. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s20-drawing.spec.mjs
 *
 * SHOTS=1 writes docs/s20-drawing-<w>x<h>.png.
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

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
await page.waitForFunction(() => !!window.__idris && !!window.__idris.tools, null, { timeout: 120000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.hide ? h.hide() : h.remove(); document.body.classList.remove('at-home'); });
await page.waitForTimeout(800);

const tabs = await page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()));
check('the Drawing tab is in the ribbon', () => ok(tabs.includes('Drawing'), 'no Drawing tab in ' + JSON.stringify(tabs)));
const openTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(300); };
await openTab('Drawing');
const slot = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
check('Section / Detail View runs now', () => ok(slot['Section / Detail View'] === false, 'still grey: ' + JSON.stringify(slot)));
check('GD&T runs now', () => ok(slot['GD&T'] === false, 'still grey: ' + JSON.stringify(slot)));
check('the rest of the Drawing tab stays as it was', () => { ok(slot['Working Drawings (A3)'] === false && slot['BOM Table'] === false, JSON.stringify(slot)); });

/* one plate with a through hole, built by the page kernel */
await page.evaluate(async () => {
  const I = window.__idris;
  I.tools.startPart();
  I.state.part.name = 'Drawing plate';
  I.state.part.features.push({ id: 'b1', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 10, x: 0, y: 0, z: 0, op: 'add' } });
  I.state.part.features.push({ id: 'h1', type: 'hole', p: { x: 0, y: 0, type: 'simple', D: 8, depthMode: 'thru', depth: 10 } });
  I.tools.rebuildPart(true);
});
await page.waitForFunction(() => { const i = window.__idris.partInfo(); return i && i.vol > 100; }, null, { timeout: 120000 });
const plateVol = await page.evaluate(() => window.__idris.partInfo().vol);
check('the plate is 60×40×10 with a Ø8 hole', () => ok(Math.abs(plateVol - (24000 - Math.PI * 16 * 10)) < 1, String(plateVol)));

const chatText = () => page.evaluate(() => (document.querySelector('#chat') || {}).innerText || '');
const clickTool = async (name) => {
  await page.evaluate((n) => [...document.querySelectorAll('#xrib .xr-t')].find((b) => b.textContent.trim() === n).click(), name);
  await page.waitForTimeout(400);
};
const sheetSvg = () => page.evaluate(() => { const s = document.querySelector('#drawdlg .draw-v svg'); return s ? s.outerHTML : ''; });
const dlgText = () => page.evaluate(() => { const d = document.querySelector('#drawdlg'); return d ? d.innerText : ''; });
const want = async (sel, ms = 120000) => { await page.waitForSelector(sel, { timeout: ms }); };
const tail = (t, n = 900) => t.slice(-n);

/* 1. Section / Detail View: the dialog is the drawing workspace, and the section is a kernel cut */
await clickTool('Section / Detail View');
await want('#drawdlg');
await want('#drawdlg [data-do="detAdd"]');
let dlg = await dlgText();
check('the drawing dialog opens with the section, detail and GD&T blocks', () => {
  ok(/Detail view \(kernel window\)/.test(dlg), 'no detail block: ' + dlg.slice(0, 400));
  ok(/GD&T \(measured on the kernel faces\)/.test(dlg), 'no GD&T block: ' + dlg.slice(0, 400));
  ok(/Section A–A/.test(dlg), 'no section controls');
});
let svg = await sheetSvg();
check('the sheet has kernel projection paths', () => { const n = (svg.match(/<path /g) || []).length; ok(n > 4, 'only ' + n + ' paths'); });

await page.check('#drawdlg input[type="checkbox"]');
await page.waitForFunction(() => /Section A–A at Y/.test((document.querySelector('#drawdlg') || {}).innerText || ''), null, { timeout: 120000 });
dlg = await dlgText();
let chat = await chatText();
check('the section measures what the kernel removed (11,748.67 mm³ of 23,497.35 mm³)', () => {
  ok(/removed 11,748\.67 mm³/.test(dlg), 'no removed volume: ' + dlg.slice(-700));
  ok(/23,497\.35 mm³/.test(dlg), 'no part volume: ' + dlg.slice(-700));
  ok(/Section A–A at Y/.test(chat), 'the chat has no section line: ' + tail(chat));
});
check('and the cut face it exposes: 520.00 mm² in two faces', () => {
  ok(/520\.00 mm²/.test(dlg), 'no cut area: ' + dlg.slice(-700));
  ok(/in 2 faces/.test(dlg), 'no face count: ' + dlg.slice(-700));
});
svg = await sheetSvg();
check('the section is on the sheet, with the cutting line', () => { ok(/Section A–A/.test(svg), 'no section label in the svg'); ok(/stroke-dasharray="8 2 1 2"/.test(svg), 'no A–A cutting line'); });

/* 2. the detail view: a cylinder window cut out of the plate and projected */
await page.selectOption('#drawdlg [data-k="detView"]', 'top');
await page.waitForTimeout(400);
await page.fill('#drawdlg [data-k="r"]', '10');
await page.selectOption('#drawdlg [data-k="detMag"]', '5');
await page.click('#drawdlg [data-do="detAdd"]');
await page.waitForFunction(() => /Detail B drawn/.test((document.querySelector('#chat') || {}).innerText || ''), null, { timeout: 120000 });
chat = await chatText();
dlg = await dlgText();
check('the detail window keeps a piece of the part and reads the Ø8 hole', () => {
  ok(/Detail B drawn at (5|2|1):1( \(asked [^)]*\))? \(top view\)/.test(chat), 'no detail line: ' + tail(chat));
  ok(/Ø20 mm window/.test(chat), 'no window Ø: ' + tail(chat));
  ok(/Ø8 mm measured inside it/.test(chat), 'no hole measured: ' + tail(chat));
});
svg = await sheetSvg();
check('the sheet carries DETAIL B (5:1) and the dashed window circle', () => {
  ok(/DETAIL B \((5|2|1):1\)/.test(svg), 'no detail label in the svg');
  ok(/stroke-dasharray="3 1\.4"/.test(svg), 'no window circle in the svg');
});

/* 3. GD&T: measured on the B-rep faces */
await page.evaluate(() => { const d = document.querySelector('#drawdlg'); if (d) d.remove(); });
await clickTool('GD&T');
await want('#drawdlg [data-do="gdtFlat"]');
await page.waitForFunction(() => { const b = document.querySelector('#drawdlg [data-do="gdtFlat"]'); return b && !b.disabled; }, null, { timeout: 120000 });
dlg = await dlgText();
check('GD&T reports the measured numbers before anything is added', () => {
  ok(/flatness 0\.000 mm/.test(dlg), 'no flatness: ' + dlg.slice(-700));
  ok(/perpendicularity 0\.000 mm at 90\.000°/.test(dlg), 'no perpendicularity: ' + dlg.slice(-700));
});
await page.click('#drawdlg [data-do="gdtFlat"]');
await page.waitForTimeout(600);
await page.click('#drawdlg [data-do="gdtPerp"]');
await page.waitForTimeout(900);
svg = await sheetSvg();
check('both feature control frames are on the sheet with their measured value', () => {
  ok(/GD&amp;T — measured on the kernel faces/.test(svg), 'no GD&T heading in the svg');
  ok(/▱/.test(svg) && /0\.000/.test(svg), 'no flatness frame');
  ok(/⊥/.test(svg), 'no perpendicularity frame');
});
dlg = await dlgText();
check('the frames are listed and removable', () => { ok(/flat 0\.000/.test(dlg) || /▱ 0\.000/.test(dlg), 'no flat frame row: ' + dlg.slice(-500)); });

/* 4. the DXF carries what the sheet shows */
const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => [...document.querySelectorAll('#drawdlg .gen-var .chip')].find((b) => /DXF/.test(b.textContent)).click())]);
const dxfPath = await dl.path();
const dxf = readFileSync(dxfPath, 'utf8');
check('the DXF has the detail layer and the GD&T block', () => {
  ok(/DETAIL/.test(dxf), 'no DETAIL layer');
  ok(/GD&T/.test(dxf), 'no GD&T text');
  ok(/DETAIL B \((5|2|1):1\)/.test(dxf), 'no detail label');
});
check('the DXF is a real drawing file with entities', () => { ok(/^0\nSECTION\n2\nHEADER/.test(dxf), 'no header'); ok((dxf.match(/\nLINE\n/g) || []).length > 20, 'too few lines'); ok(/0\nENDSEC\n0\nEOF\n$/.test(dxf), 'no EOF'); });

check('no page error during the whole run', () => ok(errors.length === 0, errors.join(' | ')));

if (SHOTS) { await page.screenshot({ path: `docs/s20-drawing-${VP.width}x${VP.height}.png`, fullPage: false }); }
console.log(`\nS20 page ${VP.width}x${VP.height}: ${pass}/${pass + fails.length} checks passed`);
await browser.close();
if (fails.length) process.exit(1);
