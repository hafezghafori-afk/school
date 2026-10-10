const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

// School files (receipts, documents, homework, chat files, photos) used to open
// for anyone holding — or guessing — their uploads/ path, forever. These cases
// pin the signed links that replace that: responses sign every private path,
// /uploads refuses unsigned, tampered and expired ones, public folders and the
// video range requests keep working, and signatures never get stored.

process.env.UPLOAD_LINK_SECRET = 'upload-link-check-secret';
process.env.UPLOADS_STORAGE = 'local';

const links = require('../services/uploadLinkService');

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

const SIGNED = /^(\/?)uploads\/s\/(\d+)\.([A-Za-z0-9_-]{32})\/(.+)$/;
const HOUR = 60 * 60 * 1000;

function checkSigning() {
  const now = Date.UTC(2026, 9, 10, 20, 0, 0);
  const signed = links.signUploadPath('uploads/finance-receipts/123-r.pdf', { now });
  const match = SIGNED.exec(signed);
  assertCase(match && match[4] === 'finance-receipts/123-r.pdf', `A receipt path must be signed, got ${signed}.`);
  assertCase(signed.endsWith('.pdf'), 'The file name and extension stay last.');
  const validFor = Number(match[2]) * 1000 - now;
  assertCase(validFor >= 6 * HOUR && validFor <= 12 * HOUR, `Links must stay valid 6-12 hours, got ${validFor / HOUR} h.`);
  const windowStart = Math.floor(now / (6 * HOUR)) * 6 * HOUR;
  assertCase(
    links.signUploadPath('uploads/chats/a.png', { now: windowStart + 10 * 60 * 1000 }) === links.signUploadPath('uploads/chats/a.png', { now: windowStart + 5 * HOUR }),
    'Links are identical inside one 6-hour window, so browsers can cache them.'
  );
  assertCase(
    links.signUploadPath('uploads/chats/a.png', { now: windowStart + 5 * HOUR }) !== links.signUploadPath('uploads/chats/a.png', { now: windowStart + 7 * HOUR }),
    'The next window gets a new link.'
  );
  assertCase(links.signUploadPath('/uploads/chats/a.png', { now }).startsWith('/uploads/s/'), 'A leading slash is kept.');
  assertCase(SIGNED.test(links.signUploadPath('uploads/lesson-video.mp4', { now })), 'Root-level course files are private too.');
  for (const publicPath of ['uploads/news/n.png', 'uploads/gallery/g.jpg', '/uploads/login/logo.png', 'uploads/site/stamp.png']) {
    assertCase(links.signUploadPath(publicPath, { now }) === publicPath, `${publicPath} is public and must stay unsigned.`);
  }
  for (const other of ['https://media.imangirlschool.com/site/logo.png', 'uploads/../.env', '', null]) {
    assertCase(links.signUploadPath(other, { now }) === other, `${other} is not an upload path.`);
  }
  const resigned = links.signUploadPath(links.signUploadPath('uploads/chats/a.png', { now: now - 20 * HOUR }), { now });
  assertCase(resigned === links.signUploadPath('uploads/chats/a.png', { now }), 'A stored, stale signed path is re-signed, not double-signed.');

  const requestPath = (value) => `/${value.replace(/^\/?uploads\//, '')}`;
  const ok = links.verifySignedUploadPath(requestPath(signed), { now });
  assertCase(ok?.key === 'uploads/finance-receipts/123-r.pdf', 'A fresh link verifies to its key.');
  const otherFile = requestPath(signed).replace('123-r.pdf', '124-r.pdf');
  assertCase(links.verifySignedUploadPath(otherFile, { now }) === null, 'A signature cannot be moved to another file.');
  const flipped = requestPath(signed).replace(/\.([A-Za-z0-9_-])/, (all, char) => `.${char === 'A' ? 'B' : 'A'}`);
  assertCase(links.verifySignedUploadPath(flipped, { now }) === null, 'A changed signature is refused.');
  assertCase(links.verifySignedUploadPath(requestPath(signed), { now: now + 13 * HOUR })?.expired === true, 'An old link reports expired.');
  assertCase(links.verifySignedUploadPath('/s/1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/../server.js', { now }) === null, 'Traversal never verifies.');

  const unicode = links.signUploadPath('uploads/chats/1-سند.pdf', { now });
  assertCase(links.verifySignedUploadPath(`/${encodeURI(unicode.slice('uploads/'.length))}`, { now })?.key === 'uploads/chats/1-سند.pdf', 'Percent-encoded non-Latin names verify.');

  const text = JSON.stringify({
    receipt: 'uploads/finance-receipts/1.pdf',
    avatar: '/uploads/avatars/2.png',
    own: 'https://api.example.org/uploads/homeworks/3.docx',
    foreign: 'https://cdn.other.org/uploads/homeworks/3.docx',
    nested: 'https://cdn.other.org/static/uploads/x.png',
    news: 'uploads/news/4.png',
    note: 'see uploads/grades/5.pdf'
  });
  const out = JSON.parse(links.signUploadPathsInText(text, { now, ownHosts: new Set(['api.example.org']) }));
  assertCase(SIGNED.test(out.receipt) && SIGNED.test(out.avatar), 'Relative paths in JSON are signed.');
  assertCase(/^https:\/\/api\.example\.org\/uploads\/s\//.test(out.own), 'Absolute URLs of our own host are signed.');
  assertCase(out.foreign.endsWith('/uploads/homeworks/3.docx') && !out.foreign.includes('/s/'), 'Other hosts are left alone.');
  assertCase(out.nested === 'https://cdn.other.org/static/uploads/x.png', 'An uploads/ segment inside a foreign URL is left alone.');
  assertCase(out.news === 'uploads/news/4.png', 'Public paths are left alone.');
  assertCase(/^see uploads\/s\//.test(out.note), 'Paths inside text are signed.');
  assertCase(links.signUploadPathsInText('<img src="/uploads/afghan-teachers/t.png">', { now }).includes('src="/uploads/s/'), 'HTML attributes are signed.');

  const payload = links.signUploadPathsInValue({ file: 'uploads/chats/x.png', sender: { name: 'م' } }, { now });
  assertCase(SIGNED.test(payload.file) && payload.sender.name === 'م', 'Socket payloads are signed.');

  const body = { title: 'x', documents: [{ url: signed }, { url: 'uploads/chats/plain.png' }], nested: { avatar: `https://h/${signed}` } };
  const stripped = links.stripUploadSignatures(body);
  assertCase(stripped.documents[0].url === 'uploads/finance-receipts/123-r.pdf', 'Signatures are stripped from request bodies.');
  assertCase(stripped.nested.avatar === 'https://h/uploads/finance-receipts/123-r.pdf', 'Absolute signed URLs are stripped too.');
  assertCase(stripped.documents[1] === body.documents[1], 'Untouched parts keep their identity.');
  const untouched = { a: 1, b: ['x'] };
  assertCase(links.stripUploadSignatures(untouched) === untouched, 'A body without signatures is returned as is.');
}

async function checkHttp() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-links-check-'));
  const root = path.join(temp, 'uploads');
  fs.mkdirSync(path.join(root, 'finance-receipts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'news'), { recursive: true });
  fs.writeFileSync(path.join(root, 'finance-receipts', 'r.pdf'), '%PDF-receipt-0123456789');
  fs.writeFileSync(path.join(root, 'news', 'n.png'), 'public-news-image');

  const app = express();
  app.use(express.json());
  app.use(links.uploadLinkMiddleware);
  let echoed = null;
  app.get('/api/record', (req, res) => res.json({ success: true, receipt: 'uploads/finance-receipts/r.pdf', image: 'uploads/news/n.png' }));
  app.get('/print', (req, res) => res.send('<html><img src="/uploads/finance-receipts/r.pdf"></html>'));
  app.post('/api/echo', (req, res) => {
    echoed = req.body;
    res.json({ ok: true });
  });
  app.use('/uploads', links.createProtectedUploadsMiddleware({ root }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (target, headers = {}) => {
    const response = await fetch(`${base}${target}`, { headers });
    return { status: response.status, text: await response.text(), headers: response.headers };
  };

  try {
    const record = JSON.parse((await get('/api/record')).text);
    assertCase(SIGNED.test(record.receipt), `JSON responses must carry a signed receipt path, got ${record.receipt}.`);
    assertCase(record.image === 'uploads/news/n.png', 'Public images stay plain in JSON.');

    const signedFile = await get(`/${record.receipt}`);
    assertCase(signedFile.status === 200 && signedFile.text === '%PDF-receipt-0123456789', `The signed link must open the file, got ${signedFile.status}.`);
    assertCase(signedFile.headers.get('content-type') === 'application/pdf', 'The file keeps its type behind a signed link.');
    const ranged = await get(`/${record.receipt}`, { Range: 'bytes=0-3' });
    assertCase(ranged.status === 206 && ranged.text === '%PDF', 'Range requests work through signed links.');

    const unsigned = await get('/uploads/finance-receipts/r.pdf');
    assertCase(unsigned.status === 403 && !unsigned.text.includes('PDF'), `An unsigned private path must be refused, got ${unsigned.status}.`);
    const tampered = await get(`/${record.receipt.replace(/\/r\.pdf$/, '/other.pdf')}`);
    assertCase(tampered.status === 403, `A signature moved to another file must be refused, got ${tampered.status}.`);
    const expiredPath = links.signUploadPath('uploads/finance-receipts/r.pdf', { now: Date.now() - 24 * HOUR });
    const expired = await get(`/${expiredPath}`);
    assertCase(expired.status === 410, `An expired link must be a 410, got ${expired.status}.`);
    const publicFile = await get('/uploads/news/n.png');
    assertCase(publicFile.status === 200 && publicFile.text === 'public-news-image', 'Public folders open without a signature.');

    const html = await get('/print');
    assertCase(/src="\/uploads\/s\/\d+\.[A-Za-z0-9_-]{32}\/finance-receipts\/r\.pdf"/.test(html.text), `HTML responses must be signed too, got ${html.text}.`);

    await fetch(`${base}/api/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documents: [{ url: record.receipt }] })
    });
    assertCase(echoed?.documents?.[0]?.url === 'uploads/finance-receipts/r.pdf', `Routes must receive unsigned paths, got ${JSON.stringify(echoed)}.`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

async function run() {
  checkSigning();
  await checkHttp();
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assertCase(/app\.use\(uploadLinkMiddleware\)/.test(server), 'server.js must mount uploadLinkMiddleware.');
  assertCase(server.indexOf('app.use(express.json())') < server.indexOf('app.use(uploadLinkMiddleware)'), 'uploadLinkMiddleware must run after express.json so bodies are parsed.');
  const chat = fs.readFileSync(path.join(__dirname, '..', 'routes', 'chatRoutes.js'), 'utf8');
  assertCase(/emit\('chat:new', signUploadPathsInValue\(/.test(chat), 'The chat socket event must carry signed attachment links.');
}

run()
  .then(() => {
    console.log('[check:upload-links] ok');
  })
  .catch((error) => {
    console.error('[check:upload-links] failed');
    console.error(error);
    process.exit(1);
  });
