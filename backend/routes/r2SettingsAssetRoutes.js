const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const SiteSettings = require('../models/SiteSettings');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();

attachWriteActivityAudit(router, { targetType: 'R2SettingsAsset', actionPrefix: 'r2_settings_asset', audit: (payload) => logActivity(payload) });

const requiredEnv = [
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_ENDPOINT',
  'R2_PUBLIC_URL'
];

const getR2Config = () => {
  const missing = requiredEnv.filter((name) => !String(process.env[name] || '').trim());
  if (missing.length) {
    const error = new Error(`تنظیمات Cloudflare R2 ناقص است: ${missing.join(', ')}`);
    error.code = 'R2_CONFIG_MISSING';
    throw error;
  }

  return {
    bucket: process.env.R2_BUCKET_NAME.trim(),
    publicUrl: process.env.R2_PUBLIC_URL.trim().replace(/\/+$/, ''),
    client: new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT.trim().replace(/\/+$/, ''),
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY.trim()
      }
    })
  };
};

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);
const memoryStorage = multer.memoryStorage();

const imageFileFilter = (message) => (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!allowedExtensions.has(ext)) return cb(new Error(message), false);
  cb(null, true);
};

const logoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter('فرمت لوگو معتبر نیست')
});

const assetUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: imageFileFilter('فرمت فایل معتبر نیست')
});

const loadSettings = async () => {
  let settings = await SiteSettings.findOne();
  if (!settings) settings = new SiteSettings({});
  return settings;
};

const uploadToR2 = async (file, prefix) => {
  const { client, bucket, publicUrl } = getR2Config();
  const ext = path.extname(file.originalname || '').toLowerCase();
  const key = `site/${prefix}-${Date.now()}-${crypto.randomUUID()}${ext}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable'
  }));

  return `${publicUrl}/${key}`;
};

const uploadMiddleware = (handler) => (req, res, next) => {
  handler(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    next();
  });
};

const adminAssetAccess = [requireAuth, requireRole(['admin']), requirePermission('manage_content')];

router.put(
  '/logo',
  ...adminAssetAccess,
  uploadMiddleware(logoUpload.single('logo')),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'لوگو الزامی است' });
      }

      const settings = await loadSettings();
      settings.logoUrl = await uploadToR2(req.file, 'logo');
      await settings.save();
      return res.json({ success: true, settings, message: 'لوگو در Cloudflare R2 بروزرسانی شد' });
    } catch (error) {
      console.error('R2 logo upload failed:', error);
      return res.status(500).json({ success: false, message: error.message || 'خطا در آپلود لوگو' });
    }
  }
);

router.put(
  '/assets',
  ...adminAssetAccess,
  uploadMiddleware(assetUpload.fields([
    { name: 'schoolLogo', maxCount: 1 },
    { name: 'ministryLogo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'stamp', maxCount: 1 }
  ])),
  async (req, res) => {
    try {
      const settings = await loadSettings();

      if (req.files?.schoolLogo?.[0]) {
        settings.schoolLogoUrl = await uploadToR2(req.files.schoolLogo[0], 'school-logo');
        settings.logoUrl = settings.schoolLogoUrl;
      }
      if (req.files?.ministryLogo?.[0]) {
        settings.ministryLogoUrl = await uploadToR2(req.files.ministryLogo[0], 'ministry-logo');
      }
      if (req.files?.signature?.[0]) {
        settings.signatureUrl = await uploadToR2(req.files.signature[0], 'signature');
      }
      if (req.files?.stamp?.[0]) {
        settings.stampUrl = await uploadToR2(req.files.stamp[0], 'stamp');
      }
      if (req.body?.signatureName) {
        settings.signatureName = String(req.body.signatureName);
      }

      await settings.save();
      return res.json({ success: true, settings, message: 'دارایی‌ها در Cloudflare R2 بروزرسانی شد' });
    } catch (error) {
      console.error('R2 asset upload failed:', error);
      return res.status(500).json({ success: false, message: error.message || 'خطا در بروزرسانی دارایی‌ها' });
    }
  }
);

module.exports = router;
