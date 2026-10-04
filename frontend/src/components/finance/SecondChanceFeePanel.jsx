import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../../config/api';
import AfghanDateInput from '../ui/AfghanDateInput';
import { formatAfghanDate } from '../../utils/afghanDate';
import { formatStudentDisplayLabel } from '../../utils/studentSearch';
import './SecondChanceFeePanel.css';

// «فیس امتحان چانس دوم»: only the students a promotion batch held (مشروط) for
// the second-chance exam are listed. Charging them is optional, one student at
// a time or several together, and every amount is typed by hand - the
// student's own monthly fee and failed subjects are shown only as a guide.

const STATE_META = {
  undecided: { label: 'تصمیم نشده', chip: 'finance-chip-muted' },
  billed: { label: 'بل صادر شد', chip: 'finance-chip-amber' },
  paid: { label: 'پرداخت شد', chip: 'finance-chip-emerald' },
  waived: { label: 'معاف', chip: 'finance-chip-sky' }
};

const STATE_FILTERS = [
  { value: '', label: 'همه' },
  { value: 'undecided', label: 'تصمیم نشده' },
  { value: 'billed', label: 'بل صادر شد' },
  { value: 'paid', label: 'پرداخت شد' },
  { value: 'waived', label: 'معاف' }
];

const RESOLUTION_LABELS = {
  pending: 'در انتظار نتیجه',
  promoted: 'کامیاب شد',
  repeated: 'تکرار صنف',
  graduated: 'فارغ شد'
};

const fmtMoney = (value) => `${(Number(value) || 0).toLocaleString('fa-AF')} AFN`;
const fmtPercent = (value) => `${(Number(value) || 0).toLocaleString('fa-AF', { maximumFractionDigits: 1 })}٪`;
const fmtDay = (value) => formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) || '-';

function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function classLabel(schoolClass) {
  if (!schoolClass) return '-';
  return schoolClass.code ? `${schoolClass.title} — ${schoolClass.code}` : schoolClass.title;
}

function resolutionLabel(item) {
  const label = RESOLUTION_LABELS[item.resolution] || item.resolution || '-';
  if (item.resolution === 'promoted' && item.targetClass) return `${label} → ${item.targetClass.title}`;
  return label;
}

export default function SecondChanceFeePanel({ active = true, sectionKey = '', fetchJson, postJson, onChanged }) {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ academicYearId: '', classId: '', state: 'undecided' });
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  // The finance page re-creates fetchJson on every render; read it through a
  // ref so loading isn't re-triggered by unrelated renders.
  const fetchRef = useRef(fetchJson);
  fetchRef.current = fetchJson;
  const requestedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRef.current(`${API_BASE}/api/finance/admin/second-chance-fees`);
      if (!data?.success) throw new Error(data?.message || 'دریافت لیست فیس چانس دوم ناموفق بود.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setSummary(data.summary || null);
    } catch (loadError) {
      setError(loadError?.message || 'دریافت لیست فیس چانس دوم ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The finance page keeps every section mounted; this list is fetched the
  // first time its section is opened, not with the page's initial burst.
  useEffect(() => {
    if (!active || requestedRef.current) return;
    requestedRef.current = true;
    load();
  }, [active, load]);

  const yearOptions = useMemo(() => {
    const map = new Map();
    items.forEach((item) => { if (item.academicYear?.id) map.set(item.academicYear.id, item.academicYear.title); });
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [items]);

  const classOptions = useMemo(() => {
    const map = new Map();
    items
      .filter((item) => !filters.academicYearId || item.academicYear?.id === filters.academicYearId)
      .forEach((item) => { if (item.schoolClass?.id) map.set(item.schoolClass.id, classLabel(item.schoolClass)); });
    return Array.from(map, ([value, label]) => ({ value, label }));
  }, [items, filters.academicYearId]);

  const visibleItems = useMemo(() => items.filter((item) => (
    (!filters.academicYearId || item.academicYear?.id === filters.academicYearId)
    && (!filters.classId || item.schoolClass?.id === filters.classId)
    && (!filters.state || item.fee.state === filters.state)
  )), [items, filters]);

  const draftOf = (transactionId) => drafts[transactionId] || { amount: '', dueDate: todayIso() };
  const setDraft = (transactionId, patch) => setDrafts((current) => ({
    ...current,
    [transactionId]: { ...draftOf(transactionId), ...patch }
  }));

  const toggleSelected = (transactionId) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(transactionId)) next.delete(transactionId);
    else next.add(transactionId);
    return next;
  });

  const undecidedVisible = visibleItems.filter((item) => item.fee.state === 'undecided');
  const allUndecidedSelected = undecidedVisible.length > 0 && undecidedVisible.every((item) => selected.has(item.transactionId));
  const toggleAll = () => setSelected(() => (
    allUndecidedSelected ? new Set() : new Set(undecidedVisible.map((item) => item.transactionId))
  ));

  const finish = async (message) => {
    setNotice(message);
    setSelected(new Set());
    await load();
    if (typeof onChanged === 'function') onChanged();
  };

  const billPayload = (item) => {
    const draft = draftOf(item.transactionId);
    const amount = Number(String(draft.amount || '').replace(/[^\d.]/g, ''));
    if (!(amount > 0)) return { error: `مبلغ فیس ${item.student.fullName} را وارد کنید.` };
    if (!draft.dueDate) return { error: `مهلت پرداخت ${item.student.fullName} را انتخاب کنید.` };
    return { body: { amount, dueDate: draft.dueDate } };
  };

  const issueBill = async (item) => {
    const { body, error: draftError } = billPayload(item);
    if (draftError) {
      setError(draftError);
      return;
    }
    setBusy(`bill:${item.transactionId}`);
    setError('');
    try {
      const data = await postJson(`${API_BASE}/api/finance/admin/second-chance-fees/${item.transactionId}/bill`, body);
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.transactionId];
        return next;
      });
      await finish(data?.message || 'بل صادر شد.');
    } catch (billError) {
      setError(billError?.message || 'صدور بل ناموفق بود.');
    } finally {
      setBusy('');
    }
  };

  // One request at a time: a burst of parallel writes is what overloaded the
  // server before, and each student keeps their own amount.
  const issueSelected = async () => {
    const chosen = undecidedVisible.filter((item) => selected.has(item.transactionId));
    const invalid = chosen.map(billPayload).find((entry) => entry.error);
    if (invalid) {
      setError(invalid.error);
      return;
    }
    setBusy('bulk');
    setError('');
    const failures = [];
    let issued = 0;
    for (const item of chosen) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await postJson(`${API_BASE}/api/finance/admin/second-chance-fees/${item.transactionId}/bill`, billPayload(item).body);
        issued += 1;
      } catch (billError) {
        failures.push(`${item.student.fullName}: ${billError?.message || 'ناموفق'}`);
      }
    }
    setBusy('');
    setDrafts({});
    if (failures.length) setError(`برای ${failures.length} شاگرد بل صادر نشد — ${failures.join(' | ')}`);
    await finish(`برای ${issued.toLocaleString('fa-AF')} شاگرد بل فیس چانس دوم صادر شد.`);
  };

  const runAction = async (item, action, { prompt = '', required = false } = {}) => {
    let reason = '';
    if (prompt) {
      const answer = window.prompt(prompt, '');
      if (answer === null) return;
      reason = String(answer || '').trim();
      if (required && !reason) {
        setError('نوشتن دلیل الزامی است.');
        return;
      }
    }
    setBusy(`${action}:${item.transactionId}`);
    setError('');
    try {
      const data = await postJson(`${API_BASE}/api/finance/admin/second-chance-fees/${item.transactionId}/${action}`, reason ? { reason } : {});
      await finish(data?.message || 'انجام شد.');
    } catch (actionError) {
      setError(actionError?.message || 'عملیات ناموفق بود.');
    } finally {
      setBusy('');
    }
  };

  const selectedCount = undecidedVisible.filter((item) => selected.has(item.transactionId)).length;

  return (
    <div className="finance-card scf-card" data-finance-section={sectionKey || undefined} data-testid="second-chance-fee-panel">
      <div className="finance-card-head">
        <div>
          <h3>فیس امتحان چانس دوم</h3>
          <p className="muted">
            فقط شاگردانی که در ارتقای صنف «مشروط» شده‌اند. گرفتن فیس اختیاری است؛ مبلغ هر شاگرد را خودتان وارد کنید
            (فیس ماهوار و مضامین ناکام فقط برای راهنمایی نشان داده می‌شوند).
          </p>
        </div>
        <button type="button" className="secondary" onClick={load} disabled={loading}>
          {loading ? 'در حال بارگذاری...' : 'تازه‌سازی'}
        </button>
      </div>

      {summary ? (
        <div className="finance-chip-group scf-summary">
          <span className="finance-chip">تصمیم نشده: {summary.undecided}</span>
          <span className="finance-chip">بل صادر شد: {summary.billed}</span>
          <span className="finance-chip finance-chip-emerald">پرداخت شد: {summary.paid}</span>
          <span className="finance-chip finance-chip-muted">معاف: {summary.waived}</span>
          <span className="finance-chip">مجموع بل‌ها: {fmtMoney(summary.billedAmount)}</span>
          <span className="finance-chip finance-chip-emerald">وصول‌شده: {fmtMoney(summary.paidAmount)}</span>
          <span className="finance-chip finance-chip-rose">باقی: {fmtMoney(summary.outstandingAmount)}</span>
        </div>
      ) : null}

      <div className="scf-filters">
        <label>
          <span>سال تعلیمی</span>
          <select value={filters.academicYearId} onChange={(event) => setFilters((current) => ({ ...current, academicYearId: event.target.value, classId: '' }))}>
            <option value="">همه سال‌ها</option>
            {yearOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>صنف</span>
          <select value={filters.classId} onChange={(event) => setFilters((current) => ({ ...current, classId: event.target.value }))}>
            <option value="">همه صنف‌ها</option>
            {classOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span>وضعیت فیس</span>
          <select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}>
            {STATE_FILTERS.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {undecidedVisible.length > 0 && (
          <button
            type="button"
            onClick={issueSelected}
            disabled={!selectedCount || busy === 'bulk'}
            data-testid="second-chance-bulk-bill"
          >
            {busy === 'bulk' ? 'در حال صدور...' : `صدور بل برای انتخاب‌شده‌ها (${selectedCount.toLocaleString('fa-AF')})`}
          </button>
        )}
      </div>

      {notice && <div className="scf-notice" role="status">{notice}</div>}
      {error && <div className="scf-error" role="alert">{error}</div>}

      {!loading && !visibleItems.length ? (
        <p className="muted scf-empty">
          {items.length ? 'با این فیلترها شاگردی پیدا نشد.' : 'هیچ شاگرد مشروطی در انتظار امتحان چانس دوم نیست.'}
        </p>
      ) : (
        <div className="scf-table-wrap">
          <table className="scf-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="انتخاب همه شاگردان تصمیم‌نشده"
                    checked={allUndecidedSelected}
                    onChange={toggleAll}
                    disabled={!undecidedVisible.length}
                  />
                </th>
                <th>شاگرد</th>
                <th>صنف / سال</th>
                <th>مضامین ناکام</th>
                <th>فیس ماهوار (راهنما)</th>
                <th>نتیجهٔ چانس دوم</th>
                <th>مبلغ فیس چانس</th>
                <th>مهلت پرداخت</th>
                <th>وضعیت</th>
                <th>اقدام</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, index) => {
                const state = STATE_META[item.fee.state] || STATE_META.undecided;
                const draft = draftOf(item.transactionId);
                const rowBusy = busy.endsWith(`:${item.transactionId}`) || busy === 'bulk';
                return (
                  <tr key={item.transactionId} data-testid={`second-chance-row-${item.transactionId}`}>
                    <td data-label="انتخاب">
                      {item.fee.state === 'undecided' ? (
                        <input
                          type="checkbox"
                          aria-label={`انتخاب ${item.student.fullName}`}
                          checked={selected.has(item.transactionId)}
                          onChange={() => toggleSelected(item.transactionId)}
                        />
                      ) : null}
                    </td>
                    <td data-label="شاگرد">
                      <strong>{formatStudentDisplayLabel({ fullName: item.student.fullName, asasNumber: item.student.asasNumber || item.student.admissionNo }, { index: index + 1 })}</strong>
                    </td>
                    <td data-label="صنف / سال">
                      {classLabel(item.schoolClass)}
                      <small>{item.academicYear?.title || '-'}</small>
                    </td>
                    <td data-label="مضامین ناکام">
                      {item.failedSubjects.length ? (
                        <>
                          <span className="scf-count">{item.failedSubjects.length.toLocaleString('fa-AF')} مضمون</span>
                          <small>{item.failedSubjects.map((subject) => `${subject.subjectTitle} (${fmtPercent(subject.percentage)})`).join('، ')}</small>
                        </>
                      ) : <span className="muted">ثبت نشده</span>}
                      {item.averageScore != null && <small>اوسط: {fmtPercent(item.averageScore)}</small>}
                    </td>
                    <td data-label="فیس ماهوار">
                      {item.monthlyFee?.amount ? (
                        <>
                          {fmtMoney(item.monthlyFee.amount)}
                          <small>
                            {item.monthlyFee.source === 'plan'
                              ? 'پلان فیس صنف'
                              : item.monthlyFee.original > item.monthlyFee.amount
                                ? `پس از تخفیف (اصل ${fmtMoney(item.monthlyFee.original)})`
                                : 'آخرین بل ماهوار شاگرد'}
                          </small>
                        </>
                      ) : <span className="muted">-</span>}
                    </td>
                    <td data-label="نتیجهٔ چانس دوم">{resolutionLabel(item)}</td>
                    <td data-label="مبلغ فیس چانس">
                      {item.fee.state === 'undecided' ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          className="scf-amount"
                          placeholder="مبلغ"
                          aria-label={`مبلغ فیس چانس ${item.student.fullName}`}
                          value={draft.amount}
                          onChange={(event) => setDraft(item.transactionId, { amount: event.target.value })}
                        />
                      ) : item.fee.bill ? fmtMoney(item.fee.bill.amountDue) : '-'}
                    </td>
                    <td data-label="مهلت پرداخت">
                      {item.fee.state === 'undecided' ? (
                        <AfghanDateInput
                          value={draft.dueDate}
                          onChange={(value) => setDraft(item.transactionId, { dueDate: value })}
                        />
                      ) : item.fee.bill ? fmtDay(item.fee.bill.dueDate) : '-'}
                    </td>
                    <td data-label="وضعیت">
                      <span className={`finance-chip ${state.chip}`}>{state.label}</span>
                      {item.fee.bill && (
                        <small>
                          بل {item.fee.bill.billNumber}
                          {item.fee.bill.outstanding > 0 ? ` · باقی ${fmtMoney(item.fee.bill.outstanding)}` : ''}
                        </small>
                      )}
                      {item.fee.state === 'waived' && item.fee.waiverReason && <small>دلیل: {item.fee.waiverReason}</small>}
                      {item.fee.previousBill && <small>بل قبلی {item.fee.previousBill.billNumber} باطل شد</small>}
                    </td>
                    <td data-label="اقدام">
                      <div className="scf-actions">
                        {item.fee.state === 'undecided' && (
                          <>
                            <button type="button" onClick={() => issueBill(item)} disabled={rowBusy}>صدور بل</button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => runAction(item, 'waive', { prompt: `دلیل معافیت ${item.student.fullName} از فیس چانس دوم:`, required: true })}
                              disabled={rowBusy}
                            >
                              معاف
                            </button>
                          </>
                        )}
                        {item.fee.state === 'billed' && (
                          <button
                            type="button"
                            className="danger"
                            onClick={() => runAction(item, 'void-bill', { prompt: `دلیل باطل‌کردن بل فیس چانس ${item.student.fullName}:`, required: true })}
                            disabled={rowBusy}
                          >
                            باطل‌کردن بل
                          </button>
                        )}
                        {item.fee.state === 'waived' && (
                          <button type="button" className="secondary" onClick={() => runAction(item, 'clear-waiver')} disabled={rowBusy}>برداشتن معافیت</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
