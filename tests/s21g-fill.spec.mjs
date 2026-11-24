/* S21g: Filled Surface in the real page (Batch 6).
 *
 * The engineer's flow: build a box, open Surface → Filled Surface, pick the boundary edges (a click in the viewport
 * and ticks in the panel), press Build, and read the area the kernel measured.
 *   1. Filled Surface is no longer grey in the Surface tab;
 *   2. a click near a projected edge in the viewport picks that edge (the count goes up);
 *   3. ticking the four top edges of a 40 × 30 × 20 box and pressing Build makes one surface step whose measured
 *      area is 1 200 mm², and the note carries that number;
 *   4. pressing Build with one edge refuses and says how many are selected;
 *   5. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21g-fill.spec.mjs
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
const setNum = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform input[data-k=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(120); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });

console.log('\nThe ribbon');
await openTab('Surface');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Filled Surface runs now', () => ok(s['Filled Surface'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nA click in the viewport picks an edge, four edges fill to 1 200 mm²');
await checkAsync('build a box, pick edges, build the patch', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await waitVol(24000, 1);

  await openTab('Surface');
  await clickTool('Filled Surface');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-fill]').length);
  ok(listed >= 12, 'the panel did not list the body edges: ' + listed);

  /* the viewport pick: project an edge's end points through the app's own viewer, then press the canvas
     halfway between them — that is the click an engineer makes on the model */
  const clicked = await page.evaluate(async () => {
    /* project two points of the edge through the app's own viewer and click between them */
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const sel = () => (document.querySelector('#cadProps h3') || {}).textContent || '';
    const li = document.querySelector('#cadProps li[data-fill]');
    const txt = li.textContent;
    const nums = txt.match(/-?\d+(\.\d+)?/g) || [];
    /* label form: "1. LINE(-20.0, -15.0, 20.0) → (20.0, -15.0, 20.0)" — numbers 1 then 6 coordinates */
    const a = nums.slice(1, 4).map(Number), b = nums.slice(4, 7).map(Number);
    const pa = s.viewer.project(a), pb = s.viewer.project(b);
    if (!pa || !pb) return { ok: false, why: 'not visible' };
    const x = r.left + (pa[0] + pb[0]) / 2, y = r.top + (pa[1] + pb[1]) / 2;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7 }));
    return { ok: true };
  });
  ok(clicked.ok, 'the edge could not be projected: ' + JSON.stringify(clicked));
  await page.waitForTimeout(300);
  const afterPick = await page.evaluate(() => (document.querySelector('#cadProps h3') || {}).textContent || '');
  ok(/\(1\)/.test(afterPick), 'the viewport click did not pick an edge: ' + JSON.stringify(afterPick));

  /* now tick the four top edges (both ends at z = 20) and build */
  await page.evaluate(() => {
    const on = [...document.querySelectorAll('#cadProps li[data-fill]')].filter((li) => li.classList.contains('on'));
    on.forEach((li) => li.click());
  });
  await page.waitForTimeout(200);
  const ticked = await page.evaluate(() => {
    const want = [...document.querySelectorAll('#cadProps li[data-fill]')].filter((li) => {
      const n = li.textContent.match(/-?\d+(\.\d+)?/g) || [];
      return n.length >= 7 && Math.abs(Number(n[3]) - 20) < 1e-6 && Math.abs(Number(n[6]) - 20) < 1e-6;
    });
    want.forEach((li) => { if (!li.classList.contains('on')) li.click(); });
    return want.length;
  });
  ok(ticked === 4, 'could not find the four top edges in the panel: ' + ticked);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#cadProps [data-fill-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 1, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { type: f.type, area: f.surf && f.surf.area, err: f.err || null, note: f.note || '', edges: (f.p && f.p.edges) || [] }; });
  ok(!st.err, 'the fill step failed: ' + JSON.stringify(st));
  ok(st.type === 'surffill', 'the step is not a filled surface: ' + JSON.stringify(st));
  ok(Math.abs(st.area - 1200) < 1e-6, 'the measured area is not 1 200 mm²: ' + st.area);
  ok(/1200|1 200/.test(String(st.note).replace(/[^0-9.]/g, '')), 'the note does not carry the area: ' + JSON.stringify(st.note));
});

console.log('\nBuild with fewer than two edges refuses');
await checkAsync('one edge is refused with the count', async () => {
  await openTab('Surface');
  await clickTool('Filled Surface');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const li = document.querySelector('#cadProps li[data-fill]'); if (li) li.click(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#cadProps [data-fill-go]').click());
  await page.waitForTimeout(300);
  const note = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/at least two/i.test(note), 'no refusal: ' + JSON.stringify(note));
  ok(/1 selected/.test(note), 'the refusal does not carry the count: ' + JSON.stringify(note));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
