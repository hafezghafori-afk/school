import React, { useState } from 'react';
import './AddCourse.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AddCourse() {
  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    grade: '',
    subject: '',
    video: null,
    pdf: null
  });
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const body = new FormData();
      body.append('title', form.title);
      body.append('description', form.description);
      body.append('price', form.price || 0);
      body.append('grade', form.grade);
      body.append('subject', form.subject);
      if (form.video) body.append('video', form.video);
      if (form.pdf) body.append('pdf', form.pdf);

      const res = await fetch(`${API_BASE}/api/courses/add`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ثبت صنف ناموفق بود.');
        return;
      }
      setMessage('صنف با موفقیت ثبت شد.');
      setForm({ title: '', description: '', price: '', grade: '', subject: '', video: null, pdf: null });
    } catch {
      setMessage('خطا در ثبت صنف');
    }
  };

  return (
    <div className="addcourse-page">
      <div className="addcourse-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>ایجاد صنف جدید</h2>
        <p>اطلاعات صنف را تکمیل کنید.</p>
        <form onSubmit={handleSubmit}>
          <label>عنوان صنف</label>
          <input value={form.title} onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))} />
          <label>شرح</label>
          <textarea value={form.description} onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))} />
          <label>قیمت</label>
          <input type="number" value={form.price} onChange={(e) => setForm(prev => ({ ...prev, price: e.target.value }))} />
          <label>پایه/صنف</label>
          <input value={form.grade} onChange={(e) => setForm(prev => ({ ...prev, grade: e.target.value }))} />
          <label>مضمون</label>
          <input value={form.subject} onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))} />
          <label>ویدیو</label>
          <input type="file" onChange={(e) => setForm(prev => ({ ...prev, video: e.target.files?.[0] || null }))} />
          <label>PDF</label>
          <input type="file" onChange={(e) => setForm(prev => ({ ...prev, pdf: e.target.files?.[0] || null }))} />
          <button type="submit">ثبت صنف</button>
          {message && <div className="addcourse-message">{message}</div>}
        </form>
      </div>
    </div>
  );
}
