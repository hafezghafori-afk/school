import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Public.css';

const DEFAULT_SCHOOL_NAME = 'Iman Girls School';
const DEFAULT_SUBTITLE = 'مکتب دخترانه ایمان';
const DEFAULT_NAV_ITEMS = [
  { key: 'home', title: 'خانه', href: '/' },
  { key: 'about', title: 'درباره مکتب', href: '/about' },
  { key: 'programs', title: 'برنامه‌های آموزشی', href: '/#programs' },
  { key: 'news', title: 'اخبار', href: '/news' },
  { key: 'gallery', title: 'گالری', href: '/gallery' },
  { key: 'contact', title: 'تماس با ما', href: '/contact' }
];
const DEFAULT_FOOTER_LINKS = [
  { title: 'درباره مکتب', href: '/about' },
  { title: 'اخبار', href: '/news' },
  { title: 'گالری', href: '/gallery' },
  { title: 'تماس با ما', href: '/contact' }
];

const getSettingLogo = (settings) => settings?.schoolLogoUrl || settings?.logoUrl || settings?.logo || '';
const getSettingName = (settings) => settings?.brandName || DEFAULT_SCHOOL_NAME;
const getSettingSubtitle = (settings) => settings?.brandSubtitle || DEFAULT_SUBTITLE;
const NAV_KEYS = DEFAULT_NAV_ITEMS.map((item) => item.key);

const getLinkKey = (href = '', title = '') => {
  const rawHref = String(href || '').trim();
  const path = rawHref.split(/[?#]/)[0].replace(/^\/schools\/[^/]+/, '').replace(/\/$/, '') || '/';
  const text = String(title || '').trim().toLowerCase();
  if (path === '/' || text.includes('خانه') || text.includes('home')) return 'home';
  if (path === '/about' || text.includes('درباره') || text.includes('about')) return 'about';
  if (path === '/news' || text.includes('خبر') || text.includes('news')) return 'news';
  if (path === '/gallery' || text.includes('گالری') || text.includes('gallery')) return 'gallery';
  if (path === '/contact' || text.includes('تماس') || text.includes('contact')) return 'contact';
  if (
    String(href || '').includes('program') ||
    String(href || '').includes('feature') ||
    text.includes('برنامه') ||
    text.includes('آموزش') ||
    text.includes('امکانات') ||
    path === '/features'
  ) {
    return 'programs';
  }
  return path || text;
};

const normalizeLinks = (items, fallback) => {
  const normalizedFallback = (Array.isArray(fallback) ? fallback : [])
    .map((item) => ({
      key: item?.key || getLinkKey(item?.href, item?.title || item?.label),
      title: String(item?.title || item?.label || '').trim(),
      href: String(item?.href || item?.to || '').trim(),
      enabled: item?.enabled !== false
    }))
    .filter((item) => item.enabled && item.title && item.href);
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => ({
      key: item?.key || getLinkKey(item?.href || item?.to, item?.title || item?.label),
      title: String(item?.title || item?.label || '').trim(),
      href: String(item?.href || item?.to || '').trim(),
      enabled: item?.enabled !== false
    }))
    .filter((item) => item.enabled && item.title && item.href);
  const byKey = new Map(normalizedFallback.map((item) => [item.key, item]));
  normalizedItems.forEach((item) => {
    if (NAV_KEYS.includes(item.key) && byKey.has(item.key)) {
      byKey.set(item.key, { ...byKey.get(item.key), title: item.title || byKey.get(item.key).title });
    }
  });
  return normalizedFallback.map((item) => byKey.get(item.key) || item);
};

const getActiveNavKey = (location, active = '') => {
  const activeText = String(active || '').trim();
  const byActiveText = DEFAULT_NAV_ITEMS.find((item) => item.title === activeText || getLinkKey('', activeText) === item.key)?.key;
  const path = String(location?.pathname || '/').replace(/\/$/, '') || '/';
  const hash = String(location?.hash || '');
  if (path === '/' && hash === '#programs') return 'programs';
  if (path === '/') return 'home';
  if (path === '/about') return 'about';
  if (path === '/news' || path.startsWith('/news/')) return 'news';
  if (path === '/gallery') return 'gallery';
  if (path === '/contact') return 'contact';
  return byActiveText || '';
};

export function SchoolLogo({
  to = '/',
  logoSrc = '',
  name = DEFAULT_SCHOOL_NAME,
  subtitle = DEFAULT_SUBTITLE,
  className = ''
}) {
  const content = (
    <>
      <span className="school-logo-mark" aria-hidden="true">
        {logoSrc ? (
          <img src={logoSrc} alt="" />
        ) : (
          <svg className="school-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 10.5 12 5l9 5.5-9 5.5-9-5.5Z" />
            <path d="M6.5 13.5v3.2c2.9 2.4 8.1 2.4 11 0v-3.2" />
            <path d="M19.5 12v4.5" />
          </svg>
        )}
      </span>
      <span className="school-logo-text">
        <span className="school-logo-name">{name}</span>
        <span className="school-logo-subtitle">{subtitle}</span>
      </span>
    </>
  );

  if (!to) {
    return <span className={`school-logo ${className}`.trim()}>{content}</span>;
  }

  return (
    <Link className={`school-logo ${className}`.trim()} to={to} aria-label={name}>
      {content}
    </Link>
  );
}

export function PrimaryButton({ to, children, className = '', ...props }) {
  const classes = `public-button primary ${className}`.trim();
  if (to) {
    return <Link className={classes} to={to} {...props}>{children}</Link>;
  }
  return <button type="button" className={classes} {...props}>{children}</button>;
}

export function SecondaryButton({ to, children, className = '', ...props }) {
  const classes = `public-button secondary ${className}`.trim();
  if (to) {
    return <Link className={classes} to={to} {...props}>{children}</Link>;
  }
  return <button type="button" className={classes} {...props}>{children}</button>;
}

export function SectionTitle({ kicker, title, children, className = '' }) {
  return (
    <div className={`public-section-title ${className}`.trim()}>
      {kicker ? <span className="public-section-kicker">{kicker}</span> : null}
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function PublicHeader({
  active = '',
  logoSrc = '',
  schoolName = DEFAULT_SCHOOL_NAME,
  schoolSubtitle = DEFAULT_SUBTITLE,
  navItems = DEFAULT_NAV_ITEMS
}) {
  const location = useLocation();
  const visibleNavItems = normalizeLinks(navItems, DEFAULT_NAV_ITEMS);
  const activeKey = getActiveNavKey(location, active);
  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <SchoolLogo logoSrc={logoSrc} name={schoolName} subtitle={schoolSubtitle} />
        <nav className="public-nav" aria-label="منوی عمومی">
          {visibleNavItems.map((item) => (
            <Link
              key={item.key || `${item.title}-${item.href}`}
              to={item.href}
              className={`public-nav-link ${activeKey === item.key ? 'active' : ''}`.trim()}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="public-actions">
          <PrimaryButton to="/login">ورود به سیستم</PrimaryButton>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter({
  logoSrc = '',
  schoolName = DEFAULT_SCHOOL_NAME,
  schoolSubtitle = DEFAULT_SUBTITLE,
  footerLinks = DEFAULT_FOOTER_LINKS,
  footerNote = ''
}) {
  const visibleFooterLinks = normalizeLinks(footerLinks, DEFAULT_FOOTER_LINKS);
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div>
          <SchoolLogo to="/" logoSrc={logoSrc} name={schoolName} subtitle={schoolSubtitle} />
          <p className="public-footer-copy">{footerNote || 'آموزش منظم، محیط امن و رشد با اعتماد برای دختران امروز.'}</p>
        </div>
        <div className="public-footer-links">
          {visibleFooterLinks.map((item) => <Link key={`${item.title}-${item.href}`} to={item.href}>{item.title}</Link>)}
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({
  children,
  active = '',
  logoSrc = '',
  schoolName = DEFAULT_SCHOOL_NAME,
  schoolSubtitle = DEFAULT_SUBTITLE,
  settings = null,
  showFooter = true
}) {
  const resolvedLogo = logoSrc || getSettingLogo(settings);
  const resolvedName = schoolName === DEFAULT_SCHOOL_NAME ? getSettingName(settings) : schoolName;
  const resolvedSubtitle = schoolSubtitle === DEFAULT_SUBTITLE ? getSettingSubtitle(settings) : schoolSubtitle;
  const navItems = normalizeLinks(settings?.mainMenu, DEFAULT_NAV_ITEMS);
  const footerLinks = normalizeLinks(settings?.footerLinks, DEFAULT_FOOTER_LINKS);
  const footerNote = settings?.footerNote || settings?.footerContactText || settings?.aboutBody || '';

  return (
    <div className="public-layout" dir="rtl">
      <PublicHeader
        active={active}
        logoSrc={resolvedLogo}
        schoolName={resolvedName}
        schoolSubtitle={resolvedSubtitle}
        navItems={navItems}
      />
      <main>{children}</main>
      {showFooter ? (
        <PublicFooter
          logoSrc={resolvedLogo}
          schoolName={resolvedName}
          schoolSubtitle={resolvedSubtitle}
          footerLinks={footerLinks}
          footerNote={footerNote}
        />
      ) : null}
    </div>
  );
}
