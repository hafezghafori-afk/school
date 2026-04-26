const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  instructor: '507f191e810c19729de86002',
  table: '507f191e810c19729de86003'
};

const activityCalls = [];

const serviceMock = {
  async listResultTableReferenceData() {
    return {
      templates: [{ id: 'tpl-1', title: 'جدول نتایج', code: 'RESULTS_MAIN' }],
      configs: [{ id: 'cfg-1', name: 'Default Result Table Config', code: 'DEFAULT-RESULT-TABLE' }],
      sessions: [{ id: 'ses-1', title: 'Annual - Class 10 A', code: 'ANNUAL-1406-T1-10A' }]
    };
  },
  async listTableTemplates() {
    return [{ id: 'tpl-1', title: 'جدول نتایج', code: 'RESULTS_MAIN' }];
  },
  async listTableConfigs() {
    return [{ id: 'cfg-1', name: 'Default Result Table Config', code: 'DEFAULT-RESULT-TABLE' }];
  },
  async createTableConfig(payload) {
    return { id: 'cfg-2', name: payload.name, code: payload.code || 'CFG' };
  },
  async listResultTables() {
    return [{ id: IDS.table, title: 'جدول نتایج - Annual', code: 'RESULTS_MAIN-ANNUAL', rowCount: 2, status: 'generated' }];
  },
  async generateResultTable() {
    return {
      id: IDS.table,
      title: 'جدول نتایج - Annual',
      code: 'RESULTS_MAIN-ANNUAL',
      rowCount: 2,
      status: 'generated',
      rows: [{ id: 'row-1', displayName: 'Alpha Student' }]
    };
  },
  async publishResultTable(tableId) {
    return {
      id: String(tableId),
      title: 'جدول نتایج - Annual',
      code: 'RESULTS_MAIN-ANNUAL',
      rowCount: 2,
      status: 'published',
      rows: [{ id: 'row-1', displayName: 'Alpha Student' }]
    };
  },
  async getResultTable(tableId) {
    if (String(tableId) !== IDS.table) return null;
    return {
      id: IDS.table,
      title: 'جدول نتایج - Annual',
      code: 'RESULTS_MAIN-ANNUAL',
      rowCount: 2,
      status: 'published',
      rows: [{ id: 'row-1', displayName: 'Alpha Student' }]
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
  },
  requireRole(roles = []) {
    return (req, res, next) => {
      if (roles.includes(String(req.user?.role || ''))) return next();
      return res.status(403).json({ success: false, message: 'Forbidden by role.' });
    };
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      if (permissions.includes(permission)) return next();
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

const activityMock = {
  async logActivity(payload) {
    activityCalls.push(payload);
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'resultTableRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/resultTableRoutes.js');
    if (isRouteFile && request === '../middleware/auth') return authMock;
    if (isRouteFile && request === '../services/resultTableService') return serviceMock;
    if (isRouteFile && request === '../utils/activity') return activityMock;
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

function findActivity(action) {
  return activityCalls.find((entry) => entry?.action === action);
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/result-tables', router);
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
  return { status: response.status, data, text };
}

async function run() {
  const server = await createServer();
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_content'] };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: ['manage_content'] };

  try {
    const cases = [];
    cases.push(await request(server, '/api/result-tables/reference-data'));
    cases.push(await request(server, '/api/result-tables/reference-data', { user: { id: IDS.instructor, role: 'instructor', permissions: [] } }));
    cases.push(await request(server, '/api/result-tables/reference-data', { user: instructorUser }));
    cases.push(await request(server, '/api/result-tables/configs', { method: 'POST', user: adminUser, body: { name: 'Printer Config', code: 'PRINT', orientation: 'portrait' } }));
    cases.push(await request(server, '/api/result-tables/generate', { method: 'POST', user: instructorUser, body: { templateId: 'tpl-1', sessionId: 'ses-1' } }));
    cases.push(await request(server, '/api/result-tables', { user: instructorUser }));
    cases.push(await request(server, `/api/result-tables/${IDS.table}`, { user: instructorUser }));
    cases.push(await request(server, `/api/result-tables/${IDS.table}/publish`, { method: 'POST', user: adminUser }));

    assertCase(cases[0].status === 401, 'Expected reference-data route to require auth.');
    assertCase(cases[1].status === 403, 'Expected reference-data route to require permission.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.templates), 'Expected reference-data route to return templates.');
    assertCase(cases[3].status === 200 && cases[3].data?.item?.name === 'Printer Config', 'Expected config create route to return created config.');
    assertCase(cases[4].status === 200 && cases[4].data?.item?.id === IDS.table, 'Expected generate route to return table payload.');
    assertCase(cases[5].status === 200 && Array.isArray(cases[5].data?.items), 'Expected list route to return generated tables.');
    assertCase(cases[6].status === 200 && cases[6].data?.item?.id === IDS.table, 'Expected detail route to return table detail.');
    assertCase(cases[7].status === 200 && cases[7].data?.item?.status === 'published', 'Expected publish route to return published table detail.');

    const configLog = findActivity('result_table_config_create');
    const generateLog = findActivity('result_table_generate');
    const publishLog = findActivity('result_table_publish');

    assertCase(configLog?.targetType === 'result_table_config' && configLog?.meta?.orientation === 'portrait', 'Expected config creation to write an activity log.');
    assertCase(generateLog?.targetType === 'result_table' && generateLog?.targetId === IDS.table, 'Expected generate route to write an activity log.');
    assertCase(Number(generateLog?.meta?.rowCount || 0) === 2, 'Expected generate activity log to include row count.');
    assertCase(publishLog?.targetType === 'result_table' && publishLog?.targetId === IDS.table, 'Expected publish route to write an activity log.');
    assertCase(publishLog?.meta?.status === 'published', 'Expected publish activity log to include published status.');

    console.log('check:result-table-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:result-table-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});