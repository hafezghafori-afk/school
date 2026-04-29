import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import './GovernmentFinanceWorkspace.css';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  fetchText,
  formatNumber,
  openHtmlDocument,
  postJson,
  repairDisplayText,
  toLocaleDateTime
} from './adminWorkspaceUtils';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const LEGACY_GARBLED_TABS = [
  { key: 'dashboard', label: 'نمای کلی' },
  { key: 'year', label: 'مدیریت سال مالی' },
  { key: 'operations', label: 'عملیات مصارف' },
  { key: 'quarterly', label: 'گزارش ربعوار' },
  { key: 'annual', label: 'گزارش سالانه' },
  { key: 'archive', label: 'آرشیف رسمی' }
];

void LEGACY_GARBLED_TABS;

const TABS = [
  { key: 'dashboard', label: 'نمای کلی' },
  { key: 'year', label: 'مدیریت سال مالی' },
  { key: 'operations', label: 'عملیات مصارف' },
  { key: 'treasury', label: 'خزانه و صندوق' },
  { key: 'quarterly', label: 'گزارش ربع‌وار' },
  { key: 'annual', label: 'گزارش سالانه' },
  { key: 'archive', label: 'آرشیف رسمی' }
];

const QUARTER_OPTIONS = [
  { key: 1, label: 'ربع ۱' },
  { key: 2, label: 'ربع ۲' },
  { key: 3, label: 'ربع ۳' },
  { key: 4, label: 'ربع ۴' }
];

const EXPENSE_STATUS_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  void: 'باطل'
};

const EXPENSE_STAGE_LABELS = {
  draft: 'پیش‌نویس داخلی',
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'بررسی ریاست عمومی',
  completed: 'تکمیل شده',
  rejected: 'رد شده',
  void: 'باطل شده'
};

const TREASURY_ACCOUNT_TYPE_LABELS = {
  cashbox: 'صندوق نقدی',
  bank: 'حساب بانکی',
  hawala: 'حواله',
  mobile_money: 'موبایل‌مانی',
  other: 'سایر'
};

const TREASURY_TRANSACTION_TYPE_LABELS = {
  deposit: 'واریز',
  withdrawal: 'برداشت',
  adjustment_in: 'اصلاح داخلی (+)',
  adjustment_out: 'اصلاح داخلی (-)',
  transfer_in: 'انتقال ورودی',
  transfer_out: 'انتقال خروجی',
  reconciliation_adjustment: 'اصلاح تطبیق'
};

const TREASURY_RECONCILIATION_STATUS_LABELS = {
  matched: 'منطبق',
  variance: 'مغایر',
  pending: 'بدون تطبیق'
};

const TREASURY_VARIANCE_SEVERITY_LABELS = {
  critical: 'حیاتی',
  warning: 'نیازمند پیگیری'
};

const BUDGET_STATUS_LABELS = {
  over_budget: 'کسری بودجه',
  unbudgeted: 'بدون بودجه',
  watch: 'نیاز به توجه',
  on_track: 'طبق برنامه',
  no_budget: 'بودجه ندارد'
};

const BUDGET_APPROVAL_STAGE_LABELS = {
  draft: 'پیش‌نویس بودجه',
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'بررسی ریاست عمومی',
  approved: 'بودجه تایید شد',
  rejected: 'بودجه رد شد'
};

const PROCUREMENT_STATUS_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده'
};

const PROCUREMENT_STAGE_LABELS = {
  draft: 'پیش‌نویس داخلی',
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'بررسی ریاست عمومی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده'
};

const PROCUREMENT_TYPE_LABELS = {
  vendor_commitment: 'تعهد فروشنده',
  purchase_order: 'درخواست خرید',
  service_agreement: 'توافق خدمات',
  other: 'سایر'
};

const DELIVERY_CHANNEL_LABELS = {
  email: 'ایمیل',
  portal: 'پورتال',
  sms: 'پیامک',
  whatsapp: 'واتساپ'
};

const ARCHIVE_DELIVERY_STATUS_LABELS = {
  sent: 'ارسال شده',
  resent: 'ارسال مجدد',
  delivered: 'تحویل داده شده',
  failed: 'ناموفق',
  pending: 'در انتظار'
};

const CATEGORY_TONE_OPTIONS = [
  { key: 'teal', label: 'فیروزه‌ای' },
  { key: 'copper', label: 'مسی' },
  { key: 'slate', label: 'دودی' },
  { key: 'rose', label: 'گلی' },
  { key: 'mint', label: 'نعنایی' },
  { key: 'sand', label: 'شنی' }
];

const DEFAULT_TAB = 'dashboard';
const DEFAULT_QUARTER = Math.floor(new Date().getMonth() / 3) + 1;
const TAB_KEYS = new Set(TABS.map((item) => item.key));

const EMPTY_REFERENCE = {
  academicYears: [],
  financialYears: [],
  classes: [],
  expenseCategories: []
};

const EMPTY_DATA = {
  summary: null,
  aging: null,
  cashflow: [],
  byClass: [],
  discounts: [],
  closedMonths: [],
  financeOverview: null,
  financialYears: [],
  expenseCategories: [],
  expenseAnalytics: null,
  treasuryAnalytics: null,
  treasuryReports: null,
  budgetVsActual: null,
  procurementAnalytics: null,
  expenses: [],
  governmentQuarterly: null,
  governmentAnnual: null,
  snapshots: [],
  governmentDocumentArchive: []
};

function formatMoney(value) {
  return `${formatNumber(value)} AFN`;
}

function toNumber(value) {
  return Number(value || 0);
}

function normalizeDisplayPayload(value) {
  if (typeof value === 'string') return repairDisplayText(value);
  if (Array.isArray(value)) return value.map((item) => normalizeDisplayPayload(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeDisplayPayload(item)])
  );
}

function toMonthKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function quarterFromMonthKey(monthKey = '') {
  const month = Number(String(monthKey).slice(5, 7));
  if (!month) return 0;
  return Math.floor((month - 1) / 3) + 1;
}

function monthLabel(monthKey = '') {
  if (!monthKey) return '---';
  const date = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  try {
    const monthText = new Intl.DateTimeFormat('fa-AF-u-ca-persian', { month: 'short' }).format(date);
    const yearText = new Intl.DateTimeFormat('fa-AF-u-ca-persian', { year: 'numeric' }).format(date);
    return `${monthText} ${yearText}`;
  } catch {
    return monthKey;
  }
}

function buildScopedUrl(path, classId = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!classId) return normalizedPath;
  const joiner = normalizedPath.includes('?') ? '&' : '?';
  return `${normalizedPath}${joiner}classId=${encodeURIComponent(classId)}`;
}

function buildMonthlySeries(rows = [], cashflow = []) {
  const buckets = new Map();

  const getBucket = (monthKey) => {
    if (!monthKey) return null;
    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, {
        monthKey,
        label: monthLabel(monthKey),
        due: 0,
        collected: 0,
        outstanding: 0,
        orders: 0,
        classes: new Set()
      });
    }
    return buckets.get(monthKey);
  };

  rows.forEach((row) => {
    const monthKey = toMonthKey(row.issuedAt || row.dueDate);
    const bucket = getBucket(monthKey);
    if (!bucket) return;
    bucket.due += toNumber(row.amountDue);
    bucket.outstanding += toNumber(row.outstandingAmount);
    bucket.orders += 1;
    if (row.classTitle) bucket.classes.add(row.classTitle);
  });

  cashflow.forEach((item) => {
    const monthKey = toMonthKey(item.date);
    const bucket = getBucket(monthKey);
    if (!bucket) return;
    bucket.collected += toNumber(item.total);
  });

  return [...buckets.values()]
    .sort((left, right) => left.monthKey.localeCompare(right.monthKey))
    .map((item) => ({
      ...item,
      classes: item.classes.size
    }));
}

function buildQuarterSummaries(monthlySeries = []) {
  const quarterMap = new Map();

  QUARTER_OPTIONS.forEach((item) => {
    quarterMap.set(item.key, {
      key: item.key,
      label: item.label,
      due: 0,
      collected: 0,
      outstanding: 0,
      orders: 0,
      classes: 0
    });
  });

  monthlySeries.forEach((item) => {
    const quarter = quarterFromMonthKey(item.monthKey);
    if (!quarterMap.has(quarter)) return;
    const bucket = quarterMap.get(quarter);
    bucket.due += item.due;
    bucket.collected += item.collected;
    bucket.outstanding += item.outstanding;
    bucket.orders += item.orders;
    bucket.classes += item.classes;
  });

  return [...quarterMap.values()];
}

function buildQuarterClassRanking(rows = [], selectedQuarter = 1, fallbackItems = []) {
  const grouped = new Map();

  rows.forEach((row) => {
    const monthKey = toMonthKey(row.issuedAt || row.dueDate);
    if (quarterFromMonthKey(monthKey) !== selectedQuarter) return;
    const key = String(row.classTitle || 'بدون صنف').trim();
    if (!grouped.has(key)) {
      grouped.set(key, {
        label: key,
        due: 0,
        outstanding: 0,
        count: 0
      });
    }
    const bucket = grouped.get(key);
    bucket.due += toNumber(row.amountDue);
    bucket.outstanding += toNumber(row.outstandingAmount);
    bucket.count += 1;
  });

  const items = [...grouped.values()].sort((left, right) => right.due - left.due);
  if (items.length) return items.slice(0, 6);

  return (fallbackItems || [])
    .map((item) => ({
      label: item.schoolClass?.title || item.course || 'صنف',
      due: toNumber(item.due),
      outstanding: toNumber(item.remaining),
      count: toNumber(item.bills)
    }))
    .slice(0, 6);
}

function buildTablePreview(rows = [], limit = 8) {
  return Array.isArray(rows) ? rows.slice(0, limit) : [];
}

function toInputDate(value) {
  return toGregorianDateInputValue(value);
}

function toFaDate(value) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '---';
}

function expenseCategorySummary(items = []) {
  const grouped = new Map();
  items.forEach((item) => {
    const key = String(item.category || 'other').trim() || 'other';
    const bucket = grouped.get(key) || { label: key, due: 0 };
    bucket.due += toNumber(item.amount);
    grouped.set(key, bucket);
  });
  return [...grouped.values()].sort((left, right) => right.due - left.due);
}

function resolveExpenseStatusLabel(status = '') {
  return EXPENSE_STATUS_LABELS[String(status || '').trim()] || String(status || 'پیش‌نویس').trim();
}

function resolveExpenseStageLabel(stage = '') {
  return EXPENSE_STAGE_LABELS[String(stage || '').trim()] || String(stage || 'پیش‌نویس داخلی').trim();
}

function resolveTreasuryAccountTypeLabel(accountType = '') {
  return TREASURY_ACCOUNT_TYPE_LABELS[String(accountType || '').trim()] || String(accountType || 'سایر').trim();
}

function resolveTreasuryTransactionTypeLabel(transactionType = '') {
  return TREASURY_TRANSACTION_TYPE_LABELS[String(transactionType || '').trim()] || String(transactionType || 'حرکت').trim();
}

function resolveBudgetApprovalStageLabel(stage = '') {
  return BUDGET_APPROVAL_STAGE_LABELS[String(stage || '').trim()] || String(stage || 'پیش‌نویس بودجه').trim();
}

function resolveProcurementStatusLabel(status = '') {
  return PROCUREMENT_STATUS_LABELS[String(status || '').trim()] || String(status || 'پیش‌نویس').trim();
}

function resolveProcurementStageLabel(stage = '') {
  return PROCUREMENT_STAGE_LABELS[String(stage || '').trim()] || String(stage || 'پیش‌نویس داخلی').trim();
}

function resolveProcurementTypeLabel(value = '') {
  return PROCUREMENT_TYPE_LABELS[String(value || '').trim()] || String(value || 'تعهد خرید').trim();
}

function resolveDeliveryChannelLabel(value = '') {
  return DELIVERY_CHANNEL_LABELS[String(value || '').trim()] || String(value || 'Email').trim();
}

function buildCategorySubCategoryText(items = []) {
  return Array.isArray(items)
    ? items.map((item) => item?.label || item?.key || '').filter(Boolean).join('\n')
    : '';
}

function parseCategorySubCategoryText(value = '') {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((label, index) => ({
      label,
      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `item_${index + 1}`,
      order: index
    }));
}

function sanitizeTab(value) {
  return TAB_KEYS.has(value) ? value : DEFAULT_TAB;
}

function sanitizeQuarter(value) {
  const quarter = Number(value || 0);
  if (QUARTER_OPTIONS.some((item) => item.key === quarter)) return quarter;
  return DEFAULT_QUARTER;
}

function buildGovernmentFinanceSearchParams({
  tab,
  financialYearId,
  academicYearId,
  classId,
  quarter
}) {
  const nextParams = new URLSearchParams();
  const nextTab = sanitizeTab(tab);
  const nextQuarter = sanitizeQuarter(quarter);

  if (nextTab !== DEFAULT_TAB) nextParams.set('tab', nextTab);
  if (financialYearId) nextParams.set('financialYearId', financialYearId);
  if (academicYearId) nextParams.set('academicYearId', academicYearId);
  if (classId) nextParams.set('classId', classId);
  if (nextQuarter !== DEFAULT_QUARTER || nextTab === 'quarterly' || nextTab === 'archive') {
    nextParams.set('quarter', String(nextQuarter));
  }

  return nextParams;
}

function resolveReportLabel(tabKey) {
  if (tabKey === 'quarterly') return 'government_finance_quarterly';
  if (tabKey === 'annual' || tabKey === 'archive') return 'government_finance_annual';
  return 'finance_overview';
}

function readInitialSearchValue(searchParams, key) {
  const directValue = searchParams.get(key);
  if (typeof window !== 'undefined') {
    const windowValue = new URLSearchParams(window.location.search).get(key);
    if (windowValue) return windowValue;
  }
  return directValue || '';
}

function readInitialSearchText(searchParams) {
  if (typeof window !== 'undefined') {
    const windowText = new URLSearchParams(window.location.search).toString();
    if (windowText) return windowText;
  }
  return searchParams.toString();
}

function buildWorkspaceScopeKey({
  financialYearId = '',
  academicYearId = '',
  classId = '',
  quarter = DEFAULT_QUARTER,
  treasuryAccountId = ''
}) {
  return [financialYearId || 'all-fy', academicYearId || 'all-ay', classId || 'all-class', quarter || DEFAULT_QUARTER, treasuryAccountId || 'all-treasury'].join('|');
}

function buildBudgetDraft(value = {}, categories = []) {
  const source = value && typeof value === 'object' ? value : {};
  const categoryMap = new Map(
    Array.isArray(source.categoryBudgets)
      ? source.categoryBudgets.map((item) => [String(item?.categoryKey || '').trim().toLowerCase(), {
          annualBudget: item?.annualBudget != null ? String(item.annualBudget) : '',
          monthlyBudget: item?.monthlyBudget != null ? String(item.monthlyBudget) : '',
          alertThresholdPercent: item?.alertThresholdPercent != null ? String(item.alertThresholdPercent) : '85'
        }])
      : []
  );

  (Array.isArray(categories) ? categories : []).forEach((item) => {
    const key = String(item?.key || '').trim().toLowerCase();
    if (!key || categoryMap.has(key)) return;
    categoryMap.set(key, {
      annualBudget: '',
      monthlyBudget: '',
      alertThresholdPercent: '85'
    });
  });

  return {
    annualIncomeTarget: source.annualIncomeTarget != null ? String(source.annualIncomeTarget) : '',
    annualExpenseBudget: source.annualExpenseBudget != null ? String(source.annualExpenseBudget) : '',
    monthlyIncomeTarget: source.monthlyIncomeTarget != null ? String(source.monthlyIncomeTarget) : '',
    monthlyExpenseBudget: source.monthlyExpenseBudget != null ? String(source.monthlyExpenseBudget) : '',
    treasuryReserveTarget: source.treasuryReserveTarget != null ? String(source.treasuryReserveTarget) : '',
    note: source.note || '',
    categoryBudgets: Object.fromEntries(categoryMap)
  };
}

function serializeBudgetDraft(draft = {}, categories = []) {
  const categoryBudgets = (Array.isArray(categories) ? categories : []).map((item) => {
    const key = String(item?.key || '').trim().toLowerCase();
    const bucket = draft?.categoryBudgets?.[key] || {};
    return {
      categoryKey: key,
      label: item?.label || key,
      annualBudget: Number(bucket.annualBudget || 0),
      monthlyBudget: Number(bucket.monthlyBudget || 0),
      alertThresholdPercent: Number(bucket.alertThresholdPercent || 85)
    };
  }).filter((item) => item.categoryKey);

  return {
    annualIncomeTarget: Number(draft?.annualIncomeTarget || 0),
    annualExpenseBudget: Number(draft?.annualExpenseBudget || 0),
    monthlyIncomeTarget: Number(draft?.monthlyIncomeTarget || 0),
    monthlyExpenseBudget: Number(draft?.monthlyExpenseBudget || 0),
    treasuryReserveTarget: Number(draft?.treasuryReserveTarget || 0),
    note: String(draft?.note || '').trim(),
    categoryBudgets
  };
}

function TrendChart({ series = [] }) {
  const width = 720;
  const height = 280;
  const padX = 42;
  const padY = 28;
  const maxValue = Math.max(
    1,
    ...series.flatMap((item) => [toNumber(item.due), toNumber(item.collected)])
  );

  const toPoint = (index, value) => {
    const x = padX + ((width - padX * 2) * index) / Math.max(1, series.length - 1);
    const y = height - padY - ((height - padY * 2) * value) / maxValue;
    return `${x},${y}`;
  };

  const dueLine = series.map((item, index) => toPoint(index, toNumber(item.due))).join(' ');
  const collectedLine = series.map((item, index) => toPoint(index, toNumber(item.collected))).join(' ');
  const dueArea = series.length
    ? `${padX},${height - padY} ${dueLine} ${width - padX},${height - padY}`
    : '';

  return (
    <div className="gov-chart-card gov-trend-chart">
      <div className="gov-chart-head">
        <div>
          <strong>روند مالی ماهانه</strong>
          <span>تعهدات ثبت‌شده در برابر وصول واقعی</span>
        </div>
        <div className="gov-chart-legend">
          <span><i className="swatch due" />تعهدات</span>
          <span><i className="swatch collected" />وصول</span>
        </div>
      </div>
      {!series.length ? (
        <div className="gov-empty-state compact">برای این فیلتر هنوز داده‌ی نموداری ثبت نشده است.</div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="gov-trend-svg" role="img" aria-label="روند مالی ماهانه">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = height - padY - (height - padY * 2) * ratio;
            return <line key={ratio} x1={padX} y1={y} x2={width - padX} y2={y} className="gov-grid-line" />;
          })}
          {dueArea ? <polygon points={dueArea} className="gov-area due" /> : null}
          <polyline points={dueLine} className="gov-line due" />
          <polyline points={collectedLine} className="gov-line collected" />
          {series.map((item, index) => {
            const x = padX + ((width - padX * 2) * index) / Math.max(1, series.length - 1);
            return (
              <g key={item.monthKey}>
                <circle cx={x} cy={height - padY - ((height - padY * 2) * toNumber(item.due)) / maxValue} r="4.6" className="gov-point due" />
                <circle cx={x} cy={height - padY - ((height - padY * 2) * toNumber(item.collected)) / maxValue} r="4.6" className="gov-point collected" />
                <text x={x} y={height - 8} textAnchor="middle" className="gov-axis-label">{item.label}</text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function HorizontalBars({ title, subtitle, items = [], valueKey = 'due', accent = 'teal' }) {
  const maxValue = Math.max(1, ...items.map((item) => toNumber(item[valueKey])));

  return (
    <div className="gov-chart-card">
      <div className="gov-chart-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
      </div>
      {!items.length ? (
        <div className="gov-empty-state compact">برای این بخش داده‌ای وجود ندارد.</div>
      ) : (
        <div className="gov-bars">
          {items.map((item) => {
            const ratio = (toNumber(item[valueKey]) / maxValue) * 100;
            return (
              <div key={`${title}-${item.label}`} className="gov-bar-row">
                <div className="gov-bar-copy">
                  <strong>{item.label}</strong>
                  <span>{formatMoney(item[valueKey])}</span>
                </div>
                <div className="gov-bar-track">
                  <span className={`gov-bar-fill ${accent}`} style={{ width: `${Math.max(8, ratio)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuarterCompare({ items = [], selectedQuarter = 1 }) {
  const maxValue = Math.max(
    1,
    ...items.flatMap((item) => [toNumber(item.due), toNumber(item.collected), toNumber(item.outstanding)])
  );

  return (
    <div className="gov-chart-card">
      <div className="gov-chart-head">
        <div>
          <strong>مقایسه چهار ربع</strong>
          <span>نمای فعلی از داده‌های موجود تا زمان فعال‌شدن FinancialYear</span>
        </div>
      </div>
      {!items.length ? (
        <div className="gov-empty-state compact">چهار ربع هنوز داده‌ای برای نمایش ندارند.</div>
      ) : (
        <div className="gov-quarter-compare">
          {items.map((item) => (
            <article key={item.key} className={`gov-quarter-card ${item.key === selectedQuarter ? 'selected' : ''}`}>
              <header>
                <strong>{item.label}</strong>
                <span>{formatNumber(item.orders)} ردیف</span>
              </header>
              <div className="gov-quarter-stacks">
                <div className="gov-stack-track">
                  <span className="gov-stack due" style={{ height: `${(toNumber(item.due) / maxValue) * 100}%` }} />
                  <span className="gov-stack collected" style={{ height: `${(toNumber(item.collected) / maxValue) * 100}%` }} />
                  <span className="gov-stack outstanding" style={{ height: `${(toNumber(item.outstanding) / maxValue) * 100}%` }} />
                </div>
              </div>
              <footer>
                <span>تعهدات: {formatMoney(item.due)}</span>
                <span>وصول: {formatMoney(item.collected)}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseMonthlyBars({ items = [] }) {
  const maxValue = Math.max(1, ...items.map((item) => toNumber(item.amount)));

  return (
    <div className="gov-chart-card">
      <div className="gov-chart-head">
        <div>
          <strong>روند ماهانه مصارف</strong>
          <span>حرکت ماهانه ردیف‌های ثبت‌شده مصرف</span>
        </div>
      </div>
      {!items.length ? (
        <div className="gov-empty-state compact">برای این محدوده هنوز داده ماهانه مصرف ثبت نشده است.</div>
      ) : (
        <div className="gov-month-bars">
          {items.slice(-6).map((item) => (
            <article key={item.monthKey} className="gov-month-bar-card">
              <div className="gov-month-bar-track">
                <span
                  className="gov-month-bar-fill"
                  style={{ height: `${Math.max(10, (toNumber(item.amount) / maxValue) * 100)}%` }}
                />
              </div>
              <strong>{item.label}</strong>
              <span>{formatMoney(item.amount)}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpenseStatusBadge({ status = '' }) {
  const normalized = String(status || '').trim() || 'draft';
  let tone = 'slate';
  if (normalized === 'approved') tone = 'mint';
  else if (normalized === 'pending_review') tone = 'teal';
  else if (normalized === 'rejected') tone = 'rose';
  else if (normalized === 'void') tone = 'sand';

  return (
    <span className="gov-status-badge" data-tone={tone}>
      {resolveExpenseStatusLabel(normalized)}
    </span>
  );
}

function ExpenseStageBadge({ stage = '' }) {
  const normalized = String(stage || '').trim() || 'draft';
  let tone = 'slate';
  if (normalized === 'finance_manager_review') tone = 'teal';
  else if (normalized === 'finance_lead_review') tone = 'copper';
  else if (normalized === 'general_president_review') tone = 'rose';
  else if (normalized === 'completed') tone = 'mint';
  else if (normalized === 'void') tone = 'sand';

  return (
    <span className="gov-status-badge subtle" data-tone={tone}>
      {resolveExpenseStageLabel(normalized)}
    </span>
  );
}

function BudgetApprovalStageBadge({ stage = '' }) {
  const normalized = String(stage || '').trim() || 'draft';
  let tone = 'slate';
  if (normalized === 'finance_manager_review') tone = 'teal';
  else if (normalized === 'finance_lead_review') tone = 'copper';
  else if (normalized === 'general_president_review') tone = 'rose';
  else if (normalized === 'approved') tone = 'mint';
  else if (normalized === 'rejected') tone = 'sand';

  return (
    <span className="gov-status-badge subtle" data-tone={tone}>
      {resolveBudgetApprovalStageLabel(normalized)}
    </span>
  );
}

function ProcurementStatusBadge({ status = '' }) {
  const normalized = String(status || '').trim() || 'draft';
  let tone = 'slate';
  if (normalized === 'approved') tone = 'mint';
  else if (normalized === 'pending_review') tone = 'teal';
  else if (normalized === 'rejected') tone = 'rose';
  else if (normalized === 'cancelled') tone = 'sand';

  return (
    <span className="gov-status-badge" data-tone={tone}>
      {resolveProcurementStatusLabel(normalized)}
    </span>
  );
}

function ProcurementStageBadge({ stage = '' }) {
  const normalized = String(stage || '').trim() || 'draft';
  let tone = 'slate';
  if (normalized === 'finance_manager_review') tone = 'teal';
  else if (normalized === 'finance_lead_review') tone = 'copper';
  else if (normalized === 'general_president_review') tone = 'rose';
  else if (normalized === 'approved') tone = 'mint';
  else if (normalized === 'rejected' || normalized === 'cancelled') tone = 'sand';

  return (
    <span className="gov-status-badge subtle" data-tone={tone}>
      {resolveProcurementStageLabel(normalized)}
    </span>
  );
}

function TreasuryAccountTypeBadge({ accountType = '' }) {
  const normalized = String(accountType || '').trim() || 'other';
  const tone = normalized === 'cashbox'
    ? 'teal'
    : normalized === 'bank'
      ? 'copper'
      : normalized === 'mobile_money'
        ? 'mint'
        : normalized === 'hawala'
          ? 'rose'
          : 'slate';

  return (
    <span className="gov-status-badge subtle" data-tone={tone}>
      {resolveTreasuryAccountTypeLabel(normalized)}
    </span>
  );
}

function TreasuryTransactionTypeBadge({ transactionType = '', direction = '' }) {
  const normalized = String(transactionType || '').trim() || 'deposit';
  const fallbackDirection = String(direction || '').trim().toLowerCase();
  const tone = normalized.includes('transfer')
    ? 'copper'
    : normalized === 'withdrawal' || normalized === 'adjustment_out'
      ? 'rose'
      : normalized === 'reconciliation_adjustment'
        ? (fallbackDirection === 'out' ? 'rose' : 'mint')
        : 'mint';

  return (
    <span className="gov-status-badge subtle" data-tone={tone}>
      {resolveTreasuryTransactionTypeLabel(normalized)}
    </span>
  );
}

function CategoryToneBadge({ tone = 'teal' }) {
  const option = CATEGORY_TONE_OPTIONS.find((item) => item.key === tone);
  return (
    <span className="gov-tone-badge" data-tone={tone}>
      {option?.label || tone}
    </span>
  );
}

function TimelineList({ items = [] }) {
  return (
    <div className="gov-chart-card">
      <div className="gov-chart-head">
        <div>
          <strong>تایم‌لاین بستن ماه‌ها</strong>
          <span>آرشیف ماه‌های بسته‌شده در سیستم فعلی مالی</span>
        </div>
      </div>
      {!items.length ? (
        <div className="gov-empty-state compact">هنوز ماه مالی بسته نشده است.</div>
      ) : (
        <div className="gov-timeline">
          {items.map((item) => (
            <article key={item._id || item.monthKey} className="gov-timeline-item">
              <span className="gov-timeline-dot" />
              <div>
                <strong>{monthLabel(item.monthKey)}</strong>
                <small>{item.closedBy?.name || 'ادمین'}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton({ className = '' }) {
  return <span className={`gov-skeleton ${className}`.trim()} aria-hidden="true" />;
}

function FinanceLoadingCard({ span = '4', lines = 3 }) {
  return (
    <article className="gov-card gov-card-loading" data-span={span} aria-hidden="true">
      <div className="gov-skeleton-stack">
        <LoadingSkeleton className="gov-skeleton-line gov-skeleton-title" />
        {Array.from({ length: lines }).map((_, index) => (
          <LoadingSkeleton
            key={`${span}-${lines}-${index}`}
            className={`gov-skeleton-line ${index === lines - 1 ? 'gov-skeleton-short' : ''}`}
          />
        ))}
      </div>
    </article>
  );
}

function GovernmentFinanceLoadingPanels({ activeTab }) {
  if (activeTab === 'quarterly' || activeTab === 'annual') {
    return (
      <section className="gov-content-grid gov-content-loading" aria-label="وضعیت بارگذاری مرکز مالی">
        <FinanceLoadingCard span="12" lines={2} />
        <FinanceLoadingCard span="4" lines={3} />
        <FinanceLoadingCard span="4" lines={3} />
        <FinanceLoadingCard span="4" lines={3} />
        <FinanceLoadingCard span="7" lines={5} />
        <FinanceLoadingCard span="5" lines={5} />
        <FinanceLoadingCard span="12" lines={8} />
      </section>
    );
  }

  if (activeTab === 'year' || activeTab === 'archive') {
    return (
      <section className="gov-content-grid gov-content-loading" aria-label="وضعیت بارگذاری مرکز مالی">
        <FinanceLoadingCard span="7" lines={5} />
        <FinanceLoadingCard span="5" lines={5} />
        <FinanceLoadingCard span="12" lines={6} />
        <FinanceLoadingCard span="12" lines={7} />
      </section>
    );
  }

  if (activeTab === 'operations') {
    return (
      <section className="gov-content-grid gov-content-loading" aria-label="وضعیت بارگذاری مرکز مالی">
        <FinanceLoadingCard span="4" lines={4} />
        <FinanceLoadingCard span="4" lines={4} />
        <FinanceLoadingCard span="4" lines={4} />
        <FinanceLoadingCard span="7" lines={7} />
        <FinanceLoadingCard span="5" lines={6} />
        <FinanceLoadingCard span="12" lines={8} />
      </section>
    );
  }

  return (
    <section className="gov-content-grid gov-content-loading" aria-label="وضعیت بارگذاری مرکز مالی">
      <FinanceLoadingCard span="8" lines={6} />
      <FinanceLoadingCard span="4" lines={5} />
      <FinanceLoadingCard span="5" lines={5} />
      <FinanceLoadingCard span="4" lines={5} />
      <FinanceLoadingCard span="3" lines={5} />
    </section>
  );
}

export default function AdminGovernmentFinance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefetchedTabsRef = useRef(new Map());
  const latestWorkspaceScopeRef = useRef('');
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [payload, setPayload] = useState(EMPTY_DATA);
  const [tabLoadMeta, setTabLoadMeta] = useState({});
  const [loadingTargetTab, setLoadingTargetTab] = useState('');
  const [activeTab, setActiveTab] = useState(() => sanitizeTab(readInitialSearchValue(searchParams, 'tab')));
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState(() => readInitialSearchValue(searchParams, 'academicYearId'));
  const [selectedFinancialYearId, setSelectedFinancialYearId] = useState(() => readInitialSearchValue(searchParams, 'financialYearId'));
  const [selectedClassId, setSelectedClassId] = useState(() => readInitialSearchValue(searchParams, 'classId'));
  const [selectedQuarter, setSelectedQuarter] = useState(() => sanitizeQuarter(readInitialSearchValue(searchParams, 'quarter')));
  const [selectedTreasuryReportAccountId, setSelectedTreasuryReportAccountId] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [financialYearDraft, setFinancialYearDraft] = useState({
    title: '',
    code: '',
    startDate: '',
    endDate: '',
    dailyFeePercent: '',
    yearlyFeePercent: '',
    note: '',
    isActive: true
  });
  const [selectedYearBudgetDraft, setSelectedYearBudgetDraft] = useState(() => buildBudgetDraft());
  const [expenseDraft, setExpenseDraft] = useState({
    category: 'admin',
    subCategory: '',
    amount: '',
    expenseDate: '',
    paymentMethod: 'manual',
    treasuryAccountId: '',
    procurementCommitmentId: '',
    vendorName: '',
    referenceNo: '',
    note: '',
    status: 'draft'
  });
  const [procurementDraft, setProcurementDraft] = useState({
    title: '',
    vendorName: '',
    category: 'admin',
    subCategory: '',
    procurementType: 'vendor_commitment',
    committedAmount: '',
    requestDate: toInputDate(new Date()),
    expectedDeliveryDate: '',
    treasuryAccountId: '',
    referenceNo: '',
    paymentTerms: '',
    description: '',
    note: '',
    status: 'draft'
  });
  const [procurementSettlementDraft, setProcurementSettlementDraft] = useState({
    commitmentId: '',
    amount: '',
    settlementDate: toInputDate(new Date()),
    treasuryAccountId: '',
    referenceNo: '',
    note: ''
  });
  const [archiveDeliveryDraft, setArchiveDeliveryDraft] = useState({
    archiveId: '',
    channel: 'email',
    recipientHandles: '',
    note: '',
    includeLinkedAudience: false
  });
  const [categoryDraft, setCategoryDraft] = useState({
    id: '',
    label: '',
    key: '',
    description: '',
    colorTone: 'teal',
    subCategoriesText: '',
    isActive: true
  });
  const [treasuryAccountDraft, setTreasuryAccountDraft] = useState({
    id: '',
    title: '',
    code: '',
    accountType: 'cashbox',
    openingBalance: '',
    currency: 'AFN',
    providerName: '',
    branchName: '',
    accountNo: '',
    note: '',
    isActive: true
  });
  const [treasuryTransactionDraft, setTreasuryTransactionDraft] = useState({
    accountId: '',
    transactionType: 'deposit',
    amount: '',
    transactionDate: '',
    referenceNo: '',
    note: ''
  });
  const [treasuryTransferDraft, setTreasuryTransferDraft] = useState({
    sourceAccountId: '',
    destinationAccountId: '',
    amount: '',
    transactionDate: '',
    referenceNo: '',
    note: ''
  });
  const [treasuryReconciliationDraft, setTreasuryReconciliationDraft] = useState({
    accountId: '',
    statementBalance: '',
    reconciliationDate: '',
    referenceNo: '',
    note: '',
    applyAdjustment: true
  });

  const activeAcademicYear = useMemo(() => (
    reference.academicYears.find((item) => item.isActive) || reference.academicYears[0] || null
  ), [reference.academicYears]);

  const activeFinancialYear = useMemo(() => (
    payload.financialYears.find((item) => item.isActive) || reference.financialYears.find((item) => item.isActive) || payload.financialYears[0] || reference.financialYears[0] || null
  ), [payload.financialYears, reference.financialYears]);

  const selectedFinancialYear = useMemo(() => (
    payload.financialYears.find((item) => item._id === selectedFinancialYearId || item.id === selectedFinancialYearId)
      || reference.financialYears.find((item) => item.id === selectedFinancialYearId)
      || activeFinancialYear
      || null
  ), [payload.financialYears, reference.financialYears, selectedFinancialYearId, activeFinancialYear]);

  const selectedAcademicYear = useMemo(() => (
    reference.academicYears.find((item) => item.id === selectedAcademicYearId)
      || reference.academicYears.find((item) => item.id === selectedFinancialYear?.academicYearId)
      || activeAcademicYear
  ), [reference.academicYears, selectedAcademicYearId, selectedFinancialYear, activeAcademicYear]);

  const selectedClass = useMemo(() => (
    reference.classes.find((item) => item.id === selectedClassId) || null
  ), [reference.classes, selectedClassId]);

  const expenseCategoryRegistry = useMemo(() => (
    (payload.expenseCategories || []).length
      ? payload.expenseCategories
      : (payload.expenseAnalytics?.registry || reference.expenseCategories || [])
  ), [payload.expenseAnalytics, payload.expenseCategories, reference.expenseCategories]);

  const selectedExpenseCategory = useMemo(() => (
    expenseCategoryRegistry.find((item) => item.key === expenseDraft.category) || expenseCategoryRegistry[0] || null
  ), [expenseCategoryRegistry, expenseDraft.category]);

  const expenseSubCategoryOptions = useMemo(() => (
    (selectedExpenseCategory?.subCategories || []).filter((item) => item.isActive !== false)
  ), [selectedExpenseCategory]);

  const monthlySeries = useMemo(() => buildMonthlySeries(
    payload.financeOverview?.rows || [],
    payload.cashflow || []
  ), [payload.financeOverview, payload.cashflow]);

  const quarterSummaries = useMemo(() => buildQuarterSummaries(monthlySeries), [monthlySeries]);

  const currentQuarterSummary = useMemo(() => (
    quarterSummaries.find((item) => item.key === selectedQuarter) || quarterSummaries[0] || null
  ), [quarterSummaries, selectedQuarter]);

  const classRanking = useMemo(() => buildQuarterClassRanking(
    payload.financeOverview?.rows || [],
    selectedQuarter,
    payload.byClass || []
  ), [payload.financeOverview, payload.byClass, selectedQuarter]);

  const previewRows = useMemo(() => buildTablePreview(payload.financeOverview?.rows || []), [payload.financeOverview]);

  const collectionRate = useMemo(() => {
    const rate = toNumber(payload.summary?.collectionRate);
    return Math.max(0, Math.min(100, rate));
  }, [payload.summary]);

  const closedMonthRatio = useMemo(() => {
    const count = (payload.closedMonths || []).length;
    return Math.max(0, Math.min(100, (count / 12) * 100));
  }, [payload.closedMonths]);

  const quarterArrears = useMemo(() => {
    const aging = payload.aging?.buckets || {};
    return [
      { label: 'جاری', value: toNumber(aging.current), tone: 'teal' },
      { label: '1 تا 30 روز', value: toNumber(aging.d1_30), tone: 'amber' },
      { label: '31 تا 60 روز', value: toNumber(aging.d31_60), tone: 'copper' },
      { label: 'بیش از 60 روز', value: toNumber(aging.d61_plus), tone: 'rose' }
    ];
  }, [payload.aging]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const expenseGovernanceSummary = useMemo(() => payload.expenseAnalytics?.summary || {}, [payload.expenseAnalytics]);

  const expenseBreakdown = useMemo(() => (
    (payload.expenseAnalytics?.categories || []).length
      ? (payload.expenseAnalytics?.categories || []).slice(0, 6).map((item) => ({
          label: item.label,
          due: item.amount
        }))
      : expenseCategorySummary(payload.expenses || []).slice(0, 6)
  ), [payload.expenseAnalytics, payload.expenses]);

  const expenseVendorBreakdown = useMemo(() => (
    (payload.expenseAnalytics?.vendors || []).map((item) => ({
      label: item.label,
      due: item.amount
    }))
  ), [payload.expenseAnalytics]);

  const expenseMonthlyBreakdown = useMemo(() => payload.expenseAnalytics?.monthly || [], [payload.expenseAnalytics]);

  const expenseCloseReadiness = useMemo(() => payload.expenseAnalytics?.closeReadiness || null, [payload.expenseAnalytics]);
  const expenseCloseReadinessBlockers = useMemo(() => expenseCloseReadiness?.blockers || [], [expenseCloseReadiness]);

  const expenseQueueRows = useMemo(() => (
    (payload.expenseAnalytics?.queue || []).length
      ? buildTablePreview(payload.expenseAnalytics.queue, 10)
      : buildTablePreview((payload.expenses || []).filter((item) => !['approved', 'void'].includes(String(item.status || '').trim())), 10)
  ), [payload.expenseAnalytics, payload.expenses]);
  const editingExpenseCategory = useMemo(() => (
    expenseCategoryRegistry.find((item) => String(item._id || item.id) === String(categoryDraft.id || '')) || null
  ), [categoryDraft.id, expenseCategoryRegistry]);

  const archivePreview = useMemo(() => buildTablePreview(payload.expenses || [], 8), [payload.expenses]);
  const treasurySummary = useMemo(() => payload.treasuryAnalytics?.summary || {}, [payload.treasuryAnalytics]);
  const treasuryAccounts = useMemo(() => payload.treasuryAnalytics?.accounts || [], [payload.treasuryAnalytics]);
  const treasuryRecentTransactions = useMemo(() => payload.treasuryAnalytics?.recentTransactions || [], [payload.treasuryAnalytics]);
  const treasuryAlerts = useMemo(() => payload.treasuryAnalytics?.alerts || [], [payload.treasuryAnalytics]);
  const treasuryReports = useMemo(() => payload.treasuryReports || null, [payload.treasuryReports]);
  const treasuryCashbook = useMemo(() => treasuryReports?.cashbook || { account: null, rows: [], summary: {} }, [treasuryReports]);
  const treasuryMovementSummary = useMemo(() => treasuryReports?.movementSummary || { rows: [], summary: {} }, [treasuryReports]);
  const treasuryReconciliationReport = useMemo(() => treasuryReports?.reconciliation || { rows: [], summary: {} }, [treasuryReports]);
  const treasuryVarianceReport = useMemo(() => treasuryReports?.variance || { rows: [], summary: {} }, [treasuryReports]);
  const budgetVsActual = useMemo(() => payload.budgetVsActual || { summary: {}, categories: [], alerts: [], meta: {}, treasury: { summary: {}, alerts: [] } }, [payload.budgetVsActual]);
  const procurementAnalytics = useMemo(() => payload.procurementAnalytics || { summary: {}, items: [], vendors: [] }, [payload.procurementAnalytics]);
  const procurementSummary = useMemo(() => procurementAnalytics.summary || {}, [procurementAnalytics]);
  const procurementItems = useMemo(() => procurementAnalytics.items || [], [procurementAnalytics]);
  const procurementVendors = useMemo(() => procurementAnalytics.vendors || [], [procurementAnalytics]);
  const approvedProcurementOptions = useMemo(() => (
    procurementItems.filter((item) => item.status === 'approved' && Number(item.outstandingAmount || 0) > 0)
  ), [procurementItems]);
  const settlementReadyProcurementOptions = useMemo(() => (
    procurementItems.filter((item) => item.status === 'approved' && Number(item.payableReadyAmount || 0) > 0)
  ), [procurementItems]);
  const selectedBudgetApproval = useMemo(() => (
    selectedFinancialYear?.budgetApproval || { stage: 'draft', trail: [], configured: false }
  ), [selectedFinancialYear]);
  const selectedProcurementSettlement = useMemo(() => (
    procurementItems.find((item) => String(item._id || item.id || '') === String(procurementSettlementDraft.commitmentId || ''))
      || settlementReadyProcurementOptions[0]
      || null
  ), [procurementItems, procurementSettlementDraft.commitmentId, settlementReadyProcurementOptions]);
  const governmentDocumentArchive = useMemo(() => payload.governmentDocumentArchive || [], [payload.governmentDocumentArchive]);
  const selectedGovernmentArchive = useMemo(() => (
    governmentDocumentArchive.find((item) => String(item._id || item.id || '') === String(archiveDeliveryDraft.archiveId || ''))
      || governmentDocumentArchive[0]
      || null
  ), [governmentDocumentArchive, archiveDeliveryDraft.archiveId]);
  const budgetRevisionHistory = useMemo(() => (
    Array.isArray(selectedBudgetApproval.revisionHistory) ? selectedBudgetApproval.revisionHistory : []
  ), [selectedBudgetApproval]);
  const selectedBudgetVersion = useMemo(() => (
    Math.max(1, Number(selectedBudgetApproval.version || selectedFinancialYear?.budgetVersion || 1))
  ), [selectedBudgetApproval, selectedFinancialYear]);
  const selectedBudgetLastApprovedVersion = useMemo(() => (
    Math.max(0, Number(selectedBudgetApproval.lastApprovedVersion || selectedFinancialYear?.budgetLastApprovedVersion || 0))
  ), [selectedBudgetApproval, selectedFinancialYear]);
  const canStartBudgetRevision = useMemo(() => (
    selectedBudgetApproval.canStartRevision === true
      || (!selectedFinancialYear?.isClosed && String(selectedBudgetApproval.stage || '').trim() === 'approved')
  ), [selectedBudgetApproval, selectedFinancialYear]);
  const selectedTreasuryReportAccount = useMemo(() => (
    treasuryAccounts.find((item) => String(item._id || item.id || '') === String(selectedTreasuryReportAccountId || ''))
      || treasuryCashbook.account
      || treasuryAccounts[0]
      || null
  ), [treasuryAccounts, treasuryCashbook.account, selectedTreasuryReportAccountId]);

  const latestSnapshot = useMemo(() => (payload.snapshots || [])[0] || null, [payload.snapshots]);
  const latestSnapshotPack = useMemo(() => latestSnapshot?.pack || null, [latestSnapshot]);
  const isWorkspaceLoading = busyAction === 'load';
  const showInitialLoadingSkeleton = isWorkspaceLoading
    && !payload.summary
    && !payload.financeOverview
    && !payload.governmentQuarterly
    && !payload.governmentAnnual
    && !payload.financialYears.length
    && !payload.expenses.length
    && !payload.snapshots.length;
  const activeTabLabel = useMemo(() => (
    TABS.find((item) => item.key === activeTab)?.label || DEFAULT_TAB
  ), [activeTab]);
  const activeQuarterLabel = useMemo(() => (
    QUARTER_OPTIONS.find((item) => item.key === selectedQuarter)?.label || `Q${selectedQuarter}`
  ), [selectedQuarter]);
  const exportContextChips = useMemo(() => {
    const chips = [
      { key: 'tab', label: 'نما', value: activeTabLabel },
      {
        key: 'report',
        label: 'نوع گزارش',
        value: activeTab === 'quarterly'
          ? 'گزارش ربعوار'
          : activeTab === 'annual'
            ? 'گزارش سالانه'
            : activeTab === 'archive'
              ? 'آرشیف رسمی'
              : activeTab === 'operations'
                ? 'عملیات مصارف'
                : 'نمای کلی'
      },
      { key: 'fy', label: 'سال مالی', value: selectedFinancialYear?.title || 'همه / بدون محدودیت' },
      { key: 'ay', label: 'سال تعلیمی', value: selectedAcademicYear?.title || '---' },
      { key: 'class', label: 'صنف', value: selectedClass?.title || 'همه صنف‌ها' }
    ];

    if (activeTab === 'quarterly' || activeTab === 'archive') {
      chips.push({ key: 'quarter', label: 'ربع', value: activeQuarterLabel });
    }
    if (activeTab === 'archive') {
      chips.push({ key: 'snapshots', label: 'اسنپ‌شات‌ها', value: formatNumber((payload.snapshots || []).length) });
    }

    if (activeTab === 'treasury') {
      chips.push({
        key: 'treasury-account',
        label: 'Treasury account',
        value: selectedTreasuryReportAccount?.title || selectedTreasuryReportAccount?.code || 'All accounts'
      });
    }

    return chips;
  }, [activeQuarterLabel, activeTab, activeTabLabel, payload.snapshots, selectedAcademicYear, selectedClass, selectedFinancialYear, selectedTreasuryReportAccount]);
  const currentSearchText = useMemo(() => readInitialSearchText(searchParams), [searchParams]);
  const workspaceScopeKey = useMemo(() => buildWorkspaceScopeKey({
    financialYearId: selectedFinancialYearId,
    academicYearId: selectedAcademicYearId,
    classId: selectedClassId,
    quarter: selectedQuarter,
    treasuryAccountId: selectedTreasuryReportAccountId
  }), [selectedAcademicYearId, selectedClassId, selectedFinancialYearId, selectedQuarter, selectedTreasuryReportAccountId]);
  const tabStatusItems = useMemo(() => TABS.map((tab) => {
    const meta = tabLoadMeta[tab.key] || {};
    const matchesScope = meta.scopeKey === workspaceScopeKey;
    const isRefreshing = isWorkspaceLoading && loadingTargetTab === tab.key;
    const isCurrent = activeTab === tab.key;
    let tone = 'idle';
    let status = 'هنوز بارگذاری نشده';
    let actionLabel = 'بارگذاری تب';

    if (isRefreshing) {
      tone = 'loading';
      status = 'در حال تازه‌سازی';
      actionLabel = 'در حال بازخوانی...';
    } else if (meta.loadedAt && !matchesScope) {
      tone = 'stale';
      status = 'نیازمند بازخوانی';
      actionLabel = 'تازه‌سازی تب';
    } else if (meta.loadedAt && meta.source === 'prefetch') {
      tone = 'prefetched';
      status = 'از پیش گرم شده';
      actionLabel = 'بارگذاری نهایی';
    } else if (meta.loadedAt) {
      tone = 'fresh';
      status = 'به‌روز';
      actionLabel = 'بازخوانی تب';
    }

    return {
      key: tab.key,
      label: tab.label,
      tone,
      status,
      actionLabel,
      isCurrent,
      timestamp: meta.loadedAt ? toLocaleDateTime(meta.loadedAt) : '---'
    };
  }), [activeTab, isWorkspaceLoading, loadingTargetTab, tabLoadMeta, workspaceScopeKey]);
  const refreshButtonLabel = useMemo(() => {
    if (activeTab === 'dashboard') return 'بازخوانی نمای کلی';
    if (activeTab === 'operations') return 'بازخوانی عملیات مصارف';
    if (activeTab === 'quarterly') return 'بازخوانی گزارش ربعوار';
    if (activeTab === 'annual') return 'بازخوانی گزارش سالانه';
    if (activeTab === 'year') return 'بازخوانی مدیریت سال مالی';
    if (activeTab === 'archive') return 'بازخوانی آرشیف رسمی';
    return 'بازخوانی داده';
  }, [activeTab]);
  const effectiveRefreshButtonLabel = activeTab === 'treasury'
    ? 'بازخوانی خزانه و صندوق'
    : refreshButtonLabel;

  const loadReference = async () => {
    try {
      const data = await fetchJson('/api/reports/reference-data');
      const nextReference = {
        academicYears: data.academicYears || [],
        financialYears: data.financialYears || [],
        classes: data.classes || []
      };
      setReference(normalizeDisplayPayload(nextReference));
      setSelectedAcademicYearId((current) => current || nextReference.academicYears.find((item) => item.isActive)?.id || nextReference.academicYears[0]?.id || '');
      setSelectedFinancialYearId((current) => current || nextReference.financialYears.find((item) => item.isActive)?.id || nextReference.financialYears[0]?.id || '');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت داده‌های مرجع مالی ناموفق بود.'), 'error');
    }
  };

  const loadWorkspace = async (targetTab = activeTab, options = {}) => {
    const { prefetch = false } = options;
    const resolvedTargetTab = sanitizeTab(typeof targetTab === 'string' ? targetTab : activeTab);
    try {
      if (!prefetch) {
        setBusyAction('load');
        setLoadingTargetTab(resolvedTargetTab);
      }
      const reportFilters = {};
      if (selectedFinancialYearId) reportFilters.financialYearId = selectedFinancialYearId;
      if (selectedAcademicYearId) reportFilters.academicYearId = selectedAcademicYearId;
      if (selectedClassId) reportFilters.classId = selectedClassId;
      if (selectedQuarter) reportFilters.quarter = selectedQuarter;
      const requestScopeKey = buildWorkspaceScopeKey({
        financialYearId: selectedFinancialYearId,
        academicYearId: selectedAcademicYearId,
        classId: selectedClassId,
        quarter: selectedQuarter,
        treasuryAccountId: selectedTreasuryReportAccountId
      });

      const expenseParams = new URLSearchParams();
      if (selectedFinancialYearId) expenseParams.set('financialYearId', selectedFinancialYearId);
      if (selectedAcademicYearId) expenseParams.set('academicYearId', selectedAcademicYearId);
      if (selectedClassId) expenseParams.set('classId', selectedClassId);
      const scopedExpenseUrl = `/api/finance/admin/expenses${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`;
      const scopedProcurementUrl = `/api/finance/admin/procurements${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`;
      const scopedExpenseCategoryUrl = '/api/finance/admin/expense-categories';
      const scopedExpenseAnalyticsUrl = `/api/finance/admin/expenses/analytics${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`;
      const scopedTreasuryAnalyticsUrl = `/api/finance/admin/treasury/analytics${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`;
      const treasuryReportParams = new URLSearchParams(expenseParams);
      if (selectedTreasuryReportAccountId) treasuryReportParams.set('accountId', selectedTreasuryReportAccountId);
      const scopedTreasuryReportsUrl = `/api/finance/admin/treasury/reports${treasuryReportParams.toString() ? `?${treasuryReportParams.toString()}` : ''}`;
      const scopedBudgetVsActualUrl = selectedFinancialYearId
        ? `/api/finance/admin/financial-years/${selectedFinancialYearId}/budget-vs-actual${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`
        : '';
      const scopedSnapshotUrl = `/api/finance/admin/government-snapshots${expenseParams.toString() ? `?${expenseParams.toString()}` : ''}`;
      const archiveParams = new URLSearchParams();
      archiveParams.set('documentType', 'government_snapshot_pack');
      archiveParams.set('limit', '12');
      if (selectedAcademicYearId) archiveParams.set('academicYearId', selectedAcademicYearId);
      if (selectedClassId) archiveParams.set('classId', selectedClassId);
      const scopedGovernmentArchiveUrl = `/api/finance/admin/document-archive?${archiveParams.toString()}`;

      const loaders = [
        {
          key: 'summary',
          run: () => fetchJson('/api/finance/admin/summary'),
          assign: (data, nextPayload) => { nextPayload.summary = data.summary || null; }
        },
        {
          key: 'aging',
          run: () => fetchJson(buildScopedUrl('/api/finance/admin/reports/aging', selectedClassId)),
          assign: (data, nextPayload) => { nextPayload.aging = data; }
        },
        {
          key: 'cashflow',
          run: () => fetchJson(buildScopedUrl('/api/finance/admin/reports/cashflow', selectedClassId)),
          assign: (data, nextPayload) => { nextPayload.cashflow = data.items || []; }
        },
        {
          key: 'byClass',
          run: () => fetchJson(buildScopedUrl('/api/finance/admin/reports/by-class', selectedClassId)),
          assign: (data, nextPayload) => { nextPayload.byClass = data.items || []; }
        },
        {
          key: 'closedMonths',
          run: () => fetchJson('/api/finance/admin/month-close'),
          assign: (data, nextPayload) => { nextPayload.closedMonths = data.items || []; }
        },
        {
          key: 'financeOverview',
          run: () => postJson('/api/reports/run', { reportKey: 'finance_overview', filters: reportFilters }),
          assign: (data, nextPayload) => { nextPayload.financeOverview = data.report || null; }
        },
        {
          key: 'financialYears',
          run: () => fetchJson('/api/finance/admin/financial-years'),
          assign: (data, nextPayload) => { nextPayload.financialYears = data.items || []; }
        },
        {
          key: 'expenseCategories',
          run: () => fetchJson(scopedExpenseCategoryUrl),
          assign: (data, nextPayload) => { nextPayload.expenseCategories = data.items || []; }
        },
        {
          key: 'expenses',
          run: () => fetchJson(scopedExpenseUrl),
          assign: (data, nextPayload) => { nextPayload.expenses = data.items || []; }
        },
        {
          key: 'expenseAnalytics',
          run: () => fetchJson(scopedExpenseAnalyticsUrl),
          assign: (data, nextPayload) => { nextPayload.expenseAnalytics = data.analytics || null; }
        },
        {
          key: 'treasuryAnalytics',
          run: () => fetchJson(scopedTreasuryAnalyticsUrl),
          assign: (data, nextPayload) => { nextPayload.treasuryAnalytics = data.analytics || null; }
        }
      ];

      if (resolvedTargetTab === 'quarterly') {
        loaders.push({
          key: 'governmentQuarterly',
          run: () => postJson('/api/reports/run', { reportKey: 'government_finance_quarterly', filters: reportFilters }),
          assign: (data, nextPayload) => { nextPayload.governmentQuarterly = data.report || null; }
        });
      }

      if (resolvedTargetTab === 'annual') {
        loaders.push({
          key: 'governmentAnnual',
          run: () => postJson('/api/reports/run', { reportKey: 'government_finance_annual', filters: reportFilters }),
          assign: (data, nextPayload) => { nextPayload.governmentAnnual = data.report || null; }
        });
      }

      if (resolvedTargetTab === 'year' && scopedBudgetVsActualUrl) {
        loaders.push({
          key: 'budgetVsActual',
          run: () => fetchJson(scopedBudgetVsActualUrl),
          assign: (data, nextPayload) => { nextPayload.budgetVsActual = data.report || null; }
        });
      }

      if (resolvedTargetTab === 'operations' || resolvedTargetTab === 'archive') {
        loaders.push({
          key: 'procurementAnalytics',
          run: () => fetchJson(scopedProcurementUrl),
          assign: (data, nextPayload) => {
            nextPayload.procurementAnalytics = {
              summary: data.summary || {},
              vendors: data.vendors || [],
              items: data.items || []
            };
          }
        });
      }

      if (resolvedTargetTab === 'archive') {
        loaders.push({
          key: 'snapshots',
          run: () => fetchJson(scopedSnapshotUrl),
          assign: (data, nextPayload) => { nextPayload.snapshots = data.items || []; }
        });
        loaders.push({
          key: 'governmentDocumentArchive',
          run: () => fetchJson(scopedGovernmentArchiveUrl),
          assign: (data, nextPayload) => { nextPayload.governmentDocumentArchive = data.items || []; }
        });
      }

      if (resolvedTargetTab === 'treasury') {
        loaders.push({
          key: 'treasuryReports',
          run: () => fetchJson(scopedTreasuryReportsUrl),
          assign: (data, nextPayload) => { nextPayload.treasuryReports = data.reports || null; }
        });
      }

      const tasks = await Promise.allSettled(loaders.map((loader) => loader.run()));
      const nextPayload = {};
      const errors = [];

      tasks.forEach((task, index) => {
        if (task.status !== 'fulfilled') {
          errors.push(task.reason);
          return;
        }
        loaders[index].assign(task.value || {}, nextPayload);
      });

      const hadSuccess = tasks.some((task) => task.status === 'fulfilled');
      if (!hadSuccess && errors.length) {
        throw errors[0];
      }

      if (requestScopeKey !== latestWorkspaceScopeRef.current) {
        return;
      }

      setPayload((current) => ({
        ...current,
        ...normalizeDisplayPayload(nextPayload)
      }));
      const refreshedAt = new Date().toISOString();
      const commonTabKeys = ['dashboard', 'year', 'operations', 'treasury'];
      setTabLoadMeta((current) => {
        const nextMeta = { ...current };
        commonTabKeys.forEach((tabKey) => {
          nextMeta[tabKey] = {
            loadedAt: refreshedAt,
            scopeKey: requestScopeKey,
            source: prefetch ? 'prefetch' : 'live'
          };
        });
        nextMeta[resolvedTargetTab] = {
          loadedAt: refreshedAt,
          scopeKey: requestScopeKey,
          source: prefetch ? 'prefetch' : 'live'
        };
        return nextMeta;
      });
      setSelectedFinancialYearId((current) => (
        current
        || nextPayload.financialYears?.find((item) => item.isActive)?._id
        || nextPayload.financialYears?.[0]?._id
        || ''
      ));
      prefetchedTabsRef.current.set(`${resolvedTargetTab}|${requestScopeKey}`, true);
      if (!prefetch && errors.length) {
        showMessage('بخشی از داده‌ها بارگذاری شد، اما بعضی endpointها هنوز برای فاز بعدی آماده نشده‌اند.', 'info');
      } else if (!prefetch) {
        setMessage('');
      }
    } catch (error) {
      if (!prefetch) {
        showMessage(errorMessage(error, 'بارگذاری مرکز گزارش مالی دولت ناموفق بود.'), 'error');
      }
    } finally {
      if (!prefetch) {
        setBusyAction('');
        setLoadingTargetTab('');
      }
    }
  };

  const openFinanceTab = (tabKey) => {
    const nextTab = sanitizeTab(tabKey);
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  };

  const refreshFinanceTab = async (tabKey) => {
    await loadWorkspace(tabKey);
  };

  const warmGovernmentFinanceTab = (tabKey) => {
    if (!['quarterly', 'annual', 'archive'].includes(tabKey)) return;
    if (tabKey === activeTab) return;
    if (busyAction === 'load') return;

    const cacheKey = `${tabKey}|${workspaceScopeKey}`;
    const cachedEntry = prefetchedTabsRef.current.get(cacheKey);
    if (cachedEntry) return;

    const pendingPromise = loadWorkspace(tabKey, { prefetch: true }).finally(() => {
      if (prefetchedTabsRef.current.get(cacheKey) !== true) {
        prefetchedTabsRef.current.delete(cacheKey);
      }
    });

    prefetchedTabsRef.current.set(cacheKey, pendingPromise);
  };

  useEffect(() => {
    loadReference();
  }, []);

  useEffect(() => {
    latestWorkspaceScopeRef.current = workspaceScopeKey;
    prefetchedTabsRef.current.clear();
  }, [workspaceScopeKey]);

  useEffect(() => {
    loadWorkspace();
  }, [activeTab, selectedAcademicYearId, selectedFinancialYearId, selectedClassId, selectedQuarter, selectedTreasuryReportAccountId]);

  useEffect(() => {
    if (!selectedFinancialYear?.academicYearId) return;
    setSelectedAcademicYearId((current) => (
      current === selectedFinancialYear.academicYearId
        ? current
        : selectedFinancialYear.academicYearId
    ));
    setExpenseDraft((current) => ({
      ...current,
      expenseDate: current.expenseDate || toInputDate(new Date())
    }));
  }, [selectedFinancialYear]);

  useEffect(() => {
    if (!selectedAcademicYear) return;
    setFinancialYearDraft((current) => ({
      ...current,
      title: current.title || selectedAcademicYear.title || '',
      code: current.code || selectedAcademicYear.code || ''
    }));
  }, [selectedAcademicYear]);

  useEffect(() => {
    setSelectedYearBudgetDraft(buildBudgetDraft(selectedFinancialYear?.budgetTargets || {}, expenseCategoryRegistry));
  }, [selectedFinancialYear, expenseCategoryRegistry]);

  useEffect(() => {
    const fallbackCommitmentId = String(settlementReadyProcurementOptions[0]?._id || settlementReadyProcurementOptions[0]?.id || '');
    setProcurementSettlementDraft((current) => ({
      ...current,
      commitmentId: settlementReadyProcurementOptions.some((item) => String(item._id || item.id || '') === String(current.commitmentId || ''))
        ? current.commitmentId
        : fallbackCommitmentId
    }));
  }, [settlementReadyProcurementOptions]);

  useEffect(() => {
    if (!expenseCategoryRegistry.length) return;
    const fallbackCategory = expenseCategoryRegistry[0]?.key || 'other';
    setExpenseDraft((current) => {
      const nextCategory = expenseCategoryRegistry.some((item) => item.key === current.category)
        ? current.category
        : fallbackCategory;
      const nextSubCategories = (expenseCategoryRegistry.find((item) => item.key === nextCategory)?.subCategories || [])
        .filter((item) => item.isActive !== false);
      const nextSubCategory = nextSubCategories.some((item) => item.key === current.subCategory)
        ? current.subCategory
        : (nextSubCategories[0]?.key || '');
      return {
        ...current,
        category: nextCategory,
        subCategory: nextSubCategory
      };
    });
  }, [expenseCategoryRegistry]);

  useEffect(() => {
    if (!treasuryAccounts.length) {
      setSelectedTreasuryReportAccountId('');
      return;
    }
    const firstAccountId = String(treasuryAccounts[0]?._id || treasuryAccounts[0]?.id || '');
    setSelectedTreasuryReportAccountId((current) => (
      treasuryAccounts.some((item) => String(item._id || item.id || '') === String(current || ''))
        ? current
        : firstAccountId
    ));
    setExpenseDraft((current) => ({
      ...current,
      treasuryAccountId: current.treasuryAccountId || firstAccountId
    }));
    setTreasuryTransactionDraft((current) => ({
      ...current,
      accountId: current.accountId || firstAccountId,
      transactionDate: current.transactionDate || toInputDate(new Date())
    }));
    setTreasuryTransferDraft((current) => ({
      ...current,
      sourceAccountId: current.sourceAccountId || firstAccountId,
      destinationAccountId: current.destinationAccountId || String(treasuryAccounts[1]?._id || treasuryAccounts[1]?.id || current.destinationAccountId || ''),
      transactionDate: current.transactionDate || toInputDate(new Date())
    }));
    setTreasuryReconciliationDraft((current) => ({
      ...current,
      accountId: current.accountId || firstAccountId,
      reconciliationDate: current.reconciliationDate || toInputDate(new Date())
    }));
    setProcurementSettlementDraft((current) => ({
      ...current,
      treasuryAccountId: current.treasuryAccountId || String(selectedProcurementSettlement?.treasuryAccountId || firstAccountId || ''),
      settlementDate: current.settlementDate || toInputDate(new Date())
    }));
  }, [selectedProcurementSettlement, treasuryAccounts]);

  useEffect(() => {
    setProcurementSettlementDraft((current) => ({
      ...current,
      treasuryAccountId: current.treasuryAccountId || String(selectedProcurementSettlement?.treasuryAccountId || ''),
      referenceNo: current.referenceNo || String(selectedProcurementSettlement?.referenceNo || '')
    }));
  }, [selectedProcurementSettlement]);

  useEffect(() => {
    setArchiveDeliveryDraft((current) => ({
      ...current,
      archiveId: governmentDocumentArchive.some((item) => String(item._id || item.id || '') === String(current.archiveId || ''))
        ? current.archiveId
        : String(governmentDocumentArchive[0]?._id || governmentDocumentArchive[0]?.id || '')
    }));
  }, [governmentDocumentArchive]);

  useEffect(() => {
    const nextTab = sanitizeTab(readInitialSearchValue(searchParams, 'tab'));
    const nextFinancialYearId = readInitialSearchValue(searchParams, 'financialYearId');
    const nextAcademicYearId = readInitialSearchValue(searchParams, 'academicYearId');
    const nextClassId = readInitialSearchValue(searchParams, 'classId');
    const nextQuarter = sanitizeQuarter(readInitialSearchValue(searchParams, 'quarter'));

    if (nextTab !== activeTab) setActiveTab(nextTab);
    if (nextFinancialYearId !== selectedFinancialYearId) setSelectedFinancialYearId(nextFinancialYearId);
    if (nextAcademicYearId !== selectedAcademicYearId) setSelectedAcademicYearId(nextAcademicYearId);
    if (nextClassId !== selectedClassId) setSelectedClassId(nextClassId);
    if (nextQuarter !== selectedQuarter) setSelectedQuarter(nextQuarter);
  }, [
    activeTab,
    searchParams,
    selectedAcademicYearId,
    selectedClassId,
    selectedFinancialYearId,
    selectedQuarter
  ]);

  useEffect(() => {
    const nextParams = buildGovernmentFinanceSearchParams({
      tab: activeTab,
      financialYearId: selectedFinancialYearId,
      academicYearId: selectedAcademicYearId,
      classId: selectedClassId,
      quarter: selectedQuarter
    });
    const nextText = nextParams.toString();
    if (nextText !== currentSearchText) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [
    activeTab,
    currentSearchText,
    selectedAcademicYearId,
    selectedClassId,
    selectedFinancialYearId,
    selectedQuarter,
    setSearchParams
  ]);

  const handleFinancialYearDraftChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFinancialYearDraft((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSelectedYearBudgetDraftChange = (event) => {
    const { name, value } = event.target;
    setSelectedYearBudgetDraft((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleSelectedYearCategoryBudgetChange = (categoryKey, field, value) => {
    const normalizedKey = String(categoryKey || '').trim().toLowerCase();
    if (!normalizedKey) return;
    setSelectedYearBudgetDraft((current) => ({
      ...current,
      categoryBudgets: {
        ...(current.categoryBudgets || {}),
        [normalizedKey]: {
          ...((current.categoryBudgets || {})[normalizedKey] || { annualBudget: '', monthlyBudget: '', alertThresholdPercent: '85' }),
          [field]: value
        }
      }
    }));
  };

  const handleExpenseDraftChange = (event) => {
    const { name, value } = event.target;
    if (name === 'procurementCommitmentId') {
      const selectedCommitment = approvedProcurementOptions.find((item) => String(item._id || item.id || '') === String(value || '')) || null;
      setExpenseDraft((current) => ({
        ...current,
        procurementCommitmentId: value,
        ...(selectedCommitment
          ? {
              category: selectedCommitment.category || current.category,
              subCategory: selectedCommitment.subCategory || current.subCategory,
              treasuryAccountId: current.treasuryAccountId || selectedCommitment.treasuryAccountId || '',
              vendorName: current.vendorName || selectedCommitment.vendorName || ''
            }
          : {})
      }));
      return;
    }
    setExpenseDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === 'category'
        ? {
            subCategory: ((expenseCategoryRegistry.find((item) => item.key === value)?.subCategories || [])
              .filter((item) => item.isActive !== false)[0]?.key || '')
          }
        : {})
    }));
  };

  const handleProcurementDraftChange = (event) => {
    const { name, value } = event.target;
    setProcurementDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === 'category'
        ? {
            subCategory: ((expenseCategoryRegistry.find((item) => item.key === value)?.subCategories || [])
              .filter((item) => item.isActive !== false)[0]?.key || '')
          }
        : {})
    }));
  };

  const handleProcurementSettlementDraftChange = (event) => {
    const { name, value } = event.target;
    setProcurementSettlementDraft((current) => ({
      ...current,
      [name]: value,
      ...(name === 'commitmentId'
        ? {
            treasuryAccountId: current.treasuryAccountId || String(procurementItems.find((item) => String(item._id || item.id || '') === String(value || ''))?.treasuryAccountId || '')
          }
        : {})
    }));
  };

  const handleArchiveDeliveryDraftChange = (event) => {
    const { name, value, type, checked } = event.target;
    setArchiveDeliveryDraft((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleCategoryDraftChange = (event) => {
    const { name, value, type, checked } = event.target;
    setCategoryDraft((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleTreasuryAccountDraftChange = (event) => {
    const { name, value, type, checked } = event.target;
    setTreasuryAccountDraft((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleTreasuryTransactionDraftChange = (event) => {
    const { name, value } = event.target;
    setTreasuryTransactionDraft((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleTreasuryTransferDraftChange = (event) => {
    const { name, value } = event.target;
    setTreasuryTransferDraft((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleTreasuryReconciliationDraftChange = (event) => {
    const { name, value, type, checked } = event.target;
    setTreasuryReconciliationDraft((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetExpenseCategoryDraft = () => {
    setCategoryDraft({
      id: '',
      label: '',
      key: '',
      description: '',
      colorTone: 'teal',
      subCategoriesText: '',
      isActive: true
    });
  };

  const resetTreasuryAccountDraft = () => {
    setTreasuryAccountDraft({
      id: '',
      title: '',
      code: '',
      accountType: 'cashbox',
      openingBalance: '',
      currency: 'AFN',
      providerName: '',
      branchName: '',
      accountNo: '',
      note: '',
      isActive: true
    });
  };

  const editTreasuryAccount = (item) => {
    setTreasuryAccountDraft({
      id: item?._id || item?.id || '',
      title: item?.title || '',
      code: item?.code || '',
      accountType: item?.accountType || 'cashbox',
      openingBalance: item?.openingBalance != null ? String(item.openingBalance) : '',
      currency: item?.currency || 'AFN',
      providerName: item?.providerName || '',
      branchName: item?.branchName || '',
      accountNo: item?.accountNo || '',
      note: item?.note || '',
      isActive: item?.isActive !== false
    });
    setTreasuryReconciliationDraft((current) => ({
      ...current,
      accountId: String(item?._id || item?.id || ''),
      statementBalance: item?.lastStatementBalance != null ? String(item.lastStatementBalance) : '',
      reconciliationDate: current.reconciliationDate || toInputDate(new Date())
    }));
  };

  const prepareTreasuryReconciliation = (item) => {
    setTreasuryReconciliationDraft({
      accountId: String(item?._id || item?.id || ''),
      statementBalance: item?.lastStatementBalance != null ? String(item.lastStatementBalance) : String(item?.metrics?.bookBalance || ''),
      reconciliationDate: toInputDate(new Date()),
      referenceNo: '',
      note: '',
      applyAdjustment: true
    });
  };

  const editExpenseCategory = (item) => {
    setCategoryDraft({
      id: item?._id || '',
      label: item?.label || '',
      key: item?.key || '',
      description: item?.description || '',
      colorTone: item?.colorTone || 'teal',
      subCategoriesText: buildCategorySubCategoryText(item?.subCategories || []),
      isActive: item?.isActive !== false
    });
  };

  const submitFinancialYear = async () => {
    try {
      const targetAcademicYearId = selectedAcademicYearId || selectedFinancialYear?.academicYearId || '';
      if (!targetAcademicYearId) {
        showMessage('ابتدا یک سال تعلیمی معتبر انتخاب کنید.', 'error');
        return;
      }

      const existingFinancialYear = reference.financialYears.find((item) => (
        String(item?.academicYearId || item?.academicYear?._id || '') === String(targetAcademicYearId)
      ));
      if (existingFinancialYear) {
        showMessage('برای این سال تعلیمی قبلاً سال مالی ثبت شده است. همان مورد را ویرایش یا فعال کنید.', 'error');
        return;
      }

      setBusyAction('save-year');
      await postJson('/api/finance/admin/financial-years', {
        academicYearId: targetAcademicYearId,
        title: financialYearDraft.title || selectedAcademicYear?.title || '',
        code: financialYearDraft.code || selectedAcademicYear?.code || '',
        startDate: financialYearDraft.startDate,
        endDate: financialYearDraft.endDate,
        dailyFeePercent: financialYearDraft.dailyFeePercent,
        yearlyFeePercent: financialYearDraft.yearlyFeePercent,
        note: financialYearDraft.note,
        isActive: financialYearDraft.isActive
      });
      showMessage('سال مالی با موفقیت ثبت شد.');
      await loadReference();
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت سال مالی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const saveSelectedFinancialYearBudget = async () => {
    if (!selectedFinancialYearId) {
      showMessage('ابتدا یک سال مالی را برای تنظیم بودجه انتخاب کنید.', 'error');
      return;
    }

    try {
      setBusyAction(`save-budget-${selectedFinancialYearId}`);
      await fetchJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetTargets: serializeBudgetDraft(selectedYearBudgetDraft, expenseCategoryRegistry)
        })
      });
      showMessage('Budget targets updated.');
      await loadWorkspace('year');
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیره بودجه سال مالی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const requestBudgetReview = async () => {
    if (!selectedFinancialYearId) {
      showMessage('ابتدا یک سال مالی را برای بودجه انتخاب کنید.', 'error');
      return;
    }
    try {
      setBusyAction(`budget-review-request-${selectedFinancialYearId}`);
      await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/request-review`, {
        note: 'ارسال بودجه از میز مدیریت سال مالی'
      });
      showMessage('بودجه برای بررسی ارسال شد.');
      await loadWorkspace('year');
    } catch (error) {
      showMessage(errorMessage(error, 'ارسال بودجه برای بررسی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const reviewBudgetApproval = async (action = 'approve') => {
    if (!selectedFinancialYearId) {
      showMessage('ابتدا یک سال مالی را انتخاب کنید.', 'error');
      return;
    }
    const reason = action === 'reject'
      ? window.prompt('دلیل رد بودجه را بنویسید:', '')
      : '';
    if (action === 'reject' && reason === null) return;

    try {
      setBusyAction(`${action}-budget-${selectedFinancialYearId}`);
      await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/review`, {
        action,
        reason: reason || '',
        note: action === 'reject' ? 'بودجه از میز سال مالی رد شد.' : 'بودجه از میز سال مالی تایید شد.'
      });
      showMessage(action === 'reject' ? 'درخواست بودجه رد شد.' : 'مرحله بودجه ثبت شد.');
      await loadWorkspace('year');
    } catch (error) {
      showMessage(errorMessage(error, 'بررسی بودجه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const startBudgetRevision = async () => {
    if (!selectedFinancialYearId) {
      showMessage('ابتدا یک سال مالی را انتخاب کنید.', 'error');
      return;
    }
    try {
      setBusyAction(`budget-start-revision-${selectedFinancialYearId}`);
      await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/start-revision`, {
        note: 'Revision started from the government finance workspace.'
      });
      showMessage('Budget revision started.');
      await loadWorkspace('year');
    } catch (error) {
      showMessage(errorMessage(error, 'آغاز بازنگری بودجه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const activateFinancialYear = async (financialYearId) => {
    try {
      setBusyAction(`activate-year-${financialYearId}`);
      await postJson(`/api/finance/admin/financial-years/${financialYearId}/activate`, {});
      setSelectedFinancialYearId(financialYearId);
      showMessage('سال مالی فعال شد.');
      await loadReference();
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'فعال‌سازی سال مالی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const closeFinancialYear = async (financialYearId) => {
    try {
      setBusyAction(`close-year-${financialYearId}`);
      await postJson(`/api/finance/admin/financial-years/${financialYearId}/close`, { note: 'بسته‌شده از مرکز مالی.' });
      showMessage('سال مالی بسته شد.');
      await loadReference();
      await loadWorkspace();
    } catch (error) {
      const blockers = error?.data?.readiness?.blockers || [];
      if (blockers.length) {
        showMessage(`بستن سال مالی متوقف شد: ${blockers.join(' ')}`, 'error');
      } else {
        showMessage(errorMessage(error, 'بستن سال مالی ناموفق بود.'), 'error');
      }
    } finally {
      setBusyAction('');
    }
  };

  const submitExpense = async () => {
    try {
      if (!selectedFinancialYearId) {
        showMessage('ابتدا یک سال مالی را برای ثبت مصرف انتخاب کنید.', 'error');
        return;
      }
      setBusyAction('save-expense');
      await postJson('/api/finance/admin/expenses', {
        financialYearId: selectedFinancialYearId,
        classId: selectedClassId,
        category: expenseDraft.category,
        subCategory: expenseDraft.subCategory,
        amount: expenseDraft.amount,
        expenseDate: expenseDraft.expenseDate,
        paymentMethod: expenseDraft.paymentMethod,
        treasuryAccountId: expenseDraft.treasuryAccountId,
        procurementCommitmentId: expenseDraft.procurementCommitmentId,
        vendorName: expenseDraft.vendorName,
        referenceNo: expenseDraft.referenceNo,
        note: expenseDraft.note,
        status: expenseDraft.status
      });
      setExpenseDraft((current) => ({
        ...current,
        subCategory: expenseSubCategoryOptions[0]?.key || '',
        amount: '',
        procurementCommitmentId: '',
        vendorName: '',
        referenceNo: '',
        note: ''
      }));
      showMessage('ثبت مصرف با موفقیت انجام شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت مصرف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitProcurement = async () => {
    try {
      if (!selectedFinancialYearId) {
        showMessage('ابتدا یک سال مالی را برای تعهد خرید انتخاب کنید.', 'error');
        return;
      }
      setBusyAction('save-procurement');
      await postJson('/api/finance/admin/procurements', {
        financialYearId: selectedFinancialYearId,
        classId: selectedClassId,
        title: procurementDraft.title,
        vendorName: procurementDraft.vendorName,
        category: procurementDraft.category,
        subCategory: procurementDraft.subCategory,
        procurementType: procurementDraft.procurementType,
        committedAmount: procurementDraft.committedAmount,
        requestDate: procurementDraft.requestDate,
        expectedDeliveryDate: procurementDraft.expectedDeliveryDate,
        treasuryAccountId: procurementDraft.treasuryAccountId,
        referenceNo: procurementDraft.referenceNo,
        paymentTerms: procurementDraft.paymentTerms,
        description: procurementDraft.description,
        note: procurementDraft.note,
        status: procurementDraft.status
      });
      setProcurementDraft((current) => ({
        ...current,
        title: '',
        vendorName: '',
        committedAmount: '',
        expectedDeliveryDate: '',
        referenceNo: '',
        paymentTerms: '',
        description: '',
        note: '',
        status: 'draft'
      }));
      showMessage('تعهد خرید ثبت شد.');
      await loadWorkspace('operations');
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت تعهد خرید ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitProcurementForReview = async (commitmentId) => {
    try {
      setBusyAction(`submit-procurement-${commitmentId}`);
      await postJson(`/api/finance/admin/procurements/${commitmentId}/submit`, {});
      showMessage('تعهد خرید برای بررسی ارسال شد.');
      await loadWorkspace('operations');
    } catch (error) {
      showMessage(errorMessage(error, 'ارسال تعهد خرید برای بررسی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const reviewProcurement = async (commitmentId, action = 'approve') => {
    const reason = action === 'reject'
      ? window.prompt('دلیل رد تعهد خرید را بنویسید:', '')
      : '';
    if (action === 'reject' && reason === null) return;

    try {
      setBusyAction(`${action}-procurement-${commitmentId}`);
      await postJson(`/api/finance/admin/procurements/${commitmentId}/review`, {
        action,
        reason: reason || '',
        note: action === 'reject' ? 'تعهد خرید رد شد.' : 'تعهد خرید تایید شد.'
      });
      showMessage(action === 'reject' ? 'تعهد خرید رد شد.' : 'تعهد خرید بررسی و ثبت شد.');
      await loadWorkspace('operations');
    } catch (error) {
      showMessage(errorMessage(error, 'بررسی تعهد خرید ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitProcurementSettlement = async () => {
    if (!selectedProcurementSettlement?._id) {
      showMessage('ابتدا یک تعهد تاییدشده را برای تسویه انتخاب کنید.', 'error');
      return;
    }
    if (!procurementSettlementDraft.treasuryAccountId) {
      showMessage('برای تسویه، حساب خزانه انتخاب شود.', 'error');
      return;
    }
    try {
      setBusyAction(`settle-procurement-${selectedProcurementSettlement._id}`);
      await postJson(`/api/finance/admin/procurements/${selectedProcurementSettlement._id}/settlements`, {
        amount: procurementSettlementDraft.amount,
        settlementDate: procurementSettlementDraft.settlementDate,
        treasuryAccountId: procurementSettlementDraft.treasuryAccountId,
        referenceNo: procurementSettlementDraft.referenceNo,
        note: procurementSettlementDraft.note
      });
      setProcurementSettlementDraft((current) => ({
        ...current,
        amount: '',
        referenceNo: '',
        note: '',
        treasuryAccountId: String(selectedProcurementSettlement?.treasuryAccountId || current.treasuryAccountId || '')
      }));
      showMessage('تصفیه فروشنده was registered.');
      await loadWorkspace('operations');
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت تسویه فروشنده ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const approveExpense = async (expenseId) => {
    try {
      setBusyAction(`approve-expense-${expenseId}`);
      await postJson(`/api/finance/admin/expenses/${expenseId}/approve`, {});
      showMessage('مصرف به مرحله بعدی تایید منتقل شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'تایید مصرف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitExpenseForReview = async (expenseId) => {
    try {
      setBusyAction(`submit-expense-${expenseId}`);
      await postJson(`/api/finance/admin/expenses/${expenseId}/submit`, {});
      showMessage('مصرف برای بررسی به صف تایید ارسال شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ارسال مصرف برای بررسی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const reviewExpense = async (expenseId, action = 'approve') => {
    try {
      const reason = action === 'reject'
        ? window.prompt('دلیل رد را بنویسید:', '')
        : '';
      if (action === 'reject' && reason === null) return;
      setBusyAction(`${action}-expense-${expenseId}`);
      await postJson(`/api/finance/admin/expenses/${expenseId}/review`, {
        action,
        reason: reason || '',
        note: action === 'reject' ? 'از مرکز مالی رد شد.' : 'از مرکز مالی تایید شد.'
      });
      showMessage(action === 'reject' ? 'مصرف رد شد.' : 'مصرف بررسی و ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'بررسی مصرف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const voidExpense = async (expenseId) => {
    try {
      setBusyAction(`void-expense-${expenseId}`);
      await postJson(`/api/finance/admin/expenses/${expenseId}/void`, { note: 'از مرکز مالی باطل شد.' });
      showMessage('مصرف باطل شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'باطل‌سازی مصرف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitExpenseCategory = async () => {
    try {
      const payload = {
        key: categoryDraft.key,
        label: categoryDraft.label,
        description: categoryDraft.description,
        colorTone: categoryDraft.colorTone,
        isActive: categoryDraft.isActive,
        subCategories: parseCategorySubCategoryText(categoryDraft.subCategoriesText)
      };
      setBusyAction(categoryDraft.id ? `update-expense-category-${categoryDraft.id}` : 'create-expense-category');
      if (categoryDraft.id) {
        await fetchJson(`/api/finance/admin/expense-categories/${categoryDraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await postJson('/api/finance/admin/expense-categories', payload);
      }
      showMessage(categoryDraft.id ? 'دسته‌بندی مصرف ویرایش شد.' : 'دسته‌بندی مصرف ثبت شد.');
      resetExpenseCategoryDraft();
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت دسته‌بندی مصرف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitTreasuryAccount = async () => {
    try {
      if (!selectedFinancialYearId) {
        showMessage('ابتدا یک سال مالی را برای حساب خزانه انتخاب کنید.', 'error');
        return;
      }
      const payloadBody = {
        financialYearId: selectedFinancialYearId,
        academicYearId: selectedAcademicYearId,
        title: treasuryAccountDraft.title,
        code: treasuryAccountDraft.code,
        accountType: treasuryAccountDraft.accountType,
        openingBalance: treasuryAccountDraft.openingBalance,
        currency: treasuryAccountDraft.currency,
        providerName: treasuryAccountDraft.providerName,
        branchName: treasuryAccountDraft.branchName,
        accountNo: treasuryAccountDraft.accountNo,
        note: treasuryAccountDraft.note,
        isActive: treasuryAccountDraft.isActive
      };
      setBusyAction(treasuryAccountDraft.id ? `update-treasury-account-${treasuryAccountDraft.id}` : 'create-treasury-account');
      if (treasuryAccountDraft.id) {
        await fetchJson(`/api/finance/admin/treasury/accounts/${treasuryAccountDraft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBody)
        });
      } else {
        await postJson('/api/finance/admin/treasury/accounts', payloadBody);
      }
      showMessage(treasuryAccountDraft.id ? 'حساب خزانه ویرایش شد.' : 'حساب خزانه ثبت شد.');
      resetTreasuryAccountDraft();
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت حساب خزانه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitTreasuryTransaction = async () => {
    try {
      if (!treasuryTransactionDraft.accountId) {
        showMessage('ابتدا یک حساب خزانه انتخاب کنید.', 'error');
        return;
      }
      setBusyAction('create-treasury-transaction');
      await postJson('/api/finance/admin/treasury/transactions', {
        accountId: treasuryTransactionDraft.accountId,
        transactionType: treasuryTransactionDraft.transactionType,
        amount: treasuryTransactionDraft.amount,
        transactionDate: treasuryTransactionDraft.transactionDate,
        referenceNo: treasuryTransactionDraft.referenceNo,
        note: treasuryTransactionDraft.note
      });
      setTreasuryTransactionDraft((current) => ({
        ...current,
        amount: '',
        referenceNo: '',
        note: ''
      }));
      showMessage('حرکت خزانه ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت حرکت خزانه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitTreasuryTransfer = async () => {
    try {
      if (!treasuryTransferDraft.sourceAccountId || !treasuryTransferDraft.destinationAccountId) {
        showMessage('برای انتقال، حساب مبدا و مقصد را انتخاب کنید.', 'error');
        return;
      }
      setBusyAction('create-treasury-transfer');
      await postJson('/api/finance/admin/treasury/transfers', {
        sourceAccountId: treasuryTransferDraft.sourceAccountId,
        destinationAccountId: treasuryTransferDraft.destinationAccountId,
        amount: treasuryTransferDraft.amount,
        transactionDate: treasuryTransferDraft.transactionDate,
        referenceNo: treasuryTransferDraft.referenceNo,
        note: treasuryTransferDraft.note
      });
      setTreasuryTransferDraft((current) => ({
        ...current,
        amount: '',
        referenceNo: '',
        note: ''
      }));
      showMessage('انتقال خزانه ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت انتقال خزانه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const submitTreasuryReconciliation = async () => {
    try {
      if (!treasuryReconciliationDraft.accountId) {
        showMessage('برای تطبیق، یک حساب خزانه انتخاب کنید.', 'error');
        return;
      }
      setBusyAction(`reconcile-treasury-${treasuryReconciliationDraft.accountId}`);
      await postJson(`/api/finance/admin/treasury/accounts/${treasuryReconciliationDraft.accountId}/reconcile`, {
        statementBalance: treasuryReconciliationDraft.statementBalance,
        reconciliationDate: treasuryReconciliationDraft.reconciliationDate,
        referenceNo: treasuryReconciliationDraft.referenceNo,
        note: treasuryReconciliationDraft.note,
        applyAdjustment: treasuryReconciliationDraft.applyAdjustment
      });
      showMessage('تطبیق حساب خزانه ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'تطبیق حساب خزانه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const generateSnapshot = async (reportType) => {
    try {
      if (!selectedFinancialYearId) {
        showMessage('ابتدا یک سال مالی انتخاب کنید.', 'error');
        return;
      }
      const actionKey = `snapshot-${reportType}`;
      setBusyAction(actionKey);
      await postJson('/api/finance/admin/government-snapshots', {
        reportType,
        financialYearId: selectedFinancialYearId,
        academicYearId: selectedAcademicYearId,
        classId: selectedClassId || '',
        quarter: reportType === 'quarterly' ? selectedQuarter : undefined,
        isOfficial: true
      });
      showMessage(`نسخه رسمی ${reportType === 'quarterly' ? 'ربعوار' : 'سالانه'} ساخته شد.`);
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ساخت snapshot رسمی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const resolveActiveReportKey = () => {
    if (activeTab === 'quarterly') return 'government_finance_quarterly';
    if (activeTab === 'annual' || activeTab === 'archive') return 'government_finance_annual';
    return 'finance_overview';
  };

  const buildExportFilters = () => {
    const filters = {};
    if (selectedFinancialYearId) filters.financialYearId = selectedFinancialYearId;
    if (selectedAcademicYearId) filters.academicYearId = selectedAcademicYearId;
    if (selectedClassId) filters.classId = selectedClassId;
    if (activeTab === 'quarterly') filters.quarter = selectedQuarter;
    return filters;
  };

  const exportBinary = async (endpoint, actionName) => {
    try {
      setBusyAction(actionName);
      const filters = buildExportFilters();
      const { blob, filename } = await fetchBlob(endpoint, {
        reportKey: resolveActiveReportKey(),
        filters
      });
      downloadBlob(blob, filename);
      showMessage('خروجی مالی با موفقیت دانلود شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت خروجی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const exportPrint = async () => {
    try {
      setBusyAction('print');
      const filters = buildExportFilters();
      const { text, filename, contentType } = await fetchText('/api/reports/export.print', {
        reportKey: resolveActiveReportKey(),
        filters
      });
      const opened = openHtmlDocument(text, filename);
      if (!opened) {
        downloadBlob(new Blob([text], { type: contentType }), filename);
      }
      showMessage('نسخه چاپی گزارش مالی آماده شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'ساخت نسخه چاپی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const downloadSnapshotPdf = async (snapshotId) => {
    if (!snapshotId) {
      showMessage('ابتدا یک snapshot رسمی معتبر انتخاب کنید.', 'error');
      return;
    }
    try {
      setBusyAction(`snapshot-pdf-${snapshotId}`);
      const { blob, filename } = await fetchBlob(`/api/finance/admin/government-snapshots/${snapshotId}/export.pdf`, {}, {
        method: 'GET'
      });
      downloadBlob(blob, filename || `government-finance-${snapshotId}.pdf`);
      await loadWorkspace('archive');
      showMessage('PDF رسمی آرشیف مالی دانلود شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت PDF آرشیف رسمی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deliverGovernmentArchiveDocument = async () => {
    if (!selectedGovernmentArchive?._id) {
      showMessage('ابتدا یک سند آرشیفی دولتی را انتخاب کنید.', 'error');
      return;
    }
    const recipients = String(archiveDeliveryDraft.recipientHandles || '')
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (!archiveDeliveryDraft.includeLinkedAudience && !recipients.length) {
      showMessage('حداقل یک گیرنده را برای ارسال سند وارد کنید.', 'error');
      return;
    }
    try {
      setBusyAction(`deliver-government-archive-${selectedGovernmentArchive._id}`);
      await postJson(`/api/finance/admin/document-archive/${selectedGovernmentArchive._id}/deliver`, {
        channel: archiveDeliveryDraft.channel,
        recipientHandles: archiveDeliveryDraft.recipientHandles,
        includeLinkedAudience: archiveDeliveryDraft.includeLinkedAudience,
        note: archiveDeliveryDraft.note,
        subject: `${selectedGovernmentArchive.title || 'Government finance pack'}${selectedGovernmentArchive.documentNo ? ` | ${selectedGovernmentArchive.documentNo}` : ''}`
      });
      setArchiveDeliveryDraft((current) => ({
        ...current,
        recipientHandles: '',
        note: ''
      }));
      showMessage('Government archive delivery queued successfully.');
      await loadWorkspace('archive');
    } catch (error) {
      showMessage(errorMessage(error, 'ارسال سند دولتی از آرشیف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const copyViewLink = async () => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('امکان کپی در این مرورگر در دسترس نیست.');
      }
      await navigator.clipboard.writeText(window.location.href);
      showMessage('لینک نمای فعلی مالی کپی شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'کپی‌کردن لینک نمای فعلی مالی ناموفق بود.'), 'error');
    }
  };

  const resetViewFilters = () => {
    const nextFinancialYearId = activeFinancialYear?._id || activeFinancialYear?.id || '';
    const nextAcademicYearId = activeFinancialYear?.academicYearId || activeAcademicYear?.id || '';

    setActiveTab(DEFAULT_TAB);
    setSelectedFinancialYearId(nextFinancialYearId);
    setSelectedAcademicYearId(nextAcademicYearId);
    setSelectedClassId('');
    setSelectedQuarter(DEFAULT_QUARTER);
    showMessage('نمای مالی به فیلترهای پیش‌فرض مرکز فرماندهی بازگردانده شد.');
  };

  const kpiCards = [
    {
      label: 'کل تعهدات',
      value: formatMoney(payload.financeOverview?.summary?.totalDue || 0),
      tone: 'teal',
      hint: `${formatNumber(payload.financeOverview?.summary?.totalOrders || 0)} ردیف فیس`
    },
    {
      label: 'کل وصول',
      value: formatMoney(payload.financeOverview?.summary?.totalPaymentAmount || 0),
      tone: 'copper',
      hint: `${formatNumber(payload.financeOverview?.summary?.totalPayments || 0)} پرداخت`
    },
    {
      label: 'مانده باز',
      value: formatMoney(payload.financeOverview?.summary?.totalOutstanding || 0),
      tone: 'slate',
      hint: `${formatNumber(payload.financeOverview?.summary?.overdueOrders || 0)} مورد معوق`
    },
    {
      label: 'وصول این ماه',
      value: formatMoney(payload.summary?.monthCollection || 0),
      tone: 'mint',
      hint: `${collectionRate}% نرخ وصول`
    },
    {
      label: 'رسیدهای در انتظار',
      value: formatNumber(payload.summary?.pendingReceipts || 0),
      tone: 'rose',
      hint: `${formatNumber(payload.summary?.receiptWorkflow?.generalPresident || 0)} در مرحله ریاست`
    },
    {
      label: 'ماه‌های بسته',
      value: formatNumber((payload.closedMonths || []).length),
      tone: 'sand',
      hint: 'آرشیف دوره‌های قطعی'
    }
  ];

  return (
    <div className="gov-finance-page">
      <div className={`gov-finance-shell ${isWorkspaceLoading ? 'is-loading' : ''}`} aria-busy={isWorkspaceLoading}>
        <section className="gov-finance-hero">
          <div className="gov-finance-hero-copy">
            <div className="gov-finance-badges">
              <span className="gov-finance-badge">مرکز فرماندهی مالی دولت و مکتب</span>
              <span className="gov-finance-badge info">متصل به هسته مالی و موتور گزارش</span>
              <span className="gov-finance-badge muted">{selectedAcademicYear?.title || 'سال فعال انتخاب نشده'}</span>
              {isWorkspaceLoading ? <span className="gov-finance-badge muted">در حال تازه‌سازی نمای مالی...</span> : null}
            </div>
            <h1>فرماندهی گزارش مالی دولت و مکتب</h1>
            <p>
              این نسخه روی داده‌های اصلی فعلی سوار است و از خلاصه مالی، جریان نقدینگی، گزارش معوقات، صورت‌حساب صنوف و موتور گزارش‌ساز
              برای ساخت یک رابط کاربری رسمی، مدرن و آماده‌ی فاز بعدی استفاده می‌کند.
            </p>
            <div className="gov-finance-hero-meta">
              <span>سال مالی: {selectedFinancialYear?.title || '---'}</span>
              <span>سال تعلیمی مبنا: {selectedAcademicYear?.title || '---'}</span>
              <span>صنف فعال: {selectedClass?.title || 'همه صنف‌ها'}</span>
              <span>آخرین تولید: {toLocaleDateTime(payload.financeOverview?.generatedAt)}</span>
            </div>
          </div>

          <div className="gov-finance-hero-side">
            <div className="gov-ring-grid">
              <div className="gov-ring-card">
                <div className="gov-ring" style={{ '--progress': `${collectionRate}%` }}>
                  <strong>{collectionRate}%</strong>
                  <span>نرخ وصول</span>
                </div>
              </div>
              <div className="gov-ring-card">
                <div className="gov-ring warm" style={{ '--progress': `${closedMonthRatio}%` }}>
                  <strong>{Math.round(closedMonthRatio)}%</strong>
                  <span>پیشرفت آرشیف ماهانه</span>
                </div>
              </div>
            </div>

            <div className="gov-finance-hero-actions">
              <button type="button" className="gov-primary-btn" onClick={() => refreshFinanceTab(activeTab)} disabled={busyAction === 'load'}>
                {busyAction === 'load' ? 'در حال بازخوانی...' : effectiveRefreshButtonLabel}
              </button>
              <button type="button" className="gov-ghost-btn" onClick={copyViewLink} disabled={!!busyAction}>
                کپی لینک نما
              </button>
              <button type="button" className="gov-ghost-btn" onClick={() => exportBinary('/api/reports/export.xlsx', 'xlsx')} disabled={!!busyAction}>
                خروجی اکسل
              </button>
              <button type="button" className="gov-ghost-btn" onClick={exportPrint} disabled={!!busyAction}>
                نسخه چاپی
              </button>
              <Link className="gov-inline-link" to="/admin-finance">بازگشت به مرکز مالی</Link>
              <Link className="gov-inline-link subtle" to="/admin-reports">موتور گزارش یکپارچه</Link>
            </div>
          </div>
        </section>

        {message ? (
          <div className={`gov-finance-message ${messageTone === 'error' ? 'error' : ''}`}>
            {message}
          </div>
        ) : null}

        <section className="gov-finance-toolbar">
          <div className="gov-finance-tabbar" role="tablist" aria-label="بخش‌های مالی دولت و مکتب">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`gov-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => openFinanceTab(tab.key)}
                onMouseEnter={() => warmGovernmentFinanceTab(tab.key)}
                onFocus={() => warmGovernmentFinanceTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="gov-finance-filters">
            <label className="gov-field">
              <span>سال مالی</span>
              <select value={selectedFinancialYearId} onChange={(event) => setSelectedFinancialYearId(event.target.value)} disabled={isWorkspaceLoading}>
                <option value="">همه / بدون محدودیت</option>
                {[...(payload.financialYears || []), ...(reference.financialYears || []).filter((item) => !(payload.financialYears || []).some((current) => String(current._id || current.id) === String(item.id)))]
                  .map((item) => (
                    <option key={item._id || item.id} value={item._id || item.id}>{item.title || item.code || item._id || item.id}</option>
                  ))}
              </select>
            </label>
            <label className="gov-field">
              <span>سال تعلیمی</span>
              <select value={selectedAcademicYearId} onChange={(event) => setSelectedAcademicYearId(event.target.value)} disabled={isWorkspaceLoading}>
                {reference.academicYears.map((item) => (
                  <option key={item.id} value={item.id}>{item.title || item.code || item.id}</option>
                ))}
              </select>
            </label>
            <label className="gov-field">
              <span>صنف</span>
              <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} disabled={isWorkspaceLoading}>
                <option value="">همه صنف‌ها</option>
                {reference.classes.map((item) => (
                  <option key={item.id} value={item.id}>{item.title || item.code || item.id}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="gov-context-strip">
          <div className="gov-context-chips" aria-label="خلاصه فیلترهای مالی">
            {exportContextChips.map((item) => (
              <div key={item.key} className="gov-context-chip">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="gov-context-actions">
            <button type="button" className="gov-ghost-btn slim" onClick={resetViewFilters} disabled={!!busyAction}>
              بازنشانی نما
            </button>
          </div>
        </section>

        <section className="gov-tab-status-strip" aria-label="وضعیت تازه‌بودن تب‌های مالی">
          {tabStatusItems.map((item) => (
            <article
              key={item.key}
              className={`gov-tab-status-card tone-${item.tone} ${item.isCurrent ? 'is-current' : ''}`.trim()}
              data-tab-status-key={item.key}
            >
              <strong>{item.label}</strong>
              <span>{item.status}</span>
              <small>{item.timestamp}</small>
              <div className="gov-tab-status-actions">
                <button
                  type="button"
                  className="gov-inline-action"
                  data-tab-open={item.key}
                  onClick={() => openFinanceTab(item.key)}
                  disabled={item.isCurrent}
                >
                  {item.isCurrent ? 'تب فعال' : 'باز کردن تب'}
                </button>
                <button
                  type="button"
                  className="gov-inline-action"
                  data-tab-refresh={item.key}
                  onClick={() => refreshFinanceTab(item.key)}
                  disabled={!!busyAction}
                >
                  {item.actionLabel}
                </button>
              </div>
            </article>
          ))}
        </section>

        {showInitialLoadingSkeleton ? (
          <>
            {activeTab === 'dashboard' ? (
              <section className="gov-kpi-grid" aria-label="Government finance loading summary">
                {Array.from({ length: 6 }).map((_, index) => (
                  <article key={`kpi-skeleton-${index}`} className="gov-kpi-card gov-kpi-card-loading" aria-hidden="true">
                    <div className="gov-skeleton-stack">
                      <LoadingSkeleton className="gov-skeleton-line gov-skeleton-label" />
                      <LoadingSkeleton className="gov-skeleton-line gov-skeleton-value" />
                      <LoadingSkeleton className="gov-skeleton-line gov-skeleton-short" />
                    </div>
                  </article>
                ))}
              </section>
            ) : null}
            <GovernmentFinanceLoadingPanels activeTab={activeTab} />
          </>
        ) : (
          <>
            {activeTab === 'dashboard' ? (
              <section className="gov-kpi-grid">
                {kpiCards.map((item) => (
                  <article key={item.label} className="gov-kpi-card" data-tone={item.tone}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint}</small>
                  </article>
                ))}
              </section>
            ) : null}

            {activeTab === 'dashboard' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="8">
              <TrendChart series={monthlySeries} />
            </article>

            <article className="gov-card" data-span="4">
              <HorizontalBars
                title="سهم صنف‌ها از تعهدات"
                subtitle="مرتب‌شده بر اساس حجم تعهدات مالی"
                items={(payload.byClass || []).map((item) => ({
                  label: item.schoolClass?.title || item.course || 'صنف',
                  due: toNumber(item.due)
                })).slice(0, 6)}
              />
            </article>

            <article className="gov-card" data-span="5">
              <div className="gov-card-head">
                <div>
                  <strong>وضعیت معوقات</strong>
                  <span>نمایش bucketهای aging فعلی</span>
                </div>
              </div>
              <div className="gov-mini-stack">
                {quarterArrears.map((item) => (
                  <div key={item.label} className="gov-mini-stat" data-tone={item.tone}>
                    <span>{item.label}</span>
                    <strong>{formatMoney(item.value)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <article className="gov-card" data-span="4">
              <div className="gov-card-head">
                <div>
                  <strong>سلامت وصول</strong>
                  <span>از summary فعلی و workflow رسیدها</span>
                </div>
              </div>
              <div className="gov-health-panel">
                <div className="gov-health-row">
                  <span>رسیدهای مرحله مدیر مالی</span>
                  <strong>{formatNumber(payload.summary?.receiptWorkflow?.financeManager || 0)}</strong>
                </div>
                <div className="gov-health-row">
                  <span>رسیدهای مرحله آمریت مالی</span>
                  <strong>{formatNumber(payload.summary?.receiptWorkflow?.financeLead || 0)}</strong>
                </div>
                <div className="gov-health-row">
                  <span>رسیدهای مرحله ریاست</span>
                  <strong>{formatNumber(payload.summary?.receiptWorkflow?.generalPresident || 0)}</strong>
                </div>
                <div className="gov-health-row">
                  <span>بل‌های معوق</span>
                  <strong>{formatNumber(payload.summary?.overdueBills || 0)}</strong>
                </div>
              </div>
            </article>

            <article className="gov-card" data-span="3">
              <HorizontalBars
                title="دسته‌های مصرف"
                subtitle="ترکیب اولیه از مصارف ثبت‌شده"
                items={expenseBreakdown}
                accent="copper"
              />
            </article>
            
            <article className="gov-card" data-span="5">
              <ExpenseMonthlyBars items={expenseMonthlyBreakdown} />
            </article>

            <article className="gov-card" data-span="4">
              <HorizontalBars
                title="فروشندگان برجسته"
                subtitle="بزرگ‌ترین فروشندگان تاییدشده و در انتظار بررسی"
                items={expenseVendorBreakdown}
                accent="rose"
              />
            </article>

            <article className="gov-card" data-span="3">
              <div className="gov-card-head">
                <div>
                  <strong>حاکمیت مصارف</strong>
                  <span>صف بررسی، آمادگی بستن سال، و ردپای دسته‌بندی‌ها</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone="teal">
                  <span>کل ثبت‌شده</span>
                  <strong>{formatMoney(expenseGovernanceSummary.totalAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.categoryCount || 0)} دسته</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>تاییدشده</span>
                  <strong>{formatMoney(expenseGovernanceSummary.approvedAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.statusCounts?.approved || 0)} ردیف</small>
                </div>
                <div className="gov-governance-stat" data-tone="copper">
                  <span>در بررسی</span>
                  <strong>{formatMoney(expenseGovernanceSummary.pendingAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.queueCount || 0)} مورد</small>
                </div>
                <div className="gov-governance-stat" data-tone={expenseCloseReadiness?.canClose ? 'mint' : 'rose'}>
                  <span>آمادگی بستن سال</span>
                  <strong>{expenseCloseReadiness?.canClose ? 'آماده' : 'متوقف'}</strong>
                  <small>{formatNumber(expenseCloseReadiness?.blockerCount || 0)} مانع</small>
                </div>
              </div>
            </article>
          </section>
            ) : null}

            {activeTab === 'quarterly' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="12">
              <div className="gov-card-head spread">
                <div>
                  <strong>فیلتر ربع</strong>
                  <span>ربع انتخابی را عوض کنید تا گزارش رسمی همان بخش زمانی به‌روز شود.</span>
                </div>
                <div className="gov-quarter-switch">
                  {QUARTER_OPTIONS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={selectedQuarter === item.key ? 'active' : ''}
                      onClick={() => setSelectedQuarter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>

            <article className="gov-card" data-span="4">
              <div className="gov-kpi-card spotlight">
                <span>{currentQuarterSummary?.label || 'ربع انتخابی'}</span>
                <strong>{formatMoney(payload.governmentQuarterly?.summary?.totalIncome || 0)}</strong>
                <small>تعهدات ثبت‌شده در این ربع</small>
              </div>
            </article>
            <article className="gov-card" data-span="4">
              <div className="gov-kpi-card spotlight" data-tone="mint">
                <span>وصول ربع</span>
                <strong>{formatMoney(payload.governmentQuarterly?.summary?.totalExpense || 0)}</strong>
                <small>{formatNumber(payload.governmentQuarterly?.summary?.expenseCount || 0)} ردیف مصرف</small>
              </div>
            </article>
            <article className="gov-card" data-span="4">
              <div className="gov-kpi-card spotlight" data-tone="slate">
                <span>مانده ربع</span>
                <strong>{formatMoney(payload.governmentQuarterly?.summary?.balance || 0)}</strong>
                <small>{formatNumber(payload.governmentQuarterly?.summary?.classCount || 0)} ردیف صنفی</small>
              </div>
            </article>

            <article className="gov-card" data-span="5" data-procurement-settlement-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>تصفیه فروشنده</strong>
                  <span>Post treasury-backed settlement against approved commitments that are ready to pay.</span>
                </div>
              </div>
              {!settlementReadyProcurementOptions.length ? (
                <div className="gov-empty-state">هیچ تعهد تدارکاتی تایید شده‌ای در حال حاضر برای تصفیه آماده نیست.</div>
              ) : (
                <>
                  <div className="gov-form-grid">
                    <label className="gov-field gov-field-full">
                      <span>تعهد</span>
                      <select name="commitmentId" value={procurementSettlementDraft.commitmentId} onChange={handleProcurementSettlementDraftChange}>
                        {settlementReadyProcurementOptions.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.title || item.vendorName || item._id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مبلغ</span>
                      <input name="amount" value={procurementSettlementDraft.amount} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>تاریخ تصفیه</span>
                      <input type="date" name="settlementDate" value={procurementSettlementDraft.settlementDate} onChange={handleProcurementSettlementDraftChange} />
                      <small>{procurementSettlementDraft.settlementDate ? `هجری شمسی: ${toFaDate(procurementSettlementDraft.settlementDate)}` : 'تاریخ تسویه انتخاب نشده است.'}</small>
                    </label>
                    <label className="gov-field">
                      <span>حساب خزانه</span>
                      <select name="treasuryAccountId" value={procurementSettlementDraft.treasuryAccountId} onChange={handleProcurementSettlementDraftChange}>
                        <option value="">انتخاب حساب</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.title || item.code || item._id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مرجع</span>
                      <input name="referenceNo" value={procurementSettlementDraft.referenceNo} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت</span>
                      <input name="note" value={procurementSettlementDraft.note} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                  </div>
                  {selectedProcurementSettlement ? (
                    <div className="gov-mini-stack" data-procurement-settlement-summary="true">
                      <div className="gov-mini-stat" data-tone="teal">
                        <span>آماده پرداخت</span>
                        <strong>{formatMoney(selectedProcurementSettlement.payableReadyAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone="copper">
                        <span>قبلاً تصفیه شده</span>
                        <strong>{formatMoney(selectedProcurementSettlement.settledAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone="sand">
                        <span>باقیمانده</span>
                        <strong>{formatMoney(selectedProcurementSettlement.settlementBalanceAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone={Number(selectedProcurementSettlement.settlementCount || 0) > 0 ? 'mint' : 'sand'}>
                        <span>تعداد تصفیه</span>
                        <strong>{formatNumber(selectedProcurementSettlement.settlementCount || 0)}</strong>
                      </div>
                    </div>
                  ) : null}
                  {selectedProcurementSettlement?.settlements?.length ? (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>تاریخ</th>
                            <th>مبلغ</th>
                            <th>مرجع</th>
                            <th>خزانه</th>
                            <th>تراکنش</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedProcurementSettlement.settlements || []).slice().reverse().map((entry, index) => (
                            <tr key={`procurement-settlement-${index}`}>
                              <td>{toLocaleDateTime(entry.settlementDate || entry.createdAt)}</td>
                              <td>{formatMoney(entry.amount || 0)}</td>
                              <td>{entry.referenceNo || '---'}</td>
                              <td>{entry.treasuryAccountId?.title || entry.treasuryAccountId?.code || '---'}</td>
                              <td>{entry.treasuryTransactionId?.referenceNo || entry.treasuryTransactionId?._id || '---'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-procurement-settlement-save="true"
                      onClick={submitProcurementSettlement}
                      disabled={!!busyAction || !selectedProcurementSettlement?._id}
                    >
                      {busyAction === `settle-procurement-${selectedProcurementSettlement?._id || ''}` ? 'ثبت تصفیه...' : 'ثبت تصفیه'}
                    </button>
                  </div>
                </>
              )}
            </article>

            <article className="gov-card" data-span="7">
              <QuarterCompare items={quarterSummaries} selectedQuarter={selectedQuarter} />
            </article>

            <article className="gov-card" data-span="5">
              <HorizontalBars
                title="رتبه‌بندی صنف‌ها در ربع انتخابی"
                subtitle="بر اساس تعهدات همان ربع"
                items={classRanking}
              />
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>یادداشت اجرایی</strong>
                  <span>این گزارش از `FeePayment` و `ExpenseEntry` برای ساخت نمای رسمی ربعوار استفاده می‌کند.</span>
                </div>
              </div>
              {!payload.governmentQuarterly?.rows?.length ? (
                <div className="gov-empty-state">هیچ ردیف رسمی برای گزارش ربعوار با این فیلترها پیدا نشد.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>صنف</th>
                        <th>عواید</th>
                        <th>مصارف</th>
                        <th>بیلانس</th>
                        <th>پرداخت‌ها</th>
                        <th>ردیف‌های مصرف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.governmentQuarterly.rows.map((row) => (
                        <tr key={`${row.classTitle}-${row.totalIncome}-${row.totalExpense}`}>
                          <td>{row.classTitle || '---'}</td>
                          <td>{formatMoney(row.totalIncome)}</td>
                          <td>{formatMoney(row.totalExpense)}</td>
                          <td>{formatMoney(row.balance)}</td>
                          <td>{formatNumber(row.paymentCount)}</td>
                          <td>{formatNumber(row.expenseCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
              </section>
            ) : null}

            {activeTab === 'annual' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="8">
              <QuarterCompare items={quarterSummaries} selectedQuarter={selectedQuarter} />
            </article>

            <article className="gov-card" data-span="4">
              <HorizontalBars
                title="ترکیب مصارف"
                subtitle="بر مبنای ردیف‌های تاییدشده مصرف"
                items={expenseBreakdown}
                accent="copper"
              />
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>نمونه جدول گزارش سالانه</strong>
                  <span>پیش‌نمایش rows از موتور گزارش canonical فعلی</span>
                </div>
              </div>
              {!payload.governmentAnnual?.rows?.length ? (
                <div className="gov-empty-state">برای سال و صنف فعلی row قابل نمایش پیدا نشد.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>ربع</th>
                        <th>عواید</th>
                        <th>مصارف</th>
                        <th>خالص</th>
                        <th>تعداد صنف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payload.governmentAnnual.rows.map((row) => (
                        <tr key={row.quarterLabel || row.quarter}>
                          <td>{row.quarterLabel || '---'}</td>
                          <td>{formatMoney(row.totalIncome)}</td>
                          <td>{formatMoney(row.totalExpense)}</td>
                          <td>{formatMoney(row.balance)}</td>
                          <td>{formatNumber(row.classCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
              </section>
            ) : null}

            {activeTab === 'year' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="7">
              <div className="gov-card-head">
                <div>
                  <strong>وضعیت سال مالی</strong>
                  <span>تا تکمیل API فاز 1، سال تعلیمی فعال به عنوان مبنای نمایشی استفاده می‌شود.</span>
                </div>
              </div>
              <div className="gov-help-note">
                <div className="gov-help-note-copy">
                  <strong>سال تعلیمی را از کجا تعریف کنم؟</strong>
                  <span>سال تعلیمی از بخش مدیریت آموزشی تعریف می‌شود و بعد در همین دفتر برای ساخت سال مالی استفاده می‌گردد.</span>
                </div>
                <Link className="gov-inline-link card-link" to="/admin-education">
                  رفتن به مدیریت آموزشی
                </Link>
              </div>
              <div className="gov-year-cards">
                {reference.academicYears.map((item) => (
                  <article
                    key={item.id}
                    className={`gov-year-card ${selectedAcademicYear?.id === item.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAcademicYearId(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedAcademicYearId(item.id);
                      }
                    }}
                  >
                    <strong>{item.title || item.code || item.id}</strong>
                    <span>{item.code || 'سال تعلیمی مبنا'}</span>
                    <small>{item.isActive ? 'فعال' : 'آرشیف / غیر فعال'}</small>
                    <div className="gov-card-actions">
                      <button
                        type="button"
                        className="gov-ghost-btn slim"
                        disabled={selectedAcademicYear?.id === item.id}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedAcademicYearId(item.id);
                        }}
                      >
                        {selectedAcademicYear?.id === item.id ? 'در حال نمایش' : 'انتخاب برای دفتر'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>دفتر سال‌های مالی</strong>
                  <span>مدیریت واقعی سال‌های مالی فعال، بسته و آرشیفی</span>
                </div>
              </div>
              {!payload.financialYears.length ? (
                <div className="gov-empty-state">هنوز هیچ سال مالی ثبت نشده است.</div>
              ) : (
                <div className="gov-year-cards">
                  {payload.financialYears.map((item) => (
                    <article
                      key={item._id || item.id}
                      className={`gov-year-card ${String(item._id || item.id) === String(selectedFinancialYearId) ? 'selected' : ''}`}
                      onClick={() => setSelectedFinancialYearId(item._id || item.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedFinancialYearId(item._id || item.id);
                        }
                      }}
                    >
                      <strong>{item.title || item.code || item._id}</strong>
                      <span>{item.status || 'planning'}</span>
                      <small>{item.isActive ? 'فعال' : item.isClosed ? 'بسته' : 'غیرفعال'}</small>
                      <div className="gov-card-actions">
                        <button
                          type="button"
                          className="gov-ghost-btn slim"
                          disabled={String(item._id || item.id) === String(selectedFinancialYearId)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedFinancialYearId(item._id || item.id);
                          }}
                        >
                          {String(item._id || item.id) === String(selectedFinancialYearId) ? 'در حال نمایش' : 'نمایش'}
                        </button>
                        <button
                          type="button"
                          className="gov-ghost-btn slim"
                          disabled={!!busyAction || item.isActive}
                          onClick={(event) => {
                            event.stopPropagation();
                            activateFinancialYear(item._id || item.id);
                          }}
                        >
                          فعال‌سازی
                        </button>
                        <button
                          type="button"
                          className="gov-ghost-btn slim"
                          disabled={!!busyAction || item.isClosed}
                          onClick={(event) => {
                            event.stopPropagation();
                            closeFinancialYear(item._id || item.id);
                          }}
                        >
                          بستن
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="gov-card" data-span="7" data-budget-summary-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>بودجه در برابر عملکرد واقعی</strong>
                  <span>اهداف سالانه، عملکرد زنده مصارف و درآمد، و وضعیت ذخیره خزانه برای سال مالی انتخاب شده.</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.expenseVariance || 0) > 0 && (budgetVsActual.summary?.annualExpenseBudget || 0) > 0 ? 'rose' : 'teal'}>
                  <span>بودجه مصارف</span>
                  <strong>{formatMoney(budgetVsActual.summary?.annualExpenseBudget || 0)}</strong>
                  <small>Actual {formatMoney(budgetVsActual.summary?.actualExpense || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.incomeVariance || 0) < 0 && (budgetVsActual.summary?.annualIncomeTarget || 0) > 0 ? 'copper' : 'mint'}>
                  <span>هدف درآمد</span>
                  <strong>{formatMoney(budgetVsActual.summary?.annualIncomeTarget || 0)}</strong>
                  <small>Actual {formatMoney(budgetVsActual.summary?.actualIncome || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.treasuryReserveVariance || 0) < 0 && (budgetVsActual.summary?.treasuryReserveTarget || 0) > 0 ? 'copper' : 'sand'}>
                  <span>هدف ذخیره</span>
                  <strong>{formatMoney(budgetVsActual.summary?.treasuryReserveTarget || 0)}</strong>
                  <small>Balance {formatMoney(budgetVsActual.summary?.treasuryReserveBalance || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.overBudgetCategoryCount || 0) > 0 || (budgetVsActual.summary?.unbudgetedCategoryCount || 0) > 0 ? 'rose' : 'mint'}>
                  <span>فشار دسته‌بندی</span>
                  <strong>{formatNumber((budgetVsActual.summary?.overBudgetCategoryCount || 0) + (budgetVsActual.summary?.unbudgetedCategoryCount || 0))}</strong>
                  <small>{formatNumber(budgetVsActual.summary?.watchCategoryCount || 0)} watch item(s)</small>
                </div>
              </div>
              {!budgetVsActual.alerts?.length ? (
                <div className="gov-readiness-good">سال مالی انتخاب شده در حال حاضر با اهداف بودجه تنظیم شده هماهنگ است.</div>
              ) : (
                <ul className="gov-readiness-list">
                  {budgetVsActual.alerts.map((item) => (
                    <li key={item.key} className="gov-readiness-item">
                      <strong>{item.title || item.key}</strong>
                      <span>{item.detail || ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="gov-card" data-span="5" data-budget-config-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>کنترل‌های بودجه</strong>
                  <span>اهداف بودجه برای سال مالی انتخاب شده را ذخیره کنید.</span>
                </div>
              </div>
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>هدف سالانه درآمد</span>
                  <input name="annualIncomeTarget" value={selectedYearBudgetDraft.annualIncomeTarget} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
                <label className="gov-field">
                  <span>بودجه سالانه مصارف</span>
                  <input name="annualExpenseBudget" value={selectedYearBudgetDraft.annualExpenseBudget} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
                <label className="gov-field">
                  <span>هدف ماهانه درآمد</span>
                  <input name="monthlyIncomeTarget" value={selectedYearBudgetDraft.monthlyIncomeTarget} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
                <label className="gov-field">
                  <span>بودجه ماهانه مصارف</span>
                  <input name="monthlyExpenseBudget" value={selectedYearBudgetDraft.monthlyExpenseBudget} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
                <label className="gov-field">
                  <span>هدف ذخیره خزانه</span>
                  <input name="treasuryReserveTarget" value={selectedYearBudgetDraft.treasuryReserveTarget} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
                <label className="gov-field gov-field-full">
                  <span>یادداشت بودجه</span>
                  <input name="note" value={selectedYearBudgetDraft.note} onChange={handleSelectedYearBudgetDraftChange} />
                </label>
              </div>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-budget-save="true"
                  onClick={saveSelectedFinancialYearBudget}
                  disabled={!!busyAction || !selectedFinancialYearId || selectedFinancialYear?.isClosed}
                >
                  {String(busyAction || '').startsWith('save-budget-') ? 'در حال ذخیره بودجه...' : 'ذخیره اهداف بودجه'}
                </button>
              </div>
            </article>

            <article className="gov-card" data-span="12" data-budget-approval-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>گردش کار تایید بودجه</strong>
                  <span>ارسال برای بررسی، تایید مرحله‌ای، و ثبت trail رسمی بودجه سال مالی.</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone={selectedBudgetApproval.stage === 'approved' ? 'mint' : selectedBudgetApproval.stage === 'rejected' ? 'rose' : selectedBudgetApproval.stage.includes('review') ? 'copper' : 'slate'}>
                  <span>مرحله فعلی</span>
                  <strong>{resolveBudgetApprovalStageLabel(selectedBudgetApproval.stage)}</strong>
                  <small>{selectedBudgetApproval.configured ? 'بودجه تنظیم شد' : 'هنوز بودجه‌ای تنظیم نشده است'}</small>
                </div>
                <div className="gov-governance-stat" data-tone="teal">
                  <span>ارسال شده</span>
                  <strong>{selectedBudgetApproval.submittedAt ? toLocaleDateTime(selectedBudgetApproval.submittedAt) : '---'}</strong>
                  <small>{selectedBudgetApproval.submittedBy?.name || '---'}</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>تایید شده</span>
                  <strong>{selectedBudgetApproval.approvedAt ? toLocaleDateTime(selectedBudgetApproval.approvedAt) : '---'}</strong>
                  <small>{selectedBudgetApproval.approvedBy?.name || '---'}</small>
                </div>
                <div className="gov-governance-stat" data-tone={selectedBudgetApproval.rejectReason ? 'rose' : 'sand'}>
                  <span>ردپا</span>
                  <strong>{formatNumber((selectedBudgetApproval.trail || []).length)}</strong>
                  <small>{selectedBudgetApproval.rejectReason || 'No rejection reason'}</small>
                </div>
              </div>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-budget-request-review="true"
                  onClick={requestBudgetReview}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetApproval.configured || selectedFinancialYear?.isClosed || selectedBudgetApproval.stage.includes('review') || selectedBudgetApproval.stage === 'approved'}
                >
                  {String(busyAction || '').startsWith('budget-review-request-') ? 'در حال ارسال...' : 'ارسال بودجه برای بررسی'}
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  data-budget-approve="true"
                  onClick={() => reviewBudgetApproval('approve')}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetApproval.stage.includes('review')}
                >
                  تایید مرحله بودجه
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  data-budget-reject="true"
                  onClick={() => reviewBudgetApproval('reject')}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetApproval.stage.includes('review')}
                >
                  رد بودجه
                </button>
              </div>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-ghost-btn"
                  data-budget-start-revision="true"
                  onClick={startBudgetRevision}
                  disabled={!!busyAction || !selectedFinancialYearId || !canStartBudgetRevision}
                >
                  {busyAction === `budget-start-revision-${selectedFinancialYearId}` ? 'در حال شروع بازنگری...' : 'شروع بازنگری'}
                </button>
              </div>
              <div className="gov-mini-stack" data-budget-revision-summary="true">
                <div className="gov-mini-stat" data-tone="teal">
                  <span>نسخه فعلی</span>
                  <strong>{formatNumber(selectedBudgetVersion)}</strong>
                </div>
                <div className="gov-mini-stat" data-tone={selectedBudgetLastApprovedVersion > 0 ? 'mint' : 'sand'}>
                  <span>آخرین نسخه تایید شده</span>
                  <strong>{formatNumber(selectedBudgetLastApprovedVersion)}</strong>
                </div>
                <div className="gov-mini-stat" data-tone={budgetRevisionHistory.length ? 'copper' : 'sand'}>
                  <span>رویدادهای بازنگری</span>
                  <strong>{formatNumber(budgetRevisionHistory.length)}</strong>
                </div>
                <div className="gov-mini-stat" data-tone={selectedBudgetApproval.frozenAt ? 'slate' : 'sand'}>
                  <span>بسته شده</span>
                  <strong>{selectedBudgetApproval.frozenAt ? toLocaleDateTime(selectedBudgetApproval.frozenAt) : '---'}</strong>
                </div>
              </div>
              {budgetRevisionHistory.length ? (
                <div className="gov-table-wrap" data-budget-revision-history="true">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>بازنگری</th>
                        <th>انتقال</th>
                        <th>اقدام</th>
                        <th>توسط</th>
                        <th>در تاریخ</th>
                        <th>Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetRevisionHistory.slice().reverse().map((entry, index) => (
                        <tr key={`budget-revision-${index}`}>
                          <td>{formatNumber(entry.revisionNumber || entry.toVersion || 0)}</td>
                          <td>{formatNumber(entry.fromVersion || 0)} -&gt; {formatNumber(entry.toVersion || 0)}</td>
                          <td>{entry.action || '---'}</td>
                          <td>{entry.by?.name || '---'}</td>
                          <td>{toLocaleDateTime(entry.at)}</td>
                          <td>{entry.note || entry.reason || '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!selectedBudgetApproval.trail?.length ? (
                <div className="gov-empty-state compact">هنوز trail رسمی برای بودجه این سال مالی ثبت نشده است.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>سطح</th>
                        <th>اقدام</th>
                        <th>توسط</th>
                        <th>در تاریخ</th>
                        <th>Note / reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedBudgetApproval.trail || []).slice().reverse().map((entry, index) => (
                        <tr key={`budget-trail-${index}`}>
                          <td>{entry.level || '---'}</td>
                          <td>{entry.action || '---'}</td>
                          <td>{entry.by?.name || '---'}</td>
                          <td>{toLocaleDateTime(entry.at)}</td>
                          <td>{entry.note || entry.reason || '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="gov-card" data-span="12" data-budget-category-table="true">
              <div className="gov-card-head">
                <div>
                  <strong>بودجه بر اساس دسته‌بندی مصرف</strong>
                  <span>محدودیت‌های سالانه و ماهانه، آستانه‌های هشدار، و استفاده واقعی بر اساس دسته‌بندی مصرف.</span>
                </div>
              </div>
              {!expenseCategoryRegistry.length ? (
                <div className="gov-empty-state">هیچ دسته‌بندی مصرفی برای پیکربندی بودجه در دسترس نیست.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>دسته‌بندی</th>
                        <th>بودجه سالانه</th>
                        <th>بودجه ماهانه</th>
                        <th>Threshold %</th>
                        <th>واقعی</th>
                        <th>وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseCategoryRegistry.map((item) => {
                        const key = String(item?.key || '').trim().toLowerCase();
                        const draftBucket = selectedYearBudgetDraft.categoryBudgets?.[key] || {};
                        const budgetRow = (budgetVsActual.categories || []).find((entry) => String(entry.categoryKey || '').trim().toLowerCase() === key) || null;
                        const statusTone = budgetRow?.status === 'over_budget'
                          ? 'rose'
                          : budgetRow?.status === 'unbudgeted'
                            ? 'copper'
                            : budgetRow?.status === 'watch'
                              ? 'sand'
                              : 'mint';
                        return (
                          <tr key={item._id || item.key}>
                            <td>
                              <div className="gov-table-stack">
                                <strong>{item.label || item.key}</strong>
                                <span>{formatMoney(budgetRow?.actualAmount || 0)}</span>
                              </div>
                            </td>
                            <td>
                              <input
                                data-budget-annual={item.key}
                                value={draftBucket.annualBudget || ''}
                                onChange={(event) => handleSelectedYearCategoryBudgetChange(key, 'annualBudget', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                value={draftBucket.monthlyBudget || ''}
                                onChange={(event) => handleSelectedYearCategoryBudgetChange(key, 'monthlyBudget', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                value={draftBucket.alertThresholdPercent || '85'}
                                onChange={(event) => handleSelectedYearCategoryBudgetChange(key, 'alertThresholdPercent', event.target.value)}
                              />
                            </td>
                            <td>{formatMoney(budgetRow?.actualAmount || 0)}</td>
                            <td>
                              <span className="gov-status-badge subtle" data-tone={statusTone}>
                                {BUDGET_STATUS_LABELS[budgetRow?.status] || BUDGET_STATUS_LABELS.no_budget}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>ایجاد سال مالی جدید</strong>
                  <span>ثبت سال مالی تازه برای همان سال تعلیمی انتخاب‌شده</span>
                </div>
              </div>
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>عنوان</span>
                  <input name="title" value={financialYearDraft.title} onChange={handleFinancialYearDraftChange} />
                </label>
                <label className="gov-field">
                  <span>کد</span>
                  <input name="code" value={financialYearDraft.code} onChange={handleFinancialYearDraftChange} />
                </label>
                <label className="gov-field">
                  <span>تاریخ شروع</span>
                  <input type="date" name="startDate" value={financialYearDraft.startDate} onChange={handleFinancialYearDraftChange} />
                  <small>{financialYearDraft.startDate ? `هجری شمسی: ${toFaDate(financialYearDraft.startDate)}` : 'تاریخ شروع انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>تاریخ ختم</span>
                  <input type="date" name="endDate" value={financialYearDraft.endDate} onChange={handleFinancialYearDraftChange} />
                  <small>{financialYearDraft.endDate ? `هجری شمسی: ${toFaDate(financialYearDraft.endDate)}` : 'تاریخ ختم انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>فیصدی روزانه</span>
                  <input name="dailyFeePercent" value={financialYearDraft.dailyFeePercent} onChange={handleFinancialYearDraftChange} />
                </label>
                <label className="gov-field">
                  <span>فیصدی سالانه</span>
                  <input name="yearlyFeePercent" value={financialYearDraft.yearlyFeePercent} onChange={handleFinancialYearDraftChange} />
                </label>
                <label className="gov-field gov-field-full">
                  <span>یادداشت</span>
                  <input name="note" value={financialYearDraft.note} onChange={handleFinancialYearDraftChange} />
                </label>
              </div>
              <label className="gov-toggle">
                <input type="checkbox" name="isActive" checked={financialYearDraft.isActive} onChange={handleFinancialYearDraftChange} />
                <span>به عنوان سال مالی فعال ذخیره شود</span>
              </label>
              <div className="gov-card-actions">
                <button type="button" className="gov-primary-btn" onClick={submitFinancialYear} disabled={!!busyAction}>
                  {busyAction === 'save-year' ? 'در حال ذخیره...' : 'ذخیره سال مالی'}
                </button>
              </div>
            </article>

            <article className="gov-card" data-span="7">
              <div className="gov-card-head">
                <div>
                  <strong>گارد بستن سال</strong>
                  <span>موانعی که باید پیش از بستن سال مالی رفع شوند</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone="teal">
                  <span>پیش‌نویس</span>
                  <strong>{formatNumber(expenseCloseReadiness?.counts?.draft || 0)}</strong>
                  <small>نیازمند ارسال</small>
                </div>
                <div className="gov-governance-stat" data-tone="copper">
                  <span>در انتظار بررسی</span>
                  <strong>{formatNumber(expenseCloseReadiness?.counts?.pendingReview || 0)}</strong>
                  <small>نیازمند تایید</small>
                </div>
                <div className="gov-governance-stat" data-tone="rose">
                  <span>رد شده</span>
                  <strong>{formatNumber(expenseCloseReadiness?.counts?.rejected || 0)}</strong>
                  <small>نیازمند اصلاح</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>تایید شده</span>
                  <strong>{formatNumber(expenseCloseReadiness?.counts?.approved || 0)}</strong>
                  <small>آماده آرشیف</small>
                </div>
              </div>
              {!expenseCloseReadinessBlockers.length ? (
                <div className="gov-readiness-good">این سال مالی از نگاه مدیریت مصارف آماده بسته‌شدن است.</div>
              ) : (
                <ul className="gov-readiness-list">
                  {expenseCloseReadinessBlockers.map((item) => (
                    <li key={item} className="gov-readiness-item">{item}</li>
                  ))}
                </ul>
              )}
            </article>

              </section>
            ) : null}

            {activeTab === 'operations' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>عملیات مصارف و صف بررسی</strong>
                  <span>ثبت مصرف، رجیستری دسته‌ها، صف تایید، و مرور آخرین ردیف‌ها در یک بخش مستقل از گزارش و آرشیف</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone="teal">
                  <span>کل ثبت‌شده</span>
                  <strong>{formatMoney(expenseGovernanceSummary.totalAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.totalCount || 0)} ردیف</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>تاییدشده</span>
                  <strong>{formatMoney(expenseGovernanceSummary.approvedAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.statusCounts?.approved || 0)} ردیف</small>
                </div>
                <div className="gov-governance-stat" data-tone="copper">
                  <span>در انتظار بررسی</span>
                  <strong>{formatMoney(expenseGovernanceSummary.pendingAmount || 0)}</strong>
                  <small>{formatNumber(expenseGovernanceSummary.queueCount || 0)} مورد</small>
                </div>
                <div className="gov-governance-stat" data-tone={expenseCloseReadiness?.canClose ? 'mint' : 'rose'}>
                  <span>گارد بستن سال</span>
                  <strong>{expenseCloseReadiness?.canClose ? 'آماده' : 'متوقف'}</strong>
                  <small>{formatNumber(expenseCloseReadiness?.blockerCount || 0)} مانع</small>
                </div>
              </div>
            </article>

            <article className="gov-card" data-span="5">
              <HorizontalBars
                title="ترکیب دسته‌های مصرف"
                subtitle="سهم دسته‌های رسمی در scope فعلی"
                items={expenseBreakdown}
                accent="copper"
              />
            </article>

            <article className="gov-card" data-span="4">
              <ExpenseMonthlyBars items={expenseMonthlyBreakdown} />
            </article>

            <article className="gov-card" data-span="3">
              <HorizontalBars
                title="فروشندگان برجسته"
                subtitle="بزرگ‌ترین فروشندگان ثبت‌شده"
                items={expenseVendorBreakdown}
                accent="rose"
              />
            </article>

            <article className="gov-card" data-span="7" data-procurement-registry-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>تعهدات فروشنده</strong>
                  <span>تعهدات خرید و وندرها با مبلغ committed، پوشش‌شده، و مانده exposure.</span>
                </div>
              </div>
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone="teal">
                  <span>کل متعهد شده</span>
                  <strong>{formatMoney(procurementSummary.totalCommittedAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.totalCount || 0)} commitment(s)</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>پوشش داده شده توسط مصرف</span>
                  <strong>{formatMoney(procurementSummary.totalApprovedExpenseAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.approvedCount || 0)} approved</small>
                </div>
                <div className="gov-governance-stat" data-tone={(procurementSummary.totalOutstandingAmount || 0) > 0 ? 'copper' : 'sand'}>
                  <span>تعهدات باقیمانده</span>
                  <strong>{formatMoney(procurementSummary.totalOutstandingAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.openCommitmentCount || 0)} open</small>
                </div>
                <div className="gov-governance-stat" data-tone="rose">
                  <span>فروشندگان</span>
                  <strong>{formatNumber(procurementSummary.vendorCount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.pendingReviewCount || 0)} in review</small>
                </div>
              </div>
              {!procurementItems.length ? (
                <div className="gov-empty-state">هنوز هیچ تعهد خریدی برای این فیلترها ثبت نشده است.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>تعهد</th>
                        <th>فروشنده</th>
                        <th>مبلغ</th>
                        <th>پوشش</th>
                        <th>وضعیت</th>
                        <th>مرحله</th>
                        <th>اقدام</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procurementItems.map((item) => (
                        <tr key={item._id}>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{item.title || '---'}</strong>
                              <span>{resolveProcurementTypeLabel(item.procurementType)} | {item.category || '---'}{item.subCategory ? ` / ${item.subCategory}` : ''}</span>
                            </div>
                          </td>
                          <td>{item.vendorName || '---'}</td>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{formatMoney(item.committedAmount || 0)}</strong>
                              <span>{formatMoney(item.outstandingAmount || 0)} مانده</span>
                            </div>
                          </td>
                          <td>{formatMoney(item.approvedExpenseAmount || 0)} / {formatNumber(item.fulfillmentPercent || 0)}%</td>
                          <td><ProcurementStatusBadge status={item.status} /></td>
                          <td><ProcurementStageBadge stage={item.approvalStage} /></td>
                          <td>
                            <div className="gov-action-stack">
                              {(item.status === 'draft' || item.status === 'rejected') ? (
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-procurement-submit={item._id}
                                  disabled={!!busyAction}
                                  onClick={() => submitProcurementForReview(item._id)}
                                >
                                  ارسال برای بررسی
                                </button>
                              ) : null}
                              {item.status === 'pending_review' ? (
                                <>
                                  <button
                                    type="button"
                                    className="gov-inline-action"
                                    data-procurement-approve={item._id}
                                    disabled={!!busyAction}
                                    onClick={() => reviewProcurement(item._id, 'approve')}
                                  >
                                    تایید مرحله
                                  </button>
                                  <button
                                    type="button"
                                    className="gov-inline-action"
                                    data-procurement-reject={item._id}
                                    disabled={!!busyAction}
                                    onClick={() => reviewProcurement(item._id, 'reject')}
                                  >
                                    رد
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="gov-card" data-span="5" data-procurement-settlement-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>تصفیه فروشنده</strong>
                  <span>Post treasury-backed settlement against approved commitments that are ready to pay.</span>
                </div>
              </div>
              {!settlementReadyProcurementOptions.length ? (
                <div className="gov-empty-state">هیچ تعهد تدارکاتی تایید شده‌ای در حال حاضر برای تصفیه آماده نیست.</div>
              ) : (
                <>
                  <div className="gov-form-grid">
                    <label className="gov-field gov-field-full">
                      <span>تعهد</span>
                      <select name="commitmentId" value={procurementSettlementDraft.commitmentId} onChange={handleProcurementSettlementDraftChange}>
                        {settlementReadyProcurementOptions.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.title || item.vendorName || item._id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مبلغ</span>
                      <input name="amount" value={procurementSettlementDraft.amount} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>تاریخ تصفیه</span>
                      <input type="date" name="settlementDate" value={procurementSettlementDraft.settlementDate} onChange={handleProcurementSettlementDraftChange} />
                      <small>{procurementSettlementDraft.settlementDate ? `هجری شمسی: ${toFaDate(procurementSettlementDraft.settlementDate)}` : 'تاریخ تسویه انتخاب نشده است.'}</small>
                    </label>
                    <label className="gov-field">
                      <span>حساب خزانه</span>
                      <select name="treasuryAccountId" value={procurementSettlementDraft.treasuryAccountId} onChange={handleProcurementSettlementDraftChange}>
                        <option value="">انتخاب حساب</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.title || item.code || item._id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مرجع</span>
                      <input name="referenceNo" value={procurementSettlementDraft.referenceNo} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت</span>
                      <input name="note" value={procurementSettlementDraft.note} onChange={handleProcurementSettlementDraftChange} />
                    </label>
                  </div>
                  {selectedProcurementSettlement ? (
                    <div className="gov-mini-stack" data-procurement-settlement-summary="true">
                      <div className="gov-mini-stat" data-tone="teal">
                        <span>آماده پرداخت</span>
                        <strong>{formatMoney(selectedProcurementSettlement.payableReadyAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone="copper">
                        <span>قبلاً تصفیه شده</span>
                        <strong>{formatMoney(selectedProcurementSettlement.settledAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone="sand">
                        <span>باقیمانده</span>
                        <strong>{formatMoney(selectedProcurementSettlement.settlementBalanceAmount || 0)}</strong>
                      </div>
                      <div className="gov-mini-stat" data-tone={Number(selectedProcurementSettlement.settlementCount || 0) > 0 ? 'mint' : 'sand'}>
                        <span>تعداد تصفیه</span>
                        <strong>{formatNumber(selectedProcurementSettlement.settlementCount || 0)}</strong>
                      </div>
                    </div>
                  ) : null}
                  {selectedProcurementSettlement?.settlements?.length ? (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>مرجع</th>
                            <th>مبلغ</th>
                            <th>حساب</th>
                            <th>تاریخ</th>
                            <th>توسط</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedProcurementSettlement.settlements || []).slice().reverse().map((entry, index) => (
                            <tr key={`procurement-settlement-${index}`}>
                              <td>{entry.referenceNo || '---'}</td>
                              <td>{formatMoney(entry.amount || 0)}</td>
                              <td>{entry.treasuryAccount?.title || entry.treasuryAccount?.code || '---'}</td>
                              <td>{toLocaleDateTime(entry.settlementDate || entry.createdAt)}</td>
                              <td>{entry.createdBy?.name || '---'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-procurement-settlement-save="true"
                      onClick={submitProcurementSettlement}
                      disabled={!!busyAction || !selectedProcurementSettlement || !procurementSettlementDraft.amount || !procurementSettlementDraft.treasuryAccountId}
                    >
                      {String(busyAction || '').startsWith('procurement-settlement-') ? 'ثبت تصفیه...' : 'تصفیه پرداخت فروشنده'}
                    </button>
                  </div>
                </>
              )}
            </article>

            <article className="gov-card" data-span="5" data-procurement-form-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>ثبت تعهد</strong>
                  <span>تعهد خرید، فروشنده، مبلغ، و تاریخ مورد انتظار را ثبت کنید.</span>
                </div>
              </div>
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>عنوان</span>
                  <input name="title" value={procurementDraft.title} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>Vendor</span>
                  <input name="vendorName" value={procurementDraft.vendorName} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>نوع</span>
                  <select name="procurementType" value={procurementDraft.procurementType} onChange={handleProcurementDraftChange}>
                    {Object.entries(PROCUREMENT_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>Category</span>
                  <select name="category" value={procurementDraft.category} onChange={handleProcurementDraftChange}>
                    {expenseCategoryRegistry.map((item) => (
                      <option key={item._id || item.key} value={item.key}>{item.label || item.key}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>Sub-category</span>
                  <select name="subCategory" value={procurementDraft.subCategory} onChange={handleProcurementDraftChange}>
                    <option value="">بدون زیردسته</option>
                    {((expenseCategoryRegistry.find((item) => item.key === procurementDraft.category)?.subCategories || []).filter((item) => item.isActive !== false)).map((item) => (
                      <option key={item.key} value={item.key}>{item.label || item.key}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>مبلغ متعهد شده</span>
                  <input name="committedAmount" value={procurementDraft.committedAmount} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>تاریخ درخواست</span>
                  <input type="date" name="requestDate" value={procurementDraft.requestDate} onChange={handleProcurementDraftChange} />
                  <small>{procurementDraft.requestDate ? `هجری شمسی: ${toFaDate(procurementDraft.requestDate)}` : 'تاریخ درخواست انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>تاریخ تحویل مورد انتظار</span>
                  <input type="date" name="expectedDeliveryDate" value={procurementDraft.expectedDeliveryDate} onChange={handleProcurementDraftChange} />
                  <small>{procurementDraft.expectedDeliveryDate ? `هجری شمسی: ${toFaDate(procurementDraft.expectedDeliveryDate)}` : 'تاریخ تحویل انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>حساب خزانه</span>
                  <select name="treasuryAccountId" value={procurementDraft.treasuryAccountId} onChange={handleProcurementDraftChange}>
                    <option value="">بدون پیشنهاد حساب</option>
                    {treasuryAccounts.map((item) => (
                      <option key={item._id || item.id} value={item._id || item.id}>
                        {item.title || item.code || item._id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>مرجع</span>
                  <input name="referenceNo" value={procurementDraft.referenceNo} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>Payment terms</span>
                  <input name="paymentTerms" value={procurementDraft.paymentTerms} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>Status</span>
                  <select name="status" value={procurementDraft.status} onChange={handleProcurementDraftChange}>
                    <option value="draft">پیش‌نویس</option>
                    <option value="pending_review">ارسال برای بررسی</option>
                  </select>
                </label>
                <label className="gov-field gov-field-full">
                  <span>Description</span>
                  <input name="description" value={procurementDraft.description} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field gov-field-full">
                  <span>یادداشت</span>
                  <input name="note" value={procurementDraft.note} onChange={handleProcurementDraftChange} />
                </label>
              </div>
              {!procurementVendors.length ? null : (
                <div className="gov-subcategory-list">
                  {procurementVendors.slice(0, 4).map((item) => (
                    <span key={item.vendorName} className="gov-subcategory-pill">
                      {item.vendorName}: {formatMoney(item.outstandingAmount || 0)}
                    </span>
                  ))}
                </div>
              )}
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-procurement-save="true"
                  onClick={submitProcurement}
                  disabled={!!busyAction}
                >
                  {busyAction === 'save-procurement' ? 'در حال ذخیره...' : 'ثبت تعهد خرید'}
                </button>
              </div>
            </article>

            <article className="gov-card" data-span="7">
              <div className="gov-card-head">
                <div>
                  <strong>رجیستری رسمی دسته‌های مصرف</strong>
                  <span>دسته‌ها و زیردسته‌های معتبر برای ثبت و تحلیل مصارف</span>
                </div>
              </div>
              {!expenseCategoryRegistry.length ? (
                <div className="gov-empty-state">هنوز هیچ دسته مصرف رسمی ثبت نشده است.</div>
              ) : (
                <div className="gov-category-registry">
                  {expenseCategoryRegistry.map((item) => (
                    <article key={item._id || item.key} className="gov-category-card" data-tone={item.colorTone || 'teal'}>
                      <div className="gov-category-card-head">
                        <div>
                          <strong>{item.label || item.key}</strong>
                          <span>{item.description || 'توضیحی ثبت نشده است.'}</span>
                        </div>
                        <div className="gov-pill-row">
                          <CategoryToneBadge tone={item.colorTone || 'teal'} />
                          <ExpenseStatusBadge status={item.isActive === false ? 'void' : 'approved'} />
                        </div>
                      </div>
                      <div className="gov-subcategory-list">
                        {(item.subCategories || []).map((subItem) => (
                          <span key={`${item.key}-${subItem.key}`} className="gov-subcategory-pill">
                            {subItem.label || subItem.key}
                          </span>
                        ))}
                      </div>
                      <div className="gov-card-actions">
                        <button
                          type="button"
                          className="gov-ghost-btn slim"
                          data-expense-category-edit={item.key}
                          onClick={() => editExpenseCategory(item)}
                          disabled={!!busyAction}
                        >
                          ویرایش رجیستری
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </article>

            <article className="gov-card" data-span="5">
              <div className="gov-card-head">
                <div>
                  <strong>{categoryDraft.id ? 'ویرایش دسته رسمی' : 'ایجاد دسته رسمی'}</strong>
                  <span>این تغییرات فوراً روی اعتبارسنجی و تحلیل مصارف اثر می‌گذارند.</span>
                </div>
              </div>
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>عنوان</span>
                  <input name="label" value={categoryDraft.label} onChange={handleCategoryDraftChange} />
                </label>
                <label className="gov-field">
                  <span>کلید</span>
                  <input
                    name="key"
                    value={categoryDraft.key}
                    onChange={handleCategoryDraftChange}
                    disabled={Boolean(editingExpenseCategory?.isSystem)}
                  />
                </label>
                <label className="gov-field gov-field-full">
                  <span>توضیح</span>
                  <input name="description" value={categoryDraft.description} onChange={handleCategoryDraftChange} />
                </label>
                <label className="gov-field">
                  <span>رنگ</span>
                  <select name="colorTone" value={categoryDraft.colorTone} onChange={handleCategoryDraftChange}>
                    {CATEGORY_TONE_OPTIONS.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field gov-field-full">
                  <span>زیردسته‌ها</span>
                  <textarea
                    name="subCategoriesText"
                    value={categoryDraft.subCategoriesText}
                    onChange={handleCategoryDraftChange}
                    rows={5}
                    placeholder={'استادان\nکارمندان\nتشویقی'}
                  />
                </label>
              </div>
              <label className="gov-toggle">
                <input type="checkbox" name="isActive" checked={categoryDraft.isActive} onChange={handleCategoryDraftChange} />
                <span>این دسته برای ثبت‌های بعدی فعال بماند</span>
              </label>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-expense-category-save="true"
                  onClick={submitExpenseCategory}
                  disabled={!!busyAction}
                >
                  {busyAction === 'create-expense-category' || String(busyAction).startsWith('update-expense-category-')
                    ? 'در حال ذخیره...'
                    : (categoryDraft.id ? 'به‌روزرسانی رجیستری' : 'ذخیره رجیستری')}
                </button>
                <button type="button" className="gov-ghost-btn" onClick={resetExpenseCategoryDraft} disabled={!!busyAction}>
                  پاک‌کردن فرم
                </button>
              </div>
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>صف بررسی مصارف</strong>
                  <span>پیش‌نویس‌ها، موارد ردشده، و ثبت‌های در انتظار بررسی</span>
                </div>
              </div>
              {!expenseQueueRows.length ? (
                <div className="gov-empty-state">در scope فعلی هیچ ردیف مصرفی در انتظار اقدام نیست.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>دسته</th>
                        <th>فروشنده</th>
                        <th>مبلغ</th>
                        <th>وضعیت</th>
                        <th>مرحله</th>
                        <th>اقدام</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenseQueueRows.map((row) => (
                        <tr key={`queue-${row._id}`}>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{row.category || '---'}</strong>
                              <span>{row.subCategory || 'بدون زیردسته'}</span>
                            </div>
                          </td>
                          <td>{row.vendorName || 'بدون فروشنده'}</td>
                          <td>{formatMoney(row.amount)}</td>
                          <td><ExpenseStatusBadge status={row.status} /></td>
                          <td><ExpenseStageBadge stage={row.approvalStage} /></td>
                          <td>
                            <div className="gov-action-stack">
                              {(row.status === 'draft' || row.status === 'rejected') ? (
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-expense-submit={row._id}
                                  disabled={!!busyAction}
                                  onClick={() => submitExpenseForReview(row._id)}
                                >
                                  ارسال برای بررسی
                                </button>
                              ) : null}
                              {row.status === 'pending_review' ? (
                                <>
                                  <button
                                    type="button"
                                    className="gov-inline-action"
                                    data-expense-review-approve={row._id}
                                    disabled={!!busyAction}
                                    onClick={() => reviewExpense(row._id, 'approve')}
                                  >
                                    تایید مرحله
                                  </button>
                                  <button
                                    type="button"
                                    className="gov-inline-action"
                                    data-expense-review-reject={row._id}
                                    disabled={!!busyAction}
                                    onClick={() => reviewExpense(row._id, 'reject')}
                                  >
                                    رد
                                  </button>
                                </>
                              ) : null}
                              {row.status !== 'void' && row.status !== 'approved' ? (
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-expense-void={row._id}
                                  disabled={!!busyAction}
                                  onClick={() => voidExpense(row._id)}
                                >
                                  باطل
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="gov-card" data-span="12">
              <div className="gov-card-head">
                <div>
                  <strong>دفتر ثبت مصارف</strong>
                  <span>ثبت ردیف تازه و مرور آخرین ردیف‌های scope فعلی</span>
                </div>
              </div>
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>دسته</span>
                  <select name="category" value={expenseDraft.category} onChange={handleExpenseDraftChange}>
                    {expenseCategoryRegistry.map((item) => (
                      <option key={item._id || item.key} value={item.key}>{item.label || item.key}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>حساب خزانه</span>
                  <select name="treasuryAccountId" value={expenseDraft.treasuryAccountId} onChange={handleExpenseDraftChange}>
                    <option value="">بدون اتصال خزانه</option>
                    {treasuryAccounts.map((item) => (
                      <option key={item._id || item.id} value={item._id || item.id}>
                        {item.title || item.code || item._id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>زیردسته</span>
                  <select name="subCategory" value={expenseDraft.subCategory} onChange={handleExpenseDraftChange}>
                    <option value="">بدون زیردسته</option>
                    {expenseSubCategoryOptions.map((item) => (
                      <option key={item.key} value={item.key}>{item.label || item.key}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>Vendor commitment</span>
                  <select
                    name="procurementCommitmentId"
                    value={expenseDraft.procurementCommitmentId}
                    onChange={handleExpenseDraftChange}
                  >
                    <option value="">No linked commitment</option>
                    {approvedProcurementOptions.map((item) => (
                      <option key={item._id || item.id} value={item._id || item.id}>
                        {item.title || item.vendorName || item._id} | {formatMoney(item.outstandingAmount || item.committedAmount || 0)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>مبلغ</span>
                  <input name="amount" value={expenseDraft.amount} onChange={handleExpenseDraftChange} />
                </label>
                <label className="gov-field">
                  <span>تاریخ مصرف</span>
                  <input type="date" name="expenseDate" value={expenseDraft.expenseDate} onChange={handleExpenseDraftChange} />
                  <small>{expenseDraft.expenseDate ? `هجری شمسی: ${toFaDate(expenseDraft.expenseDate)}` : 'تاریخ مصرف انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>روش پرداخت</span>
                  <select name="paymentMethod" value={expenseDraft.paymentMethod} onChange={handleExpenseDraftChange}>
                    <option value="manual">دستی</option>
                    <option value="cash">نقدی</option>
                    <option value="bank_transfer">انتقال بانکی</option>
                    <option value="hawala">حواله</option>
                    <option value="other">سایر</option>
                  </select>
                </label>
                <label className="gov-field">
                  <span>وضعیت</span>
                  <select name="status" value={expenseDraft.status} onChange={handleExpenseDraftChange}>
                    <option value="draft">پیش‌نویس</option>
                    <option value="pending_review">ارسال برای بررسی</option>
                  </select>
                </label>
                <label className="gov-field">
                  <span>فروشنده</span>
                  <input name="vendorName" value={expenseDraft.vendorName} onChange={handleExpenseDraftChange} />
                </label>
                <label className="gov-field">
                  <span>مرجع</span>
                  <input name="referenceNo" value={expenseDraft.referenceNo} onChange={handleExpenseDraftChange} />
                </label>
                <label className="gov-field gov-field-full">
                  <span>یادداشت</span>
                  <input name="note" value={expenseDraft.note} onChange={handleExpenseDraftChange} />
                </label>
              </div>
              <div className="gov-card-actions">
                <button type="button" className="gov-primary-btn" onClick={submitExpense} disabled={!!busyAction}>
                  {busyAction === 'save-expense' ? 'در حال ذخیره...' : 'ثبت مصرف'}
                </button>
              </div>

              {!archivePreview.length ? (
                <div className="gov-empty-state">هنوز هیچ ردیف مصرفی برای این فیلترها ثبت نشده است.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>دسته</th>
                        <th>فروشنده</th>
                        <th>مبلغ</th>
                        <th>تاریخ</th>
                        <th>وضعیت</th>
                        <th>مرحله</th>
                        <th>ردپای بررسی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {archivePreview.map((row) => (
                        <tr key={row._id}>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{row.category || '---'}</strong>
                              <span>{row.subCategory || 'بدون زیردسته'}</span>
                            </div>
                          </td>
                          <td>{row.vendorName || 'بدون فروشنده'}</td>
                          <td>{formatMoney(row.amount)}</td>
                          <td>{toFaDate(row.expenseDate)}</td>
                          <td><ExpenseStatusBadge status={row.status} /></td>
                          <td><ExpenseStageBadge stage={row.approvalStage} /></td>
                          <td>{formatNumber((row.approvalTrail || []).length)} رویداد</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
              </section>
            ) : null}

            {activeTab === 'treasury' ? (
              <section className="gov-content-grid">
                <article className="gov-card" data-span="12">
                  <div className="gov-card-head">
                    <div>
                      <strong>فرماندهی خزانه و صندوق</strong>
                      <span>مانده دفتری، حرکات دستی، انتقال بین حساب‌ها و تطبیق رسمی روی هسته مالی موجود.</span>
                    </div>
                  </div>
                  <div className="gov-governance-grid">
                    <div className="gov-governance-stat" data-tone="teal">
                      <span>مانده دفتری</span>
                      <strong>{formatMoney(treasurySummary.bookBalance || 0)}</strong>
                      <small>{formatNumber(treasurySummary.accountCount || 0)} حساب</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="copper">
                      <span>بانک</span>
                      <strong>{formatMoney(treasurySummary.bankBalance || 0)}</strong>
                      <small>{formatNumber(treasurySummary.transferCount || 0)} انتقال</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="mint">
                      <span>صندوق نقدی</span>
                      <strong>{formatMoney(treasurySummary.cashBalance || 0)}</strong>
                      <small>{formatMoney(treasurySummary.manualInflow || 0)} ورودی</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(treasurySummary.unassignedApprovedExpenseCount || 0) > 0 ? 'rose' : 'sand'}>
                      <span>مصارف بدون حساب</span>
                      <strong>{formatNumber(treasurySummary.unassignedApprovedExpenseCount || 0)}</strong>
                      <small>{formatMoney(treasurySummary.unassignedApprovedExpenseAmount || 0)}</small>
                    </div>
                  </div>
                  {!treasuryAlerts.length ? null : (
                    <div className="gov-subcategory-list">
                      {treasuryAlerts.map((item) => (
                        <span key={item.key} className="gov-subcategory-pill">{item.label}</span>
                      ))}
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="7">
                  <div className="gov-card-head">
                    <div>
                      <strong>رجیستر حساب‌های خزانه</strong>
                      <span>حساب‌های نقدی و بانکی فعال سال مالی با مانده دفتری و آخرین تطبیق.</span>
                    </div>
                  </div>
                  {!treasuryAccounts.length ? (
                    <div className="gov-empty-state">هنوز هیچ حساب خزانه‌ای ثبت نشده است.</div>
                  ) : (
                    <div className="gov-category-registry">
                      {treasuryAccounts.map((item) => (
                        <article key={item._id || item.id} className="gov-category-card" data-tone={item.accountType === 'cashbox' ? 'teal' : item.accountType === 'bank' ? 'copper' : 'slate'}>
                          <div className="gov-category-card-head">
                            <div>
                              <strong>{item.title || item.code}</strong>
                              <span>{item.code || '---'} | {item.accountNoMasked || 'بدون شماره'}</span>
                            </div>
                            <div className="gov-pill-row">
                              <TreasuryAccountTypeBadge accountType={item.accountType} />
                              <ExpenseStatusBadge status={item.isActive === false ? 'void' : 'approved'} />
                            </div>
                          </div>
                          <div className="gov-subcategory-list">
                            <span className="gov-subcategory-pill">مانده: {formatMoney(item.metrics?.bookBalance || 0)}</span>
                            <span className="gov-subcategory-pill">مصارف: {formatMoney(item.metrics?.expenseOutflow || 0)}</span>
                            <span className="gov-subcategory-pill">آخرین تطبیق: {toLocaleDateTime(item.lastReconciledAt) || '---'}</span>
                          </div>
                          <div className="gov-card-actions">
                            <button
                              type="button"
                              className="gov-ghost-btn slim"
                              data-treasury-account-edit={item.code || item._id}
                              onClick={() => editTreasuryAccount(item)}
                              disabled={!!busyAction}
                            >
                              ویرایش حساب
                            </button>
                            <button
                              type="button"
                              className="gov-ghost-btn slim"
                              data-treasury-reconcile-open={item._id}
                              onClick={() => prepareTreasuryReconciliation(item)}
                              disabled={!!busyAction}
                            >
                              تطبیق حساب
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="5">
                  <div className="gov-card-head">
                    <div>
                      <strong>{treasuryAccountDraft.id ? 'ویرایش حساب خزانه' : 'ایجاد حساب خزانه'}</strong>
                      <span>ثبت صندوق نقدی، حساب بانکی یا حساب واسط در همان سال مالی.</span>
                    </div>
                  </div>
                  <div className="gov-form-grid">
                    <label className="gov-field">
                      <span>عنوان</span>
                      <input name="title" value={treasuryAccountDraft.title} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>کد</span>
                      <input name="code" value={treasuryAccountDraft.code} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>نوع حساب</span>
                      <select name="accountType" value={treasuryAccountDraft.accountType} onChange={handleTreasuryAccountDraftChange}>
                        {Object.entries(TREASURY_ACCOUNT_TYPE_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مانده افتتاحیه</span>
                      <input name="openingBalance" value={treasuryAccountDraft.openingBalance} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>واحد پول</span>
                      <input name="currency" value={treasuryAccountDraft.currency} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>مرجع / بانک</span>
                      <input name="providerName" value={treasuryAccountDraft.providerName} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>شعبه</span>
                      <input name="branchName" value={treasuryAccountDraft.branchName} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>شماره حساب</span>
                      <input name="accountNo" value={treasuryAccountDraft.accountNo} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت</span>
                      <input name="note" value={treasuryAccountDraft.note} onChange={handleTreasuryAccountDraftChange} />
                    </label>
                  </div>
                  <label className="gov-toggle">
                    <input type="checkbox" name="isActive" checked={treasuryAccountDraft.isActive} onChange={handleTreasuryAccountDraftChange} />
                    <span>حساب برای عملیات بعدی فعال بماند</span>
                  </label>
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-treasury-account-save="true"
                      onClick={submitTreasuryAccount}
                      disabled={!!busyAction}
                    >
                      {busyAction === 'create-treasury-account' || String(busyAction).startsWith('update-treasury-account-')
                        ? 'در حال ذخیره...'
                        : (treasuryAccountDraft.id ? 'به‌روزرسانی حساب' : 'ذخیره حساب')}
                    </button>
                    <button type="button" className="gov-ghost-btn" onClick={resetTreasuryAccountDraft} disabled={!!busyAction}>
                      پاک‌کردن فرم
                    </button>
                  </div>
                </article>

                <article className="gov-card" data-span="6">
                  <div className="gov-card-head">
                    <div>
                      <strong>حرکت دستی خزانه</strong>
                      <span>واریز، برداشت و اصلاح‌های دستی خارج از چرخه فیس.</span>
                    </div>
                  </div>
                  <div className="gov-form-grid">
                    <label className="gov-field">
                      <span>حساب</span>
                      <select name="accountId" value={treasuryTransactionDraft.accountId} onChange={handleTreasuryTransactionDraftChange}>
                        <option value="">انتخاب حساب</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>{item.title || item.code || item._id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>نوع حرکت</span>
                      <select name="transactionType" value={treasuryTransactionDraft.transactionType} onChange={handleTreasuryTransactionDraftChange}>
                        {['deposit', 'withdrawal', 'adjustment_in', 'adjustment_out'].map((key) => (
                          <option key={key} value={key}>{resolveTreasuryTransactionTypeLabel(key)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مبلغ</span>
                      <input name="amount" value={treasuryTransactionDraft.amount} onChange={handleTreasuryTransactionDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>تاریخ</span>
                      <input type="date" name="transactionDate" value={treasuryTransactionDraft.transactionDate} onChange={handleTreasuryTransactionDraftChange} />
                      <small>{treasuryTransactionDraft.transactionDate ? `هجری شمسی: ${toFaDate(treasuryTransactionDraft.transactionDate)}` : 'تاریخ حرکت انتخاب نشده است.'}</small>
                    </label>
                    <label className="gov-field">
                      <span>مرجع</span>
                      <input name="referenceNo" value={treasuryTransactionDraft.referenceNo} onChange={handleTreasuryTransactionDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت</span>
                      <input name="note" value={treasuryTransactionDraft.note} onChange={handleTreasuryTransactionDraftChange} />
                    </label>
                  </div>
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-treasury-transaction-save="true"
                      onClick={submitTreasuryTransaction}
                      disabled={!!busyAction}
                    >
                      {busyAction === 'create-treasury-transaction' ? 'در حال ثبت...' : 'ثبت حرکت'}
                    </button>
                  </div>
                </article>

                <article className="gov-card" data-span="6">
                  <div className="gov-card-head">
                    <div>
                      <strong>انتقال و تطبیق</strong>
                      <span>جابجایی بین حساب‌ها و بستن فاصله بین مانده دفتری و صورتحساب.</span>
                    </div>
                  </div>
                  <div className="gov-form-grid">
                    <label className="gov-field">
                      <span>حساب مبدا</span>
                      <select name="sourceAccountId" value={treasuryTransferDraft.sourceAccountId} onChange={handleTreasuryTransferDraftChange}>
                        <option value="">انتخاب مبدا</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>{item.title || item.code || item._id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>حساب مقصد</span>
                      <select name="destinationAccountId" value={treasuryTransferDraft.destinationAccountId} onChange={handleTreasuryTransferDraftChange}>
                        <option value="">انتخاب مقصد</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>{item.title || item.code || item._id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مبلغ انتقال</span>
                      <input name="amount" value={treasuryTransferDraft.amount} onChange={handleTreasuryTransferDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>تاریخ انتقال</span>
                      <input type="date" name="transactionDate" value={treasuryTransferDraft.transactionDate} onChange={handleTreasuryTransferDraftChange} />
                      <small>{treasuryTransferDraft.transactionDate ? `هجری شمسی: ${toFaDate(treasuryTransferDraft.transactionDate)}` : 'تاریخ انتقال انتخاب نشده است.'}</small>
                    </label>
                    <label className="gov-field">
                      <span>مرجع انتقال</span>
                      <input name="referenceNo" value={treasuryTransferDraft.referenceNo} onChange={handleTreasuryTransferDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت انتقال</span>
                      <input name="note" value={treasuryTransferDraft.note} onChange={handleTreasuryTransferDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>حساب برای تطبیق</span>
                      <select name="accountId" value={treasuryReconciliationDraft.accountId} onChange={handleTreasuryReconciliationDraftChange}>
                        <option value="">انتخاب حساب</option>
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>{item.title || item.code || item._id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>مانده صورتحساب</span>
                      <input name="statementBalance" value={treasuryReconciliationDraft.statementBalance} onChange={handleTreasuryReconciliationDraftChange} />
                    </label>
                    <label className="gov-field">
                      <span>تاریخ تطبیق</span>
                      <input type="date" name="reconciliationDate" value={treasuryReconciliationDraft.reconciliationDate} onChange={handleTreasuryReconciliationDraftChange} />
                      <small>{treasuryReconciliationDraft.reconciliationDate ? `هجری شمسی: ${toFaDate(treasuryReconciliationDraft.reconciliationDate)}` : 'تاریخ تطبیق انتخاب نشده است.'}</small>
                    </label>
                    <label className="gov-field">
                      <span>مرجع تطبیق</span>
                      <input name="referenceNo" value={treasuryReconciliationDraft.referenceNo} onChange={handleTreasuryReconciliationDraftChange} />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت تطبیق</span>
                      <input name="note" value={treasuryReconciliationDraft.note} onChange={handleTreasuryReconciliationDraftChange} />
                    </label>
                  </div>
                  <label className="gov-toggle">
                    <input type="checkbox" name="applyAdjustment" checked={treasuryReconciliationDraft.applyAdjustment} onChange={handleTreasuryReconciliationDraftChange} />
                    <span>در صورت مغایرت، اصلاح تطبیق هم ثبت شود</span>
                  </label>
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-treasury-transfer-save="true"
                      onClick={submitTreasuryTransfer}
                      disabled={!!busyAction}
                    >
                      {busyAction === 'create-treasury-transfer' ? 'در حال ثبت...' : 'ثبت انتقال'}
                    </button>
                    <button
                      type="button"
                      className="gov-ghost-btn"
                      data-treasury-reconcile-save="true"
                      onClick={submitTreasuryReconciliation}
                      disabled={!!busyAction}
                    >
                      {String(busyAction).startsWith('reconcile-treasury-') ? 'در حال تطبیق...' : 'ثبت تطبیق'}
                    </button>
                  </div>
                </article>

                <article className="gov-card" data-span="12">
                  <div className="gov-card-head">
                    <div>
                      <strong>آخرین حرکات خزانه</strong>
                      <span>خلاصه آخرین حرکت‌ها، انتقال‌ها و اصلاح‌های تطبیق.</span>
                    </div>
                  </div>
                  {!treasuryRecentTransactions.length ? (
                    <div className="gov-empty-state">هنوز حرکت خزانه‌ای ثبت نشده است.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>حساب</th>
                            <th>نوع</th>
                            <th>مبلغ</th>
                            <th>تاریخ</th>
                            <th>مرجع</th>
                            <th>مقابل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryRecentTransactions.map((row) => (
                            <tr key={row._id}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{row.account?.title || row.account?.code || row.accountId || '---'}</strong>
                                  <span>{row.account?.code || '---'}</span>
                                </div>
                              </td>
                              <td><TreasuryTransactionTypeBadge transactionType={row.transactionType} direction={row.direction} /></td>
                              <td>{formatMoney(row.amount)}</td>
                              <td>{toFaDate(row.transactionDate)}</td>
                              <td>{row.referenceNo || '---'}</td>
                              <td>{row.counterAccount?.title || '---'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="12" data-treasury-report-card="summary">
                  <div className="gov-card-head">
                    <div>
                      <strong>گزارش‌های بستن خزانه</strong>
                      <span>دفتر نقدی، خلاصه گردش، نمای تطبیق و پیگیری مغایرت برای حساب خزانه انتخاب‌شده.</span>
                    </div>
                  </div>
                  <div className="gov-form-grid">
                    <label className="gov-field">
                      <span>حساب گزارش</span>
                      <select
                        data-treasury-report-account-select="true"
                        value={selectedTreasuryReportAccountId}
                        onChange={(event) => setSelectedTreasuryReportAccountId(event.target.value)}
                      >
                        {treasuryAccounts.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.title || item.code || item._id}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="gov-governance-grid">
                    <div className="gov-governance-stat" data-tone="sand">
                      <span>افتتاحیه</span>
                      <strong>{formatMoney(treasuryCashbook.summary?.openingBalance || 0)}</strong>
                      <small>{selectedTreasuryReportAccount?.code || '---'}</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="mint">
                      <span>ورودی‌ها</span>
                      <strong>{formatMoney(treasuryCashbook.summary?.inflowTotal || 0)}</strong>
                      <small>{formatNumber(treasuryCashbook.summary?.rowCount || 0)} ردیف</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="rose">
                      <span>خروجی‌ها</span>
                      <strong>{formatMoney(treasuryCashbook.summary?.outflowTotal || 0)}</strong>
                      <small>{formatNumber(treasuryReconciliationReport.summary?.pendingCount || 0)} در انتظار تطبیق</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(treasuryVarianceReport.summary?.criticalCount || 0) > 0 ? 'rose' : 'teal'}>
                      <span>مانده پایانی / مشکلات</span>
                      <strong>{formatMoney(treasuryCashbook.summary?.closingBalance || 0)}</strong>
                      <small>{formatNumber(treasuryVarianceReport.summary?.totalIssues || 0)} مشکل</small>
                    </div>
                  </div>
                </article>

                <article className="gov-card" data-span="7" data-treasury-cashbook-card="true">
                  <div className="gov-card-head">
                    <div>
                      <strong>دفتر نقدی</strong>
                      <span>موجودی جاری برای حساب خزانه انتخاب‌شده، شامل گردش‌های دستی خزانه و هزینه‌های تأییدشده.</span>
                    </div>
                  </div>
                  {!treasuryCashbook.rows?.length ? (
                    <div className="gov-empty-state">هیچ ردیفی در دفتر نقدی برای حساب خزانه انتخاب‌شده یافت نشد.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>ثبت‌شده</th>
                            <th>نوع</th>
                            <th>مرجع</th>
                            <th>طرف حساب</th>
                            <th>ورود</th>
                            <th>خروج</th>
                            <th>باقیمانده</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryCashbook.rows.map((row) => (
                            <tr key={row.key}>
                              <td>{toFaDate(row.postedAt)}</td>
                              <td>{row.rowType === 'expense' ? 'خروجی مصارف' : resolveTreasuryTransactionTypeLabel(row.transactionType)}</td>
                              <td>{row.referenceNo || '---'}</td>
                              <td>{row.counterparty || row.title || '---'}</td>
                              <td>{row.inflow ? formatMoney(row.inflow) : '---'}</td>
                              <td>{row.outflow ? formatMoney(row.outflow) : '---'}</td>
                              <td>{formatMoney(row.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="5" data-treasury-reconciliation-card="true">
                  <div className="gov-card-head">
                    <div>
                      <strong>وضعیت تطبیق</strong>
                      <span>مقایسه حساب به حساب بین مانده دفتری و آخرین مانده صورت‌حساب.</span>
                    </div>
                  </div>
                  <div className="gov-governance-grid">
                    <div className="gov-governance-stat" data-tone="teal">
                      <span>منطبق</span>
                      <strong>{formatNumber(treasuryReconciliationReport.summary?.matchedCount || 0)}</strong>
                      <small>حساب‌ها</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="copper">
                      <span>مغایرت</span>
                      <strong>{formatNumber(treasuryReconciliationReport.summary?.varianceCount || 0)}</strong>
                      <small>حساب‌ها</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="sand">
                      <span>در انتظار</span>
                      <strong>{formatNumber(treasuryReconciliationReport.summary?.pendingCount || 0)}</strong>
                      <small>حساب‌ها</small>
                    </div>
                  </div>
                  {!treasuryReconciliationReport.rows?.length ? (
                    <div className="gov-empty-state">هنوز داده تطبیقی در دسترس نیست.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>حساب</th>
                            <th>وضعیت</th>
                            <th>دفتری</th>
                            <th>صورت‌حساب</th>
                            <th>مغایرت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryReconciliationReport.rows.map((row) => (
                            <tr key={row.accountId}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{row.accountTitle || '---'}</strong>
                                  <span>{row.accountCode || '---'}</span>
                                </div>
                              </td>
                              <td>
                                <span className="gov-status-badge subtle" data-tone={row.status === 'matched' ? 'mint' : row.status === 'variance' ? 'rose' : 'sand'}>
                                  {TREASURY_RECONCILIATION_STATUS_LABELS[row.status] || row.status}
                                </span>
                              </td>
                              <td>{formatMoney(row.bookBalance || 0)}</td>
                              <td>{formatMoney(row.statementBalance || 0)}</td>
                              <td>{formatMoney(row.variance || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="7" data-treasury-movement-card="true">
                  <div className="gov-card-head">
                    <div>
                      <strong>خلاصه گردش</strong>
                      <span>افتتاحیه، گردش خزانه، هزینه‌ها و مانده پایانی به تفکیک حساب برای دوره انتخاب‌شده.</span>
                    </div>
                  </div>
                  {!treasuryMovementSummary.rows?.length ? (
                    <div className="gov-empty-state">هیچ خلاصه گردش خزانه‌ای برای فیلترهای انتخاب‌شده موجود نیست.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>حساب</th>
                            <th>افتتاحیه</th>
                            <th>تغییر خالص</th>
                            <th>خروج مصارف</th>
                            <th>پایانی</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryMovementSummary.rows.map((row) => (
                            <tr key={row.accountId}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{row.accountTitle || '---'}</strong>
                                  <span>{resolveTreasuryAccountTypeLabel(row.accountType)}</span>
                                </div>
                              </td>
                              <td>{formatMoney(row.openingBalance || 0)}</td>
                              <td>{formatMoney(row.netChange || 0)}</td>
                              <td>{formatMoney(row.expenseOutflow || 0)}</td>
                              <td>{formatMoney(row.closingBalance || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>

                <article className="gov-card" data-span="5" data-treasury-variance-card="true">
                  <div className="gov-card-head">
                    <div>
                      <strong>پیگیری مغایرت</strong>
                      <span>حساب‌ها یا هزینه‌های تأییدشده که هنوز قبل از بسته شدن نیاز به پیگیری خزانه دارند.</span>
                    </div>
                  </div>
                  {!treasuryVarianceReport.rows?.length ? (
                    <div className="gov-empty-state">No treasury variance issues were detected for the selected filters.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>Issue</th>
                            <th>مرجع</th>
                            <th>مبلغ</th>
                            <th>Severity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryVarianceReport.rows.map((row) => (
                            <tr key={row.key}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{row.accountTitle || '---'}</strong>
                                  <span>{String(row.issueType || '').replace(/_/g, ' ') || 'issue'}</span>
                                </div>
                              </td>
                              <td>{row.referenceNo || '---'}</td>
                              <td>{formatMoney(row.amount || 0)}</td>
                              <td>
                                <span className="gov-status-badge subtle" data-tone={row.severity === 'critical' ? 'rose' : 'copper'}>
                                  {TREASURY_VARIANCE_SEVERITY_LABELS[row.severity] || row.severity}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              </section>
            ) : null}

            {activeTab === 'archive' ? (
              <section className="gov-content-grid">
            <article className="gov-card" data-span="5">
              <TimelineList items={(payload.closedMonths || []).slice(0, 12)} />
            </article>

            <article className="gov-card" data-span="7">
              <div className="gov-card-head">
                <div>
                  <strong>بسته خروجی رسمی</strong>
                  <span>اینجا snapshot رسمی ربعوار و سالانه با version واقعی آرشیف می‌شود.</span>
                </div>
              </div>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  aria-label="ساخت نسخه رسمی ربعوار"
                  onClick={() => generateSnapshot('quarterly')}
                  disabled={!!busyAction}
                >
                  {busyAction === 'snapshot-quarterly' ? 'در حال ساخت...' : 'ساخت نسخه رسمی ربعوار'}
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  aria-label="ساخت نسخه رسمی سالانه"
                  onClick={() => generateSnapshot('annual')}
                  disabled={!!busyAction}
                >
                  {busyAction === 'snapshot-annual' ? 'در حال ساخت...' : 'ساخت نسخه رسمی سالانه'}
                </button>
              </div>
              <button
                type="button"
                className="gov-ghost-btn"
                data-snapshot-pdf-latest="true"
                onClick={() => downloadSnapshotPdf(latestSnapshot?._id || '')}
                disabled={!!busyAction || !latestSnapshot?._id}
              >
                {latestSnapshot?._id && busyAction === `snapshot-pdf-${latestSnapshot._id}`
                  ? 'Downloading latest PDF...'
                  : 'Download latest PDF'}
              </button>

              <div className="gov-export-grid">
                <button type="button" className="gov-export-card" onClick={() => exportBinary('/api/reports/export.csv', 'csv')} disabled={!!busyAction}>
                  <strong>CSV</strong>
                  <span>برای بررسی سریع و تحلیل ثانویه</span>
                </button>
                <button type="button" className="gov-export-card" onClick={() => exportBinary('/api/reports/export.xlsx', 'xlsx')} disabled={!!busyAction}>
                  <strong>اکسل</strong>
                  <span>برای نسخه رسمی قابل اشتراک</span>
                </button>
                <button type="button" className="gov-export-card" onClick={exportPrint} disabled={!!busyAction}>
                  <strong>نسخه چاپی</strong>
                  <span>برای چاپ و مرور مدیریتی</span>
                </button>
              </div>

              <div className="gov-archive-note">
                <strong>وضعیت فعلی آرشیف</strong>
                <p>
                  آخرین نسخه رسمی: {latestSnapshot?.title || '---'} | نسخه {formatNumber(latestSnapshot?.version || 0)} | تولیدکننده {latestSnapshot?.generatedBy?.name || '---'}
                </p>
              </div>

              {latestSnapshotPack ? (
                <div className="gov-governance-grid" data-snapshot-pack-summary="true">
                  <div className="gov-governance-stat" data-tone="mint">
                    <span>Approved expense</span>
                    <strong>{formatMoney(latestSnapshotPack.expenseAnalytics?.summary?.approvedAmount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.expenseAnalytics?.summary?.statusCounts?.approved || 0)} ردیف</small>
                  </div>
                  <div className="gov-governance-stat" data-tone="sand">
                    <span>Treasury balance</span>
                    <strong>{formatMoney(latestSnapshotPack.treasuryAnalytics?.summary?.bookBalance || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.treasuryAnalytics?.summary?.accountCount || 0)} account(s)</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveVariance || 0) < 0 ? 'copper' : 'teal'}>
                    <span>Reserve gap</span>
                    <strong>{formatMoney(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveVariance || 0)}</strong>
                    <small>Target {formatMoney(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveTarget || 0)}</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.budgetVsActual?.summary?.overBudgetCategoryCount || 0) > 0 ? 'rose' : 'mint'}>
                    <span>Over-budget categories</span>
                    <strong>{formatNumber(latestSnapshotPack.budgetVsActual?.summary?.overBudgetCategoryCount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.budgetVsActual?.summary?.unbudgetedCategoryCount || 0)} unbudgeted</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.procurementAnalytics?.summary?.totalOutstandingAmount || 0) > 0 ? 'copper' : 'teal'}>
                    <span>Procurement exposure</span>
                    <strong>{formatMoney(latestSnapshotPack.procurementAnalytics?.summary?.totalOutstandingAmount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.procurementAnalytics?.summary?.totalCount || 0)} commitment(s)</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={latestSnapshotPack.budgetApproval?.stage === 'approved' ? 'mint' : latestSnapshotPack.budgetApproval?.stage === 'rejected' ? 'rose' : 'sand'}>
                    <span>Budget approval</span>
                    <strong>{resolveBudgetApprovalStageLabel(latestSnapshotPack.budgetApproval?.stage || 'draft')}</strong>
                    <small>{formatNumber((latestSnapshotPack.budgetApproval?.trail || []).length)} trail event(s)</small>
                  </div>
                </div>
              ) : null}

              {!payload.snapshots?.length ? (
                <div className="gov-empty-state">هنوز snapshot رسمی برای این سال مالی ساخته نشده است.</div>
              ) : (
                <div className="gov-stack-section">
                  <div className="gov-table-wrap">
                    <table className="gov-table">
                      <thead>
                        <tr>
                          <th>نوع</th>
                          <th>ربع</th>
                          <th>نسخه</th>
                          <th>تولید</th>
                          <th>تولیدکننده</th>
                          <th>خالص</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.snapshots.map((item) => (
                          <tr key={item._id}>
                            <td>{item.reportType || '---'}</td>
                            <td>{item.quarter || '---'}</td>
                            <td>{formatNumber(item.version || 1)}</td>
                            <td>{toLocaleDateTime(item.generatedAt)}</td>
                            <td>{item.generatedBy?.name || '---'}</td>
                            <td>
                              <div className="gov-table-stack">
                                <strong>{formatMoney(item.summary?.balance ?? item.summary?.netProfit ?? 0)}</strong>
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-snapshot-pdf={item._id}
                                  onClick={() => downloadSnapshotPdf(item._id)}
                                  disabled={!!busyAction}
                                >
                                  {busyAction === `snapshot-pdf-${item._id}` ? '...' : 'PDF'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {latestSnapshot?.rows?.length ? (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            {(latestSnapshot.columns || []).slice(0, 5).map((column) => (
                              <th key={column.key || column.label}>{column.label || column.key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {buildTablePreview(latestSnapshot.rows || [], 6).map((row, index) => (
                            <tr key={`${latestSnapshot._id}-${index}`}>
                              {(latestSnapshot.columns || []).slice(0, 5).map((column) => (
                                <td key={`${latestSnapshot._id}-${index}-${column.key}`}>{row?.[column.key] ?? '---'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              )}
            </article>

            <article className="gov-card" data-span="7" data-government-archive-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>Government archive registry</strong>
                  <span>Archived snapshot packs with verification and delivery state.</span>
                </div>
              </div>
              {!governmentDocumentArchive.length ? (
                <div className="gov-empty-state">No archived government snapshot document has been generated yet.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>نوع</th>
                        <th>Generated</th>
                        <th>Verification</th>
                        <th>Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {governmentDocumentArchive.map((item) => (
                        <tr key={item._id || item.id}>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{item.title || item.documentNo || '---'}</strong>
                              <span>{item.documentNo || '---'}</span>
                            </div>
                          </td>
                          <td>{item.documentType || '---'}</td>
                          <td>{toLocaleDateTime(item.generatedAt)}</td>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{item.verification?.code || item.verificationCode || '---'}</strong>
                              <span>{item.verification?.url || item.verificationUrl || '---'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{ARCHIVE_DELIVERY_STATUS_LABELS[String(item.lastDeliveryStatus || '').trim()] || (item.lastDeliveryStatus || 'Not sent')}</strong>
                              <span>{item.lastDeliveredAt ? toLocaleDateTime(item.lastDeliveredAt) : '---'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>

            <article className="gov-card" data-span="5" data-government-archive-delivery-card="true">
              <div className="gov-card-head">
                <div>
                  <strong>Archive delivery</strong>
                  <span>Send the archived government finance pack through the finance delivery center.</span>
                </div>
              </div>
              {!selectedGovernmentArchive ? (
                <div className="gov-empty-state">Generate or export a government snapshot PDF first to start delivery.</div>
              ) : (
                <>
                  <div className="gov-form-grid">
                    <label className="gov-field gov-field-full">
                      <span>Archived document</span>
                      <select name="archiveId" value={archiveDeliveryDraft.archiveId} onChange={handleArchiveDeliveryDraftChange}>
                        {governmentDocumentArchive.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.documentNo || item.title || item._id || item.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>Channel</span>
                      <select name="channel" value={archiveDeliveryDraft.channel} onChange={handleArchiveDeliveryDraftChange}>
                        {Object.entries(DELIVERY_CHANNEL_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>Recipients</span>
                      <textarea
                        name="recipientHandles"
                        value={archiveDeliveryDraft.recipientHandles}
                        onChange={handleArchiveDeliveryDraftChange}
                        rows={4}
                        placeholder={'finance@example.edu\n+93700111222'}
                      />
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>یادداشت</span>
                      <input name="note" value={archiveDeliveryDraft.note} onChange={handleArchiveDeliveryDraftChange} />
                    </label>
                  </div>
                  <label className="gov-toggle">
                    <input type="checkbox" name="includeLinkedAudience" checked={archiveDeliveryDraft.includeLinkedAudience} onChange={handleArchiveDeliveryDraftChange} />
                    <span>Also notify linked audience from the archived document scope</span>
                  </label>
                  <div className="gov-mini-stack" data-government-archive-selected="true">
                    <div className="gov-mini-stat" data-tone="teal">
                      <span>Document</span>
                      <strong>{selectedGovernmentArchive.documentNo || '---'}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone="sand">
                      <span>Channel</span>
                      <strong>{resolveDeliveryChannelLabel(archiveDeliveryDraft.channel)}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone={selectedGovernmentArchive.deliveryCount ? 'mint' : 'sand'}>
                      <span>Delivery count</span>
                      <strong>{formatNumber(selectedGovernmentArchive.deliveryCount || 0)}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone={selectedGovernmentArchive.liveStatus?.tone || 'sand'}>
                      <span>Live status</span>
                      <strong>{selectedGovernmentArchive.liveStatus?.label || ARCHIVE_DELIVERY_STATUS_LABELS[String(selectedGovernmentArchive.lastDeliveryStatus || '').trim()] || 'Not sent'}</strong>
                    </div>
                  </div>
                  {selectedGovernmentArchive.deliveryLog?.length ? (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>Channel</th>
                            <th>وضعیت</th>
                            <th>Recipient</th>
                            <th>Provider</th>
                            <th>Sent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedGovernmentArchive.deliveryLog || []).slice().reverse().map((entry, index) => (
                            <tr key={`archive-delivery-log-${index}`}>
                              <td>{resolveDeliveryChannelLabel(entry.channel)}</td>
                              <td>{ARCHIVE_DELIVERY_STATUS_LABELS[String(entry.status || '').trim()] || entry.status || '---'}</td>
                              <td>{entry.recipient || 'Linked audience'}</td>
                              <td>{entry.provider || '---'}</td>
                              <td>{toLocaleDateTime(entry.sentAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  <div className="gov-card-actions">
                    <button
                      type="button"
                      className="gov-primary-btn"
                      data-government-archive-deliver="true"
                      onClick={deliverGovernmentArchiveDocument}
                      disabled={!!busyAction || !selectedGovernmentArchive?._id}
                    >
                      {busyAction === `deliver-government-archive-${selectedGovernmentArchive?._id || ''}` ? 'Queueing delivery...' : 'Send archived pack'}
                    </button>
                  </div>
                </>
              )}
            </article>

              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
