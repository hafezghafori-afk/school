import React, { useEffect, useMemo, useState } from 'react';
import './HomeworkManager.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const emptyForm = {
  title: '',
  description: '',
  dueDate: '',
  maxScore: 100,
  attachment: null
};

const toDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const toInputDate = (value) => {
  return toGregorianDateInputValue(value);
};

const getCompatCourseId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

const getCourseClassId = (item = {}) => (
  String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim()
);

const getScopeValue = (item = {}) => (
  getCourseClassId(item) || getCompatCourseId(item)
);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || ''
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
  .filter((item) => item.classId);

export default function HomeworkManager() {
  const [view, setView] = useState('create');
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingHomework, setSavingHomework] = useState(false);
  const [deletingHomeworkId, setDeletingHomeworkId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formFileKey, setFormFileKey] = useState(0);
  const [editingHomeworkId, setEditingHomeworkId] = useState('');
  const [selectedReviewHomeworkId, setSelectedReviewHomeworkId] = useState('');
  const [submissions, setSubmissions] = useState({});
  const [loadingSubmissionsId, setLoadingSubmissionsId] = useState('');
  const [grading, setGrading] = useState({});
  const [gradingBusyId, setGradingBusyId] = useState('');

  const selectedReviewHomework = useMemo(
    () => items.find((item) => String(item._id) === String(selectedReviewHomeworkId)) || null,
    [items, selectedReviewHomeworkId]
  );

  const selectedReviewSubmissions = useMemo(
    () => submissions[selectedReviewHomeworkId] || [],
    [submissions, selectedReviewHomeworkId]
  );

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
      const nextCourses = normalizeCourseOptions(data?.items || [], isInstructor ? 'courseAccess' : 'schoolClass');
      setCourses(nextCourses);
      setCourseId((prev) => {
        if (nextCourses.some((course) => String(getScopeValue(course)) === String(prev))) {
          return prev;
        }
        return getScopeValue(nextCourses[0]);
      });
    } catch {
      setCourses([]);
    }
  };

  const loadHomeworks = async (targetCourseId) => {
    if (!targetCourseId) {
      setItems([]);
      setSelectedReviewHomeworkId('');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const selectedCourse = courses.find((item) => String(getScopeValue(item)) === String(targetCourseId)) || null;
      const classId = getCourseClassId(selectedCourse);
      const routePath = classId ? `/api/homeworks/class/${classId}` : '';

      if (!routePath) {
        setItems([]);
        setSelectedReviewHomeworkId('');
        setMessage('This class is missing a canonical reference.');
        return;
      }

      const res = await fetch(`${API_BASE}${routePath}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      const nextItems = data?.items || [];
      setItems(nextItems);
      setSelectedReviewHomeworkId((prev) => (
        nextItems.some((item) => String(item._id) === String(prev))
          ? prev
          : (nextItems[0]?._id || '')
      ));
      if (editingHomeworkId && !nextItems.some((item) => String(item._id) === String(editingHomeworkId))) {
        setEditingHomeworkId('');
        setForm(emptyForm);
        setFormFileKey((prev) => prev + 1);
      }
    } catch {
      setMessage('خطا در دریافت کارخانگی');
      setItems([]);
      setSelectedReviewHomeworkId('');
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async (homeworkId, { force = false } = {}) => {
    if (!homeworkId) return;
    if (!force && submissions[homeworkId]) return;

    setLoadingSubmissionsId(homeworkId);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/homeworks/${homeworkId}/submissions`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      setSubmissions((prev) => ({ ...prev, [homeworkId]: data?.items || [] }));
    } catch {
      setSubmissions((prev) => ({ ...prev, [homeworkId]: [] }));
      setMessage('خطا در دریافت تحویل‌ها');
    } finally {
      setLoadingSubmissionsId('');
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    setSubmissions({});
    setGrading({});
    setEditingHomeworkId('');
    setForm(emptyForm);
    setFormFileKey((prev) => prev + 1);
    loadHomeworks(courseId);
  }, [courseId]);

  useEffect(() => {
    if (view !== 'review' || !selectedReviewHomeworkId) return;
    loadSubmissions(selectedReviewHomeworkId);
  }, [view, selectedReviewHomeworkId]);

  const resetForm = () => {
    setEditingHomeworkId('');
    setForm(emptyForm);
    setFormFileKey((prev) => prev + 1);
  };

  const handleSaveHomework = async () => {
    if (!courseId || !form.title.trim()) {
      setMessage('عنوان و صنف الزامی است.');
      return;
    }

    setSavingHomework(true);
    setMessage('');
    try {
      const selectedCourse = courses.find((item) => String(getScopeValue(item)) === String(courseId)) || null;
      const classId = getCourseClassId(selectedCourse);
      const compatCourseId = getCompatCourseId(selectedCourse);
      if (!classId) {
        setMessage('Canonical class mapping is required before saving homework.');
        return;
      }

      const body = new FormData();
      body.append('classId', classId);
      if (compatCourseId) body.append('courseId', compatCourseId);
      body.append('title', form.title.trim());
      body.append('description', form.description);
      body.append('dueDate', form.dueDate);
      body.append('maxScore', form.maxScore);
      if (form.attachment) body.append('attachment', form.attachment);

      const isEditing = Boolean(editingHomeworkId);
      const res = await fetch(
        `${API_BASE}/api/homeworks/${isEditing ? editingHomeworkId : 'create'}`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { ...getAuthHeaders() },
          body
        }
      );
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || (isEditing ? 'ویرایش کارخانگی ناموفق بود.' : 'ثبت کارخانگی ناموفق بود.'));
        return;
      }

      const savedHomeworkId = data?.homework?._id || '';
      setMessage(isEditing ? 'کارخانگی ویرایش شد.' : 'کارخانگی ایجاد شد.');
      resetForm();
      if (savedHomeworkId) {
        setSelectedReviewHomeworkId(savedHomeworkId);
      }
      await loadHomeworks(courseId);
    } catch {
      setMessage(editingHomeworkId ? 'خطا در ویرایش کارخانگی' : 'خطا در ثبت کارخانگی');
    } finally {
      setSavingHomework(false);
    }
  };

  const handleDeleteHomework = async (id) => {
    if (!id) return;
    const ok = window.confirm('این کارخانگی حذف شود؟');
    if (!ok) return;

    setDeletingHomeworkId(id);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/homeworks/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json().catch(() => ({ success: res.ok }));
      if (!res.ok || data?.success === false) {
        setMessage(data?.message || 'حذف کارخانگی ناموفق بود.');
        return;
      }

      setMessage('کارخانگی حذف شد.');
      setSubmissions((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (String(editingHomeworkId) === String(id)) {
        resetForm();
      }
      await loadHomeworks(courseId);
    } catch {
      setMessage('خطا در حذف کارخانگی');
    } finally {
      setDeletingHomeworkId('');
    }
  };

  const handleEditHomework = (item) => {
    setView('create');
    setEditingHomeworkId(item._id);
    setForm({
      title: item.title || '',
      description: item.description || '',
      dueDate: toInputDate(item.dueDate),
      maxScore: item.maxScore || 100,
      attachment: null
    });
    setMessage('');
    setFormFileKey((prev) => prev + 1);
  };

  const handleOpenReview = async (homeworkId) => {
    setSelectedReviewHomeworkId(homeworkId);
    setView('review');
    await loadSubmissions(homeworkId, { force: true });
  };

  const handleGrade = async (homeworkId, submissionId) => {
    const payload = grading[submissionId] || {};
    const rawScore = payload.score ?? '';
    if (rawScore === '') {
      setMessage('نمره لازم است.');
      return;
    }

    const numericScore = Number(rawScore);
    if (Number.isNaN(numericScore) || numericScore < 0) {
      setMessage('نمره معتبر نیست.');
      return;
    }

    setGradingBusyId(submissionId);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/homeworks/${homeworkId}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          submissionId,
          score: numericScore,
          feedback: payload.feedback || ''
        })
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ثبت نتیجه بررسی ناموفق بود.');
        return;
      }

      setMessage('نتیجه بررسی ثبت شد.');
      await loadSubmissions(homeworkId, { force: true });
    } catch {
      setMessage('خطا در ثبت نتیجه بررسی');
    } finally {
      setGradingBusyId('');
    }
  };

  const renderHomeworkCardMeta = (item) => (
    <div className="homework-card-meta">
      {item.dueDate && <span className="meta">موعد: {toDate(item.dueDate)}</span>}
      {item.maxScore != null && <span className="meta">حداکثر: {item.maxScore}</span>}
      {item.attachment && (
        <a href={`${API_BASE}/${item.attachment}`} target="_blank" rel="noreferrer">
          فایل ضمیمه
        </a>
      )}
    </div>
  );

  return (
    <div className="homework-page">
      <div className="homework-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <header>
          <h2>مدیریت کارخانگی</h2>
          <p>جریان ایجاد کارخانگی از جریان بررسی تحویل‌ها جدا شده است تا استاد بتواند هر کار را از صفحه درست خودش انجام دهد.</p>
        </header>

        <div className="homework-controls">
          <label htmlFor="homework-course-select">صنف فعال</label>
          <select
            id="homework-course-select"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            {!courses.length && <option value="">صنفی یافت نشد</option>}
            {courses.map((course) => (
              <option key={getScopeValue(course) || course._id} value={getScopeValue(course) || course._id}>{getCourseLabel(course)}</option>
            ))}
          </select>
        </div>

        <div className="homework-view-tabs" role="tablist" aria-label="مدیریت کارخانگی">
          <button
            type="button"
            className={view === 'create' ? 'active' : ''}
            onClick={() => setView('create')}
          >
            ایجاد کارخانگی
          </button>
          <button
            type="button"
            className={view === 'review' ? 'active' : ''}
            onClick={() => setView('review')}
          >
            بررسی تحویل‌ها
          </button>
        </div>

        {message && <div className="homework-empty">{message}</div>}
        {loading && <div className="homework-empty">در حال دریافت...</div>}
        {!loading && !items.length && (
          <div className="homework-empty">کارخانگی برای این صنف ثبت نشده است.</div>
        )}

        {!loading && view === 'create' && (
          <div className="homework-section-grid">
            <section className="homework-panel">
              <div className="homework-panel-header">
                <div>
                  <h3>{editingHomeworkId ? 'ویرایش کارخانگی' : 'ایجاد کارخانگی جدید'}</h3>
                  <p>در این بخش فقط ساخت و تنظیم خود کارخانگی انجام می‌شود.</p>
                </div>
              </div>

              <div className="homework-form">
                <input
                  type="text"
                  placeholder="عنوان کارخانگی"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
                <textarea
                  rows="4"
                  placeholder="شرح کارخانگی"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
                <div className="homework-form-row">
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                  />
                  <input
                    type="number"
                    min="0"
                    value={form.maxScore}
                    onChange={(e) => setForm((prev) => ({ ...prev, maxScore: e.target.value }))}
                  />
                  <input
                    key={formFileKey}
                    type="file"
                    onChange={(e) => setForm((prev) => ({ ...prev, attachment: e.target.files?.[0] || null }))}
                  />
                </div>
                <div className="homework-form-actions">
                  <button type="button" onClick={handleSaveHomework} disabled={savingHomework}>
                    {savingHomework ? 'در حال ذخیره...' : (editingHomeworkId ? 'ذخیره تغییرات' : 'ایجاد کارخانگی')}
                  </button>
                  {editingHomeworkId && (
                    <button type="button" className="ghost" onClick={resetForm} disabled={savingHomework}>
                      انصراف از ویرایش
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="homework-panel">
              <div className="homework-panel-header">
                <div>
                  <h3>فهرست کارخانگی‌های ایجادشده</h3>
                  <p>اینجا فقط مدیریت خود کارخانگی‌هاست؛ بررسی تحویل‌ها در تب جدا انجام می‌شود.</p>
                </div>
                <span className="homework-badge">{items.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
              </div>

              <div className="homework-list">
                {!items.length && <div className="homework-empty">هنوز کارخانگی‌ای برای این صنف ایجاد نشده است.</div>}
                {items.map((item) => (
                  <article key={item._id} className="homework-item">
                    <div className="homework-header">
                      <div>
                        <strong>{item.title}</strong>
                        {renderHomeworkCardMeta(item)}
                      </div>
                      <div className="actions">
                        <button type="button" className="ghost" onClick={() => handleEditHomework(item)}>
                          ویرایش
                        </button>
                        <button type="button" className="secondary" onClick={() => handleOpenReview(item._id)}>
                          رفتن به بررسی
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={deletingHomeworkId === item._id}
                          onClick={() => handleDeleteHomework(item._id)}
                        >
                          {deletingHomeworkId === item._id ? '...' : 'حذف'}
                        </button>
                      </div>
                    </div>
                    {item.description && <p>{item.description}</p>}
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {!loading && view === 'review' && (
          <div className="homework-section-grid review">
            <aside className="homework-panel homework-review-sidebar">
              <div className="homework-panel-header">
                <div>
                  <h3>انتخاب کارخانگی برای بررسی</h3>
                  <p>در این بخش فقط تحویل‌ها، فایل‌های ارسالی و نمره‌دهی دیده می‌شوند.</p>
                </div>
              </div>

              <div className="homework-review-selector">
                <label htmlFor="review-homework-select">کارخانگی</label>
                <select
                  id="review-homework-select"
                  value={selectedReviewHomeworkId}
                  onChange={(e) => setSelectedReviewHomeworkId(e.target.value)}
                >
                  {!items.length && <option value="">کارخانگی‌ای ثبت نشده است</option>}
                  {items.map((item) => (
                    <option key={item._id} value={item._id}>{item.title}</option>
                  ))}
                </select>
              </div>

              <div className="homework-review-list">
                {items.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className={String(item._id) === String(selectedReviewHomeworkId) ? 'active' : ''}
                    onClick={() => setSelectedReviewHomeworkId(item._id)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.dueDate ? `موعد: ${toDate(item.dueDate)}` : 'بدون موعد'}</span>
                  </button>
                ))}
              </div>
            </aside>

            <section className="homework-panel">
              {!selectedReviewHomework && (
                <div className="homework-empty">برای بررسی، یک کارخانگی را انتخاب کنید.</div>
              )}

              {!!selectedReviewHomework && (
                <>
                  <div className="homework-panel-header">
                    <div>
                      <h3>بررسی تحویل‌ها</h3>
                      <p>{selectedReviewHomework.title}</p>
                    </div>
                    <div className="actions">
                      <button type="button" className="ghost" onClick={() => handleEditHomework(selectedReviewHomework)}>
                        ویرایش کارخانگی
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => loadSubmissions(selectedReviewHomework._id, { force: true })}
                      >
                        بازخوانی تحویل‌ها
                      </button>
                    </div>
                  </div>

                  <div className="homework-review-summary">
                    {renderHomeworkCardMeta(selectedReviewHomework)}
                    {selectedReviewHomework.description && <p>{selectedReviewHomework.description}</p>}
                  </div>

                  {loadingSubmissionsId === selectedReviewHomework._id && (
                    <div className="submission-empty">در حال دریافت تحویل‌ها...</div>
                  )}

                  {loadingSubmissionsId !== selectedReviewHomework._id && (
                    <div className="submission-list">
                      {!selectedReviewSubmissions.length && (
                        <div className="submission-empty">برای این کارخانگی هنوز تحویلی ثبت نشده است.</div>
                      )}

                      {selectedReviewSubmissions.map((sub) => (
                        <div key={sub._id} className="submission-item">
                          <div className="submission-head">
                            <div>
                              <strong>{sub.student?.name || 'دانش‌آموز'}</strong>
                              <span>{sub.student?.grade || sub.student?.email || ''}</span>
                            </div>
                            <span>{toDate(sub.submittedAt)}</span>
                          </div>

                          <div className="submission-body">
                            <p>{sub.text}</p>
                            {sub.file && (
                              <a href={`${API_BASE}/${sub.file}`} target="_blank" rel="noreferrer">
                                دانلود فایل تحویل
                              </a>
                            )}
                          </div>

                          <div className="submission-grade">
                            <div className="submission-grade-header">
                              <span>
                                نتیجه فعلی:
                                {' '}
                                <strong>{typeof sub.score === 'number' ? sub.score.toLocaleString('fa-AF-u-ca-persian') : 'ثبت نشده'}</strong>
                              </span>
                              {sub.feedback && <span>بازخورد فعلی: {sub.feedback}</span>}
                            </div>
                            <input
                              type="number"
                              min="0"
                              placeholder="نمره"
                              value={grading[sub._id]?.score ?? (typeof sub.score === 'number' ? sub.score : '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGrading((prev) => ({ ...prev, [sub._id]: { ...prev[sub._id], score: val } }));
                              }}
                            />
                            <input
                              type="text"
                              placeholder="بازخورد"
                              value={grading[sub._id]?.feedback ?? (sub.feedback || '')}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGrading((prev) => ({ ...prev, [sub._id]: { ...prev[sub._id], feedback: val } }));
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleGrade(selectedReviewHomework._id, sub._id)}
                              disabled={gradingBusyId === sub._id}
                            >
                              {gradingBusyId === sub._id ? 'در حال ثبت...' : 'ثبت نتیجه بررسی'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
