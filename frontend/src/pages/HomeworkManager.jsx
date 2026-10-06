import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './HomeworkManager.css';

import { API_BASE } from '../config/api';
import { apiFetch, failureMessage } from '../utils/apiClient';
import { DataErrorCard } from '../components/ui/DataState';
import { SkeletonCards } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/toast';
import HomeworkDialog from '../components/homework/HomeworkDialog';
import HomeworkFormDrawer from '../components/homework/HomeworkFormDrawer';
import HomeworkReviewDesk from '../components/homework/HomeworkReviewDesk';
import HomeworkCopyDialog from '../components/homework/HomeworkCopyDialog';
import { faNumber, formatDate, getDueState } from '../components/homework/homeworkUtils';

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

const LIST_FILTERS = [
  { key: 'all', label: 'همه' },
  { key: 'open', label: 'باز' },
  { key: 'soon', label: 'نزدیک موعد' },
  { key: 'needs_review', label: 'نیاز به بررسی' },
  { key: 'late', label: 'تحویل دیر' },
  { key: 'overdue', label: 'موعد گذشته' }
];

const matchesListFilter = (item, filter) => {
  const due = getDueState(item.dueDate);
  if (filter === 'open') return due.key !== 'overdue';
  if (filter === 'soon') return due.key === 'soon';
  if (filter === 'overdue') return due.key === 'overdue';
  if (filter === 'needs_review') return Number(item.stats?.pendingCount || 0) > 0;
  if (filter === 'late') return Number(item.stats?.lateCount || 0) > 0;
  return true;
};

function HomeworkCard({ item, onReview, onEdit, onCopy, onDelete }) {
  const due = getDueState(item.dueDate);
  const stats = item.stats || {};
  const roster = Number(stats.rosterCount || 0);
  const submitted = Number(stats.submittedCount || 0);
  const progress = roster ? Math.min(100, Math.round((submitted / roster) * 100)) : 0;

  return (
    <article className={`hw-card hw-card--${due.key}`}>
      <header className="hw-card-head">
        <h3>{item.title}</h3>
        <span className={`hw-badge hw-badge--${due.tone}`}>{due.label}</span>
      </header>

      <div className="hw-meta">
        <span><i className="fa fa-calendar" aria-hidden="true" /> {item.dueDate ? formatDate(item.dueDate) : 'بدون موعد'}</span>
        <span><i className="fa fa-star" aria-hidden="true" /> از {faNumber(item.maxScore)}</span>
        {item.attachment && <span><i className="fa fa-paperclip" aria-hidden="true" /> ضمیمه</span>}
      </div>

      {item.description && <p className="hw-card-desc">{item.description}</p>}

      <div className="hw-card-progress">
        <div className="hw-progress-label">
          <span><strong>{faNumber(submitted)}</strong> از {faNumber(roster)} تحویل</span>
          {stats.averagePercent !== null && stats.averagePercent !== undefined && (
            <span className="hw-muted">میانگین {faNumber(stats.averagePercent)}٪</span>
          )}
        </div>
        <div className="hw-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="پیشرفت تحویل">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="hw-progress-chips">
          {stats.pendingCount > 0 && <span className="hw-badge hw-badge--info">{faNumber(stats.pendingCount)} در انتظار نمره</span>}
          {stats.lateCount > 0 && <span className="hw-badge hw-badge--warning"><i className="fa fa-clock" aria-hidden="true" /> {faNumber(stats.lateCount)} دیر</span>}
          {stats.revisionCount > 0 && <span className="hw-badge hw-badge--purple">{faNumber(stats.revisionCount)} برگشت برای اصلاح</span>}
          {due.key === 'overdue' && stats.missingCount > 0 && (
            <span className="hw-badge hw-badge--danger">{faNumber(stats.missingCount)} تحویل‌نداده</span>
          )}
        </div>
      </div>

      <footer className="hw-card-actions">
        <button type="button" className="hw-btn hw-btn--primary" onClick={() => onReview(item)}>
          بررسی تحویل‌ها
          {stats.pendingCount > 0 && <span className="hw-btn-count">{faNumber(stats.pendingCount)}</span>}
        </button>
        <button type="button" className="hw-btn hw-btn--soft" onClick={() => onEdit(item)}>
          <i className="fa fa-pen" aria-hidden="true" /> ویرایش
        </button>
        <button type="button" className="hw-icon-btn" onClick={() => onCopy(item)} title="کپی به صنف دیگر" aria-label={`کپی «${item.title}» به صنف دیگر`}>
          <i className="fa fa-copy" aria-hidden="true" />
        </button>
        <button type="button" className="hw-icon-btn hw-icon-btn--danger" onClick={() => onDelete(item)} title="حذف" aria-label={`حذف «${item.title}»`}>
          <i className="fa fa-trash" aria-hidden="true" />
        </button>
      </footer>
    </article>
  );
}

export default function HomeworkManager() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [drawer, setDrawer] = useState({ open: false, homework: null });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [copyTarget, setCopyTarget] = useState(null);
  const [copying, setCopying] = useState(false);
  const listStale = useRef(false);

  const selectedCourse = useMemo(
    () => courses.find((item) => String(getScopeValue(item)) === String(courseId)) || null,
    [courses, courseId]
  );
  const classId = getCourseClassId(selectedCourse);
  const classTitle = getCourseLabel(selectedCourse);
  const reviewHomework = items.find((item) => String(item._id) === String(reviewId)) || null;

  const loadCourses = async () => {
    try {
      const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
      const isInstructor = role === 'instructor';
      const data = await apiFetch(`${API_BASE}${isInstructor ? '/api/education/instructor/courses' : '/api/education/school-classes?status=active'}`);
      const nextCourses = data?.success
        ? normalizeCourseOptions(data?.items || [], isInstructor ? 'courseAccess' : 'schoolClass')
        : [];
      setCourses(nextCourses);
      setCourseId((prev) => (
        nextCourses.some((course) => String(getScopeValue(course)) === String(prev))
          ? prev
          : getScopeValue(nextCourses[0])
      ));
    } catch (error) {
      setCourses([]);
      setLoadError(error);
    } finally {
      setCoursesLoaded(true);
    }
  };

  const loadHomeworks = useCallback(async () => {
    setLoadError(null);
    if (!classId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch(`${API_BASE}/api/homeworks/class/${classId}?withStats=1`, { dedupe: false });
      setItems(data?.items || []);
      listStale.current = false;
    } catch (error) {
      setLoadError(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    setReviewId('');
    setFilter('all');
    setSearch('');
    loadHomeworks();
  }, [loadHomeworks]);

  const kpis = useMemo(() => {
    let open = 0;
    let pending = 0;
    let late = 0;
    let percentTotal = 0;
    let gradedTotal = 0;
    items.forEach((item) => {
      if (getDueState(item.dueDate).key !== 'overdue') open += 1;
      pending += Number(item.stats?.pendingCount || 0);
      late += Number(item.stats?.lateCount || 0);
      if (item.stats?.averagePercent !== null && item.stats?.averagePercent !== undefined) {
        percentTotal += item.stats.averagePercent * item.stats.gradedCount;
        gradedTotal += item.stats.gradedCount;
      }
    });
    return { open, pending, late, average: gradedTotal ? Math.round(percentTotal / gradedTotal) : null };
  }, [items]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => matchesListFilter(item, filter))
      .filter((item) => !query || `${item.title} ${item.description || ''}`.toLowerCase().includes(query));
  }, [items, filter, search]);

  const filterCounts = useMemo(() => {
    const counts = {};
    LIST_FILTERS.forEach(({ key }) => {
      counts[key] = items.filter((item) => matchesListFilter(item, key)).length;
    });
    return counts;
  }, [items]);

  const copyClassOptions = useMemo(() => courses
    .filter((course) => getCourseClassId(course) && getCourseClassId(course) !== classId)
    .map((course) => ({ value: getCourseClassId(course), label: getCourseLabel(course) })), [courses, classId]);

  const openReview = (item) => setReviewId(item._id);

  const closeReview = () => {
    setReviewId('');
    if (listStale.current) loadHomeworks();
  };

  const handleSave = async (values) => {
    const editing = drawer.homework;
    if (!classId) {
      toast.error('این صنف به ساختار صنف‌ها وصل نیست؛ اول آن را در بخش آموزش تنظیم کنید.');
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append('classId', classId);
      const compatCourseId = getCompatCourseId(selectedCourse);
      if (compatCourseId) body.append('courseId', compatCourseId);
      body.append('title', values.title);
      body.append('description', values.description);
      body.append('dueDate', values.dueDate);
      body.append('maxScore', String(values.maxScore));
      if (values.attachment) body.append('attachment', values.attachment);
      if (values.notifyStudents) body.append('notifyStudents', 'true');

      const data = await apiFetch(`${API_BASE}/api/homeworks/${editing ? editing._id : 'create'}`, {
        method: editing ? 'PUT' : 'POST',
        body
      });
      if (editing) {
        toast.success('کارخانگی ویرایش شد.');
      } else {
        toast.success(data?.notifiedCount
          ? `کارخانگی ثبت شد و به ${faNumber(data.notifiedCount)} شاگرد اعلان رفت.`
          : 'کارخانگی ثبت شد.');
      }
      setDrawer({ open: false, homework: null });
      await loadHomeworks();
    } catch (error) {
      toast.error(failureMessage(error, editing ? 'ویرایش کارخانگی ناموفق بود.' : 'ثبت کارخانگی ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`${API_BASE}/api/homeworks/${deleteTarget._id}`, { method: 'DELETE' });
      toast.success(`«${deleteTarget.title}» حذف شد.`);
      if (String(reviewId) === String(deleteTarget._id)) setReviewId('');
      setDeleteTarget(null);
      await loadHomeworks();
    } catch (error) {
      toast.error(failureMessage(error, 'حذف کارخانگی ناموفق بود.'));
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = async (payload) => {
    if (!copyTarget) return;
    setCopying(true);
    try {
      const data = await apiFetch(`${API_BASE}/api/homeworks/${copyTarget._id}/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const created = data?.created || [];
      const failed = data?.failed || [];
      toast.success(`کارخانگی در ${faNumber(created.length)} صنف کپی شد${created.length ? `: ${created.map((item) => item.classTitle).filter(Boolean).join('، ')}` : ''}.`);
      if (failed.length) toast.warning(`${faNumber(failed.length)} صنف کپی نشد: ${failed[0].message}`);
      setCopyTarget(null);
    } catch (error) {
      toast.error(failureMessage(error, 'کپی کارخانگی ناموفق بود.'));
    } finally {
      setCopying(false);
    }
  };

  const openCreate = () => setDrawer({ open: true, homework: null });
  const openEdit = (item) => setDrawer({ open: true, homework: item });
  const deleteSubmissionCount = Number(deleteTarget?.stats?.submittedCount || 0);

  return (
    <div className="hw-page">
      <div className="hw-shell">
        <header className="hw-header">
          <div className="hw-header-text">
            <button type="button" className="hw-btn hw-btn--ghost hw-back" onClick={() => window.history.back()}>
              <i className="fa fa-arrow-right" aria-hidden="true" /> بازگشت
            </button>
            <h1>مدیریت کارخانگی</h1>
            <p>کارخانگی بدهید، تحویل‌ها را ببینید و با چند کلیک نمره و بازخورد ثبت کنید.</p>
          </div>
          <div className="hw-header-controls">
            <label className="hw-class-select">
              <span>صنف</span>
              <select
                id="homework-course-select"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                disabled={!courses.length}
              >
                {!courses.length && <option value="">{coursesLoaded ? 'صنفی یافت نشد' : 'در حال دریافت...'}</option>}
                {courses.map((course) => (
                  <option key={getScopeValue(course) || course._id} value={getScopeValue(course) || course._id}>
                    {getCourseLabel(course)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="hw-btn hw-btn--primary hw-btn--lg" onClick={openCreate} disabled={!classId}>
              <i className="fa fa-plus" aria-hidden="true" /> کارخانگی جدید
            </button>
          </div>
        </header>

        {!!loadError && <DataErrorCard error={loadError} onRetry={() => (courses.length ? loadHomeworks() : loadCourses())} compact />}

        {coursesLoaded && !courses.length && !loadError && (
          <div className="hw-empty">
            <i className="fa fa-chalkboard" aria-hidden="true" />
            <h3>صنفی برای شما ثبت نشده است</h3>
            <p>وقتی به یک صنف وصل شوید، کارخانگی‌های آن اینجا دیده می‌شود.</p>
          </div>
        )}

        {reviewHomework ? (
          <HomeworkReviewDesk
            homework={reviewHomework}
            classTitle={classTitle}
            onBack={closeReview}
            onEdit={openEdit}
            onCopy={setCopyTarget}
            onChanged={() => { listStale.current = true; }}
            toast={toast}
          />
        ) : (
          classId && (
            <>
              <section className="hw-kpis" aria-label="خلاصه">
                <button type="button" className={`hw-kpi ${filter === 'open' ? 'is-active' : ''}`} onClick={() => setFilter(filter === 'open' ? 'all' : 'open')}>
                  <i className="fa fa-book-open hw-kpi-icon hw-tone-success" aria-hidden="true" />
                  <strong>{faNumber(kpis.open)}</strong>
                  <span>کارخانگیِ باز</span>
                </button>
                <button type="button" className={`hw-kpi ${filter === 'needs_review' ? 'is-active' : ''}`} onClick={() => setFilter(filter === 'needs_review' ? 'all' : 'needs_review')}>
                  <i className="fa fa-inbox hw-kpi-icon hw-tone-info" aria-hidden="true" />
                  <strong>{faNumber(kpis.pending)}</strong>
                  <span>تحویل در انتظار نمره</span>
                </button>
                <button type="button" className={`hw-kpi ${filter === 'late' ? 'is-active' : ''}`} onClick={() => setFilter(filter === 'late' ? 'all' : 'late')}>
                  <i className="fa fa-clock hw-kpi-icon hw-tone-warning" aria-hidden="true" />
                  <strong>{faNumber(kpis.late)}</strong>
                  <span>تحویل دیرهنگام</span>
                </button>
                <div className="hw-kpi hw-kpi--static">
                  <i className="fa fa-chart-simple hw-kpi-icon hw-tone-purple" aria-hidden="true" />
                  <strong>{kpis.average === null ? '—' : `${faNumber(kpis.average)}٪`}</strong>
                  <span>میانگین نمره‌ها</span>
                </div>
              </section>

              <div className="hw-toolbar">
                <div className="hw-tabs hw-tabs--scroll" role="tablist" aria-label="فیلتر کارخانگی‌ها">
                  {LIST_FILTERS.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={filter === key}
                      className={filter === key ? 'is-active' : ''}
                      onClick={() => setFilter(key)}
                    >
                      {label} <span className="hw-count">{faNumber(filterCounts[key] || 0)}</span>
                    </button>
                  ))}
                </div>
                <div className="hw-search">
                  <i className="fa fa-magnifying-glass" aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="جستجوی عنوان"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-label="جستجوی کارخانگی"
                  />
                </div>
              </div>

              {loading && !items.length && <SkeletonCards count={3} />}

              {!loading && !loadError && !items.length && (
                <div className="hw-empty">
                  <i className="fa fa-book" aria-hidden="true" />
                  <h3>هنوز کارخانگی‌ای برای {classTitle || 'این صنف'} ثبت نشده است</h3>
                  <p>نخستین کارخانگی را بسازید؛ شاگردان آن را در صفحهٔ «کارخانگی من» می‌بینند.</p>
                  <button type="button" className="hw-btn hw-btn--primary" onClick={openCreate}>
                    <i className="fa fa-plus" aria-hidden="true" /> ثبت نخستین کارخانگی
                  </button>
                </div>
              )}

              {!!items.length && !visibleItems.length && (
                <div className="hw-empty-inline">
                  کارخانگی‌ای با این فیلتر پیدا نشد.{' '}
                  <button type="button" className="hw-link-btn" onClick={() => { setFilter('all'); setSearch(''); }}>نمایش همه</button>
                </div>
              )}

              <div className={`hw-grid ${loading ? 'is-refreshing' : ''}`}>
                {visibleItems.map((item) => (
                  <HomeworkCard
                    key={item._id}
                    item={item}
                    onReview={openReview}
                    onEdit={openEdit}
                    onCopy={setCopyTarget}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </>
          )
        )}
      </div>

      <HomeworkFormDrawer
        open={drawer.open}
        homework={drawer.homework}
        classTitle={classTitle}
        saving={saving}
        onClose={() => setDrawer({ open: false, homework: null })}
        onSave={handleSave}
      />

      <HomeworkCopyDialog
        open={Boolean(copyTarget)}
        homework={copyTarget}
        classes={copyClassOptions}
        busy={copying}
        onClose={() => setCopyTarget(null)}
        onCopy={handleCopy}
      />

      <HomeworkDialog
        open={Boolean(deleteTarget)}
        title="حذف کارخانگی"
        labelledBy="homework-delete-title"
        onRequestClose={() => !deleting && setDeleteTarget(null)}
        footer={(
          <>
            <button type="button" className="hw-btn hw-btn--danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'در حال حذف...' : 'بله، حذف شود'}
            </button>
            <button type="button" className="hw-btn hw-btn--ghost" data-autofocus onClick={() => setDeleteTarget(null)} disabled={deleting}>انصراف</button>
          </>
        )}
      >
        <p>«{deleteTarget?.title}» برای همیشه حذف شود؟</p>
        {deleteSubmissionCount > 0 && (
          <div className="hw-alert hw-alert--danger" role="note">
            <i className="fa fa-triangle-exclamation" aria-hidden="true" />
            <span>{faNumber(deleteSubmissionCount)} تحویل شاگردان و نمره‌های آن‌ها هم پاک می‌شود و قابل بازگشت نیست.</span>
          </div>
        )}
      </HomeworkDialog>
    </div>
  );
}
