const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const AcademicYear = require('../models/AcademicYear');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const AfghanStudent = require('../models/AfghanStudent');
const SchoolClass = require('../models/SchoolClass');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
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
  term = '',
  includeFutureMonths = false
} = {}) {
  const requestedDueDate = asDate(dueDate) || new Date();
  const coverageStart = maxDate(
    membership.enrolledAt,
    membership.joinedAt,
    feePlan?.effectiveFrom,
    academicYear?.startDate
  ) || requestedDueDate;
  const coverageEnd = minDate(
    feePlan?.effectiveTo,
    academicYear?.endDate,
    membership.endedAt,
    membership.leftAt
  ) || academicYear?.endDate || feePlan?.effectiveTo || addMonths(coverageStart || requestedDueDate, 11);

  if (!coverageStart || !coverageEnd || coverageEnd.getTime() < coverageStart.getTime()) return [];

  const configuredMonths = Array.isArray(academicYear?.feeBillingMonths)
    ? academicYear.feeBillingMonths.map(Number).filter((month) => month >= 1 && month <= 12)
    : [];
  const feeBillingMonths = new Set(configuredMonths.length ? configuredMonths : [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const requestedDay = Math.max(1, Math.min(28, Number(feePlan?.dueDay || requestedDueDate.getDate() || 10) || 10));

  const buildPeriod = (bounds, dueDateValue = null) => {
    const solarMonth = bounds.solar?.month || (bounds.start.getMonth() + 1);
    if (!feeBillingMonths.has(solarMonth)) return null;
    const solarYear = bounds.solar?.year || bounds.start.getFullYear();
    const label = normalizeText(periodLabel)
      ? `${normalizeText(periodLabel)} - ${solarYear}-${String(solarMonth).padStart(2, '0')}`
      : `${solarYear}-${String(solarMonth).padStart(2, '0')}`;
    return {
      dueDate: dueDateValue || bounds.start,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      periodLabel: label,
      term: normalizeText(term) || label
    };
  };

  if (!includeFutureMonths) {
    const bounds = solarMonthBounds(requestedDueDate);
    if (
      !bounds.start
      || !bounds.end
      || coverageStart.getTime() > bounds.end.getTime()
      || coverageEnd.getTime() < bounds.start.getTime()
    ) {
      return [];
    }
    const period = buildPeriod(bounds, requestedDueDate);
    return period ? [period] : [];
  }

  const periods = [];
  let bounds = solarMonthBounds(coverageStart);
  while (bounds.start.getTime() <= coverageEnd.getTime()) {
    const period = buildPeriod(bounds);
    if (!period) {
      bounds = solarMonthBounds(addDays(bounds.end, 1));
      continue;
    }
    let periodDueDate = bounds.start;
    while ((getSolarDateParts(periodDueDate)?.day || periodDueDate.getDate()) < requestedDay) {
      periodDueDate = addDays(periodDueDate, 1);
    }
    periods.push({
      ...period,
      dueDate: periodDueDate,
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

async function buildAcademicYearLookupVariants(academicYearId = '', academicYear = '') {
  const variants = [];
  const seen = new Set();
  const push = (item = {}) => {
    const normalized = {
      academicYearId: normalizeText(item.academicYearId),
      academicYear: normalizeText(item.academicYear)
    };
    const key = JSON.stringify(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(normalized);
  };

  if (academicYearId) push({ academicYearId });
  if (academicYear) push({ academicYear });

  if (academicYearId) {
    const year = await AcademicYear.findById(academicYearId).select('title code').lean().catch(() => null);
    if (year?.title) push({ academicYear: year.title });
    if (year?.code) push({ academicYear: year.code });
  }

  push({});
  return variants;
}

function pushUniqueId(list = [], value = '') {
  const normalized = normalizeText(value?._id || value);
  if (normalized && !list.includes(normalized)) list.push(normalized);
}

async function buildFeePlanScopeVariants({ classId = '', courseId = '' } = {}) {
  const classIds = [];
  const courseIds = [];
  pushUniqueId(classIds, classId);
  pushUniqueId(courseIds, courseId);

  const lookups = [];
  if (normalizeText(classId)) {
    lookups.push(
      SchoolClass.findById(classId).select('_id legacyCourseId').lean().catch(() => null),
      Course.findOne({ schoolClassRef: classId, kind: 'academic_class' }).select('_id schoolClassRef').lean().catch(() => null),
      Course.findById(classId).select('_id schoolClassRef').lean().catch(() => null)
    );
  }
  if (normalizeText(courseId) && normalizeText(courseId) !== normalizeText(classId)) {
    lookups.push(
      Course.findById(courseId).select('_id schoolClassRef').lean().catch(() => null),
      SchoolClass.findOne({ legacyCourseId: courseId }).select('_id legacyCourseId').lean().catch(() => null)
    );
  }

  const rows = await Promise.all(lookups);
  for (const row of rows) {
    if (!row) continue;
    if (row.schoolClassRef) {
      pushUniqueId(courseIds, row._id);
      pushUniqueId(classIds, row.schoolClassRef);
      continue;
    }
    if (row.legacyCourseId) {
      pushUniqueId(classIds, row._id);
      pushUniqueId(courseIds, row.legacyCourseId);
      continue;
    }
    if (row._id) {
      pushUniqueId(courseIds, row._id);
    }
  }

  const variants = [];
  const seen = new Set();
  const push = (item = {}) => {
    const variant = {
      classId: normalizeText(item.classId),
      courseId: normalizeText(item.courseId)
    };
    const key = JSON.stringify(variant);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(variant);
  };

  for (const resolvedClassId of classIds) {
    for (const resolvedCourseId of courseIds) {
      push({ classId: resolvedClassId, courseId: resolvedCourseId });
    }
    push({ classId: resolvedClassId });
  }
  for (const resolvedCourseId of courseIds) {
    push({ courseId: resolvedCourseId });
  }
  push({ classId, courseId });
  return variants;
}

async function recoverClassMembershipsFromRegisteredStudents({
  classId = '',
  academicYearId = null
} = {}) {
  if (!classId) return [];

  const schoolClass = await SchoolClass.findById(classId).lean();
  if (!schoolClass?._id || !schoolClass?.schoolId) return [];

  const memberships = [];
  const seenStudents = new Set();
  const syncStudent = async (student, payload = {}) => {
    const key = normalizeText(student?._id);
    if (!key || seenStudents.has(key)) return;
    seenStudents.add(key);
    try {
      const membership = await assignStudentToClass({
        student,
        payload: {
          classId: schoolClass._id,
          academicYearId: academicYearId || payload.academicYearId || schoolClass.academicYearId || null,
          enrollmentDate: payload.enrollmentDate || student?.academicInfo?.enrollmentDate || new Date()
        },
        source: 'system',
        note: 'Auto-synced from registration records before grouped billing.'
      });
      if (membership?._id) memberships.push(membership);
    } catch {
      // Keep billing recovery best-effort; invalid student rows should not block valid classmates.
    }
  };

  const enrollmentRows = await Enrollment.find({
    status: 'approved',
    'academicContext.classId': schoolClass._id
  }).select('linkedStudentId academicContext.academicYearId academicContext.enrollmentDate').limit(500);

  const linkedStudentIds = enrollmentRows.map((item) => item.linkedStudentId).filter(Boolean);
  const linkedStudents = linkedStudentIds.length
    ? await AfghanStudent.find({ _id: { $in: linkedStudentIds }, status: { $ne: 'deleted' } }).limit(500)
    : [];
  const studentById = new Map(linkedStudents.map((student) => [normalizeText(student._id), student]));
  for (const enrollment of enrollmentRows) {
    const student = studentById.get(normalizeText(enrollment.linkedStudentId));
    if (student) {
      await syncStudent(student, {
        academicYearId: enrollment.academicContext?.academicYearId,
        enrollmentDate: enrollment.academicContext?.enrollmentDate
      });
    }
  }

  if (!schoolClass.gradeLevel) return memberships;

  const exactQuery = {
    status: 'active',
    'academicInfo.currentSchool': schoolClass.schoolId,
    'academicInfo.currentGrade': `grade${schoolClass.gradeLevel}`
  };
  if (schoolClass.section) exactQuery['academicInfo.currentSection'] = schoolClass.section;
  if (schoolClass.shift) exactQuery['academicInfo.currentShift'] = schoolClass.shift;

  let students = await AfghanStudent.find(exactQuery).limit(500);
  if (!students.length && (schoolClass.section || schoolClass.shift)) {
    students = await AfghanStudent.find({
      status: 'active',
      'academicInfo.currentSchool': schoolClass.schoolId,
      'academicInfo.currentGrade': `grade${schoolClass.gradeLevel}`
    }).limit(500);
  }

  for (const student of students) {
    await syncStudent(student);
  }
  return memberships;
}

function dedupeBillableMemberships(memberships = []) {
  const unique = [];
  const seen = new Set();
  for (const membership of Array.isArray(memberships) ? memberships : []) {
    const key = [
      normalizeText(membership?.student),
      normalizeText(membership?.classId),
      normalizeText(membership?.academicYearId || membership?.academicYear)
    ].join('|');
    if (!normalizeText(membership?._id) || seen.has(key)) continue;
    seen.add(key);
    unique.push(membership);
  }
  return unique;
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
  const yearVariants = await buildAcademicYearLookupVariants(academicYearId, academicYear);
  const scopeVariants = await buildFeePlanScopeVariants({ classId, courseId });
  const relaxedAttempts = [];
  for (const scopeVariant of scopeVariants) {
    for (const yearVariant of yearVariants) {
      relaxedAttempts.push(
        buildFeePlanFilter({ ...scopeVariant, ...yearVariant, term, billingFrequency }),
        buildFeePlanFilter({ ...scopeVariant, ...yearVariant, billingFrequency }),
        buildFeePlanFilter({ ...scopeVariant, ...yearVariant }),
        buildFeePlanFilter({ classId: scopeVariant.classId, ...yearVariant, term, billingFrequency }),
        buildFeePlanFilter({ classId: scopeVariant.classId, ...yearVariant, billingFrequency }),
        buildFeePlanFilter({ classId: scopeVariant.classId, ...yearVariant }),
        buildFeePlanFilter({ courseId: scopeVariant.courseId, ...yearVariant, billingFrequency }),
        buildFeePlanFilter({ courseId: scopeVariant.courseId, ...yearVariant })
      );
    }
  }

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

  if (classId) {
    const recoveredMemberships = await recoverClassMembershipsFromRegisteredStudents({
      classId,
      academicYearId
    });
    if (recoveredMemberships.length || !memberships.length) {
      memberships = await findClassMemberships({
        classId,
        academicYearId,
        academicYear
      });
      if (!memberships.length && (academicYearId || academicYear)) {
        memberships = await findClassMemberships({ classId });
      }
    }
  }

  if (!memberships.length) {
    return {
      feePlan: null,
      items: [],
      excluded: [],
      summary: { candidateCount: 0, billCount: 0, studentCount: 0, membershipCount: 0, excludedCount: 0, totalAmountDue: 0 }
    };
  }

  memberships = dedupeBillableMemberships(memberships);
  const membershipIds = memberships.map((item) => item._id);
  const firstMembershipAcademicYearId = memberships[0]?.academicYearId || memberships[0]?.academicYear || null;
  const effectiveAcademicYearId = academicYearId || firstMembershipAcademicYearId;
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
          reason: feePlan ? 'zero_amount' : 'fee_plan_not_found'
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
        academicYearId: effectiveAcademicYearId || membership.academicYearId || membership.academicYear || null,
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
      billCount: items.length,
      studentCount: new Set(items.map((item) => normalizeText(item.student)).filter(Boolean)).size,
      membershipCount: memberships.length,
      excludedCount: excluded.length,
      totalAmountDue: roundMoney(items.reduce((sum, item) => sum + (Number(item.amountDue) || 0), 0))
    }
  };
}

module.exports = {
  buildGroupedBillCandidates,
  buildMonthlyBillingPeriods
};
