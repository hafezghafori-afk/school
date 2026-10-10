// Expiring, signed links for uploaded school files.
//
// Everything under uploads/ except the public folders (news, gallery, login,
// site) is school data: finance receipts, student and staff documents and
// photos, homework, chat files, avatars, lessons, recordings. Until 2026-10 any
// path that leaked — or was guessed from a timestamp and a file name — opened the
// file for anyone, forever. Now the server hands paths out with an expiring HMAC
// signature inserted as a path segment:
//
//   uploads/finance-receipts/123-receipt.pdf
//   -> uploads/s/1760140800.<signature>/finance-receipts/123-receipt.pdf
//
// Signing happens on the way out, in every JSON and HTML response and the chat
// socket event, so a file opens exactly when an API has already shown its record
// to the caller. As a path segment it leaves the file name and extension alone
// for code that inspects them, and works in <img>, <video> (ranges) and <a>.
// Links stay identical for a 6-hour window (so browsers cache them) and are good
// for 6-12 hours. Request bodies have signatures stripped, so a form that sends a
// path back stores it unsigned; a stored signed path is simply re-signed.
const crypto = require('crypto');
const { getJwtSecret } = require('../utils/env');
const {
  createUploadsMiddleware,
  isPublicUploadKey,
  keyFromRequestPath,
  normalizeUploadKey
} = require('./uploadStorageService');

const WINDOW_SECONDS = 6 * 60 * 60;
const SIGNATURE_LENGTH = 32;
const SIGNED_PREFIX = /^uploads\/s\/\d{1,12}\.[A-Za-z0-9_-]{32}\//;
const SIGNED_REQUEST = /^\/s\/(\d{1,12})\.([A-Za-z0-9_-]{32})\/(.+)$/;
// An uploads/ path inside JSON or HTML text: after a quote, "(", "=", ",", ">",
// whitespace or the start, optionally behind "/" or an absolute URL of our own.
const UPLOAD_REFERENCE = /(?<=^|["'(=\s,>])((?:https?:\/\/[^\s"'<>()/]+)?\/?)uploads\/([^"'()\s?#\\<>]+)/g;

let derived = { secret: null, key: null };
function linkKey() {
  const secret = String(process.env.UPLOAD_LINK_SECRET || '').trim() || getJwtSecret();
  if (derived.secret !== secret) {
    derived = { secret, key: crypto.createHmac('sha256', secret).update('upload-links-v1').digest() };
  }
  return derived.key;
}

const signatureFor = (expires, rest) => crypto.createHmac('sha256', linkKey())
  .update(`${expires}/${rest}`)
  .digest('base64url')
  .slice(0, SIGNATURE_LENGTH);

// End of the window after the current one: valid 6-12 h, stable for 6 h.
const expiryFor = (now = Date.now()) => (Math.floor(now / 1000 / WINDOW_SECONDS) + 2) * WINDOW_SECONDS;

function isPrivateUploadKey(key = '') {
  const normalized = normalizeUploadKey(key);
  return Boolean(normalized) && !SIGNED_PREFIX.test(normalized) && !isPublicUploadKey(normalized);
}

// "uploads/a/b.pdf" (or with a leading "/", or already signed) -> a fresh signed
// path; public and non-upload values come back unchanged.
function signUploadPath(value, { now = Date.now() } = {}) {
  const raw = String(value ?? '');
  const leadingSlash = raw.startsWith('/') ? '/' : '';
  const key = normalizeUploadKey(raw.replace(/^\/+/, '').replace(SIGNED_PREFIX, 'uploads/'));
  if (!key || !isPrivateUploadKey(key)) return value;
  const rest = key.slice('uploads/'.length);
  const expires = expiryFor(now);
  return `${leadingSlash}uploads/s/${expires}.${signatureFor(expires, rest)}/${rest}`;
}

// A request path under the /uploads mount: "/s/<expires>.<sig>/<rest>".
// -> { key } when valid, { expired: true } when it was valid once, null otherwise.
function verifySignedUploadPath(requestPath = '', { now = Date.now() } = {}) {
  const match = SIGNED_REQUEST.exec(String(requestPath || ''));
  if (!match) return null;
  let rest;
  try {
    rest = decodeURIComponent(match[3]);
  } catch {
    return null;
  }
  const key = normalizeUploadKey(`uploads/${rest}`);
  if (!key || !isPrivateUploadKey(key)) return null;
  const expires = Number(match[1]);
  const expected = Buffer.from(signatureFor(expires, key.slice('uploads/'.length)));
  const given = Buffer.from(match[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (expires * 1000 < now) return { expired: true };
  return { key };
}

function signUploadPathsInText(text, { now = Date.now(), ownHosts = new Set() } = {}) {
  if (typeof text !== 'string' || !text.includes('uploads/')) return text;
  return text.replace(UPLOAD_REFERENCE, (match, prefix, rest) => {
    if (/^https?:/i.test(prefix)) {
      const host = prefix.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
      if (!ownHosts.has(host)) return match;
    }
    const plain = `uploads/${rest}`;
    const signed = signUploadPath(plain, { now });
    return signed === plain ? match : `${prefix}${signed}`;
  });
}

// For payloads that bypass res.send (socket.io events).
function signUploadPathsInValue(value, options = {}) {
  if (value == null) return value;
  const json = JSON.stringify(value);
  if (!json || !json.includes('uploads/')) return value;
  return JSON.parse(signUploadPathsInText(json, options));
}

// Request bodies: drop signatures from any string, copying only what changes.
function stripUploadSignatures(value) {
  if (typeof value === 'string') {
    return value.includes('uploads/s/') ? value.replace(/(^|[^A-Za-z0-9_-])uploads\/s\/\d{1,12}\.[A-Za-z0-9_-]{32}\//g, '$1uploads/') : value;
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const stripped = stripUploadSignatures(item);
      if (stripped !== item) changed = true;
      return stripped;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const next = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = stripUploadSignatures(item);
      if (next[key] !== item) changed = true;
    }
    return changed ? next : value;
  }
  return value;
}

const configuredHosts = () => [
  process.env.RENDER_EXTERNAL_HOSTNAME,
  ...String(process.env.UPLOAD_LINK_HOSTS || 'www.imangirlschool.com,imangirlschool.com').split(',')
].map((host) => String(host || '').trim().toLowerCase()).filter(Boolean);

// app.use() right after express.json(): strips signatures from JSON bodies and
// signs every uploads/ path in JSON and HTML text this request sends back.
function uploadLinkMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = stripUploadSignatures(req.body);
  const originalSend = res.send;
  res.send = function sendWithSignedUploadLinks(body) {
    if (typeof body === 'string' && body.includes('uploads/')) {
      const type = String(this.get('Content-Type') || 'text/html');
      if (/json|html/i.test(type)) {
        const ownHosts = new Set([String(req.get('host') || '').toLowerCase(), ...configuredHosts()]);
        body = signUploadPathsInText(body, { ownHosts });
      }
    }
    return originalSend.call(this, body);
  };
  next();
}

// Mount at /uploads instead of createUploadsMiddleware(): public folders open
// directly, private files only through a valid, unexpired signed path.
function createProtectedUploadsMiddleware(options = {}) {
  const serve = createUploadsMiddleware(options);
  return function serveProtectedUploads(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/s/')) {
      const verified = verifySignedUploadPath(req.path);
      if (!verified?.key) {
        return res.status(verified?.expired ? 410 : 403).type('text/plain; charset=utf-8')
          .send(verified?.expired ? 'این لینک منقضی شده است؛ صفحه را دوباره باز کنید.' : 'لینک فایل معتبر نیست.');
      }
      req.url = `/${verified.key.split('/').slice(1).map(encodeURIComponent).join('/')}`;
      return serve(req, res, next);
    }
    const key = keyFromRequestPath(req.path);
    if (key && isPrivateUploadKey(key)) {
      return res.status(403).type('text/plain; charset=utf-8').send('این فایل فقط از داخل سیستم و با لینکِ معتبر باز می‌شود.');
    }
    return serve(req, res, next);
  };
}

module.exports = {
  WINDOW_SECONDS,
  createProtectedUploadsMiddleware,
  isPrivateUploadKey,
  signUploadPath,
  signUploadPathsInText,
  signUploadPathsInValue,
  stripUploadSignatures,
  uploadLinkMiddleware,
  verifySignedUploadPath
};
