import { API_BASE } from '../config/api';

// Single entry point for every network call in the app. Before this existed the
// raw fetch() call sites each decided on their own whether to show a spinner,
// whether to surface an error, and whether to give up — which in practice meant
// a dead server, a slow link and a restarting backend all looked identical to
// the user: a blank page with nothing moving on it. Everything here exists to
// make that state visible and recoverable.

export const DEFAULT_TIMEOUT_MS = 15000;
// Writes get longer than reads: saving a term's grades or closing a finance
// month legitimately takes more than fifteen seconds, and cutting one off early
// is far worse than waiting — see TIMEOUT_UNSAFE below.
export const DEFAULT_MUTATION_TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [600, 1800];
// Ceiling on one apiFetch call including its retries. Without it, three
// consecutive timeouts on a hanging server would keep a page waiting ~45s —
// long enough that the retries become the very "nothing is happening" problem
// they exist to solve. A refused connection still fails fast and retries fully.
const TOTAL_BUDGET_MS = 25000;

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

const getAuthHeaders = () => {
  try {
    const token = window.localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
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

  inFlight += 1;
  emitActivity();
  const startedAt = Date.now();

  try {
    let lastError = null;
    let lastResponse = null;

    for (let attempt = 0; attempt <= retriesAllowed; attempt += 1) {
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
          reportOutcome(null, Date.now() - startedAt);
          if (parse === 'none' || res.status === 204) return null;
          if (parse === 'text') return res.text();
          if (parse === 'blob') return res.blob();
          if (parse === 'response') return res;
          return res.json().catch(() => ({}));
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
      }

      const backoffMs = RETRY_BACKOFF_MS[attempt] || RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      const withinBudget = (Date.now() - startedAt) + backoffMs < TOTAL_BUDGET_MS;
      const canRetry = lastError.retryable && attempt < retriesAllowed && withinBudget;
      if (!canRetry) break;
      lastResponse = null;
      // Surface the reason while we wait, so the banner moves during the retry
      // rather than only after it.
      reportOutcome(lastError);
      await wait(backoffMs);
    }

    reportOutcome(lastError);
    if (!rejectOnHttpError && lastResponse) return lastResponse;
    throw lastError;
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
    await apiFetch('/api/health', { auth: false, retry: false, timeoutMs: 8000, cache: 'no-store' });
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
