const FinanceRelief = require('../models/FinanceRelief');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
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

  const payload = buildFinanceReliefPayloadFromDiscount(item);
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
  syncFinanceReliefFromDiscount,
  syncFinanceReliefFromFeeExemption
};
