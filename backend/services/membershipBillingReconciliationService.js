const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const { solarMonthKey } = require('../utils/studentBillingPeriodIntegrity');

const idOf = (value = '') => String(value?._id || value || '').trim();
const positive = (value) => Math.max(0, Number(value) || 0);

const hasPaymentEvidence = (record = {}) => (
  positive(record.amountPaid) > 0
  || ['paid', 'partial'].includes(String(record.status || '').trim())
  || Object.values(record.paymentBreakdown || {}).some((amount) => positive(amount) > 0)
  || (Array.isArray(record.lineItems)
    && record.lineItems.some((item) => positive(item?.paidAmount) > 0))
);

const classifyClosedMembershipBill = ({
  record = {},
  effectiveAt = new Date(),
  voidEffectivePeriod = false
} = {}) => {
  if (String(record.status || '').trim() === 'void') return 'already_void';
  if (hasPaymentEvidence(record)) return 'payment_protected';
  if (!['new', 'overdue'].includes(String(record.status || '').trim())) return 'manual_review';

  const effectiveMonth = solarMonthKey(effectiveAt);
  const dueMonth = solarMonthKey(record.dueDate);
  if (!effectiveMonth || !dueMonth) return 'manual_review';
  if (dueMonth > effectiveMonth) return 'void_future';
  if (dueMonth === effectiveMonth) return voidEffectivePeriod ? 'void_effective_period' : 'review_effective_period';
  return 'retain_previous_debt';
};

const summarizeRecords = ({ records = [], effectiveAt, voidEffectivePeriod }) => {
  const groups = {
    voidIds: [],
    paymentProtected: [],
    reviewEffectivePeriod: [],
    manualReview: [],
    retainedPreviousDebt: [],
    alreadyVoid: []
  };

  records.forEach((record) => {
    const recordId = idOf(record);
    const classification = classifyClosedMembershipBill({ record, effectiveAt, voidEffectivePeriod });
    if (classification === 'void_future' || classification === 'void_effective_period') groups.voidIds.push(recordId);
    else if (classification === 'payment_protected') groups.paymentProtected.push(recordId);
    else if (classification === 'review_effective_period') groups.reviewEffectivePeriod.push(recordId);
    else if (classification === 'retain_previous_debt') groups.retainedPreviousDebt.push(recordId);
    else if (classification === 'already_void') groups.alreadyVoid.push(recordId);
    else groups.manualReview.push(recordId);
  });

  return groups;
};

async function reconcileClosedMembershipBilling({
  membershipIds = [],
  effectiveAt = new Date(),
  actorId = null,
  voidEffectivePeriod = false,
  reason = 'تغییر صنف شاگرد'
} = {}) {
  const ids = [...new Set((Array.isArray(membershipIds) ? membershipIds : [membershipIds]).map(idOf).filter(Boolean))];
  if (!ids.length) {
    return { bills: {}, orders: {}, voidedBills: 0, voidedOrders: 0, reviewRequired: 0 };
  }

  const openFilter = {
    studentMembershipId: { $in: ids },
    status: { $ne: 'void' }
  };
  const [bills, orders] = await Promise.all([
    FinanceBill.find(openFilter)
      .select('_id status dueDate amountPaid paymentBreakdown lineItems.paidAmount')
      .lean(),
    FeeOrder.find(openFilter)
      .select('_id status dueDate amountPaid paymentBreakdown lineItems.paidAmount')
      .lean()
  ]);
  const billGroups = summarizeRecords({ records: bills, effectiveAt, voidEffectivePeriod });
  const orderGroups = summarizeRecords({ records: orders, effectiveAt, voidEffectivePeriod });
  const voidFields = {
    status: 'void',
    voidReason: `${reason}؛ بل پرداخت‌نشده مربوط به دوره بعد از ختم عضویت است.`,
    voidedBy: actorId || null,
    voidedAt: new Date()
  };

  const [billUpdate, orderUpdate] = await Promise.all([
    billGroups.voidIds.length
      ? FinanceBill.updateMany({ _id: { $in: billGroups.voidIds }, status: { $in: ['new', 'overdue'] }, amountPaid: { $lte: 0 } }, { $set: voidFields })
      : null,
    orderGroups.voidIds.length
      ? FeeOrder.updateMany({ _id: { $in: orderGroups.voidIds }, status: { $in: ['new', 'overdue'] }, amountPaid: { $lte: 0 } }, { $set: voidFields })
      : null
  ]);

  return {
    bills: billGroups,
    orders: orderGroups,
    voidedBills: Number(billUpdate?.modifiedCount || 0),
    voidedOrders: Number(orderUpdate?.modifiedCount || 0),
    reviewRequired: billGroups.reviewEffectivePeriod.length
      + billGroups.manualReview.length
      + orderGroups.reviewEffectivePeriod.length
      + orderGroups.manualReview.length
  };
}

module.exports = {
  classifyClosedMembershipBill,
  hasPaymentEvidence,
  reconcileClosedMembershipBilling,
  summarizeRecords
};
