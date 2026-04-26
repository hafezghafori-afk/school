import React, { useEffect, useState } from 'react';
import './AdminContent.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const emptyForm = {
  title: '',
  category: 'news',
  summary: '',
  content: '',
  imageUrl: '',
  publishedAt: '',
  enabled: true
};

const resolveImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

export default function AdminNews() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/news/admin`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItems(data.items || []);
        setMessage('');
      } else {
        setMessage(data?.message || 'خطا در دریافت خبرها');
      }
    } catch {
      setMessage('خطا در اتصال به سرور');
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${API_BASE}/api/news/upload`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'آپلود تصویر ناموفق بود');
        return;
      }
      handleChange('imageUrl', data.url || '');
      setMessage('تصویر آپلود شد.');
    } catch {
      setMessage('خطا در آپلود تصویر');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${API_BASE}/api/news/${editingId}` : `${API_BASE}/api/news`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ذخیره خبر ناموفق بود');
        return;
      }
      setMessage(editingId ? 'خبر به‌روزرسانی شد' : 'خبر جدید ثبت شد');
      setForm(emptyForm);
      setEditingId('');
      loadItems();
    } catch {
      setMessage('خطا در ذخیره خبر');
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setForm({
      title: item.title || '',
      category: item.category || 'news',
      summary: item.summary || '',
      content: item.content || '',
      imageUrl: item.imageUrl || '',
      publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : '',
      enabled: item.enabled !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeItem = async (id) => {
    if (!window.confirm('حذف این خبر؟')) return;
    try {
      const res = await fetch(`${API_BASE}/api/news/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'حذف خبر ناموفق بود');
        return;
      }
      loadItems();
    } catch {
      setMessage('خطا در حذف خبر');
    }
  };

  return (
    <section className="admin-content-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <div className="admin-content-hero">
        <div>
          <h2>مدیریت خبرها و اعلانات</h2>
          <p>ثبت، ویرایش و حذف خبرها.</p>
        </div>
      </div>

      <form className="admin-content-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div>
            <label>عنوان</label>
            <input value={form.title} onChange={(e) => handleChange('title', e.target.value)} required />
          </div>
          <div>
            <label>دسته‌بندی</label>
            <select value={form.category} onChange={(e) => handleChange('category', e.target.value)}>
              <option value="news">خبر</option>
              <option value="announcement">اعلان</option>
              <option value="event">رویداد</option>
            </select>
          </div>
          <div>
            <label>تاریخ نشر</label>
            <input type="date" value={form.publishedAt} onChange={(e) => handleChange('publishedAt', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>آپلود تصویر</label>
            <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0])} />
            {uploading && <div className="form-message">در حال آپلود...</div>}
          </div>
          <div>
            <label>یا لینک تصویر</label>
            <input value={form.imageUrl} onChange={(e) => handleChange('imageUrl', e.target.value)} placeholder="https://... ?? /uploads/..." />
          </div>
        </div>
        {form.imageUrl && (
          <div className="form-preview">
            <img src={resolveImage(form.imageUrl)} alt="preview" />
            <button type="button" className="ghost" onClick={() => handleChange('imageUrl', '')}>حذف تصویر</button>
          </div>
        )}
        <div className="form-row">
          <div>
            <label>خلاصه</label>
            <textarea rows="3" value={form.summary} onChange={(e) => handleChange('summary', e.target.value)} />
          </div>
          <div>
            <label>متن کامل</label>
            <textarea rows="3" value={form.content} onChange={(e) => handleChange('content', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-switch">
            <label>
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => handleChange('enabled', e.target.checked)}
              />
              انتشار فعال
            </label>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit">{editingId ? 'به‌روزرسانی خبر' : 'ثبت خبر'}</button>
          {editingId && (
            <button type="button" className="ghost" onClick={() => {
              setEditingId('');
              setForm(emptyForm);
            }}>
              لغو
            </button>
          )}
        </div>
        {message && <div className="form-message">{message}</div>}
      </form>

      <div className="admin-content-list">
        {items.map(item => (
          <div key={item._id} className="admin-content-item">
            <div>
              <strong>{item.title}</strong>
              <span>{item.category}</span>
            </div>
            <div className="admin-content-actions">
              <button type="button" onClick={() => startEdit(item)}>ویرایش</button>
              <button type="button" className="danger" onClick={() => removeItem(item._id)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
