import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CourseList.css';

import { API_BASE } from '../config/api';

const getCourseTargetId = (item = {}) => (
  String(item?.classId || item?.id || item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

export default function CourseList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadCourses = async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (category) params.set('category', category);
      const res = await fetch(`${API_BASE}/api/education/public-school-classes?${params.toString()}`);
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت صنف‌ها');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setMessage('خطا در دریافت صنف‌ها');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const categories = useMemo(() => {
    const set = new Set();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  const handleSearch = (e) => {
    e.preventDefault();
    loadCourses();
  };

  return (
    <section className="courses-page">
      <div className="card-back">
        <button type="button" onClick={() => window.history.back()}>بازگشت</button>
      </div>
      <div className="courses-hero">
        <div>
          <h2>صنف‌ها و مضامین</h2>
          <p>دوره مورد نظر را انتخاب کنید و جزئیات آن را ببینید.</p>
        </div>
        <form className="courses-search" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="جستجو بر اساس نام صنف یا مضمون"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit">جستجو</button>
        </form>
      </div>

      <div className="grade-card" style={{ marginBottom: 18 }}>
        <div className="sections">
          <span>فیلتر صنف</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">همه</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <button type="button" onClick={loadCourses}>اعمال فیلتر</button>
        </div>
      </div>

      {loading && <div className="grade-card">در حال دریافت...</div>}
      {message && <div className="grade-card">{message}</div>}

      {!loading && !items.length && (
        <div className="grade-card">صنفی برای نمایش وجود ندارد.</div>
      )}

      <div className="grades-grid">
        {items.map((course) => (
          <div
            key={course.classId || course._id}
            className="grade-card clickable"
            onClick={() => navigate(`/courses/${getCourseTargetId(course)}`)}
          >
            <h3>{course.title}</h3>
            <p>{course.description || 'شرح کوتاه صنف در این قسمت نمایش داده می‌شود.'}</p>
            <div className="sections">
              <span>{course.category || 'عمومی'}</span>
              {course.level && <span>{course.level}</span>}
            </div>
            <div className="subjects">
              {(course.tags || []).slice(0, 4).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
