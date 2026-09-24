import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatAfghanDate,
  formatAfghanDateTime,
  formatAfghanMonthKeyLabel
} from '../../utils/afghanDate';
import './MonthCloseBoard.css';

// Month close by Afghan solar month: one tile per month of the financial year,
// closed in order. A month locks as soon as its close is requested, so the
// request dialog shows what still blocks it first; a closed month is reopened
// only by the president, for a few days, and closed again through the
// president with what changed shown next to the old figures.

const STATE_META = {
  closed: { label: 'بسته', tone: 'emerald' },
  in_review: { label: 'در جریان تایید (قفل)', tone: 'amber' },
  reopened: { label: 'باز برای اصلاح', tone: 'sky' },
  reopen_expired: { label: 'مهلت اصلاح تمام شد (قفل)', tone: 'rose' },
  rejected: { label: 'برگشت‌شده برای اصلاح', tone: 'rose' },
  legacy_closed: { label: 'بسته (ثبت میلادی قدیمی)', tone: 'emerald' },
  open: { label: 'باز', tone: 'muted' },
  not_ended: { label: 'هنوز تمام نشده', tone: 'muted' }
};

const STAGE_LABELS = {
  finance_manager_review: 'در انتظار مدیر مالی',
  finance_lead_review: 'در انتظار آمریت مالی',
  general_president_review: 'در انتظار ریاست عمومی',
  completed: 'تایید نهایی',
  rejected: 'برگشت شده'
};

const VERSION_REASON_LABELS = {
  close: 'بستن',
  reclose: 'بستن دوباره پس از اصلاح',
  refresh: 'تازه‌سازی گزارش'
};

const CHANGE_GROUPS = [
  ['bills', 'بل‌ها'],
  ['payments', 'پرداخت‌ها'],
  ['expenses', 'مصارف'],
  ['refunds', 'بازپرداخت‌ها']
];

const fmtNumber = (value) => (Number(value) || 0).toLocaleString('fa-AF-u-ca-persian');
const fmtMoney = (value) => `${fmtNumber(value)} AFN`;
const fmtDay = (value) => formatAfghanDate(value, { month: 'long', day: 'numeric' }) || '-';
const fmtDateTime = (value) => formatAfghanDateTime(value, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}) || '-';

export const monthCloseLabel = (item = {}) => {
  if (item?.monthLabel) return item.monthLabel;
  const key = String(item?.monthKey || '').trim();
  return /^1[34]\d{2}-(0[1-9]|1[0-2])$/.test(key) ? formatAfghanMonthKeyLabel(key) : key || '-';
};

const idOf = (item) => String(item?._id || item?.id || '');

function MonthCloseDialog({ title, subtitle, onClose, busy, children, footer, testId }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);
  return (
    <div
      className="mcb-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={ref}
        className="mcb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcb-dialog-title"
        dir="rtl"
        tabIndex={-1}
        data-testid={testId}
      >
        <header className="mcb-dialog-head">
          <div>
            <h2 id="mcb-dialog-title">{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="mcb-dialog-close" onClick={onClose} disabled={busy} aria-label="بستن">×</button>
        </header>
        <div className="mcb-dialog-body">{children}</div>
        {footer ? <footer className="mcb-dialog-foot">{footer}</footer> : null}
      </section>
    </div>
  );
}

function IssueList({ issues = [], tone = 'rose', testId }) {
  if (!Array.isArray(issues) || !issues.length) return null;
  return (
    <ul className={`mcb-issues mcb-issues-${tone}`} data-testid={testId}>
      {issues.map((issue, index) => {
        const amounts = [
          issue?.count != null ? `${fmtNumber(issue.count)} مورد` : '',
          issue?.amount != null ? fmtMoney(issue.amount) : ''
        ].filter(Boolean).join(' - ');
        const samples = issue?.code !== 'earlier_months_open' && Array.isArray(issue?.samples) ? issue.samples.filter(Boolean) : [];
        return (
          <li key={`${issue?.code || 'issue'}-${index}`}>
            <strong>{issue?.label || 'مانع'}</strong>
            {amounts ? <span>{amounts}</span> : null}
            {samples.length ? (
              <small>{samples.slice(0, 6).join('، ')}{samples.length > 6 ? ' و ...' : ''}</small>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TotalsGrid({ totals = {} }) {
  const rows = [
    ['بل‌های ماه', `${fmtNumber(totals.ordersIssuedCount)} / ${fmtMoney(totals.ordersIssuedAmount)}`],
    ['پرداخت‌های تاییدشده', fmtMoney(totals.approvedPaymentAmount)],
    ['بازپرداخت‌ها', fmtMoney(totals.refundAmount)],
    ['مصارف تاییدشده', fmtMoney(totals.approvedExpenseAmount)],
    ['خالص نقد ماه', fmtMoney(totals.netCashAmount)],
    ['مانده ایستای پایان ماه', fmtMoney(totals.standingOutstandingAmount)]
  ];
  return (
    <div className="mcb-totals" data-testid="month-close-dialog-totals">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

export function MonthCloseDiffTable({ rows = [], testId, emptyText = 'ارقام نسبت به نسخهٔ قبلی تغییری نکرده است.' }) {
  if (!Array.isArray(rows) || !rows.length) return <p className="mcb-muted">{emptyText}</p>;
  return (
    <table className="mcb-diff" data-testid={testId}>
      <thead>
        <tr>
          <th>رقم</th>
          <th>قبلی</th>
          <th>تازه</th>
          <th>تفاوت</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key || row.label}>
            <td>{row.label || row.key}</td>
            <td>{fmtNumber(row.before)}</td>
            <td>{fmtNumber(row.after)}</td>
            <td className={Number(row.delta) > 0 ? 'is-up' : 'is-down'}>
              {Number(row.delta) > 0 ? '+' : ''}{fmtNumber(row.delta)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MonthCloseChangeReport({ changes = null }) {
  if (!changes) return null;
  const groups = CHANGE_GROUPS.filter(([key]) => Number(changes?.[key]?.count || 0) > 0);
  return (
    <div className="mcb-changes" data-testid="month-close-change-report">
      <p>
        {Number(changes.total || 0) > 0
          ? `${fmtNumber(changes.total)} سند در روزهای این ماه پس از بازگشایی ثبت یا ویرایش شده است:`
          : 'پس از بازگشایی، هیچ سندی در روزهای این ماه ثبت یا ویرایش نشده است.'}
      </p>
      {groups.map(([key, label]) => (
        <div key={key} className="mcb-change-group">
          <strong>{label}: {fmtNumber(changes[key].count)} (جدید: {fmtNumber(changes[key].added)})</strong>
          <ul>
            {(changes[key].items || []).map((item, index) => (
              <li key={`${key}-${index}`}>
                {[item.number, item.title, item.student].filter(Boolean).join(' - ') || 'سند'}
                {' | '}
                {fmtMoney(item.amount)}
                {' '}
                {item.added ? '(جدید)' : '(ویرایش)'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// The versions a closed month has been through and, while a close after a
// reopen waits for the president, what changed since the last close.
export function MonthCloseVersions({ record = null }) {
  if (!record) return null;
  const versions = Array.isArray(record.snapshotVersions) ? record.snapshotVersions : [];
  const pendingReclose = record.status === 'pending_review' && record.isReclose;
  if (!versions.length && !pendingReclose && !record.needsReview) return null;
  return (
    <div className="mcb-versions" data-testid="month-close-versions">
      {record.needsReview ? (
        <p className="mcb-note mcb-note-amber">{record.needsReviewReason || 'گزارش بستن این ماه نیازمند تازه‌سازی است.'}</p>
      ) : null}
      {pendingReclose ? (
        <div className="mcb-version mcb-version-pending">
          <strong>تغییرات نسبت به بستن قبلی (در انتظار تایید ریاست عمومی)</strong>
          <MonthCloseDiffTable rows={record.recloseReview?.diff || []} testId="month-close-reclose-diff" />
          <MonthCloseChangeReport changes={record.recloseReview?.changes || null} />
        </div>
      ) : null}
      {versions.slice().reverse().map((version) => (
        <details key={`month-close-version-${version.version}`} className="mcb-version">
          <summary>
            <strong>نسخه {fmtNumber(version.version)}: {VERSION_REASON_LABELS[version.reason] || version.reason}</strong>
            <span>{fmtDateTime(version.createdAt)}{version.createdBy?.name ? ` - ${version.createdBy.name}` : ''}</span>
          </summary>
          {version.note ? <p className="mcb-muted">{version.note}</p> : null}
          {Number(version.version) > 1 ? <MonthCloseDiffTable rows={version.diff || []} /> : null}
          <MonthCloseChangeReport changes={version.changes || null} />
        </details>
      ))}
    </div>
  );
}

// Page-wide notice of months that are locked for review, open for correction,
// past their correction deadline, or waiting for a refreshed report.
export function MonthCloseBanner({ items = [] }) {
  const rows = (Array.isArray(items) ? items : []).flatMap((item) => {
    const label = monthCloseLabel(item);
    const key = idOf(item) || item?.monthKey;
    if (item?.status === 'pending_review') {
      return [{ key: `${key}-review`, tone: 'amber', text: `ماه ${label} در جریان تایید بستن است (${STAGE_LABELS[item.approvalStage] || 'در انتظار تایید'})؛ ثبت و تغییر سند مالی در آن قفل است.` }];
    }
    if (item?.status === 'reopened' && item?.reopenExpired) {
      return [{ key: `${key}-expired`, tone: 'rose', text: `مهلت اصلاح ماه ${label} تمام شده و ماه دوباره قفل است؛ درخواست بستن دوباره را ثبت کنید یا ریاست عمومی مهلت را تمدید کند.` }];
    }
    if (item?.status === 'reopened') {
      return [{ key: `${key}-open`, tone: 'sky', text: `ماه ${label} برای اصلاح باز است${item.reopenDeadline ? ` تا ${fmtDateTime(item.reopenDeadline)}` : ''}؛ پس از اصلاح، درخواست بستن دوباره را ثبت کنید.` }];
    }
    if (item?.status === 'closed' && item?.needsReview) {
      return [{ key: `${key}-review-needed`, tone: 'amber', text: `گزارش بستن ماه ${label} پس از بازگشایی یک ماه قبلی نیازمند تازه‌سازی است.` }];
    }
    return [];
  });
  if (!rows.length) return null;
  return (
    <div className="mcb-banner" role="status" data-testid="month-close-banner">
      {rows.map((row) => (
        <p key={row.key} className={`mcb-note mcb-note-${row.tone}`}>{row.text}</p>
      ))}
    </div>
  );
}

export default function MonthCloseBoard({ apiBase = '', fetchJson, onChanged, onSelectRecord, selectedRecordId = '', refreshKey = null }) {
  const fetchRef = useRef(fetchJson);
  fetchRef.current = fetchJson;
  const [board, setBoard] = useState(null);
  const [financialYearId, setFinancialYearId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ note: '', days: 3, override: false });
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState(null);

  const loadBoard = useCallback(async (yearId = '') => {
    setLoading(true);
    try {
      const url = new URL(`${apiBase}/api/finance/admin/month-close/board`, window.location.origin);
      if (yearId) url.searchParams.set('financialYearId', yearId);
      const data = await fetchRef.current(url.toString());
      if (!data?.success) throw new Error(data?.message || 'دریافت ماه‌های مالی ممکن نشد.');
      setBoard(data);
      setError('');
    } catch (err) {
      setError(err?.message || 'دریافت ماه‌های مالی ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    loadBoard(financialYearId);
  }, [loadBoard, financialYearId, refreshKey]);

  const months = Array.isArray(board?.months) ? board.months : [];
  const legacy = Array.isArray(board?.legacy) ? board.legacy : [];
  const reopenDays = board?.reopenDays || { min: 1, max: 7, default: 3 };
  const counts = months.reduce((result, month) => {
    if (month.state === 'closed' || month.state === 'legacy_closed') result.closed += 1;
    else if (month.state === 'in_review') result.review += 1;
    else if (month.state === 'reopened' || month.state === 'reopen_expired') result.reopened += 1;
    return result;
  }, { closed: 0, review: 0, reopened: 0 });

  const closeDialog = useCallback(() => {
    if (busy) return;
    setDialog(null);
    setDialogError(null);
  }, [busy]);

  const openDialog = (next) => {
    setForm({ note: '', days: Number(reopenDays.default) || 3, override: false });
    setDialogError(null);
    setDialog(next);
  };

  const openRequest = async (monthKey, label, isReclose = false) => {
    openDialog({ type: 'request', monthKey, label, isReclose, preview: null, loading: true });
    try {
      const url = new URL(`${apiBase}/api/finance/admin/month-close/readiness`, window.location.origin);
      url.searchParams.set('monthKey', monthKey);
      if (board?.financialYear?._id) url.searchParams.set('financialYearId', String(board.financialYear._id));
      const data = await fetchRef.current(url.toString());
      if (!data?.success) throw new Error(data?.message || 'بررسی آمادگی بستن ماه ممکن نشد.');
      setDialog((current) => (current?.type === 'request' && current.monthKey === monthKey ? { ...current, preview: data, loading: false } : current));
    } catch (err) {
      setDialog((current) => (current?.type === 'request' ? { ...current, loading: false } : current));
      setDialogError({ message: err?.message || 'بررسی آمادگی بستن ماه ممکن نشد.' });
    }
  };

  const laterClosedMonths = (record) => {
    const start = new Date(record?.window?.startAt || record?.closeWindow?.startAt || 0).getTime();
    return [
      ...months.map((month) => month.record).filter(Boolean),
      ...legacy
    ].filter((item) => (
      idOf(item) !== idOf(record)
      && item.status === 'closed'
      && new Date(item.window?.startAt || item.closeWindow?.startAt || 0).getTime() > start
    ));
  };

  const post = (path, body) => fetchRef.current(`${apiBase}/api/finance/admin/month-close${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });

  const runAction = async (path, body, fallbackMessage) => {
    setBusy(true);
    setDialogError(null);
    try {
      const data = await post(path, body);
      if (!data?.success) {
        setDialogError({
          message: data?.message || 'عملیات ناموفق بود.',
          readiness: data?.readiness || null,
          diff: Array.isArray(data?.diff) ? data.diff : null,
          laterMonths: Array.isArray(data?.laterMonths) ? data.laterMonths : null,
          code: data?.code || ''
        });
        return;
      }
      setNotice(data.message || fallbackMessage);
      setDialog(null);
      if (data?.item?._id) onSelectRecord?.(String(data.item._id));
      // The page shows the returned record at once; its own reload follows.
      onChanged?.(data?.item || null);
      await loadBoard(financialYearId);
    } catch (err) {
      setDialogError({ message: err?.message || 'عملیات ناموفق بود.' });
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = () => {
    if (!dialog) return;
    const note = form.note.trim();
    if (dialog.type === 'request') {
      runAction('', { monthKey: dialog.monthKey, note, financialYearId: board?.financialYear?._id || '' }, 'درخواست بستن ماه ثبت شد.');
    } else if (dialog.type === 'approve') {
      runAction(`/${idOf(dialog.record)}/approve`, { note }, 'این مرحله تایید شد.');
    } else if (dialog.type === 'reject') {
      runAction(`/${idOf(dialog.record)}/reject`, { reason: note }, 'درخواست برگشت داده شد.');
    } else if (dialog.type === 'reopen') {
      runAction(`/${idOf(dialog.record)}/reopen`, { note, durationDays: Number(form.days) || 3, override: form.override }, 'ماه بازگشایی شد.');
    } else if (dialog.type === 'refresh') {
      runAction(`/${idOf(dialog.record)}/refresh`, { note }, 'گزارش ماه تازه شد.');
    }
  };

  const renderRecordActions = (record, month = null) => {
    if (!record) return null;
    const label = monthCloseLabel(record);
    return (
      <>
        {record.canApprove ? (
          <button type="button" onClick={() => openDialog({ type: 'approve', record })} data-testid={`month-close-approve-${record.monthKey}`}>
            تایید
          </button>
        ) : null}
        {record.canReject ? (
          <button type="button" className="secondary" onClick={() => openDialog({ type: 'reject', record })} data-testid={`month-close-reject-${record.monthKey}`}>
            برگشت
          </button>
        ) : null}
        {record.canReopen ? (
          <button type="button" className="secondary" onClick={() => openDialog({ type: 'reopen', mode: 'reopen', record, laterClosed: laterClosedMonths(record) })} data-testid={`month-close-reopen-${record.monthKey}`}>
            بازگشایی
          </button>
        ) : null}
        {record.canExtendReopen ? (
          <button type="button" className="secondary" onClick={() => openDialog({ type: 'reopen', mode: 'extend', record, laterClosed: [] })} data-testid={`month-close-extend-${record.monthKey}`}>
            تمدید مهلت
          </button>
        ) : null}
        {record.canRefresh ? (
          <button type="button" className="secondary" onClick={() => openDialog({ type: 'refresh', record })} data-testid={`month-close-refresh-${record.monthKey}`}>
            تازه‌سازی گزارش
          </button>
        ) : null}
        {!month && record.status === 'reopened' ? (
          <button type="button" onClick={() => openRequest(record.monthKey, label, true)} data-testid={`month-close-request-${record.monthKey}`}>
            درخواست بستن دوباره
          </button>
        ) : null}
        <button
          type="button"
          className="mcb-link"
          onClick={() => onSelectRecord?.(idOf(record))}
          aria-pressed={idOf(record) === String(selectedRecordId || '')}
        >
          جزئیات
        </button>
      </>
    );
  };

  const renderDialog = () => {
    if (!dialog) return null;
    const record = dialog.record || null;
    const label = record ? monthCloseLabel(record) : dialog.label;
    const errorBlock = dialogError ? (
      <div className="mcb-dialog-error" role="alert" data-testid="month-close-dialog-error">
        <p>{dialogError.message}</p>
        <IssueList issues={dialogError.readiness?.blockingIssues || []} testId="month-close-dialog-error-blockers" />
        {dialogError.diff ? <MonthCloseDiffTable rows={dialogError.diff} testId="month-close-dialog-error-diff" /> : null}
        {dialogError.laterMonths?.length ? (
          <p className="mcb-muted">ماه‌های بسته بعدی: {dialogError.laterMonths.map((item) => item.monthLabel || item.monthKey).join('، ')}</p>
        ) : null}
      </div>
    ) : null;
    const noteField = (placeholder, required = false) => (
      <label className="mcb-field">
        <span>{required ? `${placeholder} (الزامی)` : placeholder}</span>
        <textarea
          rows={3}
          value={form.note}
          onChange={(event) => setForm((previous) => ({ ...previous, note: event.target.value }))}
          data-testid="month-close-dialog-note"
        />
      </label>
    );
    const footer = (primaryLabel, disabled = false, tone = '') => (
      <>
        <button type="button" className="secondary" onClick={closeDialog} disabled={busy}>انصراف</button>
        <button type="button" className={tone} onClick={submitDialog} disabled={busy || disabled} data-testid="month-close-dialog-submit">
          {busy ? 'در حال ارسال...' : primaryLabel}
        </button>
      </>
    );

    if (dialog.type === 'request') {
      const preview = dialog.preview;
      const readiness = preview?.readiness || { blockingIssues: [], warningIssues: [] };
      const canRequest = preview?.canRequest === true;
      return (
        <MonthCloseDialog
          title={dialog.isReclose || preview?.isReclose ? `درخواست بستن دوباره ماه ${label}` : `درخواست بستن ماه ${label}`}
          subtitle={preview?.window ? `${fmtDay(preview.window.startAt)} تا ${fmtDay(preview.window.endAt)} - ${preview.financialYear?.title || ''}` : ''}
          onClose={closeDialog}
          busy={busy}
          testId="month-close-request-dialog"
          footer={footer(dialog.isReclose || preview?.isReclose ? 'ارسال برای تایید ریاست عمومی' : 'ثبت درخواست و قفل ماه', !canRequest)}
        >
          {errorBlock}
          <p className="mcb-note mcb-note-amber">
            با ثبت درخواست، ثبت و تغییر هر سند مالی در روزهای این ماه قفل می‌شود تا ارقامی که تایید می‌شوند زیر دست بازبین‌ها تغییر نکنند.
          </p>
          {dialog.loading ? <p className="mcb-muted">در حال بررسی آمادگی ماه...</p> : null}
          {preview ? (
            <>
              {canRequest ? (
                <p className="mcb-note mcb-note-emerald" data-testid="month-close-ready">این ماه مانعی برای بستن ندارد.</p>
              ) : (
                <>
                  <p className="mcb-note mcb-note-rose">تا رفع این موانع درخواست ثبت نمی‌شود:</p>
                  <IssueList issues={readiness.blockingIssues} testId="month-close-preview-blockers" />
                </>
              )}
              <IssueList issues={readiness.warningIssues} tone="amber" testId="month-close-preview-warnings" />
              <TotalsGrid totals={preview.totals || {}} />
              {preview.isReclose ? (
                <p className="mcb-muted">این درخواست مستقیم نزد ریاست عمومی می‌رود و تغییرات نسبت به بستن قبلی همراه آن نشان داده می‌شود.</p>
              ) : (
                <p className="mcb-muted">مسیر تایید: مدیر مالی ← آمریت مالی ← ریاست عمومی.</p>
              )}
              {noteField('یادداشت درخواست')}
            </>
          ) : null}
        </MonthCloseDialog>
      );
    }

    if (dialog.type === 'approve') {
      const finalStep = record?.approvalStage === 'general_president_review';
      return (
        <MonthCloseDialog
          title={`تایید بستن ماه ${label}`}
          subtitle={`${STAGE_LABELS[record?.approvalStage] || ''}${record?.isReclose ? ' - بستن دوباره پس از اصلاح' : ''}`}
          onClose={closeDialog}
          busy={busy}
          testId="month-close-approve-dialog"
          footer={footer(finalStep ? 'تایید نهایی و بستن ماه' : 'تایید و ارسال به مرحله بعد')}
        >
          {errorBlock}
          <TotalsGrid totals={record?.snapshot?.totals || {}} />
          {record?.isReclose ? (
            <>
              <strong>تغییرات نسبت به بستن قبلی</strong>
              <MonthCloseDiffTable rows={record?.recloseReview?.diff || []} testId="month-close-approve-diff" />
              <MonthCloseChangeReport changes={record?.recloseReview?.changes || null} />
            </>
          ) : null}
          <p className="mcb-muted">پیش از تایید، ارقام ماه دوباره محاسبه می‌شود؛ اگر با ارقام درخواست فرق کند، تایید متوقف می‌شود.</p>
          {noteField('یادداشت تایید')}
        </MonthCloseDialog>
      );
    }

    if (dialog.type === 'reject') {
      return (
        <MonthCloseDialog
          title={`برگشت درخواست بستن ماه ${label}`}
          subtitle={record?.isReclose ? 'ماه به حالت «باز برای اصلاح» با همان مهلت قبلی برمی‌گردد.' : 'ماه برای اصلاح باز می‌شود و درخواست باید دوباره ثبت شود.'}
          onClose={closeDialog}
          busy={busy}
          testId="month-close-reject-dialog"
          footer={footer('برگشت برای اصلاح', !form.note.trim(), 'danger')}
        >
          {errorBlock}
          {noteField('دلیل برگشت', true)}
        </MonthCloseDialog>
      );
    }

    if (dialog.type === 'reopen') {
      const extend = dialog.mode === 'extend';
      const laterClosed = dialog.laterClosed || [];
      const needsOverride = !extend && (laterClosed.length > 0 || dialogError?.code === 'finance_month_reopen_out_of_order');
      const dayOptions = [];
      for (let day = Number(reopenDays.min) || 1; day <= (Number(reopenDays.max) || 7); day += 1) dayOptions.push(day);
      return (
        <MonthCloseDialog
          title={extend ? `تمدید مهلت اصلاح ماه ${label}` : `بازگشایی ماه ${label}`}
          subtitle={extend
            ? `مهلت فعلی: ${fmtDateTime(record?.reopenDeadline)}`
            : 'ماه برای چند روز محدود باز می‌شود و پس از آن خودکار دوباره قفل می‌شود.'}
          onClose={closeDialog}
          busy={busy}
          testId="month-close-reopen-dialog"
          footer={footer(extend ? 'تمدید مهلت' : 'بازگشایی ماه', !form.note.trim() || (needsOverride && !form.override))}
        >
          {errorBlock}
          {noteField(extend ? 'دلیل تمدید' : 'دلیل بازگشایی', true)}
          <label className="mcb-field mcb-field-inline">
            <span>مدت {extend ? 'تمدید' : 'بازگشایی'}</span>
            <select
              value={form.days}
              onChange={(event) => setForm((previous) => ({ ...previous, days: Number(event.target.value) }))}
              data-testid="month-close-reopen-days"
            >
              {dayOptions.map((day) => (
                <option key={day} value={day}>{fmtNumber(day)} روز</option>
              ))}
            </select>
          </label>
          {needsOverride ? (
            <div className="mcb-note mcb-note-amber" data-testid="month-close-reopen-override">
              <p>
                ماه‌های بعد از این ماه بسته هستند
                {laterClosed.length ? ` (${laterClosed.map((item) => monthCloseLabel(item)).join('، ')})` : ''}.
                معمولاً فقط آخرین ماه بسته‌شده باز می‌شود؛ با بازگشایی این ماه، آن ماه‌ها برای تازه‌سازی گزارش علامت می‌خورند.
              </p>
              <label className="mcb-check">
                <input
                  type="checkbox"
                  checked={form.override}
                  onChange={(event) => setForm((previous) => ({ ...previous, override: event.target.checked }))}
                  data-testid="month-close-reopen-override-check"
                />
                <span>با وجود ماه‌های بسته بعدی باز شود</span>
              </label>
            </div>
          ) : null}
        </MonthCloseDialog>
      );
    }

    if (dialog.type === 'refresh') {
      return (
        <MonthCloseDialog
          title={`تازه‌سازی گزارش ماه ${label}`}
          subtitle={record?.needsReviewReason || ''}
          onClose={closeDialog}
          busy={busy}
          testId="month-close-refresh-dialog"
          footer={footer('تازه‌سازی گزارش')}
        >
          {errorBlock}
          <p className="mcb-muted">
            ارقام ایستا و کهنگی بدهی این ماه دوباره محاسبه و به‌عنوان نسخهٔ تازه ذخیره می‌شود. ارقام خود ماه (بل‌ها، پرداخت‌ها و مصارف همان ماه) نباید تغییر کرده باشد؛ اگر کرده باشد، ماه باید بازگشایی و دوباره بسته شود.
          </p>
          {noteField('یادداشت')}
        </MonthCloseDialog>
      );
    }
    return null;
  };

  return (
    <div className="finance-card mcb-board" data-finance-section="reports settings" data-testid="month-close-board">
      <div className="finance-card-head">
        <div>
          <h3>بستن ماه‌های مالی</h3>
          <p className="muted">
            ماه‌ها به ماه هجری شمسی و به ترتیب بسته می‌شوند. ماه از لحظهٔ درخواست بستن قفل است؛ بازگشایی فقط با ریاست عمومی و برای چند روز محدود ممکن است.
          </p>
        </div>
        <div className="finance-chip-group">
          {Array.isArray(board?.financialYears) && board.financialYears.length ? (
            <label className="finance-inline-filter">
              <span>سال مالی</span>
              <select
                value={String(board?.financialYear?._id || '')}
                onChange={(event) => setFinancialYearId(event.target.value)}
                data-testid="month-close-year-select"
              >
                {board.financialYears.map((item) => (
                  <option key={`month-close-year-${item._id}`} value={String(item._id)}>
                    {item.title}{item.isClosed ? ' (بسته)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <span className="finance-chip finance-chip-emerald">{fmtNumber(counts.closed)} بسته</span>
          <span className="finance-chip finance-chip-amber">{fmtNumber(counts.review)} در تایید</span>
          <span className="finance-chip finance-chip-sky">{fmtNumber(counts.reopened)} بازگشایی</span>
          <button type="button" className="secondary" onClick={() => loadBoard(financialYearId)} disabled={loading}>
            {loading ? 'در حال بارگذاری...' : 'تازه‌سازی'}
          </button>
        </div>
      </div>
      {notice ? <p className="mcb-note mcb-note-emerald" role="status" data-testid="month-close-notice">{notice}</p> : null}
      {error ? <p className="mcb-note mcb-note-rose" role="alert">{error}</p> : null}
      {!board?.financialYear && !loading && !error ? (
        <p className="mcb-muted">سال مالی فعالی برای این مکتب پیدا نشد.</p>
      ) : null}
      <div className="mcb-grid">
        {months.map((month) => {
          const record = month.record || null;
          const meta = STATE_META[month.state] || STATE_META.open;
          const versionCount = Array.isArray(record?.snapshotVersions) ? record.snapshotVersions.length : 0;
          const selected = record && idOf(record) === String(selectedRecordId || '');
          return (
            <article
              key={month.monthKey}
              className={`mcb-month mcb-tone-${meta.tone}${selected ? ' is-selected' : ''}${month.monthKey === board?.nextMonthKey ? ' is-next' : ''}`}
              data-testid={`month-close-tile-${month.monthKey}`}
              data-state={month.state}
            >
              <header>
                <strong>{month.label}</strong>
                <span className={`finance-chip finance-chip-${meta.tone}`}>{meta.label}</span>
              </header>
              <small className="mcb-muted">{fmtDay(month.window?.startAt)} تا {fmtDay(month.window?.endAt)}</small>
              {record?.status === 'pending_review' ? (
                <small>{STAGE_LABELS[record.approvalStage] || ''}{record.isReclose ? ' - بستن دوباره' : ''}</small>
              ) : null}
              {record?.status === 'reopened' && record.reopenDeadline ? (
                <small>{month.state === 'reopen_expired' ? 'مهلت اصلاح تمام شد: ' : 'مهلت اصلاح تا '}{fmtDateTime(record.reopenDeadline)}</small>
              ) : null}
              {record?.status === 'rejected' && record.rejectReason ? <small>دلیل برگشت: {record.rejectReason}</small> : null}
              {record?.needsReview ? (
                <span className="finance-chip finance-chip-amber" title={record.needsReviewReason || ''}>نیازمند تازه‌سازی گزارش</span>
              ) : null}
              {versionCount > 1 ? <small className="mcb-muted">{fmtNumber(versionCount)} نسخه</small> : null}
              <div className="mcb-month-actions">
                {month.canRequest ? (
                  <button
                    type="button"
                    onClick={() => openRequest(month.monthKey, month.label, record?.status === 'reopened')}
                    data-testid={`month-close-request-${month.monthKey}`}
                  >
                    {record?.status === 'reopened' ? 'درخواست بستن دوباره' : 'بررسی و درخواست بستن'}
                  </button>
                ) : null}
                {renderRecordActions(record, month)}
              </div>
            </article>
          );
        })}
      </div>
      {legacy.length ? (
        <details className="mcb-legacy" data-testid="month-close-legacy">
          <summary>بستن‌های قدیمی به ماه میلادی ({fmtNumber(legacy.length)})</summary>
          <p className="mcb-muted">این ماه‌ها پیش از رفتن به ماه هجری شمسی بسته شده‌اند و همان روزهای ماه میلادی را قفل نگه می‌دارند.</p>
          {legacy.map((record) => (
            <div key={idOf(record)} className="mcb-legacy-row">
              <span>{monthCloseLabel(record)}</span>
              <span className={`finance-chip finance-chip-${(STATE_META[record.status === 'pending_review' ? 'in_review' : record.status === 'reopened' && record.reopenExpired ? 'reopen_expired' : record.status] || STATE_META.open).tone}`}>
                {(STATE_META[record.status === 'pending_review' ? 'in_review' : record.status === 'reopened' && record.reopenExpired ? 'reopen_expired' : record.status] || STATE_META.open).label}
              </span>
              <div className="mcb-month-actions">{renderRecordActions(record)}</div>
            </div>
          ))}
        </details>
      ) : null}
      {renderDialog()}
    </div>
  );
}
