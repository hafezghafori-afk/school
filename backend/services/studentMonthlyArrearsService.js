const AcademicYear = require('../models/AcademicYear');
const FeeOrder = require('../models/FeeOrder');
const {
  buildGroupedBillCandidates,
  buildMonthlyBillingPeriods,
  resolveFeePlanForBilling
} = require('./feeBillingService');

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const text = (value) => String(value || '').trim();
const money = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);

function solarMonthKey(value = null) {
  const date = value instanceof Date ? value : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(date);
    const year = Number(parts.find((item) => item.type === 'year')?.value || 0);
    const month = Number(parts.find((item) => item.type === 'month')?.value || 0);
    if (!year || !month) return '';
    return `${year}-${String(month).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function hasTuitionLine(order = {}) {
  return (Array.isArray(order?.lineItems) ? order.lineItems : [])
    .some((item) => text(item?.feeType) === 'tuition' && Number(item?.grossAmount || item?.netAmount || 0) > 0);
}

function uniquePeriodsThroughCurrent(periods = [], now = new Date()) {
  const currentKey = solarMonthKey(now);
  const seen = new Set();
  return (Array.isArray(periods) ? periods : [])
    .filter((period) => {
      const key = solarMonthKey(period?.dueDate || period?.periodStart);
      if (!key || !currentKey || key > currentKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => new Date(left?.dueDate || 0) - new Date(right?.dueDate || 0));
}

async function resolveAcademicYear(membership = {}) {
  const populated = membership?.academicYearId && typeof membership.academicYearId === 'object'
    ? membership.academicYearId
    : membership?.academicYear && typeof membership.academicYear === 'object'
      ? membership.academicYear
      : membership?.classId?.academicYearId && typeof membership.classId.academicYearId === 'object'
        ? membership.classId.academicYearId
        : null;
  if (populated?.startDate || populated?.endDate || populated?.feeBillingMonths) return populated;
  const academicYearId = idOf(membership?.academicYearId || membership?.academicYear || membership?.classId?.academicYearId);
  return academicYearId ? AcademicYear.findById(academicYearId).lean() : null;
}

async function createMonthlyOrder({ membership, feePlan, academicYear, period, actorId = '' } = {}) {
  const membershipId = idOf(membership);
  const classId = idOf(membership?.classId);
  const courseId = idOf(membership?.course);
  const academicYearId = idOf(membership?.academicYearId || membership?.academicYear || academicYear);
  const monthKey = solarMonthKey(period?.dueDate || period?.periodStart);
  if (!membershipId || !monthKey) return { created: false, reason: 'invalid_period' };

  const issuanceKey = `auto-monthly-tuition:${membershipId}:${monthKey}`;
  const existingByKey = await FeeOrder.findOne({ issuanceKey }).select('_id');
  if (existingByKey) return { created: false, reason: 'already_exists', orderId: idOf(existingByKey) };

  const preview = await buildGroupedBillCandidates({
    courseId,
    classId,
    academicYearId,
    academicYear: text(academicYear?.title || academicYear?.code),
    feePlanId: idOf(feePlan),
    dueDate: period?.dueDate,
    periodType: 'monthly',
    periodLabel: '',
    includeAdmission: false,
    includeTransport: false,
    includeExam: false,
    includeDocument: false,
    includeOther: false,
    onlyDebtors: false,
    recoverMemberships: false
  });

  const candidate = (Array.isArray(preview?.items) ? preview.items : []).find((item) => (
    idOf(item?.studentMembershipId) === membershipId
    && solarMonthKey(item?.dueDate) === monthKey
  ));
  if (!candidate || Number(candidate?.amountOriginal || 0) <= 0) {
    return { created: false, reason: preview?.feePlan ? 'candidate_not_found' : 'fee_plan_not_found' };
  }

  const compactMonth = monthKey.replace('-', '');
  const suffix = membershipId.slice(-10).toUpperCase();
  const orderNumber = `AUTO-FEE-${compactMonth}-${suffix}`;
  try {
    const order = await FeeOrder.create({
      orderNumber,
      title: `فیس ماهانه ${candidate.periodLabel || monthKey}`,
      orderType: 'tuition',
      source: 'system',
      issuanceKey,
      student: idOf(candidate.student || membership?.student),
      studentId: idOf(candidate.studentId || membership?.studentId) || null,
      studentMembershipId: membershipId,
      linkScope: 'membership',
      course: idOf(candidate.course || membership?.course) || null,
      schoolId: idOf(membership?.schoolId) || null,
      classId: idOf(candidate.classId || membership?.classId) || null,
      academicYearId: idOf(candidate.academicYearId || academicYearId) || null,
      periodType: 'monthly',
      periodLabel: candidate.periodLabel || monthKey,
      currency: text(candidate.currency).toUpperCase() || text(feePlan?.currency).toUpperCase() || 'AFN',
      amountOriginal: money(candidate.amountOriginal),
      amountDue: money(candidate.amountDue),
      amountPaid: 0,
      outstandingAmount: money(candidate.amountDue),
      lineItems: Array.isArray(candidate.lineItems) ? candidate.lineItems : [],
      adjustments: Array.isArray(candidate.adjustments) ? candidate.adjustments : [],
      issuedAt: period?.periodStart || period?.dueDate || new Date(),
      dueDate: period?.dueDate || null,
      note: [candidate.note, 'auto:monthly-arrears-backfill'].filter(Boolean).join(' | '),
      createdBy: idOf(actorId) || null
    });
    return { created: true, orderId: idOf(order), monthKey };
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const existing = await FeeOrder.findOne({ $or: [{ issuanceKey }, { orderNumber }] }).select('_id');
      return { created: false, reason: 'already_exists', orderId: idOf(existing) };
    }
    throw error;
  }
}

async function syncStudentMonthlyArrears({ memberships = [], actorId = '', now = new Date() } = {}) {
  const results = [];
  for (const membership of Array.isArray(memberships) ? memberships : []) {
    const membershipId = idOf(membership);
    if (!membershipId || !idOf(membership?.student)) continue;

    const academicYear = await resolveAcademicYear(membership);
    const academicYearId = idOf(membership?.academicYearId || membership?.academicYear || academicYear);
    const feePlan = await resolveFeePlanForBilling({
      courseId: idOf(membership?.course),
      classId: idOf(membership?.classId),
      academicYearId,
      academicYear: text(academicYear?.title || academicYear?.code),
      billingFrequency: 'monthly'
    });

    if (!feePlan || text(feePlan.billingFrequency) !== 'monthly' || Number(feePlan.tuitionFee || feePlan.amount || 0) <= 0) {
      results.push({ membershipId, created: 0, skipped: 1, reason: 'monthly_fee_plan_not_found' });
      continue;
    }

    const periods = uniquePeriodsThroughCurrent(buildMonthlyBillingPeriods({
      membership,
      feePlan,
      academicYear,
      dueDate: now,
      includeFutureMonths: true
    }), now);

    const existingOrders = await FeeOrder.find({
      studentMembershipId: membershipId,
      status: { $ne: 'void' },
      dueDate: { $ne: null }
    }).select('dueDate lineItems');
    const issuedMonths = new Set(
      existingOrders
        .filter(hasTuitionLine)
        .map((order) => solarMonthKey(order.dueDate))
        .filter(Boolean)
    );

    let created = 0;
    let skipped = 0;
    const reasons = {};
    for (const period of periods) {
      const monthKey = solarMonthKey(period?.dueDate || period?.periodStart);
      if (!monthKey || issuedMonths.has(monthKey)) {
        skipped += 1;
        reasons.already_exists = (reasons.already_exists || 0) + 1;
        continue;
      }
      const result = await createMonthlyOrder({ membership, feePlan, academicYear, period, actorId });
      if (result.created) {
        created += 1;
        issuedMonths.add(monthKey);
      } else {
        skipped += 1;
        const reason = result.reason || 'not_created';
        reasons[reason] = (reasons[reason] || 0) + 1;
      }
    }
    results.push({ membershipId, created, skipped, reasons, expectedMonths: periods.length });
  }

  return {
    created: results.reduce((sum, item) => sum + Number(item.created || 0), 0),
    skipped: results.reduce((sum, item) => sum + Number(item.skipped || 0), 0),
    memberships: results
  };
}

module.exports = {
  solarMonthKey,
  syncStudentMonthlyArrears,
  uniquePeriodsThroughCurrent
};
