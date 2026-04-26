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

const categoryLabel = (cat) => {
  if (cat === 'announcement') return 'اعلان';
  if (cat === 'event') return 'رویداد';
  return 'خبر';
};

const setMeta = (name, content) => {
  if (!content) return;
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

export default function NewsDetail() {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadItem = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/news/${id}`);
        const data = await res.json();
        if (data?.success) {
          setItem(data.item || null);
        } else {
          setItem(null);
        }
      } catch {
        setItem(null);
      } finally {
        setLoading(false);
      }
    };
    loadItem();
  }, [id]);

  useEffect(() => {
    if (!item) return;
    document.title = `${item.title} | خبرها`;
    setMeta('description', item.summary || item.content || 'خبر مدرسه');
    setMeta('og:title', item.title);
    setMeta('og:description', item.summary || item.content || 'خبر مدرسه');
  }, [item]);

  return (
    <section className="news-page">
      <div className="news-hero">
        <div>
          <h1>جزئیات خبر</h1>
          <p>متن کامل خبر یا اعلان را در این بخش ببینید.</p>
        </div>
        <Link className="news-hero-btn" to="/news">بازگشت به خبرها</Link>
      </div>

      {loading && <div className="news-empty">در حال دریافت خبر...</div>}
      {!loading && !item && <div className="news-empty">خبر پیدا نشد.</div>}

      {item && (
        <article className="news-detail">
          {item.imageUrl && (
            <div
              className="news-image"
              style={{ backgroundImage: `url(${resolveImage(item.imageUrl)})` }}
            />
          )}
          <div className="news-detail-head">
            <div>
              <h2>{item.title}</h2>
              <span>{categoryLabel(item.category)}</span>
            </div>
            <span>{toDate(item.publishedAt || item.createdAt)}</span>
          </div>
          <p>{item.summary || ''}</p>
          <div className="news-detail-body">
            <p>{item.content || ''}</p>
          </div>
        </article>
      )}
    </section>
  );
}
