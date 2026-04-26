// Helper to get auth headers from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../config/api';
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

    // Helper: filter classes by selected year
    const filteredClasses = useMemo(() => {
      if (!form.academicYearId) return classes;
      return classes.filter(c => !c.academicYearId || c.academicYearId === form.academicYearId);
    }, [classes, form.academicYearId]);

    // Handle form field changes
    const handleFormChange = (field, value) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        if (field === 'academicYearId') next.classId = '';
        return next;
      });
    };

    const openCreateModal = () => {
      setEditingMembershipId('');
      setForm(getDefaultForm());
      setShowModal(true);
    };

    const openEditModal = (membership) => {
      setOpenActionMenuId('');
      setOpenActionMenuDirection('down');
      setEditingMembershipId(String(membership?._id || membership?.id || ''));
      setForm({
        studentId: String(membership?.studentId || ''),
        academicYearId: String(membership?.academicYearId || ''),
        classId: String(membership?.classId || ''),
        membershipType: String(membership?.membershipType || 'normal'),
        status: String(membership?.status || 'active'),
        startDate: normalizeDateInput(membership?.startDate),
        endDate: normalizeDateInput(membership?.endDate),
        notes: String(membership?.notes || '')
      });
      setShowModal(true);
    };

    const closeModal = () => {
      setShowModal(false);
      setEditingMembershipId('');
      setForm(getDefaultForm());
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
        const isEditing = Boolean(editingMembershipId);
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
        setMessage(isEditing ? 'عضویت با موفقیت ویرایش شد' : 'عضویت جدید با موفقیت ثبت شد');
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
          // Add registrationType fallback if missing
          const studentsWithType = (data.students || []).map(s => ({
            ...s,
            registrationType: s.registrationType || (s.isOnline ? 'online' : 'manager')
          }));
          setStudents(studentsWithType);
          setAcademicYears(data.academicYears || []);
          setClasses(data.classes || []);
        })
        .catch(() => setMessage('خطا در دریافت اطلاعات مرجع'))
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
      const matchesSearch = !filters.search || (student.fullName || student.name || '').toLowerCase().includes(filters.search.toLowerCase()) || (student.admissionNo || '').toLowerCase().includes(filters.search.toLowerCase());
      const matchesYear = !filters.year || m.academicYearId === filters.year;
      const matchesClass = !filters.classId || m.classId === filters.classId;
      const matchesStatus = !filters.status || m.status === filters.status;
      const matchesRegType = !filters.registrationType || student.registrationType === filters.registrationType;
      return matchesSearch && matchesYear && matchesClass && matchesStatus && matchesRegType;
    });
  }, [memberships, filters, students]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredMemberships.length / PAGE_SIZE)),
    [filteredMemberships.length]
  );

  const paginatedMemberships = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMemberships.slice(start, start + PAGE_SIZE);
  }, [filteredMemberships, currentPage]);

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

  return (
    <div className="admin-financial-memberships-page">
      {/* Header */}
      <div className="afm-header">
        <div>
          <h2>مدیریت عضویت‌های مالی شاگردان</h2>
          <div className="afm-subtitle">ثبت، مشاهده و مدیریت عضویت‌های فعال و غیرفعال</div>
        </div>
        <button className="afm-btn-primary" onClick={openCreateModal}>
          <span className="afm-btn-icon">+</span> ثبت عضویت جدید
        </button>
      </div>

      {message ? <div className="afm-feedback-banner">{message}</div> : null}

      {/* Summary Cards - real data */}
      <div className="afm-summary-cards">
        <div className="afm-summary-card afm-summary-active">
          <div className="afm-summary-title">عضویت فعال</div>
          <div className="afm-summary-value">{memberships.filter(m => m.status === 'active').length}</div>
        </div>
        <div className="afm-summary-card afm-summary-inactive">
          <div className="afm-summary-title">غیرفعال</div>
          <div className="afm-summary-value">{memberships.filter(m => m.status === 'inactive').length}</div>
        </div>
        <div className="afm-summary-card afm-summary-new">
          <div className="afm-summary-title">جدید این ماه</div>
          <div className="afm-summary-value">{memberships.filter(m => {
            const d = m.startDate ? new Date(m.startDate) : null;
            const now = new Date();
            return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).length}</div>
        </div>
        <div className="afm-summary-card afm-summary-no-membership">
          <div className="afm-summary-title">بدون عضویت</div>
          <div className="afm-summary-value">{students.length - memberships.length}</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="afm-filter-bar">
        <input
          className="afm-filter-input"
          placeholder="جستجوی نام یا شماره شاگرد..."
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
              <th>نام شاگرد</th>
              <th>شماره شاگرد</th>
              <th>صنف</th>
              <th>سال</th>
              <th>نوع عضویت</th>
              <th>وضعیت</th>
              <th>تاریخ شروع</th>
              <th>تاریخ ختم</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {filteredMemberships.length === 0 && (
              <tr><td colSpan={9} className="muted">عضویتی یافت نشد.</td></tr>
            )}
            {paginatedMemberships.map((m) => {
              const student = students.find((s) => s._id === m.studentId) || {};
              const classObj = classes.find((c) => c.classId === m.classId) || {};
              const yearObj = academicYears.find((y) => (y._id || y.id) === m.academicYearId) || {};
              return (
                <tr key={m._id || m.id}>
                  <td>{student.fullName || student.name || '-'}</td>
                  <td>{student.admissionNo || '-'}</td>
                  <td>{classObj.title || '-'}</td>
                  <td>{yearObj.title || '-'}</td>
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
                  <div className="afm-form-card">
                    <label>جستجوی شاگرد</label>
                    <input
                      className="afm-filter-input"
                      placeholder="نام یا شماره شاگرد..."
                      value={filters.modalStudentSearch || ''}
                      onChange={e => setFilters(f => ({ ...f, modalStudentSearch: e.target.value }))}
                    />
                  </div>
                  <div className="afm-form-card">
                    <label>نوع ثبت‌نام</label>
                    <select
                      className="afm-filter-select"
                      value={filters.modalRegistrationType || ''}
                      onChange={e => setFilters(f => ({ ...f, modalRegistrationType: e.target.value }))}
                    >
                      <option value="">نوع ثبت‌نام</option>
                      <option value="online">آنلاین</option>
                      <option value="manager">مدیریت تدریسی</option>
                    </select>
                  </div>
                  <div className="afm-form-card">
                    <label>شاگرد</label>
                    <select required value={form.studentId} onChange={e => handleFormChange('studentId', e.target.value)} disabled={Boolean(editingMembershipId)}>
                      <option value="">انتخاب شاگرد</option>
                      {students.filter(s => {
                        const search = (filters.modalStudentSearch || '').toLowerCase();
                        const matchesSearch = !search || (s.fullName || s.name || '').toLowerCase().includes(search) || (s.admissionNo || '').toLowerCase().includes(search);
                        const matchesRegType = !filters.modalRegistrationType || s.registrationType === filters.modalRegistrationType;
                        return matchesSearch && matchesRegType;
                      }).map(s => (
                        <option key={s._id} value={s._id}>{s.fullName || s.name} {s.admissionNo ? `(${s.admissionNo})` : ''} {s.registrationType === 'online' ? 'آنلاین' : 'مدیریت'}</option>
                      ))}
                    </select>
                  </div>
                  <div className="afm-form-card">
                    <label>سال تعلیمی</label>
                    <select required value={form.academicYearId} onChange={e => handleFormChange('academicYearId', e.target.value)}>
                      <option value="">انتخاب سال</option>
                      {academicYears.map(y => (
                        <option key={y._id || y.id} value={y._id || y.id}>{y.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="afm-form-card">
                    <label>صنف</label>
                    <select required value={form.classId} onChange={e => handleFormChange('classId', e.target.value)}>
                      <option value="">انتخاب صنف</option>
                      {filteredClasses.map(c => (
                        <option key={c.classId || c.id} value={c.classId || c.id}>{c.title}</option>
                      ))}
                    </select>
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
                    <input type="date" required value={form.startDate} onChange={e => handleFormChange('startDate', e.target.value)} />
                  </div>
                  <div className="afm-form-card">
                    <label>تاریخ ختم</label>
                    <input type="date" value={form.endDate} onChange={e => handleFormChange('endDate', e.target.value)} />
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
