import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, Users, Clock, AlertCircle, UserCheck, Calendar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import './TeacherAssignmentManagement.css';

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
  return candidates.map(normalizeSchoolId).find(isValidObjectId) || 'default-school-id';
};

const TeacherAssignmentManagement = () => {
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [singleWizardStep, setSingleWizardStep] = useState(1);
  const [selectedClass, setSelectedClass] = useState(null);
  const [bulkAssignments, setBulkAssignments] = useState([]);
  const [bulkSubjects, setBulkSubjects] = useState([]);
  const [bulkSubjectsLoading, setBulkSubjectsLoading] = useState(false);
  const [bulkSubjectsSource, setBulkSubjectsSource] = useState('curriculum');
  const [singleSubjects, setSingleSubjects] = useState([]);
  const [singleSubjectsLoading, setSingleSubjectsLoading] = useState(false);
  const [singleSubjectsSource, setSingleSubjectsSource] = useState('curriculum');
  const [subjectVisibleCounts, setSubjectVisibleCounts] = useState({});
  const [workloadData, setWorkloadData] = useState(null);
  const [workloadYearId, setWorkloadYearId] = useState('');
  const [filters, setFilters] = useState({
    academicYearId: 'all',
    teacherUserId: 'all',
    subjectId: 'all'
  });
  
  const [formData, setFormData] = useState({
    academicYearId: '',
    classId: '',
    subjectId: '',
    teacherUserId: '',
    weeklyPeriods: 1,
    priority: 1,
    isMainTeacher: false,
    consecutivePeriods: false,
    preferredDays: [],
    preferredPeriods: [],
    avoidDays: [],
    avoidPeriods: [],
    maxPeriodsPerDay: 6,
    maxPeriodsPerWeek: 24,
    specialRequirements: {
      needsLab: false,
      needsComputer: false,
      needsPlayground: false,
      needsLibrary: false
    },
    assignmentType: 'permanent'
  });

  const schoolId = resolveSchoolId();

  const weekDays = [
    { value: 'saturday', label: 'Saturday', labelDari: 'شنبه' },
    { value: 'sunday', label: 'Sunday', labelDari: 'یکشنبه' },
    { value: 'monday', label: 'Monday', labelDari: 'دوشنبه' },
    { value: 'tuesday', label: 'Tuesday', labelDari: 'سه‌شنبه' },
    { value: 'wednesday', label: 'Wednesday', labelDari: 'چهارشنبه' },
    { value: 'thursday', label: 'Thursday', labelDari: 'پنجشنبه' },
    { value: 'friday', label: 'Friday', labelDari: 'جمعه' }
  ];

  useEffect(() => {
    fetchAssignments();
    fetchTeachers();
    fetchClasses();
    fetchSubjects();
    fetchAcademicYears();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await fetch(`/api/teacher-assignments/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        setAssignments(data.data);
      } else {
        toast.error('دریافت تخصیص‌های استاد ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching teacher assignments:', error);
      toast.error('دریافت تخصیص‌های استاد ناموفق بود.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`/api/users/school/${schoolId}?role=teacher`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        setTeachers(data.data);
      }
    } catch (error) {
      console.error('Error fetching teachers:', error);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        let classItems = Array.isArray(data.data) ? data.data : [];
        if (!classItems.length && schoolId !== 'default-school-id') {
          const fallbackResponse = await fetch('/api/school-classes/school/default-school-id', { headers: { ...getAuthHeaders() } });
          const fallbackData = await fallbackResponse.json();
          if (fallbackData.success && Array.isArray(fallbackData.data) && fallbackData.data.length) {
            classItems = fallbackData.data;
          }
        }
        setClasses(classItems);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`/api/subjects/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        let subjectItems = Array.isArray(data.data) ? data.data : [];
        if (!subjectItems.length && schoolId !== 'default-school-id') {
          const fallbackResponse = await fetch('/api/subjects/school/default-school-id', { headers: { ...getAuthHeaders() } });
          const fallbackData = await fallbackResponse.json();
          if (fallbackData.success && Array.isArray(fallbackData.data) && fallbackData.data.length) {
            subjectItems = fallbackData.data;
          }
        }
        setSubjects(subjectItems);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchWorkloadData = async (yearOverride = '') => {
    try {
      const filteredYearId = filters.academicYearId !== 'all' ? filters.academicYearId : '';
      const activeYearId = academicYears.find((year) => year.status === 'active')?._id || academicYears[0]?._id || '';
      const fallbackYearId = yearOverride || filteredYearId || formData.academicYearId || workloadYearId || activeYearId;
      if (!fallbackYearId) {
        toast.error('سال تعلیمی فعال برای بررسی بار درسی پیدا نشد.');
        return;
      }

      const response = await fetch(`/api/teacher-assignments/workload/${schoolId}?academicYearId=${fallbackYearId}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();
      
      if (data.success) {
        setWorkloadYearId(String(fallbackYearId));
        setWorkloadData(data.data);
        if (!data.data?.teachers?.length) {
          toast('برای این سال تعلیمی هنوز بار درسی ثبت نشده است.', { icon: 'ℹ️' });
        }
      } else {
        toast.error(data.message || 'دریافت بار درسی ناموفق بود.');
      }
    } catch (error) {
      console.error('Error fetching workload data:', error);
      toast.error('دریافت بار درسی ناموفق بود.');
    }
  };

  useEffect(() => {
    if (!workloadYearId && academicYears.length > 0) {
      const activeYear = academicYears.find((year) => year.status === 'active') || academicYears[0];
      setWorkloadYearId(String(activeYear._id));
    }
  }, [academicYears, workloadYearId]);

  const filteredAssignments = useMemo(() => {
    const getId = (value) => String(value?._id || value?.id || value || '').trim();
    return assignments
      .filter((assignment) => (
        (filters.academicYearId === 'all' || getId(assignment.academicYearId) === filters.academicYearId)
        && (filters.teacherUserId === 'all' || getId(assignment.teacherUserId) === filters.teacherUserId)
        && (filters.subjectId === 'all' || getId(assignment.subjectId) === filters.subjectId)
      ))
      .sort((left, right) => {
        const leftYear = String(left.academicYearId?.title || left.academicYearId?.name || '');
        const rightYear = String(right.academicYearId?.title || right.academicYearId?.name || '');
        if (leftYear !== rightYear) return rightYear.localeCompare(leftYear, 'fa');
        const leftTeacher = String(left.teacherUserId?.name || '');
        const rightTeacher = String(right.teacherUserId?.name || '');
        return leftTeacher.localeCompare(rightTeacher, 'fa');
      });
  }, [assignments, filters]);

  const hasActiveFilters = Object.values(filters).some((value) => value !== 'all');

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    if (field === 'academicYearId') {
      setWorkloadData(null);
      setWorkloadYearId(value === 'all' ? '' : value);
    }
  };

  const handleWorkloadToggle = () => {
    if (workloadData) {
      setWorkloadData(null);
      return;
    }
    fetchWorkloadData(filters.academicYearId === 'all' ? '' : filters.academicYearId);
  };

  const openNewAssignmentForm = () => {
    const selectedYearId = filters.academicYearId !== 'all'
      ? filters.academicYearId
      : String(academicYears.find((year) => year.status === 'active')?._id || academicYears[0]?._id || '');
    setBulkMode(false);
    setEditingAssignment(null);
    setSingleWizardStep(1);
    resetForm({ academicYearId: selectedYearId });
    setShowForm(true);
  };

  const toggleBulkMode = () => {
    const nextBulkMode = !bulkMode;
    setBulkMode(nextBulkMode);
    setShowForm(false);
    setEditingAssignment(null);
    setSingleWizardStep(1);
    if (nextBulkMode) {
      const selectedYearId = filters.academicYearId !== 'all'
        ? filters.academicYearId
        : String(academicYears.find((year) => year.status === 'active')?._id || academicYears[0]?._id || '');
      resetForm({ academicYearId: selectedYearId });
    }
  };

  const validateSingleStep = (step) => {
    if (step === 1 && (!formData.academicYearId || !formData.classId || !formData.subjectId || !formData.teacherUserId)) {
      toast.error('لطفاً سال تعلیمی، صنف، مضمون و استاد را انتخاب کنید.');
      return false;
    }
    if (step === 2 && (
      Number(formData.weeklyPeriods) < 1
      || Number(formData.maxPeriodsPerDay) < 1
      || Number(formData.maxPeriodsPerWeek) < Number(formData.weeklyPeriods)
    )) {
      toast.error('ساعات و ظرفیت استاد را به‌صورت درست وارد کنید.');
      return false;
    }
    return true;
  };

  const advanceSingleWizard = () => {
    if (!validateSingleStep(singleWizardStep)) return;
    setSingleWizardStep((current) => Math.min(3, current + 1));
  };

  const selectSingleWizardStep = (targetStep) => {
    if (targetStep > 1 && !validateSingleStep(1)) return;
    if (targetStep > 2 && !validateSingleStep(2)) return;
    setSingleWizardStep(targetStep);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateSingleStep(1) || !validateSingleStep(2)) return;
    
    try {
      const url = editingAssignment 
        ? `/api/teacher-assignments/${editingAssignment._id}`
        : `/api/teacher-assignments/school/${schoolId}`;
      
      const method = editingAssignment ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(editingAssignment ? 'تخصیص استاد به‌روزرسانی شد.' : 'تخصیص استاد ایجاد شد.');
        setShowForm(false);
        setEditingAssignment(null);
        resetForm();
        fetchAssignments();
      } else {
        toast.error(data.message || 'ذخیره تخصیص استاد ناموفق بود.');
      }
    } catch (error) {
      console.error('Error saving assignment:', error);
      toast.error('ذخیره تخصیص استاد ناموفق بود.');
    }
  };

  const handleEdit = (assignment) => {
    const getId = (value) => String(value?._id || value?.id || value || '');
    setBulkMode(false);
    setEditingAssignment(assignment);
    setFormData({
      academicYearId: getId(assignment.academicYearId),
      classId: getId(assignment.classId),
      subjectId: getId(assignment.subjectId),
      teacherUserId: getId(assignment.teacherUserId),
      weeklyPeriods: assignment.weeklyPeriods,
      priority: assignment.priority,
      isMainTeacher: assignment.isMainTeacher,
      consecutivePeriods: assignment.consecutivePeriods,
      preferredDays: assignment.preferredDays || [],
      preferredPeriods: assignment.preferredPeriods || [],
      avoidDays: assignment.avoidDays || [],
      avoidPeriods: assignment.avoidPeriods || [],
      maxPeriodsPerDay: assignment.maxPeriodsPerDay,
      maxPeriodsPerWeek: assignment.maxPeriodsPerWeek,
      specialRequirements: assignment.specialRequirements || {
        needsLab: false,
        needsComputer: false,
        needsPlayground: false,
        needsLibrary: false
      },
      assignmentType: assignment.assignmentType
    });
    setShowForm(true);
    setSingleWizardStep(1);
  };

  const handleSingleYearChange = (academicYearId) => {
    setFormData((current) => {
      const selectedClassItem = classes.find((item) => String(item._id) === String(current.classId));
      const classYearId = String(selectedClassItem?.academicYearId?._id || selectedClassItem?.academicYearId || '').trim();
      const classMatchesYear = !classYearId || classYearId === String(academicYearId);

      return {
        ...current,
        academicYearId,
        classId: classMatchesYear ? current.classId : '',
        subjectId: ''
      };
    });
  };

  const handleSingleClassChange = (classId) => {
    setFormData((current) => ({
      ...current,
      classId,
      subjectId: ''
    }));
  };

  const handleDelete = async (assignmentId) => {
    if (!confirm('آیا مطمئن هستید که این تخصیص ختم شود؟ سابقه آن در سیستم نگهداری می‌شود.')) return;
    
    try {
      const response = await fetch(`/api/teacher-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('تخصیص استاد ختم شد.');
        fetchAssignments();
      } else {
        toast.error(data.message || 'ختم تخصیص استاد ناموفق بود.');
      }
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast.error('ختم تخصیص استاد ناموفق بود.');
    }
  };

  const handleClassSelect = async (classId) => {
    setSelectedClass(classId);
    setBulkAssignments([]);
    setSubjectVisibleCounts({});
    if (classId) {
      try {
        const response = await fetch(`/api/teacher-assignments/class/${classId}`, { headers: { ...getAuthHeaders() } });
        const data = await response.json();
        
        if (data.success) {
          toast.info(`برای این صنف ${data.data.length} تخصیص استاد ثبت شده است.`);
        }
      } catch (error) {
        console.error('Error fetching class assignments:', error);
      }
    }
  };

  const fetchBulkSubjectsByClass = async (classId, academicYearId) => {
    if (!classId) {
      setBulkSubjects([]);
      setBulkSubjectsSource('curriculum');
      return;
    }

    try {
      setBulkSubjectsLoading(true);
      const query = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
      const response = await fetch(`/api/curriculum-rules/class/${classId}${query}`, { headers: { ...getAuthHeaders() } });
      const data = await response.json();

      if (!data.success) {
        setBulkSubjects([]);
        return;
      }

      const dedupedSubjects = [];
      const seen = new Set();
      for (const rule of data.data || []) {
        const subject = rule?.subjectId;
        const subjectId = String(subject?._id || subject || '').trim();
        if (!subjectId || seen.has(subjectId)) continue;
        seen.add(subjectId);

        if (typeof subject === 'object' && subject) {
          dedupedSubjects.push(subject);
          continue;
        }

        const fallback = subjects.find((item) => String(item._id) === subjectId);
        if (fallback) dedupedSubjects.push(fallback);
      }

      if (dedupedSubjects.length > 0) {
        setBulkSubjects(dedupedSubjects);
        setBulkSubjectsSource('curriculum');
        return;
      }

      const classInfo = classes.find((item) => String(item._id) === String(classId));
      const gradeLevel = Number(classInfo?.gradeLevel) || 0;
      const byGradeSubjects = subjects.filter((item) => {
        const grades = Array.isArray(item?.gradeLevels)
          ? item.gradeLevels.map((value) => Number(value)).filter((value) => Number.isFinite(value))
          : [];
        if (gradeLevel > 0 && grades.length > 0) {
          return grades.includes(gradeLevel);
        }

        const legacyGrade = Number(String(item?.grade || '').replace(/[^0-9]/g, ''));
        if (gradeLevel > 0 && Number.isFinite(legacyGrade) && legacyGrade > 0) {
          return legacyGrade === gradeLevel;
        }

        return false;
      });

      if (byGradeSubjects.length > 0) {
        setBulkSubjects(byGradeSubjects);
        setBulkSubjectsSource('grade');
        return;
      }

      setBulkSubjects([]);
      setBulkSubjectsSource('curriculum');
    } catch (error) {
      console.error('Error fetching class subjects:', error);
      setBulkSubjects([]);
      setBulkSubjectsSource('curriculum');
    } finally {
      setBulkSubjectsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedClass) {
      setBulkSubjects([]);
      return;
    }
    fetchBulkSubjectsByClass(selectedClass, formData.academicYearId);
  }, [selectedClass, formData.academicYearId]);

  useEffect(() => {
    let cancelled = false;
    const classId = String(formData.classId || '').trim();
    const academicYearId = String(formData.academicYearId || '').trim();

    if (!showForm || bulkMode || !classId || !academicYearId) {
      setSingleSubjects([]);
      setSingleSubjectsLoading(false);
      setSingleSubjectsSource('curriculum');
      return () => {
        cancelled = true;
      };
    }

    const loadSingleSubjects = async () => {
      setSingleSubjects([]);
      setSingleSubjectsLoading(true);
      setSingleSubjectsSource('curriculum');

      try {
        const query = `?academicYearId=${encodeURIComponent(academicYearId)}`;
        const response = await fetch(`/api/curriculum-rules/class/${classId}${query}`, { headers: { ...getAuthHeaders() } });
        const data = await response.json();
        if (cancelled) return;

        if (!data.success) {
          setSingleSubjects([]);
          return;
        }

        const matchingSubjects = [];
        const seen = new Set();
        for (const rule of data.data || []) {
          const subject = rule?.subjectId;
          const subjectId = String(subject?._id || subject || '').trim();
          if (!subjectId || seen.has(subjectId)) continue;

          const resolvedSubject = typeof subject === 'object' && subject
            ? subject
            : subjects.find((item) => String(item._id) === subjectId);
          if (!resolvedSubject) continue;

          seen.add(subjectId);
          matchingSubjects.push(resolvedSubject);
        }

        const editingClassId = String(editingAssignment?.classId?._id || editingAssignment?.classId || '').trim();
        const editingYearId = String(editingAssignment?.academicYearId?._id || editingAssignment?.academicYearId || '').trim();
        const editingSubject = editingAssignment?.subjectId;
        const editingSubjectId = String(editingSubject?._id || editingSubject || '').trim();
        const editingSubjectOption = editingClassId === classId && editingYearId === academicYearId && editingSubjectId
          ? (typeof editingSubject === 'object' && editingSubject
              ? editingSubject
              : subjects.find((item) => String(item._id) === editingSubjectId))
          : null;
        const includeEditingSubject = (items) => (
          editingSubjectOption && !items.some((item) => String(item?._id) === editingSubjectId)
            ? [...items, editingSubjectOption]
            : items
        );

        if (matchingSubjects.length > 0) {
          setSingleSubjects(includeEditingSubject(matchingSubjects));
          return;
        }

        const classInfo = classes.find((item) => String(item._id) === classId);
        const gradeLevel = Number(classInfo?.gradeLevel) || 0;
        const gradeSubjects = subjects.filter((item) => {
          const grades = Array.isArray(item?.gradeLevels)
            ? item.gradeLevels.map((value) => Number(value)).filter((value) => Number.isFinite(value))
            : [];
          if (gradeLevel > 0 && grades.length > 0) return grades.includes(gradeLevel);

          const legacyGrade = Number(String(item?.grade || '').replace(/[^0-9]/g, ''));
          return gradeLevel > 0 && Number.isFinite(legacyGrade) && legacyGrade > 0 && legacyGrade === gradeLevel;
        });

        if (gradeSubjects.length > 0) {
          setSingleSubjects(includeEditingSubject(gradeSubjects));
          setSingleSubjectsSource('grade');
          return;
        }

        if (editingSubjectOption) {
          setSingleSubjects([editingSubjectOption]);
          setSingleSubjectsSource('assignment');
          return;
        }

        setSingleSubjects([]);
      } catch (error) {
        if (cancelled) return;
        console.error('Error fetching subjects for assignment form:', error);
        setSingleSubjects([]);
      } finally {
        if (!cancelled) setSingleSubjectsLoading(false);
      }
    };

    loadSingleSubjects();
    return () => {
      cancelled = true;
    };
  }, [showForm, bulkMode, formData.classId, formData.academicYearId, subjects, classes, editingAssignment]);

  const handleBulkSubmit = async () => {
    if (!selectedClass || !formData.academicYearId || bulkAssignments.length === 0) {
      toast.error('لطفاً صنف، سال تعلیمی و حداقل یک تخصیص را انتخاب کنید.');
      return;
    }

    try {
      const response = await fetch(`/api/teacher-assignments/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          assignments: bulkAssignments.map(assignment => ({
            ...assignment,
            schoolId,
            academicYearId: formData.academicYearId,
            classId: selectedClass
          }))
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        const createdCount = Array.isArray(data.data) ? data.data.length : 0;
        const errorCount = Array.isArray(data.errors) ? data.errors.length : 0;
        if (createdCount > 0) {
          toast.success(`${createdCount} تخصیص استاد ایجاد شد.`);
        }
        if (errorCount > 0) {
          toast.error(`${errorCount} تخصیص ایجاد نشد؛ موارد تکراری یا ظرفیت استاد را بررسی کنید.`);
        }
        if (createdCount > 0 && errorCount === 0) {
          setBulkMode(false);
          setBulkAssignments([]);
        }
        fetchAssignments();
      } else {
        toast.error(data.message || 'ایجاد تخصیص‌های گروهی ناموفق بود.');
      }
    } catch (error) {
      console.error('Error creating assignments:', error);
      toast.error('ایجاد تخصیص‌های گروهی ناموفق بود.');
    }
  };

  const handleBulkAssignmentToggle = (teacherId, subjectId, isChecked) => {
    const key = `${teacherId}-${subjectId}`;
    if (isChecked) {
      setBulkAssignments(prev => [...prev, {
        teacherUserId: teacherId,
        subjectId,
        weeklyPeriods: 1,
        priority: 1,
        assignmentType: 'permanent'
      }]);
    } else {
      setBulkAssignments(prev => prev.filter(a => `${a.teacherUserId}-${a.subjectId}` !== key));
    }
  };

  const handleBulkAssignmentUpdate = (teacherId, subjectId, field, value) => {
    const key = `${teacherId}-${subjectId}`;
    const normalizedValue = Number.isFinite(Number(value)) ? Math.max(1, Number(value)) : 1;
    setBulkAssignments(prev => prev.map(a => 
      `${a.teacherUserId}-${a.subjectId}` === key ? { ...a, [field]: normalizedValue } : a
    ));
  };

  const resetForm = (overrides = {}) => {
    setFormData({
      academicYearId: '',
      classId: '',
      subjectId: '',
      teacherUserId: '',
      weeklyPeriods: 1,
      priority: 1,
      isMainTeacher: false,
      consecutivePeriods: false,
      preferredDays: [],
      preferredPeriods: [],
      avoidDays: [],
      avoidPeriods: [],
      maxPeriodsPerDay: 6,
      maxPeriodsPerWeek: 24,
      specialRequirements: {
        needsLab: false,
        needsComputer: false,
        needsPlayground: false,
        needsLibrary: false
      },
      assignmentType: 'permanent',
      ...overrides
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingAssignment(null);
    setBulkMode(false);
    setSingleWizardStep(1);
    resetForm();
  };

  const getTeacherWorkload = (teacherId) => {
    if (!workloadData) return { periods: 0, classes: 0, subjects: 0 };
    
    const teacher = workloadData.teachers.find(t => t.teacher._id.toString() === teacherId);
    return teacher ? {
      periods: teacher.totalPeriods,
      classes: teacher.totalClasses,
      subjects: teacher.totalSubjects
    } : { periods: 0, classes: 0, subjects: 0 };
  };

  const getWorkloadTone = (periods) => {
    const value = Number(periods) || 0;
    if (value >= 22) return { tone: 'high', label: 'پرفشار' };
    if (value >= 12) return { tone: 'balanced', label: 'متعادل' };
    return { tone: 'light', label: 'کم‌بار' };
  };

  const getEntityId = (value) => String(value?._id || value?.id || value || '').trim();

  const resolveById = (list, value) => {
    const id = getEntityId(value);
    if (!id) return null;
    return list.find((item) => getEntityId(item) === id) || null;
  };

  const getTeacherLabel = (teacher) => {
    const resolved = typeof teacher === 'object' && teacher ? teacher : resolveById(teachers, teacher);
    if (resolved) {
      const full = `${resolved.firstName || ''} ${resolved.lastName || ''}`.trim();
      if (full) return full;
      return String(resolved.name || resolved.email || '---').trim() || '---';
    }
    const rawId = getEntityId(teacher);
    return rawId ? `شناسه استاد: ${rawId.slice(0, 8)}` : '---';
  };

  const getClassLabel = (classItem) => {
    const resolved = typeof classItem === 'object' && classItem ? classItem : resolveById(classes, classItem);
    if (resolved) return String(resolved.title || resolved.name || resolved.label || resolved.code || '---').trim() || '---';
    const rawId = getEntityId(classItem);
    return rawId ? `شناسه صنف: ${rawId.slice(0, 8)}` : '---';
  };

  const getSubjectLabel = (subject) => {
    const resolved = typeof subject === 'object' && subject ? subject : resolveById(subjects, subject);
    if (resolved) return String(resolved.name || resolved.nameDari || resolved.title || resolved.label || resolved.code || '---').trim() || '---';
    const rawId = getEntityId(subject);
    return rawId ? `شناسه مضمون: ${rawId.slice(0, 8)}` : '---';
  };

  const getYearLabel = (year) => {
    const resolved = typeof year === 'object' && year ? year : resolveById(academicYears, year);
    if (resolved) return String(resolved.title || resolved.name || '---').trim() || '---';
    const rawId = getEntityId(year);
    return rawId ? `شناسه سال: ${rawId.slice(0, 8)}` : '---';
  };

  const isMissingValue = (value) => String(value || '').trim() === '---';

  const singleFormClasses = formData.academicYearId
    ? classes.filter((classItem) => {
        const classYearId = String(classItem?.academicYearId?._id || classItem?.academicYearId || '').trim();
        return !classYearId || classYearId === String(formData.academicYearId);
      })
    : classes;

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  const totalAssignments = filteredAssignments.length;
  const mainTeacherAssignments = filteredAssignments.filter((item) => item.isMainTeacher).length;
  const permanentAssignments = filteredAssignments.filter((item) => item.assignmentType === 'permanent').length;
  const totalWeeklyPeriods = filteredAssignments.reduce((sum, item) => sum + (Number(item.weeklyPeriods) || 0), 0);

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page tt-assignment-page" dir="rtl">
      <div className="tt-shared-header tt-assignment-hero">
        <div className="tt-assignment-hero-main">
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">معرفی صنف به استاد</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">استاد را برای صنف و مضمون همراه با ساعات هفته‌وار تعیین کنید.</p>
          <div className="tt-assignment-kpis" aria-label="آمار تخصیص استاد">
            <div className="tt-assignment-kpi">
              <span className="tt-assignment-kpi-label">کل تخصیص‌ها</span>
              <strong className="tt-assignment-kpi-value">{totalAssignments}</strong>
            </div>
            <div className="tt-assignment-kpi">
              <span className="tt-assignment-kpi-label">استاد اصلی</span>
              <strong className="tt-assignment-kpi-value">{mainTeacherAssignments}</strong>
            </div>
            <div className="tt-assignment-kpi">
              <span className="tt-assignment-kpi-label">تخصیص دایمی</span>
              <strong className="tt-assignment-kpi-value">{permanentAssignments}</strong>
            </div>
            <div className="tt-assignment-kpi">
              <span className="tt-assignment-kpi-label">ساعات هفتگی</span>
              <strong className="tt-assignment-kpi-value">{totalWeeklyPeriods}</strong>
            </div>
          </div>
        </div>
      </div>

      <section className="tt-assignment-command-bar" aria-label="فیلتر و عملیات تخصیص استاد">
        <div className="tt-assignment-filter-area">
          <div className="tt-assignment-filter-field">
            <Label>سال تعلیمی</Label>
            <Select value={filters.academicYearId} onValueChange={(value) => handleFilterChange('academicYearId', value)} aria-label="فیلتر سال تعلیمی">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه سال‌ها</SelectItem>
                {academicYears.map((year) => (
                  <SelectItem key={year._id} value={String(year._id)}>{getYearLabel(year)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="tt-assignment-filter-field">
            <Label>استاد</Label>
            <Select value={filters.teacherUserId} onValueChange={(value) => handleFilterChange('teacherUserId', value)} aria-label="فیلتر استاد">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه استادان</SelectItem>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher._id} value={String(teacher._id)}>{getTeacherLabel(teacher)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="tt-assignment-filter-field">
            <Label>مضمون</Label>
            <Select value={filters.subjectId} onValueChange={(value) => handleFilterChange('subjectId', value)} aria-label="فیلتر مضمون">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه مضامین</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject._id} value={String(subject._id)}>{getSubjectLabel(subject)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            className="tt-assignment-filter-reset"
            disabled={!hasActiveFilters}
            onClick={() => {
              setFilters({ academicYearId: 'all', teacherUserId: 'all', subjectId: 'all' });
              setWorkloadData(null);
            }}
          >
            پاک‌کردن فیلترها
          </Button>
        </div>

        <div className="tt-assignment-action-row">
          <Button variant="outline" onClick={handleWorkloadToggle} className="tt-assignment-ghost-btn">
            <Users className="w-4 h-4" />
            {workloadData ? 'بستن فشار کاری' : 'فشار کاری استادان'}
          </Button>
          <Button variant="outline" onClick={toggleBulkMode} className={`tt-assignment-ghost-btn ${bulkMode ? 'is-active' : ''}`}>
            {bulkMode ? 'بستن حالت گروهی' : 'حالت گروهی'}
          </Button>
          <Button onClick={openNewAssignmentForm} className="tt-assignment-primary-btn">
            <Plus className="w-4 h-4" />
            افزودن تخصیص
          </Button>
        </div>
      </section>

      {/* Workload Summary */}
      {workloadData && (
        <Card className="tt-assignment-panel">
          <CardHeader>
            <CardTitle>خلاصه بار درسی استادان</CardTitle>
            <p className="text-sm text-gray-600">
              {workloadData.totalTeachers} استاد • {workloadData.totalAssignments} تخصیص •
              {' '}
              {workloadData.averagePeriodsPerTeacher.toFixed(1)} میانگین ساعت برای هر استاد
            </p>
            {workloadYearId && (
              <p className="text-xs text-gray-500">
                سال تعلیمی: {getYearLabel(workloadYearId)}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="tt-assignment-workload-strip">
              {workloadData.teachers.slice(0, 8).map((teacher) => (
                <div key={teacher.teacher._id} className="tt-assignment-workload-pill">
                  <span className="tt-assignment-workload-name">{getTeacherLabel(teacher.teacher)}</span>
                  <span>{teacher.totalPeriods} ساعت</span>
                  <span>{teacher.totalClasses} صنف</span>
                  <span>{teacher.totalSubjects} مضمون</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bulk Mode */}
      {bulkMode && (
        <Card className="tt-assignment-panel">
          <CardHeader>
            <CardTitle>تنظیم گروهی تخصیص‌ها</CardTitle>
            <p className="text-sm text-gray-600">برای یک صنف، چند استاد و مضمون را یک‌باره ثبت کنید.</p>
          </CardHeader>
          <CardContent className="space-y-6 tt-assignment-bulk-wrap tt-assignment-bulk-shell">
            <div className="tt-assignment-bulk-hero">
              <div className="tt-assignment-bulk-hero-title">کارگاه سریع تخصیص استاد</div>
              <div className="tt-assignment-bulk-hero-subtitle">ابتدا سال و صنف را انتخاب کنید، بعد استادهای مناسب هر مضمون را تیک بزنید.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tt-assignment-bulk-head">
              <div>
                <Label htmlFor="academicYearId">سال تعلیمی</Label>
                <Select 
                  value={formData.academicYearId} 
                  onValueChange={(value) => {
                    setFormData({...formData, academicYearId: value});
                    setBulkAssignments([]);
                    setSubjectVisibleCounts({});
                    fetchWorkloadData(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب سال تعلیمی" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year._id} value={String(year._id)}>
                            {getYearLabel(year)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {academicYears.length === 0 && (
                  <p className="tt-assignment-inline-hint">سال تعلیمی برای انتخاب موجود نیست.</p>
                )}
              </div>

              <div>
                <Label htmlFor="classId">صنف</Label>
                <Select 
                  value={selectedClass} 
                  onValueChange={handleClassSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب صنف" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem._id} value={classItem._id}>
                            {getClassLabel(classItem)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {classes.length === 0 && (
                  <p className="tt-assignment-inline-hint">در حال حاضر صنفی برای انتخاب موجود نیست.</p>
                )}
              </div>
            </div>

            {selectedClass && (
              <div>
                <Label>انتخاب ترکیب استاد و مضمون</Label>
                <div className="space-y-4 mt-2 tt-assignment-bulk-subject-list">
                  {bulkSubjectsLoading && (
                    <p className="tt-assignment-inline-hint">در حال دریافت مضامین صنف انتخاب‌شده...</p>
                  )}

                  {!bulkSubjectsLoading && bulkSubjects.length === 0 && (
                    <p className="tt-assignment-inline-hint">برای این صنف در نصاب آموزشی، مضمونی ثبت نشده است.</p>
                  )}

                  {!bulkSubjectsLoading && bulkSubjects.length > 0 && bulkSubjectsSource === 'grade' && (
                    <p className="tt-assignment-inline-hint">مضامین از نصاب صنف پیدا نشد؛ فهرست فعلی بر اساس پایه/صنف نمایش داده شده است.</p>
                  )}

                  {bulkSubjects.map((subject) => {
                    const matchedTeachers = teachers.filter((teacher) => {
                      const expertise = String(teacher.subject || '').trim().toLowerCase();
                      if (!expertise) return false;
                      return expertise.includes(String(subject.name || '').trim().toLowerCase())
                        || expertise.includes(String(subject.code || '').trim().toLowerCase());
                    });
                    const availableTeachers = matchedTeachers.length ? matchedTeachers : teachers;
                    const visibleCount = subjectVisibleCounts[subject._id] || 5;
                    const visibleTeachers = availableTeachers.slice(0, visibleCount);
                    const hasMoreTeachers = visibleCount < availableTeachers.length;
                    const canCollapseTeachers = visibleCount > 5;
                    const selectedForSubject = bulkAssignments.filter((assignment) => assignment.subjectId === subject._id);
                    
                    return (
                      <div key={subject._id} className="p-3 tt-assignment-subject-card tt-assignment-subject-block tt-assignment-subject-board">
                        <div className="space-y-3">
                          <div className="tt-assignment-subject-headline">
                            <div className="tt-assignment-subject-main">
                              <h4 className="font-medium tt-assignment-subject-title">{subject.name}</h4>
                              <p className="tt-assignment-subject-meta">
                                {subject.code ? `کد ${subject.code}` : 'بدون کد'} • {availableTeachers.length} استاد پیشنهادی
                              </p>
                            </div>
                            <span className="tt-assignment-subject-selected-count">{selectedForSubject.length} انتخاب</span>
                          </div>

                          <div className={`tt-assignment-subject-body ${selectedForSubject.length > 0 ? 'has-selection' : ''}`}>
                            <div className="tt-assignment-subject-chooser">
                              <div className="tt-assignment-teacher-chip-grid">
                                {visibleTeachers.map((teacher) => {
                                  const key = `${teacher._id}-${subject._id}`;
                                  const isSelected = bulkAssignments.some((assignment) => (
                                    assignment.teacherUserId === teacher._id && assignment.subjectId === subject._id
                                  ));
                                  const workload = getTeacherWorkload(teacher._id);
                                  const workloadTone = getWorkloadTone(workload.periods);

                                  return (
                                    <label
                                      key={key}
                                      className={`tt-assignment-teacher-chip is-${workloadTone.tone} ${isSelected ? 'is-active' : ''}`}
                                    >
                                      <span className="tt-assignment-teacher-chip-main">
                                        <span className="tt-assignment-teacher-chip-name">{getTeacherLabel(teacher)}</span>
                                        <Checkbox
                                          className="tt-assignment-chip-checkbox"
                                          checked={isSelected}
                                          onCheckedChange={(checked) => handleBulkAssignmentToggle(teacher._id, subject._id, checked)}
                                        />
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>

                              {(hasMoreTeachers || canCollapseTeachers) && (
                                <div className="tt-assignment-teacher-more-row">
                                  {hasMoreTeachers && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="tt-assignment-teacher-more-btn"
                                      onClick={() => setSubjectVisibleCounts((prev) => ({
                                        ...prev,
                                        [subject._id]: Math.min((prev[subject._id] || 5) + 5, availableTeachers.length)
                                      }))}
                                    >
                                      {`بیشتر (${availableTeachers.length - visibleCount} استاد دیگر)`}
                                    </Button>
                                  )}
                                  {canCollapseTeachers && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="tt-assignment-teacher-more-btn"
                                      onClick={() => setSubjectVisibleCounts((prev) => ({
                                        ...prev,
                                        [subject._id]: 5
                                      }))}
                                    >
                                      نمایش کمتر
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>

                            {selectedForSubject.length > 0 && (
                              <div className="tt-assignment-selected-configs-wrap">
                                <h5 className="tt-assignment-selected-title">تنظیمات انتخاب‌شده</h5>
                                <div className="tt-assignment-selected-configs">
                                  {selectedForSubject.map((assignment) => {
                                    const teacher = availableTeachers.find((item) => item._id === assignment.teacherUserId)
                                      || teachers.find((item) => item._id === assignment.teacherUserId)
                                      || assignment.teacherUserId;
                                    const workload = getTeacherWorkload(assignment.teacherUserId);

                                    return (
                                      <div key={`${assignment.teacherUserId}-${subject._id}`} className="tt-assignment-selected-config-row">
                                        <div className="tt-assignment-selected-config-teacher">{getTeacherLabel(teacher)}</div>
                                        <div className="grid grid-cols-2 gap-2 tt-assignment-selected-config-grid">
                                          <div>
                                            <Label className="text-xs">ساعات هفته‌وار</Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              max="10"
                                              value={assignment?.weeklyPeriods || 1}
                                              onChange={(e) => handleBulkAssignmentUpdate(assignment.teacherUserId, subject._id, 'weeklyPeriods', parseInt(e.target.value))}
                                              className="h-8"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">اولویت</Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              max="10"
                                              value={assignment?.priority || 1}
                                              onChange={(e) => handleBulkAssignmentUpdate(assignment.teacherUserId, subject._id, 'priority', parseInt(e.target.value))}
                                              className="h-8"
                                            />
                                          </div>
                                        </div>
                                        <div className="text-xs text-gray-500 tt-assignment-selected-config-meta">
                                          بار فعلی: {workload.periods} ساعت، {workload.classes} صنف
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 tt-assignment-bulk-actions">
              <Button onClick={handleBulkSubmit} disabled={bulkAssignments.length === 0} className="tt-assignment-primary-btn">
                ایجاد {bulkAssignments.length} تخصیص
              </Button>
              <Button variant="outline" onClick={handleCancel} className="tt-assignment-ghost-btn">
                انصراف
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Mode Form */}
      {showForm && !bulkMode && (
        <Card className="tt-assignment-panel tt-assignment-form-panel">
          <CardHeader>
            <CardTitle>{editingAssignment ? 'ویرایش تخصیص' : 'افزودن تخصیص'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4 tt-assignment-form">
              <div className="tt-assignment-wizard-steps" aria-label="مراحل ثبت تخصیص استاد">
                <button type="button" className={`tt-assignment-wizard-step ${singleWizardStep === 1 ? 'is-active' : ''}`} onClick={() => selectSingleWizardStep(1)}>۱. پایه</button>
                <button type="button" className={`tt-assignment-wizard-step ${singleWizardStep === 2 ? 'is-active' : ''}`} onClick={() => selectSingleWizardStep(2)}>۲. ظرفیت</button>
                <button type="button" className={`tt-assignment-wizard-step ${singleWizardStep === 3 ? 'is-active' : ''}`} onClick={() => selectSingleWizardStep(3)}>۳. نوع</button>
              </div>

              {singleWizardStep === 1 && (
                <div className="tt-assignment-wizard-card">
                  <h4 className="tt-assignment-wizard-title">گام اول: انتخاب سال، صنف، مضمون و استاد</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="academicYearId">سال تعلیمی</Label>
                      <Select value={formData.academicYearId} onValueChange={handleSingleYearChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="انتخاب سال تعلیمی" />
                        </SelectTrigger>
                        <SelectContent>
                          {academicYears.map((year) => (
                            <SelectItem key={year._id} value={year._id}>{getYearLabel(year)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {academicYears.length === 0 && <p className="tt-assignment-inline-hint">سال تعلیمی فعال برای انتخاب موجود نیست.</p>}
                    </div>

                    <div>
                      <Label htmlFor="classId">صنف</Label>
                      <Select value={formData.classId} onValueChange={handleSingleClassChange} disabled={!formData.academicYearId}>
                        <SelectTrigger>
                          <SelectValue placeholder="انتخاب صنف" />
                        </SelectTrigger>
                        <SelectContent>
                          {singleFormClasses.map((classItem) => (
                            <SelectItem key={classItem._id} value={classItem._id}>{getClassLabel(classItem)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!formData.academicYearId && <p className="tt-assignment-inline-hint">ابتدا سال تعلیمی را انتخاب کنید.</p>}
                      {formData.academicYearId && singleFormClasses.length === 0 && <p className="tt-assignment-inline-hint">برای سال تعلیمی انتخاب‌شده صنفی موجود نیست.</p>}
                    </div>

                    <div>
                      <Label htmlFor="subjectId">مضمون</Label>
                      <Select
                        value={formData.subjectId}
                        onValueChange={(value) => setFormData((current) => ({ ...current, subjectId: value }))}
                        disabled={!formData.academicYearId || !formData.classId || singleSubjectsLoading || singleSubjects.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !formData.academicYearId
                              ? 'ابتدا سال تعلیمی را انتخاب کنید'
                              : !formData.classId
                                ? 'ابتدا صنف را انتخاب کنید'
                                : singleSubjectsLoading
                                  ? 'در حال دریافت مضامین...'
                                  : singleSubjects.length === 0
                                    ? 'مضمونی یافت نشد'
                                    : 'انتخاب مضمون'
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {singleSubjects.map((subject) => (
                            <SelectItem key={subject._id} value={subject._id}>{getSubjectLabel(subject)} {subject.code ? `(${subject.code})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {formData.academicYearId && formData.classId && singleSubjectsLoading && (
                        <p className="tt-assignment-inline-hint">در حال دریافت مضامین همین صنف و سال تعلیمی...</p>
                      )}
                      {formData.academicYearId && formData.classId && !singleSubjectsLoading && singleSubjects.length === 0 && (
                        <p className="tt-assignment-inline-hint">برای این صنف در سال تعلیمی انتخاب‌شده، مضمونی در نصاب ثبت نشده است.</p>
                      )}
                      {!singleSubjectsLoading && singleSubjects.length > 0 && singleSubjectsSource === 'grade' && (
                        <p className="tt-assignment-inline-hint">نصاب این صنف ثبت نشده؛ مضامین مربوط به پایهٔ همین صنف نمایش داده شده‌اند.</p>
                      )}
                      {!singleSubjectsLoading && singleSubjectsSource === 'assignment' && (
                        <p className="tt-assignment-inline-hint">مضمون فعلی این تخصیص برای امکان ویرایش نمایش داده شده است.</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="teacherUserId">استاد</Label>
                      <Select value={formData.teacherUserId} onValueChange={(value) => setFormData({ ...formData, teacherUserId: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="انتخاب استاد" />
                        </SelectTrigger>
                        <SelectContent>
                          {teachers.map((teacher) => (
                            <SelectItem key={teacher._id} value={teacher._id}>{getTeacherLabel(teacher)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {teachers.length === 0 && <p className="tt-assignment-inline-hint">استادی برای انتخاب موجود نیست.</p>}
                    </div>
                  </div>
                </div>
              )}

              {singleWizardStep === 2 && (
                <div className="tt-assignment-wizard-card">
                  <h4 className="tt-assignment-wizard-title">گام دوم: ظرفیت زمانی</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label htmlFor="weeklyPeriods">ساعات هفته‌وار</Label>
                      <Input id="weeklyPeriods" type="number" min="1" max="30" value={formData.weeklyPeriods} onChange={(e) => setFormData({ ...formData, weeklyPeriods: parseInt(e.target.value, 10) || 1 })} required />
                    </div>
                    <div>
                      <Label htmlFor="priority">اولویت</Label>
                      <Input id="priority" type="number" min="1" max="10" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value, 10) || 1 })} required />
                    </div>
                    <div>
                      <Label htmlFor="maxPeriodsPerDay">حداکثر ساعت در روز</Label>
                      <Input id="maxPeriodsPerDay" type="number" min="1" max="8" value={formData.maxPeriodsPerDay} onChange={(e) => setFormData({ ...formData, maxPeriodsPerDay: parseInt(e.target.value, 10) || 1 })} />
                    </div>
                    <div>
                      <Label htmlFor="maxPeriodsPerWeek">حداکثر ساعت در هفته</Label>
                      <Input id="maxPeriodsPerWeek" type="number" min="1" max="40" value={formData.maxPeriodsPerWeek} onChange={(e) => setFormData({ ...formData, maxPeriodsPerWeek: parseInt(e.target.value, 10) || 1 })} />
                    </div>
                  </div>
                </div>
              )}

              {singleWizardStep === 3 && (
                <div className="tt-assignment-wizard-card">
                  <h4 className="tt-assignment-wizard-title">گام سوم: نوع تخصیص و قواعد</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="assignmentType">نوع تخصیص</Label>
                      <Select value={formData.assignmentType} onValueChange={(value) => setFormData({ ...formData, assignmentType: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="انتخاب نوع" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="permanent">دایمی</SelectItem>
                          <SelectItem value="temporary">موقت</SelectItem>
                          <SelectItem value="substitute">بدیل</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="tt-assignment-rule-toggle">
                      <Checkbox id="isMainTeacher" checked={formData.isMainTeacher} onCheckedChange={(checked) => setFormData({ ...formData, isMainTeacher: checked })} />
                      <div className="tt-assignment-rule-text">
                        <Label htmlFor="isMainTeacher">استاد اصلی</Label>
                        <small>این استاد مسئول اصلی مضمون در صنف است و در گزارش‌ها/الگوریتم با اولویت بالاتر دیده می‌شود.</small>
                      </div>
                    </div>

                    <div className="tt-assignment-rule-toggle">
                      <Checkbox id="consecutivePeriods" checked={formData.consecutivePeriods} onCheckedChange={(checked) => setFormData({ ...formData, consecutivePeriods: checked })} />
                      <div className="tt-assignment-rule-text">
                        <Label htmlFor="consecutivePeriods">ساعت‌های پی‌هم</Label>
                        <small>در تقسیم اوقات تلاش می‌شود ساعات این مضمون پشت‌سرهم قرار گیرد (برای دروس عملی/لابراتوار مناسب است).</small>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 tt-assignment-wizard-actions">
                <Button type="button" variant="outline" onClick={() => setSingleWizardStep((prev) => Math.max(1, prev - 1))} className="tt-assignment-ghost-btn" disabled={singleWizardStep === 1}>
                  قبلی
                </Button>
                {singleWizardStep < 3 ? (
                  <Button type="button" className="tt-assignment-primary-btn" onClick={advanceSingleWizard}>
                    بعدی
                  </Button>
                ) : (
                  <Button type="submit" className="tt-assignment-primary-btn">
                    {editingAssignment ? 'ذخیره تغییرات' : 'ایجاد تخصیص'}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={handleCancel} className="tt-assignment-ghost-btn">
                  انصراف
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="tt-assignment-results-heading">
        <div>
          <h2>فهرست تخصیص‌ها</h2>
          <p>{hasActiveFilters ? `${filteredAssignments.length} مورد از ${assignments.length} تخصیص نمایش داده می‌شود.` : `${assignments.length} تخصیص فعال`}</p>
        </div>
      </div>

      {/* Assignments List */}
      <div className="tt-assignment-list-grid tt-assignment-wizard-list-grid">
        {filteredAssignments.map((assignment, index) => (
          <Card
            key={assignment._id}
            className="hover:shadow-lg transition-shadow tt-assignment-item-card tt-assignment-wizard-item-card"
            style={{ animationDelay: `${Math.min(index * 50, 380)}ms` }}
          >
            <CardContent className="p-4">
              <div className="tt-assignment-card-main">
                <div className="tt-assignment-wizard-chip">کارت تخصیص</div>
                <h3 className="tt-assignment-card-name">{getTeacherLabel(assignment.teacherUserId)}</h3>

                <div className="tt-assignment-card-badges">
                  <Badge variant={assignment.isMainTeacher ? "default" : "secondary"}>
                    {assignment.isMainTeacher ? 'استاد اصلی' : 'همکار'}
                  </Badge>
                  {isMissingValue(getTeacherLabel(assignment.teacherUserId)) && (
                    <Badge variant="outline" className="tt-assignment-missing-badge">داده استاد ناقص</Badge>
                  )}
                  {isMissingValue(getSubjectLabel(assignment.subjectId)) && (
                    <Badge variant="outline" className="tt-assignment-missing-badge">مضمون نامشخص</Badge>
                  )}
                </div>

                <div className="tt-assignment-info-grid">
                  <div className="tt-assignment-info-item">
                    <AlertCircle className="w-4 h-4" />
                    <span>{getSubjectLabel(assignment.subjectId)}</span>
                  </div>
                  <div className="tt-assignment-info-item">
                    <Users className="w-4 h-4" />
                    <span>{getClassLabel(assignment.classId)}</span>
                  </div>
                  <div className="tt-assignment-info-item">
                    <Clock className="w-4 h-4" />
                    <span>{assignment.weeklyPeriods} ساعت</span>
                  </div>
                  <div className="tt-assignment-info-item">
                    <Calendar className="w-4 h-4" />
                    <span>{getYearLabel(assignment.academicYearId)}</span>
                  </div>
                  <div className="tt-assignment-info-item">
                    <UserCheck className="w-4 h-4" />
                    <span>{assignment.assignmentType === 'permanent' ? 'دایمی' : assignment.assignmentType === 'temporary' ? 'موقت' : assignment.assignmentType === 'substitute' ? 'بدیل' : assignment.assignmentType}</span>
                  </div>
                </div>

                <div className="tt-assignment-card-badges tt-assignment-card-warnings">
                  {isMissingValue(getClassLabel(assignment.classId)) && (
                    <Badge variant="outline" className="tt-assignment-missing-badge">صنف نامشخص</Badge>
                  )}
                  {isMissingValue(getYearLabel(assignment.academicYearId)) && (
                    <Badge variant="outline" className="tt-assignment-missing-badge">سال نامشخص</Badge>
                  )}
                </div>

                <div className="tt-assignment-card-actions">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(assignment)}
                    className="flex items-center gap-1 tt-assignment-ghost-btn"
                  >
                    <Edit className="w-3 h-3" />
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(assignment._id)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700 tt-assignment-delete-btn"
                  >
                    <Trash2 className="w-3 h-3" />
                    ختم تخصیص
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {assignments.length > 0 && filteredAssignments.length === 0 && (
        <div className="text-center py-10 tt-assignment-empty-state">
          <AlertCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">تخصیصی مطابق فیلتر پیدا نشد</h3>
          <p className="text-gray-600 mb-4">فیلترهای سال، استاد یا مضمون را تغییر دهید.</p>
          <Button
            variant="outline"
            className="tt-assignment-ghost-btn"
            onClick={() => setFilters({ academicYearId: 'all', teacherUserId: 'all', subjectId: 'all' })}
          >
            نمایش همه تخصیص‌ها
          </Button>
        </div>
      )}

      {assignments.length === 0 && !loading && (
        <div className="text-center py-12 tt-assignment-empty-state">
          <UserCheck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">هیچ تخصیصی پیدا نشد</h3>
          <p className="text-gray-600 mb-4">برای شروع ساخت تقسیم اوقات، استادان را به صنف‌ها و مضامین وصل کنید.</p>
          <Button onClick={openNewAssignmentForm} className="tt-assignment-primary-btn">
            <Plus className="w-4 h-4 mr-2" />
            افزودن نخستین تخصیص
          </Button>
        </div>
      )}
    </div>
  );
};

export default TeacherAssignmentManagement;
