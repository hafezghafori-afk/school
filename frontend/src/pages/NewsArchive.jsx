import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './News.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const toDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export default function NewsArchive() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadNews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/news`);
        const data = await res.json();
        if (data?.success) {
          setItems(data.items || []);
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    loadNews();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map();
    items.forEach(item => {
      const date = item.publishedAt || item.createdAt;
      const key = formatAfghanDate(date, { year: 'numeric', month: 'long' }) || 'بدون تاریخ';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return Array.from(map.entries());
  }, [items]);

  return (
    <section className="news-page">
      <div className="news-hero">
        <div>
          <h1>آرشیف خبرها</h1>
          <p>همه خبرها به تفکیک ماه.</p>
        </div>
        <div className="news-tabs">
          <Link className="news-hero-btn" to="/news">بازگشت به خبرها</Link>
        </div>
      </div>

      {loading && <div className="news-empty">در حال دریافت خبرها...</div>}
      {!loading && !items.length && (
        <div className="news-empty">خبری برای نمایش وجود ندارد.</div>
      )}

      <div className="news-archive">
        {grouped.map(([month, list]) => (
          <div key={month} className="news-archive-block">
            <h3>{month}</h3>
            {list.map(item => (
              <div key={item._id} className="news-archive-item">
                <Link to={`/news/${item._id}`}>{item.title}</Link>
                <span>{toDate(item.publishedAt || item.createdAt)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
