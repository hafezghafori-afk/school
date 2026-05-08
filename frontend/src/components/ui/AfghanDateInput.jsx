import React, { useEffect, useMemo, useState } from 'react';
import './AfghanDateInput.css';
import {
  AFGHAN_SOLAR_MONTHS,
  afghanSolarToGregorianInput,
  formatAfghanDate,
  gregorianToAfghanSolar,
  toAsciiDigits,
  toGregorianDateInputValue,
  toGregorianDateTimeInputValue,
  toGregorianEquivalentLabel
} from '../../utils/afghanDate';

function readTime(value = '') {
  const match = /T(\d{2}:\d{2})/.exec(String(value || ''));
  return match?.[1] || '';
}

function buildDateTimeValue(dateValue = '', timeValue = '') {
  if (!dateValue) return '';
  return timeValue ? `${dateValue}T${timeValue}` : dateValue;
}

export default function AfghanDateInput({
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  className = '',
  placeholder = '۱۴۰۵',
  showGregorianEquivalent = false,
  includeTime = false,
  inputClassName = '',
  ...rest
}) {
  const [innerValue, setInnerValue] = useState('');
  const effectiveValue = value ?? innerValue;
  const solar = useMemo(() => gregorianToAfghanSolar(effectiveValue), [effectiveValue]);
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('1');
  const [day, setDay] = useState('');
  const [time, setTime] = useState('');

  useEffect(() => {
    if (!solar) {
      setYear('');
      setMonth('1');
      setDay('');
      setTime('');
      return;
    }
    setYear(String(solar.jy));
    setMonth(String(solar.jm));
    setDay(String(solar.jd));
    setTime(readTime(effectiveValue));
  }, [effectiveValue, solar]);

  const commit = (next = {}) => {
    const nextYear = next.year ?? year;
    const nextMonth = next.month ?? month;
    const nextDay = next.day ?? day;
    const nextTime = next.time ?? time;
    const dateValue = afghanSolarToGregorianInput(nextYear, nextMonth, nextDay);
    const nextValue = includeTime ? buildDateTimeValue(dateValue, nextTime) : dateValue;
    if (value === undefined) setInnerValue(nextValue);
    onChange?.(nextValue);
  };

  const equivalent = effectiveValue ? toGregorianEquivalentLabel(effectiveValue) : '';
  const afghanLabel = effectiveValue
    ? formatAfghanDate(effectiveValue, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {})
      })
    : '';
  const hiddenValue = includeTime ? toGregorianDateTimeInputValue(effectiveValue) : toGregorianDateInputValue(effectiveValue);

  return (
    <div className={`afghan-date-field ${className}`.trim()}>
      {name ? <input type="hidden" name={name} value={hiddenValue || ''} /> : null}
      <div className="afghan-date-input-grid" dir="rtl">
        <input
          id={id}
          className={`afghan-date-input afghan-date-year ${inputClassName}`.trim()}
          value={year}
          onChange={(event) => {
            const nextYear = toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, 4);
            setYear(nextYear);
            commit({ year: nextYear });
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          inputMode="numeric"
          aria-label="سال هجری شمسی"
          {...rest}
        />
        <select
          className="afghan-date-input afghan-date-month"
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
            commit({ month: event.target.value });
          }}
          disabled={disabled}
          aria-label="ماه هجری شمسی"
        >
          {AFGHAN_SOLAR_MONTHS.map((monthName, index) => (
            <option key={monthName} value={String(index + 1)}>{monthName}</option>
          ))}
        </select>
        <input
          className="afghan-date-input afghan-date-day"
          value={day}
          onChange={(event) => {
            const nextDay = toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, 2);
            setDay(nextDay);
            commit({ day: nextDay });
          }}
          placeholder="روز"
          required={required}
          disabled={disabled}
          inputMode="numeric"
          aria-label="روز هجری شمسی"
        />
        {includeTime ? (
          <input
            className="afghan-date-input afghan-date-time"
            type="time"
            value={time}
            onChange={(event) => {
              setTime(event.target.value);
              commit({ time: event.target.value });
            }}
            disabled={disabled}
            aria-label="وقت"
          />
        ) : null}
      </div>
      {showGregorianEquivalent && (afghanLabel || equivalent) ? (
        <div className="afghan-date-equivalent">
          {afghanLabel ? <span>{afghanLabel}</span> : null}
          {equivalent ? <small>معادل میلادی: {equivalent}</small> : null}
        </div>
      ) : null}
    </div>
  );
}
