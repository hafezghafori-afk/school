const mongoose = require('mongoose');

require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/Course');
require('../models/SchoolClass');
require('../models/StudentCore');
require('../models/StudentMembership');
require('../models/User');
require('../models/ExamSession');
require('../models/ExamResult');
require('../models/Subject');
require('../models/SheetTemplate');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const SheetTemplate = require('../models/SheetTemplate');
const PromotionRule = require('../models/PromotionRule');
const PromotionTransaction = require('../models/PromotionTransaction');
const { evaluateClassOfficialResults } = require('./classAggregateResultService');

const SCORE_BREAKDOWN_KEYS = ['writtenScore', 'oralScore', 'classActivityScore', 'homeworkScore'];

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
  return String(value);
}

function toDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDigits(value) {
  const text = String(value || '');
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return text
    .replace(/[?-?]/g, (char) => String(persian.indexOf(char)))
    .replace(/[?-?]/g, (char) => String(arabic.indexOf(char)));
}

function extractSequenceValue(value) {
  const text = normalizeDigits(value);
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function formatAcademicYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    code: normalizeText(item.code),
    title: normalizeText(item.title),
    label: normalizeText(item.title) || normalizeText(item.code),
    sequence: Number(item.sequence || 0),
    status: normalizeText(item.status),
    isActive: Boolean(item.isActive)
  };
}

function formatAssessmentPeriod(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    termType: normalizeText(item.termType),
    sequence: Number(item.sequence || 0)
  };
}

function formatSchoolClass(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    // gradeLevel is a numeric field on SchoolClass — normalizeText() only accepts strings and
    // silently returns '' for a number, which was hiding the grade in every place that displays
    // this formatted class (dropdown/badge labels, class-ID disambiguation).
    gradeLevel: Number(item.gradeLevel) || 0,
    section: normalizeText(item.section),
    status: normalizeText(item.status),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatExamSession(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    status: normalizeText(item.status),
    academicYear: formatAcademicYear(item.academicYearId),
    assessmentPeriod: formatAssessmentPeriod(item.assessmentPeriodId),
    schoolClass: formatSchoolClass(item.classId),
    examType: item.examTypeId ? {
      id: String(item.examTypeId._id || item.examTypeId || ''),
      title: normalizeText(item.examTypeId.title),
      code: normalizeText(item.examTypeId.code),
      category: normalizeText(item.examTypeId.category)
    } : null,
    subject: item.subjectId ? {
      id: String(item.subjectId._id || item.subjectId || ''),
      name: normalizeText(item.subjectId.nameDari) || normalizeText(item.subjectId.name) || normalizeText(item.subjectId.code),
      code: normalizeText(item.subjectId.code)
    } : null,
    sessionKind: normalizeText(item.sessionKind),
    monthLabel: normalizeText(item.monthLabel)
  };
}

function formatSheetTemplateRef(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    type: normalizeText(item.type),
    isDefault: Boolean(item.ownership?.isDefault),
    isPublic: Boolean(item.ownership?.isPublic)
  };
}

function formatStudentIdentity({ studentCore = null, user = null } = {}) {
  const core = toPlain(studentCore);
  const account = toPlain(user);
  return {
    studentId: core ? String(core._id || '') : '',
    userId: account ? String(account._id || '') : '',
    fullName: normalizeText(core?.fullName) || normalizeText(core?.preferredName) || normalizeText(account?.name),
    email: normalizeText(core?.email) || normalizeText(account?.email)
  };
}

function formatUserRef(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    name: normalizeText(item.name),
    email: normalizeText(item.email),
    role: normalizeText(item.role),
    orgRole: normalizeText(item.orgRole)
  };
}

function formatMembership(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    status: normalizeText(item.status),
    enrolledAt: item.enrolledAt || null,
    endedAt: item.endedAt || null,
    endedReason: normalizeText(item.endedReason),
    student: formatStudentIdentity({ studentCore: item.studentId, user: item.student }),
    schoolClass: formatSchoolClass(item.classId),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatPromotionRule(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    name: normalizeText(item.name),
    code: normalizeText(item.code),
    scope: normalizeText(item.scope),
    isTerminalClass: Boolean(item.isTerminalClass),
    conditionalTargetMode: normalizeText(item.conditionalTargetMode),
    promotedMembershipStatus: normalizeText(item.promotedMembershipStatus),
    repeatedMembershipStatus: normalizeText(item.repeatedMembershipStatus),
    conditionalMembershipStatus: normalizeText(item.conditionalMembershipStatus),
    evaluationMode: normalizeText(item.evaluationMode) || 'score_policy',
    passingScore: Number(item.passingScore ?? 55),
    subjectPassingScore: Number(item.subjectPassingScore ?? item.passingScore ?? 55),
    maxConditionalSubjects: Number(item.maxConditionalSubjects ?? 3),
    requireCompleteResults: item.requireCompleteResults !== false,
    missingResultOutcome: normalizeText(item.missingResultOutcome) || 'blocked',
    componentWeights: {
      writtenScore: Number(item.componentWeights?.writtenScore || 0),
      oralScore: Number(item.componentWeights?.oralScore || 0),
      classActivityScore: Number(item.componentWeights?.classActivityScore || 0),
      homeworkScore: Number(item.componentWeights?.homeworkScore || 0)
    },
    promotedStatuses: Array.isArray(item.promotedStatuses) ? item.promotedStatuses.map((entry) => normalizeText(entry)) : [],
    conditionalStatuses: Array.isArray(item.conditionalStatuses) ? item.conditionalStatuses.map((entry) => normalizeText(entry)) : [],
    repeatedStatuses: Array.isArray(item.repeatedStatuses) ? item.repeatedStatuses.map((entry) => normalizeText(entry)) : [],
    isDefault: Boolean(item.isDefault),
    isActive: Boolean(item.isActive),
    academicYear: formatAcademicYear(item.academicYearId),
    schoolClass: formatSchoolClass(item.classId),
    targetAcademicYear: formatAcademicYear(item.targetAcademicYearId),
    targetClass: formatSchoolClass(item.targetClassId),
    note: normalizeText(item.note)
  };
}

function formatPromotionTransaction(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id || item.id || ''),
    promotionOutcome: normalizeText(item.promotionOutcome),
    transactionStatus: normalizeText(item.transactionStatus),
    sourceResultStatus: normalizeText(item.sourceResultStatus),
    generatedMembershipStatus: normalizeText(item.generatedMembershipStatus),
    decidedAt: item.decidedAt || null,
    appliedAt: item.appliedAt || null,
    rolledBackAt: item.rolledBackAt || null,
    rollbackReason: normalizeText(item.rollbackReason),
    sourceMembershipStatusBefore: normalizeText(item.sourceMembershipStatusBefore),
    note: normalizeText(item.note),
    rule: formatPromotionRule(item.ruleId),
    session: formatExamSession(item.sessionId),
    sourceMembership: formatMembership(item.studentMembershipId),
    targetMembership: formatMembership(item.targetMembershipId),
    targetAcademicYear: formatAcademicYear(item.targetAcademicYearId),
    targetClass: formatSchoolClass(item.targetClassId),
    appliedBy: formatUserRef(item.appliedBy),
    createdBy: formatUserRef(item.createdBy),
    rolledBackBy: formatUserRef(item.rolledBackBy)
  };
}

function getPromotionRuleSpecificity(rule, context = {}) {
  let score = 0;
  if (String(rule.scope) === 'global') score += 1;
  if (String(rule.scope) === 'academic_year') score += 10;
  if (String(rule.scope) === 'class') score += 20;
  if (rule.academicYearId && String(rule.academicYearId) === String(context.academicYearId || '')) score += 5;
  if (rule.classId && String(rule.classId) === String(context.classId || '')) score += 10;
  if (rule.isDefault) score += 1;
  return score;
}

async function findBestPromotionRule(context = {}) {
  const rules = await PromotionRule.find({ isActive: true });
  const candidates = rules.filter((rule) => {
    if (rule.scope === 'academic_year' && String(rule.academicYearId || '') !== String(context.academicYearId || '')) return false;
    if (rule.scope === 'class' && String(rule.classId || '') !== String(context.classId || '')) return false;
    return true;
  });

  return candidates.sort((left, right) => getPromotionRuleSpecificity(right, context) - getPromotionRuleSpecificity(left, context))[0] || null;
}

function buildDefaultPromotionRulePayload() {
  return {
    name: 'Default Promotion Rule',
    code: 'DEFAULT-PROMOTION',
    scope: 'global',
    isTerminalClass: false,
    conditionalTargetMode: 'same_class',
    promotedMembershipStatus: 'pending',
    repeatedMembershipStatus: 'pending',
    conditionalMembershipStatus: 'pending',
    evaluationMode: 'official_general_result',
    passingScore: 55,
    subjectPassingScore: 55,
    maxConditionalSubjects: 3,
    requireCompleteResults: true,
    missingResultOutcome: 'blocked',
    componentWeights: {
      writtenScore: 0,
      oralScore: 0,
      classActivityScore: 0,
      homeworkScore: 0
    },
    promotedStatuses: ['passed', 'distinction', 'placement'],
    conditionalStatuses: ['conditional', 'temporary', 'excused'],
    repeatedStatuses: ['failed', 'absent', 'pending'],
    isDefault: true,
    isActive: true,
    note: 'Canonical default promotion rule for membership-based academic progression.'
  };
}

async function seedPromotionReferenceData({ dryRun = false } = {}) {
  const payload = buildDefaultPromotionRulePayload();
  const summary = {
    rulesCreated: 0,
    rulesUpdated: 0
  };

  const existing = await PromotionRule.findOne({ code: payload.code });
  if (!existing) {
    summary.rulesCreated += 1;
    if (!dryRun) {
      await PromotionRule.create(payload);
    }
    return summary;
  }

  const changed =
    normalizeText(existing.name) !== payload.name ||
    normalizeText(existing.scope) !== payload.scope ||
    Boolean(existing.isTerminalClass) !== Boolean(payload.isTerminalClass) ||
    normalizeText(existing.conditionalTargetMode) !== payload.conditionalTargetMode ||
    normalizeText(existing.promotedMembershipStatus) !== payload.promotedMembershipStatus ||
    normalizeText(existing.repeatedMembershipStatus) !== payload.repeatedMembershipStatus ||
    normalizeText(existing.conditionalMembershipStatus) !== payload.conditionalMembershipStatus ||
    normalizeText(existing.evaluationMode) !== payload.evaluationMode ||
    Number(existing.passingScore ?? 55) !== Number(payload.passingScore) ||
    Number(existing.subjectPassingScore ?? 55) !== Number(payload.subjectPassingScore) ||
    Number(existing.maxConditionalSubjects ?? 3) !== Number(payload.maxConditionalSubjects) ||
    Boolean(existing.requireCompleteResults) !== Boolean(payload.requireCompleteResults) ||
    normalizeText(existing.missingResultOutcome) !== payload.missingResultOutcome ||
    JSON.stringify(existing.componentWeights || {}) !== JSON.stringify(payload.componentWeights) ||
    Boolean(existing.isDefault) !== Boolean(payload.isDefault) ||
    Boolean(existing.isActive) !== Boolean(payload.isActive) ||
    normalizeText(existing.note) !== payload.note ||
    JSON.stringify(existing.promotedStatuses || []) !== JSON.stringify(payload.promotedStatuses) ||
    JSON.stringify(existing.conditionalStatuses || []) !== JSON.stringify(payload.conditionalStatuses) ||
    JSON.stringify(existing.repeatedStatuses || []) !== JSON.stringify(payload.repeatedStatuses);

  if (changed) {
    summary.rulesUpdated += 1;
    if (!dryRun) {
      Object.assign(existing, payload);
      await existing.save();
    }
  }

  return summary;
}
async function listPromotionReferenceData() {
  const [academicYears, schoolClasses, sessions, rules] = await Promise.all([
    AcademicYear.find({}).sort({ isActive: -1, sequence: 1, createdAt: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).populate('academicYearId').sort({ title: 1, createdAt: 1 }),
    ExamSession.find({}).populate('academicYearId').populate('assessmentPeriodId').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('examTypeId').sort({ heldAt: -1, createdAt: -1 }),
    PromotionRule.find({}).populate('academicYearId').populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('targetAcademicYearId').populate({ path: 'targetClassId', populate: { path: 'academicYearId' } }).sort({ isDefault: -1, createdAt: 1 })
  ]);

  return {
    academicYears: academicYears.map(formatAcademicYear),
    classes: schoolClasses.map(formatSchoolClass),
    sessions: sessions.map(formatExamSession),
    rules: rules.map(formatPromotionRule),
    activeYear: formatAcademicYear(academicYears.find((item) => item.isActive) || null)
  };
}

async function listPromotionRules(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (filters.isActive === 'true') query.isActive = true;
  if (filters.isActive === 'false') query.isActive = false;

  const items = await PromotionRule.find(query)
    .populate('academicYearId')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('targetAcademicYearId')
    .populate({ path: 'targetClassId', populate: { path: 'academicYearId' } })
    .sort({ isDefault: -1, createdAt: 1 });

  return items.map(formatPromotionRule);
}

async function createPromotionRule(payload = {}) {
  const scope = ['global', 'academic_year', 'class'].includes(normalizeText(payload.scope)) ? normalizeText(payload.scope) : 'global';
  const item = await PromotionRule.create({
    name: normalizeText(payload.name),
    code: normalizeText(payload.code).toUpperCase(),
    scope,
    academicYearId: normalizeNullableId(payload.academicYearId),
    classId: normalizeNullableId(payload.classId),
    targetAcademicYearId: normalizeNullableId(payload.targetAcademicYearId),
    targetClassId: normalizeNullableId(payload.targetClassId),
    isTerminalClass: payload.isTerminalClass === true,
    conditionalTargetMode: ['same_class', 'next_class', 'no_membership'].includes(normalizeText(payload.conditionalTargetMode))
      ? normalizeText(payload.conditionalTargetMode)
      : 'same_class',
    promotedMembershipStatus: ['active', 'pending', 'suspended'].includes(normalizeText(payload.promotedMembershipStatus))
      ? normalizeText(payload.promotedMembershipStatus)
      : 'pending',
    repeatedMembershipStatus: ['active', 'pending', 'suspended'].includes(normalizeText(payload.repeatedMembershipStatus))
      ? normalizeText(payload.repeatedMembershipStatus)
      : 'pending',
    conditionalMembershipStatus: ['active', 'pending', 'suspended'].includes(normalizeText(payload.conditionalMembershipStatus))
      ? normalizeText(payload.conditionalMembershipStatus)
      : 'pending',
    evaluationMode: ['result_status', 'score_policy', 'official_general_result'].includes(normalizeText(payload.evaluationMode))
      ? normalizeText(payload.evaluationMode)
      : 'score_policy',
    passingScore: Number.isFinite(Number(payload.passingScore)) ? Number(payload.passingScore) : 55,
    subjectPassingScore: Number.isFinite(Number(payload.subjectPassingScore)) ? Number(payload.subjectPassingScore) : 55,
    maxConditionalSubjects: Number.isFinite(Number(payload.maxConditionalSubjects)) ? Math.max(0, Math.floor(Number(payload.maxConditionalSubjects))) : 3,
    requireCompleteResults: payload.requireCompleteResults !== false,
    missingResultOutcome: ['blocked', 'conditional', 'repeated'].includes(normalizeText(payload.missingResultOutcome))
      ? normalizeText(payload.missingResultOutcome)
      : 'blocked',
    componentWeights: {
      writtenScore: Number(payload.componentWeights?.writtenScore || 0),
      oralScore: Number(payload.componentWeights?.oralScore || 0),
      classActivityScore: Number(payload.componentWeights?.classActivityScore || 0),
      homeworkScore: Number(payload.componentWeights?.homeworkScore || 0)
    },
    promotedStatuses: Array.isArray(payload.promotedStatuses) ? payload.promotedStatuses : undefined,
    conditionalStatuses: Array.isArray(payload.conditionalStatuses) ? payload.conditionalStatuses : undefined,
    repeatedStatuses: Array.isArray(payload.repeatedStatuses) ? payload.repeatedStatuses : undefined,
    isDefault: payload.isDefault === true,
    isActive: payload.isActive !== false,
    note: normalizeText(payload.note)
  });

  const populated = await PromotionRule.findById(item._id)
    .populate('academicYearId')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('targetAcademicYearId')
    .populate({ path: 'targetClassId', populate: { path: 'academicYearId' } });

  return formatPromotionRule(populated);
}

async function resolvePromotionSession(sessionId) {
  const session = await ExamSession.findById(sessionId)
    .populate('academicYearId')
    .populate('assessmentPeriodId')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('examTypeId');

  if (!session) {
    throw new Error('promotion_session_not_found');
  }

  return session;
}

async function resolveTargetAcademicYear(sourceAcademicYear, payload = {}, rule = null) {
  const explicitId = normalizeNullableId(payload.targetAcademicYearId) || normalizeNullableId(rule?.targetAcademicYearId);
  if (explicitId) {
    return AcademicYear.findById(explicitId);
  }

  if (!sourceAcademicYear) return null;

  const years = await AcademicYear.find({ _id: { $ne: sourceAcademicYear._id } }).sort({ sequence: 1, createdAt: 1 });
  const sourceSequence = Number(sourceAcademicYear.sequence || 0);
  const nextBySequence = years.find((item) => Number(item.sequence || 0) > sourceSequence);
  if (nextBySequence) return nextBySequence;
  const activeFallback = years.find((item) => item.isActive);
  return activeFallback || null;
}

function getClassMatchScore(candidate, sourceClass, mode = 'repeated') {
  let score = 0;
  const candidateTitle = normalizeText(candidate.title).toLowerCase();
  const sourceTitle = normalizeText(sourceClass.title).toLowerCase();
  const candidateCode = normalizeText(candidate.code).toLowerCase();
  const sourceCode = normalizeText(sourceClass.code).toLowerCase();
  const candidateGrade = normalizeText(candidate.gradeLevel).toLowerCase();
  const sourceGrade = normalizeText(sourceClass.gradeLevel).toLowerCase();
  const candidateSection = normalizeText(candidate.section).toLowerCase();
  const sourceSection = normalizeText(sourceClass.section).toLowerCase();
  // gradeLevel is a required, purpose-built Number field (1-12) on every SchoolClass — it is the
  // authoritative signal for "which grade this class is" and must be checked before falling back
  // to free-text title/code parsing, which can pick up an unrelated digit (e.g. a section index
  // baked into a code like "thow-1") and silently produce the wrong sequence.
  const candidateSequence = extractSequenceValue(candidate.gradeLevel) ?? extractSequenceValue(candidate.title) ?? extractSequenceValue(candidate.code);
  const sourceSequence = extractSequenceValue(sourceClass.gradeLevel) ?? extractSequenceValue(sourceClass.title) ?? extractSequenceValue(sourceClass.code);

  if (candidateTitle && candidateTitle === sourceTitle) score += 30;
  if (candidateCode && sourceCode && candidateCode === sourceCode) score += 25;
  if (candidateGrade && sourceGrade && candidateGrade === sourceGrade) score += 20;
  if (candidateSection && sourceSection && candidateSection === sourceSection) score += 10;

  // The sequence relationship is decisive, not just a tie-breaker: a class cloned into the next
  // year keeps the SAME title/code as its source (see bootstrapNextAcademicYear.js), so relying on
  // title/code/section alone (max 85 combined above) would keep a "promoted" student in a same-named
  // class instead of the next grade. Weight this well above that combined maximum so a correct-grade
  // candidate always wins over a same-named-but-wrong-grade one.
  if (sourceSequence != null && candidateSequence != null) {
    if (mode === 'promoted' && candidateSequence === sourceSequence + 1) score += 200;
    if (mode === 'repeated' && candidateSequence === sourceSequence) score += 200;
  }

  return score;
}

function selectBestClassCandidate(candidates = [], sourceClass = null, mode = 'repeated') {
  if (!sourceClass) return null;
  const ranked = candidates
    .map((candidate) => ({ candidate, score: getClassMatchScore(candidate, sourceClass, mode) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.candidate.title).localeCompare(String(right.candidate.title)));
  return ranked[0]?.candidate || null;
}

function needsGeneratedMembership(outcome, rule = null) {
  if (outcome === 'graduated' || outcome === 'blocked' || outcome === 'skipped') return false;
  if (outcome === 'conditional' && normalizeText(rule?.conditionalTargetMode) === 'no_membership') return false;
  return ['promoted', 'repeated', 'conditional'].includes(outcome);
}

function getGeneratedMembershipStatus(outcome, rule = null) {
  if (outcome === 'promoted') return normalizeText(rule?.promotedMembershipStatus) || 'pending';
  if (outcome === 'repeated') return normalizeText(rule?.repeatedMembershipStatus) || 'pending';
  if (outcome === 'conditional') return normalizeText(rule?.conditionalMembershipStatus) || 'pending';
  return '';
}

function resolvePromotionOutcome(rule, resultStatus) {
  const normalizedStatus = normalizeText(resultStatus).toLowerCase();
  const promotedStatuses = Array.isArray(rule?.promotedStatuses) ? rule.promotedStatuses.map((entry) => normalizeText(entry).toLowerCase()) : [];
  const conditionalStatuses = Array.isArray(rule?.conditionalStatuses) ? rule.conditionalStatuses.map((entry) => normalizeText(entry).toLowerCase()) : [];
  const repeatedStatuses = Array.isArray(rule?.repeatedStatuses) ? rule.repeatedStatuses.map((entry) => normalizeText(entry).toLowerCase()) : [];

  if (promotedStatuses.includes(normalizedStatus)) {
    return rule?.isTerminalClass ? 'graduated' : 'promoted';
  }
  if (conditionalStatuses.includes(normalizedStatus)) {
    return 'conditional';
  }
  if (repeatedStatuses.includes(normalizedStatus)) {
    return 'repeated';
  }
  return 'blocked';
}

function getScoreBreakdown(source = {}) {
  const breakdown = source?.scoreBreakdown && typeof source.scoreBreakdown === 'object' ? source.scoreBreakdown : {};
  return SCORE_BREAKDOWN_KEYS.reduce((memo, key) => {
    const value = Number(breakdown[key]);
    memo[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
    return memo;
  }, {});
}

function getSubjectLabel(result = {}) {
  const subject = result.subjectId || result.sessionId?.subjectId || null;
  return normalizeText(subject?.nameDari)
    || normalizeText(subject?.name)
    || normalizeText(subject?.code)
    || normalizeText(result.sessionId?.title)
    || 'بدون مضمون';
}

function getSubjectKey(result = {}) {
  const subjectId = result.subjectId?._id || result.subjectId || result.sessionId?.subjectId?._id || result.sessionId?.subjectId;
  if (subjectId) return `subject:${String(subjectId)}`;
  return `session:${String(result.sessionId?._id || result.sessionId || result._id || '')}`;
}

function normalizePolicyNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function evaluateScorePolicyForMembership({ membershipId, resultsByMembership, sessions = [], rule = null, sheetTemplates = [] }) {
  const passingScore = normalizePolicyNumber(rule?.passingScore, 55);
  const subjectPassingScore = normalizePolicyNumber(rule?.subjectPassingScore, passingScore);
  const maxConditionalSubjects = Math.max(0, Math.floor(normalizePolicyNumber(rule?.maxConditionalSubjects, 3)));
  const requireCompleteResults = rule?.requireCompleteResults !== false;
  const missingResultOutcome = ['blocked', 'conditional', 'repeated'].includes(normalizeText(rule?.missingResultOutcome))
    ? normalizeText(rule?.missingResultOutcome)
    : 'blocked';
  const relatedResults = resultsByMembership.get(String(membershipId || '')) || [];
  const recordedResults = relatedResults.filter((result) => normalizeText(result.markStatus) === 'recorded');
  const subjectMap = new Map();

  relatedResults.forEach((result) => {
    const key = getSubjectKey(result);
    if (!key) return;
    if (!subjectMap.has(key)) {
      subjectMap.set(key, {
        key,
        subjectId: String(result.subjectId?._id || result.subjectId || result.sessionId?.subjectId?._id || result.sessionId?.subjectId || ''),
        subjectTitle: getSubjectLabel(result),
        obtainedMark: 0,
        totalMark: 0,
        percentage: 0,
        resultCount: 0,
        recordedCount: 0,
        absentCount: 0,
        excusedCount: 0,
        pendingCount: 0,
        breakdown: SCORE_BREAKDOWN_KEYS.reduce((memo, breakdownKey) => ({ ...memo, [breakdownKey]: 0 }), {}),
        sessions: []
      });
    }

    const subject = subjectMap.get(key);
    const markStatus = normalizeText(result.markStatus) || 'pending';
    const obtainedMark = Number(result.obtainedMark || 0);
    const totalMark = Number(result.totalMark || 0);
    const breakdown = getScoreBreakdown(result);
    subject.resultCount += 1;
    subject.sessions.push({
      id: String(result.sessionId?._id || result.sessionId || ''),
      title: normalizeText(result.sessionId?.title),
      code: normalizeText(result.sessionId?.code),
      examType: normalizeText(result.examTypeId?.title || result.sessionId?.examTypeId?.title),
      assessmentPeriod: normalizeText(result.assessmentPeriodId?.title || result.sessionId?.assessmentPeriodId?.title),
      percentage: Number(result.percentage || 0),
      resultStatus: normalizeText(result.resultStatus),
      markStatus
    });
    if (markStatus === 'recorded') {
      subject.recordedCount += 1;
      subject.obtainedMark += Number.isFinite(obtainedMark) ? obtainedMark : 0;
      subject.totalMark += Number.isFinite(totalMark) && totalMark > 0 ? totalMark : 100;
      SCORE_BREAKDOWN_KEYS.forEach((breakdownKey) => {
        subject.breakdown[breakdownKey] += breakdown[breakdownKey] || 0;
      });
    } else if (markStatus === 'absent') {
      subject.absentCount += 1;
    } else if (markStatus === 'excused') {
      subject.excusedCount += 1;
    } else {
      subject.pendingCount += 1;
    }
  });

  const expectedSessionCount = sessions.length;
  const missingSessionCount = Math.max(0, expectedSessionCount - relatedResults.length);
  const subjects = Array.from(subjectMap.values()).map((subject) => {
    const percentage = subject.totalMark > 0 ? Number(((subject.obtainedMark / subject.totalMark) * 100).toFixed(2)) : 0;
    return {
      ...subject,
      obtainedMark: Number(subject.obtainedMark.toFixed(2)),
      totalMark: Number(subject.totalMark.toFixed(2)),
      percentage,
      isFailed: subject.recordedCount > 0 ? percentage < subjectPassingScore : true
    };
  }).sort((left, right) => normalizeText(left.subjectTitle).localeCompare(normalizeText(right.subjectTitle)));

  const missingSubjectCount = subjects.filter((subject) => subject.recordedCount === 0).length;
  const failedSubjects = subjects.filter((subject) => subject.isFailed);
  const averageScore = subjects.length
    ? Number((subjects.reduce((sum, subject) => sum + Number(subject.percentage || 0), 0) / subjects.length).toFixed(2))
    : 0;
  const incomplete = relatedResults.length === 0 || missingSessionCount > 0 || missingSubjectCount > 0 || recordedResults.length === 0;

  let sourceResultStatus = 'pending';
  let computedOutcome = 'blocked';
  let issueCode = '';

  if (requireCompleteResults && incomplete) {
    computedOutcome = missingResultOutcome;
    sourceResultStatus = missingResultOutcome === 'repeated' ? 'failed' : missingResultOutcome;
    issueCode = 'score_policy_incomplete_results';
  } else if (failedSubjects.length === 0 && averageScore >= passingScore) {
    sourceResultStatus = 'passed';
    computedOutcome = rule?.isTerminalClass ? 'graduated' : 'promoted';
  } else if (failedSubjects.length > 0 && failedSubjects.length <= maxConditionalSubjects) {
    sourceResultStatus = 'conditional';
    computedOutcome = 'conditional';
  } else {
    sourceResultStatus = 'failed';
    computedOutcome = 'repeated';
  }

  return {
    mode: 'score_policy',
    passingScore,
    subjectPassingScore,
    maxConditionalSubjects,
    requireCompleteResults,
    missingResultOutcome,
    averageScore,
    totalSubjects: subjects.length,
    failedSubjectCount: failedSubjects.length,
    missingSessionCount,
    missingSubjectCount,
    sourceResultStatus,
    computedOutcome,
    issueCode,
    subjects,
    failedSubjects: failedSubjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectTitle,
      percentage: subject.percentage,
      obtainedMark: subject.obtainedMark,
      totalMark: subject.totalMark
    })),
    includedSessions: sessions.map(formatExamSession).filter(Boolean),
    sheetTemplates: sheetTemplates.map(formatSheetTemplateRef).filter(Boolean)
  };
}

function evaluateOfficialGeneralResultForMembership({ membershipId, classOfficialResults, rule }) {
  const entry = classOfficialResults?.evaluatedByMembership?.get(String(membershipId || ''));
  if (!classOfficialResults?.readiness?.ready || !entry) {
    return {
      mode: 'official_general_result',
      sourceResultStatus: 'pending',
      computedOutcome: 'blocked',
      averageScore: 0,
      totalSubjects: 0,
      failedSubjectCount: 0,
      missingSessionCount: 0,
      missingSubjectCount: 0,
      issueCode: 'official_result_not_ready',
      subjects: [],
      failedSubjects: [],
      includedSessions: [],
      sheetTemplates: []
    };
  }

  const { subjects, general } = entry;
  // 'pending'/'not_applicable' means THIS student's own marks are incomplete even though the
  // class overall is ready (e.g. absent/ungraded in one subject) — that is missing data, not an
  // academic failure, so it must resolve to 'blocked' rather than fall through to the rule's
  // repeatedStatuses list (which includes 'pending' for the legacy modes' own reasons).
  const isIncomplete = general.resultStatus === 'pending' || general.resultStatus === 'not_applicable';
  const computedOutcome = isIncomplete ? 'blocked' : resolvePromotionOutcome(rule, general.resultStatus);
  const failedSubjects = subjects.filter((subject) => subject.passed === false);

  return {
    mode: 'official_general_result',
    sourceResultStatus: general.resultStatus,
    computedOutcome,
    averageScore: general.average ?? 0,
    totalSubjects: subjects.length,
    failedSubjectCount: failedSubjects.length,
    missingSessionCount: 0,
    missingSubjectCount: subjects.filter((subject) => !subject.complete).length,
    issueCode: isIncomplete ? 'official_result_pending' : '',
    subjects: subjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectName,
      percentage: subject.total,
      obtainedMark: subject.total,
      totalMark: 100,
      isFailed: subject.passed === false
    })),
    failedSubjects: failedSubjects.map((subject) => ({
      subjectId: subject.subjectId,
      subjectTitle: subject.subjectName,
      percentage: subject.total,
      obtainedMark: subject.total,
      totalMark: 100
    })),
    includedSessions: (classOfficialResults.readiness.sourceSessionIds || []).map((id) => ({ id: String(id) })),
    sheetTemplates: []
  };
}

function buildLegacyPolicyEvaluation(result = {}, computedOutcome = 'blocked') {
  return {
    mode: 'result_status',
    sourceResultStatus: normalizeText(result.resultStatus),
    computedOutcome,
    averageScore: Number(result.percentage || 0),
    totalSubjects: 0,
    failedSubjectCount: computedOutcome === 'repeated' ? 1 : 0,
    missingSessionCount: 0,
    missingSubjectCount: 0,
    failedSubjects: [],
    subjects: [],
    includedSessions: [],
    sheetTemplates: []
  };
}

function resolveTargetClassFromCandidates({ sourceClass, targetClasses, rule, payload, outcome }) {
  if (!Array.isArray(targetClasses) || !targetClasses.length) return null;

  const explicitTargetId = normalizeNullableId(payload.targetClassId)
    || (outcome === 'promoted' ? normalizeNullableId(rule?.targetClassId) : null)
    || (outcome === 'conditional' && normalizeText(rule?.conditionalTargetMode) === 'next_class' ? normalizeNullableId(rule?.targetClassId) : null);

  if (explicitTargetId) {
    const explicit = targetClasses.find((item) => String(item._id) === String(explicitTargetId));
    if (explicit) return explicit;
  }

  if (outcome === 'promoted') {
    return selectBestClassCandidate(targetClasses, sourceClass, 'promoted');
  }
  if (outcome === 'repeated') {
    return selectBestClassCandidate(targetClasses, sourceClass, 'repeated');
  }
  if (outcome === 'conditional') {
    if (normalizeText(rule?.conditionalTargetMode) === 'no_membership') return null;
    if (normalizeText(rule?.conditionalTargetMode) === 'next_class') {
      return selectBestClassCandidate(targetClasses, sourceClass, 'promoted');
    }
    return selectBestClassCandidate(targetClasses, sourceClass, 'repeated');
  }

  return null;
}

async function resolveCourseForTargetClass(targetClass, sourceMembership = null) {
  if (!targetClass) return null;
  if (targetClass.legacyCourseId) return String(targetClass.legacyCourseId);

  const directCourse = await Course.findOne({ schoolClassRef: targetClass._id, kind: 'academic_class' }).select('_id').sort({ isActive: -1, createdAt: -1 }).lean();
  if (directCourse?._id) {
    return String(directCourse._id);
  }

  if (sourceMembership && String(sourceMembership.classId?._id || sourceMembership.classId || '') === String(targetClass._id) && sourceMembership.course) {
    return String(sourceMembership.course);
  }

  return null;
}

function populatePromotionTransactionQuery(query) {
  return query
    .populate('ruleId')
    .populate({ path: 'sessionId', populate: ['academicYearId', 'assessmentPeriodId', { path: 'classId', populate: { path: 'academicYearId' } }, 'examTypeId'] })
    .populate({ path: 'studentMembershipId', populate: [{ path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }, { path: 'studentId' }, { path: 'student', select: 'name email' }] })
    .populate({ path: 'targetMembershipId', populate: [{ path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }, { path: 'studentId' }, { path: 'student', select: 'name email' }] })
    .populate('targetAcademicYearId')
    .populate({ path: 'targetClassId', populate: { path: 'academicYearId' } })
    .populate('createdBy', 'name email role orgRole')
    .populate('appliedBy', 'name email role orgRole')
    .populate('rolledBackBy', 'name email role orgRole');
}

function snapshotMembershipState(membership) {
  if (!membership) {
    return {
      status: '',
      endedReason: '',
      endedAt: null,
      leftAt: null,
      isCurrent: true
    };
  }

  return {
    status: normalizeText(membership.status),
    endedReason: normalizeText(membership.endedReason),
    endedAt: membership.endedAt || null,
    leftAt: membership.leftAt || null,
    isCurrent: membership.isCurrent !== false
  };
}

function appendMembershipNote(existingNote = '', fragment = '') {
  const current = normalizeText(existingNote);
  const next = normalizeText(fragment);
  if (!next) return current;
  if (!current) return next;
  if (current.includes(next)) return current;
  return `${current} | ${next}`;
}

async function restoreMembershipSnapshot(sourceMembership, transaction) {
  if (!sourceMembership || !transaction) return null;
  sourceMembership.status = normalizeText(transaction.sourceMembershipStatusBefore) || 'active';
  sourceMembership.endedReason = normalizeText(transaction.sourceMembershipEndedReasonBefore);
  sourceMembership.endedAt = transaction.sourceMembershipEndedAtBefore || null;
  sourceMembership.leftAt = transaction.sourceMembershipLeftAtBefore || null;
  sourceMembership.isCurrent = transaction.sourceMembershipIsCurrentBefore !== false;
  sourceMembership.note = appendMembershipNote(sourceMembership.note, 'promotion rollback restored source membership');
  await sourceMembership.save();
  return sourceMembership;
}

async function retireGeneratedMembership(targetMembership, effectiveAt) {
  if (!targetMembership) return null;
  targetMembership.status = 'inactive';
  targetMembership.endedReason = 'promotion_rollback';
  targetMembership.endedAt = effectiveAt;
  targetMembership.leftAt = effectiveAt;
  targetMembership.isCurrent = false;
  targetMembership.note = appendMembershipNote(targetMembership.note, 'closed by promotion rollback');
  await targetMembership.save();
  return targetMembership;
}

function summarizePromotionItems(items = []) {
  const summary = {
    total: items.length,
    promoted: 0,
    repeated: 0,
    conditional: 0,
    graduated: 0,
    blocked: 0,
    skipped: 0,
    canApply: 0
  };

  items.forEach((item) => {
    const key = normalizeText(item.computedOutcome || item.promotionOutcome || 'blocked');
    if (Object.prototype.hasOwnProperty.call(summary, key)) {
      summary[key] += 1;
    }
    if (item.canApply === true || normalizeText(item.transactionStatus) === 'applied') {
      summary.canApply += 1;
    }
  });

  return summary;
}
async function resolvePromotionPreviewState(payload = {}) {
  const sessionId = normalizeNullableId(payload.sessionId);
  const explicitAcademicYearId = normalizeNullableId(payload.academicYearId);
  const explicitClassId = normalizeNullableId(payload.classId);
  if (!sessionId && !(explicitAcademicYearId && explicitClassId)) {
    throw new Error('promotion_session_required');
  }

  const session = sessionId ? await resolvePromotionSession(sessionId) : null;
  const scopeAcademicYearId = explicitAcademicYearId || String(session?.academicYearId?._id || session?.academicYearId || '');
  const scopeClassId = explicitClassId || String(session?.classId?._id || session?.classId || '');
  const sourceAcademicYear = session?.academicYearId
    || (scopeAcademicYearId ? await AcademicYear.findById(scopeAcademicYearId) : null);

  const rule = normalizeNullableId(payload.ruleId)
    ? await PromotionRule.findById(payload.ruleId)
    : await findBestPromotionRule({
        academicYearId: scopeAcademicYearId,
        classId: scopeClassId
      });

  if (!rule) {
    throw new Error('promotion_rule_not_found');
  }

  const targetAcademicYear = await resolveTargetAcademicYear(sourceAcademicYear, payload, rule);
  const targetClasses = targetAcademicYear
    ? await SchoolClass.find({ academicYearId: targetAcademicYear._id, status: { $ne: 'archived' } })
      .select('title code gradeLevel section status academicYearId legacyCourseId')
      .populate('academicYearId')
      .sort({ title: 1, createdAt: 1 })
    : [];

  if (normalizeText(rule.evaluationMode) === 'official_general_result') {
    const classOfficialResults = await evaluateClassOfficialResults({
      academicYearId: scopeAcademicYearId,
      classId: scopeClassId
    });

    const membershipQuery = {
      classId: scopeClassId,
      $or: [{ academicYearId: scopeAcademicYearId }, { academicYear: scopeAcademicYearId }]
    };
    let memberships = await StudentMembership.find(membershipQuery)
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('academicYearId')
      .populate('studentId')
      .populate('student', 'name email');

    if (Array.isArray(payload.sourceMembershipIds) && payload.sourceMembershipIds.length) {
      const ids = new Set(payload.sourceMembershipIds.map((item) => normalizeNullableId(item)).filter(Boolean));
      memberships = memberships.filter((membership) => ids.has(String(membership._id)));
    }

    const items = [];
    for (const membership of memberships) {
      const policyEvaluation = evaluateOfficialGeneralResultForMembership({
        membershipId: membership._id,
        classOfficialResults,
        rule
      });
      const computedOutcome = policyEvaluation.computedOutcome;
      const targetClass = needsGeneratedMembership(computedOutcome, rule)
        ? resolveTargetClassFromCandidates({
            sourceClass: membership.classId,
            targetClasses,
            rule,
            payload,
            outcome: computedOutcome
          })
        : null;
      const targetCourseId = targetClass ? await resolveCourseForTargetClass(targetClass, membership) : null;
      const issueCode = policyEvaluation.issueCode
        || (needsGeneratedMembership(computedOutcome, rule) && !targetAcademicYear
          ? 'target_year_not_resolved'
          : needsGeneratedMembership(computedOutcome, rule) && !targetClass
            ? 'target_class_not_resolved'
            : needsGeneratedMembership(computedOutcome, rule) && !targetCourseId
              ? 'target_course_not_resolved'
              : '');
      const canApply = computedOutcome === 'graduated'
        || (computedOutcome !== 'blocked' && ((!needsGeneratedMembership(computedOutcome, rule)) || !issueCode));

      items.push({
        examResult: null,
        sourceMembership: membership,
        studentCore: membership.studentId || null,
        studentUser: membership.student || null,
        computedOutcome,
        policyEvaluation,
        canApply,
        issueCode,
        targetAcademicYear,
        targetClass,
        targetCourseId,
        generatedMembershipStatus: canApply ? getGeneratedMembershipStatus(computedOutcome, rule) : ''
      });
    }

    return {
      session,
      rule,
      targetAcademicYear,
      items,
      scopeAcademicYearId,
      scopeClassId,
      classReadiness: classOfficialResults.readiness
    };
  }

  if (!session) {
    throw new Error('promotion_session_required');
  }

  const resultQuery = { sessionId: session._id };
  if (Array.isArray(payload.sourceMembershipIds) && payload.sourceMembershipIds.length) {
    const ids = payload.sourceMembershipIds.map((item) => normalizeNullableId(item)).filter(Boolean);
    if (ids.length) {
      resultQuery.studentMembershipId = { $in: ids };
    }
  }

  const results = await ExamResult.find(resultQuery)
    .populate({
      path: 'studentMembershipId',
      populate: [
        { path: 'classId', populate: { path: 'academicYearId' } },
        { path: 'academicYearId' },
        { path: 'studentId' },
        { path: 'student', select: 'name email' }
      ]
    })
    .populate('studentId')
    .populate('student', 'name email')
    .populate('subjectId')
    .populate({ path: 'examTypeId' })
    .populate({ path: 'assessmentPeriodId' })
    .sort({ rank: 1, percentage: -1, createdAt: 1 });

  const membershipIds = results.map((result) => normalizeNullableId(result.studentMembershipId?._id || result.studentMembershipId)).filter(Boolean);
  const allYearSessions = await ExamSession.find({
    academicYearId: session.academicYearId?._id || session.academicYearId,
    classId: session.classId?._id || session.classId,
    status: { $ne: 'archived' }
  })
    .populate('academicYearId')
    .populate('assessmentPeriodId')
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('examTypeId')
    .populate('subjectId')
    .sort({ heldAt: 1, createdAt: 1 });
  const scorePolicySessions = allYearSessions.filter((item) => normalizeText(item.sessionKind) === 'subject_sheet' || item.subjectId);
  const allYearResults = membershipIds.length
    ? await ExamResult.find({
        academicYearId: session.academicYearId?._id || session.academicYearId,
        classId: session.classId?._id || session.classId,
        studentMembershipId: { $in: membershipIds }
      })
        .populate({ path: 'sessionId', populate: ['academicYearId', 'assessmentPeriodId', { path: 'classId', populate: { path: 'academicYearId' } }, 'examTypeId', 'subjectId'] })
        .populate('examTypeId')
        .populate('assessmentPeriodId')
        .populate('subjectId')
        .sort({ createdAt: 1 })
    : [];
  const resultsByMembership = allYearResults.reduce((memo, result) => {
    const key = String(result.studentMembershipId?._id || result.studentMembershipId || '');
    if (!memo.has(key)) memo.set(key, []);
    memo.get(key).push(result);
    return memo;
  }, new Map());
  const sheetTemplates = await SheetTemplate.find({
    type: 'exam',
    isActive: true,
    $or: [
      { 'ownership.isDefault': true },
      { 'ownership.isPublic': true },
      { 'scope.academicYearId': session.academicYearId?._id || session.academicYearId },
      { 'scope.classId': session.classId?._id || session.classId }
    ]
  }).sort({ 'ownership.isDefault': -1, createdAt: -1 }).limit(10);

  const items = [];
  for (const result of results) {
    const membership = result.studentMembershipId;
    if (!membership) continue;

    const policyEvaluation = normalizeText(rule.evaluationMode) === 'result_status'
      ? buildLegacyPolicyEvaluation(result, resolvePromotionOutcome(rule, result.resultStatus))
      : evaluateScorePolicyForMembership({
          membershipId: membership._id,
          resultsByMembership,
          sessions: scorePolicySessions.length ? scorePolicySessions : allYearSessions,
          rule,
          sheetTemplates
        });
    const computedOutcome = policyEvaluation.computedOutcome;
    const targetClass = needsGeneratedMembership(computedOutcome, rule)
      ? resolveTargetClassFromCandidates({
          sourceClass: membership.classId || session.classId,
          targetClasses,
          rule,
          payload,
          outcome: computedOutcome
        })
      : null;
    const targetCourseId = targetClass ? await resolveCourseForTargetClass(targetClass, membership) : null;
    const issueCode = policyEvaluation.issueCode
      || (computedOutcome === 'blocked' && normalizeText(rule.evaluationMode) === 'result_status'
        ? 'result_status_not_mapped'
        : needsGeneratedMembership(computedOutcome, rule) && !targetAcademicYear
        ? 'target_year_not_resolved'
        : needsGeneratedMembership(computedOutcome, rule) && !targetClass
          ? 'target_class_not_resolved'
          : needsGeneratedMembership(computedOutcome, rule) && !targetCourseId
            ? 'target_course_not_resolved'
            : '');
    const canApply = computedOutcome === 'graduated'
      || (computedOutcome !== 'blocked' && ((!needsGeneratedMembership(computedOutcome, rule)) || !issueCode));

    items.push({
      examResult: result,
      sourceMembership: membership,
      studentCore: result.studentId || membership.studentId || null,
      studentUser: result.student || membership.student || null,
      computedOutcome,
      policyEvaluation,
      canApply,
      issueCode,
      targetAcademicYear,
      targetClass,
      targetCourseId,
      generatedMembershipStatus: canApply ? getGeneratedMembershipStatus(computedOutcome, rule) : ''
    });
  }

  return {
    session,
    rule,
    targetAcademicYear,
    items,
    scopeAcademicYearId,
    scopeClassId,
    classReadiness: null
  };
}

function serializePromotionPreview(state) {
  return {
    session: formatExamSession(state.session),
    rule: formatPromotionRule(state.rule),
    targetAcademicYear: formatAcademicYear(state.targetAcademicYear),
    readiness: state.classReadiness || null,
    summary: summarizePromotionItems(state.items),
    items: state.items.map((item) => ({
      examResultId: item.examResult ? String(item.examResult._id) : null,
      sourceResultStatus: normalizeText(item.policyEvaluation?.sourceResultStatus || item.examResult?.resultStatus),
      percentage: Number(item.examResult?.percentage || 0),
      averageScore: Number(item.policyEvaluation?.averageScore ?? item.examResult?.percentage ?? 0),
      computedOutcome: item.computedOutcome,
      canApply: item.canApply,
      issueCode: item.issueCode,
      generatedMembershipStatus: item.generatedMembershipStatus,
      policyEvaluation: item.policyEvaluation || null,
      sourceMembership: formatMembership(item.sourceMembership),
      targetAcademicYear: formatAcademicYear(item.targetAcademicYear),
      targetClass: formatSchoolClass(item.targetClass)
    }))
  };
}

async function previewPromotions(payload = {}) {
  const state = await resolvePromotionPreviewState(payload);
  return serializePromotionPreview(state);
}

async function closeSourceMembership(sourceMembership, outcome, effectiveAt) {
  if (!sourceMembership) return null;
  sourceMembership.status = outcome === 'graduated' ? 'graduated' : 'inactive';
  sourceMembership.endedReason = outcome;
  sourceMembership.endedAt = effectiveAt;
  sourceMembership.leftAt = effectiveAt;
  sourceMembership.isCurrent = false;
  await sourceMembership.save();
  return sourceMembership;
}

async function upsertGeneratedMembership({ sourceMembership, targetAcademicYear, targetClass, targetCourseId, outcome, rule, actorUserId, effectiveAt }) {
  if (!sourceMembership || !targetAcademicYear || !targetClass || !targetCourseId) return null;

  const existing = await StudentMembership.findOne({
    student: sourceMembership.student,
    course: targetCourseId,
    $or: [{ academicYearId: targetAcademicYear._id }, { academicYear: targetAcademicYear._id }]
  }).sort({ isCurrent: -1, createdAt: -1 });

  if (existing) {
    return existing;
  }

  return StudentMembership.create({
    student: sourceMembership.student,
    studentId: sourceMembership.studentId || null,
    course: targetCourseId,
    classId: targetClass._id,
    academicYear: targetAcademicYear._id,
    academicYearId: targetAcademicYear._id,
    status: getGeneratedMembershipStatus(outcome, rule) || 'pending',
    source: 'promotion',
    enrolledAt: effectiveAt,
    joinedAt: effectiveAt,
    createdBy: normalizeNullableId(actorUserId),
    note: `${outcome} via promotion`,
    promotedFromMembershipId: sourceMembership._id
  });
}
async function applyPromotions(payload = {}, actorUserId = null) {
  const state = await resolvePromotionPreviewState(payload);
  const effectiveAt = toDateOrNull(payload.effectiveAt) || new Date();
  const items = [];

  for (const item of state.items) {
    const existingTransaction = await populatePromotionTransactionQuery(
      PromotionTransaction.findOne({
        sessionId: state.session?._id || null,
        studentMembershipId: item.sourceMembership._id,
        targetAcademicYearId: item.targetAcademicYear?._id || null,
        transactionStatus: 'applied'
      }).sort({ createdAt: -1 })
    );

    if (existingTransaction) {
      items.push(formatPromotionTransaction(existingTransaction));
      continue;
    }

    const sourceSnapshot = snapshotMembershipState(item.sourceMembership);
    let promotionOutcome = item.computedOutcome;
    let targetMembership = null;
    let note = normalizeText(item.issueCode);

    if (!item.canApply && promotionOutcome !== 'graduated') {
      promotionOutcome = 'blocked';
    } else if (needsGeneratedMembership(item.computedOutcome, state.rule)) {
      targetMembership = await upsertGeneratedMembership({
        sourceMembership: item.sourceMembership,
        targetAcademicYear: item.targetAcademicYear,
        targetClass: item.targetClass,
        targetCourseId: item.targetCourseId,
        outcome: item.computedOutcome,
        rule: state.rule,
        actorUserId,
        effectiveAt
      });

      if (!targetMembership) {
        promotionOutcome = 'blocked';
        note = note || 'membership_generation_failed';
      }
    }

    if (promotionOutcome !== 'blocked' && (promotionOutcome === 'graduated' || targetMembership)) {
      await closeSourceMembership(item.sourceMembership, promotionOutcome, effectiveAt);
    }

    const transaction = await PromotionTransaction.create({
      ruleId: state.rule._id,
      sessionId: state.session?._id || null,
      examResultId: item.examResult?._id || null,
      studentMembershipId: item.sourceMembership._id,
      targetMembershipId: targetMembership?._id || null,
      studentId: item.studentCore?._id || item.sourceMembership.studentId || null,
      student: item.studentUser?._id || item.sourceMembership.student || null,
      academicYearId: state.session?.academicYearId?._id || state.session?.academicYearId || normalizeNullableId(state.scopeAcademicYearId) || null,
      targetAcademicYearId: item.targetAcademicYear?._id || null,
      assessmentPeriodId: state.session?.assessmentPeriodId?._id || state.session?.assessmentPeriodId || null,
      classId: item.sourceMembership.classId?._id || item.sourceMembership.classId || null,
      targetClassId: item.targetClass?._id || null,
      sourceResultStatus: normalizeText(item.policyEvaluation?.sourceResultStatus || item.examResult?.resultStatus),
      promotionOutcome,
      transactionStatus: 'applied',
      generatedMembershipStatus: targetMembership ? normalizeText(targetMembership.status) : item.generatedMembershipStatus,
      decidedAt: effectiveAt,
      appliedAt: effectiveAt,
      sourceMembershipStatusBefore: sourceSnapshot.status,
      sourceMembershipEndedReasonBefore: sourceSnapshot.endedReason,
      sourceMembershipEndedAtBefore: sourceSnapshot.endedAt,
      sourceMembershipLeftAtBefore: sourceSnapshot.leftAt,
      sourceMembershipIsCurrentBefore: sourceSnapshot.isCurrent,
      createdBy: normalizeNullableId(actorUserId),
      appliedBy: normalizeNullableId(actorUserId),
      note
    });

    const populated = await populatePromotionTransactionQuery(PromotionTransaction.findById(transaction._id));
    items.push(formatPromotionTransaction(populated));
  }

  return {
    session: formatExamSession(state.session),
    rule: formatPromotionRule(state.rule),
    targetAcademicYear: formatAcademicYear(state.targetAcademicYear),
    summary: summarizePromotionItems(items),
    items
  };
}

async function getPromotionTransaction(transactionId) {
  const normalizedId = normalizeNullableId(transactionId);
  if (!normalizedId) return null;

  const item = await populatePromotionTransactionQuery(PromotionTransaction.findById(normalizedId));
  return item ? formatPromotionTransaction(item) : null;
}

async function rollbackPromotionTransaction(transactionId, payload = {}, actorUserId = null) {
  const normalizedId = normalizeNullableId(transactionId);
  if (!normalizedId) {
    throw new Error('promotion_transaction_not_found');
  }

  const transaction = await PromotionTransaction.findById(normalizedId);
  if (!transaction) {
    throw new Error('promotion_transaction_not_found');
  }
  if (transaction.transactionStatus === 'rolled_back') {
    const existing = await populatePromotionTransactionQuery(PromotionTransaction.findById(normalizedId));
    return formatPromotionTransaction(existing);
  }
  if (transaction.transactionStatus !== 'applied') {
    throw new Error('promotion_transaction_not_applied');
  }

  const rollbackAt = toDateOrNull(payload.rolledBackAt || payload.effectiveAt) || new Date();
  const sourceMembership = await StudentMembership.findById(transaction.studentMembershipId);
  if (!sourceMembership) {
    throw new Error('promotion_source_membership_not_found');
  }

  const targetMembershipId = normalizeNullableId(transaction.targetMembershipId);
  let targetMembership = null;
  if (targetMembershipId) {
    const downstreamCount = await PromotionTransaction.countDocuments({
      studentMembershipId: targetMembershipId,
      transactionStatus: 'applied',
      _id: { $ne: transaction._id }
    });
    if (downstreamCount) {
      throw new Error('promotion_rollback_blocked_by_downstream_transactions');
    }

    targetMembership = await StudentMembership.findById(targetMembershipId);
    if (!targetMembership) {
      throw new Error('promotion_target_membership_not_found');
    }

    await retireGeneratedMembership(targetMembership, rollbackAt);
  }

  await restoreMembershipSnapshot(sourceMembership, transaction);

  transaction.transactionStatus = 'rolled_back';
  transaction.rolledBackAt = rollbackAt;
  transaction.rollbackReason = normalizeText(payload.reason || payload.rollbackReason);
  transaction.rolledBackBy = normalizeNullableId(actorUserId);
  transaction.note = appendMembershipNote(
    transaction.note,
    transaction.rollbackReason ? `rollback: ${transaction.rollbackReason}` : 'rolled back'
  );
  await transaction.save();

  const populated = await populatePromotionTransactionQuery(PromotionTransaction.findById(transaction._id));
  return formatPromotionTransaction(populated);
}

async function listPromotionTransactions(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.ruleId)) query.ruleId = filters.ruleId;
  if (normalizeNullableId(filters.sessionId)) query.sessionId = filters.sessionId;
  if (normalizeNullableId(filters.academicYearId)) query.academicYearId = filters.academicYearId;
  if (normalizeNullableId(filters.classId)) query.classId = filters.classId;
  if (normalizeNullableId(filters.targetAcademicYearId)) query.targetAcademicYearId = filters.targetAcademicYearId;
  if (normalizeNullableId(filters.studentMembershipId)) query.studentMembershipId = filters.studentMembershipId;
  if (normalizeNullableId(filters.studentId)) query.studentId = filters.studentId;
  if (normalizeText(filters.promotionOutcome)) query.promotionOutcome = normalizeText(filters.promotionOutcome);
  if (normalizeText(filters.transactionStatus)) query.transactionStatus = normalizeText(filters.transactionStatus);

  const items = await populatePromotionTransactionQuery(
    PromotionTransaction.find(query).sort({ decidedAt: -1, createdAt: -1 })
  );

  return items.map(formatPromotionTransaction);
}

module.exports = {
  applyPromotions,
  createPromotionRule,
  getPromotionTransaction,
  listPromotionReferenceData,
  listPromotionRules,
  listPromotionTransactions,
  previewPromotions,
  rollbackPromotionTransaction,
  seedPromotionReferenceData
};
