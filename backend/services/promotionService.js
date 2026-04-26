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

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const PromotionRule = require('../models/PromotionRule');
const PromotionTransaction = require('../models/PromotionTransaction');

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
    gradeLevel: normalizeText(item.gradeLevel),
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
    } : null
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
  const candidateSequence = extractSequenceValue(candidate.title) ?? extractSequenceValue(candidate.code) ?? extractSequenceValue(candidate.gradeLevel);
  const sourceSequence = extractSequenceValue(sourceClass.title) ?? extractSequenceValue(sourceClass.code) ?? extractSequenceValue(sourceClass.gradeLevel);

  if (candidateTitle && candidateTitle === sourceTitle) score += 30;
  if (candidateCode && sourceCode && candidateCode === sourceCode) score += 25;
  if (candidateGrade && sourceGrade && candidateGrade === sourceGrade) score += 20;
  if (candidateSection && sourceSection && candidateSection === sourceSection) score += 10;

  if (sourceSequence != null && candidateSequence != null) {
    if (mode === 'promoted' && candidateSequence === sourceSequence + 1) score += 40;
    if (mode === 'repeated' && candidateSequence === sourceSequence) score += 40;
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
  if (!sessionId) {
    throw new Error('promotion_session_required');
  }

  const session = await resolvePromotionSession(sessionId);
  const rule = normalizeNullableId(payload.ruleId)
    ? await PromotionRule.findById(payload.ruleId)
    : await findBestPromotionRule({
        academicYearId: session.academicYearId?._id || session.academicYearId,
        classId: session.classId?._id || session.classId
      });

  if (!rule) {
    throw new Error('promotion_rule_not_found');
  }

  const targetAcademicYear = await resolveTargetAcademicYear(session.academicYearId, payload, rule);
  const targetClasses = targetAcademicYear
    ? await SchoolClass.find({ academicYearId: targetAcademicYear._id, status: { $ne: 'archived' } })
      .select('title code gradeLevel section status academicYearId legacyCourseId')
      .populate('academicYearId')
      .sort({ title: 1, createdAt: 1 })
    : [];

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
    .sort({ rank: 1, percentage: -1, createdAt: 1 });

  const items = [];
  for (const result of results) {
    const membership = result.studentMembershipId;
    if (!membership) continue;

    const computedOutcome = resolvePromotionOutcome(rule, result.resultStatus);
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
    const issueCode = computedOutcome === 'blocked'
      ? 'result_status_not_mapped'
      : needsGeneratedMembership(computedOutcome, rule) && !targetAcademicYear
        ? 'target_year_not_resolved'
        : needsGeneratedMembership(computedOutcome, rule) && !targetClass
          ? 'target_class_not_resolved'
          : needsGeneratedMembership(computedOutcome, rule) && !targetCourseId
            ? 'target_course_not_resolved'
            : '';
    const canApply = computedOutcome === 'graduated' || (!needsGeneratedMembership(computedOutcome, rule)) || !issueCode;

    items.push({
      examResult: result,
      sourceMembership: membership,
      studentCore: result.studentId || membership.studentId || null,
      studentUser: result.student || membership.student || null,
      computedOutcome,
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
    items
  };
}

function serializePromotionPreview(state) {
  return {
    session: formatExamSession(state.session),
    rule: formatPromotionRule(state.rule),
    targetAcademicYear: formatAcademicYear(state.targetAcademicYear),
    summary: summarizePromotionItems(state.items),
    items: state.items.map((item) => ({
      examResultId: String(item.examResult._id),
      sourceResultStatus: normalizeText(item.examResult.resultStatus),
      percentage: Number(item.examResult.percentage || 0),
      computedOutcome: item.computedOutcome,
      canApply: item.canApply,
      issueCode: item.issueCode,
      generatedMembershipStatus: item.generatedMembershipStatus,
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
        sessionId: state.session._id,
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
      sessionId: state.session._id,
      examResultId: item.examResult._id,
      studentMembershipId: item.sourceMembership._id,
      targetMembershipId: targetMembership?._id || null,
      studentId: item.studentCore?._id || item.sourceMembership.studentId || null,
      student: item.studentUser?._id || item.sourceMembership.student || null,
      academicYearId: state.session.academicYearId?._id || state.session.academicYearId || null,
      targetAcademicYearId: item.targetAcademicYear?._id || null,
      assessmentPeriodId: state.session.assessmentPeriodId?._id || state.session.assessmentPeriodId || null,
      classId: item.sourceMembership.classId?._id || item.sourceMembership.classId || null,
      targetClassId: item.targetClass?._id || null,
      sourceResultStatus: normalizeText(item.examResult.resultStatus),
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