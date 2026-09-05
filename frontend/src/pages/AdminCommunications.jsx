import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../components/ui/toast';
import {
  DEFAULT_SCHOOL_ID,
  fetchJson,
  postJson,
  readStoredSchoolId,
  repairDisplayText,
  resolveActiveSchoolContext
} from './adminWorkspaceUtils';
import './AdminCommunications.css';

const displayText = (value) => repairDisplayText(value);
const trimValue = (value) => String(value || '').trim();

// همان ۵ سطحی که بک‌اند (adminMessageService.SEND_LEVELS) اجازهٔ ارسال می‌دهد —
// اینجا فقط برای نمایش/پنهان‌کردنِ فرم‌های ترکیب است؛ اجرای واقعی سمتِ سرور است.
const SEND_LEVELS = new Set(['general_president', 'school_manager', 'academic_manager', 'finance_manager', 'head_teacher']);

const readAdminLevel = () => {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem('adminLevel') || window.localStorage.getItem('orgRole') || '').trim();
  } catch {
    return '';
  }
};
const readUserId = () => {
  if (typeof window === 'undefined') return '';
  try {
    return String(window.localStorage.getItem('userId') || '').trim();
  } catch {
    return '';
  }
};

const TYPE_LABELS = { demo: 'درخواستِ دمو', contact: 'پیامِ تماس', suggestion: 'پیشنهاد', complaint: 'انتقاد/شکایت' };
const INBOX_STATUS_LABELS = { new: 'خوانده‌نشده', read: 'خوانده‌شده', archived: 'بایگانی' };
const TASK_STATUS_LABELS = { new: 'جدید', in_progress: 'در حالِ انجام', on_hold: 'معلق', done: 'انجام‌شده' };
const ROLE_OPTIONS = [
  { value: 'student', label: 'شاگردان' },
  { value: 'parent', label: 'والدین/سرپرستان' },
  { value: 'instructor', label: 'استادان' },
  { value: 'head_teacher', label: 'سرمعلمان' },
  { value: 'academic_manager', label: 'مدیرانِ تدریسی' },
  { value: 'school_manager', label: 'مدیرانِ مکتب' },
  { value: 'finance_manager', label: 'مدیرانِ مالی' },
  { value: 'finance_lead', label: 'آمریتِ مالی' },
  { value: 'general_president', label: 'ریاستِ عمومی' }
];

const TABS = [
  { key: 'inbox', label: 'صندوقِ ورودی' },
  { key: 'announce', label: 'اعلانِ همگانی' },
  { key: 'tasks', label: 'وظایف' },
  { key: 'archive', label: 'بایگانی' }
];

const toDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('fa-AF-u-ca-persian', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
};

// ---------------------------------------------------------------------------
// جستجو/انتخابِ کاربر — هم برای «فردِ مشخص» در اعلان، هم برای گیرندهٔ وظیفه.
// ---------------------------------------------------------------------------
const PersonPicker = ({ picked, onAdd, onRemove, placeholder }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = trimValue(query);
    if (!q) { setResults([]); return undefined; }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetchJson(`/api/admin-messages/user-search?q=${encodeURIComponent(q)}`);
        setResults(res?.items || []);
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const pickedIds = new Set(picked.map((p) => p._id));

  return (
    <div>
      <div className="comms-pick-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || 'نام یا ایمیل را تایپ کنید...'}
        />
        {open && results.length > 0 && (
          <div className="comms-pick-results">
            {results.filter((r) => !pickedIds.has(r._id)).map((r) => (
              <div key={r._id} className="comms-pick-row" onMouseDown={() => { onAdd(r); setQuery(''); setResults([]); }}>
                <span>{displayText(r.name) || 'بدون نام'}</span>
                <small>{r.roleLabel || r.orgRole} {r.email ? `· ${r.email}` : ''}</small>
              </div>
            ))}
          </div>
        )}
      </div>
      {picked.length > 0 && (
        <div className="comms-picked">
          {picked.map((p) => (
            <span key={p._id} className="comms-picked-chip">
              {displayText(p.name) || 'بدون نام'}
              <button type="button" onClick={() => onRemove(p._id)}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminCommunications = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = TABS.some((t) => t.key === searchParams.get('tab')) ? searchParams.get('tab') : 'inbox';
  const setActiveTab = (key) => setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('tab', key); return next; });

  const adminLevel = useMemo(() => readAdminLevel(), []);
  const myUserId = useMemo(() => readUserId(), []);
  const canSend = SEND_LEVELS.has(adminLevel);

  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [schoolContext, setSchoolContext] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        setSchoolContext(context);
        if (context?.schoolId) setSchoolId(context.schoolId);
      } catch (error) {
        toastRef.current.error(displayText(error?.message || 'دریافتِ مکتبِ فعال ناموفق بود.'));
      }
    })();
  }, []);

  // ---- صندوقِ ورودی ----
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [inboxType, setInboxType] = useState('all');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [openReplyId, setOpenReplyId] = useState('');

  const loadInbox = useCallback(async () => {
    setInboxLoading(true);
    try {
      const res = await fetchJson('/api/contact/admin');
      setInboxItems(Array.isArray(res?.items) ? res.items : []);
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'دریافتِ پیام‌ها ناموفق بود.'));
    } finally {
      setInboxLoading(false);
    }
  }, []);

  useEffect(() => { loadInbox(); }, [loadInbox]);

  const visibleInboxItems = useMemo(() => {
    const q = trimValue(inboxSearch).toLowerCase();
    return inboxItems.filter((item) => {
      if ((item.status || 'new') === 'archived') return false;
      if (inboxType !== 'all' && (item.type || 'contact') !== inboxType) return false;
      if (!q) return true;
      const blob = `${item.name || ''} ${item.email || ''} ${item.phone || ''} ${item.message || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [inboxItems, inboxSearch, inboxType]);

  const archivedInboxItems = useMemo(() => inboxItems.filter((item) => item.status === 'archived'), [inboxItems]);

  const markRead = async (id) => {
    try {
      await fetchJson(`/api/contact/${id}/read`, { method: 'PUT' });
      loadInbox();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'خطا در بروزرسانیِ پیام.'));
    }
  };

  const archiveInboxItem = async (id) => {
    try {
      await fetchJson(`/api/contact/${id}/archive`, { method: 'PUT' });
      toastRef.current.success('پیام بایگانی شد.');
      loadInbox();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'بایگانی ناموفق بود.'));
    }
  };

  const unarchiveInboxItem = async (id) => {
    try {
      await fetchJson(`/api/contact/${id}/unarchive`, { method: 'PUT' });
      toastRef.current.success('پیام از بایگانی بازگردانده شد.');
      loadInbox();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'بازگردانی ناموفق بود.'));
    }
  };

  const sendReply = async (item) => {
    const body = trimValue(replyDrafts[item._id]);
    if (!body) { toastRef.current.error('متنِ پاسخ را بنویسید.'); return; }
    try {
      await postJson(`/api/contact/${item._id}/reply`, { body });
      toastRef.current.success('پاسخ ارسال شد.');
      setReplyDrafts((prev) => ({ ...prev, [item._id]: '' }));
      setOpenReplyId('');
      loadInbox();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'ارسالِ پاسخ ناموفق بود.'));
    }
  };

  // ---- اعلانِ همگانی ----
  const [classes, setClasses] = useState([]);
  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      try {
        const res = await fetchJson(`/api/education/school-classes?schoolId=${encodeURIComponent(schoolId)}&status=active`);
        setClasses(Array.isArray(res?.items) ? res.items : []);
      } catch {
        setClasses([]);
      }
    })();
  }, [schoolId]);

  const [annForm, setAnnForm] = useState({ title: '', body: '', scope: 'all', roles: [], classId: '', channels: ['bell'] });
  const [annPicked, setAnnPicked] = useState([]);
  const [annPreview, setAnnPreview] = useState(null);
  const [annSending, setAnnSending] = useState(false);
  const [announcements, setAnnouncements] = useState([]);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetchJson('/api/admin-messages?kind=announcement&status=active');
      setAnnouncements(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setAnnouncements([]);
    }
  }, []);
  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  const annAudience = useMemo(() => ({
    scope: annForm.scope,
    roles: annForm.roles,
    classId: annForm.classId || undefined,
    userIds: annPicked.map((p) => p._id)
  }), [annForm.scope, annForm.roles, annForm.classId, annPicked]);

  useEffect(() => {
    if (!schoolId) return undefined;
    if (annForm.scope === 'role' && !annForm.roles.length) { setAnnPreview(null); return undefined; }
    if (annForm.scope === 'class' && !annForm.classId) { setAnnPreview(null); return undefined; }
    if (annForm.scope === 'user' && !annPicked.length) { setAnnPreview(null); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await postJson('/api/admin-messages/audience-preview', { audience: annAudience });
        if (!cancelled) setAnnPreview(res?.count ?? null);
      } catch {
        if (!cancelled) setAnnPreview(null);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId, annAudience]);

  const toggleAnnRole = (role) => {
    setAnnForm((prev) => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role]
    }));
  };
  const toggleAnnChannel = (ch) => {
    setAnnForm((prev) => ({
      ...prev,
      channels: prev.channels.includes(ch) ? prev.channels.filter((c) => c !== ch) : [...prev.channels, ch]
    }));
  };

  const sendAnnouncement = async () => {
    if (!trimValue(annForm.title) || !trimValue(annForm.body)) {
      toastRef.current.error('عنوان و متنِ اعلان الزامی است.'); return;
    }
    setAnnSending(true);
    try {
      const res = await postJson('/api/admin-messages/announcement', {
        title: trimValue(annForm.title),
        body: trimValue(annForm.body),
        audience: annAudience,
        channels: annForm.channels.length ? annForm.channels : ['bell']
      });
      toastRef.current.success(`اعلان برای ${Number(res?.notified || 0).toLocaleString('fa-AF')} نفر ارسال شد.`);
      setAnnForm({ title: '', body: '', scope: 'all', roles: [], classId: '', channels: ['bell'] });
      setAnnPicked([]);
      setAnnPreview(null);
      loadAnnouncements();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'ارسالِ اعلان ناموفق بود.'));
    } finally {
      setAnnSending(false);
    }
  };

  const archiveAnnouncement = async (id) => {
    try {
      await fetchJson(`/api/admin-messages/${id}/archive`, { method: 'PUT' });
      loadAnnouncements();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'بایگانی ناموفق بود.'));
    }
  };

  // ---- وظایف ----
  const [taskForm, setTaskForm] = useState({ title: '', body: '', dueDate: '' });
  const [taskAssignees, setTaskAssignees] = useState([]);
  const [taskSending, setTaskSending] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [taskUpdateDrafts, setTaskUpdateDrafts] = useState({});

  const loadTasks = useCallback(async () => {
    try {
      const res = await fetchJson('/api/admin-messages?kind=task&status=active');
      setTasks(Array.isArray(res?.items) ? res.items : []);
    } catch {
      setTasks([]);
    }
  }, []);
  useEffect(() => { loadTasks(); }, [loadTasks]);

  const sendTask = async () => {
    if (!trimValue(taskForm.title) || !trimValue(taskForm.body)) {
      toastRef.current.error('عنوان و توضیحِ وظیفه الزامی است.'); return;
    }
    if (!taskAssignees.length) {
      toastRef.current.error('حداقل یک نفر را برای این وظیفه انتخاب کنید.'); return;
    }
    setTaskSending(true);
    try {
      await postJson('/api/admin-messages/task', {
        title: trimValue(taskForm.title),
        body: trimValue(taskForm.body),
        assigneeIds: taskAssignees.map((p) => p._id),
        dueDate: taskForm.dueDate || undefined,
        channels: ['bell', 'email']
      });
      toastRef.current.success('وظیفه تخصیص داده شد.');
      setTaskForm({ title: '', body: '', dueDate: '' });
      setTaskAssignees([]);
      loadTasks();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'تخصیصِ وظیفه ناموفق بود.'));
    } finally {
      setTaskSending(false);
    }
  };

  const updateTaskStatus = async (task, status) => {
    try {
      await fetchJson(`/api/admin-messages/${task._id}/task-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: trimValue(taskUpdateDrafts[task._id]) })
      });
      toastRef.current.success('وضعیتِ وظیفه به‌روزرسانی شد.');
      setTaskUpdateDrafts((prev) => ({ ...prev, [task._id]: '' }));
      loadTasks();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'به‌روزرسانی ناموفق بود.'));
    }
  };

  const archiveTask = async (id) => {
    try {
      await fetchJson(`/api/admin-messages/${id}/archive`, { method: 'PUT' });
      loadTasks();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'بایگانی ناموفق بود.'));
    }
  };

  // ---- بایگانی (ترکیبی) ----
  const [archivedMessages, setArchivedMessages] = useState([]);
  const loadArchivedMessages = useCallback(async () => {
    try {
      const [annRes, taskRes] = await Promise.all([
        fetchJson('/api/admin-messages?kind=announcement&status=archived'),
        fetchJson('/api/admin-messages?kind=task&status=archived')
      ]);
      setArchivedMessages([...(annRes?.items || []), ...(taskRes?.items || [])]);
    } catch {
      setArchivedMessages([]);
    }
  }, []);
  useEffect(() => { if (activeTab === 'archive') loadArchivedMessages(); }, [activeTab, loadArchivedMessages]);

  const unarchiveMessage = async (id) => {
    try {
      await fetchJson(`/api/admin-messages/${id}/unarchive`, { method: 'PUT' });
      loadArchivedMessages();
      loadAnnouncements();
      loadTasks();
    } catch (error) {
      toastRef.current.error(displayText(error?.message || 'بازگردانی ناموفق بود.'));
    }
  };

  return (
    <div className="comms">
      <div className="comms-inner">
        <div className="comms-hero">
          <h1>مرکز ارتباطات</h1>
          <p>
            پیام‌های واردیِ سایت، اعلانِ همگانی، و وظایفِ محول‌شده — همه در یک‌جا.
            {schoolContext?.school ? ` مکتبِ فعال: ${displayText(schoolContext.school.nameDari || schoolContext.school.name || '')}` : ''}
          </p>
        </div>

        <div className="comms-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`comms-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'inbox' && <span className="count">{visibleInboxItems.filter((i) => i.status !== 'read').length}</span>}
            </button>
          ))}
        </div>

        {activeTab === 'inbox' && (
          <div className="comms-card">
            <h2>صندوقِ ورودیِ سایت</h2>
            <p className="hint">پیام‌های تماس، درخواستِ دمو، پیشنهاد و شکایتِ ثبت‌شده از سایتِ عمومی.</p>

            <div className="comms-toolbar">
              <div className="comms-field" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
                <label htmlFor="inboxSearch">جستجو</label>
                <input id="inboxSearch" value={inboxSearch} onChange={(e) => setInboxSearch(e.target.value)} placeholder="نام، ایمیل، شماره یا متنِ پیام..." />
              </div>
              <div className="comms-field" style={{ marginBottom: 0 }}>
                <label htmlFor="inboxType">نوع</label>
                <select id="inboxType" value={inboxType} onChange={(e) => setInboxType(e.target.value)}>
                  <option value="all">همه</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="comms-list">
              {inboxLoading ? (
                <div className="comms-empty">در حال بارگذاری...</div>
              ) : visibleInboxItems.length === 0 ? (
                <div className="comms-empty">پیامی با این فیلترها پیدا نشد.</div>
              ) : visibleInboxItems.map((item) => (
                <div key={item._id} className="comms-item">
                  <div className="comms-item-head">
                    <div>
                      <p className="comms-item-title">{displayText(item.name) || 'بدون نام'}</p>
                      <div className="comms-item-meta">
                        <span className={`comms-badge type-${item.type || 'contact'}`}>{TYPE_LABELS[item.type || 'contact']}</span>
                        <span className={`comms-badge status-${item.status || 'new'}`}>{INBOX_STATUS_LABELS[item.status || 'new']}</span>
                        <span>{item.email || 'بدون ایمیل'}</span>
                        <span>{item.phone || 'بدون شماره'}</span>
                        <span>{toDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="comms-item-body">{displayText(item.message)}</p>
                  {item.type === 'demo' && item.demoDetails && (
                    <p className="comms-item-meta">
                      مکتب: {item.demoDetails.schoolName || '—'} · ولایت/شهر: {item.demoDetails.province || '—'}/{item.demoDetails.city || '—'} · تعدادِ شاگرد: {item.demoDetails.studentCount || '—'}
                    </p>
                  )}
                  {Array.isArray(item.replies) && item.replies.length > 0 && (
                    <div className="comms-item-meta">پاسخِ ارسال‌شده: {item.replies.length} مورد — آخرین: {toDateTime(item.replies[item.replies.length - 1]?.sentAt)}</div>
                  )}
                  <div className="comms-item-actions">
                    {item.status !== 'read' && <button type="button" className="comms-btn-ghost" onClick={() => markRead(item._id)}>خوانده‌شد</button>}
                    {item.email && <button type="button" className="comms-btn-ghost" onClick={() => setOpenReplyId(openReplyId === item._id ? '' : item._id)}>پاسخ</button>}
                    <button type="button" className="comms-btn-danger" onClick={() => archiveInboxItem(item._id)}>بایگانی</button>
                  </div>
                  {openReplyId === item._id && (
                    <div className="comms-followup">
                      <div className="comms-field">
                        <label>متنِ پاسخ (به {item.email})</label>
                        <textarea value={replyDrafts[item._id] || ''} onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [item._id]: e.target.value }))} />
                      </div>
                      <button type="button" className="comms-btn-primary" onClick={() => sendReply(item)}>ارسالِ پاسخ</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'announce' && (
          <>
            {canSend ? (
              <div className="comms-card">
                <h2>اعلانِ همگانی</h2>
                <p className="hint">به دامنه‌ای که انتخاب می‌کنی، هم‌زمان از طریقِ زنگوله و/یا ایمیل ارسال می‌شود.</p>

                <div className="comms-field">
                  <label htmlFor="annTitle">عنوان *</label>
                  <input id="annTitle" value={annForm.title} onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="comms-field">
                  <label htmlFor="annBody">متنِ اعلان *</label>
                  <textarea id="annBody" value={annForm.body} onChange={(e) => setAnnForm((p) => ({ ...p, body: e.target.value }))} />
                </div>

                <div className="comms-field">
                  <label>دامنهٔ مخاطب</label>
                  <div className="comms-chipbar">
                    {[['all', 'همه'], ['role', 'نقش'], ['class', 'صنف'], ['user', 'فردِ مشخص']].map(([val, lbl]) => (
                      <button key={val} type="button" className={`comms-chipbtn ${annForm.scope === val ? 'on' : ''}`} onClick={() => setAnnForm((p) => ({ ...p, scope: val }))}>{lbl}</button>
                    ))}
                  </div>
                </div>

                {annForm.scope === 'role' && (
                  <div className="comms-field">
                    <label>نقش‌ها</label>
                    <div className="comms-roles">
                      {ROLE_OPTIONS.map((r) => (
                        <label key={r.value} className="comms-role-check">
                          <input type="checkbox" checked={annForm.roles.includes(r.value)} onChange={() => toggleAnnRole(r.value)} />
                          {r.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {annForm.scope === 'class' && (
                  <div className="comms-field">
                    <label htmlFor="annClass">صنف</label>
                    <select id="annClass" value={annForm.classId} onChange={(e) => setAnnForm((p) => ({ ...p, classId: e.target.value }))}>
                      <option value="">انتخاب کنید</option>
                      {classes.map((c) => (
                        <option key={c._id} value={c._id}>{c.title || `${c.gradeLevel || ''} ${c.section || ''}`}</option>
                      ))}
                    </select>
                  </div>
                )}

                {annForm.scope === 'user' && (
                  <div className="comms-field">
                    <label>افرادِ مشخص</label>
                    <PersonPicker picked={annPicked} onAdd={(p) => setAnnPicked((prev) => [...prev, p])} onRemove={(id) => setAnnPicked((prev) => prev.filter((p) => p._id !== id))} />
                  </div>
                )}

                <div className="comms-field">
                  <label>کانال</label>
                  <div className="comms-chipbar">
                    <button type="button" className={`comms-chipbtn ${annForm.channels.includes('bell') ? 'on' : ''}`} onClick={() => toggleAnnChannel('bell')}>🔔 زنگوله</button>
                    <button type="button" className={`comms-chipbtn ${annForm.channels.includes('email') ? 'on' : ''}`} onClick={() => toggleAnnChannel('email')}>✉️ ایمیل</button>
                  </div>
                </div>

                {annPreview !== null && (
                  <p className="comms-preview">این اعلان به <b>{Number(annPreview).toLocaleString('fa-AF')}</b> نفر می‌رسد.</p>
                )}

                <div style={{ marginTop: 14 }}>
                  <button type="button" className="comms-btn-primary" disabled={annSending} onClick={sendAnnouncement}>
                    {annSending ? 'در حالِ ارسال...' : 'ارسالِ اعلان'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="comms-card">
                <p className="hint" style={{ marginBottom: 0 }}>ارسالِ اعلانِ همگانی فقط برای ریاستِ عمومی، مدیرِ مکتب، مدیرِ تدریسی، مدیرِ مالی و سرمعلم فعال است.</p>
              </div>
            )}

            <div className="comms-card">
              <h2>اعلان‌های ارسال‌شده</h2>
              <div className="comms-list">
                {announcements.length === 0 ? (
                  <div className="comms-empty">هنوز اعلانی ارسال نشده.</div>
                ) : announcements.map((a) => (
                  <div key={a._id} className="comms-item">
                    <div className="comms-item-head">
                      <div>
                        <p className="comms-item-title">{a.title}</p>
                        <div className="comms-item-meta">
                          <span>{a.senderName}</span>
                          <span>{Number(a.recipientCount || 0).toLocaleString('fa-AF')} گیرنده</span>
                          <span>{toDateTime(a.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <p className="comms-item-body">{a.body}</p>
                    <div className="comms-item-actions">
                      <button type="button" className="comms-btn-danger" onClick={() => archiveAnnouncement(a._id)}>بایگانی</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {activeTab === 'tasks' && (
          <>
            {canSend && (
              <div className="comms-card">
                <h2>تخصیصِ وظیفهٔ جدید</h2>
                <p className="hint">به هر کارمند، استاد یا کاربرِ دیگری در مکتبِ فعال قابلِ تخصیص است.</p>

                <div className="comms-field">
                  <label htmlFor="taskTitle">عنوانِ وظیفه *</label>
                  <input id="taskTitle" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="comms-field">
                  <label htmlFor="taskBody">توضیح *</label>
                  <textarea id="taskBody" value={taskForm.body} onChange={(e) => setTaskForm((p) => ({ ...p, body: e.target.value }))} />
                </div>
                <div className="comms-row">
                  <div className="comms-field">
                    <label>گیرنده(ها) *</label>
                    <PersonPicker picked={taskAssignees} onAdd={(p) => setTaskAssignees((prev) => [...prev, p])} onRemove={(id) => setTaskAssignees((prev) => prev.filter((p) => p._id !== id))} />
                  </div>
                  <div className="comms-field">
                    <label htmlFor="taskDue">سررسید (اختیاری)</label>
                    <input id="taskDue" type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} />
                  </div>
                </div>
                <button type="button" className="comms-btn-primary" disabled={taskSending} onClick={sendTask}>
                  {taskSending ? 'در حالِ ارسال...' : 'تخصیصِ وظیفه'}
                </button>
              </div>
            )}

            <div className="comms-card">
              <h2>وظایف</h2>
              <div className="comms-list">
                {tasks.length === 0 ? (
                  <div className="comms-empty">وظیفه‌ای ثبت نشده.</div>
                ) : tasks.map((task) => {
                  const isAssignee = (task.audience?.userIds || []).map(String).includes(myUserId);
                  return (
                    <div key={task._id} className="comms-item">
                      <div className="comms-item-head">
                        <div>
                          <p className="comms-item-title">{task.title}</p>
                          <div className="comms-item-meta">
                            <span className={`comms-badge status-${task.followUp?.status || 'new'}`}>{TASK_STATUS_LABELS[task.followUp?.status || 'new']}</span>
                            <span>از: {task.senderName}</span>
                            {task.dueDate && <span>سررسید: {toDateTime(task.dueDate)}</span>}
                            <span>{toDateTime(task.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <p className="comms-item-body">{task.body}</p>
                      {(isAssignee || canSend) && (
                        <div className="comms-followup">
                          <div className="comms-field">
                            <label>یادداشت</label>
                            <input value={taskUpdateDrafts[task._id] || ''} onChange={(e) => setTaskUpdateDrafts((prev) => ({ ...prev, [task._id]: e.target.value }))} />
                          </div>
                          {Object.keys(TASK_STATUS_LABELS).map((s) => (
                            <button key={s} type="button" className="comms-btn-ghost" onClick={() => updateTaskStatus(task, s)}>{TASK_STATUS_LABELS[s]}</button>
                          ))}
                        </div>
                      )}
                      {canSend && (
                        <div className="comms-item-actions">
                          <button type="button" className="comms-btn-danger" onClick={() => archiveTask(task._id)}>بایگانی</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {activeTab === 'archive' && (
          <div className="comms-card">
            <h2>بایگانی</h2>
            <p className="hint">پیام‌های واردی، اعلان‌ها و وظایفِ بایگانی‌شده — چیزی حذفِ واقعی نمی‌شود.</p>
            <div className="comms-list">
              {archivedInboxItems.map((item) => (
                <div key={item._id} className="comms-item">
                  <div className="comms-item-head">
                    <div>
                      <p className="comms-item-title">{displayText(item.name) || 'بدون نام'}</p>
                      <div className="comms-item-meta">
                        <span className={`comms-badge type-${item.type || 'contact'}`}>{TYPE_LABELS[item.type || 'contact']}</span>
                        <span>{toDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="comms-item-body">{displayText(item.message)}</p>
                  <div className="comms-item-actions">
                    <button type="button" className="comms-btn-ghost" onClick={() => unarchiveInboxItem(item._id)}>بازگردانی</button>
                  </div>
                </div>
              ))}
              {archivedMessages.map((m) => (
                <div key={m._id} className="comms-item">
                  <div className="comms-item-head">
                    <div>
                      <p className="comms-item-title">{m.title}</p>
                      <div className="comms-item-meta">
                        <span className="comms-badge type-contact">{m.kind === 'task' ? 'وظیفه' : 'اعلان'}</span>
                        <span>{toDateTime(m.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <p className="comms-item-body">{m.body}</p>
                  <div className="comms-item-actions">
                    <button type="button" className="comms-btn-ghost" onClick={() => unarchiveMessage(m._id)}>بازگردانی</button>
                  </div>
                </div>
              ))}
              {archivedInboxItems.length === 0 && archivedMessages.length === 0 && (
                <div className="comms-empty">چیزی در بایگانی نیست.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCommunications;
