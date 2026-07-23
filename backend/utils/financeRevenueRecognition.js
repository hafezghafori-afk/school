const FeeOrder = require('../models/FeeOrder');

function normalizeId(value = null) {
  return String(value?._id || value || '').trim();
}

function roundMoney(value = 0) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function getPaymentAllocations(payment = {}) {
  const allocations = Array.isArray(payment?.allocations) && payment.allocations.length
    ? payment.allocations
    : payment?.feeOrderId
      ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount }]
      : [];

  return allocations
    .map((item) => ({
      feeOrderId: normalizeId(item?.feeOrderId),
      feeType: String(item?.feeType || '').trim().toLowerCase() || '',
      amount: roundMoney(item?.amount)
    }))
    .filter((item) => item.amount > 0);
}

async function buildFeeOrderStatusMap(payments = [], { FeeOrderModel = FeeOrder } = {}) {
  const statusByOrderId = new Map();
  const unresolvedIds = new Set();

  for (const payment of payments || []) {
    const candidates = [
      payment?.feeOrderId,
      ...(Array.isArray(payment?.allocations) ? payment.allocations.map((item) => item?.feeOrderId) : [])
    ];
    for (const candidate of candidates) {
      const orderId = normalizeId(candidate);
      if (!orderId) continue;
      const populatedStatus = typeof candidate === 'object' ? String(candidate?.status || '').trim() : '';
      if (populatedStatus) statusByOrderId.set(orderId, populatedStatus);
      else if (!statusByOrderId.has(orderId)) unresolvedIds.add(orderId);
    }
  }

  if (unresolvedIds.size) {
    const orders = await FeeOrderModel.find({ _id: { $in: [...unresolvedIds] } }).select('_id status').lean();
    orders.forEach((order) => statusByOrderId.set(normalizeId(order), String(order?.status || '').trim()));
  }

  return statusByOrderId;
}

function getRecognizedPaymentBreakdown(payment = {}, statusByOrderId = new Map()) {
  const paymentAmount = roundMoney(payment?.amount);
  const allocations = getPaymentAllocations(payment);
  if (!allocations.length) {
    return {
      recognizedAmount: 0,
      excludedVoidAmount: 0,
      excludedMissingOrderAmount: paymentAmount,
      recognizedAllocations: [],
      invalidAllocations: paymentAmount > 0
        ? [{ feeOrderId: '', feeType: '', amount: paymentAmount, reason: 'missing_fee_order' }]
        : [],
      recognitionWarnings: paymentAmount > 0 ? ['missing_fee_order'] : []
    };
  }

  let excludedVoidAmount = 0;
  let excludedMissingOrderAmount = 0;
  const recognizedAllocations = [];
  const invalidAllocations = [];
  allocations.forEach((allocation) => {
    const orderStatus = allocation.feeOrderId
      ? statusByOrderId.get(allocation.feeOrderId)
      : '';
    if (!orderStatus) {
      excludedMissingOrderAmount += allocation.amount;
      invalidAllocations.push({ ...allocation, reason: 'missing_fee_order' });
    } else if (orderStatus === 'void') {
      excludedVoidAmount += allocation.amount;
    } else {
      recognizedAllocations.push(allocation);
    }
  });

  const allocatedAmount = roundMoney(allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  if (allocatedAmount < paymentAmount) {
    const unlinkedAmount = roundMoney(paymentAmount - allocatedAmount);
    excludedMissingOrderAmount += unlinkedAmount;
    invalidAllocations.push({ feeOrderId: '', feeType: '', amount: unlinkedAmount, reason: 'unallocated_payment_amount' });
  }

  excludedVoidAmount = Math.min(paymentAmount, roundMoney(excludedVoidAmount));
  excludedMissingOrderAmount = Math.min(
    roundMoney(paymentAmount - excludedVoidAmount),
    roundMoney(excludedMissingOrderAmount)
  );
  const recognizedAllocationAmount = roundMoney(
    recognizedAllocations.reduce((sum, allocation) => sum + allocation.amount, 0)
  );
  const recognizedAmount = Math.min(
    roundMoney(paymentAmount - excludedVoidAmount - excludedMissingOrderAmount),
    recognizedAllocationAmount
  );

  return {
    recognizedAmount,
    excludedVoidAmount,
    excludedMissingOrderAmount,
    recognizedAllocations,
    invalidAllocations,
    recognitionWarnings: invalidAllocations.length ? ['missing_fee_order'] : []
  };
}

async function recognizePayments(payments = [], options = {}) {
  const rows = Array.isArray(payments) ? payments : [];
  const statusByOrderId = await buildFeeOrderStatusMap(rows, options);
  return rows.map((payment) => ({
    payment,
    ...getRecognizedPaymentBreakdown(payment, statusByOrderId)
  }));
}

async function sumRecognizedPayments(payments = [], options = {}) {
  const rows = await recognizePayments(payments, options);
  return roundMoney(rows.reduce((sum, row) => sum + row.recognizedAmount, 0));
}

module.exports = {
  buildFeeOrderStatusMap,
  getPaymentAllocations,
  getRecognizedPaymentBreakdown,
  recognizePayments,
  sumRecognizedPayments
};
