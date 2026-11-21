/* S12 toolbar tests: the ribbon has one runnable tool per job, and every runnable tool has an action.
 *
 * The RIBBON table is lifted out of index.html and evaluated as it ships, so a duplicate or an
 * action-less "on" tool fails here before it reaches the audit.
 *
 *   node tests/s12.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const a = html.indexOf('const T = (n, ic, st');
const b = html.indexOf('const RIB_ALL =', a);
if (a < 0 || b < 0) throw new Error('RIBBON table not found in index.html');
const src = html.slice(a, b);
const { RIBBON } = new Function(`${src}\nreturn { RIBBON };`)();
const all = RIBBON.flatMap(([tab, en, id, groups]) => groups.flatMap(([g, tools]) => tools.map((t) => ({ ...t, tab, tabEn: en }))));

let pass = 0; const fails = [];
function check(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };

check('no two runnable tools share a name', () => {
  const seen = new Map();
  for (const t of all.filter((x) => x.st === 'on')) {
    const prev = seen.get(t.n);
    /* B10 asks for the same Draft Analysis in Mold and Evaluate: one function, two doors. */
    if (prev) ok(prev.act === t.act && t.n === 'Draft Analysis', `duplicate runnable tool "${t.n}" (${prev.tabEn} and ${t.tabEn})`);
    seen.set(t.n, t);
  }
});
check('every runnable tool has an action (it can never answer NOTHING)', () => {
  const bad = all.filter((t) => t.st === 'on' && !t.act).map((t) => t.n + ' (' + t.tabEn + ')');
  ok(bad.length === 0, 'no action: ' + bad.join(', '));
});
check('the gearbox-only Part Stress duplicate is gone; Static Stress routes both', () => {
  ok(!all.some((t) => t.n === 'Part Stress (FEA)'), 'Part Stress (FEA) is still a separate tool');
  const s = all.find((t) => t.n === 'Static Stress (FEA)');
  ok(s && s.act === 'stressAny', 'Static Stress (FEA) must route with stressAny');
});
check('the Drawing duplicate is gone; Working Drawings (A3) routes the part drawing', () => {
  ok(!all.some((t) => t.n === 'Part Drawing'), 'Part Drawing is still a separate tool');
  const w = all.find((t) => t.n === 'Working Drawings (A3)');
  ok(w && w.act === 'drawingAny', 'Working Drawings (A3) must route with drawingAny');
});
check('Bearing Life is open for a part and routes to the S4 calculator', () => {
  const b2 = all.find((t) => t.n === 'Bearing Life & Fatigue');
  ok(b2, 'tool missing'); ok(b2.st === 'on', 'must be runnable, not gearbox-only'); ok(b2.act === 'bearingAny', 'action must be bearingAny');
  ok(/ISO 281/.test(html) && /bearing_life_iso281/.test(html), 'the panel must call /solve/bearing_life_iso281');
});
check('no visible status chips are left (Active / Gearbox / Mark 1 / Not yet)', () => {
  ok(!/xr-legend/.test(html), '.xr-legend is still in the page');
  ok(!/T\('Active'/.test(html), 'an Active chip is still rendered');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
