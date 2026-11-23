/* S15: the surface batch (Batch 1). Extruded, Revolved, Lofted, Swept and Planar Surface build a real shell in
 * OpenCascade, Offset Surface copies it with the kernel, Knit sews the pieces, and Thicken turns the body into a
 * solid wall. Every number below is the expectation worked out by hand and then checked against the kernel that
 * ships in the browser:
 *
 *   extruded 20x10 by 30   area 2*(20*30) + 2*(10*30) = 1800 mm2
 *   thickened 2 mm          (200 - 16*6) * 30 = 3120 mm3   (outside prism minus the profile inset by 2 mm)
 *   planar 20x10 + 3 mm     200 * 3 = 600 mm3
 *   lofted 20x20 -> 10x10 over 30: area 4*((20+10)/2 * sqrt(30^2 + 5^2)) = 1824.83 mm2
 *   thickened 2 mm          frustum h/3*(A1+A2+sqrt(A1A2)): 7000 - 3880 = 3120 mm3 (16x16 -> 6x6 inset)
 *   revolved r5..10, h20    area 2pi(10*20) + 2pi(5*20) + 2pi(100-25) = 2356.19 mm2
 *   thickened 2 mm          the profile is inset 2 mm both ways (1 x 16), revolved: pi(100-25)*20 - pi(64-49)*16
 *                           = 4712.39 - 753.98 = 3958.41 mm3
 *   swept circle r5, 100    area pi*10*100 = 3141.59 mm2
 *   thickened 2 mm          pi(25-9)*100 = 5026.55 mm3
 *   offset -2 on the prism  area 2*(16*30) + 2*(6*30) = 1320 mm2, and Thicken refuses it (no profile of its own)
 *
 *   node tests/s15-surface.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
const pStart = html.indexOf('/* ---- P1a:');
const pEnd = html.indexOf('/* ---- end P1c helpers */');
if ([bStart, bEnd, pStart, pEnd].some((x) => x < 0) || bEnd < bStart || pEnd < pStart) throw new Error('P1a/P1c helpers or buildPart not found');
const helpers = html.slice(pStart, pEnd);
const buildSrc = html.slice(bStart, bEnd);
const tapAt = html.indexOf('const TAP = {');
const tapSrc = html.slice(tapAt, html.indexOf('};', tapAt) + 2);
const pitchAt = html.indexOf('const M_PITCH = {');
const pitchSrc = html.slice(pitchAt, html.indexOf('};', pitchAt) + 2);

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);

const make = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${tapSrc}\n${pitchSrc}\n${helpers}\n${buildSrc}\nreturn { buildPart, p1Drawing, p1PathDrawing };`);
const { buildPart } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
const feat = (type, p, id) => ({ type, p, id: id || type + Math.random().toString(36).slice(2) });
const sketch = (p, id) => feat('sketch', { prof: 'rect', W: 20, Hh: 10, plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ...p }, id);
const areaOf = (res) => res.surfs.reduce((a, sh) => a + R.measureArea(sh), 0);

/* 1. extruded surface: 20 x 10 pushed 30 mm */
{
  const sk = sketch({ W: 20, Hh: 10 }, 's1');
  const se = feat('surfext', { sketch: 's1', len: 30 }, 'se');
  const res = await buildPart({ features: [sk, se] });
  t('extruded surface builds without an error', !se.err, se.err);
  near(areaOf(res), 1800, 0.01, 'the shell area is the four sides of the prism (kernel)');
  t('the note names the kernel area', /1800\.0 mm²/.test(se.note || ''), se.note);
  t('the surface body is returned for the viewer', res.surfs.length === 1, String(res.surfs.length));
  t('no solid body yet', !res.body, 'body should be empty before Thicken');

  /* 2. Thicken 2 mm on that surface */
  const th = feat('surfthick', { t: 2 }, 'th');
  const res2 = await buildPart({ features: [sk, se, th] });
  t('Thicken builds a solid without an error', !th.err, th.err);
  near(R.measureVolume(res2.body), 3120, 0.5, 'wall volume = outside prism minus the profile inset by 2 mm');
  near(th.thick ? th.thick.vol : 0, 3120, 0.5, 'the step records the kernel volume it measured');
  t('the note reports cm3 and the wall thickness', /wall 2\.00 mm, volume 3\.12 cm³/.test(th.note || ''), th.note);
  t('the surface body is replaced by the solid', res2.surfs.length === 0, String(res2.surfs.length));
}

/* 3. planar surface + thicken: a flat face extruded by the thickness */
{
  const sk = sketch({ W: 20, Hh: 10 }, 'p1');
  const pl = feat('surfplane', { sketch: 'p1' }, 'pl');
  const res = await buildPart({ features: [sk, pl] });
  t('planar surface builds without an error', !pl.err, pl.err);
  near(areaOf(res), 200, 0.01, 'planar face 20 x 10 = 200 mm2 (kernel)');
  const th = feat('surfthick', { t: 3 }, 'th');
  const res2 = await buildPart({ features: [sk, pl, th] });
  near(R.measureVolume(res2.body), 600, 0.01, '3 mm plate = 200 x 3 = 600 mm3');
}

/* 4. lofted surface 20x20 -> 10x10 over 30, then Thicken 2 mm */
{
  const a = sketch({ W: 20, Hh: 20, off: 0 }, 'l1');
  const b = sketch({ W: 10, Hh: 10, off: 30 }, 'l2');
  const lf = feat('surfloft', { from: 'l1', to: 'l2', mid: '' }, 'lf');
  const res = await buildPart({ features: [a, b, lf] });
  t('lofted surface builds without an error', !lf.err, lf.err);
  near(areaOf(res), 4 * ((20 + 10) / 2 * Math.hypot(30, 5)), 0.05, 'loft area = four trapezoids (kernel)');
  const th = feat('surfthick', { t: 2 }, 'th');
  const res2 = await buildPart({ features: [a, b, lf, th] });
  t('Thicken on the loft builds', !th.err, th.err);
  near(R.measureVolume(res2.body), 3120, 1, 'frustum 7000 mm3 minus its 16x16 -> 6x6 inset 3880 mm3');
}

/* 5. the moldboard: a loft through three arc profiles, then a 2 mm blade */
{
  const arcProf = (Rr, off, id) => feat('sketch', { prof: 'ents', plane: 'XY', at: 'value', off, u: 0, v: 0,
    ents: [{ id: id + 'a', t: 'arc', s: [-Rr, 0], m: [0, Rr], e: [Rr, 0], c: 0 },
      { id: id + 'l', t: 'line', a: [Rr, 0], b: [-Rr, 0], c: 0 }] }, id);
  const s1 = arcProf(20, 0, 'm1'), s2 = arcProf(26, 15, 'm2'), s3 = arcProf(20, 30, 'm3');
  const lf = feat('surfloft', { from: 'm1', mid: 'm2', to: 'm3' }, 'mlf');
  const res = await buildPart({ features: [s1, s2, s3, lf] });
  t('the three-arc loft builds without an error', !lf.err, lf.err);
  t('the curved surface has a kernel area', areaOf(res) > 0, String(areaOf(res)));
  t('the note says three profiles', /through 3 profile/.test(lf.note || ''), lf.note);
  const th = feat('surfthick', { t: 2 }, 'mth');
  const res2 = await buildPart({ features: [s1, s2, s3, lf, th] });
  t('the moldboard thickens into a solid', !th.err && R.measureVolume(res2.body) > 0, th.err || 'no volume');
  t('the blade volume is the kernel volume', !!th.thick && th.thick.vol > 0, JSON.stringify(th.thick));
}

/* 6. revolved surface r5..10, h20, 360 deg about Z */
{
  const sk = sketch({ W: 5, Hh: 20, plane: 'XZ', u: 7.5, v: 0, off: 0 }, 'r1');
  const rv = feat('surfrev', { sketch: 'r1', axis: 'Z', angle: 360 }, 'rv');
  const res = await buildPart({ features: [sk, rv] });
  t('revolved surface builds without an error', !rv.err, rv.err);
  near(areaOf(res), 2 * Math.PI * 200 + 2 * Math.PI * 100 + 2 * Math.PI * 75, 0.2, 'two cylinders plus two annuli (kernel)');
  const th = feat('surfthick', { t: 2 }, 'th');
  const res2 = await buildPart({ features: [sk, rv, th] });
  near(R.measureVolume(res2.body), Math.PI * 75 * 20 - Math.PI * 15 * 16, 1, 'pi(100-25)20 - pi(64-49)16 = 3958.41 mm3');
}

/* 7. swept surface: circle Ø10 along a 100 mm path */
{
  const prof = sketch({ prof: 'circle', D: 10, plane: 'XY', off: 0 }, 'w1');
  const path = feat('sketch', { prof: 'ents', plane: 'XZ', at: 'value', off: 0, u: 0, v: 0,
    ents: [{ id: 'pl', t: 'line', a: [0, 0], b: [0, 100], c: 0 }] }, 'w2');
  const sw = feat('surfsweep', { profile: 'w1', path: 'w2' }, 'sw');
  const res = await buildPart({ features: [prof, path, sw] });
  t('swept surface builds without an error', !sw.err, sw.err);
  near(areaOf(res), Math.PI * 10 * 100, 1, 'cylinder area pi*10*100 (kernel)');
  const th = feat('surfthick', { t: 2 }, 'th');
  const res2 = await buildPart({ features: [prof, path, sw, th] });
  t('the swept surface thickens', !th.err, th.err);
  near(R.measureVolume(res2.body), Math.PI * 16 * 100, 5, 'tube wall pi(25-9)*100 = 5026.55 mm3');
}

/* 8. offset surface copies the body with the kernel, and Thicken says honestly why it cannot use it */
{
  const sk = sketch({ W: 20, Hh: 10 }, 'o1');
  const se = feat('surfext', { sketch: 'o1', len: 30 }, 'o1e');
  const of = feat('surfoffset', { dist: 2 }, 'of');
  const res = await buildPart({ features: [sk, se, of] });
  t('offset surface builds without an error', !of.err, of.err);
  t('the offset copy is a second piece in the body', res.surfs.length === 2, String(res.surfs.length));
  near(R.measureArea(res.surfs[1]), 1320, 1, 'the offset shell is the 16x30 and 6x30 sides (kernel)');
  near(areaOf(res), 3120, 1, 'body area = the surface 1800 plus its offset copy 1320');
  const th = feat('surfthick', { t: 2 }, 'th');
  await buildPart({ features: [sk, se, of, th] });
  t('Thicken refuses an offset copy with a reason', /has no profile of its own/.test(th.err || ''), th.err);
}

/* 9. knit: one piece comes back sewn, with its profile kept for Thicken */
{
  const sk = sketch({ W: 20, Hh: 10 }, 'k1');
  const se = feat('surfext', { sketch: 'k1', len: 30 }, 'ke');
  const kn = feat('surfknit', { solid: 'sheet' }, 'kn');
  const res = await buildPart({ features: [sk, se, kn] });
  t('knit sews the body without an error', !kn.err, kn.err);
  near(areaOf(res), 1800, 0.5, 'the knitted piece keeps the extruded area');
  t('the note says it is still a surface', /still an open surface/.test(kn.note || ''), kn.note);
  const th = feat('surfthick', { t: 2 }, 'th');
  const res2 = await buildPart({ features: [sk, se, kn, th] });
  near(R.measureVolume(res2.body), 3120, 0.5, 'a knitted piece built from sketches still thickens exactly');
}

/* 10. a surface step that points at nothing fails honestly instead of inventing a shape */
{
  const th = feat('surfthick', { t: 2 }, 'th');
  await buildPart({ features: [th] });
  t('Thicken without a surface says what to build first', /needs a surface first/.test(th.err || ''), th.err);
  const se = feat('surfext', { sketch: 'nope', len: 30 }, 'se');
  await buildPart({ features: [sketch({}, 'x'), se] });
  t('an extruded surface with a missing sketch is refused', /Pick an existing Sketch step/.test(se.err || ''), se.err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
