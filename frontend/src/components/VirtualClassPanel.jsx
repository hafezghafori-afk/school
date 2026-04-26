import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { formatAfghanDateTime, toGregorianDateTimeInputValue } from '../utils/afghanDate';

const providerLabels = {
  manual: 'لینک دستی',
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  jitsi: 'Jitsi',
  teams: 'Teams',
  other: 'سایر'
};

const sessionStatusMeta = {
  live: { label: 'در حال برگزاری', tone: 'live' },
  scheduled: { label: 'زمان‌بندی‌شده', tone: 'scheduled' },
  ended: { label: 'پایان‌یافته', tone: 'ended' }
};

const emptySessionForm = {
  courseId: '',
  title: '',
  provider: 'manual',
  scheduledAt: '',
  meetingUrl: '',
  accessCode: '',
  description: ''
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getCompatCourseId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

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

const getScopeValue = (item = {}) => getCourseClassId(item) || getCompatCourseId(item);

const getSelectionValue = (item = {}) => getCompatCourseId(item) || getCourseClassId(item);

const findCourseBySelection = (items = [], selection = '') => (
  items.find((item) => {
    const target = String(selection || '').trim();
    if (!target) return false;

    return [
      getSelectionValue(item),
      getScopeValue(item),
      item?._id,
      item?.id
    ]
      .filter(Boolean)
      .some((value) => String(value) === target);
  }) || null
);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || 'صنف'
);

const normalizeCourseOptions = (items = [], source = 'courseAccess') => items
  .map((item) => {
    if (source === 'schoolClass') {
      return {
        ...item,
        classId: String(item?.id || item?._id || '').trim(),
        courseId: String(item?.legacyCourseId || '').trim(),
        schoolClass: {
          _id: item?.id || item?._id || null,
          id: item?.id || item?._id || null,
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
  .filter((item) => getScopeValue(item) || getSelectionValue(item));

const toDateTime = (value) => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const toDateTimeInput = (value) => {
  return toGregorianDateTimeInputValue(value);
};

const sortSessionItems = (items = []) => {
  const rank = { live: 0, scheduled: 1, ended: 2 };
  return [...items].sort((a, b) => {
    const leftRank = rank[a?.status] ?? 99;
    const rightRank = rank[b?.status] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;

    const leftDate = new Date(a?.scheduledAt || 0).getTime();
    const rightDate = new Date(b?.scheduledAt || 0).getTime();
    if (leftRank === 2) return rightDate - leftDate;
    return leftDate - rightDate;
  });
};

const buildSessionSummary = (items = []) => items.reduce((summary, item) => {
  summary.total += 1;
  if (item.status === 'live') summary.live += 1;
  if (item.status === 'scheduled') summary.scheduled += 1;
  if (item.status === 'ended') summary.ended += 1;

  const now = new Date();
  const target = new Date(item.scheduledAt || 0);
  if (
    !Number.isNaN(target.getTime())
    && target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate()
  ) {
    summary.today += 1;
  }

  return summary;
}, { total: 0, live: 0, scheduled: 0, ended: 0, today: 0 });

const upsertSession = (items = [], item = null) => {
  if (!item?._id) return items;
  return sortSessionItems([item, ...items.filter((row) => String(row._id) !== String(item._id))]);
};

const removeSession = (items = [], id = '') => items.filter((item) => String(item._id) !== String(id));

export default function VirtualClassPanel({ role = 'student' }) {
  const canManageVirtual = ['admin', 'instructor'].includes(role);

  const [sessions, setSessions] = useState([]);
  const [summary, setSummary] = useState({ total: 0, live: 0, scheduled: 0, ended: 0, today: 0 });
  const [courses, setCourses] = useState([]);
  const [courseFilter, setCourseFilter] = useState('');
  const [form, setForm] = useState(emptySessionForm);
  const [editingSessionId, setEditingSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');

  const loadCourses = async () => {
    if (!canManageVirtual) {
      setCourses([]);
      return;
    }

    try {
      const isInstructor = role === 'instructor';
      const target = `${API_BASE}${isInstructor ? '/api/education/instructor/courses' : '/api/education/school-classes?status=active'}`;
      const res = await fetch(target, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      const nextCourses = normalizeCourseOptions(data?.items || [], isInstructor ? 'courseAccess' : 'schoolClass');
      setCourses(nextCourses);
      setForm((prev) => ({
        ...prev,
        courseId: prev.courseId || getSelectionValue(nextCourses[0]) || getScopeValue(nextCourses[0]) || ''
      }));
    } catch {
      setCourses([]);
    }
  };

  const loadSessions = async (selectedCourse = courseFilter) => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (selectedCourse) {
        const selectedItem = findCourseBySelection(courses, selectedCourse) || findCourseBySelection(courseOptions, selectedCourse);
        const selectedClassId = getCourseClassId(selectedItem);
        const selectedCompatCourseId = getCompatCourseId(selectedItem);
        if (selectedClassId) params.set('classId', selectedClassId);
        else if (selectedCompatCourseId) params.set('courseId', selectedCompatCourseId);
      }

      const res = await fetch(`${API_BASE}/api/virtual-classes${params.toString() ? `?${params.toString()}` : ''}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setSessions([]);
        setSummary(buildSessionSummary([]));
        setMessage(data?.message || 'خطا در دریافت جلسات آنلاین');
        return;
      }

      const items = sortSessionItems(Array.isArray(data?.items) ? data.items : []);
      setSessions(items);
      setSummary(data?.summary || buildSessionSummary(items));
    } catch {
      setSessions([]);
      setSummary(buildSessionSummary([]));
      setMessage('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, [canManageVirtual, role]);

  useEffect(() => {
    loadSessions(courseFilter);
  }, [courseFilter]);

  const courseOptions = useMemo(() => {
    const source = courses.length ? courses : sessions.map((item) => item.course).filter(Boolean);
    const map = new Map();
    source.forEach((course) => {
      const dedupeKey = getScopeValue(course) || getSelectionValue(course);
      const selectionValue = getSelectionValue(course) || dedupeKey;
      if (!dedupeKey || map.has(String(dedupeKey))) return;
      map.set(String(dedupeKey), {
        _id: selectionValue,
        classId: getCourseClassId(course) || null,
        courseId: getCompatCourseId(course) || null,
        title: getCourseLabel(course),
        category: course.category || ''
      });
    });
    return Array.from(map.values());
  }, [courses, sessions]);

  const handleFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setEditingSessionId('');
    setForm(emptySessionForm);
  };

  const handleEdit = (item) => {
    setEditingSessionId(item._id);
    setForm({
      courseId: getSelectionValue(item) || item.classId || item.course?.schoolClassRef || item.course?._id || '',
      title: item.title || '',
      provider: item.provider || 'manual',
      scheduledAt: toDateTimeInput(item.scheduledAt),
      meetingUrl: item.meetingUrl || '',
      accessCode: item.accessCode || '',
      description: item.description || ''
    });
    document.querySelector('.chat-session-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canManageVirtual) return;

    if (!form.courseId || !form.title.trim() || !form.meetingUrl.trim() || !form.scheduledAt) {
      setMessage('صنف، عنوان، لینک جلسه و زمان برگزاری الزامی است.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const selectedCourse = findCourseBySelection(courses, form.courseId) || findCourseBySelection(courseOptions, form.courseId);
      const target = editingSessionId
        ? `${API_BASE}/api/virtual-classes/${editingSessionId}`
        : `${API_BASE}/api/virtual-classes`;
      const method = editingSessionId ? 'PUT' : 'POST';

      const res = await fetch(target, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          ...form,
          classId: getCourseClassId(selectedCourse) || '',
          courseId: getCompatCourseId(selectedCourse) || '',
          title: form.title.trim(),
          meetingUrl: form.meetingUrl.trim(),
          accessCode: form.accessCode.trim(),
          description: form.description.trim()
        })
      });
      const data = await res.json();
      if (!data?.success || !data?.item) {
        setMessage(data?.message || 'ذخیره جلسه ناموفق بود.');
        return;
      }

      setSessions((prev) => upsertSession(prev, data.item));
      setMessage(editingSessionId ? 'جلسه آنلاین ویرایش شد.' : 'جلسه آنلاین ثبت شد.');
      resetForm();
      await loadSessions(courseFilter);
    } catch {
      setMessage('خطا در ذخیره جلسه آنلاین');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (item, action) => {
    if (!item?._id) return;
    if (action === 'delete' && !window.confirm('این جلسه حذف شود؟')) return;

    setActionId(item._id);
    setMessage('');
    try {
      const target = action === 'start'
        ? `${API_BASE}/api/virtual-classes/${item._id}/start`
        : action === 'end'
          ? `${API_BASE}/api/virtual-classes/${item._id}/end`
          : `${API_BASE}/api/virtual-classes/${item._id}`;
      const res = await fetch(target, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'انجام عملیات ناموفق بود.');
        return;
      }

      if (action === 'delete') {
        setSessions((prev) => removeSession(prev, item._id));
      } else if (data?.item) {
        setSessions((prev) => upsertSession(prev, data.item));
      }

      setMessage(action === 'start' ? 'جلسه آغاز شد.' : action === 'end' ? 'جلسه ختم شد.' : 'جلسه حذف شد.');
      await loadSessions(courseFilter);
    } catch {
      setMessage('خطا در انجام عملیات جلسه آنلاین');
    } finally {
      setActionId('');
    }
  };

  return (
    <section className="virtual-layout">
      <aside className="virtual-sidebar">
        <div className="virtual-summary-grid">
          <article className="virtual-summary-card live">
            <span>صنف‌های آنلاین</span>
            <strong>{Number(summary.live || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="virtual-summary-card">
            <span>امروز</span>
            <strong>{Number(summary.today || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="virtual-summary-card">
            <span>زمان‌بندی‌شده</span>
            <strong>{Number(summary.scheduled || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="virtual-summary-card ended">
            <span>پایان‌یافته</span>
            <strong>{Number(summary.ended || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
        </div>

        <div className="virtual-toolbar">
          <div>
            <label htmlFor="virtual-course-filter">فیلتر صنف</label>
            <select id="virtual-course-filter" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="">همه صنف‌ها</option>
              {courseOptions.map((course) => (
                <option key={course._id} value={course._id}>{course.title}</option>
              ))}
            </select>
          </div>
          <div className="virtual-toolbar-actions">
            <button type="button" className="chat-refresh" onClick={() => loadSessions(courseFilter)}>بروزرسانی</button>
            <a className="virtual-link-btn" href="/recordings">آرشیف ضبط جلسات</a>
          </div>
        </div>

        {canManageVirtual && (
          <form className="chat-session-form" onSubmit={handleSubmit}>
            <div className="section-head">
              <div>
                <h3>{editingSessionId ? 'ویرایش جلسه آنلاین' : 'ایجاد جلسه آنلاین'}</h3>
                <p>برای هر صنف لینک رسمی جلسه را ثبت کنید تا شاگرد و استاد به‌صورت مستقیم آن را ببینند.</p>
              </div>
              {editingSessionId && (
                <button type="button" className="ghost-btn" onClick={resetForm}>لغو ویرایش</button>
              )}
            </div>

            <div className="chat-session-grid">
              <label>
                <span>صنف</span>
                <select value={form.courseId} onChange={(event) => handleFormChange('courseId', event.target.value)} required>
                  <option value="">انتخاب صنف</option>
                  {courses.map((course) => (
                    <option key={getSelectionValue(course) || getScopeValue(course) || course._id} value={getSelectionValue(course) || getScopeValue(course) || course._id}>{getCourseLabel(course)}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>عنوان جلسه</span>
                <input value={form.title} onChange={(event) => handleFormChange('title', event.target.value)} placeholder="مثال: جلسه چهارم ریاضی" required />
              </label>

              <label>
                <span>زمان برگزاری</span>
                <input type="datetime-local" value={form.scheduledAt} onChange={(event) => handleFormChange('scheduledAt', event.target.value)} required />
              </label>

              <label>
                <span>ارائه‌دهنده</span>
                <select value={form.provider} onChange={(event) => handleFormChange('provider', event.target.value)}>
                  {Object.entries(providerLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>

              <label className="full">
                <span>لینک جلسه</span>
                <input type="url" value={form.meetingUrl} onChange={(event) => handleFormChange('meetingUrl', event.target.value)} placeholder="https://meet.google.com/..." required />
              </label>

              <label>
                <span>کد دسترسی</span>
                <input value={form.accessCode} onChange={(event) => handleFormChange('accessCode', event.target.value)} placeholder="اختیاری" />
              </label>

              <label className="full">
                <span>توضیحات</span>
                <textarea rows="3" value={form.description} onChange={(event) => handleFormChange('description', event.target.value)} placeholder="توضیح کوتاه درباره جلسه، موضوع یا یادآوری قبل از شروع" />
              </label>
            </div>

            <div className="chat-session-actions">
              <button type="submit" disabled={saving}>{saving ? 'در حال ذخیره...' : editingSessionId ? 'ذخیره ویرایش' : 'ثبت جلسه آنلاین'}</button>
            </div>
          </form>
        )}

        {message && <div className="chat-empty">{message}</div>}
      </aside>

      <div className="virtual-main">
        {loading && <div className="chat-empty">در حال دریافت جلسات آنلاین...</div>}
        {!loading && !sessions.length && <div className="chat-empty">جلسه آنلاینی برای این فیلتر ثبت نشده است.</div>}

        <div className="virtual-session-list">
          {sessions.map((item) => {
            const statusMeta = sessionStatusMeta[item.status] || sessionStatusMeta.scheduled;
            const isBusy = actionId === item._id;
            return (
              <article key={item._id} className="virtual-session-card">
                <div className="virtual-session-head">
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.course?.title || 'صنف'}{item.course?.category ? ` | ${item.course.category}` : ''}</p>
                  </div>
                  <span className={`status-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
                </div>

                <div className="virtual-session-meta">
                  <span>زمان: {toDateTime(item.scheduledAt) || '---'}</span>
                  <span>ارائه‌دهنده: {providerLabels[item.provider] || providerLabels.manual}</span>
                  <span>ثبت‌کننده: {item.createdBy?.name || '-'}</span>
                </div>

                {item.description && <p className="virtual-session-description">{item.description}</p>}

                {item.accessCode && (
                  <div className="virtual-session-code">
                    <span>کد دسترسی</span>
                    <strong>{item.accessCode}</strong>
                  </div>
                )}

                <div className="virtual-session-actions">
                  <a href={item.meetingUrl} target="_blank" rel="noreferrer">ورود به جلسه</a>
                  {canManageVirtual && (
                    <>
                      <button type="button" className="ghost-btn" onClick={() => handleEdit(item)}>ویرایش</button>
                      {item.status !== 'live' ? (
                        <button type="button" className="ghost-btn" onClick={() => handleAction(item, 'start')} disabled={isBusy}>{isBusy ? '...' : 'شروع'}</button>
                      ) : (
                        <button type="button" className="ghost-btn" onClick={() => handleAction(item, 'end')} disabled={isBusy}>{isBusy ? '...' : 'ختم'}</button>
                      )}
                      <button type="button" className="danger-btn" onClick={() => handleAction(item, 'delete')} disabled={isBusy}>{isBusy ? '...' : 'حذف'}</button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
