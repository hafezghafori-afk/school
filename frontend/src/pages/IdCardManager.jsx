import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../components/ui/toast';
import {
  DEFAULT_SCHOOL_ID,
  fetchJson,
  postJson,
  readStoredSchoolId,
  repairDisplayText,
  resolveActiveSchoolContext
} from './adminWorkspaceUtils';
import { formatAfghanStoredDateLabel } from '../utils/afghanDate';
import './IdCardManager.css';

const trimValue = (value) => String(value || '').trim();
const displayText = (value) => repairDisplayText(value);

const TABS = [
  { key: 'student', label: 'شاگردان', ownerType: 'student' },
  { key: 'teacher', label: 'استادان', ownerType: 'personnel' },
  { key: 'staff', label: 'کارمندان', ownerType: 'personnel' }
];

const CARD_STATUS_LABELS = {
  missing: 'ندارد',
  active: 'فعال',
  lost: 'گم‌شده',
  revoked: 'باطل',
  expired: 'منقضی',
  reissued: 'صادرشدهٔ مجدد'
};
const CARD_STATUS_CLASS = {
  missing: 'idm-badge-missing',
  active: 'idm-badge-active',
  lost: 'idm-badge-warn',
  revoked: 'idm-badge-danger',
  expired: 'idm-badge-warn',
  reissued: 'idm-badge-active'
};

const personName = (item) => {
  const dari = [item?.personalInfo?.firstNameDari, item?.personalInfo?.lastNameDari].filter(Boolean).join(' ');
  const latin = [item?.personalInfo?.firstName, item?.personalInfo?.lastName].filter(Boolean).join(' ');
  return displayText(dari || latin || 'بدون نام');
};

const personSubLabel = (item, tabKey) => {
  if (tabKey === 'student') {
    const grade = trimValue(item?.academicInfo?.currentGrade).replace(/^grade/, '');
    const section = trimValue(item?.academicInfo?.currentSection);
    return displayText([grade ? `صنف ${grade}` : '', section].filter(Boolean).join(' — ')) || '—';
  }
  if (tabKey === 'teacher') {
    return displayText((item?.employmentInfo?.subjects || []).map((s) => s?.subjectName).filter(Boolean).join('، ')) || '—';
  }
  return displayText([item?.employmentInfo?.jobTitle, item?.employmentInfo?.department].filter(Boolean).join(' — ')) || '—';
};

const personIdValue = (item, tabKey) => (tabKey === 'student' ? item?.asasNumber : item?.employmentInfo?.employeeId) || '—';

const IdCardManager = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [schoolContext, setSchoolContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('student');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [editing, setEditing] = useState(null); // { row, card }
  const [editForm, setEditForm] = useState({ expiryDate: '', status: 'active', notesForCard: '' });
  const [reissueReason, setReissueReason] = useState('');
  const [saving, setSaving] = useState(false);

  const tab = useMemo(() => TABS.find((t) => t.key === activeTab) || TABS[0], [activeTab]);

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

  const loadRows = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setLoadError('');
    setSelectedIds(new Set());
    try {
      const params = new URLSearchParams();
      params.set('schoolId', schoolId);
      params.set('limit', '300');
      params.set('status', 'active');
      if (appliedSearch) params.set('search', appliedSearch);

      let list = [];
      if (tab.ownerType === 'student') {
        const response = await fetchJson(`/api/afghan-students?${params.toString()}`);
        list = Array.isArray(response?.students) ? response.students : [];
      } else {
        if (activeTab === 'teacher') params.set('position', 'teacher');
        const response = await fetchJson(`/api/afghan-teachers/?${params.toString()}`);
        const all = Array.isArray(response?.teachers) ? response.teachers : [];
        list = activeTab === 'staff' ? all.filter((t) => t?.employmentInfo?.position !== 'teacher') : all;
      }

      const ids = list.map((item) => item._id).filter(Boolean);
      let cardByOwner = new Map();
      if (ids.length) {
        const cardsResponse = await fetchJson(`/api/id-cards?ownerType=${tab.ownerType}&ids=${ids.join(',')}`);
        cardByOwner = new Map((cardsResponse?.data || []).map((c) => [String(c.ownerId), c]));
      }

      setRows(list.map((item) => {
        const card = cardByOwner.get(String(item._id)) || null;
        return { item, card, cardStatus: card ? card.status : 'missing' };
      }));
    } catch (error) {
      setLoadError(displayText(error?.message || 'بارگذاری فهرست ناموفق بود.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId, tab, activeTab, appliedSearch]);

  useEffect(() => {
    if (!contextLoading) loadRows();
  }, [contextLoading, loadRows]);

  const visibleRows = useMemo(
    () => (statusFilter ? rows.filter((r) => r.cardStatus === statusFilter) : rows),
    [rows, statusFilter]
  );

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setAppliedSearch(trimValue(searchInput));
  };

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (
      prev.size === visibleRows.length
        ? new Set()
        : new Set(visibleRows.map((r) => r.item._id))
    ));
  };

  const issueCard = async (ownerId) => {
    try {
      await fetchJson(`/api/id-cards/${tab.ownerType}/${ownerId}`);
      toastRef.current.success('کارتِ هویت صادر شد.');
      loadRows();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'صدورِ کارت ناموفق بود.'));
    }
  };

  const openPrint = (ids, mode) => {
    const url = `/id-cards/print?type=${tab.ownerType}&ids=${ids.join(',')}&mode=${mode}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openEdit = (row) => {
    setEditing(row);
    setReissueReason('');
    setEditForm({
      expiryDate: row.card?.expiryDate ? String(row.card.expiryDate).slice(0, 10) : '',
      status: row.card?.status || 'active',
      notesForCard: row.card?.notesForCard || ''
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await postJson(`/api/id-cards/${tab.ownerType}/${editing.item._id}`, editForm, { method: 'PUT' });
      toastRef.current.success('کارتِ هویت به‌روزرسانی شد.');
      setEditing(null);
      loadRows();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'به‌روزرسانی ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const reissue = async () => {
    if (!editing) return;
    if (!trimValue(reissueReason)) {
      toastRef.current.error('دلیلِ صدورِ مجدد را وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      await postJson(`/api/id-cards/${tab.ownerType}/${editing.item._id}/reissue`, { reason: reissueReason });
      toastRef.current.success('کارتِ هویت به‌صورتِ مجدد صادر شد.');
      setEditing(null);
      loadRows();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'صدورِ مجدد ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => ({
    shown: rows.length,
    active: rows.filter((r) => r.cardStatus === 'active').length,
    missing: rows.filter((r) => r.cardStatus === 'missing').length,
    issues: rows.filter((r) => ['lost', 'revoked', 'expired'].includes(r.cardStatus)).length
  }), [rows]);

  return (
    <div className="idm-page">
      <div className="idm-inner">
        <div className="idm-hero">
          <div className="idm-hero-text">
            <h1>کارت‌های هویت</h1>
            <p>
              مدیریت، صدور و چاپِ کارتِ هویتِ شاگردان، استادان و کارمندان.
              {schoolContext?.school ? ` — ${displayText(schoolContext.school.nameDari || schoolContext.school.name || 'مکتب')}` : ''}
            </p>
          </div>
        </div>

        <div className="idm-kpis">
          <div className="idm-kpi"><div className="idm-kpi-label">نمایش داده‌شده</div><div className="idm-kpi-value">{summary.shown.toLocaleString('fa-AF')}</div></div>
          <div className="idm-kpi"><div className="idm-kpi-label">کارتِ فعال</div><div className="idm-kpi-value">{summary.active.toLocaleString('fa-AF')}</div></div>
          <div className="idm-kpi"><div className="idm-kpi-label">بدونِ کارت</div><div className="idm-kpi-value">{summary.missing.toLocaleString('fa-AF')}</div></div>
          <div className="idm-kpi"><div className="idm-kpi-label">نیازمندِ پیگیری</div><div className="idm-kpi-value">{summary.issues.toLocaleString('fa-AF')}</div></div>
        </div>

        <div className="idm-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" className={t.key === activeTab ? 'idm-tab idm-tab-active' : 'idm-tab'} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="idm-card">
          <form onSubmit={handleSearchSubmit} className="idm-toolbar-form">
            <div className="idm-field">
              <label htmlFor="cardStatusFilter">وضعیتِ کارت</label>
              <select id="cardStatusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">همه</option>
                {Object.entries(CARD_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div className="idm-field" style={{ flex: 1, minWidth: 220 }}>
              <label htmlFor="idmSearch">جستجو</label>
              <input id="idmSearch" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="نام یا نمبر" />
            </div>
            <button type="submit" className="idm-btn-search">جستجو</button>
          </form>

          {loadError && <div role="alert" className="idm-error">{loadError}</div>}

          <div className="idm-actions">
            <span>{selectedIds.size.toLocaleString('fa-AF')} انتخاب‌شده</span>
            <button type="button" disabled={!selectedIds.size} onClick={() => openPrint([...selectedIds], 'batch')}>چاپِ دسته‌جمعی</button>
          </div>

          <div className="idm-table-wrap">
            <table className="idm-table">
              <thead>
                <tr>
                  <th><input type="checkbox" checked={!!visibleRows.length && selectedIds.size === visibleRows.length} onChange={toggleSelectAll} /></th>
                  <th>نام</th>
                  <th>{activeTab === 'student' ? 'صنف' : (activeTab === 'teacher' ? 'مضمون' : 'سمت')}</th>
                  <th>{activeTab === 'student' ? 'نمبر اساس' : 'نمبر کارمند'}</th>
                  <th>وضعیتِ کارت</th>
                  <th>اعتبار تا</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="idm-table-empty">در حال بارگذاری...</td></tr>
                ) : !visibleRows.length ? (
                  <tr><td colSpan={7} className="idm-table-empty">کسی با این فیلترها پیدا نشد.</td></tr>
                ) : visibleRows.map((row) => (
                  <tr key={row.item._id}>
                    <td><input type="checkbox" checked={selectedIds.has(row.item._id)} onChange={() => toggleSelected(row.item._id)} /></td>
                    <td className="idm-name-cell">{personName(row.item)}</td>
                    <td>{personSubLabel(row.item, activeTab)}</td>
                    <td>{personIdValue(row.item, activeTab)}</td>
                    <td><span className={`idm-badge ${CARD_STATUS_CLASS[row.cardStatus] || ''}`}>{CARD_STATUS_LABELS[row.cardStatus] || row.cardStatus}</span></td>
                    <td>{row.card?.expiryDate ? formatAfghanStoredDateLabel(row.card.expiryDate) : '—'}</td>
                    <td className="idm-row-actions">
                      {row.cardStatus === 'missing' ? (
                        <button type="button" onClick={() => issueCard(row.item._id)}>صدورِ کارت</button>
                      ) : (
                        <>
                          <button type="button" onClick={() => openEdit(row)}>ویرایش</button>
                          <button type="button" onClick={() => openPrint([row.item._id], 'single')}>چاپ</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <div className="idm-modal-overlay" onClick={() => setEditing(null)}>
          <div className="idm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>ویرایشِ کارتِ هویت — {personName(editing.item)}</h2>
            <p className="idm-modal-serial">سریال: {editing.card?.serial || '—'}</p>

            <label className="idm-modal-field">
              اعتبار تا
              <input type="date" value={editForm.expiryDate} onChange={(e) => setEditForm((f) => ({ ...f, expiryDate: e.target.value }))} />
            </label>
            <label className="idm-modal-field">
              وضعیت
              <select value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="active">فعال</option>
                <option value="lost">گم‌شده</option>
                <option value="revoked">باطل</option>
                <option value="expired">منقضی</option>
              </select>
            </label>
            <label className="idm-modal-field">
              یادداشت
              <textarea rows={2} value={editForm.notesForCard} onChange={(e) => setEditForm((f) => ({ ...f, notesForCard: e.target.value }))} />
            </label>

            <div className="idm-modal-buttons">
              <button type="button" className="idm-btn-primary" disabled={saving} onClick={saveEdit}>ذخیره</button>
              <button type="button" onClick={() => setEditing(null)}>انصراف</button>
            </div>

            <hr />
            <p className="idm-modal-hint">صدورِ مجدد — برایِ کارتِ گم‌شده یا خراب (سریالِ تازه می‌سازد و شمارندهٔ صدورِ مجدد را بالا می‌برد):</p>
            <label className="idm-modal-field">
              دلیل
              <input value={reissueReason} onChange={(e) => setReissueReason(e.target.value)} placeholder="مثلاً: کارت گم شده" />
            </label>
            <div className="idm-modal-buttons">
              <button type="button" className="idm-btn-danger" disabled={saving} onClick={reissue}>صدورِ مجدد</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IdCardManager;
