const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const {
  applyPromotions,
  createPromotionRule,
  getPromotionBatch,
  getPromotionTransaction,
  getPromotionYearBoard,
  listPromotionBatches,
  listPromotionReferenceData,
  listPromotionRules,
  listPromotionTransactions,
  previewPromotions,
  resolveHeldPromotion,
  rollbackPromotionBatch,
  rollbackPromotionTransaction
} = require('../services/promotionService');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const PROMOTION_ERROR_MESSAGES = Object.freeze({
  promotion_session_required: 'سال تعلیمی و صنف مبدا (یا سشن امتحان) را انتخاب کنید.',
  promotion_board_year_required: 'سال تعلیمی را انتخاب کنید.',
  promotion_board_year_not_found: 'سال تعلیمی پیدا نشد.',
  promotion_session_not_found: 'سشن امتحان پیدا نشد.',
  promotion_class_has_no_exam_session: 'برای این صنف هنوز امتحانی ثبت نشده است؛ اول نتایج امتحان صنف را ثبت کنید.',
  promotion_rule_not_found: 'هیچ قانون ارتقای فعالی برای این صنف پیدا نشد.',
  promotion_transaction_not_found: 'تراکنش ارتقا پیدا نشد.',
  promotion_batch_not_found: 'دستهٔ ارتقا پیدا نشد.',
  promotion_plan_blocked: 'انتخاب‌های ارتقا مشکل دارد؛ موارد قرمز را اصلاح کنید.',
  promotion_nothing_to_apply: 'هیچ شاگردی در این صنف قابل اعمال ارتقا نیست.',
  promotion_transactions_required: 'برای ارتقای یک‌پارچهٔ صنف، دیتابیس باید در حالت Replica Set یا Mongos فعال باشد.',
  promotion_target_membership_changed: 'عضویت شاگرد در صنف مقصد همین حالا تغییر کرد؛ پیش‌نمایش را دوباره بگیرید.',
  promotion_transaction_not_applied: 'این تراکنش اعمال نشده است و بازگردانی ندارد.',
  promotion_source_membership_not_found: 'عضویت صنف مبدا این شاگرد پیدا نشد.',
  promotion_source_membership_not_current: 'عضویت صنف مبدا این شاگرد دیگر جاری نیست.',
  promotion_target_membership_not_found: 'عضویت صنف مقصد این شاگرد پیدا نشد.',
  promotion_rollback_blocked_by_downstream_transactions: 'این شاگرد بعد از این ارتقا دوباره ارتقا یافته است؛ اول ارتقای بعدی را بازگردانی کنید.',
  promotion_rollback_blocked_by_finance: 'برای عضویت جدید این شاگرد بل یا فیس ثبت شده است؛ اول آن‌ها را از بخش مالی باطل کنید.',
  promotion_rollback_blocked_by_second_chance_fee: 'برای امتحان چانس دوم این شاگرد بل فیس صادر شده است؛ اول آن بل را در مرکز مالی مکتب باطل کنید (اگر پرداخت شده، نخست برگشت پول را ثبت کنید).',
  promotion_batch_rollback_blocked: 'بازگردانی دسته انجام نشد؛ بعضی شاگردان قابل بازگردانی نیستند.',
  promotion_batch_nothing_to_rollback: 'در این دسته تراکنش فعالی برای بازگردانی نمانده است.',
  promotion_transaction_not_held: 'این شاگرد در انتظار نتیجهٔ امتحان چانس دوم نیست.',
  promotion_resolve_decision_invalid: 'تصمیم را مشخص کنید: ارتقا یا تکرار صنف.',
  promotion_resolve_target_invalid: 'صنف مقصد انتخاب‌شده برای این شاگرد مجاز نیست.',
  promotion_target_year_not_resolved: 'سال تعلیمی مقصد پیدا نشد.',
  promotion_target_class_not_resolved: 'صنف مقصد پیدا نشد؛ صنف را انتخاب کنید.',
  promotion_target_course_not_resolved: 'صنف مقصد به دورهٔ تعلیمی وصل نیست.',
  promotion_student_already_enrolled_in_target_year: 'این شاگرد در سال مقصد در صنف دیگری عضویت جاری دارد.'
});

function getPromotionErrorStatus(code = '') {
  if (['promotion_session_not_found', 'promotion_rule_not_found', 'promotion_transaction_not_found', 'promotion_batch_not_found', 'promotion_board_year_not_found'].includes(code)) {
    return 404;
  }
  if (code === 'promotion_transactions_required') {
    return 503;
  }
  if ([
    'promotion_rollback_blocked_by_downstream_transactions',
    'promotion_rollback_blocked_by_finance',
    'promotion_rollback_blocked_by_second_chance_fee',
    'promotion_batch_rollback_blocked',
    'promotion_target_membership_changed',
    'promotion_transaction_not_held',
    'promotion_source_membership_not_current',
    'promotion_student_already_enrolled_in_target_year'
  ].includes(code)) {
    return 409;
  }
  if (code.startsWith('promotion_')) {
    return 400;
  }
  return 500;
}

function sendPromotionError(res, error, fallback) {
  const code = String(error?.message || '');
  // A model validation (e.g. a second current membership in the same year)
  // already carries a Persian message meant for the operator.
  if (error?.name === 'ValidationError') {
    const message = Object.values(error.errors || {}).map((item) => item?.message).filter(Boolean).join(' ') || fallback;
    return res.status(409).json({ success: false, code: 'promotion_validation_failed', message });
  }
  const status = getPromotionErrorStatus(code);
  return res.status(status).json({
    success: false,
    code: status === 500 ? 'promotion_failed' : code,
    message: PROMOTION_ERROR_MESSAGES[code] || (status === 500 ? fallback : code) || fallback,
    ...(error?.details ? { details: error.details } : {})
  });
}

router.get('/reference-data', requireAuth, requireRole(['admin', 'instructor']), requirePermission('view_reports'), async (req, res) => {
  try {
    const data = await listPromotionReferenceData();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load promotion reference data.' });
  }
});

router.get('/rules', requireAuth, requireRole(['admin', 'instructor']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await listPromotionRules(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load promotion rules.' });
  }
});

router.post('/rules', requireAuth, requireRole(['admin']), requirePermission('education.promotions.manage'), async (req, res) => {
  try {
    if (!String(req.body?.name || '').trim()) {
      return res.status(400).json({ success: false, message: 'Promotion rule name is required.' });
    }
    const item = await createPromotionRule(req.body || {});
    await logActivity({
      req,
      action: 'promotion_rule_create',
      targetType: 'promotion_rule',
      targetId: item?.id || '',
      meta: {
        promotionRuleId: item?.id || '',
        promotionRuleCode: item?.code || '',
        promotionRuleName: item?.name || ''
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create the promotion rule.' });
  }
});

router.get('/transactions', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await listPromotionTransactions(req.query || {});
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load promotion transactions.' });
  }
});

router.get('/transactions/:transactionId', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const item = await getPromotionTransaction(req.params.transactionId);
    if (!item) {
      return res.status(404).json({ success: false, message: PROMOTION_ERROR_MESSAGES.promotion_transaction_not_found });
    }
    return res.json({ success: true, item });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to load promotion transaction.');
  }
});

router.get('/year-board', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const data = await getPromotionYearBoard({ academicYearId: req.query?.academicYearId });
    return res.json({ success: true, ...data });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to load the promotion year board.');
  }
});

router.get('/batches', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const items = await listPromotionBatches(req.query || {});
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load promotion batches.' });
  }
});

router.get('/batches/:batchId', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const item = await getPromotionBatch(req.params.batchId);
    if (!item) {
      return res.status(404).json({ success: false, message: PROMOTION_ERROR_MESSAGES.promotion_batch_not_found });
    }
    return res.json({ success: true, item });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to load promotion batch.');
  }
});

router.post('/preview', requireAuth, requireRole(['admin', 'instructor']), requirePermission('view_reports'), async (req, res) => {
  try {
    if (!req.body?.sessionId && !(req.body?.academicYearId && req.body?.classId)) {
      return res.status(400).json({ success: false, code: 'promotion_session_required', message: PROMOTION_ERROR_MESSAGES.promotion_session_required });
    }
    const data = await previewPromotions(req.body || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to preview promotions.');
  }
});

router.post('/apply', requireAuth, requireRole(['admin']), requirePermission('education.promotions.manage'), async (req, res) => {
  try {
    if (!req.body?.sessionId && !(req.body?.academicYearId && req.body?.classId)) {
      return res.status(400).json({ success: false, code: 'promotion_session_required', message: PROMOTION_ERROR_MESSAGES.promotion_session_required });
    }
    const data = await applyPromotions(req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'promotion_apply',
      targetType: 'promotion_batch',
      targetId: String(data?.batch?.id || ''),
      meta: {
        promotionBatchId: String(data?.batch?.id || ''),
        promotionSessionId: String(req.body?.sessionId || data?.session?.id || ''),
        promotionRuleId: String(req.body?.ruleId || data?.rule?.id || ''),
        sourceAcademicYearId: String(data?.batch?.sourceAcademicYear?.id || ''),
        sourceClassId: String(data?.batch?.sourceClass?.id || ''),
        targetAcademicYearId: String(data?.batch?.targetAcademicYear?.id || data?.targetAcademicYear?.id || ''),
        promotedClassId: String(data?.batch?.promotedClass?.id || ''),
        repeatClassId: String(data?.batch?.repeatClass?.id || ''),
        transactionCount: Array.isArray(data?.items) ? data.items.length : 0,
        summary: data?.batch?.summary || data?.summary || null,
        financeSummary: data?.batch?.financeSummary || null
      }
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to apply promotions.');
  }
});

router.post('/rollback/:transactionId', requireAuth, requireRole(['admin']), requirePermission('education.promotions.manage'), async (req, res) => {
  try {
    const item = await rollbackPromotionTransaction(req.params.transactionId, req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'promotion_rollback',
      targetType: 'promotion_transaction',
      targetId: item?.id || String(req.params.transactionId || ''),
      meta: {
        promotionTransactionId: item?.id || String(req.params.transactionId || ''),
        promotionBatchId: item?.batchId || '',
        promotionOutcome: item?.promotionOutcome || '',
        transactionStatus: item?.transactionStatus || '',
        rollbackReason: item?.rollbackReason || String(req.body?.reason || req.body?.rollbackReason || '')
      },
      reason: item?.rollbackReason || req.body?.reason || req.body?.rollbackReason || ''
    });
    return res.json({ success: true, item });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to rollback promotion.');
  }
});

router.post('/batches/:batchId/rollback', requireAuth, requireRole(['admin']), requirePermission('education.promotions.manage'), async (req, res) => {
  try {
    const item = await rollbackPromotionBatch(req.params.batchId, req.body || {}, req.user?.id || null);
    const reason = String(req.body?.reason || req.body?.rollbackReason || '');
    await logActivity({
      req,
      action: 'promotion_batch_rollback',
      targetType: 'promotion_batch',
      targetId: item?.id || String(req.params.batchId || ''),
      meta: {
        promotionBatchId: item?.id || String(req.params.batchId || ''),
        batchStatus: item?.status || '',
        transactionCount: Array.isArray(item?.transactions) ? item.transactions.length : 0,
        rollbackReason: reason
      },
      reason
    });
    return res.json({ success: true, item });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to rollback the promotion batch.');
  }
});

router.post('/transactions/:transactionId/resolve', requireAuth, requireRole(['admin']), requirePermission('education.promotions.manage'), async (req, res) => {
  try {
    const item = await resolveHeldPromotion(req.params.transactionId, req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'promotion_resolve',
      targetType: 'promotion_transaction',
      targetId: item?.id || String(req.params.transactionId || ''),
      meta: {
        promotionTransactionId: item?.id || String(req.params.transactionId || ''),
        promotionBatchId: item?.batchId || '',
        decision: String(req.body?.decision || req.body?.outcome || ''),
        promotionOutcome: item?.promotionOutcome || '',
        targetClassId: item?.targetClass?.id || ''
      },
      reason: String(req.body?.note || '')
    });
    const { warnings = [], ...resolved } = item || {};
    return res.json({ success: true, item: resolved, warnings });
  } catch (error) {
    return sendPromotionError(res, error, 'Failed to resolve the held promotion.');
  }
});

module.exports = router;
