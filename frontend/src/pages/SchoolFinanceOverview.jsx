import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './SchoolFinanceOverview.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
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

const DOMAIN_ORDER = ['school', 'shortTerm', 'academy'];
const DOMAIN_TONE = { school: 'tone-school', shortTerm: 'tone-short', academy: 'tone-academy' };
const REPORT_KEY = 'consolidated_finance_monthly';
const DEBTORS_PER_PAGE = 10;

function faDigits(value) {
  return Number(value || 0).toLocaleString('fa-AF-u-ca-persian', { useGrouping: false });
}

const MONTH_PRESETS = [
  { key: '3', label: '۳ ماه اخیر' },
  { key: '6', label: '۶ ماه اخیر' },
  { key: '12', label: '۱۲ ماه اخیر' },
  { key: '24', label: '۲۴ ماه اخیر' },
  { key: 'year', label: 'امسال (شمسی)' },
  { key: 'custom', label: 'بازهٔ دلخواه' }
];

function pad2(value) {
  return String(value).padStart(2, '0');
}

function monthKeyLabel(key = '') {
  const [jy, jm] = String(key).split('-').map(Number);
  if (!jy || !jm) return key;
  return `${AFGHAN_SOLAR_MONTHS[jm - 1] || jm} ${jy}`;
}

function methodLabel(value = '') {
  return PAYMENT_METHOD_LABELS[value] || repairDisplayText(value) || 'سایر';
}

function nowShamsi() {
  const solar = gregorianToAfghanSolar(new Date());
  return { jy: solar?.jy || 1404, jm: solar?.jm || 1 };
}

// jy/jm را deltaMonths ماه جابه‌جا می‌کند (منفی = عقب).
function shiftShamsi(jy, jm, deltaMonths) {
  const index = jy * 12 + (jm - 1) + deltaMonths;
  return { jy: Math.floor(index / 12), jm: (index % 12) + 1 };
}

function KpiCard({ label, value, hint, tone, suffix }) {
  return (
    <div className={`sfo-kpi ${tone || ''}`}>
      <span className="sfo-kpi-label">{label}</span>
      <span className="sfo-kpi-value">
        {formatNumber(value)}
        {suffix ? <span className="sfo-kpi-suffix">{suffix}</span> : null}
      </span>
      {hint ? <span className="sfo-kpi-hint">{hint}</span> : null}
    </div>
  );
}

function TrendChart({ trend }) {
  const rows = Array.isArray(trend) ? trend : [];
  if (!rows.length) return null;
  const width = Math.max(360, rows.length * 52);
  const height = 168;
  const padX = 14;
  const padTop = 14;
  const padBottom = 24;
  const values = rows.map((row) => Number(row?.combined?.net || 0));
  const maxAbs = Math.max(1, ...values.map((value) => Math.abs(value)));
  const plotH = height - padTop - padBottom;
  const zeroY = padTop + plotH / 2;
  const scale = (plotH / 2) / maxAbs;
  const slot = (width - padX * 2) / rows.length;
  const barW = Math.min(30, slot * 0.55);

  return (
    <div className="sfo-chart-wrap" role="img" aria-label="روند خالص ماهانهٔ ترکیبی">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="sfo-chart">
        <defs>
          <linearGradient id="sfoBarPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5eead4" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <linearGradient id="sfoBarNeg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
        </defs>
        <line x1={padX} y1={zeroY} x2={width - padX} y2={zeroY} className="sfo-chart-axis" />
        {rows.map((row, index) => {
          const net = Number(row?.combined?.net || 0);
          const barH = Math.max(2, Math.abs(net) * scale);
          // راست‌چین: قدیمی‌ترین ماه سمت راست، جدیدترین سمت چپ
          const cx = width - padX - slot * index - slot / 2;
          const x = cx - barW / 2;
          const y = net >= 0 ? zeroY - barH : zeroY;
          const short = monthKeyLabel(row?.month).split(' ')[0];
          return (
            <g key={row?.month || index}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={5}
                fill={net >= 0 ? 'url(#sfoBarPos)' : 'url(#sfoBarNeg)'}
              >
                <title>{`${monthKeyLabel(row?.month)} — خالص: ${formatNumber(net)}`}</title>
              </rect>
              <text x={cx} y={height - 8} textAnchor="middle" className="sfo-chart-tick">{short}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BreakdownList({ title, items, labelKey, labelFn }) {
  const rows = (Array.isArray(items) ? items : []).slice(0, 8);
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => Number(row.total) || 0), 1);
  return (
    <div className="sfo-breakdown">
      <h4>{title}</h4>
      <ul>
        {rows.map((row, index) => (
          <li key={`${row[labelKey]}-${index}`}>
            <span className="sfo-breakdown-label">{labelFn ? labelFn(row[labelKey]) : repairDisplayText(row[labelKey])}</span>
            <span className="sfo-breakdown-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(4, (Number(row.total) / max) * 100)}%` }} />
            </span>
            <span className="sfo-num">{formatNumber(row.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DebtorTable({ rows }) {
  if (!rows.length) return <p className="sfo-empty">بدهکاری باز ثبت نشده است.</p>;
  return (
    <div className="sfo-tablewrap">
      <table className="sfo-table">
        <thead>
          <tr>
            <th>شاگرد</th>
            <th>شماره اساس</th>
            <th>صنف / کورس</th>
            <th>ماه</th>
            <th className="sfo-num">باقیات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.studentName}-${index}`}>
              <td>{repairDisplayText(row.studentName)}</td>
              <td className="sfo-dim">{repairDisplayText(row.asasNumber || row.studentCode) || '—'}</td>
              <td>{repairDisplayText(row.groupName)}</td>
              <td className="sfo-dim">{repairDisplayText(row.monthLabel) || monthKeyLabel(row.monthKey) || '—'}</td>
              <td className="sfo-num sfo-strong">{formatNumber(row.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  const items = [];
  for (let n = 1; n <= pageCount; n += 1) {
    if (n === 1 || n === pageCount || (n >= page - 1 && n <= page + 1)) items.push(n);
    else if (items[items.length - 1] !== '…') items.push('…');
  }
  return (
    <nav className="sfo-pager" aria-label="صفحه‌بندی بدهکاران">
      <button type="button" className="sfo-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>قبلی</button>
      {items.map((n, idx) => (n === '…'
        ? <span key={`e${idx}`} className="sfo-page-gap">…</span>
        : (
          <button
            key={n}
            type="button"
            className={`sfo-page-btn ${n === page ? 'is-active' : ''}`}
            aria-current={n === page ? 'page' : undefined}
            onClick={() => onChange(n)}
          >
            {faDigits(n)}
          </button>
        )))}
      <button type="button" className="sfo-page-btn" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>بعدی</button>
    </nav>
  );
}

function DomainPanel({ domain, onPrint, printBusy }) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [domain]);

  if (!domain) return null;
  const totals = domain.totals || {};
  const rows = Array.isArray(domain.debtors) ? domain.debtors : [];
  const debtorCount = Number(domain.debtorCount ?? rows.length);
  const pageCount = Math.max(1, Math.ceil(rows.length / DEBTORS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * DEBTORS_PER_PAGE, safePage * DEBTORS_PER_PAGE);
  const netNegative = Number(totals.net) < 0;

  return (
    <section className={`sfo-panel sfo-domain ${DOMAIN_TONE[domain.key] || ''}`}>
      <header className="sfo-panel-head">
        <h3>{repairDisplayText(domain.label)}</h3>
        <div className="sfo-panel-head-side">
          <span className={`sfo-chip ${netNegative ? 'is-neg' : 'is-pos'}`}>
            خالص بازه: {formatNumber(totals.net)} افغانی
          </span>
          <button type="button" className="sfo-linkbtn" onClick={onPrint} disabled={printBusy}>
            {printBusy ? 'در حال ساخت…' : 'دانلود PDF'}
          </button>
        </div>
      </header>

      <div className="sfo-kpi-grid">
        <KpiCard label="درآمد بازه" value={totals.income} tone="pos" />
        <KpiCard label="مصرف بازه" value={totals.expense} tone="neg" />
        <KpiCard label="باقیات باز" value={totals.outstanding} />
        <KpiCard label="نرخ وصول" value={Math.round(Number(totals.collectionRate) || 0)} suffix="٪" />
        <KpiCard label="درآمد ماه جاری" value={totals.currentMonthIncome} />
        <KpiCard label="شاگردان فعال" value={totals.activeStudents} />
      </div>

      {totals.pendingExpense ? (
        <p className="sfo-note">مصرف بازه شاملِ {formatNumber(totals.pendingExpense)} افغانی مصرفِ ثبت‌شده اما در انتظار تأیید است.</p>
      ) : null}
      {totals.refundTotal ? (
        <p className="sfo-note">بازپرداخت‌های پرداخت‌شده در بازه: {formatNumber(totals.refundTotal)} افغانی (از درآمد کسر شده).</p>
      ) : null}

      <div className="sfo-panel-breakdowns">
        <BreakdownList title="درآمد بر اساس روش پرداخت" items={domain.byPaymentMethod} labelKey="method" labelFn={methodLabel} />
        <BreakdownList title="مصرف بر اساس دسته" items={domain.byExpenseCategory} labelKey="category" />
      </div>

      <div className="sfo-debtors-head">
        <h4>
          بدهکاران <span className="sfo-dim">({formatNumber(debtorCount)} نفر)</span>
        </h4>
        {pageCount > 1 ? (
          <span className="sfo-dim">صفحهٔ {faDigits(safePage)} از {faDigits(pageCount)}</span>
        ) : null}
      </div>
      <DebtorTable rows={pageRows} />
      <Pager page={safePage} pageCount={pageCount} onChange={setPage} />
    </section>
  );
}

export default function SchoolFinanceOverview() {
  const now = useMemo(() => nowShamsi(), []);
  const yearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, index) => now.jy - index),
    [now.jy]
  );
  const defaultFrom = useMemo(() => shiftShamsi(now.jy, now.jm, -11), [now.jy, now.jm]);

  const [preset, setPreset] = useState('12');
  const [fromY, setFromY] = useState(defaultFrom.jy);
  const [fromM, setFromM] = useState(defaultFrom.jm);
  const [toY, setToY] = useState(now.jy);
  const [toM, setToM] = useState(now.jm);

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');

  const fromKey = `${fromY}-${pad2(fromM)}`;
  const toKey = `${toY}-${pad2(toM)}`;
  const customInvalid = preset === 'custom' && (fromY * 12 + fromM) > (toY * 12 + toM);

  const queryString = useMemo(() => {
    if (preset === 'custom') return `?from=${fromKey}&to=${toKey}`;
    if (preset === 'year') return `?year=${now.jy}`;
    return `?months=${preset}`;
  }, [preset, fromKey, toKey, now.jy]);

  const exportFilters = useMemo(() => {
    if (preset === 'custom') return { shamsiFrom: fromKey, shamsiTo: toKey };
    if (preset === 'year') return { shamsiYear: now.jy };
    return { rollingMonths: Number(preset) };
  }, [preset, fromKey, toKey, now.jy]);

  const load = useCallback(async () => {
    if (customInvalid) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchJson(`/api/reports/consolidated-finance${queryString}`);
      setReport(data?.report || null);
    } catch (err) {
      setError(errorMessage(err, 'دریافت گزارش مالی یکپارچه ناموفق بود.'));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [queryString, customInvalid]);

  useEffect(() => {
    load();
  }, [load]);

  const exportExcel = async () => {
    setExporting('xlsx');
    setExportError('');
    try {
      const { blob, filename } = await fetchBlob('/api/reports/export.xlsx', { reportKey: REPORT_KEY, filters: exportFilters });
      downloadBlob(blob, filename || 'consolidated-finance.xlsx');
    } catch (err) {
      setExportError(errorMessage(err, 'دریافت خروجی اکسل ناموفق بود.'));
    } finally {
      setExporting('');
    }
  };

  // خروجی PDF — بخش = 'all' یا کلیدِ حوزه. اگر سرور نتواند PDF بسازد، HTML می‌دهد
  // که در پنجرهٔ جدید باز می‌شود (کاربر Ctrl+P می‌زند).
  const printSection = async (section) => {
    setExporting(`print-${section}`);
    setExportError('');
    try {
      const url = `/api/reports/consolidated-finance/print${queryString}&section=${encodeURIComponent(section)}`;
      const { blob, filename, contentType } = await fetchBlob(url, {}, { method: 'GET' });
      if ((contentType || '').includes('application/pdf')) {
        downloadBlob(blob, filename || `consolidated-finance-${section}.pdf`);
      } else {
        const text = await blob.text();
        const opened = openHtmlDocument(text, filename);
        if (!opened) downloadBlob(blob, filename || `consolidated-finance-${section}.html`);
      }
    } catch (err) {
      setExportError(errorMessage(err, 'آماده‌سازی خروجی PDF ناموفق بود.'));
    } finally {
      setExporting('');
    }
  };

  const combined = report?.combined || {};
  const period = report?.period || {};
  const domains = report?.domains || {};

  return (
    <div className="sfo-page" dir="rtl">
      <header className="sfo-hero">
        <div>
          <h1>گزارش مالی یکپارچهٔ مکتب</h1>
          <p>مرکز مالی مکتب، آموزشگاه و شاگردان موقت — یکجا. مبنا: نقدی · تفکیک بر اساس ماه شمسی · واحد پول: افغانی.</p>
        </div>
        <Link to="/admin" className="sfo-back">بازگشت به پنل</Link>
      </header>

      <div className="sfo-toolbar">
        <div className="sfo-preset-row">
          {MONTH_PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`sfo-pill ${preset === item.key ? 'is-active' : ''}`}
              onClick={() => setPreset(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === 'custom' ? (
          <div className="sfo-range-row">
            <span className="sfo-range-lbl">از</span>
            <select value={fromM} onChange={(e) => setFromM(Number(e.target.value))}>
              {AFGHAN_SOLAR_MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
            <select value={fromY} onChange={(e) => setFromY(Number(e.target.value))}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <span className="sfo-range-lbl">تا</span>
            <select value={toM} onChange={(e) => setToM(Number(e.target.value))}>
              {AFGHAN_SOLAR_MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
            <select value={toY} onChange={(e) => setToY(Number(e.target.value))}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            {customInvalid ? <span className="sfo-range-warn">«از» نباید بعد از «تا» باشد</span> : null}
          </div>
        ) : null}

        <div className="sfo-toolbar-actions">
          <button type="button" className="sfo-btn" onClick={load} disabled={loading || customInvalid}>
            {loading ? 'در حال بارگذاری…' : 'تازه‌سازی'}
          </button>
          <button type="button" className="sfo-btn sfo-btn-ghost" onClick={exportExcel} disabled={!report || Boolean(exporting)}>
            {exporting === 'xlsx' ? 'در حال ساخت…' : 'خروجی Excel'}
          </button>
          <button type="button" className="sfo-btn sfo-btn-ghost" onClick={() => printSection('all')} disabled={!report || Boolean(exporting)}>
            {exporting === 'print-all' ? 'در حال ساخت…' : 'PDF گزارش کامل'}
          </button>
          {period?.from ? (
            <span className="sfo-range-tag">{monthKeyLabel(period.from)} — {monthKeyLabel(period.to)}</span>
          ) : null}
        </div>
      </div>

      {error ? <div className="sfo-alert is-error">{error}</div> : null}
      {exportError ? <div className="sfo-alert is-error">{exportError}</div> : null}

      {loading && !report ? <div className="sfo-loading">در حال ساخت گزارش…</div> : null}

      {report ? (
        <>
          <section className="sfo-panel sfo-combined">
            <h2>مجموع هر سه بخش</h2>
            <div className="sfo-kpi-grid sfo-kpi-grid-lg">
              <KpiCard label="کل درآمد" value={combined.income} tone="pos" />
              <KpiCard
                label="کل مصرف"
                value={combined.expense}
                tone="neg"
                hint={combined.pendingExpense ? `${formatNumber(combined.pendingExpense)} افغانی در انتظار تأیید` : ''}
              />
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

            <h3 className="sfo-section-title">روند خالص ماهانهٔ ترکیبی</h3>
            <TrendChart trend={report.monthlyTrend} />

            <div className="sfo-tablewrap">
              <table className="sfo-table">
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
                      <td className={`sfo-num sfo-strong ${Number(row?.combined?.net) < 0 ? 'is-neg' : 'is-pos'}`}>
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
              <DomainPanel
                key={key}
                domain={domains[key]}
                onPrint={() => printSection(key)}
                printBusy={exporting === `print-${key}`}
              />
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
