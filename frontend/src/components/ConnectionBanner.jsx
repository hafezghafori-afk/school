import React, { useEffect, useRef, useState } from 'react';
import {
  CONNECTION,
  checkApiHealth,
  subscribeToConnection,
  subscribeToRequestActivity
} from '../utils/apiClient';
import './ConnectionBanner.css';

// The two app-wide signals. They cost every page nothing and are the reason a
// stalled request can no longer look like a page that simply has no data: the
// bar proves something is happening, the banner says what went wrong.

const PROGRESS_DELAY_MS = 220;
const RECHECK_MS = 6000;

/**
 * Indeterminate bar pinned to the top of the window whenever any request is in
 * flight. Held back briefly so quick calls don't make the UI flicker.
 */
export function GlobalProgressBar() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => subscribeToRequestActivity((inFlight) => {
    if (inFlight > 0) {
      if (timerRef.current || visible) return;
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setVisible(true);
      }, PROGRESS_DELAY_MS);
      return;
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setVisible(false);
  }), [visible]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  if (!visible) return null;

  return (
    <div className="global-progress" role="status" aria-live="polite" aria-label="در حال دریافت اطلاعات">
      <span className="global-progress-bar" />
    </div>
  );
}

const BANNER_TEXT = {
  [CONNECTION.OFFLINE]: {
    tone: 'bad',
    icon: '📶',
    title: 'ارتباط انترنتی قطع است',
    body: 'اطلاعات تازه دریافت نمی‌شود. به‌محضِ وصل‌شدن، خودکار دوباره تلاش می‌کنیم.'
  },
  [CONNECTION.SERVER_DOWN]: {
    tone: 'bad',
    icon: '🔌',
    title: 'سرور در دسترس نیست',
    body: 'ممکن است سرور خاموش باشد یا انترنت شما ضعیف باشد.'
  },
  [CONNECTION.DB_DOWN]: {
    tone: 'bad',
    icon: '🗄️',
    title: 'دیتابیس در دسترس نیست',
    body: 'سرور فعال است اما به دیتابیس وصل نیست. اطلاعات شما محفوظ است.'
  },
  [CONNECTION.STARTING]: {
    tone: 'warn',
    icon: '⏱️',
    title: 'سرور در حال آماده‌سازی است',
    body: 'چند لحظه صبر کنید؛ به‌صورت خودکار دوباره تلاش می‌کنیم.'
  },
  [CONNECTION.SLOW]: {
    tone: 'warn',
    icon: '🐢',
    title: 'انترنت یا سرور کند است',
    body: 'پاسخ بیش از حد طول کشید. می‌توانید دوباره تلاش کنید.'
  }
};

/**
 * App-wide connection banner. Renders nothing while things are healthy, so it
 * costs a working session no space at all.
 */
export function ConnectionBanner() {
  const [connection, setConnection] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => subscribeToConnection(setConnection), []);

  const status = connection?.status;
  const text = BANNER_TEXT[status];

  // While the backend is mid-restart, poll until it answers — this is what
  // makes the app recover on its own after a deploy instead of leaving the
  // user on a dead page wondering whether to refresh.
  useEffect(() => {
    if (status !== CONNECTION.STARTING && status !== CONNECTION.DB_DOWN) return undefined;
    const id = window.setInterval(() => { checkApiHealth({ markChecking: false }); }, RECHECK_MS);
    return () => window.clearInterval(id);
  }, [status]);

  if (!text) return null;

  const retry = async () => {
    setChecking(true);
    await checkApiHealth();
    setChecking(false);
  };

  return (
    <div className={`connection-banner is-${text.tone}`} role="alert">
      <span className="connection-banner-icon" aria-hidden="true">{text.icon}</span>
      <span className="connection-banner-body">
        <strong>{text.title}</strong>
        <span className="connection-banner-text">{connection?.message || text.body}</span>
      </span>
      <button type="button" className="connection-banner-retry" onClick={retry} disabled={checking}>
        {checking ? 'در حال بررسی...' : 'بررسی دوباره'}
      </button>
    </div>
  );
}

export default ConnectionBanner;
