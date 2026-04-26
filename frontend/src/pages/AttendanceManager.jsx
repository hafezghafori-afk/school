import React, { useEffect, useMemo, useState } from 'react';
import './AttendanceManager.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate, formatAfghanDateTime, toGregorianDateInputValue } from '../utils/afghanDate';

const STATUS_OPTIONS = [
  { value: 'present', label: 'حاضر' },
  { value: 'absent', label: 'غیرحاضر' },
  { value: 'sick', label: 'مریض' },
  { value: 'leave', label: 'رخصتی' }
];

const STATUS_ALIASES = {
  present: 'present',
  absent: 'absent',
  sick: 'sick',
  leave: 'leave',
  late: 'sick',
  excused: 'leave'
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const todayInputValue = () => toGregorianDateInputValue(new Date());

const shiftInputDate = (days = 0) => {
  const today = new Date();
  today.setDate(today.getDate() + Number(days || 0));
  return toGregorianDateInputValue(today);
};

const normalizeAttendanceStatus = (value = '') => STATUS_ALIASES[String(value || '').trim().toLowerCase()] || 'present';

const toFaDate = (value) => (
  formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '-'
);

const toFaDateTime = (value) => (
  formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || '-'
);

const toFaNumber = (value) => Number(value || 0).toLocaleString('fa-AF-u-ca-persian');

const formatRate = (value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')}%`;

const statusLabel = (value) => {
  const normalized = normalizeAttendanceStatus(value);
  return STATUS_OPTIONS.find((item) => item.value === normalized)?.label || '---';
};

const genderLabel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'male') return 'ذکور';
  if (normalized === 'female') return 'اناث';
  if (normalized === 'other') return 'دیگر';
  return '---';
};

const buildEditableRow = (item = {}, selectedDate = '') => {
  const normalizedStatus = normalizeAttendanceStatus(item.attendance?.status || 'present');
  return {
    student: item.student || null,
    attendanceId: item.attendance?._id || '',
    status: normalizedStatus,
    note: item.attendance?.note || '',
    originalStatus: normalizedStatus,
    originalNote: item.attendance?.note || '',
    recordedAt: item.attendance?.updatedAt || item.attendance?.createdAt || '',
    attendanceDate: item.attendance?.date || selectedDate || ''
  };
};

const buildEditableEmployeeRow = (item = {}, selectedDate = '') => {
  const normalizedStatus = normalizeAttendanceStatus(item.attendance?.status || 'present');
  return {
    employee: item.employee || null,
    attendanceId: item.attendance?._id || '',
    status: normalizedStatus,
    note: item.attendance?.note || '',
    originalStatus: normalizedStatus,
    originalNote: item.attendance?.note || '',
    recordedAt: item.attendance?.updatedAt || item.attendance?.createdAt || '',
    attendanceDate: item.attendance?.date || selectedDate || ''
  };
};

const isRowDirty = (row) => (
  String(row?.status || '') !== String(row?.originalStatus || '')
  || String(row?.note || '') !== String(row?.originalNote || '')
);

const uniqueStudentsFromItems = (items = []) => {
  const seen = new Set();
  const students = [];

  items.forEach((item) => {
    const student = item?.student || item;
    const id = String(student?._id || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    students.push(student);
  });

  return students;
};

const uniqueEmployeesFromItems = (items = []) => {
  const seen = new Set();
  const employees = [];

  items.forEach((item) => {
    const employee = item?.employee || item;
    const id = String(employee?._id || '');
    if (!id || seen.has(id)) return;
    seen.add(id);
    employees.push(employee);
  });

  return employees;
};

const toFaMonth = (value) => {
  if (!value) return '-';
  const monthValue = /^\d{4}-\d{2}$/.test(String(value || '').trim())
    ? `${String(value).trim()}-01`
    : value;
  return formatAfghanDate(monthValue, {
    year: 'numeric',
    month: 'long'
  }) || String(value || '');
};

const getCourseClassId = (item = {}) => (
  String(
    item?.classId
    || item?.schoolClass?._id
    || item?.schoolClass?.id
    || item?.id
    || item?.schoolClassRef?._id
    || item?.schoolClassRef
    || ''
  ).trim()
);

const getCourseCompatId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

const getCourseSelectionId = (item = {}) => getCourseClassId(item) || getCourseCompatId(item);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || item?.name
  || ''
);

const findCourseBySelection = (items = [], selectionId = '') => (
  items.find((item) => String(getCourseSelectionId(item)) === String(selectionId))
  || items.find((item) => String(getCourseCompatId(item)) === String(selectionId))
  || null
);

const normalizeAttendanceClassOptions = (items = [], source = 'courseAccess') => items.map((item) => {
  if (source === 'schoolClass') {
    const classId = String(item?.id || item?._id || '').trim();
    const courseId = String(item?.legacyCourseId || '').trim();
    return {
      ...item,
      classId: classId || null,
      courseId: courseId || null,
      schoolClass: {
        _id: classId || null,
        id: classId || null,
        title: item?.title || '',
        code: item?.code || '',
        gradeLevel: item?.gradeLevel || '',
        section: item?.section || '',
        academicYearId: item?.academicYearId || item?.academicYear?._id || null,
        academicYear: item?.academicYear || null
      }
    };
  }

  return {
    ...item,
    classId: getCourseClassId(item) || null,
    courseId: String(item?.courseId || item?._id || item?.legacyCourseId || '').trim() || null,
    schoolClass: item?.schoolClass || null
  };
});

const buildCourseItemsFromAssignments = (assignments = []) => {
  const grouped = new Map();

  assignments.forEach((item) => {
    const status = String(item?.status || '').trim().toLowerCase();
    if (!['active', 'planned', 'pending'].includes(status)) return;

    const classId = String(item?.classId?._id || item?.classId || '').trim();
    if (!classId) return;
    const legacyCourseId = String(item?.legacyCourseId || '').trim();

    if (!grouped.has(classId)) {
      grouped.set(classId, {
        _id: legacyCourseId || classId,
        courseId: legacyCourseId || null,
        classId,
        schoolClass: {
          _id: classId,
          id: classId,
          title: item?.classId?.title || 'صنف',
          code: item?.classId?.code || '',
          gradeLevel: item?.classId?.gradeLevel || '',
          section: item?.classId?.section || '',
          academicYearId: item?.classId?.academicYearId || null
        }
      });
    }
  });

  return Array.from(grouped.values());
};

const parseDownloadFilename = (contentDisposition, fallback = 'attendance-report.csv') => {
  const match = /filename="?([^"]+)"?/i.exec(String(contentDisposition || ''));
  return match?.[1] || fallback;
};

export default function AttendanceManager() {
  const [scope, setScope] = useState('students');
  const [view, setView] = useState('entry');
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState(todayInputValue());
  const [range, setRange] = useState({ from: shiftInputDate(-29), to: todayInputValue() });
  const [rows, setRows] = useState([]);
  const [studentOptions, setStudentOptions] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [classReport, setClassReport] = useState(null);
  const [studentReport, setStudentReport] = useState(null);
  const [message, setMessage] = useState('');
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [loadingClassReport, setLoadingClassReport] = useState(false);
  const [loadingStudentReport, setLoadingStudentReport] = useState(false);
  const [saving, setSaving] = useState({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exportingClassReport, setExportingClassReport] = useState(false);
  const [exportingStudentReport, setExportingStudentReport] = useState(false);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [employeeOptions, setEmployeeOptions] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [employeeReport, setEmployeeReport] = useState(null);
  const [employeeDetailReport, setEmployeeDetailReport] = useState(null);
  const [loadingEmployeeEntry, setLoadingEmployeeEntry] = useState(false);
  const [loadingEmployeeReport, setLoadingEmployeeReport] = useState(false);
  const [loadingEmployeeDetailReport, setLoadingEmployeeDetailReport] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState({});
  const [employeeBulkSaving, setEmployeeBulkSaving] = useState(false);
  const [exportingEmployeeReport, setExportingEmployeeReport] = useState(false);
  const [exportingEmployeeDetailReport, setExportingEmployeeDetailReport] = useState(false);

  const selectedCourse = useMemo(
    () => findCourseBySelection(courses, courseId),
    [courses, courseId]
  );
  const selectedClassId = getCourseClassId(selectedCourse);
  const selectedCompatCourseId = getCourseCompatId(selectedCourse);
  const selectedCourseLabel = getCourseLabel(selectedCourse) || 'صنف انتخاب نشده';
  const pageTitle = scope === 'students' ? 'حاضری شاگردان' : 'حاضری کارمندان';
  const pageDescription = scope === 'students'
    ? 'با انتخاب صنف و تاریخ، جدول شاگردان همان صنف به‌صورت خودکار باز می‌شود و استاد می‌تواند وضعیت هر شاگرد را به شکل منظم ثبت کند.'
    : 'با انتخاب تاریخ، جدول کارمندان فعال باز می‌شود و مدیریت می‌تواند حضور، غیبت، مریضی یا رخصتی هر کارمند را به‌شکل منظم ثبت و پیگیری کند.';

  const syncStudentOptions = (items = []) => {
    const students = uniqueStudentsFromItems(items);
    setStudentOptions(students);
    setSelectedStudentId((prev) => (
      students.some((student) => String(student?._id) === String(prev))
        ? prev
        : (students[0]?._id || '')
    ));
  };

  const syncEmployeeOptions = (items = []) => {
    const employees = uniqueEmployeesFromItems(items);
    setEmployeeOptions(employees);
    setSelectedEmployeeId((prev) => (
      employees.some((employee) => String(employee?._id) === String(prev))
        ? prev
        : (employees[0]?._id || '')
    ));
  };

  const loadCourses = async () => {
    try {
      const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
      const isInstructor = role === 'instructor';
      const res = await fetch(`${API_BASE}${isInstructor ? '/api/education/instructor/courses' : '/api/education/school-classes?status=active'}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setCourses([]);
        setCourseId('');
        return;
      }

      let sourceItems = Array.isArray(data?.items) ? data.items : [];
      if (isInstructor && !sourceItems.length) {
        const teacherId = String(localStorage.getItem('userId') || '').trim();
        if (teacherId) {
          const fallbackRes = await fetch(`${API_BASE}/api/teacher-assignments/teacher/${encodeURIComponent(teacherId)}`, {
            headers: { ...getAuthHeaders() }
          });
          const fallbackData = await fallbackRes.json().catch(() => ({}));
          sourceItems = buildCourseItemsFromAssignments(fallbackData?.data?.assignments || fallbackData?.items || []);
        }
      }

      const items = normalizeAttendanceClassOptions(sourceItems, isInstructor ? 'courseAccess' : 'schoolClass');
      setCourses(items);
      setCourseId((prev) => {
        if (items.some((item) => String(getCourseSelectionId(item)) === String(prev))) {
          return prev;
        }
        return getCourseSelectionId(items[0]) || items[0]?._id || '';
      });
    } catch {
      setCourses([]);
      setCourseId('');
    }
  };

  const loadAttendance = async ({ silent = false, targetCourseId = courseId, targetDate = date } = {}) => {
    const targetCourse = findCourseBySelection(courses, targetCourseId);
    const targetClassId = getCourseClassId(targetCourse);
    const targetCompatCourseId = getCourseCompatId(targetCourse) || (!targetClassId ? targetCourseId : '');

    if ((!targetClassId && !targetCompatCourseId) || !targetDate) {
      setRows([]);
      setStudentOptions([]);
      if (!silent) setMessage('صنف و تاریخ را انتخاب کنید.');
      return;
    }

    setLoadingEntry(true);
    if (!silent) setMessage('');

    try {
      const scopePath = targetClassId
        ? `class/${encodeURIComponent(targetClassId)}`
        : `course/${encodeURIComponent(targetCompatCourseId)}`;
      const res = await fetch(`${API_BASE}/api/attendance/${scopePath}?date=${encodeURIComponent(targetDate)}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setRows([]);
        setStudentOptions([]);
        if (!silent) setMessage(data?.message || 'دریافت جدول حاضری ممکن نشد.');
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setRows(items.map((item) => buildEditableRow(item, targetDate)));
      syncStudentOptions(items.map((item) => item.student).filter(Boolean));
    } catch {
      setRows([]);
      setStudentOptions([]);
      if (!silent) setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingEntry(false);
    }
  };

  const loadEmployeeAttendance = async ({ silent = false, targetDate = date } = {}) => {
    if (!targetDate) {
      setEmployeeRows([]);
      setEmployeeOptions([]);
      if (!silent) setMessage('تاریخ حضور را انتخاب کنید.');
      return;
    }

    setLoadingEmployeeEntry(true);
    if (!silent) setMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/attendance/employees?date=${encodeURIComponent(targetDate)}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setEmployeeRows([]);
        setEmployeeOptions([]);
        if (!silent) setMessage(data?.message || 'دریافت جدول حاضری کارمندان ممکن نشد.');
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setEmployeeRows(items.map((item) => buildEditableEmployeeRow(item, targetDate)));
      syncEmployeeOptions(items.map((item) => item.employee).filter(Boolean));
    } catch {
      setEmployeeRows([]);
      setEmployeeOptions([]);
      if (!silent) setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingEmployeeEntry(false);
    }
  };

  const loadClassReport = async () => {
    if ((!selectedClassId && !selectedCompatCourseId) || !range.from || !range.to) {
      setMessage('صنف و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setLoadingClassReport(true);
    setMessage('');
    setClassReport(null);

    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      const scopePath = selectedClassId
        ? `class/${encodeURIComponent(selectedClassId)}`
        : `course/${encodeURIComponent(selectedCompatCourseId)}`;
      const res = await fetch(`${API_BASE}/api/attendance/${scopePath}/summary?${query.toString()}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت خلاصه صنف');
        return;
      }

      setClassReport(data);
      syncStudentOptions((data.students || []).map((item) => item.student).filter(Boolean));
    } catch {
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingClassReport(false);
    }
  };

  const loadStudentReport = async (targetStudentId = selectedStudentId) => {
    if ((!selectedClassId && !selectedCompatCourseId) || !targetStudentId || !range.from || !range.to) {
      setMessage('صنف، شاگرد و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setLoadingStudentReport(true);
    setMessage('');
    setStudentReport(null);

    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      if (selectedClassId) query.set('classId', selectedClassId);
      else if (selectedCompatCourseId) query.set('courseId', selectedCompatCourseId);

      const res = await fetch(
        `${API_BASE}/api/attendance/student/${encodeURIComponent(targetStudentId)}/summary?${query.toString()}`,
        { headers: { ...getAuthHeaders() } }
      );
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت گزارش شاگرد');
        return;
      }

      setStudentReport(data);
    } catch {
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingStudentReport(false);
    }
  };

  const loadEmployeeSummary = async () => {
    if (!range.from || !range.to) {
      setMessage('بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setLoadingEmployeeReport(true);
    setMessage('');
    setEmployeeReport(null);

    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      const res = await fetch(`${API_BASE}/api/attendance/employees/summary?${query.toString()}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت خلاصه کارمندان');
        return;
      }

      setEmployeeReport(data);
      syncEmployeeOptions((data.employees || []).map((item) => item.employee).filter(Boolean));
    } catch {
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingEmployeeReport(false);
    }
  };

  const loadEmployeeDetailReport = async (targetEmployeeId = selectedEmployeeId) => {
    if (!targetEmployeeId || !range.from || !range.to) {
      setMessage('کارمند و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setLoadingEmployeeDetailReport(true);
    setMessage('');
    setEmployeeDetailReport(null);

    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      const res = await fetch(
        `${API_BASE}/api/attendance/employees/${encodeURIComponent(targetEmployeeId)}/summary?${query.toString()}`,
        { headers: { ...getAuthHeaders() } }
      );
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت گزارش کارمند');
        return;
      }

      setEmployeeDetailReport(data);
    } catch {
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoadingEmployeeDetailReport(false);
    }
  };

  const downloadReportFile = async (url, fallbackFilename) => {
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() }
    });

    if (!res.ok) {
      let errorMessage = 'دانلود گزارش ناموفق بود.';
      try {
        const data = await res.json();
        if (data?.message) errorMessage = data.message;
      } catch {
        // ignore non-json error body
      }
      throw new Error(errorMessage);
    }

    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = parseDownloadFilename(res.headers.get('content-disposition'), fallbackFilename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  };

  const exportClassReport = async () => {
    if ((!selectedClassId && !selectedCompatCourseId) || !range.from || !range.to) {
      setMessage('صنف و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setExportingClassReport(true);
    setMessage('');
    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      const scopePath = selectedClassId
        ? `class/${encodeURIComponent(selectedClassId)}`
        : `course/${encodeURIComponent(selectedCompatCourseId)}`;
      await downloadReportFile(
        `${API_BASE}/api/attendance/${scopePath}/export.csv?${query.toString()}`,
        `attendance-course-${range.from}-${range.to}.csv`
      );
    } catch (error) {
      setMessage(error.message || 'خطا در دانلود گزارش صنف');
    } finally {
      setExportingClassReport(false);
    }
  };

  const exportStudentReport = async (targetStudentId = selectedStudentId) => {
    if ((!selectedClassId && !selectedCompatCourseId) || !targetStudentId || !range.from || !range.to) {
      setMessage('صنف، شاگرد و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setExportingStudentReport(true);
    setMessage('');
    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      if (selectedClassId) query.set('classId', selectedClassId);
      else if (selectedCompatCourseId) query.set('courseId', selectedCompatCourseId);
      await downloadReportFile(
        `${API_BASE}/api/attendance/student/${encodeURIComponent(targetStudentId)}/export.csv?${query.toString()}`,
        `attendance-student-${range.from}-${range.to}.csv`
      );
    } catch (error) {
      setMessage(error.message || 'خطا در دانلود گزارش شاگرد');
    } finally {
      setExportingStudentReport(false);
    }
  };

  const exportEmployeeReport = async () => {
    if (!range.from || !range.to) {
      setMessage('بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setExportingEmployeeReport(true);
    setMessage('');
    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      await downloadReportFile(
        `${API_BASE}/api/attendance/employees/export.csv?${query.toString()}`,
        `attendance-employees-${range.from}-${range.to}.csv`
      );
    } catch (error) {
      setMessage(error.message || 'خطا در دانلود گزارش کارمندان');
    } finally {
      setExportingEmployeeReport(false);
    }
  };

  const exportEmployeeDetailReport = async (targetEmployeeId = selectedEmployeeId) => {
    if (!targetEmployeeId || !range.from || !range.to) {
      setMessage('کارمند و بازه تاریخ را کامل انتخاب کنید.');
      return;
    }

    setExportingEmployeeDetailReport(true);
    setMessage('');
    try {
      const query = new URLSearchParams({
        from: range.from,
        to: range.to
      });
      await downloadReportFile(
        `${API_BASE}/api/attendance/employees/${encodeURIComponent(targetEmployeeId)}/export.csv?${query.toString()}`,
        `attendance-employee-${range.from}-${range.to}.csv`
      );
    } catch (error) {
      setMessage(error.message || 'خطا در دانلود گزارش کارمند');
    } finally {
      setExportingEmployeeDetailReport(false);
    }
  };

  const saveAttendanceRecord = async (row) => {
    const res = await fetch(`${API_BASE}/api/attendance/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        studentId: row.student?._id,
        ...(selectedClassId ? { classId: selectedClassId } : { courseId: selectedCompatCourseId }),
        date,
        status: row.status,
        note: row.note
      })
    });

    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'ذخیره حاضری ناموفق بود.');
    }

    return data;
  };

  const saveEmployeeAttendanceRecord = async (row) => {
    const res = await fetch(`${API_BASE}/api/attendance/employees/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({
        employeeId: row.employee?._id,
        date,
        status: row.status,
        note: row.note
      })
    });

    const data = await res.json();
    if (!data?.success) {
      throw new Error(data?.message || 'ذخیره حاضری کارمند ناموفق بود.');
    }

    return data;
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    if (scope !== 'students' || !courseId || !date) return;
    loadAttendance({ silent: true, targetCourseId: courseId, targetDate: date });
    setClassReport(null);
    setStudentReport(null);
  }, [scope, courseId, date]);

  useEffect(() => {
    if (scope !== 'employees' || !date) return;
    loadEmployeeAttendance({ silent: true, targetDate: date });
    setEmployeeReport(null);
    setEmployeeDetailReport(null);
  }, [scope, date]);

  useEffect(() => {
    setMessage('');
  }, [view, scope]);

  const updateRow = (idx, patch) => {
    setRows((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, ...patch } : row)));
  };

  const updateEmployeeRow = (idx, patch) => {
    setEmployeeRows((prev) => prev.map((row, rowIdx) => (rowIdx === idx ? { ...row, ...patch } : row)));
  };

  const applyBulkStatus = (status) => {
    const normalizedStatus = normalizeAttendanceStatus(status);
    setRows((prev) => prev.map((row) => ({ ...row, status: normalizedStatus })));
  };

  const applyEmployeeBulkStatus = (status) => {
    const normalizedStatus = normalizeAttendanceStatus(status);
    setEmployeeRows((prev) => prev.map((row) => ({ ...row, status: normalizedStatus })));
  };

  const handleSave = async (row, idx) => {
    if ((!selectedClassId && !selectedCompatCourseId) || !date || !row.student?._id) return;
    setSaving((prev) => ({ ...prev, [idx]: true }));
    setMessage('');

    try {
      const data = await saveAttendanceRecord(row);
      setRows((prev) => prev.map((item, itemIdx) => (
        itemIdx === idx
          ? {
            ...item,
            attendanceId: data.attendance?._id || item.attendanceId,
            originalStatus: item.status,
            originalNote: item.note,
            recordedAt: data.attendance?.updatedAt || data.attendance?.createdAt || item.recordedAt,
            attendanceDate: data.attendance?.date || item.attendanceDate || date
          }
          : item
      )));
      setMessage('حاضری شاگرد ذخیره شد.');
    } catch (error) {
      setMessage(error.message || 'خطا در ذخیره حاضری');
    } finally {
      setSaving((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const handleEmployeeSave = async (row, idx) => {
    if (!date || !row.employee?._id) return;
    setEmployeeSaving((prev) => ({ ...prev, [idx]: true }));
    setMessage('');

    try {
      const data = await saveEmployeeAttendanceRecord(row);
      setEmployeeRows((prev) => prev.map((item, itemIdx) => (
        itemIdx === idx
          ? {
            ...item,
            attendanceId: data.attendance?._id || item.attendanceId,
            originalStatus: item.status,
            originalNote: item.note,
            recordedAt: data.attendance?.updatedAt || data.attendance?.createdAt || item.recordedAt,
            attendanceDate: data.attendance?.date || item.attendanceDate || date
          }
          : item
      )));
      setMessage('حاضری کارمند ذخیره شد.');
    } catch (error) {
      setMessage(error.message || 'خطا در ذخیره حاضری کارمند');
    } finally {
      setEmployeeSaving((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const handleSaveAll = async () => {
    const dirtyRows = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => isRowDirty(row));

    if (!dirtyRows.length) {
      setMessage('تغییری برای ثبت وجود ندارد.');
      return;
    }

    setBulkSaving(true);
    setMessage('');

    let successCount = 0;
    let failedCount = 0;

    for (const { row, idx } of dirtyRows) {
      setSaving((prev) => ({ ...prev, [idx]: true }));
      try {
        const data = await saveAttendanceRecord(row);
        successCount += 1;
        setRows((prev) => prev.map((item, itemIdx) => (
          itemIdx === idx
            ? {
              ...item,
              attendanceId: data.attendance?._id || item.attendanceId,
              originalStatus: item.status,
              originalNote: item.note,
              recordedAt: data.attendance?.updatedAt || data.attendance?.createdAt || item.recordedAt,
              attendanceDate: data.attendance?.date || item.attendanceDate || date
            }
            : item
        )));
      } catch {
        failedCount += 1;
      } finally {
        setSaving((prev) => ({ ...prev, [idx]: false }));
      }
    }

    if (successCount && failedCount) {
      setMessage(`${toFaNumber(successCount)} ردیف ذخیره شد و ${toFaNumber(failedCount)} مورد ناموفق بود.`);
    } else if (successCount) {
      setMessage(`${toFaNumber(successCount)} ردیف با موفقیت ثبت شد.`);
    } else {
      setMessage('ثبت حاضری ناموفق بود.');
    }

    setBulkSaving(false);
  };

  const handleEmployeeSaveAll = async () => {
    const dirtyRows = employeeRows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => isRowDirty(row));

    if (!dirtyRows.length) {
      setMessage('تغییری برای ثبت وجود ندارد.');
      return;
    }

    setEmployeeBulkSaving(true);
    setMessage('');

    let successCount = 0;
    let failedCount = 0;

    for (const { row, idx } of dirtyRows) {
      setEmployeeSaving((prev) => ({ ...prev, [idx]: true }));
      try {
        const data = await saveEmployeeAttendanceRecord(row);
        successCount += 1;
        setEmployeeRows((prev) => prev.map((item, itemIdx) => (
          itemIdx === idx
            ? {
              ...item,
              attendanceId: data.attendance?._id || item.attendanceId,
              originalStatus: item.status,
              originalNote: item.note,
              recordedAt: data.attendance?.updatedAt || data.attendance?.createdAt || item.recordedAt,
              attendanceDate: data.attendance?.date || item.attendanceDate || date
            }
            : item
        )));
      } catch {
        failedCount += 1;
      } finally {
        setEmployeeSaving((prev) => ({ ...prev, [idx]: false }));
      }
    }

    if (successCount && failedCount) {
      setMessage(`${toFaNumber(successCount)} ردیف ذخیره شد و ${toFaNumber(failedCount)} مورد ناموفق بود.`);
    } else if (successCount) {
      setMessage(`${toFaNumber(successCount)} ردیف با موفقیت ثبت شد.`);
    } else {
      setMessage('ثبت حاضری کارمندان ناموفق بود.');
    }

    setEmployeeBulkSaving(false);
  };

  const dailySummary = useMemo(() => {
    const summary = {
      total: rows.length,
      recorded: 0,
      dirty: 0,
      present: 0,
      absent: 0,
      sick: 0,
      leave: 0
    };

    rows.forEach((row) => {
      summary[normalizeAttendanceStatus(row.status)] = Number(summary[normalizeAttendanceStatus(row.status)] || 0) + 1;
      if (row.attendanceId) summary.recorded += 1;
      if (isRowDirty(row)) summary.dirty += 1;
    });

    return summary;
  }, [rows]);

  const employeeDailySummary = useMemo(() => {
    const summary = {
      total: employeeRows.length,
      recorded: 0,
      dirty: 0,
      present: 0,
      absent: 0,
      sick: 0,
      leave: 0
    };

    employeeRows.forEach((row) => {
      summary[normalizeAttendanceStatus(row.status)] = Number(summary[normalizeAttendanceStatus(row.status)] || 0) + 1;
      if (row.attendanceId) summary.recorded += 1;
      if (isRowDirty(row)) summary.dirty += 1;
    });

    return summary;
  }, [employeeRows]);

  const openStudentReport = async (studentId) => {
    if (!studentId) return;
    setSelectedStudentId(studentId);
    setView('student-report');
    await loadStudentReport(studentId);
  };

  const openEmployeeReport = async (employeeId) => {
    if (!employeeId) return;
    setSelectedEmployeeId(employeeId);
    setView('student-report');
    await loadEmployeeDetailReport(employeeId);
  };

  return (
    <div className="attendance-page">
      <div className="attendance-card attendance-card--modern">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <header className="attendance-hero">
          <div>
            <h2>{pageTitle}</h2>
            <p>{pageDescription}</p>
            <div className="attendance-hero-meta">
              <span>بخش فعال: <strong>{scope === 'students' ? 'شاگردان' : 'کارمندان'}</strong></span>
              <span>{scope === 'students' ? 'صنف فعال' : 'کارمندان آماده'}: <strong>{scope === 'students' ? selectedCourseLabel : toFaNumber(employeeRows.length || employeeOptions.length)}</strong></span>
              <span>تاریخ: <strong>{toFaDate(date)}</strong></span>
            </div>
          </div>
        </header>

        <div className="attendance-tabs">
          <button type="button" className={scope === 'students' ? 'active' : ''} onClick={() => setScope('students')}>
            شاگردان
          </button>
          <button type="button" className={scope === 'employees' ? 'active' : ''} onClick={() => setScope('employees')}>
            کارمندان
          </button>
        </div>

        <div className="attendance-tabs">
          <button type="button" className={view === 'entry' ? 'active' : ''} onClick={() => setView('entry')}>
            {scope === 'students' ? 'حاضری روزانه شاگردان' : 'حاضری روزانه کارمندان'}
          </button>
          <button type="button" className={view === 'course-report' ? 'active' : ''} onClick={() => setView('course-report')}>
            {scope === 'students' ? 'خلاصه صنف' : 'خلاصه کارمندان'}
          </button>
          <button type="button" className={view === 'student-report' ? 'active' : ''} onClick={() => setView('student-report')}>
            {scope === 'students' ? 'گزارش شاگرد' : 'گزارش کارمند'}
          </button>
        </div>

        <div className="attendance-toolbar">
          <div className="attendance-filter-group">
            {scope === 'students' ? (
              <>
                <label>
                  <span>صنف</span>
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    <option value="">انتخاب صنف</option>
                    {courses.map((course) => (
                      <option key={getCourseSelectionId(course) || course._id} value={getCourseSelectionId(course) || course._id}>
                        {getCourseLabel(course)}
                      </option>
                    ))}
                  </select>
                </label>

                {view === 'entry' ? (
                  <label>
                    <span>تاریخ حضور</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>از تاریخ</span>
                      <input
                        type="date"
                        value={range.from}
                        onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>تا تاریخ</span>
                      <input
                        type="date"
                        value={range.to}
                        onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                {view === 'student-report' && (
                  <label>
                    <span>شاگرد</span>
                    <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
                      <option value="">انتخاب شاگرد</option>
                      {studentOptions.map((student) => (
                        <option key={student._id} value={student._id}>{student.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <>
                {view === 'entry' ? (
                  <label>
                    <span>تاریخ حضور</span>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </label>
                ) : (
                  <>
                    <label>
                      <span>از تاریخ</span>
                      <input
                        type="date"
                        value={range.from}
                        onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
                      />
                    </label>
                    <label>
                      <span>تا تاریخ</span>
                      <input
                        type="date"
                        value={range.to}
                        onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
                      />
                    </label>
                  </>
                )}

                {view === 'student-report' && (
                  <label>
                    <span>کارمند</span>
                    <select value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
                      <option value="">انتخاب کارمند</option>
                      {employeeOptions.map((employee) => (
                        <option key={employee._id} value={employee._id}>
                          {employee.name}{employee.employeeId ? ` - ${employee.employeeId}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>

          <div className={`attendance-toolbar-actions ${view === 'entry' ? 'attendance-toolbar-actions--entry' : ''}`}>
            {scope === 'students' ? (
              view === 'entry' ? (
                <>
                  <button type="button" className="secondary" onClick={() => applyBulkStatus('present')} disabled={!rows.length || bulkSaving}>همه حاضر</button>
                  <button type="button" className="secondary danger" onClick={() => applyBulkStatus('absent')} disabled={!rows.length || bulkSaving}>همه غیرحاضر</button>
                  <button type="button" className="secondary warning" onClick={() => applyBulkStatus('sick')} disabled={!rows.length || bulkSaving}>همه مریض</button>
                  <button type="button" className="secondary info" onClick={() => applyBulkStatus('leave')} disabled={!rows.length || bulkSaving}>همه رخصتی</button>
                  <button type="button" className="secondary ghost" onClick={() => loadAttendance()} disabled={loadingEntry || bulkSaving}>
                    {loadingEntry ? 'در حال بروزرسانی...' : 'بازنشانی جدول'}
                  </button>
                  <button type="button" onClick={handleSaveAll} disabled={bulkSaving || !dailySummary.dirty}>
                    {bulkSaving ? 'در حال ثبت...' : `ثبت حاضری صنف${dailySummary.dirty ? ` (${toFaNumber(dailySummary.dirty)})` : ''}`}
                  </button>
                </>
              ) : view === 'course-report' ? (
                <>
                  <button type="button" onClick={loadClassReport} disabled={loadingClassReport}>
                    {loadingClassReport ? 'در حال دریافت...' : 'نمایش خلاصه صنف'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={exportClassReport}
                    disabled={exportingClassReport || loadingClassReport || (!selectedClassId && !selectedCompatCourseId) || !range.from || !range.to}
                  >
                    {exportingClassReport ? 'در حال دانلود...' : 'خروجی CSV'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => loadStudentReport()} disabled={loadingStudentReport}>
                    {loadingStudentReport ? 'در حال دریافت...' : 'نمایش گزارش شاگرد'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => exportStudentReport()}
                    disabled={exportingStudentReport || loadingStudentReport || (!selectedClassId && !selectedCompatCourseId) || !selectedStudentId || !range.from || !range.to}
                  >
                    {exportingStudentReport ? 'در حال دانلود...' : 'خروجی CSV'}
                  </button>
                </>
              )
            ) : (
              view === 'entry' ? (
                <>
                  <button type="button" className="secondary" onClick={() => applyEmployeeBulkStatus('present')} disabled={!employeeRows.length || employeeBulkSaving}>همه حاضر</button>
                  <button type="button" className="secondary danger" onClick={() => applyEmployeeBulkStatus('absent')} disabled={!employeeRows.length || employeeBulkSaving}>همه غیرحاضر</button>
                  <button type="button" className="secondary warning" onClick={() => applyEmployeeBulkStatus('sick')} disabled={!employeeRows.length || employeeBulkSaving}>همه مریض</button>
                  <button type="button" className="secondary info" onClick={() => applyEmployeeBulkStatus('leave')} disabled={!employeeRows.length || employeeBulkSaving}>همه رخصتی</button>
                  <button type="button" className="secondary ghost" onClick={() => loadEmployeeAttendance()} disabled={loadingEmployeeEntry || employeeBulkSaving}>
                    {loadingEmployeeEntry ? 'در حال بروزرسانی...' : 'بازنشانی جدول'}
                  </button>
                  <button type="button" onClick={handleEmployeeSaveAll} disabled={employeeBulkSaving || !employeeDailySummary.dirty}>
                    {employeeBulkSaving ? 'در حال ثبت...' : `ثبت حاضری کارمندان${employeeDailySummary.dirty ? ` (${toFaNumber(employeeDailySummary.dirty)})` : ''}`}
                  </button>
                </>
              ) : view === 'course-report' ? (
                <>
                  <button type="button" onClick={loadEmployeeSummary} disabled={loadingEmployeeReport}>
                    {loadingEmployeeReport ? 'در حال دریافت...' : 'نمایش خلاصه کارمندان'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={exportEmployeeReport}
                    disabled={exportingEmployeeReport || loadingEmployeeReport || !range.from || !range.to}
                  >
                    {exportingEmployeeReport ? 'در حال دانلود...' : 'خروجی CSV'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => loadEmployeeDetailReport()} disabled={loadingEmployeeDetailReport}>
                    {loadingEmployeeDetailReport ? 'در حال دریافت...' : 'نمایش گزارش کارمند'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => exportEmployeeDetailReport()}
                    disabled={exportingEmployeeDetailReport || loadingEmployeeDetailReport || !selectedEmployeeId || !range.from || !range.to}
                  >
                    {exportingEmployeeDetailReport ? 'در حال دانلود...' : 'خروجی CSV'}
                  </button>
                </>
              )
            )}
          </div>
        </div>

        {!!message && <div className="attendance-message">{message}</div>}

        {scope === 'students' && view === 'entry' && (
          <div className="attendance-view">
            <div className="attendance-summary-grid">
              <div className="attendance-summary-card accent">
                <span>کل شاگردان</span>
                <strong>{toFaNumber(dailySummary.total)}</strong>
              </div>
              <div className="attendance-summary-card">
                <span>ثبت‌شده</span>
                <strong>{toFaNumber(dailySummary.recorded)}</strong>
              </div>
              <div className="attendance-summary-card warning">
                <span>در انتظار ثبت</span>
                <strong>{toFaNumber(dailySummary.dirty)}</strong>
              </div>
              <div className="attendance-summary-card">
                <span>حاضر</span>
                <strong>{toFaNumber(dailySummary.present)}</strong>
              </div>
              <div className="attendance-summary-card danger">
                <span>غیرحاضر</span>
                <strong>{toFaNumber(dailySummary.absent)}</strong>
              </div>
              <div className="attendance-summary-card warning">
                <span>مریض</span>
                <strong>{toFaNumber(dailySummary.sick)}</strong>
              </div>
              <div className="attendance-summary-card info">
                <span>رخصتی</span>
                <strong>{toFaNumber(dailySummary.leave)}</strong>
              </div>
            </div>

            {loadingEntry && <div className="attendance-empty">در حال دریافت جدول حاضری...</div>}
            {!loadingEntry && !rows.length && (
              <div className="attendance-empty">برای این صنف شاگرد فعالی ثبت نشده است.</div>
            )}

            {!loadingEntry && !!rows.length && (
              <div className="attendance-daily-shell">
                <div className="attendance-daily-table-wrap">
                  <table className="attendance-daily-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>نام شاگرد</th>
                        <th>نام پدر</th>
                        <th>جنسیت</th>
                        <th>صنف</th>
                        <th>وضعیت</th>
                        <th>یادداشت</th>
                        <th>تاریخ ثبت</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, idx) => (
                        <tr key={row.student?._id || idx} className={isRowDirty(row) ? 'is-dirty' : ''}>
                          <td>{toFaNumber(idx + 1)}</td>
                          <td>{row.student?.admissionNo || '---'}</td>
                          <td>
                            <div className="attendance-student-cell">
                              <strong>{row.student?.name || '---'}</strong>
                              <span>{row.student?.grade || row.student?.email || 'شاگرد ثبت‌شده'}</span>
                            </div>
                          </td>
                          <td>{row.student?.fatherName || '---'}</td>
                          <td>{genderLabel(row.student?.gender)}</td>
                          <td>{selectedCourseLabel}</td>
                          <td>
                            <select
                              className={`attendance-status-select status-${row.status}`}
                              value={row.status}
                              onChange={(e) => updateRow(idx, { status: e.target.value })}
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="attendance-note-input"
                              type="text"
                              value={row.note}
                              placeholder="یادداشت اختیاری"
                              onChange={(e) => updateRow(idx, { note: e.target.value })}
                            />
                          </td>
                          <td>
                            <div className="attendance-recorded-cell">
                              <strong>{toFaDate(row.attendanceDate || date)}</strong>
                              <span>{row.recordedAt ? `آخرین ثبت: ${toFaDateTime(row.recordedAt)}` : 'ثبت نشده'}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              className="save"
                              type="button"
                              onClick={() => handleSave(row, idx)}
                              disabled={saving[idx] || !isRowDirty(row)}
                            >
                              {saving[idx] ? '...' : (isRowDirty(row) ? 'ثبت' : 'ثبت‌شده')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {scope === 'students' && view === 'course-report' && (
          <div className="attendance-view">
            {loadingClassReport && <div className="attendance-empty">در حال دریافت خلاصه صنف...</div>}
            {!loadingClassReport && !classReport && (
              <div className="attendance-empty">بازه تاریخ را انتخاب و خلاصه صنف را بارگذاری کنید.</div>
            )}

            {!loadingClassReport && classReport && (
              <>
                <div className="attendance-summary-grid">
                  <div className="attendance-summary-card accent">
                    <span>نرخ حضور</span>
                    <strong>{formatRate(classReport.summary?.attendanceRate)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>کل شاگردان</span>
                    <strong>{toFaNumber(classReport.summary?.totalStudents || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>شاگردان با رکورد</span>
                    <strong>{toFaNumber(classReport.summary?.recordedStudents || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>حاضر</span>
                    <strong>{toFaNumber(classReport.summary?.present || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>غیرحاضر</span>
                    <strong>{toFaNumber(classReport.summary?.absent || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card warning">
                    <span>مریض</span>
                    <strong>{toFaNumber(classReport.summary?.sick || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card info">
                    <span>رخصتی</span>
                    <strong>{toFaNumber(classReport.summary?.leave || 0)}</strong>
                  </div>
                </div>

                <div className="attendance-report-layout">
                  <section className="attendance-section wide">
                    <div className="attendance-section-head">
                      <div>
                        <h3>خلاصه ماهوار/بازه‌ای شاگردان</h3>
                        <p>{classReport.course?.title || 'صنف'} از {toFaDate(classReport.range?.from)} تا {toFaDate(classReport.range?.to)}</p>
                      </div>
                    </div>

                    {!classReport.students?.length && (
                      <div className="attendance-empty">برای این بازه، گزارشی ثبت نشده است.</div>
                    )}

                    {!!classReport.students?.length && (
                      <div className="attendance-report-table">
                        <div className="attendance-report-row head">
                          <span>شاگرد</span>
                          <span>حاضر</span>
                          <span>غیرحاضر</span>
                          <span>مریض</span>
                          <span>رخصتی</span>
                          <span>نرخ حضور</span>
                          <span>آخرین وضعیت</span>
                          <span>عملیات</span>
                        </div>
                        {classReport.students.map((item) => (
                          <div key={item.student?._id || item._id} className="attendance-report-row">
                            <div className="attendance-student">
                              <strong>{item.student?.name || '---'}</strong>
                              <span>{item.student?.admissionNo || item.student?.grade || item.student?.email || 'شاگرد'}</span>
                            </div>
                            <span>{toFaNumber(item.present || 0)}</span>
                            <span>{toFaNumber(item.absent || 0)}</span>
                            <span>{toFaNumber(item.sick || 0)}</span>
                            <span>{toFaNumber(item.leave || 0)}</span>
                            <span>{formatRate(item.attendanceRate)}</span>
                            <span>{item.lastStatus ? `${statusLabel(item.lastStatus)} - ${toFaDate(item.lastDate)}` : '---'}</span>
                            <button type="button" className="inline-btn" onClick={() => openStudentReport(item.student?._id)}>
                              گزارش شاگرد
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>خلاصه روزانه</h3>
                        <p>شکست روزانه حضور در بازه انتخاب‌شده</p>
                      </div>
                    </div>

                    {!classReport.byDate?.length && (
                      <div className="attendance-empty">برای این بازه، روز ثبت‌شده‌ای وجود ندارد.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(classReport.byDate || []).map((item) => (
                        <div key={item.date} className="attendance-breakdown-card">
                          <strong>{toFaDate(item.date)}</strong>
                          <div className="attendance-breakdown-meta">
                            <span>حاضر: {toFaNumber(item.present || 0)}</span>
                            <span>غیرحاضر: {toFaNumber(item.absent || 0)}</span>
                            <span>مریض: {toFaNumber(item.sick || 0)}</span>
                            <span>رخصتی: {toFaNumber(item.leave || 0)}</span>
                          </div>
                          <div className="attendance-breakdown-rate">نرخ حضور: {formatRate(item.attendanceRate)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {scope === 'students' && view === 'student-report' && (
          <div className="attendance-view">
            {loadingStudentReport && <div className="attendance-empty">در حال دریافت گزارش شاگرد...</div>}
            {!loadingStudentReport && !studentReport && (
              <div className="attendance-empty">شاگرد و بازه تاریخ را انتخاب و گزارش شاگرد را بارگذاری کنید.</div>
            )}

            {!loadingStudentReport && studentReport && (
              <>
                <div className="attendance-summary-grid">
                  <div className="attendance-summary-card accent">
                    <span>نرخ حضور</span>
                    <strong>{formatRate(studentReport.summary?.attendanceRate)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>کل رکوردها</span>
                    <strong>{toFaNumber(studentReport.summary?.totalRecords || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>رشته غیبت فعلی</span>
                    <strong>{toFaNumber(studentReport.summary?.currentAbsentStreak || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>حاضر</span>
                    <strong>{toFaNumber(studentReport.summary?.present || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>غیرحاضر</span>
                    <strong>{toFaNumber(studentReport.summary?.absent || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card warning">
                    <span>مریض</span>
                    <strong>{toFaNumber(studentReport.summary?.sick || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card info">
                    <span>رخصتی</span>
                    <strong>{toFaNumber(studentReport.summary?.leave || 0)}</strong>
                  </div>
                </div>

                <div className="attendance-report-layout">
                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>{studentReport.student?.name || 'شاگرد'}</h3>
                        <p>از {toFaDate(studentReport.range?.from)} تا {toFaDate(studentReport.range?.to)}</p>
                      </div>
                    </div>

                    {!studentReport.recent?.length && (
                      <div className="attendance-empty">برای این شاگرد رکوردی ثبت نشده است.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(studentReport.recent || []).map((item) => (
                        <div key={item._id || `${item.date}-${item.status}`} className="attendance-breakdown-card">
                          <strong>{toFaDate(item.date)}</strong>
                          <div className="attendance-breakdown-meta">
                            <span className={`attendance-pill ${normalizeAttendanceStatus(item.status)}`}>{statusLabel(item.status)}</span>
                            <span>{item.course?.title || 'صنف'}</span>
                          </div>
                          {!!item.note && <div className="attendance-breakdown-rate">یادداشت: {item.note}</div>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>تجمیع بر اساس صنف</h3>
                        <p>خلاصه حاضری شاگرد در صنف‌های درگیر</p>
                      </div>
                    </div>

                    {!studentReport.byCourse?.length && (
                      <div className="attendance-empty">خلاصه‌ای برای نمایش وجود ندارد.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(studentReport.byCourse || []).map((item) => (
                        <div key={item.course?._id || item._id} className="attendance-breakdown-card">
                          <strong>{item.course?.title || 'صنف'}</strong>
                          <div className="attendance-breakdown-meta">
                            <span>حاضر: {toFaNumber(item.present || 0)}</span>
                            <span>غیرحاضر: {toFaNumber(item.absent || 0)}</span>
                            <span>مریض: {toFaNumber(item.sick || 0)}</span>
                            <span>رخصتی: {toFaNumber(item.leave || 0)}</span>
                          </div>
                          <div className="attendance-breakdown-rate">نرخ حضور: {formatRate(item.attendanceRate)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {scope === 'employees' && view === 'entry' && (
          <div className="attendance-view">
            <div className="attendance-summary-grid">
              <div className="attendance-summary-card accent">
                <span>کل کارمندان</span>
                <strong>{toFaNumber(employeeDailySummary.total)}</strong>
              </div>
              <div className="attendance-summary-card">
                <span>ثبت‌شده</span>
                <strong>{toFaNumber(employeeDailySummary.recorded)}</strong>
              </div>
              <div className="attendance-summary-card warning">
                <span>در انتظار ثبت</span>
                <strong>{toFaNumber(employeeDailySummary.dirty)}</strong>
              </div>
              <div className="attendance-summary-card">
                <span>حاضر</span>
                <strong>{toFaNumber(employeeDailySummary.present)}</strong>
              </div>
              <div className="attendance-summary-card danger">
                <span>غیرحاضر</span>
                <strong>{toFaNumber(employeeDailySummary.absent)}</strong>
              </div>
              <div className="attendance-summary-card warning">
                <span>مریض</span>
                <strong>{toFaNumber(employeeDailySummary.sick)}</strong>
              </div>
              <div className="attendance-summary-card info">
                <span>رخصتی</span>
                <strong>{toFaNumber(employeeDailySummary.leave)}</strong>
              </div>
            </div>

            {loadingEmployeeEntry && <div className="attendance-empty">در حال دریافت جدول حاضری کارمندان...</div>}
            {!loadingEmployeeEntry && !employeeRows.length && (
              <div className="attendance-empty">برای این تاریخ، کارمند فعالی برای نمایش پیدا نشد.</div>
            )}

            {!loadingEmployeeEntry && !!employeeRows.length && (
              <div className="attendance-daily-shell">
                <div className="attendance-daily-table-wrap">
                  <table className="attendance-daily-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>نام کارمند</th>
                        <th>نام پدر</th>
                        <th>وظیفه</th>
                        <th>وضعیت کاری</th>
                        <th>وضعیت</th>
                        <th>یادداشت</th>
                        <th>تاریخ ثبت</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeRows.map((row, idx) => (
                        <tr key={row.employee?._id || idx} className={isRowDirty(row) ? 'is-dirty' : ''}>
                          <td>{toFaNumber(idx + 1)}</td>
                          <td>{row.employee?.employeeId || '---'}</td>
                          <td>
                            <div className="attendance-student-cell">
                              <strong>{row.employee?.name || '---'}</strong>
                              <span>{row.employee?.email || row.employee?.positionLabel || 'پرسونل مکتب'}</span>
                            </div>
                          </td>
                          <td>{row.employee?.fatherName || '---'}</td>
                          <td>{row.employee?.positionLabel || row.employee?.position || '---'}</td>
                          <td>{row.employee?.employmentStatusLabel || 'فعال'}</td>
                          <td>
                            <select
                              className={`attendance-status-select status-${row.status}`}
                              value={row.status}
                              onChange={(e) => updateEmployeeRow(idx, { status: e.target.value })}
                            >
                              {STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input
                              className="attendance-note-input"
                              type="text"
                              value={row.note}
                              placeholder="یادداشت اختیاری"
                              onChange={(e) => updateEmployeeRow(idx, { note: e.target.value })}
                            />
                          </td>
                          <td>
                            <div className="attendance-recorded-cell">
                              <strong>{toFaDate(row.attendanceDate || date)}</strong>
                              <span>{row.recordedAt ? `آخرین ثبت: ${toFaDateTime(row.recordedAt)}` : 'ثبت نشده'}</span>
                            </div>
                          </td>
                          <td>
                            <button
                              className="save"
                              type="button"
                              onClick={() => handleEmployeeSave(row, idx)}
                              disabled={employeeSaving[idx] || !isRowDirty(row)}
                            >
                              {employeeSaving[idx] ? '...' : (isRowDirty(row) ? 'ثبت' : 'ثبت‌شده')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {scope === 'employees' && view === 'course-report' && (
          <div className="attendance-view">
            {loadingEmployeeReport && <div className="attendance-empty">در حال دریافت خلاصه کارمندان...</div>}
            {!loadingEmployeeReport && !employeeReport && (
              <div className="attendance-empty">بازه تاریخ را انتخاب و خلاصه کارمندان را بارگذاری کنید.</div>
            )}

            {!loadingEmployeeReport && employeeReport && (
              <>
                <div className="attendance-summary-grid">
                  <div className="attendance-summary-card accent">
                    <span>نرخ حضور</span>
                    <strong>{formatRate(employeeReport.summary?.attendanceRate)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>کل کارمندان</span>
                    <strong>{toFaNumber(employeeReport.summary?.totalEmployees || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>کارمندان با رکورد</span>
                    <strong>{toFaNumber(employeeReport.summary?.recordedEmployees || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>حاضر</span>
                    <strong>{toFaNumber(employeeReport.summary?.present || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>غیرحاضر</span>
                    <strong>{toFaNumber(employeeReport.summary?.absent || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card warning">
                    <span>مریض</span>
                    <strong>{toFaNumber(employeeReport.summary?.sick || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card info">
                    <span>رخصتی</span>
                    <strong>{toFaNumber(employeeReport.summary?.leave || 0)}</strong>
                  </div>
                </div>

                <div className="attendance-report-layout">
                  <section className="attendance-section wide">
                    <div className="attendance-section-head">
                      <div>
                        <h3>خلاصه ماهوار/بازه‌ای کارمندان</h3>
                        <p>از {toFaDate(employeeReport.range?.from)} تا {toFaDate(employeeReport.range?.to)}</p>
                      </div>
                    </div>

                    {!employeeReport.employees?.length && (
                      <div className="attendance-empty">برای این بازه، گزارشی ثبت نشده است.</div>
                    )}

                    {!!employeeReport.employees?.length && (
                      <div className="attendance-report-table">
                        <div className="attendance-report-row head">
                          <span>کارمند</span>
                          <span>حاضر</span>
                          <span>غیرحاضر</span>
                          <span>مریض</span>
                          <span>رخصتی</span>
                          <span>نرخ حضور</span>
                          <span>آخرین وضعیت</span>
                          <span>عملیات</span>
                        </div>
                        {employeeReport.employees.map((item) => (
                          <div key={item.employee?._id || item._id} className="attendance-report-row">
                            <div className="attendance-student">
                              <strong>{item.employee?.name || '---'}</strong>
                              <span>{item.employee?.employeeId || item.employee?.positionLabel || 'کارمند'}</span>
                            </div>
                            <span>{toFaNumber(item.present || 0)}</span>
                            <span>{toFaNumber(item.absent || 0)}</span>
                            <span>{toFaNumber(item.sick || 0)}</span>
                            <span>{toFaNumber(item.leave || 0)}</span>
                            <span>{formatRate(item.attendanceRate)}</span>
                            <span>{item.lastStatus ? `${statusLabel(item.lastStatus)} - ${toFaDate(item.lastDate)}` : '---'}</span>
                            <button type="button" className="inline-btn" onClick={() => openEmployeeReport(item.employee?._id)}>
                              گزارش کارمند
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>خلاصه ماهوار</h3>
                        <p>تجمیع ماهانه حضور و غیاب کارمندان در بازه انتخاب‌شده</p>
                      </div>
                    </div>

                    {!employeeReport.byMonth?.length && (
                      <div className="attendance-empty">برای این بازه، ماه ثبت‌شده‌ای وجود ندارد.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(employeeReport.byMonth || []).map((item) => (
                        <div key={item.month} className="attendance-breakdown-card">
                          <strong>{toFaMonth(item.month)}</strong>
                          <div className="attendance-breakdown-meta">
                            <span>حاضر: {toFaNumber(item.present || 0)}</span>
                            <span>غیرحاضر: {toFaNumber(item.absent || 0)}</span>
                            <span>مریض: {toFaNumber(item.sick || 0)}</span>
                            <span>رخصتی: {toFaNumber(item.leave || 0)}</span>
                          </div>
                          <div className="attendance-breakdown-rate">نرخ حضور: {formatRate(item.attendanceRate)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}

        {scope === 'employees' && view === 'student-report' && (
          <div className="attendance-view">
            {loadingEmployeeDetailReport && <div className="attendance-empty">در حال دریافت گزارش کارمند...</div>}
            {!loadingEmployeeDetailReport && !employeeDetailReport && (
              <div className="attendance-empty">کارمند و بازه تاریخ را انتخاب و گزارش کارمند را بارگذاری کنید.</div>
            )}

            {!loadingEmployeeDetailReport && employeeDetailReport && (
              <>
                <div className="attendance-summary-grid">
                  <div className="attendance-summary-card accent">
                    <span>نرخ حضور</span>
                    <strong>{formatRate(employeeDetailReport.summary?.attendanceRate)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>کل رکوردها</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.totalRecords || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>رشته غیبت فعلی</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.currentAbsentStreak || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card">
                    <span>حاضر</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.present || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card danger">
                    <span>غیرحاضر</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.absent || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card warning">
                    <span>مریض</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.sick || 0)}</strong>
                  </div>
                  <div className="attendance-summary-card info">
                    <span>رخصتی</span>
                    <strong>{toFaNumber(employeeDetailReport.summary?.leave || 0)}</strong>
                  </div>
                </div>

                <div className="attendance-report-layout">
                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>{employeeDetailReport.employee?.name || 'کارمند'}</h3>
                        <p>از {toFaDate(employeeDetailReport.range?.from)} تا {toFaDate(employeeDetailReport.range?.to)}</p>
                      </div>
                    </div>

                    {!employeeDetailReport.recent?.length && (
                      <div className="attendance-empty">برای این کارمند رکوردی ثبت نشده است.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(employeeDetailReport.recent || []).map((item) => (
                        <div key={item._id || `${item.date}-${item.status}`} className="attendance-breakdown-card">
                          <strong>{toFaDate(item.date)}</strong>
                          <div className="attendance-breakdown-meta">
                            <span className={`attendance-pill ${normalizeAttendanceStatus(item.status)}`}>{statusLabel(item.status)}</span>
                            <span>{toFaMonth(item.month)}</span>
                          </div>
                          {!!item.note && <div className="attendance-breakdown-rate">یادداشت: {item.note}</div>}
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="attendance-section">
                    <div className="attendance-section-head">
                      <div>
                        <h3>تجمیع ماهوار</h3>
                        <p>خلاصه حاضری کارمند بر اساس ماه‌های بازه انتخاب‌شده</p>
                      </div>
                    </div>

                    {!employeeDetailReport.byMonth?.length && (
                      <div className="attendance-empty">خلاصه‌ای برای نمایش وجود ندارد.</div>
                    )}

                    <div className="attendance-breakdown-list">
                      {(employeeDetailReport.byMonth || []).map((item) => (
                        <div key={item.month} className="attendance-breakdown-card">
                          <strong>{toFaMonth(item.month)}</strong>
                          <div className="attendance-breakdown-meta">
                            <span>حاضر: {toFaNumber(item.present || 0)}</span>
                            <span>غیرحاضر: {toFaNumber(item.absent || 0)}</span>
                            <span>مریض: {toFaNumber(item.sick || 0)}</span>
                            <span>رخصتی: {toFaNumber(item.leave || 0)}</span>
                          </div>
                          <div className="attendance-breakdown-rate">نرخ حضور: {formatRate(item.attendanceRate)}</div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
