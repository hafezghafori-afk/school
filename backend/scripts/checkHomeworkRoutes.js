const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin1: '507f1f77bcf86cd799439001',
  instructor1: '507f1f77bcf86cd799439002',
  student1: '507f1f77bcf86cd799439011',
  student2: '507f1f77bcf86cd799439012',
  class1: '507f191e810c19729de86101',
  class2: '507f191e810c19729de86102',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb'
};

const users = [
  { _id: IDS.admin1, name: 'Admin One', role: 'admin' },
  { _id: IDS.instructor1, name: 'Instructor One', role: 'instructor' },
  { _id: IDS.student1, name: 'Student One', email: 'student1@example.com', grade: '10', role: 'student' },
  { _id: IDS.student2, name: 'Student Two', email: 'student2@example.com', grade: '10', role: 'student' }
];

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', schoolClassRef: IDS.class1 },
  { _id: IDS.course2, title: 'Class Two', category: 'Evening', schoolClassRef: IDS.class2 }
];

const schoolClasses = [
  { _id: IDS.class1, title: 'Class One Core', code: '10A', gradeLevel: '10', section: 'A', legacyCourseId: IDS.course1 },
  { _id: IDS.class2, title: 'Class Two Core', code: '10B', gradeLevel: '10', section: 'B', legacyCourseId: IDS.course2 }
];

const memberships = [
  { _id: 'mem-1', student: IDS.student1, classId: IDS.class1, course: IDS.course1, status: 'active', isCurrent: true },
  { _id: 'mem-2', student: IDS.student2, classId: IDS.class1, course: IDS.course1, status: 'active', isCurrent: true }
];
const activityCalls = [];
const notificationCalls = [];

const homeworkRecords = [
  {
    _id: 'hw-1',
    course: IDS.course1,
    classId: IDS.class1,
    title: 'Homework One',
    description: 'Solve the first worksheet.',
    dueDate: new Date('2026-03-20T00:00:00.000Z'),
    maxScore: 20,
    attachment: 'uploads/homeworks/hw-1.pdf',
    createdBy: IDS.instructor1,
    createdAt: new Date('2026-03-10T08:00:00.000Z'),
    updatedAt: new Date('2026-03-10T08:00:00.000Z')
  }
];

const submissionRecords = [];

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const asComparable = (value) => {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const matchesFilter = (item, filter = {}) => (
  Object.entries(filter).every(([key, expected]) => {
    const actual = item[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return expected.$in.some((candidate) => asComparable(candidate) === asComparable(actual));
      }
      if ('$ne' in expected) {
        return asComparable(actual) !== asComparable(expected.$ne);
      }
    }
    return asComparable(actual) === asComparable(expected);
  })
);

const hydrateCourse = (value) => courses.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateSchoolClass = (value) => schoolClasses.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateUser = (value) => users.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateHomework = (value) => homeworkRecords.find((item) => String(item._id) === String(value?._id || value)) || null;

const applyPopulateInstruction = (item, instruction) => {
  if (!item || !instruction) return item;
  const next = clone(item);

  if (typeof instruction === 'string') {
    if (instruction === 'course' && next.course) next.course = hydrateCourse(next.course);
    if (instruction === 'classId' && next.classId) next.classId = hydrateSchoolClass(next.classId);
    if (instruction === 'student' && next.student) next.student = hydrateUser(next.student);
    if (instruction === 'homework' && next.homework) next.homework = hydrateHomework(next.homework);
    return next;
  }

  if (instruction.path === 'homework' && next.homework) {
    let homework = hydrateHomework(next.homework);
    if (homework && Array.isArray(instruction.populate)) {
      instruction.populate.forEach((nestedInstruction) => {
        homework = applyPopulateInstruction(homework, nestedInstruction);
      });
    }
    next.homework = homework;
  }

  return next;
};

const applyPopulate = (value, instructions = []) => {
  const populateOne = (item) => instructions.reduce((current, instruction) => (
    applyPopulateInstruction(current, instruction)
  ), clone(item));

  if (Array.isArray(value)) return value.map(populateOne);
  if (value && typeof value === 'object') return populateOne(value);
  return value;
};

class MockQuery {
  constructor(executor, options = {}) {
    this.executor = executor;
    this.populateInstructions = [];
    this.sortSpec = options.sortSpec || null;
    this.firstResult = !!options.firstResult;
  }

  select() {
    return this;
  }

  populate(instruction) {
    if (instruction) this.populateInstructions.push(instruction);
    return this;
  }

  sort(spec) {
    this.sortSpec = spec || null;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = clone(this.executor());
      if (Array.isArray(value) && this.sortSpec) {
        const [[field, direction]] = Object.entries(this.sortSpec);
        value.sort((left, right) => {
          const leftValue = left?.[field] instanceof Date ? left[field].getTime() : left?.[field];
          const rightValue = right?.[field] instanceof Date ? right[field].getTime() : right?.[field];
          if (leftValue === rightValue) return 0;
          return direction >= 0
            ? (leftValue > rightValue ? 1 : -1)
            : (leftValue < rightValue ? 1 : -1);
        });
      }
      if (Array.isArray(value) && this.firstResult) {
        return applyPopulate(value[0] || null, this.populateInstructions);
      }
      return applyPopulate(value, this.populateInstructions);
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

const HomeworkMock = {
  find(filter = {}) {
    return new MockQuery(() => homeworkRecords.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => homeworkRecords.filter((item) => String(item._id) === String(id)), { firstResult: true });
  },
  findByIdAndUpdate(id, update = {}) {
    return new MockQuery(() => {
      const item = homeworkRecords.find((row) => String(row._id) === String(id));
      if (!item) return null;
      Object.assign(item, update, { updatedAt: new Date('2026-03-12T09:00:00.000Z') });
      return item;
    }, { firstResult: true });
  },
  async findByIdAndDelete(id) {
    const index = homeworkRecords.findIndex((item) => String(item._id) === String(id));
    if (index < 0) return null;
    const [removed] = homeworkRecords.splice(index, 1);
    return clone(removed);
  },
  async create(payload = {}) {
    const item = {
      _id: `hw-${homeworkRecords.length + 1}`,
      course: payload.course,
      classId: payload.classId,
      lesson: payload.lesson || null,
      title: payload.title || '',
      description: payload.description || '',
      dueDate: payload.dueDate || null,
      maxScore: payload.maxScore || 100,
      attachment: payload.attachment || '',
      createdBy: payload.createdBy || null,
      createdAt: new Date('2026-03-12T08:00:00.000Z'),
      updatedAt: new Date('2026-03-12T08:00:00.000Z')
    };
    homeworkRecords.unshift(item);
    return clone(item);
  }
};

const HomeworkSubmissionMock = {
  find(filter = {}) {
    return new MockQuery(() => submissionRecords.filter((item) => matchesFilter(item, filter)));
  },
  findOne(filter = {}) {
    return new MockQuery(() => submissionRecords.filter((item) => matchesFilter(item, filter)), { firstResult: true });
  },
  findById(id) {
    return new MockQuery(() => submissionRecords.filter((item) => String(item._id) === String(id)), { firstResult: true });
  },
  findOneAndUpdate(filter = {}, update = {}) {
    return new MockQuery(() => {
      let item = submissionRecords.find((row) => matchesFilter(row, filter));
      if (!item) {
        item = {
          _id: `sub-${submissionRecords.length + 1}`,
          homework: filter.homework,
          student: filter.student
        };
        submissionRecords.push(item);
      }

      Object.assign(item, update, {
        submittedAt: update.submittedAt || new Date('2026-03-12T10:00:00.000Z'),
        updatedAt: new Date('2026-03-12T10:00:00.000Z')
      });
      return item;
    }, { firstResult: true });
  },
  async deleteMany(filter = {}) {
    let deletedCount = 0;
    for (let index = submissionRecords.length - 1; index >= 0; index -= 1) {
      if (matchesFilter(submissionRecords[index], filter)) {
        submissionRecords.splice(index, 1);
        deletedCount += 1;
      }
    }
    return { deletedCount };
  },
  async findByIdAndUpdate(id, update = {}) {
    const item = submissionRecords.find((row) => String(row._id) === String(id));
    if (!item) return null;
    Object.assign(item, update, { updatedAt: new Date('2026-03-12T11:00:00.000Z') });
    return clone(item);
  }
};

const homeworkRosterMock = {
  async loadClassRoster(classId) {
    return memberships
      .filter((item) => String(item.classId) === String(classId) && item.status === 'active' && item.isCurrent === true)
      .map((item) => {
        const user = hydrateUser(item.student);
        return { userId: String(user._id), name: user.name, email: user.email || '', admissionNo: `AS-${String(user._id).slice(-2)}` };
      });
  },
  async resolveAdmissionNumbers() {
    return new Map();
  },
  async notifyStudents(userIds = [], payload = {}) {
    const ids = [...new Set(userIds.map((id) => String(id?._id || id)).filter(Boolean))];
    if (!ids.length) return 0;
    notificationCalls.push({ userIds: ids, ...payload });
    return ids.length;
  }
};

const courseAccessMock = {
  async hasStudentCourseAccess(studentId, courseId) {
    return memberships.some((item) => (
      String(item.student) === String(studentId)
      && String(item.course) === String(courseId)
      && item.status === 'active'
      && item.isCurrent === true
    ));
  }
};

const studentMembershipLookupMock = {
  async findActiveMembership({ studentUserId = '', classId = '', courseId = '' } = {}) {
    return memberships.find((item) => (
      String(item.student) === String(studentUserId)
      && (!classId || String(item.classId) === String(classId))
      && (!courseId || String(item.course) === String(courseId))
      && item.status === 'active'
      && item.isCurrent === true
    )) || null;
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
      code: value.code || '',
      gradeLevel: value.gradeLevel || '',
      section: value.section || ''
    };
  },
  async resolveClassCourseReference({ classId = '', courseId = '' } = {}) {
    const normalizedClassId = String(classId || '').trim();
    const normalizedCourseId = String(courseId || '').trim();
    let schoolClass = null;
    let course = null;

    if (normalizedClassId) {
      schoolClass = hydrateSchoolClass(normalizedClassId);
      if (!schoolClass) return { error: 'Class is invalid.' };
      if (schoolClass.legacyCourseId) {
        course = hydrateCourse(schoolClass.legacyCourseId);
      }
    }

    if (normalizedCourseId) {
      const linkedCourse = hydrateCourse(normalizedCourseId);
      if (!linkedCourse) return { error: 'Course is invalid.' };
      if (course && String(course._id) !== String(linkedCourse._id)) {
        return { error: 'classId and courseId do not match.' };
      }
      course = course || linkedCourse;
      if (!schoolClass && linkedCourse.schoolClassRef) {
        schoolClass = hydrateSchoolClass(linkedCourse.schoolClassRef);
      }
    }

    return {
      schoolClass,
      course,
      classId: schoolClass?._id ? String(schoolClass._id) : '',
      courseId: course?._id ? String(course._id) : ''
    };
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

function multerMock() {
  return {
    single() {
      return (req, res, next) => {
        if (!req.get('x-test-no-file')) {
          const fileName = String(req.get('x-test-file-name') || 'attachment.pdf');
          req.file = { filename: fileName, originalname: fileName };
        }
        next();
      };
    }
  };
}
multerMock.diskStorage = () => ({});

function loadHomeworkRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'homeworkRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isHomeworkRoute = parentFile.endsWith('/routes/homeworkRoutes.js');

    if (isHomeworkRoute && request === '../models/Homework') return HomeworkMock;
    if (isHomeworkRoute && request === '../models/HomeworkSubmission') return HomeworkSubmissionMock;
    if (isHomeworkRoute && request === '../utils/courseAccess') return courseAccessMock;
    if (isHomeworkRoute && request === '../utils/studentMembershipLookup') return studentMembershipLookupMock;
    if (isHomeworkRoute && request === '../utils/classScope') return classScopeMock;
    if (isHomeworkRoute && request === '../utils/homeworkRoster') return homeworkRosterMock;
    if (isHomeworkRoute && request === '../utils/activity') {
      return {
        logActivity: async (payload = {}) => {
          const { req, ...rest } = payload || {};
          activityCalls.push({
            ...clone(rest),
            actor: req?.user?.id || null,
            route: req?.originalUrl || req?.url || ''
          });
        }
      };
    }
    if (isHomeworkRoute && request === '../middleware/auth') return authMock;
    if (isHomeworkRoute && request === 'multer') return multerMock;

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const homeworkRouter = loadHomeworkRouter();

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/homeworks', homeworkRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body, headers = {} } = {}) {
  const address = server.address();
  const requestHeaders = { ...headers };
  let payload = body;

  if (user) requestHeaders['x-test-user'] = JSON.stringify(user);
  if (body && !(body instanceof FormData) && typeof body === 'object') {
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
  let createdHomeworkId = '';
  const server = await createServer();

  const adminUser = {
    id: IDS.admin1,
    role: 'admin',
    permissions: ['manage_content']
  };
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
    await check('route smoke: class homework rejects unauthenticated access', async () => {
      const response = await request(server, `/api/homeworks/class/${IDS.class1}`);
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: class homework exposes canonical payload', async () => {
      const response = await request(server, `/api/homeworks/class/${IDS.class1}`, {
        user: instructorUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.classId === IDS.class1, 'expected canonical classId');
      assertCase(response.data?.courseId === IDS.course1, 'expected compatibility courseId');
      assertCase(response.data?.schoolClass?.title === 'Class One Core', 'expected schoolClass payload');
      assertCase(response.data?.items?.[0]?.classId === IDS.class1, 'expected classId on homework item');
    });

    await check('route smoke: legacy course homework route resolves canonical payload and deprecation headers', async () => {
      const response = await request(server, `/api/homeworks/course/${IDS.course1}`, {
        user: instructorUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers['deprecation'] === 'true', 'expected deprecation header on legacy homework route');
      assertCase(response.headers['x-replacement-endpoint'] === `/api/homeworks/class/${IDS.class1}`, 'expected homework replacement endpoint header');
      assertCase(response.data?.classId === IDS.class1, 'expected canonical classId on legacy homework response');
      assertCase(response.data?.items?.[0]?.classId === IDS.class1, 'expected classId on legacy homework item');
    });

    await check('route smoke: student access is denied for unrelated class scope', async () => {
      const response = await request(server, `/api/homeworks/class/${IDS.class2}`, {
        user: studentUser
      });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: create homework accepts canonical classId input', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/homeworks/create', {
        method: 'POST',
        user: adminUser,
        body: {
          classId: IDS.class1,
          title: 'Canonical Homework',
          description: 'Read chapter two.',
          dueDate: '2026-03-22',
          maxScore: '25'
        },
        headers: { 'x-test-file-name': 'canonical-homework.pdf' }
      });

      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      createdHomeworkId = String(response.data?.homework?._id || '');
      assertCase(response.data?.homework?.classId === IDS.class1, 'expected stored classId');
      assertCase(response.data?.homework?.courseId === IDS.course1, 'expected stored courseId');
      assertCase(response.data?.homework?.attachment === 'uploads/homeworks/canonical-homework.pdf', 'expected attachment path');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'create_homework', 'expected create_homework activity');
      assertCase(String(activity?.targetId || '') === createdHomeworkId, 'expected created homework target id');
      assertCase(String(activity?.meta?.classId || '') === IDS.class1, 'expected canonical classId in activity meta');
    });

    await check('route smoke: update homework logs canonical scope', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/homeworks/hw-1', {
        method: 'PUT',
        user: instructorUser,
        body: {
          classId: IDS.class1,
          title: 'Homework One Updated',
          maxScore: 30
        },
        headers: {
          'x-test-no-file': 'true'
        }
      });

      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.homework?.title === 'Homework One Updated', 'expected updated title');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'update_homework', 'expected update_homework activity');
      assertCase(String(activity?.targetId || '') === 'hw-1', 'expected updated homework target id');
      assertCase(String(activity?.meta?.classId || '') === IDS.class1, 'expected canonical classId in update activity');
    });

    await check('route smoke: student submit stores canonical class reference and logs activity', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/homeworks/hw-1/submit', {
        method: 'POST',
        user: studentUser,
        body: { text: 'My answers are attached.' },
        headers: { 'x-test-file-name': 'student-answer.pdf' }
      });

      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.submission?.classId === IDS.class1, 'expected canonical classId in submission');
      assertCase(response.data?.submission?.courseId === IDS.course1, 'expected compatibility courseId in submission');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'submit_homework', 'expected submit_homework activity');
      assertCase(String(activity?.meta?.studentId || '') === IDS.student1, 'expected student id in submit activity');
    });

    await check('route smoke: my submissions accepts class scope filter', async () => {
      const response = await request(server, `/api/homeworks/my/submissions?classId=${IDS.class1}`, {
        user: studentUser
      });

      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.classId === IDS.class1, 'expected class scope in response');
      assertCase(Array.isArray(response.data?.items) && response.data.items.length === 1, 'expected one submission');
      assertCase(response.data?.items?.[0]?.homework?.classId === IDS.class1, 'expected classId on nested homework');
    });

    await check('route smoke: grading a submission updates score and logs activity', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/homeworks/hw-1/grade', {
        method: 'POST',
        user: instructorUser,
        body: {
          submissionId: 'sub-1',
          score: 19,
          feedback: 'Reviewed'
        }
      });

      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.submission?.score === 19, 'expected updated score');
      assertCase(response.data?.submission?.feedback === 'Reviewed', 'expected updated feedback');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'grade_homework_submission', 'expected homework grading activity');
      assertCase(Number(activity?.meta?.score || 0) === 19, 'expected graded score in activity meta');
    });

    await check('redesign: submission past the due day is flagged late, not refused', async () => {
      const response = await request(server, '/api/homeworks/hw-1/submissions', { user: instructorUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      const item = response.data?.items?.[0];
      assertCase(item?.isLate === true, 'expected isLate on a submission after 2026-03-20');
      assertCase(Number(item?.lateDays) > 0, 'expected a positive lateDays');
      assertCase(item?.status === 'graded', 'expected graded status after grading');
    });

    await check('redesign: create rejects a max score outside 1..1000 and keeps a teacher-chosen one', async () => {
      for (const bad of ['0', '5000', 'abc']) {
        const response = await request(server, '/api/homeworks/create', {
          method: 'POST',
          user: adminUser,
          body: { classId: IDS.class1, title: 'Bad scale', maxScore: bad },
          headers: { 'x-test-no-file': 'true' }
        });
        assertCase(response.status === 400, `expected 400 for maxScore ${bad}, received ${response.status}`);
      }
      const response = await request(server, '/api/homeworks/create', {
        method: 'POST',
        user: adminUser,
        body: { classId: IDS.class1, title: 'Out of ten', maxScore: '10', notifyStudents: 'true' },
        headers: { 'x-test-no-file': 'true' }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(response.data?.homework?.maxScore === 10, 'expected maxScore 10 to be kept');
      assertCase(response.data?.notifiedCount === 2, 'expected both class students to be notified');
    });

    await check('redesign: grade above the max score is refused', async () => {
      const response = await request(server, '/api/homeworks/hw-1/grade', {
        method: 'POST',
        user: instructorUser,
        body: { submissionId: 'sub-1', score: 31 }
      });
      assertCase(response.status === 400, `expected 400, received ${response.status}`);
    });

    await check('redesign: max score cannot drop under a score already given', async () => {
      const response = await request(server, '/api/homeworks/hw-1', {
        method: 'PUT',
        user: instructorUser,
        body: { maxScore: 10 },
        headers: { 'x-test-no-file': 'true' }
      });
      assertCase(response.status === 409, `expected 409, received ${response.status}`);
    });

    await check('redesign: a handed-in answer cannot be resubmitted without a revision request', async () => {
      const response = await request(server, '/api/homeworks/hw-1/submit', {
        method: 'POST',
        user: studentUser,
        body: { text: 'Second try' },
        headers: { 'x-test-file-name': 'second.pdf' }
      });
      assertCase(response.status === 409, `expected 409, received ${response.status}`);
    });

    await check('redesign: class list with stats counts submissions and missing students', async () => {
      const response = await request(server, `/api/homeworks/class/${IDS.class1}?withStats=1`, { user: instructorUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.rosterCount === 2, 'expected roster of 2');
      const stats = response.data?.items?.find((item) => item._id === 'hw-1')?.stats;
      assertCase(stats?.submittedCount === 1, 'expected 1 submission');
      assertCase(stats?.missingCount === 1, 'expected 1 missing');
      assertCase(stats?.gradedCount === 1 && stats?.lateCount === 1, 'expected graded + late counts');
      const plain = await request(server, `/api/homeworks/class/${IDS.class1}?withStats=1`, { user: studentUser });
      assertCase(plain.data?.items?.[0]?.stats === undefined, 'students must not receive stats');
    });

    await check('redesign: roster lists every class student with a state', async () => {
      const response = await request(server, '/api/homeworks/hw-1/roster', { user: instructorUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      const rows = response.data?.rows || [];
      assertCase(rows.length === 2, 'expected 2 roster rows');
      const missing = rows.find((row) => row.student._id === IDS.student2);
      assertCase(missing?.state === 'missing_overdue', `expected missing_overdue, got ${missing?.state}`);
      assertCase(missing?.student?.admissionNo === 'AS-12', 'expected admission number on roster row');
      assertCase(rows.find((row) => row.student._id === IDS.student1)?.state === 'graded', 'expected graded row');
    });

    await check('redesign: request revision reopens the answer and notifies the student', async () => {
      const before = notificationCalls.length;
      const empty = await request(server, '/api/homeworks/hw-1/request-revision', {
        method: 'POST', user: instructorUser, body: { submissionId: 'sub-1', note: '' }
      });
      assertCase(empty.status === 400, 'expected a note to be required');
      const response = await request(server, '/api/homeworks/hw-1/request-revision', {
        method: 'POST', user: instructorUser, body: { submissionId: 'sub-1', note: 'Show your working.' }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.submission?.status === 'revision_requested', 'expected revision_requested');
      assertCase(response.data?.submission?.score === null, 'expected score cleared');
      assertCase(notificationCalls.length === before + 1, 'expected one notification');
      const resubmit = await request(server, '/api/homeworks/hw-1/submit', {
        method: 'POST', user: studentUser, body: { text: 'Fixed' }, headers: { 'x-test-file-name': 'fixed.pdf' }
      });
      assertCase(resubmit.status === 200, `expected resubmit 200, received ${resubmit.status}`);
      assertCase(resubmit.data?.submission?.status === 'submitted', 'expected submitted after resubmission');
      assertCase(resubmit.data?.submission?.isLate === true, 'expected resubmission to be flagged late');
    });

    await check('redesign: grading rejects a submission from another homework', async () => {
      const response = await request(server, '/api/homeworks/hw-unknown/grade', {
        method: 'POST', user: instructorUser, body: { submissionId: 'sub-1', score: 5 }
      });
      assertCase(response.status === 404, `expected 404, received ${response.status}`);
    });

    await check('redesign: notify missing students reaches only non-submitters', async () => {
      const response = await request(server, '/api/homeworks/hw-1/notify', {
        method: 'POST', user: instructorUser, body: { audience: 'missing' }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.notifiedCount === 1, 'expected 1 recipient');
      const last = notificationCalls[notificationCalls.length - 1];
      assertCase(last.userIds.length === 1 && last.userIds[0] === IDS.student2, 'expected student2 only');
    });

    await check('redesign: copy homework to another class', async () => {
      const same = await request(server, '/api/homeworks/hw-1/copy', {
        method: 'POST', user: instructorUser, body: { classIds: [IDS.class1] }
      });
      assertCase(same.status === 400, 'expected copying to the same class to be refused');
      const response = await request(server, '/api/homeworks/hw-1/copy', {
        method: 'POST', user: instructorUser, body: { classIds: [IDS.class2], dueDate: '2026-11-01' }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(response.data?.created?.[0]?.classId === IDS.class2, 'expected a copy in class2');
      const copy = homeworkRecords.find((item) => item._id === response.data.created[0].homeworkId);
      assertCase(String(copy?.course) === IDS.course2, 'expected class2 compat course on the copy');
    });

    await check('redesign: export grades as xlsx', async () => {
      const response = await request(server, '/api/homeworks/hw-1/export.xlsx', { user: instructorUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['content-type'] || '').includes('spreadsheetml'), 'expected xlsx content type');
    });

    await check('route smoke: delete homework removes submissions and logs activity', async () => {
      assertCase(Boolean(createdHomeworkId), 'expected created homework id before delete test');
      const activityCount = activityCalls.length;
      const response = await request(server, `/api/homeworks/${createdHomeworkId}`, {
        method: 'DELETE',
        user: adminUser
      });

      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'delete_homework', 'expected delete_homework activity');
      assertCase(String(activity?.targetId || '') === createdHomeworkId, 'expected delete target id');
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
    console.error(`\nHomework route smoke failed: ${failures.length} case(s) failed.`);
    process.exit(1);
  }

  console.log(`\nHomework route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:homework-routes] fatal error');
  console.error(error);
  process.exit(1);
});
