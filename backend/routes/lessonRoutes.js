const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Lesson = require('../models/Lesson');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'Lesson', actionPrefix: 'lesson', audit: auditWrite });

const lessonDir = path.join(__dirname, '..', 'uploads', 'lessons');
if (!fs.existsSync(lessonDir)) {
  fs.mkdirSync(lessonDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, lessonDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${safeName(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.mp4', '.pdf', '.webm', '.mov'].includes(ext);
    if (!ok) return cb(new Error('فرمت فایل نامعتبر است'), false);
    cb(null, true);
  }
});

router.post('/upload/:lessonId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const lessonId = req.params.lessonId;
    if (!req.file) return res.status(400).json({ success: false, message: 'فایل لازم است' });
    const contentUrl = `uploads/lessons/${req.file.filename}`;
    const lesson = await Lesson.findByIdAndUpdate(
      lessonId,
      { contentUrl },
      { new: true }
    );
    if (!lesson) return res.status(404).json({ success: false, message: 'درس یافت نشد' });
    res.json({ success: true, lesson });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در آپلود فایل درس' });
  }
});

module.exports = router;
