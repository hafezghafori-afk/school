const AcademicYear = require('../models/AcademicYear');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const FinanceFeePlan = require('../models/FinanceFeePlan');
const { getFeePlanPrimaryAmount } = require('./financeFeePlanService');
const { normalizeFinanceLineItems, roundMoney } = require('../utils/financeLineItems');
const { nextFinanceDocumentNumber } = require('../utils/financeNumberSequence');
const { syncStudentFinanceFromFinanceBill } = require('../utils/studentFinanceSync');

const ADMISSION_PERIOD_LABEL = 'داخله تبدیلی';

const normalizeId = (value) => String(value?._id || value || '').trim();

const isDuplicateKeyError = (error) => Number(error?.code) === 11000;

const activePlanFilter = () => ({
  isActive: { $ne: false },
  lifecycleStatus: { $nin: ['inactive', 'archived'] }
});

const planSort = {
  isDefault: -1,
  priority: 1,
  updatedAt: -1,
  createdAt: -1
};

const dateAppliesToPlan = (plan, effectiveAt) => {
  const effectiveTime = new Date(effectiveAt || Date.now()).getTime();
  const startsAt = plan?.effectiveFrom ? new Date(plan.effectiveFrom).getTime() : null;
  const endsAt = plan?.effectiveTo ? new Date(plan.effectiveTo).getTime() : null;
  if (Number.isFinite(startsAt) && startsAt > effectiveTime) return false;
  if (Number.isFinite(endsAt) && endsAt < effectiveTime) return false;
  return true;
};

async function resolveAdmissionFeePlan({
  schoolId = '',
  classId = '',
  courseId = '',
  academicYearId = '',
  effectiveAt = new Date()
} = {}) {
  const normalizedClassId = normalizeId(classId);
  const normalizedCourseId = normalizeId(courseId);
  const normalizedSchoolId = normalizeId(schoolId);
  const normalizedAcademicYearId = normalizeId(academicYearId);
  const academicYear = normalizedAcademicYearId
    ? await AcademicYear.findById(normalizedAcademicYearId).select('title code').lean().catch(() => null)
    : null;
  const yearLabels = [academicYear?.title, academicYear?.code].map((item) => String(item || '').trim()).filter(Boolean);
  const scopes = [
    normalizedClassId ? { classId: normalizedClassId } : null,
    normalizedCourseId ? { course: normalizedCourseId } : null
  ].filter(Boolean);
  const yearScopes = [
    normalizedAcademicYearId ? { academicYearId: normalizedAcademicYearId } : null,
    ...yearLabels.map((academicYearLabel) => ({ academicYear: academicYearLabel })),
    !normalizedAcademicYearId && !yearLabels.length
      ? { academicYearId: null, academicYear: { $in: ['', null] } }
      : null
  ].filter(Boolean);

  for (const scope of scopes) {
    for (const yearScope of yearScopes) {
      // Plans are deliberately resolved from the same year or an explicit yearless default.
      // This prevents a transfer from receiving the admission amount of a previous school year.
      // eslint-disable-next-line no-await-in-loop
      const candidates = await FinanceFeePlan.find({
        ...activePlanFilter(),
        ...(normalizedSchoolId ? { schoolId: { $in: [normalizedSchoolId, null] } } : {}),
        ...scope,
        ...yearScope
      }).sort(planSort).limit(25);
      const plan = candidates.find((item) => dateAppliesToPlan(item, effectiveAt));
      if (plan) return { plan, academicYear };
    }
  }

  return { plan: null, academicYear };
}

function buildAdmissionIdentityFilter({ membershipId = '', studentId = '', classId = '', academicYearId = '' } = {}) {
  const normalizedMembershipId = normalizeId(membershipId);
  const normalizedStudentId = normalizeId(studentId);
  const normalizedClassId = normalizeId(classId);
  const normalizedAcademicYearId = normalizeId(academicYearId);
  const identity = normalizedMembershipId
    ? { studentMembershipId: normalizedMembershipId }
    : {
        student: normalizedStudentId,
        ...(normalizedClassId ? { classId: normalizedClassId } : {}),
        ...(normalizedAcademicYearId ? { academicYearId: normalizedAcademicYearId } : {})
      };

  return {
    ...identity,
    status: { $ne: 'void' }
  };
}

async function findExistingAdmissionObligation(scope = {}) {
  const identityFilter = buildAdmissionIdentityFilter(scope);
  const [bill, order] = await Promise.all([
    FinanceBill.findOne({
      ...identityFilter,
      $or: [
        { feeScopes: 'admission' },
        { 'lineItems.feeType': 'admission' }
      ]
    }).sort({ createdAt: -1 }),
    FeeOrder.findOne({
      ...identityFilter,
      $or: [
        { orderType: 'admission' },
        { 'lineItems.feeType': 'admission' }
      ]
    }).sort({ createdAt: -1 })
  ]);
  if (bill) return { kind: 'bill', item: bill };
  if (order) return { kind: 'order', item: order };
  return null;
}

function buildAdmissionDueDate(effectiveAt = new Date(), dueDay = 10) {
  const now = new Date();
  const effectiveDate = new Date(effectiveAt || now);
  const base = Number.isNaN(effectiveDate.getTime()) ? now : effectiveDate;
  const normalizedDueDay = Math.min(28, Math.max(1, Number(dueDay) || 10));
  const floor = new Date(Math.max(now.getTime(), base.getTime()));
  const planned = new Date(floor.getFullYear(), floor.getMonth(), normalizedDueDay, 23, 59, 59, 999);
  if (planned.getTime() >= floor.getTime()) return planned;
  return new Date(floor.getFullYear(), floor.getMonth() + 1, normalizedDueDay, 23, 59, 59, 999);
}

async function generateTransferBillNumber() {
  return nextFinanceDocumentNumber({ model: FinanceBill, field: 'billNumber', prefix: 'BL' });
}

async function issueTransferAdmissionBill({ membership, actorId = null, effectiveAt = null } = {}) {
  if (!membership?._id || !membership?.student || !membership?.course || !membership?.classId) {
    return { created: false, reason: 'membership_scope_missing', bill: null, plan: null };
  }

  const scope = {
    membershipId: membership._id,
    studentId: membership.student,
    classId: membership.classId,
    academicYearId: membership.academicYearId || membership.academicYear
  };
  const issuanceKey = `transfer-admission:${membership._id}`;
  const keyedBill = await FinanceBill.findOne({ issuanceKey });
  if (keyedBill) {
    return { created: false, reason: 'admission_already_issued', bill: keyedBill, plan: null };
  }
  const existing = await findExistingAdmissionObligation(scope);
  if (existing) {
    return {
      created: false,
      reason: 'admission_already_issued',
      bill: existing.kind === 'bill' ? existing.item : null,
      order: existing.kind === 'order' ? existing.item : null,
      plan: null
    };
  }

  const billingDate = effectiveAt || membership.joinedAt || membership.enrolledAt || new Date();
  const { plan, academicYear } = await resolveAdmissionFeePlan({
    schoolId: membership.schoolId,
    classId: membership.classId,
    courseId: membership.course,
    academicYearId: membership.academicYearId || membership.academicYear,
    effectiveAt: billingDate
  });
  if (!plan) {
    return { created: false, reason: 'fee_plan_not_found', bill: null, plan: null };
  }

  const amount = Math.max(0, roundMoney(getFeePlanPrimaryAmount(plan, 'admission')));
  if (amount <= 0) {
    return { created: false, reason: 'admission_fee_not_configured', bill: null, plan };
  }

  const academicYearId = membership.academicYearId || membership.academicYear || null;
  const academicYearLabel = String(academicYear?.title || academicYear?.code || plan.academicYear || '').trim();
  const feeBreakdown = { admission: amount };
  const lineItems = normalizeFinanceLineItems({
    amountOriginal: amount,
    feeBreakdown,
    feeScopes: ['admission'],
    amountPaid: 0,
    adjustments: [],
    defaultType: 'admission',
    sourcePlanId: plan._id,
    periodKey: ADMISSION_PERIOD_LABEL
  });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bill = new FinanceBill({
      billNumber: await generateTransferBillNumber(),
      schoolId: membership.schoolId || null,
      student: membership.student,
      studentId: membership.studentId || null,
      studentMembershipId: membership._id,
      linkScope: 'membership',
      course: membership.course,
      classId: membership.classId,
      academicYearId,
      academicYear: academicYearLabel,
      term: '',
      periodType: 'custom',
      periodLabel: ADMISSION_PERIOD_LABEL,
      issuanceKey,
      currency: String(plan.currency || 'AFN').trim().toUpperCase(),
      amountOriginal: amount,
      amountDue: amount,
      amountPaid: 0,
      feeScopes: ['admission'],
      feeBreakdown,
      lineItems,
      status: 'new',
      issuedAt: new Date(),
      dueDate: buildAdmissionDueDate(billingDate, plan.dueDay),
      note: `صدور خودکار داخله برای شاگرد تبدیلی | عضویت: ${membership._id}`,
      createdBy: actorId || membership.createdBy || null
    });

    try {
      // A second check narrows the race window when two enrollment requests arrive together.
      // eslint-disable-next-line no-await-in-loop
      const concurrentExisting = await findExistingAdmissionObligation(scope);
      if (concurrentExisting) {
        return {
          created: false,
          reason: 'admission_already_issued',
          bill: concurrentExisting.kind === 'bill' ? concurrentExisting.item : null,
          order: concurrentExisting.kind === 'order' ? concurrentExisting.item : null,
          plan
        };
      }
      // eslint-disable-next-line no-await-in-loop
      await bill.save();
      // eslint-disable-next-line no-await-in-loop
      await syncStudentFinanceFromFinanceBill(bill).catch(() => null);
      return { created: true, reason: 'admission_bill_created', bill, plan };
    } catch (error) {
      if (isDuplicateKeyError(error) && (error?.keyPattern?.issuanceKey || error?.keyValue?.issuanceKey)) {
        // The unique issuance key is the final guard against two simultaneous transfer requests.
        // eslint-disable-next-line no-await-in-loop
        const existingByKey = await FinanceBill.findOne({ issuanceKey });
        if (existingByKey) {
          return { created: false, reason: 'admission_already_issued', bill: existingByKey, plan };
        }
      }
      if (isDuplicateKeyError(error) && attempt < 4) continue;
      throw error;
    }
  }

  return { created: false, reason: 'bill_number_conflict', bill: null, plan };
}

module.exports = {
  ADMISSION_PERIOD_LABEL,
  buildAdmissionDueDate,
  findExistingAdmissionObligation,
  issueTransferAdmissionBill,
  resolveAdmissionFeePlan
};
