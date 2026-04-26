import React, { useEffect, useMemo, useState } from 'react';
import './MyHomework.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const getCompatCourseId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

const getCourseClassId = (item = {}) => (
  String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim()
);

const getScopeValue = (item = {}) => (
  getCourseClassId(item) || getCompatCourseId(item)
);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || ''
);

const normalizeCourseOptions = (items = []) => items
  .map((item) => ({
    ...item,
    classId: String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim(),
    courseId: String(item?.courseId || item?._id || '').trim(),
    schoolClass: item?.schoolClass || null
  }))
  .filter((item) => item.classId);

export default function MyHomework() {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [homeworks, setHomeworks] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [textMap, setTextMap] = useState({});
  const [fileMap, setFileMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const userId = localStorage.getItem('userId');

  const loadCourses = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE}/api/education/my-courses`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      const items = normalizeCourseOptions(data?.items || []);
      setCourses(items);
      if (!selectedCourse && items.length) {
        setSelectedCourse(getScopeValue(items[0]));
      }
    } catch (err) {
      setCourses([]);
    }
  };

  const loadHomeworks = async (courseId) => {
    if (!courseId) return;
    setLoading(true);
    setError('');
    try {
      const selectedItem = courses.find((item) => String(getScopeValue(item)) === String(courseId)) || null;
      const classId = getCourseClassId(selectedItem);
      const homeworkRoute = classId ? `/api/homeworks/class/${classId}` : '';
      const submissionQuery = classId ? `classId=${encodeURIComponent(classId)}` : '';

      if (!homeworkRoute || !submissionQuery) {
        setError('This class is missing a canonical reference.');
        setHomeworks([]);
        setSubmissions({});
        return;
      }

      const [hwRes, subRes] = await Promise.all([
        fetch(`${API_BASE}${homeworkRoute}`, {
          headers: { ...getAuthHeaders() }
        }),
        fetch(`${API_BASE}/api/homeworks/my/submissions?${submissionQuery}`, {
          headers: { ...getAuthHeaders() }
        })
      ]);
      const hwData = await hwRes.json();
      const subData = await subRes.json();
      const submissionMap = {};
      (subData?.items || []).forEach((item) => {
        const hwId = item?.homework?._id || item?.homework;
        if (hwId) submissionMap[hwId] = item;
      });
      setHomeworks(hwData?.items || []);
      setSubmissions(submissionMap);
    } catch (err) {
      setError('خطا در دریافت کارخانگی');
      setHomeworks([]);
      setSubmissions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    loadHomeworks(selectedCourse);
  }, [selectedCourse]);

  const handleSubmit = async (homeworkId) => {
    setError('');
    const text = (textMap[homeworkId] || '').trim();
    const file = fileMap[homeworkId];
    if (!text || !file) {
      setError('متن و فایل هر دو الزامی است.');
      return;
    }
    try {
      const form = new FormData();
      form.append('text', text);
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/homeworks/${homeworkId}/submit`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: form
      });
      const data = await res.json();
      if (!data?.success) {
        setError(data?.message || 'ثبت تحویل ناموفق بود.');
        return;
      }
      await loadHomeworks(selectedCourse);
      setTextMap(prev => ({ ...prev, [homeworkId]: '' }));
      setFileMap(prev => ({ ...prev, [homeworkId]: null }));
    } catch (err) {
      setError('خطا در ارسال کارخانگی');
    }
  };

  const courseOptions = useMemo(() => courses.map((course) => (
    <option key={getScopeValue(course) || course._id} value={getScopeValue(course) || course._id}>{getCourseLabel(course)}</option>
  )), [courses]);

  return (
    <div className="myhomework-page">
      <div className="myhomework-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>کارخانگی من</h2>
        <p>فایل و متن کارخانگی را ارسال کنید. وضعیت هر کارخانگی در همین صفحه نمایش داده می‌شود.</p>

        <div className="myhomework-controls">
          <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
            {courseOptions}
          </select>
        </div>

        {error && <div className="myhomework-empty">{error}</div>}
        {loading && <div className="myhomework-empty">در حال دریافت...</div>}

        {!loading && !homeworks.length && (
          <div className="myhomework-empty">کارخانگی برای این صنف ثبت نشده است.</div>
        )}

        <div className="myhomework-list">
          {homeworks.map((item) => {
            const sub = submissions[item._id];
            return (
              <div className="myhomework-item" key={item._id}>
                <div>
                  <strong>{item.title}</strong>
                  {item.dueDate && <span className="meta">موعد: {toDate(item.dueDate)}</span>}
                  {item.maxScore && <span className="meta">حداکثر نمره: {item.maxScore}</span>}
                </div>
                {item.description && <p>{item.description}</p>}
                {item.attachment && (
                  <a href={`${API_BASE}/${item.attachment}`} target="_blank" rel="noreferrer">
                    دانلود فایل کارخانگی
                  </a>
                )}

                {sub ? (
                  <div className="submission-status">
                    <div>آخرین تحویل: {toDate(sub.submittedAt)}</div>
                    {sub.file && (
                      <a href={`${API_BASE}/${sub.file}`} target="_blank" rel="noreferrer">
                        فایل ارسالی شما
                      </a>
                    )}
                    {typeof sub.score === 'number' && (
                      <div>نمره: {sub.score}</div>
                    )}
                    {sub.feedback && <div>بازخورد: {sub.feedback}</div>}
                  </div>
                ) : (
                  <div className="myhomework-submit">
                    <textarea
                      rows="3"
                      placeholder="توضیح یا متن کارخانگی را اینجا بنویسید"
                      value={textMap[item._id] || ''}
                      onChange={e => setTextMap(prev => ({ ...prev, [item._id]: e.target.value }))}
                    />
                    <input
                      type="file"
                      onChange={(e) => setFileMap(prev => ({ ...prev, [item._id]: e.target.files?.[0] || null }))}
                    />
                    <button type="button" onClick={() => handleSubmit(item._id)}>ارسال کارخانگی</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
