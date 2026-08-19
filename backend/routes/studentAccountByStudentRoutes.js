const express = require('express');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { getStudentOpenAccount } = require('../services/studentOpenAccountService');
const { getSiblingDebtSummary } = require('../services/studentFinanceService');

const router = express.Router();

const asId = (value) => String(value?._id || value?.id || value || '').trim();

const requestSchoolId = (req) => asId(
  req.headers?.['x-school-id']
  || req.user?.schoolId
  || req.user?.activeSchoolId
);

const errorPayload = (error) => {
  const code = String(error?.code || error?.message || '').trim();
  const messages = {
    student_open_account_student_id_invalid: 'شناسه شاگرد معتبر نیست.',
    student_open_account_school_id_invalid: 'برای مشاهده حساب، مکتب فعال معتبر را انتخاب کنید.',
    student_open_account_membership_not_found: 'عضویت این شاگرد در مکتب فعال پیدا نشد.'
  };
  return {
    statusCode: Number(error?.statusCode || (code === 'student_open_account_membership_not_found' ? 404 : 500)),
    body: {
      success: false,
      code: code || 'student_open_account_failed',
      message: messages[code] || 'دریافت دفترکل مالی شاگرد ناموفق بود.'
    }
  };
};

router.get(
  '/students/:studentId/open-account',
  requireAuth,
  requireRole(['admin']),
  requirePermission('manage_finance'),
  async (req, res) => {
    try {
      const account = await getStudentOpenAccount({
        studentId: asId(req.params.studentId),
        schoolId: requestSchoolId(req),
        query: req.query || {},
        now: new Date()
      });
      res.set('Cache-Control', 'private, no-store');
      return res.json({ success: true, ...account });
    } catch (error) {
      const response = errorPayload(error);
      if (response.statusCode >= 500) {
        console.error('[student-finance][student-open-account]', error);
      }
      return res.status(response.statusCode).json(response.body);
    }
  }
);

// Informational only (see getSiblingDebtSummary doc comment) - matched purely on a shared
// guardian phone number within the same school, never used to gate or drive any financial action.
router.get(
  '/students/:studentId/sibling-debt-summary',
  requireAuth,
  requireRole(['admin']),
  requirePermission('manage_finance'),
  async (req, res) => {
    try {
      const result = await getSiblingDebtSummary({
        studentId: asId(req.params.studentId),
        schoolId: requestSchoolId(req)
      });
      res.set('Cache-Control', 'private, no-store');
      return res.json({ success: true, ...result });
    } catch (error) {
      const code = String(error?.message || '').trim();
      if (code === 'student_finance_school_scope_required') {
        return res.status(400).json({ success: false, message: 'برای مشاهده بدهی خواهر/برادر، مکتب فعال را انتخاب کنید.' });
      }
      if (code === 'student_finance_membership_not_found') {
        return res.status(400).json({ success: false, message: 'شناسه شاگرد معتبر نیست.' });
      }
      console.error('[student-finance][sibling-debt-summary]', error);
      return res.status(500).json({ success: false, message: 'دریافت خلاصهٔ بدهی خواهر/برادر ناموفق بود.' });
    }
  }
);

module.exports = router;
