import React, { useEffect, useState } from 'react';
import './AdminInstructorReport.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function AdminInstructorReport() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [logs, setLogs] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        headers: { ...getAuthHeaders() }
      });
      const json = await res.json();
      const items = (json.items || []).filter(
        (user) => user.role === 'instructor' || user.role === 'admin'
      );
      setUsers(items);
      if (!userId && items.length) {
        setUserId(items[0]._id);
      }
    } catch {
      setUsers([]);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleFetch = async () => {
    if (!userId) return;

    setMessage('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/logs?actor=${userId}`, {
        headers: { ...getAuthHeaders() }
      });
      const json = await res.json();
      if (!json?.success) {
        setMessage(json?.message || 'گزارش فعالیت پیدا نشد.');
        setLogs([]);
        return;
      }
      setLogs(json.items || []);
    } catch {
      setMessage('در زمان دریافت گزارش خطا رخ داد.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ireport-page">
      <div className="ireport-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <h2>گزارش فعالیت استاد</h2>
        <p>فعالیت‌های استادان و ادمین‌ها را بر اساس لاگ سیستمی مشاهده و بررسی کنید.</p>

        <div className="ireport-controls">
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            {users.map((user) => (
              <option key={user._id} value={user._id}>
                {user.name} - {user.email}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleFetch}>دریافت گزارش</button>
        </div>

        {loading && <div className="ireport-message">در حال دریافت گزارش...</div>}
        {message && <div className="ireport-message">{message}</div>}

        <div className="ireport-list">
          {!logs.length && !message && (
            <div className="ireport-message">هنوز گزارشی برای این کاربر ثبت نشده است.</div>
          )}
          {logs.map((log) => (
            <div key={log._id} className="ireport-item">
              <span>{log.action}</span>
              <span>{formatAfghanDate(log.createdAt, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) || '-'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
