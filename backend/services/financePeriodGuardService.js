const mongoose = require('mongoose');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinancialYear = require('../models/FinancialYear');
const { buildMonthCloseLockMessage, resolveMonthCloseLock } = require('../utils/financeMonthClosePeriods');

function normalizeId(value = '') {
  return String(value?._id || value || '').trim();
}

function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function createPeriodError(code, message, statusCode = 409) {
  const error = new Error(code);
  error.code = code;
  error.status = statusCode;
  error.statusCode = statusCode;
  error.messageDari = message;
  return error;
}

function assertValidScopeId(value, code) {
  const normalized = normalizeId(value);
  if (normalized && !mongoose.Types.ObjectId.isValid(normalized)) {
    throw createPeriodError(code, 'شناسه دوره مالی معتبر نیست.', 400);
  }
  return normalized;
}

async function resolveFinancialYearForScope({
  schoolId = '',
  financialYearId = '',
  academicYearId = '',
  dateValue = null,
  session = null
} = {}) {
  const normalizedSchoolId = assertValidScopeId(schoolId, 'finance_school_scope_invalid');
  const normalizedFinancialYearId = assertValidScopeId(financialYearId, 'finance_financial_year_scope_invalid');
  const normalizedAcademicYearId = assertValidScopeId(academicYearId, 'finance_academic_year_scope_invalid');
  if (!normalizedSchoolId) {
    throw createPeriodError('finance_school_scope_required', 'برای تغییر سند مالی، مکتب معتبر باید مشخص باشد.', 400);
  }
  const query = {};
  if (normalizedFinancialYearId) query._id = normalizedFinancialYearId;
  if (normalizedSchoolId) query.schoolId = normalizedSchoolId;
  if (!normalizedFinancialYearId && normalizedAcademicYearId) query.academicYearId = normalizedAcademicYearId;
  if (!normalizedFinancialYearId && !normalizedAcademicYearId && dateValue) {
    const date = new Date(dateValue);
    if (!Number.isNaN(date.getTime())) {
      query.startDate = { $lte: date };
      query.endDate = { $gte: date };
    }
  }
  if (!Object.keys(query).length || (!query._id && !query.academicYearId && !query.startDate)) return null;
  let dbQuery = FinancialYear.findOne(query).sort({ isActive: -1, createdAt: -1 });
  if (session) dbQuery = dbQuery.session(session);
  return dbQuery;
}

// The month close whose days cover this date and that blocks writes right now
// (closed, in review, or reopened past its deadline), with the reason - or
// null. Matching the stored closeWindow instead of a "YYYY-MM" key keeps solar
// closes and older Gregorian ones working side by side.
async function findLockingMonthClose(dateValue, scope = {}) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const schoolId = assertValidScopeId(scope.schoolId, 'finance_school_scope_invalid');
  const financialYearId = assertValidScopeId(scope.financialYearId, 'finance_financial_year_scope_invalid');
  const academicYearId = assertValidScopeId(scope.academicYearId, 'finance_academic_year_scope_invalid');
  if (!schoolId) {
    throw createPeriodError('finance_school_scope_required', 'برای بررسی ماه مالی، مکتب معتبر باید مشخص باشد.', 400);
  }
  const filter = {
    schoolId,
    status: { $in: ['closed', 'pending_review', 'reopened'] },
    $or: [
      { 'closeWindow.startAt': { $lte: date }, 'closeWindow.endAt': { $gte: date } },
      // Records stored before closeWindow existed cover their Gregorian month.
      { 'closeWindow.startAt': null, monthKey: toMonthKey(date) }
    ]
  };
  if (financialYearId) filter.financialYearId = financialYearId;
  else if (academicYearId) filter.academicYearId = academicYearId;
  let query = FinanceMonthClose.find(filter).select('monthKey status closeWindow reopenDeadline');
  if (scope.session) query = query.session(scope.session);
  const rows = await query.lean();
  const now = new Date();
  for (const record of rows) {
    const lock = resolveMonthCloseLock(record, now);
    if (lock.locked) return { record, reason: lock.reason };
  }
  return null;
}

async function isFinanceMonthClosed(dateValue, scope = {}) {
  return Boolean(await findLockingMonthClose(dateValue, scope));
}

async function assertFinancePeriodWritable(scope = {}) {
  const financialYear = await resolveFinancialYearForScope(scope);
  if (normalizeId(scope.financialYearId) && !financialYear) {
    throw createPeriodError(
      'finance_financial_year_scope_invalid',
      'سال مالی با مکتب فعال سازگار نیست یا پیدا نشد.',
      400
    );
  }
  if (financialYear?.isClosed === true || String(financialYear?.status || '') === 'closed') {
    throw createPeriodError('finance_financial_year_closed', 'سال مالی بسته شده است و تغییر سند مالی در این دوره مجاز نیست.');
  }
  const lock = await findLockingMonthClose(scope.dateValue || new Date(), {
    ...scope,
    financialYearId: normalizeId(scope.financialYearId || financialYear?._id),
    academicYearId: normalizeId(scope.academicYearId || financialYear?.academicYearId)
  });
  if (lock) {
    throw createPeriodError('finance_month_closed', buildMonthCloseLockMessage(lock.record, lock.reason));
  }
  return financialYear;
}

module.exports = {
  assertFinancePeriodWritable,
  createPeriodError,
  findLockingMonthClose,
  isFinanceMonthClosed,
  resolveFinancialYearForScope,
  toMonthKey
};
