const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const PDFDocument = require('pdfkit');
const Grade = require('../models/Grade');
const Course = require('../models/Course');
const User = require('../models/User');
const { findCourseStudents, hasStudentCourseAccess } = require('../utils/courseAccess');
const { findClassMemberships, resolveMembershipTransactionLink } = require('../utils/studentMembershipLookup');
const { normalizeText, resolveClassCourseReference, serializeSchoolClassLite } = require('../utils/classScope');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const membershipAccessOptions = Object.freeze({});

const assessment40FieldNames = [
  'assessment1Score',
  'assessment2Score',
  'assessment3Score',
  'assessment4Score'
];
const activeGradeMembershipStatuses = ['active', 'pending', 'transferred_in', 'suspended'];

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const gradesDir = path.join(__dirname, '..', 'uploads', 'grades');
if (!fs.existsSync(gradesDir)) {
  fs.mkdirSync(gradesDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, gradesDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'].includes(ext);
    if (!ok) return cb(new Error('فرمت فایل معتبر نیست'), false);
    cb(null, true);
  }
});

const clampNumber = (value, min, max) => {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (num < min || num > max) return null;
  return num;
};

const clampScoreOrDefault = (value, min, max, defaultValue = 0) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return clampNumber(value, min, max);
};

const buildLegacyAssessment40 = (total) => {
  let remaining = Math.max(0, Math.min(40, Number(total) || 0));
  const next = {};

  assessment40FieldNames.forEach((fieldName) => {
    const score = Math.min(10, remaining);
    next[fieldName] = score;
    remaining -= score;
  });

  return {
    ...next,
    total: Object.values(next).reduce((sum, value) => sum + value, 0)
  };
};

const hasStoredDetailedAssessment = (grade) => (
  assessment40FieldNames.every((fieldName) => typeof grade?.assessment40?.[fieldName] === 'number')
);

const normalizeAssessment40 = (grade) => {
  if (hasStoredDetailedAssessment(grade)) {
    const scores = assessment40FieldNames.map((fieldName) => (
      clampScoreOrDefault(grade.assessment40?.[fieldName], 0, 10, 0)
    ));

    return {
      assessment1Score: scores[0],
      assessment2Score: scores[1],
      assessment3Score: scores[2],
      assessment4Score: scores[3],
      total: scores.reduce((sum, value) => sum + value, 0)
    };
  }

  const legacyTotal = clampScoreOrDefault(grade?.term1Score ?? grade?.assessment40?.total, 0, 40, 0);
  return buildLegacyAssessment40(legacyTotal);
};

const normalizeGradeResponse = (grade) => {
  if (!grade) return null;

  const assessment40 = normalizeAssessment40(grade);
  const finalExamScore = clampScoreOrDefault(grade.finalExamScore ?? grade.term2Score, 0, 60, 0);
  const totalScore = clampScoreOrDefault(grade.totalScore, 0, 100, assessment40.total + finalExamScore);
  const attachment = grade.attachment || '';

  return {
    _id: grade._id,
    assessment40,
    finalExamScore,
    term1Score: assessment40.total,
    term2Score: finalExamScore,
    totalScore,
    attachment,
    attachmentOriginalName: grade.attachmentOriginalName || (attachment ? path.basename(attachment) : ''),
    attachmentUploadedAt: grade.attachmentUploadedAt || grade.updatedAt || grade.createdAt || null,
    updatedAt: grade.updatedAt || null,
    legacyAssessment: !hasStoredDetailedAssessment(grade) && assessment40.total > 0
  };
};

const parseAssessment40Payload = (body, existingGrade) => {
  const fallback = existingGrade ? normalizeAssessment40(existingGrade) : buildLegacyAssessment40(0);
  const hasDetailedFields = assessment40FieldNames.some((fieldName) => Object.prototype.hasOwnProperty.call(body, fieldName));

  if (hasDetailedFields) {
    const next = {};

    for (const fieldName of assessment40FieldNames) {
      const parsed = clampScoreOrDefault(body[fieldName], 0, 10, fallback[fieldName] ?? 0);
      if (parsed === null) return null;
      next[fieldName] = parsed;
    }

    return {
      ...next,
      total: Object.values(next).reduce((sum, value) => sum + value, 0)
    };
  }

  const legacyTotal = clampScoreOrDefault(body.term1Score, 0, 40, fallback.total ?? 0);
  if (legacyTotal === null) return null;
  return buildLegacyAssessment40(legacyTotal);
};

const parseFinalExamScore = (body, existingGrade) => {
  const fallback = existingGrade ? normalizeGradeResponse(existingGrade)?.finalExamScore ?? 0 : 0;
  return clampScoreOrDefault(body.finalExamScore ?? body.term2Score, 0, 60, fallback);
};

const serializeGradeItem = (grade) => ({
  ...normalizeGradeResponse(grade),
  course: grade?.course || null,
  courseId: grade?.course?._id || grade?.course || null,
  classId: grade?.classId?._id || grade?.classId || null,
  schoolClass: serializeSchoolClassLite(grade?.classId || null)
});

const mapStudentIdentity = (student) => (
  student ? {
    _id: student._id,
    name: student.name,
    email: student.email,
    grade: student.grade
  } : null
);

async function listGradeRosterByClassId(classId = '') {
  const memberships = await findClassMemberships({
    classId,
    statuses: activeGradeMembershipStatuses,
    currentOnly: true
  });
  const studentIds = Array.from(new Set(
    memberships.map((item) => item?.student).filter(Boolean).map((item) => String(item))
  ));
  if (!studentIds.length) return [];

  const students = await User.find({ _id: { $in: studentIds } }).select('name email grade');
  const studentMap = new Map(students.map((item) => [String(item._id), item]));
  return studentIds.map((id) => studentMap.get(String(id))).filter(Boolean);
}

async function resolveGradeScopePayload({ classId = '', courseId = '' } = {}) {
  const scopedClassId = normalizeText(classId);
  const scopedCourseId = normalizeText(courseId);
  if (!scopedClassId && !scopedCourseId) {
    return { classId: '', courseId: '', schoolClass: null, course: null };
  }

  const scope = await resolveClassCourseReference({ classId: scopedClassId, courseId: scopedCourseId });
  if (scope.error) return scope;
  if (!scope.classId) {
    return { error: 'Class mapping is required for grade operations.' };
  }

  return scope;
}

async function handleGradeRosterRequest(req, res, scopeInput = {}, options = {}) {
  try {
    const scope = await resolveGradeScopePayload(scopeInput);
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    if (options.legacyRoute) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? `/api/grades/class/${scope.classId}` : '/api/grades/class/:classId'
      );
    }

    const [students, grades] = await Promise.all([
      listGradeRosterByClassId(scope.classId),
      Grade.find({ classId: scope.classId })
        .populate('course', 'title category')
        .populate('classId', 'title code gradeLevel section')
    ]);
    const gradeMap = new Map(grades.map((grade) => [String(grade.student), grade]));

    const items = students.map((student) => {
      const grade = gradeMap.get(String(student?._id)) || null;
      return {
        student: mapStudentIdentity(student),
        grade: grade ? serializeGradeItem(grade) : null
      };
    });

    return res.json({
      success: true,
      classId: scope.classId,
      courseId: scope.courseId || null,
      schoolClass: serializeSchoolClassLite(scope.schoolClass),
      items
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در دریافت فهرست نمرات' });
  }
}

const canAccessStudent = (req, studentId) => {
  if (req.user.role === 'admin' || req.user.role === 'instructor') return true;
  return String(req.user.id) === String(studentId);
};

router.get('/my', requireAuth, async (req, res) => {
  try {
    const studentId = req.user.id;
    const filter = { student: studentId };
    const scope = await resolveGradeScopePayload({
      classId: req.query?.classId,
      courseId: req.query?.courseId
    });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (scope.classId) filter.classId = scope.classId;

    const grades = await Grade.find(filter)
      .populate('classId', 'title code gradeLevel section')
      .populate('course', 'title category')
      .sort({ updatedAt: -1 });

    const items = grades.map(serializeGradeItem);

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت نمرات' });
  }
});

router.get('/class/:classId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => (
  handleGradeRosterRequest(req, res, { classId: req.params.classId })
));

router.get('/course/:courseId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    return handleGradeRosterRequest(req, res, { courseId: req.params.courseId }, { legacyRoute: true });

    const { courseId } = req.params;
    const students = await findCourseStudents(courseId, {
      ...membershipAccessOptions,
      select: 'name email grade'
    });

    const grades = await Grade.find({ course: courseId });
    const gradeMap = new Map(grades.map((grade) => [String(grade.student), grade]));

    const items = students.map((student) => {
      const grade = gradeMap.get(String(student?._id)) || null;

      return {
        student: student ? {
          _id: student._id,
          name: student.name,
          email: student.email,
          grade: student.grade
        } : null,
        grade: normalizeGradeResponse(grade)
      };
    });

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت فهرست نمرات' });
  }
});

router.post('/upsert', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const studentId = normalizeText(req.body?.studentId);
    const scope = await resolveGradeScopePayload({
      classId: req.body?.classId,
      courseId: req.body?.courseId
    });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!studentId || !scope.classId || !scope.courseId) {
      return res.status(400).json({ success: false, message: 'Student and class IDs are required' });
    }
    if (normalizeText(req.body?.courseId) && !normalizeText(req.body?.classId)) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? '/api/grades/upsert (send classId)' : '/api/grades/upsert'
      );
    }

    const hasAccess = await hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions);
    if (!hasAccess) {
      return res.status(400).json({ success: false, message: 'Student is not enrolled in this class' });
    }

    const membershipLink = await resolveMembershipTransactionLink({
      studentUserId: studentId,
      courseId: scope.courseId,
      statuses: ['active', 'transferred_in', 'suspended']
    });
    if (!membershipLink.membership) {
      return res.status(400).json({ success: false, message: 'Active membership was not found for grade entry' });
    }

    const existingGrade = await Grade.findOne({ student: studentId, classId: scope.classId });
    const assessment40 = parseAssessment40Payload(req.body, existingGrade);
    const finalExamScore = parseFinalExamScore(req.body, existingGrade);

    if (!assessment40 || finalExamScore === null) {
      return res.status(400).json({ success: false, message: '????? ????? ???? (invalid grade payload)' });
    }

    const attachment = req.file ? `uploads/grades/${req.file.filename}` : '';
    if (!attachment) {
      return res.status(400).json({ success: false, message: '????? ???? ??? (attachment is required when saving grades)' });
    }

    const totalScore = assessment40.total + finalExamScore;

    const grade = await Grade.findOneAndUpdate(
      { student: studentId, classId: scope.classId },
      {
        course: scope.courseId,
        studentId: membershipLink.linkFields.studentId,
        studentMembershipId: membershipLink.linkFields.studentMembershipId,
        classId: membershipLink.linkFields.classId || scope.classId,
        academicYearId: membershipLink.linkFields.academicYearId,
        assessment40,
        finalExamScore,
        term1Score: assessment40.total,
        term2Score: finalExamScore,
        totalScore,
        attachment,
        attachmentOriginalName: req.file?.originalname || '',
        attachmentUploadedAt: new Date(),
        updatedBy: req.user.id
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logActivity({
      req,
      action: 'grade_upsert',
      targetType: 'Grade',
      targetId: String(grade?._id || ''),
      meta: {
        studentId,
        studentMembershipId: String(membershipLink.linkFields.studentMembershipId || ''),
        classId: scope.classId || '',
        courseId: scope.courseId || '',
        assessment40Total: assessment40.total,
        finalExamScore,
        totalScore,
        attachmentOriginalName: req.file?.originalname || '',
        legacyCourseScope: Boolean(normalizeText(req.body?.courseId) && !normalizeText(req.body?.classId))
      }
    });

    res.json({
      success: true,
      grade: {
        ...normalizeGradeResponse(grade),
        course: scope.course ? {
          _id: scope.course._id,
          title: scope.course.title || '',
          category: scope.course.category || ''
        } : null,
        courseId: scope.courseId,
        classId: scope.classId,
        schoolClass: serializeSchoolClassLite(scope.schoolClass)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to save grade' });
  }
});

async function sendGradeReport(req, res, scopeInput = {}, options = {}) {
  const scope = await resolveGradeScopePayload(scopeInput);
  if (scope.error) {
    return res.status(400).json({ success: false, message: scope.error });
  }

  if (options.legacyRoute) {
    setLegacyRouteHeaders(
      res,
      scope.classId ? `/api/grades/report/class/${scope.classId}` : '/api/grades/report/class/:classId'
    );
  }

  const studentId = req.query.studentId && canAccessStudent(req, req.query.studentId)
    ? req.query.studentId
    : req.user.id;

  if (!canAccessStudent(req, studentId)) {
    return res.status(403).json({ success: false, message: 'Unauthorized access.' });
  }

  const hasAccess = scope.courseId
    ? await hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions)
    : false;
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Student does not have access to this class' });
  }

  const [grade, course, student] = await Promise.all([
    Grade.findOne({ student: studentId, classId: scope.classId }),
    scope.courseId ? Course.findById(scope.courseId) : null,
    User.findById(studentId).select('name email grade')
  ]);

  if (!grade) {
    return res.status(404).json({ success: false, message: 'Grade was not found.' });
  }

  const normalizedGrade = normalizeGradeResponse(grade);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="report-card.pdf"');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  const fontPath = path.join(__dirname, '..', '..', 'Fonts', 'B Nazanin_p30download.com.ttf');
  if (fs.existsSync(fontPath)) {
    doc.font(fontPath);
  }

  doc.fontSize(18).text('Grade Report', { align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Student: ${student?.name || '---'}`, { align: 'right' });
  doc.text(`Email: ${student?.email || '---'}`, { align: 'right' });
  doc.text(`Class: ${course?.title || scope.schoolClass?.title || '---'}`, { align: 'right' });
  doc.text(`Grade Level: ${student?.grade || '---'}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(13).text('Score Breakdown', { align: 'right' });
  doc.moveDown(0.5);
  doc.fontSize(12).text(`Assessment 1 (10): ${normalizedGrade.assessment40.assessment1Score}`, { align: 'right' });
  doc.text(`Assessment 2 (10): ${normalizedGrade.assessment40.assessment2Score}`, { align: 'right' });
  doc.text(`Assessment 3 (10): ${normalizedGrade.assessment40.assessment3Score}`, { align: 'right' });
  doc.text(`Assessment 4 (10): ${normalizedGrade.assessment40.assessment4Score}`, { align: 'right' });
  doc.text(`Assessment Total (40): ${normalizedGrade.assessment40.total}`, { align: 'right' });
  doc.text(`Final Exam (60): ${normalizedGrade.finalExamScore}`, { align: 'right' });
  doc.text(`Overall Total (100): ${normalizedGrade.totalScore}`, { align: 'right' });
  doc.moveDown();

  if (normalizedGrade.attachment) {
    doc.fontSize(10).text(
      `Attachment: ${normalizedGrade.attachmentOriginalName || normalizedGrade.attachment}`,
      { align: 'right' }
    );
  }

  doc.end();
  return null;
}

router.get('/report/class/:classId', requireAuth, async (req, res) => {
  try {
    return sendGradeReport(req, res, { classId: req.params.classId });

    const scope = await resolveGradeScopePayload({ classId: req.params.classId });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    const studentId = req.query.studentId && canAccessStudent(req, req.query.studentId)
      ? req.query.studentId
      : req.user.id;

    if (!canAccessStudent(req, studentId)) {
      return res.status(403).json({ success: false, message: 'Ø¯Ø³ØªØ±Ø³ÛŒ ØºÛŒØ±Ù…Ø¬Ø§Ø²' });
    }

    const hasAccess = scope.courseId
      ? await hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions)
      : false;
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Student does not have access to this class' });
    }

    const [grade, course, student] = await Promise.all([
      Grade.findOne({ student: studentId, classId: scope.classId }),
      scope.courseId ? Course.findById(scope.courseId) : null,
      User.findById(studentId).select('name email grade')
    ]);

    if (!grade) {
      return res.status(404).json({ success: false, message: 'Ù†Ù…Ø±Ù‡â€ŒØ§ÛŒ Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡ Ø§Ø³Øª' });
    }

    const normalizedGrade = normalizeGradeResponse(grade);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report-card.pdf"');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    const fontPath = path.join(__dirname, '..', '..', 'Fonts', 'B Nazanin_p30download.com.ttf');
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    }

    doc.fontSize(18).text('Ú©Ø§Ø±Ù†Ø§Ù…Ù‡ ØµÙ†Ù', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Ù†Ø§Ù… Ø´Ø§Ú¯Ø±Ø¯: ${student?.name || '---'}`, { align: 'right' });
    doc.text(`Ø§ÛŒÙ…ÛŒÙ„: ${student?.email || '---'}`, { align: 'right' });
    doc.text(`ØµÙ†Ù: ${course?.title || scope.schoolClass?.title || '---'}`, { align: 'right' });
    doc.text(`Ø±Ø´ØªÙ‡/Ù¾Ø§ÛŒÙ‡: ${student?.grade || '---'}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(13).text('Ù…Ø¯Ù„ Ù†Ù…Ø±Ù‡â€ŒØ¯Ù‡ÛŒ', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Ø§Ø±Ø²ÛŒØ§Ø¨ÛŒ 1 (Ø§Ø² 10): ${normalizedGrade.assessment40.assessment1Score}`, { align: 'right' });
    doc.text(`Ø§Ø±Ø²ÛŒØ§Ø¨ÛŒ 2 (Ø§Ø² 10): ${normalizedGrade.assessment40.assessment2Score}`, { align: 'right' });
    doc.text(`Ø§Ø±Ø²ÛŒØ§Ø¨ÛŒ 3 (Ø§Ø² 10): ${normalizedGrade.assessment40.assessment3Score}`, { align: 'right' });
    doc.text(`Ø§Ø±Ø²ÛŒØ§Ø¨ÛŒ 4 (Ø§Ø² 10): ${normalizedGrade.assessment40.assessment4Score}`, { align: 'right' });
    doc.text(`Ù…Ø¬Ù…ÙˆØ¹ Ø¨Ø®Ø´ 40 Ù†Ù…Ø±Ù‡â€ŒØ§ÛŒ: ${normalizedGrade.assessment40.total}`, { align: 'right' });
    doc.text(`Ø§Ù…ØªØ­Ø§Ù† Ù†Ù‡Ø§ÛŒÛŒ (Ø§Ø² 60): ${normalizedGrade.finalExamScore}`, { align: 'right' });
    doc.text(`Ù…Ø¬Ù…ÙˆØ¹ Ú©Ù„ (Ø§Ø² 100): ${normalizedGrade.totalScore}`, { align: 'right' });
    doc.moveDown();

    if (normalizedGrade.attachment) {
      doc.fontSize(10).text(
        `Ø¨Ø±Ú¯Ù‡ Ø±ÛŒØ²Ù†Ù…Ø±Ø§Øª: ${normalizedGrade.attachmentOriginalName || normalizedGrade.attachment}`,
        { align: 'right' }
      );
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± ØªÙˆÙ„ÛŒØ¯ Ú©Ø§Ø±Ù†Ø§Ù…Ù‡' });
  }
});

router.get('/report/:courseId', requireAuth, async (req, res) => {
  try {
    return sendGradeReport(req, res, { courseId: req.params.courseId }, { legacyRoute: true });

    const { courseId } = req.params;
    const studentId = req.query.studentId && canAccessStudent(req, req.query.studentId)
      ? req.query.studentId
      : req.user.id;

    if (!canAccessStudent(req, studentId)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }
    const hasAccess = await hasStudentCourseAccess(studentId, courseId, membershipAccessOptions);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'Student does not have access to this class' });
    }

    const [grade, course, student] = await Promise.all([
      Grade.findOne({ student: studentId, course: courseId }),
      Course.findById(courseId),
      User.findById(studentId).select('name email grade')
    ]);

    if (!grade) {
      return res.status(404).json({ success: false, message: 'نمره‌ای ثبت نشده است' });
    }

    const normalizedGrade = normalizeGradeResponse(grade);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report-card.pdf"');

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    const fontPath = path.join(__dirname, '..', '..', 'Fonts', 'B Nazanin_p30download.com.ttf');
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    }

    doc.fontSize(18).text('کارنامه صنف', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`نام شاگرد: ${student?.name || '---'}`, { align: 'right' });
    doc.text(`ایمیل: ${student?.email || '---'}`, { align: 'right' });
    doc.text(`صنف: ${course?.title || '---'}`, { align: 'right' });
    doc.text(`رشته/پایه: ${student?.grade || '---'}`, { align: 'right' });
    doc.moveDown();

    doc.fontSize(13).text('مدل نمره‌دهی', { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`ارزیابی 1 (از 10): ${normalizedGrade.assessment40.assessment1Score}`, { align: 'right' });
    doc.text(`ارزیابی 2 (از 10): ${normalizedGrade.assessment40.assessment2Score}`, { align: 'right' });
    doc.text(`ارزیابی 3 (از 10): ${normalizedGrade.assessment40.assessment3Score}`, { align: 'right' });
    doc.text(`ارزیابی 4 (از 10): ${normalizedGrade.assessment40.assessment4Score}`, { align: 'right' });
    doc.text(`مجموع بخش 40 نمره‌ای: ${normalizedGrade.assessment40.total}`, { align: 'right' });
    doc.text(`امتحان نهایی (از 60): ${normalizedGrade.finalExamScore}`, { align: 'right' });
    doc.text(`مجموع کل (از 100): ${normalizedGrade.totalScore}`, { align: 'right' });
    doc.moveDown();

    if (normalizedGrade.attachment) {
      doc.fontSize(10).text(
        `برگه ریزنمرات: ${normalizedGrade.attachmentOriginalName || normalizedGrade.attachment}`,
        { align: 'right' }
      );
    }

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در تولید کارنامه' });
  }
});

module.exports = router;
