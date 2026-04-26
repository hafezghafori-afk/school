const AcademicYear = require('../models/AcademicYear');
const FinancialYear = require('../models/FinancialYear');
const SchoolClass = require('../models/SchoolClass');
const { endOfDay, startOfDay, toDate } = require('./financialPeriodService');

const DEFAULT_SINGLE_SCHOOL_ID = '000000000000000000000001';

function assertFinancialYearDates({ startDate = null, endDate = null } = {}) {
  const from = startOfDay(startDate);
  const to = endOfDay(endDate);
  if (!from || !to) {
    const error = new Error('finance_financial_year_invalid_dates');
    error.statusCode = 400;
    throw error;
  }
  if (from > to) {
    const error = new Error('finance_financial_year_invalid_range');
    error.statusCode = 400;
    throw error;
  }
  return { startDate: from, endDate: to };
}

async function inferSchoolIdForAcademicYear(academicYear) {
  if (!academicYear?._id) return '';
  if (academicYear.schoolId) return String(academicYear.schoolId);

  const linkedClass = await SchoolClass.findOne({
    academicYearId: academicYear._id,
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId');
  if (linkedClass?.schoolId) return String(linkedClass.schoolId);

  const knownAcademicYearSchoolIds = (await AcademicYear.find({
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId')).map((item) => String(item.schoolId || '')).filter(Boolean);
  const uniqueAcademicYearSchoolIds = [...new Set(knownAcademicYearSchoolIds)];
  if (uniqueAcademicYearSchoolIds.length === 1) return uniqueAcademicYearSchoolIds[0];

  const knownClassSchoolIds = (await SchoolClass.find({
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId')).map((item) => String(item.schoolId || '')).filter(Boolean);
  const uniqueClassSchoolIds = [...new Set(knownClassSchoolIds)];
  if (uniqueClassSchoolIds.length === 1) return uniqueClassSchoolIds[0];

  const knownFinancialYearSchoolIds = (await FinancialYear.find({
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId')).map((item) => String(item.schoolId || '')).filter(Boolean);
  const uniqueFinancialYearSchoolIds = [...new Set(knownFinancialYearSchoolIds)];
  if (uniqueFinancialYearSchoolIds.length === 1) return uniqueFinancialYearSchoolIds[0];

  return DEFAULT_SINGLE_SCHOOL_ID;
}

async function resolveAcademicYearFinancialContext(academicYearId = '') {
  if (!academicYearId) {
    const error = new Error('finance_financial_year_academic_year_required');
    error.statusCode = 400;
    throw error;
  }
  const academicYear = await AcademicYear.findById(academicYearId);
  if (!academicYear) {
    const error = new Error('finance_financial_year_academic_year_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (!academicYear.schoolId) {
    const inferredSchoolId = await inferSchoolIdForAcademicYear(academicYear);
    if (!inferredSchoolId) {
      const error = new Error('finance_financial_year_academic_year_missing_school');
      error.statusCode = 400;
      throw error;
    }

    academicYear.schoolId = inferredSchoolId;
    await AcademicYear.updateOne(
      { _id: academicYear._id, $or: [{ schoolId: { $exists: false } }, { schoolId: null }] },
      { $set: { schoolId: inferredSchoolId } }
    );
  }
  return academicYear;
}

async function ensureFinancialYearUniqueness({
  schoolId = '',
  academicYearId = '',
  title = '',
  code = '',
  excludeId = ''
} = {}) {
  const normalizedTitle = String(title || '').trim();
  const normalizedCode = String(code || '').trim();
  const querySuffix = excludeId ? { _id: { $ne: excludeId } } : {};

  if (academicYearId) {
    const exists = await FinancialYear.exists({
      schoolId,
      academicYearId,
      ...querySuffix
    });
    if (exists) {
      const error = new Error('finance_financial_year_duplicate_academic_year');
      error.statusCode = 409;
      throw error;
    }
  }

  if (normalizedTitle) {
    const exists = await FinancialYear.exists({
      schoolId,
      title: normalizedTitle,
      ...querySuffix
    });
    if (exists) {
      const error = new Error('finance_financial_year_duplicate_title');
      error.statusCode = 409;
      throw error;
    }
  }

  if (normalizedCode) {
    const exists = await FinancialYear.exists({
      schoolId,
      code: normalizedCode,
      ...querySuffix
    });
    if (exists) {
      const error = new Error('finance_financial_year_duplicate_code');
      error.statusCode = 409;
      throw error;
    }
  }
}

async function ensureFinancialYearNoOverlap({ schoolId = '', startDate = null, endDate = null, excludeId = '' } = {}) {
  const from = startOfDay(startDate);
  const to = endOfDay(endDate);
  const query = {
    schoolId,
    status: { $ne: 'archived' },
    startDate: { $lte: to },
    endDate: { $gte: from }
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const exists = await FinancialYear.exists(query);
  if (exists) {
    const error = new Error('finance_financial_year_overlap');
    error.statusCode = 409;
    throw error;
  }
}

async function ensureSingleActiveFinancialYear({ schoolId = '', excludeId = '' } = {}) {
  const query = {
    schoolId,
    isActive: true
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const exists = await FinancialYear.exists(query);
  if (exists) {
    const error = new Error('finance_financial_year_active_conflict');
    error.statusCode = 409;
    throw error;
  }
}

function assertFinancialYearWritable(financialYear) {
  if (!financialYear) {
    const error = new Error('finance_financial_year_not_found');
    error.statusCode = 404;
    throw error;
  }
  if (financialYear.isClosed || financialYear.status === 'closed') {
    const error = new Error('finance_financial_year_closed');
    error.statusCode = 409;
    throw error;
  }
}

function assertDateWithinFinancialYear(financialYear, value = null) {
  const date = toDate(value);
  if (!date || !financialYear?.startDate || !financialYear?.endDate) {
    const error = new Error('finance_financial_year_date_out_of_range');
    error.statusCode = 400;
    throw error;
  }
  const from = startOfDay(financialYear.startDate);
  const to = endOfDay(financialYear.endDate);
  if (date < from || date > to) {
    const error = new Error('finance_financial_year_date_out_of_range');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = {
  assertDateWithinFinancialYear,
  assertFinancialYearDates,
  assertFinancialYearWritable,
  ensureFinancialYearNoOverlap,
  ensureFinancialYearUniqueness,
  ensureSingleActiveFinancialYear,
  resolveAcademicYearFinancialContext
};
