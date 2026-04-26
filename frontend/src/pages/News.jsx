import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import './News.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';

const tabs = [
  { key: 'all', label: 'همه' },
  { key: 'news', label: 'خبرها', hash: '#news', link: '/news/category/news' },
  { key: 'announcement', label: 'اعلانات', hash: '#announcements', link: '/news/category/announcement' },
  { key: 'event', label: 'رویدادها', hash: '#events', link: '/news/category/event' }
];

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

export default function News() {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [active, setActive] = useState('all');
  const [loading, setLoading] = useState(false);

  const hashCategory = useMemo(() => {
    const hash = (location.hash || '').toLowerCase();
    if (hash === '#announcements') return 'announcement';
    if (hash === '#events') return 'event';
    if (hash === '#news') return 'news';
    return 'all';
  }, [location.hash]);

  useEffect(() => {
    setActive(hashCategory);
  }, [hashCategory]);

  useEffect(() => {
    const loadNews = async () => {
      setLoading(true);
      try {
        const url = active === 'all'
          ? `${API_BASE}/api/news`
          : `${API_BASE}/api/news?category=${active}`;
        const res = await fetch(url);
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
  }, [active]);

  return (
    <section className="news-page">
      <div className="news-hero">
        <div>
          <h1>خبرها و اعلانات</h1>
          <p>آخرین رویدادهای آموزشی و اطلاعیه‌های مدرسه را دنبال کنید.</p>
        </div>
        <div className="news-tabs">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              to={tab.link || '/news'}
              className={`news-tab-link ${tab.key === active ? 'active' : ''}`}
              onClick={() => {
                setActive(tab.key);
                if (tab.hash) {
                  window.history.replaceState(null, '', tab.hash);
                } else {
                  window.history.replaceState(null, '', '#');
                }
              }}
            >
              {tab.label}
            </Link>
          ))}
          <Link className="news-tab-link" to="/news/archive">آرشیف</Link>
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
            <p>{item.summary || item.text || item.content || ''}</p>
            {item._id && (
              <Link className="news-readmore" to={`/news/${item._id}`}>مشاهده جزئیات</Link>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
