import React, { useEffect, useState } from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import { PublicLayout, PrimaryButton, SecondaryButton, SectionTitle } from '../components/public';
import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';
import './Home.css';

const features = [
  {
    title: 'محیط آموزشی امن',
    text: 'فضایی آرام، منظم و پشتیبان برای رشد علمی و شخصیتی دختران.',
    icon: 'fa-shield-heart'
  },
  {
    title: 'برنامه درسی منظم',
    text: 'تقسیم اوقات روشن، پیگیری درس‌ها و ارتباط بهتر میان اداره، استاد و خانواده.',
    icon: 'fa-calendar-check'
  },
  {
    title: 'پیگیری پیشرفت',
    text: 'حاضری، نمرات، کارخانگی و گزارش‌ها در یک مسیر ساده و قابل فهم.',
    icon: 'fa-chart-line'
  }
];

const programs = [
  'تعلیمات پایه و متوسطه',
  'تقویت زبان و مهارت‌های ارتباطی',
  'آمادگی امتحانات و ارزیابی منظم',
  'فعالیت‌های فرهنگی و تربیتی'
];

const stats = [
  { value: '۱۲+', label: 'سال تجربه آموزشی' },
  { value: '۴۵۰+', label: 'شاگرد فعال' },
  { value: '۳۵+', label: 'استاد و کارمند' },
  { value: '۹۶٪', label: 'رضایت خانواده‌ها' }
];

const heroHighlights = ['صنف‌های منظم', 'استادان متعهد', 'گزارش‌دهی شفاف', 'ارتباط با خانواده'];

const resolveNewsImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

const normalizeCardList = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item, index) => ({
      title: String(item?.title || '').trim(),
      text: String(item?.text || item?.desc || '').trim(),
      icon: String(item?.value || item?.icon || fallback[index]?.icon || 'fa-circle-check').trim()
    }))
    .filter((item) => item.title && item.text);
  return normalized.length ? normalized : fallback;
};

const normalizeStats = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item) => ({
      value: String(item?.value || item?.title || '').trim(),
      label: String(item?.label || item?.text || item?.desc || '').trim()
    }))
    .filter((item) => item.value && item.label);
  return normalized.length ? normalized : fallback;
};

const normalizeHighlights = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items.map((item) => String(item?.title || '').trim()).filter(Boolean);
  return normalized.length ? normalized.slice(0, 4) : fallback;
};

export default function Home() {
  const { settings } = useSiteSettings();
  const isPendingSchoolConnection = settings?.publicStatus === 'pending_school_connection' && !settings?.isSchoolWebsite;
  const schoolName = settings?.brandName || 'Iman Girls School';
  const schoolSubtitle = settings?.brandSubtitle || 'مکتب دخترانه ایمان';
  const logoSrc = settings?.logo || settings?.logoUrl || '';
  const heroBadge = settings?.homeHeroBadge || 'مکتب دخترانه ایمان';
  const heroTitle = settings?.homeHeroTitle || 'آموزش با اعتماد، نظم و آینده‌نگری برای دختران';
  const heroText = settings?.homeHeroText || 'Iman Girls School محیطی حرفه‌ای، مهربان و منظم برای آموزش دختران فراهم می‌کند؛ جایی که درس، اخلاق و رشد فردی کنار هم پیش می‌روند.';
  const primaryLabel = settings?.homeHeroSecondaryLabel || 'ورود به سیستم';
  const primaryHref = settings?.homeHeroSecondaryHref || '/login';
  const secondaryLabel = settings?.homeHeroPrimaryLabel || 'تماس با ما';
  const secondaryHref = settings?.homeHeroPrimaryHref || '/contact';
  const featureItems = normalizeCardList(settings?.salesQuickCards, features);
  const programItems = normalizeCardList(settings?.salesModules, programs.map((title) => ({ title, text: title }))).map((item) => item.title);
  const statItems = normalizeStats(settings?.homeStats || settings?.stats, stats);
  const highlightItems = normalizeHighlights(settings?.heroHighlights, heroHighlights);
  const heroPanelTagline = settings?.heroPanelTagline || 'تعلیم، تربیه، اعتماد';
  const heroImage = settings?.heroImageUrl ? resolveNewsImage(settings.heroImageUrl) : '';
  const programsIntro = settings?.programsIntro || 'برنامه‌ها با توجه به سطح درسی، نیازهای تربیتی و آمادگی آینده شاگردان تنظیم می‌شوند.';
  const ctaTitle = settings?.homeCtaTitle || 'کاربران مکتب می‌توانند از همین‌جا وارد سیستم شوند';
  const ctaText = settings?.homeCtaText || 'شاگردان، استادان و مدیران با حساب خود به پنل مربوط وارد می‌شوند.';
  const ctaLabel = settings?.homeHeroSecondaryLabel || 'ورود به سیستم';
  const ctaHref = settings?.homeHeroSecondaryHref || '/login';

  const [newsItems, setNewsItems] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/news`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setNewsItems(data?.success && Array.isArray(data.items) ? data.items.slice(0, 3) : []);
      })
      .catch(() => {
        if (!cancelled) setNewsItems([]);
      });
    return () => { cancelled = true; };
  }, []);

  if (isPendingSchoolConnection) {
    return (
      <PublicLayout active="خانه" settings={settings} logoSrc={logoSrc} schoolName={schoolName} schoolSubtitle={schoolSubtitle}>
        <section className="home-pending public-container" dir="rtl">
          <p className="home-pending-kicker">{schoolName}</p>
          <h1>{settings?.pendingPageTitle || 'سایت مکتب هنوز وصل نشده است'}</h1>
          <p>{settings?.pendingPageText || 'ما در حال آماده‌سازی اتصال سایت اصلی مکتب هستیم. لطفاً چند لحظه صبر کنید.'}</p>
          <p>{settings?.pendingPageHint || 'می‌توانید کمی بعد صفحه را تازه یا Refresh کنید.'}</p>
          <button type="button" className="home-pending-refresh" onClick={() => window.location.reload()}>
            تازه‌سازی صفحه
          </button>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout active="خانه" settings={settings} logoSrc={logoSrc} schoolName={schoolName} schoolSubtitle={schoolSubtitle}>
      <section className="home-hero">
        <div className="public-container home-hero-inner">
          <div className="home-hero-copy">
            <span className="home-kicker">{heroBadge}</span>
            <h1>{heroTitle}</h1>
            <p>{heroText}</p>
            <div className="home-hero-actions">
              <PrimaryButton to={primaryHref}>{primaryLabel}</PrimaryButton>
              <SecondaryButton to={secondaryHref}>{secondaryLabel}</SecondaryButton>
            </div>
            <div className="home-hero-trust">
              <span>بدون نیاز به نصب</span>
              <span>مدیریت آنلاین و امن</span>
              <span>پشتیبانی مکتب</span>
            </div>
          </div>

          <div className={`home-hero-panel${heroImage ? ' has-image' : ''}`} aria-label="نمای معرفی مکتب">
            {heroImage && <img className="home-hero-panel-image" src={heroImage} alt={schoolName} />}
            <div className="hero-panel-top">
              <span>{schoolName}</span>
              <strong>{heroPanelTagline}</strong>
            </div>
            <div className="hero-panel-grid">
              {highlightItems.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="home-section public-container" id="about">
        <SectionTitle kicker="معرفی مکتب" title={settings?.aboutTitle || 'مکتبی برای یادگیری آرام، دقیق و هدفمند'}>
          {settings?.aboutBody || 'مکتب دخترانه ایمان با تمرکز بر کیفیت آموزشی، نظم اداری و همراهی خانواده‌ها تلاش می‌کند هر شاگرد مسیر رشد خودش را با اعتماد طی کند.'}
        </SectionTitle>
        <div className="home-intro-card">
          <p>
            {settings?.missionBody || 'برنامه‌های آموزشی مکتب برای نیازهای روز شاگردان طراحی شده و با مدیریت دیجیتال، پیگیری درس‌ها، حاضری، نمرات و اطلاعیه‌ها ساده‌تر و شفاف‌تر انجام می‌شود.'}
          </p>
        </div>
      </section>

      <section className="home-section public-container" id="programs">
        <SectionTitle kicker="ویژگی‌ها" title="آنچه تجربه آموزشی را منظم‌تر می‌کند" />
        <div className="home-feature-grid">
          {featureItems.map((item) => (
            <article className="home-card" key={item.title}>
              <span className="home-card-icon"><i className={`fa ${item.icon}`} aria-hidden="true" /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section home-program-band">
        <div className="public-container home-program-inner">
          <SectionTitle kicker="برنامه‌های آموزشی" title="مسیرهای آموزشی روشن برای رشد شاگردان">
            {programsIntro}
          </SectionTitle>
          <div className="home-program-list">
            {programItems.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </section>

      <section className="home-section public-container">
        <div className="home-stats-grid">
          {statItems.map((item) => (
            <div className="home-stat" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section public-container">
        <SectionTitle kicker="آخرین اخبار" title="تازه‌ترین اطلاعیه‌ها و رویدادهای مکتب" />
        {newsItems === null ? null : newsItems.length ? (
          <div className="home-news-grid">
            {newsItems.map((item) => (
              <article className="home-card home-news-card" key={item._id}>
                <h3>{item.title}</h3>
                <p>{item.summary || ''}</p>
                <SecondaryButton to={`/news/${item._id}`}>مشاهده خبر</SecondaryButton>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-intro-card home-news-empty">
            <p>هنوز خبری ثبت نشده است. از پنل ادمین، بخش «مدیریت اخبار» می‌توانید نخستین خبر مکتب را منتشر کنید.</p>
          </div>
        )}
      </section>

      <section className="home-section public-container">
        <div className="home-login-cta">
          <div>
            <span className="home-kicker">دسترسی سریع</span>
            <h2>{ctaTitle}</h2>
            <p>{ctaText}</p>
          </div>
          <PrimaryButton to={ctaHref}>{ctaLabel}</PrimaryButton>
        </div>
      </section>
    </PublicLayout>
  );
}
