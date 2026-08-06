const mongoose = require('mongoose');

const ActivityLog = require('../models/ActivityLog');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const StudentTransfer = require('../models/StudentTransfer');
const StudentDropout = require('../models/StudentDropout');
const StudentExpulsion = require('../models/StudentExpulsion');
const StudentSuspension = require('../models/StudentSuspension');
const StudentReEnrollment = require('../models/StudentReEnrollment');
const StudentLifecycleEvent = require('../models/StudentLifecycleEvent');
const { issueTransferAdmissionBill } = require('./transferAdmissionBillingService');
const { syncStudentFinanceFromFinanceBill } = require('../utils/studentFinanceSync');
const { createFinanceRefundCase } = require('../utils/financeRefundCase');
const { notifyFinanceOfLifecycleChange, broadcastFinanceLifecycleChange } = require('../utils/financeLifecycleNotifications');
const { invalidateAll: invalidateFinanceReportCache } = require('../utils/financeReportCache');
const {
  ACTIVE_STUDENT_MEMBERSHIP_STATUSES,
  CURRENT_STUDENT_MEMBERSHIP_STATUSES
} = require('../utils/studentMembershipStatus');

const SUPPORTED_ACTIONS = Object.freeze([
  'transfer_in',
  'transfer_out',
  'class_transfer',
  'dropout',
  'expulsion',
  'suspension',
  'resume',
  're_enrollment'
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

async function syncAfghanStudentLifecycleProjection(membership, action, session) {
  const afghanStudentId = normalizeId(membership?.afghanStudentId);
  const linkedUserId = normalizeId(membership?.student);
  const identityFilters = [];
  if (afghanStudentId) identityFilters.push({ _id: afghanStudentId });
  if (linkedUserId) identityFilters.push({ linkedUserId });
  if (!identityFilters.length) return;

  const endActions = ['transfer_out', 'dropout', 'expulsion'];
  const statusByAction = {
    transfer_in: 'active',
    transfer_out: 'transferred',
    class_transfer: 'active',
    dropout: 'dropped',
    expulsion: 'inactive',
    suspension: 'suspended',
    resume: 'active',
    re_enrollment: 'active'
  };
  const update = {
    $set: {
      status: statusByAction[action] || 'active'
    }
  };

  if (endActions.includes(action)) {
    update.$set['academicInfo.classId'] = null;
    update.$set['academicInfo.currentClassId'] = null;
    update.$set['academicInfo.shiftId'] = null;
  } else if (['transfer_in', 'class_transfer', 're_enrollment'].includes(action)) {
    const schoolClass = normalizeId(membership?.classId)
      ? await SchoolClass.findById(membership.classId).session(session)
      : null;
    update.$set['academicInfo.classId'] = membership.classId || null;
    update.$set['academicInfo.currentClassId'] = membership.classId || null;
    update.$set['academicInfo.academicYearId'] = membership.academicYearId || membership.academicYear || null;
    if (schoolClass?.schoolId) update.$set['academicInfo.currentSchool'] = schoolClass.schoolId;
    if (schoolClass?.gradeLevel) update.$set['academicInfo.currentGrade'] = `grade${schoolClass.gradeLevel}`;
    if (schoolClass?.section) update.$set['academicInfo.currentSection'] = schoolClass.section;
    if (schoolClass?.shift) update.$set['academicInfo.currentShift'] = schoolClass.shift;
    if (schoolClass?.shiftId) update.$set['academicInfo.shiftId'] = schoolClass.shiftId;
  }

  await AfghanStudent.updateMany(
    identityFilters.length === 1 ? identityFilters[0] : { $or: identityFilters },
    update,
    { session }
  );
}

async function reconcileFutureBillingForEndedMembership(membership, action, effectiveAt, actorId, session) {
  if (!['transfer_out', 'class_transfer', 'dropout', 'expulsion'].includes(action)) {
    return { bills: 0, orders: 0, refundCasesCreated: 0 };
  }
  // Starts from the FIRST of the departure month, not the month after it.
  // A student who leaves on day 6 of the month still had a bill due later
  // that same month - excluding it (as this used to, with nextMonthStart)
  // meant a same-month bill with money already on it never got flagged for
  // refund review, and an unpaid same-month bill never got voided either;
  // it just sat there as if the student were still enrolled. Months before
  // the departure month are still left untouched on purpose - that's
  // legitimate pre-departure arrears/payment, not this student's departure
  // affecting billing.
  const currentMonthStart = new Date(effectiveAt.getFullYear(), effectiveAt.getMonth(), 1);
  const voidFields = {
    status: 'void',
    voidReason: action,
    voidedBy: actorId || null,
    voidedAt: new Date()
  };
  const voidFilter = {
    studentMembershipId: membership._id,
    status: { $in: ['new', 'overdue'] },
    dueDate: { $gte: currentMonthStart }
  };
  // Bills/orders in the same post-departure window can't be voided here
  // because money was already collected on them (status is 'partial' or
  // 'paid', not 'new'/'overdue'). Those need a refund case instead of a
  // silent void, otherwise the payment just sits there looking legitimate.
  // Note: for a bill spanning the departure date itself (e.g. due mid-month,
  // student left day 6), the refund case is created for the FULL amount
  // paid so far - proration for days actually attended is a judgment call
  // left to the human reviewing the refund case, not automated here.
  const protectedFilter = {
    studentMembershipId: membership._id,
    status: { $in: ['partial', 'paid'] },
    dueDate: { $gte: currentMonthStart },
    amountPaid: { $gt: 0 }
  };

  const [billUpdate, orderUpdate, protectedBills, protectedOrders] = await Promise.all([
    FinanceBill.updateMany(voidFilter, { $set: voidFields }, { session }),
    FeeOrder.updateMany(voidFilter, { $set: voidFields }, { session }),
    FinanceBill.find(protectedFilter).session(session),
    FeeOrder.find(protectedFilter).session(session)
  ]);

  const refundReasonNote = `${action} مؤثر از ${effectiveAt.toISOString().slice(0, 10)}؛ این سند به همان ماه یا بعد از ختم عضویت تعلق دارد و باید بازپرداخت یا بررسی شود (در صورتی که سررسید این سند وسط ماه محرومیت/منفکی باشد، مبلغ متناسب با روزهای حضور را دستی محاسبه کنید).`;
  const protectedDocuments = [
    ...protectedBills.map((bill) => ({ doc: bill, key: 'bill' })),
    ...protectedOrders.map((order) => ({ doc: order, key: 'feeOrder' }))
  ];

  let refundCasesCreated = 0;
  for (const { doc, key } of protectedDocuments) {
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
      reasonNote: refundReasonNote,
      detectionSource: 'auto_lifecycle',
      createdBy: actorId,
      session
    });
    if (created) refundCasesCreated += 1;
  }

  return {
    bills: Number(billUpdate?.modifiedCount || 0),
    orders: Number(orderUpdate?.modifiedCount || 0),
    refundCasesCreated
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

  if (['transfer_in', 'transfer_out', 'class_transfer'].includes(action)) {
    const isInternal = action === 'class_transfer';
    const [document] = await StudentTransfer.create([{
      ...common,
      direction: isInternal ? 'internal' : (action === 'transfer_in' ? 'in' : 'out'),
      sourceMembershipId: action === 'transfer_out' ? membership._id : previousMembership?._id || null,
      targetMembershipId: action === 'transfer_out' ? null : membership._id,
      sourceClassId: action === 'transfer_out' ? membership.classId || null : previousMembership?.classId || null,
      targetClassId: action === 'transfer_out' ? null : membership.classId || null,
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

  if (action === 're_enrollment') {
    const reason = normalizeText(payload.reason) || normalizeText(payload.note);
    if (!reason) throw lifecycleError('student_re_enrollment_reason_required', 400);
    if (!previousMembership?._id) throw lifecycleError('student_previous_membership_required', 400);
    if (normalizeText(previousMembership.status) === 'expelled' && !normalizeText(payload.authorityReference)) {
      throw lifecycleError('student_re_enrollment_authority_reference_required', 400);
    }
    const [document] = await StudentReEnrollment.create([{
      ...common,
      previousMembershipId: previousMembership._id,
      targetMembershipId: membership._id,
      sourceStatus: normalizeText(previousMembership.status),
      targetClassId: membership.classId,
      academicYearId: membership.academicYearId || membership.academicYear || null,
      effectiveAt,
      reason,
      authorityReference: normalizeText(payload.authorityReference),
      approvedBy: actorId || null,
      approvedAt: new Date(),
      createdBy: actorId || null
    }], { session });
    return { document, documentType: 'StudentReEnrollment' };
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
  let sourceBeforeState = null;

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
  } else if (action === 'class_transfer') {
    previousMembership = await loadMembershipForUpdate(payload.membershipId, session);
    assertExpectedVersion(previousMembership, payload.expectedVersion);
    if (previousMembership.isCurrent !== true) throw lifecycleError('student_membership_not_current', 409);
    sourceBeforeState = snapshotMembership(previousMembership);

    const course = normalizeId(payload.courseId || payload.course);
    const classId = normalizeId(payload.classId);
    const academicYearId = normalizeId(payload.academicYearId || payload.academicYear);
    if (!course || !classId) throw lifecycleError('student_class_transfer_scope_required', 400);
    if (String(previousMembership.classId || '') === String(classId)) throw lifecycleError('student_class_transfer_same_class', 409);

    const conflict = await StudentMembership.findOne({
      _id: { $ne: previousMembership._id },
      student: previousMembership.student,
      isCurrent: true,
      status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
    }).session(session);
    if (conflict) throw lifecycleError('student_current_membership_conflict', 409);

    const oldStatus = previousMembership.status;
    previousMembership.status = 'transferred';
    previousMembership.endedReason = 'class_transfer';
    previousMembership.endedAt = effectiveAt;
    previousMembership.leftAt = effectiveAt;
    previousMembership.note = normalizeText(payload.note) || normalizeText(payload.reason) || previousMembership.note;
    await previousMembership.save({ session });

    membership = new StudentMembership({
      student: previousMembership.student,
      studentId: previousMembership.studentId || normalizeId(payload.studentCoreId),
      afghanStudentId: previousMembership.afghanStudentId || null,
      schoolId: normalizeId(payload.schoolId) || previousMembership.schoolId || null,
      course,
      classId,
      academicYear: academicYearId,
      academicYearId,
      previousMembershipId: previousMembership._id,
      admissionType: 'class_transfer',
      status: oldStatus === 'transferred_in' ? 'transferred_in' : 'active',
      source: 'admin',
      enrolledAt: effectiveAt,
      joinedAt: effectiveAt,
      createdBy: actorId,
      note: normalizeText(payload.note) || normalizeText(payload.reason)
    });
  } else if (action === 're_enrollment') {
    previousMembership = await loadMembershipForUpdate(payload.membershipId || payload.previousMembershipId, session);
    assertExpectedVersion(previousMembership, payload.expectedVersion);
    if (previousMembership.isCurrent === true || !['transferred', 'transferred_out', 'dropped', 'expelled', 'inactive'].includes(normalizeText(previousMembership.status))) {
      throw lifecycleError('student_re_enrollment_requires_ended_membership', 409);
    }

    const course = normalizeId(payload.courseId || payload.course);
    const classId = normalizeId(payload.classId);
    const academicYearId = normalizeId(payload.academicYearId || payload.academicYear);
    if (!course || !classId) throw lifecycleError('student_re_enrollment_scope_required', 400);

    const conflict = await StudentMembership.findOne({
      student: previousMembership.student,
      isCurrent: true,
      status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
    }).session(session);
    if (conflict) throw lifecycleError('student_current_membership_conflict', 409);

    membership = new StudentMembership({
      student: previousMembership.student,
      studentId: previousMembership.studentId || normalizeId(payload.studentCoreId),
      afghanStudentId: previousMembership.afghanStudentId || null,
      schoolId: normalizeId(payload.schoolId) || previousMembership.schoolId || null,
      course,
      classId,
      academicYear: academicYearId,
      academicYearId,
      previousMembershipId: previousMembership._id,
      admissionType: 're_enrollment',
      status: 'active',
      source: 'admin',
      enrolledAt: effectiveAt,
      joinedAt: effectiveAt,
      createdBy: actorId,
      note: normalizeText(payload.note) || normalizeText(payload.reason)
    });
  } else {
    membership = await loadMembershipForUpdate(payload.membershipId, session);
    assertExpectedVersion(membership, payload.expectedVersion);
    previousMembership = membership.previousMembershipId
      ? await StudentMembership.findById(membership.previousMembershipId).session(session)
      : null;
  }

  const beforeState = sourceBeforeState || snapshotMembership(['class_transfer', 're_enrollment'].includes(action) ? previousMembership : membership);
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
  } else if (action === 're_enrollment') {
    membership.status = 'active';
    membership.admissionType = 're_enrollment';
  } else if (action === 'class_transfer') {
    membership.admissionType = 'class_transfer';
  }
  membership.note = normalizeText(payload.note) || membership.note;
  if (actorId) membership.createdBy = actorId;
  await membership.save({ session });
  await syncAfghanStudentLifecycleProjection(membership, action, session);

  if (action === 'transfer_in') {
    admissionBilling = await issueTransferAdmissionBill({
      membership,
      actorId,
      effectiveAt,
      session
    });
  }
  const billingSourceMembership = action === 'class_transfer' ? previousMembership : membership;
  const stoppedFutureBills = await reconcileFutureBillingForEndedMembership(billingSourceMembership, action, effectiveAt, actorId, session);
  const financialEffects = {
    ...stoppedFutureBills,
    admissionBillCreated: admissionBilling?.created === true,
    admissionBillId: String(admissionBilling?.bill?._id || ''),
    ...(['class_transfer', 're_enrollment'].includes(action) ? { billingStartsAt: effectiveAt.toISOString() } : {})
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
        'برای ثبت یک‌پارچه تغییرات تعلیمی شاگرد، دیتابیس باید در حالت Replica Set یا Mongos فعال باشد.'
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  if (result?.admissionBilling?.bill) {
    await syncStudentFinanceFromFinanceBill(result.admissionBilling.bill).catch(() => null);
  }

  // Best-effort: runs after commit so a notification failure never rolls
  // back (or blocks) a lifecycle change that has already been recorded.
  notifyFinanceOfLifecycleChange({
    app: context.app,
    membership: result?.membership,
    action: result?.action,
    effectiveAt: result?.effectiveAt,
    stoppedFutureBills: result?.stoppedFutureBills
  });
  broadcastFinanceLifecycleChange({
    app: context.app,
    membership: result?.membership,
    action: result?.action,
    effectiveAt: result?.effectiveAt
  });
  // A lifecycle action can void/refund-case bills and always changes the
  // status the debtor/legacy-arrears split reads - keep the cached finance
  // reports from showing a departed student as still active.
  invalidateFinanceReportCache();

  return result;
}

async function getStudentLifecycleHistory(membershipId) {
  const normalizedId = normalizeId(membershipId);
  if (!normalizedId) throw lifecycleError('student_membership_required', 400);
  const membership = await StudentMembership.findById(normalizedId).lean();
  if (!membership) return null;
  const [events, transfers, dropouts, expulsions, suspensions, reEnrollments] = await Promise.all([
    StudentLifecycleEvent.find({
      $or: [{ membershipId: normalizedId }, { previousMembershipId: normalizedId }]
    }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentTransfer.find({
      $or: [{ sourceMembershipId: normalizedId }, { targetMembershipId: normalizedId }]
    }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentDropout.find({ membershipId: normalizedId }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentExpulsion.find({ membershipId: normalizedId }).sort({ effectiveAt: -1, createdAt: -1 }).lean(),
    StudentSuspension.find({ membershipId: normalizedId }).sort({ startsAt: -1, createdAt: -1 }).lean(),
    StudentReEnrollment.find({
      $or: [{ previousMembershipId: normalizedId }, { targetMembershipId: normalizedId }]
    }).sort({ effectiveAt: -1, createdAt: -1 }).lean()
  ]);
  return {
    membership: snapshotMembership(membership),
    events,
    documents: { transfers, dropouts, expulsions, suspensions, reEnrollments }
  };
}

module.exports = {
  SUPPORTED_ACTIONS,
  applyLifecycleAction,
  executeStudentLifecycleAction,
  getStudentLifecycleHistory,
  snapshotMembership
};
