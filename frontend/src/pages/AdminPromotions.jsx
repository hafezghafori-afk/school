import React, { useEffect, useMemo, useRef, useState } from 'react';
import './AdminWorkspace.css';
import AfghanDateInput from '../components/ui/AfghanDateInput';

import {
  errorMessage,
  fetchJson,
  formatNumber,
  normalizeOptions,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';

const EMPTY_REFERENCE = {
  academicYears: [],
  classes: [],
  sessions: [],
  rules: [],
  activeYear: null
};

const EMPTY_READINESS_FORM = { academicYearId: '', classId: '' };

const EMPTY_PROMOTION_FORM = {
  academicYearId: '',
  classId: '',
  sessionId: '',
  ruleId: '',
  targetAcademicYearId: '',
  effectiveAt: ''
};

const EMPTY_TRANSACTION_FILTERS = {
  academicYearId: '',
  classId: '',
  promotionOutcome: '',
  transactionStatus: ''
};

const OUTCOME_OPTIONS = [
  { value: 'promoted', label: 'ارتقا' },
  { value: 'repeated', label: 'ناکام صنف' },
  { value: 'conditional', label: 'مشروط' },
  { value: 'graduated', label: 'فارغ' },
  { value: 'blocked', label: 'متوقف' },
  { value: 'skipped', label: 'رد شده' }
];

const STATUS_OPTIONS = [
  { value: 'applied', label: 'اعمال‌شده' },
  { value: 'rolled_back', label: 'rollback شده' }
];

function buildPayload(form) {
  const payload = {
    academicYearId: String(form.academicYearId || '').trim(),
    classId: String(form.classId || '').trim(),
    sessionId: String(form.sessionId || '').trim(),
    ruleId: String(form.ruleId || '').trim(),
    targetAcademicYearId: String(form.targetAcademicYearId || '').trim(),
    effectiveAt: String(form.effectiveAt || '').trim()
  };

  Object.keys(payload).forEach((key) => {
    if (!payload[key]) delete payload[key];
  });

  return payload;
}

function buildTransactionQuery(filters) {
  const params = new URLSearchParams();
  if (filters.academicYearId) params.set('academicYearId', filters.academicYearId);
  if (filters.classId) params.set('classId', filters.classId);
  if (filters.promotionOutcome) params.set('promotionOutcome', filters.promotionOutcome);
  if (filters.transactionStatus) params.set('transactionStatus', filters.transactionStatus);
  const qs = params.toString();
  return qs ? `/api/promotions/transactions?${qs}` : '/api/promotions/transactions';
}

function filterClassesByYear(classes, academicYearId) {
  return classes.filter((item) => !academicYearId || item.academicYear?.id === academicYearId);
}

// چون چند صنف می‌توانند اسم یکسان داشته باشند (مثلاً دو «صنف اول»)، همه‌جا کد/شناسهٔ صنف
// را هم کنار اسمش نشان می‌دهیم تا مشخص شود دقیقاً کدام صنف است.
function classOptionLabel(item) {
  const title = item?.title || item?.uiLabel || '---';
  return item?.code ? `${title} — ${item.code}` : title;
}

function classIdentifierText(item) {
  if (!item) return '---';
  const parts = [];
  if (item.code) parts.push(`کد: ${item.code}`);
  if (item.gradeLevel) parts.push(`صنف ${item.gradeLevel}${item.section ? ` ${item.section}` : ''}`);
  return parts.join(' • ') || '---';
}

function studentName(item) {
  return item?.sourceMembership?.student?.fullName || item?.targetMembership?.student?.fullName || '---';
}

function targetLabel(item) {
  const classTitle = item?.targetClass?.title || item?.targetMembership?.schoolClass?.title || '';
  const classCode = item?.targetClass?.code || item?.targetMembership?.schoolClass?.code || '';
  const yearTitle = item?.targetAcademicYear?.title || item?.targetMembership?.academicYear?.title || '';
  const classPart = [classTitle, classCode ? `(${classCode})` : ''].filter(Boolean).join(' ');
  return [classPart, yearTitle].filter(Boolean).join(' | ') || '---';
}

function outcomeLabel(value) {
  const key = String(value || '').trim();
  const labels = {
    promoted: 'ارتقا',
    repeated: 'ناکام صنف',
    conditional: 'مشروط',
    graduated: 'فارغ',
    blocked: 'متوقف',
    skipped: 'رد شده'
  };
  return labels[key] || key || '---';
}

function resultStatusLabel(value) {
  const key = String(value || '').trim();
  const labels = {
    passed: 'کامیاب',
    failed: 'ناکام',
    conditional: 'مشروط',
    distinction: 'عالی',
    temporary: 'موقت',
    placement: 'تعیین سویه',
    excused: 'معذور',
    absent: 'غایب',
    pending: 'در انتظار',
    blocked: 'متوقف'
  };
  return labels[key] || key || '---';
}

function policySummary(item) {
  const policy = item?.policyEvaluation || {};
  const failed = Array.isArray(policy.failedSubjects) ? policy.failedSubjects : [];
  const failedText = failed.length
    ? failed.slice(0, 3).map((subject) => `${subject.subjectTitle || 'مضمون'} (${formatNumber(subject.percentage || 0)})`).join('، ')
    : 'ندارد';
  const extra = failed.length > 3 ? ` +${formatNumber(failed.length - 3)}` : '';
  return {
    average: formatNumber(policy.averageScore ?? item?.averageScore ?? item?.percentage ?? 0),
    failedCount: formatNumber(policy.failedSubjectCount || 0),
    failedText: `${failedText}${extra}`,
    totalSubjects: formatNumber(policy.totalSubjects || 0),
    sheets: Array.isArray(policy.includedSessions) ? policy.includedSessions.length : 0,
    templates: Array.isArray(policy.sheetTemplates) ? policy.sheetTemplates : []
  };
}

function summarizeTransactions(items = []) {
  return items.reduce((summary, item) => {
    summary.total += 1;
    const outcome = String(item?.promotionOutcome || '').trim();
    const status = String(item?.transactionStatus || '').trim();
    if (summary[outcome] != null) summary[outcome] += 1;
    if (status === 'applied') summary.applied += 1;
    if (status === 'rolled_back') summary.rolledBack += 1;
    return summary;
  }, {
    total: 0,
    promoted: 0,
    repeated: 0,
    conditional: 0,
    graduated: 0,
    blocked: 0,
    applied: 0,
    rolledBack: 0
  });
}

// از همان تراکنش‌های اعمال‌شدهٔ فعلی (که ممکن است با نوار فیلتر پایین صفحه محدود شده باشند)
// بر اساس صنف مقصد گروه‌بندی می‌کند — بدون فراخوانی جدا به سرور.
function groupPromotedClasses(transactions = []) {
  const groups = new Map();
  transactions.forEach((item) => {
    if (String(item?.transactionStatus) !== 'applied' || !item?.targetClass?.id) return;
    const key = item.targetClass.id;
    if (!groups.has(key)) {
      groups.set(key, {
        classId: item.targetClass.id,
        title: item.targetClass.title || '---',
        code: item.targetClass.code || '',
        gradeLevel: item.targetClass.gradeLevel || '',
        section: item.targetClass.section || '',
        academicYear: item.targetAcademicYear?.title || item?.targetMembership?.academicYear?.title || '---',
        students: []
      });
    }
    groups.get(key).students.push({
      id: item.id,
      name: studentName(item),
      outcome: item.promotionOutcome,
      appliedAt: item.appliedAt
    });
  });
  return Array.from(groups.values()).sort((left, right) => right.students.length - left.students.length);
}

export default function AdminPromotions() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [readinessForm, setReadinessForm] = useState(EMPTY_READINESS_FORM);
  const [readinessResult, setReadinessResult] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  const [promotionForm, setPromotionForm] = useState(EMPTY_PROMOTION_FORM);
  const [preview, setPreview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [transactionFilters, setTransactionFilters] = useState(EMPTY_TRANSACTION_FILTERS);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [expandedPromotedClassId, setExpandedPromotedClassId] = useState('');

  // یادآوری آمادگی همان صنفی که برای ارتقا انتخاب شده (مستقل از کارت ۱)
  const [singleReadiness, setSingleReadiness] = useState(null);
  const [singleReadinessLoading, setSingleReadinessLoading] = useState(false);

  const promotionCardRef = useRef(null);

  const sessions = useMemo(() => normalizeOptions(reference.sessions, ['title', 'code']), [reference.sessions]);
  const rules = useMemo(() => normalizeOptions(reference.rules, ['name', 'code']), [reference.rules]);
  const academicYears = useMemo(() => normalizeOptions(reference.academicYears, ['title', 'code']), [reference.academicYears]);
  const classes = useMemo(() => normalizeOptions(reference.classes, ['title', 'code']), [reference.classes]);

  const readinessClassOptions = useMemo(() => filterClassesByYear(classes, readinessForm.academicYearId), [classes, readinessForm.academicYearId]);
  const promotionClassOptions = useMemo(() => filterClassesByYear(classes, promotionForm.academicYearId), [classes, promotionForm.academicYearId]);
  const transactionClassOptions = useMemo(() => filterClassesByYear(classes, transactionFilters.academicYearId), [classes, transactionFilters.academicYearId]);

  const readinessSelectedClass = useMemo(() => classes.find((item) => item.id === readinessForm.classId) || null, [classes, readinessForm.classId]);
  const promotionSelectedClass = useMemo(() => classes.find((item) => item.id === promotionForm.classId) || null, [classes, promotionForm.classId]);

  const transactionSummary = useMemo(() => summarizeTransactions(transactions), [transactions]);
  const summary = preview?.summary || transactionSummary;
  const promotedClassGroups = useMemo(() => groupPromotedClasses(transactions), [transactions]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const hydrateDefaults = (referenceData) => {
    setPromotionForm((current) => ({
      ...current,
      academicYearId: current.academicYearId || referenceData.activeYear?.id || '',
      sessionId: current.sessionId || referenceData.sessions?.[0]?.id || '',
      targetAcademicYearId: current.targetAcademicYearId || '',
      ruleId: current.ruleId || ''
    }));
    setReadinessForm((current) => ({
      ...current,
      academicYearId: current.academicYearId || referenceData.activeYear?.id || ''
    }));
  };

  const loadTransactions = async (filters = transactionFilters) => {
    try {
      const data = await fetchJson(buildTransactionQuery(filters));
      setTransactions(data.items || []);
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت تراکنش‌های ارتقا ناموفق بود.'), 'error');
    }
  };

  const loadAll = async ({ transactionId = '' } = {}) => {
    try {
      const referenceData = await fetchJson('/api/promotions/reference-data');
      setReference({
        academicYears: referenceData.academicYears || [],
        classes: referenceData.classes || [],
        sessions: referenceData.sessions || [],
        rules: referenceData.rules || [],
        activeYear: referenceData.activeYear || null
      });
      hydrateDefaults(referenceData);
      await loadTransactions();

      const preferredId = transactionId || selectedTransaction?.id || '';
      if (preferredId) {
        try {
          const detail = await fetchJson(`/api/promotions/transactions/${preferredId}`);
          setSelectedTransaction(detail.item || null);
        } catch {
          setSelectedTransaction(null);
        }
      } else {
        setSelectedTransaction(null);
      }
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت اطلاعات ارتقا ناموفق بود.'), 'error');
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // کارت ۱: آمادگی همان یک صنف مشخص‌شده با فیلتر سال+صنف.
  useEffect(() => {
    const academicYearId = String(readinessForm.academicYearId || '').trim();
    const classId = String(readinessForm.classId || '').trim();
    if (!academicYearId || !classId) {
      setReadinessResult(null);
      return undefined;
    }
    let cancelled = false;
    setReadinessLoading(true);
    fetchJson(`/api/result-tables/readiness?academicYearId=${academicYearId}&classId=${classId}`)
      .then((data) => {
        if (!cancelled) setReadinessResult(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setReadinessResult(null);
          showMessage(errorMessage(error, 'بررسی آمادگی صنف ناموفق بود.'), 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setReadinessLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readinessForm.academicYearId, readinessForm.classId]);

  // کارت ۲: یادآوری آمادگی همان صنف مشخصی که برای ارتقا انتخاب شده.
  useEffect(() => {
    const academicYearId = String(promotionForm.academicYearId || '').trim();
    const classId = String(promotionForm.classId || '').trim();
    if (!academicYearId || !classId) {
      setSingleReadiness(null);
      return undefined;
    }
    let cancelled = false;
    setSingleReadinessLoading(true);
    fetchJson(`/api/result-tables/readiness?academicYearId=${academicYearId}&classId=${classId}`)
      .then((data) => {
        if (!cancelled) setSingleReadiness(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setSingleReadiness(null);
          showMessage(errorMessage(error, 'بررسی آمادگی صنف ناموفق بود.'), 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setSingleReadinessLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionForm.academicYearId, promotionForm.classId]);

  const handleReadinessFormChange = (event) => {
    const { name, value } = event.target;
    setReadinessForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'academicYearId' ? { classId: '' } : {})
    }));
  };

  const handlePromotionFormChange = (event) => {
    const { name, value } = event.target;
    setPromotionForm((current) => ({
      ...current,
      [name]: value,
      // با عوض‌شدن سال، صنف قبلی ممکن است متعلق به سال دیگری باشد — پاک می‌شود تا کاربر دوباره انتخاب کند.
      ...(name === 'academicYearId' ? { classId: '' } : {})
    }));
  };

  const handleTransactionFilterChange = (event) => {
    const { name, value } = event.target;
    setTransactionFilters((current) => ({
      ...current,
      [name]: value,
      ...(name === 'academicYearId' ? { classId: '' } : {})
    }));
  };

  const applyTransactionFilters = () => {
    loadTransactions(transactionFilters);
  };

  const resetTransactionFilters = () => {
    setTransactionFilters(EMPTY_TRANSACTION_FILTERS);
    loadTransactions(EMPTY_TRANSACTION_FILTERS);
  };

  const goToPromotionCard = () => {
    setPromotionForm((current) => ({
      ...current,
      academicYearId: readinessForm.academicYearId,
      classId: readinessForm.classId
    }));
    showMessage('صنف انتخاب‌شده به کارت ارتقا منتقل شد.');
    if (promotionCardRef.current) {
      promotionCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const runPreview = async () => {
    try {
      setBusyAction('preview');
      const data = await postJson('/api/promotions/preview', buildPayload(promotionForm));
      setPreview(data);
      showMessage('پیش‌نمایش ارتقا به‌روز شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'پیش‌نمایش ارتقا ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const applyPromotions = async () => {
    try {
      setBusyAction('apply');
      const data = await postJson('/api/promotions/apply', buildPayload(promotionForm));
      setPreview(data);
      showMessage('ارتقاها اعمال شدند.', 'info');
      await loadAll();
    } catch (error) {
      showMessage(errorMessage(error, 'اعمال ارتقا ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const inspectTransaction = async (transactionId) => {
    try {
      setBusyAction(`inspect:${transactionId}`);
      const data = await fetchJson(`/api/promotions/transactions/${transactionId}`);
      setSelectedTransaction(data.item || null);
    } catch (error) {
      showMessage(errorMessage(error, 'بارگذاری جزئیات تراکنش ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const rollbackTransaction = async (transaction) => {
    const reason = window.prompt('دلیل rollback را وارد کنید:', transaction?.rollbackReason || '');
    if (reason === null) return;

    try {
      setBusyAction(`rollback:${transaction.id}`);
      const data = await postJson(`/api/promotions/rollback/${transaction.id}`, { reason: String(reason || '').trim() });
      setSelectedTransaction(data.item || null);
      setPreview(null);
      showMessage('تراکنش ارتقا rollback شد.', 'info');
      await loadAll({ transactionId: transaction.id });
    } catch (error) {
      showMessage(errorMessage(error, 'rollback ارتقا ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="admin-workspace-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge">Phase 6</span>
            <span className="admin-workspace-badge info">Preview / Apply / Rollback</span>
          </div>
          <h1>مرکز ارتقا صنف</h1>
          <p>اول در کارت «بررسی آمادگی» یک صنف مشخص را چک کن، بعد در کارت «ارتقا» همان صنف را پیش‌نمایش و اعمال کن.</p>
          <div className="admin-workspace-meta">
            <span>تعداد سشن‌ها: {formatNumber(sessions.length)}</span>
            <span>تعداد قوانین: {formatNumber(rules.length)}</span>
            <span>تراکنش‌ها: {formatNumber(transactions.length)}</span>
          </div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="5">
            <h2>۱. بررسی آمادگی صنف برای ارتقا</h2>
            <p className="admin-workspace-subtitle">سال و صنف را انتخاب کن تا فقط وضعیت آمادگی همان یک صنف بررسی شود — بدون هیچ اقدامی، فقط گزارش.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="readiness-academic-year">سال تحصیلی</label>
                  <select id="readiness-academic-year" name="academicYearId" value={readinessForm.academicYearId} onChange={handleReadinessFormChange}>
                    <option value="">انتخاب سال</option>
                    {academicYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="readiness-class">صنف</label>
                  <select id="readiness-class" name="classId" value={readinessForm.classId} onChange={handleReadinessFormChange}>
                    <option value="">انتخاب صنف</option>
                    {readinessClassOptions.map((item) => (
                      <option key={item.id} value={item.id}>{classOptionLabel(item)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!readinessForm.academicYearId || !readinessForm.classId ? (
              <div className="admin-workspace-empty">سال و صنف را انتخاب کن.</div>
            ) : readinessLoading ? (
              <div className="admin-workspace-empty">در حال بررسی آمادگی...</div>
            ) : readinessResult ? (
              <div className="admin-workspace-form">
                <div className="admin-workspace-badges">
                  <span className={`admin-workspace-badge ${readinessResult.ready ? 'good' : ''}`}>{readinessResult.ready ? 'آماده برای ارتقا' : 'ناتکمیل'}</span>
                  <span className="admin-workspace-badge info">شناسهٔ صنف — {classIdentifierText(readinessSelectedClass)}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>پیشرفت: {formatNumber(readinessResult.progress?.percentage || 0)}٪</span>
                  <span>مضامین تکمیل‌شده: {formatNumber(readinessResult.progress?.completedSubjectCount || 0)} / {formatNumber(readinessResult.progress?.subjectCount || 0)}</span>
                </div>
                {readinessResult.issues?.length ? (
                  <ul>
                    {readinessResult.issues.slice(0, 10).map((issue, index) => (
                      <li key={`${issue.code}-${issue.subjectId || index}`}>{issue.message}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="admin-workspace-empty">مشکلی برای این صنف ثبت نشده.</div>
                )}
                {readinessResult.ready && (
                  <div className="admin-workspace-actions">
                    <button type="button" className="admin-workspace-button" onClick={goToPromotionCard}>برو به ارتقا</button>
                  </div>
                )}
              </div>
            ) : null}
          </article>

          <article className="admin-workspace-card" data-span="7" ref={promotionCardRef}>
            <h2>۲. ارتقا صنف به صنف و سال بعدی</h2>
            <p className="admin-workspace-subtitle">سال و صنف مبدا را انتخاب کن (یا از کارت آمادگی «برو به ارتقا» بزن)، پیش‌نمایش بگیر و بعد apply یا rollback انجام بده.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-academic-year">سال تحصیلی مبدا</label>
                  <select id="promotion-academic-year" name="academicYearId" value={promotionForm.academicYearId} onChange={handlePromotionFormChange}>
                    <option value="">انتخاب سال</option>
                    {academicYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-class">صنف مبدا</label>
                  <select id="promotion-class" name="classId" value={promotionForm.classId} onChange={handlePromotionFormChange}>
                    <option value="">انتخاب صنف</option>
                    {promotionClassOptions.map((item) => (
                      <option key={item.id} value={item.id}>{classOptionLabel(item)}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-session">سشن امتحان (اختیاری)</label>
                  <select id="promotion-session" name="sessionId" value={promotionForm.sessionId} onChange={handlePromotionFormChange}>
                    <option value="">بدون سشن مشخص</option>
                    {sessions.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-rule">قانون ارتقا</label>
                  <select id="promotion-rule" name="ruleId" value={promotionForm.ruleId} onChange={handlePromotionFormChange}>
                    <option value="">تشخیص خودکار</option>
                    {rules.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-target-year">سال هدف</label>
                  <select id="promotion-target-year" name="targetAcademicYearId" value={promotionForm.targetAcademicYearId} onChange={handlePromotionFormChange}>
                    <option value="">تشخیص خودکار</option>
                    {academicYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-effective-at">تاریخ اثر</label>
                  <AfghanDateInput id="promotion-effective-at" name="effectiveAt" value={promotionForm.effectiveAt} onChange={(value) => setPromotionForm((current) => ({ ...current, effectiveAt: value }))} showGregorianEquivalent />
                </div>
              </div>
              {promotionForm.classId && (
                <div className="admin-workspace-meta">
                  <span>شناسهٔ صنف انتخاب‌شده — {classIdentifierText(promotionSelectedClass)}</span>
                </div>
              )}
              {promotionForm.academicYearId && promotionForm.classId && (
                <div className="admin-workspace-message">
                  {singleReadinessLoading ? (
                    'در حال بررسی آمادگی صنف...'
                  ) : singleReadiness?.ready ? (
                    <span><span className="admin-workspace-badge good">آماده برای ارتقا</span> همهٔ مضامین این صنف چهارنیم‌ماهه و سالانهٔ تأییدشده دارند.</span>
                  ) : singleReadiness ? (
                    <span>
                      <span className="admin-workspace-badge">ناتکمیل</span> این صنف هنوز آمادهٔ ارتقا نیست:
                      <ul>
                        {(singleReadiness.issues || []).slice(0, 5).map((issue, index) => (
                          <li key={`${issue.code}-${issue.subjectId || index}`}>{issue.message}</li>
                        ))}
                      </ul>
                    </span>
                  ) : null}
                </div>
              )}
              <div className="admin-workspace-actions">
                <button type="button" className="admin-workspace-button-ghost" onClick={() => loadAll()} disabled={!!busyAction}>بازخوانی</button>
                <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || (!promotionForm.sessionId && !(promotionForm.academicYearId && promotionForm.classId))}>پیش‌نمایش</button>
                <button type="button" className="admin-workspace-button-secondary" onClick={applyPromotions} disabled={busyAction === 'apply' || (!promotionForm.sessionId && !(promotionForm.academicYearId && promotionForm.classId))}>اعمال ارتقا</button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>خلاصه وضعیت</h2>
            <p className="admin-workspace-subtitle">اگر preview باز باشد، این خلاصه از همان خروجی خوانده می‌شود؛ در غیر این صورت از تراکنش‌های ثبت‌شده ساخته می‌شود.</p>
            <div className="admin-workspace-summary">
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.total)}</strong><span>کل</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.promoted)}</strong><span>ارتقا یافته</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.repeated)}</strong><span>تکرار صنف</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.conditional)}</strong><span>مشروط</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.graduated)}</strong><span>فارغ</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.blocked)}</strong><span>مسدود</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.applied || 0)}</strong><span>اعمال‌شده</span></div>
              <div className="admin-workspace-stat"><strong>{formatNumber(summary.rolledBack || 0)}</strong><span>rollback</span></div>
            </div>
          </article>

          <article className="admin-workspace-card" data-span="7">
            <h2>پیش‌نمایش فعلی</h2>
            <p className="admin-workspace-subtitle">
              {preview?.rule?.evaluationMode === 'official_general_result'
                ? 'سیستم دقیقاً بر اساس پالیسی رسمی «نتایج عمومی» (چهارنیم‌ماهه + سالانه، ۵۵ نمره، حداکثر ۲ مضمون مشروط) تصمیم را محاسبه می‌کند.'
                : 'سیستم بر اساس پالیسی قانون انتخاب‌شده تصمیم را محاسبه می‌کند.'}
              {preview?.items?.length > 0 && promotionSelectedClass && ` صنف: ${classOptionLabel(promotionSelectedClass)}`}
            </p>
            {preview?.items?.length ? (
              <div className="admin-workspace-table-wrap">
                <table className="admin-workspace-table">
                  <thead>
                    <tr>
                      <th>متعلم</th>
                      <th>نتیجه</th>
                      <th>تصمیم</th>
                      <th>میانگین</th>
                      <th>مضامین ناکام</th>
                      <th>هدف</th>
                      <th>قابل اعمال</th>
                      <th>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item, index) => {
                      const details = policySummary(item);
                      return (
                        <tr key={item.examResultId || item.sourceMembership?.id || index}>
                          <td>{studentName(item)}</td>
                          <td>{resultStatusLabel(item.sourceResultStatus)}</td>
                          <td>{outcomeLabel(item.computedOutcome)}</td>
                          <td>{details.average}</td>
                          <td title={details.failedText}>{details.failedCount} / {details.totalSubjects}</td>
                          <td>{targetLabel(item)}</td>
                          <td>
                            <span className={`admin-workspace-badge ${item.canApply ? 'good' : ''}`}>{item.canApply ? 'بله' : 'خیر'}</span>
                          </td>
                          <td>{item.issueCode || '---'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="admin-workspace-meta">
                  <span>شقه‌های شامل: {formatNumber(policySummary(preview.items[0]).sheets)}</span>
                  <span>قالب‌ها: {policySummary(preview.items[0]).templates.map((item) => item.title || item.code).filter(Boolean).join('، ') || '---'}</span>
                </div>
              </div>
            ) : (
              <div className="admin-workspace-empty">هنوز پیش‌نمایشی اجرا نشده است.</div>
            )}
          </article>

          <article className="admin-workspace-card" data-span="5">
            <h2>جزئیات تراکنش</h2>
            <p className="admin-workspace-subtitle">روی هر تراکنش کلیک کن تا snapshot و وضعیت rollback آن را ببینی.</p>
            {selectedTransaction ? (
              <div className="admin-workspace-form">
                <div className="admin-workspace-badges">
                  <span className="admin-workspace-badge info">{selectedTransaction.transactionStatus || '---'}</span>
                  <span className="admin-workspace-badge">{selectedTransaction.promotionOutcome || '---'}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>متعلم: {studentName(selectedTransaction)}</span>
                  <span>Target: {targetLabel(selectedTransaction)}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>Applied: {toLocaleDateTime(selectedTransaction.appliedAt)}</span>
                  <span>Rollback: {toLocaleDateTime(selectedTransaction.rolledBackAt)}</span>
                </div>
                <div className="admin-workspace-meta">
                  <span>وضعیت قبل از apply: {selectedTransaction.sourceMembershipStatusBefore || '---'}</span>
                  <span>دلیل rollback: {selectedTransaction.rollbackReason || '---'}</span>
                </div>
                {selectedTransaction.transactionStatus === 'applied' && (
                  <div className="admin-workspace-inline-actions">
                    <button
                      type="button"
                      className="admin-workspace-button-danger"
                      onClick={() => rollbackTransaction(selectedTransaction)}
                      disabled={busyAction === `rollback:${selectedTransaction.id}`}
                    >
                      rollback
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="admin-workspace-empty">هنوز تراکنشی برای مشاهده انتخاب نشده است.</div>
            )}
          </article>

          <article className="admin-workspace-card">
            <h2>تراکنش‌های ثبت‌شده</h2>
            <div className="admin-workspace-form-grid">
              <div className="admin-workspace-field">
                <label htmlFor="tx-filter-year">سال تحصیلی</label>
                <select id="tx-filter-year" name="academicYearId" value={transactionFilters.academicYearId} onChange={handleTransactionFilterChange}>
                  <option value="">همهٔ سال‌ها</option>
                  {academicYears.map((item) => (
                    <option key={item.id} value={item.id}>{item.uiLabel}</option>
                  ))}
                </select>
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="tx-filter-class">صنف</label>
                <select id="tx-filter-class" name="classId" value={transactionFilters.classId} onChange={handleTransactionFilterChange}>
                  <option value="">همهٔ صنوف</option>
                  {transactionClassOptions.map((item) => (
                    <option key={item.id} value={item.id}>{classOptionLabel(item)}</option>
                  ))}
                </select>
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="tx-filter-outcome">نتیجه</label>
                <select id="tx-filter-outcome" name="promotionOutcome" value={transactionFilters.promotionOutcome} onChange={handleTransactionFilterChange}>
                  <option value="">همهٔ نتایج</option>
                  {OUTCOME_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="tx-filter-status">وضعیت</label>
                <select id="tx-filter-status" name="transactionStatus" value={transactionFilters.transactionStatus} onChange={handleTransactionFilterChange}>
                  <option value="">همهٔ وضعیت‌ها</option>
                  {STATUS_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="admin-workspace-actions">
              <button type="button" className="admin-workspace-button" onClick={applyTransactionFilters}>اعمال فیلتر</button>
              <button type="button" className="admin-workspace-button-ghost" onClick={resetTransactionFilters}>پاک‌کردن فیلتر</button>
            </div>
            <div className="admin-workspace-table-wrap">
              <table className="admin-workspace-table">
                <thead>
                  <tr>
                    <th>متعلم</th>
                    <th>Outcome</th>
                    <th>وضعیت</th>
                    <th>Target</th>
                    <th>Applied</th>
                    <th>Rollback</th>
                    <th>اقدام</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length ? transactions.map((item) => (
                    <tr key={item.id}>
                      <td>{studentName(item)}</td>
                      <td>{item.promotionOutcome || '---'}</td>
                      <td>{item.transactionStatus || '---'}</td>
                      <td>{targetLabel(item)}</td>
                      <td>{toLocaleDateTime(item.appliedAt)}</td>
                      <td>{toLocaleDateTime(item.rolledBackAt)}</td>
                      <td>
                        <div className="admin-workspace-inline-actions">
                          <button
                            type="button"
                            className="admin-workspace-button-ghost"
                            onClick={() => inspectTransaction(item.id)}
                            disabled={busyAction === `inspect:${item.id}`}
                          >
                            جزئیات
                          </button>
                          {item.transactionStatus === 'applied' && (
                            <button
                              type="button"
                              className="admin-workspace-button-danger"
                              onClick={() => rollbackTransaction(item)}
                              disabled={busyAction === `rollback:${item.id}`}
                            >
                              rollback
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7">
                        <div className="admin-workspace-empty">هنوز تراکنشی ثبت نشده است.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="admin-workspace-card">
            <h2>صنف‌های ارتقا یافته</h2>
            <p className="admin-workspace-subtitle">صنف‌های مقصدی که شاگردی از طریق ارتقا به آن‌ها منتقل شده — بر اساس همان تراکنش‌های فیلترشدهٔ بالا.</p>
            {promotedClassGroups.length ? (
              <div className="admin-workspace-table-wrap">
                <table className="admin-workspace-table">
                  <thead>
                    <tr>
                      <th>صنف مقصد</th>
                      <th>شناسهٔ صنف</th>
                      <th>سال تعلیمی</th>
                      <th>تعداد شاگردان</th>
                      <th>اقدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotedClassGroups.map((group) => (
                      <React.Fragment key={group.classId}>
                        <tr>
                          <td>{group.title}</td>
                          <td>{classIdentifierText(group)}</td>
                          <td>{group.academicYear}</td>
                          <td>{formatNumber(group.students.length)}</td>
                          <td>
                            <button
                              type="button"
                              className="admin-workspace-button-ghost"
                              onClick={() => setExpandedPromotedClassId((current) => (current === group.classId ? '' : group.classId))}
                            >
                              {expandedPromotedClassId === group.classId ? 'بستن لیست ▲' : 'لیست شاگردان ▼'}
                            </button>
                          </td>
                        </tr>
                        {expandedPromotedClassId === group.classId && (
                          <tr>
                            <td colSpan="5">
                              <ul>
                                {group.students.map((student) => (
                                  <li key={student.id}>{student.name} — {outcomeLabel(student.outcome)} — {toLocaleDateTime(student.appliedAt)}</li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-workspace-empty">هنوز هیچ صنفی از طریق ارتقا شاگرد نگرفته است.</div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
