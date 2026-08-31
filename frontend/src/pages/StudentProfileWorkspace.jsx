import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  MessageSquare,
  RefreshCw,
  User,
  Users,
  Wallet
} from 'lucide-react';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { formatAfghanDate, formatAfghanDateTime, toGregorianDateInputValue } from '../utils/afghanDate';
import { API_ORIGIN } from '../config/api';
import AfghanStudentFieldGrid from '../components/AfghanStudentFieldGrid';
import { afghanStudentToValues, valuesToAfghanPayload } from '../config/afghanStudentFields';
import { errorMessage, fetchBlob, fetchJson } from './adminWorkspaceUtils';
import './StudentProfileWorkspace.css';

const TABS = [
  ['overview', 'خلاصه', LayoutDashboard],
  ['identity', 'مشخصات شخصی', User],
  ['family', 'خانواده و تماس', Users],
  ['memberships', 'صنف‌ها و عضویت‌ها', BookOpen],
  ['lifecycle', 'تغییر وضعیت', RefreshCw],
  ['documents', 'اسناد و عکس', FileText],
  ['academics', 'حاضری و نتایج', ClipboardCheck],
  ['finance', 'گزارش مالی', Wallet],
  ['notes', 'یادداشت‌ها', MessageSquare]
];

const STATUS_LABELS = {
  active: 'فعال', pending: 'در انتظار', transferred: 'تبدیل‌شده', transferred_in: 'تبدیلی آمده',
  transferred_out: 'تبدیلی رفته', graduated: 'فارغ‌شده', dropped: 'ترک تحصیل', expelled: 'منفک‌شده',
  suspended: 'محروم', inactive: 'غیرفعال', rejected: 'ردشده', approved: 'تأییدشده',
  present: 'حاضر', absent: 'غایب', sick: 'مریض', leave: 'رخصت', late: 'ناوقت', excused: 'معذور',
  recorded: 'ثبت‌شده', passed: 'کامیاب', failed: 'ناکام', conditional: 'مشروط', distinction: 'ممتاز',
  temporary: 'موقت', not_applicable: 'قابل تطبیق نیست', paid: 'پرداخت‌شده', partial: 'قسمی', overdue: 'باقی‌دار', new: 'جدید'
};

const EVENT_LABELS = {
  transfer_in: 'تبدیلی آمد', transfer_out: 'تبدیلی رفت', class_transfer: 'تبدیلی داخلی صنف', dropout: 'ترک تحصیل', expulsion: 'منفکی رسمی',
  suspension: 'محرومیت', suspension_lifted: 'رفع محرومیت', graduation: 'فراغت', re_enrollment: 'ثبت‌نام مجدد'
};

const DOC_LABELS = {
  id_card: 'تذکره', birth_certificate: 'کارت تولد', report_card: 'کارنامه/نتایج', photo: 'عکس شاگرد', other: 'سند دیگر'
};

const ADMISSION_LABELS = {
  regular: 'عادی', transfer_in: 'تبدیلی آمده', class_transfer: 'تبدیلی داخلی صنف', re_enrollment: 'ثبت‌نام مجدد',
  promotion: 'ارتقا', import: 'واردشده', migration: 'انتقال داده'
};

const ACTIVITY_LABELS = {
  update_student_profile: 'ویرایش مشخصات شاگرد', add_student_remark: 'افزودن یادداشت شاگرد',
  add_student_document: 'افزودن سند شاگرد', add_student_transfer: 'ثبت سابقهٔ تبدیلی',
  link_student_guardian: 'وصل‌کردن سرپرست', unlink_student_guardian: 'برداشتن اتصال سرپرست',
  student_lifecycle_transfer_in: 'ثبت تبدیلی آمد', student_lifecycle_transfer_out: 'ثبت تبدیلی رفت',
  student_lifecycle_class_transfer: 'ثبت تبدیلی داخلی صنف', student_lifecycle_dropout: 'ثبت ترک تحصیل',
  student_lifecycle_expulsion: 'ثبت منفکی رسمی', student_lifecycle_suspension: 'ثبت محرومیت',
  student_lifecycle_resume: 'ثبت رفع محرومیت', student_lifecycle_re_enrollment: 'ثبت‌نام مجدد شاگرد'
};

const EMPTY_LIFECYCLE = {
  action: 're_enrollment', membershipId: '', classId: '', effectiveDate: toGregorianDateInputValue(new Date()),
  destinationSchool: '', authorityReference: '', reason: '', financialStatus: '', returnPossibility: '', note: ''
};

const money = (value) => `${Number(value || 0).toLocaleString('fa-AF')} افغانی`;
const dateLabel = (value) => value ? formatAfghanDate(value) : '—';
const dateTimeLabel = (value) => value ? formatAfghanDateTime(value) : '—';
const statusLabel = (value) => STATUS_LABELS[String(value || '')] || String(value || 'نامشخص');
const eventLabel = (value) => EVENT_LABELS[String(value || '')] || String(value || 'تغییر وضعیت');
const fileUrl = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${API_ORIGIN}/${normalized.replace(/^\//, '')}`;
};

function InfoRows({ rows = [] }) {
  return <dl className="student-profile-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>;
}

function EmptyState({ children }) {
  return <div className="student-profile-empty">{children}</div>;
}

export default function StudentProfileWorkspace() {
  const { studentRef } = useParams();
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [activeTab, setActiveTab] = useState(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    return TABS.some(([key]) => key === requestedTab) ? requestedTab : 'overview';
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [profileForm, setProfileForm] = useState(null);
  const [afghanForm, setAfghanForm] = useState(null);
  const [afghanOriginal, setAfghanOriginal] = useState(null);
  const [nameLetterNo, setNameLetterNo] = useState('');
  const [lifecycleForm, setLifecycleForm] = useState(EMPTY_LIFECYCLE);
  const [documentForm, setDocumentForm] = useState({ kind: 'other', title: '', note: '', file: null, isPrimary: true });
  const [remarkForm, setRemarkForm] = useState({ type: 'general', title: '', text: '', visibility: 'admin' });
  const [privateAvatarUrl, setPrivateAvatarUrl] = useState('');

  const showMessage = (text, tone = 'info') => {
    setMessage(String(text || ''));
    setMessageTone(tone);
  };

  const selectTab = (tabKey) => {
    setActiveTab(tabKey);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tabKey);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  };

  const loadWorkspace = async () => {
    setLoading(true);
    try {
      const [profileData, classData] = await Promise.all([
        fetchJson(`/api/student-profiles/${studentRef}`),
        fetchJson('/api/education/school-classes').catch(() => ({ items: [] }))
      ]);
      setData(profileData.item || null);
      setClasses(classData.items || []);
      const item = profileData.item || {};
      setProfileForm({
        identity: {
          admissionNo: item.identity?.admissionNo || item.identity?.asasNumber || '',
          fullName: item.identity?.fullName || '', preferredName: item.identity?.preferredName || '',
          givenName: item.identity?.givenName || '', familyName: item.identity?.familyName || '',
          email: item.identity?.email || '', phone: item.identity?.phone || '', gender: item.identity?.gender || '',
          dateOfBirth: item.identity?.dateOfBirth ? String(item.identity.dateOfBirth).slice(0, 10) : '', note: item.identity?.note || '',
          tazkiraNumber: item.identity?.tazkiraNumber || '',
          tazkiraVolume: item.identity?.tazkiraVolume || '',
          tazkiraPage: item.identity?.tazkiraPage || ''
        },
        family: {
          fatherName: '', motherName: '', guardianName: '', guardianRelation: '',
          fatherResidence: '', fatherWorkplace: '', fatherLandline: '',
          ...(item.profile?.family || {})
        },
        contact: { primaryPhone: '', alternatePhone: '', email: '', address: '', ...(item.profile?.contact || {}) },
        background: { previousSchool: '', emergencyPhone: '', ...(item.profile?.background || {}) },
        notes: { medical: '', administrative: '', ...(item.profile?.notes || {}) }
      });
      const afghanValues = afghanStudentToValues(item.afghanStudent || {});
      setAfghanForm(afghanValues);
      setAfghanOriginal(afghanValues);
      setNameLetterNo('');
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت پروندهٔ شاگرد ناموفق بود.'), 'error');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadWorkspace(); }, [studentRef]);

  const primaryPhotoDocument = data?.profile?.documents?.find((item) => item.kind === 'photo' && item.isPrimary) || null;
  const primaryPhotoDownloadUrl = primaryPhotoDocument?.downloadUrl || '';

  useEffect(() => {
    let objectUrl = '';
    let disposed = false;
    setPrivateAvatarUrl('');
    if (!primaryPhotoDownloadUrl) return undefined;

    fetchBlob(primaryPhotoDownloadUrl, {}, { method: 'GET' })
      .then(({ blob }) => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setPrivateAvatarUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [primaryPhotoDownloadUrl]);

  const memberships = data?.memberships || [];
  const currentMembership = memberships.find((item) => item.isCurrent) || null;
  const endedMemberships = useMemo(() => memberships.filter((item) => (
    !item.isCurrent && ['transferred', 'transferred_out', 'dropped', 'expelled', 'inactive'].includes(String(item.status || ''))
  )), [memberships]);
  const lifecycleMembershipPool = lifecycleForm.action === 're_enrollment' ? endedMemberships : memberships.filter((item) => item.isCurrent);
  const selectedLifecycleMembership = lifecycleMembershipPool.find((item) => item.id === lifecycleForm.membershipId) || null;
  const finance = data?.finance || { summary: {}, bills: [], receipts: [] };
  const attendance = data?.attendance || { summary: {}, records: [] };
  const examResults = data?.results?.examResults || [];

  const updateFormSection = (section, key, value) => {
    setProfileForm((current) => ({ ...current, [section]: { ...(current?.[section] || {}), [key]: value } }));
  };
  const setAfghanField = (key, value) => setAfghanForm((current) => ({ ...(current || {}), [key]: value }));

  const afghanStudentId = data?.afghanStudent?._id || data?.identity?.afghanStudentId || '';
  const afghanNameChanged = Boolean(
    afghanForm && afghanOriginal
    && valuesToAfghanPayload(afghanForm, { original: afghanOriginal }).nameChanged
  );

  // یادداشت‌ها + نام مورد استفاده روی StudentProfile می‌مانند (مخصوصِ صفحهٔ مدیریت)
  const saveProfile = async () => {
    try {
      setBusy('profile');
      await fetchJson(`/api/student-profiles/${studentRef}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: {
            preferredName: profileForm?.identity?.preferredName || '',
            note: profileForm?.identity?.note || ''
          },
          notes: profileForm?.notes || {}
        })
      });
      showMessage('یادداشت‌ها ذخیره شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیرهٔ یادداشت‌ها ناموفق بود.'), 'error');
    } finally { setBusy(''); }
  };

  // مشخصاتِ کارت سوانح مستقیم روی AfghanStudent ذخیره می‌شوند (StudentCore هم خودکار sync می‌شود)
  const saveAfghanStudent = async () => {
    if (!afghanStudentId || !afghanForm) {
      return showMessage('این شاگرد به پروندهٔ افغانی وصل نیست.', 'error');
    }
    const { payload, nameChanged } = valuesToAfghanPayload(afghanForm, { original: afghanOriginal });
    if (nameChanged && !nameLetterNo.trim()) {
      return showMessage('برای تغییرِ نام/تخلص/نام پدر، «نمبر مکتوب» الزامی است.', 'error');
    }
    try {
      setBusy('afghan');
      if (nameChanged) payload.nameCorrectionLetterNo = nameLetterNo.trim();
      await fetchJson(`/api/afghan-students/${afghanStudentId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      showMessage('مشخصات شاگرد ذخیره شد.');
      setNameLetterNo('');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیرهٔ مشخصات شاگرد ناموفق بود.'), 'error');
    } finally { setBusy(''); }
    return undefined;
  };

  const submitLifecycle = async () => {
    if (!lifecycleForm.membershipId || !lifecycleForm.effectiveDate) return showMessage('عضویت و تاریخ اثر را انتخاب کنید.', 'error');
    if (['class_transfer', 're_enrollment'].includes(lifecycleForm.action) && !lifecycleForm.classId) return showMessage('صنف جدید را انتخاب کنید.', 'error');
    if (lifecycleForm.action !== 'resume' && !lifecycleForm.reason.trim()) return showMessage('نوشتن علت عملیات الزامی است.', 'error');
    if (['transfer_out', 'dropout', 'expulsion'].includes(lifecycleForm.action) && !lifecycleForm.financialStatus) {
      return showMessage('وضعیت مالی شاگرد را مشخص کنید.', 'error');
    }
    if (lifecycleForm.action === 'transfer_out' && !lifecycleForm.destinationSchool.trim()) return showMessage('مکتب مقصد را وارد کنید.', 'error');
    if (lifecycleForm.action === 'dropout' && !lifecycleForm.returnPossibility) return showMessage('امکان بازگشت شاگرد را مشخص کنید.', 'error');
    if (lifecycleForm.action === 're_enrollment' && selectedLifecycleMembership?.status === 'expelled' && !lifecycleForm.authorityReference.trim()) {
      return showMessage('برای بازگشت شاگرد منفک‌شده، مرجع مکتوب رسمی الزامی است.', 'error');
    }
    try {
      setBusy('lifecycle');
      const response = await fetchJson('/api/education/student-enrollments/lifecycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...lifecycleForm,
          expectedVersion: selectedLifecycleMembership?.changeVersion,
          effectiveDate: lifecycleForm.effectiveDate
        })
      });
      showMessage(response.message || 'تغییر وضعیت تعلیمی شاگرد ثبت شد.');
      setLifecycleForm(EMPTY_LIFECYCLE);
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت تغییر وضعیت تعلیمی شاگرد ناموفق بود.'), 'error');
    } finally { setBusy(''); }
  };

  const uploadDocument = async () => {
    if (!documentForm.file) return showMessage('فایل سند را انتخاب کنید.', 'error');
    try {
      setBusy('document');
      const formData = new FormData();
      formData.append('file', documentForm.file);
      formData.append('kind', documentForm.kind);
      formData.append('title', documentForm.title || documentForm.file.name);
      formData.append('note', documentForm.note);
      formData.append('isPrimary', String(documentForm.isPrimary));
      await fetchJson(`/api/student-profiles/${studentRef}/documents`, { method: 'POST', body: formData });
      setDocumentForm({ kind: 'other', title: '', note: '', file: null, isPrimary: true });
      showMessage('سند شاگرد بارگذاری شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'بارگذاری سند ناموفق بود.'), 'error');
    } finally { setBusy(''); }
  };

  const openDocument = async (item) => {
    const protectedUrl = String(item?.downloadUrl || '').trim();
    if (!protectedUrl) {
      const directUrl = fileUrl(item?.fileUrl);
      if (directUrl) window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const popup = window.open('about:blank', '_blank');
    try {
      const { blob, filename } = await fetchBlob(protectedUrl, {}, { method: 'GET' });
      const objectUrl = URL.createObjectURL(blob);
      if (popup) {
        popup.location.replace(objectUrl);
      } else {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename || item?.originalName || item?.title || 'student-document';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
      if (popup) popup.close();
      showMessage(errorMessage(error, 'بازکردن سند شاگرد ناموفق بود.'), 'error');
    }
  };

  const addRemark = async () => {
    if (!remarkForm.text.trim()) return showMessage('متن یادداشت را بنویسید.', 'error');
    try {
      setBusy('remark');
      await fetchJson(`/api/student-profiles/${studentRef}/remarks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(remarkForm)
      });
      setRemarkForm({ type: 'general', title: '', text: '', visibility: 'admin' });
      showMessage('یادداشت ثبت شد.');
      await loadWorkspace();
    } catch (error) {
      showMessage(errorMessage(error, 'ثبت یادداشت ناموفق بود.'), 'error');
    } finally { setBusy(''); }
  };

  if (loading && !data) return <main className="student-profile-workspace"><div className="student-profile-loading">در حال دریافت پروندهٔ شاگرد...</div></main>;
  if (!data) return <main className="student-profile-workspace"><Link to="/student-management">بازگشت</Link><EmptyState>پروندهٔ شاگرد پیدا نشد.</EmptyState></main>;

  const identity = data.identity || {};
  const avatar = privateAvatarUrl || fileUrl(primaryPhotoDocument?.fileUrl || identity.avatarUrl);

  return (
    <main className="student-profile-workspace" dir="rtl">
      <header className="student-profile-hero">
        <div className="student-profile-heading">
          <div className="student-profile-avatar">{avatar ? <img src={avatar} alt={identity.fullName || 'عکس شاگرد'} /> : <span>{String(identity.fullName || 'ش').charAt(0)}</span>}</div>
          <div className="student-profile-heading-copy">
            <small>پروندهٔ جامع شاگرد</small>
            <h1>{identity.fullName || 'شاگرد بدون نام'}</h1>
            <div className="student-profile-meta-row">
              <span>شماره اساس: <b>{identity.asasNumber || identity.admissionNo || 'ثبت نشده'}</b></span>
              <span>تذکره: <b>{identity.tazkiraNumber || 'ثبت نشده'}</b></span>
              <span>صنف: <b>{currentMembership?.schoolClass?.title || currentMembership?.course?.title || 'بدون صنف'}</b></span>
              <span>سال تعلیمی: <b>{currentMembership?.academicYear?.label || 'ثبت نشده'}</b></span>
            </div>
          </div>
        </div>
        <div className="student-profile-hero-actions">
          <span className={`student-profile-status ${currentMembership ? 'active' : 'ended'}`}>{currentMembership ? statusLabel(currentMembership.status) : 'بدون عضویت فعال'}</span>
          <div className="student-profile-action-group">
            <button type="button" className="student-profile-button" onClick={() => selectTab('identity')}><User size={17} />ویرایش مشخصات</button>
            <button type="button" className="student-profile-button" onClick={() => selectTab('lifecycle')}><RefreshCw size={17} />تغییر وضعیت</button>
            <Link className="student-profile-button ghost" to="/student-management"><ArrowRight size={17} />بازگشت به فهرست</Link>
          </div>
        </div>
      </header>

      {message ? <div className={`student-profile-message ${messageTone}`}>{message}</div> : null}

      <nav className="student-profile-tabs" aria-label="بخش‌های پرونده">
        {TABS.map(([key, label, Icon]) => <button key={key} type="button" className={activeTab === key ? 'active' : ''} onClick={() => selectTab(key)}><Icon size={17} /><span>{label}</span></button>)}
      </nav>

      {activeTab === 'overview' ? <section className="student-profile-section">
        <div className="student-profile-stat-grid">
          <article><span>عضویت‌ها</span><strong>{Number(data.summary?.membershipCount || 0).toLocaleString('fa-AF')}</strong></article>
          <article><span>اسناد</span><strong>{Number(data.summary?.documentCount || 0).toLocaleString('fa-AF')}</strong></article>
          <article><span>حاضری</span><strong>{Number(attendance.summary?.attendanceRate || 0).toLocaleString('fa-AF')}٪</strong></article>
          <article><span>نتایج امتحان</span><strong>{examResults.length.toLocaleString('fa-AF')}</strong></article>
          <article><span>مجموع پرداخت</span><strong>{money(finance.summary?.totalPaid)}</strong></article>
          <article><span>باقیات</span><strong>{money(finance.summary?.totalRemaining ?? finance.summary?.totalDue)}</strong></article>
        </div>
        <div className="student-profile-grid two">
          <article className="student-profile-card"><h2>وضعیت فعلی</h2><InfoRows rows={[
            ['صنف', currentMembership?.schoolClass?.title || currentMembership?.course?.title],
            ['سال تعلیمی', currentMembership?.academicYear?.label], ['نوع پذیرش', ADMISSION_LABELS[currentMembership?.admissionType] || currentMembership?.admissionType],
            ['تاریخ شمول', dateLabel(currentMembership?.enrolledAt)], ['وضعیت', currentMembership ? statusLabel(currentMembership.status) : 'پایان‌یافته']
          ]} /></article>
          <article className="student-profile-card"><h2>آخرین تغییرات</h2>{(data.timeline || []).slice(0, 8).map((item) => <div className="student-profile-timeline-row" key={`${item.type}-${item.id}`}><b>{item.type === 'lifecycle' ? eventLabel(item.title) : (item.title || 'ثبت پرونده')}</b><span>{item.note || item.meta || 'بدون یادداشت'}</span><time>{dateTimeLabel(item.at)}</time></div>)}</article>
        </div>
      </section> : null}

      {activeTab === 'identity' && afghanForm ? (
        <section className="student-profile-section">
          <article className="student-profile-card">
            <div className="student-profile-section-head">
              <div><h2>مشخصات رسمی و شخصی</h2><p>همان فیلدهای «کارت سوانح متعلم» — مستقیماً روی پروندهٔ اصلی شاگرد ذخیره می‌شود.</p></div>
              <button className="student-profile-button primary" onClick={saveAfghanStudent} disabled={busy === 'afghan' || !afghanStudentId}>
                {busy === 'afghan' ? 'در حال ذخیره...' : 'ذخیره مشخصات'}
              </button>
            </div>
            {!afghanStudentId ? <EmptyState>این شاگرد به پروندهٔ افغانی وصل نیست؛ ویرایش مشخصات از اینجا ممکن نیست.</EmptyState> : (
              <>
                <AfghanStudentFieldGrid theme="glass" sectionIds={['identity', 'birth']} values={afghanForm} onChange={setAfghanField} />
                {afghanNameChanged ? (
                  <label className="student-profile-name-letter">
                    <span>نمبر مکتوبِ اصلاح شهرت (الزامی)</span>
                    <input value={nameLetterNo} onChange={(e) => setNameLetterNo(e.target.value)} placeholder="نمبر و تاریخِ مکتوب رسمی" />
                  </label>
                ) : null}
                <p className="student-profile-help">تغییر نام/تخلص/نام پدر بدون «نمبر مکتوب» ثبت نمی‌شود و در «اصلاح شهرت» کارت سوانح درج می‌گردد.</p>
              </>
            )}
          </article>
        </section>
      ) : null}

      {activeTab === 'family' && afghanForm ? (
        <section className="student-profile-section">
          <article className="student-profile-card">
            <div className="student-profile-section-head">
              <div><h2>خانواده، سرپرست و تماس</h2><p>معلومات پدر/مادر/سرپرست، تماس، سکونت و سابقهٔ تحصیلی — روی پروندهٔ اصلی شاگرد.</p></div>
              <button className="student-profile-button primary" onClick={saveAfghanStudent} disabled={busy === 'afghan' || !afghanStudentId}>
                {busy === 'afghan' ? 'در حال ذخیره...' : 'ذخیره معلومات'}
              </button>
            </div>
            {!afghanStudentId ? <EmptyState>این شاگرد به پروندهٔ افغانی وصل نیست.</EmptyState> : (
              <>
                <AfghanStudentFieldGrid theme="glass" sectionIds={['father', 'mother', 'guardian', 'contact', 'emergency', 'previous']} values={afghanForm} onChange={setAfghanField} />
                {afghanNameChanged ? (
                  <label className="student-profile-name-letter">
                    <span>نمبر مکتوبِ اصلاح شهرت (الزامی)</span>
                    <input value={nameLetterNo} onChange={(e) => setNameLetterNo(e.target.value)} placeholder="نمبر و تاریخِ مکتوب رسمی" />
                  </label>
                ) : null}
              </>
            )}
          </article>
          {profileForm ? (
            <article className="student-profile-card">
              <div className="student-profile-section-head">
                <div><h2>یادداشت‌ها</h2><p>یادداشت‌های داخلیِ صفحهٔ مدیریت — روی فرم سوانح چاپ نمی‌شود.</p></div>
                <button className="student-profile-button" onClick={saveProfile} disabled={busy === 'profile'}>
                  {busy === 'profile' ? 'در حال ذخیره...' : 'ذخیره یادداشت‌ها'}
                </button>
              </div>
              <div className="student-profile-form-grid">
                <label><span>نام مورد استفاده</span><input value={profileForm.identity.preferredName || ''} onChange={(e) => updateFormSection('identity', 'preferredName', e.target.value)} /></label>
                <label><span>ملاحظات صحی</span><input value={profileForm.notes.medical || ''} onChange={(e) => updateFormSection('notes', 'medical', e.target.value)} /></label>
                <label><span>ملاحظات اداری</span><input value={profileForm.notes.administrative || ''} onChange={(e) => updateFormSection('notes', 'administrative', e.target.value)} /></label>
              </div>
            </article>
          ) : null}
          <article className="student-profile-card"><h2>سرپرستان وصل‌شده</h2>{data.profile?.guardians?.length ? data.profile.guardians.map((item) => <div className="student-profile-list-row" key={item.id}><div><b>{item.name || 'بدون نام'} {item.isPrimary ? <em>سرپرست اصلی</em> : null}</b><span>{item.relation || 'نسبت ثبت نشده'} · {item.phone || item.email || 'تماس ثبت نشده'}</span></div><span>{statusLabel(item.status)}</span></div>) : <EmptyState>سرپرست وصل‌شده وجود ندارد.</EmptyState>}</article>
        </section>
      ) : null}

      {activeTab === 'memberships' ? <section className="student-profile-section"><article className="student-profile-card"><div className="student-profile-section-head"><div><h2>تاریخچهٔ صنف‌ها و عضویت‌ها</h2><p>عضویت‌های پایان‌یافته حذف یا دوباره باز نمی‌شوند.</p></div><Link className="student-profile-button ghost" to="/admin-education?section=enrollments">مرکز مدیریت آموزش</Link></div>{memberships.length ? <div className="student-profile-table-wrap"><table><thead><tr><th>صنف</th><th>سال تعلیمی</th><th>وضعیت</th><th>نوع پذیرش</th><th>شمول</th><th>پایان</th></tr></thead><tbody>{memberships.map((item) => <tr key={item.id}><td>{item.schoolClass?.title || item.course?.title || '—'}</td><td>{item.academicYear?.label || '—'}</td><td><span className={`student-profile-badge ${item.isCurrent ? 'good' : 'muted'}`}>{statusLabel(item.status)}</span></td><td>{ADMISSION_LABELS[item.admissionType] || item.admissionType || 'عادی'}</td><td>{dateLabel(item.enrolledAt)}</td><td>{item.isCurrent ? 'فعلی' : dateLabel(item.endedAt)}</td></tr>)}</tbody></table></div> : <EmptyState>عضویت ثبت نشده است.</EmptyState>}</article></section> : null}

      {activeTab === 'lifecycle' ? <section className="student-profile-section"><div className="student-profile-grid lifecycle"><article className="student-profile-card"><h2>ثبت تغییر وضعیت تعلیمی</h2><div className="student-profile-form-grid compact">
        <label><span>نوع عملیات</span><select value={lifecycleForm.action} onChange={(e) => setLifecycleForm({ ...EMPTY_LIFECYCLE, action: e.target.value })}><option value="re_enrollment">بازگشت و ثبت‌نام مجدد</option><option value="class_transfer">تبدیلی داخلی صنف</option><option value="transfer_out">تبدیلی رفت</option><option value="dropout">ترک تحصیل</option><option value="expulsion">منفکی رسمی</option><option value="suspension">محرومیت موقت</option><option value="resume">رفع محرومیت</option></select></label>
        <label><span>{lifecycleForm.action === 're_enrollment' ? 'عضویت پایان‌یافته' : 'عضویت فعلی'}</span><select value={lifecycleForm.membershipId} onChange={(e) => setLifecycleForm((v) => ({ ...v, membershipId: e.target.value }))}><option value="">انتخاب عضویت</option>{lifecycleMembershipPool.map((item) => <option value={item.id} key={item.id}>{item.schoolClass?.title || item.course?.title || 'بدون صنف'} · {statusLabel(item.status)} · {item.academicYear?.label || ''}</option>)}</select></label>
        {['class_transfer','re_enrollment'].includes(lifecycleForm.action) ? <label><span>صنف جدید</span><select value={lifecycleForm.classId} onChange={(e) => setLifecycleForm((v) => ({ ...v, classId: e.target.value }))}><option value="">انتخاب صنف</option>{classes.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.title} · {item.academicYear?.title || item.academicYear?.label || ''}</option>)}</select></label> : null}
        <label><span>تاریخ اثر</span><AfghanDateInput value={lifecycleForm.effectiveDate} onChange={(value) => setLifecycleForm((v) => ({ ...v, effectiveDate: value }))} showGregorianEquivalent /></label>
        {lifecycleForm.action === 'transfer_out' ? <label><span>مکتب مقصد</span><input value={lifecycleForm.destinationSchool} onChange={(e) => setLifecycleForm((v) => ({ ...v, destinationSchool: e.target.value }))} /></label> : null}
        {['expulsion','re_enrollment'].includes(lifecycleForm.action) ? <label><span>مرجع حکم/مکتوب</span><input value={lifecycleForm.authorityReference} onChange={(e) => setLifecycleForm((v) => ({ ...v, authorityReference: e.target.value }))} /></label> : null}
        {['transfer_out','dropout','expulsion'].includes(lifecycleForm.action) ? <label><span>وضعیت مالی</span><select value={lifecycleForm.financialStatus} onChange={(e) => setLifecycleForm((v) => ({ ...v, financialStatus: e.target.value }))}><option value="">انتخاب</option><option value="cleared">تصفیه‌شده</option><option value="balance_due">باقی‌دار</option><option value="follow_up">در حال پیگیری</option><option value="waived">معاف‌شده</option></select></label> : null}
        {lifecycleForm.action === 'dropout' ? <label><span>امکان بازگشت</span><select value={lifecycleForm.returnPossibility} onChange={(e) => setLifecycleForm((v) => ({ ...v, returnPossibility: e.target.value }))}><option value="">انتخاب</option><option value="possible">بلی</option><option value="unlikely">نخیر</option><option value="unknown">نامعلوم</option></select></label> : null}
        {lifecycleForm.action !== 'resume' ? <label className="wide"><span>علت</span><input value={lifecycleForm.reason} onChange={(e) => setLifecycleForm((v) => ({ ...v, reason: e.target.value }))} /></label> : null}
        <label className="wide"><span>یادداشت</span><textarea value={lifecycleForm.note} onChange={(e) => setLifecycleForm((v) => ({ ...v, note: e.target.value }))} /></label>
      </div><div className="student-profile-card-actions"><button className="student-profile-button primary" onClick={submitLifecycle} disabled={busy === 'lifecycle'}>{busy === 'lifecycle' ? 'در حال ثبت...' : 'ثبت عملیات رسمی'}</button></div><p className="student-profile-help">در ثبت‌نام مجدد، عضویت قبلی حفظ و عضویت تازه ایجاد می‌شود. فیس از تاریخ بازگشت محاسبه خواهد شد.</p></article>
      <article className="student-profile-card"><h2>سوانح تغییر وضعیت</h2>{data.lifecycle?.events?.length ? data.lifecycle.events.map((item) => <div className="student-profile-timeline-row" key={item.id}><b>{eventLabel(item.eventType)}</b><span>{item.note || 'بدون یادداشت'}{item.createdBy?.name ? ` · ثبت‌کننده: ${item.createdBy.name}` : ''}</span><time>{dateTimeLabel(item.effectiveAt)}</time></div>) : <EmptyState>رویداد رسمی ثبت نشده است.</EmptyState>}</article></div></section> : null}

      {activeTab === 'documents' ? <section className="student-profile-section"><div className="student-profile-grid documents"><article className="student-profile-card"><h2>بارگذاری سند یا عکس</h2><div className="student-profile-form-grid compact"><label><span>نوع سند</span><select value={documentForm.kind} onChange={(e) => setDocumentForm((v) => ({ ...v, kind: e.target.value }))}>{Object.entries(DOC_LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span>عنوان</span><input value={documentForm.title} onChange={(e) => setDocumentForm((v) => ({ ...v, title: e.target.value }))} placeholder="در صورت خالی بودن، نام فایل استفاده می‌شود" /></label><label className="wide"><span>فایل</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setDocumentForm((v) => ({ ...v, file: e.target.files?.[0] || null }))} /></label><label className="wide"><span>یادداشت</span><textarea value={documentForm.note} onChange={(e) => setDocumentForm((v) => ({ ...v, note: e.target.value }))} /></label>{documentForm.kind === 'photo' ? <label className="student-profile-check"><input type="checkbox" checked={documentForm.isPrimary} onChange={(e) => setDocumentForm((v) => ({ ...v, isPrimary: e.target.checked }))} /><span>به‌عنوان عکس اصلی شاگرد استفاده شود</span></label> : null}</div><div className="student-profile-card-actions"><button className="student-profile-button primary" onClick={uploadDocument} disabled={busy === 'document'}>{busy === 'document' ? 'در حال بارگذاری...' : 'بارگذاری سند'}</button></div></article><article className="student-profile-card"><h2>اسناد ثبت‌شده</h2><div className="student-profile-document-grid">{data.profile?.documents?.length ? data.profile.documents.map((item) => <button type="button" key={item.id} onClick={() => openDocument(item)}><b>{item.title || DOC_LABELS[item.kind]}</b><span>{DOC_LABELS[item.kind] || item.kind}{item.isPrimary ? ' · عکس اصلی' : ''}</span><time>{dateLabel(item.uploadedAt)}</time></button>) : <EmptyState>سندی بارگذاری نشده است.</EmptyState>}</div></article></div></section> : null}

      {activeTab === 'academics' ? <section className="student-profile-section"><div className="student-profile-stat-grid compact"><article><span>روزهای ثبت‌شده</span><strong>{Number(attendance.summary?.total || 0).toLocaleString('fa-AF')}</strong></article><article><span>حاضر</span><strong>{Number(attendance.summary?.present || 0).toLocaleString('fa-AF')}</strong></article><article><span>غایب</span><strong>{Number(attendance.summary?.absent || 0).toLocaleString('fa-AF')}</strong></article><article><span>فیصدی حاضری</span><strong>{Number(attendance.summary?.attendanceRate || 0).toLocaleString('fa-AF')}٪</strong></article></div><article className="student-profile-card"><h2>نتایج امتحانات</h2>{examResults.length ? <div className="student-profile-table-wrap"><table><thead><tr><th>مضمون</th><th>امتحان/دوره</th><th>نمره</th><th>فیصدی</th><th>نتیجه</th></tr></thead><tbody>{examResults.map((item) => <tr key={item.id}><td>{item.subject?.name || '—'}</td><td>{item.examType?.title || item.period?.title || '—'}</td><td>{item.obtainedMark.toLocaleString('fa-AF')} / {item.totalMark.toLocaleString('fa-AF')}</td><td>{item.percentage.toLocaleString('fa-AF')}٪</td><td>{statusLabel(item.resultStatus || item.markStatus)}</td></tr>)}</tbody></table></div> : <EmptyState>نتیجهٔ امتحان ثبت نشده است.</EmptyState>}</article><article className="student-profile-card"><h2>آخرین حاضری‌ها</h2>{attendance.records?.length ? <div className="student-profile-table-wrap"><table><thead><tr><th>تاریخ</th><th>مضمون</th><th>وضعیت</th><th>یادداشت</th></tr></thead><tbody>{attendance.records.slice(0,40).map((item) => <tr key={item.id}><td>{dateLabel(item.date)}</td><td>{item.course?.title || '—'}</td><td>{statusLabel(item.status)}</td><td>{item.note || '—'}</td></tr>)}</tbody></table></div> : <EmptyState>حاضری ثبت نشده است.</EmptyState>}</article></section> : null}

      {activeTab === 'finance' ? <section className="student-profile-section"><div className="student-profile-readonly"><b>گزارش مالی فقط برای مشاهده</b><span>ثبت پرداخت، صدور یا لغو بل، تخفیف و تأیید رسید از این پرونده امکان ندارد.</span></div><div className="student-profile-stat-grid compact"><article><span>مجموع بل</span><strong>{money(finance.summary?.totalBilled)}</strong></article><article><span>مجموع پرداخت</span><strong>{money(finance.summary?.totalPaid)}</strong></article><article><span>باقیات</span><strong>{money(finance.summary?.totalRemaining ?? finance.summary?.totalDue)}</strong></article><article><span>رسید در انتظار</span><strong>{Number(finance.summary?.pendingReceiptCount || 0).toLocaleString('fa-AF')}</strong></article></div><article className="student-profile-card"><h2>بل‌ها</h2>{finance.bills?.length ? <div className="student-profile-table-wrap"><table><thead><tr><th>شماره بل</th><th>دوره</th><th>مبلغ</th><th>پرداخت</th><th>باقیات</th><th>وضعیت</th></tr></thead><tbody>{finance.bills.map((item) => <tr key={item.id}><td>{item.billNumber || '—'}</td><td>{item.periodLabel || item.term || '—'}</td><td>{money(item.amountOriginal)}</td><td>{money(item.amountPaid)}</td><td>{money(item.amountRemaining ?? Math.max(0, Number(item.amountDue || 0) - Number(item.amountPaid || 0)))}</td><td>{statusLabel(item.status)}</td></tr>)}</tbody></table></div> : <EmptyState>بل مالی ثبت نشده است.</EmptyState>}</article><article className="student-profile-card"><h2>پرداخت‌ها و رسیدها</h2>{finance.receipts?.length ? <div className="student-profile-table-wrap"><table><thead><tr><th>تاریخ</th><th>مبلغ</th><th>روش</th><th>مرجع</th><th>وضعیت</th></tr></thead><tbody>{finance.receipts.map((item) => <tr key={item.id}><td>{dateLabel(item.paidAt)}</td><td>{money(item.amount)}</td><td>{item.paymentMethod || '—'}</td><td>{item.referenceNo || '—'}</td><td>{statusLabel(item.status)}</td></tr>)}</tbody></table></div> : <EmptyState>پرداخت ثبت نشده است.</EmptyState>}</article></section> : null}

      {activeTab === 'notes' ? <section className="student-profile-section"><div className="student-profile-grid two"><article className="student-profile-card"><h2>افزودن یادداشت</h2><div className="student-profile-form-grid compact"><label><span>نوع</span><select value={remarkForm.type} onChange={(e) => setRemarkForm((v) => ({ ...v, type: e.target.value }))}><option value="general">عمومی</option><option value="medical">صحی</option><option value="discipline">انضباطی</option><option value="administrative">اداری</option><option value="family">خانوادگی</option></select></label><label><span>عنوان</span><input value={remarkForm.title} onChange={(e) => setRemarkForm((v) => ({ ...v, title: e.target.value }))} /></label><label className="wide"><span>متن</span><textarea value={remarkForm.text} onChange={(e) => setRemarkForm((v) => ({ ...v, text: e.target.value }))} /></label></div><div className="student-profile-card-actions"><button className="student-profile-button primary" onClick={addRemark} disabled={busy === 'remark'}>ثبت یادداشت</button></div></article><article className="student-profile-card"><h2>یادداشت‌های پرونده</h2>{data.profile?.remarks?.length ? data.profile.remarks.map((item) => <div className="student-profile-timeline-row" key={item.id}><b>{item.title || 'یادداشت شاگرد'}</b><span>{item.text}</span><time>{dateTimeLabel(item.createdAt)}</time></div>) : <EmptyState>یادداشتی ثبت نشده است.</EmptyState>}</article></div><article className="student-profile-card"><h2>ثبت تغییرات سیستم</h2>{data.activity?.logs?.length ? data.activity.logs.map((item) => <div className="student-profile-timeline-row" key={item.id}><b>{ACTIVITY_LABELS[item.action] || 'فعالیت سیستم'}</b><span>{item.actorRole || item.actorOrgRole || 'سیستم'} · {item.route || '—'}</span><time>{dateTimeLabel(item.createdAt)}</time></div>) : <EmptyState>تغییر ثبت‌شده وجود ندارد.</EmptyState>}</article></section> : null}
    </main>
  );
}
