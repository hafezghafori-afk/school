import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { 
  Calendar, 
  Users, 
  Download, 
  Printer, 
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Grid3X3,
  List
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import './TimableViewer.css';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getStoredEffectivePermissions = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('effectivePermissions') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const DEFAULT_SCHOOL_ID = 'default-school-id';
const ALL_SHIFTS_OPTION = {
  _id: '',
  name: 'همه نوبت‌ها',
  nameDari: 'همه نوبت‌ها'
};

const uniqueById = (items = []) => {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?._id || item?.id || '').trim();
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const buildQueryString = (params = {}) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      searchParams.set(key, value);
    }
  });
  return searchParams.toString();
};

const normalizeAdminTimetablePayload = (payload) => {
  if (Array.isArray(payload)) {
    const uniqueSubjects = new Set();
    const uniqueTeachers = new Set();

    payload.forEach((entry) => {
      const subjectId = entry?.subjectId?._id || entry?.subjectId || '';
      const teacherId = entry?.teacherId?._id || entry?.teacherId || '';
      if (subjectId) uniqueSubjects.add(String(subjectId));
      if (teacherId) uniqueTeachers.add(String(teacherId));
    });

    return {
      entries: payload,
      summary: {
        totalPeriods: payload.length,
        uniqueSubjects: uniqueSubjects.size,
        uniqueTeachers: uniqueTeachers.size
      }
    };
  }

  return payload || null;
};

const getEntityId = (value) => String(value?._id || value?.id || value || '').trim();
const getSubjectName = (entry) => entry?.subjectId?.name || entry?.subject?.name || entry?.subject || '---';
const getClassTitle = (entry) => entry?.classId?.title || entry?.schoolClass?.title || entry?.classTitle || '---';
const getClassGrade = (entry) => entry?.classId?.gradeLevel || entry?.schoolClass?.gradeLevel || '';
const getClassSection = (entry) => entry?.classId?.section || entry?.schoolClass?.section || '';
const getTeacherName = (entry) => {
  const teacher = entry?.teacherId || entry?.teacher || entry?.teacherUser || {};
  return (
    teacher?.name
    || `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim()
    || entry?.teacherName
    || '---'
  );
};

const CORE_SUBJECT_KEYWORDS = [
  'language',
  'math',
  'mathematics',
  'science',
  'ریاضی',
  'ساینس',
  'علوم',
  'زبان',
  'دری',
  'پشتو'
];

const TimableViewer = () => {
  const effectivePermissions = getStoredEffectivePermissions();
  const canManageSchedule = effectivePermissions.includes('manage_schedule');
  const [timetableData, setTimetableData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [viewMode, setViewMode] = useState(canManageSchedule ? 'class' : 'admin'); // class, teacher, admin
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [displayMode, setDisplayMode] = useState('grid'); // grid, table
  const [selectedDayFilter, setSelectedDayFilter] = useState('all');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState('all');
  const [conflicts, setConflicts] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGenerationReport, setLastGenerationReport] = useState(null);
  const [lastPublishDecision, setLastPublishDecision] = useState(null);
  const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
  const [publishDecisionNote, setPublishDecisionNote] = useState('');
  const [publishApproverName, setPublishApproverName] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';
  const effectiveSchoolId = schoolId || DEFAULT_SCHOOL_ID;

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

  const periodNumbers = Array.from({length: 8}, (_, i) => i + 1);
  const filteredWeekDays = selectedDayFilter === 'all'
    ? weekDaysLocalized
    : weekDaysLocalized.filter((day) => day.value === selectedDayFilter);
  const filteredPeriodNumbers = selectedPeriodFilter === 'all'
    ? periodNumbers
    : periodNumbers.filter((period) => String(period) === String(selectedPeriodFilter));
  const entryMatchesFilters = (entry = {}) => {
    const dayCode = String(entry.dayCode || entry.dayOfWeek || '').trim().toLowerCase();
    const periodIndex = Number(entry.periodIndex || entry.slotIndex || 0);
    const dayOk = selectedDayFilter === 'all' || dayCode === selectedDayFilter;
    const periodOk = selectedPeriodFilter === 'all' || periodIndex === Number(selectedPeriodFilter);
    return dayOk && periodOk;
  };

  useEffect(() => {
    let isMounted = true;

    const loadReferenceData = async () => {
      setReferenceLoading(true);
      await Promise.all([
        fetchClasses(),
        fetchTeachers(),
        fetchAcademicYears(),
        fetchShifts()
      ]);
      if (isMounted) setReferenceLoading(false);
    };

    loadReferenceData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const hasTarget = viewMode === 'admin'
      || (viewMode === 'class' && selectedClass)
      || (viewMode === 'teacher' && selectedTeacher);

    if (selectedAcademicYear && hasTarget) {
      fetchTimetable();
      fetchConflicts();
    } else {
      setTimetableData(null);
      setConflicts([]);
      setLoading(false);
    }
  }, [viewMode, selectedClass, selectedTeacher, selectedAcademicYear, selectedShift]);

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${effectiveSchoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        const items = Array.isArray(data.data) ? data.data : [];
        setClasses(items);
        if (items.length > 0) {
          setSelectedClass((current) => current || items[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`/api/users/school/${effectiveSchoolId}?role=teacher`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        const items = Array.isArray(data.data) ? data.data : [];
        setTeachers(items);
        if (items.length > 0) {
          setSelectedTeacher((current) => current || items[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${effectiveSchoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        const items = Array.isArray(data.data) ? data.data : [];
        const activeYears = items.filter(year => year.status === 'active');
        const visibleYears = activeYears.length ? activeYears : items;
        setAcademicYears(visibleYears);
        if (visibleYears.length > 0) {
          setSelectedAcademicYear((current) => current || visibleYears[0]._id);
        }
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchShifts = async () => {
    try {
      const response = await fetch(`/api/shifts/school/${effectiveSchoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        const items = Array.isArray(data.data) ? data.data : [];
        const nextShifts = uniqueById([ALL_SHIFTS_OPTION, ...items]);
        setShifts(nextShifts);
        setSelectedShift((current) => current || (canManageSchedule && items[0]?._id ? items[0]._id : ''));
      } else {
        setShifts([ALL_SHIFTS_OPTION]);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
      setShifts([ALL_SHIFTS_OPTION]);
    }
  };

  const fetchTimetable = async () => {
    if (!selectedAcademicYear) {
      setTimetableData(null);
      setLoading(false);
      return;
    }
    if (viewMode === 'class' && !selectedClass) {
      setTimetableData(null);
      setLoading(false);
      return;
    }
    if (viewMode === 'teacher' && !selectedTeacher) {
      setTimetableData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let url = '';
      const queryString = buildQueryString({
        academicYearId: selectedAcademicYear,
        shiftId: selectedShift
      });
      
      if (viewMode === 'class' && selectedClass) {
        url = `/api/timetable/class/${selectedClass}?${queryString}`;
      } else if (viewMode === 'teacher' && selectedTeacher) {
        url = `/api/timetable/teacher/${selectedTeacher}?${queryString}`;
      } else {
        url = `/api/timetable/entries/${effectiveSchoolId}?${queryString}`;
      }

      const response = await fetch(url, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        setTimetableData(normalizeAdminTimetablePayload(data.data));
      } else {
        toast.error('دریافت تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching timetable:', error);
      toast.error('دریافت تقسیم اوقات ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const fetchConflicts = async () => {
    if (!selectedAcademicYear) return;

    try {
      const queryString = buildQueryString({
        academicYearId: selectedAcademicYear,
        shiftId: selectedShift
      });
      const response = await fetch(`/api/timetable/conflicts/${effectiveSchoolId}?${queryString}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        setConflicts(data.data.conflicts);
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error);
    }
  };

  const isCoreSubject = (subjectName = '') => {
    const normalized = String(subjectName || '').toLowerCase();
    return CORE_SUBJECT_KEYWORDS.some((keyword) => normalized.includes(keyword));
  };

  const buildPublishGate = () => {
    const classConflicts = conflicts.filter((item) => item?.type === 'class').length;
    const teacherConflicts = conflicts.filter((item) => item?.type === 'teacher').length;
    const totalConflicts = conflicts.length;
    const unscheduledAssignments = Array.isArray(lastGenerationReport?.unscheduledAssignments)
      ? lastGenerationReport.unscheduledAssignments
      : [];
    const unscheduledCore = unscheduledAssignments.filter((item) => isCoreSubject(item?.subject)).length;

    const blockReasons = [];
    const warnReasons = [];

    if (classConflicts >= 3) blockReasons.push('تداخل صنف بیشتر از حد مجاز است (>= 3).');
    else if (classConflicts >= 1) warnReasons.push('تداخل صنف نیازمند تایید مدیریتی است.');

    if (teacherConflicts >= 3) blockReasons.push('تداخل استاد بیشتر از حد مجاز است (>= 3).');
    else if (teacherConflicts >= 1) warnReasons.push('تداخل استاد نیازمند تایید مدیریتی است.');

    if (totalConflicts >= 4) blockReasons.push('مجموع تداخل‌ها بیشتر از حد مجاز است (>= 4).');
    else if (totalConflicts >= 1) warnReasons.push('مجموع تداخل‌ها در محدوده هشدار است.');

    if (unscheduledCore >= 2) blockReasons.push('تخصیص‌نیافته‌های مضامین اصلی بیشتر از حد مجاز است (>= 2).');
    else if (unscheduledCore >= 1) warnReasons.push('حداقل یک مضمون اصلی تخصیص‌نیافته است.');

    const status = blockReasons.length > 0 ? 'block' : warnReasons.length > 0 ? 'warn' : 'accept';
    const reasons = status === 'block' ? blockReasons : warnReasons;

    return {
      status,
      reasons,
      metrics: {
        classConflicts,
        teacherConflicts,
        totalConflicts,
        unscheduledCore,
        unscheduledTotal: unscheduledAssignments.length,
        generatedEntries: Number(lastGenerationReport?.generatedEntriesCount || 0)
      }
    };
  };

  const handleGenerateTimetable = async () => {
    if (!canManageSchedule) {
      toast.error('برای ساخت تقسیم اوقات، مجوز مدیریت تقسیم اوقات لازم است.');
      return;
    }
    if (!selectedAcademicYear || !selectedShift) {
      toast.error('لطفاً سال تعلیمی و نوبت را انتخاب کنید.');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          schoolId,
          academicYearId: selectedAcademicYear,
          shiftId: selectedShift
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setLastGenerationReport({
          generatedEntriesCount: Array.isArray(data?.data?.generatedEntries) ? data.data.generatedEntries.length : 0,
          conflicts: Array.isArray(data?.data?.conflicts) ? data.data.conflicts : [],
          unscheduledAssignments: Array.isArray(data?.data?.unscheduledAssignments) ? data.data.unscheduledAssignments : [],
          summary: data?.data?.summary || {},
          generatedAt: new Date().toISOString()
        });
        setLastPublishDecision(null);

        toast.success(`${data.data.generatedEntries.length} خانه تقسیم اوقات ساخته شد.`);
        
        if (data.data.conflicts.length > 0) {
          toast.warning(`${data.data.conflicts.length} تداخل پیدا شد.`);
        }
        
        if (data.data.unscheduledAssignments.length > 0) {
          toast.warning(`${data.data.unscheduledAssignments.length} تخصیص زمان‌بندی نشد.`);
        }
        
        fetchTimetable();
        fetchConflicts();
      } else {
        toast.error(data.message || 'ساخت تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error generating timetable:', error);
      toast.error('ساخت تقسیم اوقات ناموفق بود.');
    } finally {
      setIsGenerating(false);
    }
  };

  const openPublishDialog = () => {
    if (!canManageSchedule) {
      toast.error('برای نشر تقسیم اوقات، مجوز مدیریت تقسیم اوقات لازم است.');
      return;
    }
    if (!selectedAcademicYear || !selectedShift) {
      toast.error('لطفاً سال تعلیمی و نوبت را انتخاب کنید.');
      return;
    }

    const publishGate = buildPublishGate();
    if (publishGate.status === 'block') {
      toast.error('نشر مسدود است. ابتدا مشکلات گیت نشر را رفع کنید.');
      return;
    }

    setPublishDecisionNote('');
    setPublishApproverName('');
    setIsPublishDialogOpen(true);
  };

  const handlePublishTimetable = async () => {
    if (!canManageSchedule) {
      toast.error('برای نشر تقسیم اوقات، مجوز مدیریت تقسیم اوقات لازم است.');
      return;
    }
    if (!selectedAcademicYear || !selectedShift) {
      toast.error('لطفاً سال تعلیمی و نوبت را انتخاب کنید.');
      return;
    }

    const publishGate = buildPublishGate();
    if (publishGate.status === 'block') {
      toast.error('نشر مسدود است. ابتدا مشکلات گیت نشر را رفع کنید.');
      setIsPublishDialogOpen(false);
      return;
    }

    const decisionLabel = publishGate.status === 'warn' ? 'Publish with approval' : 'Publish';
    const normalizedDecisionNote = publishDecisionNote.trim();
    const normalizedApproverName = publishApproverName.trim();

    if (!normalizedDecisionNote) {
      toast.error('ثبت دلیل تصمیم برای نشر الزامی است.');
      return;
    }

    if (publishGate.status === 'warn' && !normalizedApproverName) {
      toast.error('در حالت هشدار، ثبت نام تاییدکننده الزامی است.');
      return;
    }

    setIsPublishing(true);

    try {
      const response = await fetch(`/api/timetable/publish/${schoolId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          academicYearId: selectedAcademicYear,
          shiftId: selectedShift,
          decisionNote: normalizedDecisionNote,
          approverName: normalizedApproverName,
          publishDecision: decisionLabel,
          gateStatus: publishGate.status,
          gateMetrics: publishGate.metrics
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setLastPublishDecision({
          decision: decisionLabel,
          reason: normalizedDecisionNote,
          approverName: normalizedApproverName,
          gateStatus: publishGate.status,
          gateMetrics: publishGate.metrics,
          createdAt: new Date().toISOString()
        });
        setIsPublishDialogOpen(false);
        toast.success(`${data.data.publishedCount} خانه تقسیم اوقات نشر شد.`);
        fetchTimetable();
      } else {
        toast.error(data.message || 'نشر تقسیم اوقات ناموفق بود.');
      }
    } catch (error) {
      console.error('Error publishing timetable:', error);
      toast.error('نشر تقسیم اوقات ناموفق بود.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    toast.success('برای ساخت PDF در پنجره چاپ، گزینه Save as PDF را انتخاب کنید.');
    window.setTimeout(() => window.print(), 80);
  };

  const teacherLabel = (teacher) => `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim() || 'استاد';
  const publishGate = buildPublishGate();
  const gateTone = publishGate.status === 'block'
    ? 'border-red-200 bg-red-50 text-red-800'
    : publishGate.status === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  const gateLabel = publishGate.status === 'block'
    ? 'نشر مسدود'
    : publishGate.status === 'warn'
      ? 'نشر با تایید'
      : 'قابل نشر';
  const viewModeOptions = [
    { value: 'class', label: 'براساس صنف' },
    { value: 'teacher', label: 'براساس استاد' },
    { value: 'admin', label: 'نمای مدیریت' }
  ];
  const coreFeatures = ['نمایش', 'بررسی', 'ساخت', 'نشر'];

  const renderClassTimetable = () => {
    if (!timetableData?.timetable) return null;

    return (
      <div className="tv-table-scroll">
        <table className="w-full border-collapse border border-gray-300 tv-schedule-table">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left">ساعت</th>
              {filteredWeekDays.map(day => (
                <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">
                  <div>{day.labelDari}</div>
                  <div className="text-xs text-gray-500">{day.short}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPeriodNumbers.map(period => (
              <tr key={period}>
                <td className="border border-gray-300 px-4 py-2 font-medium bg-gray-50">
                  ساعت {period}
                </td>
                {filteredWeekDays.map(day => {
                  const entry = timetableData.timetable[day.value]?.[period];
                  return (
                    <td key={`${day.value}-${period}`} className="border border-gray-300 px-2 py-2 align-top tv-slot-cell">
                      {entry ? (
                        <div className="min-h-[60px] p-1 tv-entry-card">
                          <div className="font-semibold text-sm">{getSubjectName(entry)}</div>
                          <div className="text-xs text-gray-600">{getTeacherName(entry)}</div>
                          <div className="text-xs text-gray-500">{entry.startTime} - {entry.endTime}</div>
                          {entry.subjectId?.category && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {entry.subjectId.category}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <div className="min-h-[60px] bg-gray-50 tv-empty-slot"></div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTeacherTimetable = () => {
    if (!timetableData?.timetable) return null;

    return (
      <div className="tv-table-scroll">
        <table className="w-full border-collapse border border-gray-300 tv-schedule-table">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left">ساعت</th>
              {filteredWeekDays.map(day => (
                <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">
                  <div>{day.labelDari}</div>
                  <div className="text-xs text-gray-500">{day.short}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredPeriodNumbers.map(period => (
              <tr key={period}>
                <td className="border border-gray-300 px-4 py-2 font-medium bg-gray-50">
                  ساعت {period}
                </td>
                {filteredWeekDays.map(day => {
                  const entry = timetableData.timetable[day.value]?.[period];
                  return (
                    <td key={`${day.value}-${period}`} className="border border-gray-300 px-2 py-2 align-top tv-slot-cell">
                      {entry ? (
                        <div className="min-h-[60px] p-1 tv-entry-card">
                          <div className="font-semibold text-sm">{getClassTitle(entry)}</div>
                          <div className="text-xs text-gray-600">{getSubjectName(entry)}</div>
                          <div className="text-xs text-gray-500">{entry.startTime} - {entry.endTime}</div>
                          <Badge variant="outline" className="text-xs mt-1">
                            پایه {getClassGrade(entry) || '---'}
                          </Badge>
                        </div>
                      ) : (
                        <div className="min-h-[60px] bg-gray-50 tv-empty-slot"></div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAdminView = () => {
    if (!timetableData?.entries) return null;

    // Group entries by class
    const entriesByClass = {};
    timetableData.entries.filter(entryMatchesFilters).forEach(entry => {
      const classId = getEntityId(entry.classId) || entry.classTitle || 'unknown-class';
      if (!entriesByClass[classId]) {
        entriesByClass[classId] = {
          class: entry.classId,
          entries: []
        };
      }
      entriesByClass[classId].entries.push(entry);
    });

    return (
      <div className="space-y-6">
        {Object.values(entriesByClass).map(({ class: classInfo, entries }) => (
          <Card key={getEntityId(classInfo) || entries[0]?._id || entries[0]?.id || 'class-card'} className="tv-class-table-card">
            <CardHeader className="tv-class-table-header">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                {classInfo?.title || entries[0]?.classTitle || 'صنف'}
                <Badge variant="outline">
                  پایه {classInfo?.gradeLevel || '---'} - {classInfo?.section || '---'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="tv-table-scroll">
                <table className="w-full border-collapse border border-gray-300 tv-schedule-table">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-2 text-left">ساعت</th>
                      {filteredWeekDays.map(day => (
                        <th key={day.value} className="border border-gray-300 px-4 py-2 text-center">
                          <div>{day.labelDari}</div>
                          <div className="text-xs text-gray-500">{day.short}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeriodNumbers.map(period => (
                      <tr key={period}>
                        <td className="border border-gray-300 px-4 py-2 font-medium bg-gray-50">
                          ساعت {period}
                        </td>
                        {filteredWeekDays.map(day => {
                          const entry = entries.find(e => e.dayCode === day.value && e.periodIndex === period);
                          return (
                            <td key={`${day.value}-${period}`} className="border border-gray-300 px-2 py-2 align-top tv-slot-cell">
                              {entry ? (
                                <div className="min-h-[60px] p-1 tv-entry-card">
                                  <div className="font-semibold text-sm">{getSubjectName(entry)}</div>
                                  <div className="text-xs text-gray-600">{getTeacherName(entry)}</div>
                                  <div className="text-xs text-gray-500">{entry.startTime} - {entry.endTime}</div>
                                  {entry.subjectId?.category && (
                                    <Badge variant="outline" className="text-xs mt-1">
                                      {entry.subjectId.category}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <div className="min-h-[60px] bg-gray-50 tv-empty-slot"></div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  if ((referenceLoading && !academicYears.length && !classes.length && !teachers.length && !shifts.length) || loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  const timetableEntriesCount = timetableData?.entries?.length
    || Object.values(timetableData?.timetable || {}).reduce((total, dayMap) => {
      if (!dayMap) return total;
      return total + Object.values(dayMap).filter(Boolean).length;
    }, 0);
  const visibleEntriesCount = timetableData?.entries
    ? timetableData.entries.filter(entryMatchesFilters).length
    : filteredWeekDays.reduce((total, day) => {
      const dayMap = timetableData?.timetable?.[day.value] || {};
      return total + filteredPeriodNumbers.filter((period) => Boolean(dayMap[period])).length;
    }, 0);
  const hasVisibleTimetable = visibleEntriesCount > 0;
  const targetLabel = viewMode === 'class'
    ? (classes.find((item) => item._id === selectedClass)?.title || 'صنف')
    : viewMode === 'teacher'
      ? teacherLabel(teachers.find((item) => item._id === selectedTeacher))
      : 'همه صنف‌ها';

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page tv-page">
      <div className="tv-hero tt-shared-header">
        <div className="tv-hero-main">
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">نمایش تقسیم اوقات</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">نمایش، بررسی، ساخت و نشر تقسیم اوقات با تمرکز روی سرعت عملیات روزانه.</p>
          <div className="tv-hero-meta">
            <Badge variant="outline">هدف: {targetLabel}</Badge>
            <Badge variant="outline">حالت: {viewMode === 'class' ? 'صنف' : viewMode === 'teacher' ? 'استاد' : 'مدیریت'}</Badge>
          </div>
        </div>

        <div className="tv-hero-actions">
          <div className="tv-display-toggle" role="tablist" aria-label="حالت نمایش جدول">
            <button
              type="button"
              className={`tv-display-chip ${displayMode === 'table' ? 'is-active' : ''}`}
              onClick={() => setDisplayMode('table')}
            >
              <List className="w-4 h-4" />
              نمای جدولی
            </button>
            <button
              type="button"
              className={`tv-display-chip ${displayMode === 'grid' ? 'is-active' : ''}`}
              onClick={() => setDisplayMode('grid')}
            >
              <Grid3X3 className="w-4 h-4" />
              نمای خانه‌ای
            </button>
          </div>
          <Button
            variant="outline"
            onClick={handlePrint}
            className="tv-action-btn tv-utility-btn"
          >
            <Printer className="w-4 h-4 tv-btn-icon" />
            چاپ
          </Button>
          <Button
            variant="outline"
            onClick={handleExportPDF}
            className="tv-action-btn tv-utility-btn"
          >
            <Download className="w-4 h-4 tv-btn-icon" />
            برون‌برد پی‌دی‌اف
          </Button>
          {false && canManageSchedule && (
            <>
              <Button
                onClick={handleGenerateTimetable}
                disabled={isGenerating}
                className="tv-action-btn"
              >
                <RefreshCw className={`w-4 h-4 tv-btn-icon ${isGenerating ? 'animate-spin' : ''}`} />
                {isGenerating ? 'در حال ساخت...' : 'ساخت'}
              </Button>
              <Button
                onClick={openPublishDialog}
                disabled={isPublishing}
                className="tv-action-btn tv-publish-btn"
              >
                <CheckCircle className="w-4 h-4 tv-btn-icon" />
                {isPublishing ? 'در حال نشر...' : 'نشر'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="tv-feature-strip">
        <div className="tv-feature-list" aria-label="ویژگی‌های کلیدی سیستم">
          {coreFeatures.map((feature) => (
            <span key={feature} className="tv-feature-pill">{feature}</span>
          ))}
          <span className="tv-feature-caption">تمرکز: سرعت عملیات روزانه</span>
        </div>
        <div className="tv-smart-tip">
          <span className="tv-smart-tip-title">پیشنهاد هوشمند</span>
          <p>برای خروجی دقیق‌تر: اول «بررسی تداخل»، بعد «ساخت»، و در پایان «نشر» را اجرا کنید.</p>
          <Button
            variant="outline"
            className="tv-tip-btn"
            onClick={() => {
              setViewMode('admin');
              setDisplayMode('table');
            }}
          >
            رفتن به حالت بررسی مدیریتی
          </Button>
        </div>
      </div>

      <div className="tv-kpis">
        <div className="tv-kpi-card">
          <span className="tv-kpi-value">{timetableEntriesCount}</span>
          <span className="tv-kpi-label">خانه ثبت‌شده</span>
        </div>
        <div className="tv-kpi-card">
          <span className="tv-kpi-value">{conflicts.length}</span>
          <span className="tv-kpi-label">تداخل فعال</span>
        </div>
        <div className="tv-kpi-card">
          <span className="tv-kpi-value">{classes.length}</span>
          <span className="tv-kpi-label">صنف موجود</span>
        </div>
      </div>

      {false && canManageSchedule && (
      <Card className={`border ${gateTone}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            گیت نشر تقسیم اوقات
            <Badge variant="outline">{gateLabel}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div>تداخل صنف: <strong>{publishGate.metrics.classConflicts}</strong></div>
            <div>تداخل استاد: <strong>{publishGate.metrics.teacherConflicts}</strong></div>
            <div>مجموع تداخل: <strong>{publishGate.metrics.totalConflicts}</strong></div>
            <div>اصلی تخصیص‌نیافته: <strong>{publishGate.metrics.unscheduledCore}</strong></div>
            <div>کل تخصیص‌نیافته: <strong>{publishGate.metrics.unscheduledTotal}</strong></div>
            <div>خانه تولیدشده: <strong>{publishGate.metrics.generatedEntries}</strong></div>
          </div>

          {publishGate.reasons.length > 0 && (
            <div className="text-sm">
              {publishGate.reasons.map((reason, index) => (
                <p key={`${reason}-${index}`}>- {reason}</p>
              ))}
            </div>
          )}

          {lastPublishDecision && (
            <div className="text-sm border-t pt-3">
              <p><strong>آخرین تصمیم:</strong> {lastPublishDecision.decision}</p>
              <p><strong>دلیل ثبت‌شده:</strong> {lastPublishDecision.reason}</p>
              {lastPublishDecision.approverName && (
                <p><strong>تاییدکننده:</strong> {lastPublishDecision.approverName}</p>
              )}
              <p><strong>زمان:</strong> {new Date(lastPublishDecision.createdAt).toLocaleString()}</p>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {false && canManageSchedule && isPublishDialogOpen && (
        <Card className="border-slate-300 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>تایید نهایی نشر</span>
              <Badge variant="outline">
                {publishGate.status === 'warn' ? 'Publish with approval' : 'Publish'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {publishGate.status === 'warn' && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                حالت هشدار فعال است؛ نشر فقط با ثبت تاییدکننده انجام می‌شود.
              </div>
            )}

            <div>
              <label className="tv-field-label">دلیل تصمیم نشر</label>
              <textarea
                className="tv-native-select min-h-[96px]"
                value={publishDecisionNote}
                onChange={(event) => setPublishDecisionNote(event.target.value)}
                placeholder="دلیل تصمیم نشر را ثبت کنید..."
              />
            </div>

            <div>
              <label className="tv-field-label">نام تاییدکننده (در حالت هشدار الزامی)</label>
              <input
                className="tv-native-select"
                type="text"
                value={publishApproverName}
                onChange={(event) => setPublishApproverName(event.target.value)}
                placeholder="نام مدیر/مسئول تایید"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsPublishDialogOpen(false)}
                disabled={isPublishing}
              >
                انصراف
              </Button>
              <Button
                onClick={handlePublishTimetable}
                disabled={isPublishing}
              >
                {isPublishing ? 'در حال نشر...' : 'تایید و نشر'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card className="tv-controls-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 tv-control-grid">
            <div className="tv-field">
              <label className="tv-field-label">نوع نمایش</label>
              <div className="tv-mode-switch" role="tablist" aria-label="نوع نمایش">
                {viewModeOptions.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={`tv-mode-chip ${viewMode === mode.value ? 'is-active' : ''}`}
                    onClick={() => setViewMode(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="tv-field">
              <label className="tv-field-label">سال تعلیمی</label>
              <select
                className="tv-native-select"
                value={selectedAcademicYear}
                onChange={(event) => setSelectedAcademicYear(event.target.value)}
              >
                {academicYears.map((year) => (
                  <option key={year._id} value={year._id}>
                    {year.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="tv-field">
              <label className="tv-field-label">نوبت</label>
              <select
                className="tv-native-select"
                value={selectedShift}
                onChange={(event) => setSelectedShift(event.target.value)}
              >
                {shifts.map((shift) => (
                  <option key={shift._id} value={shift._id}>
                    {shift.name} ({shift.nameDari})
                  </option>
                ))}
              </select>
            </div>

            <div className="tv-field">
              <label className="tv-field-label">
                {viewMode === 'class' ? 'صنف' : viewMode === 'teacher' ? 'استاد' : 'فیلتر'}
              </label>
              {viewMode === 'class' && (
                <select
                  className="tv-native-select"
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                >
                  {classes.map((classItem) => (
                    <option key={classItem._id} value={classItem._id}>
                      {classItem.title}
                    </option>
                  ))}
                </select>
              )}
              {viewMode === 'teacher' && (
                <select
                  className="tv-native-select"
                  value={selectedTeacher}
                  onChange={(event) => setSelectedTeacher(event.target.value)}
                >
                  {teachers.map((teacher) => (
                    <option key={teacher._id} value={teacher._id}>
                      {teacherLabel(teacher)}
                    </option>
                  ))}
                </select>
              )}
              {false && viewMode === 'admin' && canManageSchedule && (
                <Button
                  onClick={handleGenerateTimetable}
                  disabled={isGenerating}
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 tv-btn-icon ${isGenerating ? 'animate-spin' : ''}`} />
                  {isGenerating ? 'در حال ساخت...' : 'ساخت'}
                </Button>
              )}
              {viewMode === 'admin' && (
                <div className="tv-readonly-target">همه صنف‌ها</div>
              )}
            </div>

            <div className="tv-field">
              <label className="tv-field-label">روز هفته</label>
              <select
                className="tv-native-select"
                value={selectedDayFilter}
                onChange={(event) => setSelectedDayFilter(event.target.value)}
              >
                <option value="all">همه روزها</option>
                {weekDaysLocalized.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.labelDari}
                  </option>
                ))}
              </select>
            </div>

            <div className="tv-field">
              <label className="tv-field-label">زنگ / ساعت</label>
              <select
                className="tv-native-select"
                value={selectedPeriodFilter}
                onChange={(event) => setSelectedPeriodFilter(event.target.value)}
              >
                <option value="all">همه زنگ‌ها</option>
                {periodNumbers.map((period) => (
                  <option key={period} value={period}>
                    زنگ {period}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts Alert */}
      {false && conflicts.length > 0 && (
        <Card className="border-red-200 bg-red-50 tv-conflict-alert">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-800">تداخل شناسایی شد</h3>
                <p className="text-red-700">
                  {conflicts.length} تداخل پیدا شد. لطفاً پیش از نشر آن‌ها را حل کنید.
                </p>
                <div className="mt-2">
                  <Button variant="outline" size="sm" className="text-red-600 border-red-300">
                    مشاهده تداخل‌ها
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timetable Display */}
      <Card className="tv-table-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {viewMode === 'class' && selectedClass && classes.find(c => c._id === selectedClass)?.title}
            {viewMode === 'teacher' && selectedTeacher && teacherLabel(teachers.find(t => t._id === selectedTeacher))}
            {viewMode === 'admin' && 'همه صنف‌ها'}
            <Badge variant="outline">
              {selectedAcademicYear && academicYears.find(y => y._id === selectedAcademicYear)?.title}
            </Badge>
            <Badge variant="outline">
              {selectedShift ? shifts.find(s => s._id === selectedShift)?.name : ALL_SHIFTS_OPTION.name}
            </Badge>
            <Badge variant="outline">
              نمایش {visibleEntriesCount} از {timetableEntriesCount}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasVisibleTimetable ? (
            <div className="print:print-timetable">
              {viewMode === 'class' && renderClassTimetable()}
              {viewMode === 'teacher' && renderTeacherTimetable()}
              {viewMode === 'admin' && renderAdminView()}
            </div>
          ) : (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">هیچ تقسیم اوقاتی پیدا نشد</h3>
              <p className="text-gray-600 mb-4">
                {viewMode === 'admin' 
                  ? 'برای شروع، تقسیم اوقات را بسازید.'
                  : 'برای مشاهده تقسیم اوقات، صنف یا استاد را انتخاب کنید.'}
              </p>
              {false && viewMode === 'admin' && canManageSchedule && (
                <Button onClick={handleGenerateTimetable} disabled={isGenerating}>
                  <RefreshCw className={`w-4 h-4 tv-btn-icon ${isGenerating ? 'animate-spin' : ''}`} />
                  {isGenerating ? 'در حال ساخت...' : 'ساخت تقسیم اوقات'}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      {false && timetableData?.summary && (
        <Card>
          <CardHeader>
            <CardTitle>خلاصه آماری</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{timetableData.summary.totalPeriods}</div>
                <div className="text-sm text-gray-600">کل ساعت‌ها</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{timetableData.summary.uniqueSubjects}</div>
                <div className="text-sm text-gray-600">مضامین یکتا</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{timetableData.summary.uniqueTeachers}</div>
                <div className="text-sm text-gray-600">استادان یکتا</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{conflicts.length}</div>
                <div className="text-sm text-gray-600">تداخل‌ها</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TimableViewer;
