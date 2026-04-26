const path = require('path');
const Module = require('module');
const express = require('express');

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const IDS = {
  admin: '507f191e810c19729de86001',
  student: '507f191e810c19729de86002',
  instructor: '507f191e810c19729de86003',
  course: '507f191e810c19729de86004',
  classId: '507f191e810c19729de86041',
  subject: '507f191e810c19729de86005',
  bill: '507f191e810c19729de86006',
  receipt: '507f191e810c19729de86007',
  membership: '507f191e810c19729de86070',
  order: '507f191e810c19729de86008',
  profileRequest: '507f191e810c19729de86009',
  accessRequest: '507f191e810c19729de86010',
  contact: '507f191e810c19729de86011',
  news: '507f191e810c19729de86012',
  enrollment: '507f191e810c19729de86013',
  homework: '507f191e810c19729de86014',
  grade: '507f191e810c19729de86015',
  schedule: '507f191e810c19729de86016',
  settings: '507f191e810c19729de86017',
  log1: '507f191e810c19729de86018',
  log2: '507f191e810c19729de86019'
};

const users = [
  {
    _id: IDS.admin,
    role: 'admin',
    name: 'Admin Alpha',
    email: 'admin.alpha@example.com',
    adminLevel: 'general_president',
    permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users', 'manage_schedule']
  },
  {
    _id: IDS.student,
    role: 'student',
    name: 'Alpha Student',
    email: 'alpha.student@example.com'
  },
  {
    _id: IDS.instructor,
    role: 'instructor',
    name: 'Instructor Alpha',
    email: 'instructor.alpha@example.com'
  }
];

const courses = [
  {
    _id: IDS.course,
    title: 'Alpha Class',
    description: 'Alpha class description',
    category: 'Morning',
    level: '10',
    schoolClassRef: IDS.classId,
    tags: ['Alpha', 'Mathematics'],
    createdAt: new Date('2026-03-01T08:00:00.000Z')
  }
];

const subjects = [
  {
    _id: IDS.subject,
    name: 'Alpha Math',
    code: 'ALP-01',
    grade: '10'
  }
];

const orders = [
  {
    _id: IDS.order,
    user: IDS.student,
    course: IDS.course,
    status: 'pending',
    paymentMethod: 'manual',
    approvalStage: 'finance_manager_review',
    note: 'Alpha receipt pending',
    createdAt: new Date('2026-03-04T08:00:00.000Z')
  }
];

const memberships = [
  {
    _id: IDS.membership,
    student: IDS.student,
    course: IDS.course,
    status: 'active',
    source: 'admin',
    note: 'Alpha placement',
    rejectedReason: '',
    isCurrent: true,
    legacyOrder: null,
    joinedAt: new Date('2026-03-01T08:00:00.000Z'),
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z')
  }
];

const financeBills = [  {
    _id: IDS.bill,
    billNumber: 'BL-ALPHA-0001',
    student: IDS.student,
    course: IDS.course,
    academicYear: '1405',
    term: '1',
    periodLabel: 'Alpha Term',
    status: 'overdue',
    currency: 'AFN',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 0,
    note: 'Alpha tuition',
    createdAt: new Date('2026-03-02T08:00:00.000Z')
  }
];

const financeReceipts = [
  {
    _id: IDS.receipt,
    bill: IDS.bill,
    student: IDS.student,
    course: IDS.course,
    amount: 250,
    status: 'pending',
    approvalStage: 'finance_manager_review',
    paymentMethod: 'bank_transfer',
    referenceNo: 'ALPHA-TX-001',
    note: 'Alpha payment',
    createdAt: new Date('2026-03-03T08:00:00.000Z')
  }
];

const feeOrders = [
  {
    _id: IDS.bill,
    orderNumber: 'BL-ALPHA-0001',
    student: IDS.student,
    course: IDS.course,
    classId: IDS.classId,
    status: 'overdue',
    currency: 'AFN',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 0,
    note: 'Alpha tuition',
    createdAt: new Date('2026-03-02T08:00:00.000Z')
  }
];

const feePayments = [
  {
    _id: IDS.receipt,
    feeOrderId: IDS.bill,
    student: IDS.student,
    classId: IDS.classId,
    amount: 250,
    status: 'pending',
    approvalStage: 'finance_manager_review',
    paymentMethod: 'bank_transfer',
    referenceNo: 'ALPHA-TX-001',
    note: 'Alpha payment',
    createdAt: new Date('2026-03-03T08:00:00.000Z')
  }
];

const profileRequests = [
  {
    _id: IDS.profileRequest,
    user: IDS.student,
    status: 'pending',
    requestedData: {
      name: 'Alpha Student',
      email: 'alpha.student@example.com'
    },
    followUp: {
      assignedLevel: 'finance_manager',
      status: 'new',
      note: 'Alpha change request'
    },
    createdAt: new Date('2026-03-02T09:00:00.000Z')
  }
];

const accessRequests = [
  {
    _id: IDS.accessRequest,
    requester: IDS.instructor,
    permission: 'view_reports',
    route: '/alpha-dashboard',
    requestNote: 'Alpha analytics access',
    decisionNote: '',
    status: 'pending',
    createdAt: new Date('2026-03-01T10:00:00.000Z')
  }
];

const contacts = [
  {
    _id: IDS.contact,
    name: 'Alpha Guardian',
    email: 'guardian.alpha@example.com',
    message: 'Alpha support request',
    status: 'new',
    followUp: {
      assignedLevel: 'finance_manager',
      status: 'new',
      note: 'Alpha support'
    },
    createdAt: new Date('2026-03-05T11:00:00.000Z')
  }
];

const newsItems = [
  {
    _id: IDS.news,
    title: 'Alpha Bulletin',
    content: 'Alpha update for administrators',
    createdAt: new Date('2026-03-04T06:00:00.000Z')
  }
];

const enrollments = [
  {
    _id: IDS.enrollment,
    studentName: 'Alpha Student',
    fatherName: 'Parent Alpha',
    phone: '0700000000',
    email: 'alpha.student@example.com',
    status: 'pending',
    grade: '10',
    createdAt: new Date('2026-03-01T07:00:00.000Z')
  }
];

const schedules = [
  {
    _id: IDS.schedule,
    course: IDS.course,
    instructor: IDS.instructor,
    subject: 'Alpha Math',
    note: 'Alpha smart schedule',
    room: 'A1',
    shift: 'morning',
    visibility: 'draft',
    date: '2099-01-10',
    startTime: '08:00',
    endTime: '09:00'
  }
];

const homeworkItems = [
  {
    _id: IDS.homework,
    course: IDS.course,
    createdBy: IDS.instructor,
    title: 'Alpha Homework',
    description: 'Alpha practice sheet',
    dueDate: '2026-03-15',
    createdAt: new Date('2026-03-05T08:00:00.000Z')
  }
];

const grades = [
  {
    _id: IDS.grade,
    student: IDS.student,
    course: IDS.course,
    totalScore: 88,
    finalExamScore: 60,
    attachmentOriginalName: 'Alpha-sheet.pdf',
    updatedAt: new Date('2026-03-05T12:00:00.000Z')
  }
];

const siteSettings = {
  _id: IDS.settings,
  brandName: 'Alpha Academy',
  brandSubtitle: 'Admin Suite',
  contactLabel: 'Call Alpha',
  contactPhone: '0700123456',
  contactEmail: 'alpha@academy.test',
  contactAddress: 'Alpha Street',
  topSearchPlaceholder: 'Search Alpha',
  mainMenu: [
    { title: 'Alpha Menu', href: '/alpha', children: [{ title: 'Alpha Child', href: '/alpha/child' }] }
  ],
  adminQuickLinks: [
    { title: 'Alpha Reports', href: '/admin-logs' }
  ],
  footerLinks: [
    { title: 'Alpha Footer', href: '/alpha/footer' }
  ],
  socialLinks: [
    { title: 'Alpha Social', href: 'https://example.com/alpha' }
  ]
};

const activityLogs = [
  {
    _id: IDS.log1,
    actor: IDS.admin,
    actorRole: 'admin',
    action: 'alpha_review',
    targetType: 'finance',
    reason: 'Alpha audit trail',
    route: '/admin-finance',
    ip: '127.0.0.1',
    clientDevice: 'Desktop',
    createdAt: new Date('2026-03-06T10:00:00.000Z')
  },
  {
    _id: IDS.log2,
    actor: IDS.admin,
    actorRole: 'admin',
    action: 'admin_access_matrix_export_csv',
    targetType: 'report',
    reason: '',
    route: '/admin',
    ip: '127.0.0.2',
    clientDevice: 'Desktop',
    createdAt: new Date('2026-03-05T10:00:00.000Z')
  }
];

const asComparable = (value) => {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const asSortable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.getTime();
  return String(value ?? '');
};

const getValuesAtPath = (source, dottedPath) => {
  const parts = String(dottedPath || '').split('.').filter(Boolean);
  const walk = (value, index) => {
    if (index >= parts.length) {
      if (Array.isArray(value)) return value.flatMap((item) => walk(item, index));
      return [value];
    }
    if (Array.isArray(value)) {
      return value.flatMap((item) => walk(item, index));
    }
    if (value == null || typeof value !== 'object') return [];
    return walk(value[parts[index]], index + 1);
  };
  const values = walk(source, 0).filter((value) => value !== undefined);
  return values.length ? values : [undefined];
};

const matchValue = (actual, expected) => {
  if (expected instanceof RegExp) {
    return expected.test(String(actual ?? ''));
  }

  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    if ('$regex' in expected) {
      const regex = expected.$regex instanceof RegExp
        ? expected.$regex
        : new RegExp(String(expected.$regex || ''), String(expected.$options || ''));
      return regex.test(String(actual ?? ''));
    }
    if ('$in' in expected) {
      return Array.isArray(expected.$in) && expected.$in.some((item) => asComparable(actual) === asComparable(item));
    }
    if ('$ne' in expected) {
      return asComparable(actual) !== asComparable(expected.$ne);
    }
    if ('$gte' in expected || '$gt' in expected || '$lte' in expected || '$lt' in expected) {
      const current = asSortable(actual);
      if ('$gte' in expected && current < asSortable(expected.$gte)) return false;
      if ('$gt' in expected && current <= asSortable(expected.$gt)) return false;
      if ('$lte' in expected && current > asSortable(expected.$lte)) return false;
      if ('$lt' in expected && current >= asSortable(expected.$lt)) return false;
      return true;
    }
  }

  if (expected instanceof Date) {
    return asSortable(actual) === expected.getTime();
  }

  return asComparable(actual) === asComparable(expected);
};

const matchesFilter = (item, filter = {}) => (
  Object.entries(filter || {}).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected) && expected.some((branch) => matchesFilter(item, branch));
    }
    if (key === '$and') {
      return Array.isArray(expected) && expected.every((branch) => matchesFilter(item, branch));
    }
    const values = getValuesAtPath(item, key);
    return values.some((value) => matchValue(value, expected));
  })
);

const populateValue = (field, item) => {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  if (field === 'user' && next.user) next.user = clone(users.find((entry) => String(entry._id) === String(next.user)) || next.user);
  if (field === 'course' && next.course) next.course = clone(courses.find((entry) => String(entry._id) === String(next.course)) || next.course);
  if (field === 'student' && next.student) next.student = clone(users.find((entry) => String(entry._id) === String(next.student)) || next.student);
  if (field === 'requester' && next.requester) next.requester = clone(users.find((entry) => String(entry._id) === String(next.requester)) || next.requester);
  if (field === 'instructor' && next.instructor) next.instructor = clone(users.find((entry) => String(entry._id) === String(next.instructor)) || next.instructor);
  if (field === 'createdBy' && next.createdBy) next.createdBy = clone(users.find((entry) => String(entry._id) === String(next.createdBy)) || next.createdBy);
  if (field === 'bill' && next.bill) next.bill = clone(financeBills.find((entry) => String(entry._id) === String(next.bill)) || next.bill);
  if (field === 'feeOrderId' && next.feeOrderId) next.feeOrderId = clone(feeOrders.find((entry) => String(entry._id) === String(next.feeOrderId)) || next.feeOrderId);
  if (field === 'actor' && next.actor) next.actor = clone(users.find((entry) => String(entry._id) === String(next.actor)) || next.actor);
  return next;
};

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.populateFields = [];
    this.sortSpec = null;
    this.limitValue = null;
  }

  select() {
    return this;
  }

  populate(field) {
    this.populateFields.push(field);
    return this;
  }

  sort(spec = null) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  lean() {
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = this.executor();

      if (Array.isArray(value) && this.sortSpec && typeof this.sortSpec === 'object') {
        const entries = Object.entries(this.sortSpec);
        value = [...value].sort((left, right) => {
          for (const [key, direction] of entries) {
            const leftValue = getValuesAtPath(left, key)[0];
            const rightValue = getValuesAtPath(right, key)[0];
            const comparableLeft = asSortable(leftValue);
            const comparableRight = asSortable(rightValue);
            if (comparableLeft === comparableRight) continue;
            if (direction < 0) return comparableLeft < comparableRight ? 1 : -1;
            return comparableLeft < comparableRight ? -1 : 1;
          }
          return 0;
        });
      }

      if (Array.isArray(value) && Number.isFinite(this.limitValue)) {
        value = value.slice(0, this.limitValue);
      }

      if (this.populateFields.length) {
        if (Array.isArray(value)) {
          value = value.map((item) => this.populateFields.reduce((acc, field) => populateValue(field, acc), clone(item)));
        } else {
          value = this.populateFields.reduce((acc, field) => populateValue(field, acc), clone(value));
        }
      } else {
        value = clone(value);
      }

      return value;
    });
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

const createModelMock = (records = []) => ({
  find(filter = {}) {
    return new MockQuery(() => records.filter((item) => matchesFilter(item, filter)));
  },
  findOne(filter = {}) {
    return new MockQuery(() => records.find((item) => matchesFilter(item, filter)) || null);
  },
  async countDocuments(filter = {}) {
    return records.filter((item) => matchesFilter(item, filter)).length;
  },
  async distinct(field, filter = {}) {
    const values = records
      .filter((item) => matchesFilter(item, filter))
      .flatMap((item) => getValuesAtPath(item, field))
      .filter((value) => value !== undefined);
    return Array.from(new Set(values.map((value) => asComparable(value))));
  },
  async aggregate() {
    return [];
  }
});

const UserMock = {
  ...createModelMock(users),
  findById(id) {
    return new MockQuery(() => users.find((item) => String(item._id) === String(id)) || null);
  },
  findByIdAndUpdate(id, update = {}, options = {}) {
    return new MockQuery(() => {
      const index = users.findIndex((item) => String(item._id) === String(id));
      if (index === -1) return null;
      users[index] = {
        ...users[index],
        ...clone(update),
        updatedAt: new Date('2026-03-26T13:45:00.000Z')
      };
      return options?.new ? users[index] : null;
    });
  },
  async create(payload = {}) {
    const nextId = `507f191e810c19729de86${String(users.length + 20).padStart(3, '0')}`;
    const next = {
      _id: nextId,
      createdAt: new Date('2026-03-26T13:40:00.000Z'),
      updatedAt: new Date('2026-03-26T13:40:00.000Z'),
      ...clone(payload)
    };
    users.unshift(next);
    return next;
  }
};

const SiteSettingsMock = {
  findOne(filter = {}) {
    return new MockQuery(() => (matchesFilter(siteSettings, filter) ? siteSettings : null));
  }
};

const GenericEmptyModel = createModelMock([]);

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
      if (!permission || permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadRouters() {
  const adminRoutePath = path.join(__dirname, '..', 'routes', 'adminRoutes.js');
  const adminLogRoutePath = path.join(__dirname, '..', 'routes', 'adminLogRoutes.js');
  const originalLoad = Module._load;

  const mocks = {
    '../models/User': UserMock,
    '../models/Course': createModelMock(courses),
    '../models/Order': createModelMock(orders),
    '../models/ActivityLog': createModelMock(activityLogs),
    '../models/ContactMessage': createModelMock(contacts),
    '../models/NewsItem': createModelMock(newsItems),
    '../models/Enrollment': createModelMock(enrollments),
    '../models/StudentMembership': createModelMock(memberships),
    '../models/FinanceBill': createModelMock(financeBills),
    '../models/FinanceReceipt': createModelMock(financeReceipts),
    '../models/FeeOrder': createModelMock(feeOrders),
    '../models/FeePayment': createModelMock(feePayments),
    '../models/Schedule': createModelMock(schedules),
    '../models/Homework': createModelMock(homeworkItems),
    '../models/Grade': createModelMock(grades),
    '../models/Subject': createModelMock(subjects),
    '../models/SiteSettings': SiteSettingsMock,
    '../models/Result': GenericEmptyModel,
    '../models/ProfileUpdateRequest': createModelMock(profileRequests),
    '../models/AccessRequest': createModelMock(accessRequests),
    '../models/UserNotification': GenericEmptyModel,
    '../middleware/auth': authMock,
    '../utils/activity': { logActivity: async () => {} },
    '../utils/mailer': { sendMail: async () => {} }
  };

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isAdminRoute = parentFile.endsWith('/routes/adminRoutes.js');
    const isAdminLogRoute = parentFile.endsWith('/routes/adminLogRoutes.js');

    if ((isAdminRoute || isAdminLogRoute) && Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(adminRoutePath)];
    delete require.cache[require.resolve(adminLogRoutePath)];
    return {
      adminRouter: require(adminRoutePath),
      adminLogRouter: require(adminLogRoutePath)
    };
  } finally {
    Module._load = originalLoad;
  }
}

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const { adminRouter, adminLogRouter } = loadRouters();
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use('/api/admin-logs', adminLogRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload = body;

  if (user) {
    headers['x-test-user'] = JSON.stringify(user);
  }

  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${targetPath}`, {
    method,
    headers,
    body: payload
  });

  const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
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
    id: IDS.admin,
    role: 'admin',
    permissions: ['view_reports', 'manage_content', 'manage_finance', 'manage_users', 'manage_schedule'],
    adminLevel: 'general_president'
  };
  const financeOnlyUser = {
    id: IDS.admin,
    role: 'admin',
    permissions: ['manage_finance'],
    adminLevel: 'finance_manager'
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
    await check('route smoke: alerts require authentication', async () => {
      const response = await request(server, '/api/admin/alerts');
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: alerts require view_reports permission', async () => {
      const response = await request(server, '/api/admin/alerts', { user: financeOnlyUser });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: stats are derived from canonical finance receipts', async () => {
      const response = await request(server, '/api/admin/stats', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.receipts === 1, 'expected canonical finance receipt count');
      assertCase(response.data?.pendingReceipts === 1, 'expected pending receipt count');
      assertCase(response.data?.approvedReceipts === 0, 'expected approved receipt count');
      assertCase(response.data?.orders === 1, 'expected compatibility orders alias count');
      assertCase(response.data?.pendingOrders === 1, 'expected compatibility pendingOrders alias count');
    });

    await check('route smoke: alerts return priority-sorted admin warnings', async () => {
      const response = await request(server, '/api/admin/alerts', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.summary?.pendingFinanceReceipts === 1, 'expected pending finance receipt count');
      assertCase(response.data?.summary?.overdueBills === 1, 'expected overdue bill count');
      assertCase(response.data?.summary?.draftSchedules === 1, 'expected draft schedule count');
      const alertKeys = (response.data?.alerts || []).map((item) => item.key);
      assertCase(alertKeys.length === 6, `expected 6 alerts, received ${alertKeys.length}`);
      assertCase(
        alertKeys.slice(0, 2).every((item) => item === 'finance_receipts' || item === 'finance_overdue'),
        `expected high-priority finance alerts first, received ${JSON.stringify(alertKeys)}`
      );
      assertCase(
        ['contacts', 'schedule_drafts'].includes(alertKeys[alertKeys.length - 1]),
        `expected a low-priority non-finance alert last, received ${JSON.stringify(alertKeys)}`
      );
    });

    await check('route smoke: student activity returns membership-based access rows', async () => {
      const response = await request(server, '/api/admin/students/' + IDS.student + '/activity', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.memberships?.length === 1, 'expected membership activity row');
      assertCase(response.data?.orders?.length === 1, 'expected compatibility orders alias row');
      assertCase(String(response.data?.memberships?.[0]?._id || '') === IDS.membership, 'expected membership id in student activity');
      assertCase(response.data?.memberships?.[0]?.status === 'approved', 'expected active membership to serialize as approved');
    });

    await check('route smoke: managed users list returns canonical org-role payloads', async () => {
      const response = await request(server, '/api/admin/users', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Array.isArray(response.data?.items), 'expected items array');
      assertCase(response.data?.items?.length >= 3, `expected seeded users, received ${response.data?.items?.length || 0}`);
      assertCase(response.data?.items?.some((item) => item.orgRole === 'general_president'), 'expected general_president payload');
      assertCase(response.data?.items?.some((item) => item.role === 'instructor'), 'expected instructor payload');
    });

    await check('route smoke: managed user creation supports finance lead and instructor roles', async () => {
      const financeLeadResponse = await request(server, '/api/admin/users', {
        method: 'POST',
        user: adminUser,
        body: {
          name: 'Finance Lead User',
          email: 'finance.lead.user@example.com',
          password: 'secret123',
          orgRole: 'finance_lead',
          status: 'active',
          permissions: ['manage_users']
        }
      });
      assertCase(financeLeadResponse.status === 201, `expected 201, received ${financeLeadResponse.status}`);
      assertCase(financeLeadResponse.data?.item?.orgRole === 'finance_lead', 'expected created finance lead org role');
      assertCase(financeLeadResponse.data?.item?.role === 'admin', 'expected finance lead compatibility role');
      assertCase(financeLeadResponse.data?.item?.adminLevel === 'finance_lead', 'expected finance lead admin level');
      assertCase((financeLeadResponse.data?.item?.permissions || []).length === 0, 'expected locked finance lead permissions to be stored empty');

      const instructorResponse = await request(server, '/api/admin/users', {
        method: 'POST',
        user: adminUser,
        body: {
          name: 'Instructor User',
          email: 'instructor.user@example.com',
          password: 'secret123',
          orgRole: 'instructor',
          status: 'active',
          subject: 'ریاضی'
        }
      });
      assertCase(instructorResponse.status === 201, `expected 201, received ${instructorResponse.status}`);
      assertCase(instructorResponse.data?.item?.orgRole === 'instructor', 'expected created instructor org role');
      assertCase(instructorResponse.data?.item?.role === 'instructor', 'expected instructor compatibility role');
    });

    await check('route smoke: managed user edit updates profile, password, role, and permissions', async () => {
      const response = await request(server, `/api/admin/users/${IDS.instructor}`, {
        method: 'PUT',
        user: adminUser,
        body: {
          name: 'Instructor Updated',
          email: 'instructor.updated@example.com',
          password: 'secret456',
          orgRole: 'finance_manager',
          status: 'inactive',
          grade: '12',
          subject: 'فزیک',
          permissions: ['manage_users', 'manage_finance']
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.item?.name === 'Instructor Updated', 'expected updated user name');
      assertCase(response.data?.item?.email === 'instructor.updated@example.com', 'expected updated user email');
      assertCase(response.data?.item?.orgRole === 'finance_manager', 'expected updated org role');
      assertCase(response.data?.item?.role === 'admin', 'expected compatibility admin role after finance assignment');
      assertCase(response.data?.item?.status === 'inactive', 'expected updated status');
      assertCase((response.data?.item?.permissions || []).length === 0, 'expected locked finance permissions to remain empty');
    });

    await check('route smoke: global search returns expanded phase-9 sections', async () => {
      const response = await request(server, '/api/admin/search?q=Alpha', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      const payload = response.data || {};
      assertCase((payload.users?.length || 0) >= 2, `expected at least 2 users to match Alpha query, received ${payload.users?.length || 0}`);
      assertCase(payload.memberships?.length === 1, 'expected membership search result');
      assertCase(payload.orders?.length === 1, 'expected compatibility order alias search result');
      assertCase(payload.financeBills?.length === 1, 'expected finance bill result');
      assertCase(payload.financeReceipts?.length === 1, 'expected finance receipt result');
      assertCase(payload.courses?.length === 1, 'expected course result');
      assertCase(String(payload.courses?.[0]?.classId || '') === IDS.classId, 'expected canonical classId on course search result');
      assertCase(payload.schedules?.length === 1, 'expected schedule result');
      assertCase(payload.homework?.length === 1, 'expected homework result');
      assertCase(payload.grades?.length === 1, 'expected grade result');
      assertCase(payload.subjects?.length === 1, 'expected subject result');
      assertCase(payload.requests?.length === 1, 'expected profile request result');
      assertCase(payload.accessRequests?.length === 1, 'expected access request result');
      assertCase(payload.contacts?.length === 1, 'expected contact result');
      assertCase(payload.news?.length === 1, 'expected news result');
      assertCase(payload.logs?.length >= 1, 'expected activity log result');
      assertCase(payload.enrollments?.length === 1, 'expected enrollment result');
      assertCase(payload.settings?.length === 1, 'expected settings result');
    });

    await check('route smoke: admin log export returns csv attachment', async () => {
      const response = await request(server, '/api/admin-logs/export.csv', { user: adminUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['content-type'] || '').includes('text/csv'), 'expected csv content-type');
      assertCase(String(response.headers['content-disposition'] || '').includes('admin-activity-logs.csv'), 'expected attachment filename');
      assertCase(response.text.includes('createdAt,actor,actorName,actorEmail,actorRole,actorOrgRole,action'), 'expected csv header');
      assertCase(response.text.includes('alpha_review'), 'expected alpha log row');
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
    console.error(`\nAdmin route smoke failed: ${failures.length} case(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAdmin route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:admin-routes] fatal error');
  console.error(error);
  process.exit(1);
});
