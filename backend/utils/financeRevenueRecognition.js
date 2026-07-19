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
      amount: roundMoney(item?.amount)
    }))
    .filter((item) => item.feeOrderId && item.amount > 0);
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
    return { recognizedAmount: paymentAmount, excludedVoidAmount: 0 };
  }

  let excludedVoidAmount = 0;
  allocations.forEach((allocation) => {
    if (statusByOrderId.get(allocation.feeOrderId) === 'void') {
      excludedVoidAmount += allocation.amount;
    }
  });

  excludedVoidAmount = Math.min(paymentAmount, roundMoney(excludedVoidAmount));
  const recognizedAmount = roundMoney(paymentAmount - excludedVoidAmount);

  return {
    recognizedAmount,
    excludedVoidAmount
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
