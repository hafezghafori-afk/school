import { API_BASE } from '../config/api';
import { formatAfghanDate } from './afghanDate';
import { readStoredSchoolId } from '../pages/adminWorkspaceUtils';
import './studentOpenAccountCards.css';

const accountByMembership = new Map();
const accountByStudent = new Map();
const loadingStudents = new Set();

let referenceDataPromise = null;
let selectedStudentId = '';
let nativeFetch = null;
let syncTimer = null;
let activeRequestToken = 0;

const normalizeId = (value) => String(value?._id || value?.id || value || '').trim();
const normalizeText = (value) => String(value || '').trim();
const getRequestUrl = (input) => typeof input === 'string' ? input : String(input?.url || '');
const toAmount = (value) => Math.max(0, Math.round((Number(value) || 0) * 100) / 100);
const formatAmount = (value) => toAmount(value).toLocaleString('fa-AF-u-ca-persian');
const asTime = (value) => {
  const time = new Date(value || 0).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
};
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
};

const toAfghanDate = (value) => {
  if (!value) return '-';
  return formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) || '-';
};

const toAfghanMonth = (value) => {
  if (!value) return '';
  return formatAfghanDate(value, { year: 'numeric', month: 'long' }) || '';
};

const getMembershipStudentIds = (membership = {}) => [
  normalizeId(membership?.student?.userId),
  normalizeId(membership?.student?.studentId),
  normalizeId(membership?.studentId),
  normalizeId(membership?.student)
].filter(Boolean);

const getScopedAmounts = (item = {}, feeType = 'tuition') => {
  const lineItems = Array.isArray(item?.lineItems) ? item.lineItems : [];
  const scoped = lineItems.filter((entry) => normalizeText(entry?.feeType) === feeType);
  if (scoped.length) {
    return scoped.reduce((summary, entry) => ({
      due: toAmount(summary.due + Number(entry?.netAmount || 0)),
      paid: toAmount(summary.paid + Number(entry?.paidAmount || 0)),
      outstanding: toAmount(summary.outstanding + Number(
        entry?.balanceAmount ?? Math.max(0, Number(entry?.netAmount || 0) - Number(entry?.paidAmount || 0))
      ))
    }), { due: 0, paid: 0, outstanding: 0 });
  }

  const orderType = normalizeText(item?.orderType).toLowerCase();
  if (lineItems.length || (orderType && orderType !== feeType)) {
    return { due: 0, paid: 0, outstanding: 0 };
  }

  return {
    due: toAmount(item?.amountDue),
    paid: toAmount(item?.amountPaid),
    outstanding: toAmount(item?.outstandingAmount)
  };
};

const buildOpenAccountView = (account = {}) => {
  const tuitionOrders = (Array.isArray(account?.items) ? account.items : [])
    .map((item) => ({ ...item, scoped: getScopedAmounts(item, 'tuition') }))
    .filter((item) => item.scoped.outstanding > 0)
    .sort((left, right) => {
      const dueDiff = asTime(left?.dueDate) - asTime(right?.dueDate);
      return dueDiff || normalizeId(left?.id).localeCompare(normalizeId(right?.id));
    });

  const grouped = new Map();
  tuitionOrders.forEach((item) => {
    const classTitle = normalizeText(item?.schoolClass?.title || item?.membership?.schoolClass?.title);
    const yearTitle = normalizeText(item?.academicYear?.title || item?.membership?.academicYear?.title);
    const monthLabel = normalizeText(item?.periodLabel) || toAfghanMonth(item?.dueDate) || normalizeText(item?.title) || 'باقیات مالی';
    const monthKey = normalizeText(item?.periodLabel)
      || (item?.dueDate ? `${new Date(item.dueDate).getFullYear()}-${new Date(item.dueDate).getMonth() + 1}` : '')
      || normalizeId(item?.id);
    const key = [monthKey, classTitle, yearTitle].join('|');
    const current = grouped.get(key) || {
      id: key,
      label: monthLabel,
      classTitle,
      yearTitle,
      dueDate: item?.dueDate || null,
      due: 0,
      paid: 0,
      outstanding: 0,
      count: 0,
      bills: []
    };
    if (asTime(item?.dueDate) < asTime(current.dueDate)) current.dueDate = item.dueDate;
    current.due = toAmount(current.due + item.scoped.due);
    current.paid = toAmount(current.paid + item.scoped.paid);
    current.outstanding = toAmount(current.outstanding + item.scoped.outstanding);
    current.count += 1;
    current.bills.push(item);
    grouped.set(key, current);
  });

  const months = [...grouped.values()].sort((left, right) => asTime(left.dueDate) - asTime(right.dueDate));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const overdueMonths = months.filter((item) => asTime(item.dueDate) < Date.now());
  const currentMonths = months.filter((item) => {
    const due = asTime(item.dueDate);
    return due >= monthStart && due < nextMonthStart;
  });
  const memberships = new Set(tuitionOrders.map((item) => normalizeId(item?.studentMembershipId)).filter(Boolean));

  return {
    tuitionOrders,
    months,
    totalOutstanding: toAmount(months.reduce((sum, item) => sum + item.outstanding, 0)),
    totalDue: toAmount(months.reduce((sum, item) => sum + item.due, 0)),
    totalPaid: toAmount(months.reduce((sum, item) => sum + item.paid, 0)),
    overdueCount: overdueMonths.length,
    overdueOutstanding: toAmount(overdueMonths.reduce((sum, item) => sum + item.outstanding, 0)),
    currentOutstanding: toAmount(currentMonths.reduce((sum, item) => sum + item.outstanding, 0)),
    membershipCount: memberships.size,
    oldestDueDate: months[0]?.dueDate || null
  };
};

const storeAccount = (payload = {}, explicitStudentId = '') => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const memberships = Array.isArray(payload?.memberships) ? payload.memberships : [];
  const account = {
    ...payload,
    items,
    memberships,
    summary: payload?.summary || {},
    loading: false,
    error: ''
  };

  const membershipIds = new Set([
    normalizeId(payload?.membership?.id),
    ...memberships.map((item) => normalizeId(item?.id)),
    ...items.map((item) => normalizeId(item?.studentMembershipId))
  ].filter(Boolean));
  membershipIds.forEach((membershipId) => accountByMembership.set(membershipId, account));

  const studentIds = new Set([
    normalizeId(explicitStudentId),
    ...getMembershipStudentIds(payload?.membership),
    ...memberships.flatMap(getMembershipStudentIds)
  ].filter(Boolean));
  studentIds.forEach((studentId) => accountByStudent.set(studentId, account));
  return account;
};

const chooseOldestMembership = (body = {}) => {
  const studentId = normalizeId(body?.student || body?.studentId);
  const membershipId = normalizeId(body?.studentMembershipId);
  const account = accountByStudent.get(studentId) || accountByMembership.get(membershipId);
  if (!account?.items?.length) return body;

  const feeType = normalizeText(body?.feeType).toLowerCase() || 'tuition';
  const candidates = account.items
    .map((item) => ({ item, balance: getScopedAmounts(item, feeType).outstanding }))
    .filter((entry) => entry.balance > 0)
    .sort((left, right) => asTime(left.item?.dueDate) - asTime(right.item?.dueDate));
  const oldest = candidates[0]?.item;
  const oldestMembershipId = normalizeId(oldest?.studentMembershipId);
  if (!oldestMembershipId) return body;

  const scopedOrderIds = candidates
    .filter((entry) => normalizeId(entry.item?.studentMembershipId) === oldestMembershipId)
    .map((entry) => normalizeId(entry.item?.id))
    .filter(Boolean);
  if (!scopedOrderIds.length) return body;

  return {
    ...body,
    studentMembershipId: oldestMembershipId,
    allocationMode: 'auto_selected',
    selectedFeeOrderIds: scopedOrderIds,
    feeOrderId: undefined,
    allocations: undefined
  };
};

const fetchJson = async (url, options = {}) => {
  const response = await nativeFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || 'دریافت اطلاعات مالی شاگرد ناموفق بود.');
  }
  return data;
};

const loadReferenceData = async (force = false) => {
  if (!referenceDataPromise || force) {
    referenceDataPromise = fetchJson(`${API_BASE}/api/student-finance/reference-data`, {
      headers: getAuthHeaders()
    }).catch((error) => {
      referenceDataPromise = null;
      throw error;
    });
  }
  return referenceDataPromise;
};

const findMembershipForStudent = (memberships = [], studentId = '') => {
  const normalizedStudentId = normalizeId(studentId);
  return memberships.find((item) => getMembershipStudentIds(item).includes(normalizedStudentId)) || null;
};

const loadStudentAccount = async (studentId, force = false) => {
  const normalizedStudentId = normalizeId(studentId);
  if (!normalizedStudentId || loadingStudents.has(normalizedStudentId)) return;
  if (!force && accountByStudent.has(normalizedStudentId)) {
    scheduleSync();
    return;
  }

  const requestToken = ++activeRequestToken;
  loadingStudents.add(normalizedStudentId);
  accountByStudent.set(normalizedStudentId, { loading: true, items: [], memberships: [], summary: {}, error: '' });
  scheduleSync();

  try {
    let referenceData = await loadReferenceData(force);
    let membership = findMembershipForStudent(referenceData?.memberships || [], normalizedStudentId);
    if (!membership && !force) {
      referenceData = await loadReferenceData(true);
      membership = findMembershipForStudent(referenceData?.memberships || [], normalizedStudentId);
    }
    if (!membership?.id) {
      throw new Error('عضویت مالی این شاگرد پیدا نشد.');
    }

    const payload = await fetchJson(
      `${API_BASE}/api/student-finance/memberships/${encodeURIComponent(membership.id)}/open-orders`,
      { headers: getAuthHeaders() }
    );
    storeAccount(payload, normalizedStudentId);
  } catch (error) {
    accountByStudent.set(normalizedStudentId, {
      loading: false,
      items: [],
      memberships: [],
      summary: {},
      error: error?.message || 'حساب باز شاگرد دریافت نشد.'
    });
  } finally {
    loadingStudents.delete(normalizedStudentId);
    if (requestToken === activeRequestToken || selectedStudentId === normalizedStudentId) scheduleSync();
  }
};

const getSelectedStudentName = (studentId, account = {}) => {
  const membershipName = normalizeText(account?.membership?.student?.fullName)
    || normalizeText(account?.memberships?.[0]?.student?.fullName);
  if (membershipName) return membershipName;
  const select = document.querySelector('[data-testid="desk-student-select"]');
  const option = [...(select?.options || [])].find((item) => normalizeId(item.value) === normalizeId(studentId));
  return normalizeText(option?.textContent).split(' - ')[0] || 'متعلم';
};

const getStatusLabel = (dueDate) => {
  const due = asTime(dueDate);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  if (due < Date.now()) return { label: 'سررسید گذشته', className: 'is-overdue' };
  if (due >= monthStart && due < nextMonthStart) return { label: 'ماه جاری', className: 'is-current' };
  return { label: 'آینده', className: 'is-future' };
};

const buildTabsHtml = (studentId) => `
  <div class="student-open-account-tabs">
    <button type="button" class="is-active" data-student-account-open>حساب باز</button>
    <button type="button" data-student-account-history data-student-id="${escapeHtml(studentId)}">تاریخچه کامل شاگرد</button>
  </div>
`;

const buildMonthRowsHtml = (months = [], limit = null) => {
  const visible = Number.isFinite(limit) ? months.slice(0, limit) : months;
  if (!visible.length) {
    return '<p class="muted student-open-account-empty">برای این شاگرد بدهی باز فیس/شهریه وجود ندارد.</p>';
  }
  return visible.map((item) => {
    const status = getStatusLabel(item.dueDate);
    const meta = [item.classTitle, item.yearTitle, item.count > 1 ? `${item.count} بل` : ''].filter(Boolean).join(' | ');
    return `
      <div class="student-open-account-month ${status.className}">
        <div class="student-open-account-month-head">
          <span>
            <strong>${escapeHtml(item.label)}</strong>
            <small>${escapeHtml(item.dueDate ? `مهلت: ${toAfghanDate(item.dueDate)}` : 'مهلت ثبت نشده')}${meta ? ` | ${escapeHtml(meta)}` : ''}</small>
          </span>
          <span class="student-open-account-status">${escapeHtml(status.label)}</span>
        </div>
        <div class="student-open-account-amounts">
          <span><b>اصل فیس</b>${formatAmount(item.due)} AFN</span>
          <span><b>پرداخت‌شده</b>${formatAmount(item.paid)} AFN</span>
          <span class="is-strong"><b>باقی‌مانده</b>${formatAmount(item.outstanding)} AFN</span>
        </div>
      </div>
    `;
  }).join('');
};

const bindOverlayActions = (overlay, studentId) => {
  overlay.querySelector('[data-student-account-open]')?.addEventListener('click', () => {
    document.querySelector('[data-testid="student-monthly-arrears"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  overlay.querySelector('[data-student-account-history]')?.addEventListener('click', () => {
    const normalizedStudentId = normalizeId(studentId);
    if (normalizedStudentId) window.location.assign(`/admin-finance/profile/${encodeURIComponent(normalizedStudentId)}`);
  });
};

const ensureOverlay = (card, signature, html, studentId) => {
  if (!card) return;
  card.classList.add('student-open-account-patched');
  let overlay = card.querySelector(':scope > .student-open-account-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'student-open-account-overlay';
    overlay.setAttribute('dir', 'rtl');
    card.appendChild(overlay);
  }
  if (overlay.dataset.signature === signature) return;
  overlay.dataset.signature = signature;
  overlay.innerHTML = html;
  bindOverlayActions(overlay, studentId);
};

const clearOverlay = (card) => {
  if (!card) return;
  card.classList.remove('student-open-account-patched');
  card.querySelector(':scope > .student-open-account-overlay')?.remove();
};

const renderArrearsCard = (studentId, account = {}) => {
  const card = document.querySelector('[data-testid="student-monthly-arrears"]');
  if (!card) return;
  if (!studentId) {
    clearOverlay(card);
    return;
  }

  const studentName = getSelectedStudentName(studentId, account);
  if (account?.loading) {
    ensureOverlay(card, `${studentId}:loading`, `
      <div class="student-open-account-head"><div><h3>صندوق باقیات ماهانه شاگرد</h3><p class="muted">در حال دریافت حساب باز کامل ${escapeHtml(studentName)}...</p></div>${buildTabsHtml(studentId)}</div>
      <p class="student-open-account-loading">در حال بارگذاری باقیات از تمام صنف‌ها و سال‌های تعلیمی...</p>
    `, studentId);
    return;
  }

  if (account?.error) {
    ensureOverlay(card, `${studentId}:error:${account.error}`, `
      <div class="student-open-account-head"><div><h3>صندوق باقیات ماهانه شاگرد</h3><p class="muted">حساب باز فیس/شهریه شاگرد</p></div>${buildTabsHtml(studentId)}</div>
      <p class="student-open-account-error">${escapeHtml(account.error)}</p>
    `, studentId);
    return;
  }

  const view = buildOpenAccountView(account);
  const signature = `${studentId}:${view.months.length}:${view.totalOutstanding}:${view.totalPaid}`;
  ensureOverlay(card, signature, `
    <div class="student-open-account-head">
      <div>
        <h3>صندوق باقیات ماهانه شاگرد</h3>
        <p class="muted">تمام حساب باز فیس/شهریه از عضویت، صنف و سال‌های تعلیمی قبلی و جاری.</p>
      </div>
      ${buildTabsHtml(studentId)}
    </div>
    <div class="student-open-account-chips">
      <span>${view.months.length} ماه باز</span>
      <span class="is-danger">${view.overdueCount} سررسید گذشته</span>
      <span class="is-money">${formatAmount(view.totalOutstanding)} AFN باقیات</span>
    </div>
    <div class="student-open-account-summary">
      <div><span>شاگرد</span><strong>${escapeHtml(studentName)}</strong></div>
      <div><span>عضویت‌های دارای بدهی</span><strong>${view.membershipCount || 0}</strong></div>
      <div><span>سررسید گذشته</span><strong>${formatAmount(view.overdueOutstanding)} AFN</strong></div>
      <div><span>کل باقیات فیس</span><strong>${formatAmount(view.totalOutstanding)} AFN</strong></div>
    </div>
    <div class="student-open-account-list">${buildMonthRowsHtml(view.months)}</div>
  `, studentId);
};

const renderStudentFinanceCard = (studentId, account = {}) => {
  const card = document.querySelector('[data-testid="finance-payment-desk"] .finance-payment-student-card-row');
  if (!card) return;
  if (!studentId) {
    clearOverlay(card);
    return;
  }

  const studentName = getSelectedStudentName(studentId, account);
  if (account?.loading) {
    ensureOverlay(card, `${studentId}:profile-loading`, `
      <div class="student-open-account-head"><div><h4>کارت مالی متعلم</h4><p class="muted">در حال دریافت حساب باز ${escapeHtml(studentName)}...</p></div>${buildTabsHtml(studentId)}</div>
    `, studentId);
    return;
  }

  const view = buildOpenAccountView(account);
  const signature = `${studentId}:profile:${view.months.length}:${view.totalOutstanding}:${view.overdueOutstanding}:${account?.error || ''}`;
  ensureOverlay(card, signature, `
    <div class="student-open-account-head">
      <div><h4>کارت مالی متعلم</h4><p class="muted">وضعیت فوری حساب باز فیس/شهریه؛ بدون داخله و تخفیف.</p></div>
      ${buildTabsHtml(studentId)}
    </div>
    ${account?.error ? `<p class="student-open-account-error">${escapeHtml(account.error)}</p>` : `
      <div class="student-open-account-kpis">
        <div><span>کل باقیات</span><strong>${formatAmount(view.totalOutstanding)} AFN</strong></div>
        <div class="is-danger"><span>سررسید گذشته</span><strong>${formatAmount(view.overdueOutstanding)} AFN</strong></div>
        <div><span>ماه جاری</span><strong>${formatAmount(view.currentOutstanding)} AFN</strong></div>
        <div><span>ماه‌های باز</span><strong>${view.months.length}</strong></div>
      </div>
      <div class="student-open-account-quick-list">
        ${buildMonthRowsHtml(view.months, 3)}
        ${view.months.length > 3 ? `<small class="student-open-account-more">${view.months.length - 3} ماه دیگر در صندوق باقیات موجود است.</small>` : ''}
      </div>
    `}
  `, studentId);
};

const renderSelectedStudent = () => {
  const select = document.querySelector('[data-testid="desk-student-select"]');
  const studentId = normalizeId(select?.value);
  selectedStudentId = studentId;
  const account = accountByStudent.get(studentId) || null;
  renderArrearsCard(studentId, account || { loading: Boolean(studentId), items: [], memberships: [], summary: {} });
  renderStudentFinanceCard(studentId, account || { loading: Boolean(studentId), items: [], memberships: [], summary: {} });
  if (studentId && !account && !loadingStudents.has(studentId)) loadStudentAccount(studentId);
};

const bindStudentSelect = () => {
  const select = document.querySelector('[data-testid="desk-student-select"]');
  if (!select || select.dataset.studentOpenAccountBound === 'true') return;
  select.dataset.studentOpenAccountBound = 'true';
  select.addEventListener('change', () => {
    selectedStudentId = normalizeId(select.value);
    renderSelectedStudent();
    if (selectedStudentId) loadStudentAccount(selectedStudentId);
  });
};

const scheduleSync = () => {
  if (syncTimer) return;
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    bindStudentSelect();
    renderSelectedStudent();
  }, 40);
};

if (typeof window !== 'undefined' && !window.__studentOpenAccountFetchPatched) {
  window.__studentOpenAccountFetchPatched = true;
  nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = getRequestUrl(input);
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    let nextInit = init;
    let submittedStudentId = '';

    if (
      method === 'POST'
      && (/\/api\/student-finance\/payments(?:\/preview-allocation)?(?:\?|$)/.test(url))
      && typeof init?.body === 'string'
      && String(init?.headers?.['Content-Type'] || init?.headers?.['content-type'] || '').includes('application/json')
    ) {
      try {
        const parsed = JSON.parse(init.body);
        submittedStudentId = normalizeId(parsed?.student || parsed?.studentId);
        const adjusted = chooseOldestMembership(parsed);
        nextInit = { ...init, body: JSON.stringify(adjusted) };
      } catch {
        // Keep the original request when the body is not valid JSON.
      }
    }

    const response = await nativeFetch(input, nextInit);

    if (method === 'GET' && /\/api\/student-finance\/memberships\/[^/]+\/open-orders(?:\?|$)/.test(url)) {
      try {
        const payload = await response.clone().json();
        if (payload?.success) storeAccount(payload, selectedStudentId);
      } catch {
        // The finance page will continue using the original response.
      }
      scheduleSync();
    }

    if (method === 'POST' && /\/api\/student-finance\/payments(?:\?|$)/.test(url) && response.ok) {
      const refreshStudentId = submittedStudentId || selectedStudentId;
      if (refreshStudentId) window.setTimeout(() => loadStudentAccount(refreshStudentId, true), 250);
    }

    return response;
  };

  const observer = new MutationObserver(scheduleSync);
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    bindStudentSelect();
    renderSelectedStudent();
    window.setInterval(() => {
      const currentId = normalizeId(document.querySelector('[data-testid="desk-student-select"]')?.value);
      if (currentId !== selectedStudentId) {
        selectedStudentId = currentId;
        renderSelectedStudent();
        if (currentId) loadStudentAccount(currentId);
      } else {
        scheduleSync();
      }
    }, 700);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
