import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MobileTopbar from './MobileTopbar';
import MobileTabBar from './MobileTabBar';
import MobileDrawer from './MobileDrawer';
import {
  DRAWER_TAB_KEY,
  getMobileDrawerGroups,
  getMobilePageTitle,
  getMobileTabs,
  tabHashOf,
  tabPathOf
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

  // خانه‌هایی که روی یک صفحه می‌مانند باید همان query را با خود ببرند. داشبورد
  // والد با `?studentId=` تعیین می‌کند کدام فرزند نشان داده شود؛ بدون این،
  // زدنِ «فیس» انتخابِ فرزند را دور می‌ریخت.
  const resolveHref = useCallback((tab) => {
    const base = tabPathOf(tab);
    if (base !== path || !location.search) return tab.to;
    return `${base}${location.search}${tabHashOf(tab)}`;
  }, [path, location.search]);

  // طولانی‌ترین مسیرِ منطبق برنده است، وگرنه «/dashboard» با هر مسیری که با آن
  // شروع شود اشتباه می‌گیرد. لنگر هم شمرده می‌شود: داشبورد والد چند خانه روی
  // یک مسیر دارد و بدون این، همیشه اولی («خانه») پررنگ می‌ماند.
  const activeKey = useMemo(() => {
    const hash = location.hash || '';
    let best = '';
    let bestScore = -1;
    tabs.forEach((tab) => {
      if (!tab.to) return;
      const base = tabPathOf(tab);
      if (path !== base && !path.startsWith(`${base}/`)) return;
      const tabHash = tabHashOf(tab);
      // یک خانهٔ لنگردار فقط وقتی فعال است که همان لنگر در آدرس باشد؛ خانهٔ
      // بی‌لنگر هر آدرسِ آن مسیر را می‌پذیرد ولی ضعیف‌تر از یک لنگرِ منطبق.
      if (tabHash && tabHash !== hash) return;
      const score = base.length + (tabHash ? 1000 : 0);
      if (score > bestScore) {
        best = tab.key;
        bestScore = score;
      }
    });
    return best;
  }, [tabs, path, location.hash]);

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

  // React Router لنگر را فقط در آدرس می‌گذارد و خودش جایی نمی‌رود. بدون این،
  // زدنِ «حاضری» در داشبورد والد آدرس را عوض می‌کرد و صفحه سرِ جایش می‌ماند —
  // دقیقاً همان حسِ «دکمه کار نمی‌کند». فاصله به اندازهٔ نوار بالا گرفته می‌شود
  // وگرنه عنوانِ بخش زیرِ آن پنهان می‌ماند.
  useEffect(() => {
    const hash = location.hash;
    if (!hash || hash.length < 2) return undefined;

    let cancelled = false;
    let timer = 0;
    let waited = 0;

    const jump = () => {
      if (cancelled) return;
      let target = null;
      try {
        target = document.querySelector(hash);
      } catch {
        return; // لنگرِ نامعتبر، نه چیزی برای تلاش دوباره
      }

      if (!target) {
        // بخش‌های داشبورد والد بعد از رسیدنِ داده ساخته می‌شوند و ممکن است چند
        // ثانیه طول بکشد؛ یک بار امتحان کردن یعنی در عمل هیچ‌وقت کار نکند.
        if (waited >= 3000) return;
        waited += 150;
        timer = window.setTimeout(jump, 150);
        return;
      }

      // `scroll-margin-top` روی خودِ هدف نوشته می‌شود، نه با یک قاعدهٔ `:target`
      // در CSS: مرورگر `:target` را فقط با پیمایشِ واقعی به‌روز می‌کند و
      // React Router با `pushState` جابه‌جا می‌شود، پس آن قاعده هیچ‌وقت نمی‌گرفت
      // و بخش زیرِ نوارِ بالا پنهان می‌ماند.
      const topbar = document.querySelector('.mobile-shell__topbar');
      const barHeight = topbar?.getBoundingClientRect().height || 0;
      target.style.scrollMarginTop = `${Math.round(barHeight) + 8}px`;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    jump();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [location.hash, path]);

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
        resolveHref={resolveHref}
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
