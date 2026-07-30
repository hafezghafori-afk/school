const mongoose = require('mongoose');

require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/TeacherAssignment');
require('../models/StudentCore');
require('../models/StudentMembership');
require('../models/StudentProfile');
require('../models/AfghanStudent');
require('../models/User');
require('../models/Enrollment');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const StudentSuspension = require('../models/StudentSuspension');
const StudentProfile = require('../models/StudentProfile');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const ExamType = require('../models/ExamType');
const ExamSession = require('../models/ExamSession');
const ExamDefaultMark = require('../models/ExamDefaultMark');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const RankingRule = require('../models/RankingRule');
const Attendance = require('../models/Attendance');
const SheetTemplate = require('../models/SheetTemplate');
const ResultTable = require('../models/ResultTable');
const PromotionTransaction = require('../models/PromotionTransaction');
const {
  OFFICIAL_RESULT_POLICY_VERSION,
  computeCompetitionRanks,
  getMembershipLifecycleLabel,
  getOfficialExamPolicy,
  isMembershipEffectiveAt
} = require('../utils/officialResultPolicy');

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

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNullableId(value) {
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return value;
}

function buildSheetTemplateSnapshot(template = null) {
  const item = toPlain(template);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    type: normalizeText(item.type) || 'exam',
    version: Math.max(1, Number(item.version || 1)),
    layout: item.layout && typeof item.layout === 'object' ? item.layout : {},
    columns: Array.isArray(item.columns) ? item.columns.map((column, order) => ({
      key: normalizeText(column?.key),
      label: normalizeText(column?.label),
      group: normalizeText(column?.group)
        || (['studentName', 'fatherName'].includes(normalizeText(column?.key)) ? 'شهرت شاگردان' : '')
        || (['obtainedMark', 'totalInWords'].includes(normalizeText(column?.key)) ? 'مجموع نمره' : ''),
      width: Math.max(4, Number(column?.width || 16)),
      visible: column?.visible !== false,
      order: Number(column?.order ?? order)
    })).filter((column) => column.key) : [],
    options: item.options && typeof item.options === 'object' ? item.options : {}
  };
}

function clampNumber(value, min, max, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function clampOptionalNumber(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  return clampNumber(value, min, max, null);
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeSessionKind(value = '', fallback = 'standard') {
  const normalized = normalizeText(value);
  return ['standard', 'subject_sheet'].includes(normalized) ? normalized : fallback;
}

function normalizeCodeFragment(value = '') {
  return normalizeText(value)
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .toUpperCase();
}

const SCORE_COMPONENT_FIELDS = Object.freeze([
  { key: 'attendance', maxKey: 'attendanceMax', scoreKey: 'attendanceScore', label: 'حاضری' },
  { key: 'written', maxKey: 'writtenMax', scoreKey: 'writtenScore', label: 'تحریری' },
  { key: 'oral', maxKey: 'oralMax', scoreKey: 'oralScore', label: 'تقریری' },
  { key: 'classActivity', maxKey: 'classActivityMax', scoreKey: 'classActivityScore', label: 'فعالیت صنفی' },
  { key: 'homework', maxKey: 'homeworkMax', scoreKey: 'homeworkScore', label: 'کارخانگی' }
]);

const EXAM_MARK_STATUS_LABELS = Object.freeze({
  absent: 'غایب',
  excused: 'معذور',
  pending: 'در انتظار نمره',
  not_applicable: 'شامل امتحان نبوده'
});

const OFFICIAL_MEMBERSHIP_NOTE_STATUSES = new Set([
  'transferred',
  'transferred_out',
  'graduated',
  'dropped',
  'expelled',
  'suspended',
  'inactive',
  'rejected'
]);

function sanitizeExamNote(value = '') {
  const note = normalizeText(value);
  return note === 'initialized_roster' ? '' : note;
}

function buildExamSheetNote(markStatus = '', note = '') {
  const statusLabel = EXAM_MARK_STATUS_LABELS[normalizeText(markStatus)] || '';
  return [statusLabel, sanitizeExamNote(note)].filter(Boolean).join(' - ');
}

function buildOfficialExamSheetNote(membershipSnapshot = {}, markStatus = '', note = '') {
  const membershipStatus = normalizeText(membershipSnapshot?.status);
  const membershipLabel = normalizeText(membershipSnapshot?.statusLabel)
    || getMembershipLifecycleLabel(membershipSnapshot);
  const normalizedMarkStatus = normalizeText(markStatus);
  const primary = OFFICIAL_MEMBERSHIP_NOTE_STATUSES.has(membershipStatus)
    ? membershipLabel
    : (normalizedMarkStatus === 'pending' ? '' : (EXAM_MARK_STATUS_LABELS[normalizedMarkStatus] || ''));
  const customNote = sanitizeExamNote(note);
  return [primary, customNote && customNote !== primary ? customNote : ''].filter(Boolean).join(' - ');
}

function getScoreComponents(source = {}) {
  const raw = source?.scoreComponents && typeof source.scoreComponents === 'object'
    ? source.scoreComponents
    : source;
  return SCORE_COMPONENT_FIELDS.reduce((acc, item) => {
    acc[item.maxKey] = Math.max(0, Number(raw?.[item.maxKey] || 0));
    return acc;
  }, {});
}

function normalizeOfficialScoreComponents(examType = null, source = {}) {
  const components = getScoreComponents(source);
  if (!getOfficialExamPolicy(examType)) return components;
  const attendanceMax = Math.max(0, Number(components.attendanceMax || 0));
  if (attendanceMax <= 0) return components;
  return {
    ...components,
    attendanceMax: 0,
    classActivityMax: Math.max(0, Number(components.classActivityMax || 0)) + attendanceMax
  };
}

function getSessionScoreComponents(session = {}) {
  return normalizeOfficialScoreComponents(
    session?.examTypeId || session?.examType,
    session?.defaultMarkId || session?.defaultMark || session
  );
}

function getScoreComponentTotal(source = {}) {
  return SCORE_COMPONENT_FIELDS.reduce((sum, item) => sum + Math.max(0, Number(source?.[item.maxKey] || 0)), 0);
}

function buildScoreComponentsFromPayload(payload = {}, fallback = {}) {
  const raw = payload?.scoreComponents && typeof payload.scoreComponents === 'object'
    ? payload.scoreComponents
    : payload;
  const fallbackComponents = getScoreComponents(fallback);
  return SCORE_COMPONENT_FIELDS.reduce((acc, item) => {
    const value = clampNumber(raw?.[item.maxKey], 0, 1000, fallbackComponents[item.maxKey] || 0);
    acc[item.maxKey] = value;
    return acc;
  }, {});
}

function getScoreBreakdown(source = {}) {
  const raw = source?.scoreBreakdown && typeof source.scoreBreakdown === 'object'
    ? source.scoreBreakdown
    : source;
  return SCORE_COMPONENT_FIELDS.reduce((acc, item) => {
    const value = raw?.[item.scoreKey];
    acc[item.scoreKey] = value === null || value === undefined || value === '' ? null : Number(value);
    return acc;
  }, {});
}

function getSessionScoreBreakdown(session = {}, source = {}) {
  const breakdown = getScoreBreakdown(source);
  if (!getOfficialExamPolicy(session?.examTypeId || session?.examType)) return breakdown;
  const storedComponents = getScoreComponents(session?.defaultMarkId || session?.defaultMark || {});
  if (Number(storedComponents.attendanceMax || 0) <= 0) return breakdown;
  const attendanceScore = breakdown.attendanceScore;
  if (attendanceScore === null || attendanceScore === undefined) {
    return { ...breakdown, attendanceScore: null };
  }
  return {
    ...breakdown,
    attendanceScore: null,
    classActivityScore: Number(breakdown.classActivityScore || 0) + Number(attendanceScore || 0)
  };
}

function isCurrentGradeableMembership(membership = {}) {
  const status = normalizeText(membership?.status);
  return membership?.isCurrent !== false && ['active', 'transferred_in'].includes(status);
}

function buildScoreBreakdownFromPayload(payload = {}, maxes = {}) {
  const raw = payload?.scoreBreakdown && typeof payload.scoreBreakdown === 'object'
    ? payload.scoreBreakdown
    : payload;
  return SCORE_COMPONENT_FIELDS.reduce((acc, item) => {
    const max = Math.max(0, Number(maxes?.[item.maxKey] || 0));
    acc[item.scoreKey] = clampOptionalNumber(raw?.[item.scoreKey], 0, max > 0 ? max : 1000);
    if (acc[item.scoreKey] === null && raw?.[item.scoreKey] === '') {
      acc[item.scoreKey] = 0;
    }
    return acc;
  }, {});
}

function getScoreBreakdownTotal(source = {}) {
  return SCORE_COMPONENT_FIELDS.reduce((sum, item) => {
    const value = Number(source?.[item.scoreKey]);
    return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
  }, 0);
}

function isBreakdownConfigured(source = {}) {
  return getScoreComponentTotal(getScoreComponents(source)) > 0;
}

function getStudentDisplayName(studentCore = null, user = null) {
  return normalizeText(studentCore?.preferredName)
    || normalizeText(studentCore?.fullName)
    || normalizeText([studentCore?.givenName, studentCore?.familyName].filter(Boolean).join(' '))
    || normalizeText(user?.name);
}

function getStudentAdmissionNo(studentCore = null) {
  return normalizeText(studentCore?.admissionNo);
}

const NUMBER_WORDS_UNDER_TWENTY = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const NUMBER_WORDS_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const NUMBER_WORDS_HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const NUMBER_WORDS_SCALES = [
  { value: 1000000, label: 'میلیون' },
  { value: 1000, label: 'هزار' }
];

function numberToFaWords(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const whole = Math.max(0, Math.round(numeric));
  if (whole === 0) return 'صفر';

  const underThousand = (num) => {
    const parts = [];
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    if (hundreds) parts.push(NUMBER_WORDS_HUNDREDS[hundreds]);
    if (remainder >= 20) {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(NUMBER_WORDS_TENS[tens]);
      if (ones) parts.push(NUMBER_WORDS_UNDER_TWENTY[ones]);
    } else if (remainder > 0) {
      parts.push(NUMBER_WORDS_UNDER_TWENTY[remainder]);
    }
    return parts.filter(Boolean).join(' و ');
  };

  let remainder = whole;
  const segments = [];
  NUMBER_WORDS_SCALES.forEach((scale) => {
    if (remainder >= scale.value) {
      const count = Math.floor(remainder / scale.value);
      remainder %= scale.value;
      segments.push(`${underThousand(count)} ${scale.label}`.trim());
    }
  });
  if (remainder > 0) segments.push(underThousand(remainder));
  return segments.filter(Boolean).join(' و ');
}

function formatAcademicYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    code: normalizeText(item.code),
    title: normalizeText(item.title),
    label: normalizeText(item.title) || normalizeText(item.code),
    status: normalizeText(item.status),
    isActive: Boolean(item.isActive),
    startDate: normalizeText(item.startDate),
    endDate: normalizeText(item.endDate)
  };
}

function formatAssessmentPeriod(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    termType: normalizeText(item.termType || item.type),
    sequence: Number(item.sequence || item.order || 0),
    isActive: Boolean(item.isActive),
    startDate: normalizeText(item.startDate),
    endDate: normalizeText(item.endDate),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatSchoolClass(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    gradeLevel: normalizeText(item.gradeLevel),
    section: normalizeText(item.section),
    shift: normalizeText(item.shift),
    room: normalizeText(item.room),
    status: normalizeText(item.status),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatSubject(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    name: normalizeText(item.nameDari) || normalizeText(item.name),
    code: normalizeText(item.code),
    grade: normalizeText(item.grade),
    gradeLevels: Array.isArray(item.gradeLevels) ? item.gradeLevels.map(Number).filter(Number.isFinite) : [],
    isActive: Boolean(item.isActive)
  };
}

function formatExamType(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    category: normalizeText(item.category),
    evaluationMode: normalizeText(item.evaluationMode),
    defaultTotalMark: Number(item.defaultTotalMark || 0),
    defaultPassMark: Number(item.defaultPassMark || 0),
    defaultConditionalMark: Number(item.defaultConditionalMark || 0),
    isRankingEnabled: Boolean(item.isRankingEnabled),
    isActive: Boolean(item.isActive)
  };
}

function formatRankingRule(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    name: normalizeText(item.name),
    code: normalizeText(item.code),
    scope: normalizeText(item.scope),
    passMark: Number(item.passMark || 0),
    conditionalMark: Number(item.conditionalMark || 0),
    distinctionMark: Number(item.distinctionMark || 0),
    isDefault: Boolean(item.isDefault),
    isActive: Boolean(item.isActive),
    groupBoundaries: Array.isArray(item.groupBoundaries) ? item.groupBoundaries.map((boundary) => ({
      label: normalizeText(boundary.label),
      minPercentage: Number(boundary.minPercentage || 0)
    })) : []
  };
}

function formatTeacherAssignment(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const academicYear = formatAcademicYear(item.academicYearId)
    || formatAcademicYear(item.classId?.academicYearId)
    || formatAcademicYear(item.termId?.academicYearId);
  return {
    id: String(item._id),
    assignmentType: normalizeText(item.assignmentType),
    status: normalizeText(item.status),
    isPrimary: Boolean(item.isPrimary),
    startedAt: item.startedAt || null,
    academicYear,
    assessmentPeriod: formatAssessmentPeriod(item.termId),
    schoolClass: formatSchoolClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacher: item.teacherUserId ? {
      id: String(item.teacherUserId._id || item.teacherUserId),
      name: normalizeText(item.teacherUserId.name),
      email: normalizeText(item.teacherUserId.email)
    } : null
  };
}

function formatDefaultMark(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    totalMark: Number(item.totalMark || 0),
    scoreComponents: getScoreComponents(item),
    passMark: Number(item.passMark || 0),
    conditionalMark: Number(item.conditionalMark || 0),
    weight: Number(item.weight || 0),
    status: normalizeText(item.status),
    note: normalizeText(item.note)
  };
}

function formatStudentCore(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    admissionNo: normalizeText(item.admissionNo),
    fullName: normalizeText(item.fullName),
    preferredName: normalizeText(item.preferredName),
    givenName: normalizeText(item.givenName),
    familyName: normalizeText(item.familyName),
    displayName: getStudentDisplayName(item),
    email: normalizeText(item.email)
  };
}

function formatStudentProfile(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    fatherName: normalizeText(item.family?.fatherName),
    motherName: normalizeText(item.family?.motherName),
    guardianName: normalizeText(item.family?.guardianName)
  };
}

function formatExamSession(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const officialPolicy = getOfficialExamPolicy(item.examTypeId);
  const sessionTotalMark = Number(item.defaultMarkId?.totalMark || item.examTypeId?.defaultTotalMark || 0);
  const sessionPassMark = Number(item.defaultMarkId?.passMark || item.examTypeId?.defaultPassMark || 0);
  const sessionComponents = getScoreComponents(item.defaultMarkId || {});
  const scoringPolicyCompatible = officialPolicy
    ? sessionTotalMark === officialPolicy.totalMark
      && sessionPassMark === officialPolicy.passMark
      && getScoreComponentTotal(sessionComponents) === officialPolicy.totalMark
    : true;
  const populatedTemplate = item.sheetTemplateId
    && typeof item.sheetTemplateId === 'object'
    && (
      normalizeText(item.sheetTemplateId.title)
      || Array.isArray(item.sheetTemplateId.columns)
      || (item.sheetTemplateId.layout && typeof item.sheetTemplateId.layout === 'object')
    )
    ? item.sheetTemplateId
    : null;
  const effectiveTemplate = populatedTemplate || item.sheetTemplateSnapshot || item.sheetTemplateId;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    sessionKind: normalizeSessionKind(item.sessionKind),
    status: normalizeText(item.status),
    version: Number(item.version || 1),
    revisionRootSessionId: item.revisionRootSessionId ? String(item.revisionRootSessionId?._id || item.revisionRootSessionId) : '',
    supersedesSessionId: item.supersedesSessionId ? String(item.supersedesSessionId?._id || item.supersedesSessionId) : '',
    replacedBySessionId: item.replacedBySessionId ? String(item.replacedBySessionId?._id || item.replacedBySessionId) : '',
    heldAt: item.heldAt || null,
    rosterFrozenAt: item.rosterFrozenAt || null,
    publishedAt: item.publishedAt || null,
    monthLabel: normalizeText(item.monthLabel),
    reviewedByName: normalizeText(item.reviewedByName),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null,
    reviewerUserId: (item.reviewerUserId?._id || item.reviewerUserId)
      ? String(item.reviewerUserId?._id || item.reviewerUserId)
      : '',
    reviewer: item.reviewerUserId && item.reviewerUserId.name ? {
      id: String(item.reviewerUserId._id),
      name: normalizeText(item.reviewerUserId.name),
      email: normalizeText(item.reviewerUserId.email)
    } : null,
    submittedAt: item.submittedAt || null,
    approvedAt: item.approvedAt || null,
    note: normalizeText(item.note),
    examType: formatExamType(item.examTypeId),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    schoolClass: formatSchoolClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacherAssignment: formatTeacherAssignment(item.teacherAssignmentId),
    sheetTemplate: buildSheetTemplateSnapshot(effectiveTemplate),
    sheetTemplateId: (item.sheetTemplateId?._id || item.sheetTemplateId)
      ? String(item.sheetTemplateId?._id || item.sheetTemplateId)
      : '',
    sheetTemplateVersion: Math.max(1, Number(populatedTemplate?.version || item.sheetTemplateVersion || item.sheetTemplateSnapshot?.version || 1)),
    defaultMark: item.defaultMarkId ? {
      ...formatDefaultMark(item.defaultMarkId),
      scoreComponents: sessionComponents
    } : null,
    rankingRule: formatRankingRule(item.rankingRuleId),
    scoringPolicy: officialPolicy ? {
      version: OFFICIAL_RESULT_POLICY_VERSION,
      totalMark: officialPolicy.totalMark,
      passMark: officialPolicy.passMark,
      compatible: scoringPolicyCompatible
    } : null
  };
}

function getSessionTeacherUserId(session = null) {
  return normalizeNullableId(session?.teacherAssignmentId?.teacherUserId?._id || session?.teacherAssignmentId?.teacherUserId);
}

function assertExamSessionAccess(session, actor = {}) {
  const role = normalizeText(actor?.role);
  const actorId = normalizeNullableId(actor?.id);

  if (!session) {
    throw new Error('exam_session_not_found');
  }
  if (role === 'admin') {
    return;
  }
  if (role === 'instructor' && actorId && String(getSessionTeacherUserId(session) || '') === String(actorId)) {
    return;
  }

  throw new Error('exam_session_forbidden');
}

function formatMembership(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    status: normalizeText(item.status),
    statusLabel: getMembershipLifecycleLabel(item),
    isCurrent: Boolean(item.isCurrent),
    enrolledAt: item.enrolledAt || item.joinedAt || null,
    endedAt: item.endedAt || item.leftAt || null,
    endedReason: normalizeText(item.endedReason),
    studentId: item.studentId ? String(item.studentId._id || item.studentId) : '',
    studentUserId: item.student ? String(item.student._id || item.student) : '',
    studentCore: formatStudentCore(item.studentId),
    student: item.student ? {
      id: String(item.student._id || item.student),
      name: normalizeText(item.student.name),
      email: normalizeText(item.student.email)
    } : null,
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId || item.academicYear)
  };
}

function buildMembershipSnapshot(membership = {}, effectiveAt = null, { suspended = false, forceCurrent = false } = {}) {
  const date = toDateOrNull(effectiveAt);
  const effective = forceCurrent || isMembershipEffectiveAt(membership, date);
  const endedAt = toDateOrNull(membership.endedAt || membership.leftAt);
  let status = normalizeText(membership.status);
  if (suspended) {
    status = 'suspended';
  } else if (effective && status === 'suspended') {
    // The current membership may be suspended today while the examination date
    // is outside the suspension interval. Preserve the state at the exam date.
    status = normalizeText(membership.admissionType) === 'transfer_in' ? 'transferred_in' : 'active';
  } else if (effective && endedAt && date && endedAt.getTime() > date.getTime()
    && ['transferred', 'transferred_out', 'graduated', 'dropped', 'expelled', 'inactive'].includes(status)) {
    status = normalizeText(membership.admissionType) === 'transfer_in' ? 'transferred_in' : 'active';
  }
  const snapshot = {
    status,
    admissionType: normalizeText(membership.admissionType),
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

function formatExamMark(doc, session = null) {
  const item = toPlain(doc);
  if (!item) return null;
  const scoreBreakdown = session ? getSessionScoreBreakdown(session, item) : getScoreBreakdown(item);
  return {
    id: String(item._id),
    markStatus: normalizeText(item.markStatus),
    scoreBreakdown,
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    note: normalizeText(item.note),
    membershipSnapshot: item.membershipSnapshot || null,
    enteredAt: item.enteredAt || item.updatedAt || item.createdAt || null,
    studentMembership: formatMembership(item.studentMembershipId),
    student: item.student ? {
      id: String(item.student._id || item.student),
      name: normalizeText(item.student.name),
      email: normalizeText(item.student.email)
    } : null
  };
}

function formatExamResult(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    markStatus: normalizeText(item.markStatus),
    scoreBreakdown: getSessionScoreBreakdown(item.sessionId, item),
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    averageMark: Number(item.averageMark || 0),
    resultStatus: normalizeText(item.resultStatus),
    groupLabel: normalizeText(item.groupLabel),
    rank: item.rank == null ? null : Number(item.rank),
    computedAt: item.computedAt || null,
    membershipSnapshot: item.membershipSnapshot || null,
    session: formatExamSession(item.sessionId),
    examType: formatExamType(item.examTypeId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    schoolClass: formatSchoolClass(item.classId),
    subject: formatSubject(item.subjectId)
  };
}

function buildSessionCode({ examType, academicYear, assessmentPeriod, schoolClass, subject = null, monthLabel = '', sessionKind = 'standard' }) {
  const parts = [
    normalizeText(examType?.code),
    normalizeText(academicYear?.code),
    normalizeText(assessmentPeriod?.code),
    normalizeText(schoolClass?.code || schoolClass?.gradeLevel)
  ].filter(Boolean);
  if (subject) {
    parts.push(normalizeText(subject?.code || subject?.name));
  }
  if (normalizeSessionKind(sessionKind) === 'subject_sheet' && normalizeText(monthLabel)) {
    parts.push(normalizeCodeFragment(monthLabel));
  }
  return parts.join('-').toUpperCase();
}

function buildSessionTitle({ refs, payload = {} }) {
  const sessionKind = normalizeSessionKind(payload.sessionKind);
  if (normalizeText(payload.title)) return normalizeText(payload.title);
  if (sessionKind === 'subject_sheet') {
    const examCode = normalizeText(refs.examType?.code).toUpperCase();
    const labelsByCode = {
      ANNUAL: 'سالانه',
      MONTHLY: 'ماهوار',
      FOUR_HALF_MONTH: 'چهارنیم‌ماهه'
    };
    const normalizedExamTitle = normalizeText(refs.examType?.title)
      .replace(/^شقه\s*(?:امتحان(?:ات)?)?\s*/u, '')
      .replace(/^امتحان(?:ات)?\s*/u, '')
      .trim();
    const examLabel = labelsByCode[examCode] || normalizedExamTitle;
    const sheetTitle = examLabel ? `شقه امتحان ${examLabel}` : 'شقه امتحانات';
    const parts = [
      sheetTitle,
      normalizeText(refs.subject?.name),
      normalizeText(refs.schoolClass?.title),
      normalizeText(payload.monthLabel)
    ].filter(Boolean);
    return parts.join(' - ') || `${refs.examType.title} - ${refs.schoolClass.title}`;
  }
  return `${refs.examType.title} - ${refs.schoolClass.title}`;
}

function normalizeSessionStatus(value = '', fallback = 'draft') {
  const normalized = normalizeText(value);
  return ['draft', 'active', 'submitted', 'approved', 'closed', 'published', 'archived'].includes(normalized) ? normalized : fallback;
}

async function loadExamSessionWithRelations(sessionId) {
  return ExamSession.findById(sessionId)
    .populate('examTypeId')
    .populate('academicYearId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .populate('reviewerUserId', 'name email role orgRole status')
    .populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] })
    .populate('sheetTemplateId')
    .populate('defaultMarkId')
    .populate('rankingRuleId');
}

async function ensureExamSessionAccess(sessionId, actor = {}) {
  const session = await loadExamSessionWithRelations(sessionId);
  assertExamSessionAccess(session, actor);
  return formatExamSession(session);
}

async function findExistingSessionCandidate({ code = '', refs = {}, sessionKind = 'standard', monthLabel = '' } = {}) {
  const clauses = [];
  if (normalizeText(code)) {
    clauses.push({ code: normalizeText(code).toUpperCase() });
  }
  if (refs.examType?._id && refs.academicYear?._id && refs.assessmentPeriod?._id && refs.schoolClass?._id) {
    const scopeClause = {
      examTypeId: refs.examType._id,
      academicYearId: refs.academicYear._id,
      assessmentPeriodId: refs.assessmentPeriod._id,
      classId: refs.schoolClass._id,
      subjectId: refs.subject?._id || null,
      sessionKind: normalizeSessionKind(sessionKind),
      status: { $in: ['draft', 'active', 'submitted', 'approved', 'closed', 'published'] }
    };
    if (normalizeSessionKind(sessionKind) === 'subject_sheet' && normalizeText(monthLabel)) {
      scopeClause.monthLabel = normalizeText(monthLabel);
    }
    clauses.push(scopeClause);
  }
  if (!clauses.length) return null;
  return loadExamSessionWithRelations((await ExamSession.findOne({ $or: clauses }).select('_id').lean())?._id || null);
}

async function listEligibleMembershipsForSessionContext({ academicYearId = null, classId = null } = {}) {
  if (!academicYearId || !classId) return [];
  return StudentMembership.find({
    classId,
    $or: [{ academicYearId }, { academicYear: academicYearId }]
  })
    .populate('studentId')
    .populate('afghanStudentId', 'personalInfo.fatherName')
    .populate('student', 'name email')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .sort({ enrolledAt: 1, createdAt: 1, _id: 1 });
}

function buildSessionRosterSummary({ memberships = [], marks = [], results = [], createdMarks = 0 } = {}) {
  const markIds = new Set(marks.map((item) => String(item.studentMembershipId?._id || item.studentMembershipId || '')).filter(Boolean));
  const markStatusCounts = {
    recordedMarks: 0,
    pendingMarks: 0,
    absentMarks: 0,
    excusedMarks: 0,
    notApplicableMarks: 0
  };

  marks.forEach((item) => {
    const status = normalizeText(item.markStatus);
    if (status === 'recorded') markStatusCounts.recordedMarks += 1;
    else if (status === 'pending') markStatusCounts.pendingMarks += 1;
    else if (status === 'absent') markStatusCounts.absentMarks += 1;
    else if (status === 'excused') markStatusCounts.excusedMarks += 1;
    else if (status === 'not_applicable') markStatusCounts.notApplicableMarks += 1;
  });

  return {
    eligibleMemberships: memberships.length,
    totalMarks: marks.length,
    createdMarks: Number(createdMarks || 0),
    existingMarks: Math.max(0, marks.length - Number(createdMarks || 0)),
    results: results.length,
    missingMarks: memberships.filter((item) => !markIds.has(String(item._id))).length,
    ...markStatusCounts
  };
}

function getRankingRuleSpecificity(rule, context = {}) {
  let score = 0;
  if (String(rule.scope) === 'global') score += 1;
  if (String(rule.scope) === 'academic_year') score += 10;
  if (String(rule.scope) === 'class') score += 20;
  if (String(rule.scope) === 'session_template') score += 30;
  if (rule.academicYearId && String(rule.academicYearId) === String(context.academicYearId || '')) score += 5;
  if (rule.assessmentPeriodId && String(rule.assessmentPeriodId) === String(context.assessmentPeriodId || '')) score += 5;
  if (rule.classId && String(rule.classId) === String(context.classId || '')) score += 10;
  if (rule.examTypeId && String(rule.examTypeId) === String(context.examTypeId || '')) score += 5;
  return score;
}

async function findBestRankingRule(context = {}) {
  const rules = await RankingRule.find({ isActive: true });
  const candidates = rules.filter((rule) => {
    if (rule.scope === 'academic_year' && String(rule.academicYearId || '') !== String(context.academicYearId || '')) return false;
    if (rule.scope === 'class' && String(rule.classId || '') !== String(context.classId || '')) return false;
    if (rule.assessmentPeriodId && String(rule.assessmentPeriodId || '') !== String(context.assessmentPeriodId || '')) return false;
    if (rule.examTypeId && String(rule.examTypeId || '') !== String(context.examTypeId || '')) return false;
    return true;
  });

  return candidates.sort((left, right) => getRankingRuleSpecificity(right, context) - getRankingRuleSpecificity(left, context))[0] || null;
}

function computeGroupLabel(rule, percentage) {
  const boundaries = Array.isArray(rule?.groupBoundaries) ? [...rule.groupBoundaries] : [];
  boundaries.sort((left, right) => Number(right.minPercentage || 0) - Number(left.minPercentage || 0));
  const matched = boundaries.find((boundary) => percentage >= Number(boundary.minPercentage || 0));
  return matched ? normalizeText(matched.label) : '';
}

function computeResultStatus({ examType, rankingRule, defaultMark, percentage, obtainedMark, markStatus }) {
  if (markStatus === 'excused') return 'excused';
  if (markStatus === 'absent') return 'absent';
  if (markStatus === 'pending') return 'pending';
  if (markStatus === 'not_applicable') return 'not_applicable';

  const officialPolicy = getOfficialExamPolicy(examType);
  if (officialPolicy) {
    return Number(obtainedMark || 0) >= Number(defaultMark?.passMark ?? officialPolicy.passMark)
      ? 'passed'
      : 'failed';
  }

  const passMark = Number(rankingRule?.passMark ?? examType?.defaultPassMark ?? 50);
  const conditionalMark = Number(rankingRule?.conditionalMark ?? examType?.defaultConditionalMark ?? 40);
  const distinctionMark = Number(rankingRule?.distinctionMark ?? 90);
  const category = normalizeText(examType?.category);

  if (category === 'excused') return 'excused';
  if (category === 'placement') return percentage >= passMark ? 'placement' : 'failed';
  if (category === 'temporary') return percentage >= passMark ? 'temporary' : 'failed';
  if (category === 'conditional') return percentage >= passMark ? 'passed' : 'conditional';
  if (category === 'distinction') {
    if (percentage >= distinctionMark) return 'distinction';
    if (percentage >= passMark) return 'passed';
    if (percentage >= conditionalMark) return 'conditional';
    return 'failed';
  }

  if (percentage >= distinctionMark) return 'distinction';
  if (percentage >= passMark) return 'passed';
  if (percentage >= conditionalMark) return 'conditional';
  return 'failed';
}

async function resolveStudentIdentity(studentRef) {
  const ref = normalizeText(studentRef);
  if (!ref || !mongoose.isValidObjectId(ref)) {
    return { studentCore: null, user: null };
  }

  let studentCore = await StudentCore.findById(ref);
  if (studentCore) {
    const user = studentCore.userId ? await User.findById(studentCore.userId) : null;
    return { studentCore, user };
  }

  studentCore = await StudentCore.findOne({ userId: ref });
  if (studentCore) {
    const user = studentCore.userId ? await User.findById(studentCore.userId) : null;
    return { studentCore, user };
  }

  const user = await User.findById(ref);
  if (!user || String(user.role) !== 'student') {
    return { studentCore: null, user: null };
  }

  studentCore = await StudentCore.findOne({ userId: user._id });
  return { studentCore, user };
}
function buildReferencePayloads() {
  return {
    examTypes: [
      { title: 'ماهوار', code: 'MONTHLY', category: 'standard', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'چهارونیم‌ماهه', code: 'FOUR_HALF_MONTH', category: 'standard', defaultTotalMark: 40, defaultPassMark: 16, defaultConditionalMark: 16, isRankingEnabled: true, isActive: true },
      { title: 'سالانه', code: 'ANNUAL', category: 'standard', defaultTotalMark: 60, defaultPassMark: 40, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'مشروطی', code: 'CONDITIONAL', category: 'conditional', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'موقت', code: 'TEMPORARY', category: 'temporary', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'لیاقت', code: 'DISTINCTION', category: 'distinction', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'سویه', code: 'PLACEMENT', category: 'placement', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'معذرتی', code: 'EXCUSED', category: 'excused', evaluationMode: 'status_only', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: false, isActive: true }
    ],
    rankingRule: {
      name: 'Default Academic Ranking',
      code: 'DEFAULT-ACADEMIC',
      scope: 'global',
      passMark: 50,
      conditionalMark: 40,
      distinctionMark: 90,
      isDefault: true,
      isActive: true,
      groupBoundaries: [
        { label: 'A', minPercentage: 90 },
        { label: 'B', minPercentage: 75 },
        { label: 'C', minPercentage: 60 },
        { label: 'D', minPercentage: 50 },
        { label: 'E', minPercentage: 40 },
        { label: 'F', minPercentage: 0 }
      ]
    }
  };
}

async function ensureExamTypesReady() {
  const reference = buildReferencePayloads();

  for (const payload of reference.examTypes) {
    const existing = await ExamType.findOne({
      $or: [
        { code: payload.code },
        { title: payload.title }
      ]
    });

    if (existing) {
      if (getOfficialExamPolicy(payload.code)) {
        const changed = Number(existing.defaultTotalMark) !== Number(payload.defaultTotalMark)
          || Number(existing.defaultPassMark) !== Number(payload.defaultPassMark)
          || Number(existing.defaultConditionalMark) !== Number(payload.defaultConditionalMark);
        if (changed) {
          existing.defaultTotalMark = payload.defaultTotalMark;
          existing.defaultPassMark = payload.defaultPassMark;
          existing.defaultConditionalMark = payload.defaultConditionalMark;
          await existing.save();
        }
      }
      continue;
    }

    await ExamType.create(payload);
  }
}

async function seedExamReferenceData({ dryRun = false } = {}) {
  const reference = buildReferencePayloads();
  const summary = {
    examTypesCreated: 0,
    examTypesUpdated: 0,
    rankingRulesCreated: 0,
    rankingRulesUpdated: 0,
    termsCreated: 0,
    termsUpdated: 0
  };

  for (const payload of reference.examTypes) {
    const existing = await ExamType.findOne({ code: payload.code });
    if (!existing) {
      summary.examTypesCreated += 1;
      if (!dryRun) {
        await ExamType.create(payload);
      }
      continue;
    }

    const changed =
      normalizeText(existing.title) !== payload.title ||
      normalizeText(existing.category) !== payload.category ||
      normalizeText(existing.evaluationMode) !== normalizeText(payload.evaluationMode || 'score') ||
      Number(existing.defaultTotalMark || 0) !== Number(payload.defaultTotalMark || 0) ||
      Number(existing.defaultPassMark || 0) !== Number(payload.defaultPassMark || 0) ||
      Number(existing.defaultConditionalMark || 0) !== Number(payload.defaultConditionalMark || 0) ||
      Boolean(existing.isRankingEnabled) !== Boolean(payload.isRankingEnabled) ||
      Boolean(existing.isActive) !== Boolean(payload.isActive);

    if (changed) {
      summary.examTypesUpdated += 1;
      if (!dryRun) {
        Object.assign(existing, payload);
        await existing.save();
      }
    }
  }

  const existingRule = await RankingRule.findOne({ code: reference.rankingRule.code });
  if (!existingRule) {
    summary.rankingRulesCreated += 1;
    if (!dryRun) {
      await RankingRule.create(reference.rankingRule);
    }
  } else {
    const changed =
      normalizeText(existingRule.name) !== reference.rankingRule.name ||
      Number(existingRule.passMark || 0) !== Number(reference.rankingRule.passMark || 0) ||
      Number(existingRule.conditionalMark || 0) !== Number(reference.rankingRule.conditionalMark || 0) ||
      Number(existingRule.distinctionMark || 0) !== Number(reference.rankingRule.distinctionMark || 0) ||
      Boolean(existingRule.isDefault) !== Boolean(reference.rankingRule.isDefault) ||
      Boolean(existingRule.isActive) !== Boolean(reference.rankingRule.isActive);
    if (changed) {
      summary.rankingRulesUpdated += 1;
      if (!dryRun) {
        Object.assign(existingRule, reference.rankingRule);
        await existingRule.save();
      }
    }
  }

  const years = await AcademicYear.find({}).sort({ sequence: 1, createdAt: 1 });
  for (const year of years) {
    const prefixes = normalizeText(year.code) || String(year.sequence || year._id).slice(-4);
    const targetTerms = [
      { title: `${year.title} - دوره اول`, code: `${prefixes}-T1`, type: 'assessment_period', order: 1, isActive: Boolean(year.isActive) },
      { title: `${year.title} - دوره دوم`, code: `${prefixes}-T2`, type: 'assessment_period', order: 2, isActive: false },
      { title: `${year.title} - سالانه`, code: `${prefixes}-ANNUAL`, type: 'assessment_period', order: 90, isActive: false }
    ];

    for (const termPayload of targetTerms) {
      const existingTerm = await AcademicTerm.findOne({ academicYearId: year._id, code: termPayload.code });
      if (!existingTerm) {
        summary.termsCreated += 1;
        if (!dryRun) {
          await AcademicTerm.create({
            ...termPayload,
            name: termPayload.title,
            academicYearId: year._id
          });
        }
        continue;
      }

      const changed =
        normalizeText(existingTerm.title) !== termPayload.title ||
        normalizeText(existingTerm.type) !== termPayload.type ||
        Number(existingTerm.order || 0) !== Number(termPayload.order || 0);
      if (changed) {
        summary.termsUpdated += 1;
        if (!dryRun) {
          existingTerm.title = termPayload.title;
          existingTerm.name = termPayload.title;
          existingTerm.type = termPayload.type;
          existingTerm.order = termPayload.order;
          await existingTerm.save();
        }
      }
    }
  }

  return summary;
}

async function listExamReferenceData() {
  await ensureExamTypesReady();

  const [academicYears, assessmentPeriods, schoolClasses, subjects, teacherAssignments, examTypes, rankingRules, reviewers] = await Promise.all([
    AcademicYear.find({}).sort({ isActive: -1, sequence: 1, createdAt: 1 }),
    AcademicTerm.find({}).populate('academicYearId').sort({ sequence: 1, createdAt: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).populate('academicYearId').sort({ gradeLevel: 1, section: 1, title: 1 }),
    Subject.find({ isActive: true }).sort({ grade: 1, name: 1 }),
    TeacherAssignment.find({ status: 'active' })
      .populate('teacherUserId', 'name email')
      .populate('academicYearId')
      .populate({ path: 'termId', populate: { path: 'academicYearId' } })
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('subjectId')
      .sort({ createdAt: -1 }),
    ExamType.find({ isActive: true }).sort({ createdAt: 1 }),
    RankingRule.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }),
    User.find({
      status: 'active',
      $or: [
        { role: { $in: ['admin', 'instructor'] } },
        { orgRole: { $in: ['academic_manager', 'head_teacher', 'school_manager'] } }
      ]
    }).select('name email role orgRole').sort({ name: 1 })
  ]);

  return {
    academicYears: academicYears.map(formatAcademicYear),
    assessmentPeriods: assessmentPeriods.map(formatAssessmentPeriod),
    classes: schoolClasses.map(formatSchoolClass),
    subjects: subjects.map(formatSubject),
    teacherAssignments: teacherAssignments.map(formatTeacherAssignment),
    examTypes: examTypes.map(formatExamType),
    rankingRules: rankingRules.map(formatRankingRule),
    reviewers: reviewers.map((item) => ({
      id: String(item._id),
      name: normalizeText(item.name),
      email: normalizeText(item.email),
      role: normalizeText(item.role),
      orgRole: normalizeText(item.orgRole)
    })),
    resultPolicyVersion: OFFICIAL_RESULT_POLICY_VERSION
  };
}

async function listExamTypes() {
  await ensureExamTypesReady();
  const items = await ExamType.find({}).sort({ isActive: -1, createdAt: 1 });
  return items.map(formatExamType);
}

async function createExamType(payload = {}) {
  const item = await ExamType.create({
    title: normalizeText(payload.title),
    code: normalizeText(payload.code).toUpperCase(),
    category: ['standard', 'conditional', 'temporary', 'distinction', 'placement', 'excused'].includes(normalizeText(payload.category)) ? normalizeText(payload.category) : 'standard',
    evaluationMode: normalizeText(payload.evaluationMode) === 'status_only' ? 'status_only' : 'score',
    defaultTotalMark: clampNumber(payload.defaultTotalMark, 1, 1000, 100),
    defaultPassMark: clampNumber(payload.defaultPassMark, 0, 1000, 50),
    defaultConditionalMark: clampNumber(payload.defaultConditionalMark, 0, 1000, 40),
    isRankingEnabled: payload.isRankingEnabled !== false,
    isActive: payload.isActive !== false,
    note: normalizeText(payload.note)
  });
  return formatExamType(item);
}

async function resolveSessionReferences(payload = {}, actor = null) {
  const sessionKind = normalizeSessionKind(payload.sessionKind);
  const examTypeId = normalizeNullableId(payload.examTypeId);
  const academicYearId = normalizeNullableId(payload.academicYearId);
  const assessmentPeriodId = normalizeNullableId(payload.assessmentPeriodId);
  const classId = normalizeNullableId(payload.classId);
  const subjectId = normalizeNullableId(payload.subjectId);
  const teacherAssignmentId = normalizeNullableId(payload.teacherAssignmentId);
  const rankingRuleId = normalizeNullableId(payload.rankingRuleId);
  const sheetTemplateId = normalizeNullableId(payload.sheetTemplateId || payload.templateId);

  if (!examTypeId || !academicYearId || !assessmentPeriodId || !classId) {
    throw new Error('exam_session_missing_required_refs');
  }
  if (sessionKind === 'subject_sheet' && !subjectId) {
    throw new Error('exam_session_subject_required');
  }

  const teacherAssignmentQuery = teacherAssignmentId
    ? TeacherAssignment.findById(teacherAssignmentId)
    : TeacherAssignment.findOne({ academicYearId, classId, ...(subjectId ? { subjectId } : {}), status: 'active' });

  const [examType, academicYear, assessmentPeriod, schoolClass, subject, teacherAssignment, rankingRule, sheetTemplate] = await Promise.all([
    ExamType.findById(examTypeId),
    AcademicYear.findById(academicYearId),
    AcademicTerm.findById(assessmentPeriodId).populate('academicYearId'),
    SchoolClass.findById(classId).populate('academicYearId'),
    subjectId ? Subject.findById(subjectId) : null,
    teacherAssignmentQuery
      .populate('teacherUserId', 'name email')
      .populate('academicYearId')
      .populate({ path: 'termId', populate: { path: 'academicYearId' } })
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('subjectId'),
    rankingRuleId ? RankingRule.findById(rankingRuleId) : null,
    sheetTemplateId
      ? SheetTemplate.findOne({ _id: sheetTemplateId, type: 'exam', isActive: true })
      : SheetTemplate.findOne({ type: 'exam', isActive: true }).sort({ 'ownership.isDefault': -1, createdAt: 1 })
  ]);

  if (!examType || !academicYear || !assessmentPeriod || !schoolClass) {
    throw new Error('exam_session_refs_not_found');
  }
  if (sessionKind === 'subject_sheet' && normalizeText(actor?.role) === 'instructor' && !teacherAssignment) {
    throw new Error('exam_session_teacher_assignment_required');
  }
  if (
    normalizeText(actor?.role) === 'instructor'
    && normalizeNullableId(actor?.id)
    && String(getSessionTeacherUserId({ teacherAssignmentId: teacherAssignment }) || '') !== String(normalizeNullableId(actor?.id))
  ) {
    throw new Error('exam_teacher_assignment_forbidden');
  }
  if (String(assessmentPeriod.academicYearId?._id || assessmentPeriod.academicYearId || '') !== String(academicYear._id)) {
    throw new Error('exam_period_year_mismatch');
  }
  if (String(schoolClass.academicYearId?._id || schoolClass.academicYearId || '') !== String(academicYear._id)) {
    throw new Error('exam_class_year_mismatch');
  }
  if (teacherAssignmentId && !teacherAssignment) {
    throw new Error('exam_teacher_assignment_not_found');
  }
  if (teacherAssignment) {
    if (normalizeText(teacherAssignment.status) !== 'active') {
      throw new Error('exam_teacher_assignment_inactive');
    }
    if (String(teacherAssignment.academicYearId?._id || teacherAssignment.academicYearId || '') !== String(academicYear._id)) {
      throw new Error('exam_teacher_assignment_year_mismatch');
    }
    if (String(teacherAssignment.classId?._id || teacherAssignment.classId || '') !== String(schoolClass._id)) {
      throw new Error('exam_teacher_assignment_class_mismatch');
    }
    if (subject && String(teacherAssignment.subjectId?._id || teacherAssignment.subjectId || '') !== String(subject._id)) {
      throw new Error('exam_teacher_assignment_subject_mismatch');
    }
  }
  if (sheetTemplateId && !sheetTemplate) {
    throw new Error('exam_sheet_template_not_found');
  }

  const effectiveRankingRule = rankingRule || await findBestRankingRule({ academicYearId, assessmentPeriodId, classId, examTypeId });
  return {
    sessionKind,
    examType,
    academicYear,
    assessmentPeriod,
    schoolClass,
    subject,
    teacherAssignment,
    rankingRule: effectiveRankingRule,
    sheetTemplate
  };
}

function getSessionScoringDefaults(examType, payload = {}) {
  const officialPolicy = getOfficialExamPolicy(examType);
  if (officialPolicy) {
    const scoreComponents = normalizeOfficialScoreComponents(
      examType,
      buildScoreComponentsFromPayload(payload, officialPolicy.scoreComponents)
    );
    if (getScoreComponentTotal(scoreComponents) !== Number(officialPolicy.totalMark)) {
      throw new Error('exam_score_component_total_mismatch');
    }
    return {
      scoreComponents,
      totalMark: officialPolicy.totalMark,
      passMark: officialPolicy.passMark,
      conditionalMark: officialPolicy.conditionalMark
    };
  }

  const scoreComponents = buildScoreComponentsFromPayload(payload, {
    attendanceMax: 0,
    writtenMax: 25,
    oralMax: 25,
    classActivityMax: 25,
    homeworkMax: 25
  });
  return {
    scoreComponents,
    totalMark: getScoreComponentTotal(scoreComponents)
      || clampNumber(payload.totalMark, 1, 1000, Number(examType?.defaultTotalMark || 100)),
    passMark: clampNumber(payload.passMark, 0, 1000, Number(examType?.defaultPassMark ?? 50)),
    conditionalMark: clampNumber(payload.conditionalMark, 0, 1000, Number(examType?.defaultConditionalMark ?? 40))
  };
}

async function resolveReviewerIdentity(reviewerUserId = null, reviewedByName = '') {
  const normalizedId = normalizeNullableId(reviewerUserId);
  if (!normalizedId) {
    return { reviewerUserId: null, reviewedByName: normalizeText(reviewedByName) };
  }
  const reviewer = await User.findOne({
    _id: normalizedId,
    status: 'active',
    $or: [
      { role: { $in: ['admin', 'instructor'] } },
      { orgRole: { $in: ['academic_manager', 'head_teacher', 'school_manager'] } }
    ]
  }).select('name');
  if (!reviewer) throw new Error('exam_reviewer_not_found');
  return { reviewerUserId: reviewer._id, reviewedByName: normalizeText(reviewer.name) };
}

async function previewExamSessionBootstrap(payload = {}, actor = null) {
  const refs = await resolveSessionReferences(payload, actor);
  const scoring = getSessionScoringDefaults(refs.examType, payload);
  const { scoreComponents, totalMark, passMark, conditionalMark } = scoring;
  const reviewer = await resolveReviewerIdentity(payload.reviewerUserId, payload.reviewedByName);
  const code = normalizeText(payload.code).toUpperCase() || buildSessionCode({
    examType: refs.examType,
    academicYear: refs.academicYear,
    assessmentPeriod: refs.assessmentPeriod,
    schoolClass: refs.schoolClass,
    subject: refs.subject,
    monthLabel: payload.monthLabel,
    sessionKind: refs.sessionKind
  });
  const title = buildSessionTitle({ refs, payload });
  const status = normalizeSessionStatus(payload.status, 'draft');
  const existingSession = await findExistingSessionCandidate({
    code,
    refs,
    sessionKind: refs.sessionKind,
    monthLabel: payload.monthLabel
  });
  const memberships = await listEligibleMembershipsForSessionContext({
    academicYearId: refs.academicYear._id,
    classId: refs.schoolClass._id
  });
  const warnings = [];
  if (!refs.teacherAssignment) warnings.push('no_teacher_assignment');
  if (!refs.subject) warnings.push('no_subject_selected');
  if (!memberships.length) warnings.push('no_memberships_in_class_year');
  if (existingSession) warnings.push('existing_session_detected');

  return {
    canBootstrap: !existingSession && memberships.length > 0,
    warnings,
    existingSession: formatExamSession(existingSession),
    proposedSession: {
      title,
      code,
      sessionKind: refs.sessionKind,
      status,
      heldAt: toDateOrNull(payload.heldAt),
      publishedAt: toDateOrNull(payload.publishedAt),
      monthLabel: normalizeText(payload.monthLabel),
      reviewerUserId: reviewer.reviewerUserId ? String(reviewer.reviewerUserId) : '',
      reviewedByName: reviewer.reviewedByName,
      note: normalizeText(payload.note),
      examType: formatExamType(refs.examType),
      academicYear: formatAcademicYear(refs.academicYear),
      assessmentPeriod: formatAssessmentPeriod(refs.assessmentPeriod),
      schoolClass: formatSchoolClass(refs.schoolClass),
      subject: formatSubject(refs.subject),
      teacherAssignment: formatTeacherAssignment(refs.teacherAssignment),
      sheetTemplate: buildSheetTemplateSnapshot(refs.sheetTemplate),
      rankingRule: formatRankingRule(refs.rankingRule),
      defaultMark: {
        totalMark,
        scoreComponents,
        passMark,
        conditionalMark,
        weight: clampNumber(payload.weight, 0, 100, 1)
      }
    },
    rosterSummary: buildSessionRosterSummary({ memberships }),
    sampleMemberships: memberships.slice(0, 10).map(formatMembership)
  };
}

async function createExamSession(payload = {}, actorUserId = null, actorRole = '') {
  if (normalizeText(actorRole) !== 'admin') {
    throw new Error('exam_session_admin_creation_required');
  }
  const refs = await resolveSessionReferences(payload, { id: actorUserId, role: actorRole });
  const scoring = getSessionScoringDefaults(refs.examType, payload);
  const { scoreComponents, totalMark, passMark, conditionalMark } = scoring;
  const reviewer = await resolveReviewerIdentity(payload.reviewerUserId, payload.reviewedByName);
  const code = normalizeText(payload.code).toUpperCase() || buildSessionCode({
    examType: refs.examType,
    academicYear: refs.academicYear,
    assessmentPeriod: refs.assessmentPeriod,
    schoolClass: refs.schoolClass,
    subject: refs.subject,
    monthLabel: payload.monthLabel,
    sessionKind: refs.sessionKind
  });
  const existingSession = await findExistingSessionCandidate({
    code,
    refs,
    sessionKind: refs.sessionKind,
    monthLabel: payload.monthLabel
  });
  if (existingSession) {
    throw new Error('exam_session_duplicate_scope');
  }

  const session = await ExamSession.create({
    title: buildSessionTitle({ refs, payload }),
    code,
    sessionKind: refs.sessionKind,
    examTypeId: refs.examType._id,
    academicYearId: refs.academicYear._id,
    assessmentPeriodId: refs.assessmentPeriod._id,
    classId: refs.schoolClass._id,
    subjectId: refs.subject?._id || null,
    teacherAssignmentId: refs.teacherAssignment?._id || null,
    sheetTemplateId: refs.sheetTemplate?._id || null,
    sheetTemplateVersion: Math.max(1, Number(refs.sheetTemplate?.version || 1)),
    sheetTemplateSnapshot: buildSheetTemplateSnapshot(refs.sheetTemplate),
    rankingRuleId: refs.rankingRule?._id || null,
    status: normalizeSessionStatus(payload.status, 'draft'),
    heldAt: toDateOrNull(payload.heldAt),
    publishedAt: toDateOrNull(payload.publishedAt),
    monthLabel: normalizeText(payload.monthLabel),
    reviewerUserId: reviewer.reviewerUserId,
    reviewedByName: reviewer.reviewedByName,
    createdBy: normalizeNullableId(actorUserId),
    note: normalizeText(payload.note)
  });

  const defaultMark = await ExamDefaultMark.create({
    sessionId: session._id,
    examTypeId: refs.examType._id,
    academicYearId: refs.academicYear._id,
    assessmentPeriodId: refs.assessmentPeriod._id,
    classId: refs.schoolClass._id,
    subjectId: refs.subject?._id || null,
    totalMark,
    scoreComponents,
    passMark,
    conditionalMark,
    weight: clampNumber(payload.weight, 0, 100, 1),
    note: normalizeText(payload.defaultMarkNote)
  });

  session.defaultMarkId = defaultMark._id;
  await session.save();

  const populated = await loadExamSessionWithRelations(session._id);
  return formatExamSession(populated);
}

async function initializeSessionRoster(sessionId, actorUserId = null, options = {}) {
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }
  if (session.rosterFrozenAt && options.allowFrozen !== true) {
    throw new Error('exam_roster_frozen');
  }

  const memberships = await listEligibleMembershipsForSessionContext({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    classId: session.classId?._id || session.classId
  });
  const existingMarks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
  const existingIds = new Set(existingMarks.map((item) => String(item.studentMembershipId || '')).filter(Boolean));
  const defaultTotalMark = Number(session.defaultMarkId?.totalMark || session.examTypeId?.defaultTotalMark || 100);
  const now = new Date();
  const effectiveAt = toDateOrNull(session.heldAt) || now;
  const suspensionMembershipIds = memberships.map((membership) => membership._id).filter(Boolean);
  const suspensions = suspensionMembershipIds.length
    ? await StudentSuspension.find({
        membershipId: { $in: suspensionMembershipIds },
        status: { $ne: 'cancelled' },
        startsAt: { $lte: effectiveAt },
        $and: [
          { $or: [{ endsAt: null }, { endsAt: { $gt: effectiveAt } }] },
          { $or: [{ liftedAt: null }, { liftedAt: { $gt: effectiveAt } }] }
        ]
      }).select('membershipId').lean()
    : [];
  const suspendedMembershipIds = new Set(suspensions.map((item) => String(item.membershipId)));

  const payloads = memberships
    .filter((membership) => !existingIds.has(String(membership._id)))
    .filter(() => options.allowRevisionAdditions === true || !(session.supersedesSessionId && existingMarks.length))
    .map((membership) => {
      const membershipSnapshot = buildMembershipSnapshot(membership, effectiveAt, {
        suspended: suspendedMembershipIds.has(String(membership._id)),
        forceCurrent: isCurrentGradeableMembership(membership)
      });
      return {
        sessionId: session._id,
        examTypeId: session.examTypeId?._id || session.examTypeId,
        academicYearId: session.academicYearId?._id || session.academicYearId,
        assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
        classId: session.classId?._id || session.classId,
        subjectId: session.subjectId?._id || session.subjectId || null,
        studentMembershipId: membership._id,
        studentId: membership.studentId?._id || membership.studentId || null,
        student: membership.student?._id || membership.student || null,
        membershipSnapshot,
        markStatus: membershipSnapshot.status === 'suspended'
          ? 'excused'
          : (membershipSnapshot.isCurrent ? 'pending' : 'not_applicable'),
        obtainedMark: 0,
        totalMark: defaultTotalMark,
        note: 'initialized_roster',
        enteredBy: normalizeNullableId(actorUserId),
        enteredAt: now,
        updatedBy: normalizeNullableId(actorUserId)
      };
    });

  if (payloads.length) {
    try {
      await ExamMark.insertMany(payloads, { ordered: false });
    } catch (error) {
      const duplicateOnly = error?.code === 11000 || Array.isArray(error?.writeErrors);
      if (!duplicateOnly) throw error;
    }
  }

  if (options.freeze === true && !session.rosterFrozenAt) {
    session.rosterFrozenAt = now;
    session.rosterFrozenBy = normalizeNullableId(actorUserId);
    await session.save();
  }

  const recompute = await recomputeSessionResults(session._id, { allowLocked: true });
  const marks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
  const results = await ExamResult.find({ sessionId: session._id }).select('studentMembershipId').lean();

  return {
    session: formatExamSession(session),
    summary: buildSessionRosterSummary({ memberships, marks, results, createdMarks: payloads.length }),
    sampleMemberships: memberships.slice(0, 10).map(formatMembership),
    warnings: memberships.length ? [] : ['no_memberships_in_class_year'],
    recompute: recompute.summary
  };
}

async function syncSessionRoster(sessionId, actorUserId = null, actorRole = '') {
  if (normalizeText(actorRole) !== 'admin') {
    throw new Error('exam_session_admin_approval_required');
  }
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }
  if (!['draft', 'active'].includes(normalizeSessionStatus(session.status, 'draft'))) {
    throw new Error('exam_roster_sync_locked');
  }

  return initializeSessionRoster(session._id, actorUserId, {
    allowFrozen: true,
    allowRevisionAdditions: true
  });
}

async function getSessionRosterStatus(sessionId) {
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const memberships = await listEligibleMembershipsForSessionContext({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    classId: session.classId?._id || session.classId
  });
  const marks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
  const results = await ExamResult.find({ sessionId: session._id }).select('studentMembershipId').lean();
  const markIds = new Set(marks.map((item) => String(item.studentMembershipId || '')).filter(Boolean));

  return {
    session: formatExamSession(session),
    summary: buildSessionRosterSummary({ memberships, marks, results }),
    sampleMemberships: memberships.slice(0, 10).map(formatMembership),
    missingMemberships: memberships.filter((item) => !markIds.has(String(item._id))).slice(0, 10).map(formatMembership)
  };
}

async function bootstrapExamSession(payload = {}, actorUserId = null, actorRole = '') {
  const preview = await previewExamSessionBootstrap(payload, { id: actorUserId, role: actorRole });
  if (preview.existingSession) {
    throw new Error('exam_session_duplicate_scope');
  }

  const session = await createExamSession(payload, actorUserId, actorRole);
  const roster = payload.initializeRoster === false
    ? null
    : await initializeSessionRoster(session.id, actorUserId, {
        freeze: ['active', 'submitted'].includes(normalizeText(session.status))
      });

  return {
    preview,
    session,
    roster
  };
}

async function listExamSessions(filters = {}) {
  const query = {};
  const requestedPagination = filters.page !== undefined
    || filters.limit !== undefined
    || normalizeText(filters.paginated).toLowerCase() === 'true';
  const requestedPage = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const requestedLimit = Math.min(100, Math.max(5, Number.parseInt(filters.limit, 10) || 20));
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.assessmentPeriodId)) query.assessmentPeriodId = filters.assessmentPeriodId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.subjectId)) query.subjectId = filters.subjectId;
  if (normalizeNullableId(filters.examTypeId)) query.examTypeId = filters.examTypeId;
  if (normalizeNullableId(filters.teacherAssignmentId)) query.teacherAssignmentId = filters.teacherAssignmentId;
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.monthLabel)) query.monthLabel = normalizeText(filters.monthLabel);
  if (normalizeText(filters.sessionKind)) query.sessionKind = normalizeSessionKind(filters.sessionKind);

  const submittedFrom = normalizeText(filters.submittedFrom);
  const submittedTo = normalizeText(filters.submittedTo);
  if (submittedFrom || submittedTo) {
    const submittedAt = {};
    const fromDate = submittedFrom ? new Date(`${submittedFrom}T00:00:00.000Z`) : null;
    const toDate = submittedTo ? new Date(`${submittedTo}T00:00:00.000Z`) : null;
    if (fromDate && !Number.isNaN(fromDate.getTime())) submittedAt.$gte = fromDate;
    if (toDate && !Number.isNaN(toDate.getTime())) {
      toDate.setUTCDate(toDate.getUTCDate() + 1);
      submittedAt.$lt = toDate;
    }
    if (Object.keys(submittedAt).length) query.submittedAt = submittedAt;
  }

  if (normalizeNullableId(filters.teacherUserId)) {
    const assignmentIds = await TeacherAssignment.find({ teacherUserId: filters.teacherUserId }).distinct('_id');
    if (!assignmentIds.length) {
      return requestedPagination
        ? {
            items: [],
            pagination: { page: 1, limit: requestedLimit, total: 0, pages: 0, hasNext: false, hasPrevious: false },
            counts: { submitted: 0 }
          }
        : [];
    }

    if (query.teacherAssignmentId) {
      const requestedAssignmentId = String(query.teacherAssignmentId);
      const isOwnedAssignment = assignmentIds.some((item) => String(item) === requestedAssignmentId);
      if (!isOwnedAssignment) {
        return requestedPagination
          ? {
              items: [],
              pagination: { page: 1, limit: requestedLimit, total: 0, pages: 0, hasNext: false, hasPrevious: false },
              counts: { submitted: 0 }
            }
          : [];
      }
    } else {
      query.teacherAssignmentId = { $in: assignmentIds };
    }
  }

  const searchText = normalizeText(filters.q);
  if (searchText) {
    const searchPattern = new RegExp(escapeRegex(searchText), 'i');
    const [yearIds, periodIds, classIds, subjectIds, examTypeIds, teacherUserIds] = await Promise.all([
      AcademicYear.find({ $or: [{ title: searchPattern }, { code: searchPattern }] }).distinct('_id'),
      AcademicTerm.find({ $or: [{ title: searchPattern }, { code: searchPattern }] }).distinct('_id'),
      SchoolClass.find({ $or: [{ title: searchPattern }, { code: searchPattern }] }).distinct('_id'),
      Subject.find({ $or: [{ name: searchPattern }, { code: searchPattern }] }).distinct('_id'),
      ExamType.find({ $or: [{ title: searchPattern }, { code: searchPattern }] }).distinct('_id'),
      User.find({ $or: [{ name: searchPattern }, { email: searchPattern }] }).distinct('_id')
    ]);
    const matchingAssignmentIds = teacherUserIds.length
      ? await TeacherAssignment.find({ teacherUserId: { $in: teacherUserIds } }).distinct('_id')
      : [];
    query.$or = [
      { title: searchPattern },
      { code: searchPattern },
      { monthLabel: searchPattern },
      ...(yearIds.length ? [{ academicYearId: { $in: yearIds } }] : []),
      ...(periodIds.length ? [{ assessmentPeriodId: { $in: periodIds } }] : []),
      ...(classIds.length ? [{ classId: { $in: classIds } }] : []),
      ...(subjectIds.length ? [{ subjectId: { $in: subjectIds } }] : []),
      ...(examTypeIds.length ? [{ examTypeId: { $in: examTypeIds } }] : []),
      ...(matchingAssignmentIds.length ? [{ teacherAssignmentId: { $in: matchingAssignmentIds } }] : [])
    ];
  }

  const sortMode = normalizeText(filters.sort).toLowerCase();
  const sort = sortMode === 'newest'
    ? { submittedAt: -1, createdAt: -1 }
    : sortMode === 'exam_date_asc'
      ? { heldAt: 1, createdAt: 1 }
      : sortMode === 'exam_date_desc'
        ? { heldAt: -1, createdAt: -1 }
        : normalizeText(filters.status) === 'submitted'
          ? { submittedAt: 1, createdAt: 1 }
          : { heldAt: -1, createdAt: -1, monthLabel: -1 };

  let pagination = null;
  if (requestedPagination) {
    const submittedQuery = { ...query, status: 'submitted' };
    const total = await ExamSession.countDocuments(query);
    const submittedTotal = normalizeText(filters.status) === 'submitted'
      ? total
      : await ExamSession.countDocuments(submittedQuery);
    const pages = total > 0 ? Math.ceil(total / requestedLimit) : 0;
    const page = pages > 0 ? Math.min(requestedPage, pages) : 1;
    pagination = {
      page,
      limit: requestedLimit,
      total,
      pages,
      hasNext: page < pages,
      hasPrevious: page > 1,
      submittedTotal
    };
  }

  let itemsQuery = ExamSession.find(query)
    .populate('examTypeId')
    .populate('academicYearId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] })
    .populate('sheetTemplateId')
    .populate('defaultMarkId')
    .populate('rankingRuleId')
    .sort(sort);

  if (pagination) {
    itemsQuery = itemsQuery
      .skip((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit);
  }

  const items = await itemsQuery;

  if (pagination) {
    return {
      items: items.map(formatExamSession),
      pagination,
      counts: { submitted: pagination.submittedTotal }
    };
  }

  return items.map(formatExamSession);
}

async function getExamSessionManagementState(sessionId) {
  if (!normalizeNullableId(sessionId)) {
    throw new Error('exam_session_not_found');
  }
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const [
    markCount,
    substantiveMarkCount,
    resultCount,
    resultTableCount,
    promotionCount,
    templateFilterCount,
    dependentSessionCount
  ] = await Promise.all([
    ExamMark.countDocuments({ sessionId: session._id }),
    ExamMark.countDocuments({
      sessionId: session._id,
      $or: [
        { markStatus: 'recorded' },
        { markStatus: { $in: ['absent', 'excused'] }, note: { $ne: 'initialized_roster' } }
      ]
    }),
    ExamResult.countDocuments({ sessionId: session._id }),
    ResultTable.countDocuments({ $or: [{ sessionId: session._id }, { sourceSessionIds: session._id }] }),
    PromotionTransaction.countDocuments({ sessionId: session._id }),
    SheetTemplate.countDocuments({ 'filters.examId': session._id }),
    ExamSession.countDocuments({
      _id: { $ne: session._id },
      $or: [
        { revisionRootSessionId: session._id },
        { supersedesSessionId: session._id },
        { replacedBySessionId: session._id }
      ]
    })
  ]);

  const status = normalizeSessionStatus(session.status, 'draft');
  const editableStatus = ['draft', 'active'].includes(status);
  const hasExternalReferences = resultTableCount > 0
    || resultCount > 0
    || promotionCount > 0
    || templateFilterCount > 0
    || dependentSessionCount > 0;
  const canEditStructure = editableStatus && substantiveMarkCount === 0 && !hasExternalReferences;
  const canHardDelete = status === 'draft' && substantiveMarkCount === 0 && !hasExternalReferences;
  const canArchive = status !== 'archived' && promotionCount === 0;
  const blockers = [];
  if (!editableStatus) blockers.push('exam_session_locked');
  if (substantiveMarkCount > 0) blockers.push('exam_session_has_recorded_marks');
  if (resultCount > 0) blockers.push('exam_session_has_results');
  if (resultTableCount > 0) blockers.push('exam_session_has_result_tables');
  if (promotionCount > 0) blockers.push('exam_session_has_promotions');
  if (templateFilterCount > 0) blockers.push('exam_session_used_by_template');
  if (dependentSessionCount > 0) blockers.push('exam_session_has_revisions');

  return {
    item: formatExamSession(session),
    summary: {
      markCount,
      substantiveMarkCount,
      resultCount,
      resultTableCount,
      promotionCount,
      templateFilterCount,
      dependentSessionCount
    },
    permissions: {
      canEditMetadata: editableStatus,
      canEditStructure,
      canHardDelete,
      canArchive,
      canCreateRevision: ['approved', 'published', 'closed'].includes(status),
      canReturnForCorrection: status === 'submitted'
    },
    blockers
  };
}

async function updateExamSession(sessionId, payload = {}, actorUserId = null, actorRole = '') {
  if (normalizeText(actorRole) !== 'admin') {
    throw new Error('exam_session_admin_approval_required');
  }
  const source = await loadExamSessionWithRelations(sessionId);
  if (!source) {
    throw new Error('exam_session_not_found');
  }
  const management = await getExamSessionManagementState(sessionId);
  if (!management.permissions.canEditMetadata) {
    throw new Error('exam_session_edit_locked');
  }

  const existingComponents = getScoreComponents(source.defaultMarkId || {});
  const mergedPayload = {
    sessionKind: source.sessionKind,
    examTypeId: payload.examTypeId || source.examTypeId?._id || source.examTypeId,
    academicYearId: payload.academicYearId || source.academicYearId?._id || source.academicYearId,
    assessmentPeriodId: payload.assessmentPeriodId || source.assessmentPeriodId?._id || source.assessmentPeriodId,
    classId: payload.classId || source.classId?._id || source.classId,
    subjectId: payload.subjectId || source.subjectId?._id || source.subjectId,
    teacherAssignmentId: payload.teacherAssignmentId !== undefined
      ? payload.teacherAssignmentId
      : (source.teacherAssignmentId?._id || source.teacherAssignmentId),
    sheetTemplateId: payload.sheetTemplateId !== undefined
      ? payload.sheetTemplateId
      : (source.sheetTemplateId?._id || source.sheetTemplateId),
    rankingRuleId: source.rankingRuleId?._id || source.rankingRuleId,
    monthLabel: payload.monthLabel !== undefined ? payload.monthLabel : source.monthLabel,
    scoreComponents: payload.scoreComponents || existingComponents
  };
  const refs = await resolveSessionReferences(mergedPayload, { id: actorUserId, role: actorRole });
  if (!refs.teacherAssignment) {
    throw new Error('exam_session_teacher_assignment_required');
  }

  const sourceIds = {
    examTypeId: String(source.examTypeId?._id || source.examTypeId || ''),
    academicYearId: String(source.academicYearId?._id || source.academicYearId || ''),
    assessmentPeriodId: String(source.assessmentPeriodId?._id || source.assessmentPeriodId || ''),
    classId: String(source.classId?._id || source.classId || ''),
    subjectId: String(source.subjectId?._id || source.subjectId || '')
  };
  const nextIds = {
    examTypeId: String(refs.examType?._id || ''),
    academicYearId: String(refs.academicYear?._id || ''),
    assessmentPeriodId: String(refs.assessmentPeriod?._id || ''),
    classId: String(refs.schoolClass?._id || ''),
    subjectId: String(refs.subject?._id || '')
  };
  const examTypeChanged = sourceIds.examTypeId !== nextIds.examTypeId;
  const scoringWasRequested = payload.scoreComponents !== undefined || examTypeChanged;
  const scoring = scoringWasRequested
    ? getSessionScoringDefaults(refs.examType, mergedPayload)
    : {
        totalMark: Number(source.defaultMarkId?.totalMark || Object.values(existingComponents).reduce((sum, value) => sum + Number(value || 0), 0)),
        scoreComponents: existingComponents,
        passMark: Number(source.defaultMarkId?.passMark || 0),
        conditionalMark: Number(source.defaultMarkId?.conditionalMark || 0)
      };
  const structuralChange = Object.keys(sourceIds).some((key) => sourceIds[key] !== nextIds[key])
    || JSON.stringify(existingComponents) !== JSON.stringify(scoring.scoreComponents);
  if (structuralChange && !management.permissions.canEditStructure) {
    throw new Error('exam_session_structural_edit_blocked');
  }

  const monthChanged = normalizeText(source.monthLabel) !== normalizeText(mergedPayload.monthLabel);
  const identityChange = structuralChange || monthChanged;
  const nextCode = identityChange
    ? buildSessionCode({
      examType: refs.examType,
      academicYear: refs.academicYear,
      assessmentPeriod: refs.assessmentPeriod,
      schoolClass: refs.schoolClass,
      subject: refs.subject,
      monthLabel: mergedPayload.monthLabel,
      sessionKind: source.sessionKind
    })
    : normalizeText(source.code);
  const duplicate = await findExistingSessionCandidate({
    code: nextCode,
    refs,
    sessionKind: source.sessionKind,
    monthLabel: mergedPayload.monthLabel
  });
  if (duplicate && String(duplicate._id) !== String(source._id)) {
    throw new Error('exam_session_duplicate_scope');
  }

  const reviewerIdWasProvided = payload.reviewerUserId !== undefined;
  const reviewer = await resolveReviewerIdentity(
    reviewerIdWasProvided
      ? payload.reviewerUserId
      : (source.reviewerUserId?._id || source.reviewerUserId),
    payload.reviewedByName !== undefined
      ? payload.reviewedByName
      : (reviewerIdWasProvided ? '' : source.reviewedByName)
  );
  const heldAt = payload.heldAt !== undefined ? toDateOrNull(payload.heldAt) : source.heldAt;
  if (payload.heldAt && !heldAt) {
    throw new Error('exam_session_invalid_date');
  }

  const dbSession = await mongoose.startSession();
  try {
    await dbSession.withTransaction(async () => {
      const current = await ExamSession.findById(source._id).session(dbSession);
      if (!current || !['draft', 'active'].includes(normalizeSessionStatus(current.status, 'draft'))) {
        throw new Error('exam_session_edit_locked');
      }

      current.examTypeId = refs.examType._id;
      current.academicYearId = refs.academicYear._id;
      current.assessmentPeriodId = refs.assessmentPeriod._id;
      current.classId = refs.schoolClass._id;
      current.subjectId = refs.subject?._id || null;
      current.teacherAssignmentId = refs.teacherAssignment._id;
      if (payload.sheetTemplateId !== undefined || current.sheetTemplateId) {
        current.sheetTemplateId = refs.sheetTemplate?._id || null;
        current.sheetTemplateVersion = Math.max(1, Number(refs.sheetTemplate?.version || current.sheetTemplateVersion || 1));
        current.sheetTemplateSnapshot = buildSheetTemplateSnapshot(refs.sheetTemplate) || current.sheetTemplateSnapshot;
      }
      current.heldAt = heldAt;
      current.monthLabel = normalizeText(mergedPayload.monthLabel);
      current.reviewerUserId = reviewer.reviewerUserId;
      current.reviewedByName = reviewer.reviewedByName;
      if (payload.note !== undefined) current.note = normalizeText(payload.note);
      if (identityChange) {
        current.code = nextCode;
        current.title = buildSessionTitle({ refs, payload: { sessionKind: source.sessionKind, monthLabel: mergedPayload.monthLabel } });
      }
      if (structuralChange) {
        current.rosterFrozenAt = null;
        current.rosterFrozenBy = null;
        await ExamMark.deleteMany({ sessionId: current._id }).session(dbSession);
        await ExamResult.deleteMany({ sessionId: current._id }).session(dbSession);
      }
      await current.save({ session: dbSession });

      await ExamDefaultMark.findOneAndUpdate(
        { sessionId: current._id },
        {
          examTypeId: refs.examType._id,
          academicYearId: refs.academicYear._id,
          assessmentPeriodId: refs.assessmentPeriod._id,
          classId: refs.schoolClass._id,
          subjectId: refs.subject?._id || null,
          totalMark: scoring.totalMark,
          scoreComponents: scoring.scoreComponents,
          passMark: scoring.passMark,
          conditionalMark: scoring.conditionalMark
        },
        { new: true, runValidators: true, session: dbSession }
      );
    });
  } finally {
    await dbSession.endSession();
  }

  if (structuralChange) {
    await initializeSessionRoster(source._id, actorUserId, {
      freeze: normalizeSessionStatus(source.status, 'draft') === 'active'
    });
  }
  const item = await loadExamSessionWithRelations(source._id);
  return {
    item: formatExamSession(item),
    management: await getExamSessionManagementState(source._id)
  };
}

async function deleteExamSession(sessionId, actorUserId = null, actorRole = '') {
  if (normalizeText(actorRole) !== 'admin') {
    throw new Error('exam_session_admin_approval_required');
  }
  const management = await getExamSessionManagementState(sessionId);
  if (!management.permissions.canHardDelete) {
    throw new Error('exam_session_delete_blocked');
  }

  const dbSession = await mongoose.startSession();
  let deletedMarks = 0;
  let deletedResults = 0;
  try {
    await dbSession.withTransaction(async () => {
      const current = await ExamSession.findOne({ _id: sessionId, status: 'draft' }).session(dbSession);
      if (!current) throw new Error('exam_session_delete_blocked');

      const [substantiveMarkCount, resultCount, resultTableCount, promotionCount, templateFilterCount, dependentSessionCount] = await Promise.all([
        ExamMark.countDocuments({
          sessionId: current._id,
          $or: [
            { markStatus: 'recorded' },
            { markStatus: { $in: ['absent', 'excused'] }, note: { $ne: 'initialized_roster' } }
          ]
        }).session(dbSession),
        ExamResult.countDocuments({ sessionId: current._id }).session(dbSession),
        ResultTable.countDocuments({ $or: [{ sessionId: current._id }, { sourceSessionIds: current._id }] }).session(dbSession),
        PromotionTransaction.countDocuments({ sessionId: current._id }).session(dbSession),
        SheetTemplate.countDocuments({ 'filters.examId': current._id }).session(dbSession),
        ExamSession.countDocuments({
          _id: { $ne: current._id },
          $or: [
            { revisionRootSessionId: current._id },
            { supersedesSessionId: current._id },
            { replacedBySessionId: current._id }
          ]
        }).session(dbSession)
      ]);
      if (substantiveMarkCount || resultCount || resultTableCount || promotionCount || templateFilterCount || dependentSessionCount) {
        throw new Error('exam_session_delete_blocked');
      }

      const markDelete = await ExamMark.deleteMany({ sessionId: current._id }).session(dbSession);
      const resultDelete = await ExamResult.deleteMany({ sessionId: current._id }).session(dbSession);
      deletedMarks = Number(markDelete.deletedCount || 0);
      deletedResults = Number(resultDelete.deletedCount || 0);
      await ExamDefaultMark.deleteMany({ $or: [{ sessionId: current._id }, { _id: current.defaultMarkId }] }).session(dbSession);
      const deletion = await ExamSession.deleteOne({ _id: current._id, status: 'draft' }).session(dbSession);
      if (Number(deletion.deletedCount || 0) !== 1) {
        throw new Error('exam_session_delete_blocked');
      }
    });
  } finally {
    await dbSession.endSession();
  }

  return {
    deletedId: String(sessionId),
    title: normalizeText(management.item?.title),
    summary: { deletedMarks, deletedResults },
    deletedBy: normalizeNullableId(actorUserId) ? String(actorUserId) : ''
  };
}

async function recomputeSessionResults(sessionId, options = {}) {
  const session = await ExamSession.findById(sessionId)
    .populate('examTypeId')
    .populate('rankingRuleId')
    .populate('defaultMarkId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('subjectId')
    .populate('sheetTemplateId');
  if (!session) {
    throw new Error('exam_session_not_found');
  }
  if (['submitted', 'approved', 'published', 'archived', 'closed'].includes(normalizeText(session.status))
    && options.allowLocked !== true) {
    throw new Error('exam_session_locked');
  }

  const rankingRule = session.rankingRuleId || await findBestRankingRule({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
    classId: session.classId?._id || session.classId,
    examTypeId: session.examTypeId?._id || session.examTypeId
  });

  const marks = await ExamMark.find({ sessionId: session._id })
    .populate({ path: 'studentMembershipId', populate: [{ path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }] })
    .populate('student', 'name email')
    .sort({ percentage: -1, createdAt: 1 });

  if (!marks.length) {
    await ExamResult.deleteMany({ sessionId: session._id });
    return { session: formatExamSession(session), summary: { marks: 0, results: 0, ranked: 0 } };
  }

  const rankedMarks = marks.filter((mark) => mark.markStatus === 'recorded' && session.examTypeId?.isRankingEnabled !== false);
  const competitionRanks = computeCompetitionRanks(rankedMarks, (mark) => Number(mark.percentage || 0));
  const rankMap = new Map(rankedMarks.map((mark) => [String(mark._id), competitionRanks.get(mark)]));

  for (const mark of marks) {
    const percentage = Number(mark.percentage || 0);
    const markStatus = normalizeText(mark.markStatus);
    const resultStatus = computeResultStatus({
      examType: session.examTypeId,
      rankingRule,
      defaultMark: session.defaultMarkId,
      percentage,
      obtainedMark: mark.obtainedMark,
      markStatus
    });
    const rank = rankMap.get(String(mark._id)) || null;
    const groupLabel = markStatus === 'recorded' ? computeGroupLabel(rankingRule, percentage) : '';

    await ExamResult.findOneAndUpdate(
      { sessionId: session._id, studentMembershipId: mark.studentMembershipId?._id || mark.studentMembershipId },
      {
        examTypeId: session.examTypeId?._id || session.examTypeId,
        academicYearId: session.academicYearId?._id || session.academicYearId,
        assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
        classId: session.classId?._id || session.classId,
        subjectId: session.subjectId?._id || session.subjectId || null,
        studentMembershipId: mark.studentMembershipId?._id || mark.studentMembershipId,
        studentId: mark.studentId || mark.studentMembershipId?.studentId || null,
        student: mark.student || mark.studentMembershipId?.student || null,
        membershipSnapshot: mark.membershipSnapshot || buildMembershipSnapshot(mark.studentMembershipId || {}, session.heldAt),
        markStatus,
        scoreBreakdown: getSessionScoreBreakdown(session, mark),
        obtainedMark: mark.obtainedMark,
        totalMark: mark.totalMark,
        percentage,
        averageMark: percentage,
        resultStatus,
        groupLabel,
        rank,
        rankingRuleId: rankingRule?._id || null,
        computedAt: new Date(),
        engineVersion: OFFICIAL_RESULT_POLICY_VERSION
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await ExamResult.deleteMany({
    sessionId: session._id,
    studentMembershipId: { $nin: marks.map((item) => item.studentMembershipId?._id || item.studentMembershipId) }
  });

  return {
    session: formatExamSession(session),
    summary: {
      marks: marks.length,
      results: marks.length,
      ranked: rankedMarks.length
    }
  };
}
function emptyScoreBreakdown() {
  return SCORE_COMPONENT_FIELDS.reduce((acc, item) => {
    acc[item.scoreKey] = null;
    return acc;
  }, {});
}

async function loadSessionForMarkMutation(sessionId) {
  return ExamSession.findById(sessionId)
    .populate('examTypeId')
    .populate('defaultMarkId')
    .populate('rankingRuleId')
    .populate('academicYearId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .populate('sheetTemplateId')
    .populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
}

async function loadMembershipForSession(studentMembershipId) {
  return StudentMembership.findById(studentMembershipId)
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('studentId')
    .populate('student', 'name email');
}

function assertMembershipMatchesSession(membership, session) {
  if (!membership) {
    throw new Error('exam_membership_not_found');
  }
  if (String(membership.classId?._id || membership.classId || '') !== String(session.classId?._id || session.classId || '')) {
    throw new Error('exam_membership_class_mismatch');
  }
  if (String(membership.academicYearId?._id || membership.academicYearId || '') !== String(session.academicYearId?._id || session.academicYearId || '')) {
    throw new Error('exam_membership_year_mismatch');
  }
}

function normalizeMarkStatus(value = '', fallback = 'recorded') {
  const normalized = normalizeText(value);
  return ['recorded', 'absent', 'excused', 'pending', 'not_applicable'].includes(normalized) ? normalized : fallback;
}

function assertSessionEditable(session) {
  const status = normalizeText(session?.status);
  if (['submitted', 'approved', 'published', 'archived', 'closed'].includes(status)) {
    throw new Error('exam_session_locked');
  }
}

async function persistExamMark({ session, membership, payload = {}, actorUserId = null } = {}) {
  const markFilter = { sessionId: session._id, studentMembershipId: membership._id };
  const existingMark = await ExamMark.findOne(markFilter).select('membershipSnapshot').lean();
  if (session.rosterFrozenAt && !existingMark) {
    throw new Error('exam_membership_not_in_frozen_roster');
  }
  const refreshCurrentSnapshot = isCurrentGradeableMembership(membership)
    && existingMark?.membershipSnapshot?.isCurrent === false;
  const membershipSnapshot = normalizeText(existingMark?.membershipSnapshot?.status) && !refreshCurrentSnapshot
    ? existingMark.membershipSnapshot
    : buildMembershipSnapshot(membership, session.heldAt, {
        forceCurrent: isCurrentGradeableMembership(membership)
      });
  const requestedMarkStatus = normalizeMarkStatus(payload.markStatus, 'recorded');
  const markStatus = membershipSnapshot.status === 'suspended'
    ? 'excused'
    : (membershipSnapshot.isCurrent === false ? 'not_applicable' : requestedMarkStatus);
  const scoreComponents = getSessionScoreComponents(session);
  const hasBreakdown = getScoreComponentTotal(scoreComponents) > 0;
  const totalMark = getScoreComponentTotal(scoreComponents)
    || clampNumber(payload.totalMark, 1, 1000, Number(session.defaultMarkId?.totalMark || session.examTypeId?.defaultTotalMark || 100));
  const scoreBreakdown = markStatus === 'recorded' && hasBreakdown
    ? buildScoreBreakdownFromPayload(payload, scoreComponents)
    : emptyScoreBreakdown();

  const obtainedMark = markStatus === 'recorded'
    ? (
        hasBreakdown
          ? getScoreBreakdownTotal(scoreBreakdown)
          : clampNumber(payload.obtainedMark, 0, totalMark, null)
      )
    : 0;
  if (markStatus === 'recorded' && obtainedMark === null) {
    throw new Error('exam_mark_invalid_score');
  }

  const mark = await ExamMark.findOneAndUpdate(
    markFilter,
    {
      examTypeId: session.examTypeId?._id || session.examTypeId,
      academicYearId: session.academicYearId?._id || session.academicYearId,
      assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
      classId: session.classId?._id || session.classId,
      subjectId: session.subjectId?._id || session.subjectId || null,
      studentMembershipId: membership._id,
      studentId: membership.studentId?._id || membership.studentId || null,
      student: membership.student?._id || membership.student || null,
      membershipSnapshot,
      markStatus,
      scoreBreakdown,
      obtainedMark,
      totalMark,
      note: normalizeText(payload.note),
      enteredBy: normalizeNullableId(actorUserId),
      enteredAt: new Date(),
      updatedBy: normalizeNullableId(actorUserId)
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
    .populate({ path: 'studentMembershipId', populate: [{ path: 'studentId' }, { path: 'student', select: 'name email' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }] })
    .populate('student', 'name email');

  return mark;
}

async function upsertExamMark(payload = {}, actorUserId = null) {
  const sessionId = normalizeNullableId(payload.sessionId);
  const studentMembershipId = normalizeNullableId(payload.studentMembershipId);
  if (!sessionId || !studentMembershipId) {
    throw new Error('exam_mark_missing_required_refs');
  }

  const session = await loadSessionForMarkMutation(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }
  assertSessionEditable(session);

  const membership = await loadMembershipForSession(studentMembershipId);
  assertMembershipMatchesSession(membership, session);

  const mark = await persistExamMark({ session, membership, payload, actorUserId });
  const recompute = await recomputeSessionResults(session._id);
  const result = await ExamResult.findOne({ sessionId: session._id, studentMembershipId: membership._id })
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', { path: 'assessmentPeriodId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, 'subjectId', 'defaultMarkId', 'rankingRuleId'] })
    .populate('examTypeId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId');

  return {
    mark: formatExamMark(mark, session),
    result: formatExamResult(result),
    summary: recompute.summary
  };
}

async function saveExamSheetMarks(sessionId, payload = {}, actorUserId = null) {
  const session = await loadSessionForMarkMutation(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }
  assertSessionEditable(session);

  const entries = Array.isArray(payload?.items) ? payload.items : [];
  if (!entries.length) {
    throw new Error('exam_sheet_marks_required');
  }

  if (!session.rosterFrozenAt) {
    const initialized = await initializeSessionRoster(session._id, actorUserId, {
      freeze: normalizeText(session.status) === 'active'
    });
    if (initialized?.session?.rosterFrozenAt) {
      session.rosterFrozenAt = initialized.session.rosterFrozenAt;
    }
  }

  for (const entry of entries) {
    const membershipId = normalizeNullableId(entry?.studentMembershipId);
    if (!membershipId) continue;
    const membership = await loadMembershipForSession(membershipId);
    assertMembershipMatchesSession(membership, session);
    await persistExamMark({
      session,
      membership,
      payload: {
        markStatus: entry.markStatus,
        note: entry.note,
        obtainedMark: entry.obtainedMark,
        totalMark: entry.totalMark,
        scoreBreakdown: entry.scoreBreakdown || entry
      },
      actorUserId
    });
  }

  const recompute = await recomputeSessionResults(session._id);
  const data = await getSessionMarks(session._id);
  return {
    ...data,
    recompute: recompute.summary
  };
}

async function refreshSessionAttendanceScores(session, actorUserId = null) {
  const scoreComponents = getSessionScoreComponents(session);
  const attendanceMax = Number(scoreComponents.attendanceMax || 0);
  if (attendanceMax <= 0) return { updated: 0, missing: 0 };

  const dateFrom = toDateOrNull(session.assessmentPeriodId?.startDate)
    || toDateOrNull(session.academicYearId?.startDate)
    || null;
  const dateTo = toDateOrNull(session.heldAt)
    || toDateOrNull(session.assessmentPeriodId?.endDate)
    || new Date();
  const marks = await ExamMark.find({ sessionId: session._id, markStatus: 'recorded' });
  let updated = 0;
  let missing = 0;

  for (const mark of marks) {
    const identityClauses = [];
    if (mark.studentMembershipId) identityClauses.push({ studentMembershipId: mark.studentMembershipId });
    if (mark.student) identityClauses.push({ student: mark.student });
    if (!identityClauses.length) {
      missing += 1;
      continue;
    }
    const records = await Attendance.find({
      $or: identityClauses,
      date: {
        ...(dateFrom ? { $gte: dateFrom } : {}),
        ...(dateTo ? { $lte: dateTo } : {})
      }
    }).select('date status').lean();
    if (!records.length) {
      missing += 1;
      continue;
    }
    const attendanceEligibleRecords = records.filter((item) => normalizeText(item.status) !== 'suspended');
    if (!attendanceEligibleRecords.length) {
      missing += 1;
      continue;
    }
    const presentRecords = attendanceEligibleRecords.filter((item) => (
      ['present', 'late', 'sick', 'leave', 'excused'].includes(normalizeText(item.status))
    )).length;
    const attendanceRate = Number(((presentRecords / attendanceEligibleRecords.length) * 100).toFixed(2));
    const attendanceScore = Number(((attendanceRate / 100) * attendanceMax).toFixed(2));
    mark.scoreBreakdown = {
      ...getScoreBreakdown(mark),
      attendanceScore
    };
    mark.attendanceSnapshot = {
      presentRecords,
      totalRecords: attendanceEligibleRecords.length,
      attendanceRate,
      dateFrom,
      dateTo,
      computedAt: new Date()
    };
    mark.updatedBy = normalizeNullableId(actorUserId);
    await mark.save();
    updated += 1;
  }
  return { updated, missing };
}

function cloneDocumentPayload(document, additionalExcluded = []) {
  const payload = toPlain(document) || {};
  ['_id', '__v', 'createdAt', 'updatedAt', ...additionalExcluded].forEach((key) => {
    delete payload[key];
  });
  return payload;
}

async function createExamSessionRevision(sessionId, payload = {}, actorUserId = null, actorRole = '') {
  if (normalizeText(actorRole) !== 'admin') {
    throw new Error('exam_session_admin_approval_required');
  }
  const source = await loadSessionForMarkMutation(sessionId);
  if (!source) {
    throw new Error('exam_session_not_found');
  }
  if (!['approved', 'published', 'closed'].includes(normalizeText(source.status))) {
    throw new Error('exam_revision_requires_locked_source');
  }

  const revisionRootSessionId = source.revisionRootSessionId?._id
    || source.revisionRootSessionId
    || source._id;
  const latest = await ExamSession.findOne({
    $or: [{ _id: revisionRootSessionId }, { revisionRootSessionId }]
  }).sort({ version: -1 }).select('version').lean();
  const nextVersion = Math.max(1, Number(latest?.version || source.version || 1)) + 1;
  const sourceCode = normalizeText(source.code) || `EXAM-${String(revisionRootSessionId).slice(-8)}`;
  const dbSession = await mongoose.startSession();
  let revisionId = null;
  let clonedMarks = 0;
  let clonedResults = 0;

  try {
    await dbSession.withTransaction(async () => {
      const [revision] = await ExamSession.create([{
        title: `${normalizeText(source.title)} (نسخه ${nextVersion})`,
        code: `${sourceCode}-V${nextVersion}`,
        sessionKind: source.sessionKind,
        examTypeId: source.examTypeId?._id || source.examTypeId,
        academicYearId: source.academicYearId?._id || source.academicYearId,
        assessmentPeriodId: source.assessmentPeriodId?._id || source.assessmentPeriodId,
        classId: source.classId?._id || source.classId,
        subjectId: source.subjectId?._id || source.subjectId || null,
        teacherAssignmentId: source.teacherAssignmentId?._id || source.teacherAssignmentId || null,
        sheetTemplateId: source.sheetTemplateId?._id || source.sheetTemplateId || null,
        sheetTemplateVersion: Math.max(1, Number(source.sheetTemplateVersion || source.sheetTemplateSnapshot?.version || 1)),
        sheetTemplateSnapshot: source.sheetTemplateSnapshot || buildSheetTemplateSnapshot(source.sheetTemplateId),
        rankingRuleId: source.rankingRuleId?._id || source.rankingRuleId || null,
        version: nextVersion,
        revisionRootSessionId,
        supersedesSessionId: source._id,
        status: 'draft',
        heldAt: source.heldAt || null,
        monthLabel: normalizeText(source.monthLabel),
        reviewedByName: '',
        reviewerUserId: null,
        createdBy: normalizeNullableId(actorUserId),
        note: normalizeText(payload.reason || payload.note)
          || `Correction revision of ${normalizeText(source.code) || String(source._id)}`
      }], { session: dbSession });

      if (source.defaultMarkId) {
        const defaultMarkPayload = cloneDocumentPayload(source.defaultMarkId, ['sessionId']);
        const [defaultMark] = await ExamDefaultMark.create([{
          ...defaultMarkPayload,
          sessionId: revision._id
        }], { session: dbSession });
        revision.defaultMarkId = defaultMark._id;
        await revision.save({ session: dbSession });
      }

      const sourceMarks = await ExamMark.find({ sessionId: source._id }).lean().session(dbSession);
      if (sourceMarks.length) {
        await ExamMark.insertMany(sourceMarks.map((mark) => ({
          ...cloneDocumentPayload(mark, ['sessionId']),
          sessionId: revision._id,
          enteredBy: normalizeNullableId(actorUserId),
          updatedBy: normalizeNullableId(actorUserId),
          enteredAt: new Date()
        })), { session: dbSession, ordered: true });
      }
      clonedMarks = sourceMarks.length;

      const sourceResults = await ExamResult.find({ sessionId: source._id }).lean().session(dbSession);
      if (sourceResults.length) {
        await ExamResult.insertMany(sourceResults.map((result) => ({
          ...cloneDocumentPayload(result, ['sessionId']),
          sessionId: revision._id,
          computedAt: new Date()
        })), { session: dbSession, ordered: true });
      }
      clonedResults = sourceResults.length;

      source.replacedBySessionId = revision._id;
      await source.save({ session: dbSession });
      revisionId = revision._id;
    });
  } finally {
    await dbSession.endSession();
  }

  const revision = await loadExamSessionWithRelations(revisionId);
  return {
    item: formatExamSession(revision),
    summary: { clonedMarks, clonedResults, version: nextVersion }
  };
}

async function updateExamSessionStatus(sessionId, payload = {}, actorUserId = null, actorRole = '') {
  const session = await loadSessionForMarkMutation(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const nextStatus = normalizeSessionStatus(payload.status, session.status);
  const currentStatus = normalizeSessionStatus(session.status, 'draft');
  const role = normalizeText(actorRole);
  const allowedTransitions = {
    draft: ['draft', 'active', 'submitted', 'archived'],
    active: ['draft', 'active', 'submitted', 'archived'],
    submitted: ['active', 'submitted', 'approved', 'archived'],
    approved: ['submitted', 'approved', 'published', 'archived'],
    closed: ['approved', 'published', 'archived'],
    published: ['published', 'archived'],
    archived: ['archived']
  };
  if (!(allowedTransitions[currentStatus] || []).includes(nextStatus)) {
    throw new Error('exam_session_invalid_status_transition');
  }
  if (['approved', 'published', 'archived'].includes(nextStatus) && role !== 'admin') {
    throw new Error('exam_session_admin_approval_required');
  }
  if (role === 'instructor' && !['draft', 'active', 'submitted'].includes(nextStatus)) {
    throw new Error('exam_session_admin_approval_required');
  }
  if (nextStatus === 'archived') {
    if (!normalizeText(payload.note)) {
      throw new Error('exam_session_archive_reason_required');
    }
    const promotionCount = await PromotionTransaction.countDocuments({ sessionId: session._id });
    if (promotionCount > 0) {
      throw new Error('exam_session_has_promotions');
    }
  }

  if (payload.reviewerUserId !== undefined || payload.reviewedByName !== undefined) {
    const reviewer = await resolveReviewerIdentity(payload.reviewerUserId, payload.reviewedByName);
    session.reviewerUserId = reviewer.reviewerUserId;
    session.reviewedByName = reviewer.reviewedByName;
  }

  if (['active', 'submitted'].includes(nextStatus) && !session.rosterFrozenAt) {
    const initialized = await initializeSessionRoster(session._id, actorUserId, { freeze: true });
    session.rosterFrozenAt = initialized?.session?.rosterFrozenAt || new Date();
    session.rosterFrozenBy = normalizeNullableId(actorUserId);
  }

  if (nextStatus === 'submitted' && !['submitted', 'approved', 'published'].includes(currentStatus)) {
    const attendance = await refreshSessionAttendanceScores(session, actorUserId);
    if (attendance.missing > 0) {
      throw new Error('exam_session_attendance_incomplete');
    }
    await recomputeSessionResults(session._id);
  }

  if (['submitted', 'approved', 'published'].includes(nextStatus)) {
    const marks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
    const results = await ExamResult.find({ sessionId: session._id }).select('studentMembershipId').lean();
    const memberships = marks.map((mark) => ({ _id: mark.studentMembershipId }));
    const rosterSummary = buildSessionRosterSummary({ memberships, marks, results });
    if (!rosterSummary.totalMarks || rosterSummary.missingMarks > 0 || rosterSummary.pendingMarks > 0) {
      throw new Error('exam_session_pending_marks');
    }
  }
  if (['approved', 'published'].includes(nextStatus) && !session.reviewerUserId && !normalizeText(session.reviewedByName)) {
    throw new Error('exam_session_reviewer_required');
  }

  session.status = nextStatus;
  if (payload.monthLabel !== undefined) {
    session.monthLabel = normalizeText(payload.monthLabel);
  }
  if (payload.note !== undefined) {
    session.note = normalizeText(payload.note);
  }
  if (nextStatus === 'published') {
    session.publishedAt = new Date();
  }
  if (nextStatus === 'submitted' && !session.submittedAt) {
    session.submittedAt = new Date();
    session.submittedBy = normalizeNullableId(actorUserId);
  }
  if (nextStatus === 'approved' && !session.approvedAt) {
    session.approvedAt = new Date();
    session.approvedBy = normalizeNullableId(actorUserId);
  }
  session.updatedBy = normalizeNullableId(actorUserId);
  await session.save();

  const populated = await loadExamSessionWithRelations(session._id);
  return formatExamSession(populated);
}

async function repairEditableRosterPlaceholders(session = {}, marks = [], results = []) {
  if (!['draft', 'active'].includes(normalizeText(session?.status))) return 0;
  const resultMap = new Map(results.map((item) => [String(item.studentMembershipId || ''), item]));
  const repairs = marks.filter((mark) => {
    const membership = mark.studentMembershipId;
    return normalizeText(mark.markStatus) === 'not_applicable'
      && normalizeText(mark.note) === 'initialized_roster'
      && isCurrentGradeableMembership(membership);
  });

  await Promise.all(repairs.map(async (mark) => {
    const membership = mark.studentMembershipId;
    const membershipId = String(membership?._id || membership || '');
    const membershipSnapshot = buildMembershipSnapshot(membership, session.heldAt, { forceCurrent: true });
    const clearedBreakdown = emptyScoreBreakdown();
    await Promise.all([
      ExamMark.updateOne(
        { _id: mark._id, markStatus: 'not_applicable', note: 'initialized_roster' },
        {
          $set: {
            membershipSnapshot,
            markStatus: 'pending',
            scoreBreakdown: clearedBreakdown,
            obtainedMark: 0,
            percentage: 0
          }
        }
      ),
      ExamResult.updateOne(
        { sessionId: session._id, studentMembershipId: membership?._id || membership },
        {
          $set: {
            membershipSnapshot,
            markStatus: 'pending',
            scoreBreakdown: clearedBreakdown,
            obtainedMark: 0,
            percentage: 0,
            averageMark: 0,
            resultStatus: 'pending',
            rank: null
          }
        }
      )
    ]);
    mark.membershipSnapshot = membershipSnapshot;
    mark.markStatus = 'pending';
    mark.scoreBreakdown = clearedBreakdown;
    mark.obtainedMark = 0;
    mark.percentage = 0;
    const result = resultMap.get(membershipId);
    if (result) {
      result.membershipSnapshot = membershipSnapshot;
      result.markStatus = 'pending';
      result.scoreBreakdown = clearedBreakdown;
      result.obtainedMark = 0;
      result.percentage = 0;
      result.averageMark = 0;
      result.resultStatus = 'pending';
      result.rank = null;
    }
  }));

  return repairs.length;
}

async function buildSessionSheetDataset(sessionId) {
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const [marks, results] = await Promise.all([
    ExamMark.find({ sessionId: session._id })
      .populate({ path: 'studentMembershipId', populate: [{ path: 'studentId' }, { path: 'afghanStudentId', select: 'personalInfo.fatherName' }, { path: 'student', select: 'name email' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }] })
      .populate('student', 'name email')
      .sort({ createdAt: 1 }),
    ExamResult.find({ sessionId: session._id }).sort({ rank: 1, percentage: -1, createdAt: 1 })
  ]);
  await repairEditableRosterPlaceholders(session, marks, results);

  // ExamMark is the immutable roster snapshot. Lifecycle changes after submission
  // must never remove a pupil from an already-created subject sheet.
  const snapshotMemberships = marks
    .map((item) => item.studentMembershipId)
    .filter((item) => item && item._id);
  const memberships = snapshotMemberships.length
    ? snapshotMemberships
    : await listEligibleMembershipsForSessionContext({
        academicYearId: session.academicYearId?._id || session.academicYearId,
        classId: session.classId?._id || session.classId
      });
  const studentIds = memberships
    .map((item) => item.studentId?._id || item.studentId || null)
    .filter(Boolean);
  const userIds = memberships
    .map((item) => item.student?._id || item.student || null)
    .filter(Boolean);
  const afghanStudentIds = memberships
    .map((item) => item.afghanStudentId?._id || item.afghanStudentId || null)
    .filter(Boolean);
  const enrollmentIdentityFilters = [
    ...(userIds.length ? [{ linkedUserId: { $in: userIds } }] : []),
    ...(afghanStudentIds.length ? [{ linkedStudentId: { $in: afghanStudentIds } }] : [])
  ];
  const [profiles, enrollments] = await Promise.all([
    StudentProfile.find({ studentId: { $in: studentIds } }).lean(),
    Enrollment.find(enrollmentIdentityFilters.length
      ? { status: 'approved', $or: enrollmentIdentityFilters }
      : { _id: null })
      .sort({ approvedAt: -1, createdAt: -1 })
      .select('linkedUserId linkedStudentId fatherName')
      .lean()
  ]);

  const markMap = new Map(marks.map((item) => [String(item.studentMembershipId?._id || item.studentMembershipId), item]));
  const resultMap = new Map(results.map((item) => [String(item.studentMembershipId), item]));
  const profileMap = new Map(profiles.map((item) => [String(item.studentId), item]));
  const enrollmentByUser = new Map();
  const enrollmentByAfghanStudent = new Map();
  enrollments.forEach((item) => {
    if (item.linkedUserId && !enrollmentByUser.has(String(item.linkedUserId))) {
      enrollmentByUser.set(String(item.linkedUserId), item);
    }
    if (item.linkedStudentId && !enrollmentByAfghanStudent.has(String(item.linkedStudentId))) {
      enrollmentByAfghanStudent.set(String(item.linkedStudentId), item);
    }
  });
  const scoreComponents = getSessionScoreComponents(session);

  return {
    session,
    memberships,
    marks,
    results,
    scoreComponents,
    items: memberships.map((membership, index) => {
      const membershipId = String(membership._id);
      const mark = markMap.get(membershipId) || null;
      const result = resultMap.get(membershipId) || null;
      const studentCore = membership.studentId || null;
      const student = membership.student || null;
      const profile = profileMap.get(String(studentCore?._id || studentCore || '')) || null;
      const enrollment = enrollmentByUser.get(String(student?._id || student || ''))
        || enrollmentByAfghanStudent.get(String(membership.afghanStudentId?._id || membership.afghanStudentId || ''))
        || null;
      const scoreBreakdown = getSessionScoreBreakdown(session, mark);
      const markStatus = normalizeText(mark?.markStatus) || 'pending';
      const recorded = markStatus === 'recorded';
      const note = sanitizeExamNote(mark?.note);
      const membershipSnapshot = mark?.membershipSnapshot || result?.membershipSnapshot || null;
      const currentMembershipStatus = normalizeText(membership?.status);
      const officialMembershipState = OFFICIAL_MEMBERSHIP_NOTE_STATUSES.has(currentMembershipStatus)
        ? membership
        : (membershipSnapshot || membership);
      const officialMembershipSnapshot = toPlain(officialMembershipState) || {};
      const membershipStatusLabel = normalizeText(officialMembershipState?.statusLabel)
        || getMembershipLifecycleLabel(officialMembershipState);
      const row = {
        rowNumber: index + 1,
        admissionNo: getStudentAdmissionNo(studentCore),
        studentName: getStudentDisplayName(studentCore, student),
        fatherName: normalizeText(
          profile?.family?.fatherName
          || membership?.afghanStudentId?.personalInfo?.fatherName
          || enrollment?.fatherName
        ),
        attendanceScore: scoreBreakdown.attendanceScore,
        writtenScore: scoreBreakdown.writtenScore,
        oralScore: scoreBreakdown.oralScore,
        classActivityScore: scoreBreakdown.classActivityScore,
        homeworkScore: scoreBreakdown.homeworkScore,
        obtainedMark: recorded ? Number(mark?.obtainedMark || 0) : 0,
        totalInWords: recorded ? numberToFaWords(mark?.obtainedMark || 0) : '',
        note,
        membershipStatus: normalizeText(officialMembershipState?.status),
        membershipStatusLabel,
        officialNote: buildOfficialExamSheetNote(
          { ...officialMembershipSnapshot, statusLabel: membershipStatusLabel },
          markStatus,
          note
        ),
        markStatus,
        percentage: Number(result?.percentage || mark?.percentage || 0),
        resultStatus: normalizeText(result?.resultStatus),
        rank: result?.rank == null ? null : Number(result.rank),
        subject: normalizeText(session.subjectId?.name),
        classTitle: normalizeText(session.classId?.title),
        sessionTitle: normalizeText(session.title),
        teacherName: normalizeText(session.teacherAssignmentId?.teacherUserId?.name),
        term: normalizeText(session.assessmentPeriodId?.title),
        academicYear: normalizeText(session.academicYearId?.title),
        heldAt: session.heldAt || null,
        reviewedByName: normalizeText(session.reviewedByName)
      };

      return {
        membership: formatMembership(membership),
        studentCore: formatStudentCore(studentCore),
        studentProfile: formatStudentProfile(profile),
        mark: formatExamMark(mark, session),
        result: formatExamResult(result),
        row
      };
    })
  };
}

async function getSessionMarks(sessionId) {
  const dataset = await buildSessionSheetDataset(sessionId);
  const summary = buildSessionRosterSummary({
    memberships: dataset.memberships,
    marks: dataset.marks,
    results: dataset.results
  });
  return {
    session: formatExamSession(dataset.session),
    scoreComponents: dataset.scoreComponents,
    isEditable: ['draft', 'active'].includes(normalizeText(dataset.session.status)),
    summary,
    items: dataset.items
  };
}

async function buildSessionSheetReport(sessionId) {
  const data = await getSessionMarks(sessionId);
  const reportRows = data.items.map((item) => ({
    number: item.row.rowNumber,
    admissionNo: item.row.admissionNo,
    studentName: item.row.studentName,
    fatherName: item.row.fatherName,
    attendanceScore: item.row.attendanceScore == null ? '' : item.row.attendanceScore,
    writtenScore: item.row.writtenScore == null ? '' : item.row.writtenScore,
    oralScore: item.row.oralScore == null ? '' : item.row.oralScore,
    classActivityScore: item.row.classActivityScore == null ? '' : item.row.classActivityScore,
    homeworkScore: item.row.homeworkScore == null ? '' : item.row.homeworkScore,
    obtainedMark: item.row.markStatus === 'recorded' ? item.row.obtainedMark : '',
    totalInWords: item.row.totalInWords,
    note: item.row.officialNote || item.row.note,
    markStatus: item.row.markStatus,
    subject: item.row.subject,
    teacherName: item.row.teacherName,
    classTitle: item.row.classTitle,
    sessionTitle: item.row.sessionTitle,
    term: item.row.term,
    academicYear: item.row.academicYear,
    heldAt: item.row.heldAt,
    reviewedByName: item.row.reviewedByName
  }));

  const title = normalizeSessionKind(data.session.sessionKind) === 'subject_sheet'
    ? `شقه ${normalizeText(data.session.examType?.title || 'مضمون')}`
    : `شقه ${normalizeText(data.session.examType?.title || 'امتحان')}`;

  const componentColumns = SCORE_COMPONENT_FIELDS
    .filter((component) => Number(data.scoreComponents?.[component.maxKey] || 0) > 0)
    .map((component) => ({
      key: component.scoreKey,
      label: `${component.label} از ${Number(data.scoreComponents?.[component.maxKey] || 0)}`,
      width: component.key === 'classActivity' ? 10 : 9
    }));
  const baseColumns = [
    { key: 'number', label: 'شماره', width: 7 },
    { key: 'studentName', label: 'نام', width: 15, group: 'شهرت شاگردان' },
    { key: 'fatherName', label: 'نام پدر', width: 15, group: 'شهرت شاگردان' },
    ...componentColumns,
    { key: 'obtainedMark', label: `به عدد از ${Number(data.session.defaultMark?.totalMark || 0)}`, width: 10, group: 'مجموع نمره' },
    { key: 'totalInWords', label: 'به حروف', width: 14, group: 'مجموع نمره' },
    { key: 'note', label: 'ملاحظات', width: 14 }
  ];
  const availableColumns = new Map(baseColumns.map((column) => [column.key, column]));
  const assignedTemplate = data.session.sheetTemplate || null;
  const configuredColumns = Array.isArray(assignedTemplate?.columns) && assignedTemplate.columns.length
    ? assignedTemplate.columns
        .filter((column) => column?.visible !== false && availableColumns.has(normalizeText(column?.key)))
        .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
        .map((column) => ({
          ...availableColumns.get(normalizeText(column.key)),
          label: normalizeText(column.label) || availableColumns.get(normalizeText(column.key)).label,
          group: normalizeText(column.group) || availableColumns.get(normalizeText(column.key)).group || '',
          width: Math.max(4, Number(column.width || availableColumns.get(normalizeText(column.key)).width || 16))
        }))
    : baseColumns;
  const template = assignedTemplate || {
    type: 'exam',
    title,
    version: 1,
    columns: baseColumns,
    layout: {
      orientation: 'portrait',
      fontFamily: 'B Zar',
      fontSize: 11,
      showHeader: true,
      showFooter: true,
      showLogo: true
    }
  };

  return {
    session: data.session,
    report: {
      report: {
        key: 'exam_outcomes',
        title,
        description: 'Subject sheet generated from exam sessions'
      },
      generatedAt: new Date().toISOString(),
      filters: {
        academicYearId: data.session.academicYear?.title || '',
        termId: data.session.assessmentPeriod?.title || '',
        month: data.session.monthLabel || '',
        dateFrom: data.session.heldAt || ''
      },
      summary: {
        totalStudents: Number(data.summary?.eligibleMemberships || 0),
        recordedMarks: Number(data.summary?.recordedMarks || 0),
        pendingMarks: Number(data.summary?.pendingMarks || 0),
        absentMarks: Number(data.summary?.absentMarks || 0),
        excusedMarks: Number(data.summary?.excusedMarks || 0),
        passedMarks: data.items.filter((item) => ['passed', 'distinction', 'placement', 'temporary'].includes(String(item?.result?.resultStatus || ''))).length,
        conditionalMarks: data.items.filter((item) => String(item?.result?.resultStatus || '') === 'conditional').length,
        failedMarks: data.items.filter((item) => String(item?.result?.resultStatus || '') === 'failed').length
      },
      columns: configuredColumns,
      rows: reportRows
    },
    template
  };
}

async function listStudentExamResults(studentRef, options = {}) {
  const { studentCore, user } = await resolveStudentIdentity(studentRef);
  if (!studentCore && !user) {
    return null;
  }

  const query = [];
  if (studentCore) query.push({ studentId: studentCore._id });
  if (user) query.push({ student: user._id });
  const filter = query.length === 1 ? query[0] : { $or: query };
  if (!options.includeUnpublished) {
    const approvedSessionIds = await ExamSession.find({ status: { $in: ['approved', 'published'] } }).distinct('_id');
    filter.sessionId = { $in: approvedSessionIds };
  }

  const items = await ExamResult.find(filter)
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', { path: 'assessmentPeriodId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, 'subjectId', 'defaultMarkId', 'rankingRuleId'] })
    .populate('examTypeId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .sort({ computedAt: -1, createdAt: -1 });

  return {
    student: {
      studentId: studentCore ? String(studentCore._id) : '',
      userId: user ? String(user._id) : '',
      fullName: getStudentDisplayName(studentCore, user),
      email: normalizeText(studentCore?.email) || normalizeText(user?.email),
      admissionNo: getStudentAdmissionNo(studentCore)
    },
    items: items.map(formatExamResult)
  };
}

module.exports = {
  bootstrapExamSession,
  buildSessionSheetReport,
  createExamSession,
  createExamSessionRevision,
  createExamType,
  deleteExamSession,
  ensureExamSessionAccess,
  getExamSessionManagementState,
  getSessionMarks,
  getSessionRosterStatus,
  initializeSessionRoster,
  listExamReferenceData,
  listExamSessions,
  listExamTypes,
  listStudentExamResults,
  previewExamSessionBootstrap,
  recomputeSessionResults,
  saveExamSheetMarks,
  seedExamReferenceData,
  syncSessionRoster,
  updateExamSession,
  updateExamSessionStatus,
  upsertExamMark
};
