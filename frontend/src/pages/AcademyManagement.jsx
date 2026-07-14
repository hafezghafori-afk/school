import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './AcademyManagement.css';
import { API_BASE } from '../config/api';

const emptyStudent = {
  firstName: '',
  lastName: '',
  fullName: '',
  fatherName: '',
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
  feeAmount: '',
  discountAmount: '',
  paymentPlan: 'full',
  status: 'active',
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
  { key: 'settings', label: 'تنظیمات' }
];

const paymentMethodLabels = {
  cash: 'نقدی',
  card: 'کارت',
  bank_transfer: 'بانک',
  hawala: 'حواله',
  other: 'سایر'
};

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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [settings, setSettings] = useState({
    name: 'آموزشگاه',
    address: '',
    phone: '',
    email: '',
    currency: 'AFN',
    invoicePrefix: 'ACD',
    invoiceFooter: 'تشکر از پرداخت شما',
    receiptSize: 'half',
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
  const [expenses, setExpenses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [reports, setReports] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [classForm, setClassForm] = useState(emptyClass);
  const [registrationForm, setRegistrationForm] = useState(emptyRegistration);
  const [paymentForm, setPaymentForm] = useState(emptyPayment);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendance);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [printClass, setPrintClass] = useState(null);

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
      setExpenses(data.expenses || []);
      setAttendance(data.attendance || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadReports = async () => {
    try {
      const data = await requestJson('/api/academy/reports/overview');
      setReports(data);
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports' && !reports) {
      loadReports();
    }
  }, [activeTab, reports]);

  const activeRegistrations = useMemo(
    () => registrations.filter((item) => item.status === 'active'),
    [registrations]
  );

  const filteredStudents = useMemo(
    () => students.filter((item) => includesSearch([item.fullName, item.studentCode, item.phone, item.fatherName], searchTerm)),
    [students, searchTerm]
  );

  const filteredRegistrations = useMemo(
    () => registrations.filter((item) => includesSearch([
      item.studentId?.fullName,
      item.studentId?.studentCode,
      item.courseId?.name,
      item.classId?.name
    ], searchTerm)),
    [registrations, searchTerm]
  );

  const filteredInvoices = useMemo(
    () => invoices.filter((item) => includesSearch([item.invoiceNumber, item.studentId?.fullName, item.courseName, item.className], searchTerm)),
    [invoices, searchTerm]
  );

  const filteredExpenses = useMemo(
    () => expenses.filter((item) => includesSearch([item.title, item.category, item.paidTo, item.expenseDate], searchTerm)),
    [expenses, searchTerm]
  );

  const selectedCourse = useMemo(
    () => courses.find((item) => String(item._id) === String(registrationForm.courseId)),
    [courses, registrationForm.courseId]
  );

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

  const submit = async ({ path, payload, reset, successTab }) => {
    setBusy(true);
    setMessage('');
    try {
      const data = await requestJson(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage(data.message || 'ذخیره شد.');
      if (data.invoice) setPrintInvoice(data.invoice);
      if (reset) reset();
      if (successTab) setActiveTab(successTab);
      await loadData();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const data = await requestJson('/api/academy/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings(data.settings || settings);
      setMessage(data.message || 'تنظیمات ذخیره شد.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const printCurrentInvoice = (invoice) => {
    setPrintClass(null);
    setPrintInvoice(invoice);
    window.setTimeout(() => window.print(), 80);
  };

  const printClassList = (item) => {
    setPrintInvoice(null);
    setPrintClass(item);
    window.setTimeout(() => window.print(), 80);
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
          <Link to="/admin-finance">بازگشت به مالی مکتب</Link>
          <button type="button" onClick={loadData} disabled={loading || busy}>تازه‌سازی</button>
        </div>
      </div>

      {message && <div className="academy-message">{message}</div>}

      <div className="academy-searchbar">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="جستجو در شاگرد، بل، کورس، صنف یا مصرف"
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
                <Field label="شاگرد">
                  <select required value={registrationForm.studentId} onChange={(e) => setRegistrationForm({ ...registrationForm, studentId: e.target.value })}>
                    <option value="">انتخاب شاگرد</option>
                    {students.map((item) => <option key={item._id} value={item._id}>{item.fullName} - {item.studentCode}</option>)}
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
                <Field label="تاریخ ثبت"><input type="date" value={registrationForm.registrationDate} onChange={(e) => setRegistrationForm({ ...registrationForm, registrationDate: e.target.value })} /></Field>
                <Field label="تاریخ شروع"><input type="date" value={registrationForm.startDate} onChange={(e) => setRegistrationForm({ ...registrationForm, startDate: e.target.value })} /></Field>
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
              <div className="academy-panel">
                <h2>لیست ثبت‌نام‌ها</h2>
                <Table
                  columns={['شاگرد', 'کورس', 'صنف', 'فیس', 'پرداخت', 'باقی']}
                  rows={filteredRegistrations.map((item) => [
                    text(item.studentId?.fullName),
                    text(item.courseId?.name),
                    text(item.classId?.name),
                    fmt(item.totalPayable),
                    fmt(item.paidAmount),
                    fmt(item.balance)
                  ])}
                />
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="academy-grid">
              <form className="academy-panel academy-form" onSubmit={(event) => {
                event.preventDefault();
                submit({ path: '/api/academy/payments', payload: paymentForm, reset: () => setPaymentForm(emptyPayment), successTab: 'payments' });
              }}>
                <h2>ثبت پرداخت فیس</h2>
                <Field label="ثبت‌نام">
                  <select required value={paymentForm.registrationId} onChange={(e) => setPaymentForm({ ...paymentForm, registrationId: e.target.value })}>
                    <option value="">انتخاب ثبت‌نام</option>
                    {activeRegistrations.map((item) => (
                      <option key={item._id} value={item._id}>
                        {text(item.studentId?.fullName)} - {text(item.courseId?.name)} - باقی {fmt(item.balance)}
                      </option>
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
              <div className="academy-panel">
                <h2>بل‌های صادرشده</h2>
                <Table
                  columns={['شماره بل', 'شاگرد', 'کورس', 'پرداخت', 'باقی', 'چاپ']}
                  rows={filteredInvoices.map((item) => [
                    item.invoiceNumber,
                    text(item.studentId?.fullName),
                    text(item.courseName),
                    `${fmt(item.paidAmount)} ${item.currency || currency}`,
                    fmt(item.remainingBalance),
                    <button type="button" className="academy-inline-button" onClick={() => printCurrentInvoice(item)}>چاپ</button>
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
                    {Object.entries(expenseCategoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <Field label="مبلغ"><input required type="number" min="1" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></Field>
                <Field label="تاریخ"><input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} /></Field>
                <Field label="پرداخت به"><input value={expenseForm.paidTo} onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })} /></Field>
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
                    item.expenseDate
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
                  <input type="date" value={attendanceForm.attendanceDate} onChange={(e) => setAttendanceForm({ ...attendanceForm, attendanceDate: e.target.value })} />
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
                      item.attendanceDate,
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
              <Field label="متن پایین بل"><textarea value={settings.invoiceFooter || ''} onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })} /></Field>
              <button type="submit" disabled={busy}>ذخیره تنظیمات</button>
            </form>
          )}
        </>
      )}

      <InvoicePrint invoice={printInvoice} settings={settings} />
      <ClassListPrint classItem={printClass} registrations={registrations} settings={settings} />
      <StudentProfileModal student={selectedStudent} currency={currency} onClose={() => setSelectedStudent(null)} />
    </section>
  );
}

function Table({ columns = [], rows = [] }) {
  if (!rows.length) {
    return <p className="academy-empty">هنوز موردی ثبت نشده است.</p>;
  }
  return (
    <div className="academy-table-wrap">
      <table className="academy-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicePrint({ invoice, settings }) {
  if (!invoice) return null;
  return (
    <div className="academy-print">
      <div className="academy-print-paper">
        <header>
          <div>
            <h2>{text(settings?.name, 'آموزشگاه')}</h2>
            <p>{text(settings?.address, '')}</p>
            <p>{text(settings?.phone, '')}</p>
          </div>
          <strong>{invoice.invoiceNumber}</strong>
        </header>
        <dl>
          <div><dt>شاگرد</dt><dd>{text(invoice.studentId?.fullName)}</dd></div>
          <div><dt>کورس</dt><dd>{text(invoice.courseName)}</dd></div>
          <div><dt>صنف</dt><dd>{text(invoice.className)}</dd></div>
          <div><dt>فیس اصلی</dt><dd>{fmt(invoice.feeAmount)} {invoice.currency}</dd></div>
          <div><dt>تخفیف</dt><dd>{fmt(invoice.discountAmount)} {invoice.currency}</dd></div>
          <div><dt>پرداخت</dt><dd>{fmt(invoice.paidAmount)} {invoice.currency}</dd></div>
          <div><dt>باقی‌مانده</dt><dd>{fmt(invoice.remainingBalance)} {invoice.currency}</dd></div>
        </dl>
        <footer>
          <span>{text(settings?.invoiceFooter, 'تشکر از پرداخت شما')}</span>
          <span>امضا: __________________</span>
        </footer>
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

function StudentProfileModal({ student, currency, onClose }) {
  if (!student) return null;
  const totalPaid = (student.payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalBalance = (student.registrations || []).reduce((sum, item) => sum + Number(item.balance || 0), 0);
  return (
    <div className="academy-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="academy-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="academy-modal-close" onClick={onClose}>بستن</button>
        <h2>{text(student.fullName)}</h2>
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
        <h3>بل‌ها</h3>
        <Table
          columns={['شماره بل', 'کورس', 'پرداخت', 'باقی']}
          rows={(student.invoices || []).map((item) => [
            item.invoiceNumber,
            text(item.courseName),
            fmt(item.paidAmount),
            fmt(item.remainingBalance)
          ])}
        />
      </section>
    </div>
  );
}
