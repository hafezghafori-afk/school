import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

export default function NotFound() {
  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <h2>صفحه مورد نظر پیدا نشد</h2>
        <p>لطفاً از منوی اصلی یک بخش دیگر را انتخاب کنید.</p>
        <Link className="notfound-link" to="/">بازگشت به خانه</Link>
      </div>
    </div>
  );
}
