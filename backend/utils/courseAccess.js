const Schedule = require('../models/Schedule');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const TeacherAssignment = require('../models/TeacherAssignment');
const User = require('../models/User');
const {
  ACTIVE_MEMBERSHIP_STATUSES,
  listCourseMemberships,
  listStudentMemberships
} = require('./studentMembershipLookup');

const instructorRoles = ['instructor', 'teacher', 'professor'];
const ACTIVE_TEACHER_ASSIGNMENT_STATUSES = ['active', 'planned', 'pending'];

const normalizeIds = (items = []) => items
  .map((item) => item?._id || item)
  .filter(Boolean)
  .map((item) => String(item));

const dedupeIds = (items = []) => Array.from(new Set(normalizeIds(items)));

const resolveUserId = (user = {}) => user?.id || user?._id || null;

const findStudentCourseIds = async (studentId, options = {}) => {
  if (!studentId) return [];

  const membershipRows = await listStudentMemberships({
    studentUserId: studentId,
    statuses: options.statuses || ACTIVE_MEMBERSHIP_STATUSES,
    currentOnly: options.currentOnly !== false
  });

  return dedupeIds(membershipRows.map((item) => item.course));
};

const hasStudentCourseAccess = async (studentId, courseId, options = {}) => {
  if (!studentId || !courseId) return false;
  const ids = await findStudentCourseIds(studentId, options);
  return ids.includes(String(courseId));
};

const findCourseStudentIds = async (courseId, options = {}) => {
  if (!courseId) return [];

  const membershipRows = await listCourseMemberships({
    courseId,
    academicYearId: options.academicYearId || null,
    academicYear: options.academicYear || '',
    statuses: options.statuses || ACTIVE_MEMBERSHIP_STATUSES,
    currentOnly: options.currentOnly !== false
  });

  return dedupeIds(membershipRows.map((item) => item.student));
};

const findCourseStudents = async (courseId, options = {}) => {
  const ids = await findCourseStudentIds(courseId, options);
  if (!ids.length) return [];

  const select = options.select || 'name email grade role';
  const students = await User.find({ _id: { $in: ids } }).select(select);
  const studentMap = new Map(students.map((item) => [String(item._id), item]));
  return ids.map((id) => studentMap.get(String(id))).filter(Boolean);
};

const findInstructorCourseIds = async (instructorId) => {
  if (!instructorId) return [];

  const [scheduleCourseIds, homeroomCourseIds, assignmentRows] = await Promise.all([
    Schedule.distinct('course', { instructor: instructorId }),
    Course.distinct('_id', { homeroomInstructor: instructorId, isActive: true }),
    TeacherAssignment.find({
      teacherUserId: instructorId,
      status: { $in: ACTIVE_TEACHER_ASSIGNMENT_STATUSES }
    }).select('classId legacyCourseId')
  ]);

  const assignmentClassIds = dedupeIds(assignmentRows.map((item) => item.classId));
  const assignmentCourseIds = dedupeIds(assignmentRows.map((item) => item.legacyCourseId));

  if (!assignmentClassIds.length) {
    return dedupeIds([
      ...scheduleCourseIds,
      ...homeroomCourseIds,
      ...assignmentCourseIds
    ]);
  }

  const [classLegacyCourseIds, classLinkedCourseIds] = await Promise.all([
    SchoolClass.distinct('legacyCourseId', {
      _id: { $in: assignmentClassIds },
      legacyCourseId: { $ne: null }
    }),
    Course.distinct('_id', {
      schoolClassRef: { $in: assignmentClassIds }
    })
  ]);

  return dedupeIds([
    ...scheduleCourseIds,
    ...homeroomCourseIds,
    ...assignmentCourseIds,
    ...classLegacyCourseIds,
    ...classLinkedCourseIds
  ]);
};

const getAccessibleCourseIds = async (user = {}, options = {}) => {
  const userId = resolveUserId(user);
  if (!userId) return [];
  if (user.role === 'admin') return null;

  if (user.role === 'student') {
    return findStudentCourseIds(userId, options);
  }

  if (instructorRoles.includes(user.role)) {
    return findInstructorCourseIds(userId);
  }

  return [];
};

const canAccessCourse = async (user = {}, courseId = '', options = {}) => {
  if (!courseId) return false;
  if (user?.role === 'admin') return true;

  if (user?.role === 'student') {
    return hasStudentCourseAccess(resolveUserId(user), courseId, options);
  }

  const ids = await getAccessibleCourseIds(user, options);
  if (ids === null) return true;

  return ids.includes(String(courseId));
};

const buildAccessibleCourseFilter = async (user = {}, options = {}) => {
  const ids = await getAccessibleCourseIds(user, options);
  if (ids === null) return {};
  if (!ids.length) return { _id: { $in: [] } };
  return { _id: { $in: ids } };
};

const findAccessibleCourses = async (user = {}, select = 'title category', options = {}) => {
  const filter = await buildAccessibleCourseFilter(user, options);
  return Course.find(filter).select(select).sort({ title: 1 });
};

module.exports = {
  instructorRoles,
  normalizeIds,
  resolveUserId,
  findStudentCourseIds,
  hasStudentCourseAccess,
  findCourseStudentIds,
  findCourseStudents,
  getAccessibleCourseIds,
  canAccessCourse,
  buildAccessibleCourseFilter,
  findAccessibleCourses
};
