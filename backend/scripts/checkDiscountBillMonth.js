// Which bills a discount with a date range reaches, against a real MongoDB.
// Bills are filed under the Afghan month of their due date, so a discount
// reaches the bills whose Afghan month its range overlaps: in the bill sync,
// when a discount is saved to the open bills and fee orders, and when term
// bills are issued. 1-22 September 2026 is Sonbola, 23 September - 22 October
// is Mizan. The Gregorian month (1-30 September) also put a discount from
// 1 Mizan on the Sonbola bill due 10 September, and a discount that ended on
// 31 Sonbola on the Mizan bill due 25 September.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const Discount = require('../models/Discount');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinanceRelief = require('../models/FinanceRelief');
const StudentMembership = require('../models/StudentMembership');
const { applyActiveRegistryReliefsToFinanceBill } = require('../utils/studentFinanceSync');
const { syncDiscountOpenBills } = require('../services/studentFinanceService');
const { buildGroupedBillCandidates } = require('../services/feeBillingService');

const DB_NAME = 'school_discount_bill_month_check';
const id = () => new mongoose.Types.ObjectId();
const day = (value, hour = 12) => new Date(`${value}T${String(hour).padStart(2, '0')}:00:00`);
const SCHOOL_ID = id();
// A 200 AFN discount from 1 Mizan on, and one that ran to 31 Sonbola.
const FROM_MIZAN = { startDate: day('2026-09-23', 0), endDate: null };
const UNTIL_SONBOLA = { startDate: day('2026-08-23', 0), endDate: day('2026-09-22', 0) };

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

let serial = 0;
const membership = () => ({ _id: id(), student: id(), course: id() });

async function insertDiscount(member, range) {
  serial += 1;
  const doc = {
    _id: id(),
    sourceKey: `bill-month-check:${serial}`,
    studentMembershipId: member._id,
    student: member.student,
    schoolId: SCHOOL_ID,
    discountType: 'discount',
    coverageMode: 'fixed',
    amount: 200,
    reason: `Bill month check ${serial}`,
    durationMode: 'custom_period',
    ...range,
    status: 'active',
    source: 'manual',
    createdAt: day('2026-08-20'),
    updatedAt: day('2026-08-20')
  };
  await Discount.collection.insertOne(doc);
  return doc;
}

// Unpaid 1000 AFN tuition bills, and fee orders issued without a bill.
async function insertBills(member, dueDates) {
  const docs = dueDates.map((dueDate) => ({
    _id: id(),
    billNumber: `DBM-B-${++serial}`,
    student: member.student,
    studentMembershipId: member._id,
    schoolId: SCHOOL_ID,
    course: member.course,
    periodType: 'monthly',
    currency: 'AFN',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 0,
    feeBreakdown: { tuition: 1000 },
    feeScopes: ['tuition'],
    lineItems: [],
    adjustments: [],
    status: 'new',
    issuedAt: day('2026-08-20'),
    dueDate: day(dueDate)
  }));
  await FinanceBill.collection.insertMany(docs);
  return docs.map((doc) => doc._id);
}

async function insertOrders(member, dueDates) {
  const docs = dueDates.map((dueDate) => ({
    _id: id(),
    orderNumber: `DBM-O-${++serial}`,
    orderType: 'tuition',
    source: 'manual',
    student: member.student,
    studentMembershipId: member._id,
    schoolId: SCHOOL_ID,
    periodType: 'monthly',
    currency: 'AFN',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 0,
    outstandingAmount: 1000,
    lineItems: [],
    adjustments: [],
    status: 'new',
    issuedAt: day('2026-08-20'),
    dueDate: day(dueDate)
  }));
  await FeeOrder.collection.insertMany(docs);
  return docs.map((doc) => doc._id);
}

const amountsDue = async (Model, ids) => {
  const rows = await Model.find({ _id: { $in: ids } }).select('amountDue').lean();
  const byId = new Map(rows.map((row) => [String(row._id), row.amountDue]));
  return ids.map((docId) => byId.get(String(docId)));
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  // Let every model finish the index build it starts on connect, then drop and
  // rebuild the indexes of the collections this check writes to, so a fixture
  // that breaks a unique index fails on every run.
  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([Discount, FeeOrder, FinanceBill, FinanceFeePlan, FinanceRelief, StudentMembership]
    .map((model) => model.createIndexes()));

  try {
    await check('the bill sync puts a dated discount on the bills of its Afghan months only', async () => {
      const fromMizan = membership();
      const fromMizanBills = await insertBills(fromMizan, [
        '2026-09-10', // 19 Sonbola
        '2026-10-01' // 9 Mizan
      ]);
      await insertDiscount(fromMizan, FROM_MIZAN);
      const untilSonbola = membership();
      const untilSonbolaBills = await insertBills(untilSonbola, [
        '2026-09-20', // 29 Sonbola
        '2026-09-25' // 3 Mizan
      ]);
      await insertDiscount(untilSonbola, UNTIL_SONBOLA);

      for (const billId of [...fromMizanBills, ...untilSonbolaBills]) {
        await applyActiveRegistryReliefsToFinanceBill(billId);
      }
      // By Gregorian month the discount from 1 Mizan also reached the bill due
      // 10 Sep, and the one that ran to 31 Sonbola the bill due 25 Sep.
      assert.deepStrictEqual(await amountsDue(FinanceBill, fromMizanBills), [1000, 800]);
      assert.deepStrictEqual(await amountsDue(FinanceBill, untilSonbolaBills), [800, 1000]);
    });

    await check('saving a dated discount reaches the open bills and fee orders of its Afghan months', async () => {
      const fromMizan = membership();
      const fromMizanBills = await insertBills(fromMizan, ['2026-09-10', '2026-10-01']);
      const fromMizanOrders = await insertOrders(fromMizan, ['2026-09-10', '2026-10-01']);
      await syncDiscountOpenBills(await insertDiscount(fromMizan, FROM_MIZAN));
      const untilSonbola = membership();
      const untilSonbolaBills = await insertBills(untilSonbola, ['2026-09-20', '2026-09-25']);
      const untilSonbolaOrders = await insertOrders(untilSonbola, ['2026-09-20', '2026-09-25']);
      await syncDiscountOpenBills(await insertDiscount(untilSonbola, UNTIL_SONBOLA));

      assert.deepStrictEqual(await amountsDue(FinanceBill, fromMizanBills), [1000, 800]);
      assert.deepStrictEqual(await amountsDue(FeeOrder, fromMizanOrders), [1000, 800]);
      assert.deepStrictEqual(await amountsDue(FinanceBill, untilSonbolaBills), [800, 1000]);
      assert.deepStrictEqual(await amountsDue(FeeOrder, untilSonbolaOrders), [800, 1000]);
    });

    await check('a term bill takes the reliefs of the Afghan month of its due date', async () => {
      const courseId = id();
      const academicYearId = id();
      const fromMizan = { ...membership(), course: courseId };
      const untilSonbola = { ...membership(), course: courseId };
      await StudentMembership.collection.insertMany([fromMizan, untilSonbola].map((member) => ({
        ...member,
        schoolId: SCHOOL_ID,
        academicYearId,
        status: 'active',
        isCurrent: true,
        enrolledAt: day('2026-03-21')
      })));
      const feePlanId = id();
      await FinanceFeePlan.collection.insertOne({
        _id: feePlanId,
        title: 'Term plan',
        planCode: `TERM_${++serial}`,
        planType: 'standard',
        course: courseId,
        schoolId: SCHOOL_ID,
        classId: null,
        academicYearId,
        term: '',
        billingFrequency: 'term',
        periodType: 'term',
        tuitionFee: 1000,
        amount: 1000,
        isActive: true,
        lifecycleStatus: 'active'
      });
      await insertDiscount(fromMizan, FROM_MIZAN);
      await insertDiscount(untilSonbola, UNTIL_SONBOLA);

      const issue = async (dueDate) => {
        const preview = await buildGroupedBillCandidates({
          schoolId: String(SCHOOL_ID),
          courseId: String(courseId),
          academicYearId: String(academicYearId),
          feePlanId: String(feePlanId),
          dueDate: day(dueDate),
          periodType: 'term'
        });
        const byMembership = new Map(preview.items.map((item) => [String(item.studentMembershipId), item.amountDue]));
        return [fromMizan, untilSonbola].map((member) => byMembership.get(String(member._id)));
      };
      // By Gregorian month both due dates are in September, so both students
      // got their discount on both bills.
      assert.deepStrictEqual(await issue('2026-09-10'), [1000, 800], 'due 10 Sep (19 Sonbola)');
      assert.deepStrictEqual(await issue('2026-09-25'), [800, 1000], 'due 25 Sep (3 Mizan)');
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`\nDiscount bill month: ${failed.length} of ${results.length} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nDiscount bill month passed: ${results.length} check(s).`);
}

run().catch((error) => {
  console.error('[check:discount-bill-month] failed:', error);
  process.exit(1);
});
