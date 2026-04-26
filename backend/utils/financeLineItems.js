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
  defaultType = 'tuition',
  sourcePlanId = null,
  periodKey = ''
} = {}) {
  const normalizedAmountOriginal = Math.max(0, roundMoney(amountOriginal));
  const normalizedAmountPaid = Math.max(0, roundMoney(amountPaid));
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

  const reductionShares = distributeAmount(
    Math.min(totals.reductionTotal, effectiveAmountOriginal),
    baseLines.filter((item) => item.grossAmount > 0),
    (item) => item.grossAmount
  );

  let reductionIndex = 0;
  baseLines.forEach((item) => {
    if (item.grossAmount <= 0) return;
    item.reductionAmount = Math.max(0, roundMoney(reductionShares[reductionIndex] || 0));
    reductionIndex += 1;
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
  const paidShares = distributeAmount(
    Math.min(normalizedAmountPaid, totalNet),
    payableLines,
    (item) => item.netAmount
  );

  let paidIndex = 0;
  normalizedLines.forEach((item) => {
    if (item.netAmount > 0) {
      item.paidAmount = Math.max(0, roundMoney(paidShares[paidIndex] || 0));
      paidIndex += 1;
    } else {
      item.paidAmount = 0;
    }
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

module.exports = {
  BREAKDOWN_KEYS,
  LINE_ITEM_TYPES,
  getLineItemLabel,
  normalizeFinanceFeeType,
  normalizeFinanceLineItems,
  buildFeeBreakdownFromLineItems,
  buildFeeScopesFromLineItems,
  buildScopedBreakdown,
  inferPrimaryOrderType,
  roundMoney
};
