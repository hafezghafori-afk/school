import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Gallery.css';

import { API_BASE } from '../config/api';

const resolveImage = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}/${url.replace(/^\//, '')}`;
};

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const location = useLocation();

  useEffect(() => {
    const loadGallery = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/gallery`);
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
    loadGallery();
  }, []);

  useEffect(() => {
    if (loading || !items.length) return undefined;
    const hash = location.hash || window.location.hash || '';
    if (!hash || hash.length < 2) return undefined;

    const id = decodeURIComponent(hash.slice(1));
    const el = document.getElementById(id);
    const matchedItem = items.find((item) => item?._id && `item-${item._id}` === id) || null;
    if (matchedItem) {
      setActiveItem(matchedItem);
    }
    if (!el) return undefined;

    const timer = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);

    return () => clearTimeout(timer);
  }, [items, loading, location.hash]);

  useEffect(() => {
    if (!activeItem) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveItem(null);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeItem]);

  const openItemModal = (item) => {
    if (!item) return;
    setActiveItem(item);
    if (item._id) {
      window.location.hash = `item-${item._id}`;
    }
  };

  const closeModal = () => {
    setActiveItem(null);
  };

  return (
    <section className="gallery-page">
      <div className="gallery-hero">
        <div>
          <h1>گالری تصاویر</h1>
          <p>لحظه‌های آموزشی، کلاس‌ها و رویدادهای مهم مدرسه را ببینید.</p>
        </div>
        <div className="gallery-hero-tags">
          <span>کلاس‌ها</span>
          <span>رویدادها</span>
          <span>محیط مدرسه</span>
        </div>
      </div>

      {loading && <div className="gallery-empty">در حال بارگذاری...</div>}
      {!loading && !items.length && (
        <div className="gallery-empty">محتوایی ثبت نشده است.</div>
      )}

      <div className="gallery-grid">
        {items.map((item) => (
          <article
            key={item._id || item.title}
            id={item._id ? `item-${item._id}` : undefined}
            className="gallery-card"
            role="button"
            tabIndex={0}
            onClick={() => openItemModal(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openItemModal(item);
              }
            }}
          >
            <div
              className="gallery-image"
              style={{ backgroundImage: `url(${resolveImage(item.imageUrl)})` }}
            />
            <div className="gallery-meta">
              <span>{item.tag || 'گالری'}</span>
              <h3>{item.title}</h3>
              {item.description && <p>{item.description}</p>}
            </div>
          </article>
        ))}
      </div>

      {activeItem && (
        <div className="gallery-modal-backdrop" onClick={closeModal}>
          <div className="gallery-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="gallery-modal-close" onClick={closeModal} aria-label="Close">
              <i className="fa fa-times" aria-hidden="true" />
            </button>

            <div className="gallery-modal-image-wrap">
              <img
                className="gallery-modal-image"
                src={resolveImage(activeItem.imageUrl)}
                alt={activeItem.title || 'gallery'}
              />
            </div>

            <div className="gallery-modal-meta">
              <div className="gallery-modal-tag">{activeItem.tag || 'گالری'}</div>
              <h3>{activeItem.title}</h3>
              {activeItem.description ? (
                <p>{activeItem.description}</p>
              ) : (
                <p>تصویر انتخاب‌شده از گالری مدرسه.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
