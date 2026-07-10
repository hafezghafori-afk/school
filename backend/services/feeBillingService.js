const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const AcademicYear = require('../models/AcademicYear');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const { findClassMemberships, listCourseMemberships } = require('../utils/studentMembershipLookup');
const { assignStudentToClass } = require('./studentClassAssignmentService');
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

function asDate(value = null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfMonth(value = null) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(value = null) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(value = null, count = 0) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + Number(count || 0), date.getDate());
}

function addDays(value = null, count = 0) {
  const date = asDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(count || 0));
}

function getSolarDateParts(value = null) {
  const date = asDate(value);
  if (!date) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).formatToParts(date);
    const read = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
    return { year: read('year'), month: read('month'), day: read('day') };
  } catch {
    return null;
  }
}

function solarMonthBounds(value = null) {
  const date = asDate(value);
  const solar = getSolarDateParts(date);
  if (!date || !solar) return { start: startOfMonth(date), end: endOfMonth(date), solar };
  let start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  while (getSolarDateParts(addDays(start, -1))?.month === solar.month) start = addDays(start, -1);
  let end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  while (getSolarDateParts(addDays(end, 1))?.month === solar.month) {
    const next = addDays(end, 1);
    end = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 23, 59, 59, 999);
  }
  return { start, end, solar };
}

function maxDate(...values) {
  return values
    .map(asDate)
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())
    .pop() || null;
}

function minDate(...values) {
  return values
    .map(asDate)
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;
}

function overlapsDateWindow(item = {}, windowStart = null, windowEnd = null) {
  const start = asDate(item.startDate);
  const end = asDate(item.endDate);
  const from = asDate(windowStart);
  const to = asDate(windowEnd) || from;
  if (!from && !to) return true;
  if (start && to && start.getTime() > to.getTime()) return false;
  if (end && from && end.getTime() < from.getTime()) return false;
  return true;
}

function buildMonthlyBillingPeriods({
  membership = {},
  feePlan = null,
  academicYear = null,
  dueDate = null,
  periodLabel = '',
  term = ''
} = {}) {
  const requestedDueDate = asDate(dueDate) || new Date();
  const rawStart = maxDate(
    requestedDueDate,
    membership.enrolledAt,
    membership.joinedAt,
    feePlan?.effectiveFrom,
    academicYear?.startDate
  );
  const rawEnd = minDate(
    feePlan?.effectiveTo,
    academicYear?.endDate,
    membership.endedAt,
    membership.leftAt
  ) || academicYear?.endDate || feePlan?.effectiveTo || addMonths(rawStart, 11);

  if (!rawStart || !rawEnd || rawEnd.getTime() < rawStart.getTime()) return [];

  const configuredMonths = Array.isArray(academicYear?.feeBillingMonths)
    ? academicYear.feeBillingMonths.map(Number).filter((month) => month >= 1 && month <= 12)
    : [];
  const feeBillingMonths = new Set(configuredMonths.length ? configuredMonths : [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const requestedDay = Math.max(1, Math.min(28, Number(feePlan?.dueDay || requestedDueDate.getDate() || 10) || 10));
  const periods = [];
  let bounds = solarMonthBounds(rawStart);
  while (bounds.start.getTime() <= rawEnd.getTime()) {
    const solarMonth = bounds.solar?.month || (bounds.start.getMonth() + 1);
    if (!feeBillingMonths.has(solarMonth)) {
      bounds = solarMonthBounds(addDays(bounds.end, 1));
      continue;
    }
    let periodDueDate = bounds.start;
    while ((getSolarDateParts(periodDueDate)?.day || periodDueDate.getDate()) < requestedDay) {
      periodDueDate = addDays(periodDueDate, 1);
    }
    const solarYear = bounds.solar?.year || bounds.start.getFullYear();
    const label = normalizeText(periodLabel)
      ? `${normalizeText(periodLabel)} - ${solarYear}-${String(solarMonth).padStart(2, '0')}`
      : `${solarYear}-${String(solarMonth).padStart(2, '0')}`;
    periods.push({
      dueDate: periodDueDate,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      periodLabel: label,
      term: normalizeText(term) || label
    });
    bounds = solarMonthBounds(addDays(bounds.end, 1));
  }
  return periods;
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

function buildExemptionAdjustments(exemptions = [], amountsByScope = {}, selectedScopes = [], periodWindow = {}) {
  const adjustments = [];
  for (const item of exemptions) {
    if (!overlapsDateWindow(item, periodWindow.start, periodWindow.end)) continue;
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

function buildReliefAdjustments(reliefs = [], amountsByScope = {}, selectedScopes = [], periodWindow = {}) {
  const adjustments = [];
  for (const rawItem of reliefs) {
    const item = toReliefPreviewRecord(rawItem);
    if (item.status !== 'active') continue;
    if (!overlapsDateWindow(item, periodWindow.start, periodWindow.end)) continue;
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

async function recoverClassMembershipsFromRegisteredStudents({
  classId = '',
  academicYearId = null
} = {}) {
  if (!classId) return [];

  const schoolClass = await SchoolClass.findById(classId).lean();
  if (!schoolClass?._id || !schoolClass?.schoolId || !schoolClass?.gradeLevel) return [];

  const query = {
    status: 'active',
    'academicInfo.currentSchool': schoolClass.schoolId,
    'academicInfo.currentGrade': `grade${schoolClass.gradeLevel}`
  };
  if (schoolClass.section) query['academicInfo.currentSection'] = schoolClass.section;
  if (schoolClass.shift) query['academicInfo.currentShift'] = schoolClass.shift;

  const students = await AfghanStudent.find(query).limit(500);
  const memberships = [];
  for (const student of students) {
    try {
      const membership = await assignStudentToClass({
        student,
        payload: {
          classId: schoolClass._id,
          academicYearId: academicYearId || schoolClass.academicYearId || null,
          enrollmentDate: student?.academicInfo?.enrollmentDate || new Date()
        },
        source: 'system',
        note: 'Auto-synced from registration records before grouped billing.'
      });
      if (membership?._id) memberships.push(membership);
    } catch {
      // Keep billing recovery best-effort; invalid student rows should not block valid classmates.
    }
  }
  return memberships;
}

async function resolveFeePlanForBilling({
  feePlanId = '',
  courseId = '',
  classId = '',
  academicYearId = '',
  academicYear = '',
  term = '',
  billingFrequency = ''
} = {}) {
  if (feePlanId) return FinanceFeePlan.findById(feePlanId);

  const sort = { isDefault: -1, priority: 1, updatedAt: -1, createdAt: -1 };
  const exactFilter = buildFeePlanFilter({
    courseId,
    classId,
    academicYearId,
    academicYear,
    term,
    billingFrequency
  });

  const exact = await FinanceFeePlan.findOne(exactFilter).sort(sort);
  if (exact) return exact;

  const relaxedAttempts = [
    buildFeePlanFilter({ courseId, classId, academicYearId, academicYear, billingFrequency }),
    buildFeePlanFilter({ courseId, classId, academicYearId, academicYear }),
    buildFeePlanFilter({ classId, academicYearId, academicYear, billingFrequency }),
    buildFeePlanFilter({ classId, academicYearId, academicYear })
  ];

  const seen = new Set();
  for (const filter of relaxedAttempts) {
    const key = JSON.stringify(filter);
    if (seen.has(key)) continue;
    seen.add(key);
    const plan = await FinanceFeePlan.findOne(filter).sort(sort);
    if (plan) return plan;
  }

  return null;
}

async function buildGroupedBillCandidates({
  courseId = '',
  classId = '',
  academicYear = '',
  academicYearId = '',
  term = '',
  feePlanId = '',
  amount = 0,
  dueDate = null,
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

  let memberships = await listCourseMemberships({
    courseId,
    academicYearId,
    academicYear
  });

  if (!memberships.length && classId) {
    memberships = await findClassMemberships({
      classId,
      academicYearId,
      academicYear
    });
  }

  if (!memberships.length && classId && (academicYearId || academicYear)) {
    memberships = await findClassMemberships({
      classId
    });
  }

  if (!memberships.length && classId) {
    await recoverClassMembershipsFromRegisteredStudents({
      classId,
      academicYearId
    });
    memberships = await findClassMemberships({
      classId,
      academicYearId,
      academicYear
    });
    if (!memberships.length && (academicYearId || academicYear)) {
      memberships = await findClassMemberships({ classId });
    }
  }

  if (!memberships.length) {
    return {
      feePlan: null,
      items: [],
      excluded: [],
      summary: { candidateCount: 0, excludedCount: 0, totalAmountDue: 0 }
    };
  }

  const membershipIds = memberships.map((item) => item._id);
  const firstMembershipAcademicYearId = memberships[0]?.academicYearId || memberships[0]?.academicYear || null;
  const hasRequestedAcademicYearMembership = !academicYearId || memberships.some((item) => (
    String(item?.academicYearId || item?.academicYear || '') === String(academicYearId || '')
  ));
  const effectiveAcademicYearId = hasRequestedAcademicYearMembership
    ? (academicYearId || firstMembershipAcademicYearId)
    : firstMembershipAcademicYearId;
  const billingFrequency = normalizeBillingFrequency(periodType === 'monthly' ? 'monthly' : 'term');

  const [feePlan, academicYearDoc, financeReliefs, discounts, exemptions, openBills] = await Promise.all([
    resolveFeePlanForBilling({
      feePlanId,
      courseId,
      classId,
      academicYearId: effectiveAcademicYearId,
      academicYear,
      term,
      billingFrequency
    }),
    effectiveAcademicYearId ? AcademicYear.findById(effectiveAcademicYearId).lean() : null,
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

    const periods = billingFrequency === 'monthly'
      ? buildMonthlyBillingPeriods({
        membership,
        feePlan,
        academicYear: academicYearDoc,
        dueDate,
        periodLabel,
        term
      })
      : [{
        dueDate: asDate(dueDate),
        periodStart: startOfMonth(dueDate || new Date()),
        periodEnd: endOfMonth(dueDate || new Date()),
        periodLabel,
        term
      }];

    if (!periods.length) {
      excluded.push({
        membershipId,
        studentId: String(membership.student || ''),
        reason: 'outside_membership_period'
      });
      continue;
    }

    for (const period of periods) {
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

      const periodWindow = { start: period.periodStart, end: period.periodEnd };
      const reliefAdjustments = buildReliefAdjustments(reliefMap.get(membershipId) || [], amountsByScope, selectedScopes, periodWindow);
      const adjustmentRows = reliefAdjustments.length
        ? reliefAdjustments
        : [
            ...(discountMap.get(membershipId) || [])
              .filter((item) => overlapsDateWindow(item, periodWindow.start, periodWindow.end))
              .map(buildDiscountAdjustment),
            ...buildExemptionAdjustments(exemptionMap.get(membershipId) || [], amountsByScope, selectedScopes, periodWindow)
          ];
      const totals = summarizeAdjustments(adjustmentRows);
      const amountDue = roundMoney(Math.max(0, amountOriginal - totals.reductionTotal + totals.penaltyTotal));
      const resolvedPeriodLabel = normalizeText(period.periodLabel) || normalizeText(periodLabel);
      const resolvedTerm = normalizeText(period.term) || normalizeText(term);
      const lineItems = normalizeFinanceLineItems({
        feeBreakdown: amountsByScope,
        feeScopes: selectedScopes,
        amountOriginal,
        adjustments: adjustmentRows,
        amountPaid: 0,
        defaultType: 'tuition',
        sourcePlanId: feePlan?._id || null,
        periodKey: resolvedPeriodLabel || resolvedTerm
      });

      items.push({
        student: String(membership.student || ''),
        studentId: membership.studentId || null,
        studentMembershipId: membership._id,
        classId: membership.classId || classId || null,
        academicYearId: membership.academicYearId || effectiveAcademicYearId || null,
        academicYear: academicYear || '',
        course: courseId || membership.course || null,
        dueDate: period.dueDate || asDate(dueDate) || null,
        periodType,
        periodLabel: resolvedPeriodLabel,
        term: resolvedTerm,
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
  buildGroupedBillCandidates,
  buildMonthlyBillingPeriods
};
