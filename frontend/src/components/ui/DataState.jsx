import React from 'react';
import { ERROR_KINDS, describeError, isApiError } from '../../utils/apiClient';
import { SkeletonBlock } from './Skeleton';
import './DataState.css';

// One component for the four states every data-driven view has: loading, failed,
// empty, and loaded. Pages used to hand-roll these — mostly by rendering nothing
// for the first three — which is exactly why a slow or dead backend looked like
// a broken database.

const ERROR_TITLES = {
  [ERROR_KINDS.OFFLINE]: 'ارتباط انترنتی قطع است',
  [ERROR_KINDS.NETWORK]: 'سرور در دسترس نیست',
  [ERROR_KINDS.TIMEOUT]: 'پاسخ سرور طول کشید',
  [ERROR_KINDS.DB_DOWN]: 'دیتابیس در دسترس نیست',
  [ERROR_KINDS.STARTING]: 'سرور در حال آماده‌سازی است',
  [ERROR_KINDS.SERVER]: 'خطای سرور',
  [ERROR_KINDS.UNAUTHORIZED]: 'نشست شما منقضی شده',
  [ERROR_KINDS.FORBIDDEN]: 'دسترسی ندارید',
  [ERROR_KINDS.NOT_FOUND]: 'یافت نشد',
  [ERROR_KINDS.CLIENT]: 'درخواست پذیرفته نشد'
};

const ERROR_ICONS = {
  [ERROR_KINDS.OFFLINE]: '📶',
  [ERROR_KINDS.NETWORK]: '🔌',
  [ERROR_KINDS.TIMEOUT]: '⏳',
  [ERROR_KINDS.DB_DOWN]: '🗄️',
  [ERROR_KINDS.STARTING]: '⏱️',
  [ERROR_KINDS.UNAUTHORIZED]: '🔑',
  [ERROR_KINDS.FORBIDDEN]: '🚫',
  [ERROR_KINDS.NOT_FOUND]: '🔍'
};

const isEmptyValue = (value) => {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

export function DataErrorCard({ error, onRetry, compact = false }) {
  const kind = isApiError(error) ? error.kind : ERROR_KINDS.SERVER;
  const title = ERROR_TITLES[kind] || ERROR_TITLES[ERROR_KINDS.SERVER];
  const icon = ERROR_ICONS[kind] || '⚠️';
  const message = describeError(error);
  const status = isApiError(error) ? error.status : 0;
  const isAuthProblem = kind === ERROR_KINDS.UNAUTHORIZED;

  return (
    <div className={`data-state-error ${compact ? 'is-compact' : ''}`} role="alert">
      <span className="data-state-error-icon" aria-hidden="true">{icon}</span>
      <div className="data-state-error-body">
        <strong className="data-state-error-title">{title}</strong>
        <p className="data-state-error-message">{message}</p>
        <div className="data-state-error-actions">
          {isAuthProblem ? (
            <a className="data-state-button" href="/login">ورود دوباره</a>
          ) : onRetry && (
            <button type="button" className="data-state-button" onClick={onRetry}>
              تلاشِ دوباره
            </button>
          )}
          {/* The status code is what an admin needs when reporting the fault,
              and it is meaningless noise for everyone else — hence the aside. */}
          {status > 0 && <span className="data-state-error-code">{`کد: ${status}`}</span>}
        </div>
      </div>
    </div>
  );
}

export function DataEmptyCard({ message = 'موردی برای نمایش وجود ندارد.', hint = '', action = null }) {
  return (
    <div className="data-state-empty">
      <span className="data-state-empty-icon" aria-hidden="true">📭</span>
      <strong>{message}</strong>
      {!!hint && <p className="data-state-empty-hint">{hint}</p>}
      {action}
    </div>
  );
}

/**
 * Render whichever of the four states currently applies.
 *
 *   <DataState loading={loading} error={error} data={rows} onRetry={reload}
 *              skeleton="table" emptyMessage="شاگردی ثبت نشده است">
 *     {(rows) => <StudentTable rows={rows} />}
 *   </DataState>
 *
 * `children` may be a node or a function of the loaded data.
 */
export default function DataState({
  loading = false,
  refreshing = false,
  error = null,
  data = undefined,
  onRetry = null,
  skeleton = 'text',
  skeletonProps = {},
  emptyMessage = 'موردی برای نمایش وجود ندارد.',
  emptyHint = '',
  emptyAction = null,
  showEmpty = true,
  loadingLabel = 'در حال بارگذاری...',
  lastUpdatedAt = null,
  compactError = false,
  children
}) {
  // First load: nothing on screen yet, so show the shape of what is coming.
  if (loading && isEmptyValue(data)) {
    return (
      <div className="data-state-loading" role="status" aria-live="polite" aria-busy="true">
        <span className="data-state-loading-label">
          <span className="data-state-spinner" aria-hidden="true" />
          {loadingLabel}
        </span>
        <SkeletonBlock variant={skeleton} {...skeletonProps} />
      </div>
    );
  }

  if (error && isEmptyValue(data)) {
    return <DataErrorCard error={error} onRetry={onRetry} compact={compactError} />;
  }

  if (showEmpty && !error && isEmptyValue(data)) {
    return <DataEmptyCard message={emptyMessage} hint={emptyHint} action={emptyAction} />;
  }

  const content = typeof children === 'function' ? children(data) : children;

  return (
    <div className={`data-state-content ${refreshing ? 'is-refreshing' : ''}`}>
      {/* A reload that failed, or that is still running, must not silently
          replace good data — it is announced above it instead. */}
      {!!error && (
        <div className="data-state-stale-note" role="alert">
          <span>{describeError(error)}</span>
          {onRetry && (
            <button type="button" className="data-state-button is-small" onClick={onRetry}>
              تلاشِ دوباره
            </button>
          )}
        </div>
      )}
      {refreshing && (
        <div className="data-state-refreshing-note" role="status" aria-live="polite">
          <span className="data-state-spinner" aria-hidden="true" />
          در حال به‌روزرسانی...
        </div>
      )}
      {content}
      {!!lastUpdatedAt && !refreshing && (
        <p className="data-state-updated">
          {`آخرین به‌روزرسانی: ${new Date(lastUpdatedAt).toLocaleTimeString('fa-AF')}`}
        </p>
      )}
    </div>
  );
}
