// The finance side of a promotion batch against a real MongoDB: the preview
// shows each student's source-year debt, the documents dated after they leave
// the class and their reliefs; applying voids the unpaid after-end bills
// (unless the month is closed), turns a paid one into a refund case for credit
// on the new year, never touches the debt or a second-chance exam fee, makes
// the new membership billable without a second admission fee, and carries the
// chosen reliefs over (for a held student, when the second chance is
// decided); a rollback cancels the carried reliefs.
// Promotion needs transactions, so on a standalone server this reports SKIP.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const Discount = require('../models/Discount');
const ExamResult = require('../models/ExamResult');
const ExamSession = require('../models/ExamSession');
const FeeExemption = require('../models/FeeExemption');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceRefund = require('../models/FinanceRefund');
const FinanceRelief = require('../models/FinanceRelief');
const PromotionBatch = require('../models/PromotionBatch');
const PromotionRule = require('../models/PromotionRule');
const PromotionTransaction = require('../models/PromotionTransaction');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const { buildGroupedBillCandidates } = require('../services/feeBillingService');
const {
  applyPromotions,
  previewPromotions,
  resolveHeldPromotion,
  rollbackPromotionTransaction
} = require('../services/promotionService');
const { createDiscount, createFeeExemption } = require('../services/studentFinanceService');
const { PROMOTION_VOID_REASON } = require('../services/promotionFinanceService');

const DB_NAME = 'school_promotion_finance_check';
const id = () => new mongoose.Types.ObjectId();
const SCHOOL_ID = id();
const day = (value) => new Date(`${value}T00:00:00Z`);

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

let documentCounter = 0;
// A bill and its canonical fee-order mirror, as the finance routes leave them.
async function insertBill(membership, { dueDate, amountDue, amountPaid = 0, status = 'new', periodLabel = '', periodType = 'monthly' }) {
  documentCounter += 1;
  const billId = id();
  const common = {
    schoolId: SCHOOL_ID,
    student: membership.student,
    studentMembershipId: membership._id,
    classId: membership.classId,
    academicYearId: membership.academicYearId,
    periodType,
    periodLabel,
    feeScopes: ['tuition'],
    amountOriginal: amountDue,
    amountDue,
    amountPaid,
    status,
    dueDate: day(dueDate),
    currency: 'AFN',
    createdAt: new Date()
  };
  await FinanceBill.collection.insertOne({ _id: billId, billNumber: `CHK-B-${documentCounter}`, ...common });
  await FeeOrder.collection.insertOne({ _id: id(), orderNumber: `CHK-O-${documentCounter}`, sourceBillId: billId, ...common });
  return billId;
}

async function seed() {
  const y1405 = await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1405', code: 'Y1405', sequence: 1, status: 'active', isActive: true, startDate: day('2026-03-21'), endDate: day('2027-03-20') });
  const y1406 = await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1406', code: 'Y1406', sequence: 2, status: 'planning', startDate: day('2027-03-21'), endDate: day('2028-03-19') });
  const shiftId = id();
  const makeClass = (code, year, gradeLevel, section = 'الف') => SchoolClass.create({
    schoolId: SCHOOL_ID, title: `صنف ${gradeLevel} ${section} (${code})`, titleDari: `صنف ${gradeLevel} ${section}`, titlePashto: `ټولګی ${gradeLevel}`,
    code, academicYearId: year._id, shiftId, gradeLevel, section, genderType: 'female', capacity: 30, legacyCourseId: id()
  });
  const classes = {
    c5a: await makeClass('C5A', y1405, 5),
    c6a: await makeClass('N6A', y1406, 6),
    c6b: await makeClass('N6B', y1406, 6, 'ب')
  };
  await FinanceFeePlan.create({
    title: 'فیس صنف ششم ۱۴۰۶', course: classes.c6a.legacyCourseId, classId: classes.c6a._id, academicYearId: y1406._id,
    schoolId: SCHOOL_ID, billingFrequency: 'term', tuitionFee: 5000, admissionFee: 800, isActive: true
  });

  const rule = await PromotionRule.create({
    name: 'Result status rule', code: 'CHECK-FINANCE', scope: 'global', evaluationMode: 'result_status',
    promotedStatuses: ['passed'], conditionalStatuses: ['conditional'], repeatedStatuses: ['failed'], isActive: true
  });
  const sessionId = id();
  await ExamSession.collection.insertOne({ _id: sessionId, title: 'Annual 5A', code: 'S5A', academicYearId: y1405._id, classId: classes.c5a._id, examTypeId: id(), assessmentPeriodId: id(), status: 'published' });

  const students = {};
  for (const [key, resultStatus] of [['A', 'passed'], ['B', 'passed'], ['C', 'conditional'], ['D', 'passed']]) {
    const userId = id();
    await User.collection.insertOne({ _id: userId, name: `Student ${key}`, email: `${key.toLowerCase()}@promotion-finance.check`, role: 'student' });
    const membership = await StudentMembership.create({
      student: userId, course: classes.c5a.legacyCourseId, classId: classes.c5a._id, academicYearId: y1405._id,
      status: 'active', enrolledAt: day('2026-03-21')
    });
    await ExamResult.collection.insertOne({
      sessionId, studentMembershipId: membership._id, student: userId, academicYearId: y1405._id, classId: classes.c5a._id,
      examTypeId: id(), assessmentPeriodId: id(), resultStatus, percentage: 70, createdAt: new Date()
    });
    students[key] = { userId, membership };
  }

  // Reliefs first: registering one adjusts the student's open bills.
  const discountA = await createDiscount({ studentMembershipId: students.A.membership._id, discountType: 'discount', coverageMode: 'percent', percentage: 20, reason: 'خواهر و برادر', durationMode: 'academic_year' });
  const discountB = await createDiscount({ studentMembershipId: students.B.membership._id, discountType: 'discount', coverageMode: 'fixed', amount: 300, reason: 'فرزند کارمند', durationMode: 'academic_year' });
  const exemptionC = await createFeeExemption({ studentMembershipId: students.C.membership._id, exemptionType: 'full', scope: 'all', reason: 'یتیم' });

  // A leaves 5 الف on 19 Qaws 1405 (10 Dec 2026); the next Afghan month (Jadi) starts on 22 Dec.
  const billsA = {
    debt: await insertBill(students.A.membership, { dueDate: '2026-10-05', amountDue: 1000 }),
    afterEndUnpaid: await insertBill(students.A.membership, { dueDate: '2027-01-05', amountDue: 1000 }),
    afterEndPaid: await insertBill(students.A.membership, { dueDate: '2027-02-05', amountDue: 1000, amountPaid: 1000, status: 'paid' }),
    afterEndClosedMonth: await insertBill(students.A.membership, { dueDate: '2027-03-01', amountDue: 1000 }),
    secondChanceFee: await insertBill(students.A.membership, { dueDate: '2027-01-15', amountDue: 200, periodLabel: 'فیس امتحان چانس دوم', periodType: 'custom' })
  };
  await FinanceMonthClose.collection.insertOne({
    schoolId: SCHOOL_ID, academicYearId: y1405._id, monthKey: '1405-12', status: 'closed',
    closeWindow: { startAt: day('2027-02-20'), endAt: new Date('2027-03-20T23:59:59Z') }
  });

  // R is enrolled straight into 6 الف and has never been billed admission.
  const userR = id();
  await User.collection.insertOne({ _id: userR, name: 'Student R', email: 'r@promotion-finance.check', role: 'student' });
  const membershipR = await StudentMembership.create({
    student: userR, course: classes.c6a.legacyCourseId, classId: classes.c6a._id, academicYearId: y1406._id, status: 'active', enrolledAt: day('2027-03-21')
  });

  return { y1405, y1406, classes, rule, sessionId, students, billsA, discountA, discountB, exemptionC, membershipR };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.log('check:promotion-finance SKIP (needs a replica set or mongos for transactions)');
    await mongoose.disconnect();
    return;
  }

  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([StudentMembership, PromotionTransaction, PromotionBatch, FinanceBill, FeeOrder, FinanceFeePlan, Discount, FinanceRelief]
    .map((model) => model.createIndexes()));

  try {
    const { y1406, classes, rule, sessionId, students, billsA, discountA, exemptionC, membershipR } = await seed();
    const payload = {
      sessionId: String(sessionId),
      ruleId: String(rule._id),
      sourceEndAt: '2026-12-10',
      studentOverrides: [{ membershipId: String(students.B.membership._id), targetClassId: String(classes.c6b._id) }],
      reliefCarryOver: [
        { membershipId: String(students.A.membership._id), reliefs: [{ sourceModel: 'discount', id: discountA.id }] },
        { membershipId: String(students.C.membership._id), reliefs: [{ sourceModel: 'fee_exemption', id: exemptionC.id }] }
      ]
    };
    const itemOf = (preview, key) => preview.items.find((item) => item.studentMembershipId === String(students[key].membership._id));
    const billStatus = async (billId) => (await FinanceBill.findById(billId).lean()).status;
    const mirrorStatus = async (billId) => (await FeeOrder.findOne({ sourceBillId: billId }).lean()).status;
    const txOf = async (key) => PromotionTransaction.findOne({ studentMembershipId: students[key].membership._id }).lean();
    const currentTarget = async (key) => StudentMembership.findOne({ student: students[key].userId, academicYearId: y1406._id, isCurrent: true }).lean();

    await check('the preview shows debt, documents after the end and reliefs per student', async () => {
      const preview = await previewPromotions(payload);
      const financeA = itemOf(preview, 'A').finance;
      assert.equal(financeA.outstanding, 1200, 'the Mizan bill and the second-chance fee are source-year debt');
      assert.deepEqual(financeA.postEndUnpaid.map((doc) => doc.number).sort(), ['CHK-O-2', 'CHK-O-4']);
      assert.deepEqual(financeA.postEndPaid.map((doc) => doc.number), ['CHK-O-3']);
      assert.deepEqual(financeA.reliefs.map((relief) => [relief.sourceModel, relief.percentage]), [['discount', 20]]);
      assert.deepEqual(itemOf(preview, 'A').reliefsToCarry, [{ sourceModel: 'discount', id: discountA.id }]);
      assert.deepEqual(itemOf(preview, 'B').reliefsToCarry, [], 'B has a discount but it was not chosen');
      assert.deepEqual(itemOf(preview, 'C').reliefsToCarry, [{ sourceModel: 'fee_exemption', id: exemptionC.id }]);
      const codes = preview.plan.warnings.map((warning) => warning.code);
      assert.ok(codes.includes('source_year_debt'));
      assert.ok(codes.includes('source_post_end_documents'));
      const missingPlans = preview.plan.warnings.filter((warning) => warning.code === 'target_fee_plan_missing').map((warning) => warning.classId);
      assert.deepEqual(missingPlans, [String(classes.c6b._id)], 'only 6 ب has no fee plan');
      assert.deepEqual(preview.plan.blockers, []);
    });

    let batchId = '';
    await check('applying settles the documents after the end and leaves the debt alone', async () => {
      const applied = await applyPromotions(payload, null);
      batchId = applied.batch.id;
      assert.equal(await billStatus(billsA.afterEndUnpaid), 'void');
      assert.equal(await mirrorStatus(billsA.afterEndUnpaid), 'void');
      assert.equal((await FinanceBill.findById(billsA.afterEndUnpaid).lean()).voidReason, PROMOTION_VOID_REASON);
      assert.equal(await billStatus(billsA.debt), 'new', 'the source-year debt stays');
      assert.equal(await billStatus(billsA.afterEndClosedMonth), 'new', 'a closed month is left for review');
      assert.equal(await billStatus(billsA.secondChanceFee), 'new', 'the second-chance fee is never settled');
      assert.equal(await billStatus(billsA.afterEndPaid), 'paid');
      const refunds = await FinanceRefund.find({ studentMembershipId: students.A.membership._id }).lean();
      assert.equal(refunds.length, 1);
      assert.equal(String(refunds[0].bill), String(billsA.afterEndPaid));
      assert.match(refunds[0].reasonNote, /credit_next_bill/);

      const txA = await txOf('A');
      assert.equal(txA.financeEffects.outstandingAtPromotion, 1200);
      assert.equal(txA.financeEffects.voidedBills, 1);
      assert.equal(txA.financeEffects.voidedOrders, 1);
      assert.equal(txA.financeEffects.refundCases, 1);
      assert.deepEqual(txA.financeEffects.reviewRequired.map((entry) => entry.reason), ['month_closed']);
      assert.deepEqual(applied.batch.financeSummary, {
        studentsWithDebt: 1, debtAmount: 1200, voidedDocuments: 2, refundCases: 1, reviewRequired: 1, carriedReliefs: 1, failedReliefs: 0
      });
    });

    await check('the new membership is billable, with no second admission fee', async () => {
      const targetA = await currentTarget('A');
      assert.equal(targetA.status, 'active');
      assert.equal(targetA.admissionType, 'promotion');
      const { items } = await buildGroupedBillCandidates({
        schoolId: String(SCHOOL_ID),
        courseId: String(classes.c6a.legacyCourseId),
        classId: String(classes.c6a._id),
        academicYearId: String(y1406._id),
        includeAdmission: true,
        periodType: 'term',
        dueDate: day('2027-04-10')
      });
      const scopesOf = (membershipId) => items.find((item) => String(item.studentMembershipId) === String(membershipId))?.feeScopes;
      assert.deepEqual(scopesOf(targetA._id), ['tuition'], 'promoted: tuition only');
      assert.deepEqual(scopesOf(membershipR._id), ['tuition', 'admission'], 'a newly admitted student still owes admission');
    });

    await check('the chosen relief follows the student into the new year', async () => {
      const targetA = await currentTarget('A');
      const carried = await Discount.findOne({ studentMembershipId: targetA._id }).lean();
      assert.ok(carried, 'a discount exists on the new membership');
      assert.equal(carried.status, 'active');
      assert.equal(carried.percentage, 20);
      assert.equal(String(carried.academicYearId), String(y1406._id));
      assert.equal(carried.startDate.toISOString(), day('2027-03-21').toISOString(), 'from the start of the target year');
      assert.ok(await FinanceRelief.exists({ sourceKey: `discount:${carried._id}`, status: 'active' }), 'its FinanceRelief mirror exists');
      const txA = await txOf('A');
      assert.deepEqual(txA.financeEffects.carriedReliefs.map((entry) => [entry.status, entry.newId]), [['carried', String(carried._id)]]);
      const targetB = await currentTarget('B');
      assert.equal(await Discount.countDocuments({ studentMembershipId: targetB._id }), 0, 'B chose nothing');
      assert.equal((await Discount.findById(discountA.id).lean()).status, 'active', 'the source-year discount is untouched');
    });

    await check('a held student carries their relief when the second chance is decided', async () => {
      const txC = await txOf('C');
      assert.equal(txC.transactionStatus, 'held');
      assert.deepEqual(txC.financeEffects.plannedReliefs, [{ sourceModel: 'fee_exemption', id: exemptionC.id }]);
      await resolveHeldPromotion(txC._id, { decision: 'promoted' }, null);
      const targetC = await currentTarget('C');
      assert.equal(String(targetC.classId), String(classes.c6a._id));
      const carried = await FeeExemption.findOne({ studentMembershipId: targetC._id }).lean();
      assert.ok(carried, 'the exemption followed C');
      assert.equal(carried.exemptionType, 'full');
      const resolvedTx = await txOf('C');
      assert.deepEqual(resolvedTx.financeEffects.plannedReliefs, []);
      assert.equal(resolvedTx.financeEffects.carriedReliefs[0].status, 'carried');
      assert.equal((await PromotionBatch.findById(batchId).lean()).financeSummary.carriedReliefs, 2);
    });

    await check('rolling a student back cancels the relief it carried, not the settled documents', async () => {
      const txA = await txOf('A');
      const newDiscountId = txA.financeEffects.carriedReliefs[0].newId;
      await rollbackPromotionTransaction(txA._id, { reason: 'mistake' }, null);
      assert.equal((await Discount.findById(newDiscountId).lean()).status, 'cancelled');
      assert.equal((await txOf('A')).financeEffects.carriedReliefs[0].status, 'cancelled_by_rollback');
      assert.equal((await StudentMembership.findById(students.A.membership._id).lean()).isCurrent, true);
      assert.equal(await billStatus(billsA.afterEndUnpaid), 'void', 'a voided bill is re-issued by finance if needed');
      assert.equal(await FinanceRefund.countDocuments({ studentMembershipId: students.A.membership._id }), 1);
    });
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`check:promotion-finance FAIL (${failed.length}/${results.length})`);
    process.exit(1);
  }
  console.log(`check:promotion-finance PASS (${results.length})`);
}

run().catch((error) => {
  console.error('check:promotion-finance FAIL');
  console.error(error?.stack || error);
  process.exit(1);
});
