import React, { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, fetchJson, formatNumber, postJson } from '../adminWorkspaceUtils';
import { formatAfghanDate } from '../../utils/afghanDate';
import { formatStudentDisplayLabel } from '../../utils/studentSearch';
import {
  BATCH_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  classLabel,
  formatAmount,
  issueLabel,
  outcomeLabel,
  rollbackBlockerLabel,
  yearLabel
} from './promotionLabels';

// Every promotion of the chosen source year: what each one did, per student;
// undo one student or the whole class; record the second-chance result of a
// held (مشروط) student; print the class list for signatures.

const fmtDay = (value) => formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) || '---';

function summaryText(summary = {}) {
  return [
    summary.promoted ? `${formatNumber(summary.promoted)} ارتقا` : '',
    summary.repeated ? `${formatNumber(summary.repeated)} تکرار` : '',
    summary.conditional ? `${formatNumber(summary.conditional)} مشروط` : '',
    summary.graduated ? `${formatNumber(summary.graduated)} فارغ` : '',
    summary.notApplied ? `${formatNumber(summary.notApplied)} اعمال‌نشده` : ''
  ].filter(Boolean).join('، ') || '---';
}

function financeText(finance = {}) {
  return [
    finance.studentsWithDebt ? `${formatNumber(finance.studentsWithDebt)} بدهکار (${formatAmount(finance.debtAmount)})` : '',
    finance.voidedDocuments ? `${formatNumber(finance.voidedDocuments)} سند باطل` : '',
    finance.refundCases ? `${formatNumber(finance.refundCases)} بازپرداخت/اعتبار` : '',
    finance.reviewRequired ? `${formatNumber(finance.reviewRequired)} برای بررسی` : '',
    finance.carriedReliefs ? `${formatNumber(finance.carriedReliefs)} تخفیف منتقل` : '',
    finance.failedReliefs ? `${formatNumber(finance.failedReliefs)} تخفیف منتقل نشد` : ''
  ].filter(Boolean).join('، ') || '—';
}

export default function PromotionBatches({ academicYearId, refreshKey = 0, canManage = true, onChanged, onPrint, onMessage }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState('');
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    if (!academicYearId) {
      setItems([]);
      return;
    }
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;
    setLoading(true);
    try {
      const data = await fetchJson(`/api/promotions/batches?sourceAcademicYearId=${encodeURIComponent(academicYearId)}`);
      if (latestRequest.current === requestId) setItems(data.items || []);
    } catch (error) {
      if (latestRequest.current === requestId) onMessage?.(errorMessage(error, 'دریافت دسته‌های ارتقا ناموفق بود.'), 'error');
    } finally {
      if (latestRequest.current === requestId) setLoading(false);
    }
  }, [academicYearId, onMessage]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const loadDetail = useCallback(async (batchId) => {
    const data = await fetchJson(`/api/promotions/batches/${batchId}`);
    setDetail(data.item || null);
    return data.item || null;
  }, []);

  const toggleDetail = async (batchId) => {
    if (openId === batchId) {
      setOpenId('');
      setDetail(null);
      return;
    }
    setOpenId(batchId);
    setDetail(null);
    try {
      await loadDetail(batchId);
    } catch (error) {
      onMessage?.(errorMessage(error, 'دریافت جزئیات دسته ناموفق بود.'), 'error');
    }
  };

  // The parent bumps refreshKey in onChanged, which reloads this list (and the
  // year board and preview) once; only the open detail is refreshed here.
  const afterChange = async (message, tone = 'info') => {
    onMessage?.(message, tone);
    if (openId) await loadDetail(openId).catch(() => null);
    if (onChanged) onChanged();
    else await load();
  };

  const rollbackBatch = async (batch) => {
    const reason = window.prompt(`دلیل بازگردانی کل ارتقای «${classLabel(batch.sourceClass)}» را بنویسید:`, '');
    if (reason === null) return;
    setBusy(`batch:${batch.id}`);
    try {
      await postJson(`/api/promotions/batches/${batch.id}/rollback`, { reason });
      await afterChange('ارتقای این صنف بازگردانی شد.');
    } catch (error) {
      const blockers = error?.data?.details?.blockers || [];
      const list = blockers.map((entry) => `${entry.fullName || 'شاگرد'}: ${rollbackBlockerLabel(entry.code)}`);
      onMessage?.(`${errorMessage(error, 'بازگردانی دسته ناموفق بود.')}${list.length ? ` — ${list.join(' | ')}` : ''}`, 'error');
    } finally {
      setBusy('');
    }
  };

  const rollbackStudent = async (transaction) => {
    const name = transaction.sourceMembership?.student?.fullName || 'این شاگرد';
    const reason = window.prompt(`دلیل بازگردانی ارتقای ${name}:`, '');
    if (reason === null) return;
    setBusy(`tx:${transaction.id}`);
    try {
      await postJson(`/api/promotions/rollback/${transaction.id}`, { reason });
      await afterChange(`ارتقای ${name} بازگردانی شد.`);
    } catch (error) {
      onMessage?.(errorMessage(error, 'بازگردانی ناموفق بود.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const resolveHeld = async (transaction, decision) => {
    const name = transaction.sourceMembership?.student?.fullName || 'این شاگرد';
    const label = decision === 'promoted' ? 'کامیاب (ارتقا به صنف بالاتر)' : 'ناکام (تکرار صنف)';
    if (!window.confirm(`نتیجهٔ چانس دوم ${name}: ${label}؟`)) return;
    setBusy(`resolve:${transaction.id}`);
    try {
      const data = await postJson(`/api/promotions/transactions/${transaction.id}/resolve`, { decision });
      const warnings = (data.warnings || []).map((warning) => warning.message).join(' ');
      await afterChange(`نتیجهٔ چانس دوم ${name} ثبت شد.${warnings ? ` ${warnings}` : ''}`, warnings ? 'warning' : 'info');
    } catch (error) {
      onMessage?.(errorMessage(error, 'ثبت نتیجهٔ چانس دوم ناموفق بود.'), 'error');
    } finally {
      setBusy('');
    }
  };

  const printBatch = async (batch) => {
    try {
      const full = openId === batch.id && detail ? detail : await fetchJson(`/api/promotions/batches/${batch.id}`).then((data) => data.item);
      if (full) onPrint?.(full);
    } catch (error) {
      onMessage?.(errorMessage(error, 'آماده‌کردن چاپ ناموفق بود.'), 'error');
    }
  };

  if (!academicYearId) {
    return <div className="admin-workspace-empty">سال تعلیمی مبدا را انتخاب کنید.</div>;
  }

  return (
    <div className="promotion-batches">
      {loading && !items.length ? <div className="admin-workspace-empty">در حال بارگذاری...</div> : null}
      {!loading && !items.length ? <div className="admin-workspace-empty">برای این سال هنوز ارتقایی ثبت نشده است.</div> : null}
      {items.length ? (
        <div className="admin-workspace-table-wrap">
          <table className="admin-workspace-table promotion-batches-table">
            <thead>
              <tr>
                <th>صنف مبدا</th>
                <th>مقصد</th>
                <th>خلاصه</th>
                <th>مالی</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>اقدام</th>
              </tr>
            </thead>
            <tbody>
              {items.map((batch) => (
                <React.Fragment key={batch.id}>
                  <tr data-testid={`promotion-batch-${batch.id}`}>
                    <td data-label="صنف مبدا">{classLabel(batch.sourceClass)}</td>
                    <td data-label="مقصد">
                      {yearLabel(batch.targetAcademicYear)}
                      <small>
                        {batch.isTerminal ? 'فارغ‌التحصیلی' : `کامیاب‌ها: ${classLabel(batch.promotedClass)}`}
                        {batch.repeatClass ? ` | تکرار: ${classLabel(batch.repeatClass)}` : ''}
                      </small>
                    </td>
                    <td data-label="خلاصه">{summaryText(batch.summary)}</td>
                    <td data-label="مالی"><small>{financeText(batch.financeSummary)}</small></td>
                    <td data-label="وضعیت">
                      <span className={`admin-workspace-badge ${batch.status === 'applied' ? 'good' : ''}`}>{BATCH_STATUS_LABELS[batch.status] || batch.status}</span>
                    </td>
                    <td data-label="تاریخ">{fmtDay(batch.appliedAt)}</td>
                    <td data-label="اقدام">
                      <div className="admin-workspace-inline-actions">
                        <button type="button" className="admin-workspace-button-ghost" onClick={() => toggleDetail(batch.id)}>
                          {openId === batch.id ? 'بستن' : 'جزئیات'}
                        </button>
                        <button type="button" className="admin-workspace-button-ghost" onClick={() => printBatch(batch)}>چاپ لیست</button>
                        {canManage && batch.status !== 'rolled_back' ? (
                          <button
                            type="button"
                            className="admin-workspace-button-danger"
                            onClick={() => rollbackBatch(batch)}
                            disabled={busy === `batch:${batch.id}`}
                          >
                            بازگردانی کل صنف
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {openId === batch.id ? (
                    <tr className="promotion-batch-detail-row">
                      <td colSpan="7">
                        {!detail ? (
                          <div className="admin-workspace-empty">در حال بارگذاری جزئیات...</div>
                        ) : (
                          <BatchDetail
                            detail={detail}
                            busy={busy}
                            canManage={canManage}
                            onRollback={rollbackStudent}
                            onResolve={resolveHeld}
                          />
                        )}
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function transactionFinanceText(transaction) {
  const effects = transaction.financeEffects || {};
  const carried = (effects.carriedReliefs || []).filter((entry) => entry.status === 'carried').length;
  return [
    effects.outstandingAtPromotion ? `بقایا ${formatAmount(effects.outstandingAtPromotion)}` : '',
    effects.voidedBills + effects.voidedOrders ? `${formatNumber(effects.voidedBills + effects.voidedOrders)} سند باطل` : '',
    effects.refundCases ? `${formatNumber(effects.refundCases)} بازپرداخت/اعتبار` : '',
    effects.reviewRequired?.length ? `${formatNumber(effects.reviewRequired.length)} برای بررسی مالی` : '',
    carried ? `${formatNumber(carried)} تخفیف منتقل` : '',
    effects.plannedReliefs?.length ? `${formatNumber(effects.plannedReliefs.length)} تخفیف بعد از چانس دوم` : ''
  ].filter(Boolean).join('، ');
}

function BatchDetail({ detail, busy, canManage, onRollback, onResolve }) {
  const transactions = detail.transactions || [];
  return (
    <div className="promotion-batch-detail">
      <div className="admin-workspace-meta">
        <span>ختم عضویت در صنف مبدا: {fmtDay(detail.sourceEndAt)}</span>
        <span>شروع در صنف مقصد: {fmtDay(detail.targetStartAt)}</span>
        {detail.createdBy?.name ? <span>اعمال‌کننده: {detail.createdBy.name}</span> : null}
      </div>
      <div className="admin-workspace-table-wrap">
        <table className="admin-workspace-table">
          <thead>
            <tr>
              <th>شاگرد</th>
              <th>تصمیم</th>
              <th>صنف مقصد</th>
              <th>وضعیت</th>
              <th>مالی</th>
              <th>اقدام</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction, index) => {
              const student = transaction.sourceMembership?.student || {};
              const live = ['applied', 'held'].includes(transaction.transactionStatus);
              return (
                <tr key={transaction.id} data-testid={`promotion-transaction-${transaction.id}`}>
                  <td data-label="شاگرد">{formatStudentDisplayLabel({ fullName: student.fullName, asasNumber: student.asasNumber || student.admissionNo }, { index: index + 1 })}</td>
                  <td data-label="تصمیم">{outcomeLabel(transaction.promotionOutcome)}</td>
                  <td data-label="صنف مقصد">{transaction.targetClass ? classLabel(transaction.targetClass) : transaction.promotionOutcome === 'graduated' ? 'فارغ' : '—'}</td>
                  <td data-label="وضعیت">{TRANSACTION_STATUS_LABELS[transaction.transactionStatus] || transaction.transactionStatus}</td>
                  <td data-label="مالی"><small>{transactionFinanceText(transaction) || '—'}</small></td>
                  <td data-label="اقدام">
                    {canManage ? (
                      <div className="admin-workspace-inline-actions">
                        {transaction.transactionStatus === 'held' ? (
                          <>
                            <button type="button" className="admin-workspace-button" onClick={() => onResolve(transaction, 'promoted')} disabled={busy === `resolve:${transaction.id}`}>کامیاب شد</button>
                            <button type="button" className="admin-workspace-button-secondary" onClick={() => onResolve(transaction, 'repeated')} disabled={busy === `resolve:${transaction.id}`}>ناکام شد</button>
                          </>
                        ) : null}
                        {live ? (
                          <button type="button" className="admin-workspace-button-ghost" onClick={() => onRollback(transaction)} disabled={busy === `tx:${transaction.id}`}>بازگردانی</button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {detail.notApplied?.length ? (
        <div className="promotion-not-applied">
          <strong>اعمال‌نشده‌ها ({formatNumber(detail.notApplied.length)})</strong>
          <ul>
            {detail.notApplied.map((entry) => (
              <li key={`${entry.studentMembershipId}-${entry.issueCode}`}>{entry.fullName || 'شاگرد'} — {issueLabel(entry.issueCode) || outcomeLabel(entry.outcome)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
