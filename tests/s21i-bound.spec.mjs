/* S21i: Boundary Surface in the real page (Batch 6).
 *
 * The engineer's flow: a box, then Surface → Boundary Surface: pick the direction, click a curve in the viewport,
 * tick the rest in the panel, press Build, and read the area the kernel measured.
 *   1. Boundary Surface is no longer grey in the Surface tab;
 *   2. the panel lists the body's edges;
 *   3. two long top edges and two short top edges of a 40 × 30 × 20 box bound a 1 200 mm² patch, and the note carries
 *      that number as well as the second direction's own measurement;
 *   4. a viewport click adds the nearest curve to the direction the panel is set to, and switching direction moves the
 *      next click into the other set;
 *   5. pressing Build with one curve in the first direction refuses and says how many are selected;
 *   6. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21i-bound.spec.mjs
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
const dir = async (d) => { await page.selectOption('#cadProps select[data-k="dir"]', d); await page.waitForTimeout(250); };
const counts = () => page.evaluate(() => { const t = (document.querySelector('#cadProps h3') || {}).textContent || ''; const n = t.match(/\((\d+)\)/g) || []; return { text: t.trim(), u: Number((n[0] || '(0)').replace(/[^0-9]/g, '')), v: Number((n[1] || '(0)').replace(/[^0-9]/g, '')) }; });
/* the edges of the box whose two end points both sit on z = 20 and whose span along one axis is `len` */
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
await openTab('Surface');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Boundary Surface runs now', () => ok(s['Boundary Surface'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nTwo directions of curves on a box bound a 1 200 mm² patch');
await checkAsync('tick both directions, Build, read the kernel area', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setNum('L', 40); await setNum('W', 30); await setNum('H', 20);
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
  await page.waitForFunction(() => { const i = window.__idris.partInfo(); return !!i && Math.abs(i.vol - 24000) < 1; }, null, { timeout: 120000 });

  await openTab('Surface');
  await clickTool('Boundary Surface');
  const listed = await page.evaluate(() => document.querySelectorAll('#cadProps li[data-bound]').length);
  ok(listed >= 12, 'the panel did not list the body edges: ' + listed);

  await dir('u');
  ok(await tickTop(40) === 2, 'could not tick the two long top edges');
  await dir('v');
  ok(await tickTop(30) === 2, 'could not tick the two short top edges');
  const c = await counts();
  ok(c.u === 2 && c.v === 2, 'the panel does not show two curves in each direction: ' + JSON.stringify(c));

  await page.evaluate(() => document.querySelector('#cadProps [data-bound-go]').click());
  await page.waitForFunction(() => window.__idris.state.part.features.length > 1, null, { timeout: 120000 });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[1]; return { type: f.type, area: f.surf && f.surf.area, err: f.err || null, note: f.note || '', u: f.p && f.p.u, v: f.p && f.p.v }; });
  const digits = String(st.note).replace(/[^0-9.]/g, '');
  ok(!st.err, 'the boundary step failed: ' + JSON.stringify(st));
  ok(st.type === 'surfbound', 'the step is not a boundary surface: ' + JSON.stringify(st));
  ok(st.u.length === 2 && st.v.length === 2, 'the step did not keep both directions: ' + JSON.stringify(st));
  ok(Math.abs(st.area - 1200) < 1e-6, 'the measured area is not 1 200 mm²: ' + st.area);
  ok(digits.includes('1200'), 'the note does not carry the area: ' + JSON.stringify(st.note));
});

console.log('\nThe viewport pick follows the direction switch');
await checkAsync('a click adds the nearest curve to the open direction', async () => {
  await openTab('Surface');
  await clickTool('Boundary Surface');
  await page.waitForTimeout(300);
  await dir('u');
  const pick = async (a, b) => page.evaluate(([p1, p2]) => {
    const s = window.__idris, cv = document.querySelector('#cv'), r = cv.getBoundingClientRect();
    const pa = s.viewer.project(p1), pb = s.viewer.project(p2);
    if (!pa || !pb) return false;
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + (pa[0] + pb[0]) / 2, clientY: r.top + (pa[1] + pb[1]) / 2, button: 0, pointerId: 11 }));
    return true;
  }, [a, b]);
  ok(await pick([-20, -15, 20], [20, -15, 20]), 'the long bottom-side top edge could not be projected');
  await page.waitForTimeout(300);
  let c = await counts();
  ok(c.u === 1 && c.v === 0, 'the click did not land in direction 1: ' + JSON.stringify(c));
  const marked = await page.evaluate(() => [...document.querySelectorAll('#cadProps li[data-bound].on')].map((li) => li.querySelector('b').textContent.trim()));
  ok(marked.length === 1 && /· 1$/.test(marked[0]), 'the picked curve is not marked as direction 1: ' + JSON.stringify(marked));

  await dir('v');
  ok(await pick([-20, -15, 20], [-20, 15, 20]), 'the short top edge could not be projected');
  await page.waitForTimeout(300);
  c = await counts();
  ok(c.u === 1 && c.v === 1, 'the click did not land in direction 2: ' + JSON.stringify(c));
  const two = await page.evaluate(() => [...document.querySelectorAll('#cadProps li[data-bound].on')].map((li) => li.querySelector('b').textContent.trim()));
  ok(two.length === 2 && two.some((t) => /· 1$/.test(t)) && two.some((t) => /· 2$/.test(t)), 'the two directions are not marked apart: ' + JSON.stringify(two));
});

console.log('\nBuild with one curve in the first direction refuses');
await checkAsync('one curve is refused with the count', async () => {
  /* leave the curve of the previous test in direction 1 and drop the one in direction 2 */
  await page.evaluate(() => [...document.querySelectorAll('#cadProps li[data-bound].on')]
    .filter((li) => /\u00b7 2$/.test(li.querySelector('b').textContent.trim())).forEach((li) => li.click()));
  await page.waitForTimeout(250);
  const c = await counts();
  ok(c.u === 1 && c.v === 0, 'the setup did not leave one curve in direction 1: ' + JSON.stringify(c));
  await page.evaluate(() => document.querySelector('#cadProps [data-bound-go]').click());
  await page.waitForTimeout(300);
  const note = await page.evaluate(() => { const w = document.querySelector('#cadProps .warnbox'); return w ? w.textContent : ''; });
  ok(/at least two curves in the first direction/i.test(note), 'no refusal: ' + JSON.stringify(note));
  ok(/1 selected/.test(note), 'the refusal does not carry the count: ' + JSON.stringify(note));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
