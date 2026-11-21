/* S8: the compression -> buckling offer.
 *
 * The rule and the prefill are lifted out of index.html and run here, so the test covers the code that ships:
 *   * compression wins only when the most compressive principal stress is larger than the tensile one, the load
 *     resultant is not zero, and the solver reported both principals;
 *   * the member length offered is the part's extent along the load axis;
 *   * the prefill copies length and material and leaves the section and end conditions empty.
 *
 *   node tests/s8-buckling-hint.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const grab = (start, name) => {
  const i = html.indexOf(start);
  if (i < 0) throw new Error('not found: ' + start);
  const j = html.indexOf('\n}\n', i);
  return html.slice(i, j + 3);
};
const catAt = html.indexOf('const catNum = ');
const src = [html.slice(catAt, html.indexOf('\n', catAt)), grab('function feaCompression(', 'feaCompression'), grab('function buckPrefill(', 'buckPrefill'),
  'return { feaCompression, buckPrefill };'].join('\n');
const made = [];
const { feaCompression, buckPrefill } = new Function('savePart', 'bucklingTool', src + '\n//# sourceURL=s8.js')(() => made.push('save'), () => made.push('open'));

let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what || 'value'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what || 'value'}: ${a} vs ${b}`); };

const B = [[0, 0, 0], [40, 40, 120]];
const F = (fx, fy, fz) => [{ fx, fy, fz }];

check('compression dominant with a downward load → offer, length is the Z extent', () => {
  const r = feaCompression({ max_principal_mpa: 5, min_principal_mpa: -40 }, F(0, 0, -5000), B);
  eq(r.compression, true);
  eq(r.axis, 'Z'); eq(r.load_N, -5000); near(r.lax, 120, 1e-9, 'lax');
});

check('tension dominant → no offer', () => {
  const r = feaCompression({ max_principal_mpa: 40, min_principal_mpa: -5 }, F(0, 0, 5000), B);
  eq(r.compression, false);
});

check('equal principals (pure shear-like) → no offer', () => {
  eq(feaCompression({ max_principal_mpa: 20, min_principal_mpa: -20 }, F(0, 0, -1000), B).compression, false);
});

check('solver reported no principals → no offer, no invented number', () => {
  const r = feaCompression({ max_von_mises_mpa: 30 }, F(0, 0, -1000), B);
  eq(r.compression, false); eq(r.s3, null); eq(r.s1, null);
});

check('load resultant zero (self-equilibrated pair) → no offer, no length', () => {
  const r = feaCompression({ max_principal_mpa: 5, min_principal_mpa: -40 }, [{ fx: 0, fy: 0, fz: -5000 }, { fx: 0, fy: 0, fz: 5000 }], B);
  eq(r.compression, false); eq(r.lax, null);
});

check('dominant load along X → axis X and the X extent', () => {
  const r = feaCompression({ max_principal_mpa: 2, min_principal_mpa: -30 }, F(-800, 0, -100), B);
  eq(r.axis, 'X'); near(r.lax, 40, 1e-9, 'lax'); eq(r.load_N, -800);
});

check('no bounds → offer still says compression, but no length to copy', () => {
  const r = feaCompression({ max_principal_mpa: 1, min_principal_mpa: -9 }, F(0, 0, -100), null);
  eq(r.compression, true); eq(r.lax, null);
});

check('prefill copies length (rounded) and material, saves and opens the dialog', () => {
  made.length = 0;
  const p = { material: 'steel', buck: { sec: 'rect', left: 'pinned' } };
  buckPrefill(p, 120.0004);
  eq(p.buck.L, '120'); eq(p.buck.mat, 'steel'); eq(p.buck.pre, 'part');
  eq(p.buck.sec, 'rect', 'engineer section kept as it was'); eq(p.buck.left, 'pinned');
  ok(made.includes('save') && made.includes('open'), 'must save and open: ' + made.join(','));
});

check('prefill works on a part with no buck state yet', () => {
  const p = { material: 'aluminium' };
  buckPrefill(p, 57.5);
  eq(p.buck.L, '57.5'); eq(p.buck.D, undefined); eq(p.buck.right, undefined);
});

check('the screen has the one-line hint and the chip to open buckling', () => {
  ok(html.includes('This part is in compression: check buckling of the member'), 'hint line missing');
  ok(html.includes("L('Check buckling of the member', 'Cek tekuk batangnya')"), 'chip missing');
  ok(html.includes('The mesh is not used for the buckling number.'), 'the "not from the mesh" line missing');
  ok(html.includes("st.pre === 'part' ?"), 'the prefill note in the buckling dialog is missing');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
