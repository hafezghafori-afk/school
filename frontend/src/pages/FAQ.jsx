import React from 'react';
import './FAQ.css';

const faqs = [
  {
    q: 'چگونه ثبت‌نام کنم؟',
    a: 'از صفحه ثبت‌نام وارد شوید، اطلاعات را تکمیل کنید و صنف مورد نظر را انتخاب نمایید.'
  },
  {
    q: 'کارنامه PDF را از کجا بگیرم؟',
    a: 'داخل داشبورد شاگرد، بخش نمرات و کارنامه PDF قابل دانلود است.'
  },
  {
    q: 'چگونه در چت صنف فایل بفرستم؟',
    a: 'در صفحه چت، فایل مورد نظر را انتخاب کنید و همراه پیام ارسال نمایید.'
  },
  {
    q: 'تقسیم اوقات را چه کسی ویرایش می‌کند؟',
    a: 'مدیر می‌تواند تقسیم اوقات را در پنل ادمین تنظیم کند.'
  }
];

export default function FAQ() {
  return (
    <section className="faq-page">
      <div className="faq-hero">
        <h1>سوالات متداول</h1>
        <p>پاسخ سریع به سوالات رایج شاگردان و استادان.</p>
      </div>
      <div className="faq-list">
        {faqs.map((item) => (
          <div key={item.q} className="faq-item">
            <h3>{item.q}</h3>
            <p>{item.a}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
