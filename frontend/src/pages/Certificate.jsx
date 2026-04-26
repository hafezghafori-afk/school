import React from 'react';
import './Certificate.css';

export default function Certificate() {
  return (
    <div className="cert-page">
      <div className="cert-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>گواهی پایان دوره</h2>
        <p>بعد از تکمیل صنف و موفقیت در آزمون‌ها، گواهی قابل دریافت است.</p>
        <div className="cert-preview">
          <span>نام شاگرد</span>
          <strong>---</strong>
          <span>صنف</span>
          <strong>---</strong>
          <span>تاریخ صدور</span>
          <strong>---</strong>
        </div>
        <button type="button">دانلود گواهی</button>
      </div>
    </div>
  );
}
