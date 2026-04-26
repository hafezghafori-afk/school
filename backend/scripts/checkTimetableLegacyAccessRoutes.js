const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86101',
  instructor: '507f191e810c19729de86102',
  student: '507f191e810c19729de86103',
  classAllowed: '507f191e810c19729de86104',
  classOther: '507f191e810c19729de86105',
  teacherOther: '507f191e810c19729de86106',
  year: '507f191e810c19729de86107',
  shift: '507f191e810c19729de86108',
  school: '507f191e810c19729de86109'
};

const activityCalls = [];

function buildQuery(entries) {
  return {
    populate() {
      return this;
    },
    sort() {
      return Promise.resolve(entries);
    }
  };
}

const classEntries = [
  {
    _id: 'entry-1',
    dayCode: 'saturday',
    periodIndex: 1,
    classId: { _id: IDS.classAllowed, title: 'Class 7A' },
    subjectId: { _id: 'sub-1', name: 'Math' },
    teacherId: { _id: IDS.instructor, name: 'Teacher One' }
  }
];

const teacherEntries = [
  {
    _id: 'entry-2',
    dayCode: 'sunday',
    periodIndex: 2,
    classId: { _id: IDS.classAllowed, title: 'Class 7A' },
    subjectId: { _id: 'sub-2', name: 'Science' },
    teacherId: { _id: IDS.instructor, name: 'Teacher One' }
  }
];

const allEntries = [...classEntries, ...teacherEntries];

const TimetableEntryMock = {
  find(query = {}) {
    if (query.classId) return buildQuery(classEntries);
    if (query.teacherId) {
      if (String(query.teacherId) === IDS.instructor) return buildQuery(teacherEntries);
      return buildQuery([]);
    }
    return buildQuery(allEntries);
  },
  async exists(query = {}) {
    return String(query.classId || '') === IDS.classAllowed && String(query.teacherId || '') === IDS.instructor;
  }
};

const StudentMembershipMock = {
  findOne(query = {}) {
    const hasYearFilter = Boolean(query.$or);
    const hasAllowedStudent = String(query.student || '') === IDS.student;
    const result = hasAllowedStudent
      ? {
          classId: IDS.classAllowed,
          academicYearId: hasYearFilter ? IDS.year : null,
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        }
      : null;

    return {
      select() {
        return this;
      },
      sort() {
        return Promise.resolve(result);
      }
    };
  }
};

const authMock = {
  requireAuth(req, res, next) {
    const raw = req.get('x-test-user');
    if (!raw) return res.status(401).json({ success: false, message: 'Authentication required.' });
    try {
      req.user = JSON.parse(raw);
      return next();
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid test user.' });
    }
  }
};

const roleCheckMock = {
  checkRole(roles = []) {
    return (req, res, next) => (roles.includes(String(req.user?.role || '')) ? next() : res.status(403).json({ success: false, message: 'Forbidden by role.' }));
  }
};

function noopRouterAudit() {
  return undefined;
}

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'timetableGeneratorRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/timetableGeneratorRoutes.js');

    if (isRouteFile && request === '../middleware/auth') return authMock;
    if (isRouteFile && request === '../middleware/roleCheck') return roleCheckMock;
    if (isRouteFile && request === '../models/TimetableEntry') return TimetableEntryMock;
    if (isRouteFile && request === '../models/StudentMembership') return StudentMembershipMock;

    if (isRouteFile && request === '../utils/activity') {
      return {
        logActivity: async (payload = {}) => {
          const { req, ...rest } = payload || {};
          activityCalls.push({
            ...rest,
            actor: req?.user?.id || null,
            route: req?.originalUrl || req?.url || ''
          });
        }
      };
    }

    if (isRouteFile && request === '../utils/routeWriteAudit') {
      return { attachWriteActivityAudit: noopRouterAudit };
    }

    if (isRouteFile && request.startsWith('../models/')) {
      return {};
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

const router = loadRouter();

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/timetable', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload = body;

  if (user) headers['x-test-user'] = JSON.stringify(user);
  if (body && typeof body === 'object') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${targetPath}`, { method, headers, body: payload });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function run() {
  const server = await createServer();

  const admin = { id: IDS.admin, role: 'admin' };
  const instructor = { id: IDS.instructor, role: 'instructor' };
  const student = { id: IDS.student, role: 'student' };

  try {
    const results = [];
    const logStart = activityCalls.length;

    results.push(await request(server, `/api/timetable/class/${IDS.classAllowed}`));
    results.push(await request(server, `/api/timetable/class/${IDS.classOther}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: student }));
    results.push(await request(server, `/api/timetable/class/${IDS.classAllowed}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: student }));
    results.push(await request(server, `/api/timetable/teacher/${IDS.teacherOther}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: student }));
    results.push(await request(server, `/api/timetable/teacher/${IDS.teacherOther}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: instructor }));
    results.push(await request(server, `/api/timetable/teacher/${IDS.instructor}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: instructor }));
    results.push(await request(server, `/api/timetable/entries/${IDS.school}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: instructor }));
    results.push(await request(server, `/api/timetable/entries/${IDS.school}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`, { user: admin }));

    assertCase(results[0].status === 401, 'Expected class endpoint to require auth.');
    assertCase(results[1].status === 403, 'Expected student to be blocked from other class timetable.');
    assertCase(results[2].status === 200, 'Expected student to access own class timetable.');
    assertCase(results[3].status === 403, 'Expected student to be blocked from teacher endpoint.');
    assertCase(results[4].status === 403, 'Expected instructor to be blocked from other teacher timetable.');
    assertCase(results[5].status === 200, 'Expected instructor to access own timetable.');
    assertCase(results[6].status === 403, 'Expected non-management role to be blocked from entries overview.');
    assertCase(results[7].status === 200, 'Expected admin to access entries overview.');

    const newLogs = activityCalls.slice(logStart);
    const forbiddenLogs = newLogs.filter((item) => item.action === 'timetable_access_forbidden');

    assertCase(forbiddenLogs.length === 4, `Expected 4 forbidden logs, got ${forbiddenLogs.length}.`);
    assertCase(forbiddenLogs.some((item) => item.reason === 'student_class_scope_mismatch'), 'Expected student_class_scope_mismatch log.');
    assertCase(forbiddenLogs.some((item) => item.reason === 'student_teacher_view_forbidden'), 'Expected student_teacher_view_forbidden log.');
    assertCase(forbiddenLogs.some((item) => item.reason === 'instructor_other_teacher_forbidden'), 'Expected instructor_other_teacher_forbidden log.');
    assertCase(forbiddenLogs.some((item) => item.reason === 'entries_overview_forbidden'), 'Expected entries_overview_forbidden log.');

    console.log('check:timetable-legacy-access-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:timetable-legacy-access-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
