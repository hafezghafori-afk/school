import React from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import './About.css';

const stats = [
  { value: '50+', label: 'صنف فعال' },
  { value: '1200+', label: 'شاگرد' },
  { value: '80+', label: 'استاد حرفه‌ای' },
  { value: '24/7', label: 'پشتیبانی' }
];

const values = [
  { title: 'کیفیت آموزش', text: 'تمرکز بر محتوای استاندارد و استادان باتجربه.' },
  { title: 'شفافیت', text: 'گزارش دقیق پیشرفت و دسترسی روشن برای شاگرد و خانواده.' },
  { title: 'نوآوری', text: 'استفاده از ابزارهای آنلاین برای آموزش بهتر.' },
  { title: 'پشتیبانی', text: 'همراهی دائم برای حل مشکلات آموزشی و فنی.' }
];

const timeline = [
  { year: '1398', text: 'آغاز فعالیت مدرسه با برنامه‌های حضوری.' },
  { year: '1401', text: 'راه‌اندازی سامانه آموزش آنلاین و مدیریت صنف‌ها.' },
  { year: '1403', text: 'افزودن کارخانگی، چت و کارنامه دیجیتال.' }
];

export default function About() {
  const { settings } = useSiteSettings();
  const brand = settings?.brandName || 'مدرسه ایمان';

  return (
    <section className="about-page">
      <div className="about-hero">
        <div>
          <h1>درباره {brand}</h1>
          <p>
            {brand} با هدف ارتقای کیفیت آموزش و فراهم‌سازی دسترسی منظم به محتوا،
            سیستم آموزشی دیجیتال را برای شاگردان، استادان و مدیران ایجاد کرده است.
          </p>
        </div>
        <div className="about-hero-card">
          <h3>چشم‌انداز ما</h3>
          <p>تبدیل شدن به مرجع آموزش دیجیتال در سطح مکاتب افغانستان.</p>
        </div>
      </div>

      <div className="about-stats">
        {stats.map(item => (
          <div key={item.label}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <div className="about-grid">
        <div className="about-card">
          <h3>ماموریت</h3>
          <p>ایجاد محیط یادگیری منظم، شفاف و قابل پیگیری برای همه صنف‌ها.</p>
        </div>
        <div className="about-card">
          <h3>چرا ما؟</h3>
          <p>ترکیب استادان باتجربه با فناوری آموزشی برای تجربه یادگیری بهتر.</p>
        </div>
      </div>

      <div className="about-values">
        <h2>ارزش‌های ما</h2>
        <div className="about-values-grid">
          {values.map(item => (
            <div key={item.title}>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="about-timeline">
        <h2>مسیر رشد</h2>
        <div className="about-timeline-grid">
          {timeline.map(item => (
            <div key={item.year}>
              <span>{item.year}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
