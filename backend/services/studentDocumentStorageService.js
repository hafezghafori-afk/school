const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');

const PRIVATE_UPLOAD_ROOT = path.join(__dirname, '..', 'private-uploads', 'student-documents');
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const MIME_EXTENSIONS = Object.freeze({
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
});

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

function getPrivateR2Config() {
  const bucket = String(process.env.R2_STUDENT_BUCKET_NAME || '').trim();
  if (!bucket) return null;

  const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw storageError(
      'STUDENT_DOCUMENT_STORAGE_CONFIG_MISSING',
      `Private student document storage is missing: ${missing.join(', ')}`
    );
  }

  return {
    bucket,
    client: new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT.trim().replace(/\/+$/, ''),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim()
      }
    })
  };
}

function normalizeStudentRef(studentRef = '') {
  return String(studentRef || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'unknown';
}

function safeOriginalName(value = '') {
  return path.basename(String(value || 'document')).replace(/[\r\n\0]/g, '').slice(0, 180) || 'document';
}

function assertAcceptedFile(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw storageError('STUDENT_DOCUMENT_FILE_REQUIRED', 'Student document file is required.');
  }
  const mimeType = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw storageError('STUDENT_DOCUMENT_TYPE_INVALID', 'Student document type is invalid.');
  }
  return mimeType;
}

function resolvePrivateLocalPath(storageKey = '') {
  const normalizedKey = String(storageKey || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const targetPath = path.resolve(PRIVATE_UPLOAD_ROOT, normalizedKey);
  const rootPath = path.resolve(PRIVATE_UPLOAD_ROOT);
  if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`)) {
    throw storageError('STUDENT_DOCUMENT_KEY_INVALID', 'Student document key is invalid.');
  }
  return targetPath;
}

async function storeStudentDocumentFile({ file, studentRef }) {
  const mimeType = assertAcceptedFile(file);
  const extension = MIME_EXTENSIONS[mimeType];
  const storageKey = `students/${normalizeStudentRef(studentRef)}/documents/${Date.now()}-${crypto.randomUUID()}${extension}`;
  const originalName = safeOriginalName(file.originalname);
  const size = Number(file.size || file.buffer.length || 0);
  const r2 = getPrivateR2Config();

  if (r2) {
    await r2.client.send(new PutObjectCommand({
      Bucket: r2.bucket,
      Key: storageKey,
      Body: file.buffer,
      ContentType: mimeType,
      CacheControl: 'private, no-store',
      Metadata: { originalname: encodeURIComponent(originalName) }
    }));
    return { storageProvider: 'r2_private', storageKey, originalName, mimeType, size, fileUrl: '' };
  }

  if (isHostedProduction()) {
    throw storageError(
      'STUDENT_DOCUMENT_STORAGE_CONFIG_MISSING',
      'R2_STUDENT_BUCKET_NAME is required for private student documents in production.'
    );
  }

  const localPath = resolvePrivateLocalPath(storageKey);
  await fsp.mkdir(path.dirname(localPath), { recursive: true });
  await fsp.writeFile(localPath, file.buffer, { flag: 'wx' });
  return { storageProvider: 'local_private', storageKey, originalName, mimeType, size, fileUrl: '' };
}

async function removeStudentDocumentFile(document = {}) {
  const provider = String(document.storageProvider || '');
  const storageKey = String(document.storageKey || '');
  if (!storageKey) return;

  if (provider === 'r2_private') {
    const r2 = getPrivateR2Config();
    if (!r2) return;
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: storageKey }));
    return;
  }

  if (provider === 'local_private') {
    const localPath = resolvePrivateLocalPath(storageKey);
    await fsp.unlink(localPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

function legacyLocalKey(fileUrl = '') {
  const normalized = String(fileUrl || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const prefix = 'uploads/student-profiles/';
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : '';
}

async function openStudentDocumentFile(document = {}) {
  const provider = String(document.storageProvider || 'legacy');
  const storageKey = String(document.storageKey || '');

  if (provider === 'r2_private' && storageKey) {
    const r2 = getPrivateR2Config();
    if (!r2) throw storageError('STUDENT_DOCUMENT_STORAGE_CONFIG_MISSING');
    const response = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: storageKey }));
    if (!response.Body) throw storageError('STUDENT_DOCUMENT_FILE_NOT_FOUND');
    return {
      body: response.Body,
      contentLength: Number(response.ContentLength || document.size || 0),
      mimeType: String(response.ContentType || document.mimeType || 'application/octet-stream')
    };
  }

  if (provider === 'local_private' && storageKey) {
    const localPath = resolvePrivateLocalPath(storageKey);
    const stats = await fsp.stat(localPath).catch((error) => {
      if (error?.code === 'ENOENT') throw storageError('STUDENT_DOCUMENT_FILE_NOT_FOUND');
      throw error;
    });
    return {
      body: fs.createReadStream(localPath),
      contentLength: stats.size,
      mimeType: String(document.mimeType || 'application/octet-stream')
    };
  }

  const legacyKey = legacyLocalKey(document.fileUrl);
  if (legacyKey) {
    const legacyRoot = path.join(__dirname, '..', 'uploads', 'student-profiles');
    const localPath = path.resolve(legacyRoot, legacyKey);
    if (!localPath.startsWith(`${path.resolve(legacyRoot)}${path.sep}`)) {
      throw storageError('STUDENT_DOCUMENT_KEY_INVALID');
    }
    const stats = await fsp.stat(localPath).catch((error) => {
      if (error?.code === 'ENOENT') throw storageError('STUDENT_DOCUMENT_FILE_NOT_FOUND');
      throw error;
    });
    return {
      body: fs.createReadStream(localPath),
      contentLength: stats.size,
      mimeType: String(document.mimeType || 'application/octet-stream')
    };
  }

  throw storageError('STUDENT_DOCUMENT_FILE_NOT_FOUND');
}

module.exports = {
  ALLOWED_MIME_TYPES,
  openStudentDocumentFile,
  removeStudentDocumentFile,
  storeStudentDocumentFile
};
