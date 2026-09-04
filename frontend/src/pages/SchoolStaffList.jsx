import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/ui/toast';
import {
  DEFAULT_SCHOOL_ID,
  downloadBlob,
  fetchBlob,
  fetchJson,
  postForm,
  readStoredSchoolId,
  repairDisplayText,
  resolveActiveSchoolContext
} from './adminWorkspaceUtils';
import './SchoolStaffList.css';

const readAdminLevel = () => {
  if (typeof window === 'undefined') return '';
  try {
    return String(
      window.localStorage.getItem('adminLevel') || window.localStorage.getItem('orgRole') || ''
    ).trim();
  } catch {
    return '';
  }
};

const POSITION_LABELS = {
  teacher: 'استاد',
  principal: 'مدیر مکتب',
  vice_principal: 'معاون مکتب',
  admin_staff: 'کارمند اداری',
  support_staff: 'کارمند خدماتی'
};

const STATUS_LABELS = {
  active: 'فعال',
  inactive: 'غیرفعال',
  on_leave: 'رخصتی',
  suspended: 'معطل',
  terminated: 'منفک',
  retired: 'متقاعد'
};

const POSITION_FILTER_OPTIONS = [
  { value: '', label: 'همهٔ سمت‌ها' },
  { value: 'teacher', label: 'استاد' },
  { value: 'principal', label: 'مدیر مکتب' },
  { value: 'vice_principal', label: 'معاون مکتب' },
  { value: 'admin_staff', label: 'کارمند اداری' },
  { value: 'support_staff', label: 'کارمند خدماتی' }
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'همهٔ وضعیت‌ها' },
  { value: 'active', label: 'فعال' },
  { value: 'on_leave', label: 'رخصتی' },
  { value: 'suspended', label: 'معطل' },
  { value: 'terminated', label: 'منفک' },
  { value: 'retired', label: 'متقاعد' },
  { value: 'inactive', label: 'غیرفعال' }
];

// همان گزینه‌ها بدونِ «همهٔ وضعیت‌ها» — برای دراپ‌داونِ تغییرِ وضعیتِ هر ردیف، که
// همیشه باید یک وضعیتِ مشخص را نشان بدهد، نه گزینهٔ «همه».
const STATUS_CHANGE_OPTIONS = STATUS_FILTER_OPTIONS.filter((opt) => opt.value);

const trimValue = (value) => String(value || '').trim();
const displayText = (value) => repairDisplayText(value);

const staffFullName = (item) => {
  const dari = [item?.personalInfo?.firstNameDari, item?.personalInfo?.lastNameDari].filter(Boolean).join(' ');
  const latin = [item?.personalInfo?.firstName, item?.personalInfo?.lastName].filter(Boolean).join(' ');
  return displayText(dari || latin || 'بدون نام');
};

const salaryTotalOf = (item) => {
  const salary = item?.financialInfo?.salary || {};
  const parts = [salary.base, salary.housing, salary.transport, salary.other]
    .map((value) => Number(value) || 0);
  return parts.reduce((sum, value) => sum + value, 0);
};

// برای کارمند اداری/خدماتی همان «عنوان وظیفه»ای که در فرم پر می‌شود؛ برای استاد
// اسمِ صنف(های)ی که «نگران» آن است — از تعریفِ نگران در مرکز آموزش مکتب گرفته
// می‌شود (SchoolClass.homeroomTeacherUserId)، نه یک فیلدِ جداگانه در این فرم.
const roleOrJobLabel = (item, homeroomClassTitlesByUserId) => {
  const position = item?.employmentInfo?.position;
  if (position === 'admin_staff' || position === 'support_staff') {
    const job = trimValue(item?.employmentInfo?.jobTitle);
    const dept = trimValue(item?.employmentInfo?.department);
    return displayText([job, dept].filter(Boolean).join(' — ')) || '—';
  }
  if (position === 'teacher') {
    const linkedUserId = trimValue(item?.linkedUserId?._id || item?.linkedUserId);
    const titles = linkedUserId ? (homeroomClassTitlesByUserId?.get(linkedUserId) || []) : [];
    return titles.length ? `نگرانِ صنف: ${displayText(titles.join('، '))}` : '—';
  }
  return '—';
};


const SchoolStaffList = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  // R2 — معاش/حساب بانکی برای ریاست عمومی، مدیر مکتب، و مدیریتِ مالی قابل مشاهده
  // است (بقیه — مدیر تدریسی/سر معلم — نمی‌بینند).
  const adminLevel = useMemo(() => readAdminLevel(), []);
  const canSeeFinance = useMemo(
    () => ['general_president', 'school_manager', 'finance_manager', 'finance_lead'].includes(adminLevel),
    [adminLevel]
  );
  // مدیریتِ مالی حقِ ثبتِ کارمندِ تازه، تغییرِ وضعیت، یا ورودِ گروهی ندارد — فقط
  // فهرست را می‌بیند تا با «ویرایش» به بخشِ مالیِ یک پروندهٔ موجود برسد.
  const isFinanceOnlyRole = adminLevel === 'finance_manager' || adminLevel === 'finance_lead';

  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [schoolContext, setSchoolContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [positionFilter, setPositionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const importInputRef = useRef(null);

  useEffect(() => {
    const loadContext = async () => {
      setContextLoading(true);
      try {
        const context = await resolveActiveSchoolContext();
        setSchoolContext(context);
        if (context?.schoolId) setSchoolId(context.schoolId);
      } catch (error) {
        toastRef.current.error(displayText(error?.message || 'دریافت اطلاعات مکتب فعال ناموفق بود.'));
      } finally {
        setContextLoading(false);
      }
    };
    loadContext();
  }, []);

  // «نگرانِ صنف» برای هر استاد از همین‌جا خوانده می‌شود — همان تعریفِ نگران که در
  // «مرکز آموزش مکتب» روی هر صنف ثبت می‌شود (SchoolClass.homeroomTeacherUserId)،
  // نه یک فیلدِ جداگانه در فرمِ ثبتِ کارمند. اختیاری است: اگر نگرفت، فقط «—» می‌ماند.
  const [homeroomClassesByUserId, setHomeroomClassesByUserId] = useState(() => new Map());

  useEffect(() => {
    if (!schoolId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchJson(`/api/education/school-classes?schoolId=${encodeURIComponent(schoolId)}&status=active`);
        if (cancelled) return;
        const map = new Map();
        (response?.items || []).forEach((cls) => {
          const uid = trimValue(cls?.homeroomTeacherUserId);
          const title = displayText(trimValue(cls?.title) || [cls?.gradeLevel, cls?.section].filter(Boolean).join(' '));
          if (!uid || !title) return;
          const list = map.get(uid) || [];
          list.push(title);
          map.set(uid, list);
        });
        setHomeroomClassesByUserId(map);
      } catch {
        setHomeroomClassesByUserId(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId]);

  const loadStaff = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('schoolId', schoolId);
      params.set('limit', '200');
      if (positionFilter) params.set('position', positionFilter);
      // همیشه فرستاده می‌شود، حتی وقتی خالی است («همهٔ وضعیت‌ها») — چون نبودِ این
      // پارامتر یعنی مقدارِ پیش‌فرضِ سرور (فقط «فعال»)، نه «بدون فیلتر».
      params.set('status', statusFilter);
      if (appliedSearch) params.set('search', appliedSearch);
      const response = await fetchJson(`/api/afghan-teachers/?${params.toString()}`);
      setRows(Array.isArray(response?.teachers) ? response.teachers : []);
      setTotal(Number(response?.pagination?.total) || (response?.teachers || []).length);
    } catch (error) {
      const message = displayText(error?.message || 'بارگذاری فهرست کارکنان ناموفق بود.');
      setLoadError(message);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [schoolId, positionFilter, statusFilter, appliedSearch]);

  useEffect(() => {
    if (!contextLoading) loadStaff();
  }, [contextLoading, loadStaff]);

  const summary = useMemo(() => {
    const byPosition = rows.reduce((acc, item) => {
      const key = item?.employmentInfo?.position || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return {
      shown: rows.length,
      teachers: byPosition.teacher || 0,
      nonTeaching: (byPosition.admin_staff || 0) + (byPosition.support_staff || 0),
      leadership: (byPosition.principal || 0) + (byPosition.vice_principal || 0)
    };
  }, [rows]);

  // نام، سمت، وظیفه/مضامین، کد کارمندی، وضعیت، حساب ورود، ویرایش (+ معاش فقط برای ریاست عمومی)
  const columnCount = canSeeFinance ? 8 : 7;

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setAppliedSearch(trimValue(searchInput));
  };

  const DEPARTED_STATUSES = new Set(['inactive', 'terminated', 'retired']);

  const handleStatusChange = async (item, nextStatus) => {
    if (!nextStatus || nextStatus === item.status) return;
    if (DEPARTED_STATUSES.has(nextStatus)) {
      const label = STATUS_LABELS[nextStatus] || nextStatus;
      // eslint-disable-next-line no-alert
      if (!window.confirm(`وضعیتِ «${staffFullName(item)}» به «${label}» تغییر کند؟ اگر پیشکیِ بازِ تسویه‌نشده داشته باشد، سیستم اجازه نمی‌دهد.`)) {
        return;
      }
    }
    setSavingId(item._id);
    try {
      await fetchJson(`/api/afghan-teachers/${item._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      toastRef.current.success('وضعیت به‌روزرسانی شد.');
      loadStaff();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'به‌روزرسانی وضعیت ناموفق بود.'));
    } finally {
      setSavingId('');
    }
  };

  const goToRegistration = () => {
    window.location.assign('/teacher-registration');
  };

  const handleTemplateDownload = async () => {
    try {
      const { blob, filename } = await fetchBlob('/api/afghan-teachers/bulk-import/template', {}, { method: 'GET' });
      downloadBlob(blob, filename || 'staff-import-template.xlsx');
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'دانلودِ قالب ناموفق بود.'));
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toastRef.current.error('اول یک فایلِ .xlsx انتخاب کنید.');
      return;
    }
    if (!schoolId) {
      toastRef.current.error('مکتب فعال مشخص نیست.');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const form = new FormData();
      form.append('file', importFile);
      form.append('schoolId', schoolId);
      const response = await postForm('/api/afghan-teachers/bulk-import', form);
      const data = response?.data || response || {};
      setImportResult(data);
      const okCount = data?.summary?.successful || 0;
      const failCount = data?.summary?.failed || 0;
      if (okCount) toastRef.current.success(`${okCount.toLocaleString('fa-AF')} کارمند ثبت شد.`);
      if (failCount && !okCount) toastRef.current.error(`هیچ ردیفی ثبت نشد؛ ${failCount.toLocaleString('fa-AF')} خطا.`);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
      if (okCount) loadStaff();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'وارد کردنِ اکسل ناموفق بود.'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="staff-list">
      <div className="staff-list-inner">
        <div className="staff-list-hero">
          <div className="staff-list-hero-text">
            <h1>کارکنان مکتب</h1>
            <p>
              فهرست پروندهٔ رسمی استادان و کارمندان اداری/خدماتی مکتب فعال.
              {schoolContext?.school ? ` — ${displayText(schoolContext.school.nameDari || schoolContext.school.name || 'مکتب')}` : ''}
            </p>
          </div>
          {!isFinanceOnlyRole && (
            <button type="button" onClick={goToRegistration} className="staff-btn-add">+ ثبت کارمندِ جدید</button>
          )}
        </div>

        <div className="staff-list-kpis">
          <div className="staff-kpi">
            <div className="staff-kpi-label">نمایش داده‌شده</div>
            <div className="staff-kpi-value">{summary.shown.toLocaleString('fa-AF')}</div>
          </div>
          <div className="staff-kpi">
            <div className="staff-kpi-label">استاد</div>
            <div className="staff-kpi-value">{summary.teachers.toLocaleString('fa-AF')}</div>
          </div>
          <div className="staff-kpi">
            <div className="staff-kpi-label">اداری/خدماتی</div>
            <div className="staff-kpi-value">{summary.nonTeaching.toLocaleString('fa-AF')}</div>
          </div>
          <div className="staff-kpi">
            <div className="staff-kpi-label">مدیر/معاون</div>
            <div className="staff-kpi-value">{summary.leadership.toLocaleString('fa-AF')}</div>
          </div>
        </div>

        <div className="staff-list-card">
          <form onSubmit={handleSearchSubmit} className="staff-toolbar-form">
            <div className="staff-toolbar-field">
              <label htmlFor="positionFilter">سمت</label>
              <select id="positionFilter" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
                {POSITION_FILTER_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="staff-toolbar-field">
              <label htmlFor="statusFilter">وضعیت</label>
              <select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                {STATUS_FILTER_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="staff-toolbar-field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="staffSearch">جستجو (نام، تذکره، کد کارمندی)</label>
              <input id="staffSearch" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="تایپ کنید و «جستجو» را بزنید..." />
            </div>
            <button type="submit" className="staff-btn-search">جستجو</button>
          </form>
        </div>

        {loadError && (
          <div role="alert" className="staff-list-error">{loadError}</div>
        )}

        {!isFinanceOnlyRole && (
        <details className="staff-import">
          <summary>ورودِ گروهی از اکسل</summary>
          <div className="staff-import-body">
            <p>
              قالب را دانلود کنید، ردیف‌ها را پر کنید (هر ردیف یک کارمند، حداکثر ۵۰ ردیف)، سپس فایل را بارگذاری کنید.
              ستون‌های الزامی و مقادیرِ مجاز در برگهٔ «راهنما» است. سمتِ تدریسی به اطلاعاتِ تحصیلی نیاز دارد؛ کارمندِ اداری/خدماتی خیر.
            </p>
            <div className="staff-import-actions">
              <button type="button" onClick={handleTemplateDownload} className="staff-btn-ghost">دانلودِ قالبِ اکسل</button>
              <input
                ref={importInputRef}
                type="file"
                accept=".xlsx"
                onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
              />
              <button type="button" onClick={handleImport} disabled={importing || !importFile} className="staff-btn-solid">
                {importing ? 'در حال پردازش...' : 'بارگذاری و ثبت'}
              </button>
            </div>
            {importResult && (
              <div className="staff-import-result">
                <div className="staff-import-summary">
                  مجموع {Number(importResult?.summary?.total || 0).toLocaleString('fa-AF')} ردیف —
                  <span className="staff-import-ok"> {Number(importResult?.summary?.successful || 0).toLocaleString('fa-AF')} ثبت‌شده</span> ·
                  <span className="staff-import-fail"> {Number(importResult?.summary?.failed || 0).toLocaleString('fa-AF')} خطا</span>
                </div>
                {Array.isArray(importResult?.failed) && importResult.failed.length > 0 && (
                  <ul className="staff-import-errors">
                    {importResult.failed.map((row) => (
                      <li key={`imp-fail-${row.row}`}>سطر {Number(row.row).toLocaleString('fa-AF')} — {row.label ? `${row.label}: ` : ''}{displayText(row.error)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </details>
        )}

        <div className="staff-list-card">
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>نام</th>
                  <th>سمت</th>
                  <th>وظیفه / نگرانیِ صنف</th>
                  <th>کد کارمندی</th>
                  {canSeeFinance && <th>مجموع معاش</th>}
                  <th>وضعیت</th>
                  <th>حساب ورود</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columnCount} className="staff-table-empty">در حال بارگذاری...</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={columnCount} className="staff-table-empty">کارمندی با این فیلترها پیدا نشد.</td></tr>
                ) : (
                  rows.map((item) => {
                    const position = item?.employmentInfo?.position;
                    const linked = Boolean(item?.linkedUserId?._id || item?.linkedUserId);
                    return (
                      <tr key={item._id}>
                        <td className="staff-name-cell">
                          {staffFullName(item)}
                          {item.isOwner && <span className="staff-owner-badge">owner</span>}
                        </td>
                        <td><span className="staff-position-badge">{POSITION_LABELS[position] || position || '—'}</span></td>
                        <td>{roleOrJobLabel(item, homeroomClassesByUserId)}</td>
                        <td>{displayText(item?.employmentInfo?.employeeId) || '—'}</td>
                        {canSeeFinance && <td>{salaryTotalOf(item).toLocaleString('fa-AF')}</td>}
                        <td>
                          <select
                            value={item?.status || 'active'}
                            disabled={savingId === item._id || isFinanceOnlyRole}
                            onChange={(e) => handleStatusChange(item, e.target.value)}
                            className="staff-status-select"
                          >
                            {STATUS_CHANGE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td>{linked ? 'دارد' : '—'}</td>
                        <td>
                          <button
                            type="button"
                            onClick={() => window.location.assign(`/teacher-registration/${item._id}`)}
                            className="staff-edit-btn"
                          >
                            ویرایش
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {total > rows.length && (
            <p className="staff-table-note">
              {total.toLocaleString('fa-AF')} پرونده مطابقت دارد؛ {rows.length.toLocaleString('fa-AF')} مورد نمایش داده شد. برای دیدن بقیه، فیلتر یا جستجو را دقیق‌تر کنید.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SchoolStaffList;
