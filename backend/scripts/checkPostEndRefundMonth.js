// Money paid on bills after a student's membership ended, against a real
// MongoDB. Bills are filed under the Afghan month of their due date, so both
// the anomaly report («پرداخت بعد از ختم عضویت») and the refund backfill
// (backfillMembershipPaymentRefunds.js) look from the Afghan month after the
// one the membership ended in. 1-22 September 2026 is Sonbola, 23 September -
// 22 October is Mizan. Counting from the next Gregorian month (1 October)
// missed the Mizan bills of a membership that ended in Sonbola, and flagged
// the rest of the Mizan bills of one that ended in Mizan.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const Counter = require('../models/Counter');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const FinanceRefund = require('../models/FinanceRefund');
const StudentMembership = require('../models/StudentMembership');
const { buildMembershipFinanceAnomalies } = require('../services/financeAnomalyService');
const { backfillMembershipPaymentRefunds } = require('./backfillMembershipPaymentRefunds');

const DB_NAME = 'school_post_end_refund_month_check';
const id = () => new mongoose.Types.ObjectId();
const day = (value, hour = 12) => new Date(`${value}T${String(hour).padStart(2, '0')}:00:00`);
const SCHOOL_ID = id();

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

// Two memberships that ended either side of 1 Mizan, with what was paid on
// their bills and fee orders; `flagged` marks the payments from the Afghan
// month after the end on.
let serial = 0;
function endedMemberships() {
  const ended = (status, endedAt, documents) => ({
    _id: id(),
    student: id(),
    course: id(),
    status,
    endedAt: day(endedAt),
    documents: documents.map(([kind, dueDate, docStatus, amountPaid, flagged]) => ({
      _id: id(),
      kind,
      label: `${kind} due ${dueDate}`,
      number: `PER-${++serial}`,
      dueDate: day(dueDate),
      status: docStatus,
      amountPaid,
      flagged
    }))
  });
  return [
    // Ended on 10 Sep (19 Sonbola): the next month starts on 23 Sep, not 1 Oct.
    ended('dropped', '2026-09-10', [
      ['bill', '2026-09-20', 'paid', 1000, false], // 29 Sonbola
      ['bill', '2026-09-25', 'paid', 1000, true], // 3 Mizan
      ['order', '2026-09-28', 'partial', 300, true] // 6 Mizan
    ]),
    // Ended on 25 Sep (3 Mizan): the next month starts on 23 Oct, not 1 Oct.
    ended('transferred_out', '2026-09-25', [
      ['bill', '2026-10-01', 'paid', 1000, false], // 9 Mizan
      ['order', '2026-10-24', 'paid', 1000, true], // 2 Aqrab
      ['bill', '2026-11-01', 'new', 0, false] // 10 Aqrab, nothing paid
    ])
  ];
}

// "bill due 2026-09-25" for each flagged document id, and for the expected ones.
const labelsOf = (memberships, ids) => {
  const labels = new Map(memberships.flatMap((membership) => membership.documents)
    .map((doc) => [String(doc._id), doc.label]));
  return ids.map((docId) => labels.get(String(docId)) || `unknown ${docId}`).sort();
};
const expectedLabels = (memberships) => memberships
  .flatMap((membership) => membership.documents.filter((doc) => doc.flagged))
  .map((doc) => doc.label)
  .sort();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  // Let every model finish the index build it starts on connect, then drop and
  // rebuild the indexes of the collections this check writes to, so a fixture
  // that breaks a unique index fails on every run.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([Counter, FeeOrder, FinanceBill, FinanceRefund, StudentMembership]
    .map((model) => model.createIndexes()));

  try {
    await check('the anomaly report flags payments from the Afghan month after the end on', async () => {
      const memberships = endedMemberships();
      const flagged = memberships.flatMap((membership) => {
        const documents = membership.documents.map((doc) => ({
          id: String(doc._id),
          documentKind: doc.kind,
          [doc.kind === 'bill' ? 'billNumber' : 'orderNumber']: doc.number,
          status: doc.status,
          amountDue: 1000,
          amountPaid: doc.amountPaid,
          outstandingAmount: 1000 - doc.amountPaid,
          dueDate: doc.dueDate
        }));
        const { items } = buildMembershipFinanceAnomalies({
          membership: { _id: membership._id, status: membership.status, isCurrent: false, endedAt: membership.endedAt },
          bills: documents.filter((doc) => doc.documentKind === 'bill'),
          orders: documents.filter((doc) => doc.documentKind === 'order'),
          limit: 100
        });
        return items
          .filter((item) => item.anomalyType === 'payment_after_membership_end')
          .map((item) => item.billId || item.orderId);
      });
      // From 1 October it flagged only the bill due 1 Oct and the order due 24 Oct.
      assert.deepStrictEqual(labelsOf(memberships, flagged), expectedLabels(memberships));
    });

    await check('the refund backfill opens one case for each payment from the Afghan month after the end on', async () => {
      const memberships = endedMemberships();
      await StudentMembership.collection.insertMany(memberships.map((membership) => ({
        _id: membership._id,
        student: membership.student,
        course: membership.course,
        schoolId: SCHOOL_ID,
        status: membership.status,
        isCurrent: false,
        endedAt: membership.endedAt,
        leftAt: membership.endedAt
      })));
      const rows = (kind) => memberships.flatMap((membership) => membership.documents
        .filter((doc) => doc.kind === kind)
        .map((doc) => ({
          _id: doc._id,
          [kind === 'bill' ? 'billNumber' : 'orderNumber']: doc.number,
          student: membership.student,
          studentMembershipId: membership._id,
          schoolId: SCHOOL_ID,
          course: membership.course,
          currency: 'AFN',
          amountOriginal: 1000,
          amountDue: 1000,
          amountPaid: doc.amountPaid,
          ...(kind === 'order' ? { outstandingAmount: 1000 - doc.amountPaid } : {}),
          status: doc.status,
          dueDate: doc.dueDate
        })));
      await FinanceBill.collection.insertMany(rows('bill'));
      await FeeOrder.collection.insertMany(rows('order'));
      const expected = expectedLabels(memberships);
      const caseLabels = (summary) => labelsOf(memberships, summary.cases.map((item) => item.billId || item.feeOrderId));

      const dryRun = await backfillMembershipPaymentRefunds({ dryRun: true });
      // From 1 October it flagged only the bill due 1 Oct and the order due 24 Oct.
      assert.deepStrictEqual(caseLabels(dryRun), expected);
      assert.strictEqual(await FinanceRefund.countDocuments({}), 0, 'a dry run opens no refund case');

      const applied = await backfillMembershipPaymentRefunds({ dryRun: false });
      assert.deepStrictEqual(caseLabels(applied), expected);
      const refunds = await FinanceRefund.find({}).select('bill feeOrder amount detectionSource').lean();
      assert.deepStrictEqual(labelsOf(memberships, refunds.map((refund) => refund.bill || refund.feeOrder)), expected);
      const paid = new Map(memberships.flatMap((membership) => membership.documents).map((doc) => [String(doc._id), doc.amountPaid]));
      refunds.forEach((refund) => {
        assert.strictEqual(refund.amount, paid.get(String(refund.bill || refund.feeOrder)));
        assert.strictEqual(refund.detectionSource, 'auto_backfill');
      });

      const again = await backfillMembershipPaymentRefunds({ dryRun: false });
      assert.strictEqual(again.refundCasesCreated, 0, 'a second run opens no new case');
      assert.strictEqual(again.refundCasesAlreadyOpen, expected.length);
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nPost-end refund month: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nPost-end refund month passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:post-end-refund-month] failed:', error);
  process.exit(1);
});
