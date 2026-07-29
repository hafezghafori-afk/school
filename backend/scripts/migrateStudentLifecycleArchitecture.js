require('dotenv').config();
const mongoose = require('mongoose');

const StudentMembership = require('../models/StudentMembership');
const StudentSuspension = require('../models/StudentSuspension');
const ExamSession = require('../models/ExamSession');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const {
  getMembershipLifecycleLabel,
  isMembershipEffectiveAt
} = require('../utils/officialResultPolicy');

const apply = process.argv.includes('--apply');
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const normalizeText = (value = '') => String(value || '').trim();
const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function inferAdmissionType(membership = {}) {
  if (normalizeText(membership.admissionType)) return normalizeText(membership.admissionType);
  if (membership.promotedFromMembershipId || membership.source === 'promotion') return 'promotion';
  if (membership.status === 'transferred_in') return 'transfer_in';
  if (membership.source === 'import') return 'import';
  if (membership.source === 'migration') return 'migration';
  return 'regular';
}

async function buildHistoricalSnapshot(membership, effectiveAt) {
  const date = toDate(effectiveAt) || new Date();
  const effective = isMembershipEffectiveAt(membership, date);
  const endedAt = toDate(membership.endedAt || membership.leftAt);
  const suspension = await StudentSuspension.findOne({
    membershipId: membership._id,
    status: { $ne: 'cancelled' },
    startsAt: { $lte: date },
    $and: [
      { $or: [{ endsAt: null }, { endsAt: { $gt: date } }] },
      { $or: [{ liftedAt: null }, { liftedAt: { $gt: date } }] }
    ]
  }).select('_id').lean();
  let status = normalizeText(membership.status);
  if (suspension) {
    status = 'suspended';
  } else if (effective && (status === 'suspended'
    || (endedAt && endedAt > date && ['transferred', 'transferred_out', 'graduated', 'dropped', 'expelled', 'inactive'].includes(status)))) {
    status = inferAdmissionType(membership) === 'transfer_in' ? 'transferred_in' : 'active';
  }
  const snapshot = {
    status,
    admissionType: inferAdmissionType(membership),
    isCurrent: effective,
    enrolledAt: membership.enrolledAt || membership.joinedAt || null,
    endedAt: membership.endedAt || membership.leftAt || null,
    endedReason: normalizeText(membership.endedReason),
    capturedAt: new Date(),
    effectiveAt: date
  };
  snapshot.statusLabel = getMembershipLifecycleLabel(snapshot);
  return snapshot;
}

async function main() {
  await mongoose.connect(mongoUri);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    membershipsReviewed: 0,
    membershipsToUpdate: 0,
    previousLinksToAdd: 0,
    examMarksToSnapshot: 0,
    examResultsToSnapshot: 0,
    examSessionsToFreeze: 0,
    historicalLifecycleDocumentsNeedingReview: 0
  };

  const memberships = await StudentMembership.find({}).sort({ student: 1, enrolledAt: 1, joinedAt: 1, createdAt: 1 }).lean();
  const previousByStudent = new Map();
  for (const membership of memberships) {
    summary.membershipsReviewed += 1;
    const studentKey = String(membership.student || '');
    const previous = previousByStudent.get(studentKey) || null;
    const update = {};
    if (!membership.previousMembershipId && previous) {
      update.previousMembershipId = previous._id;
      summary.previousLinksToAdd += 1;
    }
    if (!normalizeText(membership.admissionType)) update.admissionType = inferAdmissionType(membership);
    if (!Number.isInteger(membership.changeVersion) || membership.changeVersion < 0) update.changeVersion = 0;
    if (Object.keys(update).length) {
      summary.membershipsToUpdate += 1;
      if (apply) await StudentMembership.updateOne({ _id: membership._id }, { $set: update });
    }
    if (['transferred_out', 'dropped', 'expelled'].includes(normalizeText(membership.status))) {
      summary.historicalLifecycleDocumentsNeedingReview += 1;
    }
    previousByStudent.set(studentKey, membership);
  }

  const marks = await ExamMark.find({
    $or: [
      { 'membershipSnapshot.status': { $exists: false } },
      { 'membershipSnapshot.status': '' },
      { membershipSnapshot: null }
    ]
  }).select('_id sessionId studentMembershipId').lean();
  const sessionCache = new Map();
  const membershipCache = new Map();
  for (const mark of marks) {
    const sessionKey = String(mark.sessionId);
    const membershipKey = String(mark.studentMembershipId);
    if (!sessionCache.has(sessionKey)) sessionCache.set(sessionKey, await ExamSession.findById(mark.sessionId).lean());
    if (!membershipCache.has(membershipKey)) membershipCache.set(membershipKey, await StudentMembership.findById(mark.studentMembershipId).lean());
    const session = sessionCache.get(sessionKey);
    const membership = membershipCache.get(membershipKey);
    if (!session || !membership) continue;
    const snapshot = await buildHistoricalSnapshot(membership, session.heldAt);
    summary.examMarksToSnapshot += 1;
    if (apply) await ExamMark.updateOne({ _id: mark._id }, { $set: { membershipSnapshot: snapshot } });
    const resultFilter = { sessionId: mark.sessionId, studentMembershipId: mark.studentMembershipId };
    const result = await ExamResult.findOne(resultFilter).select('_id membershipSnapshot').lean();
    if (result && !normalizeText(result.membershipSnapshot?.status)) {
      summary.examResultsToSnapshot += 1;
      if (apply) await ExamResult.updateOne({ _id: result._id }, { $set: { membershipSnapshot: snapshot } });
    }
  }

  const sessions = await ExamSession.find({
    status: { $in: ['active', 'submitted', 'approved', 'closed', 'published', 'archived'] },
    rosterFrozenAt: null
  }).select('_id').lean();
  for (const session of sessions) {
    const hasRoster = await ExamMark.exists({ sessionId: session._id });
    if (!hasRoster) continue;
    summary.examSessionsToFreeze += 1;
    if (apply) await ExamSession.updateOne({ _id: session._id }, { $set: { rosterFrozenAt: new Date() } });
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log('Dry run only. Re-run with --apply after reviewing the counts.');
  if (summary.historicalLifecycleDocumentsNeedingReview) {
    console.log('Historical transfer/dropout/expulsion records need manual legal-document review; this migration does not invent missing reasons or references.');
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
