import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './AcademyManagement.css';
import { API_BASE } from '../config/api';
import { getStudentAsasNumber, studentMatchesSearch } from '../utils/studentSearch';
import { useToast } from '../components/ui/toast';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { AFGHAN_SOLAR_MONTHS, formatAfghanStoredDateLabel, gregorianToAfghanSolar } from '../utils/afghanDate';

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

const emptyCourse = {
  name: '',
  level: '',
  duration: '',
  defaultFee: '',
  description: '',
  status: 'active'
};

const emptyTeacher = {
  fullName: '',
  phone: '',
  specialty: '',
  paymentType: 'salary',
  paymentAmount: '',
  commissionPercent: '',
  status: 'active'
};

const emptyClass = {
  name: '',
  courseId: '',
  teacherId: '',
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
  courseId: '',
  classId: '',
  registrationDate: new Date().toISOString().slice(0, 10),
  startDate: '',
  endDate: '',
  feeAmount: '',
  discountAmount: '',
  discountType: '',
  discountReason: '',
  monthlyFee: '',
  paymentPlan: 'full',
  status: 'active',
  note: '',
  installments: []
};

const DISCOUNT_TYPE_LABELS = {
  '': 'بدونِ دسته',
  sibling: 'خواهر/برادر',
  scholarship: 'بورسیه',
  staff: 'کارمند',
  hardship: 'تنگدستی',
  other: 'سایر'
};

const CHARGE_KIND_LABELS = {
  enrollment: 'شمولیت',
  installment: 'قسط',
  monthly: 'ماهانه',
  manual: 'دستی',
  late_fee: 'جریمهٔ دیرکرد'
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
  vendor: '',
  attachmentUrl: '',
  recurring: false,
  note: ''
};

const emptyAttendance = {
  classId: '',
  attendanceDate: new Date().toISOString().slice(0, 10),
  students: []
};

const tabs = [
  { key: 'dashboard', label: 'داشبورد' },
  { key: 'students', label: 'شاگردان' },
  { key: 'courses', label: 'کورس و استاد' },
  { key: 'classes', label: 'پلان صنف' },
  { key: 'registrations', label: 'ثبت‌نام' },
  { key: 'payments', label: 'پرداخت و بل' },
  { key: 'expenses', label: 'مصارف' },
  { key: 'attendance', label: 'حاضری' },
  { key: 'reports', label: 'گزارش‌ها' },
  { key: 'payroll', label: 'معاش' },
  { key: 'settings', label: 'تنظیمات' }
];

const paymentMethodLabels = {
  cash: 'نقدی',
  card: 'کارت',
  bank_transfer: 'بانک',
  hawala: 'حواله',
  other: 'سایر'
};
const METHOD_ROWS = [['cash', 'نقدی'], ['card', 'کارت'], ['bank_transfer', 'بانک'], ['hawala', 'حواله'], ['other', 'سایر']];

const expenseCategoryLabels = {
  teacher_salary: 'معاش استادان',
  rent: 'کرایه',
  utilities: 'برق و خدمات',
  internet: 'انترنت',
  stationery: 'قرطاسیه',
  marketing: 'تبلیغات',
  equipment: 'تجهیزات',
  other: 'سایر'
};

// Records are still stored as Gregorian Date/'YYYY-MM-DD' under the hood,
// but every input/display in this page (AfghanDateInput, monthly report
// filter and labels) works in the Afghan solar (Shamsi) calendar - the
// backend buckets the monthly report by Shamsi year-month too.
// toLocaleString('fa-AF') group-separates by thousands, which turns a plain
// 4-digit year like 2026 into "۲٬۰۲۶" - useGrouping:false keeps it as a
// single "۲۰۲۶" run of Persian digits instead.
const faYear = (year) => Number(year || 0).toLocaleString('fa-AF', { useGrouping: false });
const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey || '').split('-');
  const label = AFGHAN_SOLAR_MONTHS[Number(month) - 1] || month;
  return `${label} ${faYear(year)}`;
};

const fmt = (value) => (Number(value || 0)).toLocaleString('fa-AF');
const text = (value, fallback = '-') => String(value || '').trim() || fallback;
const normalizeSearch = (value = '') => String(value || '').trim().toLowerCase();
const includesSearch = (values = [], term = '') => {
  const normalized = normalizeSearch(term);
  if (!normalized) return true;
  return values.some((value) => normalizeSearch(value).includes(normalized));
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
    <label className="academy-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value, tone = '' }) {
  return (
    <div className={`academy-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function AcademyManagement() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({
    name: 'آموزشگاه',
    address: '',
    phone: '',
    email: '',
    currency: 'AFN',
    invoicePrefix: 'ACD',
    studentCodePrefix: 'AST',
    invoiceFooter: 'تشکر از پرداخت شما',
    receiptSize: 'half',
    monthlyChargeDueDay: 20,
    lateFeeMode: 'none',
    lateFeeAmount: 0,
    lateFeeGraceDays: 7,
    isActive: true
  });
  const [summary, setSummary] = useState({});
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [charges, setCharges] = useState([]);
  const [statement, setStatement] = useState(null);
  const [printStatement, setPrintStatement] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [expenseCategoryForm, setExpenseCategoryForm] = useState({ name: '' });
  const [attendance, setAttendance] = useState([]);
  const [reports, setReports] = useState(null);
  const [cashDaily, setCashDaily] = useState(null);
  const [cashDate, setCashDate] = useState(new Date().toISOString().slice(0, 10));
  const [aging, setAging] = useState(null);
  const [payroll, setPayroll] = useState(null);
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const s = gregorianToAfghanSolar(new Date());
    return s ? `${s.jy}-${String(s.jm).padStart(2, '0')}` : '';
  });
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [monthlyReportLoading, setMonthlyReportLoading] = useState(false);
  const [monthlyReportDetail, setMonthlyReportDetail] = useState(null);
  const [monthlyReportYear, setMonthlyReportYear] = useState(() => gregorianToAfghanSolar(new Date())?.jy || 1400);
  const [monthlyReportMonth, setMonthlyReportMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [classForm, setClassForm] = useState(emptyClass);
  const [registrationForm, setRegistrationForm] = useState(emptyRegistration);
  const [registrationStudentSearch, setRegistrationStudentSearch] = useState('');
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [paymentRegistrationSearch, setPaymentRegistrationSearch] = useState('');
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendance);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [printClass, setPrintClass] = useState(null);
  const [invoiceMethodFilter, setInvoiceMethodFilter] = useState('all');
  const [invoiceOnlyDue, setInvoiceOnlyDue] = useState(false);
  const [invoiceFrom, setInvoiceFrom] = useState('');
  const [invoiceTo, setInvoiceTo] = useState('');
  const [invoiceSort, setInvoiceSort] = useState('newest');

  const currency = settings?.currency || 'AFN';

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/academy/bootstrap');
      setSettings(data.settings || settings);
      setSummary(data.summary || {});
      setStudents(data.students || []);
      setCourses(data.courses || []);
      setTeachers(data.teachers || []);
      setClasses(data.classes || []);
      setRegistrations(data.registrations || []);
      setPayments(data.payments || []);
      setInvoices(data.invoices || []);
      setCharges(data.charges || []);
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
  }, []);

  const loadReports = async () => {
    try {
      const [ov, ag] = await Promise.all([
        requestJson('/api/academy/reports/overview'),
        requestJson('/api/academy/reports/aging').catch(() => null)
      ]);
      setReports(ov);
      setAging(ag);
    } catch (error) {
      toast.error(error.message);
    }
  };

  const loadCashDaily = async (date = cashDate) => {
    try {
      setCashDaily(await requestJson(`/api/academy/reports/cash-daily?date=${date}`));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const loadPayroll = async (periodKey = payrollPeriod) => {
    try {
      setPayroll(await requestJson(`/api/academy/payroll?periodKey=${periodKey}`));
    } catch (error) {
      toast.error(error.message);
    }
  };

  const payTeacher = async (row) => {
    if (!window.confirm(`پرداختِ معاشِ ${row.teacher?.fullName} برای دورهٔ ${row.periodKey} به مبلغِ ${fmt(row.netAmount)} ${currency}؟ (یک مصرف صادر می‌شود)`)) return;
    setBusy(true);
    try {
      const data = await requestJson('/api/academy/payroll/pay', {
        method: 'POST',
        body: JSON.stringify({
          teacherId: row.teacher?._id || row.teacherId,
          periodKey: row.periodKey,
          baseAmount: row.baseAmount, commissionAmount: row.commissionAmount,
          commissionBase: row.commissionBase, commissionPercent: row.commissionPercent,
          commissionOn: row.commissionOn, deductions: row.deductions || 0
        })
      });
      toast.success(data.message || 'انجام شد.');
      await Promise.all([loadPayroll(), loadData()]);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const copyPhones = (list) => {
    const phones = [...new Set((list || []).map((x) => x.studentId?.phone || x.studentId?.guardianPhone).filter(Boolean))];
    if (!phones.length) { toast.error('شماره‌ای نیست.'); return; }
    navigator.clipboard?.writeText(phones.join('\n')).then(
      () => toast.success(`${phones.length} شماره کپی شد.`),
      () => toast.error('کپی ناموفق بود.')
    );
  };

  const loadMonthlyReport = async (year = monthlyReportYear) => {
    setMonthlyReportLoading(true);
    try {
      const data = await requestJson(`/api/academy/reports/monthly?year=${year}`);
      const months = (data.months || []).map((item) => ({
        ...item,
        monthLabel: formatMonthLabel(item.month)
      }));
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
    () => Array.from({ length: 6 }, (_, index) => (gregorianToAfghanSolar(new Date())?.jy || 1400) - index),
    []
  );

  const visibleMonthlyReport = useMemo(() => {
    if (!monthlyReport) return [];
    if (!monthlyReportMonth) return monthlyReport;
    return monthlyReport.filter((item) => item.month === `${monthlyReportYear}-${monthlyReportMonth}`);
  }, [monthlyReport, monthlyReportMonth, monthlyReportYear]);

  useEffect(() => {
    if (activeTab === 'reports' && !reports) {
      loadReports();
    }
    if (activeTab === 'reports' && !monthlyReport) {
      loadMonthlyReport();
    }
    if (activeTab === 'reports' && !cashDaily) {
      loadCashDaily();
    }
    if (activeTab === 'payroll' && !payroll) {
      loadPayroll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reports, monthlyReport, cashDaily, payroll]);

  const activeRegistrations = useMemo(
    () => registrations.filter((item) => item.status === 'active'),
    [registrations]
  );

  const filteredStudents = useMemo(
    () => students.filter((item) => studentMatchesSearch(item, searchTerm)),
    [students, searchTerm]
  );

  // آی‌دی/نام/نام پدر/تذکره - all live inside studentMatchesSearch's generic
  // field scan already (it walks every primitive value on the student
  // object), so searching by any one of those just works without extra code
  // here.
  const registrationStudentOptions = useMemo(() => {
    const matches = students.filter((item) => studentMatchesSearch(item, registrationStudentSearch));
    // Keep the already-selected student in the list even if a later search
    // no longer matches them, so picking one and then refining the search
    // text doesn't silently blank out the select.
    const selected = students.find((item) => String(item._id) === String(registrationForm.studentId));
    if (selected && !matches.some((item) => item._id === selected._id)) return [selected, ...matches];
    return matches;
  }, [students, registrationStudentSearch, registrationForm.studentId]);

  const paymentRegistrationOptions = useMemo(() => {
    const matches = activeRegistrations.filter((item) => studentMatchesSearch(item.studentId || item, paymentRegistrationSearch, [
      item.courseId?.name
    ]));
    const selected = activeRegistrations.find((item) => String(item._id) === String(paymentForm.registrationId));
    if (selected && !matches.some((item) => item._id === selected._id)) return [selected, ...matches];
    return matches;
  }, [activeRegistrations, paymentRegistrationSearch, paymentForm.registrationId]);

  const filteredRegistrations = useMemo(
    () => registrations.filter((item) => studentMatchesSearch(item.studentId || item, searchTerm, [
      item.courseId?.name,
      item.classId?.name
    ])),
    [registrations, searchTerm]
  );

  const filteredInvoices = useMemo(() => {
    const issuedKey = (item) => String(item.issuedAt || item.createdAt || '').slice(0, 10);
    const rows = invoices.filter((item) => (
      studentMatchesSearch(item.studentId || item, searchTerm, [item.invoiceNumber, item.courseName, item.className])
      && (invoiceMethodFilter === 'all' || item.paymentMethod === invoiceMethodFilter)
      && (!invoiceOnlyDue || Number(item.remainingBalance || 0) > 0)
      && (!invoiceFrom || issuedKey(item) >= invoiceFrom)
      && (!invoiceTo || issuedKey(item) <= invoiceTo)
    ));
    const cmp = {
      newest: (a, b) => issuedKey(b).localeCompare(issuedKey(a)),
      oldest: (a, b) => issuedKey(a).localeCompare(issuedKey(b)),
      paid_desc: (a, b) => Number(b.paidAmount || 0) - Number(a.paidAmount || 0),
      balance_desc: (a, b) => Number(b.remainingBalance || 0) - Number(a.remainingBalance || 0)
    }[invoiceSort] || (() => 0);
    return [...rows].sort(cmp);
  }, [invoices, searchTerm, invoiceMethodFilter, invoiceOnlyDue, invoiceFrom, invoiceTo, invoiceSort]);

  const filteredExpenses = useMemo(
    () => expenses.filter((item) => includesSearch([item.title, item.category, item.paidTo, item.expenseDate], searchTerm)),
    [expenses, searchTerm]
  );

  const selectedCourse = useMemo(
    () => courses.find((item) => String(item._id) === String(registrationForm.courseId)),
    [courses, registrationForm.courseId]
  );

  // Built-in categories (hardcoded, always offered) plus whatever the
  // academy has defined for itself and left active - custom names are used
  // verbatim as both the option value and its label, since AcademyExpense
  // stores the category as a plain string rather than a coded key.
  const expenseCategoryOptions = useMemo(() => {
    const builtIn = Object.entries(expenseCategoryLabels).map(([value, label]) => ({ value, label }));
    const custom = expenseCategories
      .filter((item) => item.status !== 'inactive')
      .map((item) => ({ value: item.name, label: item.name }));
    return [...builtIn, ...custom];
  }, [expenseCategories]);

  const selectedAttendanceClassRegistrations = useMemo(
    () => registrations.filter((item) => (
      item.status === 'active'
      && String(item.classId?._id || item.classId || '') === String(attendanceForm.classId || '')
    )),
    [registrations, attendanceForm.classId]
  );

  useEffect(() => {
    if (!selectedCourse || registrationForm.feeAmount) return;
    setRegistrationForm((prev) => ({ ...prev, feeAmount: selectedCourse.defaultFee || '' }));
  }, [selectedCourse, registrationForm.feeAmount]);

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
  }, [attendanceForm.classId, selectedAttendanceClassRegistrations]);

  const submit = async ({ path, payload, reset, successTab, autoPrintReceipt }) => {
    setBusy(true);
    try {
      const data = await requestJson(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      // Shown via the shared floating toast (fixed to the viewport) instead
      // of an inline banner at the top of the page, so the confirmation is
      // visible right where the user is - even deep in a scrolled-down form -
      // instead of forcing a scroll back up to check whether it went through.
      toast.success(data.message || 'ذخیره شد.');
      if (data.invoice) {
        // A student paying is exactly the moment they need a receipt in hand -
        // print it right away instead of only stashing it for someone to find
        // later in the "بل‌های صادرشده" table.
        if (autoPrintReceipt) printCurrentInvoice(data.invoice);
        else setPrintInvoice(data.invoice);
      }
      if (reset) reset();
      if (successTab) setActiveTab(successTab);
      await loadData();
      // Payments/expenses are the only writes that change the monthly
      // income/expense numbers - invalidate the cached report so switching
      // to "گزارش‌ها" afterwards refetches instead of showing stale totals.
      if (monthlyReport && (path === '/api/academy/payments' || path === '/api/academy/expenses')) {
        setMonthlyReport(null);
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await requestJson('/api/academy/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings(data.settings || settings);
      toast.success(data.message || 'تنظیمات ذخیره شد.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const printCurrentInvoice = (invoice) => {
    setPrintClass(null);
    setPrintInvoice(invoice);
    window.setTimeout(() => window.print(), 80);
    if (invoice?._id) {
      requestJson(`/api/academy/invoices/${invoice._id}/mark-printed`, { method: 'POST', body: '{}' })
        .then((data) => {
          setInvoices((prev) => prev.map((it) => (
            String(it._id) === String(invoice._id)
              ? { ...it, printCount: data.printCount, lastPrintedAt: data.lastPrintedAt }
              : it
          )));
        })
        .catch(() => {});
    }
  };

  const printClassList = (item) => {
    setPrintInvoice(null);
    setPrintClass(item);
    window.setTimeout(() => window.print(), 80);
  };

  const chargesByReg = useMemo(() => {
    const map = new Map();
    for (const c of charges) {
      const key = String(c.registrationId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return map;
  }, [charges]);

  const voidPayment = async (payment) => {
    const reason = window.prompt(`ابطالِ پرداخت ${payment.paymentNumber} به مبلغ ${fmt(payment.amount)} ${currency}؟\nدلیل را بنویسید:`);
    if (reason == null || !reason.trim()) return;
    setBusy(true);
    try {
      const data = await requestJson(`/api/academy/payments/${payment._id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });
      toast.success(data.message || 'پرداخت ابطال شد.');
      await loadData();
      if (monthlyReport) setMonthlyReport(null);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const generateMonthly = async () => {
    setBusy(true);
    try {
      const data = await requestJson('/api/academy/generate-monthly', { method: 'POST', body: '{}' });
      toast.success(data.message || 'انجام شد.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const generateLateFees = async () => {
    setBusy(true);
    try {
      const data = await requestJson('/api/academy/generate-late-fees', { method: 'POST', body: '{}' });
      toast.success(data.message || 'انجام شد.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openStatement = async (studentId, { print = false } = {}) => {
    try {
      const data = await requestJson(`/api/academy/students/${studentId}/statement`);
      setStatement(data);
      if (print) {
        setPrintInvoice(null);
        setPrintClass(null);
        setPrintStatement(data);
        window.setTimeout(() => window.print(), 120);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const saveAttendance = async (event) => {
    event.preventDefault();
    await submit({
      path: '/api/academy/attendance',
      payload: attendanceForm,
      reset: () => setAttendanceForm(emptyAttendance),
      successTab: 'attendance'
    });
  };

  const saveExpenseCategory = async (event) => {
    event.preventDefault();
    await submit({
      path: '/api/academy/expense-categories',
      payload: expenseCategoryForm,
      reset: () => setExpenseCategoryForm({ name: '' })
    });
  };

  const toggleExpenseCategoryStatus = async (item) => {
    setBusy(true);
    try {
      const nextStatus = item.status === 'inactive' ? 'active' : 'inactive';
      const data = await requestJson(`/api/academy/expense-categories/${item._id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      });
      toast.success(data.message || 'دسته‌بندی مصرف به‌روزرسانی شد.');
      await loadData();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = (filename, columns, rows) => {
    const escapeValue = (value) => {
      const raw = String(value ?? '');
      return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const csv = [columns, ...rows].map((row) => row.map(escapeValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
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
    const studentPayments = payments.filter((item) => String(item.studentId?._id || item.studentId || '') === studentId);
    const studentInvoices = invoices.filter((item) => String(item.studentId?._id || item.studentId || '') === studentId);
    setSelectedStudent({ ...student, registrations: studentRegistrations, payments: studentPayments, invoices: studentInvoices });
  };

  return (
    <section className="academy-page" dir="rtl">
      <div className="academy-topbar">
        <div>
          <span className="academy-eyebrow">سیستم مستقل</span>
          <h1>{text(settings?.name, 'مدیریت آموزشگاه')}</h1>
          <p>شاگردان، ثبت‌نام‌ها، فیس، پرداخت‌ها، بل‌ها و مصارف این بخش از مالی مکتب جدا ذخیره می‌شوند.</p>
        </div>
        <div className="academy-topbar-actions">
          <Link to="/academy-supplies">کتاب و یونیفرم</Link>
          <Link to="/admin-finance">بازگشت به مالی مکتب</Link>
          <button type="button" onClick={loadData} disabled={loading || busy}>تازه‌سازی</button>
        </div>
      </div>

      <div className="academy-searchbar">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="جستجو با نام یا نمبر اساس شاگرد، بل، کورس، صنف یا مصرف"
        />
      </div>

      <nav className="academy-tabs" aria-label="بخش‌های آموزشگاه">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={activeTab === item.key ? 'active' : ''}
            onClick={() => setActiveTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="academy-panel">در حال بارگذاری...</div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <div className="academy-stack">
              <div className="academy-stats">
                <StatCard label="شاگردان فعال" value={fmt(summary.activeStudents)} />
                <StatCard label="صنف‌های فعال" value={fmt(summary.activeClasses)} />
                <StatCard label="عواید ماه" value={`${fmt(summary.monthIncome)} ${currency}`} tone="green" />
                <StatCard label="مصارف ماه" value={`${fmt(summary.monthExpenses)} ${currency}`} tone="red" />
                <StatCard label="باقی‌داری کل" value={`${fmt(summary.outstandingTotal)} ${currency}`} tone="amber" />
                <StatCard label="بل‌های صادرشده" value={fmt(summary.invoices)} />
              </div>
              <div className="academy-grid">
                <div className="academy-panel">
                  <h2>پرداخت‌های اخیر</h2>
                  <Table
                    columns={['شاگرد', 'مبلغ', 'باقی‌مانده']}
                    rows={(summary.recentPayments || []).map((item) => [
                      text(item.studentId?.fullName),
                      `${fmt(item.amount)} ${item.currency || currency}`,
                      fmt(item.remainingBalance)
                    ])}
                  />
                </div>
                <div className="academy-panel">
                  <h2>بل‌های اخیر</h2>
                  <Table
                    columns={['شماره بل', 'شاگرد', 'پرداخت']}
                    rows={(summary.recentInvoices || []).map((item) => [
                      item.invoiceNumber,
                      text(item.studentId?.fullName),
                      `${fmt(item.paidAmount)} ${item.currency || currency}`
                    ])}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'students' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/students', payload: studentForm, reset: () => setStudentForm(emptyStudent) });
              }}>
                <h2>ثبت شاگرد آموزشگاه</h2>
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
              <div className="academy-panel">
                <h2>لیست شاگردان آموزشگاه</h2>
                <Table
                  columns={['کد', 'نام', 'تماس', 'وضعیت', 'پروفایل']}
                  rows={filteredStudents.map((item) => [
                    item.studentCode,
                    text(item.fullName),
                    text(item.phone),
                    item.status,
                    <button type="button" className="academy-inline-button" onClick={() => openStudentProfile(item)}>مشاهده</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/courses', payload: courseForm, reset: () => setCourseForm(emptyCourse) });
              }}>
                <h2>تعریف کورس</h2>
                <Field label="نام کورس"><input required value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} /></Field>
                <Field label="سطح"><input value={courseForm.level} onChange={(e) => setCourseForm({ ...courseForm, level: e.target.value })} /></Field>
                <Field label="مدت"><input value={courseForm.duration} onChange={(e) => setCourseForm({ ...courseForm, duration: e.target.value })} /></Field>
                <Field label="فیس پیش‌فرض"><input type="number" min="0" value={courseForm.defaultFee} onChange={(e) => setCourseForm({ ...courseForm, defaultFee: e.target.value })} /></Field>
                <Field label="توضیحات"><textarea value={courseForm.description} onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت کورس</button>
              </form>
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/teachers', payload: teacherForm, reset: () => setTeacherForm(emptyTeacher) });
              }}>
                <h2>ثبت استاد</h2>
                <Field label="نام استاد"><input required value={teacherForm.fullName} onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })} /></Field>
                <Field label="شماره تماس"><input value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })} /></Field>
                <Field label="تخصص"><input value={teacherForm.specialty} onChange={(e) => setTeacherForm({ ...teacherForm, specialty: e.target.value })} /></Field>
                <Field label="نوع پرداخت">
                  <select value={teacherForm.paymentType} onChange={(e) => setTeacherForm({ ...teacherForm, paymentType: e.target.value })}>
                    <option value="salary">معاش ثابت</option>
                    <option value="percent">فیصدی</option>
                    <option value="contract">قراردادی</option>
                  </select>
                </Field>
                <Field label="مبلغ/فیصدی"><input type="number" min="0" value={teacherForm.paymentAmount} onChange={(e) => setTeacherForm({ ...teacherForm, paymentAmount: e.target.value })} /></Field>
                <Field label="درصدِ کمیسیون (override — خالی = پیش‌فرض)"><input type="number" min="0" max="100" value={teacherForm.commissionPercent} onChange={(e) => setTeacherForm({ ...teacherForm, commissionPercent: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت استاد</button>
              </form>
              <div className="academy-panel">
                <h2>کورس‌ها</h2>
                <Table columns={['نام', 'سطح', 'فیس']} rows={courses.map((item) => [item.name, text(item.level), `${fmt(item.defaultFee)} ${currency}`])} />
              </div>
              <div className="academy-panel">
                <h2>استادان</h2>
                <Table columns={['نام', 'تخصص', 'پرداخت']} rows={teachers.map((item) => [item.fullName, text(item.specialty), `${item.paymentType} / ${fmt(item.paymentAmount)}`])} />
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/classes', payload: classForm, reset: () => setClassForm(emptyClass) });
              }}>
                <h2>پلان صنف</h2>
                <Field label="نام صنف/گروپ"><input required value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} /></Field>
                <Field label="کورس">
                  <select required value={classForm.courseId} onChange={(e) => setClassForm({ ...classForm, courseId: e.target.value })}>
                    <option value="">انتخاب کورس</option>
                    {courses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="استاد">
                  <select value={classForm.teacherId} onChange={(e) => setClassForm({ ...classForm, teacherId: e.target.value })}>
                    <option value="">بدون استاد</option>
                    {teachers.map((item) => <option key={item._id} value={item._id}>{item.fullName}</option>)}
                  </select>
                </Field>
                <Field label="روزها"><input placeholder="شنبه، دوشنبه، چهارشنبه" value={classForm.days} onChange={(e) => setClassForm({ ...classForm, days: e.target.value })} /></Field>
                <Field label="ساعت شروع"><input type="time" value={classForm.startTime} onChange={(e) => setClassForm({ ...classForm, startTime: e.target.value })} /></Field>
                <Field label="ساعت ختم"><input type="time" value={classForm.endTime} onChange={(e) => setClassForm({ ...classForm, endTime: e.target.value })} /></Field>
                <Field label="ظرفیت"><input type="number" min="0" value={classForm.capacity} onChange={(e) => setClassForm({ ...classForm, capacity: e.target.value })} /></Field>
                <Field label="اتاق"><input value={classForm.room} onChange={(e) => setClassForm({ ...classForm, room: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت پلان صنف</button>
              </form>
              <div className="academy-panel">
                <h2>صنف‌های آموزشگاه</h2>
                <Table
                  columns={['صنف', 'کورس', 'استاد', 'زمان', 'ظرفیت', 'چاپ']}
                  rows={classes.map((item) => [
                    item.name,
                    text(item.courseId?.name),
                    text(item.teacherId?.fullName),
                    `${text(item.startTime)} - ${text(item.endTime)}`,
                    fmt(item.capacity),
                    <button type="button" className="academy-inline-button" onClick={() => printClassList(item)}>لیست صنف</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'registrations' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/registrations', payload: registrationForm, reset: () => setRegistrationForm(emptyRegistration) });
              }}>
                <h2>ثبت‌نام شاگرد در کورس</h2>
                <Field label="جستجوی شاگرد">
                  <input
                    value={registrationStudentSearch}
                    onChange={(e) => setRegistrationStudentSearch(e.target.value)}
                    placeholder="آی‌دی، نام، نام پدر یا نمبر تذکره"
                  />
                </Field>
                <Field label="شاگرد">
                  <select required value={registrationForm.studentId} onChange={(e) => setRegistrationForm({ ...registrationForm, studentId: e.target.value })}>
                    <option value="">انتخاب شاگرد ({registrationStudentOptions.length} نتیجه)</option>
                    {registrationStudentOptions.map((item, index) => (
                      <option key={item._id} value={item._id}>
                        {index + 1}. {item.fullName} - {getStudentAsasNumber(item)}{item.fatherName ? ` - فرزند ${item.fatherName}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="کورس">
                  <select required value={registrationForm.courseId} onChange={(e) => setRegistrationForm({ ...registrationForm, courseId: e.target.value, feeAmount: '' })}>
                    <option value="">انتخاب کورس</option>
                    {courses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="صنف">
                  <select required value={registrationForm.classId} onChange={(e) => setRegistrationForm({ ...registrationForm, classId: e.target.value })}>
                    <option value="">انتخاب صنف</option>
                    {classes
                      .filter((item) => !registrationForm.courseId || String(item.courseId?._id || item.courseId) === String(registrationForm.courseId))
                      .map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="تاریخ ثبت"><AfghanDateInput value={registrationForm.registrationDate} onChange={(value) => setRegistrationForm({ ...registrationForm, registrationDate: value })} /></Field>
                <Field label="تاریخ شروع"><AfghanDateInput value={registrationForm.startDate} onChange={(value) => setRegistrationForm({ ...registrationForm, startDate: value })} /></Field>
                <Field label="فیس اصلی"><input type="number" min="0" value={registrationForm.feeAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, feeAmount: e.target.value })} /></Field>
                <Field label="تخفیف"><input type="number" min="0" value={registrationForm.discountAmount} onChange={(e) => setRegistrationForm({ ...registrationForm, discountAmount: e.target.value })} /></Field>
                {Number(registrationForm.discountAmount) > 0 && (
                  <>
                    <Field label="دستهٔ تخفیف">
                      <select value={registrationForm.discountType} onChange={(e) => setRegistrationForm({ ...registrationForm, discountType: e.target.value })}>
                        {Object.entries(DISCOUNT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    <Field label="دلیلِ تخفیف"><input value={registrationForm.discountReason} onChange={(e) => setRegistrationForm({ ...registrationForm, discountReason: e.target.value })} placeholder="مثلاً: دو خواهر در یک کورس" /></Field>
                    <p className="academy-form-hint">تأییدکنندهٔ تخفیف، همین کاربرِ واردشده ثبت می‌شود.</p>
                  </>
                )}
                <Field label="نوع پرداخت">
                  <select value={registrationForm.paymentPlan} onChange={(e) => setRegistrationForm({ ...registrationForm, paymentPlan: e.target.value })}>
                    <option value="full">کامل</option>
                    <option value="installment">قسطی</option>
                    <option value="monthly">ماهانه</option>
                  </select>
                </Field>
                {registrationForm.paymentPlan === 'monthly' && (
                  <>
                    <Field label="فیس ثابتِ هر ماه"><input type="number" min="0" value={registrationForm.monthlyFee} onChange={(e) => setRegistrationForm({ ...registrationForm, monthlyFee: e.target.value })} /></Field>
                    <Field label="تاریخ پایان (اختیاری)"><AfghanDateInput value={registrationForm.endDate} onChange={(value) => setRegistrationForm({ ...registrationForm, endDate: value })} /></Field>
                    <p className="academy-form-hint">هر ماهِ شمسی یک شارژِ تازه به همین مبلغ ساخته می‌شود (سررسید روزِ {settings.monthlyChargeDueDay || 20}). با «تاریخ پایان» یا تغییرِ وضعیت به «تمام‌شده» متوقف می‌شود.</p>
                  </>
                )}
                {registrationForm.paymentPlan === 'installment' && (
                  <div className="academy-installments">
                    <span className="academy-field-label">جدولِ اقساط</span>
                    {(registrationForm.installments || []).map((row, i) => (
                      <div className="academy-installment-row" key={i}>
                        <input type="number" min="0" placeholder="مبلغ" value={row.amount}
                          onChange={(e) => setRegistrationForm((prev) => ({ ...prev, installments: prev.installments.map((r, ri) => ri === i ? { ...r, amount: e.target.value } : r) }))} />
                        <AfghanDateInput value={row.dueDate || ''}
                          onChange={(value) => setRegistrationForm((prev) => ({ ...prev, installments: prev.installments.map((r, ri) => ri === i ? { ...r, dueDate: value } : r) }))} />
                        <button type="button" className="academy-inline-button" onClick={() => setRegistrationForm((prev) => ({ ...prev, installments: prev.installments.filter((_, ri) => ri !== i) }))}>حذف</button>
                      </div>
                    ))}
                    <button type="button" className="academy-inline-button" onClick={() => setRegistrationForm((prev) => ({ ...prev, installments: [...(prev.installments || []), { amount: '', dueDate: '' }] }))}>+ افزودن قسط</button>
                  </div>
                )}
                <button type="submit" disabled={busy}>ثبت‌نام</button>
              </form>
              <div className="academy-panel">
                <div className="academy-panel-head">
                  <h2>لیست ثبت‌نام‌ها</h2>
                  <button type="button" className="academy-inline-button" onClick={generateMonthly} disabled={busy}>ساختِ شارژِ ماهانه</button>
                </div>
                <Table
                  columns={['شاگرد', 'کورس', 'نوع', 'فیس', 'پرداخت', 'باقی', 'اقلام']}
                  rows={filteredRegistrations.map((item) => {
                    const list = chargesByReg.get(String(item._id)) || [];
                    const overdue = list.filter((c) => c.isOverdue);
                    const nextDue = list.filter((c) => c.balance > 0 && c.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
                    return [
                      text(item.studentId?.fullName),
                      text(item.courseId?.name),
                      item.paymentPlan === 'monthly' ? `ماهانه${item.monthlyFee ? ` (${fmt(item.monthlyFee)})` : ' — مبلغ تعیین نشده'}` : item.paymentPlan === 'installment' ? 'قسطی' : 'کامل',
                      fmt(item.totalPayable),
                      fmt(item.paidAmount),
                      fmt(item.balance),
                      <span className={overdue.length ? 'academy-chip academy-chip-bad' : nextDue ? 'academy-chip' : 'academy-chip academy-chip-ok'}>
                        {list.length ? (overdue.length ? `معوق ${overdue.length}` : nextDue ? `سررسیدِ بعدی ${formatAfghanStoredDateLabel(nextDue.dueDate)}` : 'تسویه') : '—'}
                      </span>
                    ];
                  })}
                />
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({
                  path: '/api/academy/payments',
                  payload: paymentForm,
                  reset: () => setPaymentForm(emptyPayment),
                  successTab: 'payments',
                  autoPrintReceipt: true
                });
              }}>
                <h2>ثبت پرداخت فیس</h2>
                <p className="academy-form-hint">پس از ثبت، رسید پرداخت همین شاگرد خودکار برای چاپ باز می‌شود.</p>
                <Field label="جستجوی شاگرد">
                  <input
                    value={paymentRegistrationSearch}
                    onChange={(e) => setPaymentRegistrationSearch(e.target.value)}
                    placeholder="آی‌دی، نام، نام پدر یا نمبر تذکره"
                  />
                </Field>
                <Field label="ثبت‌نام">
                  <select required value={paymentForm.registrationId} onChange={(e) => setPaymentForm({ ...paymentForm, registrationId: e.target.value })}>
                    <option value="">انتخاب ثبت‌نام ({paymentRegistrationOptions.length} نتیجه)</option>
                    {paymentRegistrationOptions.map((item) => (
                      <option key={item._id} value={item._id}>
                        {text(item.studentId?.fullName)} - {text(item.courseId?.name)} - باقی {fmt(item.balance)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="مبلغ پرداخت"><input required type="number" min="1" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></Field>
                <Field label="تاریخ پرداخت"><AfghanDateInput value={paymentForm.paidAt} onChange={(value) => setPaymentForm({ ...paymentForm, paidAt: value })} /></Field>
                <Field label="روش پرداخت">
                  <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="شماره مرجع"><input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} /></Field>
                <Field label="یادداشت"><textarea value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت پرداخت و صدور بل</button>
              </form>
              <div className="academy-panel">
                <h2>رسیدهای پرداخت / بل‌های صادرشده</h2>
                <div className="academy-filter-row">
                  <select value={invoiceMethodFilter} onChange={(e) => setInvoiceMethodFilter(e.target.value)}>
                    <option value="all">همهٔ روش‌ها</option>
                    {Object.entries(paymentMethodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <select value={invoiceSort} onChange={(e) => setInvoiceSort(e.target.value)}>
                    <option value="newest">جدیدترین</option>
                    <option value="oldest">قدیمی‌ترین</option>
                    <option value="paid_desc">مبلغِ پرداخت (زیاد→کم)</option>
                    <option value="balance_desc">باقی (زیاد→کم)</option>
                  </select>
                  <label className="academy-checkbox">
                    <span>از</span>
                    <AfghanDateInput value={invoiceFrom} onChange={setInvoiceFrom} />
                  </label>
                  <label className="academy-checkbox">
                    <span>تا</span>
                    <AfghanDateInput value={invoiceTo} onChange={setInvoiceTo} />
                  </label>
                  <label className="academy-checkbox">
                    <input type="checkbox" checked={invoiceOnlyDue} onChange={(e) => setInvoiceOnlyDue(e.target.checked)} />
                    <span>فقط باقی‌دار</span>
                  </label>
                  {(invoiceFrom || invoiceTo || invoiceOnlyDue || invoiceMethodFilter !== 'all') && (
                    <button type="button" className="academy-inline-button" onClick={() => { setInvoiceFrom(''); setInvoiceTo(''); setInvoiceOnlyDue(false); setInvoiceMethodFilter('all'); }}>پاک‌کردنِ فیلترها</button>
                  )}
                  <span className="academy-field-label">{filteredInvoices.length} از {invoices.length}</span>
                </div>
                <Table
                  columns={['شماره', 'شاگرد', 'کورس', 'این پرداخت', 'باقی', 'رسید']}
                  rows={filteredInvoices.map((item) => [
                    <span className={item.status === 'void' ? 'academy-void' : (item.kind === 'credit_note' ? 'academy-credit' : '')}>
                      {item.invoiceNumber}{item.kind === 'credit_note' ? ' (ابطالی)' : ''}
                      {Number(item.printCount || 0) > 0 && <span className="academy-chip academy-chip-muted" title={item.lastPrintedAt ? formatAfghanStoredDateLabel(String(item.lastPrintedAt).slice(0, 10)) : ''}>قبلاً چاپ شده ×{item.printCount}</span>}
                    </span>,
                    text(item.studentId?.fullName),
                    text(item.courseName),
                    `${fmt(item.paidAmount)} ${item.currency || currency}`,
                    fmt(item.remainingBalance),
                    item.status === 'void' ? <span className="academy-void">ابطال‌شده</span>
                      : <button type="button" className="academy-inline-button" onClick={() => printCurrentInvoice(item)}>{Number(item.printCount || 0) > 0 ? 'چاپ دوباره' : 'چاپ رسید'}</button>
                  ])}
                />
              </div>
              <div className="academy-panel">
                <h2>پرداخت‌های ثبت‌شده</h2>
                <Table
                  columns={['شماره', 'شاگرد', 'مبلغ', 'روش', 'تاریخ', '']}
                  rows={payments.map((item) => [
                    <span className={item.status === 'void' ? 'academy-void' : ''}>{item.paymentNumber}</span>,
                    text(item.studentId?.fullName),
                    `${fmt(item.amount)} ${item.currency || currency}`,
                    paymentMethodLabels[item.paymentMethod] || item.paymentMethod,
                    item.paidAt ? formatAfghanStoredDateLabel(item.paidAt) : '—',
                    item.status === 'void'
                      ? <span className="academy-void" title={item.voidReason}>ابطال‌شده</span>
                      : <button type="button" className="academy-inline-button academy-danger" onClick={() => voidPayment(item)} disabled={busy}>ابطال</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/expenses', payload: expenseForm, reset: () => setExpenseForm(emptyExpense) });
              }}>
                <h2>ثبت مصرف آموزشگاه</h2>
                <Field label="عنوان"><input required value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} /></Field>
                <Field label="دسته‌بندی">
                  <select value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    {expenseCategoryOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="مبلغ"><input required type="number" min="1" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></Field>
                <Field label="تاریخ"><AfghanDateInput value={expenseForm.expenseDate} onChange={(value) => setExpenseForm({ ...expenseForm, expenseDate: value })} /></Field>
                <Field label="پرداخت به"><input value={expenseForm.paidTo} onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })} /></Field>
                <Field label="فروشنده / طرفِ قرارداد"><input value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} /></Field>
                <Field label="لینکِ سند / رسید"><input value={expenseForm.attachmentUrl} onChange={(e) => setExpenseForm({ ...expenseForm, attachmentUrl: e.target.value })} placeholder="https://…" /></Field>
                <Field label="مصرفِ تکرارشونده">
                  <label className="academy-checkbox">
                    <input type="checkbox" checked={!!expenseForm.recurring} onChange={(e) => setExpenseForm({ ...expenseForm, recurring: e.target.checked })} />
                    <span>هر ماه تکرار می‌شود (کرایه، معاش و…)</span>
                  </label>
                </Field>
                <Field label="یادداشت"><textarea value={expenseForm.note} onChange={(e) => setExpenseForm({ ...expenseForm, note: e.target.value })} /></Field>
                <button type="submit" disabled={busy}>ثبت مصرف</button>
              </form>
              <div className="academy-panel">
                <h2>مصارف ثبت‌شده</h2>
                <Table
                  columns={['عنوان', 'دسته', 'مبلغ', 'تاریخ']}
                  rows={filteredExpenses.map((item) => [
                    item.title,
                    expenseCategoryLabels[item.category] || item.category,
                    `${fmt(item.amount)} ${item.currency || currency}`,
                    formatAfghanStoredDateLabel(item.expenseDate)
                  ])}
                />
              </div>
              <form className="academy-panel academy-form" onSubmit={saveExpenseCategory}>
                <h2>تعریف دسته‌بندی مصرف</h2>
                <p className="academy-form-hint">دسته‌های ثابت (معاش استادان، کرایه، ...) همیشه در لیست هستند؛ اینجا فقط دسته‌های اضافه‌ای که خودتان نیاز دارید تعریف کنید.</p>
                <Field label="نام دسته">
                  <input
                    required
                    value={expenseCategoryForm.name}
                    onChange={(e) => setExpenseCategoryForm({ ...expenseCategoryForm, name: e.target.value })}
                    placeholder="مثلاً: ترانسپورت"
                  />
                </Field>
                <button type="submit" disabled={busy}>افزودن دسته</button>
              </form>
              <div className="academy-panel">
                <h2>دسته‌بندی‌های تعریف‌شده</h2>
                <Table
                  columns={['نام', 'وضعیت', 'عملیات']}
                  rows={expenseCategories.map((item) => [
                    item.name,
                    item.status === 'inactive' ? 'غیرفعال' : 'فعال',
                    <button type="button" className="academy-inline-button" onClick={() => toggleExpenseCategoryStatus(item)} disabled={busy}>
                      {item.status === 'inactive' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
                    </button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={saveAttendance}>
                <h2>ثبت حاضری صنف</h2>
                <Field label="صنف">
                  <select required value={attendanceForm.classId} onChange={(e) => setAttendanceForm({ ...attendanceForm, classId: e.target.value })}>
                    <option value="">انتخاب صنف</option>
                    {classes.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
                  </select>
                </Field>
                <Field label="تاریخ">
                  <AfghanDateInput value={attendanceForm.attendanceDate} onChange={(value) => setAttendanceForm({ ...attendanceForm, attendanceDate: value })} />
                </Field>
                <div className="academy-attendance-list">
                  {attendanceForm.students.length ? attendanceForm.students.map((item, index) => (
                    <div className="academy-attendance-row" key={item.studentId}>
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
                  )) : <p className="academy-empty">برای این صنف هنوز شاگرد فعال ثبت نشده است.</p>}
                </div>
                <button type="submit" disabled={busy || !attendanceForm.students.length}>ذخیره حاضری</button>
              </form>
              <div className="academy-panel">
                <h2>حاضری‌های اخیر</h2>
                <Table
                  columns={['تاریخ', 'صنف', 'حاضر', 'غیرحاضر', 'تأخیر', 'رخصت']}
                  rows={attendance.map((item) => {
                    const counts = (item.students || []).reduce((acc, row) => {
                      acc[row.status] = (acc[row.status] || 0) + 1;
                      return acc;
                    }, {});
                    return [
                      formatAfghanStoredDateLabel(item.attendanceDate),
                      text(item.classId?.name),
                      fmt(counts.present),
                      fmt(counts.absent),
                      fmt(counts.late),
                      fmt(counts.leave)
                    ];
                  })}
                />
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="academy-stack">
              <div className="academy-stats">
                <StatCard label="کل فیس قابل دریافت" value={`${fmt(reports?.summary?.dueTotal || summary.dueTotal)} ${currency}`} />
                <StatCard label="کل دریافت‌شده" value={`${fmt(reports?.summary?.paidTotal || summary.paidTotal)} ${currency}`} tone="green" />
                <StatCard label="کل باقی‌داری" value={`${fmt(reports?.summary?.outstandingTotal || summary.outstandingTotal)} ${currency}`} tone="amber" />
                <StatCard label="مفاد ماه جاری" value={`${fmt((reports?.summary?.monthIncome || summary.monthIncome || 0) - (reports?.summary?.monthExpenses || summary.monthExpenses || 0))} ${currency}`} />
              </div>
              <div className="academy-panel">
                <div className="academy-panel-head">
                  <h2>
                    یادآوری فیس ماه جاری
                    {reports?.feeReminderMonth ? ` (${formatMonthLabel(reports.feeReminderMonth)})` : ''}
                  </h2>
                  <button
                    type="button"
                    className="academy-inline-button"
                    onClick={() => exportCsv(
                      'academy-fee-reminders.csv',
                      ['Student', 'Code', 'Phone', 'Course', 'Class', 'Balance', 'LastPayment'],
                      (reports?.feeReminders || []).map((item) => [
                        item.studentId?.fullName,
                        item.studentId?.studentCode,
                        item.studentId?.phone || item.studentId?.guardianPhone,
                        item.courseId?.name,
                        item.classId?.name,
                        item.balance,
                        item.lastPaymentAt ? new Date(item.lastPaymentAt).toISOString().slice(0, 10) : ''
                      ])
                    )}
                    disabled={!(reports?.feeReminders || []).length}
                  >
                    Excel/CSV
                  </button>
                  <button type="button" className="academy-inline-button" onClick={() => copyPhones(reports?.feeReminders)} disabled={!(reports?.feeReminders || []).length}>
                    کپیِ شماره‌ها
                  </button>
                </div>
                <p className="academy-form-hint">
                  شاگردان دارای باقی‌داری که در ماه جاری هجری شمسی هنوز هیچ پرداختی ثبت نکرده‌اند.
                  {' '}
                  {`مجموع: ${fmt(reports?.feeReminderCount || 0)} شاگرد`}
                </p>
                <Table
                  columns={['شاگرد', 'کد', 'تماس', 'کورس', 'صنف', 'باقی', 'آخرین پرداخت']}
                  rows={(reports?.feeReminders || []).map((item) => [
                    text(item.studentId?.fullName),
                    text(item.studentId?.studentCode),
                    text(item.studentId?.phone || item.studentId?.guardianPhone),
                    text(item.courseId?.name),
                    text(item.classId?.name),
                    `${fmt(item.balance)} ${currency}`,
                    item.lastPaymentAt ? formatAfghanStoredDateLabel(item.lastPaymentAt) : 'بدون پرداخت'
                  ])}
                />
              </div>
              <div className="academy-grid">
                <div className="academy-panel">
                  <div className="academy-panel-head">
                    <h2>باقی‌داران</h2>
                    <button
                      type="button"
                      className="academy-inline-button"
                      onClick={() => exportCsv(
                        'academy-debtors.csv',
                        ['Student', 'Course', 'Class', 'Balance'],
                        (reports?.debtors || []).map((item) => [item.studentId?.fullName, item.courseId?.name, item.classId?.name, item.balance])
                      )}
                    >
                      Excel/CSV
                    </button>
                  </div>
                  <Table
                    columns={['شاگرد', 'کورس', 'صنف', 'باقی']}
                    rows={(reports?.debtors || []).map((item) => [
                      text(item.studentId?.fullName),
                      text(item.courseId?.name),
                      text(item.classId?.name),
                      `${fmt(item.balance)} ${currency}`
                    ])}
                  />
                </div>
                <div className="academy-panel">
                  <h2>گزارش کورس‌ها</h2>
                  <Table
                    columns={['کورس', 'ثبت‌نام', 'دریافت', 'باقی']}
                    rows={(reports?.byCourse || []).map((item) => [
                      text(item.courseName),
                      fmt(item.registrations),
                      `${fmt(item.paid)} ${currency}`,
                      `${fmt(item.balance)} ${currency}`
                    ])}
                  />
                </div>
              </div>

              <div className="academy-grid">
                <div className="academy-panel">
                  <div className="academy-panel-head">
                    <h2>بستنِ صندوق</h2>
                    <AfghanDateInput value={cashDate} onChange={(v) => { setCashDate(v); loadCashDaily(v); }} />
                  </div>
                  <Table
                    columns={['روش', 'دریافتی', 'پرداختی']}
                    rows={METHOD_ROWS.map(([k, label]) => {
                      const inc = (cashDaily?.income?.rows || []).find((r) => r.method === k) || {};
                      const exp = (cashDaily?.expense?.rows || []).find((r) => r.method === k) || {};
                      return [label, `${fmt(inc.total)} ${currency}`, `${fmt(exp.total)} ${currency}`];
                    })}
                  />
                  <p className="academy-form-hint">
                    مجموع دریافتی {fmt(cashDaily?.income?.total)} · پرداختی {fmt(cashDaily?.expense?.total)} · <b>خالص {fmt(cashDaily?.net)} {currency}</b>
                  </p>
                </div>
                <div className="academy-panel">
                  <h2>رده‌بندی سنیِ باقی‌داری</h2>
                  <Table
                    columns={['بازه', 'مبلغ', 'تعداد قلم']}
                    rows={['notdue', 'd0_30', 'd31_60', 'd61_90', 'd90'].map((k) => {
                      const b = aging?.buckets?.[k] || {};
                      return [b.label || k, `${fmt(b.total)} ${currency}`, fmt(b.count)];
                    })}
                  />
                  <p className="academy-form-hint">کل باقی‌داری: <b>{fmt(aging?.totalOutstanding)} {currency}</b></p>
                </div>
              </div>

              <div className="academy-panel">
                <div className="academy-panel-head">
                  <h2>باقی‌دارانِ معوق</h2>
                  <button type="button" className="academy-inline-button" onClick={() => copyPhones(aging?.students)} disabled={!(aging?.students || []).length}>کپیِ شماره‌ها</button>
                </div>
                <Table
                  columns={['شاگرد', 'کد', 'تماس', 'معوق', 'کل باقی', 'قدیمی‌ترین سررسید']}
                  rows={(aging?.students || []).filter((s) => s.overdue > 0).map((s) => [
                    text(s.student?.fullName),
                    text(s.student?.studentCode),
                    text(s.student?.phone),
                    `${fmt(s.overdue)} ${currency}`,
                    `${fmt(s.balance)} ${currency}`,
                    s.oldestDue ? formatAfghanStoredDateLabel(s.oldestDue) : '—'
                  ])}
                />
              </div>

              <div className="academy-panel">
                <div className="academy-panel-head">
                  <h2>گزارش ماهانه عاید و مصرف</h2>
                  <button
                    type="button"
                    className="academy-inline-button"
                    onClick={() => exportCsv(
                      'academy-monthly-report.csv',
                      ['Month', 'Income', 'Expenses', 'Net'],
                      visibleMonthlyReport.map((item) => [item.month, item.income, item.expenses, item.net])
                    )}
                    disabled={!visibleMonthlyReport.length}
                  >
                    Excel/CSV
                  </button>
                </div>
                <div className="academy-report-filters">
                  <Field label="سال">
                    <select value={monthlyReportYear} onChange={(e) => changeMonthlyReportYear(Number(e.target.value))}>
                      {monthlyReportYearOptions.map((year) => (
                        <option key={year} value={year}>{faYear(year)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="ماه">
                    <select value={monthlyReportMonth} onChange={(e) => setMonthlyReportMonth(e.target.value)}>
                      <option value="">همه ماه‌ها</option>
                      {AFGHAN_SOLAR_MONTHS.map((name, index) => (
                        <option key={name} value={String(index + 1).padStart(2, '0')}>{name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {monthlyReportLoading ? (
                  <p className="academy-empty">در حال بارگذاری گزارش ماهانه...</p>
                ) : (
                  <Table
                    columns={['ماه', 'عاید', 'مصرف', 'مفاد/ضرر خالص', 'جزئیات']}
                    rows={visibleMonthlyReport.map((item) => [
                      item.monthLabel || item.month,
                      `${fmt(item.income)} ${currency}`,
                      `${fmt(item.expenses)} ${currency}`,
                      <span className={item.net >= 0 ? 'academy-amount-positive' : 'academy-amount-negative'}>
                        {`${fmt(Math.abs(item.net))} ${currency}`}{item.net < 0 ? ' (ضرر)' : ''}
                      </span>,
                      <button type="button" className="academy-inline-button" onClick={() => setMonthlyReportDetail(item)}>مشاهده</button>
                    ])}
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === 'payroll' && (
            <div className="academy-stack">
              <div className="academy-panel">
                <div className="academy-panel-head">
                  <h2>معاش و کمیسیونِ استادان</h2>
                  <span className="academy-field">
                    <span>دوره (ماهِ شمسی)</span>
                    <input value={payrollPeriod} placeholder="1405-07"
                      onChange={(e) => setPayrollPeriod(e.target.value)}
                      onBlur={() => loadPayroll()} />
                  </span>
                </div>
                <p className="academy-form-hint">
                  کمیسیون = درصدِ {payroll?.settings?.teacherCommissionBase === 'billed' ? 'فیسِ ثبت‌نام‌شده' : 'دریافتیِ وصول‌شده'}ی کورس‌های استاد در این ماه. درصدِ پیش‌فرض {fmt(payroll?.settings?.teacherCommissionPercent)}٪ (قابلِ override per استاد در تب کورس و استاد).
                </p>
                <Table
                  columns={['استاد', 'پایه', 'مبنای کمیسیون', 'درصد', 'کمیسیون', 'خالص', 'وضعیت', '']}
                  rows={(payroll?.items || []).map((row) => [
                    text(row.teacher?.fullName),
                    `${fmt(row.baseAmount)} ${currency}`,
                    `${fmt(row.commissionOn)} ${currency}`,
                    `${fmt(row.commissionPercent)}٪`,
                    `${fmt(row.commissionAmount)} ${currency}`,
                    `${fmt(row.netAmount)} ${currency}`,
                    row.status === 'paid' ? <span className="academy-chip academy-chip-ok">پرداخت‌شده</span> : <span className="academy-chip">پیش‌نویس</span>,
                    row.status === 'paid'
                      ? '—'
                      : <button type="button" className="academy-inline-button" onClick={() => payTeacher(row)} disabled={busy || row.netAmount <= 0}>پرداخت</button>
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <form className="academy-panel academy-form academy-settings-form" onSubmit={saveSettings}>
              <h2>تنظیمات آموزشگاه</h2>
              <Field label="نام آموزشگاه"><input value={settings.name || ''} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></Field>
              <Field label="آدرس"><input value={settings.address || ''} onChange={(e) => setSettings({ ...settings, address: e.target.value })} /></Field>
              <Field label="شماره تماس"><input value={settings.phone || ''} onChange={(e) => setSettings({ ...settings, phone: e.target.value })} /></Field>
              <Field label="ایمیل"><input value={settings.email || ''} onChange={(e) => setSettings({ ...settings, email: e.target.value })} /></Field>
              <Field label="واحد پول"><input value={settings.currency || 'AFN'} onChange={(e) => setSettings({ ...settings, currency: e.target.value })} /></Field>
              <Field label="پیشوند بل"><input value={settings.invoicePrefix || 'ACD'} onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} /></Field>
              <Field label="پیشوند کد شاگرد">
                <input value={settings.studentCodePrefix || 'AST'} onChange={(e) => setSettings({ ...settings, studentCodePrefix: e.target.value })} />
              </Field>
              <Field label="متن پایین بل"><textarea value={settings.invoiceFooter || ''} onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })} /></Field>
              <Field label="سررسیدِ شارژِ ماهانه (روزِ ماهِ شمسی)">
                <input type="number" min="1" max="31" value={settings.monthlyChargeDueDay ?? 20}
                  onChange={(e) => setSettings({ ...settings, monthlyChargeDueDay: e.target.value })} />
              </Field>
              <Field label="مبنای کمیسیونِ استاد">
                <select value={settings.teacherCommissionBase || 'collected'} onChange={(e) => setSettings({ ...settings, teacherCommissionBase: e.target.value })}>
                  <option value="collected">دریافتیِ وصول‌شده</option>
                  <option value="billed">فیسِ ثبت‌نام‌شده</option>
                </select>
              </Field>
              <Field label="درصدِ کمیسیونِ پیش‌فرض">
                <input type="number" min="0" max="100" value={settings.teacherCommissionPercent ?? 0}
                  onChange={(e) => setSettings({ ...settings, teacherCommissionPercent: e.target.value })} />
              </Field>
              <Field label="حالتِ جریمهٔ دیرکرد">
                <select value={settings.lateFeeMode || 'none'} onChange={(e) => setSettings({ ...settings, lateFeeMode: e.target.value })}>
                  <option value="none">غیرفعال</option>
                  <option value="fixed">مبلغِ ثابت</option>
                  <option value="percent">درصدِ قلمِ معوق</option>
                </select>
              </Field>
              <Field label={settings.lateFeeMode === 'percent' ? 'درصدِ جریمهٔ دیرکرد' : 'مبلغِ جریمهٔ دیرکرد'}>
                <input type="number" min="0" value={settings.lateFeeAmount ?? 0}
                  onChange={(e) => setSettings({ ...settings, lateFeeAmount: e.target.value })} />
              </Field>
              <Field label="مهلتِ ارفاق پس از سررسید (روز)">
                <input type="number" min="0" value={settings.lateFeeGraceDays ?? 7}
                  onChange={(e) => setSettings({ ...settings, lateFeeGraceDays: e.target.value })} />
              </Field>
              {settings.lateFeeMode && settings.lateFeeMode !== 'none' && (
                <p className="academy-form-hint">
                  برای هر قلمِ معوق که بیش از {settings.lateFeeGraceDays ?? 7} روز از سررسیدش گذشته، یک‌بار قلمِ «جریمهٔ دیرکرد» ساخته می‌شود.
                  {' '}
                  <button type="button" className="academy-inline-button" onClick={generateLateFees} disabled={busy}>ساختِ جریمهٔ دیرکرد اکنون</button>
                </p>
              )}
              <button type="submit" disabled={busy}>ذخیره تنظیمات</button>
            </form>
          )}
        </>
      )}

      <InvoicePrint invoice={printInvoice} settings={settings} />
      <ClassListPrint classItem={printClass} registrations={registrations} settings={settings} />
      <StatementPrint data={printStatement} settings={settings} />
      <StudentProfileModal
        student={selectedStudent}
        currency={currency}
        onClose={() => setSelectedStudent(null)}
        onPrintInvoice={printCurrentInvoice}
        onPrintStatement={(id) => openStatement(id, { print: true })}
      />
      <MonthlyReportDetailModal
        detail={monthlyReportDetail}
        currency={currency}
        onClose={() => setMonthlyReportDetail(null)}
      />
    </section>
  );
}

const TABLE_PAGE_SIZE = 10;

// Every list in this page - shagirds, courses, invoices, expenses, the
// monthly report, and so on - renders through this one Table, so paging it
// here caps every long list at 10 rows with قبلی/بعدی buttons instead of
// dumping the whole thing on one page.
function Table({ columns = [], rows = [] }) {
  const [page, setPage] = useState(1);

  // A shrinking/growing row count (new search term, a row added or removed)
  // means the page the user was on may no longer exist - snap back to the
  // first page rather than showing an empty page or a stale slice.
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  if (!rows.length) {
    return <p className="academy-empty">هنوز موردی ثبت نشده است.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = rows.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);

  return (
    <div className="academy-table-wrap">
      <table className="academy-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {pageRows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="academy-table-pagination">
          <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>قبلی</button>
          <span>صفحه {safePage.toLocaleString('fa-AF')} از {pageCount.toLocaleString('fa-AF')}</span>
          <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount}>بعدی</button>
        </div>
      )}
    </div>
  );
}

function InvoicePrint({ invoice, settings }) {
  if (!invoice) return null;
  const issuedAtLabel = invoice.issuedAt
    ? new Date(invoice.issuedAt).toLocaleDateString('fa-AF-u-ca-persian')
    : '';

  // Same "two copies + cut line on one A4 sheet" pattern as the finance
  // center's receipt print (student copy + office copy, so both sides keep
  // a paper record from the same sheet) - just with this module's simpler
  // fields, since the academy has no letterhead/logo settings of its own.
  const renderCopy = (label) => (
    <section className="academy-receipt-copy">
      <div className="academy-receipt-copy-label">{label}</div>
      <header>
        <div>
          <h2>{text(settings?.name, 'آموزشگاه')}</h2>
          <p>{text(settings?.address, '')}</p>
          <p>{text(settings?.phone, '')}</p>
        </div>
        <div className="academy-print-doc-meta">
          <strong>رسید پرداخت - {invoice.invoiceNumber}</strong>
          {issuedAtLabel ? <span>تاریخ: {issuedAtLabel}</span> : null}
        </div>
      </header>
      <dl>
        <div><dt>شاگرد</dt><dd>{text(invoice.studentId?.fullName)}</dd></div>
        <div><dt>کورس</dt><dd>{text(invoice.courseName)}</dd></div>
        <div><dt>صنف</dt><dd>{text(invoice.className)}</dd></div>
        <div><dt>فیس اصلی</dt><dd>{fmt(invoice.feeAmount)} {invoice.currency}</dd></div>
        <div><dt>تخفیف</dt><dd>{fmt(invoice.discountAmount)} {invoice.currency}</dd></div>
        <div><dt>مبلغ این پرداخت</dt><dd>{fmt(invoice.paidAmount)} {invoice.currency}</dd></div>
        <div><dt>روش پرداخت</dt><dd>{paymentMethodLabels[invoice.paymentMethod] || text(invoice.paymentMethod)}</dd></div>
        {invoice.referenceNo ? <div><dt>شماره مرجع</dt><dd>{invoice.referenceNo}</dd></div> : null}
        <div><dt>باقی‌مانده قبلی</dt><dd>{fmt(invoice.previousBalance)} {invoice.currency}</dd></div>
        <div><dt>باقی‌مانده فعلی</dt><dd>{fmt(invoice.remainingBalance)} {invoice.currency}</dd></div>
      </dl>
      <footer>
        <span>{text(settings?.invoiceFooter, 'تشکر از پرداخت شما')}</span>
        <span>امضا: __________________</span>
      </footer>
    </section>
  );

  return (
    <div className="academy-print">
      <div className="academy-receipt-print-sheet">
        {renderCopy('نسخه شاگرد')}
        <div className="academy-receipt-cut-line" aria-hidden="true"><span>محل برش</span></div>
        {renderCopy('نسخه آموزشگاه')}
      </div>
    </div>
  );
}

function ClassListPrint({ classItem, registrations = [], settings }) {
  if (!classItem) return null;
  const classId = String(classItem._id || '');
  const rows = registrations.filter((item) => String(item.classId?._id || item.classId || '') === classId);
  return (
    <div className="academy-print academy-class-print">
      <div className="academy-print-paper">
        <header>
          <div>
            <h2>{text(settings?.name, 'آموزشگاه')}</h2>
            <p>لیست شاگردان صنف</p>
          </div>
          <strong>{text(classItem.name)}</strong>
        </header>
        <table>
          <thead>
            <tr>
              <th>شماره</th>
              <th>کد شاگرد</th>
              <th>نام شاگرد</th>
              <th>کورس</th>
              <th>باقی‌داری</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={item._id}>
                <td>{index + 1}</td>
                <td>{text(item.studentId?.studentCode)}</td>
                <td>{text(item.studentId?.fullName)}</td>
                <td>{text(item.courseId?.name)}</td>
                <td>{fmt(item.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AcademyStatementRows({ charges = [], payments = [], currency }) {
  const events = [
    ...charges.filter((c) => c.status !== 'void').map((c) => ({ at: c.dueDate || c.createdAt, kind: 'charge', label: `${CHARGE_KIND_LABELS[c.kind] || c.kind}${c.title ? ` — ${c.title}` : ''}`, debit: Math.max(0, Number(c.amount || 0) - Number(c.discountAmount || 0)), credit: 0, overdue: c.isOverdue })),
    ...payments.filter((p) => p.status !== 'void').map((p) => ({ at: p.paidAt, kind: 'payment', label: `پرداخت ${p.paymentNumber}`, debit: 0, credit: Number(p.amount || 0) }))
  ].sort((a, b) => new Date(a.at || 0) - new Date(b.at || 0));
  let running = 0;
  return events.map((e, i) => {
    running += e.debit - e.credit;
    return (
      <tr key={i} className={e.overdue ? 'academy-row-bad' : ''}>
        <td>{e.at ? formatAfghanStoredDateLabel(e.at) : '—'}</td>
        <td>{e.label}</td>
        <td>{e.debit ? `${fmt(e.debit)} ${currency}` : ''}</td>
        <td>{e.credit ? `${fmt(e.credit)} ${currency}` : ''}</td>
        <td>{fmt(running)} {currency}</td>
      </tr>
    );
  });
}

function StatementPrint({ data, settings }) {
  if (!data) return null;
  const { student, charges = [], payments = [], totals = {} } = data;
  const currency = settings?.currency || 'AFN';
  return (
    <div className="academy-print academy-class-print">
      <div className="academy-print-paper">
        <header>
          <div>
            <h2>{text(settings?.name, 'آموزشگاه')}</h2>
            <p>کشف‌حسابِ شاگرد</p>
          </div>
          <strong>{text(student?.fullName)}{student?.studentCode ? ` — ${student.studentCode}` : ''}</strong>
        </header>
        <dl>
          <div><dt>کل فیس</dt><dd>{fmt(totals.billed)} {currency}</dd></div>
          <div><dt>کل پرداخت</dt><dd>{fmt(totals.paid)} {currency}</dd></div>
          <div><dt>باقی</dt><dd>{fmt(totals.balance)} {currency}</dd></div>
          <div><dt>معوق</dt><dd>{fmt(totals.overdue)} {currency}</dd></div>
        </dl>
        <table>
          <thead><tr><th>تاریخ</th><th>شرح</th><th>بدهکار</th><th>بستانکار</th><th>مانده</th></tr></thead>
          <tbody><AcademyStatementRows charges={charges} payments={payments} currency={currency} /></tbody>
        </table>
        <footer><span>{text(settings?.invoiceFooter)}</span><span>{new Date().toLocaleDateString('fa-AF-u-ca-persian')}</span></footer>
      </div>
    </div>
  );
}

function StudentProfileModal({ student, currency, onClose, onPrintInvoice, onPrintStatement }) {
  if (!student) return null;
  const totalPaid = (student.payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalBalance = (student.registrations || []).reduce((sum, item) => sum + Number(item.balance || 0), 0);
  return (
    <div className="academy-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="academy-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="academy-modal-close" onClick={onClose}>بستن</button>
        <div className="academy-modal-actions">
          <h2>{text(student.fullName)}</h2>
          <button type="button" className="academy-inline-button" onClick={() => onPrintStatement?.(student._id)}>چاپ کشف‌حساب</button>
        </div>
        <div className="academy-profile-grid">
          <span>کد: {text(student.studentCode)}</span>
          <span>نام پدر: {text(student.fatherName)}</span>
          <span>تماس: {text(student.phone)}</span>
          <span>وضعیت: {text(student.status)}</span>
          <span>کل پرداخت: {fmt(totalPaid)} {currency}</span>
          <span>کل باقی: {fmt(totalBalance)} {currency}</span>
        </div>
        <h3>ثبت‌نام‌ها</h3>
        <Table
          columns={['کورس', 'صنف', 'فیس', 'پرداخت', 'باقی']}
          rows={(student.registrations || []).map((item) => [
            text(item.courseId?.name),
            text(item.classId?.name),
            fmt(item.totalPayable),
            fmt(item.paidAmount),
            fmt(item.balance)
          ])}
        />
        <h3>رسیدهای پرداخت</h3>
        <Table
          columns={['شماره', 'کورس', 'پرداخت', 'باقی', 'رسید']}
          rows={(student.invoices || []).map((item) => [
            item.invoiceNumber,
            text(item.courseName),
            fmt(item.paidAmount),
            fmt(item.remainingBalance),
            <button type="button" className="academy-inline-button" onClick={() => onPrintInvoice?.(item)}>چاپ رسید</button>
          ])}
        />
      </section>
    </div>
  );
}

function MonthlyReportDetailModal({ detail, currency, onClose }) {
  if (!detail) return null;
  return (
    <div className="academy-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="academy-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="academy-modal-close" onClick={onClose}>بستن</button>
        <h2>{detail.monthLabel || detail.month}</h2>
        <div className="academy-profile-grid">
          <span>مجموع عاید: {fmt(detail.income)} {currency}</span>
          <span>مجموع مصرف: {fmt(detail.expenses)} {currency}</span>
          <span>مفاد/ضرر خالص: {fmt(detail.net)} {currency}</span>
        </div>
        <h3>عاید به تفکیک روش پرداخت</h3>
        <Table
          columns={['روش پرداخت', 'مبلغ']}
          rows={(detail.byPaymentMethod || []).map((item) => [
            paymentMethodLabels[item.method] || item.method,
            `${fmt(item.total)} ${currency}`
          ])}
        />
        <h3>مصرف به تفکیک دسته</h3>
        <Table
          columns={['دسته', 'مبلغ']}
          rows={(detail.byExpenseCategory || []).map((item) => [
            expenseCategoryLabels[item.category] || item.category,
            `${fmt(item.total)} ${currency}`
          ])}
        />
      </section>
    </div>
  );
}
