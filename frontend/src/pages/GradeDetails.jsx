import React from 'react';
import { useParams } from 'react-router-dom';
import './GradeDetails.css';

export default function GradeDetails() {
  const { grade } = useParams();

  return (
    <div className="grade-page">
      <div className="grade-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>جزئیات صنف {grade}</h2>
        <p>در این صفحه اطلاعات صنف و ریز نمرات نمایش داده می‌شود.</p>
        <div className="grade-sections">
          <div>
            <span>امتحان اول</span>
            <strong>40/40</strong>
          </div>
          <div>
            <span>امتحان آخر سال</span>
            <strong>60/60</strong>
          </div>
          <div>
            <span>مجموع</span>
            <strong>100/100</strong>
          </div>
        </div>
        <div className="locked">
          <span>کارنامه PDF آماده است.</span>
          <button type="button">دانلود</button>
        </div>
      </div>
    </div>
  );
}
