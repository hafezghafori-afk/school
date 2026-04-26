const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86101',
  instructor: '507f191e810c19729de86102',
  config: '507f191e810c19729de86103',
  entry: '507f191e810c19729de86104',
  annual: '507f191e810c19729de86105',
  weekly: '507f191e810c19729de86106'
};
const activityCalls = [];

const serviceMock = {
  async listTimetableReferenceData() {
    return {
      activeYear: { id: 'year-1', title: '1406' },
      classes: [{ id: 'class-1', title: 'Class 10 A' }],
      subjects: [{ id: 'subject-1', name: 'Math' }],
      teacherAssignments: [{ id: 'assignment-1', teacher: { name: 'Teacher One' } }],
      configs: [{ id: IDS.config, name: 'Default Timetable' }],
      academicYears: [{ id: 'year-1', title: '1406' }],
      academicTerms: [{ id: 'term-1', title: 'Term 1' }],
      holidays: []
    };
  },
  async listTimetableConfigs() {
    return [{ id: IDS.config, name: 'Default Timetable' }];
  },
  async createTimetableConfig(payload) {
    return { id: IDS.config, name: payload.name || 'Default Timetable' };
  },
  async listTimetableEntries() {
    return [{ id: IDS.entry, dayOfWeek: 'monday', schoolClass: { title: 'Class 10 A' } }];
  },
  async createTimetableEntry(payload) {
    return { id: IDS.entry, dayOfWeek: payload.dayOfWeek || 'monday', schoolClass: { title: 'Class 10 A' } };
  },
  async updateTimetableEntry(entryId, payload) {
    return { id: entryId, status: payload.status || 'active' };
  },
  async listAnnualPlans() {
    return [{ id: IDS.annual, title: 'Annual Plan - Math' }];
  },
  async createAnnualPlan(payload) {
    return { id: IDS.annual, title: payload.title || 'Annual Plan - Math' };
  },
  async listWeeklyPlans() {
    return [{ id: IDS.weekly, lessonTitle: 'Week 1' }];
  },
  async createWeeklyPlan(payload) {
    return { id: IDS.weekly, lessonTitle: payload.lessonTitle || 'Week 1' };
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
  },
  requireRole(roles = []) {
    return (req, res, next) => (roles.includes(String(req.user?.role || '')) ? next() : res.status(403).json({ success: false, message: 'Forbidden by role.' }));
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      return permissions.includes(permission) ? next() : res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  },
  requireAnyPermission(permissionList = []) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      const expected = Array.isArray(permissionList) ? permissionList : [];
      return expected.some((item) => permissions.includes(item)) ? next() : res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'timetableRoutes.js');
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/timetableRoutes.js');
    if (isRouteFile && request === '../middleware/auth') return authMock;
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
    if (isRouteFile && request === '../services/timetableService') return serviceMock;
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
  app.use('/api/timetables', router);
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
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: response.status, data };
}

async function run() {
  const server = await createServer();
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_schedule'] };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: ['manage_content'] };
  try {
    const cases = [];
    cases.push(await request(server, '/api/timetables/reference-data'));
    cases.push(await request(server, '/api/timetables/reference-data', { user: { id: IDS.instructor, role: 'instructor', permissions: [] } }));
    cases.push(await request(server, '/api/timetables/reference-data', { user: instructorUser }));
    cases.push(await request(server, '/api/timetables/configs', { user: instructorUser }));
    const activityStart = activityCalls.length;
    cases.push(await request(server, '/api/timetables/configs', { method: 'POST', user: adminUser, body: { name: 'Default Timetable' } }));
    cases.push(await request(server, '/api/timetables/entries', { user: instructorUser }));
    cases.push(await request(server, '/api/timetables/entries', { method: 'POST', user: instructorUser, body: { dayOfWeek: 'monday' } }));
    cases.push(await request(server, `/api/timetables/entries/${IDS.entry}`, { method: 'PUT', user: instructorUser, body: { status: 'published' } }));
    cases.push(await request(server, '/api/timetables/annual-plans', { user: instructorUser }));
    cases.push(await request(server, '/api/timetables/annual-plans', { method: 'POST', user: adminUser, body: { title: 'Annual Plan - Math' } }));
    cases.push(await request(server, '/api/timetables/weekly-plans', { user: instructorUser }));
    cases.push(await request(server, '/api/timetables/weekly-plans', { method: 'POST', user: adminUser, body: { lessonTitle: 'Week 1', annualPlanId: IDS.annual, weekStartDate: '2026-03-09' } }));

    assertCase(cases[0].status === 401, 'Expected timetable reference-data route to require auth.');
    assertCase(cases[1].status === 403, 'Expected timetable reference-data route to require permission.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.classes), 'Expected timetable reference-data route to return classes.');
    assertCase(cases[3].status === 200 && Array.isArray(cases[3].data?.items), 'Expected timetable configs route to return items.');
    assertCase(cases[4].status === 201 && cases[4].data?.item?.name === 'Default Timetable', 'Expected timetable config creation to return created item.');
    assertCase(cases[5].status === 200 && Array.isArray(cases[5].data?.items), 'Expected timetable entries route to return items.');
    assertCase(cases[6].status === 201 && cases[6].data?.item?.dayOfWeek === 'monday', 'Expected timetable entry creation to return item.');
    assertCase(cases[7].status === 200 && cases[7].data?.item?.status === 'published', 'Expected timetable entry update to return item.');
    assertCase(cases[8].status === 200 && Array.isArray(cases[8].data?.items), 'Expected annual plans route to return items.');
    assertCase(cases[9].status === 201 && cases[9].data?.item?.title === 'Annual Plan - Math', 'Expected annual plan creation to return item.');
    assertCase(cases[10].status === 200 && Array.isArray(cases[10].data?.items), 'Expected weekly plans route to return items.');
    assertCase(cases[11].status === 201 && cases[11].data?.item?.lessonTitle === 'Week 1', 'Expected weekly plan creation to return item.');
    assertCase(activityCalls.length === activityStart + 5, `Expected 5 timetable activity logs, received ${activityCalls.length - activityStart}.`);
    assertCase(activityCalls[activityStart]?.action === 'create_timetable_config', 'Expected create_timetable_config activity.');
    assertCase(activityCalls[activityStart + 1]?.action === 'create_timetable_entry', 'Expected create_timetable_entry activity.');
    assertCase(activityCalls[activityStart + 2]?.action === 'update_timetable_entry', 'Expected update_timetable_entry activity.');
    assertCase(activityCalls[activityStart + 3]?.action === 'create_annual_plan', 'Expected create_annual_plan activity.');
    assertCase(activityCalls[activityStart + 4]?.action === 'create_weekly_plan', 'Expected create_weekly_plan activity.');

    console.log('check:timetable-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:timetable-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});

