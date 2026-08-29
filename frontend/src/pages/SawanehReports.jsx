import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import './SawanehReports.css';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const GRADE_LABELS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];
const gradeLabel = (n) => (n >= 1 && n <= 12 ? GRADE_LABELS[n - 1] : '—');
const fmt = (n) => new Intl.NumberFormat('fa-AF').format(Number(n) || 0);

const REASON_LABELS = {
  no_card: 'کارت ندارد',
  draft_card: 'کارت پیش‌نویس',
  missing_remark: 'نظر نگرانِ صنفِ جاری خالی'
};
const REASON_MAP = {
  transfer: 'تبدیلی', dropout: 'ترک تحصیل', expulsion: 'اخراج', graduation: 'فراغت', death: 'وفات', other: 'سایر'
};

const SawanehReports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [grade, setGrade] = useState('');
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (grade) params.set('grade', grade);
      const res = await fetch(`${API_BASE}/api/sawaneh/reports/overview?${params.toString()}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'خطا در دریافت گزارش');
      setData(json.data);
    } catch (err) {
      setError(err.message || 'خطا در اتصال به سرور');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [grade]);

  useEffect(() => { load(); }, [load]);

  const downloadAsasList = async () => {
    setDownloading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (grade) params.set('grade', grade);
      const res = await fetch(`${API_BASE}/api/sawaneh/reports/asas-list.xlsx?${params.toString()}`, { headers: authHeaders() });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'دانلود ناموفق بود');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `asas-list${grade ? `-صنف-${grade}` : ''}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'دانلود لست اساس ناموفق بود');
    } finally {
      setDownloading(false);
    }
  };

  const labels = data?.labels || { tiers: {}, promotion: {} };

  return (
    <div className="sawaneh-reports" dir="rtl">
      <header className="sr-header">
        <div>
          <h1>گزارش‌های سوانح شاگرد</h1>
          <p>مکاتب افغانستان</p>
        </div>
        <div className="sr-header-actions">
          <select value={grade} onChange={(event) => setGrade(event.target.value)}>
            <option value="">همهٔ صنوف</option>
            {GRADE_LABELS.map((label, i) => <option key={label} value={i + 1}>{`صنف ${label}`}</option>)}
          </select>
          <button type="button" className="sr-btn" onClick={() => navigate('/afghan-sawaneh')}>پرونده‌های سوانح</button>
          <button type="button" className="sr-btn" onClick={() => navigate('/afghan-dashboard')}>داشبورد</button>
        </div>
      </header>

      {error && <div className="sr-error">{error}</div>}
      {loading && <div className="sr-muted">در حال بارگذاری…</div>}

      {!loading && data && (
        <>
          <section className="sr-tiles">
            <div className="sr-tile sr-tile-warn">
              <span className="sr-tile-num">{fmt(data.counts.incompleteCards)}</span>
              <span>کارت‌های ناقص</span>
            </div>
            <div className="sr-tile sr-tile-warn">
              <span className="sr-tile-num">{fmt(data.counts.unfinalizedTranscripts)}</span>
              <span>ترانسکریپت‌های نهایی‌نشده</span>
            </div>
            <div className="sr-tile sr-tile-danger">
              <span className="sr-tile-num">{fmt(data.counts.unpaidPenalties)}</span>
              <span>جریمه‌های پرداخت‌نشده</span>
            </div>
            <div className="sr-tile">
              <span className="sr-tile-num">{fmt(data.counts.unpaidPenaltyTotal)}</span>
              <span>مجموع مبلغ جریمهٔ معوق</span>
            </div>
          </section>

          <section className="sr-section">
            <div className="sr-section-head">
              <h2>وضعیت سوانح تعلیمی به تفکیک صنف</h2>
            </div>
            <div className="sr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>صنف</th><th>مجموع</th><th>پیش‌نویس</th><th>نهایی‌شده</th><th>قفل‌شده</th><th>اوسط صنف</th>
                    <th>اعلی</th><th>عالی</th><th>متوسط</th><th>ناکام</th>
                    <th>کامیاب</th><th>مشروط</th><th>ناکام صنف</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transcriptStatus.length === 0 && (
                    <tr><td colSpan={13} className="sr-muted">داده‌ای نیست.</td></tr>
                  )}
                  {data.transcriptStatus.map((row) => (
                    <tr key={row.grade}>
                      <td>{gradeLabel(row.grade)}</td>
                      <td>{fmt(row.total)}</td>
                      <td>{fmt(row.draft)}</td>
                      <td>{fmt(row.finalized)}</td>
                      <td>{fmt(row.locked)}</td>
                      <td>{row.classAverage}</td>
                      <td>{fmt(row.tiers.aali)}</td>
                      <td>{fmt(row.tiers.ali)}</td>
                      <td>{fmt(row.tiers.motawaset)}</td>
                      <td>{fmt(row.tiers.nakam)}</td>
                      <td>{fmt(row.promotion.kamyab + row.promotion.kamyab_makeup)}</td>
                      <td>{fmt(row.promotion.mashroot)}</td>
                      <td>{fmt(row.promotion.nakam_senf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sr-section">
            <div className="sr-section-head">
              <h2>کارت‌های سوانحِ ناقص</h2>
              <button type="button" className="sr-btn sr-btn-primary" onClick={downloadAsasList} disabled={downloading}>
                {downloading ? 'در حال ساخت…' : 'دانلود لست اساس (اکسل)'}
              </button>
            </div>
            <div className="sr-table-wrap">
              <table>
                <thead><tr><th>نام</th><th>نمبر اساس</th><th>صنف</th><th>نقص</th><th /></tr></thead>
                <tbody>
                  {data.incompleteCards.length === 0 && (
                    <tr><td colSpan={5} className="sr-muted">همهٔ کارت‌ها کامل‌اند.</td></tr>
                  )}
                  {data.incompleteCards.map((row) => (
                    <tr key={row.studentId}>
                      <td>{row.name}</td>
                      <td>{row.asasNumber || '—'}</td>
                      <td>{gradeLabel(row.grade)}</td>
                      <td><span className="sr-pill sr-pill-warn">{REASON_LABELS[row.reason] || row.reason}</span></td>
                      <td>
                        <button type="button" className="sr-link" onClick={() => navigate(`/afghan-sawaneh/${row.studentId}`)}>
                          باز کردن
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.unfinalizedTranscripts.length > 0 && (
            <section className="sr-section">
              <div className="sr-section-head"><h2>ترانسکریپت‌های نهایی‌نشده</h2></div>
              <div className="sr-table-wrap">
                <table>
                  <thead><tr><th>نام</th><th>نمبر اساس</th><th>صنف</th><th /></tr></thead>
                  <tbody>
                    {data.unfinalizedTranscripts.map((row) => (
                      <tr key={row.studentId}>
                        <td>{row.name}</td>
                        <td>{row.asasNumber || '—'}</td>
                        <td>{gradeLabel(row.grade)}</td>
                        <td>
                          <button type="button" className="sr-link" onClick={() => navigate(`/afghan-sawaneh/${row.studentId}`)}>
                            باز کردن
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.unpaidPenalties.length > 0 && (
            <section className="sr-section">
              <div className="sr-section-head"><h2>منفک‌شده‌ها با جریمهٔ پرداخت‌نشده</h2></div>
              <div className="sr-table-wrap">
                <table>
                  <thead><tr><th>نام</th><th>نمبر اساس</th><th>صنف</th><th>علت</th><th>تاریخ</th><th>مبلغ جریمه</th><th /></tr></thead>
                  <tbody>
                    {data.unpaidPenalties.map((row) => (
                      <tr key={row.studentId}>
                        <td>{row.name}</td>
                        <td>{row.asasNumber || '—'}</td>
                        <td>{gradeLabel(row.grade)}</td>
                        <td>{REASON_MAP[row.reason] || row.reason || '—'}</td>
                        <td>{row.dateLocal || '—'}</td>
                        <td>{fmt(row.amount)}</td>
                        <td>
                          <button type="button" className="sr-link" onClick={() => navigate(`/afghan-sawaneh/${row.studentId}`)}>
                            باز کردن
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default SawanehReports;
