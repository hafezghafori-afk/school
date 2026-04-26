import React from 'react';
import { Link } from 'react-router-dom';
import './Payment.css';

export default function SubmitReceipt() {
  const token = localStorage.getItem('token') || '';
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
  const isStudent = Boolean(token) && role === 'student';
  const primaryTarget = isStudent ? '/my-finance' : '/login';
  const primaryLabel = isStudent ? 'رفتن به مرکز مالی شاگرد' : 'ورود به حساب شاگرد';

  return (
    <div className="payment-page">
      <div className="payment-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>ارسال رسید از مسیر جدید</h2>
        <p className="payment-subtitle">
          این صفحه دیگر receipt را مستقیماً ثبت نمی‌کند. بارگذاری رسید فقط از روی بل ثبت‌شده و داخل مرکز مالی شاگرد انجام می‌شود.
        </p>

        <div className="payment-box">
          <span>مسیر درست</span>
          <strong>/my-finance</strong>
          <span>در آن‌جا بل‌های باز، مبلغ باقی‌مانده، روش پرداخت، تاریخچه رسیدهای قبلی و استیتمنت چاپی هر عضویت را یک‌جا می‌بینید.</span>
        </div>

        <div className="payment-box">
          <span>دلیل تغییر</span>
          <strong>cutover به سیستم مالی یکپارچه</strong>
          <span>flow قدیمی `orders/submit` از دسترس عملیاتی خارج شده تا receiptها فقط در ماژول مالی canonical ثبت شوند.</span>
        </div>

        <div className="payment-actions">
          <Link to={primaryTarget}>
            <button type="button">{primaryLabel}</button>
          </Link>
          <Link to="/payment">
            <button type="button" className="secondary">مشاهده راهنمای مسیر مالی</button>
          </Link>
        </div>

        <div className="payment-sim">
          <h3>نحوه ارسال رسید</h3>
          <p>1. وارد مرکز مالی شاگرد شوید.</p>
          <p>2. بل باز را انتخاب کنید.</p>
          <p>3. مبلغ، روش پرداخت و فایل رسید را روی همان بل ثبت کنید.</p>
          <p>4. وضعیت تایید چندمرحله‌ای و جزئیات receipt را از تاریخچه همان صفحه پیگیری کنید.</p>
          <p>5. بعد از تایید، استیتمنت همان عضویت را از همان صفحه چاپ کنید.</p>
        </div>
      </div>
    </div>
  );
}
