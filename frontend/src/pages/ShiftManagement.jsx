import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, Clock, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import './ShiftManagement.css';

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
  // ابتدا مستقیم از localStorage بگیریم (از ایجاد مکتب جدید)
  const directSchoolId = localStorage.getItem('schoolId');
  console.log('🔍 [resolveSchoolId] directSchoolId from localStorage:', directSchoolId);
  if (directSchoolId && isValidObjectId(directSchoolId)) {
    console.log('✅ [resolveSchoolId] Valid schoolId found in localStorage:', directSchoolId);
    return directSchoolId;
  }

  // بعد از token claims
  const tokenClaims = getTokenClaims();
  console.log('🔍 [resolveSchoolId] tokenClaims:', tokenClaims);
  const candidates = [
    localStorage.getItem('school_id'),
    localStorage.getItem('selectedSchoolId'),
    tokenClaims.schoolId,
    tokenClaims.school_id,
    tokenClaims.orgSchoolId,
    tokenClaims.school,
    tokenClaims.school?._id
  ];

  const result = candidates.map(normalizeSchoolId).find(isValidObjectId) || '';
  console.log('🔍 [resolveSchoolId] Final result:', result);
  return result;
};

const generateUniqueCode = (baseCode) => {
  const timestamp = String(Date.now()).slice(-4);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  return `${baseCode}_${timestamp}${random}`;
};

const SHIFT_PRESETS = {
  morning: {
    name: 'morning',
    nameDari: 'صبح',
    namePashto: 'سهار',
    code: generateUniqueCode('MOR'),
    startTime: '07:00',
    endTime: '12:00',
    description: 'نوبت صبح'
  },
  afternoon: {
    name: 'afternoon',
    nameDari: 'بعدازظهر',
    namePashto: 'مازیګر',
    code: generateUniqueCode('AFT'),
    startTime: '12:30',
    endTime: '16:30',
    description: 'نوبت بعدازظهر'
  },
  evening: {
    name: 'evening',
    nameDari: 'شب',
    namePashto: 'ماښام',
    code: generateUniqueCode('EVE'),
    startTime: '17:00',
    endTime: '20:00',
    description: 'نوبت شب'
  }
};

const normalizeShiftTone = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'morning') return 'morning';
  if (normalized === 'afternoon') return 'afternoon';
  if (normalized === 'evening') return 'evening';
  return 'other';
};

const isShiftMatch = (shift = {}, expected = '') => {
  const expectedValue = String(expected || '').trim().toLowerCase();
  const candidates = [
    String(shift?.name || '').trim().toLowerCase(),
    String(shift?.code || '').trim().toLowerCase(),
    String(shift?.nameDari || '').trim().toLowerCase(),
    String(shift?.namePashto || '').trim().toLowerCase()
  ];

  if (expectedValue === 'morning') {
    return candidates.some((value) => value.includes('morning') || value.includes('mor') || value.includes('صبح'));
  }
  if (expectedValue === 'afternoon') {
    return candidates.some((value) => value.includes('afternoon') || value.includes('aft') || value.includes('بعدازظهر'));
  }
  return false;
};

const ShiftManagement = () => {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [schoolId, setSchoolId] = useState(() => resolveSchoolId());
  const [formData, setFormData] = useState({
    name: '',
    nameDari: '',
    namePashto: '',
    code: '',
    startTime: '',
    endTime: '',
    description: ''
  });

  // تک‌بند شدہ schoolId را نگاه کنید
  useEffect(() => {
    const checkSchoolId = () => {
      const newSchoolId = resolveSchoolId();
      if (newSchoolId && newSchoolId !== schoolId) {
        console.log('🔄 [ShiftManagement] schoolId updated:', newSchoolId);
        setSchoolId(newSchoolId);
      }
    };

    // هر 2 ثانیه تک بازی دیده بینید
    const interval = setInterval(checkSchoolId, 2000);
    checkSchoolId(); // فوری بررسی کریں

    return () => clearInterval(interval);
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || schoolId === 'default-school-id') {
      console.warn('⚠️ [ShiftManagement] schoolId نامعتبر است:', schoolId);
      setLoading(false);
      return;
    }
    
    fetchShifts();
  }, [schoolId]);

  const fetchShifts = async () => {
    try {
      const response = await fetch(`/api/school-shifts?schoolId=${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
      } else {
        toast.error('خطا در دریافت نوبت‌ها');
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
      toast.error('خطا در دریافت نوبت‌ها');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // بررسی داشتن schoolId
    if (!schoolId || schoolId === 'default-school-id') {
      toast.error('ابتدا باید یک مکتب ایجاد کنید یا انتخاب کنید');
      return;
    }
    
    try {
      const dataToSend = {
        ...formData,
        schoolId: schoolId
      };
      
      const url = editingShift 
        ? `/api/school-shifts/${editingShift._id}`
        : '/api/school-shifts';
      
      const method = editingShift ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(dataToSend),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(editingShift ? 'نوبت به‌روزرسانی شد' : 'نوبت ایجاد شد');
        setShowForm(false);
        setEditingShift(null);
        resetForm();
        fetchShifts();
      } else {
        toast.error(data.message || 'خطا در ذخیره نوبت');
      }
    } catch (error) {
      console.error('Error saving shift:', error);
      toast.error('خطا در ذخیره نوبت');
    }
  };

  const handleEdit = (shift) => {
    setEditingShift(shift);
    setFormData({
      name: shift.name,
      nameDari: shift.nameDari,
      namePashto: shift.namePashto,
      code: shift.code,
      startTime: shift.startTime,
      endTime: shift.endTime,
      description: shift.description
    });
    setShowForm(true);
  };

  const handleDelete = async (shiftId) => {
    if (!confirm('آیا مطمئن هستید که این نوبت حذف شود؟')) return;
    
    try {
      const response = await fetch(`/api/school-shifts/${shiftId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('نوبت حذف شد');
        fetchShifts();
      } else {
        toast.error(data.message || 'خطا در حذف نوبت');
      }
    } catch (error) {
      console.error('Error deleting shift:', error);
      toast.error('خطا در حذف نوبت');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      nameDari: '',
      namePashto: '',
      code: '',
      startTime: '',
      endTime: '',
      description: ''
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingShift(null);
    resetForm();
  };

  const applyPreset = (presetKey) => {
    const preset = SHIFT_PRESETS[presetKey];
    if (!preset) return;
    setFormData((current) => ({
      ...current,
      ...preset
    }));
  };

  const totalShifts = shifts.length;
  const activeShifts = shifts.filter((item) => item.isActive).length;
  const inactiveShifts = Math.max(totalShifts - activeShifts, 0);
  const morningShift = shifts.find((item) => isShiftMatch(item, 'morning')) || null;
  const afternoonShift = shifts.find((item) => isShiftMatch(item, 'afternoon')) || null;

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 tt-shift-page tt-shared-page" dir="rtl">
      <div className="tt-shift-hero tt-shared-header">
        <div className="tt-shift-hero-main">
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">مدیریت نوبت‌ها</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">نوبت‌های مکتب (صبح، بعدازظهر و سایر شیفت‌ها) را در این بخش مدیریت کنید.</p>
          <div className="tt-shift-kpis" aria-label="آمار نوبت‌ها">
            <div className="tt-shift-kpi">
              <span className="tt-shift-kpi-label">کل نوبت‌ها</span>
              <strong className="tt-shift-kpi-value">{totalShifts}</strong>
            </div>
            <div className="tt-shift-kpi">
              <span className="tt-shift-kpi-label">فعال</span>
              <strong className="tt-shift-kpi-value">{activeShifts}</strong>
            </div>
            <div className="tt-shift-kpi">
              <span className="tt-shift-kpi-label">غیرفعال</span>
              <strong className="tt-shift-kpi-value">{inactiveShifts}</strong>
            </div>
          </div>
        </div>
        <Button 
          onClick={() => setShowForm(true)}
          className="tt-shift-primary-btn flex items-center gap-2 w-full lg:w-auto"
        >
          <Plus className="w-4 h-4" />
          افزودن نوبت جدید
        </Button>
      </div>

      <section className="tt-shift-wizard-deck" aria-label="کارت‌های ویزارد شیفت‌ها">
        <Card className="tt-shift-wizard-card tt-shift-wizard-card--morning">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">ویزارد شیفت صبح</CardTitle>
            <p className="tt-shift-wizard-subtitle">تنظیم و مدیریت شیفت صبح به‌صورت سریع</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {morningShift ? (
              <>
                <div className="tt-shift-wizard-row"><span>نام:</span><strong>{morningShift.nameDari || morningShift.name}</strong></div>
                <div className="tt-shift-wizard-row"><span>زمان:</span><strong>{morningShift.startTime} تا {morningShift.endTime}</strong></div>
                <div className="tt-shift-wizard-row"><span>وضعیت:</span><strong>{morningShift.isActive ? 'فعال' : 'غیرفعال'}</strong></div>
                <Button size="sm" variant="outline" className="tt-shift-wizard-btn" onClick={() => handleEdit(morningShift)}>
                  ویرایش شیفت صبح
                </Button>
              </>
            ) : (
              <>
                <p className="tt-shift-wizard-empty">شیفت صبح هنوز ایجاد نشده است.</p>
                <Button
                  size="sm"
                  className="tt-shift-primary-btn"
                  onClick={() => {
                    setShowForm(true);
                    setEditingShift(null);
                    applyPreset('morning');
                  }}
                >
                  ایجاد شیفت صبح
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="tt-shift-wizard-card tt-shift-wizard-card--afternoon">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">ویزارد شیفت بعدازظهر</CardTitle>
            <p className="tt-shift-wizard-subtitle">تنظیم و مدیریت شیفت بعدازظهر به‌صورت سریع</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {afternoonShift ? (
              <>
                <div className="tt-shift-wizard-row"><span>نام:</span><strong>{afternoonShift.nameDari || afternoonShift.name}</strong></div>
                <div className="tt-shift-wizard-row"><span>زمان:</span><strong>{afternoonShift.startTime} تا {afternoonShift.endTime}</strong></div>
                <div className="tt-shift-wizard-row"><span>وضعیت:</span><strong>{afternoonShift.isActive ? 'فعال' : 'غیرفعال'}</strong></div>
                <Button size="sm" variant="outline" className="tt-shift-wizard-btn" onClick={() => handleEdit(afternoonShift)}>
                  ویرایش شیفت بعدازظهر
                </Button>
              </>
            ) : (
              <>
                <p className="tt-shift-wizard-empty">شیفت بعدازظهر هنوز ایجاد نشده است.</p>
                <Button
                  size="sm"
                  className="tt-shift-primary-btn"
                  onClick={() => {
                    setShowForm(true);
                    setEditingShift(null);
                    applyPreset('afternoon');
                  }}
                >
                  ایجاد شیفت بعدازظهر
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {showForm && (
        <Card className="tt-shift-form-card">
          <CardHeader>
            <CardTitle>{editingShift ? 'ویرایش نوبت' : 'افزودن نوبت جدید'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 tt-shift-form">
              <div className="tt-shift-presets" aria-label="پیش‌تنظیم نوبت‌ها">
                <span className="tt-shift-presets-label">پیش‌تنظیم سریع:</span>
                <Button type="button" variant="outline" size="sm" className="tt-shift-preset-btn" onClick={() => applyPreset('morning')}>
                  صبح
                </Button>
                <Button type="button" variant="outline" size="sm" className="tt-shift-preset-btn" onClick={() => applyPreset('afternoon')}>
                  بعدازظهر
                </Button>
                <Button type="button" variant="outline" size="sm" className="tt-shift-preset-btn" onClick={() => applyPreset('evening')}>
                  شب
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 tt-shift-form-grid">
                <div className="tt-shift-field">
                  <Label htmlFor="name">نام نوبت (انگلیسی)</Label>
                  <Select 
                    value={formData.name} 
                    onValueChange={(value) => setFormData({...formData, name: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="نوع نوبت را انتخاب کنید" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning (صبح)</SelectItem>
                      <SelectItem value="afternoon">Afternoon (بعدازظهر)</SelectItem>
                      <SelectItem value="evening">Evening (شب)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="tt-shift-field">
                  <Label htmlFor="code">کد نوبت</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    placeholder="مثال: MOR, AFT, EVE"
                    required
                  />
                </div>

                <div className="tt-shift-field">
                  <Label htmlFor="nameDari">نام نوبت (دری)</Label>
                  <Input
                    id="nameDari"
                    value={formData.nameDari}
                    onChange={(e) => setFormData({...formData, nameDari: e.target.value})}
                    placeholder="صبح"
                    required
                  />
                </div>

                <div className="tt-shift-field">
                  <Label htmlFor="namePashto">نام نوبت (پشتو)</Label>
                  <Input
                    id="namePashto"
                    value={formData.namePashto}
                    onChange={(e) => setFormData({...formData, namePashto: e.target.value})}
                    placeholder="مځین"
                    required
                  />
                </div>

                <div className="tt-shift-field">
                  <Label htmlFor="startTime">زمان شروع</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({...formData, startTime: e.target.value})}
                    required
                  />
                </div>

                <div className="tt-shift-field">
                  <Label htmlFor="endTime">زمان ختم</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({...formData, endTime: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="tt-shift-field">
                <Label htmlFor="description">توضیحات</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="توضیحات اختیاری"
                />
              </div>

              <div className="flex gap-2 tt-shift-form-actions">
                <Button type="submit" className="tt-shift-primary-btn">
                  {editingShift ? 'ذخیره تغییرات' : 'ایجاد نوبت'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  انصراف
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default ShiftManagement;
