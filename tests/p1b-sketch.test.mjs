/* P1b: sketch correction.
 *
 * The shipped proposals and their fixes are lifted out of index.html and run on the same entities the
 * sketch dialog builds, so what these tests check is the code that runs in the browser:
 *   * a line 2° off horizontal is proposed horizontal, and lands at exactly 0.0°;
 *   * a dimension the engineer typed (length 40) is still 40 after the fix;
 *   * two endpoints 0.3 mm apart are joined; equal, parallel and perpendicular are proposed and applied;
 *   * clean geometry produces no proposals, and proposing never moves anything by itself.
 *
 *   node tests/p1b-sketch.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const a = html.indexOf('/* ---- P1a:');
const b = html.indexOf('/* ---- end P1b helpers */');
if (a < 0 || b < 0 || b < a) throw new Error('P1a/P1b helpers not found in index.html');
const src = html.slice(a, b);

const L = (en) => en;
const P1 = new Function('L', `${src}\nreturn { p1Solve, p1bProposals, p1bApply, p1bAngle, p1Length, p1Start, p1End };`)(L);
const { p1Solve, p1bProposals, p1bApply, p1bAngle, p1Length } = P1;

let pass = 0, fail = 0;
const t = (name, ok, detail = '') => { if (ok) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); } };
const near = (x, y, tol = 1e-6) => Math.abs(x - y) <= tol;
const line = (id, ax, ay, bx, by) => ({ id, t: 'line', a: [ax, ay], b: [bx, by] });
const of = (list, kind, id) => list.find((p) => p.kind === kind && (!id || p.e === id)) || null;
const fix = (ents, prop, dims = [], rels = []) => p1Solve(p1bApply(ents, prop), rels, dims);

/* 1. a line 2 degrees off horizontal -> proposed horizontal, applied at exactly 0 */
{
  const e = [line('l1', 0, 0, 40 * Math.cos(2 * Math.PI / 180), 40 * Math.sin(2 * Math.PI / 180))];
  const props = p1bProposals(e);
  const p = of(props, 'horizontal', 'l1');
  t('2° line gets a horizontal proposal', !!p, JSON.stringify(props.map((x) => x.kind)));
  const before = p1bAngle(e[0]);
  t('proposal does not move the line', near(p1bAngle(e[0]), before, 1e-12));
  const out = fix(e, p);
  t('accepted: angle is 0.0°', near(p1bAngle(out[0]), 0, 1e-9), p1bAngle(out[0]).toFixed(6));
  t('accepted: length is kept (40 mm)', near(p1Length(out[0]), 40, 1e-9), p1Length(out[0]).toFixed(6));
  t('accepted: start point stays put', near(out[0].a[0], 0, 1e-12) && near(out[0].a[1], 0, 1e-12));
}

/* 2. the engineer's dimension wins: length 40 stays 40 after the correction */
{
  const e = [line('l1', 0, 0, 39.5 * Math.cos(2 * Math.PI / 180), 39.5 * Math.sin(2 * Math.PI / 180))];
  const dims = [{ t: 'length', e: ['l1'], value: 40 }];
  const p = of(p1bProposals(e, [], dims), 'horizontal', 'l1');
  const out = fix(e, p, dims);
  t('locked length: proposal still offered for the angle', !!p);
  t('locked length: angle 0.0°', near(p1bAngle(out[0]), 0, 1e-9), p1bAngle(out[0]).toFixed(6));
  t('locked length: typed 40 mm is still 40 mm', near(p1Length(out[0]), 40, 1e-9), p1Length(out[0]).toFixed(6));
}

/* 3. vertical within 3 degrees */
{
  const e = [line('v1', 0, 0, 30 * Math.sin(2.5 * Math.PI / 180), 30 * Math.cos(2.5 * Math.PI / 180))];
  const p = of(p1bProposals(e), 'vertical', 'v1');
  t('87.5° line gets a vertical proposal', !!p);
  const out = fix(e, p);
  t('accepted: vertical is exactly 90.0°', near(Math.abs(p1bAngle(out[0])), 90, 1e-9), p1bAngle(out[0]).toFixed(6));
}

/* 4. two endpoints 0.3 mm apart are joined, and a locked length blocks the join */
{
  const e = [line('a', 0, 0, 20, 0), line('b', 20.3, 0.0, 20.3, 10)];
  const p = of(p1bProposals(e), 'join', 'b');
  t('0.3 mm gap gets a join proposal', !!p, JSON.stringify(p1bProposals(e).map((x) => x.kind)));
  const out = fix(e, p);
  const bOut = out.find((x) => x.id === 'b');
  t('accepted: the endpoints meet', near(bOut.a[0], 20, 1e-9) && near(bOut.a[1], 0, 1e-9));
  const dims = [{ t: 'length', e: ['b'], value: 10 }];
  t('a typed length blocks the join (no proposal)', !of(p1bProposals(e, [], dims), 'join', 'b'));
}

/* 5. equal length, only when no typed size would be lost */
{
  const e = [line('a', 0, 0, 20, 0), line('b', 0, 5, 20.3, 5)];
  const p = of(p1bProposals(e), 'equal', 'b');
  t('20 vs 20.3 mm gets an equal proposal', !!p);
  const out = fix(e, p);
  t('accepted: both are 20.00 mm', near(p1Length(out[1]), 20, 1e-9), p1Length(out[1]).toFixed(6));
  t('a dimension on either line blocks equal', !of(p1bProposals(e, [], [{ t: 'length', e: ['a'], value: 20 }]), 'equal'));
}

/* 6. parallel and perpendicular */
{
  const par = [line('a', 0, 0, 30, 0), line('b', 0, 10, 30 * Math.cos(2 * Math.PI / 180), 10 + 30 * Math.sin(2 * Math.PI / 180))];
  const pp = of(p1bProposals(par), 'parallel', 'b');
  t('2° of parallel gets a parallel proposal', !!pp);
  const parOut = fix(par, pp);
  t('accepted: parallel is 0.0° apart', near(Math.abs(p1bAngle(parOut[0]) - p1bAngle(parOut[1])), 0, 1e-9));
  const per = [line('a', 0, 0, 30, 0), line('b', 0, 0, 30 * Math.cos(88 * Math.PI / 180), 30 * Math.sin(88 * Math.PI / 180))];
  const pq = of(p1bProposals(per), 'perpendicular', 'b');
  t('88° gets a perpendicular proposal', !!pq);
  const perOut = fix(per, pq);
  const diff = Math.abs(Math.abs(p1bAngle(perOut[0]) - p1bAngle(perOut[1])) - 90);
  t('accepted: perpendicular is 90.0°', near(diff, 0, 1e-9), diff.toFixed(9));
}

/* 7. clean geometry: no proposals, nothing touched */
{
  const clean = [line('a', 0, 0, 40, 0), line('b', 40, 0, 40, 25)];
  t('a clean L-shape gets no proposals', p1bProposals(clean).length === 0, JSON.stringify(p1bProposals(clean).map((x) => x.kind)));
  const props = p1bProposals(clean);
  t('proposing never changes the entity list', JSON.stringify(clean).length > 0 && props.length === 0 && clean[0].b[1] === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
