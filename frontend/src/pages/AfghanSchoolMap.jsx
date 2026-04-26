import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './AfghanSchoolMap.css';

const AfghanSchoolMap = () => {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState([]);
  const [selectedProvince, setSelectedProvince] = useState('all');
  const [selectedSchoolType, setSelectedSchoolType] = useState('all');
  const [selectedOwnership, setSelectedOwnership] = useState('all');
  const [error, setError] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [mapCenter, setMapCenter] = useState([33.9391, 67.7109]); // Center of Afghanistan
  const [mapZoom, setMapZoom] = useState(6);

  // Afghan provinces with coordinates
  const provinces = [
    { code: 'kabul', name: 'کابل', center: [34.5167, 69.1833] },
    { code: 'herat', name: 'هرات', center: [34.3508, 62.2043] },
    { code: 'kandahar', name: 'کندهار', center: [31.6205, 65.7320] },
    { code: 'balkh', name: 'بلخ', center: [36.7464, 66.8965] },
    { code: 'nangarhar', name: 'ننگرهار', center: [34.4333, 70.4667] },
    { code: 'badakhshan', name: 'بدخشان', center: [37.7167, 70.8167] },
    { code: 'takhar', name: 'تخار', center: [36.7333, 69.9667] },
    { code: 'samangan', name: 'سمنگان', center: [36.2500, 67.6167] },
    { code: 'kunduz', name: 'قندوز', center: [36.8500, 68.8500] },
    { code: 'baghlan', name: 'بغلان', center: [36.2167, 68.7000] },
    { code: 'farah', name: 'فراه', center: [32.3667, 62.3667] },
    { code: 'nimroz', name: 'نیمروز', center: [31.0000, 62.5000] },
    { code: 'helmand', name: 'هلمند', center: [31.6000, 64.8500] },
    { code: 'ghor', name: 'غور', center: [33.5500, 65.2500] },
    { code: 'daykundi', name: 'دایکوندی', center: [33.9167, 66.0833] },
    { code: 'uruzgan', name: 'اروزگان', center: [32.9333, 66.6167] },
    { code: 'zabul', name: 'زابل', center: [32.1333, 67.2167] },
    { code: 'paktika', name: 'پکتیکا', center: [32.1000, 68.8500] },
    { code: 'khost', name: 'خوست', center: [33.3333, 70.0000] },
    { code: 'paktia', name: 'پکتیا', center: [33.9167, 69.1500] },
    { code: 'logar', name: 'لوگر', center: [33.9167, 69.1833] },
    { code: 'parwan', name: 'پروان', center: [35.0667, 69.0000] },
    { code: 'kapisa', name: 'کاپیسا', center: [35.0167, 69.6333] },
    { code: 'panjshir', name: 'پنجشیر', center: [35.4167, 69.4833] },
    { code: 'badghis', name: 'بادغیس', center: [34.9833, 63.0500] },
    { code: 'faryab', name: 'فاریاب', center: [36.5833, 64.8667] },
    { code: 'jowzjan', name: 'جوزجان', center: [36.7000, 65.8333] },
    { code: 'saripul', name: 'سرپل', center: [36.2167, 66.0167] }
  ];

  const schoolTypes = [
    { code: 'all', name: 'همه انواع' },
    { code: 'primary', name: 'ابتدایی' },
    { code: 'secondary', name: 'متوسطه' },
    { code: 'high', name: 'لیسه' },
    { code: 'mosque', name: 'مسجد' },
    { code: 'madrasa', name: 'مدرسه' },
    { code: 'technical', name: 'فنی' },
    { code: 'private', name: 'خصوصی' }
  ];

  const ownershipTypes = [
    { code: 'all', name: 'همه مالکیت‌ها' },
    { code: 'government', name: 'دولتی' },
    { code: 'private', name: 'خصوصی' },
    { code: 'ngp', name: 'NGO' },
    { code: 'mosque', name: 'مسجدی' },
    { code: 'community', name: 'اجتماعی' }
  ];

  useEffect(() => {
    fetchSchools();
  }, [selectedProvince, selectedSchoolType, selectedOwnership]);

  useEffect(() => {
    if (window.L && window.L.map) {
      initializeMap();
    } else {
      loadLeaflet();
    }
  }, []);

  const loadLeaflet = () => {
    // Load Leaflet CSS
    const leafletCSS = document.createElement('link');
    leafletCSS.rel = 'stylesheet';
    leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(leafletCSS);

    // Load Leaflet JS
    const leafletJS = document.createElement('script');
    leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leafletJS.onload = initializeMap;
    document.head.appendChild(leafletJS);
  };

  const initializeMap = () => {
    if (!window.L || !mapRef.current) return;

    const map = window.L.map(mapRef.current).setView(mapCenter, mapZoom);

    // Add OpenStreetMap tiles
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Store map instance
    window.currentMap = map;
  };

  const fetchSchools = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      if (selectedProvince !== 'all') params.append('province', selectedProvince);
      if (selectedSchoolType !== 'all') params.append('schoolType', selectedSchoolType);
      if (selectedOwnership !== 'all') params.append('ownership', selectedOwnership);
      
      const response = await fetch(`/api/afghan-schools/map-data?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setSchools(data.data);
        updateMapMarkers(data.data);
      } else {
        setError(data.message || 'خطا در دریافت اطلاعات مکاتب');
      }
    } catch (err) {
      setError('خطا در اتصال به سرور');
    } finally {
      setLoading(false);
    }
  };

  const updateMapMarkers = (schoolData) => {
    if (!window.currentMap || !window.L) return;

    // Clear existing markers
    if (window.markers) {
      window.markers.forEach(marker => window.currentMap.removeLayer(marker));
    }

    window.markers = [];

    schoolData.forEach(school => {
      if (school.coordinates && school.coordinates.latitude && school.coordinates.longitude) {
        const marker = window.L.marker([school.coordinates.latitude, school.coordinates.longitude])
          .addTo(window.currentMap)
          .bindPopup(`
            <div class="school-popup">
              <h4>${school.name}</h4>
              <p><strong>ولایت:</strong> ${school.province}</p>
              <p><strong>نوع:</strong> ${school.schoolType}</p>
              <p><strong>دانش‌آموزان:</strong> ${school.academicInfo?.totalStudents || 0}</p>
              <button onclick="viewSchoolDetails('${school._id}')" class="popup-btn">
                مشاهده جزئیات
              </button>
            </div>
          `);

        window.markers.push(marker);
      }
    });

    // Make viewSchoolDetails available globally
    window.viewSchoolDetails = (schoolId) => {
      navigate(`/afghan-schools/${schoolId}`);
    };
  };

  const handleProvinceChange = (provinceCode) => {
    setSelectedProvince(provinceCode);
    const province = provinces.find(p => p.code === provinceCode);
    if (province && province.center) {
      setMapCenter(province.center);
      setMapZoom(8);
      if (window.currentMap) {
        window.currentMap.setView(province.center, 8);
      }
    }
  };

  const handleResetView = () => {
    setSelectedProvince('all');
    setSelectedSchoolType('all');
    setSelectedOwnership('all');
    setMapCenter([33.9391, 67.7109]);
    setMapZoom(6);
    if (window.currentMap) {
      window.currentMap.setView([33.9391, 67.7109], 6);
    }
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('fa-AF').format(num);
  };

  if (loading) {
    return (
      <div className="afghan-map loading">
        <div className="loading-spinner"></div>
        <p>در حال بارگذاری نقشه...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="afghan-map error">
        <div className="error-message">
          <h3>خطا</h3>
          <p>{error}</p>
          <button onClick={fetchSchools} className="retry-btn">
            تلاش مجدد
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="afghan-map">
      <header className="map-header">
        <h1>نقشه مکاتب افغانستان</h1>
        <div className="header-controls">
          <button onClick={() => navigate('/afghan-dashboard')} className="dashboard-btn">
            بازگشت به داشبورد
          </button>
        </div>
      </header>

      <div className="map-controls">
        <div className="control-group">
          <label>ولایت:</label>
          <select 
            value={selectedProvince} 
            onChange={(e) => handleProvinceChange(e.target.value)}
            className="control-select"
          >
            <option value="all">تمام ولایت‌ها</option>
            {provinces.map(province => (
              <option key={province.code} value={province.code}>
                {province.name}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>نوع مکتب:</label>
          <select 
            value={selectedSchoolType} 
            onChange={(e) => setSelectedSchoolType(e.target.value)}
            className="control-select"
          >
            {schoolTypes.map(type => (
              <option key={type.code} value={type.code}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>مالکیت:</label>
          <select 
            value={selectedOwnership} 
            onChange={(e) => setSelectedOwnership(e.target.value)}
            className="control-select"
          >
            {ownershipTypes.map(type => (
              <option key={type.code} value={type.code}>
                {type.name}
              </option>
            ))}
          </select>
        </div>

        <button onClick={handleResetView} className="reset-btn">
          بازنشانی视图
        </button>
      </div>

      <div className="map-container">
        <div ref={mapRef} className="map"></div>
        
        <div className="map-sidebar">
          <div className="sidebar-header">
            <h3>آمار مکاتب</h3>
            <div className="school-count">
              مجموع مکاتب: {formatNumber(schools.length)}
            </div>
          </div>

          <div className="sidebar-stats">
            <div className="stat-item">
              <span className="stat-label">دانش‌آموزان:</span>
              <span className="stat-value">
                {formatNumber(schools.reduce((sum, school) => sum + (school.academicInfo?.totalStudents || 0), 0))}
              </span>
            </div>
            <div className="stat-item">
              <span className="stat-label">معلمان:</span>
              <span className="stat-value">
                {formatNumber(schools.reduce((sum, school) => sum + (school.academicInfo?.totalTeachers || 0), 0))}
              </span>
            </div>
          </div>

          <div className="sidebar-legend">
            <h4>نقشه</h4>
            <div className="legend-item">
              <div className="legend-marker"></div>
              <span>موقعیت مکتب</span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button 
              onClick={() => navigate('/afghan-schools')}
              className="action-btn"
            >
              مشاهده لیست مکاتب
            </button>
            <button 
              onClick={() => navigate('/afghan-schools/new')}
              className="action-btn primary"
            >
              ثبت مکتب جدید
            </button>
          </div>
        </div>
      </div>

      {selectedSchool && (
        <div className="school-details-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{selectedSchool.name}</h3>
              <button 
                onClick={() => setSelectedSchool(null)}
                className="close-btn"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p><strong>ولایت:</strong> {selectedSchool.province}</p>
              <p><strong>ولسوالی:</strong> {selectedSchool.district}</p>
              <p><strong>نوع:</strong> {selectedSchool.schoolType}</p>
              <p><strong>مالکیت:</strong> {selectedSchool.ownership}</p>
              <p><strong>دانش‌آموزان:</strong> {selectedSchool.academicInfo?.totalStudents || 0}</p>
              <p><strong>معلمان:</strong> {selectedSchool.academicInfo?.totalTeachers || 0}</p>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => navigate(`/afghan-schools/${selectedSchool._id}`)}
                className="view-details-btn"
              >
                مشاهده جزئیات کامل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AfghanSchoolMap;
