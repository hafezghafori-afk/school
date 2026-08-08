// Stores publicly-visible site assets (school/ministry/department logos,
// signature, stamp) in the SAME Cloudflare R2 account as the private
// student-document bucket (studentDocumentStorageService.js) - just a
// different, public bucket (R2_BUCKET_NAME + R2_PUBLIC_URL) since these
// need to be viewable by visitors, not proxied through the backend.
//
// Without this, uploads were written straight to local disk
// (uploads/site/...) via multer.diskStorage - which works locally, but on
// Render's ephemeral filesystem, every new deploy wipes that directory and
// silently loses whatever logos/signature/stamp were uploaded since the
// last one. Mirrors the fallback rule already used for student documents:
// local disk only outside hosted production; R2 required once deployed.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');

const LOCAL_UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'site');

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

function getPublicR2Config() {
  const bucket = String(process.env.R2_BUCKET_NAME || '').trim();
  const publicUrl = String(process.env.R2_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (!bucket || !publicUrl) return null;

  const required = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT'];
  const missing = required.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    throw storageError(
      'SITE_ASSET_STORAGE_CONFIG_MISSING',
      `Public site asset storage is missing: ${missing.join(', ')}`
    );
  }

  return {
    bucket,
    publicUrl,
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

function safeExt(originalname = '') {
  const ext = path.extname(String(originalname || '')).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '';
}

/**
 * @param {{ file: Express.Multer.File, prefix?: string }} args
 * @returns {Promise<string>} the URL to store on the settings document -
 *   a full https:// R2 public URL when R2 is configured, or a relative
 *   "uploads/site/..." path in local dev without R2.
 */
async function storeSiteAsset({ file, prefix = 'asset' } = {}) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer)) {
    throw storageError('SITE_ASSET_FILE_REQUIRED', 'File is required.');
  }
  const ext = safeExt(file.originalname);
  const r2 = getPublicR2Config();

  if (r2) {
    const key = `site/${prefix}-${Date.now()}-${crypto.randomUUID()}${ext}`;
    await r2.client.send(new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
      CacheControl: 'public, max-age=31536000, immutable'
    }));
    return `${r2.publicUrl}/${key}`;
  }

  if (isHostedProduction()) {
    throw storageError(
      'SITE_ASSET_STORAGE_CONFIG_MISSING',
      'R2_BUCKET_NAME/R2_PUBLIC_URL are required for site assets in production.'
    );
  }

  if (!fs.existsSync(LOCAL_UPLOAD_ROOT)) {
    fs.mkdirSync(LOCAL_UPLOAD_ROOT, { recursive: true });
  }
  const filename = `${prefix}-${Date.now()}-${crypto.randomUUID()}${ext}`;
  fs.writeFileSync(path.join(LOCAL_UPLOAD_ROOT, filename), file.buffer);
  return `uploads/site/${filename}`;
}

module.exports = { storeSiteAsset };
