import React from 'react';
import { Link } from 'react-router-dom';
import './AccessDenied.css';

function AccessDenied({
  title = 'دسترسی محدود',
  message = 'شما اجازه ورود به این بخش را ندارید.',
  currentRoleLabel = '',
  requiredLabel = '',
  actionHref = '/dashboard',
  actionLabel = 'بازگشت به داشبورد',
  secondaryHref = '/',
  secondaryLabel = 'صفحه خانه',
  onRequestAccess = null,
  requestActionLabel = 'درخواست دسترسی',
  requestActionLoading = false,
  requestFeedback = '',
  requestFeedbackTone = 'info',
  quickLinks = []
}) {
  const showCompare = !!(currentRoleLabel && requiredLabel);
  const links = Array.isArray(quickLinks) ? quickLinks.filter((item) => item?.href && item?.label) : [];

  return (
    <section className="access-denied" role="alert" aria-live="polite">
      <div className="access-denied__badge" aria-hidden="true">
        <i className="fa-solid fa-lock" />
      </div>
      <p className="access-denied__eyebrow">دسترسی رد شد</p>
      <h2 className="access-denied__title">{title}</h2>
      <p className="access-denied__message">{message}</p>

      {showCompare && (
        <div className="access-denied__compare">
          <div className="access-denied__slot">
            <span className="access-denied__slot-label">پست فعلی شما</span>
            <span className="access-denied__slot-value">{currentRoleLabel}</span>
          </div>
          <i className="fa-solid fa-arrow-left access-denied__compare-arrow" aria-hidden="true" />
          <div className="access-denied__slot access-denied__slot--need">
            <span className="access-denied__slot-label">دسترسی لازم</span>
            <span className="access-denied__slot-value">{requiredLabel}</span>
          </div>
        </div>
      )}

      <div className="access-denied__actions">
        <Link to={actionHref} className="access-denied__btn access-denied__btn--primary">
          <i className="fa-solid fa-gauge" aria-hidden="true" />
          {actionLabel}
        </Link>
        {typeof onRequestAccess === 'function' && (
          <button
            type="button"
            className="access-denied__btn access-denied__btn--warn"
            onClick={onRequestAccess}
            disabled={requestActionLoading}
          >
            <i className="fa-solid fa-hand" aria-hidden="true" />
            {requestActionLoading
              ? 'در حال ارسال...'
              : requestActionLabel}
          </button>
        )}
        <Link to={secondaryHref} className="access-denied__btn access-denied__btn--ghost">
          {secondaryLabel}
        </Link>
      </div>

      {requestFeedback ? (
        <p className={`access-denied__feedback access-denied__feedback--${requestFeedbackTone}`}>
          {requestFeedback}
        </p>
      ) : null}

      {links.length > 0 && (
        <div className="access-denied__quick">
          <span className="access-denied__quick-label">این‌ها برای شما در دسترس است</span>
          <div className="access-denied__chips">
            {links.map((item) => (
              <Link key={item.href} to={item.href} className="access-denied__chip">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="access-denied__foot">
        اگر فکر می‌کنید این یک اشتباه است، از مدیر مکتب یا ریاست عمومی درخواست دسترسی بدهید.
      </p>
    </section>
  );
}

export default AccessDenied;
