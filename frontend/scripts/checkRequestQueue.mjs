import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

/**
 * Guards the pacing that keeps a page's burst of requests from killing itself.
 *
 * A page here does not make a request, it makes a burst: the finance centre
 * opens with a Promise.all of ~25 and the admin dashboard with ~40. Over HTTP/3
 * every one of them leaves at once and they all start their timeout clock
 * together, so a per-request deadline silently becomes a whole-page deadline —
 * none of them is slow, yet they all expire at the same moment and each expiry
 * fires retries back into the same jam. That is what took the live site down:
 * every section reported "انترنت یا سرور کند است" after 15–25 seconds while the
 * backend was answering normally.
 *
 * Three properties fix it, and all of them are easy to undo by accident, so they
 * are checked here rather than left to a code review:
 *   1. no more than MAX_CONCURRENT_REQUESTS are ever on the wire at once;
 *   2. the time a request spends waiting its turn is not charged to its
 *      timeout — otherwise capping concurrency would just move the failure;
 *   3. identical reads issued together share one request — a slot spent on a
 *      copy of an answer already arriving is a slot the rest of the page waits
 *      for.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const EXPECTED_CONCURRENCY = 6;

let failures = 0;
const logPass = (message) => console.log(`PASS  ${message}`);
const logFail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};

/* ------------------------------------------------------------------ *
 * Load apiClient outside Vite
 * ------------------------------------------------------------------ */

// apiClient's only import is the Vite-specific config module, which reads
// import.meta.env and therefore cannot be loaded by plain node. Swapping that
// one line for a constant is the whole adaptation — the code under test is
// otherwise the file that ships.
const source = fs.readFileSync(path.join(rootDir, 'src/utils/apiClient.js'), 'utf8');
const patched = source.replace(
  /^import \{ API_BASE \} from '\.\.\/config\/api';$/m,
  "const API_BASE = 'https://test.invalid';"
);
if (patched === source) {
  logFail('could not stub the API_BASE import — has apiClient.js changed its import line?');
  process.exit(1);
}

const tempFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apiclient-')), 'apiClient.mjs');
fs.writeFileSync(tempFile, patched);

const declared = Number(/const MAX_CONCURRENT_REQUESTS = (\d+);/.exec(source)?.[1] || 0);
if (declared !== EXPECTED_CONCURRENCY) {
  logFail(`MAX_CONCURRENT_REQUESTS is ${declared || 'missing'}, expected ${EXPECTED_CONCURRENCY}`);
} else {
  logPass(`concurrency cap is declared as ${EXPECTED_CONCURRENCY}`);
}

globalThis.window = { localStorage: { getItem: () => null }, addEventListener: () => {} };
// node defines navigator itself, as a getter-only property.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { apiFetch } = await import(pathToFileURL(tempFile).href);

/* ------------------------------------------------------------------ *
 * A fetch that reports how many calls are in flight at once
 * ------------------------------------------------------------------ */

let live = 0;
let peak = 0;
let responseDelayMs = 50;

globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
  live += 1;
  peak = Math.max(peak, live);

  const settle = (fn, value) => {
    live -= 1;
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    fn(value);
  };
  const onAbort = () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    settle(reject, error);
  };
  const timer = setTimeout(() => settle(resolve, {
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
    clone() { return this; }
  }), responseDelayMs);

  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
});

/* ------------------------------------------------------------------ *
 * 1. a burst never puts more than the cap on the wire
 * ------------------------------------------------------------------ */

const BURST = 30;
responseDelayMs = 50;
peak = 0;

const burst = await Promise.allSettled(
  Array.from({ length: BURST }, (_, i) => apiFetch(`/api/burst/${i}`))
);
const rejected = burst.filter((r) => r.status === 'rejected');

if (peak > EXPECTED_CONCURRENCY) {
  logFail(`a burst of ${BURST} put ${peak} requests on the wire at once, cap is ${EXPECTED_CONCURRENCY}`);
} else if (peak < EXPECTED_CONCURRENCY) {
  logFail(`a burst of ${BURST} only reached ${peak} concurrent requests — the queue is throttling too hard`);
} else {
  logPass(`a burst of ${BURST} requests held at ${peak} on the wire`);
}

if (rejected.length) {
  logFail(`${rejected.length}/${BURST} requests in the burst failed: ${rejected[0].reason?.message}`);
} else {
  logPass(`all ${BURST} requests in the burst resolved`);
}

/* ------------------------------------------------------------------ *
 * 2. queued time is not charged to the timeout
 * ------------------------------------------------------------------ */

// Twelve requests, six at a time, each answering in 800ms: the second wave is
// dispatched ~800ms after the caller asked for it and answers ~1600ms after.
// With a 1200ms timeout it survives only if its clock starts when the request
// is sent. This is the half of the fix that is invisible until the cap exists:
// a cap whose clock still starts at the call would not remove the whole-page
// deadline, only rename it.
const QUEUED = 12;
responseDelayMs = 800;
peak = 0;

const queued = await Promise.allSettled(
  Array.from({ length: QUEUED }, (_, i) => apiFetch(`/api/queued/${i}`, { timeoutMs: 1200, retry: false }))
);
const timedOut = queued.filter((r) => r.status === 'rejected');

if (timedOut.length) {
  logFail(
    `${timedOut.length}/${QUEUED} queued requests timed out (${timedOut[0].reason?.kind}) — `
    + 'the wait for a slot is being charged to the request timeout'
  );
} else {
  logPass(`all ${QUEUED} requests survived waiting their turn behind a full wire`);
}

/* ------------------------------------------------------------------ *
 * 3. no failure path leaks a slot
 * ------------------------------------------------------------------ */

// The failure mode a queue introduces is worse than the one it fixes: a slot
// that is taken and never handed back removes capacity permanently, and six of
// those freeze every request in the app forever, with no error and no retry.
// So drive each way a request can end badly, then prove the wire is still
// fully open afterwards.
responseDelayMs = 20;

const aborted = new AbortController();
const failureModes = [
  apiFetch('/api/fail/network', { retry: false }),
  apiFetch('/api/fail/server-500', { retry: false }),
  apiFetch('/api/fail/client-400', { retry: false }),
  apiFetch('/api/fail/retried-500'),
  apiFetch('/api/fail/timeout', { timeoutMs: 1, retry: false }),
  apiFetch('/api/fail/caller-abort', { signal: aborted.signal, retry: false }),
  apiFetch('/api/fail/write-500', { method: 'POST', body: '{}' })
];
aborted.abort();

const failing = globalThis.fetch;
globalThis.fetch = (url, options) => {
  if (String(url).includes('/network')) return Promise.reject(new TypeError('Failed to fetch'));
  if (String(url).includes('500')) {
    return Promise.resolve({
      ok: false, status: 500, json: async () => ({ message: 'boom' }), clone() { return this; }
    });
  }
  if (String(url).includes('400')) {
    return Promise.resolve({
      ok: false, status: 400, json: async () => ({ message: 'no' }), clone() { return this; }
    });
  }
  return failing(url, options);
};

await Promise.allSettled(failureModes);
globalThis.fetch = failing;

// Everything above failed; if any of it kept its slot, this burst cannot reach
// the cap — and if all six leaked, it would hang here instead of finishing.
responseDelayMs = 50;
peak = 0;
const after = await Promise.allSettled(
  Array.from({ length: 12 }, (_, i) => apiFetch(`/api/after-failures/${i}`))
);
const stillFailing = after.filter((r) => r.status === 'rejected');

if (peak !== EXPECTED_CONCURRENCY || stillFailing.length) {
  logFail(
    `after ${failureModes.length} failed requests the wire only reached ${peak}/${EXPECTED_CONCURRENCY} `
    + `(${stillFailing.length}/12 follow-up requests failed) — a failure path is leaking its slot`
  );
} else {
  logPass(`${failureModes.length} failure paths all handed their slot back`);
}

/* ------------------------------------------------------------------ *
 * 4. identical reads in flight together share one request
 * ------------------------------------------------------------------ */

// A page does not only make too many requests, it makes the same one twice: the
// app shell and the page it frames both want the school's name and logo, so
// /api/settings/public, /api/school-websites/public and /api/afghan-schools/active
// were each fetched twice on every load. Under the cap above that is not merely
// waste — the copy holds a slot another section of the page is queued behind.
//
// So identical reads that overlap must share one request, while everything that
// is NOT interchangeable must stay separate: a write, a read carrying someone's
// abort signal, a different URL, and the same read issued again after the first
// finished. And because a response body can be read only once, every caller of a
// shared read still has to get a body of its own.

// A body that can be consumed once, like the real thing, so a caller handed
// somebody else's already-read response fails here rather than in the browser.
const singleUseResponse = (payload) => {
  let used = false;
  return {
    ok: true,
    status: 200,
    async json() {
      if (used) throw new TypeError('body stream already read');
      used = true;
      return payload;
    },
    clone() {
      if (used) throw new TypeError('cannot clone a response whose body was already read');
      return singleUseResponse(payload);
    }
  };
};

let calls = [];
globalThis.fetch = (url, options = {}) => new Promise((resolve, reject) => {
  calls.push(String(url));
  const onAbort = () => {
    clearTimeout(timer);
    const error = new Error('aborted');
    error.name = 'AbortError';
    reject(error);
  };
  const timer = setTimeout(() => {
    options.signal?.removeEventListener('abort', onAbort);
    resolve(singleUseResponse({ success: true, from: String(url) }));
  }, 60);
  if (options.signal?.aborted) onAbort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
});

const countOf = (suffix) => calls.filter((url) => url.endsWith(suffix)).length;

// 4a. the duplicate the home page actually made, in its actual shape
calls = [];
const twins = await Promise.all(
  Array.from({ length: 8 }, () => apiFetch('/api/settings/public'))
);
if (countOf('/api/settings/public') !== 1) {
  logFail(`8 identical reads made ${countOf('/api/settings/public')} requests, expected 1`);
} else if (twins.some((body) => body?.success !== true)) {
  logFail('a caller that joined a shared read did not get the body');
} else {
  logPass('8 identical concurrent reads shared one request and all got the body');
}

// 4b. every one of them gets a body it may read itself
calls = [];
const raw = await Promise.all(
  Array.from({ length: 4 }, () => apiFetch('/api/school-websites/public?slug=&lang=fa', {
    parse: 'response', rejectOnHttpError: false
  }))
);
const parsed = await Promise.allSettled(raw.map((res) => res.json()));
const unreadable = parsed.filter((result) => result.status === 'rejected');
if (calls.length !== 1) {
  logFail(`4 identical parse:'response' reads made ${calls.length} requests, expected 1`);
} else if (unreadable.length) {
  logFail(
    `${unreadable.length}/4 callers could not read their own response body `
    + `(${unreadable[0].reason?.message}) — a shared response is being handed out uncloned`
  );
} else {
  logPass('4 callers of one shared read each got a readable body');
}

// 4c. everything that is not interchangeable stays its own request
calls = [];
const aborting = new AbortController();
const abortable = apiFetch('/api/report', { signal: aborting.signal, retry: false });
const bystander = apiFetch('/api/report');
aborting.abort();
const [abandoned, survivor] = await Promise.allSettled([abortable, bystander]);

await Promise.allSettled([
  apiFetch('/api/one'),
  apiFetch('/api/two'),
  apiFetch('/api/save', { method: 'POST', body: '{}' }),
  apiFetch('/api/save', { method: 'POST', body: '{}' }),
  apiFetch('/api/opt-out'),
  apiFetch('/api/opt-out', { dedupe: false })
]);
// Nothing is remembered after a request settles, so asking again is a real ask.
await apiFetch('/api/one');

const separate = [
  ['a read carrying an abort signal', countOf('/api/report') === 2],
  ['two different URLs', countOf('/api/one') === 2 && countOf('/api/two') === 1],
  ['two identical writes', countOf('/api/save') === 2],
  ['an explicit dedupe: false', countOf('/api/opt-out') === 2]
].filter(([, ok]) => !ok);

if (separate.length) {
  logFail(`these were wrongly shared: ${separate.map(([name]) => name).join(', ')}`);
} else if (survivor.status !== 'fulfilled') {
  logFail('aborting one read killed a second caller reading the same URL');
} else if (abandoned.status !== 'rejected') {
  logFail('an aborted read resolved anyway');
} else {
  logPass('writes, aborted reads, other URLs and dedupe: false all stayed separate');
}

fs.rmSync(path.dirname(tempFile), { recursive: true, force: true });

if (failures) {
  console.error(`\nRequest queue check failed with ${failures} problem(s).`);
  process.exit(1);
}
console.log('\nRequest queue check completed successfully.');
