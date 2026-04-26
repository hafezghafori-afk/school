const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const Course = require('../models/Course');
const CourseJoinRequest = require('../models/CourseJoinRequest');
const Schedule = require('../models/Schedule');
const Grade = require('../models/Grade');
const Attendance = require('../models/Attendance');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Result = require('../models/Result');
const Quiz = require('../models/Quiz');
const ModuleModel = require('../models/Module');
const Comment = require('../models/Comment');
const ChatThread = require('../models/ChatThread');
const VirtualRecording = require('../models/VirtualRecording');
const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinanceReceipt = require('../models/FinanceReceipt');
const InstructorSubject = require('../models/InstructorSubject');
const StudentMembership = require('../models/StudentMembership');
const SchoolClass = require('../models/SchoolClass');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
const toTrimmedString = (value) => (value === undefined || value === null ? '' : String(value).trim());
const toNullableObjectId = (value) => {
  const normalized = toTrimmedString(value);
  if (!normalized) return null;
  return mongoose.Types.ObjectId.isValid(normalized) ? normalized : undefined;
};
const toBoolean = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = toTrimmedString(value).toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const normalizeTags = (subject) => {
  if (Array.isArray(subject)) {
    return subject.map((item) => toTrimmedString(item)).filter(Boolean);
  }
  const normalized = toTrimmedString(subject);
  return normalized ? [normalized] : [];
};

function buildCoursePayload(body = {}, files = {}) {
  const title = toTrimmedString(body.title);
  const description = body.description === undefined ? undefined : String(body.description || '');
  const price = body.price === undefined || body.price === '' ? undefined : Number(body.price);
  const gradeLevel = toTrimmedString(body.gradeLevel || body.grade);
  const section = toTrimmedString(body.section);
  const category = toTrimmedString(body.category) || gradeLevel;
  const kind = toTrimmedString(body.kind) || 'academic_class';
  const level = body.level === undefined ? undefined : toTrimmedString(body.level);
  const academicYearRef = body.academicYearRef === undefined ? undefined : toNullableObjectId(body.academicYearRef);
  const homeroomInstructor = body.homeroomInstructor === undefined ? undefined : toNullableObjectId(body.homeroomInstructor);
  const isActive = toBoolean(body.isActive, undefined);
  const tags = body.subject !== undefined || body.tags !== undefined
    ? normalizeTags(body.tags !== undefined ? body.tags : body.subject)
    : undefined;

  return {
    title,
    description,
    price,
    gradeLevel,
    section,
    category,
    kind,
    level,
    academicYearRef,
    homeroomInstructor,
    isActive,
    tags,
    videoUrl: files?.video ? files.video[0].path : undefined,
    pdfUrl: files?.pdf ? files.pdf[0].path : undefined
  };
}

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.set('Deprecation', 'true');
  res.set('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.set('X-Replacement-Endpoint', replacementEndpoint);
    res.set('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const buildLegacyCourseDetailPayload = ({ schoolClass = null, legacyCourse = null } = {}) => {
  if (!schoolClass) return null;
  const compatCourseId = legacyCourse?._id || schoolClass.legacyCourseId || null;
  const tags = [...new Set([
    ...(Array.isArray(legacyCourse?.tags) ? legacyCourse.tags : []),
    schoolClass.code || '',
    schoolClass.section || ''
  ].filter(Boolean))];

  return {
    _id: compatCourseId || schoolClass._id,
    id: compatCourseId || schoolClass._id,
    title: schoolClass.title || legacyCourse?.title || '',
    description: legacyCourse?.description || schoolClass.note || '',
    price: Number(legacyCourse?.price || 0),
    category: schoolClass.gradeLevel || legacyCourse?.category || '',
    level: schoolClass.shift || legacyCourse?.level || '',
    tags,
    kind: legacyCourse?.kind || 'academic_class',
    videoUrl: legacyCourse?.videoUrl || '',
    pdfUrl: legacyCourse?.pdfUrl || '',
    schoolClassRef: schoolClass._id,
    classId: schoolClass._id,
    schoolClass: {
      _id: schoolClass._id,
      id: schoolClass._id,
      title: schoolClass.title || '',
      code: schoolClass.code || '',
      gradeLevel: schoolClass.gradeLevel || '',
      section: schoolClass.section || '',
      academicYearId: schoolClass.academicYearId || null
    }
  };
};

async function resolveLegacyCourseDetail(identifier = '') {
  const normalizedIdentifier = toTrimmedString(identifier);
  if (!normalizedIdentifier || !mongoose.Types.ObjectId.isValid(normalizedIdentifier)) {
    return null;
  }

  let schoolClass = await SchoolClass.findById(normalizedIdentifier)
    .select('title code gradeLevel section shift room status note academicYearId legacyCourseId');
  let legacyCourse = null;

  if (schoolClass?.legacyCourseId) {
    legacyCourse = await Course.findById(schoolClass.legacyCourseId);
  }

  if (!schoolClass) {
    legacyCourse = await Course.findById(normalizedIdentifier);
    if (!legacyCourse) return null;

    if (legacyCourse.schoolClassRef) {
      schoolClass = await SchoolClass.findById(legacyCourse.schoolClassRef)
        .select('title code gradeLevel section shift room status note academicYearId legacyCourseId');
    }
    if (!schoolClass) {
      schoolClass = await SchoolClass.findOne({ legacyCourseId: legacyCourse._id })
        .select('title code gradeLevel section shift room status note academicYearId legacyCourseId');
    }
  }

  if (!schoolClass || schoolClass.status === 'archived') return null;
  if (!legacyCourse && schoolClass.legacyCourseId) {
    legacyCourse = await Course.findById(schoolClass.legacyCourseId);
  }

  return buildLegacyCourseDetailPayload({ schoolClass, legacyCourse });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${safeName(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'video') {
      const ok = ['.mp4', '.mov', '.mkv', '.webm'].includes(ext);
      return cb(ok ? null : new Error('فرمت ویدیو نامعتبر است'), ok);
    }
    if (file.fieldname === 'pdf') {
      const ok = ext === '.pdf';
      return cb(ok ? null : new Error('فرمت PDF نامعتبر است'), ok);
    }
    cb(new Error('فایل ناشناخته'), false);
  }
});

const uploadFields = upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]);

const applyUpload = (req, res, next) => {
  uploadFields(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    next();
  });
};

router.post('/add', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  applyUpload(req, res, next);
}, async (req, res) => {
  try {
    const payload = buildCoursePayload(req.body, req.files);
    if (!payload.title || payload.title.length < 3) {
      return res.status(400).json({ message: 'عنوان حداقل باید 3 کاراکتر باشد' });
    }
    if (payload.price !== undefined && (Number.isNaN(payload.price) || payload.price < 0)) {
      return res.status(400).json({ message: 'قیمت معتبر نیست' });
    }
    if (payload.academicYearRef === undefined) {
      return res.status(400).json({ message: 'شناسه سال تعلیمی معتبر نیست' });
    }
    if (payload.homeroomInstructor === undefined) {
      return res.status(400).json({ message: 'شناسه استاد مسئول معتبر نیست' });
    }

    const newCourse = new Course({
      title: payload.title,
      description: payload.description || '',
      price: payload.price || 0,
      category: payload.category,
      level: payload.level || '',
      tags: payload.tags || [],
      kind: payload.kind,
      academicYearRef: payload.academicYearRef === undefined ? null : payload.academicYearRef,
      gradeLevel: payload.gradeLevel,
      section: payload.section,
      homeroomInstructor: payload.homeroomInstructor === undefined ? null : payload.homeroomInstructor,
      isActive: payload.isActive === undefined ? true : payload.isActive,
      videoUrl: payload.videoUrl || '',
      pdfUrl: payload.pdfUrl || ''
    });

    await newCourse.save();
    await logActivity({
      req,
      action: 'create_course',
      targetType: 'Course',
      targetId: newCourse._id.toString(),
      meta: {
        title: newCourse.title,
        kind: newCourse.kind,
        gradeLevel: newCourse.gradeLevel,
        section: newCourse.section
      }
    });
    res.status(201).json({ success: true, item: newCourse, message: 'صنف با موفقیت ذخیره شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ذخیره صنف' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  applyUpload(req, res, next);
}, async (req, res) => {
  try {
    const payload = buildCoursePayload(req.body || {}, req.files || {});
    const update = {};

    if (req.body?.title !== undefined) {
      if (!payload.title || payload.title.length < 3) {
        return res.status(400).json({ success: false, message: 'عنوان حداقل باید 3 کاراکتر باشد' });
      }
      update.title = payload.title;
    }
    if (req.body?.description !== undefined) update.description = payload.description || '';
    if (req.body?.price !== undefined) {
      if (payload.price === undefined || Number.isNaN(payload.price) || payload.price < 0) {
        return res.status(400).json({ success: false, message: 'قیمت معتبر نیست' });
      }
      update.price = payload.price;
    }
    if (req.body?.grade !== undefined || req.body?.gradeLevel !== undefined || req.body?.category !== undefined) {
      update.gradeLevel = payload.gradeLevel;
      update.category = payload.category;
    }
    if (req.body?.subject !== undefined || req.body?.tags !== undefined) {
      update.tags = payload.tags || [];
    }
    if (req.body?.kind !== undefined) update.kind = payload.kind;
    if (req.body?.level !== undefined) update.level = payload.level || '';
    if (req.body?.section !== undefined) update.section = payload.section;
    if (req.body?.academicYearRef !== undefined) {
      if (payload.academicYearRef === undefined) {
        return res.status(400).json({ success: false, message: 'شناسه سال تعلیمی معتبر نیست' });
      }
      update.academicYearRef = payload.academicYearRef;
    }
    if (req.body?.homeroomInstructor !== undefined) {
      if (payload.homeroomInstructor === undefined) {
        return res.status(400).json({ success: false, message: 'شناسه استاد مسئول معتبر نیست' });
      }
      update.homeroomInstructor = payload.homeroomInstructor;
    }
    if (req.body?.isActive !== undefined) update.isActive = payload.isActive;
    if (payload.videoUrl) update.videoUrl = payload.videoUrl;
    if (payload.pdfUrl) update.pdfUrl = payload.pdfUrl;

    const item = await Course.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: 'صنف یافت نشد' });

    await logActivity({
      req,
      action: 'update_course',
      targetType: 'Course',
      targetId: item._id.toString(),
      meta: {
        title: item.title,
        kind: item.kind,
        gradeLevel: item.gradeLevel,
        section: item.section
      }
    });
    res.json({ success: true, item, message: 'صنف بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی صنف' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await Course.findById(req.params.id).select('_id title schoolClassRef');
    if (!item) return res.status(404).json({ success: false, message: 'صنف یافت نشد' });

    const courseId = item._id;
    const schoolClassId = item.schoolClassRef || null;
    const feePlanFilter = schoolClassId
      ? { $or: [{ classId: schoolClassId }, { course: courseId }] }
      : { course: courseId };
    const feeOrderFilter = schoolClassId
      ? { $or: [{ classId: schoolClassId }, { course: courseId }] }
      : { course: courseId };
    const feePaymentFilter = schoolClassId
      ? { classId: schoolClassId }
      : { classId: null };
    const [
      pendingJoinRequestCount,
      scheduleCount,
      gradeCount,
      attendanceCount,
      homeworkCount,
      homeworkSubmissionCount,
      resultCount,
      quizCount,
      moduleCount,
      commentCount,
      chatThreadCount,
      recordingCount,
      financeBillCount,
      feeOrderCount,
      financeFeePlanCount,
      financeReceiptCount,
      feePaymentCount,
      instructorSubjectCount,
      membershipCount
    ] = await Promise.all([
      CourseJoinRequest.countDocuments({ course: courseId, status: 'pending' }),
      Schedule.countDocuments({ course: courseId }),
      Grade.countDocuments({ course: courseId }),
      Attendance.countDocuments({ course: courseId }),
      Homework.countDocuments({ course: courseId }),
      HomeworkSubmission.countDocuments({ course: courseId }),
      Result.countDocuments({ course: courseId }),
      Quiz.countDocuments({ course: courseId }),
      ModuleModel.countDocuments({ course: courseId }),
      Comment.countDocuments({ course: courseId }),
      ChatThread.countDocuments({ course: courseId }),
      VirtualRecording.countDocuments({ course: courseId }),
      FinanceBill.countDocuments({ course: courseId }),
      FeeOrder.countDocuments(feeOrderFilter),
      FinanceFeePlan.countDocuments(feePlanFilter),
      FinanceReceipt.countDocuments({ course: courseId }),
      FeePayment.countDocuments(feePaymentFilter),
      InstructorSubject.countDocuments({ course: courseId }),
      StudentMembership.countDocuments({ course: courseId })
    ]);

    const hasDependency = [
      pendingJoinRequestCount,
      scheduleCount,
      gradeCount,
      attendanceCount,
      homeworkCount,
      homeworkSubmissionCount,
      resultCount,
      quizCount,
      moduleCount,
      commentCount,
      chatThreadCount,
      recordingCount,
      financeBillCount,
      feeOrderCount,
      financeFeePlanCount,
      financeReceiptCount,
      feePaymentCount,
      instructorSubjectCount,
      membershipCount
    ].some((count) => Number(count) > 0);

    if (hasDependency) {
      return res.status(400).json({
        success: false,
        message: 'این صنف داده‌های وابسته دارد. ابتدا وابستگی‌ها را حذف یا منتقل کنید.'
      });
    }

    await Course.findByIdAndDelete(courseId);
    await logActivity({
      req,
      action: 'delete_course',
      targetType: 'Course',
      targetId: courseId.toString(),
      meta: { title: item.title }
    });
    res.json({ success: true, message: 'صنف حذف شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در حذف صنف' });
  }
});

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'مسیر صنف‌ها فعال است' });
});

router.get('/all', (req, res) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/education/public-school-classes>; rel="successor-version"');
  res.status(410).json({
    success: false,
    code: 'legacy_course_catalog_retired',
    message: 'لیست legacy صنف‌ها بازنشسته شده است. از /api/education/public-school-classes استفاده کنید.',
    replacementEndpoint: '/api/education/public-school-classes'
  });
});

router.get('/:id', async (req, res) => {
  try {
    const course = await resolveLegacyCourseDetail(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'صنف یافت نشد' });
    setLegacyRouteHeaders(
      res,
      course.classId ? `/api/education/public-school-classes/${course.classId}` : '/api/education/public-school-classes/:classId'
    );
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت صنف' });
  }
});

module.exports = router;
