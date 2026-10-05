// «فیس امتحان چانس دوم» against a real MongoDB, through the real finance
// routes: a score-policy promotion holds the conditional students with their
// failed subjects, the finance office lists only those students, bills a typed
// amount (once), waives, voids and re-bills, a closed month and another
// school are refused, a billed student's promotion can't be rolled back, and
// an unpaid fee only warns when the second-chance result is recorded.
// Promotion needs transactions, so on a standalone server this reports SKIP.
// Runs in its own throwaway database.
require('dotenv').config();
const assert = require('assert');
const path = require('path');
const Module = require('module');
const express = require('express');
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const AfghanSchool = require('../models/AfghanSchool');
const AfghanStudent = require('../models/AfghanStudent');
const ExamResult = require('../models/ExamResult');
const ExamSession = require('../models/ExamSession');
const FinanceBill = require('../models/FinanceBill');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const PromotionRule = require('../models/PromotionRule');
const PromotionTransaction = require('../models/PromotionTransaction');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const Subject = require('../models/Subject');
const User = require('../models/User');
const {
  applyPromotions,
  resolveHeldPromotion,
  rollbackPromotionTransaction
} = require('../services/promotionService');

const DB_NAME = 'school_second_chance_fee_check';
const id = () => new mongoose.Types.ObjectId();
const SCHOOL_ID = id();
const OTHER_SCHOOL_ID = id();
const FINANCE_USER_ID = id();

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

const authMock = {
  requireAuth(req, res, next) {
    const raw = req.get('x-test-user');
    if (!raw) return res.status(401).json({ success: false });
    req.user = JSON.parse(raw);
    return next();
  },
  requireRole: (roles = []) => (req, res, next) => (roles.includes(req.user?.role) ? next() : res.status(403).json({ success: false })),
  requirePermission: (permission) => (req, res, next) => ((req.user?.permissions || []).includes(permission) ? next() : res.status(403).json({ success: false }))
};

function loadFinanceRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'financeRoutes.js');
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (String(parent?.filename || '').replace(/\\/g, '/').endsWith('/routes/financeRoutes.js') && request === '../middleware/auth') {
      return authMock;
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/finance', loadFinanceRouter());
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const financeUser = { id: String(FINANCE_USER_ID), role: 'admin', orgRole: 'finance_manager', permissions: ['manage_finance'] };

async function call(server, route, { method = 'GET', body, schoolId = SCHOOL_ID } = {}) {
  const headers = { 'x-test-user': JSON.stringify(financeUser), 'x-school-id': String(schoolId) };
  if (body) headers['content-type'] = 'application/json';
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/finance${route}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function seed() {
  await AfghanSchool.collection.insertMany([
    { _id: SCHOOL_ID, name: 'Check School', status: 'active', createdAt: new Date() },
    { _id: OTHER_SCHOOL_ID, name: 'Other School', status: 'inactive', createdAt: new Date() }
  ]);
  await User.collection.insertOne({ _id: FINANCE_USER_ID, name: 'Finance Manager', email: 'finance@second-chance.check', role: 'admin', orgRole: 'finance_manager' });

  const y1405 = await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1405', code: 'Y1405', sequence: 1, status: 'active', isActive: true, startDate: new Date('2026-03-21T00:00:00Z'), endDate: new Date('2027-03-20T00:00:00Z') });
  const y1406 = await AcademicYear.create({ schoolId: SCHOOL_ID, title: '1406', code: 'Y1406', sequence: 2, status: 'planning', startDate: new Date('2027-03-21T00:00:00Z') });
  const shiftId = id();
  const makeClass = (code, year, gradeLevel) => SchoolClass.create({
    schoolId: SCHOOL_ID,
    title: `صنف ${gradeLevel} الف (${code})`,
    titleDari: `صنف ${gradeLevel} الف`,
    titlePashto: `ټولګی ${gradeLevel}`,
    code,
    academicYearId: year._id,
    shiftId,
    gradeLevel,
    section: 'الف',
    genderType: 'female',
    capacity: 30,
    legacyCourseId: id()
  });
  const classes = {
    c5a: await makeClass('C5A', y1405, 5),
    c6a: await makeClass('N6A', y1406, 6),
    c5aNext: await makeClass('N5A', y1406, 5)
  };

  const math = id();
  const physics = id();
  await Subject.collection.insertMany([
    { _id: math, name: 'Mathematics', nameDari: 'ریاضی', code: 'MATH' },
    { _id: physics, name: 'Physics', nameDari: 'فزیک', code: 'PHYS' }
  ]);
  const sessions = { math: id(), physics: id() };
  await ExamSession.collection.insertMany([
    { _id: sessions.math, title: 'Annual math', code: 'S-MATH', academicYearId: y1405._id, classId: classes.c5a._id, subjectId: math, sessionKind: 'subject_sheet', examTypeId: id(), assessmentPeriodId: id(), status: 'published' },
    { _id: sessions.physics, title: 'Annual physics', code: 'S-PHYS', academicYearId: y1405._id, classId: classes.c5a._id, subjectId: physics, sessionKind: 'subject_sheet', examTypeId: id(), assessmentPeriodId: id(), status: 'published' }
  ]);

  const rule = await PromotionRule.create({
    name: 'Score policy check',
    code: 'CHECK-SCORE-POLICY',
    scope: 'global',
    evaluationMode: 'score_policy',
    passingScore: 55,
    subjectPassingScore: 55,
    maxConditionalSubjects: 1,
    requireCompleteResults: true,
    isActive: true
  });

  // key: [math, physics, asasNumber]
  const marks = { C: [40, 80, 'A-1001'], D: [45, 70, 'A-1002'], P: [80, 80, 'A-1003'], R: [30, 30, 'A-1004'] };
  const students = {};
  for (const [key, [mathMark, physicsMark, asasNumber]] of Object.entries(marks)) {
    const userId = id();
    await User.collection.insertOne({ _id: userId, name: `Student ${key}`, email: `${key.toLowerCase()}@second-chance.check`, role: 'student' });
    const afghanStudentId = id();
    await AfghanStudent.collection.insertOne({ _id: afghanStudentId, linkedUserId: userId, asasNumber, status: 'active', academicInfo: { classId: classes.c5a._id } });
    const membership = await StudentMembership.create({
      student: userId,
      afghanStudentId,
      course: classes.c5a.legacyCourseId,
      classId: classes.c5a._id,
      academicYearId: y1405._id,
      status: 'active',
      enrolledAt: new Date('2026-03-21T00:00:00Z')
    });
    for (const [sessionId, subjectId, mark] of [[sessions.math, math, mathMark], [sessions.physics, physics, physicsMark]]) {
      await ExamResult.collection.insertOne({
        sessionId,
        subjectId,
        studentMembershipId: membership._id,
        student: userId,
        academicYearId: y1405._id,
        classId: classes.c5a._id,
        examTypeId: id(),
        assessmentPeriodId: id(),
        markStatus: 'recorded',
        obtainedMark: mark,
        totalMark: 100,
        percentage: mark,
        createdAt: new Date()
      });
    }
    students[key] = { userId, membership };
  }

  // C's own monthly fee after a discount: the reference shown next to the amount.
  await FinanceBill.collection.insertOne({
    billNumber: 'CHK-MONTH-1',
    schoolId: SCHOOL_ID,
    student: students.C.userId,
    studentMembershipId: students.C.membership._id,
    classId: classes.c5a._id,
    academicYearId: y1405._id,
    periodType: 'monthly',
    feeScopes: ['tuition'],
    amountOriginal: 1500,
    amountDue: 1200,
    amountPaid: 1200,
    status: 'paid',
    dueDate: new Date('2026-10-05T00:00:00Z')
  });

  return { y1405, classes, rule, sessions, students };
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', { dbName: DB_NAME });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    console.log('check:second-chance-fee SKIP (needs a replica set or mongos for transactions)');
    await mongoose.disconnect();
    return;
  }

  await Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  await mongoose.connection.db.dropDatabase();
  await Promise.all([StudentMembership, PromotionTransaction, FinanceBill, SchoolClass, AcademicYear].map((model) => model.createIndexes()));
  const server = await startServer();

  try {
    const { y1405, classes, rule, sessions, students } = await seed();
    const applied = await applyPromotions({ sessionId: String(sessions.math), ruleId: String(rule._id) }, null);
    const heldTx = async (key) => PromotionTransaction.findOne({ studentMembershipId: students[key].membership._id });
    const txC = await heldTx('C');
    const txD = await heldTx('D');
    const listRow = async (key) => {
      const { data } = await call(server, '/admin/second-chance-fees');
      return data.items.find((item) => item.studentMembershipId === String(students[key].membership._id));
    };

    await check('the promotion holds conditional students with their failed subjects', async () => {
      assert.deepEqual(
        { promoted: applied.batch.summary.promoted, repeated: applied.batch.summary.repeated, conditional: applied.batch.summary.conditional },
        { promoted: 1, repeated: 1, conditional: 2 }
      );
      assert.equal(txC.transactionStatus, 'held');
      assert.equal(txC.averageScore, 60);
      assert.deepEqual(txC.failedSubjects.map((subject) => [subject.subjectTitle, subject.percentage]), [['ریاضی', 40]]);
    });

    await check('only the held students are listed, with failed subjects and the monthly fee as reference', async () => {
      const { status, data } = await call(server, '/admin/second-chance-fees');
      assert.equal(status, 200);
      assert.deepEqual(data.items.map((item) => item.student.asasNumber).sort(), ['A-1001', 'A-1002'], 'P (promoted) and R (repeated) are not listed');
      const rowC = data.items.find((item) => item.transactionId === String(txC._id));
      assert.equal(rowC.fee.state, 'undecided');
      assert.equal(rowC.resolution, 'pending');
      assert.deepEqual(rowC.failedSubjects, [{ subjectTitle: 'ریاضی', percentage: 40 }]);
      assert.deepEqual(rowC.monthlyFee, { amount: 1200, original: 1500, source: 'bill' });
      assert.equal(data.summary.undecided, 2);
      const filtered = await call(server, `/admin/second-chance-fees?classId=${classes.c6a._id}`);
      assert.equal(filtered.data.items.length, 0, 'filtered by the source class');
    });

    let firstBillId = '';
    await check('a typed amount becomes one exam-fee bill on the source-year membership', async () => {
      const zero = await call(server, `/admin/second-chance-fees/${txC._id}/bill`, { method: 'POST', body: { amount: 0, dueDate: '2026-11-10' } });
      assert.equal(zero.status, 400);
      const created = await call(server, `/admin/second-chance-fees/${txC._id}/bill`, { method: 'POST', body: { amount: 500, dueDate: '2026-11-10', note: 'دو روز امتحان' } });
      assert.equal(created.status, 201, JSON.stringify(created.data));
      firstBillId = created.data.item.billId;
      const bill = await FinanceBill.findById(firstBillId).lean();
      assert.deepEqual(bill.feeScopes, ['exam']);
      assert.equal(bill.amountDue, 500);
      assert.equal(bill.periodLabel, 'فیس امتحان چانس دوم');
      assert.equal(String(bill.studentMembershipId), String(students.C.membership._id));
      assert.equal(String(bill.classId), String(classes.c5a._id));
      assert.equal(String(bill.academicYearId), String(y1405._id));
      assert.match(bill.note, /ریاضی/);

      const again = await call(server, `/admin/second-chance-fees/${txC._id}/bill`, { method: 'POST', body: { amount: 500, dueDate: '2026-11-10' } });
      assert.equal(again.status, 409);
      assert.equal(await FinanceBill.countDocuments({ feeScopes: 'exam' }), 1);

      const row = await listRow('C');
      assert.equal(row.fee.state, 'billed');
      assert.equal(row.fee.bill.outstanding, 500);
    });

    await check('a billed student can be neither waived nor rolled back', async () => {
      const waive = await call(server, `/admin/second-chance-fees/${txC._id}/waive`, { method: 'POST', body: { reason: 'یتیم' } });
      assert.equal(waive.status, 409);
      await assert.rejects(rollbackPromotionTransaction(txC._id, { reason: 'mistake' }, null), /promotion_rollback_blocked_by_second_chance_fee/);
      assert.equal((await PromotionTransaction.findById(txC._id)).transactionStatus, 'held');
    });

    await check('voiding, waiving and re-billing reopen the decision each time', async () => {
      const voided = await call(server, `/admin/second-chance-fees/${txC._id}/void-bill`, { method: 'POST', body: { reason: 'مبلغ اشتباه' } });
      assert.equal(voided.status, 200, JSON.stringify(voided.data));
      assert.equal((await FinanceBill.findById(firstBillId).lean()).status, 'void');
      let row = await listRow('C');
      assert.equal(row.fee.state, 'undecided');
      assert.equal(row.fee.previousBill.status, 'void');

      const noReason = await call(server, `/admin/second-chance-fees/${txC._id}/waive`, { method: 'POST', body: {} });
      assert.equal(noReason.status, 400);
      assert.equal((await call(server, `/admin/second-chance-fees/${txC._id}/waive`, { method: 'POST', body: { reason: 'یتیم' } })).status, 200);
      row = await listRow('C');
      assert.equal(row.fee.state, 'waived');
      assert.equal(row.fee.waiverReason, 'یتیم');
      const billWhileWaived = await call(server, `/admin/second-chance-fees/${txC._id}/bill`, { method: 'POST', body: { amount: 700, dueDate: '2026-11-10' } });
      assert.equal(billWhileWaived.status, 409);

      assert.equal((await call(server, `/admin/second-chance-fees/${txC._id}/clear-waiver`, { method: 'POST' })).status, 200);
      const rebilled = await call(server, `/admin/second-chance-fees/${txC._id}/bill`, { method: 'POST', body: { amount: 700, dueDate: '2026-11-10' } });
      assert.equal(rebilled.status, 201, JSON.stringify(rebilled.data));
      row = await listRow('C');
      assert.equal(row.fee.state, 'billed');
      assert.equal(row.fee.bill.amountDue, 700);
    });

    await check('an unpaid fee only warns when the second-chance result is recorded', async () => {
      const resolved = await resolveHeldPromotion(txC._id, { decision: 'promoted' }, null);
      assert.equal(resolved.transactionStatus, 'applied');
      assert.equal(resolved.warnings[0]?.code, 'second_chance_fee_unpaid');
      const row = await listRow('C');
      assert.equal(row.resolution, 'promoted', 'the student stays listed so the fee can still be collected');
      assert.equal(row.fee.state, 'billed');

      await FinanceBill.updateOne({ issuanceKey: `second_chance_exam:${txC._id}` }, { $set: { amountPaid: 700, status: 'paid' } });
      const paid = await call(server, '/admin/second-chance-fees?state=paid');
      assert.deepEqual(paid.data.items.map((item) => item.transactionId), [String(txC._id)]);
      assert.equal(paid.data.summary.paidAmount, 700);
    });

    await check('a closed month and another school are refused', async () => {
      await FinanceMonthClose.collection.insertOne({
        schoolId: SCHOOL_ID,
        academicYearId: y1405._id,
        monthKey: '1405-09',
        status: 'closed',
        closeWindow: { startAt: new Date('2026-11-22T00:00:00Z'), endAt: new Date('2026-12-21T23:59:59Z') }
      });
      const closed = await call(server, `/admin/second-chance-fees/${txD._id}/bill`, { method: 'POST', body: { amount: 400, dueDate: '2026-12-01' } });
      assert.ok(closed.status >= 400 && closed.status < 500, `closed month refused (got ${closed.status})`);
      assert.match(closed.data.message, /بسته شده است/, 'refused because the month is closed');
      const otherSchool = await call(server, `/admin/second-chance-fees/${txD._id}/bill`, { method: 'POST', body: { amount: 400, dueDate: '2026-11-10' }, schoolId: OTHER_SCHOOL_ID });
      assert.equal(otherSchool.status, 403);
      assert.equal(await FinanceBill.countDocuments({ issuanceKey: `second_chance_exam:${txD._id}` }), 0);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    console.error(`check:second-chance-fee FAIL (${failed.length}/${results.length})`);
    process.exit(1);
  }
  console.log(`check:second-chance-fee PASS (${results.length})`);
}

run().catch((error) => {
  console.error('check:second-chance-fee FAIL');
  console.error(error?.stack || error);
  process.exit(1);
});
