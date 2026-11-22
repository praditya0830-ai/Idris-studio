/* Assemble, standard parts (Arya 22 Nov, live snow plow): the Assemble button did nothing when every part came
 * from the library, and a mixed assembly looked incomplete because the hydraulic unit and the pins were missing.
 *
 * The plan/job data here is stubbed (no AI), but everything after the button is the shipping path: the real
 * genWorker/genCall kernel builds the designed part, and the standard parts are drawn as labelled blocks.
 *
 *   BASE_URL=http://127.0.0.1:3021 VP=1366x768 node tests/t34-assemble-standard.spec.mjs
 *   BASE_URL=http://127.0.0.1:3021 VP=1280x800 node tests/t34-assemble-standard.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021';
const OUT = process.env.OUT || 'docs';
const VP = (process.env.VP || '1366x768').split('x').map(Number);
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const PLATE = 'const p = makeBaseBox(60, 40, 6); return p;';
const RAM = { id: 'ram', name: 'Hydraulic cylinder', qty: 1, status: 'standard', cad: null };
const PIN = { id: 'pin', name: 'Pivot pin', qty: 2, status: 'standard', cad: null };
const PUMP = { id: 'pump', name: 'Gear pump', qty: 1, status: 'standard', cad: null };

const MIXED = {
  stage: 'design', status: 'done', id: 'job-mixed', request: 'snow plow mount for a pickup',
  parts: [{ id: 'plate', name: 'Mount plate', qty: 1, status: 'done', fidelity: 'full', cad: { code: PLATE, params: [] } }, RAM, PIN, PUMP],
  assembly: { frames_complete: true, parts: [
    { id: 'plate', origin_mm: [0, 0, 0] }, { id: 'ram', origin_mm: [200, 0, 30] },
    { id: 'pin', origin_mm: [0, 0, 50] }, { id: 'pump', origin_mm: [-120, 0, 0] }] },
  plan: { parts: [], interfaces: [
    { between: ['ram', 'plate'], kind: 'pin', params: { bore_mm: 40 } },
    { between: ['pin', 'plate'], kind: 'pin', params: { diameter_mm: 16 } }] },
};

const ALL_STANDARD = {
  stage: 'design', status: 'done', id: 'job-std', request: 'hydraulic kit, nothing custom',
  parts: [RAM, PIN],
  assembly: { frames_complete: true, parts: [
    { id: 'ram', origin_mm: [0, 0, 0] }, { id: 'pin', origin_mm: [80, 0, 0] }] },
  plan: { parts: [], interfaces: [{ between: ['ram', 'pin'], kind: 'pin', params: { diameter_mm: 20 } }] },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/tmp/c1187/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: VP[0], height: VP[1] } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|Failed to load resource/i.test(t)) errors.push('console: ' + t.slice(0, 180)); });
await page.route('http://mock.local/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.goto(BASE + '/index.html?api=http://mock.local', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris && !!window.__idris.asm, { timeout: 60000 });
/* the assembly panel lives in the workspace, not on the home screen */
await page.evaluate(() => { const hm = document.querySelector('#home'); if (hm) hm.hidden = true; document.body.classList.remove('at-home'); });

/* ---- 1. every part standard: the button answers instead of going silent ---- */
await page.evaluate((j) => window.__idris.asm.setJob(j), ALL_STANDARD);
await page.waitForSelector('#asmPanel .gen-var .chip.primary');
await page.click('#asmPanel .gen-var .chip.primary');
await page.waitForFunction(() => { const a = window.__idris.asm.job(); return !!(a && a.built && a.built.error); }, { timeout: 20000 });
const std = await page.evaluate(() => ({
  built: window.__idris.asm.job().built,
  panel: (document.querySelector('#asmPanel') || {}).innerText || '',
  parts: (window.__idris.viewer.parts || []).length,
}));
check('standard-only assembly says why nothing was built', () => {
  if (!/Nothing to build yet: every part here is a standard\/library part \(no 3D geometry\)/.test(std.panel))
    throw new Error('message missing: ' + std.panel.slice(0, 400));
  if (!/Design at least one custom part, or open each standard part from the library/.test(std.panel))
    throw new Error('no next step in the message');
});
check('nothing was drawn for a standard-only assembly', () => eq(0, std.parts, 'viewer parts'));

/* ---- 2. mixed assembly: the designed part is real, the standard parts are labelled blocks ---- */
await page.evaluate((j) => window.__idris.asm.setJob(j), MIXED);
await page.waitForSelector('#asmPanel .gen-var .chip.primary');
await page.click('#asmPanel .gen-var .chip.primary');
await page.waitForFunction(() => { const a = window.__idris.asm.job(); return !!(a && a.built && !a.assembling && (a.built.ok != null || a.built.error)); }, { timeout: 180000 });
const mix = await page.evaluate(() => ({
  built: window.__idris.asm.job().built,
  names: (window.__idris.viewer.parts || []).map((p) => p.name),
  stdLine: (document.querySelector('#asmStdLine') || {}).textContent || '',
  skipLine: ((document.querySelector('#asmStdSkipped') || {}).closest ? document.querySelector('#asmStdSkipped').closest('li').textContent : ''),
  panel: (document.querySelector('#asmPanel') || {}).innerText || '',
}));
check('the designed part is built by the kernel', () => {
  eq(1, mix.built.ok, 'built parts');
  eq(0, mix.built.failed.length, 'failed parts');
});
check('both standard parts are drawn as labelled blocks', () => {
  eq(2, mix.built.standard, 'standard blocks');
  eq(3, mix.names.length, 'viewer parts');
  if (!mix.names.includes('Hydraulic cylinder (standard)')) throw new Error('names: ' + mix.names.join(', '));
  if (!mix.names.includes('Pivot pin (standard)')) throw new Error('names: ' + mix.names.join(', '));
});
check('the result says how many standard parts are blocks, and that they are placeholders', () => {
  if (!/2 standard parts shown as blocks \(no real geometry\)/.test(mix.stdLine)) throw new Error('line: ' + mix.stdLine);
  if (!/placeholder bbox, not real geometry/.test(mix.panel)) throw new Error('no placeholder note');
});
check('a standard part with no size in the plan is reported, not invented', () => {
  if (!/Gear pump: no size in the plan/.test(mix.skipLine)) throw new Error('skip line: ' + mix.skipLine);
});
check('the placeholder blocks stay out of the interference check', () => {
  eq(0, mix.built.clashes.length, 'clashes');
});

if (process.env.SHOT !== '0') await page.screenshot({ path: `${root}/${OUT}/t34-assemble-${VP[0]}.png` });
check('no JavaScript errors while assembling', () => { if (errors.length) throw new Error(errors.join(' | ')); });

await browser.close();
const bad = fails.length;
console.log(`\n${pass} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
