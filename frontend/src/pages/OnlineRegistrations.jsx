import React, { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';
import './OnlineRegistrations.css';

const STATUS_META = {
  pending: { label: 'در انتظار', tone: 'warn' },
  approved: { label: 'تایید شده', tone: 'good' },
  rejected: { label: 'رد شده', tone: 'danger' }
};

const DEFAULT_REJECTION_REASON = 'مدارک یا معلومات ارسالی نیاز به اصلاح دارد.';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const resolveFile = (url = '') => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${String(url).replace(/^\//, '')}`;
};

const toAfghanDateTime = (value = '') => {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || value || '---';
};

const normalizeComparable = (value = '') => String(value || '').trim().toLowerCase();

const getStatusMeta = (status = '') => STATUS_META[String(status || '').trim().toLowerCase()] || {
  label: status || 'نامشخص',
  tone: 'muted'
};

export default function OnlineRegistrations() {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    grade: 'all',
    linkage: 'all'
  });
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [rejectReason, setRejectReason] = useState(DEFAULT_REJECTION_REASON);
  const [actionLoading, setActionLoading] = useState('');

  const gradeOptions = useMemo(() => (
    Array.from(new Set(registrations.map((item) => String(item.grade || '').trim()).filter(Boolean)))
      .sort((left, right) => Number(left) - Number(right))
  ), [registrations]);

  const filteredRegistrations = useMemo(() => {
    const needle = normalizeComparable(filters.search);
    return registrations.filter((item) => {
      const matchesSearch = !needle || [
        item.studentName,
        item.fatherName,
        item.phone,
        item.email,
        item.grade,
        item.address,
        item.notes,
        item.rejectionReason
      ]
        .filter(Boolean)
        .some((value) => normalizeComparable(value).includes(needle));

      const matchesStatus = filters.status === 'all' || String(item.status || '') === String(filters.status);
      const matchesGrade = filters.grade === 'all' || String(item.grade || '') === String(filters.grade);
      const matchesLinkage = filters.linkage === 'all'
        ? true
        : filters.linkage === 'linked'
          ? !!item.linkedUserId
          : !item.linkedUserId;

      return matchesSearch && matchesStatus && matchesGrade && matchesLinkage;
    });
  }, [registrations, filters]);

  const stats = useMemo(() => ({
    total: registrations.length,
    pending: registrations.filter((item) => item.status === 'pending').length,
    approved: registrations.filter((item) => item.status === 'approved').length,
    linked: registrations.filter((item) => !!item.linkedUserId).length
  }), [registrations]);

  const loadRegistrations = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/admin`, {
        headers: {
          Accept: 'application/json',
          ...getAuthHeaders()
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'دریافت درخواست‌های ثبت‌نام آنلاین ناموفق بود.');
      }
      setRegistrations(Array.isArray(data.items) ? data.items : []);
      setMessage('');
    } catch (error) {
      setMessage(error?.message || 'دریافت درخواست‌های ثبت‌نام آنلاین ناموفق بود.');
    } finally {
      setLoading(false);
      setActionLoading('');
    }
  };

  useEffect(() => {
    loadRegistrations();
  }, []);

  const handleApprove = async (item) => {
    if (!item?._id) return;
    setActionLoading(`approve:${item._id}`);
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/${item._id}/approve`, {
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          ...getAuthHeaders()
        }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'تایید درخواست ناموفق بود.');
      }
      setSelectedRegistration((current) => (
        current && current._id === item._id ? { ...current, ...data.item } : current
      ));
      setMessage('درخواست ثبت‌نام با موفقیت تایید شد.');
      await loadRegistrations();
    } catch (error) {
      setMessage(error?.message || 'تایید درخواست ناموفق بود.');
      setActionLoading('');
    }
  };

  const handleReject = async (item, reasonInput = '') => {
    if (!item?._id) return;
    const reason = String(reasonInput || rejectReason || DEFAULT_REJECTION_REASON).trim();
    if (!reason) {
      setMessage('برای رد درخواست، دلیل رد را مشخص کنید.');
      return;
    }
    setActionLoading(`reject:${item._id}`);
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/${item._id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ rejectionReason: reason })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'رد درخواست ناموفق بود.');
      }
      setSelectedRegistration((current) => (
        current && current._id === item._id ? { ...current, ...data.item } : current
      ));
      setMessage('درخواست ثبت‌نام رد شد.');
      await loadRegistrations();
    } catch (error) {
      setMessage(error?.message || 'رد درخواست ناموفق بود.');
      setActionLoading('');
    }
  };

  const downloadExcel = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/export.xlsx`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('دریافت فایل اکسل ناموفق بود.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'online-enrollments.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.message || 'دریافت فایل اکسل ناموفق بود.');
    }
  };

  const downloadZip = async (item) => {
    if (!item?._id) return;
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/${item._id}/zip`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('دریافت فایل اسناد ناموفق بود.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `online-enrollment-${item._id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.message || 'دریافت فایل اسناد ناموفق بود.');
    }
  };

  const downloadPdf = async (item) => {
    if (!item?._id) return;
    try {
      const response = await fetch(`${API_BASE}/api/enrollments/${item._id}/report`, {
        headers: {
          ...getAuthHeaders()
        }
      });
      if (!response.ok) throw new Error('دریافت گزارش PDF ناموفق بود.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `online-enrollment-${item._id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error?.message || 'دریافت گزارش PDF ناموفق بود.');
    }
  };

  const openEducationAssignment = (item) => {
    if (!item?._id) return;
    window.location.assign(`/admin-education?section=enrollments&candidate=${encodeURIComponent(`enrollment:${item._id}`)}`);
  };

  const openDetails = (item) => {
    setSelectedRegistration(item);
    setRejectReason(item?.rejectionReason || DEFAULT_REJECTION_REASON);
  };

  return (
    <section className="online-registrations-page">
      <div className="online-registrations-hero">
        <div className="online-registrations-copy">
          <span className="online-registrations-kicker">ثبت‌نام آنلاین</span>
          <h1>مرکز بررسی درخواست‌های آنلاین متعلمین</h1>
          <p>
            درخواست‌های ثبت‌نام آنلاین را اینجا بررسی، تایید یا رد کنید و در صورت نیاز
            مستقیماً برای معرفی به صنف به مرکز مدیریت آموزش بفرستید.
          </p>
        </div>

        <div className="online-registrations-actions">
          <button type="button" className="online-registrations-button ghost" onClick={() => window.history.back()}>
            بازگشت
          </button>
          <button type="button" className="online-registrations-button ghost" onClick={loadRegistrations}>
            تازه‌سازی
          </button>
          <button type="button" className="online-registrations-button ghost" onClick={() => window.location.assign('/admin-education?section=enrollments')}>
            مرکز مدیریت آموزش
          </button>
          <button type="button" className="online-registrations-button" onClick={downloadExcel}>
            خروجی اکسل
          </button>
        </div>
      </div>

      <div className="online-registrations-stats">
        <article className="online-registrations-stat">
          <span>کل درخواست‌ها</span>
          <strong>{stats.total.toLocaleString('fa-AF-u-ca-persian')}</strong>
        </article>
        <article className="online-registrations-stat">
          <span>در انتظار بررسی</span>
          <strong>{stats.pending.toLocaleString('fa-AF-u-ca-persian')}</strong>
        </article>
        <article className="online-registrations-stat">
          <span>تایید شده</span>
          <strong>{stats.approved.toLocaleString('fa-AF-u-ca-persian')}</strong>
        </article>
        <article className="online-registrations-stat">
          <span>متصل به سیستم</span>
          <strong>{stats.linked.toLocaleString('fa-AF-u-ca-persian')}</strong>
        </article>
      </div>

      <article className="online-registrations-panel">
        <div className="online-registrations-panel-head">
          <div>
            <h2>فیلتر و جستجو</h2>
            <p>درخواست‌ها را بر اساس نام، پایه، وضعیت و اتصال به سیستم پیدا کنید.</p>
          </div>
          <span className="online-registrations-count">
            {filteredRegistrations.length.toLocaleString('fa-AF-u-ca-persian')} مورد
          </span>
        </div>

        <div className="online-registrations-filters">
          <label className="online-registrations-field">
            <span>جستجو</span>
            <input
              type="text"
              placeholder="نام، نام پدر، شماره تماس، ایمیل یا پایه"
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
            />
          </label>

          <label className="online-registrations-field">
            <span>وضعیت</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="all">همه وضعیت‌ها</option>
              <option value="pending">در انتظار</option>
              <option value="approved">تایید شده</option>
              <option value="rejected">رد شده</option>
            </select>
          </label>

          <label className="online-registrations-field">
            <span>پایه</span>
            <select
              value={filters.grade}
              onChange={(event) => setFilters((current) => ({ ...current, grade: event.target.value }))}
            >
              <option value="all">همه پایه‌ها</option>
              {gradeOptions.map((item) => (
                <option key={item} value={item}>
                  پایه {item}
                </option>
              ))}
            </select>
          </label>

          <label className="online-registrations-field">
            <span>اتصال به سیستم</span>
            <select
              value={filters.linkage}
              onChange={(event) => setFilters((current) => ({ ...current, linkage: event.target.value }))}
            >
              <option value="all">همه</option>
              <option value="unlinked">هنوز متصل نشده</option>
              <option value="linked">متصل به سیستم</option>
            </select>
          </label>
        </div>
      </article>

      {message ? <div className="online-registrations-message">{message}</div> : null}

      {loading ? (
        <div className="online-registrations-loading">در حال بارگذاری درخواست‌های ثبت‌نام آنلاین...</div>
      ) : filteredRegistrations.length ? (
        <div className="online-registrations-grid">
          {filteredRegistrations.map((item) => {
            const statusMeta = getStatusMeta(item.status);
            const approveBusy = actionLoading === `approve:${item._id}`;
            const rejectBusy = actionLoading === `reject:${item._id}`;
            return (
              <article key={item._id} className="online-registration-card">
                <div className="online-registration-card-head">
                  <div>
                    <h3>{item.studentName || 'درخواست بی‌نام'}</h3>
                    <p>
                      {[item.grade ? `پایه ${item.grade}` : '', item.phone || '', item.email || '']
                        .filter(Boolean)
                        .join(' | ') || 'درخواست ثبت‌نام آنلاین'}
                    </p>
                    <p style={{ fontSize: '13px', color: '#0f172a', fontWeight: 'bold', marginTop: '4px' }}>
                      تعقیب: {item.registrationId || '---'} {item.asasNumber && `| اساس: ${item.asasNumber}`}
                    </p>
                  </div>
                  <div className="online-registration-card-badges">
                    <span className={`online-registration-badge ${statusMeta.tone}`}>{statusMeta.label}</span>
                    <span className={`online-registration-badge ${item.linkedUserId ? 'good' : 'muted'}`}>
                      {item.linkedUserId ? 'متصل به سیستم' : 'هنوز معرفی نشده'}
                    </span>
                  </div>
                </div>

                <div className="online-registration-card-body">
                  <div><span>نام پدر</span><strong>{item.fatherName || '---'}</strong></div>
                  <div><span>تاریخ ثبت</span><strong>{toAfghanDateTime(item.createdAt)}</strong></div>
                  <div><span>شماره تماس</span><strong>{item.phone || '---'}</strong></div>
                  <div><span>مدرسه قبلی</span><strong>{item.previousSchool || '---'}</strong></div>
                </div>

                <div className="online-registration-card-note">
                  <span>یادداشت</span>
                  <p>{item.notes || item.rejectionReason || 'بدون یادداشت'}</p>
                </div>

                <div className="online-registration-card-actions">
                  <button type="button" className="online-registrations-button ghost" onClick={() => openDetails(item)}>
                    جزئیات
                  </button>
                  <button type="button" className="online-registrations-button ghost" onClick={() => openEducationAssignment(item)}>
                    معرفی به صنف
                  </button>
                  <button type="button" className="online-registrations-button ghost" onClick={() => downloadZip(item)}>
                    اسناد
                  </button>
                  {item.status === 'approved' ? (
                    <button type="button" className="online-registrations-button ghost" onClick={() => downloadPdf(item)}>
                      PDF
                    </button>
                  ) : null}
                </div>

                {item.status === 'pending' ? (
                  <div className="online-registration-card-actions compact">
                    <button
                      type="button"
                      className="online-registrations-button success"
                      onClick={() => handleApprove(item)}
                      disabled={approveBusy || rejectBusy}
                    >
                      {approveBusy ? 'در حال تایید...' : 'تایید'}
                    </button>
                    <button
                      type="button"
                      className="online-registrations-button danger"
                      onClick={() => handleReject(item)}
                      disabled={approveBusy || rejectBusy}
                    >
                      {rejectBusy ? 'در حال رد...' : 'رد'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="online-registrations-empty">
          <h3>درخواستی با این فیلترها پیدا نشد</h3>
          <p>فیلترها را تغییر دهید یا دوباره صفحه را تازه‌سازی کنید.</p>
        </div>
      )}

      {selectedRegistration ? (
        <div className="online-registration-modal-backdrop" role="presentation" onClick={() => setSelectedRegistration(null)}>
          <div className="online-registration-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="online-registration-modal-head">
              <div>
                <h2>جزئیات درخواست ثبت‌نام</h2>
                <p>{selectedRegistration.studentName || 'درخواست بی‌نام'}</p>
              </div>
              <button type="button" className="online-registrations-button ghost" onClick={() => setSelectedRegistration(null)}>
                بستن
              </button>
            </div>

            <div className="online-registration-modal-grid">
              <section className="online-registration-modal-card">
                <h3>مشخصات متعلم</h3>
                <div><span>نام</span><strong>{selectedRegistration.studentName || '---'}</strong></div>
                <div><span>کد پیگیری موقت</span><strong>{selectedRegistration.registrationId || '---'}</strong></div>
                <div><span>شماره اساس دائم</span><strong>{selectedRegistration.asasNumber || '---'}</strong></div>
                <div><span>نام پدر</span><strong>{selectedRegistration.fatherName || '---'}</strong></div>
                <div><span>نام مادر</span><strong>{selectedRegistration.motherName || '---'}</strong></div>
                <div><span>جنسیت</span><strong>{selectedRegistration.gender || '---'}</strong></div>
                <div><span>تاریخ تولد</span><strong>{selectedRegistration.birthDate || '---'}</strong></div>
                <div><span>پایه درخواستی</span><strong>{selectedRegistration.grade || '---'}</strong></div>
              </section>

              <section className="online-registration-modal-card">
                <h3>تماس و آدرس</h3>
                <div><span>شماره تماس</span><strong>{selectedRegistration.phone || '---'}</strong></div>
                <div><span>ایمیل</span><strong>{selectedRegistration.email || '---'}</strong></div>
                <div><span>شماره اضطراری</span><strong>{selectedRegistration.emergencyPhone || '---'}</strong></div>
                <div><span>آدرس</span><strong>{selectedRegistration.address || '---'}</strong></div>
                <div><span>مدرسه قبلی</span><strong>{selectedRegistration.previousSchool || '---'}</strong></div>
              </section>

              <section className="online-registration-modal-card">
                <h3>وضعیت درخواست</h3>
                <div><span>وضعیت</span><strong>{getStatusMeta(selectedRegistration.status).label}</strong></div>
                <div><span>زمان ثبت</span><strong>{toAfghanDateTime(selectedRegistration.createdAt)}</strong></div>
                <div><span>زمان تایید</span><strong>{toAfghanDateTime(selectedRegistration.approvedAt)}</strong></div>
                <div><span>زمان رد</span><strong>{toAfghanDateTime(selectedRegistration.rejectedAt)}</strong></div>
                <div><span>اتصال به سیستم</span><strong>{selectedRegistration.linkedUserId ? 'انجام شده' : 'انجام نشده'}</strong></div>
                <div><span>دلیل رد</span><strong>{selectedRegistration.rejectionReason || '---'}</strong></div>
              </section>

              <section className="online-registration-modal-card">
                <h3>اسناد و یادداشت</h3>
                <div className="online-registration-docs">
                  {selectedRegistration.documents?.idCardUrl ? <a href={resolveFile(selectedRegistration.documents.idCardUrl)} target="_blank" rel="noreferrer">تذکره</a> : null}
                  {selectedRegistration.documents?.birthCertUrl ? <a href={resolveFile(selectedRegistration.documents.birthCertUrl)} target="_blank" rel="noreferrer">سند تولد</a> : null}
                  {selectedRegistration.documents?.reportCardUrl ? <a href={resolveFile(selectedRegistration.documents.reportCardUrl)} target="_blank" rel="noreferrer">کارنامه</a> : null}
                  {selectedRegistration.documents?.photoUrl ? <a href={resolveFile(selectedRegistration.documents.photoUrl)} target="_blank" rel="noreferrer">عکس</a> : null}
                  {!selectedRegistration.documents?.idCardUrl && !selectedRegistration.documents?.birthCertUrl && !selectedRegistration.documents?.reportCardUrl && !selectedRegistration.documents?.photoUrl ? (
                    <span className="online-registration-doc-empty">فایل پیوست‌شده‌ای ثبت نشده است.</span>
                  ) : null}
                </div>
                <div className="online-registration-modal-note">
                  <span>یادداشت متعلم</span>
                  <p>{selectedRegistration.notes || 'بدون یادداشت'}</p>
                </div>
              </section>
            </div>

            <div className="online-registration-modal-actions">
              <button type="button" className="online-registrations-button ghost" onClick={() => openEducationAssignment(selectedRegistration)}>
                معرفی به صنف
              </button>
              <button type="button" className="online-registrations-button ghost" onClick={() => downloadZip(selectedRegistration)}>
                دانلود اسناد
              </button>
              {selectedRegistration.status === 'approved' ? (
                <button type="button" className="online-registrations-button ghost" onClick={() => downloadPdf(selectedRegistration)}>
                  گزارش PDF
                </button>
              ) : null}
            </div>

            {selectedRegistration.status === 'pending' ? (
              <div className="online-registration-review-box">
                <label className="online-registrations-field">
                  <span>دلیل رد</span>
                  <textarea
                    rows="3"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                  />
                </label>
                <div className="online-registration-review-actions">
                  <button
                    type="button"
                    className="online-registrations-button success"
                    onClick={() => handleApprove(selectedRegistration)}
                    disabled={actionLoading === `approve:${selectedRegistration._id}` || actionLoading === `reject:${selectedRegistration._id}`}
                  >
                    {actionLoading === `approve:${selectedRegistration._id}` ? 'در حال تایید...' : 'تایید درخواست'}
                  </button>
                  <button
                    type="button"
                    className="online-registrations-button danger"
                    onClick={() => handleReject(selectedRegistration, rejectReason)}
                    disabled={actionLoading === `approve:${selectedRegistration._id}` || actionLoading === `reject:${selectedRegistration._id}`}
                  >
                    {actionLoading === `reject:${selectedRegistration._id}` ? 'در حال رد...' : 'رد درخواست'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
