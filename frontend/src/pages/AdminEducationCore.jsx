import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';
import { errorMessage, fetchJson, normalizeOptions, postJson } from './adminWorkspaceUtils';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const emptyClass = { id: '', title: '', code: '', gradeLevel: '', section: 'الف', academicYearId: '', shift: 'morning', room: '', status: 'active', note: '' };
const emptySubject = { id: '', name: '', code: '', grade: '', note: '', isActive: true };
const emptyYear = { id: '', title: '', startDate: '', endDate: '', note: '', isActive: false };
const emptyTerm = { id: '', academicYearId: '', title: '', code: '', order: 1, type: 'term', startDate: '', endDate: '', note: '' };
const emptyMap = { id: '', instructorId: '', subjectId: '', academicYearId: '', classId: '', note: '', isPrimary: false };
const emptyEnroll = { id: '', studentId: '', classId: '', status: 'approved', note: '', rejectedReason: '' };

const putJson = (path, body) => fetchJson(path, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {})
});

const deleteJson = (path) => fetchJson(path, { method: 'DELETE' });

const CLASS_STATUS_OPTIONS = [
  { value: 'active', label: 'فعال' },
  { value: 'draft', label: 'پیش‌نویس' },
  { value: 'archived', label: 'آرشیف' }
];

const SHIFT_OPTIONS = [
  { value: 'morning', label: 'صبح' },
  { value: 'afternoon', label: 'بعد از ظهر' },
  { value: 'evening', label: 'عصر' },
  { value: '', label: 'بدون شیفت' }
];

const SECTION_OPTIONS = [
  { value: 'الف', label: 'الف' },
  { value: 'ب', label: 'ب' },
  { value: 'ج', label: 'ج' },
  { value: 'د', label: 'د' },
  { value: 'ه', label: 'ه' },
  { value: 'و', label: 'و' },
  { value: 'ز', label: 'ز' },
  { value: 'ح', label: 'ح' },
  { value: 'ط', label: 'ط' }
];

const ENROLLMENT_STATUS_OPTIONS = [
  { value: 'approved', label: 'تایید شده' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'rejected', label: 'رد شده' }
];

const TERM_TYPE_OPTIONS = [
  { value: 'term', label: 'دوره' },
  { value: 'quarter', label: 'ربع' },
  { value: 'semester', label: 'سمستر' },
  { value: 'assessment_period', label: 'دوره ارزیابی' },
  { value: 'exam_period', label: 'دوره امتحان' }
];

const TERM_STATUS_LABELS = {
  planned: 'برنامه‌ریزی شده',
  active: 'فعال',
  closed: 'بسته شده'
};

const EDUCATION_SECTIONS = [
  { key: 'overview', label: 'نمای کلی' },
  { key: 'years', label: 'سال تعلیمی و دوره' },
  { key: 'classes', label: 'صنف‌ها' },
  { key: 'subjects', label: 'مضمون‌ها' },
  { key: 'maps', label: 'تقسیم مضمون' },
  { key: 'enrollments', label: 'ثبت‌نام متعلمین' }
];

const YEAR_REGISTRY_VISIBLE_LIMIT = 4;
const CLASS_REGISTRY_VISIBLE_LIMIT = 4;
const SUBJECT_REGISTRY_VISIBLE_LIMIT = 4;
const MAP_REGISTRY_VISIBLE_LIMIT = 4;
const ENROLLMENT_REGISTRY_VISIBLE_LIMIT = 4;
const ENROLLMENT_CANDIDATE_VISIBLE_LIMIT = 6;
const ONLINE_REGISTRATION_VISIBLE_LIMIT = 4;

function resolveEducationSection(value = '') {
  const normalized = String(value || '').trim();
  return EDUCATION_SECTIONS.some((item) => item.key === normalized) ? normalized : 'overview';
}

function getInitialEducationNavigation() {
  if (typeof window === 'undefined') {
    return { section: 'overview', candidateRef: '' };
  }
  const params = new URLSearchParams(window.location.search || '');
  return {
    section: resolveEducationSection(params.get('section')),
    candidateRef: String(params.get('candidate') || '').trim()
  };
}

function asId(value) {
  return String(value?._id || value?.id || value || '');
}

function getEnrollmentStatusLabel(value) {
  return ENROLLMENT_STATUS_OPTIONS.find((item) => item.value === value)?.label || value || '---';
}

function getTermTypeLabel(value) {
  return TERM_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '---';
}

function getTermStatusLabel(value) {
  return TERM_STATUS_LABELS[value] || value || '---';
}

function getStudentCandidateSourceLabel(value) {
  return ({
    user: 'ثبت‌شده در سیستم',
    enrollment: 'ثبت‌نام آنلاین',
    afghan: 'ثبت‌نام دستی'
  }[String(value || '').trim().toLowerCase()] || 'منبع نامشخص');
}

function formatFaDate(value) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || value || '---';
}

function normalizeDateInputValue(value) {
  return toGregorianDateInputValue(value);
}

function toAsciiDigits(value) {
  return String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

function normalizeComparableTitle(value) {
  return toAsciiDigits(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function inferGradeFromClassInput(...candidates) {
  for (const candidate of candidates) {
    const normalized = toAsciiDigits(candidate).trim();
    if (!normalized) continue;
    const direct = Number(normalized);
    if (Number.isFinite(direct) && direct >= 1 && direct <= 12) return String(direct);
    const match = normalized.match(/\b(1[0-2]|[1-9])\b/);
    if (match) return match[1];
  }
  return '';
}

function normalizeClassSection(...candidates) {
  const aliases = {
    a: 'الف',
    b: 'ب',
    c: 'ج',
    d: 'د',
    e: 'ه',
    f: 'و',
    g: 'ز',
    h: 'ح',
    i: 'ط',
    الف: 'الف',
    ب: 'ب',
    ج: 'ج',
    د: 'د',
    ه: 'ه',
    و: 'و',
    ز: 'ز',
    ح: 'ح',
    ط: 'ط'
  };

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (!normalized) continue;
    if (aliases[normalized]) return aliases[normalized];
    const latinMatch = normalized.match(/([a-i])$/i);
    if (latinMatch && aliases[latinMatch[1].toLowerCase()]) {
      return aliases[latinMatch[1].toLowerCase()];
    }
  }

  return 'الف';
}

function contextualEducationError(error, fallback, context = '') {
  const raw = String(error?.message || '').trim();
  if (!raw) return fallback;

  const legacyMap = {
    'Failed to create school class': context === 'class' ? 'ایجاد صنف ناموفق بود.' : fallback,
    'Failed to update school class': context === 'class' ? 'ویرایش صنف ناموفق بود.' : fallback,
    'School class not found': 'صنف پیدا نشد.',
    'Failed to create subject': context === 'class' ? 'ایجاد صنف ناموفق بود.' : 'ایجاد مضمون ناموفق بود.',
    'Failed to update subject': context === 'class' ? 'ویرایش صنف ناموفق بود.' : 'ویرایش مضمون ناموفق بود.',
    'Subject name is required': 'نام مضمون الزامی است.',
    'Subject not found': 'مضمون پیدا نشد.',
    'Failed to create academic year': 'ایجاد سال تعلیمی ناموفق بود.',
    'Failed to update academic year': 'ویرایش سال تعلیمی ناموفق بود.',
    'Academic year title is required': 'عنوان سال تعلیمی الزامی است.',
    'Academic year not found': 'سال تعلیمی پیدا نشد.',
    'Failed to create mapping': 'ایجاد تقسیم مضمون ناموفق بود.',
    'Failed to update mapping': 'ویرایش تقسیم مضمون ناموفق بود.',
    'This mapping already exists': 'این تقسیم از قبل ثبت شده است.'
  };

  return legacyMap[raw] || raw || fallback;
}

function SectionToggle({ label, active, count, onClick }) {
  return (
    <button
      type="button"
      className={`admin-education-toggle${active ? ' active' : ''}`}
      onClick={onClick}
    >
      <span className="admin-education-toggle-title">{label}</span>
      <span className="admin-education-toggle-meta">{count}</span>
    </button>
  );
}

function OverviewStat({ label, value, tone = '' }) {
  return (
    <article className={`admin-workspace-stat${tone ? ` ${tone}` : ''}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export default function AdminEducationCore() {
  const initialNavigation = getInitialEducationNavigation();
  const [activeSection, setActiveSection] = useState(initialNavigation.section);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [schoolClasses, setSchoolClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [years, setYears] = useState([]);
  const [academicTerms, setAcademicTerms] = useState([]);
  const [termsLoading, setTermsLoading] = useState(false);
  const [selectedTermYearId, setSelectedTermYearId] = useState('');
  const [maps, setMaps] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [students, setStudents] = useState([]);
  const [onlineRegistrationQueue, setOnlineRegistrationQueue] = useState([]);
  const [enrollFilter, setEnrollFilter] = useState('');
  const [yearSearchInput, setYearSearchInput] = useState('');
  const [yearSearchQuery, setYearSearchQuery] = useState('');
  const [showAllYears, setShowAllYears] = useState(false);
  const [classSearchInput, setClassSearchInput] = useState('');
  const [classSearchQuery, setClassSearchQuery] = useState('');
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [subjectSearchInput, setSubjectSearchInput] = useState('');
  const [subjectSearchQuery, setSubjectSearchQuery] = useState('');
  const [subjectGradeFilter, setSubjectGradeFilter] = useState('');
  const [subjectStatusFilter, setSubjectStatusFilter] = useState('all');
  const [showAllSubjects, setShowAllSubjects] = useState(false);
  const [mapSearchInput, setMapSearchInput] = useState('');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [mapInstructorFilter, setMapInstructorFilter] = useState('');
  const [mapYearFilter, setMapYearFilter] = useState('');
  const [mapClassFilter, setMapClassFilter] = useState('');
  const [mapPrimaryFilter, setMapPrimaryFilter] = useState('all');
  const [showAllMaps, setShowAllMaps] = useState(false);
  const [enrollSearchInput, setEnrollSearchInput] = useState('');
  const [enrollSearchQuery, setEnrollSearchQuery] = useState('');
  const [enrollYearFilter, setEnrollYearFilter] = useState('');
  const [enrollClassFilter, setEnrollClassFilter] = useState('');
  const [candidateSearchInput, setCandidateSearchInput] = useState('');
  const [candidateSearchQuery, setCandidateSearchQuery] = useState('');
  const [candidateSourceFilter, setCandidateSourceFilter] = useState('');
  const [candidateGradeFilter, setCandidateGradeFilter] = useState('');
  const [onlineSearchInput, setOnlineSearchInput] = useState('');
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [showAllEnrollmentCandidates, setShowAllEnrollmentCandidates] = useState(false);
  const [showAllEnrollments, setShowAllEnrollments] = useState(false);
  const [pendingEnrollmentCandidateRef, setPendingEnrollmentCandidateRef] = useState(initialNavigation.candidateRef);
  const [enrollmentMode, setEnrollmentMode] = useState('quick'); // 'quick', 'bulk', 'detailed'
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkClassId, setBulkClassId] = useState('');
  const [inlineClasses, setInlineClasses] = useState({});
  const [classForm, setClassForm] = useState(emptyClass);
  const [subjectForm, setSubjectForm] = useState(emptySubject);
  const [yearForm, setYearForm] = useState(emptyYear);
  const [termForm, setTermForm] = useState(emptyTerm);
  const [mapForm, setMapForm] = useState(emptyMap);
  const [enrollForm, setEnrollForm] = useState(emptyEnroll);

  const effectivePermissions = useMemo(() => {
    try {
      const permissions = JSON.parse(localStorage.getItem('effectivePermissions') || '[]');
      return Array.isArray(permissions) ? permissions : [];
    } catch {
      return [];
    }
  }, []);
  const canManageUsers = effectivePermissions.includes('manage_users');
  const canManageContent = effectivePermissions.includes('manage_content');
  const canManageMemberships = canManageUsers || effectivePermissions.includes('manage_memberships');
  const visibleEducationSections = useMemo(() => (
    canManageContent
      ? EDUCATION_SECTIONS
      : EDUCATION_SECTIONS.filter((item) => item.key === 'enrollments')
  ), [canManageContent]);

  const yearOptions = useMemo(() => normalizeOptions(years, ['title']), [years]);
  const classOptions = useMemo(() => (
    schoolClasses.map((item) => ({
      ...item,
      uiLabel: [item.title, item.academicYear?.title, item.section].filter(Boolean).join(' | ')
    }))
  ), [schoolClasses]);
  const subjectOptions = useMemo(() => normalizeOptions(subjects, ['name', 'code']), [subjects]);
  const subjectGradeOptions = useMemo(() => (
    Array.from(new Set(subjects.map((item) => String(item.grade || '').trim()).filter(Boolean)))
      .sort((left, right) => Number(left) - Number(right))
  ), [subjects]);
  const instructorOptions = useMemo(() => instructors.map((item) => ({ ...item, uiLabel: [item.name, item.email].filter(Boolean).join(' | ') })), [instructors]);
  const studentOptions = useMemo(() => students.map((item) => {
    const value = String(item.value || item.id || item._id || '');
    const gradeLabel = item.grade ? `پایه ${item.grade}` : '';
    const sourceLabel = item.sourceLabel || getStudentCandidateSourceLabel(item.sourceType);
    return {
      ...item,
      value,
      uiLabel: [item.name, gradeLabel, sourceLabel].filter(Boolean).join(' | ')
    };
  }), [students]);
  const candidateGradeOptions = useMemo(() => (
    Array.from(new Set(studentOptions.map((item) => String(item.grade || '').trim()).filter(Boolean)))
      .sort((left, right) => Number(left) - Number(right))
  ), [studentOptions]);
  const selectedEnrollmentCandidate = useMemo(() => (
    studentOptions.find((item) => String(item.value || '') === String(enrollForm.studentId || '')) || null
  ), [studentOptions, enrollForm.studentId]);
  const filteredStudentOptions = useMemo(() => {
    const needle = String(candidateSearchQuery || '').trim().toLowerCase();
    
    // Do not show all students by default. Only show results if a search query or filter is applied.
    if (!needle && !candidateSourceFilter && !candidateGradeFilter) {
      return [];
    }

    return studentOptions.filter((item) => {
      const matchesQuery = !needle || [
        item.name,
        item.phone,
        item.nationalId,
        item.uiLabel,
        item.sourceLabel,
        item.grade
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesSource = !candidateSourceFilter || String(item.sourceType || '') === String(candidateSourceFilter);
      const matchesGrade = !candidateGradeFilter || String(item.grade || '') === String(candidateGradeFilter);
      return matchesQuery && matchesSource && matchesGrade;
    });
  }, [studentOptions, candidateSearchQuery, candidateSourceFilter, candidateGradeFilter]);
  const enrollmentSelectOptions = useMemo(() => {
    if (!selectedEnrollmentCandidate) return filteredStudentOptions;
    const alreadyIncluded = filteredStudentOptions.some((item) => String(item.value || '') === String(selectedEnrollmentCandidate.value || ''));
    return alreadyIncluded ? filteredStudentOptions : [selectedEnrollmentCandidate, ...filteredStudentOptions];
  }, [filteredStudentOptions, selectedEnrollmentCandidate]);
  const visibleEnrollmentCandidates = useMemo(() => (
    showAllEnrollmentCandidates
      ? enrollmentSelectOptions
      : enrollmentSelectOptions.slice(0, ENROLLMENT_CANDIDATE_VISIBLE_LIMIT)
  ), [enrollmentSelectOptions, showAllEnrollmentCandidates]);
  const filteredOnlineRegistrationQueue = useMemo(() => {
    const needle = String(onlineSearchQuery || '').trim().toLowerCase();
    
    // Do not show any online registrations by default.
    // Only show them if the user searches for something.
    if (!needle) {
      return [];
    }

    return onlineRegistrationQueue.filter((item) => {
      return [
        item.name,
        item.phone,
        item.nationalId,
        item.grade,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [onlineRegistrationQueue, onlineSearchQuery]);

  const visibleOnlineRegistrationQueue = useMemo(() => (
    filteredOnlineRegistrationQueue.slice(0, ONLINE_REGISTRATION_VISIBLE_LIMIT)
  ), [filteredOnlineRegistrationQueue]);
  const activeYear = useMemo(() => years.find((item) => item.isActive) || null, [years]);
  const selectedTermYear = useMemo(() => (
    years.find((item) => String(asId(item)) === String(selectedTermYearId)) || activeYear || years[0] || null
  ), [activeYear, selectedTermYearId, years]);
  const sortedAcademicTerms = useMemo(() => (
    [...academicTerms].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
  ), [academicTerms]);
  const filteredYears = useMemo(() => {
    const needle = String(yearSearchQuery || '').trim();
    if (!needle) return years;
    return years.filter((item) => (
      [item.title, item.startDate, item.endDate, item.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle.toLowerCase()))
    ));
  }, [years, yearSearchQuery]);
  const visibleYears = useMemo(() => (
    showAllYears ? filteredYears : filteredYears.slice(0, YEAR_REGISTRY_VISIBLE_LIMIT)
  ), [filteredYears, showAllYears]);
  const filteredClasses = useMemo(() => {
    const needle = String(classSearchQuery || '').trim().toLowerCase();
    if (!needle) return schoolClasses;
    return schoolClasses.filter((item) => (
      [
        item.title,
        item.code,
        item.gradeLevel,
        item.section,
        item.academicYear?.title,
        item.shift,
        item.room,
        item.note
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    ));
  }, [schoolClasses, classSearchQuery]);
  const visibleClasses = useMemo(() => (
    showAllClasses ? filteredClasses : filteredClasses.slice(0, CLASS_REGISTRY_VISIBLE_LIMIT)
  ), [filteredClasses, showAllClasses]);
  const filteredSubjects = useMemo(() => {
    const needle = String(subjectSearchQuery || '').trim().toLowerCase();
    return subjects.filter((item) => {
      const matchesQuery = !needle || [item.name, item.code, item.grade, item.note]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesGrade = !subjectGradeFilter || String(item.grade || '') === String(subjectGradeFilter);
      const matchesStatus = subjectStatusFilter === 'all'
        ? true
        : subjectStatusFilter === 'active'
          ? !!item.isActive
          : !item.isActive;
      return matchesQuery && matchesGrade && matchesStatus;
    });
  }, [subjects, subjectSearchQuery, subjectGradeFilter, subjectStatusFilter]);
  const visibleSubjects = useMemo(() => (
    showAllSubjects ? filteredSubjects : filteredSubjects.slice(0, SUBJECT_REGISTRY_VISIBLE_LIMIT)
  ), [filteredSubjects, showAllSubjects]);
  const filteredMaps = useMemo(() => {
    const needle = String(mapSearchQuery || '').trim().toLowerCase();
    return maps.filter((item) => {
      const matchesQuery = !needle || [
        item.instructor?.name,
        item.subject?.name,
        item.schoolClass?.title,
        item.course?.title,
        item.academicYear?.title,
        item.note
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const matchesInstructor = !mapInstructorFilter || String(asId(item.instructor)) === String(mapInstructorFilter);
      const mapYearId = asId(item.academicYear) || asId(item.schoolClass?.academicYearId) || asId(item.schoolClass?.academicYear);
      const matchesYear = !mapYearFilter || String(mapYearId) === String(mapYearFilter);
      const mapClassId = item.classId || asId(item.schoolClass);
      const matchesClass = !mapClassFilter || String(mapClassId) === String(mapClassFilter);
      const matchesPrimary = mapPrimaryFilter === 'all'
        ? true
        : mapPrimaryFilter === 'primary'
          ? !!item.isPrimary
          : !item.isPrimary;
      return matchesQuery && matchesInstructor && matchesYear && matchesClass && matchesPrimary;
    });
  }, [maps, mapSearchQuery, mapInstructorFilter, mapYearFilter, mapClassFilter, mapPrimaryFilter]);
  const visibleMaps = useMemo(() => (
    showAllMaps ? filteredMaps : filteredMaps.slice(0, MAP_REGISTRY_VISIBLE_LIMIT)
  ), [filteredMaps, showAllMaps]);
  const filteredEnrollments = useMemo(() => {
    const needle = String(enrollSearchQuery || '').trim().toLowerCase();
    return enrollments.filter((item) => {
      const yearTitle = item.schoolClass?.academicYear?.title || '';
      const matchesQuery = !needle || [
        item.user?.name,
        item.schoolClass?.title,
        item.course?.title,
        getEnrollmentStatusLabel(item.status),
        item.note,
        item.rejectedReason,
        yearTitle
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
      const enrollmentClassId = item.classId || asId(item.schoolClass);
      const enrollmentYearId = asId(item.schoolClass?.academicYearId) || asId(item.schoolClass?.academicYear);
      const matchesClass = !enrollClassFilter || String(enrollmentClassId) === String(enrollClassFilter);
      const matchesYear = !enrollYearFilter || String(enrollmentYearId) === String(enrollYearFilter);
      const matchesStatus = !enrollFilter || String(item.status || '') === String(enrollFilter);
      return matchesQuery && matchesClass && matchesYear && matchesStatus;
    });
  }, [enrollments, enrollSearchQuery, enrollClassFilter, enrollYearFilter, enrollFilter]);
  const visibleEnrollments = useMemo(() => (
    showAllEnrollments ? filteredEnrollments : filteredEnrollments.slice(0, ENROLLMENT_REGISTRY_VISIBLE_LIMIT)
  ), [filteredEnrollments, showAllEnrollments]);

  const pendingEnrollments = enrollments.filter((item) => item.status === 'pending').length;
  const pendingOnlineRegistrations = onlineRegistrationQueue.filter((item) => item.status === 'pending').length;
  const legacySyncedClasses = schoolClasses.filter((item) => item.legacyCourseId).length;
  const primaryAssignments = maps.filter((item) => item.isPrimary).length;

  const sectionCounts = useMemo(() => ({
    overview: 'مرکز',
    years: `${years.length.toLocaleString('fa-AF-u-ca-persian')} رکورد`,
    classes: `${schoolClasses.length.toLocaleString('fa-AF-u-ca-persian')} رکورد`,
    subjects: `${subjects.length.toLocaleString('fa-AF-u-ca-persian')} رکورد`,
    maps: `${maps.length.toLocaleString('fa-AF-u-ca-persian')} رکورد`,
    enrollments: canManageMemberships ? `${enrollments.length.toLocaleString('fa-AF-u-ca-persian')} رکورد` : 'نیازمند مجوز'
  }), [years.length, schoolClasses.length, subjects.length, maps.length, enrollments.length, canManageMemberships]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadClassForEdit = (item) => {
    if (!item) return;
    setClassForm({
      id: item.id || item._id,
      title: item.title || '',
      code: item.code || '',
      gradeLevel: String(item.gradeLevel || inferGradeFromClassInput(item.code, item.title) || ''),
      section: normalizeClassSection(item.section, item.code, item.title),
      academicYearId: asId(item.academicYearId),
      shift: item.shift || 'morning',
      room: item.room || '',
      status: item.status || 'active',
      note: item.note || ''
    });
  };

  const loadSubjectForEdit = (item) => {
    if (!item) return;
    setSubjectForm({
      id: item._id || item.id,
      name: item.name || '',
      code: item.code || '',
      grade: item.grade || '',
      note: item.note || '',
      isActive: !!item.isActive
    });
  };

  const loadTermForEdit = (item) => {
    if (!item) return;
    const academicYearId = asId(item.academicYearId) || selectedTermYearId || '';
    setSelectedTermYearId(academicYearId);
    setTermForm({
      id: item._id || item.id,
      academicYearId,
      title: item.title || '',
      code: item.code || '',
      order: Number(item.order || 1),
      type: item.type || 'term',
      startDate: normalizeDateInputValue(item.startDate),
      endDate: normalizeDateInputValue(item.endDate),
      note: item.note || ''
    });
  };

  const loadMapForEdit = (item) => {
    if (!item) return;
    setMapForm({
      id: item._id,
      instructorId: asId(item.instructor),
      subjectId: asId(item.subject),
      academicYearId: asId(item.academicYear) || asId(item.schoolClass?.academicYearId) || asId(item.schoolClass?.academicYear),
      classId: item.classId || asId(item.schoolClass),
      note: item.note || '',
      isPrimary: !!item.isPrimary
    });
  };

  const loadEnrollmentForEdit = (item) => {
    if (!item) return;
    setEnrollForm({
      id: item._id,
      studentId: asId(item.user),
      classId: item.classId || asId(item.schoolClass),
      status: item.status || 'approved',
      note: item.note || '',
      rejectedReason: item.rejectedReason || ''
    });
  };

  const loadEnrollmentCandidate = (item) => {
    if (!item) return;
    const sourceRef = item.sourceRef || item.value || item.id || item._id || '';
    setActiveSection('enrollments');
    setEnrollForm({
      id: '',
      studentId: String(sourceRef),
      classId: '',
      status: item.status === 'approved' ? 'approved' : 'pending',
      note: item.note || '',
      rejectedReason: ''
    });
    showMessage(`متعلم "${item.name || 'نامشخص'}" برای معرفی به صنف در فرم بارگذاری شد.`, 'info');
  };

  const focusExistingYearForEdit = (item, infoMessage = '') => {
    if (!item) return false;
    const title = item.title || '';
    setYears((current) => {
      const exists = current.some((entry) => asId(entry) === asId(item));
      if (exists) return current;
      return [item, ...current];
    });
    setActiveSection('years');
    setSelectedTermYearId(asId(item));
    setShowAllYears(true);
    setYearSearchInput(title);
    setYearSearchQuery(title);
    setYearForm({
      id: asId(item),
      title,
      startDate: item.startDate ? String(item.startDate).slice(0, 10) : '',
      endDate: item.endDate ? String(item.endDate).slice(0, 10) : '',
      note: item.note || '',
      isActive: !!item.isActive
    });
    if (infoMessage) showMessage(infoMessage, 'info');
    return true;
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [classData, subjectData, yearData, metaData, mapData, enrollData] = await Promise.all([
        fetchJson('/api/education/school-classes'),
        fetchJson('/api/education/subjects'),
        fetchJson('/api/education/academic-years'),
        fetchJson('/api/education/meta'),
        fetchJson('/api/education/instructor-subjects'),
        canManageMemberships
          ? fetchJson(`/api/education/student-enrollments${enrollFilter ? `?status=${encodeURIComponent(enrollFilter)}` : ''}`)
          : Promise.resolve({ items: [] })
      ]);

      setSchoolClasses(classData.items || []);
      setSubjects(subjectData.items || []);
      setYears(yearData.items || []);
      setInstructors(metaData.instructors || []);
      setStudents(metaData.studentCandidates || metaData.students || []);
      setOnlineRegistrationQueue(metaData.onlineRegistrationQueue || []);
      setMaps(mapData.items || []);
      setEnrollments(enrollData.items || []);
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت داده‌های هسته آموزشی ناموفق بود.'), 'error');
    } finally {
      setLoading(false);
      setBusyAction('');
    }
  };

  const loadTermsForYear = async (yearId) => {
    const normalizedYearId = String(yearId || '').trim();
    if (!normalizedYearId) {
      setAcademicTerms([]);
      return;
    }

    setTermsLoading(true);
    try {
      const data = await fetchJson(`/api/academic-terms/academic-year/${normalizedYearId}?limit=100`);
      setAcademicTerms(data.data || []);
    } catch (error) {
      setAcademicTerms([]);
      showMessage(errorMessage(error, 'دریافت دوره‌های سال تعلیمی ناموفق بود.'), 'error');
    } finally {
      setTermsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [enrollFilter, canManageMemberships]);

  useEffect(() => {
    if (!visibleEducationSections.some((item) => item.key === activeSection)) {
      setActiveSection(visibleEducationSections[0]?.key || 'enrollments');
    }
  }, [activeSection, visibleEducationSections]);

  useEffect(() => {
    if (!years.length) {
      setSelectedTermYearId('');
      setAcademicTerms([]);
      return;
    }

    setSelectedTermYearId((current) => {
      if (current && years.some((item) => String(asId(item)) === String(current))) return current;
      return asId(activeYear || years[0]);
    });
  }, [activeYear, years]);

  useEffect(() => {
    if (!selectedTermYearId) {
      setTermForm(emptyTerm);
      setAcademicTerms([]);
      return;
    }

    setTermForm({ ...emptyTerm, academicYearId: selectedTermYearId });
    loadTermsForYear(selectedTermYearId);
  }, [selectedTermYearId]);

  useEffect(() => {
    setShowAllYears(false);
  }, [yearSearchQuery]);

  useEffect(() => {
    setShowAllClasses(false);
  }, [classSearchQuery]);

  useEffect(() => {
    setShowAllSubjects(false);
  }, [subjectSearchQuery, subjectGradeFilter, subjectStatusFilter]);

  useEffect(() => {
    setShowAllMaps(false);
  }, [mapSearchQuery, mapInstructorFilter, mapYearFilter, mapClassFilter, mapPrimaryFilter]);

  useEffect(() => {
    setShowAllEnrollmentCandidates(false);
  }, [candidateSearchQuery, candidateSourceFilter, candidateGradeFilter]);

  useEffect(() => {
    setShowAllEnrollments(false);
  }, [enrollSearchQuery, enrollYearFilter, enrollClassFilter, enrollFilter]);

  useEffect(() => {
    if (!pendingEnrollmentCandidateRef) return;
    const normalizedRef = String(pendingEnrollmentCandidateRef || '').trim();
    if (!normalizedRef) return;
    const candidate = [...onlineRegistrationQueue, ...students].find((item) => (
      String(item.sourceRef || item.value || item._id || item.id || '') === normalizedRef
    ));
    if (!candidate) return;
    loadEnrollmentCandidate(candidate);
    setPendingEnrollmentCandidateRef('');
    try {
      const params = new URLSearchParams(window.location.search || '');
      params.delete('candidate');
      if (params.get('section') === 'enrollments') params.delete('section');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // نداشتن replaceState نباید مانع کار صفحه شود.
    }
  }, [pendingEnrollmentCandidateRef, onlineRegistrationQueue, students]);

  const saveClass = async () => {
    try {
      setBusyAction('class');
      const normalizedGradeLevel = inferGradeFromClassInput(classForm.gradeLevel, classForm.code, classForm.title);
      if (!normalizedGradeLevel) {
        showMessage('پایه صنف را مشخص کنید یا در کد صنف به‌صورت درست وارد نمایید.', 'error');
        setBusyAction('');
        return;
      }
      const payload = {
        title: classForm.title,
        code: classForm.code,
        gradeLevel: normalizedGradeLevel,
        section: normalizeClassSection(classForm.section, classForm.code, classForm.title),
        academicYearId: classForm.academicYearId,
        shift: classForm.shift,
        room: classForm.room,
        status: classForm.status,
        note: classForm.note
      };
      if (classForm.id) await putJson(`/api/education/school-classes/${classForm.id}`, payload);
      else await postJson('/api/education/school-classes', payload);
      setClassForm(emptyClass);
      showMessage('صنف با موفقیت ذخیره شد.');
      await loadAll();
    } catch (error) {
      showMessage(contextualEducationError(error, 'ذخیره صنف ناموفق بود.', 'class'), 'error');
      setBusyAction('');
    }
  };

  const saveSubject = async () => {
    try {
      setBusyAction('subject');
      const payload = {
        name: subjectForm.name,
        code: subjectForm.code,
        grade: subjectForm.grade,
        note: subjectForm.note,
        isActive: !!subjectForm.isActive
      };
      if (subjectForm.id) await putJson(`/api/education/subjects/${subjectForm.id}`, payload);
      else await postJson('/api/education/subjects', payload);
      setSubjectForm(emptySubject);
      showMessage('مضمون با موفقیت ذخیره شد.');
      await loadAll();
    } catch (error) {
      showMessage(contextualEducationError(error, 'ذخیره مضمون ناموفق بود.', 'subject'), 'error');
      setBusyAction('');
    }
  };

  const toggleSubjectActive = async (item) => {
    try {
      const nextActiveState = !item?.isActive;
      setBusyAction(`subject-toggle:${item._id || item.id}`);
      await putJson(`/api/education/subjects/${item._id || item.id}`, { isActive: nextActiveState });
      showMessage(nextActiveState ? 'مضمون فعال شد.' : 'مضمون غیرفعال شد.');
      if (subjectForm.id && String(subjectForm.id) === String(item._id || item.id)) {
        setSubjectForm((current) => ({ ...current, isActive: nextActiveState }));
      }
      await loadAll();
    } catch (error) {
      showMessage(contextualEducationError(error, 'تغییر وضعیت مضمون ناموفق بود.', 'subject'), 'error');
      setBusyAction('');
    }
  };

  const saveYear = async () => {
    try {
      setBusyAction('year');
      const normalizedTitle = String(yearForm.title || '').trim();
      if (!normalizedTitle) {
        showMessage('عنوان سال تعلیمی الزامی است.', 'error');
        setBusyAction('');
        return;
      }
      let duplicateYear = years.find((item) => (
        normalizeComparableTitle(item.title) === normalizeComparableTitle(normalizedTitle)
        && asId(item) !== String(yearForm.id || '')
      ));
      try {
        const yearData = await fetchJson('/api/education/academic-years');
        const refreshedYears = yearData.items || [];
        setYears(refreshedYears);
        duplicateYear = refreshedYears.find((item) => (
          normalizeComparableTitle(item.title) === normalizeComparableTitle(normalizedTitle)
          && asId(item) !== String(yearForm.id || '')
        )) || duplicateYear;
      } catch {
        // اگر بازخوانی ممکن نشد، از داده فعلی صفحه استفاده می‌کنیم.
      }
      if (duplicateYear) {
        focusExistingYearForEdit(duplicateYear, 'این سال تعلیمی از قبل ثبت شده است و برای ویرایش در فرم بارگذاری شد.');
        setBusyAction('');
        return;
      }
      const payload = {
        title: normalizedTitle,
        startDate: yearForm.startDate,
        endDate: yearForm.endDate,
        note: yearForm.note,
        isActive: !!yearForm.isActive
      };
      const savedYearResponse = yearForm.id
        ? await putJson(`/api/education/academic-years/${yearForm.id}`, payload)
        : await postJson('/api/education/academic-years', payload);
      const savedYear = savedYearResponse?.item || savedYearResponse?.data || null;
      const savedYearId = asId(savedYear) || yearForm.id || '';
      if (savedYearId) setSelectedTermYearId(savedYearId);
      setYearForm(emptyYear);
      resetYearSearch();
      showMessage('سال تعلیمی با موفقیت ذخیره شد.');
      await loadAll();
    } catch (error) {
      const text = contextualEducationError(error, 'ذخیره سال تعلیمی ناموفق بود.', 'year');
      if (focusExistingYearForEdit(error?.data?.existingItem, 'این سال تعلیمی از قبل ثبت شده است و برای ویرایش در فرم بارگذاری شد.')) {
        setBusyAction('');
        return;
      }
      if (text.includes('سال تعلیمی با همین عنوان')) {
        let duplicateYear = years.find((item) => (
          normalizeComparableTitle(item.title) === normalizeComparableTitle(yearForm.title)
          && asId(item) !== String(yearForm.id || '')
        ));
        if (!duplicateYear) {
          try {
            const yearData = await fetchJson('/api/education/academic-years');
            const refreshedYears = yearData.items || [];
            setYears(refreshedYears);
            duplicateYear = refreshedYears.find((item) => (
              normalizeComparableTitle(item.title) === normalizeComparableTitle(yearForm.title)
              && asId(item) !== String(yearForm.id || '')
            ));
          } catch {
            duplicateYear = null;
          }
        }
        if (focusExistingYearForEdit(duplicateYear, 'این سال تعلیمی از قبل ثبت شده است و برای ویرایش در فرم بارگذاری شد.')) {
          setBusyAction('');
          return;
        }
      }
      showMessage(text, 'error');
      setBusyAction('');
    }
  };

  const saveTerm = async () => {
    try {
      const academicYearId = termForm.academicYearId || selectedTermYearId;
      const title = String(termForm.title || '').trim();

      if (!academicYearId) {
        showMessage('برای ثبت دوره، اول سال تعلیمی را انتخاب کنید.', 'error');
        return;
      }
      if (!title) {
        showMessage('عنوان دوره الزامی است.', 'error');
        return;
      }

      setBusyAction('term');
      const payload = {
        academicYearId,
        title,
        name: title,
        code: String(termForm.code || '').trim(),
        order: Number(termForm.order || 1),
        type: termForm.type || 'term',
        startDate: termForm.startDate,
        endDate: termForm.endDate,
        note: termForm.note
      };

      if (termForm.id) {
        await fetchJson(`/api/academic-terms/${termForm.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await postJson('/api/academic-terms', payload);
      }

      setTermForm({ ...emptyTerm, academicYearId });
      showMessage(termForm.id ? 'دوره با موفقیت ویرایش شد.' : 'دوره با موفقیت ایجاد شد.');
      await loadTermsForYear(academicYearId);
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیره دوره ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const activateTerm = async (termId) => {
    if (!termId) return;
    try {
      setBusyAction(`term-activate:${termId}`);
      await postJson(`/api/academic-terms/${termId}/activate`, {});
      showMessage('دوره فعال شد.');
      await loadTermsForYear(selectedTermYearId);
    } catch (error) {
      showMessage(errorMessage(error, 'فعال‌سازی دوره ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const closeTerm = async (termId) => {
    if (!termId) return;
    try {
      setBusyAction(`term-close:${termId}`);
      await postJson(`/api/academic-terms/${termId}/close`, {});
      showMessage('دوره بسته شد.');
      await loadTermsForYear(selectedTermYearId);
    } catch (error) {
      showMessage(errorMessage(error, 'بستن دوره ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteTerm = async (termId) => {
    if (!termId) return;
    if (!window.confirm('آیا از حذف این دوره مطمئن هستید؟')) return;
    try {
      setBusyAction(`term-delete:${termId}`);
      await deleteJson(`/api/academic-terms/${termId}`);
      showMessage('دوره حذف شد.');
      if (termForm.id === termId) setTermForm({ ...emptyTerm, academicYearId: selectedTermYearId });
      await loadTermsForYear(selectedTermYearId);
    } catch (error) {
      showMessage(errorMessage(error, 'حذف دوره ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const createDefaultTerms = async () => {
    if (!selectedTermYearId) {
      showMessage('برای ایجاد خودکار دوره‌ها، اول سال تعلیمی را انتخاب کنید.', 'error');
      return;
    }

    try {
      setBusyAction('term-generate');
      await postJson(`/api/academic-terms/academic-year/${selectedTermYearId}/generate-terms`, { type: 'term' });
      showMessage('دوره‌های پیش‌فرض برای این سال تعلیمی ایجاد شد.');
      await loadTermsForYear(selectedTermYearId);
    } catch (error) {
      showMessage(errorMessage(error, 'ایجاد خودکار دوره‌ها ناموفق بود. اگر دوره موجود است، دوره جدید را دستی اضافه کنید.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const saveMap = async () => {
    try {
      setBusyAction('map');
      const payload = {
        instructorId: mapForm.instructorId,
        subjectId: mapForm.subjectId,
        academicYearId: mapForm.academicYearId,
        classId: mapForm.classId,
        note: mapForm.note,
        isPrimary: !!mapForm.isPrimary
      };
      if (mapForm.id) await putJson(`/api/education/instructor-subjects/${mapForm.id}`, payload);
      else await postJson('/api/education/instructor-subjects', payload);
      setMapForm(emptyMap);
      showMessage('تقسیم مضمون به استاد ذخیره شد.');
      await loadAll();
    } catch (error) {
      showMessage(contextualEducationError(error, 'ذخیره تقسیم مضمون ناموفق بود.', 'map'), 'error');
      setBusyAction('');
    }
  };

  const saveEnrollment = async () => {
    try {
      setBusyAction('enroll');
      const payload = {
        studentId: enrollForm.studentId,
        classId: enrollForm.classId,
        status: enrollForm.status,
        note: enrollForm.note,
        rejectedReason: enrollForm.rejectedReason
      };
      if (enrollForm.id) await putJson(`/api/education/student-enrollments/${enrollForm.id}`, payload);
      else await postJson('/api/education/student-enrollments', payload);
      setEnrollForm(emptyEnroll);
      showMessage('ثبت‌نام متعلم ذخیره شد.');
      await loadAll();
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیره ثبت‌نام متعلم ناموفق بود.'), 'error');
      setBusyAction('');
    }
  };

  const saveInlineEnrollment = async (candidateId, classId) => {
    if (!classId) return showMessage('لطفاً صنف را انتخاب کنید.', 'error');
    try {
      setBusyAction(`enroll-${candidateId}`);
      const payload = {
        studentId: candidateId,
        classId: classId,
        status: 'approved'
      };
      await postJson('/api/education/student-enrollments', payload);
      showMessage('متعلم با موفقیت به صنف معرفی شد.');
      setInlineClasses((prev) => ({ ...prev, [candidateId]: '' }));
      await loadAll();
    } catch (error) {
      showMessage(errorMessage(error, 'معرفی متعلم به صنف ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const saveBulkEnrollments = async () => {
    if (!bulkSelectedIds.length) return showMessage('هیچ متعلمی انتخاب نشده است.', 'error');
    if (!bulkClassId) return showMessage('لطفاً صنف را انتخاب کنید.', 'error');
    try {
      setBusyAction('bulk-enroll');
      const promises = bulkSelectedIds.map((id) =>
        postJson('/api/education/student-enrollments', {
          studentId: id,
          classId: bulkClassId,
          status: 'approved'
        })
      );
      await Promise.all(promises);
      showMessage(`${bulkSelectedIds.length} متعلم به صنف معرفی شدند.`);
      setBulkSelectedIds([]);
      setBulkClassId('');
      await loadAll();
    } catch (error) {
      showMessage(errorMessage(error, 'برخی از معرفی‌ها ناموفق بودند.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const removeItem = async (kind, id) => {
    if (!window.confirm('آیا از حذف این مورد مطمئن هستید؟')) return;
    try {
      setBusyAction(`delete:${kind}`);
      if (kind === 'class') await deleteJson(`/api/education/school-classes/${id}`);
      if (kind === 'subject') await deleteJson(`/api/education/subjects/${id}`);
      if (kind === 'year') await deleteJson(`/api/education/academic-years/${id}`);
      if (kind === 'map') await deleteJson(`/api/education/instructor-subjects/${id}`);
      if (kind === 'enroll') await deleteJson(`/api/education/student-enrollments/${id}`);
      showMessage('رکورد با موفقیت حذف شد.');
      await loadAll();
    } catch (error) {
      showMessage(errorMessage(error, 'حذف رکورد ناموفق بود.'), 'error');
      setBusyAction('');
    }
  };

  const applyYearSearch = () => {
    setYearSearchQuery(yearSearchInput.trim());
  };

  const resetYearSearch = () => {
    setYearSearchInput('');
    setYearSearchQuery('');
  };

  const applyClassSearch = () => {
    setClassSearchQuery(classSearchInput.trim());
  };

  const resetClassSearch = () => {
    setClassSearchInput('');
    setClassSearchQuery('');
  };

  const applySubjectSearch = () => {
    setSubjectSearchQuery(subjectSearchInput.trim());
  };

  const resetSubjectSearch = () => {
    setSubjectSearchInput('');
    setSubjectSearchQuery('');
    setSubjectGradeFilter('');
    setSubjectStatusFilter('all');
  };

  const applyMapSearch = () => {
    setMapSearchQuery(mapSearchInput.trim());
  };

  const resetMapSearch = () => {
    setMapSearchInput('');
    setMapSearchQuery('');
    setMapInstructorFilter('');
    setMapYearFilter('');
    setMapClassFilter('');
    setMapPrimaryFilter('all');
  };

  const applyEnrollmentSearch = () => {
    setEnrollSearchQuery(enrollSearchInput.trim());
  };

  const applyCandidateSearch = () => {
    setCandidateSearchQuery(candidateSearchInput.trim());
  };

  const resetCandidateSearch = () => {
    setCandidateSearchInput('');
    setCandidateSearchQuery('');
    setCandidateSourceFilter('');
    setCandidateGradeFilter('');
  };

  const applyOnlineSearch = () => {
    setOnlineSearchQuery(onlineSearchInput.trim());
  };

  const resetOnlineSearch = () => {
    setOnlineSearchInput('');
    setOnlineSearchQuery('');
  };

  const resetEnrollmentSearch = () => {
    setEnrollSearchInput('');
    setEnrollSearchQuery('');
    setEnrollYearFilter('');
    setEnrollClassFilter('');
    setEnrollFilter('');
  };

  const renderOverview = () => (
    <>
      <article className="admin-workspace-card" data-span="8">
        <div className="admin-education-card-head">
          <div>
            <h2>نمای کلی آموزش</h2>
            <p className="admin-workspace-subtitle">از این بخش، جریان‌های اصلی آموزش را سریع باز کنید و وضعیت هسته آموزشی را یک‌جا ببینید.</p>
          </div>
        </div>

        <div className="admin-workspace-summary">
          <OverviewStat label="سال‌های تعلیمی" value={years.length.toLocaleString('fa-AF-u-ca-persian')} />
          <OverviewStat label="صنف‌های آموزشی" value={schoolClasses.length.toLocaleString('fa-AF-u-ca-persian')} />
          <OverviewStat label="مضمون‌های رسمی" value={subjects.length.toLocaleString('fa-AF-u-ca-persian')} />
          <OverviewStat label="تقسیم‌های فعال" value={maps.length.toLocaleString('fa-AF-u-ca-persian')} />
          <OverviewStat label="ثبت‌نام‌های در انتظار" value={pendingEnrollments.toLocaleString('fa-AF-u-ca-persian')} tone="warn" />
          <OverviewStat label="صنف‌های همگام‌شده" value={legacySyncedClasses.toLocaleString('fa-AF-u-ca-persian')} tone="good" />
        </div>

        <div className="admin-education-quick-grid">
          {EDUCATION_SECTIONS.filter((item) => item.key !== 'overview').map((item) => (
            <button
              key={item.key}
              type="button"
              className="admin-education-quick-card"
              onClick={() => setActiveSection(item.key)}
            >
              <strong>{item.label}</strong>
              <span>{sectionCounts[item.key]}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="admin-workspace-card" data-span="4">
        <h2>آمادگی سیستم</h2>
        <p className="admin-workspace-subtitle">این ستون نشان می‌دهد برای حرکت روان به سمت عملیات مالی، برنامه و گزارش چه چیزهایی آماده است.</p>
        <div className="admin-education-checklist">
          <div className="admin-education-check">
            <strong>سال تعلیمی فعال</strong>
            <span>{activeYear ? activeYear.title : 'هنوز فعال نشده است'}</span>
          </div>
          <div className="admin-education-check">
            <strong>استادان متصل</strong>
            <span>{instructors.length.toLocaleString('fa-AF-u-ca-persian')} نفر</span>
          </div>
          <div className="admin-education-check">
            <strong>متعلمین آماده ثبت‌نام</strong>
            <span>{students.length.toLocaleString('fa-AF-u-ca-persian')} نفر</span>
          </div>
          <div className="admin-education-check">
            <strong>تقسیم‌های اصلی</strong>
            <span>{primaryAssignments.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
          </div>
        </div>
      </article>
    </>
  );

  const renderYears = () => (
    <>
      <article className="admin-workspace-card" data-span="7">
        <h2>سال‌های تعلیمی</h2>
        <p className="admin-workspace-subtitle">سال تعلیمی را بسازید، ویرایش کنید و در صورت نیاز به‌عنوان سال فعال نگه دارید.</p>
        <div className="admin-workspace-form">
          <div className="admin-workspace-field">
            <label>عنوان</label>
            <input value={yearForm.title} onChange={(event) => setYearForm((current) => ({ ...current, title: event.target.value }))} placeholder="1406" />
          </div>
          <div className="admin-workspace-form-grid">
            <div className="admin-workspace-field">
              <label>تاریخ شروع</label>
              <input type="date" value={yearForm.startDate} onChange={(event) => setYearForm((current) => ({ ...current, startDate: event.target.value }))} />
              <small className="admin-workspace-subtitle">
                {yearForm.startDate ? `هجری شمسی: ${formatFaDate(yearForm.startDate)}` : 'نمایش رسمی تاریخ به هجری شمسی بعد از انتخاب نشان داده می‌شود.'}
              </small>
            </div>
            <div className="admin-workspace-field">
              <label>تاریخ ختم</label>
              <input type="date" value={yearForm.endDate} onChange={(event) => setYearForm((current) => ({ ...current, endDate: event.target.value }))} />
              <small className="admin-workspace-subtitle">
                {yearForm.endDate ? `هجری شمسی: ${formatFaDate(yearForm.endDate)}` : 'نمایش رسمی تاریخ به هجری شمسی بعد از انتخاب نشان داده می‌شود.'}
              </small>
            </div>
          </div>
          <div className="admin-workspace-field">
            <label>یادداشت</label>
            <textarea value={yearForm.note} onChange={(event) => setYearForm((current) => ({ ...current, note: event.target.value }))} />
          </div>
          <label className="admin-workspace-field">
            <span>به‌عنوان سال تعلیمی فعال</span>
            <input type="checkbox" checked={!!yearForm.isActive} onChange={(event) => setYearForm((current) => ({ ...current, isActive: event.target.checked }))} />
          </label>
          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button-secondary" onClick={saveYear} disabled={busyAction === 'year'}>
              {busyAction === 'year' ? '...' : yearForm.id ? 'ذخیره سال تعلیمی' : 'ایجاد سال تعلیمی'}
            </button>
            {yearForm.id ? <button type="button" className="admin-workspace-button-ghost" onClick={() => setYearForm(emptyYear)}>انصراف</button> : null}
          </div>
        </div>
      </article>

      <article className="admin-workspace-card" data-span="5">
        <h2>دفتر سال‌ها</h2>
        <p className="admin-workspace-subtitle">روی هر ردیف کلیک کنید تا برای ویرایش داخل فرم بارگذاری شود.</p>
        <div className="admin-education-list-toolbar">
          <div className="admin-education-search-group">
            <input
              value={yearSearchInput}
              onChange={(event) => setYearSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyYearSearch();
                }
              }}
              placeholder="جستجو در عنوان یا تاریخ"
              aria-label="جستجو در دفتر سال‌ها"
            />
            <button type="button" className="admin-workspace-button-ghost" onClick={applyYearSearch}>جستجو</button>
            {yearSearchQuery ? <button type="button" className="admin-workspace-button-ghost" onClick={resetYearSearch}>پاک‌کردن</button> : null}
          </div>
          <span className="admin-workspace-badge muted">{filteredYears.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
        </div>
        <div className="admin-education-list">
          {visibleYears.length ? visibleYears.map((item) => (
            <div key={item._id || item.id} className="admin-education-list-item">
              <button
                type="button"
                className="admin-education-list-main"
                onClick={() => {
                  setSelectedTermYearId(asId(item));
                  setYearForm({
                    id: item._id || item.id,
                    title: item.title || '',
                    startDate: normalizeDateInputValue(item.startDate),
                    endDate: normalizeDateInputValue(item.endDate),
                    note: item.note || '',
                    isActive: !!item.isActive
                  });
                }}
              >
                <strong>{item.title}</strong>
                <span>{formatFaDate(item.startDate)} تا {formatFaDate(item.endDate)}</span>
              </button>
              <div className="admin-education-list-side">
                <span className={`admin-workspace-badge ${item.isActive ? 'good' : 'muted'}`}>{item.isActive ? 'فعال' : 'عادی'}</span>
                <button type="button" className="admin-workspace-button-danger" onClick={() => removeItem('year', item._id || item.id)}>حذف</button>
              </div>
            </div>
          )) : <div className="admin-workspace-empty">{yearSearchQuery ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز سال تعلیمی ثبت نشده است.'}</div>}
        </div>
        {filteredYears.length > YEAR_REGISTRY_VISIBLE_LIMIT ? (
          <div className="admin-education-list-footer">
            <button
              type="button"
              className="admin-workspace-button-ghost"
              onClick={() => setShowAllYears((current) => !current)}
            >
              {showAllYears ? 'نمایش کمتر' : `بیشتر (${(filteredYears.length - YEAR_REGISTRY_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
            </button>
          </div>
        ) : null}
      </article>

      <article className="admin-workspace-card" data-span="12">
        <div className="admin-education-card-head">
          <div>
            <h2>دوره‌های سال تعلیمی</h2>
            <p className="admin-workspace-subtitle">
              دوره‌ها وابسته به سال تعلیمی هستند و در امتحانات، تقسیم اوقات، گزارش‌ها و شقه‌ها استفاده می‌شوند.
            </p>
          </div>
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge info">{selectedTermYear?.title || 'سال انتخاب نشده'}</span>
            <span className="admin-workspace-badge muted">{sortedAcademicTerms.length.toLocaleString('fa-AF-u-ca-persian')} دوره</span>
          </div>
        </div>

        <div className="admin-workspace-form">
          <div className="admin-workspace-form-grid">
            <div className="admin-workspace-field">
              <label>سال تعلیمی مربوطه</label>
              <select value={selectedTermYearId} onChange={(event) => setSelectedTermYearId(event.target.value)}>
                <option value="">انتخاب سال تعلیمی</option>
                {yearOptions.map((item) => (
                  <option key={asId(item)} value={asId(item)}>{item.uiLabel}</option>
                ))}
              </select>
            </div>
            <div className="admin-workspace-field">
              <label>عنوان دوره</label>
              <input value={termForm.title} onChange={(event) => setTermForm((current) => ({ ...current, title: event.target.value }))} placeholder="دوره اول" />
            </div>
            <div className="admin-workspace-field">
              <label>کد دوره</label>
              <input value={termForm.code} onChange={(event) => setTermForm((current) => ({ ...current, code: event.target.value }))} placeholder="T1" />
            </div>
            <div className="admin-workspace-field">
              <label>ترتیب</label>
              <input type="number" min="1" value={termForm.order} onChange={(event) => setTermForm((current) => ({ ...current, order: event.target.value }))} />
            </div>
            <div className="admin-workspace-field">
              <label>نوع</label>
              <select value={termForm.type} onChange={(event) => setTermForm((current) => ({ ...current, type: event.target.value }))}>
                {TERM_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div className="admin-workspace-field">
              <label>تاریخ شروع</label>
              <input type="date" value={termForm.startDate} onChange={(event) => setTermForm((current) => ({ ...current, startDate: event.target.value }))} />
              <small className="admin-workspace-subtitle">{termForm.startDate ? `هجری شمسی: ${formatFaDate(termForm.startDate)}` : 'اختیاری'}</small>
            </div>
            <div className="admin-workspace-field">
              <label>تاریخ ختم</label>
              <input type="date" value={termForm.endDate} onChange={(event) => setTermForm((current) => ({ ...current, endDate: event.target.value }))} />
              <small className="admin-workspace-subtitle">{termForm.endDate ? `هجری شمسی: ${formatFaDate(termForm.endDate)}` : 'اختیاری'}</small>
            </div>
            <div className="admin-workspace-field">
              <label>یادداشت</label>
              <input value={termForm.note} onChange={(event) => setTermForm((current) => ({ ...current, note: event.target.value }))} placeholder="اختیاری" />
            </div>
          </div>

          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button" onClick={saveTerm} disabled={busyAction === 'term' || !selectedTermYearId}>
              {busyAction === 'term' ? '...' : termForm.id ? 'ذخیره دوره' : 'ایجاد دوره'}
            </button>
            <button type="button" className="admin-workspace-button-secondary" onClick={createDefaultTerms} disabled={busyAction === 'term-generate' || !selectedTermYearId || sortedAcademicTerms.length > 0}>
              ایجاد خودکار دوره‌ها
            </button>
            {termForm.id ? (
              <button type="button" className="admin-workspace-button-ghost" onClick={() => setTermForm({ ...emptyTerm, academicYearId: selectedTermYearId })}>
                انصراف
              </button>
            ) : null}
          </div>
        </div>

        <div className="admin-education-list admin-education-term-list">
          {termsLoading ? (
            <div className="admin-workspace-empty">در حال دریافت دوره‌ها...</div>
          ) : sortedAcademicTerms.length ? sortedAcademicTerms.map((term) => (
            <div key={term._id || term.id} className="admin-education-list-item">
              <button type="button" className="admin-education-list-main" onClick={() => loadTermForEdit(term)}>
                <strong>{term.title || term.name}</strong>
                <span>
                  {[term.code, getTermTypeLabel(term.type), `${formatFaDate(term.startDate)} تا ${formatFaDate(term.endDate)}`].filter(Boolean).join(' | ')}
                </span>
              </button>
              <div className="admin-education-list-side">
                <span className={`admin-workspace-badge ${term.isActive ? 'good' : term.status === 'closed' ? 'muted' : 'info'}`}>
                  {term.isActive ? 'فعال' : getTermStatusLabel(term.status)}
                </span>
                {!term.isActive ? (
                  <button type="button" className="admin-workspace-button-ghost" onClick={() => activateTerm(term._id || term.id)} disabled={busyAction === `term-activate:${term._id || term.id}`}>
                    فعال‌سازی
                  </button>
                ) : (
                  <button type="button" className="admin-workspace-button-ghost" onClick={() => closeTerm(term._id || term.id)} disabled={busyAction === `term-close:${term._id || term.id}`}>
                    بستن
                  </button>
                )}
                <button type="button" className="admin-workspace-button-danger" onClick={() => deleteTerm(term._id || term.id)} disabled={busyAction === `term-delete:${term._id || term.id}`}>
                  حذف
                </button>
              </div>
            </div>
          )) : (
            <div className="admin-workspace-empty">
              {selectedTermYearId ? 'برای این سال تعلیمی هنوز دوره ثبت نشده است.' : 'اول یک سال تعلیمی را انتخاب کنید.'}
            </div>
          )}
        </div>
      </article>
    </>
  );

  const renderClasses = () => (
    <>
      <article className="admin-workspace-card" data-span="5">
        <h2>صنف‌ها</h2>
        <p className="admin-workspace-subtitle">صنف را به‌صورت class-first بسازید تا بقیه ماژول‌ها روی همین مرجع کار کنند.</p>
        <div className="admin-workspace-form">
          <div className="admin-workspace-form-grid">
            <div className="admin-workspace-field"><label>عنوان صنف</label><input value={classForm.title} onChange={(event) => setClassForm((current) => ({ ...current, title: event.target.value }))} placeholder="صنف دهم الف" /></div>
            <div className="admin-workspace-field"><label>کد</label><input value={classForm.code} onChange={(event) => setClassForm((current) => ({ ...current, code: event.target.value }))} placeholder="10A" /></div>
            <div className="admin-workspace-field"><label>پایه</label><input type="number" min="1" max="12" value={classForm.gradeLevel} onChange={(event) => setClassForm((current) => ({ ...current, gradeLevel: event.target.value }))} /></div>
            <div className="admin-workspace-field"><label>بخش</label><select value={classForm.section} onChange={(event) => setClassForm((current) => ({ ...current, section: event.target.value }))}>{SECTION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div className="admin-workspace-field"><label>سال تعلیمی</label><select value={classForm.academicYearId} onChange={(event) => setClassForm((current) => ({ ...current, academicYearId: event.target.value }))}><option value="">انتخاب سال</option>{yearOptions.map((item) => <option key={asId(item)} value={asId(item)}>{item.uiLabel}</option>)}</select></div>
            <div className="admin-workspace-field"><label>شیفت</label><select value={classForm.shift} onChange={(event) => setClassForm((current) => ({ ...current, shift: event.target.value }))}>{SHIFT_OPTIONS.map((item) => <option key={item.value || 'none'} value={item.value}>{item.label}</option>)}</select></div>
            <div className="admin-workspace-field"><label>اتاق</label><input value={classForm.room} onChange={(event) => setClassForm((current) => ({ ...current, room: event.target.value }))} /></div>
            <div className="admin-workspace-field"><label>وضعیت</label><select value={classForm.status} onChange={(event) => setClassForm((current) => ({ ...current, status: event.target.value }))}>{CLASS_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          </div>
          <div className="admin-workspace-field"><label>یادداشت</label><textarea value={classForm.note} onChange={(event) => setClassForm((current) => ({ ...current, note: event.target.value }))} /></div>
          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button" onClick={saveClass} disabled={busyAction === 'class'}>{busyAction === 'class' ? '...' : classForm.id ? 'ذخیره صنف' : 'ایجاد صنف'}</button>
            {classForm.id ? <button type="button" className="admin-workspace-button-ghost" onClick={() => setClassForm(emptyClass)}>انصراف</button> : null}
          </div>
        </div>
      </article>

      <article className="admin-workspace-card" data-span="7">
        <h2>دفتر صنف‌ها</h2>
        <p className="admin-workspace-subtitle">چند صنف را داخل همین چارچوب ببینید، با جستجوی مخصوص صنف مورد نظر را پیدا کنید، و اگر لازم بود بقیه را با دکمه بیشتر باز کنید.</p>
        <div className="admin-education-list-toolbar">
          <div className="admin-education-search-group">
            <input
              value={classSearchInput}
              onChange={(event) => setClassSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyClassSearch();
                }
              }}
              placeholder="جستجو در عنوان، کد، پایه، بخش یا سال تعلیمی"
              aria-label="جستجو در دفتر صنف‌ها"
            />
            <button type="button" className="admin-workspace-button-ghost" onClick={applyClassSearch}>جستجو</button>
            {classSearchQuery ? <button type="button" className="admin-workspace-button-ghost" onClick={resetClassSearch}>پاک‌کردن</button> : null}
          </div>
          <span className="admin-workspace-badge muted">{filteredClasses.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
        </div>
        <div className="admin-education-list">
          {visibleClasses.length ? visibleClasses.map((item) => (
            <div key={item.id || item._id} className="admin-education-list-item">
              <button
                type="button"
                className="admin-education-list-main"
                onClick={() => loadClassForEdit(item)}
              >
                <strong>{item.title}</strong>
                <span>{item.code || '---'} | پایه {item.gradeLevel || '---'} | {item.section || 'بدون بخش'}</span>
                <span>{item.academicYear?.title || 'بدون سال تعلیمی'} | {SHIFT_OPTIONS.find((entry) => entry.value === item.shift)?.label || 'شیفت نامشخص'}</span>
              </button>
              <div className="admin-education-list-side">
                <span className={`admin-workspace-badge ${item.legacyCourseId ? 'info' : 'muted'}`}>{item.legacyCourseId ? 'همگام شده' : 'در انتظار'}</span>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => loadClassForEdit(item)}>ویرایش</button>
                <button type="button" className="admin-workspace-button-danger" onClick={() => removeItem('class', item.id || item._id)}>حذف</button>
              </div>
            </div>
          )) : <div className="admin-workspace-empty">{classSearchQuery ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز صنفی ثبت نشده است.'}</div>}
        </div>
        {filteredClasses.length > CLASS_REGISTRY_VISIBLE_LIMIT ? (
          <div className="admin-education-list-footer">
            <button
              type="button"
              className="admin-workspace-button-ghost"
              onClick={() => setShowAllClasses((current) => !current)}
            >
              {showAllClasses ? 'نمایش کمتر' : `بیشتر (${(filteredClasses.length - CLASS_REGISTRY_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
            </button>
          </div>
        ) : null}
      </article>
    </>
  );

  const renderSubjects = () => (
    <>
      <article className="admin-workspace-card" data-span="4">
        <h2>مضمون‌ها</h2>
        <p className="admin-workspace-subtitle">فهرست رسمی مضمون‌ها را اینجا ثبت و ویرایش کنید.</p>
        <div className="admin-workspace-form">
          <div className="admin-workspace-field"><label>نام مضمون</label><input value={subjectForm.name} onChange={(event) => setSubjectForm((current) => ({ ...current, name: event.target.value }))} /></div>
          <div className="admin-workspace-field"><label>کد</label><input value={subjectForm.code} onChange={(event) => setSubjectForm((current) => ({ ...current, code: event.target.value }))} /></div>
          <div className="admin-workspace-field"><label>پایه</label><input value={subjectForm.grade} onChange={(event) => setSubjectForm((current) => ({ ...current, grade: event.target.value }))} /></div>
          <div className="admin-workspace-field"><label>یادداشت</label><textarea value={subjectForm.note} onChange={(event) => setSubjectForm((current) => ({ ...current, note: event.target.value }))} /></div>
          <label className="admin-workspace-field"><span>فعال باشد</span><input type="checkbox" checked={!!subjectForm.isActive} onChange={(event) => setSubjectForm((current) => ({ ...current, isActive: event.target.checked }))} /></label>
          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button-secondary" onClick={saveSubject} disabled={busyAction === 'subject'}>{busyAction === 'subject' ? '...' : subjectForm.id ? 'ذخیره مضمون' : 'ایجاد مضمون'}</button>
            {subjectForm.id ? <button type="button" className="admin-workspace-button-ghost" onClick={() => setSubjectForm(emptySubject)}>انصراف</button> : null}
          </div>
        </div>
      </article>

      <article className="admin-workspace-card" data-span="8">
        <h2>فهرست مضمون‌ها</h2>
        <p className="admin-workspace-subtitle">مضمون‌ها را با جستجو، فیلتر پایه و وضعیت پیدا کنید و اگر لازم بود بقیه را با دکمه بیشتر ببینید.</p>
        <div className="admin-education-list-toolbar">
          <div className="admin-education-search-group">
            <input
              value={subjectSearchInput}
              onChange={(event) => setSubjectSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applySubjectSearch();
                }
              }}
              placeholder="جستجو در نام، کد یا یادداشت مضمون"
              aria-label="جستجو در فهرست مضمون‌ها"
            />
            <select value={subjectGradeFilter} onChange={(event) => setSubjectGradeFilter(event.target.value)} aria-label="فیلتر پایه مضمون">
              <option value="">همه پایه‌ها</option>
              {subjectGradeOptions.map((item) => <option key={item} value={item}>پایه {item}</option>)}
            </select>
            <select value={subjectStatusFilter} onChange={(event) => setSubjectStatusFilter(event.target.value)} aria-label="فیلتر وضعیت مضمون">
              <option value="all">همه وضعیت‌ها</option>
              <option value="active">فقط فعال</option>
              <option value="inactive">فقط غیرفعال</option>
            </select>
            <button type="button" className="admin-workspace-button-ghost" onClick={applySubjectSearch}>جستجو</button>
            {(subjectSearchQuery || subjectGradeFilter || subjectStatusFilter !== 'all') ? (
              <button type="button" className="admin-workspace-button-ghost" onClick={resetSubjectSearch}>پاک‌کردن</button>
            ) : null}
          </div>
          <span className="admin-workspace-badge muted">{filteredSubjects.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
        </div>
        <div className="admin-education-list">
          {visibleSubjects.length ? visibleSubjects.map((item) => {
            const itemId = item._id || item.id;
            const toggleBusy = busyAction === `subject-toggle:${itemId}`;
            return (
              <div key={itemId} className="admin-education-list-item">
                <button
                  type="button"
                  className="admin-education-list-main"
                  onClick={() => loadSubjectForEdit(item)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.code || 'بدون کد'} | پایه {item.grade || '---'}</span>
                  <span>{item.note || 'بدون یادداشت'} </span>
                </button>
                <div className="admin-education-list-side">
                  <span className={`admin-workspace-badge ${item.isActive ? 'good' : 'muted'}`}>{item.isActive ? 'فعال' : 'غیرفعال'}</span>
                  <button
                    type="button"
                    className="admin-workspace-button-ghost"
                    onClick={() => loadSubjectForEdit(item)}
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className="admin-workspace-button-secondary"
                    onClick={() => toggleSubjectActive(item)}
                    disabled={toggleBusy}
                  >
                    {toggleBusy ? '...' : item.isActive ? 'غیرفعال' : 'فعال‌سازی'}
                  </button>
                  <button
                    type="button"
                    className="admin-workspace-button-danger"
                    onClick={() => removeItem('subject', itemId)}
                    disabled={busyAction === 'delete:subject'}
                  >
                    حذف
                  </button>
                </div>
              </div>
            );
          }) : <div className="admin-workspace-empty">{(subjectSearchQuery || subjectGradeFilter || subjectStatusFilter !== 'all') ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز مضمونی ثبت نشده است.'}</div>}
        </div>
        {filteredSubjects.length > SUBJECT_REGISTRY_VISIBLE_LIMIT ? (
          <div className="admin-education-list-footer">
            <button
              type="button"
              className="admin-workspace-button-ghost"
              onClick={() => setShowAllSubjects((current) => !current)}
            >
              {showAllSubjects ? 'نمایش کمتر' : `بیشتر (${(filteredSubjects.length - SUBJECT_REGISTRY_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
            </button>
          </div>
        ) : null}
      </article>
    </>
  );

  const renderMaps = () => (
    <>
      <article className="admin-workspace-card" data-span="5">
        <h2>تقسیم مضمون به استاد</h2>
        <p className="admin-workspace-subtitle">اتصال استاد، مضمون، سال تعلیمی و صنف را از همین بخش مدیریت کنید.</p>
        <div className="admin-workspace-form">
          <div className="admin-workspace-form-grid">
            <div className="admin-workspace-field"><label>استاد</label><select value={mapForm.instructorId} onChange={(event) => setMapForm((current) => ({ ...current, instructorId: event.target.value }))}><option value="">انتخاب استاد</option>{instructorOptions.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.uiLabel}</option>)}</select></div>
            <div className="admin-workspace-field"><label>مضمون</label><select value={mapForm.subjectId} onChange={(event) => setMapForm((current) => ({ ...current, subjectId: event.target.value }))}><option value="">انتخاب مضمون</option>{subjectOptions.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.uiLabel}</option>)}</select></div>
            <div className="admin-workspace-field"><label>سال تعلیمی</label><select value={mapForm.academicYearId} onChange={(event) => setMapForm((current) => ({ ...current, academicYearId: event.target.value }))}><option value="">انتخاب سال</option>{yearOptions.map((item) => <option key={asId(item)} value={asId(item)}>{item.uiLabel}</option>)}</select></div>
            <div className="admin-workspace-field"><label>صنف</label><select value={mapForm.classId} onChange={(event) => setMapForm((current) => ({ ...current, classId: event.target.value }))}><option value="">انتخاب صنف</option>{classOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.uiLabel}</option>)}</select></div>
          </div>
          <div className="admin-workspace-field"><label>یادداشت</label><textarea value={mapForm.note} onChange={(event) => setMapForm((current) => ({ ...current, note: event.target.value }))} /></div>
          <label className="admin-workspace-field"><span>استاد اصلی باشد</span><input type="checkbox" checked={!!mapForm.isPrimary} onChange={(event) => setMapForm((current) => ({ ...current, isPrimary: event.target.checked }))} /></label>
          <div className="admin-workspace-actions">
            <button type="button" className="admin-workspace-button" onClick={saveMap} disabled={busyAction === 'map'}>{busyAction === 'map' ? '...' : mapForm.id ? 'ذخیره تقسیم' : 'ایجاد تقسیم'}</button>
            {mapForm.id ? <button type="button" className="admin-workspace-button-ghost" onClick={() => setMapForm(emptyMap)}>انصراف</button> : null}
          </div>
        </div>
      </article>

      <article className="admin-workspace-card" data-span="7">
        <h2>فهرست تقسیم‌ها</h2>
        <p className="admin-workspace-subtitle">تقسیم‌ها را با جستجو و فیلتر استاد، سال، صنف و نوع اصلی پیدا کنید و در صورت نیاز بقیه را با دکمه بیشتر ببینید.</p>
        <div className="admin-education-list-toolbar">
          <div className="admin-education-search-group">
            <input
              value={mapSearchInput}
              onChange={(event) => setMapSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyMapSearch();
                }
              }}
              placeholder="جستجو در استاد، مضمون، صنف یا سال"
              aria-label="جستجو در فهرست تقسیم‌ها"
            />
            <select value={mapInstructorFilter} onChange={(event) => setMapInstructorFilter(event.target.value)} aria-label="فیلتر استاد تقسیم">
              <option value="">همه استادان</option>
              {instructorOptions.map((item) => <option key={item._id || item.id} value={item._id || item.id}>{item.uiLabel}</option>)}
            </select>
            <select value={mapYearFilter} onChange={(event) => setMapYearFilter(event.target.value)} aria-label="فیلتر سال تقسیم">
              <option value="">همه سال‌ها</option>
              {yearOptions.map((item) => <option key={asId(item)} value={asId(item)}>{item.uiLabel}</option>)}
            </select>
            <select value={mapClassFilter} onChange={(event) => setMapClassFilter(event.target.value)} aria-label="فیلتر صنف تقسیم">
              <option value="">همه صنف‌ها</option>
              {classOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.uiLabel}</option>)}
            </select>
            <select value={mapPrimaryFilter} onChange={(event) => setMapPrimaryFilter(event.target.value)} aria-label="فیلتر نوع تقسیم">
              <option value="all">همه نوع‌ها</option>
              <option value="primary">فقط اصلی</option>
              <option value="secondary">فقط کمکی</option>
            </select>
            <button type="button" className="admin-workspace-button-ghost" onClick={applyMapSearch}>جستجو</button>
            {(mapSearchQuery || mapInstructorFilter || mapYearFilter || mapClassFilter || mapPrimaryFilter !== 'all') ? (
              <button type="button" className="admin-workspace-button-ghost" onClick={resetMapSearch}>پاک‌کردن</button>
            ) : null}
          </div>
          <span className="admin-workspace-badge muted">{filteredMaps.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
        </div>
        <div className="admin-education-list">
          {visibleMaps.length ? visibleMaps.map((item) => (
            <div key={item._id} className="admin-education-list-item">
              <button
                type="button"
                className="admin-education-list-main"
                onClick={() => loadMapForEdit(item)}
              >
                <strong>{item.instructor?.name || 'استاد نامشخص'}</strong>
                <span>{item.subject?.name || 'مضمون نامشخص'} | {item.schoolClass?.title || item.course?.title || 'صنف نامشخص'}</span>
                <span>{item.academicYear?.title || item.schoolClass?.academicYear?.title || 'بدون سال تعلیمی'} | {item.isPrimary ? 'استاد اصلی' : 'استاد کمکی'}</span>
              </button>
              <div className="admin-education-list-side">
                <span className={`admin-workspace-badge ${item.isPrimary ? 'good' : 'info'}`}>{item.isPrimary ? 'اصلی' : 'کمکی'}</span>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => loadMapForEdit(item)}>ویرایش</button>
                <button type="button" className="admin-workspace-button-danger" onClick={() => removeItem('map', item._id)}>حذف</button>
              </div>
            </div>
          )) : <div className="admin-workspace-empty">{(mapSearchQuery || mapInstructorFilter || mapYearFilter || mapClassFilter || mapPrimaryFilter !== 'all') ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز تقسیمی ثبت نشده است.'}</div>}
        </div>
        {filteredMaps.length > MAP_REGISTRY_VISIBLE_LIMIT ? (
          <div className="admin-education-list-footer">
            <button
              type="button"
              className="admin-workspace-button-ghost"
              onClick={() => setShowAllMaps((current) => !current)}
            >
              {showAllMaps ? 'نمایش کمتر' : `بیشتر (${(filteredMaps.length - MAP_REGISTRY_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
            </button>
          </div>
        ) : null}
      </article>
    </>
  );

  const renderEnrollments = () => (
    canManageMemberships ? (
      <>
        <article className="admin-workspace-card" data-span={enrollmentMode === 'detailed' ? "8" : "6"}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ marginBottom: '0.25rem' }}>ثبت‌نام متعلمین</h2>
              <p style={{ margin: 0, color: '#000' }}>متعلم ثبت‌شده، ثبت‌نام آنلاین، یا ثبت‌نام دستی را انتخاب کنید و او را به صنف معرفی نمایید.</p>
            </div>
            <div style={{ display: 'flex', gap: '1rem', background: 'var(--color-bg-mute)', padding: '0.5rem 1rem', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#000' }}>
                <input type="radio" checked={enrollmentMode === 'quick'} onChange={() => setEnrollmentMode('quick')} />
                <strong style={{ color: '#000' }}>معرفی سریع (تکی)</strong>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#000' }}>
                <input type="radio" checked={enrollmentMode === 'bulk'} onChange={() => setEnrollmentMode('bulk')} />
                <strong style={{ color: '#000' }}>معرفی دسته‌جمعی</strong>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#000' }}>
                <input type="radio" checked={enrollmentMode === 'detailed'} onChange={() => setEnrollmentMode('detailed')} />
                <strong style={{ color: '#000' }}>معرفی با فرم</strong>
              </label>
            </div>
          </div>
          <div className="admin-education-enrollment-layout" style={enrollmentMode !== 'detailed' ? { gridTemplateColumns: '1fr', display: 'grid' } : {}}>
            <section className="admin-education-enrollment-pane admin-education-enrollment-search-pane">
              <div className="admin-education-enrollment-pane-head">
                <div>
                  <h3>جستجو و انتخاب متعلم</h3>
                  <p>متعلم یا درخواست مناسب را پیدا کنید و برای معرفی به صنف انتخاب نمایید.</p>
                </div>
                <span className="admin-workspace-badge muted">{enrollmentSelectOptions.length.toLocaleString('fa-AF-u-ca-persian')} گزینه</span>
              </div>
              
              {enrollmentMode === 'bulk' ? (
                <div className="admin-workspace-form-grid" style={{ background: 'var(--color-bg-mute)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', alignItems: 'end' }}>
                  <div className="admin-workspace-field">
                    <label>معرفی {bulkSelectedIds.length} متعلم انتخاب‌شده به صنف:</label>
                    <select className="admin-workspace-select" value={bulkClassId} onChange={(e) => setBulkClassId(e.target.value)}>
                      <option value="">-- انتخاب صنف --</option>
                      {classOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.uiLabel}</option>)}
                    </select>
                  </div>
                  <div className="admin-workspace-actions">
                    <button type="button" className="admin-workspace-button primary" onClick={saveBulkEnrollments} disabled={!bulkSelectedIds.length || !bulkClassId || busyAction === 'bulk-enroll'}>
                      {busyAction === 'bulk-enroll' ? 'در حال معرفی...' : 'ثبت دسته‌جمعی'}
                    </button>
                    <button type="button" className="admin-workspace-button-ghost" onClick={() => setBulkSelectedIds([])}>پاک‌کردن انتخاب‌ها</button>
                  </div>
                </div>
              ) : null}

              <div className="admin-education-search-group">
                <input
                  value={candidateSearchInput}
                  onChange={(event) => setCandidateSearchInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyCandidateSearch();
                    }
                  }}
                  placeholder="جستجو در متعلم یا درخواست"
                  aria-label="جستجو در متعلم یا درخواست"
                />
                <select value={candidateSourceFilter} onChange={(event) => setCandidateSourceFilter(event.target.value)} aria-label="فلتر منبع متعلم">
                  <option value="">همه منبع‌ها</option>
                  <option value="user">ثبت‌شده در سیستم</option>
                  <option value="enrollment">ثبت‌نام آنلاین</option>
                  <option value="afghan">ثبت‌نام دستی</option>
                </select>
                <select value={candidateGradeFilter} onChange={(event) => setCandidateGradeFilter(event.target.value)} aria-label="فلتر پایه متعلم">
                  <option value="">همه پایه‌ها</option>
                  {candidateGradeOptions.map((item) => <option key={item} value={item}>{`پایه ${item}`}</option>)}
                </select>
                <button type="button" className="admin-workspace-button-ghost" onClick={applyCandidateSearch}>جستجو</button>
                {(candidateSearchQuery || candidateSourceFilter || candidateGradeFilter) ? (
                  <button type="button" className="admin-workspace-button-ghost" onClick={resetCandidateSearch}>پاک‌کردن</button>
                ) : null}
              </div>
              {enrollmentSelectOptions.length ? (
                <div className="admin-education-candidate-list">
                  {visibleEnrollmentCandidates.map((item) => {
                    const itemId = item.value || item._id || item.id;
                    const isSelected = String(selectedEnrollmentCandidate?.value || '') === String(itemId);
                    const isSelectedBulk = bulkSelectedIds.includes(itemId);
                    return (
                      <article
                        key={itemId}
                        className={`admin-education-candidate-card${isSelected && enrollmentMode === 'detailed' ? ' active' : ''}`}
                        data-role={isSelected && enrollmentMode === 'detailed' ? 'selected-candidate-card' : 'candidate-card'}
                      >
                        {enrollmentMode === 'bulk' && (
                          <input 
                            type="checkbox" 
                            checked={isSelectedBulk} 
                            onChange={(e) => {
                              if (e.target.checked) setBulkSelectedIds(prev => [...prev, itemId]);
                              else setBulkSelectedIds(prev => prev.filter(x => x !== itemId));
                            }} 
                            style={{ margin: '0 0 0 1rem', transform: 'scale(1.5)', cursor: 'pointer' }}
                          />
                        )}
                        <button type="button" className="admin-education-candidate-main" onClick={() => enrollmentMode === 'detailed' ? loadEnrollmentCandidate(item) : (enrollmentMode === 'bulk' ? setBulkSelectedIds(prev => prev.includes(itemId) ? prev.filter(x => x !== itemId) : [...prev, itemId]) : null)} style={{ cursor: enrollmentMode === 'quick' ? 'default' : 'pointer' }}>
                          <strong>{item.name || 'متعلم بی‌نام'}</strong>
                          <span>{[item.grade ? `پایه ${item.grade}` : '', item.phone || '', item.sourceLabel || getStudentCandidateSourceLabel(item.sourceType)].filter(Boolean).join(' | ') || 'بدون مشخصات بیشتر'}</span>
                          {item.createdAt ? <span>{`ثبت: ${formatFaDate(item.createdAt)}`}</span> : null}
                        </button>
                        <div className="admin-education-candidate-side" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {enrollmentMode === 'quick' ? (
                            <>
                              <select 
                                value={inlineClasses[itemId] || ''} 
                                onChange={(e) => setInlineClasses(prev => ({...prev, [itemId]: e.target.value}))}
                                aria-label="انتخاب صنف"
                                className="admin-workspace-select"
                                style={{ minWidth: '120px' }}
                              >
                                <option value="">-- انتخاب صنف --</option>
                                {classOptions.map((c) => <option key={c.id || c._id} value={c.id || c._id}>{c.uiLabel}</option>)}
                              </select>
                              <button 
                                type="button" 
                                className="admin-workspace-button primary" 
                                onClick={() => saveInlineEnrollment(itemId, inlineClasses[itemId])}
                                disabled={busyAction === `enroll-${itemId}`}
                                style={{ padding: '0.4rem 1rem', whiteSpace: 'nowrap' }}
                              >
                                {busyAction === `enroll-${itemId}` ? '...' : 'معرفی'}
                              </button>
                            </>
                          ) : enrollmentMode === 'detailed' ? (
                            <>
                              <span className={`admin-workspace-badge ${isSelected ? 'good' : 'info'}`}>{isSelected ? 'انتخاب شده' : (item.sourceLabel || getStudentCandidateSourceLabel(item.sourceType))}</span>
                              <button type="button" className="admin-workspace-button-ghost" onClick={() => loadEnrollmentCandidate(item)}>
                                {isSelected ? 'در حال معرفی' : 'انتخاب'}
                              </button>
                            </>
                          ) : (
                            <span className="admin-workspace-badge info">{item.sourceLabel || getStudentCandidateSourceLabel(item.sourceType)}</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="admin-workspace-empty">برای این جستجو یا فلتر، متعلمی آماده‌ی معرفی به صنف پیدا نشد.</div>
              )}
              {enrollmentSelectOptions.length > ENROLLMENT_CANDIDATE_VISIBLE_LIMIT ? (
                <div className="admin-education-list-footer">
                  <button
                    type="button"
                    className="admin-workspace-button-ghost"
                    onClick={() => setShowAllEnrollmentCandidates((current) => !current)}
                  >
                    {showAllEnrollmentCandidates ? 'نمایش کمتر' : `بیشتر (${(enrollmentSelectOptions.length - ENROLLMENT_CANDIDATE_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
                  </button>
                </div>
              ) : null}
            </section>

            {enrollmentMode === 'detailed' && (
              <section className="admin-education-enrollment-pane admin-education-enrollment-form-pane">
              <div className="admin-education-enrollment-pane-head">
                <div>
                  <h3>فورم معرفی به صنف</h3>
                  <p>بعد از انتخاب متعلم، صنف، وضعیت و یادداشت را ثبت کنید.</p>
                </div>
                {selectedEnrollmentCandidate ? (
                  <button
                    type="button"
                    className="admin-workspace-button-ghost"
                    onClick={() => setEnrollForm((current) => (
                      current.id
                        ? emptyEnroll
                        : { ...current, studentId: '', classId: '', note: '', rejectedReason: '' }
                    ))}
                  >
                    پاک‌کردن انتخاب
                  </button>
                ) : null}
              </div>
              {selectedEnrollmentCandidate ? (
                <>
                  <div className="admin-education-selected-candidate" data-role="selected-candidate-summary">
                    <strong>{selectedEnrollmentCandidate.name || 'متعلم انتخاب‌شده'}</strong>
                    <div className="admin-workspace-badges">
                      <span className="admin-workspace-badge info">{selectedEnrollmentCandidate.sourceLabel || getStudentCandidateSourceLabel(selectedEnrollmentCandidate.sourceType)}</span>
                      {selectedEnrollmentCandidate.grade ? <span className="admin-workspace-badge muted">{`پایه ${selectedEnrollmentCandidate.grade}`}</span> : null}
                      {selectedEnrollmentCandidate.phone ? <span className="admin-workspace-badge muted">{selectedEnrollmentCandidate.phone}</span> : null}
                    </div>
                  </div>
                  <div className="admin-workspace-form">
                    <div className="admin-workspace-form-grid">
                      <div className="admin-workspace-field"><label>صنف</label><select data-role="enrollment-class-select" value={enrollForm.classId} onChange={(event) => setEnrollForm((current) => ({ ...current, classId: event.target.value }))}><option value="">انتخاب صنف</option>{classOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.uiLabel}</option>)}</select></div>
                      <div className="admin-workspace-field"><label>وضعیت</label><select value={enrollForm.status} onChange={(event) => setEnrollForm((current) => ({ ...current, status: event.target.value }))}>{ENROLLMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
                    </div>
                    <div className="admin-workspace-field"><label>یادداشت</label><textarea value={enrollForm.note} onChange={(event) => setEnrollForm((current) => ({ ...current, note: event.target.value }))} /></div>
                    {enrollForm.status === 'rejected' ? <div className="admin-workspace-field"><label>دلیل رد</label><input value={enrollForm.rejectedReason} onChange={(event) => setEnrollForm((current) => ({ ...current, rejectedReason: event.target.value }))} /></div> : null}
                    <div className="admin-workspace-actions">
                      <button type="button" className="admin-workspace-button" onClick={saveEnrollment} disabled={busyAction === 'enroll'}>{busyAction === 'enroll' ? '...' : enrollForm.id ? 'ذخیره ثبت‌نام' : 'ایجاد ثبت‌نام'}</button>
                      <button type="button" className="admin-workspace-button-ghost" onClick={() => setEnrollForm(emptyEnroll)}>انصراف</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="admin-education-placeholder">
                  <strong>اول متعلم را انتخاب کنید</strong>
                  <span>از پنل روبه‌رو یک متعلم یا درخواست را انتخاب کنید تا فورم معرفی به صنف فعال شود.</span>
                </div>
              )}
            </section>
            )}
          </div>
        </article>

        <article className="admin-workspace-card" data-span="4">
          <h2>صندوق ثبت‌نام آنلاین</h2>
          <p className="admin-workspace-subtitle">درخواست‌های آنلاین را از اینجا برای معرفی به صنف داخل فرم بارگذاری کنید.</p>
          <div className="admin-education-list-toolbar">
            <span className="admin-workspace-badge muted">{onlineRegistrationQueue.length.toLocaleString('fa-AF-u-ca-persian')} درخواست</span>
            <button type="button" className="admin-workspace-button-ghost" onClick={() => window.location.assign('/online-registrations')}>بازکردن ثبت‌نام آنلاین</button>
          </div>
          <div className="admin-education-search-group" style={{ marginBottom: '1rem' }}>
            <input
              value={onlineSearchInput}
              onChange={(event) => setOnlineSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyOnlineSearch();
                }
              }}
              placeholder="جستجو در درخواست‌های آنلاین"
              aria-label="جستجو در درخواست‌های آنلاین"
            />
            <button type="button" className="admin-workspace-button-ghost" onClick={applyOnlineSearch}>جستجو</button>
            {onlineSearchQuery ? (
              <button type="button" className="admin-workspace-button-ghost" onClick={resetOnlineSearch}>پاک‌کردن</button>
            ) : null}
          </div>
          <div className="admin-education-list">
            {visibleOnlineRegistrationQueue.length ? visibleOnlineRegistrationQueue.map((item) => {
              const itemId = item.id || item._id;
              const isSelectedBulk = bulkSelectedIds.includes(itemId);
              return (
              <div key={itemId} className="admin-education-list-item">
                {enrollmentMode === 'bulk' && (
                  <input 
                    type="checkbox" 
                    checked={isSelectedBulk} 
                    onChange={(e) => {
                      if (e.target.checked) setBulkSelectedIds(prev => [...prev, itemId]);
                      else setBulkSelectedIds(prev => prev.filter(x => x !== itemId));
                    }} 
                    style={{ margin: '0 0 0 0.5rem', transform: 'scale(1.2)', cursor: 'pointer' }}
                  />
                )}
                <button type="button" className="admin-education-list-main" onClick={() => enrollmentMode === 'detailed' ? loadEnrollmentCandidate(item) : (enrollmentMode === 'bulk' ? setBulkSelectedIds(prev => prev.includes(itemId) ? prev.filter(x => x !== itemId) : [...prev, itemId]) : null)} style={{ cursor: enrollmentMode === 'quick' ? 'default' : 'pointer' }}>
                  <strong>{item.name || 'درخواست بی‌نام'}</strong>
                  <span>{[item.grade ? `پایه ${item.grade}` : '', item.phone || '', getEnrollmentStatusLabel(item.status)].filter(Boolean).join(' | ') || 'درخواست ثبت‌نام آنلاین'}</span>
                  <span>{item.createdAt ? `ثبت: ${formatFaDate(item.createdAt)}` : 'درخواست ثبت‌نام آنلاین'}</span>
                </button>
                <div className="admin-education-list-side" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {enrollmentMode === 'quick' ? (
                    <>
                      <select 
                        value={inlineClasses[itemId] || ''} 
                        onChange={(e) => setInlineClasses(prev => ({...prev, [itemId]: e.target.value}))}
                        aria-label="انتخاب صنف"
                        className="admin-workspace-select"
                      >
                        <option value="">-- صنف --</option>
                        {classOptions.map((c) => <option key={c.id || c._id} value={c.id || c._id}>{c.uiLabel}</option>)}
                      </select>
                      <button 
                        type="button" 
                        className="admin-workspace-button primary" 
                        onClick={() => saveInlineEnrollment(itemId, inlineClasses[itemId])}
                        disabled={busyAction === `enroll-${itemId}`}
                        style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}
                      >
                        {busyAction === `enroll-${itemId}` ? '...' : 'معرفی'}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`admin-workspace-badge ${item.status === 'approved' ? 'good' : 'info'}`}>{getEnrollmentStatusLabel(item.status)}</span>
                      {enrollmentMode === 'detailed' && (
                        <button type="button" className="admin-workspace-button-ghost" onClick={() => loadEnrollmentCandidate(item)}>معرفی به صنف</button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}) : <div className="admin-workspace-empty">{onlineSearchQuery ? 'برای این جستجو درخواست آنلاینی پیدا نشد.' : 'برای مشاهده درخواست‌های آنلاین جستجو کنید.'}</div>}
          </div>
          {onlineRegistrationQueue.length > ONLINE_REGISTRATION_VISIBLE_LIMIT ? (
            <div className="admin-workspace-subtitle">{`فقط ${ONLINE_REGISTRATION_VISIBLE_LIMIT.toLocaleString('fa-AF-u-ca-persian')} درخواست اول اینجا نشان داده می‌شود.`}</div>
          ) : null}
        </article>

        <article className="admin-workspace-card" data-span="12">
          <h2>دفتر ثبت‌نام‌ها</h2>
          <p className="admin-workspace-subtitle">ثبت‌نام‌ها را با جستجو، فلتر وضعیت، سال و صنف پیدا کنید و در صورت نیاز بقیه را با دکمه بیشتر ببینید.</p>
          <div className="admin-education-list-toolbar">
            <div className="admin-education-search-group">
              <input
                value={enrollSearchInput}
                onChange={(event) => setEnrollSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    applyEnrollmentSearch();
                  }
                }}
                placeholder="جستجو در متعلم، صنف، وضعیت یا یادداشت"
                aria-label="جستجو در دفتر ثبت‌نام‌ها"
              />
              <select value={enrollFilter} onChange={(event) => setEnrollFilter(event.target.value)} aria-label="فیلتر وضعیت ثبت‌نام">
                <option value="">همه وضعیت‌ها</option>
                {ENROLLMENT_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <select value={enrollYearFilter} onChange={(event) => setEnrollYearFilter(event.target.value)} aria-label="فیلتر سال ثبت‌نام">
                <option value="">همه سال‌ها</option>
                {yearOptions.map((item) => <option key={asId(item)} value={asId(item)}>{item.uiLabel}</option>)}
              </select>
              <select value={enrollClassFilter} onChange={(event) => setEnrollClassFilter(event.target.value)} aria-label="فیلتر صنف ثبت‌نام">
                <option value="">همه صنف‌ها</option>
                {classOptions.map((item) => <option key={item.id || item._id} value={item.id || item._id}>{item.uiLabel}</option>)}
              </select>
              <button type="button" className="admin-workspace-button-ghost" onClick={applyEnrollmentSearch}>جستجو</button>
              {(enrollSearchQuery || enrollYearFilter || enrollClassFilter || enrollFilter) ? (
                <button type="button" className="admin-workspace-button-ghost" onClick={resetEnrollmentSearch}>پاک‌کردن</button>
              ) : null}
            </div>
            <span className="admin-workspace-badge muted">{filteredEnrollments.length.toLocaleString('fa-AF-u-ca-persian')} مورد</span>
          </div>
          <div className="admin-workspace-table-wrap">
            <table className="admin-workspace-table">
              <thead><tr><th>متعلم</th><th>صنف</th><th>سال تعلیمی</th><th>وضعیت</th><th>یادداشت</th><th>اقدام</th></tr></thead>
              <tbody>
                {visibleEnrollments.length ? visibleEnrollments.map((item) => (
                  <tr key={item._id}>
                    <td>{item.user?.name || '---'}</td>
                    <td>{item.schoolClass?.title || item.course?.title || '---'}</td>
                    <td>{item.schoolClass?.academicYear?.title || '---'}</td>
                    <td><span className={`admin-workspace-badge ${item.status === 'approved' ? 'good' : item.status === 'rejected' ? 'danger' : 'info'}`}>{getEnrollmentStatusLabel(item.status)}</span></td>
                    <td>{item.note || item.rejectedReason || '---'}</td>
                    <td>
                      <div className="admin-workspace-inline-actions">
                        <button type="button" className="admin-workspace-button-ghost" onClick={() => loadEnrollmentForEdit(item)}>ویرایش</button>
                        <button type="button" className="admin-workspace-button-danger" onClick={() => removeItem('enroll', item._id)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan="6"><div className="admin-workspace-empty">{(enrollSearchQuery || enrollYearFilter || enrollClassFilter || enrollFilter) ? 'نتیجه‌ای برای این جستجو پیدا نشد.' : 'هنوز ثبت‌نامی وجود ندارد.'}</div></td></tr>}
              </tbody>
            </table>
          </div>
          {filteredEnrollments.length > ENROLLMENT_REGISTRY_VISIBLE_LIMIT ? (
            <div className="admin-education-list-footer">
              <button
                type="button"
                className="admin-workspace-button-ghost"
                onClick={() => setShowAllEnrollments((current) => !current)}
              >
                {showAllEnrollments ? 'نمایش کمتر' : `بیشتر (${(filteredEnrollments.length - ENROLLMENT_REGISTRY_VISIBLE_LIMIT).toLocaleString('fa-AF-u-ca-persian')})`}
              </button>
            </div>
          ) : null}
        </article>
      </>
    ) : (
      <article className="admin-workspace-card" data-span="12">
        <h2>ثبت‌نام متعلمین</h2>
        <div className="admin-workspace-empty">برای این بخش مجوز `manage_memberships` لازم است.</div>
      </article>
    )
  );

  const renderSectionContent = () => {
    if (!visibleEducationSections.some((item) => item.key === activeSection)) return renderEnrollments();
    if (activeSection === 'years') return renderYears();
    if (activeSection === 'classes') return renderClasses();
    if (activeSection === 'subjects') return renderSubjects();
    if (activeSection === 'maps') return renderMaps();
    if (activeSection === 'enrollments') return renderEnrollments();
    return renderOverview();
  };

  const renderSidePanel = () => {
    const activeLabel = visibleEducationSections.find((item) => item.key === activeSection)?.label || 'ثبت‌نام متعلمین';
    const notes = {
      overview: [
        'از دکمه‌های بالا برای باز کردن هر بخش استفاده کنید.',
        'اگر می‌خواهید سال مالی بسازید، اول سال تعلیمی را از بخش سال تعلیمی تعریف کنید.',
        'همه جریان‌ها روی classId / SchoolClass متمرکز شده‌اند.'
      ],
      years: [
        'همیشه فقط یک سال تعلیمی را فعال نگه دارید.',
        'تاریخ شروع و ختم را کامل ثبت کنید تا ماژول‌های مالی و گزارش درست کار کنند.'
      ],
      classes: [
        'کد صنف را یکتا و کوتاه نگه دارید.',
        'اگر legacy sync فعال شد، یعنی backend mirror قدیمی را هم ساخته است.'
      ],
      subjects: [
        'کد مضمون را استاندارد نگه دارید تا در schedule و reports یکنواخت بماند.',
        'غیرفعال‌سازی مضمون بهتر از حذف مستقیم است.'
      ],
      maps: [
        'برای هر صنف و مضمون، استاد اصلی را مشخص کنید.',
        'تقسیم‌ها پایه حضور و غیاب، نمره و برنامه درسی هستند.'
      ],
      enrollments: [
        'درخواست‌های ثبت‌نام آنلاین را از همین بخش برای معرفی به صنف بارگذاری کنید.',
        'متعلم ثبت‌شده‌ی دستی نیز از لیست متعلمین candidate قابل انتخاب است.',
        'برای status ردشده، دلیل رد را نیز ثبت کنید.'
      ]
    };

    return (
      <aside className="admin-education-side">
        <article className="admin-workspace-card admin-education-side-card">
          <h3>وضعیت جاری</h3>
          <div className="admin-education-side-list">
            <div><span>بخش فعال</span><strong>{activeLabel}</strong></div>
            <div><span>سال فعال</span><strong>{activeYear?.title || 'تعریف نشده'}</strong></div>
            <div><span>ثبت‌نام در انتظار</span><strong>{pendingEnrollments.toLocaleString('fa-AF-u-ca-persian')}</strong></div>
            <div><span>درخواست آنلاین</span><strong>{pendingOnlineRegistrations.toLocaleString('fa-AF-u-ca-persian')}</strong></div>
            <div><span>استادان آماده</span><strong>{instructors.length.toLocaleString('fa-AF-u-ca-persian')}</strong></div>
          </div>
        </article>

        <article className="admin-workspace-card admin-education-side-card">
          <h3>راهنمای سریع</h3>
          <div className="admin-education-tip-list">
            {(notes[activeSection] || []).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        </article>
      </aside>
    );
  };

  return (
    <div className="admin-workspace-page admin-education-page">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero admin-education-hero">
          <div className="admin-workspace-badges">
            <span className="admin-workspace-badge">هسته آموزشی</span>
            <span className="admin-workspace-badge info">مدیریت پایه</span>
            <span className="admin-workspace-badge good">کلاس‌محور</span>
          </div>
          <h1>مرکز مدیریت آموزش</h1>
          <p>
            سال تعلیمی، دوره، صنف، مضمون، تقسیم مضمون به استاد و ثبت‌نام متعلمین را از یک مرکز واحد مدیریت کنید.
            هر دکمه فقط همان بخش مربوط را باز می‌کند تا صفحه سبک‌تر، واضح‌تر و عملیاتی‌تر بماند.
          </p>
          <div className="admin-workspace-meta">
            <span>سال فعال: {activeYear?.title || 'ندارد'}</span>
            <span>صنف‌های همگام‌شده: {legacySyncedClasses.toLocaleString('fa-AF-u-ca-persian')}</span>
            <span>تقسیم‌های اصلی: {primaryAssignments.toLocaleString('fa-AF-u-ca-persian')}</span>
            <span>ثبت‌نام‌های در انتظار: {pendingEnrollments.toLocaleString('fa-AF-u-ca-persian')}</span>
            <span>درخواست‌های آنلاین: {pendingOnlineRegistrations.toLocaleString('fa-AF-u-ca-persian')}</span>
          </div>
        </section>

        <section className="admin-education-toggle-bar" aria-label="بخش‌های مدیریت آموزش">
          {visibleEducationSections.map((item) => (
            <SectionToggle
              key={item.key}
              label={item.label}
              active={activeSection === item.key}
              count={sectionCounts[item.key]}
              onClick={() => setActiveSection(item.key)}
            />
          ))}
        </section>

        {message ? <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div> : null}
        {loading ? <div className="admin-workspace-empty">در حال بارگذاری داده‌ها...</div> : null}

        {!loading ? (
          <section className="admin-education-layout">
            <div className="admin-workspace-grid admin-education-main">
              {renderSectionContent()}
            </div>
            {renderSidePanel()}
          </section>
        ) : null}
      </div>
    </div>
  );
}
