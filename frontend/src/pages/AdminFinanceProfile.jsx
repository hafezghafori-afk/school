import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';
import { formatFinanceCode } from '../utils/latinFinanceCode';
import { readStoredSchoolId } from './adminWorkspaceUtils';
import './AdminFinanceProfile.css';

const OPEN_ORDER_STATUSES = new Set(['new', 'partial', 'overdue']);
const STATUS_LABELS = {
  new: 'پرداخت‌نشده',
  pending: 'در انتظار',
  partial: 'پرداخت ناقص',
  overdue: 'سررسید گذشته',
  paid: 'پرداخت‌شده',
  waived: 'معاف',
  void: 'باطل',
  approved: 'تأییدشده',
  rejected: 'ردشده',
  cancelled: 'لغوشده',
  active: 'فعال'
};
const FEE_TYPE_LABELS = {
  tuition: 'فیس/شهریه',
  admission: 'داخله',
  transport: 'ترانسپورت',
  exam: 'امتحان',
  document: 'اسناد',
  service: 'خدمات',
  other: 'سایر',
  all: 'تمام هزینه‌ها'
};
const RELIEF_TYPE_LABELS = {
  discount: 'تخفیف',
  waiver: 'معافیت',
  penalty: 'جریمه',
  manual: 'تسهیل مالی',
  free_student: 'معافیت کامل شاگرد',
  scholarship_partial: 'معافیت جزئی',
  scholarship_full: 'معافیت کامل',
  charity_support: 'حمایت خیریه',
  sibling_discount: 'تخفیف خواهر و برادر'
};
const PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'دستی',
  gateway: 'درگاه پرداخت',
  other: 'سایر'
};

const money = (value) => (Number(value) || 0).toLocaleString('fa-AF');
const date = (value) => formatAfghanDate(value, {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
}) || '-';
const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const dueTime = (value) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};
const newestTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildOrderHistory = (account = {}) => [
  ...(Array.isArray(account?.orders) ? account.orders : (account?.items || [])),
  ...(Array.isArray(account?.legacyBills)
    ? account.legacyBills.filter((item) => !item?.canonicalOrderId)
    : [])
].sort((left, right) => (
  newestTime(right?.issuedAt || right?.createdAt) - newestTime(left?.issuedAt || left?.createdAt)
));

const buildPaymentHistory = (account = {}) => [
  ...(Array.isArray(account?.payments) ? account.payments : []),
  ...(Array.isArray(account?.legacyReceipts)
    ? account.legacyReceipts.filter((item) => !item?.mirroredToCanonical && !item?.canonicalPaymentId)
    : [])
].sort((left, right) => (
  newestTime(right?.paidAt || right?.createdAt) - newestTime(left?.paidAt || left?.createdAt)
));

const normalizeLegacyDiscount = (item = {}) => ({
  ...item,
  sourceModel: 'discount',
  sourceKey: `discount:${idOf(item)}`,
  sourceDiscountId: idOf(item),
  reliefType: ['discount', 'waiver', 'penalty', 'manual'].includes(item?.discountType)
    ? item.discountType
    : 'discount',
  scope: 'tuition',
  coverageMode: item?.coverageMode === 'percent' ? 'percent' : 'fixed'
});

const normalizeLegacyExemption = (item = {}) => {
  const full = item?.exemptionType === 'full';
  const scope = item?.scope || 'all';
  const percentage = Number(item?.percentage || 0);
  const amount = Number(item?.amount || 0);
  return {
    ...item,
    sourceModel: 'fee_exemption',
    sourceKey: `fee_exemption:${idOf(item)}`,
    sourceExemptionId: idOf(item),
    reliefType: full ? (scope === 'all' ? 'free_student' : 'scholarship_full') : 'scholarship_partial',
    scope,
    coverageMode: full ? 'full' : (percentage > 0 && amount <= 0 ? 'percent' : 'fixed'),
    percentage: full ? 100 : percentage,
    amount: full ? 0 : amount
  };
};

const buildReliefHistory = (account = {}) => {
  if (Array.isArray(account?.financeReliefs)) return account.financeReliefs;
  const canonical = Array.isArray(account?.reliefs) ? account.reliefs : [];
  const mirroredDiscountIds = new Set(canonical.map((item) => idOf(item?.sourceDiscountId)).filter(Boolean));
  const mirroredExemptionIds = new Set(canonical.map((item) => idOf(item?.sourceExemptionId)).filter(Boolean));
  return [
    ...canonical,
    ...(Array.isArray(account?.discounts)
      ? account.discounts.filter((item) => !mirroredDiscountIds.has(idOf(item))).map(normalizeLegacyDiscount)
      : []),
    ...(Array.isArray(account?.exemptions)
      ? account.exemptions.filter((item) => !mirroredExemptionIds.has(idOf(item))).map(normalizeLegacyExemption)
      : [])
  ].sort((left, right) => (
    newestTime(right?.createdAt || right?.startDate) - newestTime(left?.createdAt || left?.startDate)
  ));
};

const reliefValue = (relief = {}) => {
  if (relief?.coverageMode === 'full') return '۱۰۰٪ (معافیت کامل)';
  if (relief?.coverageMode === 'percent' || (Number(relief?.percentage || 0) > 0 && Number(relief?.amount || 0) <= 0)) {
    return `${money(relief?.percentage)}٪`;
  }
  return `${money(relief?.amount)} AFN`;
};

const getHeaders = () => {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
};

const loadJson = async (url, signal) => {
  const response = await fetch(url, { headers: getHeaders(), signal });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new Error('مسیر معلومات مالی روی Backend فعال نیست.');
  }
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || 'دریافت معلومات مالی ناموفق بود.');
  }
  return payload;
};

const orderAmounts = (order = {}) => {
  const lines = Array.isArray(order?.lineItems) ? order.lineItems : [];
  if (lines.length) {
    return lines.reduce((summary, line) => ({
      gross: summary.gross + Number(line?.grossAmount || line?.netAmount || 0),
      discount: summary.discount + Number(line?.reductionAmount || 0),
      net: summary.net + Number(line?.netAmount || 0),
      paid: summary.paid + Number(line?.paidAmount || 0),
      outstanding: summary.outstanding + Math.max(0, Number(line?.balanceAmount ?? (Number(line?.netAmount || 0) - Number(line?.paidAmount || 0))))
    }), { gross: 0, discount: 0, net: 0, paid: 0, outstanding: 0 });
  }
  const net = Number(order?.amountDue || 0);
  const gross = Math.max(net, Number(order?.amountOriginal || 0));
  const paid = Number(order?.amountPaid || 0);
  return {
    gross,
    discount: Math.max(0, gross - net),
    net,
    paid,
    outstanding: Math.max(0, Number(order?.outstandingAmount ?? (net - paid)))
  };
};

const orderPurpose = (order = {}) => {
  const types = (Array.isArray(order?.lineItems) ? order.lineItems : [])
    .map((line) => String(line?.feeType || '').trim())
    .filter(Boolean);
  const uniqueTypes = [...new Set(types.length ? types : [String(order?.orderType || 'other')])];
  return uniqueTypes.map((type) => FEE_TYPE_LABELS[type] || type).join(' + ');
};

function DataError({ children }) {
  return <div className="finance-profile-error" role="alert">{children}</div>;
}

export default function AdminFinanceProfile() {
  const { studentId } = useParams();
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reliefs, setReliefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sectionErrors, setSectionErrors] = useState({ orders: '', payments: '', reliefs: '' });

  useEffect(() => {
    if (!studentId) {
      setError('شناسه شاگرد موجود نیست.');
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const run = async () => {
      setLoading(true);
      setError('');
      setSectionErrors({ orders: '', payments: '', reliefs: '' });
      try {
        const openAccount = await loadJson(
          `${API_BASE}/api/student-finance/students/${encodeURIComponent(studentId)}/open-account?all=true`,
          controller.signal
        );
        setAccount(openAccount);

        if (controller.signal.aborted) return;

        setOrders(buildOrderHistory(openAccount));
        setPayments(buildPaymentHistory(openAccount));
        setReliefs(buildReliefHistory(openAccount));
      } catch (requestError) {
        if (requestError?.name !== 'AbortError') {
          setError(requestError?.message || 'دریافت حساب مالی شاگرد ناموفق بود.');
          setAccount(null);
          setOrders([]);
          setPayments([]);
          setReliefs([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    run();
    return () => controller.abort();
  }, [studentId]);

  const officialOrders = useMemo(
    () => orders.filter((item) => String(item?.status || '').trim() !== 'void'),
    [orders]
  );
  const voidOrders = useMemo(
    () => orders.filter((item) => String(item?.status || '').trim() === 'void'),
    [orders]
  );
  const openOrders = useMemo(
    () => officialOrders
      .filter((item) => OPEN_ORDER_STATUSES.has(String(item?.status || '').trim()) && orderAmounts(item).outstanding > 0)
      .sort((left, right) => dueTime(left?.dueDate) - dueTime(right?.dueDate)),
    [officialOrders]
  );
  const summary = account?.summary || {};

  return (
    <main className="admin-finance-profile-page" dir="rtl">
      <div className="finance-profile-hero">
        <div>
          <p className="finance-profile-eyebrow">حساب فقط‌خواندنی</p>
          <h2>پروفایل و تاریخچه مالی متعلم</h2>
          <p>هیچ بل یا پرداختی با بازکردن این صفحه ساخته یا تغییر داده نمی‌شود.</p>
        </div>
        <Link className="finance-profile-back" to="/admin-finance">بازگشت به مرکز مالی</Link>
      </div>

      {loading ? <div className="finance-profile-state">در حال دریافت حساب کامل شاگرد...</div> : null}
      {!loading && error ? <DataError>{error}</DataError> : null}

      {!loading && !error && account ? (
        <>
          <section className="finance-profile-identity">
            <div><span>نام شاگرد</span><strong>{account?.student?.fullName || '-'}</strong></div>
            <div><span>شناسه شاگرد</span><strong>{account?.student?.studentId || studentId}</strong></div>
            <div><span>عضویت‌ها</span><strong>{account?.memberships?.length || 0}</strong></div>
            <div><span>صنف جاری</span><strong>{account?.membership?.schoolClass?.title || '-'}</strong></div>
            <div><span>سال تعلیمی</span><strong>{account?.membership?.academicYear?.title || '-'}</strong></div>
          </section>

          <section className="finance-profile-kpis" aria-label="خلاصه حساب شاگرد">
            <div><span>فیس اصلی ماه جاری</span><strong>{money(summary.studentFee)} AFN</strong></div>
            <div><span>باقیات ماه‌های گذشته</span><strong>{money(summary.pastArrears)} AFN</strong></div>
            <div><span>تخفیف تطبیق‌شده</span><strong>{money(summary.totalDiscount)} AFN</strong></div>
            <div><span>قابل پرداخت ماه جاری</span><strong>{money(summary.currentMonthPayable)} AFN</strong></div>
            <div className="accent"><span>فیس قابل پرداخت تا ماه جاری</span><strong>{money(summary.payableFee ?? ((summary.pastArrears || 0) + (summary.currentMonthPayable || 0)))} AFN</strong></div>
            <div><span>تمام تعهدات باز (شامل آینده و غیر فیس)</span><strong>{money(summary.totalOutstanding)} AFN</strong></div>
            <div><span>مجموع پرداخت روی بل‌ها</span><strong>{money(summary.totalPaid)} AFN</strong></div>
          </section>

          <section className="finance-profile-section">
            <div className="finance-profile-section-head">
              <div><h3>بل‌های باز و سررسیده</h3><p>مرتب‌شده از قدیمی‌ترین مهلت پرداخت.</p></div>
              <span>{openOrders.length} بل باز</span>
            </div>
            {sectionErrors.orders ? <DataError>{sectionErrors.orders}؛ فعلاً فقط بل‌های حساب باز نمایش داده می‌شود.</DataError> : null}
            {!openOrders.length && !sectionErrors.orders ? <p className="finance-profile-empty">برای این شاگرد بل باز وجود ندارد.</p> : null}
            <div className="finance-profile-list">
              {openOrders.map((order) => {
                const amounts = orderAmounts(order);
                return (
                  <article className="finance-profile-order" key={`open-${idOf(order)}`}>
                    <div className="finance-profile-row-head">
                      <span><strong>{orderPurpose(order)}</strong><small>{formatFinanceCode(order?.orderNumber || order?.billNumber, 'بدون شماره')}</small></span>
                      <span className={`finance-profile-status ${order?.status || 'new'}`}>{STATUS_LABELS[order?.status] || order?.status || '-'}</span>
                    </div>
                    <div className="finance-profile-order-grid">
                      <span><b>مبلغ اصلی</b>{money(amounts.gross)} AFN</span>
                      <span><b>تخفیف/معافیت</b>{money(amounts.discount)} AFN</span>
                      <span><b>مبلغ خالص</b>{money(amounts.net)} AFN</span>
                      <span><b>پرداخت‌شده</b>{money(amounts.paid)} AFN</span>
                      <span><b>باقی‌مانده</b>{money(amounts.outstanding)} AFN</span>
                    </div>
                    <small>{order?.periodLabel || 'بدون عنوان دوره'} · {order?.dueDate ? `سررسید: ${date(order.dueDate)}` : 'بدون تاریخ سررسید'} · {order?.schoolClass?.title || '-'} · {order?.academicYear?.title || '-'}</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="finance-profile-section">
            <div className="finance-profile-section-head">
              <div><h3>تمام بل‌ها</h3><p>بل‌های رسمی و بل‌های باطل به‌صورت جداگانه شمرده می‌شوند.</p></div>
              <span>{officialOrders.length} رسمی · {voidOrders.length} باطل</span>
            </div>
            {!orders.length && !sectionErrors.orders ? <p className="finance-profile-empty">هنوز بلی برای این شاگرد ثبت نشده است.</p> : null}
            <div className="finance-profile-compact-list">
              {orders.map((order) => (
                <div className={`finance-profile-compact-row ${order?.status === 'void' ? 'is-void' : ''}`} key={`all-${idOf(order)}`}>
                  <span><strong>{formatFinanceCode(order?.orderNumber || order?.billNumber, 'بدون شماره')}</strong><small>{orderPurpose(order)} · {order?.periodLabel || date(order?.dueDate)}</small></span>
                  <span><b>{money(orderAmounts(order).outstanding)} AFN</b><small>{STATUS_LABELS[order?.status] || order?.status || '-'}</small></span>
                  {order?.status === 'void' ? <small>{order?.voidReason || 'این بل در حساب رسمی شمرده نمی‌شود.'}</small> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="finance-profile-section">
            <div className="finance-profile-section-head">
              <div><h3>پرداخت‌ها و رسیدها</h3><p>پرداخت‌های در انتظار، تأییدشده و ردشده.</p></div>
              <span>{payments.length} پرداخت</span>
            </div>
            {sectionErrors.payments ? <DataError>{sectionErrors.payments}</DataError> : null}
            {!payments.length && !sectionErrors.payments ? <p className="finance-profile-empty">هنوز پرداخت یا رسیدی ثبت نشده است.</p> : null}
            <div className="finance-profile-compact-list">
              {payments.map((payment) => (
                <div className="finance-profile-compact-row" key={`${payment?.recordType || 'payment'}-${idOf(payment)}`}>
                  <span><strong>{formatFinanceCode(payment?.paymentNumber || payment?.billNumber || payment?.referenceNo, 'پرداخت')}</strong><small>{date(payment?.paidAt)} · {PAYMENT_METHOD_LABELS[payment?.paymentMethod] || payment?.paymentMethod || '-'}</small></span>
                  <span><b>{money(payment?.recognizedAmount ?? payment?.amount)} AFN</b><small>{STATUS_LABELS[payment?.status] || payment?.status || '-'}</small></span>
                  <small>{Array.isArray(payment?.allocations) && payment.allocations.length ? `${payment.allocations.length} تخصیص روی بل‌ها` : 'بدون جزئیات تخصیص'}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="finance-profile-section">
            <div className="finance-profile-section-head">
              <div><h3>تخفیف‌ها و معافیت‌ها</h3><p>سوابق دفتر یکپارچه تسهیلات مالی.</p></div>
              <span>{reliefs.length} مورد</span>
            </div>
            {sectionErrors.reliefs ? <DataError>{sectionErrors.reliefs}</DataError> : null}
            {!reliefs.length && !sectionErrors.reliefs ? <p className="finance-profile-empty">تخفیف یا معافیتی برای این شاگرد ثبت نشده است.</p> : null}
            <div className="finance-profile-compact-list">
              {reliefs.map((relief) => (
                <div className={`finance-profile-compact-row ${relief?.status === 'cancelled' ? 'is-void' : ''}`} key={`${relief?.recordType || 'relief'}-${idOf(relief)}`}>
                  <span><strong>{RELIEF_TYPE_LABELS[relief?.reliefType] || relief?.reliefType || 'تسهیل مالی'}</strong><small>{FEE_TYPE_LABELS[relief?.scope] || relief?.scope || 'تمام هزینه‌ها'} · {relief?.reason || relief?.note || 'بدون توضیح'}</small></span>
                  <span><b>{reliefValue(relief)}</b><small>{STATUS_LABELS[relief?.status] || relief?.status || '-'}</small></span>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
