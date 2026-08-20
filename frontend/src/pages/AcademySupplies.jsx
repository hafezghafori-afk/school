import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { studentMatchesSearch } from '../utils/studentSearch';
import './AcademySupplies.css';

const today = () => new Date().toISOString().slice(0, 10);

const emptyStudent = {
  studentCode: '',
  fullName: '',
  fatherName: '',
  className: '',
  phone: '',
  note: ''
};

const emptyPrice = {
  className: '',
  bookPrice: '',
  uniformPrice: '',
  currency: 'AFN',
  note: ''
};

const emptySale = {
  studentId: '',
  bookTaken: false,
  uniformTaken: false,
  bookDate: today(),
  uniformDate: today(),
  uniformSize: '',
  bookDiscount: '',
  uniformDiscount: '',
  note: ''
};

const fmt = (value) => Number(value || 0).toLocaleString('fa-AF');
const text = (value, fallback = '-') => String(value || '').trim() || fallback;
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
    <label className="academy-supply-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`academy-supply-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Table({ columns = [], rows = [] }) {
  if (!rows.length) return <p className="academy-supply-empty">هنوز موردی ثبت نشده است.</p>;
  return (
    <div className="academy-supply-table-wrap">
      <table className="academy-supply-table">
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

export default function AcademySupplies() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [students, setStudents] = useState([]);
  const [prices, setPrices] = useState([]);
  const [sales, setSales] = useState([]);
  const [report, setReport] = useState({ totals: {}, byClass: [], rows: [] });
  const [studentForm, setStudentForm] = useState(emptyStudent);
  const [priceForm, setPriceForm] = useState(emptyPrice);
  const [saleForm, setSaleForm] = useState(emptySale);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await requestJson('/api/academy-supplies/bootstrap');
      setStudents(data.students || []);
      setPrices(data.prices || []);
      setSales(data.sales || []);
      setReport(data.report || { totals: {}, byClass: [], rows: [] });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saleByStudent = useMemo(
    () => new Map(sales.map((item) => [String(item.studentId?._id || item.studentId), item])),
    [sales]
  );

  const selectedStudent = useMemo(
    () => students.find((item) => String(item._id) === String(saleForm.studentId)),
    [students, saleForm.studentId]
  );

  const selectedPrice = useMemo(
    () => prices.find((item) => item.className === selectedStudent?.className),
    [prices, selectedStudent]
  );

  const currency = selectedPrice?.currency || prices[0]?.currency || 'AFN';

  // Mirrors the backend's clamp (discount can't exceed its own item's
  // price) so the form shows the same net amount that will actually be
  // saved, before the student even submits.
  const saleNetPreview = useMemo(() => {
    const grossBook = saleForm.bookTaken ? Number(selectedPrice?.bookPrice || 0) : 0;
    const grossUniform = saleForm.uniformTaken ? Number(selectedPrice?.uniformPrice || 0) : 0;
    const bookDiscount = saleForm.bookTaken ? Math.min(grossBook, Math.max(0, Number(saleForm.bookDiscount || 0))) : 0;
    const uniformDiscount = saleForm.uniformTaken ? Math.min(grossUniform, Math.max(0, Number(saleForm.uniformDiscount || 0))) : 0;
    return {
      netBook: grossBook - bookDiscount,
      netUniform: grossUniform - uniformDiscount,
      totalDiscount: bookDiscount + uniformDiscount,
      total: (grossBook - bookDiscount) + (grossUniform - uniformDiscount)
    };
  }, [saleForm.bookTaken, saleForm.uniformTaken, saleForm.bookDiscount, saleForm.uniformDiscount, selectedPrice]);

  const filteredRows = useMemo(() => {
    return (report.rows || []).filter((row) => {
      const student = row.student || {};
      const sale = row.sale || {};
      const matchesTerm = studentMatchesSearch(student, search);
      const matchesStatus =
        statusFilter === 'all'
        || (statusFilter === 'bookTaken' && row.bookTaken)
        || (statusFilter === 'bookMissing' && !row.bookTaken)
        || (statusFilter === 'uniformTaken' && row.uniformTaken)
        || (statusFilter === 'uniformMissing' && !row.uniformTaken)
        || (statusFilter === 'bothTaken' && row.bookTaken && row.uniformTaken)
        || (statusFilter === 'missingAny' && (!row.bookTaken || !row.uniformTaken));
      return matchesTerm && matchesStatus && sale !== undefined;
    });
  }, [report.rows, search, statusFilter]);

  const submit = async ({ path, payload, reset }) => {
    setBusy(true);
    setMessage('');
    try {
      const data = await requestJson(path, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setMessage(data.message || 'ذخیره شد.');
      if (reset) reset();
      await loadData();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSale = async (event) => {
    event.preventDefault();
    await submit({
      path: '/api/academy-supplies/sales',
      payload: {
        ...saleForm,
        bookPrice: selectedPrice?.bookPrice || 0,
        uniformPrice: selectedPrice?.uniformPrice || 0,
        bookDiscount: saleForm.bookDiscount || 0,
        uniformDiscount: saleForm.uniformDiscount || 0,
        currency: selectedPrice?.currency || 'AFN'
      },
      reset: () => setSaleForm(emptySale)
    });
  };

  const loadStudentSale = (student) => {
    const existing = saleByStudent.get(String(student._id));
    setSaleForm({
      studentId: student._id,
      bookTaken: !!existing?.bookTaken,
      uniformTaken: !!existing?.uniformTaken,
      bookDate: existing?.bookDate || today(),
      uniformDate: existing?.uniformDate || today(),
      uniformSize: existing?.uniformSize || '',
      bookDiscount: existing?.bookDiscount || '',
      uniformDiscount: existing?.uniformDiscount || '',
      note: existing?.note || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const exportCsv = () => {
    const columns = ['ID', 'Name', 'Father', 'Class', 'Book', 'Book Date', 'Book Discount', 'Uniform', 'Uniform Date', 'Uniform Size', 'Uniform Discount', 'Total'];
    const rows = filteredRows.map((row) => {
      const student = row.student || {};
      const sale = row.sale || {};
      return [
        student.studentCode,
        student.fullName,
        student.fatherName,
        student.className,
        row.bookTaken ? 'Taken' : 'Missing',
        sale.bookDate || '',
        row.bookDiscount || 0,
        row.uniformTaken ? 'Taken' : 'Missing',
        sale.uniformDate || '',
        sale.uniformSize || '',
        row.uniformDiscount || 0,
        row.totalAmount || 0
      ];
    });
    const escapeValue = (value) => {
      const raw = String(value ?? '');
      return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const csv = [columns, ...rows].map((row) => row.map(escapeValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'academy-book-uniform-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="academy-supply-page" dir="rtl">
      <div className="academy-supply-topbar">
        <div>
          <span>دفتر داخلی آموزشگاه</span>
          <h1>فروش کتاب و یونیفرم</h1>
          <p>این بخش مستقل است و به مالی یا گزارش‌های اصلی سیستم وصل نمی‌شود.</p>
        </div>
        <div className="academy-supply-actions">
          <Link to="/academy">برگشت به آموزشگاه</Link>
          <button type="button" onClick={loadData} disabled={loading || busy}>تازه‌سازی</button>
        </div>
      </div>

      {message && <div className="academy-supply-message">{message}</div>}

      {loading ? (
        <div className="academy-supply-panel">در حال بارگذاری...</div>
      ) : (
        <div className="academy-supply-stack">
          <div className="academy-supply-stats">
            <Stat label="کل شاگردان" value={fmt(report?.totals?.students)} />
            <Stat label="کتاب گرفته" value={fmt(report?.totals?.bookTaken)} tone="green" />
            <Stat label="کتاب نگرفته" value={fmt(report?.totals?.bookMissing)} tone="amber" />
            <Stat label="یونیفرم گرفته" value={fmt(report?.totals?.uniformTaken)} tone="green" />
            <Stat label="یونیفرم نگرفته" value={fmt(report?.totals?.uniformMissing)} tone="amber" />
            <Stat label="مجموع تخفیف" value={`${fmt(report?.totals?.totalDiscount)} ${currency}`} tone="amber" />
            <Stat label="جمع داخلی" value={`${fmt(report?.totals?.totalAmount)} ${currency}`} />
          </div>

          <div className="academy-supply-grid">
            <form className="academy-supply-panel academy-supply-form" onSubmit={(event) => {
              event.preventDefault();
              submit({
                path: '/api/academy-supplies/students',
                payload: studentForm,
                reset: () => setStudentForm(emptyStudent)
              });
            }}>
              <h2>ثبت شاگرد</h2>
              <Field label="آی‌دی شاگرد">
                <input required value={studentForm.studentCode} onChange={(e) => setStudentForm({ ...studentForm, studentCode: e.target.value })} />
              </Field>
              <Field label="نام">
                <input required value={studentForm.fullName} onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })} />
              </Field>
              <Field label="نام پدر">
                <input value={studentForm.fatherName} onChange={(e) => setStudentForm({ ...studentForm, fatherName: e.target.value })} />
              </Field>
              <Field label="صنف">
                <input required value={studentForm.className} onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })} />
              </Field>
              <Field label="تماس">
                <input value={studentForm.phone} onChange={(e) => setStudentForm({ ...studentForm, phone: e.target.value })} />
              </Field>
              <Field label="یادداشت">
                <textarea value={studentForm.note} onChange={(e) => setStudentForm({ ...studentForm, note: e.target.value })} />
              </Field>
              <button type="submit" disabled={busy}>ثبت شاگرد</button>
            </form>

            <form className="academy-supply-panel academy-supply-form" onSubmit={(event) => {
              event.preventDefault();
              submit({
                path: '/api/academy-supplies/prices',
                payload: priceForm,
                reset: () => setPriceForm(emptyPrice)
              });
            }}>
              <h2>قیمت به اساس صنف</h2>
              <Field label="صنف">
                <input required value={priceForm.className} onChange={(e) => setPriceForm({ ...priceForm, className: e.target.value })} />
              </Field>
              <Field label="قیمت کتاب">
                <input required type="number" min="0" value={priceForm.bookPrice} onChange={(e) => setPriceForm({ ...priceForm, bookPrice: e.target.value })} />
              </Field>
              <Field label="قیمت یونیفرم">
                <input required type="number" min="0" value={priceForm.uniformPrice} onChange={(e) => setPriceForm({ ...priceForm, uniformPrice: e.target.value })} />
              </Field>
              <Field label="واحد پول">
                <input value={priceForm.currency} onChange={(e) => setPriceForm({ ...priceForm, currency: e.target.value })} />
              </Field>
              <Field label="یادداشت">
                <textarea value={priceForm.note} onChange={(e) => setPriceForm({ ...priceForm, note: e.target.value })} />
              </Field>
              <button type="submit" disabled={busy}>ذخیره قیمت</button>
            </form>

            <form className="academy-supply-panel academy-supply-form" onSubmit={saveSale}>
              <h2>ثبت فروش/تحویل</h2>
              <Field label="شاگرد">
                <select required value={saleForm.studentId} onChange={(e) => setSaleForm({ ...saleForm, studentId: e.target.value })}>
                  <option value="">انتخاب شاگرد</option>
                  {students.map((student, index) => (
                    <option key={student._id} value={student._id}>
                      {index + 1}. {student.studentCode} - {student.fullName} - {student.className}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="academy-supply-price-box">
                <span>صنف: {text(selectedStudent?.className)}</span>
                <span>کتاب: {fmt(selectedPrice?.bookPrice)} {selectedPrice?.currency || 'AFN'}</span>
                <span>یونیفرم: {fmt(selectedPrice?.uniformPrice)} {selectedPrice?.currency || 'AFN'}</span>
                {saleNetPreview.totalDiscount > 0 && (
                  <>
                    <span className="academy-supply-discount-note">تخفیف: −{fmt(saleNetPreview.totalDiscount)} {currency}</span>
                    <span className="academy-supply-discount-note academy-supply-net">مبلغ نهایی: {fmt(saleNetPreview.total)} {currency}</span>
                  </>
                )}
              </div>
              <label className="academy-supply-check">
                <input type="checkbox" checked={saleForm.bookTaken} onChange={(e) => setSaleForm({ ...saleForm, bookTaken: e.target.checked })} />
                <span>کتاب گرفته است</span>
              </label>
              {saleForm.bookTaken && (
                <>
                  <Field label="تاریخ گرفتن کتاب">
                    <input type="date" value={saleForm.bookDate} onChange={(e) => setSaleForm({ ...saleForm, bookDate: e.target.value })} />
                  </Field>
                  <Field label="تخفیف کتاب">
                    <input
                      type="number"
                      min="0"
                      max={selectedPrice?.bookPrice || 0}
                      placeholder="0"
                      value={saleForm.bookDiscount}
                      onChange={(e) => setSaleForm({ ...saleForm, bookDiscount: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <label className="academy-supply-check">
                <input type="checkbox" checked={saleForm.uniformTaken} onChange={(e) => setSaleForm({ ...saleForm, uniformTaken: e.target.checked })} />
                <span>یونیفرم گرفته است</span>
              </label>
              {saleForm.uniformTaken && (
                <>
                  <Field label="تاریخ گرفتن یونیفرم">
                    <input type="date" value={saleForm.uniformDate} onChange={(e) => setSaleForm({ ...saleForm, uniformDate: e.target.value })} />
                  </Field>
                  <Field label="سایز یونیفرم">
                    <input value={saleForm.uniformSize} onChange={(e) => setSaleForm({ ...saleForm, uniformSize: e.target.value })} />
                  </Field>
                  <Field label="تخفیف یونیفرم">
                    <input
                      type="number"
                      min="0"
                      max={selectedPrice?.uniformPrice || 0}
                      placeholder="0"
                      value={saleForm.uniformDiscount}
                      onChange={(e) => setSaleForm({ ...saleForm, uniformDiscount: e.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label="یادداشت">
                <textarea value={saleForm.note} onChange={(e) => setSaleForm({ ...saleForm, note: e.target.value })} />
              </Field>
              <button type="submit" disabled={busy || !saleForm.studentId}>ذخیره وضعیت</button>
            </form>
          </div>

          <div className="academy-supply-grid">
            <div className="academy-supply-panel">
              <h2>قیمت‌های ثبت‌شده</h2>
              <Table
                columns={['صنف', 'کتاب', 'یونیفرم', 'واحد']}
                rows={prices.map((item) => [
                  item.className,
                  fmt(item.bookPrice),
                  fmt(item.uniformPrice),
                  item.currency || 'AFN'
                ])}
              />
            </div>
            <div className="academy-supply-panel">
              <h2>گزارش به تفکیک صنف</h2>
              <Table
                columns={['صنف', 'شاگردان', 'کتاب گرفته', 'کتاب نگرفته', 'یونیفرم گرفته', 'یونیفرم نگرفته', 'تخفیف', 'جمع']}
                rows={(report.byClass || []).map((item) => [
                  item.className,
                  fmt(item.students),
                  fmt(item.bookTaken),
                  fmt(item.bookMissing),
                  fmt(item.uniformTaken),
                  fmt(item.uniformMissing),
                  `${fmt(item.totalDiscount)} ${currency}`,
                  `${fmt(item.totalAmount)} ${currency}`
                ])}
              />
            </div>
          </div>

          <div className="academy-supply-panel">
            <div className="academy-supply-report-head">
              <h2>گزارش داخلی شاگردان</h2>
              <div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجو نام، نمبر اساس/آی‌دی، نام پدر یا صنف" />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">همه</option>
                  <option value="bookTaken">کتاب گرفته</option>
                  <option value="bookMissing">کتاب نگرفته</option>
                  <option value="uniformTaken">یونیفرم گرفته</option>
                  <option value="uniformMissing">یونیفرم نگرفته</option>
                  <option value="bothTaken">هر دو را گرفته</option>
                  <option value="missingAny">حداقل یک مورد نگرفته</option>
                </select>
                <button type="button" onClick={exportCsv}>Excel/CSV</button>
              </div>
            </div>
            <Table
              columns={['آی‌دی', 'نام', 'نام پدر', 'صنف', 'کتاب', 'تاریخ کتاب', 'یونیفرم', 'تاریخ یونیفرم', 'سایز', 'تخفیف', 'جمع', 'ثبت']}
              rows={filteredRows.map((row) => {
                const student = row.student || {};
                const sale = row.sale || {};
                const totalDiscount = (row.bookDiscount || 0) + (row.uniformDiscount || 0);
                return [
                  student.studentCode,
                  student.fullName,
                  text(student.fatherName),
                  student.className,
                  row.bookTaken ? 'گرفته' : 'نگرفته',
                  text(sale.bookDate),
                  row.uniformTaken ? 'گرفته' : 'نگرفته',
                  text(sale.uniformDate),
                  text(sale.uniformSize),
                  totalDiscount > 0 ? `${fmt(totalDiscount)} ${sale.currency || currency}` : '-',
                  `${fmt(row.totalAmount)} ${sale.currency || currency}`,
                  <button type="button" className="academy-supply-inline" onClick={() => loadStudentSale(student)}>ویرایش</button>
                ];
              })}
            />
          </div>
        </div>
      )}
    </section>
  );
}
