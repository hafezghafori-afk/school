import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import '../components/dashboard/dashboard.css';
import './InstructorDashboard.css';
import DashboardProfileCard from '../components/DashboardProfileCard';
import NotificationBell from '../components/NotificationBell';
import QuickActionRail from '../components/dashboard/QuickActionRail';

import { API_BASE } from '../config/api';
import { formatAfghanDate, formatAfghanDateTime } from '../utils/afghanDate';

const ACTIVE_TEACHER_ASSIGNMENT_STATUSES = new Set(['active', 'planned', 'pending']);

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getName = () => localStorage.getItem('userName') || 'استاد عزیز';
const normalizeText = (value) => String(value || '').trim();
const uniqueLabels = (items = []) => Array.from(new Set(
  items
    .map((item) => normalizeText(item))
    .filter(Boolean)
));

const getLastLogin = () => localStorage.getItem('lastLoginAt') || '';

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

const formatRate = (value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')}%`;

const safeFetchJson = async (url) => {
  try {
    const response = await fetch(url, { headers: { ...getAuthHeaders() } });
    return await response.json().catch(() => ({}));
  } catch {
    return { success: false };
  }
};

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || item?.course?.title
  || 'صنف'
);

const getCourseClassId = (item = {}) => String(
  item?.classId
  || item?.schoolClass?._id
  || item?.schoolClass?.id
  || ''
).trim();

const getCourseCompatId = (item = {}) => String(
  item?.compatCourseId
  || item?._id
  || item?.courseId
  || item?.course?._id
  || ''
).trim();

const getCourseSelectionId = (item = {}) => getCourseClassId(item) || getCourseCompatId(item);

const getSubjectLabel = (subject = {}) => (
  normalizeText(subject?.nameDari)
  || normalizeText(subject?.name)
  || normalizeText(subject?.namePashto)
  || normalizeText(subject?.code)
  || 'مضمون'
);

const buildAssignmentCourseItems = (items = []) => {
  const grouped = new Map();

  items.forEach((item, index) => {
    const status = normalizeText(item?.status).toLowerCase();
    if (!ACTIVE_TEACHER_ASSIGNMENT_STATUSES.has(status)) return;

    const classId = normalizeText(item?.classId?._id || item?.classId);
    const compatCourseId = normalizeText(item?.legacyCourseId);
    const title = normalizeText(item?.classId?.title)
      || [normalizeText(item?.classId?.gradeLevel), normalizeText(item?.classId?.section)].filter(Boolean).join(' ')
      || 'صنف';
    const key = classId || compatCourseId || normalizeText(item?._id || `assignment-${index + 1}`);

    if (!grouped.has(key)) {
      grouped.set(key, {
        _id: compatCourseId || classId || key,
        compatCourseId: compatCourseId || '',
        classId: classId || '',
        title,
        schoolClass: {
          _id: classId || '',
          title
        },
        subjects: [],
        assignmentCount: 0
      });
    }

    const current = grouped.get(key);
    current.assignmentCount += 1;
    current.subjects.push(getSubjectLabel(item?.subjectId));
    if (!current.compatCourseId && compatCourseId) {
      current.compatCourseId = compatCourseId;
    }
  });

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    subjects: uniqueLabels(item.subjects)
  }));
};

const mergeCourseSources = (assignmentItems = [], legacyItems = []) => {
  const merged = new Map();

  assignmentItems.forEach((item) => {
    const key = getCourseSelectionId(item);
    if (key) merged.set(key, item);
  });

  legacyItems.forEach((item) => {
    const key = getCourseSelectionId(item);
    if (!key) return;

    if (merged.has(key)) {
      const current = merged.get(key);
      merged.set(key, {
        ...item,
        ...current,
        _id: current._id || item._id,
        compatCourseId: current.compatCourseId || getCourseCompatId(item),
        classId: current.classId || getCourseClassId(item),
        title: current.title || getCourseLabel(item),
        schoolClass: current.schoolClass || item.schoolClass
      });
      return;
    }

    merged.set(key, {
      ...item,
      compatCourseId: getCourseCompatId(item),
      subjects: [],
      assignmentCount: 0
    });
  });

  return Array.from(merged.values()).sort((left, right) => (
    getCourseLabel(left).localeCompare(getCourseLabel(right), 'fa')
  ));
};

const getCourseMetaLabel = (item = {}, isActive = false) => {
  const subjectLabels = uniqueLabels(item?.subjects || []);
  if (subjectLabels.length) {
    const preview = subjectLabels.slice(0, 2).join('، ');
    const extraCount = subjectLabels.length - 2;
    const suffix = extraCount > 0 ? ` +${extraCount.toLocaleString('fa-AF')} مضمون دیگر` : '';
    return isActive ? `در حال نمایش خلاصه حضور • ${preview}${suffix}` : `${preview}${suffix}`;
  }

  const assignmentCount = Number(item?.assignmentCount || 0);
  if (assignmentCount > 0) {
    const label = `${assignmentCount.toLocaleString('fa-AF')} تخصیص`;
    return isActive ? `در حال نمایش خلاصه حضور • ${label}` : label;
  }

  return isActive ? 'در حال نمایش خلاصه حضور' : 'آماده برای انتخاب';
};

const normalizeTaskActionUrl = (value = '') => {
  const target = String(value || '').trim();
  if (!target) return '';
  if (target.startsWith('/admin')) return '';
  if (/^https?:\/\//i.test(target)) return '';
  return target;
};

const buildOfficialTaskItem = (item = {}) => ({
  id: item?._id || `${Date.now()}-${Math.random()}`,
  title: item?.title || 'وظیفه رسمی',
  subtitle: item?.message || '',
  meta: item?.createdAt ? `ثبت: ${toFaDateTime(item.createdAt)}` : '',
  actionUrl: normalizeTaskActionUrl(item?.actionUrl),
  level: String(item?.level || 'info').toLowerCase()
});

const taskLevelLabel = (value = 'info') => {
  if (value === 'critical') return 'فوری';
  if (value === 'warning') return 'نیازمند اقدام';
  return 'اطلاعیه';
};

export default function InstructorDashboard() {
  const [user, setUser] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [teacherDashboard, setTeacherDashboard] = useState(null);
  const [myCourses, setMyCourses] = useState([]);
  const [myCoursesLoading, setMyCoursesLoading] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [weeklyAttendance, setWeeklyAttendance] = useState(null);
  const [weeklyAttendanceLoading, setWeeklyAttendanceLoading] = useState(false);
  const [officialTasks, setOfficialTasks] = useState([]);
  const [officialTasksLoading, setOfficialTasksLoading] = useState(false);

  const lastLogin = getLastLogin();

  const selectedCourse = useMemo(
    () => myCourses.find((item) => String(getCourseSelectionId(item)) === String(selectedCourseId)) || null,
    [myCourses, selectedCourseId]
  );

  const selectedClassId = getCourseClassId(selectedCourse);
  const selectedCompatCourseId = getCourseCompatId(selectedCourse);

  const weeklyAttendanceSummary = weeklyAttendance?.summary || null;
  const weeklyAttendanceWindow = weeklyAttendance?.week || null;
  const hasWeeklyAttendance = Number(weeklyAttendanceSummary?.totalRecords || 0) > 0;

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (data?.success) setUser(data.user);
    } catch {
      setUser(null);
    }
  };

  const loadSchedule = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/schedules/today`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setTodaySchedule(data?.success ? (data.items || []) : []);
    } catch {
      setTodaySchedule([]);
    }
  };

  const loadMyCourses = async (teacherId = '') => {
    const normalizedTeacherId = normalizeText(teacherId);
    if (!normalizedTeacherId) {
      setMyCourses([]);
      setSelectedCourseId('');
      setMyCoursesLoading(false);
      return;
    }

    setMyCoursesLoading(true);
    try {
      const [assignmentRes, legacyCourseRes] = await Promise.all([
        fetch(`${API_BASE}/api/teacher-assignments/teacher/${encodeURIComponent(normalizedTeacherId)}`, {
          headers: { ...getAuthHeaders() }
        }),
        fetch(`${API_BASE}/api/education/instructor/courses`, {
          headers: { ...getAuthHeaders() }
        })
      ]);

      const assignmentData = await assignmentRes.json().catch(() => ({}));
      const legacyCourseData = await legacyCourseRes.json().catch(() => ({}));
      const assignmentItems = buildAssignmentCourseItems(assignmentData?.data?.assignments || []);
      const legacyItems = legacyCourseData?.success ? (legacyCourseData.items || []) : [];
      const items = mergeCourseSources(assignmentItems, legacyItems);

      setMyCourses(items);
      setSelectedCourseId((prev) => {
        if (items.some((item) => String(getCourseSelectionId(item)) === String(prev))) {
          return prev;
        }
        return getCourseSelectionId(items[0]) || '';
      });
    } catch {
      setMyCourses([]);
      setSelectedCourseId('');
    } finally {
      setMyCoursesLoading(false);
    }
  };

  const loadOfficialTasks = async () => {
    setOfficialTasksLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me/notifications?status=unread&limit=20`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setOfficialTasks([]);
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      const actionable = items
        .filter((item) => item?.needsAction)
        .filter((item) => String(item?.category || '').trim().toLowerCase() !== 'finance')
        .map(buildOfficialTaskItem);

      setOfficialTasks(actionable);
    } catch {
      setOfficialTasks([]);
    } finally {
      setOfficialTasksLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
    loadSchedule();
    loadOfficialTasks();
  }, []);

  useEffect(() => {
    loadMyCourses(user?._id || user?.id || '');
  }, [user?._id, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadTeacherDashboard = async () => {
      const data = await safeFetchJson(`${API_BASE}/api/dashboard/teacher`);
      if (!cancelled) {
        setTeacherDashboard(data?.success ? data : null);
      }
    };
    loadTeacherDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadWeeklyAttendance = async () => {
      if (!selectedClassId && !selectedCompatCourseId) {
        setWeeklyAttendance(null);
        setWeeklyAttendanceLoading(false);
        return;
      }

      setWeeklyAttendanceLoading(true);
      try {
        const targetPath = selectedClassId
          ? `${API_BASE}/api/attendance/class/${encodeURIComponent(selectedClassId)}/weekly`
          : `${API_BASE}/api/attendance/course/${encodeURIComponent(selectedCompatCourseId)}/weekly`;
        const res = await fetch(targetPath, {
          headers: { ...getAuthHeaders() }
        });
        const data = await res.json();
        setWeeklyAttendance(data?.success ? data : null);
      } catch {
        setWeeklyAttendance(null);
      } finally {
        setWeeklyAttendanceLoading(false);
      }
    };

    loadWeeklyAttendance();
  }, [selectedClassId, selectedCompatCourseId]);

  const todayScheduleCount = todaySchedule.length;
  const officialTaskCount = officialTasks.length;
  const teacherSummary = teacherDashboard?.summary || {
    activeClasses: myCourses.length,
    activeStudents: 0,
    attendanceRate: weeklyAttendanceSummary?.attendanceRate || 0,
    activeExams: 0,
    todayLessons: todayScheduleCount
  };

  const teacherQuickActions = [
    { to: '/attendance-manager', label: 'ثبت حضور', caption: 'حاضری روزانه صنف‌ها', tone: 'teal' },
    { to: '/grade-manager', label: 'وارد کردن نمره', caption: 'ثبت نمره و نتایج', tone: 'mint' },
    { to: '/chat?tab=direct', label: 'چت', caption: 'چت مستقیم و گروهی صنف', tone: 'copper' },
    { to: '/chat?tab=live', label: 'صنف‌های آنلاین', caption: 'جلسات آنلاین و لینک‌های صنف', tone: 'teal' },
    { to: '/recordings', label: 'آرشیف ضبط جلسات', caption: 'بازبینی جلسه‌های ثبت‌شده', tone: 'slate' },
    { to: '/homework-manager', label: 'کارخانگی', caption: 'مدیریت تکالیف و تحویل‌ها', tone: 'slate' },
    { to: '/quiz-builder', label: 'ایجاد امتحان', caption: 'ساخت امتحان و کوییز', tone: 'copper' }
  ];

  const teacherAlerts = (teacherDashboard?.alerts || []).map((item) => ({
    id: item.id,
    title: item.label,
    subtitle: item.meta
  }));

  return (
    <section className="dash-page instructor-dash-page">
      <div className="dash-hero">
        <div>
          <h2>داشبورد استاد</h2>
          <p>
            {`خوش آمدید ${user?.name || getName()}. در این صفحه فقط ابزارهای ضروری روزانه، برنامه امروز،
            صنف‌های واگذارشده، وضعیت حضور هفتگی و وظایف رسمی شما نمایش داده می‌شود.`}
          </p>
          <div className="dash-meta">
            <span>آخرین ورود: {lastLogin ? toFaDateTime(lastLogin) : 'ثبت نشده'}</span>
            <span>حساب کاربری: {user?.email || 'استاد'}</span>
          </div>
        </div>

        <div className="dash-hero-actions">
          <NotificationBell title="اعلان‌های استاد" panelPath="/instructor-dashboard" />
          <DashboardProfileCard user={user} fallbackName={getName()} apiBase={API_BASE} variant="dropdown" />
        </div>
      </div>

      <div className="dash-card instructor-tools-card">
        <div className="dash-card-header">
          <h3>ابزارهای درسی روزانه</h3>
          <span className="status">فعال</span>
        </div>
        <p className="dash-desc">
          ثبت حضور، وارد کردن نمره، چت، صنف‌های آنلاین، آرشیف ضبط جلسات، کارخانگی و ایجاد امتحان از همین بخش در دسترس شماست.
        </p>
        <QuickActionRail actions={teacherQuickActions} />
      </div>

      <div className="dash-stats">
        <div>
          <span>برنامه‌های امروز</span>
          <strong>{Number(todayScheduleCount || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
        </div>
        <div>
          <span>صنف‌های فعال</span>
          <strong>{Number(teacherSummary.activeClasses || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
        </div>
        <div>
          <span>متعلمین فعال</span>
          <strong>{Number(teacherSummary.activeStudents || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
        </div>
        <div>
          <span>وظایف رسمی باز</span>
          <strong>{Number(officialTaskCount || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
        </div>
      </div>

      <div className="dash-layout">
        <div className="dash-side">
          <div className="dash-card instructor-task-card">
            <div className="dash-card-header">
              <h3>وظایف رسمی</h3>
              <span className={`status${officialTaskCount ? ' pending' : ' approved'}`}>
                {officialTaskCount ? `${officialTaskCount.toLocaleString('fa-AF-u-ca-persian')} مورد باز` : 'بدون مورد باز'}
              </span>
            </div>
            <p className="dash-desc">
              اعلان‌های قابل‌اقدام و وظایف ابلاغ‌شده برای شما در این بخش نمایش داده می‌شود.
            </p>
            {officialTasksLoading && (
              <div className="dash-note">در حال بارگذاری وظایف رسمی...</div>
            )}
            {!officialTasksLoading && !officialTasks.length && (
              <div className="dash-note">فعلاً وظیفه رسمی تازه‌ای برای شما ثبت نشده است.</div>
            )}
            {!officialTasksLoading && officialTasks.length > 0 && (
              <div className="dash-list">
                {officialTasks.map((item) => (
                  <div key={item.id} className="dash-list-item">
                    <div>
                      <strong>{item.title}</strong>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                      {item.meta ? <span>{item.meta}</span> : null}
                    </div>
                    {item.actionUrl ? (
                      <Link className="dash-mini-btn" to={item.actionUrl}>باز کردن</Link>
                    ) : (
                      <span className="dash-tag">{taskLevelLabel(item.level)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dash-card instructor-alert-card">
            <div className="dash-card-header">
              <h3>هشدارهای آموزشی</h3>
              <span className={`status${teacherAlerts.length ? ' pending' : ' approved'}`}>
                {teacherAlerts.length ? 'نیازمند پیگیری' : 'وضعیت پایدار'}
              </span>
            </div>
            <p className="dash-desc">
              موارد آموزشی که نیاز به توجه دارد، مثل افت حضور یا کاهش عملکرد صنف‌ها، در این بخش دیده می‌شود.
            </p>
            {!teacherAlerts.length && (
              <div className="dash-note">هشدار فعالی برای این هفته دیده نشد.</div>
            )}
            {!!teacherAlerts.length && (
              <div className="dash-list">
                {teacherAlerts.map((item) => (
                  <div key={item.id} className="dash-list-item">
                    <div>
                      <strong>{item.title}</strong>
                      {item.subtitle ? <span>{item.subtitle}</span> : null}
                    </div>
                    <span className="dash-tag">هشدار</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dash-panel">
            <h3>برنامه امروز</h3>
            {!todaySchedule.length && (
              <div className="dash-note">برای امروز برنامه درسی ثبت نشده است.</div>
            )}
            {todaySchedule.map((item) => (
              <div key={item._id} className="dash-panel-row">
                <span>{item.subject} - {getCourseLabel(item)}</span>
                <span>{item.startTime} - {item.endTime}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="dash-side">
          <div className="dash-panel">
            <h3>صنف‌های من</h3>
            {myCoursesLoading && <div className="dash-note">در حال دریافت صنف‌های واگذارشده...</div>}
            {!myCoursesLoading && !myCourses.length && <div className="dash-note">هنوز صنفی به این حساب نسبت داده نشده است.</div>}
            {myCourses.map((item) => {
              const isActive = String(getCourseSelectionId(item)) === String(selectedCourseId);
              return (
                <div key={getCourseSelectionId(item)} className="dash-request-row">
                  <div>
                    <strong>{getCourseLabel(item)}</strong>
                    <span>{getCourseMetaLabel(item, isActive)}</span>
                  </div>
                  <div className="dash-request-actions">
                    <button
                      type="button"
                      className="dash-mini-btn"
                      onClick={() => setSelectedCourseId(getCourseSelectionId(item))}
                      disabled={isActive}
                    >
                      {isActive ? 'فعال' : 'انتخاب'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dash-panel">
            <h3>خلاصه حضور و غیاب هفتگی</h3>
            {!selectedCourse && (
              <div className="dash-note">برای دیدن خلاصه حضور و غیاب، ابتدا یک صنف را انتخاب کنید.</div>
            )}
            {!!selectedCourse && weeklyAttendanceLoading && (
              <div className="dash-note">خلاصه حضور و غیاب این هفته در حال بارگذاری است.</div>
            )}
            {!!selectedCourse && !weeklyAttendanceLoading && hasWeeklyAttendance && (
              <>
                <div className="dash-summary-grid">
                  <div className="dash-summary-card">
                    <span>حاضر</span>
                    <strong>{Number(weeklyAttendanceSummary?.present || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                  </div>
                  <div className="dash-summary-card danger">
                    <span>غایب</span>
                    <strong>{Number(weeklyAttendanceSummary?.absent || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                  </div>
                  <div className="dash-summary-card">
                    <span>تاخیر</span>
                    <strong>{Number(weeklyAttendanceSummary?.late || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
                  </div>
                  <div className="dash-summary-card">
                    <span>نرخ حضور</span>
                    <strong>{formatRate(weeklyAttendanceSummary?.attendanceRate)}</strong>
                  </div>
                </div>

                <div className="dash-inline-meta">
                  <span>صنف انتخاب‌شده: <strong>{getCourseLabel(selectedCourse)}</strong></span>
                  <span>بازه هفته: <strong>{toFaDate(weeklyAttendanceWindow?.start)} تا {toFaDate(weeklyAttendanceWindow?.end)}</strong></span>
                  <span>شاگردان ثبت‌شده: <strong>{Number(weeklyAttendanceSummary?.recordedStudents || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></span>
                  <span>کل شاگردان: <strong>{Number(weeklyAttendanceSummary?.totalStudents || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></span>
                  <span>روزهای ثبت: <strong>{Number(weeklyAttendanceSummary?.totalDays || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></span>
                </div>
              </>
            )}
            {!!selectedCourse && !weeklyAttendanceLoading && !hasWeeklyAttendance && (
              <div className="dash-note">برای این صنف هنوز حضور و غیاب هفتگی ثبت نشده است.</div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
