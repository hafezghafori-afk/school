import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';

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

const EMPTY_FORM = {
  sessionId: '',
  ruleId: '',
  targetAcademicYearId: '',
  effectiveAt: ''
};

function buildPayload(form) {
  const payload = {
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

function studentName(item) {
  return item?.sourceMembership?.student?.fullName || item?.targetMembership?.student?.fullName || '---';
}

function targetLabel(item) {
  const classTitle = item?.targetClass?.title || item?.targetMembership?.schoolClass?.title || '';
  const yearTitle = item?.targetAcademicYear?.title || item?.targetMembership?.academicYear?.title || '';
  return [classTitle, yearTitle].filter(Boolean).join(' | ') || '---';
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

export default function AdminPromotions() {
  const [reference, setReference] = useState(EMPTY_REFERENCE);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');

  const sessions = useMemo(() => normalizeOptions(reference.sessions, ['title', 'code']), [reference.sessions]);
  const rules = useMemo(() => normalizeOptions(reference.rules, ['name', 'code']), [reference.rules]);
  const academicYears = useMemo(() => normalizeOptions(reference.academicYears, ['title', 'code']), [reference.academicYears]);
  const transactionSummary = useMemo(() => summarizeTransactions(transactions), [transactions]);
  const summary = preview?.summary || transactionSummary;

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const hydrateDefaults = (referenceData) => {
    setForm((current) => ({
      ...current,
      sessionId: current.sessionId || referenceData.sessions?.[0]?.id || '',
      targetAcademicYearId: current.targetAcademicYearId || '',
      ruleId: current.ruleId || ''
    }));
  };

  const loadAll = async ({ transactionId = '' } = {}) => {
    try {
      const [referenceData, transactionData] = await Promise.all([
        fetchJson('/api/promotions/reference-data'),
        fetchJson('/api/promotions/transactions')
      ]);
      setReference({
        academicYears: referenceData.academicYears || [],
        classes: referenceData.classes || [],
        sessions: referenceData.sessions || [],
        rules: referenceData.rules || [],
        activeYear: referenceData.activeYear || null
      });
      hydrateDefaults(referenceData);
      setTransactions(transactionData.items || []);

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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const runPreview = async () => {
    try {
      setBusyAction('preview');
      const data = await postJson('/api/promotions/preview', buildPayload(form));
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
      const data = await postJson('/api/promotions/apply', buildPayload(form));
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
          <p>پیش‌نمایش ارتقا، اعمال membership سال بعد، و rollback محدودِ تراکنش‌های promotion از همین صفحه مدیریت می‌شود.</p>
          <div className="admin-workspace-meta">
            <span>تعداد سشن‌ها: {formatNumber(sessions.length)}</span>
            <span>تعداد قوانین: {formatNumber(rules.length)}</span>
            <span>تراکنش‌ها: {formatNumber(transactions.length)}</span>
          </div>
        </section>

        {message && <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div>}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="5">
            <h2>فرم اجرا</h2>
            <p className="admin-workspace-subtitle">ابتدا session را انتخاب کن، سپس preview بگیر و بعد apply یا rollback انجام بده.</p>
            <div className="admin-workspace-form">
              <div className="admin-workspace-form-grid">
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-session">سشن امتحان</label>
                  <select id="promotion-session" name="sessionId" value={form.sessionId} onChange={handleChange}>
                    <option value="">انتخاب سشن</option>
                    {sessions.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-rule">قانون ارتقا</label>
                  <select id="promotion-rule" name="ruleId" value={form.ruleId} onChange={handleChange}>
                    <option value="">تشخیص خودکار</option>
                    {rules.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-target-year">سال هدف</label>
                  <select id="promotion-target-year" name="targetAcademicYearId" value={form.targetAcademicYearId} onChange={handleChange}>
                    <option value="">تشخیص خودکار</option>
                    {academicYears.map((item) => (
                      <option key={item.id} value={item.id}>{item.uiLabel}</option>
                    ))}
                  </select>
                </div>
                <div className="admin-workspace-field">
                  <label htmlFor="promotion-effective-at">تاریخ اثر</label>
                  <input id="promotion-effective-at" type="date" name="effectiveAt" value={form.effectiveAt} onChange={handleChange} />
                </div>
              </div>
              <div className="admin-workspace-actions">
                <button type="button" className="admin-workspace-button-ghost" onClick={() => loadAll()} disabled={!!busyAction}>بازخوانی</button>
                <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || !form.sessionId}>پیش‌نمایش</button>
                <button type="button" className="admin-workspace-button-secondary" onClick={applyPromotions} disabled={busyAction === 'apply' || !form.sessionId}>اعمال ارتقا</button>
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
            <p className="admin-workspace-subtitle">این بخش نشان می‌دهد هر membership به کدام outcome می‌رسد و آیا بدون خطا قابل اعمال است یا نه.</p>
            {preview?.items?.length ? (
              <div className="admin-workspace-table-wrap">
                <table className="admin-workspace-table">
                  <thead>
                    <tr>
                      <th>متعلم</th>
                      <th>وضعیت نتیجه</th>
                      <th>Outcome</th>
                      <th>Target</th>
                      <th>قابل اعمال</th>
                      <th>Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((item) => (
                      <tr key={item.examResultId}>
                        <td>{studentName(item)}</td>
                        <td>{item.sourceResultStatus || '---'}</td>
                        <td>{item.computedOutcome || '---'}</td>
                        <td>{targetLabel(item)}</td>
                        <td>
                          <span className={`admin-workspace-badge ${item.canApply ? 'good' : ''}`}>{item.canApply ? 'بله' : 'خیر'}</span>
                        </td>
                        <td>{item.issueCode || '---'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
        </section>
      </div>
    </div>
  );
}