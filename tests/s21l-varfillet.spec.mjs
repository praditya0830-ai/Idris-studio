/* S21l: Variable Fillet in the real page (Batch 7).
 *
 * The engineer's flow: a box, then Features → Variable Fillet: pick one edge in the list or in the viewport, type a
 * radius at each end, press Build fillet, and read the material the kernel removed.
 *   1. Variable Fillet is no longer grey in the Features tab;
 *   2. the panel lists the body's 12 edges and has the two radius fields;
 *   3. a viewport click picks the edge nearest the pointer (the same picker Boundary Surface uses);
 *   4. two equal radii of 5 mm on the vertical edge at (20, 15) remove (1 − π/4)·5²·20 = 107.30 mm³, so the step
 *      and the part carry 23 892.70 mm³ against 24 000 mm³ — the kernel's numbers;
 *   5. pressing Build fillet with 100 mm at the second end is refused with both radii named and the body unchanged;
 *   6. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21l-varfillet.spec.mjs
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
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(400); };
const setField = async (sel, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(s); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]); await page.waitForTimeout(120); };
const setNum = (k, v) => setField(`#cadProps .pform input[data-k=${k}]`, v);
/* the endpoints the panel prints for an edge, in the order the kernel reports them */
const ends = (sel) => page.evaluate((s) => {
  const li = document.querySelector(s); if (!li) return null;
  const n = (li.textContent.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  return n.length >= 7 ? { a: n.slice(1, 4), b: n.slice(4, 7) } : null;
}, sel);
/* pick the listed edge whose endpoints are the two given points, in either order */
const pickEdge = async (p1, p2) => page.evaluate(([q1, q2]) => {
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-3;
  const hit = [...document.querySelectorAll('#cadProps li[data-var]')].find((li) => {
    const n = (li.textContent.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (n.length < 7) return false;
    const a = n.slice(1, 4), b = n.slice(4, 7);
    return (same(a, q1) && same(b, q2)) || (same(a, q2) && same(b, q1));
  });
  if (!hit) return null;
  hit.click();
  return Number(hit.getAttribute('data-var'));
}, [p1, p2]);
const selectedEdge = () => page.evaluate(() => {
  const li = document.querySelector('#cadProps li[data-var].on');
  if (!li) return null;
  const n = (li.textContent.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  return { index: Number(li.getAttribute('data-var')), a: n.slice(1, 4), b: n.slice(4, 7) };
});

console.log('\nThe ribbon');
await openTab('Features');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Variable Fillet runs now', () => ok(s['Variable Fillet'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nA box, then the panel lists its edges and both radius fields');
await checkAsync('open the tool on a 40 × 30 × 20 box', async () => {
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return !!i && Math.abs(i.vol - 24000) < 1; }, null, { timeout: 120000 });
  await clickTool('Variable Fillet');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-var]').length);
  ok(listed === 12, 'the panel did not list the twelve edges of the box: ' + listed);
  const fields = await page.evaluate(() => ['r1', 'r2'].filter((k) => !!document.querySelector(`#cadProps input[data-k="${k}"]`)));
  ok(fields.length === 2, 'the panel is missing a radius field: ' + JSON.stringify(fields));
});

console.log('\nThe viewport picks the edge nearest the pointer');
await checkAsync('a click on the top edge selects it in the list', async () => {
  const click = async (p) => page.evaluate((q) => {
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const pa = s.viewer.project(q);
    if (!pa) return false;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + pa[0], clientY: r.top + pa[1], button: 0, pointerId: 21 }));
    return true;
  }, p);
  ok(await click([0, -15, 20]), 'the top edge midpoint could not be projected');
  await page.waitForTimeout(300);
  const sel = await selectedEdge();
  ok(sel, 'no edge is selected after the viewport click');
  ok(Math.abs(sel.a[2] - 20) < 1e-3 && Math.abs(sel.b[2] - 20) < 1e-3, 'the click did not select a top edge: ' + JSON.stringify(sel));
});

console.log('\nTwo equal radii of 5 mm take the body from 24 000 to 23 892.70 mm³');
await checkAsync('pick the vertical edge, type 5 and 5, Build fillet, read the kernel volume', async () => {
  const idx = await pickEdge([20, 15, 0], [20, 15, 20]);
  ok(idx != null, 'could not pick the vertical edge at (20, 15) in the list');
  await setField('#cadProps input[data-k="r1"]', 5);
  await setField('#cadProps input[data-k="r2"]', 5);
  await page.evaluate(() => document.querySelector('#cadProps [data-var-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 1, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { type: f.type, vfil: f.vfil || null, err: f.err || null, note: f.note || '', p: f.p }; });
  ok(!st.err, 'the variable fillet step failed: ' + JSON.stringify(st));
  ok(st.type === 'vfillet', 'the step is not a variable fillet: ' + JSON.stringify(st));
  ok(st.p && st.p.edge === idx && st.p.r1 === 5 && st.p.r2 === 5, 'the step did not keep the edge and both radii: ' + JSON.stringify(st.p));
  const removed = (1 - Math.PI / 4) * 25 * 20;
  ok(st.vfil && Math.abs(st.vfil.removed - removed) < 1e-3, `the kernel's removal is not ${removed}: ` + JSON.stringify(st.vfil));
  ok(st.vfil && Math.abs(st.vfil.volAfter - (24000 - removed)) < 1e-3, 'the volume after is not 23 892.70 mm³: ' + JSON.stringify(st.vfil));
  ok(st.vfil && st.vfil.constant === true, 'the step does not record a constant fillet for two equal radii: ' + JSON.stringify(st.vfil));
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.vol - (24000 - removed)) < 1, 'the body is not 23 892.70 mm³: ' + info.vol);
  ok(String(st.note).includes('5.0 mm'), 'the note does not carry the radii: ' + JSON.stringify(st.note));
});

console.log('\nA radius the edge cannot carry is refused');
await checkAsync('100 mm at the second end leaves the body alone and says both radii', async () => {
  await clickTool('Variable Fillet');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const li = document.querySelector('#cadProps li[data-var]'); if (li) li.click(); });
  await setField('#cadProps input[data-k="r1"]', 2);
  await setField('#cadProps input[data-k="r2"]', 100);
  const before = await page.evaluate(() => window.__idris.partInfo().vol);
  await page.evaluate(() => document.querySelector('#cadProps [data-var-go]').click());
  /* the step lands in the tree and is marked failed and skipped — the refusal is the kernel's, shown on the step */
  await page.waitForFunction(() => window.__idris.state.part.features.length > 2, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[2]; return { type: f.type, err: f.err || '', vfil: f.vfil || null }; });
  ok(st.type === 'vfillet', 'the refused step is not a variable fillet: ' + JSON.stringify(st));
  ok(/2\.0 mm/.test(st.err), 'the refusal does not name the first radius: ' + JSON.stringify(st.err));
  ok(/100\.0 mm/.test(st.err), 'the refusal does not name the second radius: ' + JSON.stringify(st.err));
  ok(!st.vfil, 'the refused step carries measurements: ' + JSON.stringify(st.vfil));
  const after = await page.evaluate(() => window.__idris.partInfo().vol);
  ok(Math.abs(after - before) < 1e-6, 'the refused step changed the body: ' + before + ' → ' + after);
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
