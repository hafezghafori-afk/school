import React from 'react';
import { Link } from 'react-router-dom';
import { normalizeBrandName } from '../utils/brand';
import './Footer.css';

const productModules = [
  'مدیریت شاگردان',
  'مدیریت مالی و فیس',
  'حاضری شاگردان و کارمندان',
  'امتحانات و کارنامه',
  'تقسیم اوقات',
  'گزارش‌های مدیریتی'
];

const productLinks = [
  { title: 'خانه', href: '/' },
  { title: 'ماژول‌های سیستم', href: '/#modules' },
  { title: 'درخواست دمو', href: '/demo-request' },
  { title: 'تماس با ما', href: '/contact' },
  { title: 'ورود به سیستم', href: '/login' }
];

function Footer({ settings }) {
  const currentYear = new Date().getFullYear();
  const brandName = normalizeBrandName(settings?.brandName);
  const contactPhone = settings?.contactPhone || '0702855557';
  const contactEmail = settings?.contactEmail || '---';
  const contactAddress = settings?.contactAddress || 'افغانستان';
  const footerIntro = settings?.footerContactText
    || 'سیما، سیستم مدیریت هوشمند مکاتیب افغانستان، برای مدیریت شاگردان، فیس، حاضری، امتحانات، تقسیم اوقات و گزارش‌ها طراحی شده است.';
  const footerLinks = Array.isArray(settings?.footerLinks) && settings.footerLinks.length
    ? settings.footerLinks.filter((item) => item?.title && item?.href)
    : productLinks;

  return (
    <footer className="site-footer" dir="rtl">
      <div className="footer-intro">
        <span className="footer-eyebrow">نرم‌افزار مدیریت مکتب</span>
        <h2>{brandName}</h2>
        <p>{footerIntro}</p>
        <div className="footer-cta-row">
          <Link to="/demo-request">درخواست دمو</Link>
          <Link to="/login">ورود به سیستم</Link>
        </div>
      </div>

      <div className="footer-panel">
        <span>ماژول‌های اصلی</span>
        <div className="footer-list">
          {productModules.map((item) => (
            <Link key={item} to="/#modules">{item}</Link>
          ))}
        </div>
      </div>

      <div className="footer-panel">
        <span>لینک‌های مهم</span>
        <div className="footer-list">
          {footerLinks.map((item) => (
            <Link key={item.title} to={item.href}>{item.title}</Link>
          ))}
        </div>
      </div>

      <div className="footer-panel footer-contact">
        <span>{settings?.footerContactTitle || 'تماس برای خرید و راه‌اندازی'}</span>
        <p>شماره تماس: {contactPhone}</p>
        <p>ایمیل: {contactEmail}</p>
        <p>آدرس: {contactAddress}</p>
        <Link className="footer-contact-btn" to="/demo-request">ارسال درخواست دمو</Link>
      </div>

      <div className="footer-bottom">
        <div>{settings?.footerNote || 'طراحی‌شده برای نیازهای واقعی مکاتب افغانستان.'}</div>
        <div>{settings?.footerCopyright || `© ${currentYear} ${brandName} - تمامی حقوق محفوظ است.`}</div>
      </div>
    </footer>
  );
}

export default Footer;
