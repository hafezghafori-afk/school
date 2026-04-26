import React, { useEffect, useState } from 'react';
import './AdminContent.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const emptyForm = {
  title: '',
  tag: '',
  imageUrl: '',
  description: '',
  enabled: true
};

const resolveImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

export default function AdminGallery() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState('');
  const [uploading, setUploading] = useState(false);

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/gallery/admin`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) {
        setItems(data.items || []);
        setMessage('');
      } else {
        setMessage(data?.message || 'خطا در دریافت گالری');
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
      const res = await fetch(`${API_BASE}/api/gallery/upload`, {
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

  const uploadMultiple = async (files) => {
    if (!files?.length) return;
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await uploadImage(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `${API_BASE}/api/gallery/${editingId}` : `${API_BASE}/api/gallery`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ذخیره تصویر ناموفق بود');
        return;
      }
      setMessage(editingId ? 'آیتم گالری به‌روزرسانی شد' : 'آیتم گالری ثبت شد');
      setForm(emptyForm);
      setEditingId('');
      loadItems();
    } catch {
      setMessage('خطا در ذخیره گالری');
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setForm({
      title: item.title || '',
      tag: item.tag || '',
      imageUrl: item.imageUrl || '',
      description: item.description || '',
      enabled: item.enabled !== false
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeItem = async (id) => {
    if (!window.confirm('حذف این تصویر؟')) return;
    try {
      const res = await fetch(`${API_BASE}/api/gallery/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'حذف تصویر ناموفق بود');
        return;
      }
      loadItems();
    } catch {
      setMessage('خطا در حذف تصویر');
    }
  };

  return (
    <section className="admin-content-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <div className="admin-content-hero">
        <div>
          <h2>مدیریت گالری</h2>
          <p>افزودن، ویرایش و حذف تصاویر مدرسه.</p>
        </div>
      </div>

      <form className="admin-content-form" onSubmit={handleSubmit}>
        <div className="form-row">
          <div>
            <label>عنوان</label>
            <input value={form.title} onChange={(e) => handleChange('title', e.target.value)} required />
          </div>
          <div>
            <label>برچسب</label>
            <input value={form.tag} onChange={(e) => handleChange('tag', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div>
            <label>آپلود تصویر</label>
            <input type="file" accept="image/*" onChange={(e) => uploadImage(e.target.files?.[0])} />
            {uploading && <div className="form-message">در حال آپلود...</div>}
          </div>
          <div>
            <label>آپلود چند تصویر</label>
            <input type="file" accept="image/*" multiple onChange={(e) => uploadMultiple(Array.from(e.target.files || []))} />
          </div>
        </div>
        <div>
          <label>یا لینک تصویر</label>
          <input value={form.imageUrl} onChange={(e) => handleChange('imageUrl', e.target.value)} placeholder="https://... ?? /uploads/..." required />
        </div>
        {form.imageUrl && (
          <div className="form-preview">
            <img src={resolveImage(form.imageUrl)} alt="preview" />
            <button type="button" className="ghost" onClick={() => handleChange('imageUrl', '')}>حذف تصویر</button>
          </div>
        )}
        <div>
          <label>توضیحات</label>
          <textarea rows="3" value={form.description} onChange={(e) => handleChange('description', e.target.value)} />
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
          <button type="submit">{editingId ? 'به‌روزرسانی تصویر' : 'ثبت تصویر'}</button>
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
              <span>{item.tag || 'بدون برچسب'}</span>
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
