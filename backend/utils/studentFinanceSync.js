const { deriveLinkScope } = require('./financeLinkScope');
const {
  normalizeFinanceLineItems,
  inferPrimaryOrderType
} = require('./financeLineItems');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function normalizeAdjustmentPayload(adjustment = {}) {
  return {
    type: normalizeText(adjustment.type) || 'manual',
    amount: roundMoney(adjustment.amount),
    reason: normalizeText(adjustment.reason),
    createdBy: adjustment.createdBy || null,
    createdAt: normalizeDate(adjustment.createdAt) || new Date()
  };
}

function normalizeInstallmentPayload(installment = {}, fallbackNo = 1) {
  return {
    installmentNo: Number(installment.installmentNo || fallbackNo) || fallbackNo,
    dueDate: normalizeDate(installment.dueDate) || new Date(),
    amount: roundMoney(installment.amount),
    paidAmount: roundMoney(installment.paidAmount),
    status: normalizeText(installment.status) || 'open',
    paidAt: normalizeDate(installment.paidAt)
  };
}

function normalizeApprovalTrailEntry(entry = {}) {
  return {
    level: normalizeText(entry.level),
    action: normalizeText(entry.action),
    by: entry.by || null,
    at: normalizeDate(entry.at) || new Date(),
    note: normalizeText(entry.note),
    reason: normalizeText(entry.reason)
  };
}

function normalizeFollowUpHistoryEntry(entry = {}) {
  return {
    assignedLevel: normalizeText(entry.assignedLevel) || 'finance_manager',
    status: normalizeText(entry.status) || 'new',
    note: normalizeText(entry.note),
    updatedBy: entry.updatedBy || null,
    updatedAt: normalizeDate(entry.updatedAt) || new Date()
  };
}

async function getModels() {
  return {
    FinanceBill: require('../models/FinanceBill'),
    FinanceReceipt: require('../models/FinanceReceipt'),
    FeeOrder: require('../models/FeeOrder'),
    FeePayment: require('../models/FeePayment'),
    Discount: require('../models/Discount')
  };
}

async function resolveFinanceBill(input) {
  const { FinanceBill } = await getModels();
  if (input && typeof input === 'object' && input.billNumber) return input;
  return FinanceBill.findById(input).lean();
}

async function resolveFinanceReceipt(input) {
  const { FinanceReceipt } = await getModels();
  if (input && typeof input === 'object' && input.bill) return input;
  return FinanceReceipt.findById(input).lean();
}

function buildFeeOrderPayloadFromBill(bill = {}) {
  const normalizedLineItems = normalizeFinanceLineItems({
    lineItems: bill.lineItems,
    feeBreakdown: bill.feeBreakdown,
    feeScopes: bill.feeScopes,
    amountOriginal: bill.amountOriginal,
    adjustments: bill.adjustments,
    amountPaid: bill.amountPaid,
    defaultType: 'tuition'
  });
  const normalizedAmountOriginal = roundMoney(normalizedLineItems.reduce((sum, item) => (
    item?.feeType === 'penalty' ? sum : sum + (Number(item?.grossAmount) || 0)
  ), 0));
  const normalizedAmountDue = roundMoney(normalizedLineItems.reduce((sum, item) => sum + (Number(item?.netAmount) || 0), 0));
  const normalizedAmountPaid = roundMoney(bill.amountPaid);
  return {
    orderNumber: normalizeText(bill.billNumber).toUpperCase(),
    title: normalizeText(bill.periodLabel) || normalizeText(bill.billNumber),
    orderType: inferPrimaryOrderType(normalizedLineItems, 'tuition'),
    source: 'finance_bill',
    sourceBillId: bill._id || null,
    student: bill.student || null,
    studentId: bill.studentId || null,
    studentMembershipId: bill.studentMembershipId || null,
    linkScope: deriveLinkScope({
      linkScope: bill.linkScope,
      studentMembershipId: bill.studentMembershipId,
      classId: bill.classId
    }),
    course: bill.course || null,
    classId: bill.classId || null,
    academicYearId: bill.academicYearId || null,
    periodType: normalizeText(bill.periodType) === 'monthly' ? 'monthly' : normalizeText(bill.periodType) === 'custom' ? 'custom' : 'term',
    periodLabel: normalizeText(bill.periodLabel),
    currency: normalizeText(bill.currency).toUpperCase() || 'AFN',
    amountOriginal: normalizedAmountOriginal,
    amountDue: normalizedAmountDue,
    amountPaid: normalizedAmountPaid,
    outstandingAmount: roundMoney(normalizedAmountDue - normalizedAmountPaid),
    lineItems: normalizedLineItems,
    status: normalizeText(bill.status) || 'new',
    issuedAt: normalizeDate(bill.issuedAt) || new Date(),
    dueDate: normalizeDate(bill.dueDate),
    paidAt: normalizeDate(bill.paidAt),
    note: normalizeText(bill.note),
    installments: Array.isArray(bill.installments)
      ? bill.installments.map((item, index) => normalizeInstallmentPayload(item, index + 1))
      : [],
    adjustments: Array.isArray(bill.adjustments)
      ? bill.adjustments.map((item) => normalizeAdjustmentPayload(item))
      : [],
    voidReason: normalizeText(bill.voidReason),
    voidedBy: bill.voidedBy || null,
    voidedAt: normalizeDate(bill.voidedAt),
    lastReminderAt: normalizeDate(bill.lastReminderAt),
    createdBy: bill.createdBy || null
  };
}

function buildFeePaymentPayloadFromReceipt(receipt = {}, feeOrder = null) {
  const derivedMembershipId = receipt.studentMembershipId || feeOrder?.studentMembershipId || null;
  const derivedStudentId = receipt.studentId || feeOrder?.studentId || null;
  const derivedClassId = receipt.classId || feeOrder?.classId || null;
  const derivedAcademicYearId = receipt.academicYearId || feeOrder?.academicYearId || null;
  const allocationAmount = roundMoney(receipt.amount);
  return {
    paymentNumber: `PAY-${String(receipt._id || '').slice(-8).toUpperCase()}`,
    feeOrderId: feeOrder?._id || null,
    source: 'finance_receipt',
    sourceReceiptId: receipt._id || null,
    student: receipt.student || feeOrder?.student || null,
    studentId: derivedStudentId,
    studentMembershipId: derivedMembershipId,
    linkScope: deriveLinkScope({
      linkScope: receipt.linkScope || feeOrder?.linkScope,
      studentMembershipId: derivedMembershipId,
      classId: derivedClassId
    }),
    classId: derivedClassId,
    academicYearId: derivedAcademicYearId,
    payerType: 'student_guardian',
    receivedBy: null,
    amount: allocationAmount,
    currency: feeOrder?.currency || 'AFN',
    paymentMethod: normalizeText(receipt.paymentMethod) || 'manual',
    allocationMode: 'single_order',
    allocations: feeOrder?._id ? [{
      feeOrderId: feeOrder._id,
      amount: allocationAmount,
      title: normalizeText(feeOrder.title),
      orderNumber: normalizeText(feeOrder.orderNumber).toUpperCase()
    }] : [],
    referenceNo: normalizeText(receipt.referenceNo),
    paidAt: normalizeDate(receipt.paidAt) || new Date(),
    fileUrl: normalizeText(receipt.fileUrl),
    note: normalizeText(receipt.note),
    status: normalizeText(receipt.status) || 'pending',
    approvalStage: normalizeText(receipt.approvalStage) || 'finance_manager_review',
    reviewedBy: receipt.reviewedBy || null,
    reviewedAt: normalizeDate(receipt.reviewedAt),
    reviewNote: normalizeText(receipt.reviewNote),
    rejectReason: normalizeText(receipt.rejectReason),
    approvalTrail: Array.isArray(receipt.approvalTrail)
      ? receipt.approvalTrail.map((entry) => normalizeApprovalTrailEntry(entry))
      : [],
    followUp: receipt.followUp
      ? {
          assignedLevel: normalizeText(receipt.followUp.assignedLevel) || 'finance_manager',
          status: normalizeText(receipt.followUp.status) || 'new',
          note: normalizeText(receipt.followUp.note),
          updatedBy: receipt.followUp.updatedBy || null,
          updatedAt: normalizeDate(receipt.followUp.updatedAt),
          history: Array.isArray(receipt.followUp.history)
            ? receipt.followUp.history.map((entry) => normalizeFollowUpHistoryEntry(entry))
            : []
        }
      : {
          assignedLevel: 'finance_manager',
          status: 'new',
          note: '',
          updatedBy: null,
          updatedAt: null,
          history: []
        }
  };
}

function buildDiscountPayload({ bill = {}, feeOrder = null, adjustment = {}, index = 0 }) {
  return {
    feeOrderId: feeOrder?._id || null,
    sourceBillId: bill._id || null,
    sourceKey: `${String(bill._id || '')}:${index}`,
    studentMembershipId: bill.studentMembershipId || null,
    linkScope: deriveLinkScope({
      linkScope: bill.linkScope || feeOrder?.linkScope,
      studentMembershipId: bill.studentMembershipId,
      classId: bill.classId
    }),
    studentId: bill.studentId || null,
    student: bill.student || null,
    classId: bill.classId || null,
    academicYearId: bill.academicYearId || null,
    discountType: normalizeText(adjustment.type) || 'manual',
    amount: roundMoney(adjustment.amount),
    reason: normalizeText(adjustment.reason),
    status: 'active',
    source: 'finance_adjustment',
    createdBy: adjustment.createdBy || null,
    createdAt: normalizeDate(adjustment.createdAt) || new Date()
  };
}

function feeOrderChanged(existing = {}, payload = {}) {
  const keys = ['title', 'student', 'studentId', 'studentMembershipId', 'linkScope', 'course', 'classId', 'academicYearId', 'periodType', 'periodLabel', 'currency', 'amountOriginal', 'amountDue', 'amountPaid', 'outstandingAmount', 'status', 'note'];
  return keys.some((key) => String(existing[key] || '') !== String(payload[key] || ''))
    || String(normalizeDate(existing.issuedAt)?.toISOString() || '') !== String(normalizeDate(payload.issuedAt)?.toISOString() || '')
    || String(normalizeDate(existing.dueDate)?.toISOString() || '') !== String(normalizeDate(payload.dueDate)?.toISOString() || '')
    || String(normalizeDate(existing.paidAt)?.toISOString() || '') !== String(normalizeDate(payload.paidAt)?.toISOString() || '')
    || String(normalizeDate(existing.voidedAt)?.toISOString() || '') !== String(normalizeDate(payload.voidedAt)?.toISOString() || '')
    || String(normalizeDate(existing.lastReminderAt)?.toISOString() || '') !== String(normalizeDate(payload.lastReminderAt)?.toISOString() || '')
    || JSON.stringify(existing.adjustments || []) !== JSON.stringify(payload.adjustments || [])
    || JSON.stringify(existing.installments || []) !== JSON.stringify(payload.installments || [])
    || JSON.stringify(existing.lineItems || []) !== JSON.stringify(payload.lineItems || [])
    || String(existing.voidReason || '') !== String(payload.voidReason || '')
    || String(existing.voidedBy || '') !== String(payload.voidedBy || '');
}

function feePaymentChanged(existing = {}, payload = {}) {
  const keys = ['feeOrderId', 'student', 'studentId', 'studentMembershipId', 'linkScope', 'classId', 'academicYearId', 'payerType', 'receivedBy', 'amount', 'currency', 'paymentMethod', 'allocationMode', 'referenceNo', 'fileUrl', 'note', 'status', 'approvalStage', 'reviewedBy', 'reviewNote'];
  return keys.some((key) => String(existing[key] || '') !== String(payload[key] || ''))
    || String(normalizeDate(existing.paidAt)?.toISOString() || '') !== String(normalizeDate(payload.paidAt)?.toISOString() || '')
    || String(normalizeDate(existing.reviewedAt)?.toISOString() || '') !== String(normalizeDate(payload.reviewedAt)?.toISOString() || '')
    || String(existing.rejectReason || '') !== String(payload.rejectReason || '')
    || JSON.stringify(existing.allocations || []) !== JSON.stringify(payload.allocations || [])
    || JSON.stringify(existing.approvalTrail || []) !== JSON.stringify(payload.approvalTrail || [])
    || JSON.stringify(existing.followUp || {}) !== JSON.stringify(payload.followUp || {});
}

function discountChanged(existing = {}, payload = {}) {
  const keys = ['feeOrderId', 'studentMembershipId', 'linkScope', 'studentId', 'student', 'classId', 'academicYearId', 'discountType', 'amount', 'reason', 'status', 'createdBy'];
  return keys.some((key) => String(existing[key] || '') !== String(payload[key] || ''));
}

async function syncFeeOrderFromFinanceBill(input, { dryRun = false } = {}) {
  const { FeeOrder } = await getModels();
  const bill = await resolveFinanceBill(input);
  if (!bill || !bill._id) {
    return { created: false, updated: false, skipped: true, reason: 'bill_not_found', feeOrderId: null };
  }

  const payload = buildFeeOrderPayloadFromBill(bill);
  const existing = await FeeOrder.findOne({ sourceBillId: bill._id });
  if (!existing) {
    if (dryRun) {
      return { created: true, updated: false, skipped: false, feeOrderId: null };
    }
    const created = await FeeOrder.create(payload);
    return { created: true, updated: false, skipped: false, feeOrderId: created._id };
  }

  if (!feeOrderChanged(existing.toObject ? existing.toObject() : existing, payload)) {
    return { created: false, updated: false, skipped: true, reason: 'no_change', feeOrderId: existing._id };
  }

  if (dryRun) {
    return { created: false, updated: true, skipped: false, feeOrderId: existing._id };
  }

  Object.assign(existing, payload);
  await existing.save();
  return { created: false, updated: true, skipped: false, feeOrderId: existing._id };
}

async function syncDiscountsFromFinanceBill(input, { dryRun = false } = {}) {
  const { Discount, FeeOrder } = await getModels();
  const bill = await resolveFinanceBill(input);
  if (!bill || !bill._id) {
    return { created: 0, updated: 0, cancelled: 0, skipped: 0, reason: 'bill_not_found' };
  }

  const feeOrder = await FeeOrder.findOne({ sourceBillId: bill._id });
  const activeSourceKeys = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  const adjustments = Array.isArray(bill.adjustments) ? bill.adjustments : [];
  for (let index = 0; index < adjustments.length; index += 1) {
    const adjustment = adjustments[index] || {};
    const payload = buildDiscountPayload({ bill, feeOrder, adjustment, index });
    activeSourceKeys.push(payload.sourceKey);
    const existing = await Discount.findOne({ sourceKey: payload.sourceKey });
    if (!existing) {
      if (!dryRun) {
        await Discount.create(payload);
      }
      created += 1;
      continue;
    }
    if (!discountChanged(existing.toObject ? existing.toObject() : existing, payload)) {
      skipped += 1;
      continue;
    }
    if (!dryRun) {
      Object.assign(existing, payload);
      await existing.save();
    }
    updated += 1;
  }

  const staleDiscounts = await Discount.find({
    sourceBillId: bill._id,
    source: 'finance_adjustment',
    sourceKey: { $nin: activeSourceKeys }
  });

  let cancelled = 0;
  for (const stale of staleDiscounts) {
    if (stale.status === 'cancelled') continue;
    if (!dryRun) {
      stale.status = 'cancelled';
      await stale.save();
    }
    cancelled += 1;
  }

  return { created, updated, cancelled, skipped };
}

async function syncFeePaymentFromFinanceReceipt(input, { dryRun = false } = {}) {
  const { FeeOrder, FeePayment } = await getModels();
  const receipt = await resolveFinanceReceipt(input);
  if (!receipt || !receipt._id) {
    return { created: false, updated: false, skipped: true, reason: 'receipt_not_found', feePaymentId: null };
  }

  const feeOrder = await FeeOrder.findOne({ sourceBillId: receipt.bill });
  if (!feeOrder) {
    return { created: false, updated: false, skipped: true, reason: 'fee_order_not_found', feePaymentId: null };
  }

  const payload = buildFeePaymentPayloadFromReceipt(receipt, feeOrder);
  const existing = await FeePayment.findOne({ sourceReceiptId: receipt._id });
  if (!existing) {
    if (dryRun) {
      return { created: true, updated: false, skipped: false, feePaymentId: null };
    }
    const created = await FeePayment.create(payload);
    return { created: true, updated: false, skipped: false, feePaymentId: created._id };
  }

  if (!feePaymentChanged(existing.toObject ? existing.toObject() : existing, payload)) {
    return { created: false, updated: false, skipped: true, reason: 'no_change', feePaymentId: existing._id };
  }

  if (dryRun) {
    return { created: false, updated: true, skipped: false, feePaymentId: existing._id };
  }

  Object.assign(existing, payload);
  await existing.save();
  return { created: false, updated: true, skipped: false, feePaymentId: existing._id };
}

async function syncStudentFinanceFromFinanceBill(input, { dryRun = false } = {}) {
  const order = await syncFeeOrderFromFinanceBill(input, { dryRun });
  const discounts = await syncDiscountsFromFinanceBill(input, { dryRun });
  return { order, discounts };
}

async function syncStudentFinanceFromFinanceReceipt(input, { dryRun = false } = {}) {
  const receipt = await resolveFinanceReceipt(input);
  const order = receipt?.bill ? await syncFeeOrderFromFinanceBill(receipt.bill, { dryRun }) : { created: false, updated: false, skipped: true, reason: 'bill_not_found' };
  const payment = await syncFeePaymentFromFinanceReceipt(receipt, { dryRun });
  if (receipt?.bill) {
    await syncDiscountsFromFinanceBill(receipt.bill, { dryRun });
  }
  return { order, payment };
}

module.exports = {
  syncDiscountsFromFinanceBill,
  syncFeeOrderFromFinanceBill,
  syncFeePaymentFromFinanceReceipt,
  syncStudentFinanceFromFinanceBill,
  syncStudentFinanceFromFinanceReceipt
};
