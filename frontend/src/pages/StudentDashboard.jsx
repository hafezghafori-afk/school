import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import '../components/dashboard/dashboard.css';
import DashboardProfileCard from '../components/DashboardProfileCard';
import NotificationBell from '../components/NotificationBell';
import DashboardShell from '../components/dashboard/DashboardShell';
import KpiRingCard from '../components/dashboard/KpiRingCard';
import QuickActionRail from '../components/dashboard/QuickActionRail';
import TaskAlertPanel from '../components/dashboard/TaskAlertPanel';
import TrendBars from '../components/dashboard/TrendBars';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const getName = () => localStorage.getItem('userName') || 'شاگرد عزیز';
const getLastLogin = () => localStorage.getItem('lastLoginAt') || '';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toFaDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '-';
};

const formatRate = (value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')}%`;
const formatMoney = (value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} AFN`;

const getCompatCourseId = (item = {}) => String(item?.courseId || item?._id || '').trim();
const getCourseClassId = (item = {}) => String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim();
const getCourseScopeId = (item = {}) => getCourseClassId(item) || getCompatCourseId(item);
const getCourseLabel = (item = {}) => item?.schoolClass?.title || item?.title || 'صنف';

const normalizeCourseItems = (items = []) => items
  .map((item) => ({
    ...item,
    classId: getCourseClassId(item),
    courseId: getCompatCourseId(item),
    schoolClass: item?.schoolClass || null
  }))
  .filter((item) => item.classId);

const summarizeFinanceOverviews = (items = []) => items.reduce((summary, entry) => {
  const itemSummary = entry?.summary || {};
  return {
    totalBills: summary.totalBills + (Number(itemSummary.totalOrders) || 0),
    totalDue: summary.totalDue + (Number(itemSummary.totalDue) || 0),
    totalPaid: summary.totalPaid + (Number(itemSummary.totalPaid) || 0),
    totalRemaining: summary.totalRemaining + (Number(itemSummary.totalOutstanding) || 0),
    pendingReceipts: summary.pendingReceipts + (Number(itemSummary.pendingPayments) || 0)
  };
}, {
  totalBills: 0,
  totalDue: 0,
  totalPaid: 0,
  totalRemaining: 0,
  pendingReceipts: 0
});

const buildGradeSummary = (items = []) => {
  const totalCount = items.length;
  const totalScore = items.reduce((sum, item) => sum + (Number(item?.totalScore) || 0), 0);
  const averageScore = totalCount ? Number((totalScore / totalCount).toFixed(1)) : 0;
  const topScore = items.reduce((max, item) => Math.max(max, Number(item?.totalScore) || 0), 0);

  return {
    totalCount,
    averageScore,
    topScore,
    trendItems: items
      .slice(0, 6)
      .map((item, index) => ({
        id: item?._id || `grade-${index}`,
        label: item?.schoolClass?.title || item?.course?.title || `صنف ${index + 1}`,
        value: Number(item?.totalScore || 0)
      }))
  };
};

const deadlineText = (date) => {
  if (!date) return 'بدون موعد';
  const diffH = Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60));
  if (diffH < 24) return 'کمتر از 24 ساعت';
  const days = Math.ceil(diffH / 24);
  return `${days} روز مانده`;
};

const safeFetchJson = async (url) => {
  try {
    const response = await fetch(url, { headers: { ...getAuthHeaders() } });
    return await response.json().catch(() => ({}));
  } catch {
    return { success: false };
  }
};

export default function StudentDashboard() {
  const [user, setUser] = useState(null);
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [profileUpdateRequest, setProfileUpdateRequest] = useState(null);
  const [latestHomeworks, setLatestHomeworks] = useState([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [activeCoursesCount, setActiveCoursesCount] = useState(0);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [weeklyAttendance, setWeeklyAttendance] = useState(null);
  const [weeklyAttendanceLoading, setWeeklyAttendanceLoading] = useState(false);
  const [gradeSummary, setGradeSummary] = useState({ totalCount: 0, averageScore: 0, topScore: 0, trendItems: [] });
  const [homeworkSnapshot, setHomeworkSnapshot] = useState({ total: 0, pending: 0, submitted: 0 });

  const lastLogin = getLastLogin();
  const weeklyAttendanceSummary = weeklyAttendance?.summary || null;
  const weeklyAttendanceWindow = weeklyAttendance?.week || null;
  const hasWeeklyAttendance = Number(weeklyAttendanceSummary?.totalRecords || 0) > 0;

  const requestStatus = profileUpdateRequest?.status || 'none';
  const requestStatusLabel = requestStatus === 'approved'
    ? 'تایید شده'
    : requestStatus === 'rejected'
      ? 'رد شده'
      : requestStatus === 'pending'
        ? 'در انتظار تایید'
        : 'ثبت نشده';
  const requestStatusClass = requestStatus === 'approved'
    ? 'approved'
    : requestStatus === 'rejected'
      ? 'rejected'
      : requestStatus === 'pending'
        ? 'pending'
        : '';

  useEffect(() => {
    const loadProfile = async () => {
      const data = await safeFetchJson(`${API_BASE}/api/users/me`);
      if (data?.success) setUser(data.user);
      else setUser(null);
    };
    loadProfile();
  }, []);

  useEffect(() => {
    const loadSchedule = async () => {
      const data = await safeFetchJson(`${API_BASE}/api/schedules/today`);
      setTodaySchedule(data?.success ? (data.items || []) : []);
    };
    loadSchedule();
  }, []);

  useEffect(() => {
    const loadStudentData = async () => {
      const userId = localStorage.getItem('userId');
      if (!userId) return;

      const [requestData, coursesData, submissionsData, activityData, gradesData] = await Promise.all([
        safeFetchJson(`${API_BASE}/api/users/me/profile-update-request`),
        safeFetchJson(`${API_BASE}/api/education/my-courses`),
        safeFetchJson(`${API_BASE}/api/homeworks/my/submissions`),
        safeFetchJson(`${API_BASE}/api/users/me/activity`),
        safeFetchJson(`${API_BASE}/api/grades/my`)
      ]);

      setProfileUpdateRequest(requestData?.success ? (requestData.item || null) : null);

      const activeCourses = normalizeCourseItems(coursesData?.items || []);
      setActiveCoursesCount(activeCourses.length);

      const courseTargets = Array.from(
        new Map(
          activeCourses.map((course) => ([
            getCourseScopeId(course),
            {
              scopeId: getCourseScopeId(course),
              classId: getCourseClassId(course),
              courseId: getCompatCourseId(course),
              title: getCourseLabel(course)
            }
          ]))
        ).values()
      );

      const submittedHomeworkIds = new Set(
        (submissionsData?.items || [])
          .map((item) => item?.homework?._id)
          .filter(Boolean)
      );

      const homeworkResponses = await Promise.all(
        courseTargets.map((target) => safeFetchJson(`${API_BASE}/api/homeworks/class/${target.classId}`))
      );

      const allHomeworks = homeworkResponses.flatMap((data, idx) => (
        ((data?.success ? data.items : []) || []).map((hw) => ({
          ...hw,
          courseTitle: courseTargets[idx]?.title || 'صنف'
        }))
      ));

      const pendingHomeworks = allHomeworks.filter((hw) => !submittedHomeworkIds.has(hw._id));
      setHomeworkSnapshot({
        total: allHomeworks.length,
        pending: pendingHomeworks.length,
        submitted: submittedHomeworkIds.size
      });

      setLatestHomeworks(
        [...pendingHomeworks]
          .sort((a, b) => new Date(b.createdAt || b.dueDate || 0) - new Date(a.createdAt || a.dueDate || 0))
          .slice(0, 4)
      );

      setUpcomingDeadlines(
        pendingHomeworks
          .filter((hw) => !!hw.dueDate && new Date(hw.dueDate).getTime() >= Date.now())
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
          .slice(0, 4)
      );

      setRecentActivity((activityData?.items || []).slice(0, 5));
      setGradeSummary(buildGradeSummary(gradesData?.success ? (gradesData.items || []) : []));
    };

    loadStudentData();
  }, []);

  useEffect(() => {
    const loadFinanceData = async () => {
      const data = await safeFetchJson(`${API_BASE}/api/student-finance/me/overviews`);
      if (!data?.success) {
        setFinanceSummary(null);
        return;
      }
      setFinanceSummary(summarizeFinanceOverviews(data.items || []));
    };

    loadFinanceData();
  }, []);

  useEffect(() => {
    const loadWeeklyAttendance = async () => {
      setWeeklyAttendanceLoading(true);
      const data = await safeFetchJson(`${API_BASE}/api/attendance/my/weekly`);
      setWeeklyAttendance(data?.success ? data : null);
      setWeeklyAttendanceLoading(false);
    };

    loadWeeklyAttendance();
  }, []);

  const financeProgress = useMemo(() => {
    const totalDue = Number(financeSummary?.totalDue || 0);
    const totalPaid = Number(financeSummary?.totalPaid || 0);
    if (!totalDue) return 0;
    return Number(((totalPaid / totalDue) * 100).toFixed(1));
  }, [financeSummary]);

  const homeworkProgress = useMemo(() => {
    if (!homeworkSnapshot.total) return 0;
    return Number(((homeworkSnapshot.submitted / homeworkSnapshot.total) * 100).toFixed(1));
  }, [homeworkSnapshot]);

  const studentAlerts = useMemo(() => {
    const items = [];
    if (Number(financeSummary?.pendingReceipts || 0) > 0) {
      items.push({
        id: 'pending-receipts',
        title: 'رسیدهای در انتظار بررسی',
        subtitle: 'برای بعضی پرداخت‌های شما هنوز تایید نهایی ثبت نشده است.',
        meta: `${Number(financeSummary.pendingReceipts).toLocaleString('fa-AF-u-ca-persian')} مورد`
      });
    }
    if (Number(weeklyAttendanceSummary?.currentAbsentStreak || 0) > 0) {
      items.push({
        id: 'attendance-streak',
        title: 'رشته غیبت فعال',
        subtitle: 'برای جلوگیری از افت حاضری، وضعیت این هفته را بررسی کنید.',
        meta: `${Number(weeklyAttendanceSummary.currentAbsentStreak).toLocaleString('fa-AF-u-ca-persian')} روز`
      });
    }
    if (requestStatus === 'pending') {
      items.push({
        id: 'profile-request',
        title: 'درخواست مشخصات در انتظار تایید',
        subtitle: 'تغییرات پروفایل شما هنوز توسط مدیریت نهایی نشده است.',
        meta: 'در حال بررسی'
      });
    }
    return items;
  }, [financeSummary, requestStatus, weeklyAttendanceSummary]);

  const quickActions = [
    { to: '/my-finance', label: 'پرداخت فیس', caption: 'بل‌ها و رسیدها', tone: 'copper' },
    { to: '/my-grades', label: 'دیدن نتایج', caption: 'نمرات و کارنامه', tone: 'teal' },
    { to: '/my-attendance', label: 'حاضری من', caption: 'فیلتر و گزارش فردی', tone: 'mint' },
    { to: '/my-homework', label: 'کارخانگی', caption: 'تحویل و پیگیری', tone: 'slate' },
    { to: '/schedule', label: 'تقسیم اوقات', caption: 'برنامه روز و هفته', tone: 'teal' },
    { to: '/chat', label: 'چت صنفی', caption: 'ارتباط با صنف', tone: 'copper' }
  ];

  const attendanceBreakdownItems = [
    { id: 'present', label: 'حاضر', value: Number(weeklyAttendanceSummary?.present || 0) },
    { id: 'absent', label: 'غایب', value: Number(weeklyAttendanceSummary?.absent || 0) },
    { id: 'late', label: 'تاخیر', value: Number(weeklyAttendanceSummary?.late || 0) },
    { id: 'excused', label: 'رخصت', value: Number(weeklyAttendanceSummary?.excused || 0) }
  ].filter((item) => item.value > 0);

  const hero = (
    <div className="dash-hero">
      <div>
        <h2>خوش آمدید، {getName()}</h2>
        <p>داشبورد یکپارچه شاگرد برای نمرات، حاضری، مالی، کارخانگی و کارهای مهم روزانه.</p>
        {user?.grade && <p>پایه/صنف: {user.grade}</p>}
        {lastLogin && <p>آخرین ورود: {lastLogin}</p>}
      </div>
      <div className="dash-hero-actions">
        <NotificationBell apiBase={API_BASE} />
        <DashboardProfileCard user={user} fallbackName={getName()} apiBase={API_BASE} />
      </div>
    </div>
  );

  const stats = (
    <>
        <div>
          <KpiRingCard
            label="صنف‌های فعال"
            value={activeCoursesCount.toLocaleString('fa-AF-u-ca-persian')}
            hint="صنف‌های آموزشی جاری"
            progress={Math.min(activeCoursesCount * 20, 100)}
            tone="teal"
          />
        </div>
        <div>
          <KpiRingCard
            label="کارخانگی تکمیل‌شده"
            value={`${homeworkSnapshot.pending.toLocaleString('fa-AF-u-ca-persian')} در انتظار`}
            hint={`${homeworkSnapshot.total.toLocaleString('fa-AF-u-ca-persian')} کارخانگی کل`}
            progress={homeworkProgress}
            tone="copper"
          />
        </div>
        <div>
          <KpiRingCard
            label="جلسات امروز"
            value={todaySchedule.length.toLocaleString('fa-AF-u-ca-persian')}
            hint="برنامه منتشرشده امروز"
            progress={Math.min(todaySchedule.length * 25, 100)}
            tone="mint"
          />
        </div>
        <div>
          <KpiRingCard
            label="نرخ حضور"
            value={formatRate(weeklyAttendanceSummary?.attendanceRate || 0)}
            hint="خلاصه هفتگی حضور و غیاب"
            progress={weeklyAttendanceSummary?.attendanceRate || 0}
            tone="teal"
          />
        </div>
        <div>
          <KpiRingCard
            label="میانگین نمرات"
            value={`${gradeSummary.averageScore.toLocaleString('fa-AF-u-ca-persian')} / ۱۰۰`}
            hint={`${gradeSummary.totalCount.toLocaleString('fa-AF-u-ca-persian')} نتیجه ثبت شده`}
            progress={gradeSummary.averageScore || 0}
            tone="rose"
          />
        </div>
        <div>
          <KpiRingCard
            label="باقی‌مانده فیس"
            value={financeSummary ? formatMoney(financeSummary.totalRemaining) : '-'}
            hint={financeSummary ? `${formatMoney(financeSummary.totalPaid)} پرداخت شده` : 'وضعیت مالی'}
            progress={financeProgress}
            tone="slate"
          />
        </div>
      </>
  );

  const main = (
    <>
      <div className="dash-card">
        <div className="dash-card-header">
          <h3>وضعیت حضور و غیاب</h3>
          <span className="status">هفته جاری</span>
        </div>
        {weeklyAttendanceLoading && (
          <div className="dash-note">در حال دریافت وضعیت هفتگی حضور و غیاب...</div>
        )}
        {!weeklyAttendanceLoading && hasWeeklyAttendance && (
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
              <span>هفته: <strong>{toFaDate(weeklyAttendanceWindow?.start)} تا {toFaDate(weeklyAttendanceWindow?.end)}</strong></span>
              <span>کل رکوردها: <strong>{Number(weeklyAttendanceSummary?.totalRecords || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></span>
              <span>رشته غیبت فعلی: <strong>{Number(weeklyAttendanceSummary?.currentAbsentStreak || 0).toLocaleString('fa-AF-u-ca-persian')}</strong></span>
            </div>
            <TrendBars
              title="ترکیب حضور هفتگی"
              subtitle="بر پایه ثبت‌های همین هفته"
              items={attendanceBreakdownItems}
              valueKey="value"
              valueFormatter={(value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`}
              emptyText="برای این هفته داده‌ای برای نمایش وجود ندارد."
            />
          </>
        )}
        {!weeklyAttendanceLoading && !hasWeeklyAttendance && (
          <div className="dash-note">برای هفته جاری هنوز رکورد حضور و غیاب ثبت نشده است.</div>
        )}
        <div className="dash-actions">
          <Link className="dash-btn" to="/my-attendance">جزئیات حضور</Link>
        </div>
      </div>

      <div className="dash-card">
        <TrendBars
          title="روند نمرات"
          subtitle="آخرین نتایج ثبت‌شده بر اساس مجموع ۱۰۰ نمره"
          items={gradeSummary.trendItems}
          valueKey="value"
          valueFormatter={(value) => `${Number(value || 0).toLocaleString('fa-AF-u-ca-persian')} / ۱۰۰`}
          emptyText="هنوز نتیجه‌ای برای نمایش ثبت نشده است."
        />
        <div className="dash-actions">
          <Link className="dash-btn" to="/my-grades">مشاهده نمرات</Link>
        </div>
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <h3>وضعیت مالی</h3>
          <span className="status pending">بل شهریه</span>
        </div>
        <div className="dash-summary-grid">
          <div className="dash-summary-card">
            <span>کل بل‌ها</span>
            <strong>{Number(financeSummary?.totalBills || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
          <div className="dash-summary-card">
            <span>پرداخت‌شده</span>
            <strong>{formatMoney(financeSummary?.totalPaid || 0)}</strong>
          </div>
          <div className="dash-summary-card danger">
            <span>باقی‌مانده</span>
            <strong>{formatMoney(financeSummary?.totalRemaining || 0)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>رسید در انتظار</span>
            <strong>{Number(financeSummary?.pendingReceipts || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </div>
        </div>
        <div className="dash-actions">
          <Link className="dash-btn" to="/my-finance">نمایش بل‌ها</Link>
          <Link className="dash-btn pdf" to="/my-finance">ارسال رسید</Link>
        </div>
      </div>

      <div className="dash-card">
        <TaskAlertPanel
          title="کارهای معطل"
          subtitle="مهم‌ترین مواردی که نیاز به اقدام شما دارند"
          items={latestHomeworks.map((item) => ({
            id: item._id,
            title: item.title,
            subtitle: item.courseTitle,
            meta: deadlineText(item.dueDate)
          }))}
          emptyText="در حال حاضر کارخانگی معطلی برای شما وجود ندارد."
          actionLabel="باز کردن کارخانگی"
          actionTo="/my-homework"
        />
      </div>

      <div className="dash-card">
        <div className="dash-card-header">
          <h3>وضعیت مشخصات</h3>
          <span className={`status ${requestStatusClass}`}>{requestStatusLabel}</span>
        </div>
        <p className="dash-desc">درخواست تغییر مشخصات و وضعیت تایید آن از همین داشبورد قابل پیگیری است.</p>
        <div className="dash-actions">
          <Link className="dash-btn" to="/profile">حساب کاربری</Link>
        </div>
      </div>
    </>
  );

  const side = (
    <>
      <div className="dash-panel">
        <h3>برنامه امروز</h3>
        {!todaySchedule.length && <div className="dash-note">برای امروز برنامه‌ای ثبت نشده است.</div>}
        {todaySchedule.map((item) => (
          <div key={item._id} className="dash-panel-row">
            <span>{item.subject} - {item.instructor?.name || 'استاد'}</span>
            <span>{item.startTime} - {item.endTime}</span>
          </div>
        ))}
      </div>

      <div className="dash-panel">
        <h3>موعدهای نزدیک</h3>
        {!upcomingDeadlines.length && <div className="dash-note">موعد نزدیکی ثبت نشده است.</div>}
        {upcomingDeadlines.map((item) => (
          <div key={item._id} className="dash-panel-row">
            <span>{item.title}</span>
            <span>{deadlineText(item.dueDate)}</span>
          </div>
        ))}
      </div>

      <div className="dash-panel">
        <h3>هشدارها و پیگیری‌ها</h3>
        {!studentAlerts.length && <div className="dash-note">هشدار مهمی برای شما ثبت نشده است.</div>}
        {studentAlerts.map((item) => (
          <div key={item.id} className="dash-panel-row">
            <span>{item.title}</span>
            <span>{item.meta}</span>
          </div>
        ))}
      </div>

      <div className="dash-panel">
        <h3>فعالیت‌های اخیر من</h3>
        {!recentActivity.length && <div className="dash-note">فعالیتی ثبت نشده است.</div>}
        {recentActivity.map((item) => (
          <div key={item._id} className="dash-panel-row">
            <span>{item.action || 'فعالیت'}</span>
            <span>{toFaDate(item.createdAt)}</span>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <DashboardShell
      className="student-dashboard-page"
      hero={hero}
      stats={stats}
      quickActions={<QuickActionRail actions={quickActions} className="dash-quick" />}
      main={main}
      side={side}
    />
  );
}
