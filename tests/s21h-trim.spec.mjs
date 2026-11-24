/* S21h: Trim Surface in the real page (Batch 6).
 *
 * The engineer's flow: a box, a big planar surface over it, then Surface → Trim Surface: click the face in the viewport
 * whose plane should cut, press Trim, and read the kept area the kernel measured.
 *   1. Trim Surface is no longer grey in the Surface tab;
 *   2. the panel lists the body's planar faces;
 *   3. a click in the viewport picks the face under the pointer (the list selection moves to that face);
 *   4. trimming by the +X face of a 40 × 30 × 20 box keeps 12 800 mm² of the 32 000 mm² surface, and the note carries
 *      both numbers;
 *   5. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21h-trim.spec.mjs
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
const build = async (n) => { await page.waitForFunction(() => { const b = document.querySelector('#cadProps .pact .chip.primary'); return !!b && !b.disabled; }, null, { timeout: 60000 }); await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click()); await page.waitForTimeout(500); await page.waitForFunction((x) => window.__idris.state.part.features.length >= x && !window.__idris.busy, n, { timeout: 120000 }); await page.waitForTimeout(500); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });

console.log('\nThe ribbon');
await openTab('Surface');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Trim Surface runs now', () => ok(s['Trim Surface'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nA box, a 200 x 160 surface over it, trimmed by the face picked in the viewport');
await checkAsync('pick the +X face in the viewport and trim: 12 800 mm² kept of 32 000', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await build(1);
  await waitVol(24000, 1);

  await openTab('Sketch');
  await clickTool('Sketch');
  await setNum('W', 200); await setNum('Hh', 160);
  await build(2);

  await openTab('Surface');
  await clickTool('Planar Surface');
  await build(3);
  const planeArea = await page.evaluate(() => { const f = window.__idris.state.part.features[2]; return { err: f.err || null, area: f.surf && f.surf.area }; });
  ok(!planeArea.err, 'the planar surface failed: ' + JSON.stringify(planeArea));
  ok(Math.abs(planeArea.area - 32000) < 1e-6, 'the surface is not 32 000 mm²: ' + JSON.stringify(planeArea));

  await openTab('Surface');
  await clickTool('Trim Surface');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-trim]').length);
  ok(listed === 6, 'the panel did not list the six planar faces of the box: ' + listed);

  /* the pick: press the canvas on the projected centre of face index 1 (the +X face) */
  const picked = await page.evaluate(() => {
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const p = s.viewer.project([20, 0, 10]);
    if (!p) return { ok: false, why: 'not visible' };
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + p[0], clientY: r.top + p[1], button: 0, pointerId: 9 }));
    return { ok: true };
  });
  ok(picked.ok, 'the face centre could not be projected: ' + JSON.stringify(picked));
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => { const li = document.querySelector('#cadProps li[data-trim].on'); return li ? li.textContent.trim() : ''; });
  ok(/^2\./.test(sel), 'the viewport click did not pick the +X face: ' + JSON.stringify(sel));

  await page.evaluate(() => document.querySelector('#cadProps [data-trim-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 3, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[3]; return { type: f.type, area: f.surf && f.surf.area, err: f.err || null, note: f.note || '', face: f.p && f.p.face, keep: f.p && f.p.keep }; });
  const digits = String(st.note).replace(/[^0-9.]/g, '');
  ok(!st.err, 'the trim step failed: ' + JSON.stringify(st));
  ok(st.type === 'surftrim', 'the step is not a trim: ' + JSON.stringify(st));
  ok(st.face === 1 && st.keep === 'positive', 'the step did not keep the picked face and side: ' + JSON.stringify(st));
  ok(Math.abs(st.area - 12800) < 1e-6, 'the kept area is not 12 800 mm²: ' + st.area);
  ok(digits.includes('12800'), 'the note does not carry the kept area: ' + JSON.stringify(st.note));
  ok(digits.includes('32000'), 'the note does not carry the area before the cut: ' + JSON.stringify(st.note));
});

console.log('\nNo page error anywhere in the flow');
check('zero page errors', () => ok(errors.length === 0, errors.slice(0, 3).join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
