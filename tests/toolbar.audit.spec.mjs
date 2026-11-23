/* Toolbar audit (S11), from the UI team's check: every tab and every tool, in two states.
 *
 *   A  empty workspace
 *   B  a classic part: box 60×40×20 with a Ø6.6 hole at x = 15
 *
 * For each click it records what happened: a dialog, a popover, the left panel changing, a new
 * chat message, a download, a file picker, or NOTHING. It fails when
 *   - the page throws (pageerror or console error), or
 *   - a tool that is not grey (aria-disabled) does NOTHING in state B.
 *
 * Run it against a served checkout with the solver reachable for the tools that ask it:
 *
 *   npm i -D playwright && npx playwright install chromium
 *   BASE_URL=http://127.0.0.1:3000/index.html node tests/toolbar.audit.spec.mjs
 *
 * It writes tests/toolbar-audit.json and prints one line per tool. Solver-backed tools (Report,
 * Working Drawings…) need the engine; without it they answer with an error, which is recorded.
 */
import { writeFileSync } from 'node:fs';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000/index.html';
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(8000);

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });

/* the home screen sits over the CAD layout; close it and start an empty part */
async function enterCad(part) {
  await page.evaluate((p) => {
    const h = document.querySelector('#home'); if (h) h.style.display = 'none';
    document.body.classList.remove('at-home');
    if (p) { window.__idris.state.part = p; window.__idris.tools.startPart(p); } else { window.__idris.state.part = null; window.__idris.tools.startPart(); }
  }, part);
  await page.waitForTimeout(1200);
}
const tabNames = () => page.evaluate(() => [...document.querySelectorAll('#xrib .xr-tabs button')].map((b) => b.textContent.trim()).filter((t) => !/Hide toolbar|Focus/.test(t)));
const clickTab = async (n) => { await page.evaluate((x) => [...document.querySelectorAll('#xrib .xr-tabs button')].find((b) => b.textContent.trim() === x).click(), n); await page.waitForTimeout(250); };
const tools = () => page.evaluate(() => [...document.querySelectorAll('#xrib .xr-t')].map((b) => ({ name: b.textContent.trim(), grey: b.getAttribute('aria-disabled') === 'true' })));
const snapshot = () => page.evaluate(() => ({
  chat: document.querySelectorAll('#chat .msg').length,
  dialogs: [...document.querySelectorAll('.libdlg,.ribpop,#drawdlg,#bomdlg,#expoDlg,#sectdlg')].map((d) => d.id || d.className).join(','),
  left: (document.querySelector('#cadLeft') || {}).textContent || '',
  props: (document.querySelector('#cadProps') || {}).textContent || '',
  /* S15: the Properties section shares the Edit page, and several tools open their own page there */
  edit: (document.querySelector('#lppEdit') || {}).textContent || '',
}));

async function audit(stateName, part) {
  await enterCad(part);
  const out = [];
  for (const tab of await tabNames()) {
    /* the part is made again at every tab: the Assembly tab takes the part away, and every tab after it
       would otherwise be audited with no part (the UI team's audit does the same) */
    if (part) await enterCad(part);
    await clickTab(tab);
    const list = await tools();
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.grey && stateName === 'B') continue;            /* grey tools are allowed to do nothing */
      const before = await snapshot();
      let download = false, picker = false;
      page.once('download', () => { download = true; });
      page.once('filechooser', () => { picker = true; });
      await clickTab(tab);
      const buttons = await tools();
      if (!buttons[i]) continue;
      await page.evaluate((n) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === n); if (b) b.click(); }, buttons[i].name);
      await page.waitForTimeout(900);
      const after = await snapshot();
      const did = [];
      if (after.dialogs !== before.dialogs) did.push('dialog:' + after.dialogs);
      if (after.props !== before.props) did.push('panel');
      if (after.edit !== before.edit) did.push('edit page');
      if (after.left !== before.left) did.push('left panel');
      if (after.chat !== before.chat) did.push('chat');
      if (download) did.push('download');
      if (picker) did.push('file picker');
      out.push({ state: stateName, tab, tool: t.name, grey: t.grey, did: did.length ? did.join(' + ') : 'NOTHING' });
      /* close whatever opened so the next tool starts clean */
      await page.keyboard.press('Escape');
      await page.evaluate(() => { for (const d of document.querySelectorAll('.libdlg,#drawdlg,#bomdlg,#expoDlg,#sectdlg')) d.remove(); const p = document.querySelector('#ribpop'); if (p) p.remove(); });
      await page.waitForTimeout(120);
    }
  }
  return out;
}

const A = await audit('A', null);
const B = await audit('B', { name: 'Part1', material: 'steel', features: [
  { id: 'a', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  { id: 'b', type: 'hole', p: { type: 'simple', D: 6.6, depthMode: 'thru', depth: 10, x: 15, y: 0 } },
] });

/* C  an assembly opened over a built part: no part is open, but that part's shape is still in memory.
 *    Insert Component must open the assembly, and Manage → Export STEP / Export STL must answer with a
 *    message instead of throwing on state.part.name. */
async function auditC() {
  const out = [];
  await enterCad({ name: 'Part1', material: 'steel', features: [
    { id: 'a', type: 'shape', p: { kind: 'box', L: 60, W: 40, H: 20, x: 0, y: 0, z: 0, op: 'add' } },
  ] });
  await page.getByRole('button', { name: /Add & build/ }).first().click({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2000);            /* the kernel builds the part asynchronously */
  await clickTab('Assembly');
  await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Insert Component'); if (b) b.click(); });
  await page.waitForTimeout(1200);
  const open = await page.evaluate(() => ({ part: !!window.__idris.state.part, assy: !!window.__idris.state.assy2 }));
  out.push({ state: 'C', tab: 'Assembly', tool: 'Insert Component', grey: false, did: open.assy && !open.part ? 'assembly opened, no part' : 'NOTHING' });
  await clickTab('Manage');
  for (const name of ['Export STEP', 'Export STL']) {
    const before = await snapshot(), errs0 = errors.length;
    await page.evaluate((n) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === n); if (b) b.click(); }, name);
    await page.waitForTimeout(900);
    const after = await snapshot();
    const did = errors.length > errs0 ? 'page error' : after.chat !== before.chat ? 'chat' : 'NOTHING';
    out.push({ state: 'C', tab: 'Manage', tool: name, grey: false, did });
    await page.keyboard.press('Escape');
  }
  return out;
}

const C = await auditC();

const rows = [...A, ...B, ...C];
writeFileSync(new URL('./toolbar-audit.json', import.meta.url), JSON.stringify({ url: BASE_URL, when: new Date().toISOString(), rows }, null, 2));
for (const r of rows) console.log(`${r.state}  ${r.tab.padEnd(16)} ${r.tool.padEnd(28)} ${r.grey ? 'grey' : 'run '}  ${r.did}`);

const nothing = rows.filter((r) => r.state === 'B' && !r.grey && r.did === 'NOTHING');
const nothingC = rows.filter((r) => r.state === 'C' && r.did === 'NOTHING');
const failed = errors.length || nothing.length || nothingC.length;
console.log(`\n${rows.length} clicks · ${nothing.length} active tools did nothing · ${nothingC.length} empty-assembly steps did nothing · ${errors.length} page errors`);
if (nothing.length) console.log('NOTHING: ' + nothing.map((r) => r.tab + ' → ' + r.tool).join('; '));
if (nothingC.length) console.log('NOTHING (C): ' + nothingC.map((r) => r.tab + ' → ' + r.tool).join('; '));
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
