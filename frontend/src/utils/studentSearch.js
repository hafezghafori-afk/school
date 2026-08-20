const PERSIAN_DIGITS = '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9';
const ARABIC_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';

export function normalizeStudentSearchText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u064a\u0649]/g, '\u06cc')
    .replace(/\u0643/g, '\u06a9')
    .replace(/[\u06c0\u0629]/g, '\u0647')
    .replace(/[\u0623\u0625\u0622]/g, '\u0627')
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[\u0660-\u0669]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa-AF');
}

function collectPrimitiveValues(value, output, depth = 0, seen = new Set()) {
  if (value === null || value === undefined || depth > 4) return;
  if (['string', 'number', 'bigint'].includes(typeof value)) {
    output.push(String(value));
    return;
  }
  if (typeof value !== 'object' || value instanceof Date || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => collectPrimitiveValues(item, output, depth + 1, seen));
    return;
  }
  Object.values(value).forEach((item) => collectPrimitiveValues(item, output, depth + 1, seen));
}

export function getStudentAsasNumber(student = {}) {
  const candidates = [
    student?.asasNumber,
    student?.admissionNo,
    student?.studentCode,
    student?.studentIdentifier,
    student?.baseNumber,
    student?.registrationId,
    student?.student?.asasNumber,
    student?.student?.admissionNo,
    student?.studentId?.admissionNo,
    student?.studentCore?.admissionNo,
    student?.afghanStudent?.asasNumber,
    student?.afghanStudentId?.asasNumber,
    student?.identity?.admissionNo,
    student?.profile?.identity?.admissionNo
  ];
  return String(candidates.find((value) => String(value || '').trim()) || '').trim();
}

export function buildStudentSearchBlob(student = {}, extraValues = []) {
  const values = [];
  collectPrimitiveValues(student, values);
  collectPrimitiveValues(extraValues, values);
  const asasNumber = getStudentAsasNumber(student);
  if (asasNumber) values.push(asasNumber);
  return normalizeStudentSearchText(values.filter(Boolean).join(' | '));
}

export function studentMatchesSearch(student = {}, query = '', extraValues = []) {
  const normalizedQuery = normalizeStudentSearchText(query);
  if (!normalizedQuery) return true;
  const searchBlob = buildStudentSearchBlob(student, extraValues);
  return normalizedQuery.split(' ').filter(Boolean).every((token) => searchBlob.includes(token));
}

// Two students can share the exact same name - admission number (نمبر اساس)
// is the real, unique identifier, but on its own it's easy to miss in a long
// dropdown/list. Prefixing a plain running serial number (not a stored field -
// just this list's row position) makes same-name rows visibly distinct at a
// glance, and the admission number lets someone confirm which one is which.
// Use this everywhere a student's name is shown in an <option>, list row, or
// table cell, instead of ad-hoc `${student.name}` concatenation.
export function formatStudentDisplayLabel(student = {}, { index = null, name = '', suffix = '' } = {}) {
  const displayName = String(name || student?.fullName || student?.name || student?.studentName || 'شاگرد').trim();
  const asasNumber = getStudentAsasNumber(student);
  const parts = [];
  if (index !== null && index !== undefined && index !== '') parts.push(`${index}.`);
  parts.push(displayName);
  if (asasNumber) parts.push(`(اساس: ${asasNumber})`);
  if (suffix) parts.push(`- ${suffix}`);
  return parts.join(' ');
}
