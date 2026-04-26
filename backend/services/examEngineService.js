const mongoose = require('mongoose');

require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/TeacherAssignment');
require('../models/StudentCore');
require('../models/StudentMembership');
require('../models/StudentProfile');
require('../models/User');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const StudentProfile = require('../models/StudentProfile');
const User = require('../models/User');
const ExamType = require('../models/ExamType');
const ExamSession = require('../models/ExamSession');
const ExamDefaultMark = require('../models/ExamDefaultMark');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const RankingRule = require('../models/RankingRule');

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
  if (!value || !mongoose.isValidObjectId(value)) return null;
  return value;
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
  { key: 'written', maxKey: 'writtenMax', scoreKey: 'writtenScore', label: 'تحریری' },
  { key: 'oral', maxKey: 'oralMax', scoreKey: 'oralScore', label: 'تقریری' },
  { key: 'classActivity', maxKey: 'classActivityMax', scoreKey: 'classActivityScore', label: 'فعالیت صنفی' },
  { key: 'homework', maxKey: 'homeworkMax', scoreKey: 'homeworkScore', label: 'کارخانگی' }
]);

const EXAM_MARK_STATUS_LABELS = Object.freeze({
  absent: 'غایب',
  excused: 'معذور'
});

function sanitizeExamNote(value = '') {
  const note = normalizeText(value);
  return note === 'initialized_roster' ? '' : note;
}

function buildExamSheetNote(markStatus = '', note = '') {
  const statusLabel = EXAM_MARK_STATUS_LABELS[normalizeText(markStatus)] || '';
  return [statusLabel, sanitizeExamNote(note)].filter(Boolean).join(' - ');
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
    name: normalizeText(item.name),
    code: normalizeText(item.code),
    grade: normalizeText(item.grade),
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
  return {
    id: String(item._id),
    assignmentType: normalizeText(item.assignmentType),
    status: normalizeText(item.status),
    isPrimary: Boolean(item.isPrimary),
    startedAt: item.startedAt || null,
    academicYear: formatAcademicYear(item.academicYearId),
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
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    sessionKind: normalizeSessionKind(item.sessionKind),
    status: normalizeText(item.status),
    heldAt: item.heldAt || null,
    publishedAt: item.publishedAt || null,
    monthLabel: normalizeText(item.monthLabel),
    reviewedByName: normalizeText(item.reviewedByName),
    note: normalizeText(item.note),
    examType: formatExamType(item.examTypeId),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    schoolClass: formatSchoolClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacherAssignment: formatTeacherAssignment(item.teacherAssignmentId),
    defaultMark: formatDefaultMark(item.defaultMarkId),
    rankingRule: formatRankingRule(item.rankingRuleId)
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
    studentId: item.studentId ? String(item.studentId._id || item.studentId) : '',
    studentUserId: item.student ? String(item.student._id || item.student) : '',
    studentCore: formatStudentCore(item.studentId),
    student: item.student ? {
      id: String(item.student._id || item.student),
      name: normalizeText(item.student.name),
      email: normalizeText(item.student.email)
    } : null,
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatExamMark(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  const scoreBreakdown = getScoreBreakdown(item);
  return {
    id: String(item._id),
    markStatus: normalizeText(item.markStatus),
    scoreBreakdown,
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    note: normalizeText(item.note),
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
    scoreBreakdown: getScoreBreakdown(item),
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    averageMark: Number(item.averageMark || 0),
    resultStatus: normalizeText(item.resultStatus),
    groupLabel: normalizeText(item.groupLabel),
    rank: item.rank == null ? null : Number(item.rank),
    computedAt: item.computedAt || null,
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

const ACTIVE_SESSION_MEMBERSHIP_STATUSES = Object.freeze(['active', 'transferred_in', 'suspended']);

function buildSessionTitle({ refs, payload = {} }) {
  const sessionKind = normalizeSessionKind(payload.sessionKind);
  if (normalizeText(payload.title)) return normalizeText(payload.title);
  if (sessionKind === 'subject_sheet') {
    const parts = [
      normalizeText(refs.examType?.title) || 'شقه مضمون',
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
  return ['draft', 'active', 'closed', 'published', 'archived'].includes(normalized) ? normalized : fallback;
}

async function loadExamSessionWithRelations(sessionId) {
  return ExamSession.findById(sessionId)
    .populate('examTypeId')
    .populate('academicYearId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] })
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
      status: { $in: ['draft', 'active', 'closed', 'published'] }
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
    $or: [{ academicYearId }, { academicYear: academicYearId }],
    status: { $in: ACTIVE_SESSION_MEMBERSHIP_STATUSES },
    isCurrent: true
  })
    .populate('studentId')
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
    excusedMarks: 0
  };

  marks.forEach((item) => {
    const status = normalizeText(item.markStatus);
    if (status === 'recorded') markStatusCounts.recordedMarks += 1;
    else if (status === 'pending') markStatusCounts.pendingMarks += 1;
    else if (status === 'absent') markStatusCounts.absentMarks += 1;
    else if (status === 'excused') markStatusCounts.excusedMarks += 1;
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

function computeResultStatus({ examType, rankingRule, percentage, markStatus }) {
  if (markStatus === 'excused') return 'excused';
  if (markStatus === 'absent') return 'absent';
  if (markStatus === 'pending') return 'pending';

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
      { title: 'چهارونیم‌ماهه', code: 'FOUR_HALF_MONTH', category: 'standard', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
      { title: 'سالانه', code: 'ANNUAL', category: 'standard', defaultTotalMark: 100, defaultPassMark: 50, defaultConditionalMark: 40, isRankingEnabled: true, isActive: true },
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
  const activeCount = await ExamType.countDocuments({ isActive: true });
  if (activeCount > 0) return;

  for (const payload of reference.examTypes) {
    const existing = await ExamType.findOne({
      $or: [
        { code: payload.code },
        { title: payload.title }
      ]
    });

    if (existing) {
      Object.assign(existing, payload);
      await existing.save();
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

  const [academicYears, assessmentPeriods, schoolClasses, subjects, teacherAssignments, examTypes, rankingRules] = await Promise.all([
    AcademicYear.find({}).sort({ isActive: -1, sequence: 1, createdAt: 1 }),
    AcademicTerm.find({}).populate('academicYearId').sort({ sequence: 1, createdAt: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).populate('academicYearId').sort({ gradeLevel: 1, section: 1, title: 1 }),
    Subject.find({ isActive: true }).sort({ grade: 1, name: 1 }),
    TeacherAssignment.find({ status: 'active' })
      .populate('teacherUserId', 'name email')
      .populate('academicYearId')
      .populate('termId')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('subjectId')
      .sort({ createdAt: -1 }),
    ExamType.find({ isActive: true }).sort({ createdAt: 1 }),
    RankingRule.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 })
  ]);

  return {
    academicYears: academicYears.map(formatAcademicYear),
    assessmentPeriods: assessmentPeriods.map(formatAssessmentPeriod),
    classes: schoolClasses.map(formatSchoolClass),
    subjects: subjects.map(formatSubject),
    teacherAssignments: teacherAssignments.map(formatTeacherAssignment),
    examTypes: examTypes.map(formatExamType),
    rankingRules: rankingRules.map(formatRankingRule)
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

  if (!examTypeId || !academicYearId || !assessmentPeriodId || !classId) {
    throw new Error('exam_session_missing_required_refs');
  }
  if (sessionKind === 'subject_sheet' && !subjectId) {
    throw new Error('exam_session_subject_required');
  }

  const teacherAssignmentQuery = teacherAssignmentId
    ? TeacherAssignment.findById(teacherAssignmentId)
    : TeacherAssignment.findOne({ academicYearId, classId, ...(subjectId ? { subjectId } : {}), status: 'active' });

  const [examType, academicYear, assessmentPeriod, schoolClass, subject, teacherAssignment, rankingRule] = await Promise.all([
    ExamType.findById(examTypeId),
    AcademicYear.findById(academicYearId),
    AcademicTerm.findById(assessmentPeriodId).populate('academicYearId'),
    SchoolClass.findById(classId).populate('academicYearId'),
    subjectId ? Subject.findById(subjectId) : null,
    teacherAssignmentQuery
      .populate('teacherUserId', 'name email')
      .populate('academicYearId')
      .populate('termId')
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('subjectId'),
    rankingRuleId ? RankingRule.findById(rankingRuleId) : null
  ]);

  if (!examType || !academicYear || !assessmentPeriod || !schoolClass) {
    throw new Error('exam_session_refs_not_found');
  }
  if (sessionKind === 'subject_sheet' && !teacherAssignment) {
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

  const effectiveRankingRule = rankingRule || await findBestRankingRule({ academicYearId, assessmentPeriodId, classId, examTypeId });
  return {
    sessionKind,
    examType,
    academicYear,
    assessmentPeriod,
    schoolClass,
    subject,
    teacherAssignment,
    rankingRule: effectiveRankingRule
  };
}
async function previewExamSessionBootstrap(payload = {}, actor = null) {
  const refs = await resolveSessionReferences(payload, actor);
  const scoreComponents = buildScoreComponentsFromPayload(payload, { writtenMax: 25, oralMax: 25, classActivityMax: 25, homeworkMax: 25 });
  const totalMark = getScoreComponentTotal(scoreComponents) || clampNumber(payload.totalMark, 1, 1000, Number(refs.examType.defaultTotalMark || 100));
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
  if (!memberships.length) warnings.push('no_active_memberships');
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
      reviewedByName: normalizeText(payload.reviewedByName),
      note: normalizeText(payload.note),
      examType: formatExamType(refs.examType),
      academicYear: formatAcademicYear(refs.academicYear),
      assessmentPeriod: formatAssessmentPeriod(refs.assessmentPeriod),
      schoolClass: formatSchoolClass(refs.schoolClass),
      subject: formatSubject(refs.subject),
      teacherAssignment: formatTeacherAssignment(refs.teacherAssignment),
      rankingRule: formatRankingRule(refs.rankingRule),
      defaultMark: {
        totalMark,
        scoreComponents,
        passMark: clampNumber(payload.passMark, 0, 1000, Number(refs.rankingRule?.passMark ?? refs.examType.defaultPassMark ?? 50)),
        conditionalMark: clampNumber(payload.conditionalMark, 0, 1000, Number(refs.rankingRule?.conditionalMark ?? refs.examType.defaultConditionalMark ?? 40)),
        weight: clampNumber(payload.weight, 0, 100, 1)
      }
    },
    rosterSummary: buildSessionRosterSummary({ memberships }),
    sampleMemberships: memberships.slice(0, 10).map(formatMembership)
  };
}

async function createExamSession(payload = {}, actorUserId = null, actorRole = '') {
  const refs = await resolveSessionReferences(payload, { id: actorUserId, role: actorRole });
  const scoreComponents = buildScoreComponentsFromPayload(payload, { writtenMax: 25, oralMax: 25, classActivityMax: 25, homeworkMax: 25 });
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
    rankingRuleId: refs.rankingRule?._id || null,
    status: normalizeSessionStatus(payload.status, 'draft'),
    heldAt: toDateOrNull(payload.heldAt),
    publishedAt: toDateOrNull(payload.publishedAt),
    monthLabel: normalizeText(payload.monthLabel),
    reviewedByName: normalizeText(payload.reviewedByName),
    createdBy: normalizeNullableId(actorUserId),
    note: normalizeText(payload.note)
  });

  const totalMark = getScoreComponentTotal(scoreComponents) || clampNumber(payload.totalMark, 1, 1000, Number(refs.examType.defaultTotalMark || 100));
  const passMark = clampNumber(payload.passMark, 0, 1000, Number(refs.rankingRule?.passMark ?? refs.examType.defaultPassMark ?? 50));
  const conditionalMark = clampNumber(payload.conditionalMark, 0, 1000, Number(refs.rankingRule?.conditionalMark ?? refs.examType.defaultConditionalMark ?? 40));

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

async function initializeSessionRoster(sessionId, actorUserId = null) {
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const memberships = await listEligibleMembershipsForSessionContext({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    classId: session.classId?._id || session.classId
  });
  const existingMarks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
  const existingIds = new Set(existingMarks.map((item) => String(item.studentMembershipId || '')).filter(Boolean));
  const defaultTotalMark = Number(session.defaultMarkId?.totalMark || session.examTypeId?.defaultTotalMark || 100);
  const now = new Date();

  const payloads = memberships
    .filter((membership) => !existingIds.has(String(membership._id)))
    .map((membership) => ({
      sessionId: session._id,
      examTypeId: session.examTypeId?._id || session.examTypeId,
      academicYearId: session.academicYearId?._id || session.academicYearId,
      assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
      classId: session.classId?._id || session.classId,
      subjectId: session.subjectId?._id || session.subjectId || null,
      studentMembershipId: membership._id,
      studentId: membership.studentId?._id || membership.studentId || null,
      student: membership.student?._id || membership.student || null,
      markStatus: 'pending',
      obtainedMark: 0,
      totalMark: defaultTotalMark,
      note: 'initialized_roster',
      enteredBy: normalizeNullableId(actorUserId),
      enteredAt: now,
      updatedBy: normalizeNullableId(actorUserId)
    }));

  if (payloads.length) {
    try {
      await ExamMark.insertMany(payloads, { ordered: false });
    } catch (error) {
      const duplicateOnly = error?.code === 11000 || Array.isArray(error?.writeErrors);
      if (!duplicateOnly) throw error;
    }
  }

  const recompute = await recomputeSessionResults(session._id);
  const marks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
  const results = await ExamResult.find({ sessionId: session._id }).select('studentMembershipId').lean();

  return {
    session: formatExamSession(session),
    summary: buildSessionRosterSummary({ memberships, marks, results, createdMarks: payloads.length }),
    sampleMemberships: memberships.slice(0, 10).map(formatMembership),
    warnings: memberships.length ? [] : ['no_active_memberships'],
    recompute: recompute.summary
  };
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
    : await initializeSessionRoster(session.id, actorUserId);

  return {
    preview,
    session,
    roster
  };
}

async function listExamSessions(filters = {}) {

  const query = {};
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.assessmentPeriodId)) query.assessmentPeriodId = filters.assessmentPeriodId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.subjectId)) query.subjectId = filters.subjectId;
  if (normalizeNullableId(filters.examTypeId)) query.examTypeId = filters.examTypeId;
  if (normalizeNullableId(filters.teacherAssignmentId)) query.teacherAssignmentId = filters.teacherAssignmentId;
  if (normalizeText(filters.status)) query.status = normalizeText(filters.status);
  if (normalizeText(filters.monthLabel)) query.monthLabel = normalizeText(filters.monthLabel);
  if (normalizeText(filters.sessionKind)) query.sessionKind = normalizeSessionKind(filters.sessionKind);

  if (normalizeNullableId(filters.teacherUserId)) {
    const assignmentIds = await TeacherAssignment.find({ teacherUserId: filters.teacherUserId }).distinct('_id');
    if (!assignmentIds.length) {
      return [];
    }

    if (query.teacherAssignmentId) {
      const requestedAssignmentId = String(query.teacherAssignmentId);
      const isOwnedAssignment = assignmentIds.some((item) => String(item) === requestedAssignmentId);
      if (!isOwnedAssignment) {
        return [];
      }
    } else {
      query.teacherAssignmentId = { $in: assignmentIds };
    }
  }

  const items = await ExamSession.find(query)
    .populate('examTypeId')
    .populate('academicYearId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('subjectId')
    .populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] })
    .populate('defaultMarkId')
    .populate('rankingRuleId')
    .sort({ heldAt: -1, createdAt: -1, monthLabel: -1 });

  return items.map(formatExamSession);
}

async function recomputeSessionResults(sessionId) {
  const session = await ExamSession.findById(sessionId)
    .populate('examTypeId')
    .populate('rankingRuleId')
    .populate('defaultMarkId')
    .populate({ path: 'assessmentPeriodId', populate: { path: 'academicYearId' } })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('subjectId');
  if (!session) {
    throw new Error('exam_session_not_found');
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
  rankedMarks.sort((left, right) => Number(right.percentage || 0) - Number(left.percentage || 0));
  const rankMap = new Map();
  rankedMarks.forEach((mark, index) => {
    rankMap.set(String(mark._id), index + 1);
  });

  for (const mark of marks) {
    const percentage = Number(mark.percentage || 0);
    const markStatus = normalizeText(mark.markStatus);
    const resultStatus = computeResultStatus({ examType: session.examTypeId, rankingRule, percentage, markStatus });
    const rank = rankMap.get(String(mark._id)) || null;
    const groupLabel = computeGroupLabel(rankingRule, percentage);

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
        markStatus,
        scoreBreakdown: getScoreBreakdown(mark),
        obtainedMark: mark.obtainedMark,
        totalMark: mark.totalMark,
        percentage,
        averageMark: percentage,
        resultStatus,
        groupLabel,
        rank,
        rankingRuleId: rankingRule?._id || null,
        computedAt: new Date()
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
  return ['recorded', 'absent', 'excused', 'pending'].includes(normalized) ? normalized : fallback;
}

function assertSessionEditable(session) {
  const status = normalizeText(session?.status);
  if (['published', 'archived', 'closed'].includes(status)) {
    throw new Error('exam_session_locked');
  }
}

async function persistExamMark({ session, membership, payload = {}, actorUserId = null } = {}) {
  const markStatus = normalizeMarkStatus(payload.markStatus, 'recorded');
  const scoreComponents = getScoreComponents(session.defaultMarkId);
  const hasBreakdown = isBreakdownConfigured(session.defaultMarkId);
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
    { sessionId: session._id, studentMembershipId: membership._id },
    {
      examTypeId: session.examTypeId?._id || session.examTypeId,
      academicYearId: session.academicYearId?._id || session.academicYearId,
      assessmentPeriodId: session.assessmentPeriodId?._id || session.assessmentPeriodId,
      classId: session.classId?._id || session.classId,
      subjectId: session.subjectId?._id || session.subjectId || null,
      studentMembershipId: membership._id,
      studentId: membership.studentId?._id || membership.studentId || null,
      student: membership.student?._id || membership.student || null,
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
    mark: formatExamMark(mark),
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

  await initializeSessionRoster(session._id, actorUserId);

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

async function updateExamSessionStatus(sessionId, payload = {}, actorUserId = null) {
  const session = await loadSessionForMarkMutation(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const nextStatus = normalizeSessionStatus(payload.status, session.status);
  if (nextStatus === 'published') {
    const memberships = await listEligibleMembershipsForSessionContext({
      academicYearId: session.academicYearId?._id || session.academicYearId,
      classId: session.classId?._id || session.classId
    });
    const marks = await ExamMark.find({ sessionId: session._id }).select('studentMembershipId markStatus').lean();
    const results = await ExamResult.find({ sessionId: session._id }).select('studentMembershipId').lean();
    const rosterSummary = buildSessionRosterSummary({ memberships, marks, results });
    if (!rosterSummary.totalMarks || rosterSummary.missingMarks > 0 || rosterSummary.pendingMarks > 0) {
      throw new Error('exam_session_pending_marks');
    }
  }

  session.status = nextStatus;
  if (payload.reviewedByName !== undefined) {
    session.reviewedByName = normalizeText(payload.reviewedByName);
  }
  if (payload.monthLabel !== undefined) {
    session.monthLabel = normalizeText(payload.monthLabel);
  }
  if (payload.note !== undefined) {
    session.note = normalizeText(payload.note);
  }
  if (nextStatus === 'published') {
    session.publishedAt = new Date();
  }
  session.updatedBy = normalizeNullableId(actorUserId);
  await session.save();

  const populated = await loadExamSessionWithRelations(session._id);
  return formatExamSession(populated);
}

async function buildSessionSheetDataset(sessionId) {
  const session = await loadExamSessionWithRelations(sessionId);
  if (!session) {
    throw new Error('exam_session_not_found');
  }

  const memberships = await listEligibleMembershipsForSessionContext({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    classId: session.classId?._id || session.classId
  });
  const studentIds = memberships
    .map((item) => item.studentId?._id || item.studentId || null)
    .filter(Boolean);

  const [marks, results, profiles] = await Promise.all([
    ExamMark.find({ sessionId: session._id })
      .populate({ path: 'studentMembershipId', populate: [{ path: 'studentId' }, { path: 'student', select: 'name email' }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }] })
      .populate('student', 'name email')
      .sort({ createdAt: 1 }),
    ExamResult.find({ sessionId: session._id }).sort({ rank: 1, percentage: -1, createdAt: 1 }),
    StudentProfile.find({ studentId: { $in: studentIds } }).lean()
  ]);

  const markMap = new Map(marks.map((item) => [String(item.studentMembershipId?._id || item.studentMembershipId), item]));
  const resultMap = new Map(results.map((item) => [String(item.studentMembershipId), item]));
  const profileMap = new Map(profiles.map((item) => [String(item.studentId), item]));
  const scoreComponents = getScoreComponents(session.defaultMarkId);

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
      const scoreBreakdown = getScoreBreakdown(mark);
      const markStatus = normalizeText(mark?.markStatus) || 'pending';
      const recorded = markStatus === 'recorded';
      const note = sanitizeExamNote(mark?.note);
      const row = {
        rowNumber: index + 1,
        admissionNo: getStudentAdmissionNo(studentCore),
        studentName: getStudentDisplayName(studentCore, student),
        fatherName: normalizeText(profile?.family?.fatherName),
        writtenScore: scoreBreakdown.writtenScore,
        oralScore: scoreBreakdown.oralScore,
        classActivityScore: scoreBreakdown.classActivityScore,
        homeworkScore: scoreBreakdown.homeworkScore,
        obtainedMark: recorded ? Number(mark?.obtainedMark || 0) : 0,
        totalInWords: recorded ? numberToFaWords(mark?.obtainedMark || 0) : '',
        note,
        officialNote: buildExamSheetNote(markStatus, note),
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
        mark: formatExamMark(mark),
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
      columns: [
        { key: 'number', label: 'شماره', width: 7 },
        { key: 'studentName', label: 'نام', width: 15, group: 'شهرت متعلمین' },
        { key: 'fatherName', label: 'نام پدر', width: 15, group: 'شهرت متعلمین' },
        { key: 'writtenScore', label: 'تحریری', width: 9 },
        { key: 'oralScore', label: 'تقریری', width: 9 },
        { key: 'classActivityScore', label: 'فعالیت صنفی', width: 10 },
        { key: 'homeworkScore', label: 'کارخانگی', width: 10 },
        { key: 'obtainedMark', label: 'به عدد', width: 10, group: 'مجموعه نمره' },
        { key: 'totalInWords', label: 'به حروف', width: 14, group: 'مجموعه نمره' },
        { key: 'note', label: 'ملاحظات', width: 12 }
      ],
      rows: reportRows
    },
    template: {
      type: 'exam',
      title,
      layout: {
        orientation: 'portrait',
        fontFamily: 'B Zar',
        fontSize: 11,
        showHeader: true,
        showFooter: true,
        showLogo: true
      }
    }
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
    const publishedSessionIds = await ExamSession.find({ status: 'published' }).distinct('_id');
    filter.sessionId = { $in: publishedSessionIds };
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
  createExamType,
  ensureExamSessionAccess,
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
  updateExamSessionStatus,
  upsertExamMark
};
