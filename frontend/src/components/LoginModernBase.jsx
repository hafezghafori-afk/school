
import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './LoginModernBase.css';
import PasswordField from './PasswordField';
import { persistAuthSession } from '../utils/authSession';

// استفاده از متغیر محیطی VITE_API_BASE
const API_BASE = import.meta.env.VITE_API_BASE || '';

const UserIcon = () => (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const LockIcon = () => (
  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const SchoolIcon = () => (
  <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </svg>
);

export default function LoginModernBase({
  title,
  subtitle,
  gradientOverride,
  backgroundStyle,
  customMessage = '',
  footerText = '',
  showRegistrationLink = true,
  logoSrc = '',
  logoAlt = 'Logo',
  iconOverride = null,
  settingsLoading = false
}) {
  const navigate = useNavigate();
  const emailInputId = useId();
  const passwordInputId = useId();
  const codeInputId = useId();
  const messageId = useId();
  const messageRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFactorMode, setTwoFactorMode] = useState(false);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [emailMasked, setEmailMasked] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    setLogoBroken(false);
  }, [logoSrc]);

  useEffect(() => {
    if (message && messageTone === 'error') {
      messageRef.current?.focus();
    }
  }, [message, messageTone]);

  const getLoginConfig = () => ({
    title: title || 'ورود به سیستم',
    icon: iconOverride || <SchoolIcon />,
    gradient: gradientOverride || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  });

  const config = getLoginConfig();

  const finishLogin = (data) => {
    persistAuthSession(data);
    if (data.role === 'admin') {
      navigate('/admin');
      return;
    }
    if (data.role === 'instructor') {
      navigate('/instructor-dashboard');
      return;
    }
    navigate('/dashboard');
  };

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const clearMessage = () => {
    setMessage('');
    setMessageTone('info');
  };

  const getFriendlyAuthMessage = (rawMessage, context = 'login') => {
    const original = String(rawMessage || '').trim();
    const normalized = original.toLowerCase();

    if (context === 'login') {
      if (!original) return 'ورود انجام نشد. لطفاً دوباره تلاش کنید.';
      if (normalized.includes('invalid') || normalized.includes('incorrect') || normalized.includes('wrong') || normalized.includes('نادرست') || normalized.includes('رمز')) {
        return 'ایمیل/نام کاربری یا رمز عبور درست نیست.';
      }
      if (normalized.includes('not found') || normalized.includes('یافت نشد')) {
        return 'حسابی با این مشخصات پیدا نشد.';
      }
      if (normalized.includes('blocked') || normalized.includes('disabled') || normalized.includes('مسدود') || normalized.includes('غیرفعال')) {
        return 'حساب غیرفعال است. با پشتیبانی تماس بگیرید.';
      }
    }
    if (context === 'verify') {
      if (!original) return 'تایید دو مرحله‌ای انجام نشد.';
      if (normalized.includes('expired') || normalized.includes('منقضی')) return 'کد منقضی شده است.';
      if (normalized.includes('invalid') || normalized.includes('نادرست')) return 'کد تایید درست نیست.';
    }
    return original;
  };

  const submitCredentials = async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!data?.success) {
      showMessage(getFriendlyAuthMessage(data?.message, 'login'), 'error');
      return;
    }

    if (data.requiresTwoFactor) {
      setTwoFactorMode(true);
      setChallengeToken(String(data.challengeToken || ''));
      setEmailMasked(String(data.emailMasked || email));
      setCode('');
      showMessage(data?.message || 'کد تایید دو مرحله‌ای ارسال شد.', 'info');
      return;
    }

    finishLogin(data);
  };

  const submitTwoFactor = async () => {
    const verifyCode = String(code || '').trim();
    if (!/^\d{6}$/.test(verifyCode)) {
      showMessage('کد تایید باید ۶ رقمی باشد.', 'error');
      return;
    }

    const res = await fetch(`${API_BASE}/api/auth/login/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeToken, code: verifyCode })
    });
    const data = await res.json();

    if (!data?.success) {
      showMessage(getFriendlyAuthMessage(data?.message, 'verify'), 'error');
      return;
    }

    finishLogin(data);
  };

  const submitForgotPassword = async () => {
    if (!email) {
      showMessage('لطفاً ایمیل یا نام کاربری خود را وارد کنید.', 'error');
      return;
    }

    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();

    if (!data?.success) {
      showMessage(data?.message || 'خطا در بازیابی رمز عبور.', 'error');
      return;
    }

    showMessage(data?.message || 'لینک بازیابی ارسال شد.', 'success');
  };

  const resendCode = async () => {
    if (!challengeToken || resendBusy) return;
    setResendBusy(true);
    clearMessage();

    try {
      const res = await fetch(`${API_BASE}/api/auth/login/2fa/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken })
      });
      const data = await res.json();

      if (!data?.success) {
        showMessage(getFriendlyAuthMessage(data?.message, 'resend'), 'error');
        return;
      }
      showMessage(data?.message || 'کد جدید ارسال شد.', 'success');
    } catch {
      showMessage('در ارتباط با سرور مشکلی پیش آمد.', 'error');
    } finally {
      setResendBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearMessage();
    setLoading(true);

    try {
      if (forgotPasswordMode) {
        await submitForgotPassword();
      } else if (twoFactorMode) {
        await submitTwoFactor();
      } else {
        await submitCredentials();
      }
    } catch (error) {
      console.error('Action error:', error);
      showMessage('اتصال به سرور برقرار نشد. اینترنت را بررسی کنید.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setTwoFactorMode(false);
    setForgotPasswordMode(false);
    setChallengeToken('');
    setCode('');
    clearMessage();
  };

  return (
    <div className="login-modern-container" dir="rtl">
      {/* Simplified background */}
      <div className="animated-background" style={backgroundStyle} aria-hidden="true"></div>

      <div className="login-card">
        <div className="login-header">
          <div className="logo-wrapper">
            <div className="logo-circle" style={{ background: config.gradient }}>
              {logoSrc && !logoBroken ? (
                <img
                  src={logoSrc}
                  alt={logoAlt}
                  className="login-logo-image"
                  onError={() => setLogoBroken(true)}
                />
              ) : (
                config.icon
              )}
            </div>
          </div>

          <h1 className="login-title">
            {forgotPasswordMode ? 'بازیابی حساب' : twoFactorMode ? 'تایید هویت' : config.title}
          </h1>

          <p className="login-subtitle">
            {forgotPasswordMode
              ? 'ایمیل یا نام کاربری خود را وارد کنید تا لینک بازیابی ارسال شود.'
              : twoFactorMode
                ? `کد تایید به ${emailMasked} ارسال شد`
                : ''}
          </p>
        </div>

        {customMessage && !twoFactorMode && !forgotPasswordMode && (
          <div className="login-custom-message">{customMessage}</div>
        )}

        {settingsLoading && !twoFactorMode && !forgotPasswordMode && (
          <div className="login-settings-skeleton" aria-hidden="true">
            <span className="login-skeleton-line short" />
            <span className="login-skeleton-line" />
          </div>
        )}

        <form className="login-form" onSubmit={handleSubmit} aria-busy={loading || resendBusy || settingsLoading}>
          {!twoFactorMode && (
            <div className={`input-group ${focusedField === 'email' ? 'focused' : ''}`}>
              <div className="input-wrapper">
                <label htmlFor={emailInputId} className="sr-only">ایمیل یا نام کاربری</label>
                <UserIcon />
                <input
                  id={emailInputId}
                  name="email"
                  type="text"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField('')}
                  placeholder="ایمیل یا نام کاربری"
                  className="modern-input"
                  autoComplete="username"
                  spellCheck={false}
                  dir="ltr"
                  style={{ textAlign: 'right', direction: 'rtl' }}
                  aria-invalid={messageTone === 'error' ? 'true' : 'false'}
                />
              </div>
            </div>
          )}

          {!twoFactorMode && !forgotPasswordMode && (
            <div className={`input-group ${focusedField === 'password' ? 'focused' : ''}`}>
              <PasswordField
                id={passwordInputId}
                name="password"
                label="رمز عبور"
                labelClassName="sr-only"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField('')}
                placeholder="رمز عبور"
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
          )}

          {twoFactorMode && (
            <div className={`input-group ${focusedField === 'code' ? 'focused' : ''}`}>
              <div className="input-wrapper otp-wrapper">
                <label htmlFor={codeInputId} className="sr-only">کد تایید شش رقمی</label>
                <input
                  id={codeInputId}
                  name="verificationCode"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  onFocus={() => setFocusedField('code')}
                  onBlur={() => setFocusedField('')}
                  placeholder="------"
                  className="modern-input otp-input"
                  autoComplete="one-time-code"
                  dir="ltr"
                  aria-invalid={messageTone === 'error' ? 'true' : 'false'}
                />
                <div className="otp-dots">
                  {[...Array(6)].map((_, index) => (
                    <span key={index} className={`otp-dot ${code[index] ? 'filled' : ''}`} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="login-button" style={{ background: config.gradient }}>
            <span className="button-text">
              {loading
                ? (forgotPasswordMode ? 'در حال ارسال...' : twoFactorMode ? 'در حال تایید...' : 'در حال ورود...')
                : (forgotPasswordMode ? 'ارسال لینک بازیابی' : twoFactorMode ? 'تایید و ورود' : 'ورود')}
            </span>
            {loading && <div className="button-spinner" />}
          </button>

          {message && (
            <div
              id={messageId}
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

          {!twoFactorMode && !forgotPasswordMode && (
            <div className="navigation-links" style={{ marginTop: '15px' }}>
              <p>
                <button type="button" onClick={() => { setForgotPasswordMode(true); clearMessage(); }} className="nav-link" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                  نام کاربری یا رمز عبور خود را فراموش کرده‌اید؟
                </button>
              </p>
            </div>
          )}

          {forgotPasswordMode && (
            <div className="navigation-links" style={{ marginTop: '15px' }}>
              <p>
                <button type="button" onClick={resetState} className="nav-link" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                  بازگشت به صفحه ورود
                </button>
              </p>
            </div>
          )}

          {twoFactorMode && (
            <div className="otp-actions" style={{ marginTop: '15px' }}>
              <button type="button" className="otp-action-btn" onClick={resendCode} disabled={resendBusy || loading}>
                {resendBusy ? 'در حال ارسال...' : 'ارسال مجدد کد'}
              </button>
              <button type="button" className="otp-action-btn secondary" onClick={resetState} disabled={loading}>
                بازگشت
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
