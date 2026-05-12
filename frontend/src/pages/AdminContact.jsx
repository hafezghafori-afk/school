import React, { useEffect, useMemo, useState } from 'react';
import './AdminContent.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const TYPE_LABELS = {
  demo: 'درخواست دمو',
  contact: 'پیام تماس',
  suggestion: 'پیشنهاد',
  complaint: 'انتقاد / شکایت'
};

export default function AdminContact() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/contact/admin`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItems(data.items || []);
        setMessage('');
      } else {
        setMessage(data?.message || 'خطا در دریافت پیام‌ها');
      }
    } catch {
      setMessage('خطا در اتصال به سرور');
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(item => {
      if (status !== 'all' && item.status !== status) return false;
      if (type !== 'all' && (item.type || 'contact') !== type) return false;
      if (!q) return true;
      const demo = item.demoDetails || {};
      const blob = `${item.name || ''} ${item.email || ''} ${item.phone || ''} ${item.message || ''} ${demo.schoolName || ''} ${demo.province || ''} ${demo.city || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query, status, type]);

  const markRead = async (id) => {
    try {
      await fetch(`${API_BASE}/api/contact/${id}/read`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() }
      });
      loadItems();
    } catch {
      setMessage('خطا در به‌روزرسانی پیام');
    }
  };

  const removeItem = async (id) => {
    if (!window.confirm('حذف این پیام؟')) return;
    try {
      await fetch(`${API_BASE}/api/contact/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      loadItems();
    } catch {
      setMessage('خطا در حذف پیام');
    }
  };

  return (
    <section className="admin-content-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <div className="admin-content-hero">
        <div>
          <h2>مرکز ارتباطات سیما</h2>
          <p>مدیریت درخواست‌های دمو، پیام‌های تماس، پیشنهادات و انتقادات ثبت‌شده.</p>
        </div>
      </div>

      <div className="admin-content-filters">
        <input
          type="text"
          placeholder="جستجو در پیام‌ها..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">همه</option>
          <option value="new">خوانده‌نشده</option>
          <option value="read">خوانده‌شده</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">همه نوع‌ها</option>
          <option value="demo">درخواست‌های دمو</option>
          <option value="contact">پیام‌های تماس</option>
          <option value="suggestion">پیشنهادات</option>
          <option value="complaint">انتقادات / شکایات</option>
        </select>
      </div>

      {message && <div className="form-message">{message}</div>}

      <div className="admin-content-list">
        {filtered.map(item => (
          <div key={item._id} className="admin-content-item">
            <div>
              <strong>{item.name || 'بدون نام'}</strong>
              <span>{TYPE_LABELS[item.type || 'contact'] || 'پیام تماس'}</span>
              <span>{item.email || 'بدون ایمیل'}</span>
              <span>{item.phone || 'بدون شماره'}</span>
              {(item.type || 'contact') === 'demo' && item.demoDetails && (
                <div className="admin-content-meta">
                  <span>مکتب: {item.demoDetails.schoolName || '---'}</span>
                  <span>مسئول: {item.demoDetails.responsibleName || item.name || '---'}</span>
                  <span>ولایت/شهر: {item.demoDetails.province || '---'} / {item.demoDetails.city || '---'}</span>
                  <span>تعداد شاگردان: {item.demoDetails.studentCount || '---'}</span>
                  <span>نوع مرکز: {item.demoDetails.centerType || '---'}</span>
                  <span>بخش‌ها: {(item.demoDetails.neededModules || []).join('، ') || '---'}</span>
                </div>
              )}
              <p>{item.message}</p>
            </div>
            <div className="admin-content-actions">
              {item.status !== 'read' && (
                <button type="button" onClick={() => markRead(item._id)}>علامت‌گذاری خوانده‌شده</button>
              )}
              <button type="button" className="danger" onClick={() => removeItem(item._id)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
