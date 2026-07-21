require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceAnomalyCase = require('../models/FinanceAnomalyCase');
const FinanceProcurementCommitment = require('../models/FinanceProcurementCommitment');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const ExpenseEntry = require('../models/ExpenseEntry');

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const id = (value) => String(value?._id || value || '').trim();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });

  const summary = {
    mode: 'read-only',
    approvedPayments: 0,
    paymentsMissingScope: 0,
    paymentAllocationMismatch: 0,
    paymentOrderScopeMismatch: 0,
    approvedPaymentsMissingTreasury: 0,
    inconsistentOrders: 0,
    procurementDoubleDebitCandidates: 0,
    monthClosesMissingScope: 0,
    duplicateScopedMonthCloses: 0,
    anomalyCasesMissingScope: 0,
    duplicateScopedAnomalyCases: 0,
    samples: {}
  };

  try {
    const paymentSamples = [];
    const approvedPayments = await FeePayment.find({ status: 'approved' })
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

    for (const payment of approvedPayments) {
      if (!payment.schoolId || !payment.academicYearId) summary.paymentsMissingScope += 1;
      const allocationTotal = money((payment.allocations || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
      if (Math.abs(allocationTotal - money(payment.amount)) > 0.009) summary.paymentAllocationMismatch += 1;
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
    summary.samples.paymentOrderScopeMismatch = paymentSamples;

    console.log(JSON.stringify(summary, null, 2));
    if (
      summary.paymentAllocationMismatch
      || summary.paymentOrderScopeMismatch
      || summary.inconsistentOrders
      || summary.duplicateScopedMonthCloses
      || summary.duplicateScopedAnomalyCases
    ) process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[audit:finance-integrity] failed:', error?.stack || error);
  process.exitCode = 1;
});
