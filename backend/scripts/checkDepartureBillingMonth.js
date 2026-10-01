// What happens to a student's bills when they leave, against a real MongoDB.
// Bills are filed under their Afghan month, so both rules count Afghan months:
//  - a departure (transfer out, dropout, expulsion) voids the unpaid bills
//    from the Afghan month of the departure on, opens a refund case for the
//    paid ones, and leaves the months before it alone;
//  - the finance office's «ختم عضویت مالی» voids the unpaid bills from the
//    Afghan month after the stop date on, keeping the stop month's own bill.
// A Gregorian month reached back into the previous Afghan month or missed
// part of the current one, depending on the day. The read-only audit
// (listDepartureBillingMismatches.js) finds the bills that did.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const FinanceRefund = require('../models/FinanceRefund');
const { __billingTestUtils } = require('../services/studentLifecycleService');
const { BILLING_STOP_VOID_REASON, voidBillsAfterBillingStop } = require('../services/membershipBillingReconciliationService');
const { classifyMembership } = require('./listDepartureBillingMismatches');

const { reconcileFutureBillingForEndedMembership } = __billingTestUtils;
const DB_NAME = 'school_departure_billing_month_check';
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

let orderNo = 0;
async function insertOrders(membership, rows) {
  const docs = rows.map(([dueDate, status, amountPaid = 0]) => ({
    _id: id(),
    orderNumber: `DB-${++orderNo}`,
    student: membership.student,
    studentMembershipId: membership._id,
    status,
    dueDate: day(dueDate),
    amountDue: 1000,
    amountPaid,
    outstandingAmount: 1000 - amountPaid
  }));
  await FeeOrder.collection.insertMany(docs);
  return docs.map((doc) => doc._id);
}

const statusesOf = async (ids) => {
  const rows = await FeeOrder.find({ _id: { $in: ids } }).select('status').lean();
  const byId = new Map(rows.map((row) => [String(row._id), row.status]));
  return ids.map((orderId) => byId.get(String(orderId)));
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  // Let every model finish the index build it starts on connect, then drop and
  // rebuild the indexes of the collections this check writes to, so a fixture
  // that breaks a unique index fails on every run.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([FeeOrder, FinanceBill, FinanceRefund].map((model) => model.createIndexes()));

  const membership = () => ({ _id: id(), student: id(), studentId: null, schoolId: null, classId: null, academicYearId: null });

  try {
    await check('leaving on 25 Sep (3 Mizan) keeps Sonbola and voids Mizan on', async () => {
      const left = membership();
      const ids = await insertOrders(left, [
        ['2026-09-01', 'new'], // 10 Sonbola: before the departure month
        ['2026-09-10', 'partial', 300], // 19 Sonbola, part paid
        ['2026-09-24', 'new'], // 2 Mizan
        ['2026-10-25', 'overdue'] // 3 Aqrab
      ]);
      const result = await reconcileFutureBillingForEndedMembership(left, 'dropout', day('2026-09-25'), null, null);
      // From 1 September the Sonbola bill was voided and the part-paid one
      // sent to refund review.
      assert.deepStrictEqual(await statusesOf(ids), ['new', 'partial', 'void', 'void']);
      assert.strictEqual(result.orders, 2);
      assert.strictEqual(result.refundCasesCreated, 0);
    });

    await check('leaving on 5 Oct (13 Mizan) voids the Mizan bills from 23 Sep', async () => {
      const left = membership();
      const ids = await insertOrders(left, [
        ['2026-09-20', 'new'], // 29 Sonbola
        ['2026-09-27', 'new'], // 5 Mizan
        ['2026-09-28', 'partial', 200] // 6 Mizan, part paid
      ]);
      const result = await reconcileFutureBillingForEndedMembership(left, 'transfer_out', day('2026-10-05'), null, null);
      // From 1 October both Mizan bills stayed as they were.
      assert.deepStrictEqual(await statusesOf(ids), ['new', 'void', 'partial']);
      assert.strictEqual(result.refundCasesCreated, 1, 'the part-paid Mizan bill goes to refund review');
      const refund = await FinanceRefund.findOne({ feeOrder: ids[2] }).lean();
      assert.ok(refund, 'a refund case is open for the part-paid Mizan bill');
      assert.strictEqual(refund.amount, 200);
    });

    await check('a billing stop on 25 Sep keeps the rest of Mizan and voids Aqrab on', async () => {
      const stopped = membership();
      const ids = await insertOrders(stopped, [
        ['2026-10-01', 'new'], // 9 Mizan: the stop month's own bill
        ['2026-10-25', 'new'] // 3 Aqrab
      ]);
      const result = await voidBillsAfterBillingStop({ membershipId: stopped._id, stopDate: day('2026-09-25') });
      // From 1 October the Mizan bill was voided too.
      assert.deepStrictEqual(await statusesOf(ids), ['new', 'void']);
      assert.deepStrictEqual(result, { bills: 0, orders: 1 });
      const voided = await FeeOrder.findById(ids[1]).select('voidReason').lean();
      assert.strictEqual(voided.voidReason, BILLING_STOP_VOID_REASON);
    });

    await check('a billing stop on 5 Oct voids the Aqrab bill due 24 Oct', async () => {
      const stopped = membership();
      const ids = await insertOrders(stopped, [
        ['2026-10-20', 'new'], // 28 Mizan
        ['2026-10-24', 'new'] // 2 Aqrab
      ]);
      await voidBillsAfterBillingStop({ membershipId: stopped._id, stopDate: day('2026-10-05') });
      // From 1 November the Aqrab bill stayed open.
      assert.deepStrictEqual(await statusesOf(ids), ['new', 'void']);
    });
    await check('the audit lists what the Gregorian rules voided too early or left open', async () => {
      const documents = (rows) => rows.map(([dueDate, status, amountPaid = 0, voidReason = '']) => ({
        kind: 'bill',
        doc: { _id: id(), billNumber: `AU-${++orderNo}`, dueDate: day(dueDate), status, amountDue: 1000, amountPaid, voidReason }
      }));
      const dueDates = (items) => items.map((item) => item.dueDate);

      // Left on 25 Sep (3 Mizan); the Gregorian rule voided from 1 Sep.
      const early = classifyMembership({
        membership: { endedAt: day('2026-09-25'), endedReason: 'dropout' },
        documents: documents([
          ['2026-09-01', 'void', 0, 'dropout'], // 10 Sonbola
          ['2026-09-24', 'void', 0, 'dropout'], // 2 Mizan
          ['2026-09-10', 'partial', 300] // 19 Sonbola
        ])
      });
      assert.strictEqual(early.rule, 'departure');
      assert.deepStrictEqual(dueDates(early.voidedTooEarly), ['2026-09-01']);
      assert.strictEqual(early.leftOpen.length + early.paidWithoutRefund.length, 0);

      // Left on 5 Oct (13 Mizan); the Gregorian rule started on 1 Oct.
      const late = classifyMembership({
        membership: { endedAt: day('2026-10-05'), endedReason: 'transferred_out' },
        documents: documents([['2026-09-27', 'new'], ['2026-09-28', 'partial', 200], ['2026-10-02', 'void', 0, 'transfer_out']])
      });
      assert.deepStrictEqual(dueDates(late.leftOpen), ['2026-09-27']);
      assert.deepStrictEqual(dueDates(late.paidWithoutRefund), ['2026-09-28']);
      assert.strictEqual(late.voidedTooEarly.length, 0);

      // Billing stops: on 25 Sep the Gregorian rule voided from 1 Oct, on 5 Oct
      // it left Aqrab's bill of 24 Oct open.
      const stopped = classifyMembership({
        membership: { endedAt: day('2026-09-25') },
        documents: documents([['2026-10-01', 'void', 0, BILLING_STOP_VOID_REASON], ['2026-10-25', 'void', 0, BILLING_STOP_VOID_REASON]])
      });
      assert.strictEqual(stopped.rule, 'billing_stop');
      assert.deepStrictEqual(dueDates(stopped.voidedTooEarly), ['2026-10-01']);
      const stoppedLate = classifyMembership({
        membership: { endedAt: day('2026-10-05') },
        documents: documents([['2026-10-20', 'new'], ['2026-10-24', 'new']])
      });
      assert.deepStrictEqual(dueDates(stoppedLate.leftOpen), ['2026-10-24']);
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nDeparture billing month: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nDeparture billing month passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:departure-billing-month] failed:', error);
  process.exit(1);
});
