import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './AdminContent.css';

import { API_BASE } from '../config/api';

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

export default function AdminEnrollmentDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState(templates.rejected);

  const loadItem = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/enrollments/${id}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItem(data.item || null);
        setMessage('');
      } else {
        setMessage(data?.message || 'درخواست پیدا نشد');
      }
    } catch {
      setMessage('خطا در دریافت اطلاعات');
    }
  };

  useEffect(() => {
    loadItem();
  }, [id]);

  const approve = async () => {
    try {
      await fetch(`${API_BASE}/api/enrollments/${id}/approve`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() }
      });
      loadItem();
    } catch {
      setMessage('خطا در تایید درخواست');
    }
  };

  const downloadZip = async () => {
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

  const downloadPdf = async () => {
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

  const reject = async () => {
    if (!reason.trim()) return setMessage('دلیل رد را وارد کنید');
    try {
      await fetch(`${API_BASE}/api/enrollments/${id}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ reason })
      });
      loadItem();
    } catch {
      setMessage('خطا در رد درخواست');
    }
  };

  if (!item) {
    return (
      <section className="admin-content-page">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        {message && <div className="form-message">{message}</div>}
      </section>
    );
  }

  return (
    <section className="admin-content-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>

      <div className="admin-content-hero">
        <div>
          <h2>جزئیات ثبت‌نام</h2>
          <p>وضعیت: {item.status}</p>
        </div>
        <div className="admin-detail-actions">
          <Link className="ghost" to={`/admin-enrollments/${item._id}/print`} target="_blank">چاپ</Link>
          <button type="button" className="ghost" onClick={downloadZip}>دانلود اسناد</button>
          {item.status === 'approved' && (
            <button type="button" className="ghost" onClick={downloadPdf}>دانلود PDF</button>
          )}
        </div>
      </div>

      <div className="admin-detail-grid">
        <div className="admin-detail-card">
          <h3>مشخصات شاگرد</h3>
          <div className="admin-detail-row"><span>نام</span><strong>{item.studentName}</strong></div>
          <div className="admin-detail-row"><span>کد پیگیری موقت</span><strong>{item.registrationId || '---'}</strong></div>
          <div className="admin-detail-row"><span>شماره اساس (مرجع دائم)</span><strong>{item.asasNumber || '---'}</strong></div>
          <div className="admin-detail-row"><span>پایه</span><strong>{item.grade || '---'}</strong></div>
          <div className="admin-detail-row"><span>تاریخ تولد</span><strong>{item.birthDate || '---'}</strong></div>
          <div className="admin-detail-row"><span>جنسیت</span><strong>{item.gender || '---'}</strong></div>
        </div>
        <div className="admin-detail-card">
          <h3>تماس</h3>
          <div className="admin-detail-row"><span>شماره تماس</span><strong>{item.phone || '---'}</strong></div>
          <div className="admin-detail-row"><span>ایمیل</span><strong>{item.email || '---'}</strong></div>
          <div className="admin-detail-row"><span>شماره اضطراری</span><strong>{item.emergencyPhone || '---'}</strong></div>
        </div>
        <div className="admin-detail-card">
          <h3>خانواده</h3>
          <div className="admin-detail-row"><span>نام پدر</span><strong>{item.fatherName || '---'}</strong></div>
          <div className="admin-detail-row"><span>نام مادر</span><strong>{item.motherName || '---'}</strong></div>
          <div className="admin-detail-row"><span>مدرسه قبلی</span><strong>{item.previousSchool || '---'}</strong></div>
        </div>
        <div className="admin-detail-card">
          <h3>آدرس و توضیحات</h3>
          <div className="admin-detail-row"><span>آدرس</span><strong>{item.address || '---'}</strong></div>
          <div className="admin-detail-row"><span>توضیحات</span><strong>{item.notes || '---'}</strong></div>
        </div>
      </div>

      <div className="admin-detail-card">
        <h3>اسناد</h3>
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

      {item.status === 'pending' && (
        <div className="admin-detail-card">
          <h3>بررسی درخواست</h3>
          <label>دلیل رد (اختیاری)</label>
          <textarea
            rows="3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="admin-content-actions">
            <button type="button" onClick={approve}>تایید</button>
            <button type="button" className="danger" onClick={reject}>رد</button>
          </div>
        </div>
      )}
    </section>
  );
}
