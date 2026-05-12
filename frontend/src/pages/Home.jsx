import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName } from '../utils/brand';
import './Home.css';

const quickCards = [
  {
    title: 'برای مدیریت مکتب',
    desc: 'کنترول صنف‌ها، استادان، شاگردان، گزارش‌ها و تنظیمات عمومی.',
    icon: 'fa-school'
  },
  {
    title: 'برای بخش مالی',
    desc: 'ثبت فیس، رسید پرداخت، تخفیف، باقیات و گزارش مالی.',
    icon: 'fa-receipt'
  },
  {
    title: 'برای آموزش',
    desc: 'حاضری، امتحانات، نمرات، کارخانگی و تقسیم اوقات.',
    icon: 'fa-graduation-cap'
  }
];

const moduleItems = [
  {
    title: 'مدیریت شاگردان',
    desc: 'ثبت معلومات شخصی، صنف، سال تعلیمی، اسناد و وضعیت شاگرد.',
    icon: 'fa-user-graduate'
  },
  {
    title: 'مدیریت مالی',
    desc: 'فیس ماهانه، داخله، تخفیف، پرداخت، رسید و باقیات.',
    icon: 'fa-wallet'
  },
  {
    title: 'مدیریت امتحانات',
    desc: 'ثبت نمرات، جدول نتایج، کارنامه PDF و گزارش صنفی.',
    icon: 'fa-clipboard-check'
  },
  {
    title: 'حاضری',
    desc: 'حاضری روزانه شاگردان، استادان و کارمندان.',
    icon: 'fa-calendar-check'
  },
  {
    title: 'تقسیم اوقات',
    desc: 'تنظیم روز، ساعت، مضمون، صنف و استاد در یک برنامه منظم.',
    icon: 'fa-calendar-days'
  },
  {
    title: 'گزارش‌ها',
    desc: 'گزارش مالی، آموزشی، حاضری و وضعیت عمومی مکتب.',
    icon: 'fa-chart-line'
  }
];

const audienceItems = [
  'مکاتب خصوصی',
  'مکاتب دخترانه و پسرانه',
  'آموزشگاه‌ها',
  'مراکز کورس‌های آموزشی',
  'اداره‌هایی که ثبت شاگرد، فیس و گزارشات را دیجیتال می‌کنند'
];

const dashboardItems = [
  {
    title: 'پنل مدیریت',
    points: ['شاگردان و استادان', 'صنف‌ها و سال تعلیمی', 'گزارش عمومی']
  },
  {
    title: 'پنل مالی',
    points: ['فیس و پرداخت‌ها', 'رسید و تخفیف', 'باقیات و گزارش مالی']
  },
  {
    title: 'پنل استاد',
    points: ['حاضری روزانه', 'نمره‌دهی', 'کارخانگی و مضمون']
  },
  {
    title: 'پنل شاگرد و والدین',
    points: ['نمرات و کارنامه', 'حاضری', 'برنامه درسی و اطلاعیه‌ها']
  }
];

const faqItems = [
  {
    q: 'آیا این سیستم برای هر مکتب قابل تنظیم است؟',
    a: 'بلی، ساختار صنف‌ها، سال تعلیمی، فیس، امتحانات، نقش‌ها و گزارش‌ها مطابق نیاز هر مکتب تنظیم می‌شود.'
  },
  {
    q: 'برای شروع استفاده از سیستم چه نیاز است؟',
    a: 'ابتدا معلومات پایه مکتب، صنف‌ها، استادان، شاگردان و تنظیمات مالی وارد می‌شود؛ بعد سیستم برای کاربران فعال می‌گردد.'
  },
  {
    q: 'آیا بخش مالی و رسید پرداخت دارد؟',
    a: 'بلی، ثبت فیس، تخفیف، پرداخت، باقیات، رسید و گزارش مالی در ساختار سیستم پیش‌بینی شده است.'
  },
  {
    q: 'آیا شاگردان و استادان پنل جداگانه دارند؟',
    a: 'بلی، هر نقش با دسترسی مناسب خود وارد سیستم می‌شود و فقط بخش‌های مربوط به خودش را می‌بیند.'
  }
];

const normalizeCardList = (items, fallback, iconFallback = 'fa-circle-check') => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item, index) => ({
      title: String(item?.title || '').trim(),
      desc: String(item?.text || item?.desc || '').trim(),
      icon: String(item?.value || item?.icon || fallback[index]?.icon || iconFallback).trim()
    }))
    .filter((item) => item.title && item.desc);
  return normalized.length ? normalized : fallback;
};

const normalizeAudienceList = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length ? normalized : fallback;
};

const splitPoints = (value = '') => String(value || '')
  .split(/\s*[|،،,]\s*|\n/g)
  .map((item) => item.trim())
  .filter(Boolean);

const normalizeDashboardList = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item) => ({
      title: String(item?.title || '').trim(),
      points: splitPoints(item?.text || item?.href || '')
    }))
    .filter((item) => item.title && item.points.length);
  return normalized.length ? normalized : fallback;
};

const normalizeFaqList = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return fallback;
  const normalized = items
    .map((item) => ({
      q: String(item?.title || item?.q || '').trim(),
      a: String(item?.text || item?.a || '').trim()
    }))
    .filter((item) => item.q && item.a);
  return normalized.length ? normalized : fallback;
};

export default function Home() {
  const { settings } = useSiteSettings();
  const brandName = normalizeBrandName(settings?.brandName);
  const heroBadge = settings?.homeHeroBadge || 'طراحی‌شده برای مکاتب افغانستان';
  const heroTitle = settings?.homeHeroTitle || 'سیما؛ سیستم مدیریت هوشمند مکاتیب افغانستان';
  const heroText = settings?.homeHeroText || 'تمام امور مکتب را از ثبت شاگرد تا فیس، حاضری، امتحانات، تقسیم اوقات و گزارش‌ها در یک سیستم ساده و منظم مدیریت کنید.';
  const primaryLabel = settings?.homeHeroPrimaryLabel || 'درخواست دمو';
  const primaryHref = settings?.homeHeroPrimaryHref || '/demo-request';
  const secondaryLabel = settings?.homeHeroSecondaryLabel || 'ورود به سیستم';
  const secondaryHref = settings?.homeHeroSecondaryHref || '/login';
  const ctaTitle = settings?.homeCtaTitle || 'می‌خواهید سیستم را برای مکتب خود فعال کنید؟';
  const ctaText = settings?.homeCtaText || 'برای دریافت دمو، قیمت و راه‌اندازی با ما تماس بگیرید.';
  const ctaLabel = settings?.homeCtaLabel || 'درخواست دمو';
  const ctaHref = settings?.homeCtaHref || '/demo-request';
  const quickCardItems = normalizeCardList(settings?.salesQuickCards, quickCards);
  const moduleCardItems = normalizeCardList(settings?.salesModules, moduleItems);
  const audienceList = normalizeAudienceList(settings?.salesAudience, audienceItems);
  const dashboardList = normalizeDashboardList(settings?.salesDashboardCards, dashboardItems);
  const faqList = normalizeFaqList(settings?.salesFaqs, faqItems);
  const trustTitle = settings?.salesTrustTitle || 'ساخته‌شده برای نیازهای واقعی مکاتب افغانستان';
  const trustText = settings?.salesTrustText || 'ساختار صنف‌ها، سال تعلیمی، فیس، حاضری، امتحانات و گزارش‌ها مطابق کار روزانه مکتب تنظیم می‌شود و برای هر مکتب قابل تغییر است.';
  const trustPoints = normalizeAudienceList(settings?.salesTrustPoints, ['راه‌اندازی مرحله‌به‌مرحله', 'دسترسی جداگانه برای نقش‌ها', 'گزارش‌های قابل پیگیری']);

  useEffect(() => {
    const reveal = () => {
      document.querySelectorAll('.home-page .reveal').forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 70) {
          el.classList.add('visible');
        }
      });
    };

    reveal();
    window.addEventListener('scroll', reveal);
    return () => window.removeEventListener('scroll', reveal);
  }, []);

  return (
    <section className="home-page" dir="rtl">
      <div className="home-shell">
        <section className="home-hero reveal">
          <div className="hero-content">
            <span className="home-kicker">{heroBadge}</span>
            <h1>{heroTitle}</h1>
            <p>{heroText}</p>
            <div className="hero-buttons">
              <Link className="hero-btn primary" to={secondaryHref}>
                {secondaryLabel}
              </Link>
              <Link className="hero-btn secondary" to={primaryHref}>
                {primaryLabel}
              </Link>
            </div>
          </div>

          <div className="hero-preview" aria-label="نمای کلی سیستم">
            <div className="preview-top">
              <span>{brandName}</span>
              <strong>داشبورد مدیریت</strong>
            </div>
            <div className="preview-grid">
              <div>
                <strong>شاگردان</strong>
                <span>ثبت و پیگیری</span>
              </div>
              <div>
                <strong>فیس</strong>
                <span>رسید و باقیات</span>
              </div>
              <div>
                <strong>حاضری</strong>
                <span>روزانه و دقیق</span>
              </div>
              <div>
                <strong>امتحانات</strong>
                <span>نمرات و کارنامه</span>
              </div>
            </div>
            <div className="preview-strip">
              <span>مدیریت</span>
              <span>مالی</span>
              <span>آموزش</span>
              <span>گزارش‌ها</span>
            </div>
          </div>
        </section>

        <section className="quick-grid reveal" aria-label="بخش‌های سریع سیستم">
          {quickCardItems.map((item) => (
            <article className="home-card quick-card" key={item.title}>
              <i className={`fa ${item.icon}`} aria-hidden="true" />
              <h2>{item.title}</h2>
              <p>{item.desc}</p>
            </article>
          ))}
        </section>

        <section className="home-section reveal" id="modules">
          <div className="section-head">
            <span>ماژول‌های اصلی سیستم</span>
            <h2>امکاناتی که مدیر مکتب فوراً ارزش آن را می‌فهمد</h2>
            <p>
              صفحه اصلی روی بخش‌هایی تمرکز دارد که کار روزانه مکتب را ساده‌تر، دقیق‌تر و قابل گزارش می‌سازد.
            </p>
          </div>
          <div className="module-grid">
            {moduleCardItems.map((item) => (
              <article className="home-card module-card" key={item.title}>
                <div className="card-icon">
                  <i className={`fa ${item.icon}`} aria-hidden="true" />
                </div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section audience-section reveal" id="schools">
          <div className="section-head">
            <span>برای کی ساخته شده؟</span>
            <h2>مناسب برای مراکز آموزشی که می‌خواهند کارها دیجیتال شود</h2>
          </div>
          <div className="audience-list">
            {audienceList.map((item) => (
              <div className="audience-item" key={item}>
                <i className="fa fa-check" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="trust-section reveal">
          <div>
            <span className="home-kicker">چرا این سیستم؟</span>
            <h2>{trustTitle}</h2>
            <p>{trustText}</p>
          </div>
          <div className="trust-points">
            {trustPoints.map((point) => <span key={point}>{point}</span>)}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <span>نمونه داشبوردها</span>
            <h2>هر کاربر پنل منظم خودش را دارد</h2>
          </div>
          <div className="dashboard-grid">
            {dashboardList.map((item) => (
              <article className="home-card dashboard-card" key={item.title}>
                <h3>{item.title}</h3>
                <ul>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <span>سوالات متداول</span>
            <h2>پاسخ کوتاه به سوال‌های مهم مدیران مکتب</h2>
          </div>
          <div className="faq-list">
            {faqList.map((item) => (
              <details className="home-card faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-cta reveal">
          <div>
            <span className="home-kicker">شروع همکاری</span>
            <h2>{ctaTitle}</h2>
            <p>{ctaText}</p>
          </div>
          <div className="cta-actions">
            <Link className="hero-btn primary" to={ctaHref}>
              {ctaLabel}
            </Link>
            <Link className="hero-btn secondary" to="/contact">
              تماس با ما
            </Link>
          </div>
        </section>
      </div>
    </section>
  );
}
