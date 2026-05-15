const mongoose = require('mongoose');

const isObjectId = (value = '') => mongoose.Types.ObjectId.isValid(String(value || '').trim());
const normalizeId = (value = '') => String(value || '').trim();

async function getSchoolIdFromClass(classId = '') {
  if (!isObjectId(classId)) return '';
  const SchoolClass = mongoose.model('SchoolClass');
  const item = await SchoolClass.findById(classId).select('schoolId').lean();
  return normalizeId(item?.schoolId);
}

async function getSchoolIdFromAcademicYear(academicYearId = '') {
  if (!isObjectId(academicYearId)) return '';
  const AcademicYear = mongoose.model('AcademicYear');
  const item = await AcademicYear.findById(academicYearId).select('schoolId').lean();
  return normalizeId(item?.schoolId);
}

async function getSchoolIdFromMembership(studentMembershipId = '') {
  if (!isObjectId(studentMembershipId)) return '';
  const StudentMembership = mongoose.model('StudentMembership');
  const item = await StudentMembership.findById(studentMembershipId)
    .select('schoolId classId academicYearId academicYear')
    .lean();
  if (!item) return '';
  return normalizeId(item.schoolId)
    || getSchoolIdFromClass(item.classId)
    || getSchoolIdFromAcademicYear(item.academicYearId || item.academicYear);
}

async function getSchoolIdFromStudent(studentId = '') {
  if (!isObjectId(studentId)) return '';
  const AfghanStudent = mongoose.model('AfghanStudent');
  const item = await AfghanStudent.findById(studentId).select('academicInfo.currentSchool').lean();
  return normalizeId(item?.academicInfo?.currentSchool);
}

async function getSchoolIdFromBill(billId = '') {
  if (!isObjectId(billId)) return '';
  const FinanceBill = mongoose.model('FinanceBill');
  const item = await FinanceBill.findById(billId)
    .select('schoolId studentMembershipId studentId classId academicYearId')
    .lean();
  if (!item) return '';
  return resolveSchoolOwnership(item);
}

async function getSchoolIdFromOrder(orderId = '') {
  if (!isObjectId(orderId)) return '';
  const FeeOrder = mongoose.model('FeeOrder');
  const item = await FeeOrder.findById(orderId)
    .select('schoolId sourceBillId studentMembershipId studentId classId academicYearId')
    .lean();
  if (!item) return '';
  return resolveSchoolOwnership(item);
}

async function resolveSchoolOwnership(source = {}) {
  const directSchoolId = normalizeId(source.schoolId);
  if (isObjectId(directSchoolId)) return directSchoolId;

  const classSchoolId = await getSchoolIdFromClass(source.classId);
  const yearSchoolId = await getSchoolIdFromAcademicYear(source.academicYearId || source.academicYear);
  if (classSchoolId && yearSchoolId && classSchoolId !== yearSchoolId) {
    const error = new Error('school_scope_mismatch');
    error.classSchoolId = classSchoolId;
    error.yearSchoolId = yearSchoolId;
    throw error;
  }
  if (classSchoolId) return classSchoolId;
  if (yearSchoolId) return yearSchoolId;

  const membershipSchoolId = await getSchoolIdFromMembership(source.studentMembershipId);
  if (membershipSchoolId) return membershipSchoolId;

  const studentSchoolId = await getSchoolIdFromStudent(source.studentId);
  if (studentSchoolId) return studentSchoolId;

  const billSchoolId = await getSchoolIdFromBill(source.bill || source.sourceBillId);
  if (billSchoolId) return billSchoolId;

  const orderSchoolId = await getSchoolIdFromOrder(source.feeOrderId);
  if (orderSchoolId) return orderSchoolId;

  return '';
}

async function applySchoolOwnership(doc) {
  if (!doc) return;
  let schoolId = normalizeId(doc.schoolId);
  try {
    const classSchoolId = await getSchoolIdFromClass(doc.classId);
    const yearSchoolId = await getSchoolIdFromAcademicYear(doc.academicYearId || doc.academicYear);
    const linkedSchoolIds = [classSchoolId, yearSchoolId].filter(Boolean);
    if (linkedSchoolIds.length > 1 && new Set(linkedSchoolIds).size > 1) {
      throw new Error('school_scope_mismatch');
    }
    if (schoolId && linkedSchoolIds.length && !linkedSchoolIds.includes(schoolId)) {
      throw new Error('school_scope_mismatch');
    }
    if (!schoolId) schoolId = await resolveSchoolOwnership(doc);
  } catch (error) {
    if (error?.message === 'school_scope_mismatch' && typeof doc.invalidate === 'function') {
      doc.invalidate('schoolId', 'صنف و سال تعلیمی مربوط دو مکتب متفاوت است.');
      return;
    }
    throw error;
  }
  if (schoolId) doc.schoolId = schoolId;
}

module.exports = {
  applySchoolOwnership,
  resolveSchoolOwnership,
  getSchoolIdFromClass,
  getSchoolIdFromAcademicYear,
  getSchoolIdFromMembership
};
