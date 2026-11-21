/* An assembly opened over a built part: no part is open, but the shape of the part built before it is
 * still in memory. Manage → Export STEP / Export STL must answer with a message, not throw
 * "Cannot read properties of null (reading 'name')" in exportPart.
 *
 *   BASE_URL=http://127.0.0.1:3000 node tests/export-empty-assembly.spec.mjs
 *
 * Needs no solver: the part is built by the kernel in the page.
 */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000/index.html';
const { chromium } = await import('playwright');
const browser = await chromium.launch({
  ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.setDefaultTimeout(30000);

const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

const results = [];
const check = (name, fn) => { try { fn(); results.push([true, name]); console.log('  ok   ' + name); } catch (e) { results.push([false, name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (cond, what) => { if (!cond) throw new Error(what); };

await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cv', { state: 'attached', timeout: 60000 });
await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* storage */ } });
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cv', { state: 'attached', timeout: 60000 });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });

const home = page.getByRole('button', { name: 'Open the workspace' });
if (await home.count()) { await home.first().click(); await page.waitForTimeout(900); }

/* one classic part, built by the kernel: the shape form's default box */
const newPart = page.locator('#tree').getByRole('button', { name: 'New part' }).first();
if (!(await newPart.isVisible().catch(() => false))) { await page.locator('#cTree').click().catch(() => {}); await page.waitForTimeout(500); }
await newPart.click({ timeout: 20000 });
await page.waitForSelector('#cadProps .pform', { timeout: 20000 });
await page.getByRole('button', { name: /Add & build/ }).first().click({ timeout: 20000 });
await page.waitForSelector('#cadLeft .pfn', { timeout: 120000 });
await page.waitForTimeout(800);

/* Assembly → Insert Component: the assembly takes the part away, the shape stays */
const tab = (n) => page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-tabs button')].find((y) => y.textContent.trim() === x); if (b) b.click(); }, n);
const tool = (n) => page.evaluate((x) => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((y) => y.textContent.trim() === x); if (b) b.click(); return !!b; }, n);
const snap = () => page.evaluate(() => ({
  part: !!window.__idris.state.part, assy: !!window.__idris.state.assy2,
  chat: document.querySelector('#chat') ? document.querySelector('#chat').innerText : '',
  msgs: document.querySelectorAll('#chat .msg').length,
}));

await tab('Assembly'); await page.waitForTimeout(300);
await page.evaluate(() => { const b = [...document.querySelectorAll('#xrib .xr-t')].find((x) => x.textContent.trim() === 'Insert Component'); if (b) b.click(); });
await page.waitForTimeout(1500);
const asm = await snap();

check('Insert Component opens an assembly with no part open', () => {
  ok(asm.assy, 'assembly is open');
  ok(!asm.part, 'no part is open');
});

for (const name of ['Export STEP', 'Export STL']) {
  await tab('Manage'); await page.waitForTimeout(300);
  const before = await snap(), errs0 = errors.length;
  await tool(name);
  await page.waitForTimeout(900);
  const after = await snap();
  check(`${name} in an empty assembly answers with a message and throws nothing`, () => {
    ok(errors.length === errs0, 'page errors: ' + errors.slice(errs0).join(' | '));
    ok(after.msgs > before.msgs, 'a chat message was added');
    ok(/Build or open a part first/.test(after.chat), 'message: ' + after.chat.split('\n').slice(-3).join(' / '));
  });
}

await page.screenshot({ path: 'docs/s0-export-empty-assembly-1366.png' });
await browser.close();
console.log(`\n${results.filter((r) => r[0]).length} passed, ${results.filter((r) => !r[0]).length} failed`);
if (results.some((r) => !r[0])) process.exit(1);
