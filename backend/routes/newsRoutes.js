const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const NewsItem = require('../models/NewsItem');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'NewsItem', actionPrefix: 'news_item', audit: auditWrite });

const newsDir = path.join(__dirname, '..', 'uploads', 'news');
if (!fs.existsSync(newsDir)) {
  fs.mkdirSync(newsDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const newsStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, newsDir),
  filename: (req, file, cb) => cb(null, `news-${Date.now()}-${safeName(file.originalname)}`)
});

const newsUpload = multer({
  storage: newsStorage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!ok) return cb(new Error('فرمت تصویر معتبر نیست'), false);
    cb(null, true);
  }
});

const normalizeCategory = (value) => {
  if (!value) return '';
  const v = String(value).toLowerCase();
  if (['news', 'announcement', 'event'].includes(v)) return v;
  return '';
};

const isLocalFile = (url = '') => url.startsWith('uploads/news/');
const removeFile = (url = '') => {
  if (!isLocalFile(url)) return;
  const filePath = path.join(__dirname, '..', url);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

router.get('/', async (req, res) => {
  try {
    const category = normalizeCategory(req.query.category);
    const filter = { enabled: true };
    if (category) filter.category = category;
    const items = await NewsItem.find(filter).sort({ publishedAt: -1, createdAt: -1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اخبار' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await NewsItem.find().sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اخبار' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await NewsItem.findById(req.params.id);
    if (!item || item.enabled === false) {
      return res.status(404).json({ success: false, message: 'خبر یافت نشد' });
    }
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت خبر' });
  }
});

router.post('/upload', requireAuth, requireRole(['admin']), requirePermission('manage_content'), (req, res, next) => {
  newsUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'تصویر الزامی است' });
    }
    const url = `uploads/news/${req.file.filename}`;
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در آپلود تصویر' });
  }
});

router.post('/', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { title, category, summary, content, imageUrl, publishedAt, enabled } = req.body || {};
    if (!title) {
      return res.status(400).json({ success: false, message: 'عنوان خبر الزامی است' });
    }
    const item = await NewsItem.create({
      title,
      category: normalizeCategory(category) || 'news',
      summary: summary || '',
      content: content || '',
      imageUrl: imageUrl || '',
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      enabled: enabled !== false
    });
    res.json({ success: true, item, message: 'خبر ذخیره شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره خبر' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    const update = { ...req.body };
    if (update.category) {
      update.category = normalizeCategory(update.category) || 'news';
    }
    if (update.publishedAt) {
      update.publishedAt = new Date(update.publishedAt);
    }
    const current = await NewsItem.findById(id);
    const item = await NewsItem.findByIdAndUpdate(id, update, { new: true });
    if (!item) {
      return res.status(404).json({ success: false, message: 'خبر یافت نشد' });
    }
    if (current?.imageUrl && current.imageUrl !== item.imageUrl) {
      removeFile(current.imageUrl);
    }
    res.json({ success: true, item, message: 'خبر بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی خبر' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { id } = req.params;
    const item = await NewsItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'خبر یافت نشد' });
    }
    if (item.imageUrl) {
      removeFile(item.imageUrl);
    }
    res.json({ success: true, message: 'خبر حذف شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در حذف خبر' });
  }
});

module.exports = router;
