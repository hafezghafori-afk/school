import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';
import './AdminPromotions.css';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import {
  errorMessage,
  fetchJson,
  formatNumber,
  normalizeOptions,
  postJson
} from './adminWorkspaceUtils';
import { formatAfghanDate } from '../utils/afghanDate';
import PromotionYearBoard from './promotions/PromotionYearBoard';
import PromotionStudentsTable, { reliefKey } from './promotions/PromotionStudentsTable';
import PromotionBatches from './promotions/PromotionBatches';
import PromotionPrintSheet from './promotions/PromotionPrintSheet';
import {
  academicYearOrder,
  classLabel,
  formatAmount,
  issueLabel,
  outcomeLabel,
  yearLabel
} from './promotions/promotionLabels';

// «مرکز ارتقا صنف»: promote one class at a time, step by step - the source
// year and class, the target year and the classes that take the promoted and
// the repeating students, the dates, every student's decision and finance,
// then a final check before one confirmed apply. Every change re-runs the
// server preview, so what is shown is what the apply will do.

const STEPS = [
  { key: 1, title: 'مبدا', hint: 'سال و صنف مبدا' },
  { key: 2, title: 'مقصد', hint: 'سال و صنف مقصد' },
  { key: 3, title: 'تاریخ‌ها', hint: 'ختم و شروع عضویت' },
  { key: 4, title: 'شاگردان', hint: 'تصمیم، صنف و مالی' },
  { key: 5, title: 'تأیید', hint: 'بررسی و اعمال' }
];

const EMPTY_FORM = {
  academicYearId: '',
  classId: '',
  sessionId: '',
  ruleId: '',
  targetAcademicYearId: '',
  promotedClassId: '',
  repeatClassId: '',
  sourceEndAt: '',
  targetStartAt: ''
};

const EMPTY_REFERENCE = { academicYears: [], classes: [], sessions: [], rules: [], activeYear: null };
const FORM_KEYS = Object.keys(EMPTY_FORM);
const fmtDay = (value) => formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) || '---';

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function buildPayload(form, overrides, reliefPicks) {
  const payload = {};
  FORM_KEYS.forEach((key) => {
    const value = String(form[key] || '').trim();
    if (value) payload[key] = value;
  });
  const studentOverrides = Object.entries(overrides)
    .filter(([, override]) => override && (override.exclude || override.targetClassId))
    .map(([membershipId, override]) => ({
      membershipId,
      ...(override.targetClassId ? { targetClassId: override.targetClassId } : {}),
      ...(override.exclude ? { exclude: true } : {})
    }));
  if (studentOverrides.length) payload.studentOverrides = studentOverrides;
  const reliefCarryOver = Object.entries(reliefPicks)
    .map(([membershipId, picks]) => ({
      membershipId,
      reliefs: Object.keys(picks || {})
        .filter((key) => picks[key])
        .map((key) => {
          const [sourceModel, id] = key.split(':');
          return { sourceModel, id };
        })
    }))
    .filter((entry) => entry.reliefs.length);
  if (reliefCarryOver.length) payload.reliefCarryOver = reliefCarryOver;
  return payload;
}

function summarizeForApply(items = [], overrides = {}) {
  const moving = new Map();
  let conditional = 0;
  let graduated = 0;
  const notApplied = [];
  items.forEach((item) => {
    if (!item.canApply || overrides[item.studentMembershipId]?.exclude) {
      notApplied.push(item);
      return;
    }
    if (item.computedOutcome === 'conditional') {
      conditional += 1;
      return;
    }
    if (item.computedOutcome === 'graduated') {
      graduated += 1;
      return;
    }
    const key = `${item.computedOutcome}:${item.targetClass?.id || ''}`;
    const entry = moving.get(key) || { outcome: item.computedOutcome, targetClass: item.targetClass, count: 0 };
    entry.count += 1;
    moving.set(key, entry);
  });
  return { moving: Array.from(moving.values()), conditional, graduated, notApplied };
}

export default function AdminPromotions() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [form, setForm] = useState(EMPTY_FORM);
  const [overrides, setOverrides] = useState({});
  const [reliefPicks, setReliefPicks] = useState({});
  const [step, setStep] = useState(1);
  const [board, setBoard] = useState(null);
  const [boardLoading, setBoardLoading] = useState(false);
  const [readiness, setReadiness] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [applying, setApplying] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [message, setMessage] = useState({ text: '', tone: 'info' });
  const [printBatch, setPrintBatch] = useState(null);

  const showMessage = useCallback((text, tone = 'info') => setMessage({ text, tone }), []);
  const refreshAll = useCallback(() => setRefreshKey((current) => current + 1), []);

  const academicYears = useMemo(() => normalizeOptions(reference.academicYears, ['title', 'code']), [reference.academicYears]);
  const rules = useMemo(() => normalizeOptions(reference.rules, ['name', 'code']), [reference.rules]);
  const sourceYear = academicYears.find((item) => item.id === form.academicYearId) || null;
  const targetYearOptions = useMemo(() => academicYears.filter((year) => (
    year.id !== form.academicYearId && !['before', 'same'].includes(academicYearOrder(sourceYear, year))
  )), [academicYears, form.academicYearId, sourceYear]);
  const sessions = useMemo(() => normalizeOptions(reference.sessions, ['title', 'code'])
    .filter((session) => (!form.academicYearId || session.academicYear?.id === form.academicYearId)
      && (!form.classId || session.schoolClass?.id === form.classId)), [reference.sessions, form.academicYearId, form.classId]);
  const plan = preview?.plan || null;
  const sourceClass = board?.classes?.find((row) => row.schoolClass.id === form.classId)?.schoolClass || plan?.sourceClass || null;

  useEffect(() => {
    let cancelled = false;
    fetchJson('/api/promotions/reference-data')
      .then((data) => {
        if (cancelled) return;
        setReference({
          academicYears: data.academicYears || [],
          classes: data.classes || [],
          sessions: data.sessions || [],
          rules: data.rules || [],
          activeYear: data.activeYear || null
        });
        setForm((current) => ({ ...current, academicYearId: current.academicYearId || data.activeYear?.id || '' }));
      })
      .catch((error) => {
        if (!cancelled) showMessage(errorMessage(error, 'دریافت اطلاعات ارتقا ناموفق بود.'), 'error');
      });
    return () => { cancelled = true; };
  }, [showMessage]);

  useEffect(() => {
    if (!form.academicYearId) {
      setBoard(null);
      return undefined;
    }
    let cancelled = false;
    setBoardLoading(true);
    fetchJson(`/api/promotions/year-board?academicYearId=${encodeURIComponent(form.academicYearId)}`)
      .then((data) => { if (!cancelled) setBoard(data); })
      .catch((error) => {
        if (!cancelled) {
          setBoard(null);
          showMessage(errorMessage(error, 'دریافت صنف‌های این سال ناموفق بود.'), 'error');
        }
      })
      .finally(() => { if (!cancelled) setBoardLoading(false); });
    return () => { cancelled = true; };
  }, [form.academicYearId, refreshKey, showMessage]);

  useEffect(() => {
    if (!form.academicYearId || !form.classId) {
      setReadiness(null);
      return undefined;
    }
    let cancelled = false;
    fetchJson(`/api/result-tables/readiness?academicYearId=${encodeURIComponent(form.academicYearId)}&classId=${encodeURIComponent(form.classId)}`)
      .then((data) => { if (!cancelled) setReadiness(data); })
      .catch(() => { if (!cancelled) setReadiness(null); });
    return () => { cancelled = true; };
  }, [form.academicYearId, form.classId, refreshKey]);

  const payload = useMemo(() => buildPayload(form, overrides, reliefPicks), [form, overrides, reliefPicks]);
  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (!form.academicYearId || !form.classId) {
      setPreview(null);
      setPreviewError('');
      setPreviewLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const data = await postJson('/api/promotions/preview', JSON.parse(payloadKey));
        if (!cancelled) {
          setPreview(data);
          setPreviewError('');
        }
      } catch (error) {
        if (!cancelled) {
          setPreview(null);
          setPreviewError(errorMessage(error, 'پیش‌نمایش ارتقا ناموفق بود.'));
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.academicYearId, form.classId, payloadKey, refreshKey]);

  // Print only once the sheet is mounted and the fonts have loaded - either
  // one missing prints a blank page.
  useEffect(() => {
    if (!printBatch) return undefined;
    let cancelled = false;
    const finish = () => setPrintBatch(null);
    window.addEventListener('afterprint', finish);
    (async () => {
      for (let attempt = 0; attempt < 20 && !document.querySelector('.promotion-print'); attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      if (document.fonts?.ready) {
        await Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 3000))]).catch(() => null);
      }
      if (!cancelled) window.print();
    })();
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', finish);
    };
  }, [printBatch]);

  const resetStudentChoices = () => {
    setOverrides({});
    setReliefPicks({});
  };

  const selectSourceYear = (academicYearId) => {
    setForm((current) => ({ ...EMPTY_FORM, academicYearId, ruleId: current.ruleId }));
    resetStudentChoices();
    setLastBatch(null);
    setStep(1);
  };

  const selectSourceClass = (classId) => {
    setForm((current) => ({ ...EMPTY_FORM, academicYearId: current.academicYearId, ruleId: current.ruleId, classId }));
    resetStudentChoices();
    setLastBatch(null);
  };

  const selectTargetYear = (targetAcademicYearId) => {
    setForm((current) => ({ ...current, targetAcademicYearId, promotedClassId: '', repeatClassId: '', targetStartAt: '' }));
    // A per-student class belongs to the old target year.
    setOverrides((current) => Object.fromEntries(Object.entries(current).map(([id, override]) => [id, { ...override, targetClassId: '' }])));
  };

  const updateForm = (patch) => setForm((current) => ({ ...current, ...patch }));

  const changeOverride = (membershipId, patch) => setOverrides((current) => ({
    ...current,
    [membershipId]: { ...(current[membershipId] || {}), ...patch }
  }));

  const toggleRelief = (membershipId, key, checked) => setReliefPicks((current) => ({
    ...current,
    [membershipId]: { ...(current[membershipId] || {}), [key]: checked }
  }));

  const setAllReliefs = (checked) => {
    const next = {};
    (preview?.items || []).forEach((item) => {
      if (!item.canApply || overrides[item.studentMembershipId]?.exclude) return;
      if (!['promoted', 'repeated', 'conditional'].includes(item.computedOutcome)) return;
      const reliefs = item.finance?.reliefs || [];
      if (!reliefs.length) return;
      next[item.studentMembershipId] = Object.fromEntries(reliefs.map((relief) => [reliefKey(relief), checked]));
    });
    setReliefPicks(next);
  };

  const applySummary = useMemo(() => summarizeForApply(preview?.items || [], overrides), [preview, overrides]);
  const reliefCount = useMemo(() => (payload.reliefCarryOver || []).reduce((sum, entry) => sum + entry.reliefs.length, 0), [payload]);
  const studentsWithReliefs = (preview?.items || []).filter((item) => item.finance?.reliefs?.length && item.canApply).length;

  const applyPromotion = async () => {
    if (!plan?.canApply || applying) return;
    const lines = [
      `اعمال ارتقای «${classLabel(sourceClass)}» از سال ${yearLabel(plan.sourceAcademicYear)} به سال ${yearLabel(plan.targetAcademicYear)}:`,
      ...applySummary.moving.map((group) => `- ${formatNumber(group.count)} نفر ${outcomeLabel(group.outcome)} ← ${classLabel(group.targetClass)}`),
      applySummary.conditional ? `- ${formatNumber(applySummary.conditional)} نفر مشروط (تا نتیجهٔ چانس دوم در همین صنف می‌مانند)` : '',
      applySummary.graduated ? `- ${formatNumber(applySummary.graduated)} نفر فارغ` : '',
      applySummary.notApplied.length ? `- ${formatNumber(applySummary.notApplied.length)} نفر شامل نمی‌شوند` : '',
      reliefCount ? `- ${formatNumber(reliefCount)} تخفیف/معافیت به سال جدید منتقل می‌شود` : '',
      `ختم عضویت: ${fmtDay(plan.sourceEndAt)} | شروع در صنف جدید: ${fmtDay(plan.targetStartAt)}`,
      'ادامه می‌دهید؟'
    ].filter(Boolean);
    if (!window.confirm(lines.join('\n'))) return;
    setApplying(true);
    try {
      const data = await postJson('/api/promotions/apply', payload);
      setLastBatch(data.batch || null);
      resetStudentChoices();
      showMessage(`ارتقای «${classLabel(data.batch?.sourceClass || sourceClass)}» اعمال شد.`, 'info');
      refreshAll();
    } catch (error) {
      const blockers = error?.data?.details?.blockers || [];
      showMessage(`${errorMessage(error, 'اعمال ارتقا ناموفق بود.')}${blockers.length ? ` — ${blockers.map((item) => item.message).join(' | ')}` : ''}`, 'error');
    } finally {
      setApplying(false);
    }
  };

  const canGoNext = step < STEPS.length && (step !== 1 || Boolean(form.classId));

  return (
    <div className="admin-workspace-page promotion-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <h1>مرکز ارتقا صنف</h1>
          <p>هر بار یک صنف: اول سال و صنف مبدا، بعد سال و صنف مقصد، تاریخ‌ها، تصمیم و وضعیت مالی هر شاگرد، و در آخر یک تأیید.</p>
        </section>

        {message.text ? (
          <div className={`admin-workspace-message ${message.tone === 'error' ? 'error' : ''}`} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
            <button type="button" className="promotion-message-close" onClick={() => setMessage({ text: '', tone: 'info' })} aria-label="بستن پیام">×</button>
          </div>
        ) : null}

        <nav className="promotion-steps" aria-label="مراحل ارتقا">
          {STEPS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`promotion-step ${step === item.key ? 'is-active' : ''} ${step > item.key ? 'is-done' : ''}`}
              onClick={() => setStep(item.key)}
              disabled={item.key > 1 && !form.classId}
              aria-current={step === item.key ? 'step' : undefined}
              data-testid={`promotion-step-${item.key}`}
            >
              <span className="promotion-step-number">{formatNumber(item.key)}</span>
              <span className="promotion-step-text">
                <strong>{item.title}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="admin-workspace-grid">
        <section className="admin-workspace-card promotion-step-card">
          {step === 1 ? (
            <>
              <h2>۱. مبدا: سال تعلیمی و صنف</h2>
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-source-year">سال تعلیمی مبدا</label>
                  <select id="promotion-source-year" value={form.academicYearId} onChange={(event) => selectSourceYear(event.target.value)}>
                    <option value="">انتخاب سال</option>
                    {academicYears.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}
                  </select>
                </div>
              </div>
              <p className="admin-workspace-subtitle">صنف مبدا را از لیست زیر انتخاب کنید. وضعیت ارتقای هر صنف این سال کنار آن نوشته شده است.</p>
              <PromotionYearBoard board={board} loading={boardLoading} selectedClassId={form.classId} onSelect={selectSourceClass} />

              {/* Class readiness is the official-result check; other rules
                  report missing marks per student in the preview instead. */}
              {form.classId && readiness && (!preview?.rule || preview.rule.evaluationMode === 'official_general_result') ? (
                <div className="promotion-readiness">
                  <span className={`admin-workspace-badge ${readiness.ready ? 'good' : 'warn'}`}>
                    {readiness.ready ? 'نتایج این صنف کامل است' : 'نتایج این صنف ناتکمیل است'}
                  </span>
                  {!readiness.ready && readiness.issues?.length ? (
                    <ul>
                      {readiness.issues.slice(0, 5).map((issue, index) => (
                        <li key={`${issue.code}-${issue.subjectId || index}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {form.classId && preview?.session && preview?.rule?.evaluationMode !== 'official_general_result' ? (
                <p className="promotion-inline-note">
                  قانون ارتقای این صنف از سشن امتحان «{preview.session.title || preview.session.code}» می‌خواند؛ در «تنظیمات بیشتر» می‌توانید آن را عوض کنید.
                </p>
              ) : null}

              {form.classId ? (
                <details className="promotion-advanced">
                  <summary>تنظیمات بیشتر: قانون ارتقا و سشن امتحان</summary>
                  <div className="admin-workspace-form-grid">
                    <div className="admin-workspace-field">
                      <label htmlFor="promotion-rule">قانون ارتقا</label>
                      <select id="promotion-rule" value={form.ruleId} onChange={(event) => updateForm({ ruleId: event.target.value })}>
                        <option value="">{`خودکار${preview?.rule?.name ? `: ${preview.rule.name}` : ''}`}</option>
                        {rules.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}
                      </select>
                    </div>
                    <div className="admin-workspace-field">
                      <label htmlFor="promotion-session">سشن امتحان (برای قانون‌های قدیمی)</label>
                      <select id="promotion-session" value={form.sessionId} onChange={(event) => updateForm({ sessionId: event.target.value })}>
                        <option value="">{`خودکار${preview?.session && !form.sessionId ? `: ${preview.session.title || preview.session.code}` : ''}`}</option>
                        {sessions.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}
                      </select>
                    </div>
                  </div>
                </details>
              ) : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h2>۲. مقصد: سال تعلیمی و صنف</h2>
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-target-year">سال تعلیمی مقصد</label>
                  <select id="promotion-target-year" value={form.targetAcademicYearId} onChange={(event) => selectTargetYear(event.target.value)}>
                    <option value="">{`پیشنهاد سیستم${plan?.targetAcademicYear ? `: ${yearLabel(plan.targetAcademicYear)}` : ' (پیدا نشد)'}`}</option>
                    {targetYearOptions.map((item) => <option key={item.id} value={item.id}>{item.uiLabel}</option>)}
                  </select>
                </div>
                {plan?.isTerminal ? (
                  <div className="admin-workspace-field">
                    <label>صنف مقصد کامیاب‌ها</label>
                    <p className="promotion-inline-note">این صنف دوازدهم است؛ شاگردان کامیاب فارغ می‌شوند.</p>
                  </div>
                ) : (
                  <div className="admin-workspace-field">
                    <label htmlFor="promotion-promoted-class">صنف مقصد کامیاب‌ها (یک پایه بالاتر)</label>
                    <select id="promotion-promoted-class" value={form.promotedClassId} onChange={(event) => updateForm({ promotedClassId: event.target.value })}>
                      <option value="">{plan?.promotedClass ? `پیشنهاد سیستم: ${classLabel(plan.promotedClass)}` : 'صنف پایهٔ بعدی پیدا نشد — انتخاب کنید'}</option>
                      {(plan?.promotedCandidates || []).map((item) => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}
                    </select>
                  </div>
                )}
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-repeat-class">صنف ناکام‌ها (تکرار همان پایه)</label>
                  <select id="promotion-repeat-class" value={form.repeatClassId} onChange={(event) => updateForm({ repeatClassId: event.target.value })}>
                    <option value="">{plan?.repeatClass ? `پیشنهاد سیستم: ${classLabel(plan.repeatClass)}` : 'صنف هم‌پایه پیدا نشد — انتخاب کنید'}</option>
                    {(plan?.repeatCandidates || []).map((item) => <option key={item.id} value={item.id}>{classLabel(item)}</option>)}
                  </select>
                </div>
              </div>
              <p className="admin-workspace-subtitle">
                فقط صنف‌های همان پایهٔ لازم، همان جنسیت و از سال مقصد نشان داده می‌شوند. برای جدا کردن شاگردان به چند شعبه، در مرحلهٔ «شاگردان» صنف هر شاگرد را جدا انتخاب کنید.
              </p>
              {plan?.targetAcademicYear && !plan.isTerminal && !(plan.promotedCandidates || []).length ? (
                <div className="admin-workspace-message error">در سال مقصد صنف پایهٔ بعدی ساخته نشده است؛ اول صنف‌های سال مقصد را بسازید.</div>
              ) : null}
              {plan?.capacity?.length ? (
                <div className="promotion-capacity">
                  {plan.capacity.map((row) => (
                    <span key={row.classId} className={`admin-workspace-badge ${row.overCapacity ? 'danger' : 'muted'}`}>
                      {row.title}{row.code ? ` — ${row.code}` : ''}: {formatNumber(row.currentStudents)} موجود + {formatNumber(row.incoming)} ورودی = {formatNumber(row.projected)}
                      {row.capacity ? ` از ظرفیت ${formatNumber(row.capacity)}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h2>۳. تاریخ‌ها</h2>
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-source-end">ختم عضویت در صنف مبدا</label>
                  <AfghanDateInput
                    id="promotion-source-end"
                    value={form.sourceEndAt || toDateInput(plan?.sourceEndAt)}
                    onChange={(value) => updateForm({ sourceEndAt: value })}
                    showGregorianEquivalent
                  />
                  {form.sourceEndAt ? <button type="button" className="admin-workspace-button-ghost" onClick={() => updateForm({ sourceEndAt: '' })}>برگشت به ختم سال مبدا</button> : null}
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-target-start">شروع در صنف مقصد</label>
                  <AfghanDateInput
                    id="promotion-target-start"
                    value={form.targetStartAt || toDateInput(plan?.targetStartAt)}
                    onChange={(value) => updateForm({ targetStartAt: value })}
                    showGregorianEquivalent
                  />
                  {form.targetStartAt ? <button type="button" className="admin-workspace-button-ghost" onClick={() => updateForm({ targetStartAt: '' })}>برگشت به شروع سال مقصد</button> : null}
                </div>
              </div>
              <p className="admin-workspace-subtitle">
                پیش‌فرض: شاگرد تا ختم سال مبدا در صنف خودش است و از شروع سال مقصد در صنف جدید. بل‌های پرداخت‌نشدهٔ بعد از تاریخ ختم باطل می‌شوند و بل سال جدید از تاریخ شروع ساخته می‌شود.
              </p>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h2>۴. شاگردان</h2>
              {preview?.summary ? (
                <div className="promotion-chips">
                  <span className="admin-workspace-badge good">ارتقا: {formatNumber(preview.summary.promoted)}</span>
                  <span className="admin-workspace-badge warn">تکرار: {formatNumber(preview.summary.repeated)}</span>
                  <span className="admin-workspace-badge info">مشروط: {formatNumber(preview.summary.conditional)}</span>
                  <span className="admin-workspace-badge good">فارغ: {formatNumber(preview.summary.graduated)}</span>
                  <span className="admin-workspace-badge danger">متوقف: {formatNumber(preview.summary.blocked)}</span>
                  <span className="admin-workspace-badge muted">مستثنا/قبلاً: {formatNumber(Number(preview.summary.skipped || 0) + Number(preview.summary.alreadyProcessed || 0))}</span>
                </div>
              ) : null}
              {studentsWithReliefs ? (
                <div className="admin-workspace-inline-actions promotion-relief-actions">
                  <span>تخفیف و معافیت‌ها:</span>
                  <button type="button" className="admin-workspace-button-ghost" onClick={() => setAllReliefs(true)}>همه در سال جدید ادامه یابد</button>
                  <button type="button" className="admin-workspace-button-ghost" onClick={() => setAllReliefs(false)}>هیچ‌کدام</button>
                </div>
              ) : null}
              <PromotionStudentsTable
                items={preview?.items || []}
                plan={plan}
                overrides={overrides}
                reliefPicks={reliefPicks}
                onOverrideChange={changeOverride}
                onToggleRelief={toggleRelief}
                disabled={applying}
              />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <h2>۵. بررسی و تأیید</h2>
              {plan?.blockers?.length ? (
                <div className="promotion-checklist is-blocking">
                  <strong>موانع (تا رفع نشوند ارتقا اعمال نمی‌شود)</strong>
                  <ul>{plan.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul>
                </div>
              ) : null}
              {plan?.warnings?.length ? (
                <div className="promotion-checklist is-warning">
                  <strong>هشدارها</strong>
                  <ul>{plan.warnings.map((item, index) => <li key={`${item.code}-${index}`}>{item.message}</li>)}</ul>
                </div>
              ) : null}
              {plan ? (
                <div className="promotion-summary">
                  <p>
                    <strong>{classLabel(sourceClass)}</strong> — سال {yearLabel(plan.sourceAcademicYear)} ← سال {yearLabel(plan.targetAcademicYear)}
                  </p>
                  <ul>
                    {applySummary.moving.map((group) => (
                      <li key={`${group.outcome}-${group.targetClass?.id || ''}`}>
                        {formatNumber(group.count)} نفر {outcomeLabel(group.outcome)} ← {classLabel(group.targetClass)}
                      </li>
                    ))}
                    {applySummary.conditional ? <li>{formatNumber(applySummary.conditional)} نفر مشروط — تا نتیجهٔ چانس دوم در همین صنف می‌مانند</li> : null}
                    {applySummary.graduated ? <li>{formatNumber(applySummary.graduated)} نفر فارغ</li> : null}
                    {applySummary.notApplied.length ? (
                      <li>
                        {formatNumber(applySummary.notApplied.length)} نفر شامل نمی‌شوند:
                        {' '}{applySummary.notApplied.slice(0, 6).map((item) => `${item.sourceMembership?.student?.fullName || 'شاگرد'} (${issueLabel(item.issueCode) || outcomeLabel(item.computedOutcome)})`).join('، ')}
                        {applySummary.notApplied.length > 6 ? ' ...' : ''}
                      </li>
                    ) : null}
                    {plan.finance?.studentsWithDebt ? <li>بقایای سال مبدا: {formatNumber(plan.finance.studentsWithDebt)} شاگرد، {formatAmount(plan.finance.debtAmount)} (فقط هشدار)</li> : null}
                    {reliefCount ? <li>{formatNumber(reliefCount)} تخفیف/معافیت به سال جدید منتقل می‌شود</li> : null}
                    <li>ختم عضویت در صنف مبدا: {fmtDay(plan.sourceEndAt)} — شروع در صنف مقصد: {fmtDay(plan.targetStartAt)}</li>
                  </ul>
                </div>
              ) : null}
              <div className="admin-workspace-actions">
                <button
                  type="button"
                  className="admin-workspace-button"
                  onClick={applyPromotion}
                  disabled={!plan?.canApply || previewLoading || applying}
                  data-testid="promotion-apply"
                >
                  {applying ? 'در حال اعمال...' : 'اعمال ارتقا'}
                </button>
              </div>
              {lastBatch ? (
                <div className="promotion-result" data-testid="promotion-result">
                  <span className="admin-workspace-badge good">ارتقا اعمال شد</span>
                  <span>
                    {formatNumber(lastBatch.summary?.promoted)} ارتقا، {formatNumber(lastBatch.summary?.repeated)} تکرار، {formatNumber(lastBatch.summary?.conditional)} مشروط، {formatNumber(lastBatch.summary?.graduated)} فارغ
                  </span>
                  <button
                    type="button"
                    className="admin-workspace-button-ghost"
                    onClick={() => fetchJson(`/api/promotions/batches/${lastBatch.id}`).then((data) => setPrintBatch(data.item)).catch((error) => showMessage(errorMessage(error, 'آماده‌کردن چاپ ناموفق بود.'), 'error'))}
                  >
                    چاپ لیست
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {form.classId ? (
            <div className="promotion-preview-state" aria-live="polite">
              {previewLoading ? <span>در حال به‌روزکردن پیش‌نمایش...</span> : null}
              {previewError ? <span className="promotion-preview-error">{previewError}</span> : null}
            </div>
          ) : null}

          <div className="admin-workspace-actions promotion-nav">
            <button type="button" className="admin-workspace-button-ghost" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1}>قبلی</button>
            {step < STEPS.length ? (
              <button type="button" className="admin-workspace-button-secondary" onClick={() => setStep((current) => current + 1)} disabled={!canGoNext}>بعدی</button>
            ) : null}
          </div>
        </section>

        <section className="admin-workspace-card">
          <h2>ارتقاهای سال {yearLabel(sourceYear)}</h2>
          <p className="admin-workspace-subtitle">هر صنف ارتقایافته، با امکان بازگردانی، ثبت نتیجهٔ چانس دوم شاگردان مشروط و چاپ لیست برای امضا.</p>
          <PromotionBatches
            academicYearId={form.academicYearId}
            refreshKey={refreshKey}
            onChanged={refreshAll}
            onPrint={setPrintBatch}
            onMessage={showMessage}
          />
        </section>
        </div>
      </div>

      <PromotionPrintSheet batch={printBatch} />
    </div>
  );
}
