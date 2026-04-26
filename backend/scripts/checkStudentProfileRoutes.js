const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  studentCore: '507f191e810c19729de86002',
  studentUser: '507f191e810c19729de86003',
  guardianUser: '507f191e810c19729de86004'
};
const activityCalls = [];

const adminWithReports = {
  id: IDS.admin,
  role: 'admin',
  permissions: ['view_reports']
};

const adminWithManageUsers = {
  id: IDS.admin,
  role: 'admin',
  permissions: ['view_reports', 'manage_users']
};

const sampleProfile = {
  identity: {
    id: IDS.studentCore,
    userId: IDS.studentUser,
    fullName: 'Alpha Student',
    email: 'alpha.student@example.com',
    status: 'active',
    currentMembership: {
      id: 'membership-1',
      status: 'active',
      isCurrent: true,
      schoolClass: { title: 'Class 10 A' },
      academicYear: { label: '1406' }
    }
  },
  profile: {
    family: { fatherName: 'Parent Alpha', motherName: '', guardianName: '', guardianRelation: '' },
    contact: { primaryPhone: '0700000000', alternatePhone: '', email: 'alpha.student@example.com', address: 'Kabul' },
    background: { previousSchool: 'Alpha Prep', emergencyPhone: '0700000001' },
    notes: { medical: '', administrative: '' },
    guardians: [],
    remarks: [],
    transfers: [],
    documents: []
  },
  memberships: [
    {
      id: 'membership-1',
      status: 'active',
      isCurrent: true,
      schoolClass: { title: 'Class 10 A' },
      academicYear: { label: '1406' }
    }
  ],
  finance: {
    summary: {
      billCount: 1,
      receiptCount: 1,
      openBillCount: 1,
      pendingReceiptCount: 1,
      approvedReceiptCount: 0,
      totalBilled: 1000,
      totalDue: 1000,
      totalPaid: 0
    },
    bills: [],
    receipts: []
  },
  results: {
    summary: {
      gradeCount: 1,
      quizResultCount: 0,
      averageScore: 88,
      bestScore: 88
    },
    grades: [],
    quizResults: []
  },
  activity: { logs: [] },
  timeline: [],
  summary: {
    membershipCount: 1,
    activeMembershipCount: 1,
    remarkCount: 0,
    transferCount: 0,
    documentCount: 0,
    billCount: 1,
    receiptCount: 1,
    gradeCount: 1,
    quizResultCount: 0,
    logCount: 0
  }
};

const serviceMock = {
  async listStudentProfiles() {
    return [{
      studentId: IDS.studentCore,
      userId: IDS.studentUser,
      fullName: 'Alpha Student',
      email: 'alpha.student@example.com',
      admissionNo: 'ADM-01',
      status: 'active',
      currentMembership: {
        id: 'membership-1',
        status: 'active',
        schoolClass: { title: 'Class 10 A' },
        academicYear: { label: '1406' }
      }
    }];
  },
  async getStudentProfile(studentRef) {
    return String(studentRef) === IDS.studentCore || String(studentRef) === IDS.studentUser
      ? JSON.parse(JSON.stringify(sampleProfile))
      : null;
  },
  async updateStudentProfileBasics(studentRef, payload) {
    if (String(studentRef) !== IDS.studentCore) return null;
    const updated = JSON.parse(JSON.stringify(sampleProfile));
    updated.profile.family = payload.family || updated.profile.family;
    return updated;
  },
  async addStudentRemark(studentRef, payload) {
    if (String(studentRef) !== IDS.studentCore) return null;
    const updated = JSON.parse(JSON.stringify(sampleProfile));
    updated.profile.remarks.unshift({
      id: 'remark-1',
      type: payload.type || 'general',
      title: payload.title || '',
      text: payload.text || '',
      visibility: payload.visibility || 'admin',
      createdAt: new Date('2026-03-12T18:00:00.000Z').toISOString()
    });
    updated.summary.remarkCount = 1;
    return updated;
  },
  async addStudentTransfer(studentRef, payload) {
    if (String(studentRef) !== IDS.studentCore) return null;
    const updated = JSON.parse(JSON.stringify(sampleProfile));
    updated.profile.transfers.unshift({
      id: 'transfer-1',
      direction: payload.direction || 'internal',
      fromLabel: payload.fromLabel || '',
      toLabel: payload.toLabel || '',
      transferredAt: new Date('2026-03-12T18:30:00.000Z').toISOString(),
      note: payload.note || ''
    });
    updated.summary.transferCount = 1;
    return updated;
  },
  async addStudentDocument(studentRef, payload) {
    if (String(studentRef) !== IDS.studentCore) return null;
    const updated = JSON.parse(JSON.stringify(sampleProfile));
    updated.profile.documents.unshift({
      id: 'document-1',
      kind: payload.kind || 'other',
      title: payload.title || '',
      fileUrl: payload.fileUrl || '',
      note: payload.note || '',
      uploadedAt: new Date('2026-03-12T19:00:00.000Z').toISOString()
    });
    updated.summary.documentCount = 1;
    return updated;
  },
  async listGuardianCandidates({ query = '' } = {}) {
    if (String(query || '').toLowerCase().includes('none')) return [];
    return [{
      id: IDS.guardianUser,
      name: 'Guardian Alpha',
      email: 'guardian.alpha@example.com',
      role: 'parent',
      orgRole: 'parent',
      status: 'active'
    }];
  },
  async linkGuardianToStudent(studentRef, payload = {}) {
    if (String(studentRef) !== IDS.studentCore) return null;
    const updated = JSON.parse(JSON.stringify(sampleProfile));
    updated.profile.guardians = [{
      id: 'guardian-link-1',
      userId: payload.userId || IDS.guardianUser,
      name: 'Guardian Alpha',
      email: 'guardian.alpha@example.com',
      relation: payload.relation || 'Father',
      isPrimary: Boolean(payload.isPrimary),
      status: 'active',
      linkedAt: new Date('2026-03-12T19:10:00.000Z').toISOString(),
      note: payload.note || ''
    }];
    updated.profile.family.guardianName = 'Guardian Alpha';
    updated.profile.family.guardianRelation = payload.relation || 'Father';
    return updated;
  },
  async unlinkGuardianFromStudent(studentRef, guardianRef) {
    if (String(studentRef) !== IDS.studentCore) return null;
    if (String(guardianRef) !== 'guardian-link-1' && String(guardianRef) !== IDS.guardianUser) {
      const error = new Error('guardian_link_not_found');
      error.code = 'guardian_link_not_found';
      throw error;
    }
    return JSON.parse(JSON.stringify(sampleProfile));
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
      if (permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'studentProfileRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/studentProfileRoutes.js');

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
    if (isRouteFile && request === '../services/studentProfileService') return serviceMock;

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
  app.use('/api/student-profiles', router);

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

  return { status: response.status, data, text };
}

async function run() {
  const cases = [];
  const server = await createServer();

  try {
    cases.push(await request(server, '/api/student-profiles'));
    cases.push(await request(server, '/api/student-profiles', { user: { id: IDS.admin, role: 'admin', permissions: [] } }));
    cases.push(await request(server, '/api/student-profiles', { user: adminWithReports }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}`, { user: adminWithReports }));
    cases.push(await request(server, '/api/student-profiles/guardian-users/search?q=Guardian', { user: adminWithManageUsers }));
    const activityStart = activityCalls.length;
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}`, {
      method: 'PUT',
      user: adminWithManageUsers,
      body: { family: { fatherName: 'Updated Parent' } }
    }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}/remarks`, {
      method: 'POST',
      user: adminWithManageUsers,
      body: { type: 'general', title: 'Follow-up', text: 'Needs follow-up review.' }
    }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}/transfers`, {
      method: 'POST',
      user: adminWithManageUsers,
      body: { direction: 'internal', fromLabel: 'Class 10 A', toLabel: 'Class 10 B' }
    }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}/documents`, {
      method: 'POST',
      user: adminWithManageUsers,
      body: { kind: 'report_card', title: 'Result Sheet', fileUrl: '/uploads/result-sheet.pdf' }
    }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}/guardians/link`, {
      method: 'POST',
      user: adminWithManageUsers,
      body: { userId: IDS.guardianUser, relation: 'Father', isPrimary: true }
    }));
    cases.push(await request(server, `/api/student-profiles/${IDS.studentCore}/guardians/guardian-link-1`, {
      method: 'DELETE',
      user: adminWithManageUsers
    }));

    assertCase(cases[0].status === 401, 'Expected unauthenticated list request to fail.');
    assertCase(cases[1].status === 403, 'Expected missing view_reports permission to fail.');
    assertCase(cases[2].status === 200 && Array.isArray(cases[2].data?.items) && cases[2].data.items.length === 1, 'Expected list route to return one student.');
    assertCase(cases[3].status === 200 && cases[3].data?.item?.identity?.fullName === 'Alpha Student', 'Expected detail route to return profile payload.');
    assertCase(cases[4].status === 200 && Array.isArray(cases[4].data?.items) && cases[4].data.items[0]?.orgRole === 'parent', 'Expected guardian search route to return parent candidates.');
    assertCase(cases[5].status === 200 && cases[5].data?.item?.profile?.family?.fatherName === 'Updated Parent', 'Expected update route to persist family data.');
    assertCase(cases[6].status === 200 && (cases[6].data?.item?.profile?.remarks || []).length === 1, 'Expected remark route to append a remark.');
    assertCase(cases[7].status === 200 && (cases[7].data?.item?.profile?.transfers || []).length === 1, 'Expected transfer route to append a transfer.');
    assertCase(cases[8].status === 200 && (cases[8].data?.item?.profile?.documents || []).length === 1, 'Expected document route to append a document.');
    assertCase(cases[9].status === 200 && (cases[9].data?.item?.profile?.guardians || []).length === 1, 'Expected guardian link route to append a guardian.');
    assertCase(cases[10].status === 200 && (cases[10].data?.item?.profile?.guardians || []).length === 0, 'Expected guardian unlink route to remove a guardian.');
    assertCase(activityCalls.length === activityStart + 6, `Expected 6 student profile activity logs, received ${activityCalls.length - activityStart}.`);
    assertCase(activityCalls[activityStart]?.action === 'update_student_profile', 'Expected update_student_profile activity.');
    assertCase(activityCalls[activityStart + 1]?.action === 'add_student_remark', 'Expected add_student_remark activity.');
    assertCase(activityCalls[activityStart + 2]?.action === 'add_student_transfer', 'Expected add_student_transfer activity.');
    assertCase(activityCalls[activityStart + 3]?.action === 'add_student_document', 'Expected add_student_document activity.');
    assertCase(activityCalls[activityStart + 4]?.action === 'link_student_guardian', 'Expected link_student_guardian activity.');
    assertCase(activityCalls[activityStart + 5]?.action === 'unlink_student_guardian', 'Expected unlink_student_guardian activity.');

    console.log('check:student-profile-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:student-profile-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
