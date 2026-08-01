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
  if (value === 'not_applicable') return 'شامل امتحان نبوده';
  if (value === 'pending') return 'در انتظار';
  return value || '---';
};

export default function MyGrades() {
  const [student, setStudent] = useState(null);
  const [items, setItems] = useState([]);
  const [generalResults, setGeneralResults] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadGrades = async () => {
    setLoading(true);
    setMessage('');
    try {
      const [response, generalResponse] = await Promise.all([
        fetch(`${API_BASE}/api/exams/my/results`, { headers: { ...getAuthHeaders() } }),
        fetch(`${API_BASE}/api/result-tables/my/published`, { headers: { ...getAuthHeaders() } }).catch(() => null)
      ]);
      const data = await response.json().catch(() => ({}));
      const generalData = generalResponse ? await generalResponse.json().catch(() => ({})) : {};
      if (!response.ok || data?.success === false) {
        setMessage(data?.message || 'خطا در دریافت نتایج امتحانات');
        setItems([]);
        setGeneralResults([]);
        setStudent(null);
        return;
      }
      setStudent(data.student || null);
      setItems(data.items || []);
      setGeneralResults(generalResponse?.ok && generalData?.success !== false ? (generalData.items || []) : []);
    } catch {
      setMessage('خطا در ارتباط با سرور');
      setItems([]);
      setGeneralResults([]);
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
          این صفحه نتایج تأییدشده را مستقیماً از شقه‌های مضمون و بخش امتحانات نمایش می‌دهد.
          {student?.fullName ? ` ${student.fullName}` : ''}
          {student?.asasNumber ? ` | نمبر اساس: ${student.asasNumber}` : ''}
        </p>

        {loading && <div className="mygrades-empty">در حال دریافت...</div>}
        {message && <div className="mygrades-empty">{message}</div>}
        {!loading && !message && !items.length && !generalResults.length && (
          <div className="mygrades-empty">هنوز نتیجهٔ امتحانی تأییدشده‌ای برای حساب شما موجود نیست.</div>
        )}

        {generalResults.length > 0 && (
          <section className="mygrades-general-results">
            <div className="mygrades-general-title">
              <div>
                <h3>نتیجهٔ عمومی نشرشده</h3>
                <p>این نتیجه پس از تأیید مدیریت از مجموع چهارنیم‌ماهه و سالانه ساخته شده و قابل ویرایش مستقیم نیست.</p>
              </div>
              <span className="badge dark">۱۶/۴۰، ۴۰/۶۰ و ۵۵/۱۰۰</span>
            </div>
            {generalResults.map((result) => (
              <article key={`${result.id}-${result.version}`} className="mygrades-general-card">
                <div className="mygrades-head">
                  <div>
                    <strong>{result.schoolClass?.title || result.title}</strong>
                    <div className="meta">سال تعلیمی: {result.academicYear?.title || '---'} | نسخه: {Number(result.version || 1).toLocaleString('fa-AF-u-ca-persian')}</div>
                  </div>
                  <div className="mygrades-badges">
                    <span className="badge">نتیجه: {statusLabel(result.resultStatus)}</span>
                    <span className="badge accent">فیصدی: {toScore(result.percentage ?? result.average).toLocaleString('fa-AF-u-ca-persian')}٪</span>
                    {result.rank != null && <span className="badge warning">درجه: {Number(result.rank).toLocaleString('fa-AF-u-ca-persian')}</span>}
                  </div>
                </div>
                <div className="mygrades-general-subjects">
                  {(result.subjects || []).map((subject) => (
                    <div key={subject.subjectId || subject.subjectCode}>
                      <b>{subject.subjectName || subject.subjectCode || 'مضمون'}</b>
                      <span>چهارنیم‌ماهه: {subject.fourHalf ?? '---'} / ۴۰</span>
                      <span>سالانه: {subject.annual ?? '---'} / ۶۰</span>
                      <strong>مجموع: {subject.total ?? '---'} / ۱۰۰</strong>
                    </div>
                  ))}
                </div>
                {result.membershipStatusLabel && !['active', 'transferred_in'].includes(result.membershipStatus) && (
                  <div className="mygrades-general-note">وضعیت شاگرد: {result.membershipStatusLabel}</div>
                )}
              </article>
            ))}
          </section>
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
                  <span className="badge dark">فیصدی: {toScore(item.percentage).toLocaleString('fa-AF-u-ca-persian')}٪</span>
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
                <span>تاریخ نتیجه: {toDisplayDate(item.session?.approvedAt || item.session?.publishedAt || item.computedAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
