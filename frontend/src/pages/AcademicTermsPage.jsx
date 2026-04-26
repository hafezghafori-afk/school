import React, { useState, useEffect } from 'react';
import './AcademicTermsPage.css';

const AcademicTermsPage = () => {
  const [academicYears, setAcademicYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [formData, setFormData] = useState({
    academicYearId: '',
    title: '',
    code: '',
    name: '',
    order: 1,
    type: 'quarter',
    startDate: '',
    endDate: '',
    startDateLocal: '',
    endDateLocal: '',
    note: ''
  });
  const [generateData, setGenerateData] = useState({
    type: 'quarter'
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchAcademicYears();
  }, []);

  useEffect(() => {
    if (selectedYear) {
      fetchTerms();
    } else {
      setTerms([]);
    }
  }, [selectedYear]);

  const fetchAcademicYears = async () => {
    try {
      // Mock school ID - in real app, get from context/auth
      const schoolId = '507f1f77bcf86cd799439011';
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data);
        if (data.data.length > 0) {
          const currentYear = data.data.find(y => y.isCurrent) || data.data[0];
          setSelectedYear(currentYear._id);
        }
      } else {
        setError('خطا در دریافت سال‌های تحصیلی');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const fetchTerms = async () => {
    if (!selectedYear) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/academic-terms/academic-year/${selectedYear}`);
      const data = await response.json();
      
      if (data.success) {
        setTerms(data.data);
      } else {
        setError('خطا در دریافت ترم‌ها');
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
      const url = editingTerm 
        ? `/api/academic-terms/${editingTerm._id}`
        : '/api/academic-terms';
      
      const method = editingTerm ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          academicYearId: selectedYear
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(editingTerm ? 'ترم با موفقیت ویرایش شد' : 'ترم با موفقیت ایجاد شد');
        setShowModal(false);
        setEditingTerm(null);
        resetForm();
        fetchTerms();
      } else {
        setError(data.message || 'خطا در ذخیره ترم');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleGenerateTerms = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`/api/academic-terms/academic-year/${selectedYear}/generate-terms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(generateData)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(`${data.data.length} ترم با موفقیت ایجاد شد`);
        setShowGenerateModal(false);
        setGenerateData({ type: 'quarter' });
        fetchTerms();
      } else {
        setError(data.message || 'خطا در ایجاد ترم‌ها');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleActivate = async (termId) => {
    try {
      const response = await fetch(`/api/academic-terms/${termId}/activate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('ترم با موفقیت فعال شد');
        fetchTerms();
      } else {
        setError(data.message || 'خطا در فعال‌سازی ترم');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleClose = async (termId) => {
    try {
      const response = await fetch(`/api/academic-terms/${termId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('ترم با موفقیت بسته شد');
        fetchTerms();
      } else {
        setError(data.message || 'خطا در بستن ترم');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleDelete = async (termId) => {
    if (!confirm('آیا از حذف این ترم مطمئن هستید؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/academic-terms/${termId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('ترم با موفقیت حذف شد');
        fetchTerms();
      } else {
        setError(data.message || 'خطا در حذف ترم');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const openEditModal = (term) => {
    setEditingTerm(term);
    setFormData({
      academicYearId: term.academicYearId || '',
      title: term.title || '',
      code: term.code || '',
      name: term.name || '',
      order: term.order || 1,
      type: term.type || 'quarter',
      startDate: term.startDate ? term.startDate.split('T')[0] : '',
      endDate: term.endDate ? term.endDate.split('T')[0] : '',
      startDateLocal: term.startDateLocal || '',
      endDateLocal: term.endDateLocal || '',
      note: term.note || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      academicYearId: '',
      title: '',
      code: '',
      name: '',
      order: 1,
      type: 'quarter',
      startDate: '',
      endDate: '',
      startDateLocal: '',
      endDateLocal: '',
      note: ''
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      planned: { color: 'orange', text: 'برنامه‌ریزی شده' },
      active: { color: 'green', text: 'فعال' },
      closed: { color: 'red', text: 'بسته شده' }
    };
    
    const config = statusConfig[status] || { color: 'gray', text: status };
    return <span className={`status-badge status-${config.color}`}>{config.text}</span>;
  };

  const getTypeBadge = (type) => {
    const typeConfig = {
      quarter: { color: 'blue', text: 'ربع' },
      semester: { color: 'purple', text: 'سمستر' },
      exam_period: { color: 'red', text: 'دوره امتحان' },
      assessment_period: { color: 'orange', text: 'دوره ارزیابی' },
      term: { color: 'green', text: 'ترم' }
    };
    
    const config = typeConfig[type] || { color: 'gray', text: type };
    return <span className={`type-badge type-${config.color}`}>{config.text}</span>;
  };

  const getSelectedYearTitle = () => {
    const year = academicYears.find(y => y._id === selectedYear);
    return year ? year.title : '';
  };

  return (
    <div className="academic-terms-page">
      <div className="page-header">
        <div className="header-content">
          <h1>ترم‌های تحصیلی</h1>
          <div className="year-selector">
            <label>سال تحصیلی:</label>
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              {academicYears.map(year => (
                <option key={year._id} value={year._id}>
                  {year.title} {year.isCurrent && '(جاری)'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowGenerateModal(true)}
            disabled={!selectedYear}
          >
            ایجاد خودکار ترم‌ها
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => {
              setEditingTerm(null);
              resetForm();
              setShowModal(true);
            }}
            disabled={!selectedYear}
          >
            ترم جدید
          </button>
        </div>
      </div>

      {selectedYear && (
        <div className="year-info-bar">
          <h3>{getSelectedYearTitle()}</h3>
          <div className="terms-summary">
            <span>کل ترم‌ها: {terms.length}</span>
            <span>فعال: {terms.filter(t => t.isActive).length}</span>
            <span>بسته شده: {terms.filter(t => t.status === 'closed').length}</span>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {loading ? (
        <div className="loading-container">در حال بارگذاری...</div>
      ) : (
        <div className="terms-container">
          {terms.length > 0 ? (
            <div className="terms-grid">
              {terms.map((term) => (
                <div key={term._id} className="term-card">
                  <div className="term-header">
                    <h3>{term.name}</h3>
                    <div className="term-badges">
                      {getStatusBadge(term.status)}
                      {getTypeBadge(term.type)}
                      {term.isActive && <span className="active-badge">فعال</span>}
                    </div>
                  </div>
                  
                  <div className="term-info">
                    <div className="info-row">
                      <span>عنوان:</span>
                      <span>{term.title}</span>
                    </div>
                    <div className="info-row">
                      <span>کد:</span>
                      <span>{term.code || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span>ترتیب:</span>
                      <span>{term.order}</span>
                    </div>
                    <div className="info-row">
                      <span>تاریخ شروع:</span>
                      <span>{term.startDateLocal || term.startDate?.split('T')[0] || '-'}</span>
                    </div>
                    <div className="info-row">
                      <span>تاریخ پایان:</span>
                      <span>{term.endDateLocal || term.endDate?.split('T')[0] || '-'}</span>
                    </div>
                  </div>

                  <div className="term-actions">
                    <button 
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEditModal(term)}
                    >
                      ویرایش
                    </button>
                    
                    {term.status !== 'active' && (
                      <button 
                        className="btn btn-sm btn-success"
                        onClick={() => handleActivate(term._id)}
                      >
                        فعال‌سازی
                      </button>
                    )}
                    
                    {term.status === 'active' && (
                      <button 
                        className="btn btn-sm btn-warning"
                        onClick={() => handleClose(term._id)}
                      >
                        بستن
                      </button>
                    )}
                    
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDelete(term._id)}
                    >
                      حذف
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>هیچ ترمی برای این سال تحصیلی یافت نشد</p>
              <div className="empty-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => setShowGenerateModal(true)}
                >
                  ایجاد خودکار ترم‌ها
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowModal(true)}
                >
                  ایجاد ترم دستی
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Term Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingTerm ? 'ویرایش ترم' : 'ترم جدید'}</h2>
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
                  <label>عنوان ترم *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>کد ترم</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    placeholder="مثال: Q1"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>نام ترم *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    placeholder="مثال: ربع اول"
                  />
                </div>
                <div className="form-group">
                  <label>ترتیب</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({...formData, order: parseInt(e.target.value) || 1})}
                    min="1"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>نوع ترم</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="quarter">ربع</option>
                    <option value="semester">سمستر</option>
                    <option value="term">ترم</option>
                    <option value="exam_period">دوره امتحان</option>
                    <option value="assessment_period">دوره ارزیابی</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>&nbsp;</label>
                  <div className="form-hint">
                    ترتیب برای مرتب‌سازی ترم‌ها استفاده می‌شود
                  </div>
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
                    placeholder="مثال: 1405-03-31"
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
                  {editingTerm ? 'ویرایش' : 'ایجاد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Terms Modal */}
      {showGenerateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>ایجاد خودکار ترم‌ها</h2>
              <button 
                className="modal-close"
                onClick={() => setShowGenerateModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleGenerateTerms} className="modal-form">
              <div className="form-group">
                <label>نوع ترم‌ها</label>
                <select
                  value={generateData.type}
                  onChange={(e) => setGenerateData({...generateData, type: e.target.value})}
                >
                  <option value="quarter">4 ربع (فصلی)</option>
                  <option value="semester">2 سمستر</option>
                  <option value="term">3 ترم</option>
                </select>
              </div>

              <div className="generate-preview">
                <h4>پیش‌نمایش ترم‌هایی که ایجاد خواهند شد:</h4>
                {generateData.type === 'quarter' && (
                  <ul>
                    <li>ربع اول (Q1)</li>
                    <li>ربع دوم (Q2)</li>
                    <li>ربع سوم (Q3)</li>
                    <li>ربع چهارم (Q4)</li>
                  </ul>
                )}
                {generateData.type === 'semester' && (
                  <ul>
                    <li>سمستر اول (S1)</li>
                    <li>سمستر دوم (S2)</li>
                  </ul>
                )}
                {generateData.type === 'term' && (
                  <ul>
                    <li>ترم اول (T1)</li>
                    <li>ترم دوم (T2)</li>
                    <li>ترم سوم (T3)</li>
                  </ul>
                )}
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowGenerateModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  ایجاد ترم‌ها
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcademicTermsPage;
