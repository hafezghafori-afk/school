const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const VirtualRecording = require('../models/VirtualRecording');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const ACTIVE_STUDENT_STATUSES = ['active', 'pending', 'suspended', 'transferred_in'];

const normalizeText = (value) => String(value || '').trim();
const isObjectId = (value) => /^[a-f\d]{24}$/i.test(normalizeText(value));

const recordingsDir = path.join(__dirname, '..', 'uploads', 'recordings');
if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });

const safeName = (name = '') => String(name).replace(/[^a-zA-Z0-9.\-_]/g, '_');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, recordingsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.mp4', '.mov', '.mkv', '.webm', '.mp3', '.m4a', '.wav', '.pdf'].includes(ext);
    if (!ok) return cb(new Error('Unsupported recording file format.'), false);
    cb(null, true);
  }
});

const serializeRecording = (item) => {
  const plain = item?.toObject ? item.toObject() : item;

  return {
    ...plain,
    courseId: plain?.course?._id || plain?.course || null,
    classId: plain?.classId?._id || plain?.classId || null,
    schoolClass: plain?.classId ? {
      _id: plain.classId._id || plain.classId,
      id: plain.classId._id || plain.classId,
      title: plain.classId.title || '',
      code: plain.classId.code || '',
      gradeLevel: plain.classId.gradeLevel || '',
      section: plain.classId.section || ''
    } : null
  };
};

const resolveRecordingClassReference = async ({ classId = '', courseId = '' } = {}) => {
  const normalizedClassId = isObjectId(classId) ? normalizeText(classId) : '';
  const normalizedCourseId = isObjectId(courseId) ? normalizeText(courseId) : '';
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId).select('_id legacyCourseId title');
    if (!schoolClass) {
      return { error: 'Class is invalid.' };
    }
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('_id schoolClassRef title');
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('_id schoolClassRef title');
    if (!linkedCourse) {
      return { error: 'Course is invalid.' };
    }
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match.' };
    }
    course = course || linkedCourse;
    if (!schoolClass && linkedCourse.schoolClassRef) {
      schoolClass = await SchoolClass.findById(linkedCourse.schoolClassRef).select('_id legacyCourseId title');
    }
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
};

const buildRecordingScopeFilter = async ({ classId = '', courseId = '' } = {}) => {
  if (!classId && !courseId) {
    return { filter: null, classId: '' };
  }

  const classRef = await resolveRecordingClassReference({ classId, courseId });
  if (classRef.error) {
    return { error: classRef.error };
  }
  if (!classRef.classId) {
    return { error: 'Class mapping is required for recording lookup.' };
  }

  return {
    classId: classRef.classId,
    filter: { classId: classRef.classId }
  };
};

const buildStudentAccessFilter = async (userId) => {
  const allowedClassIds = await StudentMembership.distinct('classId', {
    student: userId,
    classId: { $ne: null },
    status: { $in: ACTIVE_STUDENT_STATUSES },
    isCurrent: true
  });
  const classIds = Array.isArray(allowedClassIds) ? allowedClassIds.filter(Boolean).map(String) : [];

  return {
    classIds,
    filter: classIds.length ? { classId: { $in: classIds } } : null
  };
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const classId = normalizeText(req.query?.classId);
    const courseId = normalizeText(req.query?.courseId);
    const role = req.user?.role;
    const filterParts = [];

    const scope = await buildRecordingScopeFilter({ classId, courseId });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (scope.filter) filterParts.push(scope.filter);

    if (role === 'student') {
      const access = await buildStudentAccessFilter(req.user.id);
      if (!access.filter) {
        return res.json({ success: true, items: [] });
      }

      if (scope.filter) {
        const hasScopeAccess = scope.classId && access.classIds.includes(String(scope.classId));
        if (!hasScopeAccess) {
          return res.status(403).json({ success: false, message: 'Forbidden.' });
        }
      }

      filterParts.push(access.filter);
    }

    const filter = filterParts.length > 1 ? { $and: filterParts } : (filterParts[0] || {});
    const items = await VirtualRecording.find(filter)
      .populate('course', 'title category tags')
      .populate('classId', 'title code gradeLevel section')
      .populate('createdBy', 'name role')
      .sort({ sessionDate: -1, createdAt: -1 });

    res.json({ success: true, items: items.map(serializeRecording) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load recordings.' });
  }
});

router.post('/', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);
    const title = normalizeText(req.body?.title);
    const description = String(req.body?.description || '').trim();
    const sessionDate = req.body?.sessionDate;

    if ((!classId && !courseId) || !title) {
      return res.status(400).json({ success: false, message: 'Class and title are required.' });
    }
    if (!req.file?.filename) {
      return res.status(400).json({ success: false, message: 'Recording file is required.' });
    }

    const classRef = await resolveRecordingClassReference({ classId, courseId });
    if (classRef.error) {
      return res.status(400).json({ success: false, message: classRef.error });
    }
    if (!classRef.classId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required before creating a recording.' });
    }

    const item = await VirtualRecording.create({
      course: classRef.courseId || null,
      classId: classRef.classId || null,
      title,
      description,
      sessionDate: sessionDate ? new Date(sessionDate) : new Date(),
      fileUrl: `uploads/recordings/${req.file.filename}`,
      fileName: req.file.originalname || req.file.filename,
      createdBy: req.user.id
    });

    const populated = await VirtualRecording.findById(item._id)
      .populate('course', 'title category tags')
      .populate('classId', 'title code gradeLevel section')
      .populate('createdBy', 'name role');

    await logActivity({
      req,
      action: 'create_recording',
      targetType: 'VirtualRecording',
      targetId: item._id.toString(),
      meta: {
        title,
        classId: classRef.classId || '',
        courseId: classRef.courseId || ''
      }
    });

    res.status(201).json({ success: true, item: serializeRecording(populated) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create recording.' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await VirtualRecording.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Recording not found.' });
    }

    const isAdminUser = req.user.role === 'admin';
    const isOwner = String(item.createdBy) === String(req.user.id);
    if (!isAdminUser && !isOwner) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    await VirtualRecording.deleteOne({ _id: item._id });
    await logActivity({
      req,
      action: 'delete_recording',
      targetType: 'VirtualRecording',
      targetId: item._id.toString(),
      meta: {
        classId: item.classId ? String(item.classId) : '',
        courseId: item.course ? String(item.course) : ''
      }
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to delete recording.' });
  }
});

module.exports = router;
