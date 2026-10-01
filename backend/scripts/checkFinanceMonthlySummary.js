// The monthly report («گزارش ماهانه») against a real MongoDB: net income is
// the cash received in the month minus the refunds paid out in it, the same
// as the finance dashboard. Discounts and exemptions are reported on their own,
// never subtracted from that cash a second time (a bill's payable amount is
// already net of them), and only up to what each bill actually deducted.
// Refunds count for the report's own school only.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRefund = require('../models/FinanceRefund');
const SchoolClass = require('../models/SchoolClass');
const User = require('../models/User');
const { runReport } = require('../services/reportEngineService');

const DB_NAME = 'school_finance_monthly_summary_check';
const MIZAN = '1405-07'; // 23 Sep - 22 Oct 2026
const id = () => new mongoose.Types.ObjectId();
const day = (value, hour = 0) => new Date(`${value}T${String(hour).padStart(2, '0')}:00:00`);

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.error(`FAIL  ${name}\n      ${error.stack || error.message}`);
  }
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  // Let every model finish the index build it starts on connect, then drop and
  // rebuild the indexes of the collections this check writes to. A fixture
  // that breaks a unique index then fails every time, not only when the build
  // happens to win the race against the inserts.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([AcademicYear, FeeOrder, FeePayment, FinanceRefund, SchoolClass, User].map((model) => model.createIndexes()));

  const schoolA = id();
  const schoolB = id();
  const yearA = id();
  const yearB = id();
  const classA = id();
  const classB = id();
  const students = [id(), id(), id(), id()];
  await Promise.all([
    AcademicYear.collection.insertMany([
      { _id: yearA, schoolId: schoolA, title: '1405 A' },
      { _id: yearB, schoolId: schoolB, title: '1405 B' }
    ]),
    SchoolClass.collection.insertMany([
      { _id: classA, schoolId: schoolA, academicYearId: yearA, title: 'Class A' },
      { _id: classB, schoolId: schoolB, academicYearId: yearB, title: 'Class B' }
    ]),
    User.collection.insertMany(students.map((_id, index) => ({
      _id,
      name: `Student ${index + 1}`,
      email: `monthly-summary-${index + 1}@example.test`,
      role: 'student'
    })))
  ]);

  // Bills go through the model, so their line items carry the reductions the
  // pre-validate hook really applied.
  let orderNo = 0;
  const createOrder = ({ student, dueDate, adjustments = [], amountPaid = 0 }) => FeeOrder.create({
    orderNumber: `MS-${++orderNo}`,
    student,
    schoolId: schoolA,
    classId: classA,
    academicYearId: yearA,
    periodType: 'monthly',
    dueDate,
    amountOriginal: 1000,
    amountPaid,
    adjustments
  });
  // Mizan's own bills: a full exemption with a discount stacked on top
  // (1,200 granted on a 1,000 bill), a paid discounted bill and an unpaid one.
  const exempted = await createOrder({
    student: students[0],
    dueDate: day('2026-10-05', 12),
    adjustments: [{ type: 'waiver', scope: 'all', amount: 1000 }, { type: 'discount', scope: 'tuition', amount: 200 }]
  });
  const paidDiscounted = await createOrder({
    student: students[1],
    dueDate: day('2026-10-05', 12),
    adjustments: [{ type: 'discount', scope: 'tuition', amount: 200 }],
    amountPaid: 800
  });
  await createOrder({
    student: students[2],
    dueDate: day('2026-10-05', 12),
    adjustments: [{ type: 'discount', scope: 'tuition', amount: 400 }]
  });
  // Sonbola arrears and an Aqrab advance, both paid during Mizan.
  const sonbola = await createOrder({ student: students[1], dueDate: day('2026-09-05', 12), amountPaid: 500 });
  const aqrab = await createOrder({ student: students[2], dueDate: day('2026-11-05', 12), amountPaid: 300 });

  let paymentNo = 0;
  const payment = (feeOrder, amount, paidAt) => ({
    _id: id(),
    paymentNumber: `MS-PAY-${++paymentNo}`,
    student: feeOrder.student,
    feeOrderId: feeOrder._id,
    schoolId: schoolA,
    classId: classA,
    academicYearId: yearA,
    amount,
    allocations: [{ feeOrderId: feeOrder._id, amount }],
    status: 'approved',
    paidAt
  });
  await FeePayment.collection.insertMany([
    payment(paidDiscounted, 800, day('2026-10-01', 10)),
    payment(sonbola, 500, day('2026-10-02', 10)),
    payment(aqrab, 300, day('2026-10-03', 10))
  ]);

  const refund = (refundNumber, schoolId, classId, amount) => ({
    _id: id(),
    refundNumber,
    student: students[3],
    schoolId,
    classId,
    amount,
    status: 'paid',
    paidAt: day('2026-10-04', 10)
  });
  await FinanceRefund.collection.insertMany([
    refund('RF-A-1', schoolA, classA, 100),
    // The class link was lost with the membership; the school is not.
    refund('RF-A-2', schoolA, null, 50),
    refund('RF-B-1', schoolB, classB, 5000)
  ]);

  const summaryFor = async (filters) => (await runReport('fee_monthly_summary', { month: MIZAN, ...filters })).summary;

  try {
    await check('bills carry the capped reduction the report reads', async () => {
      const stored = await FeeOrder.findById(exempted._id).lean();
      const deducted = stored.lineItems.reduce((sum, item) => sum + Number(item.reductionAmount || 0), 0);
      assert.strictEqual(deducted, 1000, 'a 1,000 bill cannot lose more than 1,000');
      assert.strictEqual(stored.amountDue, 0);
    });

    await check('net income is cash in minus refunds, never minus discounts', async () => {
      const summary = await summaryFor({ schoolId: String(schoolA) });
      assert.strictEqual(summary.grossMonthlyIncome, 1600);
      assert.strictEqual(summary.pastMonthsCollectedThisMonth, 500);
      assert.strictEqual(summary.futureMonthsCollectedThisMonth, 300);
      assert.strictEqual(summary.refundsDeducted, 150);
      // The old formula took the discounts off again: 1,600 - 1,800 - 5,150.
      assert.strictEqual(summary.netMonthlyIncome, 1450);
    });

    await check('discounts and exemptions are reported beside it, capped per bill', async () => {
      const summary = await summaryFor({ schoolId: String(schoolA) });
      assert.strictEqual(summary.discountExemptionThisMonth, 1600, '1,000 exemption (not 1,200) + 200 + 400');
      assert.strictEqual(summary.payableThisMonth, 1400);
      assert.strictEqual(summary.currentMonthApprovedCollection, 800);
      assert.strictEqual(summary.outstandingThisMonth, 600);
      assert.strictEqual(summary.totalOrders, 3);
      assert.ok(!('discountExemptionDeducted' in summary));
    });

    await check("another school's refunds stay out of the month", async () => {
      const schoolBSummary = await summaryFor({ schoolId: String(schoolB) });
      assert.strictEqual(schoolBSummary.refundsDeducted, 5000);
      assert.strictEqual(schoolBSummary.grossMonthlyIncome, 0);
      const classSummary = await summaryFor({ schoolId: String(schoolA), classId: String(classA) });
      assert.strictEqual(classSummary.refundsDeducted, 100, 'a class filter keeps only that class');
      assert.strictEqual(classSummary.netMonthlyIncome, 1500);
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nFinance monthly summary: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nFinance monthly summary passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:finance-monthly-summary] failed:', error);
  process.exit(1);
});
