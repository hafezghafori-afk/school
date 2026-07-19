const crypto = require('crypto');

function normalizeId(value = '') {
  if (value && typeof value === 'object') {
    const nestedId = value._id || value.id;
    if (nestedId) return String(nestedId).trim();
    const serialized = typeof value.toString === 'function' ? String(value.toString()).trim() : '';
    return serialized === '[object Object]' ? '' : serialized;
  }
  return String(value || '').trim();
}

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fa');
}

function normalizeNumber(value = 0) {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

function normalizeDate(value = null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function buildDiscountRegistryIdentity(input = {}) {
  const coverageMode = String(input.coverageMode || '').trim() === 'percent' ? 'percent' : 'fixed';
  return [
    'discount-registry-v2',
    normalizeId(input.studentMembershipId),
    normalizeId(input.classId),
    normalizeId(input.academicYearId),
    normalizeId(input.feeOrderId),
    normalizeText(input.discountType || 'discount'),
    normalizeText(input.targetScope || 'student'),
    coverageMode,
    coverageMode === 'fixed' ? normalizeNumber(input.amount) : '0.00',
    coverageMode === 'percent' ? normalizeNumber(input.percentage) : '0.00',
    normalizeText(input.durationMode || 'academic_year'),
    normalizeDate(input.startDate),
    normalizeDate(input.endDate),
    normalizeText(input.reason)
  ].join('|');
}

function buildDiscountRepairIdentity(input = {}) {
  const coverageMode = String(input.coverageMode || '').trim() === 'percent' ? 'percent' : 'fixed';
  const durationMode = normalizeText(input.durationMode || 'academic_year');
  const isCustomPeriod = durationMode === 'custom_period';
  return [
    'discount-repair-v1',
    normalizeId(input.studentMembershipId),
    normalizeId(input.classId),
    normalizeId(input.academicYearId),
    normalizeId(input.feeOrderId),
    normalizeText(input.discountType || 'discount'),
    normalizeText(input.targetScope || 'student'),
    coverageMode,
    coverageMode === 'fixed' ? normalizeNumber(input.amount) : '0.00',
    coverageMode === 'percent' ? normalizeNumber(input.percentage) : '0.00',
    durationMode,
    isCustomPeriod ? normalizeDate(input.startDate) : '',
    isCustomPeriod ? normalizeDate(input.endDate) : ''
  ].join('|');
}

function hashIdentity(identity = '') {
  return crypto.createHash('sha256').update(String(identity || '')).digest('hex').slice(0, 40);
}

function buildDiscountRegistryKey(input = {}) {
  return `registry:v2:${hashIdentity(buildDiscountRegistryIdentity(input))}`;
}

function buildManualDiscountSourceKey(input = {}) {
  return `manual:v2:${hashIdentity(buildDiscountRegistryIdentity(input))}`;
}

function buildClassDiscountGroupKey(input = {}) {
  const classIdentity = buildDiscountRegistryIdentity({
    ...input,
    studentMembershipId: '',
    feeOrderId: '',
    targetScope: 'class'
  });
  return `class:v2:${hashIdentity(classIdentity)}`;
}

function groupDuplicateDiscounts(items = []) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const identity = buildDiscountRegistryIdentity(item);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(item);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([identity, rows]) => ({ identity, rows }));
}

function groupRepairableDiscounts(items = []) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const identity = buildDiscountRepairIdentity(item);
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(item);
  }
  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([identity, rows]) => ({ identity, rows }));
}

module.exports = {
  buildClassDiscountGroupKey,
  buildDiscountRepairIdentity,
  buildDiscountRegistryIdentity,
  buildDiscountRegistryKey,
  buildManualDiscountSourceKey,
  groupDuplicateDiscounts,
  groupRepairableDiscounts,
  normalizeDate,
  normalizeId,
  normalizeText
};
