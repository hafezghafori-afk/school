const mongoose = require('mongoose');
const StudentMembership = require('../models/StudentMembership');
const SchoolClass = require('../models/SchoolClass');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const Discount = require('../models/Discount');
const FinanceRelief = require('../models/FinanceRelief');
const FeeExemption = require('../models/FeeExemption');
const {
  LINE_ITEM_TYPES,
  buildFeeBreakdownFromLineItems,
  deriveFinanceOrderStatus,
  isFinanceDueDateReached,
  normalizeFinanceFeeType,
  normalizeFinanceLineItems,
  roundMoney
} = require('../utils/financeLineItems');

const ORDER_STATUSES = ['new', 'partial', 'paid', 'waived', 'overdue', 'void'];
const PAYMENT_STATUSES = ['pending', 'approved', 'rejected'];
const MAX_PAGE_SIZE = 200;

const asId = (value) => String(value?._id || value?.id || value || '').trim();
const text = (value) => String(value || '').trim();
const money = (value) => Math.max(0, roundMoney(value));
const toPlain = (value) => (typeof value?.toObject === 'function'
  ? value.toObject({ virtuals: false })
  : value || null);

const invalidObjectIdError = (code) => {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
};

const notFoundError = (code) => {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 404;
  return error;
};

const time = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? fallback : parsed;
};

const uniqueIds = (values = []) => Array.from(new Map(
  values.filter(Boolean).map((value) => [asId(value), value])
).values()).filter((value) => asId(value));

const formatAcademicYear = (value) => {
  const item = toPlain(value);
  if (!item || !asId(item)) return null;
  return {
    id: asId(item),
    title: text(item.title),
    code: text(item.code),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    status: text(item.status)
  };
};

const formatSchoolClass = (value) => {
  const item = toPlain(value);
  if (!item || !asId(item)) return null;
  return {
    id: asId(item),
    title: text(item.titleDari) || text(item.title),
    titleDari: text(item.titleDari),
    code: text(item.code),
    gradeLevel: Number(item.gradeLevel || 0),
    section: text(item.section),
    academicYear: formatAcademicYear(item.academicYearId)
  };
};

const formatCourse = (value) => {
  const item = toPlain(value);
  if (!item || !asId(item)) return null;
  return {
    id: asId(item),
    title: text(item.title),
    kind: text(item.kind)
  };
};

const formatActor = (value) => {
  const item = toPlain(value);
  if (!item || !asId(item)) return null;
  return {
    id: asId(item),
    name: text(item.name),
    orgRole: text(item.orgRole),
    adminLevel: text(item.adminLevel)
  };
};

const formatStudent = (source = {}, fallbackMembership = null) => {
  const item = toPlain(source) || {};
  const fallback = toPlain(fallbackMembership) || {};
  const core = toPlain(item.studentId) || toPlain(fallback.studentId) || null;
  const user = toPlain(item.student) || toPlain(fallback.student) || null;
  return {
    studentId: asId(core),
    userId: asId(user),
    fullName: text(core?.fullName) || text(user?.name),
    email: text(core?.email) || text(user?.email)
  };
};

const formatMembership = (value) => {
  const item = toPlain(value);
  if (!item || !asId(item)) return null;
  const schoolClass = formatSchoolClass(item.classId);
  return {
    id: asId(item),
    schoolId: asId(item.schoolId) || asId(item.classId?.schoolId),
    status: text(item.status),
    isCurrent: item.isCurrent !== false,
    enrolledAt: item.enrolledAt || item.joinedAt || null,
    endedAt: item.endedAt || item.leftAt || null,
    endedReason: text(item.endedReason),
    student: formatStudent(item),
    schoolClass,
    academicYear: formatAcademicYear(item.academicYearId)
      || formatAcademicYear(item.academicYear)
      || schoolClass?.academicYear
      || null,
    course: formatCourse(item.course)
  };
};

const formatLineItems = (item = {}, defaultType = 'tuition') => normalizeFinanceLineItems({
  lineItems: item.lineItems,
  feeBreakdown: item.feeBreakdown,
  feeScopes: item.feeScopes,
  amountOriginal: item.amountOriginal,
  adjustments: item.adjustments,
  amountPaid: item.amountPaid,
  paymentBreakdown: item.paymentBreakdown,
  defaultType
}).map((entry) => ({
  feeType: text(entry?.feeType),
  label: text(entry?.label),
  sourcePlanId: asId(entry?.sourcePlanId) || null,
  periodKey: text(entry?.periodKey),
  grossAmount: money(entry?.grossAmount),
  reductionAmount: money(entry?.reductionAmount),
  penaltyAmount: money(entry?.penaltyAmount),
  netAmount: money(entry?.netAmount),
  paidAmount: money(entry?.paidAmount),
  balanceAmount: money(entry?.balanceAmount),
  status: text(entry?.status)
}));

const formatOrder = (value, membership = null, { legacy = false, canonicalOrderId = null, now = new Date() } = {}) => {
  const item = toPlain(value) || {};
  const lineItems = formatLineItems(item, item.orderType || 'tuition');
  const amountOriginal = money(lineItems.reduce((sum, entry) => sum + entry.grossAmount, 0));
  const amountDue = money(lineItems.reduce((sum, entry) => sum + entry.netAmount, 0));
  const recordedAmountPaid = money(item.amountPaid);
  const allocatedPaidAmount = money(lineItems.reduce((sum, entry) => sum + entry.paidAmount, 0));
  const outstandingAmount = money(Math.max(0, amountDue - recordedAmountPaid));
  const status = deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal,
    amountDue,
    amountPaid: recordedAmountPaid,
    dueDate: item.dueDate,
    now
  });
  const schoolClass = formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId);
  const academicYear = formatAcademicYear(item.academicYearId)
    || formatAcademicYear(membership?.academicYearId)
    || formatAcademicYear(membership?.academicYear)
    || schoolClass?.academicYear
    || null;
  const tuitionLines = lineItems.filter((entry) => entry.feeType === 'tuition');
  const tuition = {
    gross: money(tuitionLines.reduce((sum, entry) => sum + entry.grossAmount, 0)),
    discount: money(tuitionLines.reduce((sum, entry) => sum + entry.reductionAmount, 0)),
    penalty: money(tuitionLines.reduce((sum, entry) => sum + entry.penaltyAmount, 0)),
    net: money(tuitionLines.reduce((sum, entry) => sum + entry.netAmount, 0)),
    paid: money(tuitionLines.reduce((sum, entry) => sum + entry.paidAmount, 0)),
    outstanding: money(tuitionLines.reduce((sum, entry) => sum + entry.balanceAmount, 0))
  };

  return {
    id: asId(item),
    recordType: legacy ? 'legacy_finance_bill' : 'fee_order',
    orderNumber: text(item.orderNumber) || text(item.billNumber),
    billNumber: text(item.billNumber) || text(item.orderNumber),
    title: text(item.title) || text(item.periodLabel) || text(item.billNumber),
    orderType: text(item.orderType) || text(lineItems.find((entry) => entry.feeType !== 'penalty')?.feeType) || 'tuition',
    source: text(item.source) || (legacy ? 'finance_bill' : ''),
    sourceBillId: asId(item.sourceBillId) || (legacy ? asId(item) : null),
    canonicalOrderId: canonicalOrderId ? asId(canonicalOrderId) : null,
    studentMembershipId: asId(item.studentMembershipId) || asId(membership),
    linkScope: text(item.linkScope) || (item.studentMembershipId ? 'membership' : 'student'),
    periodType: text(item.periodType),
    periodLabel: text(item.periodLabel),
    currency: text(item.currency) || 'AFN',
    amountOriginal,
    amountDue,
    amountPaid: recordedAmountPaid,
    allocatedPaidAmount,
    unallocatedPaidAmount: money(Math.max(0, recordedAmountPaid - allocatedPaidAmount)),
    outstandingAmount,
    paymentBreakdown: item.paymentBreakdown || {},
    storedStatus: text(item.status),
    status,
    issuedAt: item.issuedAt || item.createdAt || null,
    dueDate: item.dueDate || null,
    paidAt: status === 'paid' ? (item.paidAt || null) : null,
    voidedAt: item.voidedAt || null,
    voidReason: text(item.voidReason),
    note: text(item.note),
    lineItems,
    feeBreakdown: buildFeeBreakdownFromLineItems(lineItems),
    tuition,
    monthKey: solarMonthKey(item.dueDate || item.issuedAt),
    adjustments: Array.isArray(item.adjustments) ? item.adjustments.map((entry) => ({
      type: text(entry?.type),
      scope: text(entry?.scope) || 'all',
      amount: money(entry?.amount),
      reason: text(entry?.reason),
      createdAt: entry?.createdAt || null
    })) : [],
    installments: Array.isArray(item.installments) ? item.installments.map((entry) => ({
      installmentNo: Number(entry?.installmentNo || 0),
      dueDate: entry?.dueDate || null,
      amount: money(entry?.amount),
      paidAmount: money(entry?.paidAmount),
      status: text(entry?.status),
      paidAt: entry?.paidAt || null
    })) : [],
    createdBy: formatActor(item.createdBy),
    voidedBy: formatActor(item.voidedBy),
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass,
    academicYear,
    course: formatCourse(item.course) || formatCourse(membership?.course),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const rawOrderStatus = (value, now = new Date()) => {
  const item = toPlain(value);
  if (!item) return '';
  const lineItems = formatLineItems(item, item.orderType || 'tuition');
  return deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal: lineItems.reduce((sum, entry) => sum + entry.grossAmount, 0),
    amountDue: lineItems.reduce((sum, entry) => sum + entry.netAmount, 0),
    amountPaid: item.amountPaid,
    dueDate: item.dueDate,
    now
  });
};

const resolveAllocationFeeType = (allocation = {}, order = null) => {
  const explicit = text(allocation.feeType).toLowerCase();
  if (LINE_ITEM_TYPES.includes(explicit)) return explicit;
  const item = toPlain(order);
  if (!item) return 'other';
  const feeTypes = Array.from(new Set(
    formatLineItems(item, item.orderType || 'tuition')
      .filter((entry) => entry.netAmount > 0 || entry.grossAmount > 0)
      .map((entry) => normalizeFinanceFeeType(entry.feeType, item.orderType || 'other'))
  ));
  if (feeTypes.length === 1) return feeTypes[0];
  const orderType = text(item.orderType).toLowerCase();
  if (feeTypes.length === 0 && LINE_ITEM_TYPES.includes(orderType)) return orderType;
  return 'other';
};

const formatPayment = (value, membership = null, { now = new Date(), allowedOrderIds = null } = {}) => {
  const item = toPlain(value) || {};
  const primaryOrder = toPlain(item.feeOrderId);
  const sourceReceipt = toPlain(item.sourceReceiptId);
  const rawAllocations = Array.isArray(item.allocations) && item.allocations.length
    ? item.allocations
    : primaryOrder && Number(item.amount || 0) > 0
      ? [{ feeOrderId: primaryOrder, amount: item.amount, feeType: '' }]
      : [];
  const allocations = rawAllocations.map((raw) => {
    const allocation = toPlain(raw) || {};
    const order = toPlain(allocation.feeOrderId) || primaryOrder;
    const orderId = asId(order) || asId(allocation.feeOrderId);
    const scopeAllowed = !(allowedOrderIds instanceof Set) || allowedOrderIds.has(orderId);
    const status = !scopeAllowed ? 'outside_school_scope' : orderId ? rawOrderStatus(order, now) || 'missing' : 'missing';
    const amount = money(allocation.amount);
    return {
      feeOrderId: scopeAllowed ? orderId : null,
      feeType: scopeAllowed ? resolveAllocationFeeType(allocation, order) : 'other',
      amount,
      orderNumber: scopeAllowed ? (text(allocation.orderNumber) || text(order?.orderNumber)) : '',
      title: scopeAllowed ? (text(allocation.title) || text(order?.title)) : '',
      orderStatus: status,
      scopeViolation: !scopeAllowed,
      countsAsRecognizedCash: text(item.status) === 'approved' && !['void', 'missing', 'outside_school_scope'].includes(status)
    };
  });
  const allocatedAmount = money(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const excludedVoidAmount = text(item.status) === 'approved'
    ? money(allocations.filter((entry) => entry.orderStatus === 'void').reduce((sum, entry) => sum + entry.amount, 0))
    : 0;
  const excludedInvalidOrderAmount = text(item.status) === 'approved'
    ? money(allocations.filter((entry) => ['missing', 'outside_school_scope'].includes(entry.orderStatus)).reduce((sum, entry) => sum + entry.amount, 0))
    : 0;
  const recognizedAmount = text(item.status) === 'approved'
    ? money(allocations.filter((entry) => entry.countsAsRecognizedCash).reduce((sum, entry) => sum + entry.amount, 0))
    : 0;
  const schoolClass = formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId);
  const academicYear = formatAcademicYear(item.academicYearId)
    || formatAcademicYear(membership?.academicYearId)
    || formatAcademicYear(membership?.academicYear)
    || schoolClass?.academicYear
    || null;

  return {
    id: asId(item),
    recordType: 'fee_payment',
    paymentNumber: text(item.paymentNumber),
    source: text(item.source),
    sourceReceiptId: asId(sourceReceipt) || asId(item.sourceReceiptId) || null,
    studentMembershipId: asId(item.studentMembershipId) || asId(membership),
    amount: money(item.amount),
    allocatedAmount,
    unallocatedAmount: money(Math.max(0, money(item.amount) - allocatedAmount)),
    recognizedAmount,
    excludedVoidAmount,
    excludedInvalidOrderAmount,
    currency: text(item.currency) || 'AFN',
    paymentMethod: text(item.paymentMethod),
    payerType: text(item.payerType),
    allocationMode: text(item.allocationMode),
    referenceNo: text(item.referenceNo),
    paidAt: item.paidAt || item.createdAt || null,
    status: text(item.status),
    approvalStage: text(item.approvalStage),
    reviewedAt: item.reviewedAt || null,
    reviewNote: text(item.reviewNote),
    rejectReason: text(item.rejectReason),
    receivedBy: formatActor(item.receivedBy),
    reviewedBy: formatActor(item.reviewedBy),
    note: text(item.note),
    fileUrl: text(item.fileUrl) || text(sourceReceipt?.fileUrl),
    allocations,
    approvalTrail: Array.isArray(item.approvalTrail) ? item.approvalTrail.map((entry) => ({
      level: text(entry?.level),
      action: text(entry?.action),
      by: formatActor(entry?.by),
      at: entry?.at || null,
      note: text(entry?.note),
      reason: text(entry?.reason)
    })) : [],
    followUp: item.followUp ? {
      assignedLevel: text(item.followUp.assignedLevel),
      status: text(item.followUp.status),
      note: text(item.followUp.note),
      updatedBy: formatActor(item.followUp.updatedBy),
      updatedAt: item.followUp.updatedAt || null
    } : null,
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass,
    academicYear,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const formatLegacyReceipt = (value, membership = null, canonicalPaymentId = null) => {
  const item = toPlain(value) || {};
  const bill = toPlain(item.bill);
  const explicitFeeType = text(item.feeType).toLowerCase();
  const billFeeTypes = bill
    ? Array.from(new Set(formatLineItems(bill, 'tuition').filter((entry) => entry.netAmount > 0 || entry.grossAmount > 0).map((entry) => entry.feeType)))
    : [];
  const feeType = LINE_ITEM_TYPES.includes(explicitFeeType)
    ? explicitFeeType
    : billFeeTypes.length === 1
      ? billFeeTypes[0]
      : 'other';
  const schoolClass = formatSchoolClass(item.classId) || formatSchoolClass(bill?.classId) || formatSchoolClass(membership?.classId);
  return {
    id: asId(item),
    recordType: 'legacy_finance_receipt',
    billId: asId(bill) || asId(item.bill),
    billNumber: text(bill?.billNumber),
    canonicalPaymentId: canonicalPaymentId ? asId(canonicalPaymentId) : null,
    mirroredToCanonical: Boolean(canonicalPaymentId),
    studentMembershipId: asId(item.studentMembershipId) || asId(bill?.studentMembershipId) || asId(membership),
    amount: money(item.amount),
    feeType,
    paymentMethod: text(item.paymentMethod),
    referenceNo: text(item.referenceNo),
    paidAt: item.paidAt || item.createdAt || null,
    status: text(item.status),
    approvalStage: text(item.approvalStage),
    reviewedAt: item.reviewedAt || null,
    reviewNote: text(item.reviewNote),
    rejectReason: text(item.rejectReason),
    reviewedBy: formatActor(item.reviewedBy),
    note: text(item.note),
    fileUrl: text(item.fileUrl),
    approvalTrail: Array.isArray(item.approvalTrail) ? item.approvalTrail.map((entry) => ({
      level: text(entry?.level),
      action: text(entry?.action),
      by: formatActor(entry?.by),
      at: entry?.at || null,
      note: text(entry?.note),
      reason: text(entry?.reason)
    })) : [],
    followUp: item.followUp ? {
      assignedLevel: text(item.followUp.assignedLevel),
      status: text(item.followUp.status),
      note: text(item.followUp.note),
      updatedBy: formatActor(item.followUp.updatedBy),
      updatedAt: item.followUp.updatedAt || null
    } : null,
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass,
    academicYear: formatAcademicYear(item.academicYearId)
      || formatAcademicYear(bill?.academicYearId)
      || formatAcademicYear(membership?.academicYearId)
      || schoolClass?.academicYear
      || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const formatDiscount = (value, membership = null) => {
  const item = toPlain(value) || {};
  return {
    id: asId(item),
    recordType: 'discount',
    feeOrderId: asId(item.feeOrderId) || null,
    sourceBillId: asId(item.sourceBillId) || null,
    studentMembershipId: asId(item.studentMembershipId) || asId(membership),
    discountType: text(item.discountType),
    targetScope: text(item.targetScope),
    coverageMode: text(item.coverageMode),
    amount: money(item.amount),
    percentage: money(item.percentage),
    durationMode: text(item.durationMode),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    reason: text(item.reason),
    status: text(item.status),
    source: text(item.source),
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass: formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId),
    academicYear: formatAcademicYear(item.academicYearId) || formatAcademicYear(membership?.academicYearId),
    createdBy: formatActor(item.createdBy),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const formatRelief = (value, membership = null) => {
  const item = toPlain(value) || {};
  return {
    id: asId(item),
    recordType: 'finance_relief',
    sourceModel: text(item.sourceModel),
    sourceKey: text(item.sourceKey),
    sourceDiscountId: asId(item.sourceDiscountId) || null,
    sourceExemptionId: asId(item.sourceExemptionId) || null,
    feeOrderId: asId(item.feeOrderId) || null,
    studentMembershipId: asId(item.studentMembershipId) || asId(membership),
    reliefType: text(item.reliefType),
    scope: text(item.scope),
    coverageMode: text(item.coverageMode),
    amount: money(item.amount),
    percentage: money(item.percentage),
    sponsorName: text(item.sponsorName),
    reason: text(item.reason),
    note: text(item.note),
    status: text(item.status),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    approvedBy: formatActor(item.approvedBy),
    createdBy: formatActor(item.createdBy),
    cancelledBy: formatActor(item.cancelledBy),
    cancelledAt: item.cancelledAt || null,
    cancelReason: text(item.cancelReason),
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass: formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId),
    academicYear: formatAcademicYear(item.academicYearId) || formatAcademicYear(membership?.academicYearId),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const formatExemption = (value, membership = null) => {
  const item = toPlain(value) || {};
  return {
    id: asId(item),
    recordType: 'fee_exemption',
    studentMembershipId: asId(item.studentMembershipId) || asId(membership),
    exemptionType: text(item.exemptionType),
    scope: text(item.scope),
    amount: money(item.amount),
    percentage: money(item.percentage),
    reason: text(item.reason),
    note: text(item.note),
    status: text(item.status),
    approvedBy: formatActor(item.approvedBy),
    createdBy: formatActor(item.createdBy),
    cancelledBy: formatActor(item.cancelledBy),
    cancelledAt: item.cancelledAt || null,
    cancelReason: text(item.cancelReason),
    student: formatStudent(item, membership),
    membership: formatMembership(membership),
    schoolClass: formatSchoolClass(item.classId) || formatSchoolClass(membership?.classId),
    academicYear: formatAcademicYear(item.academicYearId) || formatAcademicYear(membership?.academicYearId),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
};

const buildUnifiedReliefHistory = ({ discounts = [], reliefs = [], exemptions = [] } = {}) => {
  const mirroredDiscountIds = new Set();
  const mirroredExemptionIds = new Set();
  const seenCanonicalKeys = new Set();
  const unified = [];

  reliefs.forEach((item) => {
    const discountId = asId(item?.sourceDiscountId);
    const exemptionId = asId(item?.sourceExemptionId);
    if (discountId) mirroredDiscountIds.add(discountId);
    if (exemptionId) mirroredExemptionIds.add(exemptionId);

    const canonicalKey = text(item?.sourceKey)
      || (discountId ? `discount:${discountId}` : '')
      || (exemptionId ? `fee_exemption:${exemptionId}` : '')
      || `finance_relief:${asId(item)}`;
    if (seenCanonicalKeys.has(canonicalKey)) return;
    seenCanonicalKeys.add(canonicalKey);
    unified.push(item);
  });

  discounts.forEach((item) => {
    const id = asId(item);
    if (!id || mirroredDiscountIds.has(id) || seenCanonicalKeys.has(`discount:${id}`)) return;
    const discountType = text(item?.discountType).toLowerCase();
    unified.push({
      ...item,
      recordType: 'discount',
      sourceModel: 'discount',
      sourceKey: `discount:${id}`,
      sourceDiscountId: id,
      reliefType: ['discount', 'waiver', 'penalty', 'manual'].includes(discountType) ? discountType : 'discount',
      scope: 'tuition',
      coverageMode: text(item?.coverageMode).toLowerCase() === 'percent' ? 'percent' : 'fixed'
    });
  });

  exemptions.forEach((item) => {
    const id = asId(item);
    if (!id || mirroredExemptionIds.has(id) || seenCanonicalKeys.has(`fee_exemption:${id}`)) return;
    const full = text(item?.exemptionType).toLowerCase() === 'full';
    const scope = text(item?.scope).toLowerCase() || 'all';
    const percentage = money(item?.percentage);
    const amount = money(item?.amount);
    unified.push({
      ...item,
      recordType: 'fee_exemption',
      sourceModel: 'fee_exemption',
      sourceKey: `fee_exemption:${id}`,
      sourceExemptionId: id,
      reliefType: full ? (scope === 'all' ? 'free_student' : 'scholarship_full') : 'scholarship_partial',
      scope,
      coverageMode: full ? 'full' : (percentage > 0 && amount <= 0 ? 'percent' : 'fixed'),
      percentage: full ? 100 : percentage,
      amount: full ? 0 : amount
    });
  });

  return unified.sort((left, right) => (
    time(right?.createdAt || right?.startDate) - time(left?.createdAt || left?.startDate)
  ));
};

const emptyFinancialTotals = () => ({
  orderCount: 0,
  gross: 0,
  reduction: 0,
  penalty: 0,
  net: 0,
  paid: 0,
  outstanding: 0
});

const addFinancialLine = (target, line = {}) => {
  target.gross = money(target.gross + Number(line.grossAmount || 0));
  target.reduction = money(target.reduction + Number(line.reductionAmount || 0));
  target.penalty = money(target.penalty + Number(line.penaltyAmount || 0));
  target.net = money(target.net + Number(line.netAmount || 0));
  target.paid = money(target.paid + Number(line.paidAmount || 0));
  target.outstanding = money(target.outstanding + Number(line.balanceAmount || 0));
};

const categoryForFeeType = (feeType) => {
  const normalized = normalizeFinanceFeeType(feeType, 'other');
  if (normalized === 'tuition' || normalized === 'admission') return normalized;
  return 'other';
};

const summarizeOrders = (orders = [], { now = new Date() } = {}) => {
  const byStatus = ORDER_STATUSES.reduce((summary, status) => ({ ...summary, [status]: 0 }), {});
  const byFeeType = LINE_ITEM_TYPES.reduce((summary, feeType) => ({ ...summary, [feeType]: emptyFinancialTotals() }), {});
  const byCategory = {
    tuition: emptyFinancialTotals(),
    admission: emptyFinancialTotals(),
    other: emptyFinancialTotals()
  };
  const categoryOrderIds = { tuition: new Set(), admission: new Set(), other: new Set() };
  const feeTypeOrderIds = LINE_ITEM_TYPES.reduce((summary, feeType) => ({ ...summary, [feeType]: new Set() }), {});
  const totals = emptyFinancialTotals();
  const voidedTotals = emptyFinancialTotals();
  let officialOrders = 0;
  let directOrders = 0;
  let dueNowOutstanding = 0;

  orders.forEach((order) => {
    const status = ORDER_STATUSES.includes(order.status) ? order.status : 'new';
    byStatus[status] += 1;
    if (order.sourceBillId) officialOrders += 1;
    else directOrders += 1;
    const targetTotals = status === 'void' ? voidedTotals : totals;
    targetTotals.orderCount += 1;
    if (status !== 'void'
      && order.outstandingAmount > 0
      && isFinanceDueDateReached(order.dueDate, now)) {
      dueNowOutstanding = money(dueNowOutstanding + order.outstandingAmount);
    }
    order.lineItems.forEach((line) => {
      addFinancialLine(targetTotals, line);
      if (status === 'void') return;
      const feeType = LINE_ITEM_TYPES.includes(line.feeType) ? line.feeType : 'other';
      const category = categoryForFeeType(feeType);
      addFinancialLine(byFeeType[feeType], line);
      addFinancialLine(byCategory[category], line);
      feeTypeOrderIds[feeType].add(order.id);
      categoryOrderIds[category].add(order.id);
    });
  });

  LINE_ITEM_TYPES.forEach((feeType) => {
    byFeeType[feeType].orderCount = feeTypeOrderIds[feeType].size;
  });
  Object.keys(byCategory).forEach((category) => {
    byCategory[category].orderCount = categoryOrderIds[category].size;
  });

  const openOrders = orders.filter((order) => ['new', 'partial', 'overdue'].includes(order.status));
  const oldestOpen = [...openOrders].sort((left, right) => (
    time(left.dueDate, Number.MAX_SAFE_INTEGER) - time(right.dueDate, Number.MAX_SAFE_INTEGER)
  ))[0] || null;

  return {
    count: orders.length,
    activeCount: orders.length - byStatus.void,
    officialOrders,
    directOrders,
    openOrders: openOrders.length,
    overdueOrders: byStatus.overdue,
    voidOrders: byStatus.void,
    byStatus,
    totals,
    voidedTotals,
    byFeeType,
    byCategory,
    dueNowOutstanding,
    oldestOpenDueDate: oldestOpen?.dueDate || null,
    oldestOpenOrderId: oldestOpen?.id || null
  };
};

const emptyPaymentStatus = () => ({
  count: 0,
  amount: 0,
  allocatedAmount: 0,
  unallocatedAmount: 0,
  recognizedAmount: 0,
  excludedVoidAmount: 0,
  excludedInvalidOrderAmount: 0,
  byCategory: { tuition: 0, admission: 0, other: 0 }
});

const summarizePayments = (payments = []) => {
  const byStatus = PAYMENT_STATUSES.reduce((summary, status) => ({ ...summary, [status]: emptyPaymentStatus() }), {});
  payments.forEach((payment) => {
    const status = PAYMENT_STATUSES.includes(payment.status) ? payment.status : 'pending';
    const target = byStatus[status];
    target.count += 1;
    target.amount = money(target.amount + payment.amount);
    target.allocatedAmount = money(target.allocatedAmount + payment.allocatedAmount);
    target.unallocatedAmount = money(target.unallocatedAmount + payment.unallocatedAmount);
    target.recognizedAmount = money(target.recognizedAmount + payment.recognizedAmount);
    target.excludedVoidAmount = money(target.excludedVoidAmount + payment.excludedVoidAmount);
    target.excludedInvalidOrderAmount = money(target.excludedInvalidOrderAmount + payment.excludedInvalidOrderAmount);
    payment.allocations.forEach((allocation) => {
      const category = categoryForFeeType(allocation.feeType);
      target.byCategory[category] = money(target.byCategory[category] + allocation.amount);
    });
  });
  return {
    count: payments.length,
    byStatus,
    approvedAmount: byStatus.approved.amount,
    recognizedApprovedAmount: byStatus.approved.recognizedAmount,
    pendingAmount: byStatus.pending.amount,
    rejectedAmount: byStatus.rejected.amount
  };
};

const summarizeLegacyReceipts = (receipts = []) => {
  const byStatus = PAYMENT_STATUSES.reduce((summary, status) => ({
    ...summary,
    [status]: { count: 0, amount: 0, byCategory: { tuition: 0, admission: 0, other: 0 } }
  }), {});
  receipts.forEach((receipt) => {
    const status = PAYMENT_STATUSES.includes(receipt.status) ? receipt.status : 'pending';
    const category = categoryForFeeType(receipt.feeType);
    byStatus[status].count += 1;
    byStatus[status].amount = money(byStatus[status].amount + receipt.amount);
    byStatus[status].byCategory[category] = money(byStatus[status].byCategory[category] + receipt.amount);
  });
  return {
    count: receipts.length,
    mirrored: receipts.filter((receipt) => receipt.mirroredToCanonical).length,
    unmirrored: receipts.filter((receipt) => !receipt.mirroredToCanonical).length,
    unmirroredApprovedAmount: money(receipts
      .filter((receipt) => !receipt.mirroredToCanonical && receipt.status === 'approved')
      .reduce((sum, receipt) => sum + receipt.amount, 0)),
    byStatus
  };
};

const solarMonthKey = (value = null) => {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', { year: 'numeric', month: '2-digit' }).formatToParts(date);
    const year = Number(parts.find((item) => item.type === 'year')?.value || 0);
    const month = Number(parts.find((item) => item.type === 'month')?.value || 0);
    return year && month ? `${year}-${String(month).padStart(2, '0')}` : '';
  } catch {
    return '';
  }
};

const parsePagination = (query = {}) => {
  const all = String(query.all || '').toLowerCase() === 'true';
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(Number(query.limit) || 100)));
  return { all, page: all ? 1 : page, limit };
};

const paginate = (items = [], pagination = {}) => {
  const rows = Array.isArray(items) ? items : [];
  if (pagination.all) {
    return {
      items: rows,
      meta: {
        mode: 'all',
        page: 1,
        limit: rows.length,
        total: rows.length,
        totalPages: rows.length ? 1 : 0,
        hasNextPage: false,
        hasPreviousPage: false
      }
    };
  }
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Number(pagination.limit) || 100));
  const offset = (page - 1) * limit;
  const totalPages = rows.length ? Math.ceil(rows.length / limit) : 0;
  return {
    items: rows.slice(offset, offset + limit),
    meta: {
      mode: 'paged',
      page,
      limit,
      total: rows.length,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0
    }
  };
};

const buildStudentFinanceScope = ({
  schoolId,
  membershipIds = [],
  studentCoreIds = [],
  userIds = [],
  linkedIdentity = [],
  legacyOwnership = []
} = {}) => {
  const scopedMembershipIds = uniqueIds(membershipIds);
  const identity = [
    ...(scopedMembershipIds.length ? [{ studentMembershipId: { $in: scopedMembershipIds } }] : []),
    ...(uniqueIds(studentCoreIds).length ? [{ studentId: { $in: uniqueIds(studentCoreIds) } }] : []),
    ...(uniqueIds(userIds).length ? [{ student: { $in: uniqueIds(userIds) } }] : []),
    ...linkedIdentity
  ];
  const legacyProof = [
    ...(scopedMembershipIds.length ? [{ studentMembershipId: { $in: scopedMembershipIds } }] : []),
    ...legacyOwnership
  ];
  return {
    $and: [
      { $or: identity.length ? identity : [{ _id: { $exists: false } }] },
      {
        $or: [
          { schoolId },
          {
            $and: [
              { schoolId: null },
              { $or: legacyProof.length ? legacyProof : [{ _id: { $exists: false } }] }
            ]
          }
        ]
      }
    ]
  };
};

const withMembership = (row, membershipMap) => membershipMap.get(asId(row?.studentMembershipId)) || null;

const populateMembershipQuery = (query) => query
  .populate('studentId')
  .populate('student', 'name email')
  .populate('course')
  .populate({ path: 'classId', populate: { path: 'academicYearId' } })
  .populate('academicYearId')
  .populate('academicYear');

const applyStatusFilter = (items, requested, allowed) => {
  const values = text(requested).split(',').map((value) => value.trim().toLowerCase()).filter((value) => allowed.includes(value));
  if (!values.length) return items;
  const accepted = new Set(values);
  return items.filter((item) => accepted.has(text(item.status).toLowerCase()));
};

const buildLedgerEvents = ({ orders, legacyBills, payments, legacyReceipts, financeReliefs }) => [
  ...orders.map((item) => ({
    id: `fee_order:${item.id}`,
    recordType: item.recordType,
    recordId: item.id,
    eventDate: item.issuedAt || item.createdAt,
    status: item.status,
    title: item.title || item.orderNumber,
    amount: item.amountDue,
    outstandingAmount: item.outstandingAmount,
    studentMembershipId: item.studentMembershipId,
    schoolClass: item.schoolClass,
    academicYear: item.academicYear
  })),
  ...legacyBills.filter((item) => !item.canonicalOrderId).map((item) => ({
    id: `legacy_bill:${item.id}`,
    recordType: item.recordType,
    recordId: item.id,
    eventDate: item.issuedAt || item.createdAt,
    status: item.status,
    title: item.title || item.billNumber,
    amount: item.amountDue,
    outstandingAmount: item.outstandingAmount,
    canonicalOrderMissing: true,
    studentMembershipId: item.studentMembershipId,
    schoolClass: item.schoolClass,
    academicYear: item.academicYear
  })),
  ...payments.map((item) => ({
    id: `fee_payment:${item.id}`,
    recordType: item.recordType,
    recordId: item.id,
    eventDate: item.paidAt || item.createdAt,
    status: item.status,
    title: item.paymentNumber,
    amount: item.amount,
    recognizedAmount: item.recognizedAmount,
    studentMembershipId: item.studentMembershipId,
    schoolClass: item.schoolClass,
    academicYear: item.academicYear
  })),
  ...legacyReceipts.filter((item) => !item.mirroredToCanonical).map((item) => ({
    id: `legacy_receipt:${item.id}`,
    recordType: item.recordType,
    recordId: item.id,
    eventDate: item.paidAt || item.createdAt,
    status: item.status,
    title: item.billNumber || item.referenceNo,
    amount: item.amount,
    mirroredToCanonical: item.mirroredToCanonical,
    studentMembershipId: item.studentMembershipId,
    schoolClass: item.schoolClass,
    academicYear: item.academicYear
  })),
  ...financeReliefs.map((item) => ({
    id: `${item.recordType}:${item.id}`,
    recordType: item.recordType,
    recordId: item.id,
    eventDate: item.createdAt,
    status: item.status,
    title: item.reason || item.reliefType,
    amount: item.amount,
    percentage: item.percentage,
    studentMembershipId: item.studentMembershipId,
    schoolClass: item.schoolClass,
    academicYear: item.academicYear
  }))
].sort((left, right) => time(right.eventDate) - time(left.eventDate));

async function getStudentOpenAccount({ studentId, schoolId, query = {}, now = new Date() } = {}) {
  if (!mongoose.isValidObjectId(studentId)) throw invalidObjectIdError('student_open_account_student_id_invalid');
  if (!mongoose.isValidObjectId(schoolId)) throw invalidObjectIdError('student_open_account_school_id_invalid');

  const scopedClassIds = await SchoolClass.find({ schoolId }).distinct('_id');
  const memberships = await populateMembershipQuery(StudentMembership.find({
    $and: [
      { $or: [{ student: studentId }, { studentId }] },
      {
        $or: [
          { schoolId },
          { $and: [{ schoolId: null }, { classId: { $in: scopedClassIds } }] }
        ]
      }
    ]
  }))
    .sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1 })
    .lean();

  if (!memberships.length) throw notFoundError('student_open_account_membership_not_found');

  const membershipIds = memberships.map((item) => item._id);
  const membershipMap = new Map(memberships.map((item) => [asId(item), item]));
  const studentCoreIds = uniqueIds(memberships.map((item) => item.studentId?._id || item.studentId));
  const userIds = uniqueIds(memberships.map((item) => item.student?._id || item.student));
  const baseScope = buildStudentFinanceScope({ schoolId, membershipIds, studentCoreIds, userIds });

  const [rawOrders, rawLegacyBills] = await Promise.all([
    FeeOrder.find(baseScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('course')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('sourceBillId', 'billNumber status')
      .sort({ dueDate: 1, issuedAt: 1, createdAt: 1 })
      .lean(),
    FinanceBill.find(baseScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('course')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ dueDate: 1, issuedAt: 1, createdAt: 1 })
      .lean()
  ]);

  const orderIds = rawOrders.map((item) => item._id);
  const billIds = rawLegacyBills.map((item) => item._id);
  const paymentScope = buildStudentFinanceScope({
    schoolId,
    membershipIds,
    studentCoreIds,
    userIds,
    linkedIdentity: orderIds.length ? [
      { feeOrderId: { $in: orderIds } },
      { 'allocations.feeOrderId': { $in: orderIds } }
    ] : [],
    legacyOwnership: orderIds.length ? [
      { feeOrderId: { $in: orderIds } },
      { 'allocations.feeOrderId': { $in: orderIds } }
    ] : []
  });
  const receiptScope = buildStudentFinanceScope({
    schoolId,
    membershipIds,
    studentCoreIds,
    userIds,
    linkedIdentity: billIds.length ? [{ bill: { $in: billIds } }] : [],
    legacyOwnership: billIds.length ? [{ bill: { $in: billIds } }] : []
  });
  const registryScope = buildStudentFinanceScope({ schoolId, membershipIds, studentCoreIds, userIds });

  const [rawPayments, rawReceipts, rawDiscounts, rawReliefs, rawExemptions] = await Promise.all([
    FeePayment.find(paymentScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('feeOrderId')
      .populate('allocations.feeOrderId')
      .populate('sourceReceiptId')
      .populate('receivedBy', 'name orgRole adminLevel')
      .populate('reviewedBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
    FinanceReceipt.find(receiptScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('bill')
      .populate('reviewedBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ paidAt: -1, createdAt: -1 })
      .lean(),
    Discount.find({ $and: [registryScope, { source: { $in: ['manual', 'migration'] } }] })
      .populate('studentId')
      .populate('student', 'name email')
      .populate('feeOrderId', 'orderNumber status')
      .populate('sourceBillId', 'billNumber status')
      .populate('createdBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ createdAt: -1 })
      .lean(),
    FinanceRelief.find(registryScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('feeOrderId', 'orderNumber status')
      .populate('approvedBy', 'name orgRole adminLevel')
      .populate('createdBy', 'name orgRole adminLevel')
      .populate('cancelledBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ createdAt: -1 })
      .lean(),
    FeeExemption.find(registryScope)
      .populate('studentId')
      .populate('student', 'name email')
      .populate('approvedBy', 'name orgRole adminLevel')
      .populate('createdBy', 'name orgRole adminLevel')
      .populate('cancelledBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ createdAt: -1 })
      .lean()
  ]);

  const canonicalOrderByBillId = new Map(rawOrders
    .filter((item) => asId(item.sourceBillId))
    .map((item) => [asId(item.sourceBillId), item._id]));
  const canonicalPaymentByReceiptId = new Map(rawPayments
    .filter((item) => asId(item.sourceReceiptId))
    .map((item) => [asId(item.sourceReceiptId), item._id]));

  const orders = rawOrders.map((item) => formatOrder(item, withMembership(item, membershipMap), { now }))
    .sort((left, right) => time(right.issuedAt || right.createdAt) - time(left.issuedAt || left.createdAt));
  const legacyBills = rawLegacyBills.map((item) => formatOrder(item, withMembership(item, membershipMap), {
    legacy: true,
    canonicalOrderId: canonicalOrderByBillId.get(asId(item)),
    now
  })).sort((left, right) => time(right.issuedAt || right.createdAt) - time(left.issuedAt || left.createdAt));
  const allowedOrderIds = new Set(orderIds.map(asId));
  const payments = rawPayments.map((item) => formatPayment(item, withMembership(item, membershipMap), { now, allowedOrderIds }));
  const legacyReceipts = rawReceipts.map((item) => formatLegacyReceipt(
    item,
    withMembership(item, membershipMap) || membershipMap.get(asId(item.bill?.studentMembershipId)) || null,
    canonicalPaymentByReceiptId.get(asId(item))
  ));
  const discounts = rawDiscounts.map((item) => formatDiscount(item, withMembership(item, membershipMap)));
  const reliefs = rawReliefs.map((item) => formatRelief(item, withMembership(item, membershipMap)));
  const exemptions = rawExemptions.map((item) => formatExemption(item, withMembership(item, membershipMap)));
  const financeReliefs = buildUnifiedReliefHistory({ discounts, reliefs, exemptions });

  const orderSummary = summarizeOrders(orders, { now });
  const paymentSummary = summarizePayments(payments);
  const legacyReceiptSummary = summarizeLegacyReceipts(legacyReceipts);
  const currentMonthKey = solarMonthKey(now);
  const activeTuitionOrders = orders.filter((item) => item.status !== 'void' && item.lineItems.some((line) => line.feeType === 'tuition'));
  const currentTuitionOrders = activeTuitionOrders.filter((item) => solarMonthKey(item.dueDate) === currentMonthKey);
  const previousOpenTuitionOrders = activeTuitionOrders.filter((item) => {
    const monthKey = solarMonthKey(item.dueDate);
    return item.outstandingAmount > 0 && monthKey && currentMonthKey && monthKey < currentMonthKey;
  });
  const dueTuitionOrders = activeTuitionOrders.filter((item) => {
    const monthKey = solarMonthKey(item.dueDate);
    return item.outstandingAmount > 0 && monthKey && currentMonthKey && monthKey <= currentMonthKey;
  });
  const tuitionLineSum = (rows, key) => money(rows.reduce((sum, order) => sum + order.lineItems
    .filter((line) => line.feeType === 'tuition')
    .reduce((lineSum, line) => lineSum + Number(line[key] || 0), 0), 0));

  const filteredOrders = applyStatusFilter(orders, query.orderStatus, ORDER_STATUSES);
  const filteredPayments = applyStatusFilter(payments, query.paymentStatus, PAYMENT_STATUSES);
  const filteredReceipts = applyStatusFilter(legacyReceipts, query.receiptStatus, PAYMENT_STATUSES);
  const pagination = parsePagination(query);
  const pagedOrders = paginate(filteredOrders, pagination);
  const pagedPayments = paginate(filteredPayments, pagination);
  const pagedReceipts = paginate(filteredReceipts, pagination);
  const pagedLegacyBills = paginate(legacyBills, pagination);
  const pagedDiscounts = paginate(discounts, pagination);
  const pagedReliefs = paginate(reliefs, pagination);
  const pagedExemptions = paginate(exemptions, pagination);
  const pagedFinanceReliefs = paginate(financeReliefs, pagination);
  const ledgerEvents = buildLedgerEvents({ orders, legacyBills, payments, legacyReceipts, financeReliefs });
  const pagedLedger = paginate(ledgerEvents, pagination);

  const summary = {
    currency: orders.find((item) => item.currency)?.currency || payments.find((item) => item.currency)?.currency || 'AFN',
    orders: orderSummary,
    payments: paymentSummary,
    legacyReceipts: legacyReceiptSummary,
    registry: {
      discounts: discounts.length,
      activeDiscounts: discounts.filter((item) => item.status === 'active').length,
      fixedDiscountAmount: money(discounts.filter((item) => item.coverageMode !== 'percent').reduce((sum, item) => sum + item.amount, 0)),
      reliefs: reliefs.length,
      activeReliefs: reliefs.filter((item) => item.status === 'active').length,
      exemptions: exemptions.length,
      activeExemptions: exemptions.filter((item) => item.status === 'active').length,
      unifiedEntries: financeReliefs.length
    },
    reconciliation: {
      legacyBills: legacyBills.length,
      legacyBillsWithoutCanonicalOrder: legacyBills.filter((item) => !item.canonicalOrderId).length,
      legacyReceipts: legacyReceipts.length,
      legacyReceiptsWithoutCanonicalPayment: legacyReceiptSummary.unmirrored,
      unmirroredApprovedReceiptAmount: legacyReceiptSummary.unmirroredApprovedAmount,
      paymentAllocationsOutsideSchoolScope: payments.reduce((sum, item) => (
        sum + item.allocations.filter((allocation) => allocation.scopeViolation).length
      ), 0),
      approvedAmountExcludedForInvalidOrder: paymentSummary.byStatus.approved.excludedInvalidOrderAmount,
      approvedAmountExcludedForVoidOrder: paymentSummary.byStatus.approved.excludedVoidAmount
    },
    byFeeType: orderSummary.byFeeType,
    byCategory: orderSummary.byCategory,
    totalGross: orderSummary.totals.gross,
    totalNet: orderSummary.totals.net,
    totalPaid: orderSummary.totals.paid,
    totalOutstanding: orderSummary.totals.outstanding,
    dueNowOutstanding: orderSummary.dueNowOutstanding,
    studentFee: tuitionLineSum(currentTuitionOrders, 'grossAmount'),
    pastArrears: tuitionLineSum(previousOpenTuitionOrders, 'balanceAmount'),
    totalDiscount: tuitionLineSum(activeTuitionOrders, 'reductionAmount'),
    currentMonthPayable: tuitionLineSum(currentTuitionOrders, 'balanceAmount'),
    payableFee: tuitionLineSum(dueTuitionOrders, 'balanceAmount'),
    overdueOrders: orderSummary.overdueOrders,
    openMonths: new Set(dueTuitionOrders.map((item) => `${solarMonthKey(item.dueDate) || item.periodLabel || item.id}:${item.studentMembershipId}`)).size,
    oldestDueDate: orderSummary.oldestOpenDueDate,
    oldestMembershipId: orders.find((item) => item.id === orderSummary.oldestOpenOrderId)?.studentMembershipId || null,
    autoGeneratedOrders: orders.filter((item) => item.source === 'system').length,
    pendingPayments: paymentSummary.byStatus.pending.count,
    paymentPolicy: 'oldest_due_first'
  };

  const membershipRows = memberships.map(formatMembership);
  const displayItemMap = new Map();
  [...previousOpenTuitionOrders, ...currentTuitionOrders].forEach((item) => {
    if (item.id) displayItemMap.set(item.id, item);
  });
  const openItems = [...displayItemMap.values()].sort((left, right) => (
    time(left.dueDate, Number.MAX_SAFE_INTEGER) - time(right.dueDate, Number.MAX_SAFE_INTEGER)
  ));

  return {
    readOnly: true,
    generatedAt: now.toISOString(),
    schoolId: asId(schoolId),
    student: formatStudent(memberships[0]),
    membership: membershipRows[0],
    memberships: membershipRows,
    summary,
    items: openItems,
    orders: pagedOrders.items,
    payments: pagedPayments.items,
    legacyBills: pagedLegacyBills.items,
    legacyReceipts: pagedReceipts.items,
    discounts: pagedDiscounts.items,
    reliefs: pagedReliefs.items,
    exemptions: pagedExemptions.items,
    financeReliefs: pagedFinanceReliefs.items,
    ledger: pagedLedger.items,
    pagination: {
      orders: pagedOrders.meta,
      payments: pagedPayments.meta,
      legacyBills: pagedLegacyBills.meta,
      legacyReceipts: pagedReceipts.meta,
      discounts: pagedDiscounts.meta,
      reliefs: pagedReliefs.meta,
      exemptions: pagedExemptions.meta,
      financeReliefs: pagedFinanceReliefs.meta,
      ledger: pagedLedger.meta
    },
    filters: {
      orderStatus: text(query.orderStatus),
      paymentStatus: text(query.paymentStatus),
      receiptStatus: text(query.receiptStatus)
    },
    arrearsSync: {
      created: 0,
      skipped: 0,
      memberships: [],
      mode: 'read_only'
    }
  };
}

module.exports = {
  buildUnifiedReliefHistory,
  buildStudentFinanceScope,
  formatOrder,
  formatPayment,
  getStudentOpenAccount,
  paginate,
  parsePagination,
  summarizeOrders,
  summarizePayments
};
