const FinanceBill = require('../models/FinanceBill');
const FinanceReceipt = require('../models/FinanceReceipt');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const {
  LINE_ITEM_TYPES,
  normalizeFinanceFeeType,
  normalizePaymentBreakdown,
  roundMoney
} = require('../utils/financeLineItems');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeId(value) {
  if (!value) return '';
  return String(value?._id || value);
}

function getOrderFeeTypes(order = {}) {
  const lineItemTypes = (Array.isArray(order?.lineItems) ? order.lineItems : [])
    .filter((item) => Number(item?.grossAmount ?? item?.netAmount ?? item?.balanceAmount ?? 0) > 0)
    .map((item) => normalizeFinanceFeeType(item?.feeType, order?.orderType || 'tuition'));
  const breakdownTypes = Object.entries(
    order?.feeBreakdown && typeof order.feeBreakdown === 'object' ? order.feeBreakdown : {}
  )
    .filter(([, amount]) => Number(amount || 0) > 0)
    .map(([key]) => normalizeFinanceFeeType(key, order?.orderType || 'tuition'));
  const scopeTypes = (Array.isArray(order?.feeScopes) ? order.feeScopes : [])
    .map((item) => normalizeFinanceFeeType(item, order?.orderType || 'tuition'));
  const orderType = normalizeText(order?.orderType)
    ? [normalizeFinanceFeeType(order.orderType, 'tuition')]
    : [];
  return Array.from(new Set([
    ...lineItemTypes,
    ...breakdownTypes,
    ...scopeTypes,
    ...orderType
  ].filter((item) => LINE_ITEM_TYPES.includes(item))));
}

function inferAllocationFeeType({ allocation = {}, order = {}, payment = {} } = {}) {
  const orderFeeTypes = getOrderFeeTypes(order);
  const explicit = normalizeText(allocation?.feeType).toLowerCase();
  if (explicit && orderFeeTypes.includes(explicit)) {
    return { feeType: explicit, reason: 'already_typed', confidence: 'exact' };
  }

  const receiptFeeType = normalizeText(payment?.sourceReceiptId?.feeType).toLowerCase();
  if (receiptFeeType && orderFeeTypes.includes(receiptFeeType)) {
    return { feeType: receiptFeeType, reason: 'receipt_scope', confidence: 'exact' };
  }

  const evidence = [
    payment?.note,
    allocation?.title,
    allocation?.orderNumber,
    order?.title,
    order?.periodLabel,
    order?.note,
    order?.issuanceKey
  ].map((item) => normalizeText(item).toLowerCase()).join(' ');
  if ((evidence.includes('داخله') || evidence.includes('admission')) && orderFeeTypes.includes('admission')) {
    return { feeType: 'admission', reason: 'admission_evidence', confidence: 'high' };
  }
  if (normalizeText(order?.orderType) === 'admission' && orderFeeTypes.includes('admission')) {
    return { feeType: 'admission', reason: 'admission_order', confidence: 'exact' };
  }
  if (orderFeeTypes.length === 1) {
    return { feeType: orderFeeTypes[0], reason: 'single_scope_order', confidence: 'exact' };
  }
  return { feeType: '', reason: 'ambiguous_mixed_order', confidence: 'blocked' };
}

function formatStudentName(payment = {}) {
  return normalizeText(payment?.studentId?.fullName)
    || normalizeText(payment?.student?.name)
    || 'متعلم';
}

async function inspectPaymentScopeRepairs({ classId = '', academicYearId = '', paymentIds = [] } = {}) {
  const orderQuery = {
    classId,
    status: { $ne: 'void' }
  };
  if (academicYearId) orderQuery.academicYearId = academicYearId;
  const orders = await FeeOrder.find(orderQuery).lean();
  const orderMap = new Map(orders.map((item) => [String(item._id), item]));
  const orderIds = [...orderMap.keys()];
  if (!orderIds.length) {
    return {
      items: [],
      summary: { payments: 0, repairable: 0, blocked: 0, alreadyTyped: 0, affectedOrders: 0, amount: 0 }
    };
  }

  const paymentQuery = {
    status: { $in: ['pending', 'approved'] },
    $or: [
      { feeOrderId: { $in: orderIds } },
      { 'allocations.feeOrderId': { $in: orderIds } }
    ]
  };
  if (Array.isArray(paymentIds) && paymentIds.length) paymentQuery._id = { $in: paymentIds };
  const payments = await FeePayment.find(paymentQuery)
    .populate('studentId', 'fullName admissionNo')
    .populate('student', 'name email')
    .populate('sourceReceiptId', 'feeType note')
    .lean();

  const items = payments.map((payment) => {
    const allocations = Array.isArray(payment.allocations) && payment.allocations.length
      ? payment.allocations
      : payment.feeOrderId
        ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount }]
        : [];
    const rows = allocations
      .map((allocation, index) => ({ allocation, index }))
      .filter(({ allocation }) => orderMap.has(normalizeId(allocation?.feeOrderId)))
      .map(({ allocation, index }) => {
        const order = orderMap.get(normalizeId(allocation?.feeOrderId));
        const inference = inferAllocationFeeType({ allocation, order, payment });
        const currentFeeType = normalizeText(allocation?.feeType).toLowerCase();
        const hasValidCurrentFeeType = getOrderFeeTypes(order).includes(currentFeeType);
        return {
          index,
          feeOrderId: normalizeId(order?._id),
          orderNumber: normalizeText(order?.orderNumber),
          orderTypes: getOrderFeeTypes(order),
          currentFeeType: hasValidCurrentFeeType ? currentFeeType : '',
          originalFeeType: currentFeeType,
          proposedFeeType: inference.feeType,
          reason: inference.reason,
          confidence: inference.confidence,
          amount: roundMoney(allocation?.amount)
        };
      });
    const missingRows = rows.filter((row) => !row.currentFeeType);
    const blockedRows = missingRows.filter((row) => !row.proposedFeeType);
    const repairable = missingRows.length > 0 && blockedRows.length === 0;
    return {
      paymentId: normalizeId(payment?._id),
      paymentNumber: normalizeText(payment?.paymentNumber),
      studentName: formatStudentName(payment),
      admissionNo: normalizeText(payment?.studentId?.admissionNo),
      status: normalizeText(payment?.status),
      amount: roundMoney(payment?.amount),
      paidAt: payment?.paidAt || null,
      repairable,
      blocked: blockedRows.length > 0,
      alreadyTyped: rows.length > 0 && missingRows.length === 0,
      allocations: rows
    };
  }).filter((item) => item.allocations.length);

  return {
    items,
    summary: {
      payments: items.length,
      repairable: items.filter((item) => item.repairable).length,
      blocked: items.filter((item) => item.blocked).length,
      alreadyTyped: items.filter((item) => item.alreadyTyped).length,
      affectedOrders: new Set(items.flatMap((item) => item.allocations.map((row) => row.feeOrderId))).size,
      amount: roundMoney(items.filter((item) => item.repairable).reduce((sum, item) => sum + item.amount, 0))
    }
  };
}

async function rebuildOrderPaymentBreakdown(orderId = '') {
  const order = await FeeOrder.findById(orderId);
  if (!order) return { updated: false, reason: 'order_not_found' };
  const payments = await FeePayment.find({
    status: 'approved',
    $or: [{ feeOrderId: order._id }, { 'allocations.feeOrderId': order._id }]
  }).lean();
  const breakdown = normalizePaymentBreakdown({});
  let hasUntypedApprovedAllocation = false;
  payments.forEach((payment) => {
    const allocations = Array.isArray(payment.allocations) && payment.allocations.length
      ? payment.allocations
      : payment.feeOrderId
        ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount }]
        : [];
    allocations
      .filter((item) => normalizeId(item?.feeOrderId) === String(order._id))
      .forEach((item) => {
        if (!normalizeText(item?.feeType)) {
          hasUntypedApprovedAllocation = true;
          return;
        }
        const feeType = normalizeFinanceFeeType(item.feeType, order.orderType || 'tuition');
        breakdown[feeType] = roundMoney(breakdown[feeType] + Number(item.amount || 0));
      });
  });

  if (hasUntypedApprovedAllocation) {
    return { updated: false, reason: 'untyped_approved_allocations' };
  }

  const scopedTotal = roundMoney(Object.values(breakdown).reduce((sum, amount) => sum + Number(amount || 0), 0));
  if (Math.abs(scopedTotal - roundMoney(order.amountPaid)) > 0.009) {
    return { updated: false, reason: 'breakdown_does_not_match_order_paid', scopedTotal, amountPaid: roundMoney(order.amountPaid) };
  }

  let sourceBill = null;
  if (order.sourceBillId) {
    sourceBill = await FinanceBill.findById(order.sourceBillId);
    if (sourceBill && Math.abs(scopedTotal - roundMoney(sourceBill.amountPaid)) > 0.009) {
      return {
        updated: false,
        reason: 'source_bill_paid_mismatch',
        scopedTotal,
        billAmountPaid: roundMoney(sourceBill.amountPaid)
      };
    }
  }

  if (sourceBill) {
    sourceBill.paymentBreakdown = breakdown;
    await sourceBill.save();
  }
  order.paymentBreakdown = breakdown;
  await order.save();
  return { updated: true, orderId: String(order._id), paymentBreakdown: breakdown };
}

async function applyPaymentScopeRepairs({ classId = '', academicYearId = '', paymentIds = [] } = {}) {
  const preview = await inspectPaymentScopeRepairs({ classId, academicYearId, paymentIds });
  const eligible = preview.items.filter((item) => item.repairable);
  const repaired = [];
  const failures = [];
  const affectedOrderIds = new Set();

  for (const candidate of eligible) {
    try {
      const payment = await FeePayment.findById(candidate.paymentId);
      if (!payment || !['pending', 'approved'].includes(normalizeText(payment.status))) {
        throw new Error('payment_state_changed');
      }
      const proposals = new Map(candidate.allocations.map((item) => [item.index, item]));
      const currentAllocations = Array.isArray(payment.allocations) && payment.allocations.length
        ? payment.allocations
        : payment.feeOrderId
          ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount, title: '', orderNumber: '' }]
          : [];
      payment.allocations = currentAllocations.map((allocation, index) => {
        const proposal = proposals.get(index);
        if (!proposal || proposal.currentFeeType) return allocation;
        affectedOrderIds.add(proposal.feeOrderId);
        return {
          feeOrderId: allocation.feeOrderId,
          feeType: proposal.proposedFeeType,
          amount: allocation.amount,
          title: allocation.title,
          orderNumber: allocation.orderNumber
        };
      });
      if (payment.sourceReceiptId && payment.allocations.length === 1) {
        await FinanceReceipt.updateOne(
          { _id: payment.sourceReceiptId },
          { $set: { feeType: payment.allocations[0].feeType } }
        );
      }
      await payment.save();
      repaired.push({ paymentId: candidate.paymentId, paymentNumber: candidate.paymentNumber });
    } catch (error) {
      failures.push({
        paymentId: candidate.paymentId,
        paymentNumber: candidate.paymentNumber,
        message: normalizeText(error?.message) || 'repair_failed'
      });
    }
  }

  const rebuiltOrders = [];
  for (const orderId of affectedOrderIds) {
    try {
      rebuiltOrders.push(await rebuildOrderPaymentBreakdown(orderId));
    } catch (error) {
      rebuiltOrders.push({ updated: false, orderId, reason: normalizeText(error?.message) || 'rebuild_failed' });
    }
  }

  return {
    preview,
    repaired,
    failures,
    rebuiltOrders,
    summary: {
      requested: paymentIds.length,
      eligible: eligible.length,
      repaired: repaired.length,
      failed: failures.length,
      ordersRebuilt: rebuiltOrders.filter((item) => item.updated).length,
      ordersBlocked: rebuiltOrders.filter((item) => !item.updated).length
    }
  };
}

module.exports = {
  inferAllocationFeeType,
  inspectPaymentScopeRepairs,
  applyPaymentScopeRepairs
};
