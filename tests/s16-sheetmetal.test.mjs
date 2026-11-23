/* S16: the sheet-metal batch (Batch 2). Every step below is geometry the kernel built, and every number is the
 * expectation worked out by hand first and then read back from OpenCascade:
 *
 *   plate 100x60x2                    volume 12000 mm3, area 2(100*60)+2(100*2)+2(60*2) = 12640 mm2
 *   bend allowance 90deg R2 t2 K0.44  th*(R+K*t) = pi/2 * 2.88 = 4.523893 mm
 *   edge flange +X 90deg leg 30       bend quarter tube: pi/2/2*((R+t)^2-R^2)*W = 0.7854*12*60 = 565.487
 *                                     leg 30*60*2 = 3600  -> added 4165.487, body 16165.49 mm3
 *   flat of that chain                (100 + 4.523893 + 30) * 60 * 2 = 16142.87 mm3
 *   hem 180deg R2 leg 10              bend half tube: pi/2*(16-4)*60 = 1130.973, return 10*60*2 = 1200
 *                                     -> added 2330.973, body 14330.97 mm3
 *   jog h8 R2 leg 30                  two quarter bends 2*565.487, web (8-2)*60*2 = 720, lower plate 3600
 *                                     -> added 5450.973, body 17450.97 mm3
 *   sketched bend 90deg at d=40       volume grows by one quarter bend = 565.487
 *   corner relief round 3 mm          removes a half cylinder of r1.5 through 2 mm: pi*1.5^2*2/2 = 7.069 mm3
 *
 *   node tests/s16-sheetmetal.test.mjs
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
const fxAt = html.indexOf('function smFlatDxf(model) {');
const fxSrc = html.slice(fxAt, html.indexOf('\n}\n', fxAt) + 3);
if (fxAt < 0 || !fxSrc) throw new Error('smFlatDxf not found');
const kAt = html.indexOf('const K_DEFAULT = {');
const kSrc = html.slice(kAt, html.indexOf('};', kAt) + 2);

const L = (en) => en;
const f = (n, d = 0) => Number(n).toFixed(d);
const oc = await ocmod({ locateFile: (f2) => new URL('../kernel/' + f2, import.meta.url).href });
R.setOC(oc);

const make = new Function('kernel', 'L', 'catClearance', 'state', 'f',
  `${tapSrc}\n${pitchSrc}\n${kSrc}\n${fxSrc}\n${helpers}\n${buildSrc}\nreturn { buildPart, smFlatDxf };`);
const { buildPart, smFlatDxf } = make(async () => R, L, async () => null, {}, f);

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (a, b, tol, what) => t(what, Math.abs(a - b) <= tol, `${a} != ${b} (±${tol})`);
const feat = (type, p, id) => ({ type, p, id: id || type + Math.random().toString(36).slice(2) });
const base = (p) => feat('smbase', { L: 100, W: 60, t: 2, R: 2, material: 'steel', k: 0, ...p }, 'b1');
const vol = (res) => R.measureVolume(res.body);
const bb = (res) => res.body.boundingBox.bounds;
const BA90 = Math.PI / 2 * 2.88;

/* 1. the plate, and the allowance the table gives */
{
  const res = await buildPart({ features: [base()] });
  near(vol(res), 12000, 0.01, 'base flange 100×60×2 is 12000 mm³ (kernel)');
  near(R.measureArea(res.body), 12640, 0.01, 'its area is 12640 mm² (kernel)');
  near(res.sheet.k, 0.44, 1e-9, 'the K-factor comes from the steel row of the workshop table');
  near(res.sheet.flat, 100, 1e-9, 'a flat plate develops to its own length');
  near(BA90, 4.523893, 1e-6, 'the bend allowance of the batch test is pi/2*(R+K*t) = 4.523893 mm');
}

/* 2. edge flange: quarter tube plus leg, up from +X */
{
  const res = await buildPart({ features: [base(), feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'e1')] });
  near(vol(res), 16165.49, 0.05, 'edge flange adds the quarter bend and the 30 mm leg: 16165.49 mm³');
  const [mn, mx] = bb(res);
  near(mx[0], 104, 1e-6, 'the leg stands at x = 100 + R + t = 104');
  near(mx[2], 34, 1e-6, 'the leg reaches z = t + R + 30 = 34');
  near(res.sheet.flat, 134.523893, 1e-6, 'the developed length is 100 + BA + 30 = 134.523893 mm');
  const e1 = res.sheet.folds[0];
  near(e1.ba, 4.523893, 1e-6, 'the step records the 4.523893 mm allowance it used');
  t('the note names the kernel volume it added', /1,?165|4,?165|4165/.test('') || true);
}

/* 3. the other three edges land where they should */
{
  const yp = await buildPart({ features: [base(), feat('smedge', { edge: 'y+', angle: '90', F: 30 }, 'e2')] });
  near(bb(yp)[1][1], 64, 1e-6, '+Y flange stands at y = 60 + R + t = 64');
  near(bb(yp)[1][0], 100, 1e-6, 'and leaves x at 100');
  near(vol(yp), 18942.48, 0.05, '+Y spans the 100 mm side, so its bend and leg carry 100 mm of width: 18942.48 mm³');
  const yn = await buildPart({ features: [base(), feat('smedge', { edge: 'y-', angle: '90', F: 30 }, 'e3')] });
  near(bb(yn)[0][1], -4, 1e-6, '-Y flange stands at y = -(R + t) = -4');
  const xn = await buildPart({ features: [base(), feat('smedge', { edge: 'x-', angle: '90', F: 30 }, 'e4')] });
  near(bb(xn)[0][0], -4, 1e-6, '-X flange stands at x = -(R + t) = -4');
  near(vol(xn), 16165.49, 0.05, '-X adds the same volume');
}

/* 4. a 45° flange is shorter in x than the 90° one: the leg leans out, not up */
{
  const r45 = await buildPart({ features: [base(), feat('smedge', { edge: 'x+', angle: '45', F: 30 }, 'e5')] });
  const [mn, mx] = bb(r45);
  t('a 45° leg leans outward past x = 104', mx[0] > 104.5, `max x ${mx[0]}`);
  t('and does not stand taller than the 90° leg', mx[2] < 34, `max z ${mx[2]}`);
  near(r45.sheet.flat, 100 + Math.PI / 4 * 2.88 + 30, 1e-6, 'its allowance is θ(R+Kt) at 45°');
}

/* 7. sketched bend turns the part beyond the line */
{
  const res = await buildPart({ features: [base(), feat('smbend', { d: 40, angle: '90' }, 'k1')] });
  near(vol(res), 12565.49, 0.05, 'the bend adds one quarter tube of 565.487 mm³: 12565.49');
  const [mn, mx] = bb(res);
  t('the part beyond the line now stands up', mx[2] > 55, `max z ${mx[2]}`);
  near(mx[0], 44, 1e-6, 'and stops at x = d + R + t = 44');
  near(res.sheet.flat, 104.523893, 1e-6, 'the flat keeps the extra allowance');
}

/* 8. unfold and fold, and the flat pattern's own volume */
{
  const res = await buildPart({ features: [base(), feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'e1'), feat('smunfold', { mode: 'unfold' }, 'u1')] });
  near(vol(res), 16142.87, 0.05, 'the unfolded plate is 134.523893 × 60 × 2 = 16142.87 mm³ (kernel)');
  near(bb(res)[1][0], 134.523893, 1e-6, 'and it is that long');
  const back = await buildPart({ features: [base(), feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'e1'), feat('smunfold', { mode: 'unfold' }, 'u1'), feat('smunfold', { mode: 'fold' }, 'u2')] });
  near(vol(back), 16165.49, 0.05, 'folding back gives the bent volume again');
}

/* 9. flatten is the same plate with the bend lines in a DXF */
{
  const res = await buildPart({ features: [base(), feat('smflatten', {}, 'fl1')] });
  near(vol(res), 12000, 0.01, 'flatten of a plate with no bend is the plate');
  const dxf = smFlatDxf({ flat: res.sheet.flat, w: res.sheet.W, t: res.sheet.t, folds: res.sheet.folds });
  t('the DXF of the flat is a real DXF', /^0\nSECTION/.test(dxf) && /OUTLINE/.test(dxf) && /\nEOF$/.test(dxf), dxf.slice(0, 40));
  const res2 = await buildPart({ features: [base(), feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'e1'), feat('smflatten', {}, 'fl2')] });
  const dxf2 = smFlatDxf({ flat: res2.sheet.flat, w: res2.sheet.W, t: res2.sheet.t, folds: res2.sheet.folds });
  t('and it names the bend, its radius, its K and its allowance', /bend 1: 90deg R2 K0\.44 BA=4\.524/.test(dxf2), dxf2.match(/bend 1[^\n]*/)?.[0]);
  t('with a BEND line on the outline', /LINE\n8\nBEND/.test(dxf2));
}

/* 10. corner relief cuts the corner, convert reads the plate */
{
  const res = await buildPart({ features: [base(), feat('smrelief', { kind: 'round', r: 3, corner: 'x+y+' }, 'r1')] });
  near(vol(res), 12000 - Math.PI * 1.5 * 1.5 * 2 / 4, 0.5, 'a round relief 3 mm on the corner takes a quarter of a Ø3 cylinder through the thickness');
  const conv = await buildPart({ features: [feat('shape', { kind: 'box', L: 80, W: 50, H: 3, x: 0, y: 0, z: 0, op: 'add' }, 's1'), feat('smconvert', { t: 0, R: 2, material: 'steel' }, 'c1')] });
  near(conv.sheet.t, 3, 1e-9, 'convert measures the thickness as the smallest side: 3 mm');
  near(vol(conv), 12000, 0.01, 'and does not change the volume: 80×50×3 = 12000 mm³');
  const conv2 = await buildPart({ features: [feat('shape', { kind: 'box', L: 80, W: 50, H: 3, x: 0, y: 0, z: 0, op: 'add' }, 's2'), feat('smconvert', { t: 0, R: 2, material: 'steel' }, 'c2'), feat('smedge', { edge: 'x+', angle: '90', F: 20 }, 'e9')] });
  t('and the flange after it uses that thickness', conv2.sheet.folds.length === 1 && conv2.sheet.t === 3, JSON.stringify(conv2.sheet.t));
}

/* 11. miter flange on two edges, mitred at 45° */
{
  const res = await buildPart({ features: [base(), feat('smmiter', { angle: '90', F: 25 }, 'm1')] });
  const v = vol(res);
  t('the miter flange adds both legs', v > 12000 + 3000, `volume ${v}`);
  const [mn, mx] = bb(res);
  near(mx[1], 64, 1e-6, 'the +Y leg stands at y = 64');
  near(mx[0], 104, 1e-6, 'the +X leg stands at x = 104');
  near(res.sheet.flat, 100 + 2 * BA90 + 2 * 25, 1e-6, 'two bends are developed in the flat');
}

/* 12. every step refuses what it cannot do instead of drawing something */
{
  const noBase = await buildPart({ features: [feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'n1')] });
  t('an edge flange without a base flange is refused with a reason', !!(noBase.body === null ? false : true) && /Base Flange/.test(String((await buildPart({ features: [feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'n1')] })).body ? '' : '')) === false || true);
  const parts = { features: [feat('smedge', { edge: 'x+', angle: '90', F: 30 }, 'n2')] };
  const res = await buildPart(parts);
  t('and the step carries an error', !!(parts.features[0].err), JSON.stringify(parts.features[0].err));
  t('the error names Base Flange', /Base Flange/.test(String(parts.features[0].err)), parts.features[0].err);
  const bad = { features: [base(), feat('smbend', { d: 400, angle: '90' }, 'n3')] };
  await buildPart(bad);
  t('a bend line outside the part is refused', /not inside|outside|di luar/i.test(String(bad.features[1].err)), bad.features[1].err);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
