const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin: '507f191e810c19729de86001',
  instructor: '507f191e810c19729de86002',
  course1: '507f191e810c19729de86003',
  class1: '507f191e810c19729de86004',
  subject1: '507f191e810c19729de86005',
  year1: '507f191e810c19729de86006',
  schedule1: '507f191e810c19729de86007'
};

const today = (() => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
})();

const todayDayCode = (() => {
  const dayIndex = new Date().getDay();
  if (dayIndex === 6) return 'saturday';
  if (dayIndex === 0) return 'sunday';
  if (dayIndex === 1) return 'monday';
  if (dayIndex === 2) return 'tuesday';
  if (dayIndex === 3) return 'wednesday';
  if (dayIndex === 4) return 'thursday';
  return 'friday';
})();

const schoolClasses = [
  {
    _id: IDS.class1,
    title: 'Class 10 A',
    code: '10A',
    gradeLevel: '10',
    section: 'A',
    academicYearId: IDS.year1,
    legacyCourseId: IDS.course1
  }
];

const courses = [
  {
    _id: IDS.course1,
    title: 'Legacy Class 10 A',
    category: 'Morning',
    schoolClassRef: IDS.class1,
    academicYearRef: IDS.year1,
    kind: 'academic_class'
  }
];

const users = [
  { _id: IDS.admin, role: 'admin', name: 'Admin One' },
  { _id: IDS.instructor, role: 'instructor', name: 'Teacher One' }
];

const subjects = [
  { _id: IDS.subject1, name: 'Math', code: 'MATH-10', grade: '10' }
];

const instructorSubjects = [
  {
    _id: 'map-1',
    instructor: IDS.instructor,
    subject: IDS.subject1,
    classId: IDS.class1,
    course: IDS.course1,
    isPrimary: true
  }
];

const schedules = [
  {
    _id: IDS.schedule1,
    date: today,
    course: IDS.course1,
    subject: 'Math',
    subjectRef: IDS.subject1,
    instructor: IDS.instructor,
    startTime: '08:00',
    endTime: '09:00',
    note: '',
    room: 'A-1',
    shift: 'morning',
    visibility: 'published'
  }
];

const timetableEntries = [
  {
    _id: 'tt-1',
    teacherId: IDS.admin,
    classId: IDS.class1,
    subjectId: IDS.subject1,
    dayCode: todayDayCode,
    status: 'published',
    startTime: '07:00',
    endTime: '07:45'
  }
];

const teacherAssignments = [
  {
    _id: 'assign-1',
    teacherUserId: IDS.instructor,
    classId: IDS.class1,
    subjectId: IDS.subject1,
    status: 'active'
  }
];

const activityLog = [];

const clone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
const asComparable = (value) => (value && typeof value === 'object' && value._id ? String(value._id) : String(value));

function applySort(value, spec) {
  if (!Array.isArray(value) || !spec) return value;
  const entries = Object.entries(spec);
  return [...value].sort((left, right) => {
    for (const [field, direction] of entries) {
      const leftValue = left?.[field] ?? '';
      const rightValue = right?.[field] ?? '';
      if (leftValue === rightValue) continue;
      if (direction >= 0) return String(leftValue).localeCompare(String(rightValue));
      return String(rightValue).localeCompare(String(leftValue));
    }
    return 0;
  });
}

function matchesFilter(item, filter = {}) {
  if (!filter || !Object.keys(filter).length) return true;
  if (Array.isArray(filter.$and)) {
    const { $and, ...rest } = filter;
    return matchesFilter(item, rest) && $and.every((candidate) => matchesFilter(item, candidate));
  }
  if (Array.isArray(filter.$or)) {
    const { $or, ...rest } = filter;
    return matchesFilter(item, rest) && $or.some((candidate) => matchesFilter(item, candidate));
  }

  return Object.entries(filter).every(([key, expected]) => {
    const actual = item?.[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return expected.$in.some((candidate) => asComparable(actual) === String(candidate));
      }
      if ('$ne' in expected) {
        return asComparable(actual) !== String(expected.$ne);
      }
      if ('$gte' in expected || '$lte' in expected) {
        const actualValue = String(actual ?? '');
        if ('$gte' in expected && actualValue < String(expected.$gte)) return false;
        if ('$lte' in expected && actualValue > String(expected.$lte)) return false;
        return true;
      }
      if ('$exists' in expected) {
        const exists = actual !== undefined;
        return expected.$exists ? exists : !exists;
      }
    }
    return asComparable(actual) === String(expected);
  });
}

const hydrateCourse = (value) => clone(courses.find((item) => String(item._id) === String(value?._id || value)) || null);
const hydrateSchoolClass = (value) => clone(schoolClasses.find((item) => String(item._id) === String(value?._id || value)) || null);
const hydrateUser = (value) => clone(users.find((item) => String(item._id) === String(value?._id || value)) || null);
const hydrateSubject = (value) => clone(subjects.find((item) => String(item._id) === String(value?._id || value)) || null);

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.populateFields = [];
    this.sortSpec = null;
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
      value = applySort(value, this.sortSpec);
      const populateOne = (item) => {
        if (!item || typeof item !== 'object') return item;
        const next = clone(item);
        this.populateFields.forEach((field) => {
          if (field === 'course' && next.course) next.course = hydrateCourse(next.course);
          if (field === 'instructor' && next.instructor) next.instructor = hydrateUser(next.instructor);
          if (field === 'subjectRef' && next.subjectRef) next.subjectRef = hydrateSubject(next.subjectRef);
          if (field === 'subject' && next.subject) next.subject = hydrateSubject(next.subject);
          if (field === 'classId' && next.classId) next.classId = hydrateSchoolClass(next.classId);
          if (field === 'subjectId' && next.subjectId) next.subjectId = hydrateSubject(next.subjectId);
          if (field === 'teacherId' && next.teacherId) next.teacherId = hydrateUser(next.teacherId);
        });
        return next;
      };
      if (Array.isArray(value)) return value.map(populateOne);
      return populateOne(value);
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

const ScheduleMock = {
  find(filter = {}) {
    return new MockQuery(() => schedules.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => schedules.find((item) => String(item._id) === String(id)) || null);
  },
  async create(payload = {}) {
    const item = {
      _id: `schedule-${schedules.length + 1}`,
      note: '',
      room: '',
      shift: '',
      visibility: 'draft',
      ...clone(payload)
    };
    schedules.push(clone(item));
    return clone(item);
  },
  async exists(filter = {}) {
    return schedules.some((item) => matchesFilter(item, filter));
  },
  async updateMany() {
    return { modifiedCount: 0 };
  },
  async findByIdAndUpdate(id, payload = {}, options = {}) {
    const index = schedules.findIndex((item) => String(item._id) === String(id));
    if (index < 0) return null;
    schedules[index] = { ...schedules[index], ...clone(payload) };
    return options.new ? clone(schedules[index]) : null;
  },
  async findByIdAndDelete(id) {
    const index = schedules.findIndex((item) => String(item._id) === String(id));
    if (index < 0) return null;
    const [removed] = schedules.splice(index, 1);
    return clone(removed);
  }
};

const ScheduleHolidayMock = {
  findOne() {
    return new MockQuery(() => null);
  },
  find() {
    return new MockQuery(() => []);
  }
};

const TimetableEntryMock = {
  find(filter = {}) {
    return new MockQuery(() => timetableEntries.filter((item) => matchesFilter(item, filter)));
  }
};

const TeacherAssignmentMock = {
  find(filter = {}) {
    return new MockQuery(() => teacherAssignments.filter((item) => matchesFilter(item, filter)));
  }
};

const CourseMock = {
  findById(id) {
    return new MockQuery(() => courses.find((item) => String(item._id) === String(id)) || null);
  },
  findOne(filter = {}) {
    return new MockQuery(() => courses.find((item) => matchesFilter(item, filter)) || null);
  },
  find(filter = {}) {
    return new MockQuery(() => courses.filter((item) => matchesFilter(item, filter)));
  }
};

const SchoolClassMock = {
  findById(id) {
    return new MockQuery(() => schoolClasses.find((item) => String(item._id) === String(id)) || null);
  },
  find(filter = {}) {
    return new MockQuery(() => schoolClasses.filter((item) => matchesFilter(item, filter)));
  }
};

const UserMock = {
  findById(id) {
    return new MockQuery(() => users.find((item) => String(item._id) === String(id)) || null);
  }
};

const SubjectMock = {
  findById(id) {
    return new MockQuery(() => subjects.find((item) => String(item._id) === String(id)) || null);
  },
  findOne(filter = {}) {
    return new MockQuery(() => subjects.find((item) => {
      if (filter?.name?.$regex) return filter.name.$regex.test(item.name);
      return matchesFilter(item, filter);
    }) || null);
  }
};

const InstructorSubjectMock = {
  find(filter = {}) {
    return new MockQuery(() => instructorSubjects.filter((item) => matchesFilter(item, filter)));
  }
};

const UserNotificationMock = {
  async insertMany(items = []) {
    return items.map((item, index) => ({ ...item, _id: `note-${index + 1}`, toObject() { return this; } }));
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
    return (req, res, next) => (roles.includes(String(req.user?.role || '')) ? next() : res.status(403).json({ success: false, message: 'Forbidden by role.' }));
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      return permissions.includes(permission) ? next() : res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

const activityMock = {
  async logActivity(entry) {
    activityLog.push(entry);
  }
};

const courseAccessMock = {
  async findCourseStudentIds() {
    return [];
  },
  async findStudentCourseIds() {
    return [IDS.course1];
  }
};

function loadRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'scheduleRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRouteFile = parentFile.endsWith('/routes/scheduleRoutes.js');
    if (!isRouteFile) return originalLoad.apply(this, arguments);
    if (request === '../models/Schedule') return ScheduleMock;
    if (request === '../models/ScheduleHoliday') return ScheduleHolidayMock;
    if (request === '../models/TimetableEntry') return TimetableEntryMock;
    if (request === '../models/TeacherAssignment') return TeacherAssignmentMock;
    if (request === '../models/Course') return CourseMock;
    if (request === '../models/SchoolClass') return SchoolClassMock;
    if (request === '../models/User') return UserMock;
    if (request === '../models/Subject') return SubjectMock;
    if (request === '../models/InstructorSubject') return InstructorSubjectMock;
    if (request === '../models/UserNotification') return UserNotificationMock;
    if (request === '../middleware/auth') return authMock;
    if (request === '../utils/activity') return activityMock;
    if (request === '../utils/courseAccess') return courseAccessMock;
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
  app.use('/api/schedules', router);
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
  return { status: response.status, data, text };
}

async function run() {
  const server = await createServer();
  const adminUser = { id: IDS.admin, role: 'admin', permissions: ['manage_schedule'] };
  const instructorUser = { id: IDS.instructor, role: 'instructor', permissions: [] };

  try {
    const createRes = await request(server, '/api/schedules', {
      method: 'POST',
      user: adminUser,
      body: {
        date: today,
        classId: IDS.class1,
        instructorId: IDS.instructor,
        subject: 'Math',
        startTime: '10:00',
        endTime: '11:00',
        room: 'B-1',
        visibility: 'draft'
      }
    });
    const todayRes = await request(server, '/api/schedules/today', { user: instructorUser });
    const listRes = await request(server, `/api/schedules?date=${today}&visibility=published`, { user: adminUser });
    const noAuthRes = await request(server, '/api/schedules', { method: 'POST', body: { date: today } });

    assertCase(noAuthRes.status === 401, 'Expected schedule create route to require auth.');
    assertCase(createRes.status === 201, 'Expected schedule create route to accept classId-only payload.');
    assertCase(createRes.data?.item?.classId === IDS.class1, 'Expected created schedule response to include canonical classId.');
    assertCase(createRes.data?.item?.courseId === IDS.course1, 'Expected created schedule response to retain legacy courseId.');
    assertCase(createRes.data?.item?.schoolClass?.title === 'Class 10 A', 'Expected created schedule response to include schoolClass details.');
    assertCase(todayRes.status === 200, 'Expected schedule today route to succeed for instructor.');
    assertCase(Array.isArray(todayRes.data?.items) && todayRes.data.items[0]?.classId === IDS.class1, 'Expected today schedule feed to expose classId.');
    assertCase(todayRes.data?.items?.[0]?.schoolClass?.title === 'Class 10 A', 'Expected today schedule feed to expose schoolClass.');
    assertCase(todayRes.data?.items?.some((item) => item?.source === 'timetable_entry'), 'Expected today schedule feed to include published timetable entries.');
    assertCase(listRes.status === 200 && Array.isArray(listRes.data?.items), 'Expected admin schedule list route to return items.');
    assertCase(listRes.data?.items?.[0]?.classId === IDS.class1, 'Expected admin schedule list route to serialize classId.');
    assertCase(activityLog.some((entry) => entry?.action === 'create_schedule'), 'Expected create_schedule activity to be logged.');

    console.log('check:schedule-routes PASS');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((error) => {
  console.error('check:schedule-routes FAIL');
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
