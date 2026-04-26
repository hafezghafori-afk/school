const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86201',
  instructor: '507f191e810c19729de86202',
  finance: '507f191e810c19729de86203'
};

const activityCalls = [];

const serviceMock = {
  getReportDefinition(reportKey) {
    const defs = {
      finance_overview: { key: 'finance_overview', title: 'Finance Overview', requiredPermissions: ['manage_finance'] },
      fee_debtors_overview: { key: 'fee_debtors_overview', title: 'Fee Debtors Overview', requiredPermissions: ['manage_finance'] },
      fee_discount_exemption_overview: { key: 'fee_discount_exemption_overview', title: 'Fee Discount & Exemption Overview', requiredPermissions: ['manage_finance'] },
      fee_collection_by_class: { key: 'fee_collection_by_class', title: 'Fee Collection By Class', requiredPermissions: ['manage_finance'] },
      exam_outcomes: { key: 'exam_outcomes', title: 'Exam Outcomes', requiredPermissions: ['manage_content'] }
    };
    return defs[reportKey] || null;
  },
  listReportCatalog({ permissions = [] } = {}) {
    const set = new Set(permissions);
    return [
      { key: 'finance_overview', title: 'Finance Overview', requiredPermissions: ['manage_finance'] },
      { key: 'fee_debtors_overview', title: 'Fee Debtors Overview', requiredPermissions: ['manage_finance'] },
      { key: 'fee_discount_exemption_overview', title: 'Fee Discount & Exemption Overview', requiredPermissions: ['manage_finance'] },
      { key: 'fee_collection_by_class', title: 'Fee Collection By Class', requiredPermissions: ['manage_finance'] },
      { key: 'exam_outcomes', title: 'Exam Outcomes', requiredPermissions: ['manage_content'] }
    ].filter((item) => item.requiredPermissions.some((permission) => set.has(permission)));
  },
  async listReportReferenceData() {
    return {
      financialYears: [{ id: 'fin-1', title: '1406 مالی' }],
      academicYears: [{ id: 'year-1', title: '1406' }],
      academicTerms: [{ id: 'term-1', title: 'Term 1' }],
      classes: [{ id: 'class-1', title: 'Class 10 A' }],
      students: [{ id: 'student-1', fullName: 'Student One' }],
      teachers: [{ id: 'teacher-1', name: 'Teacher One' }]
    };
  },
  async runReport(reportKey, filters = {}) {
    return {
      report: { key: reportKey, title: reportKey, description: 'Mock report' },
      filters,
      generatedAt: '2026-03-13T09:00:00.000Z',
      columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }],
      rows: [{ name: 'alpha', value: 1 }],
      summary: { totalRows: 1 },
      meta: { totalRows: 1 }
    };
  },
  reportToCsv() {
    return '"Name","Value"\n"alpha","1"';
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

const activityMock = {
  async logActivity(payload) {
    activityCalls.push(payload);
  }
};

const pdfMock = {
  async buildReportPdfBuffer() {
    return Buffer.from('%PDF-1.4\n% mock report pdf\n');
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'reportRoutes.js');
  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/reportRoutes.js');
    if (isRouteFile && request === '../middleware/auth') return authMock;
    if (isRouteFile && request === '../services/reportEngineService') return serviceMock;
    if (isRouteFile && request === '../utils/activity') return activityMock;
    if (isRouteFile && request === '../services/sheetTemplatePdfService') return pdfMock;
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
  app.use('/api/reports', router);
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
  return { status: response.status, data, text, headers: response.headers };
}

async function run() {
  const server = await createServer();
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: ['manage_content'] };
  const financeUser = { id: IDS.finance, role: 'admin', permissions: ['manage_finance'] };

  try {
    const cases = [];
    cases.push(await request(server, '/api/reports/catalog'));
    cases.push(await request(server, '/api/reports/catalog', { user: instructorUser }));
    cases.push(await request(server, '/api/reports/reference-data', { user: financeUser }));
    cases.push(await request(server, '/api/reports/run', { method: 'POST', user: instructorUser, body: { reportKey: 'exam_outcomes', filters: { classId: 'class-1' } } }));
    cases.push(await request(server, '/api/reports/run', { method: 'POST', user: instructorUser, body: { reportKey: 'finance_overview', filters: {} } }));
    cases.push(await request(server, '/api/reports/run', { method: 'POST', user: financeUser, body: { reportKey: 'finance_overview', filters: { academicYearId: 'year-1' } } }));
    cases.push(await request(server, '/api/reports/run', { method: 'POST', user: financeUser, body: { reportKey: 'fee_debtors_overview', filters: { classId: 'class-1', academicYearId: 'year-1' } } }));
    cases.push(await request(server, '/api/reports/export.csv', { method: 'POST', user: instructorUser, body: { reportKey: 'exam_outcomes', filters: { classId: 'class-1' } } }));
    cases.push(await request(server, '/api/reports/export.xlsx', { method: 'POST', user: instructorUser, body: { reportKey: 'exam_outcomes', filters: { classId: 'class-1' } } }));
    cases.push(await request(server, '/api/reports/export.pdf', { method: 'POST', user: instructorUser, body: { reportKey: 'exam_outcomes', filters: { classId: 'class-1' } } }));
    cases.push(await request(server, '/api/reports/export.print', { method: 'POST', user: instructorUser, body: { reportKey: 'exam_outcomes', filters: { classId: 'class-1' } } }));

    assertCase(cases[0].status === 401, 'Expected report catalog route to require auth.');
    assertCase(cases[1].status === 200 && Array.isArray(cases[1].data?.items), 'Expected report catalog route to return accessible items.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.catalog), 'Expected report reference-data route to return catalog.');
    assertCase(cases[3].status === 200 && cases[3].data?.report?.report?.key === 'exam_outcomes', 'Expected academic report to run for instructor.');
    assertCase(cases[4].status === 403 && cases[4].data?.message === 'report_forbidden', 'Expected finance report to be blocked for instructor.');
    assertCase(cases[5].status === 200 && cases[5].data?.report?.report?.key === 'finance_overview', 'Expected finance report to run for finance access.');
    assertCase(cases[6].status === 200 && cases[6].data?.report?.report?.key === 'fee_debtors_overview', 'Expected fee debtors report to run for finance access.');
    assertCase(cases[7].status === 200 && (cases[7].headers.get('content-disposition') || '').includes('exam_outcomes.csv'), 'Expected CSV export to return attachment.');
    assertCase(cases[8].status === 200 && (cases[8].headers.get('content-disposition') || '').includes('exam_outcomes.xlsx'), 'Expected Excel export to return attachment.');
    assertCase(cases[9].status === 200 && (cases[9].headers.get('content-type') || '').includes('application/pdf') && cases[9].text.startsWith('%PDF'), 'Expected PDF export to return PDF content.');
    assertCase(cases[10].status === 200 && (cases[10].headers.get('content-type') || '').includes('text/html'), 'Expected print export to return HTML content.');

    const runLog = findActivity('report_run');
    const csvLog = findActivity('report_export_csv');
    const xlsxLog = findActivity('report_export_xlsx');
    const pdfLog = findActivity('report_export_pdf');
    const printLog = findActivity('report_export_print');

    assertCase(runLog?.targetId === 'exam_outcomes' && runLog?.meta?.filters?.classId === 'class-1', 'Expected report run to write an activity log with filters.');
    assertCase(csvLog?.meta?.exportFormat === 'csv' && csvLog?.meta?.filename === 'exam_outcomes.csv', 'Expected CSV export to write an activity log.');
    assertCase(xlsxLog?.meta?.exportFormat === 'xlsx' && xlsxLog?.meta?.filename === 'exam_outcomes.xlsx', 'Expected Excel export to write an activity log.');
    assertCase(pdfLog?.meta?.exportFormat === 'pdf' && pdfLog?.meta?.filename === 'exam_outcomes.pdf', 'Expected PDF export to write an activity log.');
    assertCase(printLog?.meta?.exportFormat === 'print' && printLog?.meta?.filename === 'exam_outcomes.html', 'Expected print export to write an activity log.');

    console.log('check:report-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:report-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
