const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  instructor: '507f191e810c19729de86002',
  session: '507f191e810c19729de86003',
  rule: '507f191e810c19729de86004',
  tx: '507f191e810c19729de86005',
  batch: '507f191e810c19729de86006',
  heldTx: '507f191e810c19729de86007'
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
  async applyPromotions(payload = {}) {
    if (payload.classId === 'blocked-class') {
      const error = new Error('promotion_plan_blocked');
      error.details = { blockers: [{ code: 'target_year_before_source', field: 'target_year', message: 'سال مقصد: باید بعد از سال مبدا باشد.' }] };
      throw error;
    }
    return {
      batch: { id: IDS.batch, summary: { total: 1, promoted: 1 }, sourceClass: { id: 'class-1' }, targetAcademicYear: { id: 'year-2' } },
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
  async getGraduationClearance(batchId) {
    if (String(batchId) !== IDS.batch) throw new Error('promotion_batch_not_found');
    return { batch: { id: IDS.batch }, students: [{ transactionId: IDS.tx, outstanding: 0, cleared: true }], summary: { graduates: 1, cleared: 1, withDebt: 0, debtAmount: 0 } };
  },
  async getPromotionYearBoard({ academicYearId } = {}) {
    if (!academicYearId) throw new Error('promotion_board_year_required');
    return { academicYear: { id: academicYearId, title: '1405' }, classes: [{ schoolClass: { id: 'class-1' }, currentStudents: 30, heldCount: 2, latestBatch: null }] };
  },
  async listPromotionBatches() {
    return [{ id: IDS.batch, status: 'applied' }];
  },
  async getPromotionBatch(batchId) {
    if (String(batchId) !== IDS.batch) return null;
    return { id: IDS.batch, status: 'applied', transactions: [{ id: IDS.tx }] };
  },
  async rollbackPromotionBatch(batchId) {
    if (String(batchId) !== IDS.batch) throw new Error('promotion_batch_not_found');
    const error = new Error('promotion_batch_rollback_blocked');
    error.details = { blockers: [{ transactionId: IDS.tx, fullName: 'Student One', code: 'promotion_rollback_blocked_by_finance' }] };
    throw error;
  },
  async resolveHeldPromotion(transactionId, payload = {}) {
    if (String(transactionId) !== IDS.heldTx) throw new Error('promotion_transaction_not_held');
    return { id: IDS.heldTx, batchId: IDS.batch, promotionOutcome: payload.decision, transactionStatus: 'applied', targetClass: { id: 'class-2' } };
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
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_users', 'view_reports', 'education.promotions.manage'] };
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
    cases.push(await request(server, '/api/promotions/apply', { method: 'POST', user: adminUser, body: { academicYearId: 'year-1', classId: 'blocked-class' } }));
    cases.push(await request(server, '/api/promotions/batches', { user: adminUser }));
    cases.push(await request(server, `/api/promotions/batches/${IDS.batch}`, { user: adminUser }));
    cases.push(await request(server, `/api/promotions/batches/${IDS.batch}/rollback`, { method: 'POST', user: adminUser, body: { reason: 'wrong class' } }));
    cases.push(await request(server, `/api/promotions/transactions/${IDS.heldTx}/resolve`, { method: 'POST', user: adminUser, body: { decision: 'promoted' } }));
    cases.push(await request(server, `/api/promotions/transactions/${IDS.tx}/resolve`, { method: 'POST', user: adminUser, body: { decision: 'promoted' } }));
    cases.push(await request(server, `/api/promotions/transactions/${IDS.heldTx}/resolve`, { method: 'POST', user: instructorUser, body: { decision: 'promoted' } }));
    cases.push(await request(server, '/api/promotions/batches', { user: instructorUser }));
    cases.push(await request(server, '/api/promotions/year-board?academicYearId=year-1', { user: adminUser }));
    cases.push(await request(server, '/api/promotions/year-board', { user: adminUser }));
    cases.push(await request(server, `/api/promotions/batches/${IDS.batch}/clearance`, { user: adminUser }));
    cases.push(await request(server, '/api/promotions/batches/507f191e810c19729de86099/clearance', { user: adminUser }));

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

    assertCase(cases[10].status === 400 && cases[10].data?.code === 'promotion_plan_blocked' && cases[10].data?.details?.blockers?.[0]?.code === 'target_year_before_source', 'Expected a blocked plan to return 400 with its blockers.');
    assertCase(/موارد قرمز/.test(cases[10].data?.message || ''), 'Expected a blocked plan to carry a Persian message.');
    assertCase(cases[11].status === 200 && cases[11].data?.items?.[0]?.id === IDS.batch, 'Expected the batch list route to return batches.');
    assertCase(cases[12].status === 200 && cases[12].data?.item?.transactions?.length === 1, 'Expected the batch detail route to return its transactions.');
    assertCase(cases[13].status === 409 && cases[13].data?.details?.blockers?.[0]?.fullName === 'Student One', 'Expected a blocked batch rollback to return 409 with the blocking students.');
    assertCase(cases[14].status === 200 && cases[14].data?.item?.promotionOutcome === 'promoted', 'Expected the resolve route to return the resolved transaction.');
    assertCase(cases[15].status === 409 && cases[15].data?.code === 'promotion_transaction_not_held', 'Expected resolving a non-held transaction to return 409.');
    assertCase(cases[16].status === 403, 'Expected resolving to require the admin role.');
    assertCase(cases[17].status === 403, 'Expected the batch list to require the admin role.');
    assertCase(cases[18].status === 200 && cases[18].data?.classes?.[0]?.heldCount === 2, 'Expected the year board to list classes.');
    assertCase(cases[19].status === 400 && cases[19].data?.code === 'promotion_board_year_required', 'Expected the year board to require a year.');
    assertCase(cases[20].status === 200 && cases[20].data?.summary?.cleared === 1, 'Expected the clearance route to return the graduates.');
    assertCase(cases[21].status === 404, 'Expected the clearance of an unknown batch to be 404.');

    const ruleCreateLog = findActivity('promotion_rule_create');
    const applyLog = findActivity('promotion_apply');
    const rollbackLog = findActivity('promotion_rollback');

    assertCase(ruleCreateLog?.targetType === 'promotion_rule' && ruleCreateLog?.targetId === IDS.rule, 'Expected promotion rule creation to write an activity log.');
    assertCase(applyLog?.targetType === 'promotion_batch' && applyLog?.targetId === IDS.batch, 'Expected promotion apply to write an activity log for its batch.');
    assertCase(applyLog?.meta?.promotionSessionId === IDS.session, 'Expected promotion apply activity log to keep the exam session.');
    assertCase(Number(applyLog?.meta?.transactionCount || 0) === 1, 'Expected promotion apply activity log to include transaction count.');
    assertCase(rollbackLog?.targetType === 'promotion_transaction' && rollbackLog?.targetId === IDS.tx, 'Expected promotion rollback to write an activity log.');
    assertCase(rollbackLog?.reason === 'operator review', 'Expected promotion rollback activity log to include rollback reason.');
    assertCase(!findActivity('promotion_batch_rollback'), 'Expected a refused batch rollback to write no activity log.');
    const resolveLog = findActivity('promotion_resolve');
    assertCase(resolveLog?.targetId === IDS.heldTx && resolveLog?.meta?.decision === 'promoted', 'Expected resolving a held student to write an activity log.');

    // One person approves a promotion (agreed 2026-10-04); the school manager
    // and the general presidency must always be among those who can.
    const { resolvePermissions } = require('../utils/permissions');
    for (const level of ['school_manager', 'general_president']) {
      const permissions = new Set(resolvePermissions({ role: 'admin', orgRole: level, adminLevel: level, explicitPermissions: [] }));
      assertCase(permissions.has('education.promotions.manage'), `Expected ${level} to manage promotions by default.`);
      assertCase(permissions.has('view_reports'), `Expected ${level} to see promotion batches by default.`);
    }

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
