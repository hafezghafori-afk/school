require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const ActivityLog = require('../models/ActivityLog');
require('../models/AcademicYear');
const AfghanStudent = require('../models/AfghanStudent');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const SchoolClass = require('../models/SchoolClass');
const StudentLifecycleEvent = require('../models/StudentLifecycleEvent');
const StudentMembership = require('../models/StudentMembership');
const StudentReEnrollment = require('../models/StudentReEnrollment');
const User = require('../models/User');

const shouldApply = process.argv.includes('--apply');
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const endedStatuses = ['transferred', 'transferred_out', 'graduated', 'dropped', 'expelled', 'inactive'];
const activeStatuses = ['active', 'transferred_in'];
const normalizeId = (value = '') => String(value?._id || value || '').trim();

function projectionStatus(status = '') {
  if (['transferred', 'transferred_out'].includes(status)) return 'transferred';
  if (status === 'dropped') return 'dropped';
  if (status === 'graduated') return 'graduated';
  return 'inactive';
}

async function hasOfficialReturnEvidence(membership) {
  const [document, event] = await Promise.all([
    StudentReEnrollment.exists({ targetMembershipId: membership._id }),
    StudentLifecycleEvent.exists({
      membershipId: membership._id,
      eventType: { $in: ['re_enrollment', 'class_transfer', 'transfer_in'] }
    })
  ]);
  return Boolean(document || event);
}

async function findCandidates() {
  const currentMemberships = await StudentMembership.find({
    isCurrent: true,
    status: { $in: activeStatuses },
    admissionType: 'regular',
    previousMembershipId: null
  }).sort({ createdAt: 1 });

  const candidates = [];
  for (const current of currentMemberships) {
    const currentStartedAt = current.enrolledAt || current.joinedAt || current.createdAt;
    const previous = await StudentMembership.findOne({
      _id: { $ne: current._id },
      student: current.student,
      isCurrent: false,
      status: { $in: endedStatuses },
      createdAt: { $lte: current.createdAt },
      $or: [
        { endedAt: { $lte: currentStartedAt } },
        { endedAt: null, leftAt: { $lte: currentStartedAt } }
      ]
    }).sort({ endedAt: -1, leftAt: -1, createdAt: -1 });
    if (!previous || await hasOfficialReturnEvidence(current)) continue;

    const [user, unpaidBills, unpaidOrders, paidBills, paidOrders, examMarks, examResults] = await Promise.all([
      User.findById(current.student).select('name email').lean(),
      FinanceBill.countDocuments({ studentMembershipId: current._id, status: { $in: ['new', 'overdue'] }, amountPaid: { $lte: 0 } }),
      FeeOrder.countDocuments({ studentMembershipId: current._id, status: { $in: ['new', 'overdue'] }, amountPaid: { $lte: 0 } }),
      FinanceBill.countDocuments({ studentMembershipId: current._id, $or: [{ amountPaid: { $gt: 0 } }, { status: { $in: ['partial', 'paid'] } }] }),
      FeeOrder.countDocuments({ studentMembershipId: current._id, $or: [{ amountPaid: { $gt: 0 } }, { status: { $in: ['partial', 'paid'] } }] }),
      ExamMark.countDocuments({ studentMembershipId: current._id }),
      ExamResult.countDocuments({ studentMembershipId: current._id })
    ]);
    candidates.push({
      current,
      previous,
      user,
      counts: { unpaidBills, unpaidOrders, paidBills, paidOrders, examMarks, examResults }
    });
  }
  return candidates;
}

async function repairCandidate(candidate) {
  const { current, previous, counts } = candidate;
  if (counts.paidBills || counts.paidOrders) return { repaired: false, reason: 'paid_finance_records_present' };

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      const [membership, priorMembership] = await Promise.all([
        StudentMembership.findById(current._id).session(session),
        StudentMembership.findById(previous._id).session(session)
      ]);
      if (!membership?.isCurrent || !priorMembership || !activeStatuses.includes(membership.status)) {
        result = { repaired: false, reason: 'membership_changed_during_repair' };
        return;
      }

      const correctionAt = membership.enrolledAt || membership.joinedAt || membership.createdAt || new Date();
      membership.status = priorMembership.status;
      membership.previousMembershipId = priorMembership._id;
      membership.endedReason = priorMembership.endedReason || priorMembership.status;
      membership.endedAt = correctionAt;
      membership.leftAt = correctionAt;
      membership.note = [
        membership.note,
        'اصلاح سیستمی: این عضویت بدون سند رسمی بازگشت ایجاد شده بود و بسته شد.'
      ].filter(Boolean).join('\n');
      await membership.save({ session });

      const voidFields = {
        status: 'void',
        voidReason: 'invalid_membership_reactivation',
        voidedAt: new Date()
      };
      const financeFilter = {
        studentMembershipId: membership._id,
        status: { $in: ['new', 'overdue'] },
        amountPaid: { $lte: 0 }
      };
      const [billUpdate, orderUpdate] = await Promise.all([
        FinanceBill.updateMany(financeFilter, { $set: voidFields }, { session }),
        FeeOrder.updateMany(financeFilter, { $set: voidFields }, { session })
      ]);

      const profileFilters = [];
      if (membership.afghanStudentId) profileFilters.push({ _id: membership.afghanStudentId });
      if (membership.student) profileFilters.push({ linkedUserId: membership.student });
      if (profileFilters.length) {
        const otherCurrent = await StudentMembership.exists({
          _id: { $ne: membership._id },
          student: membership.student,
          isCurrent: true,
          status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
        }).session(session);
        if (!otherCurrent) {
          await AfghanStudent.updateMany(
            profileFilters.length === 1 ? profileFilters[0] : { $or: profileFilters },
            {
              $set: {
                status: projectionStatus(priorMembership.status),
                'academicInfo.classId': null,
                'academicInfo.currentClassId': null,
                'academicInfo.shiftId': null
              }
            },
            { session }
          );
        }
      }

      await ActivityLog.create([{
        action: 'student_membership_invalid_reactivation_closed',
        targetUser: membership.student,
        targetType: 'StudentMembership',
        targetId: normalizeId(membership._id),
        reason: 'عضویت بدون سند رسمی بازگشت بسته شد.',
        meta: {
          previousMembershipId: normalizeId(priorMembership._id),
          previousStatus: priorMembership.status,
          correctedStatus: membership.status,
          voidedBills: Number(billUpdate?.modifiedCount || 0),
          voidedOrders: Number(orderUpdate?.modifiedCount || 0),
          preservedExamMarks: counts.examMarks,
          preservedExamResults: counts.examResults,
          source: 'repairInvalidStudentReactivations'
        }
      }], { session });

      if (membership.classId) {
        const count = await StudentMembership.countDocuments({
          classId: membership.classId,
          isCurrent: true,
          status: { $in: activeStatuses }
        }).session(session);
        await SchoolClass.updateOne({ _id: membership.classId }, { $set: { currentStudents: count } }, { session });
      }
      result = {
        repaired: true,
        voidedBills: Number(billUpdate?.modifiedCount || 0),
        voidedOrders: Number(orderUpdate?.modifiedCount || 0)
      };
    });
    return result || { repaired: false, reason: 'transaction_not_completed' };
  } finally {
    await session.endSession();
  }
}

async function main() {
  await mongoose.connect(mongoUri, { autoIndex: false, autoCreate: false });
  const candidates = await findCandidates();
  const summary = {
    mode: shouldApply ? 'apply' : 'dry-run',
    candidates: candidates.length,
    repaired: 0,
    blockedByPaidFinanceRecords: 0,
    unpaidBillsToVoid: candidates.reduce((sum, item) => sum + item.counts.unpaidBills, 0),
    unpaidOrdersToVoid: candidates.reduce((sum, item) => sum + item.counts.unpaidOrders, 0),
    preservedExamMarks: candidates.reduce((sum, item) => sum + item.counts.examMarks, 0),
    preservedExamResults: candidates.reduce((sum, item) => sum + item.counts.examResults, 0),
    items: candidates.map((item) => ({
      student: item.user?.name || '',
      email: item.user?.email || '',
      currentMembershipId: normalizeId(item.current._id),
      previousMembershipId: normalizeId(item.previous._id),
      currentSource: item.current.source || '',
      currentCreatedAt: item.current.createdAt || null,
      currentEnrolledAt: item.current.enrolledAt || item.current.joinedAt || null,
      previousStatus: item.previous.status,
      previousEndedAt: item.previous.endedAt || item.previous.leftAt || null,
      ...item.counts
    }))
  };

  if (shouldApply) {
    for (const candidate of candidates) {
      const result = await repairCandidate(candidate);
      if (result.repaired) summary.repaired += 1;
      if (result.reason === 'paid_finance_records_present') summary.blockedByPaidFinanceRecords += 1;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (!shouldApply && candidates.length) {
    console.log('Dry run only. Re-run with --apply after reviewing the listed memberships.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close().catch(() => {});
  });
