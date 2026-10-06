import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MobileTopbar from './MobileTopbar';
import MobileTabBar from './MobileTabBar';
import MobileDrawer from './MobileDrawer';
import {
  DRAWER_TAB_KEY,
  getMobileDrawerGroups,
  getMobilePageTitle,
  getMobileTabs
} from '../../config/mobileNav';
import './mobile-shell.css';

// پوستهٔ مبایل برای ناحیهٔ داخلیِ سیستم. امروز `hideMainNav` در App.jsx هر
// هدر و منویی را به‌محض ورود به یک صفحهٔ داخلی پنهان می‌کند، پس کاربر روی گوشی
// هیچ نقطهٔ ثابتی برای حرکت ندارد — این کامپوننت همان را می‌دهد.
//
// هر سه بخش `position: fixed` هستند، پس جایشان در درخت JSX اهمیتی ندارد و
// App.jsx لازم نیست بازچینی شود. فاصلهٔ محتوا از نوارها در mobile-shell.css روی
// `.dashboard-content` گرفته می‌شود.
//
// نمایش/پنهان شدن با CSS انجام می‌شود نه JS: `matchMedia` در کل پروژه استفاده
// نشده و افزودنش یعنی رندر دوباره هنگام تغییر عرض. زیر ۹۰۰px دیده می‌شود،
// بالاتر `display: none` — پس دسکتاپ دقیقاً دست‌نخورده می‌ماند.
export default function MobileShell({
  role = '',
  can,
  userName = 'کاربر',
  roleLabel = '',
  avatarSrc = '',
  panelPath = '/dashboard',
  onLogout
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const path = location.pathname;
  const tabs = useMemo(() => getMobileTabs(role, can), [role, can]);
  const drawerGroups = useMemo(() => getMobileDrawerGroups(role, can), [role, can]);
  const title = useMemo(() => getMobilePageTitle(path), [path]);

  // طولانی‌ترین مسیرِ منطبق برنده است، وگرنه «/dashboard» با هر مسیری که با آن
  // شروع شود اشتباه می‌گیرد.
  const activeKey = useMemo(() => {
    let best = '';
    let bestLength = -1;
    tabs.forEach((tab) => {
      if (!tab.to) return;
      const tabPath = tab.to.split('?')[0];
      const matches = path === tabPath || path.startsWith(`${tabPath}/`);
      if (matches && tabPath.length > bestLength) {
        best = tab.key;
        bestLength = tabPath.length;
      }
    });
    return best;
  }, [tabs, path]);

  const homePath = useMemo(() => {
    const home = tabs.find((tab) => tab.key !== DRAWER_TAB_KEY && tab.to);
    return home?.to || panelPath;
  }, [tabs, panelPath]);

  // روی خانهٔ یک تب دکمهٔ بازگشت معنی ندارد — کاربر همان‌جاست که نوار پایین
  // نشانش می‌دهد.
  const showBack = !activeKey || path !== (tabs.find((tab) => tab.key === activeKey)?.to || '').split('?')[0];

  useEffect(() => {
    setDrawerOpen(false);
  }, [path]);

  const handleBack = useCallback(() => {
    // ورود با لینک مستقیم تاریخچه‌ای ندارد و `navigate(-1)` کاربر را از سیستم
    // بیرون می‌برد؛ در آن حالت به خانهٔ نقش می‌رویم.
    const idx = window.history?.state?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
      return;
    }
    navigate(homePath);
  }, [navigate, homePath]);

  return (
    <div className="mobile-shell" data-role={role || 'user'}>
      <MobileTopbar
        title={title}
        showBack={showBack}
        onBack={handleBack}
        onOpenProfile={() => setDrawerOpen(true)}
        userName={userName}
        avatarSrc={avatarSrc}
      />

      <MobileTabBar
        tabs={tabs}
        activeKey={activeKey}
        drawerOpen={drawerOpen}
        onOpenDrawer={() => setDrawerOpen((value) => !value)}
      />

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={drawerGroups}
        userName={userName}
        roleLabel={roleLabel}
        avatarSrc={avatarSrc}
        panelPath={panelPath}
        onLogout={onLogout}
      />
    </div>
  );
}
