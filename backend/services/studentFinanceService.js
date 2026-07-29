require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/Course');
require('../models/SchoolClass');
require('../models/StudentCore');
require('../models/StudentMembership');
require('../models/User');
require('../models/ExamSession');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const ExamSession = require('../models/ExamSession');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const TransportFee = require('../models/TransportFee');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const {
  refreshFinanceBillStatus,
  syncStudentFinanceFromFinanceBill,
  syncStudentFinanceFromFinanceReceipt
} = require('../utils/studentFinanceSync');
const { suppressAutomaticFinanceBillSync } = require('../utils/financeSyncControl');
const { deriveLinkScope } = require('../utils/financeLinkScope');
const { formatFinanceCode } = require('../utils/latinFinanceCode');
const {
  buildClassDiscountGroupKey,
  buildDiscountRegistryIdentity,
  buildDiscountRegistryKey,
  buildManualDiscountSourceKey,
  groupDuplicateDiscounts,
  groupRepairableDiscounts
} = require('../utils/discountRegistryIdentity');
const {
  LINE_ITEM_TYPES,
  buildFeeBreakdownFromLineItems,
  deriveFinanceOrderStatus,
  getFinanceFeeScopeBalanceAmount,
  getFinanceFeeScopeGrossAmount,
  normalizeAdjustmentScope,
  normalizeFinanceFeeType,
  normalizeFinanceLineItems
} = require('../utils/financeLineItems');
const { recognizePayments } = require('../utils/financeRevenueRecognition');
const { buildPaymentOrderLinkFilter } = require('../utils/paymentClassScope');
const {
  buildFinanceReliefPayloadFromDiscount,
  buildFinanceReliefPayloadFromExemption,
  toReliefPreviewRecord
} = require('../utils/financeRelief');
const {
  syncFinanceReliefFromDiscount,
  syncFinanceReliefFromFeeExemption
} = require('../utils/financeReliefSync');
const { buildMembershipFinanceAnomalies } = require('./financeAnomalyService');
const { assertFinancePeriodWritable } = require('./financePeriodGuardService');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: false });
  }
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return null;
  return String(value);
}

function normalizeDateValue(value = null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function formatAcademicYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    isActive: Boolean(item.isActive)
  };
}

function formatAssessmentPeriod(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    termType: normalizeText(item.termType)
  };
}

function formatSchoolClass(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    gradeLevel: normalizeText(item.gradeLevel),
    section: normalizeText(item.section),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatCourse(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    kind: normalizeText(item.kind)
  };
}

function formatStudentIdentityFromMembership(item = {}) {
  const studentCore = toPlain(item.studentId);
  const user = toPlain(item.student);
  return {
    studentId: studentCore ? String(studentCore._id || '') : '',
    userId: user ? String(user._id || '') : normalizeNullableId(item.student),
    fullName: normalizeText(studentCore?.fullName) || normalizeText(user?.name),
    email: normalizeText(studentCore?.email) || normalizeText(user?.email)
  };
}

function formatMembership(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    status: normalizeText(item.status),
    enrolledAt: item.enrolledAt || null,
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatExamSession(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    status: normalizeText(item.status),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    schoolClass: formatSchoolClass(item.classId),
    examType: item.examTypeId ? {
      id: String(item.examTypeId._id || item.examTypeId || ''),
      title: normalizeText(item.examTypeId.title),
      code: normalizeText(item.examTypeId.code)
    } : null
  };
}

function formatFeeOrder(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const normalizedLineItems = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    paymentBreakdown: item.paymentBreakdown,
    defaultType: item.orderType
  });
  const lineItems = normalizedLineItems.map((entry) => ({
        feeType: normalizeText(entry?.feeType),
        label: normalizeText(entry?.label),
        sourcePlanId: normalizeNullableId(entry?.sourcePlanId),
        periodKey: normalizeText(entry?.periodKey),
        grossAmount: Number(entry?.grossAmount || 0),
        reductionAmount: Number(entry?.reductionAmount || 0),
        penaltyAmount: Number(entry?.penaltyAmount || 0),
        netAmount: Number(entry?.netAmount || 0),
        paidAmount: Number(entry?.paidAmount || 0),
        balanceAmount: Number(entry?.balanceAmount || 0),
        status: normalizeText(entry?.status)
      }));
  const feeBreakdown = buildFeeBreakdownFromLineItems(lineItems);
  const amountOriginal = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.grossAmount || 0), 0));
  const amountDue = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.netAmount || 0), 0));
  const amountPaid = roundMoney(item.amountPaid);
  const outstandingAmount = Math.max(0, roundMoney(amountDue - amountPaid));
  const status = deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal,
    amountDue,
    amountPaid,
    dueDate: item.dueDate
  });
  return {
    id: String(item._id || ''),
    sourceBillId: normalizeNullableId(item.sourceBillId),
    orderNumber: formatFinanceCode(normalizeText(item.orderNumber)),
    title: normalizeText(item.title),
    orderType: normalizeText(item.orderType),
    source: normalizeText(item.source),
    linkScope: deriveLinkScope({ linkScope: item.linkScope, studentMembershipId: item.studentMembershipId, classId: item.classId }),
    status,
    periodType: normalizeText(item.periodType),
    periodLabel: normalizeText(item.periodLabel),
    currency: normalizeText(item.currency),
    amountOriginal,
    amountDue,
    amountPaid,
    paymentBreakdown: item.paymentBreakdown || {},
    outstandingAmount,
    lineItems,
    feeBreakdown,
    issuedAt: item.issuedAt || null,
    dueDate: item.dueDate || null,
    paidAt: status === 'paid' ? (item.paidAt || null) : null,
    note: normalizeText(item.note),
    adjustments: Array.isArray(item.adjustments)
      ? item.adjustments.map((entry) => ({
          type: normalizeText(entry?.type),
          scope: normalizeAdjustmentScope(entry),
          amount: Number(entry?.amount || 0),
          reason: normalizeText(entry?.reason),
          createdAt: entry?.createdAt || null
        }))
      : [],
    installments: Array.isArray(item.installments)
      ? item.installments.map((entry) => ({
          installmentNo: Number(entry?.installmentNo || 0),
          dueDate: entry?.dueDate || null,
          amount: Number(entry?.amount || 0),
          paidAmount: Number(entry?.paidAmount || 0),
          status: normalizeText(entry?.status),
          paidAt: entry?.paidAt || null
        }))
      : [],
    voidReason: normalizeText(item.voidReason),
    voidedAt: item.voidedAt || null,
    voidedBy: formatActorLite(item.voidedBy),
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    course: formatCourse(item.course)
  };
}

function formatFeeOrderLite(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const normalizedLineItems = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    paymentBreakdown: item.paymentBreakdown,
    defaultType: item.orderType
  });
  const lineItems = normalizedLineItems.map((entry) => ({
        feeType: normalizeText(entry?.feeType),
        label: normalizeText(entry?.label),
        grossAmount: Number(entry?.grossAmount || 0),
        reductionAmount: Number(entry?.reductionAmount || 0),
        penaltyAmount: Number(entry?.penaltyAmount || 0),
        netAmount: Number(entry?.netAmount || 0),
        paidAmount: Number(entry?.paidAmount || 0),
        balanceAmount: Number(entry?.balanceAmount || 0),
        status: normalizeText(entry?.status)
      }));
  const amountOriginal = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.grossAmount || 0), 0));
  const amountDue = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.netAmount || 0), 0));
  const amountPaid = roundMoney(item.amountPaid);
  const status = deriveFinanceOrderStatus({
    currentStatus: item.status,
    amountOriginal,
    amountDue,
    amountPaid,
    dueDate: item.dueDate
  });
  return {
    id: String(item._id || item.id || ''),
    studentMembershipId: normalizeNullableId(item.studentMembershipId),
    sourceBillId: normalizeNullableId(item.sourceBillId),
    orderNumber: formatFinanceCode(normalizeText(item.orderNumber)),
    title: normalizeText(item.title),
    orderType: normalizeText(item.orderType),
    status,
    currency: normalizeText(item.currency),
    amountDue,
    amountPaid,
    paymentBreakdown: item.paymentBreakdown || {},
    outstandingAmount: Math.max(0, roundMoney(amountDue - amountPaid)),
    lineItems,
    feeBreakdown: buildFeeBreakdownFromLineItems(lineItems),
    dueDate: item.dueDate || null,
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatActorLite(value) {
  const item = toPlain(value);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    name: normalizeText(item.name),
    adminLevel: normalizeText(item.adminLevel),
    orgRole: normalizeText(item.orgRole)
  };
}

function formatReceiptApprovalTrail(entries = []) {
  return Array.isArray(entries)
    ? entries.map((entry) => ({
        level: normalizeText(entry?.level),
        action: normalizeText(entry?.action),
        by: formatActorLite(entry?.by),
        at: entry?.at || null,
        note: normalizeText(entry?.note),
        reason: normalizeText(entry?.reason)
      }))
    : [];
}

function formatReceiptFollowUp(value = null) {
  const item = toPlain(value);
  if (!item) return null;
  return {
    assignedLevel: normalizeText(item.assignedLevel),
    status: normalizeText(item.status),
    note: normalizeText(item.note),
    updatedBy: formatActorLite(item.updatedBy),
    updatedAt: item.updatedAt || null,
    history: Array.isArray(item.history)
      ? item.history.map((entry) => ({
          assignedLevel: normalizeText(entry?.assignedLevel),
          status: normalizeText(entry?.status),
          note: normalizeText(entry?.note),
          updatedBy: formatActorLite(entry?.updatedBy),
          updatedAt: entry?.updatedAt || null
        }))
      : []
  };
}

function formatSourceReceipt(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    amount: Number(item.amount || 0),
    feeType: normalizeText(item.feeType),
    paymentMethod: normalizeText(item.paymentMethod),
    referenceNo: normalizeText(item.referenceNo),
    paidAt: item.paidAt || null,
    fileUrl: normalizeText(item.fileUrl),
    note: normalizeText(item.note),
    status: normalizeText(item.status),
    approvalStage: normalizeText(item.approvalStage),
    reviewNote: normalizeText(item.reviewNote),
    rejectReason: normalizeText(item.rejectReason),
    reviewedAt: item.reviewedAt || null,
    reviewedBy: formatActorLite(item.reviewedBy),
    approvalTrail: formatReceiptApprovalTrail(item.approvalTrail),
    followUp: formatReceiptFollowUp(item.followUp)
  };
}

function formatFeePaymentAllocation(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const feeOrder = formatFeeOrderLite(item.feeOrderId);
  return {
    feeOrderId: normalizeNullableId(item.feeOrderId?._id || item.feeOrderId),
    feeType: normalizeText(item.feeType),
    amount: Number(item.amount || 0),
    title: normalizeText(item.title) || normalizeText(feeOrder?.title),
    orderNumber: formatFinanceCode(normalizeText(item.orderNumber) || normalizeText(feeOrder?.orderNumber)),
    feeOrder
  };
}

function formatFeePayment(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const sourceReceipt = formatSourceReceipt(item.sourceReceiptId);
  const approvalTrail = Array.isArray(item.approvalTrail) && item.approvalTrail.length
    ? formatReceiptApprovalTrail(item.approvalTrail)
    : sourceReceipt?.approvalTrail || [];
  const followUp = item.followUp ? formatReceiptFollowUp(item.followUp) : sourceReceipt?.followUp || null;
  const reviewedBy = formatActorLite(item.reviewedBy) || sourceReceipt?.reviewedBy || null;
  const allocations = Array.isArray(item.allocations)
    ? item.allocations.map(formatFeePaymentAllocation).filter(Boolean)
    : [];
  return {
    id: String(item._id || ''),
    paymentNumber: formatFinanceCode(normalizeText(item.paymentNumber)),
    payerType: normalizeText(item.payerType) || 'student_guardian',
    receivedBy: formatActorLite(item.receivedBy),
    amount: Number(item.amount || 0),
    currency: normalizeText(item.currency),
    paymentMethod: normalizeText(item.paymentMethod),
    allocationMode: normalizeText(item.allocationMode) || (allocations.length > 1 ? 'manual' : 'single_order'),
    referenceNo: normalizeText(item.referenceNo),
    linkScope: deriveLinkScope({ linkScope: item.linkScope, studentMembershipId: item.studentMembershipId, classId: item.classId }),
    status: normalizeText(item.status),
    approvalStage: normalizeText(item.approvalStage),
    paidAt: item.paidAt || null,
    fileUrl: normalizeText(item.fileUrl),
    note: normalizeText(item.note),
    feeOrderId: normalizeNullableId(item.feeOrderId),
    feeOrder: formatFeeOrderLite(item.feeOrderId),
    allocations,
    source: normalizeText(item.source),
    sourceReceiptId: normalizeNullableId(item.sourceReceiptId),
    receipt: sourceReceipt,
    reviewedBy,
    reviewedAt: item.reviewedAt || null,
    reviewNote: normalizeText(item.reviewNote),
    rejectReason: normalizeText(item.rejectReason) || normalizeText(sourceReceipt?.rejectReason),
    approvalTrail,
    followUp,
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}
function formatDiscount(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    feeOrderId: normalizeNullableId(item.feeOrderId),
    studentMembershipId: normalizeNullableId(item.studentMembershipId),
    discountType: normalizeText(item.discountType),
    targetScope: normalizeText(item.targetScope) || 'student',
    groupKey: normalizeText(item.groupKey),
    coverageMode: normalizeText(item.coverageMode) || 'fixed',
    amount: Number(item.amount || 0),
    percentage: Number(item.percentage || 0),
    feeScope: normalizeText(item.discountType) === 'penalty' ? 'all' : 'tuition',
    reason: normalizeText(item.reason),
    durationMode: normalizeText(item.durationMode) || 'academic_year',
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    linkScope: deriveLinkScope({ linkScope: item.linkScope, studentMembershipId: item.studentMembershipId, classId: item.classId }),
    status: normalizeText(item.status),
    source: normalizeText(item.source),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

async function syncDiscountOpenBills(discount = null) {
  if (!discount?._id || !discount?.studentMembershipId) return;
  const marker = `[discount:${String(discount._id)}]`;
  const bills = await FinanceBill.find({
    studentMembershipId: discount.studentMembershipId,
    $or: [
      { status: { $in: ['new', 'partial', 'overdue'] } },
      { 'adjustments.reason': { $regex: `^\\[discount:${String(discount._id)}\\]` } }
    ]
  });
  for (const bill of bills) {
    await assertFinancePeriodWritable({
      schoolId: bill.schoolId,
      academicYearId: bill.academicYearId,
      dateValue: bill.issuedAt || bill.dueDate
    });
    const dueDate = normalizeDateValue(bill.dueDate);
    const periodStart = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), 1) : null;
    const periodEnd = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0, 23, 59, 59, 999) : null;
    const startsAfterBill = discount.startDate && periodEnd && new Date(discount.startDate) > periodEnd;
    const endsBeforeBill = discount.endDate && periodStart && new Date(discount.endDate) < periodStart;
    bill.adjustments = (bill.adjustments || []).filter((row) => !normalizeText(row.reason).startsWith(marker));
    const isPenalty = discount.discountType === 'penalty';
    if (discount.status === 'active' && !startsAfterBill && !endsBeforeBill) {
      const discountBase = isPenalty
        ? Number(bill.amountOriginal || 0)
        : getFinanceFeeScopeGrossAmount(bill, 'tuition');
      const amount = discount.coverageMode === 'percent'
        ? Math.min(discountBase, discountBase * (Number(discount.percentage || 0) / 100))
        : Math.min(discountBase, Number(discount.amount || 0));
      if (amount > 0) {
        bill.adjustments.push({
          type: isPenalty ? 'penalty' : 'discount',
          scope: isPenalty ? 'all' : 'tuition',
          amount,
          reason: `${marker} ${normalizeText(discount.reason)}`.trim(),
          createdBy: discount.createdBy || null,
          createdAt: discount.createdAt || new Date()
        });
      }
    }
    refreshFinanceBillStatus(bill);
    suppressAutomaticFinanceBillSync(bill);
    await bill.save();
    await syncStudentFinanceFromFinanceBill(bill).catch(() => null);
  }

  const orders = await FeeOrder.find({
    studentMembershipId: discount.studentMembershipId,
    sourceBillId: null,
    $or: [
      { status: { $in: ['new', 'partial', 'overdue'] } },
      { 'adjustments.reason': { $regex: `^\\[discount:${String(discount._id)}\\]` } }
    ]
  });
  for (const order of orders) {
    await assertFinancePeriodWritable({
      schoolId: order.schoolId,
      financialYearId: order.financialYearId,
      academicYearId: order.academicYearId,
      dateValue: order.issuedAt || order.dueDate
    });
    const dueDate = normalizeDateValue(order.dueDate);
    const periodStart = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth(), 1) : null;
    const periodEnd = dueDate ? new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0, 23, 59, 59, 999) : null;
    const startsAfterOrder = discount.startDate && periodEnd && new Date(discount.startDate) > periodEnd;
    const endsBeforeOrder = discount.endDate && periodStart && new Date(discount.endDate) < periodStart;
    order.adjustments = (order.adjustments || []).filter((row) => !normalizeText(row.reason).startsWith(marker));
    const isPenalty = discount.discountType === 'penalty';
    if (discount.status === 'active' && !startsAfterOrder && !endsBeforeOrder) {
      const discountBase = isPenalty
        ? Number(order.amountOriginal || 0)
        : getFinanceFeeScopeGrossAmount(order, 'tuition');
      const amount = discount.coverageMode === 'percent'
        ? Math.min(discountBase, discountBase * (Number(discount.percentage || 0) / 100))
        : Math.min(discountBase, Number(discount.amount || 0));
      if (amount > 0) {
        order.adjustments.push({
          type: isPenalty ? 'penalty' : 'discount',
          scope: isPenalty ? 'all' : 'tuition',
          amount: roundMoney(amount),
          reason: `${marker} ${normalizeText(discount.reason)}`.trim(),
          createdBy: discount.createdBy || null,
          createdAt: discount.createdAt || new Date()
        });
      }
    }
    await order.save();
  }
}

async function syncExemptionOpenBills(exemption = null) {
  if (!exemption?._id || !exemption?.studentMembershipId) return;
  const marker = `[exemption:${String(exemption._id)}]`;
  const scope = normalizeText(exemption.scope) || 'all';
  const bills = await FinanceBill.find({
    studentMembershipId: exemption.studentMembershipId,
    $or: [
      { status: { $in: ['new', 'partial', 'overdue'] } },
      { 'adjustments.reason': { $regex: `^\\[exemption:${String(exemption._id)}\\]` } }
    ]
  });

  for (const bill of bills) {
    await assertFinancePeriodWritable({
      schoolId: bill.schoolId,
      academicYearId: bill.academicYearId,
      dateValue: bill.issuedAt || bill.dueDate
    });
    bill.adjustments = (bill.adjustments || []).filter((row) => !normalizeText(row.reason).startsWith(marker));
    if (exemption.status === 'active') {
      const baseAmount = scope === 'all'
        ? Number(bill.amountOriginal || 0)
        : (Array.isArray(bill.lineItems) ? bill.lineItems : [])
          .filter((item) => normalizeText(item?.feeType) === scope)
          .reduce((sum, item) => sum + (Number(item?.grossAmount || item?.netAmount || 0) || 0), 0);
      const effectiveBase = scope === 'all'
        ? (baseAmount > 0 ? baseAmount : Number(bill.amountOriginal || 0))
        : baseAmount;
      const amount = exemption.exemptionType === 'full'
        ? effectiveBase
        : Number(exemption.amount || 0) > 0
          ? Math.min(effectiveBase, Number(exemption.amount || 0))
          : Math.min(effectiveBase, effectiveBase * (Number(exemption.percentage || 0) / 100));
      if (amount > 0) {
        bill.adjustments.push({
          type: 'waiver',
          scope,
          amount: roundMoney(amount),
          reason: `${marker} ${normalizeText(exemption.reason)}`.trim(),
          createdBy: exemption.createdBy || exemption.approvedBy || null,
          createdAt: exemption.createdAt || new Date()
        });
      }
    }
    refreshFinanceBillStatus(bill);
    suppressAutomaticFinanceBillSync(bill);
    await bill.save();
    await syncStudentFinanceFromFinanceBill(bill).catch(() => null);
  }

  const orders = await FeeOrder.find({
    studentMembershipId: exemption.studentMembershipId,
    sourceBillId: null,
    $or: [
      { status: { $in: ['new', 'partial', 'overdue'] } },
      { 'adjustments.reason': { $regex: `^\\[exemption:${String(exemption._id)}\\]` } }
    ]
  });
  for (const order of orders) {
    await assertFinancePeriodWritable({
      schoolId: order.schoolId,
      financialYearId: order.financialYearId,
      academicYearId: order.academicYearId,
      dateValue: order.issuedAt || order.dueDate
    });
    order.adjustments = (order.adjustments || []).filter((row) => !normalizeText(row.reason).startsWith(marker));
    if (exemption.status === 'active') {
      const baseAmount = scope === 'all'
        ? Number(order.amountOriginal || 0)
        : (Array.isArray(order.lineItems) ? order.lineItems : [])
          .filter((item) => normalizeText(item?.feeType) === scope)
          .reduce((sum, item) => sum + (Number(item?.grossAmount || item?.netAmount || 0) || 0), 0);
      const effectiveBase = scope === 'all'
        ? (baseAmount > 0 ? baseAmount : Number(order.amountOriginal || 0))
        : baseAmount;
      const amount = exemption.exemptionType === 'full'
        ? effectiveBase
        : Number(exemption.amount || 0) > 0
          ? Math.min(effectiveBase, Number(exemption.amount || 0))
          : Math.min(effectiveBase, effectiveBase * (Number(exemption.percentage || 0) / 100));
      if (amount > 0) {
        order.adjustments.push({
          type: 'waiver',
          scope,
          amount: roundMoney(amount),
          reason: `${marker} ${normalizeText(exemption.reason)}`.trim(),
          createdBy: exemption.createdBy || exemption.approvedBy || null,
          createdAt: exemption.createdAt || new Date()
        });
      }
    }
    await order.save();
  }
}

function normalizeDiscountCoverage(payload = {}) {
  const coverageMode = normalizeText(payload.coverageMode) === 'percent' ? 'percent' : 'fixed';
  const amount = roundMoney(payload.amount);
  const percentage = Math.max(0, Math.min(100, Number(payload.percentage) || 0));
  if (coverageMode === 'percent' && percentage <= 0) {
    throw new Error('student_finance_discount_percentage_invalid');
  }
  if (coverageMode === 'fixed' && amount <= 0) {
    throw new Error('student_finance_discount_amount_invalid');
  }
  return {
    coverageMode,
    amount: coverageMode === 'percent' ? 0 : amount,
    percentage: coverageMode === 'percent' ? percentage : 0
  };
}

function resolveAnnualDiscountWindow(membership = null, payload = {}) {
  const requestedStartDate = normalizeDateValue(payload.startDate);
  const requestedEndDate = normalizeDateValue(payload.endDate);
  const membershipStartDate = normalizeDateValue(membership?.enrolledAt || membership?.joinedAt);
  const academicYearStartDate = normalizeDateValue(membership?.academicYearId?.startDate);
  const academicYearEndDate = normalizeDateValue(membership?.academicYearId?.endDate);
  const startDate = requestedStartDate || membershipStartDate || academicYearStartDate || new Date();
  const endDate = academicYearEndDate || requestedEndDate || null;
  return { startDate, endDate };
}

function resolvePeriodDiscountWindow(payload = {}) {
  const startDate = normalizeDateValue(payload.startDate);
  const endDate = normalizeDateValue(payload.endDate);
  if (!startDate || !endDate) {
    throw new Error('student_finance_discount_period_required');
  }
  if (endDate.getTime() < startDate.getTime()) {
    throw new Error('student_finance_discount_period_invalid');
  }
  return { startDate, endDate };
}

function resolveDiscountDurationWindow(membership = null, payload = {}) {
  const durationMode = normalizeText(payload.durationMode) === 'custom_period'
    ? 'custom_period'
    : 'academic_year';
  const window = durationMode === 'custom_period'
    ? resolvePeriodDiscountWindow(payload)
    : resolveAnnualDiscountWindow(membership, payload);
  return { durationMode, ...window };
}

function formatTransportFee(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    title: normalizeText(item.title),
    frequency: normalizeText(item.frequency),
    amount: Number(item.amount || 0),
    dueDay: Number(item.dueDay || 0),
    currency: normalizeText(item.currency),
    status: normalizeText(item.status),
    note: normalizeText(item.note),
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId)
  };
}

function formatFeeExemption(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || ''),
    exemptionType: normalizeText(item.exemptionType),
    scope: normalizeText(item.scope),
    amount: Number(item.amount || 0),
    percentage: Number(item.percentage || 0),
    reason: normalizeText(item.reason),
    note: normalizeText(item.note),
    status: normalizeText(item.status),
    linkScope: deriveLinkScope({ linkScope: item.linkScope, studentMembershipId: item.studentMembershipId, classId: item.classId }),
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId),
    approvedBy: item.approvedBy ? { id: String(item.approvedBy._id || item.approvedBy), name: normalizeText(item.approvedBy.name) } : null,
    createdBy: item.createdBy ? { id: String(item.createdBy._id || item.createdBy), name: normalizeText(item.createdBy.name) } : null,
    cancelledBy: item.cancelledBy ? { id: String(item.cancelledBy._id || item.cancelledBy), name: normalizeText(item.cancelledBy.name) } : null,
    cancelledAt: item.cancelledAt || null,
    cancelReason: normalizeText(item.cancelReason)
  };
}

function formatFinanceRelief(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    sourceModel: normalizeText(item.sourceModel),
    sourceKey: normalizeText(item.sourceKey),
    feeOrderId: normalizeNullableId(item.feeOrderId),
    feeOrder: formatFeeOrderLite(item.feeOrderId),
    studentMembershipId: normalizeNullableId(item.studentMembershipId),
    linkScope: deriveLinkScope({ linkScope: item.linkScope, studentMembershipId: item.studentMembershipId, classId: item.classId }),
    reliefType: normalizeText(item.reliefType),
    scope: normalizeText(item.scope),
    coverageMode: normalizeText(item.coverageMode),
    amount: Number(item.amount || 0),
    percentage: Number(item.percentage || 0),
    sponsorName: normalizeText(item.sponsorName),
    reason: normalizeText(item.reason),
    note: normalizeText(item.note),
    status: normalizeText(item.status),
    student: formatStudentIdentityFromMembership(item),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId),
    approvedBy: item.approvedBy ? { id: String(item.approvedBy._id || item.approvedBy), name: normalizeText(item.approvedBy.name) } : null,
    createdBy: item.createdBy ? { id: String(item.createdBy._id || item.createdBy), name: normalizeText(item.createdBy.name) } : null,
    cancelledBy: item.cancelledBy ? { id: String(item.cancelledBy._id || item.cancelledBy), name: normalizeText(item.cancelledBy.name) } : null,
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    cancelledAt: item.cancelledAt || null,
    cancelReason: normalizeText(item.cancelReason),
    sourceUpdatedAt: item.sourceUpdatedAt || null,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

async function resolveMembershipForFinanceRegistry(payload = {}) {
  const membershipId = normalizeNullableId(payload.studentMembershipId);
  const schoolId = normalizeNullableId(payload.schoolId);
  if (membershipId) {
    return StudentMembership.findOne({
      _id: membershipId,
      ...(schoolId ? { schoolId } : {})
    })
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId');
  }

  const student = normalizeNullableId(payload.student);
  const studentId = normalizeNullableId(payload.studentId);
  const classId = normalizeNullableId(payload.classId);
  const academicYearId = normalizeNullableId(payload.academicYearId);
  if ((!student && !studentId) || !classId || !academicYearId) return null;

  return StudentMembership.findOne({
    ...(student && studentId
      ? { $or: [{ student }, { studentId }] }
      : student
        ? { student }
        : { studentId }),
    ...(schoolId ? { schoolId } : {}),
    classId,
    academicYearId,
    isCurrent: true,
    status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
  })
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId');
}

const OPEN_ORDER_STATUSES = Object.freeze(['new', 'partial', 'overdue']);

function buildOrderQuery(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.studentId)) query.studentId = filters.studentId;
  if (normalizeNullableId(filters.student)) query.student = filters.student;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.assessmentPeriodId)) query.assessmentPeriodId = filters.assessmentPeriodId;
  if (normalizeText(filters.linkScope)) query.linkScope = normalizeText(filters.linkScope);
  const view = normalizeText(filters.view).toLowerCase();
  if (view === 'open') query.status = { $in: [...OPEN_ORDER_STATUSES] };
  else if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  return query;
}

async function listStudentFinanceReferenceData(filters = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  const schoolFilter = schoolId ? { schoolId } : {};
  const [academicYears, schoolClasses, memberships, sessions] = await Promise.all([
    AcademicYear.find(schoolFilter).sort({ isActive: -1, sequence: 1, createdAt: 1 }),
    SchoolClass.find({ ...schoolFilter, status: { $ne: 'archived' } }).populate('academicYearId').sort({ title: 1, createdAt: 1 }),
    StudentMembership.find({ ...schoolFilter, isCurrent: true })
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ createdAt: -1 })
      .limit(200),
    ExamSession.find(schoolFilter).populate('academicYearId').populate('assessmentPeriodId').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('examTypeId').sort({ createdAt: -1 }).limit(200)
  ]);

  return {
    academicYears: academicYears.map(formatAcademicYear),
    classes: schoolClasses.map(formatSchoolClass),
    memberships: memberships.map(formatMembership),
    sessions: sessions.map(formatExamSession)
  };
}

async function listFeeOrders(filters = {}) {
  const items = await FeeOrder.find(buildOrderQuery(filters))
    .populate('studentId')
    .populate('student', 'name email')
    .populate('course', 'title kind')
    .populate('voidedBy', 'name orgRole adminLevel')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('assessmentPeriodId')
    .sort({ dueDate: -1, createdAt: -1 });
  return items.map(formatFeeOrder);
}

function resolveMembershipSchoolId(membership = {}) {
  return normalizeNullableId(membership?.schoolId)
    || normalizeNullableId(membership?.classId?.schoolId)
    || normalizeNullableId(membership?.academicYearId?.schoolId)
    || '';
}

function buildStudentSchoolOpenOrderQuery({ membership = null, schoolId = '' } = {}) {
  const normalizedSchoolId = normalizeNullableId(schoolId);
  if (!normalizedSchoolId) throw new Error('student_finance_school_scope_required');

  const student = normalizeNullableId(membership?.student?._id || membership?.student);
  const studentId = normalizeNullableId(membership?.studentId?._id || membership?.studentId);
  const identityFilters = [
    ...(student ? [{ student }] : []),
    ...(studentId ? [{ studentId }] : [])
  ];
  if (!identityFilters.length) throw new Error('student_finance_membership_not_found');

  return {
    schoolId: normalizedSchoolId,
    status: { $ne: 'void' },
    $or: identityFilters
  };
}

function buildCanonicalPaymentOrderSnapshot(doc = null) {
  const item = toPlain(doc);
  if (!item || normalizeText(item.status).toLowerCase() === 'void') return null;

  const lineItems = normalizeFinanceLineItems({
    lineItems: item.lineItems,
    amountOriginal: item.amountOriginal,
    adjustments: item.adjustments,
    amountPaid: item.amountPaid,
    paymentBreakdown: item.paymentBreakdown,
    defaultType: item.orderType
  });
  const amountOriginal = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.grossAmount || 0), 0));
  const amountDue = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.netAmount || 0), 0));
  const amountPaid = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.paidAmount || 0), 0));
  const outstandingAmount = roundMoney(lineItems.reduce((sum, entry) => sum + Number(entry?.balanceAmount || 0), 0));

  return {
    ...item,
    lineItems,
    amountOriginal,
    amountDue,
    amountPaid,
    outstandingAmount,
    status: deriveFinanceOrderStatus({
      currentStatus: item.status,
      amountOriginal,
      amountDue,
      amountPaid,
      dueDate: item.dueDate
    })
  };
}

function withFeeOrderPopulates(query) {
  return query
    .populate('studentId')
    .populate('student', 'name email')
    .populate('course', 'title kind')
    .populate('voidedBy', 'name orgRole adminLevel')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('assessmentPeriodId');
}

function deriveOpenPaymentOrderSnapshots(items = []) {
  return sortOpenOrdersForAllocation(
    (Array.isArray(items) ? items : [])
      .map(buildCanonicalPaymentOrderSnapshot)
      .filter((item) => item && Number(item.outstandingAmount || 0) > 0)
  );
}

async function getOpenFeeOrderDocsForMembership(studentMembershipId = '') {
  if (!normalizeNullableId(studentMembershipId)) return [];
  const items = await withFeeOrderPopulates(FeeOrder.find({
    studentMembershipId,
    status: { $ne: 'void' }
  }));
  return deriveOpenPaymentOrderSnapshots(items);
}

async function getOpenFeeOrderDocsForStudentSchool({ membership = null, schoolId = '' } = {}) {
  const query = buildStudentSchoolOpenOrderQuery({ membership, schoolId });
  const items = await withFeeOrderPopulates(FeeOrder.find(query));
  return deriveOpenPaymentOrderSnapshots(items);
}

function buildOrderSortKey(order = {}) {
  const dueDate = normalizeDateValue(order?.dueDate);
  const createdDate = normalizeDateValue(order?.createdAt || order?.issuedAt);
  return [
    dueDate ? dueDate.getTime() : Number.MAX_SAFE_INTEGER,
    createdDate ? createdDate.getTime() : Number.MAX_SAFE_INTEGER
  ];
}

function sortOpenOrdersForAllocation(items = []) {
  return [...items].sort((left, right) => {
    const [leftDue, leftCreated] = buildOrderSortKey(left);
    const [rightDue, rightCreated] = buildOrderSortKey(right);
    if (leftDue !== rightDue) return leftDue - rightDue;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;
    return String(left?._id || '').localeCompare(String(right?._id || ''));
  });
}

function buildPaymentNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PAY-${stamp}-${suffix}`;
}

function resolvePaymentAllocationMode(payload = {}) {
  const preferred = normalizeText(payload.allocationMode);
  if (['manual', 'auto_oldest_due', 'auto_selected', 'single_order'].includes(preferred)) return preferred;
  if (Array.isArray(payload.allocations) && payload.allocations.length) return 'manual';
  if (normalizeNullableId(payload.feeOrderId)) return 'single_order';
  if (Array.isArray(payload.selectedFeeOrderIds) && payload.selectedFeeOrderIds.length) return 'auto_selected';
  return 'auto_oldest_due';
}

function normalizeSelectedOrderIds(payload = {}) {
  return Array.from(new Set(
    (Array.isArray(payload.selectedFeeOrderIds) ? payload.selectedFeeOrderIds : [])
      .concat(payload.feeOrderId ? [payload.feeOrderId] : [])
      .map((item) => normalizeNullableId(item))
      .filter(Boolean)
  ));
}

function getOpenOrderFeeTypes(order = {}) {
  return Array.from(new Set(
    (Array.isArray(order?.lineItems) ? order.lineItems : [])
      .filter((item) => getFinanceFeeScopeBalanceAmount(order, item?.feeType) > 0)
      .map((item) => normalizeFinanceFeeType(item?.feeType, order?.orderType || 'tuition'))
      .filter((item) => LINE_ITEM_TYPES.includes(item))
  ));
}

function resolveOrderPaymentFeeType(order = {}, preferredFeeType = '') {
  const preferred = normalizeText(preferredFeeType).toLowerCase();
  if (preferred) {
    if (!LINE_ITEM_TYPES.includes(preferred)) return '';
    return getFinanceFeeScopeBalanceAmount(order, preferred) > 0 ? preferred : '';
  }
  const openTypes = getOpenOrderFeeTypes(order);
  if (openTypes.length === 1) return openTypes[0];
  if (normalizeText(order?.orderType) === 'admission' && openTypes.includes('admission')) return 'admission';
  return '';
}

function resolvePaymentAllocations({ openOrders = [], payload = {} } = {}) {
  const amount = roundMoney(payload.amount);
  if (!amount) {
    throw new Error('student_finance_payment_amount_invalid');
  }

  const orderMap = new Map(openOrders.map((item) => [String(item?._id || ''), item]));
  const selectedOrderIds = normalizeSelectedOrderIds(payload);
  const allocationMode = resolvePaymentAllocationMode(payload);
  const rawRequestedFeeType = normalizeText(payload.feeType).toLowerCase();
  const requestedFeeType = LINE_ITEM_TYPES.includes(rawRequestedFeeType) ? rawRequestedFeeType : '';
  if (rawRequestedFeeType && !requestedFeeType) {
    throw new Error('student_finance_payment_fee_type_required');
  }
  if (selectedOrderIds.some((orderId) => !orderMap.has(String(orderId)))) {
    // Do not reveal whether an unscoped id belongs to another student or school.
    throw new Error('student_finance_payment_order_not_found');
  }
  let allocations = [];

  if (allocationMode === 'manual') {
    const manualRows = Array.isArray(payload.allocations) ? payload.allocations : [];
    allocations = manualRows
      .map((item) => ({
        feeOrderId: normalizeNullableId(item?.feeOrderId),
        feeType: normalizeText(item?.feeType || requestedFeeType).toLowerCase(),
        amount: roundMoney(item?.amount)
      }))
      .filter((item) => item.feeOrderId && item.amount > 0);

    if (!allocations.length) {
      throw new Error('student_finance_payment_allocations_required');
    }
    const seen = new Set();
    for (const item of allocations) {
      const order = orderMap.get(String(item.feeOrderId || ''));
      if (!order) throw new Error('student_finance_payment_order_not_found');
      item.feeType = resolveOrderPaymentFeeType(order, item.feeType);
      if (!item.feeType) throw new Error('student_finance_payment_fee_type_required');
      const allocationKey = `${String(item.feeOrderId || '')}:${item.feeType}`;
      if (seen.has(allocationKey)) {
        throw new Error('student_finance_payment_duplicate_allocations');
      }
      seen.add(allocationKey);
      if (item.amount > getFinanceFeeScopeBalanceAmount(order, item.feeType)) {
        throw new Error('student_finance_payment_allocation_exceeds_balance');
      }
    }
  } else {
    if (allocationMode === 'auto_selected' && !selectedOrderIds.length) {
      throw new Error('student_finance_payment_selected_orders_required');
    }
    const unscopedCandidateOrders = selectedOrderIds.length
      ? sortOpenOrdersForAllocation(openOrders.filter((item) => selectedOrderIds.includes(String(item?._id || ''))))
      : sortOpenOrdersForAllocation(openOrders);
    const candidateOrders = unscopedCandidateOrders
      .map((order) => ({
        order,
        feeType: resolveOrderPaymentFeeType(order, requestedFeeType)
      }))
      .filter((item) => item.feeType && getFinanceFeeScopeBalanceAmount(item.order, item.feeType) > 0);

    if (!candidateOrders.length) {
      throw new Error(requestedFeeType ? 'student_finance_payment_fee_scope_not_found' : 'student_finance_payment_fee_type_required');
    }

    const totalCandidateOutstanding = roundMoney(candidateOrders.reduce((sum, item) => (
      sum + getFinanceFeeScopeBalanceAmount(item.order, item.feeType)
    ), 0));
    if (amount > totalCandidateOutstanding) {
      throw new Error('student_finance_payment_exceeds_open_balance');
    }

    let remain = amount;
    for (const candidate of candidateOrders) {
      if (remain <= 0) break;
      const { order, feeType } = candidate;
      const outstandingAmount = getFinanceFeeScopeBalanceAmount(order, feeType);
      if (outstandingAmount <= 0) continue;
      const used = Math.min(outstandingAmount, remain);
      allocations.push({
        feeOrderId: String(order._id || ''),
        feeType,
        amount: used
      });
      remain = roundMoney(remain - used);
    }
  }

  const totalAllocated = roundMoney(allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  if (totalAllocated !== amount) {
    throw new Error(totalAllocated > amount
      ? 'student_finance_payment_allocation_invalid'
      : 'student_finance_payment_unallocated_amount');
  }

  return {
    allocationMode,
    allocations: allocations.map((item) => {
      const order = orderMap.get(String(item.feeOrderId || ''));
      return {
        feeOrderId: String(item.feeOrderId || ''),
        feeType: item.feeType,
        amount: roundMoney(item.amount),
        title: normalizeText(order?.title),
        orderNumber: formatFinanceCode(normalizeText(order?.orderNumber)),
        dueDate: order?.dueDate || null,
        outstandingAmount: getFinanceFeeScopeBalanceAmount(order, item.feeType)
      };
    }),
    totalAllocated
  };
}

async function buildPaymentQuery(filters = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  const query = {};
  if (schoolId) query.schoolId = schoolId;
  if (normalizeNullableId(filters.feeOrderId)) query.feeOrderId = filters.feeOrderId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.studentId)) query.studentId = filters.studentId;
  if (normalizeNullableId(filters.student)) query.student = filters.student;
  if (normalizeText(filters.linkScope)) query.linkScope = normalizeText(filters.linkScope);
  const requestedClassId = normalizeNullableId(filters.classId);
  const requestedAcademicYearId = normalizeNullableId(filters.academicYearId);
  if (requestedClassId) {
    const classOwnershipFilter = { _id: requestedClassId };
    if (schoolId) classOwnershipFilter.schoolId = schoolId;
    const classBelongsToSchool = await SchoolClass.exists(classOwnershipFilter);
    if (!classBelongsToSchool) return { ...query, _id: { $in: [] } };
  }
  if (requestedClassId || requestedAcademicYearId) {
    const scopedOrderFilter = {};
    if (requestedClassId) scopedOrderFilter.classId = requestedClassId;
    if (requestedAcademicYearId) scopedOrderFilter.academicYearId = requestedAcademicYearId;
    const scopedOrders = await FeeOrder.find(scopedOrderFilter).select('_id').lean();
    const scopedOrderIds = scopedOrders.map((item) => item?._id).filter(Boolean);
    Object.assign(query, buildPaymentOrderLinkFilter(scopedOrderIds));
  }
  if (normalizeNullableId(filters.receivedBy)) query.receivedBy = filters.receivedBy;
  if (normalizeText(filters.paymentMethod)) query.paymentMethod = normalizeText(filters.paymentMethod);
  const view = normalizeText(filters.view).toLowerCase();
  if (view === 'inbox') query.status = 'pending';
  else if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.approvalStage)) query.approvalStage = normalizeText(filters.approvalStage);

  if (filters.date || filters.dateFrom || filters.dateTo) {
    query.paidAt = {};
    if (filters.date) {
      const range = buildDayRange(filters.date);
      if (range) {
        query.paidAt.$gte = range.start;
        query.paidAt.$lt = range.end;
      }
    } else {
      const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
      const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;
      if (dateFrom && !Number.isNaN(dateFrom.getTime())) query.paidAt.$gte = dateFrom;
      if (dateTo && !Number.isNaN(dateTo.getTime())) query.paidAt.$lte = dateTo;
    }
    if (!Object.keys(query.paidAt).length) delete query.paidAt;
  }

  return query;
}

async function listFeePayments(filters = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  if (filters.requireSchoolScope === true && !schoolId) {
    throw new Error('student_finance_school_scope_required');
  }
  const query = await buildPaymentQuery(filters);

  const items = await FeePayment.find(query)
    .populate('studentId')
    .populate('student', 'name email')
    .populate('feeOrderId')
    .populate('allocations.feeOrderId')
    .populate('receivedBy', 'name orgRole adminLevel')
    .populate('reviewedBy', 'name orgRole adminLevel')
    .populate('approvalTrail.by', 'name orgRole adminLevel')
    .populate('followUp.updatedBy', 'name orgRole adminLevel')
    .populate('followUp.history.updatedBy', 'name orgRole adminLevel')
    .populate({
      path: 'sourceReceiptId',
      populate: [
        { path: 'reviewedBy', select: 'name orgRole adminLevel' },
        { path: 'followUp.updatedBy', select: 'name orgRole adminLevel' },
        { path: 'followUp.history.updatedBy', select: 'name orgRole adminLevel' },
        { path: 'approvalTrail.by', select: 'name orgRole adminLevel' }
      ]
    })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .sort({ paidAt: -1, createdAt: -1 });
  return buildPaymentReceiptDetails(items.map(formatFeePayment), [], null);
}

function buildPaymentReceiptDetails(payments = [], orders = [], membership = null) {
  const orderMap = new Map((orders || []).map((item) => [String(item?.id || ''), item]).filter((entry) => entry[0]));
  const approvedByOrder = new Map();

  for (const item of payments) {
    if (String(item?.status || '') !== 'approved') continue;
    const allocationRows = Array.isArray(item?.allocations) && item.allocations.length
      ? item.allocations
      : [{ feeOrderId: item?.feeOrder?.id || item?.feeOrderId || '', amount: item?.amount || 0 }];
    for (const allocation of allocationRows) {
      const orderId = String(allocation?.feeOrder?.id || allocation?.feeOrderId || '');
      if (!orderId) continue;
      const bucket = approvedByOrder.get(orderId) || [];
      bucket.push({
        paymentId: item?.id,
        amount: Number(allocation?.amount || 0),
        paidAt: item?.paidAt || null,
        createdAt: item?.createdAt || null
      });
      approvedByOrder.set(orderId, bucket);
    }
  }

  for (const [, bucket] of approvedByOrder) {
    bucket.sort((left, right) => {
      const leftTime = new Date(left?.paidAt || left?.createdAt || 0).getTime();
      const rightTime = new Date(right?.paidAt || right?.createdAt || 0).getTime();
      if (leftTime === rightTime) return String(left?.paymentId || '').localeCompare(String(right?.paymentId || ''));
      return leftTime - rightTime;
    });
  }

  return payments.map((item) => {
    const normalizedAllocations = Array.isArray(item?.allocations) && item.allocations.length
      ? item.allocations.map((allocation) => ({
          ...allocation,
          feeOrder: allocation?.feeOrder || orderMap.get(String(allocation?.feeOrderId || '')) || null
        }))
      : [];
    const primaryAllocation = normalizedAllocations[0] || null;
    const order = orderMap.get(String(primaryAllocation?.feeOrder?.id || primaryAllocation?.feeOrderId || item?.feeOrder?.id || item?.feeOrderId || ''))
      || item?.feeOrder
      || primaryAllocation?.feeOrder
      || null;
    const bucket = approvedByOrder.get(String(order?.id || primaryAllocation?.feeOrderId || item?.feeOrderId || '')) || [];
    let remainingBeforePayment = null;
    let remainingAfterPayment = null;

    if (order && String(item?.status || '') === 'approved' && bucket.length) {
      let runningPaid = 0;
      for (const candidate of bucket) {
        if (String(candidate?.paymentId || '') === String(item?.id || '')) {
          remainingBeforePayment = Math.max(0, Number(order.amountDue || 0) - runningPaid);
          remainingAfterPayment = Math.max(0, remainingBeforePayment - Number(primaryAllocation?.amount || item?.amount || 0));
          break;
        }
        runningPaid += Number(candidate?.amount || 0);
      }
    }

    return {
      ...item,
      receiptDetails: {
        title: order?.title || item?.paymentNumber || 'Receipt',
        paymentNumber: formatFinanceCode(item?.paymentNumber || ''),
        orderNumber: formatFinanceCode(order?.orderNumber || ''),
        orderType: order?.orderType || '',
        studentName: membership?.student?.fullName || item?.student?.fullName || '',
        classTitle: membership?.schoolClass?.title || item?.schoolClass?.title || '',
        academicYearTitle: membership?.academicYear?.title || item?.academicYear?.title || '',
        amount: Number(item?.amount || 0),
        currency: item?.currency || order?.currency || 'AFN',
        paidAt: item?.paidAt || null,
        paymentMethod: item?.paymentMethod || '',
        referenceNo: item?.referenceNo || '',
        status: item?.status || '',
        approvalStage: item?.approvalStage || '',
        fileUrl: item?.receipt?.fileUrl || item?.fileUrl || '',
        note: item?.note || '',
        allocations: normalizedAllocations.map((allocation) => ({
          feeOrderId: allocation?.feeOrderId || '',
          title: allocation?.title || allocation?.feeOrder?.title || '',
          orderNumber: formatFinanceCode(allocation?.orderNumber || allocation?.feeOrder?.orderNumber || ''),
          amount: Number(allocation?.amount || 0),
          outstandingAmount: Number(allocation?.feeOrder?.outstandingAmount || 0)
        })),
        remainingBeforePayment,
        remainingAfterPayment
      }
    };
  });
}

function resolvePaymentDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error('student_finance_payment_date_invalid');
  }
  const futureThreshold = Date.now() + (10 * 60 * 1000);
  if (date.getTime() > futureThreshold) {
    throw new Error('student_finance_payment_date_invalid');
  }
  return date;
}

function buildDayRange(dateValue = '') {
  if (!dateValue) return null;
  const seed = new Date(dateValue);
  if (Number.isNaN(seed.getTime())) return null;
  const start = new Date(seed);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatReceiptPrintModel(item = {}, membership = null) {
  const receipt = item?.receiptDetails || {};
  return {
    paymentId: String(item?.id || ''),
    paymentNumber: formatFinanceCode(receipt.paymentNumber || item?.paymentNumber || ''),
    title: receipt.title || item?.paymentNumber || '',
    orderNumber: formatFinanceCode(receipt.orderNumber || ''),
    studentName: receipt.studentName || membership?.student?.fullName || item?.student?.fullName || '',
    classTitle: receipt.classTitle || membership?.schoolClass?.title || item?.schoolClass?.title || '',
    academicYearTitle: receipt.academicYearTitle || membership?.academicYear?.title || item?.academicYear?.title || '',
    amount: Number(receipt.amount || item?.amount || 0),
    currency: receipt.currency || item?.currency || 'AFN',
    paidAt: receipt.paidAt || item?.paidAt || null,
    paymentMethod: receipt.paymentMethod || item?.paymentMethod || '',
    referenceNo: receipt.referenceNo || item?.referenceNo || '',
    status: receipt.status || item?.status || '',
    approvalStage: receipt.approvalStage || item?.approvalStage || '',
    note: receipt.note || item?.note || '',
    fileUrl: receipt.fileUrl || item?.fileUrl || '',
    remainingBeforePayment: receipt.remainingBeforePayment,
    remainingAfterPayment: receipt.remainingAfterPayment,
    allocations: Array.isArray(receipt.allocations) ? receipt.allocations : [],
    receivedBy: item?.receivedBy || null
  };
}

async function findDuplicateFeePaymentSubmission({
  studentMembershipId = '',
  schoolId = '',
  amount = 0,
  paymentMethod = '',
  paidAt = null,
  referenceNo = '',
  allocations = []
} = {}) {
  const membershipId = normalizeNullableId(studentMembershipId);
  const normalizedSchoolId = normalizeNullableId(schoolId);
  if (!membershipId || !amount || !paidAt) return null;

  const normalizedReference = normalizeText(referenceNo);
  if (normalizedReference) {
    return FeePayment.findOne({
      studentMembershipId: membershipId,
      ...(normalizedSchoolId ? { schoolId: normalizedSchoolId } : {}),
      referenceNo: normalizedReference,
      status: { $in: ['pending', 'approved'] }
    }).select('_id paymentNumber referenceNo paidAt status');
  }

  const range = buildDayRange(paidAt);
  if (!range) return null;
  const normalizedAllocations = Array.isArray(allocations)
    ? allocations
        .map((item) => `${normalizeNullableId(item?.feeOrderId)}:${normalizeText(item?.feeType)}:${roundMoney(item?.amount)}`)
        .filter(Boolean)
        .sort()
    : [];

  const candidates = await FeePayment.find({
    studentMembershipId: membershipId,
    ...(normalizedSchoolId ? { schoolId: normalizedSchoolId } : {}),
    amount: roundMoney(amount),
    paymentMethod: normalizeText(paymentMethod) || 'cash',
    paidAt: { $gte: range.start, $lt: range.end },
    status: { $in: ['pending', 'approved'] }
  }).select('_id paymentNumber paidAt status allocations');

  return candidates.find((item) => {
    const candidateAllocations = Array.isArray(item?.allocations)
      ? item.allocations
          .map((entry) => `${normalizeNullableId(entry?.feeOrderId)}:${normalizeText(entry?.feeType)}:${roundMoney(entry?.amount)}`)
          .filter(Boolean)
          .sort()
      : [];
    return JSON.stringify(candidateAllocations) === JSON.stringify(normalizedAllocations);
  }) || null;
}

async function getFeePaymentReceipt(paymentId = '', filters = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  if (filters.requireSchoolScope === true && !schoolId) {
    throw new Error('student_finance_school_scope_required');
  }
  const item = await FeePayment.findOne({
    _id: paymentId,
    ...(schoolId ? { schoolId } : {})
  })
    .populate('studentId')
    .populate('student', 'name email')
    .populate('feeOrderId')
    .populate('allocations.feeOrderId')
    .populate('receivedBy', 'name orgRole adminLevel')
    .populate('reviewedBy', 'name orgRole adminLevel')
    .populate('approvalTrail.by', 'name orgRole adminLevel')
    .populate('followUp.updatedBy', 'name orgRole adminLevel')
    .populate('followUp.history.updatedBy', 'name orgRole adminLevel')
    .populate({
      path: 'sourceReceiptId',
      populate: [
        { path: 'reviewedBy', select: 'name orgRole adminLevel' },
        { path: 'followUp.updatedBy', select: 'name orgRole adminLevel' },
        { path: 'followUp.history.updatedBy', select: 'name orgRole adminLevel' },
        { path: 'approvalTrail.by', select: 'name orgRole adminLevel' }
      ]
    })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId');
  if (!item) {
    throw new Error('student_finance_payment_not_found');
  }

  let membership = null;
  if (item.studentMembershipId) {
    membership = await StudentMembership.findById(item.studentMembershipId)
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId');
  }

  const formattedPayment = formatFeePayment(item);
  const [withDetails] = buildPaymentReceiptDetails([formattedPayment], [], membership ? formatMembership(membership) : null);
  return {
    item: withDetails,
    membership: membership ? formatMembership(membership) : null,
    receipt: formatReceiptPrintModel(withDetails, membership ? formatMembership(membership) : null),
    generatedAt: new Date().toISOString()
  };
}

const DAILY_CASHIER_ROW_LIMIT = 100;
const CASHIER_PAYMENT_METHODS = ['cash', 'bank_transfer', 'hawala', 'manual', 'gateway', 'other'];

function buildDailyCashierAnalytics(recognizedRows = []) {
  const rows = (Array.isArray(recognizedRows) ? recognizedRows : []).map((row) => {
    const payment = toPlain(row?.payment) || {};
    return {
      id: String(payment._id || payment.id || ''),
      status: normalizeText(payment.status),
      paymentMethod: normalizeText(payment.paymentMethod),
      receivedBy: formatActorLite(payment.receivedBy),
      recognizedAmount: Number(row?.recognizedAmount || 0),
      excludedVoidAmount: Number(row?.excludedVoidAmount || 0),
      excludedMissingOrderAmount: Number(row?.excludedMissingOrderAmount || 0)
    };
  });
  const approvedRows = rows.filter((item) => item.status === 'approved');
  const recognizedAmount = (item) => Number(item?.recognizedAmount || 0);
  const summary = {
    totalPayments: rows.length,
    totalCollected: roundMoney(approvedRows.reduce((sum, item) => sum + recognizedAmount(item), 0)),
    approvedPayments: approvedRows.filter((item) => recognizedAmount(item) > 0).length,
    pendingPayments: rows.filter((item) => item.status === 'pending').length,
    rejectedPayments: rows.filter((item) => item.status === 'rejected').length,
    approvedAmount: roundMoney(approvedRows.reduce((sum, item) => sum + recognizedAmount(item), 0)),
    pendingAmount: roundMoney(rows.filter((item) => item.status === 'pending').reduce((sum, item) => sum + recognizedAmount(item), 0)),
    rejectedAmount: 0,
    excludedVoidAmount: roundMoney(rows.reduce((sum, item) => sum + item.excludedVoidAmount, 0)),
    excludedMissingOrderAmount: roundMoney(rows.reduce((sum, item) => sum + item.excludedMissingOrderAmount, 0))
  };

  const methodTotals = CASHIER_PAYMENT_METHODS.map((method) => ({
    method,
    amount: roundMoney(approvedRows.filter((item) => item.paymentMethod === method).reduce((sum, item) => sum + recognizedAmount(item), 0)),
    count: approvedRows.filter((item) => item.paymentMethod === method && recognizedAmount(item) > 0).length
  })).filter((item) => item.count > 0 || item.amount > 0);

  const cashiers = Array.from(approvedRows.reduce((map, item) => {
    const key = String(item?.receivedBy?.id || 'compatibility');
    const current = map.get(key) || {
      id: key,
      name: item?.receivedBy?.name || 'ثبت سازگاری/سیستمی',
      amount: 0,
      count: 0
    };
    current.amount = roundMoney(current.amount + recognizedAmount(item));
    if (recognizedAmount(item) > 0) current.count += 1;
    map.set(key, current);
    return map;
  }, new Map()).values())
    .filter((item) => item.count > 0 || item.amount > 0)
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0));

  return { summary, methodTotals, cashiers };
}

async function getDailyCashierReport(filters = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  if (filters.requireSchoolScope === true && !schoolId) {
    throw new Error('student_finance_school_scope_required');
  }
  const range = buildDayRange(filters.date || new Date());
  if (!range) {
    throw new Error('student_finance_payment_date_invalid');
  }

  const query = {
    paidAt: { $gte: range.start, $lt: range.end }
  };
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.paymentMethod)) query.paymentMethod = normalizeText(filters.paymentMethod);
  if (normalizeNullableId(filters.receivedBy)) query.receivedBy = normalizeNullableId(filters.receivedBy);
  if (schoolId) query.schoolId = schoolId;

  const rowQuery = FeePayment.find(query)
    .populate('studentId')
    .populate('student', 'name email')
    .populate('feeOrderId')
    .populate('allocations.feeOrderId')
    .populate('receivedBy', 'name orgRole adminLevel')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .sort({ paidAt: -1, createdAt: -1 })
    .limit(DAILY_CASHIER_ROW_LIMIT);

  const totalsQuery = FeePayment.find(query)
    .select('_id amount status paymentMethod receivedBy feeOrderId allocations')
    .populate('receivedBy', 'name orgRole adminLevel')
    .lean();

  const [items, totalPaymentRows] = await Promise.all([rowQuery, totalsQuery]);

  const formattedItems = buildPaymentReceiptDetails(items.map(formatFeePayment), [], null);
  const recognizedRows = await recognizePayments(totalPaymentRows);
  const recognitionById = new Map(recognizedRows.map((row) => [
    String(row.payment?._id || ''),
    row
  ]));
  formattedItems.forEach((item) => {
    const recognition = recognitionById.get(String(item?.id || ''));
    item.recognizedAmount = Number(recognition?.recognizedAmount || 0);
    item.excludedVoidAmount = Number(recognition?.excludedVoidAmount || 0);
    item.excludedMissingOrderAmount = Number(recognition?.excludedMissingOrderAmount || 0);
  });
  const { summary, methodTotals, cashiers } = buildDailyCashierAnalytics(recognizedRows);

  return {
    date: range.start.toISOString().slice(0, 10),
    summary,
    methodTotals,
    cashiers,
    items: formattedItems,
    rowLimit: DAILY_CASHIER_ROW_LIMIT,
    rowsTruncated: totalPaymentRows.length > formattedItems.length,
    generatedAt: new Date().toISOString()
  };
}

function buildStatementRecommendation(packSummary = {}) {
  if (Number(packSummary?.critical || 0) > 0) {
    return 'نیاز به بررسی فوری مالی و تصفیه موردهای حساس وجود دارد.';
  }
  if (Number(packSummary?.warning || 0) > 0) {
    return 'چند مورد نیازمند پیگیری پیش از مهلت پرداخت بعدی است.';
  }
  return 'در این استیتمنت سیگنال حساس مالی دیده نشد.';
}

function buildFeeTypeLedgerSummary(orders = []) {
  return LINE_ITEM_TYPES.reduce((result, feeType) => {
    const totals = (Array.isArray(orders) ? orders : []).reduce((summary, order) => {
      (Array.isArray(order?.lineItems) ? order.lineItems : [])
        .filter((item) => normalizeText(item?.feeType) === feeType)
        .forEach((item) => {
          summary.totalDue += Number(item?.netAmount || 0);
          summary.totalPaid += Number(item?.paidAmount || 0);
          summary.totalOutstanding += Number(item?.balanceAmount || 0);
        });
      return summary;
    }, { totalDue: 0, totalPaid: 0, totalOutstanding: 0 });
    result[feeType] = {
      totalDue: roundMoney(totals.totalDue),
      totalPaid: roundMoney(totals.totalPaid),
      totalOutstanding: roundMoney(totals.totalOutstanding)
    };
    return result;
  }, {});
}

function buildMembershipStatement({ membership = null, summary = {}, orders = [], payments = [], discounts = [], exemptions = [], reliefs = [], transportFees = [], pack = null } = {}) {
  const recognizedAmount = (item) => Number(item?.recognizedAmount ?? item?.amount ?? 0);
  const approvedPayments = payments.filter((item) => item?.status === 'approved' && recognizedAmount(item) > 0);
  const pendingPayments = payments.filter((item) => item?.status === 'pending' && recognizedAmount(item) > 0);
  const totalDiscountAmount = discounts.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const totalExemptionAmount = exemptions.reduce((sum, item) => {
    if (String(item?.exemptionType || '') === 'full') {
      return sum + 0;
    }
    return sum + Number(item?.amount || 0);
  }, 0);
  const totalFixedReliefAmount = reliefs.reduce((sum, item) => (
    String(item?.coverageMode || '') === 'fixed'
      ? sum + Number(item?.amount || 0)
      : sum
  ), 0);
  const percentReliefCount = reliefs.filter((item) => String(item?.coverageMode || '') === 'percent').length;
  const fullReliefCount = reliefs.filter((item) => String(item?.coverageMode || '') === 'full').length;
  const totalTransportAmount = transportFees.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const latestApprovedPayment = approvedPayments[0] || null;
  const latestPendingPayment = pendingPayments[0] || null;
  const currency = latestApprovedPayment?.currency || payments[0]?.currency || orders[0]?.currency || transportFees[0]?.currency || 'AFN';

  return {
    generatedAt: new Date().toISOString(),
    currency,
    membershipLabel: [
      membership?.schoolClass?.title,
      membership?.academicYear?.title
    ].filter(Boolean).join(' - '),
    totals: {
      totalOrders: Number(summary.totalOrders || orders.length || 0),
      totalPayments: Number(summary.totalPayments ?? payments.filter((item) => recognizedAmount(item) > 0).length),
      totalDue: Number(summary.totalDue || 0),
      totalPaid: Number(summary.totalPaid || 0),
      totalOutstanding: Number(summary.totalOutstanding || 0),
      totalReliefs: Number(summary.totalReliefs || reliefs.length || 0),
      totalDiscountAmount: Number(totalDiscountAmount.toFixed(2)),
      totalExemptionAmount: Number(totalExemptionAmount.toFixed(2)),
      totalFixedReliefAmount: Number(totalFixedReliefAmount.toFixed(2)),
      percentReliefCount,
      fullReliefCount,
      totalTransportAmount: Number(totalTransportAmount.toFixed(2)),
      approvedPaymentAmount: Number(approvedPayments.reduce((sum, item) => sum + recognizedAmount(item), 0).toFixed(2)),
      pendingPaymentAmount: Number(pendingPayments.reduce((sum, item) => sum + recognizedAmount(item), 0).toFixed(2))
    },
    latestApprovedPayment: latestApprovedPayment ? {
      paymentNumber: formatFinanceCode(latestApprovedPayment.paymentNumber),
      amount: latestApprovedPayment.amount,
      paidAt: latestApprovedPayment.paidAt,
      orderNumber: formatFinanceCode(latestApprovedPayment.feeOrder?.orderNumber
        || latestApprovedPayment.allocations?.[0]?.orderNumber
        || latestApprovedPayment.feeOrderId
        || '')
    } : null,
    latestPendingPayment: latestPendingPayment ? {
      paymentNumber: formatFinanceCode(latestPendingPayment.paymentNumber),
      amount: latestPendingPayment.amount,
      paidAt: latestPendingPayment.paidAt,
      approvalStage: latestPendingPayment.approvalStage
    } : null,
    openOrders: orders
      .filter((item) => ['new', 'partial', 'overdue'].includes(String(item?.status || '')))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        orderNumber: formatFinanceCode(item.orderNumber),
        title: item.title,
        status: item.status,
        dueDate: item.dueDate,
        outstandingAmount: Number(item.outstandingAmount || 0),
        currency: item.currency || currency
      })),
    pack: pack || {
      studentName: membership?.student?.fullName || membership?.student?.name || 'متعلم',
      membershipId: membership?.id || '',
      summary: { total: 0, critical: 0, warning: 0, info: 0, actionRequired: 0, byType: {} },
      signals: [],
      recommendedAction: buildStatementRecommendation({})
    }
  };
}

async function listDiscounts(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.feeOrderId)) query.feeOrderId = filters.feeOrderId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeText(filters.linkScope)) query.linkScope = normalizeText(filters.linkScope);
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.discountType)) query.discountType = normalizeText(filters.discountType);
  if (normalizeText(filters.targetScope)) query.targetScope = normalizeText(filters.targetScope);
  if (normalizeText(filters.source)) query.source = normalizeText(filters.source);
  if (String(filters.registryOnly || '').toLowerCase() === 'true') {
    query.source = { $in: ['manual', 'migration'] };
  }

  const items = await Discount.find(query)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .sort({ createdAt: -1 });
  return items.map(formatDiscount);
}

function buildDiscountRegistryQuery(filters = {}) {
  const query = {
    status: 'active',
    source: { $in: ['manual', 'migration'] }
  };
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeText(filters.discountType)) query.discountType = normalizeText(filters.discountType);
  return query;
}

function buildMirroredDiscountQuery(filters = {}) {
  const query = {
    status: 'active',
    source: 'finance_adjustment',
    reason: { $regex: /^Relief \([^)]+\)$/i }
  };
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeText(filters.discountType)) query.discountType = normalizeText(filters.discountType);
  return query;
}

async function findMirroredDiscountState(filters = {}) {
  const discounts = await Discount.find(buildMirroredDiscountQuery(filters))
    .select('_id studentMembershipId')
    .sort({ createdAt: 1, _id: 1 });
  const discountIds = discounts.map((item) => item._id);
  const reliefs = discountIds.length
    ? await FinanceRelief.find({
        status: 'active',
        sourceModel: 'discount',
        sourceDiscountId: { $in: discountIds }
      })
    : [];
  return { discounts, reliefs };
}

function summarizeDiscountDuplicateGroups(groups = []) {
  const membershipIds = new Set();
  const classIds = new Set();
  let duplicateRecords = 0;
  const samples = [];
  for (const group of groups) {
    const rows = group.rows || [];
    duplicateRecords += Math.max(0, rows.length - 1);
    const first = rows[0] || {};
    const membershipId = normalizeNullableId(first.studentMembershipId);
    const classId = normalizeNullableId(first.classId);
    if (membershipId) membershipIds.add(membershipId);
    if (classId) classIds.add(classId);
    if (samples.length < 12) {
      samples.push({
        studentMembershipId: membershipId || '',
        classId: classId || '',
        count: rows.length,
        keepId: normalizeNullableId(first._id) || ''
      });
    }
  }
  return {
    duplicateGroups: groups.length,
    duplicateRecords,
    affectedStudents: membershipIds.size,
    affectedClasses: classIds.size,
    samples
  };
}

async function inspectDiscountDuplicates(filters = {}) {
  const [items, mirrored] = await Promise.all([
    Discount.find(buildDiscountRegistryQuery(filters))
      .sort({ createdAt: 1, _id: 1 })
      .lean(),
    findMirroredDiscountState(filters)
  ]);
  const exactGroups = groupDuplicateDiscounts(items);
  const groups = groupRepairableDiscounts(items);
  const exactSummary = summarizeDiscountDuplicateGroups(exactGroups);
  return {
    scanned: items.length,
    mirroredDiscountRecords: mirrored.discounts.length,
    mirroredActiveReliefs: mirrored.reliefs.length,
    exactDuplicateGroups: exactSummary.duplicateGroups,
    exactDuplicateRecords: exactSummary.duplicateRecords,
    ...summarizeDiscountDuplicateGroups(groups)
  };
}

async function deduplicateDiscounts(filters = {}, payload = {}) {
  const schoolId = normalizeNullableId(filters.schoolId);
  if (!schoolId) throw new Error('student_finance_school_scope_required');

  const [items, mirrored] = await Promise.all([
    Discount.find(buildDiscountRegistryQuery(filters)).sort({ createdAt: 1, _id: 1 }),
    findMirroredDiscountState(filters)
  ]);
  const exactGroups = groupDuplicateDiscounts(items);
  const groups = groupRepairableDiscounts(items);
  const exactSummary = summarizeDiscountDuplicateGroups(exactGroups);
  const summary = {
    scanned: items.length,
    mirroredDiscountRecords: mirrored.discounts.length,
    mirroredActiveReliefs: mirrored.reliefs.length,
    exactDuplicateGroups: exactSummary.duplicateGroups,
    exactDuplicateRecords: exactSummary.duplicateRecords,
    ...summarizeDiscountDuplicateGroups(groups),
    cancelled: 0,
    mirroredReliefsCancelled: 0,
    billsRepaired: 0
  };
  if (payload.apply !== true) return summary;

  for (const group of groups) {
    const [keeper, ...duplicates] = group.rows;
    if (!keeper) continue;
    for (const duplicate of duplicates) {
      duplicate.status = 'cancelled';
      duplicate.duplicateOf = keeper._id;
      duplicate.deduplicatedAt = new Date();
      duplicate.registryIdentity = undefined;
      await duplicate.save();
      await syncDiscountOpenBills(duplicate);
      await syncFinanceReliefFromDiscount(duplicate);
      summary.cancelled += 1;
    }
    const registryIdentity = buildDiscountRegistryKey(keeper);
    if (!normalizeText(keeper.registryIdentity)) {
      keeper.registryIdentity = registryIdentity;
      await keeper.save();
    }
  }

  for (const relief of mirrored.reliefs) {
    relief.status = 'cancelled';
    relief.cancelReason = 'bill_adjustment_not_registry_relief';
    relief.cancelledBy = normalizeNullableId(payload.cancelledBy);
    relief.cancelledAt = new Date();
    await relief.save();
    summary.mirroredReliefsCancelled += 1;
  }

  const membershipIds = Array.from(new Set([
    ...items.map((item) => normalizeNullableId(item.studentMembershipId)),
    ...mirrored.discounts.map((item) => normalizeNullableId(item.studentMembershipId))
  ].filter(Boolean)));
  if (membershipIds.length) {
    const bills = await FinanceBill.find({
      studentMembershipId: { $in: membershipIds },
      'adjustments.reason': { $regex: /^Relief \(/i }
    })
      .sort({ createdAt: 1, _id: 1 });
    for (const bill of bills) {
      const result = await syncStudentFinanceFromFinanceBill(bill);
      if (result?.reliefs?.updated) summary.billsRepaired += 1;
    }
  }
  return summary;
}

async function listFinanceReliefs(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.feeOrderId)) query.feeOrderId = filters.feeOrderId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.studentId)) query.studentId = filters.studentId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeText(filters.linkScope)) query.linkScope = normalizeText(filters.linkScope);
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.reliefType)) query.reliefType = normalizeText(filters.reliefType);
  if (normalizeText(filters.scope)) query.scope = normalizeText(filters.scope);
  if (String(filters.registryOnly || '').toLowerCase() === 'true') query.feeOrderId = null;

  const items = await FinanceRelief.find(query)
    .populate('feeOrderId')
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .populate('cancelledBy', 'name')
    .sort({ createdAt: -1 });
  return items.map(formatFinanceRelief);
}

async function createDiscount(payload = {}) {
  if (normalizeText(payload.targetScope) === 'class' && !normalizeNullableId(payload.studentMembershipId)) {
    const classId = normalizeNullableId(payload.classId);
    const academicYearId = normalizeNullableId(payload.academicYearId);
    if (!classId || !academicYearId) throw new Error('student_finance_membership_not_found');
    const StudentMembership = require('../models/StudentMembership');
    const memberships = await StudentMembership.find({
      classId,
      $or: [{ academicYearId }, { academicYear: academicYearId }],
      status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] },
      isCurrent: true
    }).select('_id').lean();
    if (!memberships.length) throw new Error('student_finance_membership_not_found');
    const groupKey = buildClassDiscountGroupKey({ ...payload, classId, academicYearId });
    const items = [];
    for (const membership of memberships) {
      items.push(await createDiscount({
        ...payload,
        targetScope: 'class',
        groupKey,
        studentMembershipId: membership._id
      }));
    }
    const createdCount = items.filter((item) => item?.wasCreated || item?.wasReactivated).length;
    return {
      bulk: true,
      count: items.length,
      createdCount,
      reusedCount: items.length - createdCount,
      items,
      item: items[0] || null
    };
  }

  const membership = await resolveMembershipForFinanceRegistry(payload);
  if (!membership) {
    throw new Error('student_finance_membership_not_found');
  }

  const discountCoverage = normalizeDiscountCoverage(payload);
  const discountWindow = resolveDiscountDurationWindow(membership, payload);

  const discountPayload = {
    studentMembershipId: membership._id,
    studentId: membership.studentId?._id || membership.studentId || null,
    student: membership.student?._id || membership.student || null,
    classId: membership.classId?._id || membership.classId || null,
    academicYearId: membership.academicYearId?._id || membership.academicYearId || null,
    discountType: ['discount', 'waiver', 'penalty', 'manual'].includes(normalizeText(payload.discountType))
      ? normalizeText(payload.discountType)
      : 'discount',
    targetScope: normalizeText(payload.targetScope) === 'class' ? 'class' : 'student',
    groupKey: normalizeText(payload.groupKey),
    coverageMode: discountCoverage.coverageMode,
    amount: discountCoverage.amount,
    percentage: discountCoverage.percentage,
    reason: normalizeText(payload.reason),
    durationMode: discountWindow.durationMode,
    startDate: discountWindow.startDate,
    endDate: discountWindow.endDate,
    source: 'manual',
    createdBy: normalizeNullableId(payload.createdBy),
  };
  discountPayload.registryIdentity = buildDiscountRegistryKey(discountPayload);
  discountPayload.sourceKey = buildManualDiscountSourceKey(discountPayload);

  const candidates = await Discount.find({
    studentMembershipId: membership._id,
    source: { $in: ['manual', 'migration'] }
  }).sort({ createdAt: 1, _id: 1 });
  const equivalentCandidates = candidates.filter((candidate) => (
    buildDiscountRegistryIdentity(candidate) === buildDiscountRegistryIdentity(discountPayload)
  ));
  const equivalent = equivalentCandidates.find((candidate) => candidate.status === 'active')
    || equivalentCandidates[0];

  if (equivalent) {
    const wasReactivated = equivalent.status !== 'active';
    equivalent.registryIdentity = equivalent.registryIdentity || discountPayload.registryIdentity;
    equivalent.groupKey = discountPayload.groupKey;
    equivalent.status = 'active';
    equivalent.duplicateOf = null;
    equivalent.deduplicatedAt = null;
    await equivalent.save();
    const populatedEquivalent = await Discount.findById(equivalent._id)
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('createdBy', 'name');
    if (wasReactivated) {
      await syncDiscountOpenBills(populatedEquivalent);
      await syncFinanceReliefFromDiscount(populatedEquivalent);
    }
    return { ...formatDiscount(populatedEquivalent), wasCreated: false, wasReactivated };
  }

  let item;
  try {
    item = await Discount.create(discountPayload);
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    const concurrent = await Discount.findOne({
      $or: [
        { registryIdentity: discountPayload.registryIdentity },
        { sourceKey: discountPayload.sourceKey }
      ]
    });
    if (!concurrent) throw error;
    const populatedConcurrent = await Discount.findById(concurrent._id)
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('createdBy', 'name');
    return { ...formatDiscount(populatedConcurrent), wasCreated: false, wasReactivated: false };
  }

  const populated = await Discount.findById(item._id)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('createdBy', 'name');

  await syncDiscountOpenBills(populated);
  await syncFinanceReliefFromDiscount(populated);

  return { ...formatDiscount(populated), wasCreated: true, wasReactivated: false };
}

async function cancelDiscount(discountId, payload = {}) {
  const item = await Discount.findById(discountId)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('createdBy', 'name');
  if (!item) {
    throw new Error('student_finance_discount_not_found');
  }

  if (item.targetScope === 'class' && item.groupKey) {
    const groupedItems = await Discount.find({ groupKey: item.groupKey, status: 'active' });
    for (const groupedItem of groupedItems) {
      groupedItem.status = 'cancelled';
      groupedItem.reason = normalizeText(payload.reason) || groupedItem.reason;
      await groupedItem.save();
      await syncDiscountOpenBills(groupedItem);
      await syncFinanceReliefFromDiscount(groupedItem);
    }
    item.status = 'cancelled';
    item.reason = normalizeText(payload.reason) || item.reason;
    return formatDiscount(item);
  }

  item.status = 'cancelled';
  item.reason = normalizeText(payload.reason) || item.reason;
  await item.save();
  await syncDiscountOpenBills(item);
  await syncFinanceReliefFromDiscount(item);

  return formatDiscount(item);
}

async function listFeeExemptions(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.schoolId)) query.schoolId = filters.schoolId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.studentId)) query.studentId = filters.studentId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.scope)) query.scope = normalizeText(filters.scope);

  const items = await FeeExemption.find(query)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .populate('cancelledBy', 'name')
    .sort({ createdAt: -1 });

  return items.map(formatFeeExemption);
}

async function createFeeExemption(payload = {}) {
  const membership = await resolveMembershipForFinanceRegistry(payload);
  if (!membership) {
    throw new Error('student_finance_membership_not_found');
  }

  const exemptionType = ['full', 'partial'].includes(normalizeText(payload.exemptionType))
    ? normalizeText(payload.exemptionType)
    : 'full';
  const exemptionAmount = Math.max(0, Number(payload.amount) || 0);
  const exemptionPercentage = Math.max(0, Math.min(100, Number(payload.percentage) || 0));
  if (exemptionType === 'partial' && exemptionAmount <= 0 && exemptionPercentage <= 0) {
    throw new Error('student_finance_exemption_coverage_invalid');
  }

  const item = await FeeExemption.create({
    studentMembershipId: membership._id,
    studentId: membership.studentId?._id || membership.studentId || null,
    student: membership.student?._id || membership.student || null,
    classId: membership.classId?._id || membership.classId || null,
    academicYearId: membership.academicYearId?._id || membership.academicYearId || null,
    exemptionType,
    scope: ['tuition', 'admission', 'exam', 'transport', 'document', 'other', 'all'].includes(normalizeText(payload.scope))
      ? normalizeText(payload.scope)
      : 'all',
    amount: exemptionType === 'partial' ? exemptionAmount : 0,
    percentage: exemptionType === 'partial' ? exemptionPercentage : 100,
    reason: normalizeText(payload.reason),
    note: normalizeText(payload.note),
    approvedBy: normalizeNullableId(payload.approvedBy),
    createdBy: normalizeNullableId(payload.createdBy)
  });

  const populated = await FeeExemption.findById(item._id)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .populate('cancelledBy', 'name');

  await syncFinanceReliefFromFeeExemption(populated);
  await syncExemptionOpenBills(populated);

  return formatFeeExemption(populated);
}

async function cancelFeeExemption(exemptionId, payload = {}) {
  const item = await FeeExemption.findById(exemptionId)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('approvedBy', 'name')
    .populate('createdBy', 'name')
    .populate('cancelledBy', 'name');
  if (!item) {
    throw new Error('student_finance_exemption_not_found');
  }

  item.status = 'cancelled';
  item.cancelReason = normalizeText(payload.cancelReason);
  item.cancelledBy = normalizeNullableId(payload.cancelledBy);
  item.cancelledAt = new Date();
  await item.save();
  await syncFinanceReliefFromFeeExemption(item);
  await syncExemptionOpenBills(item);

  return formatFeeExemption(item);
}

async function listTransportFees(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);

  const items = await TransportFee.find(query)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('assessmentPeriodId')
    .sort({ createdAt: -1 });
  return items.map(formatTransportFee);
}

async function createTransportFee(payload = {}) {
  const item = await TransportFee.create({
    title: normalizeText(payload.title) || 'Transport Fee',
    student: normalizeNullableId(payload.student),
    studentId: normalizeNullableId(payload.studentId),
    studentMembershipId: normalizeNullableId(payload.studentMembershipId),
    classId: normalizeNullableId(payload.classId),
    academicYearId: normalizeNullableId(payload.academicYearId),
    assessmentPeriodId: normalizeNullableId(payload.assessmentPeriodId),
    frequency: ['monthly', 'term', 'custom'].includes(normalizeText(payload.frequency)) ? normalizeText(payload.frequency) : 'monthly',
    amount: Math.max(0, Number(payload.amount) || 0),
    dueDay: Math.max(1, Math.min(28, Number(payload.dueDay) || 10)),
    currency: normalizeText(payload.currency).toUpperCase() || 'AFN',
    status: normalizeText(payload.status) === 'inactive' ? 'inactive' : 'active',
    source: ['manual', 'migration', 'system'].includes(normalizeText(payload.source)) ? normalizeText(payload.source) : 'manual',
    note: normalizeText(payload.note)
  });

  const populated = await TransportFee.findById(item._id)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('assessmentPeriodId');

  return formatTransportFee(populated);
}

async function listOpenFeeOrdersForMembership(studentMembershipId = '') {
  const membershipId = normalizeNullableId(studentMembershipId);
  if (!membershipId) {
    throw new Error('student_finance_membership_not_found');
  }

  const membership = await StudentMembership.findById(membershipId)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId');
  if (!membership) {
    throw new Error('student_finance_membership_not_found');
  }

  const orders = await getOpenFeeOrderDocsForMembership(membership._id);
  return {
    membership: formatMembership(membership),
    items: orders.map(formatFeeOrder),
    summary: {
      totalOrders: orders.length,
      totalOutstanding: roundMoney(orders.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0))
    }
  };
}

async function previewFeePaymentAllocation(payload = {}) {
  const schoolId = normalizeNullableId(payload.schoolId);
  if (!schoolId) {
    throw new Error('student_finance_school_scope_required');
  }

  const membership = await resolveMembershipForFinanceRegistry(payload);
  if (!membership) {
    throw new Error('student_finance_membership_not_found');
  }
  const membershipSchoolId = resolveMembershipSchoolId(membership);
  if (!membershipSchoolId || membershipSchoolId !== schoolId) {
    throw new Error('student_finance_membership_not_found');
  }

  const openOrders = await getOpenFeeOrderDocsForStudentSchool({ membership, schoolId });
  if (!openOrders.length) {
    throw new Error('student_finance_open_orders_not_found');
  }

  const amount = roundMoney(payload.amount);
  const resolved = resolvePaymentAllocations({ openOrders, payload });
  const rawRequestedFeeType = normalizeText(payload.feeType).toLowerCase();
  const requestedFeeType = LINE_ITEM_TYPES.includes(rawRequestedFeeType) ? rawRequestedFeeType : '';
  return {
    membership: formatMembership(membership),
    schoolId,
    amount,
    currency: normalizeText(payload.currency).toUpperCase() || 'AFN',
    allocationMode: resolved.allocationMode,
    feeType: requestedFeeType,
    totalOutstanding: roundMoney(openOrders.reduce((sum, item) => (
      sum + (requestedFeeType
        ? getFinanceFeeScopeBalanceAmount(item, requestedFeeType)
        : Number(item.outstandingAmount || 0))
    ), 0)),
    totalAllocated: resolved.totalAllocated,
    remainingAmount: roundMoney(amount - resolved.totalAllocated),
    allocations: resolved.allocations,
    openOrders: openOrders.map(formatFeeOrderLite)
  };
}

async function createFeePayment(payload = {}) {
  const preview = await previewFeePaymentAllocation(payload);
  const membership = await resolveMembershipForFinanceRegistry({
    studentMembershipId: preview.membership?.id,
    schoolId: preview.schoolId
  });
  if (!membership) {
    throw new Error('student_finance_membership_not_found');
  }

  const loadPopulatedPayment = async (paymentId) => {
    const populated = await FeePayment.findOne({ _id: paymentId, schoolId: preview.schoolId })
      .populate('studentId')
      .populate('student', 'name email')
      .populate('feeOrderId')
      .populate('allocations.feeOrderId')
      .populate('receivedBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId');

    return populated ? formatFeePayment(populated) : null;
  };

  const paidAt = resolvePaymentDate(payload.paidAt);
  const duplicate = await findDuplicateFeePaymentSubmission({
    studentMembershipId: membership._id,
    schoolId: preview.schoolId,
    amount: preview.amount,
    paymentMethod: payload.paymentMethod,
    paidAt,
    referenceNo: payload.referenceNo,
    allocations: preview.allocations
  });
  if (duplicate) {
    const existingPayment = await loadPopulatedPayment(duplicate._id);
    if (existingPayment) {
      return {
        ...existingPayment,
        isDuplicate: true
      };
    }
    throw new Error(normalizeText(payload.referenceNo)
      ? 'student_finance_payment_reference_duplicate'
      : 'student_finance_payment_duplicate');
  }

  const item = await FeePayment.create({
    paymentNumber: buildPaymentNumber(),
    feeOrderId: preview.allocations.length === 1 ? preview.allocations[0].feeOrderId : null,
    source: ['finance_receipt', 'manual', 'gateway', 'migration'].includes(normalizeText(payload.source))
      ? normalizeText(payload.source)
      : 'manual',
    student: membership.student?._id || membership.student || null,
    studentId: membership.studentId?._id || membership.studentId || null,
    studentMembershipId: membership._id,
    schoolId: preview.schoolId,
    linkScope: deriveLinkScope({
      studentMembershipId: membership._id,
      classId: membership.classId?._id || membership.classId || null
    }),
    classId: membership.classId?._id || membership.classId || null,
    academicYearId: membership.academicYearId?._id || membership.academicYearId || null,
    payerType: ['student_guardian', 'student', 'sponsor', 'school', 'other'].includes(normalizeText(payload.payerType))
      ? normalizeText(payload.payerType)
      : 'student_guardian',
    receivedBy: normalizeNullableId(payload.receivedBy),
    amount: preview.amount,
    currency: preview.currency,
    paymentMethod: ['cash', 'bank_transfer', 'hawala', 'manual', 'gateway', 'other'].includes(normalizeText(payload.paymentMethod))
      ? normalizeText(payload.paymentMethod)
      : 'cash',
    allocationMode: preview.allocationMode,
    allocations: preview.allocations.map((entry) => ({
      feeOrderId: entry.feeOrderId,
      feeType: entry.feeType,
      amount: entry.amount,
      title: entry.title,
      orderNumber: entry.orderNumber
    })),
    referenceNo: normalizeText(payload.referenceNo),
    paidAt: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
    fileUrl: normalizeText(payload.fileUrl),
    note: normalizeText(payload.note),
    status: 'pending',
    approvalStage: 'finance_manager_review'
  });

  return loadPopulatedPayment(item._id);
}

async function getMembershipFinanceOverview(studentMembershipId) {
  const membership = await StudentMembership.findById(studentMembershipId)
    .populate('studentId')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId');
  if (!membership) {
    return null;
  }

  const [orders, payments, discounts, transportFees, exemptions, reliefDocs] = await Promise.all([
    FeeOrder.find({ studentMembershipId: membership._id, status: { $ne: 'void' } }).populate('studentId').populate('student', 'name email').populate('course', 'title kind').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('academicYearId').populate('assessmentPeriodId').sort({ dueDate: -1, createdAt: -1 }),
    FeePayment.find({ studentMembershipId: membership._id })
      .populate('studentId')
      .populate('student', 'name email')
      .populate('feeOrderId')
      .populate('allocations.feeOrderId')
      .populate('receivedBy', 'name orgRole adminLevel')
      .populate({
        path: 'sourceReceiptId',
        populate: [
          { path: 'reviewedBy', select: 'name orgRole adminLevel' },
          { path: 'followUp.updatedBy', select: 'name orgRole adminLevel' },
          { path: 'followUp.history.updatedBy', select: 'name orgRole adminLevel' },
          { path: 'approvalTrail.by', select: 'name orgRole adminLevel' }
        ]
      })
      .populate('reviewedBy', 'name orgRole adminLevel')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .sort({ paidAt: -1, createdAt: -1 }),
    Discount.find({ studentMembershipId: membership._id, status: 'active', source: { $in: ['manual', 'migration'] } }).populate('studentId').populate('student', 'name email').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('academicYearId').sort({ createdAt: -1 }),
    TransportFee.find({ studentMembershipId: membership._id }).populate('studentId').populate('student', 'name email').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('academicYearId').populate('assessmentPeriodId').sort({ createdAt: -1 }),
    FeeExemption.find({ studentMembershipId: membership._id, status: 'active' }).populate('studentId').populate('student', 'name email').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('academicYearId').populate('approvedBy', 'name').populate('createdBy', 'name').populate('cancelledBy', 'name').sort({ createdAt: -1 }),
    FinanceRelief.find({ studentMembershipId: membership._id, status: 'active', feeOrderId: null })
      .populate('feeOrderId')
      .populate('studentId')
      .populate('student', 'name email')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('approvedBy', 'name')
      .populate('createdBy', 'name')
      .populate('cancelledBy', 'name')
      .sort({ createdAt: -1 })
  ]);

  const totalDue = orders.reduce((sum, item) => sum + (Number(item.amountDue) || 0), 0);
  const totalPaid = orders.reduce((sum, item) => sum + (Number(item.amountPaid) || 0), 0);
  const totalOutstanding = orders.reduce((sum, item) => sum + (Number(item.outstandingAmount) || 0), 0);
  const formattedOrders = orders.map(formatFeeOrder);
  const formattedPayments = buildPaymentReceiptDetails(
    payments.map(formatFeePayment),
    formattedOrders,
    formatMembership(membership)
  );
  const recognizedPaymentRows = await recognizePayments(payments);
  const recognitionById = new Map(recognizedPaymentRows.map((row) => [
    String(row.payment?._id || ''),
    row
  ]));
  formattedPayments.forEach((item) => {
    const recognition = recognitionById.get(String(item?.id || ''));
    item.recognizedAmount = Number(recognition?.recognizedAmount || 0);
    item.excludedVoidAmount = Number(recognition?.excludedVoidAmount || 0);
  });
  const formattedDiscounts = discounts.map(formatDiscount);
  const formattedExemptions = exemptions.map(formatFeeExemption);
  const formattedReliefs = [];
  const reliefSourceKeys = new Set();

  for (const reliefDoc of reliefDocs) {
    const formatted = formatFinanceRelief(reliefDoc);
    if (!formatted) continue;
    formattedReliefs.push(formatted);
    if (formatted.sourceKey) reliefSourceKeys.add(formatted.sourceKey);
  }

  for (const discount of discounts) {
    const fallback = toReliefPreviewRecord(buildFinanceReliefPayloadFromDiscount(toPlain(discount)));
    if (fallback.sourceKey && reliefSourceKeys.has(fallback.sourceKey)) continue;
    formattedReliefs.push(formatFinanceRelief({
      ...fallback,
      _id: fallback.sourceKey,
      studentId: discount.studentId,
      student: discount.student,
      classId: discount.classId,
      academicYearId: discount.academicYearId,
      createdBy: discount.createdBy,
      createdAt: discount.createdAt,
      updatedAt: discount.updatedAt
    }));
    if (fallback.sourceKey) reliefSourceKeys.add(fallback.sourceKey);
  }

  for (const exemption of exemptions) {
    const fallback = toReliefPreviewRecord(buildFinanceReliefPayloadFromExemption(toPlain(exemption)));
    if (fallback.sourceKey && reliefSourceKeys.has(fallback.sourceKey)) continue;
    formattedReliefs.push(formatFinanceRelief({
      ...fallback,
      _id: fallback.sourceKey,
      studentId: exemption.studentId,
      student: exemption.student,
      classId: exemption.classId,
      academicYearId: exemption.academicYearId,
      approvedBy: exemption.approvedBy,
      createdBy: exemption.createdBy,
      cancelledBy: exemption.cancelledBy,
      createdAt: exemption.createdAt,
      updatedAt: exemption.updatedAt
    }));
    if (fallback.sourceKey) reliefSourceKeys.add(fallback.sourceKey);
  }

  const formattedTransportFees = transportFees.map(formatTransportFee);
  const formattedMembership = formatMembership(membership);
  const summary = {
    totalOrders: orders.length,
    totalPayments: formattedPayments.filter((item) => Number(item?.recognizedAmount || 0) > 0).length,
    totalDiscounts: discounts.length,
    totalExemptions: exemptions.length,
    totalReliefs: formattedReliefs.length,
    totalTransportFees: transportFees.length,
    totalDue,
    totalPaid,
    totalOutstanding,
    openOrders: formattedOrders.filter((item) => ['new', 'partial', 'overdue'].includes(item.status)).length,
    overdueOrders: formattedOrders.filter((item) => item.status === 'overdue').length,
    pendingPayments: formattedPayments.filter((item) => item.status === 'pending' && Number(item?.recognizedAmount || 0) > 0).length
  };
  summary.byFeeType = buildFeeTypeLedgerSummary(formattedOrders);
  const anomalyPack = buildMembershipFinanceAnomalies({
    membership: formattedMembership,
    orders: formattedOrders,
    payments: formattedPayments,
    reliefs: formattedReliefs,
    asOf: new Date(),
    limit: 8
  });
  const statementPack = {
    studentName: formattedMembership?.student?.fullName || formattedMembership?.student?.name || 'متعلم',
    membershipId: formattedMembership?.id || '',
    summary: anomalyPack.summary,
    signals: anomalyPack.items,
    recommendedAction: buildStatementRecommendation(anomalyPack.summary)
  };

  return {
    membership: formattedMembership,
    summary,
    statement: buildMembershipStatement({
      membership: formattedMembership,
      summary,
      orders: formattedOrders,
      payments: formattedPayments,
      discounts: formattedDiscounts,
      exemptions: formattedExemptions,
      reliefs: formattedReliefs,
      transportFees: formattedTransportFees,
      pack: statementPack
    }),
    orders: formattedOrders,
    payments: formattedPayments,
    discounts: formattedDiscounts,
    exemptions: formattedExemptions,
    reliefs: formattedReliefs,
    transportFees: formattedTransportFees
  };
}

async function getMembershipFinanceStatement(studentMembershipId) {
  const overview = await getMembershipFinanceOverview(studentMembershipId);
  if (!overview) return null;
  return {
    membership: overview.membership,
    summary: overview.summary,
    statement: overview.statement,
    orders: overview.orders,
    payments: overview.payments,
    reliefs: overview.reliefs
  };
}

async function getExamEligibility({ studentMembershipId, sessionId = null } = {}) {
  const overview = await getMembershipFinanceOverview(studentMembershipId);
  if (!overview) {
    return null;
  }

  let session = null;
  let scopedOrders = overview.orders;
  let scopedPayments = overview.payments;

  if (normalizeNullableId(sessionId)) {
    const sessionDoc = await ExamSession.findById(sessionId)
      .populate('academicYearId')
      .populate('assessmentPeriodId')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('examTypeId');

    if (!sessionDoc) {
      throw new Error('student_finance_session_not_found');
    }

    session = formatExamSession(sessionDoc);
    if (String(sessionDoc.academicYearId?._id || sessionDoc.academicYearId || '') !== String(overview.membership.academicYear?.id || '')) {
      throw new Error('student_finance_session_membership_mismatch');
    }
    if (String(sessionDoc.classId?._id || sessionDoc.classId || '') !== String(overview.membership.schoolClass?.id || '')) {
      throw new Error('student_finance_session_membership_mismatch');
    }

    scopedOrders = overview.orders.filter((item) => String(item.academicYear?.id || '') === String(session.academicYear?.id || ''));
    scopedPayments = overview.payments.filter((item) => String(item.academicYear?.id || '') === String(session.academicYear?.id || ''));
  }

  const totalDue = scopedOrders.reduce((sum, item) => sum + (Number(item.amountDue) || 0), 0);
  const totalPaid = scopedOrders.reduce((sum, item) => sum + (Number(item.amountPaid) || 0), 0);
  const totalOutstanding = scopedOrders.reduce((sum, item) => sum + (Number(item.outstandingAmount) || 0), 0);
  const overdueOrders = scopedOrders.filter((item) => item.status === 'overdue');
  const pendingPayments = scopedPayments.filter((item) => item.status === 'pending' && Number(item?.recognizedAmount ?? item?.amount ?? 0) > 0);

  const feeStatus = totalOutstanding <= 0
    ? 'clear'
    : overdueOrders.length
      ? 'overdue'
      : pendingPayments.length
        ? 'under_review'
        : 'due';

  return {
    membership: overview.membership,
    session,
    summary: {
      totalOrders: scopedOrders.length,
      totalDue,
      totalPaid,
      totalOutstanding,
      overdueOrders: overdueOrders.length,
      pendingPayments: pendingPayments.length,
      feeStatus,
      eligible: totalOutstanding <= 0 && overdueOrders.length === 0 && pendingPayments.length === 0
    },
    blockingOrders: scopedOrders.filter((item) => ['new', 'partial', 'overdue'].includes(item.status)),
    payments: scopedPayments
  };
}

function buildEligibilitySummaryFromOverview(overview = {}) {
  const orders = Array.isArray(overview.orders) ? overview.orders : [];
  const payments = Array.isArray(overview.payments) ? overview.payments : [];
  const totalDue = orders.reduce((sum, item) => sum + (Number(item.amountDue) || 0), 0);
  const totalPaid = orders.reduce((sum, item) => sum + (Number(item.amountPaid) || 0), 0);
  const totalOutstanding = orders.reduce((sum, item) => sum + (Number(item.outstandingAmount) || 0), 0);
  const overdueOrders = orders.filter((item) => item.status === 'overdue');
  const pendingPayments = payments.filter((item) => item.status === 'pending' && Number(item?.recognizedAmount ?? item?.amount ?? 0) > 0);
  const feeStatus = totalOutstanding <= 0
    ? 'clear'
    : overdueOrders.length
      ? 'overdue'
      : pendingPayments.length
        ? 'under_review'
        : 'due';

  return {
    totalOrders: orders.length,
    totalDue,
    totalPaid,
    totalOutstanding,
    overdueOrders: overdueOrders.length,
    pendingPayments: pendingPayments.length,
    feeStatus,
    eligible: totalOutstanding <= 0 && overdueOrders.length === 0 && pendingPayments.length === 0
  };
}

async function listStudentMembershipOverviewsByUserId(userId) {
  const membershipIds = await StudentMembership.find({
    student: userId,
    isCurrent: true,
    status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
  })
    .sort({ enrolledAt: -1, joinedAt: -1, createdAt: -1 })
    .distinct('_id');

  const items = [];
  for (const membershipId of membershipIds) {
    const overview = await getMembershipFinanceOverview(membershipId);
    if (!overview) continue;
    items.push({
      ...overview,
      eligibilitySummary: buildEligibilitySummaryFromOverview(overview)
    });
  }

  return items;
}

async function seedStudentFinanceCanonical({ dryRun = false } = {}) {
  const bills = await FinanceBill.find({}).sort({ createdAt: 1 }).lean();
  const receipts = await FinanceReceipt.find({}).sort({ createdAt: 1 }).lean();
  const summary = {
    feeOrdersCreated: 0,
    feeOrdersUpdated: 0,
    feePaymentsCreated: 0,
    feePaymentsUpdated: 0,
    discountsCreated: 0,
    discountsUpdated: 0,
    discountsCancelled: 0,
    warnings: 0
  };

  for (const bill of bills) {
    const sync = await syncStudentFinanceFromFinanceBill(bill, { dryRun });
    if (sync.order.created) summary.feeOrdersCreated += 1;
    if (sync.order.updated) summary.feeOrdersUpdated += 1;
    summary.discountsCreated += Number(sync.discounts.created || 0);
    summary.discountsUpdated += Number(sync.discounts.updated || 0);
    summary.discountsCancelled += Number(sync.discounts.cancelled || 0);
    if (sync.order.reason === 'bill_not_found') summary.warnings += 1;
  }

  for (const receipt of receipts) {
    const sync = await syncStudentFinanceFromFinanceReceipt(receipt, { dryRun });
    if (sync.payment.created) summary.feePaymentsCreated += 1;
    if (sync.payment.updated) summary.feePaymentsUpdated += 1;
    if (sync.payment.reason === 'fee_order_not_found') summary.warnings += 1;
  }

  return summary;
}

module.exports = {
  cancelDiscount,
  cancelFeeExemption,
  createDiscount,
  createFeeExemption,
  createFeePayment,
  createTransportFee,
  deduplicateDiscounts,
  getDailyCashierReport,
  getExamEligibility,
  getFeePaymentReceipt,
  getMembershipFinanceOverview,
  getMembershipFinanceStatement,
  listFinanceReliefs,
  listFeeExemptions,
  listDiscounts,
  listOpenFeeOrdersForMembership,
  listFeeOrders,
  listFeePayments,
  inspectDiscountDuplicates,
  listStudentFinanceReferenceData,
  listStudentMembershipOverviewsByUserId,
  listTransportFees,
  previewFeePaymentAllocation,
  seedStudentFinanceCanonical,
  syncDiscountOpenBills,
  __paymentAllocationTestUtils: Object.freeze({
    buildCanonicalPaymentOrderSnapshot,
    buildDailyCashierAnalytics,
    buildOrderQuery,
    buildOrderSortKey,
    buildPaymentQuery,
    buildStudentSchoolOpenOrderQuery,
    resolvePaymentAllocations,
    sortOpenOrdersForAllocation
  })
};
