import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import './SawanehDashboard.css';

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
  missing_remark: 'نظرِ نگرانِ صنفِ جاری خالی'
};

const QUICK_LINKS = [
  { to: '/afghan-sawaneh', icon: '🗂️', label: 'پرونده‌های سوانح', hint: 'کارت سوانح + سوانح تعلیمی + چاپ' },
  { to: '/afghan-sawaneh/reports', icon: '📊', label: 'گزارش‌های سوانح', hint: 'کارت‌های ناقص، وضعیت، لست اساس' },
  { to: '/afghan-schools', icon: '🏫', label: 'مدیریت مکاتب', hint: 'مشخصات مکتب' },
  { to: '/afghan-schools-stats', icon: '📈', label: 'آمار مکتب', hint: 'شاگردان، معلمان، توزیع' },
  { to: '/afghan-reports', icon: '📋', label: 'گزارشات عمومی', hint: 'گزارش‌های مکتب' },
  { to: '/afghan-map', icon: '🗺️', label: 'نقشهٔ مکاتب', hint: 'موقعیت جغرافیایی' }
];

const SawanehDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/reports/overview`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'خطا در دریافت داشبورد');
      setData(json.data);
    } catch (err) {
      setError(err.message || 'خطا در اتصال به سرور');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const c = data?.counts || {};

  return (
    <div className="sawaneh-dash" dir="rtl">
      <header className="sd-header">
        <div>
          <h1>داشبورد سوانح شاگرد</h1>
          <p>مکتب ایمان — مکاتب افغانستان</p>
        </div>
        <button type="button" className="sd-btn" onClick={load} disabled={loading}>
          {loading ? 'در حال بارگذاری…' : 'بازخوانی'}
        </button>
      </header>

      {error && <div className="sd-error">{error}</div>}

      {!error && (
        <section className="sd-tiles">
          <div className="sd-tile">
            <span className="sd-tile-num">{fmt(c.activeStudents)}</span>
            <span>شاگردان فعال</span>
          </div>
          <div className="sd-tile">
            <span className="sd-tile-num">{fmt(c.cardsActive)}<small> / {fmt(c.activeStudents)}</small></span>
            <span>کارت سوانح فعال</span>
          </div>
          <div className={`sd-tile ${c.incompleteCards ? 'sd-tile-warn' : ''}`}>
            <span className="sd-tile-num">{fmt(c.incompleteCards)}</span>
            <span>کارت‌های ناقص</span>
          </div>
          <div className={`sd-tile ${c.unfinalizedTranscripts ? 'sd-tile-warn' : ''}`}>
            <span className="sd-tile-num">{fmt(c.unfinalizedTranscripts)}</span>
            <span>سوانح تعلیمیِ نهایی‌نشده</span>
          </div>
          <div className={`sd-tile ${c.unpaidPenalties ? 'sd-tile-danger' : ''}`}>
            <span className="sd-tile-num">{fmt(c.unpaidPenalties)}</span>
            <span>منفک با جریمهٔ معوق</span>
          </div>
          <div className="sd-tile">
            <span className="sd-tile-num">{fmt(c.unpaidPenaltyTotal)}</span>
            <span>مجموع مبلغ جریمهٔ معوق</span>
          </div>
        </section>
      )}

      <section className="sd-section">
        <div className="sd-section-head">
          <h2>اقدامات سریع</h2>
        </div>
        <div className="sd-quick">
          {QUICK_LINKS.map((q) => (
            <button key={q.to} type="button" className="sd-quick-card" onClick={() => navigate(q.to)}>
              <span className="sd-quick-icon" aria-hidden="true">{q.icon}</span>
              <span className="sd-quick-label">{q.label}</span>
              <span className="sd-quick-hint">{q.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {!error && data && (
        <>
          <section className="sd-section">
            <div className="sd-section-head">
              <h2>وضعیت سوانح تعلیمی به تفکیک صنف</h2>
              <button type="button" className="sd-link" onClick={() => navigate('/afghan-sawaneh/reports')}>
                گزارش کامل
              </button>
            </div>
            <div className="sd-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>صنف</th><th>مجموع</th><th>پیش‌نویس</th><th>نهایی‌شده</th><th>قفل‌شده</th><th>اوسط صنف</th>
                    <th>اعلی</th><th>عالی</th><th>متوسط</th><th>ناکام</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.transcriptStatus || []).length === 0 && (
                    <tr><td colSpan={10} className="sd-muted">هنوز سوانح تعلیمی ساخته نشده.</td></tr>
                  )}
                  {(data.transcriptStatus || []).map((row) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sd-section">
            <div className="sd-section-head">
              <h2>کارت‌های سوانحِ ناقص</h2>
              <button type="button" className="sd-link" onClick={() => navigate('/afghan-sawaneh/reports')}>
                همه ({fmt(c.incompleteCards)})
              </button>
            </div>
            <div className="sd-table-wrap">
              <table>
                <thead><tr><th>نام</th><th>نمبر اساس</th><th>صنف</th><th>نقص</th><th /></tr></thead>
                <tbody>
                  {(data.incompleteCards || []).length === 0 && (
                    <tr><td colSpan={5} className="sd-muted">همهٔ کارت‌ها کامل‌اند.</td></tr>
                  )}
                  {(data.incompleteCards || []).slice(0, 8).map((row) => (
                    <tr key={row.studentId}>
                      <td>{row.name}</td>
                      <td>{row.asasNumber || '—'}</td>
                      <td>{gradeLabel(row.grade)}</td>
                      <td><span className="sd-pill">{REASON_LABELS[row.reason] || row.reason}</span></td>
                      <td>
                        <button type="button" className="sd-link" onClick={() => navigate(`/afghan-sawaneh/${row.studentId}`)}>
                          باز کردن
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default SawanehDashboard;
