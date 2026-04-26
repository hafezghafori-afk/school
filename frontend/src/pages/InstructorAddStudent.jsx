import React, { useState } from 'react';
import './InstructorAddStudent.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function InstructorAddStudent() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    grade: '',
    subject: ''
  });
  const [message, setMessage] = useState('');

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/api/users/create-student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ایجاد شاگرد ناموفق بود.');
        return;
      }

      setMessage('شاگرد جدید با موفقیت ایجاد شد.');
      setForm({ name: '', email: '', password: '', grade: '', subject: '' });
    } catch {
      setMessage('در زمان ایجاد شاگرد خطا رخ داد.');
    }
  };

  return (
    <div className="instudent-page">
      <div className="instudent-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <h2>ایجاد شاگرد جدید</h2>
        <p>اطلاعات شاگرد را کامل کنید تا حساب او برای استاد و مدیریت قابل استفاده شود.</p>

        <form onSubmit={handleSubmit}>
          <input
            placeholder="نام کامل"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
          />
          <input
            type="email"
            placeholder="ایمیل"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
          />
          <input
            type="password"
            placeholder="رمز عبور"
            value={form.password}
            onChange={(event) => updateField('password', event.target.value)}
          />
          <input
            placeholder="صنف یا پایه"
            value={form.grade}
            onChange={(event) => updateField('grade', event.target.value)}
          />
          <input
            placeholder="مضمون"
            value={form.subject}
            onChange={(event) => updateField('subject', event.target.value)}
          />
          <button type="submit">ثبت شاگرد</button>
        </form>

        {message && <div className="instudent-message">{message}</div>}
      </div>
    </div>
  );
}
