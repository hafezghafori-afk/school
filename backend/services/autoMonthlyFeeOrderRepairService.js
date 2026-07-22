const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const ActivityLog = require('../models/ActivityLog');

const AUTO_ISSUANCE_PREFIX = 'auto-monthly-tuition:';
const AUTO_ORDER_PREFIX = 'AUTO-FEE-';
const AUTO_NOTE_MARKER = 'auto:monthly-arrears-backfill';
const VOID_REASON = 'ابطال بل خودکار ایجادشده هنگام مشاهده حساب؛ صدور رسمی فقط با اقدام مدیر مالی مجاز است.';

const idOf = (value) => String(value?._id || value || '').trim();
const positive = (value) => Math.max(0, Number(value) || 0);

function isAutoMonthlyFeeOrder(order = {}) {
  return String(order.issuanceKey || '').startsWith(AUTO_ISSUANCE_PREFIX)
    && String(order.orderNumber || '').startsWith(AUTO_ORDER_PREFIX)
    && String(order.source || '') === 'system'
    && String(order.note || '').includes(AUTO_NOTE_MARKER);
}

function hasStoredPaymentEvidence(order = {}) {
  if (positive(order.amountPaid) > 0) return true;
  if (['paid', 'partial'].includes(String(order.status || '').trim())) return true;
  if (Object.values(order.paymentBreakdown || {}).some((value) => positive(value) > 0)) return true;
  return (Array.isArray(order.lineItems) ? order.lineItems : [])
    .some((item) => positive(item?.paidAmount) > 0);
}

function classifyAutoMonthlyFeeOrder({ order = {}, hasLinkedPayment = false } = {}) {
  if (!isAutoMonthlyFeeOrder(order)) return 'out_of_scope';
  if (String(order.status || '') === 'void') return 'already_void';
  if (order.sourceBillId) return 'official_source_linked';
  if (hasLinkedPayment || hasStoredPaymentEvidence(order)) return 'payment_linked';
  return 'voidable_auto_order';
}

function buildCandidateFilter({ schoolId = '' } = {}) {
  return {
    ...(schoolId ? { schoolId } : {}),
    issuanceKey: /^auto-monthly-tuition:/,
    orderNumber: /^AUTO-FEE-/,
    source: 'system',
    note: /auto:monthly-arrears-backfill/
  };
}

function linkedOrderIdsFromPayments(payments = []) {
  const ids = new Set();
  for (const payment of Array.isArray(payments) ? payments : []) {
    const directId = idOf(payment?.feeOrderId);
    if (directId) ids.add(directId);
    for (const allocation of Array.isArray(payment?.allocations) ? payment.allocations : []) {
      const allocationId = idOf(allocation?.feeOrderId);
      if (allocationId) ids.add(allocationId);
    }
  }
  return ids;
}

async function auditAndVoidAutoMonthlyFeeOrders({
  apply = false,
  schoolId = '',
  actorId = '',
  limit = 50000
} = {}) {
  const safeLimit = Math.max(1, Math.min(50000, Number(limit) || 50000));
  const orders = await FeeOrder.find(buildCandidateFilter({ schoolId }))
    .sort({ createdAt: 1, _id: 1 })
    .limit(safeLimit);
  const orderIds = orders.map((item) => item._id).filter(Boolean);
  const payments = orderIds.length
    ? await FeePayment.find({
        $or: [
          { feeOrderId: { $in: orderIds } },
          { 'allocations.feeOrderId': { $in: orderIds } }
        ]
      }).select('feeOrderId allocations.feeOrderId status').lean()
    : [];
  const linkedOrderIds = linkedOrderIdsFromPayments(payments);
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    schoolId: String(schoolId || ''),
    scanned: orders.length,
    voidable: 0,
    voided: 0,
    alreadyVoid: 0,
    protectedOfficial: 0,
    protectedPayment: 0,
    skippedConcurrentPayment: 0,
    samples: {
      voidable: [],
      protectedPayment: []
    }
  };

  for (const order of orders) {
    const orderId = idOf(order);
    const classification = classifyAutoMonthlyFeeOrder({
      order,
      hasLinkedPayment: linkedOrderIds.has(orderId)
    });
    if (classification === 'already_void') {
      summary.alreadyVoid += 1;
      continue;
    }
    if (classification === 'official_source_linked') {
      summary.protectedOfficial += 1;
      continue;
    }
    if (classification === 'payment_linked') {
      summary.protectedPayment += 1;
      if (summary.samples.protectedPayment.length < 20) summary.samples.protectedPayment.push(orderId);
      continue;
    }
    if (classification !== 'voidable_auto_order') continue;

    summary.voidable += 1;
    if (summary.samples.voidable.length < 20) summary.samples.voidable.push(orderId);
    if (!apply) continue;

    const concurrentPayment = await FeePayment.exists({
      $or: [{ feeOrderId: order._id }, { 'allocations.feeOrderId': order._id }]
    });
    const current = await FeeOrder.findById(order._id);
    if (!current || concurrentPayment || hasStoredPaymentEvidence(current) || current.sourceBillId) {
      summary.skippedConcurrentPayment += 1;
      continue;
    }
    if (String(current.status || '') === 'void') {
      summary.alreadyVoid += 1;
      continue;
    }

    current.status = 'void';
    current.voidReason = VOID_REASON;
    current.voidedAt = new Date();
    current.voidedBy = actorId || null;
    await current.save();
    await ActivityLog.create({
      actor: actorId || null,
      actorRole: 'admin',
      action: 'repair_void_auto_monthly_fee_order',
      targetUser: current.student || null,
      targetType: 'FeeOrder',
      targetId: orderId,
      reason: 'invalid_auto_monthly_backfill',
      meta: {
        schoolId: idOf(current.schoolId),
        studentMembershipId: idOf(current.studentMembershipId),
        orderNumber: String(current.orderNumber || ''),
        issuanceKey: String(current.issuanceKey || ''),
        repairSource: 'repairAutoMonthlyFeeOrders'
      }
    }).catch(() => null);
    summary.voided += 1;
  }

  return summary;
}

module.exports = {
  AUTO_ISSUANCE_PREFIX,
  AUTO_NOTE_MARKER,
  AUTO_ORDER_PREFIX,
  VOID_REASON,
  auditAndVoidAutoMonthlyFeeOrders,
  buildCandidateFilter,
  classifyAutoMonthlyFeeOrder,
  hasStoredPaymentEvidence,
  isAutoMonthlyFeeOrder,
  linkedOrderIdsFromPayments
};
