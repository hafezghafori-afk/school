const express = require('express');
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');
const StudentSawanehCard = require('../models/StudentSawanehCard');
const sawanehCardService = require('../services/sawanehCardService');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { requireAuth, requireRole, requireAnyPermission } = require('../middleware/auth');
const { requireWritableSchool, writeSchoolContextHeaders } = require('../services/schoolContextService');

const router = express.Router();
attachWriteActivityAudit(router, {
  targetType: 'StudentSawanehCard',
  actionPrefix: 'sawaneh_card',
  audit: (payload) => logActivity(payload)
});

// نقش‌ها و permissionها هم‌راستا با afghanStudentRoutes؛ ورودی‌های granularِ `sawaneh.*`
// در فاز ۲ به permissionCatalog افزوده می‌شوند.
const VIEW_ROLES = ['admin', 'principal', 'teacher', 'registration_manager'];
const EDIT_ROLES = ['admin', 'principal', 'registration_manager'];
const VIEW_PERMS = ['manage_content', 'manage_users', 'manage_enrollments'];
const EDIT_PERMS = ['manage_content', 'manage_users'];

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const cardResponsePopulate = (query) => query
  .populate('studentId', 'personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName asasNumber registrationId academicInfo.currentGrade')
  .populate('schoolId', 'name nameDari province district')
  .populate('createdBy', 'name email')
  .populate('lastUpdatedBy', 'name email');

// فیلدهای دستیِ مجاز برای ویرایش در فاز ۱ (نظریات نگران، اصلاح شهرت و منفکی جدا هستند)
const applyEditableFields = (card, body = {}) => {
  if (typeof body.motherTongue === 'string') card.motherTongue = body.motherTongue;
  if (typeof body.thirdLanguage === 'string') card.thirdLanguage = body.thirdLanguage;
  if (typeof body.currentSameAsOrigin === 'boolean') card.currentSameAsOrigin = body.currentSameAsOrigin;

  const setAddress = (target, source) => {
    if (!source || typeof source !== 'object') return;
    if (typeof source.province === 'string') target.province = source.province;
    if (typeof source.district === 'string') target.district = source.district;
    if (typeof source.villageOrStreet === 'string') target.villageOrStreet = source.villageOrStreet;
  };
  setAddress(card.originAddress, body.originAddress);
  if (card.currentSameAsOrigin) {
    card.currentAddress = {
      province: card.originAddress.province || '',
      district: card.originAddress.district || '',
      villageOrStreet: card.originAddress.villageOrStreet || ''
    };
  } else {
    setAddress(card.currentAddress, body.currentAddress);
  }

  if (Array.isArray(body.relatives)) {
    card.relatives = body.relatives
      .filter((entry) => entry && entry.relation)
      .map((entry) => ({
        relation: entry.relation,
        name: String(entry.name || '').trim(),
        phone: String(entry.phone || '').trim(),
        note: String(entry.note || '').trim()
      }));
  }

  if (body.status === 'active' || body.status === 'draft') {
    card.status = body.status;
  }
};

const loadStudentSchoolId = async (studentId) => {
  const student = await AfghanStudent.findById(studentId)
    .select('academicInfo.currentSchool')
    .lean();
  return student ? String(student.academicInfo?.currentSchool || '') : null;
};

// GET /api/sawaneh/cards/:studentId — دریافت کارت (در صورت نبود، auto-ensure)
router.get(
  '/cards/:studentId',
  requireAuth,
  requireRole(VIEW_ROLES),
  requireAnyPermission(VIEW_PERMS),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!isObjectId(studentId)) return fail(res, 'شناسهٔ شاگرد معتبر نیست.', 400);

      const schoolId = await loadStudentSchoolId(studentId);
      if (schoolId === null) return fail(res, 'شاگرد پیدا نشد.', 404);

      await sawanehCardService.ensureCard(studentId, { actorId: req.user?.id || null });
      const card = await cardResponsePopulate(StudentSawanehCard.findOne({ studentId }));
      if (!card) return fail(res, 'کارت سوانح ساخته نشد.', 500);

      if (schoolId) writeSchoolContextHeaders(res, schoolId);
      return ok(res, { data: card }, 'کارت سوانح دریافت شد.');
    } catch (error) {
      console.error('GET sawaneh card error:', error?.message || error);
      if (error?.message === 'sawaneh_student_not_found') return fail(res, 'شاگرد پیدا نشد.', 404);
      if (error?.message === 'sawaneh_student_without_school') return fail(res, 'شاگرد به هیچ مکتبی وصل نیست.', 400);
      return fail(res, 'دریافت کارت سوانح ناموفق بود.', 500);
    }
  }
);

// PUT /api/sawaneh/cards/:studentId — ویرایش فیلدهای دستی (زبان، سکونت، اقارب، وضعیت)
router.put(
  '/cards/:studentId',
  requireAuth,
  requireRole(EDIT_ROLES),
  requireAnyPermission(EDIT_PERMS),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!isObjectId(studentId)) return fail(res, 'شناسهٔ شاگرد معتبر نیست.', 400);

      const studentSchoolId = await loadStudentSchoolId(studentId);
      if (studentSchoolId === null) return fail(res, 'شاگرد پیدا نشد.', 404);

      // چند‌مکتب: کاربر باید روی مکتبِ همین شاگرد اجازهٔ نوشتن داشته باشد
      const schoolContext = await requireWritableSchool(req, { schoolId: studentSchoolId });
      if (studentSchoolId && String(schoolContext.schoolId) !== String(studentSchoolId)) {
        return fail(res, 'این شاگرد به مکتب فعالِ شما تعلق ندارد.', 403);
      }

      const card = await sawanehCardService.ensureCard(studentId, { actorId: req.user?.id || null });
      applyEditableFields(card, req.body || {});
      card.lastUpdatedBy = req.user?.id || card.lastUpdatedBy;
      await card.save();

      const populated = await cardResponsePopulate(StudentSawanehCard.findById(card._id));
      writeSchoolContextHeaders(res, schoolContext.schoolId);
      return ok(res, { data: populated }, 'کارت سوانح به‌روزرسانی شد.');
    } catch (error) {
      console.error('PUT sawaneh card error:', error?.message || error);
      if (error?.message === 'school_context_required') {
        return fail(res, error.messageDari || 'اول یک مکتب فعال انتخاب کنید.', error.statusCode || 400);
      }
      if (error?.name === 'ValidationError') {
        return fail(res, 'اطلاعات کارت سوانح معتبر نیست.', 400);
      }
      return fail(res, 'به‌روزرسانی کارت سوانح ناموفق بود.', 500);
    }
  }
);

module.exports = router;
