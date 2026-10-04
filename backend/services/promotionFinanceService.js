// The finance side of a promotion batch (phase 2 of «مرکز ارتقا صنف»):
// - what each student still owes on the source-year membership (a debt only
//   warns - agreed), and which of its documents are dated after the student
//   leaves the class;
// - settling those after-end documents inside the promotion transaction: an
//   unpaid one is voided unless its month is closed, a paid one becomes a
//   refund case for the finance office to settle as credit on the new year
//   (`credit_next_bill`) - the money itself never moves without them;
// - which discounts/exemptions could follow the student into the new year,
//   and carrying the chosen ones over once the promotion has committed.
// Government finance reports are built from payments and expenses, so voiding
// an unpaid bill never changes a ratified report; closed months are the lock
// that applies here.

const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FeeOrder = require('../models/FeeOrder');
const FinanceBill = require('../models/FinanceBill');
const { resolveFeePlanForBilling } = require('./feeBillingService');
const { isFinanceMonthClosed } = require('./financePeriodGuardService');
const { hasPaymentEvidence } = require('./membershipBillingReconciliationService');
const { createFinanceRefundCase } = require('../utils/financeRefundCase');
const { isSecondChanceFeeDocument } = require('../utils/secondChanceFee');
const { nextAfghanMonthStart } = require('../utils/afghanDate');

const PROMOTION_VOID_REASON = 'ارتقای صنف: سند مربوط به دورهٔ بعد از ختم عضویت در صنف مبدا است.';
const PROMOTION_REFUND_NOTE = 'ارتقای صنف: این پرداخت مربوط به دورهٔ بعد از ختم عضویت در صنف مبدا است؛ پیشنهاد: به‌عنوان اعتبار در بل سال جدید (credit_next_bill) حساب شود.';
const OPEN_UNPAID_STATUSES = Object.freeze(['new', 'overdue']);

const DISCOUNT_TYPE_LABELS = Object.freeze({
  discount: 'تخفیف',
  waiver: 'معافیت',
  penalty: 'جریمه',
  manual: 'تخفیف دستی'
});

function idOf(value) {
  return String(value?._id || value || '').trim();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function outstandingOf(document = {}) {
  return Math.max(0, money(Number(document.amountDue || 0) - Number(document.amountPaid || 0)));
}

// Documents are filed under the Afghan month of their due date; the month the
// student leaves in still belongs to them, the next Afghan month does not.
function postEndWindowStart(sourceEndAt) {
  const end = sourceEndAt instanceof Date ? sourceEndAt : new Date(sourceEndAt);
  if (Number.isNaN(end.getTime())) return null;
  return nextAfghanMonthStart(end) || new Date(end.getFullYear(), end.getMonth() + 1, 1);
}

function serializeRelief(item, sourceModel) {
  if (sourceModel === 'discount') {
    return {
      id: idOf(item),
      sourceModel,
      label: DISCOUNT_TYPE_LABELS[text(item.discountType)] || 'تخفیف',
      kind: text(item.discountType),
      coverageMode: text(item.coverageMode) || 'fixed',
      amount: Number(item.amount || 0),
      percentage: Number(item.percentage || 0),
      scope: 'all',
      reason: text(item.reason),
      targetScope: text(item.targetScope) || 'student'
    };
  }
  return {
    id: idOf(item),
    sourceModel,
    label: text(item.exemptionType) === 'partial' ? 'معافیت جزئی' : 'معافیت کامل',
    kind: text(item.exemptionType),
    coverageMode: text(item.exemptionType) === 'partial' && Number(item.percentage || 0) > 0 ? 'percent' : (text(item.exemptionType) === 'partial' ? 'fixed' : 'full'),
    amount: Number(item.amount || 0),
    percentage: Number(item.percentage || 0),
    scope: text(item.scope) || 'all',
    reason: text(item.reason),
    targetScope: 'student'
  };
}

// Per source membership: the source-year debt (warning only), the documents
// dated after the end that settling would void or turn into a refund case,
// and the reliefs that could be carried over.
async function buildPromotionFinancePreview({ membershipIds = [], sourceEndAt = null } = {}) {
  const ids = [...new Set(membershipIds.map(idOf).filter(Boolean))];
  const byMembership = new Map(ids.map((id) => [id, {
    outstanding: 0,
    outstandingCount: 0,
    postEndUnpaid: [],
    postEndPaid: [],
    reliefs: []
  }]));
  if (!ids.length) return byMembership;

  const windowStart = postEndWindowStart(sourceEndAt);
  const [orders, discounts, exemptions] = await Promise.all([
    FeeOrder.find({ studentMembershipId: { $in: ids }, status: { $ne: 'void' } })
      .select('studentMembershipId status amountDue amountPaid dueDate orderNumber periodLabel issuanceKey paymentBreakdown lineItems.paidAmount')
      .lean(),
    Discount.find({ studentMembershipId: { $in: ids }, status: 'active', source: { $in: ['manual', 'migration'] } })
      .select('studentMembershipId discountType coverageMode amount percentage reason targetScope')
      .lean(),
    FeeExemption.find({ studentMembershipId: { $in: ids }, status: 'active' })
      .select('studentMembershipId exemptionType scope amount percentage reason')
      .lean()
  ]);

  orders.forEach((order) => {
    const entry = byMembership.get(idOf(order.studentMembershipId));
    if (!entry) return;
    const due = order.dueDate ? new Date(order.dueDate) : null;
    // The second-chance exam fee is dated after the year on purpose; it stays as that year's debt.
    const afterEnd = Boolean(windowStart && due && due >= windowStart) && !isSecondChanceFeeDocument(order);
    const summary = {
      id: idOf(order),
      number: text(order.orderNumber),
      periodLabel: text(order.periodLabel),
      dueDate: order.dueDate || null,
      amountDue: Number(order.amountDue || 0),
      amountPaid: Number(order.amountPaid || 0)
    };
    if (afterEnd) {
      if (hasPaymentEvidence(order)) entry.postEndPaid.push(summary);
      else entry.postEndUnpaid.push(summary);
      return;
    }
    const outstanding = outstandingOf(order);
    if (outstanding > 0 && text(order.status) !== 'paid') {
      entry.outstanding = money(entry.outstanding + outstanding);
      entry.outstandingCount += 1;
    }
  });
  discounts.forEach((item) => byMembership.get(idOf(item.studentMembershipId))?.reliefs.push(serializeRelief(item, 'discount')));
  exemptions.forEach((item) => byMembership.get(idOf(item.studentMembershipId))?.reliefs.push(serializeRelief(item, 'fee_exemption')));
  return byMembership;
}

// Classes of the target year without a fee plan get no bills next year, so the
// preview says so before anyone is moved into them.
async function findTargetClassesWithoutFeePlan({ targetClasses = [], targetAcademicYear = null } = {}) {
  if (!targetAcademicYear) return [];
  const missing = [];
  for (const schoolClass of targetClasses) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await resolveFeePlanForBilling({
      schoolId: idOf(schoolClass.schoolId),
      classId: idOf(schoolClass),
      courseId: idOf(schoolClass.legacyCourseId),
      academicYearId: idOf(targetAcademicYear)
    }).catch(() => null);
    if (!plan) missing.push(schoolClass);
  }
  return missing;
}

// Runs inside the promotion transaction, right after the source membership is
// closed. Returns what it did so the transaction can record it.
async function settleSourceMembershipBilling({ membership, sourceEndAt, actorId = null, dbSession = null } = {}) {
  const result = { voidedBills: 0, voidedOrders: 0, refundCases: 0, reviewRequired: [] };
  const windowStart = postEndWindowStart(sourceEndAt);
  if (!membership?._id || !windowStart) return result;

  const filter = { studentMembershipId: membership._id, status: { $ne: 'void' }, dueDate: { $gte: windowStart } };
  const withSession = (query) => (dbSession ? query.session(dbSession) : query);
  const [bills, orders] = await Promise.all([
    withSession(FinanceBill.find(filter).select('_id billNumber status amountDue amountPaid dueDate currency student studentId schoolId classId academicYearId periodLabel issuanceKey paymentBreakdown lineItems.paidAmount').lean()),
    withSession(FeeOrder.find(filter).select('_id orderNumber sourceBillId status amountDue amountPaid dueDate currency student studentId schoolId classId academicYearId periodLabel issuanceKey paymentBreakdown lineItems.paidAmount').lean())
  ]);
  // The second-chance exam fee (and its mirror) is never settled here.
  const keptBills = bills.filter((bill) => !isSecondChanceFeeDocument(bill));
  const keptOrders = orders.filter((order) => !isSecondChanceFeeDocument(order));
  if (!keptBills.length && !keptOrders.length) return result;

  const schoolId = idOf(membership.schoolId);
  const academicYearId = idOf(membership.academicYearId || membership.academicYear);
  const lockByMonth = new Map();
  const monthLocked = async (dueDate) => {
    // Without a school the month lock can't be read - leave it to a person.
    if (!schoolId) return true;
    const key = new Date(dueDate).toISOString().slice(0, 7);
    if (!lockByMonth.has(key)) {
      lockByMonth.set(key, await isFinanceMonthClosed(dueDate, { schoolId, academicYearId, session: dbSession }).catch(() => true));
    }
    return lockByMonth.get(key);
  };

  const billIds = new Set(bills.map((bill) => idOf(bill)));
  // A fee order that mirrors one of these bills is settled together with it.
  const documents = [
    ...keptBills.map((doc) => ({ doc, key: 'bill', number: text(doc.billNumber) })),
    ...keptOrders.filter((doc) => !billIds.has(idOf(doc.sourceBillId))).map((doc) => ({ doc, key: 'feeOrder', number: text(doc.orderNumber) }))
  ];
  const voidBillIds = [];
  const voidOrderIds = [];
  for (const { doc, key, number } of documents) {
    if (hasPaymentEvidence(doc)) {
      // eslint-disable-next-line no-await-in-loop
      const refund = await createFinanceRefundCase({
        student: doc.student || membership.student,
        studentId: doc.studentId || membership.studentId || null,
        studentMembershipId: membership._id,
        [key]: doc._id,
        schoolId: doc.schoolId || membership.schoolId || null,
        classId: doc.classId || membership.classId || null,
        academicYearId: doc.academicYearId || academicYearId || null,
        currency: doc.currency || 'AFN',
        amount: doc.amountPaid,
        reason: 'membership_ended',
        reasonNote: PROMOTION_REFUND_NOTE,
        detectionSource: 'auto_lifecycle',
        createdBy: actorId,
        session: dbSession
      });
      if (refund) result.refundCases += 1;
      continue;
    }
    if (!OPEN_UNPAID_STATUSES.includes(text(doc.status))) {
      result.reviewRequired.push({ documentId: idOf(doc), documentType: key, number, reason: 'status_needs_review' });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    if (await monthLocked(doc.dueDate)) {
      result.reviewRequired.push({ documentId: idOf(doc), documentType: key, number, reason: 'month_closed' });
      continue;
    }
    if (key === 'bill') voidBillIds.push(doc._id);
    else voidOrderIds.push(doc._id);
  }

  const voidFields = { status: 'void', voidReason: PROMOTION_VOID_REASON, voidedBy: actorId || null, voidedAt: new Date() };
  const options = dbSession ? { session: dbSession } : {};
  const unpaidGuard = { status: { $in: OPEN_UNPAID_STATUSES }, amountPaid: { $lte: 0 } };
  if (voidBillIds.length) {
    const [billUpdate, mirrorUpdate] = await Promise.all([
      FinanceBill.updateMany({ _id: { $in: voidBillIds }, ...unpaidGuard }, { $set: voidFields }, options),
      FeeOrder.updateMany({ sourceBillId: { $in: voidBillIds }, ...unpaidGuard }, { $set: voidFields }, options)
    ]);
    result.voidedBills = Number(billUpdate?.modifiedCount || 0);
    result.voidedOrders += Number(mirrorUpdate?.modifiedCount || 0);
  }
  if (voidOrderIds.length) {
    const orderUpdate = await FeeOrder.updateMany({ _id: { $in: voidOrderIds }, ...unpaidGuard }, { $set: voidFields }, options);
    result.voidedOrders += Number(orderUpdate?.modifiedCount || 0);
  }
  return result;
}

// Which reliefs to carry for one student: an explicit list for that
// membership wins; otherwise `carryAllReliefs` takes every active one.
function selectReliefsToCarry({ payload = {}, membershipId = '', available = [] } = {}) {
  const entries = Array.isArray(payload.reliefCarryOver) ? payload.reliefCarryOver : [];
  const explicit = entries.find((entry) => idOf(entry?.membershipId || entry?.studentMembershipId) === idOf(membershipId));
  if (explicit) {
    const wanted = new Set((Array.isArray(explicit.reliefs) ? explicit.reliefs : [])
      .map((relief) => `${text(relief?.sourceModel)}:${idOf(relief?.id)}`));
    return available.filter((relief) => wanted.has(`${relief.sourceModel}:${relief.id}`));
  }
  return payload.carryAllReliefs === true ? available : [];
}

// After the promotion has committed: re-register each chosen relief on the new
// membership through the normal finance registry, so it gets the new year's
// window, open-bill sync and its FinanceRelief mirror. Failures are recorded,
// never thrown - the promotion already stands.
async function carryReliefsToMembership({ sourceMembershipId, targetMembershipId, reliefs = [], actorId = null } = {}) {
  // eslint-disable-next-line global-require
  const { createDiscount, createFeeExemption } = require('./studentFinanceService');
  const results = [];
  for (const relief of reliefs) {
    const entry = { sourceModel: relief.sourceModel, sourceId: relief.id, newId: '', status: 'carried', error: '' };
    try {
      if (relief.sourceModel === 'discount') {
        // eslint-disable-next-line no-await-in-loop
        const source = await Discount.findOne({ _id: relief.id, studentMembershipId: sourceMembershipId, status: 'active' }).lean();
        if (!source) throw new Error('relief_not_active');
        // eslint-disable-next-line no-await-in-loop
        const created = await createDiscount({
          studentMembershipId: targetMembershipId,
          discountType: source.discountType,
          coverageMode: source.coverageMode,
          amount: source.amount,
          percentage: source.percentage,
          reason: text(source.reason) || 'ادامهٔ تخفیف سال قبل',
          durationMode: 'academic_year',
          targetScope: 'student',
          createdBy: actorId
        });
        entry.newId = idOf(created?.id || created?.item?.id);
      } else {
        // eslint-disable-next-line no-await-in-loop
        const source = await FeeExemption.findOne({ _id: relief.id, studentMembershipId: sourceMembershipId, status: 'active' }).lean();
        if (!source) throw new Error('relief_not_active');
        // eslint-disable-next-line no-await-in-loop
        const created = await createFeeExemption({
          studentMembershipId: targetMembershipId,
          exemptionType: source.exemptionType,
          scope: source.scope,
          amount: source.amount,
          percentage: source.percentage,
          reason: text(source.reason) || 'ادامهٔ معافیت سال قبل',
          note: text(source.note),
          approvedBy: actorId,
          createdBy: actorId
        });
        entry.newId = idOf(created?.id);
      }
    } catch (error) {
      entry.status = 'failed';
      entry.error = String(error?.message || 'carry_failed');
    }
    results.push(entry);
  }
  return results;
}

// A rolled-back promotion takes its carried reliefs with it.
async function cancelCarriedReliefs(carried = [], { actorId = null } = {}) {
  // eslint-disable-next-line global-require
  const { cancelDiscount, cancelFeeExemption } = require('./studentFinanceService');
  const reason = 'بازگردانی ارتقای صنف';
  const results = [];
  for (const entry of carried) {
    if (entry?.status !== 'carried' || !entry.newId) {
      results.push(entry);
      continue;
    }
    try {
      if (entry.sourceModel === 'discount') {
        // eslint-disable-next-line no-await-in-loop
        await cancelDiscount(entry.newId, { reason });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await cancelFeeExemption(entry.newId, { cancelReason: reason, cancelledBy: actorId });
      }
      results.push({ ...entry, status: 'cancelled_by_rollback' });
    } catch (error) {
      results.push({ ...entry, status: 'cancel_failed', error: String(error?.message || 'cancel_failed') });
    }
  }
  return results;
}

module.exports = {
  PROMOTION_REFUND_NOTE,
  PROMOTION_VOID_REASON,
  buildPromotionFinancePreview,
  cancelCarriedReliefs,
  carryReliefsToMembership,
  findTargetClassesWithoutFeePlan,
  postEndWindowStart,
  selectReliefsToCarry,
  settleSourceMembershipBilling
};
