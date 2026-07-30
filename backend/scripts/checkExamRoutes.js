const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  instructor: '507f191e810c19729de86002',
  studentUser: '507f191e810c19729de86003',
  studentCore: '507f191e810c19729de86004',
  session: '507f191e810c19729de86005',
  membership: '507f191e810c19729de86006'
};
const activityCalls = [];

const serviceMock = {
  async listExamReferenceData() {
    return {
      academicYears: [{ id: 'year-1', title: '1406', label: '1406' }],
      assessmentPeriods: [{ id: 'term-1', title: 'دوره اول', code: '1406-T1' }],
      classes: [{ id: 'class-1', title: 'Class 10 A' }],
      subjects: [{ id: 'subject-1', name: 'Math' }],
      teacherAssignments: [{ id: 'assignment-1', teacher: { name: 'Teacher One' } }],
      examTypes: [{ id: 'type-1', title: 'سالانه', code: 'ANNUAL' }],
      rankingRules: [{ id: 'rule-1', name: 'Default Academic Ranking' }]
    };
  },
  async listExamTypes() {
    return [{ id: 'type-1', title: 'سالانه', code: 'ANNUAL' }];
  },
  async createExamType(payload) {
    return { id: 'type-2', title: payload.title, code: payload.code || 'NEW' };
  },
  async listExamSessions(filters = {}) {
    const items = [{ id: IDS.session, title: 'Annual - Class 10 A', code: 'ANNUAL-1406-T1-10A' }];
    if (String(filters.paginated || '').toLowerCase() === 'true') {
      return {
        items,
        pagination: { page: 1, limit: 20, total: 101, pages: 6, hasNext: true, hasPrevious: false },
        counts: { submitted: 101 }
      };
    }
    return items;
  },
  async createExamSession(payload) {
    return { id: IDS.session, title: payload.title || 'Annual - Class 10 A', code: payload.code || 'ANNUAL-1406-T1-10A' };
  },
  async previewExamSessionBootstrap(payload) {
    return {
      canBootstrap: true,
      warnings: [],
      existingSession: null,
      proposedSession: {
        title: payload.title || 'Annual - Class 10 A',
        code: payload.code || 'ANNUAL-1406-T1-10A',
        status: payload.status || 'draft'
      },
      rosterSummary: { eligibleMemberships: 1, marks: 0, results: 0, pending: 1 },
      sampleMemberships: [{ id: IDS.membership, status: 'active' }]
    };
  },
  async bootstrapExamSession(payload) {
    return {
      preview: {
        canBootstrap: true,
        warnings: [],
        existingSession: null,
        proposedSession: {
          title: payload.title || 'Annual - Class 10 A',
          code: payload.code || 'ANNUAL-1406-T1-10A',
          status: payload.status || 'draft'
        },
        rosterSummary: { eligibleMemberships: 1, marks: 0, results: 0, pending: 1 },
        sampleMemberships: [{ id: IDS.membership, status: 'active' }]
      },
      session: { id: IDS.session, title: payload.title || 'Annual - Class 10 A', code: payload.code || 'ANNUAL-1406-T1-10A' },
      roster: {
        session: { id: IDS.session, title: payload.title || 'Annual - Class 10 A' },
        summary: { eligibleMemberships: 1, marks: 1, results: 1, pending: 1, createdMarks: 1 },
        warnings: [],
        recompute: { marks: 1, results: 1, ranked: 1 }
      }
    };
  },
  async initializeSessionRoster(sessionId) {
    return {
      session: { id: sessionId || IDS.session, title: 'Annual - Class 10 A' },
      summary: { eligibleMemberships: 1, marks: 1, results: 1, pending: 1, createdMarks: 1 },
      warnings: [],
      recompute: { marks: 1, results: 1, ranked: 1 }
    };
  },
  async syncSessionRoster(sessionId) {
    return {
      session: { id: sessionId || IDS.session, title: 'Annual - Class 10 A', status: 'active' },
      summary: { eligibleMemberships: 11, totalMarks: 11, existingMarks: 1, createdMarks: 10 },
      warnings: [],
      recompute: { marks: 11, results: 11, ranked: 1 }
    };
  },
  async getSessionRosterStatus(sessionId) {
    return {
      session: { id: sessionId || IDS.session, title: 'Annual - Class 10 A' },
      summary: { eligibleMemberships: 1, marks: 1, results: 1, pending: 1 },
      sampleMemberships: [{ id: IDS.membership, status: 'active' }],
      missingMemberships: []
    };
  },
  async getSessionMarks() {
    return {
      session: { id: IDS.session, title: 'Annual - Class 10 A' },
      scoreComponents: { writtenMax: 25, oralMax: 25, classActivityMax: 25, homeworkMax: 25 },
      summary: { eligibleMemberships: 1, recordedMarks: 1, pendingMarks: 0 },
      items: [{
        mark: { id: 'mark-1', obtainedMark: 88, totalMark: 100, markStatus: 'recorded' },
        result: { id: 'result-1', resultStatus: 'passed', rank: 1 }
      }]
    };
  },
  async saveExamSheetMarks() {
    return {
      session: { id: IDS.session, title: 'Annual - Class 10 A' },
      summary: { eligibleMemberships: 1, recordedMarks: 1, pendingMarks: 0 },
      items: [{
        membership: { id: IDS.membership },
        row: { rowNumber: 1, studentName: 'Alpha Student', writtenScore: 20, oralScore: 20, classActivityScore: 24, homeworkScore: 24, markStatus: 'recorded' }
      }]
    };
  },
  async upsertExamMark() {
    return {
      mark: { id: 'mark-1', obtainedMark: 88, totalMark: 100, markStatus: 'recorded' },
      result: { id: 'result-1', resultStatus: 'passed', rank: 1 },
      summary: { marks: 1, results: 1, ranked: 1 }
    };
  },
  async recomputeSessionResults() {
    return {
      session: { id: IDS.session, title: 'Annual - Class 10 A' },
      summary: { marks: 1, results: 1, ranked: 1 }
    };
  },
  async createExamSessionRevision() {
    return {
      item: { id: IDS.session, title: 'Annual - Class 10 A (version 2)', version: 2, status: 'draft' },
      summary: { clonedMarks: 1, clonedResults: 1, version: 2 }
    };
  },
  async updateExamSessionStatus(_, payload = {}) {
    return {
      id: IDS.session,
      status: payload.status || 'published',
      reviewedByName: payload.reviewedByName || 'Reviewer One'
    };
  },
  async getExamSessionManagementState() {
    return {
      item: { id: IDS.session, title: 'Annual - Class 10 A', status: 'draft' },
      summary: { markCount: 1, substantiveMarkCount: 0, resultCount: 1 },
      permissions: { canEditMetadata: true, canEditStructure: true, canHardDelete: true, canArchive: true }
    };
  },
  async updateExamSession(_, payload = {}) {
    return {
      item: { id: IDS.session, title: 'Annual - Class 10 A', status: 'draft', monthLabel: payload.monthLabel || 'حمل' },
      management: { permissions: { canEditMetadata: true, canEditStructure: true, canHardDelete: true } }
    };
  },
  async deleteExamSession() {
    return {
      deletedId: IDS.session,
      title: 'Annual - Class 10 A',
      summary: { deletedMarks: 1, deletedResults: 1 }
    };
  },
  async buildSessionSheetReport() {
    return {
      session: { id: IDS.session, code: 'MONTHLY-1406-T1-10A-MATH', title: 'Monthly - Class 10 A' },
      template: { title: 'Subject Sheet' },
      report: {
        report: { key: 'exam_outcomes', title: 'Subject Sheet' },
        columns: [],
        rows: []
      }
    };
  },
  async ensureExamSessionAccess(sessionId, actor = {}) {
    if (String(sessionId) !== IDS.session) {
      throw new Error('exam_session_not_found');
    }
    if (String(actor?.role || '') === 'admin' || String(actor?.id || '') === IDS.instructor) {
      return { id: IDS.session };
    }
    throw new Error('exam_session_forbidden');
  },
  async listStudentExamResults(studentRef) {
    if (String(studentRef) !== IDS.studentUser && String(studentRef) !== IDS.studentCore) {
      return null;
    }
    return {
      student: { studentId: IDS.studentCore, userId: IDS.studentUser, fullName: 'Alpha Student' },
      items: [{ id: 'result-1', resultStatus: 'passed', percentage: 88 }]
    };
  }
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
    } catch {
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
      if (permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'examRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/examRoutes.js');

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
    if (isRouteFile && request === '../services/examEngineService') return serviceMock;
    if (isRouteFile && request === '../services/sheetTemplatePrintService') {
      return {
        renderReportPrintHtml: async () => '<html><body>print</body></html>'
      };
    }
    if (isRouteFile && request === '../services/sheetTemplatePdfService') {
      return {
        buildReportPdfBuffer: async () => Buffer.from('pdf')
      };
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

const router = loadRouter();

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/exams', router);
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
  return { status: response.status, data, text };
}

async function run() {
  const server = await createServer();
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_content'] };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: ['manage_content'] };
  const outsiderInstructor = { id: '507f191e810c19729de86009', role: 'instructor', permissions: ['manage_content'] };
  const studentUser = { id: IDS.studentUser, role: 'student', permissions: [] };

  try {
    const cases = [];
    cases.push(await request(server, '/api/exams/reference-data'));
    cases.push(await request(server, '/api/exams/reference-data', { user: { id: IDS.admin, role: 'admin', permissions: [] } }));
    cases.push(await request(server, '/api/exams/reference-data', { user: instructorUser }));
    const paginatedSessions = await request(server, '/api/exams/sessions?status=submitted&page=1&limit=20&paginated=true', { user: adminUser });
    const activityStart = activityCalls.length;
    cases.push(await request(server, '/api/exams/types', { method: 'POST', user: adminUser, body: { title: 'Mock Type', code: 'MOCK' } }));
    cases.push(await request(server, '/api/exams/sessions', { method: 'POST', user: adminUser, body: { title: 'Annual Session' } }));
    cases.push(await request(server, '/api/exams/sessions/bootstrap-preview', { method: 'POST', user: adminUser, body: { title: 'Bootstrap Preview' } }));
    cases.push(await request(server, '/api/exams/sessions/bootstrap', { method: 'POST', user: adminUser, body: { title: 'Bootstrap Session' } }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/roster-status`, { user: instructorUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/initialize-roster`, { method: 'POST', user: instructorUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/marks`, { user: instructorUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/marks/batch`, {
      method: 'POST',
      user: instructorUser,
      body: { items: [{ studentMembershipId: IDS.membership, scoreBreakdown: { writtenScore: 20 } }] }
    }));
    cases.push(await request(server, '/api/exams/marks/upsert', { method: 'POST', user: instructorUser, body: { sessionId: IDS.session, studentMembershipId: IDS.membership, obtainedMark: 88 } }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/recompute-results`, { method: 'POST', user: instructorUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/revisions`, { method: 'POST', user: adminUser, body: { reason: 'Correction' } }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/status`, {
      method: 'POST',
      user: instructorUser,
      body: { status: 'published', reviewedByName: 'Reviewer One' }
    }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/export.print`, { user: instructorUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/export.pdf`, { user: instructorUser }));
    cases.push(await request(server, '/api/exams/my/results', { user: studentUser }));
    cases.push(await request(server, `/api/exams/students/${IDS.studentUser}/results`, { user: studentUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/marks`, { user: outsiderInstructor }));
    cases.push(await request(server, '/api/exams/sessions/bootstrap', { method: 'POST', user: instructorUser, body: { title: 'Forbidden Instructor Bootstrap' } }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/management-state`, { user: adminUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}`, { method: 'PATCH', user: adminUser, body: { monthLabel: 'حمل' } }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}`, { method: 'DELETE', user: adminUser }));
    cases.push(await request(server, `/api/exams/sessions/${IDS.session}/sync-roster`, { method: 'POST', user: adminUser }));

    assertCase(cases[0].status === 401, 'Expected reference-data route to require authentication.');
    assertCase(cases[1].status === 403, 'Expected reference-data route to require permission.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.examTypes), 'Expected reference-data route to return exam types.');
    assertCase(
      paginatedSessions.status === 200
        && paginatedSessions.data?.pagination?.total === 101
        && paginatedSessions.data?.counts?.submitted === 101,
      'Expected paginated session route to return queue metadata.'
    );
    assertCase(cases[3].status === 200 && cases[3].data?.item?.title === 'Mock Type', 'Expected exam type creation to return payload.');
    assertCase(cases[4].status === 200 && cases[4].data?.item?.id === IDS.session, 'Expected exam session creation to return session payload.');
    assertCase(cases[5].status === 200 && cases[5].data?.canBootstrap === true, 'Expected bootstrap preview to return preview data.');
    assertCase(cases[6].status === 200 && cases[6].data?.session?.id === IDS.session, 'Expected bootstrap route to return created session.');
    assertCase(cases[7].status === 200 && cases[7].data?.summary?.eligibleMemberships === 1, 'Expected roster status route to return summary.');
    assertCase(cases[8].status === 200 && cases[8].data?.recompute?.ranked === 1, 'Expected initialize roster route to return recompute summary.');
    assertCase(cases[9].status === 200 && Array.isArray(cases[9].data?.items), 'Expected session marks route to return rows.');
    assertCase(cases[10].status === 200 && cases[10].data?.summary?.recordedMarks === 1, 'Expected batch marks route to return updated summary.');
    assertCase(cases[11].status === 200 && cases[11].data?.result?.resultStatus === 'passed', 'Expected exam mark upsert to return computed result.');
    assertCase(cases[12].status === 200 && cases[12].data?.summary?.ranked === 1, 'Expected recompute endpoint to return summary.');
    assertCase(cases[13].status === 201 && cases[13].data?.summary?.version === 2, 'Expected revision endpoint to create version 2.');
    assertCase(cases[14].status === 200 && cases[14].data?.item?.status === 'published', 'Expected session status route to publish the sheet.');
    assertCase(cases[15].status === 200 && /<html/i.test(String(cases[15].text || '')), 'Expected print export to return html.');
    assertCase(cases[16].status === 200 && cases[16].text === 'pdf', 'Expected PDF export to return mock buffer content.');
    assertCase(cases[17].status === 200 && Array.isArray(cases[17].data?.items), 'Expected my results endpoint to return items.');
    assertCase(cases[18].status === 200 && Array.isArray(cases[18].data?.items), 'Expected student results endpoint to return items.');
    assertCase(cases[19].status === 403, 'Expected unrelated instructor to be blocked from another teacher session.');
    assertCase(cases[20].status === 403, 'Expected instructors to be blocked from creating centrally managed sheets.');
    assertCase(cases[21].status === 200 && cases[21].data?.permissions?.canHardDelete === true, 'Expected management-state route to return safe actions.');
    assertCase(cases[22].status === 200 && cases[22].data?.item?.monthLabel === 'حمل', 'Expected exam session update route to return edited data.');
    assertCase(cases[23].status === 200 && cases[23].data?.deletedId === IDS.session, 'Expected safe draft deletion route to return the deleted session id.');
    assertCase(cases[24].status === 200 && cases[24].data?.summary?.createdMarks === 10, 'Expected roster sync route to add only missing memberships.');
    assertCase(activityCalls.length === activityStart + 12, `Expected 12 exam activity logs, received ${activityCalls.length - activityStart}.`);
    assertCase(activityCalls[activityStart]?.action === 'create_exam_type', 'Expected create_exam_type activity.');
    assertCase(activityCalls[activityStart + 1]?.action === 'create_exam_session', 'Expected create_exam_session activity.');
    assertCase(activityCalls[activityStart + 2]?.action === 'bootstrap_exam_session', 'Expected bootstrap_exam_session activity.');
    assertCase(activityCalls[activityStart + 3]?.action === 'initialize_exam_session_roster', 'Expected initialize_exam_session_roster activity.');
    assertCase(activityCalls[activityStart + 4]?.action === 'save_exam_sheet_marks', 'Expected save_exam_sheet_marks activity.');
    assertCase(activityCalls[activityStart + 5]?.action === 'upsert_exam_mark', 'Expected upsert_exam_mark activity.');
    assertCase(activityCalls[activityStart + 6]?.action === 'recompute_exam_results', 'Expected recompute_exam_results activity.');
    assertCase(activityCalls[activityStart + 7]?.action === 'create_exam_session_revision', 'Expected create_exam_session_revision activity.');
    assertCase(activityCalls[activityStart + 8]?.action === 'update_exam_session_status', 'Expected update_exam_session_status activity.');
    assertCase(activityCalls[activityStart + 9]?.action === 'update_exam_session', 'Expected update_exam_session activity.');
    assertCase(activityCalls[activityStart + 10]?.action === 'delete_exam_session_draft', 'Expected delete_exam_session_draft activity.');
    assertCase(activityCalls[activityStart + 11]?.action === 'sync_exam_session_roster', 'Expected sync_exam_session_roster activity.');

    console.log('check:exam-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:exam-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
