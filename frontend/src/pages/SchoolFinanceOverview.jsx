import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './SchoolFinanceOverview.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  fetchText,
  formatNumber,
  openHtmlDocument,
  repairDisplayText
} from './adminWorkspaceUtils';
import { AFGHAN_SOLAR_MONTHS, gregorianToAfghanSolar } from '../utils/afghanDate';

const PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  card: 'کارت',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'ثبت دستی',
  gateway: 'درگاه پرداخت',
  other: 'سایر'
};

const PAYMENT_PLAN_LABELS = {
  full: 'یک‌جا',
  installment: 'قسطی',
  monthly: 'ماهانه'
};

const DOMAIN_ORDER = ['school', 'shortTerm', 'academy'];
const DOMAIN_TONE = { school: 'tone-school', shortTerm: 'tone-short', academy: 'tone-academy' };
const REPORT_KEY = 'consolidated_finance_monthly';

function monthKeyLabel(key = '') {
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy || !jm) return key;
  return `${AFGHAN_SOLAR_MONTHS[jm - 1] || jm} ${jy}`;
}

function methodLabel(value = '') {
  return PAYMENT_METHOD_LABELS[value] || repairDisplayText(value) || 'سایر';
}

function currentShamsiYear() {
  const solar = gregorianToAfghanSolar(new Date());
  return solar?.jy || 1404;
}

function KpiCard({ label, value, hint, tone }) {
  return (
    <div className={`sfo-kpi ${tone || ''}`}>
      <span className="sfo-kpi-label">{label}</span>
      <span className="sfo-kpi-value">{formatNumber(value)}</span>
      {hint ? <span className="sfo-kpi-hint">{hint}</span> : null}
    </div>
  );
}

function TrendChart({ trend }) {
  const rows = Array.isArray(trend) ? trend : [];
  if (!rows.length) return null;
  const width = Math.max(320, rows.length * 46);
  const height = 150;
  const pad = 24;
  const values = rows.map((row) => Number(row?.combined?.net || 0));
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const barW = (width - pad * 2) / rows.length;
  const zeroY = pad + (height - pad * 2) / 2;
  const scale = (height - pad * 2) / 2 / maxAbs;

  return (
    <div className="sfo-chart-wrap" role="img" aria-label="روند خالص ماهانهٔ ترکیبی">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="sfo-chart">
        <line x1={pad} y1={zeroY} x2={width - pad} y2={zeroY} className="sfo-chart-axis" />
        {rows.map((row, index) => {
          const net = Number(row?.combined?.net || 0);
          const barH = Math.abs(net) * scale;
          const x = pad + index * barW + barW * 0.18;
          const y = net >= 0 ? zeroY - barH : zeroY;
          return (
            <rect
              key={row?.month || index}
              x={x}
              y={y}
              width={barW * 0.64}
              height={Math.max(1, barH)}
              className={net >= 0 ? 'sfo-bar sfo-bar-pos' : 'sfo-bar sfo-bar-neg'}
            >
              <title>{`${monthKeyLabel(row?.month)} — خالص: ${formatNumber(net)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function BreakdownList({ title, items, labelKey, labelFn }) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 8);
  if (!rows.length) return null;
  return (
    <div className="sfo-breakdown">
      <h4>{title}</h4>
      <ul>
        {rows.map((row, index) => (
          <li key={`${row[labelKey]}-${index}`}>
            <span>{labelFn ? labelFn(row[labelKey]) : repairDisplayText(row[labelKey])}</span>
            <span className="sfo-num">{formatNumber(row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DebtorTable({ debtors, expanded }) {
  const rows = Array.isArray(debtors) ? debtors : [];
  if (!rows.length) return <p className="sfo-empty">بدهکاری باز ثبت نشده است.</p>;
  return (
    <div className="sfo-debtors">
      <table>
        <thead>
          <tr>
            <th>شاگرد</th>
            <th>شماره</th>
            <th>صنف / کورس</th>
            {expanded ? <th>پلان</th> : null}
            {expanded ? <th>تماس</th> : null}
            {expanded ? <th className="sfo-num">تأخیر (روز)</th> : null}
            <th className="sfo-num">باقیات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.studentName}-${index}`}>
              <td>{repairDisplayText(row.studentName)}</td>
              <td>{repairDisplayText(row.studentCode) || '—'}</td>
              <td>{repairDisplayText(row.groupName)}</td>
              {expanded ? <td>{PAYMENT_PLAN_LABELS[row.paymentPlan] || (row.overdueCount != null ? `${row.orderCount || 0} بل` : '—')}</td> : null}
              {expanded ? <td>{repairDisplayText(row.phone) || '—'}</td> : null}
              {expanded ? <td className="sfo-num">{row.maxLateDays ? formatNumber(row.maxLateDays) : '—'}</td> : null}
              <td className="sfo-num">{formatNumber(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DomainPanel({ domain }) {
  const [fullList, setFullList] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [listError, setListError] = useState('');

  if (!domain) return null;
  const totals = domain.totals || {};
  const debtorCount = Number(domain.debtorCount ?? (domain.topDebtors || []).length);
  const hasMore = debtorCount > (domain.topDebtors || []).length;

  const toggleAll = async () => {
    if (showAll) {
      setShowAll(false);
      return;
    }
    if (fullList) {
      setShowAll(true);
      return;
    }
    setLoadingAll(true);
    setListError('');
    try {
      const data = await fetchJson(`/api/reports/consolidated-finance/debtors?domain=${encodeURIComponent(domain.key)}`);
      setFullList(Array.isArray(data?.debtors) ? data.debtors : []);
      setShowAll(true);
    } catch (err) {
      setListError(errorMessage(err, 'دریافت لیست کامل بدهکاران ناموفق بود.'));
    } finally {
      setLoadingAll(false);
    }
  };

  const debtorsToShow = showAll && fullList ? fullList : domain.topDebtors;

  return (
    <section className={`sfo-panel ${DOMAIN_TONE[domain.key] || ''}`}>
      <header className="sfo-panel-head">
        <h3>{repairDisplayText(domain.label)}</h3>
        <span className="sfo-panel-net">
          خالص بازه: <strong>{formatNumber(totals.net)}</strong> افغانی
        </span>
      </header>

      <div className="sfo-panel-kpis">
        <KpiCard label="درآمد بازه" value={totals.income} />
        <KpiCard label="مصرف بازه" value={totals.expense} />
        <KpiCard label="باقیات باز" value={totals.outstanding} />
        <KpiCard label="نرخ وصول" value={totals.collectionRate} hint="٪" />
        <KpiCard label="درآمد ماه جاری" value={totals.currentMonthIncome} />
        <KpiCard label="شاگردان فعال" value={totals.activeStudents} />
      </div>

      {totals.refundTotal ? (
        <p className="sfo-note">بازپرداخت‌های پرداخت‌شده در بازه: {formatNumber(totals.refundTotal)} افغانی (از درآمد کسر شده)</p>
      ) : null}

      <div className="sfo-panel-breakdowns">
        <BreakdownList title="درآمد بر اساس روش پرداخت" items={domain.byPaymentMethod} labelKey="method" labelFn={methodLabel} />
        <BreakdownList title="مصرف بر اساس دسته" items={domain.byExpenseCategory} labelKey="category" />
      </div>

      <div className="sfo-debtors-head">
        <h4 className="sfo-debtors-title">
          بدهکاران {showAll ? `(همه — ${formatNumber(debtorCount)})` : `(برتر — تا ۲۵ مورد از ${formatNumber(debtorCount)})`}
        </h4>
        {(hasMore || showAll) ? (
          <button type="button" className="sfo-linkbtn" onClick={toggleAll} disabled={loadingAll}>
            {loadingAll ? 'در حال بارگذاری…' : showAll ? 'نمایش فقط برترها' : 'نمایش همه بدهکاران'}
          </button>
        ) : null}
      </div>
      {listError ? <p className="sfo-empty">{listError}</p> : null}
      <DebtorTable debtors={debtorsToShow} expanded={showAll} />
    </section>
  );
}

export default function SchoolFinanceOverview() {
  const thisYear = useMemo(() => currentShamsiYear(), []);
  const [scope, setScope] = useState('rolling'); // 'rolling' | '<jy>'
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const yearOptions = useMemo(() => [thisYear, thisYear - 1, thisYear - 2], [thisYear]);

  const filtersForExport = useMemo(() => (
    scope === 'rolling' ? { rollingMonths: 12 } : { shamsiYear: Number(scope) }
  ), [scope]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = scope === 'rolling' ? '?months=12' : `?year=${encodeURIComponent(scope)}`;
      const data = await fetchJson(`/api/reports/consolidated-finance${query}`);
      setReport(data?.report || null);
    } catch (err) {
      setError(errorMessage(err, 'دریافت گزارش مالی یکپارچه ناموفق بود.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  const exportExcel = async () => {
    setExporting('xlsx');
    setExportError('');
    try {
      const { blob, filename } = await fetchBlob('/api/reports/export.xlsx', {
        reportKey: REPORT_KEY,
        filters: filtersForExport
      });
      downloadBlob(blob, filename || 'consolidated-finance.xlsx');
    } catch (err) {
      setExportError(errorMessage(err, 'دریافت خروجی اکسل ناموفق بود.'));
    } finally {
      setExporting('');
    }
  };

  const exportPrint = async () => {
    setExporting('print');
    setExportError('');
    try {
      const { text, filename, contentType } = await fetchText('/api/reports/export.print', {
        reportKey: REPORT_KEY,
        filters: filtersForExport
      });
      const opened = openHtmlDocument(text, filename);
      if (!opened) downloadBlob(new Blob([text], { type: contentType }), filename || 'consolidated-finance.html');
    } catch (err) {
      setExportError(errorMessage(err, 'آماده‌سازی نسخهٔ چاپی ناموفق بود.'));
    } finally {
      setExporting('');
    }
  };

  const combined = report?.combined || {};
  const period = report?.period || {};
  const domains = report?.domains || {};

  return (
    <div className="sfo-page" dir="rtl">
      <div className="sfo-topbar">
        <div>
          <h1>گزارش مالی یکپارچهٔ مکتب</h1>
          <p className="sfo-sub">
            مرکز مالی مکتب، آموزشگاه و شاگردان موقت — یکجا. مبنا: نقدی، تفکیک بر اساس ماه شمسی، واحد پول: افغانی.
          </p>
        </div>
        <Link to="/admin" className="sfo-back">بازگشت به پنل</Link>
      </div>

      <div className="sfo-controls">
        <label>
          بازه:
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="rolling">۱۲ ماه اخیر</option>
            {yearOptions.map((year) => (
              <option key={year} value={year}>{`سال ${year}`}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'در حال بارگذاری…' : 'تازه‌سازی'}
        </button>
        <span className="sfo-controls-sep" aria-hidden="true" />
        <button type="button" onClick={exportExcel} disabled={!report || Boolean(exporting)}>
          {exporting === 'xlsx' ? 'در حال ساخت…' : 'خروجی Excel'}
        </button>
        <button type="button" onClick={exportPrint} disabled={!report || Boolean(exporting)}>
          {exporting === 'print' ? 'در حال ساخت…' : 'نسخهٔ چاپی / PDF'}
        </button>
        {period?.from ? (
          <span className="sfo-range">
            {monthKeyLabel(period.from)} تا {monthKeyLabel(period.to)}
          </span>
        ) : null}
      </div>

      {error ? <div className="sfo-error">{error}</div> : null}
      {exportError ? <div className="sfo-error">{exportError}</div> : null}

      {loading && !report ? <div className="sfo-loading">در حال ساخت گزارش…</div> : null}

      {report ? (
        <>
          <section className="sfo-combined">
            <h2>مجموع هر سه بخش</h2>
            <div className="sfo-kpi-row">
              <KpiCard label="کل درآمد" value={combined.income} tone="pos" />
              <KpiCard label="کل مصرف" value={combined.expense} tone="neg" />
              <KpiCard label="خالص" value={combined.net} tone={Number(combined.net) < 0 ? 'neg' : 'pos'} />
              <KpiCard label="کل باقیات باز" value={combined.outstanding} />
              <KpiCard
                label="شاگردان فعال"
                value={combined.activeStudents}
                hint={
                  combined.activeStudentsByDomain
                    ? `مکتب ${formatNumber(combined.activeStudentsByDomain.school)} · موقت ${formatNumber(combined.activeStudentsByDomain.shortTerm)} · آموزشگاه ${formatNumber(combined.activeStudentsByDomain.academy)}`
                    : ''
                }
              />
            </div>

            <h3 className="sfo-trend-title">روند خالص ماهانهٔ ترکیبی</h3>
            <TrendChart trend={report.monthlyTrend} />

            <div className="sfo-trend-table-wrap">
              <table className="sfo-trend-table">
                <thead>
                  <tr>
                    <th>ماه</th>
                    <th className="sfo-num">درآمد</th>
                    <th className="sfo-num">مصرف</th>
                    <th className="sfo-num">خالص</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.monthlyTrend || []).map((row) => (
                    <tr key={row.month}>
                      <td>{monthKeyLabel(row.month)}</td>
                      <td className="sfo-num">{formatNumber(row?.combined?.income)}</td>
                      <td className="sfo-num">{formatNumber(row?.combined?.expense)}</td>
                      <td className={`sfo-num ${Number(row?.combined?.net) < 0 ? 'sfo-neg' : ''}`}>
                        {formatNumber(row?.combined?.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="sfo-panels">
            {DOMAIN_ORDER.map((key) => (
              <DomainPanel key={key} domain={domains[key]} />
            ))}
          </div>

          {report.generatedAt ? (
            <p className="sfo-generated">ساخته‌شده در: {new Date(report.generatedAt).toLocaleString('fa-AF-u-ca-persian')}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
