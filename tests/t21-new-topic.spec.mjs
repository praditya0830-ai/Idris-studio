/* Studio, 21 Nov evening: a new product starts clean, the design process is visible, and a badge needs a model.
 *
 * The solver is stubbed at /chat so each case is exact:
 *   1  "meja 120x60" -> brief for a table (the card shows it); then "design an airplane concept" with
 *      context_reset -> the table brief is gone, "New design started" is on screen, the new brief is the airplane;
 *   2  three concepts -> the trace lists plan / write 3 concepts / build / measure, and a model is built;
 *   3  an answer that only asks for sizes carries no "Full design" badge;
 *   4  while the solver is writing, the empty workspace shows the size frame and the sentence.
 *
 *   BASE_URL=http://127.0.0.1:3019/index.html node tests/t21-new-topic.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3019/index.html';
const OUT = process.env.OUT || 'docs';
const TAG = process.env.TAG || '1366';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const CONCEPT_CODE = [
  'const p = makeBaseBox(60, 40, 10); return p;',
  'const p = makeBaseBox(70, 30, 12); return p;',
  'const p = makeBaseBox(50, 50, 14); return p;',
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
  args: ['--no-sandbox', '--disable-gpu', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

let turn = 0;
await page.route('**/chat', async (route) => {
  turn++;
  let out;
  if (turn === 1) {
    out = { success: true, intent: 'discuss', answer: 'A table for a workshop. How deep?', route: { route: 'brief', of: 'assembly' },
      brief: { object: 'table', purpose: 'workshop', key_sizes: '1200 x 600' }, questions: [{ id: 'q1', text: 'How deep is the table? (mm)', options: [] }] };
  } else if (turn === 2) {
    out = { success: true, intent: 'discuss', answer: 'An airplane concept. What span?', route: { route: 'brief', of: 'assembly' },
      context_reset: { reason: 'new request is a different product (airplane, the open context was table)', from: 'meja 1200x600', to: 'airplane' },
      brief: { object: 'airplane', purpose: 'concept' }, questions: [{ id: 'q2', text: 'What wingspan? (mm)', options: [] }] };
  } else if (turn === 3) {
    /* three concepts, each a real box the kernel can build */
    out = { success: true, intent: 'discuss', answer: 'Three plate concepts.', fidelity: 'full', route: { route: 'free_design' },
      cad: { title: 'Plate A', code: CONCEPT_CODE[0], params: [], missing: [], expect: [], requirements: null },
      concepts: CONCEPT_CODE.map((c, i) => ({ name: 'Plate ' + 'ABC'[i], idea: 'a plate', ok: true,
        cad: { title: 'Plate ' + 'ABC'[i], code: c, params: [], missing: [], expect: [] } })) };
  } else {
    /* asks for a size, carries a fidelity by mistake: the Studio must not show a design badge */
    out = { success: true, intent: 'discuss', answer: 'How big should the bicycle be?', fidelity: 'full', route: { route: 'brief' },
      brief: { object: 'bicycle' }, missing: [{ k: 'body_dimension', question: 'What are the main outside dimensions — length, width and height? (mm)' }],
      questions: [{ id: 'q3', text: 'What are the main outside dimensions — length, width and height? (mm)', options: [] }] };
  }
  await new Promise((r) => setTimeout(r, turn === 1 ? 1800 : 30));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none'; document.body.classList.remove('at-home'); window.__idris.tools.startPart(); });
await page.waitForTimeout(600);

const send = async (text) => {
  /* the tablet layout can put the send button outside the viewport: set the value and click in the page */
  await page.evaluate((t) => { const i = document.querySelector('#inp'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#send').click(); }, text);
};

console.log('\ntable, then an airplane');
await send('meja 120x60');
await page.waitForTimeout(700);
const waiting = await page.evaluate(() => { const b = document.querySelector('#waitBox'); return b ? { text: b.textContent, frame: !!b.querySelector('.wb-frame') } : null; });
check('the empty workspace shows a size frame and says what is being written while the solver works', () => { ok(waiting, 'no waitBox'); ok(waiting.frame, 'no frame'); ok(/writing the design/i.test(waiting.text), waiting.text); });
await page.waitForFunction(() => /table/i.test((document.querySelector('#briefCard') || {}).textContent || ''), null, { timeout: 15000 });
const t1 = await page.evaluate(() => (document.querySelector('#briefCard') || {}).textContent || '');
check('the table brief card exists after the first sentence', () => ok(/table/i.test(t1), t1.slice(0, 160)));
check('and the waiting frame is gone once the answer is in', () => page.evaluate(() => !document.querySelector('#waitBox')).then((v) => ok(v, 'the frame stayed')))

await send('design an airplane concept');
await page.waitForFunction(() => /New design started/.test(document.body.innerText), null, { timeout: 15000 });
const after = await page.evaluate(() => ({ note: document.querySelector('#newDesignNote') ? document.querySelector('#newDesignNote').textContent : '', card: (document.querySelector('#briefCard') || {}).textContent || '', cardHidden: !!(document.querySelector('#briefCard') || {}).hidden }));
check('a new product shows "New design started"', () => ok(/New design started/.test(after.note), after.note));
check('the old table brief is gone and the card is not showing it', () => ok(!/table/i.test(after.card) || after.cardHidden, after.card.slice(0, 160)));
check('the reason names both objects', () => ok(/airplane/.test(after.note) && /table/.test(after.note), after.note));
await page.screenshot({ path: `${OUT}/t21-new-topic-${TAG}.png` });

console.log('\nthree concepts');
await send('design 3 plate concepts');
await page.waitForSelector('.think.trace', { timeout: 15000 });
const trace = await page.evaluate(() => [...document.querySelectorAll('.think.trace .steps li')].map((li) => li.textContent.trim()));
check('the trace lists plan, write 3 concepts, build, measure', () => {
  ok(trace.length >= 4, JSON.stringify(trace));
  ok(/Plan/.test(trace[0]) && /Write 3 concepts/.test(trace[1]) && /Build/.test(trace[2]) && /Measure/.test(trace[3]), JSON.stringify(trace));
});
await page.waitForFunction(() => !!window.__idris.viewer.model, null, { timeout: 90000 });
check('a model is built and shown', () => page.evaluate(() => !!window.__idris.viewer.model).then((v) => ok(v, 'no model')));
const built = await page.evaluate(() => {
  const p = window.__idris.state.part, g = p && p.gen;
  return g && g.variants ? g.variants.map((v) => v.status) : [];
});
check('the concepts are built one after another in the kernel', () => ok(built.filter((x) => x === 'built').length >= 1, JSON.stringify(built)));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/t21-trace-${TAG}.png` });

console.log('\na question with a fidelity but no model');
turn = 100;
await page.evaluate(() => { window.__idris.tools.startPart(); });
await page.waitForTimeout(300);
await send('buatkan design konsep sepeda');
await page.waitForFunction(() => /New design started|How big/.test(document.body.innerText), null, { timeout: 15000 });
const badge = await page.evaluate(() => ({ full: /Full design/.test(document.body.innerText), note: /No model yet/.test(document.body.innerText) }));
check('no "Full design" badge when the answer only asks for sizes', () => ok(!badge.full, 'the badge is on screen'));
check('and the answer says why there is no badge', () => ok(badge.note, 'the note is missing'));
await page.screenshot({ path: `${OUT}/t21-no-badge-${TAG}.png` });

console.log(`\n${pass} passed, ${fails.length} failed, ${errors.length} page errors`);
if (errors.length) console.log(errors.slice(0, 6).join('\n'));
await browser.close();
process.exit(fails.length || errors.length ? 1 : 0);
