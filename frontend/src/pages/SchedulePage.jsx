import React, { useEffect, useState } from 'react';
import './SchedulePage.css';

import { API_BASE } from '../config/api';
import StudentTimetableView from './StudentTimetableView';
import TeacherTimetableView from './TeacherTimetableView';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getScheduleClassLabel = (item) => item?.schoolClass?.title || item?.course?.title || 'صنف';

export default function SchedulePage() {
  const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
  const [date, setDate] = useState(todayStr());
  const [view, setView] = useState('day');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');

  if (role === 'student') {
    return <StudentTimetableView />;
  }

  if (['instructor', 'teacher', 'professor'].includes(role)) {
    return <TeacherTimetableView />;
  }

  const loadSchedule = async (targetDate) => {
    setMessage('');
    try {
      const url = view === 'week'
        ? `${API_BASE}/api/schedules/week?date=${targetDate}`
        : `${API_BASE}/api/schedules/by-date?date=${targetDate}`;
      const res = await fetch(url, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت تقسیم اوقات');
        setItems([]);
        return;
      }
      setItems(data.items || []);
    } catch {
      setMessage('خطا در ارتباط با سرور');
      setItems([]);
    }
  };

  useEffect(() => {
    loadSchedule(date);
  }, [date, view]);

  return (
    <div className="schedule-page">
      <div className="schedule-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>تقسیم اوقات</h2>
        <p>برنامه روزانه صنف‌ها، مضمون‌ها و استادان.</p>

        <div className="schedule-controls">
          <label>تاریخ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <div className="schedule-toggle">
            <button
              type="button"
              className={view === 'day' ? 'active' : ''}
              onClick={() => setView('day')}
            >
              روزانه
            </button>
            <button
              type="button"
              className={view === 'week' ? 'active' : ''}
              onClick={() => setView('week')}
            >
              هفتگی
            </button>
          </div>
        </div>

        {message && <div className="schedule-message">{message}</div>}
        {!message && !items.length && (
          <div className="schedule-empty">برنامه‌ای برای این تاریخ ثبت نشده است.</div>
        )}

        <div className="schedule-list">
          {items.map(item => (
            <div key={item._id} className="schedule-item">
              <div>
                <strong>{item.subject}</strong>
                <span>{getScheduleClassLabel(item)}</span>
              </div>
              <div>
                <span>{item.instructor?.name || 'استاد'}</span>
                <span>{item.startTime} - {item.endTime}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
