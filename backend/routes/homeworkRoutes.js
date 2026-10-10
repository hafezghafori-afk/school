const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { durableDiskStorage } = require('../services/uploadStorageService');

const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { hasStudentCourseAccess } = require('../utils/courseAccess');
const { findActiveMembership } = require('../utils/studentMembershipLookup');
const { normalizeText, resolveClassCourseReference, serializeSchoolClassLite } = require('../utils/classScope');
const { logActivity } = require('../utils/activity');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { describeLateness, isHomeworkOverdue, resolveSubmissionStatus } = require('../utils/homeworkLateness');
const { loadClassRoster, resolveAdmissionNumbers, notifyStudents } = require('../utils/homeworkRoster');

const router = express.Router();

const manageHomework = [requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content')];

const MAX_SCORE_LIMIT = 1000;

// The teacher picks the scale (10, 20, 100, ...). Blank keeps the old default.
const parseMaxScore = (raw, fallback = 100) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: fallback };
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1 || value > MAX_SCORE_LIMIT) {
    return { error: `حداکثر نمره باید عددی بین ۱ و ${MAX_SCORE_LIMIT.toLocaleString('fa-AF')} باشد.` };
  }
  return { value };
};

const idOf = (value) => String(value?._id || value || '').trim();

const membershipAccessOptions = Object.freeze({});

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const homeworkDir = path.join(__dirname, '..', 'uploads', 'homeworks');
const submissionDir = path.join(__dirname, '..', 'uploads', 'submissions');
if (!fs.existsSync(homeworkDir)) fs.mkdirSync(homeworkDir, { recursive: true });
if (!fs.existsSync(submissionDir)) fs.mkdirSync(submissionDir, { recursive: true });

const safeName = (name) => String(name || '').replace(/[^a-zA-Z0-9.\-_]/g, '_');

const homeworkStorage = durableDiskStorage({
  destination: (req, file, cb) => cb(null, homeworkDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const submissionStorage = durableDiskStorage({
  destination: (req, file, cb) => cb(null, submissionDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const uploadHomework = multer({
  storage: homeworkStorage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadSubmission = multer({
  storage: submissionStorage,
  limits: { fileSize: 12 * 1024 * 1024 }
});

const serializeHomework = (item) => {
  const plain = item?.toObject ? item.toObject() : item;

  return {
    ...plain,
    courseId: plain?.course?._id || plain?.course || null,
    classId: plain?.classId?._id || plain?.classId || null,
    schoolClass: serializeSchoolClassLite(plain?.classId || null)
  };
};

const serializeSubmission = (item, dueDate = undefined) => {
  const plain = item?.toObject ? item.toObject() : item;
  const homework = plain?.homework && typeof plain.homework === 'object'
    ? plain.homework
    : null;
  const lateness = describeLateness(plain?.submittedAt, dueDate !== undefined ? dueDate : homework?.dueDate);

  return {
    ...plain,
    status: resolveSubmissionStatus(plain),
    isLate: lateness.isLate,
    lateDays: lateness.lateDays,
    courseId: plain?.course?._id || plain?.course || null,
    classId: plain?.classId?._id || plain?.classId || null,
    schoolClass: serializeSchoolClassLite(plain?.classId || homework?.classId || null),
    homework: homework ? {
      ...homework,
      courseId: homework?.course?._id || homework?.course || null,
      classId: homework?.classId?._id || homework?.classId || null,
      schoolClass: serializeSchoolClassLite(homework?.classId || null)
    } : plain?.homework
  };
};

async function resolveHomeworkScopePayload({ classId = '', courseId = '' } = {}, options = {}) {
  const scopedClassId = normalizeText(classId);
  const scopedCourseId = normalizeText(courseId);

  if (!scopedClassId && !scopedCourseId) {
    return { error: options.missingMessage || 'Class is required for homework operations.' };
  }

  const scope = await resolveClassCourseReference({ classId: scopedClassId, courseId: scopedCourseId });
  if (scope.error) return scope;

  if (!scope.classId) {
    return { error: options.classRequiredMessage || 'Class mapping is required for homework operations.' };
  }
  if (options.requireCompatCourse && !scope.courseId) {
    return { error: options.courseRequiredMessage || 'Compatible course mapping is required for homework operations.' };
  }

  return scope;
}

async function ensureStudentScopeAccess(studentId, scope = {}) {
  if (!studentId || !scope?.classId) return false;

  const membership = await findActiveMembership({
    studentUserId: studentId,
    classId: scope.classId,
    courseId: scope.courseId || ''
  });
  if (membership) return true;

  if (scope.courseId) {
    return hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions);
  }

  return false;
}

// One submissions query for the whole list instead of one per card.
async function buildHomeworkStats(homeworks = [], classId = '') {
  const roster = await loadClassRoster(classId);
  const rosterIds = new Set(roster.map((row) => row.userId));
  const homeworkIds = homeworks.map(idOf);
  const submissions = homeworkIds.length
    ? await HomeworkSubmission.find({ homework: { $in: homeworkIds } })
      .select('homework student status score submittedAt revisionRequestedAt')
    : [];

  const byHomework = new Map();
  homeworks.forEach((homework) => {
    const rows = submissions.filter((row) => idOf(row.homework) === idOf(homework));
    const counts = { submitted: 0, graded: 0, revision_requested: 0 };
    let late = 0;
    let scoreTotal = 0;
    let scored = 0;
    rows.forEach((row) => {
      const status = resolveSubmissionStatus(row);
      counts[status] += 1;
      if (describeLateness(row.submittedAt, homework.dueDate).isLate) late += 1;
      if (status === 'graded' && typeof row.score === 'number') {
        scoreTotal += row.score;
        scored += 1;
      }
    });
    const submittedFromRoster = rows.filter((row) => rosterIds.has(idOf(row.student))).length;
    byHomework.set(idOf(homework), {
      rosterCount: roster.length,
      submittedCount: rows.length,
      missingCount: Math.max(roster.length - submittedFromRoster, 0),
      pendingCount: counts.submitted,
      gradedCount: counts.graded,
      revisionCount: counts.revision_requested,
      lateCount: late,
      averageScore: scored ? Math.round((scoreTotal / scored) * 10) / 10 : null,
      averagePercent: scored && homework.maxScore
        ? Math.round((scoreTotal / scored / homework.maxScore) * 100)
        : null,
      isOverdue: isHomeworkOverdue(homework.dueDate)
    });
  });
  return { rosterCount: roster.length, byHomework };
}

async function sendHomeworkList(req, res, scopeInput = {}, options = {}) {
  try {
    const scope = await resolveHomeworkScopePayload(scopeInput, {
      classRequiredMessage: 'Class mapping is required for homework lookup.'
    });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    if (options.legacyRoute) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? `/api/homeworks/class/${scope.classId}` : '/api/homeworks/class/:classId'
      );
    }

    if (req.user.role === 'student') {
      const ok = await ensureStudentScopeAccess(req.user.id, scope);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
      }
    }

    const items = await Homework.find({ classId: scope.classId })
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section')
      .sort({ createdAt: -1 });

    const wantsStats = String(req.query?.withStats || '') === '1' && req.user.role !== 'student';
    const stats = wantsStats ? await buildHomeworkStats(items, scope.classId) : null;

    return res.json({
      success: true,
      classId: scope.classId,
      courseId: scope.courseId || null,
      schoolClass: serializeSchoolClassLite(scope.schoolClass),
      ...(stats ? { rosterCount: stats.rosterCount } : {}),
      items: items.map((item) => (
        stats
          ? { ...serializeHomework(item), stats: stats.byHomework.get(idOf(item)) }
          : serializeHomework(item)
      ))
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load homework.' });
  }
}

router.get('/class/:classId', requireAuth, async (req, res) => (
  sendHomeworkList(req, res, { classId: req.params.classId })
));

router.get('/course/:courseId', requireAuth, async (req, res) => (
  sendHomeworkList(req, res, { courseId: req.params.courseId }, { legacyRoute: true })
));

router.post('/create', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  uploadHomework.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { lessonId, title, description, dueDate, maxScore } = req.body;
    const scope = await resolveHomeworkScopePayload({
      classId: req.body?.classId,
      courseId: req.body?.courseId
    }, {
      missingMessage: 'Class and title are required.',
      classRequiredMessage: 'Class mapping is required before creating homework.',
      courseRequiredMessage: 'Compatible course mapping is required before creating homework.',
      requireCompatCourse: true
    });

    if (!normalizeText(title)) {
      return res.status(400).json({ success: false, message: 'عنوان کارخانگی و صنف الزامی است.' });
    }
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    const parsedMaxScore = parseMaxScore(maxScore);
    if (parsedMaxScore.error) {
      return res.status(400).json({ success: false, message: parsedMaxScore.error });
    }

    const homework = await Homework.create({
      course: scope.courseId,
      classId: scope.classId,
      lesson: lessonId || null,
      title: normalizeText(title),
      description: description || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      maxScore: parsedMaxScore.value,
      attachment: req.file ? `uploads/homeworks/${req.file.filename}` : '',
      createdBy: req.user.id
    });

    const populated = await Homework.findById(homework._id)
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section');

    await logActivity({
      req,
      action: 'create_homework',
      targetType: 'Homework',
      targetId: String(homework._id || ''),
      meta: {
        title: homework.title || '',
        classId: scope.classId || '',
        courseId: scope.courseId || '',
        dueDate: homework.dueDate ? new Date(homework.dueDate).toISOString() : '',
        maxScore: Number(homework.maxScore || 0),
        hasAttachment: Boolean(req.file)
      }
    });

    let notifiedCount = 0;
    if (String(req.body?.notifyStudents || '') === 'true') {
      const roster = await loadClassRoster(scope.classId);
      notifiedCount = await notifyStudents(roster.map((row) => row.userId), {
        title: 'کارخانگی جدید',
        message: `کارخانگی «${homework.title}» برای صنف شما ثبت شد.`
      });
    }

    res.status(201).json({ success: true, homework: serializeHomework(populated || homework), notifiedCount });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create homework.' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  uploadHomework.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id);
    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.'});
    }

    const update = {};
    if (req.body?.title !== undefined) update.title = normalizeText(req.body.title);
    if (req.body?.description !== undefined) update.description = req.body.description;
    if (req.body?.dueDate !== undefined) update.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body?.maxScore !== undefined) {
      const parsedMaxScore = parseMaxScore(req.body.maxScore, homework.maxScore || 100);
      if (parsedMaxScore.error) {
        return res.status(400).json({ success: false, message: parsedMaxScore.error });
      }
      // Lowering the scale under a score already given would leave that
      // score above the maximum.
      const graded = await HomeworkSubmission.find({ homework: homework._id }).select('score');
      const highest = graded.reduce((max, row) => (
        typeof row.score === 'number' && row.score > max ? row.score : max
      ), 0);
      if (parsedMaxScore.value < highest) {
        return res.status(409).json({
          success: false,
          message: `یک شاگرد قبلاً نمرهٔ ${highest.toLocaleString('fa-AF')} گرفته است؛ حداکثر نمره نمی‌تواند کمتر از آن باشد.`
        });
      }
      update.maxScore = parsedMaxScore.value;
    }
    if (req.body?.lessonId !== undefined) update.lesson = req.body.lessonId || null;
    if (req.file) update.attachment = `uploads/homeworks/${req.file.filename}`;

    const wantsScopeUpdate = normalizeText(req.body?.classId) || normalizeText(req.body?.courseId);
    if (wantsScopeUpdate) {
      const scope = await resolveHomeworkScopePayload({
        classId: req.body?.classId,
        courseId: req.body?.courseId
      }, {
        classRequiredMessage: 'Class mapping is required before updating homework.',
        courseRequiredMessage: 'Compatible course mapping is required before updating homework.',
        requireCompatCourse: true
      });
      if (scope.error) {
        return res.status(400).json({ success: false, message: scope.error });
      }

      update.classId = scope.classId;
      update.course = scope.courseId;
    }

    const saved = await Homework.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section');

    await logActivity({
      req,
      action: 'update_homework',
      targetType: 'Homework',
      targetId: String(saved?._id || req.params.id || ''),
      meta: {
        title: saved?.title || update.title || '',
        classId: String(saved?.classId?._id || saved?.classId || update.classId || homework.classId || ''),
        courseId: String(saved?.course?._id || saved?.course || update.course || homework.course || ''),
        dueDate: saved?.dueDate ? new Date(saved.dueDate).toISOString() : '',
        maxScore: Number(saved?.maxScore || update.maxScore || homework.maxScore || 0),
        hasAttachment: Boolean(saved?.attachment || update.attachment || homework.attachment),
        legacyCourseScope: !normalizeText(req.body?.classId) && Boolean(normalizeText(req.body?.courseId))
      }
    });

    res.json({ success: true, homework: serializeHomework(saved) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to update homework.' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const homework = await Homework.findByIdAndDelete(req.params.id);
    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.'});
    }

    const deleteResult = await HomeworkSubmission.deleteMany({ homework: homework._id });

    await logActivity({
      req,
      action: 'delete_homework',
      targetType: 'Homework',
      targetId: String(homework._id || req.params.id || ''),
      meta: {
        title: homework.title || '',
        classId: String(homework.classId || ''),
        courseId: String(homework.course || ''),
        deletedSubmissionCount: Number(deleteResult?.deletedCount || 0)
      }
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete homework.' });
  }
});

router.post('/:id/submit', requireAuth, (req, res, next) => {
  uploadSubmission.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('course', 'title category')
      .populate('classId', 'title code gradeLevel section');

    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.'});
    }
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can submit homework.' });
    }

    const scope = await resolveHomeworkScopePayload({
      classId: homework.classId?._id || homework.classId,
      courseId: homework.course?._id || homework.course
    }, {
      classRequiredMessage: 'Class mapping is required before submitting homework.'
    });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    const ok = await ensureStudentScopeAccess(req.user.id, scope);
    if (!ok) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const text = normalizeText(req.body?.text);
    if (!text || !req.file) {
      return res.status(400).json({ success: false, message: 'متن و فایل کارخانگی هر دو الزامی است.' });
    }

    // Once handed in, an answer can only be replaced when the teacher sent
    // it back for revision. Late hand-ins are accepted and flagged instead.
    const existing = await HomeworkSubmission.findOne({ homework: homework._id, student: req.user.id });
    const isResubmission = Boolean(existing);
    if (existing && resolveSubmissionStatus(existing) !== 'revision_requested') {
      return res.status(409).json({
        success: false,
        message: 'این کارخانگی قبلاً تحویل شده است؛ فقط وقتی استاد آن را برای اصلاح برگرداند می‌توانید دوباره بفرستید.'
      });
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homework: homework._id, student: req.user.id },
      {
        course: scope.courseId || homework.course?._id || homework.course,
        classId: scope.classId || homework.classId?._id || homework.classId,
        text,
        file: `uploads/submissions/${req.file.filename}`,
        submittedAt: new Date(),
        status: 'submitted',
        score: null
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const populated = await HomeworkSubmission.findById(submission._id)
      .populate({
        path: 'homework',
        select: 'title course classId dueDate maxScore attachment',
        populate: [
          { path: 'course', select: 'title category' },
          { path: 'classId', select: 'title code gradeLevel section' }
        ]
      });

    await logActivity({
      req,
      action: 'submit_homework',
      targetType: 'HomeworkSubmission',
      targetId: String(submission._id || ''),
      meta: {
        homeworkId: String(homework._id || ''),
        classId: scope.classId || '',
        courseId: scope.courseId || '',
        studentId: String(req.user.id || ''),
        hasFile: Boolean(req.file),
        textLength: text.length,
        resubmission: isResubmission
      }
    });

    res.json({ success: true, submission: serializeSubmission(populated || submission, homework.dueDate) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to submit homework.' });
  }
});

router.get('/my/submissions', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const filter = { student: req.user.id };
    let scope = null;

    if (normalizeText(req.query?.classId) || normalizeText(req.query?.courseId)) {
      scope = await resolveHomeworkScopePayload({
        classId: req.query?.classId,
        courseId: req.query?.courseId
      }, {
        classRequiredMessage: 'Class mapping is required for homework submission lookup.'
      });
      if (scope.error) {
        return res.status(400).json({ success: false, message: scope.error });
      }

      const ok = await ensureStudentScopeAccess(req.user.id, scope);
      if (!ok) {
        return res.status(403).json({ success: false, message: 'Forbidden.' });
      }

      filter.classId = scope.classId;
    }

    const items = await HomeworkSubmission.find(filter)
      .populate({
        path: 'homework',
        select: 'title course classId dueDate maxScore attachment',
        populate: [
          { path: 'course', select: 'title category' },
          { path: 'classId', select: 'title code gradeLevel section' }
        ]
      })
      .sort({ submittedAt: -1 });

    res.json({
      success: true,
      classId: scope?.classId || null,
      courseId: scope?.courseId || null,
      schoolClass: serializeSchoolClassLite(scope?.schoolClass),
      items: items.map(serializeSubmission)
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load homework submissions.' });
  }
});

router.get('/:id/submissions', ...manageHomework, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id);
    const items = await HomeworkSubmission.find({ homework: req.params.id })
      .populate('student', 'name email grade')
      .sort({ submittedAt: -1 });

    res.json({ success: true, items: items.map((item) => serializeSubmission(item, homework?.dueDate || null)) });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت تحویل‌ها ناموفق بود.' });
  }
});

const formatShamsiDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fa-AF-u-ca-persian', { timeZone: 'Asia/Kabul' });
};

// Every current student of the class, with their submission (if any), plus
// anyone who handed in and has since left the class.
async function buildHomeworkReview(homework) {
  const [roster, submissions] = await Promise.all([
    loadClassRoster(idOf(homework.classId)),
    HomeworkSubmission.find({ homework: homework._id })
      .populate('student', 'name email grade')
      .sort({ submittedAt: -1 })
  ]);

  const submissionByStudent = new Map();
  submissions.forEach((item) => {
    const key = idOf(item.student);
    if (key && !submissionByStudent.has(key)) submissionByStudent.set(key, item);
  });

  const rosterIds = new Set(roster.map((row) => row.userId));
  const leftIds = [...submissionByStudent.keys()].filter((id) => !rosterIds.has(id));
  const leftAdmissionNumbers = leftIds.length ? await resolveAdmissionNumbers(leftIds) : new Map();

  const overdue = isHomeworkOverdue(homework.dueDate);
  const toRow = (student, inClass) => {
    const submission = submissionByStudent.get(student.userId) || null;
    const serialized = submission ? serializeSubmission(submission, homework.dueDate) : null;
    return {
      student: {
        _id: student.userId,
        name: student.name,
        email: student.email,
        admissionNo: student.admissionNo
      },
      inClass,
      state: serialized ? serialized.status : (overdue ? 'missing_overdue' : 'missing'),
      submission: serialized
    };
  };

  const rows = [
    ...roster.map((student) => toRow(student, true)),
    ...leftIds.map((userId) => {
      const submission = submissionByStudent.get(userId);
      return toRow({
        userId,
        name: submission?.student?.name || '',
        email: submission?.student?.email || '',
        admissionNo: leftAdmissionNumbers.get(userId) || ''
      }, false);
    })
  ];

  const summary = rows.reduce((acc, row) => {
    acc[row.state] = (acc[row.state] || 0) + 1;
    if (row.submission?.isLate) acc.late += 1;
    return acc;
  }, { total: rows.length, rosterCount: roster.length, late: 0 });

  return { rows, summary, overdue };
}

router.get('/:id/roster', ...manageHomework, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('classId', 'title code gradeLevel section');
    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.' });
    }
    const review = await buildHomeworkReview(homework);
    res.json({ success: true, homework: serializeHomework(homework), ...review });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت فهرست شاگردان ناموفق بود.' });
  }
});

async function findOwnedSubmission(homeworkId, submissionId) {
  if (!submissionId) return { error: 'شناسهٔ تحویل لازم است.', status: 400 };
  const [homework, submission] = await Promise.all([
    Homework.findById(homeworkId),
    HomeworkSubmission.findById(submissionId)
  ]);
  if (!homework) return { error: 'کارخانگی یافت نشد.', status: 404 };
  if (!submission || idOf(submission.homework) !== idOf(homework)) {
    return { error: 'این تحویل یافت نشد.', status: 404 };
  }
  return { homework, submission };
}

router.post('/:id/grade', ...manageHomework, async (req, res) => {
  try {
    const { submissionId, score, feedback } = req.body;
    const found = await findOwnedSubmission(req.params.id, submissionId);
    if (found.error) {
      return res.status(found.status).json({ success: false, message: found.error });
    }
    const { homework } = found;

    const maxScore = Number(homework.maxScore || 0);
    const numericScore = Number(score);
    if (score === '' || score === null || score === undefined
      || Number.isNaN(numericScore) || numericScore < 0 || numericScore > maxScore) {
      return res.status(400).json({
        success: false,
        message: `نمره باید بین ۰ و ${maxScore.toLocaleString('fa-AF')} باشد.`
      });
    }

    const submission = await HomeworkSubmission.findByIdAndUpdate(
      submissionId,
      {
        score: numericScore,
        feedback: feedback || '',
        gradedBy: req.user.id,
        status: 'graded'
      },
      { new: true }
    );

    await logActivity({
      req,
      action: 'grade_homework_submission',
      targetType: 'HomeworkSubmission',
      targetId: String(submission._id || submissionId || ''),
      targetUser: String(submission.student || ''),
      meta: {
        homeworkId: String(homework._id || req.params.id || ''),
        score: numericScore,
        maxScore,
        feedbackLength: normalizeText(feedback).length
      }
    });

    if (req.body?.notify !== false) {
      await notifyStudents([submission.student], {
        title: 'نمرهٔ کارخانگی',
        message: `کارخانگی «${homework.title}» بررسی شد: نمرهٔ شما ${numericScore.toLocaleString('fa-AF')} از ${maxScore.toLocaleString('fa-AF')}.`
      });
    }

    res.json({ success: true, submission: serializeSubmission(submission, homework.dueDate) });
  } catch {
    res.status(500).json({ success: false, message: 'ثبت نمره ناموفق بود.' });
  }
});

router.post('/:id/request-revision', ...manageHomework, async (req, res) => {
  try {
    const { submissionId } = req.body;
    const note = normalizeText(req.body?.note);
    if (!note) {
      return res.status(400).json({ success: false, message: 'بنویسید شاگرد چه چیزی را اصلاح کند.' });
    }
    const found = await findOwnedSubmission(req.params.id, submissionId);
    if (found.error) {
      return res.status(found.status).json({ success: false, message: found.error });
    }
    const { homework } = found;

    const submission = await HomeworkSubmission.findByIdAndUpdate(
      submissionId,
      {
        status: 'revision_requested',
        revisionNote: note,
        revisionRequestedAt: new Date(),
        revisionCount: Number(found.submission.revisionCount || 0) + 1,
        score: null,
        gradedBy: req.user.id
      },
      { new: true }
    );

    await logActivity({
      req,
      action: 'request_homework_revision',
      targetType: 'HomeworkSubmission',
      targetId: String(submission._id || submissionId || ''),
      targetUser: String(submission.student || ''),
      meta: {
        homeworkId: String(homework._id || req.params.id || ''),
        revisionCount: Number(submission.revisionCount || 0),
        noteLength: note.length
      }
    });

    await notifyStudents([submission.student], {
      title: 'کارخانگی برای اصلاح برگشت',
      message: `کارخانگی «${homework.title}» برای اصلاح برگردانده شد: ${note}`
    });

    res.json({ success: true, submission: serializeSubmission(submission, homework.dueDate) });
  } catch {
    res.status(500).json({ success: false, message: 'برگرداندن برای اصلاح ناموفق بود.' });
  }
});

router.post('/:id/notify', ...manageHomework, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id);
    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.' });
    }

    const audience = String(req.body?.audience || 'missing');
    if (!['all', 'missing'].includes(audience)) {
      return res.status(400).json({ success: false, message: 'گروه گیرندگان معتبر نیست.' });
    }

    const { rows } = await buildHomeworkReview(homework);
    const recipients = rows
      .filter((row) => row.inClass)
      .filter((row) => audience === 'all' || !row.submission)
      .map((row) => row.student._id);
    if (!recipients.length) {
      return res.status(400).json({
        success: false,
        message: audience === 'missing' ? 'همهٔ شاگردان این کارخانگی را تحویل داده‌اند.' : 'شاگردی در این صنف یافت نشد.'
      });
    }

    const dueText = homework.dueDate ? ` موعد: ${formatShamsiDate(homework.dueDate)}.` : '';
    const custom = normalizeText(req.body?.message);
    const message = custom || (audience === 'missing'
      ? `کارخانگی «${homework.title}» را هنوز تحویل نداده‌اید.${dueText}`
      : `یادآوری کارخانگی «${homework.title}».${dueText}`);

    const notifiedCount = await notifyStudents(recipients, { title: 'یادآوری کارخانگی', message });

    await logActivity({
      req,
      action: 'notify_homework_students',
      targetType: 'Homework',
      targetId: String(homework._id || ''),
      meta: { audience, notifiedCount }
    });

    res.json({ success: true, notifiedCount });
  } catch {
    res.status(500).json({ success: false, message: 'ارسال اعلان ناموفق بود.' });
  }
});

router.post('/:id/copy', ...manageHomework, async (req, res) => {
  try {
    const source = await Homework.findById(req.params.id);
    if (!source) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.' });
    }

    const classIds = [...new Set((Array.isArray(req.body?.classIds) ? req.body.classIds : [])
      .map((value) => normalizeText(value))
      .filter((value) => value && value !== idOf(source.classId)))];
    if (!classIds.length) {
      return res.status(400).json({ success: false, message: 'حداقل یک صنف دیگر را انتخاب کنید.' });
    }

    const dueDate = req.body?.dueDate === undefined
      ? source.dueDate
      : (req.body.dueDate ? new Date(req.body.dueDate) : null);
    const shouldNotify = req.body?.notifyStudents === true;

    const created = [];
    const failed = [];
    for (const classId of classIds) {
      const scope = await resolveHomeworkScopePayload({ classId }, {
        classRequiredMessage: 'این صنف به یک کورس وصل نیست.',
        courseRequiredMessage: 'این صنف به یک کورس وصل نیست.',
        requireCompatCourse: true
      });
      if (scope.error) {
        failed.push({ classId, message: scope.error });
        continue;
      }

      const copy = await Homework.create({
        course: scope.courseId,
        classId: scope.classId,
        lesson: null,
        title: source.title,
        description: source.description || '',
        dueDate,
        maxScore: source.maxScore,
        attachment: source.attachment || '',
        createdBy: req.user.id,
        copiedFrom: source._id
      });

      if (shouldNotify) {
        const roster = await loadClassRoster(scope.classId);
        await notifyStudents(roster.map((row) => row.userId), {
          title: 'کارخانگی جدید',
          message: `کارخانگی «${copy.title}» برای صنف شما ثبت شد.`
        });
      }

      created.push({
        homeworkId: idOf(copy),
        classId: scope.classId,
        classTitle: scope.schoolClass?.title || ''
      });
    }

    await logActivity({
      req,
      action: 'copy_homework',
      targetType: 'Homework',
      targetId: String(source._id || ''),
      meta: {
        createdCount: created.length,
        failedCount: failed.length,
        classIds: created.map((item) => item.classId)
      }
    });

    res.status(created.length ? 201 : 400).json({
      success: created.length > 0,
      message: created.length ? '' : (failed[0]?.message || 'کپی کارخانگی ناموفق بود.'),
      created,
      failed
    });
  } catch {
    res.status(500).json({ success: false, message: 'کپی کارخانگی ناموفق بود.' });
  }
});

const STATE_LABELS = Object.freeze({
  graded: 'نمره داده شد',
  submitted: 'در انتظار بررسی',
  revision_requested: 'برگشت برای اصلاح',
  missing: 'تحویل نداده',
  missing_overdue: 'تحویل نداده (موعد گذشته)'
});

router.get('/:id/export.xlsx', ...manageHomework, async (req, res) => {
  try {
    const homework = await Homework.findById(req.params.id)
      .populate('classId', 'title code gradeLevel section');
    if (!homework) {
      return res.status(404).json({ success: false, message: 'کارخانگی یافت نشد.' });
    }
    const { rows } = await buildHomeworkReview(homework);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('نمرات', { views: [{ rightToLeft: true }] });
    sheet.addRow([`کارخانگی: ${homework.title}`]);
    sheet.addRow([
      `صنف: ${homework.classId?.title || ''}`,
      `موعد: ${formatShamsiDate(homework.dueDate) || 'بدون موعد'}`,
      `حداکثر نمره: ${homework.maxScore}`
    ]);
    sheet.addRow([]);
    const header = sheet.addRow(['#', 'نام شاگرد', 'نمبر اساس', 'وضعیت', 'تاریخ تحویل', 'دیرکرد (روز)', 'نمره', 'از', 'بازخورد / یادداشت اصلاح']);
    header.font = { bold: true };
    rows.forEach((row, index) => {
      const sub = row.submission;
      sheet.addRow([
        index + 1,
        row.inClass ? row.student.name : `${row.student.name} (خارج از صنف)`,
        row.student.admissionNo || '',
        STATE_LABELS[row.state] || row.state,
        sub ? formatShamsiDate(sub.submittedAt) : '',
        sub?.isLate ? sub.lateDays : '',
        typeof sub?.score === 'number' ? sub.score : '',
        homework.maxScore,
        sub ? (row.state === 'revision_requested' ? sub.revisionNote : sub.feedback) || '' : ''
      ]);
    });
    sheet.columns.forEach((column, index) => {
      column.width = [6, 26, 14, 24, 14, 12, 8, 8, 36][index] || 12;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="homework-${idOf(homework)}.xlsx"; filename*=UTF-8''${encodeURIComponent(`نمرات-${homework.title}.xlsx`)}`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'ساخت فایل اکسل ناموفق بود.' });
    } else {
      res.end();
    }
  }
});

module.exports = router;
