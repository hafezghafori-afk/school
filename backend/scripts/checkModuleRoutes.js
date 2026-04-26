const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de87001',
  instructor: '507f191e810c19729de87002',
  class1: '507f191e810c19729de87101',
  course1: '507f191e810c19729de87102',
  module1: '507f191e810c19729de87103',
  module2: '507f191e810c19729de87104',
  lesson1: '507f191e810c19729de87105',
  lesson2: '507f191e810c19729de87106'
};

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const moduleRecords = [
  {
    _id: IDS.module1,
    classId: IDS.class1,
    course: IDS.course1,
    title: 'Canonical Module',
    order: 1
  },
  {
    _id: IDS.module2,
    classId: null,
    course: IDS.course1,
    title: 'Legacy Module',
    order: 2
  }
];

const lessonRecords = [
  {
    _id: IDS.lesson1,
    module: IDS.module1,
    title: 'Lesson One',
    type: 'video',
    order: 1
  },
  {
    _id: IDS.lesson2,
    module: IDS.module2,
    title: 'Lesson Two',
    type: 'pdf',
    order: 1
  }
];

let nextModuleId = 3;

function matchesFilter(item, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected) && expected.some((entry) => matchesFilter(item, entry));
    }

    const actual = item?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return Array.isArray(expected.$in) && expected.$in.some((value) => String(actual) === String(value));
      }
      if ('$exists' in expected) {
        const exists = actual !== undefined;
        return Boolean(expected.$exists) === exists;
      }
    }

    return String(actual) === String(expected);
  });
}

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.sortSpec = null;
  }

  sort(spec = {}) {
    this.sortSpec = spec;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      const value = clone(this.executor());
      if (!Array.isArray(value) || !this.sortSpec) return value;
      const [field, direction] = Object.entries(this.sortSpec)[0] || [];
      if (!field) return value;
      return value.sort((left, right) => {
        const leftValue = Number(left?.[field] || 0);
        const rightValue = Number(right?.[field] || 0);
        return direction >= 0 ? leftValue - rightValue : rightValue - leftValue;
      });
    });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

const ModuleMock = {
  create(payload = {}) {
    const item = {
      _id: `module-${nextModuleId++}`,
      classId: payload.classId || null,
      course: payload.course || null,
      title: payload.title || '',
      order: Number(payload.order) || 0
    };
    moduleRecords.push(item);
    return Promise.resolve(clone(item));
  },
  find(filter = {}) {
    return new MockQuery(() => moduleRecords.filter((item) => matchesFilter(item, filter)));
  },
  findByIdAndUpdate(id, update = {}, options = {}) {
    const index = moduleRecords.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return Promise.resolve(null);
    moduleRecords[index] = { ...moduleRecords[index], ...clone(update) };
    return Promise.resolve(options.new ? clone(moduleRecords[index]) : null);
  },
  findByIdAndDelete(id) {
    const index = moduleRecords.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return Promise.resolve(null);
    const [removed] = moduleRecords.splice(index, 1);
    return Promise.resolve(clone(removed));
  }
};

const LessonMock = {
  create(payload = {}) {
    const item = {
      _id: `lesson-${lessonRecords.length + 1}`,
      module: payload.module || null,
      title: payload.title || '',
      type: payload.type || 'video',
      contentUrl: payload.contentUrl || '',
      durationMinutes: Number(payload.durationMinutes) || 0,
      order: Number(payload.order) || 0
    };
    lessonRecords.push(item);
    return Promise.resolve(clone(item));
  },
  find(filter = {}) {
    return new MockQuery(() => lessonRecords.filter((item) => matchesFilter(item, filter)));
  },
  deleteMany(filter = {}) {
    for (let index = lessonRecords.length - 1; index >= 0; index -= 1) {
      if (matchesFilter(lessonRecords[index], filter)) {
        lessonRecords.splice(index, 1);
      }
    }
    return Promise.resolve({ deletedCount: 0 });
  },
  findByIdAndUpdate(id, update = {}, options = {}) {
    const index = lessonRecords.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return Promise.resolve(null);
    lessonRecords[index] = { ...lessonRecords[index], ...clone(update) };
    return Promise.resolve(options.new ? clone(lessonRecords[index]) : null);
  },
  findByIdAndDelete(id) {
    const index = lessonRecords.findIndex((item) => String(item._id) === String(id));
    if (index === -1) return Promise.resolve(null);
    const [removed] = lessonRecords.splice(index, 1);
    return Promise.resolve(clone(removed));
  }
};

const authMock = {
  requireAuth(req, res, next) {
    try {
      req.user = req.headers['x-test-user'] ? JSON.parse(req.headers['x-test-user']) : null;
    } catch {
      req.user = null;
    }
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    return next();
  },
  requireRole() {
    return (req, res, next) => next();
  },
  requirePermission() {
    return (req, res, next) => next();
  }
};

const activityMock = {
  logActivity() {
    return Promise.resolve();
  }
};

const classScopeMock = {
  normalizeText(value = '') {
    return String(value || '').trim();
  },
  serializeSchoolClassLite(value = null) {
    if (!value) return null;
    return {
      _id: value._id || value.id || value,
      id: value._id || value.id || value,
      title: value.title || '',
      code: value.code || ''
    };
  },
  async resolveClassCourseReference({ classId = '', courseId = '' } = {}) {
    const normalizedClassId = String(classId || '').trim();
    const normalizedCourseId = String(courseId || '').trim();

    if (normalizedClassId && normalizedClassId !== IDS.class1) {
      return { error: 'Class is invalid.' };
    }
    if (normalizedCourseId && normalizedCourseId !== IDS.course1) {
      return { error: 'Course is invalid.' };
    }
    if (
      (normalizedClassId && normalizedClassId !== IDS.class1)
      || (normalizedCourseId && normalizedCourseId !== IDS.course1)
    ) {
      return { error: 'classId and courseId do not match.' };
    }

    if (!normalizedClassId && !normalizedCourseId) {
      return { classId: '', courseId: '', schoolClass: null, course: null };
    }

    return {
      classId: IDS.class1,
      courseId: IDS.course1,
      schoolClass: {
        _id: IDS.class1,
        id: IDS.class1,
        title: 'Class One Core',
        code: '10A'
      },
      course: {
        _id: IDS.course1,
        title: 'Legacy Course One'
      }
    };
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'moduleRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isModuleRoute = parentFile.endsWith('/routes/moduleRoutes.js');

    if (isModuleRoute && request === '../models/Module') return ModuleMock;
    if (isModuleRoute && request === '../models/Lesson') return LessonMock;
    if (isModuleRoute && request === '../middleware/auth') return authMock;
    if (isModuleRoute && request === '../utils/activity') return activityMock;
    if (isModuleRoute && request === '../utils/classScope') return classScopeMock;

    return originalLoad(request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const router = loadRouter();

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/modules', router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload;

  if (user) headers['x-test-user'] = JSON.stringify(user);
  if (body !== undefined) {
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
    data
  };
}

async function run() {
  const server = await createServer();
  const cases = [];
  const instructorUser = {
    id: IDS.instructor,
    role: 'instructor',
    permissions: ['manage_content']
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
    await check('module route smoke: canonical class list returns canonical and legacy rows', async () => {
      const response = await request(server, `/api/modules/class/${IDS.class1}`);
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Array.isArray(response.data?.modules), 'expected modules array');
      assertCase(response.data.modules.length === 2, `expected 2 modules, received ${response.data.modules?.length || 0}`);
      assertCase(String(response.data.modules[0]?.classId || '') === IDS.class1, 'expected canonical classId on module payload');
      assertCase(String(response.data.modules[0]?.courseId || '') === IDS.course1, 'expected compatibility courseId on module payload');
      assertCase(response.data.modules[0]?.schoolClass?.title === 'Class One Core', 'expected nested schoolClass payload');
      assertCase(Array.isArray(response.data?.lessons) && response.data.lessons.length === 2, 'expected two lessons');
    });

    await check('module route smoke: legacy course list returns deprecation headers', async () => {
      const response = await request(server, `/api/modules/course/${IDS.course1}`);
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated-route header');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/modules/class/${IDS.class1}`, 'expected replacement endpoint');
    });

    await check('module route smoke: canonical class create stores classId and courseId', async () => {
      const response = await request(server, `/api/modules/class/${IDS.class1}`, {
        method: 'POST',
        user: instructorUser,
        body: {
          title: 'New Canonical Module',
          order: 3
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(String(response.data?.module?.classId || '') === IDS.class1, 'expected canonical classId on create');
      assertCase(String(response.data?.module?.courseId || '') === IDS.course1, 'expected compatibility courseId on create');
    });

    await check('module route smoke: legacy course create stays compatibility-aware', async () => {
      const response = await request(server, `/api/modules/course/${IDS.course1}`, {
        method: 'POST',
        user: instructorUser,
        body: {
          title: 'Legacy Compat Module',
          order: 4
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated-route header on legacy create');
      assertCase(String(response.data?.module?.classId || '') === IDS.class1, 'expected canonical classId on legacy create');
      assertCase(String(response.data?.module?.courseId || '') === IDS.course1, 'expected compatibility courseId on legacy create');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  let hasFailure = false;
  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log(`PASS  ${item.label}`);
      return;
    }
    hasFailure = true;
    console.error(`FAIL  ${item.label}`);
    console.error(`      ${item.error}`);
  });

  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  console.log(`\nModule route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
