/* S23: the ribbon status the page really shows.
 *
 * The RIBBON table is read as it ships, then the status overrides the page applies at load
 * (`set('<tab>:<name>', 'on', '<act>', …)` and the `add(…)` tools) are applied the same way, in file
 * order. This is the state the DOM renders, counted once here so the number in the report is not a
 * second, hand-made count that can drift:
 *
 *   * 144 tools, 142 of them runnable, 2 grey;
 *   * the two grey tools are Topology Optimisation and Drop Test, and both have a solver `planned`
 *     entry the popover quotes word for word (SOLVER_PLANNED);
 *   * the 12 tools that used to be `mk1`/`gb`/`no` in the literal are on, each with the action named
 *     below, and every one of those actions has a dispatcher in index.html;
 *   * no tool is left grey for a reason the code cannot back (a gearbox-only or "not built" state).
 *
 *   node tests/s23-ribbon-status.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');
const tAt = html.indexOf('const T = (n, ic, st');
const tEnd = html.indexOf('const RIB_ALL = ', tAt);
if (tAt < 0 || tEnd < 0) throw new Error('RIBBON table not found in index.html');
const { RIBBON } = new Function(`${html.slice(tAt, tEnd)}\nreturn { RIBBON };`)();

/* the tools as the page has them before the overrides, with their tab */
const all = RIBBON.flatMap(([tab, en, id, groups]) => groups.flatMap(([, tools]) => tools.map((t) => ({ ...t, tab }))));

/* the overrides, in the order the page runs them */
const after = html.slice(tEnd);
for (const m of after.matchAll(/\n\s*set\('([^']+)',\s*'([^']+)',\s*'([^']+)'/g)) {
  const [, key, st, act] = m;
  const [tab, name] = key.includes(':') ? [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)] : [null, key];
  const t = tab ? all.find((x) => x.tab === tab && x.n === name) : all.find((x) => x.n === name);
  if (t) { t.st = st; t.act = act; }
}
/* sim:CFD is renamed in the same block, so the tab has a Pipe Flow tool and no CFD tool */
{
  const ren = /tools\['([a-z]+):([^']+)'\]; if \(t\) \{ t\.n = '([^']+)'/.exec(after);
  if (ren) { const t = all.find((x) => x.tab === ren[1] && x.n === ren[2]); if (t) t.n = ren[3]; }
}
/* tools added by the page after the table (one per add(…) call) */
for (const m of after.matchAll(/\n\s*add\('([^']+)',\s*'[^']*',\s*'([^']+)',\s*'[^']*',\s*'([^']+)'/g)) {
  all.push({ n: m[2], st: 'on', act: m[3], tab: m[1] });
}

let pass = 0; const fails = [];
function check(name, fn) { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
const ok = (c, m) => { if (!c) throw new Error(m || 'expected true'); };
const tool = (n) => all.find((t) => t.n === n);
const grey = () => all.filter((t) => t.st !== 'on').map((t) => t.n).sort();

check('the ribbon holds 144 tools, 142 runnable and 2 grey (the count the DOM shows)', () => {
  ok(all.length === 144, 'tool count is ' + all.length);
  ok(grey().length === 2, 'grey: ' + grey().join(', '));
  ok(all.filter((t) => t.st === 'on').length === 142, 'runnable: ' + all.filter((t) => t.st === 'on').length);
});

check('the only grey tools are Topology Optimisation and Drop Test', () => {
  ok(grey().join('|') === 'Drop Test|Topology Optimisation', 'grey are: ' + grey().join(', '));
});

check('both grey tools have a solver `planned` id for the popover to quote', () => {
  const a = html.indexOf('const SOLVER_PLANNED = {'), b = html.indexOf('};', a);
  const map = html.slice(a, b);
  for (const t of all.filter((x) => x.st !== 'on')) {
    ok(new RegExp('\\b' + t.ic + ':').test(map), `${t.n} (icon ${t.ic}) has no SOLVER_PLANNED entry: ` + map);
  }
  ok(/topology_simp_3d/.test(map) && /drop_test/.test(map), 'the solver ids are not the planned ones');
});

check('the 12 tools that used to be mk1 / gearbox / not-built now run, each with its own action', () => {
  const want = {
    'Insert Component': 'asmInsert', 'Move / Rotate Component': 'asmMove', 'Standard Parts': 'asmBolt', 'Auto Assembly': 'asmAuto',
    'Interference Detection': 'interf', 'Design for Manufacturing': 'dfmPart', 'Thickness Analysis': 'dfmWall',
    Calculators: 'calculators', Buckling: 'buckling', 'Pipe Flow': 'pipeFlow',
  };
  for (const [n, act] of Object.entries(want)) {
    const t = tool(n);
    ok(t, n + ' is not in the ribbon');
    ok(t.st === 'on', `${n} is ${t.st}`);
    ok(t.act === act, `${n} routes to ${String(t.act)}, not ${act}`);
  }
  ok(tool('Topology Optimisation').st !== 'on', 'Topology Optimisation must stay grey');
  ok(tool('Drop Test').st !== 'on', 'Drop Test must stay grey');
});

check('every runnable tool has an action, and every action has a dispatcher in the page', () => {
  const missing = all.filter((t) => t.st === 'on' && !t.act).map((t) => t.n);
  ok(!missing.length, 'no action: ' + missing.join(', '));
  const dead = all.filter((t) => t.st === 'on' && typeof t.act === 'object' && !t.act.part && !t.act.sk).map((t) => t.n);
  ok(!dead.length, 'object action with neither part nor sketch: ' + dead.join(', '));
  const undispatched = all.filter((t) => t.st === 'on' && typeof t.act === 'string' && !new RegExp(`=== '${t.act}'`).test(html)).map((t) => t.n + ' → ' + t.act);
  ok(!undispatched.length, 'no dispatcher: ' + undispatched.join(', '));
});

check('no tool carries a gearbox-only or "not built yet" status any more', () => {
  ok(!all.some((t) => t.st === 'gb' || t.st === 'mk1'), 'a tool is still gb/mk1: ' + all.filter((t) => t.st === 'gb' || t.st === 'mk1').map((t) => t.n).join(', '));
  /* ribWhy keeps a generic sentence for any status a later build may add; what it must never name is a
     product phase or a machine type. */
  const rw = html.indexOf('function ribWhy(t) {');
  const body = html.slice(rw, html.indexOf('\n}\n', rw));
  ok(!/Mark 1|gearbox/i.test(body), 'ribWhy still names Mark 1 or gearbox: ' + body);
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
