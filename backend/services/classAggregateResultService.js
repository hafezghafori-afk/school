const mongoose = require('mongoose');

require('../models/User');
require('../models/StudentCore');
require('../models/AfghanStudent');
require('../models/ExamType');
require('../models/ExamDefaultMark');

const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const StudentMembership = require('../models/StudentMembership');
const StudentProfile = require('../models/StudentProfile');
const Attendance = require('../models/Attendance');
const ExamSession = require('../models/ExamSession');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');
const {
  GENERAL_RESULT_POLICY,
  OFFICIAL_EXAM_CODES,
  OFFICIAL_RESULT_POLICY_VERSION,
  combineOfficialSubjectScores,
  computeCompetitionRanks,
  computeGeneralResult,
  computePercentage,
  getMembershipLifecycleLabel,
  getOfficialExamPolicy,
  normalizeExamTypeCode
} = require('../utils/officialResultPolicy');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function latinIdentityText(value) {
  const normalized = normalizeText(value);
  return /[A-Za-z]/.test(normalized) ? normalized : '';
}

const AFGHAN_PROVINCE_LABELS = Object.freeze({
  kabul: 'کابل', herat: 'هرات', kandahar: 'قندهار', balkh: 'بلخ', nangarhar: 'ننگرهار',
  badakhshan: 'بدخشان', takhar: 'تخار', samangan: 'سمنگان', kunduz: 'کندز', baghlan: 'بغلان',
  farah: 'فراه', nimroz: 'نیمروز', helmand: 'هلمند', ghor: 'غور', daykundi: 'دایکندی',
  uruzgan: 'ارزگان', zabul: 'زابل', paktika: 'پکتیکا', khost: 'خوست', paktia: 'پکتیا',
  logar: 'لوگر', parwan: 'پروان', kapisa: 'کاپیسا', panjshir: 'پنجشیر', badghis: 'بادغیس',
  faryab: 'فاریاب', jowzjan: 'جوزجان', saripul: 'سرپل', bamyan: 'بامیان', ghazni: 'غزنی',
  wardak: 'میدان وردک', laghman: 'لغمان', kunar: 'کنر', nuristan: 'نورستان'
});

function localizedProvince(value) {
  const normalized = normalizeText(value);
  return AFGHAN_PROVINCE_LABELS[normalized.toLowerCase()] || normalized;
}

function dateParts(value, calendar = 'gregorian') {
  if (!value) return { year: '', month: '', day: '' };
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return { year: '', month: '', day: '' };
  const locale = calendar === 'solar' ? 'en-US-u-ca-persian' : 'en-CA';
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric'
    }).formatToParts(date);
    const read = (type) => parts.find((item) => item.type === type)?.value || '';
    return { year: read('year'), month: read('month'), day: read('day') };
  } catch {
    return calendar === 'gregorian'
      ? { year: String(date.getUTCFullYear()), month: String(date.getUTCMonth() + 1), day: String(date.getUTCDate()) }
      : { year: '', month: '', day: '' };
  }
}

function normalizeId(value) {
  const raw = value?._id || value;
  return raw && mongoose.isValidObjectId(raw) ? raw : null;
}

function idText(value) {
  return String(value?._id || value || '');
}

function displayName(membership = {}) {
  return normalizeText(membership.studentId?.preferredName)
    || normalizeText(membership.studentId?.fullName)
    || normalizeText(membership.student?.name)
    || '---';
}

function pickStudentPhoto(membership = {}) {
  const documents = Array.isArray(membership.afghanStudentId?.documents)
    ? membership.afghanStudentId.documents
    : [];
  return normalizeText(documents.find((item) => normalizeText(item?.type) === 'photo')?.url)
    || normalizeText(membership.student?.avatarUrl);
}

function buildIdentitySnapshot(membership = {}, profile = null) {
  const core = membership.studentId || {};
  const legacy = membership.afghanStudentId || {};
  const personal = legacy.personalInfo || {};
  const identification = legacy.identification || {};
  const englishGivenName = latinIdentityText(personal.firstName);
  const englishFamilyName = latinIdentityText(personal.lastName);
  const englishName = [englishGivenName, englishFamilyName].filter(Boolean).join(' ');
  const dariName = [personal.firstNameDari, personal.lastNameDari].map(normalizeText).filter(Boolean).join(' ');
  const birthDate = personal.birthDate || core.dateOfBirth || null;
  const solarBirthDate = dateParts(birthDate, 'solar');
  const gregorianBirthDate = dateParts(birthDate, 'gregorian');
  return {
    fullName: dariName || displayName(membership),
    fullNameEnglish: englishName,
    givenName: normalizeText(core.givenName) || normalizeText(personal.firstNameDari),
    familyName: normalizeText(core.familyName) || normalizeText(personal.lastNameDari),
    givenNameEnglish: englishGivenName,
    familyNameEnglish: englishFamilyName,
    fatherName: normalizeText(personal.fatherName) || normalizeText(profile?.family?.fatherName),
    fatherNameEnglish: latinIdentityText(personal.fatherNameEnglish),
    grandfatherName: normalizeText(personal.grandfatherName),
    admissionNo: normalizeText(core.admissionNo) || normalizeText(legacy.registrationId),
    asasNumber: normalizeText(legacy.asasNumber),
    tazkiraNumber: normalizeText(identification.tazkiraNumber),
    dateOfBirth: birthDate || '',
    dateOfBirthSolar: birthDate ? formatAfghanStoredDateLabel(birthDate) : '',
    dateOfBirthSolarParts: solarBirthDate,
    dateOfBirthGregorian: [gregorianBirthDate.year, gregorianBirthDate.month, gregorianBirthDate.day].filter(Boolean).join('/'),
    dateOfBirthGregorianParts: gregorianBirthDate,
    birthPlace: normalizeText(personal.birthPlace),
    domicile: [legacy.contactInfo?.village, legacy.contactInfo?.district, localizedProvince(legacy.contactInfo?.province)]
      .map(normalizeText).filter(Boolean).join('، '),
    address: normalizeText(legacy.contactInfo?.address) || normalizeText(profile?.contact?.address),
    gender: normalizeText(personal.gender) || normalizeText(core.gender),
    photoUrl: pickStudentPhoto(membership)
  };
}

function emptyAttendanceSnapshot() {
  return {
    totalDays: 0,
    present: 0,
    absent: 0,
    sick: 0,
    leave: 0,
    late: 0,
    excused: 0,
    suspended: 0
  };
}

function buildStageSummary(subjects = [], key, possiblePerSubject) {
  const applicable = subjects.filter((subject) => subject.applicable);
  const scores = applicable.map((subject) => subject[key]).filter((value) => (
    value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  ));
  const obtained = scores.length
    ? Number(scores.reduce((sum, value) => sum + Number(value), 0).toFixed(2))
    : null;
  const possible = applicable.length * possiblePerSubject;
  const complete = applicable.length > 0 && scores.length === applicable.length;
  return {
    obtained,
    possible,
    average: scores.length ? Number((obtained / scores.length).toFixed(2)) : null,
    percentage: complete ? computePercentage(obtained, possible) : null,
    complete,
    recordedSubjects: scores.length,
    subjectCount: applicable.length
  };
}

function formatSubject(subject = {}) {
  return {
    id: idText(subject),
    code: normalizeText(subject.code),
    name: normalizeText(subject.nameDari) || normalizeText(subject.name) || '---',
    resultOrder: Number(subject.resultOrder || 0)
  };
}

function formatSourceSession(session = {}) {
  return {
    id: idText(session),
    title: normalizeText(session.title),
    code: normalizeText(session.code),
    status: normalizeText(session.status),
    heldAt: session.heldAt || null,
    submittedAt: session.submittedAt || null,
    approvedAt: session.approvedAt || null,
    publishedAt: session.publishedAt || null,
    examTypeCode: normalizeExamTypeCode(session.examTypeId),
    subjectId: idText(session.subjectId)
  };
}

function sessionFreezeDate(session = {}) {
  return session.submittedAt || session.approvedAt || session.publishedAt || session.heldAt || session.createdAt || null;
}

function membershipExistedAtFreeze(membership = {}, session = {}) {
  const freezeValue = sessionFreezeDate(session);
  if (!freezeValue) return true;
  const freeze = new Date(freezeValue);
  const joinedValue = membership.enrolledAt || membership.joinedAt || membership.createdAt;
  if (!joinedValue) return true;
  const joined = new Date(joinedValue);
  if (Number.isNaN(freeze.getTime()) || Number.isNaN(joined.getTime())) return true;
  return joined.getTime() <= freeze.getTime();
}

const READINESS_ACTIONS = Object.freeze({
  assignments: '/timetable/teacher-timetable-configurations',
  sheets: '/admin-sheet-templates',
  marks: '/grade-manager'
});

const SESSION_STATUS_LABELS = Object.freeze({
  draft: 'پیش‌نویس',
  active: 'فعال',
  submitted: 'فرستاده‌شده برای تأیید',
  approved: 'تأییدشده',
  closed: 'بسته‌شده',
  published: 'نشرشده',
  archived: 'آرشیف‌شده'
});

function readinessIssue(code, subject, details = {}) {
  const subjectId = idText(subject);
  const subjectName = formatSubject(subject).name;
  const messages = {
    subject_teacher_missing: `برای مضمون ${subjectName} استاد تعیین نشده است.`,
    four_half_missing: `شقهٔ چهارنیم‌ماههٔ مضمون ${subjectName} ساخته نشده است.`,
    annual_missing: `شقهٔ سالانهٔ مضمون ${subjectName} ساخته نشده است.`,
    four_half_not_approved: `شقهٔ چهارنیم‌ماههٔ مضمون ${subjectName} هنوز تأیید مدیریت نشده است.`,
    annual_not_approved: `شقهٔ سالانهٔ مضمون ${subjectName} هنوز تأیید مدیریت نشده است.`,
    four_half_duplicate: `برای مضمون ${subjectName} بیش از یک شقهٔ چهارنیم‌ماههٔ تأییدشده وجود دارد.`,
    annual_duplicate: `برای مضمون ${subjectName} بیش از یک شقهٔ سالانهٔ تأییدشده وجود دارد.`,
    pending_marks: `در شقه‌های مضمون ${subjectName} هنوز نمرهٔ ناتکمیل وجود دارد.`,
    roster_snapshot_incomplete: `فهرست تثبیت‌شدهٔ شاگردان در مضمون ${subjectName} کامل نیست.`
  };
  const actionByCode = {
    subject_teacher_missing: READINESS_ACTIONS.assignments,
    four_half_missing: READINESS_ACTIONS.sheets,
    annual_missing: READINESS_ACTIONS.sheets,
    four_half_not_approved: READINESS_ACTIONS.marks,
    annual_not_approved: READINESS_ACTIONS.marks,
    four_half_duplicate: READINESS_ACTIONS.sheets,
    annual_duplicate: READINESS_ACTIONS.sheets,
    pending_marks: READINESS_ACTIONS.marks,
    roster_snapshot_incomplete: READINESS_ACTIONS.marks
  };
  return {
    code,
    subjectId,
    subjectName,
    message: messages[code] || code,
    actionUrl: actionByCode[code] || '',
    ...details
  };
}

function summarizeCandidateSessions(sessions = []) {
  return sessions.map((session) => ({
    ...formatSourceSession(session),
    statusLabel: SESSION_STATUS_LABELS[normalizeText(session.status)] || normalizeText(session.status) || 'نامشخص'
  }));
}

async function loadReadinessSource({ academicYearId, classId }) {
  const yearId = normalizeId(academicYearId);
  const schoolClassId = normalizeId(classId);
  if (!yearId || !schoolClassId) throw new Error('result_table_aggregate_scope_required');

  const [academicYear, schoolClass, assignments, sessions, memberships] = await Promise.all([
    AcademicYear.findById(yearId).lean(),
    SchoolClass.findById(schoolClassId)
      .populate('homeroomTeacherUserId', 'name email')
      .lean(),
    TeacherAssignment.find({ academicYearId: yearId, classId: schoolClassId, status: 'active', subjectId: { $ne: null } })
      .populate('subjectId')
      .populate('teacherUserId', 'name email')
      .lean(),
    ExamSession.find({
      academicYearId: yearId,
      classId: schoolClassId,
      subjectId: { $ne: null },
      status: { $ne: 'archived' }
    })
      .populate('examTypeId', 'title code defaultTotalMark defaultPassMark')
      .populate('subjectId')
      .populate('defaultMarkId')
      .lean(),
    StudentMembership.find({
      classId: schoolClassId,
      $or: [{ academicYearId: yearId }, { academicYear: yearId }]
    }).lean()
  ]);

  if (!academicYear || !schoolClass) throw new Error('result_table_aggregate_scope_not_found');

  const officialSessions = sessions.filter((session) => (
    [OFFICIAL_EXAM_CODES.FOUR_HALF, OFFICIAL_EXAM_CODES.ANNUAL]
      .includes(normalizeExamTypeCode(session.examTypeId))
  ));
  const subjectIds = new Set([
    ...assignments.map((item) => idText(item.subjectId)),
    ...officialSessions.map((item) => idText(item.subjectId))
  ].filter(Boolean));
  const missingSubjectIds = [...subjectIds].filter((id) => !assignments.some((item) => idText(item.subjectId) === id)
    && !officialSessions.some((item) => idText(item.subjectId) === id && item.subjectId?.name));
  const missingSubjects = missingSubjectIds.length ? await Subject.find({ _id: { $in: missingSubjectIds } }).lean() : [];
  const subjects = [
    ...assignments.map((item) => item.subjectId).filter(Boolean),
    ...officialSessions.map((item) => item.subjectId).filter(Boolean),
    ...missingSubjects
  ].filter((subject, index, list) => list.findIndex((item) => idText(item) === idText(subject)) === index)
    .sort((left, right) => Number(left.resultOrder || 0) - Number(right.resultOrder || 0)
      || normalizeText(left.nameDari || left.name).localeCompare(normalizeText(right.nameDari || right.name), 'fa'));

  return { academicYear, schoolClass, assignments, officialSessions, memberships, subjects };
}

async function getClassAggregateReadiness({ academicYearId, classId } = {}) {
  const source = await loadReadinessSource({ academicYearId, classId });
  const approvedStatuses = new Set(['approved', 'published']);
  const approvedSessions = source.officialSessions.filter((session) => approvedStatuses.has(normalizeText(session.status)));
  const sourceSessionIds = approvedSessions.map((session) => session._id);
  const [marks, results] = await Promise.all([
    sourceSessionIds.length
      ? ExamMark.find({ sessionId: { $in: sourceSessionIds } }).select('sessionId studentMembershipId markStatus').lean()
      : [],
    sourceSessionIds.length
      ? ExamResult.find({ sessionId: { $in: sourceSessionIds } }).select('sessionId studentMembershipId markStatus').lean()
      : []
  ]);
  const marksBySession = new Map();
  marks.forEach((mark) => {
    const key = idText(mark.sessionId);
    if (!marksBySession.has(key)) marksBySession.set(key, []);
    marksBySession.get(key).push(mark);
  });
  const resultIdsBySession = new Map();
  results.forEach((result) => {
    const key = idText(result.sessionId);
    if (!resultIdsBySession.has(key)) resultIdsBySession.set(key, new Set());
    resultIdsBySession.get(key).add(idText(result.studentMembershipId));
  });

  const issues = [];
  const subjects = source.subjects.map((subject) => {
    const subjectId = idText(subject);
    const assignments = source.assignments.filter((item) => idText(item.subjectId) === subjectId);
    const candidates = source.officialSessions.filter((item) => idText(item.subjectId) === subjectId);
    const byCode = (code) => candidates.filter((item) => normalizeExamTypeCode(item.examTypeId) === code);
    const eligibleByCode = (code) => byCode(code).filter((item) => approvedStatuses.has(normalizeText(item.status)));
    const fourHalfCandidates = byCode(OFFICIAL_EXAM_CODES.FOUR_HALF);
    const annualCandidates = byCode(OFFICIAL_EXAM_CODES.ANNUAL);
    const fourHalf = eligibleByCode(OFFICIAL_EXAM_CODES.FOUR_HALF);
    const annual = eligibleByCode(OFFICIAL_EXAM_CODES.ANNUAL);

    if (!assignments.length) issues.push(readinessIssue('subject_teacher_missing', subject));
    if (fourHalfCandidates.length === 0) {
      issues.push(readinessIssue('four_half_missing', subject));
    } else if (fourHalf.length === 0) {
      issues.push(readinessIssue('four_half_not_approved', subject, {
        sessionId: idText(fourHalfCandidates[0]),
        sessionStatuses: fourHalfCandidates.map((item) => normalizeText(item.status))
      }));
    }
    if (annualCandidates.length === 0) {
      issues.push(readinessIssue('annual_missing', subject));
    } else if (annual.length === 0) {
      issues.push(readinessIssue('annual_not_approved', subject, {
        sessionId: idText(annualCandidates[0]),
        sessionStatuses: annualCandidates.map((item) => normalizeText(item.status))
      }));
    }
    if (fourHalf.length > 1) issues.push(readinessIssue('four_half_duplicate', subject, { count: fourHalf.length }));
    if (annual.length > 1) issues.push(readinessIssue('annual_duplicate', subject, { count: annual.length }));

    const selected = [fourHalf[0], annual[0]].filter(Boolean);
    const policyMismatches = selected.filter((session) => {
      const policy = getOfficialExamPolicy(session.examTypeId);
      const configuredTotal = Object.values(session.defaultMarkId?.scoreComponents || {})
        .reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
      return !policy
        || Number(session.defaultMarkId?.totalMark || 0) !== Number(policy.totalMark)
        || Number(session.defaultMarkId?.passMark || 0) !== Number(policy.passMark)
        || configuredTotal !== Number(policy.totalMark);
    });
    policyMismatches.forEach((session) => issues.push({
      code: `${normalizeExamTypeCode(session.examTypeId).toLowerCase()}_policy_mismatch`,
      subjectId,
      subjectName: formatSubject(subject).name,
      message: `ساختار نمره‌دهی شقهٔ مضمون ${formatSubject(subject).name} با قاعدهٔ رسمی مطابقت ندارد.`,
      actionUrl: READINESS_ACTIONS.sheets,
      sessionId: idText(session)
    }));
    let pendingMarks = 0;
    let excusedMarks = 0;
    let missingRosterRows = 0;
    selected.forEach((session) => {
      const sessionMarks = marksBySession.get(idText(session)) || [];
      pendingMarks += sessionMarks.filter((mark) => normalizeText(mark.markStatus) === 'pending').length;
      excusedMarks += sessionMarks.filter((mark) => normalizeText(mark.markStatus) === 'excused').length;
      const resultIds = resultIdsBySession.get(idText(session)) || new Set();
      missingRosterRows += source.memberships
        .filter((membership) => membershipExistedAtFreeze(membership, session))
        .filter((membership) => !resultIds.has(idText(membership))).length;
    });
    if (pendingMarks > 0) issues.push(readinessIssue('pending_marks', subject, { count: pendingMarks }));
    if (missingRosterRows > 0) issues.push(readinessIssue('roster_snapshot_incomplete', subject, { count: missingRosterRows }));

    return {
      ...formatSubject(subject),
      teacherAssignments: assignments.map((item) => ({
        id: idText(item),
        teacherId: idText(item.teacherUserId),
        teacherName: normalizeText(item.teacherUserId?.name)
      })),
      fourHalfCandidates: summarizeCandidateSessions(fourHalfCandidates),
      annualCandidates: summarizeCandidateSessions(annualCandidates),
      fourHalfSessions: fourHalf.map(formatSourceSession),
      annualSessions: annual.map(formatSourceSession),
      pendingMarks,
      excusedMarks,
      missingRosterRows,
      ready: assignments.length > 0
        && fourHalf.length === 1
        && annual.length === 1
        && pendingMarks === 0
        && missingRosterRows === 0
        && policyMismatches.length === 0
    };
  });

  if (!subjects.length) issues.push({
    code: 'subjects_missing',
    subjectId: '',
    subjectName: '',
    message: 'برای این صنف هیچ مضمون فعالی تعیین نشده است.',
    actionUrl: READINESS_ACTIONS.assignments
  });
  const requiredSessionCount = subjects.length * 2;
  const approvedSessionCount = subjects.reduce((sum, subject) => (
    sum + Math.min(1, subject.fourHalfSessions.length) + Math.min(1, subject.annualSessions.length)
  ), 0);
  const assignedSubjectCount = subjects.filter((subject) => subject.teacherAssignments.length > 0).length;
  const completedSubjectCount = subjects.filter((subject) => subject.ready).length;
  return {
    ready: subjects.length > 0 && subjects.every((item) => item.ready),
    policyVersion: OFFICIAL_RESULT_POLICY_VERSION,
    policy: GENERAL_RESULT_POLICY,
    academicYear: {
      id: idText(source.academicYear),
      title: normalizeText(source.academicYear.title),
      code: normalizeText(source.academicYear.code),
      calendarType: normalizeText(source.academicYear.calendarType),
      startDate: source.academicYear.startDate || null,
      endDate: source.academicYear.endDate || null,
      startDateLocal: normalizeText(source.academicYear.startDateLocal),
      endDateLocal: normalizeText(source.academicYear.endDateLocal)
    },
    schoolClass: {
      id: idText(source.schoolClass),
      title: normalizeText(source.schoolClass.title),
      titleDari: normalizeText(source.schoolClass.titleDari),
      code: normalizeText(source.schoolClass.code),
      gradeLevel: Number(source.schoolClass.gradeLevel || 0),
      section: normalizeText(source.schoolClass.section),
      homeroomTeacherUserId: idText(source.schoolClass.homeroomTeacherUserId),
      homeroomTeacher: source.schoolClass.homeroomTeacherUserId ? {
        id: idText(source.schoolClass.homeroomTeacherUserId),
        name: normalizeText(source.schoolClass.homeroomTeacherUserId.name),
        email: normalizeText(source.schoolClass.homeroomTeacherUserId.email)
      } : null,
      schoolId: idText(source.schoolClass.schoolId)
    },
    membershipCount: source.memberships.length,
    sourceSessionIds: sourceSessionIds.map(idText),
    progress: {
      subjectCount: subjects.length,
      assignedSubjectCount,
      requiredSessionCount,
      approvedSessionCount,
      completedSubjectCount,
      percentage: requiredSessionCount > 0
        ? Math.round((approvedSessionCount / requiredSessionCount) * 100)
        : 0
    },
    subjects,
    issues
  };
}

function scoreFromResult(result = null) {
  if (!result) return { score: null, status: 'missing', applicable: true };
  const status = normalizeText(result.markStatus);
  if (status === 'recorded') return { score: Number(result.obtainedMark || 0), status, applicable: true };
  if (status === 'absent') return { score: 0, status, applicable: true };
  if (status === 'not_applicable') return { score: null, status, applicable: false };
  return { score: null, status: status || 'pending', applicable: true };
}

function resultSnapshotDate(result = {}, sessionMap = new Map()) {
  const snapshot = result.membershipSnapshot || {};
  const session = sessionMap.get(idText(result.sessionId)) || {};
  const value = snapshot.effectiveAt
    || snapshot.capturedAt
    || session.heldAt
    || session.rosterFrozenAt
    || session.submittedAt
    || result.computedAt
    || result.createdAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function selectLatestMembershipSnapshot(results = [], sessionMap = new Map()) {
  return results
    .filter((result) => normalizeText(result?.membershipSnapshot?.status))
    .sort((left, right) => resultSnapshotDate(right, sessionMap) - resultSnapshotDate(left, sessionMap))[0]
    ?.membershipSnapshot || null;
}

async function buildClassAggregateRows({ academicYearId, classId } = {}) {
  const readiness = await getClassAggregateReadiness({ academicYearId, classId });
  if (!readiness.ready) throw new Error('result_table_aggregate_not_ready');

  const [sessions, memberships, results] = await Promise.all([
    ExamSession.find({ _id: { $in: readiness.sourceSessionIds } })
      .populate('examTypeId', 'title code')
      .populate('subjectId')
      .lean(),
    StudentMembership.find({
      classId: normalizeId(classId),
      $or: [{ academicYearId: normalizeId(academicYearId) }, { academicYear: normalizeId(academicYearId) }]
    })
      .populate('studentId')
      .populate('afghanStudentId')
      .populate('student', 'name email avatarUrl')
      .sort({ enrolledAt: 1, joinedAt: 1, createdAt: 1, _id: 1 }),
    ExamResult.find({ sessionId: { $in: readiness.sourceSessionIds } })
      .populate({
        path: 'studentMembershipId',
        populate: [
          { path: 'studentId' },
          { path: 'afghanStudentId' },
          { path: 'student', select: 'name email avatarUrl' }
        ]
      })
      .lean()
  ]);

  const membershipMap = new Map(memberships.map((item) => [idText(item), item]));
  results.forEach((result) => {
    const membership = result.studentMembershipId;
    if (membership && !membershipMap.has(idText(membership))) membershipMap.set(idText(membership), membership);
  });
  const sessionMap = new Map(sessions.map((item) => [idText(item), item]));
  const resultMap = new Map(results.map((item) => [
    `${idText(item.sessionId)}:${idText(item.studentMembershipId)}`,
    item
  ]));
  const resultsByMembership = new Map();
  results.forEach((result) => {
    const key = idText(result.studentMembershipId);
    if (!resultsByMembership.has(key)) resultsByMembership.set(key, []);
    resultsByMembership.get(key).push(result);
  });

  const membershipIds = [...membershipMap.keys()].filter(Boolean);
  const studentCoreIds = [...new Set([...membershipMap.values()].map((item) => idText(item.studentId)).filter(Boolean))];
  const [profiles, attendanceRecords] = await Promise.all([
    studentCoreIds.length ? StudentProfile.find({ studentId: { $in: studentCoreIds } }).lean() : [],
    membershipIds.length
      ? Attendance.find({
          $or: [
            { studentMembershipId: { $in: membershipIds } },
            { classId: normalizeId(classId), academicYearId: normalizeId(academicYearId) }
          ]
        }).select('student studentMembershipId status date').lean()
      : []
  ]);
  const profileMap = new Map(profiles.map((profile) => [idText(profile.studentId), profile]));
  const membershipByUserId = new Map([...membershipMap.values()].map((item) => [idText(item.student), idText(item)]));
  const attendanceMap = new Map(membershipIds.map((membershipId) => [membershipId, emptyAttendanceSnapshot()]));
  attendanceRecords.forEach((record) => {
    const membershipId = idText(record.studentMembershipId) || membershipByUserId.get(idText(record.student));
    if (!membershipId || !attendanceMap.has(membershipId)) return;
    const summary = attendanceMap.get(membershipId);
    const status = normalizeText(record.status);
    summary.totalDays += 1;
    if (Object.prototype.hasOwnProperty.call(summary, status)) summary[status] += 1;
  });

  const subjectContexts = readiness.subjects.map((subject) => ({
    subject,
    fourHalf: sessionMap.get(subject.fourHalfSessions[0]?.id),
    annual: sessionMap.get(subject.annualSessions[0]?.id)
  }));

  const rows = [...membershipMap.values()].map((membership) => {
    const membershipId = idText(membership);
    const sourceExamResultIds = [];
    const subjects = subjectContexts.map(({ subject, fourHalf, annual }) => {
      const fourResult = resultMap.get(`${idText(fourHalf)}:${membershipId}`) || null;
      const annualResult = resultMap.get(`${idText(annual)}:${membershipId}`) || null;
      if (fourResult?._id) sourceExamResultIds.push(fourResult._id);
      if (annualResult?._id) sourceExamResultIds.push(annualResult._id);
      const four = scoreFromResult(fourResult);
      const annualScore = scoreFromResult(annualResult);
      const combined = combineOfficialSubjectScores({ fourHalf: four.score, annual: annualScore.score });
      const applicable = four.applicable || annualScore.applicable;
      return {
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        fourHalf: four.score,
        fourHalfStatus: four.status,
        annual: annualScore.score,
        annualStatus: annualScore.status,
        total: combined.obtainedMark,
        fourHalfPassed: combined.fourHalfPassed,
        annualPassed: combined.annualPassed,
        generalPassed: combined.generalPassed,
        passed: combined.passed,
        complete: combined.complete,
        applicable
      };
    });

    const applicableSubjects = subjects.filter((item) => item.applicable);
    const general = applicableSubjects.length
      ? computeGeneralResult(applicableSubjects)
      : {
          totalObtained: null,
          totalPossible: 0,
          average: null,
          failedSubjects: null,
          resultStatus: 'not_applicable',
          rankEligible: false
        };
    const membershipSnapshot = selectLatestMembershipSnapshot(
      resultsByMembership.get(membershipId) || [],
      sessionMap
    );
    const membershipState = membershipSnapshot || membership;
    const membershipStatus = normalizeText(membershipState.status);
    const membershipStatusLabel = normalizeText(membershipState.statusLabel)
      || getMembershipLifecycleLabel(membershipState);
    const identity = buildIdentitySnapshot(membership, profileMap.get(idText(membership.studentId)) || null);
    const attendance = attendanceMap.get(membershipId) || emptyAttendanceSnapshot();
    const stageTotals = {
      fourHalf: buildStageSummary(applicableSubjects, 'fourHalf', 40),
      annual: buildStageSummary(applicableSubjects, 'annual', 60),
      general: buildStageSummary(applicableSubjects, 'total', 100)
    };
    return {
      rowType: 'student',
      sourceExamResultIds,
      studentMembershipId: membership._id,
      studentId: membership.studentId?._id || membership.studentId || null,
      student: membership.student?._id || membership.student || null,
      displayName: identity.fullName || displayName(membership),
      membershipStatus,
      membershipStatusLabel,
      resultStatus: general.resultStatus,
      groupLabel: '',
      rank: null,
      obtainedMark: general.totalObtained,
      totalMark: general.totalPossible,
      percentage: stageTotals.general.percentage,
      averageMark: stageTotals.general.percentage,
      cells: {
        fullName: identity.fullName || displayName(membership),
        admissionNo: identity.admissionNo,
        identity,
        attendance,
        stageTotals,
        membershipStatus,
        membershipStatusLabel,
        subjects,
        totalObtained: general.totalObtained,
        totalPossible: general.totalPossible,
        average: general.average,
        percentage: stageTotals.general.percentage,
        failedSubjects: general.failedSubjects,
        resultStatus: general.resultStatus
      },
      note: membershipStatusLabel,
      rankEligible: general.rankEligible
    };
  });

  const ranks = computeCompetitionRanks(rows, (row) => row.averageMark, (row) => row.rankEligible);
  rows.sort((left, right) => {
    const leftRank = ranks.get(left) || Number.MAX_SAFE_INTEGER;
    const rightRank = ranks.get(right) || Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.displayName.localeCompare(right.displayName, 'fa');
  });
  rows.forEach((row, index) => {
    row.serialNo = index + 1;
    row.rank = ranks.get(row) || null;
    row.cells.serialNo = index + 1;
    row.cells.rank = row.rank;
    delete row.rankEligible;
  });

  return { readiness, rows };
}

module.exports = {
  buildClassAggregateRows,
  getClassAggregateReadiness
};
