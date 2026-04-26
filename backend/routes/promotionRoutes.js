const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const {
  applyPromotions,
  createPromotionRule,
  getPromotionTransaction,
  listPromotionReferenceData,
  listPromotionRules,
  listPromotionTransactions,
  previewPromotions,
  rollbackPromotionTransaction
} = require('../services/promotionService');
const { logActivity } = require('../utils/activity');

const router = express.Router();

function getPromotionErrorStatus(code = '') {
  if (code === 'promotion_session_not_found' || code === 'promotion_rule_not_found' || code === 'promotion_transaction_not_found') {
    return 404;
  }
  if (code === 'promotion_rollback_blocked_by_downstream_transactions') {
    return 409;
  }
  if (code.startsWith('promotion_')) {
    return 400;
  }
  return 500;
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

router.post('/rules', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
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
      return res.status(404).json({ success: false, message: 'Promotion transaction was not found.' });
    }
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getPromotionErrorStatus(code)).json({ success: false, message: code || 'Failed to load promotion transaction.' });
  }
});

router.post('/preview', requireAuth, requireRole(['admin', 'instructor']), requirePermission('view_reports'), async (req, res) => {
  try {
    if (!req.body?.sessionId) {
      return res.status(400).json({ success: false, message: 'Session is required.' });
    }
    const data = await previewPromotions(req.body || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getPromotionErrorStatus(code)).json({ success: false, message: code || 'Failed to preview promotions.' });
  }
});

router.post('/apply', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    if (!req.body?.sessionId) {
      return res.status(400).json({ success: false, message: 'Session is required.' });
    }
    const data = await applyPromotions(req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'promotion_apply',
      targetType: 'promotion_session',
      targetId: String(req.body?.sessionId || data?.session?.id || ''),
      meta: {
        promotionSessionId: String(req.body?.sessionId || data?.session?.id || ''),
        promotionRuleId: String(req.body?.ruleId || data?.rule?.id || ''),
        targetAcademicYearId: String(req.body?.targetAcademicYearId || data?.targetAcademicYear?.id || ''),
        transactionCount: Array.isArray(data?.items) ? data.items.length : 0,
        summary: data?.summary || null
      }
    });
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getPromotionErrorStatus(code)).json({ success: false, message: code || 'Failed to apply promotions.' });
  }
});

router.post('/rollback/:transactionId', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await rollbackPromotionTransaction(req.params.transactionId, req.body || {}, req.user?.id || null);
    await logActivity({
      req,
      action: 'promotion_rollback',
      targetType: 'promotion_transaction',
      targetId: item?.id || String(req.params.transactionId || ''),
      meta: {
        promotionTransactionId: item?.id || String(req.params.transactionId || ''),
        promotionOutcome: item?.promotionOutcome || '',
        transactionStatus: item?.transactionStatus || '',
        rollbackReason: item?.rollbackReason || String(req.body?.reason || req.body?.rollbackReason || '')
      },
      reason: item?.rollbackReason || req.body?.reason || req.body?.rollbackReason || ''
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    return res.status(getPromotionErrorStatus(code)).json({ success: false, message: code || 'Failed to rollback promotion.' });
  }
});

module.exports = router;