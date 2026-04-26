import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AfghanSchoolManagement.css';

const AfghanSchoolManagement = () => {
  const navigate = useNavigate();
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    province: 'all',
    schoolType: 'all',
    ownership: 'all',
    search: ''
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSchool, setEditingSchool] = useState(null);

  // Afghan provinces
  const provinces = [
    { code: 'kabul', name: 'کابل' },
    { code: 'herat', name: 'هرات' },
    { code: 'kandahar', name: 'کندهار' },
    { code: 'balkh', name: 'بلخ' },
    { code: 'nangarhar', name: 'ننگرهار' },
    { code: 'badakhshan', name: 'بدخشان' },
    { code: 'takhar', name: 'تخار' },
    { code: 'samangan', name: 'سمنگان' },
    { code: 'kunduz', name: 'قندوز' },
    { code: 'baghlan', name: 'بغلان' },
    { code: 'farah', name: 'فراه' },
    { code: 'nimroz', name: 'نیمروز' },
    { code: 'helmand', name: 'هلمند' },
    { code: 'ghor', name: 'غور' },
    { code: 'daykundi', name: 'دایکوندی' },
    { code: 'uruzgan', name: 'اروزگان' },
    { code: 'zabul', name: 'زابل' },
    { code: 'paktika', name: 'پکتیکا' },
    { code: 'khost', name: 'خوست' },
    { code: 'paktia', name: 'پکتیا' },
    { code: 'logar', name: 'لوگر' },
    { code: 'parwan', name: 'پروان' },
    { code: 'kapisa', name: 'کاپیسا' },
    { code: 'panjshir', name: 'پنجشیر' },
    { code: 'badghis', name: 'بادغیس' },
    { code: 'faryab', name: 'فاریاب' },
    { code: 'jowzjan', name: 'جوزجان' },
    { code: 'saripul', name: 'سرپل' }
  ];

  const schoolTypes = [
    { code: 'primary', name: 'ابتدایی' },
    { code: 'secondary', name: 'متوسطه' },
    { code: 'high', name: 'لیسه' },
    { code: 'mosque', name: 'مسجد' },
    { code: 'madrasa', name: 'مدرسه' },
    { code: 'technical', name: 'فنی' },
    { code: 'private', name: 'خصوصی' }
  ];

  const ownershipTypes = [
    { code: 'government', name: 'دولتی' },
    { code: 'private', name: 'خصوصی' },
    { code: 'ngp', name: 'NGO' },
    { code: 'mosque', name: 'مسجدی' },
    { code: 'community', name: 'اجتماعی' }
  ];

  useEffect(() => {
    fetchSchools();
  }, [currentPage, filters]);

  const fetchSchools = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      params.append('page', currentPage);
      params.append('limit', '20');
      
      if (filters.province !== 'all') params.append('province', filters.province);
      if (filters.schoolType !== 'all') params.append('schoolType', filters.schoolType);
      if (filters.ownership !== 'all') params.append('ownership', filters.ownership);
      if (filters.search) params.append('search', filters.search);
      
      const response = await fetch(`/api/afghan-schools?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setSchools(data.data.schools);
        setTotalPages(data.data.pagination.pages);
      } else {
        setError(data.message || 'خطا در دریافت اطلاعات مکاتب');
      }
    } catch (err) {
      setError('خطا در اتصال به سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleEdit = (school) => {
    setEditingSchool(school);
    setShowAddModal(true);
  };

  const handleDelete = async (schoolId) => {
    if (!window.confirm('آیا از حذف این مکتب مطمئن هستید؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/afghan-schools/${schoolId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      
      if (data.success) {
        fetchSchools();
      } else {
        setError(data.message || 'خطا در حذف مکتب');
      }
    } catch (err) {
      setError('خطا در اتصال به سرور');
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fa-AF').format(num);
  };

  const getProvinceName = (code) => {
    const province = provinces.find(p => p.code === code);
    return province ? province.name : code;
  };

  const getSchoolTypeName = (code) => {
    const type = schoolTypes.find(t => t.code === code);
    return type ? type.name : code;
  };

  const getOwnershipName = (code) => {
    const type = ownershipTypes.find(t => t.code === code);
    return type ? type.name : code;
  };

  if (loading) {
    return (
      <div className="school-management loading">
        <div className="loading-spinner"></div>
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  return (
    <div className="school-management">
      <header className="management-header">
        <h1>مدیریت مکاتب افغانستان</h1>
        <div className="header-actions">
          <button 
            onClick={() => navigate('/afghan-dashboard')}
            className="dashboard-btn"
          >
            بازگشت به داشبورد
          </button>
          <button 
            onClick={() => navigate('/afghan-map')}
            className="map-btn"
          >
            مشاهده نقشه
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="add-btn"
          >
            ثبت مکتب جدید
          </button>
        </div>
      </header>

      {/* Filters */}
      <section className="filters-section">
        <h2>فیلترها</h2>
        <div className="filters-grid">
          <div className="filter-group">
            <label>جستجو:</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="نام مکتب یا کد..."
              className="filter-input"
            />
          </div>
          
          <div className="filter-group">
            <label>ولایت:</label>
            <select
              value={filters.province}
              onChange={(e) => handleFilterChange('province', e.target.value)}
              className="filter-select"
            >
              <option value="all">همه ولایت‌ها</option>
              {provinces.map(province => (
                <option key={province.code} value={province.code}>
                  {province.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>نوع مکتب:</label>
            <select
              value={filters.schoolType}
              onChange={(e) => handleFilterChange('schoolType', e.target.value)}
              className="filter-select"
            >
              <option value="all">همه انواع</option>
              {schoolTypes.map(type => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="filter-group">
            <label>مالکیت:</label>
            <select
              value={filters.ownership}
              onChange={(e) => handleFilterChange('ownership', e.target.value)}
              className="filter-select"
            >
              <option value="all">همه مالکیت‌ها</option>
              {ownershipTypes.map(type => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError('')} className="close-error">×</button>
        </div>
      )}

      {/* Schools Table */}
      <section className="schools-section">
        <div className="section-header">
          <h2>لیست مکاتب ({formatNumber(schools.length)})</h2>
        </div>
        
        <div className="table-container">
          <table className="schools-table">
            <thead>
              <tr>
                <th>نام مکتب</th>
                <th>کد مکتب</th>
                <th>ولایت</th>
                <th>نوع</th>
                <th>مالکیت</th>
                <th>دانش‌آموزان</th>
                <th>معلمان</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {schools.map(school => (
                <tr key={school._id}>
                  <td>
                    <div className="school-name">
                      <div className="name-primary">{school.name}</div>
                      <div className="name-dari">{school.nameDari}</div>
                    </div>
                  </td>
                  <td>{school.schoolCode}</td>
                  <td>{getProvinceName(school.province)}</td>
                  <td>{getSchoolTypeName(school.schoolType)}</td>
                  <td>{getOwnershipName(school.ownership)}</td>
                  <td>{formatNumber(school.academicInfo?.totalStudents || 0)}</td>
                  <td>{formatNumber(school.academicInfo?.totalTeachers || 0)}</td>
                  <td>
                    <span className={`status-badge ${school.status}`}>
                      {school.status === 'active' ? 'فعال' : 'غیرفعال'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button 
                        onClick={() => navigate(`/afghan-schools/${school._id}`)}
                        className="action-btn view"
                      >
                        مشاهده
                      </button>
                      <button 
                        onClick={() => handleEdit(school)}
                        className="action-btn edit"
                      >
                        ویرایش
                      </button>
                      <button 
                        onClick={() => handleDelete(school._id)}
                        className="action-btn delete"
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button 
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              قبلی
            </button>
            
            <div className="page-numbers">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`page-btn ${currentPage === page ? 'active' : ''}`}
                >
                  {page}
                </button>
              ))}
            </div>
            
            <button 
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              بعدی
            </button>
          </div>
        )}
      </section>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>{editingSchool ? 'ویرایش مکتب' : 'ثبت مکتب جدید'}</h2>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSchool(null);
                }}
                className="close-modal"
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <form className="school-form">
                <div className="form-grid">
                  <div className="form-group">
                    <label>نام مکتب (انگلیسی):</label>
                    <input type="text" name="name" required />
                  </div>
                  
                  <div className="form-group">
                    <label>نام مکتب (دری):</label>
                    <input type="text" name="nameDari" required />
                  </div>
                  
                  <div className="form-group">
                    <label>کد مکتب:</label>
                    <input type="text" name="schoolCode" required />
                  </div>
                  
                  <div className="form-group">
                    <label>کد وزارتی:</label>
                    <input type="text" name="ministryCode" required />
                  </div>
                  
                  <div className="form-group">
                    <label>ولایت:</label>
                    <select name="province" required>
                      <option value="">انتخاب کنید...</option>
                      {provinces.map(province => (
                        <option key={province.code} value={province.code}>
                          {province.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>ولسوالی:</label>
                    <input type="text" name="district" required />
                  </div>
                  
                  <div className="form-group">
                    <label>نوع مکتب:</label>
                    <select name="schoolType" required>
                      <option value="">انتخاب کنید...</option>
                      {schoolTypes.map(type => (
                        <option key={type.code} value={type.code}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>سطح مکتب:</label>
                    <select name="schoolLevel" required>
                      <option value="">انتخاب کنید...</option>
                      <option value="grade1_6">صنف اول تا ششم</option>
                      <option value="grade7_9">صنف هفتم تا نهم</option>
                      <option value="grade10_12">صرف دهم تا دوازدهم</option>
                      <option value="grade1_12">صرف اول تا دوازدهم</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>مالکیت:</label>
                    <select name="ownership" required>
                      <option value="">انتخاب کنید...</option>
                      {ownershipTypes.map(type => (
                        <option key={type.code} value={type.code}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label>تاریخ تاسیس:</label>
                    <input type="date" name="establishmentDate" required />
                  </div>
                  
                  <div className="form-group full-width">
                    <label>آدرس:</label>
                    <input type="text" name="address" required />
                  </div>
                  
                  <div className="form-group full-width">
                    <label>تلفن:</label>
                    <input type="tel" name="phone" />
                  </div>
                  
                  <div className="form-group full-width">
                    <label>ایمیل:</label>
                    <input type="email" name="email" />
                  </div>
                </div>
              </form>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setEditingSchool(null);
                }}
                className="cancel-btn"
              >
                انصراف
              </button>
              <button className="save-btn">
                {editingSchool ? 'ویرایش' : 'ثبت'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AfghanSchoolManagement;
