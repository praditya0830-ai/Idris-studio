/* S21k: Boundary Boss/Base in the real page (Batch 6).
 *
 * The engineer's flow: a box, then Features → Boundary Boss/Base: pick the direction, tick the curves, type the
 * thickness, press Build boss, and read the volume the kernel added.
 *   1. Boundary Boss/Base is no longer grey in the Features tab;
 *   2. the panel lists the body's edges and has a thickness field;
 *   3. the four top edges of a 40 × 30 × 20 box bound a 1 200 mm² patch, and 3 mm takes the body from 24 000 to
 *      27 600 mm³ — the step and the part carry the kernel's numbers;
 *   4. a viewport click puts the nearest curve into the direction the panel is set to;
 *   5. pressing Build boss with one curve in the first direction refuses and says how many are selected;
 *   6. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21k-boundboss.spec.mjs
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
const dir = async (d) => { await page.selectOption('#cadProps select[data-k="dir"]', d); await page.waitForTimeout(250); };
const counts = () => page.evaluate(() => { const t = (document.querySelector('#cadProps h3') || {}).textContent || ''; const n = t.match(/\((\d+)\)/g) || []; return { text: t.trim(), u: Number((n[0] || '(0)').replace(/[^0-9]/g, '')), v: Number((n[1] || '(0)').replace(/[^0-9]/g, '')) }; });
/* the edges of the box whose two end points both sit on z = 20 and whose span is `len` */
const tickTop = (len) => page.evaluate((want) => {
  const num = (li) => (li.textContent.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const pick = [...document.querySelectorAll('#cadProps li[data-bound]')].filter((li) => {
    const n = num(li); if (n.length < 7) return false;
    const a = n.slice(1, 4), b = n.slice(4, 7);
    if (Math.abs(a[2] - 20) > 1e-6 || Math.abs(b[2] - 20) > 1e-6) return false;
    return Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) - want) < 0.01;
  });
  pick.forEach((li) => { if (!li.classList.contains('on')) li.click(); });
  return pick.length;
}, len);

console.log('\nThe ribbon');
await openTab('Features');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Boundary Boss/Base runs now', () => ok(s['Boundary Boss/Base'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nFour curves in two directions and 3 mm thickness take the box to 27 600 mm³');
await checkAsync('tick both directions, type the thickness, Build boss, read the kernel volumes', async () => {
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return !!i && Math.abs(i.vol - 24000) < 1; }, null, { timeout: 120000 });

  await clickTool('Boundary Boss/Base');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-bound]').length);
  ok(listed >= 12, 'the panel did not list the body edges: ' + listed);
  const hasT = await page.evaluate(() => !!document.querySelector('#cadProps input[data-k="t"]'));
  ok(hasT, 'the panel has no thickness field');

  await dir('u');
  ok(await tickTop(40) === 2, 'could not tick the two long top edges');
  await dir('v');
  ok(await tickTop(30) === 2, 'could not tick the two short top edges');
  const c = await counts();
  ok(c.u === 2 && c.v === 2, 'the panel does not show two curves in each direction: ' + JSON.stringify(c));

  await setField('#cadProps input[data-k="t"]', 3);
  await page.evaluate(() => document.querySelector('#cadProps [data-bound-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 1, null, { timeout: 120000 });
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { type: f.type, bound: f.bound || null, err: f.err || null, note: f.note || '', u: f.p && f.p.u, v: f.p && f.p.v, t: f.p && f.p.t }; });
  ok(!st.err, 'the boundary boss step failed: ' + JSON.stringify(st));
  ok(st.type === 'boundboss', 'the step is not a boundary boss: ' + JSON.stringify(st));
  ok(st.u.length === 2 && st.v.length === 2, 'the step did not keep both directions: ' + JSON.stringify(st));
  ok(st.t === 3, 'the step did not keep the thickness: ' + JSON.stringify(st));
  ok(st.bound && Math.abs(st.bound.uArea - 1200) < 1e-6, 'the measured patch area is not 1 200 mm²: ' + JSON.stringify(st.bound));
  ok(st.bound && Math.abs(st.bound.added - 3600) < 1e-3, 'the measured added volume is not 3 600 mm³: ' + JSON.stringify(st.bound));
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(Math.abs(info.vol - 27600) < 1, 'the body is not 27 600 mm³: ' + info.vol);
  const digits = String(st.note).replace(/[^0-9.]/g, '');
  ok(digits.includes('1200'), 'the note does not carry the patch area: ' + JSON.stringify(st.note));
  ok(String(st.note).includes('27.6'), 'the note does not carry the body volume: ' + JSON.stringify(st.note));
});

console.log('\nThe viewport pick follows the direction switch');
await checkAsync('a click adds the nearest curve to the open direction', async () => {
  await clickTool('Boundary Boss/Base');
  await page.waitForTimeout(300);
  await dir('u');
  const pick = async (a, b) => page.evaluate(([p1, p2]) => {
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const pa = s.viewer.project(p1), pb = s.viewer.project(p2);
    if (!pa || !pb) return false;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + (pa[0] + pb[0]) / 2, clientY: r.top + (pa[1] + pb[1]) / 2, button: 0, pointerId: 11 }));
    return true;
  }, [a, b]);
  /* the bossed box is 23 mm tall now: the top face sits at z = 23 */
  ok(await pick([-20, -15, 23], [20, -15, 23]), 'the long top edge could not be projected');
  await page.waitForTimeout(300);
  let c = await counts();
  ok(c.u === 1 && c.v === 0, 'the click did not land in direction 1: ' + JSON.stringify(c));
  await dir('v');
  ok(await pick([-20, -15, 23], [-20, 15, 23]), 'the short top edge could not be projected');
  await page.waitForTimeout(300);
  c = await counts();
  ok(c.u === 1 && c.v === 1, 'the click did not land in direction 2: ' + JSON.stringify(c));
});

console.log('\nBuild boss with one curve in the first direction refuses');
await checkAsync('one curve is refused with the count', async () => {
  await page.evaluate(() => [...document.querySelectorAll('#cadProps li[data-bound].on')]
    .filter((li) => /· 2$/.test(li.querySelector('b').textContent.trim())).forEach((li) => li.click()));
  await page.waitForTimeout(250);
  const c = await counts();
  ok(c.u === 1 && c.v === 0, 'the setup did not leave one curve in direction 1: ' + JSON.stringify(c));
  await page.evaluate(() => document.querySelector('#cadProps [data-bound-go]').click());
  await page.waitForTimeout(400);
  const note = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/at least two curves in the first direction/i.test(note), 'no refusal: ' + JSON.stringify(note));
  ok(/1 selected/.test(note), 'the refusal does not carry the count: ' + JSON.stringify(note));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
