/* S21j: Delete Face in the real page (Batch 6).
 *
 * The engineer's flow: a 40 × 30 × 20 box, then Surface → Delete Face: the panel lists the body's faces, a click in
 * the viewport picks the face under the pointer, and Delete removes it and closes the opening.
 *   1. Delete Face is no longer grey in the Surface tab;
 *   2. the panel lists the six faces of the box;
 *   3. a viewport click picks the top face under the pointer (the list selection moves to that face);
 *   4. the step that is built is a Delete Face step with the kernel's measurements — 1 200 mm² removed, 1 200 mm²
 *      patched, 24 000 mm³ before and after — and the body in the part is 24 000 mm³ again;
 *   5. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html node tests/s21j-delface.spec.mjs
 */
import { chromium } from '/tmp/pw/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const CHROME = process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');
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
  check('Delete Face runs now', () => ok(s['Delete Face'] === false, 'still grey: ' + JSON.stringify(s['Delete Face'])));
}

console.log('\nA box, the top face picked in the viewport, deleted and patched');
await checkAsync('delete the top face: 1 200 mm² removed, the opening patched, the body 24 000 mm³ again', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await build(1);
  await waitVol(24000, 1);

  await openTab('Surface');
  await clickTool('Delete Face');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-del]').length);
  ok(listed === 6, 'the panel did not list the six faces of the box: ' + listed);

  const picked = await page.evaluate(() => {
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const p = s.viewer.project([0, 0, 20]);
    if (!p) return { ok: false, why: 'not visible' };
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + p[0], clientY: r.top + p[1], button: 0, pointerId: 9 }));
    return { ok: true };
  });
  ok(picked.ok, 'the top face centre could not be projected: ' + JSON.stringify(picked));
  await page.waitForTimeout(300);
  const sel = await page.evaluate(() => { const li = document.querySelector('#cadProps li[data-del].on'); return li ? li.textContent.trim() : ''; });
  ok(/^6\./.test(sel), 'the viewport click did not pick the top face: ' + JSON.stringify(sel));

  await page.evaluate(() => document.querySelector('#cadProps [data-del-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 1, null, { timeout: 120000 });
  await page.waitForFunction(() => !window.__idris.busy, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { type: f.type, err: f.err || null, note: f.note || '', del: f.del || null, face: f.p && f.p.face }; });
  const digits = String(st.note).replace(/[^0-9.]/g, '');
  ok(!st.err, 'the delete step failed: ' + JSON.stringify(st));
  ok(st.type === 'delface', 'the step is not a Delete Face step: ' + JSON.stringify(st));
  ok(st.face === 5, 'the step did not keep the picked face: ' + JSON.stringify(st.face));
  ok(st.del && Math.abs(st.del.areaRemoved - 1200) < 1e-6, 'the removed area is not 1 200 mm²: ' + JSON.stringify(st.del));
  ok(st.del && Math.abs(st.del.areaPatch - 1200) < 1e-6, 'the patch area is not 1 200 mm²: ' + JSON.stringify(st.del));
  ok(st.del && Math.abs(st.del.volAfter - 24000) < 1e-3, 'the healed volume is not 24 000 mm³: ' + JSON.stringify(st.del));
  ok(digits.includes('1200'), 'the note does not carry the measured area: ' + JSON.stringify(st.note));
  ok(digits.includes('24.000'), 'the note does not carry the volume in cm³: ' + JSON.stringify(st.note));

  const vol = await page.evaluate(() => { const i = window.__idris.partInfo(); return i && i.vol; });
  ok(typeof vol === 'number' && Math.abs(vol - 24000) < 1, 'the body in the part is not 24 000 mm³ after the delete: ' + vol);
});

console.log('\nNo page error anywhere in the flow');
check('zero page errors', () => ok(errors.length === 0, errors.slice(0, 3).join(' | ')));

console.log(`\n${pass} passed, ${fails.length} failed`);
await browser.close();
if (fails.length) process.exit(1);
