import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './AfghanSchoolManagement.css';

import { API_BASE } from '../config/api';

export default function Register() {
  const [form, setForm] = useState({
    studentName: '',
    fatherName: '',
    motherName: '',
    gender: 'male',
    birthDate: '',
    grade: '',
    phone: '',
    email: '',
    address: '',
    previousSchool: '',
    emergencyPhone: '',
    notes: ''
  });
  const [files, setFiles] = useState({
    idCard: null,
    birthCert: null,
    reportCard: null,
    photo: null
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleFile = (key, file) => {
    setFiles(prev => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        formData.append(key, value || '');
      });
      Object.entries(files).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });

      const res = await fetch(`${API_BASE}/api/enrollments`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ثبت درخواست ناموفق بود.');
        return;
      }
      setMessage(`درخواست شما با موفقیت ثبت شد. شماره پیگیری شما: ${data?.enrollment?.registrationId || '---'}`);
      setForm({
        studentName: '',
        fatherName: '',
        motherName: '',
        gender: 'male',
        birthDate: '',
        grade: '',
        phone: '',
        email: '',
        address: '',
        previousSchool: '',
        emergencyPhone: '',
        notes: ''
      });
      setFiles({ idCard: null, birthCert: null, reportCard: null, photo: null });
    } catch {
      setMessage('خطا در اتصال به سرور');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="school-management" style={{ minHeight: '100vh' }}>
      <form className="school-form" onSubmit={handleSubmit} style={{ maxWidth: 700, margin: '40px auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
        <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: 8 }}>فرم ثبت‌نام آنلاین</h2>
        <p className="form-subtitle" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>اطلاعات شاگرد را کامل و دقیق وارد کنید.</p>

        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>مشخصات شاگرد</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>نام شاگرد</label>
              <input type="text" required value={form.studentName} onChange={(e) => handleChange('studentName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>نام پدر</label>
              <input type="text" value={form.fatherName} onChange={(e) => handleChange('fatherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>نام مادر</label>
              <input type="text" value={form.motherName} onChange={(e) => handleChange('motherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label>جنسیت</label>
              <select value={form.gender} onChange={(e) => handleChange('gender', e.target.value)}>
                <option value="male">مرد</option>
                <option value="female">زن</option>
                <option value="other">دیگر</option>
              </select>
            </div>
            <div className="form-group">
              <label>تاریخ تولد</label>
              <input type="date" value={form.birthDate} onChange={(e) => handleChange('birthDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label>پایه تحصیلی</label>
              <input type="text" value={form.grade} onChange={(e) => handleChange('grade', e.target.value)} placeholder="مثال: پایه 7" />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>تماس و آدرس</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>شماره تماس</label>
              <input type="text" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label>شماره اضطراری</label>
              <input type="text" value={form.emergencyPhone} onChange={(e) => handleChange('emergencyPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label>ایمیل</label>
              <input type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label>مدرسه قبلی</label>
              <input type="text" value={form.previousSchool} onChange={(e) => handleChange('previousSchool', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label>آدرس</label>
              <input type="text" value={form.address} onChange={(e) => handleChange('address', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>اسناد مورد نیاز</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>تذکره/شناسنامه (کارت هویت) <span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG, PDF)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => handleFile('idCard', e.target.files?.[0])} />
            </div>
            <div className="form-group">
              <label>کارنامه قبلی <span style={{ fontSize: 12, color: '#888' }}>(PDF)</span></label>
              <input type="file" accept=".pdf" onChange={(e) => handleFile('reportCard', e.target.files?.[0])} />
            </div>
            <div className="form-group">
              <label>عکس پرسنلی <span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png" onChange={(e) => handleFile('photo', e.target.files?.[0])} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>توضیحات</h3>
          <div className="form-group full-width">
            <textarea
              rows="3"
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="توضیحات اضافی"
              style={{ width: '100%', borderRadius: 6, border: '1px solid #ddd', padding: 10 }}
            />
          </div>
        </div>

        <button type="submit" className="add-btn" style={{ width: '100%', marginTop: 16 }} disabled={loading}>
          {loading ? 'در حال ثبت...' : 'ثبت درخواست ثبت‌نام'}
        </button>
        {message && <div className="form-message" style={{ marginTop: 16, color: message.includes('موفقیت') ? '#28a745' : '#e74c3c', textAlign: 'center', fontWeight: 500 }}>{message}</div>}
        <p className="form-subtitle" style={{ textAlign: 'center', marginTop: 18 }}>
          <span style={{ fontWeight: 500, color: '#555' }}>قبلاً ثبت‌نام کرده‌اید؟</span>
          <Link to="/login" style={{
            marginRight: 8,
            background: '#3498db',
            color: 'white',
            padding: '6px 18px',
            borderRadius: 6,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 15,
            transition: 'background 0.2s',
            marginLeft: 8
          }}
            onMouseOver={e => e.target.style.background = '#217dbb'}
            onMouseOut={e => e.target.style.background = '#3498db'}
          >
            ورود
          </Link>
        </p>
      </form>
    </div>
  );
}
