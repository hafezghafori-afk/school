import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './Dashboard.css';
import '../components/dashboard/dashboard.css';
import DashboardShell from '../components/dashboard/DashboardShell';
import KpiRingCard from '../components/dashboard/KpiRingCard';
import QuickActionRail from '../components/dashboard/QuickActionRail';
import TaskAlertPanel from '../components/dashboard/TaskAlertPanel';
import TrendBars from '../components/dashboard/TrendBars';
import { API_BASE } from '../config/api';
import { downloadBlob, errorMessage, fetchBlob } from './adminWorkspaceUtils';

const ORDER_STATUS_LABELS = {
  new: 'جدید',
  partial: 'نیمه‌تصفیه',
  paid: 'تصفیه',
  overdue: 'معوق',
  void: 'باطل'
};

const PAYMENT_STATUS_LABELS = {
  pending: 'در انتظار',
  approved: 'تاییدشده',
  rejected: 'ردشده'
};

const PAYMENT_STAGE_LABELS = {
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'تایید ریاست عمومی',
  completed: 'تکمیل‌شده',
  rejected: 'ردشده'
};

const PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'دستی',
  gateway: 'آنلاین',
  other: 'سایر'
};

const RELIEF_TYPE_LABELS = {
  scholarship_full: 'بورسیه کامل',
  scholarship_partial: 'بورسیه جزئی',
  charity_support: 'حمایت خیریه',
  free_student: 'معافیت کامل',
  sibling_discount: 'تخفیف خواهر/برادر',
  merit_discount: 'تخفیف شایستگی',
  transport_discount: 'تخفیف ترانسپورت',
  admission_discount: 'تخفیف داخله',
  waiver: 'معافیت',
  manual: 'تسهیلات مالی'
};

const RELIEF_COVERAGE_LABELS = {
  fixed: 'مبلغ ثابت',
  percent: 'درصدی',
  full: 'پوشش کامل'
};

const SIGNAL_TYPE_LABELS = {
  overpayment: 'بیش‌پرداخت',
  full_relief_with_open_balance: 'بل باز با تسهیل کامل',
  relief_expiring: 'تسهیل رو به ختم',
  long_overdue_balance: 'معوق بیش از سه ماه',
  pending_payment_stalled: 'پرداخت معطل در بررسی',
  admission_missing: 'داخله ثبت نشده'
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getRole = () => localStorage.getItem('role') || '';
const getName = () => localStorage.getItem('userName') || 'سرپرست محترم';

const nf = new Intl.NumberFormat('fa-AF-u-ca-persian');
const dtf = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});
const ddf = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
});

const toFaNumber = (value) => nf.format(Number(value || 0));
const formatMoney = (value) => `${toFaNumber(value)} AFN`;
const formatPercent = (value) => `${toFaNumber(Number(value || 0).toFixed ? Number(value || 0).toFixed(1) : value)}%`;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return ddf.format(date);
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return dtf.format(date);
};

const toDateTimeInputValue = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return local.toISOString().slice(0, 16);
};

const safeFetchJson = async (url) => {
  try {
    const response = await fetch(url, { headers: { ...getAuthHeaders() } });
    return await response.json().catch(() => ({}));
  } catch {
    return { success: false };
  }
};

const buildStudentTarget = (item = {}) => String(item.studentCoreId || item.studentUserId || item.id || '').trim();
const labelFor = (map, value, fallback = '-') => map[String(value || '').trim()] || fallback;

function formatReliefValue(item = {}) {
  if (item.coverageMode === 'full') return 'پوشش کامل';
  if (item.coverageMode === 'percent') return `${toFaNumber(item.percentage || 0)}%`;
  return formatMoney(item.amount || 0);
}

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildParentStatementHtml({
  linkedStudent,
  financeStatement,
  financeOrders,
  financePayments,
  financeReliefs
} = {}) {
  const totals = financeStatement?.totals || {};
  const pack = financeStatement?.pack || {};
  const ordersRows = (financeOrders || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.title || item.orderNumber || '-')}</td>
      <td>${escapeHtml(labelFor(ORDER_STATUS_LABELS, item.status, item.status || '-'))}</td>
      <td>${escapeHtml(formatDate(item.dueDate))}</td>
      <td>${escapeHtml(formatMoney(item.amountDue || 0))}</td>
      <td>${escapeHtml(formatMoney(item.outstandingAmount || 0))}</td>
    </tr>
  `).join('');
  const paymentRows = (financePayments || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.paymentNumber || '-')}</td>
      <td>${escapeHtml(labelFor(PAYMENT_METHOD_LABELS, item.paymentMethod, item.paymentMethod || '-'))}</td>
      <td>${escapeHtml(labelFor(PAYMENT_STATUS_LABELS, item.status, item.status || '-'))}</td>
      <td>${escapeHtml(formatDateTime(item.paidAt))}</td>
      <td>${escapeHtml(formatMoney(item.amount || 0))}</td>
    </tr>
  `).join('');
  const reliefRows = (financeReliefs || []).map((item) => `
    <tr>
      <td>${escapeHtml(labelFor(RELIEF_TYPE_LABELS, item.reliefType, item.reliefType || '-'))}</td>
      <td>${escapeHtml(labelFor(RELIEF_COVERAGE_LABELS, item.coverageMode, item.coverageMode || '-'))}</td>
      <td>${escapeHtml(formatReliefValue(item))}</td>
      <td>${escapeHtml(formatDate(item.endDate))}</td>
    </tr>
  `).join('');
  const signalRows = (Array.isArray(pack?.signals) ? pack.signals : []).map((item) => `
    <tr>
      <td>${escapeHtml(SIGNAL_TYPE_LABELS[item.anomalyType] || item.anomalyType || 'سیگنال مالی')}</td>
      <td>${escapeHtml(item.title || '-')}</td>
      <td>${escapeHtml(item.amountLabel || '-')}</td>
      <td>${escapeHtml(formatDateTime(item.dueDate || item.endDate || item.at))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>استیتمنت مالی متعلم</title>
      <style>
        body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; }
        h1, h2, p { margin: 0 0 10px; }
        .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #f8fafc; }
        .signal { border-right: 4px solid #f59e0b; background: #fff7ed; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-size: 13px; }
        th { background: #e2e8f0; }
        .section { margin-top: 22px; }
      </style>
    </head>
    <body>
      <h1>استیتمنت مالی متعلم</h1>
      <p>نام متعلم: ${escapeHtml(linkedStudent?.name || 'متعلم')}</p>
      <div class="meta">
        <div class="card">صنف: ${escapeHtml(linkedStudent?.classTitle || '-')}</div>
        <div class="card">سال تعلیمی: ${escapeHtml(linkedStudent?.academicYearTitle || '-')}</div>
        <div class="card">کد عضویت: ${escapeHtml(linkedStudent?.membershipId || '-')}</div>
        <div class="card">تاریخ تولید: ${escapeHtml(formatDateTime(financeStatement?.generatedAt))}</div>
      </div>
      <div class="summary">
        <div class="card">کل بل‌ها: ${escapeHtml(toFaNumber(totals.totalOrders || 0))}</div>
        <div class="card">کل پرداخت‌ها: ${escapeHtml(toFaNumber(totals.totalPayments || 0))}</div>
        <div class="card">جمع بدهی: ${escapeHtml(formatMoney(totals.totalDue || 0))}</div>
        <div class="card">پرداخت‌شده: ${escapeHtml(formatMoney(totals.totalPaid || 0))}</div>
        <div class="card">باقی‌مانده: ${escapeHtml(formatMoney(totals.totalOutstanding || 0))}</div>
        <div class="card">تسهیلات فعال: ${escapeHtml(toFaNumber(totals.totalReliefs || 0))}</div>
      </div>
      <div class="card signal">
        <strong>اقدام پیشنهادی</strong>
        <p>${escapeHtml(pack?.recommendedAction || 'بدون اقدام خاص')}</p>
        <p>سیگنال‌ها: ${escapeHtml(toFaNumber(pack?.summary?.total || 0))} | حساس: ${escapeHtml(toFaNumber(pack?.summary?.critical || 0))}</p>
      </div>
      <div class="section">
        <h2>سیگنال‌های مالی</h2>
        <table>
          <thead><tr><th>نوع</th><th>شرح</th><th>مقدار</th><th>تاریخ مرجع</th></tr></thead>
          <tbody>${signalRows || '<tr><td colspan="4">سیگنال حساسی ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>بل‌های باز</h2>
        <table>
          <thead><tr><th>عنوان</th><th>وضعیت</th><th>سررسید</th><th>مبلغ</th><th>باقی‌مانده</th></tr></thead>
          <tbody>${ordersRows || '<tr><td colspan="5">داده‌ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>پرداخت‌ها</h2>
        <table>
          <thead><tr><th>شماره</th><th>روش</th><th>وضعیت</th><th>تاریخ</th><th>مبلغ</th></tr></thead>
          <tbody>${paymentRows || '<tr><td colspan="5">داده‌ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>تسهیلات مالی</h2>
        <table>
          <thead><tr><th>نوع</th><th>پوشش</th><th>مقدار</th><th>تاریخ ختم</th></tr></thead>
          <tbody>${reliefRows || '<tr><td colspan="4">داده‌ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
  </html>`;
}

export default function ParentDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const role = getRole();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [receiptForm, setReceiptForm] = useState({
    billId: '',
    amount: '',
    paymentMethod: 'bank_transfer',
    paidAt: toDateTimeInputValue(new Date()),
    referenceNo: '',
    note: '',
    file: null
  });
  const [receiptMessage, setReceiptMessage] = useState('');
  const [receiptMessageType, setReceiptMessageType] = useState('info');
  const [submittingReceipt, setSubmittingReceipt] = useState(false);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [receiptInputKey, setReceiptInputKey] = useState(0);

  const studentId = useMemo(() => (
    new URLSearchParams(location.search).get('studentId') || ''
  ), [location.search]);

  const fetchDashboardPayload = async () => {
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
    return safeFetchJson(`${API_BASE}/api/dashboard/parent${query}`);
  };

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      const data = await fetchDashboardPayload();
      if (!cancelled) {
        setDashboard(data?.success ? data : null);
        setLoading(false);
      }
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const summary = dashboard?.summary || {
    attendanceRate: 0,
    averageScore: 0,
    outstandingAmount: 0,
    paidAmount: 0,
    pendingHomework: 0,
    upcomingLessons: 0,
    activeReliefs: 0,
    pendingPayments: 0,
    overdueOrders: 0,
    expiringReliefs: 0
  };
  const financeSummary = dashboard?.financeSummary || {
    activeReliefs: 0,
    fixedReliefAmount: 0,
    percentReliefCount: 0,
    fullReliefCount: 0,
    pendingPayments: 0,
    overdueOrders: 0,
    dueSoonOrders: 0,
    expiringReliefs: 0,
    lastPaymentAt: null
  };
  const linkedStudents = Array.isArray(dashboard?.linkedStudents) ? dashboard.linkedStudents : [];
  const linkedStudent = dashboard?.linkedStudent || null;
  const financeStatement = dashboard?.financeStatement || null;
  const statementTotals = financeStatement?.totals || {};
  const financeBreakdown = Array.isArray(dashboard?.financeBreakdown) ? dashboard.financeBreakdown : [];
  const financeOrders = Array.isArray(dashboard?.financeOrders) ? dashboard.financeOrders : [];
  const financePayments = Array.isArray(dashboard?.financePayments) ? dashboard.financePayments : [];
  const financeReliefs = Array.isArray(dashboard?.financeReliefs) ? dashboard.financeReliefs : [];
  const receiptUploadOrders = useMemo(() => (
    financeOrders.filter((item) => item?.supportsReceiptUpload && Number(item?.outstandingAmount || 0) > 0)
  ), [financeOrders]);

  useEffect(() => {
    if (!receiptUploadOrders.length) {
      setReceiptForm((current) => ({
        ...current,
        billId: '',
        amount: '',
        file: null
      }));
      return;
    }

    setReceiptForm((current) => {
      const nextBillId = receiptUploadOrders.some((item) => item.id === current.billId)
        ? current.billId
        : receiptUploadOrders[0].id;
      const activeOrder = receiptUploadOrders.find((item) => item.id === nextBillId) || receiptUploadOrders[0];
      return {
        ...current,
        billId: nextBillId,
        amount: (!current.billId || current.billId !== nextBillId || !current.amount)
          ? String(Number(activeOrder?.outstandingAmount || 0))
          : current.amount
      };
    });
  }, [receiptUploadOrders]);

  const selectedReceiptOrder = useMemo(() => (
    receiptUploadOrders.find((item) => item.id === receiptForm.billId) || receiptUploadOrders[0] || null
  ), [receiptUploadOrders, receiptForm.billId]);

  const totalFinanceScope = Number(summary.paidAmount || 0) + Number(summary.outstandingAmount || 0);
  const financeProgress = totalFinanceScope ? (Number(summary.paidAmount || 0) / totalFinanceScope) * 100 : 0;
  const attendanceProgress = Math.min(100, Number(summary.attendanceRate || 0));
  const scoreProgress = Math.min(100, Number(summary.averageScore || 0));
  const homeworkProgress = Math.min(100, Number(summary.pendingHomework || 0) * 20);
  const reliefProgress = Math.min(100, Number(summary.activeReliefs || 0) * 20);

  const handleStudentChange = (event) => {
    const nextStudentId = String(event.target.value || '').trim();
    const params = new URLSearchParams(location.search);
    if (nextStudentId) params.set('studentId', nextStudentId);
    else params.delete('studentId');
    navigate({
      pathname: location.pathname,
      search: params.toString() ? `?${params.toString()}` : '',
      hash: location.hash || ''
    });
  };

  const handleReceiptFieldChange = (event) => {
    const { name, value } = event.target;
    setReceiptForm((current) => ({
      ...current,
      [name]: value
    }));
  };

  const handleReceiptOrderChange = (event) => {
    const nextBillId = String(event.target.value || '').trim();
    const nextOrder = receiptUploadOrders.find((item) => item.id === nextBillId) || null;
    setReceiptForm((current) => ({
      ...current,
      billId: nextBillId,
      amount: nextOrder ? String(Number(nextOrder.outstandingAmount || 0)) : current.amount
    }));
  };

  const handleReceiptFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setReceiptForm((current) => ({
      ...current,
      file
    }));
  };

  const openParentStatement = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) {
      setReceiptMessage('بازکردن پیش‌نمایش استیتمنت در مرورگر مسدود شد.');
      setReceiptMessageType('error');
      return;
    }
    popup.document.open();
    popup.document.write(buildParentStatementHtml({
      linkedStudent,
      financeStatement,
      financeOrders,
      financePayments,
      financeReliefs
    }));
    popup.document.close();
    popup.focus();
  };

  const downloadParentStatement = async () => {
    if (!linkedStudent?.membershipId) {
      setReceiptMessage('برای این متعلم بسته استیتمنت قابل دانلود پیدا نشد.');
      setReceiptMessageType('error');
      return;
    }
    try {
      setDownloadingStatement(true);
      const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
      const { blob, filename } = await fetchBlob(`/api/dashboard/parent/statement-pack.pdf${query}`, {}, {
        method: 'GET'
      });
      downloadBlob(blob, filename || `parent-finance-statement-${linkedStudent.membershipId}.pdf`);
      setReceiptMessage('نسخه PDF استیتمنت مالی با موفقیت دانلود شد.');
      setReceiptMessageType('info');
    } catch (error) {
      setReceiptMessage(errorMessage(error, 'دانلود نسخه PDF استیتمنت مالی ناموفق بود.'));
      setReceiptMessageType('error');
    } finally {
      setDownloadingStatement(false);
    }
  };

  const submitParentReceipt = async (event) => {
    event.preventDefault();
    if (!selectedReceiptOrder) {
      setReceiptMessage('ابتدا یک بل قابل پرداخت را انتخاب کنید.');
      setReceiptMessageType('error');
      return;
    }
    if (!receiptForm.file) {
      setReceiptMessage('فایل رسید را انتخاب کنید.');
      setReceiptMessageType('error');
      return;
    }

    try {
      setSubmittingReceipt(true);
      setReceiptMessage('');
      const formData = new FormData();
      formData.append('amount', receiptForm.amount || '0');
      formData.append('paymentMethod', receiptForm.paymentMethod || 'manual');
      formData.append('paidAt', receiptForm.paidAt || '');
      formData.append('referenceNo', receiptForm.referenceNo || '');
      formData.append('note', receiptForm.note || '');
      formData.append('receipt', receiptForm.file);
      const endpoint = selectedReceiptOrder?.submissionMode === 'canonical_payment'
        ? `${API_BASE}/api/finance/parent/payments`
        : `${API_BASE}/api/finance/parent/receipts`;
      if (selectedReceiptOrder?.submissionMode === 'canonical_payment') {
        formData.append('studentMembershipId', linkedStudent?.membershipId || '');
        formData.append('feeOrderId', selectedReceiptOrder.id || '');
      } else {
        formData.append('billId', selectedReceiptOrder?.sourceBillId || '');
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          ...getAuthHeaders()
        },
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || `Request failed (${response.status})`);
      }

      const refreshed = await fetchDashboardPayload();
      setDashboard(refreshed?.success ? refreshed : null);
      setReceiptMessage(payload?.message || 'رسید ثبت شد و برای بررسی مالی ارسال گردید.');
      setReceiptMessageType('success');
      setReceiptInputKey((current) => current + 1);
      setReceiptForm((current) => ({
        ...current,
        amount: selectedReceiptOrder ? String(Number(selectedReceiptOrder.outstandingAmount || 0)) : '',
        referenceNo: '',
        note: '',
        file: null
      }));
    } catch (error) {
      setReceiptMessage(error?.message || 'ثبت رسید توسط ولی/سرپرست ناموفق بود.');
      setReceiptMessageType('error');
    } finally {
      setSubmittingReceipt(false);
    }
  };

  const quickActions = role === 'parent'
    ? [
        { to: `${location.pathname}${location.search}#finance`, label: 'وضعیت فیس', caption: 'بدهی، رسید و باقی‌مانده', tone: 'copper' },
        { to: `${location.pathname}${location.search}#finance-workbench`, label: 'بل‌ها و رسیدها', caption: 'پیگیری آخرین حرکت‌های مالی', tone: 'teal' },
        { to: `${location.pathname}${location.search}#reliefs`, label: 'تسهیلات مالی', caption: 'بورسیه، تخفیف و حمایت', tone: 'mint' },
        { to: `${location.pathname}${location.search}#tasks`, label: 'کارهای باز', caption: 'هشدارها و پیگیری‌ها', tone: 'slate' }
      ]
    : [
        { to: '/student-report', label: 'گزارش شاگرد', caption: 'مرکز گزارش شاگردان', tone: 'teal' },
        { to: '/admin-finance', label: 'مرکز مالی', caption: 'پیگیری فیس و پرداخت', tone: 'copper' },
        { to: '/admin-reports', label: 'گزارش‌های مدیریتی', caption: 'تحلیل و خروجی', tone: 'mint' },
        { to: '/profile', label: 'حساب کاربری', caption: 'تنظیمات حساب', tone: 'slate' }
      ];

  const stats = (
    <>
      <div>
        <KpiRingCard
          label="نرخ حاضری"
          value={formatPercent(summary.attendanceRate)}
          hint={`${toFaNumber(summary.upcomingLessons)} درس امروز`}
          progress={attendanceProgress}
          tone="teal"
        />
      </div>
      <div>
        <KpiRingCard
          label="میانگین نمرات"
          value={`${toFaNumber(summary.averageScore)} / 100`}
          hint="خلاصه آخرین نتایج"
          progress={scoreProgress}
          tone="mint"
        />
      </div>
      <div>
        <KpiRingCard
          label="پرداخت‌شده"
          value={formatMoney(summary.paidAmount)}
          hint={`${formatMoney(summary.outstandingAmount)} باقی‌مانده`}
          progress={financeProgress}
          tone="copper"
        />
      </div>
      <div>
        <KpiRingCard
          label="تسهیلات فعال"
          value={toFaNumber(summary.activeReliefs)}
          hint={`${formatMoney(financeSummary.fixedReliefAmount)} پوشش ثابت`}
          progress={reliefProgress}
          tone="teal"
        />
      </div>
      <div>
        <KpiRingCard
          label="کارهای باز"
          value={toFaNumber(summary.pendingHomework)}
          hint={`${toFaNumber(summary.pendingPayments)} رسید در انتظار`}
          progress={homeworkProgress}
          tone="rose"
        />
      </div>
    </>
  );

  const hero = (
    <div className="dash-hero">
      <div>
        <h2>داشبورد والدین و سرپرستان</h2>
        <p>
          {dashboard?.setupNeeded
            ? (dashboard?.message || 'برای این حساب هنوز متعلمی وصل نشده است. از دفتر گزارش شاگرد، حساب والد را به متعلم وصل کنید.')
            : `سلام ${getName()}، وضعیت آموزشی و مالی ${linkedStudent?.name || 'متعلم'} را به شکل یک‌جا ببینید و موارد مهم را سریع پیگیری کنید.`}
        </p>
        <div className="dash-meta">
          <span>متعلم فعال: {linkedStudent?.name || '—'}</span>
          <span>صنف: {linkedStudent?.classTitle || '—'}</span>
          <span>سال تعلیمی: {linkedStudent?.academicYearTitle || '—'}</span>
          <span>رابطه: {linkedStudent?.relation || '—'}</span>
        </div>
      </div>
      <div className="dash-hero-actions dash-form-grid">
        {linkedStudents.length > 1 ? (
          <label className="dash-form-grid">
            <span className="muted">انتخاب متعلم</span>
            <select value={buildStudentTarget(linkedStudent)} onChange={handleStudentChange}>
              {linkedStudents.map((item) => (
                <option key={buildStudentTarget(item)} value={buildStudentTarget(item)}>
                  {item.name}{item.classTitle ? ` - ${item.classTitle}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {!loading && dashboard?.message ? <div className="dash-note">{dashboard.message}</div> : null}
        {role !== 'parent' ? (
          <Link className="dash-btn ghost" to="/student-report">
            بازگشت به گزارش شاگرد
          </Link>
        ) : null}
      </div>
    </div>
  );

  const main = (
    <>
      <div id="finance" className="dash-card dashboard-summary-card">
        <div className="dashboard-summary-card__head">
          <div>
            <h3>خلاصه مالی متعلم</h3>
            <p className="muted">بدهی، پرداخت، رسیدهای در انتظار و تسهیلات فعال را از همین بخش دنبال کنید.</p>
          </div>
          <div className="dashboard-summary-card__note">
            {financeSummary.lastPaymentAt
              ? `آخرین پرداخت: ${formatDateTime(financeSummary.lastPaymentAt)}`
              : 'هنوز پرداخت تاییدشده‌ای ثبت نشده است.'}
          </div>
        </div>
        <div className="dashboard-summary-card__grid">
          <div className="dash-summary-card">
            <span>پرداخت‌شده</span>
            <strong>{formatMoney(summary.paidAmount)}</strong>
          </div>
          <div className="dash-summary-card danger">
            <span>باقی‌مانده</span>
            <strong>{formatMoney(summary.outstandingAmount)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>رسیدهای در انتظار</span>
            <strong>{toFaNumber(summary.pendingPayments)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>بل‌های معوق</span>
            <strong>{toFaNumber(summary.overdueOrders)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>تسهیلات فعال</span>
            <strong>{toFaNumber(summary.activeReliefs)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>رو به ختم</span>
            <strong>{toFaNumber(summary.expiringReliefs)}</strong>
          </div>
        </div>
      </div>

      <div className="dash-card" data-testid="parent-finance-statement">
        <div className="dash-card-header">
          <h3>استیتمنت مالی</h3>
          <div className="dash-actions">
            <span className="status">
              {toFaNumber(statementTotals.totalOrders || financeOrders.length)} سند مالی
            </span>
            <button
              type="button"
              className="dash-btn ghost"
              onClick={downloadParentStatement}
              disabled={downloadingStatement || !linkedStudent}
              data-testid="download-parent-statement"
            >
              {downloadingStatement ? 'در حال دانلود...' : 'دانلود PDF'}
            </button>
            <button
              type="button"
              className="dash-btn ghost"
              onClick={openParentStatement}
              disabled={!linkedStudent}
            >
              چاپ استیتمنت
            </button>
          </div>
        </div>
        <div className="dash-summary-grid">
          <div className="dash-summary-card">
            <span>جمع بدهی</span>
            <strong>{formatMoney(statementTotals.totalDue || summary.outstandingAmount || 0)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>جمع پرداخت</span>
            <strong>{formatMoney(statementTotals.totalPaid || summary.paidAmount || 0)}</strong>
          </div>
          <div className="dash-summary-card danger">
            <span>مانده کلی</span>
            <strong>{formatMoney(statementTotals.totalOutstanding || summary.outstandingAmount || 0)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>تعداد تسهیلات</span>
            <strong>{toFaNumber(statementTotals.totalReliefs || financeReliefs.length || 0)}</strong>
          </div>
        </div>
        <div className="dash-inline-meta">
          <span>تاریخ تولید: <strong>{formatDateTime(financeStatement?.generatedAt || dashboard?.generatedAt)}</strong></span>
          <span>تعداد بل‌ها: <strong>{toFaNumber(statementTotals.totalOrders || financeOrders.length)}</strong></span>
          <span>تعداد پرداخت‌ها: <strong>{toFaNumber(statementTotals.totalPayments || financePayments.length)}</strong></span>
        </div>
        {financeStatement?.pack ? (
          <div className="dash-inline-meta">
            <span>اقدام پیشنهادی: <strong>{financeStatement.pack.recommendedAction || 'بدون اقدام خاص'}</strong></span>
            <span>سیگنال‌های مالی: <strong>{toFaNumber(financeStatement.pack.summary?.total || 0)}</strong></span>
            <span>حساس: <strong>{toFaNumber(financeStatement.pack.summary?.critical || 0)}</strong></span>
          </div>
        ) : null}
        {!financeStatement ? (
          <div className="dash-note">استیتمنت فعلاً از داده‌های فعلی داشبورد ساخته می‌شود و با به‌روزرسانی بعدی کامل‌تر خواهد شد.</div>
        ) : null}
      </div>

      <div className="dash-card">
        <TrendBars
          title="جزئیات مالی"
          subtitle="تفکیک کلی outstanding، receiptها و reliefها برای متعلم انتخاب‌شده"
          items={financeBreakdown.map((item) => ({
            id: item.label,
            label: item.label,
            value: item.value,
            meta: item.meta
          }))}
          valueKey="value"
          valueFormatter={(value) => (Number(value || 0) > 100 ? formatMoney(value) : toFaNumber(value))}
          emptyText="برای این متعلم هنوز جزئیات مالی قابل‌نمایش ثبت نشده است."
        />
      </div>

      <div id="finance-workbench" className="dash-card" data-testid="parent-finance-workbench">
        <div className="dash-card-header">
          <h3>پیگیری مالی فعال</h3>
          <span className="status pending">
            {toFaNumber(financeSummary.dueSoonOrders)} سررسید نزدیک
          </span>
        </div>
        <div className="dash-summary-grid">
          <div className="dash-summary-card">
            <span>بل‌های باز</span>
            <strong>{toFaNumber(financeOrders.length)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>رسیدهای اخیر</span>
            <strong>{toFaNumber(financePayments.length)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>حمایت‌های درصدی</span>
            <strong>{toFaNumber(financeSummary.percentReliefCount)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>پوشش کامل</span>
            <strong>{toFaNumber(financeSummary.fullReliefCount)}</strong>
          </div>
        </div>
        <div className="dash-list">
          {!financeOrders.length ? (
            <div className="dash-note">برای این متعلم فعلاً بل باز مالی وجود ندارد.</div>
          ) : financeOrders.map((item) => (
            <div key={item.id} className="dash-list-item">
              <div>
                <strong>{item.title || item.orderNumber}</strong>
                <span>
                  {labelFor(ORDER_STATUS_LABELS, item.status, item.status || '-')}
                  {' | '}
                  سررسید: {formatDate(item.dueDate)}
                  {item.periodLabel ? ` | ${item.periodLabel}` : ''}
                </span>
              </div>
              <span className="dash-tag">{formatMoney(item.outstandingAmount)}</span>
            </div>
          ))}
        </div>
      </div>

      {role === 'parent' ? (
        <div id="receipt-submission" className="dash-card" data-testid="parent-receipt-form">
          <div className="dash-card-header">
            <h3>ارسال رسید توسط ولی/سرپرست</h3>
            <span className="status">
              {toFaNumber(receiptUploadOrders.length)} بل قابل ارسال
            </span>
          </div>
          {!receiptUploadOrders.length ? (
            <div className="dash-note">
              در حال حاضر بدهی بازی برای ارسال رسید یا ثبت پرداخت از این داشبورد پیدا نشد.
            </div>
          ) : (
            <form className="dash-form-grid parent-receipt-form" onSubmit={submitParentReceipt}>
              <label className="dash-form-grid">
                <span className="muted">بل مورد نظر</span>
                <select name="billId" value={receiptForm.billId} onChange={handleReceiptOrderChange}>
                  {receiptUploadOrders.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || item.orderNumber} - {formatMoney(item.outstandingAmount)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="parent-receipt-form__row">
                <label className="dash-form-grid">
                  <span className="muted">مبلغ رسید</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="amount"
                    value={receiptForm.amount}
                    onChange={handleReceiptFieldChange}
                  />
                </label>
                <label className="dash-form-grid">
                  <span className="muted">روش پرداخت</span>
                  <select name="paymentMethod" value={receiptForm.paymentMethod} onChange={handleReceiptFieldChange}>
                    <option value="bank_transfer">انتقال بانکی</option>
                    <option value="hawala">حواله</option>
                    <option value="cash">نقدی</option>
                    <option value="manual">ثبت دستی</option>
                    <option value="other">سایر</option>
                  </select>
                </label>
              </div>
              <div className="parent-receipt-form__row">
                <label className="dash-form-grid">
                  <span className="muted">تاریخ پرداخت</span>
                  <input
                    type="datetime-local"
                    name="paidAt"
                    value={receiptForm.paidAt}
                    onChange={handleReceiptFieldChange}
                  />
                </label>
                <label className="dash-form-grid">
                  <span className="muted">شماره مرجع</span>
                  <input
                    type="text"
                    name="referenceNo"
                    value={receiptForm.referenceNo}
                    onChange={handleReceiptFieldChange}
                    placeholder="شماره تراکنش یا حواله"
                  />
                </label>
              </div>
              <label className="dash-form-grid">
                <span className="muted">فایل رسید</span>
                <input
                  key={receiptInputKey}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={handleReceiptFileChange}
                />
              </label>
              <label className="dash-form-grid">
                <span className="muted">یادداشت</span>
                <textarea
                  name="note"
                  rows="3"
                  value={receiptForm.note}
                  onChange={handleReceiptFieldChange}
                  placeholder="اگر توضیحی برای دفتر مالی دارید، اینجا ثبت کنید."
                />
              </label>
              <div className="dash-inline-meta">
                <span>بل انتخاب‌شده: <strong>{selectedReceiptOrder?.title || selectedReceiptOrder?.orderNumber || '—'}</strong></span>
                <span>مانده فعلی: <strong>{formatMoney(selectedReceiptOrder?.outstandingAmount || 0)}</strong></span>
                <span>سررسید: <strong>{formatDate(selectedReceiptOrder?.dueDate)}</strong></span>
              </div>
              {receiptMessage ? (
                <div className={`dash-note ${receiptMessageType === 'error' ? 'danger' : 'success'}`}>
                  {receiptMessage}
                </div>
              ) : null}
              <div className="parent-receipt-form__actions">
                <button type="submit" className="dash-btn" disabled={submittingReceipt}>
                  {submittingReceipt ? 'در حال ارسال...' : 'ارسال رسید'}
                </button>
                <button
                  type="button"
                  className="dash-btn ghost"
                  onClick={() => {
                    setReceiptForm((current) => ({
                      ...current,
                      amount: selectedReceiptOrder ? String(Number(selectedReceiptOrder.outstandingAmount || 0)) : '',
                      referenceNo: '',
                      note: '',
                      file: null
                    }));
                    setReceiptInputKey((current) => current + 1);
                    setReceiptMessage('');
                  }}
                  disabled={submittingReceipt}
                >
                  پاک‌سازی فرم
                </button>
              </div>
            </form>
          )}
          {!receiptUploadOrders.length && receiptMessage ? (
            <div className={`dash-note ${receiptMessageType === 'error' ? 'danger' : 'success'}`}>
              {receiptMessage}
            </div>
          ) : null}
        </div>
      ) : null}

      <div id="receipts" className="dash-card" data-testid="parent-finance-payments">
        <div className="dash-card-header">
          <h3>رسیدها و پرداخت‌های اخیر</h3>
          <span className="status">
            {toFaNumber(summary.pendingPayments)} مورد در انتظار تایید
          </span>
        </div>
        <div className="dash-list">
          {!financePayments.length ? (
            <div className="dash-note">هنوز receipt یا payment قابل‌نمایش ثبت نشده است.</div>
          ) : financePayments.map((item) => (
            <div key={item.id} className="dash-list-item">
              <div>
                <strong>{item.paymentNumber || 'پرداخت مالی'}</strong>
                <span>
                  {labelFor(PAYMENT_METHOD_LABELS, item.paymentMethod, item.paymentMethod || 'پرداخت')}
                  {' | '}
                  {labelFor(PAYMENT_STATUS_LABELS, item.status, item.status || '-')}
                  {' | '}
                  {labelFor(PAYMENT_STAGE_LABELS, item.approvalStage, item.approvalStage || '-')}
                </span>
              </div>
              <span className="dash-tag">{formatMoney(item.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      <div id="attendance" className="dash-card">
        <div className="dash-card-header">
          <h3>وضعیت آموزشی</h3>
          <span className="status">مرور سریع</span>
        </div>
        <div className="dash-summary-grid">
          <div className="dash-summary-card">
            <span>نرخ حاضری</span>
            <strong>{formatPercent(summary.attendanceRate)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>میانگین نمرات</span>
            <strong>{toFaNumber(summary.averageScore)}</strong>
          </div>
          <div className="dash-summary-card">
            <span>درس‌های امروز</span>
            <strong>{toFaNumber(summary.upcomingLessons)}</strong>
          </div>
          <div className="dash-summary-card danger">
            <span>کارهای باز</span>
            <strong>{toFaNumber(summary.pendingHomework)}</strong>
          </div>
        </div>
        <div className="dash-inline-meta">
          <span>آخرین به‌روزرسانی: <strong>{formatDateTime(dashboard?.generatedAt)}</strong></span>
          <span>کد عضویت: <strong>{linkedStudent?.membershipId || '—'}</strong></span>
        </div>
      </div>

      <div id="tasks" className="dash-card">
        <TaskAlertPanel
          title="کارهای نیازمند پیگیری"
          subtitle="مهم‌ترین مواردی که والد یا سرپرست باید پیگیری کند"
          items={(dashboard?.tasks || []).map((item) => ({
            id: item.id,
            title: item.label,
            subtitle: item.meta,
            meta: item.tone === 'rose' ? 'فوری' : item.tone === 'copper' ? 'نیازمند توجه' : 'عادی'
          }))}
          emptyText="در حال حاضر کار باز مهمی برای این متعلم دیده نمی‌شود."
          actionLabel={role === 'parent' ? 'حساب کاربری' : 'گزارش شاگرد'}
          actionTo={role === 'parent' ? '/profile' : '/student-report'}
        />
      </div>
    </>
  );

  const side = (
    <>
      <div id="schedule" className="dash-panel">
        <h3>برنامه امروز</h3>
        {!dashboard?.schedule?.length && <div className="dash-note">برای امروز برنامه‌ای برای نمایش ثبت نشده است.</div>}
        {(dashboard?.schedule || []).map((item) => (
          <div key={item.id} className="dash-panel-row">
            <span>{item.label}</span>
            <span>{item.meta}</span>
          </div>
        ))}
      </div>

      <div className="dash-panel">
        <h3>هشدارها</h3>
        {!dashboard?.alerts?.length && <div className="dash-note">هشدار فعالی برای این متعلم وجود ندارد.</div>}
        {(dashboard?.alerts || []).map((item) => (
          <div key={item.id} className="dash-panel-row">
            <span>{item.label}</span>
            <span>{item.meta}</span>
          </div>
        ))}
      </div>

      <div id="reliefs" className="dash-panel" data-testid="parent-finance-reliefs">
        <h3>تسهیلات فعال</h3>
        {!financeReliefs.length && <div className="dash-note">تسهیل مالی فعالی برای این متعلم ثبت نشده است.</div>}
        {financeReliefs.map((item) => (
          <div key={item.id} className="dash-panel-row">
            <span>
              {labelFor(RELIEF_TYPE_LABELS, item.reliefType, item.reliefType || 'تسهیلات مالی')}
              <br />
              <small>
                {labelFor(RELIEF_COVERAGE_LABELS, item.coverageMode, item.coverageMode || '-')}
                {item.sponsorName ? ` | ${item.sponsorName}` : ''}
              </small>
            </span>
            <span>{formatReliefValue(item)} تا {formatDate(item.endDate)}</span>
          </div>
        ))}
      </div>

      <div className="dash-panel">
        <h3>فهرست متعلمین وصل‌شده</h3>
        {!linkedStudents.length && <div className="dash-note">هنوز متعلمی به این حساب وصل نشده است.</div>}
        {linkedStudents.map((item) => {
          const target = buildStudentTarget(item);
          const isActive = target && target === buildStudentTarget(linkedStudent);
          return (
            <Link
              key={target || item.name}
              className="dash-panel-link"
              to={`/parent-dashboard${target ? `?studentId=${encodeURIComponent(target)}` : ''}`}
            >
              <span>{item.name}</span>
              <span>{isActive ? 'فعال' : (item.classTitle || 'بدون صنف')}</span>
            </Link>
          );
        })}
      </div>
    </>
  );

  if (!loading && !dashboard) {
    return (
      <section className="dash-page parent-dashboard-page">
        <div className="dash-empty">
          <h2>دریافت داشبورد والدین ناموفق بود</h2>
          <p className="muted">در حال حاضر اطلاعات لازم برای این بخش دریافت نشد. لطفاً صفحه را دوباره بازخوانی کنید.</p>
        </div>
      </section>
    );
  }

  return (
    <DashboardShell
      className="parent-dashboard-page"
      hero={hero}
      stats={stats}
      quickActions={<QuickActionRail actions={quickActions} className="dash-quick" />}
      main={main}
      side={side}
    />
  );
}
