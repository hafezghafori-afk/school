// Finds historical FinanceBill/FeeOrder records that show a payment
// (amountPaid > 0) for a billing period on or after the month a student's
// membership already ended (dropped/transferred/expelled/graduated/...),
// and opens a FinanceRefund case (status: pending_review) for each one that
// doesn't already have one. This is the backlog cleanup for cases that
// predate the automatic reconciliation now wired into
// services/studentLifecycleService.js.
//
// Usage:
//   node scripts/backfillMembershipPaymentRefunds.js           (dry run, default)
//   node scripts/backfillMembershipPaymentRefunds.js --apply   (actually creates the cases)

require('dotenv').config();
const mongoose = require('mongoose');

const StudentMembership = require('../models/StudentMembership');
const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const { ENDED_STUDENT_MEMBERSHIP_STATUSES } = require('../utils/studentMembershipStatus');
const { createFinanceRefundCase, findOpenRefundForDocument } = require('../utils/financeRefundCase');
const { roundMoney } = require('../utils/financeLineItems');

const DRY_RUN = !process.argv.includes('--apply');
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function postEndWindowStart(endedAt) {
  const date = new Date(endedAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

async function findCandidateDocuments(Model, membership, windowStart) {
  return Model.find({
    studentMembershipId: membership._id,
    status: { $in: ['partial', 'paid'] },
    amountPaid: { $gt: 0 },
    dueDate: { $gte: windowStart }
  }).select('_id student studentId schoolId classId academicYearId currency amountPaid dueDate').lean();
}

async function run() {
  await mongoose.connect(MONGO_URI);

  const summary = {
    dryRun: DRY_RUN,
    membershipsScanned: 0,
    membershipsEnded: 0,
    membershipsSkippedNoEndedAt: 0,
    billsFlagged: 0,
    ordersFlagged: 0,
    refundCasesCreated: 0,
    refundCasesAlreadyOpen: 0,
    totalAmountFlagged: 0,
    cases: []
  };

  const endedMemberships = await StudentMembership.find({
    status: { $in: ENDED_STUDENT_MEMBERSHIP_STATUSES }
  }).select('_id student studentId schoolId classId academicYearId academicYear endedAt leftAt status').lean();

  summary.membershipsScanned = await StudentMembership.countDocuments({});
  summary.membershipsEnded = endedMemberships.length;

  for (const membership of endedMemberships) {
    const windowStart = postEndWindowStart(membership.endedAt || membership.leftAt);
    if (!windowStart) {
      summary.membershipsSkippedNoEndedAt += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const [bills, orders] = await Promise.all([
      findCandidateDocuments(FinanceBill, membership, windowStart),
      findCandidateDocuments(FeeOrder, membership, windowStart)
    ]);

    const documents = [
      ...bills.map((doc) => ({ doc, key: 'bill' })),
      ...orders.map((doc) => ({ doc, key: 'feeOrder' }))
    ];

    for (const { doc, key } of documents) {
      if (key === 'bill') summary.billsFlagged += 1;
      else summary.ordersFlagged += 1;
      summary.totalAmountFlagged = roundMoney(summary.totalAmountFlagged + Number(doc.amountPaid || 0));

      // eslint-disable-next-line no-await-in-loop
      const existing = await findOpenRefundForDocument({
        bill: key === 'bill' ? doc._id : null,
        feeOrder: key === 'feeOrder' ? doc._id : null
      });
      if (existing) {
        summary.refundCasesAlreadyOpen += 1;
        continue;
      }

      const caseRecord = {
        membershipId: String(membership._id),
        membershipStatus: membership.status,
        endedAt: membership.endedAt || membership.leftAt || null,
        [key === 'bill' ? 'billId' : 'feeOrderId']: String(doc._id),
        amount: roundMoney(doc.amountPaid),
        dueDate: doc.dueDate
      };

      if (!DRY_RUN) {
        // eslint-disable-next-line no-await-in-loop
        const created = await createFinanceRefundCase({
          student: doc.student || membership.student,
          studentId: doc.studentId || membership.studentId || null,
          studentMembershipId: membership._id,
          [key]: doc._id,
          schoolId: doc.schoolId || membership.schoolId || null,
          classId: doc.classId || membership.classId || null,
          academicYearId: doc.academicYearId || membership.academicYearId || membership.academicYear || null,
          currency: doc.currency || 'AFN',
          amount: doc.amountPaid,
          reason: 'membership_ended',
          reasonNote: `تشخیص خودکار از بازبینی داده‌های قدیمی (backfill)؛ عضویت در ${new Date(membership.endedAt || membership.leftAt).toISOString().slice(0, 10)} پایان یافته بود.`,
          detectionSource: 'auto_backfill'
        });
        caseRecord.refundNumber = created?.refundNumber || null;
        summary.refundCasesCreated += 1;
      } else {
        summary.refundCasesCreated += 1;
      }

      summary.cases.push(caseRecord);
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(JSON.stringify({
    success: false,
    dryRun: DRY_RUN,
    message: error?.message || 'Membership payment refund backfill failed',
    stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack
  }, null, 2));
  try {
    await mongoose.disconnect();
  } catch {}
  process.exitCode = 1;
});
