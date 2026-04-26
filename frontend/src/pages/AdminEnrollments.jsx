import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './AdminContent.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const resolveFile = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

const templates = {
  approved: 'درخواست شما تایید شد. لطفاً برای تکمیل روند ثبت‌نام به دفتر مدرسه مراجعه کنید.',
  rejected: 'درخواست ثبت‌نام شما رد شد. لطفاً توضیحات را بررسی کرده و دوباره اقدام کنید.'
};

export default function AdminEnrollments() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;

  const downloadExcel = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/enrollments/export.xlsx`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'enrollments.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage('خطا در دریافت فایل اکسل');
    }
  };

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/enrollments/admin`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItems(data.items || []);
        setMessage('');
      } else {
        setMessage(data?.message || 'خطا در دریافت ثبت‌نام‌ها');
      }
    } catch {
      setMessage('خطا در اتصال به سرور');
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (!q) return true;
      const blob = `${item.studentName || ''} ${item.email || ''} ${item.phone || ''} ${item.grade || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, status, query]);

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const stats = useMemo(() => ({
    total: items.length,
    pending: items.filter((item) => item.status === 'pending').length,
    approved: items.filter((item) => item.status === 'approved').length,
    rejected: items.filter((item) => item.status === 'rejected').length
  }), [items]);

  const approve = async (id) => {
    try {
      await fetch(`${API_BASE}/api/enrollments/${id}/approve`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() }
      });
      loadItems();
    } catch {
      setMessage('خطا در تایید درخواست');
    }
  };

  const reject = async (id) => {
    const reason = window.prompt('دلیل رد درخواست را وارد کنید:', templates.rejected);
    if (reason === null) return;
    try {
      await fetch(`${API_BASE}/api/enrollments/${id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason })
      });
      loadItems();
    } catch {
      setMessage('خطا در رد درخواست');
    }
  };

  const downloadZip = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/enrollments/${id}/zip`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `enrollment-${id}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage('خطا در دریافت فایل ZIP');
    }
  };

  const downloadPdf = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/enrollments/${id}/report`, {
        headers: { ...getAuthHeaders() }
      });
      if (!res.ok) throw new Error('failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `enrollment-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMessage('خطا در دریافت PDF');
    }
  };

  const printList = () => {
    const data = filtered;
    const now = formatAfghanDate(new Date(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) || '';
    const rows = data.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.studentName || ''}</td>
        <td>${item.grade || ''}</td>
        <td>${item.registrationId || '---'}</td>
        <td>${item.asasNumber || '---'}</td>
        <td>${item.phone || ''}</td>
        <td>${item.email || ''}</td>
        <td>${item.status || ''}</td>
        <td>${formatAfghanDate(item.createdAt, { year: 'numeric', month: 'long', day: 'numeric' }) || ''}</td>
      </tr>
    `).join('');
    const html = `
      <html lang="fa" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>گزارش ثبت‌نام‌ها</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { font-size: 12px; color: #444; margin-bottom: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: right; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>فهرست ثبت‌نام‌ها</h1>
          <div class="meta">تاریخ: ${now} | تعداد: ${data.length}</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>نام شاگرد</th>
                <th>پایه</th>
                <th>پیگیری</th>
                <th>نمبر اساس</th>
                <th>شماره تماس</th>
                <th>ایمیل</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <section className="admin-content-page admin-enrollments-page" dir="rtl">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <div className="admin-content-hero">
        <div>
          <h2>درخواست‌های ثبت‌نام</h2>
          <p>مدیریت تایید یا رد درخواست‌های ثبت‌نام.</p>
        </div>
        <div className="admin-detail-actions">
          <Link className="primary admin-action-btn" to="/student-registration">ثبت‌نام کامل شاگرد</Link>
          <button type="button" className="primary admin-action-btn" onClick={downloadExcel}>خروجی اکسل</button>
          <button type="button" className="primary admin-action-btn" onClick={printList}>چاپ لیست</button>
        </div>
      </div>

      <div className="enrollment-command-center">
        <Link className="enrollment-command-card enrollment-command-card--primary" to="/student-registration">
          <span className="eyebrow">ثبت‌نام حضوری</span>
          <strong>ثبت شاگرد با جزئیات کامل</strong>
          <small>مشخصات شخصی، خانواده، تماس، معلومات صحی و صنف در یک فرم منظم ثبت می‌شود.</small>
        </Link>
        <div className="enrollment-command-card">
          <span className="eyebrow">درخواست‌های آنلاین</span>
          <strong>{stats.pending} مورد در انتظار</strong>
          <small>درخواست‌های رسیده از سایت عمومی را بررسی، تایید یا رد کنید.</small>
        </div>
        <div className="enrollment-mini-stats">
          <span><b>{stats.total}</b> مجموع</span>
          <span><b>{stats.approved}</b> تایید شده</span>
          <span><b>{stats.rejected}</b> رد شده</span>
        </div>
      </div>

      <div className="admin-content-filters">
        <input
          type="text"
          placeholder="جستجو..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">همه</option>
          <option value="pending">در انتظار</option>
          <option value="approved">تایید شده</option>
          <option value="rejected">رد شده</option>
        </select>
      </div>

      {message && <div className="form-message">{message}</div>}

      <div className="admin-content-list">
        {paged.map(item => (
          <div key={item._id} className="admin-content-item">
            <div>
              <strong>{item.studentName}</strong>
              <span style={{ color: '#0f172a', fontWeight: 'bold' }}>شماره پیگیری: {item.registrationId || '---'} {item.asasNumber ? `| مدخل اساس: ${item.asasNumber}` : ''}</span>
              <span>{item.grade || 'بدون پایه'} - {item.status}</span>
              <span>{item.phone || 'بدون شماره'}</span>
              <span>{item.email || 'بدون ایمیل'}</span>
              <div className="admin-docs">
                {item.documents?.idCardUrl && (
                  <a href={resolveFile(item.documents.idCardUrl)} target="_blank" rel="noreferrer">تذکره</a>
                )}
                {item.documents?.birthCertUrl && (
                  <a href={resolveFile(item.documents.birthCertUrl)} target="_blank" rel="noreferrer">شناسنامه</a>
                )}
                {item.documents?.reportCardUrl && (
                  <a href={resolveFile(item.documents.reportCardUrl)} target="_blank" rel="noreferrer">کارنامه</a>
                )}
                {item.documents?.photoUrl && (
                  <a href={resolveFile(item.documents.photoUrl)} target="_blank" rel="noreferrer">عکس</a>
                )}
              </div>
            </div>
            <div className="admin-content-actions">
              <Link className="ghost" to={`/admin-enrollments/${item._id}`}>جزئیات</Link>
              <button type="button" className="ghost" onClick={() => downloadZip(item._id)}>دانلود اسناد</button>
              {item.status === 'approved' && (
                <button type="button" className="ghost" onClick={() => downloadPdf(item._id)}>PDF</button>
              )}
              {item.status === 'pending' && (
                <>
                  <button type="button" onClick={() => approve(item._id)}>تایید</button>
                  <button type="button" className="danger" onClick={() => reject(item._id)}>رد</button>
                </>
              )}
            </div>
          </div>
        ))}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 4, margin: '18px 0 0 0' }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                padding: '2px 2px',
                borderRadius: 16,
                border: '1px solid #bbb',
                background: page === 1 ? '#f3f4f6' : '#f3f4f6',
                color: '#222',
                fontWeight: 500,
                fontSize: 14,
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                display: 'inline-block',
                marginLeft: 2,
                minWidth: 5
              }}
            >
              &#8592; قبلی
            </button>
            <span style={{ fontWeight: 500, fontSize: 12, color: '#444', margin: '0 2px' }}>
              صفحه {page} از {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                padding: '2px 2px',
                borderRadius: 16,
                border: '1px solid #bbb',
                background: page === totalPages ? '#f3f4f6' : '#f3f4f6',
                color: '#222',
                fontWeight: 500,
                fontSize: 14,
                cursor: page === totalPages ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                display: 'inline-block',
                marginLeft: 2,
                minWidth: 5
              }}
            >
              بعدی &#8594;
            </button>
          </div>
        )}
        {!filtered.length && (
          <div className="admin-content-empty">
            <strong>موردی برای نمایش نیست</strong>
            <span>اگر می‌خواهید شاگردی را مستقیم از طرف مدیریت ثبت کنید، از دکمه «ثبت‌نام کامل شاگرد» استفاده کنید.</span>
          </div>
        )}
      </div>
    </section>
  );
}
