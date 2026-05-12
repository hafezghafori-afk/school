import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Demo.css';

const DEMO_API_BASE = (import.meta.env.VITE_DEMO_API_BASE || 'https://school-api-demo.onrender.com').replace(/\/$/, '');

const demoRoles = [
  { key: 'admin', title: 'دیمو مدیریت', text: 'نمای کلی سیستم، کاربران، مالی، گزارش‌ها و تنظیمات اصلی.', icon: 'fa-user-shield' },
  { key: 'finance', title: 'دیمو مالی', text: 'فیس، رسید پرداخت، باقیات، تخفیف و گزارش‌های مالی.', icon: 'fa-file-invoice-dollar' },
  { key: 'instructor', title: 'دیمو استاد', text: 'صنف‌ها، حاضری، نمرات، کارخانگی و تقسیم اوقات.', icon: 'fa-chalkboard-teacher' },
  { key: 'student', title: 'دیمو شاگرد', text: 'کارنامه، حاضری، فیس، اعلانات و برنامه درسی.', icon: 'fa-user-graduate' }
];

const storeSession = (payload = {}) => {
  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  localStorage.setItem('token', data.token || '');
  localStorage.setItem('userId', data.userId || '');
  localStorage.setItem('userName', data.name || 'Demo User');
  localStorage.setItem('role', data.role || 'student');
  localStorage.setItem('orgRole', data.orgRole || '');
  localStorage.setItem('status', data.status || 'active');
  localStorage.setItem('adminLevel', data.adminLevel || '');
  localStorage.setItem('avatarUrl', data.avatarUrl || '');
  localStorage.setItem('lastLoginAt', data.lastLoginAt || '');
  localStorage.setItem('effectivePermissions', JSON.stringify(data.effectivePermissions || []));
};

export default function Demo() {
  const navigate = useNavigate();
  const [loadingRole, setLoadingRole] = useState('');
  const [error, setError] = useState('');

  const loginDemo = async (role) => {
    setError('');
    setLoadingRole(role);
    try {
      const response = await fetch(`${DEMO_API_BASE}/api/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false || !payload.token) {
        throw new Error(payload.message || 'ورود دیمو موفق نشد');
      }
      storeSession(payload);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'خطا در اتصال به سرور دیمو');
    } finally {
      setLoadingRole('');
    }
  };

  return (
    <main className="demo-page" dir="rtl">
      <section className="demo-hero">
        <div className="demo-hero-copy">
          <span className="demo-badge">نسخه نمایشی امن</span>
          <h1>مشاهده دیمو سیستم مدیریت مکتب</h1>
          <p>برای دیدن امکانات سیستم، یکی از نقش‌های زیر را انتخاب کنید. این نسخه به دیتابیس جداگانه دیمو وصل است و اطلاعات اصلی مکتب را تغییر نمی‌دهد.</p>
          <div className="demo-actions">
            <Link to="/" className="demo-link ghost">بازگشت به صفحه اصلی</Link>
            <Link to="/contact" className="demo-link">تماس برای خرید سیستم</Link>
          </div>
        </div>
        <div className="demo-hero-card">
          <strong>Demo Database</strong>
          <span>school_demo</span>
          <p>جدا از دیتابیس اصلی، مناسب برای نمایش به مکاتب و مشتریان.</p>
        </div>
      </section>

      {error && <div className="demo-error">{error}</div>}

      <section className="demo-grid">
        {demoRoles.map((item) => (
          <article className="demo-card" key={item.key}>
            <span className="demo-icon"><i className={`fa ${item.icon}`} aria-hidden="true" /></span>
            <h2>{item.title}</h2>
            <p>{item.text}</p>
            <button type="button" onClick={() => loginDemo(item.key)} disabled={!!loadingRole}>
              {loadingRole === item.key ? 'در حال ورود...' : `ورود به ${item.title}`}
            </button>
          </article>
        ))}
      </section>

      <section className="demo-note">
        <h3>یادداشت امنیتی</h3>
        <p>در نسخه دیمو، کاربران با حساب‌های آزمایشی وارد می‌شوند. برای استفاده واقعی، هر مکتب دیتابیس و تنظیمات جداگانه خود را خواهد داشت.</p>
      </section>
    </main>
  );
}
