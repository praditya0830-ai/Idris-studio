/* S21e: Parameters and Configurations in the real page (Batch 5).
 *
 * The engineer's flow: build a box, name a size in Manage → Parameters, type that name into the box's L field, then
 * change the number and watch the part rebuild.
 *   1. Parameters and Configurations are no longer grey in the Manage tab;
 *   2. a parameter L = 40 drives the box's L field, and the part builds at 24 000 mm³ (was 40 × 30 × 20);
 *   3. changing L to 50 rebuilds the same tree at 30 000 mm³ — the step was never baked;
 *   4. a configuration that overrides L to 60 builds at 36 000 mm³, and switching back to Default is 30 000 again;
 *   5. a field naming an undefined parameter is refused by that step, with the name, and the part does not build;
 *   6. no page error at any point.
 *
 *   BASE_URL=http://127.0.0.1:3051/index.html VP='{"width":1366,"height":768}' node tests/s21e-params.spec.mjs
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
const clickTool = async (n) => { const done = await page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (!b) return false; b.click(); return true; }, n); ok(done, 'no ribbon tool named ' + n); await page.waitForTimeout(350); };
const waitVol = (want, tol) => page.waitForFunction(([w, t]) => { const i = window.__idris.partInfo(); return !!i && typeof i.vol === 'number' && Math.abs(i.vol - w) <= t; }, [want, tol], { timeout: 120000 });
const setPform = async (k, v) => { await page.evaluate(([s, val]) => { const el = document.querySelector(`#cadProps .pform input[data-k=${s}]`); el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); }, [k, v]); await page.waitForTimeout(120); };
/* a parameter field: input then change, because the change is what saves and rebuilds */
const setPR = async (kind, name, v) => {
  const done = await page.evaluate(([kd, pn, val]) => { const el = document.querySelector(`#cadProps [data-pr=${kd}][data-pn=${pn}]`); if (!el) return false; el.value = String(val); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [kind, name, v]);
  ok(done, `no parameter field ${kind}/${name}`);
  await page.waitForTimeout(400);
};
/* the rebuild is asynchronous: press the form's button once it is out of its busy state */
const clickPrimary = async () => {
  await page.waitForFunction(() => { const b = document.querySelector('#cadProps .pact .chip.primary'); return !!b && !b.disabled; }, null, { timeout: 60000 });
  await page.evaluate(() => document.querySelector('#cadProps .pact .chip.primary').click());
};
const pressPR = async (kind) => { const done = await page.evaluate((kd) => { const b = document.querySelector(`#cadProps [data-pr=${kd}]`); if (!b) return false; b.click(); return true; }, kind); ok(done, 'no button ' + kind); await page.waitForTimeout(300); };

console.log('\nThe ribbon');
await openTab('Manage');
{
  const s = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#xrib .xr-t')].map((b) => [b.textContent.trim(), b.getAttribute('aria-disabled') === 'true'])));
  check('Parameters runs now', () => ok(s['Parameters'] === false, 'still grey: ' + JSON.stringify(s)));
  check('Configurations runs now', () => ok(s['Configurations'] === false, 'still grey: ' + JSON.stringify(s)));
}

console.log('\nA parameter drives a step, and changing it rebuilds');
await checkAsync('L = 40 → 24 000, L = 50 → 30 000, config Big (L = 60) → 36 000', async () => {
  await openTab('Features');
  await clickTool('Box');
  await setPform('L', 40); await setPform('W', 30); await setPform('H', 20);
  await clickPrimary();
  await waitVol(24000, 1);

  await openTab('Manage');
  await clickTool('Parameters');
  await page.waitForTimeout(300);
  await pressPR('add');
  await setPR('name', 'P1', 'L');
  await setPR('val', 'L', 40);
  const table = await page.evaluate(() => (window.__idris.state.part.params || {}));
  ok(Object.prototype.hasOwnProperty.call(table, 'L'), 'the parameter L is not in the part: ' + JSON.stringify(table));

  /* type the name into the Box's L field and rebuild */
  await page.evaluate(() => document.querySelectorAll('#cadLeft .pfn')[0].click());
  await page.waitForTimeout(400);
  await setPform('L', 'L');
  await clickPrimary();
  await waitVol(24000, 1);
  /* the build resolves the name to 40; the name itself is kept in the step's shadow map, so the form still shows it */
  const st = await page.evaluate(() => { const f = window.__idris.state.part.features[0]; return { p: f.p.L, e: f.e && f.e.L, err: f.err || null }; });
  ok(st.e === 'L', 'the step does not remember the parameter name: ' + JSON.stringify(st));
  ok(st.p === 40, 'the field was not resolved to the parameter value: ' + JSON.stringify(st));
  ok(!st.err, 'the step failed: ' + JSON.stringify(st.err));

  await openTab('Manage');
  await clickTool('Parameters');
  await page.waitForTimeout(300);
  await setPR('val', 'L', 50);
  await waitVol(30000, 1);

  await pressPR('cfg-add');
  await setPR('over', 'L', 60);
  await waitVol(36000, 1);
  const cfg = await page.evaluate(() => ({ c: window.__idris.state.part.config, cs: window.__idris.state.part.configs.map((x) => x.name) }));
  ok(cfg.cs.length === 2, 'the configuration was not added: ' + JSON.stringify(cfg));

  await page.evaluate(() => { const s = document.querySelector('#cadProps select[data-pr=cfg]'); s.value = 'Default'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await waitVol(30000, 1);
});

console.log('\nAn undefined parameter is refused by the step');
await checkAsync('a field naming a parameter that is not defined stops the build, with the name', async () => {
  /* the typing path is covered above (the name L drove the box); here the step is set to a name the part does not
     define and the rebuild is run, which is the state the form leaves behind */
  await page.evaluate(async () => {
    const s = window.__idris, p = s.state.part;
    p.features = [{ id: 'b1', type: 'shape', p: { kind: 'box', L: 'Nope', W: 30, H: 20, D: 40, Di: 20, x: 0, y: 0, z: 0, op: 'add' } }];
    p.params = { L: 40 }; p.config = 'Default';
    await s.tools.rebuildPart();
  });
  await page.waitForFunction(() => { const f = window.__idris.state.part.features[0]; return !!f && !!f.err; }, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__idris.state.part.features[0].err || '');
  ok(/Unknown parameter/i.test(err), 'no refusal: ' + JSON.stringify(err));
  ok(/Nope/.test(err), 'the refusal does not name the parameter: ' + JSON.stringify(err));
  const info = await page.evaluate(() => window.__idris.partInfo());
  ok(!info, 'it built a part anyway: ' + JSON.stringify(info && info.vol));
});

check('no page error anywhere in the flow', () => ok(errors.length === 0, errors.join(' | ')));
await browser.close();
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
