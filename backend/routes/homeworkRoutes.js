const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const { hasStudentCourseAccess } = require('../utils/courseAccess');
const { findActiveMembership } = require('../utils/studentMembershipLookup');
const { normalizeText, resolveClassCourseReference, serializeSchoolClassLite } = require('../utils/classScope');
const { logActivity } = require('../utils/activity');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

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

const homeworkStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, homeworkDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const submissionStorage = multer.diskStorage({
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

const serializeSubmission = (item) => {
  const plain = item?.toObject ? item.toObject() : item;
  const homework = plain?.homework && typeof plain.homework === 'object'
    ? plain.homework
    : null;

  return {
    ...plain,
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

    return res.json({
      success: true,
      classId: scope.classId,
      courseId: scope.courseId || null,
      schoolClass: serializeSchoolClassLite(scope.schoolClass),
      items: items.map(serializeHomework)
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
      return res.status(400).json({ success: false, message: 'Class and title are required.' });
    }
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    const homework = await Homework.create({
      course: scope.courseId,
      classId: scope.classId,
      lesson: lessonId || null,
      title: normalizeText(title),
      description: description || '',
      dueDate: dueDate ? new Date(dueDate) : null,
      maxScore: Number(maxScore) || 100,
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

    res.status(201).json({ success: true, homework: serializeHomework(populated || homework) });
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
      return res.status(404).json({ success: false, message: 'Homework was not found.' });
    }

    const update = {};
    if (req.body?.title !== undefined) update.title = normalizeText(req.body.title);
    if (req.body?.description !== undefined) update.description = req.body.description;
    if (req.body?.dueDate !== undefined) update.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body?.maxScore !== undefined) update.maxScore = Number(req.body.maxScore) || 100;
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
      return res.status(404).json({ success: false, message: 'Homework was not found.' });
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
      return res.status(404).json({ success: false, message: 'Homework was not found.' });
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
      return res.status(400).json({ success: false, message: 'Text and file are required.' });
    }

    const submission = await HomeworkSubmission.findOneAndUpdate(
      { homework: homework._id, student: req.user.id },
      {
        course: scope.courseId || homework.course?._id || homework.course,
        classId: scope.classId || homework.classId?._id || homework.classId,
        text,
        file: `uploads/submissions/${req.file.filename}`,
        submittedAt: new Date()
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
        textLength: text.length
      }
    });

    res.json({ success: true, submission: serializeSubmission(populated || submission) });
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

router.get('/:id/submissions', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await HomeworkSubmission.find({ homework: req.params.id })
      .populate('student', 'name email grade')
      .sort({ submittedAt: -1 });

    res.json({ success: true, items: items.map(serializeSubmission) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load homework submissions.' });
  }
});

router.post('/:id/grade', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { submissionId, score, feedback } = req.body;
    if (!submissionId) {
      return res.status(400).json({ success: false, message: 'Submission id is required.' });
    }

    const homework = await Homework.findById(req.params.id);
    if (!homework) {
      return res.status(404).json({ success: false, message: 'Homework was not found.' });
    }

    const numericScore = Number(score);
    if (Number.isNaN(numericScore) || numericScore < 0 || numericScore > homework.maxScore) {
      return res.status(400).json({ success: false, message: 'Score is invalid.' });
    }

    const submission = await HomeworkSubmission.findByIdAndUpdate(
      submissionId,
      { score: numericScore, feedback: feedback || '', gradedBy: req.user.id },
      { new: true }
    );
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission was not found.' });
    }

    await logActivity({
      req,
      action: 'grade_homework_submission',
      targetType: 'HomeworkSubmission',
      targetId: String(submission._id || submissionId || ''),
      targetUser: String(submission.student || ''),
      meta: {
        homeworkId: String(homework._id || req.params.id || ''),
        score: numericScore,
        maxScore: Number(homework.maxScore || 0),
        feedbackLength: normalizeText(feedback).length
      }
    });

    res.json({ success: true, submission: serializeSubmission(submission) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to grade homework.' });
  }
});

module.exports = router;
