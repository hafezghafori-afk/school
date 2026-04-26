const mongoose = require('mongoose');

const User = require('../models/User');
require('../models/AcademicYear');
require('../models/Course');
require('../models/SchoolClass');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Grade = require('../models/Grade');
const Result = require('../models/Result');
const ActivityLog = require('../models/ActivityLog');
const { serializeUserIdentity } = require('../utils/userRole');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: false });
  }
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return null;
  if (mongoose.isValidObjectId(value)) {
    return String(value);
  }
  return null;
}

function sortByDateDesc(left, right) {
  return new Date(right.at || right.createdAt || 0).getTime() - new Date(left.at || left.createdAt || 0).getTime();
}

function buildReferenceFilter({ studentCoreId, userId, membershipIds }) {
  const branches = [];

  if (Array.isArray(membershipIds) && membershipIds.length > 0) {
    branches.push({ studentMembershipId: { $in: membershipIds } });
  }
  if (studentCoreId) {
    branches.push({ studentId: studentCoreId });
  }
  if (userId) {
    branches.push({ student: userId });
  }

  if (branches.length === 0) {
    return { _id: null };
  }
  if (branches.length === 1) {
    return branches[0];
  }
  return { $or: branches };
}

function formatAcademicYear(yearDoc) {
  const year = toPlain(yearDoc);
  if (!year) return null;

  return {
    id: String(year._id),
    code: normalizeText(year.code),
    name: normalizeText(year.name),
    label: normalizeText(year.label) || normalizeText(year.name) || normalizeText(year.code),
    status: normalizeText(year.status),
    isActive: Boolean(year.isActive),
    startsAt: year.startsAt || null,
    endsAt: year.endsAt || null
  };
}

function formatClass(classDoc) {
  const schoolClass = toPlain(classDoc);
  if (!schoolClass) return null;

  return {
    id: String(schoolClass._id),
    title: normalizeText(schoolClass.title),
    code: normalizeText(schoolClass.code),
    gradeLevel: normalizeText(schoolClass.gradeLevel),
    section: normalizeText(schoolClass.section),
    shift: normalizeText(schoolClass.shift),
    room: normalizeText(schoolClass.room),
    status: normalizeText(schoolClass.status),
    academicYear: formatAcademicYear(schoolClass.academicYearId)
  };
}

function formatCourse(courseDoc) {
  const course = toPlain(courseDoc);
  if (!course) return null;

  return {
    id: String(course._id),
    title: normalizeText(course.title),
    category: normalizeText(course.category),
    level: normalizeText(course.level),
    kind: normalizeText(course.kind)
  };
}

function formatUser(userDoc) {
  const user = toPlain(userDoc);
  if (!user) return null;

  return {
    id: String(user._id),
    name: normalizeText(user.name),
    email: normalizeText(user.email),
    role: normalizeText(user.role),
    orgRole: normalizeText(user.orgRole),
    status: normalizeText(user.status),
    grade: normalizeText(user.grade),
    subject: normalizeText(user.subject),
    bio: normalizeText(user.bio),
    avatarUrl: normalizeText(user.avatarUrl),
    lastLoginAt: user.lastLoginAt || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null
  };
}

function formatGuardianLink(guardianDoc = {}) {
  const guardian = toPlain(guardianDoc);
  if (!guardian) return null;

  return {
    id: String(guardian._id || ''),
    userId: guardian.userId ? String(guardian.userId._id || guardian.userId) : '',
    name: normalizeText(guardian.name) || normalizeText(guardian.userId?.name),
    email: normalizeText(guardian.email) || normalizeText(guardian.userId?.email),
    phone: normalizeText(guardian.phone),
    relation: normalizeText(guardian.relation),
    isPrimary: Boolean(guardian.isPrimary),
    status: normalizeText(guardian.status) || 'active',
    linkedAt: guardian.linkedAt || null,
    note: normalizeText(guardian.note),
    user: guardian.userId ? formatUser(guardian.userId) : null
  };
}

function formatIdentity(studentCoreDoc, userDoc) {
  const studentCore = toPlain(studentCoreDoc) || {};
  const user = formatUser(userDoc);
  const fullName = normalizeText(studentCore.fullName) || normalizeText(studentCore.preferredName) || normalizeText(user?.name);

  return {
    id: String(studentCore._id),
    userId: studentCore.userId ? String(studentCore.userId) : (user ? user.id : ''),
    admissionNo: normalizeText(studentCore.admissionNo),
    fullName,
    preferredName: normalizeText(studentCore.preferredName) || fullName,
    givenName: normalizeText(studentCore.givenName),
    familyName: normalizeText(studentCore.familyName),
    email: normalizeText(studentCore.email) || normalizeText(user?.email),
    phone: normalizeText(studentCore.phone),
    gender: normalizeText(studentCore.gender),
    dateOfBirth: normalizeText(studentCore.dateOfBirth),
    status: normalizeText(studentCore.status) || normalizeText(user?.status),
    note: normalizeText(studentCore.note),
    user
  };
}

function formatMembership(membershipDoc) {
  const membership = toPlain(membershipDoc);
  if (!membership) return null;

  return {
    id: String(membership._id),
    status: normalizeText(membership.status),
    source: normalizeText(membership.source),
    isCurrent: Boolean(membership.isCurrent),
    enrolledAt: membership.enrolledAt || membership.joinedAt || null,
    endedAt: membership.endedAt || membership.leftAt || null,
    endedReason: normalizeText(membership.endedReason) || normalizeText(membership.rejectedReason),
    note: normalizeText(membership.note),
    createdAt: membership.createdAt || null,
    updatedAt: membership.updatedAt || null,
    academicYear: formatAcademicYear(membership.academicYearId || membership.academicYear),
    schoolClass: formatClass(membership.classId),
    course: formatCourse(membership.course)
  };
}

function formatBill(billDoc) {
  const bill = toPlain(billDoc);
  if (!bill) return null;
  const academicYear = formatAcademicYear(bill.academicYearId);

  return {
    id: String(bill._id),
    billNumber: normalizeText(bill.billNumber) || normalizeText(bill.orderNumber),
    status: normalizeText(bill.status),
    academicYearLabel: normalizeText(bill.academicYear) || normalizeText(academicYear?.label),
    term: normalizeText(bill.term),
    periodType: normalizeText(bill.periodType),
    periodLabel: normalizeText(bill.periodLabel),
    currency: normalizeText(bill.currency) || 'AFN',
    amountOriginal: Number(bill.amountOriginal || 0),
    amountDue: Number(bill.amountDue || 0),
    amountPaid: Number(bill.amountPaid || 0),
    issuedAt: bill.issuedAt || bill.createdAt || null,
    dueDate: bill.dueDate || null,
    paidAt: bill.paidAt || null,
    note: normalizeText(bill.note),
    course: formatCourse(bill.course),
    schoolClass: formatClass(bill.classId),
    academicYear
  };
}

function formatReceipt(receiptDoc) {
  const receipt = toPlain(receiptDoc);
  if (!receipt) return null;
  const feeOrder = toPlain(receipt.feeOrderId);

  return {
    id: String(receipt._id),
    status: normalizeText(receipt.status),
    approvalStage: normalizeText(receipt.approvalStage),
    amount: Number(receipt.amount || 0),
    paymentMethod: normalizeText(receipt.paymentMethod),
    referenceNo: normalizeText(receipt.referenceNo),
    paidAt: receipt.paidAt || receipt.createdAt || null,
    note: normalizeText(receipt.note),
    fileUrl: normalizeText(receipt.fileUrl),
    course: formatCourse(receipt.course || feeOrder?.course),
    schoolClass: formatClass(receipt.classId || feeOrder?.classId),
    academicYear: formatAcademicYear(receipt.academicYearId || feeOrder?.academicYearId),
    billId: receipt.bill
      ? String(receipt.bill._id || receipt.bill)
      : (receipt.feeOrderId ? String(receipt.feeOrderId._id || receipt.feeOrderId) : ''),
    billNumber: normalizeText(feeOrder?.orderNumber)
  };
}

function formatGrade(gradeDoc) {
  const grade = toPlain(gradeDoc);
  if (!grade) return null;

  return {
    id: String(grade._id),
    totalScore: Number(grade.totalScore || 0),
    finalExamScore: Number(grade.finalExamScore || 0),
    attachmentOriginalName: normalizeText(grade.attachmentOriginalName),
    updatedAt: grade.updatedAt || grade.createdAt || null,
    course: formatCourse(grade.course),
    schoolClass: formatClass(grade.classId),
    academicYear: formatAcademicYear(grade.academicYearId)
  };
}

function formatQuizResult(resultDoc) {
  const result = toPlain(resultDoc);
  if (!result) return null;

  return {
    id: String(result._id),
    score: Number(result.score || 0),
    totalQuestions: Number(result.totalQuestions || 0),
    date: result.date || null,
    course: formatCourse(result.course)
  };
}

function formatActivityLog(logDoc) {
  const log = toPlain(logDoc);
  if (!log) return null;

  return {
    id: String(log._id),
    action: normalizeText(log.action),
    targetType: normalizeText(log.targetType),
    targetId: normalizeText(log.targetId),
    route: normalizeText(log.route),
    httpMethod: normalizeText(log.httpMethod),
    reason: normalizeText(log.reason),
    actorRole: normalizeText(log.actorRole),
    actorOrgRole: normalizeText(log.actorOrgRole),
    meta: log.meta || {},
    createdAt: log.createdAt || null
  };
}

function buildFinanceSummary(bills, receipts) {
  const openStatuses = new Set(['new', 'partial', 'overdue']);

  return {
    billCount: bills.length,
    receiptCount: receipts.length,
    openBillCount: bills.filter((item) => openStatuses.has(item.status)).length,
    pendingReceiptCount: receipts.filter((item) => item.status === 'pending').length,
    approvedReceiptCount: receipts.filter((item) => item.status === 'approved').length,
    totalBilled: bills.reduce((sum, item) => sum + Number(item.amountOriginal || 0), 0),
    totalDue: bills.reduce((sum, item) => sum + Number(item.amountDue || 0), 0),
    totalPaid: bills.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0)
  };
}

function buildResultSummary(grades, quizResults) {
  const gradeScores = grades
    .map((item) => Number(item.totalScore || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const quizScores = quizResults
    .map((item) => Number(item.score || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const combined = [...gradeScores, ...quizScores];
  const averageScore = combined.length > 0
    ? Number((combined.reduce((sum, value) => sum + value, 0) / combined.length).toFixed(2))
    : 0;

  return {
    gradeCount: grades.length,
    quizResultCount: quizResults.length,
    averageScore,
    bestScore: combined.length > 0 ? Math.max(...combined) : 0
  };
}

function buildProfileTimeline(profile) {
  const timeline = [];

  (profile.remarks || []).forEach((remark) => {
    timeline.push({
      id: String(remark._id),
      type: 'remark',
      title: normalizeText(remark.title) || 'Remark',
      note: normalizeText(remark.text),
      meta: normalizeText(remark.type),
      at: remark.createdAt || null
    });
  });

  (profile.transfers || []).forEach((transfer) => {
    timeline.push({
      id: String(transfer._id),
      type: 'transfer',
      title: 'Transfer',
      note: [normalizeText(transfer.fromLabel), normalizeText(transfer.toLabel)].filter(Boolean).join(' -> '),
      meta: normalizeText(transfer.direction),
      at: transfer.transferredAt || null
    });
  });

  (profile.documents || []).forEach((document) => {
    timeline.push({
      id: String(document._id),
      type: 'document',
      title: normalizeText(document.title) || 'Document',
      note: normalizeText(document.note),
      meta: normalizeText(document.kind),
      at: document.uploadedAt || null
    });
  });

  return timeline.sort(sortByDateDesc).slice(0, 25);
}

function sanitizeFamilyInput(input = {}) {
  return {
    fatherName: normalizeText(input.fatherName),
    motherName: normalizeText(input.motherName),
    guardianName: normalizeText(input.guardianName),
    guardianRelation: normalizeText(input.guardianRelation)
  };
}

function sanitizeContactInput(input = {}) {
  return {
    primaryPhone: normalizeText(input.primaryPhone),
    alternatePhone: normalizeText(input.alternatePhone),
    email: normalizeText(input.email),
    address: normalizeText(input.address)
  };
}

function sanitizeBackgroundInput(input = {}) {
  return {
    previousSchool: normalizeText(input.previousSchool),
    emergencyPhone: normalizeText(input.emergencyPhone)
  };
}

function sanitizeNotesInput(input = {}) {
  return {
    medical: normalizeText(input.medical),
    administrative: normalizeText(input.administrative)
  };
}

function sanitizeGuardianInput(input = {}) {
  return {
    userId: normalizeNullableId(input.userId || input.guardianUserId),
    name: normalizeText(input.name),
    relation: normalizeText(input.relation),
    phone: normalizeText(input.phone),
    email: normalizeText(input.email),
    isPrimary: Boolean(input.isPrimary),
    status: normalizeText(input.status) === 'inactive' ? 'inactive' : 'active',
    note: normalizeText(input.note)
  };
}

function guardianUserKey(guardian = {}) {
  return normalizeNullableId(guardian?.userId?._id || guardian?.userId) || '';
}

function sanitizeGuardianLinks(guardians = []) {
  return (Array.isArray(guardians) ? guardians : []).filter((item) => guardianUserKey(item));
}

function syncGuardianFallbackFields(profile) {
  const guardians = sanitizeGuardianLinks(profile?.guardians);
  const activeGuardians = guardians.filter((item) => normalizeText(item?.status) !== 'inactive');
  const primaryGuardian = activeGuardians.find((item) => item?.isPrimary) || activeGuardians[0] || null;

  if (!profile.family) profile.family = sanitizeFamilyInput();
  profile.family.guardianName = primaryGuardian
    ? (normalizeText(primaryGuardian.name) || normalizeText(primaryGuardian.userId?.name))
    : '';
  profile.family.guardianRelation = primaryGuardian ? normalizeText(primaryGuardian.relation) : '';
}

async function buildGuardianLinkedStudents(guardianUserId) {
  const guardianId = normalizeNullableId(guardianUserId);
  if (!guardianId) return [];

  const profiles = await StudentProfile.find({ 'guardians.userId': guardianId })
    .populate('studentId');
  if (!profiles.length) return [];

  const studentCoreIds = profiles.map((item) => item.studentId?._id).filter(Boolean);
  const memberships = await StudentMembership.find({
    studentId: { $in: studentCoreIds },
    status: 'active',
    isCurrent: true
  })
    .populate({ path: 'classId', select: 'title titleDari' })
    .populate('academicYearId', 'title label name')
    .populate('student', 'name email')
    .sort({ createdAt: -1 });

  const membershipByStudentCore = new Map();
  memberships.forEach((item) => {
    const studentCoreKey = item.studentId ? String(item.studentId) : '';
    if (studentCoreKey && !membershipByStudentCore.has(studentCoreKey)) {
      membershipByStudentCore.set(studentCoreKey, item);
    }
  });

  return profiles
    .map((profile) => {
      const studentCore = toPlain(profile.studentId);
      if (!studentCore?._id) return null;
      const membership = membershipByStudentCore.get(String(studentCore._id)) || null;
      const guardianLink = (profile.guardians || []).find((item) => String(item?.userId || item?.userId?._id || '') === guardianId) || null;
      const fullName = normalizeText(studentCore.fullName) || normalizeText(studentCore.preferredName) || normalizeText(membership?.student?.name);

      return {
        studentCoreId: String(studentCore._id),
        studentUserId: studentCore.userId ? String(studentCore.userId) : (membership?.student?._id ? String(membership.student._id) : ''),
        membershipId: membership?._id ? String(membership._id) : '',
        fullName,
        preferredName: normalizeText(studentCore.preferredName) || fullName,
        admissionNo: normalizeText(studentCore.admissionNo),
        email: normalizeText(studentCore.email) || normalizeText(membership?.student?.email),
        guardianPhone: normalizeText(guardianLink?.phone),
        relation: normalizeText(guardianLink?.relation),
        isPrimary: Boolean(guardianLink?.isPrimary),
        classTitle: membership?.classId?.titleDari || membership?.classId?.title || '',
        academicYearTitle: membership?.academicYearId?.title || membership?.academicYearId?.label || membership?.academicYearId?.name || '',
        hasActiveMembership: Boolean(membership)
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return String(left.fullName || '').localeCompare(String(right.fullName || ''), 'fa');
    });
}

async function ensureStudentCoreFromUser(userDoc) {
  const user = toPlain(userDoc);
  if (!user || String(user.role) !== 'student') {
    return null;
  }

  const existing = await StudentCore.findOne({ userId: user._id });
  if (existing) {
    return existing;
  }

  return StudentCore.create({
    userId: user._id,
    fullName: normalizeText(user.name),
    preferredName: normalizeText(user.name),
    email: normalizeText(user.email),
    status: normalizeText(user.status) || 'active'
  });
}

async function resolveStudentCore(studentRef) {
  const normalizedRef = normalizeText(studentRef);
  if (!normalizedRef || !mongoose.isValidObjectId(normalizedRef)) {
    return { studentCore: null, user: null };
  }

  let studentCore = await StudentCore.findById(normalizedRef);
  let user = null;

  if (!studentCore) {
    studentCore = await StudentCore.findOne({ userId: normalizedRef });
  }

  if (studentCore) {
    user = studentCore.userId ? await User.findById(studentCore.userId) : null;
    return { studentCore, user };
  }

  user = await User.findById(normalizedRef);
  if (!user || String(user.role) !== 'student') {
    return { studentCore: null, user: null };
  }

  studentCore = await ensureStudentCoreFromUser(user);
  return { studentCore, user };
}

async function ensureStudentProfile(studentCoreId) {
  return StudentProfile.findOneAndUpdate(
    { studentId: studentCoreId },
    { $setOnInsert: { studentId: studentCoreId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function listStudentProfiles({ query = '' } = {}) {
  const search = normalizeText(query).toLowerCase();
  const studentUsers = await User.find({ role: 'student' })
    .select('name email role orgRole status grade subject bio avatarUrl createdAt updatedAt lastLoginAt')
    .sort({ name: 1, createdAt: 1 });

  const userById = new Map();
  studentUsers.forEach((user) => {
    userById.set(String(user._id), user);
  });

  const userIds = studentUsers.map((user) => user._id);
  const studentCores = await StudentCore.find({
    $or: [
      { userId: { $in: userIds } },
      { status: { $ne: 'archived' } }
    ]
  }).sort({ fullName: 1, createdAt: 1 });

  const seenUserIds = new Set();
  const normalizedCores = [];

  for (const studentCore of studentCores) {
    const userId = studentCore.userId ? String(studentCore.userId) : '';
    if (userId) {
      seenUserIds.add(userId);
    }
    normalizedCores.push(studentCore);
  }

  for (const user of studentUsers) {
    const userId = String(user._id);
    if (!seenUserIds.has(userId)) {
      const createdCore = await ensureStudentCoreFromUser(user);
      if (createdCore) {
        normalizedCores.push(createdCore);
      }
    }
  }

  const studentCoreIds = normalizedCores.map((item) => item._id);
  const currentMemberships = await StudentMembership.find({
    isCurrent: true,
    $or: [
      { studentId: { $in: studentCoreIds } },
      { student: { $in: userIds } }
    ]
  })
    .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } })
    .populate('academicYearId', 'name label code status isActive startsAt endsAt')
    .sort({ createdAt: -1 });

  const membershipByKey = new Map();
  currentMemberships.forEach((membership) => {
    const studentCoreKey = membership.studentId ? String(membership.studentId) : '';
    const studentUserKey = membership.student ? String(membership.student) : '';
    if (studentCoreKey && !membershipByKey.has(studentCoreKey)) {
      membershipByKey.set(studentCoreKey, membership);
    }
    if (studentUserKey && !membershipByKey.has(studentUserKey)) {
      membershipByKey.set(studentUserKey, membership);
    }
  });

  const items = normalizedCores
    .map((studentCore) => {
      const user = studentCore.userId ? userById.get(String(studentCore.userId)) || null : null;
      const identity = formatIdentity(studentCore, user);
      const currentMembership = membershipByKey.get(String(studentCore._id)) || membershipByKey.get(identity.userId) || null;
      const currentMembershipItem = currentMembership ? formatMembership(currentMembership) : null;

      return {
        studentId: identity.id,
        userId: identity.userId,
        fullName: identity.fullName,
        email: identity.email,
        admissionNo: identity.admissionNo,
        status: identity.status,
        currentMembership: currentMembershipItem,
        updatedAt: studentCore.updatedAt || studentCore.createdAt || null
      };
    })
    .filter((item) => {
      if (!search) return true;
      const haystack = [
        item.fullName,
        item.email,
        item.admissionNo,
        item.currentMembership?.schoolClass?.title,
        item.currentMembership?.academicYear?.label
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName, 'en', { sensitivity: 'base' }));

  return items;
}

async function getStudentProfile(studentRef) {
  const { studentCore, user } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profileStub = await ensureStudentProfile(studentCore._id);
  const profileDoc = await StudentProfile.findById(profileStub._id)
    .populate('guardians.userId', 'name email role orgRole status lastLoginAt');
  const memberships = await StudentMembership.find({
    $or: [
      { studentId: studentCore._id },
      ...(user ? [{ student: user._id }] : [])
    ]
  })
    .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } })
    .populate('course', 'title category level kind')
    .populate('academicYearId', 'name label code status isActive startsAt endsAt')
    .sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1 });

  const membershipIds = memberships.map((membership) => membership._id);
  const referenceFilter = buildReferenceFilter({
    studentCoreId: studentCore._id,
    userId: user ? user._id : null,
    membershipIds
  });

  const [bills, receipts, grades, quizResults, logs] = await Promise.all([
    FeeOrder.find(referenceFilter)
      .populate('course', 'title category level kind')
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'name label code status isActive startsAt endsAt')
      .sort({ issuedAt: -1, createdAt: -1 })
      .limit(50),
    FeePayment.find(referenceFilter)
      .populate({
        path: 'feeOrderId',
        select: 'orderNumber course classId academicYearId amountDue amountPaid status',
        populate: [
          { path: 'course', select: 'title category level kind' },
          { path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } },
          { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' }
        ]
      })
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'name label code status isActive startsAt endsAt')
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(50),
    Grade.find(referenceFilter)
      .populate('course', 'title category level kind')
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'name label code status isActive startsAt endsAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(50),
    user
      ? Result.find({ user: user._id }).populate('course', 'title category level kind').sort({ date: -1 }).limit(50)
      : [],
    user
      ? ActivityLog.find({ targetUser: user._id }).sort({ createdAt: -1 }).limit(40)
      : []
  ]);

  const membershipItems = memberships.map(formatMembership).filter(Boolean);
  const financeBills = bills.map(formatBill).filter(Boolean);
  const financeReceipts = receipts.map(formatReceipt).filter(Boolean);
  const gradeItems = grades.map(formatGrade).filter(Boolean);
  const quizItems = quizResults.map(formatQuizResult).filter(Boolean);
  const activityItems = logs.map(formatActivityLog).filter(Boolean);
  const profile = toPlain(profileDoc) || {};
  const currentMembership = membershipItems.find((item) => item.isCurrent) || membershipItems[0] || null;

  return {
    identity: {
      ...formatIdentity(studentCore, user),
      currentMembership
    },
    profile: {
      family: profile.family || sanitizeFamilyInput(),
      contact: profile.contact || sanitizeContactInput(),
      background: profile.background || sanitizeBackgroundInput(),
      notes: profile.notes || sanitizeNotesInput(),
      guardians: (profile.guardians || []).map(formatGuardianLink).filter(Boolean),
      remarks: (profile.remarks || []).map((remark) => ({
        id: String(remark._id),
        type: normalizeText(remark.type),
        title: normalizeText(remark.title),
        text: normalizeText(remark.text),
        visibility: normalizeText(remark.visibility),
        createdBy: remark.createdBy ? String(remark.createdBy) : '',
        createdAt: remark.createdAt || null
      })),
      transfers: (profile.transfers || []).map((transfer) => ({
        id: String(transfer._id),
        direction: normalizeText(transfer.direction),
        fromLabel: normalizeText(transfer.fromLabel),
        toLabel: normalizeText(transfer.toLabel),
        fromClassId: transfer.fromClassId ? String(transfer.fromClassId) : '',
        toClassId: transfer.toClassId ? String(transfer.toClassId) : '',
        academicYearId: transfer.academicYearId ? String(transfer.academicYearId) : '',
        transferredAt: transfer.transferredAt || null,
        note: normalizeText(transfer.note)
      })),
      documents: (profile.documents || []).map((document) => ({
        id: String(document._id),
        kind: normalizeText(document.kind),
        title: normalizeText(document.title),
        fileUrl: normalizeText(document.fileUrl),
        note: normalizeText(document.note),
        uploadedBy: document.uploadedBy ? String(document.uploadedBy) : '',
        uploadedAt: document.uploadedAt || null
      }))
    },
    memberships: membershipItems,
    finance: {
      summary: buildFinanceSummary(financeBills, financeReceipts),
      bills: financeBills,
      receipts: financeReceipts
    },
    results: {
      summary: buildResultSummary(gradeItems, quizItems),
      grades: gradeItems,
      quizResults: quizItems
    },
    activity: {
      logs: activityItems
    },
    timeline: buildProfileTimeline(profile),
    summary: {
      membershipCount: membershipItems.length,
      activeMembershipCount: membershipItems.filter((item) => item.isCurrent).length,
      remarkCount: (profile.remarks || []).length,
      transferCount: (profile.transfers || []).length,
      documentCount: (profile.documents || []).length,
      billCount: financeBills.length,
      receiptCount: financeReceipts.length,
      gradeCount: gradeItems.length,
      quizResultCount: quizItems.length,
      logCount: activityItems.length
    }
  };
}

async function updateStudentProfileBasics(studentRef, payload = {}) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.family = sanitizeFamilyInput(payload.family || profile.family);
  profile.contact = sanitizeContactInput(payload.contact || profile.contact);
  profile.background = sanitizeBackgroundInput(payload.background || profile.background);
  profile.notes = sanitizeNotesInput(payload.notes || profile.notes);
  await profile.save();

  return getStudentProfile(String(studentCore._id));
}

async function listGuardianCandidates({ query = '' } = {}) {
  const search = normalizeText(query).toLowerCase();
  const filter = { orgRole: 'parent' };

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    const matchingProfiles = await StudentProfile.find({
      $or: [
        { 'guardians.name': rx },
        { 'guardians.email': rx },
        { 'guardians.phone': rx }
      ]
    }).select('guardians');

    const linkedGuardianIds = new Set();
    matchingProfiles.forEach((profile) => {
      (profile?.guardians || []).forEach((guardian) => {
        const guardianId = guardianUserKey(guardian);
        if (!guardianId) return;
        const guardianHaystack = [
          guardian?.name,
          guardian?.email,
          guardian?.phone
        ].filter(Boolean).join(' ').toLowerCase();

        if (guardianHaystack.includes(search)) {
          linkedGuardianIds.add(guardianId);
        }
      });
    });

    filter.$or = [{ name: rx }, { email: rx }];
    if (linkedGuardianIds.size) {
      filter.$or.push({ _id: { $in: Array.from(linkedGuardianIds) } });
    }
  }

  const items = await User.find(filter)
    .select('name email role orgRole status avatarUrl lastLoginAt')
    .sort({ status: 1, name: 1 })
    .limit(search ? 40 : 12);

  const enrichedItems = await Promise.all(items.map(async (item) => {
    const user = toPlain(item);
    const identity = serializeUserIdentity(user);
    const linkedStudents = await buildGuardianLinkedStudents(user._id);
    const phone = linkedStudents.map((student) => normalizeText(student?.guardianPhone)).find(Boolean) || '';
    const linkedStudentItems = linkedStudents.map((student) => ({
      id: student.studentCoreId || student.studentUserId || '',
      name: normalizeText(student.fullName) || normalizeText(student.preferredName),
      classTitle: normalizeText(student.classTitle),
      relation: normalizeText(student.relation),
      isPrimary: Boolean(student.isPrimary)
    }));

    return {
      id: String(user._id),
      name: normalizeText(user.name),
      email: normalizeText(user.email),
      phone,
      role: identity.role,
      orgRole: identity.orgRole,
      status: normalizeText(user.status) || 'active',
      avatarUrl: normalizeText(user.avatarUrl),
      lastLoginAt: user.lastLoginAt || null,
      linkedStudentCount: linkedStudentItems.length,
      linkedStudents: linkedStudentItems.slice(0, 3),
      hasMoreLinkedStudents: linkedStudentItems.length > 3
    };
  }));

  return enrichedItems
    .filter((item) => {
      if (!search) return true;
      const haystack = [
        item.name,
        item.email,
        item.phone,
        ...item.linkedStudents.map((student) => (
          [student.name, student.classTitle, student.relation].filter(Boolean).join(' ')
        ))
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(search);
    })
    .slice(0, search ? 20 : 12);
}

async function linkGuardianToStudent(studentRef, payload = {}) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const linkInput = sanitizeGuardianInput(payload);
  if (!linkInput.userId) {
    const error = new Error('guardian_user_required');
    error.code = 'guardian_user_required';
    throw error;
  }

  const guardianUser = await User.findById(linkInput.userId)
    .select('name email role orgRole status avatarUrl lastLoginAt');
  if (!guardianUser) {
    const error = new Error('guardian_user_not_found');
    error.code = 'guardian_user_not_found';
    throw error;
  }

  const guardianIdentity = serializeUserIdentity(guardianUser);
  if (guardianIdentity.role !== 'parent' || guardianIdentity.orgRole !== 'parent') {
    const error = new Error('guardian_role_invalid');
    error.code = 'guardian_role_invalid';
    throw error;
  }

  const profile = await StudentProfile.findOneAndUpdate(
    { studentId: studentCore._id },
    { $setOnInsert: { studentId: studentCore._id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  profile.guardians = sanitizeGuardianLinks(profile.guardians);

  const existingGuardian = profile.guardians.find((item) => guardianUserKey(item) === linkInput.userId);
  if (existingGuardian) {
    existingGuardian.name = linkInput.name || normalizeText(guardianUser.name);
    existingGuardian.email = linkInput.email || normalizeText(guardianUser.email);
    existingGuardian.phone = linkInput.phone;
    existingGuardian.relation = linkInput.relation || normalizeText(existingGuardian.relation);
    existingGuardian.status = linkInput.status;
    existingGuardian.note = linkInput.note;
    if (linkInput.isPrimary) {
      profile.guardians.forEach((item) => {
        if (!item) return;
        item.isPrimary = guardianUserKey(item) === linkInput.userId;
      });
    }
  } else {
    const shouldBePrimary = linkInput.isPrimary || !profile.guardians.some((item) => item?.isPrimary);
    if (shouldBePrimary) {
      profile.guardians.forEach((item) => {
        if (!item) return;
        item.isPrimary = false;
      });
    }
    profile.guardians.unshift({
      userId: guardianUser._id,
      name: linkInput.name || normalizeText(guardianUser.name),
      relation: linkInput.relation,
      phone: linkInput.phone,
      email: linkInput.email || normalizeText(guardianUser.email),
      isPrimary: shouldBePrimary,
      status: linkInput.status,
      note: linkInput.note
    });
  }

  profile.guardians = sanitizeGuardianLinks(profile.guardians);
  syncGuardianFallbackFields(profile);
  await profile.save();
  return getStudentProfile(String(studentCore._id));
}

async function unlinkGuardianFromStudent(studentRef, guardianRef) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const normalizedGuardianRef = normalizeText(guardianRef);
  const profile = await ensureStudentProfile(studentCore._id);
  profile.guardians = sanitizeGuardianLinks(profile.guardians);

  const previousLength = profile.guardians.length;
  profile.guardians = profile.guardians.filter((item) => {
    const guardianId = item?._id ? String(item._id) : '';
    const userId = guardianUserKey(item);
    return guardianId !== normalizedGuardianRef && userId !== normalizedGuardianRef;
  });

  if (profile.guardians.length === previousLength) {
    const error = new Error('guardian_link_not_found');
    error.code = 'guardian_link_not_found';
    throw error;
  }

  if (!profile.guardians.some((item) => item?.isPrimary) && profile.guardians[0]) {
    profile.guardians[0].isPrimary = true;
  }

  syncGuardianFallbackFields(profile);
  await profile.save();
  return getStudentProfile(String(studentCore._id));
}

async function listLinkedStudentsForGuardianUser(guardianUserId) {
  return buildGuardianLinkedStudents(guardianUserId);
}

async function addStudentRemark(studentRef, payload = {}, actorUserId = null) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.remarks = Array.isArray(profile.remarks) ? profile.remarks : [];
  profile.remarks.unshift({
    type: ['general', 'medical', 'discipline', 'administrative', 'family'].includes(normalizeText(payload.type)) ? normalizeText(payload.type) : 'general',
    title: normalizeText(payload.title),
    text: normalizeText(payload.text),
    visibility: normalizeText(payload.visibility) === 'staff' ? 'staff' : 'admin',
    createdBy: normalizeNullableId(actorUserId)
  });
  await profile.save();

  return getStudentProfile(String(studentCore._id));
}

async function addStudentTransfer(studentRef, payload = {}) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.transfers = Array.isArray(profile.transfers) ? profile.transfers : [];
  profile.transfers.unshift({
    direction: ['in', 'out', 'internal'].includes(normalizeText(payload.direction)) ? normalizeText(payload.direction) : 'internal',
    fromLabel: normalizeText(payload.fromLabel),
    toLabel: normalizeText(payload.toLabel),
    fromClassId: normalizeNullableId(payload.fromClassId),
    toClassId: normalizeNullableId(payload.toClassId),
    academicYearId: normalizeNullableId(payload.academicYearId),
    transferredAt: payload.transferredAt && !Number.isNaN(new Date(payload.transferredAt).getTime()) ? new Date(payload.transferredAt) : new Date(),
    note: normalizeText(payload.note)
  });
  await profile.save();

  return getStudentProfile(String(studentCore._id));
}

async function addStudentDocument(studentRef, payload = {}, actorUserId = null) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.documents = Array.isArray(profile.documents) ? profile.documents : [];
  profile.documents.unshift({
    kind: ['id_card', 'birth_certificate', 'report_card', 'photo', 'other'].includes(normalizeText(payload.kind)) ? normalizeText(payload.kind) : 'other',
    title: normalizeText(payload.title),
    fileUrl: normalizeText(payload.fileUrl),
    note: normalizeText(payload.note),
    uploadedBy: normalizeNullableId(actorUserId)
  });
  await profile.save();

  return getStudentProfile(String(studentCore._id));
}

module.exports = {
  addStudentDocument,
  addStudentRemark,
  addStudentTransfer,
  getStudentProfile,
  linkGuardianToStudent,
  listGuardianCandidates,
  listLinkedStudentsForGuardianUser,
  listStudentProfiles,
  unlinkGuardianFromStudent,
  updateStudentProfileBasics
};
