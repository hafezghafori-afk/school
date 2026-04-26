import React, { useState, useEffect } from 'react';
import './AcademicYearsPage.css';

const AcademicYearsPage = () => {
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingYear, setEditingYear] = useState(null);
  const [formData, setFormData] = useState({
    schoolId: '',
    title: '',
    code: '',
    calendarType: 'solar_hijri',
    startDate: '',
    endDate: '',
    startDateLocal: '',
    endDateLocal: '',
    regionType: 'custom',
    note: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Mock school ID - in real app, get from context/auth
  const schoolId = '507f1f77bcf86cd799439011';

  useEffect(() => {
    fetchAcademicYears();
  }, []);

  const fetchAcademicYears = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data);
      } else {
        setError('خطا در دریافت سال‌های تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingYear 
        ? `/api/academic-years/${editingYear._id}`
        : '/api/academic-years';
      
      const method = editingYear ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          schoolId
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(editingYear ? 'سال تحصیلی با موفقیت ویرایش شد' : 'سال تحصیلی با موفقیت ایجاد شد');
        setShowModal(false);
        setEditingYear(null);
        resetForm();
        fetchAcademicYears();
      } else {
        setError(data.message || 'خطا در ذخیره سال تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleActivate = async (yearId) => {
    try {
      const response = await fetch(`/api/academic-years/${yearId}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('سال تحصیلی با موفقیت فعال شد');
        fetchAcademicYears();
      } else {
        setError(data.message || 'خطا در فعال‌سازی سال تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleClose = async (yearId) => {
    try {
      const response = await fetch(`/api/academic-years/${yearId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('سال تحصیلی با موفقیت بسته شد');
        fetchAcademicYears();
      } else {
        setError(data.message || 'خطا در بستن سال تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleDelete = async (yearId) => {
    if (!confirm('آیا از حذف این سال تحصیلی مطمئن هستید؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/academic-years/${yearId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('سال تحصیلی با موفقیت حذف شد');
        fetchAcademicYears();
      } else {
        setError(data.message || 'خطا در حذف سال تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const openEditModal = (year) => {
    setEditingYear(year);
    setFormData({
      schoolId: year.schoolId || '',
      title: year.title || '',
      code: year.code || '',
      calendarType: year.calendarType || 'solar_hijri',
      startDate: year.startDate ? year.startDate.split('T')[0] : '',
      endDate: year.endDate ? year.endDate.split('T')[0] : '',
      startDateLocal: year.startDateLocal || '',
      endDateLocal: year.endDateLocal || '',
      regionType: year.regionType || 'custom',
      note: year.note || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      schoolId: '',
      title: '',
      code: '',
      calendarType: 'solar_hijri',
      startDate: '',
      endDate: '',
      startDateLocal: '',
      endDateLocal: '',
      regionType: 'custom',
      note: ''
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      planning: { color: 'orange', text: 'در حال برنامه‌ریزی' },
      active: { color: 'green', text: 'فعال' },
      closed: { color: 'red', text: 'بسته شده' },
      archived: { color: 'gray', text: 'بایگانی شده' }
    };
    
    const config = statusConfig[status] || { color: 'gray', text: status };
    return <span className={`status-badge status-${config.color}`}>{config.text}</span>;
  };

  if (loading) {
    return <div className="loading-container">در حال بارگذاری...</div>;
  }

  return (
    <div className="academic-years-page">
      <div className="page-header">
        <h1>سال‌های تحصیلی</h1>
        <button 
          className="btn btn-primary"
          onClick={() => {
            setEditingYear(null);
            resetForm();
            setShowModal(true);
          }}
        >
          سال تحصیلی جدید
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="academic-years-grid">
        {academicYears.map((year) => (
          <div key={year._id} className="year-card">
            <div className="year-header">
              <h3>{year.title}</h3>
              <div className="year-badges">
                {getStatusBadge(year.status)}
                {year.isCurrent && <span className="current-badge">جاری</span>}
              </div>
            </div>
            
            <div className="year-info">
              <div className="info-row">
                <span>کد:</span>
                <span>{year.code || '-'}</span>
              </div>
              <div className="info-row">
                <span>نوع تقویم:</span>
                <span>{year.calendarType}</span>
              </div>
              <div className="info-row">
                <span>نوع منطقه:</span>
                <span>{year.regionType}</span>
              </div>
              <div className="info-row">
                <span>تاریخ شروع:</span>
                <span>{year.startDateLocal || year.startDate?.split('T')[0] || '-'}</span>
              </div>
              <div className="info-row">
                <span>تاریخ پایان:</span>
                <span>{year.endDateLocal || year.endDate?.split('T')[0] || '-'}</span>
              </div>
            </div>

            <div className="year-actions">
              <button 
                className="btn btn-sm btn-secondary"
                onClick={() => openEditModal(year)}
              >
                ویرایش
              </button>
              
              {year.status !== 'active' && (
                <button 
                  className="btn btn-sm btn-success"
                  onClick={() => handleActivate(year._id)}
                >
                  فعال‌سازی
                </button>
              )}
              
              {year.status === 'active' && (
                <button 
                  className="btn btn-sm btn-warning"
                  onClick={() => handleClose(year._id)}
                >
                  بستن
                </button>
              )}
              
              <button 
                className="btn btn-sm btn-danger"
                onClick={() => handleDelete(year._id)}
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>

      {academicYears.length === 0 && !loading && (
        <div className="empty-state">
          <p>هیچ سال تحصیلی یافت نشد</p>
          <button 
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
          >
            ایجاد سال تحصیلی جدید
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingYear ? 'ویرایش سال تحصیلی' : 'سال تحصیلی جدید'}</h2>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>عنوان سال تحصیلی *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>کد سال تحصیلی</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    placeholder="مثال: 1405"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>نوع تقویم</label>
                  <select
                    value={formData.calendarType}
                    onChange={(e) => setFormData({...formData, calendarType: e.target.value})}
                  >
                    <option value="solar_hijri">هجری شمسی</option>
                    <option value="gregorian">میلادی</option>
                    <option value="lunar_hijri">هجری قمری</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>نوع منطقه</label>
                  <select
                    value={formData.regionType}
                    onChange={(e) => setFormData({...formData, regionType: e.target.value})}
                  >
                    <option value="custom">سفارشی</option>
                    <option value="cold">سرد</option>
                    <option value="warm">گرم</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاریخ شروع (میلادی)</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                  />
                </div>
                <div className="form-group">
                  <label>تاریخ پایان (میلادی)</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>تاریخ شروع (محلی)</label>
                  <input
                    type="text"
                    value={formData.startDateLocal}
                    onChange={(e) => setFormData({...formData, startDateLocal: e.target.value})}
                    placeholder="مثال: 1405-01-01"
                  />
                </div>
                <div className="form-group">
                  <label>تاریخ پایان (محلی)</label>
                  <input
                    type="text"
                    value={formData.endDateLocal}
                    onChange={(e) => setFormData({...formData, endDateLocal: e.target.value})}
                    placeholder="مثال: 1405-12-29"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>یادداشت</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({...formData, note: e.target.value})}
                  rows="3"
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingYear ? 'ویرایش' : 'ایجاد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicYearsPage;
