import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE as DEFAULT_API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';
import './NotificationBell.css';

const SOUND_PREF_KEY = 'school_notify_sound_enabled_v1';
const SOUND_MASTER_GAIN = 0.82;
const SOUND_MIN_GAP_MS = 420;

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toFaDateTime = (value) => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || '-';
};

const normalizeItem = (item) => ({
  _id: item?._id || `${Date.now()}-${Math.random()}`,
  title: item?.title || '\u0627\u0639\u0644\u0627\u0646',
  message: item?.message || '',
  type: item?.type || 'system',
  category: item?.category || '',
  eventKey: item?.eventKey || '',
  level: item?.level || '',
  actionUrl: item?.actionUrl || '',
  needsAction: Boolean(item?.needsAction),
  createdAt: item?.createdAt || new Date().toISOString(),
  readAt: item?.readAt || null
});

const resolveLevelLabel = (level) => {
  const value = String(level || '').toLowerCase();
  if (value === 'critical') return 'فوری';
  if (value === 'warning') return 'هشدار';
  if (value === 'info') return 'اطلاع';
  return '';
};

const getInitialSoundEnabled = () => {
  try {
    return localStorage.getItem(SOUND_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
};

const setStoredSoundEnabled = (enabled) => {
  try {
    localStorage.setItem(SOUND_PREF_KEY, enabled ? 'on' : 'off');
  } catch {
    // ignore
  }
};

const resolveToneType = (type) => {
  const value = String(type || '').toLowerCase();
  if (
    value.includes('finance')
    || value.includes('payment')
    || value.includes('receipt')
    || value.includes('mali')
    || value.includes('\u0645\u0627\u0644\u06cc')
  ) return 'finance';
  if (
    value.includes('course')
    || value.includes('enroll')
    || value.includes('class_request')
    || value.includes('class')
    || value.includes('\u0635\u0646\u0641')
  ) return 'course_request';
  if (
    value.includes('profile')
    || value.includes('identity')
    || value.includes('account')
    || value.includes('\u067e\u0631\u0648\u0641\u0627\u06cc\u0644')
  ) return 'profile_update';
  return 'system';
};

const TONE_MAP = {
  finance: [
    { freq: 740, offset: 0.0, duration: 0.1, wave: 'triangle', gain: 0.032 },
    { freq: 980, offset: 0.11, duration: 0.13, wave: 'sine', gain: 0.03 }
  ],
  course_request: [
    { freq: 590, offset: 0.0, duration: 0.11, wave: 'sine', gain: 0.028 },
    { freq: 760, offset: 0.12, duration: 0.11, wave: 'sine', gain: 0.03 },
    { freq: 910, offset: 0.24, duration: 0.14, wave: 'triangle', gain: 0.028 }
  ],
  profile_update: [
    { freq: 520, offset: 0.0, duration: 0.14, wave: 'sine', gain: 0.026 },
    { freq: 460, offset: 0.14, duration: 0.12, wave: 'triangle', gain: 0.024 }
  ],
  system: [
    { freq: 800, offset: 0.0, duration: 0.14, wave: 'sine', gain: 0.03 },
    { freq: 1020, offset: 0.1, duration: 0.14, wave: 'triangle', gain: 0.026 }
  ]
};

const playToneSegment = (ctx, tone) => {
  const now = ctx.currentTime + tone.offset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const peakGain = Math.max(0.0001, Math.min(0.06, tone.gain * SOUND_MASTER_GAIN));
  const attack = Math.max(0.01, Math.min(0.02, tone.duration * 0.35));

  osc.type = tone.wave;
  osc.frequency.setValueAtTime(tone.freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + tone.duration + 0.02);
};

const playNotificationToneByType = (ctx, type) => {
  const toneType = resolveToneType(type);
  const pattern = TONE_MAP[toneType] || TONE_MAP.system;
  pattern.forEach((tone) => playToneSegment(ctx, tone));
};

export default function NotificationBell({
  apiBase = DEFAULT_API_BASE,
  types = null,
  title = '\u0627\u0639\u0644\u0627\u0646\u200c\u0647\u0627',
  maxItems = 12,
  pollMs = 25000,
  panelPath = '',
  showLabel = false,
  triggerClassName = ''
}) {
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const ringTimerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const knownIdsRef = useRef(new Set());
  const loadedOnceRef = useRef(false);
  const lastSoundAtRef = useRef(0);

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(getInitialSoundEnabled);
  const [ringing, setRinging] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});

  const allowedTypes = useMemo(() => {
    if (!Array.isArray(types) || !types.length) return null;
    return new Set(types.map((item) => String(item || '').trim()).filter(Boolean));
  }, [types]);

  const includeItem = useCallback((item) => {
    if (!allowedTypes) return true;
    return allowedTypes.has(String(item?.type || ''));
  }, [allowedTypes]);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null;
    if (audioCtxRef.current) return audioCtxRef.current;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioCtxRef.current = new AudioContextCtor();
    return audioCtxRef.current;
  }, []);

  const primeAudio = useCallback(() => {
    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }, [ensureAudioContext]);

  const triggerIncomingFeedback = useCallback((type = 'system') => {
    setRinging(true);
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = window.setTimeout(() => setRinging(false), 1100);

    if (!soundEnabled) return;
    const nowMs = Date.now();
    if (nowMs - lastSoundAtRef.current < SOUND_MIN_GAP_MS) return;
    lastSoundAtRef.current = nowMs;
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playNotificationToneByType(ctx, type)).catch(() => {});
      return;
    }
    playNotificationToneByType(ctx, type);
  }, [ensureAudioContext, soundEnabled]);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/users/me/notifications`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) return;

      const nextItems = (data.items || [])
        .map((item) => normalizeItem(item))
        .filter((item) => includeItem(item))
        .slice(0, maxItems);

      let newUnreadCount = 0;
      let firstNewUnreadType = 'system';
      if (loadedOnceRef.current) {
        nextItems.forEach((item) => {
          if (!item.readAt && !knownIdsRef.current.has(item._id)) {
            newUnreadCount += 1;
            if (firstNewUnreadType === 'system' && item?.type) {
              firstNewUnreadType = item.type;
            }
          }
        });
      }

      knownIdsRef.current = new Set(nextItems.map((item) => item._id));
      loadedOnceRef.current = true;

      setItems(nextItems);
      setUnread(nextItems.filter((item) => !item.readAt).length);

      if (newUnreadCount > 0) {
        triggerIncomingFeedback(firstNewUnreadType);
      }
    } catch {
      // ignore
    }
  }, [apiBase, includeItem, maxItems, triggerIncomingFeedback]);

  useEffect(() => {
    loadNotifications();
    const timer = window.setInterval(loadNotifications, pollMs);
    return () => window.clearInterval(timer);
  }, [loadNotifications, pollMs]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return () => {};

    const socket = io(apiBase, { auth: { token } });
    socket.on('notify:new', (raw) => {
      const item = normalizeItem(raw);
      if (!includeItem(item)) return;

      const isNew = !knownIdsRef.current.has(item._id);
      knownIdsRef.current.add(item._id);

      setItems((prev) => [item, ...prev.filter((row) => row._id !== item._id)].slice(0, maxItems));
      if (isNew && !item.readAt) {
        setUnread((prev) => prev + 1);
        triggerIncomingFeedback(item.type);
      }
    });

    return () => socket.disconnect();
  }, [apiBase, includeItem, maxItems, triggerIncomingFeedback]);

  useEffect(() => {
    if (!open) return () => {};
    const onDocClick = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const updatePopoverPosition = useCallback(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return;

    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const edgeGap = 10;
    const preferredWidth = 440;
    const minWidth = 280;

    const triggerRect = triggerEl.getBoundingClientRect();
    const width = Math.max(minWidth, Math.min(preferredWidth, viewportWidth - edgeGap * 2));

    let left = triggerRect.right - width;
    if (left < edgeGap) left = edgeGap;
    const maxLeft = viewportWidth - width - edgeGap;
    if (left > maxLeft) left = maxLeft;

    let top = triggerRect.bottom + 10;
    let maxHeight = Math.min(560, Math.floor(viewportHeight - top - edgeGap));

    if (maxHeight < 260) {
      const upwardSpace = Math.floor(triggerRect.top - edgeGap - 10);
      if (upwardSpace > 260) {
        maxHeight = Math.min(560, upwardSpace);
        top = Math.max(edgeGap, triggerRect.top - maxHeight - 10);
      } else {
        maxHeight = Math.max(220, Math.floor(viewportHeight - top - edgeGap));
      }
    }

    setPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.max(220, maxHeight)}px`
    });
  }, [open]);

  useEffect(() => {
    if (!open) return () => {};
    updatePopoverPosition();

    const onWindowChange = () => updatePopoverPosition();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);
    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [open, updatePopoverPosition]);

  useEffect(() => () => {
    if (ringTimerRef.current) window.clearTimeout(ringTimerRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
  }, []);

  const markOneRead = async (id) => {
    if (!id) return;
    try {
      await fetch(`${apiBase}/api/users/me/notifications/${id}/read`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      await loadNotifications();
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!unread || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/users/me/notifications/read-all`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
        setUnread(0);
      }
    } catch {
      // ignore
    } finally {
      setBusy(false);
    }
  };

  const togglePopover = () => {
    primeAudio();
    setOpen((prev) => !prev);
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setStoredSoundEnabled(next);
      if (next) {
        primeAudio();
      }
      return next;
    });
  };

  const panelContent = (
    <>
      <div className="notify-head">
        <strong>{title}</strong>
        <div className="notify-head-actions">
          <button
            type="button"
            className={`notify-sound-btn ${soundEnabled ? 'on' : 'off'}`}
            onClick={toggleSound}
            title={soundEnabled ? '\u0635\u062f\u0627 \u0631\u0648\u0634\u0646 \u0627\u0633\u062a' : '\u0635\u062f\u0627 \u062e\u0627\u0645\u0648\u0634 \u0627\u0633\u062a'}
          >
            {soundEnabled ? '\u0635\u062f\u0627: \u0631\u0648\u0634\u0646' : '\u0635\u062f\u0627: \u062e\u0627\u0645\u0648\u0634'}
          </button>
          {unread > 0 && (
            <button
              type="button"
              className="notify-read-all"
              onClick={markAllRead}
              disabled={busy}
            >
              {busy ? '\u062f\u0631 \u062d\u0627\u0644...' : '\u062e\u0648\u0627\u0646\u062f\u0646 \u0647\u0645\u0647'}
            </button>
          )}
        </div>
      </div>

      {!items.length && <div className="notify-empty">{'\u0627\u0639\u0644\u0627\u0646\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f.'}</div>}

      {!!items.length && (
        <div className="notify-list">
          {items.map((item) => (
            <div key={item._id} className={`notify-item ${item.readAt ? '' : 'unread'}`}>
              <div className="notify-body">
                <div className="notify-item-head">
                  <strong>{item.title}</strong>
                  {!!resolveLevelLabel(item.level) && (
                    <span className={`notify-level-badge level-${String(item.level || '').toLowerCase()}`}>
                      {resolveLevelLabel(item.level)}
                    </span>
                  )}
                </div>
                <span>{item.message}</span>
                <small>{toFaDateTime(item.createdAt)}</small>
              </div>
              <div className="notify-item-actions">
                {!item.readAt && (
                  <button type="button" className="notify-mark-btn" onClick={() => markOneRead(item._id)}>
                    {'\u062e\u0648\u0627\u0646\u062f\u0647 \u0634\u062f'}
                  </button>
                )}
                {!!item.actionUrl && (
                  <a className="notify-open-link" href={item.actionUrl}>
                    {'\u062c\u0632\u0626\u06cc\u0627\u062a'}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!!panelPath && (
        <a className="notify-footer-link" href={panelPath}>
          {'\u0645\u0634\u0627\u0647\u062f\u0647 \u0647\u0645\u0647'}
        </a>
      )}
    </>
  );

  return (
    <div className="notify-wrap" ref={wrapperRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`notify-trigger ${showLabel ? 'with-label' : ''} ${triggerClassName} ${ringing ? 'is-ringing' : ''}`.trim()}
        onClick={togglePopover}
        aria-label={title}
      >
        <i className="fa-solid fa-bell notify-icon" aria-hidden="true" />
        {showLabel && <span className="notify-trigger-label">{title}</span>}
        {unread > 0 && <span className="notify-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notify-popover" ref={popoverRef} style={popoverStyle}>
          {panelContent}
        </div>
      )}
    </div>
  );
}
