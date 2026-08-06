const { deriveLinkScope } = require('./financeLinkScope');
const mongoose = require('mongoose');
const { isFinanceMaintenanceActive } = require('../services/financeMaintenanceService');
const {
  normalizeFinanceLineItems,
  normalizeFinanceFeeType,
  normalizePaymentBreakdown,
  inferPrimaryOrderType,
  normalizeAdjustmentScope,
  getFinanceFeeScopeGrossAmount,
  applyFinanceOrderStatus
} = require('./financeLineItems');
const { formatFinanceCode } = require('./latinFinanceCode');
const {
  isFinanceVersionConflict,
  suppressAutomaticFinanceBillSync
} = require('./financeSyncControl');

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

async function financeMirrorBlockedByMaintenance(dryRun = false) {
  if (dryRun || mongoose.connection.readyState !== 1) return false;
  return isFinanceMaintenanceActive();
}

function normalizeAdjustmentPayload(adjustment = {}) {
  return {
    type: normalizeText(adjustment.type) || 'manual',
    scope: normalizeAdjustmentScope(adjustment),
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
    Discount: require('../models/Discount'),
    FeeExemption: require('../models/FeeExemption')
  };
}

function isRegistryAdjustment(adjustment = {}) {
  const reason = normalizeText(adjustment?.reason);
  return reason.startsWith('[discount:') || reason.startsWith('[exemption:');
}

function isLegacyRegistryReliefAdjustment(adjustment = {}) {
  const reason = normalizeText(adjustment?.reason);
  return /^Relief \([^)]+\)$/i.test(reason) || /^Fee exemption \([^)]+\)$/i.test(reason);
}

function registryAdjustmentsChanged(current = [], next = []) {
  const serialize = (items) => JSON.stringify((items || []).map((item) => ({
    type: normalizeText(item?.type) || 'manual',
    scope: normalizeAdjustmentScope(item),
    amount: roundMoney(item?.amount),
    reason: normalizeText(item?.reason),
    createdBy: normalizeText(item?.createdBy),
    createdAt: String(normalizeDate(item?.createdAt)?.toISOString() || '')
  })));
  return serialize(current) !== serialize(next);
}

function discountAppliesToBill(discount = {}, bill = {}) {
  const dueDate = normalizeDate(bill?.dueDate);
  if (!dueDate) return true;
  const periodStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
  const periodEnd = new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const startDate = normalizeDate(discount?.startDate);
  const endDate = normalizeDate(discount?.endDate);
  return !(startDate && startDate > periodEnd) && !(endDate && endDate < periodStart);
}

function getExemptionBaseAmount(exemption = {}, bill = {}) {
  const scope = normalizeText(exemption?.scope) || 'all';
  if (scope === 'all') return roundMoney(bill?.amountOriginal);
  const scopedAmount = (Array.isArray(bill?.lineItems) ? bill.lineItems : [])
    .filter((item) => normalizeText(item?.feeType) === scope)
    .reduce((sum, item) => sum + Number(item?.grossAmount || item?.netAmount || 0), 0);
  return roundMoney(scopedAmount);
}

function refreshFinanceBillStatus(bill = {}) {
  if (!bill || normalizeText(bill.status) === 'void') return bill;
  bill.lineItems = normalizeFinanceLineItems({
    lineItems: bill.lineItems,
    feeBreakdown: bill.feeBreakdown,
    feeScopes: bill.feeScopes,
    amountOriginal: bill.amountOriginal,
    adjustments: bill.adjustments,
    amountPaid: bill.amountPaid,
    paymentBreakdown: bill.paymentBreakdown,
    defaultType: 'tuition'
  });
  bill.amountDue = roundMoney((bill.lineItems || []).reduce(
    (sum, item) => sum + Number(item?.netAmount || 0),
    0
  ));
  applyFinanceOrderStatus(bill);
  return bill;
}

async function applyActiveRegistryReliefsToFinanceBill(input, { dryRun = false } = {}) {
  const { FinanceBill, Discount, FeeExemption } = await getModels();
  let bill = await resolveFinanceBill(input);
  if (!bill?._id || !bill?.studentMembershipId || normalizeText(bill?.status) === 'void') {
    return { updated: false, skipped: true, bill, reason: 'bill_not_eligible' };
  }

  const existingAdjustments = Array.isArray(bill.adjustments) ? bill.adjustments : [];
  const hasRegistryAdjustments = existingAdjustments.some((adjustment) => (
    isRegistryAdjustment(adjustment) || isLegacyRegistryReliefAdjustment(adjustment)
  ));
  if (!['new', 'partial', 'overdue'].includes(normalizeText(bill.status)) && !hasRegistryAdjustments) {
    return { updated: false, skipped: true, bill, reason: 'bill_settled_without_relief' };
  }

  const [discounts, exemptions] = await Promise.all([
    Discount.find({
      studentMembershipId: bill.studentMembershipId,
      status: 'active',
      source: { $in: ['manual', 'migration'] }
    }).sort({ createdAt: 1, _id: 1 }).lean(),
    FeeExemption.find({ studentMembershipId: bill.studentMembershipId, status: 'active' })
      .sort({ createdAt: 1, _id: 1 })
      .lean()
  ]);

  const nextAdjustments = existingAdjustments
    .filter((adjustment) => !isRegistryAdjustment(adjustment) && !isLegacyRegistryReliefAdjustment(adjustment))
    .map(normalizeAdjustmentPayload);
  const baseAmount = roundMoney(bill.amountOriginal);

  discounts.forEach((discount) => {
    if (!discountAppliesToBill(discount, bill)) return;
    const isPenalty = normalizeText(discount.discountType) === 'penalty';
    const discountBase = isPenalty
      ? roundMoney(bill.amountOriginal)
      : getFinanceFeeScopeGrossAmount(bill, 'tuition');
    if (discountBase <= 0) return;
    const amount = discount.coverageMode === 'percent'
      ? Math.min(discountBase, discountBase * (Number(discount.percentage || 0) / 100))
      : Math.min(discountBase, Number(discount.amount || 0));
    if (amount <= 0) return;
    nextAdjustments.push({
      type: isPenalty ? 'penalty' : 'discount',
      scope: isPenalty ? 'all' : 'tuition',
      amount: roundMoney(amount),
      reason: `[discount:${String(discount._id)}] ${normalizeText(discount.reason)}`.trim(),
      createdBy: discount.createdBy || null,
      createdAt: normalizeDate(discount.createdAt) || new Date()
    });
  });

  exemptions.forEach((exemption) => {
    const exemptionBase = getExemptionBaseAmount(exemption, bill);
    const amount = exemption.exemptionType === 'full'
      ? exemptionBase
      : Number(exemption.amount || 0) > 0
        ? Math.min(exemptionBase, Number(exemption.amount || 0))
        : Math.min(exemptionBase, exemptionBase * (Number(exemption.percentage || 0) / 100));
    if (amount <= 0) return;
    nextAdjustments.push({
      type: 'waiver',
      scope: normalizeText(exemption.scope) || 'all',
      amount: roundMoney(amount),
      reason: `[exemption:${String(exemption._id)}] ${normalizeText(exemption.reason)}`.trim(),
      createdBy: exemption.createdBy || exemption.approvedBy || null,
      createdAt: normalizeDate(exemption.createdAt) || new Date()
    });
  });

  if (!registryAdjustmentsChanged(existingAdjustments, nextAdjustments)) {
    return { updated: false, skipped: true, bill, reason: 'no_change' };
  }
  if (dryRun) return { updated: true, skipped: false, bill };

  if (typeof bill.save !== 'function') bill = await FinanceBill.findById(bill._id);
  bill.adjustments = nextAdjustments;
  refreshFinanceBillStatus(bill);
  suppressAutomaticFinanceBillSync(bill);
  await bill.save();
  return { updated: true, skipped: false, bill };
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
    paymentBreakdown: bill.paymentBreakdown,
    defaultType: 'tuition'
  });
  const normalizedAmountOriginal = roundMoney(normalizedLineItems.reduce((sum, item) => (
    item?.feeType === 'penalty' ? sum : sum + (Number(item?.grossAmount) || 0)
  ), 0));
  const normalizedAmountDue = roundMoney(normalizedLineItems.reduce((sum, item) => sum + (Number(item?.netAmount) || 0), 0));
  const normalizedAmountPaid = roundMoney(bill.amountPaid);
  return {
    orderNumber: formatFinanceCode(normalizeText(bill.billNumber)).toUpperCase(),
    title: normalizeText(bill.periodLabel) || normalizeText(bill.billNumber),
    orderType: inferPrimaryOrderType(normalizedLineItems, 'tuition'),
    source: 'finance_bill',
    sourceBillId: bill._id || null,
    issuanceKey: normalizeText(bill.issuanceKey) || undefined,
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
    paymentBreakdown: normalizePaymentBreakdown(bill.paymentBreakdown),
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
  const orderFeeTypes = Array.from(new Set(
    (Array.isArray(feeOrder?.lineItems) ? feeOrder.lineItems : [])
      .filter((item) => Number(item?.netAmount ?? item?.grossAmount ?? 0) > 0)
      .map((item) => normalizeFinanceFeeType(item?.feeType, feeOrder?.orderType || 'tuition'))
  ));
  const requestedFeeType = receipt.feeType
    ? normalizeFinanceFeeType(receipt.feeType, feeOrder?.orderType || 'tuition')
    : '';
  const allocationFeeType = requestedFeeType && orderFeeTypes.includes(requestedFeeType)
    ? requestedFeeType
    : orderFeeTypes.length === 1
      ? orderFeeTypes[0]
      : normalizeText(feeOrder?.orderType) === 'admission'
        ? 'admission'
        : '';
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
      feeType: allocationFeeType || undefined,
      amount: allocationAmount,
      title: normalizeText(feeOrder.title),
      orderNumber: formatFinanceCode(normalizeText(feeOrder.orderNumber)).toUpperCase()
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
  const keys = ['title', 'student', 'studentId', 'studentMembershipId', 'linkScope', 'course', 'classId', 'academicYearId', 'periodType', 'periodLabel', 'issuanceKey', 'currency', 'amountOriginal', 'amountDue', 'amountPaid', 'outstandingAmount', 'status', 'note'];
  return keys.some((key) => String(existing[key] || '') !== String(payload[key] || ''))
    || String(normalizeDate(existing.issuedAt)?.toISOString() || '') !== String(normalizeDate(payload.issuedAt)?.toISOString() || '')
    || String(normalizeDate(existing.dueDate)?.toISOString() || '') !== String(normalizeDate(payload.dueDate)?.toISOString() || '')
    || String(normalizeDate(existing.paidAt)?.toISOString() || '') !== String(normalizeDate(payload.paidAt)?.toISOString() || '')
    || String(normalizeDate(existing.voidedAt)?.toISOString() || '') !== String(normalizeDate(payload.voidedAt)?.toISOString() || '')
    || String(normalizeDate(existing.lastReminderAt)?.toISOString() || '') !== String(normalizeDate(payload.lastReminderAt)?.toISOString() || '')
    || JSON.stringify(existing.adjustments || []) !== JSON.stringify(payload.adjustments || [])
    || JSON.stringify(existing.installments || []) !== JSON.stringify(payload.installments || [])
    || JSON.stringify(existing.lineItems || []) !== JSON.stringify(payload.lineItems || [])
    || JSON.stringify(existing.paymentBreakdown || {}) !== JSON.stringify(payload.paymentBreakdown || {})
    || String(existing.voidReason || '') !== String(payload.voidReason || '')
    || String(existing.voidedBy || '') !== String(payload.voidedBy || '');
}

function preserveCanonicalFeeOrderPaymentState(payload = {}, existing = {}) {
  if (!existing?._id || normalizeText(payload.status) === 'void') return payload;
  const incomingBreakdown = normalizePaymentBreakdown(payload.paymentBreakdown);
  const canonicalBreakdown = normalizePaymentBreakdown(existing.paymentBreakdown);
  const paymentBreakdown = Object.keys(incomingBreakdown).reduce((result, key) => ({
    ...result,
    [key]: Math.max(roundMoney(incomingBreakdown[key]), roundMoney(canonicalBreakdown[key]))
  }), {});
  const breakdownPaid = roundMoney(Object.values(paymentBreakdown).reduce((sum, value) => sum + Number(value || 0), 0));
  const amountPaid = Math.max(roundMoney(payload.amountPaid), roundMoney(existing.amountPaid), breakdownPaid);
  const lineItems = normalizeFinanceLineItems({
    lineItems: payload.lineItems,
    amountOriginal: payload.amountOriginal,
    adjustments: payload.adjustments,
    amountPaid,
    paymentBreakdown,
    defaultType: payload.orderType || 'tuition'
  });
  const amountDue = roundMoney(lineItems.reduce((sum, item) => sum + Number(item?.netAmount || 0), 0));
  return {
    ...payload,
    amountPaid,
    paymentBreakdown,
    lineItems,
    amountDue,
    outstandingAmount: roundMoney(Math.max(0, amountDue - amountPaid)),
    paidAt: amountPaid > 0 ? (existing.paidAt || payload.paidAt || null) : null,
    status: normalizeText(existing.status) === 'void' ? 'void' : payload.status,
    voidReason: normalizeText(existing.status) === 'void' ? normalizeText(existing.voidReason) : payload.voidReason,
    voidedBy: normalizeText(existing.status) === 'void' ? (existing.voidedBy || null) : payload.voidedBy,
    voidedAt: normalizeText(existing.status) === 'void' ? normalizeDate(existing.voidedAt) : payload.voidedAt
  };
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

  let existing = await FeeOrder.findOne({ sourceBillId: bill._id });
  if (!existing) {
    if (dryRun) {
      return { created: true, updated: false, skipped: false, feeOrderId: null };
    }
    try {
      const created = await FeeOrder.create(buildFeeOrderPayloadFromBill(bill));
      return { created: true, updated: false, skipped: false, feeOrderId: created._id };
    } catch (error) {
      if (Number(error?.code) !== 11000) throw error;
      existing = await FeeOrder.findOne({ sourceBillId: bill._id });
      if (!existing) throw error;
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = preserveCanonicalFeeOrderPaymentState(buildFeeOrderPayloadFromBill(bill), existing);
    if (!feeOrderChanged(existing.toObject ? existing.toObject() : existing, payload)) {
      return { created: false, updated: false, skipped: true, reason: 'no_change', feeOrderId: existing._id };
    }
    if (dryRun) {
      return { created: false, updated: true, skipped: false, feeOrderId: existing._id };
    }

    Object.assign(existing, payload);
    try {
      await existing.save();
      return { created: false, updated: true, skipped: false, feeOrderId: existing._id };
    } catch (error) {
      if (!isFinanceVersionConflict(error) || attempt > 0) throw error;
      existing = await FeeOrder.findOne({ sourceBillId: bill._id });
      if (!existing) throw error;
    }
  }

  return { created: false, updated: false, skipped: true, reason: 'no_change', feeOrderId: existing._id };
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
    if (isRegistryAdjustment(adjustment)) continue;
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

/**
 * Mirrors payment state FORWARD from a canonical FeeOrder onto its source
 * FinanceBill (order.sourceBillId) - the opposite direction of
 * syncFeeOrderFromFinanceBill above. Needed because approveFeePaymentAction
 * (financeAdminActionService.js) only ever writes the approved amount onto
 * FeeOrder; a FinanceBill created via manual bill issuance (POST
 * /admin/bills) never otherwise learns that payment happened, so its own
 * amountPaid/status silently goes stale.
 *
 * That staleness is not just cosmetic: ensureReceiptSubmissionAvailability
 * (financeRoutes.js) computes "how much can still be paid" straight off
 * FinanceBill.amountPaid, so a stale FinanceBill can let a second receipt be
 * submitted/approved for money that was already collected through the
 * canonical FeeOrder path - a real over-collection risk, not just a display
 * bug.
 *
 * Only ever raises FinanceBill's recorded payment (max-merge per fee type,
 * same protective pattern as preserveCanonicalFeeOrderPaymentState above) -
 * never lowers it - so this is safe to call best-effort/repeatedly and safe
 * to run as a one-off repair over historical records.
 */
async function syncFinanceBillPaymentFromFeeOrder(order, { session = null, dryRun = false } = {}) {
  const sourceBillId = order?.sourceBillId?._id || order?.sourceBillId;
  if (!sourceBillId) return { skipped: true, reason: 'no_source_bill' };
  const { FinanceBill } = await getModels();
  const bill = await FinanceBill.findById(sourceBillId).session(session);
  if (!bill || bill.status === 'void') {
    return { skipped: true, reason: 'bill_not_found_or_void' };
  }

  const incomingBreakdown = normalizePaymentBreakdown(order.paymentBreakdown);
  const currentBreakdown = normalizePaymentBreakdown(bill.paymentBreakdown);
  const mergedBreakdown = Object.keys(incomingBreakdown).reduce((result, key) => ({
    ...result,
    [key]: Math.max(roundMoney(incomingBreakdown[key]), roundMoney(currentBreakdown[key]))
  }), {});
  const mergedPaid = roundMoney(Object.values(mergedBreakdown).reduce((sum, value) => sum + Number(value || 0), 0));
  const priorPaid = roundMoney(bill.amountPaid);
  if (mergedPaid <= priorPaid) {
    return { skipped: true, reason: 'no_change', billId: bill._id };
  }
  if (dryRun) {
    return { skipped: false, updated: true, billId: bill._id, from: priorPaid, to: mergedPaid };
  }

  bill.amountPaid = mergedPaid;
  bill.paymentBreakdown = mergedBreakdown;
  if (!bill.paidAt && mergedPaid > 0) {
    bill.paidAt = normalizeDate(order.paidAt) || new Date();
  }
  await bill.save({ session });
  return { skipped: false, updated: true, billId: bill._id, from: priorPaid, to: mergedPaid };
}

/**
 * Sweeps every FeeOrder that has a source FinanceBill and repairs any stale
 * FinanceBill.amountPaid found (see syncFinanceBillPaymentFromFeeOrder for
 * why staleness happens and why this is safe to run repeatedly - it never
 * lowers a payment, so a fully-synced database makes every call a no-op).
 * Used both by the one-off CLI script (scripts/repairFinanceBillPaymentMirror.js)
 * and by the auto-repair step that runs on every server boot (server.js), so
 * a production database with months of history self-heals on each deploy
 * without anyone needing to run a script by hand.
 */
async function repairFinanceBillPaymentMirrors({ dryRun = false } = {}) {
  const { FeeOrder } = await getModels();
  const orders = await FeeOrder.find({ sourceBillId: { $ne: null } })
    .select('orderNumber student sourceBillId amountPaid paymentBreakdown paidAt')
    .populate('student', 'name');

  const fixes = [];
  for (const order of orders) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncFinanceBillPaymentFromFeeOrder(order, { dryRun });
    if (!result.skipped) {
      fixes.push({ orderNumber: order.orderNumber, student: order.student, ...result });
    }
  }
  return { checked: orders.length, changed: fixes.length, fixes };
}

async function syncStudentFinanceFromFinanceBill(input, { dryRun = false } = {}) {
  if (await financeMirrorBlockedByMaintenance(dryRun)) {
    return { skipped: true, reason: 'finance_maintenance_active' };
  }
  const reliefs = await applyActiveRegistryReliefsToFinanceBill(input, { dryRun });
  const source = reliefs?.bill || input;
  const order = await syncFeeOrderFromFinanceBill(source, { dryRun });
  const discounts = await syncDiscountsFromFinanceBill(source, { dryRun });
  const membershipId = source?.studentMembershipId?._id || source?.studentMembershipId || null;
  if (!dryRun && membershipId) {
    const { Discount } = await getModels();
    const registryDiscounts = await Discount.find({
      studentMembershipId: membershipId,
      status: 'active',
      source: { $in: ['manual', 'migration'] }
    }).lean();
    const { syncFinanceReliefFromDiscount } = require('./financeReliefSync');
    for (const discount of registryDiscounts) {
      await syncFinanceReliefFromDiscount(discount);
    }
  }
  return { order, discounts, reliefs };
}

async function syncStudentFinanceFromFinanceReceipt(input, { dryRun = false } = {}) {
  if (await financeMirrorBlockedByMaintenance(dryRun)) {
    return { skipped: true, reason: 'finance_maintenance_active' };
  }
  const receipt = await resolveFinanceReceipt(input);
  const order = receipt?.bill ? await syncFeeOrderFromFinanceBill(receipt.bill, { dryRun }) : { created: false, updated: false, skipped: true, reason: 'bill_not_found' };
  const payment = await syncFeePaymentFromFinanceReceipt(receipt, { dryRun });
  if (receipt?.bill) {
    await syncDiscountsFromFinanceBill(receipt.bill, { dryRun });
  }
  return { order, payment };
}

module.exports = {
  applyActiveRegistryReliefsToFinanceBill,
  isLegacyRegistryReliefAdjustment,
  refreshFinanceBillStatus,
  syncDiscountsFromFinanceBill,
  syncFeeOrderFromFinanceBill,
  syncFeePaymentFromFinanceReceipt,
  syncFinanceBillPaymentFromFeeOrder,
  repairFinanceBillPaymentMirrors,
  syncStudentFinanceFromFinanceBill,
  syncStudentFinanceFromFinanceReceipt,
  __financeMirrorTestUtils: Object.freeze({
    buildFeeOrderPayloadFromBill,
    feeOrderChanged,
    preserveCanonicalFeeOrderPaymentState
  })
};
