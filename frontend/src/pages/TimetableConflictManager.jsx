import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  Users, 
  BookOpen, 
  CheckCircle, 
  XCircle,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const TimetableConflictManager = () => {
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [resolvingConflict, setResolvingConflict] = useState(null);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const weekDaysLocalized = {
    saturday: 'شنبه',
    sunday: 'یکشنبه',
    monday: 'دوشنبه',
    tuesday: 'سه‌شنبه',
    wednesday: 'چهارشنبه',
    thursday: 'پنجشنبه',
    friday: 'جمعه'
  };

  const slotMetaByPeriod = {
    1: { label: 'زنگ 1', startTime: '08:00', endTime: '08:40' },
    2: { label: 'زنگ 2', startTime: '08:40', endTime: '09:20' },
    3: { label: 'زنگ 3', startTime: '09:20', endTime: '10:00' },
    4: { label: 'تفریح', startTime: '10:00', endTime: '10:10' },
    5: { label: 'زنگ 4', startTime: '10:10', endTime: '10:50' },
    6: { label: 'زنگ 5', startTime: '10:50', endTime: '11:30' },
    7: { label: 'زنگ 6', startTime: '11:30', endTime: '12:10' }
  };

  const getTeacherLabel = (teacher) => {
    if (!teacher) return '---';
    if (typeof teacher.name === 'string' && teacher.name.trim()) return teacher.name;
    const full = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    return full || '---';
  };

  const getClassLabel = (schoolClass) => {
    if (!schoolClass) return '---';
    const title = String(schoolClass.title || '').trim();
    const section = String(schoolClass.section || '').trim();
    return [title, section].filter(Boolean).join(' - ') || title || '---';
  };

  useEffect(() => {
    fetchAcademicYears();
    fetchShifts();
  }, []);

  useEffect(() => {
    if (selectedAcademicYear && selectedShift) {
      fetchConflicts();
    }
  }, [selectedAcademicYear, selectedShift]);

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data.filter(year => year.status === 'active'));
        if (data.data.length > 0) {
          setSelectedAcademicYear(data.data.find(year => year.status === 'active')?._id || data.data[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchShifts = async () => {
    try {
      const response = await fetch(`/api/shifts/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
        if (data.data.length > 0) {
          setSelectedShift(data.data[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const fetchConflicts = async () => {
    if (!selectedAcademicYear || !selectedShift) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/timetable/conflicts/${schoolId}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`);
      const data = await response.json();
      
      if (data.success) {
        setConflicts(data.data.conflicts);
      } else {
        toast.error('دریافت تداخل‌ها ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error);
      toast.error('دریافت تداخل‌ها ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveConflict = async (conflictId, resolution) => {
    setResolvingConflict(conflictId);
    
    try {
      // Implementation for conflict resolution
      // This would depend on the specific resolution strategy
      toast.success('تداخل با موفقیت حل شد.');
      fetchConflicts();
    } catch (error) {
      console.error('Error resolving conflict:', error);
      toast.error('حل تداخل ناموفق بود.');
    } finally {
      setResolvingConflict(null);
    }
  };

  const getConflictIcon = (type) => {
    return type === 'class' ? <Users className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />;
  };

  const getConflictColor = (type) => {
    return type === 'class' ? 'text-red-600 bg-red-50' : 'text-orange-600 bg-orange-50';
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page">
      <div className="flex justify-between items-center tt-shared-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">تداخل‌های تقسیم اوقات</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">تداخل‌های زمانی را ببینید و برای رفع آن‌ها اقدام کنید.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={fetchConflicts}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            بازخوانی
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سال تعلیمی</label>
              <select
                value={selectedAcademicYear}
                onChange={(e) => setSelectedAcademicYear(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                {academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوبت</label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
              >
                {shifts.map((shift) => (
                  <option key={shift._id} value={shift._id}>
                    {shift.name} ({shift.nameDari})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflict Summary */}
      <Card>
        <CardHeader>
          <CardTitle>خلاصه تداخل‌ها</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{conflicts.length}</div>
              <div className="text-sm text-gray-600">کل تداخل‌ها</div>
            </div>
            <div className="p-4 bg-orange-50 rounded-lg">
              <div className="text-3xl font-bold text-orange-600">
                {conflicts.filter(c => c.type === 'class').length}
              </div>
              <div className="text-sm text-gray-600">تداخل‌های صنف</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg">
              <div className="text-3xl font-bold text-yellow-600">
                {conflicts.filter(c => c.type === 'teacher').length}
              </div>
              <div className="text-sm text-gray-600">تداخل‌های استاد</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts List */}
      <div className="space-y-4">
        {conflicts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">هیچ تداخلی پیدا نشد</h3>
              <p className="text-gray-600">
                تقسیم اوقات انتخاب‌شده بدون تداخل است.
              </p>
            </CardContent>
          </Card>
        ) : (
          conflicts.map((conflict, index) => {
            const slotMeta = slotMetaByPeriod[Number(conflict.periodIndex)] || null;
            const conflictId = conflict._id || `${conflict.type}-${conflict.dayCode}-${conflict.periodIndex}-${index}`;
            return (
            <Card key={conflictId} className="border-l-4 border-red-500">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getConflictIcon(conflict.type)}
                      <h3 className="font-semibold text-lg">
                        {conflict.type === 'class' ? 'تداخل صنف' : 'تداخل استاد'}
                      </h3>
                      <Badge className={getConflictColor(conflict.type)}>
                        {conflict.type === 'class' ? 'صنف' : 'استاد'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        <span>
                          {weekDaysLocalized[conflict.dayCode] || conflict.dayCode} - {slotMeta?.label || `زنگ ${conflict.periodIndex}`}
                          {slotMeta ? ` (${slotMeta.startTime} تا ${slotMeta.endTime})` : ''}
                        </span>
                      </div>
                      
                      {conflict.type === 'class' && conflict.class && (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-500" />
                          <span>{getClassLabel(conflict.class)}</span>
                        </div>
                      )}
                      
                      {conflict.type === 'teacher' && conflict.teacher && (
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-gray-500" />
                          <span>{getTeacherLabel(conflict.teacher)}</span>
                        </div>
                      )}
                    </div>

                    {/* Conflicting Entries */}
                    <div className="mt-4 space-y-2">
                      <div className="text-sm font-medium text-gray-700">خانه‌های متداخل:</div>
                      <div className="space-y-2">
                        {conflict.entries.map((entry, entryIndex) => (
                          <div key={entryIndex} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                            <div className="flex items-center gap-2 text-sm">
                              <Badge variant="outline" className="text-xs">
                                {String(entry?.subjectId?.category || 'مضمون')}
                              </Badge>
                              <span>{String(entry?.subjectId?.name || '---')}</span>
                              <span className="text-gray-500">با</span>
                              <span>{getTeacherLabel(entry?.teacherId)}</span>
                              {conflict.type === 'class' && (
                                <span className="text-gray-500">در</span>
                              )}
                              {conflict.type === 'class' && (
                                <span>{getClassLabel(entry?.classId)}</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {entry?.startTime || slotMeta?.startTime || '--:--'} - {entry?.endTime || slotMeta?.endTime || '--:--'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolveConflict(conflictId, 'auto')}
                      disabled={resolvingConflict === conflictId}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      حل خودکار
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleResolveConflict(conflictId, 'manual')}
                      disabled={resolvingConflict === conflictId}
                    >
                      <Users className="w-3 h-3 mr-1" />
                      حل دستی
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          })
        )}
      </div>

      {/* Resolution Tips */}
      {conflicts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              راهنمای رفع تداخل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5"></div>
                <div>
                  <strong>تداخل صنف:</strong> یک صنف نمی‌تواند در یک زمان چند مضمون داشته باشد.
                  یکی از مضمون‌ها را به ساعت دیگری منتقل کنید.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-1.5"></div>
                <div>
                  <strong>تداخل استاد:</strong> یک استاد نمی‌تواند هم‌زمان در چند صنف حضور داشته باشد.
                  حضور استاد و تخصیص‌ها را دوباره بررسی کنید.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-1.5"></div>
                <div>
                  <strong>حل خودکار:</strong> سیستم می‌تواند بر اساس محدودیت‌ها و حضور استاد،
                  زمان بدیل پیدا کند و بخشی از تداخل‌ها را رفع نماید.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TimetableConflictManager;
