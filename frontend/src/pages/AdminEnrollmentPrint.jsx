import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName, normalizeBrandSubtitle } from '../utils/brand';
import { formatAfghanStoredDateLabel } from '../utils/afghanDate';
import { getOfficialPrintLogoImageClass, getPrintLogoUrls } from '../utils/printLogos';
import './AdminEnrollmentPrint.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatBirthDate = (value = '') => formatAfghanStoredDateLabel(value) || value || '---';

export default function AdminEnrollmentPrint() {
  const { id } = useParams();
  const { settings } = useSiteSettings();
  const [item, setItem] = useState(null);
  const [message, setMessage] = useState('');

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
        setMessage(data?.message || 'درخواست یافت نشد');
      }
    } catch {
      setMessage('خطا در دریافت درخواست');
    }
  };

  useEffect(() => {
    loadItem();
  }, [id]);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [item]);

  if (!item) {
    return (
      <section className="admin-print-page">
        {message && <div className="admin-print-message">{message}</div>}
      </section>
    );
  }

  const { schoolLogoUrl, ministryLogoUrl } = getPrintLogoUrls(settings);
  const brandName = normalizeBrandName(settings?.brandName);
  const brandSubtitle = normalizeBrandSubtitle(settings?.brandSubtitle);

  return (
    <section className="admin-print-page">
      <header className="print-letterhead">
        <div className="print-official-logo print-official-logo-left">
          {schoolLogoUrl ? <img className={getOfficialPrintLogoImageClass(schoolLogoUrl)} src={schoolLogoUrl} alt="لوگوی مکتب" /> : <span>لوگو مکتب</span>}
        </div>
        <div className="print-brand">
          <div>
            <strong>{brandName}</strong>
            <span>{brandSubtitle}</span>
          </div>
        </div>
        <div className="print-official-logo print-official-logo-right">
          {ministryLogoUrl ? <img className={getOfficialPrintLogoImageClass(ministryLogoUrl)} src={ministryLogoUrl} alt="لوگوی وزارت معارف" /> : <span>لوگو وزارت</span>}
        </div>
      </header>

      <div className="print-title">
        <h1>فرم ثبت‌نام شاگرد</h1>
        <div className="print-meta">
          <span>کد درخواست: {item._id}</span>
          <span>وضعیت: {item.status}</span>
        </div>
      </div>

      <div className="print-section">
        <h2>مشخصات شاگرد</h2>
        <div className="print-grid">
          <div><span>نام</span><strong>{item.studentName}</strong></div>
          <div><span>صنف</span><strong>{item.grade || '---'}</strong></div>
          <div><span>جنسیت</span><strong>{item.gender || '---'}</strong></div>
          <div><span>تاریخ تولد</span><strong>{formatBirthDate(item.birthDate)}</strong></div>
        </div>
      </div>

      <div className="print-section">
        <h2>تماس و آدرس</h2>
        <div className="print-grid">
          <div><span>شماره تماس</span><strong>{item.phone || '---'}</strong></div>
          <div><span>ایمیل</span><strong>{item.email || '---'}</strong></div>
          <div><span>شماره اضطراری</span><strong>{item.emergencyPhone || '---'}</strong></div>
          <div className="print-wide"><span>آدرس</span><strong>{item.address || '---'}</strong></div>
        </div>
      </div>

      <div className="print-section">
        <h2>مشخصات اولیا</h2>
        <div className="print-grid">
          <div><span>نام پدر</span><strong>{item.fatherName || '---'}</strong></div>
          <div><span>نام مادر</span><strong>{item.motherName || '---'}</strong></div>
          <div className="print-wide"><span>مکتب قبلی</span><strong>{item.previousSchool || '---'}</strong></div>
        </div>
      </div>

      <div className="print-section">
        <h2>یادداشت</h2>
        <p>{item.notes || '---'}</p>
      </div>

      <footer className="print-footer">
        <div>
          <span>امضا مدیر</span>
          <div className="print-signature" />
        </div>
        <div>
          <span>مهر مدرسه</span>
          <div className="print-stamp" />
        </div>
      </footer>
    </section>
  );
}
