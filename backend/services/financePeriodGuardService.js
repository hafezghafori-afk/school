const mongoose = require('mongoose');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinancialYear = require('../models/FinancialYear');

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

async function isFinanceMonthClosed(dateValue, scope = {}) {
  const monthKey = toMonthKey(dateValue);
  if (!monthKey) return false;
  const schoolId = assertValidScopeId(scope.schoolId, 'finance_school_scope_invalid');
  const financialYearId = assertValidScopeId(scope.financialYearId, 'finance_financial_year_scope_invalid');
  const academicYearId = assertValidScopeId(scope.academicYearId, 'finance_academic_year_scope_invalid');
  if (!schoolId) {
    throw createPeriodError('finance_school_scope_required', 'برای بررسی ماه مالی، مکتب معتبر باید مشخص باشد.', 400);
  }
  const filter = { monthKey, status: 'closed' };
  if (schoolId) filter.schoolId = schoolId;
  if (financialYearId) filter.financialYearId = financialYearId;
  else if (academicYearId) filter.academicYearId = academicYearId;
  let query = FinanceMonthClose.exists(filter);
  if (scope.session) query = query.session(scope.session);
  return Boolean(await query);
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
  const closed = await isFinanceMonthClosed(scope.dateValue || new Date(), {
    ...scope,
    financialYearId: normalizeId(scope.financialYearId || financialYear?._id),
    academicYearId: normalizeId(scope.academicYearId || financialYear?.academicYearId)
  });
  if (closed) {
    throw createPeriodError('finance_month_closed', 'ماه مالی بسته شده است و تغییر سند مالی در این دوره مجاز نیست.');
  }
  return financialYear;
}

module.exports = {
  assertFinancePeriodWritable,
  createPeriodError,
  isFinanceMonthClosed,
  resolveFinancialYearForScope,
  toMonthKey
};
