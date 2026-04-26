import React, { useEffect, useMemo, useState } from 'react';
import './RecordingsPage.css';

import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDate = (value) => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || '-';
};

const fileUrl = (value = '') => {
  const v = String(value || '');
  if (!v) return '';
  if (v.startsWith('http')) return v;
  return `${API_BASE}/${v.replace(/^\//, '')}`;
};

const getCompatCourseId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

const getCourseClassId = (item = {}) => (
  String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim()
);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || ''
);

const normalizeCourseOptions = (items = [], source = 'courseAccess') => items
  .map((item) => {
    if (source === 'schoolClass') {
      const classId = String(item?.id || item?._id || '').trim();
      return {
        ...item,
        classId: classId || null,
        courseId: String(item?.legacyCourseId || '').trim(),
        schoolClass: {
          _id: classId || null,
          id: classId || null,
          title: item?.title || ''
        }
      };
    }

    return {
      ...item,
      classId: String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim(),
      courseId: String(item?.courseId || item?._id || '').trim(),
      schoolClass: item?.schoolClass || null
    };
  })
  .filter((item) => item.courseId || item.classId);

const findCourseByCompatId = (items = [], compatCourseId = '') => (
  items.find((item) => String(getCompatCourseId(item)) === String(compatCourseId)) || null
);

export default function RecordingsPage() {
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
  const canManage = useMemo(() => ['admin', 'instructor'].includes(role), [role]);

  const [items, setItems] = useState([]);
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    courseId: '',
    title: '',
    sessionDate: '',
    description: '',
    file: null
  });

  const loadCourses = async () => {
    try {
      const endpoint = role === 'admin'
        ? '/api/education/school-classes?status=active'
        : role === 'instructor'
          ? '/api/education/instructor/courses'
          : '/api/education/my-courses';
      const source = role === 'admin' ? 'schoolClass' : 'courseAccess';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setCourses([]);
        setCourseFilter('');
        setForm((prev) => ({ ...prev, courseId: '' }));
        return;
      }

      const nextCourses = normalizeCourseOptions(data?.items || [], source);
      setCourses(nextCourses);
      setCourseFilter((prev) => (
        nextCourses.some((course) => String(getCompatCourseId(course)) === String(prev))
          ? prev
          : ''
      ));
      setForm((prev) => {
        if (nextCourses.some((course) => String(getCompatCourseId(course)) === String(prev.courseId))) {
          return prev;
        }

        return {
          ...prev,
          courseId: getCompatCourseId(nextCourses[0]) || ''
        };
      });
    } catch {
      setCourses([]);
      setCourseFilter('');
      setForm((prev) => ({ ...prev, courseId: '' }));
    }
  };

  const loadItems = async (selectedCourse = courseFilter) => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      const selectedCourseItem = findCourseByCompatId(courses, selectedCourse);
      const classId = getCourseClassId(selectedCourseItem);
      const compatCourseId = getCompatCourseId(selectedCourseItem) || String(selectedCourse || '').trim();

      if (classId) params.set('classId', classId);
      if (compatCourseId) params.set('courseId', compatCourseId);

      const res = await fetch(`${API_BASE}/api/recordings${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setItems([]);
        setMessage(data?.message || 'خطا در دریافت ضبط جلسات');
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [canManage]);

  useEffect(() => {
    loadItems(courseFilter);
  }, [courseFilter, courses]);

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      courseId: getCompatCourseId(courses[0]) || '',
      title: '',
      sessionDate: '',
      description: '',
      file: null
    });
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canManage) return;
    if (!form.courseId || !form.title.trim() || !form.file) {
      setMessage('صنف، عنوان و فایل ضبط الزامی است');
      return;
    }

    const selectedCourse = findCourseByCompatId(courses, form.courseId);
    const classId = getCourseClassId(selectedCourse);
    const compatCourseId = getCompatCourseId(selectedCourse) || String(form.courseId || '').trim();

    setSaving(true);
    setMessage('');
    try {
      const payload = new FormData();
      if (classId) payload.append('classId', classId);
      if (compatCourseId) payload.append('courseId', compatCourseId);
      payload.append('title', form.title.trim());
      payload.append('sessionDate', form.sessionDate || '');
      payload.append('description', form.description || '');
      payload.append('file', form.file);

      const res = await fetch(`${API_BASE}/api/recordings`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: payload
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ثبت ضبط جلسه ناموفق بود');
        return;
      }
      setMessage('ضبط جلسه با موفقیت ثبت شد');
      resetForm();
      await loadItems(courseFilter);
    } catch {
      setMessage('خطا در ثبت ضبط جلسه');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!canManage || !id) return;
    const ok = window.confirm('این فایل ضبط حذف شود؟');
    if (!ok) return;
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/recordings/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'حذف ضبط جلسه ناموفق بود');
        return;
      }
      setMessage('ضبط جلسه حذف شد');
      await loadItems(courseFilter);
    } catch {
      setMessage('خطا در حذف ضبط جلسه');
    }
  };

  return (
    <div className="recordings-page">
      <div className="recordings-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <h2>آرشیف ضبط جلسات</h2>
        <p>جلسات آنلاین هر صنف را دانلود یا مشاهده کنید. شاگرد فقط صنف‌های تاییدشده خود را می‌بیند.</p>

        <div className="recordings-toolbar">
          <label htmlFor="recordings-filter-course">فیلتر صنف</label>
          <select
            id="recordings-filter-course"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">همه صنف‌ها</option>
            {courses.map((course) => (
              <option key={getCompatCourseId(course) || getCourseClassId(course) || course._id} value={getCompatCourseId(course) || getCourseClassId(course) || course._id}>{getCourseLabel(course)}</option>
            ))}
          </select>
          <button type="button" className="recordings-refresh" onClick={() => loadItems(courseFilter)}>بروزرسانی</button>
        </div>

        {canManage && (
          <form className="recordings-form" onSubmit={handleCreate}>
            <h3>افزودن ضبط جدید</h3>
            <div className="recordings-grid">
              <div>
                <label>صنف</label>
                <select
                  value={form.courseId}
                  onChange={(e) => handleFormChange('courseId', e.target.value)}
                  required
                >
                  <option value="">انتخاب صنف</option>
                  {courses.map((course) => (
                    <option key={getCompatCourseId(course) || getCourseClassId(course) || course._id} value={getCompatCourseId(course) || getCourseClassId(course) || course._id}>{getCourseLabel(course)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>عنوان جلسه</label>
                <input
                  value={form.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="مثال: جلسه چهارم ریاضی"
                  required
                />
              </div>
              <div>
                <label>تاریخ جلسه</label>
                <input
                  type="datetime-local"
                  value={form.sessionDate}
                  onChange={(e) => handleFormChange('sessionDate', e.target.value)}
                />
              </div>
              <div>
                <label>فایل ضبط</label>
                <input
                  type="file"
                  accept=".mp4,.mov,.mkv,.webm,.mp3,.m4a,.wav,.pdf"
                  onChange={(e) => handleFormChange('file', e.target.files?.[0] || null)}
                  required
                />
              </div>
              <div className="recordings-full">
                <label>توضیحات</label>
                <textarea
                  rows="3"
                  value={form.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="توضیح کوتاه درباره محتوای جلسه"
                />
              </div>
            </div>
            <button type="submit" className="recordings-submit" disabled={saving}>
              {saving ? 'در حال ذخیره...' : 'ثبت ضبط جلسه'}
            </button>
          </form>
        )}

        {!!message && <div className="recordings-message">{message}</div>}
        {loading && <div className="recordings-empty">در حال دریافت...</div>}
        {!loading && !items.length && <div className="recordings-empty">فایل ضبطی موجود نیست.</div>}

        <div className="recordings-list">
          {items.map((item) => (
            <article key={item._id} className="recordings-item">
              <div className="recordings-item-head">
                <h4>{item.title}</h4>
                <span>{item.schoolClass?.title || item.course?.title || 'صنف'}</span>
              </div>
              <p>{item.description || 'بدون توضیحات'}</p>
              <div className="recordings-meta">
                <span>تاریخ جلسه: {formatDate(item.sessionDate)}</span>
                <span>ثبت‌کننده: {item.createdBy?.name || '-'}</span>
              </div>
              <div className="recordings-actions">
                <a href={fileUrl(item.fileUrl)} target="_blank" rel="noreferrer">مشاهده / دانلود</a>
                {canManage && (
                  <button type="button" onClick={() => handleDelete(item._id)}>حذف</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
