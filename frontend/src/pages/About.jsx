import React from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import { getPublicWebsiteLocale } from '../i18n/publicWebsite';
import { normalizeBrandName } from '../utils/brand';
import { PublicLayout } from '../components/public';
import { normalizeCardList, normalizeStats, normalizeTimeline } from '../utils/publicContent';
import './About.css';

// Fallbacks for content that is now editable from Admin Settings →
// «وب‌سایت مکتب» → بخش «درباره مکتب». The stats bar and the timeline are
// school-specific, so they simply stay hidden until the school fills them
// instead of showing demo numbers. The value cards are generic enough to keep
// as a default.
const values = [
  { title: 'کیفیت آموزش', text: 'تمرکز بر محتوای استاندارد و استادان باتجربه.' },
  { title: 'شفافیت', text: 'گزارش دقیق پیشرفت و دسترسی روشن برای شاگرد و خانواده.' },
  { title: 'نوآوری', text: 'استفاده از ابزارهای آنلاین برای آموزش بهتر.' },
  { title: 'پشتیبانی', text: 'همراهی دائم برای حل مشکلات آموزشی و فنی.' }
];

const labels = {
  fa: { why: 'چرا ما؟', values: 'ارزش‌ها و امکانات', growth: 'مسیر رشد' },
  en: { why: 'Why us?', values: 'Values and facilities', growth: 'Growth path' },
  ps: { why: 'ولې موږ؟', values: 'ارزښتونه او امکانات', growth: 'د ودې لاره' }
};

export default function About() {
  const { settings, language } = useSiteSettings();
  const t = getPublicWebsiteLocale(language || settings?.language).about || labels[settings?.language || 'fa'] || labels.fa;
  const brand = normalizeBrandName(settings?.brandName);
  const isSchoolWebsite = settings?.isSchoolWebsite;
  const aboutTitle = settings?.aboutTitle || `درباره ${brand}`;
  const aboutBody = settings?.aboutBody || `${brand} با هدف ارتقای کیفیت آموزش و فراهم‌سازی دسترسی منظم به محتوا، سیستم آموزشی دیجیتال را برای شاگردان، استادان و مدیران ایجاد کرده است.`;
  const missionTitle = settings?.missionTitle || 'ماموریت';
  const missionBody = settings?.missionBody || 'ایجاد محیط یادگیری منظم، شفاف و قابل پیگیری برای همه صنف‌ها.';
  const visionTitle = settings?.visionTitle || 'چشم‌انداز ما';
  const visionBody = settings?.visionBody || 'تبدیل شدن به مرجع آموزش دیجیتال در سطح مکاتب افغانستان.';
  const whyTitle = settings?.aboutWhyTitle || t.why;
  const whyBody = settings?.aboutWhyBody
    || (isSchoolWebsite ? aboutBody : 'ترکیب استادان باتجربه با فناوری آموزشی برای تجربه یادگیری بهتر.');
  const valuesTitle = settings?.aboutValuesTitle || t.values;
  const timelineTitle = settings?.aboutTimelineTitle || t.growth;

  const statItems = normalizeStats(settings?.aboutStats, []);
  const valueItems = normalizeCardList(
    settings?.aboutValues
      || (isSchoolWebsite ? settings?.salesQuickCards : null),
    values
  );
  const timelineItems = normalizeTimeline(settings?.aboutTimeline, []);

  return (
    <PublicLayout active="درباره مکتب" settings={settings}>
      <section className="about-page public-container" dir={settings?.language === 'en' ? 'ltr' : 'rtl'}>
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

      {statItems.length ? (
        <div className="about-stats">
          {statItems.map((item, index) => (
            <div key={`${item.value}-${item.label}-${index}`}>
              <strong>{item.value}</strong>
              {item.label ? <span>{item.label}</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="about-grid">
        <div className="about-card">
          <h3>{missionTitle}</h3>
          <p>{missionBody}</p>
        </div>
        <div className="about-card">
          <h3>{whyTitle}</h3>
          <p>{whyBody}</p>
        </div>
      </div>

      {valueItems.length ? (
        <div className="about-values">
          <h2>{valuesTitle}</h2>
          <div className="about-values-grid">
            {valueItems.map((item, index) => (
              <div key={`${item.title}-${index}`}>
                <h4>{item.title}</h4>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {timelineItems.length ? (
        <div className="about-timeline">
          <h2>{timelineTitle}</h2>
          <div className="about-timeline-grid">
            {timelineItems.map((item, index) => (
              <div key={`${item.year}-${index}`}>
                <span>{item.year}</span>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      </section>
    </PublicLayout>
  );
}
