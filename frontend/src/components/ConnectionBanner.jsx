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
const CREEP_TICK_MS = 300;
const PATIENCE_MS = 6000;
// Never let the bar sit at 100% while work is still outstanding — a full bar
// that keeps waiting is what makes people think the page has hung.
const CEILING = 92;

/**
 * Progress for a burst of requests, plus a labelled pill.
 *
 * A bare sweeping line was not read as "data is loading": it carries no words
 * and shows no progress, so a page opening 28 requests looked exactly like one
 * opening a single slow one. This tracks the busiest moment of a burst and
 * reports how much of it has come back, which turns the same signal into
 * something that visibly advances — and says so in words.
 */
export function GlobalProgressBar() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const [waitedLong, setWaitedLong] = useState(false);

  const showTimerRef = useRef(null);
  const peakRef = useRef(0);
  const inFlightRef = useRef(0);
  const startedAtRef = useRef(0);

  useEffect(() => subscribeToRequestActivity((inFlight) => {
    inFlightRef.current = inFlight;

    if (inFlight > 0) {
      peakRef.current = Math.max(peakRef.current, inFlight);
      if (showTimerRef.current || visible) return;
      startedAtRef.current = Date.now();
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        setVisible(true);
      }, PROGRESS_DELAY_MS);
      return;
    }

    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    // Let the bar finish to the end before it goes, so the eye sees it complete
    // rather than vanish part-way.
    peakRef.current = 0;
    setProgress(100);
    setWaitedLong(false);
    window.setTimeout(() => {
      if (inFlightRef.current === 0) {
        setVisible(false);
        setProgress(0);
      }
    }, 280);
  }), [visible]);

  useEffect(() => {
    if (!visible) return undefined;

    const id = window.setInterval(() => {
      const peak = peakRef.current;
      const inFlight = inFlightRef.current;
      if (!peak || !inFlight) return;

      const elapsed = Date.now() - startedAtRef.current;
      setWaitedLong(elapsed > PATIENCE_MS);

      // How much of the burst has come back.
      const settled = ((peak - inFlight) / peak) * 100;
      // A lone request would otherwise sit at zero for its whole life, so time
      // alone also advances the bar, asymptotically and never past the ceiling.
      const byTime = CEILING * (1 - Math.exp(-elapsed / 4000));

      setProgress((previous) => Math.min(CEILING, Math.max(previous, settled, byTime)));
    }, CREEP_TICK_MS);

    return () => window.clearInterval(id);
  }, [visible]);

  useEffect(() => () => {
    if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div className="global-progress" aria-hidden="true">
        <span className="global-progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="global-activity" role="status" aria-live="polite">
        <span className="global-activity-spinner" aria-hidden="true" />
        <span className="global-activity-text">
          {waitedLong ? 'هنوز در حال دریافت اطلاعات است...' : 'در حال دریافت اطلاعات...'}
        </span>
      </div>
    </>
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
