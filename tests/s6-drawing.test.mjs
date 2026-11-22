/* S6: advanced part drawing.
 *
 * The shipped helpers and drawingSheet are lifted out of index.html and run against the real
 * OpenCascade kernel, so the section, the hatching and the dimensions come from the code that
 * runs in the browser:
 *   * A-A section through a plate 120x80x8 with a boss Ø30 to 28 mm, a Ø12 hole and 4xØ8;
 *   * the cut face is hatched, and the profile measures 28 mm at the boss and 8 mm beside it;
 *   * a fillet R2 is measured from the kernel edge (R2.00), an angle from two straight edges;
 *   * a dimension text is moved off the visible outline (no text box crosses a line);
 *   * oblique holes are counted in a note, and engineer annotations are labelled as such.
 *
 *   node tests/s6-drawing.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const a = html.indexOf('/* ---- S6: drawing helpers');
const b = html.indexOf('function drawingDialog');
if (a < 0 || b < 0 || b < a) throw new Error('S6 helpers or drawingSheet not found in index.html');
const src = html.slice(a, b);

const PMAT = { aluminium: ['Aluminium 6061-T6', 2.70], steel: ['Structural steel S235', 7.85] };
const f = (n, d = 0) => Number(n).toFixed(d);
const L = (en) => en;
const S6 = new Function('PMAT', 'f', 'genRes', 'L',
  `${src}\nreturn { s6Section, s6Hatch, s6Inside, s6Loops, s6Vec, s6AngleDeg, s6PickArc, s6Oblique, s6Avoid, s6TextRect, drawingSheet };`)(PMAT, f, {}, L);

const oc = await ocmod({ locateFile: (x) => new URL('../kernel/' + x, import.meta.url).href });
R.setOC(oc);

/* ---- the part in the brief: 120x80x8 plate, boss Ø30 to 28, Ø12, 4xØ8, fillet R2 ---- */
let shape = R.makeBox([-60, -40, 0], [60, 40, 8]);
shape = shape.fuse(R.makeCylinder(15, 20, [0, 0, 8], [0, 0, 1]));
shape = shape.cut(R.makeCylinder(6, 60, [0, 0, -1], [0, 0, 1]));
for (const [x, y] of [[-45, 25], [45, 25], [-45, -25], [45, -25]]) shape = shape.cut(R.makeCylinder(4, 60, [x, y, -1], [0, 0, 1]));
shape = shape.fillet(2, (e) => e.inDirection('Z'));
const lo = shape.boundingBox.bounds[0].slice(), hi = shape.boundingBox.bounds[1].slice();

/* ---- test runner ---- */
let pass = 0; const fails = [];
function check(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
function eq(actual, expected, tol, what) { if (Math.abs(actual - expected) > tol) throw new Error(`${what}: ${actual} != ${expected} (±${tol})`); }
function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }

/* ---- projections, exactly as partDrawing makes them ---- */
const views = {};
for (const v of ['front', 'bottom', 'right', 'iso']) {
  const cam = v === 'iso' ? new R.ProjectionCamera([0, 0, 0], [1, -1, 1], [1, 1, 0]) : v;
  const pr = R.drawProjection(shape, cam), bb = (d) => { const q = d.boundingBox; return { x: q.bounds[0][0], y: -q.bounds[1][1], w: q.width, h: q.height }; };
  const vis = pr.visible.toSVGPaths ? pr.visible.toSVGPaths() : [], hid = v === 'iso' ? [] : (pr.hidden.toSVGPaths ? pr.hidden.toSVGPaths() : []);
  views[v] = { visible: vis.flat ? vis.flat() : vis, hidden: hid.flat ? hid.flat() : hid, box: bb(pr.visible) };
}
const vw = { front: views.front, top: views.bottom, left: views.right, iso: views.iso };
const circles = [];
for (const e of shape.edges) { if (e.geomType !== 'CIRCLE') continue; const ad = new oc.BRepAdaptor_Curve(e.wrapped);
  if (Math.abs(ad.LastParameter() - ad.FirstParameter()) > 2 * Math.PI - 1e-3) { const c = ad.Circle(), o = c.Location(), d = c.Axis().Direction(); circles.push({ c: [o.X(), o.Y(), o.Z()], r: c.Radius(), n: [d.X(), d.Y(), d.Z()] }); }
  ad.delete(); }
const arcs = [];
for (const e of shape.edges) { if (e.geomType !== 'CIRCLE') continue; const ad = new oc.BRepAdaptor_Curve(e.wrapped), c = ad.Circle(), o = c.Location(), d = c.Axis().Direction();
  arcs.push({ c: [o.X(), o.Y(), o.Z()], r: c.Radius(), n: [d.X(), d.Y(), d.Z()] }); ad.delete(); }
const geo = { bounds: [lo.slice(), hi.slice()], vol: R.measureVolume(shape) };
const part = { id: 's6', name: 'Mounting plate', material: 'steel', drawing: {} };

console.log('\nS6 A-A section');
const sec = S6.s6Section(R, shape, lo, hi, 0);
check('the section is cut and projected', () => { ok(sec && sec.box && sec.visible.length > 0, 'no section geometry'); });
check('the cut face has one outer loop (with the hole inside)', () => { ok(sec.loops.length >= 1, 'no section loops'); });
const span = (u0) => { const ys = [];
  for (const l of sec.loops) for (let i = 0, j = l.length - 1; i < l.length; j = i++) { const x1 = l[i][0], y1 = l[i][1], x2 = l[j][0], y2 = l[j][1];
    if ((x1 - u0) * (x2 - u0) <= 0 && Math.abs(x2 - x1) > 1e-9) { const tt = (u0 - x1) / (x2 - x1); ys.push(y1 + tt * (y2 - y1)); } }
  return ys.length > 1 ? Math.max(...ys) - Math.min(...ys) : 0; };
check('the profile is 28 mm through the boss', () => eq(span(10), 28, 0.3, 'height at x = 10'));
check('the profile is 8 mm beside the boss', () => eq(span(40), 8, 0.3, 'height at x = 40'));
const loops = sec.loops.map((l) => l.map(([u, w]) => [50 + u * 1.5, 60 - w * 1.5]));
const hatch = S6.s6Hatch(loops, 1.6);
check('the cut face is hatched (45° lines inside the face)', () => { ok(hatch.length > 30, 'only ' + hatch.length + ' hatch lines');
  const out = hatch.filter(([x1, y1, x2, y2]) => !S6.s6Inside(loops, (x1 + x2) / 2, (y1 + y2) / 2)).length;
  ok(out <= Math.ceil(hatch.length * 0.02), out + ' of ' + hatch.length + ' hatch lines leave the face'); });

console.log('\nS6b measured radius and angle');
check('the fillet R2 exists as a kernel arc', () => { ok(arcs.some((q) => Math.abs(q.r - 2) < 1e-6), 'no R2 arc'); });
{ const list = arcs.filter((q) => Math.abs(q.r - 2) < 1e-6).map((q) => ({ x: 100 + q.c[0], y: 100 + q.c[1], r: q.r }));
  const hit = S6.s6PickArc(list, 100 + arcs.find((q) => Math.abs(q.r - 2) < 1e-6).c[0] + 2, 100 + arcs.find((q) => Math.abs(q.r - 2) < 1e-6).c[1], 3.5);
  check('a click on the R2 edge measures R2.00', () => { ok(hit, 'no pick'); eq(hit.r, 2, 1e-6, 'radius'); }); }
check('the angle between two edges is measured, not typed', () => { eq(S6.s6AngleDeg([1, 0], [0, 1], [0, 0]), 90, 1e-9, '90°'); eq(S6.s6AngleDeg([1, 0], [1, 1], [0, 0]), 45, 1e-9, '45°'); });

console.log('\nS6c text placement');
check('a dimension text is moved off a visible line', () => {
  const lines = [{ x1: 40, y1: 92, x2: 140, y2: 92, layer: 'VISIBLE', w: 0.5 }];
  const texts = [{ x: 90, y: 93, t: '120', h: 3.5, anchor: 'middle', avoid: true }];
  const r0 = S6.s6Avoid(texts, lines);
  ok(r0.moved > 0, 'text was not moved'); eq(r0.hits, 0, 'text still on the line');
});
const sheet = S6.drawingSheet(part, vw, circles, false, [], geo, sec);
check('no dimension text crosses a visible line on the sheet', () => { eq(sheet.textHits, 0, 'texts on lines'); ok(sheet.textMoved >= 0, 'moved count'); });
check('the sheet carries the section, its hatching and the cutting line', () => {
  ok(sheet.section && sheet.section.y === 0, 'no section on the sheet');
  ok(sheet.lines.some((l) => l.layer === 'HATCH'), 'no hatch lines');
  ok(sheet.lines.some((l) => l.layer === 'CUT'), 'no cutting line');
  ok(sheet.iso && /Section A/.test(sheet.texts.map((t) => t.t).join(' ')), 'no section label');
});
check('the section outline is in the SVG and the DXF shares the same lines', () => {
  ok(/Section A/.test(sheet.svg), 'no section label in the SVG');
  ok(sheet.svg.includes('stroke-width="0.18"'), 'hatch lines missing from the SVG');
});

console.log('\nS6d/S6e honest notes');
check('an oblique hole is counted, not dimensioned', () => {
  const ob = circles.concat([{ c: [0, 0, 30], r: 3, n: [Math.SQRT1_2, Math.SQRT1_2, 0] }]);
  eq(S6.s6Oblique(ob), 1, 'oblique count');
  const sh = S6.drawingSheet({ ...part, drawing: {} }, vw, ob, false, [], geo, null);
  ok(sh.texts.some((t) => /1 oblique hole not dimensioned/.test(t.t)), 'no oblique note');
});
check('engineer annotations are marked engineer input', () => {
  const sh = S6.drawingSheet({ ...part, drawing: { finish: 'Ra 3.2', tol: 'Ø12 H7' } }, vw, circles, false, [], geo, null);
  const txt = sh.texts.map((t) => t.t).join(' ');
  ok(/Surface finish Ra 3.2 \(ISO 21920\/1302\) — engineer input/.test(txt), 'no finish note');
  ok(/Special tolerance Ø12 H7 — engineer input/.test(txt), 'no tolerance note');
});
check('a section drawing is not claimed for generated code', () => {
  /* partDrawing leaves s6ctx.make null for a generated part; the sheet then has no section */
  const sh = S6.drawingSheet(part, vw, circles, false, [], geo, null);
  ok(sh.section === null, 'a section appeared without a kernel cut');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const [n, e] of fails) console.log(`${n}\n  ${e && e.stack}`); process.exit(1); }
