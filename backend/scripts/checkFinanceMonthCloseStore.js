// Month close against a real MongoDB: the period guard's window query, a
// month's closing figures on the bill-month basis (due date, issue date only
// without one), students left without a bill for the month, what changed after
// a reopen, and the year-close check counting solar months - including ones
// covered by closes made before the switch to solar months.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const FeeOrder = require('../models/FeeOrder');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinancialYear = require('../models/FinancialYear');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const guard = require('../services/financePeriodGuardService');
const { buildFinanceMonthCloseSnapshot, buildMonthCloseChangeReport } = require('../services/financeCloseService');
const { buildFinancialYearCloseReadiness } = require('../services/expenseGovernanceService');
const rules = require('../utils/financeMonthClosePeriods');

const DB_NAME = 'school_finance_month_close_check';
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
  await mongoose.connection.db.dropDatabase();

  const schoolId = id();
  const academicYearId = id();
  const financialYearId = id();
  const classId = id();
  const studentA = id();
  const studentB = id();
  // A Hamal-Hoot financial year: 12 solar months.
  const financialYear = {
    _id: financialYearId,
    schoolId,
    academicYearId,
    title: 'FY 1405',
    startDate: day('2026-03-21'),
    endDate: day('2027-03-20'),
    status: 'active',
    isActive: true,
    isClosed: false
  };
  // Raw inserts: the check is about the queries, not the models' own hooks.
  await Promise.all([
    AcademicYear.collection.insertOne({ _id: academicYearId, schoolId, title: '1405', feeBillingMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9] }),
    FinancialYear.collection.insertOne(financialYear),
    SchoolClass.collection.insertOne({ _id: classId, schoolId, academicYearId, title: 'Class 7' }),
    User.collection.insertMany([
      { _id: studentA, name: 'Student A', email: 'month-close-a@example.test', role: 'student' },
      { _id: studentB, name: 'Student B', email: 'month-close-b@example.test', role: 'student' }
    ]),
    StudentMembership.collection.insertMany([studentA, studentB].map((student) => ({
      _id: id(),
      schoolId,
      academicYearId,
      classId,
      student,
      status: 'active',
      joinedAt: day('2026-03-21')
    }))),
    FinanceFeePlan.collection.insertOne({
      _id: id(),
      schoolId,
      academicYearId,
      classId,
      isActive: true,
      lifecycleStatus: 'active',
      billingFrequency: 'monthly',
      tuitionFee: 1000,
      effectiveFrom: day('2026-03-21'),
      effectiveTo: null
    }),
    FeeOrder.collection.insertMany([
      {
        // Issued in Asad, due in Sonbola: a Sonbola bill.
        _id: id(), schoolId, academicYearId, classId, student: studentA, orderNumber: 'FO-A-06', orderType: 'tuition',
        status: 'new', amountDue: 1000, amountPaid: 0, outstandingAmount: 1000,
        issuedAt: day('2026-08-15'), dueDate: day('2026-09-05'),
        createdAt: day('2026-08-15'), updatedAt: day('2026-09-21')
      },
      {
        // Issued in Sonbola, due in Mizan: not a Sonbola bill.
        _id: id(), schoolId, academicYearId, classId, student: studentB, orderNumber: 'FO-B-07', orderType: 'tuition',
        status: 'new', amountDue: 700, amountPaid: 0, outstandingAmount: 700,
        issuedAt: day('2026-09-10'), dueDate: day('2026-09-25'),
        createdAt: day('2026-09-10'), updatedAt: day('2026-09-10')
      },
      {
        // No due date: counted by its issue date, in Sonbola.
        _id: id(), schoolId, academicYearId, classId, student: studentB, orderNumber: 'FO-B-OTHER', orderType: 'other',
        status: 'new', amountDue: 50, amountPaid: 0, outstandingAmount: 50,
        issuedAt: day('2026-09-01'), dueDate: null,
        createdAt: day('2026-09-01'), updatedAt: day('2026-09-01')
      }
    ])
  ]);
  const sonbola = rules.resolveMonthCloseWindow('1405-06', financialYear);
  let snapshot = null;

  try {
    await check('snapshot: a month\'s bills are the ones due in it, and unbilled students block the close', async () => {
      snapshot = await buildFinanceMonthCloseSnapshot('1405-06', {
        schoolId: String(schoolId),
        financialYearId: String(financialYearId),
        academicYearId: String(academicYearId),
        window: sonbola
      });
      assert.strictEqual(snapshot.totals.ordersIssuedCount, 2);
      assert.strictEqual(snapshot.totals.ordersIssuedAmount, 1050);
      assert.strictEqual(snapshot.missingMonthlyBills.count, 1, 'Student B has no Sonbola tuition bill');
      assert.strictEqual(snapshot.missingMonthlyBills.students[0].name, 'Student B');
      assert.strictEqual(snapshot.missingMonthlyBills.amount, 1000);
      assert.ok(snapshot.readiness.blockingIssues.some((item) => item.code === 'missing_monthly_bills'));
      assert.strictEqual(snapshot.readiness.readyToApprove, false);
      assert.strictEqual(snapshot.fingerprint, rules.buildMonthCloseFingerprint(snapshot.totals));
      assert.strictEqual(new Date(snapshot.window.startAt).getTime(), sonbola.startAt.getTime());
    });

    await check('snapshot: a month outside the billing months does not ask for monthly bills', async () => {
      const hoot = rules.resolveMonthCloseWindow('1405-12', financialYear);
      const result = await buildFinanceMonthCloseSnapshot('1405-12', {
        schoolId: String(schoolId),
        financialYearId: String(financialYearId),
        academicYearId: String(academicYearId),
        window: hoot
      });
      assert.strictEqual(result.missingMonthlyBills.count, 0);
    });

    await check('change report: lists what was edited inside the month after a reopen', async () => {
      const report = await buildMonthCloseChangeReport({
        schoolId: String(schoolId),
        academicYearId: String(academicYearId),
        window: sonbola,
        since: day('2026-09-20')
      });
      assert.strictEqual(report.bills.count, 1);
      assert.strictEqual(report.bills.added, 0);
      assert.strictEqual(report.bills.items[0].number, 'FO-A-06');
      assert.strictEqual(report.total, 1);
    });

    await check('month close record: saves windows, versions and review fields', async () => {
      const record = await FinanceMonthClose.create({
        schoolId,
        financialYearId,
        academicYearId,
        monthKey: '1405-06',
        status: 'closed',
        closedAt: new Date(),
        closeWindow: { startAt: sonbola.startAt, endAt: sonbola.endAt },
        snapshot,
        reviewFingerprint: snapshot.fingerprint,
        snapshotVersions: [{
          version: 1,
          reason: 'close',
          fingerprint: snapshot.fingerprint,
          totals: snapshot.totals,
          diff: rules.diffMonthCloseTotals({}, snapshot.totals),
          changes: null
        }]
      });
      const stored = await FinanceMonthClose.findById(record._id).lean();
      assert.strictEqual(stored.approvalStage, 'completed');
      assert.strictEqual(stored.snapshot.fingerprint, snapshot.fingerprint);
      assert.strictEqual(stored.snapshotVersions[0].totals.ordersIssuedAmount, 1050);
      assert.ok(stored.snapshotVersions[0].diff.some((row) => row.key === 'ordersIssuedAmount'));
    });

    await check('guard: the stored window locks exactly the month\'s days', async () => {
      const scope = { schoolId: String(schoolId), financialYearId: String(financialYearId) };
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-08-23', 9), scope), true);
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-09-22', 23), scope), true);
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-09-23', 1), scope), false);
      await assert.rejects(
        guard.assertFinancePeriodWritable({ ...scope, dateValue: day('2026-09-05', 10) }),
        (error) => error.code === 'finance_month_closed' && error.messageDari.includes('سنبله')
      );
      await FinanceMonthClose.updateOne({ monthKey: '1405-06', schoolId }, {
        $set: { status: 'reopened', reopenDeadline: new Date(Date.now() + 60 * 60 * 1000) }
      });
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-09-05', 10), scope), false);
      await FinanceMonthClose.updateOne({ monthKey: '1405-06', schoolId }, { $set: { reopenDeadline: new Date(Date.now() - 1000) } });
      assert.strictEqual((await guard.findLockingMonthClose(day('2026-09-05', 10), scope))?.reason, 'reopen_expired');
      await FinanceMonthClose.updateOne({ monthKey: '1405-06', schoolId }, { $set: { status: 'closed', reopenDeadline: null } });
    });

    await check('guard and year close: closes made before the switch still count', async () => {
      // Stored without a window, like the oldest records.
      await FinanceMonthClose.collection.insertMany([
        { schoolId, financialYearId, academicYearId, monthKey: '2026-07', status: 'closed' },
        { schoolId, financialYearId, academicYearId, monthKey: '2026-08', status: 'closed' }
      ]);
      const scope = { schoolId: String(schoolId), financialYearId: String(financialYearId) };
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-07-10', 12), scope), true);
      assert.strictEqual(await guard.isFinanceMonthClosed(day('2026-06-30', 12), scope), false);

      const readiness = await buildFinancialYearCloseReadiness({ financialYearId: String(financialYearId), items: [] });
      assert.strictEqual(readiness.counts.expectedMonthCount, 12);
      const missing = readiness.counts.missingClosedMonths;
      assert.ok(!missing.includes('1405-05'), 'Asad is covered by the July and August closes');
      assert.ok(!missing.includes('1405-06'), 'Sonbola has its own close');
      assert.ok(missing.includes('1405-04'), 'Saratan is only partly covered');
      assert.strictEqual(missing.length, 10);
      assert.ok(readiness.blockers.some((line) => line.includes('10 ماه') && line.includes('حمل')));
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nFinance month close store: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nFinance month close store passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:finance-month-close-store] failed:', error);
  process.exit(1);
});
