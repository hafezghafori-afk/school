import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { CalendarDays, Users, GraduationCap, Trash2, Save, X, Printer } from 'lucide-react';
import { toast } from 'react-hot-toast';
import '../styles/timetable-print.css';
import './TimetableOperations.css';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const WEEK_DAYS = [
  { value: 'saturday', label: 'شنبه' },
  { value: 'sunday', label: 'یکشنبه' },
  { value: 'monday', label: 'دوشنبه' },
  { value: 'tuesday', label: 'سه‌شنبه' },
  { value: 'wednesday', label: 'چهارشنبه' },
  { value: 'thursday', label: 'پنجشنبه' }
];

const SLOT_ROWS = [
  { slotNumber: 1, label: 'زنگ 1', startTime: '08:00', endTime: '08:40', type: 'class' },
  { slotNumber: 2, label: 'زنگ 2', startTime: '08:40', endTime: '09:20', type: 'class' },
  { slotNumber: 3, label: 'زنگ 3', startTime: '09:20', endTime: '10:00', type: 'class' },
  { slotNumber: 4, label: 'تفریح', startTime: '10:00', endTime: '10:10', type: 'break' },
  { slotNumber: 5, label: 'زنگ 4', startTime: '10:10', endTime: '10:50', type: 'class' },
  { slotNumber: 6, label: 'زنگ 5', startTime: '10:50', endTime: '11:30', type: 'class' },
  { slotNumber: 7, label: 'زنگ 6', startTime: '11:30', endTime: '12:10', type: 'class' }
];

const SLOT_BY_NUMBER = SLOT_ROWS.reduce((acc, slot) => {
  acc[slot.slotNumber] = slot;
  return acc;
}, {});

const CELL_FILTERS = [
  { key: 'all', label: 'همه خانه‌ها' },
  { key: 'filled', label: 'ثبت‌شده' },
  { key: 'empty', label: 'خالی' },
  { key: 'break', label: 'تفریح' }
];

const DAY_LABEL_MAP = WEEK_DAYS.reduce((acc, day) => {
  acc[day.value] = day.label;
  return acc;
}, {});

function getTeacherLabel(teacher) {
  if (!teacher) return '---';
  if (typeof teacher.name === 'string' && teacher.name.trim()) return teacher.name;
  const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  return fullName || '---';
}

function getSubjectLabel(subject) {
  if (!subject) return '---';
  if (typeof subject.name === 'string' && subject.name.trim()) return subject.name;
  return '---';
}

function getSaveErrorMessage(payload, fallback = 'ذخیره خانه ناموفق بود.') {
  const conflictType = String(payload?.conflictType || '').trim().toLowerCase();
  if (conflictType === 'teacher') return 'تداخل استاد: این استاد در همین زنگ قبلاً ثبت شده است.';
  if (conflictType === 'class') return 'تداخل صنف: این صنف در همین زنگ قبلاً ثبت شده است.';

  const message = String(payload?.message || '').toLowerCase();
  if (message.includes('allowed class periods') || message.includes('break slot')) {
    return 'در زنگ تفریح یا زنگ نامعتبر نمی‌توان درس ثبت کرد.';
  }

  return payload?.message || fallback;
}

export default function TimetableOperations() {
  const [viewType, setViewType] = useState('class');
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [entries, setEntries] = useState([]);
  const [timetable, setTimetable] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cellFilter, setCellFilter] = useState('all');
  const [executiveFocus, setExecutiveFocus] = useState(false);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';
  const hasValidSchoolId = isValidObjectId(schoolId);

  const titleTarget = useMemo(() => {
    if (viewType === 'class') {
      return classes.find((item) => item._id === selectedClass)?.title || 'صنف';
    }
    return getTeacherLabel(teachers.find((item) => item._id === selectedTeacher));
  }, [classes, teachers, selectedClass, selectedTeacher, viewType]);

  const slotClassCount = SLOT_ROWS.filter((slot) => slot.type === 'class').length;
  const totalClassCells = WEEK_DAYS.length * slotClassCount;
  const filledCells = entries.length;
  const emptyCells = Math.max(totalClassCells - filledCells, 0);
  const focusFilter = executiveFocus ? 'empty' : cellFilter;
  const focusQuery = executiveFocus ? '' : searchQuery.trim().toLowerCase();

  const doesCellMatch = (dayCode, slot, entry) => {
    const isBreak = slot.type === 'break';
    const query = focusQuery;

    const filterMatch = (() => {
      if (focusFilter === 'all') return true;
      if (focusFilter === 'break') return isBreak;
      if (isBreak) return false;
      if (focusFilter === 'filled') return Boolean(entry);
      if (focusFilter === 'empty') return !entry;
      return true;
    })();

    if (!filterMatch) return false;
    if (!query) return true;

    const searchableParts = [
      DAY_LABEL_MAP[dayCode] || dayCode,
      slot.label,
      slot.startTime,
      slot.endTime,
      getSubjectLabel(entry?.subjectId),
      getTeacherLabel(entry?.teacherId),
      entry?.classId?.title || ''
    ];

    return searchableParts.join(' ').toLowerCase().includes(query);
  };

  useEffect(() => {
    if (executiveFocus && viewType !== 'class') {
      setViewType('class');
    }
  }, [executiveFocus, viewType]);

  const handleResetSmart = () => {
    setExecutiveFocus(false);
    setSearchQuery('');
    setCellFilter('all');
  };

  useEffect(() => {
    if (!hasValidSchoolId) {
      setClasses([]);
      setTeachers([]);
      setSubjects([]);
      setAcademicYears([]);
      setShifts([]);
      setLoading(false);
      toast.error('ابتدا یک مکتب معتبر انتخاب یا ایجاد کنید.');
      return;
    }

    const bootstrap = async () => {
      setLoading(true);
      try {
        const [classRes, teacherRes, subjectRes, yearRes, shiftRes] = await Promise.all([
          fetch(`/api/school-classes/school/${schoolId}`, { headers: { ...getAuthHeaders() } }),
          fetch(`/api/users/school/${schoolId}?role=teacher`, { headers: { ...getAuthHeaders() } }),
          fetch(`/api/subjects/school/${schoolId}`, { headers: { ...getAuthHeaders() } }),
          fetch(`/api/academic-years/school/${schoolId}`, { headers: { ...getAuthHeaders() } }),
          fetch(`/api/shifts/school/${schoolId}`, { headers: { ...getAuthHeaders() } })
        ]);

        const [classData, teacherData, subjectData, yearData, shiftData] = await Promise.all([
          classRes.json(),
          teacherRes.json(),
          subjectRes.json(),
          yearRes.json(),
          shiftRes.json()
        ]);

        const nextClasses = classData?.success ? classData.data || [] : [];
        const nextTeachers = teacherData?.success ? teacherData.data || [] : [];
        const nextSubjects = subjectData?.success ? subjectData.data || [] : [];
        const nextYears = (yearData?.success ? yearData.data || [] : []).filter((year) => year.status === 'active');
        const nextShifts = shiftData?.success ? shiftData.data || [] : [];

        setClasses(nextClasses);
        setTeachers(nextTeachers);
        setSubjects(nextSubjects);
        setAcademicYears(nextYears);
        setShifts(nextShifts);

        if (nextClasses.length > 0) setSelectedClass(nextClasses[0]._id);
        if (nextTeachers.length > 0) setSelectedTeacher(nextTeachers[0]._id);
        if (nextYears.length > 0) setSelectedAcademicYear(nextYears[0]._id);
        if (nextShifts.length > 0) setSelectedShift(nextShifts[0]._id);
      } catch (error) {
        console.error('Error loading timetable operations data:', error);
        toast.error('بارگذاری اطلاعات اولیه ناموفق بود.');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [schoolId, hasValidSchoolId]);

  useEffect(() => {
    const fetchTimetable = async () => {
      if (!selectedAcademicYear || !selectedShift) return;
      if (viewType === 'class' && !selectedClass) return;
      if (viewType === 'teacher' && !selectedTeacher) return;

      setLoading(true);
      try {
        const targetId = viewType === 'class' ? selectedClass : selectedTeacher;
        const endpoint = viewType === 'class' ? 'class' : 'teacher';
        const url = `/api/timetable/${endpoint}/${targetId}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
        const response = await fetch(url, { headers: { ...getAuthHeaders() } });
        const data = await response.json();

        if (!data?.success) {
          toast.error('دریافت تقسیم اوقات ناموفق بود.');
          setEntries([]);
          setTimetable({});
          return;
        }

        setEntries(data.data?.entries || []);
        setTimetable(data.data?.timetable || {});
      } catch (error) {
        console.error('Error loading timetable:', error);
        toast.error('دریافت تقسیم اوقات ناموفق بود.');
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [selectedAcademicYear, selectedShift, selectedClass, selectedTeacher, viewType]);

  const handleCellClick = (dayCode, slotNumber, entry) => {
    if (viewType !== 'class') return;
    const slot = SLOT_BY_NUMBER[slotNumber];
    if (!slot || slot.type === 'break') return;

    setEditingCell({
      dayCode,
      slotNumber,
      entry,
      form: {
        subjectId: entry?.subjectId?._id || entry?.subjectId || '',
        teacherId: entry?.teacherId?._id || entry?.teacherId || ''
      }
    });
  };

  const handleSaveCell = async () => {
    if (!editingCell) return;
    if (!editingCell.form.subjectId || !editingCell.form.teacherId) {
      toast.error('انتخاب مضمون و استاد الزامی است.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        schoolId,
        academicYearId: selectedAcademicYear,
        shiftId: selectedShift,
        classId: selectedClass,
        subjectId: editingCell.form.subjectId,
        teacherId: editingCell.form.teacherId,
        dayCode: editingCell.dayCode,
        slotNumber: editingCell.slotNumber,
        source: 'manual_edit'
      };

      const isEdit = Boolean(editingCell.entry?._id);
      const url = isEdit ? `/api/timetable/${editingCell.entry._id}` : '/api/timetable';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!data?.success) {
        toast.error(getSaveErrorMessage(data, 'ذخیره خانه ناموفق بود.'));
        return;
      }

      toast.success('خانه تقسیم اوقات ذخیره شد.');
      setEditingCell(null);

      const refreshUrl = `/api/timetable/class/${selectedClass}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
      const refreshResponse = await fetch(refreshUrl, { headers: { ...getAuthHeaders() } });
      const refreshData = await refreshResponse.json();
      if (refreshData?.success) {
        setEntries(refreshData.data?.entries || []);
        setTimetable(refreshData.data?.timetable || {});
      }
    } catch (error) {
      console.error('Error saving timetable cell:', error);
      toast.error('ذخیره خانه ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCell = async () => {
    if (!editingCell?.entry?._id) return;
    setSaving(true);

    try {
      const response = await fetch(`/api/timetable/${editingCell.entry._id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
      const data = await response.json();
      if (!data?.success) {
        toast.error(data?.message || 'حذف خانه ناموفق بود.');
        return;
      }

      toast.success('خانه حذف شد.');
      setEditingCell(null);

      const refreshUrl = `/api/timetable/class/${selectedClass}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
      const refreshResponse = await fetch(refreshUrl, { headers: { ...getAuthHeaders() } });
      const refreshData = await refreshResponse.json();
      if (refreshData?.success) {
        setEntries(refreshData.data?.entries || []);
        setTimetable(refreshData.data?.timetable || {});
      }
    } catch (error) {
      console.error('Error deleting timetable cell:', error);
      toast.error('حذف خانه ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page print-timetable print-class-timetable">
      <div className="print-header">
        <h1>تقسیم اوقات رسمی مکتب</h1>
        <h2>نمای عملیاتی زنگ‌محور</h2>
      </div>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between tt-shared-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">عملیات روزانه تقسیم اوقات</h1>
          <p className="text-gray-600">ثبت مستقیم درس روی جدول زنگی ثابت، بدون پیچیدگی.</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Badge variant="outline" className="w-fit">6 زنگ + 1 تفریح</Badge>
          <Button asChild variant="outline">
            <Link to="/timetable/shift-management">مدیریت نوبت‌ها</Link>
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            چاپ
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <CardContent className="p-4 space-y-4">
          <div className="tt-op-toolbar">
            <div className="tt-op-search-wrap">
              <label htmlFor="tt-op-search" className="tt-op-search-label">جستجو در جدول</label>
              <input
                id="tt-op-search"
                type="search"
                className="tt-op-search-input"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={executiveFocus}
                placeholder="مضمون، استاد، روز یا ساعت"
              />
            </div>
            <div className="tt-op-filter-chips" role="tablist" aria-label="فیلتر خانه‌ها">
              {CELL_FILTERS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`tt-op-chip ${cellFilter === item.key ? 'is-active' : ''}`}
                  onClick={() => setCellFilter(item.key)}
                  disabled={executiveFocus}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="tt-op-actions">
              <Button
                type="button"
                variant={executiveFocus ? 'default' : 'outline'}
                className={`tt-op-action-btn ${executiveFocus ? 'is-focus' : ''}`}
                onClick={() => setExecutiveFocus((prev) => !prev)}
              >
                Executive Focus
              </Button>
              <Button type="button" variant="outline" className="tt-op-action-btn" onClick={handleResetSmart}>
                Reset Smart
              </Button>
            </div>
            <div className="tt-op-kpis">
              <span className="tt-op-kpi">کل: {totalClassCells}</span>
              <span className="tt-op-kpi">ثبت‌شده: {filledCells}</span>
              <span className="tt-op-kpi">خالی: {emptyCells}</span>
              {executiveFocus && <span className="tt-op-kpi tt-op-kpi-focus">حالت تمرکز مدیریت: فعال</span>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm mb-1 text-gray-700">نوع نمایش</label>
              <Select value={viewType} onValueChange={setViewType}>
                <SelectTrigger><SelectValue placeholder="انتخاب نوع نمایش" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="class">نمایش صنف</SelectItem>
                  <SelectItem value="teacher">نمایش استاد</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-700">سال تعلیمی</label>
              <Select value={selectedAcademicYear} onValueChange={setSelectedAcademicYear}>
                <SelectTrigger><SelectValue placeholder="سال" /></SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year._id} value={year._id}>{year.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-700">نوبت</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={selectedShift} onValueChange={setSelectedShift}>
                    <SelectTrigger><SelectValue placeholder="نوبت" /></SelectTrigger>
                    <SelectContent>
                      {shifts.map((shift) => (
                        <SelectItem key={shift._id} value={shift._id}>{shift.name} ({shift.nameDari})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/timetable/shift-management">تنظیم</Link>
                </Button>
              </div>
            </div>

            {viewType === 'class' ? (
              <div>
                <label className="block text-sm mb-1 text-gray-700">صنف</label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger><SelectValue placeholder="صنف" /></SelectTrigger>
                  <SelectContent>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem._id} value={classItem._id}>{classItem.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <label className="block text-sm mb-1 text-gray-700">استاد</label>
                <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                  <SelectTrigger><SelectValue placeholder="استاد" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher._id} value={teacher._id}>{getTeacherLabel(teacher)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-end">
              <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                هدف: {titleTarget}
              </div>
            </div>
          </div>

          {viewType === 'class' && (
            <div className="text-xs text-gray-500">
              برای ثبت یا ویرایش، روی خانه‌های درسی کلیک کنید. خانه تفریح قفل است.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print-no-break">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5" />
            جدول هفتگی زنگی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-4 py-2 text-left">زنگ</th>
                  {WEEK_DAYS.map((day) => (
                    <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">{day.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SLOT_ROWS.map((slot) => (
                  <tr key={slot.slotNumber}>
                    <td className="border border-gray-300 px-4 py-2 bg-gray-50 font-medium">
                      <div>{slot.label}</div>
                      <div className="text-xs text-gray-500">{slot.startTime} - {slot.endTime}</div>
                    </td>
                    {WEEK_DAYS.map((day) => {
                      const entry = timetable[day.value]?.[slot.slotNumber];
                      const isBreak = slot.type === 'break';
                      const matches = doesCellMatch(day.value, slot, entry);

                      if (isBreak) {
                        return (
                          <td
                            key={`${day.value}-${slot.slotNumber}`}
                            className={`border border-gray-300 px-2 py-3 text-center bg-amber-50 text-amber-700 ${matches ? '' : 'tt-op-cell-dim'}`}
                          >
                            ---
                          </td>
                        );
                      }

                      return (
                        <td
                          key={`${day.value}-${slot.slotNumber}`}
                          className={`border border-gray-300 px-2 py-2 align-top ${viewType === 'class' ? 'cursor-pointer hover:bg-blue-50' : ''} ${matches ? '' : 'tt-op-cell-dim'}`}
                          onClick={() => {
                            if (!matches) return;
                            handleCellClick(day.value, slot.slotNumber, entry);
                          }}
                        >
                          {entry ? (
                            <div className="min-h-[66px] rounded border border-gray-200 bg-white p-2">
                              <div className="font-semibold text-sm">{getSubjectLabel(entry.subjectId)}</div>
                              {viewType === 'class' ? (
                                <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                  <Users className="w-3 h-3" />
                                  {getTeacherLabel(entry.teacherId)}
                                </div>
                              ) : (
                                <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                  <GraduationCap className="w-3 h-3" />
                                  {entry.classId?.title || '---'}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="min-h-[66px] rounded border border-dashed border-gray-200 bg-gray-50">
                              {viewType === 'class' && (
                                <div className="text-center text-xs text-gray-400 pt-6">کلیک برای ثبت</div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-4">
            {WEEK_DAYS.map((day) => (
              <div key={day.value} className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 font-semibold text-gray-800">{day.label}</div>
                <div className="divide-y divide-gray-200">
                  {SLOT_ROWS.map((slot) => {
                    const entry = timetable[day.value]?.[slot.slotNumber];
                    const isBreak = slot.type === 'break';
                    const matches = doesCellMatch(day.value, slot, entry);

                    if (isBreak) {
                      return (
                        <div key={`${day.value}-${slot.slotNumber}`} className={`px-3 py-2 bg-amber-50 text-amber-700 text-sm flex items-center justify-between ${matches ? '' : 'tt-op-cell-dim'}`}>
                          <span>{slot.label}</span>
                          <span>---</span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={`${day.value}-${slot.slotNumber}`}
                        className={`px-3 py-2 ${viewType === 'class' ? 'cursor-pointer active:bg-blue-50' : ''} ${matches ? '' : 'tt-op-cell-dim'}`}
                        onClick={() => {
                          if (!matches) return;
                          handleCellClick(day.value, slot.slotNumber, entry);
                        }}
                      >
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>{slot.label}</span>
                          <span>{slot.startTime} - {slot.endTime}</span>
                        </div>
                        {entry ? (
                          <div className="rounded border border-gray-200 bg-white p-2">
                            <div className="font-semibold text-sm">{getSubjectLabel(entry.subjectId)}</div>
                            {viewType === 'class' ? (
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                <Users className="w-3 h-3" />
                                {getTeacherLabel(entry.teacherId)}
                              </div>
                            ) : (
                              <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                                <GraduationCap className="w-3 h-3" />
                                {entry.classId?.title || '---'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded border border-dashed border-gray-200 bg-gray-50 p-2 text-xs text-gray-400 text-center">
                            {viewType === 'class' ? 'کلیک برای ثبت' : 'خالی'}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h3 className="text-lg font-semibold mb-4">ثبت خانه تقسیم اوقات</h3>
            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {WEEK_DAYS.find((day) => day.value === editingCell.dayCode)?.label} - {SLOT_BY_NUMBER[editingCell.slotNumber]?.label} ({SLOT_BY_NUMBER[editingCell.slotNumber]?.startTime} - {SLOT_BY_NUMBER[editingCell.slotNumber]?.endTime})
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700">مضمون</label>
                <Select
                  value={editingCell.form.subjectId}
                  onValueChange={(value) => setEditingCell((prev) => ({
                    ...prev,
                    form: { ...prev.form, subjectId: value }
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="انتخاب مضمون" /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((subject) => (
                      <SelectItem key={subject._id} value={subject._id}>{getSubjectLabel(subject)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700">استاد</label>
                <Select
                  value={editingCell.form.teacherId}
                  onValueChange={(value) => setEditingCell((prev) => ({
                    ...prev,
                    form: { ...prev.form, teacherId: value }
                  }))}
                >
                  <SelectTrigger><SelectValue placeholder="انتخاب استاد" /></SelectTrigger>
                  <SelectContent>
                    {teachers.map((teacher) => (
                      <SelectItem key={teacher._id} value={teacher._id}>{getTeacherLabel(teacher)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={handleSaveCell} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                ذخیره
              </Button>
              {Boolean(editingCell.entry?._id) && (
                <Button variant="destructive" onClick={handleDeleteCell} disabled={saving}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  حذف
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditingCell(null)}>
                <X className="w-4 h-4 mr-2" />
                انصراف
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card className="no-print">
        <CardContent className="p-4 text-sm text-gray-600">
          مجموع خانه‌های ثبت‌شده: {entries.length}
        </CardContent>
      </Card>

      <div className="print-footer">
        چاپ‌شده از سیستم مدیریت مکتب | نمای عملیاتی تقسیم اوقات
      </div>
    </div>
  );
}
