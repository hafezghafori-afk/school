const express = require('express');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const { requireAuth } = require('../middleware/auth');
const { isProduction } = require('../utils/env');
const { logActivity } = require('../utils/activity');
const { syncStudentFinanceFromFinanceReceipt } = require('../utils/studentFinanceSync');
const {
  normalizeText: normalizeScopeText,
  resolveClassCourseReference
} = require('../utils/classScope');

const router = express.Router();

const setLegacyScopeFieldHeaders = (res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Field', 'courseId');
  res.setHeader('X-Replacement-Field', 'classId');
};

const setLegacyPaymentRouteHeaders = (res, replacementEndpoint = '/api/finance/student/receipts') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const setPaymentSimulationHeaders = (res) => {
  res.setHeader('X-Legacy-Helper', 'true');
  res.setHeader('X-Environment-Guard', 'PAYMENT_SIMULATION_ENABLED');
};

const isTruthyFlag = (value = '') => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const isFalsyFlag = (value = '') => ['0', 'false', 'no', 'off'].includes(String(value || '').trim().toLowerCase());

const isPaymentSimulationEnabled = () => {
  const raw = String(process.env.PAYMENT_SIMULATION_ENABLED || '').trim();
  if (isTruthyFlag(raw)) return true;
  if (isFalsyFlag(raw)) return false;
  return !isProduction();
};

const logPaymentSimulationActivity = async ({
  req,
  action = '',
  targetType = 'payment_helper',
  targetId = 'simulate',
  reason = '',
  meta = {}
} = {}) => {
  await logActivity({
    req,
    action,
    targetType,
    targetId,
    reason,
    meta: {
      helperRoute: '/api/payments/simulate',
      ...meta
    }
  });
};

const buildScopedBillFilter = (scope = {}) => {
  const clauses = [];
  if (scope.classId) clauses.push({ classId: scope.classId });
  if (scope.courseId) {
    clauses.push({ course: scope.courseId, classId: null });
    clauses.push({ course: scope.courseId, classId: { $exists: false } });
  }
  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
};

async function resolvePaymentScope({ classId = '', courseId = '' } = {}) {
  const normalizedClassId = normalizeScopeText(classId);
  const normalizedCourseId = normalizeScopeText(courseId);

  if (!normalizedClassId && !normalizedCourseId) {
    return {
      classId: '',
      courseId: '',
      schoolClass: null,
      course: null
    };
  }

  const scope = await resolveClassCourseReference({
    classId: normalizedClassId,
    courseId: normalizedCourseId
  });

  if (scope.error) return scope;

  return {
    ...scope,
    classId: scope.classId || '',
    courseId: scope.courseId || ''
  };
}

const roundMoney = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);

const applyPaymentToInstallments = (bill, paymentAmount = 0, paidAt = new Date()) => {
  if (!Array.isArray(bill.installments) || !bill.installments.length) return;
  let remain = Math.max(0, Number(paymentAmount) || 0);
  for (const installment of bill.installments) {
    if (remain <= 0) break;
    const openAmount = Math.max(0, (Number(installment.amount) || 0) - (Number(installment.paidAmount) || 0));
    if (openAmount <= 0) continue;
    const used = Math.min(openAmount, remain);
    installment.paidAmount = roundMoney((Number(installment.paidAmount) || 0) + used);
    if ((Number(installment.paidAmount) || 0) >= (Number(installment.amount) || 0)) {
      installment.status = 'paid';
      installment.paidAt = paidAt;
    }
    remain = roundMoney(remain - used);
  }
};

const recalculateBillStatus = (bill, paidAt = new Date()) => {
  const amountDue = roundMoney(bill.amountDue);
  const amountPaid = roundMoney(bill.amountPaid);
  const remaining = Math.max(0, roundMoney(amountDue - amountPaid));

  if (bill.status !== 'void') {
    if (remaining <= 0) {
      bill.status = 'paid';
      bill.paidAt = paidAt;
    } else if (amountPaid > 0) {
      bill.status = 'partial';
      bill.paidAt = null;
    } else if (bill.dueDate && new Date(bill.dueDate).getTime() < Date.now()) {
      bill.status = 'overdue';
      bill.paidAt = null;
    } else {
      bill.status = 'new';
      bill.paidAt = null;
    }
  }

  if (Array.isArray(bill.installments)) {
    for (const installment of bill.installments) {
      if ((Number(installment.paidAmount) || 0) >= (Number(installment.amount) || 0)) {
        installment.status = 'paid';
      } else if (new Date(installment.dueDate).getTime() < Date.now()) {
        installment.status = 'overdue';
      } else {
        installment.status = 'open';
      }
    }
  }

  return remaining;
};

// Simulated payment for development. This now records canonical finance data instead of creating Orders.
router.post('/simulate', requireAuth, async (req, res) => {
  try {
    setLegacyPaymentRouteHeaders(res, '/api/finance/student/receipts');
    setPaymentSimulationHeaders(res);
    const { billId = '', classId = '', courseId: inputCourseId = '', amount } = req.body || {};
    const normalizedBillId = String(billId || '').trim();
    const normalizedClassId = normalizeScopeText(classId);
    const normalizedCourseId = normalizeScopeText(inputCourseId);
    const requestedAmount = roundMoney(amount);

    if (!isPaymentSimulationEnabled()) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_blocked',
        reason: 'environment_guard',
        meta: {
          status: 'blocked',
          guard: 'PAYMENT_SIMULATION_ENABLED',
          classId: normalizedClassId,
          courseId: normalizedCourseId,
          billId: normalizedBillId,
          requestedAmount
        }
      });
      return res.status(403).json({
        success: false,
        disabled: true,
        guard: 'PAYMENT_SIMULATION_ENABLED',
        message: 'Payment simulation is disabled in this environment. Enable PAYMENT_SIMULATION_ENABLED=true only for controlled support or development use.',
        replacementEndpoint: '/api/finance/student/receipts'
      });
    }

    const scope = await resolvePaymentScope({ classId, courseId: inputCourseId });
    if (scope.error) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'invalid_scope',
        meta: {
          status: 'invalid_scope',
          error: scope.error,
          classId: normalizedClassId,
          courseId: normalizedCourseId,
          billId: normalizedBillId,
          requestedAmount
        }
      });
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!normalizedBillId && !scope.courseId) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'missing_scope',
        meta: {
          status: 'missing_scope',
          classId: normalizedClassId,
          courseId: normalizedCourseId,
          billId: normalizedBillId,
          requestedAmount
        }
      });
      return res.status(400).json({ success: false, message: 'billId or classId is required' });
    }
    if (normalizeScopeText(inputCourseId) && !normalizeScopeText(classId)) {
      setLegacyScopeFieldHeaders(res);
    }

    const billQuery = normalizedBillId
      ? { _id: normalizedBillId, student: req.user.id }
      : {
          student: req.user.id,
          status: { $in: ['new', 'partial', 'overdue'] },
          ...buildScopedBillFilter(scope)
        };

    const bill = normalizedBillId
      ? await FinanceBill.findOne(billQuery)
      : await FinanceBill.findOne(billQuery).sort({ createdAt: -1 });

    if (!bill) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'bill_not_found',
        meta: {
          status: 'bill_not_found',
          classId: scope.classId || normalizedClassId,
          courseId: scope.courseId || normalizedCourseId,
          billId: normalizedBillId,
          requestedAmount
        }
      });
      return res.status(404).json({ success: false, message: 'No open finance bill found for this payment simulation' });
    }
    if (bill.status === 'void') {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'void_bill',
        meta: {
          status: 'void_bill',
          classId: bill.classId || scope.classId || normalizedClassId,
          courseId: bill.course || scope.courseId || normalizedCourseId,
          billId: String(bill._id || normalizedBillId || ''),
          requestedAmount
        }
      });
      return res.status(400).json({ success: false, message: 'Void bills cannot receive simulated payments' });
    }

    if (requestedAmount <= 0) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'invalid_amount',
        meta: {
          status: 'invalid_amount',
          classId: bill.classId || scope.classId || normalizedClassId,
          courseId: bill.course || scope.courseId || normalizedCourseId,
          billId: String(bill._id || normalizedBillId || ''),
          requestedAmount
        }
      });
      return res.status(400).json({ success: false, message: 'A positive payment amount is required' });
    }

    const remainingBeforePayment = Math.max(0, roundMoney((Number(bill.amountDue) || 0) - (Number(bill.amountPaid) || 0)));
    if (remainingBeforePayment <= 0) {
      await logPaymentSimulationActivity({
        req,
        action: 'payment_simulate_rejected',
        reason: 'already_paid',
        meta: {
          status: 'already_paid',
          classId: bill.classId || scope.classId || normalizedClassId,
          courseId: bill.course || scope.courseId || normalizedCourseId,
          billId: String(bill._id || normalizedBillId || ''),
          requestedAmount
        }
      });
      return res.status(400).json({ success: false, message: 'This bill has already been fully paid' });
    }

    const settledAmount = Math.min(requestedAmount, remainingBeforePayment);
    const paidAt = new Date();

    const receipt = await FinanceReceipt.create({
      bill: bill._id,
      student: req.user.id,
      studentId: bill.studentId || null,
      studentMembershipId: bill.studentMembershipId || null,
      linkScope: bill.linkScope || null,
      course: bill.course,
      classId: bill.classId || null,
      academicYearId: bill.academicYearId || null,
      amount: settledAmount,
      paymentMethod: 'manual',
      referenceNo: 'SIM-' + Date.now(),
      paidAt,
      note: 'Simulated payment recorded through /api/payments/simulate',
      status: 'approved',
      approvalStage: 'completed',
      reviewedBy: req.user.id,
      reviewedAt: paidAt,
      reviewNote: 'Auto-approved simulated payment',
      rejectReason: '',
      approvalTrail: []
    });

    await syncStudentFinanceFromFinanceReceipt(receipt).catch(() => null);

    bill.amountPaid = roundMoney((Number(bill.amountPaid) || 0) + settledAmount);
    applyPaymentToInstallments(bill, settledAmount, paidAt);
    recalculateBillStatus(bill, paidAt);
    await bill.save();

    await logPaymentSimulationActivity({
      req,
      action: 'payment_simulate_receipt',
      targetType: 'FinanceReceipt',
      targetId: receipt._id.toString(),
      reason: 'legacy_helper_usage',
      meta: {
        status: 'approved',
        billId: String(bill._id || ''),
        classId: bill.classId || scope.classId || normalizedClassId,
        courseId: bill.course || scope.courseId || normalizedCourseId,
        receiptId: receipt._id.toString(),
        requestedAmount,
        settledAmount,
        billStatus: bill.status
      }
    });

    res.json({
      success: true,
      message: 'Simulated payment recorded in finance receipts',
      billId: bill._id,
      receiptId: receipt._id,
      settledAmount,
      billStatus: bill.status
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error while simulating payment' });
  }
});

// Bank account information
router.get('/bank-info', (req, res) => {
  setLegacyPaymentRouteHeaders(res, '/api/finance/student/receipts');
  res.status(410).json({
    success: false,
    retired: true,
    message: 'Legacy payment bank info has been retired. Use /api/finance/student/receipts instead.',
    replacementEndpoint: '/api/finance/student/receipts'
  });
});

// Start real payment (placeholder)
router.post('/init', requireAuth, async (req, res) => {
  try {
    setLegacyPaymentRouteHeaders(res, '/api/finance/student/receipts');
    return res.status(410).json({
      success: false,
      retired: true,
      message: 'Legacy payment init has been retired. Use /api/finance/student/receipts instead.',
      replacementEndpoint: '/api/finance/student/receipts'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error while starting payment' });
  }
});

module.exports = router;
