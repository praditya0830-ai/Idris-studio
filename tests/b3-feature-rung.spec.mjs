/* v0.45 (brief 25 Nov, B1/B2/B3): a feature part arrives as an editable tree, is built one real kernel step at a
 * time, can be skipped to the same solid, and says where its numbers came from. No AI: the /chat answer is a fixture
 * built from the same {id, type, p} steps the solver sends.
 *
 * Run: python3 -m http.server 3051 (in this folder, background) then
 *      NODE_PATH=/tmp/pw/node_modules node tests/b3-feature-rung.spec.mjs [viewport-width]
 */
import { chromium } from 'playwright';

const W = Number(process.argv[2] || 1366), H = W === 1280 ? 800 : 768;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';

const CAD = {
  title: 'Mounting plate', material: 'steel', read_by: 'IDRIS feature recipe (validated)',
  feature_template: 'plate', feature_origin: 'template', shape_class: 'prismatic',
  feature_tree: [
    { id: 'base', type: 'sketch', p: { prof: 'rect', W: 120, Hh: 80, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 } },
    { id: 'body', type: 'push', p: { sketch: 'base', dist: 8, op: 'add' } },
    { id: 'hole1', type: 'hole', p: { D: 9, x: 42, y: 22, depthMode: 'thru' } },
    { id: 'hole2', type: 'hole', p: { D: 9, x: 42, y: -22, depthMode: 'thru' } },
    { id: 'hole3', type: 'hole', p: { D: 9, x: -42, y: -22, depthMode: 'thru' } },
    { id: 'hole4', type: 'hole', p: { D: 9, x: -42, y: 22, depthMode: 'thru' } }
  ],
  numbers: [
    { k: 'length_mm', value: 120, unit: 'mm', source: 'you' },
    { k: 'width_mm', value: 80, unit: 'mm', source: 'you' },
    { k: 'thickness_mm', value: 8, unit: 'mm', source: 'you' },
    { k: 'hole_d_mm', value: 9, unit: 'mm', source: 'table:ISO 273 medium', assumed: true }
  ],
  missing: []
};

let ok = true;
const check = (name, cond, extra) => {
  if (!cond) ok = false;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond || extra == null ? '' : ' -> ' + extra));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
await page.addInitScript((cad) => {
  const of = window.fetch;
  window.fetch = async (u, o) => {
    const url = typeof u === 'string' ? u : (u && u.url) || '';
    if (/\/chat$/.test(url) && o && String(o.method || 'GET').toUpperCase() === 'POST') {
      return new Response(JSON.stringify({
        success: true, intent: 'discuss', answer: 'Fixture: a plate from the feature recipe.', cad,
        rung: 'features', fidelity: 'features', numbers: cad.numbers, not_checked: ['strength (FEA)']
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return of(u, o);
  };
}, CAD);

const rows = () => page.evaluate(() => document.querySelectorAll('#cadLeft ol.pft li:not([hidden])').length);
const stepText = () => page.evaluate(() => {
  const e = document.querySelector('#liveBox .lb-step');
  return e ? String(e.textContent || '').trim() : '';
});
const volume = async () => {
  const t = await page.locator('#cadProps').innerText();
  const m = t.match(/([\d.,]+)\s*cm³/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('#inp', 'design a mounting bracket plate 120x80x8 with 4 holes M8');
  await page.press('#inp', 'Enter');

  await page.waitForSelector('#treeBadge [data-tree-badge="features"]', { timeout: 90000 });
  check('badge: built with CAD features (editable)', /Built with CAD features/.test(await page.locator('#treeBadge').innerText()));
  check('feature tree: 6 rows in the solver order', (await page.locator('#cadLeft ol.pft li').count()) === 6);

  // live build: the step caption moves, and the tree shows only the steps already built
  const seen = [];
  for (let i = 0; i < 90; i++) {
    const t = await stepText();
    const r = await rows();
    const e = !!t;
    if (t) {
      const n = Number((t.match(/Step (\d+)\/(\d+)/) || [])[1] || 0);
      seen.push([n, r, t]);
      check(`live build: tree shows exactly ${n} built step(s)`, n === 0 || r === n, `rows=${r} caption=${t}`);
      if (i === 3) {
        const all = await page.evaluate(() => {
          const b = document.querySelector('#liveBox');
          return b ? String(b.innerText || b.textContent || '') : '';
        });
        check('live build: the caption names the step and its source', /you gave it|ISO 273/.test(all), all.replace(/\n/g, ' | '));
      }
    }
    if (seen.length && e && seen[seen.length - 1][0] >= 3) break;   // skip while the build is still running
    await sleep(140);
  }
  const steps = [...new Set(seen.map((s) => s[0]))].filter(Boolean);
  check('live build: the part is built step by step (not one frame)', steps.length >= 3, JSON.stringify(steps));
  check('live build: the caption starts at step 1 of 6', seen[0] && seen[0][2].startsWith('Step 1/6'), seen[0] && seen[0][2]);

  // Skip lands on the same solid: all six steps built by the kernel, nothing left hidden
  // the live box is redrawn on every step, so the button is clicked directly instead of waiting for it to stand still
  await page.evaluate(() => document.querySelector('[data-live-skip]').click());
  await page.waitForFunction(() => !document.querySelector('#liveBox'), null, { timeout: 60000 });
  check('skip: every tree row is shown again', (await rows()) === 6);

  await page.click('#cadTabs button[data-ctab="check"]');
  await page.waitForFunction(() => /cm³/.test(document.querySelector('#cadProps').innerText), null, { timeout: 30000 });
  const v8 = await volume();
  check('skip: volume = 120x80x8 - 4x ISO 273 M8 (74.76 cm³)', Math.abs(v8 - 74.76) < 0.05, String(v8));

  // B3: edit the thickness in the tree and rebuild from that step
  await page.evaluate(() => document.querySelector('#cadLeft ol.pft li:nth-child(2) .pfn').click());
  await page.waitForSelector('#cadProps input[data-k="dist"]', { timeout: 15000 });
  await page.fill('#cadProps input[data-k="dist"]', '10');
  await page.evaluate(() => {
    const b = document.querySelector('#cadProps .pact .chip.primary');
    b.disabled = false;
    b.click();
  });
  // wait for the rebuild, then leave the step form (Escape) so the Check panel shows the measured volume again
  await page.waitForFunction(() => /solid \u00b7 6 features/.test(document.querySelector('#cchecks').innerText), null, { timeout: 60000 });
  await page.press('#cadProps input[data-k="dist"]', 'Escape');
  await page.evaluate(() => document.querySelector('#cadTabs button[data-ctab="check"]').click());
  await page.waitForFunction(() => {
    const t = document.querySelector('#cadProps').innerText;
    const m = t.match(/([\d.,]+)\s*cm³/);
    return m && Math.abs(Number(m[1].replace(/,/g, '')) - 93.46) < 0.1;
  }, null, { timeout: 60000 });
  const v10 = await volume();
  check('edit: thickness 8 -> 10 changes the volume to 93.46 cm³', Math.abs(v10 - 93.46) < 0.1, String(v10));
  check('edit: the badge still says features', (await page.locator('#treeBadge [data-tree-badge="features"]').count()) === 1);
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check('run finished without an exception', false, String(e.message || e).slice(0, 300));
} finally {
  await browser.close();
}
console.log(ok ? 'ALL PASS' : 'FAILURES');
process.exit(ok ? 0 : 1);
