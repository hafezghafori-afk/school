import React, { useState } from 'react';
import useSiteSettings from '../hooks/useSiteSettings';
import './Contact.css';

import { API_BASE } from '../config/api';

export default function Contact() {
  const { settings } = useSiteSettings();
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
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
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data?.success) {
        setStatus(data?.message || 'ارسال پیام ناموفق بود.');
        return;
      }
      setStatus('پیام شما ثبت شد.');
      setForm({ name: '', phone: '', email: '', message: '' });
    } catch {
      setStatus('خطا در ارسال پیام.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="contact-page">
      <div className="contact-hero">
        <div>
          <h1>ارتباط با ما</h1>
          <p>برای دریافت پاسخ سریع، پیام خود را در فرم زیر ثبت کنید.</p>
        </div>
        <a className="contact-hero-btn" href={`mailto:${settings?.contactEmail || 'imanschool.official@gmail.com'}`}>
          ارسال ایمیل
        </a>
      </div>

      <div className="contact-grid">
        <div className="contact-card">
          <h3>اطلاعات تماس</h3>
          <div className="contact-item">
            <span>آدرس</span>
            <strong>{settings?.contactAddress || 'کابل، ناحیه 5'}</strong>
          </div>
          <div className="contact-item">
            <span>شماره تماس</span>
            <strong>{settings?.contactPhone || '0702855557'}</strong>
          </div>
          <div className="contact-item">
            <span>ایمیل</span>
            <strong>{settings?.contactEmail || 'imanschool.official@gmail.com'}</strong>
          </div>
        </div>

        <div className="contact-card">
          <h3>فرم پیام</h3>
          <form className="contact-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="نام شما"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
            />
            <input
              type="text"
              placeholder="شماره تماس"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
            <input
              type="email"
              placeholder="ایمیل"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
            <textarea
              rows="4"
              placeholder="متن پیام"
              value={form.message}
              onChange={(e) => handleChange('message', e.target.value)}
            />
            <button type="submit" disabled={sending}>
              {sending ? 'در حال ارسال...' : 'ارسال پیام'}
            </button>
          </form>
          {status && <div className="contact-note">{status}</div>}
        </div>
      </div>

      <div className="contact-support" id="support">
        <h3>پشتیبانی</h3>
        <p>ساعات کاری: {settings?.hoursText || 'شنبه تا پنج‌شنبه 08:00 - 17:00'}</p>
        <p>برای راهنمایی بیشتر می‌توانید با تیم پشتیبانی تماس بگیرید.</p>
      </div>
    </section>
  );
}
