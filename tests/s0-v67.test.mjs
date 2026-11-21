/* v67.1: a feedback round is tied to the code it measured, and an export without a part says so.
 *
 * The shipped functions are lifted out of index.html and run with stubbed network calls, so these
 * tests exercise the code the browser runs, not a copy of it.
 *
 *   node tests/s0-v67.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'index.html', 'utf8');

let pass = 0; const fails = [];
async function check(name, fn) {
  try { await fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fails.push([name, e]); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
function eq(actual, expected, what) { if (actual !== expected) throw new Error(`${what}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`); }
function ok(cond, what) { if (!cond) throw new Error(what); }

/* ---- lift jobFeedback out of the page ------------------------------------- */
const fbA = html.indexOf('async function jobFeedback(job)'), fbB = html.indexOf('async function jobFinish(job)');
if (fbA < 0 || fbB < 0 || fbB < fbA) throw new Error('jobFeedback not found in index.html');
const fbSrc = html.slice(fbA, fbB);
const makeFeedback = (apiJSON) => new Function('L', 'apiJSON', 'jobBuild', 'jobShow', 'PMAT', 'renderJob', 'genSnapshots',
  'feaSolve', 'feaSetup', 'feaContour', 'state', 'genCall', 'stepCode', fbSrc + '\nreturn jobFeedback;')(
  (en) => en, apiJSON, async () => null, () => {}, {}, () => {}, () => [], async () => {}, () => ({}), () => {}, {}, async () => null, () => '');

/* one job, with the code it measured and that code's hash */
const job0 = () => ({ id: 'j1', cad: { code: 'shape A', title: 'bracket', material: 'steel' }, cadHash: 'hash-A',
  waiting: { need: 'browser_build', round: 2 } });

console.log('\nv67.1 · a 409 names the round and the hash');
await check('409 with another waiting_cad_hash clears the old code and does not send it again', async () => {
  const calls = [];
  const jobFeedback = makeFeedback(async (url, body) => { calls.push({ url, body: JSON.parse(JSON.stringify(body)) }); return { status: 409, ok: false, d: { round: 3, waiting_cad_hash: 'hash-B' } }; });
  const job = job0();
  await jobFeedback(job);
  eq(calls.length, 1, 'feedback posts');
  eq(calls[0].body.cad_hash, 'hash-A', 'the hash sent with the measurements');
  eq(job.cad, null, 'job.cad after a newer code is named');
  eq(job.cadHash, 'hash-B', 'job.cadHash follows the solver');
  eq(job.waiting, null, 'the old round is no longer waiting');
  ok(/newer code/.test(job.note || ''), 'note: ' + job.note);
  await jobFeedback(job);
  eq(calls.length, 1, 'posts after the old code was cleared');
});

await check('409 only because the round moved sends the same numbers once more', async () => {
  const bodies = []; let n = 0;
  const jobFeedback = makeFeedback(async (url, body) => { bodies.push(JSON.parse(JSON.stringify(body))); n++;
    return n === 1 ? { status: 409, ok: false, d: { round: 5, waiting_cad_hash: 'hash-A' } } : { status: 200, ok: true, d: {} }; });
  const job = job0();
  await jobFeedback(job);
  eq(bodies.length, 2, 'feedback posts');
  eq(bodies[0].round, 2, 'first round');
  eq(bodies[1].round, 5, 'round after the 409');
  eq(bodies[1].cad_hash, 'hash-A', 'the same code hash');
  eq(job.cad && job.cad.code, 'shape A', 'the code is kept');
  eq(job.retry409, 0, 'the counter is reset after an accepted answer');
});

await check('more than three 409s in a row stop the round with a message', async () => {
  let n = 0;
  const jobFeedback = makeFeedback(async (url, body) => { n++;
    return { status: 409, ok: false, d: { round: +body.round + 1, waiting_cad_hash: body.cad_hash } }; });
  const job = job0();
  await jobFeedback(job);
  eq(n, 4, 'feedback posts (three retries, then stop)');
  eq(job.waiting, null, 'nothing is left waiting');
  ok(/kept refusing/.test(job.note || ''), 'note: ' + job.note);
});

/* ---- lift exportPart out of the page -------------------------------------- */
const exA = html.indexOf('async function exportPart(kind)'), exB = html.indexOf('/* hook into the CAD layout');
if (exA < 0 || exB < 0 || exB < exA) throw new Error('exportPart not found in index.html');
const exSrc = html.slice(exA, exB);
const makeExport = (state, partShape) => {
  const said = [], clicks = [];
  const exportPart = new Function('say', 'para', 'L', 'h', 'document', 'URL', 'state', 'partShape', 'learnMark',
    exSrc + '\nreturn exportPart;')(
    (...blocks) => said.push(blocks.filter(Boolean).join(' ')), (t) => t, (en) => en,
    () => ({ click() { clicks.push('download'); }, remove() {} }),
    { body: { append() {} } }, { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    state, partShape, () => {});
  return { exportPart, said, clicks };
};

console.log('\nv67.1 · export without a part');
await check('an assembly with no part asks for a part instead of throwing on state.part.name', async () => {
  const { exportPart, said } = makeExport({ part: null }, { blobSTEP() { throw new Error('the shape must not be exported here'); } });
  await exportPart('step');
  eq(said.length, 1, 'chat messages');
  ok(/Build or open a part first/.test(said[0]), 'message: ' + said[0]);
});
await check('no part and no shape asks for a part too', async () => {
  const { exportPart, said } = makeExport({ part: null }, null);
  await exportPart('stl');
  eq(said.length, 1, 'chat messages');
  ok(/Build or open a part first/.test(said[0]), 'message: ' + said[0]);
});
await check('a real part still exports', async () => {
  const { exportPart, said, clicks } = makeExport({ part: { name: 'Bracket 1/2' } }, { blobSTEP: () => new Blob(['step']) });
  await exportPart('step');
  eq(said.length, 0, 'no message when a part is open');
  eq(clicks.length, 1, 'download clicks');
});

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const [name, e] of fails) console.log('FAILED: ' + name + ' -> ' + (e && e.message)); process.exit(1); }
