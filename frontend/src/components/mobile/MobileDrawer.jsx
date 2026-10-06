import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// کشوی «همه» — تمام‌صفحه، از راست باز می‌شود. فهرستِ کامل ۴۰ ابزارِ پنل این‌جا
// نمی‌آید (روی گوشی قابل استفاده نیست)؛ گروه‌ها همان گروه‌های پنل‌اند با
// مقصدهایی که از گوشی به کار می‌آیند، و آخرِ کشو یک لینک به خودِ پنل می‌رود که
// فهرستِ کامل و جستجو را دارد.
export default function MobileDrawer({
  open = false,
  onClose,
  groups = [],
  userName = 'کاربر',
  roleLabel = '',
  avatarSrc = '',
  panelPath = '',
  onLogout
}) {
  const panelRef = useRef(null);
  const initial = String(userName || 'ک').trim().charAt(0) || 'ک';

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // بدونِ این، پشتِ کشو هنوز اسکرول می‌شود و کاربر فکر می‌کند کشو گیر کرده.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div className="mobile-shell__drawer-backdrop" onClick={onClose}>
      <aside
        ref={panelRef}
        className="mobile-shell__drawer"
        role="dialog"
        aria-modal="true"
        aria-label="فهرست بخش‌ها"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-shell__drawer-head">
          <div className="mobile-shell__drawer-identity">
            <span className="mobile-shell__drawer-avatar" aria-hidden="true">
              {avatarSrc ? <img src={avatarSrc} alt="" loading="lazy" decoding="async" /> : initial}
            </span>
            <span className="mobile-shell__drawer-identity-text">
              <strong>{userName}</strong>
              {!!roleLabel && <small>{roleLabel}</small>}
            </span>
          </div>
          <button
            type="button"
            className="mobile-shell__icon-btn"
            onClick={onClose}
            aria-label="بستن"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="mobile-shell__drawer-body">
          {groups.map((group) => (
            <section key={group.title} className="mobile-shell__drawer-group">
              <h2>{group.title}</h2>
              <div className="mobile-shell__drawer-links">
                {group.items.map((item) => (
                  <Link key={`${group.title}-${item.to}-${item.label}`} to={item.to} onClick={onClose}>
                    <span>{item.label}</span>
                    <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <section className="mobile-shell__drawer-group">
            <h2>حساب من</h2>
            <div className="mobile-shell__drawer-links">
              <Link to="/profile" onClick={onClose}>
                <span>پروفایل</span>
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
              </Link>
              {!!panelPath && (
                <Link to={panelPath} onClick={onClose}>
                  <span>فهرست کامل بخش‌ها</span>
                  <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                </Link>
              )}
              <button type="button" className="mobile-shell__drawer-logout" onClick={onLogout}>
                <span>خروج از حساب</span>
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              </button>
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
