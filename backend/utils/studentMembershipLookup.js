const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const Course = require('../models/Course');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const { deriveLinkScope } = require('./financeLinkScope');

const ACTIVE_MEMBERSHIP_STATUSES = Object.freeze(['active', 'transferred_in', 'suspended']);

const trimText = (value = '') => String(value || '').trim();

const normalizeStatuses = (statuses = ACTIVE_MEMBERSHIP_STATUSES) => {
  if (!Array.isArray(statuses) || !statuses.length) return [];
  return Array.from(new Set(statuses.map((item) => trimText(item).toLowerCase()).filter(Boolean)));
};

const stableSort = (query) => query.sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1, _id: 1 });

async function resolveAcademicYearId(value = '') {
  const normalized = trimText(value);
  if (!normalized) return null;
  if (mongoose.isValidObjectId(normalized)) return normalized;
  const row = await AcademicYear.findOne({
    $or: [{ code: normalized }, { title: normalized }]
  }).select('_id').lean();
  return row?._id || null;
}

async function resolveStudentCoreId(studentUserId = '') {
  const normalized = trimText(studentUserId);
  if (!normalized) return null;
  const row = await StudentCore.findOne({ userId: normalized }).select('_id').lean();
  return row?._id || null;
}

async function resolveCourseContext(courseId = '') {
  const normalized = trimText(courseId);
  if (!normalized || !mongoose.isValidObjectId(normalized)) {
    return {
      courseId: normalized || null,
      classId: null,
      academicYearId: null,
      kind: ''
    };
  }

  const row = await Course.findById(normalized)
    .select('kind schoolClassRef academicYearRef')
    .lean();

  return {
    courseId: row?._id || normalized,
    classId: row?.schoolClassRef || null,
    academicYearId: row?.academicYearRef || null,
    kind: trimText(row?.kind)
  };
}

function buildMembershipFilter({
  studentUserId = '',
  courseId = '',
  classId = '',
  academicYearId = null,
  statuses = null,
  currentOnly = null
} = {}) {
  const filter = {};
  const normalizedStudentId = trimText(studentUserId);
  const normalizedCourseId = trimText(courseId);
  const normalizedClassId = trimText(classId);
  const normalizedStatuses = statuses == null ? [] : normalizeStatuses(statuses);

  if (normalizedStudentId) filter.student = normalizedStudentId;
  if (normalizedCourseId) filter.course = normalizedCourseId;
  if (normalizedClassId) filter.classId = normalizedClassId;
  if (academicYearId) {
    filter.$or = [{ academicYearId }, { academicYear: academicYearId }];
  }
  if (normalizedStatuses.length) {
    filter.status = { $in: normalizedStatuses };
  }
  if (currentOnly === true) {
    filter.isCurrent = true;
  }

  return filter;
}

async function queryMemberships(options = {}) {
  return stableSort(StudentMembership.find(buildMembershipFilter(options)));
}

async function resolveStudentMembership({
  studentUserId = '',
  courseId = '',
  classId = '',
  academicYearId = null,
  academicYear = '',
  statuses = null
} = {}) {
  const courseContext = courseId ? await resolveCourseContext(courseId) : {
    courseId: trimText(courseId) || null,
    classId: classId || null,
    academicYearId: null,
    kind: ''
  };

  const resolvedAcademicYearId = academicYearId
    || await resolveAcademicYearId(academicYear)
    || courseContext.academicYearId
    || null;
  const resolvedClassId = classId || courseContext.classId || null;

  const attempts = [
    { currentOnly: true, academicYearId: resolvedAcademicYearId },
    { currentOnly: false, academicYearId: resolvedAcademicYearId },
    { currentOnly: true, academicYearId: null },
    { currentOnly: false, academicYearId: null }
  ];

  const seen = new Set();
  for (const attempt of attempts) {
    const key = JSON.stringify(attempt);
    if (seen.has(key)) continue;
    seen.add(key);

    const membership = await StudentMembership.findOne(buildMembershipFilter({
      studentUserId,
      courseId,
      classId: resolvedClassId,
      academicYearId: attempt.academicYearId,
      statuses,
      currentOnly: attempt.currentOnly
    })).sort({ isCurrent: -1, enrolledAt: -1, createdAt: -1, _id: 1 });

    if (membership) {
      return membership;
    }
  }

  return null;
}

async function findActiveMembership({ studentUserId = '', courseId = '', classId = '', academicYearId = null, academicYear = '' } = {}) {
  return resolveStudentMembership({
    studentUserId,
    courseId,
    classId,
    academicYearId,
    academicYear,
    statuses: ACTIVE_MEMBERSHIP_STATUSES
  });
}

async function listStudentMemberships({ studentUserId = '', academicYearId = null, academicYear = '', statuses = ACTIVE_MEMBERSHIP_STATUSES, currentOnly = false } = {}) {
  const resolvedAcademicYearId = academicYearId || await resolveAcademicYearId(academicYear);
  return queryMemberships({ studentUserId, academicYearId: resolvedAcademicYearId, statuses, currentOnly });
}

async function listCourseMemberships({ courseId = '', academicYearId = null, academicYear = '', statuses = ACTIVE_MEMBERSHIP_STATUSES, currentOnly = true } = {}) {
  const courseContext = await resolveCourseContext(courseId);
  const resolvedAcademicYearId = academicYearId
    || await resolveAcademicYearId(academicYear)
    || courseContext.academicYearId
    || null;

  return queryMemberships({
    courseId,
    classId: courseContext.classId,
    academicYearId: resolvedAcademicYearId,
    statuses,
    currentOnly
  });
}

async function findStudentMembershipsByYear({ studentUserId = '', academicYearId = null, academicYear = '', statuses = [], currentOnly = false } = {}) {
  const resolvedAcademicYearId = academicYearId || await resolveAcademicYearId(academicYear);
  return queryMemberships({
    studentUserId,
    academicYearId: resolvedAcademicYearId,
    statuses: Array.isArray(statuses) && statuses.length ? statuses : null,
    currentOnly
  });
}

async function findClassMemberships({ classId = '', academicYearId = null, academicYear = '', statuses = ACTIVE_MEMBERSHIP_STATUSES, currentOnly = true } = {}) {
  const resolvedAcademicYearId = academicYearId || await resolveAcademicYearId(academicYear);
  return queryMemberships({ classId, academicYearId: resolvedAcademicYearId, statuses, currentOnly });
}

function buildTransactionMembershipFields(membership = null, fallback = {}) {
  const studentMembershipId = membership?._id || null;
  const classId = membership?.classId || fallback.classId || null;
  return {
    studentMembershipId,
    studentId: membership?.studentId || fallback.studentId || null,
    classId,
    academicYearId: membership?.academicYearId || membership?.academicYear || fallback.academicYearId || null,
    linkScope: deriveLinkScope({
      linkScope: fallback.linkScope || '',
      studentMembershipId,
      classId
    })
  };
}

async function resolveMembershipTransactionLink({
  studentUserId = '',
  courseId = '',
  academicYearId = null,
  academicYear = '',
  statuses = null
} = {}) {
  const [studentId, courseContext, resolvedAcademicYearId] = await Promise.all([
    resolveStudentCoreId(studentUserId),
    resolveCourseContext(courseId),
    academicYearId ? Promise.resolve(academicYearId) : resolveAcademicYearId(academicYear)
  ]);

  const membership = await resolveStudentMembership({
    studentUserId,
    courseId,
    classId: courseContext.classId,
    academicYearId: resolvedAcademicYearId || courseContext.academicYearId || null,
    statuses
  });

  return {
    membership,
    studentId,
    courseContext,
    academicYearId: membership?.academicYearId || membership?.academicYear || resolvedAcademicYearId || courseContext.academicYearId || null,
    linkFields: buildTransactionMembershipFields(membership, {
      studentId,
      classId: courseContext.classId,
      academicYearId: resolvedAcademicYearId || courseContext.academicYearId || null,
      linkScope: courseContext.kind === 'academic_class' ? 'membership' : 'student'
    })
  };
}

module.exports = {
  ACTIVE_MEMBERSHIP_STATUSES,
  buildTransactionMembershipFields,
  findActiveMembership,
  findClassMemberships,
  findStudentMembershipsByYear,
  listCourseMemberships,
  listStudentMemberships,
  normalizeStatuses,
  resolveAcademicYearId,
  resolveCourseContext,
  resolveMembershipTransactionLink,
  resolveStudentCoreId,
  resolveStudentMembership
};
