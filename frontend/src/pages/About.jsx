import React from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName } from '../utils/brand';
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

const labels = {
  fa: { why: 'چرا ما؟', values: 'ارزش‌ها و امکانات', growth: 'مسیر رشد' },
  en: { why: 'Why us?', values: 'Values and facilities', growth: 'Growth path' },
  ps: { why: 'ولې موږ؟', values: 'ارزښتونه او امکانات', growth: 'د ودې لاره' }
};

export default function About() {
  const { settings } = useSiteSettings();
  const t = labels[settings?.language || 'fa'] || labels.fa;
  const brand = normalizeBrandName(settings?.brandName);
  const isSchoolWebsite = settings?.isSchoolWebsite;
  const aboutTitle = settings?.aboutTitle || `درباره ${brand}`;
  const aboutBody = settings?.aboutBody || `${brand} با هدف ارتقای کیفیت آموزش و فراهم‌سازی دسترسی منظم به محتوا، سیستم آموزشی دیجیتال را برای شاگردان، استادان و مدیران ایجاد کرده است.`;
  const missionTitle = settings?.missionTitle || 'ماموریت';
  const missionBody = settings?.missionBody || 'ایجاد محیط یادگیری منظم، شفاف و قابل پیگیری برای همه صنف‌ها.';
  const visionTitle = settings?.visionTitle || 'چشم‌انداز ما';
  const visionBody = settings?.visionBody || 'تبدیل شدن به مرجع آموزش دیجیتال در سطح مکاتب افغانستان.';
  const featureValues = isSchoolWebsite && Array.isArray(settings?.salesQuickCards) && settings.salesQuickCards.length
    ? settings.salesQuickCards.map((item) => ({ title: item.title, text: item.text || item.desc || '' })).filter((item) => item.title && item.text)
    : values;

  return (
    <section className="about-page" dir={settings?.language === 'en' ? 'ltr' : 'rtl'}>
      <div className="about-hero">
        <div>
          <h1>{aboutTitle}</h1>
          <p>{aboutBody}</p>
        </div>
        <div className="about-hero-card">
          <h3>{visionTitle}</h3>
          <p>{visionBody}</p>
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
          <h3>{missionTitle}</h3>
          <p>{missionBody}</p>
        </div>
        <div className="about-card">
          <h3>{t.why}</h3>
          <p>{isSchoolWebsite ? aboutBody : 'ترکیب استادان باتجربه با فناوری آموزشی برای تجربه یادگیری بهتر.'}</p>
        </div>
      </div>

      <div className="about-values">
        <h2>{t.values}</h2>
        <div className="about-values-grid">
          {featureValues.map(item => (
            <div key={item.title}>
              <h4>{item.title}</h4>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="about-timeline">
        <h2>{t.growth}</h2>
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
