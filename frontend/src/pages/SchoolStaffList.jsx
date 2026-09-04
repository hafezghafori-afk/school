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
import './AfghanSchoolManagement.css';

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
  { value: 'active', label: 'فعال' },
  { value: 'on_leave', label: 'رخصتی' },
  { value: 'suspended', label: 'معطل' },
  { value: 'terminated', label: 'منفک' },
  { value: 'retired', label: 'متقاعد' },
  { value: 'inactive', label: 'غیرفعال' },
  { value: '', label: 'همهٔ وضعیت‌ها' }
];

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

const roleOrJobLabel = (item) => {
  const position = item?.employmentInfo?.position;
  if (position === 'admin_staff' || position === 'support_staff') {
    const job = trimValue(item?.employmentInfo?.jobTitle);
    const dept = trimValue(item?.employmentInfo?.department);
    return displayText([job, dept].filter(Boolean).join(' — ')) || '—';
  }
  const subjects = Array.isArray(item?.employmentInfo?.subjects)
    ? item.employmentInfo.subjects.map((s) => s?.subjectName).filter(Boolean)
    : [];
  return subjects.length ? displayText(subjects.join('، ')) : '—';
};

const SchoolStaffList = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

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

  const loadStaff = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      params.set('schoolId', schoolId);
      params.set('limit', '200');
      if (positionFilter) params.set('position', positionFilter);
      if (statusFilter) params.set('status', statusFilter);
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
    <div className="school-management" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '40px auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ color: '#2c3e50', margin: 0 }}>کارکنان مکتب</h2>
            <p style={{ color: '#666', marginTop: 6, marginBottom: 0 }}>
              فهرست پروندهٔ رسمی استادان و کارمندان اداری/خدماتی مکتب فعال.
              {schoolContext?.school ? ` — ${displayText(schoolContext.school.nameDari || schoolContext.school.name || 'مکتب')}` : ''}
            </p>
          </div>
          <button type="button" onClick={goToRegistration} style={{ background: '#3498db', color: 'white', border: 0, borderRadius: 8, padding: '10px 18px', cursor: 'pointer' }}>
            + ثبت کارمندِ جدید
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '20px 0' }}>
          <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#888' }}>نمایش داده‌شده</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2c3e50' }}>{summary.shown.toLocaleString('fa-AF')}</div>
          </div>
          <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#888' }}>استاد</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2c3e50' }}>{summary.teachers.toLocaleString('fa-AF')}</div>
          </div>
          <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#888' }}>اداری/خدماتی</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2c3e50' }}>{summary.nonTeaching.toLocaleString('fa-AF')}</div>
          </div>
          <div style={{ background: '#f5f8fb', borderRadius: 8, padding: '10px 16px', minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#888' }}>مدیر/معاون</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#2c3e50' }}>{summary.leadership.toLocaleString('fa-AF')}</div>
          </div>
        </div>

        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="positionFilter">سمت</label>
            <select id="positionFilter" value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)}>
              {POSITION_FILTER_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="statusFilter">وضعیت</label>
            <select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_FILTER_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            <label htmlFor="staffSearch">جستجو (نام، تذکره، کد کارمندی)</label>
            <input id="staffSearch" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="تایپ کنید و «جستجو» را بزنید..." />
          </div>
          <button type="submit" style={{ padding: '10px 18px', borderRadius: 8, border: 0, background: '#2c3e50', color: 'white', cursor: 'pointer' }}>جستجو</button>
        </form>

        {loadError && (
          <div className="student-registration-submit-status error" role="alert" style={{ marginBottom: 12 }}>{loadError}</div>
        )}

        <details style={{ border: '1px solid #eef2f6', borderRadius: 8, padding: '12px 16px', marginBottom: 16, background: '#fbfcfe' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#2c3e50' }}>ورودِ گروهی از اکسل</summary>
          <p style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
            قالب را دانلود کنید، ردیف‌ها را پر کنید (هر ردیف یک کارمند، حداکثر ۵۰ ردیف)، سپس فایل را بارگذاری کنید.
            ستون‌های الزامی و مقادیرِ مجاز در برگهٔ «راهنما» است. سمتِ تدریسی به اطلاعاتِ تحصیلی نیاز دارد؛ کارمندِ اداری/خدماتی خیر.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" onClick={handleTemplateDownload} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #3498db', background: 'white', color: '#3498db', cursor: 'pointer' }}>
              دانلودِ قالبِ اکسل
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
            />
            <button type="button" onClick={handleImport} disabled={importing || !importFile} style={{ padding: '8px 14px', borderRadius: 8, border: 0, background: importing || !importFile ? '#9db8cc' : '#2c3e50', color: 'white', cursor: importing || !importFile ? 'default' : 'pointer' }}>
              {importing ? 'در حال پردازش...' : 'بارگذاری و ثبت'}
            </button>
          </div>
          {importResult && (
            <div style={{ marginTop: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                مجموع {Number(importResult?.summary?.total || 0).toLocaleString('fa-AF')} ردیف —
                <span style={{ color: '#2e7d32' }}> {Number(importResult?.summary?.successful || 0).toLocaleString('fa-AF')} ثبت‌شده</span> ·
                <span style={{ color: '#c62828' }}> {Number(importResult?.summary?.failed || 0).toLocaleString('fa-AF')} خطا</span>
              </div>
              {Array.isArray(importResult?.failed) && importResult.failed.length > 0 && (
                <ul style={{ margin: 0, paddingInlineStart: 18, color: '#c62828' }}>
                  {importResult.failed.map((row) => (
                    <li key={`imp-fail-${row.row}`}>سطر {Number(row.row).toLocaleString('fa-AF')} — {row.label ? `${row.label}: ` : ''}{displayText(row.error)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>

        <div style={{ overflowX: 'auto', border: '1px solid #eef2f6', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f5f8fb', textAlign: 'right' }}>
                <th style={{ padding: '10px 12px' }}>نام</th>
                <th style={{ padding: '10px 12px' }}>سمت</th>
                <th style={{ padding: '10px 12px' }}>وظیفه / مضامین</th>
                <th style={{ padding: '10px 12px' }}>کد کارمندی</th>
                <th style={{ padding: '10px 12px' }}>مجموع معاش</th>
                <th style={{ padding: '10px 12px' }}>وضعیت</th>
                <th style={{ padding: '10px 12px' }}>حساب ورود</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888' }}>در حال بارگذاری...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#888' }}>کارمندی با این فیلترها پیدا نشد.</td></tr>
              ) : (
                rows.map((item) => {
                  const position = item?.employmentInfo?.position;
                  const linked = Boolean(item?.linkedUserId?._id || item?.linkedUserId);
                  return (
                    <tr key={item._id} style={{ borderTop: '1px solid #eef2f6' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {staffFullName(item)}
                        {item.isOwner && <span style={{ marginRight: 6, fontSize: 11, background: '#fff4e0', color: '#b26a00', borderRadius: 4, padding: '1px 6px' }}>owner</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{POSITION_LABELS[position] || position || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{roleOrJobLabel(item)}</td>
                      <td style={{ padding: '10px 12px' }}>{displayText(item?.employmentInfo?.employeeId) || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{salaryTotalOf(item).toLocaleString('fa-AF')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <select
                          value={item?.status || 'active'}
                          disabled={savingId === item._id}
                          onChange={(e) => handleStatusChange(item, e.target.value)}
                          style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d7dee6' }}
                        >
                          {STATUS_FILTER_OPTIONS.filter((opt) => opt.value).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{linked ? 'دارد' : '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > rows.length && (
          <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
            {total.toLocaleString('fa-AF')} پرونده مطابقت دارد؛ {rows.length.toLocaleString('fa-AF')} مورد نمایش داده شد. برای دیدن بقیه، فیلتر یا جستجو را دقیق‌تر کنید.
          </p>
        )}
      </div>
    </div>
  );
};

export default SchoolStaffList;
