// Helper to get auth headers from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config/api';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { getStudentAsasNumber, studentMatchesSearch } from '../utils/studentSearch';
import { readStoredSchoolId } from './adminWorkspaceUtils';
import './AdminFinancialMemberships.css';

const getDefaultForm = () => ({
  studentId: '',
  academicYearId: '',
  classId: '',
  membershipType: 'normal',
  status: 'active',
  startDate: '',
  endDate: '',
  notes: ''
});

const normalizeDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const PAGE_SIZE = 10;

const CURRENT_MEMBERSHIP_STATUSES = new Set(['active', 'pending', 'suspended', 'transferred_in']);
const ENDED_MEMBERSHIP_STATUSES = new Set(['inactive', 'transferred', 'transferred_out', 'graduated', 'dropped', 'expelled', 'rejected']);

const isCurrentMembership = (item = {}) => (
  item?.isCurrent !== false
  && !item?.endDate
  && !item?.endedAt
  && !item?.leftAt
  && CURRENT_MEMBERSHIP_STATUSES.has(String(item?.status || 'active').trim())
);

const getMembershipStudentName = (membership = {}, students = []) => {
  const student = students.find((item) => String(item._id) === String(membership.studentId)) || {};
  return membership.studentName || student.fullName || student.name || '-';
};

const getMembershipAdmissionNo = (membership = {}, students = []) => {
  const student = students.find((item) => String(item._id) === String(membership.studentId)) || {};
  return getStudentAsasNumber({ ...student, ...membership }) || '-';
};

const getMembershipClassTitle = (membership = {}, classes = []) => {
  const item = classes.find((classItem) => String(classItem.classId || classItem.id) === String(membership.classId)) || {};
  return membership.classTitle || item.title || '-';
};

const getMembershipAcademicYearTitle = (membership = {}, academicYears = []) => {
  const item = academicYears.find((year) => String(year._id || year.id) === String(membership.academicYearId)) || {};
  return membership.academicYearTitle || item.title || '-';
};

// اسکلت مدرن صفحه عضویت مالی شاگردان
export default function AdminFinancialMemberships() {
    // All state declarations first (no duplicates)
    const [showModal, setShowModal] = useState(false);
    const [students, setStudents] = useState([]);
    const [academicYears, setAcademicYears] = useState([]);
    const [classes, setClasses] = useState([]);
    const [memberships, setMemberships] = useState([]);
    const [filters, setFilters] = useState({ search: '', year: '', classId: '', status: '', registrationType: '' });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [form, setForm] = useState(getDefaultForm);
    const [formLoading, setFormLoading] = useState(false);
    const [editingMembershipId, setEditingMembershipId] = useState('');
    const [openActionMenuId, setOpenActionMenuId] = useState('');
    const [openActionMenuDirection, setOpenActionMenuDirection] = useState('down');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
    const originalEndDateRef = useRef('');

    const fetchMemberships = useCallback(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/finance/admin/student-memberships`, {
          credentials: 'include',
          headers: { ...getAuthHeaders() }
        });
        const data = await res.json();
        setMemberships(data.items || []);
      } catch {
        setMessage('خطا در دریافت لیست عضویت‌ها');
      } finally {
        setLoading(false);
      }
    }, []);

    // Handle form field changes
    const handleFormChange = (field, value) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        if (field === 'academicYearId') next.classId = '';
        return next;
      });
    };

    const openEditModal = (membership) => {
      setOpenActionMenuId('');
      setOpenActionMenuDirection('down');
      setEditingMembershipId(String(membership?._id || membership?.id || ''));
      const normalizedEndDate = normalizeDateInput(membership?.endDate);
      originalEndDateRef.current = normalizedEndDate;
      setForm({
        studentId: String(membership?.studentId || ''),
        academicYearId: String(membership?.academicYearId || ''),
        classId: String(membership?.classId || ''),
        membershipType: String(membership?.membershipType || 'normal'),
        status: String(membership?.status || 'active'),
        startDate: normalizeDateInput(membership?.startDate),
        endDate: normalizedEndDate,
        notes: String(membership?.notes || '')
      });
      setShowModal(true);
    };

    const closeModal = () => {
      setShowModal(false);
      setEditingMembershipId('');
      setForm(getDefaultForm());
      originalEndDateRef.current = '';
    };

    const toggleRowActionMenu = (membership, event) => {
      const membershipId = String(membership?._id || membership?.id || '');
      const trigger = event?.currentTarget || document.activeElement;
      const rect = trigger?.getBoundingClientRect ? trigger.getBoundingClientRect() : null;
      const spaceBelow = rect ? window.innerHeight - rect.bottom : 999;
      const spaceAbove = rect ? rect.top : 0;
      const direction = (spaceBelow < 120 && spaceAbove > spaceBelow) ? 'up' : 'down';

      setOpenActionMenuDirection(direction);
      setOpenActionMenuId((prev) => (prev === membershipId ? '' : membershipId));
    };

    const handleDeleteMembership = async (membership) => {
      const membershipId = String(membership?._id || membership?.id || '').trim();
      if (!membershipId) return;
      setOpenActionMenuId('');
      const studentName = students.find((s) => String(s._id) === String(membership.studentId))?.fullName || 'این شاگرد';
      const confirmed = window.confirm(`آیا از حذف عضویت مالی ${studentName} مطمئن هستید؟`);
      if (!confirmed) return;

      setMessage('');
      try {
        const res = await fetch(`${API_BASE}/api/finance/admin/student-memberships/${membershipId}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() },
          credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'خطا در حذف عضویت');
        setMessage('عضویت با موفقیت حذف شد');
        await fetchMemberships();
      } catch (err) {
        setMessage(err.message || 'خطا در حذف عضویت');
      }
    };

    // Handle submit membership (create/edit)
    const handleFormSubmit = async (e) => {
      e.preventDefault();
      const isEditing = Boolean(editingMembershipId);
      const isSettingNewEndDate = isEditing && form.endDate && form.endDate !== originalEndDateRef.current;
      if (isSettingNewEndDate) {
        const confirmed = window.confirm(
          'با ثبت این تاریخ ختم، قبض‌ها و سفارش‌های مالی آینده‌ی این شاگرد (از ماه بعد از تاریخ ختم به بعد) به‌صورت خودکار باطل خواهند شد. آیا مطمئن هستید؟'
        );
        if (!confirmed) return;
      }
      setFormLoading(true);
      setMessage('');
      try {
        const selectedClass = classes.find((item) => (item.classId || item.id) === form.classId) || null;
        const payload = {
          studentId: form.studentId,
          academicYearId: form.academicYearId,
          classId: form.classId,
          courseId: selectedClass?.courseId || selectedClass?.legacyCourseId || '',
          membershipType: form.membershipType,
          status: form.status,
          startDate: form.startDate,
          endDate: form.endDate || null,
          notes: form.notes
        };
        const endpoint = isEditing
          ? `${API_BASE}/api/finance/admin/student-memberships/${editingMembershipId}`
          : `${API_BASE}/api/finance/admin/student-memberships`;
        const res = await fetch(endpoint, {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || (isEditing ? 'خطا در ویرایش عضویت' : 'خطا در ثبت عضویت'));
        closeModal();
        let successMessage = isEditing ? 'عضویت با موفقیت ویرایش شد' : 'عضویت جدید با موفقیت ثبت شد';
        const stopped = data.stoppedFutureBills;
        const stoppedTotal = (stopped?.bills || 0) + (stopped?.orders || 0);
        if (stoppedTotal > 0) {
          successMessage += ` (${stoppedTotal} قبض/سفارش مالی آینده باطل شد)`;
        }
        setMessage(successMessage);
        await fetchMemberships();
      } catch (err) {
        setMessage(err.message || 'خطا در ذخیره عضویت');
      }
      setFormLoading(false);
    };
  // ...existing code...

    // Fetch reference data (students, years, classes)
    useEffect(() => {
      setLoading(true);
      fetch(`${API_BASE}/api/finance/admin/reference-data`, {
        credentials: 'include',
        headers: { ...getAuthHeaders() }
      })
        .then((res) => res.json())
        .then((data) => {
          if (!data.success) {
            throw new Error(data.message || 'خطا در دریافت اطلاعات مرجع');
          }
          // Add registrationType fallback if missing
          const studentsWithType = (data.students || []).map(s => ({
            ...s,
            registrationType: s.registrationType || (s.isOnline ? 'online' : 'manager')
          }));
          setStudents(studentsWithType);
          setAcademicYears(data.academicYears || []);
          setClasses(data.classes || []);
        })
        .catch((err) => setMessage(err.message || 'خطا در دریافت اطلاعات مرجع'))
        .finally(() => setLoading(false));
    }, []);

  // Fetch memberships
  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!event.target.closest('.afm-row-actions')) {
        setOpenActionMenuId('');
        setOpenActionMenuDirection('down');
      }
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  // Filtered memberships
  const filteredMemberships = useMemo(() => {
    return memberships.filter((m) => {
      const student = students.find((s) => s._id === m.studentId) || {};
      const matchesSearch = studentMatchesSearch({ ...student, ...m }, filters.search, [getMembershipStudentName(m, students)]);
      const matchesYear = !filters.year || m.academicYearId === filters.year;
      const matchesClass = !filters.classId || m.classId === filters.classId;
      const matchesStatus = !filters.status || m.status === filters.status;
      const matchesRegType = !filters.registrationType || student.registrationType === filters.registrationType;
      return matchesSearch && matchesYear && matchesClass && matchesStatus && matchesRegType;
    });
  }, [memberships, filters, students]);

  const handleSort = (key) => {
    setSortConfig((prev) => (
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    ));
  };

  const sortedMemberships = useMemo(() => {
    if (!sortConfig.key) return filteredMemberships;
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    const getSortValue = (m) => {
      switch (sortConfig.key) {
        case 'studentName': return getMembershipStudentName(m, students);
        case 'classTitle': return getMembershipClassTitle(m, classes);
        case 'academicYearTitle': return getMembershipAcademicYearTitle(m, academicYears);
        case 'status': return m.status || '';
        case 'startDate': return m.startDate || '';
        case 'endDate': return m.endDate || '';
        default: return '';
      }
    };
    return [...filteredMemberships].sort((a, b) => (
      String(getSortValue(a)).localeCompare(String(getSortValue(b)), 'fa') * dir
    ));
  }, [filteredMemberships, sortConfig, students, classes, academicYears]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(sortedMemberships.length / PAGE_SIZE)),
    [sortedMemberships.length]
  );

  const paginatedMemberships = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedMemberships.slice(start, start + PAGE_SIZE);
  }, [sortedMemberships, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters.search, filters.year, filters.classId, filters.status, filters.registrationType]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages]
  );

  const pageStart = filteredMemberships.length ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const pageEnd = filteredMemberships.length ? Math.min(currentPage * PAGE_SIZE, filteredMemberships.length) : 0;
  const membershipStats = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const currentStudentIds = new Set();
    memberships.forEach((item) => {
      if (isCurrentMembership(item) && item.studentId) {
        currentStudentIds.add(String(item.studentId));
      }
    });

    const newThisMonth = memberships.filter((item) => {
      const createdAt = item.createdAt ? new Date(item.createdAt) : null;
      return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= monthStart;
    }).length;

    const studentsWithoutMembership = students.filter(
      (s) => !currentStudentIds.has(String(s._id))
    ).length;

    return {
      active: memberships.filter((item) => String(item.status || '') === 'active').length,
      ended: memberships.filter((item) => item?.isCurrent === false || ENDED_MEMBERSHIP_STATUSES.has(String(item.status || '').trim())).length,
      newThisMonth,
      studentsWithoutMembership
    };
  }, [memberships, students]);

  const editingStudentDisplay = useMemo(() => {
    const student = students.find((s) => String(s._id) === String(form.studentId));
    if (!student) return '-';
    const asasNumber = getStudentAsasNumber(student);
    return `${student.fullName || student.name || '-'}${asasNumber ? ` (نمبر اساس: ${asasNumber})` : ''}`;
  }, [students, form.studentId]);

  const editingClassDisplay = useMemo(() => {
    const cls = classes.find((c) => String(c.classId || c.id) === String(form.classId));
    return cls?.title || '-';
  }, [classes, form.classId]);

  const editingYearDisplay = useMemo(() => {
    const year = academicYears.find((y) => String(y._id || y.id) === String(form.academicYearId));
    return year?.title || '-';
  }, [academicYears, form.academicYearId]);

  return (
    <div className="admin-financial-memberships-page">
      {/* Header */}
      <div className="afm-header">
        <div>
          <h2>مدیریت عضویت‌های مالی شاگردان</h2>
          <div className="afm-subtitle">ثبت، مشاهده و مدیریت عضویت‌های فعال و غیرفعال</div>
        </div>
        <Link className="afm-btn-primary afm-header-link" to="/admin-education?section=enrollments">
          <span className="afm-btn-icon">+</span> ثبت عضویت جدید
        </Link>
      </div>

      {message ? <div className="afm-feedback-banner">{message}</div> : null}
      {loading ? <div className="afm-loading-banner">در حال بارگذاری اطلاعات...</div> : null}
      <div className="afm-source-banner">
        ممبرشیپ مالی اکنون از ثبت‌نام متعلمین در مرکز مدیریت آموزش ساخته می‌شود. در این صفحه فقط وضعیت مالی، یادداشت و توقف/فعال‌سازی همان عضویت کنترل می‌شود.
      </div>

      {/* Summary Cards - real data */}
      <div className="afm-summary-cards">
        <div className="afm-summary-card afm-summary-active">
          <div className="afm-summary-title">عضویت فعال</div>
          <div className="afm-summary-value">{membershipStats.active}</div>
        </div>
        <div className="afm-summary-card afm-summary-inactive">
          <div className="afm-summary-title">غیرفعال</div>
          <div className="afm-summary-value">{membershipStats.ended}</div>
        </div>
        <div className="afm-summary-card afm-summary-new">
          <div className="afm-summary-title">جدید این ماه</div>
          <div className="afm-summary-value">{membershipStats.newThisMonth}</div>
        </div>
        <div className="afm-summary-card afm-summary-no-membership">
          <div className="afm-summary-title">بدون عضویت</div>
          <div className="afm-summary-value">{membershipStats.studentsWithoutMembership}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="afm-filter-bar">
        <input
          className="afm-filter-input"
          placeholder="جستجوی نام، نام پدر یا نمبر اساس شاگرد..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />
        <select
          className="afm-filter-select"
          value={filters.year}
          onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
        >
          <option value="">سال تعلیمی</option>
          {academicYears.map(y => (
            <option key={y._id || y.id} value={y._id || y.id}>{y.title}</option>
          ))}
        </select>
        <select
          className="afm-filter-select"
          value={filters.classId}
          onChange={e => setFilters(f => ({ ...f, classId: e.target.value }))}
        >
          <option value="">صنف</option>
          {classes.map(c => (
            <option key={c.classId || c.id} value={c.classId || c.id}>{c.title}</option>
          ))}
        </select>
        <select
          className="afm-filter-select"
          value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="active">فعال</option>
          <option value="inactive">غیرفعال</option>
          <option value="pending">معلق</option>
        </select>
        <select
          className="afm-filter-select"
          value={filters.registrationType}
          onChange={e => setFilters(f => ({ ...f, registrationType: e.target.value }))}
        >
          <option value="">نوع ثبت‌نام</option>
          <option value="online">آنلاین</option>
          <option value="manager">مدیریت تدریسی</option>
        </select>
        <button className="afm-btn-reset" onClick={() => setFilters({ search: '', year: '', classId: '', status: '', registrationType: '' })}>پاک‌کردن فیلترها</button>
      </div>

      {/* Table/List Section */}
      <div className="afm-table-section">
        <table className="afm-table">
          <thead>
            <tr>
              <th>#</th>
              <th className="afm-th-sortable" onClick={() => handleSort('studentName')}>
                نام شاگرد{sortConfig.key === 'studentName' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>شماره شاگرد</th>
              <th className="afm-th-sortable" onClick={() => handleSort('classTitle')}>
                صنف{sortConfig.key === 'classTitle' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th className="afm-th-sortable" onClick={() => handleSort('academicYearTitle')}>
                سال{sortConfig.key === 'academicYearTitle' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>نوع عضویت</th>
              <th className="afm-th-sortable" onClick={() => handleSort('status')}>
                وضعیت{sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th className="afm-th-sortable" onClick={() => handleSort('startDate')}>
                تاریخ شروع{sortConfig.key === 'startDate' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th className="afm-th-sortable" onClick={() => handleSort('endDate')}>
                تاریخ ختم{sortConfig.key === 'endDate' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="muted">در حال بارگذاری...</td></tr>
            )}
            {!loading && filteredMemberships.length === 0 && (
              <tr><td colSpan={10} className="muted">عضویتی یافت نشد.</td></tr>
            )}
            {paginatedMemberships.map((m, index) => {
              const studentName = getMembershipStudentName(m, students);
              const admissionNo = getMembershipAdmissionNo(m, students);
              const classTitle = getMembershipClassTitle(m, classes);
              const academicYearTitle = getMembershipAcademicYearTitle(m, academicYears);
              return (
                <tr key={m._id || m.id}>
                  <td>{index + 1}</td>
                  <td>{studentName}</td>
                  <td>{admissionNo}</td>
                  <td>{classTitle}</td>
                  <td>{academicYearTitle}</td>
                  <td><span className="afm-badge afm-badge-normal">{m.membershipType || 'عادی'}</span></td>
                  <td><span className={`afm-badge afm-badge-${m.status}`}>{m.status === 'active' ? 'فعال' : m.status === 'inactive' ? 'غیرفعال' : m.status === 'pending' ? 'معلق' : m.status}</span></td>
                  <td>{m.startDate ? m.startDate.slice(0, 10) : '-'}</td>
                  <td>{m.endDate ? m.endDate.slice(0, 10) : '-'}</td>
                  <td>
                    <div className="afm-row-actions">
                      <button
                        type="button"
                        className="afm-action-kebab"
                        aria-label="عملیات عضویت"
                        onClick={(event) => toggleRowActionMenu(m, event)}
                      >
                        ⋮
                      </button>
                      {openActionMenuId === String(m._id || m.id || '') && (
                        <div className={`afm-action-menu ${openActionMenuDirection === 'up' ? 'afm-action-menu--up' : 'afm-action-menu--down'}`} role="menu">
                          <button type="button" className="afm-action-menu-item" onClick={() => openEditModal(m)}>ویرایش</button>
                          <button type="button" className="afm-action-menu-item afm-action-menu-item-delete" onClick={() => handleDeleteMembership(m)}>حذف</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredMemberships.length > 0 && (
          <div className="afm-pagination-wrap">
            <div className="afm-pagination-meta">
              نمایش {pageStart} تا {pageEnd} از {filteredMemberships.length} شاگرد
            </div>
            <div className="afm-pagination" role="navigation" aria-label="صفحه‌بندی عضویت‌ها">
              <button
                type="button"
                className="afm-page-btn"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                ◀ قبلی
              </button>

              <div className="afm-page-numbers">
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={`afm-page-btn ${pageNumber === currentPage ? 'active' : ''}`}
                    onClick={() => setCurrentPage(pageNumber)}
                    aria-current={pageNumber === currentPage ? 'page' : undefined}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="afm-page-btn"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                بعدی ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal for New Membership - Modern, Wide, Card Row, No Scroll */}
      {showModal && (
        <div className="afm-modal-backdrop" onClick={closeModal}>
          <div className="afm-modal afm-modal-modern-row" onClick={e => e.stopPropagation()}>
            <div className="afm-modal-header">
              <h3>{editingMembershipId ? 'ویرایش عضویت' : 'ثبت عضویت جدید'}</h3>
              <button className="afm-modal-close" onClick={closeModal}>×</button>
            </div>
            <div className="afm-modal-body">
              <form className="afm-form-modern-row" onSubmit={handleFormSubmit} autoComplete="off" dir="rtl">
                <div className="afm-form-row-cards">
                  <div className="afm-form-card afm-form-card-readonly">
                    <label>شاگرد</label>
                    <div className="afm-readonly-value">{editingStudentDisplay}</div>
                  </div>
                  <div className="afm-form-card afm-form-card-readonly">
                    <label>صنف</label>
                    <div className="afm-readonly-value">{editingClassDisplay}</div>
                  </div>
                  <div className="afm-form-card afm-form-card-readonly">
                    <label>سال تعلیمی</label>
                    <div className="afm-readonly-value">{editingYearDisplay}</div>
                  </div>
                  <div className="afm-form-card">
                    <label>نوع عضویت</label>
                    <select value={form.membershipType} onChange={e => handleFormChange('membershipType', e.target.value)}>
                      <option value="normal">عادی</option>
                      <option value="transport">ترانسپورت</option>
                      <option value="discount">تخفیف‌دار</option>
                    </select>
                  </div>
                  <div className="afm-form-card">
                    <label>وضعیت</label>
                    <select value={form.status} onChange={e => handleFormChange('status', e.target.value)}>
                      <option value="active">فعال</option>
                      <option value="inactive">غیرفعال</option>
                      <option value="pending">معلق</option>
                    </select>
                  </div>
                  <div className="afm-form-card">
                    <label>تاریخ شروع</label>
                    <AfghanDateInput required value={form.startDate} onChange={(value) => handleFormChange('startDate', value)} showGregorianEquivalent />
                  </div>
                  <div className="afm-form-card">
                    <label>تاریخ ختم</label>
                    <AfghanDateInput value={form.endDate} onChange={(value) => handleFormChange('endDate', value)} showGregorianEquivalent />
                  </div>
                  <div className="afm-form-card afm-form-card-notes">
                    <label>یادداشت</label>
                    <textarea rows={2} value={form.notes} onChange={e => handleFormChange('notes', e.target.value)} placeholder="توضیحات..." />
                  </div>
                </div>
              </form>
            </div>
            <div className="afm-modal-footer">
              <form className="afm-form-modern-row-footer" onSubmit={handleFormSubmit} autoComplete="off" dir="rtl" style={{display:'flex',gap:'12px',margin:0,padding:0}}>
                <button className="afm-btn-primary" type="submit" disabled={formLoading}>{editingMembershipId ? 'ثبت ویرایش' : 'ذخیره عضویت'}</button>
                <button className="afm-btn-outline" type="button" onClick={closeModal}>لغو</button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
