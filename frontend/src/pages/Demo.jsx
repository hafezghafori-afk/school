import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { persistAuthSession } from '../utils/authSession';
import './Demo.css';

const DEMO_API_BASE = (import.meta.env.VITE_DEMO_API_BASE || API_BASE || '').replace(/\/+$/, '');

const demoRoles = [
  {
    key: 'admin',
    title: 'ورود دیمو مدیریت',
    badge: 'مدیر عمومی',
    description: 'دسترسی به کاربران، مالی، محتوا، گزارش‌ها و تقسیم اوقات.',
    icon: 'fa-shield-halved',
    target: '/admin'
  },
  {
    key: 'finance',
    title: 'ورود دیمو مالی',
    badge: 'مدیر مالی',
    description: 'بررسی رسیدها، بل‌ها، تخفیف‌ها و گزارش‌های مالی.',
    icon: 'fa-coins',
    target: '/admin-finance'
  },
  {
    key: 'instructor',
    title: 'ورود دیمو استاد',
    badge: 'استاد',
    description: 'مشاهده داشبورد استاد، صنف‌ها، حاضری و تقسیم اوقات.',
    icon: 'fa-chalkboard-user',
    target: '/instructor-dashboard'
  },
  {
    key: 'student',
    title: 'ورود دیمو شاگرد',
    badge: 'شاگرد',
    description: 'نمایش کارخانگی، نمرات، حاضری، مالی و برنامه درسی شاگرد.',
    icon: 'fa-user-graduate',
    target: '/dashboard'
  }
];

const getErrorMessage = (message = '') => {
  const text = String(message || '').trim();
  if (!text) return 'ورود دیمو انجام نشد. لطفا دوباره تلاش کنید.';
  if (text.toLowerCase().includes('demo-seed')) {
    return 'کاربران دیمو هنوز روی سرور ساخته نشده‌اند. demo-seed را یک بار اجرا کنید.';
  }
  return text;
};

export default function Demo() {
  const navigate = useNavigate();
  const [busyRole, setBusyRole] = useState('');
  const [status, setStatus] = useState({ tone: '', text: '' });

  const apiLabel = useMemo(() => {
    if (!DEMO_API_BASE) return 'همین دامنه';
    try {
      return new URL(DEMO_API_BASE).host;
    } catch {
      return DEMO_API_BASE;
    }
  }, []);

  const handleDemoLogin = async (role) => {
    setBusyRole(role.key);
    setStatus({ tone: '', text: '' });

    try {
      const response = await fetch(`${DEMO_API_BASE}/api/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: role.key })
      });
      const data = await response.json();

      if (!data?.success) {
        setStatus({ tone: 'error', text: getErrorMessage(data?.message) });
        return;
      }

      persistAuthSession(data);
      setStatus({ tone: 'success', text: 'ورود دیمو موفق بود. در حال انتقال...' });
      navigate(role.target);
    } catch (error) {
      console.error('Demo login error:', error);
      setStatus({ tone: 'error', text: 'ارتباط با سرور دیمو برقرار نشد. تنظیمات API را بررسی کنید.' });
    } finally {
      setBusyRole('');
    }
  };

  return (
    <main className="demo-login-page" dir="rtl">
      <section className="demo-login-hero">
        <div className="demo-login-copy">
          <span className="demo-login-kicker">نسخه آزمایشی مدیریت مکتب</span>
          <h1>بدون رمز وارد محیط دیمو شوید</h1>
          <p>
            یکی از نقش‌های آماده را انتخاب کنید تا سیستم با حساب دیمو وارد شود و بخش‌های اصلی را بررسی کنید.
          </p>
          <div className="demo-login-meta">
            <span><i className="fa fa-server" aria-hidden="true" /> API: {apiLabel}</span>
            <span><i className="fa fa-database" aria-hidden="true" /> دیتابیس دیمو</span>
          </div>
        </div>
        <div className="demo-login-panel" aria-label="ورود با نقش‌های دیمو">
          {demoRoles.map((role) => (
            <button
              type="button"
              key={role.key}
              className="demo-role-card"
              onClick={() => handleDemoLogin(role)}
              disabled={Boolean(busyRole)}
            >
              <span className="demo-role-icon"><i className={`fa ${role.icon}`} aria-hidden="true" /></span>
              <span className="demo-role-body">
                <span className="demo-role-title">{role.title}</span>
                <small>{role.description}</small>
              </span>
              <span className="demo-role-badge">{busyRole === role.key ? 'ورود...' : role.badge}</span>
            </button>
          ))}
          {status.text && <div className={`demo-login-status ${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</div>}
        </div>
      </section>
      <section className="demo-login-footer">
        <Link to="/demo-request">درخواست دمو اختصاصی</Link>
        <Link to="/">بازگشت به صفحه اصلی</Link>
      </section>
    </main>
  );
}
