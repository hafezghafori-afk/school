import { API_BASE } from '../config/api';

// Single entry point for every network call in the app. Before this existed the
// raw fetch() call sites each decided on their own whether to show a spinner,
// whether to surface an error, and whether to give up — which in practice meant
// a dead server, a slow link and a restarting backend all looked identical to
// the user: a blank page with nothing moving on it. Everything here exists to
// make that state visible and recoverable.

// Both timeouts are measured from the moment the request is actually sent, not
// from the moment the caller asked for it — see the dispatch queue below for
// why the difference matters.
export const DEFAULT_TIMEOUT_MS = 25000;
// Writes get longer than reads: saving a term's grades or closing a finance
// month legitimately takes more than twenty-five seconds, and cutting one off
// early is far worse than waiting — see TIMEOUT_UNSAFE below.
export const DEFAULT_MUTATION_TIMEOUT_MS = 45000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [600, 1800];
// Ceiling on one apiFetch call including its retries, counted from its first
// dispatch. Without it, three consecutive timeouts on a hanging server would
// keep a page waiting indefinitely — long enough that the retries become the
// very "nothing is happening" problem they exist to solve.
const TOTAL_BUDGET_MS = 60000;

// How many requests may be on the wire at once, app-wide.
//
// A page here does not make a request, it makes a burst of them: the finance
// centre opens with a Promise.all of ~25 and the admin dashboard with ~40. HTTP
// used to pace those itself — six connections per host, the rest queued by the
// browser — but the site is served over HTTP/3 now, so all forty leave at once,
// share one link and one single-threaded backend, and each one's clock starts
// at the same instant. At that point a per-request timeout is really a
// whole-page deadline: not one of them is slow, yet they all expire together,
// and each expiry fires two retries into the same jam. That is precisely how a
// page that merely took a while to load became a page that never loads at all.
//
// Six is the pacing the transport used to give us for free. It turns a burst
// into a few quick waves, so every individual request comfortably beats its own
// timeout, and it keeps a retry from ever stacking on top of the traffic that
// caused it.
const MAX_CONCURRENT_REQUESTS = 6;

// Error kinds, most specific first. The banner and every DataState render off
// these, so the user is told which of the very different failures happened
// instead of a single useless "خطا".
export const ERROR_KINDS = {
  OFFLINE: 'offline',
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  // A write whose answer never arrived. Deliberately separate from TIMEOUT:
  // the request may well have been carried out on the server, so telling the
  // user to "just try again" is how a school ends up with the same payment
  // recorded twice.
  TIMEOUT_UNSAFE: 'timeout_unsafe',
  DB_DOWN: 'db_down',
  STARTING: 'starting',
  SERVER: 'server',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CLIENT: 'client'
};

const MESSAGES = {
  [ERROR_KINDS.OFFLINE]: 'ارتباط انترنتی شما قطع است. پس از وصل‌شدن، دوباره تلاش کنید.',
  [ERROR_KINDS.NETWORK]: 'سرور در دسترس نیست. ممکن است خاموش باشد یا انترنت شما ضعیف باشد.',
  [ERROR_KINDS.TIMEOUT]: 'پاسخ سرور بیش از حد طول کشید. انترنت کند است یا سرور مصروف است.',
  [ERROR_KINDS.TIMEOUT_UNSAFE]: 'پاسخ سرور نرسید و معلوم نیست این عملیات ثبت شده یا نه. پیش از تلاشِ دوباره، فهرست را تازه کنید و ببینید ثبت شده است یا خیر.',
  [ERROR_KINDS.DB_DOWN]: 'سرور فعال است اما دیتابیس در دسترس نیست. لطفاً چند لحظه بعد دوباره تلاش کنید.',
  [ERROR_KINDS.STARTING]: 'سرور در حال آماده‌سازی است. به‌صورت خودکار دوباره تلاش می‌کنیم.',
  [ERROR_KINDS.SERVER]: 'در سرور خطایی رخ داد. لطفاً دوباره تلاش کنید.',
  [ERROR_KINDS.UNAUTHORIZED]: 'نشست شما منقضی شده است. لطفاً دوباره وارد شوید.',
  [ERROR_KINDS.FORBIDDEN]: 'شما اجازهٔ دیدن این بخش را ندارید.',
  [ERROR_KINDS.NOT_FOUND]: 'این اطلاعات یافت نشد.',
  [ERROR_KINDS.CLIENT]: 'درخواست پذیرفته نشد.'
};

// Kinds worth trying again on their own: the request never reached a healthy
// backend, so repeating it cannot duplicate any work.
const RETRYABLE_KINDS = new Set([
  ERROR_KINDS.NETWORK,
  ERROR_KINDS.TIMEOUT,
  ERROR_KINDS.DB_DOWN,
  ERROR_KINDS.STARTING,
  ERROR_KINDS.SERVER
]);

export class ApiError extends Error {
  constructor({ kind, status = 0, serverMessage = '', url = '', body = null }) {
    const message = serverMessage || MESSAGES[kind] || MESSAGES[ERROR_KINDS.SERVER];
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.url = url;
    // The parsed error body, for the call sites that need more than the message
    // — a timetable clash reads `conflictType` to say which side collided.
    this.body = body;
    // The generic sentence for this kind, kept separate from `message` so a
    // caller can show the backend's own wording and still know the category.
    this.kindMessage = MESSAGES[kind] || MESSAGES[ERROR_KINDS.SERVER];
    this.retryable = RETRYABLE_KINDS.has(kind);
  }
}

export const isApiError = (value) => value instanceof ApiError;

export const describeError = (error) => {
  if (isApiError(error)) return error.message;
  if (error?.name === 'AbortError') return MESSAGES[ERROR_KINDS.TIMEOUT];
  return error?.message || MESSAGES[ERROR_KINDS.SERVER];
};

// Kinds where the user needs the cause, not just "it failed" — the difference
// between "your internet dropped" and "the database is unreachable" decides
// whether they retry now, wait, or call someone.
const CONNECTION_KINDS = new Set([
  ERROR_KINDS.OFFLINE,
  ERROR_KINDS.NETWORK,
  ERROR_KINDS.TIMEOUT,
  ERROR_KINDS.TIMEOUT_UNSAFE,
  ERROR_KINDS.DB_DOWN,
  ERROR_KINDS.STARTING
]);

/**
 * Message for a failed action: keeps the caller's "what you were doing" wording
 * and appends why it failed, so a save that dies on a dead server no longer
 * reads the same as one the backend rejected on its merits.
 */
export const failureMessage = (error, fallback = 'عملیات ناموفق بود.') => {
  if (isApiError(error) && CONNECTION_KINDS.has(error.kind)) {
    return `${fallback} ${error.message}`;
  }
  return describeError(error) || fallback;
};

/* ------------------------------------------------------------------ *
 * Request activity — drives the top progress bar
 * ------------------------------------------------------------------ */

let inFlight = 0;
const activityListeners = new Set();

const emitActivity = () => {
  activityListeners.forEach((listener) => {
    try {
      listener(inFlight);
    } catch {
      // a broken listener must never break the request itself
    }
  });
};

export const subscribeToRequestActivity = (listener) => {
  activityListeners.add(listener);
  listener(inFlight);
  return () => activityListeners.delete(listener);
};

/* ------------------------------------------------------------------ *
 * Connection status — drives the global banner
 * ------------------------------------------------------------------ */

export const CONNECTION = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  SERVER_DOWN: 'server_down',
  DB_DOWN: 'db_down',
  STARTING: 'starting',
  SLOW: 'slow',
  CHECKING: 'checking'
};

let connectionState = {
  status: CONNECTION.CHECKING,
  message: '',
  checkedAt: null,
  latencyMs: null
};

const connectionListeners = new Set();

const setConnection = (next) => {
  const merged = { ...connectionState, ...next, checkedAt: new Date().toISOString() };
  const unchanged = merged.status === connectionState.status && merged.message === connectionState.message;
  connectionState = merged;
  if (unchanged) return;
  connectionListeners.forEach((listener) => {
    try {
      listener(connectionState);
    } catch {
      // ignore listener errors
    }
  });
};

export const getConnectionState = () => connectionState;

export const subscribeToConnection = (listener) => {
  connectionListeners.add(listener);
  listener(connectionState);
  return () => connectionListeners.delete(listener);
};

// Map the outcome of a real request onto the banner. Passive detection like
// this beats polling: the banner reacts to the very request the user is
// waiting on, not to a health check that may be half a minute stale.
const reportOutcome = (error, latencyMs) => {
  if (!error) {
    setConnection({ status: CONNECTION.ONLINE, message: '', latencyMs });
    return;
  }
  const map = {
    [ERROR_KINDS.OFFLINE]: CONNECTION.OFFLINE,
    [ERROR_KINDS.NETWORK]: CONNECTION.SERVER_DOWN,
    [ERROR_KINDS.TIMEOUT]: CONNECTION.SLOW,
    [ERROR_KINDS.TIMEOUT_UNSAFE]: CONNECTION.SLOW,
    [ERROR_KINDS.DB_DOWN]: CONNECTION.DB_DOWN,
    [ERROR_KINDS.STARTING]: CONNECTION.STARTING
  };
  const status = map[error.kind];
  // A 4xx from a reachable, healthy backend says nothing about the connection.
  if (status) setConnection({ status, message: error.message, latencyMs: null });
};

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => setConnection({
    status: CONNECTION.OFFLINE,
    message: MESSAGES[ERROR_KINDS.OFFLINE]
  }));
  window.addEventListener('online', () => setConnection({ status: CONNECTION.CHECKING, message: '' }));
}

/* ------------------------------------------------------------------ *
 * apiFetch
 * ------------------------------------------------------------------ */

// The id the legacy single-school deployments used; it identifies no real
// school, so sending it would scope a request to nothing.
const LEGACY_SINGLE_SCHOOL_ID = '000000000000000000000001';

const readStoredSchoolId = () => {
  try {
    return ['schoolId', 'school_id', 'selectedSchoolId']
      .map((key) => String(window.localStorage.getItem(key) || '').trim())
      .find((value) => /^[a-f\d]{24}$/i.test(value) && value !== LEGACY_SINGLE_SCHOOL_ID) || '';
  } catch {
    return '';
  }
};

// Which school the admin is working in is ambient session context, exactly like
// the token: the finance dashboard answers 400 «مکتب فعال را انتخاب کنید»
// without it. It used to be attached by hand in the few pages that needed it,
// which meant any call site that forgot — or that had its headers folded away —
// silently lost its scope. Sending it from here makes that impossible.
const getAuthHeaders = () => {
  try {
    const token = window.localStorage.getItem('token');
    const schoolId = readStoredSchoolId();
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(schoolId ? { 'X-School-Id': schoolId } : {})
    };
  } catch {
    return {};
  }
};

const buildUrl = (path = '') => {
  const text = String(path || '');
  if (/^https?:\/\//i.test(text)) return text;
  return `${API_BASE}${text.startsWith('/') ? '' : '/'}${text}`;
};

// `keepBody` reads a clone, so a caller that opted out of the throw still gets
// an untouched response to parse itself while the banner keeps learning that
// e.g. this 503 was the database rather than the server.
const classifyResponse = async (res, url, { keepBody = false } = {}) => {
  const source = keepBody ? res.clone() : res;
  const body = await source.json().catch(() => ({}));
  const serverMessage = String(body?.message || '').trim();

  let kind = ERROR_KINDS.SERVER;
  if (res.status === 401) kind = ERROR_KINDS.UNAUTHORIZED;
  else if (res.status === 403) kind = ERROR_KINDS.FORBIDDEN;
  else if (res.status === 404) kind = ERROR_KINDS.NOT_FOUND;
  else if (res.status === 503 && body?.starting === true) kind = ERROR_KINDS.STARTING;
  // requireDatabase answers 503 with database.connected === false when Mongo is
  // gone; that is a very different story for the user than "server is down",
  // and the backend already words it correctly — we just have to carry it.
  else if (res.status === 503 && body?.database?.connected === false) kind = ERROR_KINDS.DB_DOWN;
  else if (res.status >= 500) kind = ERROR_KINDS.SERVER;
  else if (res.status >= 400) kind = ERROR_KINDS.CLIENT;

  return new ApiError({ kind, status: res.status, serverMessage, url, body });
};

const classifyThrow = (url, timedOut, isSafeMethod) => {
  if (timedOut) {
    return new ApiError({
      kind: isSafeMethod ? ERROR_KINDS.TIMEOUT : ERROR_KINDS.TIMEOUT_UNSAFE,
      url
    });
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return new ApiError({ kind: ERROR_KINDS.OFFLINE, url });
  }
  return new ApiError({ kind: ERROR_KINDS.NETWORK, url });
};

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/* ------------------------------------------------------------------ *
 * Dispatch queue — keeps a page's burst from starving itself
 * ------------------------------------------------------------------ */

let activeRequests = 0;
const waitingForSlot = [];

// Resolves once there is room on the wire. A slot is taken per attempt rather
// than per apiFetch call, so the pauses between retries hand the wire to
// someone else instead of sitting on it.
const acquireSlot = (priority = false) => {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    // A write is something the user just pressed; a read is usually a page
    // filling itself in. Making a save wait behind forty background reads
    // would only trade one kind of "nothing is happening" for another.
    if (priority) waitingForSlot.unshift(resolve);
    else waitingForSlot.push(resolve);
  });
};

const releaseSlot = () => {
  const next = waitingForSlot.shift();
  // Hand the slot straight to the next caller rather than freeing and
  // re-taking it, so a queued request cannot be overtaken by a fresh one.
  if (next) next();
  else activeRequests = Math.max(0, activeRequests - 1);
};

// A caller that gave up while queued — an unmounted page, a superseded search —
// still takes its turn, but its already-aborted signal makes fetch reject on the
// spot, so it hands the slot back without ever touching the network.

const combineSignals = (external, own) => {
  if (!external) return own;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([external, own]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (external.aborted || own.aborted) controller.abort();
  external.addEventListener('abort', abort, { once: true });
  own.addEventListener('abort', abort, { once: true });
  return controller.signal;
};

/* ------------------------------------------------------------------ *
 * In-flight read dedupe — one answer, however many callers want it
 * ------------------------------------------------------------------ */

// Two components asking the same question at the same moment do not need two
// requests; they need one answer, twice. That used to be merely wasteful, but
// with the wire capped above it is also slow: the copy occupies a slot some
// other section of the page is queued behind. The home page opened by fetching
// each of its three settings routes twice — the app shell and the page it
// frames each asked on their own — so a third of the wire went on bytes that
// were already arriving.
//
// So an identical read that arrives while the first one is still on the wire
// joins it instead of starting its own. Reads only, and only while in flight:
// nothing is remembered once the response lands, so this can hand a caller a
// concurrent answer but never a stale one.
const inFlightReads = new Map();

// Anything that could make two calls want different answers keeps them apart,
// so a shared request can never answer a question its caller did not ask:
// `parse` and `rejectOnHttpError` decide what comes back, the timeout and the
// retry budget decide how long it may take, and `auth` decides whether the
// session is carried at all. Matching URLs alone is not enough.
const readKey = ({ method, url, parse, rejectOnHttpError, retriesAllowed, effectiveTimeout, auth, headers }) => JSON.stringify([
  method, url, parse, rejectOnHttpError, retriesAllowed, effectiveTimeout, auth,
  // Header names are case-insensitive and unordered; the key must not be.
  Object.entries(headers)
    .map(([name, value]) => [String(name).toLowerCase(), value])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
]);

const parseBody = (res, parse, handedBack) => {
  // A 4xx the caller opted to handle itself has always come back as the raw
  // Response whatever `parse` says — its body is the verdict the backend
  // reached, for the caller to read.
  if (handedBack || parse === 'response') return res;
  if (parse === 'none' || res.status === 204) return null;
  if (parse === 'text') return res.text();
  if (parse === 'blob') return res.blob();
  return res.json().catch(() => ({}));
};

// A response body can be read only once, so every caller after the first gets a
// clone. All of them have to be taken before anyone starts reading, which is
// why the cloning happens here, as the shared promise resolves, rather than
// being left to each caller.
const shareRead = (key, send, parse) => {
  const joined = inFlightReads.get(key);
  if (joined) {
    joined.callers += 1;
    return joined.promise.then(({ res, handedBack }) => parseBody(res.clone(), parse, handedBack));
  }
  const entry = { callers: 1, promise: send() };
  inFlightReads.set(key, entry);
  // Forgotten the moment it settles, so a caller arriving afterwards starts a
  // real request instead of being handed a finished one.
  const forget = () => { inFlightReads.delete(key); };
  entry.promise.then(forget, forget);
  return entry.promise.then(({ res, handedBack }) => parseBody(entry.callers > 1 ? res.clone() : res, parse, handedBack));
};

/**
 * Fetch an API route with a timeout, automatic retries and a Persian error.
 *
 * Resolves with the parsed JSON body, or throws an ApiError carrying `kind`,
 * `status` and a message that is already safe to render.
 *
 * Retries are limited to GET/HEAD by default: repeating a POST in a system that
 * records payments could book the same amount twice, so an unsafe method is
 * only retried when the caller opts in with `retry: true`. Writes also get the
 * longer timeout and, if they do time out, an error that says the operation may
 * have gone through rather than inviting a blind second attempt.
 */
export const apiFetch = async (path, options = {}) => {
  const {
    method = 'GET',
    timeoutMs,
    retry,
    signal: externalSignal,
    auth = true,
    parse = 'json',
    headers = {},
    // Callers that do their own status handling opt out of the throw and get
    // the Response back, while still keeping the timeout, the retries and the
    // connection reporting.
    //
    // This opt-out covers 4xx only. A 4xx is the backend understanding the
    // request and rejecting it, so its body is the page's own verdict to read.
    // A 5xx carries no verdict at all, and a page's `if (!data.success)` branch
    // cannot tell the two apart — it would dress a crashed request up in
    // whatever wording that branch uses for a rejected one. Server errors
    // therefore always throw and land in the catch as what they are.
    rejectOnHttpError = true,
    // Internal: lets the banner's own health probe skip the queue. It is the
    // one request whose whole job is to answer "is anything getting through
    // right now", so making it wait behind the traffic it is diagnosing would
    // tell us about the queue instead of about the server.
    bypassQueue = false,
    // Opt out of joining an identical read that is already on the wire, for a
    // caller that genuinely has to observe the server a second time.
    dedupe = true,
    ...rest
  } = options;

  const url = buildUrl(path);
  const isSafeMethod = ['GET', 'HEAD'].includes(String(method).toUpperCase());
  const retriesAllowed = retry === false ? 0 : ((retry === true || isSafeMethod) ? MAX_RETRIES : 0);
  const effectiveTimeout = timeoutMs ?? (isSafeMethod ? DEFAULT_TIMEOUT_MS : DEFAULT_MUTATION_TIMEOUT_MS);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const offline = new ApiError({ kind: ERROR_KINDS.OFFLINE, url });
    reportOutcome(offline);
    throw offline;
  }

  // One trip to the network with the queue, the timeout and the retries around
  // it. Resolves with the response — plus whether it is a 4xx the caller asked
  // to read itself — and throws an ApiError for anything else. Reading the body
  // is left to the caller above, because a shared read has more than one.
  const send = async () => {
    // Set when the first attempt actually leaves the queue. Time spent waiting
    // for a turn is not time the server was slow, so neither the timeout nor the
    // budget below may be spent on it — otherwise the twenty-fifth request of a
    // burst would be declared a failure for the crime of going last.
    let dispatchedAt = 0;
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 0; attempt <= retriesAllowed; attempt += 1) {
      if (!bypassQueue) await acquireSlot(!isSafeMethod);
      if (!dispatchedAt) dispatchedAt = Date.now();

      const controller = new AbortController();
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, effectiveTimeout);

      try {
        const res = await fetch(url, {
          ...rest,
          method,
          signal: combineSignals(externalSignal, controller.signal),
          headers: {
            Accept: 'application/json',
            ...(auth ? getAuthHeaders() : {}),
            ...headers
          }
        });

        if (res.ok) {
          reportOutcome(null, Date.now() - dispatchedAt);
          return { res, handedBack: false };
        }

        // Classify either way — that is what tells the banner a 503 was the
        // database rather than the server — but read a clone when the caller
        // wants to parse the body itself.
        const handsBack = !rejectOnHttpError && res.status < 500;
        lastError = await classifyResponse(res, url, { keepBody: handsBack });
        if (handsBack) lastResponse = res;
      } catch (error) {
        // An abort from the caller's own signal (unmount, superseded request)
        // is not a failure — let it through untouched.
        if (externalSignal?.aborted) throw error;
        lastError = classifyThrow(url, timedOut, isSafeMethod);
      } finally {
        clearTimeout(timeoutId);
        // Released per attempt, so the backoff pause below waits off the wire
        // and a retry has to queue up again behind whatever is live now.
        if (!bypassQueue) releaseSlot();
      }

      const backoffMs = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      const withinBudget = (Date.now() - dispatchedAt) + backoffMs < TOTAL_BUDGET_MS;
      const canRetry = lastError.retryable && attempt < retriesAllowed && withinBudget;
      if (!canRetry) break;
      lastResponse = null;
      // Surface the reason while we wait, so the banner moves during the retry
      // rather than only after it.
      reportOutcome(lastError);
      await wait(backoffMs);
    }

    reportOutcome(lastError);
    if (!rejectOnHttpError && lastResponse) return { res: lastResponse, handedBack: true };
    throw lastError;
  };

  const shareable = dedupe !== false
    && isSafeMethod
    && !rest.body
    // One caller giving up must never cancel a read another caller is still
    // waiting on, so a request carrying somebody's abort signal stays its own.
    && !externalSignal
    // The health probe is asking about this instant; an answer already on its
    // way does not tell it what it wants to know.
    && !bypassQueue
    // The caller asked to go past every cache on the way. This is one of them.
    && !['no-store', 'reload'].includes(String(rest.cache || ''));

  inFlight += 1;
  emitActivity();
  try {
    if (!shareable) {
      const { res, handedBack } = await send();
      return await parseBody(res, parse, handedBack);
    }
    const key = readKey({
      method, url, parse, rejectOnHttpError, retriesAllowed, effectiveTimeout, auth, headers
    });
    return await shareRead(key, send, parse);
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    emitActivity();
  }
};

/**
 * Explicit health probe for the connection banner. Unlike apiFetch it never
 * throws — it only reports, so a failing probe cannot break a render.
 */
export const checkApiHealth = async ({ markChecking = true } = {}) => {
  if (markChecking) setConnection({ status: CONNECTION.CHECKING, message: '' });
  const startedAt = Date.now();
  try {
    await apiFetch('/api/health', {
      auth: false,
      retry: false,
      // Long enough that a link which is merely slow is not reported as a dead
      // server: calling the backend down when it is answering is the one wrong
      // answer this probe must not give.
      timeoutMs: 12000,
      bypassQueue: true,
      cache: 'no-store'
    });
    setConnection({ status: CONNECTION.ONLINE, message: '', latencyMs: Date.now() - startedAt });
  } catch (error) {
    const apiError = isApiError(error) ? error : new ApiError({ kind: ERROR_KINDS.NETWORK });
    reportOutcome(apiError);
    // /api/health is the one route whose failure always means the backend is
    // unusable, whatever the shape of the failure — a 500 from a dev proxy or a
    // gateway in front of a stopped server included. reportOutcome ignores
    // plain server errors elsewhere (they say nothing about the connection), so
    // that case is pinned down here instead of being silently dropped.
    if (getConnectionState().status === CONNECTION.CHECKING || getConnectionState().status === CONNECTION.ONLINE) {
      // Use the kind's own wording, not the backend's: "در سرور خطایی رخ داد"
      // under a heading that reads "سرور در دسترس نیست" tells two stories.
      setConnection({
        status: CONNECTION.SERVER_DOWN,
        message: MESSAGES[ERROR_KINDS.NETWORK],
        latencyMs: null
      });
    }
  }
  return getConnectionState();
};
