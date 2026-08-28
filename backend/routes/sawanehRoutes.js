const express = require('express');
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const User = require('../models/User');
const StudentSawanehCard = require('../models/StudentSawanehCard');
const sawanehCardService = require('../services/sawanehCardService');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { requireWritableSchool, writeSchoolContextHeaders } = require('../services/schoolContextService');
const { normalizeStudentSearchText } = require('../utils/studentSearch');

const router = express.Router();
attachWriteActivityAudit(router, {
  targetType: 'StudentSawanehCard',
  actionPrefix: 'sawaneh_card',
  audit: (payload) => logActivity(payload)
});

const VIEW_ROLES = ['admin', 'principal', 'teacher', 'registration_manager'];
const EDIT_ROLES = ['admin', 'principal', 'registration_manager'];
const REMARK_ROLES = ['admin', 'principal', 'teacher', 'registration_manager'];
const MANAGER_ROLES = new Set(['admin', 'principal', 'registration_manager']);

const { gradeNumber } = sawanehCardService._internals;
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

// کلاسی که کاربر «نگرانِ» آن است و شاگرد در آن قرار دارد (یا null)
const findHomeroomClassForStudent = async (userId, student) => {
  const classIds = [student?.academicInfo?.currentClassId, student?.academicInfo?.classId]
    .filter(Boolean)
    .map(String);
  if (!classIds.length) return null;
  return SchoolClass.findOne({
    _id: { $in: classIds },
    homeroomTeacherUserId: userId
  }).select('_id gradeLevel academicYearId title titleDari').lean();
};

// GET /api/sawaneh/cards — فهرست شاگردان + وضعیت کارت سوانح (برای صفحهٔ نگران / گزارش کارت‌های ناقص)
router.get(
  '/cards',
  requireAuth,
  requireRole(VIEW_ROLES),
  requirePermission('sawaneh.card.view'),
  async (req, res) => {
    try {
      const {
        schoolId, classId, grade, status,
        q, page = 1, limit = 100
      } = req.query;

      const studentFilter = { status: 'active' };
      if (schoolId && isObjectId(schoolId)) studentFilter['academicInfo.currentSchool'] = schoolId;
      if (classId && isObjectId(classId)) studentFilter['academicInfo.currentClassId'] = classId;

      const gradeNum = gradeNumber(grade);
      if (gradeNum) studentFilter['academicInfo.currentGrade'] = `grade${gradeNum}`;

      // نگرانِ صنف که نقش مدیریتی ندارد فقط شاگردان کلاس‌های خودش را می‌بیند
      if (!MANAGER_ROLES.has(req.user.role)) {
        const homerooms = await SchoolClass.find({ homeroomTeacherUserId: req.user.id })
          .select('_id').lean();
        const ids = homerooms.map((item) => item._id);
        if (!ids.length) return ok(res, { data: [], pagination: { page: 1, limit: 0, total: 0, pages: 0 } });
        studentFilter['academicInfo.currentClassId'] = classId && isObjectId(classId)
          ? { $in: ids.filter((id) => String(id) === String(classId)) }
          : { $in: ids };
      }

      if (q) {
        const normalized = normalizeStudentSearchText(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = { $regex: normalized, $options: 'i' };
        studentFilter.$or = [
          { 'personalInfo.firstName': rx },
          { 'personalInfo.lastName': rx },
          { 'personalInfo.firstNameDari': rx },
          { 'personalInfo.lastNameDari': rx },
          { 'personalInfo.fatherName': rx },
          { asasNumber: rx },
          { registrationId: rx }
        ];
      }

      const take = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
      const skip = Math.max(parseInt(page, 10) || 1, 1) - 1;

      const students = await AfghanStudent.find(studentFilter)
        .select('personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName asasNumber registrationId academicInfo.currentGrade academicInfo.currentSchool academicInfo.currentClassId')
        .populate('academicInfo.currentClassId', 'title titleDari gradeLevel section')
        .sort({ 'personalInfo.lastNameDari': 1, createdAt: -1 })
        .limit(take)
        .skip(skip * take)
        .lean();

      const total = await AfghanStudent.countDocuments(studentFilter);

      const ids = students.map((item) => item._id);
      const cards = await StudentSawanehCard.find({ studentId: { $in: ids } })
        .select('studentId status supervisorRemarks separation.isSeparated updatedAt')
        .lean();
      const cardByStudent = new Map(cards.map((card) => [String(card.studentId), card]));

      let rows = students.map((student) => {
        const card = cardByStudent.get(String(student._id)) || null;
        const studentGrade = gradeNumber(student.academicInfo?.currentGrade);
        const hasCurrentRemark = Boolean(
          card && (card.supervisorRemarks || []).some((item) => Number(item.grade) === studentGrade)
        );
        return {
          student,
          card,
          cardStatus: card ? card.status : 'missing',
          hasCurrentGradeRemark: hasCurrentRemark
        };
      });

      if (status === 'missing') rows = rows.filter((row) => row.cardStatus === 'missing');
      else if (status) rows = rows.filter((row) => row.cardStatus === status);

      return ok(res, {
        data: rows,
        pagination: { page: skip + 1, limit: take, total, pages: Math.ceil(total / take) }
      }, 'فهرست کارت‌های سوانح دریافت شد.');
    } catch (error) {
      console.error('GET sawaneh cards list error:', error?.message || error);
      return fail(res, 'دریافت فهرست کارت‌های سوانح ناموفق بود.', 500);
    }
  }
);

// GET /api/sawaneh/cards/:studentId — دریافت کارت (در صورت نبود، auto-ensure)
router.get(
  '/cards/:studentId',
  requireAuth,
  requireRole(VIEW_ROLES),
  requirePermission('sawaneh.card.view'),
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
  requirePermission('sawaneh.card.edit'),
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

// POST /api/sawaneh/cards/:studentId/supervisor-remark — ثبت/جایگزینی نظر نگرانِ یک صنف
router.post(
  '/cards/:studentId/supervisor-remark',
  requireAuth,
  requireRole(REMARK_ROLES),
  requirePermission('sawaneh.card.supervisor_remark'),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!isObjectId(studentId)) return fail(res, 'شناسهٔ شاگرد معتبر نیست.', 400);

      const student = await AfghanStudent.findById(studentId)
        .select('academicInfo.currentSchool academicInfo.currentClassId academicInfo.classId academicInfo.currentGrade academicInfo.academicYearId')
        .lean();
      if (!student) return fail(res, 'شاگرد پیدا نشد.', 404);

      const isManager = MANAGER_ROLES.has(req.user.role);
      const homeroomClass = await findHomeroomClassForStudent(req.user.id, student);

      if (!isManager && !homeroomClass) {
        return fail(res, 'شما نگرانِ صنفِ این شاگرد نیستید.', 403);
      }

      // نگرانِ صنف فقط برای صنفِ کلاسِ خودش؛ مدیر می‌تواند صنف را در body تعیین کند
      const grade = homeroomClass
        ? Number(homeroomClass.gradeLevel)
        : gradeNumber(req.body?.grade) || gradeNumber(student.academicInfo?.currentGrade);
      if (!grade) return fail(res, 'صنف نامعتبر است.', 400);

      const actor = await User.findById(req.user.id).select('name').lean();

      const card = await sawanehCardService.upsertSupervisorRemark(
        studentId,
        {
          grade,
          remark: req.body?.remark,
          healthStatus: req.body?.healthStatus,
          academicYearId: req.body?.academicYearId
            || homeroomClass?.academicYearId
            || student.academicInfo?.academicYearId,
          classId: homeroomClass?._id || student.academicInfo?.currentClassId,
          supervisorId: req.user.id,
          supervisorName: actor?.name || ''
        },
        { actorId: req.user.id }
      );

      const populated = await cardResponsePopulate(StudentSawanehCard.findById(card._id));
      return ok(res, { data: populated }, 'نظر نگرانِ صنف ثبت شد.');
    } catch (error) {
      console.error('POST sawaneh supervisor-remark error:', error?.message || error);
      if (error?.message === 'sawaneh_invalid_grade') return fail(res, 'صنف نامعتبر است.', 400);
      if (error?.message === 'sawaneh_student_without_school') return fail(res, 'شاگرد به هیچ مکتبی وصل نیست.', 400);
      return fail(res, 'ثبت نظر نگرانِ صنف ناموفق بود.', 500);
    }
  }
);

module.exports = router;
