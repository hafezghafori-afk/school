const express = require('express');
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const EmployeeAttendance = require('../models/EmployeeAttendance');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const StudentProfile = require('../models/StudentProfile');
const AfghanTeacher = require('../models/AfghanTeacher');
const User = require('../models/User');
const { hasStudentCourseAccess } = require('../utils/courseAccess');
const { resolveMembershipTransactionLink } = require('../utils/studentMembershipLookup');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const {
  buildCourseAttendanceSummary,
  buildStudentAttendanceSummary,
  normalizeDay,
  normalizeAttendanceStatus,
  parseAttendanceStatus,
  resolveDateRange,
  resolveWeekRange
} = require('../utils/attendanceReporting');
const {
  buildEmployeeAttendanceCollectionSummary,
  buildEmployeeAttendanceDetailSummary
} = require('../utils/employeeAttendanceReporting');

const router = express.Router();

const membershipAccessOptions = Object.freeze({});
const normalizeEntityId = (value) => String(value || '').trim();
const asObjectIdString = (value) => (mongoose.isValidObjectId(normalizeEntityId(value)) ? normalizeEntityId(value) : '');

const setLegacyRouteHeaders = (res, replacementEndpoint = '') => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('X-Deprecated-Route', 'true');
  if (replacementEndpoint) {
    res.setHeader('X-Replacement-Endpoint', replacementEndpoint);
    res.setHeader('Link', `<${replacementEndpoint}>; rel="successor-version"`);
  }
};

const serializeSchoolClass = (item) => {
  if (!item?._id) return null;
  return {
    _id: item._id,
    id: item._id,
    title: item.title || '',
    code: item.code || '',
    gradeLevel: item.gradeLevel || '',
    section: item.section || '',
    academicYearId: item.academicYearId?._id || item.academicYearId || null
  };
};

async function resolveAttendanceClassReference({ classId = '', courseId = '' } = {}) {
  const normalizedClassId = asObjectIdString(classId);
  const normalizedCourseId = asObjectIdString(courseId);
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId)
      .select('title code gradeLevel section academicYearId legacyCourseId');
    if (!schoolClass) {
      return { error: 'Ø´Ù†Ø§Ø³Ù‡ ØµÙ†Ù Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.' };
    }
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('title category schoolClassRef');
    }
    if (!course) {
      course = await Course.findOne({ schoolClassRef: schoolClass._id }).select('title category schoolClassRef');
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('title category schoolClassRef');
    if (!linkedCourse) {
      return { error: 'Ø´Ù†Ø§Ø³Ù‡ ØµÙ†Ù Ù…Ø¹ØªØ¨Ø± Ù†ÛŒØ³Øª.' };
    }
    if (!course) {
      course = linkedCourse;
    }
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match' };
    }
    if (!schoolClass) {
      if (linkedCourse.schoolClassRef) {
        schoolClass = await SchoolClass.findById(linkedCourse.schoolClassRef)
          .select('title code gradeLevel section academicYearId legacyCourseId');
      }
      if (!schoolClass) {
        schoolClass = await SchoolClass.findOne({ legacyCourseId: linkedCourse._id })
          .select('title code gradeLevel section academicYearId legacyCourseId');
      }
    }
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
}

const buildAttendanceCoursePayload = (scope = {}) => ({
  _id: scope.course?._id || null,
  id: scope.course?._id || null,
  title: scope.course?.title || scope.schoolClass?.title || '',
  category: scope.course?.category || '',
  courseId: scope.courseId || null,
  classId: scope.classId || null,
  schoolClass: serializeSchoolClass(scope.schoolClass)
});

const sanitizeCsv = (value) => {
  const text = String(value == null ? '' : value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const sendCsv = (res, filename, rows) => {
  const csv = rows.map((row) => row.map((cell) => sanitizeCsv(cell)).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.status(200).send(`\uFEFF${csv}`);
};

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const fileSafeSegment = (value, fallback = 'report') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || fallback;
};

const formatStatusLabel = (value) => ({
  present: 'present',
  absent: 'absent',
  sick: 'sick',
  leave: 'leave',
  late: 'sick',
  excused: 'leave'
}[value] || '');

const EMPLOYEE_POSITION_LABELS = Object.freeze({
  teacher: 'استاد',
  principal: 'مدیر',
  vice_principal: 'معاون',
  admin_staff: 'کارمند اداری',
  support_staff: 'کارمند خدماتی',
  instructor: 'استاد',
  school_manager: 'مدیر مکتب',
  academic_manager: 'مدیر تدریسی',
  head_teacher: 'سرمعلم',
  finance_manager: 'مدیر مالی',
  finance_lead: 'مسئول مالی',
  general_president: 'ریاست عمومی',
  admin: 'کارمند'
});

const EMPLOYEE_STATUS_LABELS = Object.freeze({
  active: 'فعال',
  on_leave: 'در رخصتی',
  inactive: 'غیرفعال',
  suspended: 'تعلیق',
  terminated: 'خاتمه یافته',
  retired: 'متقاعد'
});

const normalizeEmail = (value = '') => String(value || '').trim().toLowerCase();

const splitDisplayName = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

const buildLinkedUserRef = (linkedUser = null) => (
  linkedUser ? {
    _id: linkedUser._id || null,
    name: linkedUser.name || '',
    email: linkedUser.email || '',
    role: linkedUser.role || '',
    orgRole: linkedUser.orgRole || '',
    adminLevel: linkedUser.adminLevel || '',
    subject: linkedUser.subject || ''
  } : null
);

const resolveLinkedUserRoleLabel = (linkedUser = null) => {
  if (!linkedUser) return '';
  const adminKey = String(linkedUser.orgRole || linkedUser.adminLevel || '').trim().toLowerCase();
  if (EMPLOYEE_POSITION_LABELS[adminKey]) return EMPLOYEE_POSITION_LABELS[adminKey];

  const roleKey = String(linkedUser.role || '').trim().toLowerCase();
  return EMPLOYEE_POSITION_LABELS[roleKey] || '';
};

const resolveEmployeePositionLabel = (position = '', linkedUser = null) => {
  const normalizedPosition = String(position || '').trim().toLowerCase();
  if (EMPLOYEE_POSITION_LABELS[normalizedPosition]) return EMPLOYEE_POSITION_LABELS[normalizedPosition];
  return resolveLinkedUserRoleLabel(linkedUser) || 'کارمند';
};

const resolveEmployeeStatusLabel = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  return EMPLOYEE_STATUS_LABELS[normalized] || '';
};

const buildEmployeeDisplayName = (teacher = null, linkedUser = null) => {
  const firstName = teacher?.personalInfo?.firstNameDari || teacher?.personalInfo?.firstName || '';
  const lastName = teacher?.personalInfo?.lastNameDari || teacher?.personalInfo?.lastName || '';
  const teacherName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return teacherName || linkedUser?.name || '';
};

function buildEmployeeProfilePayload({ teacher = null, linkedUser = null } = {}) {
  if (!teacher?._id) return null;

  const fallbackNameParts = splitDisplayName(linkedUser?.name || '');
  const firstName = teacher?.personalInfo?.firstNameDari
    || teacher?.personalInfo?.firstName
    || fallbackNameParts.firstName;
  const lastName = teacher?.personalInfo?.lastNameDari
    || teacher?.personalInfo?.lastName
    || fallbackNameParts.lastName;
  const name = [firstName, lastName].filter(Boolean).join(' ').trim() || buildEmployeeDisplayName(teacher, linkedUser);
  const email = teacher?.contactInfo?.email || linkedUser?.email || '';
  const position = teacher?.employmentInfo?.position || '';

  return {
    _id: teacher._id,
    name: name || linkedUser?.name || '',
    firstName: firstName || '',
    lastName: lastName || '',
    fatherName: teacher?.personalInfo?.fatherName || '',
    email,
    employeeId: teacher?.employmentInfo?.employeeId || '',
    position,
    positionLabel: resolveEmployeePositionLabel(position, linkedUser),
    employmentStatus: teacher?.status || '',
    employmentStatusLabel: resolveEmployeeStatusLabel(teacher?.status || ''),
    gender: teacher?.personalInfo?.gender || '',
    linkedUser: buildLinkedUserRef(linkedUser)
  };
}

async function loadEmployeeDirectory() {
  const [teachers, linkedUsers] = await Promise.all([
    AfghanTeacher.find({ status: { $in: ['active', 'on_leave'] } })
      .select(
        'personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName personalInfo.gender '
        + 'contactInfo.email employmentInfo.employeeId employmentInfo.position status'
      )
      .lean(),
    User.find({ role: { $in: ['admin', 'instructor'] }, status: 'active' })
      .select('name email role orgRole adminLevel subject')
      .lean()
  ]);

  const userByEmail = new Map(
    linkedUsers
      .map((item) => [normalizeEmail(item?.email), item])
      .filter(([email]) => email)
  );

  return teachers
    .map((teacher) => {
      const linkedUser = userByEmail.get(normalizeEmail(teacher?.contactInfo?.email)) || null;
      return buildEmployeeProfilePayload({ teacher, linkedUser });
    })
    .filter(Boolean)
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fa'));
}

async function loadApprovedCourseStudents(courseId) {
  const memberships = await StudentMembership.find({
    course: courseId,
    status: { $in: ['active', 'transferred_in', 'suspended'] },
    isCurrent: true
  })
    .populate('student', 'name email grade')
    .populate('studentId', 'admissionNo fullName gender')
    .sort({ enrolledAt: 1, createdAt: 1 });

  if (!memberships.length) return [];

  const studentCoreIds = [...new Set(
    memberships
      .map((item) => String(item?.studentId?._id || item?.studentId || '').trim())
      .filter(Boolean)
  )];

  const profiles = studentCoreIds.length
    ? await StudentProfile.find({ studentId: { $in: studentCoreIds } })
        .select('studentId family.fatherName')
        .lean()
    : [];
  const profileMap = new Map(
    profiles.map((item) => [String(item?.studentId || ''), item])
  );

  const seen = new Set();
  return memberships.reduce((items, membership) => {
    const studentUser = membership?.student;
    const studentId = String(studentUser?._id || '').trim();
    if (!studentId || seen.has(studentId)) return items;
    seen.add(studentId);

    const studentCore = membership?.studentId || null;
    const profile = profileMap.get(String(studentCore?._id || '')) || null;
    items.push({
      _id: studentUser?._id || null,
      name: studentUser?.name || studentCore?.fullName || '',
      email: studentUser?.email || '',
      grade: studentUser?.grade || '',
      admissionNo: studentCore?.admissionNo || '',
      fatherName: profile?.family?.fatherName || '',
      grandfatherName: '',
      gender: studentCore?.gender || ''
    });
    return items;
  }, []);
}

async function getEmployeeCollectionSummaryPayload(query = {}) {
  const range = resolveDateRange(query, { maxSpanDays: 366 });
  if (range.error) {
    throw createHttpError(400, range.error);
  }

  const employees = await loadEmployeeDirectory();
  const records = await EmployeeAttendance.find({
    date: { $gte: range.from, $lte: range.to }
  })
    .select('employee linkedUser date status note createdAt updatedAt position employeeCode')
    .populate(
      'employee',
      'personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName personalInfo.gender '
      + 'contactInfo.email employmentInfo.employeeId employmentInfo.position status'
    )
    .populate('linkedUser', 'name email role orgRole adminLevel subject')
    .sort({ date: 1, createdAt: 1 });

  const hydratedRecords = records.map((record) => {
    const raw = typeof record?.toObject === 'function' ? record.toObject() : record;
    return {
      ...raw,
      employee: buildEmployeeProfilePayload({ teacher: raw.employee, linkedUser: raw.linkedUser }) || {
        _id: raw?.employee?._id || raw?.employee || null,
        name: '',
        firstName: '',
        lastName: '',
        fatherName: '',
        email: '',
        employeeId: raw?.employeeCode || '',
        position: raw?.position || '',
        positionLabel: resolveEmployeePositionLabel(raw?.position || '', raw?.linkedUser || null),
        employmentStatus: '',
        employmentStatusLabel: '',
        gender: '',
        linkedUser: buildLinkedUserRef(raw?.linkedUser || null)
      }
    };
  });

  const report = buildEmployeeAttendanceCollectionSummary({
    employees,
    records: hydratedRecords,
    from: range.from,
    to: range.to
  });

  return {
    range: report.range,
    summary: report.summary,
    employees: report.employees,
    byDate: report.byDate,
    byMonth: report.byMonth
  };
}

async function getEmployeeDetailSummaryPayload(employeeId, query = {}) {
  if (!mongoose.isValidObjectId(employeeId)) {
    throw createHttpError(400, 'شناسه کارمند معتبر نیست.');
  }

  const range = resolveDateRange(query, { maxSpanDays: 366 });
  if (range.error) {
    throw createHttpError(400, range.error);
  }

  const teacher = await AfghanTeacher.findById(employeeId)
    .select(
      'personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName personalInfo.gender '
      + 'contactInfo.email employmentInfo.employeeId employmentInfo.position status'
    )
    .lean();
  if (!teacher) {
    throw createHttpError(404, 'کارمند یافت نشد.');
  }

  const email = normalizeEmail(teacher?.contactInfo?.email);
  const linkedUser = email
    ? await User.findOne({ email, role: { $in: ['admin', 'instructor'] } })
        .select('name email role orgRole adminLevel subject')
        .lean()
    : null;

  const records = await EmployeeAttendance.find({
    employee: employeeId,
    date: { $gte: range.from, $lte: range.to }
  })
    .select('employee linkedUser date status note createdAt updatedAt')
    .sort({ date: -1, createdAt: -1 });

  const report = buildEmployeeAttendanceDetailSummary({
    employee: buildEmployeeProfilePayload({ teacher, linkedUser }),
    records,
    from: range.from,
    to: range.to
  });

  return {
    employee: report.summary.employee,
    range: report.range,
    summary: report.summary,
    recent: report.recent,
    byDate: report.byDate,
    byMonth: report.byMonth
  };
}

async function getCourseSummaryPayload(scopeInput = {}, query = {}) {
  const scope = await resolveAttendanceClassReference(scopeInput);
  if (scope.error) {
    throw createHttpError(400, scope.error);
  }
  if (!scope.courseId || !scope.course) {
    throw createHttpError(404, 'Class was not found.');
  }

  const range = resolveDateRange(query, { maxSpanDays: 366 });
  if (range.error) {
    throw createHttpError(400, range.error);
  }

  const students = await loadApprovedCourseStudents(scope.courseId);
  const records = await Attendance.find({
    course: scope.courseId,
    date: { $gte: range.from, $lte: range.to }
  })
    .select('student date status note createdAt')
    .populate('student', 'name email grade')
    .sort({ date: 1, createdAt: 1 });

  const report = buildCourseAttendanceSummary({
    students,
    records,
    from: range.from,
    to: range.to
  });

  return {
    course: buildAttendanceCoursePayload(scope),
    courseId: scope.courseId || null,
    classId: scope.classId || null,
    schoolClass: serializeSchoolClass(scope.schoolClass),
    range: report.range,
    summary: report.summary,
    students: report.students,
    byDate: report.byDate
  };
}

async function getStudentSummaryPayload(studentId, query = {}) {
  const { classId = '', courseId = '' } = query;

  if (!mongoose.isValidObjectId(studentId)) {
    throw createHttpError(400, 'Invalid student id.');
  }
  if (classId && !mongoose.isValidObjectId(classId)) {
    throw createHttpError(400, 'Invalid class id.');
  }
  if (courseId && !mongoose.isValidObjectId(courseId)) {
    throw createHttpError(400, 'Invalid class id.');
  }

  const range = resolveDateRange(query, { maxSpanDays: 366 });
  if (range.error) {
    throw createHttpError(400, range.error);
  }

  const student = await User.findById(studentId).select('name email grade role');
  if (!student) {
    throw createHttpError(404, 'Student was not found.');
  }
  if (String(student.role || '').trim().toLowerCase() !== 'student') {
    throw createHttpError(400, 'Selected user is not a student.');
  }

  let scope = null;
  if (classId || courseId) {
    scope = await resolveAttendanceClassReference({ classId, courseId });
    if (scope.error) {
      throw createHttpError(400, scope.error);
    }
    if (!scope.courseId || !scope.course) {
      throw createHttpError(404, 'Class was not found.');
    }
  }

  const filter = {
    student: studentId,
    date: { $gte: range.from, $lte: range.to }
  };
  if (scope?.courseId) filter.course = scope.courseId;

  const records = await Attendance.find(filter)
    .select('student course date status note createdAt')
    .populate('course', 'title category')
    .sort({ date: -1, createdAt: -1 });

  const report = buildStudentAttendanceSummary({
    student,
    course: scope ? buildAttendanceCoursePayload(scope) : null,
    records,
    from: range.from,
    to: range.to
  });

  return {
    student: report.summary.student,
    course: report.summary.course,
    courseId: scope?.courseId || null,
    classId: scope?.classId || null,
    schoolClass: serializeSchoolClass(scope?.schoolClass),
    range: report.range,
    summary: report.summary,
    recent: report.recent,
    byDate: report.byDate,
    byCourse: report.byCourse
  };
}

async function sendAttendanceByClassScope(req, res, scopeInput = {}, options = {}) {
  try {
    const scope = await resolveAttendanceClassReference(scopeInput);
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!scope.courseId || !scope.course) {
      return res.status(404).json({ success: false, message: 'Class was not found.' });
    }

    if (options.legacyRoute) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? `/api/attendance/class/${scope.classId}` : '/api/attendance/class/:classId'
      );
    }

    const date = normalizeDay(req.query.date);
    if (!date) {
      return res.status(400).json({ success: false, message: 'Invalid attendance date.' });
    }

    const students = await loadApprovedCourseStudents(scope.courseId);
    const records = await Attendance.find({ course: scope.courseId, date });
    const recordMap = new Map(records.map((record) => [String(record.student), record]));

    const items = students.map((student) => {
      const record = recordMap.get(String(student?._id)) || null;
      return {
        student: student ? {
          _id: student._id,
          name: student.name,
          email: student.email,
          grade: student.grade,
          admissionNo: student.admissionNo || '',
          fatherName: student.fatherName || '',
          grandfatherName: student.grandfatherName || '',
          gender: student.gender || ''
        } : null,
        attendance: record ? {
          _id: record._id,
          status: normalizeAttendanceStatus(record.status),
          note: record.note,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          date: record.date
        } : null
      };
    });

    return res.json({
      success: true,
      course: buildAttendanceCoursePayload(scope),
      courseId: scope.courseId || null,
      classId: scope.classId || null,
      schoolClass: serializeSchoolClass(scope.schoolClass),
      items
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load attendance.' });
  }
}

const buildCourseSummaryCsvRows = (payload = {}) => {
  const rows = [
    ['ReportType', 'Course', 'Category', 'From', 'To', 'AttendanceRate', 'TotalStudents', 'RecordedStudents', 'Present', 'Absent', 'Sick', 'Leave', 'TotalDays'],
    [
      'Summary',
      payload.course?.title || '',
      payload.course?.category || '',
      payload.range?.from || '',
      payload.range?.to || '',
      payload.summary?.attendanceRate || 0,
      payload.summary?.totalStudents || 0,
      payload.summary?.recordedStudents || 0,
      payload.summary?.present || 0,
      payload.summary?.absent || 0,
      payload.summary?.sick || 0,
      payload.summary?.leave || 0,
      payload.summary?.totalDays || 0
    ],
    [],
    ['Student', 'GradeOrEmail', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate', 'LastStatus', 'LastDate']
  ];

  for (const item of payload.students || []) {
    rows.push([
      item.student?.name || '',
      item.student?.grade || item.student?.email || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0,
      formatStatusLabel(item.lastStatus),
      item.lastDate || ''
    ]);
  }

  rows.push([], ['Date', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
  for (const item of payload.byDate || []) {
    rows.push([
      item.date || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0
    ]);
  }

  return rows;
};

router.get('/course/:courseId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => (
  sendAttendanceByClassScope(req, res, { courseId: req.params.courseId }, { legacyRoute: true })
));

router.get('/class/:classId', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  return sendAttendanceByClassScope(req, res, { classId: req.params.classId });
});

router.get('/course/:courseId/summary', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getCourseSummaryPayload({ courseId: req.params.courseId }, req.query);
    setLegacyRouteHeaders(
      res,
      payload.classId ? `/api/attendance/class/${payload.classId}/summary` : '/api/attendance/class/:classId/summary'
    );
    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to load class attendance summary.' });
  }
});

router.get('/class/:classId/summary', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getCourseSummaryPayload({ classId: req.params.classId }, req.query);
    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to load class attendance summary.' });
  }
});

router.get('/course/:courseId/export.csv', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getCourseSummaryPayload({ courseId: req.params.courseId }, req.query);
    setLegacyRouteHeaders(
      res,
      payload.classId ? `/api/attendance/class/${payload.classId}/export.csv` : '/api/attendance/class/:classId/export.csv'
    );
    const filename = `attendance-course-${fileSafeSegment(payload.course?.title, 'course')}-${payload.range?.from || 'from'}-${payload.range?.to || 'to'}.csv`;
    return sendCsv(res, filename, buildCourseSummaryCsvRows(payload));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to export class attendance summary.' });
  }
});

router.get('/class/:classId/export.csv', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getCourseSummaryPayload({ classId: req.params.classId }, req.query);
    const filename = `attendance-course-${fileSafeSegment(payload.course?.title, 'course')}-${payload.range?.from || 'from'}-${payload.range?.to || 'to'}.csv`;
    return sendCsv(res, filename, buildCourseSummaryCsvRows(payload));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'Failed to export class attendance summary.' });
  }
});

const buildEmployeeSummaryCsvRows = (payload = {}) => {
  const rows = [
    ['ReportType', 'From', 'To', 'AttendanceRate', 'TotalEmployees', 'RecordedEmployees', 'Present', 'Absent', 'Sick', 'Leave', 'TotalDays', 'TotalMonths'],
    [
      'Summary',
      payload.range?.from || '',
      payload.range?.to || '',
      payload.summary?.attendanceRate || 0,
      payload.summary?.totalEmployees || 0,
      payload.summary?.recordedEmployees || 0,
      payload.summary?.present || 0,
      payload.summary?.absent || 0,
      payload.summary?.sick || 0,
      payload.summary?.leave || 0,
      payload.summary?.totalDays || 0,
      payload.summary?.totalMonths || 0
    ],
    [],
    ['EmployeeId', 'Name', 'FatherName', 'Position', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate', 'LastStatus', 'LastDate']
  ];

  for (const item of payload.employees || []) {
    rows.push([
      item.employee?.employeeId || '',
      item.employee?.name || '',
      item.employee?.fatherName || '',
      item.employee?.positionLabel || item.employee?.position || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0,
      formatStatusLabel(item.lastStatus),
      item.lastDate || ''
    ]);
  }

  rows.push([], ['Month', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
  for (const item of payload.byMonth || []) {
    rows.push([
      item.month || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0
    ]);
  }

  rows.push([], ['Date', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
  for (const item of payload.byDate || []) {
    rows.push([
      item.date || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0
    ]);
  }

  return rows;
};

const buildEmployeeDetailCsvRows = (payload = {}) => {
  const rows = [
    ['ReportType', 'EmployeeId', 'Name', 'FatherName', 'Position', 'From', 'To', 'AttendanceRate', 'TotalRecords', 'CurrentAbsentStreak', 'Present', 'Absent', 'Sick', 'Leave', 'LastStatus', 'LastDate'],
    [
      'Summary',
      payload.employee?.employeeId || '',
      payload.employee?.name || '',
      payload.employee?.fatherName || '',
      payload.employee?.positionLabel || payload.employee?.position || '',
      payload.range?.from || '',
      payload.range?.to || '',
      payload.summary?.attendanceRate || 0,
      payload.summary?.totalRecords || 0,
      payload.summary?.currentAbsentStreak || 0,
      payload.summary?.present || 0,
      payload.summary?.absent || 0,
      payload.summary?.sick || 0,
      payload.summary?.leave || 0,
      formatStatusLabel(payload.summary?.lastStatus),
      payload.summary?.lastDate || ''
    ],
    [],
    ['RecentDate', 'Status', 'Note']
  ];

  for (const item of payload.recent || []) {
    rows.push([
      item.date || '',
      formatStatusLabel(item.status),
      item.note || ''
    ]);
  }

  rows.push([], ['Month', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
  for (const item of payload.byMonth || []) {
    rows.push([
      item.month || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0
    ]);
  }

  rows.push([], ['Date', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
  for (const item of payload.byDate || []) {
    rows.push([
      item.date || '',
      item.present || 0,
      item.absent || 0,
      item.sick || 0,
      item.leave || 0,
      item.attendanceRate || 0
    ]);
  }

  return rows;
};

router.get('/employees', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const date = normalizeDay(req.query?.date);
    if (!date) {
      return res.status(400).json({ success: false, message: 'تاریخ حاضری معتبر نیست.' });
    }

    const employees = await loadEmployeeDirectory();
    const records = await EmployeeAttendance.find({ date })
      .select('employee date status note createdAt updatedAt')
      .lean();
    const recordMap = new Map(records.map((record) => [String(record.employee || ''), record]));

    const items = employees.map((employee) => {
      const record = recordMap.get(String(employee?._id || '')) || null;
      return {
        employee,
        attendance: record ? {
          _id: record._id,
          status: normalizeAttendanceStatus(record.status),
          note: record.note || '',
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          date: record.date
        } : null
      };
    });

    return res.json({
      success: true,
      date: formatLocalDateKey(date),
      items
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت جدول حاضری کارمندان ناموفق بود.' });
  }
});

router.get('/employees/summary', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getEmployeeCollectionSummaryPayload(req.query);
    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'دریافت خلاصه حاضری کارمندان ناموفق بود.' });
  }
});

router.get('/employees/export.csv', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getEmployeeCollectionSummaryPayload(req.query);
    const filename = `attendance-employees-${payload.range?.from || 'from'}-${payload.range?.to || 'to'}.csv`;
    return sendCsv(res, filename, buildEmployeeSummaryCsvRows(payload));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'خروجی CSV حاضری کارمندان ناموفق بود.' });
  }
});

router.get('/employees/:employeeId/summary', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getEmployeeDetailSummaryPayload(req.params.employeeId, req.query);
    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'دریافت گزارش کارمند ناموفق بود.' });
  }
});

router.get('/employees/:employeeId/export.csv', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getEmployeeDetailSummaryPayload(req.params.employeeId, req.query);
    const filename = `attendance-employee-${fileSafeSegment(payload.employee?.name, 'employee')}-${payload.range?.from || 'from'}-${payload.range?.to || 'to'}.csv`;
    return sendCsv(res, filename, buildEmployeeDetailCsvRows(payload));
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'خروجی CSV گزارش کارمند ناموفق بود.' });
  }
});

router.post('/employees/upsert', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { employeeId, date: dateValue, status, note } = req.body || {};
    if (!employeeId || !dateValue) {
      return res.status(400).json({ success: false, message: 'اطلاعات حاضری کارمند کامل نیست.' });
    }
    if (!mongoose.isValidObjectId(employeeId)) {
      return res.status(400).json({ success: false, message: 'شناسه کارمند معتبر نیست.' });
    }

    const teacher = await AfghanTeacher.findById(employeeId)
      .select('contactInfo.email employmentInfo.employeeId employmentInfo.position')
      .lean();
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'کارمند یافت نشد.' });
    }

    const date = normalizeDay(dateValue);
    const normalizedStatus = parseAttendanceStatus(status);
    if (!date || !normalizedStatus) {
      return res.status(400).json({ success: false, message: 'وضعیت یا تاریخ حاضری معتبر نیست.' });
    }

    const linkedUser = normalizeEmail(teacher?.contactInfo?.email)
      ? await User.findOne({ email: normalizeEmail(teacher.contactInfo.email), role: { $in: ['admin', 'instructor'] } })
          .select('_id')
          .lean()
      : null;

    const record = await EmployeeAttendance.findOneAndUpdate(
      { employee: employeeId, date },
      {
        linkedUser: linkedUser?._id || null,
        status: normalizedStatus,
        note: note || '',
        employeeCode: teacher?.employmentInfo?.employeeId || '',
        position: teacher?.employmentInfo?.position || '',
        markedBy: req.user.id
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logActivity({
      req,
      action: 'employee_attendance_upsert',
      targetType: 'EmployeeAttendance',
      targetId: String(record?._id || ''),
      meta: {
        employeeId: String(employeeId || ''),
        date,
        status: normalizedStatus
      }
    });

    return res.json({
      success: true,
      attendance: record
    });
  } catch {
    return res.status(500).json({ success: false, message: 'ذخیره حاضری کارمند ناموفق بود.' });
  }
});

router.get('/student/:studentId/summary', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getStudentSummaryPayload(req.params.studentId, req.query);
    if (normalizeEntityId(req.query?.courseId) && !normalizeEntityId(req.query?.classId)) {
      setLegacyRouteHeaders(
        res,
        payload.classId
          ? `/api/attendance/student/${req.params.studentId}/summary?classId=${payload.classId}`
          : '/api/attendance/student/:studentId/summary?classId=:classId'
      );
    }
    return res.json({
      success: true,
      ...payload
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'خطا در دریافت گزارش فردی حضور و غیاب' });
  }
});

router.get('/student/:studentId/export.csv', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const payload = await getStudentSummaryPayload(req.params.studentId, req.query);
    if (normalizeEntityId(req.query?.courseId) && !normalizeEntityId(req.query?.classId)) {
      setLegacyRouteHeaders(
        res,
        payload.classId
          ? `/api/attendance/student/${req.params.studentId}/export.csv?classId=${payload.classId}`
          : '/api/attendance/student/:studentId/export.csv?classId=:classId'
      );
    }
    const rows = [
      ['ReportType', 'Student', 'Grade', 'Course', 'From', 'To', 'AttendanceRate', 'TotalRecords', 'CurrentAbsentStreak', 'Present', 'Absent', 'Sick', 'Leave', 'LastStatus', 'LastDate'],
      [
        'Summary',
        payload.student?.name || '',
        payload.student?.grade || '',
        payload.course?.title || '',
        payload.range?.from || '',
        payload.range?.to || '',
        payload.summary?.attendanceRate || 0,
        payload.summary?.totalRecords || 0,
        payload.summary?.currentAbsentStreak || 0,
        payload.summary?.present || 0,
        payload.summary?.absent || 0,
        payload.summary?.sick || 0,
        payload.summary?.leave || 0,
        formatStatusLabel(payload.summary?.lastStatus),
        payload.summary?.lastDate || ''
      ],
      [],
      ['RecentDate', 'Status', 'Course', 'Note']
    ];

    for (const item of payload.recent || []) {
      rows.push([
        item.date || '',
        formatStatusLabel(item.status),
        item.course?.title || '',
        item.note || ''
      ]);
    }

    rows.push([], ['Course', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
    for (const item of payload.byCourse || []) {
      rows.push([
        item.course?.title || '',
        item.present || 0,
        item.absent || 0,
        item.sick || 0,
        item.leave || 0,
        item.attendanceRate || 0
      ]);
    }

    rows.push([], ['Date', 'Present', 'Absent', 'Sick', 'Leave', 'AttendanceRate']);
    for (const item of payload.byDate || []) {
      rows.push([
        item.date || '',
        item.present || 0,
        item.absent || 0,
        item.sick || 0,
        item.leave || 0,
        item.attendanceRate || 0
      ]);
    }

    const filename = `attendance-student-${fileSafeSegment(payload.student?.name, 'student')}-${payload.range?.from || 'from'}-${payload.range?.to || 'to'}.csv`;
    return sendCsv(res, filename, rows);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: 'خطا در خروجی CSV گزارش فردی' });
  }
});

// ثبت/ویرایش حضور و غیاب (مدیر/مدرس)
router.post('/upsert', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const { studentId, classId = '', courseId = '', date: dateValue, status, note } = req.body;
    if (!studentId || (!classId && !courseId) || !dateValue) {
      return res.status(400).json({ success: false, message: 'Attendance payload is incomplete.' });
    }

    const scope = await resolveAttendanceClassReference({ classId, courseId });
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!scope.courseId || !scope.course) {
      return res.status(400).json({ success: false, message: 'Class is invalid.' });
    }
    if (normalizeEntityId(courseId) && !normalizeEntityId(classId)) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? '/api/attendance/upsert (send classId)' : '/api/attendance/upsert'
      );
    }

    const date = normalizeDay(dateValue);
    const normalizedStatus = parseAttendanceStatus(status);
    if (!date || !normalizedStatus) {
      return res.status(400).json({ success: false, message: 'Status or date is invalid.' });
    }
    const hasAccess = await hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions);
    if (!hasAccess) {
      return res.status(400).json({ success: false, message: 'Student is not enrolled in this class.' });
    }

    const membershipLink = await resolveMembershipTransactionLink({
      studentUserId: studentId,
      courseId: scope.courseId,
      statuses: ['active', 'transferred_in', 'suspended']
    });
    if (!membershipLink.membership) {
      return res.status(400).json({ success: false, message: 'Active membership was not found for this attendance record.' });
    }

    const record = await Attendance.findOneAndUpdate(
      { student: studentId, course: scope.courseId, date },
      {
        studentId: membershipLink.linkFields.studentId,
        studentMembershipId: membershipLink.linkFields.studentMembershipId,
        classId: membershipLink.linkFields.classId || scope.classId || null,
        academicYearId: membershipLink.linkFields.academicYearId,
        status: normalizedStatus,
        note: note || '',
        markedBy: req.user.id
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    await logActivity({
      req,
      action: 'attendance_upsert',
      targetType: 'Attendance',
      targetId: String(record?._id || ''),
      meta: {
        studentId: String(studentId || ''),
        studentMembershipId: String(membershipLink.linkFields.studentMembershipId || ''),
        classId: scope.classId || '',
        courseId: scope.courseId || '',
        date,
        status: normalizedStatus,
        legacyCourseScope: Boolean(normalizeEntityId(courseId) && !normalizeEntityId(classId))
      }
    });

    return res.json({
      success: true,
      courseId: scope.courseId || null,
      classId: scope.classId || null,
      attendance: record
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to save attendance.' });
  }
});

router.get('/my/weekly', requireAuth, requireRole(['student']), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { classId = '', courseId = '' } = req.query;

    if (classId && !mongoose.isValidObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class id.' });
    }
    if (courseId && !mongoose.isValidObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid class id.' });
    }

    const range = resolveWeekRange(req.query);
    if (range.error) {
      return res.status(400).json({ success: false, message: range.error });
    }

    const student = await User.findById(studentId).select('name email grade');
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student was not found.' });
    }

    let scope = null;
    if (classId || courseId) {
      scope = await resolveAttendanceClassReference({ classId, courseId });
      if (scope.error) {
        return res.status(400).json({ success: false, message: scope.error });
      }
      if (!scope.courseId || !scope.course) {
        return res.status(404).json({ success: false, message: 'Class was not found.' });
      }

      const hasAccess = await hasStudentCourseAccess(studentId, scope.courseId, membershipAccessOptions);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Student does not have access to this class.' });
      }
    }
    if (normalizeEntityId(courseId) && !normalizeEntityId(classId)) {
      setLegacyRouteHeaders(
        res,
        scope?.classId ? `/api/attendance/my/weekly?classId=${scope.classId}` : '/api/attendance/my/weekly?classId=:classId'
      );
    }

    const filter = {
      student: studentId,
      date: { $gte: range.start, $lte: range.end }
    };
    if (scope?.courseId) filter.course = scope.courseId;

    const records = await Attendance.find(filter)
      .select('student course date status note createdAt')
      .populate('course', 'title category')
      .sort({ date: -1, createdAt: -1 });

    const report = buildStudentAttendanceSummary({
      student,
      course: scope ? buildAttendanceCoursePayload(scope) : null,
      records,
      from: range.start,
      to: range.end,
      recentLimit: 14
    });

    return res.json({
      success: true,
      student: report.summary.student,
      course: report.summary.course,
      courseId: scope?.courseId || null,
      classId: scope?.classId || null,
      schoolClass: serializeSchoolClass(scope?.schoolClass),
      week: {
        anchor: range.anchorKey,
        start: range.startKey,
        end: range.endKey
      },
      summary: report.summary,
      recent: report.recent,
      byDate: report.byDate,
      byCourse: report.byCourse
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load weekly attendance.' });
  }
});

router.get('/my', requireAuth, async (req, res) => {
  try {
    const studentId = req.user.id;
    const { classId = '', courseId = '' } = req.query;
    const filter = { student: studentId };

    let scope = null;
    if (classId || courseId) {
      scope = await resolveAttendanceClassReference({ classId, courseId });
      if (scope.error) {
        return res.status(400).json({ success: false, message: scope.error });
      }
      if (!scope.courseId || !scope.course) {
        return res.status(404).json({ success: false, message: 'Class was not found.' });
      }
      filter.course = scope.courseId;
    }
    if (normalizeEntityId(courseId) && !normalizeEntityId(classId)) {
      setLegacyRouteHeaders(
        res,
        scope?.classId ? `/api/attendance/my?classId=${scope.classId}` : '/api/attendance/my?classId=:classId'
      );
    }

    if (req.query.from || req.query.to) {
      const range = resolveDateRange(req.query, { maxSpanDays: 366 });
      if (range.error) {
        return res.status(400).json({ success: false, message: range.error });
      }
      filter.date = {
        $gte: range.from,
        $lte: range.to
      };
    }

    const items = await Attendance.find(filter)
      .populate('course', 'title category')
      .sort({ date: -1 });

    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load attendance.' });
  }
});

async function sendWeeklyClassAttendance(req, res, scopeInput = {}, options = {}) {
  try {
    const scope = await resolveAttendanceClassReference(scopeInput);
    if (scope.error) {
      return res.status(400).json({ success: false, message: scope.error });
    }
    if (!scope.courseId || !scope.course) {
      return res.status(404).json({ success: false, message: 'Class was not found.' });
    }
    if (options.legacyRoute) {
      setLegacyRouteHeaders(
        res,
        scope.classId ? `/api/attendance/class/${scope.classId}/weekly` : '/api/attendance/class/:classId/weekly'
      );
    }

    const range = resolveWeekRange(req.query);
    if (range.error) {
      return res.status(400).json({ success: false, message: range.error });
    }

    const students = await loadApprovedCourseStudents(scope.courseId);
    const records = await Attendance.find({
      course: scope.courseId,
      date: { $gte: range.start, $lte: range.end }
    })
      .select('student date status note createdAt')
      .populate('student', 'name email grade')
      .sort({ date: 1, createdAt: 1 });

    const report = buildCourseAttendanceSummary({
      students,
      records,
      from: range.start,
      to: range.end
    });

    return res.json({
      success: true,
      course: buildAttendanceCoursePayload(scope),
      courseId: scope.courseId || null,
      classId: scope.classId || null,
      schoolClass: serializeSchoolClass(scope.schoolClass),
      week: {
        anchor: range.anchorKey,
        start: range.startKey,
        end: range.endKey
      },
      summary: report.summary,
      students: report.students,
      byDate: report.byDate
    });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load weekly attendance summary.' });
  }
}

router.get('/course/:courseId/weekly', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => (
  sendWeeklyClassAttendance(req, res, { courseId: req.params.courseId }, { legacyRoute: true })
));

router.get('/class/:classId/weekly', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  return sendWeeklyClassAttendance(req, res, { classId: req.params.classId });
});

module.exports = router;
