import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '../components/LoginModernBase.css';
import PasswordField from '../components/PasswordField';
import { API_BASE } from '../config/api';
import { apiFetch, failureMessage } from '../utils/apiClient';
import { PublicFooter, PublicHeader, SchoolLogo } from '../components/public';
import useSiteSettings from '../hooks/useSiteSettings';

// Mirrors backend/routes/authRoutes.js: the emailed token is 32 random bytes
// in hex, and a password needs at least 6 characters.
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const MIN_PASSWORD_LENGTH = 6;

const LockIcon = () => (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = String(searchParams.get('token') || '').trim();
  const tokenUsable = TOKEN_PATTERN.test(token);
  const { settings: publicSettings } = useSiteSettings();
  const passwordInputId = useId();
  const confirmInputId = useId();
  const messageRef = useRef(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [focusedField, setFocusedField] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (message && messageTone === 'error') messageRef.current?.focus();
  }, [message, messageTone]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      showMessage(`رمز عبور حداقل باید ${MIN_PASSWORD_LENGTH} حرف باشد.`, 'error');
      return;
    }
    if (password !== confirmPassword) {
      showMessage('رمز جدید و تکرار آن یکی نیستند.', 'error');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const res = await apiFetch(`${API_BASE}/api/auth/reset-password`, {
        parse: 'response', rejectOnHttpError: false,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });
      const data = await res.json();
      if (!data?.success) {
        showMessage(data?.message || 'تغییر رمز عبور انجام نشد.', 'error');
        return;
      }
      setDone(true);
      setPassword('');
      setConfirmPassword('');
      showMessage(data?.message || 'رمز عبور شما تغییر کرد.', 'success');
    } catch (error) {
      showMessage(failureMessage(error, 'اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const brandName = publicSettings?.brandName || 'Iman Girls School';
  const brandSubtitle = publicSettings?.brandSubtitle || 'مکتب دخترانه ایمان';
  const logoSrc = publicSettings?.schoolLogoUrl || publicSettings?.logoUrl || '';

  return (
    <div className="login-public-page" dir="rtl">
      <PublicHeader
        logoSrc={logoSrc}
        schoolName={brandName}
        schoolSubtitle={brandSubtitle}
        navItems={publicSettings?.mainMenu}
      />
      <main className="login-modern-container">
        <div className="login-form-panel">
          <div className="animated-background" aria-hidden="true"></div>
          <div className="login-card">
            <div className="login-header">
              <div className="logo-wrapper">
                <SchoolLogo to={null} logoSrc="" name={brandName} subtitle={brandSubtitle} className="login-school-logo" />
              </div>
              <h1 className="login-title">گذاشتن رمز جدید</h1>
              <p className="login-subtitle">
                {!tokenUsable
                  ? 'این لینک کامل نیست یا درست کاپی نشده است.'
                  : done
                    ? 'رمز جدید ذخیره شد.'
                    : 'رمز تازهٔ حساب خود را بنویسید. این لینک فقط یک بار کار می‌کند.'}
              </p>
            </div>

            {tokenUsable && !done ? (
              <form className="login-form" onSubmit={handleSubmit} aria-busy={loading}>
                <div className={`input-group ${focusedField === 'password' ? 'focused' : ''}`}>
                  <label htmlFor={passwordInputId} className="field-label">رمز جدید</label>
                  <PasswordField
                    id={passwordInputId}
                    name="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField('')}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    wrapperClassName="password-input-wrapper"
                    inputClassName="modern-input password-input"
                    toggleClassName="password-toggle"
                    iconClassName="password-toggle-icon"
                    leadingAdornment={<LockIcon />}
                    leadingClassName="password-leading-icon"
                    ariaInvalid={messageTone === 'error'}
                    style={{ textAlign: 'right', direction: 'rtl' }}
                  />
                </div>

                <div className={`input-group ${focusedField === 'confirm' ? 'focused' : ''}`}>
                  <label htmlFor={confirmInputId} className="field-label">تکرار رمز جدید</label>
                  <PasswordField
                    id={confirmInputId}
                    name="confirm-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    onFocus={() => setFocusedField('confirm')}
                    onBlur={() => setFocusedField('')}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    wrapperClassName="password-input-wrapper"
                    inputClassName="modern-input password-input"
                    toggleClassName="password-toggle"
                    iconClassName="password-toggle-icon"
                    leadingAdornment={<LockIcon />}
                    leadingClassName="password-leading-icon"
                    ariaInvalid={messageTone === 'error'}
                    style={{ textAlign: 'right', direction: 'rtl' }}
                  />
                </div>

                <button type="submit" disabled={loading} className="login-button">
                  <span className="button-text">{loading ? 'در حال ذخیره...' : 'ذخیرهٔ رمز جدید'}</span>
                  {loading && <div className="button-spinner" />}
                </button>

                {message && (
                  <div
                    ref={messageRef}
                    className={`message ${messageTone}`}
                    role={messageTone === 'error' ? 'alert' : 'status'}
                    aria-live={messageTone === 'error' ? 'assertive' : 'polite'}
                    aria-atomic="true"
                    tabIndex={-1}
                  >
                    {message}
                  </div>
                )}
              </form>
            ) : (
              <div className="login-form">
                {done && message ? (
                  <div className="message success" role="status" aria-live="polite" aria-atomic="true">{message}</div>
                ) : (
                  <div className="message error" role="alert">
                    لطفاً لینک را کامل از ایمیل باز کنید، یا از صفحهٔ ورود دوباره «فراموشی رمز» را بزنید.
                  </div>
                )}
                <Link to="/login" className="login-button">
                  <span className="button-text">{done ? 'ورود با رمز جدید' : 'رفتن به صفحهٔ ورود'}</span>
                </Link>
              </div>
            )}

            <div className="navigation-links">
              <p>
                <Link to="/login" className="login-alt-link">بازگشت به صفحه ورود</Link>
              </p>
              <p>
                <Link to="/" className="login-alt-link">بازگشت به صفحه اصلی</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter
        logoSrc={logoSrc}
        schoolName={brandName}
        schoolSubtitle={brandSubtitle}
        footerLinks={publicSettings?.footerLinks}
        footerNote={publicSettings?.footerNote || publicSettings?.aboutBody || ''}
      />
    </div>
  );
}
