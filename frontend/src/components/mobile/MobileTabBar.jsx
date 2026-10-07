import React from 'react';
import { Link } from 'react-router-dom';
import { DRAWER_TAB_KEY } from '../../config/mobileNav';

// نوارِ پایین — پنج خانه، آخری «همه» که کشو را باز می‌کند. خانه‌هایی که کاربر
// دسترسی‌شان را ندارد پیش‌تر در getMobileTabs حذف شده‌اند، پس این‌جا فقط رندر
// می‌شود.
export default function MobileTabBar({
  tabs = [],
  activeKey = '',
  resolveHref,
  onOpenDrawer,
  drawerOpen = false
}) {
  return (
    <nav className="mobile-shell__tabbar" aria-label="ناوبری اصلی">
      {tabs.map((tab) => {
        const isDrawer = tab.key === DRAWER_TAB_KEY;
        const isActive = isDrawer ? drawerOpen : tab.key === activeKey;
        const className = `mobile-shell__tab${isActive ? ' is-active' : ''}`;

        if (isDrawer) {
          return (
            <button
              key={tab.key}
              type="button"
              className={className}
              onClick={onOpenDrawer}
              aria-expanded={drawerOpen}
            >
              <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        }

        return (
          <Link
            key={tab.key}
            to={typeof resolveHref === 'function' ? resolveHref(tab) : tab.to}
            className={className}
            aria-current={isActive ? 'page' : undefined}
          >
            <i className={`fa-solid ${tab.icon}`} aria-hidden="true" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
