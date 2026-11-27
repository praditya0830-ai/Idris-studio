/* S19 (brief 25 Nov): the tools that used to be grey are real CAD features now, so this spec builds every one of them
 * with the page's own kernel and checks the geometry the kernel measured against the closed-form value:
 *
 *   Boundary Surface                    is a live tool (its own kernel test is s21i-bound.test.mjs)
 *   Hem                                 plate + half ring + return leg - the overlap the union counts once
 *   Jog                                the swept bend path times thickness times width, plus the near plate
 *   Forming Tool                       plate + spherical cap (pi*h/6*(3*(D/2)^2 + h^2))
 *   Trim/Extend                        plate minus the cutter profile, and still one solid
 *   Motion Study                       the fused swept envelope is larger than the part
 *   Edit Sizes on the Model            the size is rewritten and the kernel rebuilds it (H 10 -> 30)
 *   Curvature / Zebra                  the curvature map is measured on the kernel mesh
 *
 * Run: python3 -m http.server 3051 (in this folder, background) then
 *      NODE_PATH=/tmp/pw/node_modules node tests/b4-grey-tools.spec.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3051/index.html';
let ok = true;
const check = (name, cond, extra) => {
  if (!cond) ok = false;
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' -> ' + (extra == null ? '' : extra)));
};
const near = (a, b, tol) => a != null && Math.abs(a - b) <= Math.abs(b) * tol;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 90000 });
await page.waitForFunction(() => !!window.__idris.tools && typeof window.__idris.tools.rebuildPart === 'function', null, { timeout: 90000 });

/** build a part from a feature tree with the page's own buildPart, and read back what the kernel measured */
const run = (features) => page.evaluate(async (feats) => {
  const I = window.__idris;
  I.state.part = { name: 'b4 test', material: 'steel',
    features: feats.map((x) => ({ id: x.id, type: x.type, p: JSON.parse(JSON.stringify(x.p || {})) })) };
  await I.tools.rebuildPart(true);
  const info = I.partInfo();
  return {
    vol: info ? info.vol : null, area: info ? info.area : null, surface: !!(info && info.surface),
    size: info ? info.size : null,
    errs: I.state.part.features.map((f) => f.err || null),
    notes: I.state.part.features.map((f) => f.note || null)
  };
}, features);

const sq = [[0, 0], [100, 0], [100, 100], [0, 100]];
const ents = (pts) => pts.map((p, i) => ({ t: 'line', a: p, b: pts[(i + 1) % pts.length] }));
const noErr = (r) => r.errs.every((e) => !e);

// ---------------------------------------------------------------- Hem
let r = await run([
  { id: 'base', type: 'smbase', p: { L: 100, W: 60, t: 2, R: 2, material: 'steel', k: 0 } },
  { id: 'hem1', type: 'hem', p: { edge: 'x+', F: 10 } }
]);
/* the 180 degree fold overlaps the plate it rises from, and the return leg overlaps the top of the fold. Both
   overlaps are the same integral (A = R + t = 4): int_2^4 sqrt(16 - u^2) du = 4.913 mm2, and a union counts each one. */
const hemOverlap = 4.9129 * 60;
const hemWant = 100 * 60 * 2 + (Math.PI / 2) * ((4) ** 2 - 2 ** 2) * 60 + 10 * 2 * 60 - 2 * hemOverlap;
check('hem: no step failed', noErr(r), JSON.stringify(r.errs));
check(`hem: volume = plate + half ring + leg - overlap (${hemWant.toFixed(0)} mm3)`, near(r.vol, hemWant, 0.02), r.vol);
check('hem: the note says the sheet does not merge with itself', /does not merge with itself|tidak menembus/i.test(String(r.notes[1])), r.notes[1]);

// ---------------------------------------------------------------- Jog
r = await run([
  { id: 'base', type: 'smbase', p: { L: 200, W: 100, t: 2, R: 2, material: 'steel', k: 0 } },
  { id: 'jog1', type: 'jog', p: { d: 100, h: 15 } }
]);
/* near plate 100 x 100 x 2, two 90 degree fold sectors, a 9 mm web and the far sheet at the new height */
const bendArea = (Math.PI / 4) * ((2 + 2) ** 2 - 2 ** 2);
const jogWant = 100 * 100 * 2 + 2 * bendArea * 100 + 2 * 9 * 100 + (200 - 106) * 2 * 100;
check('jog: no step failed', noErr(r), JSON.stringify(r.errs));
check(`jog: volume = plate + two folds + web + far sheet (${jogWant.toFixed(0)} mm3)`, near(r.vol, jogWant, 0.005), r.vol);
check('jog: the raised sheet sits at the rise (Z = h + t = 17)', r.size && Math.abs(r.size[2] - 17) < 0.01, JSON.stringify(r.size));

// a jog that cannot clear its own bends is refused by the kernel step, not built wrong
r = await run([
  { id: 'base', type: 'smbase', p: { L: 200, W: 100, t: 2, R: 2, material: 'steel', k: 0 } },
  { id: 'jog1', type: 'jog', p: { d: 100, h: 5 } }
]);
check('jog: a 5 mm rise is refused with a sentence about the bends', /clear both bends|two bends/i.test(String(r.errs[1])), r.errs[1]);

// ---------------------------------------------------------------- Forming Tool
r = await run([
  { id: 'base', type: 'smbase', p: { L: 100, W: 60, t: 2, R: 2, material: 'steel', k: 0 } },
  { id: 'form1', type: 'form', p: { kind: 'emboss', D: 16, depth: 3, x: 50, y: 30 } }
]);
const capVol = Math.PI * 3 / 6 * (3 * 64 + 9);
check('forming tool: no step failed', noErr(r), JSON.stringify(r.errs));
check(`forming tool: volume = plate + spherical cap (${(12000 + capVol).toFixed(0)} mm3)`,
  near(r.vol, 12000 + capVol, 0.01), r.vol);
check('forming tool: the note reports the punch radius', /punch radius|radius punch/i.test(String(r.notes[1])), r.notes[1]);

// ---------------------------------------------------------------- Trim/Extend
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 200, W: 80, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  /* the cutter runs along Y from y=30 to y=60 at x=0 and its 40 mm profile is 40 wide in X, so it notches the top edge
     of the 200x80x10 plate instead of cutting it in two: 40 wide x 10 deep x 10 thick = 4000 mm3 */
  { id: 'cutline', type: 'sketch', p: { prof: 'ents', ents: [{ t: 'line', a: [0, 30], b: [0, 60] }], plane: 'XY', at: 'value', off: 0, u: 0, v: 0 } },
  { id: 'trim1', type: 'weldtrim', p: { sketch: 'cutline', profile: 'SHS 40x40x3', extend: 0 } }
]);
check('trim/extend: no step failed', noErr(r), JSON.stringify(r.errs));
check('trim/extend: the plate loses the 40 x 10 mm notch', near(r.vol, 160000 - 4000, 0.01), r.vol);
check('trim/extend: the frame is still one solid', /one solid|satu solid/i.test(String(r.notes[2])), r.notes[2]);

// ---------------------------------------------------------------- Motion Study
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 40, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'm1', type: 'motion', p: { axis: 'Z', angle: 90, steps: 4, px: 0, py: 0, pz: 0 } }
]);
check('motion study: no step failed', noErr(r), JSON.stringify(r.errs));
check('motion study: the part itself did not move', near(r.vol, 8000, 0.001), r.vol);
check('motion study: the note reports a swept envelope larger than the part', (() => {
  const m = String(r.notes[1]).match(/envelope ([\d.,]+) cm³/);
  return m && Number(m[1].replace(',', '.')) > 8;
})(), r.notes[1]);

// ---------------------------------------------------------------- Edit Sizes on the Model
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 40, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'sz', type: 'sizes', p: { step: 'body', param: 'H', value: 30 } }
]);
check('edit sizes: no step failed', noErr(r), JSON.stringify(r.errs));
check('edit sizes: H 10 -> 30 rebuilt by the kernel (24000 mm3)', near(r.vol, 24000, 0.001), r.vol);
check('edit sizes: the note names the step, the size and the old value', /H of step 1 set to 30/.test(String(r.notes[1])), r.notes[1]);

// a size the step does not have is refused, not silently ignored
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 40, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'sz', type: 'sizes', p: { step: 'body', param: 'dist', value: 30 } }
]);
check('edit sizes: a size that step does not have is refused with the sizes it does have',
  /no size 'dist'/.test(String(r.errs[1])), r.errs[1]);

// ---------------------------------------------------------------- Curvature / Zebra
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 40, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'c1', type: 'curv', p: { kind: 'curv' } }
]);
check('curvature: no step failed', noErr(r), JSON.stringify(r.errs));
check('curvature: the map is measured on the kernel mesh', /vertices|titik/.test(String(r.notes[1])), r.notes[1]);
r = await run([
  { id: 'body', type: 'shape', p: { kind: 'box', L: 40, W: 20, H: 10, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'c1', type: 'curv', p: { kind: 'zebra' } }
]);
check('zebra: the isophote bands are drawn from the same normals', noErr(r) && /bands|pita/i.test(String(r.notes[1])), JSON.stringify([r.errs, r.notes[1]]));

// ---------------------------------------------------------------- the ribbon: no grey excuse left for these eight
const rib = await page.evaluate(() => {
  const want = ['Boundary Surface', 'Boundary Boss/Base', 'Hem', 'Jog', 'Forming Tool', 'Trim/Extend',
    'Motion Study', 'Edit Sizes on the Model', 'Curvature / Zebra'];
  const all = window.__idris.ribbon();
  return want.map((n) => {
    const t = all.find((x) => x.n === n);
    return { n, st: t ? t.st : null, run: t ? t.run : null, tab: t ? t.tab : null };
  });
});

for (const t of rib) check(`ribbon: ${t.n} is on and runnable`, t.st === 'on' && t.run === true, JSON.stringify(t));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(ok ? 'ALL PASS' : 'FAILURES ABOVE');
process.exit(ok ? 0 : 1);
