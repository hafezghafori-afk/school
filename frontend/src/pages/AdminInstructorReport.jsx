import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';

import AfghanDateInput from '../components/ui/AfghanDateInput';
import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  formatNumber,
  toLocaleDateTime
} from './adminWorkspaceUtils';
import {
  getActionLabel,
  getActionSeverity,
  getTargetLink,
  getTargetTypeLabel
} from '../utils/activityLogLabels';

const PAGE_SIZE = 50;

const DEVICE_OPTIONS = [
  { value: '', label: 'همه دستگاه‌ها' },
  { value: 'desktop', label: 'دیسکتاپ' },
  { value: 'mobile', label: 'موبایل' },
  { value: 'tablet', label: 'تبلت' },
  { value: 'bot', label: 'بات/اسکریپت' },
  { value: 'unknown', label: 'نامشخص' }
];

const EMPTY_FILTERS = {
  dateFrom: '',
  dateTo: '',
  q: '',
  device: '',
  sensitiveOnly: false
};

export default function AdminInstructorReport() {
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState('');
  const [userId, setUserId] = useState('');

  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const loadUsers = async () => {
    try {
      // /api/admin-logs/actors (not /api/admin/users) — same view_reports permission as the
      // rest of this page, so a report-only admin doesn't need manage_users access just to
      // pick a teacher/admin here.
      const data = await fetchJson('/api/admin-logs/actors');
      const items = data.items || [];
      setUsers(items);
      setUserId((current) => current || items[0]?._id || '');
    } catch (error) {
      setUsers([]);
      setMessage(errorMessage(error, 'دریافت فهرست کاربران ناموفق بود.'));
      setMessageTone('error');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const visibleUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => (
      String(user.name || '').toLowerCase().includes(query)
      || String(user.email || '').toLowerCase().includes(query)
    ));
  }, [users, userSearch]);

  const selectedUser = useMemo(
    () => users.find((user) => user._id === userId) || null,
    [users, userId]
  );

  const buildQueryParams = (pageValue) => {
    const params = new URLSearchParams();
    if (userId) params.set('actor', userId);
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.device) params.set('device', filters.device);
    if (filters.sensitiveOnly) params.set('sensitive', 'true');
    if (pageValue) {
      params.set('page', String(pageValue));
      params.set('pageSize', String(PAGE_SIZE));
    }
    return params;
  };

  const fetchLogs = async (reset = true) => {
    if (!userId) {
      setMessage('یک کاربر را انتخاب کنید.');
      setMessageTone('error');
      return;
    }
    const nextPage = reset ? 1 : page + 1;
    const setBusy = reset ? setLoading : setLoadingMore;
    setBusy(true);
    if (reset) setMessage('');
    try {
      const params = buildQueryParams(nextPage);
      const data = await fetchJson(`/api/admin-logs?${params.toString()}`);
      const items = data.items || [];
      setLogs((current) => (reset ? items : [...current, ...items]));
      setTotal(data.total || 0);
      setPage(nextPage);
      if (reset) {
        setHasSearched(true);
        if (!items.length) {
          setMessage('هیچ لاگی برای این فیلترها ثبت نشده است.');
          setMessageTone('info');
        }
      }
    } catch (error) {
      setMessage(errorMessage(error, 'در زمان دریافت گزارش خطا رخ داد.'));
      setMessageTone('error');
      if (reset) {
        setLogs([]);
        setTotal(0);
      }
    } finally {
      setBusy(false);
    }
  };

  const fetchSummary = async () => {
    if (!userId) return;
    try {
      const params = buildQueryParams(null);
      const data = await fetchJson(`/api/admin-logs/summary?${params.toString()}`);
      setSummary(data);
    } catch {
      setSummary(null);
    }
  };

  const handleFetch = () => {
    fetchLogs(true);
    fetchSummary();
  };

  const handleExportCsv = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const params = buildQueryParams(null);
      const { blob, filename } = await fetchBlob(
        `/api/admin-logs/export.csv?${params.toString()}`,
        {},
        { method: 'GET' }
      );
      downloadBlob(blob, filename);
    } catch (error) {
      setMessage(errorMessage(error, 'خروجی CSV ناموفق بود.'));
      setMessageTone('error');
    } finally {
      setExporting(false);
    }
  };

  const hasMore = logs.length < total;

  return (
    <div className="admin-workspace-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge">بازرسی فعالیت</span>
            <span className="admin-workspace-badge info">لاگ سیستمی</span>
          </div>
          <h1>گزارش فعالیت استاد و ادمین</h1>
          <p>فعالیت‌های ثبت‌شده برای یک استاد یا ادمین را بر اساس لاگ سیستمی، بازهٔ زمانی و نوع اقدام مرور و بررسی کنید.</p>
          <div className="admin-workspace-meta">
            <span>کاربر انتخاب‌شده: {selectedUser ? `${selectedUser.name} - ${selectedUser.email}` : '—'}</span>
            <span>تعداد کل رکورد (فیلتر فعلی): {formatNumber(total)}</span>
            <span><button type="button" className="admin-workspace-button-ghost" onClick={() => window.history.back()}>بازگشت</button></span>
          </div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="5">
            <h2>فیلترها</h2>
            <p className="admin-workspace-subtitle">کاربر مورد نظر را جست‌وجو و انتخاب کنید و در صورت نیاز بازه زمانی، نوع اقدام یا دستگاه را محدود کنید.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-user-search">جست‌وجوی کاربر</label>
                  <input
                    id="ireport-user-search"
                    type="search"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="جست‌وجو با نام یا ایمیل"
                  />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-user">استاد / ادمین</label>
                  <select id="ireport-user" value={userId} onChange={(event) => setUserId(event.target.value)}>
                    {!visibleUsers.length && <option value="">موردی پیدا نشد</option>}
                    {visibleUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name} - {user.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-from">از تاریخ</label>
                  <AfghanDateInput
                    id="ireport-from"
                    value={filters.dateFrom}
                    onChange={(value) => setFilters((current) => ({ ...current, dateFrom: value }))}
                  />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-to">تا تاریخ</label>
                  <AfghanDateInput
                    id="ireport-to"
                    value={filters.dateTo}
                    onChange={(value) => setFilters((current) => ({ ...current, dateTo: value }))}
                  />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-q">جست‌وجو در نوع اقدام/مسیر</label>
                  <input
                    id="ireport-q"
                    type="search"
                    value={filters.q}
                    onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                    placeholder="مثال: نمره، حذف، finance"
                  />
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-device">دستگاه</label>
                  <select
                    id="ireport-device"
                    value={filters.device}
                    onChange={(event) => setFilters((current) => ({ ...current, device: event.target.value }))}
                  >
                    {DEVICE_OPTIONS.map((option) => (
                      <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="ireport-sensitive" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      id="ireport-sensitive"
                      type="checkbox"
                      checked={filters.sensitiveOnly}
                      onChange={(event) => setFilters((current) => ({ ...current, sensitiveOnly: event.target.checked }))}
                      style={{ width: 18, height: 18, padding: 0, borderRadius: 4, flex: '0 0 auto' }}
                    />
                    فقط اقدامات حساس (حذف/رد/تغییر دسترسی)
                  </label>
                </div>
              </div>
              <div className="admin-workspace-actions">
                <button type="button" className="admin-workspace-button-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>پاک‌کردن فیلترها</button>
                <button type="button" className="admin-workspace-button" onClick={handleFetch} disabled={loading || !userId}>
                  {loading ? 'در حال دریافت...' : 'دریافت گزارش'}
                </button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>خلاصه</h2>
            <p className="admin-workspace-subtitle">خلاصهٔ فعالیت کاربر انتخاب‌شده برای همین فیلترها.</p>
            <div className="admin-workspace-actions">
              <button type="button" className="admin-workspace-button-ghost" onClick={handleExportCsv} disabled={exporting || !userId}>
                {exporting ? 'در حال آماده‌سازی...' : 'خروجی CSV'}
              </button>
            </div>
            {summary ? (
              <>
                <div className="admin-workspace-summary">
                  <div className="admin-workspace-stat"><strong>{formatNumber(summary.total)}</strong><span>تعداد کل اقدامات</span></div>
                  <div className="admin-workspace-stat warn"><strong>{formatNumber(summary.sensitiveTotal)}</strong><span>اقدامات حساس</span></div>
                </div>
                {summary.byAction?.length ? (
                  <div className="admin-workspace-badges">
                    {summary.byAction.map((entry) => (
                      <span key={entry._id} className={`admin-workspace-badge ${getActionSeverity(entry._id)}`}>
                        {getActionLabel(entry._id)}: {formatNumber(entry.count)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="admin-workspace-empty">بعد از «دریافت گزارش»، خلاصهٔ فعالیت اینجا نمایش داده می‌شود.</div>
            )}
          </article>

          <article className="admin-workspace-card">
            <h2>لاگ فعالیت</h2>
            <p className="admin-workspace-subtitle">جزئیات هر اقدام شامل زمان، مسیر، دستگاه و هدف اقدام.</p>
            {logs.length ? (
              <>
                <div className="admin-workspace-table-wrap">
                  <table className="admin-workspace-table">
                    <thead>
                      <tr>
                        <th>زمان</th>
                        <th>عملیات</th>
                        <th>هدف</th>
                        <th>مسیر</th>
                        <th>دستگاه / IP</th>
                        <th>دلیل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => {
                        const targetLabel = getTargetTypeLabel(log.targetType);
                        const targetLink = getTargetLink(log.targetType, log.targetId);
                        return (
                          <tr key={log._id}>
                            <td>{toLocaleDateTime(log.createdAt)}</td>
                            <td>
                              <span className={`admin-workspace-badge ${getActionSeverity(log.action)}`}>
                                {getActionLabel(log.action)}
                              </span>
                            </td>
                            <td>
                              {targetLabel ? (
                                <div>
                                  <div>{targetLabel}</div>
                                  {log.targetId ? (
                                    targetLink ? (
                                      <a href={targetLink} target="_blank" rel="noreferrer">مشاهده</a>
                                    ) : (
                                      <small>{log.targetId}</small>
                                    )
                                  ) : null}
                                </div>
                              ) : '—'}
                            </td>
                            <td>
                              <div>{log.httpMethod || ''}</div>
                              <small>{log.route || '—'}</small>
                            </td>
                            <td>
                              <div>{log.clientDevice || '—'}</div>
                              <small>{log.ip || ''}</small>
                            </td>
                            <td>{log.reason || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <div className="admin-workspace-actions" style={{ marginTop: 12 }}>
                    <button type="button" className="admin-workspace-button-ghost" onClick={() => fetchLogs(false)} disabled={loadingMore}>
                      {loadingMore ? 'در حال بارگذاری...' : `بارگذاری بیشتر (${formatNumber(logs.length)} از ${formatNumber(total)})`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="admin-workspace-empty">
                {hasSearched ? 'هنوز گزارشی برای این فیلترها ثبت نشده است.' : 'یک کاربر را انتخاب و «دریافت گزارش» را بزنید.'}
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
