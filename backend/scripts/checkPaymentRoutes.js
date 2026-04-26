const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  student1: '507f1f77bcf86cd799439011',
  class1: '507f191e810c19729de86101',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb',
  bill1: 'bill-1'
};

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const bills = [
  {
    _id: IDS.bill1,
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    amountDue: 1000,
    amountPaid: 0,
    status: 'new',
    dueDate: new Date('2026-04-15T00:00:00.000Z'),
    paidAt: null,
    installments: [],
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z')
  }
];

const receipts = [];
let receiptSerial = 0;
const activityCalls = [];

const asComparable = (value) => {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const matchCondition = (actualValue, expectedValue) => {
  if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue) && !(expectedValue instanceof Date)) {
    if ('$in' in expectedValue) return expectedValue.$in.some((value) => asComparable(actualValue) === String(value));
    if ('$exists' in expectedValue) {
      const exists = actualValue !== undefined;
      return Boolean(expectedValue.$exists) === exists;
    }
  }
  return asComparable(actualValue) === String(expectedValue);
};

const matchesFilter = (item, filter = {}) => Object.entries(filter).every(([key, expected]) => {
  if (key === '$or') {
    return Array.isArray(expected) && expected.some((branch) => matchesFilter(item, branch));
  }
  if (key === '$and') {
    return Array.isArray(expected) && expected.every((branch) => matchesFilter(item, branch));
  }
  return matchCondition(item[key], expected);
});

const persistBill = (doc) => {
  const plain = { ...doc };
  delete plain.save;
  delete plain.toObject;
  plain.updatedAt = new Date();
  const index = bills.findIndex((item) => String(item._id) === String(plain._id));
  bills[index] = clone(plain);
  return plain;
};

const createBillDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistBill(this);
    return this;
  };
  doc.toObject = function toObject() {
    const next = { ...this };
    delete next.save;
    delete next.toObject;
    return next;
  };
  return doc;
};

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.sortSpec = null;
  }

  sort(spec = null) {
    this.sortSpec = spec;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = this.executor();
      if (Array.isArray(value) && this.sortSpec && typeof this.sortSpec === 'object') {
        const [sortKey, sortDir] = Object.entries(this.sortSpec)[0] || [];
        value = [...value].sort((left, right) => {
          const a = left?.[sortKey];
          const b = right?.[sortKey];
          if (a === b) return 0;
          return sortDir < 0 ? (a < b ? 1 : -1) : (a < b ? -1 : 1);
        });
      }
      return Array.isArray(value) ? value[0] || null : value;
    });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

const FinanceBillMock = {
  findOne(filter = {}) {
    return new MockQuery(() => createBillDoc(bills.find((item) => matchesFilter(item, filter)) || null));
  }
};

const FinanceReceiptMock = {
  async create(payload = {}) {
    const receipt = {
      _id: `receipt-${++receiptSerial}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(payload)
    };
    receipts.push(receipt);
    return clone(receipt);
  }
};

const authMock = {
  requireAuth(req, res, next) {
    const raw = req.get('x-test-user');
    if (!raw) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    req.user = JSON.parse(raw);
    return next();
  }
};

const classScopeMock = {
  normalizeText(value = '') {
    return String(value || '').trim();
  },
  async resolveClassCourseReference({ classId = '', courseId = '' } = {}) {
    const normalizedClassId = String(classId || '').trim();
    const normalizedCourseId = String(courseId || '').trim();

    if (normalizedClassId && normalizedClassId !== IDS.class1) {
      return { error: 'Class is invalid.' };
    }
    if (normalizedCourseId && ![IDS.course1, IDS.course2].includes(normalizedCourseId)) {
      return { error: 'Course is invalid.' };
    }
    if (!normalizedClassId && !normalizedCourseId) {
      return { classId: '', courseId: '', schoolClass: null, course: null };
    }
    if (normalizedCourseId === IDS.course2) {
      return {
        classId: '',
        courseId: IDS.course2,
        schoolClass: null,
        course: { _id: IDS.course2 }
      };
    }
    return {
      classId: IDS.class1,
      courseId: IDS.course1,
      schoolClass: { _id: IDS.class1, title: 'Class One Core' },
      course: { _id: IDS.course1, title: 'Class One' }
    };
  }
};

function loadPaymentRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'paymentRoutes.js');
  const originalLoad = Module._load;
  const envMock = {
    isProduction() {
      return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    }
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isPaymentRoute = parentFile.endsWith('/routes/paymentRoutes.js');
    if (isPaymentRoute && request === '../models/FinanceBill') return FinanceBillMock;
    if (isPaymentRoute && request === '../models/FinanceReceipt') return FinanceReceiptMock;
    if (isPaymentRoute && request === '../middleware/auth') return authMock;
    if (isPaymentRoute && request === '../utils/activity') {
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
    if (isPaymentRoute && request === '../utils/env') return envMock;
    if (isPaymentRoute && request === '../utils/classScope') return classScopeMock;
    if (isPaymentRoute && request === '../utils/studentFinanceSync') {
      return { syncStudentFinanceFromFinanceReceipt: async () => ({ ok: true }) };
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

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer(envOverrides = {}) {
  const previousEnv = {};
  Object.entries(envOverrides).forEach(([key, value]) => {
    previousEnv[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined;
    if (value == null) delete process.env[key];
    else process.env[key] = String(value);
  });

  const paymentRouter = loadPaymentRouter();
  const app = express();
  app.use(express.json());
  app.use('/api/payments', paymentRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      server.__restoreEnv = () => {
        Object.entries(previousEnv).forEach(([key, value]) => {
          if (value == null) delete process.env[key];
          else process.env[key] = value;
        });
      };
      resolve(server);
    });
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
  const studentUser = { id: IDS.student1, role: 'student' };

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
    }
  };

  try {
    await check('route smoke: simulate payment requires authentication', async () => {
      const response = await request(server, '/api/payments/simulate', {
        method: 'POST',
        body: { classId: IDS.class1, amount: 200 }
      });
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: simulate payment rejects missing open bill', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/payments/simulate', {
        method: 'POST',
        user: studentUser,
        body: { courseId: IDS.course2, amount: 200 }
      });
      assertCase(response.status === 404, `expected 404, received ${response.status}: ${response.text}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'payment_simulate_rejected', 'expected rejection activity log');
      assertCase(activity?.reason === 'bill_not_found', 'expected bill_not_found reason');
    });

    await check('route smoke: simulate payment is disabled in production unless explicitly enabled', async () => {
      const disabledServer = await createServer({ NODE_ENV: 'production', PAYMENT_SIMULATION_ENABLED: 'false' });
      try {
        const activityCount = activityCalls.length;
        const response = await request(disabledServer, '/api/payments/simulate', {
          method: 'POST',
          user: studentUser,
          body: { classId: IDS.class1, amount: 200 }
        });
        assertCase(response.status === 403, `expected 403, received ${response.status}: ${response.text}`);
        assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
        assertCase(String(response.headers['x-environment-guard'] || '') === 'PAYMENT_SIMULATION_ENABLED', 'expected environment guard header');
        assertCase(response.data?.disabled === true, 'expected disabled payload');
        assertCase(String(response.data?.guard || '') === 'PAYMENT_SIMULATION_ENABLED', 'expected guard field in payload');
        const activity = activityCalls[activityCount];
        assertCase(activity?.action === 'payment_simulate_blocked', 'expected blocked activity log');
        assertCase(activity?.reason === 'environment_guard', 'expected environment guard reason');
      } finally {
        await new Promise((resolve) => disabledServer.close(resolve));
        disabledServer.__restoreEnv?.();
      }
    });

    await check('route smoke: simulate payment writes canonical finance receipt and settles the bill', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/payments/simulate', {
        method: 'POST',
        user: studentUser,
        body: { classId: IDS.class1, amount: 250 }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/finance/student/receipts'), 'expected canonical finance receipt replacement');
      assertCase(String(response.headers['x-legacy-helper'] || '') === 'true', 'expected legacy helper header');
      assertCase(String(response.headers['x-environment-guard'] || '') === 'PAYMENT_SIMULATION_ENABLED', 'expected environment guard header');
      assertCase(response.data?.receiptId === 'receipt-1', 'expected a created receipt id');
      assertCase(response.data?.billStatus === 'partial', `expected partial bill status, received ${response.data?.billStatus}`);
      assertCase(receipts.length === 1, `expected 1 created receipt, received ${receipts.length}`);
      assertCase(receipts[0].status === 'approved', `expected approved receipt, received ${receipts[0].status}`);
      assertCase(receipts[0].approvalStage === 'completed', `expected completed approval stage, received ${receipts[0].approvalStage}`);
      assertCase(String(receipts[0].classId || '') === IDS.class1, `expected canonical classId, received ${receipts[0].classId}`);
      assertCase(bills[0].amountPaid === 250, `expected amountPaid=250, received ${bills[0].amountPaid}`);
      assertCase(bills[0].status === 'partial', `expected bill partial, received ${bills[0].status}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'payment_simulate_receipt', 'expected success activity log');
      assertCase(activity?.targetType === 'FinanceReceipt', 'expected FinanceReceipt activity target');
      assertCase(String(activity?.targetId || '') === 'receipt-1', 'expected receipt target id');
      assertCase(Number(activity?.meta?.settledAmount || 0) === 250, 'expected settledAmount in activity meta');
    });

    await check('route smoke: simulate payment deprecates courseId-only input', async () => {
      const response = await request(server, '/api/payments/simulate', {
        method: 'POST',
        user: studentUser,
        body: { courseId: IDS.course1, amount: 100 }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-legacy-helper'] || '') === 'true', 'expected legacy helper header');
      assertCase(String(response.headers['x-deprecated-field'] || '') === 'courseId', 'expected deprecated field header');
      assertCase(String(response.headers['x-replacement-field'] || '') === 'classId', 'expected replacement field header');
    });

    await check('route smoke: payment init is retired with replacement metadata', async () => {
      const response = await request(server, '/api/payments/init', {
        method: 'POST',
        user: studentUser,
        body: { classId: IDS.class1 }
      });
      assertCase(response.status === 410, `expected 410, received ${response.status}: ${response.text}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/finance/student/receipts'), 'expected canonical finance receipt replacement');
      assertCase(response.data?.retired === true, 'expected retired payload');
    });

    await check('route smoke: bank info is retired with replacement metadata', async () => {
      const response = await request(server, '/api/payments/bank-info');
      assertCase(response.status === 410, `expected 410, received ${response.status}: ${response.text}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/finance/student/receipts'), 'expected canonical finance receipt replacement');
      assertCase(response.data?.retired === true, 'expected retired payload');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    server.__restoreEnv?.();
  }

  const failures = cases.filter((item) => item.status === 'FAIL');
  cases.forEach((item) => {
    if (item.status === 'PASS') console.log(`PASS  ${item.label}`);
    else {
      console.error(`FAIL  ${item.label}`);
      console.error(`      ${item.error}`);
    }
  });

  if (failures.length) {
    console.error(`\nPayment route smoke failed: ${failures.length} case(s).`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nPayment route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:payment-routes] fatal error');
  console.error(error);
  process.exitCode = 1;
});
