// The admin dashboard's money cards against a real MongoDB.
// «عواید کل این ماه»: "this month" is the Afghan solar month today falls in,
// counted from its 1st day, and the comparison is the whole Afghan month
// before it - not the Gregorian month, which on 1 October (9 Mizan) held only
// that day's payments. The six-month revenue and enrolment trends are Afghan
// months too.
// «بدهی باز کل»: what the bills whose Afghan month has started still owe - not
// a bill issued ahead for a later month - with the part owed by students who
// have left and the overdue bills, a bill without a due date counting from
// its issue date.
// Runs in its own throwaway database, with "now" pinned to 1 October 2026.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceRefund = require('../models/FinanceRefund');
const StudentMembership = require('../models/StudentMembership');
const { getAdminDashboard } = require('../services/dashboardService');

const DB_NAME = 'school_admin_dashboard_month_check';
const NOW = new Date('2026-10-01T10:00:00'); // 9 Mizan 1405
const id = () => new mongoose.Types.ObjectId();
const day = (value, hour = 12) => new Date(`${value}T${String(hour).padStart(2, '0')}:00:00`);

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
  // rebuild the indexes of the collections this check writes to, so a fixture
  // that breaks a unique index fails on every run.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([FeeOrder, FeePayment, FinanceRefund, StudentMembership].map((model) => model.createIndexes()));

  const activeStudent = id();
  const departedStudent = id();
  const bill = (orderNumber, fields) => ({ _id: id(), orderNumber, student: activeStudent, issuedAt: day('2026-08-01'), ...fields });
  // The Mizan bill the payments below are allocated to.
  const order = bill('AD-1', { status: 'partial', dueDate: day('2026-09-25'), amountDue: 10000, outstandingAmount: 6000 });
  await FeeOrder.collection.insertMany([
    order,
    // A departed student's Sonbola bill.
    bill('AD-2', { student: departedStudent, status: 'overdue', dueDate: day('2026-09-05'), amountDue: 3000, outstandingAmount: 3000 }),
    // Issued ahead for Aqrab: not owed yet.
    bill('AD-3', { status: 'new', dueDate: day('2026-10-25'), amountDue: 4000, outstandingAmount: 4000 }),
    // No due date, issued in Sonbola.
    bill('AD-4', { status: 'new', dueDate: null, issuedAt: day('2026-09-01'), amountDue: 500, outstandingAmount: 500 }),
    bill('AD-5', { status: 'void', dueDate: day('2026-09-10'), amountDue: 700, outstandingAmount: 700 })
  ]);
  let paymentNo = 0;
  const payment = (amount, paidAt) => ({
    _id: id(),
    paymentNumber: `AD-PAY-${++paymentNo}`,
    student: order.student,
    feeOrderId: order._id,
    amount,
    allocations: [{ feeOrderId: order._id, amount }],
    status: 'approved',
    paidAt
  });
  await FeePayment.collection.insertMany([
    payment(700, day('2026-09-25')), // 3 Mizan
    payment(300, day('2026-10-01', 9)), // 9 Mizan, today
    payment(400, day('2026-09-10')), // 19 Sonbola
    payment(650, day('2026-08-25')), // 3 Sonbola
    payment(1000, day('2026-08-10')) // 19 Asad
  ]);
  await FinanceRefund.collection.insertOne({
    _id: id(),
    refundNumber: 'AD-RF-1',
    student: order.student,
    amount: 100,
    status: 'paid',
    paidAt: day('2026-09-30') // 8 Mizan
  });
  await StudentMembership.collection.insertMany([
    { _id: id(), student: id(), status: 'active', isCurrent: false, joinedAt: day('2026-09-25'), createdAt: day('2026-09-25') },
    { _id: id(), student: id(), status: 'active', isCurrent: false, joinedAt: day('2026-09-15'), createdAt: day('2026-09-15') },
    // The debtors' own memberships, from before the trend window.
    { _id: id(), student: activeStudent, status: 'active', isCurrent: true, joinedAt: day('2025-03-21'), createdAt: day('2025-03-21') },
    { _id: id(), student: departedStudent, status: 'dropped', isCurrent: false, joinedAt: day('2025-03-21'), createdAt: day('2025-03-21'), endedAt: day('2026-09-20') }
  ]);

  try {
    const dashboard = await getAdminDashboard({ now: NOW });

    await check('this month is Mizan from its 1st day, less its refunds', async () => {
      // The Gregorian month held only 1 October: 300.
      assert.strictEqual(dashboard.summary.monthlyRevenue, 900, '700 + 300 - 100');
      assert.strictEqual(dashboard.summary.monthLabel, 'میزان ۱۴۰۵');
      assert.strictEqual(dashboard.summary.todayPayments, 1);
    });

    await check('the comparison is the whole of Sonbola', async () => {
      // The Gregorian September was 700 + 400 - 100 = 1,000.
      assert.strictEqual(dashboard.summary.previousMonthRevenue, 1050, '400 + 650');
      assert.strictEqual(dashboard.summary.previousMonthLabel, 'سنبله ۱۴۰۵');
      assert.strictEqual(dashboard.summary.monthDeltaPercent, -14.3);
    });

    await check('the revenue trend is six Afghan months, oldest first', async () => {
      assert.deepStrictEqual(dashboard.revenueTrend.map((item) => item.label), ['ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان']);
      assert.deepStrictEqual(dashboard.revenueTrend.map((item) => item.value), [0, 0, 0, 1000, 1050, 900]);
    });

    await check('open debt is what bills whose Afghan month has started still owe', async () => {
      // Every non-void bill would be 6,000 + 3,000 + 4,000 + 500.
      assert.strictEqual(dashboard.summary.outstandingAmount, 9500, 'the Aqrab bill is not owed yet');
      assert.strictEqual(dashboard.summary.totalDue, 13500);
    });

    await check("open debt names the departed students' part and the overdue bills", async () => {
      assert.strictEqual(dashboard.summary.departedOutstandingAmount, 3000);
      assert.strictEqual(dashboard.summary.departedDebtors, 1);
      assert.strictEqual(dashboard.summary.overdueOrders, 3, 'the bill without a due date is overdue from its issue date');
    });

    await check('enrolments fall in the Afghan month they joined in', async () => {
      const growth = Object.fromEntries(dashboard.studentGrowth.map((item) => [item.label, item.value]));
      assert.strictEqual(growth['میزان'], 1);
      assert.strictEqual(growth['سنبله'], 1);
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nAdmin dashboard month: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAdmin dashboard month passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:admin-dashboard-month] failed:', error);
  process.exit(1);
});
