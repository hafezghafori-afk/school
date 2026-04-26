import React, { useEffect, useState } from 'react';
import './MyGrades.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const BREAKDOWN_FIELDS = [
  { key: 'writtenScore', label: 'تحریری' },
  { key: 'oralScore', label: 'تقریری' },
  { key: 'classActivityScore', label: 'فعالیت صنفی' },
  { key: 'homeworkScore', label: 'کارخانگی' }
];

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toScore = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const toDisplayDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '---';
};

const statusLabel = (value = '') => {
  if (value === 'passed') return 'کامیاب';
  if (value === 'failed') return 'ناکام';
  if (value === 'conditional') return 'مشروط';
  if (value === 'distinction') return 'ممتاز';
  if (value === 'absent') return 'غایب';
  if (value === 'excused') return 'معذور';
  if (value === 'pending') return 'در انتظار';
  return value || '---';
};

export default function MyGrades() {
  const [student, setStudent] = useState(null);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadGrades = async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/exams/my/results`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success === false) {
        setMessage(data?.message || 'خطا در دریافت نتایج امتحانات');
        setItems([]);
        setStudent(null);
        return;
      }
      setStudent(data.student || null);
      setItems(data.items || []);
    } catch {
      setMessage('خطا در ارتباط با سرور');
      setItems([]);
      setStudent(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrades();
  }, []);

  return (
    <div className="mygrades-page">
      <div className="mygrades-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <h2>نتایج امتحانات من</h2>
        <p>
          این صفحه نتایج منتشرشده را مستقیماً از شقه‌های مضمون و بخش امتحانات نمایش می‌دهد.
          {student?.fullName ? ` ${student.fullName}` : ''}
          {student?.admissionNo ? ` | نمبر اساس: ${student.admissionNo}` : ''}
        </p>

        {loading && <div className="mygrades-empty">در حال دریافت...</div>}
        {message && <div className="mygrades-empty">{message}</div>}
        {!loading && !message && !items.length && (
          <div className="mygrades-empty">هنوز نتیجه امتحانی برای حساب شما نشر نشده است.</div>
        )}

        <div className="mygrades-list">
          {items.map((item) => (
            <article key={item.id} className="mygrades-item">
              <div className="mygrades-head">
                <div>
                  <strong>{item.subject?.name || item.session?.subject?.name || 'مضمون نامشخص'}</strong>
                  <div className="meta">
                    {item.schoolClass?.title || item.session?.schoolClass?.title || 'صنف نامشخص'}
                    {' | '}
                    {item.examType?.title || item.session?.examType?.title || 'امتحان'}
                    {' | '}
                    {item.session?.monthLabel || item.session?.assessmentPeriod?.title || item.assessmentPeriod?.title || '---'}
                  </div>
                </div>
                <div className="mygrades-badges">
                  <span className="badge">حالت: {statusLabel(item.resultStatus)}</span>
                  <span className="badge accent">نمره: {toScore(item.obtainedMark).toLocaleString('fa-AF-u-ca-persian')}</span>
                  <span className="badge dark">فیصدی: {toScore(item.percentage).toLocaleString('fa-AF-u-ca-persian')}%</span>
                  {item.rank != null && <span className="badge warning">رتبه: {Number(item.rank).toLocaleString('fa-AF-u-ca-persian')}</span>}
                </div>
              </div>

              <div className="mygrades-breakdown">
                {BREAKDOWN_FIELDS.map((field) => (
                  <div key={field.key}>
                    <span>{field.label}</span>
                    <strong>{toScore(item.scoreBreakdown?.[field.key]).toLocaleString('fa-AF-u-ca-persian')}</strong>
                  </div>
                ))}
              </div>

              <div className="mygrades-total-row">
                <span>نمره نهایی: {toScore(item.obtainedMark).toLocaleString('fa-AF-u-ca-persian')} / {toScore(item.totalMark).toLocaleString('fa-AF-u-ca-persian')}</span>
                <span>ترم: {item.assessmentPeriod?.title || item.session?.assessmentPeriod?.title || '---'}</span>
                <span>تاریخ نشر: {toDisplayDate(item.session?.publishedAt || item.computedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
