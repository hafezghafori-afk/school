import React from 'react';
import './Footer.css';

function Footer({ settings }) {
  const socialLinks = settings?.socialLinks || [];
  const footerLinks = settings?.footerLinks || [];
  const footerHours = settings?.footerHours || [];
  const currentYear = new Date().getFullYear();
  const footerCopyright = settings?.footerCopyright
    || `© ${currentYear} ${settings?.brandName || 'مدرسه ایمان'} - تمامی حقوق محفوظ است.`;
  const showCopyright = settings?.footerShowCopyright !== false;
  const showFooterBottom = !!settings?.footerNote || showCopyright;
  const iconByTitle = (title = '') => {
    const key = title.toLowerCase();
    if (key.includes('facebook')) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13.5 9.25V7.5c0-.55.45-1 1-1h2V3.5h-2c-2.21 0-4 1.79-4 4v1.75H8v3h2.5V21h3v-8.75H16.5l.75-3h-3.75z" />
        </svg>
      );
    }
    if (key.includes('instagram')) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 7.25A4.75 4.75 0 1 0 16.75 12 4.76 4.76 0 0 0 12 7.25zm0 7A2.25 2.25 0 1 1 14.25 12 2.25 2.25 0 0 1 12 14.25z" />
          <path d="M17 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h10A3.5 3.5 0 0 0 20.5 17V7A3.5 3.5 0 0 0 17 3.5zm1.5 13.5A1.5 1.5 0 0 1 17 18.5H7A1.5 1.5 0 0 1 5.5 17V7A1.5 1.5 0 0 1 7 5.5h10A1.5 1.5 0 0 1 18.5 7z" />
          <circle cx="17.5" cy="6.5" r="1" />
        </svg>
      );
    }
    if (key.includes('whatsapp')) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5a8.5 8.5 0 0 0-7.29 12.88L4 20.5l4.26-1.12A8.5 8.5 0 1 0 12 3.5zm4.41 12.46c-.18.51-1.06 1-1.5 1.06-.4.06-.9.08-1.45-.1-.34-.1-.78-.25-1.34-.5-2.35-1.03-3.88-3.44-4-3.6-.12-.17-.95-1.27-.95-2.43 0-1.16.6-1.72.82-1.95.2-.22.44-.28.6-.28h.44c.14 0 .32-.05.5.38.18.45.6 1.56.66 1.67.06.11.1.25.02.42-.08.18-.12.29-.24.44-.12.15-.25.33-.36.44-.12.12-.25.24-.1.48.15.24.68 1.12 1.46 1.82 1 .9 1.84 1.18 2.08 1.3.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.38.66 1.62.78.24.12.4.18.46.28.06.1.06.56-.12 1.07z" />
        </svg>
      );
    }
    if (key.includes('tiktok')) {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 3.5h2c.2 2.1 1.7 3.9 3.8 4.1v2.1c-1.5-.05-2.9-.58-3.8-1.4v6.2a5.3 5.3 0 1 1-5.3-5.3c.4 0 .8.04 1.2.13v2.3a2.9 2.9 0 1 0 1.7 2.6V3.5z" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
      </svg>
    );
  };

  return (
    <footer className="site-footer">
      {settings?.footerShowHours !== false && (
        <div className="footer-hours">
          <span>{settings?.footerHoursTitle || 'ساعات کاری'}</span>
          <div className="footer-hours-grid">
            {(footerHours.length ? footerHours : []).map((item, idx) => (
              <React.Fragment key={`${item.title}-${idx}`}>
                <div>{item.title}</div>
                <div>{item.href}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {settings?.footerShowSocial !== false && (
        <div className="footer-social">
          <span>{settings?.footerSocialTitle || 'شبکه‌های اجتماعی'}</span>
          <div className="social-icons">
            {socialLinks.map(item => {
              const key = (item.title || '').toLowerCase();
              const cls = key.includes('facebook')
                ? 'facebook'
                : key.includes('instagram')
                  ? 'instagram'
                  : key.includes('whatsapp')
                    ? 'whatsapp'
                    : key.includes('tiktok')
                      ? 'tiktok'
                      : 'generic';
              return (
                <a
                  key={item.title}
                  href={item.href || '#'}
                  className={`${item.href ? '' : 'placeholder'} ${cls}`}
                  title={item.title}
                  aria-label={item.title}
                >
                  <span className="social-icon">{iconByTitle(item.title)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}

      {settings?.footerShowLinks !== false && (
        <div className="footer-links">
          <span>{settings?.footerLinksTitle || 'لینک‌های مفید'}</span>
          {footerLinks.map(item => (
            <a key={item.title} href={item.href || '#'}>{item.title}</a>
          ))}
        </div>
      )}

      {settings?.footerShowContact !== false && (
        <div className="footer-contact">
          <span>{settings?.footerContactTitle || 'ارتباط با ما'}</span>
          {settings?.footerContactText && <p>{settings.footerContactText}</p>}
          <p>آدرس: {settings?.contactAddress || '---'}</p>
          <p>ایمیل: {settings?.contactEmail || '---'}</p>
          <p>شماره تماس: {settings?.contactPhone || '---'}</p>
        </div>
      )}

      {showFooterBottom && (
        <div className="footer-bottom">
          {settings?.footerNote && (
            <div className="footer-note">{settings.footerNote}</div>
          )}
          {showCopyright && <div className="footer-copyright">{footerCopyright}</div>}
        </div>
      )}
    </footer>
  );
}

export default Footer;
