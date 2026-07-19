const FinanceRelief = require('../models/FinanceRelief');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FeeOrder = require('../models/FeeOrder');
const {
  buildFinanceReliefPayloadFromDiscount,
  buildFinanceReliefPayloadFromExemption
} = require('./financeRelief');

function reliefChanged(existing = {}, payload = {}) {
  const keys = [
    'sourceModel',
    'feeOrderId',
    'studentMembershipId',
    'linkScope',
    'studentId',
    'student',
    'classId',
    'academicYearId',
    'reliefType',
    'scope',
    'coverageMode',
    'amount',
    'percentage',
    'sponsorName',
    'reason',
    'note',
    'approvedBy',
    'createdBy',
    'status',
    'cancelledBy',
    'cancelReason'
  ];
  return keys.some((key) => String(existing?.[key] || '') !== String(payload?.[key] || ''))
    || String(existing?.startDate ? new Date(existing.startDate).toISOString() : '') !== String(payload?.startDate ? new Date(payload.startDate).toISOString() : '')
    || String(existing?.endDate ? new Date(existing.endDate).toISOString() : '') !== String(payload?.endDate ? new Date(payload.endDate).toISOString() : '')
    || String(existing?.cancelledAt ? new Date(existing.cancelledAt).toISOString() : '') !== String(payload?.cancelledAt ? new Date(payload.cancelledAt).toISOString() : '')
    || String(existing?.sourceUpdatedAt ? new Date(existing.sourceUpdatedAt).toISOString() : '') !== String(payload?.sourceUpdatedAt ? new Date(payload.sourceUpdatedAt).toISOString() : '');
}

function promoteDiscountReliefToFullCoverage(payload = {}, order = null) {
  if (payload.status !== 'active' || payload.coverageMode !== 'fixed' || payload.reliefType === 'penalty') return payload;
  const reliefAmount = Number(payload.amount || 0);
  const originalAmount = Number(order?.amountOriginal || 0);
  if (reliefAmount <= 0 || originalAmount <= 0 || reliefAmount < originalAmount) return payload;
  return {
    ...payload,
    coverageMode: 'full',
    amount: 0,
    percentage: 100,
    reliefType: 'waiver'
  };
}

function isRegistryDiscountSource(item = {}) {
  return ['manual', 'migration'].includes(String(item?.source || '').trim());
}

async function resolveDiscount(input) {
  if (input && typeof input === 'object' && (input.discountType || input._id)) return input;
  return Discount.findById(input).lean();
}

async function resolveFeeExemption(input) {
  if (input && typeof input === 'object' && (input.exemptionType || input._id)) return input;
  return FeeExemption.findById(input).lean();
}

async function syncFinanceReliefFromDiscount(input, { dryRun = false } = {}) {
  const item = await resolveDiscount(input);
  if (!item || !item._id) {
    return { created: false, updated: false, skipped: true, reason: 'discount_not_found', reliefId: null };
  }

  if (!isRegistryDiscountSource(item)) {
    const existingMirror = await FinanceRelief.findOne({ sourceKey: `discount:${String(item._id)}` });
    if (!existingMirror) {
      return { created: false, updated: false, skipped: true, reason: 'bill_adjustment_not_registry_relief', reliefId: null };
    }
    if (existingMirror.status === 'cancelled') {
      return { created: false, updated: false, skipped: true, reason: 'bill_adjustment_relief_already_cancelled', reliefId: existingMirror._id };
    }
    if (dryRun) return { created: false, updated: true, skipped: false, reliefId: existingMirror._id };
    existingMirror.status = 'cancelled';
    existingMirror.cancelReason = 'bill_adjustment_not_registry_relief';
    existingMirror.cancelledAt = new Date();
    await existingMirror.save();
    return { created: false, updated: true, skipped: false, reliefId: existingMirror._id };
  }

  const payload = buildFinanceReliefPayloadFromDiscount(item);
  if (payload.status === 'active' && payload.coverageMode === 'fixed' && Number(payload.amount || 0) > 0 && payload.reliefType !== 'penalty') {
    const sourceFilter = item.feeOrderId
      ? { _id: item.feeOrderId?._id || item.feeOrderId }
      : { studentMembershipId: item.studentMembershipId?._id || item.studentMembershipId };
    const latestDiscountedOrder = await FeeOrder.findOne({
      ...sourceFilter,
      status: { $ne: 'void' },
      'adjustments.reason': { $regex: `^\\[discount:${String(item._id)}\\]` }
    })
      .sort({ dueDate: -1, createdAt: -1 })
      .select('_id amountOriginal amountDue')
      .lean();
    Object.assign(payload, promoteDiscountReliefToFullCoverage(payload, latestDiscountedOrder));
  }
  const existing = await FinanceRelief.findOne({ sourceKey: payload.sourceKey });
  if (!existing) {
    if (dryRun) return { created: true, updated: false, skipped: false, reliefId: null };
    const created = await FinanceRelief.create(payload);
    return { created: true, updated: false, skipped: false, reliefId: created._id };
  }

  if (!reliefChanged(existing.toObject ? existing.toObject() : existing, payload)) {
    return { created: false, updated: false, skipped: true, reason: 'no_change', reliefId: existing._id };
  }

  if (dryRun) return { created: false, updated: true, skipped: false, reliefId: existing._id };
  Object.assign(existing, payload);
  await existing.save();
  return { created: false, updated: true, skipped: false, reliefId: existing._id };
}

async function syncFinanceReliefFromFeeExemption(input, { dryRun = false } = {}) {
  const item = await resolveFeeExemption(input);
  if (!item || !item._id) {
    return { created: false, updated: false, skipped: true, reason: 'fee_exemption_not_found', reliefId: null };
  }

  const payload = buildFinanceReliefPayloadFromExemption(item);
  const existing = await FinanceRelief.findOne({ sourceKey: payload.sourceKey });
  if (!existing) {
    if (dryRun) return { created: true, updated: false, skipped: false, reliefId: null };
    const created = await FinanceRelief.create(payload);
    return { created: true, updated: false, skipped: false, reliefId: created._id };
  }

  if (!reliefChanged(existing.toObject ? existing.toObject() : existing, payload)) {
    return { created: false, updated: false, skipped: true, reason: 'no_change', reliefId: existing._id };
  }

  if (dryRun) return { created: false, updated: true, skipped: false, reliefId: existing._id };
  Object.assign(existing, payload);
  await existing.save();
  return { created: false, updated: true, skipped: false, reliefId: existing._id };
}

module.exports = {
  isRegistryDiscountSource,
  promoteDiscountReliefToFullCoverage,
  syncFinanceReliefFromDiscount,
  syncFinanceReliefFromFeeExemption
};
