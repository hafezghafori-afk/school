import React from 'react';
import { useLocation } from 'react-router-dom';
import NotFound from './NotFound';
import './MenuContent.css';

const normalizeHref = (href = '') => {
  if (!href || href.startsWith('http')) return null;
  const parts = href.split('#');
  const path = parts[0] || '/';
  const hash = parts[1] ? `#${parts[1]}` : '';
  const normalizedPath = path === '' ? '/' : path;
  return { path: normalizedPath, hash };
};

const splitContent = (content = '') => content
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean);

export default function MenuContent({ settings }) {
  const location = useLocation();
  const path = location.pathname || '/';
  const hash = location.hash || '';

  if (!settings) {
    return <div className="menu-page">در حال بارگذاری...</div>;
  }

  let found = null;

  (settings.mainMenu || []).forEach((menu) => {
    const target = normalizeHref(menu.href);
    if (target && target.path === path && (!target.hash || target.hash === hash)) {
      found = { title: menu.title, description: menu.description, content: menu.content };
    }
    (menu.children || []).forEach((child) => {
      const childTarget = normalizeHref(child.href);
      if (childTarget && childTarget.path === path && (!childTarget.hash || childTarget.hash === hash)) {
        found = { title: child.title, description: child.description, content: child.content };
      }
    });
  });

  if (!found) return <NotFound />;

  const paragraphs = splitContent(found.content);

  return (
    <div className="menu-page">
      <div className="menu-page-hero">
        <h1>{found.title || 'صفحه'}</h1>
        {found.description && <p>{found.description}</p>}
      </div>
      <div className="menu-page-card">
        {paragraphs.length ? (
          paragraphs.map((line, idx) => <p key={`${line}-${idx}`}>{line}</p>)
        ) : (
          <p>هنوز محتوایی برای این بخش ثبت نشده است.</p>
        )}
      </div>
    </div>
  );
}
