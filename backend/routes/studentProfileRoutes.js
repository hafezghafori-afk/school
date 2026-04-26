const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const {
  addStudentDocument,
  addStudentRemark,
  addStudentTransfer,
  getStudentProfile,
  linkGuardianToStudent,
  listGuardianCandidates,
  listStudentProfiles,
  unlinkGuardianFromStudent,
  updateStudentProfileBasics
} = require('../services/studentProfileService');

const router = express.Router();

router.get('/', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await listStudentProfiles({ query: req.query.q || '' });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load student profiles.' });
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

router.get('/:studentRef', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const item = await getStudentProfile(req.params.studentRef);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Student profile was not found.' });
    }
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load the student profile.' });
  }
});

router.put('/:studentRef', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await updateStudentProfileBasics(req.params.studentRef, req.body || {});
    if (!item) {
      return res.status(404).json({ success: false, message: 'Student profile was not found.' });
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
    return res.status(500).json({ success: false, message: 'Failed to update the student profile.' });
  }
});

router.post('/:studentRef/remarks', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    if (!String(req.body?.text || '').trim()) {
      return res.status(400).json({ success: false, message: 'Remark text is required.' });
    }
    const item = await addStudentRemark(req.params.studentRef, req.body || {}, req.user?.id || null);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Student profile was not found.' });
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
    return res.status(500).json({ success: false, message: 'Failed to add the student remark.' });
  }
});

router.post('/:studentRef/transfers', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await addStudentTransfer(req.params.studentRef, req.body || {});
    if (!item) {
      return res.status(404).json({ success: false, message: 'Student profile was not found.' });
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
    return res.status(500).json({ success: false, message: 'Failed to add the transfer record.' });
  }
});

router.post('/:studentRef/documents', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    if (!String(req.body?.title || '').trim()) {
      return res.status(400).json({ success: false, message: 'Document title is required.' });
    }
    const item = await addStudentDocument(req.params.studentRef, req.body || {}, req.user?.id || null);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Student profile was not found.' });
    }
    await logActivity({
      req,
      action: 'add_student_document',
      targetType: 'StudentCore',
      targetId: String(item?.identity?.id || req.params.studentRef || ''),
      targetUser: String(item?.identity?.userId || ''),
      meta: {
        kind: String(req.body?.kind || 'other'),
        title: String(req.body?.title || '').trim(),
        documentCount: Number(item?.summary?.documentCount || 0)
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to add the student document.' });
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
