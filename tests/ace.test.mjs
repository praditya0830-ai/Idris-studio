/* Tests for the S11-ACE concept fixes in index.html.
 *
 * The shipped functions are lifted out of index.html and run here against a
 * stubbed fetch, so this covers the code the browser runs: one chat call at a
 * time, 429/Retry-After and 502/503/timeouts retried once, a friendly message
 * instead of "NetworkError", and the kernel's reason in cad_error.
 *
 *   node tests/ace.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

const START = 'let conceptChatQ = Promise.resolve();';
const END = '\nasync function conceptFix(p, v, error, kernel) {';
const a = html.indexOf(START);
if (a < 0) throw new Error('conceptChatQ not found in index.html');
/* take conceptChatOnce + conceptFix + conceptBuildReason: up to conceptPipeline */
const tail = html.indexOf('async function conceptPipeline', a);
if (tail < 0) throw new Error('conceptPipeline not found in index.html');
const src = html.slice(a, tail).replace(/\/\* S11-ACE-1[\s\S]*?\*\//, '');

const L = (en) => en;
const API = 'http://solver';
const genParamsFromCad = () => [];
const make = () => new Function('API', 'L', 'genParamsFromCad', 'AbortController', 'fetch',
  `${src}\nreturn { conceptFix, conceptBuildReason, conceptChatOnce };`)(API, L, genParamsFromCad, AbortController, globalThis.fetch);

let pass = 0; const fails = [];
async function check(name, fn) { try { await fn(); pass++; console.log('  ok   ' + name); } catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
function eq(actual, expected, what) { if (actual !== expected) throw new Error(`${what || 'value'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
function ok(cond, what) { if (!cond) throw new Error(what || 'expected true'); }
const realSetTimeout = globalThis.setTimeout;
const fast = () => { globalThis.setTimeout = (fn) => realSetTimeout(fn, 0); };
const restore = () => { globalThis.setTimeout = realSetTimeout; };

const res = (status, body, headers) => ({ status, ok: status >= 200 && status < 300, headers: { get: (k) => (headers || {})[k.toLowerCase()] || null }, text: async () => JSON.stringify(body), json: async () => body });
const cad = (code) => ({ cad: { code } });
const variant = () => ({ name: 'Tube frame', concept: { idea: 'two tubes' }, code: 'old()', params: [{ k: 'len', v: 200, unit: 'mm', src: 'default' }], fixes: 0, status: 'building' });

const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));

await (async () => {
  await check('429 with Retry-After is waited out and retried once, then the fix lands', async () => {
    fast();
    const seen = []; let n = 0;
    globalThis.fetch = async () => { seen.push(++n); return n === 1 ? res(429, { detail: 'rate limit' }, { 'retry-after': '1' }) : res(200, cad('fixed()')); };
    const m = make(), v = variant();
    await m.conceptFix({ gen: { request: 'drone frame' } }, v, 'not a solid');
    eq(seen.length, 2, 'chat calls'); eq(v.code, 'fixed()', 'fixed code'); restore();
  });
  await check('503 twice fails with a friendly message, not NetworkError', async () => {
    fast();
    let n = 0; globalThis.fetch = async () => { n++; return res(503, { detail: 'down' }); };
    const m = make(), v = variant();
    let msg = '';
    try { await m.conceptFix({ gen: {} }, v, 'not a solid'); } catch (e) { msg = e.message; }
    ok(/Retry fix/.test(msg), 'message names Retry fix: ' + msg);
    ok(!/NetworkError/.test(msg), 'no raw NetworkError: ' + msg);
    eq(n, 2, 'retried exactly once'); restore();
  });
  await check('a dropped connection is retried once and succeeds', async () => {
    fast();
    let n = 0; globalThis.fetch = async () => { if (++n === 1) throw new TypeError('NetworkError when attempting to fetch resource.'); return res(200, cad('fixed()')); };
    const m = make(), v = variant();
    await m.conceptFix({ gen: {} }, v, 'not a solid');
    eq(n, 2, 'chat calls'); eq(v.code, 'fixed()', 'fixed code'); restore();
  });
  await check('concepts never fix at the same time (one chat call in flight)', async () => {
    fast();
    let active = 0, peak = 0, n = 0;
    globalThis.fetch = async () => { active++; peak = Math.max(peak, active); n++; await wait(10); active--; return res(200, cad('fixed()')); };
    const m = make();
    await Promise.all([m.conceptFix({ gen: {} }, variant(), 'x'), m.conceptFix({ gen: {} }, variant(), 'x'), m.conceptFix({ gen: {} }, variant(), 'x')]);
    eq(n, 3, 'chat calls'); eq(peak, 1, 'peak concurrent calls'); restore();
  });
  await check('the kernel reason for two separate solids is sent in cad_error', async () => {
    const m = make();
    const why = m.conceptBuildReason({ valid: true, solids: 2, vol: 100 });
    ok(/2 separate solids/.test(why), 'names the solid count: ' + why);
    ok(/do not touch/.test(why), 'says the shapes do not touch: ' + why);
    eq(m.conceptBuildReason({ valid: true, solids: 1 }), '', 'one valid solid has no reason');
    eq(m.conceptBuildReason({ valid: false, solids: 1 }).includes('invalid solid'), true, 'invalid solid is named');
  });
  await check('a 200 without code is an error, not an empty fix', async () => {
    fast();
    globalThis.fetch = async () => res(200, { answer: 'sorry' });
    const m = make(), v = variant();
    let msg = ''; try { await m.conceptFix({ gen: {} }, v, 'x'); } catch (e) { msg = e.message; }
    ok(/sorry/.test(msg), 'carries the solver answer: ' + msg); restore();
  });
})();

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) process.exit(1);
