/* S20: the drawing geometry the kernel measures (section, detail window, flatness, perpendicularity).
 *
 * The S20 block is lifted out of index.html and run against the real OpenCascade kernel on one plate:
 *   * 60 x 40 x 10 plate with a Ø8 hole at (30, 20): 7 planar faces, top face area 2 400 − π·16 = 2 349.73 mm²;
 *   * flatness is measured on each face's own boundary: the B-rep is exact, so it is 0.000 mm;
 *   * perpendicularity takes the largest Z face as datum A and measures the angle between normals: 90.000°, 0.000 mm;
 *   * a section at Y = 20 removes exactly half the volume (11 748.67 mm³) and exposes 520 mm² of cut face, in two
 *     pieces because the hole's strip splits it;
 *   * a detail window Ø16 around the hole keeps the kernel's piece of the plate and reads the Ø8 hole inside it;
 *   * a window that misses the part is refused with its measured 0 mm³, and a window radius of 0 with its reason.
 *
 *   node tests/s20-drawing.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const s = html.indexOf('/* ---- S20: the drawing geometry the kernel measures');
const e = html.indexOf('/* ---- S20 UI: the two Drawing tools');
if (s < 0 || e < s) throw new Error('S20 block not found');
const src = html.slice(s, e);
const oc = await ocmod({ locateFile: (f) => new URL('../kernel/' + f, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', `${src}\nreturn { s20Planes, s20Flatness, s20Perp, s20Section, s20Detail };`);
const S = make(async () => R);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const plate = () => R.makeBox([0, 0, 0], [60, 40, 10]).cut(R.makeCylinder(4, 12, [30, 20, 0], [0, 0, 1]));

/* 1. the faces the pattern reads */
{
  const pl = S.s20Planes(R, plate());
  t('six planar faces (the hole is a cylindrical face, not a plane)', pl.length === 6, String(pl.length));
  const top = pl.find((q) => Math.abs(q.n[2] - 1) < 1e-6);
  t('the top face looks along +Z', !!top, JSON.stringify(pl.map((q) => q.n)));
  near(top.area, 2400 - Math.PI * 16, 0.05, 'top face area = 2 400 − π·16 = 2 349.73 mm²');
  const side = pl.find((q) => Math.abs(q.n[0] - 1) < 1e-6);
  near(side.area, 400, 0.02, 'the +X face measures 40 × 10 = 400 mm²');
}

/* 2. flatness, measured on each face's own wire */
{
  const flat = S.s20Flatness(R, plate());
  t('flatness found a face', !!flat.worst, JSON.stringify(flat));
  near(flat.dev, 0, 1e-9, 'an exact B-rep plane deviates 0.000 mm from itself');
  t('flatness sampled the boundary', flat.worst.samples >= 96, String(flat.worst.samples));
  near(flat.worst.area, 2400 - Math.PI * 16, 0.05, 'the face it reports is the largest plane, 2 349.73 mm²');
}

/* 3. perpendicularity against datum A */
{
  const pe = S.s20Perp(R, plate());
  t('datum A is a Z face', !!pe.datum && Math.abs(Math.abs(pe.datum.n[2]) - 1) < 1e-6, JSON.stringify(pe.datum));
  t('four faces should stand at 90° to it', pe.faces.length === 4, String(pe.faces.length));
  near(pe.worst.deg, 90, 1e-6, 'the measured angle between the normals is 90.000°');
  near(pe.worst.dev, 0, 1e-9, 'so the perpendicularity deviation is 0.000 mm');
}

/* 4. the section: a kernel boolean, not a drawing trick */
{
  const sec = S.s20Section(R, plate(), [0, 0, 0], [60, 40, 10], 20);
  near(sec.removed, 23497.34517542563 / 2, 0.02, 'cutting at Y = 20 removes half of 23 497.345 mm³');
  near(sec.cutArea, 520, 0.1, 'the exposed cut face is 600 − 80 = 520 mm², in two pieces');
  t('the cut face is reported as two faces', sec.faces === 2, String(sec.faces));
  t('the cut stays inside the bounds', sec.y > 0 && sec.y < 40, String(sec.y));
}

/* 5. the detail window: a cylinder cut out of the part, projected */
{
  const d = S.s20Detail(R, plate(), 'top', 30, -20, 8);   /* top view: (x, −y), so the Z hole is seen end-on */
  t('the window keeps a piece of the part', d.vol > 100, String(d.vol));
  t('its projection has a box to place on the sheet', !!d.box && d.box.w > 8, JSON.stringify(d.box));
  t('the Ø8 hole is read inside the window', d.holes.some((h) => Math.abs(h.d - 8) < 1e-6), JSON.stringify(d.holes));
  t('the window wall itself is not reported as a hole', d.holes.every((h) => h.d < 16 - 1e-6), JSON.stringify(d.holes));
  t('the projection carries kernel paths', d.visible.length > 0, String(d.visible.length));
  const fr = S.s20Detail(R, plate(), 'front', 30, -5, 8);
  t('the same point from the front still cuts a piece of the part', fr.vol > 100 && fr.holes.length === 0, String(fr.vol));
  const off = S.s20Detail(R, plate(), 'front', 300, 300, 8);
  t('a window that misses the part is refused with its measured 0 mm³', off.refuse === 'empty' && off.vol === 0, JSON.stringify(off));
  const small = S.s20Detail(R, plate(), 'front', 30, -5, 0);
  t('a window radius of 0 is refused with its reason', small.refuse === 'radius' && small.r === 0, JSON.stringify(small));
}

console.log(`\nS20 drawing: ${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
