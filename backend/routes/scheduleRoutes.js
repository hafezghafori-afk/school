const express = require('express');
const mongoose = require('mongoose');
const Schedule = require('../models/Schedule');
const ScheduleHoliday = require('../models/ScheduleHoliday');
const TimetableEntry = require('../models/TimetableEntry');
const TeacherAssignment = require('../models/TeacherAssignment');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const User = require('../models/User');
const { findCourseStudentIds, findStudentCourseIds } = require('../utils/courseAccess');
const Subject = require('../models/Subject');
const InstructorSubject = require('../models/InstructorSubject');
const UserNotification = require('../models/UserNotification');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const membershipAccessOptions = Object.freeze({});

const VISIBILITY_VALUES = new Set(['draft', 'published']);
const SHIFT_VALUES = new Set(['', 'morning', 'afternoon', 'evening']);

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
const normalizeText = (value) => String(value || '').trim();
const asObjectId = (value) => (mongoose.Types.ObjectId.isValid(String(value || '')) ? String(value) : '');
const uniqueIds = (values = []) => Array.from(new Set(values.map((item) => String(item || '')).filter(Boolean)));
const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(text)) return true;
  if (['false', '0', 'no', 'off'].includes(text)) return false;
  return fallback;
};

const normalizeVisibility = (value, fallback = 'draft') => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return fallback;
  return VISIBILITY_VALUES.has(text) ? text : '';
};

const normalizeListVisibility = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'all') return '';
  return VISIBILITY_VALUES.has(text) ? text : '';
};

const normalizeShift = (value) => {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  return SHIFT_VALUES.has(text) ? text : null;
};

const isPublishedSchedule = (value) => (String(value || 'published').trim().toLowerCase() === 'published');

const pad2 = (value) => String(value).padStart(2, '0');
const formatLocalDate = (value) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
const todayLocalDate = () => formatLocalDate(new Date());
const todayLocalDayCode = () => {
  const dayIndex = new Date().getDay();
  if (dayIndex === 6) return 'saturday';
  if (dayIndex === 0) return 'sunday';
  if (dayIndex === 1) return 'monday';
  if (dayIndex === 2) return 'tuesday';
  if (dayIndex === 3) return 'wednesday';
  if (dayIndex === 4) return 'thursday';
  return 'friday';
};

const toLocalDate = (value) => {
  const parts = String(value || '').split('-').map((v) => Number(v));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const parsed = new Date(parts[0], parts[1] - 1, parts[2]);
  if (formatLocalDate(parsed) !== String(value)) return null;
  return parsed;
};

const shiftLocalDate = (dateStr, days = 0) => {
  const parsed = toLocalDate(dateStr);
  if (!parsed) return '';
  parsed.setDate(parsed.getDate() + Number(days || 0));
  return formatLocalDate(parsed);
};

const timeToMinutes = (value) => {
  const [hour, minute] = String(value || '').split(':').map((v) => Number(v));
  return (hour * 60) + minute;
};

const hasTimeOverlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const getWeekRange = (dateStr) => {
  const date = toLocalDate(dateStr);
  if (!date) return null;
  const day = date.getDay();
  const diffToSaturday = (day + 1) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diffToSaturday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
};

const normalizeWeekdays = (weekdays = []) => {
  if (!Array.isArray(weekdays)) return [];
  const allowed = new Set([0, 1, 2, 3, 4, 5, 6]);
  return Array.from(new Set(
    weekdays
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && allowed.has(item))
  ));
};

const populateScheduleQuery = (query) => query
  .populate('course', 'title category schoolClassRef academicYearRef')
  .populate('instructor', 'name subject')
  .populate('subjectRef', 'name code grade');

const scheduleClassSelect = '_id title code gradeLevel section academicYearId legacyCourseId';

const toEntityId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '');
  return String(value);
};

const serializeSchoolClass = (item = null) => (item ? {
  id: toEntityId(item),
  title: item.title || '',
  code: item.code || '',
  gradeLevel: item.gradeLevel || '',
  section: item.section || '',
  academicYearId: toEntityId(item.academicYearId) || null
} : null);

const resolveScheduleClassReference = async ({ classId = '', courseId = '' } = {}) => {
  const normalizedClassId = asObjectId(classId);
  const normalizedCourseId = asObjectId(courseId);
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId).select(scheduleClassSelect);
    if (!schoolClass) return { error: 'Invalid school class.' };
  }

  if (normalizedCourseId) {
    course = await Course.findById(normalizedCourseId).select('_id title category schoolClassRef academicYearRef');
    if (!course) return { error: 'Invalid legacy course.' };
  }

  if (!course && schoolClass?.legacyCourseId) {
    course = await Course.findById(schoolClass.legacyCourseId).select('_id title category schoolClassRef academicYearRef');
  }

  if (!course && schoolClass?._id) {
    course = await Course.findOne({ schoolClassRef: schoolClass._id, kind: 'academic_class' })
      .select('_id title category schoolClassRef academicYearRef');
  }

  if (!schoolClass && course?.schoolClassRef) {
    schoolClass = await SchoolClass.findById(course.schoolClassRef).select(scheduleClassSelect);
  }

  if (schoolClass && course?.schoolClassRef && String(course.schoolClassRef) !== String(schoolClass._id)) {
    return { error: 'classId and courseId do not match.' };
  }

  return {
    schoolClass,
    classId: toEntityId(schoolClass) || null,
    course,
    courseId: toEntityId(course) || null,
    academicYearId: toEntityId(schoolClass?.academicYearId || course?.academicYearRef) || null
  };
};

const scheduleClassIdForItem = (item = {}) => asObjectId(
  item?.classId?._id
  || item?.classId
  || item?.course?.schoolClassRef?._id
  || item?.course?.schoolClassRef
);

const buildScheduleSchoolClassMap = async (items = []) => {
  const classIds = uniqueIds(items.map((item) => scheduleClassIdForItem(item))).filter((id) => asObjectId(id));
  if (!classIds.length) return new Map();
  const rows = await SchoolClass.find({ _id: { $in: classIds } }).select(scheduleClassSelect);
  return new Map(rows.map((item) => [String(item._id), item]));
};

const serializeScheduleItem = (item = null, classMap = new Map()) => {
  if (!item) return null;
  const plain = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  const courseValue = plain.course;
  const classId = scheduleClassIdForItem(plain);
  const schoolClass = classId ? serializeSchoolClass(classMap.get(String(classId))) : null;
  return {
    ...plain,
    courseId: toEntityId(courseValue) || null,
    classId: classId || null,
    schoolClass
  };
};

const serializeScheduleItems = async (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const classMap = await buildScheduleSchoolClassMap(list);
  return list.map((item) => serializeScheduleItem(item, classMap));
};

const serializeScheduleRecord = async (item = null) => {
  if (!item) return null;
  const [record] = await serializeScheduleItems([item]);
  return record || null;
};

const mapTimetableEntryToScheduleItem = (entry = null, today = '') => {
  if (!entry) return null;
  const classRef = entry.classId || {};
  const subjectRef = entry.subjectId || {};
  const teacherRef = entry.teacherId || {};
  return {
    _id: `tt-${String(entry._id || '')}`,
    date: today,
    startTime: entry.startTime || '',
    endTime: entry.endTime || '',
    subject: subjectRef.name || 'مضمون',
    visibility: 'published',
    source: 'timetable_entry',
    classId: String(classRef._id || ''),
    schoolClass: {
      id: String(classRef._id || ''),
      title: classRef.title || '',
      code: classRef.code || '',
      gradeLevel: classRef.gradeLevel || '',
      section: classRef.section || '',
      academicYearId: null
    },
    instructor: {
      _id: String(teacherRef._id || ''),
      name: teacherRef.name || ''
    },
    course: null
  };
};

const ACTIVE_TEACHER_ASSIGNMENT_STATUSES = ['active', 'planned', 'pending'];

const buildClassSubjectPairKey = ({ classId = '', subjectId = '' } = {}) => (
  `${String(classId || '').trim()}|${String(subjectId || '').trim()}`
);

const closedHolidayByDate = async (date) => ScheduleHoliday.findOne({ date, isClosed: true }).select('_id date title note');

const sendNotifications = async (req, userIds = [], title = '', message = '', type = 'schedule') => {
  const targets = uniqueIds(userIds).filter((id) => String(id) !== String(req.user?.id || ''));
  if (!targets.length) return;
  const items = await UserNotification.insertMany(
    targets.map((userId) => ({
      user: userId,
      title,
      message,
      type
    }))
  );
  const io = req?.app?.get?.('io');
  if (io) {
    items.forEach((item) => io.to(`user:${item.user}`).emit('notify:new', item.toObject()));
  }
};

const recipientIdsForSchedules = async (pairs = []) => {
  const courseIds = uniqueIds(pairs.map((item) => item.courseId));
  const instructorIds = uniqueIds(pairs.map((item) => item.instructorId));
  const users = [...instructorIds];
  if (courseIds.length) {
    const membershipStudentIds = await Promise.all(
      courseIds.map((courseId) => findCourseStudentIds(courseId, membershipAccessOptions))
    );
    users.push(...membershipStudentIds.flat());
  }
  return uniqueIds(users);
};

const notifyScheduleChange = async (req, pairs = [], title = '', message = '') => {
  const recipients = await recipientIdsForSchedules(pairs);
  await sendNotifications(req, recipients, title, message, 'schedule');
};

const logScheduleActivity = async (req, action, targetId = '', meta = {}) => {
  await logActivity({
    req,
    action,
    targetType: 'Schedule',
    targetId: String(targetId || ''),
    meta: { context: 'schedule', ...meta }
  });
};

const resolveSubjectContext = async ({ subjectId, subjectText, instructorId, classId, courseId }) => {
  const normalizedSubjectId = asObjectId(subjectId);
  let subjectDoc = null;

  if (normalizedSubjectId) {
    subjectDoc = await Subject.findById(normalizedSubjectId).select('_id name');
    if (!subjectDoc) return { error: 'Invalid subject selection.' };
  }

  let subjectLabel = normalizeText(subjectDoc?.name || subjectText);
  if (!subjectLabel) return { error: 'Subject is required.' };

  if (!subjectDoc) {
    subjectDoc = await Subject.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(subjectLabel)}$`, 'i') }
    }).select('_id name');
    if (subjectDoc) subjectLabel = subjectDoc.name;
  }

  const mappingFilters = [];
  if (classId) mappingFilters.push({ classId });
  if (courseId) mappingFilters.push({ classId: null, course: courseId });
  mappingFilters.push({ classId: null, course: null });

  const mappings = await InstructorSubject.find({
    instructor: instructorId,
    $or: mappingFilters
  }).populate('subject', '_id name');

  if (mappings.length) {
    const prioritized = [...mappings].sort((left, right) => {
      const leftScore = String(left.classId || '') === String(classId || '') ? 3 : String(left.course || '') === String(courseId || '') ? 2 : 1;
      const rightScore = String(right.classId || '') === String(classId || '') ? 3 : String(right.course || '') === String(courseId || '') ? 2 : 1;
      return rightScore - leftScore;
    });

    let matched = null;
    if (subjectDoc) {
      matched = prioritized.find((item) => String(item.subject?._id || '') === String(subjectDoc._id));
    }
    if (!matched) {
      matched = prioritized.find((item) => normalizeText(item.subject?.name).toLowerCase() === subjectLabel.toLowerCase());
    }
    if (!matched) {
      return { error: 'This subject is not mapped to the selected instructor/class.' };
    }
    subjectDoc = matched.subject || subjectDoc;
    subjectLabel = normalizeText(subjectDoc?.name || subjectLabel);
  }

  return {
    subject: subjectLabel,
    subjectRef: subjectDoc?._id || null
  };
};

const validateCommonPayload = async (body = {}) => {
  const classId = asObjectId(body.classId);
  const courseId = asObjectId(body.courseId);
  const instructorId = asObjectId(body.instructorId);
  const subjectText = normalizeText(body.subject);
  const subjectId = asObjectId(body.subjectId);
  const startTime = normalizeText(body.startTime);
  const endTime = normalizeText(body.endTime);
  const note = normalizeText(body.note);
  const room = normalizeText(body.room);
  const shift = normalizeShift(body.shift);
  const visibility = normalizeVisibility(body.visibility, 'draft');
  const allowOnHoliday = parseBool(body.allowOnHoliday, false);

  if ((!classId && !courseId) || !instructorId) return { error: 'Class and instructor are required.' };
  if (!isValidTime(startTime) || !isValidTime(endTime)) return { error: 'Invalid time format (HH:MM).' };
  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) return { error: 'Start time must be before end time.' };
  if (shift === null) return { error: 'Invalid shift value.' };
  if (!visibility) return { error: 'Invalid visibility value.' };

  const classRef = await resolveScheduleClassReference({ classId, courseId });
  if (classRef.error) return { error: classRef.error };
  if (!classRef.courseId || !classRef.course) {
    return { error: 'A legacy course is still required for schedule persistence.' };
  }

  const instructor = await User.findById(instructorId).select('_id role name');
  if (!instructor) return { error: 'Instructor not found.' };
  if (!['instructor', 'admin'].includes(instructor.role)) return { error: 'Selected user is not a valid instructor.' };

  const subjectContext = await resolveSubjectContext({
    subjectId,
    subjectText,
    instructorId,
    classId: classRef.classId,
    courseId: classRef.courseId
  });
  if (subjectContext.error) return { error: subjectContext.error };

  return {
    payload: {
      course: classRef.courseId,
      classId: classRef.classId || null,
      instructor: instructorId,
      subject: subjectContext.subject,
      subjectRef: subjectContext.subjectRef,
      startTime,
      endTime,
      note,
      room,
      shift,
      visibility
    },
    allowOnHoliday
  };
};

const findConflicts = async ({
  date,
  courseId,
  instructorId,
  startTime,
  endTime,
  room = '',
  excludeId = ''
}) => {
  const normalizedRoom = normalizeText(room);
  const conflictTargets = [{ course: courseId }, { instructor: instructorId }];
  if (normalizedRoom) conflictTargets.push({ room: normalizedRoom });
  const filter = { date, $or: conflictTargets };
  if (excludeId) filter._id = { $ne: excludeId };

  const existingItems = await populateScheduleQuery(Schedule.find(filter));
  const startM = timeToMinutes(startTime);
  const endM = timeToMinutes(endTime);

  return existingItems
    .filter((item) => hasTimeOverlap(startM, endM, timeToMinutes(item.startTime), timeToMinutes(item.endTime)))
    .map((item) => {
      const sameCourse = String(item.course?._id || '') === String(courseId);
      const sameInstructor = String(item.instructor?._id || '') === String(instructorId);
      const sameRoom = normalizedRoom && normalizeText(item.room).toLowerCase() === normalizedRoom.toLowerCase();
      return {
        id: item._id,
        date: item.date,
        subject: item.subject,
        courseTitle: item.course?.title || '',
        instructorName: item.instructor?.name || '',
        startTime: item.startTime,
        endTime: item.endTime,
        room: item.room || '',
        reason: sameCourse && sameInstructor
          ? 'course_and_instructor'
          : sameInstructor
            ? 'instructor'
            : sameCourse
              ? 'course'
              : sameRoom
                ? 'room'
                : 'unknown'
      };
    });
};

const applyAudienceFilter = async (user = {}, baseFilter = {}) => {
  const filter = { ...baseFilter };
  if (user.role === 'student') {
    const courseIds = await findStudentCourseIds(user.id, membershipAccessOptions);
    filter.course = { $in: courseIds };
  } else if (user.role === 'instructor') {
    filter.instructor = user.id;
  }

  if (user.role !== 'admin') {
    const visibleFilter = { $or: [{ visibility: 'published' }, { visibility: { $exists: false } }] };
    filter.$and = Array.isArray(filter.$and) ? [...filter.$and, visibleFilter] : [visibleFilter];
  }
  return filter;
};

router.get('/reference-data', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const [courses, instructors, subjects, mappings, holidays] = await Promise.all([
      Course.find().select('title category').sort({ title: 1 }),
      User.find({ role: { $in: ['instructor', 'admin'] } }).select('name email role subject').sort({ name: 1 }),
      Subject.find({ isActive: true }).select('name code grade').sort({ name: 1 }),
      InstructorSubject.find()
        .populate('instructor', 'name')
        .populate('subject', 'name code grade')
        .populate('course', 'title')
        .sort({ createdAt: -1 }),
      ScheduleHoliday.find().sort({ date: 1 }).limit(500)
    ]);

    res.json({
      success: true,
      courses,
      instructors,
      subjects,
      holidays,
      mappings: mappings.map((item) => ({
        _id: item._id,
        instructorId: item.instructor?._id || '',
        instructorName: item.instructor?.name || '',
        courseId: item.course?._id || '',
        courseTitle: item.course?.title || '',
        subjectId: item.subject?._id || '',
        subjectName: item.subject?.name || '',
        isPrimary: !!item.isPrimary
      }))
    });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت اطلاعات مرجع تقسیم اوقات' });
  }
});

router.get('/holidays', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const from = normalizeText(req.query?.from);
    const to = normalizeText(req.query?.to);
    const filter = {};
    if (isValidDate(from) && isValidDate(to)) filter.date = { $gte: from, $lte: to };
    else if (isValidDate(from)) filter.date = { $gte: from };
    else if (isValidDate(to)) filter.date = { $lte: to };

    const items = await ScheduleHoliday.find(filter).sort({ date: 1 });
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت تعطیلی‌ها' });
  }
});

router.post('/holidays', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const date = normalizeText(req.body?.date);
    const title = normalizeText(req.body?.title);
    const note = normalizeText(req.body?.note);
    const isClosed = parseBool(req.body?.isClosed, true);

    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ تعطیلی معتبر نیست.' });
    }
    if (!title) return res.status(400).json({ success: false, message: 'عنوان تعطیلی الزامی است.' });

    const item = await ScheduleHoliday.create({ date, title, note, isClosed });
    await logActivity({
      req,
      action: 'create_schedule_holiday',
      targetType: 'ScheduleHoliday',
      targetId: String(item._id),
      meta: { context: 'schedule', date, title, isClosed }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'برای این تاریخ قبلاً تعطیلی ثبت شده است.' });
    }
    res.status(500).json({ success: false, message: 'خطا در ثبت تعطیلی' });
  }
});

router.put('/holidays/:id', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const payload = {};
    if (req.body?.date !== undefined) {
      const date = normalizeText(req.body.date);
      if (!isValidDate(date) || !toLocalDate(date)) {
        return res.status(400).json({ success: false, message: 'تاریخ تعطیلی معتبر نیست.' });
      }
      payload.date = date;
    }
    if (req.body?.title !== undefined) {
      const title = normalizeText(req.body.title);
      if (!title) return res.status(400).json({ success: false, message: 'عنوان تعطیلی الزامی است.' });
      payload.title = title;
    }
    if (req.body?.note !== undefined) payload.note = normalizeText(req.body.note);
    if (req.body?.isClosed !== undefined) payload.isClosed = parseBool(req.body.isClosed, true);

    const item = await ScheduleHoliday.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'تعطیلی یافت نشد.' });

    await logActivity({
      req,
      action: 'update_schedule_holiday',
      targetType: 'ScheduleHoliday',
      targetId: String(item._id),
      meta: { context: 'schedule', date: item.date, title: item.title, isClosed: item.isClosed }
    });
    res.json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'برای این تاریخ قبلاً تعطیلی ثبت شده است.' });
    }
    res.status(500).json({ success: false, message: 'خطا در ویرایش تعطیلی' });
  }
});

router.delete('/holidays/:id', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const item = await ScheduleHoliday.findByIdAndDelete(req.params.id).select('_id date title isClosed');
    if (!item) return res.status(404).json({ success: false, message: 'تعطیلی یافت نشد.' });

    await logActivity({
      req,
      action: 'delete_schedule_holiday',
      targetType: 'ScheduleHoliday',
      targetId: String(item._id),
      meta: { context: 'schedule', date: item.date, title: item.title, isClosed: item.isClosed }
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در حذف تعطیلی' });
  }
});

router.post('/publish-range', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const startDate = normalizeText(req.body?.startDate);
    const endDate = normalizeText(req.body?.endDate);
    const visibility = normalizeVisibility(req.body?.visibility, 'published');
    const courseId = asObjectId(req.body?.courseId);
    const instructorId = asObjectId(req.body?.instructorId);

    if (!isValidDate(startDate) || !isValidDate(endDate) || !toLocalDate(startDate) || !toLocalDate(endDate)) {
      return res.status(400).json({ success: false, message: 'بازه تاریخ معتبر نیست.' });
    }
    if (!visibility) return res.status(400).json({ success: false, message: 'وضعیت نشر معتبر نیست.' });
    if (toLocalDate(startDate).getTime() > toLocalDate(endDate).getTime()) {
      return res.status(400).json({ success: false, message: 'بازه تاریخ نادرست است.' });
    }

    const filter = { date: { $gte: startDate, $lte: endDate } };
    if (courseId) filter.course = courseId;
    if (instructorId) filter.instructor = instructorId;

    const rows = await Schedule.find(filter).select('_id date course instructor visibility');
    const changedRows = rows.filter((item) => (item.visibility || 'published') !== visibility);

    if (!changedRows.length) {
      await logScheduleActivity(req, 'publish_schedule_range', '', {
        startDate,
        endDate,
        visibility,
        updatedCount: 0,
        touchedCount: rows.length
      });
      return res.json({ success: true, updatedCount: 0, touchedCount: rows.length });
    }

    await Schedule.updateMany({ _id: { $in: changedRows.map((item) => item._id) } }, { $set: { visibility } });
    if (visibility === 'published') {
      await notifyScheduleChange(
        req,
        changedRows.map((item) => ({ courseId: item.course, instructorId: item.instructor })),
        'تقسیم اوقات نشر شد',
        `${changedRows.length} جلسه در بازه ${startDate} تا ${endDate} نشر شد.`
      );
    }

    await logScheduleActivity(req, 'publish_schedule_range', '', {
      startDate,
      endDate,
      visibility,
      updatedCount: changedRows.length,
      touchedCount: rows.length
    });
    res.json({ success: true, updatedCount: changedRows.length, touchedCount: rows.length });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت نشر برنامه‌ها' });
  }
});

router.post('/:id/publish', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const visibility = normalizeVisibility(req.body?.visibility, 'published');
    if (!visibility) return res.status(400).json({ success: false, message: 'وضعیت نشر معتبر نیست.' });

    const item = await Schedule.findById(req.params.id).select('_id date course instructor subject visibility');
    if (!item) return res.status(404).json({ success: false, message: 'برنامه یافت نشد.' });

    const before = item.visibility || 'published';
    if (before === visibility) {
      const stable = await populateScheduleQuery(Schedule.findById(item._id));
      return res.json({ success: true, item: await serializeScheduleRecord(stable), changed: false });
    }

    item.visibility = visibility;
    await item.save();

    if (visibility === 'published') {
      await notifyScheduleChange(
        req,
        [{ courseId: item.course, instructorId: item.instructor }],
        'تقسیم اوقات نشر شد',
        `جلسه ${item.subject || ''} در تاریخ ${item.date} نشر شد.`
      );
    }

    await logScheduleActivity(req, 'publish_schedule_item', String(item._id), {
      beforeVisibility: before,
      visibility,
      date: item.date
    });
    const populated = await populateScheduleQuery(Schedule.findById(item._id));
    res.json({ success: true, item: await serializeScheduleRecord(populated), changed: true });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در تغییر وضعیت نشر برنامه' });
  }
});

router.post('/copy-week', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const date = normalizeText(req.body?.date || req.query?.date);
    const targetVisibility = normalizeVisibility(req.body?.visibility, 'draft');
    const allowOnHoliday = parseBool(req.body?.allowOnHoliday, false);

    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });
    }
    if (!targetVisibility) return res.status(400).json({ success: false, message: 'وضعیت نشر معتبر نیست.' });

    const currentRange = getWeekRange(date);
    if (!currentRange) return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });

    const targetStart = formatLocalDate(currentRange.start);
    const targetEnd = formatLocalDate(currentRange.end);
    const sourceStart = shiftLocalDate(targetStart, -7);
    const sourceEnd = shiftLocalDate(targetEnd, -7);

    const sourceItems = await Schedule.find({ date: { $gte: sourceStart, $lte: sourceEnd } })
      .select('date course subject subjectRef instructor startTime endTime note room shift')
      .sort({ date: 1, startTime: 1 });

    if (!sourceItems.length) {
      await logScheduleActivity(req, 'copy_schedule_week', '', {
        sourceStart,
        sourceEnd,
        targetStart,
        targetEnd,
        createdCount: 0,
        skippedCount: 0,
        visibility: targetVisibility
      });
      return res.json({
        success: true,
        createdCount: 0,
        skippedCount: 0,
        skipped: [],
        sourceRange: { start: sourceStart, end: sourceEnd },
        targetRange: { start: targetStart, end: targetEnd }
      });
    }

    const created = [];
    const skipped = [];
    const recipientPairs = [];

    for (const item of sourceItems) {
      const targetDate = shiftLocalDate(item.date, 7);
      if (!targetDate) {
        skipped.push({ sourceId: item._id, sourceDate: item.date, reason: 'invalid_source_date' });
        continue;
      }

      if (!allowOnHoliday) {
        const holiday = await closedHolidayByDate(targetDate);
        if (holiday) {
          skipped.push({ sourceId: item._id, sourceDate: item.date, date: targetDate, reason: 'holiday', holidayTitle: holiday.title || '' });
          continue;
        }
      }

      const exactExists = await Schedule.exists({
        date: targetDate,
        course: item.course,
        instructor: item.instructor,
        subject: item.subject,
        startTime: item.startTime,
        endTime: item.endTime,
        room: item.room || ''
      });
      if (exactExists) {
        skipped.push({ sourceId: item._id, sourceDate: item.date, date: targetDate, reason: 'already_exists' });
        continue;
      }

      const conflictItems = await findConflicts({
        date: targetDate,
        courseId: item.course,
        instructorId: item.instructor,
        startTime: item.startTime,
        endTime: item.endTime,
        room: item.room || ''
      });
      if (conflictItems.length) {
        skipped.push({ sourceId: item._id, sourceDate: item.date, date: targetDate, reason: 'conflict', conflicts: conflictItems });
        continue;
      }

      const createdItem = await Schedule.create({
        date: targetDate,
        course: item.course,
        subject: item.subject,
        subjectRef: item.subjectRef || null,
        instructor: item.instructor,
        startTime: item.startTime,
        endTime: item.endTime,
        note: item.note || '',
        room: item.room || '',
        shift: item.shift || '',
        visibility: targetVisibility
      });

      created.push(createdItem);
      if (targetVisibility === 'published') {
        recipientPairs.push({ courseId: item.course, instructorId: item.instructor });
      }
    }

    if (targetVisibility === 'published' && created.length) {
      await notifyScheduleChange(
        req,
        recipientPairs,
        'تقسیم اوقات بروزرسانی شد',
        `${created.length} جلسه از هفته قبل کپی و نشر شد.`
      );
    }

    await logScheduleActivity(req, 'copy_schedule_week', '', {
      sourceStart,
      sourceEnd,
      targetStart,
      targetEnd,
      createdCount: created.length,
      skippedCount: skipped.length,
      visibility: targetVisibility,
      allowOnHoliday
    });

    return res.json({
      success: true,
      createdCount: created.length,
      skippedCount: skipped.length,
      skipped,
      sourceRange: { start: sourceStart, end: sourceEnd },
      targetRange: { start: targetStart, end: targetEnd }
    });
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در کپی برنامه هفته گذشته' });
  }
});

router.get('/export.xlsx', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    let ExcelJS;
    try {
      // eslint-disable-next-line global-require
      ExcelJS = require('exceljs');
    } catch {
      return res.status(500).json({
        success: false,
        message: 'کتابخانه exceljs نصب نیست. در backend دستور npm install exceljs را اجرا کنید.'
      });
    }

    const date = normalizeText(req.query?.date);
    const view = normalizeText(req.query?.view) === 'week' ? 'week' : 'day';
    const visibilityQuery = normalizeListVisibility(req.query?.visibility);

    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });
    }
    if (req.query?.visibility && !visibilityQuery) {
      return res.status(400).json({ success: false, message: 'فیلتر وضعیت نشر معتبر نیست.' });
    }

    let filter = {};
    let fileLabel = date;
    if (view === 'week') {
      const range = getWeekRange(date);
      if (!range) return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });
      const start = formatLocalDate(range.start);
      const end = formatLocalDate(range.end);
      filter = { date: { $gte: start, $lte: end } };
      fileLabel = `${start}_to_${end}`;
    } else {
      filter = { date };
    }
    if (visibilityQuery) filter.visibility = visibilityQuery;

    const items = await populateScheduleQuery(Schedule.find(filter)).sort({ date: 1, startTime: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Iman School';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Schedule');
    worksheet.views = [{ rightToLeft: true }];
    worksheet.columns = [
      { header: 'تاریخ', key: 'date', width: 14 },
      { header: 'صنف', key: 'courseTitle', width: 28 },
      { header: 'مضمون', key: 'subject', width: 22 },
      { header: 'استاد', key: 'instructorName', width: 24 },
      { header: 'شروع', key: 'startTime', width: 12 },
      { header: 'پایان', key: 'endTime', width: 12 },
      { header: 'اتاق', key: 'room', width: 16 },
      { header: 'شیفت', key: 'shift', width: 14 },
      { header: 'وضعیت', key: 'visibility', width: 14 },
      { header: 'یادداشت', key: 'note', width: 32 }
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    items.forEach((item) => {
      worksheet.addRow({
        date: item.date,
        courseTitle: item.course?.title || '',
        subject: item.subject || '',
        instructorName: item.instructor?.name || '',
        startTime: item.startTime || '',
        endTime: item.endTime || '',
        room: item.room || '',
        shift: item.shift || '',
        visibility: item.visibility || 'published',
        note: item.note || ''
      });
    });

    await logScheduleActivity(req, 'export_schedule_excel', '', {
      view,
      date,
      visibility: visibilityQuery || 'all',
      rows: items.length
    });

    const filename = `schedule-${view}-${fileLabel}.xlsx`;
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
  } catch {
    return res.status(500).json({ success: false, message: 'خطا در تهیه فایل Excel تقسیم اوقات' });
  }
});

router.get('/', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const date = normalizeText(req.query?.date);
    const visibilityQuery = normalizeListVisibility(req.query?.visibility);
    if (req.query?.visibility && !visibilityQuery) {
      return res.status(400).json({ success: false, message: 'فیلتر وضعیت نشر معتبر نیست.' });
    }
    const filter = {};
    if (date && isValidDate(date)) filter.date = date;
    if (visibilityQuery) filter.visibility = visibilityQuery;
    const items = await populateScheduleQuery(Schedule.find(filter)).sort({ date: 1, startTime: 1 });
    res.json({ success: true, items: await serializeScheduleItems(items) });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت تقسیم اوقات' });
  }
});

router.post('/', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const date = normalizeText(req.body?.date);
    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });
    }

    const validated = await validateCommonPayload(req.body || {});
    if (validated.error) return res.status(400).json({ success: false, message: validated.error });

    if (!validated.allowOnHoliday) {
      const holiday = await closedHolidayByDate(date);
      if (holiday) {
        return res.status(409).json({ success: false, message: `این تاریخ تعطیل است (${holiday.title}).`, reason: 'holiday' });
      }
    }

    const conflictItems = await findConflicts({
      date,
      courseId: validated.payload.course,
      instructorId: validated.payload.instructor,
      startTime: validated.payload.startTime,
      endTime: validated.payload.endTime,
      room: validated.payload.room
    });
    if (conflictItems.length) {
      return res.status(409).json({ success: false, message: 'تداخل زمانی برای صنف/استاد/اتاق وجود دارد.', conflicts: conflictItems });
    }

    const item = await Schedule.create({ date, ...validated.payload });
    const populated = await populateScheduleQuery(Schedule.findById(item._id));

    if (validated.payload.visibility === 'published') {
      await notifyScheduleChange(
        req,
        [{ courseId: validated.payload.course, instructorId: validated.payload.instructor }],
        'تقسیم اوقات بروزرسانی شد',
        `جلسه جدید (${validated.payload.subject}) برای تاریخ ${date} از ${validated.payload.startTime} تا ${validated.payload.endTime} نشر شد.`
      );
    }

    await logScheduleActivity(req, 'create_schedule', String(item._id), {
      date,
      courseId: String(validated.payload.course || ''),
      classId: String(validated.payload.classId || ''),
      instructorId: String(validated.payload.instructor || ''),
      visibility: validated.payload.visibility,
      room: validated.payload.room || '',
      shift: validated.payload.shift || '',
      allowOnHoliday: validated.allowOnHoliday
    });

    res.status(201).json({ success: true, item: await serializeScheduleRecord(populated) });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در ایجاد تقسیم اوقات' });
  }
});

router.post('/bulk', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const startDate = normalizeText(req.body?.startDate);
    const endDate = normalizeText(req.body?.endDate);
    const weekdays = normalizeWeekdays(req.body?.weekdays || []);

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ success: false, message: 'بازه تاریخ معتبر نیست.' });
    }

    const start = toLocalDate(startDate);
    const end = toLocalDate(endDate);
    if (!start || !end || start.getTime() > end.getTime()) {
      return res.status(400).json({ success: false, message: 'بازه تاریخ نادرست است.' });
    }

    const validated = await validateCommonPayload(req.body || {});
    if (validated.error) return res.status(400).json({ success: false, message: validated.error });

    const effectiveWeekdays = weekdays.length ? weekdays : [start.getDay()];
    const maxDays = 180;
    const created = [];
    const skipped = [];
    const publishRecipients = [];

    for (let cursor = new Date(start), i = 0; cursor.getTime() <= end.getTime() && i < maxDays; i += 1) {
      const weekday = cursor.getDay();
      const dateStr = formatLocalDate(cursor);
      cursor.setDate(cursor.getDate() + 1);
      if (!effectiveWeekdays.includes(weekday)) continue;

      if (!validated.allowOnHoliday) {
        const holiday = await closedHolidayByDate(dateStr);
        if (holiday) {
          skipped.push({ date: dateStr, reason: 'holiday', holidayTitle: holiday.title || '' });
          continue;
        }
      }

      const conflictItems = await findConflicts({
        date: dateStr,
        courseId: validated.payload.course,
        instructorId: validated.payload.instructor,
        startTime: validated.payload.startTime,
        endTime: validated.payload.endTime,
        room: validated.payload.room
      });
      if (conflictItems.length) {
        skipped.push({ date: dateStr, reason: 'conflict', conflicts: conflictItems });
        continue;
      }

      const item = await Schedule.create({ date: dateStr, ...validated.payload });
      created.push(item);
      if (validated.payload.visibility === 'published') {
        publishRecipients.push({ courseId: validated.payload.course, instructorId: validated.payload.instructor });
      }
    }

    if (validated.payload.visibility === 'published' && created.length) {
      await notifyScheduleChange(
        req,
        publishRecipients,
        'تقسیم اوقات بروزرسانی شد',
        `${created.length} جلسه (${validated.payload.subject}) در بازه ${startDate} تا ${endDate} نشر شد.`
      );
    }

    await logScheduleActivity(req, 'create_schedule_bulk', '', {
      startDate,
      endDate,
      weekdays: effectiveWeekdays,
      createdCount: created.length,
      skippedCount: skipped.length,
      visibility: validated.payload.visibility,
      room: validated.payload.room || '',
      shift: validated.payload.shift || '',
      allowOnHoliday: validated.allowOnHoliday
    });

    res.status(201).json({ success: true, createdCount: created.length, skippedCount: skipped.length, skipped });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در ثبت گروهی تقسیم اوقات' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const date = normalizeText(req.body?.date);
    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست.' });
    }

    const current = await Schedule.findById(req.params.id).select('_id course instructor date startTime endTime subject room shift visibility');
    if (!current) return res.status(404).json({ success: false, message: 'برنامه یافت نشد.' });

    const validated = await validateCommonPayload(req.body || {});
    if (validated.error) return res.status(400).json({ success: false, message: validated.error });

    if (!validated.allowOnHoliday) {
      const holiday = await closedHolidayByDate(date);
      if (holiday) {
        return res.status(409).json({ success: false, message: `این تاریخ تعطیل است (${holiday.title}).`, reason: 'holiday' });
      }
    }

    const conflictItems = await findConflicts({
      date,
      courseId: validated.payload.course,
      instructorId: validated.payload.instructor,
      startTime: validated.payload.startTime,
      endTime: validated.payload.endTime,
      room: validated.payload.room,
      excludeId: req.params.id
    });
    if (conflictItems.length) {
      return res.status(409).json({ success: false, message: 'تداخل زمانی برای صنف/استاد/اتاق وجود دارد.', conflicts: conflictItems });
    }

    const item = await Schedule.findByIdAndUpdate(req.params.id, { date, ...validated.payload }, { new: true });
    const wasPublished = isPublishedSchedule(current.visibility);
    const willBePublished = isPublishedSchedule(validated.payload.visibility);
    if (wasPublished || willBePublished) {
      await notifyScheduleChange(
        req,
        [
          { courseId: current.course, instructorId: current.instructor },
          { courseId: validated.payload.course, instructorId: validated.payload.instructor }
        ],
        willBePublished ? 'تقسیم اوقات بروزرسانی شد' : 'جلسه به پیش‌نویس برگشت',
        `جلسه (${validated.payload.subject}) برای تاریخ ${date} از ${validated.payload.startTime} تا ${validated.payload.endTime} ویرایش شد.`
      );
    }

    await logScheduleActivity(req, 'update_schedule', String(item._id), {
      beforeVisibility: current.visibility || 'published',
      visibility: validated.payload.visibility,
      date,
      classId: String(validated.payload.classId || '')
    });

    const populated = await populateScheduleQuery(Schedule.findById(item._id));
    res.json({ success: true, item: await serializeScheduleRecord(populated) });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی تقسیم اوقات' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_schedule'), async (req, res) => {
  try {
    const item = await Schedule.findById(req.params.id).select('_id date course instructor subject startTime endTime room shift visibility');
    if (!item) return res.status(404).json({ success: false, message: 'برنامه یافت نشد.' });

    await Schedule.findByIdAndDelete(req.params.id);

    if (isPublishedSchedule(item.visibility)) {
      await notifyScheduleChange(
        req,
        [{ courseId: item.course, instructorId: item.instructor }],
        'تقسیم اوقات بروزرسانی شد',
        `جلسه (${item.subject}) در تاریخ ${item.date} از ${item.startTime} تا ${item.endTime} حذف شد.`
      );
    }

    await logScheduleActivity(req, 'delete_schedule', String(item._id), {
      date: item.date,
      visibility: item.visibility || 'published',
      room: item.room || '',
      shift: item.shift || ''
    });

    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در حذف تقسیم اوقات' });
  }
});

router.get('/today', requireAuth, async (req, res) => {
  try {
    const today = todayLocalDate();
    const filter = await applyAudienceFilter(req.user, { date: today });
    const legacyRows = await populateScheduleQuery(Schedule.find(filter)).sort({ startTime: 1 });
    const legacyItems = await serializeScheduleItems(legacyRows);

    if (req.user?.role !== 'instructor') {
      return res.json({ success: true, items: legacyItems, date: today });
    }

    const dayCode = todayLocalDayCode();
    const instructorTimetableRows = await TimetableEntry.find({
      teacherId: req.user.id,
      dayCode,
      status: 'published'
    })
      .populate('classId', 'title code gradeLevel section')
      .populate('subjectId', 'name')
      .populate('teacherId', 'name')
      .sort({ startTime: 1 });

    let assignmentFallbackRows = [];
    const assignmentRows = await TeacherAssignment.find({
      teacherUserId: req.user.id,
      status: { $in: ACTIVE_TEACHER_ASSIGNMENT_STATUSES }
    }).select('classId subjectId');

    if (Array.isArray(assignmentRows) && assignmentRows.length) {
      const assignmentPairKeys = new Set();
      const assignedClassIds = [];

      assignmentRows.forEach((item) => {
        const classId = String(item?.classId || '').trim();
        const subjectId = String(item?.subjectId || '').trim();
        if (!classId) return;
        assignedClassIds.push(classId);
        assignmentPairKeys.add(buildClassSubjectPairKey({ classId, subjectId }));
      });

      if (assignedClassIds.length) {
        const fallbackRows = await TimetableEntry.find({
          classId: { $in: Array.from(new Set(assignedClassIds)) },
          dayCode,
          status: 'published'
        })
          .populate('classId', 'title code gradeLevel section')
          .populate('subjectId', 'name')
          .populate('teacherId', 'name')
          .sort({ startTime: 1 });

        assignmentFallbackRows = fallbackRows.filter((item) => {
          const classId = String(item?.classId?._id || item?.classId || '').trim();
          const subjectId = String(item?.subjectId?._id || item?.subjectId || '').trim();
          if (!classId) return false;
          if (assignmentPairKeys.has(buildClassSubjectPairKey({ classId, subjectId }))) return true;
          // Some legacy assignments may not have subjectId; allow class-only match.
          return assignmentPairKeys.has(buildClassSubjectPairKey({ classId, subjectId: '' }));
        });
      }
    }

    const timetableItems = [...instructorTimetableRows, ...assignmentFallbackRows]
      .map((row) => mapTimetableEntryToScheduleItem(row, today))
      .filter(Boolean);

    const merged = [...legacyItems];
    const seen = new Set(
      legacyItems.map((item) => ([
        String(item.startTime || ''),
        String(item.endTime || ''),
        String(item.classId || ''),
        String(item.subject || '')
      ].join('|')))
    );

    timetableItems.forEach((item) => {
      const key = [
        String(item.startTime || ''),
        String(item.endTime || ''),
        String(item.classId || ''),
        String(item.subject || '')
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });

    merged.sort((left, right) => String(left.startTime || '').localeCompare(String(right.startTime || '')));
    res.json({ success: true, items: merged, date: today });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت برنامه امروز' });
  }
});

router.get('/by-date', requireAuth, async (req, res) => {
  try {
    const date = normalizeText(req.query?.date);
    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست' });
    }
    const filter = await applyAudienceFilter(req.user, { date });
    const items = await populateScheduleQuery(Schedule.find(filter)).sort({ startTime: 1 });
    res.json({ success: true, items: await serializeScheduleItems(items), date });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت تقسیم اوقات' });
  }
});

router.get('/week', requireAuth, async (req, res) => {
  try {
    const date = normalizeText(req.query?.date);
    if (!isValidDate(date) || !toLocalDate(date)) {
      return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست' });
    }
    const range = getWeekRange(date);
    if (!range) return res.status(400).json({ success: false, message: 'تاریخ معتبر نیست' });

    const start = formatLocalDate(range.start);
    const end = formatLocalDate(range.end);
    const filter = await applyAudienceFilter(req.user, { date: { $gte: start, $lte: end } });
    const items = await populateScheduleQuery(Schedule.find(filter)).sort({ date: 1, startTime: 1 });
    res.json({ success: true, items: await serializeScheduleItems(items), start, end });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت تقسیم اوقات هفته' });
  }
});

module.exports = router;
