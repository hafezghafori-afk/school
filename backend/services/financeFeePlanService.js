const AcademicYear = require('../models/AcademicYear');

const PLAN_TYPES = ['standard', 'charity', 'sibling', 'scholarship', 'special', 'semi_annual'];

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeMoney(value = 0) {
  return Math.max(0, Number(value) || 0);
}

function normalizeBool(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

function normalizeDate(value = null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeBillingFrequency(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (['monthly', 'term', 'annual', 'custom'].includes(normalized)) return normalized;
  return 'term';
}

function normalizePlanType(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  return PLAN_TYPES.includes(normalized) ? normalized : 'standard';
}

function normalizePlanCode(value = '', fallback = 'STANDARD') {
  const normalized = normalizeText(value)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || fallback;
}

function getDefaultPriority(planType = 'standard') {
  return planType === 'standard' ? 100 : 200;
}

function humanizePlanType(planType = 'standard') {
  const normalized = normalizePlanType(planType);
  if (normalized === 'charity') return 'Charity';
  if (normalized === 'sibling') return 'Sibling';
  if (normalized === 'scholarship') return 'Scholarship';
  if (normalized === 'special') return 'Special';
  if (normalized === 'semi_annual') return 'Semi Annual';
  return 'Standard';
}

function derivePeriodType(billingFrequency = '') {
  return normalizeBillingFrequency(billingFrequency) === 'monthly' ? 'monthly' : 'term';
}

function deriveAcademicYearLabel(academicYear = null, fallback = '') {
  if (academicYear?._id) {
    return normalizeText(academicYear.title) || normalizeText(academicYear.code) || normalizeText(fallback);
  }
  return normalizeText(fallback);
}

async function resolveAcademicYearForFeePlan({
  academicYearId = '',
  academicYear = '',
  academicYearCode = ''
} = {}) {
  const normalizedId = normalizeText(academicYearId);
  const normalizedLabel = normalizeText(academicYear);
  const normalizedCode = normalizeText(academicYearCode);

  if (normalizedId) {
    return AcademicYear.findById(normalizedId);
  }

  if (normalizedCode) {
    const byCode = await AcademicYear.findOne({ code: normalizedCode });
    if (byCode) return byCode;
  }

  if (normalizedLabel) {
    return AcademicYear.findOne({
      $or: [
        { title: normalizedLabel },
        { code: normalizedLabel }
      ]
    });
  }

  return null;
}

function normalizeFeePlanPayload(payload = {}, context = {}) {
  const billingFrequency = normalizeBillingFrequency(payload.billingFrequency || payload.periodType);
  const planType = normalizePlanType(payload.planType);
  const planCode = normalizePlanCode(payload.planCode, planType === 'standard' ? 'STANDARD' : String(planType || 'PLAN').toUpperCase());
  const tuitionFee = normalizeMoney(
    payload.tuitionFee != null && payload.tuitionFee !== ''
      ? payload.tuitionFee
      : payload.amount
  );
  const admissionFee = normalizeMoney(payload.admissionFee);
  const examFee = normalizeMoney(payload.examFee);
  const documentFee = normalizeMoney(payload.documentFee);
  const transportDefaultFee = normalizeMoney(payload.transportDefaultFee);
  const otherFee = normalizeMoney(payload.otherFee);
  const currency = normalizeText(payload.currency).toUpperCase() || 'AFN';
  const dueDay = Math.max(1, Math.min(28, Number(payload.dueDay) || 10));
  const term = normalizeText(payload.term);
  const priority = Math.max(0, Number(payload.priority != null && payload.priority !== '' ? payload.priority : getDefaultPriority(planType)) || 0);
  const effectiveFrom = normalizeDate(payload.effectiveFrom);
  let effectiveTo = normalizeDate(payload.effectiveTo);
  if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
    effectiveTo = effectiveFrom;
  }
  const isActive = payload.isActive !== false;
  const isDefault = isActive ? normalizeBool(payload.isDefault, false) : false;
  const academicYearLabel = deriveAcademicYearLabel(context.academicYear, payload.academicYear);
  const schoolClassTitle = normalizeText(context.schoolClass?.title);
  const title = normalizeText(payload.title)
    || [schoolClassTitle, academicYearLabel, humanizePlanType(planType), billingFrequency === 'monthly' ? 'Fee Plan' : 'Fee Plan']
      .filter(Boolean)
      .join(' - ');

  return {
    title,
    planCode,
    planType,
    priority,
    effectiveFrom,
    effectiveTo,
    isDefault,
    eligibilityRule: normalizeText(payload.eligibilityRule),
    course: context.courseId || null,
    classId: context.classId || null,
    academicYearId: context.academicYear?._id || null,
    academicYear: academicYearLabel,
    term,
    grade: normalizeText(payload.grade),
    subject: normalizeText(payload.subject),
    billingFrequency,
    periodType: derivePeriodType(billingFrequency),
    tuitionFee,
    admissionFee,
    examFee,
    documentFee,
    transportDefaultFee,
    otherFee,
    amount: tuitionFee,
    dueDay,
    currency,
    isActive,
    note: normalizeText(payload.note)
  };
}

function buildFeePlanIdentityFilter(payload = {}, context = {}) {
  const billingFrequency = normalizeBillingFrequency(payload.billingFrequency || payload.periodType);
  const planType = normalizePlanType(payload.planType);
  const filter = {
    classId: context.classId || null,
    term: normalizeText(payload.term),
    billingFrequency,
    periodType: derivePeriodType(billingFrequency),
    planCode: normalizePlanCode(payload.planCode, planType === 'standard' ? 'STANDARD' : String(planType || 'PLAN').toUpperCase())
  };

  if (context.courseId) {
    filter.course = context.courseId;
  }

  if (context.academicYear?._id) {
    filter.academicYearId = context.academicYear._id;
  } else {
    filter.academicYear = deriveAcademicYearLabel(context.academicYear, payload.academicYear);
  }

  return filter;
}

function getFeePlanPrimaryAmount(plan = null, feeType = 'tuition') {
  if (!plan) return 0;
  if (feeType === 'admission') return normalizeMoney(plan.admissionFee);
  if (feeType === 'exam') return normalizeMoney(plan.examFee);
  if (feeType === 'document') return normalizeMoney(plan.documentFee);
  if (feeType === 'transport') return normalizeMoney(plan.transportDefaultFee);
  if (feeType === 'other') return normalizeMoney(plan.otherFee);
  return normalizeMoney(plan.tuitionFee != null ? plan.tuitionFee : plan.amount);
}

module.exports = {
  buildFeePlanIdentityFilter,
  deriveAcademicYearLabel,
  derivePeriodType,
  getFeePlanPrimaryAmount,
  humanizePlanType,
  normalizeBillingFrequency,
  normalizeBool,
  normalizeFeePlanPayload,
  normalizeMoney,
  normalizePlanCode,
  normalizePlanType,
  normalizeText,
  resolveAcademicYearForFeePlan
};
