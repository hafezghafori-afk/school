const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin1: '507f1f77bcf86cd799439001',
  instructor1: '507f1f77bcf86cd799439002',
  student1: '507f1f77bcf86cd799439011',
  class1: '507f191e810c19729de86101',
  class2: '507f191e810c19729de86102',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb',
  course3: '507f191e810c19729de860ec'
};

const users = [
  { _id: IDS.admin1, name: 'Admin One', role: 'admin' },
  { _id: IDS.instructor1, name: 'Instructor One', role: 'instructor' },
  { _id: IDS.student1, name: 'Student One', role: 'student' }
];

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', schoolClassRef: IDS.class1 },
  { _id: IDS.course2, title: 'Class Two', category: 'Evening', schoolClassRef: IDS.class2 },
  { _id: IDS.course3, title: 'Legacy Public Course', category: 'Public', schoolClassRef: null }
];

const schoolClasses = [
  {
    _id: IDS.class1,
    title: 'Class One Core',
    code: '10A',
    gradeLevel: '10',
    section: 'A',
    legacyCourseId: IDS.course1
  },
  {
    _id: IDS.class2,
    title: 'Class Two Core',
    code: '11B',
    gradeLevel: '11',
    section: 'B',
    legacyCourseId: IDS.course2
  }
];

const membershipRecords = [
  {
    _id: 'mem-1',
    student: IDS.student1,
    classId: IDS.class1,
    course: IDS.course1,
    status: 'active',
    isCurrent: true
  }
];

const quizRecords = [
  {
    _id: 'quiz-legacy-1',
    subject: 'math',
    classId: IDS.class1,
    course: IDS.course1,
    questions: [
      {
        questionText: '2 + 2 = ?',
        options: ['3', '4', '5'],
        correctAnswer: 1
      }
    ],
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z')
  }
];

const recordingRecords = [
  {
    _id: 'recording-1',
    classId: IDS.class1,
    course: IDS.course1,
    title: 'Week 1 Recording',
    description: 'Introduction session',
    sessionDate: new Date('2026-03-05T08:00:00.000Z'),
    fileUrl: 'uploads/recordings/week1.mp4',
    fileName: 'week1.mp4',
    createdBy: IDS.instructor1,
    createdAt: new Date('2026-03-05T09:00:00.000Z'),
    updatedAt: new Date('2026-03-05T09:00:00.000Z')
  },
  {
    _id: 'recording-2',
    classId: IDS.class2,
    course: IDS.course2,
    title: 'Week 2 Recording',
    description: 'Different class',
    sessionDate: new Date('2026-03-06T08:00:00.000Z'),
    fileUrl: 'uploads/recordings/week2.mp4',
    fileName: 'week2.mp4',
    createdBy: IDS.instructor1,
    createdAt: new Date('2026-03-06T09:00:00.000Z'),
    updatedAt: new Date('2026-03-06T09:00:00.000Z')
  }
];

const activityLog = [];
let nextQuizId = 2;
let nextRecordingId = 3;

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const asComparable = (value) => {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const normalizeSortValue = (value) => {
  if (value instanceof Date) return { type: 'number', value: value.getTime() };
  if (typeof value === 'number') return { type: 'number', value };
  if (typeof value === 'string') {
    const asDate = new Date(value).getTime();
    if (!Number.isNaN(asDate) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return { type: 'number', value: asDate };
    }
    return { type: 'string', value: value.toLowerCase() };
  }
  if (value && typeof value === 'object' && value._id) {
    return { type: 'string', value: String(value._id).toLowerCase() };
  }
  return { type: 'string', value: String(value || '').toLowerCase() };
};

const matchesValue = (actual, expected) => {
  if (expected instanceof RegExp) {
    if (Array.isArray(actual)) return actual.some((item) => expected.test(String(item || '')));
    return expected.test(String(actual || ''));
  }
  if (Array.isArray(actual)) return actual.some((item) => asComparable(item) === asComparable(expected));
  return asComparable(actual) === asComparable(expected);
};

const matchesFilter = (item, filter = {}) => {
  if (filter && typeof filter === 'object' && Array.isArray(filter.$and)) {
    const { $and, ...rest } = filter;
    return matchesFilter(item, rest) && $and.every((candidate) => matchesFilter(item, candidate));
  }
  if (filter && typeof filter === 'object' && Array.isArray(filter.$or)) {
    const { $or, ...rest } = filter;
    return matchesFilter(item, rest) && $or.some((candidate) => matchesFilter(item, candidate));
  }

  return Object.entries(filter).every(([key, expected]) => {
    const actual = item[key];
    if (expected instanceof RegExp) return matchesValue(actual, expected);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return expected.$in.some((candidate) => matchesValue(actual, candidate));
      }
      if ('$ne' in expected) {
        return !matchesValue(actual, expected.$ne);
      }
    }
    return matchesValue(actual, expected);
  });
};

const hydrateUser = (value) => users.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateCourse = (value) => courses.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateSchoolClass = (value) => schoolClasses.find((item) => String(item._id) === String(value?._id || value)) || null;

const applyPopulate = (value, fields = []) => {
  const populateOne = (item) => {
    if (!item || typeof item !== 'object') return item;
    const next = clone(item);
    fields.forEach((field) => {
      if (field === 'course' && next.course) next.course = hydrateCourse(next.course);
      if (field === 'classId' && next.classId) next.classId = hydrateSchoolClass(next.classId);
      if (field === 'createdBy' && next.createdBy) next.createdBy = hydrateUser(next.createdBy);
    });
    return next;
  };

  if (Array.isArray(value)) return value.map(populateOne);
  return populateOne(value);
};

const applySort = (value, spec) => {
  if (!Array.isArray(value) || !spec) return value;
  const entries = Object.entries(spec);
  return [...value].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = normalizeSortValue(left?.[field]);
      const rightValue = normalizeSortValue(right?.[field]);
      let comparison = 0;
      if (leftValue.type === 'number' && rightValue.type === 'number') {
        comparison = leftValue.value - rightValue.value;
      } else {
        comparison = String(leftValue.value).localeCompare(String(rightValue.value));
      }
      if (comparison === 0) continue;
      return direction >= 0 ? comparison : -comparison;
    }
    return 0;
  });
};

class MockQuery {
  constructor(executor, options = {}) {
    this.executor = executor;
    this.populateFields = [];
    this.sortSpec = null;
    this.firstResult = !!options.firstResult;
  }

  select() {
    return this;
  }

  populate(field) {
    if (field) this.populateFields.push(field);
    return this;
  }

  sort(spec) {
    this.sortSpec = spec || null;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = clone(this.executor());
      if (Array.isArray(value)) {
        value = applySort(value, this.sortSpec);
        if (this.firstResult) {
          return applyPopulate(value[0] || null, this.populateFields);
        }
        return applyPopulate(value, this.populateFields);
      }
      return applyPopulate(value, this.populateFields);
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

const CourseMock = {
  findById(id) {
    return new MockQuery(() => courses.filter((item) => String(item._id) === String(id)), { firstResult: true });
  }
};

const SchoolClassMock = {
  findById(id) {
    return new MockQuery(() => schoolClasses.filter((item) => String(item._id) === String(id)), { firstResult: true });
  },
  findOne(filter = {}) {
    return new MockQuery(() => schoolClasses.filter((item) => matchesFilter(item, filter)), { firstResult: true });
  }
};

const QuizMock = {
  async create(payload = {}) {
    const item = {
      _id: `quiz-${nextQuizId++}`,
      classId: payload.classId || null,
      course: payload.course || null,
      subject: payload.subject || '',
      questions: clone(payload.questions || []),
      createdAt: new Date('2026-03-10T08:00:00.000Z'),
      updatedAt: new Date('2026-03-10T08:00:00.000Z')
    };
    quizRecords.push(item);
    return clone(item);
  },
  findOne(filter = {}) {
    return new MockQuery(() => quizRecords.filter((item) => matchesFilter(item, filter)), { firstResult: true });
  }
};

const VirtualRecordingMock = {
  find(filter = {}) {
    return new MockQuery(() => recordingRecords.filter((item) => matchesFilter(item, filter)));
  },
  async create(payload = {}) {
    const item = {
      _id: `recording-${nextRecordingId++}`,
      classId: payload.classId || null,
      course: payload.course || null,
      title: payload.title || '',
      description: payload.description || '',
      sessionDate: payload.sessionDate || new Date('2026-03-10T08:00:00.000Z'),
      fileUrl: payload.fileUrl || '',
      fileName: payload.fileName || '',
      createdBy: payload.createdBy || null,
      createdAt: new Date('2026-03-10T09:00:00.000Z'),
      updatedAt: new Date('2026-03-10T09:00:00.000Z')
    };
    recordingRecords.push(item);
    return clone(item);
  },
  findById(id) {
    return new MockQuery(() => recordingRecords.filter((item) => String(item._id) === String(id)), { firstResult: true });
  },
  async deleteOne(filter = {}) {
    const index = recordingRecords.findIndex((item) => matchesFilter(item, filter));
    if (index >= 0) recordingRecords.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  }
};

const StudentMembershipMock = {
  async distinct(field, filter = {}) {
    const items = membershipRecords.filter((item) => matchesFilter(item, filter));
    return [...new Set(items.map((item) => item[field]).filter(Boolean).map(String))];
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
  },
  requireRole(allowedRoles = []) {
    return (req, res, next) => {
      if (allowedRoles.includes(String(req.user?.role || ''))) return next();
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

const activityMock = {
  async logActivity(payload = {}) {
    activityLog.push({
      action: payload.action || '',
      targetType: payload.targetType || '',
      targetId: payload.targetId || '',
      meta: clone(payload.meta || {})
    });
  }
};

function multerMock() {
  return {
    fields() {
      return (req, res, next) => next();
    },
    single() {
      return (req, res, next) => {
        req.file = {
          filename: String(req.get('x-test-file-name') || 'recording.mp4'),
          originalname: String(req.get('x-test-file-name') || 'recording.mp4')
        };
        next();
      };
    }
  };
}
multerMock.diskStorage = () => ({});

const noopModel = {};

function loadRouter(routeName) {
  const routePath = path.join(__dirname, '..', 'routes', routeName);
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isQuizRoute = parentFile.endsWith('/routes/quizRoutes.js');
    const isRecordingRoute = parentFile.endsWith('/routes/recordingRoutes.js');
    const isCourseRoute = parentFile.endsWith('/routes/courseRoutes.js');

    if ((isQuizRoute || isRecordingRoute || isCourseRoute) && request === '../models/Course') return CourseMock;
    if ((isQuizRoute || isRecordingRoute || isCourseRoute) && request === '../models/SchoolClass') return SchoolClassMock;
    if (isQuizRoute && request === '../models/Quiz') return QuizMock;
    if (isRecordingRoute && request === '../models/StudentMembership') return StudentMembershipMock;
    if (isRecordingRoute && request === '../models/VirtualRecording') return VirtualRecordingMock;
    if ((isQuizRoute || isRecordingRoute || isCourseRoute) && request === '../middleware/auth') return authMock;
    if ((isQuizRoute || isRecordingRoute || isCourseRoute) && request === '../utils/activity') return activityMock;
    if ((isRecordingRoute || isCourseRoute) && request === 'multer') return multerMock;
    if (isCourseRoute && [
      '../models/CourseJoinRequest',
      '../models/Schedule',
      '../models/Grade',
      '../models/Attendance',
      '../models/Homework',
      '../models/HomeworkSubmission',
      '../models/Result',
      '../models/Module',
      '../models/Comment',
      '../models/ChatThread',
      '../models/FinanceBill',
      '../models/FinanceFeePlan',
      '../models/FinanceReceipt',
      '../models/InstructorSubject'
    ].includes(request)) {
      return noopModel;
    }
    if (isCourseRoute && request === '../models/Quiz') return QuizMock;
    if (isCourseRoute && request === '../models/VirtualRecording') return VirtualRecordingMock;
    if (isCourseRoute && request === '../models/StudentMembership') return StudentMembershipMock;

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const quizRouter = loadRouter('quizRoutes.js');
const recordingRouter = loadRouter('recordingRoutes.js');
const courseRouter = loadRouter('courseRoutes.js');

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/courses', courseRouter);
  app.use('/api/quizzes', quizRouter);
  app.use('/api/recordings', recordingRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body, headers = {} } = {}) {
  const address = server.address();
  const requestHeaders = { ...headers };
  let payload;

  if (user) requestHeaders['x-test-user'] = JSON.stringify(user);
  if (body !== undefined) {
    requestHeaders['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${targetPath}`, {
    method,
    headers: requestHeaders,
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

  const instructorUser = {
    id: IDS.instructor1,
    role: 'instructor',
    permissions: ['manage_content']
  };
  const studentUser = {
    id: IDS.student1,
    role: 'student',
    permissions: []
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
    await check('legacy course catalog returns retirement payload', async () => {
      const response = await request(server, '/api/courses/all');
      assertCase(response.status === 410, `expected 410, received ${response.status}`);
      assertCase(response.data?.code === 'legacy_course_catalog_retired', 'expected legacy retirement code');
      assertCase(response.data?.replacementEndpoint === '/api/education/public-school-classes', 'expected replacement endpoint');
      assertCase(String(response.headers.link || '').includes('/api/education/public-school-classes'), 'expected successor link header');
    });

    await check('legacy course detail resolves canonical public-school-class detail', async () => {
      const response = await request(server, `/api/courses/${IDS.course1}`);
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true for legacy detail');
      assertCase(String(response.data?.course?.classId || '') === IDS.class1, 'expected canonical classId in legacy detail');
      assertCase(String(response.data?.course?.schoolClass?._id || response.data?.course?.schoolClass?.id || '') === IDS.class1, 'expected nested schoolClass payload in legacy detail');
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated-route header');
      assertCase(
        response.headers['x-replacement-endpoint'] === `/api/education/public-school-classes/${IDS.class1}`,
        'expected replacement endpoint for legacy detail'
      );
    });

    await check('quiz subject lookup resolves canonical classId via course compatibility', async () => {
      const response = await request(server, `/api/quizzes/subject/math?courseId=${IDS.course1}`);
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.success === true, 'expected success=true');
      assertCase(String(response.data?.quiz?.classId || '') === IDS.class1, 'expected canonical classId');
      assertCase(String(response.data?.quiz?.courseId || '') === IDS.course1, 'expected compatibility courseId');
      assertCase(response.data?.quiz?.questions?.[0]?.correctIndex === 1, 'expected serialized correctIndex');
    });

    await check('quiz lookup rejects course-only reads without school-class mapping', async () => {
      const response = await request(server, `/api/quizzes/subject/math?courseId=${IDS.course3}`);
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
      assertCase(response.data?.message === 'Class mapping is required for quiz lookup.', 'expected class-mapping lookup guard');
    });

    await check('quiz create stores classId and compatibility courseId', async () => {
      const response = await request(server, '/api/quizzes/create', {
        method: 'POST',
        user: instructorUser,
        body: {
          classId: IDS.class1,
          subject: 'science',
          questions: [
            {
              text: 'Water freezes at?',
              options: ['0C', '20C', '50C'],
              correctIndex: 0
            }
          ]
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(String(response.data?.quiz?.classId || '') === IDS.class1, 'expected canonical classId in quiz response');
      assertCase(String(response.data?.quiz?.courseId || '') === IDS.course1, 'expected compatibility courseId in quiz response');
      const stored = quizRecords.find((item) => item.subject === 'science');
      assertCase(!!stored, 'expected quiz record to be stored');
      assertCase(String(stored.classId || '') === IDS.class1, 'expected stored quiz classId');
      assertCase(String(stored.course || '') === IDS.course1, 'expected stored quiz courseId');
    });

    await check('quiz create rejects course-only writes without school-class mapping', async () => {
      const response = await request(server, '/api/quizzes/create', {
        method: 'POST',
        user: instructorUser,
        body: {
          courseId: IDS.course3,
          subject: 'history',
          questions: [
            {
              text: 'Legacy only?',
              options: ['yes', 'no'],
              correctIndex: 0
            }
          ]
        }
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
      assertCase(response.data?.message === 'Class mapping is required before creating a quiz.', 'expected class-mapping guard message');
    });

    await check('recordings list enforces canonical student access', async () => {
      const response = await request(server, `/api/recordings?classId=${IDS.class1}`, {
        user: studentUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Array.isArray(response.data?.items) && response.data.items.length === 1, 'expected one accessible recording');
      assertCase(String(response.data.items[0]?.classId || '') === IDS.class1, 'expected canonical classId in recording payload');
      assertCase(String(response.data.items[0]?.courseId || '') === IDS.course1, 'expected compatibility courseId in recording payload');
      assertCase(response.data.items[0]?.schoolClass?.title === 'Class One Core', 'expected schoolClass payload');
    });

    await check('recordings list resolves course compatibility through class mapping', async () => {
      const response = await request(server, `/api/recordings?courseId=${IDS.course1}`, {
        user: studentUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Array.isArray(response.data?.items) && response.data.items.length === 1, 'expected one compatible recording');
      assertCase(String(response.data.items[0]?.classId || '') === IDS.class1, 'expected canonical classId in compatibility read');
    });

    await check('recordings list rejects course-only reads without school-class mapping', async () => {
      const response = await request(server, `/api/recordings?courseId=${IDS.course3}`, {
        user: studentUser
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
      assertCase(response.data?.message === 'Class mapping is required for recording lookup.', 'expected class-mapping lookup guard');
    });

    await check('recordings list rejects inaccessible canonical class scopes', async () => {
      const response = await request(server, `/api/recordings?classId=${IDS.class2}`, {
        user: studentUser
      });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
      assertCase(response.data?.success === false, 'expected failure payload');
    });

    await check('recording create stores classId and compatibility courseId', async () => {
      const response = await request(server, '/api/recordings', {
        method: 'POST',
        user: instructorUser,
        headers: {
          'x-test-file-name': 'week3.mp4'
        },
        body: {
          classId: IDS.class1,
          title: 'Week 3 Recording',
          description: 'Canonical create test',
          sessionDate: '2026-03-10T08:00:00.000Z'
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(String(response.data?.item?.classId || '') === IDS.class1, 'expected canonical classId in create response');
      assertCase(String(response.data?.item?.courseId || '') === IDS.course1, 'expected compatibility courseId in create response');
      const stored = recordingRecords.find((item) => item.title === 'Week 3 Recording');
      assertCase(!!stored, 'expected recording to be stored');
      assertCase(String(stored.classId || '') === IDS.class1, 'expected stored recording classId');
      assertCase(String(stored.course || '') === IDS.course1, 'expected stored recording courseId');
    });

    await check('recording create rejects course-only writes without school-class mapping', async () => {
      const response = await request(server, '/api/recordings', {
        method: 'POST',
        user: instructorUser,
        headers: {
          'x-test-file-name': 'legacy-only.mp4'
        },
        body: {
          courseId: IDS.course3,
          title: 'Legacy Only Recording'
        }
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
      assertCase(response.data?.message === 'Class mapping is required before creating a recording.', 'expected class-mapping guard message');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log(`PASS  ${item.label}`);
    } else {
      console.error(`FAIL  ${item.label}`);
      console.error(`      ${item.error}`);
    }
  });

  const failures = cases.filter((item) => item.status === 'FAIL');
  if (failures.length) {
    console.error(`\nCanonical content route smoke failed: ${failures.length} case(s) failed.`);
    process.exit(1);
  }

  const requiredActions = ['create_quiz', 'create_recording'];
  assertCase(requiredActions.every((action) => activityLog.some((item) => item.action === action)), 'Expected canonical content activity log coverage');
  console.log(`\nCanonical content route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:content-canonical-routes] fatal error');
  console.error(error);
  process.exit(1);
});
