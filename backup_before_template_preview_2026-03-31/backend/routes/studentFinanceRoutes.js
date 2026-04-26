const express = require('express');

const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { buildMembershipStatementPackHtml } = require('../utils/financeStatementPack');
const { buildStatementPackPdfBuffer } = require('../utils/financePdfDocuments');
const {
  buildFinanceDocumentDescriptor,
  createFinanceDocumentArchive
} = require('../utils/financeDocumentArchive');
const {
  addFeeOrderAdjustmentAction,
  setFeeOrderInstallmentsAction,
  voidFeeOrderAction,
  approveFeePaymentAction,
  rejectFeePaymentAction,
  updateFeePaymentFollowUpAction
} = require('../services/financeAdminActionService');
const {
  cancelDiscount,
  cancelFeeExemption,
  createDiscount,
  createFeeExemption,
  createFeePayment,
  createTransportFee,
  getDailyCashierReport,
  getExamEligibility,
  getFeePaymentReceipt,
  getMembershipFinanceOverview,
  getMembershipFinanceStatement,
  listFeeExemptions,
  listDiscounts,
  listFinanceReliefs,
  listOpenFeeOrdersForMembership,
  listFeeOrders,
  listFeePayments,
  listStudentFinanceReferenceData,
  listStudentMembershipOverviewsByUserId,
  listTransportFees,
  previewFeePaymentAllocation
} = require('../services/studentFinanceService');

const router = express.Router();

function canAccessMembershipPayload(req, membership = null) {
  if (!membership) return false;
  if (req.user?.role === 'admin') return true;
  return req.user?.role === 'student' && String(req.user?.id || '') === String(membership?.student?.userId || '');
}

function mapPaymentErrorStatus(code = '') {
  const statusMap = {
    student_finance_membership_not_found: 400,
    student_finance_open_orders_not_found: 404,
    student_finance_payment_not_found: 404,
    student_finance_payment_amount_invalid: 400,
    student_finance_payment_date_invalid: 400,
    student_finance_payment_allocations_required: 400,
    student_finance_payment_selected_orders_required: 400,
    student_finance_payment_order_not_found: 404,
    student_finance_payment_allocation_exceeds_balance: 400,
    student_finance_payment_duplicate_allocations: 400,
    student_finance_payment_allocation_invalid: 400,
    student_finance_payment_unallocated_amount: 400,
    student_finance_payment_exceeds_open_balance: 400,
    student_finance_payment_reference_duplicate: 409,
    student_finance_payment_duplicate: 409
  };
  return statusMap[code] || 500;
}

function mapPaymentErrorMessage(code = '') {
  const messageMap = {
    student_finance_membership_not_found: 'عضویت مالی معتبر پیدا نشد.',
    student_finance_open_orders_not_found: 'برای این عضویت، بدهی باز پیدا نشد.',
    student_finance_payment_not_found: 'پرداخت مالی پیدا نشد.',
    student_finance_payment_amount_invalid: 'مبلغ پرداخت معتبر نیست.',
    student_finance_payment_date_invalid: 'تاریخ پرداخت معتبر نیست.',
    student_finance_payment_allocations_required: 'حداقل یک تخصیص پرداخت لازم است.',
    student_finance_payment_selected_orders_required: 'برای حالت انتخابی، باید حداقل یک بدهی انتخاب شود.',
    student_finance_payment_order_not_found: 'یکی از بدهی‌های انتخاب‌شده پیدا نشد.',
    student_finance_payment_allocation_exceeds_balance: 'مبلغ تخصیص از باقی‌مانده بدهی بیشتر است.',
    student_finance_payment_duplicate_allocations: 'یک بدهی نمی‌تواند بیش از یک بار در همان پرداخت تخصیص شود.',
    student_finance_payment_allocation_invalid: 'تخصیص‌های پرداخت معتبر نیستند.',
    student_finance_payment_unallocated_amount: 'کل مبلغ پرداخت روی بدهی‌ها تخصیص نشده است.',
    student_finance_payment_exceeds_open_balance: 'مبلغ پرداخت از مجموع بدهی‌های باز بیشتر است.',
    student_finance_payment_reference_duplicate: 'پرداخت دیگری با همین مرجع قبلاً ثبت شده است.',
    student_finance_payment_duplicate: 'پرداخت مشابهی برای همین بدهی‌ها قبلاً ثبت شده است.'
  };
  return messageMap[code] || 'عملیات پرداخت مالی ناموفق بود.';
}

router.get('/reference-data', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const data = await listStudentFinanceReferenceData();
    res.json({ success: true, ...data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت اطلاعات مرجع مالی متعلم ناموفق بود.' });
  }
});

router.get('/orders', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFeeOrders(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت بدهی‌های مالی ناموفق بود.' });
  }
});

router.get('/payments', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFeePayments(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت پرداخت‌های مالی ناموفق بود.' });
  }
});

router.get('/payments/:id/receipt', requireAuth, async (req, res) => {
  try {
    const data = await getFeePaymentReceipt(req.params.id);
    if (!canAccessMembershipPayload(req, data.membership) && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = mapPaymentErrorStatus(code);
    return res.status(status).json({ success: false, message: mapPaymentErrorMessage(code) });
  }
});

router.get('/reports/daily-cashier', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const data = await getDailyCashierReport(req.query || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = mapPaymentErrorStatus(code);
    return res.status(status).json({ success: false, message: mapPaymentErrorMessage(code) });
  }
});

router.get('/memberships/:membershipId/open-orders', requireAuth, async (req, res) => {
  try {
    const data = await listOpenFeeOrdersForMembership(req.params.membershipId);
    if (!canAccessMembershipPayload(req, data.membership) && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_membership_not_found' ? 404 : 500;
    return res.status(status).json({ success: false, message: status === 404 ? 'عضویت مالی پیدا نشد.' : 'دریافت بدهی‌های باز ناموفق بود.' });
  }
});

router.post('/payments/preview-allocation', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const data = await previewFeePaymentAllocation(req.body || {});
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const mappedStatus = mapPaymentErrorStatus(code);
    if (mappedStatus !== 500 || code.startsWith('student_finance_')) {
      return res.status(mappedStatus).json({ success: false, message: mapPaymentErrorMessage(code) });
    }
    const statusMap = {
      student_finance_membership_not_found: 400,
      student_finance_open_orders_not_found: 404,
      student_finance_payment_amount_invalid: 400,
      student_finance_payment_allocations_required: 400,
      student_finance_payment_order_not_found: 404,
      student_finance_payment_allocation_exceeds_balance: 400,
      student_finance_payment_allocation_invalid: 400,
      student_finance_payment_unallocated_amount: 400
    };
    const messageMap = {
      student_finance_membership_not_found: 'عضویت مالی معتبر پیدا نشد.',
      student_finance_open_orders_not_found: 'برای این عضویت، بدهی باز پیدا نشد.',
      student_finance_payment_amount_invalid: 'مبلغ پرداخت معتبر نیست.',
      student_finance_payment_allocations_required: 'حداقل یک تخصیص پرداخت لازم است.',
      student_finance_payment_order_not_found: 'یکی از بدهی‌های انتخاب‌شده پیدا نشد.',
      student_finance_payment_allocation_exceeds_balance: 'مبلغ تخصیص از باقی‌مانده بدهی بیشتر است.',
      student_finance_payment_allocation_invalid: 'تخصیص‌های پرداخت معتبر نیستند.',
      student_finance_payment_unallocated_amount: 'کل مبلغ پرداخت روی بدهی‌ها تخصیص نشده است.'
    };
    const status = statusMap[code] || 500;
    return res.status(status).json({ success: false, message: messageMap[code] || 'پیش‌نمایش تخصیص پرداخت ناموفق بود.' });
  }
});

router.post('/payments', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await createFeePayment({
      ...(req.body || {}),
      receivedBy: req.user?.id || ''
    });
    await logActivity({
      req,
      action: 'create_fee_payment',
      targetType: 'FeePayment',
      targetId: String(item?.id || ''),
      targetUser: String(item?.student?.userId || ''),
      meta: {
        studentMembershipId: String(req.body?.studentMembershipId || ''),
        amount: Number(item?.amount || 0),
        allocationCount: Array.isArray(item?.allocations) ? item.allocations.length : 0,
        paymentMethod: String(item?.paymentMethod || '')
      }
    });
    return res.status(201).json({ success: true, item, message: 'پرداخت مالی ثبت شد و در انتظار تایید قرار گرفت.' });
  } catch (error) {
    const code = String(error?.message || '');
    const mappedStatus = mapPaymentErrorStatus(code);
    if (mappedStatus !== 500 || code.startsWith('student_finance_')) {
      return res.status(mappedStatus).json({ success: false, message: mapPaymentErrorMessage(code) });
    }
    const statusMap = {
      student_finance_membership_not_found: 400,
      student_finance_open_orders_not_found: 404,
      student_finance_payment_amount_invalid: 400,
      student_finance_payment_allocations_required: 400,
      student_finance_payment_order_not_found: 404,
      student_finance_payment_allocation_exceeds_balance: 400,
      student_finance_payment_allocation_invalid: 400,
      student_finance_payment_unallocated_amount: 400
    };
    const messageMap = {
      student_finance_membership_not_found: 'عضویت مالی معتبر پیدا نشد.',
      student_finance_open_orders_not_found: 'برای این عضویت، بدهی باز پیدا نشد.',
      student_finance_payment_amount_invalid: 'مبلغ پرداخت معتبر نیست.',
      student_finance_payment_allocations_required: 'حداقل یک تخصیص پرداخت لازم است.',
      student_finance_payment_order_not_found: 'یکی از بدهی‌های انتخاب‌شده پیدا نشد.',
      student_finance_payment_allocation_exceeds_balance: 'مبلغ تخصیص از باقی‌مانده بدهی بیشتر است.',
      student_finance_payment_allocation_invalid: 'تخصیص‌های پرداخت معتبر نیستند.',
      student_finance_payment_unallocated_amount: 'کل مبلغ پرداخت روی بدهی‌ها تخصیص نشده است.'
    };
    const status = statusMap[code] || 500;
    return res.status(status).json({ success: false, message: messageMap[code] || 'ثبت پرداخت مالی ناموفق بود.' });
  }
});

router.post('/orders/:id/discount', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await addFeeOrderAdjustmentAction({ req, feeOrderId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'اعمال تخفیف یا تعدیل روی بدهی مالی ناموفق بود.' });
  }
});

router.post('/orders/:id/installments', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await setFeeOrderInstallmentsAction({ req, feeOrderId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'ثبت قسط‌بندی بدهی مالی ناموفق بود.' });
  }
});

router.post('/orders/:id/void', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await voidFeeOrderAction({ req, feeOrderId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'باطل‌سازی بدهی مالی ناموفق بود.' });
  }
});

router.post('/payments/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await approveFeePaymentAction({ req, feePaymentId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'تایید پرداخت مالی ناموفق بود.' });
  }
});

router.post('/payments/:id/reject', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await rejectFeePaymentAction({ req, feePaymentId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'رد پرداخت مالی ناموفق بود.' });
  }
});

router.post('/payments/:id/follow-up', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const result = await updateFeePaymentFollowUpAction({ req, feePaymentId: req.params.id, body: req.body || {} });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error?.status || 500).json({ success: false, message: error?.message || 'به‌روزرسانی پیگیری پرداخت مالی ناموفق بود.' });
  }
});

router.get('/discounts', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listDiscounts(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت تخفیف‌ها ناموفق بود.' });
  }
});

router.get('/reliefs', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFinanceReliefs(req.query || {});
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Ø¯Ø±ÛŒØ§ÙØª ØªØ³Ù‡ÛŒÙ„Ø§Øª Ù…Ø§Ù„ÛŒ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.' });
  }
});

router.post('/discounts', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await createDiscount({
      ...(req.body || {}),
      createdBy: req.user?.id || ''
    });
    await logActivity({
      req,
      action: 'create_discount_registry',
      targetType: 'Discount',
      targetId: String(item?.id || ''),
      targetUser: String(item?.student?.userId || ''),
      meta: {
        studentMembershipId: String(req.body?.studentMembershipId || ''),
        discountType: String(item?.discountType || req.body?.discountType || ''),
        amount: Number(item?.amount || req.body?.amount || 0)
      }
    });
    return res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_membership_not_found' ? 400 : 500;
    return res.status(status).json({ success: false, message: status === 400 ? 'بافت عضویت برای ثبت تخفیف معتبر نیست.' : 'ثبت تخفیف ناموفق بود.' });
  }
});

router.post('/discounts/:id/cancel', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await cancelDiscount(req.params.id, req.body || {});
    await logActivity({
      req,
      action: 'cancel_discount_registry',
      targetType: 'Discount',
      targetId: String(item?.id || ''),
      targetUser: String(item?.student?.userId || ''),
      meta: {
        reason: String(req.body?.reason || '').trim()
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_discount_not_found' ? 404 : 500;
    return res.status(status).json({ success: false, message: status === 404 ? 'تخفیف پیدا نشد.' : 'لغو تخفیف ناموفق بود.' });
  }
});

router.get('/exemptions', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listFeeExemptions(req.query || {});
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت معافیت‌های فیس ناموفق بود.' });
  }
});

router.post('/exemptions', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await createFeeExemption({
      ...(req.body || {}),
      createdBy: req.user?.id || '',
      approvedBy: req.user?.id || ''
    });
    await logActivity({
      req,
      action: 'create_fee_exemption',
      targetType: 'FeeExemption',
      targetId: String(item?.id || ''),
      targetUser: String(item?.student?.userId || ''),
      meta: {
        studentMembershipId: String(req.body?.studentMembershipId || ''),
        exemptionType: String(item?.exemptionType || req.body?.exemptionType || ''),
        scope: String(item?.scope || req.body?.scope || 'all')
      }
    });
    return res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_membership_not_found' ? 400 : 500;
    return res.status(status).json({ success: false, message: status === 400 ? 'بافت عضویت برای ثبت معافیت معتبر نیست.' : 'ثبت معافیت فیس ناموفق بود.' });
  }
});

router.post('/exemptions/:id/cancel', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const item = await cancelFeeExemption(req.params.id, {
      ...(req.body || {}),
      cancelledBy: req.user?.id || ''
    });
    await logActivity({
      req,
      action: 'cancel_fee_exemption',
      targetType: 'FeeExemption',
      targetId: String(item?.id || ''),
      targetUser: String(item?.student?.userId || ''),
      meta: {
        cancelReason: String(req.body?.cancelReason || '').trim()
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_exemption_not_found' ? 404 : 500;
    return res.status(status).json({ success: false, message: status === 404 ? 'معافیت فیس پیدا نشد.' : 'لغو معافیت فیس ناموفق بود.' });
  }
});

router.get('/transport-fees', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    const items = await listTransportFees(req.query || {});
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت فیس‌های ترانسپورت ناموفق بود.' });
  }
});

router.post('/transport-fees', requireAuth, requireRole(['admin']), requirePermission('manage_finance'), async (req, res) => {
  try {
    if (!req.body?.studentMembershipId || !req.body?.student) {
      return res.status(400).json({ success: false, message: 'شناسه عضویت مالی و شناسه متعلم الزامی است.' });
    }
    const item = await createTransportFee(req.body || {});
    await logActivity({
      req,
      action: 'create_transport_fee',
      targetType: 'TransportFee',
      targetId: String(item?.id || item?._id || ''),
      targetUser: String(req.body?.student || ''),
      meta: {
        studentMembershipId: String(req.body?.studentMembershipId || ''),
        studentId: String(req.body?.student || ''),
        title: String(item?.title || req.body?.title || '').trim(),
        amount: Number(item?.amount || req.body?.amount || 0)
      }
    });
    return res.json({ success: true, item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'ثبت فیس ترانسپورت ناموفق بود.' });
  }
});

router.get('/me/overviews', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const items = await listStudentMembershipOverviewsByUserId(req.user?.id || '');
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نمای کلی مالی متعلم ناموفق بود.' });
  }
});

router.get('/memberships/:membershipId/overview', requireAuth, async (req, res) => {
  try {
    const data = await getMembershipFinanceOverview(req.params.membershipId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Membership finance overview was not found.' });
    }
    if (!canAccessMembershipPayload(req, data.membership)) {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نمای کلی مالی عضویت ناموفق بود.' });
  }
});

router.get('/memberships/:membershipId/statement', requireAuth, async (req, res) => {
  try {
    const data = await getMembershipFinanceStatement(req.params.membershipId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Membership finance statement was not found.' });
    }
    if (!canAccessMembershipPayload(req, data.membership)) {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت استیتمنت مالی عضویت ناموفق بود.' });
  }
});

router.get('/memberships/:membershipId/statement-pack', requireAuth, async (req, res) => {
  try {
    const data = await getMembershipFinanceStatement(req.params.membershipId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Membership finance statement was not found.' });
    }
    if (!canAccessMembershipPayload(req, data.membership)) {
      return res.status(403).json({ success: false, message: 'Ø¯Ø³ØªØ±Ø³ÛŒ Ù…Ø¬Ø§Ø² Ù†ÛŒØ³Øª.' });
    }

    const filename = `student-finance-statement-${String(data.membership?.id || 'membership')}.html`;
    const html = buildMembershipStatementPackHtml({
      membership: data.membership,
      statement: data.statement,
      orders: data.orders,
      payments: data.payments,
      reliefs: data.reliefs
    });

    await logActivity({
      req,
      action: 'export_student_finance_statement_pack',
      targetType: 'StudentMembership',
      targetId: String(data.membership?.id || ''),
      targetUser: String(data.membership?.student?.userId || ''),
      meta: {
        membershipId: String(data.membership?.id || ''),
        filename
      }
    });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Ø¯Ø±ÛŒØ§ÙØª Ø¨Ø³ØªÙ‡ Ø§Ø³ØªÛŒØªÙ…Ù†Øª Ù…Ø§Ù„ÛŒ Ø¹Ø¶ÙˆÛŒØª Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯.' });
  }
});

router.get('/memberships/:membershipId/statement-pack.pdf', requireAuth, async (req, res) => {
  try {
    const data = await getMembershipFinanceStatement(req.params.membershipId);
    if (!data) {
      return res.status(404).json({ success: false, message: 'Membership finance statement was not found.' });
    }
    if (!canAccessMembershipPayload(req, data.membership)) {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }

    const membershipId = String(data.membership?.id || req.params.membershipId || 'membership');
    const filename = `student-finance-statement-${membershipId}.pdf`;
    const statement = data.statement || {};
    const descriptor = await buildFinanceDocumentDescriptor({
      req,
      documentType: 'student_statement'
    });
    const pdfBuffer = await buildStatementPackPdfBuffer({
      title: 'بسته رسمی استیتمنت مالی متعلم',
      subtitle: 'Official student finance statement pack',
      subjectName: data.membership?.student?.fullName || data.membership?.student?.name || 'متعلم',
      classTitle: data.membership?.schoolClass?.title || '-',
      academicYearTitle: data.membership?.academicYear?.title || '-',
      membershipId,
      generatedAt: statement.generatedAt || new Date().toISOString(),
      currency: statement.currency || 'AFN',
      totals: statement.totals || {},
      pack: statement.pack || null,
      latestApprovedPayment: statement.latestApprovedPayment || null,
      latestPendingPayment: statement.latestPendingPayment || null,
      orders: Array.isArray(data.orders) ? data.orders : [],
      payments: Array.isArray(data.payments) ? data.payments : [],
      reliefs: Array.isArray(data.reliefs) ? data.reliefs : [],
      documentNo: descriptor.documentNo,
      generatedByName: req.user?.name || req.user?.email || req.user?.role || 'system',
      verificationCode: descriptor.verificationCode,
      verificationUrl: descriptor.verificationUrl,
      verificationQrBuffer: descriptor.verificationQrBuffer
    });

    const archivedDocument = await createFinanceDocumentArchive({
      req,
      descriptor,
      documentType: 'student_statement',
      filename,
      buffer: pdfBuffer,
      title: 'Student finance statement pack',
      subjectName: data.membership?.student?.fullName || data.membership?.student?.name || 'Student',
      membershipLabel: membershipId,
      studentMembershipId: membershipId,
      studentId: data.membership?.student?.studentId || null,
      classId: data.membership?.schoolClass?.id || null,
      academicYearId: data.membership?.academicYear?.id || null,
      meta: {
        currency: statement.currency || 'AFN',
        totalOrders: Number(statement?.totals?.totalOrders || 0),
        totalOutstanding: Number(statement?.totals?.totalOutstanding || 0)
      }
    });

    await logActivity({
      req,
      action: 'export_student_finance_statement_pdf',
      targetType: 'StudentMembership',
      targetId: membershipId,
      targetUser: String(data.membership?.student?.userId || ''),
      meta: {
        membershipId,
        filename
      }
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Finance-Document-No', String(archivedDocument?.documentNo || descriptor.documentNo || ''));
    res.setHeader('X-Finance-Verification-Code', String(archivedDocument?.verification?.code || descriptor.verificationCode || ''));
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نسخه PDF استیتمنت مالی عضویت ناموفق بود.' });
  }
});

router.get('/eligibility', requireAuth, async (req, res) => {
  try {
    const studentMembershipId = String(req.query?.studentMembershipId || '').trim();
    if (!studentMembershipId) {
      return res.status(400).json({ success: false, message: 'studentMembershipId is required.' });
    }
    const data = await getExamEligibility({
      studentMembershipId,
      sessionId: req.query?.sessionId || ''
    });
    if (!data) {
      return res.status(404).json({ success: false, message: 'Eligibility context was not found.' });
    }
    if (!canAccessMembershipPayload(req, data.membership)) {
      return res.status(403).json({ success: false, message: 'دسترسی مجاز نیست.' });
    }
    return res.json({ success: true, ...data });
  } catch (error) {
    const code = String(error?.message || '');
    const status = code === 'student_finance_session_not_found' ? 404 : code === 'student_finance_session_membership_mismatch' ? 400 : 500;
    return res.status(status).json({ success: false, message: code || 'دریافت وضعیت شایستگی فیس ناموفق بود.' });
  }
});

module.exports = router;
