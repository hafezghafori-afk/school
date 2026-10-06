import React, { useEffect, useMemo, useState } from 'react';

import { API_BASE } from '../../config/api';
import AfghanDateInput from '../ui/AfghanDateInput';
import { toGregorianDateInputValue } from '../../utils/afghanDate';
import HomeworkDialog from './HomeworkDialog';
import {
  ATTACHMENT_LIMIT_BYTES,
  MAX_SCORE_LIMIT,
  MAX_SCORE_PRESETS,
  dateInputFromToday,
  faNumber,
  fileName,
  formatFileSize,
  validateMaxScore
} from './homeworkUtils';

const DUE_PRESETS = [
  { label: 'فردا', days: 1 },
  { label: '۳ روز', days: 3 },
  { label: 'یک هفته', days: 7 },
  { label: 'دو هفته', days: 14 }
];

const buildInitialForm = (homework) => ({
  title: homework?.title || '',
  description: homework?.description || '',
  dueDate: homework?.dueDate ? toGregorianDateInputValue(homework.dueDate) : '',
  maxScore: homework?.maxScore ? String(homework.maxScore) : '100',
  attachment: null,
  notifyStudents: true
});

export default function HomeworkFormDrawer({ open, homework = null, classTitle = '', saving = false, onClose, onSave }) {
  const isEditing = Boolean(homework?._id);
  const [form, setForm] = useState(() => buildInitialForm(homework));
  const [initial, setInitial] = useState(() => buildInitialForm(homework));
  const [touched, setTouched] = useState(false);
  const [fileError, setFileError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = buildInitialForm(homework);
    setForm(next);
    setInitial(next);
    setTouched(false);
    setFileError('');
    setConfirmDiscard(false);
  }, [open, homework]);

  const dirty = useMemo(() => (
    form.title !== initial.title
    || form.description !== initial.description
    || form.dueDate !== initial.dueDate
    || String(form.maxScore) !== String(initial.maxScore)
    || Boolean(form.attachment)
  ), [form, initial]);

  const titleError = touched && !form.title.trim() ? 'عنوان کارخانگی را بنویسید.' : '';
  const maxScoreError = validateMaxScore(form.maxScore);
  const canSave = form.title.trim() && !maxScoreError && !fileError && !saving;

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const requestClose = () => {
    if (saving) return;
    if (dirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const pickFile = (file) => {
    if (!file) return;
    if (file.size > ATTACHMENT_LIMIT_BYTES) {
      setFileError(`حجم فایل ${formatFileSize(file.size)} است؛ حداکثر ۱۰ MB مجاز است.`);
      update({ attachment: null });
      return;
    }
    setFileError('');
    update({ attachment: file });
  };

  const submit = (event) => {
    event?.preventDefault();
    setTouched(true);
    if (!canSave) return;
    onSave({
      title: form.title.trim(),
      description: form.description,
      dueDate: form.dueDate,
      maxScore: Number(form.maxScore),
      attachment: form.attachment,
      notifyStudents: !isEditing && form.notifyStudents
    });
  };

  return (
    <HomeworkDialog
      open={open}
      variant="drawer"
      title={isEditing ? 'ویرایش کارخانگی' : 'کارخانگی جدید'}
      subtitle={classTitle ? `صنف: ${classTitle}` : ''}
      labelledBy="homework-form-title"
      onRequestClose={requestClose}
      footer={confirmDiscard ? (
        <div className="hw-discard">
          <span>تغییرات ذخیره نشده از بین برود؟</span>
          <button type="button" className="hw-btn hw-btn--danger" onClick={onClose}>بله، بستن</button>
          <button type="button" className="hw-btn hw-btn--ghost" onClick={() => setConfirmDiscard(false)}>ادامهٔ ویرایش</button>
        </div>
      ) : (
        <>
          <button type="submit" form="homework-form" className="hw-btn hw-btn--primary" disabled={!canSave}>
            {saving ? 'در حال ذخیره...' : (isEditing ? 'ذخیرهٔ تغییرات' : 'ثبت کارخانگی')}
          </button>
          <button type="button" className="hw-btn hw-btn--ghost" onClick={requestClose} disabled={saving}>انصراف</button>
        </>
      )}
    >
      <form id="homework-form" className="hw-form" onSubmit={submit} noValidate>
        <div className="hw-field">
          <label htmlFor="hw-title">عنوان کارخانگی <span className="hw-required">*</span></label>
          <input
            id="hw-title"
            data-autofocus
            type="text"
            maxLength={160}
            value={form.title}
            placeholder="مثلاً: تمرین‌های فصل سوم ریاضی"
            onChange={(event) => update({ title: event.target.value })}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(titleError)}
          />
          <div className="hw-field-foot">
            <span className="hw-error">{titleError}</span>
            <span className="hw-counter">{faNumber(form.title.length)} / ۱۶۰</span>
          </div>
        </div>

        <div className="hw-field">
          <label htmlFor="hw-description">شرح و رهنمود</label>
          <textarea
            id="hw-description"
            rows={5}
            maxLength={4000}
            value={form.description}
            placeholder="شاگردان دقیقاً چه کاری انجام دهند؟ صفحه‌ها، سوال‌ها، شیوهٔ نوشتن..."
            onChange={(event) => update({ description: event.target.value })}
          />
          <div className="hw-field-foot">
            <span />
            <span className="hw-counter">{faNumber(form.description.length)} / ۴٬۰۰۰</span>
          </div>
        </div>

        <div className="hw-field">
          <span className="hw-label">موعد تحویل</span>
          <div className="hw-chips" role="group" aria-label="موعدهای آماده">
            {DUE_PRESETS.map((preset) => {
              const value = dateInputFromToday(preset.days);
              return (
                <button
                  key={preset.days}
                  type="button"
                  className={`hw-chip ${form.dueDate === value ? 'is-active' : ''}`}
                  onClick={() => update({ dueDate: value })}
                >
                  {preset.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`hw-chip ${!form.dueDate ? 'is-active' : ''}`}
              onClick={() => update({ dueDate: '' })}
            >
              بدون موعد
            </button>
          </div>
          <AfghanDateInput
            value={form.dueDate}
            onChange={(value) => update({ dueDate: value })}
            showGregorianEquivalent
          />
          <p className="hw-hint">
            <i className="fa fa-circle-info" aria-hidden="true" /> تحویل پس از موعد هم پذیرفته می‌شود، اما با علامت «دیر» مشخص می‌شود.
          </p>
        </div>

        <div className="hw-field">
          <label htmlFor="hw-max-score">حداکثر نمره <span className="hw-required">*</span></label>
          <div className="hw-score-row">
            <input
              id="hw-max-score"
              type="number"
              min={1}
              max={MAX_SCORE_LIMIT}
              inputMode="numeric"
              value={form.maxScore}
              onChange={(event) => update({ maxScore: event.target.value })}
              aria-invalid={Boolean(maxScoreError)}
            />
            <div className="hw-chips" role="group" aria-label="مقیاس‌های رایج">
              {MAX_SCORE_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`hw-chip ${Number(form.maxScore) === value ? 'is-active' : ''}`}
                  onClick={() => update({ maxScore: String(value) })}
                >
                  از {faNumber(value)}
                </button>
              ))}
            </div>
          </div>
          {maxScoreError
            ? <span className="hw-error">{maxScoreError}</span>
            : <p className="hw-hint">شما مقیاس را تعیین می‌کنید؛ نمرهٔ هر شاگرد از همین عدد داده می‌شود.</p>}
        </div>

        <div className="hw-field">
          <span className="hw-label">فایل ضمیمه</span>
          <label
            className={`hw-dropzone ${dragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pickFile(event.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              className="hw-visually-hidden"
              onChange={(event) => {
                pickFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <i className="fa fa-cloud-arrow-up" aria-hidden="true" />
            {form.attachment ? (
              <span><strong>{form.attachment.name}</strong> · {formatFileSize(form.attachment.size)}</span>
            ) : (
              <span>فایل را اینجا رها کنید یا <u>انتخاب کنید</u> (حداکثر ۱۰ MB)</span>
            )}
          </label>
          {form.attachment && (
            <button type="button" className="hw-link-btn" onClick={() => update({ attachment: null })}>حذف فایل انتخاب‌شده</button>
          )}
          {fileError && <span className="hw-error">{fileError}</span>}
          {isEditing && homework?.attachment && !form.attachment && (
            <p className="hw-hint">
              فایل فعلی:{' '}
              <a href={`${API_BASE}/${homework.attachment}`} target="_blank" rel="noreferrer">{fileName(homework.attachment)}</a>
              {' '}— با انتخاب فایل تازه جایگزین می‌شود.
            </p>
          )}
        </div>

        {!isEditing && (
          <label className="hw-check">
            <input
              type="checkbox"
              checked={form.notifyStudents}
              onChange={(event) => update({ notifyStudents: event.target.checked })}
            />
            <span>به شاگردان این صنف اعلان بفرست</span>
          </label>
        )}
      </form>
    </HomeworkDialog>
  );
}
