import React from 'react';
import NotificationBell from '../NotificationBell';

// نوارِ بالای مبایل: بازگشت (سمت راست چون صفحه راست‌به‌چپ است) — عنوانِ صفحه —
// زنگ اعلان و دکمهٔ پروفایل. جای لینک‌های پراکندهٔ «بازگشت» را می‌گیرد که الان
// فقط چند صفحه دارند.
export default function MobileTopbar({
  title = '',
  showBack = false,
  onBack,
  onOpenProfile,
  userName = 'کاربر',
  avatarSrc = ''
}) {
  const initial = String(userName || 'ک').trim().charAt(0) || 'ک';

  return (
    <header className="mobile-shell__topbar">
      {showBack ? (
        <button
          type="button"
          className="mobile-shell__icon-btn"
          onClick={onBack}
          aria-label="بازگشت"
        >
          <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </button>
      ) : (
        <span className="mobile-shell__topbar-mark" aria-hidden="true">ای</span>
      )}

      <h1 className="mobile-shell__topbar-title">{title}</h1>

      <div className="mobile-shell__topbar-actions">
        <NotificationBell />
        {/* دایرهٔ ۳۴px داخلِ یک دکمهٔ ۴۴px می‌نشیند تا ناحیهٔ لمس به حداقل برسد
            بدون اینکه آواتار در نوارِ ۵۶px بزرگ و ناجور شود. */}
        <button
          type="button"
          className="mobile-shell__avatar-btn"
          onClick={onOpenProfile}
          aria-label={`حساب ${userName}`}
        >
          <span className="mobile-shell__avatar" aria-hidden="true">
            {avatarSrc
              ? <img src={avatarSrc} alt="" loading="lazy" decoding="async" />
              : initial}
          </span>
        </button>
      </div>
    </header>
  );
}
