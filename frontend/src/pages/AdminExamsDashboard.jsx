import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import '../components/dashboard/dashboard.css';
import DashboardShell from '../components/dashboard/DashboardShell';
import KpiRingCard from '../components/dashboard/KpiRingCard';
import QuickActionRail from '../components/dashboard/QuickActionRail';
import TaskAlertPanel from '../components/dashboard/TaskAlertPanel';
import TrendBars from '../components/dashboard/TrendBars';
import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getName = () => localStorage.getItem('userName') || 'مدیر محترم';

const safeFetchJson = async (url) => {
  try {
    const response = await fetch(url, { headers: { ...getAuthHeaders() } });
    return await response.json().catch(() => ({}));
  } catch {
    return { success: false };
  }
};

const toFaNumber = (value) => Number(value || 0).toLocaleString('fa-AF-u-ca-persian');
const formatPercent = (value) => `${toFaNumber(value)}%`;

export default function AdminExamsDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadDashboard = async () => {
      setLoading(true);
      const data = await safeFetchJson(`${API_BASE}/api/dashboard/exams`);
      if (!cancelled) {
        setDashboard(data?.success ? data : null);
        setLoading(false);
      }
    };
    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = dashboard?.summary || {
    activeSessions: 0,
    publishedSessions: 0,
    draftSessions: 0,
    averageMark: 0,
    passRate: 0,
    pendingResults: 0
  };

  const stats = useMemo(() => ([
    <KpiRingCard
      key="active"
      label="جلسه‌های فعال"
      value={toFaNumber(summary.activeSessions)}
      hint={`${toFaNumber(summary.publishedSessions)} منتشرشده`}
      progress={Math.min(100, Number(summary.activeSessions || 0) * 25)}
      tone="teal"
    />,
    <KpiRingCard
      key="pass-rate"
      label="نرخ کامیابی"
      value={formatPercent(summary.passRate)}
      hint={`${toFaNumber(summary.pendingResults)} نتیجه در انتظار`}
      progress={summary.passRate}
      tone="mint"
    />,
    <KpiRingCard
      key="average"
      label="میانگین نمرات"
      value={toFaNumber(summary.averageMark)}
      hint={`${toFaNumber(summary.draftSessions)} جلسه پیش‌نویس`}
      progress={Math.min(100, Number(summary.averageMark || 0))}
      tone="copper"
    />,
    <KpiRingCard
      key="pending"
      label="نتیجه‌های در انتظار"
      value={toFaNumber(summary.pendingResults)}
      hint="نیازمند پیگیری"
      progress={Math.min(100, Number(summary.pendingResults || 0) * 10)}
      tone="rose"
    />
  ]), [summary]);

  const quickActions = (
    <QuickActionRail
      actions={[
        { to: '/quiz-builder', label: 'ایجاد امتحان', caption: 'ساخت جلسه و سوالات', tone: 'copper' },
        { to: '/grade-manager', label: 'مدیریت نمرات', caption: 'مرور نمره‌ها و تصحیح', tone: 'teal' },
        { to: '/admin-reports', label: 'گزارش‌های آموزشی', caption: 'خروجی و مقایسه', tone: 'mint' },
        { to: '/admin-education', label: 'مرکز مدیریت آموزش', caption: 'صنف و مضمون', tone: 'slate' }
      ]}
    />
  );

  const hero = (
    <div className="dash-hero">
      <div>
        <h2>داشبورد امتحانات</h2>
        <p>
          {`سلام ${getName()}، از این صفحه وضعیت جلسه‌های فعال، میانگین نمرات، نتیجه‌های در انتظار و تحلیل عملکرد امتحانات را یک‌جا می‌بینید.`}
        </p>
        <div className="dash-meta">
          <span>جلسه‌های منتشرشده: {toFaNumber(summary.publishedSessions)}</span>
          <span>پیش‌نویس‌ها: {toFaNumber(summary.draftSessions)}</span>
          <span>آخرین بروزرسانی: {formatAfghanDateTime(dashboard?.generatedAt, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          }) || '-'}</span>
        </div>
      </div>
      <div className="dash-hero-actions">
        <Link className="dash-btn" to="/quiz-builder">ایجاد امتحان</Link>
        <Link className="dash-btn ghost" to="/grade-manager">مدیریت نمرات</Link>
      </div>
    </div>
  );

  const main = (
    <>
      <div className="dash-card dashboard-summary-card">
        <div className="dashboard-summary-card__head">
          <div>
            <h3>خلاصه کلیدی امتحانات</h3>
            <p className="muted">
              تصویری سریع از وضعیت جلسه‌ها، نرخ کامیابی و نمرات برای تصمیم‌گیری روزانه.
            </p>
          </div>
          <div className="dashboard-summary-card__note">
            {loading ? 'در حال دریافت خلاصه...' : 'برای جزییات بیشتر روی گزارش‌ها و مدیریت نمرات بروید.'}
          </div>
        </div>
        <div className="dashboard-summary-card__grid">{stats}</div>
        <div className="dashboard-summary-card__quick">{quickActions}</div>
      </div>

      <div className="dash-card">
        <TrendBars
          title="روند وضعیت جلسه‌ها"
          subtitle="تفکیک وضعیت جلسه‌های امتحان"
          items={dashboard?.statusTrend || []}
          valueFormatter={(value) => `${toFaNumber(value)} جلسه`}
        />
      </div>

      <div className="dash-card">
        <TrendBars
          title="میانگین نتیجه‌های اخیر"
          subtitle="به تفکیک جلسه‌های تازه"
          items={dashboard?.recentSessions || []}
          valueFormatter={(value) => `${toFaNumber(value)} از 100`}
          emptyText="برای جلسه‌های اخیر هنوز نتیجه‌ای ثبت نشده است."
        />
      </div>
    </>
  );

  const side = (
    <>
      <div className="dash-card">
        <TaskAlertPanel
          title="کارهای باز"
          subtitle="مهم‌ترین موردهای امروز"
          items={(dashboard?.tasks || []).map((item) => ({
            id: item.id,
            title: item.label,
            subtitle: item.meta,
            meta: item.tone === 'rose' ? 'فوری' : item.tone === 'copper' ? 'نیازمند پیگیری' : 'آماده'
          }))}
          emptyText="کار باز مهمی برای امتحانات دیده نشد."
          actionLabel="باز کردن آزمون‌ساز"
          actionTo="/quiz-builder"
        />
      </div>

      <div className="dash-card">
        <TaskAlertPanel
          title="هشدارها"
          subtitle="مواردی که باید بررسی شوند"
          items={(dashboard?.alerts || []).map((item) => ({
            id: item.id,
            title: item.label,
            subtitle: item.meta
          }))}
          emptyText="هشدار فعالی برای این بخش دیده نمی‌شود."
          actionLabel="گزارش‌ها"
          actionTo="/admin-reports"
        />
      </div>
    </>
  );

  return (
    <DashboardShell
      className="exams-dashboard-page"
      hero={hero}
      main={main}
      side={side}
    />
  );
}
