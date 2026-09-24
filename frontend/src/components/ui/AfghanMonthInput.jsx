import React, { useEffect, useState } from 'react';
import './AfghanDateInput.css';
import { AFGHAN_SOLAR_MONTHS, normalizeAfghanMonthKey, toAsciiDigits } from '../../utils/afghanDate';

// Picks an Afghan solar month as a "1405-06" key - AfghanDateInput without the
// day. Used where the month itself is the choice, e.g. which month a bill is for.
export default function AfghanMonthInput({
  value = '',
  onChange,
  required = false,
  disabled = false,
  className = '',
  ariaLabel = 'ماه',
  placeholder = '۱۴۰۵'
}) {
  const monthKey = normalizeAfghanMonthKey(value);
  const [year, setYear] = useState(monthKey ? monthKey.slice(0, 4) : '');
  const [month, setMonth] = useState(monthKey ? String(Number(monthKey.slice(5))) : '1');

  useEffect(() => {
    if (!monthKey) return;
    setYear(monthKey.slice(0, 4));
    setMonth(String(Number(monthKey.slice(5))));
  }, [monthKey]);

  const commit = (nextYear, nextMonth) => {
    const nextKey = normalizeAfghanMonthKey(`${nextYear}-${nextMonth}`);
    if (nextKey && nextKey !== monthKey) onChange?.(nextKey);
  };

  return (
    <div className={`afghan-date-field ${className}`.trim()}>
      <div className="afghan-date-input-grid afghan-month-input-grid" dir="rtl">
        <input
          className="afghan-date-input afghan-date-year"
          value={year}
          onChange={(event) => {
            const nextYear = toAsciiDigits(event.target.value).replace(/\D/g, '').slice(0, 4);
            setYear(nextYear);
            commit(nextYear, month);
          }}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          inputMode="numeric"
          aria-label={`${ariaLabel} - سال هجری شمسی`}
        />
        <select
          className="afghan-date-input afghan-date-month"
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
            commit(year, event.target.value);
          }}
          disabled={disabled}
          aria-label={`${ariaLabel} - ماه هجری شمسی`}
        >
          {AFGHAN_SOLAR_MONTHS.map((monthName, index) => (
            <option key={monthName} value={String(index + 1)}>{monthName}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
