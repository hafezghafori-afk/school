const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const GalleryItem = require('../models/GalleryItem');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'GalleryItem', actionPrefix: 'gallery_item', audit: auditWrite });

const galleryDir = path.join(__dirname, '..', 'uploads', 'gallery');
if (!fs.existsSync(galleryDir)) {
  fs.mkdirSync(galleryDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const galleryStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, galleryDir),
  filename: (req, file, cb) => cb(null, `gallery-${Date.now()}-${safeName(file.originalname)}`)
});

const galleryUpload = multer({
  storage: galleryStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!ok) return cb(new Error('فرمت تصویر معتبر نیست'), false);
    cb(null, true);
  }
});

router.get('/', async (req, res) => {
  try {
    const items = await GalleryItem.find({ enabled: true }).sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت گالری' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await GalleryItem.find().sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت گالری' });
  }
});

router.post('/upload', requireAuth, requireRole(['admin']), requirePermission('manage_content'), (req, res, next) => {
  galleryUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'تصویر الزامی است' });
    }
    const url = `uploads/gallery/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در آپلود تصویر' });
  }
});

router.post('/', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { title, tag, imageUrl, description, enabled } = req.body || {};
    if (!title || !imageUrl) {
      return res.status(400).json({ success: false, message: 'عنوان و تصویر الزامی است' });
    }
    const item = await GalleryItem.create({
      title,
      tag: tag || '',
      imageUrl,
      description: description || '',
      enabled: enabled !== false
    });
    res.json({ success: true, item, message: 'آیتم گالری ذخیره شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره گالری' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    const item = await GalleryItem.findByIdAndUpdate(id, req.body || {}, { new: true });
    if (!item) {
      return res.status(404).json({ success: false, message: 'آیتم یافت نشد' });
    }
    res.json({ success: true, item, message: 'گالری بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی گالری' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    const item = await GalleryItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'آیتم یافت نشد' });
    }
    res.json({ success: true, message: 'آیتم حذف شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در حذف گالری' });
  }
});

module.exports = router;
