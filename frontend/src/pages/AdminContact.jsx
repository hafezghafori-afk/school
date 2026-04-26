import React, { useEffect, useMemo, useState } from 'react';
import './AdminContent.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AdminContact() {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

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
      if (!q) return true;
      const blob = `${item.name || ''} ${item.email || ''} ${item.phone || ''} ${item.message || ''}`.toLowerCase();
      return blob.includes(q);
    });
  }, [items, query, status]);

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
          <h2>پیام‌های تماس</h2>
          <p>مدیریت پیام‌های ثبت‌شده توسط کاربران.</p>
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
      </div>

      {message && <div className="form-message">{message}</div>}

      <div className="admin-content-list">
        {filtered.map(item => (
          <div key={item._id} className="admin-content-item">
            <div>
              <strong>{item.name || 'بدون نام'}</strong>
              <span>{item.email || 'بدون ایمیل'}</span>
              <span>{item.phone || 'بدون شماره'}</span>
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
