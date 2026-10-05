import React from 'react';
import { formatNumber } from '../adminWorkspaceUtils';
import { formatStudentDisplayLabel } from '../../utils/studentSearch';
import {
  classLabel,
  formatAmount,
  issueLabel,
  outcomeLabel,
  resultStatusLabel
} from './promotionLabels';

// One row per student of the source class: what the result engine decided,
// which class they land in (changeable per student, e.g. to split a section),
// their finance picture and the reliefs that can follow them, and whether
// they are part of this promotion at all.

const MOVING_OUTCOMES = ['promoted', 'repeated'];
const RELIEF_OUTCOMES = ['promoted', 'repeated', 'conditional'];

export function reliefKey(relief) {
  return `${relief.sourceModel}:${relief.id}`;
}

function reliefText(relief) {
  const coverage = relief.coverageMode === 'percent'
    ? `${formatNumber(relief.percentage)}٪`
    : relief.coverageMode === 'full'
      ? 'کامل'
      : formatAmount(relief.amount);
  return [relief.label, coverage, relief.reason ? `(${relief.reason})` : ''].filter(Boolean).join(' ');
}

function canBeIncluded(item) {
  return !['already_processed', 'membership_not_current'].includes(item.issueCode);
}

export default function PromotionStudentsTable({
  items = [],
  plan = null,
  overrides = {},
  reliefPicks = {},
  onOverrideChange,
  onToggleRelief,
  disabled = false
}) {
  if (!items.length) {
    return <div className="admin-workspace-empty">برای این صنف شاگردی پیدا نشد.</div>;
  }

  const candidatesFor = (outcome) => (outcome === 'repeated' ? plan?.repeatCandidates : plan?.promotedCandidates) || [];
  const defaultClassFor = (outcome) => (outcome === 'repeated' ? plan?.repeatClass : plan?.promotedClass);

  return (
    <div className="admin-workspace-table-wrap">
      <table className="admin-workspace-table promotion-students-table">
        <thead>
          <tr>
            <th>شامل</th>
            <th>شاگرد</th>
            <th>نتیجه</th>
            <th>تصمیم</th>
            <th>اوسط / ناکام</th>
            <th>صنف مقصد</th>
            <th>مالی</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const membershipId = item.studentMembershipId;
            const override = overrides[membershipId] || {};
            const excluded = override.exclude === true;
            const includable = canBeIncluded(item);
            const student = item.sourceMembership?.student || {};
            const policy = item.policyEvaluation || {};
            const failedSubjects = Array.isArray(policy.failedSubjects) ? policy.failedSubjects : [];
            const finance = item.finance;
            const picks = reliefPicks[membershipId] || {};
            const reliefsSelectable = !excluded && item.canApply && RELIEF_OUTCOMES.includes(item.computedOutcome);
            return (
              <tr
                key={membershipId || index}
                className={!item.canApply || excluded ? 'is-muted' : ''}
                data-testid={`promotion-student-${membershipId}`}
              >
                <td data-label="شامل">
                  {includable ? (
                    <input
                      type="checkbox"
                      checked={!excluded}
                      disabled={disabled}
                      aria-label={`شامل‌کردن ${student.fullName || 'شاگرد'} در این ارتقا`}
                      onChange={(event) => onOverrideChange(membershipId, { exclude: !event.target.checked })}
                    />
                  ) : '—'}
                </td>
                <td data-label="شاگرد">
                  <strong>{formatStudentDisplayLabel({ fullName: student.fullName, asasNumber: student.asasNumber || student.admissionNo }, { index: index + 1 })}</strong>
                </td>
                <td data-label="نتیجه">{resultStatusLabel(item.sourceResultStatus)}</td>
                <td data-label="تصمیم">
                  <span className={`admin-workspace-badge ${item.canApply && !excluded ? 'good' : ''}`}>{outcomeLabel(item.computedOutcome)}</span>
                  {item.issueCode ? <small className="promotion-issue">{issueLabel(item.issueCode)}</small> : null}
                </td>
                <td data-label="اوسط / ناکام">
                  {formatNumber(item.averageScore)}
                  {failedSubjects.length ? (
                    <small>{failedSubjects.map((subject) => subject.subjectTitle).filter(Boolean).join('، ') || `${formatNumber(failedSubjects.length)} مضمون`}</small>
                  ) : null}
                </td>
                <td data-label="صنف مقصد">
                  {MOVING_OUTCOMES.includes(item.computedOutcome) && includable && !excluded ? (
                    <select
                      value={override.targetClassId || ''}
                      disabled={disabled}
                      aria-label={`صنف مقصد ${student.fullName || 'شاگرد'}`}
                      onChange={(event) => onOverrideChange(membershipId, { targetClassId: event.target.value })}
                    >
                      <option value="">{`صنف دسته${defaultClassFor(item.computedOutcome) ? `: ${classLabel(defaultClassFor(item.computedOutcome))}` : ''}`}</option>
                      {candidatesFor(item.computedOutcome).map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{classLabel(candidate)}</option>
                      ))}
                    </select>
                  ) : item.computedOutcome === 'conditional' && item.canApply ? (
                    <span>بعد از نتیجهٔ چانس دوم</span>
                  ) : item.computedOutcome === 'graduated' && item.canApply ? (
                    <span>فارغ می‌شود</span>
                  ) : (
                    <span>{item.targetClass ? classLabel(item.targetClass) : '—'}</span>
                  )}
                  {item.reuseExistingMembership ? <small>در همین صنف از قبل ثبت است</small> : null}
                </td>
                <td data-label="مالی">
                  {finance?.outstanding > 0 ? <small className="promotion-debt">بقایا: {formatAmount(finance.outstanding)}</small> : null}
                  {finance && (finance.postEndUnpaid.length || finance.postEndPaid.length) ? (
                    <small>{formatNumber(finance.postEndUnpaid.length + finance.postEndPaid.length)} سند بعد از ختم عضویت</small>
                  ) : null}
                  {finance?.reliefs?.length ? (
                    <div className="promotion-reliefs">
                      {finance.reliefs.map((relief) => (
                        <label key={reliefKey(relief)} className={reliefsSelectable ? '' : 'is-muted'}>
                          <input
                            type="checkbox"
                            aria-label={`ادامهٔ ${reliefText(relief)} برای ${student.fullName || 'شاگرد'} در سال جدید`}
                            checked={reliefsSelectable && picks[reliefKey(relief)] === true}
                            disabled={disabled || !reliefsSelectable}
                            onChange={(event) => onToggleRelief(membershipId, reliefKey(relief), event.target.checked)}
                          />
                          <span>{reliefText(relief)} — ادامه در سال جدید</span>
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {!finance?.outstanding && !finance?.reliefs?.length && !(finance?.postEndUnpaid?.length || finance?.postEndPaid?.length)
                    ? <span className="promotion-muted-text">—</span>
                    : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
