import React from 'react';
import { Link } from 'react-router-dom';
import './AccessDenied.css';

function AccessDenied({
  title = '\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062D\u062F\u0648\u062F',
  message = '\u0634\u0645\u0627 \u0627\u062C\u0627\u0632\u0647 \u0648\u0631\u0648\u062F \u0628\u0647 \u0627\u06CC\u0646 \u0628\u062E\u0634 \u0631\u0627 \u0646\u062F\u0627\u0631\u06CC\u062F.',
  actionHref = '/dashboard',
  actionLabel = '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u062F\u0627\u0634\u0628\u0648\u0631\u062F',
  secondaryHref = '/',
  secondaryLabel = '\u0635\u0641\u062D\u0647 \u062E\u0627\u0646\u0647',
  onRequestAccess = null,
  requestActionLabel = '\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062F\u0633\u062A\u0631\u0633\u06CC',
  requestActionLoading = false,
  requestFeedback = '',
  requestFeedbackTone = 'info'
}) {
  return (
    <section className="access-denied" role="alert" aria-live="polite">
      <div className="access-denied__icon" aria-hidden="true">
        <i className="fa-solid fa-shield-halved" />
      </div>
      <h2 className="access-denied__title">{title}</h2>
      <p className="access-denied__message">{message}</p>
      <div className="access-denied__actions">
        <Link to={actionHref} className="access-denied__btn access-denied__btn--primary">
          {actionLabel}
        </Link>
        {typeof onRequestAccess === 'function' && (
          <button
            type="button"
            className="access-denied__btn access-denied__btn--warn"
            onClick={onRequestAccess}
            disabled={requestActionLoading}
          >
            {requestActionLoading
              ? '\u062F\u0631 \u062D\u0627\u0644 \u0627\u0631\u0633\u0627\u0644...'
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
    </section>
  );
}

export default AccessDenied;
