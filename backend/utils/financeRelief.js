const RELIEF_TYPES = [
  'discount',
  'waiver',
  'penalty',
  'manual',
  'free_student',
  'scholarship_partial',
  'scholarship_full',
  'charity_support',
  'sibling_discount'
];

const RELIEF_SCOPES = ['tuition', 'admission', 'exam', 'transport', 'document', 'service', 'other', 'all'];
const RELIEF_COVERAGE_MODES = ['fixed', 'percent', 'full'];

function roundMoney(value) {
  return Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  if (!value) return null;
  return String(value);
}

function normalizeReliefType(value = '', fallback = 'manual') {
  const normalized = String(value || '').trim().toLowerCase();
  return RELIEF_TYPES.includes(normalized) ? normalized : fallback;
}

function normalizeReliefScope(value = '', fallback = 'all') {
  const normalized = String(value || '').trim().toLowerCase();
  return RELIEF_SCOPES.includes(normalized) ? normalized : fallback;
}

function normalizeCoverageMode(value = '', fallback = 'fixed') {
  const normalized = String(value || '').trim().toLowerCase();
  return RELIEF_COVERAGE_MODES.includes(normalized) ? normalized : fallback;
}

function mapDiscountTypeToReliefType(discountType = '') {
  const normalized = String(discountType || '').trim().toLowerCase();
  if (normalized === 'penalty') return 'penalty';
  if (normalized === 'waiver') return 'waiver';
  if (normalized === 'manual') return 'manual';
  return 'discount';
}

function mapExemptionToReliefType(exemption = {}) {
  const exemptionType = String(exemption?.exemptionType || '').trim().toLowerCase();
  const scope = String(exemption?.scope || '').trim().toLowerCase();
  if (exemptionType === 'full' && scope === 'all') return 'free_student';
  if (exemptionType === 'full') return 'scholarship_full';
  return 'scholarship_partial';
}

function buildFinanceReliefPayloadFromDiscount(discount = {}) {
  return {
    sourceModel: 'discount',
    sourceDiscountId: normalizeNullableId(discount._id),
    sourceKey: `discount:${String(discount._id || '')}`,
    feeOrderId: normalizeNullableId(discount.feeOrderId?._id || discount.feeOrderId),
    studentMembershipId: normalizeNullableId(discount.studentMembershipId?._id || discount.studentMembershipId),
    linkScope: normalizeText(discount.linkScope) || 'membership',
    studentId: normalizeNullableId(discount.studentId?._id || discount.studentId),
    student: normalizeNullableId(discount.student?._id || discount.student),
    classId: normalizeNullableId(discount.classId?._id || discount.classId),
    academicYearId: normalizeNullableId(discount.academicYearId?._id || discount.academicYearId),
    reliefType: mapDiscountTypeToReliefType(discount.discountType),
    scope: 'all',
    coverageMode: 'fixed',
    amount: roundMoney(discount.amount),
    percentage: 0,
    sponsorName: '',
    reason: normalizeText(discount.reason),
    note: '',
    approvedBy: null,
    createdBy: normalizeNullableId(discount.createdBy?._id || discount.createdBy),
    status: normalizeText(discount.status) === 'cancelled' ? 'cancelled' : 'active',
    startDate: discount.createdAt || new Date(),
    endDate: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: '',
    sourceUpdatedAt: discount.updatedAt || discount.createdAt || new Date()
  };
}

function buildFinanceReliefPayloadFromExemption(exemption = {}) {
  const exemptionType = String(exemption?.exemptionType || '').trim().toLowerCase();
  const reliefType = mapExemptionToReliefType(exemption);
  const coverageMode = exemptionType === 'full'
    ? 'full'
    : ((Number(exemption?.percentage) || 0) > 0 && !(Number(exemption?.amount) || 0) ? 'percent' : 'fixed');

  return {
    sourceModel: 'fee_exemption',
    sourceExemptionId: normalizeNullableId(exemption._id),
    sourceKey: `fee_exemption:${String(exemption._id || '')}`,
    feeOrderId: null,
    studentMembershipId: normalizeNullableId(exemption.studentMembershipId?._id || exemption.studentMembershipId),
    linkScope: normalizeText(exemption.linkScope) || 'membership',
    studentId: normalizeNullableId(exemption.studentId?._id || exemption.studentId),
    student: normalizeNullableId(exemption.student?._id || exemption.student),
    classId: normalizeNullableId(exemption.classId?._id || exemption.classId),
    academicYearId: normalizeNullableId(exemption.academicYearId?._id || exemption.academicYearId),
    reliefType,
    scope: normalizeReliefScope(exemption.scope, 'all'),
    coverageMode,
    amount: exemptionType === 'partial' ? roundMoney(exemption.amount) : 0,
    percentage: exemptionType === 'partial' ? Math.max(0, Math.min(100, Number(exemption.percentage) || 0)) : 100,
    sponsorName: '',
    reason: normalizeText(exemption.reason),
    note: normalizeText(exemption.note),
    approvedBy: normalizeNullableId(exemption.approvedBy?._id || exemption.approvedBy),
    createdBy: normalizeNullableId(exemption.createdBy?._id || exemption.createdBy),
    status: normalizeText(exemption.status) === 'cancelled' ? 'cancelled' : 'active',
    startDate: exemption.createdAt || new Date(),
    endDate: null,
    cancelledBy: normalizeNullableId(exemption.cancelledBy?._id || exemption.cancelledBy),
    cancelledAt: exemption.cancelledAt || null,
    cancelReason: normalizeText(exemption.cancelReason),
    sourceUpdatedAt: exemption.updatedAt || exemption.createdAt || new Date()
  };
}

function toReliefPreviewRecord(item = {}) {
  return {
    sourceModel: normalizeText(item.sourceModel),
    sourceKey: normalizeText(item.sourceKey),
    feeOrderId: normalizeNullableId(item.feeOrderId?._id || item.feeOrderId),
    studentMembershipId: normalizeNullableId(item.studentMembershipId?._id || item.studentMembershipId),
    linkScope: normalizeText(item.linkScope) || 'membership',
    studentId: normalizeNullableId(item.studentId?._id || item.studentId),
    student: normalizeNullableId(item.student?._id || item.student),
    classId: normalizeNullableId(item.classId?._id || item.classId),
    academicYearId: normalizeNullableId(item.academicYearId?._id || item.academicYearId),
    reliefType: normalizeReliefType(item.reliefType, 'manual'),
    scope: normalizeReliefScope(item.scope, 'all'),
    coverageMode: normalizeCoverageMode(item.coverageMode, 'fixed'),
    amount: roundMoney(item.amount),
    percentage: Math.max(0, Math.min(100, Number(item.percentage) || 0)),
    sponsorName: normalizeText(item.sponsorName),
    reason: normalizeText(item.reason),
    note: normalizeText(item.note),
    status: normalizeText(item.status) === 'cancelled' ? 'cancelled' : 'active',
    approvedBy: normalizeNullableId(item.approvedBy?._id || item.approvedBy),
    createdBy: normalizeNullableId(item.createdBy?._id || item.createdBy),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    cancelledBy: normalizeNullableId(item.cancelledBy?._id || item.cancelledBy),
    cancelledAt: item.cancelledAt || null,
    cancelReason: normalizeText(item.cancelReason)
  };
}

function reliefAppliesReduction(reliefType = '') {
  return normalizeReliefType(reliefType, 'manual') !== 'penalty';
}

module.exports = {
  RELIEF_TYPES,
  RELIEF_SCOPES,
  RELIEF_COVERAGE_MODES,
  normalizeReliefType,
  normalizeReliefScope,
  normalizeCoverageMode,
  mapDiscountTypeToReliefType,
  mapExemptionToReliefType,
  buildFinanceReliefPayloadFromDiscount,
  buildFinanceReliefPayloadFromExemption,
  toReliefPreviewRecord,
  reliefAppliesReduction,
  roundMoney,
  normalizeText,
  normalizeNullableId
};
