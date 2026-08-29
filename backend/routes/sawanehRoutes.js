const express = require('express');
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const User = require('../models/User');
const StudentSawanehCard = require('../models/StudentSawanehCard');
const StudentAcademicTranscript = require('../models/StudentAcademicTranscript');
const sawanehCardService = require('../services/sawanehCardService');
const transcriptService = require('../services/transcriptService');
const sawanehReportService = require('../services/sawanehReportService');
const { computeAnnualMark, isSubjectPassed, resultTierFromAverage, promotionStatusFromFailedCount } = require('../constants/sawanehGrading');
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

// req.user.role در این سیستم معمولاً 'admin' | 'instructor' است؛ رشته‌های دیگر برای
// سازگاری با دادهٔ قدیمی نگه داشته شده‌اند. نگرانِ صنف نقش 'instructor' دارد.
const VIEW_ROLES = ['admin', 'principal', 'teacher', 'instructor', 'registration_manager'];
const EDIT_ROLES = ['admin', 'principal', 'registration_manager'];
const REMARK_ROLES = ['admin', 'principal', 'teacher', 'instructor', 'registration_manager'];
const MANAGER_ROLES = new Set(['admin', 'principal', 'registration_manager']);

const { gradeNumber } = sawanehCardService._internals;
const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));

const cardResponsePopulate = (query) => query
  .populate('studentId', 'personalInfo identification familyInfo contactInfo asasNumber registrationId academicInfo.currentGrade academicInfo.academicYearId academicInfo.currentClassId')
  .populate('schoolId', 'name nameDari province district')
  .populate('createdBy', 'name email')
  .populate('lastUpdatedBy', 'name email');

// فیلدهای دستیِ مجاز برای ویرایش در فاز ۱ (نظریات نگران، اصلاح شهرت و منفکی جدا هستند)
const applyEditableFields = (card, body = {}) => {
  if (typeof body.motherTongue === 'string') card.motherTongue = body.motherTongue;
  if (typeof body.thirdLanguage === 'string') card.thirdLanguage = body.thirdLanguage;
  if (['good', 'needs_followup', 'chronic_condition', ''].includes(body.healthStatus)) {
    card.healthStatus = body.healthStatus;
  }
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

// POST /api/sawaneh/cards/:studentId/separation — تکمیلِ دستیِ جزئیاتِ منفکی (نمبر مکتوب، جریمه)
router.post(
  '/cards/:studentId/separation',
  requireAuth,
  requireRole(['admin', 'principal', 'registration_manager', 'finance_manager']),
  requirePermission('sawaneh.card.separation'),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!isObjectId(studentId)) return fail(res, 'شناسهٔ شاگرد معتبر نیست.', 400);
      const studentSchoolId = await loadStudentSchoolId(studentId);
      if (studentSchoolId === null) return fail(res, 'شاگرد پیدا نشد.', 404);

      const card = await sawanehCardService.updateSeparationDetails(studentId, {
        letterNo: req.body?.letterNo,
        reasonText: req.body?.reasonText,
        penaltyAmount: req.body?.penaltyAmount,
        penaltyPaid: req.body?.penaltyPaid,
        penaltyReceiptId: req.body?.penaltyReceiptId
      }, { actorId: req.user?.id || null });

      const populated = await cardResponsePopulate(StudentSawanehCard.findById(card._id));
      return ok(res, { data: populated }, 'جزئیاتِ منفکی به‌روزرسانی شد.');
    } catch (error) {
      console.error('POST sawaneh separation error:', error?.message || error);
      return fail(res, 'به‌روزرسانی جزئیاتِ منفکی ناموفق بود.', 500);
    }
  }
);

/* ============================ سوانح تعلیمی (فرم B) ============================ */

const TRANSCRIPT_VIEW_ROLES = ['admin', 'principal', 'teacher', 'instructor', 'registration_manager'];
const TRANSCRIPT_WRITE_ROLES = ['admin', 'principal', 'teacher', 'instructor', 'registration_manager'];

const transcriptWarningMessage = (warning) => ({
  transcript_grade_unresolved: 'صنفِ شاگرد در این سال قابل تشخیص نیست.',
  transcript_school_unresolved: 'مکتبِ شاگرد قابل تشخیص نیست.'
}[warning] || 'ساخت سوانح تعلیمی کامل نشد.');

// GET /api/sawaneh/transcripts/:studentId — همهٔ سال‌ها
router.get(
  '/transcripts/:studentId',
  requireAuth,
  requireRole(TRANSCRIPT_VIEW_ROLES),
  requirePermission('sawaneh.transcript.view'),
  async (req, res) => {
    try {
      const { studentId } = req.params;
      if (!isObjectId(studentId)) return fail(res, 'شناسهٔ شاگرد معتبر نیست.', 400);
      const list = await StudentAcademicTranscript.find({ studentId })
        .populate('academicYearId', 'title')
        .sort({ grade: 1, createdAt: 1 })
        .lean();
      return ok(res, { data: list }, 'سوانح تعلیمی دریافت شد.');
    } catch (error) {
      console.error('GET transcripts error:', error?.message || error);
      return fail(res, 'دریافت سوانح تعلیمی ناموفق بود.', 500);
    }
  }
);

// GET /api/sawaneh/transcripts/:studentId/:academicYearId — یک سال
router.get(
  '/transcripts/:studentId/:academicYearId',
  requireAuth,
  requireRole(TRANSCRIPT_VIEW_ROLES),
  requirePermission('sawaneh.transcript.view'),
  async (req, res) => {
    try {
      const { studentId, academicYearId } = req.params;
      if (!isObjectId(studentId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
      const transcript = await StudentAcademicTranscript.findOne({ studentId, academicYearId })
        .populate('academicYearId', 'title')
        .populate('classId', 'title titleDari gradeLevel section')
        .lean();
      if (!transcript) return fail(res, 'برای این سال سوانح تعلیمی ساخته نشده است.', 404);
      return ok(res, { data: transcript }, 'سوانح تعلیمی دریافت شد.');
    } catch (error) {
      console.error('GET transcript error:', error?.message || error);
      return fail(res, 'دریافت سوانح تعلیمی ناموفق بود.', 500);
    }
  }
);

// POST /api/sawaneh/transcripts/:studentId/:academicYearId/rebuild — تولید/به‌روزرسانی از ExamResult
router.post(
  '/transcripts/:studentId/:academicYearId/rebuild',
  requireAuth,
  requireRole(TRANSCRIPT_WRITE_ROLES),
  requirePermission('sawaneh.transcript.build'),
  async (req, res) => {
    try {
      const { studentId, academicYearId } = req.params;
      if (!isObjectId(studentId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
      const result = await transcriptService.rebuild(studentId, academicYearId, { actorId: req.user?.id || null });
      if (!result.transcript) return fail(res, transcriptWarningMessage(result.warning), 422);
      return ok(res, {
        data: result.transcript,
        locked: result.locked,
        message: result.locked ? 'سوانح تعلیمی قفل است؛ تغییری اعمال نشد.' : undefined
      }, result.locked ? 'سوانح تعلیمی قفل است.' : 'سوانح تعلیمی به‌روزرسانی شد.');
    } catch (error) {
      console.error('POST transcript rebuild error:', error?.message || error);
      if (error?.message === 'transcript_student_not_found') return fail(res, 'شاگرد پیدا نشد.', 404);
      return fail(res, 'به‌روزرسانی سوانح تعلیمی ناموفق بود.', 500);
    }
  }
);

// PUT /api/sawaneh/transcripts/:studentId/:academicYearId — ویرایش دستی (فقط state=draft)
router.put(
  '/transcripts/:studentId/:academicYearId',
  requireAuth,
  requireRole(TRANSCRIPT_WRITE_ROLES),
  requirePermission('sawaneh.transcript.build'),
  async (req, res) => {
    try {
      const { studentId, academicYearId } = req.params;
      if (!isObjectId(studentId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
      const transcript = await StudentAcademicTranscript.findOne({ studentId, academicYearId });
      if (!transcript) return fail(res, 'سوانح تعلیمی یافت نشد.', 404);
      if (transcript.state === 'locked') return fail(res, 'سوانح تعلیمی قفل است.', 409);

      if (typeof req.body?.examNotes === 'string') transcript.examNotes = req.body.examNotes;

      if (Array.isArray(req.body?.rows) && transcript.state === 'draft') {
        const patchByKey = new Map(req.body.rows.filter((r) => r && r.subjectKey).map((r) => [r.subjectKey, r]));
        transcript.rows.forEach((row) => {
          const patch = patchByKey.get(row.subjectKey);
          if (!patch) return;
          if (patch.midYearMark !== undefined) row.midYearMark = patch.midYearMark === '' ? null : Number(patch.midYearMark);
          if (patch.finalMark !== undefined) row.finalMark = patch.finalMark === '' ? null : Number(patch.finalMark);
          if (patch.sawiyaMark !== undefined) row.sawiyaMark = patch.sawiyaMark === '' ? null : Number(patch.sawiyaMark);
          row.annualMark = computeAnnualMark(row.midYearMark, row.finalMark);
          row.subjectPassed = isSubjectPassed(row.annualMark);
          row.isManual = true;
        });
        const graded = transcript.rows.filter((row) => row.annualMark !== null && row.annualMark !== undefined);
        transcript.totalObtained = Math.round(graded.reduce((sum, row) => sum + Number(row.annualMark || 0), 0) * 100) / 100;
        transcript.subjectCount = graded.length;
        transcript.average = graded.length ? Math.round((transcript.totalObtained / graded.length) * 100) / 100 : 0;
        transcript.failedSubjectCount = graded.filter((row) => Number(row.annualMark) < 55).length;
        transcript.resultTier = resultTierFromAverage(transcript.average, transcript.subjectCount);
        transcript.promotionStatus = promotionStatusFromFailedCount(transcript.failedSubjectCount, transcript.subjectCount);
      }

      transcript.lastUpdatedBy = req.user?.id || transcript.lastUpdatedBy;
      await transcript.save();
      if (transcript.classId) {
        await transcriptService.recomputeRanks({ classId: transcript.classId }, academicYearId);
      }
      const fresh = await StudentAcademicTranscript.findById(transcript._id).lean();
      return ok(res, { data: fresh }, 'سوانح تعلیمی ذخیره شد.');
    } catch (error) {
      console.error('PUT transcript error:', error?.message || error);
      return fail(res, 'ذخیرهٔ سوانح تعلیمی ناموفق بود.', 500);
    }
  }
);

const transcriptStateAction = (action, permission, roles) => async (req, res) => {
  try {
    const { studentId, academicYearId } = req.params;
    if (!isObjectId(studentId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
    const opts = { actorId: req.user?.id || null };
    if (action === 'lock') {
      opts.supervisorSignedBy = req.body?.supervisorSignedBy || req.user?.id || null;
      opts.teacherSignedBy = req.body?.teacherSignedBy || null;
    }
    const transcript = await transcriptService[action](studentId, academicYearId, null, opts);
    return ok(res, { data: transcript }, 'انجام شد.');
  } catch (error) {
    console.error(`POST transcript ${action} error:`, error?.message || error);
    if (error?.message === 'transcript_not_found') return fail(res, 'سوانح تعلیمی یافت نشد.', 404);
    if (error?.message === 'transcript_locked') return fail(res, 'سوانح تعلیمی قفل است.', 409);
    return fail(res, 'عملیات ناموفق بود.', 500);
  }
};

router.post('/transcripts/:studentId/:academicYearId/finalize', requireAuth, requireRole(TRANSCRIPT_WRITE_ROLES), requirePermission('sawaneh.transcript.finalize'), transcriptStateAction('finalize'));
router.post('/transcripts/:studentId/:academicYearId/reopen', requireAuth, requireRole(TRANSCRIPT_WRITE_ROLES), requirePermission('sawaneh.transcript.finalize'), transcriptStateAction('reopen'));
router.post('/transcripts/:studentId/:academicYearId/lock', requireAuth, requireRole(['admin', 'principal', 'registration_manager']), requirePermission('sawaneh.transcript.lock'), transcriptStateAction('lock'));

// POST /api/sawaneh/transcripts/class/:classId/:academicYearId/rebuild — دسته‌ای
router.post(
  '/transcripts/class/:classId/:academicYearId/rebuild',
  requireAuth,
  requireRole(TRANSCRIPT_WRITE_ROLES),
  requirePermission('sawaneh.transcript.build'),
  async (req, res) => {
    try {
      const { classId, academicYearId } = req.params;
      if (!isObjectId(classId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
      const result = await transcriptService.rebuildClass(classId, academicYearId, { actorId: req.user?.id || null });
      return ok(res, { data: result }, `سوانح تعلیمیِ ${result.count} شاگرد پردازش شد.`);
    } catch (error) {
      console.error('POST transcript class rebuild error:', error?.message || error);
      return fail(res, 'پردازش دسته‌ای ناموفق بود.', 500);
    }
  }
);

// POST /api/sawaneh/transcripts/class/:classId/:academicYearId/recompute-ranks
router.post(
  '/transcripts/class/:classId/:academicYearId/recompute-ranks',
  requireAuth,
  requireRole(TRANSCRIPT_WRITE_ROLES),
  requirePermission('sawaneh.transcript.build'),
  async (req, res) => {
    try {
      const { classId, academicYearId } = req.params;
      if (!isObjectId(classId) || !isObjectId(academicYearId)) return fail(res, 'شناسه معتبر نیست.', 400);
      const result = await transcriptService.recomputeRanks({ classId }, academicYearId);
      return ok(res, { data: result }, 'رتبه‌بندی بازمحاسبه شد.');
    } catch (error) {
      console.error('POST recompute-ranks error:', error?.message || error);
      return fail(res, 'بازمحاسبهٔ رتبه ناموفق بود.', 500);
    }
  }
);

/* ============================ گزارش‌ها (فاز ۶) ============================ */

const REPORT_ROLES = ['admin', 'principal', 'teacher', 'instructor', 'registration_manager', 'finance_manager'];

// GET /api/sawaneh/reports/overview — کارت‌های ناقص / وضعیت ترانسکریپت / آمار نتیجه / جریمه‌های پرداخت‌نشده
router.get(
  '/reports/overview',
  requireAuth,
  requireRole(REPORT_ROLES),
  requirePermission('sawaneh.card.view'),
  async (req, res) => {
    try {
      const data = await sawanehReportService.getOverview({
        schoolId: req.query.schoolId,
        academicYearId: req.query.academicYearId,
        grade: req.query.grade
      });
      return ok(res, { data }, 'گزارشِ سوانح دریافت شد.');
    } catch (error) {
      console.error('GET sawaneh reports/overview error:', error?.message || error);
      return fail(res, 'دریافت گزارشِ سوانح ناموفق بود.', 500);
    }
  }
);

// GET /api/sawaneh/reports/class-ranks?classId=&academicYearId=&top=
router.get(
  '/reports/class-ranks',
  requireAuth,
  requireRole(REPORT_ROLES),
  requirePermission('sawaneh.transcript.view'),
  async (req, res) => {
    try {
      const { classId, academicYearId, top } = req.query;
      if (!isObjectId(classId) || !isObjectId(academicYearId)) return fail(res, 'شناسهٔ صنف/سال معتبر نیست.', 400);
      const data = await sawanehReportService.getClassRanks({ classId, academicYearId, top });
      return ok(res, { data }, 'جدول رتبهٔ صنف دریافت شد.');
    } catch (error) {
      console.error('GET sawaneh reports/class-ranks error:', error?.message || error);
      return fail(res, 'دریافت جدول رتبه ناموفق بود.', 500);
    }
  }
);

// GET /api/sawaneh/reports/asas-list.xlsx?schoolId=&grade=
router.get(
  '/reports/asas-list.xlsx',
  requireAuth,
  requireRole(REPORT_ROLES),
  requirePermission('sawaneh.card.view'),
  async (req, res) => {
    try {
      const buffer = await sawanehReportService.buildAsasListWorkbook({
        schoolId: req.query.schoolId,
        grade: req.query.grade
      });
      const stamp = new Date().toISOString().slice(0, 10);
      await logActivity({
        req,
        action: 'sawaneh_report_asas_list_xlsx',
        targetType: 'StudentSawanehCard',
        targetId: String(req.query.schoolId || 'all'),
        meta: { grade: req.query.grade || 'all' }
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="asas-list-${stamp}.xlsx"`);
      return res.status(200).send(Buffer.from(buffer));
    } catch (error) {
      console.error('GET sawaneh asas-list.xlsx error:', error?.message || error);
      return fail(res, 'ساخت فایل اکسل «لست اساس» ناموفق بود.', 500);
    }
  }
);

module.exports = router;
