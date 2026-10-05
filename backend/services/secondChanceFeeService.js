// «فیس امتحان چانس دوم» in مرکز مالی مکتب: the students a promotion batch held
// for the second-chance exam, and the finance office's optional decision for
// each one - bill an amount it types in, or waive it. Nothing is charged
// automatically. The bill itself is created by the finance routes (they own
// bill numbering, period locks and notifications); this module lists the
// students and records the decisions.

const mongoose = require('mongoose');

const AfghanStudent = require('../models/AfghanStudent');
const FinanceBill = require('../models/FinanceBill');
const PromotionTransaction = require('../models/PromotionTransaction');
const StudentMembership = require('../models/StudentMembership');
const { resolveFeePlanForBilling } = require('./feeBillingService');
const { getFeePlanPrimaryAmount } = require('./financeFeePlanService');
const {
  SECOND_CHANCE_KEY_PREFIX,
  billOutstanding,
  secondChanceIssuanceKey
} = require('../utils/secondChanceFee');

const ELIGIBLE_STATUSES = Object.freeze(['held', 'applied']);

function idOf(value) {
  return String(value?._id || value || '').trim();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function secondChanceError(code, status = 400) {
  const error = new Error(code);
  error.status = status;
  return error;
}

function eligibleFilter(extra = {}) {
  return {
    heldOutcome: 'conditional',
    transactionStatus: { $in: ELIGIBLE_STATUSES },
    ...extra
  };
}

// The held transaction, its source-year membership and that membership's
// class - everything a second-chance bill is filed under.
async function loadSecondChanceContext(transactionId) {
  if (!mongoose.isValidObjectId(transactionId)) throw secondChanceError('second_chance_not_found', 404);
  const transaction = await PromotionTransaction.findOne(eligibleFilter({ _id: transactionId }));
  if (!transaction) throw secondChanceError('second_chance_not_found', 404);
  const membership = await StudentMembership.findById(transaction.studentMembershipId)
    .populate('classId', 'title code gradeLevel section schoolId academicYearId legacyCourseId');
  if (!membership) throw secondChanceError('second_chance_membership_not_found', 404);
  return { transaction, membership, schoolClass: membership.classId || null };
}

async function findLiveSecondChanceBill(transactionId) {
  return FinanceBill.findOne({ issuanceKey: secondChanceIssuanceKey(transactionId), status: { $ne: 'void' } });
}

function resolutionOf(transaction) {
  if (transaction.transactionStatus === 'held') return 'pending';
  return text(transaction.promotionOutcome) || 'pending';
}

function serializeBill(bill) {
  if (!bill) return null;
  return {
    id: idOf(bill),
    billNumber: text(bill.billNumber),
    amountDue: Number(bill.amountDue || 0),
    amountPaid: Number(bill.amountPaid || 0),
    outstanding: billOutstanding(bill),
    status: text(bill.status),
    dueDate: bill.dueDate || null,
    voidReason: text(bill.voidReason)
  };
}

// The student's own monthly fee as a reference for the amount the operator
// types: their latest monthly tuition bill (after any discount), otherwise the
// class fee plan.
async function buildMonthlyFeeLookup(memberships = []) {
  const membershipIds = memberships.map((item) => item._id);
  const bills = membershipIds.length
    ? await FinanceBill.find({
        studentMembershipId: { $in: membershipIds },
        status: { $ne: 'void' },
        periodType: 'monthly',
        feeScopes: 'tuition'
      }).select('studentMembershipId amountDue amountOriginal dueDate').sort({ dueDate: -1 }).lean()
    : [];
  const byMembership = new Map();
  bills.forEach((bill) => {
    const key = idOf(bill.studentMembershipId);
    if (!byMembership.has(key)) byMembership.set(key, bill);
  });

  const planByClass = new Map();
  const planAmount = async (membership) => {
    const schoolClass = membership.classId || {};
    const key = `${idOf(schoolClass)}|${idOf(membership.academicYearId)}`;
    if (!planByClass.has(key)) {
      const plan = await resolveFeePlanForBilling({
        schoolId: idOf(schoolClass.schoolId),
        classId: idOf(schoolClass),
        courseId: idOf(membership.course),
        academicYearId: idOf(membership.academicYearId),
        billingFrequency: 'monthly'
      }).catch(() => null);
      planByClass.set(key, plan ? Number(getFeePlanPrimaryAmount(plan, 'tuition')) || 0 : 0);
    }
    return planByClass.get(key);
  };

  return async (membership) => {
    const bill = byMembership.get(idOf(membership));
    if (bill) return { amount: Number(bill.amountDue || 0), original: Number(bill.amountOriginal || 0), source: 'bill' };
    const amount = await planAmount(membership);
    return amount > 0 ? { amount, original: amount, source: 'plan' } : { amount: 0, original: 0, source: '' };
  };
}

function feeStateOf(transaction, liveBill) {
  if (liveBill) return billOutstanding(liveBill) > 0 ? 'billed' : 'paid';
  if (text(transaction.secondChanceFee?.status) === 'waived') return 'waived';
  return 'undecided';
}

async function listSecondChanceFees({ schoolId = '', academicYearId = '', classId = '', state = '' } = {}) {
  const extra = {};
  if (mongoose.isValidObjectId(academicYearId)) extra.academicYearId = academicYearId;
  if (mongoose.isValidObjectId(classId)) extra.classId = classId;

  const transactions = await PromotionTransaction.find(eligibleFilter(extra))
    .populate('academicYearId', 'title code')
    .populate('classId', 'title code gradeLevel section schoolId')
    .populate('targetClassId', 'title code gradeLevel section')
    .populate('studentId', 'fullName preferredName admissionNo')
    .populate('student', 'name')
    .populate('secondChanceFee.decidedBy', 'name')
    .sort({ classId: 1, createdAt: 1 })
    .lean();
  const scoped = transactions.filter((item) => !schoolId || !item.classId?.schoolId || idOf(item.classId.schoolId) === idOf(schoolId));

  const memberships = await StudentMembership.find({ _id: { $in: scoped.map((item) => item.studentMembershipId) } })
    .populate('classId', 'schoolId')
    .select('classId academicYearId course afghanStudentId status')
    .lean();
  const membershipById = new Map(memberships.map((item) => [idOf(item), item]));
  const afghanStudents = await AfghanStudent.find({ _id: { $in: memberships.map((item) => item.afghanStudentId).filter(Boolean) } })
    .select('asasNumber')
    .lean();
  const asasById = new Map(afghanStudents.map((item) => [idOf(item), text(item.asasNumber)]));

  const keys = scoped.map((item) => secondChanceIssuanceKey(item._id));
  const previousBillIds = scoped.map((item) => item.secondChanceFee?.billId).filter(Boolean);
  const [liveBills, previousBills] = await Promise.all([
    keys.length ? FinanceBill.find({ issuanceKey: { $in: keys }, status: { $ne: 'void' } }).lean() : [],
    previousBillIds.length ? FinanceBill.find({ _id: { $in: previousBillIds } }).lean() : []
  ]);
  const liveByKey = new Map(liveBills.map((bill) => [text(bill.issuanceKey), bill]));
  const previousById = new Map(previousBills.map((bill) => [idOf(bill), bill]));
  const monthlyFeeOf = await buildMonthlyFeeLookup(memberships);

  const items = [];
  for (const transaction of scoped) {
    const membership = membershipById.get(idOf(transaction.studentMembershipId)) || null;
    const liveBill = liveByKey.get(secondChanceIssuanceKey(transaction._id)) || null;
    const previousBill = previousById.get(idOf(transaction.secondChanceFee?.billId)) || null;
    const feeState = feeStateOf(transaction, liveBill);
    if (state && state !== feeState) continue;
    // eslint-disable-next-line no-await-in-loop
    const monthlyFee = membership ? await monthlyFeeOf(membership) : { amount: 0, original: 0, source: '' };
    items.push({
      transactionId: idOf(transaction),
      batchId: idOf(transaction.batchId),
      studentMembershipId: idOf(transaction.studentMembershipId),
      student: {
        userId: idOf(transaction.student),
        fullName: text(transaction.studentId?.fullName) || text(transaction.studentId?.preferredName) || text(transaction.student?.name),
        asasNumber: asasById.get(idOf(membership?.afghanStudentId)) || '',
        admissionNo: text(transaction.studentId?.admissionNo)
      },
      schoolClass: transaction.classId
        ? { id: idOf(transaction.classId), title: text(transaction.classId.title), code: text(transaction.classId.code), gradeLevel: Number(transaction.classId.gradeLevel) || 0, section: text(transaction.classId.section) }
        : null,
      academicYear: transaction.academicYearId ? { id: idOf(transaction.academicYearId), title: text(transaction.academicYearId.title) || text(transaction.academicYearId.code) } : null,
      resolution: resolutionOf(transaction),
      targetClass: transaction.targetClassId ? { id: idOf(transaction.targetClassId), title: text(transaction.targetClassId.title), code: text(transaction.targetClassId.code) } : null,
      averageScore: transaction.averageScore ?? null,
      failedSubjects: (transaction.failedSubjects || []).map((subject) => ({
        subjectTitle: text(subject.subjectTitle),
        percentage: Number(subject.percentage) || 0
      })),
      monthlyFee,
      fee: {
        state: feeState,
        bill: serializeBill(liveBill),
        previousBill: !liveBill && previousBill && text(previousBill.status) === 'void' ? serializeBill(previousBill) : null,
        waiverReason: feeState === 'waived' ? text(transaction.secondChanceFee?.waiverReason) : '',
        note: text(transaction.secondChanceFee?.note),
        decidedAt: transaction.secondChanceFee?.decidedAt || null,
        decidedBy: transaction.secondChanceFee?.decidedBy?.name ? text(transaction.secondChanceFee.decidedBy.name) : ''
      }
    });
  }

  const summary = items.reduce((memo, item) => {
    memo.total += 1;
    memo[item.fee.state] += 1;
    if (item.fee.bill) {
      memo.billedAmount += item.fee.bill.amountDue;
      memo.paidAmount += item.fee.bill.amountPaid;
      memo.outstandingAmount += item.fee.bill.outstanding;
    }
    return memo;
  }, { total: 0, undecided: 0, billed: 0, paid: 0, waived: 0, billedAmount: 0, paidAmount: 0, outstandingAmount: 0 });

  return { items, summary };
}

async function recordSecondChanceBill(transactionId, { bill, amount, dueDate, note, actorId }) {
  await PromotionTransaction.updateOne({ _id: transactionId }, {
    $set: {
      secondChanceFee: {
        status: 'billed',
        billId: bill._id,
        amount,
        dueDate,
        waiverReason: '',
        note: text(note),
        decidedAt: new Date(),
        decidedBy: actorId || null
      }
    }
  });
}

async function waiveSecondChanceFee(transactionId, { reason = '', actorId = null } = {}) {
  const waiverReason = text(reason);
  if (!waiverReason) throw secondChanceError('second_chance_waiver_reason_required');
  const { transaction } = await loadSecondChanceContext(transactionId);
  if (await findLiveSecondChanceBill(transaction._id)) throw secondChanceError('second_chance_already_billed', 409);
  transaction.secondChanceFee = {
    status: 'waived',
    billId: transaction.secondChanceFee?.billId || null,
    amount: 0,
    dueDate: null,
    waiverReason,
    note: '',
    decidedAt: new Date(),
    decidedBy: actorId || null
  };
  await transaction.save();
  return transaction;
}

async function clearSecondChanceWaiver(transactionId, { actorId = null } = {}) {
  const { transaction } = await loadSecondChanceContext(transactionId);
  if (text(transaction.secondChanceFee?.status) !== 'waived') throw secondChanceError('second_chance_not_waived', 409);
  transaction.secondChanceFee.status = '';
  transaction.secondChanceFee.waiverReason = '';
  transaction.secondChanceFee.decidedAt = new Date();
  transaction.secondChanceFee.decidedBy = actorId || null;
  await transaction.save();
  return transaction;
}

// After the finance office voided the bill, the decision is open again.
async function clearVoidedSecondChanceBill(transactionId, { actorId = null } = {}) {
  await PromotionTransaction.updateOne(
    { _id: transactionId, 'secondChanceFee.status': 'billed' },
    { $set: { 'secondChanceFee.status': '', 'secondChanceFee.decidedAt': new Date(), 'secondChanceFee.decidedBy': actorId || null } }
  );
}

module.exports = {
  SECOND_CHANCE_KEY_PREFIX,
  clearSecondChanceWaiver,
  clearVoidedSecondChanceBill,
  findLiveSecondChanceBill,
  listSecondChanceFees,
  loadSecondChanceContext,
  recordSecondChanceBill,
  waiveSecondChanceFee
};
