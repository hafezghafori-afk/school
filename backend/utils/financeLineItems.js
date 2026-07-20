const BREAKDOWN_KEYS = ['tuition', 'admission', 'transport', 'exam', 'document', 'service', 'other'];
const LINE_ITEM_TYPES = [...BREAKDOWN_KEYS, 'penalty'];

const LINE_ITEM_LABELS = {
  tuition: 'Tuition',
  admission: 'Admission',
  transport: 'Transport',
  exam: 'Exam',
  document: 'Document',
  service: 'Service',
  other: 'Other',
  penalty: 'Penalty'
};

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return null;
  return String(value);
}

function normalizeFinanceFeeType(value = '', fallback = 'tuition') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'fees' || normalized === 'fee' || normalized === 'monthly') return 'tuition';
  if (normalized === 'documents') return 'document';
  if (LINE_ITEM_TYPES.includes(normalized)) return normalized;
  return LINE_ITEM_TYPES.includes(fallback) ? fallback : 'tuition';
}

function getLineItemLabel(feeType = '') {
  const normalized = normalizeFinanceFeeType(feeType);
  return LINE_ITEM_LABELS[normalized] || LINE_ITEM_LABELS.tuition;
}

function buildScopedBreakdown(feeBreakdown = {}, feeScopes = []) {
  const selectedScopes = Array.isArray(feeScopes) && feeScopes.length
    ? feeScopes.map((scope) => normalizeFinanceFeeType(scope)).filter((scope) => scope !== 'penalty')
    : BREAKDOWN_KEYS.filter((scope) => Number(feeBreakdown?.[scope]) > 0);

  return selectedScopes.reduce((acc, scope) => {
    acc[scope] = Math.max(0, roundMoney(feeBreakdown?.[scope]));
    return acc;
  }, {});
}

function normalizePaymentBreakdown(paymentBreakdown = {}) {
  return LINE_ITEM_TYPES.reduce((acc, feeType) => {
    acc[feeType] = Math.max(0, roundMoney(paymentBreakdown?.[feeType]));
    return acc;
  }, {});
}

function distributeAmount(total = 0, entries = [], weightSelector = () => 0) {
  const normalizedTotal = Math.max(0, roundMoney(total));
  const rows = Array.isArray(entries) ? entries : [];
  if (!rows.length || normalizedTotal <= 0) return rows.map(() => 0);

  const weights = rows.map((item) => Math.max(0, Number(weightSelector(item)) || 0));
  const totalWeight = weights.reduce((sum, item) => sum + item, 0);
  if (totalWeight <= 0) {
    const equalShare = roundMoney(normalizedTotal / rows.length);
    const result = rows.map(() => equalShare);
    let diff = roundMoney(normalizedTotal - result.reduce((sum, item) => sum + item, 0));
    if (diff !== 0) result[result.length - 1] = roundMoney(result[result.length - 1] + diff);
    return result;
  }

  const result = weights.map((weight, index) => {
    if (index === rows.length - 1) return 0;
    return roundMoney(normalizedTotal * (weight / totalWeight));
  });

  const used = result.reduce((sum, item) => sum + item, 0);
  result[result.length - 1] = roundMoney(normalizedTotal - used);
  return result;
}

function summarizeAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : []).reduce((summary, item) => {
    const type = String(item?.type || '').trim().toLowerCase();
    const amount = Math.max(0, roundMoney(item?.amount));
    if (type === 'penalty') {
      summary.penaltyTotal += amount;
    } else {
      summary.reductionTotal += amount;
    }
    return summary;
  }, { reductionTotal: 0, penaltyTotal: 0 });
}

function normalizeAdjustmentScope(adjustment = {}, fallback = 'all') {
  const explicitScope = normalizeText(adjustment?.scope).toLowerCase();
  if (explicitScope === 'all' || BREAKDOWN_KEYS.includes(explicitScope)) return explicitScope;
  const type = normalizeText(adjustment?.type).toLowerCase();
  const reason = normalizeText(adjustment?.reason).toLowerCase();
  if (type === 'discount' || reason.startsWith('[discount:')) return 'tuition';
  return fallback === 'all' || BREAKDOWN_KEYS.includes(fallback) ? fallback : 'all';
}

function getFinanceFeeScopeGrossAmount(document = {}, scope = 'tuition') {
  const normalizedScope = normalizeFinanceFeeType(scope, 'tuition');
  const lineAmount = (Array.isArray(document?.lineItems) ? document.lineItems : [])
    .filter((item) => normalizeFinanceFeeType(item?.feeType) === normalizedScope)
    .reduce((sum, item) => sum + Math.max(0, Number(item?.grossAmount ?? item?.netAmount ?? 0) || 0), 0);
  if (lineAmount > 0) return Math.max(0, roundMoney(lineAmount));

  const breakdownAmount = Math.max(0, roundMoney(document?.feeBreakdown?.[normalizedScope]));
  if (breakdownAmount > 0) return breakdownAmount;

  const scopes = Array.isArray(document?.feeScopes)
    ? document.feeScopes.map((item) => normalizeFinanceFeeType(item)).filter((item) => item !== 'penalty')
    : [];
  const rawOrderType = normalizeText(document?.orderType);
  if ((scopes.length === 1 && scopes[0] === normalizedScope)
    || (rawOrderType && normalizeFinanceFeeType(rawOrderType) === normalizedScope)) {
    return Math.max(0, roundMoney(document?.amountOriginal));
  }
  return 0;
}

function getFinanceFeeScopePaidAmount(document = {}, scope = 'tuition') {
  const normalizedScope = normalizeFinanceFeeType(scope, 'tuition');
  const lineAmount = (Array.isArray(document?.lineItems) ? document.lineItems : [])
    .filter((item) => normalizeFinanceFeeType(item?.feeType) === normalizedScope)
    .reduce((sum, item) => sum + Math.max(0, Number(item?.paidAmount || 0) || 0), 0);
  if (lineAmount > 0) return Math.max(0, roundMoney(lineAmount));
  return Math.max(0, roundMoney(document?.paymentBreakdown?.[normalizedScope]));
}

function getFinanceFeeScopeBalanceAmount(document = {}, scope = 'tuition') {
  const normalizedScope = normalizeFinanceFeeType(scope, 'tuition');
  const scopedLines = (Array.isArray(document?.lineItems) ? document.lineItems : [])
    .filter((item) => normalizeFinanceFeeType(item?.feeType) === normalizedScope);
  if (scopedLines.length) {
    return Math.max(0, roundMoney(scopedLines.reduce((sum, item) => (
      sum + Math.max(0, Number(item?.balanceAmount ?? ((Number(item?.netAmount) || 0) - (Number(item?.paidAmount) || 0))) || 0)
    ), 0)));
  }
  return Math.max(0, roundMoney(
    getFinanceFeeScopeGrossAmount(document, normalizedScope)
      - getFinanceFeeScopePaidAmount(document, normalizedScope)
  ));
}

function buildSeedLines({
  lineItems = [],
  feeBreakdown = {},
  feeScopes = [],
  amountOriginal = 0,
  defaultType = 'tuition',
  sourcePlanId = null,
  periodKey = ''
} = {}) {
  const provided = Array.isArray(lineItems) ? lineItems : [];
  const hasProvidedBaseLines = provided.some((item) => {
    const feeType = normalizeFinanceFeeType(item?.feeType, defaultType);
    if (feeType === 'penalty') return false;
    return Math.max(
      0,
      Number(item?.grossAmount ?? item?.netAmount ?? item?.balanceAmount ?? item?.paidAmount ?? 0) || 0
    ) > 0 || normalizeText(item?.label);
  });

  if (hasProvidedBaseLines) {
    return provided
      .filter((item) => normalizeFinanceFeeType(item?.feeType, defaultType) !== 'penalty')
      .map((item) => ({
        feeType: normalizeFinanceFeeType(item?.feeType, defaultType),
        label: normalizeText(item?.label) || getLineItemLabel(item?.feeType),
        grossAmount: Math.max(0, roundMoney(item?.grossAmount ?? item?.netAmount)),
        sourcePlanId: normalizeNullableId(item?.sourcePlanId) || normalizeNullableId(sourcePlanId),
        periodKey: normalizeText(item?.periodKey) || normalizeText(periodKey)
      }));
  }

  const scopedBreakdown = buildScopedBreakdown(feeBreakdown, feeScopes);
  const scopedKeys = Object.keys(scopedBreakdown).filter((scope) => scopedBreakdown[scope] > 0);
  if (scopedKeys.length) {
    return scopedKeys.map((scope) => ({
      feeType: scope,
      label: getLineItemLabel(scope),
      grossAmount: Math.max(0, roundMoney(scopedBreakdown[scope])),
      sourcePlanId: normalizeNullableId(sourcePlanId),
      periodKey: normalizeText(periodKey)
    }));
  }

  if (Math.max(0, roundMoney(amountOriginal)) > 0) {
    return [{
      feeType: normalizeFinanceFeeType(defaultType, 'tuition'),
      label: getLineItemLabel(defaultType),
      grossAmount: Math.max(0, roundMoney(amountOriginal)),
      sourcePlanId: normalizeNullableId(sourcePlanId),
      periodKey: normalizeText(periodKey)
    }];
  }

  return [];
}

function normalizeFinanceLineItems({
  lineItems = [],
  feeBreakdown = {},
  feeScopes = [],
  amountOriginal = 0,
  adjustments = [],
  amountPaid = 0,
  paymentBreakdown = {},
  defaultType = 'tuition',
  sourcePlanId = null,
  periodKey = ''
} = {}) {
  const normalizedAmountOriginal = Math.max(0, roundMoney(amountOriginal));
  const normalizedAmountPaid = Math.max(0, roundMoney(amountPaid));
  const normalizedPaymentBreakdown = normalizePaymentBreakdown(paymentBreakdown);
  const baseSeeds = buildSeedLines({
    lineItems,
    feeBreakdown,
    feeScopes,
    amountOriginal: normalizedAmountOriginal,
    defaultType,
    sourcePlanId,
    periodKey
  });
  const effectiveAmountOriginal = normalizedAmountOriginal > 0
    ? normalizedAmountOriginal
    : roundMoney(baseSeeds.reduce((sum, item) => sum + (Number(item?.grossAmount) || 0), 0));
  const totals = summarizeAdjustments(adjustments);

  const baseGrossShares = distributeAmount(
    effectiveAmountOriginal,
    baseSeeds,
    (item) => Math.max(0, Number(item?.grossAmount) || 0)
  );

  const baseLines = baseSeeds.map((item, index) => ({
    feeType: normalizeFinanceFeeType(item?.feeType, defaultType),
    label: normalizeText(item?.label) || getLineItemLabel(item?.feeType),
    sourcePlanId: normalizeNullableId(item?.sourcePlanId) || normalizeNullableId(sourcePlanId),
    periodKey: normalizeText(item?.periodKey) || normalizeText(periodKey),
    grossAmount: Math.max(0, roundMoney(baseGrossShares[index] || 0)),
    reductionAmount: 0,
    penaltyAmount: 0,
    netAmount: 0,
    paidAmount: 0,
    balanceAmount: 0,
    status: 'open'
  }));

  const reductionAdjustments = (Array.isArray(adjustments) ? adjustments : [])
    .filter((item) => normalizeText(item?.type).toLowerCase() !== 'penalty')
    .map((item) => ({
      amount: Math.max(0, roundMoney(item?.amount)),
      scope: normalizeAdjustmentScope(item)
    }))
    .filter((item) => item.amount > 0);

  reductionAdjustments.forEach((adjustment) => {
    const eligibleLines = baseLines.filter((item) => (
      (adjustment.scope === 'all' || item.feeType === adjustment.scope)
      && roundMoney(item.grossAmount - item.reductionAmount) > 0
    ));
    const availableAmount = roundMoney(eligibleLines.reduce(
      (sum, item) => sum + Math.max(0, Number(item.grossAmount || 0) - Number(item.reductionAmount || 0)),
      0
    ));
    const appliedAmount = Math.min(adjustment.amount, availableAmount);
    const shares = distributeAmount(
      appliedAmount,
      eligibleLines,
      (item) => Math.max(0, Number(item.grossAmount || 0) - Number(item.reductionAmount || 0))
    );
    eligibleLines.forEach((item, index) => {
      item.reductionAmount = Math.min(
        item.grossAmount,
        Math.max(0, roundMoney(item.reductionAmount + (shares[index] || 0)))
      );
    });
  });

  baseLines.forEach((item) => {
    item.netAmount = Math.max(0, roundMoney(item.grossAmount - item.reductionAmount));
  });

  const normalizedLines = baseLines.filter((item) => (
    item.grossAmount > 0 || item.reductionAmount > 0 || item.netAmount > 0
  ));

  if (totals.penaltyTotal > 0) {
    const providedPenalty = (Array.isArray(lineItems) ? lineItems : []).find((item) => (
      normalizeFinanceFeeType(item?.feeType, defaultType) === 'penalty'
    )) || {};
    normalizedLines.push({
      feeType: 'penalty',
      label: normalizeText(providedPenalty?.label) || getLineItemLabel('penalty'),
      sourcePlanId: normalizeNullableId(providedPenalty?.sourcePlanId) || normalizeNullableId(sourcePlanId),
      periodKey: normalizeText(providedPenalty?.periodKey) || normalizeText(periodKey),
      grossAmount: 0,
      reductionAmount: 0,
      penaltyAmount: Math.max(0, roundMoney(totals.penaltyTotal)),
      netAmount: Math.max(0, roundMoney(totals.penaltyTotal)),
      paidAmount: 0,
      balanceAmount: 0,
      status: 'open'
    });
  }

  const payableLines = normalizedLines.filter((item) => item.netAmount > 0);
  const totalNet = roundMoney(payableLines.reduce((sum, item) => sum + (Number(item.netAmount) || 0), 0));
  let remainingPaid = Math.min(normalizedAmountPaid, totalNet);

  LINE_ITEM_TYPES.forEach((feeType) => {
    const scopedAmount = Math.max(0, roundMoney(normalizedPaymentBreakdown[feeType]));
    if (scopedAmount <= 0 || remainingPaid <= 0) return;
    const scopedLines = payableLines.filter((item) => item.feeType === feeType);
    const scopedCapacity = roundMoney(scopedLines.reduce((sum, item) => sum + Number(item.netAmount || 0), 0));
    const appliedAmount = Math.min(scopedAmount, scopedCapacity, remainingPaid);
    const shares = distributeAmount(appliedAmount, scopedLines, (item) => item.netAmount);
    scopedLines.forEach((item, index) => {
      item.paidAmount = Math.max(0, roundMoney(item.paidAmount + (shares[index] || 0)));
    });
    remainingPaid = Math.max(0, roundMoney(remainingPaid - appliedAmount));
  });

  if (remainingPaid > 0) {
    const legacyLines = payableLines.filter((item) => roundMoney(item.netAmount - item.paidAmount) > 0);
    const legacyShares = distributeAmount(
      remainingPaid,
      legacyLines,
      (item) => Math.max(0, roundMoney(item.netAmount - item.paidAmount))
    );
    legacyLines.forEach((item, index) => {
      item.paidAmount = Math.min(
        item.netAmount,
        Math.max(0, roundMoney(item.paidAmount + (legacyShares[index] || 0)))
      );
    });
  }

  normalizedLines.forEach((item) => {
    if (item.netAmount <= 0) item.paidAmount = 0;
    item.balanceAmount = Math.max(0, roundMoney(item.netAmount - item.paidAmount));
    if (item.netAmount <= 0) {
      item.status = item.grossAmount > 0 ? 'waived' : 'open';
    } else if (item.balanceAmount <= 0) {
      item.status = 'paid';
    } else if (item.paidAmount > 0) {
      item.status = 'partial';
    } else {
      item.status = 'open';
    }
  });

  return normalizedLines;
}

function buildFeeBreakdownFromLineItems(lineItems = []) {
  const breakdown = BREAKDOWN_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});

  (Array.isArray(lineItems) ? lineItems : []).forEach((item) => {
    const feeType = normalizeFinanceFeeType(item?.feeType);
    if (feeType === 'penalty' || !Object.prototype.hasOwnProperty.call(breakdown, feeType)) return;
    breakdown[feeType] = roundMoney((Number(breakdown[feeType]) || 0) + (Number(item?.grossAmount) || 0));
  });

  return breakdown;
}

function buildFeeScopesFromLineItems(lineItems = []) {
  return Array.from(new Set(
    (Array.isArray(lineItems) ? lineItems : [])
      .map((item) => normalizeFinanceFeeType(item?.feeType))
      .filter((feeType) => feeType !== 'penalty')
      .filter((feeType) => {
        const line = (lineItems || []).find((entry) => normalizeFinanceFeeType(entry?.feeType) === feeType);
        return Math.max(0, Number(line?.grossAmount || line?.netAmount || 0)) > 0;
      })
  ));
}

function inferPrimaryOrderType(lineItems = [], fallback = 'tuition') {
  const scopes = buildFeeScopesFromLineItems(lineItems);
  if (scopes.includes('tuition')) return 'tuition';
  const normalizedFallback = normalizeFinanceFeeType(fallback, 'tuition');
  if (scopes.length === 1) return scopes[0];
  if (scopes.length > 1 && scopes.includes(normalizedFallback)) return normalizedFallback;
  return scopes[0] || normalizedFallback || 'tuition';
}

function deriveFinanceOrderStatus({
  currentStatus = '',
  amountOriginal = 0,
  amountDue = 0,
  amountPaid = 0,
  dueDate = null,
  now = new Date()
} = {}) {
  const normalizedStatus = normalizeText(currentStatus).toLowerCase();
  if (normalizedStatus === 'void') return 'void';

  const grossAmount = Math.max(0, roundMoney(amountOriginal));
  const payableAmount = Math.max(0, roundMoney(amountDue));
  const paidAmount = Math.max(0, roundMoney(amountPaid));
  const remainingAmount = Math.max(0, roundMoney(payableAmount - paidAmount));

  // A fully covered obligation is not a payment: no cash was received.
  if (grossAmount > 0 && payableAmount <= 0 && paidAmount <= 0) return 'waived';
  if (paidAmount > 0 && remainingAmount <= 0) return 'paid';
  if (dueDate) {
    const deadline = new Date(dueDate);
    const referenceTime = now instanceof Date ? now : new Date(now);
    if (!Number.isNaN(deadline.getTime())
      && !Number.isNaN(referenceTime.getTime())
      && deadline.getTime() < referenceTime.getTime()) {
      return 'overdue';
    }
  }
  if (paidAmount > 0) return 'partial';
  return 'new';
}

function applyFinanceOrderStatus(order = {}, { paidAt = new Date(), now = new Date() } = {}) {
  const amountDue = Math.max(0, roundMoney(order?.amountDue));
  const amountPaid = Math.max(0, roundMoney(order?.amountPaid));
  const remainingAmount = Math.max(0, roundMoney(amountDue - amountPaid));
  const status = deriveFinanceOrderStatus({
    currentStatus: order?.status,
    amountOriginal: order?.amountOriginal,
    amountDue,
    amountPaid,
    dueDate: order?.dueDate,
    now
  });

  order.status = status;
  if (status === 'paid') {
    if (!order.paidAt) order.paidAt = paidAt;
  } else if (status !== 'void') {
    order.paidAt = null;
  }

  return remainingAmount;
}

module.exports = {
  BREAKDOWN_KEYS,
  LINE_ITEM_TYPES,
  getLineItemLabel,
  normalizeFinanceFeeType,
  normalizeFinanceLineItems,
  buildFeeBreakdownFromLineItems,
  buildFeeScopesFromLineItems,
  buildScopedBreakdown,
  normalizePaymentBreakdown,
  inferPrimaryOrderType,
  normalizeAdjustmentScope,
  getFinanceFeeScopeGrossAmount,
  getFinanceFeeScopePaidAmount,
  getFinanceFeeScopeBalanceAmount,
  deriveFinanceOrderStatus,
  applyFinanceOrderStatus,
  roundMoney
};
