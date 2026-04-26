const express = require('express');

const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { normalizeText, resolveClassCourseReference, serializeSchoolClassLite } = require('../utils/classScope');

const router = express.Router();

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

async function resolveModuleScope({ classId = '', courseId = '' } = {}) {
  const scope = await resolveClassCourseReference({ classId, courseId });
  if (scope.error) return scope;
  if (!scope.classId && !scope.courseId) {
    return { error: 'Class is required.' };
  }
  return scope;
}

function buildModuleScopeFilter(scope = {}) {
  const filters = [];
  if (scope.classId) {
    filters.push({ classId: scope.classId });
  }
  if (scope.courseId) {
    filters.push({ course: scope.courseId, classId: null });
    filters.push({ course: scope.courseId, classId: { $exists: false } });
  }
  if (!filters.length) return { _id: null };
  return filters.length === 1 ? filters[0] : { $or: filters };
}

function serializeModulePayload(moduleDoc, scope = {}) {
  const plain = moduleDoc?.toObject ? moduleDoc.toObject() : { ...(moduleDoc || {}) };
  const classId = plain?.classId?._id || plain?.classId || scope.classId || '';
  const courseId = plain?.course?._id || plain?.course || scope.courseId || '';

  return {
    ...plain,
    classId: classId || null,
    courseId: courseId || null,
    schoolClass: serializeSchoolClassLite(scope.schoolClass || plain?.schoolClass || (classId ? { _id: classId } : null))
  };
}

async function createModuleForScope(req, res, scopeInput = {}, options = {}) {
  try {
    const { title, order } = req.body || {};
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Ø¹Ù†ÙˆØ§Ù† Ù…Ø§Ú˜ÙˆÙ„ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª' });
    }

    const scope = await resolveModuleScope(scopeInput);
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!scope.classId || !scope.courseId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required for module operations.' });
    }

    if (options.legacyRoute) {
      setLegacyRouteHeaders(res, `/api/modules/class/${scope.classId}`);
    }

    const moduleDoc = await Module.create({
      classId: scope.classId,
      course: scope.courseId,
      title: title.trim(),
      order: Number(order) || 0
    });

    await logActivity({
      req,
      action: 'create_module',
      targetType: 'Module',
      targetId: moduleDoc._id.toString(),
      meta: {
        title: moduleDoc.title,
        classId: scope.classId,
        courseId: scope.courseId
      }
    });

    return res.status(201).json({
      success: true,
      module: serializeModulePayload(moduleDoc, scope)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø³Ø§Ø®Øª Ù…Ø§Ú˜ÙˆÙ„' });
  }
}

async function sendModuleList(req, res, scopeInput = {}, options = {}) {
  try {
    const scope = await resolveModuleScope(scopeInput);
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }

    if (options.legacyRoute) {
      setLegacyRouteHeaders(res, `/api/modules/class/${scope.classId || ':classId'}`);
    }

    const modules = await Module.find(buildModuleScopeFilter(scope)).sort({ order: 1 });
    const moduleIds = modules.map((item) => item._id).filter(Boolean);
    const lessons = await Lesson.find({ module: { $in: moduleIds } }).sort({ order: 1 });

    return res.json({
      success: true,
      modules: modules.map((item) => serializeModulePayload(item, scope)),
      lessons
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø³Ø§Ø®ØªØ§Ø± Ø¯ÙˆØ±Ù‡' });
  }
}

router.post(
  '/class/:classId',
  requireAuth,
  requireRole(['admin', 'instructor']),
  requirePermission('manage_content'),
  async (req, res) => createModuleForScope(req, res, { classId: normalizeText(req.params.classId) })
);

router.post(
  '/course/:courseId',
  requireAuth,
  requireRole(['admin', 'instructor']),
  requirePermission('manage_content'),
  async (req, res) => createModuleForScope(req, res, { courseId: normalizeText(req.params.courseId) }, { legacyRoute: true })
);

router.get('/class/:classId', async (req, res) => (
  sendModuleList(req, res, { classId: normalizeText(req.params.classId) })
));

router.get('/course/:courseId', async (req, res) => (
  sendModuleList(req, res, { courseId: normalizeText(req.params.courseId) }, { legacyRoute: true })
));

router.post('/:moduleId/lesson', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { title, type, contentUrl, durationMinutes, order } = req.body;
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Ø¹Ù†ÙˆØ§Ù† Ø¯Ø±Ø³ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª' });
    }
    const lesson = await Lesson.create({
      module: req.params.moduleId,
      title: title.trim(),
      type: type || 'video',
      contentUrl: contentUrl || '',
      durationMinutes: Number(durationMinutes) || 0,
      order: Number(order) || 0
    });
    await logActivity({
      req,
      action: 'create_lesson',
      targetType: 'Lesson',
      targetId: lesson._id.toString(),
      meta: { title: lesson.title }
    });
    res.status(201).json({ success: true, lesson });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø³Ø§Ø®Øª Ø¯Ø±Ø³' });
  }
});

router.put('/:moduleId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || title.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Ø¹Ù†ÙˆØ§Ù† Ù…Ø§Ú˜ÙˆÙ„ Ù†Ø§Ù…Ø¹ØªØ¨Ø± Ø§Ø³Øª' });
    }
    const moduleDoc = await Module.findByIdAndUpdate(
      req.params.moduleId,
      { title: title.trim() },
      { new: true }
    );
    if (!moduleDoc) return res.status(404).json({ success: false, message: 'Ù…Ø§Ú˜ÙˆÙ„ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    await logActivity({
      req,
      action: 'update_module',
      targetType: 'Module',
      targetId: moduleDoc._id.toString(),
      meta: { title: moduleDoc.title }
    });
    res.json({ success: true, module: moduleDoc });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´ Ù…Ø§Ú˜ÙˆÙ„' });
  }
});

router.delete('/:moduleId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const moduleId = req.params.moduleId;
    await Lesson.deleteMany({ module: moduleId });
    const result = await Module.findByIdAndDelete(moduleId);
    if (!result) return res.status(404).json({ success: false, message: 'Ù…Ø§Ú˜ÙˆÙ„ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    await logActivity({
      req,
      action: 'delete_module',
      targetType: 'Module',
      targetId: moduleId
    });
    res.json({ success: true, message: 'Ù…Ø§Ú˜ÙˆÙ„ Ø­Ø°Ù Ø´Ø¯' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù Ù…Ø§Ú˜ÙˆÙ„' });
  }
});

router.put('/lesson/:lessonId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { title, type, contentUrl, durationMinutes, order } = req.body;
    const update = {};
    if (title) update.title = title.trim();
    if (type) update.type = type;
    if (contentUrl !== undefined) update.contentUrl = contentUrl;
    if (durationMinutes !== undefined) update.durationMinutes = Number(durationMinutes) || 0;
    if (order !== undefined) update.order = Number(order) || 0;

    const lesson = await Lesson.findByIdAndUpdate(req.params.lessonId, update, { new: true });
    if (!lesson) return res.status(404).json({ success: false, message: 'Ø¯Ø±Ø³ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    await logActivity({
      req,
      action: 'update_lesson',
      targetType: 'Lesson',
      targetId: lesson._id.toString(),
      meta: { title: lesson.title }
    });
    res.json({ success: true, lesson });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± ÙˆÛŒØ±Ø§ÛŒØ´ Ø¯Ø±Ø³' });
  }
});

router.delete('/lesson/:lessonId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.lessonId);
    if (!lesson) return res.status(404).json({ success: false, message: 'Ø¯Ø±Ø³ ÛŒØ§ÙØª Ù†Ø´Ø¯' });
    await logActivity({
      req,
      action: 'delete_lesson',
      targetType: 'Lesson',
      targetId: req.params.lessonId
    });
    res.json({ success: true, message: 'Ø¯Ø±Ø³ Ø­Ø°Ù Ø´Ø¯' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Ø®Ø·Ø§ Ø¯Ø± Ø­Ø°Ù Ø¯Ø±Ø³' });
  }
});

module.exports = router;
