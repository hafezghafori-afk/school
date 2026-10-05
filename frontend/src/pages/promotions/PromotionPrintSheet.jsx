import React from 'react';
import { formatAfghanDate } from '../../utils/afghanDate';
import {
  TRANSACTION_STATUS_LABELS,
  classLabel,
  issueLabel,
  outcomeLabel,
  yearLabel
} from './promotionLabels';

// The class list of one promotion, laid out for A4 and signatures. It is only
// mounted while printing; the scoped print CSS in AdminPromotions.css shows
// this sheet alone.

const fmtDay = (value) => formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) || '---';

export default function PromotionPrintSheet({ batch }) {
  if (!batch) return null;
  const transactions = (batch.transactions || []).filter((transaction) => transaction.transactionStatus !== 'rolled_back');
  return (
    <div className="promotion-print" dir="rtl">
      <header className="promotion-print-head">
        <h1>لیست ارتقای شاگردان</h1>
        <p>
          صنف مبدا: <strong>{classLabel(batch.sourceClass)}</strong> — سال {yearLabel(batch.sourceAcademicYear)}
          {' '}← سال مقصد: <strong>{yearLabel(batch.targetAcademicYear)}</strong>
        </p>
        <p>
          {batch.isTerminal ? 'صنف دوازدهم: شاگردان کامیاب فارغ می‌شوند.' : `صنف کامیاب‌ها: ${classLabel(batch.promotedClass)}`}
          {batch.repeatClass ? ` | صنف تکرار: ${classLabel(batch.repeatClass)}` : ''}
        </p>
        <p>ختم عضویت در صنف مبدا: {fmtDay(batch.sourceEndAt)} | شروع در صنف مقصد: {fmtDay(batch.targetStartAt)} | تاریخ اعمال: {fmtDay(batch.appliedAt)}</p>
      </header>

      <table className="promotion-print-table">
        <thead>
          <tr>
            <th>#</th>
            <th>نام شاگرد</th>
            <th>نمبر اساس</th>
            <th>تصمیم</th>
            <th>صنف مقصد</th>
            <th>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction, index) => {
            const student = transaction.sourceMembership?.student || {};
            return (
              <tr key={transaction.id}>
                <td>{index + 1}</td>
                <td>{student.fullName || '---'}</td>
                <td>{student.asasNumber || student.admissionNo || '---'}</td>
                <td>{outcomeLabel(transaction.promotionOutcome)}</td>
                <td>{transaction.targetClass ? classLabel(transaction.targetClass) : transaction.promotionOutcome === 'graduated' ? 'فارغ' : '—'}</td>
                <td>{TRANSACTION_STATUS_LABELS[transaction.transactionStatus] || transaction.transactionStatus}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {batch.notApplied?.length ? (
        <section className="promotion-print-note">
          <strong>شاگردانی که در این ارتقا شامل نشدند:</strong>
          <ul>
            {batch.notApplied.map((entry) => (
              <li key={`${entry.studentMembershipId}-${entry.issueCode}`}>{entry.fullName || 'شاگرد'} — {issueLabel(entry.issueCode) || outcomeLabel(entry.outcome)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="promotion-print-signatures">
        <div><span>تهیه‌کننده</span></div>
        <div><span>مدیر مکتب</span></div>
        <div><span>ریاست عمومی</span></div>
      </footer>
    </div>
  );
}
