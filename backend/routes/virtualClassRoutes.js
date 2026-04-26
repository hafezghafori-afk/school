const express = require('express');
const mongoose = require('mongoose');
const VirtualClassSession = require('../models/VirtualClassSession');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { canAccessCourse, getAccessibleCourseIds } = require('../utils/courseAccess');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const membershipAccessOptions = Object.freeze({});

const allowedStatuses = ['scheduled', 'live', 'ended'];
const allowedProviders = ['manual', 'google_meet', 'zoom', 'jitsi', 'teams', 'other'];

const normalizeText = (value = '') => String(value || '').trim();
const asObjectIdString = (value = '') => (mongoose.isValidObjectId(normalizeText(value)) ? normalizeText(value) : '');

const serializeSchoolClass = (item) => {
  if (!item) return null;
  const id = item._id || item.id || item;
  if (!id) return null;
  return {
    _id: id,
    id,
    title: item.title || '',
    code: item.code || '',
    gradeLevel: item.gradeLevel || '',
    section: item.section || '',
    academicYearId: item.academicYearId?._id || item.academicYearId || null
  };
};

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

async function resolveVirtualClassScope({ classId = '', courseId = '' } = {}) {
  const normalizedClassId = asObjectIdString(classId);
  const normalizedCourseId = asObjectIdString(courseId);
  let schoolClass = null;
  let course = null;

  if (normalizeText(classId) && !normalizedClassId) {
    return { error: 'ØµÙ†Ù Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª' };
  }
  if (normalizeText(courseId) && !normalizedCourseId) {
    return { error: 'ØµÙ†Ù Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª' };
  }

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId)
      .select('title code gradeLevel section academicYearId legacyCourseId');
    if (!schoolClass) {
      return { error: 'ØµÙ†Ù ÛŒØ§ÙØª Ù†Ø´Ø¯' };
    }
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('_id title category schoolClassRef');
    }
    if (!course) {
      course = await Course.findOne({ schoolClassRef: schoolClass._id }).select('_id title category schoolClassRef');
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('_id title category schoolClassRef');
    if (!linkedCourse) {
      return { error: 'ØµÙ†Ù ÛŒØ§ÙØª Ù†Ø´Ø¯' };
    }
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match.' };
    }
    course = course || linkedCourse;

    if (!schoolClass) {
      if (linkedCourse.schoolClassRef) {
        schoolClass = await SchoolClass.findById(linkedCourse.schoolClassRef)
          .select('title code gradeLevel section academicYearId legacyCourseId');
      }
      if (!schoolClass) {
        schoolClass = await SchoolClass.findOne({ legacyCourseId: linkedCourse._id })
          .select('title code gradeLevel section academicYearId legacyCourseId');
      }
    }
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
}

const parseDate = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeStatus = (value = '', fallback = 'scheduled') => {
  const normalized = normalizeText(value).toLowerCase();
  if (allowedStatuses.includes(normalized)) return normalized;
  return fallback;
};

const normalizeProvider = (value = '', fallback = 'manual') => {
  const normalized = normalizeText(value).toLowerCase();
  if (allowedProviders.includes(normalized)) return normalized;
  return fallback;
};

const sortSessions = (items = []) => {
  const rank = { live: 0, scheduled: 1, ended: 2 };
  return [...items].sort((a, b) => {
    const leftRank = rank[a?.status] ?? 99;
    const rightRank = rank[b?.status] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftDate = new Date(a?.scheduledAt || 0).getTime();
    const rightDate = new Date(b?.scheduledAt || 0).getTime();
    if (leftRank === 2) return rightDate - leftDate;
    return leftDate - rightDate;
  });
};

const serializeSession = (item) => {
  const course = item?.course && typeof item.course === 'object'
    ? item.course
    : null;
  const courseId = course?._id || item?.course || null;
  const classId = course?.schoolClassRef?._id || course?.schoolClassRef || null;
  const schoolClass = serializeSchoolClass(item?.schoolClass || (classId ? { _id: classId } : null));

  return {
    _id: item._id,
    title: item.title,
    description: item.description,
    provider: item.provider,
    meetingUrl: item.meetingUrl,
    accessCode: item.accessCode,
    scheduledAt: item.scheduledAt,
    status: item.status,
    startedAt: item.startedAt,
    endedAt: item.endedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    course: course ? {
      _id: course._id,
      id: course._id,
      title: course.title || '',
      category: course.category || '',
      schoolClassRef: classId || null
    } : item.course,
    courseId,
    classId: schoolClass?._id || classId || null,
    schoolClass,
    createdBy: item.createdBy,
    canJoin: Boolean(item.meetingUrl) && item.status !== 'ended'
  };
};

const getSessionScopeMeta = (item = null) => {
  const course = item?.course && typeof item.course === 'object' ? item.course : null;
  return {
    courseId: String(course?._id || item?.course || ''),
    classId: String(course?.schoolClassRef?._id || course?.schoolClassRef || item?.schoolClass?._id || '')
  };
};

const summarizeSessions = (items = []) => items.reduce((summary, item) => {
  summary.total += 1;
  if (item.status === 'live') summary.live += 1;
  if (item.status === 'scheduled') summary.scheduled += 1;
  if (item.status === 'ended') summary.ended += 1;

  const now = new Date();
  const target = new Date(item.scheduledAt || 0);
  if (
    !Number.isNaN(target.getTime())
    && target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate()
  ) {
    summary.today += 1;
  }

  return summary;
}, {
  total: 0,
  live: 0,
  scheduled: 0,
  ended: 0,
  today: 0
});

const loadSession = async (id) => VirtualClassSession.findById(id)
  .populate('course', 'title category schoolClassRef')
  .populate('createdBy', 'name role');

const canManageSession = async (user, session) => {
  if (!user?.id || !session) return false;
  if (user.role === 'admin') return true;

  const courseId = session.course?._id || session.course;
  return canAccessCourse(user, courseId, membershipAccessOptions);
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const { classId = '', courseId = '', status = '', limit = '120' } = req.query || {};
    let resolvedScope = null;

    if (classId || courseId) {
      resolvedScope = await resolveVirtualClassScope({ classId, courseId });
      if (resolvedScope.error) {
        return res.status(400).json({ success: false, message: resolvedScope.error });
      }
      if (!resolvedScope.courseId) {
        return res.status(404).json({ success: false, message: 'ØµÙ†Ù ÛŒØ§ÙØª Ù†Ø´Ø¯' });
      }
      if (normalizeText(courseId) && !normalizeText(classId)) {
        setLegacyRouteHeaders(
          res,
          resolvedScope.classId ? `/api/virtual-classes?classId=${resolvedScope.classId}` : '/api/virtual-classes?classId=:classId'
        );
      }
    }

    if (resolvedScope?.courseId && !(await canAccessCourse(req.user, resolvedScope.courseId, membershipAccessOptions))) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const filter = {};
    if (resolvedScope?.courseId) {
      filter.course = resolvedScope.courseId;
    } else {
      const accessibleIds = await getAccessibleCourseIds(req.user, membershipAccessOptions);
      if (Array.isArray(accessibleIds)) {
        if (!accessibleIds.length) {
          return res.json({
            success: true,
            items: [],
            summary: summarizeSessions([])
          });
        }
        filter.course = { $in: accessibleIds };
      }
    }

    const normalizedStatus = normalizeStatus(status, '');
    if (normalizedStatus) {
      filter.status = normalizedStatus;
    }

    const maxLimit = Math.max(1, Math.min(Number(limit) || 120, 200));
    const items = await VirtualClassSession.find(filter)
      .populate('course', 'title category schoolClassRef')
      .populate('createdBy', 'name role')
      .limit(maxLimit);

    const sorted = sortSessions(items);
    res.json({
      success: true,
      courseId: resolvedScope?.courseId || null,
      classId: resolvedScope?.classId || null,
      schoolClass: serializeSchoolClass(resolvedScope?.schoolClass),
      items: sorted.map(serializeSession),
      summary: summarizeSessions(sorted)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت جلسات آنلاین' });
  }
});

router.post('/', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const scope = await resolveVirtualClassScope({
      classId: req.body?.classId,
      courseId: req.body?.courseId
    });
    const courseId = scope.courseId;
    const title = normalizeText(req.body?.title);
    const description = normalizeText(req.body?.description);
    const provider = normalizeProvider(req.body?.provider);
    const meetingUrl = normalizeText(req.body?.meetingUrl);
    const accessCode = normalizeText(req.body?.accessCode);
    const status = normalizeStatus(req.body?.status, 'scheduled');
    const scheduledAt = parseDate(req.body?.scheduledAt);

    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'صنف معتبر نیست' });
    }
    if (!title || !meetingUrl || !scheduledAt) {
      return res.status(400).json({ success: false, message: 'صنف، عنوان، لینک جلسه و زمان برگزاری الزامی است' });
    }
    if (!/^https?:\/\//i.test(meetingUrl)) {
      return res.status(400).json({ success: false, message: 'لینک جلسه باید با http یا https آغاز شود' });
    }

    const course = scope.course || await Course.findById(courseId).select('_id title category schoolClassRef');
    if (!course) {
      return res.status(404).json({ success: false, message: 'صنف یافت نشد' });
    }
    if (!(await canAccessCourse(req.user, courseId, membershipAccessOptions))) {
      return res.status(403).json({ success: false, message: 'این صنف مربوط به شما نیست' });
    }

    const item = await VirtualClassSession.create({
      course: courseId,
      title,
      description,
      provider,
      meetingUrl,
      accessCode,
      scheduledAt,
      status,
      startedAt: status === 'live' ? new Date() : null,
      endedAt: status === 'ended' ? new Date() : null,
      createdBy: req.user.id
    });

    const populated = await loadSession(item._id);
    await logActivity({
      req,
      action: 'virtual_class_create',
      targetType: 'VirtualClassSession',
      targetId: item._id.toString(),
      meta: {
        title,
        provider,
        status,
        classId: scope.classId || '',
        courseId: courseId || ''
      }
    });
    res.status(201).json({ success: true, item: serializeSession(populated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ثبت جلسه آنلاین' });
  }
});

router.put('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await loadSession(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'جلسه یافت نشد' });
    }
    if (!(await canManageSession(req.user, item))) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    let nextCourseId = String(item.course?._id || item.course);
    const previousStatus = item.status;
    const previousTitle = item.title;
    const previousScope = getSessionScopeMeta(item);
    if (req.body?.classId !== undefined || req.body?.courseId !== undefined) {
      const nextScope = await resolveVirtualClassScope({
        classId: req.body?.classId,
        courseId: req.body?.courseId
      });
      if (nextScope.error) {
        return res.status(400).json({ success: false, message: nextScope.error });
      }
      nextCourseId = nextScope.courseId;
    }

    if (!mongoose.isValidObjectId(nextCourseId)) {
      return res.status(400).json({ success: false, message: 'صنف معتبر نیست' });
    }
    if (!(await canAccessCourse(req.user, nextCourseId, membershipAccessOptions))) {
      return res.status(403).json({ success: false, message: 'این صنف مربوط به شما نیست' });
    }

    if (req.body?.title !== undefined) item.title = normalizeText(req.body.title);
    if (req.body?.description !== undefined) item.description = normalizeText(req.body.description);
    if (req.body?.provider !== undefined) item.provider = normalizeProvider(req.body.provider, item.provider);
    if (req.body?.meetingUrl !== undefined) {
      const meetingUrl = normalizeText(req.body.meetingUrl);
      if (!meetingUrl || !/^https?:\/\//i.test(meetingUrl)) {
        return res.status(400).json({ success: false, message: 'لینک جلسه باید با http یا https آغاز شود' });
      }
      item.meetingUrl = meetingUrl;
    }
    if (req.body?.accessCode !== undefined) item.accessCode = normalizeText(req.body.accessCode);
    if (req.body?.scheduledAt !== undefined) {
      const scheduledAt = parseDate(req.body.scheduledAt);
      if (!scheduledAt) {
        return res.status(400).json({ success: false, message: 'زمان برگزاری معتبر نیست' });
      }
      item.scheduledAt = scheduledAt;
    }
    if (String(nextCourseId) !== String(item.course?._id || item.course)) {
      item.course = nextCourseId;
    }
    if (req.body?.status !== undefined) {
      item.status = normalizeStatus(req.body.status, item.status);
      if (item.status === 'live' && !item.startedAt) item.startedAt = new Date();
      if (item.status === 'ended' && !item.endedAt) item.endedAt = new Date();
    }

    if (!item.title || !item.meetingUrl) {
      return res.status(400).json({ success: false, message: 'عنوان و لینک جلسه الزامی است' });
    }

    await item.save();
    const populated = await loadSession(item._id);
    const nextScopeMeta = getSessionScopeMeta(populated);
    await logActivity({
      req,
      action: 'virtual_class_update',
      targetType: 'VirtualClassSession',
      targetId: item._id.toString(),
      meta: {
        titleBefore: previousTitle,
        titleAfter: populated?.title || item.title || '',
        statusBefore: previousStatus || '',
        statusAfter: populated?.status || item.status || '',
        classIdBefore: previousScope.classId || '',
        classIdAfter: nextScopeMeta.classId || '',
        courseIdBefore: previousScope.courseId || '',
        courseIdAfter: nextScopeMeta.courseId || ''
      }
    });
    res.json({ success: true, item: serializeSession(populated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ویرایش جلسه آنلاین' });
  }
});

router.post('/:id/start', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await loadSession(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'جلسه یافت نشد' });
    }
    if (!(await canManageSession(req.user, item))) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    item.status = 'live';
    item.startedAt = new Date();
    item.endedAt = null;
    await item.save();

    const populated = await loadSession(item._id);
    const scopeMeta = getSessionScopeMeta(populated);
    await logActivity({
      req,
      action: 'virtual_class_start',
      targetType: 'VirtualClassSession',
      targetId: item._id.toString(),
      meta: {
        title: populated?.title || item.title || '',
        status: populated?.status || item.status || 'live',
        classId: scopeMeta.classId || '',
        courseId: scopeMeta.courseId || ''
      }
    });
    res.json({ success: true, item: serializeSession(populated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در شروع جلسه آنلاین' });
  }
});

router.post('/:id/end', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await loadSession(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'جلسه یافت نشد' });
    }
    if (!(await canManageSession(req.user, item))) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    item.status = 'ended';
    if (!item.startedAt) item.startedAt = item.updatedAt || new Date();
    item.endedAt = new Date();
    await item.save();

    const populated = await loadSession(item._id);
    const scopeMeta = getSessionScopeMeta(populated);
    await logActivity({
      req,
      action: 'virtual_class_end',
      targetType: 'VirtualClassSession',
      targetId: item._id.toString(),
      meta: {
        title: populated?.title || item.title || '',
        status: populated?.status || item.status || 'ended',
        classId: scopeMeta.classId || '',
        courseId: scopeMeta.courseId || ''
      }
    });
    res.json({ success: true, item: serializeSession(populated) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ختم جلسه آنلاین' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await loadSession(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'جلسه یافت نشد' });
    }
    if (!(await canManageSession(req.user, item))) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const scopeMeta = getSessionScopeMeta(item);
    await VirtualClassSession.deleteOne({ _id: item._id });
    await logActivity({
      req,
      action: 'virtual_class_delete',
      targetType: 'VirtualClassSession',
      targetId: item._id.toString(),
      meta: {
        title: item.title || '',
        status: item.status || '',
        classId: scopeMeta.classId || '',
        courseId: scopeMeta.courseId || ''
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در حذف جلسه آنلاین' });
  }
});

module.exports = router;
