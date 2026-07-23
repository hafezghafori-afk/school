function normalizeReferenceId(value = null) {
  return String(value?._id || value || '').trim();
}

function roundMoney(value = 0) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function getPaymentAllocationRows(payment = {}) {
  const allocations = Array.isArray(payment?.allocations) && payment.allocations.length
    ? payment.allocations
    : payment?.feeOrderId
      ? [{ feeOrderId: payment.feeOrderId, amount: payment.amount }]
      : [];

  return allocations
    .map((item) => ({
      feeOrderId: normalizeReferenceId(item?.feeOrderId),
      amount: roundMoney(item?.amount),
      feeType: String(item?.feeType || '').trim().toLowerCase()
    }))
    .filter((item) => item.feeOrderId && item.amount > 0);
}

function getPaymentOrderIds(payment = {}) {
  return Array.from(new Set(getPaymentAllocationRows(payment)
    .map((item) => item.feeOrderId)
    .filter(Boolean)));
}

function buildPaymentClassScope(payment = {}, orderById = new Map()) {
  const allocations = getPaymentAllocationRows(payment).map((allocation) => {
    const order = orderById.get(allocation.feeOrderId) || null;
    return {
      ...allocation,
      order,
      classId: normalizeReferenceId(order?.classId),
      academicYearId: normalizeReferenceId(order?.academicYearId),
      schoolId: normalizeReferenceId(order?.schoolId)
    };
  });
  const missingOrderIds = allocations
    .filter((item) => !item.order)
    .map((item) => item.feeOrderId);
  const unassignedOrderIds = allocations
    .filter((item) => item.order && !item.classId)
    .map((item) => item.feeOrderId);
  const classIds = Array.from(new Set(allocations.map((item) => item.classId).filter(Boolean)));

  return {
    allocations,
    classIds,
    missingOrderIds,
    unassignedOrderIds,
    isMixedClass: classIds.length > 1,
    isComplete: allocations.length > 0 && missingOrderIds.length === 0 && unassignedOrderIds.length === 0
  };
}

function isPaymentFullyCoveredByClasses(payment = {}, orderById = new Map(), coveredClassIds = []) {
  const covered = new Set((Array.isArray(coveredClassIds) ? coveredClassIds : [coveredClassIds])
    .map(normalizeReferenceId)
    .filter(Boolean));
  const scope = buildPaymentClassScope(payment, orderById);
  return scope.isComplete
    && scope.classIds.length > 0
    && scope.classIds.every((classId) => covered.has(classId));
}

function groupPaymentAmountsByClass(payment = {}, orderById = new Map()) {
  const scope = buildPaymentClassScope(payment, orderById);
  const grouped = new Map();
  scope.allocations.forEach((allocation) => {
    const classId = allocation.classId || '';
    const current = grouped.get(classId) || {
      classId,
      classDoc: allocation.order?.classId || null,
      amount: 0,
      allocationCount: 0
    };
    current.amount = roundMoney(current.amount + Number(allocation.amount || 0));
    current.allocationCount += 1;
    grouped.set(classId, current);
  });
  return Array.from(grouped.values());
}

function buildPaymentOrderLinkFilter(orderIds = []) {
  const normalizedIds = Array.from(new Set((Array.isArray(orderIds) ? orderIds : [])
    .map(normalizeReferenceId)
    .filter(Boolean)));
  if (!normalizedIds.length) return { _id: { $in: [] } };
  return {
    $or: [
      { 'allocations.feeOrderId': { $in: normalizedIds } },
      { feeOrderId: { $in: normalizedIds } }
    ]
  };
}

module.exports = {
  normalizeReferenceId,
  getPaymentAllocationRows,
  getPaymentOrderIds,
  buildPaymentClassScope,
  isPaymentFullyCoveredByClasses,
  groupPaymentAmountsByClass,
  buildPaymentOrderLinkFilter
};
