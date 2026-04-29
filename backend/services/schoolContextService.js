const mongoose = require('mongoose');
const AfghanSchool = require('../models/AfghanSchool');
require('../models/School');

const DEFAULT_SCHOOL_ID = 'default-school-id';
const LEGACY_SINGLE_SCHOOL_ID = '000000000000000000000001';

function normalizeId(value = '') {
  return String(value || '').trim();
}

function isValidObjectId(value = '') {
  return mongoose.Types.ObjectId.isValid(normalizeId(value));
}

function isPlaceholderSchoolId(value = '') {
  const normalized = normalizeId(value);
  return !normalized || normalized === DEFAULT_SCHOOL_ID || normalized === LEGACY_SINGLE_SCHOOL_ID;
}

function unique(values = []) {
  return [...new Set(values.map(normalizeId).filter(Boolean))];
}

function getRequestSchoolCandidates(req = {}, payload = {}) {
  return unique([
    payload.schoolId,
    payload.currentSchool,
    payload?.academicInfo?.currentSchool,
    payload?.employmentInfo?.currentSchool,
    req.params?.schoolId,
    req.query?.schoolId,
    req.headers?.['x-school-id'],
    req.user?.schoolId,
    req.user?.school_id,
    req.user?.activeSchoolId
  ]);
}

async function findSchoolById(value = '') {
  const normalized = normalizeId(value);
  if (!isValidObjectId(normalized) || isPlaceholderSchoolId(normalized)) return null;
  return AfghanSchool.findById(normalized);
}

async function listActiveSchools(limit = 25) {
  return AfghanSchool.find({ status: 'active' })
    .select('name nameDari schoolCode province district status')
    .sort({ createdAt: -1 })
    .limit(limit);
}

async function resolveActiveSchool(req = {}, options = {}) {
  const { payload = {}, allowSingleFallback = true } = options;
  const candidates = getRequestSchoolCandidates(req, payload);

  for (const candidate of candidates) {
    const school = await findSchoolById(candidate);
    if (school) {
      return {
        school,
        schoolId: String(school._id),
        source: 'candidate',
        requiresSelection: false
      };
    }
  }

  if (allowSingleFallback) {
    const activeSchools = await listActiveSchools(2);
    if (activeSchools.length === 1) {
      return {
        school: activeSchools[0],
        schoolId: String(activeSchools[0]._id),
        source: 'single-active-school',
        requiresSelection: false
      };
    }
  }

  return {
    school: null,
    schoolId: '',
    source: '',
    requiresSelection: true,
    candidates
  };
}

async function requireWritableSchool(req = {}, payload = {}) {
  const resolved = await resolveActiveSchool(req, { payload, allowSingleFallback: true });
  if (resolved.schoolId) return resolved;

  const error = new Error('school_context_required');
  error.statusCode = 400;
  error.messageDari = 'اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید.';
  throw error;
}

function writeSchoolContextHeaders(res, schoolId = '') {
  if (!res || !schoolId) return;
  res.set('X-School-Id', schoolId);
}

module.exports = {
  DEFAULT_SCHOOL_ID,
  LEGACY_SINGLE_SCHOOL_ID,
  isPlaceholderSchoolId,
  isValidObjectId,
  normalizeId,
  resolveActiveSchool,
  requireWritableSchool,
  writeSchoolContextHeaders,
  listActiveSchools
};
