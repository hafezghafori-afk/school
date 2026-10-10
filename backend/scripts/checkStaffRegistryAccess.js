const path = require('path');
const Module = require('module');
const express = require('express');
const jwt = require('jsonwebtoken');

// Until 2026-10-10 /api/afghan-teachers ran optionalAuth only: anyone could list,
// edit and delete the staff registry (tazkira numbers, contacts, salaries). These
// cases pin the gate: a login is required, the permission sets match the
// frontend route guards, salaries stay with the four finance-section levels, and
// a PUT can no longer mass-assign status, provenance, isOwner or raw operators.

process.env.JWT_SECRET = 'staff-registry-check-secret';

const users = {
  student: { _id: '64b000000000000000000001', role: 'student', orgRole: 'student', permissions: [] },
  head: { _id: '64b000000000000000000002', role: 'admin', orgRole: 'head_teacher', adminLevel: 'head_teacher', permissions: [] },
  manager: { _id: '64b000000000000000000003', role: 'admin', orgRole: 'school_manager', adminLevel: 'school_manager', permissions: [] },
  finance: { _id: '64b000000000000000000004', role: 'admin', orgRole: 'finance_manager', adminLevel: 'finance_manager', permissions: [] },
  president: { _id: '64b000000000000000000005', role: 'admin', orgRole: 'general_president', adminLevel: 'general_president', permissions: [] },
  cards: { _id: '64b000000000000000000006', role: 'instructor', orgRole: 'instructor', permissions: ['id_cards.manage'] }
};

const query = (value) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    limit: () => chain,
    skip: () => chain,
    sort: () => chain,
    lean: () => chain,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
  return chain;
};

const userMock = {
  findById(id) {
    return query(Object.values(users).find((user) => user._id === String(id)) || null);
  }
};

const TEACHER_ID = '64b0000000000000000000aa';
const teacherRecord = () => ({
  _id: TEACHER_ID,
  status: 'active',
  isOwner: false,
  personalInfo: { firstName: 'Maryam', lastName: 'Ahmadi', gender: 'female', birthDate: new Date('1990-01-01') },
  identification: { tazkiraNumber: '1400-0101-12345' },
  contactInfo: { province: 'Kabul', mobile: '0700000000' },
  educationInfo: { highestEducation: 'bachelor' },
  employmentInfo: { position: 'teacher', employmentType: 'permanent', hireDate: new Date('2020-01-01') },
  financialInfo: { salary: { base: 15000, housing: 0, transport: 0, other: 0 }, bankAccount: { accountNumber: '123' } },
  totalSalary: 15000,
  notes: {},
  documents: []
});
const asDoc = (plain) => ({ ...plain, toObject: () => JSON.parse(JSON.stringify(plain)) });

const calls = { update: [], find: [] };
const teacherMock = {
  find(filter) {
    calls.find.push(filter);
    return query([asDoc(teacherRecord())]);
  },
  countDocuments: async () => 1,
  findById: () => query(asDoc(teacherRecord())),
  findByIdAndUpdate(id, update) {
    calls.update.push(update);
    return query(asDoc({ ...teacherRecord(), ...update }));
  },
  findByIdAndDelete: () => query(asDoc(teacherRecord())),
  findOne: () => query(null),
  exists: async () => null
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'afghanTeacherRoutes.js');
  const authPath = path.join(__dirname, '..', 'middleware', 'auth.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    if (parentFile.endsWith('/routes/afghanTeacherRoutes.js') || parentFile.endsWith('/middleware/auth.js')) {
      if (request === '../models/User') return userMock;
      if (request === '../models/AfghanTeacher') return teacherMock;
      if (request === '../models/AfghanSchool') return { findById: async () => ({ _id: 'school' }) };
      if (request === '../models/StaffAdvance') return { find: () => query([]) };
      if (request === '../utils/activity') return { logActivity: async () => {} };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(authPath)];
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer(router) {
  const app = express();
  app.use(express.json());
  app.use('/api/afghan-teachers', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const tokenFor = (key) => jwt.sign({ id: users[key]._id, role: users[key].role }, process.env.JWT_SECRET);

async function call(server, method, targetPath, { as, body } = {}) {
  const { port } = server.address();
  const headers = { 'content-type': 'application/json' };
  if (as) headers.authorization = `Bearer ${tokenFor(as)}`;
  const response = await fetch(`http://127.0.0.1:${port}/api/afghan-teachers${targetPath}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

const validCreate = {
  personalInfo: { firstName: 'A', lastName: 'B', firstNameDari: 'ا', lastNameDari: 'ب', fatherName: 'C', gender: 'female', birthDate: '1990-01-01', birthPlace: 'Kabul' },
  identification: { tazkiraNumber: '1400-0101-99999' },
  contactInfo: { mobile: '0700000001', province: 'Kabul', district: 'D1', address: 'Street' },
  employmentInfo: { currentSchool: '64b0000000000000000000ff', employeeId: 'IGS-99', position: 'principal', employmentType: 'permanent', hireDate: '2024-01-01' },
  financialInfo: { salary: { base: 0 } },
  isOwner: true
};

async function run() {
  const originalConsole = { log: console.log, error: console.error, warn: console.warn };
  const server = await createServer(loadRouter());
  try {
    console.log = () => {};
    console.error = () => {};
    console.warn = () => {};

    const anonymous = [
      ['GET', '/'], ['GET', `/${TEACHER_ID}`], ['GET', '/dashboard'], ['GET', '/performance/x'], ['GET', '/workload/x'],
      ['GET', '/bulk-import/template'], ['POST', '/'], ['PUT', `/${TEACHER_ID}`], ['PATCH', `/${TEACHER_ID}/status`],
      ['DELETE', `/${TEACHER_ID}`], ['POST', '/bulk'], ['POST', '/bulk-import'], ['POST', `/${TEACHER_ID}/photo`],
      ['POST', `/${TEACHER_ID}/evaluation`], ['POST', `/${TEACHER_ID}/training`]
    ];
    for (const [method, target] of anonymous) {
      const response = await call(server, method, target, { body: method === 'GET' ? undefined : {} });
      assertCase(response.status === 401, `${method} ${target} without a login must be 401, got ${response.status}.`);
    }

    const student = await call(server, 'GET', '/', { as: 'student' });
    assertCase(student.status === 403, `A student must not read the staff registry, got ${student.status}.`);

    const headList = await call(server, 'GET', '/', { as: 'head' });
    assertCase(headList.status === 200 && headList.data?.teachers?.length === 1, `head_teacher keeps list access, got ${headList.status}.`);
    const headRow = headList.data.teachers[0];
    assertCase(!('financialInfo' in headRow) && !('totalSalary' in headRow), 'head_teacher must not receive salary or bank details.');
    assertCase(headRow.identification?.tazkiraNumber, 'head_teacher still gets the non-financial record.');

    const headOne = await call(server, 'GET', `/${TEACHER_ID}`, { as: 'head' });
    assertCase(headOne.status === 200 && !('financialInfo' in headOne.data.teacher), 'Single-record GET must hide salaries from head_teacher too.');

    const managerList = await call(server, 'GET', '/', { as: 'manager' });
    assertCase(managerList.status === 200 && managerList.data.teachers[0].financialInfo?.salary?.base === 15000, 'school_manager sees the finance section.');

    const financeList = await call(server, 'GET', '/', { as: 'finance' });
    assertCase(financeList.status === 200 && financeList.data.teachers[0].financialInfo, 'finance_manager sees the finance section.');

    const cardsList = await call(server, 'GET', '/?limit=5', { as: 'cards' });
    assertCase(cardsList.status === 200 && !('financialInfo' in cardsList.data.teachers[0]), 'id_cards.manage lists staff without salaries.');
    const cardsOne = await call(server, 'GET', `/${TEACHER_ID}`, { as: 'cards' });
    assertCase(cardsOne.status === 403, `id_cards.manage alone must not open a full record, got ${cardsOne.status}.`);

    for (const [method, target, body] of [
      ['POST', '/', validCreate],
      ['PATCH', `/${TEACHER_ID}/status`, { status: 'on_leave' }],
      ['DELETE', `/${TEACHER_ID}`]
    ]) {
      const response = await call(server, method, target, { as: 'finance', body });
      assertCase(response.status === 403, `finance_manager must not ${method} ${target}, got ${response.status}.`);
    }

    calls.update.length = 0;
    const financeEdit = await call(server, 'PUT', `/${TEACHER_ID}`, {
      as: 'finance',
      body: { personalInfo: { firstName: 'Changed' }, financialInfo: { salary: { base: 18000 } }, status: 'retired' }
    });
    assertCase(financeEdit.status === 200, `finance_manager may edit the finance section, got ${financeEdit.status}.`);
    assertCase(
      JSON.stringify(Object.keys(calls.update[0]).sort()) === JSON.stringify(['financialInfo', 'lastUpdatedBy']),
      `finance_manager PUT must keep only financialInfo, kept ${Object.keys(calls.update[0]).join(',')}.`
    );

    calls.update.length = 0;
    const headEdit = await call(server, 'PUT', `/${TEACHER_ID}`, {
      as: 'head',
      body: {
        personalInfo: { firstName: 'Changed' },
        financialInfo: { salary: { base: 0 } },
        'financialInfo.salary.base': 1,
        status: 'retired',
        createdBy: users.student._id,
        documents: [{ url: 'uploads/x' }],
        isOwner: true,
        $set: { status: 'terminated' }
      }
    });
    assertCase(headEdit.status === 200, `head_teacher may edit a record, got ${headEdit.status}.`);
    assertCase(
      JSON.stringify(Object.keys(calls.update[0]).sort()) === JSON.stringify(['lastUpdatedBy', 'personalInfo']),
      `head_teacher PUT must drop finance, status, provenance, documents, isOwner and operators, kept ${Object.keys(calls.update[0]).join(',')}.`
    );
    assertCase(!('financialInfo' in headEdit.data.teacher), 'The PUT response must hide salaries from head_teacher as well.');

    calls.update.length = 0;
    await call(server, 'PUT', `/${TEACHER_ID}`, { as: 'president', body: { isOwner: true, financialInfo: { salary: { base: 20000 } } } });
    assertCase(calls.update[0].isOwner === true && calls.update[0].financialInfo, 'general_president keeps full edit rights, isOwner included.');

    calls.find.length = 0;
    const search = await call(server, 'GET', `/?search=${encodeURIComponent('a.*(')}`, { as: 'manager' });
    assertCase(search.status === 200, `A regex-looking search must not error, got ${search.status}.`);
    const regex = calls.find[0]?.$or?.[0]?.['personalInfo.firstName']?.$regex;
    assertCase(regex === 'a\\.\\*\\(', `Search text must be matched literally, got ${regex}.`);
  } finally {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    await new Promise((resolve) => server.close(resolve));
  }
}

run()
  .then(() => {
    console.log('[check:staff-registry-access] ok');
  })
  .catch((error) => {
    console.error('[check:staff-registry-access] failed');
    console.error(error);
    process.exit(1);
  });
