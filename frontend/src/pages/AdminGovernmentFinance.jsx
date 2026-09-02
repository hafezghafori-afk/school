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
import AfghanDateInput from '../components/ui/AfghanDateInput';
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
  { key: 'year', label: 'سال مالی' },
  { key: 'operations', label: 'مصارف' },
  { key: 'treasury', label: 'خزانه' },
  { key: 'reports', label: 'گزارش‌ها' }
];

// The reports tab folds the old monthly / quarterly / annual / archive tabs
// behind one segmented control.
const REPORT_MODES = [
  { key: 'monthly', label: 'ماهانه' },
  { key: 'quarterly', label: 'ربع‌وار' },
  { key: 'annual', label: 'سالانه' },
  { key: 'archive', label: 'آرشیف رسمی' }
];
const LEGACY_REPORT_TABS = new Set(['monthly', 'quarterly', 'annual', 'archive']);
const REPORT_MODE_KEYS = new Set(REPORT_MODES.map((item) => item.key));

function sanitizeReportMode(value) {
  return REPORT_MODE_KEYS.has(value) ? value : 'quarterly';
}

const QUARTER_OPTIONS = [
  { key: 1, label: 'ربع ۱' },
  { key: 2, label: 'ربع ۲' },
  { key: 3, label: 'ربع ۳' },
  { key: 4, label: 'ربع ۴' }
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  key: index + 1,
  label: `ماه ${index + 1}`
}));

function sanitizeMonth(value) {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 12) return parsed;
  return Math.min(12, Math.max(1, new Date().getMonth() + 1));
}

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

const BUDGET_APPROVAL_ACTION_LABELS = {
  saved: 'ذخیره شد',
  revision_started: 'بازنگری شروع شد',
  review_requested: 'برای بررسی ارسال شد',
  approved: 'تایید شد',
  rejected: 'رد شد',
  submitted: 'ارسال شد'
};

const GOVERNMENT_BUDGET_ALERT_LABELS = {
  expense_over_budget: {
    title: 'بودجه مصرفات بیشتر از حد تعیین‌شده شد',
    detail: 'مصارف تاییدشده از بودجه سالانه بیشتر است.'
  },
  income_under_target: {
    title: 'هدف درآمد تکمیل نشده است',
    detail: 'درآمد جمع‌آوری‌شده کمتر از هدف تعیین‌شده است.'
  },
  treasury_reserve_gap: {
    title: 'ذخیره خزانه کمتر از هدف است',
    detail: 'مانده خزانه کمتر از هدف ذخیره تعیین‌شده است.'
  },
  category_budget_attention: {
    title: 'بودجه دسته‌بندی‌ها نیاز به بررسی دارد',
    detail: 'برخی دسته‌بندی‌ها از حد بودجه گذشته یا مصرف بدون بودجه تعریف‌شده دارند.'
  }
};

const OPEN_BUDGET_APPROVAL_STAGES = new Set([
  'finance_manager_review',
  'finance_lead_review',
  'general_president_review'
]);

const FINANCIAL_YEAR_STATUS_LABELS = {
  planning: 'در پلان',
  draft: 'پیش‌نویس',
  active: 'فعال',
  closed: 'بسته',
  archived: 'آرشیف',
  inactive: 'غیرفعال'
};

const REPORT_TYPE_LABELS = {
  quarterly: 'ربع‌وار',
  annual: 'سالانه',
  government_finance_quarterly: 'گزارش مالی ربع‌وار',
  government_finance_annual: 'گزارش مالی سالانه'
};

const DOCUMENT_TYPE_LABELS = {
  government_snapshot_pack: 'بسته رسمی گزارش دولت',
  finance_statement: 'صورت حساب مالی',
  receipt: 'رسید',
  report: 'گزارش'
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
  governmentMonthly: null,
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

function resolveFinancialYearStatusLabel(status) {
  const normalized = String(status || 'planning').trim();
  return FINANCIAL_YEAR_STATUS_LABELS[normalized] || normalized || FINANCIAL_YEAR_STATUS_LABELS.planning;
}

function resolveReportTypeLabel(reportType) {
  const normalized = String(reportType || '').trim();
  return REPORT_TYPE_LABELS[normalized] || normalized || '---';
}

const SNAPSHOT_STAGE_LABELS = {
  draft: 'پیش‌نویس',
  ratified: 'رسمی',
  rejected: 'ردشده'
};

function resolveSnapshotStageLabel(stage = '') {
  const normalized = String(stage || '').trim();
  return SNAPSHOT_STAGE_LABELS[normalized] || 'پیش‌نویس';
}

// Phase 4 redesign — a glass panel whose header button opens/closes its body.
// Open state is remembered per (tab, panel) in localStorage.
function readPanelState(storageKey, fallback) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored === 'open') return true;
    if (stored === 'closed') return false;
  } catch {
    /* storage unavailable — fall back */
  }
  return fallback;
}

function panelBulkEventName(tabKey) {
  return `govfin:panels:${tabKey}`;
}

function CollapsiblePanel({ tabKey, panelKey, title, hint = '', defaultOpen = false, span = '12', cardAttr = '', children }) {
  const storageKey = `govfin.panel.${tabKey}.${panelKey}`;
  const [open, setOpen] = useState(() => readPanelState(storageKey, defaultOpen));
  const bodyId = `govpanel-${tabKey}-${panelKey}`;

  const persist = (next) => {
    try {
      window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      /* ignore */
    }
  };

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  };

  useEffect(() => {
    const handler = (event) => {
      const next = !!event.detail?.open;
      setOpen(next);
      persist(next);
    };
    window.addEventListener(panelBulkEventName(tabKey), handler);
    return () => window.removeEventListener(panelBulkEventName(tabKey), handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKey, storageKey]);

  return (
    <article
      className={`gov-panel ${open ? 'is-open' : ''}`}
      data-span={span}
      {...(cardAttr ? { [cardAttr]: 'true' } : {})}
    >
      <button
        type="button"
        className="gov-panel__head"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="gov-panel__chevron" aria-hidden="true">▾</span>
        <span className="gov-panel__title">{title}</span>
        {hint ? <span className="gov-panel__hint">{hint}</span> : null}
      </button>
      <div className="gov-panel__body" id={bodyId} aria-hidden={!open} inert={!open}>
        <div className="gov-panel__clip">
          <div className="gov-panel__inner">{children}</div>
        </div>
      </div>
    </article>
  );
}

function PanelBulkControls({ tabKey }) {
  const dispatch = (open) => {
    window.dispatchEvent(new CustomEvent(panelBulkEventName(tabKey), { detail: { open } }));
  };
  return (
    <div className="gov-panel-controls">
      <button type="button" onClick={() => dispatch(true)}>باز کردن همه</button>
      <button type="button" onClick={() => dispatch(false)}>بستن همه</button>
    </div>
  );
}

// Phase 4 (P14) — what changed between the latest official record and the one
// before it, plus a one-click digest-chain check.
const SNAPSHOT_DELTA_KEYS = [
  { key: 'totalIncome', label: 'عواید' },
  { key: 'totalExpense', label: 'مصارف' },
  { key: 'balance', label: 'مانده' },
  { key: 'netProfit', label: 'خالص' },
  { key: 'encumbranceOutstanding', label: 'تعهدات باز' },
  { key: 'unallocatedExpense', label: 'مصارف تخصیص‌نیافته' }
];

function sameSnapshotChain(a, b) {
  return a && b
    && String(a.reportType || '') === String(b.reportType || '')
    && String(a.quarter || '') === String(b.quarter || '')
    && String(a.month || '') === String(b.month || '')
    && String(a.classId || '') === String(b.classId || '');
}

function SnapshotChainPanel({ snapshots = [], chainStatus, onVerify, busy }) {
  const latest = snapshots[0] || null;
  const previous = latest
    ? snapshots.find((item) => sameSnapshotChain(item, latest) && Number(item.version) === Number(latest.version) - 1) || null
    : null;
  if (!latest) return null;

  const deltas = previous
    ? SNAPSHOT_DELTA_KEYS
      .map(({ key, label }) => {
        const to = Number(latest.summary?.[key]);
        const from = Number(previous.summary?.[key]);
        if (!Number.isFinite(to) && !Number.isFinite(from)) return null;
        return { label, from: from || 0, to: to || 0, delta: (to || 0) - (from || 0) };
      })
      .filter(Boolean)
    : [];

  return (
    <article className="gov-card" data-span="12">
      <div className="gov-card-head spread">
        <div>
          <strong>مقایسهٔ نسخه‌ها و صحتِ زنجیره</strong>
          <span>
            {previous
              ? `تغییرات نسخهٔ ${formatNumber(latest.version)} نسبت به نسخهٔ ${formatNumber(previous.version)}`
              : 'هنوز نسخهٔ قبلی برای مقایسه وجود ندارد.'}
          </span>
        </div>
        <button type="button" className="gov-ghost-btn" onClick={onVerify} disabled={busy}>
          {busy ? 'در حال بررسی...' : 'بررسی زنجیرهٔ دایجست'}
        </button>
      </div>

      {chainStatus ? (
        <div className={`gov-chain-status ${chainStatus.ok ? 'ok' : 'broken'}`}>
          {chainStatus.ok
            ? `زنجیره سالم است — ${formatNumber(chainStatus.verifiableCount || 0)} نسخهٔ قابل‌راستی‌آزمایی`
            : 'در زنجیره ناسازگاری پیدا شد؛ دایجست یا پیوندِ یک نسخه با محتوایش نمی‌خواند.'}
          {chainStatus.legacyCount ? ` · ${formatNumber(chainStatus.legacyCount)} نسخهٔ قدیمی (پیش از زنجیره)` : ''}
        </div>
      ) : null}

      {deltas.length ? (
        <div className="gov-table-wrap">
          <table className="gov-table">
            <thead>
              <tr><th>قلم</th><th>نسخهٔ قبلی</th><th>نسخهٔ جدید</th><th>Δ</th></tr>
            </thead>
            <tbody>
              {deltas.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{formatMoney(row.from)}</td>
                  <td>{formatMoney(row.to)}</td>
                  <td data-delta={row.delta === 0 ? 'flat' : row.delta > 0 ? 'up' : 'down'}>
                    {row.delta > 0 ? '+' : ''}{formatMoney(row.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}

// Phase 2 (P4/P5/P6) — the accounting basis and its caveats, shown alongside the
// quarterly / annual government figures so the numbers aren't misread.
function GovernmentBasisNote({ report }) {
  const summary = report?.summary || null;
  const meta = report?.meta || null;
  if (!summary && !meta) return null;
  const encumbrance = Number(summary?.encumbranceOutstanding || 0);
  const balanceRaw = summary?.balance ?? summary?.netProfit;
  const balanceAfter = summary?.balanceAfterEncumbrance;
  const unallocated = Number(summary?.unallocatedExpense || 0);
  const periodBasis = meta?.periodBasis === 'shamsi'
    ? 'دوره‌بندی: تقویم شمسی (منطبق با سال مالی)'
    : meta?.periodBasis === 'gregorian'
      ? 'دوره‌بندی: میلادی (سال مالی با اول حمل منطبق نیست)'
      : '';
  return (
    <article className="gov-card" data-span="12">
      <div className="gov-card-head">
        <div>
          <strong>مبنای حسابداری و ملاحظات</strong>
          <span>{meta?.basisNote || 'مبنای نقدی: درآمد در تاریخ وصول و مصرف در تاریخ مصرف، هر دو فقط تاییدشده.'}</span>
        </div>
      </div>
      <ul className="gov-basis-list">
        {periodBasis ? <li>{periodBasis}</li> : null}
        <li>
          تعهدات خرید باز (encumbrance): <strong>{formatMoney(encumbrance)}</strong>
          {Number.isFinite(Number(balanceAfter)) ? (
            <> — مانده پس از تعهدات: <strong>{formatMoney(balanceAfter)}</strong> (مانده نقدی: {formatMoney(balanceRaw || 0)})</>
          ) : null}
        </li>
        <li>
          {meta?.perClassNote || 'بیلانسِ هر صنف فقط مصارف مستقیمِ همان صنف را کسر می‌کند.'}
          {unallocated > 0 ? <> مصارف عمومیِ تخصیص‌نیافته در این دوره: <strong>{formatMoney(unallocated)}</strong>.</> : null}
        </li>
      </ul>
    </article>
  );
}

function resolveDocumentTypeLabel(documentType) {
  const normalized = String(documentType || '').trim();
  return DOCUMENT_TYPE_LABELS[normalized] || normalized || '---';
}

function resolveTreasuryIssueLabel(issueType) {
  const normalized = String(issueType || '').trim();
  const labels = {
    unassigned_expense: 'مصرف بدون حساب',
    balance_variance: 'مغایرت مانده',
    unreconciled_account: 'حساب تطبیق‌نشده',
    missing_statement: 'صورت‌حساب ثبت نشده'
  };
  return labels[normalized] || normalized.replace(/_/g, ' ') || 'موضوع';
}

function normalizeDisplayPayload(value) {
  if (typeof value === 'string') return repairDisplayText(value);
  if (Array.isArray(value)) return value.map((item) => normalizeDisplayPayload(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeDisplayPayload(item)])
  );
}

function mergeFinancialYearItem(items = [], nextItem = null) {
  if (!nextItem?._id && !nextItem?.id) return items;
  const normalizedItem = normalizeDisplayPayload(nextItem);
  const nextId = String(normalizedItem._id || normalizedItem.id || '');
  const list = Array.isArray(items) ? items : [];
  const found = list.some((item) => String(item?._id || item?.id || '') === nextId);
  if (!found) return [normalizedItem, ...list];
  return list.map((item) => (
    String(item?._id || item?.id || '') === nextId
      ? { ...item, ...normalizedItem }
      : item
  ));
}

function applyFinancialYearItemToPayload(setPayload, item) {
  if (!item?._id && !item?.id) return;
  setPayload((current) => ({
    ...current,
    financialYears: mergeFinancialYearItem(current.financialYears || [], item)
  }));
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

function buildIntelligentTreasurySummary({
  financeSummary = {},
  financeRows = [],
  budgetVsActual = {},
  treasurySummary = {},
  procurementSummary = {},
  procurementItems = []
} = {}) {
  const rows = Array.isArray(financeRows) ? financeRows : [];
  const totalBilledFromRows = rows.reduce((sum, row) => sum + toNumber(row.amountDue), 0);
  const totalOutstandingFromRows = rows.reduce((sum, row) => sum + toNumber(row.outstandingAmount), 0);
  const totalCollectedFromRows = Math.max(0, totalBilledFromRows - totalOutstandingFromRows);
  const budgetSummary = budgetVsActual?.summary || {};

  const expectedIncome = Math.max(
    toNumber(financeSummary.totalDue),
    toNumber(financeSummary.totalBilled),
    totalBilledFromRows,
    toNumber(budgetSummary.annualIncomeTarget)
  );
  const collectedIncome = Math.max(
    toNumber(financeSummary.totalPaid),
    toNumber(financeSummary.collected),
    totalCollectedFromRows,
    toNumber(budgetSummary.actualIncome)
  );
  const receivableBalance = Math.max(
    toNumber(financeSummary.outstandingAmount),
    toNumber(financeSummary.totalOutstanding),
    totalOutstandingFromRows,
    Math.max(0, expectedIncome - collectedIncome)
  );
  const realCashBalance = toNumber(treasurySummary.bookBalance);
  const expenseOutflow = Math.max(
    toNumber(treasurySummary.expenseOutflow),
    toNumber(budgetSummary.actualExpense)
  );
  const approvedCommitmentBalance = Math.max(
    toNumber(procurementSummary.totalOutstandingAmount),
    (Array.isArray(procurementItems) ? procurementItems : [])
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + toNumber(item.outstandingAmount || item.settlementBalanceAmount), 0)
  );
  const readyPayable = Math.max(
    toNumber(procurementSummary.totalPayableReadyAmount),
    (Array.isArray(procurementItems) ? procurementItems : [])
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + toNumber(item.payableReadyAmount), 0)
  );
  const freeCashBalance = Math.max(0, realCashBalance - approvedCommitmentBalance);

  return {
    expectedIncome,
    collectedIncome,
    receivableBalance,
    realCashBalance,
    expenseOutflow,
    approvedCommitmentBalance,
    readyPayable,
    freeCashBalance,
    expectedCoveragePercent: expectedIncome > 0
      ? Math.min(100, Math.max(0, (collectedIncome / expectedIncome) * 100))
      : 0
  };
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

function resolveBudgetApprovalActionLabel(action = '') {
  return BUDGET_APPROVAL_ACTION_LABELS[String(action || '').trim()] || String(action || '---').trim();
}

function isPlainEnglishText(value = '') {
  const text = String(value || '').trim();
  return Boolean(text) && /^[A-Za-z0-9 ,.'()/:%-]+$/.test(text);
}

function resolveGovernmentBudgetAlert(item = {}) {
  const fallback = GOVERNMENT_BUDGET_ALERT_LABELS[String(item?.key || '').trim()] || {};
  return {
    title: item?.title && !isPlainEnglishText(item.title)
      ? item.title
      : fallback.title || item?.title || item?.key || 'هشدار بودجه',
    detail: item?.detail && !isPlainEnglishText(item.detail)
      ? item.detail
      : fallback.detail || item?.detail || ''
  };
}

function normalizeBudgetApprovalStageValue(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (OPEN_BUDGET_APPROVAL_STAGES.has(normalized)) return normalized;
  if (normalized === 'approved' || normalized === 'rejected') return normalized;
  return 'draft';
}

function isBudgetReviewStage(stage = '') {
  return OPEN_BUDGET_APPROVAL_STAGES.has(normalizeBudgetApprovalStageValue(stage));
}

function budgetTargetsConfigured(value = {}) {
  const targets = value && typeof value === 'object' ? value : {};
  return Number(targets.annualIncomeTarget || 0) > 0
    || Number(targets.annualExpenseBudget || 0) > 0
    || Number(targets.monthlyIncomeTarget || 0) > 0
    || Number(targets.monthlyExpenseBudget || 0) > 0
    || Number(targets.treasuryReserveTarget || 0) > 0
    || (Array.isArray(targets.categoryBudgets) && targets.categoryBudgets.some((item) => (
      Number(item?.annualBudget || 0) > 0 || Number(item?.monthlyBudget || 0) > 0
    )));
}

function buildBudgetApprovalState(financialYear = null) {
  const nested = financialYear?.budgetApproval && typeof financialYear.budgetApproval === 'object'
    ? financialYear.budgetApproval
    : {};
  const rawStage = nested.stage || financialYear?.budgetApprovalStage || '';
  let stage = normalizeBudgetApprovalStageValue(rawStage);
  const approvedAt = nested.approvedAt || financialYear?.budgetApprovedAt || null;
  const rejectedAt = nested.rejectedAt || financialYear?.budgetRejectedAt || null;
  const lastApprovedVersion = Math.max(
    0,
    Number(nested.lastApprovedVersion || financialYear?.budgetLastApprovedVersion || 0)
  );

  if (stage !== 'approved' && approvedAt && lastApprovedVersion > 0 && !rejectedAt) {
    stage = 'approved';
  }
  if (stage !== 'rejected' && rejectedAt && !approvedAt) {
    stage = 'rejected';
  }

  return {
    ...nested,
    configured: nested.configured === true || budgetTargetsConfigured(financialYear?.budgetTargets || {}),
    stage,
    version: Math.max(1, Number(nested.version || financialYear?.budgetVersion || 1)),
    lastApprovedVersion,
    frozenAt: nested.frozenAt || financialYear?.budgetFrozenAt || null,
    canStartRevision: nested.canStartRevision === true || (!financialYear?.isClosed && stage === 'approved'),
    submittedBy: nested.submittedBy || financialYear?.budgetSubmittedBy || null,
    submittedAt: nested.submittedAt || financialYear?.budgetSubmittedAt || null,
    approvedBy: nested.approvedBy || financialYear?.budgetApprovedBy || null,
    approvedAt,
    rejectedBy: nested.rejectedBy || financialYear?.budgetRejectedBy || null,
    rejectedAt,
    rejectReason: nested.rejectReason || financialYear?.budgetRejectReason || '',
    trail: Array.isArray(nested.trail)
      ? nested.trail
      : (Array.isArray(financialYear?.budgetApprovalTrail) ? financialYear.budgetApprovalTrail : []),
    revisionHistory: Array.isArray(nested.revisionHistory)
      ? nested.revisionHistory
      : (Array.isArray(financialYear?.budgetRevisionHistory) ? financialYear.budgetRevisionHistory : [])
  };
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
  if (LEGACY_REPORT_TABS.has(value)) return 'reports';
  return TAB_KEYS.has(value) ? value : DEFAULT_TAB;
}

function resolveInitialReportMode(rawTab, rawMode) {
  if (LEGACY_REPORT_TABS.has(rawTab)) return rawTab;
  return sanitizeReportMode(rawMode);
}

function sanitizeQuarter(value) {
  const quarter = Number(value || 0);
  if (QUARTER_OPTIONS.some((item) => item.key === quarter)) return quarter;
  return DEFAULT_QUARTER;
}

function buildGovernmentFinanceSearchParams({
  tab,
  reportMode,
  financialYearId,
  academicYearId,
  classId,
  quarter
}) {
  const nextParams = new URLSearchParams();
  const nextTab = sanitizeTab(tab);
  const nextQuarter = sanitizeQuarter(quarter);

  if (nextTab !== DEFAULT_TAB) nextParams.set('tab', nextTab);
  if (nextTab === 'reports' && sanitizeReportMode(reportMode) !== 'quarterly') {
    nextParams.set('rmode', sanitizeReportMode(reportMode));
  }
  if (financialYearId) nextParams.set('financialYearId', financialYearId);
  if (academicYearId) nextParams.set('academicYearId', academicYearId);
  if (classId) nextParams.set('classId', classId);
  if (nextQuarter !== DEFAULT_QUARTER || nextTab === 'reports') {
    nextParams.set('quarter', String(nextQuarter));
  }

  return nextParams;
}

function resolveReportLabel(mode) {
  if (mode === 'monthly') return 'government_finance_monthly';
  if (mode === 'quarterly') return 'government_finance_quarterly';
  if (mode === 'annual' || mode === 'archive') return 'government_finance_annual';
  return 'finance_overview';
}

function readInitialSearchValue(searchParams, key) {
  const directValue = searchParams.get(key);
  return directValue || '';
}

function readInitialSearchText(searchParams) {
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
          <span>نمای فعلی از داده‌های موجود تا زمان فعال‌شدن سال مالی</span>
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
  if (activeTab === 'reports') {
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

  if (activeTab === 'year') {
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
  const [selectedMonth, setSelectedMonth] = useState(() => sanitizeMonth(readInitialSearchValue(searchParams, 'month')));
  const [reportMode, setReportMode] = useState(() => resolveInitialReportMode(
    readInitialSearchValue(searchParams, 'tab'),
    readInitialSearchValue(searchParams, 'rmode')
  ));
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
    payload.financialYears.find((item) => item.isActive) || payload.financialYears[0] || null
  ), [payload.financialYears]);

  const selectedFinancialYear = useMemo(() => (
    payload.financialYears.find((item) => item._id === selectedFinancialYearId || item.id === selectedFinancialYearId)
      || activeFinancialYear
      || null
  ), [payload.financialYears, selectedFinancialYearId, activeFinancialYear]);

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
  const automaticStudentPaymentTreasuryAccounts = useMemo(() => (
    treasuryAccounts.filter((item) => String(item?.code || '').trim().toUpperCase().startsWith('AUTO-'))
  ), [treasuryAccounts]);
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
  const intelligentTreasurySummary = useMemo(() => buildIntelligentTreasurySummary({
    financeSummary: payload.summary || {},
    financeRows: payload.financeOverview?.rows || [],
    budgetVsActual,
    treasurySummary,
    procurementSummary,
    procurementItems
  }), [
    budgetVsActual,
    payload.financeOverview,
    payload.summary,
    procurementItems,
    procurementSummary,
    treasurySummary
  ]);
  const approvedProcurementOptions = useMemo(() => (
    procurementItems.filter((item) => item.status === 'approved' && Number(item.outstandingAmount || 0) > 0)
  ), [procurementItems]);
  const settlementReadyProcurementOptions = useMemo(() => (
    procurementItems.filter((item) => item.status === 'approved' && Number(item.payableReadyAmount || 0) > 0)
  ), [procurementItems]);
  const selectedBudgetApproval = useMemo(() => (
    buildBudgetApprovalState(selectedFinancialYear)
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
  const selectedBudgetStage = selectedBudgetApproval.stage || 'draft';
  const selectedBudgetInReview = isBudgetReviewStage(selectedBudgetStage);
  const selectedBudgetApproved = selectedBudgetStage === 'approved';
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
    && !payload.governmentMonthly
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
        value: activeTab === 'reports'
          ? (REPORT_MODES.find((item) => item.key === reportMode)?.label || 'ربع‌وار')
          : activeTab === 'operations'
            ? 'عملیات مصارف'
            : 'نمای کلی'
      },
      { key: 'fy', label: 'سال مالی', value: selectedFinancialYear?.title || 'همه / بدون محدودیت' },
      { key: 'ay', label: 'سال تعلیمی', value: selectedAcademicYear?.title || '---' },
      { key: 'class', label: 'صنف', value: selectedClass?.title || 'همه صنف‌ها' }
    ];

    if (activeTab === 'reports' && (reportMode === 'quarterly' || reportMode === 'archive')) {
      chips.push({ key: 'quarter', label: 'ربع', value: activeQuarterLabel });
    }
    if (activeTab === 'reports' && reportMode === 'monthly') {
      chips.push({ key: 'month', label: 'ماه', value: `ماه ${selectedMonth}` });
    }
    if (activeTab === 'reports' && reportMode === 'archive') {
      chips.push({ key: 'snapshots', label: 'اسنپ‌شات‌ها', value: formatNumber((payload.snapshots || []).length) });
    }

    if (activeTab === 'treasury') {
      chips.push({
        key: 'treasury-account',
        label: 'حساب خزانه',
        value: selectedTreasuryReportAccount?.title || selectedTreasuryReportAccount?.code || 'همه حساب‌ها'
      });
    }

    return chips;
  }, [activeQuarterLabel, activeTab, reportMode, selectedMonth, activeTabLabel, payload.snapshots, selectedAcademicYear, selectedClass, selectedFinancialYear, selectedTreasuryReportAccount]);
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
    if (activeTab === 'year') return 'بازخوانی مدیریت سال مالی';
    if (activeTab === 'reports') {
      const label = REPORT_MODES.find((item) => item.key === reportMode)?.label || 'گزارش';
      return `بازخوانی ${label}`;
    }
    return 'بازخوانی داده';
  }, [activeTab, reportMode]);
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
      if (selectedMonth) reportFilters.monthNumber = selectedMonth;
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

      const isReports = resolvedTargetTab === 'reports';

      if (isReports && reportMode === 'monthly') {
        loaders.push({
          key: 'governmentMonthly',
          run: () => postJson('/api/reports/run', { reportKey: 'government_finance_monthly', filters: reportFilters }),
          assign: (data, nextPayload) => { nextPayload.governmentMonthly = data.report || null; }
        });
      }

      if (isReports && reportMode === 'quarterly') {
        loaders.push({
          key: 'governmentQuarterly',
          run: () => postJson('/api/reports/run', { reportKey: 'government_finance_quarterly', filters: reportFilters }),
          assign: (data, nextPayload) => { nextPayload.governmentQuarterly = data.report || null; }
        });
      }

      if (isReports && reportMode === 'annual') {
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

      if (resolvedTargetTab === 'operations' || (isReports && reportMode === 'archive')) {
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

      if (isReports && reportMode === 'archive') {
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
      if (!prefetch) {
        const nextFinancialYears = nextPayload.financialYears || [];
        const fallbackFinancialYear = nextFinancialYears.find((item) => item.isActive) || nextFinancialYears[0] || null;
        setSelectedFinancialYearId((current) => {
          const currentFinancialYear = nextFinancialYears.find((item) => String(item._id || item.id || '') === String(current || ''));
          const nextFinancialYear = currentFinancialYear || fallbackFinancialYear;
          const nextAcademicYearId = String(nextFinancialYear?.academicYearId || '');
          if (nextAcademicYearId) setSelectedAcademicYearId(nextAcademicYearId);
          return String(nextFinancialYear?._id || nextFinancialYear?.id || '');
        });
      }
      prefetchedTabsRef.current.set(`${resolvedTargetTab}|${requestScopeKey}`, true);
      if (!prefetch && errors.length) {
        showMessage('بخشی از داده‌ها بارگذاری شد، اما بعضی مسیرهای خدماتی هنوز برای فاز بعدی آماده نشده‌اند.', 'info');
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
    if (tabKey !== 'reports') return;
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
  }, [activeTab, reportMode, selectedAcademicYearId, selectedFinancialYearId, selectedClassId, selectedQuarter, selectedMonth, selectedTreasuryReportAccountId]);

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
    const rawTab = readInitialSearchValue(searchParams, 'tab');
    const nextTab = sanitizeTab(rawTab);
    const nextReportMode = resolveInitialReportMode(rawTab, readInitialSearchValue(searchParams, 'rmode'));
    const nextFinancialYearId = readInitialSearchValue(searchParams, 'financialYearId');
    const nextAcademicYearId = readInitialSearchValue(searchParams, 'academicYearId');
    const nextClassId = readInitialSearchValue(searchParams, 'classId');
    const nextQuarter = sanitizeQuarter(readInitialSearchValue(searchParams, 'quarter'));

    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setReportMode((current) => (current === nextReportMode ? current : nextReportMode));
    setSelectedFinancialYearId((current) => (current === nextFinancialYearId ? current : nextFinancialYearId));
    setSelectedAcademicYearId((current) => (current === nextAcademicYearId ? current : nextAcademicYearId));
    setSelectedClassId((current) => (current === nextClassId ? current : nextClassId));
    setSelectedQuarter((current) => (current === nextQuarter ? current : nextQuarter));
  }, [searchParams]);

  useEffect(() => {
    const nextParams = buildGovernmentFinanceSearchParams({
      tab: activeTab,
      reportMode,
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
    reportMode,
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
      const response = await fetchJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetTargets: serializeBudgetDraft(selectedYearBudgetDraft, expenseCategoryRegistry)
        })
      });
      applyFinancialYearItemToPayload(setPayload, response.item);
      showMessage('اهداف بودجه به‌روزرسانی شد.');
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
      const response = await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/request-review`, {
        note: 'ارسال بودجه از میز مدیریت سال مالی'
      });
      applyFinancialYearItemToPayload(setPayload, response.item);
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
      const response = await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/review`, {
        action,
        reason: reason || '',
        note: action === 'reject' ? 'بودجه از میز سال مالی رد شد.' : 'بودجه از میز سال مالی تایید شد.'
      });
      applyFinancialYearItemToPayload(setPayload, response.item);
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
      const response = await postJson(`/api/finance/admin/financial-years/${selectedFinancialYearId}/budget/start-revision`, {
        note: 'بازنگری از دفتر گزارش مالی دولت آغاز شد.'
      });
      applyFinancialYearItemToPayload(setPayload, response.item);
      showMessage('بازنگری بودجه آغاز شد.');
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
      showMessage('تسویه فروشنده ثبت شد.');
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
      const response = await postJson('/api/finance/admin/government-snapshots', {
        reportType,
        financialYearId: selectedFinancialYearId,
        academicYearId: selectedAcademicYearId,
        classId: selectedClassId || '',
        quarter: reportType === 'quarterly' ? selectedQuarter : undefined
      });
      const blockers = response?.ratificationGate?.blockers || [];
      if (blockers.length) {
        showMessage(
          `پیش‌نویس ${reportType === 'quarterly' ? 'ربعوار' : 'سالانه'} ساخته شد. برای ثبت رسمی ابتدا رفع شود: ${blockers.map((item) => item.label).join(' • ')}`,
          'info'
        );
      } else {
        showMessage(`پیش‌نویس نسخهٔ رسمی ${reportType === 'quarterly' ? 'ربعوار' : 'سالانه'} ساخته شد؛ آمادهٔ ثبت رسمی توسط مقام دوم است.`);
      }
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ساخت پیش‌نویس نسخهٔ رسمی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const ratifySnapshot = async (snapshotId) => {
    if (!snapshotId) return;
    try {
      setBusyAction(`snapshot-ratify-${snapshotId}`);
      await postJson(`/api/finance/admin/government-snapshots/${snapshotId}/ratify`, {});
      showMessage('نسخهٔ رسمی گزارش مالی دولت ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      const blockers = error?.data?.ratificationGate?.blockers || [];
      showMessage(
        blockers.length
          ? `ثبت رسمی ممکن نشد؛ ابتدا رفع شود: ${blockers.map((item) => item.label).join(' • ')}`
          : errorMessage(error, 'ثبت رسمی نسخهٔ گزارش مالی دولت ناموفق بود.'),
        'error'
      );
    } finally {
      setBusyAction('');
    }
  };

  const [chainStatus, setChainStatus] = useState(null);

  const verifySnapshotChain = async () => {
    const latest = (payload.snapshots || [])[0];
    if (!latest) return;
    try {
      setBusyAction('snapshot-verify-chain');
      const params = new URLSearchParams();
      params.set('financialYearId', String(latest.financialYearId || selectedFinancialYearId || ''));
      params.set('reportType', String(latest.reportType || ''));
      if (latest.quarter) params.set('quarter', String(latest.quarter));
      if (latest.month) params.set('month', String(latest.month));
      if (latest.classId) params.set('classId', String(latest.classId));
      const data = await fetchJson(`/api/finance/admin/government-snapshots/verify-chain?${params.toString()}`);
      setChainStatus({
        ok: !!data.ok,
        verifiableCount: data.verifiableCount || 0,
        legacyCount: data.legacyCount || 0
      });
    } catch (error) {
      showMessage(errorMessage(error, 'بررسی زنجیرهٔ نسخه‌ها ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const downloadSnapshotCsv = async (snapshotId) => {
    if (!snapshotId) return;
    try {
      setBusyAction(`snapshot-csv-${snapshotId}`);
      const { blob, filename } = await fetchBlob(
        `/api/finance/admin/government-snapshots/${snapshotId}/export.csv`,
        {},
        { method: 'GET' }
      );
      downloadBlob(blob, filename || `government-finance-${snapshotId}.csv`);
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت CSV آرشیف رسمی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const rejectSnapshot = async (snapshotId) => {
    if (!snapshotId) return;
    const reason = (typeof window !== 'undefined' && window.prompt)
      ? window.prompt('دلیل رد پیش‌نویس نسخهٔ رسمی:')
      : '';
    if (!reason || !reason.trim()) {
      showMessage('برای رد پیش‌نویس، ذکر دلیل الزامی است.', 'error');
      return;
    }
    try {
      setBusyAction(`snapshot-reject-${snapshotId}`);
      await postJson(`/api/finance/admin/government-snapshots/${snapshotId}/reject`, { reason: reason.trim() });
      showMessage('پیش‌نویس نسخهٔ رسمی رد شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'رد پیش‌نویس نسخهٔ رسمی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const resolveActiveReportKey = () => {
    if (activeTab === 'reports') return resolveReportLabel(reportMode);
    return 'finance_overview';
  };

  const buildExportFilters = () => {
    const filters = {};
    if (selectedFinancialYearId) filters.financialYearId = selectedFinancialYearId;
    if (selectedAcademicYearId) filters.academicYearId = selectedAcademicYearId;
    if (selectedClassId) filters.classId = selectedClassId;
    if (activeTab === 'reports' && reportMode === 'quarterly') filters.quarter = selectedQuarter;
    if (activeTab === 'reports' && reportMode === 'monthly') filters.monthNumber = selectedMonth;
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
      showMessage('ابتدا یک نسخه رسمی معتبر انتخاب کنید.', 'error');
      return;
    }
    try {
      setBusyAction(`snapshot-pdf-${snapshotId}`);
      const { blob, filename } = await fetchBlob(`/api/finance/admin/government-snapshots/${snapshotId}/export.pdf`, {}, {
        method: 'GET'
      });
      downloadBlob(blob, filename || `government-finance-${snapshotId}.pdf`);
      await loadWorkspace('archive');
      showMessage('فایل پی‌دی‌اف رسمی آرشیف مالی دانلود شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت پی‌دی‌اف آرشیف رسمی ناموفق بود.'), 'error');
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
        subject: `${selectedGovernmentArchive.title || 'بسته گزارش مالی دولت'}${selectedGovernmentArchive.documentNo ? ` | ${selectedGovernmentArchive.documentNo}` : ''}`
      });
      setArchiveDeliveryDraft((current) => ({
        ...current,
        recipientHandles: '',
        note: ''
      }));
      showMessage('ارسال سند آرشیف دولتی با موفقیت در صف قرار گرفت.');
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
      hint: `${formatNumber(payload.financeOverview?.summary?.overdueOrders || 0)} مورد سررسید گذشته`
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
              این نسخه روی داده‌های اصلی فعلی سوار است و از خلاصه مالی، جریان نقدینگی، گزارش سررسید گذشته، صورت‌حساب صنوف و موتور گزارش‌ساز
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
                {(payload.financialYears || []).map((item) => (
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
              <section className="gov-kpi-grid" aria-label="خلاصه در حال بارگذاری گزارش مالی دولت">
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
                  <strong>وضعیت سررسید گذشته</strong>
                  <span>نمایش دسته‌های مهلت فعلی</span>
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
                  <span>از خلاصه فعلی و گردش کار رسیدها</span>
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
                  <span>بل‌های سررسید گذشته</span>
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

            {activeTab === 'reports' ? (
              <div className="gov-reports-switch">
                <div className="gov-seg" role="tablist" aria-label="نوع گزارش">
                  {REPORT_MODES.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-pressed={reportMode === item.key}
                      onClick={() => setReportMode(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === 'reports' && reportMode === 'monthly' ? (
              <section className="gov-content-grid">
                <article className="gov-card" data-span="12">
                  <div className="gov-card-head spread">
                    <div>
                      <strong>فیلتر ماه</strong>
                      <span>ماهِ سالِ مالی را انتخاب کنید. برای سالِ مالیِ منطبق با اول حمل، مرزها با تقویمِ شمسی هم‌تراز است.</span>
                    </div>
                    <div className="gov-quarter-switch">
                      {MONTH_OPTIONS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          className={selectedMonth === item.key ? 'active' : ''}
                          onClick={() => setSelectedMonth(item.key)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>

                <article className="gov-card" data-span="4">
                  <div className="gov-kpi-card spotlight">
                    <span>عواید ماه {selectedMonth}</span>
                    <strong>{formatMoney(payload.governmentMonthly?.summary?.totalIncome || 0)}</strong>
                    <small>{formatNumber(payload.governmentMonthly?.summary?.paymentCount || 0)} پرداخت</small>
                  </div>
                </article>
                <article className="gov-card" data-span="4">
                  <div className="gov-kpi-card spotlight" data-tone="mint">
                    <span>مصارف ماه</span>
                    <strong>{formatMoney(payload.governmentMonthly?.summary?.totalExpense || 0)}</strong>
                    <small>{formatNumber(payload.governmentMonthly?.summary?.expenseCount || 0)} ردیف مصرف</small>
                  </div>
                </article>
                <article className="gov-card" data-span="4">
                  <div className="gov-kpi-card spotlight" data-tone="slate">
                    <span>مانده ماه</span>
                    <strong>{formatMoney(payload.governmentMonthly?.summary?.balance || 0)}</strong>
                    <small>{formatNumber(payload.governmentMonthly?.summary?.classCount || 0)} ردیف صنفی</small>
                  </div>
                </article>

                <article className="gov-card" data-span="12">
                  <div className="gov-card-head">
                    <div>
                      <strong>جدول گزارش ماهانه</strong>
                      <span>تفکیک صنفیِ عواید و مصارفِ همان ماه از موتور گزارش رسمی.</span>
                    </div>
                  </div>
                  {!payload.governmentMonthly?.rows?.length ? (
                    <div className="gov-empty-state">برای این ماه و فیلترها ردیفی پیدا نشد.</div>
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
                          {payload.governmentMonthly.rows.map((row) => (
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

                <GovernmentBasisNote report={payload.governmentMonthly} />
              </section>
            ) : null}

            {activeTab === 'reports' && reportMode === 'quarterly' ? (
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
                  <span>تسویه مبتنی بر حساب خزانه را برای تعهدات تاییدشده و آماده پرداخت ثبت کنید.</span>
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
                      <AfghanDateInput name="settlementDate" value={procurementSettlementDraft.settlementDate} onChange={(value) => setProcurementSettlementDraft((current) => ({ ...current, settlementDate: value }))} showGregorianEquivalent />
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
                  <span>این گزارش از پرداخت فیس و ثبت مصارف برای ساخت نمای رسمی ربع‌وار استفاده می‌کند.</span>
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

            <GovernmentBasisNote report={payload.governmentQuarterly} />
              </section>
            ) : null}

            {activeTab === 'reports' && reportMode === 'annual' ? (
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
                  <span>پیش‌نمایش ردیف‌ها از موتور گزارش رسمی فعلی</span>
                </div>
              </div>
              {!payload.governmentAnnual?.rows?.length ? (
                <div className="gov-empty-state">برای سال و صنف فعلی ردیف قابل نمایش پیدا نشد.</div>
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

            <GovernmentBasisNote report={payload.governmentAnnual} />
              </section>
            ) : null}

            {activeTab === 'year' ? (
              <section className="gov-content-grid">
            <PanelBulkControls tabKey="year" />
            <CollapsiblePanel tabKey="year" panelKey="fy-status" title="وضعیت سال مالی" defaultOpen span="5">
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
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="fy-register" title="دفتر سال‌های مالی" defaultOpen span="7">
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
                      <span>{resolveFinancialYearStatusLabel(item.status)}</span>
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
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="budget-vs-actual" title="بودجه در برابر عملکرد واقعی" span="7" cardAttr="data-budget-summary-card">
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.expenseVariance || 0) > 0 && (budgetVsActual.summary?.annualExpenseBudget || 0) > 0 ? 'rose' : 'teal'}>
                  <span>بودجه مصارف</span>
                  <strong>{formatMoney(budgetVsActual.summary?.annualExpenseBudget || 0)}</strong>
                  <small>عملکرد واقعی {formatMoney(budgetVsActual.summary?.actualExpense || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.incomeVariance || 0) < 0 && (budgetVsActual.summary?.annualIncomeTarget || 0) > 0 ? 'copper' : 'mint'}>
                  <span>هدف درآمد</span>
                  <strong>{formatMoney(budgetVsActual.summary?.annualIncomeTarget || 0)}</strong>
                  <small>عملکرد واقعی {formatMoney(budgetVsActual.summary?.actualIncome || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.treasuryReserveVariance || 0) < 0 && (budgetVsActual.summary?.treasuryReserveTarget || 0) > 0 ? 'copper' : 'sand'}>
                  <span>هدف ذخیره</span>
                  <strong>{formatMoney(budgetVsActual.summary?.treasuryReserveTarget || 0)}</strong>
                  <small>مانده {formatMoney(budgetVsActual.summary?.treasuryReserveBalance || 0)}</small>
                </div>
                <div className="gov-governance-stat" data-tone={(budgetVsActual.summary?.overBudgetCategoryCount || 0) > 0 || (budgetVsActual.summary?.unbudgetedCategoryCount || 0) > 0 ? 'rose' : 'mint'}>
                  <span>فشار دسته‌بندی</span>
                  <strong>{formatNumber((budgetVsActual.summary?.overBudgetCategoryCount || 0) + (budgetVsActual.summary?.unbudgetedCategoryCount || 0))}</strong>
                  <small>{formatNumber(budgetVsActual.summary?.watchCategoryCount || 0)} مورد نیازمند پیگیری</small>
                </div>
              </div>
              {!budgetVsActual.alerts?.length ? (
                <div className="gov-readiness-good">سال مالی انتخاب شده در حال حاضر با اهداف بودجه تنظیم شده هماهنگ است.</div>
              ) : (
                <ul className="gov-readiness-list">
                  {budgetVsActual.alerts.map((item) => {
                    const translatedAlert = resolveGovernmentBudgetAlert(item);
                    return (
                      <li key={item.key} className="gov-readiness-item">
                        <strong>{translatedAlert.title}</strong>
                        <span>{translatedAlert.detail}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="budget-config" title="کنترل‌های بودجه" hint="ذخیرهٔ اهدافِ بودجه" span="5">
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
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="budget-approval" title="گردش کار تایید بودجه" defaultOpen span="12" cardAttr="data-budget-approval-card">
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone={selectedBudgetApproved ? 'mint' : selectedBudgetStage === 'rejected' ? 'rose' : selectedBudgetInReview ? 'copper' : 'slate'}>
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
                  <small>{selectedBudgetApproval.rejectReason || 'دلیل رد ثبت نشده است'}</small>
                </div>
              </div>
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-budget-request-review="true"
                  onClick={requestBudgetReview}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetApproval.configured || selectedFinancialYear?.isClosed || selectedBudgetInReview || selectedBudgetApproved}
                >
                  {String(busyAction || '').startsWith('budget-review-request-') ? 'در حال ارسال...' : 'ارسال بودجه برای بررسی'}
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  data-budget-approve="true"
                  onClick={() => reviewBudgetApproval('approve')}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetInReview}
                >
                  تایید مرحله بودجه
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  data-budget-reject="true"
                  onClick={() => reviewBudgetApproval('reject')}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetInReview}
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
                        <th>یادداشت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetRevisionHistory.slice().reverse().map((entry, index) => (
                        <tr key={`budget-revision-${index}`}>
                          <td>{formatNumber(entry.revisionNumber || entry.toVersion || 0)}</td>
                          <td>{formatNumber(entry.fromVersion || 0)} -&gt; {formatNumber(entry.toVersion || 0)}</td>
                          <td>{resolveBudgetApprovalActionLabel(entry.action)}</td>
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
                <div className="gov-empty-state compact">هنوز ردپای رسمی برای بودجه این سال مالی ثبت نشده است.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>سطح</th>
                        <th>اقدام</th>
                        <th>توسط</th>
                        <th>در تاریخ</th>
                        <th>یادداشت / دلیل</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedBudgetApproval.trail || []).slice().reverse().map((entry, index) => (
                        <tr key={`budget-trail-${index}`}>
                          <td>{resolveBudgetApprovalStageLabel(entry.level)}</td>
                          <td>{resolveBudgetApprovalActionLabel(entry.action)}</td>
                          <td>{entry.by?.name || '---'}</td>
                          <td>{toLocaleDateTime(entry.at)}</td>
                          <td>{entry.note || entry.reason || '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="budget-categories" title="بودجه بر اساس دسته‌بندی مصرف" span="12">
              <div className="gov-card-head">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-budget-category-save="true"
                  onClick={saveSelectedFinancialYearBudget}
                  disabled={!!busyAction || !selectedFinancialYearId || selectedFinancialYear?.isClosed}
                >
                  {String(busyAction || '').startsWith('save-budget-') ? 'در حال ثبت...' : 'ثبت بودجه دسته‌ها'}
                </button>
                <div>
                  <strong>بودجه بر اساس دسته‌بندی مصرف</strong>
                  <span>محدودیت‌های سالانه و ماهانه، آستانه‌های هشدار، و استفاده واقعی بر اساس دسته‌بندی مصرف.</span>
                </div>
              </div>
              <div className="gov-help-note compact">
                <div className="gov-help-note-copy">
                  <strong>راهنمای مقداردهی</strong>
                  <span>بودجه سالانه سقف کل همان دسته است. بودجه ماهانه سقف مصرف همان دسته در هر ماه است. آستانه هشدار معمولاً ۸۵٪ است؛ یعنی قبل از تمام‌شدن بودجه هشدار می‌دهد.</span>
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
                        <th>آستانه هشدار %</th>
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
                                placeholder="سقف سالانه"
                                value={draftBucket.annualBudget || ''}
                                onChange={(event) => handleSelectedYearCategoryBudgetChange(key, 'annualBudget', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                placeholder="سقف ماهانه"
                                value={draftBucket.monthlyBudget || ''}
                                onChange={(event) => handleSelectedYearCategoryBudgetChange(key, 'monthlyBudget', event.target.value)}
                              />
                            </td>
                            <td>
                              <input
                                placeholder="85"
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
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-budget-category-save-bottom="true"
                  onClick={saveSelectedFinancialYearBudget}
                  disabled={!!busyAction || !selectedFinancialYearId || selectedFinancialYear?.isClosed}
                >
                  {String(busyAction || '').startsWith('save-budget-') ? 'در حال ثبت بودجه دسته‌ها...' : 'ثبت و ذخیره بودجه دسته‌بندی‌ها'}
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  onClick={requestBudgetReview}
                  disabled={!!busyAction || !selectedFinancialYearId || !selectedBudgetApproval.configured || selectedFinancialYear?.isClosed || selectedBudgetInReview || selectedBudgetApproved}
                >
                  {String(busyAction || '').startsWith('budget-review-request-') ? 'در حال ارسال...' : 'ارسال بودجه برای بررسی'}
                </button>
              </div>
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="fy-create" title="ایجاد سال مالی جدید" span="6">
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
                  <AfghanDateInput name="startDate" value={financialYearDraft.startDate} onChange={(value) => setFinancialYearDraft((current) => ({ ...current, startDate: value }))} showGregorianEquivalent />
                  <small>{financialYearDraft.startDate ? `هجری شمسی: ${toFaDate(financialYearDraft.startDate)}` : 'تاریخ شروع انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>تاریخ ختم</span>
                  <AfghanDateInput name="endDate" value={financialYearDraft.endDate} onChange={(value) => setFinancialYearDraft((current) => ({ ...current, endDate: value }))} showGregorianEquivalent />
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
            </CollapsiblePanel>

            <CollapsiblePanel tabKey="year" panelKey="close-guard" title="گارد بستن سال" defaultOpen span="6">
              <div className="gov-card-head">
                <div>
                  <strong>موانعِ بستنِ سال</strong>
                  <span>موانعی که باید پیش از بستن سال مالی رفع شوند</span>
                </div>
                <button
                  type="button"
                  className="gov-primary-btn"
                  data-close-selected-financial-year="true"
                  onClick={() => closeFinancialYear(selectedFinancialYearId)}
                  disabled={!!busyAction || !selectedFinancialYearId || selectedFinancialYear?.isClosed || !expenseCloseReadiness?.canClose}
                >
                  {String(busyAction || '').startsWith('close-year-') ? 'در حال بستن...' : 'بستن سال مالی'}
                </button>
              </div>
              {selectedFinancialYear?.isClosed ? (
                <div className="gov-readiness-good">این سال مالی قبلاً بسته شده است.</div>
              ) : !expenseCloseReadiness?.canClose ? (
                <div className="gov-empty-state compact">برای فعال‌شدن دکمه بستن سال مالی، اول موانع زیر را رفع کنید.</div>
              ) : null}
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
            </CollapsiblePanel>

              </section>
            ) : null}

            {activeTab === 'operations' ? (
              <section className="gov-content-grid">
            <PanelBulkControls tabKey="operations" />
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
                subtitle="سهم دسته‌های رسمی در محدوده فعلی"
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

            <CollapsiblePanel
              tabKey="operations"
              panelKey="procurement-registry"
              title="تعهدات فروشنده"
              hint={`${formatNumber(procurementItems.length)} تعهد`}
              span="7"
              cardAttr="data-procurement-registry-card"
            >
              <div className="gov-governance-grid">
                <div className="gov-governance-stat" data-tone="teal">
                  <span>کل متعهد شده</span>
                  <strong>{formatMoney(procurementSummary.totalCommittedAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.totalCount || 0)} تعهد</small>
                </div>
                <div className="gov-governance-stat" data-tone="mint">
                  <span>پوشش داده شده توسط مصرف</span>
                  <strong>{formatMoney(procurementSummary.totalApprovedExpenseAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.approvedCount || 0)} تاییدشده</small>
                </div>
                <div className="gov-governance-stat" data-tone={(procurementSummary.totalOutstandingAmount || 0) > 0 ? 'copper' : 'sand'}>
                  <span>تعهدات باقیمانده</span>
                  <strong>{formatMoney(procurementSummary.totalOutstandingAmount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.openCommitmentCount || 0)} باز</small>
                </div>
                <div className="gov-governance-stat" data-tone="rose">
                  <span>فروشندگان</span>
                  <strong>{formatNumber(procurementSummary.vendorCount || 0)}</strong>
                  <small>{formatNumber(procurementSummary.pendingReviewCount || 0)} در حال بررسی</small>
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="procurement-settlement"
              title="تصفیه فروشنده"
              hint="تسویه از حساب خزانه"
              span="5"
              cardAttr="data-procurement-settlement-card"
            >
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
                      <AfghanDateInput name="settlementDate" value={procurementSettlementDraft.settlementDate} onChange={(value) => setProcurementSettlementDraft((current) => ({ ...current, settlementDate: value }))} showGregorianEquivalent />
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="procurement-form"
              title="ثبت تعهد خرید"
              hint="تعهد، فروشنده، مبلغ، تاریخ"
              span="12"
            >
              <div className="gov-form-grid">
                <label className="gov-field">
                  <span>عنوان</span>
                  <input name="title" value={procurementDraft.title} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>فروشنده</span>
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
                  <span>دسته</span>
                  <select name="category" value={procurementDraft.category} onChange={handleProcurementDraftChange}>
                    {expenseCategoryRegistry.map((item) => (
                      <option key={item._id || item.key} value={item.key}>{item.label || item.key}</option>
                    ))}
                  </select>
                </label>
                <label className="gov-field">
                  <span>زیردسته</span>
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
                  <AfghanDateInput name="requestDate" value={procurementDraft.requestDate} onChange={(value) => setProcurementDraft((current) => ({ ...current, requestDate: value }))} showGregorianEquivalent />
                  <small>{procurementDraft.requestDate ? `هجری شمسی: ${toFaDate(procurementDraft.requestDate)}` : 'تاریخ درخواست انتخاب نشده است.'}</small>
                </label>
                <label className="gov-field">
                  <span>تاریخ تحویل مورد انتظار</span>
                  <AfghanDateInput name="expectedDeliveryDate" value={procurementDraft.expectedDeliveryDate} onChange={(value) => setProcurementDraft((current) => ({ ...current, expectedDeliveryDate: value }))} showGregorianEquivalent />
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
                  <span>شرایط پرداخت</span>
                  <input name="paymentTerms" value={procurementDraft.paymentTerms} onChange={handleProcurementDraftChange} />
                </label>
                <label className="gov-field">
                  <span>وضعیت</span>
                  <select name="status" value={procurementDraft.status} onChange={handleProcurementDraftChange}>
                    <option value="draft">پیش‌نویس</option>
                    <option value="pending_review">ارسال برای بررسی</option>
                  </select>
                </label>
                <label className="gov-field gov-field-full">
                  <span>شرح</span>
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="category-registry"
              title="رجیستری رسمی دسته‌های مصرف"
              hint={`${formatNumber(expenseCategoryRegistry.length)} دسته`}
              span="7"
            >
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="category-form"
              title={categoryDraft.id ? 'ویرایش دسته رسمی' : 'ایجاد دسته رسمی'}
              hint="اثرِ فوری روی اعتبارسنجی و تحلیل"
              span="5"
            >
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="review-queue"
              title="صف تایید مصارف"
              hint={`${formatNumber(expenseQueueRows.length)} مورد`}
              defaultOpen
              span="12"
            >
              <div className="gov-approval-rule">
                تاییدِ نهاییِ یک مصرف فقط توسط <strong>ریاست عمومی</strong> انجام می‌شود. مدیر مالی و مدیر ارشد مالی
                فقط مصرف را به مرحلهٔ بعد می‌برند. هیچ کاربری نمی‌تواند دو بار در زنجیرهٔ یک مصرف تایید یا رد کند.
              </div>
              {!expenseQueueRows.length ? (
                <div className="gov-empty-state">در محدوده فعلی هیچ ردیف مصرفی در انتظار اقدام نیست.</div>
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
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="operations"
              panelKey="expense-ledger"
              title="دفتر ثبت مصارف"
              hint="ثبت ردیف تازه + مرور اخیر"
              defaultOpen
              span="12"
            >
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
                  <span>تعهد فروشنده</span>
                  <select
                    name="procurementCommitmentId"
                    value={expenseDraft.procurementCommitmentId}
                    onChange={handleExpenseDraftChange}
                  >
                    <option value="">بدون تعهد مرتبط</option>
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
                  <AfghanDateInput name="expenseDate" value={expenseDraft.expenseDate} onChange={(value) => setExpenseDraft((current) => ({ ...current, expenseDate: value }))} showGregorianEquivalent />
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
            </CollapsiblePanel>
              </section>
            ) : null}

            {activeTab === 'treasury' ? (
              <section className="gov-content-grid">
                <PanelBulkControls tabKey="treasury" />
                <CollapsiblePanel tabKey="treasury" panelKey="tr-1" title="فرماندهی خزانه و صندوق" defaultOpen span="12">
                  <div className="gov-help-note compact">
                    <div className="gov-help-note-copy">
                      <strong>نمای هوشمند خزانه</strong>
                      <span>بل‌ها و پلان‌ها پول قابل‌انتظار را نشان می‌دهند؛ خزانه نقد واقعی را نشان می‌دهد؛ تعهدات پیشرو از مانده آزاد کم می‌شوند.</span>
                    </div>
                  </div>
                  <div className="gov-governance-grid">
                    <div className="gov-governance-stat" data-tone="teal">
                      <span>پول قابل‌انتظار</span>
                      <strong>{formatMoney(intelligentTreasurySummary.expectedIncome || 0)}</strong>
                      <small>از بل‌ها، پلان‌ها و هدف درآمد</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(intelligentTreasurySummary.receivableBalance || 0) > 0 ? 'copper' : 'mint'}>
                      <span>باقی قابل دریافت</span>
                      <strong>{formatMoney(intelligentTreasurySummary.receivableBalance || 0)}</strong>
                      <small>{formatNumber(intelligentTreasurySummary.expectedCoveragePercent || 0)}٪ جمع‌آوری شده</small>
                    </div>
                    <div className="gov-governance-stat" data-tone="mint">
                      <span>نقد واقعی خزانه</span>
                      <strong>{formatMoney(intelligentTreasurySummary.realCashBalance || 0)}</strong>
                      <small>مانده حساب‌های خزانه</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(intelligentTreasurySummary.freeCashBalance || 0) > 0 ? 'teal' : 'rose'}>
                      <span>مانده آزاد بعد از تعهدات</span>
                      <strong>{formatMoney(intelligentTreasurySummary.freeCashBalance || 0)}</strong>
                      <small>نقد واقعی منهای تعهدات تاییدشده</small>
                    </div>
                  </div>
                  <div className="gov-governance-grid">
                    <div className="gov-governance-stat" data-tone="rose">
                      <span>مصارف ثبت‌شده</span>
                      <strong>{formatMoney(intelligentTreasurySummary.expenseOutflow || 0)}</strong>
                      <small>از گزارش مصارف و خزانه</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(intelligentTreasurySummary.approvedCommitmentBalance || 0) > 0 ? 'copper' : 'sand'}>
                      <span>تعهدات پیشرو</span>
                      <strong>{formatMoney(intelligentTreasurySummary.approvedCommitmentBalance || 0)}</strong>
                      <small>{formatNumber(procurementSummary.openCommitmentCount || 0)} تعهد باز</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(intelligentTreasurySummary.readyPayable || 0) > 0 ? 'copper' : 'mint'}>
                      <span>آماده پرداخت</span>
                      <strong>{formatMoney(intelligentTreasurySummary.readyPayable || 0)}</strong>
                      <small>{formatNumber(procurementSummary.settlementReadyCount || 0)} پرداخت قابل تسویه</small>
                    </div>
                    <div className="gov-governance-stat" data-tone={(intelligentTreasurySummary.realCashBalance || 0) >= (intelligentTreasurySummary.approvedCommitmentBalance || 0) ? 'mint' : 'rose'}>
                      <span>پوشش تعهدات</span>
                      <strong>{formatMoney((intelligentTreasurySummary.realCashBalance || 0) - (intelligentTreasurySummary.approvedCommitmentBalance || 0))}</strong>
                      <small>اگر منفی باشد، نقد فعلی تعهدات را پوشش نمی‌دهد</small>
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-2" title="گزارش پرداخت‌های پیشرو تعهدات" span="12">
                  {!approvedProcurementOptions.length && !settlementReadyProcurementOptions.length ? (
                    <div className="gov-empty-state compact">فعلاً تعهد تاییدشده یا پرداخت پیشرو برای خزانه وجود ندارد.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>تعهد</th>
                            <th>فروشنده</th>
                            <th>پرداخت پیشرو</th>
                            <th>حساب</th>
                            <th>تاریخ</th>
                            <th>وضعیت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {approvedProcurementOptions.slice(0, 8).map((item) => (
                            <tr key={item._id || item.id}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{item.title || item.referenceNo || 'تعهد خرید'}</strong>
                                  <span>{resolveProcurementTypeLabel(item.procurementType)}</span>
                                </div>
                              </td>
                              <td>{item.vendorName || '---'}</td>
                              <td>{formatMoney(item.payableReadyAmount || item.outstandingAmount || 0)}</td>
                              <td>{item.treasuryAccount?.title || item.treasuryAccount?.code || 'حساب تعیین نشده'}</td>
                              <td>{toFaDate(item.expectedDeliveryDate || item.requestDate || item.createdAt)}</td>
                              <td><ProcurementStatusBadge status={item.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-3" title="حساب‌های خودکار پرداخت شاگردان" span="12">
                  {!automaticStudentPaymentTreasuryAccounts.length ? (
                    <div className="gov-empty-state compact">
                      هنوز حساب خودکار پرداخت شاگردان ساخته نشده است. بعد از تایید پرداخت شاگرد یا بازخوانی تب خزانه، سیستم برای روش پرداخت مربوطه حساب خودکار می‌سازد.
                    </div>
                  ) : (
                    <div className="gov-governance-grid">
                      {automaticStudentPaymentTreasuryAccounts.map((item) => (
                        <div key={item._id || item.id || item.code} className="gov-governance-stat" data-tone={item.accountType === 'bank' ? 'copper' : item.accountType === 'hawala' ? 'sand' : 'mint'}>
                          <span>{item.title || item.code}</span>
                          <strong>{formatMoney(item.metrics?.bookBalance || 0)}</strong>
                          <small>{item.code || 'AUTO'} | {resolveTreasuryAccountTypeLabel(item.accountType)}</small>
                        </div>
                      ))}
                    </div>
                  )}
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-4" title="رجیستر حساب‌های خزانه" defaultOpen span="7">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-5" title="حساب خزانه" span="5">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-6" title="حرکت دستی خزانه" span="6">
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
                      <AfghanDateInput name="transactionDate" value={treasuryTransactionDraft.transactionDate} onChange={(value) => setTreasuryTransactionDraft((current) => ({ ...current, transactionDate: value }))} showGregorianEquivalent />
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-7" title="انتقال و تطبیق" span="6">
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
                      <AfghanDateInput name="transactionDate" value={treasuryTransferDraft.transactionDate} onChange={(value) => setTreasuryTransferDraft((current) => ({ ...current, transactionDate: value }))} showGregorianEquivalent />
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
                      <AfghanDateInput name="reconciliationDate" value={treasuryReconciliationDraft.reconciliationDate} onChange={(value) => setTreasuryReconciliationDraft((current) => ({ ...current, reconciliationDate: value }))} showGregorianEquivalent />
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-8" title="آخرین حرکات خزانه" defaultOpen span="12">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-9" title="گزارش‌های بستن خزانه" span="12">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-10" title="دفتر نقدی" span="7" cardAttr="data-treasury-cashbook-card">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-11" title="وضعیت تطبیق" span="5" cardAttr="data-treasury-reconciliation-card">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-12" title="خلاصه گردش" span="7">
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
                </CollapsiblePanel>

                <CollapsiblePanel tabKey="treasury" panelKey="tr-13" title="پیگیری مغایرت" span="5" cardAttr="data-treasury-variance-card">
                  {!treasuryVarianceReport.rows?.length ? (
                    <div className="gov-empty-state">برای فیلترهای انتخاب‌شده هیچ مغایرت خزانه شناسایی نشد.</div>
                  ) : (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>موضوع</th>
                            <th>مرجع</th>
                            <th>مبلغ</th>
                            <th>شدت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {treasuryVarianceReport.rows.map((row) => (
                            <tr key={row.key}>
                              <td>
                                <div className="gov-table-stack">
                                  <strong>{row.accountTitle || '---'}</strong>
                                  <span>{resolveTreasuryIssueLabel(row.issueType)}</span>
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
                </CollapsiblePanel>
              </section>
            ) : null}

            {activeTab === 'reports' && reportMode === 'archive' ? (
              <section className="gov-content-grid">
            <PanelBulkControls tabKey="archive" />

            <CollapsiblePanel tabKey="archive" panelKey="closed-months" title="ماه‌های بسته" span="5">
              <TimelineList items={(payload.closedMonths || []).slice(0, 12)} />
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="archive"
              panelKey="official-package"
              title="بستهٔ خروجی رسمی"
              hint="پیش‌نویس ← ثبت رسمیِ مقام دوم"
              defaultOpen
              span="7"
            >
              <div className="gov-card-actions">
                <button
                  type="button"
                  className="gov-primary-btn"
                  aria-label="ساخت پیش‌نویس نسخهٔ رسمی ربعوار"
                  onClick={() => generateSnapshot('quarterly')}
                  disabled={!!busyAction}
                >
                  {busyAction === 'snapshot-quarterly' ? 'در حال ساخت...' : 'ساخت پیش‌نویس ربعوار'}
                </button>
                <button
                  type="button"
                  className="gov-ghost-btn"
                  aria-label="ساخت پیش‌نویس نسخهٔ رسمی سالانه"
                  onClick={() => generateSnapshot('annual')}
                  disabled={!!busyAction}
                >
                  {busyAction === 'snapshot-annual' ? 'در حال ساخت...' : 'ساخت پیش‌نویس سالانه'}
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
                  ? 'در حال دانلود آخرین پی‌دی‌اف...'
                  : 'دانلود آخرین پی‌دی‌اف'}
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
                  آخرین رکورد: {latestSnapshot?.title || '---'} | نسخه {formatNumber(latestSnapshot?.version || 0)} | {resolveSnapshotStageLabel(latestSnapshot?.officialStage)} | تولیدکننده {latestSnapshot?.generatedBy?.name || '---'}
                  {latestSnapshot?.officialStage === 'ratified' && latestSnapshot?.ratifiedBy?.name ? ` | ثبت رسمی: ${latestSnapshot.ratifiedBy.name}` : ''}
                </p>
              </div>

              {latestSnapshotPack ? (
                <div className="gov-governance-grid" data-snapshot-pack-summary="true">
                  <div className="gov-governance-stat" data-tone="mint">
                    <span>مصارف تاییدشده</span>
                    <strong>{formatMoney(latestSnapshotPack.expenseAnalytics?.summary?.approvedAmount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.expenseAnalytics?.summary?.statusCounts?.approved || 0)} ردیف</small>
                  </div>
                  <div className="gov-governance-stat" data-tone="sand">
                    <span>مانده خزانه</span>
                    <strong>{formatMoney(latestSnapshotPack.treasuryAnalytics?.summary?.bookBalance || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.treasuryAnalytics?.summary?.accountCount || 0)} حساب</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveVariance || 0) < 0 ? 'copper' : 'teal'}>
                    <span>فاصله ذخیره</span>
                    <strong>{formatMoney(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveVariance || 0)}</strong>
                    <small>هدف {formatMoney(latestSnapshotPack.budgetVsActual?.summary?.treasuryReserveTarget || 0)}</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.budgetVsActual?.summary?.overBudgetCategoryCount || 0) > 0 ? 'rose' : 'mint'}>
                    <span>دسته‌های فراتر از بودجه</span>
                    <strong>{formatNumber(latestSnapshotPack.budgetVsActual?.summary?.overBudgetCategoryCount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.budgetVsActual?.summary?.unbudgetedCategoryCount || 0)} بدون بودجه</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={(latestSnapshotPack.procurementAnalytics?.summary?.totalOutstandingAmount || 0) > 0 ? 'copper' : 'teal'}>
                    <span>مانده تعهدات خرید</span>
                    <strong>{formatMoney(latestSnapshotPack.procurementAnalytics?.summary?.totalOutstandingAmount || 0)}</strong>
                    <small>{formatNumber(latestSnapshotPack.procurementAnalytics?.summary?.totalCount || 0)} تعهد</small>
                  </div>
                  <div className="gov-governance-stat" data-tone={latestSnapshotPack.budgetApproval?.stage === 'approved' ? 'mint' : latestSnapshotPack.budgetApproval?.stage === 'rejected' ? 'rose' : 'sand'}>
                    <span>تایید بودجه</span>
                    <strong>{resolveBudgetApprovalStageLabel(latestSnapshotPack.budgetApproval?.stage || 'draft')}</strong>
                    <small>{formatNumber((latestSnapshotPack.budgetApproval?.trail || []).length)} رویداد ردپا</small>
                  </div>
                </div>
              ) : null}

              {!payload.snapshots?.length ? (
                <div className="gov-empty-state">هنوز پیش‌نویس یا نسخهٔ رسمی برای این سال مالی ساخته نشده است.</div>
              ) : (
                <div className="gov-stack-section">
                  <div className="gov-table-wrap">
                    <table className="gov-table">
                      <thead>
                        <tr>
                          <th>نوع</th>
                          <th>ربع</th>
                          <th>نسخه</th>
                          <th>وضعیت</th>
                          <th>تولید</th>
                          <th>تولیدکننده</th>
                          <th>خالص</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.snapshots.map((item) => (
                          <tr key={item._id}>
                            <td>{resolveReportTypeLabel(item.reportType)}</td>
                            <td>{item.quarter || '---'}</td>
                            <td>{formatNumber(item.version || 1)}</td>
                            <td>
                              <span className="gov-snapshot-stage" data-stage={item.officialStage || 'draft'}>
                                {resolveSnapshotStageLabel(item.officialStage)}
                              </span>
                              {item.officialStage === 'ratified' && item.ratifiedBy?.name ? (
                                <small className="gov-snapshot-stage-by">با تایید {item.ratifiedBy.name}</small>
                              ) : null}
                              {item.officialStage === 'rejected' && item.rejectReason ? (
                                <small className="gov-snapshot-stage-by">دلیل: {item.rejectReason}</small>
                              ) : null}
                            </td>
                            <td>{toLocaleDateTime(item.generatedAt)}</td>
                            <td>{item.generatedBy?.name || '---'}</td>
                            <td>
                              <div className="gov-table-stack">
                                <strong>{formatMoney(item.summary?.balance ?? item.summary?.netProfit ?? 0)}</strong>
                                {item.officialStage === 'draft' ? (
                                  <>
                                    <button
                                      type="button"
                                      className="gov-inline-action"
                                      data-snapshot-ratify={item._id}
                                      onClick={() => ratifySnapshot(item._id)}
                                      disabled={!!busyAction}
                                    >
                                      {busyAction === `snapshot-ratify-${item._id}` ? '...' : 'ثبت رسمی'}
                                    </button>
                                    <button
                                      type="button"
                                      className="gov-inline-action"
                                      data-snapshot-reject={item._id}
                                      onClick={() => rejectSnapshot(item._id)}
                                      disabled={!!busyAction}
                                    >
                                      {busyAction === `snapshot-reject-${item._id}` ? '...' : 'رد'}
                                    </button>
                                  </>
                                ) : null}
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-snapshot-pdf={item._id}
                                  onClick={() => downloadSnapshotPdf(item._id)}
                                  disabled={!!busyAction}
                                >
                                  {busyAction === `snapshot-pdf-${item._id}` ? '...' : 'پی‌دی‌اف'}
                                </button>
                                <button
                                  type="button"
                                  className="gov-inline-action"
                                  data-snapshot-csv={item._id}
                                  onClick={() => downloadSnapshotCsv(item._id)}
                                  disabled={!!busyAction}
                                >
                                  {busyAction === `snapshot-csv-${item._id}` ? '...' : 'CSV'}
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
            </CollapsiblePanel>

            <SnapshotChainPanel
              snapshots={payload.snapshots || []}
              chainStatus={chainStatus}
              onVerify={verifySnapshotChain}
              busy={busyAction === 'snapshot-verify-chain'}
            />

            <CollapsiblePanel
              tabKey="archive"
              panelKey="archive-register"
              title="راجستر آرشیف دولتی"
              hint="بسته‌های آرشیفی + اعتبارسنجی"
              span="7"
              cardAttr="data-government-archive-card"
            >
              {!governmentDocumentArchive.length ? (
                <div className="gov-empty-state">هنوز هیچ سند آرشیفی دولتی برای نسخه گزارش ساخته نشده است.</div>
              ) : (
                <div className="gov-table-wrap">
                  <table className="gov-table">
                    <thead>
                      <tr>
                        <th>سند</th>
                        <th>نوع</th>
                        <th>تولید شده</th>
                        <th>اعتبارسنجی</th>
                        <th>ارسال</th>
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
                          <td>{resolveDocumentTypeLabel(item.documentType)}</td>
                          <td>{toLocaleDateTime(item.generatedAt)}</td>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{item.verification?.code || item.verificationCode || '---'}</strong>
                              <span>{item.verification?.url || item.verificationUrl || '---'}</span>
                            </div>
                          </td>
                          <td>
                            <div className="gov-table-stack">
                              <strong>{ARCHIVE_DELIVERY_STATUS_LABELS[String(item.lastDeliveryStatus || '').trim()] || (item.lastDeliveryStatus || 'ارسال نشده')}</strong>
                              <span>{item.lastDeliveredAt ? toLocaleDateTime(item.lastDeliveredAt) : '---'}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CollapsiblePanel>

            <CollapsiblePanel
              tabKey="archive"
              panelKey="archive-delivery"
              title="ارسال آرشیف"
              hint="ارسال از مرکز ارسال مالی"
              span="5"
              cardAttr="data-government-archive-delivery-card"
            >
              {!selectedGovernmentArchive ? (
                <div className="gov-empty-state">برای آغاز ارسال، ابتدا پی‌دی‌اف نسخه گزارش دولتی را بسازید یا خروجی بگیرید.</div>
              ) : (
                <>
                  <div className="gov-form-grid">
                    <label className="gov-field gov-field-full">
                      <span>سند آرشیفی</span>
                      <select name="archiveId" value={archiveDeliveryDraft.archiveId} onChange={handleArchiveDeliveryDraftChange}>
                        {governmentDocumentArchive.map((item) => (
                          <option key={item._id || item.id} value={item._id || item.id}>
                            {item.documentNo || item.title || item._id || item.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field">
                      <span>کانال</span>
                      <select name="channel" value={archiveDeliveryDraft.channel} onChange={handleArchiveDeliveryDraftChange}>
                        {Object.entries(DELIVERY_CHANNEL_LABELS).map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="gov-field gov-field-full">
                      <span>گیرندگان</span>
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
                    <span>گیرندگان مرتبط با محدوده سند آرشیفی نیز آگاه شوند</span>
                  </label>
                  <div className="gov-mini-stack" data-government-archive-selected="true">
                    <div className="gov-mini-stat" data-tone="teal">
                      <span>سند</span>
                      <strong>{selectedGovernmentArchive.documentNo || '---'}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone="sand">
                      <span>کانال</span>
                      <strong>{resolveDeliveryChannelLabel(archiveDeliveryDraft.channel)}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone={selectedGovernmentArchive.deliveryCount ? 'mint' : 'sand'}>
                      <span>تعداد ارسال</span>
                      <strong>{formatNumber(selectedGovernmentArchive.deliveryCount || 0)}</strong>
                    </div>
                    <div className="gov-mini-stat" data-tone={selectedGovernmentArchive.liveStatus?.tone || 'sand'}>
                      <span>وضعیت زنده</span>
                      <strong>{selectedGovernmentArchive.liveStatus?.label || ARCHIVE_DELIVERY_STATUS_LABELS[String(selectedGovernmentArchive.lastDeliveryStatus || '').trim()] || 'ارسال نشده'}</strong>
                    </div>
                  </div>
                  {selectedGovernmentArchive.deliveryLog?.length ? (
                    <div className="gov-table-wrap">
                      <table className="gov-table">
                        <thead>
                          <tr>
                            <th>کانال</th>
                            <th>وضعیت</th>
                            <th>گیرنده</th>
                            <th>ارایه‌کننده</th>
                            <th>ارسال شده</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(selectedGovernmentArchive.deliveryLog || []).slice().reverse().map((entry, index) => (
                            <tr key={`archive-delivery-log-${index}`}>
                              <td>{resolveDeliveryChannelLabel(entry.channel)}</td>
                              <td>{ARCHIVE_DELIVERY_STATUS_LABELS[String(entry.status || '').trim()] || entry.status || '---'}</td>
                              <td>{entry.recipient || 'گیرندگان مرتبط'}</td>
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
                      {busyAction === `deliver-government-archive-${selectedGovernmentArchive?._id || ''}` ? 'در حال افزودن به صف ارسال...' : 'ارسال بسته آرشیفی'}
                    </button>
                  </div>
                </>
              )}
            </CollapsiblePanel>

              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
