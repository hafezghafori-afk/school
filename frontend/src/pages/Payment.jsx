import React from 'react';
import { Link } from 'react-router-dom';
import './Payment.css';

const getLegacyFinanceRedirect = () => {
  const token = localStorage.getItem('token') || '';
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
  const authed = Boolean(token);

  if (authed && role === 'student') {
    return {
      to: '/my-finance',
      primaryLabel: 'ورود به مرکز مالی شاگرد',
      secondaryTo: '/dashboard',
      secondaryLabel: 'بازگشت به داشبورد'
    };
  }

  if (authed && role === 'admin') {
    return {
      to: '/admin-finance',
      primaryLabel: 'ورود به مرکز مالی ادمین',
      secondaryTo: '/admin',
      secondaryLabel: 'بازگشت به پنل ادمین'
    };
  }

  if (authed && role === 'instructor') {
    return {
      to: '/instructor-dashboard',
      primaryLabel: 'بازگشت به داشبورد استاد',
      secondaryTo: '/chat',
      secondaryLabel: 'رفتن به کلاس و چت'
    };
  }

  return {
    to: '/login',
    primaryLabel: 'ورود به حساب شاگرد',
    secondaryTo: '/',
    secondaryLabel: 'بازگشت به خانه'
  };
};

export default function Payment() {
  const redirect = getLegacyFinanceRedirect();

  return (
    <div className="payment-page">
      <div className="payment-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>راهنمای مسیر مالی</h2>
        <p className="payment-subtitle">
          این صفحه قدیمی برای سازگاری نگه داشته شده است. از این به بعد پرداخت، ثبت رسید و پیگیری وضعیت فقط از مسیر مالی جدید انجام می‌شود.
        </p>

        <div className="payment-box">
          <span>مسیر canonical</span>
          <strong>/my-finance</strong>
          <span>صدور بل، بارگذاری رسید، وضعیت تایید و تاریخچه پرداخت از مرکز مالی شاگرد انجام می‌شود.</span>
        </div>

        <div className="payment-box">
          <span>وضعیت cutover</span>
          <strong>flow قدیمی غیرفعال شده است</strong>
          <span>این route دیگر receipt جدید ثبت نمی‌کند و فقط شما را به مسیر درست هدایت می‌کند.</span>
        </div>

        <div className="payment-actions">
          <Link to={redirect.to}>
            <button type="button">{redirect.primaryLabel}</button>
          </Link>
          <Link to={redirect.secondaryTo}>
            <button type="button" className="secondary">{redirect.secondaryLabel}</button>
          </Link>
        </div>

        <div className="payment-sim">
          <h3>نکته مهم</h3>
          <p>اگر شاگرد هستید، ابتدا باید بل مالی شما در مرکز مالی ثبت شده باشد. بعد receipt را روی همان بل بارگذاری می‌کنید.</p>
          <p>تایید چندمرحله‌ای رسید از همان‌جا پیگیری می‌شود و دیگر از این صفحه یا مسیر `/submit-receipt` استفاده نمی‌شود.</p>
        </div>
      </div>
    </div>
  );
}
