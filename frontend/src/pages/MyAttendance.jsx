import React, { useEffect, useMemo, useState } from 'react';
import './MyAttendance.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const STATUS_OPTIONS = [
  { value: 'all', label: 'همه وضعیت‌ها' },
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

const todayInputValue = () => {
  return toGregorianDateInputValue(new Date());
};

const shiftInputDate = (days = 0) => {
  const today = new Date();
  today.setDate(today.getDate() + Number(days || 0));
  return toGregorianDateInputValue(today);
};

const toFaDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '-';
};

const normalizeAttendanceStatus = (value = '') => STATUS_ALIASES[String(value || '').trim().toLowerCase()] || 'present';

const statusLabel = (value) => STATUS_OPTIONS.find((item) => item.value === normalizeAttendanceStatus(value))?.label || '---';

const getCourseClassId = (item = {}) => (
  String(
    item?.classId
    || item?.schoolClass?._id
    || item?.schoolClass?.id
    || item?.schoolClassRef?._id
    || item?.schoolClassRef
    || ''
  ).trim()
);

const getCourseCompatId = (item = {}) => (
  String(item?._id || item?.courseId || item?.legacyCourseId || '').trim()
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

const formatRate = (value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')}%`;

export default function MyAttendance() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [range, setRange] = useState({ from: shiftInputDate(-29), to: todayInputValue() });
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const selectedCourse = useMemo(() => findCourseBySelection(courses, courseId), [courses, courseId]);
  const selectedClassId = getCourseClassId(selectedCourse);
  const selectedCompatCourseId = getCourseCompatId(selectedCourse);

  const loadCourses = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      setCourses([]);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/education/my-courses`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setCourses([]);
        return;
      }

      const items = (data.items || []).filter((course) => getCourseSelectionId(course) || course?._id);
      setCourses(items);
      setCourseId((prev) => prev || getCourseSelectionId(items[0]) || items[0]?._id || '');
    } catch {
      setCourses([]);
    }
  };

  const loadAttendance = async () => {
    setLoading(true);
    setMessage('');

    try {
      const query = new URLSearchParams();
      if (selectedClassId) query.set('classId', selectedClassId);
      else if (selectedCompatCourseId) query.set('courseId', selectedCompatCourseId);
      if (range.from && range.to) {
        query.set('from', range.from);
        query.set('to', range.to);
      }

      const res = await fetch(`${API_BASE}/api/attendance/my${query.toString() ? `?${query.toString()}` : ''}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت حضور و غیاب');
        setItems([]);
        return;
      }

      setItems(data.items || []);
    } catch {
      setMessage('خطا در ارتباط با سرور');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
    loadAttendance();
  }, []);

  const filteredItems = useMemo(() => (
    statusFilter === 'all'
      ? items
      : items.filter((item) => normalizeAttendanceStatus(item.status) === statusFilter)
  ), [items, statusFilter]);

  const summary = useMemo(() => {
    const result = {
      total: filteredItems.length,
      present: 0,
      absent: 0,
      sick: 0,
      leave: 0,
      attendanceRate: 0
    };

    filteredItems.forEach((item) => {
      const normalizedStatus = normalizeAttendanceStatus(item.status);
      result[normalizedStatus] = Number(result[normalizedStatus] || 0) + 1;
    });

    result.attendanceRate = result.total
      ? Number(((Number(result.present || 0) / result.total) * 100).toFixed(1))
      : 0;

    return result;
  }, [filteredItems]);

  return (
    <div className="myattendance-page">
      <div className="myattendance-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>حضور و غیاب من</h2>
        <p>وضعیت حضور و غیاب را با فیلتر صنف، تاریخ و وضعیت دنبال کنید.</p>

        <div className="myattendance-toolbar">
          <div className="myattendance-filters">
            <label>
              <span>صنف</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="">همه صنف‌ها</option>
                {courses.map((course) => (
                  <option key={getCourseSelectionId(course) || course._id} value={getCourseSelectionId(course) || course._id}>
                    {getCourseLabel(course)}
                  </option>
                ))}
              </select>
            </label>

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

            <label>
              <span>وضعیت</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="myattendance-actions">
            <button type="button" onClick={loadAttendance} disabled={loading}>
              {loading ? 'در حال دریافت...' : 'اعمال فیلتر'}
            </button>
          </div>
        </div>

        <div className="myattendance-summary-grid">
          <div className="myattendance-summary-card accent">
            <span>نرخ حضور</span>
            <strong>{formatRate(summary.attendanceRate)}</strong>
          </div>
          <div className="myattendance-summary-card">
            <span>کل رکوردها</span>
            <strong>{summary.total.toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
          <div className="myattendance-summary-card">
            <span>حاضر</span>
            <strong>{summary.present.toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
          <div className="myattendance-summary-card danger">
            <span>غیرحاضر</span>
            <strong>{summary.absent.toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
          <div className="myattendance-summary-card">
            <span>مریض</span>
            <strong>{summary.sick.toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
          <div className="myattendance-summary-card">
            <span>رخصتی</span>
            <strong>{summary.leave.toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
        </div>

        {loading && <div className="myattendance-empty">در حال دریافت...</div>}
        {!!message && <div className="myattendance-empty">{message}</div>}
        {!loading && !filteredItems.length && (
          <div className="myattendance-empty">رکوردی مطابق فیلتر فعلی ثبت نشده است.</div>
        )}

        <div className="myattendance-list">
          {filteredItems.map((item) => (
            <div key={item._id} className="myattendance-item">
              <div className="myattendance-head">
                <div>
                  <strong>{item.course?.title || 'صنف نامشخص'}</strong>
                  <div className="meta">{toFaDate(item.date)}</div>
                </div>
                <span className={`myattendance-pill ${item.status || ''}`}>{statusLabel(item.status)}</span>
              </div>

              <div className="details">
                <span>بخش: {item.course?.category || '---'}</span>
                <span>تاریخ ثبت: {toFaDate(item.createdAt || item.date)}</span>
              </div>

              {item.note && <div className="note">یادداشت: {item.note}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
