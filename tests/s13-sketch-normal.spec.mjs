/* S13: a sketch is entered Normal To its plane.
 *
 * Drives the real page and a real mouse:
 *   1. opening Line on XY / XZ / YZ turns the camera to that plane's normal, orthographic, with the plane grid;
 *   2. two clicks 160 px apart horizontally give two points with the same v;
 *   3. four clicks of a rectangle give sides parallel to the plane axes (±0.5 mm);
 *   4. extrude 10 gives volume = plane width × height × 10 from the entity coordinates;
 *   5. orbiting > 30° raises the "Viewing at an angle" hint;
 *   6. Save / Cancel put the camera back and leave orthographic mode.
 *
 *   BASE_URL=http://127.0.0.1:3013/index.html node tests/s13-sketch-normal.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3013/index.html';
const OUT = process.env.OUT || 'docs';
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} != ${b} (±${tol})`); };
const ok = (c, what) => { if (!c) throw new Error(what); };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
const TOUCH = process.env.TOUCH === '1';
const TAG = process.env.TAG || '1366';
const page = await browser.newPage({ viewport: VP, hasTouch: TOUCH });
const click = async (x, y) => TOUCH ? page.touchscreen.tap(x, y) : page.mouse.click(x, y);
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); });
const fresh = async () => {
  await page.evaluate(() => { window.__idris.state.part = null; window.__idris.tools.startPart(); });
  await page.waitForTimeout(250);
};
await fresh();

const cam = () => page.evaluate(() => ({ yaw: window.__idris.viewer.yaw, pitch: window.__idris.viewer.pitch, ortho: !!window.__idris.viewer.ortho, saved: !!window.__idris.viewer.planeGrid }));
const mmPerPx = async () => page.evaluate(() => {
  const v = window.__idris.viewer, el = document.querySelector('#cv');
  return 2 * Math.tan(v.fov / 2) * v.dist / Math.max(1, el.clientHeight);
});
const canvasBox = async () => (await page.locator('#cv').boundingBox());
/** a point on the canvas that is not covered by a panel, with `need` px of canvas to its right */
async function freeSpot(need) {
  const b = await canvasBox();
  for (const fx of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35]) for (const fy of [0.4, 0.45, 0.35, 0.5]) {
    const x = b.x + b.width * fx, y = b.y + b.height * fy;
    if (x + need > b.x + b.width - 8) continue;
    const free = await page.evaluate(([a, c]) => { const e = document.elementFromPoint(a, c); return !!e && e.id === 'cv'; }, [x, y]);
    const free2 = await page.evaluate(([a, c]) => { const e = document.elementFromPoint(a, c); return !!e && e.id === 'cv'; }, [x + need, y]);
    if (free && free2) return [x, y];
  }
  return [b.x + b.width * 0.5, b.y + b.height * 0.4];
}

/** open a sketch session on a plane and wait for the camera to settle */
async function openPlane(plane) {
  await page.evaluate((pl) => {
    window.__idris.tools.openSketchSession('line', null);
    const a = window.__idris.tools.skSession();
    a.p.plane = pl;
    window.__idris.tools.sketchView(pl);
  }, plane);
  await page.waitForTimeout(600);
  /* a tablet opens with the chat drawer over the canvas (this test skips the home screen); close it like a user
   * would with the AI toggle, so the plane is visible to draw on */
  const covered = await page.evaluate(() => { if (!document.body.classList.contains('chat-open')) return false;
    const c = document.querySelector('#cv').getBoundingClientRect(), e = document.elementFromPoint(c.x + c.width * 0.6, c.y + c.height * 0.35);
    return !!e && !!e.closest('#chat'); });
  if (covered) { await page.evaluate(() => document.querySelector('#cAi').click()); await page.waitForTimeout(450); }
  return cam();
}
const ents = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__idris.tools.skSession().p.ents || [])));

for (const plane of ['XY', 'XZ', 'YZ']) {
  console.log('\n' + plane);
  const c = await openPlane(plane);
  const want = { XY: [0, Math.PI / 2], XZ: [0, 0], YZ: [Math.PI / 2, 0] }[plane];
  check(`${plane}: camera is Normal To`, () => { near(c.yaw, want[0], 0.02, 'yaw'); near(c.pitch, want[1], 0.02, 'pitch'); });
  check(`${plane}: sketch view is orthographic with a plane grid`, () => { ok(c.ortho, 'not orthographic'); ok(c.saved, 'no plane grid'); });

  const mm = await mmPerPx(), [cx, cy] = await freeSpot(160);
  await click(cx, cy);
  await click(cx + 160, cy);
  await page.waitForTimeout(120);
  const line = (await ents())[0];
  check(`${plane}: two points 160 px apart share the same v`, () => {
    ok(line && line.t === 'line', 'no line was created');
    near(line.a[1], line.b[1], 0.5, 'v of the two points');
    near(Math.abs(line.b[0] - line.a[0]), 160 * mm, Math.max(1.5, 160 * mm * 0.04), 'length');
  });
  await page.keyboard.press('Escape');   /* end the chain */
  await page.evaluate(() => window.__idris.tools.skCancel());
  await page.waitForTimeout(500);

  /* rectangle: four corners and back to the first point */
  const c2 = await openPlane(plane);
  ok(c2.ortho, 'ortho lost after reopen');
  const w = 220, h = 130, [x0, y0] = await freeSpot(w);
  for (const [dx, dy] of [[0, 0], [w, 0], [w, h], [0, h], [0, 0]]) await click(x0 + dx, y0 + dy);
  await page.waitForTimeout(200);
  const box = await ents();
  check(`${plane}: four clicks make a closed four-line rectangle`, () => ok(box.length === 4, `got ${box.length} entities`));
  check(`${plane}: every side is parallel to a plane axis (±0.5 mm)`, () => {
    for (const e of box) { const dx = Math.abs(e.b[0] - e.a[0]), dy = Math.abs(e.b[1] - e.a[1]); ok(Math.min(dx, dy) <= 0.5, `side ${dx.toFixed(2)} × ${dy.toFixed(2)} is not axis-aligned`); }
  });
  if (plane === 'XY') await page.screenshot({ path: `${OUT}/s13-normal-view-${TAG}.png` });
  const us = box.flatMap((e) => [e.a[0], e.b[0]]), vs = box.flatMap((e) => [e.a[1], e.b[1]]);
  const W = Math.max(...us) - Math.min(...us), H = Math.max(...vs) - Math.min(...vs);
  check(`${plane}: the rectangle is ${W.toFixed(1)} × ${H.toFixed(1)} mm on the plane`, () => { ok(W > 5 && H > 3, 'rectangle too small'); near(W / H, w / h, 0.25, 'aspect'); });

  await page.evaluate(() => window.__idris.tools.skSave());
  await page.waitForTimeout(500);
  const back = await cam();
  check(`${plane}: Save returns the camera and leaves orthographic`, () => { near(back.yaw, 0.62, 0.05, 'yaw'); near(back.pitch, 0.42, 0.05, 'pitch'); ok(!back.ortho, 'still orthographic'); });

  /* Extrude 10 through the form, then read the kernel volume */
  await page.evaluate(() => window.__idris.tools.partTool('push'));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const inp = document.querySelector('#cadProps .pform input[data-k="depth"]');
    if (inp) { inp.value = '10'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const go = [...document.querySelectorAll('#cadProps .pact button')].find((b) => /Add & build|Tambah & bangun/.test(b.textContent));
    if (go) go.click();
  });
  await page.waitForFunction(() => { const p = window.__idris.partInfo(); return p && p.vol > 0; }, null, { timeout: 120000 });
  const vol = await page.evaluate(() => window.__idris.partInfo().vol);
  check(`${plane}: extrude 10 = ${(W * H * 10).toFixed(0)} mm³ from the entity coordinates`, () => near(vol, W * H * 10, W * H * 10 * 0.03, 'volume'));
  await page.evaluate(() => { window.__idris.state.part = null; window.__idris.tools.startPart(); });
  await page.waitForTimeout(250);
}

/* the angle hint, and Cancel restoring the view */
console.log('\nAngle hint');
await fresh();
await openPlane('XY');
await page.evaluate(() => { const v = window.__idris.viewer; v.anim = null; v.yaw += 0.62; v.pitch = 0.35; v.dirty = true; v._draw(); });
await page.waitForTimeout(300);
const hint = await page.evaluate(() => { const el = document.getElementById('skAngle'); return el && !el.hidden ? el.textContent : ''; });
check('orbiting more than 30° shows "points land on the sketch plane"', () => ok(/Viewing at an angle: points land on the sketch plane/.test(hint), `hint: "${hint}"`));
await page.evaluate(() => { const v = window.__idris.viewer; v.yaw = 0; v.pitch = 1.55; v.dirty = true; v._draw(); });
await page.waitForTimeout(250);
const hintGone = await page.evaluate(() => document.getElementById('skAngle').hidden);
check('the hint goes away when back on the normal', () => ok(hintGone, 'still visible'));
await page.screenshot({ path: `${OUT}/s13-angle-hint-${TAG}.png` });
const nb = await page.evaluate(() => { const b = document.getElementById('bNormal'); return b ? { found: true, disabled: b.disabled, title: b.title } : { found: false }; });
check('the view bar has a Normal To button', () => ok(nb.found && /Normal To/.test(nb.title), JSON.stringify(nb)));
await page.evaluate(() => window.__idris.tools.skCancel());
await page.waitForTimeout(500);
const after = await cam();
check('Cancel returns the camera and leaves the sketch view', () => { near(after.yaw, 0.62, 0.05, 'yaw'); ok(!after.ortho && !after.saved, 'sketch view still on'); });

console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 8).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
