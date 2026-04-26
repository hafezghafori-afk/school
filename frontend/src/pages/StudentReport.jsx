import React, { useEffect, useMemo, useState } from 'react';
import './StudentReport.css';

import { API_BASE } from '../config/api';
import useExpandableList from '../hooks/useExpandableList';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const nf = new Intl.NumberFormat('fa-AF-u-ca-persian');
const df = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
});

function formatDate(value) {
  if (!value) return '---';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '---';
  return df.format(date);
}

function formatMoney(value, currency = 'AFN') {
  return `${nf.format(Number(value || 0))} ${currency}`;
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...getAuthHeaders(),
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function buildStudentLabel(item = {}) {
  const classTitle = item.currentMembership?.schoolClass?.title || '';
  const yearTitle = item.currentMembership?.academicYear?.label || '';
  return [item.fullName, classTitle, yearTitle].filter(Boolean).join(' - ');
}

const ACTIVITY_PREVIEW_COUNT = 3;
const TIMELINE_PREVIEW_COUNT = 3;
const STUDENT_REPORT_ACTIVITY_EXPANDED_KEY = 'studentReportActivityExpanded';
const STUDENT_REPORT_TIMELINE_EXPANDED_KEY = 'studentReportTimelineExpanded';

export default function StudentReport() {
  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [profile, setProfile] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [listLoading, setListLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [guardianQuery, setGuardianQuery] = useState('');
  const [guardianCandidates, setGuardianCandidates] = useState([]);
  const [guardianSearchLoading, setGuardianSearchLoading] = useState(false);
  const [guardianActionLoading, setGuardianActionLoading] = useState(false);
  const [guardianForm, setGuardianForm] = useState({
    userId: '',
    relation: '',
    note: '',
    isPrimary: false
  });

  const filteredStudents = useMemo(() => {
    const query = String(filterText || '').trim().toLowerCase();
    if (!query) return students;
    return students.filter((item) => {
      const haystack = [
        item.fullName,
        item.email,
        item.admissionNo,
        item.currentMembership?.schoolClass?.title,
        item.currentMembership?.academicYear?.label
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [filterText, students]);

  const selectedStudent = useMemo(() => (
    students.find((item) => item.studentId === studentId) || null
  ), [studentId, students]);

  const linkedGuardians = profile?.profile?.guardians || [];
  const timelineItems = profile?.timeline || [];
  const activityLogs = profile?.activity?.logs || [];
  const {
    isExpanded: showAllTimeline,
    toggleExpanded: toggleTimelineExpanded,
    hasMore: hasMoreTimeline,
    hiddenCount: hiddenTimelineCount,
    visibleItems: visibleTimelineItems
  } = useExpandableList(timelineItems, {
    previewCount: TIMELINE_PREVIEW_COUNT,
    storageKey: STUDENT_REPORT_TIMELINE_EXPANDED_KEY
  });

  const {
    isExpanded: showAllActivity,
    toggleExpanded: toggleActivityExpanded,
    hasMore: hasMoreActivity,
    hiddenCount: hiddenActivityCount,
    visibleItems: visibleActivityLogs
  } = useExpandableList(activityLogs, {
    previewCount: ACTIVITY_PREVIEW_COUNT,
    storageKey: STUDENT_REPORT_ACTIVITY_EXPANDED_KEY
  });

  const summaryCards = profile ? [
    { label: 'عضویت‌ها', value: profile.summary?.membershipCount || 0 },
    { label: 'والد/سرپرست', value: linkedGuardians.length || 0 },
    { label: 'بل‌ها', value: profile.finance?.summary?.billCount || 0 },
    { label: 'پرداخت‌ها', value: profile.finance?.summary?.receiptCount || 0 },
    { label: 'نتایج', value: (profile.results?.summary?.gradeCount || 0) + (profile.results?.summary?.quizResultCount || 0) }
  ] : [];

  const setFeedback = (tone, nextMessage) => {
    setMessageTone(tone);
    setMessage(nextMessage);
  };

  const loadStudents = async () => {
    setListLoading(true);
    try {
      const { response, data } = await fetchJson('/api/student-profiles');
      if (!response.ok || !data?.success) {
        setStudents([]);
        setProfile(null);
        setFeedback('error', data?.message || 'دریافت فهرست شاگردان ناموفق بود.');
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      setStudents(items);
      if (!items.length) {
        setStudentId('');
        setProfile(null);
        return;
      }

      setStudentId((current) => current || items[0].studentId);
    } catch {
      setStudents([]);
      setProfile(null);
      setFeedback('error', 'ارتباط با سرور برای دریافت شاگردان ناموفق بود.');
    } finally {
      setListLoading(false);
    }
  };

  const loadProfile = async (targetStudentId) => {
    if (!targetStudentId) {
      setProfile(null);
      return;
    }

    setProfileLoading(true);
    try {
      const { response, data } = await fetchJson(`/api/student-profiles/${targetStudentId}`);
      if (!response.ok || !data?.success) {
        setProfile(null);
        setFeedback('error', data?.message || 'دریافت پروفایل شاگرد ناموفق بود.');
        return;
      }

      setProfile(data.item || null);
    } catch {
      setProfile(null);
      setFeedback('error', 'ارتباط با سرور برای دریافت پروفایل شاگرد ناموفق بود.');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    if (!studentId) return;
    loadProfile(studentId);
  }, [studentId]);

  useEffect(() => {
    if (!filteredStudents.length) return;
    const hasSelected = filteredStudents.some((item) => item.studentId === studentId);
    if (!hasSelected) setStudentId(filteredStudents[0].studentId);
  }, [filteredStudents, studentId]);

  const searchGuardianCandidates = async () => {
    const query = String(guardianQuery || '').trim();
    if (query.length < 2) {
      setFeedback('error', 'برای جستجوی والد/سرپرست حداقل دو حرف وارد کنید.');
      return;
    }

    setGuardianSearchLoading(true);
    try {
      const { response, data } = await fetchJson(`/api/student-profiles/guardian-users/search?q=${encodeURIComponent(query)}`);
      if (!response.ok || !data?.success) {
        setGuardianCandidates([]);
        setFeedback('error', data?.message || 'جستجوی والد/سرپرست ناموفق بود.');
        return;
      }

      setGuardianCandidates(Array.isArray(data.items) ? data.items : []);
      if (!Array.isArray(data.items) || !data.items.length) {
        setFeedback('info', 'برای این جستجو حساب والد/سرپرستی پیدا نشد.');
      }
    } catch {
      setGuardianCandidates([]);
      setFeedback('error', 'ارتباط با سرور برای جستجوی والد/سرپرست ناموفق بود.');
    } finally {
      setGuardianSearchLoading(false);
    }
  };

  const handleGuardianFormChange = (key, value) => {
    setGuardianForm((current) => ({ ...current, [key]: value }));
  };

  const handleLinkGuardian = async () => {
    if (!studentId) {
      setFeedback('error', 'ابتدا شاگرد را انتخاب کنید.');
      return;
    }
    if (!guardianForm.userId) {
      setFeedback('error', 'ابتدا حساب والد/سرپرست را از نتایج جستجو انتخاب کنید.');
      return;
    }

    setGuardianActionLoading(true);
    try {
      const { response, data } = await fetchJson(`/api/student-profiles/${studentId}/guardians/link`, {
        method: 'POST',
        body: JSON.stringify(guardianForm)
      });

      if (!response.ok || !data?.success) {
        setFeedback('error', data?.message || 'وصل‌کردن والد/سرپرست ناموفق بود.');
        return;
      }

      setFeedback('info', data?.message || 'والد/سرپرست با موفقیت وصل شد.');
      setGuardianForm({ userId: '', relation: '', note: '', isPrimary: false });
      setGuardianCandidates([]);
      setGuardianQuery('');
      await loadProfile(studentId);
    } catch {
      setFeedback('error', 'ارتباط با سرور برای وصل‌کردن والد/سرپرست ناموفق بود.');
    } finally {
      setGuardianActionLoading(false);
    }
  };

  const handleUnlinkGuardian = async (guardianRef) => {
    if (!studentId || !guardianRef) return;

    setGuardianActionLoading(true);
    try {
      const { response, data } = await fetchJson(`/api/student-profiles/${studentId}/guardians/${guardianRef}`, {
        method: 'DELETE'
      });

      if (!response.ok || !data?.success) {
        setFeedback('error', data?.message || 'حذف اتصال والد/سرپرست ناموفق بود.');
        return;
      }

      setFeedback('info', data?.message || 'اتصال والد/سرپرست برداشته شد.');
      await loadProfile(studentId);
    } catch {
      setFeedback('error', 'ارتباط با سرور برای حذف اتصال والد/سرپرست ناموفق بود.');
    } finally {
      setGuardianActionLoading(false);
    }
  };

  return (
    <div className="student-report-page">
      <section className="student-report-shell">
        <div className="student-report-topbar">
          <button type="button" className="student-report-back" onClick={() => window.history.back()}>
            بازگشت
          </button>
          <button
            type="button"
            className="student-report-refresh"
            onClick={() => {
              loadStudents();
              if (studentId) loadProfile(studentId);
            }}
          >
            بازخوانی
          </button>
        </div>

        <header className="student-report-hero">
          <div>
            <span className="student-report-kicker">مرکز گزارش شاگرد</span>
            <h1>{profile?.identity?.fullName || selectedStudent?.fullName || 'گزارش شاگردان'}</h1>
            <p>
              از این صفحه می‌توانید وضعیت عضویت، مالی، نتایج و اتصال والد/سرپرست هر شاگرد را در یک‌جا بررسی و مدیریت کنید.
            </p>
          </div>
          <div className="student-report-hero-note">
            <strong>{nf.format(profile?.summary?.membershipCount || 0)}</strong>
            <span>عضویت فعال و آرشیفی</span>
          </div>
        </header>

        <section className="student-report-controls">
          <label className="student-report-field">
            <span>جستجوی شاگرد</span>
            <input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder="نام، ایمیل، کد شاگرد، صنف یا سال تعلیمی"
            />
          </label>
          <label className="student-report-field student-report-select-field">
            <span>انتخاب شاگرد</span>
            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              {filteredStudents.map((item) => (
                <option key={item.studentId} value={item.studentId}>
                  {buildStudentLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </section>

        {listLoading && <div className="student-report-message">در حال دریافت فهرست شاگردان...</div>}
        {!listLoading && !!message && (
          <div className={`student-report-message${messageTone === 'error' ? ' is-error' : ''}`}>{message}</div>
        )}
        {!listLoading && !filteredStudents.length && (
          <div className="student-report-message">برای این جستجو شاگردی پیدا نشد.</div>
        )}
        {profileLoading && <div className="student-report-message">در حال دریافت پروفایل شاگرد...</div>}

        {profile && !profileLoading ? (
          <>
            <section className="student-report-summary-grid">
              {summaryCards.map((item) => (
                <article key={item.label} className="student-report-summary-card">
                  <span>{item.label}</span>
                  <strong>{nf.format(Number(item.value || 0))}</strong>
                </article>
              ))}
            </section>

            <section className="student-report-primary-grid">
              <article className="student-report-panel student-report-panel-accent">
                <div className="student-report-panel-head">
                  <div>
                    <span className="student-report-eyebrow">هویت شاگرد</span>
                    <h2>{profile.identity?.fullName || 'بدون نام'}</h2>
                  </div>
                  <span className={`student-report-status status-${profile.identity?.status || 'unknown'}`}>
                    {profile.identity?.status || 'نامشخص'}
                  </span>
                </div>
                <div className="student-report-badges">
                  <span>ایمیل: {profile.identity?.email || '---'}</span>
                  <span>شماره شاگرد: {profile.identity?.admissionNo || '---'}</span>
                </div>
                <div className="student-report-detail-grid">
                  <div>
                    <span>نام ترجیحی</span>
                    <strong>{profile.identity?.preferredName || '---'}</strong>
                  </div>
                  <div>
                    <span>کد کاربر</span>
                    <strong>{profile.identity?.userId || '---'}</strong>
                  </div>
                  <div>
                    <span>شماره تماس</span>
                    <strong>{profile.identity?.phone || profile.profile?.contact?.primaryPhone || '---'}</strong>
                  </div>
                  <div>
                    <span>صنف فعلی</span>
                    <strong>{profile.identity?.currentMembership?.schoolClass?.title || '---'}</strong>
                  </div>
                </div>
              </article>

              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">خانواده و تماس</span>
                    <h3>اطلاعات تماس و خانواده</h3>
                  </div>
                </div>
                <div className="student-report-list two-col">
                  <div>
                    <span>نام پدر</span>
                    <strong>{profile.profile?.family?.fatherName || '---'}</strong>
                  </div>
                  <div>
                    <span>نام مادر</span>
                    <strong>{profile.profile?.family?.motherName || '---'}</strong>
                  </div>
                  <div>
                    <span>تلفن اصلی</span>
                    <strong>{profile.profile?.contact?.primaryPhone || '---'}</strong>
                  </div>
                  <div>
                    <span>تلفن اضطراری</span>
                    <strong>{profile.profile?.background?.emergencyPhone || '---'}</strong>
                  </div>
                  <div className="full">
                    <span>آدرس</span>
                    <strong>{profile.profile?.contact?.address || '---'}</strong>
                  </div>
                </div>
              </article>

              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">یادداشت‌ها</span>
                    <h3>پس‌زمینه و ملاحظات</h3>
                  </div>
                </div>
                <div className="student-report-note-stack">
                  <div>
                    <span>مکتب قبلی</span>
                    <p>{profile.profile?.background?.previousSchool || 'یادداشتی ثبت نشده است.'}</p>
                  </div>
                  <div>
                    <span>یادداشت طبی</span>
                    <p>{profile.profile?.notes?.medical || 'یادداشتی ثبت نشده است.'}</p>
                  </div>
                  <div>
                    <span>یادداشت اداری</span>
                    <p>{profile.profile?.notes?.administrative || 'یادداشتی ثبت نشده است.'}</p>
                  </div>
                </div>
              </article>
            </section>

            <section className="student-report-secondary-grid">
              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">والدین و سرپرستان</span>
                    <h3>مدیریت اتصال والد/سرپرست</h3>
                  </div>
                </div>

                <div className="student-report-guardian-toolbar">
                  <input
                    value={guardianQuery}
                    onChange={(event) => setGuardianQuery(event.target.value)}
                    placeholder="جستجو با نام یا ایمیل حساب والد/سرپرست"
                  />
                  <button type="button" className="student-report-action-btn" onClick={searchGuardianCandidates} disabled={guardianSearchLoading}>
                    {guardianSearchLoading ? 'در حال جستجو...' : 'جستجوی والد/سرپرست'}
                  </button>
                </div>

                {!!guardianCandidates.length && (
                  <div className="student-report-guardian-candidates">
                    {guardianCandidates.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`student-report-guardian-choice${guardianForm.userId === item.id ? ' is-active' : ''}`}
                        onClick={() => {
                          handleGuardianFormChange('userId', item.id);
                          handleGuardianFormChange('relation', guardianForm.relation || '');
                        }}
                      >
                        <strong>{item.name}</strong>
                        <span>{item.email || 'بدون ایمیل'}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="student-report-guardian-form">
                  <label className="student-report-field">
                    <span>رابطه</span>
                    <input
                      value={guardianForm.relation}
                      onChange={(event) => handleGuardianFormChange('relation', event.target.value)}
                      placeholder="مثلاً پدر، مادر، سرپرست"
                    />
                  </label>
                  <label className="student-report-field">
                    <span>یادداشت</span>
                    <input
                      value={guardianForm.note}
                      onChange={(event) => handleGuardianFormChange('note', event.target.value)}
                      placeholder="یادداشت کوتاه"
                    />
                  </label>
                  <label className="student-report-check">
                    <input
                      type="checkbox"
                      checked={guardianForm.isPrimary}
                      onChange={(event) => handleGuardianFormChange('isPrimary', event.target.checked)}
                    />
                    <span>به‌عنوان سرپرست اصلی ثبت شود</span>
                  </label>
                  <button type="button" className="student-report-action-btn" onClick={handleLinkGuardian} disabled={guardianActionLoading}>
                    {guardianActionLoading ? 'در حال ثبت...' : 'وصل‌کردن والد/سرپرست'}
                  </button>
                </div>

                {!linkedGuardians.length && <div className="student-report-empty">هنوز والد یا سرپرستی به این شاگرد وصل نشده است.</div>}
                {!!linkedGuardians.length && (
                  <div className="student-report-card-list compact">
                    {linkedGuardians.map((guardian) => (
                      <div key={guardian.id || guardian.userId} className="student-report-mini-card">
                        <div>
                          <strong>{guardian.name || 'والد/سرپرست'}</strong>
                          <span>{guardian.relation || 'رابطه نامشخص'}</span>
                          <span>{guardian.email || guardian.phone || 'بدون راه تماس'}</span>
                        </div>
                        <div className="student-report-inline-actions">
                          {guardian.isPrimary ? <span className="student-report-status status-active">اصلی</span> : null}
                          <button
                            type="button"
                            className="student-report-link-btn danger"
                            onClick={() => handleUnlinkGuardian(guardian.id || guardian.userId)}
                            disabled={guardianActionLoading}
                          >
                            حذف اتصال
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">عضویت‌ها</span>
                    <h3>دفتر عضویت‌های شاگرد</h3>
                  </div>
                </div>
                {!profile.memberships?.length && <div className="student-report-empty">برای این شاگرد عضویتی ثبت نشده است.</div>}
                {!!profile.memberships?.length && (
                  <div className="student-report-card-list">
                    {profile.memberships.map((membership) => (
                      <div key={membership.id} className="student-report-mini-card">
                        <div>
                          <strong>{membership.schoolClass?.title || membership.course?.title || 'صنف'}</strong>
                          <span>{membership.academicYear?.label || membership.academicYear?.title || 'سال نامشخص'}</span>
                          <span>{membership.status || 'نامشخص'}</span>
                        </div>
                        <span className={`student-report-status status-${membership.isCurrent ? 'active' : 'inactive'}`}>
                          {membership.isCurrent ? 'فعلی' : 'آرشیفی'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">مالی</span>
                    <h3>خلاصه مالی</h3>
                  </div>
                </div>
                <div className="student-report-finance-summary">
                  <div>
                    <span>کل بل‌ها</span>
                    <strong>{nf.format(profile.finance?.summary?.billCount || 0)}</strong>
                  </div>
                  <div>
                    <span>کل پرداخت‌ها</span>
                    <strong>{nf.format(profile.finance?.summary?.receiptCount || 0)}</strong>
                  </div>
                  <div>
                    <span>قابل پرداخت</span>
                    <strong>{formatMoney(profile.finance?.summary?.totalDue || 0)}</strong>
                  </div>
                  <div>
                    <span>پرداخت‌شده</span>
                    <strong>{formatMoney(profile.finance?.summary?.totalPaid || 0)}</strong>
                  </div>
                </div>
                {!profile.finance?.bills?.length && <div className="student-report-empty">برای این شاگرد بل مالی ثبت نشده است.</div>}
                {!!profile.finance?.bills?.length && (
                  <div className="student-report-table-list">
                    {profile.finance.bills.slice(0, 6).map((bill) => (
                      <div key={bill.id} className="student-report-table-row">
                        <div>
                          <strong>{bill.billNumber || bill.periodLabel || 'بل مالی'}</strong>
                          <span>{bill.academicYearLabel || 'سال نامشخص'}</span>
                        </div>
                        <div>{formatMoney(bill.amountDue || 0)}</div>
                        <div>{formatMoney(bill.amountPaid || 0)}</div>
                        <div>{bill.status || 'نامشخص'}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="student-report-panel">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">نتایج</span>
                    <h3>کارنامه و نمرات</h3>
                  </div>
                </div>
                <div className="student-report-finance-summary">
                  <div>
                    <span>میانگین نمرات</span>
                    <strong>{nf.format(profile.results?.summary?.averageScore || 0)}</strong>
                  </div>
                  <div>
                    <span>بهترین نمره</span>
                    <strong>{nf.format(profile.results?.summary?.bestScore || 0)}</strong>
                  </div>
                </div>
                {!profile.results?.grades?.length && <div className="student-report-empty">برای این شاگرد نمره‌ای ثبت نشده است.</div>}
                {!!profile.results?.grades?.length && (
                  <div className="student-report-table-list">
                    {profile.results.grades.slice(0, 6).map((grade) => (
                      <div key={grade.id} className="student-report-table-row">
                        <div>
                          <strong>{grade.schoolClass?.title || grade.course?.title || 'صنف'}</strong>
                          <span>{grade.academicYear?.label || 'سال نامشخص'}</span>
                        </div>
                        <div>{nf.format(grade.totalScore || 0)}</div>
                        <div>{nf.format(grade.finalExamScore || 0)}</div>
                        <div>{formatDate(grade.updatedAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="student-report-panel student-report-panel-wide">
                <div className="student-report-panel-head compact">
                  <div>
                    <span className="student-report-eyebrow">رویدادها و اسناد</span>
                    <h3>اسناد، ملاحظات و timeline</h3>
                  </div>
                </div>
                <div className="student-report-timeline-grid">
                  <div>
                    <h4>Timeline</h4>
                    {!profile.timeline?.length && <div className="student-report-empty">رویدادی برای نمایش ثبت نشده است.</div>}
                    {!!profile.timeline?.length && (
                      <div className="student-report-timeline-list">
                        {visibleTimelineItems.map((item, index) => (
                          <div
                            key={`${item.type}-${item.id}`}
                            className={`student-report-timeline-item ${showAllTimeline && index >= TIMELINE_PREVIEW_COUNT ? 'is-revealed' : ''}`}
                            style={showAllTimeline && index >= TIMELINE_PREVIEW_COUNT
                              ? { animationDelay: `${Math.min(index - TIMELINE_PREVIEW_COUNT, 6) * 40}ms` }
                              : undefined}
                          >
                            <strong>{item.title}</strong>
                            <span>{item.meta || item.type}</span>
                            <p>{item.note || 'بدون یادداشت'}</p>
                          </div>
                        ))}
                        {hasMoreTimeline && (
                          <button
                            type="button"
                            className="student-report-activity-toggle"
                            onClick={toggleTimelineExpanded}
                          >
                            {showAllTimeline ? 'نمایش کمتر' : `نمایش ${hiddenTimelineCount} رویداد بیشتر`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <h4>فعالیت‌های اخیر</h4>
                    {!profile.activity?.logs?.length && <div className="student-report-empty">فعالیتی برای نمایش ثبت نشده است.</div>}
                    {!!profile.activity?.logs?.length && (
                      <div className="student-report-timeline-list">
                        {visibleActivityLogs.map((log, index) => (
                          <div
                            key={log.id}
                            className={`student-report-timeline-item ${showAllActivity && index >= ACTIVITY_PREVIEW_COUNT ? 'is-revealed' : ''}`}
                            style={showAllActivity && index >= ACTIVITY_PREVIEW_COUNT
                              ? { animationDelay: `${Math.min(index - ACTIVITY_PREVIEW_COUNT, 6) * 40}ms` }
                              : undefined}
                          >
                            <strong>{log.action || 'فعالیت سیستمی'}</strong>
                            <span>{formatDate(log.createdAt)}</span>
                            <p>{log.route || log.targetType || 'بدون مسیر'}</p>
                          </div>
                        ))}
                        {hasMoreActivity && (
                          <button
                            type="button"
                            className="student-report-activity-toggle"
                            onClick={toggleActivityExpanded}
                          >
                            {showAllActivity ? 'نمایش کمتر' : `نمایش ${hiddenActivityCount} فعالیت بیشتر`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            </section>
          </>
        ) : null}

        {!profileLoading && !profile && !listLoading && (
          <div className="student-report-message">پروفایل شاگرد برای نمایش آماده نیست.</div>
        )}
      </section>
    </div>
  );
}
