import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';
import useSiteSettings from '../hooks/useSiteSettings';
import './DemoRequest.css';

const moduleOptions = [
  'مدیریت شاگردان',
  'مدیریت فیس و رسید',
  'حاضری',
  'امتحانات و کارنامه',
  'تقسیم اوقات',
  'گزارش‌ها'
];

const initialForm = {
  schoolName: '',
  responsibleName: '',
  phone: '',
  email: '',
  province: '',
  city: '',
  studentCount: '',
  centerType: 'مکتب خصوصی',
  neededModules: ['مدیریت شاگردان', 'مدیریت فیس و رسید'],
  message: ''
};

export default function DemoRequest() {
  const { settings } = useSiteSettings();
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ tone: '', text: '' });
  const [sending, setSending] = useState(false);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleModule = (item) => {
    setForm((prev) => {
      const exists = prev.neededModules.includes(item);
      return {
        ...prev,
        neededModules: exists
          ? prev.neededModules.filter((module) => module !== item)
          : [...prev.neededModules, item]
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.schoolName.trim() || !form.responsibleName.trim() || !form.phone.trim()) {
      setStatus({ tone: 'error', text: 'نام مکتب، نام مسئول و شماره تماس الزامی است.' });
      return;
    }

    setSending(true);
    setStatus({ tone: '', text: '' });
    try {
      const message = form.message.trim()
        || `درخواست دمو برای ${form.schoolName} با حدود ${form.studentCount || 'نامشخص'} شاگرد.`;
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'demo',
          name: form.responsibleName,
          phone: form.phone,
          email: form.email,
          message,
          demoDetails: {
            schoolName: form.schoolName,
            responsibleName: form.responsibleName,
            province: form.province,
            city: form.city,
            studentCount: form.studentCount,
            centerType: form.centerType,
            neededModules: form.neededModules
          }
        })
      });
      const data = await res.json();
      if (!data?.success) {
        setStatus({ tone: 'error', text: data?.message || 'ثبت درخواست دمو ناموفق بود.' });
        return;
      }
      setStatus({
        tone: 'success',
        text: data?.message || 'درخواست شما ثبت شد. تیم سیما برای معرفی سیستم، قیمت و راه‌اندازی با شما تماس می‌گیرد.'
      });
      setForm(initialForm);
    } catch {
      setStatus({ tone: 'error', text: 'خطا در ارتباط با سرور.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="demo-request-page" dir="rtl">
      <div className="demo-hero">
        <div>
          <span>درخواست دمو سیما</span>
          <h1>سیستم را برای مکتب خود ببینید، بعد تصمیم بگیرید</h1>
          <p>
            معلومات مکتب را ثبت کنید تا تیم سیما برای معرفی سیستم، قیمت، راه‌اندازی و آموزش کاربران با شما تماس بگیرد.
          </p>
        </div>
        <div className="demo-contact-card">
          <span>تماس مستقیم</span>
          <strong>{settings?.contactPhone || '0702855557'}</strong>
          <small>{settings?.contactEmail || 'imanschool.official@gmail.com'}</small>
        </div>
      </div>

      <div className="demo-layout">
        <form className="demo-form" onSubmit={handleSubmit}>
          <div className="demo-form-grid">
            <label>
              <span>نام مکتب</span>
              <input value={form.schoolName} onChange={(e) => setField('schoolName', e.target.value)} />
            </label>
            <label>
              <span>نام مسئول / مدیر</span>
              <input value={form.responsibleName} onChange={(e) => setField('responsibleName', e.target.value)} />
            </label>
            <label>
              <span>شماره تماس</span>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </label>
            <label>
              <span>ایمیل</span>
              <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </label>
            <label>
              <span>ولایت</span>
              <input value={form.province} onChange={(e) => setField('province', e.target.value)} />
            </label>
            <label>
              <span>شهر / ناحیه</span>
              <input value={form.city} onChange={(e) => setField('city', e.target.value)} />
            </label>
            <label>
              <span>تعداد تقریبی شاگردان</span>
              <input value={form.studentCount} onChange={(e) => setField('studentCount', e.target.value)} />
            </label>
            <label>
              <span>نوع مرکز</span>
              <select value={form.centerType} onChange={(e) => setField('centerType', e.target.value)}>
                <option>مکتب خصوصی</option>
                <option>مکتب دخترانه</option>
                <option>مکتب پسرانه</option>
                <option>آموزشگاه</option>
                <option>مرکز کورس آموزشی</option>
              </select>
            </label>
          </div>

          <div className="demo-module-box">
            <span>بخش‌های مورد نیاز</span>
            <div>
              {moduleOptions.map((item) => (
                <label key={item} className="demo-check">
                  <input
                    type="checkbox"
                    checked={form.neededModules.includes(item)}
                    onChange={() => toggleModule(item)}
                  />
                  <em>{item}</em>
                </label>
              ))}
            </div>
          </div>

          <label className="demo-message">
            <span>پیام کوتاه</span>
            <textarea rows="4" value={form.message} onChange={(e) => setField('message', e.target.value)} />
          </label>

          <div className="demo-actions">
            <button type="submit" disabled={sending}>
              {sending ? 'در حال ثبت...' : 'ثبت درخواست دمو'}
            </button>
            <Link to="/contact">تماس با ما</Link>
          </div>
          {status.text && <div className={`demo-status ${status.tone}`}>{status.text}</div>}
        </form>

        <aside className="demo-side">
          <h2>در دمو چه بررسی می‌شود؟</h2>
          <ul>
            <li>ثبت شاگرد، صنف و سال تعلیمی</li>
            <li>فیس، رسید، تخفیف و باقیات</li>
            <li>حاضری شاگردان و کارمندان</li>
            <li>امتحانات، نمرات و کارنامه</li>
            <li>تقسیم اوقات و گزارش‌ها</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
