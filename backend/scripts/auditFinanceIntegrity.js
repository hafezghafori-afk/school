require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const StudentMembership = require('../models/StudentMembership');
const SchoolClass = require('../models/SchoolClass');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceAnomalyCase = require('../models/FinanceAnomalyCase');
const FinanceProcurementCommitment = require('../models/FinanceProcurementCommitment');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const ExpenseEntry = require('../models/ExpenseEntry');
const { resolveFeePlanForBilling } = require('../services/feeBillingService');

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const id = (value) => String(value?._id || value || '').trim();

function readSchoolId(argv = process.argv.slice(2)) {
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (token.startsWith('--school-id=')) return token.slice('--school-id='.length).trim();
    if (token === '--school-id') return String(argv[index + 1] || '').trim();
  }
  return '';
}

async function run() {
  const schoolId = readSchoolId();
  if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
    throw new Error('audit_finance_school_id_invalid');
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });

  const summary = {
    mode: 'read-only',
    approvedPayments: 0,
    paymentsMissingScope: 0,
    paymentAllocationMismatch: 0,
    paymentMissingOrderLinks: 0,
    paymentOrderScopeMismatch: 0,
    approvedPaymentsMissingTreasury: 0,
    inconsistentOrders: 0,
    procurementDoubleDebitCandidates: 0,
    monthClosesMissingScope: 0,
    duplicateScopedMonthCloses: 0,
    anomalyCasesMissingScope: 0,
    duplicateScopedAnomalyCases: 0,
    billingReadiness: {
      schoolId,
      currentMemberships: 0,
      invalidMemberships: 0,
      billableGroups: 0,
      missingMonthlyPlanGroups: 0,
      zeroTuitionPlanGroups: 0,
      samples: {
        invalidMemberships: [],
        missingMonthlyPlans: [],
        zeroTuitionPlans: []
      }
    },
    samples: {}
  };

  try {
    const paymentSamples = [];
    const approvedPayments = await FeePayment.find({
      status: 'approved',
      ...(schoolId ? { schoolId } : {})
    })
      .select('schoolId academicYearId classId amount allocations feeOrderId paymentNumber')
      .lean();
    summary.approvedPayments = approvedPayments.length;
    const orderIds = [...new Set(approvedPayments.flatMap((payment) => [
      id(payment.feeOrderId),
      ...(payment.allocations || []).map((row) => id(row.feeOrderId))
    ]).filter(Boolean))];
    const orders = await FeeOrder.find({ _id: { $in: orderIds } })
      .select('schoolId academicYearId classId amountDue amountPaid outstandingAmount lineItems paymentBreakdown status')
      .lean();
    const orderById = new Map(orders.map((order) => [id(order), order]));
    const missingOrderSamples = [];

    for (const payment of approvedPayments) {
      if (!payment.schoolId || !payment.academicYearId) summary.paymentsMissingScope += 1;
      const allocationTotal = money((payment.allocations || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
      if (Math.abs(allocationTotal - money(payment.amount)) > 0.009) summary.paymentAllocationMismatch += 1;
      const linkedOrderIds = [...new Set([
        id(payment.feeOrderId),
        ...(payment.allocations || []).map((row) => id(row.feeOrderId))
      ].filter(Boolean))];
      const missingOrderIds = linkedOrderIds.filter((orderId) => !orderById.has(orderId));
      if (!linkedOrderIds.length || missingOrderIds.length) {
        summary.paymentMissingOrderLinks += 1;
        if (missingOrderSamples.length < 10) {
          missingOrderSamples.push({
            paymentNumber: payment.paymentNumber || id(payment),
            missingOrderIds: missingOrderIds.length ? missingOrderIds : ['unlinked']
          });
        }
      }
      const linked = orderById.get(id(payment.feeOrderId)) || orderById.get(id(payment.allocations?.[0]?.feeOrderId));
      if (linked && (
        (payment.schoolId && linked.schoolId && id(payment.schoolId) !== id(linked.schoolId))
        || (payment.academicYearId && linked.academicYearId && id(payment.academicYearId) !== id(linked.academicYearId))
      )) {
        summary.paymentOrderScopeMismatch += 1;
        if (paymentSamples.length < 10) paymentSamples.push(payment.paymentNumber || id(payment));
      }
    }

    const treasuryGroups = new Set((await FinanceTreasuryTransaction.find({ sourceType: 'fee_payment', status: 'posted' })
      .select('transactionGroupKey').lean()).map((row) => String(row.transactionGroupKey || '')));
    summary.approvedPaymentsMissingTreasury = approvedPayments.filter((payment) => !treasuryGroups.has(`fee-payment:${id(payment)}`)).length;

    for (const order of orders) {
      if (order.status === 'void') continue;
      const expectedOutstanding = money(Math.max(0, Number(order.amountDue || 0) - Number(order.amountPaid || 0)));
      if (Math.abs(expectedOutstanding - money(order.outstandingAmount)) > 0.009) summary.inconsistentOrders += 1;
    }

    const linkedExpenses = await ExpenseEntry.find({
      status: 'approved',
      procurementCommitmentId: { $ne: null },
      treasuryAccountId: { $ne: null }
    }).select('procurementCommitmentId').lean();
    const commitmentIds = [...new Set(linkedExpenses.map((row) => id(row.procurementCommitmentId)).filter(Boolean))];
    const settledCommitments = await FinanceProcurementCommitment.countDocuments({
      _id: { $in: commitmentIds },
      'settlements.0': { $exists: true }
    });
    summary.procurementDoubleDebitCandidates = settledCommitments;

    summary.monthClosesMissingScope = await FinanceMonthClose.countDocuments({
      $or: [
        { schoolId: null }, { schoolId: { $exists: false } },
        { financialYearId: null }, { financialYearId: { $exists: false } }
      ]
    });
    const duplicateMonthGroups = await FinanceMonthClose.aggregate([
      { $match: { schoolId: { $ne: null }, financialYearId: { $ne: null } } },
      { $group: { _id: { schoolId: '$schoolId', financialYearId: '$financialYearId', monthKey: '$monthKey' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' }
    ]);
    summary.duplicateScopedMonthCloses = Number(duplicateMonthGroups[0]?.total || 0);
    summary.anomalyCasesMissingScope = await FinanceAnomalyCase.countDocuments({
      $or: [{ schoolId: null }, { schoolId: { $exists: false } }]
    });
    const duplicateAnomalyGroups = await FinanceAnomalyCase.aggregate([
      { $match: { schoolId: { $ne: null } } },
      { $group: { _id: { schoolId: '$schoolId', anomalyId: '$anomalyId' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $count: 'total' }
    ]);
    summary.duplicateScopedAnomalyCases = Number(duplicateAnomalyGroups[0]?.total || 0);
    summary.samples.paymentMissingOrderLinks = missingOrderSamples;
    summary.samples.paymentOrderScopeMismatch = paymentSamples;

    const classes = await SchoolClass.find(schoolId ? { schoolId } : {})
      .select('_id schoolId legacyCourseId title')
      .lean();
    const classById = new Map(classes.map((item) => [id(item), item]));
    const classIds = [...classById.keys()];
    const membershipScope = schoolId
      ? { $or: [{ schoolId }, { classId: { $in: classIds } }] }
      : {};
    const memberships = await StudentMembership.find({
      ...membershipScope,
      isCurrent: true,
      status: { $in: ['active', 'transferred_in'] }
    }).select('_id student studentId schoolId classId course academicYear academicYearId status').lean();
    summary.billingReadiness.currentMemberships = memberships.length;

    const groups = new Map();
    for (const membership of memberships) {
      const schoolClass = classById.get(id(membership.classId));
      const resolvedSchoolId = id(membership.schoolId) || id(schoolClass?.schoolId);
      const resolvedAcademicYearId = id(membership.academicYearId || membership.academicYear);
      const missing = [
        !id(membership.student) && !id(membership.studentId) ? 'student' : '',
        !resolvedSchoolId ? 'schoolId' : '',
        !id(membership.classId) ? 'classId' : '',
        id(membership.classId) && !schoolClass ? 'classReference' : '',
        !id(membership.course) ? 'course' : '',
        !resolvedAcademicYearId ? 'academicYearId' : '',
        schoolId && resolvedSchoolId && resolvedSchoolId !== schoolId ? 'schoolOwnership' : '',
        id(membership.schoolId) && id(schoolClass?.schoolId)
          && id(membership.schoolId) !== id(schoolClass.schoolId) ? 'classSchoolMismatch' : ''
      ].filter(Boolean);
      if (missing.length) {
        summary.billingReadiness.invalidMemberships += 1;
        if (summary.billingReadiness.samples.invalidMemberships.length < 20) {
          summary.billingReadiness.samples.invalidMemberships.push({
            membershipId: id(membership),
            missing
          });
        }
        continue;
      }
      const group = {
        schoolId: resolvedSchoolId,
        classId: id(membership.classId),
        courseId: id(membership.course),
        academicYearId: resolvedAcademicYearId
      };
      const key = [group.schoolId, group.classId, group.courseId, group.academicYearId].join('|');
      if (!groups.has(key)) groups.set(key, group);
    }
    summary.billingReadiness.billableGroups = groups.size;

    for (const group of groups.values()) {
      const plan = await resolveFeePlanForBilling({
        ...group,
        billingFrequency: 'monthly',
        effectiveAt: new Date()
      });
      const sample = {
        classId: group.classId,
        courseId: group.courseId,
        academicYearId: group.academicYearId
      };
      if (!plan) {
        summary.billingReadiness.missingMonthlyPlanGroups += 1;
        if (summary.billingReadiness.samples.missingMonthlyPlans.length < 20) {
          summary.billingReadiness.samples.missingMonthlyPlans.push(sample);
        }
        continue;
      }
      if (Number(plan.tuitionFee || plan.amount || 0) <= 0) {
        summary.billingReadiness.zeroTuitionPlanGroups += 1;
        if (summary.billingReadiness.samples.zeroTuitionPlans.length < 20) {
          summary.billingReadiness.samples.zeroTuitionPlans.push({
            ...sample,
            planId: id(plan),
            planCode: String(plan.planCode || '')
          });
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
    if (
      summary.paymentsMissingScope
      || summary.paymentAllocationMismatch
      || summary.paymentMissingOrderLinks
      || summary.paymentOrderScopeMismatch
      || summary.approvedPaymentsMissingTreasury
      || summary.inconsistentOrders
      || summary.procurementDoubleDebitCandidates
      || summary.monthClosesMissingScope
      || summary.duplicateScopedMonthCloses
      || summary.anomalyCasesMissingScope
      || summary.duplicateScopedAnomalyCases
      || summary.billingReadiness.invalidMemberships
      || summary.billingReadiness.missingMonthlyPlanGroups
      || summary.billingReadiness.zeroTuitionPlanGroups
    ) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[audit:finance-integrity] failed:', error?.stack || error);
  process.exitCode = 1;
});
