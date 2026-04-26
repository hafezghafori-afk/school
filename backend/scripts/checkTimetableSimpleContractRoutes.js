const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86101',
  entryA: '507f191e810c19729de86111',
  school: '507f191e810c19729de86121',
  year: '507f191e810c19729de86122',
  shift: '507f191e810c19729de86123',
  classA: '507f191e810c19729de86131',
  classB: '507f191e810c19729de86132',
  teacherA: '507f191e810c19729de86141',
  teacherB: '507f191e810c19729de86142',
  subjectA: '507f191e810c19729de86151',
  subjectB: '507f191e810c19729de86152'
};

let seq = 9000;
const nextId = () => String(++seq);

const db = {
  entries: [
    {
      _id: IDS.entryA,
      schoolId: IDS.school,
      academicYearId: IDS.year,
      shiftId: IDS.shift,
      classId: IDS.classA,
      subjectId: IDS.subjectA,
      teacherId: IDS.teacherA,
      dayCode: 'saturday',
      periodIndex: 1,
      startTime: '08:00',
      endTime: '08:40',
      status: 'draft',
      source: 'manual_override'
    }
  ]
};

const activityCalls = [];

const clone = (value) => JSON.parse(JSON.stringify(value));

const matchesPrimitive = (actual, expected) => String(actual) === String(expected);

const matchesQuery = (doc, query = {}) => {
  for (const [key, expected] of Object.entries(query || {})) {
    if (key === '$or') {
      const list = Array.isArray(expected) ? expected : [];
      if (!list.some((item) => matchesQuery(doc, item))) return false;
      continue;
    }

    if (key === '_id' && expected && typeof expected === 'object' && expected.$ne !== undefined) {
      if (String(doc._id) === String(expected.$ne)) return false;
      continue;
    }

    if (expected && typeof expected === 'object' && expected.$ne !== undefined) {
      if (String(doc[key]) === String(expected.$ne)) return false;
      continue;
    }

    if (expected && typeof expected === 'object' && expected.$or) {
      if (!matchesQuery(doc, expected)) return false;
      continue;
    }

    if (!matchesPrimitive(doc[key], expected)) return false;
  }

  return true;
};

function makePopulatable(entry) {
  const value = entry ? clone(entry) : null;
  return {
    ...value,
    populate() {
      return this;
    }
  };
}

function TimetableEntryMock(doc = {}) {
  Object.assign(this, clone(doc));
  this._id = this._id || nextId();
  this.save = async () => {
    db.entries.push(clone(this));
    return this;
  };
}

TimetableEntryMock.findOne = async (query = {}) => {
  const found = db.entries.find((entry) => matchesQuery(entry, query));
  return found ? clone(found) : null;
};

TimetableEntryMock.findById = (id) => {
  const found = db.entries.find((entry) => String(entry._id) === String(id));
  return makePopulatable(found || null);
};

TimetableEntryMock.findByIdAndUpdate = (id, update = {}) => {
  const index = db.entries.findIndex((entry) => String(entry._id) === String(id));
  if (index < 0) return makePopulatable(null);
  db.entries[index] = { ...db.entries[index], ...clone(update) };
  return makePopulatable(db.entries[index]);
};

TimetableEntryMock.findByIdAndDelete = async (id) => {
  const index = db.entries.findIndex((entry) => String(entry._id) === String(id));
  if (index < 0) return null;
  const [removed] = db.entries.splice(index, 1);
  return clone(removed);
};

const TeacherAvailabilityMock = {
  async findOne() {
    return null;
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

const roleCheckMock = {
  checkRole(roles = []) {
    return (req, res, next) => (
      roles.includes(String(req.user?.role || ''))
        ? next()
        : res.status(403).json({ success: false, message: 'Forbidden by role.' })
    );
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'timetableLegacyRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');

    if (parentFile.endsWith('/routes/timetableLegacyRoutes.js') && request === './timetableGeneratorRoutes') {
      return express.Router();
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../models/TimetableEntry') {
      return TimetableEntryMock;
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../models/TeacherAvailability') {
      return TeacherAvailabilityMock;
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../middleware/auth') {
      return authMock;
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../middleware/roleCheck') {
      return roleCheckMock;
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../utils/activity') {
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

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request === '../utils/routeWriteAudit') {
      return {
        attachWriteActivityAudit() {
          return undefined;
        }
      };
    }

    if (parentFile.endsWith('/routes/timetableEditorRoutes.js') && request.startsWith('../models/')) {
      return {};
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

function assertCase(condition, message) {
  if (!condition) throw new Error(message);
}

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/timetable', loadRouter());
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

  return { status: response.status, data };
}

async function run() {
  const server = await createServer();
  const admin = { id: IDS.admin, role: 'admin' };

  try {
    const before = db.entries.length;

    const breakSlot = await request(server, '/api/timetable', {
      method: 'POST',
      user: admin,
      body: {
        schoolId: IDS.school,
        academicYearId: IDS.year,
        shiftId: IDS.shift,
        classId: IDS.classB,
        subjectId: IDS.subjectB,
        teacherId: IDS.teacherB,
        dayCode: 'saturday',
        slotNumber: 4
      }
    });

    const classConflict = await request(server, '/api/timetable', {
      method: 'POST',
      user: admin,
      body: {
        schoolId: IDS.school,
        academicYearId: IDS.year,
        shiftId: IDS.shift,
        classId: IDS.classA,
        subjectId: IDS.subjectB,
        teacherId: IDS.teacherB,
        dayCode: 'saturday',
        slotNumber: 1
      }
    });

    const teacherConflict = await request(server, '/api/timetable', {
      method: 'POST',
      user: admin,
      body: {
        schoolId: IDS.school,
        academicYearId: IDS.year,
        shiftId: IDS.shift,
        classId: IDS.classB,
        subjectId: IDS.subjectB,
        teacherId: IDS.teacherA,
        dayCode: 'saturday',
        slotNumber: 1
      }
    });

    const created = await request(server, '/api/timetable', {
      method: 'POST',
      user: admin,
      body: {
        schoolId: IDS.school,
        academicYearId: IDS.year,
        shiftId: IDS.shift,
        classId: IDS.classB,
        subjectId: IDS.subjectB,
        teacherId: IDS.teacherB,
        dayCode: 'sunday',
        slotNumber: 2
      }
    });

    const createdId = created?.data?.data?._id;

    const updated = await request(server, `/api/timetable/${createdId}`, {
      method: 'PUT',
      user: admin,
      body: {
        dayCode: 'monday',
        slotNumber: 3,
        source: 'manual_move'
      }
    });

    const deleted = await request(server, `/api/timetable/${createdId}`, {
      method: 'DELETE',
      user: admin
    });

    const removedAllAlias = await request(server, '/api/timetable/all?schoolId=default-school-id', {
      method: 'GET',
      user: admin
    });

    const removedGenerateAlias = await request(server, '/api/timetable/generate-timetable', {
      method: 'POST',
      user: admin,
      body: {
        schoolId: IDS.school,
        academicYearId: IDS.year,
        shiftId: IDS.shift
      }
    });

    assertCase(breakSlot.status === 400, 'Expected break slot write to be blocked.');
    assertCase(String(breakSlot?.data?.message || '').toLowerCase().includes('allowed class periods'), 'Expected break slot validation message.');

    assertCase(classConflict.status === 400, 'Expected class conflict to return 400.');
    assertCase(classConflict?.data?.conflictType === 'class', 'Expected class conflictType.');

    assertCase(teacherConflict.status === 400, 'Expected teacher conflict to return 400.');
    assertCase(teacherConflict?.data?.conflictType === 'teacher', 'Expected teacher conflictType.');

    assertCase(created.status === 201 && created?.data?.success, 'Expected create via POST /api/timetable to succeed.');
    assertCase(updated.status === 200 && updated?.data?.success, 'Expected update via PUT /api/timetable/:id to succeed.');
    assertCase(deleted.status === 200 && deleted?.data?.success, 'Expected delete via DELETE /api/timetable/:id to succeed.');
    assertCase(removedAllAlias.status === 404, 'Expected removed alias GET /api/timetable/all to return 404.');
    assertCase(removedGenerateAlias.status === 404, 'Expected removed alias POST /api/timetable/generate-timetable to return 404.');

    assertCase(db.entries.length === before, 'Expected entry count to return to baseline after create+delete.');

    console.log('check:timetable-simple-contract-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:timetable-simple-contract-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
