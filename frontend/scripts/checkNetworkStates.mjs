import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the invariants behind "a failed request always says so".
 *
 * Every network call goes through apiFetch, which supplies the timeout, the
 * retry policy, the Persian error messages, the top progress bar and the
 * connection banner. A raw fetch() silently opts out of all of it, which is how
 * a dead server used to look like an empty page — so new ones are rejected here
 * rather than discovered by a user.
 *
 * It also checks two mistakes that are invisible to eslint, both of which
 * actually happened while this was being built:
 *   - a failure message attached to a plain validation branch instead of a
 *     catch, so "select a student first" was reported as a server failure;
 *   - an error card rendered in a different component from the state feeding
 *     it, which only trips no-undef when the name is out of scope.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');

// The only calls allowed to bypass apiFetch, with the reason they are exempt.
const RAW_FETCH_ALLOWLIST = [
  { file: 'src/utils/apiClient.js', reason: 'apiFetch itself' },
  { file: 'src/pages/StudentManagement.jsx', reason: 'woff font download, not an API route' }
];

let failures = 0;
const logPass = (message) => console.log(`PASS  ${message}`);
const logFail = (message) => {
  failures += 1;
  console.error(`FAIL  ${message}`);
};

const collect = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collect(full));
    else if (/\.(jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
};

const files = collect(srcDir);
const rel = (file) => path.relative(rootDir, file).split(path.sep).join('/');

/* ------------------------------------------------------------------ *
 * 1. no raw fetch()
 * ------------------------------------------------------------------ */

const RAW_FETCH = /(^|[^A-Za-z0-9_$.])fetch\s*\(/;
const allowedFiles = new Set(RAW_FETCH_ALLOWLIST.map((item) => item.file));
let rawFetchHits = 0;

for (const file of files) {
  const name = rel(file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    if (!RAW_FETCH.test(line)) return;
    if (allowedFiles.has(name)) return;
    logFail(`raw fetch() at ${name}:${index + 1} — use apiFetch from src/utils/apiClient.js`);
    rawFetchHits += 1;
  });
}

if (!rawFetchHits) {
  logPass(`no raw fetch() outside the ${RAW_FETCH_ALLOWLIST.length} allowed call sites`);
}

/* ------------------------------------------------------------------ *
 * 2. every failureMessage() sits in a catch
 * ------------------------------------------------------------------ */

// Walks the source tracking block kinds, skipping strings and comments, so a
// brace inside a template literal cannot shift the block boundaries.
const failureMessagesOutsideCatch = (src) => {
  const stack = [];
  const flagged = [];
  let i = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    const prev = src[i - 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      i += 1; continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') { blockComment = false; i += 2; continue; }
      i += 1; continue;
    }
    if (quote) {
      if (ch === quote && prev !== '\\') quote = null;
      i += 1; continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i += 2; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i += 2; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i += 1; continue; }

    if (ch === '{') {
      const before = src.slice(Math.max(0, i - 40), i);
      stack.push(/catch\s*(\([^)]*\))?\s*$/.test(before) ? 'catch' : 'block');
      i += 1; continue;
    }
    if (ch === '}') { stack.pop(); i += 1; continue; }

    if (src.startsWith('failureMessage(', i)) {
      const before = src.slice(Math.max(0, i - 160), i);
      // `.catch((err) => setX(failureMessage(err, …)))` has no braces at all.
      const inArrowCatch = /\.catch\s*\(\s*(\([^)]*\)|\w+)\s*=>[^;]*$/.test(before);
      if (!stack.includes('catch') && !inArrowCatch) {
        flagged.push(src.slice(0, i).split('\n').length);
      }
      i += 'failureMessage('.length;
      continue;
    }
    i += 1;
  }
  return flagged;
};

let strayMessages = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('failureMessage(')) continue;
  for (const line of failureMessagesOutsideCatch(src)) {
    logFail(`failureMessage() outside a catch at ${rel(file)}:${line} — it describes why a request failed, so a plain validation branch must not use it`);
    strayMessages += 1;
  }
}
if (!strayMessages) logPass('every failureMessage() call is inside a catch');

/* ------------------------------------------------------------------ *
 * 3. no credentials: 'include'
 * ------------------------------------------------------------------ */

// This API authenticates with a Bearer token and sets no cookies at all, so
// credentials: 'include' buys nothing — but it is not merely redundant. The
// deployed frontend talks to the backend cross-origin, and in credentials mode
// a preflight is rejected unless the server answers
// Access-Control-Allow-Credentials: true, which a token API has no reason to
// send. Every request carrying it is therefore blocked by the browser before
// it is sent, and surfaces as "سرور در دسترس نیست" — a dead-server message for
// a server that is perfectly alive. Three of these silently emptied the
// student list on 2026-09-19.

let credentialed = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (!/credentials:\s*['"]include['"]/.test(line)) return;
    credentialed += 1;
    logFail(`credentials: 'include' at ${rel(file)}:${index + 1} — this API is Bearer-only, and cross-origin it makes the browser block the request outright`);
  });
}
if (!credentialed) logPass("no request asks for credentials: 'include'");

/* ------------------------------------------------------------------ *
 * 4. each error card lives with the state that feeds it
 * ------------------------------------------------------------------ */

const TOP_LEVEL_DECL = /^(export default function|export function|function|const)\s+([A-Za-z_$][\w$]*)/;

const ownerOf = (lines, lineIndex) => {
  for (let i = lineIndex; i >= 0; i -= 1) {
    if (/^\s/.test(lines[i])) continue;
    const match = lines[i].match(TOP_LEVEL_DECL);
    if (match) return match[2];
  }
  return '(module scope)';
};

let misplacedCards = 0;
let cardsChecked = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('<DataErrorCard')) continue;
  const lines = src.split(/\r?\n/);
  const stateIndex = lines.findIndex((line) => /const \[loadError, setLoadError\]/.test(line));
  const cardIndex = lines.findIndex((line) => /<DataErrorCard error=\{loadError\}/.test(line));
  if (stateIndex === -1 || cardIndex === -1) continue;

  cardsChecked += 1;
  const stateOwner = ownerOf(lines, stateIndex);
  const cardOwner = ownerOf(lines, cardIndex);
  if (stateOwner !== cardOwner) {
    logFail(`${rel(file)}: loadError is declared in ${stateOwner} but its card renders in ${cardOwner}`);
    misplacedCards += 1;
  }
}
if (!misplacedCards) logPass(`all ${cardsChecked} error cards render in the component holding their state`);

/* ------------------------------------------------------------------ *
 * 5. coverage report (informational)
 * ------------------------------------------------------------------ */

const jsxFiles = files.filter((file) => file.endsWith('.jsx'));
let usingApi = 0;
let withLoading = 0;
let withError = 0;
let withRetry = 0;

for (const file of jsxFiles) {
  const src = fs.readFileSync(file, 'utf8');
  if (!/apiFetch\(/.test(src)) continue;
  usingApi += 1;
  if (/(loading|Loading|busy|Busy)\s*(\?|&&)/.test(src)
    || /if \((\w*[lL]oading|\w*[bB]usy)\)/.test(src)
    || /در حال بارگذاری|در حال دریافت/.test(src)) withLoading += 1;
  if (/DataState|DataErrorCard/.test(src)) withError += 1;
  if (/DataState|DataErrorCard|تلاشِ? دوباره/.test(src)) withRetry += 1;
}

console.log('');
console.log(`Files calling the API : ${usingApi}`);
console.log(`  with a loading state: ${withLoading}`);
console.log(`  with an error state : ${withError}`);
console.log(`  with a retry        : ${withRetry}`);
console.log('(forms, print views, small widgets and the app shell report through');
console.log(' their own message line and the global connection banner instead.)');

if (failures > 0) {
  console.error(`\nNetwork state check failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nNetwork state check completed successfully.');
