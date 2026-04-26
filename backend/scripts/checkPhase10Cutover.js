require('dotenv').config();
const mongoose = require('mongoose');

const StudentMembership = require('../models/StudentMembership');
const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const PromotionTransaction = require('../models/PromotionTransaction');
const Schedule = require('../models/Schedule');
const Timetable = require('../models/Timetable');
const TeacherAssignment = require('../models/TeacherAssignment');
const Order = require('../models/Order');
const Course = require('../models/Course');
const CourseJoinRequest = require('../models/CourseJoinRequest');
const { normalizeLinkScope } = require('../utils/financeLinkScope');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function createSplitCounter() {
  return {
    total: 0,
    academic: 0,
    nonAcademic: 0,
    unknown: 0
  };
}

function classifyContext({ linkScope = '', courseKind = '', classId = null } = {}) {
  const explicit = normalizeLinkScope(linkScope, '');
  if (explicit === 'membership') return 'academic';
  if (explicit === 'student') return 'non_academic';
  const kind = normalize(courseKind);
  if (kind === 'academic_class') return 'academic';
  if (kind) return 'non_academic';
  if (classId) return 'academic';
  return 'unknown';
}

function addSplitCount(counter, context) {
  counter.total += 1;
  if (context === 'non_academic') {
    counter.nonAcademic += 1;
    return;
  }
  if (context === 'unknown') {
    counter.unknown += 1;
    return;
  }
  counter.academic += 1;
}

function buildBlockingIssues(stats) {
  const issues = [];
  if (stats.membershipsMissingYear > 0) issues.push('student_memberships_missing_academic_year');
  if (stats.membershipsMissingClass > 0) issues.push('student_memberships_missing_class');
  if (stats.academicFinanceBillsMissingMembership > 0) issues.push('academic_finance_bills_missing_membership');
  if (stats.unknownContextFinanceBillsMissingMembership > 0) issues.push('unknown_context_finance_bills_missing_membership');
  if (stats.academicFinanceReceiptsMissingMembership > 0) issues.push('academic_finance_receipts_missing_membership');
  if (stats.unknownContextFinanceReceiptsMissingMembership > 0) issues.push('unknown_context_finance_receipts_missing_membership');
  if (stats.academicFeeOrdersMissingMembership > 0) issues.push('academic_fee_orders_missing_membership');
  if (stats.unknownContextFeeOrdersMissingMembership > 0) issues.push('unknown_context_fee_orders_missing_membership');
  if (stats.academicFeePaymentsMissingMembership > 0) issues.push('academic_fee_payments_missing_membership');
  if (stats.unknownContextFeePaymentsMissingMembership > 0) issues.push('unknown_context_fee_payments_missing_membership');
  if (stats.attendanceMissingMembership > 0) issues.push('attendance_missing_membership');
  if (stats.gradesMissingMembership > 0) issues.push('grades_missing_membership');
  if (stats.examResultsMissingMembership > 0) issues.push('exam_results_missing_membership');
  if (stats.promotionsMissingMembership > 0) issues.push('promotion_transactions_missing_membership');
  if (stats.schedulesWithoutTimetable > 0) issues.push('legacy_schedules_without_canonical_timetable');
  if (stats.teacherAssignmentsMissingClassOrSubject > 0) issues.push('teacher_assignments_missing_class_or_subject');
  if (stats.approvedLegacyOrdersWithoutMembershipMirror > 0) issues.push('approved_legacy_orders_missing_membership_mirror');
  if (stats.joinRequestOrdersWithoutCanonicalMirror > 0) issues.push('join_request_orders_missing_canonical_request_mirror');
  return issues;
}

function buildWarnings(stats) {
  const warnings = [];
  if (stats.nonAcademicFinanceBillsMissingMembership > 0) warnings.push('non_academic_finance_bills_without_membership');
  if (stats.nonAcademicFinanceReceiptsMissingMembership > 0) warnings.push('non_academic_finance_receipts_without_membership');
  if (stats.nonAcademicFeeOrdersMissingMembership > 0) warnings.push('non_academic_fee_orders_without_membership');
  if (stats.nonAcademicFeePaymentsMissingMembership > 0) warnings.push('non_academic_fee_payments_without_membership');
  if (stats.legacyOrders > 0 && stats.approvedLegacyOrdersWithoutMembershipMirror === 0 && stats.joinRequestOrdersWithoutCanonicalMirror === 0) {
    warnings.push('legacy_orders_retained_as_archive');
  }
  if (stats.examSessions === 0) warnings.push('no_live_exam_sessions');
  if (stats.examResultsTotal === 0) warnings.push('no_live_exam_results');
  if (stats.promotionTransactionsTotal === 0) warnings.push('no_live_promotion_transactions');
  return warnings;
}

async function collectStats() {
  const [
    timetableLegacyIds,
    courses,
    billsMissingMembership,
    receiptsMissingMembership,
    feeOrdersMissingMembership,
    feePaymentsMissingMembership,
    membershipsMissingYear,
    membershipsMissingClass,
    attendanceMissingMembership,
    gradesMissingMembership,
    examSessions,
    examResultsMissingMembership,
    examResultsTotal,
    promotionsMissingMembership,
    promotionTransactionsTotal,
    teacherAssignmentsMissingClassOrSubject,
    legacyOrders,
    orders,
    mirroredMembershipLegacyOrderIds,
    mirroredJoinRequestLegacyOrderIds,
    timetablesTotal,
    feeOrdersTotal,
    feePaymentsTotal
  ] = await Promise.all([
    Timetable.distinct('legacyScheduleId', { legacyScheduleId: { $ne: null } }),
    Course.find({}).select('kind').lean(),
    FinanceBill.find({ studentMembershipId: null }).select('course classId linkScope').lean(),
    FinanceReceipt.find({ studentMembershipId: null }).select('course classId bill linkScope').lean(),
    FeeOrder.find({ studentMembershipId: null }).select('course classId linkScope').lean(),
    FeePayment.find({ studentMembershipId: null }).select('feeOrderId classId linkScope').lean(),
    StudentMembership.countDocuments({ academicYearId: null }),
    StudentMembership.countDocuments({ classId: null }),
    Attendance.countDocuments({ studentMembershipId: null }),
    Grade.countDocuments({ studentMembershipId: null }),
    ExamSession.countDocuments({}),
    ExamResult.countDocuments({ studentMembershipId: null }),
    ExamResult.countDocuments({}),
    PromotionTransaction.countDocuments({ studentMembershipId: null }),
    PromotionTransaction.countDocuments({}),
    TeacherAssignment.countDocuments({ $or: [{ classId: null }, { subjectId: null }] }),
    Order.countDocuments({}),
    Order.find({}).select('status paymentMethod').lean(),
    StudentMembership.distinct('legacyOrder', { legacyOrder: { $ne: null } }),
    CourseJoinRequest.distinct('legacyOrder', { legacyOrder: { $ne: null } }),
    Timetable.countDocuments({}),
    FeeOrder.countDocuments({}),
    FeePayment.countDocuments({})
  ]);

  const feeOrderIdsForPayments = feePaymentsMissingMembership
    .map((item) => item.feeOrderId)
    .filter(Boolean);
  const feeOrdersForPayments = feeOrderIdsForPayments.length
    ? await FeeOrder.find({ _id: { $in: feeOrderIdsForPayments } }).select('course classId studentMembershipId linkScope').lean()
    : [];

  const billIdsForReceipts = receiptsMissingMembership
    .map((item) => item.bill)
    .filter(Boolean);
  const billsForReceipts = billIdsForReceipts.length
    ? await FinanceBill.find({ _id: { $in: billIdsForReceipts } }).select('course classId linkScope').lean()
    : [];

  const courseKindById = new Map(courses.map((item) => [String(item._id), normalize(item.kind)]));
  const feeOrderById = new Map(feeOrdersForPayments.map((item) => [String(item._id), item]));
  const billById = new Map(billsForReceipts.map((item) => [String(item._id), item]));
  const membershipLegacyOrderSet = new Set(mirroredMembershipLegacyOrderIds.filter(Boolean).map((item) => String(item)));
  const joinRequestLegacyOrderSet = new Set(mirroredJoinRequestLegacyOrderIds.filter(Boolean).map((item) => String(item)));

  const billCounter = createSplitCounter();
  for (const bill of billsMissingMembership) {
    addSplitCount(
      billCounter,
      classifyContext({
        linkScope: bill.linkScope,
        courseKind: courseKindById.get(String(bill.course || '')),
        classId: bill.classId || null
      })
    );
  }

  const receiptCounter = createSplitCounter();
  for (const receipt of receiptsMissingMembership) {
    const linkedBill = billById.get(String(receipt.bill || ''));
    addSplitCount(
      receiptCounter,
      classifyContext({
        linkScope: receipt.linkScope || linkedBill?.linkScope || '',
        courseKind: courseKindById.get(String(receipt.course || linkedBill?.course || '')),
        classId: receipt.classId || linkedBill?.classId || null
      })
    );
  }

  const feeOrderCounter = createSplitCounter();
  for (const feeOrder of feeOrdersMissingMembership) {
    addSplitCount(
      feeOrderCounter,
      classifyContext({
        linkScope: feeOrder.linkScope,
        courseKind: courseKindById.get(String(feeOrder.course || '')),
        classId: feeOrder.classId || null
      })
    );
  }

  const feePaymentCounter = createSplitCounter();
  for (const payment of feePaymentsMissingMembership) {
    const linkedOrder = feeOrderById.get(String(payment.feeOrderId || ''));
    addSplitCount(
      feePaymentCounter,
      classifyContext({
        linkScope: payment.linkScope || linkedOrder?.linkScope || '',
        courseKind: courseKindById.get(String(linkedOrder?.course || '')),
        classId: payment.classId || linkedOrder?.classId || null
      })
    );
  }

  const approvedLegacyOrders = orders.filter((item) => normalize(item.status) === 'approved');
  const joinRequestOrders = orders.filter((item) => normalize(item.paymentMethod) === 'join_request');
  const approvedLegacyOrdersWithoutMembershipMirror = approvedLegacyOrders.filter(
    (item) => !membershipLegacyOrderSet.has(String(item._id))
  ).length;
  const joinRequestOrdersWithoutCanonicalMirror = joinRequestOrders.filter(
    (item) => !joinRequestLegacyOrderSet.has(String(item._id))
  ).length;

  const schedulesWithoutTimetable = await Schedule.countDocuments({ _id: { $nin: timetableLegacyIds } });

  return {
    membershipsMissingYear,
    membershipsMissingClass,
    financeBillsMissingMembership: billCounter.total,
    academicFinanceBillsMissingMembership: billCounter.academic,
    nonAcademicFinanceBillsMissingMembership: billCounter.nonAcademic,
    unknownContextFinanceBillsMissingMembership: billCounter.unknown,
    financeReceiptsMissingMembership: receiptCounter.total,
    academicFinanceReceiptsMissingMembership: receiptCounter.academic,
    nonAcademicFinanceReceiptsMissingMembership: receiptCounter.nonAcademic,
    unknownContextFinanceReceiptsMissingMembership: receiptCounter.unknown,
    feeOrdersMissingMembership: feeOrderCounter.total,
    academicFeeOrdersMissingMembership: feeOrderCounter.academic,
    nonAcademicFeeOrdersMissingMembership: feeOrderCounter.nonAcademic,
    unknownContextFeeOrdersMissingMembership: feeOrderCounter.unknown,
    feePaymentsMissingMembership: feePaymentCounter.total,
    academicFeePaymentsMissingMembership: feePaymentCounter.academic,
    nonAcademicFeePaymentsMissingMembership: feePaymentCounter.nonAcademic,
    unknownContextFeePaymentsMissingMembership: feePaymentCounter.unknown,
    attendanceMissingMembership,
    gradesMissingMembership,
    examSessions,
    examResultsMissingMembership,
    examResultsTotal,
    promotionsMissingMembership,
    promotionTransactionsTotal,
    schedulesWithoutTimetable,
    teacherAssignmentsMissingClassOrSubject,
    legacyOrders,
    approvedLegacyOrders: approvedLegacyOrders.length,
    nonApprovedLegacyOrders: legacyOrders - approvedLegacyOrders.length,
    approvedLegacyOrdersWithoutMembershipMirror,
    joinRequestLegacyOrders: joinRequestOrders.length,
    joinRequestOrdersWithoutCanonicalMirror,
    timetablesTotal,
    feeOrdersTotal,
    feePaymentsTotal
  };
}

async function run() {
  const strict = process.argv.includes('--strict');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  try {
    const stats = await collectStats();
    const blockingIssues = buildBlockingIssues(stats);
    const warnings = buildWarnings(stats);

    const report = {
      generatedAt: new Date().toISOString(),
      readyForCoreCutover:
        stats.membershipsMissingYear === 0
        && stats.membershipsMissingClass === 0
        && stats.schedulesWithoutTimetable === 0
        && stats.teacherAssignmentsMissingClassOrSubject === 0,
      readyForTransactionCutover:
        stats.academicFinanceBillsMissingMembership === 0
        && stats.unknownContextFinanceBillsMissingMembership === 0
        && stats.academicFinanceReceiptsMissingMembership === 0
        && stats.unknownContextFinanceReceiptsMissingMembership === 0
        && stats.academicFeeOrdersMissingMembership === 0
        && stats.unknownContextFeeOrdersMissingMembership === 0
        && stats.academicFeePaymentsMissingMembership === 0
        && stats.unknownContextFeePaymentsMissingMembership === 0
        && stats.attendanceMissingMembership === 0
        && stats.gradesMissingMembership === 0
        && stats.examResultsMissingMembership === 0
        && stats.promotionsMissingMembership === 0,
      readyToRetireLegacyOrders:
        stats.approvedLegacyOrdersWithoutMembershipMirror === 0
        && stats.joinRequestOrdersWithoutCanonicalMirror === 0,
      stats,
      blockingIssues,
      warnings
    };

    console.log(JSON.stringify(report, null, 2));
    if (strict && blockingIssues.length) {
      process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
