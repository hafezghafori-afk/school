import { API_BASE } from '../config/api';
import { formatAfghanDate } from './afghanDate';
import { readStoredSchoolId } from '../pages/adminWorkspaceUtils';
import './studentFinanceAccountDirect.css';

const accountCache = new Map();
const loadingStudents = new Set();
let nativeFetch = null;
let selectedStudentId = '';
let syncTimer = null;
let requestVersion = 0;

const idOf = (value) => String(value?._id || value?.id || value || '').trim();
const text = (value) => String(value || '').trim();
const amount = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
const formatAmount = (value) => amount(value).toLocaleString('fa-AF-u-ca-persian');
const timestamp = (value) => {
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const authHeaders = () => {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
};

const afghanDate = (value, options = { year: 'numeric', month: 'long', day: 'numeric' }) => (
  value ? (formatAfghanDate(value, options) || '-') : '-'
);

const orderTuition = (order = {}) => {
  if (order?.tuition && typeof order.tuition === 'object') {
    return {
      gross: amount(order.tuition.gross),
      discount: amount(order.tuition.discount),
      penalty: amount(order.tuition.penalty),
      net: amount(order.tuition.net),
      paid: amount(order.tuition.paid),
      outstanding: amount(order.tuition.outstanding)
    };
  }
  return (Array.isArray(order?.lineItems) ? order.lineItems : [])
    .filter((item) => text(item?.feeType) === 'tuition')
    .reduce((summary, item) => ({
      gross: amount(summary.gross + Number(item?.grossAmount || 0)),
      discount: amount(summary.discount + Number(item?.reductionAmount || 0)),
      penalty: amount(summary.penalty + Number(item?.penaltyAmount || 0)),
      net: amount(summary.net + Number(item?.netAmount || 0)),
      paid: amount(summary.paid + Number(item?.paidAmount || 0)),
      outstanding: amount(summary.outstanding + Number(item?.balanceAmount || 0))
    }), { gross: 0, discount: 0, penalty: 0, net: 0, paid: 0, outstanding: 0 });
};

const buildAccountView = (payload = {}) => {
  const orders = (Array.isArray(payload?.items) ? payload.items : [])
    .map((item) => ({ ...item, tuition: orderTuition(item) }))
    .filter((item) => item.tuition.outstanding > 0)
    .sort((left, right) => timestamp(left.dueDate) - timestamp(right.dueDate));
  const grouped = new Map();

  orders.forEach((item) => {
    const classTitle = text(item?.schoolClass?.title || item?.membership?.schoolClass?.title);
    const yearTitle = text(item?.academicYear?.title || item?.membership?.academicYear?.title);
    const monthLabel = text(item?.periodLabel)
      || (item?.dueDate ? afghanDate(item.dueDate, { year: 'numeric', month: 'long' }) : '')
      || text(item?.title)
      || 'باقیات مالی';
    const monthKey = text(item?.periodLabel)
      || (item?.dueDate ? `${new Date(item.dueDate).getFullYear()}-${new Date(item.dueDate).getMonth() + 1}` : '')
      || idOf(item);
    const key = [monthKey, classTitle, yearTitle].join('|');
    const row = grouped.get(key) || {
      id: key,
      label: monthLabel,
      classTitle,
      yearTitle,
      dueDate: item.dueDate || null,
      gross: 0,
      discount: 0,
      penalty: 0,
      net: 0,
      paid: 0,
      outstanding: 0,
      bills: []
    };
    if (timestamp(item.dueDate) < timestamp(row.dueDate)) row.dueDate = item.dueDate;
    row.gross = amount(row.gross + item.tuition.gross);
    row.discount = amount(row.discount + item.tuition.discount);
    row.penalty = amount(row.penalty + item.tuition.penalty);
    row.net = amount(row.net + item.tuition.net);
    row.paid = amount(row.paid + item.tuition.paid);
    row.outstanding = amount(row.outstanding + item.tuition.outstanding);
    row.bills.push(item);
    grouped.set(key, row);
  });

  return {
    orders,
    months: [...grouped.values()].sort((left, right) => timestamp(left.dueDate) - timestamp(right.dueDate)),
    summary: {
      studentFee: amount(payload?.summary?.studentFee),
      pastArrears: amount(payload?.summary?.pastArrears),
      totalDiscount: amount(payload?.summary?.totalDiscount),
      payableFee: amount(payload?.summary?.payableFee),
      totalPaid: amount(payload?.summary?.totalPaid),
      totalNet: amount(payload?.summary?.totalNet),
      overdueOrders: Number(payload?.summary?.overdueOrders || 0),
      openMonths: Number(payload?.summary?.openMonths || grouped.size),
      oldestDueDate: payload?.summary?.oldestDueDate || null
    }
  };
};

const studentName = (studentId, account = {}) => {
  const fromApi = text(account?.student?.fullName)
    || text(account?.membership?.student?.fullName)
    || text(account?.memberships?.[0]?.student?.fullName);
  if (fromApi) return fromApi;
  const select = document.querySelector('[data-testid="desk-student-select"]');
  const option = [...(select?.options || [])].find((item) => idOf(item.value) === idOf(studentId));
  return text(option?.textContent).split(' - ')[0] || 'متعلم';
};

const statusFor = (dueDate) => {
  const due = timestamp(dueDate);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  if (due < Date.now()) return { label: 'سررسید گذشته', className: 'is-overdue' };
  if (due >= monthStart && due < nextMonthStart) return { label: 'ماه جاری', className: 'is-current' };
  return { label: 'آینده', className: 'is-future' };
};

const buttonsHtml = (studentId) => `
  <div class="student-account-direct-actions">
    <button type="button" class="is-active" data-account-open>حساب باز</button>
    <button type="button" data-account-history data-student-id="${escapeHtml(studentId)}">تاریخچه کامل شاگرد</button>
  </div>
`;

const billRowsHtml = (bills = []) => bills.map((bill) => {
  const tuition = orderTuition(bill);
  return `
    <div class="student-account-direct-bill">
      <span>
        <strong>${escapeHtml(bill.title || bill.orderNumber || bill.billNumber || 'بل مالی')}</strong>
        <small>${escapeHtml(bill.orderNumber || bill.billNumber || '')}${bill.dueDate ? ` | مهلت: ${escapeHtml(afghanDate(bill.dueDate))}` : ''}</small>
      </span>
      <span><b>اصل</b>${formatAmount(tuition.gross)}</span>
      <span><b>تخفیف</b>${formatAmount(tuition.discount)}</span>
      <span><b>پرداخت</b>${formatAmount(tuition.paid)}</span>
      <span class="is-balance"><b>باقی</b>${formatAmount(tuition.outstanding)}</span>
    </div>
  `;
}).join('');

const monthRowsHtml = (months = [], limit = null) => {
  const visible = Number.isFinite(limit) ? months.slice(0, limit) : months;
  if (!visible.length) {
    return '<p class="student-account-direct-empty">برای این شاگرد بدهی باز فیس/شهریه وجود ندارد.</p>';
  }
  return visible.map((item) => {
    const status = statusFor(item.dueDate);
    const meta = [item.classTitle, item.yearTitle, `${item.bills.length} بل`].filter(Boolean).join(' | ');
    return `
      <article class="student-account-direct-month ${status.className}">
        <div class="student-account-direct-month-head">
          <span>
            <strong>${escapeHtml(item.label)}</strong>
            <small>${item.dueDate ? `مهلت: ${escapeHtml(afghanDate(item.dueDate))}` : 'مهلت ثبت نشده'}${meta ? ` | ${escapeHtml(meta)}` : ''}</small>
          </span>
          <span class="student-account-direct-status">${escapeHtml(status.label)}</span>
        </div>
        <div class="student-account-direct-breakdown">
          <span><b>فیس اصلی</b>${formatAmount(item.gross)} AFN</span>
          <span><b>تخفیف</b>${formatAmount(item.discount)} AFN</span>
          <span><b>فیس بعد از تخفیف</b>${formatAmount(item.net)} AFN</span>
          <span><b>پرداخت‌شده</b>${formatAmount(item.paid)} AFN</span>
          <span class="is-balance"><b>باقی‌مانده</b>${formatAmount(item.outstanding)} AFN</span>
        </div>
        <div class="student-account-direct-bills">${billRowsHtml(item.bills)}</div>
      </article>
    `;
  }).join('');
};

const bindActions = (overlay, studentId) => {
  overlay.querySelector('[data-account-open]')?.addEventListener('click', () => {
    document.querySelector('[data-testid="student-monthly-arrears"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  overlay.querySelector('[data-account-history]')?.addEventListener('click', () => {
    if (studentId) window.location.assign(`/admin-finance/profile/${encodeURIComponent(studentId)}`);
  });
};

const applyOverlay = (card, signature, html, studentId) => {
  if (!card) return;
  card.classList.add('student-account-direct-patched');
  let overlay = card.querySelector(':scope > .student-account-direct-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'student-account-direct-overlay';
    overlay.setAttribute('dir', 'rtl');
    card.appendChild(overlay);
  }
  if (overlay.dataset.signature === signature) return;
  overlay.dataset.signature = signature;
  overlay.innerHTML = html;
  bindActions(overlay, studentId);
};

const clearOverlay = (card) => {
  if (!card) return;
  card.classList.remove('student-account-direct-patched');
  card.querySelector(':scope > .student-account-direct-overlay')?.remove();
};

const renderArrears = (studentId, account = null) => {
  const card = document.querySelector('[data-testid="student-monthly-arrears"]');
  if (!card) return;
  if (!studentId) {
    clearOverlay(card);
    return;
  }
  const name = studentName(studentId, account || {});
  if (!account || account.loading) {
    applyOverlay(card, `${studentId}:loading`, `
      <div class="student-account-direct-head"><div><h3>صندوق باقیات ماهانه شاگرد</h3><p>در حال دریافت تمام حساب‌های باز ${escapeHtml(name)}...</p></div>${buttonsHtml(studentId)}</div>
      <p class="student-account-direct-loading">در حال بارگذاری جزئیات ماه‌ها، بل‌ها، تخفیف و پرداخت‌ها...</p>
    `, studentId);
    return;
  }
  if (account.error) {
    applyOverlay(card, `${studentId}:error:${account.error}`, `
      <div class="student-account-direct-head"><div><h3>صندوق باقیات ماهانه شاگرد</h3><p>حساب باز فیس/شهریه شاگرد</p></div>${buttonsHtml(studentId)}</div>
      <p class="student-account-direct-error">${escapeHtml(account.error)}</p>
    `, studentId);
    return;
  }
  const view = buildAccountView(account);
  applyOverlay(card, `${studentId}:${view.months.length}:${view.summary.payableFee}:${view.summary.totalDiscount}`, `
    <div class="student-account-direct-head">
      <div><h3>صندوق باقیات ماهانه شاگرد</h3><p>تمام ماه‌ها و بل‌های باز از صنف‌ها و سال‌های تعلیمی قبلی و جاری.</p></div>
      ${buttonsHtml(studentId)}
    </div>
    <div class="student-account-direct-summary">
      <div><span>شاگرد</span><strong>${escapeHtml(name)}</strong></div>
      <div><span>ماه‌های باز</span><strong>${view.summary.openMonths}</strong></div>
      <div><span>کل تخفیف</span><strong>${formatAmount(view.summary.totalDiscount)} AFN</strong></div>
      <div class="is-balance"><span>کل فیس قابل پرداخت</span><strong>${formatAmount(view.summary.payableFee)} AFN</strong></div>
    </div>
    <div class="student-account-direct-months">${monthRowsHtml(view.months)}</div>
  `, studentId);
};

const renderFinanceCard = (studentId, account = null) => {
  const card = document.querySelector('[data-testid="finance-payment-desk"] .finance-payment-student-card-row');
  if (!card) return;
  if (!studentId) {
    clearOverlay(card);
    return;
  }
  const name = studentName(studentId, account || {});
  if (!account || account.loading) {
    applyOverlay(card, `${studentId}:card-loading`, `
      <div class="student-account-direct-head"><div><h4>کارت مالی متعلم</h4><p>در حال محاسبه حساب ${escapeHtml(name)}...</p></div>${buttonsHtml(studentId)}</div>
      <p class="student-account-direct-loading">در حال دریافت داده مالی...</p>
    `, studentId);
    return;
  }
  if (account.error) {
    applyOverlay(card, `${studentId}:card-error:${account.error}`, `
      <div class="student-account-direct-head"><div><h4>کارت مالی متعلم</h4><p>خلاصه حساب شاگرد</p></div>${buttonsHtml(studentId)}</div>
      <p class="student-account-direct-error">${escapeHtml(account.error)}</p>
    `, studentId);
    return;
  }
  const view = buildAccountView(account);
  applyOverlay(card, `${studentId}:card:${view.summary.studentFee}:${view.summary.pastArrears}:${view.summary.totalDiscount}:${view.summary.payableFee}`, `
    <div class="student-account-direct-head">
      <div><h4>کارت مالی متعلم</h4><p>${escapeHtml(name)} — خلاصه فوری فیس و باقیات</p></div>
      ${buttonsHtml(studentId)}
    </div>
    <div class="student-account-direct-kpis">
      <div><span>فیس شاگرد</span><strong>${formatAmount(view.summary.studentFee)} AFN</strong></div>
      <div class="is-overdue"><span>باقیات گذشته</span><strong>${formatAmount(view.summary.pastArrears)} AFN</strong></div>
      <div class="is-discount"><span>در مجموع تخفیف</span><strong>${formatAmount(view.summary.totalDiscount)} AFN</strong></div>
      <div class="is-payable"><span>فیس قابل پرداخت</span><strong>${formatAmount(view.summary.payableFee)} AFN</strong></div>
    </div>
    <div class="student-account-direct-card-meta">
      <span>پرداخت‌شده: <b>${formatAmount(view.summary.totalPaid)} AFN</b></span>
      <span>ماه‌های باز: <b>${view.summary.openMonths}</b></span>
      <span>قدیمی‌ترین مهلت: <b>${view.summary.oldestDueDate ? escapeHtml(afghanDate(view.summary.oldestDueDate)) : '-'}</b></span>
    </div>
    <div class="student-account-direct-preview">${monthRowsHtml(view.months, 2)}</div>
  `, studentId);
};

const scheduleRender = () => {
  if (syncTimer) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    bindStudentSelect();
    renderSelectedStudent();
  }, 50);
};

const loadAccount = async (studentId, force = false) => {
  const normalized = idOf(studentId);
  if (!normalized || loadingStudents.has(normalized)) return;
  if (!force && accountCache.has(normalized) && !accountCache.get(normalized)?.error) {
    scheduleRender();
    return;
  }
  const version = ++requestVersion;
  loadingStudents.add(normalized);
  accountCache.set(normalized, { loading: true, error: '', items: [], summary: {} });
  scheduleRender();
  try {
    const response = await nativeFetch(`${API_BASE}/api/student-finance/students/${encodeURIComponent(normalized)}/open-account`, {
      headers: authHeaders()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      throw new Error(data?.message || 'دریافت حساب مالی شاگرد ناموفق بود.');
    }
    accountCache.set(normalized, { ...data, loading: false, error: '' });
  } catch (error) {
    accountCache.set(normalized, {
      loading: false,
      error: error?.message || 'دریافت حساب مالی شاگرد ناموفق بود.',
      items: [],
      summary: {}
    });
  } finally {
    loadingStudents.delete(normalized);
    if (version === requestVersion || normalized === selectedStudentId) scheduleRender();
  }
};

const renderSelectedStudent = () => {
  const select = document.querySelector('[data-testid="desk-student-select"]');
  const studentId = idOf(select?.value);
  selectedStudentId = studentId;
  const account = accountCache.get(studentId) || null;
  renderArrears(studentId, account);
  renderFinanceCard(studentId, account);
  if (studentId && !account && !loadingStudents.has(studentId)) loadAccount(studentId);
};

const bindStudentSelect = () => {
  const select = document.querySelector('[data-testid="desk-student-select"]');
  if (!select || select.dataset.studentAccountDirectBound === 'true') return;
  select.dataset.studentAccountDirectBound = 'true';
  select.addEventListener('change', () => {
    selectedStudentId = idOf(select.value);
    renderSelectedStudent();
    if (selectedStudentId) loadAccount(selectedStudentId, true);
  });
};

const chooseOldestMembership = (body = {}) => {
  const studentId = idOf(body?.student || body?.studentId);
  const account = accountCache.get(studentId);
  if (!account?.items?.length) return body;
  const feeType = text(body?.feeType).toLowerCase() || 'tuition';
  if (feeType !== 'tuition') return body;
  const candidates = account.items
    .map((item) => ({ item, balance: orderTuition(item).outstanding }))
    .filter((entry) => entry.balance > 0)
    .sort((left, right) => timestamp(left.item?.dueDate) - timestamp(right.item?.dueDate));
  const oldestMembershipId = idOf(candidates[0]?.item?.studentMembershipId);
  if (!oldestMembershipId) return body;
  const orderIds = candidates
    .filter((entry) => idOf(entry.item?.studentMembershipId) === oldestMembershipId)
    .map((entry) => idOf(entry.item?.id))
    .filter(Boolean);
  if (!orderIds.length) return body;
  return {
    ...body,
    studentMembershipId: oldestMembershipId,
    allocationMode: 'auto_selected',
    selectedFeeOrderIds: orderIds,
    feeOrderId: undefined,
    allocations: undefined
  };
};

if (typeof window !== 'undefined' && !window.__studentFinanceAccountDirect) {
  window.__studentFinanceAccountDirect = true;
  nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;
    let paymentStudentId = '';
    if (
      method === 'POST'
      && /\/api\/student-finance\/payments(?:\/preview-allocation)?(?:\?|$)/.test(url)
      && typeof init?.body === 'string'
    ) {
      try {
        const parsed = JSON.parse(init.body);
        paymentStudentId = idOf(parsed?.student || parsed?.studentId);
        nextInit = { ...init, body: JSON.stringify(chooseOldestMembership(parsed)) };
      } catch {
        nextInit = init;
      }
    }
    const response = await nativeFetch(input, nextInit);
    if (method === 'POST' && /\/api\/student-finance\/payments(?:\?|$)/.test(url) && response.ok) {
      const refreshId = paymentStudentId || selectedStudentId;
      if (refreshId) window.setTimeout(() => loadAccount(refreshId, true), 300);
    }
    return response;
  };

  const start = () => {
    new MutationObserver(scheduleRender).observe(document.documentElement, { childList: true, subtree: true });
    bindStudentSelect();
    renderSelectedStudent();
    window.setInterval(() => {
      const current = idOf(document.querySelector('[data-testid="desk-student-select"]')?.value);
      if (current !== selectedStudentId) {
        selectedStudentId = current;
        renderSelectedStudent();
        if (current) loadAccount(current, true);
      }
    }, 600);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
