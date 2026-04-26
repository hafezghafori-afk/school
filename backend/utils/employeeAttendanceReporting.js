const {
  ATTENDANCE_STATUSES,
  finalizeStatusSummary,
  formatLocalDateKey,
  normalizeAttendanceStatus
} = require('./attendanceReporting');

const pad = (value) => String(value).padStart(2, '0');

function formatMonthKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
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

function createLinkedUserRef(linkedUser) {
  if (!linkedUser) return null;
  return {
    _id: linkedUser._id || null,
    name: linkedUser.name || '',
    email: linkedUser.email || '',
    role: linkedUser.role || '',
    orgRole: linkedUser.orgRole || '',
    adminLevel: linkedUser.adminLevel || '',
    subject: linkedUser.subject || ''
  };
}

function createEmployeeRef(employee) {
  if (!employee) return null;
  return {
    _id: employee._id || null,
    name: employee.name || '',
    firstName: employee.firstName || '',
    lastName: employee.lastName || '',
    fatherName: employee.fatherName || '',
    email: employee.email || '',
    employeeId: employee.employeeId || '',
    position: employee.position || '',
    positionLabel: employee.positionLabel || '',
    employmentStatus: employee.employmentStatus || '',
    employmentStatusLabel: employee.employmentStatusLabel || '',
    gender: employee.gender || '',
    linkedUser: createLinkedUserRef(employee.linkedUser)
  };
}

function createEmployeeSummary(employee) {
  return createStatusSummary({
    employee: createEmployeeRef(employee),
    lastStatus: '',
    lastDate: '',
    _lastTimestamp: 0
  });
}

function buildEmployeeAttendanceCollectionSummary({ employees = [], records = [], from, to }) {
  const employeeMap = new Map();
  const byDateMap = new Map();
  const byMonthMap = new Map();
  const summary = createStatusSummary({
    totalEmployees: 0,
    recordedEmployees: 0,
    totalDays: 0,
    totalMonths: 0
  });

  for (const employee of employees) {
    const id = String(employee?._id || '');
    if (!id || employeeMap.has(id)) continue;
    employeeMap.set(id, createEmployeeSummary(employee));
  }

  for (const record of records) {
    const employeeId = String(record?.employee?._id || record?.employee || '');
    if (!employeeId) continue;

    if (!employeeMap.has(employeeId)) {
      const fallbackEmployee = record.employee && typeof record.employee === 'object'
        ? record.employee
        : { _id: employeeId, name: '', employeeId: '', fatherName: '', position: '' };
      employeeMap.set(employeeId, createEmployeeSummary(fallbackEmployee));
    }

    const employeeSummary = employeeMap.get(employeeId);
    incrementStatus(employeeSummary, record.status);

    const recordDate = record.date instanceof Date ? record.date : new Date(record.date);
    const timestamp = Number.isNaN(recordDate.getTime()) ? 0 : recordDate.getTime();
    if (timestamp >= Number(employeeSummary._lastTimestamp || 0)) {
      employeeSummary._lastTimestamp = timestamp;
      employeeSummary.lastStatus = normalizeAttendanceStatus(record.status || '');
      employeeSummary.lastDate = formatLocalDateKey(recordDate);
    }

    const dateKey = formatLocalDateKey(recordDate);
    const monthKey = formatMonthKey(recordDate);

    const byDate = byDateMap.get(dateKey) || createStatusSummary({ date: dateKey });
    incrementStatus(byDate, record.status);
    byDateMap.set(dateKey, byDate);

    const byMonth = byMonthMap.get(monthKey) || createStatusSummary({ month: monthKey });
    incrementStatus(byMonth, record.status);
    byMonthMap.set(monthKey, byMonth);

    incrementStatus(summary, record.status);
  }

  const employeeRows = [...employeeMap.values()]
    .map((item) => {
      const finalized = finalizeStatusSummary(item);
      if (finalized.totalRecords > 0) {
        summary.recordedEmployees += 1;
      }
      delete finalized._lastTimestamp;
      return finalized;
    })
    .sort((a, b) => (a.employee?.name || '').localeCompare(b.employee?.name || '', 'fa'));

  const byDate = [...byDateMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const byMonth = [...byMonthMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.month || '').localeCompare(String(b.month || '')));

  summary.totalEmployees = employeeRows.length;
  summary.totalDays = byDate.length;
  summary.totalMonths = byMonth.length;

  return {
    range: {
      from: formatLocalDateKey(from),
      to: formatLocalDateKey(to)
    },
    summary: finalizeStatusSummary(summary),
    employees: employeeRows,
    byDate,
    byMonth
  };
}

function buildEmployeeAttendanceDetailSummary({ employee, records = [], from, to, recentLimit = 20 }) {
  const summary = createStatusSummary({
    employee: createEmployeeRef(employee),
    currentAbsentStreak: 0,
    lastStatus: '',
    lastDate: ''
  });
  const byDateMap = new Map();
  const byMonthMap = new Map();
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
    const monthKey = formatMonthKey(recordDate);

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

    const byMonth = byMonthMap.get(monthKey) || createStatusSummary({ month: monthKey });
    incrementStatus(byMonth, record.status);
    byMonthMap.set(monthKey, byMonth);

    if (recent.length < recentLimit) {
      recent.push({
        _id: record._id,
        date: dateKey,
        month: monthKey,
        status: normalizeAttendanceStatus(record.status || ''),
        note: record.note || ''
      });
    }
  }

  const byDate = [...byDateMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const byMonth = [...byMonthMap.values()]
    .map((item) => finalizeStatusSummary(item))
    .sort((a, b) => String(a.month || '').localeCompare(String(b.month || '')));

  return {
    range: {
      from: formatLocalDateKey(from),
      to: formatLocalDateKey(to)
    },
    summary: finalizeStatusSummary(summary),
    recent,
    byDate,
    byMonth
  };
}

module.exports = {
  buildEmployeeAttendanceCollectionSummary,
  buildEmployeeAttendanceDetailSummary,
  createEmployeeRef,
  formatMonthKey
};
