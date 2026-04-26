const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const { listCourseMemberships } = require('../utils/studentMembershipLookup');
const {
  getFeePlanPrimaryAmount,
  normalizeBillingFrequency,
  normalizeText
} = require('./financeFeePlanService');
const { normalizeFinanceLineItems } = require('../utils/financeLineItems');
const {
  buildFinanceReliefPayloadFromDiscount,
  buildFinanceReliefPayloadFromExemption,
  toReliefPreviewRecord,
  reliefAppliesReduction
} = require('../utils/financeRelief');

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function normalizeBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function buildSelectedScopes({
  includeAdmission = false,
  includeTransport = false,
  includeExam = false,
  includeDocument = false,
  includeOther = false
} = {}) {
  const scopes = ['tuition'];
  if (normalizeBool(includeAdmission)) scopes.push('admission');
  if (normalizeBool(includeTransport)) scopes.push('transport');
  if (normalizeBool(includeExam)) scopes.push('exam');
  if (normalizeBool(includeDocument)) scopes.push('document');
  if (normalizeBool(includeOther)) scopes.push('other');
  return scopes;
}

function buildPlanAmountsByScope(plan = null, scopes = [], amountOverride = 0) {
  const amounts = {};
  scopes.forEach((scope) => {
    if (scope === 'tuition' && amountOverride > 0) {
      amounts[scope] = roundMoney(amountOverride);
      return;
    }
    amounts[scope] = roundMoney(getFeePlanPrimaryAmount(plan, scope));
  });
  return amounts;
}

function sumScopedAmount(amounts = {}, scopes = []) {
  return scopes.reduce((sum, scope) => sum + (Number(amounts[scope]) || 0), 0);
}

function buildDiscountAdjustment(item = {}) {
  const type = ['discount', 'waiver', 'penalty', 'manual'].includes(normalizeText(item.discountType))
    ? normalizeText(item.discountType)
    : 'discount';
  return {
    type,
    amount: roundMoney(item.amount),
    reason: normalizeText(item.reason),
    createdBy: item.createdBy || null,
    createdAt: item.createdAt || new Date()
  };
}

function buildAdjustmentFromRelief(item = {}) {
  const reliefType = normalizeText(item.reliefType);
  if (reliefType === 'penalty') {
    return {
      type: 'penalty',
      amount: roundMoney(item.amount),
      reason: normalizeText(item.reason),
      createdBy: item.createdBy || null,
      createdAt: item.createdAt || item.startDate || new Date()
    };
  }

  return {
    type: reliefType === 'discount' || reliefType === 'sibling_discount' ? 'discount' : 'waiver',
    amount: roundMoney(item.amount),
    reason: normalizeText(item.reason),
    createdBy: item.createdBy || item.approvedBy || null,
    createdAt: item.createdAt || item.startDate || new Date()
  };
}

function resolveExemptionScopes(exemption = {}, selectedScopes = []) {
  const scope = normalizeText(exemption.scope) || 'all';
  if (scope === 'all') return selectedScopes;
  return selectedScopes.filter((item) => item === scope);
}

function buildExemptionAdjustments(exemptions = [], amountsByScope = {}, selectedScopes = []) {
  const adjustments = [];
  for (const item of exemptions) {
    const scopes = resolveExemptionScopes(item, selectedScopes);
    if (!scopes.length) continue;
    const scopedAmount = sumScopedAmount(amountsByScope, scopes);
    if (scopedAmount <= 0) continue;

    let reduction = scopedAmount;
    if (normalizeText(item.exemptionType) === 'partial') {
      const fixedAmount = roundMoney(item.amount);
      const percentageAmount = roundMoney(scopedAmount * ((Number(item.percentage) || 0) / 100));
      reduction = Math.min(scopedAmount, Math.max(fixedAmount, percentageAmount));
    }

    if (reduction <= 0) continue;
    adjustments.push({
      type: 'waiver',
      amount: reduction,
      reason: normalizeText(item.reason) || `Fee exemption (${scopes.join(', ')})`,
      createdBy: item.createdBy || item.approvedBy || null,
      createdAt: item.createdAt || new Date()
    });
  }
  return adjustments;
}

function buildReliefAdjustments(reliefs = [], amountsByScope = {}, selectedScopes = []) {
  const adjustments = [];
  for (const rawItem of reliefs) {
    const item = toReliefPreviewRecord(rawItem);
    if (item.status !== 'active') continue;
    const scopes = resolveExemptionScopes(item, selectedScopes);
    const scopedAmount = sumScopedAmount(amountsByScope, scopes);

    if (item.reliefType === 'penalty') {
      if (item.amount <= 0) continue;
      adjustments.push(buildAdjustmentFromRelief(item));
      continue;
    }

    if (!reliefAppliesReduction(item.reliefType) || !scopes.length || scopedAmount <= 0) continue;

    let reduction = scopedAmount;
    if (item.coverageMode === 'percent') {
      reduction = roundMoney(scopedAmount * ((Number(item.percentage) || 0) / 100));
    } else if (item.coverageMode === 'fixed') {
      reduction = Math.min(scopedAmount, roundMoney(item.amount));
    }

    if (reduction <= 0) continue;
    adjustments.push(buildAdjustmentFromRelief({
      ...item,
      amount: reduction,
      reason: item.reason || `Relief (${scopes.join(', ')})`
    }));
  }
  return adjustments;
}

function summarizeAdjustments(adjustments = []) {
  return adjustments.reduce((summary, item) => {
    if (item.type === 'penalty') {
      summary.penaltyTotal += roundMoney(item.amount);
    } else {
      summary.reductionTotal += roundMoney(item.amount);
    }
    return summary;
  }, { reductionTotal: 0, penaltyTotal: 0 });
}

function buildFeePlanFilter({
  courseId = '',
  classId = '',
  academicYearId = '',
  academicYear = '',
  term = '',
  billingFrequency = ''
} = {}) {
  const filter = { isActive: true };
  if (courseId) filter.course = courseId;
  if (classId) filter.classId = classId;
  if (academicYearId) {
    filter.academicYearId = academicYearId;
  } else if (academicYear) {
    filter.academicYear = academicYear;
  }
  if (term) filter.term = term;
  if (billingFrequency) {
    filter.billingFrequency = normalizeBillingFrequency(billingFrequency);
  }
  return filter;
}

async function buildGroupedBillCandidates({
  courseId = '',
  classId = '',
  academicYear = '',
  academicYearId = '',
  term = '',
  feePlanId = '',
  amount = 0,
  currency = 'AFN',
  periodType = 'term',
  periodLabel = '',
  includeAdmission = false,
  includeTransport = false,
  includeExam = false,
  includeDocument = false,
  includeOther = false,
  onlyDebtors = false
} = {}) {
  const selectedScopes = buildSelectedScopes({
    includeAdmission,
    includeTransport,
    includeExam,
    includeDocument,
    includeOther
  });

  const memberships = await listCourseMemberships({
    courseId,
    academicYearId,
    academicYear
  });

  if (!memberships.length) {
    return {
      feePlan: null,
      items: [],
      excluded: [],
      summary: { candidateCount: 0, excludedCount: 0, totalAmountDue: 0 }
    };
  }

  const membershipIds = memberships.map((item) => item._id);
  const effectiveAcademicYearId = academicYearId || memberships[0]?.academicYearId || null;
  const billingFrequency = normalizeBillingFrequency(periodType === 'monthly' ? 'monthly' : 'term');

  const [feePlan, financeReliefs, discounts, exemptions, openBills] = await Promise.all([
    feePlanId
      ? FinanceFeePlan.findById(feePlanId)
      : FinanceFeePlan.findOne(buildFeePlanFilter({
        courseId,
        classId,
        academicYearId: effectiveAcademicYearId,
        academicYear,
        term,
        billingFrequency
      })).sort({ isDefault: -1, priority: 1, updatedAt: -1, createdAt: -1 }),
    FinanceRelief.find({
      studentMembershipId: { $in: membershipIds },
      status: 'active'
    }),
    Discount.find({
      studentMembershipId: { $in: membershipIds },
      feeOrderId: null,
      status: 'active'
    }),
    FeeExemption.find({
      studentMembershipId: { $in: membershipIds },
      status: 'active'
    }),
    FinanceBill.find({
      studentMembershipId: { $in: membershipIds },
      status: { $in: ['new', 'partial', 'overdue'] }
    }).select('studentMembershipId')
  ]);

  const reliefMap = new Map();
  const pushRelief = (membershipId = '', row = null) => {
    const key = String(membershipId || '');
    if (!key || !row) return;
    if (!reliefMap.has(key)) reliefMap.set(key, []);
    reliefMap.get(key).push(row);
  };

  financeReliefs.forEach((item) => {
    pushRelief(item.studentMembershipId, toReliefPreviewRecord(item));
  });

  const discountMap = new Map();
  discounts.forEach((item) => {
    const key = String(item.studentMembershipId || '');
    if (!discountMap.has(key)) discountMap.set(key, []);
    discountMap.get(key).push(item);
    if (!(reliefMap.get(key) || []).some((row) => row.sourceKey === `discount:${String(item._id || '')}`)) {
      pushRelief(key, buildFinanceReliefPayloadFromDiscount(item));
    }
  });

  const exemptionMap = new Map();
  exemptions.forEach((item) => {
    const key = String(item.studentMembershipId || '');
    if (!exemptionMap.has(key)) exemptionMap.set(key, []);
    exemptionMap.get(key).push(item);
    if (!(reliefMap.get(key) || []).some((row) => row.sourceKey === `fee_exemption:${String(item._id || '')}`)) {
      pushRelief(key, buildFinanceReliefPayloadFromExemption(item));
    }
  });

  const debtorSet = new Set(openBills.map((item) => String(item.studentMembershipId || '')));
  const excluded = [];
  const items = [];

  for (const membership of memberships) {
    const membershipId = String(membership._id || '');
    if (!membershipId) continue;

    if (normalizeBool(onlyDebtors) && !debtorSet.has(membershipId)) {
      excluded.push({
        membershipId,
        studentId: String(membership.student || ''),
        reason: 'not_debtor'
      });
      continue;
    }

    const amountsByScope = buildPlanAmountsByScope(feePlan, selectedScopes, roundMoney(amount));
    const amountOriginal = roundMoney(sumScopedAmount(amountsByScope, selectedScopes));
    if (amountOriginal <= 0) {
      excluded.push({
        membershipId,
        studentId: String(membership.student || ''),
        reason: 'zero_amount'
      });
      continue;
    }

    const reliefAdjustments = buildReliefAdjustments(reliefMap.get(membershipId) || [], amountsByScope, selectedScopes);
    const adjustmentRows = reliefAdjustments.length
      ? reliefAdjustments
      : [
          ...(discountMap.get(membershipId) || []).map(buildDiscountAdjustment),
          ...buildExemptionAdjustments(exemptionMap.get(membershipId) || [], amountsByScope, selectedScopes)
        ];
    const totals = summarizeAdjustments(adjustmentRows);
    const amountDue = roundMoney(Math.max(0, amountOriginal - totals.reductionTotal + totals.penaltyTotal));
    const lineItems = normalizeFinanceLineItems({
      feeBreakdown: amountsByScope,
      feeScopes: selectedScopes,
      amountOriginal,
      adjustments: adjustmentRows,
      amountPaid: 0,
      defaultType: 'tuition',
      sourcePlanId: feePlan?._id || null,
      periodKey: normalizeText(periodLabel) || normalizeText(term)
    });

    items.push({
      student: String(membership.student || ''),
      studentId: membership.studentId || null,
      studentMembershipId: membership._id,
      classId: membership.classId || classId || null,
      academicYearId: membership.academicYearId || effectiveAcademicYearId || null,
      academicYear: academicYear || '',
      course: courseId || membership.course || null,
      periodType,
      periodLabel,
      term,
      currency: normalizeText(currency).toUpperCase() || 'AFN',
      amountOriginal,
      amountDue,
      adjustments: adjustmentRows,
      feeScopes: selectedScopes,
      feeBreakdown: amountsByScope,
      lineItems,
      note: [
        feePlan?.title ? `plan:${normalizeText(feePlan.title)}` : '',
        `scopes:${selectedScopes.join(',')}`
      ].filter(Boolean).join(' | ')
    });
  }

  return {
    feePlan: feePlan ? {
      id: String(feePlan._id || ''),
      title: normalizeText(feePlan.title),
      planCode: normalizeText(feePlan.planCode).toUpperCase(),
      planType: normalizeText(feePlan.planType) || 'standard',
      priority: Number(feePlan.priority || 0),
      isDefault: feePlan.isDefault === true
    } : null,
    items,
    excluded,
    summary: {
      candidateCount: items.length,
      excludedCount: excluded.length,
      totalAmountDue: roundMoney(items.reduce((sum, item) => sum + (Number(item.amountDue) || 0), 0))
    }
  };
}

module.exports = {
  buildGroupedBillCandidates
};
