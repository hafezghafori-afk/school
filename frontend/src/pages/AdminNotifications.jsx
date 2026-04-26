import React, { useEffect, useMemo, useState } from 'react';
import './AdminNotifications.css';

import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';

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

const LEVEL_LABELS = {
  critical: 'حساس',
  warning: 'نیازمند اقدام',
  info: 'اطلاعاتی'
};

const EVENT_LABELS = {
  reminder: 'یادآوری',
  workflow: 'پیگیری',
  receipt: 'رسید',
  payment: 'پرداخت',
  submission: 'ارسال',
  approval: 'تایید',
  rejection: 'رد',
  relief: 'تسهیلات',
  system: 'سیستمی',
  new_registration: 'ثبت‌نام جدید',
  registration_approved: 'تایید ثبت‌نام',
  registration_rejected: 'رد ثبت‌نام',
  document_upload: 'آپلود سند',
  payment_overdue: 'تاخیر پرداخت',
  membership_renewed: 'تمدید عضویت',
  password_reset: 'بازیابی رمز عبور',
  schedule_change: 'تغییر تقسیم‌اوقات'
};

const CATEGORY_LABELS = {
  finance: 'مالی',
  workflow: 'گردش‌کار',
  schedule: 'تقسیم اوقات',
  profile: 'پروفایل',
  general: 'عمومی'
};

const SOURCE_LABELS = {
  finance: 'هسته مالی',
  workflow: 'موتور پیگیری',
  schedule: 'زمان‌بندی',
  profile: 'خدمات حساب',
  general: 'سیستم'
};

const buildSearchText = (item = {}) => (
  [
    item.title,
    item.message,
    item.eventKey,
    item.level,
    item.category,
    item.sourceModule
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
);

const normalizeItem = (item = {}) => ({
  _id: item?._id || `${Date.now()}-${Math.random()}`,
  title: item?.title || 'اعلان مالی',
  message: item?.message || '',
  type: item?.type || 'finance',
  category: item?.category || 'finance',
  eventKey: item?.eventKey || 'system',
  level: item?.level || 'info',
  sourceModule: item?.sourceModule || item?.category || 'finance',
  actionUrl: item?.actionUrl || '',
  needsAction: Boolean(item?.needsAction),
  createdAt: item?.createdAt || new Date().toISOString(),
  readAt: item?.readAt || null
});

const buildSummaryFallback = (items = []) => ({
  total: items.length,
  unread: items.filter((item) => !item.readAt).length,
  read: items.filter((item) => item.readAt).length,
  needsAction: items.filter((item) => item.needsAction).length,
  byLevel: {
    critical: items.filter((item) => item.level === 'critical').length,
    warning: items.filter((item) => item.level === 'warning').length,
    info: items.filter((item) => item.level === 'info').length
  }
});

export default function AdminNotifications() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(buildSummaryFallback([]));
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    level: 'all',
    event: 'all'
  });

  const loadNotifications = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({
        category: 'finance',
        limit: '150'
      });
      const res = await fetch(`${API_BASE}/api/users/me/notifications?${params.toString()}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setItems([]);
        setSummary(buildSummaryFallback([]));
        setMessage(data?.message || 'دریافت اعلان‌ها ممکن نشد.');
        return;
      }
      const nextItems = Array.isArray(data.items) ? data.items.map((item) => normalizeItem(item)) : [];
      setItems(nextItems);
      setSummary(data?.summary || buildSummaryFallback(nextItems));
      setSelectedId((prev) => {
        if (prev && nextItems.some((item) => item._id === prev)) return prev;
        return nextItems[0]?._id || '';
      });
    } catch {
      setItems([]);
      setSummary(buildSummaryFallback([]));
      setMessage('خطا در دریافت اعلان‌های مالی');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const filteredItems = useMemo(() => (
    items.filter((item) => {
      const statusMatches = filters.status === 'all'
        ? true
        : filters.status === 'unread'
          ? !item.readAt
          : Boolean(item.readAt);
      const levelMatches = filters.level === 'all' ? true : item.level === filters.level;
      const eventMatches = filters.event === 'all' ? true : item.eventKey === filters.event;
      const searchMatches = !filters.search || buildSearchText(item).includes(String(filters.search || '').trim().toLowerCase());
      return statusMatches && levelMatches && eventMatches && searchMatches;
    })
  ), [filters.event, filters.level, filters.search, filters.status, items]);

  useEffect(() => {
    if (!items.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (selectedId && items.some((item) => item._id === selectedId)) {
      return;
    }
    setSelectedId(filteredItems[0]?._id || items[0]?._id || '');
  }, [filteredItems, items, selectedId]);

  const selectedItem = useMemo(() => (
    items.find((item) => item._id === selectedId) || filteredItems[0] || items[0] || null
  ), [filteredItems, items, selectedId]);

  const setItemReadState = async (item, nextRead) => {
    if (!item?._id) return;
    setBusy(true);
    setMessage('');
    try {
      const endpoint = nextRead ? 'read' : 'unread';
      const res = await fetch(`${API_BASE}/api/users/me/notifications/${item._id}/${endpoint}`, {
        method: 'POST',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'بروزرسانی اعلان انجام نشد.');
        return;
      }
      await loadNotifications({ silent: true });
      setMessage(nextRead ? 'اعلان به‌عنوان خوانده‌شده ثبت شد.' : 'اعلان دوباره به حالت نخوانده برگشت.');
    } catch {
      setMessage('خطا در بروزرسانی اعلان');
    } finally {
      setBusy(false);
    }
  };

  const markAllFinanceRead = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/users/me/notifications/read-all`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ category: 'finance' })
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خواندن اعلان‌ها انجام نشد.');
        return;
      }
      await loadNotifications({ silent: true });
      setMessage(`اعلان‌های مالی خوانده شد${Number(data.count || 0) ? ` (${data.count})` : ''}.`);
    } catch {
      setMessage('خطا در خواندن اعلان‌های مالی');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notify-page notify-page-v2">
      <div className="notify-shell">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <section className="notify-hero">
          <div className="notify-hero-copy">
            <span className="notify-kicker">مرکز اعلان‌های سیستم</span>
            <h2>مرکز اعلان‌های مالی</h2>
            <p>
              یادآوری بدهی، ارسال رسید، تایید یا رد پرداخت، و اعلان‌های مربوط به تخفیف و معافیت
              از همین بخش خوانده، فیلتر و پیگیری می‌شوند.
            </p>
          </div>
          <div className="notify-hero-actions">
            <button type="button" className="secondary" onClick={() => loadNotifications()} disabled={busy || loading} data-testid="notification-refresh">
              {loading ? 'در حال تازه‌سازی...' : 'تازه‌سازی'}
            </button>
            <button type="button" onClick={markAllFinanceRead} disabled={busy || loading || !summary.unread} data-testid="notification-mark-all">
              خواندن همه اعلان‌های مالی
            </button>
          </div>
        </section>

        <section className="notify-kpis" data-testid="notification-center-summary">
          <article className="notify-kpi">
            <span>کل اعلان‌ها</span>
            <strong>{Number(summary.total || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="notify-kpi accent-warning">
            <span>نخوانده</span>
            <strong>{Number(summary.unread || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="notify-kpi accent-critical">
            <span>حساس</span>
            <strong>{Number(summary.byLevel?.critical || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
          <article className="notify-kpi accent-info">
            <span>اقدام باز</span>
            <strong>{Number(summary.needsAction || 0).toLocaleString('fa-AF-u-ca-persian')}</strong>
          </article>
        </section>

        <section className="notify-toolbar">
          <label className="notify-field notify-field-wide">
            <span>جستجو</span>
            <input
              data-testid="notification-center-search"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
              placeholder="عنوان، پیام، نوع رویداد یا منبع اعلان"
            />
          </label>

          <label className="notify-field">
            <span>وضعیت</span>
            <select
              data-testid="notification-filter-status"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="all">همه</option>
              <option value="unread">نخوانده</option>
              <option value="read">خوانده‌شده</option>
            </select>
          </label>

          <label className="notify-field">
            <span>شدت</span>
            <select
              data-testid="notification-filter-level"
              value={filters.level}
              onChange={(e) => setFilters((prev) => ({ ...prev, level: e.target.value }))}
            >
              <option value="all">همه</option>
              <option value="critical">حساس</option>
              <option value="warning">نیازمند اقدام</option>
              <option value="info">اطلاعاتی</option>
            </select>
          </label>

          <label className="notify-field">
            <span>نوع رویداد</span>
            <select
              data-testid="notification-filter-event"
              value={filters.event}
              onChange={(e) => setFilters((prev) => ({ ...prev, event: e.target.value }))}
            >
              <option value="all">همه</option>
              <option value="reminder">یادآوری</option>
              <option value="workflow">پیگیری</option>
              <option value="submission">ارسال</option>
              <option value="approval">تایید</option>
              <option value="rejection">رد</option>
              <option value="relief">تسهیلات</option>
              <option value="payment">پرداخت</option>
              <option value="receipt">رسید</option>
              <option value="new_registration">ثبت‌نام جدید</option>
              <option value="registration_approved">تایید ثبت‌نام</option>
              <option value="registration_rejected">رد ثبت‌نام</option>
              <option value="document_upload">آپلود سند</option>
              <option value="payment_overdue">تاخیر پرداخت</option>
            </select>
          </label>
        </section>

        {message ? <div className="notify-message">{message}</div> : null}

        <section className="notify-layout">
          <div className="notify-list-panel">
            <div className="notify-panel-head">
              <h3>صندوق اعلان‌ها</h3>
              <span>{Number(filteredItems.length).toLocaleString('fa-AF-u-ca-persian')} مورد</span>
            </div>

            <div className="notify-list" data-testid="notification-center-list">
              {!filteredItems.length ? (
                <div className="notify-empty">
                  هیچ اعلان مالی با این فیلتر پیدا نشد.
                </div>
              ) : (
                filteredItems.map((item) => (
                  <button
                    key={item._id}
                    type="button"
                    className={`notify-item-card ${selectedItem?._id === item._id ? 'active' : ''} ${item.readAt ? 'read' : 'unread'} ${item.level}`}
                    onClick={() => setSelectedId(item._id)}
                    data-testid={`notification-item-${item._id}`}
                  >
                    <div className="notify-item-head">
                      <strong>{item.title}</strong>
                      <span className={`notify-state-badge ${item.readAt ? 'read' : 'unread'}`}>
                        {item.readAt ? 'خوانده شده' : 'نخوانده'}
                      </span>
                    </div>
                    <p>{item.message}</p>
                    <div className="notify-pill-row">
                      <span className={`notify-pill level-${item.level}`}>{LEVEL_LABELS[item.level] || item.level}</span>
                      <span className="notify-pill neutral">{EVENT_LABELS[item.eventKey] || item.eventKey}</span>
                      <span className="notify-pill neutral">{SOURCE_LABELS[item.sourceModule] || CATEGORY_LABELS[item.category] || item.sourceModule}</span>
                    </div>
                    <div className="notify-item-meta">
                      <span>{toFaDateTime(item.createdAt)}</span>
                      {item.needsAction ? <span>اقدام لازم</span> : <span>اطلاع‌رسانی</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <aside className="notify-detail-panel" data-testid="notification-center-detail">
            {!selectedItem ? (
              <div className="notify-empty detail-empty">
                برای دیدن جزئیات، یکی از اعلان‌های مالی را انتخاب کنید.
              </div>
            ) : (
              <>
                <div className="notify-panel-head">
                  <div>
                    <h3>{selectedItem.title}</h3>
                    <p>{selectedItem.readAt ? 'این اعلان قبلاً بررسی شده است.' : 'این اعلان هنوز در وضعیت نخوانده قرار دارد.'}</p>
                  </div>
                  <span className={`notify-pill level-${selectedItem.level}`}>{LEVEL_LABELS[selectedItem.level] || selectedItem.level}</span>
                </div>

                <div className="notify-detail-grid">
                  <div>
                    <span>نوع رویداد</span>
                    <strong>{EVENT_LABELS[selectedItem.eventKey] || selectedItem.eventKey}</strong>
                  </div>
                  <div>
                    <span>دسته</span>
                    <strong>{CATEGORY_LABELS[selectedItem.category] || selectedItem.category}</strong>
                  </div>
                  <div>
                    <span>منبع</span>
                    <strong>{SOURCE_LABELS[selectedItem.sourceModule] || selectedItem.sourceModule}</strong>
                  </div>
                  <div>
                    <span>ثبت در</span>
                    <strong>{toFaDateTime(selectedItem.createdAt)}</strong>
                  </div>
                  <div>
                    <span>وضعیت</span>
                    <strong>{selectedItem.readAt ? 'خوانده شده' : 'نخوانده'}</strong>
                  </div>
                  <div>
                    <span>اقدام</span>
                    <strong>{selectedItem.needsAction ? 'نیازمند اقدام' : 'اطلاع‌رسانی'}</strong>
                  </div>
                </div>

                <div className="notify-detail-message">
                  <span>متن اعلان</span>
                  <p>{selectedItem.message || 'برای این اعلان پیام تفصیلی ثبت نشده است.'}</p>
                </div>

                <div className="notify-detail-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setItemReadState(selectedItem, !selectedItem.readAt)}
                    disabled={busy}
                    data-testid="notification-toggle-read"
                  >
                    {selectedItem.readAt ? 'برگرداندن به نخوانده' : 'ثبت به‌عنوان خوانده‌شده'}
                  </button>
                  {selectedItem.actionUrl ? (
                    <a href={selectedItem.actionUrl}>
                      باز کردن بخش مربوط
                    </a>
                  ) : (
                    <span className="notify-inline-muted">برای این اعلان مسیر مستقیم تعریف نشده است.</span>
                  )}
                </div>
              </>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}
