const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  class1: '507f191e810c19729de860ec',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb',
  student1: '507f1f77bcf86cd799439011',
  student2: '507f1f77bcf86cd799439012',
  instructor1: '507f1f77bcf86cd799439013',
  admin1: '507f1f77bcf86cd799439014'
};

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', schoolClassRef: IDS.class1 },
  { _id: IDS.course2, title: 'Class Two', category: 'Evening' }
];

const schoolClasses = [
  {
    _id: IDS.class1,
    title: 'Class One',
    code: '10A',
    gradeLevel: '10',
    section: 'A',
    academicYearId: 'year-1',
    legacyCourseId: IDS.course1
  }
];

const students = [
  { _id: IDS.student1, name: 'Student Alpha', email: 'alpha@example.com', grade: '10', role: 'student' },
  { _id: IDS.student2, name: 'Student Beta', email: 'beta@example.com', grade: '10', role: 'student' }
];

const orders = [
  { _id: 'ord-1', user: students[0], course: IDS.course1, status: 'approved' },
  { _id: 'ord-2', user: students[1], course: IDS.course1, status: 'approved' }
];

const attendanceRecords = [
  {
    _id: 'att-1',
    student: students[0],
    course: courses[0],
    date: new Date('2026-03-05T00:00:00.000Z'),
    status: 'late',
    note: 'Traffic delay',
    createdAt: new Date('2026-03-05T08:00:00.000Z')
  },
  {
    _id: 'att-2',
    student: students[1],
    course: courses[0],
    date: new Date('2026-03-05T00:00:00.000Z'),
    status: 'present',
    note: '',
    createdAt: new Date('2026-03-05T08:05:00.000Z')
  },
  {
    _id: 'att-3',
    student: students[0],
    course: courses[0],
    date: new Date('2026-03-06T00:00:00.000Z'),
    status: 'absent',
    note: 'Medical leave',
    createdAt: new Date('2026-03-06T08:00:00.000Z')
  },
  {
    _id: 'att-4',
    student: students[1],
    course: courses[0],
    date: new Date('2026-03-06T00:00:00.000Z'),
    status: 'present',
    note: '',
    createdAt: new Date('2026-03-06T08:03:00.000Z')
  }
];

const activityCalls = [];

class MockQuery {
  constructor(executor) {
    this.executor = executor;
  }

  select() {
    return this;
  }

  populate() {
    return this;
  }

  sort() {
    return this;
  }

  limit() {
    return this;
  }

  exec() {
    return Promise.resolve().then(() => this.executor());
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  finally(handler) {
    return this.exec().finally(handler);
  }
}

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const asComparable = (value) => {
  if (value && typeof value === 'object') {
    if (value._id) return String(value._id);
  }
  return String(value);
};

const matchesRange = (actualValue, expectedValue) => {
  const actualDate = actualValue instanceof Date ? actualValue : new Date(actualValue);
  if (Number.isNaN(actualDate.getTime())) return false;

  if (expectedValue.$gte) {
    const min = expectedValue.$gte instanceof Date ? expectedValue.$gte : new Date(expectedValue.$gte);
    if (actualDate.getTime() < min.getTime()) return false;
  }
  if (expectedValue.$lte) {
    const max = expectedValue.$lte instanceof Date ? expectedValue.$lte : new Date(expectedValue.$lte);
    if (actualDate.getTime() > max.getTime()) return false;
  }
  return true;
};

const matchesFilter = (item, filter = {}) => (
  Object.entries(filter).every(([key, expectedValue]) => {
    const actualValue = item[key];

    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue) && ('$gte' in expectedValue || '$lte' in expectedValue)) {
      return matchesRange(actualValue, expectedValue);
    }

    return asComparable(actualValue) === String(expectedValue);
  })
);

const createQuery = (resolver) => new MockQuery(() => clone(resolver()));

const AttendanceMock = {
  find(filter = {}) {
    return createQuery(() => attendanceRecords.filter((item) => matchesFilter(item, filter)));
  },
  findOneAndUpdate(filter = {}, update = {}) {
    const existing = attendanceRecords.find((item) => matchesFilter(item, filter));
    const nextItem = existing || {
      _id: `att-${attendanceRecords.length + 1}`,
      student: students.find((item) => item._id === filter.student) || null,
      course: courses.find((item) => item._id === filter.course) || null,
      date: filter.date,
      createdAt: new Date('2026-03-06T08:15:00.000Z')
    };

    nextItem.status = update.status || nextItem.status || 'present';
    nextItem.note = update.note || '';
    nextItem.markedBy = update.markedBy || '';
    nextItem.studentId = update.studentId || nextItem.studentId || null;
    nextItem.studentMembershipId = update.studentMembershipId || nextItem.studentMembershipId || null;
    nextItem.classId = update.classId || nextItem.classId || null;
    nextItem.academicYearId = update.academicYearId || nextItem.academicYearId || null;

    if (!existing) {
      attendanceRecords.push(nextItem);
    }

    return Promise.resolve(clone(nextItem));
  }
};

const studentMembershipLookupMock = {
  async resolveMembershipTransactionLink({ studentUserId, courseId }) {
    const studentExists = students.some((item) => String(item._id) === String(studentUserId));
    if (!studentExists || String(courseId) !== IDS.course1) {
      return { membership: null, linkFields: {} };
    }

    return {
      membership: {
        _id: String(studentUserId) === IDS.student1 ? 'mem-1' : 'mem-2'
      },
      linkFields: {
        studentId: studentUserId,
        studentMembershipId: String(studentUserId) === IDS.student1 ? 'mem-1' : 'mem-2',
        classId: IDS.class1,
        academicYearId: 'year-1'
      }
    };
  }
};

const courseAccessMock = {
  async findCourseStudents(courseId) {
    if (String(courseId) !== IDS.course1) return [];
    return clone(students);
  },
  async hasStudentCourseAccess(studentId, courseId) {
    return orders.some((item) => (
      String(item.user?._id || item.user) === String(studentId)
      && String(item.course) === String(courseId)
    ));
  }
};

const CourseMock = {
  findById(id) {
    return createQuery(() => courses.find((item) => String(item._id) === String(id)) || null);
  },
  findOne(filter = {}) {
    return createQuery(() => courses.find((item) => matchesFilter(item, filter)) || null);
  }
};

const SchoolClassMock = {
  findById(id) {
    return createQuery(() => schoolClasses.find((item) => String(item._id) === String(id)) || null);
  },
  findOne(filter = {}) {
    return createQuery(() => schoolClasses.find((item) => matchesFilter(item, filter)) || null);
  }
};

const UserMock = {
  findById(id) {
    return createQuery(() => students.find((item) => String(item._id) === String(id)) || null);
  }
};

const authMock = {
  requireAuth(req, res, next) {
    const raw = req.get('x-test-user');
    if (!raw) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      req.user = JSON.parse(raw);
      return next();
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid test user header.' });
    }
  },
  requireRole(allowedRoles = []) {
    return (req, res, next) => {
      if (allowedRoles.includes(String(req.user?.role || ''))) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by role.' });
    };
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      if (permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadAttendanceRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'attendanceRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isAttendanceRoute = parentFile.endsWith('/routes/attendanceRoutes.js');

    if (isAttendanceRoute && request === '../models/Attendance') return AttendanceMock;
    if (isAttendanceRoute && request === '../utils/courseAccess') return courseAccessMock;
    if (isAttendanceRoute && request === '../models/Course') return CourseMock;
    if (isAttendanceRoute && request === '../models/SchoolClass') return SchoolClassMock;
    if (isAttendanceRoute && request === '../models/User') return UserMock;
    if (isAttendanceRoute && request === '../middleware/auth') return authMock;
    if (isAttendanceRoute && request === '../utils/studentMembershipLookup') return studentMembershipLookupMock;
    if (isAttendanceRoute && request === '../utils/activity') {
      return {
        logActivity: async (payload = {}) => {
          const { req, ...rest } = payload || {};
          activityCalls.push({
            ...clone(rest),
            actor: req?.user?.id || null,
            route: req?.originalUrl || req?.url || ''
          });
        }
      };
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const attendanceRouter = loadAttendanceRouter();

const assertCase = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/attendance', attendanceRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload;

  if (user) {
    headers['x-test-user'] = JSON.stringify(user);
  }
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${targetPath}`, {
    method,
    headers,
    body: payload
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    data
  };
}

async function run() {
  const cases = [];
  const server = await createServer();

  const adminUser = {
    id: IDS.admin1,
    role: 'admin',
    permissions: ['manage_content']
  };
  const instructorWithoutPermission = {
    id: IDS.instructor1,
    role: 'instructor',
    permissions: []
  };
  const instructorWithPermission = {
    id: IDS.instructor1,
    role: 'instructor',
    permissions: ['manage_content']
  };
  const studentUser = {
    id: IDS.student1,
    role: 'student',
    permissions: []
  };

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error.message });
    }
  };

  try {
    await check('route smoke: class summary rejects unauthenticated access', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/summary?from=2026-03-05&to=2026-03-06`);
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: class summary enforces permission guard', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/summary?from=2026-03-05&to=2026-03-06`, {
        user: instructorWithoutPermission
      });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: class summary validates date range', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/summary?from=bad-date&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
      assertCase(response.data?.success === false, 'expected failure payload for invalid date range');
    });

    await check('route smoke: class summary returns report payload shape', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/summary?from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on legacy summary route');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/class/${IDS.class1}/summary`, 'expected replacement endpoint header');
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(typeof response.data?.summary?.attendanceRate === 'number', 'missing summary.attendanceRate');
      assertCase(Array.isArray(response.data?.students) && response.data.students.length === 2, 'expected 2 student rows');
      assertCase(Array.isArray(response.data?.byDate) && response.data.byDate.length === 2, 'expected 2 byDate rows');
    });

    await check('route smoke: class summary supports canonical class route', async () => {
      const response = await request(server, `/api/attendance/class/${IDS.class1}/summary?from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
      assertCase(response.data?.schoolClass?._id === IDS.class1, 'expected schoolClass payload');
    });

    await check('route smoke: legacy daily attendance route resolves canonical payload and deprecation headers', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}?date=2026-03-05`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on legacy daily route');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/class/${IDS.class1}`, 'expected replacement endpoint header');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
    });

    await check('route smoke: class report CSV export returns attachment', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/export.csv?from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on legacy export route');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/class/${IDS.class1}/export.csv`, 'expected replacement endpoint header');
      assertCase(String(response.headers['content-type'] || '').includes('text/csv'), 'expected CSV content-type');
      assertCase(String(response.headers['content-disposition'] || '').includes('attendance-course'), 'expected attendance-course filename');
      assertCase(response.text.includes('ReportType,Course,Category'), 'expected CSV summary header');
    });

    await check('route smoke: class report CSV export supports canonical class route', async () => {
      const response = await request(server, `/api/attendance/class/${IDS.class1}/export.csv?from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['content-type'] || '').includes('text/csv'), 'expected CSV content-type');
      assertCase(String(response.headers['content-disposition'] || '').includes('attendance-course'), 'expected attendance-course filename');
    });

    await check('route smoke: student summary validates student id', async () => {
      const response = await request(server, '/api/attendance/student/not-an-id/summary?courseId=507f191e810c19729de860ea&from=2026-03-05&to=2026-03-06', {
        user: adminUser
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
    });

    await check('route smoke: student summary returns streak and grouped data', async () => {
      const response = await request(server, `/api/attendance/student/${IDS.student1}/summary?courseId=${IDS.course1}&from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on courseId summary filter');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/student/${IDS.student1}/summary?classId=${IDS.class1}`, 'expected replacement endpoint header');
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(typeof response.data?.summary?.currentAbsentStreak === 'number', 'missing currentAbsentStreak');
      assertCase(Array.isArray(response.data?.recent) && response.data.recent.length >= 1, 'expected recent rows');
      assertCase(Array.isArray(response.data?.byCourse) && response.data.byCourse.length === 1, 'expected grouped byCourse rows');
      assertCase(Array.isArray(response.data?.byDate) && response.data.byDate.length === 2, 'expected grouped byDate rows');
    });

    await check('route smoke: student summary accepts canonical class filter', async () => {
      const response = await request(server, `/api/attendance/student/${IDS.student1}/summary?classId=${IDS.class1}&from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
    });

    await check('route smoke: student report CSV export returns attachment', async () => {
      const response = await request(server, `/api/attendance/student/${IDS.student1}/export.csv?courseId=${IDS.course1}&from=2026-03-05&to=2026-03-06`, {
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on courseId export filter');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/student/${IDS.student1}/export.csv?classId=${IDS.class1}`, 'expected replacement endpoint header');
      assertCase(String(response.headers['content-disposition'] || '').includes('attendance-student'), 'expected attendance-student filename');
      assertCase(response.text.includes('ReportType,Student,Grade,Course'), 'expected CSV header');
    });

    await check('route smoke: attendance upsert accepts canonical class scope and logs activity', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/attendance/upsert', {
        method: 'POST',
        user: instructorWithPermission,
        body: {
          studentId: IDS.student1,
          classId: IDS.class1,
          date: '2026-03-07',
          status: 'present',
          note: 'Back to class'
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
      assertCase(String(response.data?.attendance?.studentMembershipId || '') === 'mem-1', 'expected membership link on attendance');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'attendance_upsert', 'expected attendance_upsert activity');
      assertCase(activity?.targetType === 'Attendance', 'expected Attendance target type');
      assertCase(String(activity?.meta?.classId || '') === IDS.class1, 'expected canonical classId in activity meta');
      assertCase(String(activity?.meta?.studentMembershipId || '') === 'mem-1', 'expected membership id in activity meta');
    });

    await check('route smoke: attendance upsert deprecates course-only scope and logs legacy marker', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/attendance/upsert', {
        method: 'POST',
        user: instructorWithPermission,
        body: {
          studentId: IDS.student2,
          courseId: IDS.course1,
          date: '2026-03-07',
          status: 'late',
          note: 'Arrived after assembly'
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on course-only upsert');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'attendance_upsert', 'expected attendance_upsert activity');
      assertCase(activity?.meta?.legacyCourseScope === true, 'expected legacy course scope marker in activity meta');
    });

    await check('route smoke: weekly student summary enforces student role', async () => {
      const response = await request(server, '/api/attendance/my/weekly?weekStart=2026-03-05', {
        user: adminUser
      });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: weekly student summary returns payload shape', async () => {
      const response = await request(server, '/api/attendance/my/weekly?weekStart=2026-03-05', {
        user: studentUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.week?.start === '2026-02-28', `unexpected week start ${response.data?.week?.start}`);
      assertCase(typeof response.data?.summary?.attendanceRate === 'number', 'missing student weekly attendanceRate');
    });

    await check('route smoke: weekly student summary accepts canonical class filter', async () => {
      const response = await request(server, `/api/attendance/my/weekly?classId=${IDS.class1}&weekStart=2026-03-05`, {
        user: studentUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
    });

    await check('route smoke: weekly student summary deprecates courseId filter', async () => {
      const response = await request(server, `/api/attendance/my/weekly?courseId=${IDS.course1}&weekStart=2026-03-05`, {
        user: studentUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on weekly courseId filter');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/my/weekly?classId=${IDS.class1}`, 'expected replacement endpoint header');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
    });

    await check('route smoke: weekly class summary validates week input', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/weekly?weekStart=bad-date`, {
        user: instructorWithPermission
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
    });

    await check('route smoke: weekly class summary returns payload shape', async () => {
      const response = await request(server, `/api/attendance/course/${IDS.course1}/weekly?weekStart=2026-03-05`, {
        user: instructorWithPermission
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on legacy weekly route');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/attendance/class/${IDS.class1}/weekly`, 'expected replacement endpoint header');
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.week?.end === '2026-03-06', `unexpected week end ${response.data?.week?.end}`);
      assertCase(typeof response.data?.summary?.totalStudents === 'number', 'missing class weekly totalStudents');
      assertCase(Array.isArray(response.data?.students) && response.data.students.length === 2, 'expected 2 weekly student rows');
    });

    await check('route smoke: weekly class summary supports canonical class route', async () => {
      const response = await request(server, `/api/attendance/class/${IDS.class1}/weekly?weekStart=2026-03-05`, {
        user: instructorWithPermission
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(response.data?.classId === IDS.class1, `expected canonical classId ${IDS.class1}`);
      assertCase(response.data?.courseId === IDS.course1, `expected linked courseId ${IDS.course1}`);
      assertCase(response.data?.schoolClass?._id === IDS.class1, 'expected schoolClass payload');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failures = cases.filter((item) => item.status === 'FAIL');
  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log(`PASS  ${item.label}`);
    } else {
      console.error(`FAIL  ${item.label}`);
      console.error(`      ${item.error}`);
    }
  });

  if (failures.length) {
    console.error(`\nAttendance route smoke failed: ${failures.length} case(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAttendance route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:attendance-routes] fatal error');
  console.error(error);
  process.exit(1);
});
