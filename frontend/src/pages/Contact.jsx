import React, { useState } from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import { getPublicWebsiteLocale } from '../i18n/publicWebsite';
import './Contact.css';

import { API_BASE } from '../config/api';

const text = {
  fa: {
    email: 'ارسال ایمیل',
    info: 'اطلاعات تماس',
    address: 'آدرس',
    phone: 'شماره تماس',
    form: 'فرم پیام',
    namePlaceholder: 'نام شما',
    phonePlaceholder: 'شماره تماس',
    emailPlaceholder: 'ایمیل',
    contactMessage: 'پیام تماس',
    suggestion: 'پیشنهاد',
    complaint: 'انتقاد / شکایت',
    messagePlaceholder: 'متن پیام',
    sending: 'در حال ارسال...',
    send: 'ارسال پیام',
    support: 'پشتیبانی',
    setup: 'خدمات راه‌اندازی',
    supportText: 'برای راهنمایی بیشتر می‌توانید با اداره مکتب تماس بگیرید.'
  },
  en: {
    email: 'Send email',
    info: 'Contact information',
    address: 'Address',
    phone: 'Phone',
    form: 'Message form',
    namePlaceholder: 'Your name',
    phonePlaceholder: 'Phone number',
    emailPlaceholder: 'Email',
    contactMessage: 'Contact message',
    suggestion: 'Suggestion',
    complaint: 'Complaint',
    messagePlaceholder: 'Message',
    sending: 'Sending...',
    send: 'Send message',
    support: 'Support',
    setup: 'Setup services',
    supportText: 'For more guidance, contact the school office.'
  },
  ps: {
    email: 'ایمیل ولېږئ',
    info: 'د اړیکې معلومات',
    address: 'پته',
    phone: 'د اړیکې شمېره',
    form: 'د پیغام فورم',
    namePlaceholder: 'ستاسو نوم',
    phonePlaceholder: 'د اړیکې شمېره',
    emailPlaceholder: 'ایمیل',
    contactMessage: 'د اړیکې پیغام',
    suggestion: 'وړاندیز',
    complaint: 'شکایت',
    messagePlaceholder: 'د پیغام متن',
    sending: 'لېږل کېږي...',
    send: 'پیغام ولېږئ',
    support: 'ملاتړ',
    setup: 'د تنظیم خدمتونه',
    supportText: 'د نورو لارښوونو لپاره له ادارې سره اړیکه ونیسئ.'
  }
};

export default function Contact() {
  const { settings, language } = useSiteSettings();
  const t = getPublicWebsiteLocale(language || settings?.language).contact || text[settings?.language || 'fa'] || text.fa;
  const [form, setForm] = useState({ name: '', phone: '', email: '', type: 'contact', message: '' });
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setStatus('لطفاً پیام خود را بنویسید.');
      return;
    }
    setSending(true);
    setStatus('');
    try {
      const endpoint = settings?.isSchoolWebsite
        ? `${API_BASE}/api/school-websites/contact`
        : `${API_BASE}/api/contact`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug: settings?.slug || '' })
      });
      const data = await res.json();
      if (!data?.success) {
        setStatus(data?.message || 'ارسال پیام ناموفق بود.');
        return;
      }
      setStatus('پیام شما ثبت شد.');
      setForm({ name: '', phone: '', email: '', type: 'contact', message: '' });
    } catch {
      setStatus('خطا در ارسال پیام.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="contact-page" dir={settings?.language === 'en' ? 'ltr' : 'rtl'}>
      <div className="contact-hero">
        <div>
          <h1>{settings?.contactTitle || 'ارتباط با ما'}</h1>
          <p>{settings?.contactText || 'برای دریافت پاسخ سریع، پیام خود را در فرم زیر ثبت کنید.'}</p>
        </div>
        <a className="contact-hero-btn" href={`mailto:${settings?.contactEmail || 'imanschool.official@gmail.com'}`}>
          {t.email}
        </a>
      </div>

      <div className="contact-grid">
        <div className="contact-card">
          <h3>{t.info}</h3>
          <div className="contact-item">
            <span>{t.address}</span>
            <strong>{settings?.contactAddress || 'کابل، ناحیه 5'}</strong>
          </div>
          <div className="contact-item">
            <span>{t.phone}</span>
            <strong>{settings?.contactPhone || '0702855557'}</strong>
          </div>
          <div className="contact-item">
            <span>{t.emailPlaceholder}</span>
            <strong>{settings?.contactEmail || 'imanschool.official@gmail.com'}</strong>
          </div>
        </div>

        <div className="contact-card">
          <h3>{t.form}</h3>
          <form className="contact-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder={t.namePlaceholder}
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
            />
            <input
              type="text"
              placeholder={t.phonePlaceholder}
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
            <input
              type="email"
              placeholder={t.emailPlaceholder}
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
            <select
              value={form.type}
              onChange={(e) => handleChange('type', e.target.value)}
            >
              <option value="contact">{t.contactMessage}</option>
              <option value="suggestion">{t.suggestion}</option>
              <option value="complaint">{t.complaint}</option>
            </select>
            <textarea
              rows="4"
              placeholder={t.messagePlaceholder}
              value={form.message}
              onChange={(e) => handleChange('message', e.target.value)}
            />
            <button type="submit" disabled={sending}>
              {sending ? t.sending : t.send}
            </button>
          </form>
          {status && <div className="contact-note">{status}</div>}
        </div>
      </div>

      <div className="contact-support" id="support">
        <h3>{t.support}</h3>
        <p>{t.setup}: {settings?.hoursText || 'تنظیم، آموزش و پشتیبانی'}</p>
        <p>{t.supportText}</p>
      </div>
    </section>
  );
}
