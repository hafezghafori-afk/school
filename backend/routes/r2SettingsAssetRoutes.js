const express = require('express');
const path = require('path');
const multer = require('multer');
const SiteSettings = require('../models/SiteSettings');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { storeSiteAsset } = require('../services/siteAssetStorageService');

// This router is mounted ahead of the legacy disk-backed settings routes by
// r2ServerBootstrap.js (the actual `npm start` entry point) - see that file.
// storeSiteAsset shares its R2 upload logic with the legacy routes'
// fallback path, so both entry points support the exact same set of assets
// (adding a new one here used to mean also remembering to add it to the
// legacy handler and vice versa - that drift is how departmentLogo ended up
// supported in the admin UI and the legacy route, but silently dropped
// here, since this router matches /assets first and never falls through).

const router = express.Router();

attachWriteActivityAudit(router, { targetType: 'R2SettingsAsset', actionPrefix: 'r2_settings_asset', audit: (payload) => logActivity(payload) });

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

const uploadMiddleware = (handler) => (req, res, next) => {
  handler(req, res, (error) => {
    if (error) return res.status(400).json({ success: false, message: error.message });
    next();
  });
};

const siteAssetErrorMessage = (error) => (
  error?.code === 'SITE_ASSET_STORAGE_CONFIG_MISSING'
    ? 'ذخیره‌سازی عمومی وب‌سایت روی سرور تنظیم نشده است. متغیرهای R2_BUCKET_NAME، R2_PUBLIC_URL، R2_ACCESS_KEY_ID، R2_SECRET_ACCESS_KEY و R2_ENDPOINT را در Render تنظیم کنید.'
    : null
);

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
      settings.logoUrl = await storeSiteAsset({ file: req.file, prefix: 'logo' });
      await settings.save();
      return res.json({ success: true, settings, message: 'لوگو بروزرسانی شد' });
    } catch (error) {
      const configMessage = siteAssetErrorMessage(error);
      if (!configMessage) console.error('Site logo upload failed:', error);
      return res.status(configMessage ? 503 : 500).json({ success: false, message: configMessage || error.message || 'خطا در آپلود لوگو' });
    }
  }
);

router.put(
  '/assets',
  ...adminAssetAccess,
  uploadMiddleware(assetUpload.fields([
    { name: 'schoolLogo', maxCount: 1 },
    { name: 'ministryLogo', maxCount: 1 },
    { name: 'departmentLogo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'stamp', maxCount: 1 }
  ])),
  async (req, res) => {
    try {
      const settings = await loadSettings();

      if (req.files?.schoolLogo?.[0]) {
        settings.schoolLogoUrl = await storeSiteAsset({ file: req.files.schoolLogo[0], prefix: 'school-logo' });
        settings.logoUrl = settings.schoolLogoUrl;
      }
      if (req.files?.ministryLogo?.[0]) {
        settings.ministryLogoUrl = await storeSiteAsset({ file: req.files.ministryLogo[0], prefix: 'ministry-logo' });
      }
      if (req.files?.departmentLogo?.[0]) {
        settings.departmentLogoUrl = await storeSiteAsset({ file: req.files.departmentLogo[0], prefix: 'department-logo' });
      }
      if (req.files?.signature?.[0]) {
        settings.signatureUrl = await storeSiteAsset({ file: req.files.signature[0], prefix: 'signature' });
      }
      if (req.files?.stamp?.[0]) {
        settings.stampUrl = await storeSiteAsset({ file: req.files.stamp[0], prefix: 'stamp' });
      }
      if (req.body?.signatureName) {
        settings.signatureName = String(req.body.signatureName);
      }

      await settings.save();
      return res.json({ success: true, settings, message: 'دارایی‌ها بروزرسانی شد' });
    } catch (error) {
      const configMessage = siteAssetErrorMessage(error);
      if (!configMessage) console.error('Site asset upload failed:', error);
      return res.status(configMessage ? 503 : 500).json({ success: false, message: configMessage || error.message || 'خطا در بروزرسانی دارایی‌ها' });
    }
  }
);

module.exports = router;
