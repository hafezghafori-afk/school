const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  instructor: '507f191e810c19729de86002',
  session: '507f191e810c19729de86003',
  rule: '507f191e810c19729de86004',
  tx: '507f191e810c19729de86005'
};

const activityCalls = [];

const serviceMock = {
  async listPromotionReferenceData() {
    return {
      academicYears: [{ id: 'year-1', title: '1406' }],
      classes: [{ id: 'class-1', title: 'Class 10 A' }],
      sessions: [{ id: IDS.session, title: 'Annual - Class 10 A', code: 'ANNUAL-1406-10A' }],
      rules: [{ id: IDS.rule, name: 'Default Promotion Rule', code: 'DEFAULT-PROMOTION' }],
      activeYear: { id: 'year-1', title: '1406' }
    };
  },
  async listPromotionRules() {
    return [{ id: IDS.rule, name: 'Default Promotion Rule', code: 'DEFAULT-PROMOTION' }];
  },
  async createPromotionRule(payload) {
    return { id: IDS.rule, name: payload.name, code: payload.code || 'RULE' };
  },
  async previewPromotions() {
    return {
      session: { id: IDS.session, title: 'Annual - Class 10 A' },
      rule: { id: IDS.rule, name: 'Default Promotion Rule' },
      targetAcademicYear: { id: 'year-2', title: '1407' },
      summary: { total: 1, promoted: 1, repeated: 0, conditional: 0, graduated: 0, blocked: 0, skipped: 0, canApply: 1 },
      items: [{ examResultId: 'result-1', computedOutcome: 'promoted', canApply: true }]
    };
  },
  async applyPromotions() {
    return {
      session: { id: IDS.session, title: 'Annual - Class 10 A' },
      rule: { id: IDS.rule, name: 'Default Promotion Rule' },
      targetAcademicYear: { id: 'year-2', title: '1407' },
      summary: { total: 1, promoted: 1, repeated: 0, conditional: 0, graduated: 0, blocked: 0, skipped: 0, canApply: 1 },
      items: [{ id: IDS.tx, promotionOutcome: 'promoted', transactionStatus: 'applied' }]
    };
  },
  async listPromotionTransactions() {
    return [{ id: IDS.tx, promotionOutcome: 'promoted', transactionStatus: 'applied' }];
  },
  async getPromotionTransaction(transactionId) {
    if (String(transactionId) !== IDS.tx) return null;
    return { id: IDS.tx, promotionOutcome: 'promoted', transactionStatus: 'applied' };
  },
  async rollbackPromotionTransaction(transactionId, payload = {}, actorUserId = null) {
    return {
      id: String(transactionId),
      promotionOutcome: 'promoted',
      transactionStatus: 'rolled_back',
      rollbackReason: String(payload.reason || payload.rollbackReason || ''),
      rolledBackBy: actorUserId ? { id: actorUserId } : null
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
  const routePath = path.join(__dirname, '..', 'routes', 'promotionRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/promotionRoutes.js');
    if (isRouteFile && request === '../middleware/auth') return authMock;
    if (isRouteFile && request === '../services/promotionService') return serviceMock;
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
  app.use('/api/promotions', router);
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
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_users', 'view_reports'] };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: ['view_reports'] };

  try {
    const cases = [];
    cases.push(await request(server, '/api/promotions/reference-data'));
    cases.push(await request(server, '/api/promotions/reference-data', { user: { id: IDS.instructor, role: 'instructor', permissions: [] } }));
    cases.push(await request(server, '/api/promotions/reference-data', { user: instructorUser }));
    cases.push(await request(server, '/api/promotions/rules', { user: instructorUser }));
    cases.push(await request(server, '/api/promotions/rules', { method: 'POST', user: adminUser, body: { name: 'Terminal Rule', code: 'TERM-RULE' } }));
    cases.push(await request(server, '/api/promotions/preview', { method: 'POST', user: instructorUser, body: { sessionId: IDS.session } }));
    cases.push(await request(server, '/api/promotions/apply', { method: 'POST', user: adminUser, body: { sessionId: IDS.session } }));
    cases.push(await request(server, '/api/promotions/transactions', { user: adminUser }));
    cases.push(await request(server, `/api/promotions/transactions/${IDS.tx}`, { user: adminUser }));
    cases.push(await request(server, `/api/promotions/rollback/${IDS.tx}`, { method: 'POST', user: adminUser, body: { reason: 'operator review' } }));

    assertCase(cases[0].status === 401, 'Expected promotion reference-data route to require auth.');
    assertCase(cases[1].status === 403, 'Expected promotion reference-data route to require permission.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.rules), 'Expected promotion reference-data route to return rules.');
    assertCase(cases[3].status === 200 && Array.isArray(cases[3].data?.items), 'Expected promotion rules list route to return rules.');
    assertCase(cases[4].status === 200 && cases[4].data?.item?.name === 'Terminal Rule', 'Expected promotion rule creation to return created item.');
    assertCase(cases[5].status === 200 && cases[5].data?.summary?.promoted === 1, 'Expected preview route to return promoted summary.');
    assertCase(cases[6].status === 200 && cases[6].data?.items?.[0]?.transactionStatus === 'applied', 'Expected apply route to return applied transaction.');
    assertCase(cases[7].status === 200 && Array.isArray(cases[7].data?.items), 'Expected transaction list route to return items.');
    assertCase(cases[8].status === 200 && cases[8].data?.item?.id === IDS.tx, 'Expected transaction detail route to return the requested item.');
    assertCase(cases[9].status === 200 && cases[9].data?.item?.transactionStatus === 'rolled_back', 'Expected rollback route to return rolled back transaction.');

    const ruleCreateLog = findActivity('promotion_rule_create');
    const applyLog = findActivity('promotion_apply');
    const rollbackLog = findActivity('promotion_rollback');

    assertCase(ruleCreateLog?.targetType === 'promotion_rule' && ruleCreateLog?.targetId === IDS.rule, 'Expected promotion rule creation to write an activity log.');
    assertCase(applyLog?.targetType === 'promotion_session' && applyLog?.targetId === IDS.session, 'Expected promotion apply to write an activity log.');
    assertCase(Number(applyLog?.meta?.transactionCount || 0) === 1, 'Expected promotion apply activity log to include transaction count.');
    assertCase(rollbackLog?.targetType === 'promotion_transaction' && rollbackLog?.targetId === IDS.tx, 'Expected promotion rollback to write an activity log.');
    assertCase(rollbackLog?.reason === 'operator review', 'Expected promotion rollback activity log to include rollback reason.');

    console.log('check:promotion-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:promotion-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});