// A whole class promoted against a real MongoDB: preview → apply (one
// transaction, one PromotionBatch) → rollback of one student and of the whole
// batch → re-apply → the second-chance decision for a held (مشروط) student →
// class-12 graduation. Promotion needs multi-document transactions, so on a
// standalone server (CI's mongo:7) the check reports SKIP instead of failing.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const AfghanStudent = require('../models/AfghanStudent');
const ExamResult = require('../models/ExamResult');
const ExamSession = require('../models/ExamSession');
const FinanceBill = require('../models/FinanceBill');
const PromotionBatch = require('../models/PromotionBatch');
const PromotionRule = require('../models/PromotionRule');
const PromotionTransaction = require('../models/PromotionTransaction');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const {
  applyPromotions,
  getPromotionBatch,
  getPromotionYearBoard,
  previewPromotions,
  resolveHeldPromotion,
  rollbackPromotionBatch,
  rollbackPromotionTransaction
} = require('../services/promotionService');

const DB_NAME = 'school_promotion_batch_flow_check';
const id = () => new mongoose.Types.ObjectId();
const SCHOOL_ID = id();
const SHIFT_ID = id();

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

async function expectError(promise, code) {
  try {
    await promise;
  } catch (error) {
    assert.equal(error.message, code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

async function seed() {
  const years = {
    y1405: await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1405', code: 'Y1405', sequence: 1, status: 'active', isActive: true, startDate: new Date('2026-03-21T00:00:00Z'), endDate: new Date('2027-03-20T00:00:00Z') }),
    y1406: await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1406', code: 'Y1406', sequence: 2, status: 'planning', startDate: new Date('2027-03-21T00:00:00Z'), endDate: new Date('2028-03-19T00:00:00Z') })
  };
  const makeClass = (key, year, gradeLevel, section, genderType = 'female') => SchoolClass.create({
    schoolId: SCHOOL_ID,
    title: `صنف ${gradeLevel} ${section} (${key})`,
    titleDari: `صنف ${gradeLevel} ${section}`,
    titlePashto: `ټولګی ${gradeLevel} ${section}`,
    code: key,
    academicYearId: year._id,
    shiftId: SHIFT_ID,
    gradeLevel,
    section,
    genderType,
    capacity: 30,
    legacyCourseId: id()
  });
  const classes = {
    c5a: await makeClass('C5A', years.y1405, 5, 'الف'),
    c12a: await makeClass('C12A', years.y1405, 12, 'الف'),
    c6a: await makeClass('N6A', years.y1406, 6, 'الف'),
    c6aMale: await makeClass('N6A-M', years.y1406, 6, 'الف', 'male'),
    c6b: await makeClass('N6B', years.y1406, 6, 'ب'),
    c5aNext: await makeClass('N5A', years.y1406, 5, 'الف')
  };

  const rule = await PromotionRule.create({
    name: 'Result status rule',
    code: 'CHECK-RESULT-STATUS',
    scope: 'global',
    evaluationMode: 'result_status',
    promotedStatuses: ['passed'],
    conditionalStatuses: ['conditional'],
    repeatedStatuses: ['failed'],
    isActive: true
  });

  const session5 = new mongoose.Types.ObjectId();
  const session12 = new mongoose.Types.ObjectId();
  await ExamSession.collection.insertMany([
    { _id: session5, title: 'Annual 5A', code: 'S5A', academicYearId: years.y1405._id, classId: classes.c5a._id, examTypeId: id(), assessmentPeriodId: id(), status: 'published' },
    { _id: session12, title: 'Annual 12A', code: 'S12A', academicYearId: years.y1405._id, classId: classes.c12a._id, examTypeId: id(), assessmentPeriodId: id(), status: 'published' }
  ]);

  // key, class, session, result status, membership status
  const plan = [
    ['A', classes.c5a, session5, 'passed', 'active'],
    ['B', classes.c5a, session5, 'failed', 'active'],
    ['C', classes.c5a, session5, 'conditional', 'active'],
    ['D', classes.c5a, session5, 'passed', 'active'],
    ['E', classes.c5a, session5, 'absent', 'active'],
    ['F', classes.c5a, session5, 'passed', 'dropped'],
    ['G', classes.c5a, session5, 'passed', 'active'],
    ['H', classes.c5a, session5, 'passed', 'active'],
    ['T', classes.c12a, session12, 'passed', 'active']
  ];
  const students = {};
  for (const [key, schoolClass, sessionId, resultStatus, status] of plan) {
    const userId = id();
    await User.collection.insertOne({ _id: userId, name: `Student ${key}`, email: `${key.toLowerCase()}@promotion.check`, role: 'student' });
    const afghanStudentId = id();
    await AfghanStudent.collection.insertOne({
      _id: afghanStudentId,
      linkedUserId: userId,
      asasNumber: `ASAS-${key}`,
      status: 'active',
      academicInfo: { classId: schoolClass._id, currentClassId: schoolClass._id, academicYearId: years.y1405._id }
    });
    const membership = await StudentMembership.create({
      student: userId,
      afghanStudentId,
      course: schoolClass.legacyCourseId,
      classId: schoolClass._id,
      academicYearId: years.y1405._id,
      status,
      enrolledAt: new Date('2026-03-21T00:00:00Z')
    });
    await ExamResult.collection.insertOne({
      sessionId,
      studentMembershipId: membership._id,
      student: userId,
      academicYearId: years.y1405._id,
      classId: schoolClass._id,
      examTypeId: id(),
      assessmentPeriodId: id(),
      resultStatus,
      percentage: resultStatus === 'passed' ? 80 : 40,
      createdAt: new Date()
    });
    students[key] = { userId, afghanStudentId, membership };
  }

  // H already sits in grade 6 ب of the next year (enrolled by hand).
  students.H.nextYearMembership = await StudentMembership.create({
    student: students.H.userId,
    course: classes.c6b.legacyCourseId,
    classId: classes.c6b._id,
    academicYearId: years.y1406._id,
    status: 'active'
  });

  return { years, classes, rule, session5, session12, students };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.log('check:promotion-batch-flow SKIP (needs a replica set or mongos for transactions)');
    await mongoose.disconnect();
    return;
  }

  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([StudentMembership, PromotionTransaction, PromotionBatch, SchoolClass, AcademicYear].map((model) => model.createIndexes()));

  try {
    const { years, classes, rule, session5, session12, students } = await seed();
    const basePayload = {
      sessionId: String(session5),
      ruleId: String(rule._id),
      studentOverrides: [
        { membershipId: String(students.D.membership._id), exclude: true, reason: 'leaving the school' },
        { membershipId: String(students.G.membership._id), targetClassId: String(classes.c6b._id) },
        { membershipId: String(students.H.membership._id), targetClassId: String(classes.c6b._id) }
      ]
    };
    const itemFor = (preview, key) => preview.items.find((item) => item.studentMembershipId === String(students[key].membership._id));
    const currentTarget = async (key) => StudentMembership.findOne({
      student: students[key].userId,
      academicYearId: years.y1406._id,
      isCurrent: true
    });

    await check('preview resolves the next year, the classes and every student', async () => {
      const preview = await previewPromotions(basePayload);
      assert.deepEqual(preview.plan.blockers, []);
      assert.equal(preview.plan.targetAcademicYear.id, String(years.y1406._id));
      assert.equal(preview.plan.promotedClass.id, String(classes.c6a._id), 'the female 6 الف, not the male one');
      assert.equal(preview.plan.repeatClass.id, String(classes.c5aNext._id));
      assert.equal(new Date(preview.plan.sourceEndAt).toISOString(), '2027-03-20T00:00:00.000Z');
      assert.equal(new Date(preview.plan.targetStartAt).toISOString(), '2027-03-21T00:00:00.000Z');

      const expectations = {
        A: ['promoted', true, '', classes.c6a],
        B: ['repeated', true, '', classes.c5aNext],
        C: ['conditional', true, '', null],
        D: ['skipped', false, 'excluded_by_operator', null],
        E: ['blocked', false, 'result_status_not_mapped', null],
        F: ['skipped', false, 'membership_not_current', null],
        G: ['promoted', true, '', classes.c6b],
        H: ['promoted', true, '', classes.c6b]
      };
      for (const [key, [outcome, canApply, issueCode, targetClass]] of Object.entries(expectations)) {
        const item = itemFor(preview, key);
        assert.ok(item, `student ${key} is listed`);
        assert.equal(item.computedOutcome, outcome, `outcome of ${key}`);
        assert.equal(item.canApply, canApply, `canApply of ${key}`);
        assert.equal(item.issueCode, issueCode, `issue of ${key}`);
        assert.equal(item.targetClass?.id || null, targetClass ? String(targetClass._id) : null, `target class of ${key}`);
      }
      assert.equal(itemFor(preview, 'H').reuseExistingMembership, true, 'H keeps the membership already in 6 ب');
      assert.equal(itemFor(preview, 'A').sourceMembership.student.asasNumber, 'ASAS-A', 'every row carries the نمبر اساس');
    });

    await check('a student already in another class of the next year is not moved silently', async () => {
      const preview = await previewPromotions({ ...basePayload, studentOverrides: basePayload.studentOverrides.slice(0, 2) });
      assert.equal(itemFor(preview, 'H').issueCode, 'student_already_enrolled_in_target_year');
      assert.equal(itemFor(preview, 'H').canApply, false);
    });

    await check('an illegal class or year blocks the apply and writes nothing', async () => {
      const wrongGender = await previewPromotions({ ...basePayload, promotedClassId: String(classes.c6aMale._id) });
      assert.deepEqual(wrongGender.plan.blockers.map((issue) => issue.code), ['target_class_gender_mismatch']);
      assert.equal(wrongGender.plan.canApply, false);
      const sameYear = await previewPromotions({ ...basePayload, targetAcademicYearId: String(years.y1405._id) });
      assert.ok(sameYear.plan.blockers.some((issue) => issue.code === 'target_year_same_as_source'));

      const error = await expectError(applyPromotions({ ...basePayload, repeatClassId: String(classes.c6a._id) }), 'promotion_plan_blocked');
      assert.deepEqual(error.details.blockers.map((issue) => issue.code), ['target_class_grade_mismatch']);
      assert.equal(await PromotionBatch.countDocuments(), 0);
      assert.equal(await PromotionTransaction.countDocuments(), 0);
    });

    let firstBatchId = '';
    await check('apply moves the class in one batch and holds the conditional student', async () => {
      const applied = await applyPromotions(basePayload, null);
      firstBatchId = applied.batch.id;
      assert.deepEqual(applied.batch.summary, { total: 8, promoted: 3, repeated: 1, conditional: 1, graduated: 0, notApplied: 3 });
      assert.deepEqual(applied.batch.notApplied.map((entry) => entry.issueCode).sort(), ['excluded_by_operator', 'membership_not_current', 'result_status_not_mapped']);

      const sourceA = await StudentMembership.findById(students.A.membership._id);
      assert.equal(sourceA.status, 'inactive');
      assert.equal(sourceA.isCurrent, false);
      assert.equal(sourceA.endedAt.toISOString(), '2027-03-20T00:00:00.000Z');
      const targetA = await currentTarget('A');
      assert.equal(String(targetA.classId), String(classes.c6a._id));
      assert.equal(targetA.status, 'active', 'billable from the start of the new year');
      assert.equal(targetA.source, 'promotion');
      assert.equal(targetA.admissionType, 'promotion');
      assert.equal(targetA.enrolledAt.toISOString(), '2027-03-21T00:00:00.000Z');
      assert.equal(String(targetA.previousMembershipId), String(students.A.membership._id));
      assert.equal(String(targetA.afghanStudentId), String(students.A.afghanStudentId));
      assert.equal(String((await currentTarget('B')).classId), String(classes.c5aNext._id));
      assert.equal(String((await currentTarget('G')).classId), String(classes.c6b._id));

      const sourceC = await StudentMembership.findById(students.C.membership._id);
      assert.equal(sourceC.isCurrent, true, 'the held student stays in the source class');
      const heldTx = await PromotionTransaction.findOne({ studentMembershipId: students.C.membership._id });
      assert.equal(heldTx.transactionStatus, 'held');
      assert.equal(heldTx.targetMembershipId, null);

      const txH = await PromotionTransaction.findOne({ studentMembershipId: students.H.membership._id });
      assert.equal(txH.targetMembershipGenerated, false);
      assert.equal(String(txH.targetMembershipId), String(students.H.nextYearMembership._id));

      const registryA = await AfghanStudent.findById(students.A.afghanStudentId).lean();
      assert.equal(String(registryA.academicInfo.classId), String(classes.c6a._id));
      assert.equal(String(registryA.academicInfo.academicYearId), String(years.y1406._id));
      assert.equal((await SchoolClass.findById(classes.c5a._id)).currentStudents, 3, 'C, D and E are still active in 5 الف');
      assert.equal((await SchoolClass.findById(classes.c6a._id)).currentStudents, 1, 'A now counts in 6 الف');

      const board = await getPromotionYearBoard({ academicYearId: String(years.y1405._id) });
      const row5a = board.classes.find((row) => row.schoolClass.id === String(classes.c5a._id));
      assert.equal(row5a.currentStudents, 3, 'C (held), D (excluded) and E (blocked) are still current in 5 الف');
      assert.equal(row5a.heldCount, 1);
      assert.equal(row5a.latestBatch.id, firstBatchId);
      const row12a = board.classes.find((row) => row.schoolClass.id === String(classes.c12a._id));
      assert.equal(row12a.isTerminal, true);
      assert.equal(row12a.latestBatch, null);
      const detail = await getPromotionBatch(firstBatchId);
      assert.ok(detail.transactions.every((tx) => /^ASAS-/.test(tx.sourceMembership.student.asasNumber)), 'batch rows carry the نمبر اساس');
    });

    await check('applying the same class again changes nothing', async () => {
      await expectError(applyPromotions(basePayload, null), 'promotion_nothing_to_apply');
      const preview = await previewPromotions(basePayload);
      assert.equal(itemFor(preview, 'A').issueCode, 'already_processed');
      assert.equal(await PromotionBatch.countDocuments(), 1);
    });

    await check('rolling back one student restores the source class only for them', async () => {
      const txG = await PromotionTransaction.findOne({ studentMembershipId: students.G.membership._id });
      const rolledBack = await rollbackPromotionTransaction(txG._id, { reason: 'wrong section' }, null);
      assert.equal(rolledBack.transactionStatus, 'rolled_back');
      assert.equal((await StudentMembership.findById(students.G.membership._id)).isCurrent, true);
      assert.equal(await currentTarget('G'), null);
      assert.equal((await PromotionBatch.findById(firstBatchId)).status, 'partially_rolled_back');
      const registryG = await AfghanStudent.findById(students.G.afghanStudentId).lean();
      assert.equal(String(registryG.academicInfo.classId), String(classes.c5a._id));
    });

    await check('a billed new membership blocks the whole batch rollback', async () => {
      const targetA = await currentTarget('A');
      const bill = await FinanceBill.collection.insertOne({ studentMembershipId: targetA._id, status: 'new', amountDue: 500, dueDate: new Date('2027-04-01T00:00:00Z') });
      const error = await expectError(rollbackPromotionBatch(firstBatchId, { reason: 'redo' }, null), 'promotion_batch_rollback_blocked');
      assert.deepEqual(error.details.blockers.map((entry) => entry.code), ['promotion_rollback_blocked_by_finance']);
      assert.equal((await StudentMembership.findById(students.B.membership._id)).isCurrent, false, 'nothing of the batch was undone');
      assert.equal((await PromotionBatch.findById(firstBatchId)).status, 'partially_rolled_back');
      await FinanceBill.collection.updateOne({ _id: bill.insertedId }, { $set: { status: 'void' } });
    });

    await check('the batch rollback undoes every student and leaves a linked membership alone', async () => {
      const batch = await rollbackPromotionBatch(firstBatchId, { reason: 'redo' }, null);
      assert.equal(batch.status, 'rolled_back');
      for (const key of ['A', 'B', 'C', 'G', 'H']) {
        const source = await StudentMembership.findById(students[key].membership._id);
        assert.equal(source.isCurrent, true, `${key} is back in 5 الف`);
        assert.equal(source.status, 'active');
      }
      assert.equal((await StudentMembership.findById(students.H.nextYearMembership._id)).isCurrent, true, 'H keeps the hand-made 6 ب membership');
      assert.equal(await currentTarget('A'), null);
      const registryA = await AfghanStudent.findById(students.A.afghanStudentId).lean();
      assert.equal(String(registryA.academicInfo.classId), String(classes.c5a._id));
    });

    let secondBatch = null;
    await check('a rolled-back class can be promoted again into fresh memberships', async () => {
      const applied = await applyPromotions({ ...basePayload, studentOverrides: basePayload.studentOverrides.slice(0, 1) }, null);
      secondBatch = applied.batch;
      const targetA = await currentTarget('A');
      assert.ok(targetA, 'A has a current membership in 1406 again');
      assert.equal(targetA.status, 'active');
      assert.equal(await StudentMembership.countDocuments({ student: students.A.userId, academicYearId: years.y1406._id }), 2,
        'the retired membership is kept, a new one is created next to it');
      assert.equal(String((await currentTarget('G')).classId), String(classes.c6a._id), 'without the override G follows the class');
    });

    await check('the second-chance decision moves a held student into the batch class', async () => {
      const held = await PromotionTransaction.findOne({ batchId: secondBatch.id, transactionStatus: 'held' });
      assert.equal(String(held.studentMembershipId), String(students.C.membership._id));
      await expectError(resolveHeldPromotion(held._id, { decision: 'maybe' }, null), 'promotion_resolve_decision_invalid');
      await expectError(resolveHeldPromotion(held._id, { decision: 'promoted', targetClassId: String(classes.c5aNext._id) }, null), 'promotion_resolve_target_invalid');

      const resolved = await resolveHeldPromotion(held._id, { decision: 'promoted', note: 'passed the re-exam' }, null);
      assert.equal(resolved.transactionStatus, 'applied');
      assert.equal(resolved.promotionOutcome, 'promoted');
      assert.equal(resolved.heldOutcome, 'conditional');
      assert.ok(resolved.resolvedAt);
      assert.equal(String((await currentTarget('C')).classId), String(classes.c6a._id));
      assert.equal((await StudentMembership.findById(students.C.membership._id)).isCurrent, false);
      await expectError(resolveHeldPromotion(held._id, { decision: 'promoted' }, null), 'promotion_transaction_not_held');

      // A, B, G and now C; H stays out because the override that linked it to
      // its hand-made 6 ب membership is gone and 6 الف is not that class.
      const detail = await getPromotionBatch(secondBatch.id);
      assert.equal(detail.transactions.filter((tx) => tx.transactionStatus === 'applied').length, 4);
      assert.ok(detail.notApplied.some((entry) => entry.issueCode === 'student_already_enrolled_in_target_year'));
    });

    await check('class 12 graduates without a target class', async () => {
      const applied = await applyPromotions({ sessionId: String(session12), ruleId: String(rule._id) }, null);
      assert.equal(applied.batch.isTerminal, true);
      assert.equal(applied.batch.summary.graduated, 1);
      const source = await StudentMembership.findById(students.T.membership._id);
      assert.equal(source.status, 'graduated');
      assert.equal(source.isCurrent, false);
      assert.equal(await currentTarget('T'), null);
      assert.equal((await AfghanStudent.findById(students.T.afghanStudentId).lean()).status, 'graduated');

      const batch = await rollbackPromotionBatch(applied.batch.id, { reason: 'early' }, null);
      assert.equal(batch.status, 'rolled_back');
      assert.equal((await StudentMembership.findById(students.T.membership._id)).status, 'active');
      assert.equal((await AfghanStudent.findById(students.T.afghanStudentId).lean()).status, 'active');
    });

  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`check:promotion-batch-flow FAIL (${failed.length}/${results.length})`);
    process.exit(1);
  }
  console.log(`check:promotion-batch-flow PASS (${results.length})`);
}

run().catch((error) => {
  console.error('check:promotion-batch-flow FAIL');
  console.error(error?.stack || error);
  process.exit(1);
});
