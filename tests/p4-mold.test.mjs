/* P4: the mould split.
 *
 * buildPart is lifted out of index.html and run against the real OpenCascade kernel:
 *   * a 100 x 60 x 20 block with a 10 mm margin and a parting plane at Z = 10 gives
 *     core = 120*80*20 - 100*60*10 = 132 000 mm3 and cavity = 120*80*20 - 100*60*10 = 132 000 mm3
 *     (the margin is on every side, so each half is 20 mm tall and holds half the part);
 *   * the part body is not changed by the split;
 *   * a parting plane outside the part is refused with the range in the message.
 *
 *   node tests/p4-mold.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as R from '../kernel/replicad.js';
import ocmod from '../kernel/replicad_single.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const bStart = html.indexOf('async function buildPart(pArg)');
const bEnd = html.indexOf('\n/* triangles \u2192 binary STL');
if (bStart < 0 || bEnd < bStart) throw new Error('buildPart not found');
const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', 'L', 'catClearance', 'state', 'f', `${html.slice(bStart, bEnd)}\nreturn { buildPart };`);
const { buildPart } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const box = { id: 'b', type: 'shape', p: { kind: 'box', L: 100, W: 60, H: 20, x: 0, y: 0, z: 0, op: 'add' } };

/* 1. the brief's simple part */
{
  const mf = { id: 'm', type: 'mold', p: { margin: 10, parting: 10 } };
  const p = { features: [box, mf] };
  const res = await buildPart(p);
  t('mould split builds without an error', !mf.err, mf.err);
  t('the step holds the two volumes', !!mf.mold, JSON.stringify(mf.mold));
  near(mf.mold ? mf.mold.core : 0, 120 * 80 * 20 - 100 * 60 * 10, 1, 'core = block below the plane minus the part');
  near(mf.mold ? mf.mold.cavity : 0, 120 * 80 * 20 - 100 * 60 * 10, 1, 'cavity = block above the plane minus the part');
  near(res.body ? R.measureVolume(res.body) : 0, 100 * 60 * 20, 1e-6, 'the part body is unchanged');
  t('the note names both volumes in cm3', /Core 132\.0 cm3, cavity 132\.0 cm3/.test(mf.note || ''), mf.note);
}

/* 2. a parting plane outside the part is refused with the range */
{
  const mf = { id: 'm2', type: 'mold', p: { margin: 10, parting: 40 } };
  const p = { features: [box, mf] };
  await buildPart(p);
  t('a plane above the part is refused with the range', /must cut through the part/i.test(mf.err || '') && /0\.00 to 20\.00/.test(mf.err || ''), mf.err);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
