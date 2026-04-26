import React, { useState, useEffect } from 'react';
import './ShiftSettingsPage.css';

const ShiftSettingsPage = () => {
  const [shifts, setShifts] = useState([]);
  const [weekConfig, setWeekConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showWeekModal, setShowWeekModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('shifts');

  // Mock school ID - in real app, get from context/auth
  const schoolId = '507f1f77bcf86cd799439011';

  useEffect(() => {
    if (activeTab === 'shifts') {
      fetchShifts();
    } else {
      fetchWeekConfig();
    }
  }, [activeTab]);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/school-shifts/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
      } else {
        setError('خطا در دریافت شیفت‌ها');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const fetchWeekConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/school-week-config/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setWeekConfig(data.data);
      } else {
        setError('خطا در دریافت تنظیمات هفته');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    } finally {
      setLoading(false);
    }
  };

  const handleShiftSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingShift 
        ? `/api/school-shifts/${editingShift._id}`
        : '/api/school-shifts';
      
      const method = editingShift ? 'PATCH' : 'POST';
      
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
        setSuccess(editingShift ? 'شیفت با موفقیت ویرایش شد' : 'شیفت با موفقیت ایجاد شد');
        setShowShiftModal(false);
        setEditingShift(null);
        resetShiftForm();
        fetchShifts();
      } else {
        setError(data.message || 'خطا در ذخیره شیفت');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleWeekSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = weekConfig 
        ? `/api/school-week-config/${weekConfig._id}`
        : '/api/school-week-config';
      
      const method = weekConfig ? 'PATCH' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...weekFormData,
          schoolId
        })
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('تنظیمات هفته با موفقیت ذخیره شد');
        setShowWeekModal(false);
        fetchWeekConfig();
      } else {
        setError(data.message || 'خطا در ذخیره تنظیمات هفته');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleToggleShift = async (shiftId) => {
    try {
      const response = await fetch(`/api/school-shifts/${shiftId}/toggle-status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('وضعیت شیفت با موفقیت تغییر کرد');
        fetchShifts();
      } else {
        setError(data.message || 'خطا در تغییر وضعیت شیفت');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleDeleteShift = async (shiftId) => {
    if (!confirm('آیا از حذف این شیفت مطمئن هستید؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/school-shifts/${shiftId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('شیفت با موفقیت حذف شد');
        fetchShifts();
      } else {
        setError(data.message || 'خطا در حذف شیفت');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const handleResetWeekConfig = async () => {
    if (!confirm('آیا از بازنشانی تنظیمات هفته به حالت پیش‌فرض مطمئن هستید؟')) {
      return;
    }

    try {
      const response = await fetch(`/api/school-week-config/${weekConfig._id}/reset-default`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('تنظیمات هفته با موفقیت بازنشانی شد');
        fetchWeekConfig();
      } else {
        setError(data.message || 'خطا در بازنشانی تنظیمات هفته');
      }
    } catch (err) {
      setError('خطا در ارتباط با سرور');
    }
  };

  const openEditShiftModal = (shift) => {
    setEditingShift(shift);
    setFormData({
      name: shift.name || '',
      code: shift.code || '',
      startTime: shift.startTime || '',
      endTime: shift.endTime || '',
      isActive: shift.isActive || false,
      sortOrder: shift.sortOrder || 0,
      description: shift.description || '',
      maxDailyPeriods: shift.maxDailyPeriods || 8,
      breakDurationMinutes: shift.breakDurationMinutes || 10
    });
    setShowShiftModal(true);
  };

  const resetShiftForm = () => {
    setFormData({
      name: '',
      code: '',
      startTime: '',
      endTime: '',
      isActive: false,
      sortOrder: 0,
      description: '',
      maxDailyPeriods: 8,
      breakDurationMinutes: 10
    });
  };

  const [formData, setFormData] = useState({
    name: '',
    code: '',
    startTime: '',
    endTime: '',
    isActive: false,
    sortOrder: 0,
    description: '',
    maxDailyPeriods: 8,
    breakDurationMinutes: 10
  });

  const [weekFormData, setWeekFormData] = useState({
    workingDays: [1, 2, 3, 4, 5, 6],
    weekendDays: [7],
    dayLabels: {
      1: 'شنبه',
      2: 'یکشنبه',
      3: 'دوشنبه',
      4: 'سه‌شنبه',
      5: 'چهارشنبه',
      6: 'پنجشنبه',
      7: 'جمعه'
    },
    weekStartDay: 1,
    hasHalfDayThursday: false,
    thursdayEndTime: '12:00',
    maxInstructionalDaysPerWeek: 6,
    notes: ''
  });

  const handleDayToggle = (dayNumber, type) => {
    if (type === 'working') {
      setWeekFormData(prev => ({
        ...prev,
        workingDays: prev.workingDays.includes(dayNumber)
          ? prev.workingDays.filter(d => d !== dayNumber)
          : [...prev.workingDays, dayNumber],
        weekendDays: prev.weekendDays.filter(d => d !== dayNumber)
      }));
    } else {
      setWeekFormData(prev => ({
        ...prev,
        weekendDays: prev.weekendDays.includes(dayNumber)
          ? prev.weekendDays.filter(d => d !== dayNumber)
          : [...prev.weekendDays, dayNumber],
        workingDays: prev.workingDays.filter(d => d !== dayNumber)
      }));
    }
  };

  const getDayLabel = (dayNumber) => {
    const labels = {
      1: 'شنبه',
      2: 'یکشنبه',
      3: 'دوشنبه',
      4: 'سه‌شنبه',
      5: 'چهارشنبه',
      6: 'پنجشنبه',
      7: 'جمعه'
    };
    return labels[dayNumber] || `روز ${dayNumber}`;
  };

  if (loading) {
    return <div className="loading-container">در حال بارگذاری...</div>;
  }

  return (
    <div className="shift-settings-page">
      <div className="page-header">
        <h1>تنظیمات زمانی مکتب</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'shifts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shifts')}
        >
          شیفت‌های آموزشی
        </button>
        <button 
          className={`tab-btn ${activeTab === 'week' ? 'active' : ''}`}
          onClick={() => setActiveTab('week')}
        >
          تنظیمات هفته
        </button>
      </div>

      {activeTab === 'shifts' && (
        <div className="shifts-section">
          <div className="section-header">
            <h2>شیفت‌های آموزشی</h2>
            <button 
              className="btn btn-primary"
              onClick={() => {
                setEditingShift(null);
                resetShiftForm();
                setShowShiftModal(true);
              }}
            >
              شیفت جدید
            </button>
          </div>

          <div className="shifts-grid">
            {shifts.map((shift) => (
              <div key={shift._id} className="shift-card">
                <div className="shift-header">
                  <h3>{shift.name}</h3>
                  <div className="shift-badges">
                    <span className={`status-badge ${shift.isActive ? 'active' : 'inactive'}`}>
                      {shift.isActive ? 'فعال' : 'غیرفعال'}
                    </span>
                  </div>
                </div>
                
                <div className="shift-info">
                  <div className="info-row">
                    <span>کد:</span>
                    <span>{shift.code}</span>
                  </div>
                  <div className="info-row">
                    <span>زمان:</span>
                    <span>{shift.startTime} - {shift.endTime}</span>
                  </div>
                  <div className="info-row">
                    <span>ترتیب:</span>
                    <span>{shift.sortOrder}</span>
                  </div>
                  <div className="info-row">
                    <span>حداکثر زنگ‌ها:</span>
                    <span>{shift.maxDailyPeriods}</span>
                  </div>
                  <div className="info-row">
                    <span>زمان استراحت:</span>
                    <span>{shift.breakDurationMinutes} دقیقه</span>
                  </div>
                  {shift.description && (
                    <div className="info-row">
                      <span>توضیحات:</span>
                      <span>{shift.description}</span>
                    </div>
                  )}
                </div>

                <div className="shift-actions">
                  <button 
                    className="btn btn-sm btn-secondary"
                    onClick={() => openEditShiftModal(shift)}
                  >
                    ویرایش
                  </button>
                  <button 
                    className={`btn btn-sm ${shift.isActive ? 'btn-warning' : 'btn-success'}`}
                    onClick={() => handleToggleShift(shift._id)}
                  >
                    {shift.isActive ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                  </button>
                  <button 
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDeleteShift(shift._id)}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>

          {shifts.length === 0 && (
            <div className="empty-state">
              <p>هیچ شیفت‌هایی تعریف نشده است</p>
              <button 
                className="btn btn-primary"
                onClick={() => setShowShiftModal(true)}
              >
                ایجاد شیفت جدید
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'week' && (
        <div className="week-section">
          <div className="section-header">
            <h2>تنظیمات هفته</h2>
            <div className="week-actions">
              {weekConfig && (
                <button 
                  className="btn btn-secondary"
                  onClick={handleResetWeekConfig}
                >
                  بازنشانی به پیش‌فرض
                </button>
              )}
              <button 
                className="btn btn-primary"
                onClick={() => setShowWeekModal(true)}
              >
                ویرایش تنظیمات
              </button>
            </div>
          </div>

          {weekConfig && (
            <div className="week-config-display">
              <div className="config-section">
                <h3>روزهای کاری</h3>
                <div className="days-grid">
                  {weekConfig.workingDays.map(day => (
                    <div key={day} className="day-chip working">
                      {getDayLabel(day)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="config-section">
                <h3>روزهای تعطیل</h3>
                <div className="days-grid">
                  {weekConfig.weekendDays.map(day => (
                    <div key={day} className="day-chip weekend">
                      {getDayLabel(day)}
                    </div>
                  ))}
                </div>
              </div>

              <div className="config-details">
                <div className="detail-row">
                  <span>شروع هفته:</span>
                  <span>{getDayLabel(weekConfig.weekStartDay)}</span>
                </div>
                <div className="detail-row">
                  <span>روزهای آموزشی در هفته:</span>
                  <span>{weekConfig.instructionalDaysPerWeek} روز</span>
                </div>
                {weekConfig.hasHalfDayThursday && (
                  <div className="detail-row">
                    <span>پنجشنبه نیمه‌روز:</span>
                    <span>تا {weekConfig.thursdayEndTime}</span>
                  </div>
                )}
                {weekConfig.notes && (
                  <div className="detail-row">
                    <span>یادداشت:</span>
                    <span>{weekConfig.notes}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shift Modal */}
      {showShiftModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingShift ? 'ویرایش شیفت' : 'شیفت جدید'}</h2>
              <button 
                className="modal-close"
                onClick={() => setShowShiftModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleShiftSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group">
                  <label>نام شیفت *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                    placeholder="مثال: صبح"
                  />
                </div>
                <div className="form-group">
                  <label>کد شیفت *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value})}
                    required
                    placeholder="مثال: morning"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>زمان شروع *</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>زمان پایان *</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>ترتیب نمایش</label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({...formData, sortOrder: parseInt(e.target.value) || 0})}
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>حداکثر زنگ‌های روزانه</label>
                  <input
                    type="number"
                    value={formData.maxDailyPeriods}
                    onChange={(e) => setFormData({...formData, maxDailyPeriods: parseInt(e.target.value) || 8})}
                    min="1"
                    max="12"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>زمان استراحت (دقیقه)</label>
                  <input
                    type="number"
                    value={formData.breakDurationMinutes}
                    onChange={(e) => setFormData({...formData, breakDurationMinutes: parseInt(e.target.value) || 10})}
                    min="0"
                    max="60"
                  />
                </div>
                <div className="form-group">
                  <label>وضعیت</label>
                  <select
                    value={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.value === 'true'})}
                  >
                    <option value={false}>غیرفعال</option>
                    <option value={true}>فعال</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>توضیحات</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows="3"
                  placeholder="توضیحات اضافی در مورد این شیفت..."
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowShiftModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingShift ? 'ویرایش' : 'ایجاد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Week Config Modal */}
      {showWeekModal && (
        <div className="modal-overlay">
          <div className="modal week-modal">
            <div className="modal-header">
              <h2>تنظیمات هفته</h2>
              <button 
                className="modal-close"
                onClick={() => setShowWeekModal(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleWeekSubmit} className="modal-form">
              <div className="form-section">
                <h3>روزهای هفته</h3>
                <div className="days-selector">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => (
                    <div key={day} className="day-selector-item">
                      <label className="day-checkbox">
                        <input
                          type="checkbox"
                          checked={weekFormData.workingDays.includes(day)}
                          onChange={() => handleDayToggle(day, 'working')}
                        />
                        <span className="day-label">{getDayLabel(day)}</span>
                      </label>
                      <div className="day-type">
                        <button
                          type="button"
                          className={`day-type-btn ${weekFormData.workingDays.includes(day) ? 'working' : 'weekend'}`}
                          onClick={() => handleDayToggle(day, weekFormData.workingDays.includes(day) ? 'weekend' : 'working')}
                        >
                          {weekFormData.workingDays.includes(day) ? 'کاری' : 'تعطیل'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>شروع هفته</label>
                  <select
                    value={weekFormData.weekStartDay}
                    onChange={(e) => setWeekFormData({...weekFormData, weekStartDay: parseInt(e.target.value)})}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(day => (
                      <option key={day} value={day}>{getDayLabel(day)}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>حداکثر روزهای آموزشی</label>
                  <input
                    type="number"
                    value={weekFormData.maxInstructionalDaysPerWeek}
                    onChange={(e) => setWeekFormData({...weekFormData, maxInstructionalDaysPerWeek: parseInt(e.target.value) || 6})}
                    min="1"
                    max="7"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={weekFormData.hasHalfDayThursday}
                      onChange={(e) => setWeekFormData({...weekFormData, hasHalfDayThursday: e.target.checked})}
                    />
                    پنجشنبه نیمه‌روز
                  </label>
                </div>
                {weekFormData.hasHalfDayThursday && (
                  <div className="form-group">
                    <label>زمان پایان پنجشنبه</label>
                    <input
                      type="time"
                      value={weekFormData.thursdayEndTime}
                      onChange={(e) => setWeekFormData({...weekFormData, thursdayEndTime: e.target.value})}
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>یادداشت</label>
                <textarea
                  value={weekFormData.notes}
                  onChange={(e) => setWeekFormData({...weekFormData, notes: e.target.value})}
                  rows="3"
                  placeholder="یادداشت‌های مربوط به تنظیمات هفته..."
                />
              </div>

              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowWeekModal(false)}
                >
                  انصراف
                </button>
                <button type="submit" className="btn btn-primary">
                  ذخیره تنظیمات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftSettingsPage;
