const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  class1: '507f191e810c19729de860ec',
  class2: '507f191e810c19729de860ed',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb',
  student1: '507f1f77bcf86cd799439011',
  student2: '507f1f77bcf86cd799439012',
  instructor1: '507f1f77bcf86cd799439013',
  admin1: '507f1f77bcf86cd799439014',
  threadDirect: '507f1f77bcf86cd799439101',
  threadGroup1: '507f1f77bcf86cd799439102',
  threadGroup2: '507f1f77bcf86cd799439103',
  session1: '507f1f77bcf86cd799439201',
  session2: '507f1f77bcf86cd799439202'
};

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', schoolClassRef: IDS.class1 },
  { _id: IDS.course2, title: 'Class Two', category: 'Evening', schoolClassRef: IDS.class2 }
];

const schoolClasses = [
  { _id: IDS.class1, title: 'Class One Core', code: '10A', gradeLevel: '10', section: 'A', academicYearId: 'year-1', legacyCourseId: IDS.course1 },
  { _id: IDS.class2, title: 'Class Two Core', code: '10B', gradeLevel: '10', section: 'B', academicYearId: 'year-1', legacyCourseId: IDS.course2 }
];

const users = [
  { _id: IDS.student1, name: 'Student Alpha', role: 'student' },
  { _id: IDS.student2, name: 'Student Beta', role: 'student' },
  { _id: IDS.instructor1, name: 'Teacher One', role: 'instructor' },
  { _id: IDS.admin1, name: 'Admin One', role: 'admin' }
];

const chatThreads = [
  {
    _id: IDS.threadDirect,
    type: 'direct',
    participants: [IDS.student1, IDS.instructor1],
    course: null,
    updatedAt: new Date('2026-03-06T08:00:00.000Z')
  },
  {
    _id: IDS.threadGroup1,
    type: 'group',
    participants: [],
    course: IDS.course1,
    updatedAt: new Date('2026-03-06T08:10:00.000Z')
  },
  {
    _id: IDS.threadGroup2,
    type: 'group',
    participants: [],
    course: IDS.course2,
    updatedAt: new Date('2026-03-06T08:20:00.000Z')
  }
];

const chatMessages = [
  {
    _id: 'msg-1',
    thread: IDS.threadDirect,
    sender: IDS.instructor1,
    text: 'Initial direct message',
    file: '',
    seenBy: [IDS.instructor1],
    createdAt: new Date('2026-03-06T08:05:00.000Z')
  },
  {
    _id: 'msg-2',
    thread: IDS.threadGroup1,
    sender: IDS.instructor1,
    text: 'Initial group message',
    file: '',
    seenBy: [IDS.instructor1],
    createdAt: new Date('2026-03-06T08:15:00.000Z')
  }
];

const sessions = [
  {
    _id: IDS.session1,
    course: IDS.course1,
    title: 'Math Live',
    description: 'Session for class one',
    provider: 'google_meet',
    meetingUrl: 'https://meet.google.com/class-one',
    accessCode: 'A1',
    scheduledAt: new Date('2026-03-07T08:00:00.000Z'),
    status: 'scheduled',
    startedAt: null,
    endedAt: null,
    createdBy: IDS.instructor1,
    createdAt: new Date('2026-03-06T07:00:00.000Z'),
    updatedAt: new Date('2026-03-06T07:00:00.000Z')
  },
  {
    _id: IDS.session2,
    course: IDS.course2,
    title: 'Science Live',
    description: 'Session for class two',
    provider: 'zoom',
    meetingUrl: 'https://zoom.us/class-two',
    accessCode: 'B2',
    scheduledAt: new Date('2026-03-07T10:00:00.000Z'),
    status: 'live',
    startedAt: new Date('2026-03-07T10:00:00.000Z'),
    endedAt: null,
    createdBy: IDS.admin1,
    createdAt: new Date('2026-03-06T07:30:00.000Z'),
    updatedAt: new Date('2026-03-06T07:30:00.000Z')
  }
];

const activityCalls = [];

const instructorRoles = ['instructor', 'teacher', 'professor'];

const accessibleCourseIds = (user = {}) => {
  if (user.role === 'admin') return null;
  if (user.role === 'student') {
    if (String(user.id) === IDS.student1) return [IDS.course1];
    if (String(user.id) === IDS.student2) return [IDS.course2];
  }
  if (instructorRoles.includes(user.role)) {
    if (String(user.id) === IDS.instructor1) return [IDS.course1];
  }
  return [];
};

const canAccessCourse = async (user = {}, courseId = '') => {
  const ids = accessibleCourseIds(user);
  if (ids === null) return true;
  return ids.some((id) => String(id) === String(courseId));
};

const findAccessibleCourses = async (user = {}) => {
  const ids = accessibleCourseIds(user);
  if (ids === null) return courses.map((item) => ({ ...item }));
  return courses.filter((item) => ids.includes(String(item._id))).map((item) => ({ ...item }));
};

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.populateFields = [];
    this.selectedFields = [];
    this.limitValue = 0;
  }

  select(fields) {
    if (typeof fields === 'string' && fields.trim()) {
      this.selectedFields = fields.trim().split(/\s+/).filter(Boolean);
    }
    return this;
  }

  populate(field) {
    if (field) this.populateFields.push(field);
    return this;
  }

  sort() {
    return this;
  }

  limit(value) {
    this.limitValue = Number(value) || 0;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = this.executor();
      const hasSave = value && typeof value === 'object' && typeof value.save === 'function';
      if (Array.isArray(value) && this.limitValue > 0) {
        value = value.slice(0, this.limitValue);
      }
      if (hasSave && !Array.isArray(value)) {
        Object.assign(value, applyPopulate(value, this.populateFields));
        return value;
      }
      return applySelection(applyPopulate(value, this.populateFields), this.selectedFields);
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

const clone = (value) => (
  (() => {
    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value);
      } catch (error) {
        // Fall through to JSON cloning for mock documents with function properties.
      }
    }
    return JSON.parse(JSON.stringify(value));
  })()
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
        return expected.$in.some((candidate) => asComparable(actual) === String(candidate));
      }
      if ('$all' in expected && Array.isArray(actual)) {
        return expected.$all.every((candidate) => actual.some((value) => String(value) === String(candidate)));
      }
    }

    if (Array.isArray(actual)) {
      return actual.some((value) => String(value) === String(expected));
    }

    return asComparable(actual) === String(expected);
  })
);

const applySelection = (value, fields = []) => {
  if (!fields.length) return value;

  const pick = (item) => {
    if (!item || typeof item !== 'object') return item;
    const next = {};
    fields.forEach((field) => {
      if (field in item) next[field] = item[field];
    });
    if ('_id' in item) next._id = item._id;
    return next;
  };

  if (Array.isArray(value)) return value.map(pick);
  return pick(value);
};

const hydrateUser = (value) => users.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateCourse = (value) => courses.find((item) => String(item._id) === String(value?._id || value)) || null;

const applyPopulate = (value, fields = []) => {
  const populateOne = (item) => {
    if (!item || typeof item !== 'object') return item;
    const next = clone(item);

    fields.forEach((field) => {
      if (field === 'participants' && Array.isArray(next.participants)) {
        next.participants = next.participants.map((value) => hydrateUser(value)).filter(Boolean);
      }
      if (field === 'sender' && next.sender) next.sender = hydrateUser(next.sender);
      if (field === 'course' && next.course) next.course = hydrateCourse(next.course);
      if (field === 'createdBy' && next.createdBy) next.createdBy = hydrateUser(next.createdBy);
    });

    return next;
  };

  if (Array.isArray(value)) return value.map(populateOne);
  return populateOne(value);
};

const makeSessionDoc = (record) => {
  const doc = applyPopulate(record, ['course', 'createdBy']);
  doc.save = async function save() {
    const index = sessions.findIndex((item) => String(item._id) === String(this._id));
    sessions[index] = {
      ...sessions[index],
      course: this.course?._id || this.course,
      title: this.title,
      description: this.description,
      provider: this.provider,
      meetingUrl: this.meetingUrl,
      accessCode: this.accessCode,
      scheduledAt: this.scheduledAt,
      status: this.status,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      createdBy: this.createdBy?._id || this.createdBy,
      updatedAt: new Date('2026-03-06T12:00:00.000Z')
    };
    return this;
  };
  return doc;
};

const ChatThreadMock = {
  find(filter = {}) {
    return new MockQuery(() => clone(chatThreads.filter((item) => matchesFilter(item, filter))));
  },
  findOne(filter = {}) {
    return Promise.resolve(clone(chatThreads.find((item) => matchesFilter(item, filter)) || null));
  },
  findOneAndUpdate(filter = {}, update = {}) {
    let existing = chatThreads.find((item) => matchesFilter(item, filter));
    if (!existing) {
      existing = {
        _id: `thread-${chatThreads.length + 1}`,
        type: update.type || filter.type || 'group',
        participants: update.participants || [],
        course: update.course || filter.course || null,
        updatedAt: new Date('2026-03-06T12:00:00.000Z')
      };
      chatThreads.push(existing);
    }
    return Promise.resolve(clone(existing));
  },
  findById(id) {
    return Promise.resolve(clone(chatThreads.find((item) => String(item._id) === String(id)) || null));
  },
  create(payload = {}) {
    const item = {
      _id: `thread-${chatThreads.length + 1}`,
      type: payload.type || 'direct',
      participants: clone(payload.participants || []),
      course: payload.course || null,
      updatedAt: new Date('2026-03-06T12:10:00.000Z')
    };
    chatThreads.push(item);
    return Promise.resolve(clone(item));
  },
  findByIdAndUpdate(id, update = {}) {
    const current = chatThreads.find((item) => String(item._id) === String(id));
    if (current) Object.assign(current, update);
    return Promise.resolve(current ? clone(current) : null);
  }
};

const ChatMessageMock = {
  find(filter = {}) {
    return new MockQuery(() => clone(chatMessages.filter((item) => matchesFilter(item, filter))));
  },
  create(payload = {}) {
    const record = {
      _id: `msg-${chatMessages.length + 1}`,
      thread: payload.thread,
      sender: payload.sender,
      text: payload.text || '',
      file: payload.file || '',
      seenBy: clone(payload.seenBy || []),
      createdAt: new Date('2026-03-06T12:20:00.000Z')
    };
    chatMessages.push(record);
    return Promise.resolve({
      ...clone(record),
      populate: async () => applyPopulate(record, ['sender'])
    });
  }
};

const UserMock = {
  findById(id) {
    return new MockQuery(() => hydrateUser(id));
  },
  find(filter = {}) {
    return new MockQuery(() => users.filter((item) => matchesFilter(item, filter)));
  }
};

const OrderMock = {
  find(filter = {}) {
    return new MockQuery(() => {
      const items = [];
      if (String(filter.course) === IDS.course1) {
        items.push({ _id: 'ord-1', user: IDS.student1, course: IDS.course1, status: 'approved' });
      }
      if (!filter.course || String(filter.course) === IDS.course2) {
        items.push({ _id: 'ord-2', user: IDS.student2, course: IDS.course2, status: 'approved' });
      }
      return items.filter((item) => matchesFilter(item, filter));
    });
  }
};

const ScheduleMock = {
  distinct(field, filter = {}) {
    if (field !== 'instructor') return Promise.resolve([]);
    if (String(filter.course) === IDS.course1) return Promise.resolve([IDS.instructor1]);
    if (String(filter.course) === IDS.course2) return Promise.resolve([]);
    return Promise.resolve([]);
  }
};

const CourseMock = {
  findById(id) {
    return new MockQuery(() => hydrateCourse(id));
  },
  findOne(filter = {}) {
    return new MockQuery(() => courses.find((item) => matchesFilter(item, filter)) || null);
  }
};

const SchoolClassMock = {
  findById(id) {
    return new MockQuery(() => schoolClasses.find((item) => String(item._id) === String(id)) || null);
  },
  findOne(filter = {}) {
    return new MockQuery(() => schoolClasses.find((item) => matchesFilter(item, filter)) || null);
  }
};

const VirtualClassSessionMock = {
  find(filter = {}) {
    return new MockQuery(() => sessions.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => {
      const record = sessions.find((item) => String(item._id) === String(id));
      return record ? makeSessionDoc(record) : null;
    });
  },
  create(payload = {}) {
    const item = {
      _id: `session-${sessions.length + 1}`,
      course: payload.course,
      title: payload.title,
      description: payload.description || '',
      provider: payload.provider || 'manual',
      meetingUrl: payload.meetingUrl,
      accessCode: payload.accessCode || '',
      scheduledAt: payload.scheduledAt,
      status: payload.status || 'scheduled',
      startedAt: payload.startedAt || null,
      endedAt: payload.endedAt || null,
      createdBy: payload.createdBy,
      createdAt: new Date('2026-03-06T12:30:00.000Z'),
      updatedAt: new Date('2026-03-06T12:30:00.000Z')
    };
    sessions.push(item);
    return Promise.resolve(clone(item));
  },
  deleteOne(filter = {}) {
    const index = sessions.findIndex((item) => String(item._id) === String(filter._id));
    if (index >= 0) sessions.splice(index, 1);
    return Promise.resolve({ deletedCount: index >= 0 ? 1 : 0 });
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
      return res.status(400).json({ success: false, message: 'Invalid test user header.' });
    }
  },
  requireRole(roles = []) {
    return (req, res, next) => (
      roles.includes(String(req.user?.role || ''))
        ? next()
        : res.status(403).json({ success: false, message: 'Forbidden by role.' })
    );
  },
  requirePermission(permission) {
    return (req, res, next) => (
      Array.isArray(req.user?.permissions) && req.user.permissions.includes(permission)
        ? next()
        : res.status(403).json({ success: false, message: 'Forbidden by permission.' })
    );
  }
};

const courseAccessMock = {
  instructorRoles,
  canAccessCourse,
  findAccessibleCourses,
  findCourseStudentIds: async (courseId) => {
    if (String(courseId) === IDS.course1) return [IDS.student1];
    if (String(courseId) === IDS.course2) return [IDS.student2];
    return [];
  },
  getAccessibleCourseIds: async (user) => accessibleCourseIds(user)
};

function loadRouter(routeFilename) {
  const routePath = path.join(__dirname, '..', 'routes', routeFilename);
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isTarget = parentFile.endsWith(`/routes/${routeFilename}`);

    if (isTarget && request === '../middleware/auth') return authMock;
    if (isTarget && request === '../utils/courseAccess') return courseAccessMock;
    if (isTarget && request === '../models/ChatThread') return ChatThreadMock;
    if (isTarget && request === '../models/ChatMessage') return ChatMessageMock;
    if (isTarget && request === '../models/User') return UserMock;
    if (isTarget && request === '../models/Order') return OrderMock;
    if (isTarget && request === '../models/Schedule') return ScheduleMock;
    if (isTarget && request === '../models/Course') return CourseMock;
    if (isTarget && request === '../models/SchoolClass') return SchoolClassMock;
    if (isTarget && request === '../models/VirtualClassSession') return VirtualClassSessionMock;
    if (isTarget && request === '../utils/activity') {
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

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const chatRouter = loadRouter('chatRoutes.js');
const virtualRouter = loadRouter('virtualClassRoutes.js');

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/chats', chatRouter);
  app.use('/api/virtual-classes', virtualRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload;

  if (user) headers['x-test-user'] = JSON.stringify(user);
  if (body && !(body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  } else {
    payload = body;
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
    text,
    data
  };
}

async function run() {
  const cases = [];
  const server = await createServer();

  const studentUser = { id: IDS.student1, role: 'student', permissions: [] };
  const instructorUser = { id: IDS.instructor1, role: 'instructor', permissions: ['manage_content'] };
  const adminUser = { id: IDS.admin1, role: 'admin', permissions: ['manage_content'] };

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error.message });
    }
  };

  try {
    await check('route smoke: virtual classes reject unauthenticated access', async () => {
      const response = await request(server, '/api/virtual-classes');
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: student only sees accessible live sessions', async () => {
      const response = await request(server, '/api/virtual-classes', { user: studentUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.items?.length === 1, `expected 1 session, received ${response.data?.items?.length}`);
      assertCase(String(response.data?.items?.[0]?.course?._id) === IDS.course1, 'expected class one session only');
    });

    await check('route smoke: virtual classes accept canonical class filters', async () => {
      const response = await request(server, `/api/virtual-classes?classId=${IDS.class1}`, { user: studentUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.classId === IDS.class1, 'expected canonical classId in response');
      assertCase(response.data?.items?.[0]?.classId === IDS.class1, 'expected canonical classId on item');
    });

    await check('route smoke: legacy virtual class course filter returns deprecation headers', async () => {
      const response = await request(server, `/api/virtual-classes?courseId=${IDS.course1}`, { user: studentUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.headers?.deprecation === 'true', 'expected deprecation header on legacy course filter');
      assertCase(response.headers?.['x-replacement-endpoint'] === `/api/virtual-classes?classId=${IDS.class1}`, 'expected replacement endpoint header');
    });

    await check('route smoke: instructor cannot create a session for an unrelated class', async () => {
      const response = await request(server, '/api/virtual-classes', {
        method: 'POST',
        user: instructorUser,
        body: {
          classId: IDS.class2,
          title: 'Forbidden session',
          meetingUrl: 'https://meet.google.com/forbidden',
          scheduledAt: '2026-03-08T08:00:00.000Z'
        }
      });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: instructor can create a session for an assigned class', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/virtual-classes', {
        method: 'POST',
        user: instructorUser,
        body: {
          classId: IDS.class1,
          title: 'New allowed session',
          provider: 'jitsi',
          meetingUrl: 'https://meet.jit.si/class-one',
          scheduledAt: '2026-03-08T09:00:00.000Z'
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}: ${response.text}`);
      assertCase(response.data?.item?.title === 'New allowed session', 'expected created session payload');
      assertCase(response.data?.item?.classId === IDS.class1, 'expected canonical classId in created session');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'virtual_class_create', 'expected virtual class create activity');
      assertCase(activity?.targetType === 'VirtualClassSession', 'expected virtual class target type');
      assertCase(String(activity?.meta?.classId || '') === IDS.class1, 'expected canonical classId in activity meta');
    });

    await check('route smoke: instructor can start an assigned live session', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, `/api/virtual-classes/${IDS.session1}/start`, {
        method: 'POST',
        user: instructorUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.item?.status === 'live', `expected live status, received ${response.data?.item?.status}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'virtual_class_start', 'expected virtual class start activity');
      assertCase(String(activity?.targetId || '') === IDS.session1, 'expected start activity target id');
    });

    await check('route smoke: admin can end an online session', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, `/api/virtual-classes/${IDS.session1}/end`, {
        method: 'POST',
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.item?.status === 'ended', `expected ended status, received ${response.data?.item?.status}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'virtual_class_end', 'expected virtual class end activity');
      assertCase(String(activity?.targetId || '') === IDS.session1, 'expected end activity target id');
    });

    await check('route smoke: instructor can update an assigned session and activity is logged', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, `/api/virtual-classes/${IDS.session1}`, {
        method: 'PUT',
        user: instructorUser,
        body: {
          title: 'Math Live Updated',
          status: 'scheduled'
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.item?.title === 'Math Live Updated', 'expected updated session title');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'virtual_class_update', 'expected virtual class update activity');
      assertCase(String(activity?.meta?.titleAfter || '') === 'Math Live Updated', 'expected updated title in activity');
    });

    await check('route smoke: admin can delete a session and activity is logged', async () => {
      const createdResponse = await request(server, '/api/virtual-classes', {
        method: 'POST',
        user: adminUser,
        body: {
          classId: IDS.class1,
          title: 'Delete me',
          provider: 'manual',
          meetingUrl: 'https://example.test/delete-me',
          scheduledAt: '2026-03-08T11:00:00.000Z'
        }
      });
      assertCase(createdResponse.status === 201, `expected 201, received ${createdResponse.status}: ${createdResponse.text}`);
      const createdId = String(createdResponse.data?.item?._id || '');
      assertCase(Boolean(createdId), 'expected created session id for delete test');

      const activityCount = activityCalls.length;
      const response = await request(server, `/api/virtual-classes/${createdId}`, {
        method: 'DELETE',
        user: adminUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'virtual_class_delete', 'expected virtual class delete activity');
      assertCase(String(activity?.targetId || '') === createdId, 'expected delete activity target id');
    });

    await check('route smoke: instructor group threads are scoped to assigned classes', async () => {
      const response = await request(server, '/api/chats/threads/group', { user: instructorUser });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.items?.length === 1, `expected 1 group thread, received ${response.data?.items?.length}`);
      assertCase(String(response.data?.items?.[0]?.course?._id) === IDS.course1, 'expected class one group thread only');
    });

    await check('route smoke: student cannot read another class group chat', async () => {
      const response = await request(server, `/api/chats/messages/${IDS.threadGroup2}`, { user: studentUser });
      assertCase(response.status === 403, `expected 403, received ${response.status}`);
    });

    await check('route smoke: direct chat creation logs activity', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, '/api/chats/direct', {
        method: 'POST',
        user: adminUser,
        body: {
          userId: IDS.student2
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Boolean(response.data?.threadId), 'expected thread id');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'chat_direct_thread_create', 'expected direct thread create activity');
      assertCase(String(activity?.targetUser || '') === IDS.student2, 'expected target user in direct chat activity');
    });

    await check('route smoke: direct chat send returns a populated message payload', async () => {
      const activityCount = activityCalls.length;
      const response = await request(server, `/api/chats/messages/${IDS.threadDirect}`, {
        method: 'POST',
        user: studentUser,
        body: (() => {
          const form = new FormData();
          form.append('text', 'Reply from student');
          return form;
        })()
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(response.data?.message?.text === 'Reply from student', 'expected saved direct message text');
      assertCase(response.data?.message?.sender?.name === 'Student Alpha', 'expected populated sender');
      const activity = activityCalls[activityCount];
      assertCase(activity?.action === 'chat_message_send', 'expected chat_message_send activity');
      assertCase(String(activity?.meta?.threadId || '') === IDS.threadDirect, 'expected thread id in message activity');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log(`PASS ${item.label}`);
    } else {
      console.error(`FAIL ${item.label}: ${item.error}`);
    }
  });

  const failed = cases.filter((item) => item.status === 'FAIL');
  if (failed.length) {
    console.error(`\n${failed.length} virtual/chat route checks failed.`);
    process.exit(1);
  }

  console.log(`\n${cases.length} virtual/chat route checks passed.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
