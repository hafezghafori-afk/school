import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';
import useSiteSettings from '../hooks/useSiteSettings';
import './Home.css';

const fallbackSlides = [
  {
    badge: 'ثبت نام و شروع سریع',
    title: 'از صفحه خانه تا صنف، همه چیز در یک مسیر روشن',
    text: 'ثبت نام، مشاهده صنف‌ها و شروع یادگیری را از یک مسیر سریع و منظم مدیریت کنید.',
    primaryLabel: 'ثبت نام آنلاین',
    primaryHref: '/register',
    secondaryLabel: 'مشاهده صنف‌ها',
    secondaryHref: '/courses',
    imageUrl: ''
  },
  {
    badge: 'مدیریت آموزشی',
    title: 'حضور و غیاب، کارخانگی و نمره‌دهی در یک پنل منظم',
    text: 'برای شاگرد، استاد و ادمین یک تجربه سریع و یکپارچه فراهم شده است.',
    primaryLabel: 'ویژگی‌های کلیدی',
    primaryHref: '#home-features',
    secondaryLabel: 'داشبوردها',
    secondaryHref: '/dashboard',
    imageUrl: ''
  },
  {
    badge: 'سیستم مجازی',
    title: 'صنف‌های آنلاین، چت صنفی و آرشیف جلسه همیشه در دسترس است',
    text: 'تعامل آموزشی را با صنف‌های آنلاین، پیام‌رسانی و آرشیف جلسه بدون جابه‌جایی بین ماژول‌ها دنبال کنید.',
    primaryLabel: 'ورود به چت',
    primaryHref: '/chat',
    secondaryLabel: 'آرشیف جلسات',
    secondaryHref: '/recordings',
    imageUrl: ''
  }
];

const fallbackFeatures = [
  { title: 'کلاس‌های هوشمند', desc: 'برنامه‌ریزی آنلاین، حضور و غیاب، و نمره‌دهی دقیق برای هر صنف.' },
  { title: 'سیستم کارخانگی', desc: 'تحویل فایل و متن، بازخورد استاد و گزارش کامل برای شاگرد.' },
  { title: 'پنل مدیریت کامل', desc: 'کنترول کاربران، صنف‌ها، مضامین، اعلانات و گزارش‌ها.' },
  { title: 'چت لحظه‌ای', desc: 'چت مستقیم و گروهی صنف با فایل و اعلانات آنلاین.' },
  { title: 'تقسیم اوقات', desc: 'برنامه روز و هفته برای استاد و شاگرد، با امکان ویرایش توسط مدیر.' },
  { title: 'کارنامه PDF', desc: 'کارنامه نمرات و ریزنمرات قابل دانلود برای هر صنف.' },
  { title: 'نمره‌دهی دو بخشی', desc: 'ثبت نمرات ۴۰ امتحان چهارونیم‌ماهه + ۶۰ نهایی با جمع‌بندی دقیق.' },
  { title: 'ثبت‌نام آنلاین', desc: 'فرم جامع ثبت‌نام با بارگذاری اسناد و پیگیری وضعیت.' }
];

const roleCards = [
  {
    title: 'ورود عمومی',
    icon: 'fa-right-to-bracket',
    points: ['ورود یکپارچه برای شاگرد، استاد و مدیریت', 'دسترسی سریع به داشبورد متناسب با نقش', 'ورود از یک صفحه با دیزاین واحد'],
    link: '/login',
    action: 'ورود عمومی'
  }
];

const virtualItems = [
  { title: 'کلاس مجازی', desc: 'ورود سریع به جلسه آنلاین هر صنف با زمان‌بندی مشخص.', icon: 'fa-video' },
  { title: 'چت صنفی', desc: 'تعامل لحظه‌ای شاگرد و استاد همراه با ارسال فایل.', icon: 'fa-comments' },
  { title: 'آرشیف ضبط جلسات', desc: 'مشاهده و بازبینی جلسات گذشته برای مرور بهتر.', icon: 'fa-record-vinyl' },
  { title: 'اعلان فوری', desc: 'نمایش پیام‌های مهم آموزشی در لحظه برای همه نقش‌ها.', icon: 'fa-bell' }
];

const fallbackNewsItems = [
  { title: 'آغاز ترم جدید', text: 'ثبت‌نام ترم جدید از امروز آغاز شد.' },
  { title: 'کارگاه مهارت‌ها', text: 'کارگاه مهارت‌های دیجیتال ویژه شاگردان برگزار می‌شود.' },
  { title: 'اعلان مهم', text: 'تغییر برنامه زمان‌بندی برخی صنف‌ها اعلام شد.' }
];

const fallbackGalleryItems = [
  { title: 'رویداد علمی', meta: 'نمایشگاه سالانه شاگردان', icon: 'fa-flask' },
  { title: 'صنف‌های آنلاین', meta: 'جلسات تعاملی مجازی', icon: 'fa-laptop' },
  { title: 'مسابقات ورزشی', meta: 'فعالیت‌های فوق برنامه', icon: 'fa-trophy' },
  { title: 'جلسه اولیا', meta: 'گزارش پیشرفت شاگردان', icon: 'fa-users' },
  { title: 'کتابخانه', meta: 'فضای مطالعاتی مدرسه', icon: 'fa-book-open' },
  { title: 'مراسم تقدیر', meta: 'تشویق شاگردان برتر', icon: 'fa-medal' }
];

const testimonials = [
  { name: 'مریم', role: 'ولی شاگرد', text: 'پیگیری کارخانگی و نمرات بسیار منظم و واضح شده است.' },
  { name: 'پارمیس', role: 'شاگرد', text: 'چت صنفی و دانلود مواد درسی باعث شد درس‌ها را بهتر دنبال کنم.' },
  { name: 'استاد رحیمی', role: 'استاد', text: 'ثبت حضور و نمره‌دهی خیلی سریع‌تر از قبل انجام می‌شود.' }
];

const faqs = [
  { q: 'ثبت‌نام آنلاین چگونه انجام می‌شود؟', a: 'از بخش ثبت‌نام، فرم را تکمیل و اسناد لازم را بارگذاری کنید تا بررسی شود.' },
  { q: 'نمره‌دهی چگونه محاسبه می‌شود؟', a: 'نمرات به شکل ۴۰ امتحان چهارونیم‌ماهه + ۶۰ نهایی ثبت و جمع‌بندی می‌شود.' },
  { q: 'کارنامه PDF از کجا دانلود می‌شود؟', a: 'شاگرد در داشبورد خود می‌تواند کارنامه هر صنف را به شکل PDF دریافت کند.' },
  { q: 'چت مستقیم و صنفی چه تفاوتی دارد؟', a: 'چت مستقیم بین دو کاربر است و چت صنفی برای همه اعضای همان صنف نمایش داده می‌شود.' },
  { q: 'تقسیم اوقات از کجا مدیریت می‌شود؟', a: 'مدیر در بخش تقسیم اوقات برنامه را ثبت می‌کند و برای استاد و شاگرد نمایش داده می‌شود.' }
];

const fallbackStats = [
  { value: '50+', text: 'صنف فعال' },
  { value: '1200+', text: 'شاگرد ثبت‌شده' },
  { value: '80+', text: 'استاد مجرب' },
  { value: '24/7', text: 'پشتیبانی' }
];

const HOME_FEED_CACHE_KEY = 'school_home_feed_cache_v1';
const HOME_FEED_CACHE_TTL_MS = 5 * 60 * 1000;
const HOME_FEED_REFRESH_MS = 5 * 60 * 1000;

const isExternalHref = (href = '') => /^(https?:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');

function SmartLink({ to = '/', className = '', children, ...props }) {
  const href = String(to || '/').trim() || '/';
  if (href.startsWith('#') || isExternalHref(href)) {
    return (
      <a
        className={className}
        href={href}
        target={isExternalHref(href) ? '_blank' : undefined}
        rel={isExternalHref(href) ? 'noreferrer' : undefined}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link className={className} to={href} {...props}>
      {children}
    </Link>
  );
}

const resolveImage = (url = '') => {
  const value = String(url || '');
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${API_BASE}/${value.replace(/^\//, '')}`;
};

const formatDateFa = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const readHomeFeedCache = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(HOME_FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const updatedAt = Number(parsed.updatedAt || 0);
    const news = Array.isArray(parsed.news) ? parsed.news : [];
    const gallery = Array.isArray(parsed.gallery) ? parsed.gallery : [];
    if (!updatedAt || (!news.length && !gallery.length)) return null;
    return {
      updatedAt,
      news,
      gallery,
      isFresh: (Date.now() - updatedAt) < HOME_FEED_CACHE_TTL_MS
    };
  } catch {
    return null;
  }
};

const writeHomeFeedCache = (news, gallery) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      HOME_FEED_CACHE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        news: Array.isArray(news) ? news : [],
        gallery: Array.isArray(gallery) ? gallery : []
      })
    );
  } catch {
    // ignore cache write failures
  }
};

export default function Home() {
  const { settings } = useSiteSettings();
  const [latestNews, setLatestNews] = useState([]);
  const [latestGallery, setLatestGallery] = useState([]);
  const [homeFeedLoading, setHomeFeedLoading] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const featureItems = useMemo(() => {
    const resolved = (settings?.homeFeatures || [])
      .filter((item) => item && (item.title || item.text))
      .map((item) => ({
        title: item.title || 'ویژگی',
        desc: item.text || ''
      }));
    return resolved.length ? resolved : fallbackFeatures;
  }, [settings?.homeFeatures]);

  const statsItems = (settings?.homeStats || []).filter((item) => item && (item.value || item.text));
  const stats = statsItems.length ? statsItems : fallbackStats;

  const heroTags = Array.isArray(settings?.homeHeroTags) && settings.homeHeroTags.length
    ? settings.homeHeroTags.slice(0, 4)
    : ['نمره‌ها: ۴۰ امتحان چهارونیم‌ماهه + ۶۰ نهایی', 'کارنامه و ریزنمرات PDF', 'چت مستقیم و گروهی صنف', 'نمایش درست در موبایل و کمپیوتر'];

  const heroTitle = settings?.homeHeroTitle || 'مدیریت آموزش مدرسه با یک پنل یکپارچه';
  const heroHighlight = settings?.homeHeroHighlight || 'سریع، دقیق و قابل اعتماد';
  const heroText = settings?.homeHeroText || 'تمام فرآیندهای آموزشی مدرسه را از ثبت‌نام تا نمره‌دهی، کارخانگی، حضور و غیاب و گزارشات در یک سیستم حرفه‌ای مدیریت کنید.';
  const heroPrimaryLabel = settings?.homeHeroPrimaryLabel || 'ثبت‌نام آنلاین';
  const heroPrimaryHref = settings?.homeHeroPrimaryHref || '/register';
  const heroSecondaryLabel = settings?.homeHeroSecondaryLabel || 'مشاهده صنف‌ها';
  const heroSecondaryHref = settings?.homeHeroSecondaryHref || '/courses';

  const slideItems = useMemo(() => {
    const resolved = (settings?.homeSlides || [])
      .filter((item) => item && (item.title || item.text || item.badge))
      .map((item) => ({
        badge: item.badge || '',
        title: item.title || 'اسلاید خانه',
        text: item.text || '',
        primaryLabel: item.primaryLabel || 'بیشتر',
        primaryHref: item.primaryHref || '/courses',
        secondaryLabel: item.secondaryLabel || '',
        secondaryHref: item.secondaryHref || '',
        imageUrl: item.imageUrl || ''
      }));
    return resolved.length ? resolved : fallbackSlides;
  }, [settings?.homeSlides]);

  const managedNewsItems = useMemo(() => (
    (settings?.homeNews || [])
      .filter((item) => item && (item.title || item.text || item.href))
      .slice(0, 3)
  ), [settings?.homeNews]);

  const newsItems = managedNewsItems.length ? managedNewsItems : latestNews.length ? latestNews : fallbackNewsItems;
  const galleryItems = latestGallery.length ? latestGallery : fallbackGalleryItems;
  const currentSlide = slideItems[activeSlide] || slideItems[0] || fallbackSlides[0];
  const ctaTitle = settings?.homeCtaTitle || 'آماده‌اید شروع کنید؟';
  const ctaText = settings?.homeCtaText || `همین حالا سیستم آموزشی ${settings?.brandName || 'مدرسه ایمان'} را فعال کنید.`;
  const ctaLabel = settings?.homeCtaLabel || 'شروع رایگان';
  const ctaHref = settings?.homeCtaHref || '/register';

  useEffect(() => {
    const reveal = () => {
      const blocks = document.querySelectorAll('.home-page .reveal');
      blocks.forEach((el) => {
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

  useEffect(() => {
    setActiveSlide((prev) => {
      if (!slideItems.length) return 0;
      return prev >= slideItems.length ? 0 : prev;
    });
  }, [slideItems.length]);

  useEffect(() => {
    if (slideItems.length < 2) return undefined;
    const intervalId = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % slideItems.length);
    }, 6500);
    return () => window.clearInterval(intervalId);
  }, [slideItems.length]);

  useEffect(() => {
    let cancelled = false;
    let pending = false;
    let currentController = null;

    const loadHomeFeed = async ({ silent = false } = {}) => {
      if (cancelled || pending) return;
      pending = true;
      if (!silent) setHomeFeedLoading(true);
      currentController = new AbortController();
      try {
        const [newsRes, galleryRes] = await Promise.all([
          fetch(`${API_BASE}/api/news`, { signal: currentController.signal }),
          fetch(`${API_BASE}/api/gallery`, { signal: currentController.signal })
        ]);

        const [newsData, galleryData] = await Promise.all([
          newsRes.json().catch(() => ({})),
          galleryRes.json().catch(() => ({}))
        ]);

        if (cancelled) return;

        const news = Array.isArray(newsData?.items) ? newsData.items : [];
        const gallery = Array.isArray(galleryData?.items) ? galleryData.items : [];

        const normalizedNews = news
          .filter((item) => item && (item.title || item.summary || item.text || item.content))
          .sort((a, b) => {
            const at = new Date(a?.publishedAt || a?.createdAt || 0).getTime();
            const bt = new Date(b?.publishedAt || b?.createdAt || 0).getTime();
            return bt - at;
          })
          .slice(0, 3);

        const normalizedGallery = gallery
          .filter((item) => item && (item.title || item.description || item.imageUrl))
          .slice(0, 6);

        setLatestNews(normalizedNews);
        setLatestGallery(normalizedGallery);
        writeHomeFeedCache(normalizedNews, normalizedGallery);
      } catch {
        if (cancelled) return;
      } finally {
        pending = false;
        if (!cancelled && !silent) setHomeFeedLoading(false);
      }
    };

    const cachedFeed = readHomeFeedCache();
    if (cachedFeed) {
      setLatestNews(cachedFeed.news);
      setLatestGallery(cachedFeed.gallery);
    }

    if (!cachedFeed || !cachedFeed.isFresh) {
      loadHomeFeed({ silent: !!cachedFeed });
    }
    const intervalId = window.setInterval(
      () => loadHomeFeed({ silent: true }),
      HOME_FEED_REFRESH_MS
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      if (currentController) currentController.abort();
    };
  }, []);

  return (
    <section className="home-page">
      <div className="home-shell">
        <section className="home-hero reveal">
          <div className="home-surface hero-main">
            <div className="hero-copy">
              <span className="hero-badge">{settings?.homeHeroBadge || 'سامانه آموزش هوشمند'}</span>
              <h1>
                {heroTitle}
                <span className="highlight">{heroHighlight}</span>
              </h1>
              <p>{heroText}</p>
              <div className="hero-buttons">
                <Link className="hero-btn primary" to={heroPrimaryHref}>{heroPrimaryLabel}</Link>
                <Link className="hero-btn ghost" to={heroSecondaryHref}>{heroSecondaryLabel}</Link>
              </div>
              <div className="hero-tags">
                {heroTags.map((tag, idx) => <span key={`${tag}-${idx}`}>{tag}</span>)}
              </div>
            </div>

            <div className="hero-panel">
              <div className="panel-card accent">
                <h3>ثبت‌نام آنلاین</h3>
                <p>فرم جامع با بارگذاری اسناد و پیگیری وضعیت درخواست.</p>
                <div className="panel-metric">
                  <strong>چند دقیقه</strong>
                  <span>تکمیل فرم</span>
                </div>
                <Link className="hero-btn ghost compact" to="/faq">راهنمای ثبت‌نام</Link>
              </div>
              <div className="panel-card">
                <h3>ورود یکپارچه</h3>
                <p>همه نقش‌ها از همین صفحه عمومی وارد سیستم می‌شوند.</p>
                <div className="hero-mini-actions">
                  <Link to="/login">ورود عمومی</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="home-slider reveal" aria-label="اسلایدر صفحه خانه">
          <div className="home-surface slider-shell">
            <div className="slider-copy">
              <div className="slider-topline">
                <span className="hero-badge slider-badge">{currentSlide.badge || 'محتوای ویژه خانه'}</span>
                <span className="slider-counter">{activeSlide + 1} / {slideItems.length}</span>
              </div>
              <h2>{currentSlide.title}</h2>
              <p>{currentSlide.text}</p>
              <div className="hero-buttons">
                <SmartLink className="hero-btn primary" to={currentSlide.primaryHref}>
                  {currentSlide.primaryLabel || 'بیشتر'}
                </SmartLink>
                {!!currentSlide.secondaryLabel && !!currentSlide.secondaryHref && (
                  <SmartLink className="hero-btn ghost" to={currentSlide.secondaryHref}>
                    {currentSlide.secondaryLabel}
                  </SmartLink>
                )}
              </div>
              <div className="slider-tabs" role="tablist" aria-label="انتخاب اسلاید">
                {slideItems.map((item, idx) => (
                  <button
                    key={`${item.title}-${idx}`}
                    type="button"
                    className={idx === activeSlide ? 'active' : ''}
                    onClick={() => setActiveSlide(idx)}
                    aria-selected={idx === activeSlide}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.badge || 'اسلاید'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="slider-visual">
              {currentSlide.imageUrl ? (
                <div
                  className="slider-image"
                  style={{ backgroundImage: `url(${resolveImage(currentSlide.imageUrl)})` }}
                  role="img"
                  aria-label={currentSlide.title}
                />
              ) : (
                <div className="slider-image slider-image-placeholder" aria-hidden="true">
                  <div className="slider-orbit slider-orbit-a" />
                  <div className="slider-orbit slider-orbit-b" />
                  <div className="slider-brand-card">
                    <span>{settings?.brandName || 'مدرسه ایمان'}</span>
                    <strong>{currentSlide.badge || 'خانه و CMS'}</strong>
                  </div>
                </div>
              )}
              <div className="slider-stat-grid">
                {stats.slice(0, 3).map((item, idx) => (
                  <div className="slider-stat-card" key={`${item.value}-${idx}`}>
                    <strong>{item.value}</strong>
                    <span>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="home-stats reveal">
          {stats.map((item, idx) => (
            <div className="home-surface stat-card" key={`${item.value}-${idx}`}>
              <strong>{item.value}</strong>
              <span>{item.text}</span>
            </div>
          ))}
        </section>

        <section className="home-section reveal" id="home-features">
          <div className="section-head">
            <h2>ویژگی‌های کلیدی</h2>
            <p>هر آنچه برای مدیریت یک مدرسه دیجیتال لازم است.</p>
          </div>
          <div className="feature-grid">
            {featureItems.map((item, idx) => (
              <div className="home-surface feature-card" key={`${item.title}-${idx}`}>
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>ورود بر اساس نقش</h2>
            <p>هر کاربر با پنل مخصوص خود وارد سیستم می‌شود.</p>
          </div>
          <div className="role-grid">
            {roleCards.map((role) => (
              <article className="home-surface role-card" key={role.title}>
                <div className="role-head">
                  <span className="role-icon">
                    <i className={`fa ${role.icon}`} aria-hidden="true" />
                  </span>
                  <h4>{role.title}</h4>
                </div>
                <ul>
                  {role.points.map((point) => <li key={point}>{point}</li>)}
                </ul>
                <Link to={role.link}>{role.action}</Link>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>سیستم مجازی</h2>
            <p>صنف‌های آنلاین، چت، آرشیف جلسات و اعلان‌ها در یک مسیر یکپارچه.</p>
          </div>
          <div className="virtual-grid">
            {virtualItems.map((item) => (
              <div className="home-surface virtual-card" key={item.title}>
                <i className={`fa ${item.icon}`} aria-hidden="true" />
                <h4>{item.title}</h4>
                <p>{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="section-actions">
            <Link className="hero-btn ghost compact" to="/chat">چت آنلاین</Link>
            <Link className="hero-btn ghost compact" to="/recordings">آرشیف جلسات</Link>
            <Link className="hero-btn ghost compact" to="/schedule">تقسیم اوقات</Link>
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>اخبار و اعلانات</h2>
            <p>آخرین به‌روزرسانی‌های مدرسه را دنبال کنید.</p>
          </div>
          {homeFeedLoading && !managedNewsItems.length && !latestNews.length && (
            <div className="home-feed-status">در حال دریافت اخبار...</div>
          )}
          <div className="news-grid">
            {newsItems.map((item, idx) => {
              const title = item?.title || 'خبر مدرسه';
              const summary = item?.summary || item?.text || item?.content || 'جزئیات خبر از بخش اخبار قابل مشاهده است.';
              const published = formatDateFa(item?.publishedAt || item?.createdAt);
              const thumb = resolveImage(item?.imageUrl);
              const link = item?._id ? `/news/${item._id}` : item?.href || '/news';

              return (
                <article className="home-surface news-card" key={`${title}-${idx}`}>
                  {!!thumb && (
                    <div
                      className="news-thumb"
                      style={{ backgroundImage: `url(${thumb})` }}
                      role="img"
                      aria-label={title}
                    />
                  )}
                  <h4>{title}</h4>
                  {!!published && <small className="news-date">{published}</small>}
                  <p>{summary}</p>
                  <SmartLink to={link}>ادامه</SmartLink>
                </article>
              );
            })}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>گالری تصویری</h2>
            <p>نمایی از فعالیت‌ها و رویدادهای آموزشی مدرسه.</p>
          </div>
          {homeFeedLoading && !latestGallery.length && (
            <div className="home-feed-status">در حال دریافت گالری...</div>
          )}
          <div className="gallery-grid">
            {galleryItems.map((item, idx) => {
              const title = item?.title || 'گالری مدرسه';
              const meta = item?.tag || item?.meta || item?.description || 'تصاویر فعالیت‌های آموزشی';
              const thumb = resolveImage(item?.imageUrl);
              const link = item?._id ? `/gallery#item-${item._id}` : '/gallery';

              return (
                <article className="home-surface gallery-card" key={`${title}-${idx}`}>
                  {!!thumb ? (
                    <div
                      className="gallery-thumb"
                      style={{ backgroundImage: `url(${thumb})` }}
                      role="img"
                      aria-label={title}
                    />
                  ) : (
                    <i className={`fa ${item?.icon || 'fa-image'}`} aria-hidden="true" />
                  )}
                  <h4>{title}</h4>
                  <p>{meta}</p>
                  <Link to={link}>نمایش</Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>نظرات کاربران</h2>
            <p>بازخورد واقعی از تجربه استفاده سیستم.</p>
          </div>
          <div className="testimonial-grid">
            {testimonials.map((item) => (
              <article className="home-surface testimonial-card" key={`${item.name}-${item.role}`}>
                <p>{item.text}</p>
                <strong>{item.name}</strong>
                <span>{item.role}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="home-section reveal">
          <div className="section-head">
            <h2>سوالات متداول</h2>
            <p>پاسخ سریع به پرسش‌های مهم اولیا، شاگردان و استادان.</p>
          </div>
          <div className="faq-list">
            {faqs.map((item) => (
              <details className="home-surface faq-item" key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="home-cta reveal">
          <div>
            <h3>{ctaTitle}</h3>
            <p>{ctaText}</p>
          </div>
          <div className="cta-actions">
            <SmartLink className="hero-btn primary" to={ctaHref}>{ctaLabel}</SmartLink>
            <SmartLink className="hero-btn ghost" to="/contact">ارتباط با ما</SmartLink>
          </div>
        </section>
      </div>
    </section>
  );
}
