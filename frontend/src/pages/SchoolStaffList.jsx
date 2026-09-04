import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/ui/toast';
import {
  DEFAULT_SCHOOL_ID,
  fetchJson,
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

  const goToRegistration = () => {
    window.location.assign('/teacher-registration');
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
                      <td style={{ padding: '10px 12px' }}>{STATUS_LABELS[item?.status] || item?.status || '—'}</td>
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
