import React, { useEffect, useMemo, useState } from 'react';
import './StudentFinance.css';
import {
  buildApiUrl,
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  formatNumber,
  getAuthHeaders,
  toLocaleDateTime
} from './adminWorkspaceUtils';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const ORDER_STATUS_LABELS = {
  new: 'جدید',
  partial: 'پرداخت قسمتی',
  paid: 'تسویه شده',
  overdue: 'معوق',
  void: 'باطل'
};

const PAYMENT_STATUS_LABELS = {
  pending: 'در انتظار بررسی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  completed: 'نهایی شده'
};

const PAYMENT_STAGE_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'در انتظار آمریت مالی',
  general_president_review: 'در انتظار ریاست عمومی',
  completed: 'تکمیل شده',
  rejected: 'رد شده'
};

const FEE_STATUS_LABELS = {
  clear: 'تصفیه',
  due: 'نیازمند پرداخت',
  overdue: 'معوق',
  under_review: 'در حال بررسی'
};

const LINK_SCOPE_LABELS = {
  student: 'متعلم',
  membership: 'عضویت',
  class: 'صنف',
  shared: 'مشترک'
};

const ORDER_TYPE_LABELS = {
  tuition: 'شهریه',
  admission: 'داخله',
  transport: 'ترانسپورت',
  exam: 'امتحان',
  document: 'اسناد',
  service: 'خدمت',
  registration: 'ثبت نام',
  fine: 'جریمه',
  other: 'سایر'
};

const TRANSPORT_STATUS_LABELS = {
  active: 'فعال',
  inactive: 'غیرفعال'
};

const RELIEF_TYPE_LABELS = {
  discount: 'تخفیف',
  sibling_discount: 'تخفیف خواهر/برادر',
  waiver: 'معافیت',
  free_student: 'متعلم رایگان',
  scholarship_partial: 'بورسیه جزئی',
  scholarship_full: 'بورسیه کامل',
  charity_support: 'حمایت خیریه',
  manual: 'ثبت دستی'
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

function statusClass(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function pickLabel(map, key, fallback = '-') {
  return map[key] || key || fallback;
}

function formatCurrency(value, currency = 'AFN') {
  return `${formatNumber(value)} ${currency}`;
}

function toFaDate(value) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '-';
}

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildStudentStatementHtml({
  studentName = 'متعلم',
  membership = null,
  statement = {},
  orders = [],
  payments = [],
  reliefs = []
} = {}) {
  const totals = statement?.totals || {};
  const pack = statement?.pack || {};
  const signalRows = (Array.isArray(pack?.signals) ? pack.signals : []).map((item) => `
    <tr>
      <td>${escapeHtml(SIGNAL_TYPE_LABELS[item.anomalyType] || item.anomalyType || 'سیگنال مالی')}</td>
      <td>${escapeHtml(item.title || '-')}</td>
      <td>${escapeHtml(item.amountLabel || '-')}</td>
      <td>${escapeHtml(toLocaleDateTime(item.dueDate || item.endDate || item.at))}</td>
    </tr>
  `).join('');
  const ordersRows = (orders || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.title || item.orderNumber || '-')}</td>
      <td>${escapeHtml(pickLabel(ORDER_TYPE_LABELS, item.orderType, item.orderType || '-'))}</td>
      <td>${escapeHtml(pickLabel(ORDER_STATUS_LABELS, item.status, item.status || '-'))}</td>
      <td>${escapeHtml(toLocaleDateTime(item.dueDate))}</td>
      <td>${escapeHtml(formatCurrency(item.amountDue, item.currency || statement.currency || 'AFN'))}</td>
      <td>${escapeHtml(formatCurrency(item.outstandingAmount, item.currency || statement.currency || 'AFN'))}</td>
    </tr>
  `).join('');
  const paymentRows = (payments || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.paymentNumber || '-')}</td>
      <td>${escapeHtml(pickLabel(PAYMENT_STATUS_LABELS, item.status, item.status || '-'))}</td>
      <td>${escapeHtml(pickLabel(PAYMENT_STAGE_LABELS, item.approvalStage, item.approvalStage || '-'))}</td>
      <td>${escapeHtml(toLocaleDateTime(item.paidAt))}</td>
      <td>${escapeHtml(formatCurrency(item.amount, item.currency || statement.currency || 'AFN'))}</td>
    </tr>
  `).join('');
  const reliefRows = (reliefs || []).map((item) => `
    <tr>
      <td>${escapeHtml(pickLabel(RELIEF_TYPE_LABELS, item.reliefType, item.reliefType || '-'))}</td>
      <td>${escapeHtml(pickLabel(RELIEF_COVERAGE_LABELS, item.coverageMode, item.coverageMode || '-'))}</td>
      <td>${escapeHtml(item.coverageMode === 'full' ? '100%' : item.coverageMode === 'percent' ? `${formatNumber(item.percentage)}%` : formatCurrency(item.amount, statement.currency || 'AFN'))}</td>
      <td>${escapeHtml(toLocaleDateTime(item.endDate))}</td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>بسته استیتمنت مالی</title>
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
      <h1>بسته استیتمنت مالی متعلم</h1>
      <p>نام متعلم: ${escapeHtml(studentName)}</p>
      <div class="meta">
        <div class="card">صنف: ${escapeHtml(membership?.schoolClass?.title || '-')}</div>
        <div class="card">سال تعلیمی: ${escapeHtml(membership?.academicYear?.title || '-')}</div>
        <div class="card">شناسه عضویت: ${escapeHtml(membership?.id || '-')}</div>
        <div class="card">تاریخ تولید: ${escapeHtml(toLocaleDateTime(statement?.generatedAt))}</div>
      </div>
      <div class="summary">
        <div class="card">کل بل‌ها: ${escapeHtml(String(totals.totalOrders || 0))}</div>
        <div class="card">کل پرداخت‌ها: ${escapeHtml(String(totals.totalPayments || 0))}</div>
        <div class="card">جمع بدهی: ${escapeHtml(formatCurrency(totals.totalDue || 0, statement.currency || 'AFN'))}</div>
        <div class="card">پرداخت‌شده: ${escapeHtml(formatCurrency(totals.totalPaid || 0, statement.currency || 'AFN'))}</div>
        <div class="card">مانده: ${escapeHtml(formatCurrency(totals.totalOutstanding || 0, statement.currency || 'AFN'))}</div>
        <div class="card">تسهیلات فعال: ${escapeHtml(String(totals.totalReliefs || 0))}</div>
      </div>
      <div class="card signal">
        <strong>اقدام پیشنهادی</strong>
        <p>${escapeHtml(pack?.recommendedAction || 'بدون اقدام خاص')}</p>
        <p>سیگنال‌ها: ${escapeHtml(String(pack?.summary?.total || 0))} مورد | حساس: ${escapeHtml(String(pack?.summary?.critical || 0))}</p>
      </div>
      <div class="section">
        <h2>سیگنال‌های مالی</h2>
        <table>
          <thead><tr><th>نوع</th><th>شرح</th><th>مقدار</th><th>تاریخ مرجع</th></tr></thead>
          <tbody>${signalRows || '<tr><td colspan="4">سیگنال حساسی ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>بل‌ها</h2>
        <table>
          <thead><tr><th>عنوان</th><th>نوع</th><th>وضعیت</th><th>سررسید</th><th>مبلغ</th><th>مانده</th></tr></thead>
          <tbody>${ordersRows || '<tr><td colspan="6">داده‌ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>پرداخت‌ها</h2>
        <table>
          <thead><tr><th>شماره</th><th>وضعیت</th><th>مرحله</th><th>تاریخ</th><th>مبلغ</th></tr></thead>
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

function buildAggregateSummary(items = []) {
  return items.reduce((acc, item) => {
    const summary = item?.summary || {};
    const eligibility = item?.eligibilitySummary || {};
    acc.memberships += 1;
    acc.totalOrders += Number(summary.totalOrders || 0);
    acc.totalPayments += Number(summary.totalPayments || 0);
    acc.totalOutstanding += Number(summary.totalOutstanding || 0);
    acc.pendingPayments += Number(summary.pendingPayments || 0);
    acc.overdueOrders += Number(summary.overdueOrders || 0);
    acc.totalReliefs += Number(summary.totalReliefs || item?.reliefs?.length || 0);
    if (eligibility.eligible) acc.eligibleMemberships += 1;
    return acc;
  }, {
    memberships: 0,
    totalOrders: 0,
    totalPayments: 0,
    totalOutstanding: 0,
    pendingPayments: 0,
    overdueOrders: 0,
    totalReliefs: 0,
    eligibleMemberships: 0
  });
}

export default function StudentFinance() {
  const [items, setItems] = useState([]);
  const [selectedMembershipId, setSelectedMembershipId] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [paymentInputKey, setPaymentInputKey] = useState(0);
  const [paymentForm, setPaymentForm] = useState({
    feeOrderId: '',
    amount: '',
    paidAt: toGregorianDateInputValue(new Date()),
    paymentMethod: 'cash',
    referenceNo: '',
    note: '',
    file: null
  });

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchJson('/api/student-finance/me/overviews');
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems(nextItems);
      setSelectedMembershipId((current) => {
        if (current && nextItems.some((item) => String(item?.membership?.id || '') === current)) {
          return current;
        }
        return String(nextItems[0]?.membership?.id || '');
      });
      setMessage(nextItems.length ? '' : 'هنوز برای شما عضویت مالی فعال ثبت نشده است.');
      setMessageType(nextItems.length ? 'info' : 'error');
    } catch (error) {
      setItems([]);
      setSelectedMembershipId('');
      setMessage(errorMessage(error, 'دریافت وضعیت مالی متعلم ناموفق بود.'));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const membershipOptions = useMemo(() => items.map((item) => ({
    value: String(item?.membership?.id || ''),
    label: [
      item?.membership?.schoolClass?.title,
      item?.membership?.academicYear?.title,
      item?.membership?.status ? `(${item.membership.status})` : ''
    ].filter(Boolean).join(' - ')
  })), [items]);

  const selectedOverview = useMemo(() => (
    items.find((item) => String(item?.membership?.id || '') === selectedMembershipId) || items[0] || null
  ), [items, selectedMembershipId]);

  const aggregateSummary = useMemo(() => buildAggregateSummary(items), [items]);

  const studentName = selectedOverview?.membership?.student?.fullName || 'متعلم';
  const membership = selectedOverview?.membership || null;
  const summary = selectedOverview?.summary || {};
  const statement = selectedOverview?.statement || {};
  const eligibility = selectedOverview?.eligibilitySummary || {};
  const orders = Array.isArray(selectedOverview?.orders) ? selectedOverview.orders : [];
  const payments = Array.isArray(selectedOverview?.payments) ? selectedOverview.payments : [];
  const discounts = Array.isArray(selectedOverview?.discounts) ? selectedOverview.discounts : [];
  const exemptions = Array.isArray(selectedOverview?.exemptions) ? selectedOverview.exemptions : [];
  const reliefs = Array.isArray(selectedOverview?.reliefs) ? selectedOverview.reliefs : [];
  const transportFees = Array.isArray(selectedOverview?.transportFees) ? selectedOverview.transportFees : [];
  const latestApprovedPayment = statement?.latestApprovedPayment || null;
  const latestPendingPayment = statement?.latestPendingPayment || null;
  const statementTotals = statement?.totals || {};
  const statementPack = statement?.pack || { summary: {}, signals: [] };
  const payableOrders = useMemo(() => orders.filter((item) => ['new', 'partial', 'overdue'].includes(String(item?.status || ''))), [orders]);
  const selectedPayableOrder = useMemo(() => (
    payableOrders.find((item) => String(item?.id || '') === String(paymentForm.feeOrderId || '')) || payableOrders[0] || null
  ), [payableOrders, paymentForm.feeOrderId]);

  useEffect(() => {
    if (!payableOrders.length) {
      setPaymentForm((current) => ({
        ...current,
        feeOrderId: '',
        amount: '',
        file: null
      }));
      return;
    }

    setPaymentForm((current) => {
      const nextOrderId = payableOrders.some((item) => String(item?.id || '') === String(current.feeOrderId || ''))
        ? current.feeOrderId
        : String(payableOrders[0]?.id || '');
      const activeOrder = payableOrders.find((item) => String(item?.id || '') === String(nextOrderId || '')) || payableOrders[0];
      const nextAmount = current.amount
        ? current.amount
        : String(Number(activeOrder?.outstandingAmount || 0));
      return {
        ...current,
        feeOrderId: nextOrderId,
        amount: nextAmount
      };
    });
  }, [selectedMembershipId, payableOrders]);

  const printStatement = () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer');
    if (!popup) {
      setMessage('باز کردن پیش‌نمایش بسته استیتمنت در مرورگر مسدود شد.');
      setMessageType('error');
      return;
    }
    popup.document.open();
    popup.document.write(buildStudentStatementHtml({
      studentName,
      membership,
      statement,
      orders,
      payments,
      reliefs
    }));
    popup.document.close();
    popup.focus();
  };

  const downloadStatementPack = async () => {
    if (!membership?.id) {
      setMessage('برای این عضویت بسته استیتمنت قابل دانلود پیدا نشد.');
      setMessageType('error');
      return;
    }
    try {
      setDownloadingStatement(true);
      const { blob, filename } = await fetchBlob(`/api/student-finance/memberships/${membership.id}/statement-pack.pdf`, {}, {
        method: 'GET'
      });
      downloadBlob(blob, filename || `student-finance-statement-${membership.id}.pdf`);
      setMessage('نسخه PDF استیتمنت مالی با موفقیت دانلود شد.');
      setMessageType('info');
    } catch (error) {
      setMessage(errorMessage(error, 'دانلود نسخه PDF استیتمنت مالی ناموفق بود.'));
      setMessageType('error');
    } finally {
      setDownloadingStatement(false);
    }
  };

  const submitStudentPayment = async (event) => {
    event.preventDefault();
    if (!membership?.id) {
      setMessage('برای این عضویت ثبت پرداخت ممکن نیست.');
      setMessageType('error');
      return;
    }
    if (!selectedPayableOrder?.id) {
      setMessage('ابتدا یک بدهی باز را انتخاب کنید.');
      setMessageType('error');
      return;
    }
    if (!paymentForm.file) {
      setMessage('فایل رسید را انتخاب کنید.');
      setMessageType('error');
      return;
    }

    try {
      setSubmittingPayment(true);
      const formData = new FormData();
      formData.append('amount', paymentForm.amount || '0');
      formData.append('paymentMethod', paymentForm.paymentMethod || 'cash');
      formData.append('paidAt', paymentForm.paidAt || '');
      formData.append('referenceNo', paymentForm.referenceNo || '');
      formData.append('note', paymentForm.note || '');
      formData.append('receipt', paymentForm.file);

      const endpoint = selectedPayableOrder?.sourceBillId
        ? '/api/finance/student/receipts'
        : '/api/finance/student/payments';
      if (selectedPayableOrder?.sourceBillId) {
        formData.append('billId', selectedPayableOrder.sourceBillId);
      } else {
        formData.append('studentMembershipId', membership.id || '');
        formData.append('feeOrderId', selectedPayableOrder.id || '');
      }

      const response = await fetch(buildApiUrl(endpoint), {
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

      await loadData({ silent: true });
      setMessage(payload?.message || 'پرداخت ثبت شد و برای بررسی مالی ارسال گردید.');
      setMessageType('info');
      setPaymentInputKey((current) => current + 1);
      setPaymentForm((current) => ({
        ...current,
        amount: selectedPayableOrder ? String(Number(selectedPayableOrder.outstandingAmount || 0)) : '',
        referenceNo: '',
        note: '',
        file: null
      }));
    } catch (error) {
      setMessage(error?.message || 'ثبت پرداخت ناموفق بود.');
      setMessageType('error');
    } finally {
      setSubmittingPayment(false);
    }
  };

  return (
    <section className="student-finance-shell">
      <div className="student-finance-page">
        <div className="student-finance-hero">
          <div>
            <button type="button" className="student-finance-back" onClick={() => window.history.back()}>
              بازگشت
            </button>
            <h1>نمای مالی متعلم</h1>
            <p>
              این صفحه از هسته اصلی مالی خوانده می‌شود و وضعیت هر عضویت، فیس‌ها، پرداخت‌ها، تخفیف‌ها،
              ترانسپورت و امکان صدور کارت امتحان را در یک نمای واحد نشان می‌دهد.
            </p>
          </div>
          <div className="student-finance-hero-meta">
            <strong>{studentName}</strong>
            <span>{membership?.schoolClass?.title || 'صنف نامشخص'}</span>
            <span>{membership?.academicYear?.title || 'سال تعلیمی نامشخص'}</span>
          </div>
        </div>

        {message ? <div className={`student-finance-message ${messageType}`}>{message}</div> : null}

        <div className="student-finance-summary-grid">
          <article className="student-finance-summary-card accent-teal">
            <span>عضویت های فعال</span>
            <strong>{aggregateSummary.memberships}</strong>
          </article>
          <article className="student-finance-summary-card accent-amber">
            <span>جمع مانده کل</span>
            <strong>{formatCurrency(aggregateSummary.totalOutstanding)}</strong>
          </article>
          <article className="student-finance-summary-card accent-slate">
            <span>پرداخت های ثبت شده</span>
            <strong>{aggregateSummary.totalPayments}</strong>
          </article>
          <article className="student-finance-summary-card accent-green">
            <span>عضویت‌های مجاز</span>
            <strong>{aggregateSummary.eligibleMemberships}</strong>
          </article>
          <article className="student-finance-summary-card accent-teal">
            <span>تسهیلات فعال</span>
            <strong>{aggregateSummary.totalReliefs}</strong>
          </article>
        </div>

        <div className="student-finance-grid">
          <article className="student-finance-card" data-span="5">
            <div className="student-finance-card-head">
              <div>
                <h2>انتخاب عضویت</h2>
                <p>هر ردیف مالی به یک عضویت مشخص وصل است. از اینجا نمای فعال را تغییر بدهید.</p>
              </div>
              <button type="button" className="student-finance-action ghost" onClick={() => loadData()} disabled={loading}>
                {loading ? 'در حال بازخوانی...' : 'بازخوانی'}
              </button>
            </div>

            <label className="student-finance-field">
              <span>عضویت جاری</span>
              <select
                value={String(selectedOverview?.membership?.id || '')}
                onChange={(event) => setSelectedMembershipId(event.target.value)}
                disabled={!membershipOptions.length}
              >
                {membershipOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {selectedOverview ? (
              <div className="student-finance-membership-card">
                <div className="student-finance-pill-row">
                  <span className={`student-finance-pill info ${statusClass(membership?.status)}`}>{membership?.status || 'فعال'}</span>
                  <span className={`student-finance-pill ${eligibility.eligible ? 'good' : 'warn'} ${statusClass(eligibility.feeStatus)}`}>
                    {pickLabel(FEE_STATUS_LABELS, eligibility.feeStatus, 'نامشخص')}
                  </span>
                </div>
                <h3>{membership?.schoolClass?.title || 'صنف نامشخص'}</h3>
                <p>{membership?.academicYear?.title || 'سال تعلیمی نامشخص'}</p>
                <div className="student-finance-meta-list">
                  <span>شناسه عضویت: {membership?.id || '-'}</span>
                  <span>تاریخ شمول: {toLocaleDateTime(membership?.enrolledAt)}</span>
                  <span>امتحان: {eligibility.eligible ? 'کارت امتحان قابل صدور است' : 'نیاز به تصفیه یا بررسی دارد'}</span>
                </div>
              </div>
            ) : (
              <div className="student-finance-empty">برای این حساب عضویت مالی قابل نمایش پیدا نشد.</div>
            )}
          </article>

          <article className="student-finance-card" data-span="7">
            <div className="student-finance-card-head">
              <div>
                <h2>خلاصه مالی عضویت</h2>
                <p>جمع بل‌ها، پرداخت‌ها و موانع احتمالی برای همین عضویت.</p>
              </div>
              <button
                type="button"
                className="student-finance-action ghost"
                onClick={downloadStatementPack}
                disabled={downloadingStatement || !membership?.id}
                data-testid="download-membership-statement"
              >
                {downloadingStatement ? 'در حال دانلود...' : 'دانلود PDF'}
              </button>
              <button
                type="button"
                className="student-finance-action ghost"
                onClick={printStatement}
                data-testid="print-membership-statement"
              >
                چاپ استیتمنت
              </button>
            </div>
            <div className="student-finance-stat-grid">
              <div className="student-finance-stat">
                <span>کل بل‌ها</span>
                <strong>{summary.totalOrders || 0}</strong>
              </div>
              <div className="student-finance-stat">
                <span>کل پرداخت ها</span>
                <strong>{summary.totalPayments || 0}</strong>
              </div>
              <div className="student-finance-stat">
                <span>جمع بدهی</span>
                <strong>{formatCurrency(summary.totalDue)}</strong>
              </div>
              <div className="student-finance-stat">
                <span>پرداخت شده</span>
                <strong>{formatCurrency(summary.totalPaid)}</strong>
              </div>
              <div className="student-finance-stat">
                <span>مانده</span>
                <strong>{formatCurrency(summary.totalOutstanding)}</strong>
              </div>
              <div className="student-finance-stat">
                <span>پرداخت های در انتظار</span>
                <strong>{summary.pendingPayments || 0}</strong>
              </div>
              <div className="student-finance-stat">
                <span>تسهیلات فعال</span>
                <strong>{statementTotals.totalReliefs || reliefs.length || 0}</strong>
              </div>
              <div className="student-finance-stat">
                <span>تسهیلات ثابت</span>
                <strong>{formatCurrency(statementTotals.totalFixedReliefAmount || 0, statement.currency || 'AFN')}</strong>
              </div>
            </div>

            <div className="student-finance-statement-strip" data-testid="membership-statement-card">
              <article className="student-finance-statement-panel">
                <span>آخرین تولید استیتمنت</span>
                <strong>{toLocaleDateTime(statement.generatedAt)}</strong>
                <small>{statement.membershipLabel || 'نمای همین عضویت'}</small>
              </article>
              <article className="student-finance-statement-panel">
                <span>آخرین پرداخت تاییدشده</span>
                <strong>
                  {latestApprovedPayment
                    ? formatCurrency(latestApprovedPayment.amount, statement.currency || 'AFN')
                    : '—'}
                </strong>
                <small>
                  {latestApprovedPayment
                    ? `${latestApprovedPayment.orderNumber || 'بدون شماره'} • ${toLocaleDateTime(latestApprovedPayment.paidAt)}`
                    : 'هنوز پرداخت تاییدشده‌ای ثبت نشده است.'}
                </small>
              </article>
              <article className="student-finance-statement-panel">
                <span>آخرین پرداخت در انتظار</span>
                <strong>
                  {latestPendingPayment
                    ? formatCurrency(latestPendingPayment.amount, statement.currency || 'AFN')
                    : '—'}
                </strong>
                <small>
                  {latestPendingPayment
                    ? `${pickLabel(PAYMENT_STAGE_LABELS, latestPendingPayment.approvalStage, latestPendingPayment.approvalStage || 'در انتظار')} • ${toLocaleDateTime(latestPendingPayment.paidAt)}`
                    : 'پرداخت در انتظار ندارید.'}
                </small>
              </article>
            </div>
            <div className="student-finance-pack-strip">
              <article className="student-finance-pack-card">
                <span>اقدام پیشنهادی</span>
                <strong>{statementPack.recommendedAction || 'بدون اقدام خاص'}</strong>
                <small>
                  {statementPack.summary?.total || 0} سیگنال
                  {' • '}
                  {statementPack.summary?.critical || 0} حساس
                  {' • '}
                  {statementPack.summary?.warning || 0} قابل پیگیری
                </small>
              </article>
              {(statementPack.signals || []).slice(0, 3).map((item) => (
                <article key={item.id} className={`student-finance-pack-card ${item.severity === 'critical' ? 'critical' : 'warning'}`}>
                  <span>{SIGNAL_TYPE_LABELS[item.anomalyType] || item.anomalyType || 'سیگنال مالی'}</span>
                  <strong>{item.amountLabel || item.title || '—'}</strong>
                  <small>{item.description || item.title || 'بدون توضیح'}</small>
                </article>
              ))}
            </div>
          </article>

          <article className="student-finance-card" data-span="8">
            <div className="student-finance-card-head">
              <div>
                <h2>بل‌های فیس</h2>
                <p>فیس‌های همین عضویت با وضعیت و ساحه‌ی دقیق در این بخش نمایش داده می‌شود.</p>
              </div>
            </div>
            {!orders.length ? (
              <div className="student-finance-empty">برای این عضویت بل فیس ثبت نشده است.</div>
            ) : (
              <div className="student-finance-table-wrap">
                <table className="student-finance-table">
                  <thead>
                    <tr>
                      <th>عنوان</th>
                      <th>نوع</th>
                      <th>ساحه</th>
                      <th>وضعیت</th>
                      <th>سررسید</th>
                      <th>مبلغ</th>
                      <th>مانده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title || item.orderNumber || '-'}</strong>
                          <small>{item.periodLabel || item.orderNumber || '-'}</small>
                          {Array.isArray(item.installments) && item.installments.length ? <small>{item.installments.length} قسط ثبت شده</small> : null}
                        </td>
                        <td>{pickLabel(ORDER_TYPE_LABELS, item.orderType, item.orderType || '-')}</td>
                        <td>{pickLabel(LINK_SCOPE_LABELS, item.linkScope, item.linkScope || '-')}</td>
                        <td>
                          <span className={`student-finance-pill ${statusClass(item.status)}`}>
                            {pickLabel(ORDER_STATUS_LABELS, item.status, item.status || '-')}
                          </span>
                        </td>
                        <td>{toLocaleDateTime(item.dueDate)}</td>
                        <td>{formatCurrency(item.amountDue, item.currency)}</td>
                        <td>{formatCurrency(item.outstandingAmount, item.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="student-finance-card" data-span="5">
            <div className="student-finance-card-head">
              <div>
                <h2>ثبت پرداخت ماهانه/قسمتی</h2>
                <p>روی بدهی باز همین عضویت می‌توانید مبلغ دلخواه ماهانه یا قسمتی ثبت کنید و فایل رسید را بفرستید.</p>
              </div>
            </div>
            {!payableOrders.length ? (
              <div className="student-finance-empty">فعلاً بدهی بازی برای ثبت پرداخت ماهانه وجود ندارد.</div>
            ) : (
              <form className="student-finance-payment-form" onSubmit={submitStudentPayment}>
                <label className="student-finance-field">
                  <span>بدهی قابل پرداخت</span>
                  <select
                    value={paymentForm.feeOrderId}
                    onChange={(event) => {
                      const nextOrder = payableOrders.find((item) => String(item?.id || '') === String(event.target.value || '')) || null;
                      setPaymentForm((current) => ({
                        ...current,
                        feeOrderId: event.target.value,
                        amount: nextOrder ? String(Number(nextOrder.outstandingAmount || 0)) : current.amount
                      }));
                    }}
                  >
                    {payableOrders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item.title || item.orderNumber || 'بدهی')} - {formatCurrency(item.outstandingAmount, item.currency)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="student-finance-form-grid">
                  <label className="student-finance-field">
                    <span>مبلغ پرداخت</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, amount: event.target.value }))}
                    />
                  </label>
                  <label className="student-finance-field">
                    <span>روش پرداخت</span>
                    <select
                      value={paymentForm.paymentMethod}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, paymentMethod: event.target.value }))}
                    >
                      <option value="cash">نقدی</option>
                      <option value="bank_transfer">انتقال بانکی</option>
                      <option value="hawala">حواله</option>
                      <option value="manual">دستی</option>
                      <option value="other">سایر</option>
                    </select>
                  </label>
                  <label className="student-finance-field">
                    <span>تاریخ پرداخت</span>
                    <input
                      type="date"
                      value={paymentForm.paidAt}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, paidAt: event.target.value }))}
                    />
                    <small>{paymentForm.paidAt ? `هجری شمسی: ${toFaDate(paymentForm.paidAt)}` : 'تاریخ پرداخت انتخاب نشده است.'}</small>
                  </label>
                  <label className="student-finance-field">
                    <span>شماره مرجع</span>
                    <input
                      type="text"
                      value={paymentForm.referenceNo}
                      onChange={(event) => setPaymentForm((current) => ({ ...current, referenceNo: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="student-finance-field">
                  <span>یادداشت</span>
                  <textarea
                    rows="3"
                    value={paymentForm.note}
                    onChange={(event) => setPaymentForm((current) => ({ ...current, note: event.target.value }))}
                  />
                </label>
                <label className="student-finance-field">
                  <span>فایل رسید</span>
                  <input
                    key={paymentInputKey}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(event) => setPaymentForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                  />
                </label>
                <div className="student-finance-inline-actions">
                  <button type="submit" className="student-finance-action submit" disabled={submittingPayment}>
                    {submittingPayment ? 'در حال ثبت...' : 'ثبت پرداخت'}
                  </button>
                  <span className="student-finance-muted">
                    مانده فعلی: {formatCurrency(selectedPayableOrder?.outstandingAmount || 0, selectedPayableOrder?.currency || 'AFN')}
                  </span>
                </div>
              </form>
            )}
          </article>

          <article className="student-finance-card" data-span="4">
            <div className="student-finance-card-head">
              <div>
                <h2>وضعیت کارت امتحان</h2>
                <p>وضعیت امکان صدور کارت امتحان برای همین عضویت در این بخش نمایش داده می‌شود.</p>
              </div>
            </div>
            <div className="student-finance-eligibility">
              <span className={`student-finance-pill ${eligibility.eligible ? 'good' : 'warn'} ${statusClass(eligibility.feeStatus)}`}>
                {eligibility.eligible ? 'مجاز' : 'متوقف'}
              </span>
              <strong>{pickLabel(FEE_STATUS_LABELS, eligibility.feeStatus, 'نامشخص')}</strong>
              <div className="student-finance-meta-list">
                <span>بل‌های معوق: {eligibility.overdueOrders || 0}</span>
                <span>پرداخت‌های در انتظار: {eligibility.pendingPayments || 0}</span>
                <span>مانده قابل پرداخت: {formatCurrency(eligibility.totalOutstanding)}</span>
              </div>
            </div>
          </article>

          <article className="student-finance-card" data-span="7">
            <div className="student-finance-card-head">
              <div>
                <h2>پرداخت ها</h2>
                <p>تمام پرداخت‌های وصل به همین عضویت با وضعیت و مرحله‌ی تایید در این بخش دیده می‌شود.</p>
              </div>
            </div>
            {!payments.length ? (
              <div className="student-finance-empty">هنوز payment ثبت نشده است.</div>
            ) : (
              <div className="student-finance-timeline">
                {payments.map((item) => (
                  <article key={item.id} className="student-finance-timeline-item">
                    <div className="student-finance-timeline-head">
                      <div>
                        <strong>{formatCurrency(item.amount, item.currency)}</strong>
                        <span>{item.paymentNumber || item.referenceNo || 'بدون شماره'}</span>
                      </div>
                      <div className="student-finance-pill-row">
                        <span className={`student-finance-pill ${statusClass(item.status)}`}>
                          {pickLabel(PAYMENT_STATUS_LABELS, item.status, item.status || '-')}
                        </span>
                        <span className={`student-finance-pill info ${statusClass(item.approvalStage)}`}>
                          {pickLabel(PAYMENT_STAGE_LABELS, item.approvalStage, item.approvalStage || 'ثبت شده')}
                        </span>
                      </div>
                    </div>
                    <div className="student-finance-meta-list compact">
                      <span>تاریخ: {toLocaleDateTime(item.paidAt)}</span>
                      <span>روش: {item.paymentMethod || '-'}</span>
                      <span>ساحه: {pickLabel(LINK_SCOPE_LABELS, item.linkScope, item.linkScope || '-')}</span>
                      <span>سفارش: {item.feeOrder?.title || item.feeOrder?.orderNumber || '-'}</span>
                      {item.receiptDetails?.remainingBeforePayment != null ? (
                        <span>مانده قبل از پرداخت: {formatCurrency(item.receiptDetails.remainingBeforePayment, item.receiptDetails.currency)}</span>
                      ) : null}
                      {item.receiptDetails?.remainingAfterPayment != null ? (
                        <span>مانده بعد از پرداخت: {formatCurrency(item.receiptDetails.remainingAfterPayment, item.receiptDetails.currency)}</span>
                      ) : null}
                      {item.reviewedBy?.name ? <span>بازبینی نهایی: {item.reviewedBy.name}</span> : null}
                      {item.receipt?.rejectReason ? <span>دلیل رد: {item.receipt.rejectReason}</span> : null}
                      {item.note ? <span>یادداشت: {item.note}</span> : null}
                    </div>
                    <div className="student-finance-inline-actions">
                      {item.receipt?.fileUrl ? (
                        <a className="student-finance-link" href={`/${item.receipt.fileUrl}`} target="_blank" rel="noreferrer">
                          نمایش فایل رسید
                        </a>
                      ) : null}
                      {item.receipt?.approvalTrail?.length ? (
                        <span className="student-finance-muted">
                          {item.receipt.approvalTrail.length} مرحله بررسی ثبت شده
                        </span>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="student-finance-card" data-span="5">
            <div className="student-finance-card-head">
              <div>
                <h2>تسهیلات مالی و ترانسپورت</h2>
                <p>تمام تخفیف‌ها، معافیت‌ها، بورسیه‌ها و حمایت‌های خیریه همین عضویت در این بخش یکجا نمایش داده می‌شوند.</p>
              </div>
            </div>

            <div className="student-finance-stack">
              <section>
                <h3>رجیستر یکپارچه تسهیلات</h3>
                {!reliefs.length ? (
                  <div className="student-finance-empty tight">برای این عضویت تسهیل فعالی ثبت نشده است.</div>
                ) : (
                  <div className="student-finance-relief-grid">
                    {reliefs.map((item) => (
                      <article key={item.id} className="student-finance-mini-card student-finance-relief-card">
                        <div className="student-finance-pill-row">
                          <span className={`student-finance-pill ${statusClass(item.status)}`}>
                            {pickLabel(RELIEF_TYPE_LABELS, item.reliefType, item.reliefType || 'تسهیل')}
                          </span>
                          <span className="student-finance-pill info">
                            {pickLabel(RELIEF_COVERAGE_LABELS, item.coverageMode, item.coverageMode || 'پوشش')}
                          </span>
                        </div>
                        <strong>
                          {item.coverageMode === 'full'
                            ? '100%'
                            : item.coverageMode === 'percent'
                              ? `${formatNumber(item.percentage)}%`
                              : formatCurrency(item.amount)}
                        </strong>
                        <span>{pickLabel(LINK_SCOPE_LABELS, item.linkScope, item.linkScope || '-')}</span>
                        <small>{item.reason || item.note || 'بدون توضیح'}</small>
                        {item.sponsorName ? <small>تمویل‌کننده: {item.sponsorName}</small> : null}
                        {(item.startDate || item.endDate) ? (
                          <small>بازه: {toLocaleDateTime(item.startDate)} تا {toLocaleDateTime(item.endDate)}</small>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h3>تخفیف‌ها</h3>
                {!discounts.length ? (
                  <div className="student-finance-empty tight">تخفیف فعالی ثبت نشده است.</div>
                ) : (
                  discounts.map((item) => (
                    <div key={item.id} className="student-finance-mini-card">
                      <strong>{formatCurrency(item.amount)}</strong>
                      <span>{item.discountType || 'تخفیف'}</span>
                      <small>{item.reason || 'بدون توضیح'}</small>
                    </div>
                  ))
                )}
              </section>

              <section>
                <h3>معافیت‌ها</h3>
                {!exemptions.length ? (
                  <div className="student-finance-empty tight">معافیت فعالی ثبت نشده است.</div>
                ) : (
                  exemptions.map((item) => (
                    <div key={item.id} className="student-finance-mini-card">
                      <strong>{item.exemptionType === 'full' ? 'معافیت کامل' : 'معافیت جزئی'}</strong>
                      <span>{item.scope || 'همه موارد'}</span>
                      <small>
                        {item.exemptionType === 'partial'
                          ? `${formatCurrency(item.amount)} • ${formatNumber(item.percentage)}%`
                          : item.reason || 'بدون توضیح'}
                      </small>
                    </div>
                  ))
                )}
              </section>

              <section>
                <h3>فیس ترانسپورت</h3>
                {!transportFees.length ? (
                  <div className="student-finance-empty tight">فیس ترانسپورت ثبت نشده است.</div>
                ) : (
                  transportFees.map((item) => (
                    <div key={item.id} className="student-finance-mini-card">
                      <strong>{formatCurrency(item.amount, item.currency)}</strong>
                      <span>{item.title || 'فیس ترانسپورت'}</span>
                      <small>
                        {pickLabel(TRANSPORT_STATUS_LABELS, item.status, item.status || '-')} - {item.frequency || '-'}
                      </small>
                    </div>
                  ))
                )}
              </section>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
