const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  student: '507f191e810c19729de86002',
  outsider: '507f191e810c19729de86003',
  membership: '507f191e810c19729de86004',
  order: '507f191e810c19729de86005',
  orderDirect: '507f191e810c19729de86015',
  discount: '507f191e810c19729de86006',
  exemption: '507f191e810c19729de86007',
  payment: '507f191e810c19729de86008',
  paymentDirect: '507f191e810c19729de86018'
};
const activityCalls = [];
const financeActionCalls = [];
const archivedDocuments = [];
const discountRegistry = [
  {
    id: IDS.discount,
    discountType: 'discount',
    amount: 120,
    reason: 'Merit scholarship',
    status: 'active',
    student: { userId: IDS.student, fullName: 'Alpha Student' },
    schoolClass: { id: 'class-1', title: 'Class 10 A' },
    academicYear: { id: 'year-1', title: '1406' }
  }
];
const exemptionRegistry = [
  {
    id: IDS.exemption,
    exemptionType: 'full',
    scope: 'all',
    amount: 0,
    percentage: 100,
    reason: 'Sponsored seat',
    status: 'active',
    student: { userId: IDS.student, fullName: 'Alpha Student' },
    schoolClass: { id: 'class-1', title: 'Class 10 A' },
    academicYear: { id: 'year-1', title: '1406' }
  }
];
const reliefRegistry = [
  {
    id: 'relief-1',
    sourceModel: 'fee_exemption',
    sourceKey: `fee_exemption:${IDS.exemption}`,
    reliefType: 'free_student',
    scope: 'all',
    coverageMode: 'full',
    amount: 0,
    percentage: 100,
    reason: 'Sponsored seat',
    status: 'active',
    student: { userId: IDS.student, fullName: 'Alpha Student' },
    schoolClass: { id: 'class-1', title: 'Class 10 A' },
    academicYear: { id: 'year-1', title: '1406' }
  }
];

const serviceMock = {
  async listStudentFinanceReferenceData() {
    return {
      academicYears: [{ id: 'year-1', title: '1406' }],
      classes: [{ id: 'class-1', title: 'Class 10 A' }],
      memberships: [{ id: IDS.membership }],
      sessions: []
    };
  },
  async listFeeOrders() {
    return [{ id: IDS.order, orderNumber: 'BL-1406-0001' }];
  },
  async listFeePayments() {
    return [{ id: 'pay-1', paymentNumber: 'PAY-0001' }];
  },
  async getFeePaymentReceipt(paymentId) {
    if (String(paymentId) !== IDS.payment) {
      throw new Error('student_finance_payment_not_found');
    }
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      item: {
        id: IDS.payment,
        paymentNumber: 'PAY-0001',
        amount: 3000
      },
      receipt: {
        paymentId,
        paymentNumber: 'PAY-0001',
        amount: 3000,
        currency: 'AFN',
        allocations: [
          { feeOrderId: IDS.order, amount: 1500 },
          { feeOrderId: IDS.orderDirect, amount: 1500 }
        ]
      }
    };
  },
  async getDailyCashierReport() {
    return {
      date: '2026-03-20',
      summary: {
        totalPayments: 2,
        totalCollected: 3000,
        approvedPayments: 1,
        pendingPayments: 1,
        rejectedPayments: 0,
        approvedAmount: 1500,
        pendingAmount: 1500,
        rejectedAmount: 0
      },
      methodTotals: [
        { method: 'cash', amount: 3000, count: 2 }
      ],
      cashiers: [
        { id: IDS.admin, name: 'Finance Admin', amount: 3000, count: 2 }
      ],
      items: [
        { id: IDS.payment, paymentNumber: 'PAY-0001' }
      ]
    };
  },
  async listOpenFeeOrdersForMembership(membershipId) {
    if (String(membershipId) !== IDS.membership) {
      throw new Error('student_finance_membership_not_found');
    }
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      items: [
        { id: IDS.order, orderNumber: 'BL-1406-0001', title: 'حمل 1406', outstandingAmount: 1500 },
        { id: IDS.orderDirect, orderNumber: 'BL-1406-0002', title: 'ثور 1406', outstandingAmount: 1500 }
      ],
      summary: {
        totalOrders: 2,
        totalOutstanding: 3000
      }
    };
  },
  async previewFeePaymentAllocation(payload = {}) {
    if (String(payload.studentMembershipId || '') !== IDS.membership) {
      throw new Error('student_finance_membership_not_found');
    }
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      amount: Number(payload.amount || 0),
      currency: 'AFN',
      allocationMode: payload.allocationMode || 'auto_oldest_due',
      totalOutstanding: 3000,
      totalAllocated: Number(payload.amount || 0),
      remainingAmount: 0,
      allocations: [
        { feeOrderId: IDS.order, title: 'حمل 1406', orderNumber: 'BL-1406-0001', amount: 1500 },
        { feeOrderId: IDS.orderDirect, title: 'ثور 1406', orderNumber: 'BL-1406-0002', amount: 1500 }
      ],
      openOrders: [
        { id: IDS.order, orderNumber: 'BL-1406-0001' },
        { id: IDS.orderDirect, orderNumber: 'BL-1406-0002' }
      ]
    };
  },
  async createFeePayment(payload = {}) {
    if (String(payload.studentMembershipId || '') !== IDS.membership) {
      throw new Error('student_finance_membership_not_found');
    }
    return {
      id: 'pay-created',
      paymentNumber: 'PAY-CREATED',
      amount: Number(payload.amount || 0),
      paymentMethod: payload.paymentMethod || 'cash',
      allocations: [
        { feeOrderId: IDS.order, title: 'حمل 1406', orderNumber: 'BL-1406-0001', amount: 1500 },
        { feeOrderId: IDS.orderDirect, title: 'ثور 1406', orderNumber: 'BL-1406-0002', amount: 1500 }
      ],
      student: { userId: IDS.student, fullName: 'Alpha Student' }
    };
  },
  async listDiscounts() {
    return discountRegistry;
  },
  async listFinanceReliefs() {
    return reliefRegistry;
  },
  async createDiscount(payload) {
    return {
      id: 'dis-new',
      discountType: payload.discountType || 'discount',
      amount: Number(payload.amount || 0),
      reason: payload.reason || '',
      student: { userId: IDS.student, fullName: 'Alpha Student' }
    };
  },
  async cancelDiscount(id, payload) {
    return {
      id,
      discountType: 'discount',
      amount: 120,
      reason: payload.reason || '',
      student: { userId: IDS.student, fullName: 'Alpha Student' }
    };
  },
  async listFeeExemptions() {
    return exemptionRegistry;
  },
  async createFeeExemption(payload) {
    return {
      id: 'ex-new',
      exemptionType: payload.exemptionType || 'full',
      scope: payload.scope || 'all',
      amount: Number(payload.amount || 0),
      percentage: payload.exemptionType === 'partial' ? Number(payload.percentage || 0) : 100,
      student: { userId: IDS.student, fullName: 'Alpha Student' }
    };
  },
  async cancelFeeExemption(id, payload) {
    return {
      id,
      exemptionType: 'full',
      scope: 'all',
      amount: 0,
      percentage: 100,
      cancelReason: payload.cancelReason || '',
      student: { userId: IDS.student, fullName: 'Alpha Student' }
    };
  },
  async listTransportFees() {
    return [{ id: 'tr-1', title: 'Bus Fee' }];
  },
  async createTransportFee(payload) {
    return { id: 'tr-2', title: payload.title || 'Bus Fee' };
  },
  async listStudentMembershipOverviewsByUserId(userId) {
    if (String(userId) !== IDS.student) return [];
    return [{
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' },
        schoolClass: { id: 'class-1', title: 'Class 10 A' },
        academicYear: { id: 'year-1', title: '1406' }
      },
      summary: { totalOrders: 1, totalOutstanding: 100 },
      statement: {
        generatedAt: '2026-03-20T08:00:00.000Z',
        totals: { totalOrders: 1, totalOutstanding: 100, totalPaid: 0 }
      },
      eligibilitySummary: { feeStatus: 'due', eligible: false },
      orders: [{ id: IDS.order }],
      payments: [],
      discounts: [],
      reliefs: reliefRegistry,
      exemptions: [],
      transportFees: []
    }];
  },
  async getMembershipFinanceOverview(membershipId) {
    if (String(membershipId) !== IDS.membership) return null;
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      summary: { totalOrders: 1, totalOutstanding: 100, totalReliefs: 1 },
      statement: {
        generatedAt: '2026-03-20T08:00:00.000Z',
        totals: { totalOrders: 1, totalOutstanding: 100, totalPaid: 0, totalReliefs: 1 }
      },
      orders: [{ id: IDS.order }],
      payments: [],
      discounts: [],
      reliefs: reliefRegistry,
      exemptions: [],
      transportFees: []
    };
  },
  async getMembershipFinanceStatement(membershipId) {
    if (String(membershipId) !== IDS.membership) return null;
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      summary: { totalOrders: 1, totalOutstanding: 100, totalReliefs: 1 },
      statement: {
        generatedAt: '2026-03-20T08:00:00.000Z',
        totals: { totalOrders: 1, totalOutstanding: 100, totalPaid: 0, totalReliefs: 1 }
      },
      orders: [{ id: IDS.order }],
      payments: [{ id: 'pay-1', paymentNumber: 'PAY-0001' }],
      reliefs: reliefRegistry
    };
  },
  async getExamEligibility({ studentMembershipId }) {
    if (String(studentMembershipId) !== IDS.membership) return null;
    return {
      membership: {
        id: IDS.membership,
        student: { userId: IDS.student, fullName: 'Alpha Student' }
      },
      session: null,
      summary: {
        totalOrders: 1,
        totalOutstanding: 100,
        overdueOrders: 0,
        pendingPayments: 0,
        feeStatus: 'due',
        eligible: false
      },
      blockingOrders: [{ id: IDS.order }],
      payments: []
    };
  }
};

const financeAdminActionServiceMock = {
  async addFeeOrderAdjustmentAction({ feeOrderId, body = {} } = {}) {
    financeActionCalls.push({ route: 'order-discount', feeOrderId, body });
    return { item: { _id: feeOrderId }, message: 'Discount handled canonically' };
  },
  async setFeeOrderInstallmentsAction({ feeOrderId, body = {} } = {}) {
    financeActionCalls.push({ route: 'order-installments', feeOrderId, body });
    return { item: { _id: feeOrderId }, message: 'Installments handled canonically' };
  },
  async voidFeeOrderAction({ feeOrderId, body = {} } = {}) {
    financeActionCalls.push({ route: 'order-void', feeOrderId, body });
    return { item: { _id: feeOrderId }, message: 'Void handled canonically' };
  },
  async approveFeePaymentAction({ feePaymentId, body = {} } = {}) {
    financeActionCalls.push({ route: 'payment-approve', feePaymentId, body });
    return { message: 'Receipt approved', nextStage: 'finance_lead_review', requiresFinalApproval: true };
  },
  async rejectFeePaymentAction({ feePaymentId, body = {} } = {}) {
    financeActionCalls.push({ route: 'payment-reject', feePaymentId, body });
    return { message: 'Receipt rejected', nextStage: 'rejected' };
  },
  async updateFeePaymentFollowUpAction({ feePaymentId, body = {} } = {}) {
    financeActionCalls.push({ route: 'payment-follow-up', feePaymentId, body });
    return {
      item: {
        id: feePaymentId,
        followUp: {
          assignedLevel: body.assignedLevel || 'finance_manager',
          status: body.status || 'new',
          note: body.note || ''
        }
      },
      message: 'Follow-up updated canonically'
    };
  }
};

const financeDocumentArchiveMock = {
  async buildFinanceDocumentDescriptor({ documentType = 'student_statement' } = {}) {
    return {
      documentNo: `DOC-${documentType}-001`,
      verificationCode: `VERIFY-${documentType}-001`,
      verificationUrl: `http://127.0.0.1/verify/${documentType}`,
      verificationQrBuffer: Buffer.from('qr')
    };
  },
  async createFinanceDocumentArchive(payload = {}) {
    const item = {
      documentNo: payload?.descriptor?.documentNo || 'DOC-student_statement-001',
      verification: {
        code: payload?.descriptor?.verificationCode || 'VERIFY-student_statement-001',
        url: payload?.descriptor?.verificationUrl || 'http://127.0.0.1/verify/student_statement'
      },
      filename: payload?.filename || 'statement.pdf',
      documentType: payload?.documentType || 'student_statement'
    };
    archivedDocuments.push(item);
    return item;
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

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'studentFinanceRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/studentFinanceRoutes.js');
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
    if (isRouteFile && request === '../services/studentFinanceService') return serviceMock;
    if (isRouteFile && request === '../services/financeAdminActionService') return financeAdminActionServiceMock;
    if (isRouteFile && request === '../utils/financeDocumentArchive') return financeDocumentArchiveMock;
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
  app.use('/api/student-finance', router);
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
  return {
    status: response.status,
    data,
    text,
    headers: Object.fromEntries(response.headers.entries())
  };
}

async function run() {
  const server = await createServer();
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_finance'] };
  const studentUser = { id: IDS.student, role: 'student', permissions: [] };
  const outsiderUser = { id: IDS.outsider, role: 'student', permissions: [] };

  try {
    const cases = [];
    cases.push(await request(server, '/api/student-finance/reference-data'));
    cases.push(await request(server, '/api/student-finance/reference-data', { user: { id: IDS.admin, role: 'admin', permissions: [] } }));
    cases.push(await request(server, '/api/student-finance/reference-data', { user: adminUser }));
    cases.push(await request(server, '/api/student-finance/orders', { user: adminUser }));
    cases.push(await request(server, `/api/student-finance/payments/${IDS.payment}/receipt`, { user: adminUser }));
    cases.push(await request(server, '/api/student-finance/reports/daily-cashier?date=2026-03-20', { user: adminUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/open-orders`, { user: adminUser }));
    cases.push(await request(server, '/api/student-finance/payments/preview-allocation', {
      method: 'POST',
      user: adminUser,
      body: {
        studentMembershipId: IDS.membership,
        amount: 3000,
        allocationMode: 'auto_oldest_due'
      }
    }));
    cases.push(await request(server, '/api/student-finance/discounts', { user: adminUser }));
    cases.push(await request(server, '/api/student-finance/reliefs', { user: adminUser }));
    const activityStart = activityCalls.length;
    cases.push(await request(server, '/api/student-finance/payments', {
      method: 'POST',
      user: adminUser,
      body: {
        studentMembershipId: IDS.membership,
        amount: 3000,
        paymentMethod: 'cash',
        allocationMode: 'auto_oldest_due',
        note: 'Desk payment'
      }
    }));
    cases.push(await request(server, '/api/student-finance/discounts', {
      method: 'POST',
      user: adminUser,
      body: {
        student: IDS.student,
        classId: 'class-1',
        academicYearId: 'year-1',
        discountType: 'discount',
        amount: 150,
        reason: 'Scholarship support'
      }
    }));
    cases.push(await request(server, '/api/student-finance/discounts/dis-new/cancel', {
      method: 'POST',
      user: adminUser,
      body: { reason: 'Duplicate entry' }
    }));
    cases.push(await request(server, '/api/student-finance/exemptions', { user: adminUser }));
    cases.push(await request(server, '/api/student-finance/exemptions', {
      method: 'POST',
      user: adminUser,
      body: {
        student: IDS.student,
        classId: 'class-1',
        academicYearId: 'year-1',
        exemptionType: 'partial',
        scope: 'tuition',
        amount: 250,
        percentage: 50,
        reason: 'Sponsored family'
      }
    }));
    cases.push(await request(server, '/api/student-finance/exemptions/ex-new/cancel', {
      method: 'POST',
      user: adminUser,
      body: { cancelReason: 'Policy changed' }
    }));
    cases.push(await request(server, '/api/student-finance/transport-fees', { method: 'POST', user: adminUser, body: { student: IDS.student, studentMembershipId: IDS.membership, title: 'Bus Fee' } }));
    cases.push(await request(server, '/api/student-finance/me/overviews', { user: studentUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/overview`, { user: studentUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/statement`, { user: studentUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/statement-pack.pdf`, { user: studentUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/overview`, { user: outsiderUser }));
    cases.push(await request(server, `/api/student-finance/memberships/${IDS.membership}/statement`, { user: outsiderUser }));
    cases.push(await request(server, `/api/student-finance/eligibility?studentMembershipId=${IDS.membership}`, { user: studentUser }));
    cases.push(await request(server, `/api/student-finance/orders/${IDS.order}/discount`, {
      method: 'POST',
      user: adminUser,
      body: { type: 'discount', amount: 75, reason: 'Sibling support' }
    }));
    cases.push(await request(server, `/api/student-finance/orders/${IDS.orderDirect}/discount`, {
      method: 'POST',
      user: adminUser,
      body: { type: 'waiver', amount: 25, reason: 'Direct canonical relief' }
    }));
    cases.push(await request(server, `/api/student-finance/orders/${IDS.order}/installments`, {
      method: 'POST',
      user: adminUser,
      body: { count: 3, startDate: '2026-03-20', stepDays: 30 }
    }));
    cases.push(await request(server, `/api/student-finance/orders/${IDS.order}/void`, {
      method: 'POST',
      user: adminUser,
      body: { reason: 'Duplicate fee order' }
    }));
    cases.push(await request(server, `/api/student-finance/payments/${IDS.payment}/approve`, {
      method: 'POST',
      user: adminUser,
      body: { note: 'Looks good' }
    }));
    cases.push(await request(server, `/api/student-finance/payments/${IDS.paymentDirect}/approve`, {
      method: 'POST',
      user: adminUser,
      body: { note: 'Direct canonical approval' }
    }));
    cases.push(await request(server, `/api/student-finance/payments/${IDS.payment}/reject`, {
      method: 'POST',
      user: adminUser,
      body: { reason: 'Receipt mismatch' }
    }));
    cases.push(await request(server, `/api/student-finance/payments/${IDS.paymentDirect}/follow-up`, {
      method: 'POST',
      user: adminUser,
      body: {
        assignedLevel: 'finance_lead',
        status: 'in_progress',
        note: 'Escalated for review'
      }
    }));

    assertCase(cases[0].status === 401, 'Expected reference-data route to require auth.');
    assertCase(cases[1].status === 403, 'Expected reference-data route to require permission.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.academicYears), 'Expected reference-data route to return academic years.');
    assertCase(cases[3].status === 200 && Array.isArray(cases[3].data?.items), 'Expected orders route to return items.');
    assertCase(cases[4].status === 200 && cases[4].data?.receipt?.paymentId === IDS.payment, 'Expected payment receipt route to return canonical print payload.');
    assertCase(cases[5].status === 200 && cases[5].data?.summary?.totalPayments === 2, 'Expected daily cashier report route to return summary totals.');
    assertCase(cases[6].status === 200 && Array.isArray(cases[6].data?.items) && cases[6].data?.items?.length === 2, 'Expected open-orders route to return canonical open fee orders.');
    assertCase(cases[7].status === 200 && Array.isArray(cases[7].data?.allocations) && cases[7].data?.allocations?.length === 2, 'Expected preview-allocation route to return allocation rows.');
    assertCase(cases[8].status === 200 && Array.isArray(cases[8].data?.items) && cases[8].data?.items?.[0]?.id === IDS.discount, 'Expected discounts route to return canonical registry items.');
    assertCase(cases[9].status === 200 && Array.isArray(cases[9].data?.items) && cases[9].data?.items?.[0]?.id === 'relief-1', 'Expected reliefs route to return canonical relief items.');
    assertCase(cases[10].status === 201 && cases[10].data?.item?.id === 'pay-created', 'Expected create payment route to return canonical payment item.');
    assertCase(Array.isArray(cases[10].data?.item?.allocations) && cases[10].data?.item?.allocations?.length === 2, 'Expected created payment to preserve allocations.');
    assertCase(cases[11].status === 201 && cases[11].data?.item?.discountType === 'discount', 'Expected discount create route to return created item.');
    assertCase(cases[12].status === 200 && cases[12].data?.item?.id === 'dis-new', 'Expected discount cancel route to return updated item.');
    assertCase(cases[13].status === 200 && Array.isArray(cases[13].data?.items) && cases[13].data?.items?.[0]?.id === IDS.exemption, 'Expected exemptions route to return canonical registry items.');
    assertCase(cases[14].status === 201 && cases[14].data?.item?.scope === 'tuition', 'Expected exemption create route to return created item.');
    assertCase(cases[15].status === 200 && cases[15].data?.item?.id === 'ex-new', 'Expected exemption cancel route to return updated item.');
    assertCase(cases[16].status === 200 && cases[16].data?.item?.title === 'Bus Fee', 'Expected transport fee create route to return item.');
    assertCase(activityCalls.length === activityStart + 7, `Expected 7 student finance activity logs, received ${activityCalls.length - activityStart}.`);
    assertCase(activityCalls[activityStart]?.action === 'create_fee_payment', 'Expected create_fee_payment activity.');
    assertCase(activityCalls[activityStart + 1]?.action === 'create_discount_registry', 'Expected create_discount_registry activity.');
    assertCase(activityCalls[activityStart + 2]?.action === 'cancel_discount_registry', 'Expected cancel_discount_registry activity.');
    assertCase(activityCalls[activityStart + 3]?.action === 'create_fee_exemption', 'Expected create_fee_exemption activity.');
    assertCase(activityCalls[activityStart + 4]?.action === 'cancel_fee_exemption', 'Expected cancel_fee_exemption activity.');
    assertCase(activityCalls[activityStart + 5]?.action === 'create_transport_fee', 'Expected create_transport_fee activity.');
    assertCase(activityCalls[activityStart + 6]?.action === 'export_student_finance_statement_pdf', 'Expected export_student_finance_statement_pdf activity.');
    assertCase(String(activityCalls[activityStart]?.meta?.studentMembershipId || '') === IDS.membership, 'Expected membership id in create payment activity.');
    assertCase(String(activityCalls[activityStart + 5]?.meta?.studentMembershipId || '') === IDS.membership, 'Expected membership id in transport fee activity.');
    assertCase(String(activityCalls[activityStart + 6]?.meta?.membershipId || '') === IDS.membership, 'Expected membership id in export pdf activity.');
    assertCase(cases[17].status === 200 && Array.isArray(cases[17].data?.items) && cases[17].data?.items?.[0]?.membership?.id === IDS.membership, 'Expected student self-service overview route to return canonical membership items.');
    assertCase(cases[17].data?.items?.[0]?.statement?.totals?.totalOutstanding === 100, 'Expected overview to include membership statement totals.');
    assertCase(cases[18].status === 200 && cases[18].data?.membership?.id === IDS.membership, 'Expected student to access own membership overview.');
    assertCase(cases[18].data?.summary?.totalReliefs === 1, 'Expected overview to include relief totals.');
    assertCase(cases[19].status === 200 && cases[19].data?.statement?.totals?.totalOrders === 1, 'Expected student to access own membership statement.');
    assertCase(cases[19].data?.statement?.totals?.totalReliefs === 1, 'Expected statement to include relief totals.');
    assertCase(cases[20].status === 200, 'Expected student statement pack PDF route to return success.');
    assertCase(String(cases[20].headers?.['content-type'] || '').includes('application/pdf'), 'Expected student statement pack PDF content-type.');
    assertCase(String(cases[20].headers?.['content-disposition'] || '').includes('.pdf'), 'Expected student statement pack PDF attachment filename.');
    assertCase(String(cases[20].headers?.['x-finance-document-no'] || '').length > 0, 'Expected student statement pack PDF document number header.');
    assertCase(String(cases[20].headers?.['x-finance-verification-code'] || '').length > 0, 'Expected student statement pack PDF verification header.');
    assertCase(String(cases[20].text || '').startsWith('%PDF'), 'Expected statement pack PDF route to stream a PDF document.');
    assertCase(cases[21].status === 403, 'Expected outsider student to be forbidden from another membership overview.');
    assertCase(cases[22].status === 403, 'Expected outsider student to be forbidden from another membership statement.');
    assertCase(cases[23].status === 200 && cases[23].data?.summary?.eligible === false, 'Expected eligibility route to return fee status summary.');
    assertCase(cases[24].status === 200 && String(cases[24].data?.item?._id || '') === IDS.order, 'Expected canonical order discount action to execute on canonical fee order id.');
    assertCase(cases[25].status === 200 && String(cases[25].data?.item?._id || '') === IDS.orderDirect, 'Expected unlinked canonical order discount action to execute without legacy bridge.');
    assertCase(cases[26].status === 200 && String(cases[26].data?.item?._id || '') === IDS.order, 'Expected canonical order installments action to execute on canonical fee order id.');
    assertCase(cases[27].status === 200 && String(cases[27].data?.item?._id || '') === IDS.order, 'Expected canonical order void action to execute on canonical fee order id.');
    assertCase(cases[28].status === 200 && cases[28].data?.nextStage === 'finance_lead_review', 'Expected canonical payment approve action to execute shared finance approval logic.');
    assertCase(cases[29].status === 200 && cases[29].data?.nextStage === 'finance_lead_review', 'Expected unlinked canonical payment approve action to execute without legacy bridge.');
    assertCase(cases[30].status === 200 && cases[30].data?.nextStage === 'rejected', 'Expected canonical payment reject action to execute shared finance rejection logic.');
    assertCase(cases[31].status === 200 && cases[31].data?.item?.followUp?.assignedLevel === 'finance_lead', 'Expected canonical payment follow-up action to update follow-up state.');
    assertCase(financeActionCalls.length === 8, `Expected 8 canonical finance action calls, received ${financeActionCalls.length}.`);
    assertCase(financeActionCalls[0]?.body?.amount === 75, 'Expected discount action body to preserve amount.');
    assertCase(financeActionCalls[1]?.body?.amount === 25, 'Expected direct canonical discount action body to preserve amount.');
    assertCase(financeActionCalls[2]?.body?.count === 3, 'Expected installments action body to preserve count.');
    assertCase(String(financeActionCalls[3]?.body?.reason || '') === 'Duplicate fee order', 'Expected void action body to preserve reason.');
    assertCase(String(financeActionCalls[4]?.body?.note || '') === 'Looks good', 'Expected approve action body to preserve note.');
    assertCase(String(financeActionCalls[5]?.body?.note || '') === 'Direct canonical approval', 'Expected direct canonical approve action body to preserve note.');
    assertCase(String(financeActionCalls[6]?.body?.reason || '') === 'Receipt mismatch', 'Expected reject action body to preserve reason.');
    assertCase(String(financeActionCalls[7]?.body?.note || '') === 'Escalated for review', 'Expected follow-up action body to preserve note.');

    console.log('check:student-finance-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:student-finance-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
