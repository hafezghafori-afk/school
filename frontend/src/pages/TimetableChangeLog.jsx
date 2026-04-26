import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { 
  History, 
  Clock, 
  Users, 
  BookOpen, 
  Calendar,
  RefreshCw,
  Filter,
  Search,
  Eye,
  Undo,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatAfghanDateTime } from '../utils/afghanDate';

const TimetableChangeLog = () => {
  const [changes, setChanges] = useState([]);
  const [filteredChanges, setFilteredChanges] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    academicYearId: '',
    shiftId: '',
    classId: '',
    teacherId: '',
    changeType: '',
    dateRange: 'all'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChange, setSelectedChange] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

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

  const weekDays = {
    'saturday': 'شنبه',
    'sunday': 'یکشنبه',
    'monday': 'دوشنبه',
    'tuesday': 'سه‌شنبه',
    'wednesday': 'چهارشنبه',
    'thursday': 'پنجشنبه',
    'friday': 'جمعه'
  };

  const changeTypes = [
    { value: 'create', label: 'ایجاد', color: 'bg-green-100 text-green-800' },
    { value: 'update', label: 'به‌روزرسانی', color: 'bg-blue-100 text-blue-800' },
    { value: 'delete', label: 'حذف', color: 'bg-red-100 text-red-800' },
    { value: 'move', label: 'انتقال', color: 'bg-purple-100 text-purple-800' }
  ];

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
    fetchAcademicYears();
    fetchShifts();
    fetchChanges();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [changes, filters, searchTerm]);

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setClasses(data.data);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`/api/users/school/${schoolId}?role=teacher`);
      const data = await response.json();
      
      if (data.success) {
        setTeachers(data.data);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data.filter(year => year.status === 'active'));
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
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const fetchChanges = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.academicYearId) params.append('academicYearId', filters.academicYearId);
      if (filters.shiftId) params.append('shiftId', filters.shiftId);
      if (filters.classId) params.append('classId', filters.classId);
      if (filters.teacherId) params.append('teacherId', filters.teacherId);

      const response = await fetch(`/api/timetable/history/${schoolId}?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setChanges(data.data);
      } else {
        toast.error('خطا در دریافت تاریخچه تغییرات.');
      }
    } catch (error) {
      console.error('Error fetching change history:', error);
      toast.error('خطا در دریافت تاریخچه تغییرات.');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...changes];

    // Filter by change type
    if (filters.changeType) {
      filtered = filtered.filter(change => 
        change.source?.includes(filters.changeType) || 
        change.status === filters.changeType
      );
    }

    // Filter by date range
    if (filters.dateRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (filters.dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      if (startDate) {
        filtered = filtered.filter(change => 
          new Date(change.lastModifiedAt || change.createdAt) >= startDate
        );
      }
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(change => {
        const teacherName = `${change.teacherId?.firstName || ''} ${change.teacherId?.lastName || ''}`.toLowerCase();
        const className = change.classId?.title?.toLowerCase() || '';
        const subjectName = change.subjectId?.name?.toLowerCase() || '';
        const modifiedBy = `${change.lastModifiedBy?.firstName || ''} ${change.lastModifiedBy?.lastName || ''}`.toLowerCase();
        
        return teacherName.includes(searchLower) ||
               className.includes(searchLower) ||
               subjectName.includes(searchLower) ||
               modifiedBy.includes(searchLower);
      });
    }

    setFilteredChanges(filtered);
  };

  const handleUndoChange = async (change) => {
    try {
      // Implementation would depend on the change type
      toast.info('قابلیت برگشت تغییر در حال توسعه است، به زودی در دسترس خواهد بود.');
    } catch (error) {
      console.error('Error undoing change:', error);
      toast.error('برگشت تغییر ناموفق بود.');
    }
  };

  const handleRevertChange = async (change) => {
    try {
      // Implementation to revert to a specific state
      toast.info('قابلیت بازگردانی کامل در حال توسعه است، به زودی در دسترس خواهد بود.');
    } catch (error) {
      console.error('Error reverting change:', error);
      toast.error('بازگردانی تغییر ناموفق بود.');
    }
  };

  const getChangeTypeColor = (change) => {
    if (change.source?.includes('manual')) return 'bg-blue-100 text-blue-800';
    if (change.source?.includes('auto')) return 'bg-green-100 text-green-800';
    if (change.source?.includes('override')) return 'bg-purple-100 text-purple-800';
    if (change.status === 'deleted') return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getChangeTypeLabel = (change) => {
    if (change.source?.includes('manual_edit')) return 'ویرایش دستی';
    if (change.source?.includes('manual_move')) return 'انتقال دستی';
    if (change.source?.includes('manual_override')) return 'بازنویسی دستی';
    if (change.source?.includes('auto')) return 'تولید خودکار';
    if (change.status === 'deleted') return 'حذف‌شده';
    return 'نامشخص';
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'draft':
        return 'پیش‌نویس';
      case 'active':
        return 'فعال';
      case 'published':
        return 'منتشرشده';
      case 'archived':
        return 'بایگانی‌شده';
      case 'deleted':
        return 'حذف‌شده';
      default:
        return status || 'نامشخص';
    }
  };

  const getSourceLabel = (source) => {
    switch (source) {
      case 'manual_edit':
        return 'ویرایش دستی';
      case 'manual_move':
        return 'انتقال دستی';
      case 'manual_override':
        return 'بازنویسی دستی';
      case 'auto':
      case 'auto_generate':
        return 'تولید خودکار';
      default:
        return source || 'نامشخص';
    }
  };

  const formatDateTime = (dateTime) => {
    return formatAfghanDateTime(dateTime, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) || '---';
  };

  const renderChangeDetails = (change) => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="font-semibold mb-2">جزئیات درس</h4>
            <div className="space-y-1 text-sm">
              <div><strong>موضوع:</strong> {change.subjectId?.name}</div>
              <div><strong>معلم:</strong> {change.teacherId?.firstName} {change.teacherId?.lastName}</div>
              <div><strong>صنف:</strong> {change.classId?.title}</div>
              <div><strong>وقت:</strong> {change.startTime} - {change.endTime}</div>
              <div><strong>روز:</strong> {weekDaysLocalized[change.dayCode]} - زنگ {change.periodIndex}</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold mb-2">تاریخچه تغییر</h4>
            <div className="space-y-1 text-sm">
              <div><strong>نوع:</strong> {getChangeTypeLabel(change)}</div>
              <div><strong>وضعیت:</strong> {getStatusLabel(change.status)}</div>
              <div><strong>منبع:</strong> {getSourceLabel(change.source)}</div>
              <div><strong>ایجاد:</strong> {formatDateTime(change.createdAt)}</div>
              <div><strong>به‌روزرسانی:</strong> {formatDateTime(change.lastModifiedAt)}</div>
            </div>
          </div>
        </div>

        {change.createdBy && (
          <div>
            <h4 className="font-semibold mb-2">ایجادکننده اصلی</h4>
            <div className="text-sm">
              {change.createdBy.firstName} {change.createdBy.lastName}
            </div>
          </div>
        )}

        {change.lastModifiedBy && (
          <div>
            <h4 className="font-semibold mb-2">جزئیات به‌روزرسانی کننده</h4>
            <div className="text-sm">
              {change.lastModifiedBy.firstName} {change.lastModifiedBy.lastName}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-4 border-t">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleUndoChange(change)}
          >
            <Undo className="w-4 h-4 mr-2" />
            برگشت
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleRevertChange(change)}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            بازگردانی
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page">
      <div className="flex justify-between items-center tt-shared-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">تاریخچه تغییرات</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">تغییرات اعمال‌شده، بازگرداندن و مشاهده عملیات قبلی.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchChanges}>
            <RefreshCw className="w-4 h-4 mr-2" />
            بارگذاری مجدد
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            فیلترها
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سال تعلیمی</label>
              <Select
                value={filters.academicYearId}
                onValueChange={(value) => setFilters(prev => ({ ...prev, academicYearId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب سال تعلیمی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب سال تعلیمی</SelectItem>
                  {academicYears.map((year) => (
                    <SelectItem key={year._id} value={year._id}>
                      {year.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوبت</label>
              <Select
                value={filters.shiftId}
                onValueChange={(value) => setFilters(prev => ({ ...prev, shiftId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوبت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب نوبت</SelectItem>
                  {shifts.map((shift) => (
                    <SelectItem key={shift._id} value={shift._id}>
                      {shift.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">صنف</label>
              <Select
                value={filters.classId}
                onValueChange={(value) => setFilters(prev => ({ ...prev, classId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب صنف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب صنف</SelectItem>
                  {classes.map((classItem) => (
                    <SelectItem key={classItem._id} value={classItem._id}>
                      {classItem.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">معلم</label>
              <Select
                value={filters.teacherId}
                onValueChange={(value) => setFilters(prev => ({ ...prev, teacherId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب معلم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب معلم</SelectItem>
                  {teachers.map((teacher) => (
                    <SelectItem key={teacher._id} value={teacher._id}>
                      {teacher.firstName} {teacher.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوع تغییر</label>
              <Select
                value={filters.changeType}
                onValueChange={(value) => setFilters(prev => ({ ...prev, changeType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب نوع</SelectItem>
                  <SelectItem value="manual">دستی</SelectItem>
                  <SelectItem value="auto">خودکار</SelectItem>
                  <SelectItem value="override">بازنویسی</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">محدوده تاریخ</label>
              <Select
                value={filters.dateRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, dateRange: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب محدوده" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه</SelectItem>
                  <SelectItem value="today">امروز</SelectItem>
                  <SelectItem value="week">هفته گذشته</SelectItem>
                  <SelectItem value="month">ماه گذشته</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="جستجو براساس معلم، صنف یا موضوع..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <History className="w-5 h-5" />
              تاریخچه تغییرات ({filteredChanges.length})
            </span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {changes.length} کل تغییرات
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredChanges.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">هیچ تغییری یافت نشد</h3>
              <p className="text-gray-600">
                {changes.length === 0 
                  ? 'هنوز هیچ تغییری ثبت نشده است.'
                  : 'هیچ تغییری با فیلترهای انتخاب شده یافت نشد.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredChanges.map((change, index) => (
                <div
                  key={change._id || index}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedChange(change);
                    setShowDetails(true);
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={getChangeTypeColor(change)}>
                          {getChangeTypeLabel(change)}
                        </Badge>
                        <span className="font-medium">
                          {change.subjectId?.name}
                        </span>
                        <ArrowRight className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600">
                          {change.classId?.title}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {change.teacherId?.firstName} {change.teacherId?.lastName}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {weekDaysLocalized[change.dayCode]} - زنگ {change.periodIndex}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {change.startTime} - {change.endTime}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {change.lastModifiedBy?.firstName} {change.lastModifiedBy?.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDateTime(change.lastModifiedAt)}
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Modal */}
      {showDetails && selectedChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center tt-shared-header mb-4">
              <h3 className="text-lg font-semibold">جزئیات تغییر</h3>
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            {renderChangeDetails(selectedChange)}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimetableChangeLog;

