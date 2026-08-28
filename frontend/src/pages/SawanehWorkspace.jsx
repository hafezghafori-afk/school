import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE } from '../config/api';
import './SawanehWorkspace.css';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GRADE_LABELS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];

const MOTHER_TONGUES = [
  { value: 'dari', label: 'دری' },
  { value: 'pashto', label: 'پشتو' },
  { value: 'other', label: 'سایر' }
];

const RELATIONS = [
  { value: 'brother', label: 'برادر' },
  { value: 'paternal_uncle', label: 'کاکا' },
  { value: 'maternal_uncle', label: 'ماما' },
  { value: 'paternal_cousin', label: 'پسر کاکا' },
  { value: 'maternal_cousin', label: 'پسر ماما' },
  { value: 'other', label: 'سایر' }
];

const HEALTH_STATUSES = [
  { value: '', label: '—' },
  { value: 'good', label: 'خوب' },
  { value: 'needs_followup', label: 'نیازمند پیگیری' },
  { value: 'chronic_condition', label: 'بیماری مزمن' }
];

const CARD_STATUS_LABELS = {
  missing: 'کارت ندارد',
  draft: 'پیش‌نویس',
  active: 'فعال',
  closed: 'بسته'
};

const SEPARATION_REASONS = {
  transfer: 'تبدیلی',
  dropout: 'ترک تحصیل',
  expulsion: 'اخراج',
  graduation: 'فراغت',
  death: 'وفات',
  other: 'سایر'
};

const gradeNumber = (value) => {
  const match = String(value == null ? '' : value).match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return num >= 1 && num <= 12 ? num : null;
};

const relationLabel = (value) => RELATIONS.find((item) => item.value === value)?.label || value;
const fmtNum = (value) => new Intl.NumberFormat('fa-AF').format(Number(value) || 0);

const studentDisplayName = (student = {}) => {
  const p = student.personalInfo || {};
  const dari = [p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ').trim();
  return dari || [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || 'بدون نام';
};

const emptyAddress = () => ({ province: '', district: '', villageOrStreet: '' });

const SawanehWorkspace = () => {
  const navigate = useNavigate();
  const { studentId: routeStudentId } = useParams();

  const [listLoading, setListLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedId, setSelectedId] = useState(routeStudentId || '');
  const [card, setCard] = useState(null);
  const [cardStudent, setCardStudent] = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // فرم فیلدهای دستی
  const [form, setForm] = useState(null);
  const [remarkDraft, setRemarkDraft] = useState({ grade: null, remark: '', healthStatus: '' });
  const [remarkSaving, setRemarkSaving] = useState(false);

  const flash = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`${API_BASE}/api/sawaneh/cards?${params.toString()}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'خطا در دریافت فهرست');
      }
      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setListError(err.message || 'خطا در اتصال به سرور');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(fetchList, 300);
    return () => window.clearTimeout(handle);
  }, [fetchList]);

  const loadCard = useCallback(async (studentId) => {
    if (!studentId) return;
    setCardLoading(true);
    setCardError('');
    setCard(null);
    setForm(null);
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${studentId}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'خطا در دریافت کارت سوانح');
      }
      const nextCard = data.data;
      setCard(nextCard);
      setCardStudent(nextCard.studentId && typeof nextCard.studentId === 'object' ? nextCard.studentId : null);
      setForm({
        motherTongue: nextCard.motherTongue || 'dari',
        thirdLanguage: nextCard.thirdLanguage || '',
        currentSameAsOrigin: nextCard.currentSameAsOrigin !== false,
        originAddress: { ...emptyAddress(), ...(nextCard.originAddress || {}) },
        currentAddress: { ...emptyAddress(), ...(nextCard.currentAddress || {}) },
        relatives: Array.isArray(nextCard.relatives)
          ? nextCard.relatives.map((item) => ({
            relation: item.relation || 'brother',
            name: item.name || '',
            phone: item.phone || '',
            note: item.note || ''
          }))
          : [],
        status: nextCard.status || 'draft'
      });
      const studentGrade = gradeNumber(
        (nextCard.studentId && nextCard.studentId.academicInfo && nextCard.studentId.academicInfo.currentGrade) || ''
      );
      setRemarkDraft({ grade: studentGrade, remark: '', healthStatus: '' });
    } catch (err) {
      setCardError(err.message || 'خطا در اتصال به سرور');
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadCard(selectedId);
  }, [selectedId, loadCard]);

  const selectStudent = (studentId) => {
    setSelectedId(studentId);
    navigate(`/afghan-sawaneh/${studentId}`, { replace: true });
  };

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const updateOrigin = (patch) => setForm((prev) => ({
    ...prev,
    originAddress: { ...prev.originAddress, ...patch }
  }));
  const updateCurrent = (patch) => setForm((prev) => ({
    ...prev,
    currentAddress: { ...prev.currentAddress, ...patch }
  }));

  const addRelative = () => setForm((prev) => ({
    ...prev,
    relatives: [...prev.relatives, { relation: 'brother', name: '', phone: '', note: '' }]
  }));
  const updateRelative = (index, patch) => setForm((prev) => ({
    ...prev,
    relatives: prev.relatives.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
  }));
  const removeRelative = (index) => setForm((prev) => ({
    ...prev,
    relatives: prev.relatives.filter((_, idx) => idx !== index)
  }));

  const saveCard = async () => {
    if (!selectedId || !form) return;
    setSaving(true);
    setCardError('');
    try {
      const payload = {
        motherTongue: form.motherTongue,
        thirdLanguage: form.thirdLanguage,
        currentSameAsOrigin: form.currentSameAsOrigin,
        originAddress: form.originAddress,
        currentAddress: form.currentSameAsOrigin ? form.originAddress : form.currentAddress,
        relatives: form.relatives.filter((item) => item.name.trim() || item.phone.trim()),
        status: form.status
      };
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${selectedId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ذخیره ناموفق بود');
      }
      setCard(data.data);
      flash('کارت سوانح ذخیره شد.');
      fetchList();
    } catch (err) {
      setCardError(err.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const saveRemark = async () => {
    if (!selectedId || !remarkDraft.grade) return;
    setRemarkSaving(true);
    setCardError('');
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${selectedId}/supervisor-remark`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          grade: remarkDraft.grade,
          remark: remarkDraft.remark,
          healthStatus: remarkDraft.healthStatus
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ثبت نظر ناموفق بود');
      }
      setCard(data.data);
      setRemarkDraft((prev) => ({ ...prev, remark: '', healthStatus: '' }));
      flash('نظر نگرانِ صنف ثبت شد.');
      fetchList();
    } catch (err) {
      setCardError(err.message || 'خطا در ثبت نظر');
    } finally {
      setRemarkSaving(false);
    }
  };

  const remarkByGrade = useMemo(() => {
    const map = new Map();
    (card?.supervisorRemarks || []).forEach((item) => map.set(Number(item.grade), item));
    return map;
  }, [card]);

  const currentStudentGrade = gradeNumber(cardStudent?.academicInfo?.currentGrade || '');

  return (
    <div className="sawaneh-workspace" dir="rtl">
      <header className="sw-header">
        <div>
          <h1>پرونده‌های سوانح شاگرد</h1>
          <p>کارت سوانح متعلم — مکاتب افغانستان</p>
        </div>
        <button type="button" className="sw-btn sw-btn-ghost" onClick={() => navigate('/afghan-dashboard')}>
          بازگشت به داشبورد
        </button>
      </header>

      <div className="sw-body">
        <aside className="sw-list">
          <div className="sw-list-controls">
            <input
              type="search"
              placeholder="جستجو: نام، نام پدر، نمبر اساس…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">همه</option>
              <option value="missing">کارت ندارد</option>
              <option value="draft">پیش‌نویس</option>
              <option value="active">فعال</option>
            </select>
          </div>

          {listLoading && <div className="sw-muted">در حال بارگذاری…</div>}
          {listError && <div className="sw-error">{listError}</div>}
          {!listLoading && !listError && rows.length === 0 && (
            <div className="sw-muted">شاگردی یافت نشد.</div>
          )}

          <ul>
            {rows.map(({ student, cardStatus, hasCurrentGradeRemark }) => {
              const grade = gradeNumber(student.academicInfo?.currentGrade);
              return (
                <li key={student._id}>
                  <button
                    type="button"
                    className={selectedId === student._id ? 'is-selected' : ''}
                    onClick={() => selectStudent(student._id)}
                  >
                    <span className="sw-list-name">{studentDisplayName(student)}</span>
                    <span className="sw-list-meta">
                      {student.asasNumber ? `اساس ${student.asasNumber}` : 'بدون نمبر اساس'}
                      {grade ? ` · صنف ${GRADE_LABELS[grade - 1]}` : ''}
                    </span>
                    <span className="sw-chips">
                      <span className={`sw-chip sw-chip-${cardStatus}`}>
                        {CARD_STATUS_LABELS[cardStatus] || cardStatus}
                      </span>
                      {cardStatus !== 'missing' && (
                        <span className={`sw-chip ${hasCurrentGradeRemark ? 'sw-chip-ok' : 'sw-chip-warn'}`}>
                          {hasCurrentGradeRemark ? 'نظر صنف: ثبت‌شده' : 'نظر صنف: خالی'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="sw-detail">
          {!selectedId && <div className="sw-placeholder">یک شاگرد را از فهرست انتخاب کنید.</div>}
          {selectedId && cardLoading && <div className="sw-placeholder">در حال بارگذاری کارت…</div>}
          {selectedId && !cardLoading && cardError && <div className="sw-error">{cardError}</div>}

          {selectedId && !cardLoading && card && form && (
            <>
              <div className="sw-card-head">
                <div>
                  <h2>{studentDisplayName(cardStudent || {})}</h2>
                  <p className="sw-muted">
                    {cardStudent?.personalInfo?.fatherName ? `ولد ${cardStudent.personalInfo.fatherName}` : ''}
                    {cardStudent?.asasNumber ? ` · نمبر اساس ${cardStudent.asasNumber}` : ''}
                    {currentStudentGrade ? ` · صنف ${GRADE_LABELS[currentStudentGrade - 1]}` : ''}
                  </p>
                </div>
                <div className="sw-card-head-actions">
                  <label className="sw-status-toggle">
                    وضعیت کارت
                    <select
                      value={form.status}
                      onChange={(event) => updateForm({ status: event.target.value })}
                    >
                      <option value="draft">پیش‌نویس</option>
                      <option value="active">فعال</option>
                    </select>
                  </label>
                  <button type="button" className="sw-btn sw-btn-primary" onClick={saveCard} disabled={saving}>
                    {saving ? 'در حال ذخیره…' : 'ذخیرهٔ کارت'}
                  </button>
                </div>
              </div>

              {toast && <div className="sw-toast">{toast}</div>}

              <div className="sw-grid">
                <fieldset className="sw-section">
                  <legend>زبان</legend>
                  <label>
                    زبان مادری
                    <select
                      value={form.motherTongue}
                      onChange={(event) => updateForm({ motherTongue: event.target.value })}
                    >
                      {MOTHER_TONGUES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    لسان سوم
                    <input
                      type="text"
                      value={form.thirdLanguage}
                      onChange={(event) => updateForm({ thirdLanguage: event.target.value })}
                    />
                  </label>
                </fieldset>

                <fieldset className="sw-section">
                  <legend>سکونت اصلی</legend>
                  <label>
                    ولایت
                    <input
                      type="text"
                      value={form.originAddress.province}
                      onChange={(event) => updateOrigin({ province: event.target.value })}
                    />
                  </label>
                  <label>
                    ولسوالی / ناحیه
                    <input
                      type="text"
                      value={form.originAddress.district}
                      onChange={(event) => updateOrigin({ district: event.target.value })}
                    />
                  </label>
                  <label>
                    قریه / گذر
                    <input
                      type="text"
                      value={form.originAddress.villageOrStreet}
                      onChange={(event) => updateOrigin({ villageOrStreet: event.target.value })}
                    />
                  </label>
                </fieldset>

                <fieldset className="sw-section">
                  <legend>سکونت فعلی</legend>
                  <label className="sw-checkbox">
                    <input
                      type="checkbox"
                      checked={form.currentSameAsOrigin}
                      onChange={(event) => updateForm({ currentSameAsOrigin: event.target.checked })}
                    />
                    مثل سکونت اصلی
                  </label>
                  {!form.currentSameAsOrigin && (
                    <>
                      <label>
                        ولایت
                        <input
                          type="text"
                          value={form.currentAddress.province}
                          onChange={(event) => updateCurrent({ province: event.target.value })}
                        />
                      </label>
                      <label>
                        ولسوالی / ناحیه
                        <input
                          type="text"
                          value={form.currentAddress.district}
                          onChange={(event) => updateCurrent({ district: event.target.value })}
                        />
                      </label>
                      <label>
                        قریه / گذر
                        <input
                          type="text"
                          value={form.currentAddress.villageOrStreet}
                          onChange={(event) => updateCurrent({ villageOrStreet: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              </div>

              <fieldset className="sw-section sw-section-wide">
                <legend>اقارب نزدیک</legend>
                {form.relatives.length === 0 && <p className="sw-muted">ثبت نشده.</p>}
                {form.relatives.map((relative, index) => (
                  <div className="sw-relative-row" key={index}>
                    <select
                      value={relative.relation}
                      onChange={(event) => updateRelative(index, { relation: event.target.value })}
                    >
                      {RELATIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="نام"
                      value={relative.name}
                      onChange={(event) => updateRelative(index, { name: event.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="تماس"
                      value={relative.phone}
                      onChange={(event) => updateRelative(index, { phone: event.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="یادداشت"
                      value={relative.note}
                      onChange={(event) => updateRelative(index, { note: event.target.value })}
                    />
                    <button type="button" className="sw-btn sw-btn-ghost" onClick={() => removeRelative(index)}>
                      حذف
                    </button>
                  </div>
                ))}
                <button type="button" className="sw-btn sw-btn-ghost" onClick={addRelative}>
                  + افزودن اقارب
                </button>
              </fieldset>

              <fieldset className="sw-section sw-section-wide">
                <legend>شمولیت (نمبر اساس در مکاتب)</legend>
                {(card.enrollmentHistory || []).length === 0 && <p className="sw-muted">ثبت نشده.</p>}
                {(card.enrollmentHistory || []).length > 0 && (
                  <div className="sw-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>نام مدرسه</th>
                          <th>نمبر اساس</th>
                          <th>صنف</th>
                          <th>تاریخ</th>
                          <th>نمبر مکتوب</th>
                          <th>نوع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.enrollmentHistory.map((row, index) => (
                          <tr key={index}>
                            <td>{row.schoolName || '—'}</td>
                            <td>{row.asasNumber || '—'}</td>
                            <td>{row.grade ? GRADE_LABELS[row.grade - 1] : '—'}</td>
                            <td>{row.dateLocal || '—'}</td>
                            <td>{row.letterNo || '—'}</td>
                            <td>
                              {row.kind === 'initial' && 'شمولیت اولیه'}
                              {row.kind === 'transfer_in' && 'تبدیلی ورودی'}
                              {row.kind === 're_admission' && 'شمولیت مجدد'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </fieldset>

              {(card.nameCorrections || []).length > 0 && (
                <fieldset className="sw-section sw-section-wide">
                  <legend>اصلاح شهرت</legend>
                  <div className="sw-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>مورد</th>
                          <th>قبلی</th>
                          <th>جدید</th>
                          <th>نمبر مکتوب</th>
                          <th>تاریخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.nameCorrections.map((row, index) => (
                          <tr key={index}>
                            <td>{row.field}</td>
                            <td>{row.oldValue || '—'}</td>
                            <td>{row.newValue || '—'}</td>
                            <td>{row.letterNo || '—'}</td>
                            <td>{row.dateLocal || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </fieldset>
              )}

              <fieldset className="sw-section sw-section-wide">
                <legend>نظریات نگرانِ صنف و وضع صحی</legend>
                <div className="sw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>صنف</th>
                        <th>اسم نگران</th>
                        <th>نظریات</th>
                        <th>وضع صحی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GRADES.map((grade) => {
                        const entry = remarkByGrade.get(grade);
                        const isEditable = remarkDraft.grade === grade;
                        return (
                          <tr key={grade} className={isEditable ? 'sw-row-active' : ''}>
                            <td>{GRADE_LABELS[grade - 1]}</td>
                            <td>{entry?.supervisorName || '—'}</td>
                            <td>
                              {isEditable ? (
                                <textarea
                                  rows={2}
                                  value={remarkDraft.remark}
                                  placeholder={entry?.remark || 'نظر نگرانِ صنف…'}
                                  onChange={(event) => setRemarkDraft((prev) => ({ ...prev, remark: event.target.value }))}
                                />
                              ) : (
                                entry?.remark || '—'
                              )}
                            </td>
                            <td>
                              {isEditable ? (
                                <select
                                  value={remarkDraft.healthStatus}
                                  onChange={(event) => setRemarkDraft((prev) => ({ ...prev, healthStatus: event.target.value }))}
                                >
                                  {HEALTH_STATUSES.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                  ))}
                                </select>
                              ) : (
                                HEALTH_STATUSES.find((item) => item.value === (entry?.healthStatus || ''))?.label || '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="sw-remark-actions">
                  <label>
                    صنفِ ثبت نظر
                    <select
                      value={remarkDraft.grade || ''}
                      onChange={(event) => setRemarkDraft((prev) => ({
                        ...prev,
                        grade: Number(event.target.value) || null,
                        remark: '',
                        healthStatus: ''
                      }))}
                    >
                      <option value="">— انتخاب صنف —</option>
                      {GRADES.map((grade) => (
                        <option key={grade} value={grade}>{GRADE_LABELS[grade - 1]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="sw-btn sw-btn-primary"
                    onClick={saveRemark}
                    disabled={remarkSaving || !remarkDraft.grade || !remarkDraft.remark.trim()}
                  >
                    {remarkSaving ? 'در حال ثبت…' : 'ثبت نظرِ این صنف'}
                  </button>
                  <span className="sw-hint">
                    اگر نگرانِ صنف هستید، فقط صنفِ کلاسِ خودتان قابل ثبت است.
                  </span>
                </div>
              </fieldset>

              {card.separation?.isSeparated && (
                <fieldset className="sw-section sw-section-wide sw-section-danger">
                  <legend>منفک شدن</legend>
                  <div className="sw-separation">
                    <span>علت: {SEPARATION_REASONS[card.separation.reason] || card.separation.reasonText || '—'}</span>
                    <span>صنف: {card.separation.grade ? GRADE_LABELS[card.separation.grade - 1] : '—'}</span>
                    <span>تاریخ: {card.separation.dateLocal || '—'}</span>
                    <span>نمبر مکتوب: {card.separation.letterNo || '—'}</span>
                    <span>
                      جریمه: {fmtNum(card.separation.penaltyAmount)}
                      {card.separation.penaltyPaid ? ' (پرداخت‌شده)' : ''}
                    </span>
                  </div>
                </fieldset>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SawanehWorkspace;
