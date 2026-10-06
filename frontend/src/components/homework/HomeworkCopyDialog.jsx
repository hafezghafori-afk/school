import React, { useEffect, useState } from 'react';

import AfghanDateInput from '../ui/AfghanDateInput';
import { toGregorianDateInputValue } from '../../utils/afghanDate';
import HomeworkDialog from './HomeworkDialog';
import { faNumber, formatDate } from './homeworkUtils';

// classes: [{ value, label }] - every class the user can assign to, except
// the homework's own.
export default function HomeworkCopyDialog({ open, homework, classes = [], busy = false, onClose, onCopy }) {
  const [selected, setSelected] = useState([]);
  const [dueMode, setDueMode] = useState('same');
  const [dueDate, setDueDate] = useState('');
  const [notifyStudents, setNotifyStudents] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setDueMode('same');
    setDueDate(homework?.dueDate ? toGregorianDateInputValue(homework.dueDate) : '');
    setNotifyStudents(true);
  }, [open, homework]);

  const toggle = (value) => setSelected((prev) => (
    prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
  ));

  const submit = () => {
    if (!selected.length || busy) return;
    onCopy({
      classIds: selected,
      ...(dueMode === 'new' ? { dueDate } : {}),
      notifyStudents
    });
  };

  return (
    <HomeworkDialog
      open={open}
      title="کپی کارخانگی به صنف دیگر"
      subtitle={homework?.title || ''}
      labelledBy="homework-copy-title"
      onRequestClose={() => !busy && onClose()}
      footer={(
        <>
          <button type="button" className="hw-btn hw-btn--primary" onClick={submit} disabled={!selected.length || busy}>
            {busy ? 'در حال کپی...' : `کپی به ${faNumber(selected.length)} صنف`}
          </button>
          <button type="button" className="hw-btn hw-btn--ghost" onClick={onClose} disabled={busy}>انصراف</button>
        </>
      )}
    >
      {!classes.length ? (
        <p className="hw-empty-inline">صنف دیگری برای کپی در دسترس نیست.</p>
      ) : (
        <fieldset className="hw-radio-group">
          <legend>صنف‌های مقصد</legend>
          <div className="hw-class-picks">
            {classes.map((item) => (
              <label key={item.value} className={`hw-class-pick ${selected.includes(item.value) ? 'is-active' : ''}`}>
                <input type="checkbox" checked={selected.includes(item.value)} onChange={() => toggle(item.value)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="hw-radio-group">
        <legend>موعد تحویل در صنف‌های مقصد</legend>
        <label className="hw-check">
          <input type="radio" name="hw-copy-due" checked={dueMode === 'same'} onChange={() => setDueMode('same')} />
          <span>همان موعد ({homework?.dueDate ? formatDate(homework.dueDate) : 'بدون موعد'})</span>
        </label>
        <label className="hw-check">
          <input type="radio" name="hw-copy-due" checked={dueMode === 'new'} onChange={() => setDueMode('new')} />
          <span>موعد تازه</span>
        </label>
        {dueMode === 'new' && (
          <AfghanDateInput value={dueDate} onChange={setDueDate} showGregorianEquivalent />
        )}
      </fieldset>

      <label className="hw-check">
        <input type="checkbox" checked={notifyStudents} onChange={(event) => setNotifyStudents(event.target.checked)} />
        <span>به شاگردان صنف‌های مقصد اعلان بفرست</span>
      </label>
      <p className="hw-hint">شرح، حداکثر نمره و فایل ضمیمه هم کپی می‌شود؛ تحویل‌ها و نمره‌ها کپی نمی‌شوند.</p>
    </HomeworkDialog>
  );
}
