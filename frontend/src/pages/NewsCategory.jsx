import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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

const resolveImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

const label = (cat) => {
  if (cat === 'announcement') return 'اعلانات';
  if (cat === 'event') return 'رویدادها';
  return 'خبرها';
};

export default function NewsCategory() {
  const { category } = useParams();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadNews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/news?category=${category}`);
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
  }, [category]);

  return (
    <section className="news-page">
      <div className="news-hero">
        <div>
          <h1>{label(category)}</h1>
          <p>فهرست دسته‌بندی {label(category)}.</p>
        </div>
        <div className="news-tabs">
          <Link className="news-hero-btn" to="/news">بازگشت به خبرها</Link>
        </div>
      </div>

      {loading && <div className="news-empty">در حال دریافت خبرها...</div>}
      {!loading && !items.length && (
        <div className="news-empty">خبری برای نمایش وجود ندارد.</div>
      )}

      <div className="news-grid">
        {items.map((item) => (
          <article key={item._id || item.title} className="news-card">
            {item.imageUrl && (
              <div
                className="news-image"
                style={{ backgroundImage: `url(${resolveImage(item.imageUrl)})` }}
              />
            )}
            <div className="news-card-head">
              <h3>{item.title}</h3>
              <span>{toDate(item.publishedAt || item.createdAt)}</span>
            </div>
            <p>{item.summary || item.content || ''}</p>
            {item._id && (
              <Link className="news-readmore" to={`/news/${item._id}`}>مشاهده جزئیات</Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
