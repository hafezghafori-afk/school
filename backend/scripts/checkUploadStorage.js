const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const { Readable } = require('stream');
const express = require('express');
const multer = require('multer');

// Uploads used to live only on Render's ephemeral disk, wiped by every deploy,
// restart and free-plan spin-down. These cases pin the replacement: every route
// stores through durableDiskStorage, files land in R2 under their "uploads/..."
// path and are served back from there (ranges for video, 304s, safe headers),
// and nothing changes when no bucket is configured.

const backendRoot = path.join(__dirname, '..');
const routesDir = path.join(backendRoot, 'routes');
const servicePath = path.join(backendRoot, 'services', 'uploadStorageService.js');

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

// --- static guards -----------------------------------------------------------
function checkSources() {
  const offenders = fs.readdirSync(routesDir)
    .filter((file) => file.endsWith('.js'))
    .filter((file) => fs.readFileSync(path.join(routesDir, file), 'utf8').includes('multer.diskStorage('));
  assertCase(!offenders.length, `Routes must store uploads with durableDiskStorage, not multer.diskStorage: ${offenders.join(', ')}`);

  const server = fs.readFileSync(path.join(backendRoot, 'server.js'), 'utf8');
  assertCase(!/app\.use\('\/uploads',\s*express\.static/.test(server), 'server.js must serve /uploads through the uploads middleware, not express.static.');
  assertCase(/app\.use\('\/uploads',\s*createProtectedUploadsMiddleware\(\)\)/.test(server), 'server.js must mount createProtectedUploadsMiddleware() (signed links over the durable storage) at /uploads.');
}

// --- in-memory stand-in for the R2 bucket --------------------------------------
const bucket = new Map();
const multipart = new Map();
const sent = [];
const httpError = (name, status) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

class Command {
  constructor(input) {
    this.input = input;
  }
}
const fakeS3 = {
  PutObjectCommand: class PutObjectCommand extends Command {},
  GetObjectCommand: class GetObjectCommand extends Command {},
  HeadObjectCommand: class HeadObjectCommand extends Command {},
  DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  CreateMultipartUploadCommand: class CreateMultipartUploadCommand extends Command {},
  UploadPartCommand: class UploadPartCommand extends Command {},
  CompleteMultipartUploadCommand: class CompleteMultipartUploadCommand extends Command {},
  AbortMultipartUploadCommand: class AbortMultipartUploadCommand extends Command {},
  S3Client: class S3Client {
    constructor(config) {
      this.config = config;
    }

    async send(command) {
      const { input } = command;
      const type = command.constructor.name;
      sent.push({ type, input, config: this.config });
      const etag = (body) => `"${crypto.createHash('md5').update(body).digest('hex')}"`;
      switch (type) {
        case 'PutObjectCommand': {
          assertCase(Buffer.isBuffer(input.Body), 'PutObject bodies must be Buffers (streams cannot be replayed on retry).');
          bucket.set(input.Key, { body: input.Body, type: input.ContentType });
          return { ETag: etag(input.Body) };
        }
        case 'HeadObjectCommand': {
          const object = bucket.get(input.Key);
          if (!object) throw httpError('NotFound', 404);
          return { ContentLength: object.body.length, ETag: etag(object.body) };
        }
        case 'GetObjectCommand': {
          const object = bucket.get(input.Key);
          if (!object) throw httpError('NoSuchKey', 404);
          const tag = etag(object.body);
          if (input.IfNoneMatch && input.IfNoneMatch === tag) throw httpError('NotModified', 304);
          let body = object.body;
          let ContentRange;
          if (input.Range) {
            const [, from, to] = /^bytes=(\d*)-(\d*)$/.exec(input.Range);
            const size = object.body.length;
            const start = from === '' ? Math.max(0, size - Number(to)) : Number(from);
            const end = from === '' || to === '' ? size - 1 : Math.min(Number(to), size - 1);
            if (start >= size) throw httpError('InvalidRange', 416);
            body = object.body.subarray(start, end + 1);
            ContentRange = `bytes ${start}-${end}/${size}`;
          }
          return { Body: Readable.from([body]), ContentLength: body.length, ContentRange, ETag: tag, LastModified: new Date('2026-10-10T00:00:00Z') };
        }
        case 'DeleteObjectCommand':
          bucket.delete(input.Key);
          return {};
        case 'CreateMultipartUploadCommand': {
          const UploadId = `upload-${multipart.size + 1}`;
          multipart.set(UploadId, { key: input.Key, type: input.ContentType, parts: new Map() });
          return { UploadId };
        }
        case 'UploadPartCommand': {
          assertCase(Buffer.isBuffer(input.Body), 'UploadPart bodies must be Buffers.');
          multipart.get(input.UploadId).parts.set(input.PartNumber, Buffer.from(input.Body));
          return { ETag: `"part-${input.PartNumber}"` };
        }
        case 'CompleteMultipartUploadCommand': {
          const upload = multipart.get(input.UploadId);
          const body = Buffer.concat(input.MultipartUpload.Parts.map((part) => upload.parts.get(part.PartNumber)));
          bucket.set(upload.key, { body, type: upload.type });
          multipart.delete(input.UploadId);
          return {};
        }
        case 'AbortMultipartUploadCommand':
          multipart.delete(input.UploadId);
          return {};
        default:
          throw new Error(`unexpected command ${type}`);
      }
    }
  }
};

function loadService() {
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    if (request === '@aws-sdk/client-s3' && parentFile.endsWith('/services/uploadStorageService.js')) return fakeS3;
    return originalLoad.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(servicePath)];
    return require(servicePath);
  } finally {
    Module._load = originalLoad;
  }
}

const R2_ENV = ['R2_UPLOADS_BUCKET_NAME', 'R2_STUDENT_BUCKET_NAME', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'UPLOADS_STORAGE', 'NODE_ENV', 'RENDER', 'RENDER_SERVICE_ID'];
function setEnv(values) {
  R2_ENV.forEach((name) => { delete process.env[name]; });
  Object.assign(process.env, values);
}
const R2_ON = {
  R2_STUDENT_BUCKET_NAME: 'school-private',
  R2_ACCESS_KEY_ID: 'test-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_ENDPOINT: 'https://example.r2.cloudflarestorage.com/'
};

async function startApp(service, root) {
  const app = express();
  const upload = multer({
    storage: service.durableDiskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(root, 'finance-receipts');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }, { root }),
    fileFilter: (req, file, cb) => (file.originalname.startsWith('reject')
      ? cb(new Error('rejected by filter'))
      : cb(null, true))
  });
  app.post('/upload', (req, res) => {
    upload.array('file', 3)(req, res, (error) => {
      if (error) return res.status(400).json({ message: error.message, code: error.code });
      return res.json({ files: (req.files || []).map((file) => `uploads/finance-receipts/${file.filename}`) });
    });
  });
  app.use('/uploads', service.createUploadsMiddleware({ root }));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, method, target, { headers = {}, body } = {}) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}${target}`, { method, headers, body });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, buffer, text: buffer.toString('utf8') };
}

function form(files) {
  const data = new FormData();
  files.forEach(({ name, content }) => data.append('file', new Blob([content]), name));
  return data;
}

async function run() {
  checkSources();
  const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-storage-check-'));
  const root = path.join(tempBase, 'uploads');
  fs.mkdirSync(root, { recursive: true });
  const originalConsole = { log: console.log, error: console.error, warn: console.warn };
  const servers = [];

  try {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    // ---- keys -------------------------------------------------------------------
    setEnv({});
    let service = loadService();
    assertCase(service.normalizeUploadKey('/uploads/news/a.png') === 'uploads/news/a.png', 'A leading slash is accepted.');
    for (const bad of ['uploads/../server.js', 'uploads/news/../../.env', 'news/a.png', 'uploads//a.png', 'uploads/a\0.png', '']) {
      assertCase(service.normalizeUploadKey(bad) === '', `"${bad}" must not become a storage key.`);
    }
    assertCase(service.keyForLocalPath(path.join(root, 'chats', 'x.pdf'), root) === 'uploads/chats/x.pdf', 'Local paths map to uploads/ keys.');
    assertCase(service.keyForLocalPath(path.join(tempBase, 'outside.pdf'), root) === '', 'Files outside the uploads root have no key.');
    assertCase(service.isPublicUploadKey('uploads/news/a.png') && !service.isPublicUploadKey('uploads/finance-receipts/a.png'), 'Only news/gallery/login/site are public folders.');
    assertCase(service.parseRangeHeader('bytes=0-99') === 'bytes=0-99' && service.parseRangeHeader('bytes=5-1') === '' && service.parseRangeHeader('bytes=0-1,4-5') === '', 'Only single, ordered ranges pass.');

    // ---- local mode (no bucket): behaves like the old express.static -------------
    assertCase(service.describeUploadStorage().storage === 'local', 'No bucket means local storage.');
    let server = await startApp(service, root);
    servers.push(server);
    const localUpload = await request(server, 'POST', '/upload', { body: form([{ name: 'r.png', content: 'local-png' }]) });
    assertCase(localUpload.status === 200, `Local upload should succeed, got ${localUpload.status} ${localUpload.text}`);
    const localKey = JSON.parse(localUpload.text).files[0];
    assertCase(fs.existsSync(service.localPathForKey(localKey, root)), 'Without R2 the file stays on local disk.');
    assertCase(sent.length === 0, 'Without R2 nothing is sent to a bucket.');
    const localGet = await request(server, 'GET', `/${localKey}`);
    assertCase(localGet.status === 200 && localGet.text === 'local-png', 'Local files are served.');
    assertCase(localGet.headers.get('content-type') === 'image/png' && localGet.headers.get('x-content-type-options') === 'nosniff', 'Local images get a fixed type and nosniff.');
    fs.writeFileSync(path.join(root, 'finance-receipts', 'page.html'), '<script>alert(1)</script>');
    const localHtml = await request(server, 'GET', '/uploads/finance-receipts/page.html');
    assertCase(/^attachment/.test(localHtml.headers.get('content-disposition') || '') && /sandbox/.test(localHtml.headers.get('content-security-policy') || ''), 'An uploaded HTML page must download sandboxed, never render.');

    // ---- R2 mode ----------------------------------------------------------------------
    setEnv(R2_ON);
    service = loadService();
    assertCase(service.describeUploadStorage().storage === 'r2', 'A bucket plus credentials means R2.');
    server = await startApp(service, root);
    servers.push(server);

    const content = Buffer.from('%PDF-1.7 receipt bytes 0123456789');
    const uploaded = await request(server, 'POST', '/upload', { body: form([{ name: 'receipt.pdf', content }]) });
    assertCase(uploaded.status === 200, `R2 upload should succeed, got ${uploaded.status} ${uploaded.text}`);
    const key = JSON.parse(uploaded.text).files[0];
    assertCase(bucket.has(key) && bucket.get(key).body.equals(content), 'The file must land in the bucket under its uploads/ path.');
    assertCase(bucket.get(key).type === 'application/pdf', 'The stored type comes from the extension.');
    assertCase(!fs.existsSync(service.localPathForKey(key, root)), 'With R2 the local copy is dropped.');
    const client = sent.find((item) => item.type === 'PutObjectCommand').config;
    assertCase(client.requestChecksumCalculation === 'WHEN_REQUIRED' && client.endpoint === 'https://example.r2.cloudflarestorage.com', 'The R2 client skips CRC trailers and trims the endpoint.');

    const full = await request(server, 'GET', `/${key}`);
    assertCase(full.status === 200 && full.buffer.equals(content), 'Stored files are served from R2.');
    assertCase(full.headers.get('content-type') === 'application/pdf' && !full.headers.get('content-disposition'), 'PDFs open inline.');
    assertCase(full.headers.get('cache-control') === 'private, max-age=86400' && full.headers.get('accept-ranges') === 'bytes', 'School files are privately cacheable and seekable.');

    const ranged = await request(server, 'GET', `/${key}`, { headers: { Range: 'bytes=0-3' } });
    assertCase(ranged.status === 206 && ranged.text === '%PDF' && ranged.headers.get('content-range') === `bytes 0-3/${content.length}`, 'Range requests get 206 with Content-Range (video seeking).');
    const tail = await request(server, 'GET', `/${key}`, { headers: { Range: 'bytes=-4' } });
    assertCase(tail.status === 206 && tail.text === '6789', 'Suffix ranges are honoured.');
    const beyond = await request(server, 'GET', `/${key}`, { headers: { Range: `bytes=${content.length + 10}-` } });
    assertCase(beyond.status === 416, `An unsatisfiable range is a 416, got ${beyond.status}.`);

    const revalidated = await request(server, 'GET', `/${key}`, { headers: { 'If-None-Match': full.headers.get('etag') } });
    assertCase(revalidated.status === 304, `A matching ETag is a 304, got ${revalidated.status}.`);

    const head = await request(server, 'HEAD', `/${key}`);
    assertCase(head.status === 200 && head.headers.get('content-length') === String(content.length), 'HEAD answers from object metadata.');

    for (const target of ['/uploads/finance-receipts/missing.pdf', '/uploads/%2e%2e/server.js', '/uploads/finance-receipts/%E0%A4%A']) {
      const missing = await request(server, 'GET', target);
      assertCase(missing.status === 404, `${target} must be a 404, got ${missing.status}.`);
    }

    // a local file of the same path still wins (a developer's own uploads keep working)
    fs.mkdirSync(path.join(root, 'news'), { recursive: true });
    fs.writeFileSync(path.join(root, 'news', 'local.png'), 'disk-copy');
    const localFirst = await request(server, 'GET', '/uploads/news/local.png');
    assertCase(localFirst.status === 200 && localFirst.text === 'disk-copy' && localFirst.headers.get('cache-control') === 'public, max-age=604800', 'Local files win and public folders are publicly cacheable.');

    // a later file failing the filter must not leave the first one behind in the bucket
    const before = bucket.size;
    const partial = await request(server, 'POST', '/upload', { body: form([{ name: 'ok.pdf', content: 'first' }, { name: 'reject.pdf', content: 'second' }]) });
    assertCase(partial.status === 400 && bucket.size === before, 'A rejected request must remove the files it already stored.');

    // large files go up in parts, never as one streamed body
    const big = crypto.randomBytes(17 * 1024 * 1024);
    const bigUpload = await request(server, 'POST', '/upload', { body: form([{ name: 'lesson.mp4', content: big }]) });
    assertCase(bigUpload.status === 200, `A 17 MB upload should succeed, got ${bigUpload.status}.`);
    const bigKey = JSON.parse(bigUpload.text).files[0];
    assertCase(bucket.get(bigKey)?.body.equals(big), 'A multipart upload must reassemble byte for byte.');
    assertCase(sent.filter((item) => item.type === 'UploadPartCommand').length === 2, 'A 17 MB file goes up in two parts.');

    assertCase((await service.readUploadedFile(key, { root }))?.equals(content), 'readUploadedFile falls back to R2.');
    assertCase(await service.uploadedFileExists(`/${key}`, { root }), 'uploadedFileExists sees R2 objects.');
    assertCase(await service.removeUploadedFile(key, { root }) && !bucket.has(key), 'removeUploadedFile deletes the R2 object.');
    assertCase(await service.readUploadedFile(key, { root }) === null, 'A removed file reads as null.');
    assertCase(!(await service.removeUploadedFile('uploads/../server.js', { root })), 'Unsafe keys are never deleted.');

    // ---- an explicit local override and a half-done R2 setup -------------------------
    setEnv({ ...R2_ON, UPLOADS_STORAGE: 'local' });
    assertCase(loadService().describeUploadStorage().storage === 'local', 'UPLOADS_STORAGE=local keeps files on disk.');

    setEnv({ R2_STUDENT_BUCKET_NAME: 'school-private', RENDER: 'true' });
    service = loadService();
    assertCase(service.describeUploadStorage().storage === 'misconfigured', 'A bucket without credentials is reported as misconfigured.');
    server = await startApp(service, root);
    servers.push(server);
    const refused = await request(server, 'POST', '/upload', { body: form([{ name: 'x.pdf', content: 'x' }]) });
    assertCase(refused.status === 400 && JSON.parse(refused.text).code === 'UPLOAD_STORAGE_FAILED', 'A broken R2 setup must fail the upload, not keep a file that will vanish.');

    setEnv({ RENDER: 'true' });
    assertCase(JSON.stringify(loadService().describeUploadStorage()) === JSON.stringify({ storage: 'local', durable: false }), 'Local disk on a hosted server is reported as not durable.');
  } finally {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    fs.rmSync(tempBase, { recursive: true, force: true });
    setEnv({});
  }
}

run()
  .then(() => {
    console.log('[check:upload-storage] ok');
  })
  .catch((error) => {
    console.error('[check:upload-storage] failed');
    console.error(error);
    process.exit(1);
  });
