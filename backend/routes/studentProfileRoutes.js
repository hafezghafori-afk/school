const express = require('express');

const path = require('path');
const multer = require('multer');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const {
  addStudentDocument,
  addStudentRemark,
  addStudentTransfer,
  getStudentDocument,
  getStudentProfile,
  linkGuardianToStudent,
  listGuardianCandidates,
  listStudentProfiles,
  unlinkGuardianFromStudent,
  updateStudentProfileBasics
} = require('../services/studentProfileService');
const {
  ALLOWED_MIME_TYPES,
  openStudentDocumentFile,
  removeStudentDocumentFile,
  storeStudentDocumentFile
} = require('../services/studentDocumentStorageService');
const { assertSafeStudentInput } = require('../utils/studentInputSafety');

const router = express.Router();

const studentProfileDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const valid = ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase());
    callback(valid ? null : new Error('invalid_student_profile_document_type'), valid);
  }
});

const uploadStudentProfileDocument = (req, res, next) => {
  studentProfileDocumentUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'حجم سند نباید بیشتر از ۸ مگابایت باشد.'
      : 'نوع فایل معتبر نیست؛ فقط PDF، JPG، PNG و WEBP پذیرفته می‌شود.';
    return res.status(400).json({ success: false, message });
  });
};

const studentDocumentAccess = [
  requireAuth,
  requireRole(['admin']),
  requireAnyPermission(['students.documents.manage', 'students.manage', 'manage_users'])
];

function documentStorageMessage(error) {
  if (error?.code === 'STUDENT_DOCUMENT_STORAGE_CONFIG_MISSING') {
    return 'ذخیره‌سازی خصوصی اسناد شاگرد در سرور تنظیم نشده است. متغیر R2_STUDENT_BUCKET_NAME را در Render تنظیم کنید.';
  }
  if (error?.code === 'STUDENT_DOCUMENT_FILE_NOT_FOUND') {
    return 'فایل این سند در ذخیره‌سازی پیدا نشد.';
  }
  if (error?.code === 'STUDENT_DOCUMENT_TYPE_INVALID') {
    return 'نوع فایل معتبر نیست؛ فقط PDF، JPG، PNG و WEBP پذیرفته می‌شود.';
  }
  return 'افزودن سند شاگرد ناموفق بود.';
}

router.get('/', requireAuth, requireRole(['admin']), requireAnyPermission(['students.profile.view', 'students.manage', 'view_reports', 'manage_users']), async (req, res) => {
  try {
    const items = await listStudentProfiles({ query: req.query.q || '' });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت پروفایل‌های شاگردان ناموفق بود.' });
  }
});

router.get('/guardian-users/search', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const items = await listGuardianCandidates({ query: req.query.q || '' });
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت فهرست والدین/سرپرستان ناموفق بود.' });
  }
});

router.get('/linkable-students/search', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    const items = await listStudentProfiles({ query });
    return res.json({
      success: true,
      items: items.slice(0, query ? 20 : 12)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت فهرست متعلم‌ها برای وصل‌کردن والد ناموفق بود.' });
  }
});

router.get('/:studentRef', requireAuth, requireRole(['admin']), requireAnyPermission(['students.profile.view', 'students.manage', 'view_reports', 'manage_users']), async (req, res) => {
  try {
    const item = await getStudentProfile(req.params.studentRef);
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل شاگرد پیدا نشد.' });
    }
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت پروفایل شاگرد ناموفق بود.' });
  }
});

router.put('/:studentRef', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    assertSafeStudentInput(req.body || {});
    const item = await updateStudentProfileBasics(req.params.studentRef, req.body || {});
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل شاگرد پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'update_student_profile',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        fullName: String(item?.identity?.fullName || ''),
        updatedSections: Object.keys(req.body || {})
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const status = Number(error?.status || 500);
    const message = error?.code === 'student_profile_system_message_placeholder_rejected'
      ? 'متن پیام سیستمی را نمی‌توان به‌عنوان مشخصات شاگرد ذخیره کرد؛ صفحه را تازه کنید و دوباره تلاش نمایید.'
      : 'به‌روزرسانی پروفایل شاگرد ناموفق بود.';
    return res.status(status).json({ success: false, code: error?.code || '', message });
  }
});

router.post('/:studentRef/remarks', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    if (!String(req.body?.text || '').trim()) {
      return res.status(400).json({ success: false, message: 'نوشتن متن ملاحظه الزامی است.' });
    }
    const item = await addStudentRemark(req.params.studentRef, req.body || {}, req.user?.id || null);
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل شاگرد پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'add_student_remark',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        type: String(req.body?.type || 'general'),
        title: String(req.body?.title || '').trim(),
        visibility: String(req.body?.visibility || 'admin'),
        remarkCount: Number(item?.summary?.remarkCount || 0)
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'افزودن ملاحظه شاگرد ناموفق بود.' });
  }
});

router.post('/:studentRef/transfers', requireAuth, requireRole(['admin']), requirePermission('students.transfers.manage'), async (req, res) => {
  try {
    const item = await addStudentTransfer(req.params.studentRef, req.body || {});
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل شاگرد پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'add_student_transfer',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        direction: String(req.body?.direction || ''),
        fromLabel: String(req.body?.fromLabel || '').trim(),
        toLabel: String(req.body?.toLabel || '').trim(),
        transferCount: Number(item?.summary?.transferCount || 0)
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'افزودن سابقه تبدیلی شاگرد ناموفق بود.' });
  }
});

router.get('/:studentRef/documents/:documentRef/file', ...studentDocumentAccess, async (req, res) => {
  try {
    const record = await getStudentDocument(req.params.studentRef, req.params.documentRef);
    if (!record) {
      return res.status(404).json({ success: false, message: 'سند شاگرد پیدا نشد.' });
    }
    const opened = await openStudentDocumentFile(record.document);
    const originalName = String(record.document.originalName || record.document.title || 'student-document')
      .replace(/[\r\n\0"]/g, '')
      .slice(0, 180) || 'student-document';
    const fallbackName = `student-document${path.extname(originalName).toLowerCase()}`;
    res.setHeader('Content-Type', opened.mimeType || record.document.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(originalName)}`);
    if (opened.contentLength > 0) res.setHeader('Content-Length', String(opened.contentLength));

    if (typeof opened.body?.pipe === 'function') {
      opened.body.on('error', (error) => {
        console.error('Student document stream failed:', error);
        if (!res.headersSent) res.status(500).end();
        else res.destroy(error);
      });
      opened.body.pipe(res);
      return;
    }
    if (typeof opened.body?.transformToByteArray === 'function') {
      const bytes = await opened.body.transformToByteArray();
      return res.end(Buffer.from(bytes));
    }
    return res.end(Buffer.from(opened.body || []));
  } catch (error) {
    console.error('Student document download failed:', error);
    const status = error?.code === 'STUDENT_DOCUMENT_FILE_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({ success: false, code: error?.code || '', message: documentStorageMessage(error) });
  }
});

router.post('/:studentRef/documents', ...studentDocumentAccess, uploadStudentProfileDocument, async (req, res) => {
  let storedFile = null;
  try {
    if (!req.file && !String(req.body?.fileUrl || '').trim()) {
      return res.status(400).json({ success: false, message: 'انتخاب فایل سند الزامی است.' });
    }
    if (req.file) {
      storedFile = await storeStudentDocumentFile({ file: req.file, studentRef: req.params.studentRef });
    }
    const payload = {
      ...(req.body || {}),
      title: String(req.body?.title || req.file?.originalname || '').trim(),
      ...(storedFile || { fileUrl: String(req.body?.fileUrl || '').trim(), storageProvider: 'legacy' }),
      isPrimary: String(req.body?.isPrimary || '').toLowerCase() !== 'false'
    };
    if (!payload.title) {
      return res.status(400).json({ success: false, message: 'عنوان سند الزامی است.' });
    }
    if (!payload.fileUrl && !payload.storageKey) {
      return res.status(400).json({ success: false, message: 'انتخاب فایل یا نشانی سند الزامی است.' });
    }
    const item = await addStudentDocument(req.params.studentRef, payload, req.user?.id || null);
    if (!item) {
      if (storedFile) await removeStudentDocumentFile(storedFile).catch(() => {});
      return res.status(404).json({ success: false, message: 'پروفایل شاگرد پیدا نشد.' });
    }
    try {
      await logActivity({
        req,
        action: 'add_student_document',
        targetType: 'StudentCore',
        targetId: String(item?.identity?.id || req.params.studentRef || ''),
        targetUser: String(item?.identity?.userId || ''),
        meta: {
          kind: String(payload.kind || 'other'),
          title: payload.title,
          storageProvider: String(payload.storageProvider || 'legacy'),
          documentCount: Number(item?.summary?.documentCount || 0)
        }
      });
    } catch (activityError) {
      console.error('Student document activity logging failed:', activityError);
    }
    return res.json({ success: true, item });
  } catch (error) {
    if (storedFile) await removeStudentDocumentFile(storedFile).catch((cleanupError) => {
      console.error('Student document cleanup failed:', cleanupError);
    });
    console.error('Student document upload failed:', error);
    const status = error?.code === 'STUDENT_DOCUMENT_STORAGE_CONFIG_MISSING' ? 503 : 500;
    return res.status(status).json({ success: false, code: error?.code || '', message: documentStorageMessage(error) });
  }
});

router.post('/:studentRef/guardians/link', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await linkGuardianToStudent(req.params.studentRef, req.body || {});
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل متعلم پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'link_student_guardian',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        guardianUserId: String(req.body?.userId || req.body?.guardianUserId || ''),
        relation: String(req.body?.relation || '').trim()
      }
    });
    return res.json({ success: true, item, message: 'والد/سرپرست با موفقیت به متعلم وصل شد.' });
  } catch (error) {
    if (error?.code === 'guardian_user_required') {
      return res.status(400).json({ success: false, message: 'انتخاب حساب والد/سرپرست الزامی است.' });
    }
    if (error?.code === 'guardian_user_not_found') {
      return res.status(404).json({ success: false, message: 'حساب والد/سرپرست پیدا نشد.' });
    }
    if (error?.code === 'guardian_role_invalid') {
      return res.status(400).json({ success: false, message: 'کاربر انتخاب‌شده نقش والد/سرپرست ندارد.' });
    }
    return res.status(500).json({ success: false, message: 'وصل‌کردن والد/سرپرست به متعلم ناموفق بود.' });
  }
});

router.delete('/:studentRef/guardians/:guardianRef', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await unlinkGuardianFromStudent(req.params.studentRef, req.params.guardianRef);
    if (!item) {
      return res.status(404).json({ success: false, message: 'پروفایل متعلم پیدا نشد.' });
    }
    await logActivity({
      req,
      action: 'unlink_student_guardian',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        guardianRef: String(req.params.guardianRef || '')
      }
    });
    return res.json({ success: true, item, message: 'اتصال والد/سرپرست از متعلم برداشته شد.' });
  } catch (error) {
    if (error?.code === 'guardian_link_not_found') {
      return res.status(404).json({ success: false, message: 'اتصال والد/سرپرست برای این متعلم پیدا نشد.' });
    }
    return res.status(500).json({ success: false, message: 'حذف اتصال والد/سرپرست ناموفق بود.' });
  }
});

module.exports = router;
