import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import './CourseDetails.css';

import { API_BASE } from '../config/api';

export default function CourseDetails() {
  const { id } = useParams();
  const [course, setCourse] = useState(null);
  const [message, setMessage] = useState('');
  const [joinStatus, setJoinStatus] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);

  const role = localStorage.getItem('role') || '';
  const token = localStorage.getItem('token') || '';
  const canRequestJoin = Boolean(token && role === 'student');
  const paymentTarget = !token
    ? '/login'
    : role === 'student'
      ? '/my-finance'
      : role === 'admin'
        ? '/admin-finance'
        : '/payment';
  const paymentLabel = role === 'student' ? 'پرداخت از مرکز مالی' : 'راهنمای پرداخت و ثبت‌نام';
  const membershipTargetId = course?.schoolClassRef?._id || course?.schoolClassRef || course?.classId || course?.schoolClass?.id || '';
  const compatibilityCourseId = course?.courseId
    || course?.legacyCourseId
    || ((course?._id && course._id !== membershipTargetId) ? course._id : '');

  const loadCourse = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/education/public-school-classes/${id}`);
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'صنف پیدا نشد.');
        setCourse(null);
        return;
      }
      setCourse(data.item);
      setMessage('');
    } catch {
      setMessage('خطا در دریافت صنف');
      setCourse(null);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [id]);

  useEffect(() => {
    const loadJoinStatus = async () => {
      if (!canRequestJoin || !course || !membershipTargetId) return;
      try {
        const res = await fetch(`${API_BASE}/api/education/course-access-status/${membershipTargetId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data?.success) {
          setJoinStatus('');
          return;
        }
        setJoinStatus(data?.status || '');
      } catch {
        setJoinStatus('');
      }
    };
    loadJoinStatus();
  }, [canRequestJoin, course, membershipTargetId, token]);

  const handleJoinRequest = async () => {
    if (!canRequestJoin || joinBusy) return;
    setJoinBusy(true);
    setJoinMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/education/join-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(
          membershipTargetId
            ? { classId: membershipTargetId }
            : compatibilityCourseId
              ? { courseId: compatibilityCourseId }
              : { classId: id }
        )
      });
      const data = await res.json();
      if (!data?.success) {
        setJoinMessage(data?.message || 'ثبت درخواست عضویت ناموفق بود');
        return;
      }
      setJoinStatus('pending');
      setJoinMessage(data?.message || 'درخواست عضویت ثبت شد');
    } catch {
      setJoinMessage('خطا در ارتباط با سرور');
    } finally {
      setJoinBusy(false);
    }
  };

  if (message) {
    return (
      <div className="coursedetail-page">
        <div className="coursedetail-card">
          <div className="card-back">
            <button type="button" onClick={() => window.history.back()}>بازگشت</button>
          </div>
          <h2>جزئیات صنف</h2>
          <p>{message}</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="coursedetail-page">
        <div className="coursedetail-card">
          <div className="card-back">
            <button type="button" onClick={() => window.history.back()}>بازگشت</button>
          </div>
          <h2>در حال بارگذاری...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="coursedetail-page">
      <div className="coursedetail-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>{course.title}</h2>
        <p>{course.description || 'برای این صنف شرح کامل ثبت نشده است.'}</p>
        <div className="coursedetail-meta">
          <span>صنف: {course.category || 'عمومی'}</span>
          <span>قیمت: {course.price ? `${course.price} افغانی` : 'رایگان'}</span>
        </div>
        <div className="coursedetail-tags">
          {(course.tags || []).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {course.videoUrl && (
          <video className="coursedetail-video" controls src={`${API_BASE}/${course.videoUrl}`} />
        )}
        {course.pdfUrl && (
          <a className="coursedetail-pdf" href={`${API_BASE}/${course.pdfUrl}`} target="_blank" rel="noreferrer">
            دانلود PDF صنف
          </a>
        )}

        <div className="coursedetail-actions">
          <Link to={paymentTarget}>
            <button type="button">{paymentLabel}</button>
          </Link>
          {canRequestJoin && (
            <button
              type="button"
              className="join-request-btn"
              disabled={joinBusy || joinStatus === 'pending' || joinStatus === 'approved'}
              onClick={handleJoinRequest}
            >
              {joinStatus === 'approved'
                ? 'عضویت تایید شده'
                : joinStatus === 'pending'
                  ? 'درخواست در انتظار تایید'
                  : joinBusy
                    ? 'در حال ارسال...'
                    : 'درخواست عضویت به استاد'}
            </button>
          )}
        </div>
        {!!joinMessage && <div className="join-request-message">{joinMessage}</div>}

        <div className="coursedetail-outline">
          <h4>سرفصل‌ها</h4>
          <div className="outline-module">
            <strong>بخش اول</strong>
            <ul>
              <li><span>01</span> مقدمه و آشنایی</li>
              <li><span>02</span> تمرین و مثال</li>
            </ul>
          </div>
          <div className="outline-module">
            <strong>بخش دوم</strong>
            <ul>
              <li><span>03</span> جمع‌بندی و آزمون</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
