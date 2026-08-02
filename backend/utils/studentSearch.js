const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalizeStudentSearchText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ۀة]/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildStudentSearchText(student = {}, extraValues = []) {
  const values = [
    student?.name,
    student?.fullName,
    student?.studentName,
    student?.fatherName,
    student?.email,
    student?.phone,
    student?.asasNumber,
    student?.admissionNo,
    student?.studentCode,
    student?.studentIdentifier,
    student?.registrationId,
    student?.nationalId,
    student?.identification?.tazkiraNumber,
    student?.personalInfo?.firstName,
    student?.personalInfo?.lastName,
    student?.personalInfo?.firstNameDari,
    student?.personalInfo?.lastNameDari,
    student?.personalInfo?.fatherName,
    student?.contactInfo?.phone,
    student?.contactInfo?.mobile,
    student?.contactInfo?.email,
    ...extraValues
  ];
  return normalizeStudentSearchText(values.filter(Boolean).join(' | '));
}

function studentMatchesSearch(student = {}, query = '', extraValues = []) {
  const normalizedQuery = normalizeStudentSearchText(query);
  if (!normalizedQuery) return true;
  const haystack = buildStudentSearchText(student, extraValues);
  return normalizedQuery.split(' ').filter(Boolean).every((token) => haystack.includes(token));
}

module.exports = {
  buildStudentSearchText,
  normalizeStudentSearchText,
  studentMatchesSearch
};
