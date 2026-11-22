/* Studio, doc 2 (21 Nov evening, "brief lupa topik"): while a brief is open every message carries the brief.
 *
 * The failure: "design snow plow …" asked its questions, then the "+ add" chip sent only "add: …", the brief was not
 * sent with it, and the solver answered with the gearbox requirements. Here the solver is stubbed at /chat, so the
 * request bodies decide:
 *   1  "design a snow plow for a pickup truck" -> a brief with questions and one suggestion;
 *   2  the "+ add" chip -> context.brief is the snow plow brief, context.brief_turn is true, and
 *      context.brief_answer is {type: "add", suggestion_id: "s1"}; the card lists the feature as added;
 *   3  "why is a replaceable edge better?" -> still the same brief and brief_turn, no brief_answer, and the brief
 *      survives the answer (the card still shows the feature).
 *
 * This test is about the chat panel and the brief card, not the 3D view: no part is started, so the WebGL renderer is
 * not part of what is being checked here.
 *
 *   BASE_URL=http://127.0.0.1:3021/index.html node tests/t21b-brief.spec.mjs
 */
import { chromium } from '/tmp/pw2/node_modules/playwright/index.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3021/index.html';
const VP = process.env.VP ? JSON.parse(process.env.VP) : { width: 1366, height: 768 };
let pass = 0; const fails = [];
const check = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } };
const ok = (c, what) => { if (!c) throw new Error(what); };

const EDGE = 'Use a replaceable cutting edge on the bottom of the blade';
const BRIEF = { object: 'snow plow', purpose: 'clear snow from a pickup truck', kind: 'assembly',
  constraints: 'pick up truck, electric actuator, straight blade', asked: true, ready: false };

const browser = await chromium.launch({
  executablePath: process.env.CHROME || (process.env.HOME + '/.cache/ms-playwright/chromium-1187/chrome-linux/chrome'),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: VP });
page.setDefaultTimeout(90000);
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

const sent = [];
let turn = 0;
await page.route('**/chat', async (route) => {
  turn++;
  let body = null; try { body = route.request().postDataJSON(); } catch (e) { body = null; }
  sent.push(body);
  let out;
  if (turn === 1) {
    out = { success: true, intent: 'discuss', answer: 'A snow plow for a pickup truck. How wide is the blade?',
      route: { route: 'brief', of: 'assembly' }, brief: BRIEF,
      questions: [{ id: 'q1', text: 'How wide is the blade?', options: [{ label: 'Matches the truck', note: 'legal width' }] }],
      suggestions: [{ id: 's1', text: EDGE, why: 'the wear part is cheap' }] };
  } else if (turn === 2) {
    out = { success: true, intent: 'discuss', answer: 'Added. How wide is the blade?', route: { route: 'brief', of: 'assembly' },
      brief: { ...BRIEF, features: [{ text: EDGE, from: 'suggested' }], suggested: [{ id: 's1', text: EDGE }] },
      questions: [{ id: 'q1', text: 'How wide is the blade?', options: [{ label: 'Matches the truck', note: 'legal width' }] }],
      suggestions: [{ id: 's1', text: EDGE, why: 'the wear part is cheap' }] };
  } else {
    out = { success: true, intent: 'discuss', answer: 'A replaceable edge wears instead of the blade, so the blade lasts longer.',
      route: { route: 'brief', of: null }, brief: { ...BRIEF, features: [{ text: EDGE, from: 'suggested' }] } };
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
});

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__idris, null, { timeout: 60000 });
await page.evaluate(() => { const h = document.querySelector('#home'); if (h) h.style.display = 'none';
  document.body.classList.remove('at-home'); document.body.classList.add('cad'); });
await page.waitForTimeout(600);

const send = async (text) => {
  await page.evaluate((t) => { const i = document.querySelector('#inp'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#send').click(); }, text);
};
/* every DOM question is asked inside the page: `document` does not exist in this Node process */
const dom = (fn, arg) => page.evaluate(fn, arg);
const cardText = () => dom(() => { const c = document.querySelector('#briefCard'); return c && !c.hidden ? c.textContent : ''; });
const chipCount = () => dom(() => document.querySelectorAll('.bsg .chip').length);
const ctx = (i) => ((sent[i] || {}).context) || {};

console.log('\nchat panel');
const ui = await dom(() => ({ inp: !!document.querySelector('#inp'), send: !!document.querySelector('#send') }));
check('the chat panel is on screen', () => { ok(ui.inp, 'no #inp'); ok(ui.send, 'no #send'); });

console.log('\nsnow plow brief');
await send('design a snow plow for a pickup truck');
await page.waitForFunction(() => /snow plow/i.test((document.querySelector('#briefCard') || {}).textContent || ''), null, { timeout: 20000 });
const card1 = await cardText(); const chips = await chipCount();
check('the brief card is open for the snow plow', () => { ok(/snow plow/i.test(card1), card1.slice(0, 120)); ok(chips >= 2, 'no suggestion chips: ' + chips); });
check('the first message carries no brief (there is none yet)', () => ok(!(ctx(0).brief), 'a brief was sent before it existed'));

console.log('\nthe "+ add" chip');
await page.click('.bsg .chip');
await page.waitForFunction(() => /Added/i.test((document.querySelector('#briefCard') || {}).textContent || ''), null, { timeout: 20000 });
check('the chip sends the brief, brief_turn and the suggestion id', () => {
  const c = ctx(1);
  ok(c.brief && /snow plow/i.test(JSON.stringify(c.brief)), 'context.brief missing: ' + JSON.stringify(c).slice(0, 200));
  ok(c.brief_turn === true, 'context.brief_turn is not true');
  ok(c.brief_answer && c.brief_answer.type === 'add' && c.brief_answer.suggestion_id === 's1', JSON.stringify(c.brief_answer));
  ok(/^add: /i.test(String((sent[1] || {}).message || '')), String((sent[1] || {}).message));
});
const card2 = await cardText();
check('the card lists the feature as added, with the engineer words', () => {
  ok(/Added/i.test(card2), card2.slice(0, 160));
  ok(card2.includes(EDGE), 'feature text missing from the card');
});

console.log('\na question while the brief is open');
await send('why is a replaceable edge better?');
await page.waitForFunction(() => /wears instead of the blade/i.test(document.querySelector('#chat').textContent), null, { timeout: 20000 });
check('the question still carries the brief, and no chip answer', () => {
  const c = ctx(2);
  ok(c.brief && (c.brief.features || []).some((f) => f.text === EDGE), 'the feature was dropped from the brief');
  ok(c.brief_turn === true, 'context.brief_turn is not true');
  ok(!c.brief_answer, 'a stale brief_answer travelled with the question');
});
const card3 = await cardText();
check('the brief survives the answer: the card still shows the feature', () => {
  ok(card3, 'the card was hidden by an answer');
  ok(card3.includes(EDGE), 'the feature left the card');
});
check('no page error', () => ok(errors.length === 0, errors.join(' | ')));

/* the screenshot the PR links: the card with the added feature, the answer and the chips around it */
if (process.env.SHOT) { await page.screenshot({ path: process.env.SHOT, fullPage: false }); console.log('  shot ' + process.env.SHOT); }

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) console.log('FAILED: ' + fails.join(', '));
await browser.close();
process.exit(fails.length ? 1 : 0);
