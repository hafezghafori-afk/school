const ATTENDANCE_STATUSES = ['present', 'absent', 'sick', 'leave'];
const LEGACY_STATUS_ALIASES = {
  late: 'sick',
  excused: 'leave'
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const pad = (value) => String(value).padStart(2, '0');

function normalizeDateBoundary(value, boundary = 'start') {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (boundary === 'end') {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return date;
}

function normalizeDay(value) {
  return normalizeDateBoundary(value, 'start');
}

function normalizeAttendanceStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (ATTENDANCE_STATUSES.includes(normalized)) return normalized;
  return LEGACY_STATUS_ALIASES[normalized] || '';
}

function parseAttendanceStatus(value) {
  const normalized = normalizeAttendanceStatus(value);
  return ATTENDANCE_STATUSES.includes(normalized) ? normalized : null;
}

function formatLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function shiftDays(value, days = 0, boundary = 'start') {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + Number(days || 0));
  return normalizeDateBoundary(date, boundary);
}

function createStudentRef(student) {
  if (!student) return null;
  return {
    _id: student._id,
    name: student.name || '',
    email: student.email || '',
    grade: student.grade || '',
    admissionNo: student.admissionNo || '',
    fatherName: student.fatherName || '',
    grandfatherName: student.grandfatherName || '',
    gender: student.gender || ''
  };
}

function createCourseRef(course) {
  if (!course) return null;
  return {
    _id: course._id,
    title: course.title || '',
    category: course.category || ''
  };
}

function resolveDateRange(query = {}, options = {}) {
  const { maxSpanDays = 366 } = options;
  const rawFrom = query.from || query.to || '';
  const rawTo = query.to || query.from || '';

  if (!rawFrom || !rawTo) {
    return { error: 'بازه تاریخ الزامی است.' };
  }

  const from = normalizeDateBoundary(rawFrom, 'start');
  const to = normalizeDateBoundary(rawTo, 'end');
  if (!from || !to) {
    return { error: 'بازه تاریخ معتبر نیست.' };
  }

  if (from.getTime() > to.getTime()) {
    return { error: 'تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.' };
  }

  const spanDays = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY) + 1;
  if (spanDays > maxSpanDays) {
    return { error: `بازه تاریخ نمی‌تواند بیشتر از ${maxSpanDays} روز باشد.` };
  }

  return {
    from,
    to,
    fromKey: formatLocalDateKey(from),
    toKey: formatLocalDateKey(to),
    spanDays
  };
}

function resolveWeekRange(query = {}, options = {}) {
  const rawWeekStart = query.weekStart || query.date || '';
  const anchor = rawWeekStart
    ? normalizeDateBoundary(rawWeekStart, 'start')
    : normalizeDateBoundary(options.now || new Date(), 'start');

  if (!anchor) {
    return { error: 'تاریخ هفته معتبر نیست.' };
  }

  const diffToSaturday = (anchor.getDay() + 1) % 7;
  const start = shiftDays(anchor, -diffToSaturday, 'start');
  const end = shiftDays(start, 6, 'end');
  if (!start || !end) {
    return { error: 'تاریخ هفته معتبر نیست.' };
  }

  return {
    anchor,
    start,
    end,
    anchorKey: formatLocalDateKey(anchor),
    startKey: formatLocalDateKey(start),
    endKey: formatLocalDateKey(end)
  };
}

function createStatusSummary(seed = {}) {
  return {
    present: 0,
    absent: 0,
    sick: 0,
    leave: 0,
    totalRecords: 0,
    attendanceRate: 0,
    ...seed
  };
}

function incrementStatus(summary, status, count = 1) {
  const normalizedStatus = normalizeAttendanceStatus(status);
  if (!summary || !ATTENDANCE_STATUSES.includes(normalizedStatus)) return summary;
  summary[normalizedStatus] = Number(summary[normalizedStatus] || 0) + count;
  summary.totalRecords = Number(summary.totalRecords || 0) + count;
  return summary;
}

function finalizeStatusSummary(summary) {
  const totalRecords = ATTENDANCE_STATUSES.reduce((acc, status) => acc + Number(summary?.[status] || 0), 0);
  const attendedCount = totalRecords - Number(summary?.absent || 0);

  return {
    ...summary,
    totalRecords,
    attendanceRate: totalRecords ? Number(((attendedCount / totalRecords) * 100).toFixed(1)) : 0
  };
}

function createStudentSummary(student) {
  return createStatusSummary({
    student: createStudentRef(student),
    lastStatus: '',
    lastDate: '',
    _lastTimestamp: 0
  });
}

function buildCourseAttendanceSummary({ students = [], records = [], from, to }) {
  const studentMap = new Map();
  const byDateMap = new Map();
  const summary = createStatusSummary({
    totalStudents: 0,
    recordedStudents: 0,
    totalDays: 0
  });

  for (const student of students) {
    const id = String(student?._id || '');
    if (!id || studentMap.has(id)) continue;
    studentMap.set(id, createStudentSummary(student));
  }

  for (const record of records) {
    const studentId = String(record?.student?._id || record?.student || '');
    if (!studentId) continue;

    if (!studentMap.has(studentId)) {
      const fallbackStudent = record.student && typeof record.student === 'object'
        ? record.student
        : { _id: studentId, name: '', email: '', grade: '' };
      studentMap.set(studentId, createStudentSummary(fallbackStudent));
    }

    const studentSummary = studentMap.get(studentId);
    incrementStatus(studentSummary, record.status);

    const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
    const timestamp = Number.isNaN(recordDate.getTime()) ? 0 : recordDate.getTime();
    if (timestamp >= Number(studentSummary._lastTimestamp || 0)) {
      studentSummary._lastTimestamp = timestamp;
      studentSummary.lastStatus = normalizeAttendanceStatus(record.status || '');
      studentSummary.lastDate = formatLocalDateKey(recordDate);
    }

    const dateKey = formatLocalDateKey(recordDate);
    const byDate = byDateMap.get(dateKey) || createStatusSummary({ date: dateKey });
    incrementStatus(byDate, record.status);
    byDateMap.set(dateKey, byDate);

    incrementStatus(summary, record.status);
  }

  const studentRows = [...studentMap.values()]
    .map((item) => {
      const finalized = finalizeStatusSummary(item);
      if (finalized.totalRecords > 0) {
        summary.recordedStudents += 1;
      }
      delete finalized._lastTimestamp;
      return finalized;
    })
    .sort((a, b) => (a.student?.name || '').localeCompare(b.student?.name || '', 'fa'));

  const dailyRows = [...byDateMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  summary.totalStudents = studentRows.length;
  summary.totalDays = dailyRows.length;

  return {
    range: {
      from: formatLocalDateKey(from),
      to: formatLocalDateKey(to)
    },
    summary: finalizeStatusSummary(summary),
    students: studentRows,
    byDate: dailyRows
  };
}

function buildStudentAttendanceSummary({ student, course = null, records = [], from, to, recentLimit = 20 }) {
  const summary = createStatusSummary({
    student: createStudentRef(student),
    course: createCourseRef(course),
    currentAbsentStreak: 0,
    totalCourses: 0,
    lastStatus: '',
    lastDate: ''
  });
  const byDateMap = new Map();
  const byCourseMap = new Map();
  const recent = [];
  let streakLocked = false;

  const sortedRecords = [...records].sort((a, b) => {
    const aDate = new Date(a?.date || 0).getTime();
    const bDate = new Date(b?.date || 0).getTime();
    if (bDate !== aDate) return bDate - aDate;
    const aCreated = new Date(a?.createdAt || 0).getTime();
    const bCreated = new Date(b?.createdAt || 0).getTime();
    return bCreated - aCreated;
  });

  for (const record of sortedRecords) {
    incrementStatus(summary, record.status);

    const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
    const dateKey = formatLocalDateKey(recordDate);
    const recordCourse = createCourseRef(record.course);

    if (!summary.lastDate) {
      summary.lastDate = dateKey;
      summary.lastStatus = normalizeAttendanceStatus(record.status || '');
    }

    if (!streakLocked) {
      if (normalizeAttendanceStatus(record.status) === 'absent') {
        summary.currentAbsentStreak += 1;
      } else {
        streakLocked = true;
      }
    }

    const byDate = byDateMap.get(dateKey) || createStatusSummary({ date: dateKey });
    incrementStatus(byDate, record.status);
    byDateMap.set(dateKey, byDate);

    if (recordCourse?._id) {
      const courseId = String(recordCourse._id);
      const byCourse = byCourseMap.get(courseId) || createStatusSummary({ course: recordCourse });
      incrementStatus(byCourse, record.status);
      byCourseMap.set(courseId, byCourse);
    }

    if (recent.length < recentLimit) {
      recent.push({
        _id: record._id,
        date: dateKey,
        status: normalizeAttendanceStatus(record.status || ''),
        note: record.note || '',
        course: recordCourse
      });
    }
  }

  const byDate = [...byDateMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const byCourse = [...byCourseMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => (a.course?.title || '').localeCompare(b.course?.title || '', 'fa'));

  summary.totalCourses = byCourse.length || (course ? 1 : 0);

  return {
    range: {
      from: formatLocalDateKey(from),
      to: formatLocalDateKey(to)
    },
    summary: finalizeStatusSummary(summary),
    recent,
    byDate,
    byCourse
  };
}

module.exports = {
  ATTENDANCE_STATUSES,
  buildCourseAttendanceSummary,
  buildStudentAttendanceSummary,
  finalizeStatusSummary,
  formatLocalDateKey,
  normalizeAttendanceStatus,
  normalizeDay,
  parseAttendanceStatus,
  resolveDateRange,
  resolveWeekRange
};
