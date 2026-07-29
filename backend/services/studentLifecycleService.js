const mongoose = require('mongoose');

const ActivityLog = require('../models/ActivityLog');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const StudentTransfer = require('../models/StudentTransfer');
const StudentDropout = require('../models/StudentDropout');
const StudentExpulsion = require('../models/StudentExpulsion');
const StudentSuspension = require('../models/StudentSuspension');
const StudentLifecycleEvent = require('../models/StudentLifecycleEvent');
const { issueTransferAdmissionBill } = require('./transferAdmissionBillingService');
const { syncStudentFinanceFromFinanceBill } = require('../utils/studentFinanceSync');
const {
  ACTIVE_STUDENT_MEMBERSHIP_STATUSES,
  CURRENT_STUDENT_MEMBERSHIP_STATUSES
} = require('../utils/studentMembershipStatus');

const SUPPORTED_ACTIONS = Object.freeze([
  'transfer_in',
  'transfer_out',
  'dropout',
  'expulsion',
  'suspension',
  'resume'
]);

const normalizeText = (value = '') => String(value || '').trim();
const normalizeId = (value = null) => {
  const raw = value?._id || value;
  return raw && mongoose.isValidObjectId(raw) ? raw : null;
};
const validDate = (value, fallback = null) => {
  if (!value) return fallback;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

function lifecycleError(code, status = 400, message = code) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function snapshotMembership(membership = null) {
  if (!membership) return {};
  return {
    id: String(membership._id || ''),
    student: String(membership.student?._id || membership.student || ''),
    studentId: String(membership.studentId?._id || membership.studentId || ''),
    schoolId: String(membership.schoolId?._id || membership.schoolId || ''),
    course: String(membership.course?._id || membership.course || ''),
    classId: String(membership.classId?._id || membership.classId || ''),
    academicYearId: String(membership.academicYearId?._id || membership.academicYearId || membership.academicYear || ''),
    status: normalizeText(membership.status),
    admissionType: normalizeText(membership.admissionType),
    isCurrent: membership.isCurrent === true,
    enrolledAt: membership.enrolledAt || membership.joinedAt || null,
    endedAt: membership.endedAt || membership.leftAt || null,
    endedReason: normalizeText(membership.endedReason),
    changeVersion: Number(membership.changeVersion || 0)
  };
}

function assertExpectedVersion(membership, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') return;
  const expected = Number(expectedVersion);
  if (!Number.isInteger(expected) || expected < 0) {
    throw lifecycleError('student_lifecycle_version_invalid', 400);
  }
  if (Number(membership?.changeVersion || 0) !== expected) {
    throw lifecycleError('student_lifecycle_version_conflict', 409);
  }
}

async function loadMembershipForUpdate(membershipId, session) {
  const normalizedId = normalizeId(membershipId);
  if (!normalizedId) throw lifecycleError('student_membership_required', 400);
  const membership = await StudentMembership.findById(normalizedId).session(session);
  if (!membership) throw lifecycleError('student_membership_not_found', 404);
  return membership;
}

async function findPreviousMembership(student, excludeMembershipId, session) {
  const filter = {
    student,
    isCurrent: false,
    ...(excludeMembershipId ? { _id: { $ne: excludeMembershipId } } : {})
  };
  return StudentMembership.findOne(filter)
    .sort({ endedAt: -1, leftAt: -1, createdAt: -1 })
    .session(session);
}

async function updateClassActiveCount(classId, session) {
  const normalizedClassId = normalizeId(classId);
  if (!normalizedClassId) return;
  const count = await StudentMembership.countDocuments({
    classId: normalizedClassId,
    isCurrent: true,
    status: { $in: ACTIVE_STUDENT_MEMBERSHIP_STATUSES }
  }).session(session);
  await SchoolClass.updateOne(
    { _id: normalizedClassId },
    { $set: { currentStudents: count } },
    { session }
  );
}

async function stopFutureBills(membership, action, effectiveAt, actorId, session) {
  if (!['transfer_out', 'dropout', 'expulsion'].includes(action)) {
    return { bills: 0, orders: 0 };
  }
  const nextMonthStart = new Date(effectiveAt.getFullYear(), effectiveAt.getMonth() + 1, 1);
  const voidFields = {
    status: 'void',
    voidReason: action,
    voidedBy: actorId || null,
    voidedAt: new Date()
  };
  const filter = {
    studentMembershipId: membership._id,
    status: { $in: ['new', 'overdue'] },
    dueDate: { $gte: nextMonthStart }
  };
  const [billUpdate, orderUpdate] = await Promise.all([
    FinanceBill.updateMany(filter, { $set: voidFields }, { session }),
    FeeOrder.updateMany(filter, { $set: voidFields }, { session })
  ]);
  return {
    bills: Number(billUpdate?.modifiedCount || 0),
    orders: Number(orderUpdate?.modifiedCount || 0)
  };
}

async function createSpecializedDocument({ action, membership, previousMembership, payload, effectiveAt, actorId, session }) {
  const common = {
    student: membership.student,
    studentId: membership.studentId || null,
    schoolId: membership.schoolId || null,
    classId: membership.classId || null,
    academicYearId: membership.academicYearId || membership.academicYear || null,
    createdBy: actorId || null,
    note: normalizeText(payload.note)
  };

  if (action === 'transfer_in' || action === 'transfer_out') {
    const [document] = await StudentTransfer.create([{
      ...common,
      direction: action === 'transfer_in' ? 'in' : 'out',
      sourceMembershipId: action === 'transfer_in' ? previousMembership?._id || null : membership._id,
      targetMembershipId: action === 'transfer_in' ? membership._id : null,
      sourceClassId: action === 'transfer_in' ? previousMembership?.classId || null : membership.classId || null,
      targetClassId: action === 'transfer_in' ? membership.classId || null : null,
      previousSchool: normalizeText(payload.previousSchool),
      previousGrade: normalizeText(payload.previousGrade),
      destinationSchool: normalizeText(payload.destinationSchool),
      financialStatus: normalizeText(payload.financialStatus),
      effectiveAt,
      reason: normalizeText(payload.reason)
    }], { session });
    return { document, documentType: 'StudentTransfer' };
  }

  if (action === 'dropout') {
    const reason = normalizeText(payload.reason) || normalizeText(payload.note);
    if (!reason) throw lifecycleError('student_dropout_reason_required', 400);
    const [document] = await StudentDropout.create([{
      ...common,
      membershipId: membership._id,
      effectiveAt,
      reason,
      returnPossibility: ['possible', 'unlikely', 'unknown'].includes(normalizeText(payload.returnPossibility))
        ? normalizeText(payload.returnPossibility)
        : '',
      financialStatus: normalizeText(payload.financialStatus)
    }], { session });
    return { document, documentType: 'StudentDropout' };
  }

  if (action === 'expulsion') {
    const reason = normalizeText(payload.reason) || normalizeText(payload.note);
    if (!reason) throw lifecycleError('student_expulsion_reason_required', 400);
    const [document] = await StudentExpulsion.create([{
      ...common,
      membershipId: membership._id,
      effectiveAt,
      reason,
      authorityReference: normalizeText(payload.authorityReference),
      financialStatus: normalizeText(payload.financialStatus)
    }], { session });
    return { document, documentType: 'StudentExpulsion' };
  }

  if (action === 'suspension') {
    const reason = normalizeText(payload.reason) || normalizeText(payload.note);
    if (!reason) throw lifecycleError('student_suspension_reason_required', 400);
    const endsAt = validDate(payload.endsAt, null);
    if (endsAt && endsAt <= effectiveAt) throw lifecycleError('student_suspension_period_invalid', 400);
    const existing = await StudentSuspension.findOne({ membershipId: membership._id, status: 'active' }).session(session);
    if (existing) throw lifecycleError('student_suspension_already_active', 409);
    const [document] = await StudentSuspension.create([{
      ...common,
      membershipId: membership._id,
      startsAt: effectiveAt,
      endsAt,
      reason
    }], { session });
    return { document, documentType: 'StudentSuspension' };
  }

  if (action === 'resume') {
    const document = await StudentSuspension.findOne({ membershipId: membership._id, status: 'active' }).session(session);
    if (!document) throw lifecycleError('student_active_suspension_not_found', 404);
    document.status = 'lifted';
    document.liftedAt = effectiveAt;
    document.liftedBy = actorId || null;
    if (normalizeText(payload.note)) document.note = normalizeText(payload.note);
    await document.save({ session });
    return { document, documentType: 'StudentSuspension' };
  }

  throw lifecycleError('student_lifecycle_action_invalid', 400);
}

async function createLifecycleEvent({ action, membership, previousMembership, beforeState, document, documentType, financialEffects, effectiveAt, actorId, note, session }) {
  const eventType = action === 'resume' ? 'suspension_lifted' : action;
  const [event] = await StudentLifecycleEvent.create([{
    student: membership.student,
    studentId: membership.studentId || null,
    schoolId: membership.schoolId || null,
    membershipId: membership._id,
    previousMembershipId: previousMembership?._id || membership.previousMembershipId || null,
    eventType,
    effectiveAt,
    beforeState,
    afterState: snapshotMembership(membership),
    documentType,
    documentId: document?._id || null,
    financialEffects,
    membershipChangeVersion: Number(membership.changeVersion || 0),
    note: normalizeText(note),
    createdBy: actorId || null
  }], { session });
  return event;
}

async function createTransactionAudit({ action, membership, effectiveAt, actor = {}, request = {}, financialEffects, event, session }) {
  const [audit] = await ActivityLog.create([{
    actor: normalizeId(actor.id),
    actorRole: normalizeText(actor.role),
    actorOrgRole: normalizeText(actor.orgRole),
    action: `student_lifecycle_${action}`,
    targetUser: membership.student || null,
    targetType: 'StudentMembership',
    targetId: String(membership._id),
    ip: normalizeText(request.ip),
    userAgent: normalizeText(request.userAgent).slice(0, 320),
    clientDevice: normalizeText(request.clientDevice),
    httpMethod: normalizeText(request.httpMethod).toUpperCase(),
    route: normalizeText(request.route),
    reason: normalizeText(request.reason),
    meta: {
      lifecycleAction: action,
      effectiveAt: effectiveAt.toISOString(),
      lifecycleEventId: String(event?._id || ''),
      stoppedFutureBills: financialEffects,
      source: 'studentLifecycleService'
    }
  }], { session });
  return audit;
}

async function applyLifecycleAction(payload = {}, context = {}, session) {
  const action = normalizeText(payload.action).toLowerCase();
  if (!SUPPORTED_ACTIONS.includes(action)) throw lifecycleError('student_lifecycle_action_invalid', 400);
  const suppliedEffectiveAt = payload.effectiveAt || payload.effectiveDate;
  const effectiveAt = suppliedEffectiveAt ? validDate(suppliedEffectiveAt, null) : new Date();
  if (!effectiveAt) throw lifecycleError('student_lifecycle_effective_date_invalid', 400);
  const actorId = normalizeId(context.actor?.id || payload.createdBy);
  if (['transfer_out', 'dropout', 'expulsion'].includes(action) && !normalizeText(payload.financialStatus)) {
    throw lifecycleError('student_lifecycle_financial_status_required', 400);
  }
  if (action === 'transfer_out' && !normalizeText(payload.destinationSchool)) {
    throw lifecycleError('student_transfer_destination_required', 400);
  }

  let membership;
  let previousMembership = null;
  let admissionBilling = null;

  if (action === 'transfer_in') {
    const student = normalizeId(payload.studentId || payload.student);
    const course = normalizeId(payload.courseId || payload.course);
    const classId = normalizeId(payload.classId);
    const academicYearId = normalizeId(payload.academicYearId || payload.academicYear);
    if (!student || !course || !classId) throw lifecycleError('student_transfer_in_scope_required', 400);

    membership = await StudentMembership.findOne({ student, course, isCurrent: true }).session(session);
    if (!membership) {
      const conflict = await StudentMembership.findOne({
        student,
        isCurrent: true,
        status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
      }).session(session);
      if (conflict) throw lifecycleError('student_current_membership_conflict', 409);
      previousMembership = normalizeId(payload.previousMembershipId)
        ? await StudentMembership.findById(payload.previousMembershipId).session(session)
        : await findPreviousMembership(student, null, session);
      membership = new StudentMembership({
        student,
        studentId: normalizeId(payload.studentCoreId),
        schoolId: normalizeId(payload.schoolId),
        course,
        classId,
        academicYear: academicYearId,
        academicYearId,
        previousMembershipId: previousMembership?._id || null,
        admissionType: 'transfer_in',
        status: 'transferred_in',
        source: 'admin',
        enrolledAt: effectiveAt,
        joinedAt: effectiveAt,
        createdBy: actorId,
        note: normalizeText(payload.note)
      });
    } else {
      assertExpectedVersion(membership, payload.expectedVersion);
      previousMembership = membership.previousMembershipId
        ? await StudentMembership.findById(membership.previousMembershipId).session(session)
        : await findPreviousMembership(student, membership._id, session);
      membership.status = 'transferred_in';
      membership.admissionType = 'transfer_in';
      membership.previousMembershipId = membership.previousMembershipId || previousMembership?._id || null;
      membership.enrolledAt = membership.enrolledAt || effectiveAt;
      membership.joinedAt = membership.joinedAt || effectiveAt;
      membership.note = normalizeText(payload.note) || membership.note;
    }
  } else {
    membership = await loadMembershipForUpdate(payload.membershipId, session);
    assertExpectedVersion(membership, payload.expectedVersion);
    previousMembership = membership.previousMembershipId
      ? await StudentMembership.findById(membership.previousMembershipId).session(session)
      : null;
  }

  const beforeState = snapshotMembership(membership);
  if (['transfer_out', 'dropout', 'expulsion'].includes(action) && membership.isCurrent !== true) {
    throw lifecycleError('student_membership_already_ended', 409);
  }
  if (action === 'suspension' && membership.isCurrent !== true) {
    throw lifecycleError('student_membership_not_current', 409);
  }

  const specialized = await createSpecializedDocument({
    action,
    membership,
    previousMembership,
    payload,
    effectiveAt,
    actorId,
    session
  });

  if (action === 'transfer_out') {
    membership.status = 'transferred_out';
    membership.endedReason = 'transferred_out';
    membership.endedAt = effectiveAt;
    membership.leftAt = effectiveAt;
  } else if (action === 'dropout') {
    membership.status = 'dropped';
    membership.endedReason = 'dropout';
    membership.endedAt = effectiveAt;
    membership.leftAt = effectiveAt;
  } else if (action === 'expulsion') {
    membership.status = 'expelled';
    membership.endedReason = 'expulsion';
    membership.endedAt = effectiveAt;
    membership.leftAt = effectiveAt;
  } else if (action === 'suspension') {
    membership.status = 'suspended';
  } else if (action === 'resume') {
    membership.status = membership.admissionType === 'transfer_in' ? 'transferred_in' : 'active';
  }
  membership.note = normalizeText(payload.note) || membership.note;
  if (actorId) membership.createdBy = actorId;
  await membership.save({ session });

  if (action === 'transfer_in') {
    admissionBilling = await issueTransferAdmissionBill({
      membership,
      actorId,
      effectiveAt,
      session
    });
  }
  const stoppedFutureBills = await stopFutureBills(membership, action, effectiveAt, actorId, session);
  const financialEffects = {
    ...stoppedFutureBills,
    admissionBillCreated: admissionBilling?.created === true,
    admissionBillId: String(admissionBilling?.bill?._id || '')
  };
  const event = await createLifecycleEvent({
    action,
    membership,
    previousMembership,
    beforeState,
    document: specialized.document,
    documentType: specialized.documentType,
    financialEffects,
    effectiveAt,
    actorId,
    note: payload.note || payload.reason,
    session
  });
  await createTransactionAudit({
    action,
    membership,
    effectiveAt,
    actor: context.actor,
    request: context.request,
    financialEffects,
    event,
    session
  });
  await updateClassActiveCount(membership.classId, session);
  if (previousMembership?.classId && String(previousMembership.classId) !== String(membership.classId || '')) {
    await updateClassActiveCount(previousMembership.classId, session);
  }

  return {
    action,
    effectiveAt,
    membership,
    document: specialized.document,
    documentType: specialized.documentType,
    event,
    stoppedFutureBills,
    admissionBilling
  };
}

function isTransactionUnsupported(error) {
  const message = String(error?.message || '');
  return /Transaction numbers are only allowed|replica set|mongos|transactions are not supported/i.test(message);
}

async function executeStudentLifecycleAction(payload = {}, context = {}) {
  const session = await mongoose.startSession();
  let result = null;
  try {
    await session.withTransaction(async () => {
      result = await applyLifecycleAction(payload, context, session);
    });
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      throw lifecycleError(
        'student_lifecycle_transactions_required',
        503,
        'MongoDB replica set or mongos is required for atomic student lifecycle operations.'
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (result?.admissionBilling?.bill) {
    await syncStudentFinanceFromFinanceBill(result.admissionBilling.bill).catch(() => null);
  }
  return result;
}

async function getStudentLifecycleHistory(membershipId) {
  const normalizedId = normalizeId(membershipId);
  if (!normalizedId) throw lifecycleError('student_membership_required', 400);
  const membership = await StudentMembership.findById(normalizedId).lean();
  if (!membership) return null;
  const [events, transfers, dropouts, expulsions, suspensions] = await Promise.all([
    StudentLifecycleEvent.find({ membershipId: normalizedId }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentTransfer.find({
      $or: [{ sourceMembershipId: normalizedId }, { targetMembershipId: normalizedId }]
    }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentDropout.find({ membershipId: normalizedId }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentExpulsion.find({ membershipId: normalizedId }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentSuspension.find({ membershipId: normalizedId }).sort({ startsAt: -1, createdAt: -1 }).lean()
  ]);
  return {
    membership: snapshotMembership(membership),
    events,
    documents: { transfers, dropouts, expulsions, suspensions }
  };
}

module.exports = {
  SUPPORTED_ACTIONS,
  applyLifecycleAction,
  executeStudentLifecycleAction,
  getStudentLifecycleHistory,
  snapshotMembership
};
