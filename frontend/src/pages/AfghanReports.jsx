import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AfghanReports.css';

const AfghanReports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState('annual');
  const [year, setYear] = useState(new Date().getFullYear());
  const [province, setProvince] = useState('all');
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState('');

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

  const reportTypes = [
    { code: 'annual', name: 'گزارش سالانه' },
    { code: 'provincial', name: 'گزارش ولایتی' },
    { code: 'school_types', name: 'گزارش انواع مکاتب' },
    { code: 'gender', name: 'گزارش جنسیتی' },
    { code: 'performance', name: 'گزارش عملکردی' }
  ];

  useEffect(() => {
    if (reportType && year) {
      generateReport();
    }
  }, [reportType, year, province]);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError('');
      
      let url = '';
      const params = new URLSearchParams();
      
      switch (reportType) {
        case 'annual':
          url = '/api/afghan-schools/reports/annual';
          params.append('year', year);
          break;
        case 'provincial':
          url = '/api/afghan-schools/provinces/stats';
          break;
        default:
          url = '/api/afghan-schools/dashboard';
          if (province !== 'all') {
            params.append('province', province);
          }
      }
      
      const response = await fetch(`${url}?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setReportData(data.data);
      } else {
        setError(data.message || 'خطا در دریافت گزارش');
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

  const exportToPDF = () => {
    // Placeholder for PDF export functionality
    alert('قابلیت خروجی PDF در حال توسعه است');
  };

  const exportToExcel = () => {
    // Placeholder for Excel export functionality
    alert('قابلیت خروجی Excel در حال توسعه است');
  };

  if (loading) {
    return (
      <div className="afghan-reports loading">
        <div className="loading-spinner"></div>
        <p>در حال تولید گزارش...</p>
      </div>
    );
  }

  return (
    <div className="afghan-reports">
      <header className="reports-header">
        <h1>گزارشات سیستم آموزشی افغانستان</h1>
        <div className="header-actions">
          <button 
            onClick={() => navigate('/afghan-dashboard')}
            className="dashboard-btn"
          >
            بازگشت به داشبورد
          </button>
        </div>
      </header>

      {/* Report Controls */}
      <section className="report-controls">
        <div className="controls-grid">
          <div className="control-group">
            <label>نوع گزارش:</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="control-select"
            >
              {reportTypes.map(type => (
                <option key={type.code} value={type.code}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label>سال:</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="control-select"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={y}>
                  {y} - {y + 1}
                </option>
              ))}
            </select>
          </div>

          {(reportType === 'provincial' || reportType === 'performance') && (
            <div className="control-group">
              <label>ولایت:</label>
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                className="control-select"
              >
                <option value="all">همه ولایت‌ها</option>
                {provinces.map(province => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="control-group">
            <button onClick={generateReport} className="generate-btn">
              تولید گزارش
            </button>
          </div>
        </div>

        <div className="export-actions">
          <button onClick={exportToPDF} className="export-btn pdf">
            خروجی PDF
          </button>
          <button onClick={exportToExcel} className="export-btn excel">
            خروجی Excel
          </button>
        </div>
      </section>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError('')} className="close-error">×</button>
        </div>
      )}

      {/* Report Content */}
      {reportData && (
        <section className="report-content">
          {/* Annual Report */}
          {reportType === 'annual' && (
            <div className="annual-report">
              <h2>گزارش سالانه آموزشی {year} - {year + 1}</h2>
              
              <div className="report-summary">
                <div className="summary-cards">
                  <div className="summary-card">
                    <h3>مجموع مکاتب</h3>
                    <div className="summary-value">{formatNumber(reportData.summary.totalSchools)}</div>
                    <div className="summary-change">
                      جدید: +{formatNumber(reportData.summary.newSchools)}
                    </div>
                  </div>
                  <div className="summary-card">
                    <h3>مجموع دانش‌آموزان</h3>
                    <div className="summary-value">{formatNumber(reportData.summary.totalStudents)}</div>
                  </div>
                  <div className="summary-card">
                    <h3>مجموع معلمان</h3>
                    <div className="summary-value">{formatNumber(reportData.summary.totalTeachers)}</div>
                  </div>
                </div>
              </div>

              {/* Provincial Breakdown */}
              <div className="provincial-breakdown">
                <h3>آمار به تفکیک ولایت‌ها</h3>
                <div className="province-grid">
                  {Object.entries(reportData.provinces)
                    .sort(([,a], [,b]) => b.totalSchools - a.totalSchools)
                    .slice(0, 10)
                    .map(([provinceCode, data]) => (
                      <div key={provinceCode} className="province-card">
                        <h4>{getProvinceName(provinceCode)}</h4>
                        <div className="province-stats">
                          <div className="stat-row">
                            <span>مکاتب:</span>
                            <span>{formatNumber(data.totalSchools)}</span>
                          </div>
                          <div className="stat-row">
                            <span>دانش‌آموزان:</span>
                            <span>{formatNumber(data.totalStudents)}</span>
                          </div>
                          <div className="stat-row">
                            <span>معلمان:</span>
                            <span>{formatNumber(data.totalTeachers)}</span>
                          </div>
                          <div className="stat-row">
                            <span>نسبت:</span>
                            <span>{data.averageStudentTeacherRatio}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* School Types */}
              <div className="school-types-report">
                <h3>توزیع انواع مکاتب</h3>
                <div className="types-grid">
                  {Object.entries(reportData.schoolTypes).map(([type, count]) => (
                    <div key={type} className="type-card">
                      <h4>{type}</h4>
                      <div className="type-count">{formatNumber(count)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ownership Types */}
              <div className="ownership-report">
                <h3>مالکیت مکاتب</h3>
                <div className="ownership-grid">
                  {Object.entries(reportData.ownershipTypes).map(([type, count]) => (
                    <div key={type} className="ownership-card">
                      <h4>{type}</h4>
                      <div className="ownership-count">{formatNumber(count)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Provincial Report */}
          {reportType === 'provincial' && (
            <div className="provincial-report">
              <h2>گزارش ولایتی</h2>
              <div className="province-comparison">
                {Object.entries(reportData)
                  .sort(([,a], [,b]) => b.totalSchools - a.totalSchools)
                  .map(([provinceCode, data]) => (
                    <div key={provinceCode} className="province-comparison-card">
                      <h3>{getProvinceName(provinceCode)}</h3>
                      <div className="comparison-stats">
                        <div className="stat-item">
                          <span className="stat-label">مکاتب:</span>
                          <span className="stat-value">{formatNumber(data.totalSchools)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">دانش‌آموزان:</span>
                          <span className="stat-value">{formatNumber(data.totalStudents)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">معلمان:</span>
                          <span className="stat-value">{formatNumber(data.totalTeachers)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">پسران:</span>
                          <span className="stat-value">{formatNumber(data.maleStudents)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">دختران:</span>
                          <span className="stat-value">{formatNumber(data.femaleStudents)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">دولتی:</span>
                          <span className="stat-value">{formatNumber(data.governmentSchools)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">خصوصی:</span>
                          <span className="stat-value">{formatNumber(data.privateSchools)}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">نسبت:</span>
                          <span className="stat-value">{data.averageStudentTeacherRatio}</span>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Dashboard Report */}
          {(reportType === 'school_types' || reportType === 'gender' || reportType === 'performance') && (
            <div className="dashboard-report">
              <h2>
                {reportType === 'school_types' && 'گزارش انواع مکاتب'}
                {reportType === 'gender' && 'گزارش جنسیتی'}
                {reportType === 'performance' && 'گزارش عملکردی'}
              </h2>
              
              <div className="report-stats">
                <div className="stats-grid">
                  <div className="stat-card">
                    <h3>مجموع مکاتب</h3>
                    <div className="stat-value">{formatNumber(reportData.totalSchools)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>مجموع دانش‌آموزان</h3>
                    <div className="stat-value">{formatNumber(reportData.totalStudents)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>مجموع معلمان</h3>
                    <div className="stat-value">{formatNumber(reportData.totalTeachers)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>پسران</h3>
                    <div className="stat-value">{formatNumber(reportData.maleStudents)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>دختران</h3>
                    <div className="stat-value">{formatNumber(reportData.femaleStudents)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>معلمان مرد</h3>
                    <div className="stat-value">{formatNumber(reportData.maleTeachers)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>معلمان زن</h3>
                    <div className="stat-value">{formatNumber(reportData.femaleTeachers)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>مکاتب دولتی</h3>
                    <div className="stat-value">{formatNumber(reportData.governmentSchools)}</div>
                  </div>
                  <div className="stat-card">
                    <h3>مکاتب خصوصی</h3>
                    <div className="stat-value">{formatNumber(reportData.privateSchools)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default AfghanReports;
