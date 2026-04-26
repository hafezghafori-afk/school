const path = require('path');
const Module = require('module');
const express = require('express');

const IDS = {
  admin1: '507f1f77bcf86cd799439001',
  instructor1: '507f1f77bcf86cd799439002',
  student1: '507f1f77bcf86cd799439011',
  student2: '507f1f77bcf86cd799439012',
  student3: '507f1f77bcf86cd799439013',
  course1: '507f191e810c19729de860ea',
  course2: '507f191e810c19729de860eb',
  year1: '507f191e810c19729de860ff',
  class1: '507f191e810c19729de86101',
  class2: '507f191e810c19729de86102'
};

const users = [
  { _id: IDS.admin1, name: 'Admin One', email: 'admin@example.com', role: 'admin', grade: '' },
  { _id: IDS.instructor1, name: 'Instructor One', email: 'instructor@example.com', role: 'instructor', subject: 'math' },
  { _id: IDS.student1, name: 'Student Alpha', email: 'alpha@example.com', role: 'student', grade: '10' },
  { _id: IDS.student2, name: 'Student Beta', email: 'beta@example.com', role: 'student', grade: '11' },
  { _id: IDS.student3, name: 'Student Gamma', email: 'gamma@example.com', role: 'student', grade: '12' }
];

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', academicYearRef: IDS.year1, schoolClassRef: IDS.class1 },
  { _id: IDS.course2, title: 'Class Two', category: 'Evening', academicYearRef: IDS.year1, schoolClassRef: IDS.class2 }
];

const schoolClasses = [
  {
    _id: IDS.class1,
    title: 'Class One Core',
    code: 'C1',
    gradeLevel: '10',
    section: 'A',
    academicYearId: { _id: IDS.year1, title: '1406', isActive: true },
    legacyCourseId: { _id: IDS.course1, title: 'Class One', category: 'Morning', academicYearRef: IDS.year1 },
    homeroomTeacherUserId: null,
    shift: 'morning',
    room: 'A-1',
    status: 'active',
    note: '',
    createdAt: new Date('2026-03-02T08:00:00.000Z')
  },
  {
    _id: IDS.class2,
    title: 'Class Two Core',
    code: 'C2',
    gradeLevel: '11',
    section: 'B',
    academicYearId: { _id: IDS.year1, title: '1406', isActive: true },
    legacyCourseId: { _id: IDS.course2, title: 'Class Two', category: 'Evening', academicYearRef: IDS.year1 },
    homeroomTeacherUserId: null,
    shift: 'evening',
    room: 'B-1',
    status: 'active',
    note: '',
    createdAt: new Date('2026-03-03T08:00:00.000Z')
  }
];

const academicYears = [
  { _id: IDS.year1, title: '1406', isActive: true }
];

const subjects = [
  { _id: '507f191e810c19729de86211', name: 'Mathematics', code: 'MATH-10', grade: '10' },
  { _id: '507f191e810c19729de86212', name: 'Physics', code: 'PHY-11', grade: '11' }
];

const instructorSubjectRecords = [
  {
    _id: 'map-1',
    instructor: IDS.instructor1,
    subject: '507f191e810c19729de86211',
    academicYear: IDS.year1,
    classId: IDS.class1,
    course: IDS.course1,
    note: 'primary mapping',
    isPrimary: true,
    createdAt: new Date('2026-03-01T08:30:00.000Z'),
    updatedAt: new Date('2026-03-01T08:30:00.000Z')
  }
];

const schedules = [
  { _id: 'schedule-1', course: IDS.course1, instructor: IDS.instructor1 },
  { _id: 'schedule-2', course: IDS.course2, instructor: IDS.instructor1 }
];

const now = () => new Date('2026-03-11T09:00:00.000Z');

const membershipRecords = [
  {
    _id: 'mem-1',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    academicYear: IDS.year1,
    academicYearId: IDS.year1,
    status: 'active',
    source: 'admin',
    joinedAt: new Date('2026-03-01T08:00:00.000Z'),
    leftAt: null,
    note: 'manual placement',
    rejectedReason: '',
    isCurrent: true,
    legacyOrder: null,
    createdBy: IDS.admin1,
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z')
  },
  {
    _id: 'mem-2',
    student: IDS.student2,
    course: IDS.course2,
    classId: IDS.class2,
    academicYear: IDS.year1,
    academicYearId: IDS.year1,
    status: 'rejected',
    source: 'admin',
    joinedAt: new Date('2026-03-02T08:00:00.000Z'),
    leftAt: new Date('2026-03-02T09:00:00.000Z'),
    note: 'capacity full',
    rejectedReason: 'capacity_full',
    isCurrent: false,
    legacyOrder: null,
    createdBy: IDS.admin1,
    createdAt: new Date('2026-03-02T08:00:00.000Z'),
    updatedAt: new Date('2026-03-02T09:00:00.000Z')
  }
];

const joinRequestRecords = [
  {
    _id: 'join-1',
    student: IDS.student2,
    course: IDS.course1,
    academicYear: IDS.year1,
    status: 'pending',
    source: 'student',
    note: 'awaiting review',
    rejectedReason: '',
    createdBy: IDS.student2,
    reviewedBy: null,
    reviewedAt: null,
    legacyOrder: null,
    createdAt: new Date('2026-03-03T08:00:00.000Z'),
    updatedAt: new Date('2026-03-03T08:00:00.000Z')
  }
];

const activityLog = [];
const notifications = [];
let nextMembershipId = 3;
let nextJoinRequestId = 2;
let nextNotificationId = 1;
let nextInstructorSubjectId = 2;

class MockQuery {
  constructor(executor, options = {}) {
    this.executor = executor;
    this.populateFields = [];
    this.sortSpec = null;
    this.skipCount = 0;
    this.limitCount = null;
    this.asDocument = !!options.asDocument;
    this.docFactory = options.docFactory || null;
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

  skip(count) {
    const parsed = Number(count);
    this.skipCount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    return this;
  }

  limit(count) {
    const parsed = Number(count);
    this.limitCount = Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = this.executor();
      if (this.asDocument && !Array.isArray(value)) {
        if (!value) return null;
        const doc = this.docFactory ? this.docFactory(value) : makeMembershipDoc(value);
        this.populateFields.forEach((field) => {
          if (field === 'student' && doc.student) doc.student = hydrateUser(doc.student);
          if (field === 'instructor' && doc.instructor) doc.instructor = hydrateUser(doc.instructor);
          if (field === 'subject' && doc.subject) doc.subject = hydrateSubject(doc.subject);
          if (field === 'academicYear' && doc.academicYear) doc.academicYear = hydrateAcademicYear(doc.academicYear);
          if (field === 'classId' && doc.classId) doc.classId = hydrateSchoolClass(doc.classId);
          if (field === 'course' && doc.course) doc.course = hydrateCourse(doc.course);
        });
        return doc;
      }
      value = clone(value);
      value = applySort(value, this.sortSpec);
      value = applyWindow(value, this.skipCount, this.limitCount);
      value = applyPopulate(value, this.populateFields);
      return value;
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

const applyWindow = (value, skipCount = 0, limitCount = null) => {
  if (!Array.isArray(value)) return value;
  const sliced = skipCount ? value.slice(skipCount) : [...value];
  if (limitCount === null) return sliced;
  return sliced.slice(0, limitCount);
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

    if (expected instanceof RegExp) {
      return matchesValue(actual, expected);
    }

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
const hydrateSubject = (value) => subjects.find((item) => String(item._id) === String(value?._id || value)) || null;
const hydrateAcademicYear = (value) => academicYears.find((item) => String(item._id) === String(value?._id || value)) || null;

const applyPopulate = (value, fields = []) => {
  const populateOne = (item) => {
    if (!item || typeof item !== 'object') return item;
    const next = clone(item);
    fields.forEach((field) => {
      if (field === 'student' && next.student) next.student = hydrateUser(next.student);
      if (field === 'instructor' && next.instructor) next.instructor = hydrateUser(next.instructor);
      if (field === 'course' && next.course) next.course = hydrateCourse(next.course);
      if (field === 'classId' && next.classId) next.classId = hydrateSchoolClass(next.classId);
      if (field === 'subject' && next.subject) next.subject = hydrateSubject(next.subject);
      if (field === 'academicYear' && next.academicYear) next.academicYear = hydrateAcademicYear(next.academicYear);
      if (field === 'legacyCourseId' && next.legacyCourseId) next.legacyCourseId = hydrateCourse(next.legacyCourseId);
      if (field === 'homeroomTeacherUserId' && next.homeroomTeacherUserId) next.homeroomTeacherUserId = hydrateUser(next.homeroomTeacherUserId);
    });
    return next;
  };

  if (Array.isArray(value)) return value.map(populateOne);
  return populateOne(value);
};

const applyMembershipLifecycle = (item) => {
  item.note = String(item.note || '').trim();
  item.rejectedReason = String(item.rejectedReason || '').trim();
  if (!item.joinedAt) item.joinedAt = now();

  if (item.status === 'active' || item.status === 'pending') {
    item.isCurrent = true;
    item.leftAt = null;
    item.rejectedReason = '';
  }

  if (['transferred', 'graduated', 'dropped', 'rejected'].includes(item.status)) {
    item.isCurrent = false;
    if (!item.leftAt) item.leftAt = now();
    if (item.status !== 'rejected') item.rejectedReason = '';
  }

  if (item.leftAt && item.joinedAt && new Date(item.leftAt).getTime() < new Date(item.joinedAt).getTime()) {
    item.leftAt = item.joinedAt;
  }

  if (!item.source) item.source = 'system';
  if (item.legacyOrder === undefined) item.legacyOrder = null;
  if (item.createdBy === undefined) item.createdBy = null;
  if (!item.createdAt) item.createdAt = now();
  item.updatedAt = now();
};

function makeMembershipDoc(record) {
  const doc = clone(record);

  doc.save = async function save() {
    applyMembershipLifecycle(this);
    const payload = {
      _id: this._id || 'mem-' + nextMembershipId++,
      student: this.student,
      course: this.course,
      academicYear: this.academicYear || null,
      academicYearId: this.academicYearId || this.academicYear || null,
      classId: this.classId || null,
      status: this.status,
      source: this.source,
      joinedAt: this.joinedAt,
      leftAt: this.leftAt,
      note: this.note,
      rejectedReason: this.rejectedReason,
      isCurrent: this.isCurrent,
      legacyOrder: this.legacyOrder || null,
      createdBy: this.createdBy || null,
      createdAt: this.createdAt || now(),
      updatedAt: this.updatedAt || now()
    };
    const index = membershipRecords.findIndex((item) => String(item._id) === String(payload._id));
    if (index >= 0) membershipRecords[index] = clone(payload);
    else membershipRecords.push(clone(payload));
    Object.assign(this, clone(payload));
    return this;
  };

  doc.deleteOne = async function deleteOne() {
    const index = membershipRecords.findIndex((item) => String(item._id) === String(this._id));
    if (index >= 0) membershipRecords.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };

  return doc;
}


function makeJoinRequestDoc(record) {
  const doc = clone(record);

  doc.save = async function save() {
    const payload = {
      _id: this._id || 'join-' + nextJoinRequestId++,
      student: this.student?._id || this.student,
      course: this.course?._id || this.course,
      academicYear: this.academicYear || null,
      status: this.status || 'pending',
      source: this.source || 'student',
      note: String(this.note || '').trim(),
      rejectedReason: String(this.rejectedReason || '').trim(),
      createdBy: this.createdBy || null,
      reviewedBy: this.reviewedBy || null,
      reviewedAt: this.reviewedAt || null,
      legacyOrder: this.legacyOrder || null,
      createdAt: this.createdAt || now(),
      updatedAt: now()
    };
    const index = joinRequestRecords.findIndex((item) => String(item._id) === String(payload._id));
    if (index >= 0) joinRequestRecords[index] = clone(payload);
    else joinRequestRecords.push(clone(payload));
    Object.assign(this, clone(payload));
    return this;
  };

  return doc;
}

function makeInstructorSubjectDoc(record) {
  const doc = clone(record);

  doc.save = async function save() {
    const payload = {
      _id: this._id || 'map-' + nextInstructorSubjectId++,
      instructor: this.instructor?._id || this.instructor,
      subject: this.subject?._id || this.subject,
      academicYear: this.academicYear?._id || this.academicYear || null,
      classId: this.classId?._id || this.classId || null,
      course: this.course?._id || this.course || null,
      note: String(this.note || '').trim(),
      isPrimary: !!this.isPrimary,
      createdAt: this.createdAt || now(),
      updatedAt: now()
    };
    const index = instructorSubjectRecords.findIndex((item) => String(item._id) === String(payload._id));
    if (index >= 0) instructorSubjectRecords[index] = clone(payload);
    else instructorSubjectRecords.push(clone(payload));
    Object.assign(this, clone(payload));
    return this;
  };

  doc.deleteOne = async function deleteOne() {
    const index = instructorSubjectRecords.findIndex((item) => String(item._id) === String(this._id));
    if (index >= 0) instructorSubjectRecords.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  };

  doc.toObject = function toObject() {
    return clone({
      _id: this._id,
      instructor: this.instructor,
      subject: this.subject,
      academicYear: this.academicYear,
      classId: this.classId,
      course: this.course,
      note: this.note,
      isPrimary: this.isPrimary,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    });
  };

  return doc;
}

class StudentMembershipMock {
  constructor(payload = {}) {
    Object.assign(this, payload);
    if (!this._id) this._id = 'mem-' + nextMembershipId++;
    if (!this.createdAt) this.createdAt = now();
    if (!this.updatedAt) this.updatedAt = now();
    if (this.note === undefined) this.note = '';
    if (this.rejectedReason === undefined) this.rejectedReason = '';
    if (this.source === undefined) this.source = 'system';
    if (this.legacyOrder === undefined) this.legacyOrder = null;
    if (this.classId === undefined) this.classId = null;
    if (this.academicYearId === undefined) this.academicYearId = this.academicYear || null;
    if (this.createdBy === undefined) this.createdBy = null;
  }

  async save() {
    const doc = makeMembershipDoc(this);
    await doc.save();
    Object.assign(this, doc);
    return this;
  }

  async deleteOne() {
    const doc = makeMembershipDoc(this);
    return doc.deleteOne();
  }

  static find(filter = {}) {
    return new MockQuery(() => membershipRecords.filter((item) => matchesFilter(item, filter)));
  }

  static findOne(filter = {}) {
    return new MockQuery(() => membershipRecords.find((item) => matchesFilter(item, filter)) || null, {
      asDocument: true,
      docFactory: makeMembershipDoc
    });
  }

  static findById(id) {
    return new MockQuery(() => membershipRecords.find((item) => String(item._id) === String(id)) || null, {
      asDocument: true,
      docFactory: makeMembershipDoc
    });
  }
}

const UserMock = {
  findById(id) {
    return new MockQuery(() => hydrateUser(id));
  }
};

const SubjectMock = {
  find(filter = {}) {
    return new MockQuery(() => subjects.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => hydrateSubject(id));
  },
  async countDocuments(filter = {}) {
    return subjects.filter((item) => matchesFilter(item, filter)).length;
  }
};

const AcademicYearMock = {
  find(filter = {}) {
    return new MockQuery(() => academicYears.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => hydrateAcademicYear(id));
  },
  async countDocuments(filter = {}) {
    return academicYears.filter((item) => matchesFilter(item, filter)).length;
  }
};

const CourseMock = {
  find(filter = {}) {
    return new MockQuery(() => courses.filter((item) => matchesFilter(item, filter)));
  },
  findById(id) {
    return new MockQuery(() => hydrateCourse(id));
  }
};

const SchoolClassMock = {
  find(filter = {}) {
    return new MockQuery(() => schoolClasses.filter((item) => matchesFilter(item, filter)));
  },
  findOne(filter = {}) {
    return new MockQuery(() => schoolClasses.find((item) => matchesFilter(item, filter)) || null);
  },
  findById(id) {
    return new MockQuery(() => hydrateSchoolClass(id));
  },
  async countDocuments(filter = {}) {
    return schoolClasses.filter((item) => matchesFilter(item, filter)).length;
  }
};

const CourseJoinRequestMock = {
  find(filter = {}) {
    return new MockQuery(() => joinRequestRecords.filter((item) => matchesFilter(item, filter)));
  },
  findOne(filter = {}) {
    return new MockQuery(() => joinRequestRecords.find((item) => matchesFilter(item, filter)) || null, {
      asDocument: true,
      docFactory: makeJoinRequestDoc
    });
  },
  findById(id) {
    return new MockQuery(() => joinRequestRecords.find((item) => String(item._id) === String(id)) || null, {
      asDocument: true,
      docFactory: makeJoinRequestDoc
    });
  },
  async create(payload = {}) {
    const doc = makeJoinRequestDoc({
      _id: 'join-' + nextJoinRequestId++,
      student: payload.student,
      course: payload.course,
      academicYear: payload.academicYear || null,
      status: payload.status || 'pending',
      source: payload.source || 'student',
      note: String(payload.note || '').trim(),
      rejectedReason: String(payload.rejectedReason || '').trim(),
      createdBy: payload.createdBy || null,
      reviewedBy: payload.reviewedBy || null,
      reviewedAt: payload.reviewedAt || null,
      legacyOrder: payload.legacyOrder || null,
      createdAt: payload.createdAt || now(),
      updatedAt: payload.updatedAt || now()
    });
    await doc.save();
    return doc;
  }
};

const ScheduleMock = {
  async distinct(field, filter = {}) {
    const items = schedules.filter((item) => matchesFilter(item, filter));
    return [...new Set(items.map((item) => item[field]).filter(Boolean).map(String))];
  }
};

class InstructorSubjectMock {
  constructor(payload = {}) {
    Object.assign(this, payload);
    if (!this._id) this._id = 'map-' + nextInstructorSubjectId++;
    if (!this.createdAt) this.createdAt = now();
    if (!this.updatedAt) this.updatedAt = now();
    if (this.classId === undefined) this.classId = null;
    if (this.course === undefined) this.course = null;
    if (this.note === undefined) this.note = '';
    if (this.isPrimary === undefined) this.isPrimary = false;
  }

  async save() {
    const doc = makeInstructorSubjectDoc(this);
    await doc.save();
    Object.assign(this, doc);
    return this;
  }

  async deleteOne() {
    const doc = makeInstructorSubjectDoc(this);
    return doc.deleteOne();
  }

  toObject() {
    return clone({
      _id: this._id,
      instructor: this.instructor,
      subject: this.subject,
      academicYear: this.academicYear,
      classId: this.classId,
      course: this.course,
      note: this.note,
      isPrimary: this.isPrimary,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    });
  }

  static find(filter = {}) {
    return new MockQuery(() => instructorSubjectRecords.filter((item) => matchesFilter(item, filter)));
  }

  static findOne(filter = {}) {
    return new MockQuery(() => instructorSubjectRecords.find((item) => matchesFilter(item, filter)) || null, {
      asDocument: true,
      docFactory: makeInstructorSubjectDoc
    });
  }

  static findById(id) {
    return new MockQuery(() => instructorSubjectRecords.find((item) => String(item._id) === String(id)) || null, {
      asDocument: true,
      docFactory: makeInstructorSubjectDoc
    });
  }

  static async create(payload = {}) {
    const doc = new InstructorSubjectMock(payload);
    await doc.save();
    return doc;
  }

  static async countDocuments(filter = {}) {
    return instructorSubjectRecords.filter((item) => matchesFilter(item, filter)).length;
  }

  static async findByIdAndDelete(id) {
    const index = instructorSubjectRecords.findIndex((item) => String(item._id) === String(id));
    if (index < 0) return null;
    const [removed] = instructorSubjectRecords.splice(index, 1);
    return makeInstructorSubjectDoc(removed);
  }
}

const UserNotificationMock = {
  async create(payload = {}) {
    const item = {
      _id: 'notification-' + nextNotificationId++,
      user: payload.user || null,
      title: payload.title || '',
      message: payload.message || '',
      type: payload.type || 'general',
      createdAt: now()
    };
    notifications.push(clone(item));
    return clone(item);
  },
  async insertMany(items = []) {
    const created = [];
    for (const payload of items) {
      created.push(await this.create(payload));
    }
    return created;
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
  requireRole(allowedRoles = []) {
    return (req, res, next) => (
      allowedRoles.includes(String(req.user?.role || ''))
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

const syncMock = {
  async deactivateCurrentMemberships({ studentId, courseId, actorId = null, note = '', status = 'dropped', legacyOrderId = null, rejectedReason = '' } = {}) {
    let modifiedCount = 0;
    membershipRecords.forEach((item) => {
      if (String(item.student) !== String(studentId) || String(item.course) !== String(courseId) || !item.isCurrent) return;
      item.status = status;
      item.isCurrent = false;
      item.leftAt = now();
      item.note = String(note || '').trim();
      item.rejectedReason = status === 'rejected' ? String(rejectedReason || '').trim() : '';
      item.legacyOrder = legacyOrderId || null;
      item.createdBy = actorId || null;
      item.updatedAt = now();
      modifiedCount += 1;
    });
    return { matchedCount: modifiedCount, modifiedCount };
  }
};

const courseAccessMock = {
  async findAccessibleCourses(user) {
    if (user?.role === 'admin') return clone(courses);
    if (String(user?.id || '') === IDS.student1) return [clone(courses[0])];
    if (String(user?.id || '') === IDS.student2) return [clone(courses[1])];
    return [];
  }
};

const activityMock = {
  async logActivity(payload) {
    activityLog.push({
      action: payload?.action || '',
      targetType: payload?.targetType || '',
      targetId: payload?.targetId || '',
      meta: clone(payload?.meta || {})
    });
  }
};

function loadEducationRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'educationRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isRoute = parentFile.endsWith('/routes/educationRoutes.js');

    if (isRoute && request === '../models/Course') return CourseMock;
    if (isRoute && request === '../models/CourseJoinRequest') return CourseJoinRequestMock;
    if (isRoute && request === '../models/Schedule') return ScheduleMock;
    if (isRoute && request === '../models/StudentMembership') return StudentMembershipMock;
    if (isRoute && request === '../models/UserNotification') return UserNotificationMock;
    if (isRoute && request === '../models/User') return UserMock;
    if (isRoute && request === '../models/Subject') return SubjectMock;
    if (isRoute && request === '../models/AcademicYear') return AcademicYearMock;
    if (isRoute && request === '../models/SchoolClass') return SchoolClassMock;
    if (isRoute && request === '../models/InstructorSubject') return InstructorSubjectMock;
    if (isRoute && request === '../utils/studentMembershipSync') return syncMock;
    if (isRoute && request === '../utils/courseAccess') return courseAccessMock;
    if (isRoute && request === '../middleware/auth') return authMock;
    if (isRoute && request === '../utils/activity') return activityMock;

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const educationRouter = loadEducationRouter();

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/education', educationRouter);

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

  const response = await fetch('http://127.0.0.1:' + address.port + targetPath, {
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
  const adminUser = { id: IDS.admin1, role: 'admin', permissions: ['manage_users', 'manage_content'] };
  const instructorUser = { id: IDS.instructor1, role: 'instructor', permissions: ['manage_content'] };
  const studentUser = { id: IDS.student1, role: 'student', permissions: [] };
  const studentTwoUser = { id: IDS.student2, role: 'student', permissions: [] };
  const studentThreeUser = { id: IDS.student3, role: 'student', permissions: [] };
  const adminWithoutPermission = { id: IDS.admin1, role: 'admin', permissions: [] };

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error.message });
    }
  };

  try {
    await check('my courses require authentication', async () => {
      const response = await request(server, '/api/education/my-courses');
      assertCase(response.status === 401, 'Expected 401 for unauthenticated request');
    });

    await check('public school classes expose canonical catalog payload', async () => {
      const response = await request(server, '/api/education/public-school-classes?limit=1&page=1');
      assertCase(response.status === 200, 'Expected 200 for public school-class catalog');
      assertCase(response.data?.success === true, 'Expected success=true for public catalog');
      assertCase(Array.isArray(response.data?.items), 'Expected items array for public catalog');
      assertCase(response.data.items.length === 1, 'Expected pagination limit to be applied');
      assertCase(response.data?.total === 2, 'Expected total class count in public catalog');
      const firstItem = response.data.items[0] || {};
      assertCase(String(firstItem.classId || '') === IDS.class2, 'Expected newest school class first in public catalog');
      assertCase(String(firstItem.courseId || '') === IDS.course2, 'Expected compatibility courseId in public catalog');
      assertCase(String(firstItem.schoolClass?.id || firstItem.schoolClass?._id || '') === IDS.class2, 'Expected nested schoolClass payload');
    });

    await check('public school classes support canonical grade filters', async () => {
      const response = await request(server, '/api/education/public-school-classes?gradeLevel=10');
      assertCase(response.status === 200, 'Expected 200 for filtered public school-class catalog');
      assertCase(response.data?.success === true, 'Expected success=true for filtered public catalog');
      assertCase(response.data?.items?.length === 1, 'Expected one filtered school class');
      assertCase(String(response.data.items[0]?.classId || '') === IDS.class1, 'Expected filtered class one result');
      assertCase(response.data.items[0]?.title === 'Class One Core', 'Expected canonical school-class title');
    });

    await check('public school class detail resolves canonical identifiers', async () => {
      const response = await request(server, `/api/education/public-school-classes/${IDS.course1}`);
      assertCase(response.status === 200, 'Expected 200 for public class detail');
      assertCase(response.data?.success === true, 'Expected success=true for public class detail');
      assertCase(String(response.data?.item?.classId || '') === IDS.class1, 'Expected canonical classId in public detail');
      assertCase(String(response.data?.item?.courseId || '') === IDS.course1, 'Expected compatibility courseId in public detail');
      assertCase(response.data?.item?.schoolClass?.title === 'Class One Core', 'Expected nested schoolClass payload in public detail');
    });

    await check('my courses return membership-based classes', async () => {
      const response = await request(server, '/api/education/my-courses', { user: studentUser });
      assertCase(response.status === 200, 'Expected 200 for student courses');
      assertCase(Array.isArray(response.data?.items), 'Expected items array');
      assertCase(response.data.items.length === 1, 'Expected one accessible course');
      assertCase(String(response.data.items[0]?._id) === IDS.course1, 'Expected course one');
      assertCase(String(response.data.items[0]?.classId || '') === IDS.class1, 'Expected classId on accessible course payload');
      assertCase(String(response.data.items[0]?.schoolClass?.id || response.data.items[0]?.schoolClass?._id || '') === IDS.class1, 'Expected schoolClass payload on accessible course');
    });

    await check('course access status returns active membership status', async () => {
      const response = await request(server, '/api/education/course-access-status/' + IDS.course1, { user: studentUser });
      assertCase(response.status === 200, 'Expected 200 for active membership status');
      assertCase(response.data?.status === 'approved', 'Expected approved status for active membership');
      assertCase(response.data?.hasActiveMembership === true, 'Expected hasActiveMembership flag');
      assertCase(String(response.data?.membershipId || '') === 'mem-1', 'Expected membership id in response');
    });

    await check('course access status falls back to pending join request', async () => {
      const response = await request(server, '/api/education/course-access-status/' + IDS.course1, { user: studentTwoUser });
      assertCase(response.status === 200, 'Expected 200 for pending join request status');
      assertCase(response.data?.status === 'pending', 'Expected pending status when only join request exists');
      assertCase(response.data?.hasPendingRequest === true, 'Expected hasPendingRequest flag');
      assertCase(String(response.data?.pendingRequestId || '') === 'join-1', 'Expected pending request id');
      assertCase(String(response.data?.classId || '') === IDS.class1, 'Expected classId in access-status response');
    });

    await check('course access status also resolves classId identifiers', async () => {
      const response = await request(server, '/api/education/course-access-status/' + IDS.class1, { user: studentTwoUser });
      assertCase(response.status === 200, 'Expected 200 for classId access status');
      assertCase(response.data?.status === 'pending', 'Expected pending status when accessed by classId');
      assertCase(String(response.data?.courseId || '') === IDS.course1, 'Expected compatibility course id in access-status response');
      assertCase(String(response.data?.classId || '') === IDS.class1, 'Expected classId in classId-based access-status response');
    });

    await check('instructor-subject mappings list resolves schoolClass from classId-first records', async () => {
      const response = await request(server, '/api/education/instructor-subjects?classId=' + IDS.class1, { user: adminUser });
      assertCase(response.status === 200, 'Expected 200 for mapping list');
      assertCase(Array.isArray(response.data?.items), 'Expected items array');
      assertCase(response.data.items.length === 1, 'Expected one mapping for class one');
      assertCase(String(response.data.items[0]?.classId || '') === IDS.class1, 'Expected classId in serialized mapping');
      assertCase(String(response.data.items[0]?.courseId || '') === IDS.course1, 'Expected compatibility course id in serialized mapping');
      assertCase(String(response.data.items[0]?.schoolClass?.id || response.data.items[0]?.schoolClass?._id || '') === IDS.class1, 'Expected populated schoolClass payload');
    });

    await check('create instructor-subject mapping stores classId and course side by side', async () => {
      const response = await request(server, '/api/education/instructor-subjects', {
        method: 'POST',
        user: adminUser,
        body: {
          instructorId: IDS.instructor1,
          subjectId: '507f191e810c19729de86212',
          academicYearId: IDS.year1,
          classId: IDS.class2,
          note: 'physics secondary',
          isPrimary: false
        }
      });
      assertCase(response.status === 201, 'Expected 201 on create mapping, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(String(response.data?.item?.classId || '') === IDS.class2, 'Expected classId in create response');
      const stored = instructorSubjectRecords.find((item) => String(item.subject) === '507f191e810c19729de86212' && String(item.classId) === IDS.class2);
      assertCase(!!stored, 'Expected created instructor-subject mapping to be stored');
      assertCase(String(stored.course || '') === IDS.course2, 'Expected legacy course compatibility to stay in sync');
    });

    await check('update instructor-subject mapping can move by classId without legacyCourseId input', async () => {
      const created = instructorSubjectRecords.find((item) => String(item.subject) === '507f191e810c19729de86212' && String(item.classId) === IDS.class2);
      const response = await request(server, '/api/education/instructor-subjects/' + created._id, {
        method: 'PUT',
        user: adminUser,
        body: {
          instructorId: IDS.instructor1,
          subjectId: '507f191e810c19729de86212',
          academicYearId: IDS.year1,
          classId: IDS.class1,
          note: 'physics moved to class one',
          isPrimary: true
        }
      });
      assertCase(response.status === 200, 'Expected 200 on update mapping, got ' + response.status + ' ' + JSON.stringify(response.data));
      const stored = instructorSubjectRecords.find((item) => String(item._id) === String(created._id));
      assertCase(String(stored?.classId || '') === IDS.class1, 'Expected stored classId to update');
      assertCase(String(stored?.course || '') === IDS.course1, 'Expected stored course to follow class compatibility');
      assertCase(response.data?.item?.schoolClass?.title === 'Class One Core', 'Expected updated schoolClass in response');
    });

    await check('student enrollments require manage_users permission', async () => {
      const response = await request(server, '/api/education/student-enrollments', { user: adminWithoutPermission });
      assertCase(response.status === 403, 'Expected 403 without manage_users');
    });

    await check('student enrollments list serializes membership rows', async () => {
      const response = await request(server, '/api/education/student-enrollments', { user: adminUser });
      assertCase(response.status === 200, 'Expected 200 for enrollment list');
      assertCase(response.data.items.length === 2, 'Expected two visible enrollment rows');
      const approvedRow = response.data.items.find((item) => String(item.user?._id || '') === IDS.student1);
      const rejectedRow = response.data.items.find((item) => String(item.user?._id || '') === IDS.student2);
      assertCase(approvedRow?.status === 'approved', 'Expected active membership to map to approved');
      assertCase(rejectedRow?.status === 'rejected', 'Expected rejected membership to map to rejected');
      assertCase(rejectedRow?.rejectedReason === 'capacity_full', 'Expected rejected reason to survive serialization');
    });

    await check('create enrollment writes direct membership record', async () => {
      const response = await request(server, '/api/education/student-enrollments', {
        method: 'POST',
        user: adminUser,
        body: {
          studentId: IDS.student2,
          classId: IDS.class1,
          status: 'approved',
          note: 'manual admission'
        }
      });
      assertCase(response.status === 201, 'Expected 201 on create, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(response.data?.item?.status === 'approved', 'Expected approved response status');
      const stored = membershipRecords.find((item) => String(item.student) === IDS.student2 && String(item.course) === IDS.course1 && item.isCurrent);
      assertCase(!!stored, 'Expected active membership to be stored');
      assertCase(stored.source === 'admin', 'Expected admin as source');
    });

    await check('update enrollment can reject an existing membership', async () => {
      const created = membershipRecords.find((item) => String(item.student) === IDS.student2 && String(item.course) === IDS.course1 && item.isCurrent);
      const response = await request(server, '/api/education/student-enrollments/' + created._id, {
        method: 'PUT',
        user: adminUser,
        body: {
          studentId: IDS.student2,
          classId: IDS.class1,
          status: 'rejected',
          note: 'manual review',
          rejectedReason: 'documents_missing'
        }
      });
      assertCase(response.status === 200, 'Expected 200 on update, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(response.data?.item?.status === 'rejected', 'Expected rejected response status');
      const stored = membershipRecords.find((item) => String(item._id) === String(created._id));
      assertCase(stored && stored.status === 'rejected', 'Expected stored status to be rejected');
      assertCase(stored.isCurrent === false, 'Expected rejected membership to be non-current');
      assertCase(stored.rejectedReason === 'documents_missing', 'Expected rejected reason to be stored');
    });

    await check('student join request accepts classId and stores canonical course request', async () => {
      const response = await request(server, '/api/education/join-requests', {
        method: 'POST',
        user: studentThreeUser,
        body: {
          classId: IDS.class2,
          note: 'please add me'
        }
      });
      assertCase(response.status === 201, 'Expected 201 on join request, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(String(response.data?.item?._id || '') === 'join-2', 'Expected join-2 id for new request');
      assertCase(response.data?.item?.status === 'pending', 'Expected pending join request response');
      assertCase(String(response.data?.item?.classId || '') === IDS.class2, 'Expected classId on join request response');
      const stored = joinRequestRecords.find((item) => String(item._id) === 'join-2');
      assertCase(!!stored, 'Expected join request to be persisted');
      assertCase(stored.status === 'pending', 'Expected stored join request to remain pending');
      assertCase(String(stored.course || '') === IDS.course2, 'Expected canonical course id to be persisted');
    });

    await check('instructor courses list uses canonical education endpoint', async () => {
      const response = await request(server, '/api/education/instructor/courses', { user: instructorUser });
      assertCase(response.status === 200, 'Expected 200 for instructor courses');
      assertCase(Array.isArray(response.data?.items), 'Expected items array');
      assertCase(response.data.items.length === 2, 'Expected two assigned classes');
      assertCase(response.data.items.some((item) => String(item._id) === IDS.course1), 'Expected class one in instructor list');
      assertCase(response.data.items.some((item) => String(item._id) === IDS.course2), 'Expected class two in instructor list');
      assertCase(response.data.items.some((item) => String(item.classId || '') === IDS.class1), 'Expected classId in instructor courses payload');
    });

    await check('instructor pending join requests read from CourseJoinRequest', async () => {
      const response = await request(server, '/api/education/instructor/join-requests', { user: instructorUser });
      assertCase(response.status === 200, 'Expected 200 for instructor join requests');
      assertCase(Array.isArray(response.data?.items), 'Expected items array');
      assertCase(response.data.items.length === 2, 'Expected two pending join requests');
      assertCase(response.data.items.some((item) => String(item._id) === 'join-1'), 'Expected original pending request');
      assertCase(response.data.items.some((item) => String(item._id) === 'join-2'), 'Expected new pending request');
    });

    await check('instructor approval turns join request into active membership', async () => {
      const response = await request(server, '/api/education/instructor/join-requests/join-1/approve', {
        method: 'POST',
        user: instructorUser
      });
      assertCase(response.status === 200, 'Expected 200 on instructor approval, got ' + response.status + ' ' + JSON.stringify(response.data));
      const requestRecord = joinRequestRecords.find((item) => String(item._id) === 'join-1');
      assertCase(requestRecord?.status === 'approved', 'Expected join request to be approved');
      const membership = membershipRecords.find((item) => String(item.student) === IDS.student2 && String(item.course) === IDS.course1 && item.isCurrent);
      assertCase(!!membership, 'Expected approved join request to create an active membership');
      assertCase(membership.status === 'active', 'Expected membership to be active');
    });

    await check('instructor course-students returns roster from memberships', async () => {
      const response = await request(server, '/api/education/instructor/course-students?classId=' + IDS.class1, {
        user: instructorUser
      });
      assertCase(response.status === 200, 'Expected 200 for course roster');
      assertCase(Array.isArray(response.data?.items), 'Expected roster items array');
      assertCase(response.data.items.length === 2, 'Expected two active students in course one');
      assertCase(response.data.items.some((item) => String(item.user?._id || '') === IDS.student1), 'Expected student one in roster');
      assertCase(response.data.items.some((item) => String(item.user?._id || '') === IDS.student2), 'Expected student two in roster');
      assertCase(response.data.items.every((item) => String(item.classId || '') === IDS.class1), 'Expected serialized roster rows to carry classId');
    });

    await check('instructor add student can activate membership from pending join request', async () => {
      const response = await request(server, '/api/education/instructor/course-students', {
        method: 'POST',
        user: instructorUser,
        body: {
          classId: IDS.class2,
          studentId: IDS.student3
        }
      });
      assertCase(response.status === 201, 'Expected 201 on instructor add student, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(response.data?.item?.status === 'approved', 'Expected approved enrollment status');
      const membership = membershipRecords.find((item) => String(item.student) === IDS.student3 && String(item.course) === IDS.course2 && item.isCurrent);
      assertCase(!!membership, 'Expected active membership for student three');
      assertCase(String(membership.classId || '') === IDS.class2, 'Expected active membership to persist classId');
      const requestRecord = joinRequestRecords.find((item) => String(item._id) === 'join-2');
      assertCase(requestRecord?.status === 'approved', 'Expected pending request to be auto-approved');
    });

    await check('student can open another canonical join request after separate activation', async () => {
      const response = await request(server, '/api/education/join-requests', {
        method: 'POST',
        user: studentThreeUser,
        body: {
          courseId: IDS.course1,
          note: 'second request'
        }
      });
      assertCase(response.status === 201, 'Expected 201 on second join request, got ' + response.status + ' ' + JSON.stringify(response.data));
      assertCase(String(response.data?.item?._id || '') === 'join-3', 'Expected join-3 id for second request');
    });

    await check('instructor reject updates canonical join request status', async () => {
      const response = await request(server, '/api/education/instructor/join-requests/join-3/reject', {
        method: 'POST',
        user: instructorUser,
        body: { reason: 'capacity_full' }
      });
      assertCase(response.status === 200, 'Expected 200 on instructor reject, got ' + response.status + ' ' + JSON.stringify(response.data));
      const requestRecord = joinRequestRecords.find((item) => String(item._id) === 'join-3');
      assertCase(requestRecord?.status === 'rejected', 'Expected join request to be rejected');
      assertCase(requestRecord?.rejectedReason === 'capacity_full', 'Expected reject reason to be stored');
    });

    await check('instructor remove student deactivates active membership', async () => {
      const membership = membershipRecords.find((item) => String(item.student) === IDS.student3 && String(item.course) === IDS.course2 && item.isCurrent);
      const response = await request(server, '/api/education/instructor/course-students/' + membership._id, {
        method: 'DELETE',
        user: instructorUser
      });
      assertCase(response.status === 200, 'Expected 200 on instructor remove student, got ' + response.status + ' ' + JSON.stringify(response.data));
      const stored = membershipRecords.find((item) => String(item._id) === String(membership._id));
      assertCase(stored?.status === 'dropped', 'Expected membership to be dropped');
      assertCase(stored?.isCurrent === false, 'Expected membership to be non-current after removal');
    });

    await check('delete enrollment drops current membership out of the visible list', async () => {
      const response = await request(server, '/api/education/student-enrollments/mem-1', {
        method: 'DELETE',
        user: adminUser
      });
      assertCase(response.status === 200, 'Expected 200 on delete, got ' + response.status + ' ' + JSON.stringify(response.data));
      const stored = membershipRecords.find((item) => String(item._id) === 'mem-1');
      assertCase(stored && stored.status === 'dropped', 'Expected current membership to be dropped');
      const listResponse = await request(server, '/api/education/student-enrollments', { user: adminUser });
      assertCase(!listResponse.data.items.some((item) => String(item._id) === 'mem-1'), 'Expected dropped membership to disappear from default list');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }

  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log('PASS  route smoke: ' + item.label);
    } else {
      console.error('FAIL  route smoke: ' + item.label + '\n  ' + item.error);
    }
  });

  const failed = cases.filter((item) => item.status === 'FAIL');
  if (failed.length) {
    throw new Error('Education route smoke failed: ' + failed.length + ' case(s).');
  }

  const requiredActions = [
    'student_join_request',
    'instructor_approve_join_request',
    'instructor_reject_join_request',
    'instructor_add_student_to_course',
    'instructor_remove_student_from_course'
  ];
  assertCase(requiredActions.every((action) => activityLog.some((item) => item.action === action)), 'Expected canonical education activity log coverage');
  assertCase(notifications.length >= 5, 'Expected instructor and student notifications for canonical education workflow');
  console.log('\nEducation route smoke passed: ' + cases.length + ' case(s).');
}

run().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
