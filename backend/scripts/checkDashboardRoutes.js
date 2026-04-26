const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  parent: '507f191e810c19729de86002',
  student: '507f191e810c19729de86003',
  instructor: '507f191e810c19729de86004'
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
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Invalid test user.' });
    }
  },
  requireRole(roles = []) {
    return (req, res, next) => {
      if (roles.includes(String(req.user?.role || ''))) {
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

const dashboardServiceMock = {
  async getTeacherDashboard(userId) {
    return {
      generatedAt: '2026-03-26T12:00:00.000Z',
      summary: {
        activeClasses: 3,
        activeStudents: 96,
        attendanceRate: 91,
        activeExams: 2,
        todayLessons: 4,
        pendingJoinRequests: 1
      },
      attendanceTrend: [],
      classPerformance: [],
      tasks: [],
      alerts: [],
      todaySchedule: [{ id: 'lesson-1', label: `Teacher ${userId}`, meta: '08:00 تا 09:00' }]
    };
  },
  async getAdminDashboard() {
    return {
      generatedAt: '2026-03-26T12:00:00.000Z',
      summary: {
        totalStudents: 240,
        totalInstructors: 18,
        totalRevenue: 520000,
        totalDue: 610000,
        outstandingAmount: 90000,
        attendanceRate: 88,
        todayPayments: 12,
        pendingFinanceReviews: 2,
        pendingProfileRequests: 1,
        pendingAccessRequests: 1,
        monthlyRevenue: 110000,
        previousMonthRevenue: 98000,
        monthDeltaPercent: 12.2
      },
      studentGrowth: [],
      revenueTrend: [],
      alerts: [],
      tasks: []
    };
  },
  async getExamsDashboard() {
    return {
      generatedAt: '2026-03-26T12:00:00.000Z',
      summary: {
        activeSessions: 2,
        publishedSessions: 5,
        draftSessions: 1,
        averageMark: 74.5,
        passRate: 81.2,
        pendingResults: 9
      },
      statusTrend: [],
      recentSessions: [],
      alerts: [],
      tasks: []
    };
  }
};

const parentDashboardServiceMock = {
  async getParentDashboard(viewer = {}, options = {}) {
    return {
      generatedAt: '2026-03-26T12:00:00.000Z',
      previewMode: false,
      setupNeeded: false,
      linkedStudent: {
        id: String(options.studentId || 'student-core-1'),
        studentCoreId: String(options.studentId || 'student-core-1'),
        studentUserId: IDS.student,
        name: 'Alpha Student',
        classTitle: 'صنف نهم الف',
        academicYearTitle: '1405',
        membershipId: 'membership-1',
        relation: viewer.role === 'parent' ? 'پدر' : ''
      },
      linkedStudents: [
        {
          id: 'student-core-1',
          studentCoreId: 'student-core-1',
          studentUserId: IDS.student,
          name: 'Alpha Student',
          classTitle: 'صنف نهم الف',
          academicYearTitle: '1405',
          relation: 'پدر',
          isPrimary: true,
          hasActiveMembership: true
        },
        {
          id: 'student-core-2',
          studentCoreId: 'student-core-2',
          studentUserId: '507f191e810c19729de86005',
          name: 'Beta Student',
          classTitle: 'صنف هفتم ب',
          academicYearTitle: '1405',
          relation: 'پدر',
          isPrimary: false,
          hasActiveMembership: true
        }
      ],
      summary: {
        attendanceRate: 93,
        averageScore: 85,
        outstandingAmount: 2500,
        paidAmount: 6000,
        pendingHomework: 2,
        upcomingLessons: 3
      },
      financeStatement: {
        generatedAt: '2026-03-26T12:00:00.000Z',
        totals: {
          totalOrders: 2,
          totalPayments: 1,
          totalDue: 8500,
          totalPaid: 6000,
          totalOutstanding: 2500,
          totalReliefs: 1
        },
        latestApprovedPayment: {
          paymentNumber: 'PAY-001',
          amount: 6000,
          paidAt: '2026-03-25T10:00:00.000Z'
        },
        pack: {
          summary: { total: 1, critical: 0, warning: 1 },
          signals: [
            {
              id: 'signal-1',
              anomalyType: 'relief_expiring',
              title: 'Relief expires soon',
              amountLabel: '500 AFN',
              endDate: '2026-03-31T00:00:00.000Z'
            }
          ],
          recommendedAction: 'Follow up before relief expiry'
        }
      },
      financeOrders: [
        {
          id: 'order-1',
          orderNumber: 'FO-001',
          title: 'March tuition',
          status: 'partial',
          dueDate: '2026-03-28T00:00:00.000Z',
          outstandingAmount: 2500,
          amountDue: 8500,
          amountPaid: 6000,
          currency: 'AFN'
        }
      ],
      financePayments: [
        {
          id: 'payment-1',
          paymentNumber: 'PAY-001',
          amount: 6000,
          currency: 'AFN',
          paymentMethod: 'bank_transfer',
          status: 'approved',
          approvalStage: 'completed',
          paidAt: '2026-03-25T10:00:00.000Z'
        }
      ],
      financeReliefs: [
        {
          id: 'relief-1',
          reliefType: 'charity_support',
          coverageMode: 'fixed',
          amount: 500,
          percentage: 0,
          status: 'active',
          sponsorName: 'Community Fund',
          endDate: '2026-03-31T00:00:00.000Z'
        }
      ],
      financeBreakdown: [],
      tasks: [],
      alerts: [],
      schedule: [],
      message: ''
    };
  }
};

const financeDocumentArchiveMock = {
  async buildFinanceDocumentDescriptor({ documentType = 'parent_statement' } = {}) {
    return {
      documentNo: `DOC-${documentType}-001`,
      verificationCode: `VERIFY-${documentType}-001`,
      verificationUrl: `http://127.0.0.1/verify/${documentType}`,
      verificationQrBuffer: Buffer.from('qr')
    };
  },
  async createFinanceDocumentArchive(payload = {}) {
    return {
      documentNo: payload?.descriptor?.documentNo || 'DOC-parent_statement-001',
      verification: {
        code: payload?.descriptor?.verificationCode || 'VERIFY-parent_statement-001',
        url: payload?.descriptor?.verificationUrl || 'http://127.0.0.1/verify/parent_statement'
      },
      filename: payload?.filename || 'parent-statement.pdf',
      documentType: payload?.documentType || 'parent_statement'
    };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'dashboardRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/dashboardRoutes.js');

    if (isRouteFile && request === '../middleware/auth') return authMock;
    if (isRouteFile && request === '../utils/activity') {
      return {
        logActivity: async () => {}
      };
    }
    if (isRouteFile && request === '../utils/financeDocumentArchive') return financeDocumentArchiveMock;
    if (isRouteFile && request === '../services/dashboardService') return dashboardServiceMock;
    if (isRouteFile && request === '../services/parentDashboardService') return parentDashboardServiceMock;

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
  if (!condition) {
    throw new Error(message);
  }
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', router);

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
  } catch (error) {
    data = null;
  }

  return {
    status: response.status,
    data,
    text,
    headers: Object.fromEntries(response.headers.entries())
  };
}

async function run() {
  const server = await createServer();
  const parentUser = { id: IDS.parent, role: 'parent', permissions: [], orgRole: 'parent' };
  const studentUser = { id: IDS.student, role: 'student', permissions: [], orgRole: 'student' };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: [], orgRole: 'instructor' };
  const adminReportsUser = {
    id: IDS.admin,
    role: 'admin',
    permissions: ['view_reports'],
    adminLevel: 'general_president'
  };
  const adminContentUser = {
    id: IDS.admin,
    role: 'admin',
    permissions: ['manage_content'],
    adminLevel: 'general_president'
  };

  try {
    const guestParent = await request(server, '/api/dashboard/parent');
    assertCase(guestParent.status === 401, 'Expected parent dashboard to require authentication.');

    const forbiddenParent = await request(server, '/api/dashboard/parent', { user: instructorUser });
    assertCase(forbiddenParent.status === 403, 'Expected instructor to be rejected from parent dashboard.');

    const parentDashboard = await request(server, '/api/dashboard/parent?studentId=student-core-2', { user: parentUser });
    assertCase(parentDashboard.status === 200, `Expected parent dashboard 200, received ${parentDashboard.status}.`);
    assertCase(parentDashboard.data?.linkedStudent?.studentCoreId === 'student-core-2', 'Expected selected child in parent dashboard.');
    assertCase(Array.isArray(parentDashboard.data?.linkedStudents) && parentDashboard.data.linkedStudents.length === 2, 'Expected linked students list.');

    const parentStatementPdf = await request(server, '/api/dashboard/parent/statement-pack.pdf?studentId=student-core-2', { user: parentUser });
    assertCase(parentStatementPdf.status === 200, `Expected parent statement PDF 200, received ${parentStatementPdf.status}.`);
    assertCase(String(parentStatementPdf.headers?.['content-type'] || '').includes('application/pdf'), 'Expected parent statement PDF content-type.');
    assertCase(String(parentStatementPdf.headers?.['content-disposition'] || '').includes('.pdf'), 'Expected parent statement PDF attachment filename.');
    assertCase(String(parentStatementPdf.headers?.['x-finance-document-no'] || '').length > 0, 'Expected parent statement PDF document number header.');
    assertCase(String(parentStatementPdf.headers?.['x-finance-verification-code'] || '').length > 0, 'Expected parent statement PDF verification header.');
    assertCase(String(parentStatementPdf.text || '').startsWith('%PDF'), 'Expected parent statement PDF body.');

    const studentPreview = await request(server, '/api/dashboard/parent', { user: studentUser });
    assertCase(studentPreview.status === 200, `Expected student preview 200, received ${studentPreview.status}.`);
    assertCase(studentPreview.data?.summary?.paidAmount === 6000, 'Expected parent preview summary for student role.');

    const teacherDashboard = await request(server, '/api/dashboard/teacher', { user: instructorUser });
    assertCase(teacherDashboard.status === 200, `Expected teacher dashboard 200, received ${teacherDashboard.status}.`);
    assertCase(teacherDashboard.data?.summary?.activeClasses === 3, 'Expected teacher dashboard summary.');

    const teacherForbidden = await request(server, '/api/dashboard/teacher', { user: parentUser });
    assertCase(teacherForbidden.status === 403, 'Expected parent to be rejected from teacher dashboard.');

    const adminForbidden = await request(server, '/api/dashboard/admin', { user: adminContentUser });
    assertCase(adminForbidden.status === 403, 'Expected admin dashboard to require view_reports permission.');

    const adminDashboard = await request(server, '/api/dashboard/admin', { user: adminReportsUser });
    assertCase(adminDashboard.status === 200, `Expected admin dashboard 200, received ${adminDashboard.status}.`);
    assertCase(adminDashboard.data?.summary?.totalStudents === 240, 'Expected admin dashboard summary.');

    const examsForbidden = await request(server, '/api/dashboard/exams', { user: adminReportsUser });
    assertCase(examsForbidden.status === 403, 'Expected exams dashboard to require manage_content permission.');

    const examsDashboard = await request(server, '/api/dashboard/exams', { user: adminContentUser });
    assertCase(examsDashboard.status === 200, `Expected exams dashboard 200, received ${examsDashboard.status}.`);
    assertCase(examsDashboard.data?.summary?.activeSessions === 2, 'Expected exams dashboard summary.');

    console.log('check:dashboard-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:dashboard-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
