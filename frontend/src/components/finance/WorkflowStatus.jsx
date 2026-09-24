import React from 'react';
import { AFGHAN_SOLAR_MONTHS, gregorianToAfghanSolar } from '../../utils/afghanDate';
import './WorkflowStatus.css';

// «وضعیتِ کار» — یک برچسب برای هر رکوردِ دارای جریانِ تایید
// (مدیرِ مالی ← آمریتِ مالی ← ریاستِ عمومی). جای دو ستونِ جدای «وضعیت» و «مرحله»
// را می‌گیرد، تا یک ردیف هم‌زمان «در انتظارِ بررسی» و «بررسی ریاست» نگوید.
// بعد از تاییدِ نهایی، برچسب می‌گوید چه کاری انجام شد — که به نوعِ رکورد بسته است.

export const APPROVER_LEVEL_LABELS = {
  finance_manager: 'مدیرِ مالی',
  finance_lead: 'آمریتِ مالی',
  general_president: 'ریاستِ عمومی'
};

const WAITING_STAGE_LABELS = {
  finance_manager_review: 'در انتظارِ مدیرِ مالی',
  finance_lead_review: 'در انتظارِ آمریتِ مالی',
  general_president_review: 'در انتظارِ ریاستِ عمومی'
};

// برچسبِ «کار انجام شد» برای هر نوع رکورد و وضعیتِ پایانی.
const DONE_LABELS = {
  salary: { approved: 'پرداخت‌شده' },
  advance: {
    approved: 'پرداخت‌شده – در حالِ بازگشت',
    settled: 'تسویه‌شده',
    written_off: 'حذفِ طلب',
    refunded: 'بازپرداخت‌شده'
  },
  expense: { approved: 'تایید و ثبت در خزانه' },
  procurement: { approved: 'تعهدِ تاییدشده' },
  receipt: { approved: 'تاییدِ نهایی – ثبت در حساب', completed: 'تاییدِ نهایی – ثبت در حساب' },
  monthClose: { closed: 'ماه بسته شد', completed: 'ماه بسته شد', reopened: 'ماه دوباره باز شد' }
};

const DONE_TONES = { written_off: 'rose', refunded: 'sand', reopened: 'copper', approved: 'mint' };

const isApproveAction = (action = '') => ['approve', 'approved'].includes(String(action || '').trim());
const isRejectAction = (action = '') => ['reject', 'rejected'].includes(String(action || '').trim());

const lastTrailEntry = (trail, predicate) => {
  const list = Array.isArray(trail) ? trail : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (predicate(list[index])) return list[index];
  }
  return null;
};

// «۲ میزان ۱۴۰۵» — Intl با تقویمِ فارسی ترتیب و اضافه («سنبلهٔ») را به هم می‌زند.
const formatWhen = (value) => {
  const solar = gregorianToAfghanSolar(value);
  if (!solar) return '';
  const digits = (number) => number.toLocaleString('fa-AF', { useGrouping: false });
  return `${digits(solar.jd)} ${AFGHAN_SOLAR_MONTHS[solar.jm - 1]} ${digits(solar.jy)}`;
};

const whoAndWhen = (entry, verb) => {
  if (!entry) return '';
  const who = APPROVER_LEVEL_LABELS[String(entry.level || '').trim()] || '';
  const when = entry.at ? formatWhen(entry.at) : '';
  return [who ? `${verb} ${who}` : verb, when].filter(Boolean).join(' – ');
};

export function resolveWorkflowState({
  kind = 'expense',
  status = '',
  stage = '',
  approvalTrail = [],
  rejectReason = ''
} = {}) {
  const normalizedStatus = String(status || '').trim() || 'draft';
  const normalizedStage = String(stage || '').trim();

  if (normalizedStatus === 'void') return { key: 'void', label: 'باطل', tone: 'sand', detail: '' };
  if (normalizedStatus === 'cancelled') return { key: 'cancelled', label: 'لغو شده', tone: 'sand', detail: '' };

  if (normalizedStatus === 'rejected' || normalizedStage === 'rejected') {
    const entry = lastTrailEntry(approvalTrail, (item) => isRejectAction(item?.action));
    const reason = String(entry?.reason || rejectReason || '').trim();
    const who = APPROVER_LEVEL_LABELS[String(entry?.level || '').trim()];
    return {
      key: 'rejected',
      label: who ? `ردشده توسطِ ${who}` : 'ردشده',
      tone: 'rose',
      detail: reason ? `دلیل: ${reason}` : 'نیازِ اصلاح و ارسالِ دوباره'
    };
  }

  const doneLabel = DONE_LABELS[kind]?.[normalizedStatus]
    || (normalizedStage === 'completed' ? DONE_LABELS[kind]?.completed || DONE_LABELS[kind]?.approved : '');
  if (doneLabel) {
    const entry = lastTrailEntry(approvalTrail, (item) => isApproveAction(item?.action));
    return {
      key: 'done',
      label: doneLabel,
      tone: DONE_TONES[normalizedStatus] || 'mint',
      detail: whoAndWhen(entry, 'تاییدِ')
    };
  }

  if (WAITING_STAGE_LABELS[normalizedStage] && normalizedStatus !== 'draft') {
    const entry = lastTrailEntry(approvalTrail, (item) => isApproveAction(item?.action) || item?.action === 'submit');
    return {
      key: 'waiting',
      label: WAITING_STAGE_LABELS[normalizedStage],
      tone: normalizedStage === 'finance_manager_review' ? 'teal' : 'copper',
      detail: entry && isApproveAction(entry.action) ? whoAndWhen(entry, 'تاییدشده توسطِ') : ''
    };
  }

  if (normalizedStatus === 'pending_review') {
    return { key: 'waiting', label: 'در انتظارِ بررسی', tone: 'teal', detail: '' };
  }

  return { key: 'draft', label: 'پیش‌نویس', tone: 'slate', detail: 'هنوز ارسال نشده' };
}

export default function WorkflowStatus({ className = 'gov-status-badge', detailClassName = '', ...record }) {
  const state = resolveWorkflowState(record);
  return (
    <span className="workflow-status" data-workflow-state={state.key}>
      <span className={className} data-tone={state.tone}>{state.label}</span>
      {state.detail ? <small className={detailClassName || 'workflow-status-detail'}>{state.detail}</small> : null}
    </span>
  );
}
