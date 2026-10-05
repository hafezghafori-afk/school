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
const AfghanStudent = require('../models/AfghanStudent');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const PromotionRule = require('../models/PromotionRule');
const PromotionBatch = require('../models/PromotionBatch');
const PromotionTransaction = require('../models/PromotionTransaction');
const { evaluateClassOfficialResults } = require('./classAggregateResultService');
const {
  syncAfghanStudentLifecycleProjection,
  updateClassActiveCount
} = require('./studentLifecycleService');
const { CURRENT_STUDENT_MEMBERSHIP_STATUSES } = require('../utils/studentMembershipStatus');
const { billOutstanding, secondChanceIssuanceKey } = require('../utils/secondChanceFee');
const {
  buildPromotionFinancePreview,
  cancelCarriedReliefs,
  carryReliefsToMembership,
  findTargetClassesWithoutFeePlan,
  selectReliefsToCarry,
  settleSourceMembershipBilling
} = require('./promotionFinanceService');
const {
  ACTIONABLE_OUTCOMES,
  LIVE_TRANSACTION_STATUSES,
  academicYearOrder,
  buildPlanIssue,
  classTargetIssues,
  finalizeOutcome,
  idOf,
  isTerminalClass,
  normalizeStudentOverrides,
  resolvePromotionDates,
  selectTargetClass,
  summarizeTargetCapacity,
  targetModeForOutcome
} = require('./promotionPlanning');

const SCORE_BREAKDOWN_KEYS = ['writtenScore', 'oralScore', 'classActivityScore', 'homeworkScore'];
const CLASS_SELECT = 'title titleDari code gradeLevel section genderType shift shiftId capacity currentStudents status academicYearId legacyCourseId schoolId';
// Outcomes that ended the source membership when they were applied.
const SOURCE_CLOSING_OUTCOMES = Object.freeze(['promoted', 'repeated', 'graduated']);
// A promoted/repeating student's new membership is billable from the start of
// the target year (agreed in phase 2); billing only picks up active ones.
const GENERATED_MEMBERSHIP_STATUS = 'active';

function promotionError(code, details = null) {
  const error = new Error(code);
  if (details) error.details = details;
  return error;
}

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

function isCurrentMembership(membership) {
  return Boolean(membership)
    && membership.isCurrent !== false
    && CURRENT_STUDENT_MEMBERSHIP_STATUSES.includes(normalizeText(membership.status));
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
    isActive: Boolean(item.isActive),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    startDateLocal: normalizeText(item.startDateLocal),
    endDateLocal: normalizeText(item.endDateLocal)
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
    genderType: normalizeText(item.genderType),
    shift: normalizeText(item.shift),
    shiftId: item.shiftId ? String(item.shiftId._id || item.shiftId) : '',
    capacity: Number(item.capacity) || 0,
    currentStudents: Number(item.currentStudents) || 0,
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

function formatStudentIdentity({ studentCore = null, user = null, afghanStudent = null } = {}) {
  const core = toPlain(studentCore);
  const account = toPlain(user);
  // Only a populated AfghanStudent carries asasNumber; a bare id doesn't.
  const registry = afghanStudent && typeof afghanStudent === 'object' && 'asasNumber' in afghanStudent ? afghanStudent : null;
  return {
    studentId: core ? String(core._id || '') : '',
    userId: account ? String(account._id || '') : '',
    fullName: normalizeText(core?.fullName) || normalizeText(core?.preferredName) || normalizeText(account?.name),
    email: normalizeText(core?.email) || normalizeText(account?.email),
    // «نمبر اساس» tells same-named students apart in every list and print.
    asasNumber: normalizeText(registry?.asasNumber),
    admissionNo: normalizeText(core?.admissionNo)
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
    student: formatStudentIdentity({ studentCore: item.studentId, user: item.student, afghanStudent: item.afghanStudentId }),
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
    batchId: item.batchId ? String(item.batchId._id || item.batchId) : '',
    promotionOutcome: normalizeText(item.promotionOutcome),
    transactionStatus: normalizeText(item.transactionStatus),
    sourceResultStatus: normalizeText(item.sourceResultStatus),
    generatedMembershipStatus: normalizeText(item.generatedMembershipStatus),
    targetMembershipGenerated: item.targetMembershipGenerated !== false,
    heldOutcome: normalizeText(item.heldOutcome),
    averageScore: item.averageScore ?? null,
    failedSubjects: (Array.isArray(item.failedSubjects) ? item.failedSubjects : []).map((subject) => ({
      subjectId: subject?.subjectId ? String(subject.subjectId) : '',
      subjectTitle: normalizeText(subject?.subjectTitle),
      percentage: Number(subject?.percentage) || 0
    })),
    financeEffects: {
      outstandingAtPromotion: Number(item.financeEffects?.outstandingAtPromotion || 0),
      voidedBills: Number(item.financeEffects?.voidedBills || 0),
      voidedOrders: Number(item.financeEffects?.voidedOrders || 0),
      refundCases: Number(item.financeEffects?.refundCases || 0),
      reviewRequired: (item.financeEffects?.reviewRequired || []).map((entry) => ({ ...entry })),
      plannedReliefs: (item.financeEffects?.plannedReliefs || []).map((entry) => ({ sourceModel: entry.sourceModel, id: entry.id })),
      carriedReliefs: (item.financeEffects?.carriedReliefs || []).map((entry) => ({ ...entry }))
    },
    secondChanceFee: {
      status: normalizeText(item.secondChanceFee?.status),
      billId: item.secondChanceFee?.billId ? String(item.secondChanceFee.billId._id || item.secondChanceFee.billId) : '',
      amount: Number(item.secondChanceFee?.amount || 0),
      waiverReason: normalizeText(item.secondChanceFee?.waiverReason)
    },
    decidedAt: item.decidedAt || null,
    appliedAt: item.appliedAt || null,
    resolvedAt: item.resolvedAt || null,
    resolvedBy: formatUserRef(item.resolvedBy),
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

function formatPromotionBatch(doc, transactions = null) {
  const item = toPlain(doc);
  if (!item) return null;
  const summary = item.summary || {};
  return {
    id: String(item._id || item.id || ''),
    status: normalizeText(item.status),
    isTerminal: Boolean(item.isTerminal),
    sourceEndAt: item.sourceEndAt || null,
    targetStartAt: item.targetStartAt || null,
    appliedAt: item.appliedAt || null,
    rolledBackAt: item.rolledBackAt || null,
    rollbackReason: normalizeText(item.rollbackReason),
    note: normalizeText(item.note),
    warnings: Array.isArray(item.warnings) ? item.warnings : [],
    summary: {
      total: Number(summary.total || 0),
      promoted: Number(summary.promoted || 0),
      repeated: Number(summary.repeated || 0),
      conditional: Number(summary.conditional || 0),
      graduated: Number(summary.graduated || 0),
      notApplied: Number(summary.notApplied || 0)
    },
    financeSummary: {
      studentsWithDebt: Number(item.financeSummary?.studentsWithDebt || 0),
      debtAmount: Number(item.financeSummary?.debtAmount || 0),
      voidedDocuments: Number(item.financeSummary?.voidedDocuments || 0),
      refundCases: Number(item.financeSummary?.refundCases || 0),
      reviewRequired: Number(item.financeSummary?.reviewRequired || 0),
      carriedReliefs: Number(item.financeSummary?.carriedReliefs || 0),
      failedReliefs: Number(item.financeSummary?.failedReliefs || 0)
    },
    rule: item.ruleId?._id ? { id: String(item.ruleId._id), name: normalizeText(item.ruleId.name), code: normalizeText(item.ruleId.code) } : null,
    sourceAcademicYear: formatAcademicYear(item.sourceAcademicYearId),
    sourceClass: formatSchoolClass(item.sourceClassId),
    targetAcademicYear: formatAcademicYear(item.targetAcademicYearId),
    promotedClass: formatSchoolClass(item.promotedClassId),
    repeatClass: formatSchoolClass(item.repeatClassId),
    createdBy: formatUserRef(item.createdBy),
    rolledBackBy: formatUserRef(item.rolledBackBy),
    notApplied: (Array.isArray(item.notApplied) ? item.notApplied : []).map((entry) => ({
      studentMembershipId: entry.studentMembershipId ? String(entry.studentMembershipId) : '',
      fullName: normalizeText(entry.fullName),
      outcome: normalizeText(entry.outcome),
      issueCode: normalizeText(entry.issueCode)
    })),
    overrides: (Array.isArray(item.overrides) ? item.overrides : []).map((entry) => ({
      studentMembershipId: entry.studentMembershipId ? String(entry.studentMembershipId) : '',
      targetClassId: entry.targetClassId ? String(entry.targetClassId) : '',
      exclude: Boolean(entry.exclude),
      reason: normalizeText(entry.reason)
    })),
    ...(transactions ? { transactions: transactions.map(formatPromotionTransaction) } : {})
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
    promotedMembershipStatus: 'active',
    repeatedMembershipStatus: 'active',
    conditionalMembershipStatus: 'active',
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

  // The nearest year that comes after the source one (by start date, then
  // sequence, then the year number in its title). The old fallback to "the
  // active year" could hand back a year older than the source.
  const years = await AcademicYear.find({ _id: { $ne: sourceAcademicYear._id } }).sort({ startDate: 1, sequence: 1, createdAt: 1 });
  const later = years.filter((item) => academicYearOrder(sourceAcademicYear, item) === 'after');
  return later.find((candidate) => later.every((other) => other === candidate || academicYearOrder(candidate, other) !== 'before')) || null;
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

async function resolveCourseForTargetClass(targetClass) {
  if (!targetClass) return null;
  if (targetClass.legacyCourseId) return String(targetClass.legacyCourseId);

  const directCourse = await Course.findOne({ schoolClassRef: targetClass._id, kind: 'academic_class' }).select('_id').sort({ isActive: -1, createdAt: -1 }).lean();
  return directCourse?._id ? String(directCourse._id) : null;
}

function populatePromotionTransactionQuery(query) {
  return query
    .populate('ruleId')
    .populate({ path: 'sessionId', populate: ['academicYearId', 'assessmentPeriodId', { path: 'classId', populate: { path: 'academicYearId' } }, 'examTypeId'] })
    .populate({ path: 'studentMembershipId', populate: [{ path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }, { path: 'studentId' }, { path: 'student', select: 'name email' }, { path: 'afghanStudentId', select: 'asasNumber' }] })
    .populate({ path: 'targetMembershipId', populate: [{ path: 'classId', populate: { path: 'academicYearId' } }, { path: 'academicYearId' }, { path: 'studentId' }, { path: 'student', select: 'name email' }, { path: 'afghanStudentId', select: 'asasNumber' }] })
    .populate('targetAcademicYearId')
    .populate({ path: 'targetClassId', populate: { path: 'academicYearId' } })
    .populate('createdBy', 'name email role orgRole')
    .populate('appliedBy', 'name email role orgRole')
    .populate('resolvedBy', 'name email role orgRole')
    .populate('rolledBackBy', 'name email role orgRole');
}

function populatePromotionBatchQuery(query) {
  return query
    .populate('ruleId', 'name code')
    .populate('sourceAcademicYearId')
    .populate({ path: 'sourceClassId', populate: { path: 'academicYearId' } })
    .populate('targetAcademicYearId')
    .populate({ path: 'promotedClassId', populate: { path: 'academicYearId' } })
    .populate({ path: 'repeatClassId', populate: { path: 'academicYearId' } })
    .populate('createdBy', 'name email role orgRole')
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

// Memberships passed in here were loaded with the transaction's session, so
// their save() runs inside it.
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
    alreadyProcessed: 0,
    canApply: 0
  };

  items.forEach((item) => {
    if (normalizeText(item.issueCode) === 'already_processed') {
      summary.alreadyProcessed += 1;
    } else {
      const key = normalizeText(item.computedOutcome || item.promotionOutcome || 'blocked');
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        summary[key] += 1;
      }
    }
    if (item.canApply === true || LIVE_TRANSACTION_STATUSES.includes(normalizeText(item.transactionStatus))) {
      summary.canApply += 1;
    }
  });

  return summary;
}

function isTransactionUnsupported(error) {
  const message = String(error?.message || '');
  return /Transaction numbers are only allowed|replica set|mongos|transactions are not supported/i.test(message);
}

// Promotion moves a whole class at once; a failure halfway must not leave half
// of it in the new year, so every write runs in one MongoDB transaction.
async function runInTransaction(work) {
  const dbSession = await mongoose.startSession();
  let result = null;
  try {
    await dbSession.withTransaction(async () => {
      result = await work(dbSession);
    });
  } catch (error) {
    if (isTransactionUnsupported(error)) {
      throw promotionError('promotion_transactions_required');
    }
    throw error;
  } finally {
    await dbSession.endSession();
  }
  return result;
}

function invalidateFinanceReports() {
  // Ending/creating memberships changes which students the cached debtor and
  // class reports count as active.
  try {
    // eslint-disable-next-line global-require
    require('../utils/financeReportCache').invalidateAll();
  } catch {
    // The cache is an optimisation; a failure here must not undo a promotion.
  }
}

function filterBySourceMembershipIds(memberships = [], sourceMembershipIds = []) {
  if (!Array.isArray(sourceMembershipIds) || !sourceMembershipIds.length) return memberships;
  const ids = new Set(sourceMembershipIds.map((item) => normalizeNullableId(item)).filter(Boolean));
  return memberships.filter((membership) => ids.has(idOf(membership)));
}

// A student can hold several memberships in one class and year (left and came
// back); the current one speaks for them, otherwise the most recent ended one
// (which is how an already-promoted student still shows up in the preview).
function pickMembershipPerStudent(memberships = []) {
  const byStudent = new Map();
  memberships.forEach((membership) => {
    const key = idOf(membership.student) || idOf(membership);
    const existing = byStudent.get(key);
    if (!existing) {
      byStudent.set(key, membership);
      return;
    }
    const existingCurrent = isCurrentMembership(existing);
    const nextCurrent = isCurrentMembership(membership);
    if (nextCurrent !== existingCurrent) {
      if (nextCurrent) byStudent.set(key, membership);
      return;
    }
    if (new Date(membership.updatedAt || 0) > new Date(existing.updatedAt || 0)) byStudent.set(key, membership);
  });
  return Array.from(byStudent.values());
}

async function loadOfficialResultEntries({ payload, rule, scopeAcademicYearId, scopeClassId }) {
  const classOfficialResults = await evaluateClassOfficialResults({
    academicYearId: scopeAcademicYearId,
    classId: scopeClassId
  });

  const memberships = await StudentMembership.find({
    classId: scopeClassId,
    status: { $ne: 'rejected' },
    $or: [{ academicYearId: scopeAcademicYearId }, { academicYear: scopeAcademicYearId }]
  })
    .populate({ path: 'classId', populate: { path: 'academicYearId' } })
    .populate('academicYearId')
    .populate('studentId')
    .populate('student', 'name email')
    .populate('afghanStudentId', 'asasNumber');

  const entries = filterBySourceMembershipIds(pickMembershipPerStudent(memberships), payload.sourceMembershipIds)
    .map((membership) => ({
      membership,
      examResult: null,
      studentCore: membership.studentId || null,
      studentUser: membership.student || null,
      policyEvaluation: evaluateOfficialGeneralResultForMembership({
        membershipId: membership._id,
        classOfficialResults,
        rule
      })
    }));

  return { entries, classReadiness: classOfficialResults.readiness };
}

async function loadSessionResultEntries({ payload, rule, session }) {
  if (!session) {
    throw promotionError('promotion_session_required');
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
        { path: 'student', select: 'name email' },
        { path: 'afghanStudentId', select: 'asasNumber' }
      ]
    })
    .populate('studentId')
    .populate('student', 'name email')
    .populate('subjectId')
    .populate({ path: 'examTypeId' })
    .populate({ path: 'assessmentPeriodId' })
    .sort({ rank: 1, percentage: -1, createdAt: 1 });

  const sessionYearId = session.academicYearId?._id || session.academicYearId;
  const sessionClassId = session.classId?._id || session.classId;
  const membershipIds = results.map((result) => normalizeNullableId(result.studentMembershipId?._id || result.studentMembershipId)).filter(Boolean);
  const allYearSessions = await ExamSession.find({
    academicYearId: sessionYearId,
    classId: sessionClassId,
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
        academicYearId: sessionYearId,
        classId: sessionClassId,
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
      { 'scope.academicYearId': sessionYearId },
      { 'scope.classId': sessionClassId }
    ]
  }).sort({ 'ownership.isDefault': -1, createdAt: -1 }).limit(10);

  const isResultStatusMode = normalizeText(rule.evaluationMode) === 'result_status';
  const entries = [];
  const seenMemberships = new Set();
  for (const result of results) {
    const membership = result.studentMembershipId;
    // One student, one decision - a session can carry more than one result row per membership.
    if (!membership || seenMemberships.has(idOf(membership))) continue;
    seenMemberships.add(idOf(membership));

    const policyEvaluation = isResultStatusMode
      ? buildLegacyPolicyEvaluation(result, resolvePromotionOutcome(rule, result.resultStatus))
      : evaluateScorePolicyForMembership({
          membershipId: membership._id,
          resultsByMembership,
          sessions: scorePolicySessions.length ? scorePolicySessions : allYearSessions,
          rule,
          sheetTemplates
        });
    if (isResultStatusMode && policyEvaluation.computedOutcome === 'blocked' && !policyEvaluation.issueCode) {
      policyEvaluation.issueCode = 'result_status_not_mapped';
    }

    entries.push({
      membership,
      examResult: result,
      studentCore: result.studentId || membership.studentId || null,
      studentUser: result.student || membership.student || null,
      policyEvaluation
    });
  }

  return { entries, classReadiness: null };
}

async function findTargetClassById(targetClasses = [], classId = '') {
  const normalizedId = normalizeNullableId(classId);
  if (!normalizedId) return null;
  return targetClasses.find((item) => idOf(item) === normalizedId)
    || SchoolClass.findById(normalizedId).select(CLASS_SELECT).populate('academicYearId');
}

// The class-level decisions an operator makes once for the whole batch: the
// target year, the class that takes the promoted students and the one that
// takes the repeaters. An explicitly chosen class that isn't a legal
// destination blocks the apply outright; a class the system had to guess only
// warns when it is ambiguous.
async function buildPromotionPlan({ payload, rule, sourceAcademicYear, sourceClass, targetAcademicYear, targetClasses }) {
  const blockers = [];
  const warnings = [];
  const targetAcademicYearId = idOf(targetAcademicYear);

  if (!sourceAcademicYear) blockers.push(buildPlanIssue('source_year_not_found', 'source'));
  if (!sourceClass) blockers.push(buildPlanIssue('source_class_not_found', 'source'));
  if (!targetAcademicYear) {
    blockers.push(buildPlanIssue('target_year_not_resolved', 'target_year'));
  } else if (sourceAcademicYear) {
    const order = academicYearOrder(sourceAcademicYear, targetAcademicYear);
    if (order === 'same') blockers.push(buildPlanIssue('target_year_same_as_source', 'target_year'));
    else if (order === 'before') blockers.push(buildPlanIssue('target_year_before_source', 'target_year'));
    else if (order === 'unknown') warnings.push(buildPlanIssue('target_year_order_unknown', 'target_year'));
  }

  const isTerminal = Boolean(rule?.isTerminalClass) || isTerminalClass(sourceClass);

  const resolveSlot = async ({ explicitId, mode, field }) => {
    const ranked = selectTargetClass({ candidates: targetClasses, sourceClass, mode, targetAcademicYearId });
    if (!explicitId) {
      return { targetClass: ranked.targetClass, ambiguous: ranked.ambiguous, candidates: ranked.candidates };
    }
    const chosen = await findTargetClassById(targetClasses, explicitId);
    const issues = classTargetIssues({ sourceClass, targetClass: chosen, mode, targetAcademicYearId });
    issues.forEach((code) => blockers.push(buildPlanIssue(code, field, { mode })));
    return { targetClass: issues.length ? null : chosen, ambiguous: false, candidates: ranked.candidates };
  };

  const promoted = isTerminal
    ? { targetClass: null, ambiguous: false, candidates: [] }
    : await resolveSlot({
        explicitId: normalizeNullableId(payload.promotedClassId) || normalizeNullableId(payload.targetClassId) || normalizeNullableId(rule?.targetClassId),
        mode: 'promoted',
        field: 'promoted_class'
      });
  const repeat = await resolveSlot({
    explicitId: normalizeNullableId(payload.repeatClassId),
    mode: 'repeated',
    field: 'repeat_class'
  });

  const dates = resolvePromotionDates({ payload, sourceAcademicYear, targetAcademicYear });
  dates.warnings.forEach((code) => warnings.push(buildPlanIssue(code, 'dates')));

  return {
    sourceAcademicYear,
    sourceClass,
    targetAcademicYear,
    isTerminal,
    promotedClass: promoted.targetClass,
    promotedAmbiguous: promoted.ambiguous,
    promotedCandidates: promoted.candidates,
    repeatClass: repeat.targetClass,
    repeatAmbiguous: repeat.ambiguous,
    repeatCandidates: repeat.candidates,
    dates: { sourceEndAt: dates.sourceEndAt, targetStartAt: dates.targetStartAt },
    blockers,
    warnings,
    capacity: []
  };
}

// Per student: what happens, which class they land in, and why not if they
// can't move. Only promoted/repeated students get a new membership;
// conditional (مشروط) ones are held for the second-chance exam.
async function buildPreviewItems({ entries = [], plan, rule, payload, targetAcademicYear, targetClasses }) {
  const overrides = normalizeStudentOverrides(payload.studentOverrides);
  const membershipIds = entries.map((entry) => entry.membership._id);
  const studentIds = [...new Set(entries.map((entry) => idOf(entry.membership.student)).filter(Boolean))];
  const [liveTransactions, targetYearMemberships] = await Promise.all([
    membershipIds.length
      ? PromotionTransaction.find({
          studentMembershipId: { $in: membershipIds },
          transactionStatus: { $in: LIVE_TRANSACTION_STATUSES },
          promotionOutcome: { $in: ACTIONABLE_OUTCOMES }
        }).select('_id studentMembershipId promotionOutcome transactionStatus batchId').lean()
      : [],
    targetAcademicYear && studentIds.length
      ? StudentMembership.find({
          student: { $in: studentIds },
          isCurrent: true,
          status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES },
          $or: [{ academicYearId: targetAcademicYear._id }, { academicYear: targetAcademicYear._id }]
        }).select('_id student classId status').lean()
      : []
  ]);
  const liveByMembership = new Map(liveTransactions.map((item) => [idOf(item.studentMembershipId), item]));
  const targetYearByStudent = new Map(targetYearMemberships.map((item) => [idOf(item.student), item]));
  const targetAcademicYearId = idOf(targetAcademicYear);
  const courseCache = new Map();
  const courseFor = async (targetClass) => {
    const key = idOf(targetClass);
    if (!courseCache.has(key)) courseCache.set(key, await resolveCourseForTargetClass(targetClass));
    return courseCache.get(key);
  };

  const items = [];
  for (const entry of entries) {
    const membership = entry.membership;
    const membershipId = idOf(membership);
    const sourceClass = membership.classId?._id ? membership.classId : plan.sourceClass;
    const override = overrides.get(membershipId) || null;
    const base = {
      ...entry,
      sourceMembership: membership,
      override,
      targetAcademicYear,
      targetClass: null,
      targetCourseId: null,
      reuseMembershipId: null,
      existingTransactionId: '',
      generatedMembershipStatus: ''
    };
    const stop = (computedOutcome, issueCode, extra = {}) => items.push({ ...base, computedOutcome, issueCode, canApply: false, ...extra });

    const live = liveByMembership.get(membershipId);
    if (live) {
      stop(live.promotionOutcome, 'already_processed', { existingTransactionId: idOf(live), existingTransactionStatus: live.transactionStatus });
      continue;
    }
    if (!isCurrentMembership(membership)) {
      stop('skipped', 'membership_not_current');
      continue;
    }
    if (override?.exclude) {
      stop('skipped', 'excluded_by_operator');
      continue;
    }

    const computedOutcome = finalizeOutcome({ computedOutcome: entry.policyEvaluation?.computedOutcome, sourceClass, rule });
    if (!ACTIONABLE_OUTCOMES.includes(computedOutcome) || entry.policyEvaluation?.issueCode) {
      stop(computedOutcome || 'blocked', entry.policyEvaluation?.issueCode || 'outcome_not_actionable');
      continue;
    }
    if (computedOutcome === 'conditional' || computedOutcome === 'graduated') {
      items.push({ ...base, computedOutcome, issueCode: '', canApply: true });
      continue;
    }

    const mode = targetModeForOutcome(computedOutcome);
    if (!targetAcademicYear) {
      stop(computedOutcome, 'target_year_not_resolved');
      continue;
    }
    let targetClass = mode === 'promoted' ? plan.promotedClass : plan.repeatClass;
    if (override?.targetClassId) {
      const chosen = await findTargetClassById(targetClasses, override.targetClassId);
      const issues = classTargetIssues({ sourceClass, targetClass: chosen, mode, targetAcademicYearId });
      if (issues.length) {
        stop(computedOutcome, `override_${issues[0]}`);
        continue;
      }
      targetClass = chosen;
    }
    if (!targetClass) {
      stop(computedOutcome, 'target_class_not_resolved');
      continue;
    }
    const targetCourseId = await courseFor(targetClass);
    if (!targetCourseId) {
      stop(computedOutcome, 'target_course_not_resolved', { targetClass });
      continue;
    }
    const existing = targetYearByStudent.get(idOf(membership.student));
    if (existing && idOf(existing.classId) !== idOf(targetClass)) {
      stop(computedOutcome, 'student_already_enrolled_in_target_year', { targetClass });
      continue;
    }

    items.push({
      ...base,
      computedOutcome,
      issueCode: '',
      canApply: true,
      targetClass,
      targetCourseId,
      reuseMembershipId: existing ? idOf(existing) : null,
      generatedMembershipStatus: GENERATED_MEMBERSHIP_STATUS
    });
  }
  return items;
}

async function finalizePlanAfterItems({ plan, items, targetClasses }) {
  const used = (outcome, issueCode = '') => items.some((item) => item.computedOutcome === outcome && (!issueCode || item.issueCode === issueCode));
  if (plan.targetAcademicYear) {
    if (!plan.promotedClass && used('promoted', 'target_class_not_resolved')) plan.warnings.push(buildPlanIssue('promoted_class_not_resolved', 'promoted_class'));
    if (!plan.repeatClass && used('repeated', 'target_class_not_resolved')) plan.warnings.push(buildPlanIssue('repeat_class_not_resolved', 'repeat_class'));
    if (plan.promotedAmbiguous && used('promoted')) plan.warnings.push(buildPlanIssue('promoted_class_ambiguous', 'promoted_class'));
    if (plan.repeatAmbiguous && used('repeated')) plan.warnings.push(buildPlanIssue('repeat_class_ambiguous', 'repeat_class'));
  }

  const incomingByClassId = new Map();
  items.forEach((item) => {
    if (!item.canApply || !item.targetClass || item.reuseMembershipId) return;
    const key = idOf(item.targetClass);
    incomingByClassId.set(key, (incomingByClassId.get(key) || 0) + 1);
  });
  const classIds = [...incomingByClassId.keys()];
  const currentRows = classIds.length
    ? await StudentMembership.aggregate([
        {
          $match: {
            classId: { $in: classIds.map((id) => new mongoose.Types.ObjectId(id)) },
            isCurrent: true,
            status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
          }
        },
        { $group: { _id: '$classId', count: { $sum: 1 } } }
      ])
    : [];
  const currentByClassId = new Map(currentRows.map((row) => [String(row._id), row.count]));
  plan.capacity = summarizeTargetCapacity({ targetClasses, incomingByClassId, currentByClassId });
  plan.capacity.filter((row) => row.overCapacity).forEach((row) => {
    const issue = buildPlanIssue('target_class_over_capacity', 'capacity');
    plan.warnings.push({
      ...issue,
      classId: row.classId,
      message: `${issue.message} (${row.title}${row.code ? ` — ${row.code}` : ''}: ${row.projected} از ${row.capacity})`
    });
  });
}

function financeAmountLabel(value) {
  return `${(Math.round((Number(value) || 0) * 100) / 100).toLocaleString('en-US')} افغانی`;
}

// Phase 2: each student's finance picture and the reliefs that would follow
// them. A source-year debt only warns (agreed); documents dated after the end
// are settled on apply; a target class without a fee plan warns once.
async function attachFinancePreview({ plan, items, payload }) {
  const financeByMembership = await buildPromotionFinancePreview({
    membershipIds: items.map((item) => item.sourceMembership?._id),
    sourceEndAt: plan.dates.sourceEndAt
  });
  let studentsWithDebt = 0;
  let debtAmount = 0;
  let studentsWithPostEndDocuments = 0;
  items.forEach((item) => {
    const finance = financeByMembership.get(idOf(item.sourceMembership)) || null;
    item.finance = finance;
    item.reliefsToCarry = finance && item.canApply && ['promoted', 'repeated', 'conditional'].includes(item.computedOutcome)
      ? selectReliefsToCarry({ payload, membershipId: idOf(item.sourceMembership), available: finance.reliefs })
      : [];
    if (!item.canApply || !finance) return;
    if (finance.outstanding > 0) {
      studentsWithDebt += 1;
      debtAmount += finance.outstanding;
    }
    if (finance.postEndUnpaid.length || finance.postEndPaid.length) studentsWithPostEndDocuments += 1;
  });

  if (studentsWithDebt) {
    plan.warnings.push({
      code: 'source_year_debt',
      field: 'finance',
      message: `مالی: ${studentsWithDebt} شاگرد از سال مبدا ${financeAmountLabel(debtAmount)} باقی دارند؛ مانع ارتقا نیست و به‌عنوان بقایای همان سال در حساب شاگرد می‌ماند.`
    });
  }
  if (studentsWithPostEndDocuments) {
    plan.warnings.push({
      code: 'source_post_end_documents',
      field: 'finance',
      message: `مالی: ${studentsWithPostEndDocuments} شاگرد بل یا پرداختی برای ماه‌های بعد از ختم عضویت در صنف مبدا دارند؛ بل پرداخت‌نشده باطل می‌شود (مگر ماهش بسته باشد) و پرداخت‌شده برای اعتبار در سال جدید به بخش مالی فرستاده می‌شود.`
    });
  }

  const usedTargetClasses = new Map();
  items.forEach((item) => {
    if (item.canApply && item.targetClass) usedTargetClasses.set(idOf(item.targetClass), item.targetClass);
  });
  const withoutPlan = await findTargetClassesWithoutFeePlan({
    targetClasses: Array.from(usedTargetClasses.values()),
    targetAcademicYear: plan.targetAcademicYear
  });
  withoutPlan.forEach((schoolClass) => plan.warnings.push({
    code: 'target_fee_plan_missing',
    field: 'finance',
    classId: idOf(schoolClass),
    message: `مالی: برای «${normalizeText(schoolClass.title)}${schoolClass.code ? ` — ${normalizeText(schoolClass.code)}` : ''}» در سال مقصد پلان فیس تعریف نشده؛ تا تعریف نشود برای این شاگردان در سال جدید بل ساخته نمی‌شود.`
  }));

  plan.finance = {
    studentsWithDebt,
    debtAmount: Math.round(debtAmount * 100) / 100,
    studentsWithPostEndDocuments,
    targetClassesWithoutFeePlan: withoutPlan.map((schoolClass) => idOf(schoolClass))
  };
}

async function resolvePromotionPreviewState(payload = {}) {
  const sessionId = normalizeNullableId(payload.sessionId);
  const explicitAcademicYearId = normalizeNullableId(payload.academicYearId);
  const explicitClassId = normalizeNullableId(payload.classId);
  if (!sessionId && !(explicitAcademicYearId && explicitClassId)) {
    throw promotionError('promotion_session_required');
  }

  let session = sessionId ? await resolvePromotionSession(sessionId) : null;
  const scopeAcademicYearId = explicitAcademicYearId || idOf(session?.academicYearId);
  const scopeClassId = explicitClassId || idOf(session?.classId);
  const [sourceAcademicYear, sourceClass] = await Promise.all([
    scopeAcademicYearId ? AcademicYear.findById(scopeAcademicYearId) : null,
    scopeClassId ? SchoolClass.findById(scopeClassId).select(CLASS_SELECT).populate('academicYearId') : null
  ]);

  const rule = normalizeNullableId(payload.ruleId)
    ? await PromotionRule.findById(payload.ruleId)
    : await findBestPromotionRule({
        academicYearId: scopeAcademicYearId,
        classId: scopeClassId
      });

  if (!rule) {
    throw promotionError('promotion_rule_not_found');
  }

  // Rules other than the official general result read one exam session; when
  // none was chosen, use the class's latest one instead of refusing.
  if (!session && normalizeText(rule.evaluationMode) !== 'official_general_result' && scopeAcademicYearId && scopeClassId) {
    const latest = await ExamSession.findOne({ academicYearId: scopeAcademicYearId, classId: scopeClassId, status: { $ne: 'archived' } })
      .sort({ heldAt: -1, createdAt: -1 })
      .select('_id')
      .lean();
    if (latest) session = await resolvePromotionSession(latest._id);
    else throw promotionError('promotion_class_has_no_exam_session');
  }

  const targetAcademicYear = await resolveTargetAcademicYear(sourceAcademicYear, payload, rule);
  const targetClasses = targetAcademicYear
    ? await SchoolClass.find({ academicYearId: targetAcademicYear._id, status: { $ne: 'archived' } })
      .select(CLASS_SELECT)
      .populate('academicYearId')
      .sort({ gradeLevel: 1, section: 1, title: 1, createdAt: 1 })
    : [];

  const plan = await buildPromotionPlan({ payload, rule, sourceAcademicYear, sourceClass, targetAcademicYear, targetClasses });
  const { entries, classReadiness } = normalizeText(rule.evaluationMode) === 'official_general_result'
    ? await loadOfficialResultEntries({ payload, rule, scopeAcademicYearId, scopeClassId })
    : await loadSessionResultEntries({ payload, rule, session });
  const items = await buildPreviewItems({ entries, plan, rule, payload, targetAcademicYear, targetClasses });
  await finalizePlanAfterItems({ plan, items, targetClasses });
  await attachFinancePreview({ plan, items, payload });

  return {
    session,
    rule,
    targetAcademicYear,
    items,
    scopeAcademicYearId,
    scopeClassId,
    classReadiness,
    plan
  };
}

function serializePromotionPlan(plan, items = []) {
  return {
    sourceAcademicYear: formatAcademicYear(plan.sourceAcademicYear),
    sourceClass: formatSchoolClass(plan.sourceClass),
    targetAcademicYear: formatAcademicYear(plan.targetAcademicYear),
    isTerminal: Boolean(plan.isTerminal),
    promotedClass: formatSchoolClass(plan.promotedClass),
    repeatClass: formatSchoolClass(plan.repeatClass),
    promotedCandidates: (plan.promotedCandidates || []).map(formatSchoolClass),
    repeatCandidates: (plan.repeatCandidates || []).map(formatSchoolClass),
    sourceEndAt: plan.dates.sourceEndAt,
    targetStartAt: plan.dates.targetStartAt,
    blockers: plan.blockers,
    warnings: plan.warnings,
    capacity: plan.capacity,
    finance: plan.finance || null,
    canApply: !plan.blockers.length && items.some((item) => item.canApply)
  };
}

function serializePromotionPreview(state) {
  return {
    session: formatExamSession(state.session),
    rule: formatPromotionRule(state.rule),
    targetAcademicYear: formatAcademicYear(state.targetAcademicYear),
    readiness: state.classReadiness || null,
    plan: serializePromotionPlan(state.plan, state.items),
    summary: summarizePromotionItems(state.items),
    items: state.items.map((item) => ({
      studentMembershipId: idOf(item.sourceMembership),
      examResultId: item.examResult ? String(item.examResult._id) : null,
      sourceResultStatus: normalizeText(item.policyEvaluation?.sourceResultStatus || item.examResult?.resultStatus),
      percentage: Number(item.examResult?.percentage || 0),
      averageScore: Number(item.policyEvaluation?.averageScore ?? item.examResult?.percentage ?? 0),
      computedOutcome: item.computedOutcome,
      canApply: item.canApply,
      issueCode: item.issueCode,
      existingTransactionId: item.existingTransactionId || '',
      reuseExistingMembership: Boolean(item.reuseMembershipId),
      override: item.override
        ? { targetClassId: item.override.targetClassId, exclude: item.override.exclude, reason: item.override.reason }
        : null,
      generatedMembershipStatus: item.generatedMembershipStatus,
      policyEvaluation: item.policyEvaluation || null,
      sourceMembership: formatMembership(item.sourceMembership),
      targetAcademicYear: formatAcademicYear(item.targetAcademicYear),
      targetClass: formatSchoolClass(item.targetClass),
      finance: item.finance || null,
      reliefsToCarry: (item.reliefsToCarry || []).map((relief) => ({ sourceModel: relief.sourceModel, id: relief.id }))
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
  sourceMembership.note = appendMembershipNote(sourceMembership.note, `closed by promotion (${outcome})`);
  await sourceMembership.save();
  return sourceMembership;
}

async function provideTargetMembership({ source, targetAcademicYearId, targetClass, targetCourseId, reuseMembershipId = null, outcome, actorUserId, targetStartAt, dbSession }) {
  if (reuseMembershipId) {
    const existing = await StudentMembership.findById(reuseMembershipId).session(dbSession);
    if (existing && isCurrentMembership(existing) && idOf(existing.classId) === idOf(targetClass)) {
      return { membership: existing, generated: false };
    }
    throw promotionError('promotion_target_membership_changed');
  }

  const [created] = await StudentMembership.create([{
    student: source.student,
    studentId: source.studentId || null,
    afghanStudentId: source.afghanStudentId || null,
    course: targetCourseId,
    classId: targetClass._id,
    academicYear: targetAcademicYearId,
    academicYearId: targetAcademicYearId,
    status: GENERATED_MEMBERSHIP_STATUS,
    source: 'promotion',
    admissionType: 'promotion',
    enrolledAt: targetStartAt,
    joinedAt: targetStartAt,
    createdBy: normalizeNullableId(actorUserId),
    note: `${outcome} via promotion`,
    promotedFromMembershipId: source._id,
    previousMembershipId: source._id
  }], { session: dbSession });
  return { membership: created, generated: true };
}

function afghanStudentIdentityFilter(membership) {
  const filters = [];
  if (idOf(membership?.afghanStudentId)) filters.push({ _id: idOf(membership.afghanStudentId) });
  if (idOf(membership?.student)) filters.push({ linkedUserId: idOf(membership.student) });
  if (!filters.length) return null;
  return filters.length === 1 ? filters[0] : { $or: filters };
}

// Keep the student registry (AfghanStudent.academicInfo) on the class the
// student is now current in - the same projection a class transfer writes.
async function projectStudentClass(membership, dbSession) {
  await syncAfghanStudentLifecycleProjection(membership, 'class_transfer', dbSession);
  if (normalizeText(membership?.status) === 'suspended') {
    const filter = afghanStudentIdentityFilter(membership);
    if (filter) await AfghanStudent.updateMany(filter, { $set: { status: 'suspended' } }, { session: dbSession });
  }
}

async function projectStudentGraduated(membership, dbSession) {
  const filter = afghanStudentIdentityFilter(membership);
  if (filter) await AfghanStudent.updateMany(filter, { $set: { status: 'graduated' } }, { session: dbSession });
}

async function applyPromotionState({ state, payload, actorUserId, dbSession }) {
  const { plan, rule } = state;
  const { sourceEndAt, targetStartAt } = plan.dates;
  const targetAcademicYearId = plan.targetAcademicYear._id;
  const now = new Date();
  const batch = new PromotionBatch({
    ruleId: rule._id,
    sessionId: state.session?._id || null,
    sourceAcademicYearId: plan.sourceAcademicYear._id,
    sourceClassId: plan.sourceClass._id,
    targetAcademicYearId,
    promotedClassId: plan.promotedClass?._id || null,
    repeatClassId: plan.repeatClass?._id || null,
    isTerminal: plan.isTerminal,
    sourceEndAt,
    targetStartAt,
    overrides: Array.from(normalizeStudentOverrides(payload.studentOverrides).entries())
      .filter(([membershipId]) => mongoose.isValidObjectId(membershipId))
      .map(([membershipId, override]) => ({
        studentMembershipId: membershipId,
        targetClassId: normalizeNullableId(override.targetClassId),
        exclude: override.exclude,
        reason: override.reason
      })),
    warnings: plan.warnings.map((issue) => issue.message),
    createdBy: normalizeNullableId(actorUserId),
    appliedAt: now,
    note: normalizeText(payload.note)
  });

  const counts = { promoted: 0, repeated: 0, conditional: 0, graduated: 0 };
  const financeSummary = { studentsWithDebt: 0, debtAmount: 0, voidedDocuments: 0, refundCases: 0, reviewRequired: 0, carriedReliefs: 0, failedReliefs: 0 };
  const reliefCarries = [];
  const notApplied = [];
  const touchedClassIds = new Set([idOf(plan.sourceClass)]);
  const projections = [];
  const skip = (item, issueCode) => notApplied.push({
    studentMembershipId: item.sourceMembership?._id || null,
    studentId: item.studentCore?._id || item.sourceMembership?.studentId?._id || item.sourceMembership?.studentId || null,
    student: item.studentUser?._id || item.sourceMembership?.student?._id || item.sourceMembership?.student || null,
    fullName: formatMembership(item.sourceMembership)?.student?.fullName || '',
    outcome: normalizeText(item.computedOutcome),
    issueCode: normalizeText(issueCode)
  });

  for (const item of state.items) {
    if (!item.canApply) {
      skip(item, item.issueCode);
      continue;
    }

    // Re-read inside the transaction: the preview may be minutes old and
    // another operator may have moved this student since.
    const source = await StudentMembership.findById(item.sourceMembership._id).session(dbSession);
    if (!isCurrentMembership(source)) {
      skip(item, 'membership_not_current');
      continue;
    }
    const alreadyProcessed = await PromotionTransaction.exists({
      studentMembershipId: source._id,
      transactionStatus: { $in: LIVE_TRANSACTION_STATUSES },
      promotionOutcome: { $in: ACTIONABLE_OUTCOMES }
    }).session(dbSession);
    if (alreadyProcessed) {
      skip(item, 'already_processed');
      continue;
    }

    const outcome = item.computedOutcome;
    const snapshot = snapshotMembershipState(source);
    let targetMembership = null;
    let generated = false;
    if (outcome === 'promoted' || outcome === 'repeated') {
      ({ membership: targetMembership, generated } = await provideTargetMembership({
        source,
        targetAcademicYearId,
        targetClass: item.targetClass,
        targetCourseId: item.targetCourseId,
        reuseMembershipId: item.reuseMembershipId,
        outcome,
        actorUserId,
        targetStartAt,
        dbSession
      }));
      await closeSourceMembership(source, outcome, sourceEndAt);
      touchedClassIds.add(idOf(item.targetClass));
      projections.push(() => projectStudentClass(targetMembership, dbSession));
    } else if (outcome === 'graduated') {
      await closeSourceMembership(source, 'graduated', sourceEndAt);
      projections.push(() => projectStudentGraduated(source, dbSession));
    }

    const held = outcome === 'conditional';
    const settled = held
      ? { voidedBills: 0, voidedOrders: 0, refundCases: 0, reviewRequired: [] }
      : await settleSourceMembershipBilling({ membership: source, sourceEndAt, actorId: normalizeNullableId(actorUserId), dbSession });
    const outstandingAtPromotion = Number(item.finance?.outstanding || 0);
    if (outstandingAtPromotion > 0) {
      financeSummary.studentsWithDebt += 1;
      financeSummary.debtAmount += outstandingAtPromotion;
    }
    financeSummary.voidedDocuments += settled.voidedBills + settled.voidedOrders;
    financeSummary.refundCases += settled.refundCases;
    financeSummary.reviewRequired += settled.reviewRequired.length;
    const transactionId = new mongoose.Types.ObjectId();
    const reliefs = (item.reliefsToCarry || []).map((relief) => ({ sourceModel: relief.sourceModel, id: relief.id }));
    if (reliefs.length && targetMembership) {
      reliefCarries.push({ transactionId, sourceMembershipId: source._id, targetMembershipId: targetMembership._id, reliefs });
    }
    await PromotionTransaction.create([{
      _id: transactionId,
      batchId: batch._id,
      ruleId: rule._id,
      sessionId: state.session?._id || null,
      examResultId: item.examResult?._id || null,
      studentMembershipId: source._id,
      targetMembershipId: targetMembership?._id || null,
      studentId: item.studentCore?._id || source.studentId || null,
      student: item.studentUser?._id || source.student || null,
      academicYearId: plan.sourceAcademicYear._id,
      targetAcademicYearId,
      assessmentPeriodId: state.session?.assessmentPeriodId?._id || state.session?.assessmentPeriodId || null,
      classId: source.classId || null,
      targetClassId: item.targetClass?._id || null,
      sourceResultStatus: normalizeText(item.policyEvaluation?.sourceResultStatus || item.examResult?.resultStatus),
      averageScore: Number.isFinite(Number(item.policyEvaluation?.averageScore)) ? Number(item.policyEvaluation.averageScore) : null,
      failedSubjects: (Array.isArray(item.policyEvaluation?.failedSubjects) ? item.policyEvaluation.failedSubjects : [])
        .map((subject) => ({
          subjectId: normalizeNullableId(subject?.subjectId),
          subjectTitle: normalizeText(subject?.subjectTitle),
          percentage: Number(subject?.percentage) || 0
        })),
      promotionOutcome: outcome,
      transactionStatus: held ? 'held' : 'applied',
      heldOutcome: held ? 'conditional' : '',
      generatedMembershipStatus: targetMembership ? normalizeText(targetMembership.status) : '',
      targetMembershipGenerated: generated,
      decidedAt: now,
      appliedAt: held ? null : now,
      sourceMembershipStatusBefore: snapshot.status,
      sourceMembershipEndedReasonBefore: snapshot.endedReason,
      sourceMembershipEndedAtBefore: snapshot.endedAt,
      sourceMembershipLeftAtBefore: snapshot.leftAt,
      sourceMembershipIsCurrentBefore: snapshot.isCurrent,
      createdBy: normalizeNullableId(actorUserId),
      appliedBy: held ? null : normalizeNullableId(actorUserId),
      note: held ? 'held for the second-chance exam' : '',
      financeEffects: {
        outstandingAtPromotion,
        voidedBills: settled.voidedBills,
        voidedOrders: settled.voidedOrders,
        refundCases: settled.refundCases,
        reviewRequired: settled.reviewRequired,
        // A held student's reliefs follow them only when the second chance is decided.
        plannedReliefs: held ? reliefs : [],
        carriedReliefs: []
      }
    }], { session: dbSession });
    counts[outcome] += 1;
  }

  if (!Object.values(counts).some(Boolean)) {
    throw promotionError('promotion_nothing_to_apply');
  }

  batch.summary = { total: state.items.length, ...counts, notApplied: notApplied.length };
  financeSummary.debtAmount = Math.round(financeSummary.debtAmount * 100) / 100;
  batch.financeSummary = financeSummary;
  batch.notApplied = notApplied;
  await batch.save({ session: dbSession });

  for (const classId of touchedClassIds) {
    // eslint-disable-next-line no-await-in-loop
    await updateClassActiveCount(classId, dbSession);
  }
  for (const project of projections) {
    // eslint-disable-next-line no-await-in-loop
    await project();
  }

  return { batchId: batch._id, reliefCarries };
}

// After commit: carry the chosen reliefs onto the new memberships and record
// the outcome per student and on the batch. Never throws.
async function applyReliefCarries({ batchId = null, reliefCarries = [], actorUserId = null }) {
  let carried = 0;
  let failed = 0;
  for (const carry of reliefCarries) {
    // eslint-disable-next-line no-await-in-loop
    const results = await carryReliefsToMembership({
      sourceMembershipId: carry.sourceMembershipId,
      targetMembershipId: carry.targetMembershipId,
      reliefs: carry.reliefs,
      actorId: normalizeNullableId(actorUserId)
    }).catch(() => carry.reliefs.map((relief) => ({ sourceModel: relief.sourceModel, sourceId: relief.id, newId: '', status: 'failed', error: 'carry_failed' })));
    carried += results.filter((entry) => entry.status === 'carried').length;
    failed += results.filter((entry) => entry.status !== 'carried').length;
    // eslint-disable-next-line no-await-in-loop
    await PromotionTransaction.updateOne(
      { _id: carry.transactionId },
      { $set: { 'financeEffects.carriedReliefs': results, 'financeEffects.plannedReliefs': [] } }
    ).catch(() => null);
  }
  if (batchId && (carried || failed)) {
    await PromotionBatch.updateOne(
      { _id: batchId },
      { $inc: { 'financeSummary.carriedReliefs': carried, 'financeSummary.failedReliefs': failed } }
    ).catch(() => null);
  }
  return { carried, failed };
}

async function applyPromotions(payload = {}, actorUserId = null) {
  const state = await resolvePromotionPreviewState(payload);
  if (state.plan.blockers.length) {
    throw promotionError('promotion_plan_blocked', { blockers: state.plan.blockers });
  }
  if (!state.items.some((item) => item.canApply)) {
    throw promotionError('promotion_nothing_to_apply', { summary: summarizePromotionItems(state.items) });
  }

  const { batchId, reliefCarries } = await runInTransaction((dbSession) => applyPromotionState({ state, payload, actorUserId, dbSession }));
  await applyReliefCarries({ batchId, reliefCarries, actorUserId });
  invalidateFinanceReports();

  const [batch, transactions] = await Promise.all([
    populatePromotionBatchQuery(PromotionBatch.findById(batchId)),
    populatePromotionTransactionQuery(PromotionTransaction.find({ batchId }).sort({ createdAt: 1 }))
  ]);
  const items = transactions.map(formatPromotionTransaction);

  return {
    batch: formatPromotionBatch(batch),
    session: formatExamSession(state.session),
    rule: formatPromotionRule(state.rule),
    targetAcademicYear: formatAcademicYear(state.targetAcademicYear),
    summary: { ...summarizePromotionItems(items), blocked: Number(batch?.summary?.notApplied || 0) },
    items
  };
}

async function getPromotionTransaction(transactionId) {
  const normalizedId = normalizeNullableId(transactionId);
  if (!normalizedId) return null;

  const item = await populatePromotionTransactionQuery(PromotionTransaction.findById(normalizedId));
  return item ? formatPromotionTransaction(item) : null;
}

// Undo one student's promotion inside an open transaction. Throws (and so
// aborts everything) when undoing would orphan later work: the new membership
// was itself promoted again, or finance has already billed it.
async function rollbackTransactionInSession(transaction, { rollbackAt, reason, actorUserId, dbSession, effects }) {
  if (transaction.transactionStatus === 'rolled_back') return false;
  if (!LIVE_TRANSACTION_STATUSES.includes(transaction.transactionStatus)) {
    throw promotionError('promotion_transaction_not_applied');
  }

  const sourceMembership = await StudentMembership.findById(transaction.studentMembershipId).session(dbSession);
  if (!sourceMembership) {
    throw promotionError('promotion_source_membership_not_found');
  }

  // The finance office may have billed a held student's second-chance exam;
  // voiding that bill is theirs to do (it has its own approval levels).
  if (normalizeText(transaction.heldOutcome) === 'conditional') {
    const secondChanceBill = await FinanceBill.exists({
      issuanceKey: secondChanceIssuanceKey(transaction._id),
      status: { $ne: 'void' }
    }).session(dbSession);
    if (secondChanceBill) {
      throw promotionError('promotion_rollback_blocked_by_second_chance_fee');
    }
  }

  const targetMembershipId = normalizeNullableId(transaction.targetMembershipId);
  if (targetMembershipId) {
    const downstreamCount = await PromotionTransaction.countDocuments({
      studentMembershipId: targetMembershipId,
      transactionStatus: { $in: LIVE_TRANSACTION_STATUSES },
      promotionOutcome: { $in: ACTIONABLE_OUTCOMES },
      _id: { $ne: transaction._id }
    }).session(dbSession);
    if (downstreamCount) {
      throw promotionError('promotion_rollback_blocked_by_downstream_transactions');
    }

    if (transaction.targetMembershipGenerated !== false) {
      const financeFilter = { studentMembershipId: targetMembershipId, status: { $ne: 'void' } };
      const [billCount, orderCount] = await Promise.all([
        FinanceBill.countDocuments(financeFilter).session(dbSession),
        FeeOrder.countDocuments(financeFilter).session(dbSession)
      ]);
      if (billCount + orderCount) {
        throw promotionError('promotion_rollback_blocked_by_finance');
      }

      const targetMembership = await StudentMembership.findById(targetMembershipId).session(dbSession);
      if (!targetMembership) {
        throw promotionError('promotion_target_membership_not_found');
      }
      await retireGeneratedMembership(targetMembership, rollbackAt);
      effects.classIds.add(idOf(targetMembership.classId));
    }
  }

  // Only an applied move ended the source membership (the old engine also
  // moved conditional students, always with a target membership). A held
  // student - or a legacy 'blocked' row - never touched it, and the student
  // may have moved since, so restoring an old snapshot would be wrong.
  const sourceWasClosed = transaction.transactionStatus === 'applied'
    && (SOURCE_CLOSING_OUTCOMES.includes(transaction.promotionOutcome) || Boolean(targetMembershipId));
  if (sourceWasClosed) {
    await restoreMembershipSnapshot(sourceMembership, transaction);
    effects.classIds.add(idOf(sourceMembership.classId));
    effects.projections.push(() => projectStudentClass(sourceMembership, dbSession));
  }
  const carried = (transaction.financeEffects?.carriedReliefs || [])
    .map((entry) => (entry?.toObject ? entry.toObject() : { ...entry }))
    .filter((entry) => entry.status === 'carried');
  if (carried.length) effects.carriedReliefs.push({ transactionId: transaction._id, carried });

  transaction.transactionStatus = 'rolled_back';
  transaction.rolledBackAt = rollbackAt;
  transaction.rollbackReason = normalizeText(reason);
  transaction.rolledBackBy = normalizeNullableId(actorUserId);
  transaction.note = appendMembershipNote(
    transaction.note,
    transaction.rollbackReason ? `rollback: ${transaction.rollbackReason}` : 'rolled back'
  );
  await transaction.save({ session: dbSession });
  if (transaction.batchId) effects.batchIds.add(idOf(transaction.batchId));
  return true;
}

async function refreshPromotionBatchStatus(batchId, { rollbackAt, reason, actorUserId, dbSession }) {
  const batch = await PromotionBatch.findById(batchId).session(dbSession);
  if (!batch) return null;
  const [liveCount, rolledBackCount] = await Promise.all([
    PromotionTransaction.countDocuments({ batchId: batch._id, transactionStatus: { $in: LIVE_TRANSACTION_STATUSES } }).session(dbSession),
    PromotionTransaction.countDocuments({ batchId: batch._id, transactionStatus: 'rolled_back' }).session(dbSession)
  ]);
  if (!rolledBackCount) batch.status = 'applied';
  else batch.status = liveCount ? 'partially_rolled_back' : 'rolled_back';
  if (batch.status === 'rolled_back' && !batch.rolledBackAt) {
    batch.rolledBackAt = rollbackAt;
    batch.rolledBackBy = normalizeNullableId(actorUserId);
    batch.rollbackReason = normalizeText(reason);
  }
  await batch.save({ session: dbSession });
  return batch;
}

async function finishRollbackEffects(effects, context) {
  for (const batchId of effects.batchIds) {
    // eslint-disable-next-line no-await-in-loop
    await refreshPromotionBatchStatus(batchId, context);
  }
  for (const classId of effects.classIds) {
    // eslint-disable-next-line no-await-in-loop
    await updateClassActiveCount(classId, context.dbSession);
  }
  for (const project of effects.projections) {
    // eslint-disable-next-line no-await-in-loop
    await project();
  }
}

function newRollbackEffects() {
  return { classIds: new Set(), batchIds: new Set(), projections: [], carriedReliefs: [] };
}

// After a rollback commits, the reliefs the promotion carried onto the new
// membership are cancelled too. Voided after-end bills and refund cases stay
// as they are - finance re-issues or rejects them if the move is undone.
async function cancelReliefsAfterRollback(effects, actorUserId) {
  for (const entry of effects?.carriedReliefs || []) {
    // eslint-disable-next-line no-await-in-loop
    const results = await cancelCarriedReliefs(entry.carried, { actorId: normalizeNullableId(actorUserId) }).catch(() => entry.carried);
    // eslint-disable-next-line no-await-in-loop
    await PromotionTransaction.updateOne(
      { _id: entry.transactionId },
      { $set: { 'financeEffects.carriedReliefs': results } }
    ).catch(() => null);
  }
}

async function rollbackPromotionTransaction(transactionId, payload = {}, actorUserId = null) {
  const normalizedId = normalizeNullableId(transactionId);
  if (!normalizedId) {
    throw promotionError('promotion_transaction_not_found');
  }

  const existing = await PromotionTransaction.findById(normalizedId).select('_id transactionStatus').lean();
  if (!existing) {
    throw promotionError('promotion_transaction_not_found');
  }
  if (existing.transactionStatus !== 'rolled_back') {
    const rollbackAt = toDateOrNull(payload.rolledBackAt || payload.effectiveAt) || new Date();
    const reason = payload.reason || payload.rollbackReason;
    let committedEffects = null;
    await runInTransaction(async (dbSession) => {
      const transaction = await PromotionTransaction.findById(normalizedId).session(dbSession);
      const effects = newRollbackEffects();
      const context = { rollbackAt, reason, actorUserId, dbSession, effects };
      await rollbackTransactionInSession(transaction, context);
      await finishRollbackEffects(effects, context);
      committedEffects = effects;
    });
    await cancelReliefsAfterRollback(committedEffects, actorUserId);
    invalidateFinanceReports();
  }

  return getPromotionTransaction(normalizedId);
}

// All-or-nothing: if any student of the batch can't be rolled back the whole
// batch stays applied, and the error lists every student that blocked it.
async function rollbackPromotionBatch(batchId, payload = {}, actorUserId = null) {
  const normalizedId = normalizeNullableId(batchId);
  const exists = normalizedId ? await PromotionBatch.exists({ _id: normalizedId }) : null;
  if (!exists) {
    throw promotionError('promotion_batch_not_found');
  }

  const rollbackAt = toDateOrNull(payload.rolledBackAt || payload.effectiveAt) || new Date();
  const reason = payload.reason || payload.rollbackReason;
  let committedEffects = null;
  await runInTransaction(async (dbSession) => {
    const transactions = await PromotionTransaction.find({
      batchId: normalizedId,
      transactionStatus: { $in: LIVE_TRANSACTION_STATUSES }
    })
      .populate('studentId', 'fullName preferredName')
      .session(dbSession);
    if (!transactions.length) {
      throw promotionError('promotion_batch_nothing_to_rollback');
    }

    const effects = newRollbackEffects();
    const context = { rollbackAt, reason, actorUserId, dbSession, effects };
    const blockers = [];
    for (const transaction of transactions) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await rollbackTransactionInSession(transaction, context);
      } catch (error) {
        const code = String(error?.message || '');
        if (!code.startsWith('promotion_')) throw error;
        blockers.push({
          transactionId: idOf(transaction),
          fullName: normalizeText(transaction.studentId?.fullName) || normalizeText(transaction.studentId?.preferredName),
          code
        });
      }
    }
    if (blockers.length) {
      throw promotionError('promotion_batch_rollback_blocked', { blockers });
    }
    await finishRollbackEffects(effects, context);
    committedEffects = effects;
  });
  await cancelReliefsAfterRollback(committedEffects, actorUserId);
  invalidateFinanceReports();

  return getPromotionBatch(normalizedId);
}

// The second-chance exam is over for a held (مشروط) student: move them up
// (or graduate them from class 12) or keep them in the same grade.
async function resolveHeldPromotion(transactionId, payload = {}, actorUserId = null) {
  const normalizedId = normalizeNullableId(transactionId);
  const decision = normalizeText(payload.decision || payload.outcome);
  if (!['promoted', 'repeated'].includes(decision)) {
    throw promotionError('promotion_resolve_decision_invalid');
  }
  const transaction = normalizedId ? await PromotionTransaction.findById(normalizedId) : null;
  if (!transaction) {
    throw promotionError('promotion_transaction_not_found');
  }
  if (transaction.transactionStatus !== 'held') {
    throw promotionError('promotion_transaction_not_held');
  }

  const batch = transaction.batchId ? await PromotionBatch.findById(transaction.batchId) : null;
  const targetAcademicYearId = normalizeNullableId(transaction.targetAcademicYearId) || normalizeNullableId(batch?.targetAcademicYearId);
  const [sourceClass, sourceAcademicYear, targetAcademicYear, rule] = await Promise.all([
    SchoolClass.findById(transaction.classId).select(CLASS_SELECT),
    AcademicYear.findById(transaction.academicYearId),
    targetAcademicYearId ? AcademicYear.findById(targetAcademicYearId) : null,
    transaction.ruleId ? PromotionRule.findById(transaction.ruleId) : null
  ]);
  if (!targetAcademicYear) {
    throw promotionError('promotion_target_year_not_resolved');
  }

  const outcome = decision === 'promoted' && (rule?.isTerminalClass || isTerminalClass(sourceClass)) ? 'graduated' : decision;
  let targetClass = null;
  let targetCourseId = null;
  if (outcome !== 'graduated') {
    const targetClasses = await SchoolClass.find({ academicYearId: targetAcademicYear._id, status: { $ne: 'archived' } })
      .select(CLASS_SELECT)
      .populate('academicYearId')
      .sort({ gradeLevel: 1, section: 1, title: 1, createdAt: 1 });
    const explicitId = normalizeNullableId(payload.targetClassId)
      || normalizeNullableId(outcome === 'promoted' ? batch?.promotedClassId : batch?.repeatClassId);
    if (explicitId) {
      const chosen = await findTargetClassById(targetClasses, explicitId);
      const issues = classTargetIssues({ sourceClass, targetClass: chosen, mode: outcome, targetAcademicYearId: idOf(targetAcademicYear) });
      if (issues.length) {
        throw promotionError('promotion_resolve_target_invalid', {
          issues: issues.map((code) => buildPlanIssue(code, outcome === 'promoted' ? 'promoted_class' : 'repeat_class', { mode: outcome }))
        });
      }
      targetClass = chosen;
    } else {
      targetClass = selectTargetClass({ candidates: targetClasses, sourceClass, mode: outcome, targetAcademicYearId: idOf(targetAcademicYear) }).targetClass;
    }
    if (!targetClass) {
      throw promotionError('promotion_target_class_not_resolved');
    }
    targetCourseId = await resolveCourseForTargetClass(targetClass);
    if (!targetCourseId) {
      throw promotionError('promotion_target_course_not_resolved');
    }
  }

  const { sourceEndAt, targetStartAt } = resolvePromotionDates({
    payload: {
      sourceEndAt: payload.sourceEndAt || batch?.sourceEndAt,
      targetStartAt: payload.targetStartAt || batch?.targetStartAt
    },
    sourceAcademicYear,
    targetAcademicYear
  });

  // Reliefs that follow the student: this request's choice, otherwise the one
  // made when the batch held them.
  let reliefsToCarry = (transaction.financeEffects?.plannedReliefs || []).map((relief) => ({ sourceModel: relief.sourceModel, id: relief.id }));
  if (Array.isArray(payload.reliefs)) {
    reliefsToCarry = payload.reliefs
      .map((relief) => ({ sourceModel: normalizeText(relief?.sourceModel), id: idOf(relief?.id) }))
      .filter((relief) => relief.id && ['discount', 'fee_exemption'].includes(relief.sourceModel));
  } else if (payload.carryAllReliefs === true) {
    const preview = await buildPromotionFinancePreview({ membershipIds: [transaction.studentMembershipId] });
    reliefsToCarry = (preview.get(idOf(transaction.studentMembershipId))?.reliefs || []).map((relief) => ({ sourceModel: relief.sourceModel, id: relief.id }));
  }
  let resolvedTargetMembershipId = null;

  await runInTransaction(async (dbSession) => {
    const held = await PromotionTransaction.findById(normalizedId).session(dbSession);
    if (!held || held.transactionStatus !== 'held') {
      throw promotionError('promotion_transaction_not_held');
    }
    const source = await StudentMembership.findById(held.studentMembershipId).session(dbSession);
    if (!isCurrentMembership(source)) {
      throw promotionError('promotion_source_membership_not_current');
    }

    const snapshot = snapshotMembershipState(source);
    const touchedClassIds = new Set([idOf(source.classId)]);
    let targetMembership = null;
    let generated = false;
    if (outcome === 'graduated') {
      await closeSourceMembership(source, 'graduated', sourceEndAt);
      await projectStudentGraduated(source, dbSession);
    } else {
      const existing = await StudentMembership.findOne({
        student: source.student,
        isCurrent: true,
        status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES },
        $or: [{ academicYearId: targetAcademicYear._id }, { academicYear: targetAcademicYear._id }]
      }).session(dbSession);
      if (existing && idOf(existing.classId) !== idOf(targetClass)) {
        throw promotionError('promotion_student_already_enrolled_in_target_year');
      }
      ({ membership: targetMembership, generated } = await provideTargetMembership({
        source,
        targetAcademicYearId: targetAcademicYear._id,
        targetClass,
        targetCourseId,
        reuseMembershipId: existing?._id || null,
        outcome,
        actorUserId,
        targetStartAt,
        dbSession
      }));
      await closeSourceMembership(source, outcome, sourceEndAt);
      touchedClassIds.add(idOf(targetClass));
      await projectStudentClass(targetMembership, dbSession);
    }
    const settled = await settleSourceMembershipBilling({ membership: source, sourceEndAt, actorId: normalizeNullableId(actorUserId), dbSession });
    resolvedTargetMembershipId = targetMembership?._id || null;

    const now = new Date();
    held.financeEffects = {
      ...(held.financeEffects?.toObject ? held.financeEffects.toObject() : (held.financeEffects || {})),
      voidedBills: Number(held.financeEffects?.voidedBills || 0) + settled.voidedBills,
      voidedOrders: Number(held.financeEffects?.voidedOrders || 0) + settled.voidedOrders,
      refundCases: Number(held.financeEffects?.refundCases || 0) + settled.refundCases,
      reviewRequired: [...(held.financeEffects?.reviewRequired || []), ...settled.reviewRequired]
    };
    held.promotionOutcome = outcome;
    held.transactionStatus = 'applied';
    held.targetAcademicYearId = targetAcademicYear._id;
    held.targetClassId = targetClass?._id || null;
    held.targetMembershipId = targetMembership?._id || null;
    held.targetMembershipGenerated = generated;
    held.generatedMembershipStatus = targetMembership ? normalizeText(targetMembership.status) : '';
    held.sourceMembershipStatusBefore = snapshot.status;
    held.sourceMembershipEndedReasonBefore = snapshot.endedReason;
    held.sourceMembershipEndedAtBefore = snapshot.endedAt;
    held.sourceMembershipLeftAtBefore = snapshot.leftAt;
    held.sourceMembershipIsCurrentBefore = snapshot.isCurrent;
    held.resolvedAt = now;
    held.resolvedBy = normalizeNullableId(actorUserId);
    held.appliedAt = now;
    held.appliedBy = normalizeNullableId(actorUserId);
    held.note = appendMembershipNote(held.note, `second chance: ${decision}${normalizeText(payload.note) ? ` - ${normalizeText(payload.note)}` : ''}`);
    await held.save({ session: dbSession });

    for (const classId of touchedClassIds) {
      // eslint-disable-next-line no-await-in-loop
      await updateClassActiveCount(classId, dbSession);
    }
  });
  if (resolvedTargetMembershipId && reliefsToCarry.length) {
    await applyReliefCarries({
      batchId: transaction.batchId || null,
      reliefCarries: [{
        transactionId: transaction._id,
        sourceMembershipId: transaction.studentMembershipId,
        targetMembershipId: resolvedTargetMembershipId,
        reliefs: reliefsToCarry
      }],
      actorUserId
    });
  } else if (!resolvedTargetMembershipId) {
    await PromotionTransaction.updateOne({ _id: transaction._id }, { $set: { 'financeEffects.plannedReliefs': [] } }).catch(() => null);
  }
  invalidateFinanceReports();

  // An unpaid second-chance fee doesn't stop the decision (agreed: debts only
  // warn); it stays on the source-year membership as that year's debt.
  const [item, feeBill] = await Promise.all([
    getPromotionTransaction(normalizedId),
    FinanceBill.findOne({ issuanceKey: secondChanceIssuanceKey(normalizedId), status: { $ne: 'void' } })
      .select('amountDue amountPaid billNumber')
      .lean()
  ]);
  const outstanding = billOutstanding(feeBill);
  return {
    ...item,
    warnings: outstanding > 0
      ? [{
          code: 'second_chance_fee_unpaid',
          message: `فیس امتحان چانس دوم این شاگرد (${outstanding.toLocaleString('en-US')} افغانی، بل ${feeBill.billNumber || ''}) هنوز پرداخت نشده و به‌عنوان بدهی سال قبل باقی می‌ماند.`
        }]
      : []
  };
}

async function listPromotionTransactions(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.batchId)) query.batchId = filters.batchId;
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

async function listPromotionBatches(filters = {}) {
  const query = {};
  if (normalizeNullableId(filters.sourceAcademicYearId || filters.academicYearId)) query.sourceAcademicYearId = filters.sourceAcademicYearId || filters.academicYearId;
  if (normalizeNullableId(filters.sourceClassId || filters.classId)) query.sourceClassId = filters.sourceClassId || filters.classId;
  if (normalizeNullableId(filters.targetAcademicYearId)) query.targetAcademicYearId = filters.targetAcademicYearId;
  if (['applied', 'partially_rolled_back', 'rolled_back'].includes(normalizeText(filters.status))) query.status = normalizeText(filters.status);

  const items = await populatePromotionBatchQuery(PromotionBatch.find(query).sort({ appliedAt: -1, createdAt: -1 }));
  return items.map((item) => formatPromotionBatch(item));
}

// Every class of a source year with its promotion state, in one request:
// current students, the latest batch, and conditional students still waiting
// for the second chance - so nothing is forgotten at year end.
async function getPromotionYearBoard({ academicYearId = '' } = {}) {
  const yearId = normalizeNullableId(academicYearId);
  if (!yearId) throw promotionError('promotion_board_year_required');
  const [academicYear, classes] = await Promise.all([
    AcademicYear.findById(yearId),
    SchoolClass.find({ academicYearId: yearId, status: { $ne: 'archived' } })
      .select(CLASS_SELECT)
      .populate('academicYearId')
      .sort({ gradeLevel: 1, section: 1, title: 1, createdAt: 1 })
  ]);
  if (!academicYear) throw promotionError('promotion_board_year_not_found');

  const classIds = classes.map((item) => item._id);
  const [currentRows, heldRows, batches] = await Promise.all([
    classIds.length
      ? StudentMembership.aggregate([
          { $match: { classId: { $in: classIds }, isCurrent: true, status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES } } },
          { $group: { _id: '$classId', count: { $sum: 1 } } }
        ])
      : [],
    classIds.length
      ? PromotionTransaction.aggregate([
          { $match: { classId: { $in: classIds }, transactionStatus: 'held' } },
          { $group: { _id: '$classId', count: { $sum: 1 } } }
        ])
      : [],
    populatePromotionBatchQuery(PromotionBatch.find({ sourceAcademicYearId: yearId }).sort({ appliedAt: -1, createdAt: -1 }))
  ]);
  const countByClass = (rows) => new Map(rows.map((row) => [String(row._id), Number(row.count) || 0]));
  const currentByClass = countByClass(currentRows);
  const heldByClass = countByClass(heldRows);
  const batchesByClass = new Map();
  batches.forEach((batch) => {
    const key = idOf(batch.sourceClassId);
    if (!batchesByClass.has(key)) batchesByClass.set(key, []);
    batchesByClass.get(key).push(batch);
  });

  return {
    academicYear: formatAcademicYear(academicYear),
    classes: classes.map((schoolClass) => {
      const key = idOf(schoolClass);
      const classBatches = batchesByClass.get(key) || [];
      return {
        schoolClass: formatSchoolClass(schoolClass),
        currentStudents: currentByClass.get(key) || 0,
        heldCount: heldByClass.get(key) || 0,
        isTerminal: isTerminalClass(schoolClass),
        batchCount: classBatches.length,
        latestBatch: classBatches[0] ? formatPromotionBatch(classBatches[0]) : null
      };
    })
  };
}

async function getPromotionBatch(batchId) {
  const normalizedId = normalizeNullableId(batchId);
  if (!normalizedId) return null;
  const [batch, transactions] = await Promise.all([
    populatePromotionBatchQuery(PromotionBatch.findById(normalizedId)),
    populatePromotionTransactionQuery(PromotionTransaction.find({ batchId: normalizedId }).sort({ createdAt: 1 }))
  ]);
  return batch ? formatPromotionBatch(batch, transactions) : null;
}

module.exports = {
  applyPromotions,
  createPromotionRule,
  getPromotionBatch,
  getPromotionTransaction,
  getPromotionYearBoard,
  listPromotionBatches,
  listPromotionReferenceData,
  listPromotionRules,
  listPromotionTransactions,
  previewPromotions,
  resolveHeldPromotion,
  rollbackPromotionBatch,
  rollbackPromotionTransaction,
  seedPromotionReferenceData
};
