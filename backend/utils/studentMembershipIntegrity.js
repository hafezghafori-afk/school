const CURRENT_STUDENT_MEMBERSHIP_STATUSES = Object.freeze([
  'active',
  'pending',
  'suspended',
  'transferred_in'
]);

const normalizeId = (value = '') => String(value?._id || value || '').trim();

const buildConcurrentCurrentMembershipFilter = ({
  schoolId = '',
  studentId = '',
  academicYearId = '',
  excludeMembershipId = '',
  excludeCourseId = ''
} = {}) => {
  const normalizedSchoolId = normalizeId(schoolId);
  const normalizedStudentId = normalizeId(studentId);
  const normalizedAcademicYearId = normalizeId(academicYearId);
  const normalizedMembershipId = normalizeId(excludeMembershipId);
  const normalizedCourseId = normalizeId(excludeCourseId);
  const clauses = [
    { student: normalizedStudentId },
    { isCurrent: true },
    { status: { $in: [...CURRENT_STUDENT_MEMBERSHIP_STATUSES] } }
  ];

  if (normalizedSchoolId) clauses.push({ schoolId: { $in: [normalizedSchoolId, null] } });
  if (normalizedAcademicYearId) {
    clauses.push({
      $or: [
        { academicYearId: normalizedAcademicYearId },
        { academicYear: normalizedAcademicYearId }
      ]
    });
  }
  if (normalizedMembershipId) clauses.push({ _id: { $ne: normalizedMembershipId } });
  if (normalizedCourseId) clauses.push({ course: { $ne: normalizedCourseId } });

  return { $and: clauses };
};

module.exports = {
  CURRENT_STUDENT_MEMBERSHIP_STATUSES,
  buildConcurrentCurrentMembershipFilter,
  normalizeId
};
