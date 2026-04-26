const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { buildReportPdfBuffer } = require('../services/sheetTemplatePdfService');
const { renderReportPrintHtml } = require('../services/sheetTemplatePrintService');
const {
  bootstrapExamSession,
  buildSessionSheetReport,
  createExamSession,
  createExamType,
  ensureExamSessionAccess,
  getSessionMarks,
  getSessionRosterStatus,
  initializeSessionRoster,
  listExamReferenceData,
  listExamSessions,
  listExamTypes,
  listStudentExamResults,
  previewExamSessionBootstrap,
  recomputeSessionResults,
  saveExamSheetMarks,
  updateExamSessionStatus,
  upsertExamMark
} = require('../services/examEngineService');

const router = express.Router();

function canViewStudentResults(req, studentRef) {
  if (req.user?.role === 'admin' || req.user?.role === 'instructor') return true;
  return String(req.user?.id || '') === String(studentRef || '');
}

function getExamErrorStatus(code = '', fallback = 500) {
  if (code === 'exam_session_not_found') return 404;
  if (code === 'exam_session_forbidden') return 403;
  if (code === 'exam_teacher_assignment_forbidden') return 403;
  if (code === 'exam_session_duplicate_scope') return 409;
  if (code.startsWith('exam_')) return 400;
  return fallback;
}

async function assertSessionAccess(req, sessionId) {
  await ensureExamSessionAccess(sessionId, {
    id: req.user?.id || null,
    role: req.user?.role || ''
  });
}

router.get('/reference-data', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const data = await listExamReferenceData();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load exam reference data.' });
  }
});

router.get('/types', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await listExamTypes();
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load exam types.' });
  }
});

router.post('/types', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (!String(req.body?.title || '').trim()) {
      return res.status(400).json({ success: false, message: 'Exam type title is required.' });
    }
    const item = await createExamType(req.body || {});
    await logActivity({
      req,
      action: 'create_exam_type',
      targetType: 'ExamType',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        title: String(item?.title || req.body?.title || '').trim(),
        code: String(item?.code || req.body?.code || '').trim()
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create the exam type.' });
  }
});

router.get('/sessions', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const filters = { ...(req.query || {}) };
    if (String(req.user?.role || '').toLowerCase() === 'instructor') {
      filters.teacherUserId = req.user?.id || null;
    } else if (String(req.query?.mine || '').toLowerCase() === 'true') {
      filters.teacherUserId = req.user?.id || null;
    }
    const items = await listExamSessions(filters);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load exam sessions.' });
  }
});

router.post('/sessions', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await createExamSession(req.body || {}, req.user?.id || null, req.user?.role || '');
    await logActivity({
      req,
      action: 'create_exam_session',
      targetType: 'ExamSession',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        title: String(item?.title || req.body?.title || '').trim(),
        code: String(item?.code || req.body?.code || '').trim()
      }
    });
    res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code.includes('missing_required_refs') || code.includes('mismatch')
      ? 400
      : getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to create the exam session.' });
  }
});

router.post('/sessions/bootstrap-preview', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const data = await previewExamSessionBootstrap(req.body || {}, { id: req.user?.id || null, role: req.user?.role || '' });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to preview exam session bootstrap.' });
  }
});

router.post('/sessions/bootstrap', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const data = await bootstrapExamSession(req.body || {}, req.user?.id || null, req.user?.role || '');
    await logActivity({
      req,
      action: 'bootstrap_exam_session',
      targetType: 'ExamSession',
      targetId: String(data?.session?.id || data?.session?._id || ''),
      meta: {
        title: String(data?.session?.title || req.body?.title || '').trim(),
        code: String(data?.session?.code || req.body?.code || '').trim(),
        eligibleMemberships: Number(data?.roster?.summary?.eligibleMemberships || data?.preview?.rosterSummary?.eligibleMemberships || 0),
        createdMarks: Number(data?.roster?.summary?.createdMarks || 0)
      }
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to bootstrap the exam session.' });
  }
});

router.post('/sessions/:sessionId/initialize-roster', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const data = await initializeSessionRoster(req.params.sessionId, req.user?.id || null);
    await logActivity({
      req,
      action: 'initialize_exam_session_roster',
      targetType: 'ExamSession',
      targetId: String(data?.session?.id || req.params.sessionId || ''),
      meta: {
        eligibleMemberships: Number(data?.summary?.eligibleMemberships || 0),
        createdMarks: Number(data?.summary?.createdMarks || 0),
        pending: Number(data?.summary?.pending || 0)
      }
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to initialize the exam session roster.' });
  }
});

router.get('/sessions/:sessionId/roster-status', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const data = await getSessionRosterStatus(req.params.sessionId);
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to load exam session roster status.' });
  }
});

router.get('/sessions/:sessionId/marks', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const data = await getSessionMarks(req.params.sessionId);
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(getExamErrorStatus(code, 500)).json({ success: false, message: code || 'Failed to load session marks.' });
  }
});

router.post('/sessions/:sessionId/marks/batch', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const data = await saveExamSheetMarks(req.params.sessionId, req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'save_exam_sheet_marks',
      targetType: 'ExamSession',
      targetId: String(req.params.sessionId || ''),
      meta: {
        sessionId: String(req.params.sessionId || ''),
        updatedRows: Array.isArray(req.body?.items) ? req.body.items.length : 0,
        recordedMarks: Number(data?.summary?.recordedMarks || 0),
        pendingMarks: Number(data?.summary?.pendingMarks || 0)
      }
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to save exam sheet marks.' });
  }
});

router.post('/marks/upsert', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (req.body?.sessionId) {
      await assertSessionAccess(req, req.body.sessionId);
    }
    const data = await upsertExamMark(req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'upsert_exam_mark',
      targetType: 'ExamMark',
      targetId: String(data?.mark?.id || data?.mark?._id || ''),
      meta: {
        sessionId: String(req.body?.sessionId || ''),
        studentMembershipId: String(req.body?.studentMembershipId || ''),
        obtainedMark: Number(data?.mark?.obtainedMark || req.body?.obtainedMark || 0),
        totalMark: Number(data?.mark?.totalMark || req.body?.totalMark || 0),
        resultStatus: String(data?.result?.resultStatus || ''),
        rank: Number(data?.result?.rank || 0)
      }
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to save the exam mark.' });
  }
});

router.post('/sessions/:sessionId/recompute-results', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const data = await recomputeSessionResults(req.params.sessionId);
    await logActivity({
      req,
      action: 'recompute_exam_results',
      targetType: 'ExamSession',
      targetId: String(data?.session?.id || req.params.sessionId || ''),
      meta: {
        marks: Number(data?.summary?.marks || 0),
        results: Number(data?.summary?.results || 0),
        ranked: Number(data?.summary?.ranked || 0)
      }
    });
    res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(getExamErrorStatus(code, 500)).json({ success: false, message: code || 'Failed to recompute results.' });
  }
});

router.post('/sessions/:sessionId/status', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const item = await updateExamSessionStatus(req.params.sessionId, req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'update_exam_session_status',
      targetType: 'ExamSession',
      targetId: String(item?.id || req.params.sessionId || ''),
      meta: {
        sessionId: String(item?.id || req.params.sessionId || ''),
        status: String(item?.status || req.body?.status || ''),
        reviewedByName: String(item?.reviewedByName || req.body?.reviewedByName || '')
      }
    });
    res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    res.status(status).json({ success: false, message: code || 'Failed to update exam session status.' });
  }
});

router.get('/sessions/:sessionId/export.print', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const { report, template, session } = await buildSessionSheetReport(req.params.sessionId);
    const html = await renderReportPrintHtml({ report, template });
    const filename = `${session?.code || req.params.sessionId || 'exam-sheet'}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.status(200).send(html);
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    return res.status(status).json({ success: false, message: code || 'Failed to export exam sheet print view.' });
  }
});

router.get('/sessions/:sessionId/export.pdf', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const { report, template, session } = await buildSessionSheetReport(req.params.sessionId);
    const buffer = await buildReportPdfBuffer({ report, template });
    const filename = `${session?.code || req.params.sessionId || 'exam-sheet'}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    const code = String(error?.message || '');
    const status = getExamErrorStatus(code, 500);
    return res.status(status).json({ success: false, message: code || 'Failed to export exam sheet PDF.' });
  }
});

router.get('/my/results', requireAuth, async (req, res) => {
  try {
    const data = await listStudentExamResults(req.user?.id || '', { includeUnpublished: req.user?.role === 'admin' || req.user?.role === 'instructor' });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Student results were not found.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load current student exam results.' });
  }
});

router.get('/students/:studentRef/results', requireAuth, async (req, res) => {
  try {
    if (!canViewStudentResults(req, req.params.studentRef)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    const data = await listStudentExamResults(req.params.studentRef, {
      includeUnpublished: req.user?.role === 'admin' || req.user?.role === 'instructor'
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Student results were not found.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load student exam results.' });
  }
});

module.exports = router;
