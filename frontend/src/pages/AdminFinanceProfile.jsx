


import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE } from '../config/api';
import './AdminFinanceProfile.css';

export default function AdminFinanceProfile() {
  const { studentId } = useParams();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    setError('');

    // Step 1: Fetch reference-data to get students and memberships
    fetch(`${API_BASE}/api/finance/admin/reference-data`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
    })
      .then((res) => res.json())
      .then((refData) => {
        if (!refData.success || !Array.isArray(refData.students)) {
          throw new Error(refData.message || 'خطا در دریافت اطلاعات مرجع');
        }
        // Find the student object
        const student = refData.students.find((s) => String(s._id) === String(studentId));
        if (!student || !student.membershipId) {
          throw new Error('عضویت مالی برای این متعلم یافت نشد.');
        }
        // Step 2: Fetch finance overview using membershipId
        return fetch(`${API_BASE}/api/student-finance/memberships/${student.membershipId}/overview`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
        });
      })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProfile(data.membership || data.item || data);
        } else {
          setError(data.message || 'خطا در دریافت اطلاعات مالی');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'خطا در ارتباط با سرور');
        setLoading(false);
      });
  }, [studentId]);

  return (
    <div className="admin-finance-profile-page">
      <h2>پروفایل مالی متعلم</h2>
      <p>کد متعلم: {studentId}</p>
      {loading ? (
        <div className="muted">در حال بارگذاری...</div>
      ) : error ? (
        <div className="muted error">{error}</div>
      ) : profile ? (
        <div className="profile-details">
          <div><b>نام:</b> {profile.student?.fullName || profile.student?.name || '-'}</div>
          <div><b>کلاس:</b> {profile.schoolClass?.title || '-'}</div>
          <div><b>سال تعلیمی:</b> {profile.academicYear?.title || '-'}</div>
          <div><b>باقیات:</b> {profile.outstanding != null ? profile.outstanding.toLocaleString('fa-AF') + ' افغانی' : '-'}</div>
          <div><b>جمع پرداختی‌ها:</b> {profile.totalPaid != null ? profile.totalPaid.toLocaleString('fa-AF') + ' افغانی' : '-'}</div>
          {/* Add more fields as needed */}
        </div>
      ) : (
        <div className="muted">اطلاعاتی یافت نشد.</div>
      )}
    </div>
  );
}
