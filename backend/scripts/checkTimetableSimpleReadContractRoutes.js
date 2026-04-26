const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86101',
  instructor: '507f191e810c19729de86102',
  classA: '507f191e810c19729de86111',
  classB: '507f191e810c19729de86112',
  teacherA: '507f191e810c19729de86121',
  teacherB: '507f191e810c19729de86122',
  subjectA: '507f191e810c19729de86131',
  subjectB: '507f191e810c19729de86132',
  year: '507f191e810c19729de86141',
  shift: '507f191e810c19729de86142'
};

const entries = [
  {
    _id: 'entry-1',
    academicYearId: { _id: IDS.year, title: '1405' },
    shiftId: { _id: IDS.shift, name: 'Morning' },
    classId: { _id: IDS.classA, title: 'Class 7A', gradeLevel: '7', section: 'A', genderType: 'mixed' },
    subjectId: { _id: IDS.subjectA, name: 'Math', category: 'core' },
    teacherId: { _id: IDS.teacherA, name: 'Teacher A' },
    periodDefinitionId: { _id: 'p1', startTime: '08:00', endTime: '08:40', type: 'class' },
    dayCode: 'saturday',
    periodIndex: 1
  },
  {
    _id: 'entry-2',
    academicYearId: { _id: IDS.year, title: '1405' },
    shiftId: { _id: IDS.shift, name: 'Morning' },
    classId: { _id: IDS.classA, title: 'Class 7A', gradeLevel: '7', section: 'A', genderType: 'mixed' },
    subjectId: { _id: IDS.subjectB, name: 'Science', category: 'core' },
    teacherId: { _id: IDS.teacherA, name: 'Teacher A' },
    periodDefinitionId: { _id: 'p5', startTime: '10:10', endTime: '10:50', type: 'class' },
    dayCode: 'monday',
    periodIndex: 5
  },
  {
    _id: 'entry-3',
    academicYearId: { _id: IDS.year, title: '1405' },
    shiftId: { _id: IDS.shift, name: 'Morning' },
    classId: { _id: IDS.classB, title: 'Class 8B', gradeLevel: '8', section: 'B', genderType: 'mixed' },
    subjectId: { _id: IDS.subjectB, name: 'Science', category: 'core' },
    teacherId: { _id: IDS.teacherB, name: 'Teacher B' },
    periodDefinitionId: { _id: 'p2', startTime: '08:40', endTime: '09:20', type: 'class' },
    dayCode: 'sunday',
    periodIndex: 2
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildQuery(result) {
  return {
    populate() {
      return this;
    },
    sort() {
      return Promise.resolve(clone(result));
    },
    limit() {
      return this;
    }
  };
}

const TimetableEntryMock = {
  find(query = {}) {
    const filtered = entries.filter((entry) => {
      if (query.classId && String(entry.classId._id) !== String(query.classId)) return false;
      if (query.teacherId && String(entry.teacherId._id) !== String(query.teacherId)) return false;
      if (query.academicYearId && String(entry.academicYearId._id) !== String(query.academicYearId)) return false;
      if (query.shiftId && String(entry.shiftId._id) !== String(query.shiftId)) return false;
      return true;
    });
    return buildQuery(filtered);
  },
  async exists(query = {}) {
    return entries.some((entry) => (
      String(entry.classId._id) === String(query.classId)
      && String(entry.teacherId._id) === String(query.teacherId)
    ));
  }
};

const StudentMembershipMock = {
  findOne() {
    return {
      select() { return this; },
      sort() { return Promise.resolve(null); }
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
    return (req, res, next) => (
      roles.includes(String(req.user?.role || ''))
        ? next()
        : res.status(403).json({ success: false, message: 'Forbidden by role.' })
    );
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
      return { logActivity: async () => undefined };
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

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/timetable', loadRouter());
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

  return { status: response.status, data };
}

async function run() {
  const server = await createServer();
  const admin = { id: IDS.admin, role: 'admin' };
  const instructor = { id: IDS.teacherA, role: 'instructor' };

  try {
    const classRes = await request(
      server,
      `/api/timetable/class/${IDS.classA}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`,
      { user: admin }
    );

    const teacherRes = await request(
      server,
      `/api/timetable/teacher/${IDS.teacherA}?academicYearId=${IDS.year}&shiftId=${IDS.shift}`,
      { user: instructor }
    );

    assertCase(classRes.status === 200 && classRes?.data?.success, 'Expected class read contract route to succeed.');
    assertCase(Array.isArray(classRes?.data?.data?.entries), 'Expected class entries array in response.');
    assertCase(typeof classRes?.data?.data?.timetable === 'object' && classRes?.data?.data?.timetable !== null, 'Expected class timetable object in response.');
    assertCase(classRes?.data?.data?.timetable?.saturday, 'Expected saturday key in class timetable response.');
    assertCase(Number(classRes?.data?.data?.summary?.totalPeriods || 0) >= 1, 'Expected class summary totalPeriods.');

    assertCase(teacherRes.status === 200 && teacherRes?.data?.success, 'Expected teacher read contract route to succeed.');
    assertCase(Array.isArray(teacherRes?.data?.data?.entries), 'Expected teacher entries array in response.');
    assertCase(typeof teacherRes?.data?.data?.timetable === 'object' && teacherRes?.data?.data?.timetable !== null, 'Expected teacher timetable object in response.');
    assertCase(teacherRes?.data?.data?.timetable?.monday, 'Expected monday key in teacher timetable response.');
    assertCase(Number(teacherRes?.data?.data?.summary?.totalPeriods || 0) >= 1, 'Expected teacher summary totalPeriods.');

    console.log('check:timetable-simple-read-contract-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:timetable-simple-read-contract-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
