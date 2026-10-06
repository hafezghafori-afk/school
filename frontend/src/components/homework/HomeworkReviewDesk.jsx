import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { API_BASE } from '../../config/api';
import { apiFetch, failureMessage } from '../../utils/apiClient';
import { studentMatchesSearch } from '../../utils/studentSearch';
import { DataErrorCard } from '../ui/DataState';
import { Skeleton } from '../ui/Skeleton';
import HomeworkDialog from './HomeworkDialog';
import {
  FEEDBACK_PRESETS,
  STATE_META,
  faNumber,
  fileKind,
  fileName,
  formatDate,
  getDueState,
  lateDaysText,
  lateLabel,
  validateScore
} from './homeworkUtils';

const ROSTER_FILTERS = [
  { key: 'all', label: 'همه' },
  { key: 'submitted', label: 'در انتظار بررسی' },
  { key: 'graded', label: 'نمره‌خورده' },
  { key: 'revision_requested', label: 'برگشت برای اصلاح' },
  { key: 'missing', label: 'تحویل‌نداده' },
  { key: 'late', label: 'دیر' }
];

const matchesFilter = (row, filter) => {
  if (filter === 'all') return true;
  if (filter === 'missing') return !row.submission;
  if (filter === 'late') return Boolean(row.submission?.isLate);
  return row.state === filter;
};

const jsonPost = (url, body) => apiFetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

function StateBadge({ state }) {
  const meta = STATE_META[state] || STATE_META.missing;
  return (
    <span className={`hw-badge hw-badge--${meta.tone}`}>
      <i className={`fa ${meta.icon}`} aria-hidden="true" /> {meta.label}
    </span>
  );
}

function LateBadge({ submission }) {
  if (!submission?.isLate) return null;
  return (
    <span className="hw-badge hw-badge--warning" title="پس از موعد تحویل شده">
      <i className="fa fa-clock" aria-hidden="true" /> {lateLabel(submission.lateDays)}
    </span>
  );
}

function SubmissionFile({ path }) {
  if (!path) return null;
  const url = `${API_BASE}/${path}`;
  const kind = fileKind(path);
  return (
    <div className="hw-file">
      {kind === 'image' && (
        <a href={url} target="_blank" rel="noreferrer" className="hw-file-preview">
          <img src={url} alt="فایل ارسالی شاگرد" loading="lazy" />
        </a>
      )}
      <a href={url} target="_blank" rel="noreferrer" className="hw-btn hw-btn--soft">
        <i className={`fa ${kind === 'pdf' ? 'fa-file-pdf' : kind === 'image' ? 'fa-image' : 'fa-paperclip'}`} aria-hidden="true" />
        {' '}{kind === 'file' ? 'دانلود' : 'باز کردن'} «{fileName(path)}»
      </a>
    </div>
  );
}

export default function HomeworkReviewDesk({
  homework,
  classTitle = '',
  onBack,
  onEdit,
  onCopy,
  onChanged,
  toast
}) {
  const homeworkId = homework?._id;
  const maxScore = Number(homework?.maxScore || 100);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [draft, setDraft] = useState({ score: '', feedback: '' });
  const [draftTouched, setDraftTouched] = useState(false);
  const [busy, setBusy] = useState('');
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyAudience, setNotifyAudience] = useState('missing');
  const [notifyMessage, setNotifyMessage] = useState('');
  const [exporting, setExporting] = useState(false);
  const scoreInputRef = useRef(null);

  const loadRoster = useCallback(async ({ keepSelection = true } = {}) => {
    if (!homeworkId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetch(`${API_BASE}/api/homeworks/${homeworkId}/roster`, { dedupe: false });
      const nextRows = data?.rows || [];
      setRows(nextRows);
      setSummary(data?.summary || null);
      setSelectedId((prev) => {
        if (keepSelection && nextRows.some((row) => row.student._id === prev)) return prev;
        const firstPending = nextRows.find((row) => row.state === 'submitted');
        return (firstPending || nextRows.find((row) => row.submission) || nextRows[0])?.student._id || '';
      });
    } catch (error) {
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [homeworkId]);

  useEffect(() => {
    setFilter('all');
    setSearch('');
    setDetailOpen(false);
    loadRoster({ keepSelection: false });
  }, [loadRoster]);

  const visibleRows = useMemo(() => rows
    .map((row, index) => ({ ...row, serial: index + 1 }))
    .filter((row) => matchesFilter(row, filter))
    .filter((row) => studentMatchesSearch(row.student, search)), [rows, filter, search]);

  const filterCounts = useMemo(() => {
    const counts = {};
    ROSTER_FILTERS.forEach(({ key }) => {
      counts[key] = rows.filter((row) => matchesFilter(row, key)).length;
    });
    return counts;
  }, [rows]);

  const selectedIndex = rows.findIndex((row) => row.student._id === selectedId);
  const selected = selectedIndex >= 0 ? rows[selectedIndex] : null;
  const submission = selected?.submission || null;

  useEffect(() => {
    setDraft({
      score: typeof submission?.score === 'number' ? String(submission.score) : '',
      feedback: submission?.feedback || ''
    });
    setDraftTouched(false);
    setRevisionOpen(false);
    setRevisionNote('');
  }, [selectedId, submission?._id, submission?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoreError = validateScore(draft.score, maxScore);

  const selectRow = (studentId) => {
    setSelectedId(studentId);
    setDetailOpen(true);
  };

  const replaceSubmission = (updated) => {
    setRows((prev) => prev.map((row) => (
      row.submission?._id === updated._id
        ? { ...row, state: updated.status, submission: { ...row.submission, ...updated } }
        : row
    )));
    onChanged?.();
  };

  const goToNextPending = (fromIndex) => {
    const ordered = [...rows.slice(fromIndex + 1), ...rows.slice(0, fromIndex + 1)];
    const next = ordered.find((row) => row.state === 'submitted' && row.student._id !== selectedId);
    if (next) {
      setSelectedId(next.student._id);
      setTimeout(() => scoreInputRef.current?.focus(), 60);
    } else {
      toast?.success('همهٔ تحویل‌های این کارخانگی بررسی شد.');
    }
  };

  const saveGrade = async ({ advance = false } = {}) => {
    setDraftTouched(true);
    if (!submission || scoreError || busy) return;
    setBusy('grade');
    try {
      const data = await jsonPost(`${API_BASE}/api/homeworks/${homeworkId}/grade`, {
        submissionId: submission._id,
        score: Number(draft.score),
        feedback: draft.feedback.trim()
      });
      replaceSubmission(data.submission);
      toast?.success(`نمرهٔ ${selected.student.name} ثبت شد.`);
      if (advance) goToNextPending(selectedIndex);
    } catch (error) {
      toast?.error(failureMessage(error, 'ثبت نمره ناموفق بود.'));
    } finally {
      setBusy('');
    }
  };

  const sendRevision = async () => {
    if (!submission || !revisionNote.trim() || busy) return;
    setBusy('revision');
    try {
      const data = await jsonPost(`${API_BASE}/api/homeworks/${homeworkId}/request-revision`, {
        submissionId: submission._id,
        note: revisionNote.trim()
      });
      replaceSubmission(data.submission);
      toast?.success('کارخانگی برای اصلاح به شاگرد برگشت و به او اطلاع داده شد.');
    } catch (error) {
      toast?.error(failureMessage(error, 'برگرداندن برای اصلاح ناموفق بود.'));
    } finally {
      setBusy('');
    }
  };

  const sendNotification = async () => {
    setBusy('notify');
    try {
      const data = await jsonPost(`${API_BASE}/api/homeworks/${homeworkId}/notify`, {
        audience: notifyAudience,
        message: notifyMessage.trim()
      });
      toast?.success(`اعلان برای ${faNumber(data.notifiedCount)} شاگرد فرستاده شد.`);
      setNotifyOpen(false);
      setNotifyMessage('');
    } catch (error) {
      toast?.error(failureMessage(error, 'ارسال اعلان ناموفق بود.'));
    } finally {
      setBusy('');
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const blob = await apiFetch(`${API_BASE}/api/homeworks/${homeworkId}/export.xlsx`, {
        parse: 'blob',
        headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        dedupe: false
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `نمرات-${homework.title}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast?.error(failureMessage(error, 'ساخت فایل اکسل ناموفق بود.'));
    } finally {
      setExporting(false);
    }
  };

  const due = getDueState(homework?.dueDate);
  const missingCount = filterCounts.missing || 0;
  const submittedCount = rows.length - missingCount;
  const rosterCount = summary?.rosterCount ?? rows.length;
  const progress = rosterCount ? Math.min(100, Math.round((submittedCount / rosterCount) * 100)) : 0;

  return (
    <div className="hw-desk">
      <div className="hw-desk-top">
        <button type="button" className="hw-btn hw-btn--ghost" onClick={onBack}>
          <i className="fa fa-arrow-right" aria-hidden="true" /> همهٔ کارخانگی‌ها
        </button>
        <div className="hw-desk-actions">
          <button type="button" className="hw-btn hw-btn--soft" onClick={() => onEdit(homework)}>
            <i className="fa fa-pen" aria-hidden="true" /> ویرایش
          </button>
          <button type="button" className="hw-btn hw-btn--soft" onClick={() => onCopy(homework)}>
            <i className="fa fa-copy" aria-hidden="true" /> کپی به صنف دیگر
          </button>
          <button type="button" className="hw-btn hw-btn--soft" onClick={() => setNotifyOpen(true)}>
            <i className="fa fa-bell" aria-hidden="true" /> اعلان به شاگردان
          </button>
          <button type="button" className="hw-btn hw-btn--soft" onClick={exportExcel} disabled={exporting}>
            <i className="fa fa-file-excel" aria-hidden="true" /> {exporting ? 'در حال ساخت...' : 'خروجی اکسل'}
          </button>
          <button type="button" className="hw-icon-btn" onClick={() => loadRoster()} aria-label="بازخوانی" title="بازخوانی">
            <i className="fa fa-rotate" aria-hidden="true" />
          </button>
        </div>
      </div>

      <section className="hw-desk-hero">
        <div className="hw-desk-title">
          <h2>{homework.title}</h2>
          <div className="hw-meta">
            {classTitle && <span><i className="fa fa-users" aria-hidden="true" /> {classTitle}</span>}
            <span><i className="fa fa-calendar" aria-hidden="true" /> {homework.dueDate ? formatDate(homework.dueDate) : 'بدون موعد'}</span>
            <span className={`hw-badge hw-badge--${due.tone}`}>{due.label}</span>
            <span><i className="fa fa-star" aria-hidden="true" /> از {faNumber(maxScore)} نمره</span>
            {homework.attachment && (
              <a href={`${API_BASE}/${homework.attachment}`} target="_blank" rel="noreferrer">
                <i className="fa fa-paperclip" aria-hidden="true" /> فایل ضمیمه
              </a>
            )}
          </div>
          {homework.description && <p className="hw-desc">{homework.description}</p>}
        </div>
        <div className="hw-desk-progress">
          <div className="hw-progress-label">
            <strong>{faNumber(submittedCount)}</strong> از {faNumber(rosterCount)} شاگرد تحویل داده‌اند
          </div>
          <div className="hw-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="hw-progress-chips">
            <span className="hw-badge hw-badge--info">{faNumber(filterCounts.submitted)} در انتظار بررسی</span>
            <span className="hw-badge hw-badge--success">{faNumber(filterCounts.graded)} نمره‌خورده</span>
            {filterCounts.late > 0 && <span className="hw-badge hw-badge--warning">{faNumber(filterCounts.late)} دیر</span>}
            {filterCounts.revision_requested > 0 && (
              <span className="hw-badge hw-badge--purple">{faNumber(filterCounts.revision_requested)} برگشت برای اصلاح</span>
            )}
          </div>
        </div>
      </section>

      {loadError && <DataErrorCard error={loadError} onRetry={() => loadRoster()} compact />}

      <div className={`hw-desk-grid ${detailOpen ? 'is-detail-open' : ''}`}>
        <aside className="hw-roster" aria-label="فهرست شاگردان">
          <div className="hw-roster-tools">
            <div className="hw-search">
              <i className="fa fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                placeholder="جستجوی نام یا نمبر اساس"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="جستجوی شاگرد"
              />
            </div>
            <div className="hw-tabs hw-tabs--scroll" role="tablist" aria-label="فیلتر وضعیت">
              {ROSTER_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={filter === key ? 'is-active' : ''}
                  onClick={() => setFilter(key)}
                >
                  {label} <span className="hw-count">{faNumber(filterCounts[key] || 0)}</span>
                </button>
              ))}
            </div>
          </div>

          <ul className="hw-roster-list">
            {loading && !rows.length && Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="hw-roster-skeleton"><Skeleton height="2.4rem" /></li>
            ))}
            {!loading && !visibleRows.length && (
              <li className="hw-empty-inline">
                {rows.length ? 'شاگردی با این فیلتر پیدا نشد.' : 'برای این صنف شاگرد فعالی ثبت نشده است.'}
              </li>
            )}
            {visibleRows.map((row) => (
              <li key={row.student._id}>
                <button
                  type="button"
                  className={`hw-roster-row ${row.student._id === selectedId ? 'is-selected' : ''}`}
                  onClick={() => selectRow(row.student._id)}
                >
                  <span className="hw-serial">{faNumber(row.serial)}</span>
                  <span className="hw-roster-name">
                    <strong>{row.student.name || 'شاگرد'}</strong>
                    <small>
                      {row.student.admissionNo ? `اساس: ${row.student.admissionNo}` : 'بدون نمبر اساس'}
                      {!row.inClass && ' · خارج از صنف'}
                    </small>
                  </span>
                  <span className="hw-roster-state">
                    {row.state === 'graded' && typeof row.submission?.score === 'number'
                      ? <span className="hw-score-pill">{faNumber(row.submission.score)}/{faNumber(maxScore)}</span>
                      : <StateBadge state={row.state} />}
                    <LateBadge submission={row.submission} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="hw-detail" aria-live="polite">
          <button type="button" className="hw-btn hw-btn--ghost hw-detail-close" onClick={() => setDetailOpen(false)}>
            <i className="fa fa-arrow-right" aria-hidden="true" /> بازگشت به فهرست
          </button>

          {!selected && !loading && (
            <div className="hw-empty-inline">برای دیدن تحویل، یک شاگرد را از فهرست انتخاب کنید.</div>
          )}

          {selected && (
            <>
              <header className="hw-detail-head">
                <div>
                  <h3>{selected.student.name || 'شاگرد'}</h3>
                  <span className="hw-muted">
                    ردیف {faNumber(selectedIndex + 1)}
                    {selected.student.admissionNo && ` · اساس: ${selected.student.admissionNo}`}
                    {selected.student.email && ` · ${selected.student.email}`}
                  </span>
                </div>
                <StateBadge state={selected.state} />
              </header>

              {!submission && (
                <div className="hw-missing">
                  <i className="fa fa-inbox" aria-hidden="true" />
                  <p>
                    {selected.state === 'missing_overdue'
                      ? 'موعد گذشته و این شاگرد هنوز کارخانگی را تحویل نداده است.'
                      : 'این شاگرد هنوز کارخانگی را تحویل نداده است.'}
                  </p>
                  <button
                    type="button"
                    className="hw-btn hw-btn--soft"
                    onClick={() => { setNotifyAudience('missing'); setNotifyOpen(true); }}
                  >
                    <i className="fa fa-bell" aria-hidden="true" /> یادآوری به همهٔ تحویل‌نداده‌ها
                  </button>
                </div>
              )}

              {submission && (
                <>
                  <div className="hw-detail-meta">
                    <span><i className="fa fa-paper-plane" aria-hidden="true" /> تحویل: {formatDate(submission.submittedAt)}</span>
                    {submission.revisionCount > 0 && (
                      <span><i className="fa fa-rotate-left" aria-hidden="true" /> {faNumber(submission.revisionCount)} بار برای اصلاح برگشته</span>
                    )}
                  </div>

                  {submission.isLate && (
                    <div className="hw-alert hw-alert--warning" role="note">
                      <i className="fa fa-triangle-exclamation" aria-hidden="true" />
                      <span>
                        این تحویل <strong>{lateDaysText(submission.lateDays)}</strong> پس از موعد ({formatDate(homework.dueDate)}) رسیده است.
                      </span>
                    </div>
                  )}

                  {selected.state === 'revision_requested' && (
                    <div className="hw-alert hw-alert--purple" role="note">
                      <i className="fa fa-rotate-left" aria-hidden="true" />
                      <span>
                        منتظر اصلاحِ شاگرد. یادداشت شما: «{submission.revisionNote}»
                        {submission.revisionRequestedAt && ` (${formatDate(submission.revisionRequestedAt)})`}
                      </span>
                    </div>
                  )}

                  <div className="hw-answer">
                    <h4>پاسخ شاگرد</h4>
                    <p>{submission.text || '—'}</p>
                    <SubmissionFile path={submission.file} />
                  </div>

                  {selected.state !== 'revision_requested' && (
                    <form
                      noValidate
                      className="hw-grade"
                      onSubmit={(event) => { event.preventDefault(); saveGrade({ advance: true }); }}
                    >
                      <div className="hw-grade-score">
                        <label htmlFor="hw-grade-score">نمره</label>
                        <div className="hw-score-input">
                          <input
                            id="hw-grade-score"
                            ref={scoreInputRef}
                            type="number"
                            min={0}
                            max={maxScore}
                            step="0.5"
                            inputMode="decimal"
                            value={draft.score}
                            onChange={(event) => { setDraft((prev) => ({ ...prev, score: event.target.value })); setDraftTouched(true); }}
                            aria-invalid={draftTouched && Boolean(scoreError)}
                          />
                          <span>از {faNumber(maxScore)}</span>
                        </div>
                        <div className="hw-chips">
                          {[1, 0.75, 0.5].map((ratio) => (
                            <button
                              key={ratio}
                              type="button"
                              className="hw-chip"
                              onClick={() => { setDraft((prev) => ({ ...prev, score: String(Math.round(maxScore * ratio * 10) / 10) })); setDraftTouched(true); }}
                            >
                              {faNumber(Math.round(maxScore * ratio * 10) / 10)}
                            </button>
                          ))}
                        </div>
                        {draftTouched && scoreError && <span className="hw-error">{scoreError}</span>}
                      </div>

                      <div className="hw-field">
                        <label htmlFor="hw-grade-feedback">بازخورد برای شاگرد</label>
                        <div className="hw-chips">
                          {FEEDBACK_PRESETS.map((text) => (
                            <button
                              key={text}
                              type="button"
                              className="hw-chip"
                              onClick={() => setDraft((prev) => ({
                                ...prev,
                                feedback: prev.feedback.trim() ? `${prev.feedback.trim()} ${text}` : text
                              }))}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                        <textarea
                          id="hw-grade-feedback"
                          rows={3}
                          value={draft.feedback}
                          placeholder="اختیاری"
                          onChange={(event) => setDraft((prev) => ({ ...prev, feedback: event.target.value }))}
                        />
                      </div>

                      <div className="hw-grade-actions">
                        <button type="submit" className="hw-btn hw-btn--primary" disabled={Boolean(busy)}>
                          {busy === 'grade' ? 'در حال ثبت...' : 'ذخیره و بعدی'} <i className="fa fa-arrow-left" aria-hidden="true" />
                        </button>
                        <button type="button" className="hw-btn hw-btn--soft" disabled={Boolean(busy)} onClick={() => saveGrade()}>
                          فقط ذخیره
                        </button>
                        <button
                          type="button"
                          className="hw-btn hw-btn--ghost"
                          disabled={Boolean(busy)}
                          onClick={() => setRevisionOpen((prev) => !prev)}
                          aria-expanded={revisionOpen}
                        >
                          <i className="fa fa-rotate-left" aria-hidden="true" /> برگرداندن برای اصلاح
                        </button>
                      </div>
                      <p className="hw-hint">کلید Enter نمره را ذخیره می‌کند و به تحویل بعدیِ بررسی‌نشده می‌رود.</p>
                    </form>
                  )}

                  {revisionOpen && selected.state !== 'revision_requested' && (
                    <div className="hw-revision">
                      <label htmlFor="hw-revision-note">شاگرد چه چیزی را اصلاح کند؟</label>
                      <textarea
                        id="hw-revision-note"
                        rows={3}
                        maxLength={2000}
                        value={revisionNote}
                        onChange={(event) => setRevisionNote(event.target.value)}
                        placeholder="مثلاً: راه‌حل سوال ۳ را کامل بنویسید."
                      />
                      <p className="hw-hint">نمرهٔ فعلی پاک می‌شود و شاگرد می‌تواند پاسخ تازه بفرستد. به او اعلان می‌رود.</p>
                      <div className="hw-grade-actions">
                        <button
                          type="button"
                          className="hw-btn hw-btn--purple"
                          disabled={!revisionNote.trim() || Boolean(busy)}
                          onClick={sendRevision}
                        >
                          {busy === 'revision' ? 'در حال ارسال...' : 'برگرداندن برای اصلاح'}
                        </button>
                        <button type="button" className="hw-btn hw-btn--ghost" onClick={() => setRevisionOpen(false)}>انصراف</button>
                      </div>
                    </div>
                  )}

                  {selected.state === 'graded' && submission.feedback && (
                    <p className="hw-muted">بازخوردِ ثبت‌شده: {submission.feedback}</p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>

      <HomeworkDialog
        open={notifyOpen}
        title="اعلان به شاگردان"
        subtitle={homework.title}
        labelledBy="homework-notify-title"
        onRequestClose={() => busy !== 'notify' && setNotifyOpen(false)}
        footer={(
          <>
            <button type="button" className="hw-btn hw-btn--primary" onClick={sendNotification} disabled={busy === 'notify'}>
              {busy === 'notify' ? 'در حال ارسال...' : 'ارسال اعلان'}
            </button>
            <button type="button" className="hw-btn hw-btn--ghost" onClick={() => setNotifyOpen(false)}>انصراف</button>
          </>
        )}
      >
        <fieldset className="hw-radio-group">
          <legend>گیرندگان</legend>
          <label className="hw-check">
            <input
              type="radio"
              name="hw-notify-audience"
              checked={notifyAudience === 'missing'}
              onChange={() => setNotifyAudience('missing')}
            />
            <span>فقط شاگردانی که تحویل نداده‌اند ({faNumber(rows.filter((row) => row.inClass && !row.submission).length)} نفر)</span>
          </label>
          <label className="hw-check">
            <input
              type="radio"
              name="hw-notify-audience"
              checked={notifyAudience === 'all'}
              onChange={() => setNotifyAudience('all')}
            />
            <span>همهٔ شاگردان صنف ({faNumber(rows.filter((row) => row.inClass).length)} نفر)</span>
          </label>
        </fieldset>
        <div className="hw-field">
          <label htmlFor="hw-notify-message">متن پیام (اختیاری)</label>
          <textarea
            id="hw-notify-message"
            rows={3}
            value={notifyMessage}
            onChange={(event) => setNotifyMessage(event.target.value)}
            placeholder={notifyAudience === 'missing'
              ? `کارخانگی «${homework.title}» را هنوز تحویل نداده‌اید.`
              : `یادآوری کارخانگی «${homework.title}».`}
          />
          <p className="hw-hint">اگر خالی بماند، متن پیش‌فرض همراه با موعد فرستاده می‌شود.</p>
        </div>
      </HomeworkDialog>
    </div>
  );
}
