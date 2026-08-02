const StudentMembership = require('../models/StudentMembership');

const RE_ENROLLMENT_REQUIRED_STATUSES = Object.freeze([
  'transferred',
  'transferred_out',
  'graduated',
  'dropped',
  'expelled',
  'inactive'
]);

const normalizeId = (value = '') => String(value?._id || value || '').trim();
const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();

function enrollmentEligibilityError(code, message, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function sameMembershipTarget(membership, { courseId = '', classId = '' } = {}) {
  const currentCourseId = normalizeId(membership?.course);
  const currentClassId = normalizeId(membership?.classId);
  const targetCourseId = normalizeId(courseId);
  const targetClassId = normalizeId(classId);
  const courseMatches = !targetCourseId || currentCourseId === targetCourseId;
  const classMatches = !targetClassId || !currentClassId || currentClassId === targetClassId;
  return courseMatches && classMatches;
}

async function inspectRegularEnrollmentEligibility({
  studentId,
  courseId = '',
  classId = '',
  excludeMembershipId = '',
  session = null
} = {}) {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId) {
    throw enrollmentEligibilityError('student_required', 'شاگرد معتبر الزامی است.', 400);
  }

  const currentFilter = { student: normalizedStudentId, isCurrent: true };
  if (normalizeId(excludeMembershipId)) currentFilter._id = { $ne: normalizeId(excludeMembershipId) };
  const currentQuery = StudentMembership.findOne(currentFilter).sort({ updatedAt: -1, createdAt: -1 });
  if (session) currentQuery.session(session);
  const currentMembership = await currentQuery;
  if (currentMembership && !sameMembershipTarget(currentMembership, { courseId, classId })) {
    throw enrollmentEligibilityError(
      'student_class_transfer_requires_lifecycle',
      'این شاگرد عضویت جاری دارد؛ تبدیلی صنف باید از بخش تغییر وضعیت تعلیمی ثبت شود.'
    );
  }
  if (currentMembership) return { eligible: true, currentMembership, latestMembership: currentMembership };

  const latestFilter = { student: normalizedStudentId };
  if (normalizeId(excludeMembershipId)) latestFilter._id = { $ne: normalizeId(excludeMembershipId) };
  const latestQuery = StudentMembership.findOne(latestFilter).sort({ endedAt: -1, leftAt: -1, updatedAt: -1, createdAt: -1 });
  if (session) latestQuery.session(session);
  const latestMembership = await latestQuery;
  if (latestMembership && RE_ENROLLMENT_REQUIRED_STATUSES.includes(normalizeStatus(latestMembership.status))) {
    throw enrollmentEligibilityError(
      'student_re_enrollment_requires_lifecycle',
      'عضویت قبلی این شاگرد پایان یافته است؛ بازگشت فقط از بخش ثبت‌نام مجدد امکان دارد.'
    );
  }

  return { eligible: true, currentMembership: null, latestMembership };
}

module.exports = {
  RE_ENROLLMENT_REQUIRED_STATUSES,
  enrollmentEligibilityError,
  inspectRegularEnrollmentEligibility,
  sameMembershipTarget
};
