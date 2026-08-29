import React from 'react';
import NotificationBell from '../NotificationBell';
import DashboardProfileCard from '../DashboardProfileCard';

// نوار بالایی مشترک داشبوردها (استاد، شاگرد، والد...) — مطابق طرح مصوب: نشان مکتب + breadcrumb
// در یک سو، زنگ اعلان + کارت پروفایل در سوی دیگر. رنگ نشان (data-tone) هر داشبورد را متمایز می‌کند
// بدون اینکه ساختار یا برند مکتب تغییر کند.
export default function DashboardTopbar({
  crumb = '',
  tone = 'teal',
  user = null,
  fallbackName = 'کاربر',
  apiBase = '',
  notificationTitle = 'اعلان‌ها',
  notificationPanelPath = ''
}) {
  return (
    <div className="dashboard-topbar" data-tone={tone}>
      <div className="dashboard-topbar__brand">
        <div className="dashboard-topbar__mark">ای</div>
        <div className="dashboard-topbar__brand-text">
          <strong>مکتب دخترانه ایمان</strong>
          <small>سامانه مدیریت مکتب</small>
        </div>
      </div>
      <div className="dashboard-topbar__crumb">{crumb}</div>
      <div className="dashboard-topbar__actions">
        <NotificationBell
          apiBase={apiBase}
          title={notificationTitle}
          panelPath={notificationPanelPath}
        />
        <DashboardProfileCard user={user} fallbackName={fallbackName} apiBase={apiBase} variant="dropdown" />
      </div>
    </div>
  );
}
