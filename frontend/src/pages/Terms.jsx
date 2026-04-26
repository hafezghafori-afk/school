import React from 'react';
import './Terms.css';

const sections = [
  {
    title: 'قوانین استفاده',
    text: 'تمام کاربران باید قوانین آموزشی، احترام متقابل و استفاده درست از محتوا را رعایت نمایند.'
  },
  {
    title: 'حریم خصوصی',
    text: 'اطلاعات کاربران نزد سیستم محفوظ است و بدون اجازه به شخص ثالث داده نمی‌شود.'
  },
  {
    title: 'پرداخت‌ها',
    text: 'پرداخت‌ها باید طبق برنامه اعلام‌شده انجام شود. تایید پرداخت توسط مدیر صورت می‌گیرد.'
  },
  {
    title: 'رفتار در چت',
    text: 'ارسال پیام‌های نامناسب، توهین و تبلیغات ممنوع است و منجر به مسدودسازی می‌شود.'
  }
];

export default function Terms() {
  return (
    <section className="terms-page">
      <div className="terms-hero">
        <h1>قوانین و مقررات</h1>
        <p>مطالعه قوانین برای استفاده از سامانه الزامی است.</p>
      </div>
      <div className="terms-grid">
        {sections.map((item) => (
          <div key={item.title} className="terms-card">
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
