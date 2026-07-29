const crypto = require('crypto');
const { replaceIranianSolarMonthNames } = require('./afghanDate');

const normalizeId = (value = '') => String(value?._id || value || '').trim();

const normalizePeriodText = (value = '') => replaceIranianSolarMonthNames(String(value || ''))
  .trim()
  .toLowerCase()
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[\s\u200cـ_/]+/g, '-')
  .replace(/-+/g, '-');

const solarMonthKey = (value = null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(date);
    const year = parts.find((item) => item.type === 'year')?.value || '';
    const month = parts.find((item) => item.type === 'month')?.value || '';
    return year && month ? `${year}-${String(month).padStart(2, '0')}` : '';
  } catch {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }
};

const resolveStudentBillingPeriodKey = ({
  periodType = 'term',
  periodLabel = '',
  dueDate = null,
  term = ''
} = {}) => {
  const normalizedType = String(periodType || 'term').trim().toLowerCase() || 'term';
  if (normalizedType === 'monthly') {
    return solarMonthKey(dueDate) || normalizePeriodText(periodLabel);
  }
  return normalizePeriodText(periodLabel || term)
    || (dueDate ? new Date(dueDate).toISOString().slice(0, 10) : normalizedType);
};

const getFinanceRecordFeeTypes = (record = {}) => {
  const feeTypes = [
    ...(Array.isArray(record.feeScopes) ? record.feeScopes : []),
    ...(Array.isArray(record.lineItems) ? record.lineItems.map((item) => item?.feeType) : []),
    record.orderType
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  return [...new Set(feeTypes)];
};

const isMonthlyTuitionRecord = (record = {}) => (
  String(record.periodType || '').trim().toLowerCase() === 'monthly'
  && getFinanceRecordFeeTypes(record).includes('tuition')
);

const buildStudentMonthlyTuitionIdentity = ({
  schoolId = '',
  studentId = '',
  periodType = 'monthly',
  periodLabel = '',
  dueDate = null,
  term = ''
} = {}) => {
  if (String(periodType || '').trim().toLowerCase() !== 'monthly') return '';
  const normalizedStudentId = normalizeId(studentId);
  const periodKey = resolveStudentBillingPeriodKey({ periodType, periodLabel, dueDate, term });
  if (!normalizedStudentId || !periodKey) return '';
  return [
    normalizeId(schoolId) || 'legacy-school',
    normalizedStudentId,
    periodKey,
    'tuition'
  ].join('|');
};

const buildStudentMonthlyTuitionIssuanceKey = (payload = {}) => {
  const identity = buildStudentMonthlyTuitionIdentity(payload);
  if (!identity) return '';
  return `student-monthly-tuition:${crypto.createHash('sha256').update(identity).digest('hex')}`;
};

module.exports = {
  buildStudentMonthlyTuitionIdentity,
  buildStudentMonthlyTuitionIssuanceKey,
  getFinanceRecordFeeTypes,
  isMonthlyTuitionRecord,
  normalizePeriodText,
  resolveStudentBillingPeriodKey,
  solarMonthKey
};
