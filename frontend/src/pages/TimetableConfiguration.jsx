import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, Clock, Calendar, Settings, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import './TimetableConfiguration.css';

const normalizeShiftToken = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '');

const REQUIRED_SHIFT_NAMES = ['morning', 'afternoon'];

const DEFAULT_SHIFT_DETAILS = {
  morning: {
    name: 'morning',
    nameDari: 'صبح',
    namePashto: 'سهار',
    startTime: '07:00',
    endTime: '12:00'
  },
  afternoon: {
    name: 'afternoon',
    nameDari: 'بعد از ظهر',
    namePashto: 'مازیګر',
    startTime: '12:30',
    endTime: '16:30'
  }
};

const buildUniqueShiftCode = (shiftName, schoolId) => {
  const prefix = shiftName === 'afternoon' ? 'AFT' : 'MOR';
  const schoolSuffix = String(schoolId || '').slice(-6).replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'SCH';
  const entropy = `${Date.now()}`.slice(-6);
  return `${prefix}_${schoolSuffix}_${entropy}`;
};

const normalizeConfigTone = (config = {}) => {
  const raw = String(config?.shiftId?.name || config?.shiftId?.code || '').trim().toLowerCase();
  if (raw.includes('morning') || raw.includes('mor')) return 'morning';
  if (raw.includes('afternoon') || raw.includes('aft')) return 'afternoon';
  if (raw.includes('evening') || raw.includes('eve')) return 'evening';
  return 'other';
};

const isShiftMatch = (shift = {}, expected = '') => {
  const token = normalizeShiftToken(expected);
  const candidates = [
    normalizeShiftToken(shift?.name),
    normalizeShiftToken(shift?.code),
    normalizeShiftToken(shift?.nameDari),
    normalizeShiftToken(shift?.namePashto)
  ];
  return candidates.some((value) => value && value.includes(token));
};

const isConfigShiftMatch = (config = {}, expected = '') => isShiftMatch(config?.shiftId || {}, expected);

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getTokenClaims = () => {
  const token = localStorage.getItem('token');
  if (!token || !token.includes('.')) return {};
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) || {};
  } catch {
    return {};
  }
};

const normalizeSchoolId = (value = '') => String(value || '').trim();
const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(normalizeSchoolId(value));

const resolveSchoolId = () => {
  const tokenClaims = getTokenClaims();
  const candidates = [
    localStorage.getItem('schoolId'),
    localStorage.getItem('school_id'),
    localStorage.getItem('selectedSchoolId'),
    tokenClaims.schoolId,
    tokenClaims.school_id,
    tokenClaims.orgSchoolId,
    tokenClaims.school,
    tokenClaims.school?._id
  ];

  return candidates.map(normalizeSchoolId).find(isValidObjectId) || '';
};

const TimetableConfiguration = () => {
  const [configurations, setConfigurations] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [showPeriodSetup, setShowPeriodSetup] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const [periodDefinitions, setPeriodDefinitions] = useState([]);

  const [formData, setFormData] = useState({
    academicYearId: '',
    shiftId: '',
    workingDays: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    periodsPerDay: 6,
    breakPeriods: []
  });

  const schoolId = resolveSchoolId();
  const hasValidSchoolId = isValidObjectId(schoolId);

  const weekDays = [
    { value: 'saturday', labelDari: 'شنبه' },
    { value: 'sunday', labelDari: 'یکشنبه' },
    { value: 'monday', labelDari: 'دوشنبه' },
    { value: 'tuesday', labelDari: 'سه‌شنبه' },
    { value: 'wednesday', labelDari: 'چهارشنبه' },
    { value: 'thursday', labelDari: 'پنجشنبه' },
    { value: 'friday', labelDari: 'جمعه' }
  ];

  useEffect(() => {
    if (!hasValidSchoolId) {
      setConfigurations([]);
      setAcademicYears([]);
      setShifts([]);
      setLoading(false);
      return;
    }

    fetchConfigurations();
    fetchAcademicYears();
    fetchShifts();
  }, [schoolId, hasValidSchoolId]);

  const fetchConfigurations = async () => {
    if (!hasValidSchoolId) return;
    try {
      const response = await fetch(`/api/timetable-configuration/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();

      if (data.success) {
        setConfigurations(data.data);
      } else {
        toast.error('دریافت تنظیمات تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching configurations:', error);
      toast.error('دریافت تنظیمات تقسیم اوقات ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const fetchAcademicYears = async () => {
    if (!hasValidSchoolId) return;
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();

      if (data.success) {
        setAcademicYears(data.data.filter((year) => year.status === 'active'));
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchShifts = async () => {
    if (!hasValidSchoolId) return;
    try {
      const response = await fetch(`/api/shifts/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();

      if (data.success) {
        const currentShifts = Array.isArray(data.data) ? data.data : [];
        const normalizedNames = new Set(
          currentShifts
            .map((item) => normalizeShiftToken(item?.name || item?.code))
            .filter(Boolean)
        );

        const missingShiftNames = REQUIRED_SHIFT_NAMES.filter((item) => !normalizedNames.has(item));

        if (missingShiftNames.length > 0) {
          await Promise.allSettled(
            missingShiftNames.map(async (shiftName) => {
              const template = DEFAULT_SHIFT_DETAILS[shiftName];
              if (!template) return;

              await fetch(`/api/shifts/school/${schoolId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                  ...template,
                  code: buildUniqueShiftCode(shiftName, schoolId),
                  description: 'Auto-created for timetable configuration'
                })
              });
            })
          );

          const refreshedResponse = await fetch(`/api/shifts/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
          const refreshedData = await refreshedResponse.json();
          if (refreshedData.success) {
            setShifts(refreshedData.data || []);
            return;
          }

          toast.error('نوبت بعد از ظهر ساخته نشد. لطفاً در مدیریت نوبت آن را دستی ایجاد کنید.');
        }

        setShifts(currentShifts);
      } else {
        toast.error(data.message || 'دریافت نوبت‌ها ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
      toast.error('دریافت نوبت‌ها ناموفق بود.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!hasValidSchoolId) {
      toast.error('ابتدا یک مکتب معتبر انتخاب یا ایجاد کنید.');
      return;
    }

    try {
      const url = editingConfig
        ? `/api/timetable-configuration/${editingConfig._id}`
        : `/api/timetable-configuration/school/${schoolId}`;

      const method = editingConfig ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        toast.success(editingConfig ? 'تنظیم تقسیم اوقات به‌روزرسانی شد.' : 'تنظیم تقسیم اوقات ایجاد شد.');
        setShowForm(false);
        setEditingConfig(null);
        resetForm();
        fetchConfigurations();
      } else {
        toast.error(data.message || 'ذخیره تنظیم تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error saving configuration:', error);
      toast.error('ذخیره تنظیم تقسیم اوقات ناموفق بود.');
    }
  };

  const handleWorkingDayChange = (day, checked) => {
    setFormData((prev) => ({
      ...prev,
      workingDays: checked
        ? [...prev.workingDays, day]
        : prev.workingDays.filter((item) => item !== day)
    }));
  };

  const handleEdit = (config) => {
    setEditingConfig(config);
    setFormData({
      academicYearId: config.academicYearId._id,
      shiftId: config.shiftId._id,
      workingDays: config.workingDays,
      periodsPerDay: config.periodsPerDay,
      breakPeriods: config.breakPeriods || []
    });
    setShowForm(true);
  };

  const handleDelete = async (configId) => {
    if (!confirm('آیا مطمئن هستید که این تنظیم حذف شود؟ با حذف آن، همه تعریف‌های ساعت نیز حذف می‌شوند.')) return;

    try {
      const response = await fetch(`/api/timetable-configuration/${configId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });

      const data = await response.json();

      if (data.success) {
        toast.success('تنظیم تقسیم اوقات حذف شد.');
        fetchConfigurations();
      } else {
        toast.error(data.message || 'حذف تنظیم تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      toast.error('حذف تنظیم تقسیم اوقات ناموفق بود.');
    }
  };

  const handleSetupPeriods = async (config) => {
    try {
      const response = await fetch(`/api/timetable-configuration/${config._id}/details`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();

      if (data.success) {
        setSelectedConfig(data.data.configuration);
        setPeriodDefinitions(data.data.periodDefinitions);
        setShowPeriodSetup(true);
      } else {
        toast.error('دریافت تعریف ساعت‌ها ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching period definitions:', error);
      toast.error('دریافت تعریف ساعت‌ها ناموفق بود.');
    }
  };

  const handleSavePeriods = async () => {
    try {
      const response = await fetch(`/api/timetable-configuration/${selectedConfig._id}/periods`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ periods: periodDefinitions })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('تعریف ساعت‌ها به‌روزرسانی شد.');
        setShowPeriodSetup(false);
        setSelectedConfig(null);
        setPeriodDefinitions([]);
      } else {
        toast.error(data.message || 'به‌روزرسانی تعریف ساعت‌ها ناموفق بود.');
      }
    } catch (error) {
      console.error('Error updating periods:', error);
      toast.error('به‌روزرسانی تعریف ساعت‌ها ناموفق بود.');
    }
  };

  const resetForm = () => {
    setFormData({
      academicYearId: '',
      shiftId: '',
      workingDays: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
      periodsPerDay: 6,
      breakPeriods: []
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingConfig(null);
    resetForm();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  const totalConfigs = configurations.length;
  const activeConfigs = configurations.filter((item) => item.isActive).length;
  const averagePeriods = totalConfigs
    ? Math.round(configurations.reduce((sum, item) => sum + (item.periodsPerDay || 0), 0) / totalConfigs)
    : 0;
  const shiftOptions = shifts;
  const morningConfig = configurations.find((item) => isConfigShiftMatch(item, 'morning')) || null;
  const afternoonConfig = configurations.find((item) => isConfigShiftMatch(item, 'afternoon')) || null;

  const openQuickConfigCreate = (shiftName) => {
    const matchedShift = shifts.find((item) => isShiftMatch(item, shiftName));
    const preferredYear = academicYears.find((year) => year.isCurrent) || academicYears[0] || null;

    setEditingConfig(null);
    setFormData({
      academicYearId: preferredYear?._id || '',
      shiftId: matchedShift?._id || '',
      workingDays: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
      periodsPerDay: 6,
      breakPeriods: []
    });
    setShowForm(true);
  };

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page tt-config-page" dir="rtl">
      {!hasValidSchoolId && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6 text-yellow-800">
            ابتدا یک مکتب معتبر انتخاب یا ایجاد کنید تا تنظیمات تقسیم اوقات و نوبت‌ها فعال شود.
          </CardContent>
        </Card>
      )}

      <div className="tt-config-hero tt-shared-header">
        <div className="tt-config-hero-main">
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">تنظیم تقسیم اوقات</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">روزهای درسی، تعداد ساعت‌ها و وقت‌های وقفه را با یک نمای حرفه‌ای و سریع مدیریت کنید.</p>
          <div className="tt-config-kpis" aria-label="آمار تنظیمات تقسیم اوقات">
            <div className="tt-config-kpi">
              <span className="tt-config-kpi-label">همه تنظیم‌ها</span>
              <strong className="tt-config-kpi-value">{totalConfigs}</strong>
            </div>
            <div className="tt-config-kpi">
              <span className="tt-config-kpi-label">فعال</span>
              <strong className="tt-config-kpi-value">{activeConfigs}</strong>
            </div>
            <div className="tt-config-kpi">
              <span className="tt-config-kpi-label">میانگین ساعات روزانه</span>
              <strong className="tt-config-kpi-value">{averagePeriods}</strong>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" className="flex items-center gap-2">
            <Link to="/timetable/shift-management">
              <Settings className="w-4 h-4" />
              مدیریت نوبت‌ها
            </Link>
          </Button>
          <Button onClick={() => setShowForm(true)} className="tt-config-primary-btn flex items-center gap-2">
            <Plus className="w-4 h-4" />
            تنظیم جدید
          </Button>
        </div>
      </div>

      <section className="tt-config-wizard-deck" aria-label="ویزارد تنظیمات شیفت‌ها">
        <Card className="tt-config-wizard-card tt-config-wizard-card--morning">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">ویزارد تنظیم شیفت صبح</CardTitle>
            <p className="tt-config-wizard-subtitle">ایجاد یا ویرایش سریع تنظیم تقسیم اوقات برای شیفت صبح</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {morningConfig ? (
              <>
                <div className="tt-config-wizard-row"><span>سال تعلیمی:</span><strong>{morningConfig.academicYearId?.title || '—'}</strong></div>
                <div className="tt-config-wizard-row"><span>روزهای درسی:</span><strong>{morningConfig.workingDays?.length || 0} روز</strong></div>
                <div className="tt-config-wizard-row"><span>ساعت در روز:</span><strong>{morningConfig.periodsPerDay || 0}</strong></div>
                <div className="tt-config-wizard-actions">
                  <Button size="sm" variant="outline" className="tt-config-wizard-btn" onClick={() => handleEdit(morningConfig)}>
                    ویرایش تنظیم صبح
                  </Button>
                  <Button size="sm" variant="outline" className="tt-config-wizard-btn" onClick={() => handleSetupPeriods(morningConfig)}>
                    تعریف ساعت‌ها
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="tt-config-wizard-empty">برای شیفت صبح هنوز تنظیمی ساخته نشده است.</p>
                <Button size="sm" className="tt-config-primary-btn" onClick={() => openQuickConfigCreate('morning')}>
                  ایجاد تنظیم صبح
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="tt-config-wizard-card tt-config-wizard-card--afternoon">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">ویزارد تنظیم شیفت بعدازظهر</CardTitle>
            <p className="tt-config-wizard-subtitle">ایجاد یا ویرایش سریع تنظیم تقسیم اوقات برای شیفت بعدازظهر</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {afternoonConfig ? (
              <>
                <div className="tt-config-wizard-row"><span>سال تعلیمی:</span><strong>{afternoonConfig.academicYearId?.title || '—'}</strong></div>
                <div className="tt-config-wizard-row"><span>روزهای درسی:</span><strong>{afternoonConfig.workingDays?.length || 0} روز</strong></div>
                <div className="tt-config-wizard-row"><span>ساعت در روز:</span><strong>{afternoonConfig.periodsPerDay || 0}</strong></div>
                <div className="tt-config-wizard-actions">
                  <Button size="sm" variant="outline" className="tt-config-wizard-btn" onClick={() => handleEdit(afternoonConfig)}>
                    ویرایش تنظیم بعدازظهر
                  </Button>
                  <Button size="sm" variant="outline" className="tt-config-wizard-btn" onClick={() => handleSetupPeriods(afternoonConfig)}>
                    تعریف ساعت‌ها
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="tt-config-wizard-empty">برای شیفت بعدازظهر هنوز تنظیمی ساخته نشده است.</p>
                <Button size="sm" className="tt-config-primary-btn" onClick={() => openQuickConfigCreate('afternoon')}>
                  ایجاد تنظیم بعدازظهر
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {showForm && (
        <Card className="tt-config-form-card">
          <CardHeader>
            <CardTitle>{editingConfig ? 'ویرایش تنظیم' : 'تنظیم جدید'}</CardTitle>
            <p className="tt-config-form-note">اطلاعات پایه را تکمیل کنید، سپس روزهای درسی و تعداد ساعت‌های روزانه را مشخص نمایید.</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6 tt-config-form">
              <div className="tt-config-form-section">
                <h3 className="tt-config-form-section-title">اطلاعات پایه</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tt-config-form-grid">
                  <div className="tt-config-field">
                    <Label htmlFor="academicYearId">سال تعلیمی</Label>
                    <div className="tt-config-native-wrap">
                      <select
                        id="academicYearId"
                        className="tt-config-native-select"
                        value={formData.academicYearId}
                        onChange={(e) => setFormData({ ...formData, academicYearId: e.target.value })}
                        required
                      >
                        <option value="" disabled>انتخاب سال تعلیمی</option>
                        {academicYears.map((year) => (
                          <option key={year._id} value={year._id}>
                            {year.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="tt-config-field">
                    <Label htmlFor="shiftId">نوبت</Label>
                    <div className="tt-config-native-wrap">
                      <select
                        id="shiftId"
                        className="tt-config-native-select"
                        value={formData.shiftId}
                        onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                        required
                      >
                        <option value="" disabled>
                          {shiftOptions.length > 0 ? 'انتخاب نوبت' : 'هیچ نوبت فعالی یافت نشد'}
                        </option>
                        {shiftOptions.map((shift) => (
                          <option key={shift._id} value={shift._id}>
                            {shift.name} ({shift.nameDari})
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      اگر نوبت مورد نظر شما در لیست نیست، از{' '}
                      <Link to="/timetable/shift-management" className="text-blue-600 hover:underline">
                        مدیریت نوبت‌ها
                      </Link>{' '}
                      نوبت جدید ایجاد کنید.
                    </p>
                  </div>
                </div>
              </div>

              <div className="tt-config-form-section">
                <h3 className="tt-config-form-section-title">برنامه روزانه</h3>
                <Label>روزهای درسی</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2 tt-config-days-grid">
                  {weekDays.map((day) => (
                    <div key={day.value} className="tt-config-day-item flex items-center gap-2">
                      <Checkbox
                        id={day.value}
                        checked={formData.workingDays.includes(day.value)}
                        onCheckedChange={(checked) => handleWorkingDayChange(day.value, checked)}
                      />
                      <Label htmlFor={day.value} className="text-sm">
                        {day.labelDari}
                      </Label>
                    </div>
                  ))}
                </div>

                <div className="tt-config-field tt-config-period-field">
                <Label htmlFor="periodsPerDay">تعداد ساعت در یک روز</Label>
                <Input
                  id="periodsPerDay"
                  type="number"
                  min="1"
                  max="12"
                  value={formData.periodsPerDay}
                  onChange={(e) => setFormData({ ...formData, periodsPerDay: parseInt(e.target.value, 10) })}
                  required
                />
                </div>
              </div>

              <div className="flex gap-2 tt-config-form-actions">
                <Button type="submit" className="tt-config-primary-btn">
                  {editingConfig ? 'ذخیره تغییرات' : 'ایجاد تنظیم'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  انصراف
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {showPeriodSetup && selectedConfig && (
        <Card className="tt-config-period-card">
          <CardHeader>
            <CardTitle>تعریف ساعت‌ها</CardTitle>
            <p className="text-sm text-gray-600">
              {selectedConfig.academicYearId.title} - {selectedConfig.shiftId.name}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {weekDays
                .filter((day) => selectedConfig.workingDays.includes(day.value))
                .map((day) => (
                  <div key={day.value} className="space-y-2">
                    <h4 className="font-medium">{day.labelDari}</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {periodDefinitions
                        .filter((period) => period.dayCode === day.value)
                        .map((period) => (
                          <Card key={period._id} className="p-3 tt-config-period-item">
                            <div className="space-y-2">
                              <Label className="text-sm">ساعت {period.periodIndex}</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <Input
                                  type="time"
                                  value={period.startTime}
                                  onChange={(e) => {
                                    const updated = periodDefinitions.map((item) =>
                                      item._id === period._id ? { ...item, startTime: e.target.value } : item
                                    );
                                    setPeriodDefinitions(updated);
                                  }}
                                />
                                <Input
                                  type="time"
                                  value={period.endTime}
                                  onChange={(e) => {
                                    const updated = periodDefinitions.map((item) =>
                                      item._id === period._id ? { ...item, endTime: e.target.value } : item
                                    );
                                    setPeriodDefinitions(updated);
                                  }}
                                />
                              </div>
                              <Select
                                value={period.type}
                                onValueChange={(value) => {
                                  const updated = periodDefinitions.map((item) =>
                                    item._id === period._id ? { ...item, type: value, isBreak: value !== 'class' } : item
                                  );
                                  setPeriodDefinitions(updated);
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="class">درسی</SelectItem>
                                  <SelectItem value="break">تفریح</SelectItem>
                                  <SelectItem value="lunch">نان چاشت</SelectItem>
                                  <SelectItem value="prayer">نماز</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </Card>
                        ))}
                    </div>
                  </div>
                ))}

              <div className="flex gap-2 pt-4 tt-config-form-actions">
                <Button onClick={handleSavePeriods} className="tt-config-primary-btn">ذخیره تعریف ساعت‌ها</Button>
                <Button variant="outline" onClick={() => setShowPeriodSetup(false)}>
                  انصراف
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default TimetableConfiguration;
