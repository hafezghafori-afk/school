import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AfghanSchoolDashboard.css';

const AfghanSchoolDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState('all');
  const [error, setError] = useState('');

  // Afghan provinces in Persian
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

  useEffect(() => {
    fetchDashboardData();
  }, [selectedProvince]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const url = selectedProvince === 'all' 
        ? '/api/afghan-schools/dashboard'
        : `/api/afghan-schools/dashboard?province=${selectedProvince}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setDashboardData(data.data);
      } else {
        setError(data.message || 'خطا در دریافت اطلاعات');
      }
    } catch (err) {
      setError('خطا در اتصال به سرور');
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fa-AF').format(num);
  };

  const getProvinceName = (code) => {
    const province = provinces.find(p => p.code === code);
    return province ? province.name : code;
  };

  if (loading) {
    return (
      <div className="afghan-dashboard loading">
        <div className="loading-spinner"></div>
        <p>در حال بارگذاری...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="afghan-dashboard error">
        <div className="error-message">
          <h3>خطا</h3>
          <p>{error}</p>
          <button onClick={fetchDashboardData} className="retry-btn">
            تلاش مجدد
          </button>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return null;
  }

  return (
    <div className="afghan-dashboard">
      <header className="dashboard-header">
        <h1>داشبورد مدیریتی مکاتب افغانستان</h1>
        <div className="header-controls">
          <select 
            value={selectedProvince} 
            onChange={(e) => setSelectedProvince(e.target.value)}
            className="province-selector"
          >
            <option value="all">تمام ولایت‌ها</option>
            {provinces.map(province => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
          <button 
            onClick={() => navigate('/afghan-schools')}
            className="view-schools-btn"
          >
            مشاهده مکاتب
          </button>
        </div>
      </header>

      {/* National Statistics */}
      <section className="stats-overview">
        <h2>آمار کلی {selectedProvince === 'all' ? 'کشور' : getProvinceName(selectedProvince)}</h2>
        <div className="stats-grid">
          <div className="stat-card schools">
            <div className="stat-icon">🏫</div>
            <div className="stat-content">
              <h3>{formatNumber(dashboardData.totalSchools || 0)}</h3>
              <p>مجموع مکاتب</p>
            </div>
          </div>
          <div className="stat-card students">
            <div className="stat-icon">👨‍🎓</div>
            <div className="stat-content">
              <h3>{formatNumber(dashboardData.totalStudents || 0)}</h3>
              <p>مجموع دانش‌آموزان</p>
            </div>
          </div>
          <div className="stat-card teachers">
            <div className="stat-icon">👩‍🏫</div>
            <div className="stat-content">
              <h3>{formatNumber(dashboardData.totalTeachers || 0)}</h3>
              <p>مجموع معلمان</p>
            </div>
          </div>
          <div className="stat-card ratio">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>{dashboardData.averageStudentTeacherRatio || 0}</h3>
              <p>نسبت دانش‌آموز به معلم</p>
            </div>
          </div>
        </div>
      </section>

      {/* Gender Distribution */}
      <section className="gender-distribution">
        <h2>توزیع جنسیتی</h2>
        <div className="gender-grid">
          <div className="gender-card male">
            <h3>دانش‌آموزان پسر</h3>
            <div className="gender-stats">
              <div className="stat-number">{formatNumber(dashboardData.maleStudents || 0)}</div>
              <div className="stat-percentage">
                {dashboardData.totalStudents > 0 
                  ? Math.round((dashboardData.maleStudents / dashboardData.totalStudents) * 100)
                  : 0}%
              </div>
            </div>
          </div>
          <div className="gender-card female">
            <h3>دانش‌آموزان دختر</h3>
            <div className="gender-stats">
              <div className="stat-number">{formatNumber(dashboardData.femaleStudents || 0)}</div>
              <div className="stat-percentage">
                {dashboardData.totalStudents > 0 
                  ? Math.round((dashboardData.femaleStudents / dashboardData.totalStudents) * 100)
                  : 0}%
              </div>
            </div>
          </div>
          <div className="gender-card male">
            <h3>معلمان مرد</h3>
            <div className="gender-stats">
              <div className="stat-number">{formatNumber(dashboardData.maleTeachers || 0)}</div>
              <div className="stat-percentage">
                {dashboardData.totalTeachers > 0 
                  ? Math.round((dashboardData.maleTeachers / dashboardData.totalTeachers) * 100)
                  : 0}%
              </div>
            </div>
          </div>
          <div className="gender-card female">
            <h3>معلمان زن</h3>
            <div className="gender-stats">
              <div className="stat-number">{formatNumber(dashboardData.femaleTeachers || 0)}</div>
              <div className="stat-percentage">
                {dashboardData.totalTeachers > 0 
                  ? Math.round((dashboardData.femaleTeachers / dashboardData.totalTeachers) * 100)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* School Types */}
      <section className="school-types">
        <h2>نوع مکاتب</h2>
        <div className="school-types-grid">
          <div className="school-type-card government">
            <div className="type-icon">🏛️</div>
            <div className="type-content">
              <h3>مکاتب دولتی</h3>
              <div className="type-number">{formatNumber(dashboardData.governmentSchools || 0)}</div>
            </div>
          </div>
          <div className="school-type-card private">
            <div className="type-icon">🏢</div>
            <div className="type-content">
              <h3>مکاتب خصوصی</h3>
              <div className="type-number">{formatNumber(dashboardData.privateSchools || 0)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Province Breakdown */}
      {selectedProvince === 'all' && (
        <section className="province-breakdown">
          <h2>آمار به تفکیک ولایت‌ها</h2>
          <div className="province-grid">
            {Object.entries(dashboardData.provinces || {})
              .sort(([,a], [,b]) => b.totalSchools - a.totalSchools)
              .slice(0, 12)
              .map(([provinceCode, data]) => (
                <div key={provinceCode} className="province-card">
                  <h3>{getProvinceName(provinceCode)}</h3>
                  <div className="province-stats">
                    <div className="province-stat">
                      <span className="label">مکاتب:</span>
                      <span className="value">{formatNumber(data.totalSchools)}</span>
                    </div>
                    <div className="province-stat">
                      <span className="label">دانش‌آموزان:</span>
                      <span className="value">{formatNumber(data.totalStudents)}</span>
                    </div>
                    <div className="province-stat">
                      <span className="label">معلمان:</span>
                      <span className="value">{formatNumber(data.totalTeachers)}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="quick-actions">
        <h2>اقدامات سریع</h2>
        <div className="actions-grid">
          <button 
            onClick={() => navigate('/afghan-schools/new')}
            className="action-btn primary"
          >
            <span className="btn-icon">➕</span>
            <span className="btn-text">ثبت مکتب جدید</span>
          </button>
          <button 
            onClick={() => navigate('/afghan-students/new')}
            className="action-btn secondary"
          >
            <span className="btn-icon">👨‍🎓</span>
            <span className="btn-text">ثبت دانش‌آموز جدید</span>
          </button>
          <button 
            onClick={() => navigate('/afghan-teachers/new')}
            className="action-btn secondary"
          >
            <span className="btn-icon">👩‍🏫</span>
            <span className="btn-text">ثبت معلم جدید</span>
          </button>
          <button 
            onClick={() => navigate('/afghan-reports')}
            className="action-btn tertiary"
          >
            <span className="btn-icon">📊</span>
            <span className="btn-text">گزارشات</span>
          </button>
          <button 
            onClick={() => navigate('/afghan-map')}
            className="action-btn tertiary"
          >
            <span className="btn-icon">🗺️</span>
            <span className="btn-text">نقشه مکاتب</span>
          </button>
          <button 
            onClick={() => navigate('/afghan-settings')}
            className="action-btn tertiary"
          >
            <span className="btn-icon">⚙️</span>
            <span className="btn-text">تنظیمات</span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default AfghanSchoolDashboard;
