// Durable storage for everything the routes write under backend/uploads.
//
// Render's filesystem is ephemeral: a deploy, a restart, or a free instance
// spinning down after 15 idle minutes wipes it. Until 2026-10 every multer
// upload (finance receipts, student and staff documents, homework, chat files,
// avatars, news and gallery images, lessons, recordings) lived only there, so
// files vanished within hours while the database kept pointing at them.
//
// Routes still write through multer to backend/uploads and still store
// "uploads/<folder>/<file>" paths, so neither the database nor the frontend
// changes. When an R2 bucket is configured, durableDiskStorage() copies each
// file to the bucket under that same path as its key and drops the local copy,
// and createUploadsMiddleware() serves GET /uploads/* from the bucket (a local
// file of the same path still wins, which keeps a developer's own uploads
// working). Without R2 nothing changes: files stay on local disk.
//
// The bucket is private (no public r2.dev domain): R2_UPLOADS_BUCKET_NAME, or the
// student-document bucket R2_STUDENT_BUCKET_NAME when that is not set. Keys here
// all start with "uploads/", so they never collide with the student-document keys.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
const multer = require('multer');
const {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand
} = require('@aws-sdk/client-s3');

const UPLOADS_ROOT = path.resolve(__dirname, '..', 'uploads');
const SINGLE_PUT_LIMIT = 16 * 1024 * 1024;
const MULTIPART_PART_SIZE = 16 * 1024 * 1024;

// Folders whose files are meant for anonymous visitors; the rest is school data.
const PUBLIC_UPLOAD_FOLDERS = new Set(['news', 'gallery', 'login', 'site']);

const CONTENT_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
});

// Shown in the browser. Anything else — HTML, SVG, office files, archives, text —
// downloads instead and runs sandboxed, so an uploaded page cannot run script
// on the API's origin.
const INLINE_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav'
]);

function storageError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isHostedProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
    || String(process.env.RENDER || '').toLowerCase() === 'true'
    || Boolean(String(process.env.RENDER_SERVICE_ID || '').trim());
}

let cachedClient = { signature: '', client: null };

// null = keep files on local disk. Throws when a bucket is named but the shared
// R2 credentials are incomplete, so a half-done setup fails loudly.
function getUploadsR2() {
  if (String(process.env.UPLOADS_STORAGE || '').trim().toLowerCase() === 'local') return null;
  const bucket = String(process.env.R2_UPLOADS_BUCKET_NAME || process.env.R2_STUDENT_BUCKET_NAME || '').trim();
  if (!bucket) return null;

  const missing = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT']
    .filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw storageError('UPLOAD_STORAGE_CONFIG_MISSING', `Upload storage is missing: ${missing.join(', ')}`);
  }

  const endpoint = process.env.R2_ENDPOINT.trim().replace(/\/+$/, '');
  const accessKeyId = process.env.R2_ACCESS_KEY_ID.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY.trim();
  const signature = `${endpoint}|${accessKeyId}|${secretAccessKey}`;
  if (cachedClient.signature !== signature) {
    cachedClient = {
      signature,
      client: new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        // R2 is S3-compatible, not S3: skip the SDK's default CRC32 trailers.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED'
      })
    };
  }
  return { bucket, client: cachedClient.client };
}

function describeUploadStorage() {
  try {
    if (getUploadsR2()) return { storage: 'r2', durable: true };
    return { storage: 'local', durable: !isHostedProduction() };
  } catch {
    return { storage: 'misconfigured', durable: false };
  }
}

let warnedEphemeral = false;
function warnIfEphemeral() {
  if (warnedEphemeral || !isHostedProduction()) return;
  const { storage } = describeUploadStorage();
  if (storage === 'r2') return;
  warnedEphemeral = true;
  console.error('[uploads] WARNING: uploads are on the local disk of a hosted server, which is wiped on every deploy, restart and spin-down. Set R2_UPLOADS_BUCKET_NAME (or R2_STUDENT_BUCKET_NAME) with the R2 credentials.');
}

function logUploadStorageMode() {
  const { storage } = describeUploadStorage();
  if (storage === 'r2') console.log('[uploads] storage: R2 bucket (durable)');
  else if (storage === 'misconfigured') console.error('[uploads] storage: R2 bucket named but credentials incomplete - uploads will fail');
  else if (isHostedProduction()) warnIfEphemeral();
  else console.log('[uploads] storage: local disk');
}

// "uploads/a/b.pdf" or "/uploads/a/b.pdf" -> "uploads/a/b.pdf"; anything else -> ''.
function normalizeUploadKey(value = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!raw.startsWith('uploads/')) return '';
  const segments = raw.split('/');
  if (segments.length < 2 || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\0'))) {
    return '';
  }
  return segments.join('/');
}

// A signed link segment (uploadLinkService) inside a stored value — e.g. a form
// that sent a path it was shown back to the server — is not part of the file's
// key. Only stored values go through this, never request paths: those must be
// verified by uploadLinkService first.
const SIGNED_LINK_SEGMENT = /(^|\/)uploads\/s\/\d{1,12}\.[A-Za-z0-9_-]{32}\//;
function stripUploadSignature(value = '') {
  return String(value || '').replace(SIGNED_LINK_SEGMENT, '$1uploads/');
}

function keyForLocalPath(localPath = '', root = UPLOADS_ROOT) {
  const relative = path.relative(path.resolve(root), path.resolve(String(localPath || '')));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';
  return normalizeUploadKey(`uploads/${relative.split(path.sep).join('/')}`);
}

function localPathForKey(key = '', root = UPLOADS_ROOT) {
  const normalized = normalizeUploadKey(key);
  if (!normalized) return '';
  const base = path.resolve(root);
  const target = path.resolve(base, ...normalized.split('/').slice(1));
  return target.startsWith(`${base}${path.sep}`) ? target : '';
}

function contentTypeForKey(key = '') {
  return CONTENT_TYPES[path.extname(String(key || '')).toLowerCase()] || 'application/octet-stream';
}

function isPublicUploadKey(key = '') {
  const segments = normalizeUploadKey(key).split('/');
  return segments.length > 2 && PUBLIC_UPLOAD_FOLDERS.has(segments[1]);
}

function isNotFound(error) {
  const status = Number(error?.$metadata?.httpStatusCode || 0);
  return status === 404 || error?.name === 'NoSuchKey' || error?.name === 'NotFound';
}

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function putFileToR2(r2, key, localPath, size) {
  const ContentType = contentTypeForKey(key);
  if (size <= SINGLE_PUT_LIMIT) {
    await r2.client.send(new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: await fsp.readFile(localPath),
      ContentType
    }));
    return;
  }

  // Large lesson videos and recordings go up in parts, so no request body is
  // ever a stream the SDK cannot replay and memory stays at one part.
  const { UploadId } = await r2.client.send(new CreateMultipartUploadCommand({ Bucket: r2.bucket, Key: key, ContentType }));
  const handle = await fsp.open(localPath, 'r');
  try {
    const parts = [];
    let position = 0;
    for (let PartNumber = 1; position < size; PartNumber += 1) {
      const length = Math.min(MULTIPART_PART_SIZE, size - position);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      if (!bytesRead) throw storageError('UPLOAD_READ_SHORT', `Could not read ${localPath}`);
      const part = await r2.client.send(new UploadPartCommand({
        Bucket: r2.bucket,
        Key: key,
        UploadId,
        PartNumber,
        Body: bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
      }));
      parts.push({ PartNumber, ETag: part.ETag, ...(part.ChecksumCRC32 ? { ChecksumCRC32: part.ChecksumCRC32 } : {}) });
      position += bytesRead;
    }
    await r2.client.send(new CompleteMultipartUploadCommand({
      Bucket: r2.bucket,
      Key: key,
      UploadId,
      MultipartUpload: { Parts: parts }
    }));
  } catch (error) {
    await r2.client.send(new AbortMultipartUploadCommand({ Bucket: r2.bucket, Key: key, UploadId })).catch(() => {});
    throw error;
  } finally {
    await handle.close();
  }
}

// Copies a file multer just wrote under `root` to R2 (same relative path as the
// key) and removes the local copy. Without R2 the file simply stays where it is.
async function persistLocalUpload(localPath, { root = UPLOADS_ROOT } = {}) {
  const r2 = getUploadsR2();
  if (!r2) {
    warnIfEphemeral();
    return { storage: 'local', key: keyForLocalPath(localPath, root) };
  }
  const key = keyForLocalPath(localPath, root);
  if (!key) throw storageError('UPLOAD_KEY_INVALID', `Upload is outside ${root}: ${localPath}`);
  const stats = await fsp.stat(localPath);
  await putFileToR2(r2, key, localPath, stats.size);
  await fsp.unlink(localPath).catch(() => {});
  return { storage: 'r2', key };
}

async function removeR2Object(key) {
  const r2 = getUploadsR2();
  if (!r2 || !key) return;
  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

// Deletes a stored upload ("uploads/..." path) from R2 and from local disk.
async function removeUploadedFile(value, { root = UPLOADS_ROOT } = {}) {
  const key = normalizeUploadKey(stripUploadSignature(value));
  if (!key) return false;
  const localPath = localPathForKey(key, root);
  if (localPath) {
    await fsp.unlink(localPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  await removeR2Object(key);
  return true;
}

// The bytes of a stored upload, or null when it no longer exists anywhere.
async function readUploadedFile(value, { root = UPLOADS_ROOT } = {}) {
  const key = normalizeUploadKey(stripUploadSignature(value));
  if (!key) return null;
  const localPath = localPathForKey(key, root);
  if (localPath) {
    try {
      return await fsp.readFile(localPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const r2 = getUploadsR2();
  if (!r2) return null;
  try {
    const object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    return await bodyToBuffer(object.Body);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function uploadedFileExists(value, { root = UPLOADS_ROOT } = {}) {
  const key = normalizeUploadKey(stripUploadSignature(value));
  if (!key) return false;
  const localPath = localPathForKey(key, root);
  if (localPath && fs.existsSync(localPath)) return true;
  const r2 = getUploadsR2();
  if (!r2) return false;
  try {
    await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

// A drop-in for multer.diskStorage(options): same destination/filename
// callbacks, same req.file fields — plus the copy to R2 described above.
function durableDiskStorage(options = {}, { root = UPLOADS_ROOT } = {}) {
  const disk = multer.diskStorage(options);
  return {
    _handleFile(req, file, cb) {
      disk._handleFile(req, file, (error, info) => {
        if (error) return cb(error);
        persistLocalUpload(info.path, { root })
          .then(() => cb(null, info))
          .catch((persistError) => {
            console.error(`[uploads] storing ${info.path} failed:`, persistError?.message || persistError);
            fs.unlink(info.path, () => {
              cb(storageError('UPLOAD_STORAGE_FAILED', 'ذخیرهٔ فایل ناموفق بود؛ لطفاً دوباره تلاش کنید.'));
            });
          });
      });
    },
    // multer calls this for files already stored when the request fails later on.
    _removeFile(req, file, cb) {
      const key = keyForLocalPath(file.path, root);
      Promise.resolve(key ? removeUploadedFile(key, { root }) : null)
        .then(() => cb(null), (error) => cb(error));
    }
  };
}

function setUploadHeaders(res, key) {
  const contentType = contentTypeForKey(key);
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', isPublicUploadKey(key) ? 'public, max-age=604800' : 'private, max-age=86400');
  if (!INLINE_CONTENT_TYPES.has(contentType)) {
    const name = path.basename(key);
    const asciiName = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  }
}

// Single ranges only (what video players send); anything else is served whole.
function parseRangeHeader(value = '') {
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(value || '').trim());
  if (!match || (!match[1] && !match[2])) return '';
  if (match[1] && match[2] && Number(match[2]) < Number(match[1])) return '';
  return `bytes=${match[1]}-${match[2]}`;
}

function keyFromRequestPath(requestPath = '') {
  try {
    return normalizeUploadKey(`uploads${decodeURIComponent(String(requestPath || ''))}`);
  } catch {
    return '';
  }
}

function sendUploadNotFound(res) {
  if (res.headersSent) return res.end();
  return res.status(404).type('text/plain; charset=utf-8').send('فایل پیدا نشد.');
}

async function serveFromR2(req, res, next) {
  const r2 = getUploadsR2();
  if (!r2) return sendUploadNotFound(res);
  const key = keyFromRequestPath(req.path);
  if (!key) return sendUploadNotFound(res);

  if (req.method === 'HEAD') {
    try {
      const head = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
      setUploadHeaders(res, key);
      res.setHeader('Accept-Ranges', 'bytes');
      if (head.ETag) res.setHeader('ETag', head.ETag);
      if (head.ContentLength != null) res.setHeader('Content-Length', String(head.ContentLength));
      return res.status(200).end();
    } catch (error) {
      if (isNotFound(error)) return sendUploadNotFound(res);
      return next(error);
    }
  }

  const input = { Bucket: r2.bucket, Key: key };
  const range = parseRangeHeader(req.headers.range);
  if (range) input.Range = range;
  else if (req.headers['if-none-match']) input.IfNoneMatch = String(req.headers['if-none-match']);

  let object;
  try {
    object = await r2.client.send(new GetObjectCommand(input));
  } catch (error) {
    const status = Number(error?.$metadata?.httpStatusCode || 0);
    if (status === 304) return res.status(304).end();
    if (isNotFound(error)) return sendUploadNotFound(res);
    if (status === 416 || error?.name === 'InvalidRange') {
      return res.status(416).setHeader('Content-Range', 'bytes */*').end();
    }
    return next(error);
  }

  setUploadHeaders(res, key);
  res.setHeader('Accept-Ranges', 'bytes');
  if (object.ETag) res.setHeader('ETag', object.ETag);
  if (object.LastModified) res.setHeader('Last-Modified', new Date(object.LastModified).toUTCString());
  if (object.ContentRange) {
    res.status(206);
    res.setHeader('Content-Range', object.ContentRange);
  }
  if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));

  const body = object.Body;
  if (!body || typeof body.pipe !== 'function') {
    return res.end(await bodyToBuffer(body));
  }
  res.on('close', () => {
    if (!body.destroyed) body.destroy();
  });
  body.on('error', (error) => {
    console.error(`[uploads] streaming ${key} failed:`, error?.message || error);
    res.destroy(error);
  });
  return body.pipe(res);
}

// Mount at /uploads: a local file wins, otherwise the R2 object of that path.
function createUploadsMiddleware({ root = UPLOADS_ROOT } = {}) {
  const serveLocal = express.static(root, {
    index: false,
    fallthrough: true,
    setHeaders: (res, filePath) => setUploadHeaders(res, keyForLocalPath(filePath, root))
  });
  return function serveUploads(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    return serveLocal(req, res, (error) => {
      if (error) return next(error);
      return serveFromR2(req, res, next).catch(next);
    });
  };
}

module.exports = {
  PUBLIC_UPLOAD_FOLDERS,
  UPLOADS_ROOT,
  contentTypeForKey,
  createUploadsMiddleware,
  describeUploadStorage,
  durableDiskStorage,
  getUploadsR2,
  isPublicUploadKey,
  keyForLocalPath,
  keyFromRequestPath,
  localPathForKey,
  logUploadStorageMode,
  normalizeUploadKey,
  parseRangeHeader,
  persistLocalUpload,
  readUploadedFile,
  removeUploadedFile,
  stripUploadSignature,
  uploadedFileExists
};
