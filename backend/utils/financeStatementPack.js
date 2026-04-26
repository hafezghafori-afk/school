const ORDER_STATUS_LABELS = {
  new: 'جدید',
  partial: 'پرداخت قسمتی',
  paid: 'تصفیه',
  overdue: 'معوق',
  void: 'باطل'
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

const PAYMENT_METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'دستی',
  gateway: 'آنلاین',
  other: 'سایر'
};

const RELIEF_TYPE_LABELS = {
  discount: 'تخفیف',
  sibling_discount: 'تخفیف خواهر/برادر',
  waiver: 'معافیت',
  free_student: 'متعلم رایگان',
  scholarship_partial: 'بورسیه جزئی',
  scholarship_full: 'بورسیه کامل',
  charity_support: 'حمایت خیریه',
  merit_discount: 'تخفیف شایستگی',
  transport_discount: 'تخفیف ترانسپورت',
  admission_discount: 'تخفیف داخله',
  manual: 'ثبت دستی'
};

const RELIEF_COVERAGE_LABELS = {
  fixed: 'مبلغ ثابت',
  percent: 'درصدی',
  full: 'پوشش کامل'
};

const SIGNAL_TYPE_LABELS = {
  overpayment: 'بیش پرداخت',
  full_relief_with_open_balance: 'بل باز با تسهیل کامل',
  relief_expiring: 'تسهیل رو به ختم',
  long_overdue_balance: 'معوق بیش از سه ماه',
  pending_payment_stalled: 'پرداخت معطل در بررسی',
  admission_missing: 'داخله ثبت نشده'
};

const faNumber = new Intl.NumberFormat('fa-AF-u-ca-persian');
const faDateTime = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function escapeHtml(value = '') {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pickLabel(map, key, fallback = '-') {
  return map[String(key || '').trim()] || key || fallback;
}

function formatNumber(value) {
  return faNumber.format(Number(value || 0));
}

function formatCurrency(value, currency = 'AFN') {
  return `${formatNumber(value)} ${currency || 'AFN'}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return faDateTime.format(date);
  } catch {
    return date.toISOString();
  }
}

function buildSignalRows(items = []) {
  return items.map((item) => `
    <tr>
      <td>${escapeHtml(pickLabel(SIGNAL_TYPE_LABELS, item.anomalyType, 'سیگنال مالی'))}</td>
      <td>${escapeHtml(item.title || item.description || '-')}</td>
      <td>${escapeHtml(item.amountLabel || '-')}</td>
      <td>${escapeHtml(formatDateTime(item.dueDate || item.endDate || item.at))}</td>
    </tr>
  `).join('');
}

function buildOrderRows(items = [], currency = 'AFN') {
  return items.map((item) => `
    <tr>
      <td>${escapeHtml(item.title || item.orderNumber || '-')}</td>
      <td>${escapeHtml(pickLabel(ORDER_TYPE_LABELS, item.orderType, '-'))}</td>
      <td>${escapeHtml(pickLabel(ORDER_STATUS_LABELS, item.status, '-'))}</td>
      <td>${escapeHtml(formatDateTime(item.dueDate))}</td>
      <td>${escapeHtml(formatCurrency(item.amountDue, item.currency || currency))}</td>
      <td>${escapeHtml(formatCurrency(item.outstandingAmount, item.currency || currency))}</td>
    </tr>
  `).join('');
}

function buildPaymentRows(items = [], currency = 'AFN') {
  return items.map((item) => `
    <tr>
      <td>${escapeHtml(item.paymentNumber || '-')}</td>
      <td>${escapeHtml(pickLabel(PAYMENT_METHOD_LABELS, item.paymentMethod, item.paymentMethod || '-'))}</td>
      <td>${escapeHtml(pickLabel(PAYMENT_STATUS_LABELS, item.status, item.status || '-'))}</td>
      <td>${escapeHtml(pickLabel(PAYMENT_STAGE_LABELS, item.approvalStage, item.approvalStage || '-'))}</td>
      <td>${escapeHtml(formatDateTime(item.paidAt))}</td>
      <td>${escapeHtml(formatCurrency(item.amount, item.currency || currency))}</td>
    </tr>
  `).join('');
}

function buildReliefRows(items = [], currency = 'AFN') {
  return items.map((item) => {
    const value = item.coverageMode === 'full'
      ? '100%'
      : item.coverageMode === 'percent'
        ? `${formatNumber(item.percentage)}%`
        : formatCurrency(item.amount, currency);
    return `
      <tr>
        <td>${escapeHtml(pickLabel(RELIEF_TYPE_LABELS, item.reliefType, item.reliefType || '-'))}</td>
        <td>${escapeHtml(pickLabel(RELIEF_COVERAGE_LABELS, item.coverageMode, item.coverageMode || '-'))}</td>
        <td>${escapeHtml(value)}</td>
        <td>${escapeHtml(item.sponsorName || '-')}</td>
        <td>${escapeHtml(formatDateTime(item.endDate))}</td>
      </tr>
    `;
  }).join('');
}

function buildFinanceStatementPackHtml({
  title = 'بسته استیتمنت مالی',
  subjectLabel = 'متعلم',
  subjectName = 'متعلم',
  classTitle = '-',
  academicYearTitle = '-',
  membershipId = '-',
  generatedAt = null,
  currency = 'AFN',
  totals = {},
  pack = null,
  orders = [],
  payments = [],
  reliefs = []
} = {}) {
  const signalRows = buildSignalRows(Array.isArray(pack?.signals) ? pack.signals : []);
  const orderRows = buildOrderRows(Array.isArray(orders) ? orders : [], currency);
  const paymentRows = buildPaymentRows(Array.isArray(payments) ? payments : [], currency);
  const reliefRows = buildReliefRows(Array.isArray(reliefs) ? reliefs : [], currency);
  return `<!doctype html>
  <html lang="fa" dir="rtl">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        body { font-family: Tahoma, Arial, sans-serif; margin: 24px; color: #0f172a; background: #ffffff; }
        h1, h2, p { margin: 0 0 10px; }
        .meta, .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
        .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; background: #f8fafc; }
        .signal { border-right: 4px solid #f59e0b; background: #fff7ed; }
        .section { margin-top: 22px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: right; font-size: 13px; vertical-align: top; }
        th { background: #e2e8f0; }
        .footer { margin-top: 24px; color: #475569; font-size: 12px; }
        @media print {
          body { margin: 0; padding: 12mm; }
        }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subjectLabel)}: ${escapeHtml(subjectName)}</p>
      <div class="meta">
        <div class="card">صنف: ${escapeHtml(classTitle)}</div>
        <div class="card">سال تعلیمی: ${escapeHtml(academicYearTitle)}</div>
        <div class="card">شناسه عضویت: ${escapeHtml(membershipId)}</div>
        <div class="card">تاریخ تولید: ${escapeHtml(formatDateTime(generatedAt))}</div>
      </div>
      <div class="summary">
        <div class="card">کل بل ها: ${escapeHtml(formatNumber(totals.totalOrders || 0))}</div>
        <div class="card">کل پرداخت ها: ${escapeHtml(formatNumber(totals.totalPayments || 0))}</div>
        <div class="card">جمع بدهی: ${escapeHtml(formatCurrency(totals.totalDue || 0, currency))}</div>
        <div class="card">پرداخت شده: ${escapeHtml(formatCurrency(totals.totalPaid || 0, currency))}</div>
        <div class="card">مانده: ${escapeHtml(formatCurrency(totals.totalOutstanding || 0, currency))}</div>
        <div class="card">تسهیلات فعال: ${escapeHtml(formatNumber(totals.totalReliefs || 0))}</div>
      </div>
      <div class="card signal">
        <strong>اقدام پیشنهادی</strong>
        <p>${escapeHtml(pack?.recommendedAction || 'بدون اقدام خاص')}</p>
        <p>سیگنال ها: ${escapeHtml(formatNumber(pack?.summary?.total || 0))} | حساس: ${escapeHtml(formatNumber(pack?.summary?.critical || 0))}</p>
      </div>
      <div class="section">
        <h2>سیگنال های مالی</h2>
        <table>
          <thead><tr><th>نوع</th><th>شرح</th><th>مقدار</th><th>تاریخ مرجع</th></tr></thead>
          <tbody>${signalRows || '<tr><td colspan="4">سیگنال حساسی ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>بل ها</h2>
        <table>
          <thead><tr><th>عنوان</th><th>نوع</th><th>وضعیت</th><th>سررسید</th><th>مبلغ</th><th>مانده</th></tr></thead>
          <tbody>${orderRows || '<tr><td colspan="6">داده ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>پرداخت ها</h2>
        <table>
          <thead><tr><th>شماره</th><th>روش</th><th>وضعیت</th><th>مرحله</th><th>تاریخ</th><th>مبلغ</th></tr></thead>
          <tbody>${paymentRows || '<tr><td colspan="6">داده ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <div class="section">
        <h2>تسهیلات مالی</h2>
        <table>
          <thead><tr><th>نوع</th><th>پوشش</th><th>مقدار</th><th>تمویل کننده</th><th>تاریخ ختم</th></tr></thead>
          <tbody>${reliefRows || '<tr><td colspan="5">داده ای ثبت نشده است.</td></tr>'}</tbody>
        </table>
      </div>
      <p class="footer">این بسته از هسته مالی canonical سیستم تولید شده است.</p>
    </body>
  </html>`;
}

function buildMembershipStatementPackHtml({ membership = null, statement = {}, orders = [], payments = [], reliefs = [] } = {}) {
  return buildFinanceStatementPackHtml({
    title: 'بسته استیتمنت مالی متعلم',
    subjectLabel: 'نام متعلم',
    subjectName: membership?.student?.fullName || membership?.student?.name || 'متعلم',
    classTitle: membership?.schoolClass?.title || '-',
    academicYearTitle: membership?.academicYear?.title || '-',
    membershipId: membership?.id || '-',
    generatedAt: statement?.generatedAt,
    currency: statement?.currency || 'AFN',
    totals: statement?.totals || {},
    pack: statement?.pack || null,
    orders,
    payments,
    reliefs
  });
}

function buildParentStatementPackHtml({
  linkedStudent = null,
  financeStatement = null,
  financeOrders = [],
  financePayments = [],
  financeReliefs = []
} = {}) {
  return buildFinanceStatementPackHtml({
    title: 'بسته استیتمنت مالی فرزند',
    subjectLabel: 'نام متعلم',
    subjectName: linkedStudent?.name || 'متعلم',
    classTitle: linkedStudent?.classTitle || '-',
    academicYearTitle: linkedStudent?.academicYearTitle || '-',
    membershipId: linkedStudent?.membershipId || '-',
    generatedAt: financeStatement?.generatedAt,
    currency: financeStatement?.currency || 'AFN',
    totals: financeStatement?.totals || {},
    pack: financeStatement?.pack || null,
    orders: financeOrders,
    payments: financePayments,
    reliefs: financeReliefs
  });
}

module.exports = {
  buildMembershipStatementPackHtml,
  buildParentStatementPackHtml
};
