/* P1d: welded frames from standard profiles.
 *
 * buildPart and the weldment table are lifted out of index.html and run against the real OpenCascade kernel:
 *   * a 500 x 300 frame of SHS 40x40x3 gives a cut list of 2 x 500 mm and 2 x 300 mm;
 *   * the mass of the cut pieces is the section area x length x 7.85 kg/dm3, and the part mass is the kernel solid;
 *   * trimming at shared corners shortens every member by half the profile at each end;
 *   * a round tube (EN 10219 CHS) and a channel (EN 10365 UPN) measure their own section area;
 *   * end caps add one plate per member end.
 *
 *   node tests/p1d-weldments.test.mjs
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
const pEnd = html.indexOf('/* ---- end P1a helpers */');
const wStart = html.indexOf('/* ---- P1d: welded frames');
const wEnd = html.indexOf('/* the sketches a weldment step may point at */');
if ([bStart, bEnd, pStart, pEnd, wStart, wEnd].some((x) => x < 0)) throw new Error('helpers or buildPart not found');
const src = html.slice(pStart, pEnd) + '\n' + html.slice(wStart, wEnd) + '\n' + html.slice(bStart, bEnd);

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);
const make = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${src}\nreturn { buildPart, WELD_PROFILES, weldArea, weldCutList, weldMemberSolid, weldSectionSummary, weldMassNote, weldProfileOptions };`);
const { buildPart, WELD_PROFILES, weldArea, weldCutList, weldSectionSummary, weldMassNote, weldProfileOptions } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} ±${tol}`);
const line = (id, ax, ay, bx, by) => ({ id, t: 'line', a: [ax, ay], b: [bx, by], c: 0 });
const frame = (w, h) => ({ id: 'fr', type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0,
  ents: [line('b', 0, 0, w, 0), line('r', w, 0, w, h), line('t', w, h, 0, h), line('l', 0, h, 0, 0)], rels: [], dims: [] } });
const errsOf = (p) => p.features.filter((x) => x.err).map((x) => `${x.type}: ${x.err}`).join(' | ');

/* 1. the brief's frame: 500 x 300, SHS 40x40x3, no trim */
{
  const p = { features: [frame(500, 300), { id: 'm', type: 'member', p: { profile: 'SHS 40x40x3', trim: 'none', op: 'add' } }] };
  const res = await buildPart(p);
  t('frame builds without an error', !p.features[1].err, errsOf(p));
  const cut = weldCutList(p.features);
  const rows = Object.fromEntries(cut.map((r) => [r.len, r.qty]));
  t('cut list: 2 x 500 mm', rows[500] === 2, JSON.stringify(rows));
  t('cut list: 2 x 300 mm', rows[300] === 2, JSON.stringify(rows));
  const area = weldArea(WELD_PROFILES['SHS 40x40x3']);
  const A = WELD_PROFILES['SHS 40x40x3'].A;
  near(area, 444, 1e-6, 'SHS 40x40x3 kernel section area = 444 mm2 (sharp corners)');
  near(A, 421, 1e-6, 'SHS 40x40x3 table area A = 421 mm2 (EN 10219-2, 4.21 cm2)');
  const vol = res.body ? R.measureVolume(res.body) : 0;
  const sum = area * 1600;
  t('kernel volume is below the sum of the pieces (corners share steel)', vol < sum, `${vol} < ${sum}`);
  t('kernel volume is above 90 % of the pieces', vol > sum * 0.9, `${vol} vs ${sum}`);
  const massCut = cut.reduce((n, r) => n + r.qty * r.mass, 0);
  near(massCut, A * 1600 * 7.85e-3, 0.5, 'mass of the cut pieces = table A x length x 7.85');
  t('cut list rows carry the table area A and its source', cut.every((r) => r.A === A && /EN 10219-2/.test(r.tbl)), JSON.stringify(cut[0]));
  const massKernel = vol * 7.85e-3;
  t('part mass = kernel volume x 7.85', massKernel > 0, String(massKernel));
  /* the old assertion (kernel <= table mass) assumed a table area above the kernel area; with the table numbers the
     simplified kernel section is 5.5 % larger, so the two differ and the label says by how much */
  t('the simplified kernel mass differs from the table-A cut mass', Math.abs(massKernel - massCut) > 1, `${massKernel} vs ${massCut}`);
  t('kernel mass stays within 10 % of the table-A cut mass', Math.abs(massKernel / massCut - 1) < 0.1, `${(100 * (massKernel / massCut - 1)).toFixed(1)} %`);
  console.log(`       kernel volume ${vol.toFixed(0)} mm3, cut pieces ${sum.toFixed(0)} mm3, kernel mass ${massKernel.toFixed(0)} g, cut mass ${massCut.toFixed(0)} g`);
}

/* 2. trimming at shared corners */
{
  const p = { features: [frame(500, 300), { id: 'm', type: 'member', p: { profile: 'SHS 40x40x3', trim: 'miter', op: 'add' } }] };
  await buildPart(p);
  t('trimmed frame builds without an error', !p.features[1].err, errsOf(p));
  const rows = Object.fromEntries(weldCutList(p.features).map((r) => [r.len, r.qty]));
  t('trimmed cut list: 2 x 460 mm (half the profile off each end)', rows[460] === 2, JSON.stringify(rows));
  t('trimmed cut list: 2 x 260 mm (half the profile off each end)', rows[260] === 2, JSON.stringify(rows));
}

/* 3. round tube and channel measure their own section */
{
  const one = (y) => ({ id: 'sk' + y, type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents: [line('a' + y, 0, y, 1000, y)], rels: [], dims: [] } });
  for (const [name, area] of [['CHS 42.4x3.2', Math.PI / 4 * (42.4 ** 2 - 36 ** 2)], ['UPN 80', 80 * 6 + 2 * 45 * 8 - 2 * 6 * 8], ['IPE 100', 100 * 4.1 + 2 * 55 * 5.7 - 2 * 4.1 * 5.7], ['L 40x40x4', 2 * 40 * 4 - 16]]) {
    const p = { features: [one(name.length), { id: 'm', type: 'member', p: { profile: name, trim: 'none', op: 'add' } }] };
    const res = await buildPart(p);
    const vol = res.body ? R.measureVolume(res.body) : 0;
    near(vol / 1000, area, area * 0.01, `${name}: kernel area ${(vol / 1000).toFixed(1)} mm2 = ${area.toFixed(1)}`);
    t(`${name} builds without an error`, !p.features[1].err, errsOf(p));
  }
}

/* 4. end caps: one plate per member end, on a single 1000 mm member so no corner shares steel */
{
  const one = { id: 'one', type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents: [line('s', 0, 0, 1000, 0)], rels: [], dims: [] } };
  const a = await buildPart({ features: [one, { id: 'm', type: 'member', p: { profile: 'SHS 40x40x3', trim: 'none', op: 'add' } }] });
  const v1 = R.measureVolume(a.body);
  const p2 = { features: [one, { id: 'm', type: 'member', p: { profile: 'SHS 40x40x3', trim: 'none', op: 'add' } },
    { id: 'c', type: 'endcap', p: { sketch: 'one', profile: 'SHS 40x40x3', t: 3, op: 'add' } }] };
  const b = await buildPart(p2); const v2 = R.measureVolume(b.body);
  t('end caps build without an error', !p2.features[2].err, errsOf(p2));
  const added = v2 - v1, solid = 2 * 40 * 40 * 3, shared = 444 * 3;
  t('two plates add less than two solid plates and more than two plates minus the wall', added > solid - 2 * shared && added < solid, `${added} between ${solid - 2 * shared} and ${solid}`);
  console.log(`       end caps add ${added.toFixed(0)} mm3 (two solid plates would be ${solid}, one tube wall is ${shared})`);
}

/* 5. a member with no sketch is refused */
{
  const p = { features: [{ id: 'm', type: 'member', p: { profile: 'SHS 40x40x3', trim: 'none', op: 'add' } }] };
  await buildPart(p);
  t('member with no sketch says so', /needs a sketch/i.test(p.features[0].err || ''), p.features[0].err);
}

/* 6. the numbers: cut-list mass uses the standard's table A, and the part label shows kernel area vs table A with a
 *    signed Δ; the first profile in the picker says it is only a default */
{
  const TBL = { 'SHS 40x40x3': 421, 'SHS 50x50x3': 541, 'CHS 42.4x3.2': 394, 'L 40x40x4': 308, 'UPN 80': 1100, 'IPE 100': 1032 };
  const sk = (k) => ({ id: 'sk' + k, type: 'sketch', p: { prof: 'ents', plane: 'XY', at: 'value', off: 0, u: 0, v: 0, ents: [line('a' + k, 0, 0, 1000, 0)], rels: [], dims: [] } });
  for (const [name, a] of Object.entries(TBL)) {
    const prof = WELD_PROFILES[name];
    t(`${name}: table A = ${a} mm2, mass per metre and a source on the row`, !!prof && prof.A === a && prof.mpm > 0 && /EN \d/.test(prof.tbl), JSON.stringify(prof));
    const p = { features: [sk(name.length), { id: 'm', type: 'member', p: { profile: name, trim: 'none', op: 'add' } }] };
    await buildPart(p);
    const row = weldCutList(p.features)[0];
    near(row.mass, a * 1000 * 7.85e-3, 0.5, `${name}: cut-list mass = table A x 1000 mm x 7.85`);
    const s = weldSectionSummary(p.features), kA = weldArea(prof), note = weldMassNote(s);
    t(`${name}: the part label names the simplified section and both areas`, !!s && /simplified section/.test(note) && /kernel area/.test(note) && /table A/.test(note), note);
    t(`${name}: Δ is signed and matches kernel ${kA.toFixed(1)} vs table ${a} mm2`, !!s && Math.abs(s.delta - (kA - a) / a * 100) < 1e-9 && (kA - a) * s.delta > 0, note);
    if (name === 'CHS 42.4x3.2') t('CHS: Δ = 0,0 % (a round tube has no corner radius)', f(s.delta, 1) === '0.0', note);
    else t(`${name}: Δ is not 0,0 %`, f(s.delta, 1) !== '0.0', note);
  }
  const opts = weldProfileOptions();
  t('the first profile is marked a default selection, the others are not', /default selection/.test(opts[0][1][0]) && opts.slice(1).every((o) => !/default selection/.test(o[1][0])), opts[0][1][0]);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
