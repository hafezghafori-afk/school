import React, { useId, useState } from 'react';

function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" {...props}>
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a21.66 21.66 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 5c7 0 11 7 11 7a21.72 21.72 0 0 1-3.22 4.31" />
      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

export default function PasswordField({
  id,
  name = 'password',
  label = '',
  labelClassName = '',
  value,
  onChange,
  placeholder = '',
  required = true,
  wrapperClassName = '',
  inputClassName = '',
  toggleClassName = '',
  iconClassName = '',
  leadingAdornment = null,
  leadingClassName = '',
  onFocus,
  onBlur,
  autoComplete = 'current-password',
  disabled = false,
  ariaDescribedBy,
  ariaInvalid = false
}) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={wrapperClassName}>
      {label ? (
        <label htmlFor={inputId} className={labelClassName}>
          {label}
        </label>
      ) : null}
      {leadingAdornment ? (
        <span className={leadingClassName} aria-hidden="true">
          {leadingAdornment}
        </span>
      ) : null}
      <input
        id={inputId}
        name={name}
        type={visible ? 'text' : 'password'}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={inputClassName}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      />
      <button
        type="button"
        className={toggleClassName}
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
        aria-pressed={visible}
        aria-controls={inputId}
        disabled={disabled}
      >
        {visible ? <EyeOffIcon className={iconClassName} /> : <EyeIcon className={iconClassName} />}
      </button>
    </div>
  );
}
