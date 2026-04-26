import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { 
  Printer, 
  Download, 
  FileText, 
  Calendar, 
  Users, 
  BookOpen,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings
} from 'lucide-react';
import { toast } from 'react-hot-toast';

const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const TimetableReports = () => {
  const [reports, setReports] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [selectedReportType, setSelectedReportType] = useState('class');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';
  const hasValidSchoolId = isValidObjectId(schoolId);

  const weekDaysLocalized = [
    { value: 'saturday', labelDari: 'شنبه', short: 'ش' },
    { value: 'sunday', labelDari: 'یکشنبه', short: 'ی' },
    { value: 'monday', labelDari: 'دوشنبه', short: 'د' },
    { value: 'tuesday', labelDari: 'سه‌شنبه', short: 'س' },
    { value: 'wednesday', labelDari: 'چهارشنبه', short: 'چ' },
    { value: 'thursday', labelDari: 'پنجشنبه', short: 'پ' },
    { value: 'friday', labelDari: 'جمعه', short: 'ج' }
  ];

  const weekDays = [
    { value: 'saturday', label: 'Saturday', labelDari: 'شنبه', short: 'Sat' },
    { value: 'sunday', label: 'Sunday', labelDari: 'یکشنبه', short: 'Sun' },
    { value: 'monday', label: 'Monday', labelDari: 'دوشنبه', short: 'Mon' },
    { value: 'tuesday', label: 'Tuesday', labelDari: 'سه‌شنبه', short: 'Tue' },
    { value: 'wednesday', label: 'Wednesday', labelDari: 'چهارشنبه', short: 'Wed' },
    { value: 'thursday', label: 'Thursday', labelDari: 'پنجشنبه', short: 'Thu' },
    { value: 'friday', label: 'Friday', labelDari: 'جمعه', short: 'Fri' }
  ];

  const slotRows = [
    { slotNumber: 1, startTime: '08:00', endTime: '08:40', type: 'class', label: 'زنگ 1' },
    { slotNumber: 2, startTime: '08:40', endTime: '09:20', type: 'class', label: 'زنگ 2' },
    { slotNumber: 3, startTime: '09:20', endTime: '10:00', type: 'class', label: 'زنگ 3' },
    { slotNumber: 4, startTime: '10:00', endTime: '10:10', type: 'break', label: 'تفریح' },
    { slotNumber: 5, startTime: '10:10', endTime: '10:50', type: 'class', label: 'زنگ 4' },
    { slotNumber: 6, startTime: '10:50', endTime: '11:30', type: 'class', label: 'زنگ 5' },
    { slotNumber: 7, startTime: '11:30', endTime: '12:10', type: 'class', label: 'زنگ 6' }
  ];

  const getTeacherLabel = (teacher) => {
    if (!teacher) return '---';
    if (typeof teacher.name === 'string' && teacher.name.trim()) return teacher.name;
    const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    return fullName || '---';
  };

  const getEntryTeacherLabel = (entry) => {
    const teacher = entry?.teacherId;
    if (!teacher) return '---';
    if (typeof teacher === 'string') return teacher;
    if (typeof teacher.name === 'string' && teacher.name.trim()) return teacher.name;
    const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
    return fullName || '---';
  };

  const reportTypes = [
    { value: 'class', label: 'تقسیم اوقات صنف', description: 'تقسیم اوقات هفته‌وار برای یک صنف مشخص' },
    { value: 'teacher', label: 'تقسیم اوقات استاد', description: 'برنامه هفته‌وار یک استاد مشخص' },
    { value: 'department', label: 'خلاصه دیپارتمنت', description: 'نمای کلی صنف‌های یک دیپارتمنت' },
    { value: 'school', label: 'نمای کلی مکتب', description: 'خلاصه کامل تقسیم اوقات مکتب' },
    { value: 'conflicts', label: 'گزارش تداخل', description: 'فهرست همه تداخل‌های زمان‌بندی' },
    { value: 'workload', label: 'بار درسی استادان', description: 'تحلیل بار درسی استادان' },
    { value: 'room', label: 'استفاده از اتاق‌ها', description: 'آمار استفاده از صنف‌ها و اتاق‌ها' },
    { value: 'attendance', label: 'فورم حضور', description: 'برگه‌های حضور برای صنف‌ها' }
  ];

  const reportNeedsTarget = !['school', 'conflicts'].includes(selectedReportType);

  useEffect(() => {
    if (!hasValidSchoolId) {
      toast.error('ابتدا یک مکتب معتبر انتخاب یا ایجاد کنید.');
      return;
    }

    fetchClasses();
    fetchTeachers();
    fetchAcademicYears();
    fetchShifts();
  }, [hasValidSchoolId]);

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

  const handleGenerateReport = async () => {
    if (!selectedAcademicYear || !selectedShift) {
      toast.error('لطفاً سال تعلیمی و نوبت را انتخاب کنید.');
      return;
    }

    if (reportNeedsTarget && !selectedTarget) {
      toast.error('لطفاً گزینه هدف گزارش را انتخاب کنید.');
      return;
    }

    setLoading(true);
    try {
      let url = '';
      
      switch (selectedReportType) {
        case 'class':
          url = `/api/timetable/class/${selectedTarget}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
          break;
        case 'teacher':
          url = `/api/timetable/teacher/${selectedTarget}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
          break;
        case 'school':
          url = `/api/timetable/entries/${schoolId}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
          break;
        case 'conflicts':
          url = `/api/timetable/conflicts/${schoolId}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
          break;
        default:
          url = `/api/reports/${selectedReportType}?schoolId=${schoolId}&academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}&target=${selectedTarget}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success) {
        setPreviewData(data.data);
        setShowPreview(true);
        toast.success('گزارش ساخته شد.');
      } else {
        toast.error('ساخت گزارش ناموفق بود.');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('ساخت گزارش ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    toast.info('قابلیت برون‌برد پی‌دی‌اف به‌زودی فعال می‌شود.');
  };

  const handleExportExcel = () => {
    toast.info('قابلیت برون‌برد اکسل به‌زودی فعال می‌شود.');
  };

  const renderClassReport = () => {
    if (!previewData?.timetable) return null;

    const classInfo = classes.find(c => c._id === selectedTarget);
    
    return (
      <div className="space-y-4">
        <div className="text-center border-b pb-4">
          <h2 className="text-2xl font-bold">{classInfo?.title}</h2>
          <p className="text-gray-600">
            {academicYears.find(y => y._id === selectedAcademicYear)?.title} - 
            {shifts.find(s => s._id === selectedShift)?.name}
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-2 text-left">ساعت</th>
                {weekDaysLocalized.map(day => (
                  <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">
                    <div>{day.labelDari}</div>
                    <div className="text-xs text-gray-500">{day.short}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotRows.map((slotRow) => (
                <tr key={slotRow.slotNumber}>
                  <td className="border border-gray-300 px-4 py-2 font-medium bg-gray-50">
                    <div>{slotRow.label}</div>
                    <div className="text-xs text-gray-500">{slotRow.startTime} - {slotRow.endTime}</div>
                  </td>
                  {weekDaysLocalized.map(day => {
                    const entry = previewData.timetable[day.value]?.[slotRow.slotNumber];
                    if (slotRow.type === 'break') {
                      return (
                        <td key={`${day.value}-${slotRow.slotNumber}`} className="border border-gray-300 px-2 py-2 align-middle text-center bg-amber-50 text-amber-700">
                          ---
                        </td>
                      );
                    }
                    return (
                      <td key={`${day.value}-${slotRow.slotNumber}`} className="border border-gray-300 px-2 py-2 align-top">
                        {entry ? (
                          <div className="min-h-[60px] p-1">
                            <div className="font-semibold text-sm">{entry.subjectId.name}</div>
                            <div className="text-xs text-gray-600">{getEntryTeacherLabel(entry)}</div>
                            <div className="text-xs text-gray-500">{entry.startTime} - {entry.endTime}</div>
                          </div>
                        ) : (
                          <div className="min-h-[60px] bg-gray-50"></div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTeacherReport = () => {
    if (!previewData?.timetable) return null;

    const teacherInfo = teachers.find(t => t._id === selectedTarget);
    
    return (
      <div className="space-y-4">
        <div className="text-center border-b pb-4">
          <h2 className="text-2xl font-bold">
            {getTeacherLabel(teacherInfo)}
          </h2>
          <p className="text-gray-600">
            تقسیم اوقات استاد - {academicYears.find(y => y._id === selectedAcademicYear)?.title} -
            {shifts.find(s => s._id === selectedShift)?.name}
          </p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-300 px-4 py-2 text-left">ساعت</th>
                {weekDaysLocalized.map(day => (
                  <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">
                    <div>{day.labelDari}</div>
                    <div className="text-xs text-gray-500">{day.short}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slotRows.map((slotRow) => (
                <tr key={slotRow.slotNumber}>
                  <td className="border border-gray-300 px-4 py-2 font-medium bg-gray-50">
                    <div>{slotRow.label}</div>
                    <div className="text-xs text-gray-500">{slotRow.startTime} - {slotRow.endTime}</div>
                  </td>
                  {weekDaysLocalized.map(day => {
                    const entry = previewData.timetable[day.value]?.[slotRow.slotNumber];
                    if (slotRow.type === 'break') {
                      return (
                        <td key={`${day.value}-${slotRow.slotNumber}`} className="border border-gray-300 px-2 py-2 align-middle text-center bg-amber-50 text-amber-700">
                          ---
                        </td>
                      );
                    }
                    return (
                      <td key={`${day.value}-${slotRow.slotNumber}`} className="border border-gray-300 px-2 py-2 align-top">
                        {entry ? (
                          <div className="min-h-[60px] p-1">
                            <div className="font-semibold text-sm">{entry.classId.title}</div>
                            <div className="text-xs text-gray-600">{entry.subjectId.name}</div>
                            <div className="text-xs text-gray-500">{entry.startTime} - {entry.endTime}</div>
                          </div>
                        ) : (
                          <div className="min-h-[60px] bg-gray-50"></div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderConflictReport = () => {
    if (!previewData?.conflicts) return null;

    return (
      <div className="space-y-4">
        <div className="text-center border-b pb-4">
          <h2 className="text-2xl font-bold">گزارش تداخل تقسیم اوقات</h2>
          <p className="text-gray-600">
            {academicYears.find(y => y._id === selectedAcademicYear)?.title} - 
            {shifts.find(s => s._id === selectedShift)?.name}
          </p>
        </div>
        
        <div className="space-y-2">
          {previewData.conflicts.map((conflict, index) => (
            <div key={index} className="border-l-4 border-red-500 p-3 bg-red-50">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <span className="font-semibold">
                  {conflict.type === 'class' ? 'تداخل صنف' : 'تداخل استاد'}
                </span>
                <Badge variant="outline">
                  {weekDaysLocalized.find(d => d.value === conflict.dayCode)?.labelDari} - ساعت {conflict.periodIndex}
                </Badge>
              </div>
              <div className="text-sm text-gray-700">
                {conflict.entries.map((entry, entryIndex) => (
                  <div key={entryIndex} className="mb-1">
                    {entry.subjectId.name} با {getEntryTeacherLabel(entry)}
                    {conflict.type === 'class' && ` در ${entry.classId.title}`}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (!showPreview || !previewData) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-auto">
          <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center tt-shared-header">
            <h3 className="text-lg font-semibold">پیش‌نمایش گزارش</h3>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                چاپ
              </Button>
              <Button variant="outline" onClick={handleExportPDF}>
                <Download className="w-4 h-4 mr-2" />
                پی‌دی‌اف
              </Button>
              <Button variant="outline" onClick={handleExportExcel}>
                <FileText className="w-4 h-4 mr-2" />
                اکسل
              </Button>
              <Button variant="outline" onClick={() => setShowPreview(false)}>
                بستن
              </Button>
            </div>
          </div>
          
          <div className="p-6 print:print-timetable">
            {selectedReportType === 'class' && renderClassReport()}
            {selectedReportType === 'teacher' && renderTeacherReport()}
            {selectedReportType === 'conflicts' && renderConflictReport()}
            {selectedReportType === 'school' && (
              <div className="text-center text-gray-500">
                گزارش نمای کلی مکتب به‌زودی فعال می‌شود...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page">
      <div className="flex justify-between items-center tt-shared-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">گزارش‌های تقسیم اوقات</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">گزارش‌های مختلف تقسیم اوقات را بسازید و برون‌برد بگیرید.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/timetable/shift-management">مدیریت نوبت‌ها</Link>
          </Button>
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            تنظیمات گزارش
          </Button>
        </div>
      </div>

      {/* Report Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>تنظیم گزارش</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نوع گزارش</label>
              <Select value={selectedReportType} onValueChange={setSelectedReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوع گزارش" />
                </SelectTrigger>
                <SelectContent>
                  {reportTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedReportType && (
                <p className="text-xs text-gray-500 mt-1">
                  {reportTypes.find(t => t.value === selectedReportType)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سال تعلیمی</label>
              <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب سال" />
                </SelectTrigger>
                <SelectContent>
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
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={selectedShift} onValueChange={setSelectedShift}>
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب نوبت" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.map((shift) => (
                        <SelectItem key={shift._id} value={shift._id}>
                          {shift.name} ({shift.nameDari})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/timetable/shift-management">تنظیم</Link>
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {selectedReportType === 'class' ? 'صنف' :
                 selectedReportType === 'teacher' ? 'استاد' : 'هدف'}
              </label>
              {selectedReportType === 'class' && (
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب صنف" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem._id} value={classItem._id}>
                        {classItem.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedReportType === 'teacher' && (
                <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب استاد" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher._id} value={teacher._id}>
                        {getTeacherLabel(teacher)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selectedReportType === 'school' && (
                <div className="p-2 border border-gray-300 rounded-md bg-gray-50">
                  <span className="text-sm text-gray-600">همه صنف‌ها و استادان</span>
                </div>
              )}
              {selectedReportType === 'conflicts' && (
                <div className="p-2 border border-gray-300 rounded-md bg-gray-50">
                  <span className="text-sm text-gray-600">همه تداخل‌ها</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={handleGenerateReport} 
              disabled={loading || !selectedAcademicYear || !selectedShift || (reportNeedsTarget && !selectedTarget)}
            >
              <FileText className="w-4 h-4 mr-2" />
              {loading ? 'در حال ساخت...' : 'ساخت گزارش'}
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              برون‌برد سریع
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Available Reports */}
      <Card>
        <CardHeader>
          <CardTitle>گزارش‌های موجود</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reportTypes.map((type) => (
              <Card key={type.value} className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      {type.value === 'class' && <Users className="w-5 h-5 text-blue-600" />}
                      {type.value === 'teacher' && <BookOpen className="w-5 h-5 text-blue-600" />}
                      {type.value === 'school' && <Calendar className="w-5 h-5 text-blue-600" />}
                      {type.value === 'conflicts' && <AlertCircle className="w-5 h-5 text-blue-600" />}
                      {type.value === 'workload' && <Clock className="w-5 h-5 text-blue-600" />}
                      {['department', 'room', 'attendance'].includes(type.value) && <FileText className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div>
                      <h3 className="font-semibold">{type.label}</h3>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">{type.description}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1">
                      <Printer className="w-3 h-3 mr-1" />
                      چاپ
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1">
                      <Download className="w-3 h-3 mr-1" />
                      برون‌برد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {renderPreview()}
    </div>
  );
};

export default TimetableReports;
