import React, { useEffect, useMemo, useState } from 'react';
import './ShortTermCenter.css';
import { API_BASE } from '../config/api';
import { studentMatchesSearch } from '../utils/studentSearch';
import { useToast } from '../components/ui/toast';

const emptyStudent = {
  firstName: '',
  lastName: '',
  fullName: '',
  fatherName: '',
  tazkiraNumber: '',
  gender: '',
  phone: '',
  guardianPhone: '',
  address: '',
  status: 'active',
  note: ''
};

const emptyClass = {
  name: '',
  subject: '',
  teacherName: '',
  defaultFee: '',
  days: '',
  startTime: '',
  endTime: '',
  capacity: '',
  room: '',
  startDate: '',
  endDate: '',
  status: 'active'
};

const emptyRegistration = {
  studentId: '',
  classId: '',
  registrationDate: new Date().toISOString().slice(0, 10),
  startDate: '',
  durationMonths: 1,
  feeAmount: '',
  discountAmount: '',
  paymentPlan: 'full',
  note: ''
};

const emptyPayment = {
  registrationId: '',
  amount: '',
  paymentMethod: 'cash',
  paidAt: new Date().toISOString().slice(0, 10),
  referenceNo: '',
  note: ''
};

const emptyExpense = {
  title: '',
  category: 'other',
  amount: '',
  expenseDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'cash',
  paidTo: '',
  note: ''
};

const emptyAttendance = {
  classId: '',
  attendanceDate: new Date().toISOString().slice(0, 10),
  students: []
};

const emptySettings = {
  name: 'مرکز آموزش کوتاه‌مدت',
  address: '',
  phone: '',
  email: '',
  currency: 'AFN',
  studentCodePrefix: 'STC',
  invoicePrefix: 'STC-INV',
  receiptPrefix: 'STC-RCP',
  receiptFooter: 'تشکر از پرداخت شما',
  sealText: ''
};

const tabs = [
  { key: 'dashboard', label: 'داشبورد' },
  { key: 'students', label: 'شاگردان' },
  { key: 'classes', label: 'صنف‌ها' },
  { key: 'registrations', label: 'ثبت‌نام و فیس' },
  { key: 'payments', label: 'پرداخت، بل و رسید' },
  { key: 'attendance', label: 'حاضری' },
  { key: 'expenses', label: 'مصارف' },
  { key: 'reports', label: 'گزارش ماهوار' },
  { key: 'settings', label: 'تنظیمات اصلی' }
];

const paymentMethodLabels = {
  cash: 'نقدی',
  card: 'کارت',
  bank_transfer: 'بانک',
  hawala: 'حواله',
  other: 'سایر'
};

const expenseCategoryLabels = {
  teacher_salary: 'معاش استاد',
  rent: 'کرایه',
  utilities: 'برق و خدمات',
  internet: 'انترنت',
  stationery: 'قرطاسیه',
  marketing: 'تبلیغات',
  equipment: 'تجهیزات',
  other: 'سایر'
};

const gregorianMonthNamesFa = ['جنوری', 'فبروری', 'مارچ', 'اپریل', 'می', 'جون', 'جولای', 'اگست', 'سپتمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const faYear = (year) => Number(year || 0).toLocaleString('fa-AF', { useGrouping: false });
const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-');
  const label = gregorianMonthNamesFa[Number(month) - 1] || month;
  return `${label} ${faYear(year)}`;
};

const fmt = (value) => (Number(value || 0)).toLocaleString('fa-AF');
const text = (value, fallback = '-') => String(value || '').trim() || fallback;
const includesSearch = (values = [], term = '') => {
  const normalized = String(term || '').trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(normalized));
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function requestJson(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || 'عملیات ناموفق بود.');
  }
  return data;
}

function Field({ label, children }) {
  return (
    <label className="stc-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, tone = '' }) {
  return (
    <div className={`stc-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const TABLE_PAGE_SIZE = 10;

function Table({ columns = [], rows = [] }) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  if (!rows.length) {
    return <p className="stc-empty">هنوز موردی ثبت نشده است.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);

  return (
    <div className="stc-table-wrap">
      <table className="stc-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {pageRows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="stc-table-pagination">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>قبلی</button>
          <span>صفحه {safePage.toLocaleString('fa-AF')} از {pageCount.toLocaleString('fa-AF')}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>بعدی</button>
        </div>
      )}
    </div>
  );
}

const escapeHtml = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Standalone print window on a real A4 page - same approach and same
// fixed-page-math as the finance center's receipt print (AdminFinance.jsx /
// buildReceiptPrintHtml). Two copies (student + center) MUST land on one
// physical page every time, including after this receipt grows a field or
// two later - so each copy gets a fixed-height box (134mm; two of those plus
// a 5mm cut line exactly fill the 273mm of usable height a 12mm page margin
// leaves on A4's 297mm) and the print script measures the copy's actual
// rendered height against that box and scales the whole copy down to fit if
// it ever runs long, instead of letting it spill onto a second/third page.
function buildReceiptPrintHtml(invoice, settings) {
  const issuedAtLabel = invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString('fa-AF-u-ca-persian') : '';
  const centerName = escapeHtml(text(settings?.name, 'مرکز آموزش کوتاه‌مدت'));
  const renderCopy = (label) => `
    <section class="copy">
    <div class="copy-inner">
      <div class="copy-label">${escapeHtml(label)}</div>
      <div class="letterhead">
        <h2>${centerName}</h2>
        <p>${escapeHtml([settings?.address, settings?.phone, settings?.email].filter(Boolean).join(' · '))}</p>
      </div>
      <div class="doc-title">رسید پرداخت فیس — ${escapeHtml(invoice.invoiceNumber)}</div>
      <table class="meta-grid">
        <tr><th>شاگرد</th><td>${escapeHtml(text(invoice.studentId?.fullName))}</td><th>کد شاگرد</th><td class="ltr">${escapeHtml(text(invoice.studentId?.studentCode))}</td></tr>
        <tr><th>صنف</th><td>${escapeHtml(text(invoice.className))}</td><th>تاریخ</th><td>${escapeHtml(issuedAtLabel || '-')}</td></tr>
        <tr><th>روش پرداخت</th><td>${escapeHtml(paymentMethodLabels[invoice.paymentMethod] || text(invoice.paymentMethod))}</td><th>مرجع</th><td class="ltr">${escapeHtml(text(invoice.referenceNo, '-'))}</td></tr>
      </table>
      <table class="amount-grid">
        <tr><td>فیس اصلی</td><td class="ltr">${escapeHtml(fmt(invoice.feeAmount))} ${escapeHtml(invoice.currency)}</td></tr>
        <tr><td>تخفیف</td><td class="ltr">${escapeHtml(fmt(invoice.discountAmount))} ${escapeHtml(invoice.currency)}</td></tr>
        <tr><td>باقی‌ماندهٔ قبلی</td><td class="ltr">${escapeHtml(fmt(invoice.previousBalance))} ${escapeHtml(invoice.currency)}</td></tr>
        <tr class="total"><td>مبلغ این پرداخت</td><td class="ltr">${escapeHtml(fmt(invoice.paidAmount))} ${escapeHtml(invoice.currency)}</td></tr>
        <tr><td>باقی‌ماندهٔ جدید</td><td class="ltr">${escapeHtml(fmt(invoice.remainingBalance))} ${escapeHtml(invoice.currency)}</td></tr>
      </table>
      <div class="foot">
        <span>${escapeHtml(text(settings?.receiptFooter, 'تشکر از پرداخت شما'))}</span>
        <div class="sig-seal">
          <div class="sig">امضای دریافت‌کننده</div>
          <div class="seal">${escapeHtml(settings?.sealText ? settings.sealText : 'جای تمبر')}</div>
        </div>
      </div>
    </div>
    </section>`;

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>رسید پرداخت - ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  /* Same faces the finance center's own receipt loads (frontend/public/fonts)
     - a proper Dari/Farsi typeface (Nazanin) instead of leaving it to
     whatever generic sans-serif the OS happens to substitute for Persian
     script, which is what Tahoma-first was silently doing before. */
  @font-face { font-family: 'B Nazanin'; src: url('/fonts/B_Nazanin.ttf') format('truetype'); font-weight: 400; }
  @font-face { font-family: 'B Nazanin'; src: url('/fonts/B_Nazanin_Bold.ttf') format('truetype'); font-weight: 700; }
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: 'B Nazanin', 'B Mitra', Tahoma, sans-serif; }
  #page-ruler { position: absolute; visibility: hidden; height: 134mm; width: 1px; top: 0; left: 0; }
  .copy { height: 134mm; box-sizing: border-box; border: 0.3mm solid #111; border-radius: 2mm; padding: 4mm 6mm; overflow: visible; position: relative; }
  .copy-inner { transform-origin: top center; }
  .cut-line { position: relative; display: flex; align-items: center; justify-content: center; height: 5mm; color: #555; font-size: 7pt; margin: 0; }
  .cut-line::before { position: absolute; right: 0; left: 0; top: 50%; border-top: 0.25mm dashed #777; content: ''; }
  .cut-line span { position: relative; z-index: 1; padding: 0 3mm; background: #fff; }
  .copy-label { text-align: center; font-weight: 700; font-size: 9pt; color: #444; margin-bottom: 2mm; }
  .letterhead { text-align: center; margin-bottom: 3mm; }
  .letterhead h2 { margin: 0; font-size: 14pt; }
  .letterhead p { margin: 1mm 0 0; font-size: 8.5pt; color: #333; }
  .doc-title { text-align: center; font-weight: 700; font-size: 10pt; border-top: 0.3mm solid #111; border-bottom: 0.3mm solid #111; padding: 1.6mm 0; margin-bottom: 2.5mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8.8pt; margin-bottom: 2.5mm; }
  .meta-grid th, .meta-grid td { border: 0.2mm solid #999; padding: 1.4mm 2mm; text-align: right; }
  .meta-grid th { background: #f2f2f2; font-weight: 700; width: 14%; }
  .amount-grid td { border: 0.2mm solid #999; padding: 1.6mm 3mm; }
  .amount-grid td:first-child { width: 65%; }
  .amount-grid .total td { font-weight: 800; background: #f2f2f2; font-size: 9.5pt; }
  .ltr { direction: ltr; unicode-bidi: isolate; text-align: left; }
  .foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 3mm; font-size: 8.5pt; }
  .sig-seal { display: flex; gap: 6mm; align-items: flex-end; }
  .sig { border-top: 0.2mm solid #333; padding-top: 1.5mm; width: 34mm; text-align: center; }
  .seal { width: 20mm; height: 20mm; border: 0.3mm dashed #8c3b34; color: #8c3b34; border-radius: 50%; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 6.5pt; padding: 1mm; }
</style>
</head>
<body>
  <div id="page-ruler"></div>
  ${renderCopy('نسخهٔ شاگرد')}
  <div class="cut-line"><span>محل برش</span></div>
  ${renderCopy('نسخهٔ مرکز')}
  <script>
    (function () {
      var printed = false;
      function ready() {
        if (printed) return;
        printed = true;
        try {
          var halfPageHeightPx = document.getElementById('page-ruler').getBoundingClientRect().height;
          var inners = document.querySelectorAll('.copy-inner');
          for (var i = 0; i < inners.length; i += 1) {
            var inner = inners[i];
            inner.style.transform = 'none';
            var naturalHeight = inner.getBoundingClientRect().height;
            if (halfPageHeightPx > 0 && naturalHeight > halfPageHeightPx) {
              inner.style.transform = 'scale(' + (halfPageHeightPx / naturalHeight) + ')';
            }
          }
        } catch (err) {
          // Printing the unscaled document beats not printing at all.
        }
        setTimeout(function () { window.print(); }, 60);
      }
      if (window.document.fonts && window.document.fonts.ready) {
        window.document.fonts.ready.then(ready, ready);
      }
      window.addEventListener('load', ready);
      setTimeout(ready, 2500);
    })();
  </script>
</body>
</html>`;
}

export default function ShortTermCenter() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(emptySettings);
  const [summary, setSummary] = useState({});
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenseCategoryForm, setExpenseCategoryForm] = useState({ name: '' });
  const [attendance, setAttendance] = useState([]);
  const [reports, setReports] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
  const [monthlyReportDetail, setMonthlyReportDetail] = useState(null);
  const [monthlyReportYear, setMonthlyReportYear] = useState(new Date().getFullYear());
  const [monthlyReportMonth, setMonthlyReportMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [classForm, setClassForm] = useState(emptyClass);
  const [registrationForm, setRegistrationForm] = useState(emptyRegistration);
  const [registrationStudentSearch, setRegistrationStudentSearch] = useState('');
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [paymentRegistrationSearch, setPaymentRegistrationSearch] = useState('');
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendance);

  const currency = settings?.currency || 'AFN';

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/short-term-center/bootstrap');
      setSettings(data.settings || settings);
      setSummary(data.summary || {});
      setStudents(data.students || []);
      setClasses(data.classes || []);
      setRegistrations(data.registrations || []);
      setPayments(data.payments || []);
      setInvoices(data.invoices || []);
      setExpenses(data.expenses || []);
      setExpenseCategories(data.expenseCategories || []);
      setAttendance(data.attendance || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadReports = async () => {
    try {
      const data = await requestJson('/api/short-term-center/reports/overview');
      setReports(data);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const loadMonthlyReport = async (year = monthlyReportYear) => {
    setMonthlyReportLoading(true);
    try {
      const data = await requestJson(`/api/short-term-center/reports/monthly?year=${year}`);
      const months = (data.months || []).map((item) => ({ ...item, monthLabel: formatMonthLabel(item.month) }));
      setMonthlyReport(months);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMonthlyReportLoading(false);
    }
  };

  const changeMonthlyReportYear = (year) => {
    setMonthlyReportYear(year);
    setMonthlyReportMonth('');
    setMonthlyReport(null);
  };

  const monthlyReportYearOptions = useMemo(
    () => Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index),
    []
  );

  const visibleMonthlyReport = useMemo(() => {
    if (!monthlyReport) return [];
    if (!monthlyReportMonth) return monthlyReport;
    return monthlyReport.filter((item) => item.month === `${monthlyReportYear}-${monthlyReportMonth}`);
  }, [monthlyReport, monthlyReportMonth, monthlyReportYear]);

  useEffect(() => {
    if (activeTab === 'reports' && !reports) loadReports();
    if (activeTab === 'reports' && !monthlyReport) loadMonthlyReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reports, monthlyReport]);

  const activeRegistrations = useMemo(() => registrations.filter((item) => item.status === 'active'), [registrations]);

  const filteredStudents = useMemo(() => students.filter((item) => studentMatchesSearch(item, searchTerm)), [students, searchTerm]);

  const registrationStudentOptions = useMemo(() => {
    const matches = students.filter((item) => studentMatchesSearch(item, registrationStudentSearch));
    const selected = students.find((item) => String(item._id) === String(registrationForm.studentId));
    if (selected && !matches.some((item) => item._id === selected._id)) return [selected, ...matches];
    return matches;
  }, [students, registrationStudentSearch, registrationForm.studentId]);

  const paymentRegistrationOptions = useMemo(() => {
    const matches = activeRegistrations.filter((item) => studentMatchesSearch(item.studentId || item, paymentRegistrationSearch, [item.classId?.name]));
    const selected = activeRegistrations.find((item) => String(item._id) === String(paymentForm.registrationId));
    if (selected && !matches.some((item) => item._id === selected._id)) return [selected, ...matches];
    return matches;
  }, [activeRegistrations, paymentRegistrationSearch, paymentForm.registrationId]);

  const filteredRegistrations = useMemo(
    () => registrations.filter((item) => studentMatchesSearch(item.studentId || item, searchTerm, [item.classId?.name])),
    [registrations, searchTerm]
  );

  const filteredInvoices = useMemo(
    () => invoices.filter((item) => studentMatchesSearch(item.studentId || item, searchTerm, [item.invoiceNumber, item.className])),
    [invoices, searchTerm]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((item) => includesSearch([item.title, item.category, item.paidTo, item.expenseDate], searchTerm)),
    [expenses, searchTerm]
  );

  const selectedClass = useMemo(
    () => classes.find((item) => String(item._id) === String(registrationForm.classId)),
    [classes, registrationForm.classId]
  );

  const expenseCategoryOptions = useMemo(() => {
    const builtIn = Object.entries(expenseCategoryLabels).map(([value, label]) => ({ value, label }));
    const custom = expenseCategories.filter((item) => item.status !== 'inactive').map((item) => ({ value: item.name, label: item.name }));
    return [...builtIn, ...custom];
  }, [expenseCategories]);

  const selectedAttendanceClassRegistrations = useMemo(
    () => registrations.filter((item) => item.status === 'active' && String(item.classId?._id || item.classId || '') === String(attendanceForm.classId || '')),
    [registrations, attendanceForm.classId]
  );

  useEffect(() => {
    if (!selectedClass || registrationForm.feeAmount) return;
    setRegistrationForm((prev) => ({ ...prev, feeAmount: selectedClass.defaultFee || '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClass]);

  useEffect(() => {
    if (!attendanceForm.classId) return;
    setAttendanceForm((prev) => ({
      ...prev,
      students: selectedAttendanceClassRegistrations.map((item) => ({
        studentId: item.studentId?._id || item.studentId,
        name: item.studentId?.fullName || 'شاگرد',
        code: item.studentId?.studentCode || '',
        status: 'present',
        note: ''
      }))
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceForm.classId, selectedAttendanceClassRegistrations]);

  // `preOpenedPrintWindow`, when passed, is a window already opened
  // synchronously by the caller *before* this async function's first await -
  // see the payment form's onSubmit below. Opening window.open() after an
  // await (i.e. after the payment API call resolves) is what most browsers'
  // popup blockers treat as "not user-initiated" and silently neuter, which
  // is exactly what produced the blank/white print.
  const submit = async ({ path, method = 'POST', payload, reset, successTab, autoPrintReceipt, preOpenedPrintWindow }) => {
    setBusy(true);
    try {
      const data = await requestJson(path, { method, body: JSON.stringify(payload) });
      toast.success(data.message || 'ذخیره شد.');
      if (data.invoice && autoPrintReceipt) {
        printReceipt(data.invoice, data.settings || settings, preOpenedPrintWindow);
      } else if (preOpenedPrintWindow) {
        preOpenedPrintWindow.close();
      }
      if (reset) reset();
      if (successTab) setActiveTab(successTab);
      await loadData();
      if (monthlyReport && (path === '/api/short-term-center/payments' || path === '/api/short-term-center/expenses')) {
        setMonthlyReport(null);
      }
    } catch (error) {
      toast.error(error.message);
      if (preOpenedPrintWindow) preOpenedPrintWindow.close();
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await requestJson('/api/short-term-center/settings', { method: 'PUT', body: JSON.stringify(settings) });
      // The saved name/prefixes are re-fetched into `settings`, which every
      // form, table and the printed receipt read live - so a name change
      // here is reflected everywhere else on the very next render, with no
      // separate copy of it anywhere to fall out of sync.
      setSettings(data.settings || settings);
      toast.success(data.message || 'تنظیمات ذخیره شد.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  // `existingWindow`, when given, must already be open (see submit() above).
  // 'noopener'/'noreferrer' are deliberately NOT passed to window.open here -
  // Chromium-based browsers (Chrome, Brave, Edge) return null for the new
  // window reference when 'noopener' is set, which silently breaks the
  // document.write() below into printing a blank page instead of erroring.
  const printReceipt = (invoice, settingsForPrint, existingWindow) => {
    const printWindow = existingWindow || window.open('', '_blank');
    if (!printWindow) {
      toast.error('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ لطفاً پنجره‌های بازشو (popup) را برای این سایت مجاز کنید.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildReceiptPrintHtml(invoice, settingsForPrint || settings));
    printWindow.document.close();
  };

  const printInvoiceById = (invoice) => printReceipt(invoice, settings);

  const completeRegistration = async (item) => {
    setBusy(true);
    try {
      const data = await requestJson(`/api/short-term-center/registrations/${item._id}/complete`, { method: 'PUT' });
      toast.success(data.message || 'مدت شاگرد تکمیل شد.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAttendance = async (event) => {
    event.preventDefault();
    await submit({ path: '/api/short-term-center/attendance', payload: attendanceForm, reset: () => setAttendanceForm(emptyAttendance), successTab: 'attendance' });
  };

  const saveExpenseCategory = async (event) => {
    event.preventDefault();
    await submit({ path: '/api/short-term-center/expense-categories', payload: expenseCategoryForm, reset: () => setExpenseCategoryForm({ name: '' }) });
  };

  const exportCsv = (filename, columns, rows) => {
    const escapeValue = (value) => {
      const raw = String(value ?? '');
      return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const csv = [columns, ...rows].map((row) => row.map(escapeValue).join(',')).join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const openStudentProfile = (student) => {
    const studentId = String(student?._id || '');
    const studentRegistrations = registrations.filter((item) => String(item.studentId?._id || item.studentId || '') === studentId);
    const studentInvoices = invoices.filter((item) => String(item.studentId?._id || item.studentId || '') === studentId);
    setSelectedStudent({ ...student, registrations: studentRegistrations, invoices: studentInvoices });
  };

  return (
    <section className="stc-page" dir="rtl">
      <div className="stc-topbar">
        <div>
          <span className="stc-eyebrow">سیستم مستقل — جدا از مکتب و آموزشگاه</span>
          {/* Reads settings.name live on every render - change it once from
              «تنظیمات اصلی» below and this header, every form and every
              printed receipt pick it up immediately. */}
          <h1>{text(settings?.name, 'مرکز آموزش کوتاه‌مدت')}</h1>
          <p>شاگردان موقت، صنف، فیس، بل و رسید، حاضری و مصارف این مرکز کاملاً جدا از مکتب و آموزشگاه ذخیره می‌شود.</p>
        </div>
        <div className="stc-topbar-actions">
          <button type="button" onClick={loadData} disabled={loading || busy}>تازه‌سازی</button>
        </div>
      </div>

      <div className="stc-searchbar">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="جستجو با نام یا کد شاگرد، بل، صنف یا مصرف"
        />
      </div>

      <nav className="stc-tabs" aria-label="بخش‌های مرکز آموزش کوتاه‌مدت">
        {tabs.map((item) => (
          <button key={item.key} type="button" className={activeTab === item.key ? 'active' : ''} onClick={() => setActiveTab(item.key)}>
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="stc-panel">در حال بارگذاری...</div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <div className="stc-stack">
              <div className="stc-stats">
                <StatCard label="شاگردان فعال" value={fmt(summary.activeStudents)} />
                <StatCard label="صنف‌های فعال" value={fmt(summary.activeClasses)} />
                <StatCard label="عواید ماه" value={`${fmt(summary.monthIncome)} ${currency}`} tone="green" />
                <StatCard label="مصارف ماه" value={`${fmt(summary.monthExpenses)} ${currency}`} tone="red" />
                <StatCard label="باقی‌داری کل" value={`${fmt(summary.outstandingTotal)} ${currency}`} tone="amber" />
                <StatCard label="مدت‌های سررسیده" value={fmt(summary.overdueCount)} tone={summary.overdueCount ? 'red' : ''} />
              </div>
              <div className="stc-grid">
                <div className="stc-panel">
                  <h2>پرداخت‌های اخیر</h2>
                  <Table
                    columns={['شاگرد', 'مبلغ', 'باقی‌مانده']}
                    rows={(summary.recentPayments || []).map((item) => [text(item.studentId?.fullName), `${fmt(item.amount)} ${item.currency || currency}`, fmt(item.remainingBalance)])}
                  />
                </div>
                <div className="stc-panel">
                  <h2>بل‌های اخیر</h2>
                  <Table
                    columns={['شماره بل', 'شاگرد', 'پرداخت']}
                    rows={(summary.recentInvoices || []).map((item) => [item.invoiceNumber, text(item.studentId?.fullName), `${fmt(item.paidAmount)} ${item.currency || currency}`])}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'students' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={(event) => { event.preventDefault(); submit({ path: '/api/short-term-center/students', payload: studentForm, reset: () => setStudentForm(emptyStudent) }); }}>
                <h2>ثبت شاگرد موقت</h2>
                <Field label="نام"><input value={studentForm.firstName} onChange={(e) => setStudentForm({ ...studentForm, firstName: e.target.value })} /></Field>
                <Field label="تخلص"><input value={studentForm.lastName} onChange={(e) => setStudentForm({ ...studentForm, lastName: e.target.value })} /></Field>
                <Field label="نام کامل"><input value={studentForm.fullName} onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })} /></Field>
                <Field label="نام پدر"><input value={studentForm.fatherName} onChange={(e) => setStudentForm({ ...studentForm, fatherName: e.target.value })} /></Field>
                <Field label="نمبر تذکره"><input value={studentForm.tazkiraNumber} onChange={(e) => setStudentForm({ ...studentForm, tazkiraNumber: e.target.value })} /></Field>
                <Field label="جنسیت">
                  <select value={studentForm.gender} onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })}>
                    <option value="">انتخاب</option>
                    <option value="male">مرد</option>
                    <option value="female">زن</option>
                    <option value="other">سایر</option>
                  </select>
                </Field>
                <Field label="شماره تماس"><input value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} /></Field>
                <Field label="شماره سرپرست"><input value={studentForm.guardianPhone} onChange={(e) => setStudentForm({ ...studentForm, guardianPhone: e.target.value })} /></Field>
                <Field label="آدرس"><textarea value={studentForm.address} onChange={(e) => setStudentForm({ ...studentForm, address: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت شاگرد</button>
              </form>
              <div className="stc-panel">
                <h2>لیست شاگردان</h2>
                <Table
                  columns={['کد', 'نام', 'تماس', 'وضعیت', 'پروفایل']}
                  rows={filteredStudents.map((item) => [
                    item.studentCode,
                    text(item.fullName),
                    text(item.phone),
                    item.status,
                    <button type="button" className="stc-inline-button" onClick={() => openStudentProfile(item)}>مشاهده</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={(event) => { event.preventDefault(); submit({ path: '/api/short-term-center/classes', payload: classForm, reset: () => setClassForm(emptyClass) }); }}>
                <h2>تعریف صنف</h2>
                <Field label="نام صنف"><input required value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></Field>
                <Field label="مضمون/موضوع"><input value={classForm.subject} onChange={(e) => setClassForm({ ...classForm, subject: e.target.value })} /></Field>
                <Field label="استاد (اختیاری)"><input value={classForm.teacherName} onChange={(e) => setClassForm({ ...classForm, teacherName: e.target.value })} /></Field>
                <Field label="فیس پیش‌فرض"><input type="number" min="0" value={classForm.defaultFee} onChange={(e) => setClassForm({ ...classForm, defaultFee: e.target.value })} /></Field>
                <Field label="روزها"><input placeholder="شنبه، دوشنبه، چهارشنبه" value={classForm.days} onChange={(e) => setClassForm({ ...classForm, days: e.target.value })} /></Field>
                <Field label="ساعت شروع"><input type="time" value={classForm.startTime} onChange={(e) => setClassForm({ ...classForm, startTime: e.target.value })} /></Field>
                <Field label="ساعت ختم"><input type="time" value={classForm.endTime} onChange={(e) => setClassForm({ ...classForm, endTime: e.target.value })} /></Field>
                <Field label="ظرفیت"><input type="number" min="0" value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} /></Field>
                <Field label="اتاق"><input value={classForm.room} onChange={(e) => setClassForm({ ...classForm, room: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت صنف</button>
              </form>
              <div className="stc-panel">
                <h2>صنف‌های مرکز</h2>
                <Table
                  columns={['صنف', 'مضمون', 'استاد', 'زمان', 'ظرفیت', 'فیس پیش‌فرض']}
                  rows={classes.map((item) => [
                    item.name,
                    text(item.subject),
                    text(item.teacherName),
                    `${text(item.startTime)} - ${text(item.endTime)}`,
                    fmt(item.capacity),
                    `${fmt(item.defaultFee)} ${currency}`
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'registrations' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={(event) => { event.preventDefault(); submit({ path: '/api/short-term-center/registrations', payload: registrationForm, reset: () => setRegistrationForm(emptyRegistration) }); }}>
                <h2>ثبت‌نام شاگرد در صنف و تعیین فیس</h2>
                <Field label="جستجوی شاگرد">
                  <input value={registrationStudentSearch} onChange={(e) => setRegistrationStudentSearch(e.target.value)} placeholder="آی‌دی، نام، نام پدر یا نمبر تذکره" />
                </Field>
                <Field label="شاگرد">
                  <select required value={registrationForm.studentId} onChange={(e) => setRegistrationForm({ ...registrationForm, studentId: e.target.value })}>
                    <option value="">انتخاب شاگرد ({registrationStudentOptions.length} نتیجه)</option>
                    {registrationStudentOptions.map((item, index) => (
                      <option key={item._id} value={item._id}>{index + 1}. {item.fullName} - {item.studentCode}{item.fatherName ? ` - فرزند ${item.fatherName}` : ''}</option>
                    ))}
                  </select>
                </Field>
                <Field label="صنف">
                  <select required value={registrationForm.classId} onChange={(e) => setRegistrationForm({ ...registrationForm, classId: e.target.value, feeAmount: '' })}>
                    <option value="">انتخاب صنف</option>
                    {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="تاریخ ثبت"><input type="date" value={registrationForm.registrationDate} onChange={(e) => setRegistrationForm({ ...registrationForm, registrationDate: e.target.value })} /></Field>
                <Field label="تاریخ شروع"><input type="date" value={registrationForm.startDate} onChange={(e) => setRegistrationForm({ ...registrationForm, startDate: e.target.value })} /></Field>
                <Field label="مدت شاگرد (به ماه)"><input type="number" min="1" value={registrationForm.durationMonths} onChange={(e) => setRegistrationForm({ ...registrationForm, durationMonths: e.target.value })} /></Field>
                <Field label="فیس اصلی"><input type="number" min="0" value={registrationForm.feeAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, feeAmount: e.target.value })} /></Field>
                <Field label="تخفیف"><input type="number" min="0" value={registrationForm.discountAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, discountAmount: e.target.value })} /></Field>
                <Field label="نوع پرداخت">
                  <select value={registrationForm.paymentPlan} onChange={(e) => setRegistrationForm({ ...registrationForm, paymentPlan: e.target.value })}>
                    <option value="full">کامل</option>
                    <option value="installment">قسطی</option>
                    <option value="monthly">ماهانه</option>
                  </select>
                </Field>
                <button type="submit" disabled={busy}>ثبت‌نام</button>
              </form>
              <div className="stc-panel">
                <h2>لیست ثبت‌نام‌ها</h2>
                <Table
                  columns={['شاگرد', 'صنف', 'مدت', 'ختم مدت', 'فیس', 'پرداخت', 'باقی', 'وضعیت']}
                  rows={filteredRegistrations.map((item) => [
                    text(item.studentId?.fullName),
                    text(item.classId?.name),
                    `${fmt(item.durationMonths)} ماه`,
                    <span className={item.overdue ? 'stc-amount-negative' : ''}>{text(item.endDate)}{item.overdue ? ' (سررسیده)' : ''}</span>,
                    fmt(item.totalPayable),
                    fmt(item.paidAmount),
                    fmt(item.balance),
                    item.status === 'active'
                      ? <button type="button" className="stc-inline-button" onClick={() => completeRegistration(item)} disabled={busy}>تکمیل مدت</button>
                      : 'تکمیل‌شده'
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={(event) => {
                event.preventDefault();
                // Opened synchronously, in direct response to this submit click - not after the
                // payment API call resolves below. Opening it later is what popup blockers treat
                // as "not user-initiated" and either block outright or hand back a window that
                // prints blank (see submit()/printReceipt() above for the full story).
                const printWindow = window.open('', '_blank');
                if (!printWindow) toast.error('مرورگر بازشدن پنجرهٔ چاپ را مسدود کرد؛ لطفاً پنجره‌های بازشو (popup) را برای این سایت مجاز کنید.');
                submit({ path: '/api/short-term-center/payments', payload: paymentForm, reset: () => setPaymentForm(emptyPayment), successTab: 'payments', autoPrintReceipt: true, preOpenedPrintWindow: printWindow });
              }}>
                <h2>ثبت پرداخت فیس</h2>
                <p className="stc-form-hint">پس از ثبت، بل صادر و رسید A4 دو‌نسخه‌ای (نسخهٔ شاگرد و نسخهٔ مرکز) خودکار برای چاپ باز می‌شود.</p>
                <Field label="جستجوی شاگرد">
                  <input value={paymentRegistrationSearch} onChange={(e) => setPaymentRegistrationSearch(e.target.value)} placeholder="آی‌دی، نام، نام پدر یا نمبر تذکره" />
                </Field>
                <Field label="ثبت‌نام">
                  <select required value={paymentForm.registrationId} onChange={(e) => setPaymentForm({ ...paymentForm, registrationId: e.target.value })}>
                    <option value="">انتخاب ثبت‌نام ({paymentRegistrationOptions.length} نتیجه)</option>
                    {paymentRegistrationOptions.map((item, index) => (
                      <option key={item._id} value={item._id}>{index + 1}. {text(item.studentId?.fullName)}{item.studentId?.studentCode ? ` - ${item.studentId.studentCode}` : ''} - {text(item.classId?.name)} - باقی {fmt(item.balance)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="مبلغ پرداخت"><input required type="number" min="1" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></Field>
                <Field label="تاریخ پرداخت"><input type="date" value={paymentForm.paidAt} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} /></Field>
                <Field label="روش پرداخت">
                  <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="شماره مرجع"><input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} /></Field>
                <Field label="یادداشت"><textarea value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت پرداخت و صدور بل</button>
              </form>
              <div className="stc-panel">
                <h2>بل‌های صادرشده</h2>
                <Table
                  columns={['شماره', 'شاگرد', 'صنف', 'این پرداخت', 'باقی', 'رسید']}
                  rows={filteredInvoices.map((item) => [
                    item.invoiceNumber,
                    text(item.studentId?.fullName),
                    text(item.className),
                    `${fmt(item.paidAmount)} ${item.currency || currency}`,
                    fmt(item.remainingBalance),
                    <button type="button" className="stc-inline-button" onClick={() => printInvoiceById(item)}>چاپ رسید A4</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={saveAttendance}>
                <h2>ثبت حاضری صنف</h2>
                <Field label="صنف">
                  <select required value={attendanceForm.classId} onChange={(e) => setAttendanceForm({ ...attendanceForm, classId: e.target.value })}>
                    <option value="">انتخاب صنف</option>
                    {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="تاریخ"><input type="date" value={attendanceForm.attendanceDate} onChange={(e) => setAttendanceForm({ ...attendanceForm, attendanceDate: e.target.value })} /></Field>
                <div className="stc-attendance-list">
                  {attendanceForm.students.length ? attendanceForm.students.map((item, index) => (
                    <div className="stc-attendance-row" key={item.studentId}>
                      <strong>{item.name}</strong>
                      <select
                        value={item.status}
                        onChange={(event) => {
                          const next = [...attendanceForm.students];
                          next[index] = { ...item, status: event.target.value };
                          setAttendanceForm({ ...attendanceForm, students: next });
                        }}
                      >
                        <option value="present">حاضر</option>
                        <option value="absent">غیرحاضر</option>
                        <option value="late">تأخیر</option>
                        <option value="leave">رخصت</option>
                      </select>
                    </div>
                  )) : <p className="stc-empty">برای این صنف هنوز شاگرد فعال ثبت نشده است.</p>}
                </div>
                <button type="submit" disabled={busy || !attendanceForm.students.length}>ذخیره حاضری</button>
              </form>
              <div className="stc-panel">
                <h2>حاضری‌های اخیر</h2>
                <Table
                  columns={['تاریخ', 'صنف', 'حاضر', 'غیرحاضر', 'تأخیر', 'رخصت']}
                  rows={attendance.map((item) => {
                    const counts = (item.students || []).reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
                    return [item.attendanceDate, text(item.classId?.name), fmt(counts.present), fmt(counts.absent), fmt(counts.late), fmt(counts.leave)];
                  })}
                />
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="stc-grid">
              <form className="stc-panel stc-form" onSubmit={(event) => { event.preventDefault(); submit({ path: '/api/short-term-center/expenses', payload: expenseForm, reset: () => setExpenseForm(emptyExpense) }); }}>
                <h2>ثبت مصرف مرکز</h2>
                <Field label="عنوان"><input required value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} /></Field>
                <Field label="دسته‌بندی">
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    {expenseCategoryOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="مبلغ"><input required type="number" min="1" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></Field>
                <Field label="تاریخ"><input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></Field>
                <Field label="پرداخت به"><input value={expenseForm.paidTo} onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })} /></Field>
                <Field label="یادداشت"><textarea value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت مصرف</button>
              </form>
              <div className="stc-panel">
                <h2>مصارف ثبت‌شده</h2>
                <Table
                  columns={['عنوان', 'دسته', 'مبلغ', 'تاریخ']}
                  rows={filteredExpenses.map((item) => [item.title, expenseCategoryLabels[item.category] || item.category, `${fmt(item.amount)} ${item.currency || currency}`, item.expenseDate])}
                />
              </div>
              <form className="stc-panel stc-form" onSubmit={saveExpenseCategory}>
                <h2>تعریف دسته‌بندی مصرف</h2>
                <Field label="نام دسته">
                  <input required value={expenseCategoryForm.name} onChange={(e) => setExpenseCategoryForm({ ...expenseCategoryForm, name: e.target.value })} placeholder="مثلاً: ترانسپورت" />
                </Field>
                <button type="submit" disabled={busy}>افزودن دسته</button>
              </form>
              <div className="stc-panel">
                <h2>دسته‌بندی‌های تعریف‌شده</h2>
                <Table columns={['نام', 'وضعیت']} rows={expenseCategories.map((item) => [item.name, item.status === 'inactive' ? 'غیرفعال' : 'فعال'])} />
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="stc-stack">
              <div className="stc-stats">
                <StatCard label="کل فیس قابل دریافت" value={`${fmt(reports?.summary?.dueTotal || summary.dueTotal)} ${currency}`} />
                <StatCard label="کل دریافت‌شده" value={`${fmt(reports?.summary?.paidTotal || summary.paidTotal)} ${currency}`} tone="green" />
                <StatCard label="کل باقی‌داری" value={`${fmt(reports?.summary?.outstandingTotal || summary.outstandingTotal)} ${currency}`} tone="amber" />
                <StatCard label="مفاد ماه جاری" value={`${fmt((reports?.summary?.monthIncome || summary.monthIncome || 0) - (reports?.summary?.monthExpenses || summary.monthExpenses || 0))} ${currency}`} />
              </div>
              <div className="stc-grid">
                <div className="stc-panel">
                  <div className="stc-panel-head">
                    <h2>باقی‌داران</h2>
                    <button type="button" className="stc-inline-button" onClick={() => exportCsv('short-term-debtors.csv', ['Student', 'Class', 'Balance'], (reports?.debtors || []).map((item) => [item.studentId?.fullName, item.classId?.name, item.balance]))}>Excel/CSV</button>
                  </div>
                  <Table
                    columns={['شاگرد', 'صنف', 'باقی']}
                    rows={(reports?.debtors || []).map((item) => [text(item.studentId?.fullName), text(item.classId?.name), `${fmt(item.balance)} ${currency}`])}
                  />
                </div>
                <div className="stc-panel">
                  <h2>گزارش صنف‌ها</h2>
                  <Table
                    columns={['صنف', 'ثبت‌نام', 'دریافت', 'باقی']}
                    rows={(reports?.byClass || []).map((item) => [text(item.className), fmt(item.registrations), `${fmt(item.paid)} ${currency}`, `${fmt(item.balance)} ${currency}`])}
                  />
                </div>
              </div>
              <div className="stc-panel">
                <div className="stc-panel-head">
                  <h2>گزارش ماهوار عواید و مصارف</h2>
                  <button type="button" className="stc-inline-button" disabled={!visibleMonthlyReport.length} onClick={() => exportCsv('short-term-monthly-report.csv', ['Month', 'Income', 'Expenses', 'Net'], visibleMonthlyReport.map((item) => [item.month, item.income, item.expenses, item.net]))}>Excel/CSV</button>
                </div>
                <div className="stc-report-filters">
                  <Field label="سال">
                    <select value={monthlyReportYear} onChange={(e) => changeMonthlyReportYear(Number(e.target.value))}>
                      {monthlyReportYearOptions.map((year) => <option key={year} value={year}>{faYear(year)}</option>)}
                    </select>
                  </Field>
                  <Field label="ماه">
                    <select value={monthlyReportMonth} onChange={(e) => setMonthlyReportMonth(e.target.value)}>
                      <option value="">همه ماه‌ها</option>
                      {gregorianMonthNamesFa.map((name, index) => <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>)}
                    </select>
                  </Field>
                </div>
                {monthlyReportLoading ? (
                  <p className="stc-empty">در حال بارگذاری گزارش ماهانه...</p>
                ) : (
                  <Table
                    columns={['ماه', 'عواید', 'مصارف', 'مفاد/ضرر خالص', 'جزئیات']}
                    rows={visibleMonthlyReport.map((item) => [
                      item.monthLabel || item.month,
                      `${fmt(item.income)} ${currency}`,
                      `${fmt(item.expenses)} ${currency}`,
                      <span className={item.net >= 0 ? 'stc-amount-positive' : 'stc-amount-negative'}>{`${fmt(Math.abs(item.net))} ${currency}`}{item.net < 0 ? ' (ضرر)' : ''}</span>,
                      <button type="button" className="stc-inline-button" onClick={() => setMonthlyReportDetail(item)}>مشاهده</button>
                    ])}
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <form className="stc-panel stc-form stc-settings-form" onSubmit={saveSettings}>
              <h2>تنظیمات اصلی مرکز</h2>
              <p className="stc-form-hint">هر تغییری که اینجا ذخیره شود، بلافاصله در سربرگ صفحه، تمام فورم‌ها، گزارش‌ها و رسیدهای چاپی منعکس می‌شود.</p>
              <Field label="نام مرکز"><input value={settings.name || ''} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></Field>
              <Field label="آدرس"><input value={settings.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></Field>
              <Field label="شماره تماس"><input value={settings.phone || ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></Field>
              <Field label="ایمیل"><input value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} /></Field>
              <Field label="واحد پول"><input value={settings.currency || 'AFN'} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></Field>
              <h3 className="stc-settings-subhead">تعریف آی‌دی و تمبرها</h3>
              <Field label="پیشوند کد شاگرد"><input value={settings.studentCodePrefix || 'STC'} onChange={(e) => setSettings({ ...settings, studentCodePrefix: e.target.value })} /></Field>
              <Field label="پیشوند شماره بل"><input value={settings.invoicePrefix || 'STC-INV'} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} /></Field>
              <Field label="پیشوند شماره رسید"><input value={settings.receiptPrefix || 'STC-RCP'} onChange={(e) => setSettings({ ...settings, receiptPrefix: e.target.value })} /></Field>
              <Field label="متن تمبر/مهر رسمی روی رسید"><input value={settings.sealText || ''} onChange={(e) => setSettings({ ...settings, sealText: e.target.value })} placeholder="مثلاً: مهر مرکز آموزش کوتاه‌مدت" /></Field>
              <Field label="متن پایین رسید"><textarea value={settings.receiptFooter || ''} onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })} /></Field>
              <button type="submit" disabled={busy}>ذخیره تنظیمات</button>
            </form>
          )}
        </>
      )}

      <StudentProfileModal student={selectedStudent} currency={currency} onClose={() => setSelectedStudent(null)} onPrintInvoice={printInvoiceById} />
      <MonthlyReportDetailModal detail={monthlyReportDetail} currency={currency} onClose={() => setMonthlyReportDetail(null)} />
    </section>
  );
}

function StudentProfileModal({ student, currency, onClose, onPrintInvoice }) {
  if (!student) return null;
  const totalBalance = (student.registrations || []).reduce((sum, item) => sum + Number(item.balance || 0), 0);
  return (
    <div className="stc-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="stc-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="stc-modal-close" onClick={onClose}>بستن</button>
        <h2>{text(student.fullName)}</h2>
        <div className="stc-profile-grid">
          <span>کد: {text(student.studentCode)}</span>
          <span>نام پدر: {text(student.fatherName)}</span>
          <span>تماس: {text(student.phone)}</span>
          <span>وضعیت: {text(student.status)}</span>
          <span>کل باقی: {fmt(totalBalance)} {currency}</span>
        </div>
        <h3>ثبت‌نام‌ها</h3>
        <Table
          columns={['صنف', 'مدت', 'فیس', 'پرداخت', 'باقی']}
          rows={(student.registrations || []).map((item) => [text(item.classId?.name), `${fmt(item.durationMonths)} ماه`, fmt(item.totalPayable), fmt(item.paidAmount), fmt(item.balance)])}
        />
        <h3>بل‌های صادرشده</h3>
        <Table
          columns={['شماره', 'صنف', 'پرداخت', 'باقی', 'رسید']}
          rows={(student.invoices || []).map((item) => [
            item.invoiceNumber,
            text(item.className),
            fmt(item.paidAmount),
            fmt(item.remainingBalance),
            <button type="button" className="stc-inline-button" onClick={() => onPrintInvoice?.(item)}>چاپ رسید</button>
          ])}
        />
      </section>
    </div>
  );
}

function MonthlyReportDetailModal({ detail, currency, onClose }) {
  if (!detail) return null;
  return (
    <div className="stc-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="stc-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="stc-modal-close" onClick={onClose}>بستن</button>
        <h2>{detail.monthLabel || detail.month}</h2>
        <div className="stc-profile-grid">
          <span>مجموع عواید: {fmt(detail.income)} {currency}</span>
          <span>مجموع مصارف: {fmt(detail.expenses)} {currency}</span>
          <span>مفاد/ضرر خالص: {fmt(detail.net)} {currency}</span>
        </div>
        <h3>عواید به تفکیک روش پرداخت</h3>
        <Table columns={['روش پرداخت', 'مبلغ']} rows={(detail.byPaymentMethod || []).map((item) => [paymentMethodLabels[item.method] || item.method, `${fmt(item.total)} ${currency}`])} />
        <h3>مصارف به تفکیک دسته</h3>
        <Table columns={['دسته', 'مبلغ']} rows={(detail.byExpenseCategory || []).map((item) => [expenseCategoryLabels[item.category] || item.category, `${fmt(item.total)} ${currency}`])} />
      </section>
    </div>
  );
}
