/* P1c: sweep, loft, rib and the cosmetic thread.
 *
 * buildPart and the sketch helpers are lifted out of index.html and run against the real OpenCascade kernel,
 * so these numbers come from the code that ships in the browser:
 *   * sweep: circle Ø10 along a line 100 mm = pi * 25 * 100 = 7853.98 mm3;
 *   * loft: square 20 mm to square 10 mm over 30 mm = frustum = (h/3)(A1 + A2 + sqrt(A1*A2)) = 7000 mm3;
 *   * rib: one line 50 mm, 3 mm thick, 20 mm high = 3000 mm3;
 *   * thread M8 is cosmetic: the volume does not change, and the pitch (ISO 261) and tap drill (ISO 2306) are noted.
 *
 *   node tests/p1c-features.test.mjs
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
  `${tapSrc}\n${pitchSrc}\n${helpers}\n${buildSrc}\nreturn { buildPart, p1PathDrawing };`);
const { buildPart } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
const line = (id, ax, ay, bx, by) => ({ id, t: 'line', a: [ax, ay], b: [bx, by], c: 0 });
const feat = (type, p, id) => ({ type, p, id: id || type + Math.random().toString(36).slice(2) });

/* 1. sweep: circle Ø10 along a path 100 mm -> pi * 25 * 100 */
{
  const sk = feat('sketch', { prof: 'circle', D: 10, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }, 'profile');
  const path = feat('sketch', { prof: 'ents', plane: 'XZ', at: 'value', off: 0, ents: [line('p1', 0, 0, 0, 100)] }, 'path');
  const p = { features: [sk, path, feat('sweep', { profile: 'profile', path: 'path', op: 'add' }, 'sw')] };
  const res = await buildPart(p);
  const errs = p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`);
  t('sweep builds without an error', errs.length === 0, errs.join(' | '));
  near(res.body ? R.measureVolume(res.body) : 0, Math.PI * 25 * 100, 0.05, 'sweep volume = pi·25·100');
  const sb = res.body ? res.body.boundingBox.bounds : [[0,0,0],[0,0,0]];
  near(sb[1][2] - sb[0][2], 100, 1e-6, 'sweep is 100 mm long');
}

/* 2. loft: square 20 to square 10 over 30 mm */
{
  const a = feat('sketch', { prof: 'rect', W: 20, Hh: 20, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }, 'a');
  const b = feat('sketch', { prof: 'rect', W: 10, Hh: 10, plane: 'XY', at: 'value', off: 30, u: 0, v: 0 }, 'b');
  const p = { features: [a, b, feat('loft', { from: 'a', to: 'b', op: 'add' }, 'lo')] };
  const res = await buildPart(p);
  const errs = p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`);
  t('loft builds without an error', errs.length === 0, errs.join(' | '));
  near(res.body ? R.measureVolume(res.body) : 0, (30 / 3) * (400 + 100 + Math.sqrt(400 * 100)), 0.05, 'loft volume = frustum');
  const lb = res.body ? res.body.boundingBox.bounds : [[0,0,0],[0,0,0]];
  near(lb[1][2] - lb[0][2], 30, 1e-6, 'loft is 30 mm high');
  const same = { features: [a, feat('loft', { from: 'a', to: 'a', op: 'add' }, 'l2')] };
  await buildPart(same);
  t('loft of one sketch twice is refused', /different sketches/i.test(same.features[1].err || ''), same.features[1].err);
}

/* 3. rib: one line 50 mm, 3 mm thick, 20 mm high */
{
  const sk = feat('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: [line('r1', 0, 0, 50, 0)] }, 'ribsk');
  const p = { features: [sk, feat('rib', { t: 3, h: 20, op: 'add' }, 'rib')] };
  const res = await buildPart(p);
  const errs = p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`);
  t('rib builds without an error', errs.length === 0, errs.join(' | '));
  near(res.body ? R.measureVolume(res.body) : 0, 50 * 3 * 20, 0.05, 'rib volume = 50·3·20');
  const two = feat('sketch', { prof: 'ents', plane: 'XY', at: 'value', off: 0, ents: [line('a', 0, 0, 10, 0), line('b', 10, 0, 10, 20)] }, 'two');
  const p2 = { features: [two, feat('rib', { t: 3, h: 20, op: 'add' }, 'rib2')] };
  await buildPart(p2);
  t('rib with two lines is refused with a number', /exactly one straight line; this sketch has 2/i.test(p2.features[1].err || ''), p2.features[1].err);
}

/* 4. thread M8 is cosmetic: no volume change, ISO numbers noted */
{
  const box = feat('shape', { kind: 'box', L: 100, W: 60, H: 10, x: 0, y: 0, z: 0, op: 'add' }, 'box');
  const th = feat('thread', { M: 'M8', depth: 12, x: 10, y: 10 }, 'th');
  const p = { features: [box, th] };
  const res = await buildPart(p);
  t('thread builds without an error', !th.err, th.err);
  near(res.body ? R.measureVolume(res.body) : 0, 100 * 60 * 10, 1e-6, 'cosmetic thread leaves the volume alone');
  t('thread note has the ISO 261 pitch and ISO 2306 tap drill', /1\.25/.test(th.note || '') && /6\.8/.test(th.note || ''), th.note);
}

/* 5. a sweep path must be an open chain of lines, not a rectangle */
{
  const sk = feat('sketch', { prof: 'circle', D: 10, plane: 'XY', at: 'value', off: 0, u: 0, v: 0 }, 'pr');
  const path = feat('sketch', { prof: 'rect', W: 20, Hh: 20, plane: 'XZ', at: 'value', off: 0 }, 'rc');
  const p = { features: [sk, path, feat('sweep', { profile: 'pr', path: 'rc', op: 'add' }, 's2')] };
  await buildPart(p);
  t('a rectangle path is refused in words', /open chain of lines or arcs/i.test(p.features[2].err || ''), p.features[2].err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
