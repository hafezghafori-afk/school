const mongoose = require('mongoose');

const User = require('../models/User');
require('../models/AcademicYear');
require('../models/Course');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/ExamType');
require('../models/AcademicTerm');
const StudentCore = require('../models/StudentCore');
const StudentProfile = require('../models/StudentProfile');
const StudentMembership = require('../models/StudentMembership');
const StudentLifecycleEvent = require('../models/StudentLifecycleEvent');
const AfghanStudent = require('../models/AfghanStudent');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Grade = require('../models/Grade');
const Result = require('../models/Result');
const Attendance = require('../models/Attendance');
const ExamResult = require('../models/ExamResult');
const ActivityLog = require('../models/ActivityLog');
const { serializeUserIdentity } = require('../utils/userRole');
const { formatFinanceCode } = require('../utils/latinFinanceCode');
const { deriveFinanceOrderStatus } = require('../utils/financeLineItems');

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
    title: normalizeText(year.title),
    label: normalizeText(year.label) || normalizeText(year.title) || normalizeText(year.name) || normalizeText(year.code),
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

function formatIdentity(studentCoreDoc, userDoc, afghanStudentDoc = null) {
  const studentCore = toPlain(studentCoreDoc) || {};
  const user = formatUser(userDoc);
  const afghanStudent = toPlain(afghanStudentDoc) || {};
  const personalInfo = afghanStudent.personalInfo || {};
  const identification = afghanStudent.identification || {};
  const afghanFullName = [
    normalizeText(personalInfo.firstNameDari || personalInfo.firstName),
    normalizeText(personalInfo.lastNameDari || personalInfo.lastName)
  ].filter(Boolean).join(' ');
  const fullName = normalizeText(studentCore.fullName)
    || normalizeText(studentCore.preferredName)
    || normalizeText(user?.name)
    || afghanFullName;

  return {
    id: String(studentCore._id),
    userId: studentCore.userId ? String(studentCore.userId) : (user ? user.id : ''),
    admissionNo: normalizeText(studentCore.admissionNo),
    asasNumber: normalizeText(afghanStudent.asasNumber) || normalizeText(studentCore.admissionNo),
    tazkiraNumber: normalizeText(identification.tazkiraNumber),
    fullName,
    preferredName: normalizeText(studentCore.preferredName) || fullName,
    givenName: normalizeText(studentCore.givenName),
    familyName: normalizeText(studentCore.familyName),
    email: normalizeText(studentCore.email) || normalizeText(user?.email),
    phone: normalizeText(studentCore.phone),
    gender: normalizeText(studentCore.gender),
    dateOfBirth: normalizeText(studentCore.dateOfBirth) || (personalInfo.birthDate || null),
    status: normalizeText(studentCore.status) || normalizeText(user?.status),
    note: normalizeText(studentCore.note),
    avatarUrl: normalizeText(user?.avatarUrl)
      || normalizeText((afghanStudent.documents || []).find((item) => item?.type === 'photo')?.url),
    afghanStudentId: afghanStudent._id ? String(afghanStudent._id) : '',
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
    admissionType: normalizeText(membership.admissionType),
    previousMembershipId: membership.previousMembershipId ? String(membership.previousMembershipId) : '',
    changeVersion: Number(membership.changeVersion || 0),
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
  const status = deriveFinanceOrderStatus({
    currentStatus: bill.status,
    amountOriginal: bill.amountOriginal,
    amountDue: bill.amountDue,
    amountPaid: bill.amountPaid,
    dueDate: bill.dueDate
  });

  return {
    id: String(bill._id),
    billNumber: formatFinanceCode(normalizeText(bill.billNumber) || normalizeText(bill.orderNumber)),
    status,
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
    paidAt: status === 'paid' ? (bill.paidAt || null) : null,
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
    billNumber: formatFinanceCode(normalizeText(feeOrder?.orderNumber))
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
      title: normalizeText(remark.title) || 'ملاحظه',
      note: normalizeText(remark.text),
      meta: normalizeText(remark.type),
      at: remark.createdAt || null
    });
  });

  (profile.transfers || []).forEach((transfer) => {
    timeline.push({
      id: String(transfer._id),
      type: 'transfer',
      title: 'تبدیلی',
      note: [normalizeText(transfer.fromLabel), normalizeText(transfer.toLabel)].filter(Boolean).join(' ← '),
      meta: normalizeText(transfer.direction),
      at: transfer.transferredAt || null
    });
  });

  (profile.documents || []).forEach((document) => {
    timeline.push({
      id: String(document._id),
      type: 'document',
      title: normalizeText(document.title) || 'سند',
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
    return { studentCore: null, user: null, afghanStudent: null };
  }

  let studentCore = await StudentCore.findById(normalizedRef);
  let user = null;
  let afghanStudent = await AfghanStudent.findById(normalizedRef);

  if (!studentCore) {
    studentCore = await StudentCore.findOne({ userId: normalizedRef });
  }

  if (afghanStudent && !studentCore) {
    if (afghanStudent.linkedUserId) {
      user = await User.findById(afghanStudent.linkedUserId);
      studentCore = user ? await ensureStudentCoreFromUser(user) : null;
    }
    if (!studentCore) {
      const linkedMembership = await StudentMembership.findOne({ afghanStudentId: afghanStudent._id })
        .sort({ isCurrent: -1, updatedAt: -1, createdAt: -1 });
      if (linkedMembership?.studentId) studentCore = await StudentCore.findById(linkedMembership.studentId);
      if (!user && linkedMembership?.student) user = await User.findById(linkedMembership.student);
      if (!studentCore && user) studentCore = await ensureStudentCoreFromUser(user);
    }
    if (!studentCore) {
      const admissionNo = normalizeText(afghanStudent.asasNumber);
      studentCore = admissionNo ? await StudentCore.findOne({ admissionNo }) : null;
      if (!studentCore) {
        const personalInfo = afghanStudent.personalInfo || {};
        const fullName = [
          normalizeText(personalInfo.firstNameDari || personalInfo.firstName),
          normalizeText(personalInfo.lastNameDari || personalInfo.lastName)
        ].filter(Boolean).join(' ');
        studentCore = await StudentCore.create({
          userId: afghanStudent.linkedUserId || null,
          admissionNo: admissionNo || undefined,
          fullName,
          preferredName: fullName,
          gender: ['male', 'female', 'other'].includes(normalizeText(personalInfo.gender)) ? normalizeText(personalInfo.gender) : '',
          dateOfBirth: personalInfo.birthDate ? String(personalInfo.birthDate).slice(0, 10) : '',
          status: normalizeText(afghanStudent.status) === 'inactive' ? 'inactive' : 'active'
        });
      }
    }
  }

  if (studentCore) {
    if (!user) user = studentCore.userId ? await User.findById(studentCore.userId) : null;
    if (!afghanStudent) {
      const afghanStudentRefs = [
        ...(user?._id ? [{ linkedUserId: user._id }] : []),
        ...(studentCore.admissionNo ? [{ asasNumber: studentCore.admissionNo }] : [])
      ];
      afghanStudent = afghanStudentRefs.length ? await AfghanStudent.findOne({ $or: afghanStudentRefs }) : null;
    }
    return { studentCore, user, afghanStudent };
  }

  user = await User.findById(normalizedRef);
  if (!user || String(user.role) !== 'student') {
    return { studentCore: null, user: null, afghanStudent: null };
  }

  studentCore = await ensureStudentCoreFromUser(user);
  afghanStudent = await AfghanStudent.findOne({ linkedUserId: user._id });
  return { studentCore, user, afghanStudent };
}

function buildAttendanceSummary(items = []) {
  const total = items.length;
  const present = items.filter((item) => ['present', 'late'].includes(normalizeText(item.status))).length;
  const absent = items.filter((item) => normalizeText(item.status) === 'absent').length;
  const excused = items.filter((item) => ['sick', 'leave', 'excused', 'suspended'].includes(normalizeText(item.status))).length;
  return {
    total,
    present,
    absent,
    excused,
    attendanceRate: total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0
  };
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
    .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } })
    .populate('academicYearId', 'title name label code status isActive startsAt endsAt')
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
  const { studentCore, user, afghanStudent } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profileStub = await ensureStudentProfile(studentCore._id);
  const profileDoc = await StudentProfile.findById(profileStub._id)
    .populate('guardians.userId', 'name email role orgRole status lastLoginAt');
  const memberships = await StudentMembership.find({
    $or: [
      { studentId: studentCore._id },
      ...(user ? [{ student: user._id }] : []),
      ...(afghanStudent?._id ? [{ afghanStudentId: afghanStudent._id }] : [])
    ]
  })
    .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } })
    .populate('course', 'title category level kind')
    .populate('academicYearId', 'title name label code status isActive startsAt endsAt')
    .sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1 });

  const membershipIds = memberships.map((membership) => membership._id);
  const referenceFilter = buildReferenceFilter({
    studentCoreId: studentCore._id,
    userId: user ? user._id : null,
    membershipIds
  });

  const [bills, receipts, grades, quizResults, logs, lifecycleEvents, attendanceRecords, examResults] = await Promise.all([
    FeeOrder.find({ ...referenceFilter, status: { $ne: 'void' } })
      .populate('course', 'title category level kind')
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'title name label code status isActive startsAt endsAt')
      .sort({ issuedAt: -1, createdAt: -1 })
      .limit(50),
    FeePayment.find(referenceFilter)
      .populate({
        path: 'feeOrderId',
        select: 'orderNumber course classId academicYearId amountDue amountPaid status',
        populate: [
          { path: 'course', select: 'title category level kind' },
          { path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } },
          { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' }
        ]
      })
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'title name label code status isActive startsAt endsAt')
      .sort({ paidAt: -1, createdAt: -1 })
      .limit(50),
    Grade.find(referenceFilter)
      .populate('course', 'title category level kind')
      .populate({ path: 'classId', select: 'title code gradeLevel section shift room status academicYearId', populate: { path: 'academicYearId', select: 'title name label code status isActive startsAt endsAt' } })
      .populate('academicYearId', 'title name label code status isActive startsAt endsAt')
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(50),
    user
      ? Result.find({ user: user._id }).populate('course', 'title category level kind').sort({ date: -1 }).limit(50)
      : [],
    user
      ? ActivityLog.find({ targetUser: user._id }).sort({ createdAt: -1 }).limit(40)
      : [],
    StudentLifecycleEvent.find({
      $or: [
        { studentId: studentCore._id },
        ...(user?._id ? [{ student: user._id }] : []),
        ...(membershipIds.length ? [{ membershipId: { $in: membershipIds } }, { previousMembershipId: { $in: membershipIds } }] : [])
      ]
    })
      .populate('createdBy', 'name email role orgRole')
      .sort({ effectiveAt: -1, createdAt: -1 })
      .limit(100)
      .lean(),
    Attendance.find({
      $or: [
        ...(membershipIds.length ? [{ studentMembershipId: { $in: membershipIds } }] : []),
        { studentId: studentCore._id },
        ...(user?._id ? [{ student: user._id }] : [])
      ]
    })
      .populate('course', 'title category level kind')
      .sort({ date: -1, createdAt: -1 })
      .limit(120)
      .lean(),
    ExamResult.find({
      $or: [
        ...(membershipIds.length ? [{ studentMembershipId: { $in: membershipIds } }] : []),
        { studentId: studentCore._id },
        ...(user?._id ? [{ student: user._id }] : [])
      ]
    })
      .populate('subjectId', 'name code grade')
      .populate('examTypeId', 'title code totalMarks')
      .populate('assessmentPeriodId', 'title code')
      .populate('classId', 'title code gradeLevel section')
      .sort({ computedAt: -1, createdAt: -1 })
      .limit(120)
      .lean()
  ]);

  const membershipItems = memberships.map(formatMembership).filter(Boolean);
  const financeBills = bills.map(formatBill).filter(Boolean);
  const financeReceipts = receipts.map(formatReceipt).filter(Boolean);
  const gradeItems = grades.map(formatGrade).filter(Boolean);
  const quizItems = quizResults.map(formatQuizResult).filter(Boolean);
  const activityItems = logs.map(formatActivityLog).filter(Boolean);
  const lifecycleItems = lifecycleEvents.map((event) => ({
    id: String(event._id),
    eventType: normalizeText(event.eventType),
    membershipId: event.membershipId ? String(event.membershipId) : '',
    previousMembershipId: event.previousMembershipId ? String(event.previousMembershipId) : '',
    effectiveAt: event.effectiveAt || null,
    note: normalizeText(event.note),
    documentType: normalizeText(event.documentType),
    documentId: event.documentId ? String(event.documentId) : '',
    financialEffects: event.financialEffects || {},
    createdBy: event.createdBy ? formatUser(event.createdBy) : null,
    createdAt: event.createdAt || null
  }));
  const profile = toPlain(profileDoc) || {};
  const currentMembership = membershipItems.find((item) => item.isCurrent) || membershipItems[0] || null;

  return {
    identity: {
      ...formatIdentity(studentCore, user, afghanStudent),
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
        downloadUrl: `/api/student-profiles/${studentCore._id}/documents/${document._id}/file`,
        storageProvider: normalizeText(document.storageProvider) || 'legacy',
        originalName: normalizeText(document.originalName),
        mimeType: normalizeText(document.mimeType),
        size: Number(document.size || 0),
        note: normalizeText(document.note),
        isPrimary: Boolean(document.isPrimary),
        uploadedBy: document.uploadedBy ? String(document.uploadedBy) : '',
        uploadedAt: document.uploadedAt || null
      }))
    },
    memberships: membershipItems,
    lifecycle: {
      events: lifecycleItems
    },
    finance: {
      summary: buildFinanceSummary(financeBills, financeReceipts),
      bills: financeBills,
      receipts: financeReceipts
    },
    results: {
      summary: buildResultSummary(gradeItems, quizItems),
      grades: gradeItems,
      quizResults: quizItems,
      examResults: examResults.map((item) => ({
        id: String(item._id),
        subject: item.subjectId ? { id: String(item.subjectId._id || item.subjectId), name: normalizeText(item.subjectId.name), code: normalizeText(item.subjectId.code) } : null,
        examType: item.examTypeId ? { id: String(item.examTypeId._id || item.examTypeId), title: normalizeText(item.examTypeId.title), code: normalizeText(item.examTypeId.code) } : null,
        period: item.assessmentPeriodId ? { id: String(item.assessmentPeriodId._id || item.assessmentPeriodId), title: normalizeText(item.assessmentPeriodId.title) } : null,
        schoolClass: item.classId ? { id: String(item.classId._id || item.classId), title: normalizeText(item.classId.title) } : null,
        markStatus: normalizeText(item.markStatus),
        obtainedMark: Number(item.obtainedMark || 0),
        totalMark: Number(item.totalMark || 0),
        percentage: Number(item.percentage || 0),
        resultStatus: normalizeText(item.resultStatus),
        rank: item.rank || null,
        computedAt: item.computedAt || item.createdAt || null
      }))
    },
    attendance: {
      summary: buildAttendanceSummary(attendanceRecords),
      records: attendanceRecords.map((item) => ({
        id: String(item._id),
        membershipId: item.studentMembershipId ? String(item.studentMembershipId) : '',
        date: item.date || null,
        status: normalizeText(item.status),
        note: normalizeText(item.note),
        course: formatCourse(item.course)
      }))
    },
    activity: {
      logs: activityItems
    },
    timeline: [
      ...buildProfileTimeline(profile),
      ...lifecycleItems.map((event) => ({
        id: event.id,
        type: 'lifecycle',
        title: event.eventType,
        note: event.note,
        meta: event.documentType,
        at: event.effectiveAt || event.createdAt
      }))
    ].sort(sortByDateDesc).slice(0, 50),
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
  const { studentCore, user, afghanStudent } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const identity = payload.identity && typeof payload.identity === 'object' ? payload.identity : {};
  const identityFields = ['admissionNo', 'fullName', 'preferredName', 'givenName', 'familyName', 'email', 'phone', 'dateOfBirth', 'note'];
  identityFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(identity, field)) studentCore[field] = normalizeText(identity[field]);
  });
  if (Object.prototype.hasOwnProperty.call(identity, 'gender')) {
    studentCore.gender = ['male', 'female', 'other'].includes(normalizeText(identity.gender)) ? normalizeText(identity.gender) : '';
  }
  await studentCore.save();

  if (user?._id) {
    const userUpdate = {};
    if (Object.prototype.hasOwnProperty.call(identity, 'fullName') && normalizeText(identity.fullName)) userUpdate.name = normalizeText(identity.fullName);
    if (Object.prototype.hasOwnProperty.call(identity, 'email') && normalizeText(identity.email)) userUpdate.email = normalizeText(identity.email);
    if (Object.keys(userUpdate).length) await User.updateOne({ _id: user._id }, { $set: userUpdate });
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.family = sanitizeFamilyInput(payload.family || profile.family);
  profile.contact = sanitizeContactInput(payload.contact || profile.contact);
  profile.background = sanitizeBackgroundInput(payload.background || profile.background);
  profile.notes = sanitizeNotesInput(payload.notes || profile.notes);
  await profile.save();

  if (afghanStudent?._id) {
    const fullName = normalizeText(identity.fullName);
    const fullNameParts = fullName.split(/\s+/).filter(Boolean);
    const givenName = normalizeText(identity.givenName) || fullNameParts[0] || '';
    const familyName = normalizeText(identity.familyName) || fullNameParts.slice(1).join(' ');
    const update = {};
    if (Object.prototype.hasOwnProperty.call(identity, 'admissionNo')) update.asasNumber = normalizeText(identity.admissionNo);
    if (givenName) {
      update['personalInfo.firstName'] = givenName;
      update['personalInfo.firstNameDari'] = givenName;
    }
    if (familyName) {
      update['personalInfo.lastName'] = familyName;
      update['personalInfo.lastNameDari'] = familyName;
    }
    if (Object.prototype.hasOwnProperty.call(identity, 'gender')) update['personalInfo.gender'] = studentCore.gender;
    if (Object.prototype.hasOwnProperty.call(identity, 'dateOfBirth') && normalizeText(identity.dateOfBirth)) update['personalInfo.birthDate'] = normalizeText(identity.dateOfBirth);
    if (Object.prototype.hasOwnProperty.call(profile.family || {}, 'fatherName')) update['personalInfo.fatherName'] = normalizeText(profile.family.fatherName);
    if (Object.prototype.hasOwnProperty.call(profile.family || {}, 'motherName')) update['familyInfo.motherName'] = normalizeText(profile.family.motherName);
    if (Object.prototype.hasOwnProperty.call(profile.family || {}, 'guardianName')) update['familyInfo.guardianName'] = normalizeText(profile.family.guardianName);
    if (Object.prototype.hasOwnProperty.call(profile.family || {}, 'guardianRelation')) update['familyInfo.guardianRelation'] = normalizeText(profile.family.guardianRelation) || undefined;
    if (Object.prototype.hasOwnProperty.call(profile.contact || {}, 'primaryPhone')) {
      update['contactInfo.phone'] = normalizeText(profile.contact.primaryPhone);
      update['contactInfo.mobile'] = normalizeText(profile.contact.primaryPhone);
    }
    if (Object.prototype.hasOwnProperty.call(profile.contact || {}, 'email')) update['contactInfo.email'] = normalizeText(profile.contact.email);
    if (Object.prototype.hasOwnProperty.call(profile.contact || {}, 'address')) update['contactInfo.address'] = normalizeText(profile.contact.address);
    Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
    if (Object.keys(update).length) await AfghanStudent.updateOne({ _id: afghanStudent._id }, { $set: update });
  }

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
  const { studentCore, user } = await resolveStudentCore(studentRef);
  if (!studentCore) {
    return null;
  }

  const profile = await ensureStudentProfile(studentCore._id);
  profile.documents = Array.isArray(profile.documents) ? profile.documents : [];
  const kind = ['id_card', 'birth_certificate', 'report_card', 'photo', 'other'].includes(normalizeText(payload.kind))
    ? normalizeText(payload.kind)
    : 'other';
  const isPrimary = kind === 'photo' && payload.isPrimary !== false;
  if (isPrimary) {
    profile.documents.forEach((item) => {
      if (item?.kind === 'photo') item.isPrimary = false;
    });
  }
  profile.documents.unshift({
    kind,
    title: normalizeText(payload.title),
    fileUrl: normalizeText(payload.fileUrl),
    storageProvider: ['legacy', 'local_private', 'r2_private'].includes(normalizeText(payload.storageProvider))
      ? normalizeText(payload.storageProvider)
      : 'legacy',
    storageKey: normalizeText(payload.storageKey),
    originalName: normalizeText(payload.originalName),
    mimeType: normalizeText(payload.mimeType),
    size: Math.max(0, Number(payload.size || 0)),
    note: normalizeText(payload.note),
    isPrimary,
    uploadedBy: normalizeNullableId(actorUserId)
  });
  await profile.save();

  if (isPrimary && user?._id && normalizeText(payload.fileUrl) && normalizeText(payload.storageProvider) !== 'r2_private') {
    await User.updateOne({ _id: user._id }, { $set: { avatarUrl: normalizeText(payload.fileUrl) } });
  }

  return getStudentProfile(String(studentCore._id));
}

async function getStudentDocument(studentRef, documentRef) {
  const { studentCore } = await resolveStudentCore(studentRef);
  if (!studentCore || !mongoose.isValidObjectId(documentRef)) return null;

  const profile = await StudentProfile.findOne({ studentId: studentCore._id });
  const document = profile?.documents?.id(documentRef);
  if (!document) return null;

  return {
    studentCoreId: String(studentCore._id),
    document: {
      id: String(document._id),
      kind: normalizeText(document.kind),
      title: normalizeText(document.title),
      fileUrl: normalizeText(document.fileUrl),
      storageProvider: normalizeText(document.storageProvider) || 'legacy',
      storageKey: normalizeText(document.storageKey),
      originalName: normalizeText(document.originalName),
      mimeType: normalizeText(document.mimeType),
      size: Number(document.size || 0)
    }
  };
}

module.exports = {
  addStudentDocument,
  addStudentRemark,
  addStudentTransfer,
  getStudentDocument,
  getStudentProfile,
  linkGuardianToStudent,
  listGuardianCandidates,
  listLinkedStudentsForGuardianUser,
  listStudentProfiles,
  unlinkGuardianFromStudent,
  updateStudentProfileBasics
};
