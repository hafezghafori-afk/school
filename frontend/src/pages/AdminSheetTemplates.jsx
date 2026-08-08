import React, { useEffect, useMemo, useState } from 'react';
import './AdminWorkspace.css';
import AfghanDateInput from '../components/ui/AfghanDateInput';

import {
  downloadBlob,
  errorMessage,
  fetchBlob,
  fetchJson,
  fetchText,
  formatNumber,
  normalizeOptions,
  openHtmlDocument,
  postJson,
  toLocaleDateTime
} from './adminWorkspaceUtils';

const TEMPLATE_TYPES = [
  { id: '', title: 'همه شقه‌ها' },
  { id: 'attendance', title: 'شقه حاضری روزانه' },
  { id: 'attendance_summary', title: 'شقه خلاصه حاضری' },
  { id: 'subjects', title: 'شقه مضامین صنف' },
  { id: 'exam', title: 'شقه امتحانات' },
  { id: 'finance', title: 'شقه مالی' }
];

const DEFAULT_COLUMNS_BY_TYPE = {
  attendance: [
    { key: 'date', label: 'تاریخ', width: 16, visible: true },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true },
    { key: 'academicYear', label: 'سال تعلیمی', width: 18, visible: true },
    { key: 'status', label: 'وضعیت', width: 14, visible: true },
    { key: 'note', label: 'ملاحظه', width: 24, visible: true }
  ],
  attendance_summary: [
    { key: 'serialNo', label: 'شماره', width: 10, visible: true },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true },
    { key: 'admissionNo', label: 'نمبر اساس', width: 16, visible: true },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true },
    { key: 'presentDays', label: 'حاضر', width: 12, visible: true },
    { key: 'absentDays', label: 'غایب', width: 12, visible: true },
    { key: 'totalDays', label: 'مجموع روزها', width: 14, visible: true }
  ],
  subjects: [
    { key: 'serialNo', label: 'شماره', width: 10, visible: true },
    { key: 'subjectName', label: 'مضمون', width: 24, visible: true },
    { key: 'teacherName', label: 'استاد', width: 22, visible: true },
    { key: 'classTitle', label: 'صنف', width: 16, visible: true },
    { key: 'term', label: 'ترم', width: 14, visible: true },
    { key: 'status', label: 'وضعیت', width: 12, visible: true }
  ],
  exam: [
    { key: 'number', label: 'شماره', width: 7, visible: true },
    { key: 'studentName', label: 'نام', group: 'شهرت شاگردان', width: 15, visible: true },
    { key: 'fatherName', label: 'نام پدر', group: 'شهرت شاگردان', width: 15, visible: true },
    { key: 'writtenScore', label: 'تحریری', width: 9, visible: true },
    { key: 'oralScore', label: 'تقریری', width: 9, visible: true },
    { key: 'classActivityScore', label: 'فعالیت صنفی', width: 10, visible: true },
    { key: 'homeworkScore', label: 'کارخانگی', width: 10, visible: true },
    { key: 'obtainedMark', label: 'به عدد', group: 'مجموع نمره', width: 10, visible: true },
    { key: 'totalInWords', label: 'به حروف', group: 'مجموع نمره', width: 14, visible: true },
    { key: 'note', label: 'ملاحظات', width: 12, visible: true }
  ],
  finance: [
    { key: 'orderNumber', label: 'شماره سفارش', width: 20, visible: true },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true },
    { key: 'term', label: 'ترم', width: 16, visible: true },
    { key: 'amountDue', label: 'مبلغ قابل پرداخت', width: 16, visible: true },
    { key: 'amountPaid', label: 'پرداخت‌شده', width: 16, visible: true },
    { key: 'outstandingAmount', label: 'باقی‌مانده', width: 16, visible: true },
    { key: 'status', label: 'وضعیت', width: 14, visible: true }
  ]
};

const DEFAULT_LAYOUT = {
  font: 'B Zar',
  fontSize: 12,
  orientation: 'portrait',
  showHeader: true,
  showFooter: true,
  showLogo: true,
  headerText: '',
  footerText: '',
  margins: { top: 24, right: 24, bottom: 24, left: 24 }
};

const SCORE_COMPONENTS = [
  { key: 'writtenMax', label: 'تحریری' },
  { key: 'oralMax', label: 'تقریری' },
  { key: 'classActivityMax', label: 'فعالیت صنفی' },
  { key: 'homeworkMax', label: 'کارخانگی' }
];

const REQUIRED_ASSIGNMENT_FIELDS = [
  { key: 'academicYearId', label: 'سال تعلیمی' },
  { key: 'assessmentPeriodId', label: 'دورهٔ تعلیمی' },
  { key: 'teacherId', label: 'استاد' },
  { key: 'classId', label: 'صنف' },
  { key: 'subjectId', label: 'مضمون' },
  { key: 'examTypeId', label: 'نوع امتحان' },
  { key: 'heldAt', label: 'تاریخ امتحان' }
];

const ASSIGNED_SESSION_PAGE_SIZE = 10;

const SESSION_STATUS_OPTIONS = [
  { id: '', title: 'همه وضعیت‌ها' },
  { id: 'draft', title: 'پیش‌نویس' },
  { id: 'active', title: 'فعال' },
  { id: 'submitted', title: 'فرستاده‌شده' },
  { id: 'approved', title: 'تأییدشده' },
  { id: 'closed', title: 'بسته' },
  { id: 'published', title: 'نشرشده' },
  { id: 'archived', title: 'آرشیف' }
];

const EMPTY_ASSIGNMENT = {
  academicYearId: '',
  assessmentPeriodId: '',
  teacherId: '',
  classId: '',
  subjectId: '',
  examTypeId: '',
  reviewerUserId: '',
  heldAt: '',
  monthLabel: '',
  attendanceMax: 0,
  writtenMax: 20,
  oralMax: 10,
  classActivityMax: 5,
  homeworkMax: 5
};

const EMPTY_SESSION_EDIT = {
  id: '',
  status: '',
  academicYearId: '',
  assessmentPeriodId: '',
  teacherId: '',
  teacherAssignmentId: '',
  classId: '',
  subjectId: '',
  examTypeId: '',
  sheetTemplateId: '',
  reviewerUserId: '',
  heldAt: '',
  monthLabel: '',
  note: '',
  attendanceMax: 0,
  writtenMax: 0,
  oralMax: 0,
  classActivityMax: 0,
  homeworkMax: 0
};

function getExamScoringPreset(examType = {}) {
  const code = String(examType?.code || '').trim().toUpperCase();
  if (code === 'FOUR_HALF_MONTH') {
    return { attendanceMax: 0, writtenMax: 20, oralMax: 10, classActivityMax: 5, homeworkMax: 5, totalMark: 40 };
  }
  if (code === 'ANNUAL') {
    return { attendanceMax: 0, writtenMax: 40, oralMax: 10, classActivityMax: 5, homeworkMax: 5, totalMark: 60 };
  }
  return { attendanceMax: 0, writtenMax: 25, oralMax: 25, classActivityMax: 25, homeworkMax: 25, totalMark: Number(examType?.defaultTotalMark || 100) };
}

function buildExamScoreComponents(source = {}, { preserveAttendance = false } = {}) {
  return {
    attendanceMax: preserveAttendance ? Math.max(0, Number(source.attendanceMax || 0)) : 0,
    ...SCORE_COMPONENTS.reduce((acc, component) => ({
      ...acc,
      [component.key]: Math.max(0, Number(source[component.key] || 0))
    }), {})
  };
}

function getMissingAssignmentFields(source = {}) {
  return REQUIRED_ASSIGNMENT_FIELDS.filter((field) => !String(source[field.key] || '').trim());
}

const EMPTY_FILTERS = {
  type: '',
  academicYearId: '',
  classId: '',
  termId: '',
  examId: '',
  month: '',
  dateFrom: '',
  dateTo: ''
};

const SUMMARY_LABELS = {
  totalRows: 'تعداد ردیف‌ها',
  totalStudents: 'شاگردان',
  totalClasses: 'صنف‌ها',
  totalSubjects: 'مضامین',
  totalTeachers: 'استادان',
  presentDays: 'حاضر',
  absentDays: 'غیرحاضر',
  sickDays: 'مریض',
  leaveDays: 'رخصتی',
  totalDue: 'قابل پرداخت',
  totalOutstanding: 'باقی‌مانده',
  averageScore: 'اوسط نمره',
  maxScore: 'بلندترین نمره'
};

function getTypeLabel(type = '') {
  return TEMPLATE_TYPES.find((item) => item.id === type)?.title || type || 'همه شقه‌ها';
}

function getOptionId(option = {}) {
  if (option == null) return '';
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  return option.id || option._id || '';
}

function getAcademicYearRefId(option = {}) {
  return getOptionId(option?.academicYear) || getOptionId(option?.academicYearId);
}

function getAssignmentAcademicYearId(assignment = {}) {
  return getAcademicYearRefId(assignment)
    || getAcademicYearRefId(assignment?.schoolClass)
    || getAcademicYearRefId(assignment?.assessmentPeriod);
}

function getOptionLabel(option = {}) {
  const pieces = [option.uiLabel || option.title || option.name || option.code];
  if (option.subject) pieces.push(option.subject);
  if (option.heldAt) pieces.push(toLocaleDateTime(option.heldAt));
  return pieces.filter(Boolean).join(' - ') || '---';
}

function compactFilters(filters = {}) {
  return Object.entries(filters).reduce((acc, [key, value]) => {
    if (key === 'type') return acc;
    if (value == null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function getTemplateHint(template = null) {
  if (!template) return 'از فهرست سمت راست یک شقه آماده را انتخاب کنید.';
  if (template.type === 'exam') {
    return 'برای شقه امتحان، انتخاب جلسه امتحان ضروری است؛ دیتا از بخش امتحانات خوانده می‌شود.';
  }
  if (template.type === 'subjects') {
    return 'این شقه مضامین و استادان مربوط به صنف را از تخصیص‌های آموزشی می‌گیرد.';
  }
  if (template.type === 'attendance' || template.type === 'attendance_summary') {
    return 'این شقه از ثبت حاضری سیستم ساخته می‌شود و با فیلتر صنف، تاریخ و ماه دقیق‌تر می‌شود.';
  }
  return 'این شقه آماده است و فقط با فیلترهای همین صفحه تولید می‌شود.';
}

function getPreviewMessage(preview = null) {
  return preview?.meta?.message || 'برای دیدن معلومات، فیلترها را تنظیم کنید و پیش‌نمایش را بزنید.';
}

function getSummaryEntries(preview = null) {
  const summary = preview?.summary && typeof preview.summary === 'object' ? preview.summary : {};
  const entries = Object.entries(summary)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 6);

  if (entries.length) {
    return entries.map(([key, value]) => ({
      label: SUMMARY_LABELS[key] || key,
      value: typeof value === 'number' ? formatNumber(value) : String(value)
    }));
  }

  const totalRows = Array.isArray(preview?.rows) ? preview.rows.length : Number(preview?.meta?.totalRows || 0);
  return [{ label: 'تعداد ردیف‌ها', value: formatNumber(totalRows) }];
}

function getTemplateColumns(template = null) {
  const configured = Array.isArray(template?.columns) && template.columns.length
    ? template.columns
    : DEFAULT_COLUMNS_BY_TYPE[template?.type] || DEFAULT_COLUMNS_BY_TYPE.attendance;
  return configured
    .map((column, index) => ({
      key: String(column?.key || '').trim(),
      label: String(column?.label || column?.key || '').trim(),
      group: String(column?.group || '').trim(),
      width: Number(column?.width || 16),
      visible: column?.visible !== false,
      order: Number(column?.order ?? index)
    }))
    .filter((column) => column.key && !(template?.type === 'exam' && column.key === 'attendanceScore'))
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
}

function getTemplateLayout(template = null) {
  const layout = template?.layout || {};
  return {
    ...DEFAULT_LAYOUT,
    font: layout.font || layout.fontFamily || DEFAULT_LAYOUT.font,
    fontSize: Number(layout.fontSize || DEFAULT_LAYOUT.fontSize),
    orientation: layout.orientation || DEFAULT_LAYOUT.orientation,
    showHeader: layout.showHeader !== false,
    showFooter: layout.showFooter !== false,
    showLogo: layout.showLogo !== false,
    headerText: layout.headerText || '',
    footerText: layout.footerText || '',
    margins: { ...DEFAULT_LAYOUT.margins, ...(layout.margins || {}) }
  };
}

function getSessionStatusLabel(status = '') {
  return SESSION_STATUS_OPTIONS.find((item) => item.id === String(status || '').trim().toLowerCase())?.title
    || status
    || 'نامشخص';
}

export default function AdminSheetTemplates() {
  const [items, setItems] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [academicTerms, setAcademicTerms] = useState([]);
  const [classes, setClasses] = useState([]);
  const [examSessions, setExamSessions] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [examTypes, setExamTypes] = useState([]);
  const [reviewers, setReviewers] = useState([]);
  const [assignment, setAssignment] = useState(EMPTY_ASSIGNMENT);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [busyAction, setBusyAction] = useState('');
  const [draftColumns, setDraftColumns] = useState([]);
  const [draftLayout, setDraftLayout] = useState(DEFAULT_LAYOUT);
  const [restoreColumnKey, setRestoreColumnKey] = useState('');
  const [assignedSessionQuery, setAssignedSessionQuery] = useState('');
  const [assignedSessionStatus, setAssignedSessionStatus] = useState('');
  const [assignedSessionPage, setAssignedSessionPage] = useState(1);
  const [editingSession, setEditingSession] = useState(null);
  const [editingManagement, setEditingManagement] = useState(null);
  const [sessionEdit, setSessionEdit] = useState(EMPTY_SESSION_EDIT);
  // Once the admin manually edits a score-component field (written/oral/homework/classActivity),
  // stop auto-overwriting it — different subjects legitimately split the same official total
  // differently (e.g. 36/0/2/2 vs 24/12/2/2, both summing to 40), and re-applying one fixed
  // preset on every exam-type change used to silently erase that customization.
  const [assignmentScoreTouched, setAssignmentScoreTouched] = useState(false);
  const [editScoreTouched, setEditScoreTouched] = useState(false);
  const [assignmentScoreHint, setAssignmentScoreHint] = useState('');

  const templateTypes = useMemo(() => normalizeOptions(TEMPLATE_TYPES, ['title', 'id']), []);
  const yearOptions = useMemo(() => normalizeOptions(academicYears, ['title', 'code']), [academicYears]);
  const termOptions = useMemo(() => normalizeOptions(academicTerms, ['title', 'code']), [academicTerms]);
  const classOptions = useMemo(() => normalizeOptions(classes, ['title', 'code']), [classes]);
  const examSessionOptions = useMemo(() => normalizeOptions(examSessions, ['title', 'code']), [examSessions]);

  const assignmentTerms = useMemo(() => academicTerms.filter((item) => (
    !assignment.academicYearId || String(getAcademicYearRefId(item)) === String(assignment.academicYearId)
  )), [academicTerms, assignment.academicYearId]);
  const assignmentTeachers = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !assignment.academicYearId || String(getAssignmentAcademicYearId(item)) === String(assignment.academicYearId))
      .filter((item) => item?.teacher?.id)
      .map((item) => [String(item.teacher.id), item.teacher])
  ).values()), [teacherAssignments, assignment.academicYearId]);
  const assignmentClasses = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !assignment.academicYearId || String(getAssignmentAcademicYearId(item)) === String(assignment.academicYearId))
      .filter((item) => !assignment.teacherId || String(item?.teacher?.id || '') === String(assignment.teacherId))
      .filter((item) => item?.schoolClass?.id)
      .map((item) => [String(item.schoolClass.id), item.schoolClass])
  ).values()), [teacherAssignments, assignment.academicYearId, assignment.teacherId]);
  const assignmentSubjects = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !assignment.academicYearId || String(getAssignmentAcademicYearId(item)) === String(assignment.academicYearId))
      .filter((item) => !assignment.teacherId || String(item?.teacher?.id || '') === String(assignment.teacherId))
      .filter((item) => !assignment.classId || String(item?.schoolClass?.id || '') === String(assignment.classId))
      .filter((item) => item?.subject?.id)
      .map((item) => [String(item.subject.id), item.subject])
  ).values()), [teacherAssignments, assignment.academicYearId, assignment.teacherId, assignment.classId]);
  const selectedAssignmentRecord = useMemo(() => teacherAssignments.find((item) => (
    String(getAssignmentAcademicYearId(item)) === String(assignment.academicYearId)
    && String(item?.teacher?.id || '') === String(assignment.teacherId)
    && String(item?.schoolClass?.id || '') === String(assignment.classId)
    && String(item?.subject?.id || '') === String(assignment.subjectId)
  )) || null, [teacherAssignments, assignment]);
  const selectedExamType = useMemo(() => examTypes.find((item) => String(item.id) === String(assignment.examTypeId)) || null, [examTypes, assignment.examTypeId]);
  const assignmentScoreTotal = Object.values(buildExamScoreComponents(assignment)).reduce((sum, value) => sum + value, 0);
  const expectedScoreTotal = getExamScoringPreset(selectedExamType).totalMark;
  const editTerms = useMemo(() => academicTerms.filter((item) => (
    !sessionEdit.academicYearId || String(getAcademicYearRefId(item)) === String(sessionEdit.academicYearId)
  )), [academicTerms, sessionEdit.academicYearId]);
  const editTeachers = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !sessionEdit.academicYearId || String(getAssignmentAcademicYearId(item)) === String(sessionEdit.academicYearId))
      .filter((item) => editingManagement?.permissions?.canEditStructure
        || String(item?.schoolClass?.id || '') === String(sessionEdit.classId))
      .filter((item) => editingManagement?.permissions?.canEditStructure
        || String(item?.subject?.id || '') === String(sessionEdit.subjectId))
      .filter((item) => item?.teacher?.id)
      .map((item) => [String(item.teacher.id), item.teacher])
  ).values()), [
    editingManagement?.permissions?.canEditStructure,
    sessionEdit.academicYearId,
    sessionEdit.classId,
    sessionEdit.subjectId,
    teacherAssignments
  ]);
  const editClasses = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !sessionEdit.academicYearId || String(getAssignmentAcademicYearId(item)) === String(sessionEdit.academicYearId))
      .filter((item) => !sessionEdit.teacherId || String(item?.teacher?.id || '') === String(sessionEdit.teacherId))
      .filter((item) => item?.schoolClass?.id)
      .map((item) => [String(item.schoolClass.id), item.schoolClass])
  ).values()), [teacherAssignments, sessionEdit.academicYearId, sessionEdit.teacherId]);
  const editSubjects = useMemo(() => Array.from(new Map(
    teacherAssignments
      .filter((item) => !sessionEdit.academicYearId || String(getAssignmentAcademicYearId(item)) === String(sessionEdit.academicYearId))
      .filter((item) => !sessionEdit.teacherId || String(item?.teacher?.id || '') === String(sessionEdit.teacherId))
      .filter((item) => !sessionEdit.classId || String(item?.schoolClass?.id || '') === String(sessionEdit.classId))
      .filter((item) => item?.subject?.id)
      .map((item) => [String(item.subject.id), item.subject])
  ).values()), [teacherAssignments, sessionEdit.academicYearId, sessionEdit.teacherId, sessionEdit.classId]);
  const selectedEditAssignment = useMemo(() => teacherAssignments.find((item) => (
    String(getAssignmentAcademicYearId(item)) === String(sessionEdit.academicYearId)
    && String(item?.teacher?.id || '') === String(sessionEdit.teacherId)
    && String(item?.schoolClass?.id || '') === String(sessionEdit.classId)
    && String(item?.subject?.id || '') === String(sessionEdit.subjectId)
  )) || null, [teacherAssignments, sessionEdit]);
  const selectedEditExamType = useMemo(() => examTypes.find((item) => String(item.id) === String(sessionEdit.examTypeId)) || null, [examTypes, sessionEdit.examTypeId]);
  const editScoreTotal = Object.values(buildExamScoreComponents(sessionEdit, { preserveAttendance: true })).reduce((sum, value) => sum + value, 0);
  const expectedEditScoreTotal = getExamScoringPreset(selectedEditExamType).totalMark;
  const filteredAssignedSessions = useMemo(() => {
    const query = assignedSessionQuery.trim().toLowerCase();
    return examSessions.filter((session) => {
      if (assignment.teacherId && String(session?.teacherAssignment?.teacher?.id || '') !== String(assignment.teacherId)) return false;
      if (assignedSessionStatus && String(session?.status || '') !== assignedSessionStatus) return false;
      if (!query) return true;
      const searchableText = [
        session?.title,
        session?.subject?.name,
        session?.teacherAssignment?.teacher?.name,
        session?.schoolClass?.title,
        session?.examType?.title,
        getSessionStatusLabel(session?.status)
      ].filter(Boolean).join(' ').toLowerCase();
      return searchableText.includes(query);
    });
  }, [assignedSessionQuery, assignedSessionStatus, assignment.teacherId, examSessions]);
  const assignedSessionPageCount = Math.max(1, Math.ceil(filteredAssignedSessions.length / ASSIGNED_SESSION_PAGE_SIZE));
  const pagedAssignedSessions = useMemo(() => {
    const start = (assignedSessionPage - 1) * ASSIGNED_SESSION_PAGE_SIZE;
    return filteredAssignedSessions.slice(start, start + ASSIGNED_SESSION_PAGE_SIZE);
  }, [assignedSessionPage, filteredAssignedSessions]);
  const assignedSessionRangeStart = filteredAssignedSessions.length
    ? ((assignedSessionPage - 1) * ASSIGNED_SESSION_PAGE_SIZE) + 1
    : 0;
  const assignedSessionRangeEnd = Math.min(assignedSessionPage * ASSIGNED_SESSION_PAGE_SIZE, filteredAssignedSessions.length);

  const filteredTemplates = useMemo(() => {
    return items.filter((item) => !filters.type || item.type === filters.type);
  }, [filters.type, items]);

  const selectedTemplate = useMemo(() => {
    return items.find((item) => String(item.id) === String(selectedTemplateId)) || null;
  }, [items, selectedTemplateId]);

  const restorableColumns = useMemo(() => {
    const configuredKeys = new Set(draftColumns.map((column) => String(column?.key || '')));
    return (DEFAULT_COLUMNS_BY_TYPE[selectedTemplate?.type] || [])
      .filter((column) => !configuredKeys.has(column.key));
  }, [draftColumns, selectedTemplate?.type]);

  useEffect(() => {
    setDraftColumns(getTemplateColumns(selectedTemplate));
    setDraftLayout(getTemplateLayout(selectedTemplate));
  }, [selectedTemplate]);

  useEffect(() => {
    setRestoreColumnKey((current) => (
      restorableColumns.some((column) => column.key === current)
        ? current
        : restorableColumns[0]?.key || ''
    ));
  }, [restorableColumns]);

  useEffect(() => {
    setAssignedSessionPage(1);
  }, [assignedSessionQuery, assignedSessionStatus, assignment.teacherId]);

  useEffect(() => {
    setAssignedSessionPage((current) => Math.min(current, assignedSessionPageCount));
  }, [assignedSessionPageCount]);

  const filteredExamSessionOptions = useMemo(() => {
    return examSessionOptions.filter((item) => {
      if (filters.academicYearId && String(item?.academicYear?.id || item.academicYearId || '') !== String(filters.academicYearId)) return false;
      if (filters.classId && String(item?.schoolClass?.id || item.classId || '') !== String(filters.classId)) return false;
      if (filters.termId && String(item?.assessmentPeriod?.id || item.termId || '') !== String(filters.termId)) return false;
      return true;
    });
  }, [examSessionOptions, filters.academicYearId, filters.classId, filters.termId]);

  const previewColumns = Array.isArray(preview?.columns) ? preview.columns : [];
  const previewRows = Array.isArray(preview?.rows) ? preview.rows : [];
  const summaryEntries = useMemo(() => getSummaryEntries(preview), [preview]);

  const showMessage = (text, tone = 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadReference = async () => {
    const [reportData, examData, sessionData] = await Promise.all([
      fetchJson('/api/reports/reference-data'),
      fetchJson('/api/exams/reference-data'),
      fetchJson('/api/exams/sessions?sessionKind=subject_sheet')
    ]);
    const nextYears = examData.academicYears || reportData.academicYears || [];
    const nextTerms = examData.assessmentPeriods || reportData.academicTerms || [];
    setAcademicYears(nextYears);
    setAcademicTerms(nextTerms);
    setClasses(examData.classes || reportData.classes || []);
    setTeacherAssignments(examData.teacherAssignments || []);
    setExamTypes(examData.examTypes || []);
    setReviewers(examData.reviewers || []);
    setExamSessions(sessionData.items || reportData.examSessions || []);
    const activeYear = nextYears.find((item) => item.isActive) || nextYears[0] || null;
    const firstExamType = (examData.examTypes || [])[0] || null;
    setAssignment((current) => {
      const selectedYearId = nextYears.some((item) => String(getOptionId(item)) === String(current.academicYearId))
        ? current.academicYearId
        : getOptionId(activeYear);
      const termsForYear = nextTerms.filter((item) => String(getAcademicYearRefId(item)) === String(selectedYearId));
      const currentTermMatchesYear = termsForYear.some((item) => String(getOptionId(item)) === String(current.assessmentPeriodId));
      const defaultTerm = termsForYear.find((item) => item.isActive) || termsForYear[0] || null;
      return {
        ...current,
        academicYearId: selectedYearId || '',
        assessmentPeriodId: currentTermMatchesYear ? current.assessmentPeriodId : getOptionId(defaultTerm),
        examTypeId: current.examTypeId || firstExamType?.id || '',
        ...(!current.examTypeId && firstExamType ? getExamScoringPreset(firstExamType) : {})
      };
    });
  };

  const loadTemplates = async () => {
    const data = await fetchJson('/api/sheet-templates');
    const rows = data.items || [];
    setItems(rows);
    setSelectedTemplateId((current) => current || rows[0]?.id || '');
  };

  const loadAll = async () => {
    try {
      setBusyAction('load');
      await Promise.all([loadReference(), loadTemplates()]);
    } catch (error) {
      showMessage(errorMessage(error, 'بارگذاری شقه‌ها ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Suggests the subject's own last-used score split (instead of one fixed preset shared by
  // every subject of the exam type) once teacher/class/subject/examType are all selected.
  // Skipped entirely once the admin has started customizing the fields by hand.
  useEffect(() => {
    const { subjectId, examTypeId, classId, academicYearId } = assignment;
    if (assignmentScoreTouched || !subjectId || !examTypeId || !classId || !academicYearId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const query = new URLSearchParams({ subjectId, examTypeId, classId, academicYearId }).toString();
        const data = await fetchJson(`/api/exams/default-marks/latest?${query}`);
        if (cancelled || !data?.item?.scoreComponents) return;
        setAssignment((current) => {
          if (String(current.subjectId) !== String(subjectId) || String(current.examTypeId) !== String(examTypeId)) {
            return current;
          }
          return { ...current, ...data.item.scoreComponents };
        });
        if (!cancelled) setAssignmentScoreHint('ترکیب نمرهٔ همین مضمون از تخصیص قبلی آن بارگذاری شد.');
      } catch (error) {
        // Best-effort suggestion only — silence failures so it never blocks the form.
      }
    })();
    return () => { cancelled = true; };
  }, [assignment.subjectId, assignment.examTypeId, assignment.classId, assignment.academicYearId, assignmentScoreTouched]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      setSelectedTemplateId('');
      setPreview(null);
      return;
    }

    if (!filteredTemplates.some((item) => String(item.id) === String(selectedTemplateId))) {
      setSelectedTemplateId(filteredTemplates[0]?.id || '');
      setPreview(null);
    }
  }, [filteredTemplates, selectedTemplateId]);

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => {
      const next = { ...current, [name]: value };
      if (['academicYearId', 'classId', 'termId'].includes(name)) {
        next.examId = '';
      }
      return next;
    });
  };

  const updateAssignment = (event) => {
    const { name, value } = event.target;
    if (SCORE_COMPONENTS.some((component) => component.key === name)) {
      // The admin is customizing this subject's own score split — stop overwriting it.
      setAssignmentScoreTouched(true);
      setAssignmentScoreHint('');
    } else if (name === 'subjectId') {
      // A new subject may have its own saved split; allow the lookup effect to suggest it again.
      setAssignmentScoreTouched(false);
      setAssignmentScoreHint('');
    }
    setAssignment((current) => {
      const next = { ...current, [name]: value };
      if (name === 'academicYearId') {
        const nextTerm = academicTerms.find((item) => item.isActive && String(getAcademicYearRefId(item)) === String(value))
          || academicTerms.find((item) => String(getAcademicYearRefId(item)) === String(value))
          || null;
        next.assessmentPeriodId = nextTerm?.id || '';
        next.teacherId = '';
        next.classId = '';
        next.subjectId = '';
      }
      if (name === 'teacherId') {
        next.classId = '';
        next.subjectId = '';
      }
      if (name === 'classId') next.subjectId = '';
      if (name === 'examTypeId' && !assignmentScoreTouched) {
        Object.assign(next, getExamScoringPreset(examTypes.find((item) => String(item.id) === String(value))));
      }
      return next;
    });
  };

  const selectAssignedSession = (session) => {
    const sessionId = session?.id || session?._id || '';
    if (!sessionId) return;
    if (session?.sheetTemplate?.id) setSelectedTemplateId(session.sheetTemplate.id);
    setFilters((current) => ({
      ...current,
      type: 'exam',
      academicYearId: session?.academicYear?.id || current.academicYearId,
      classId: session?.schoolClass?.id || current.classId,
      termId: session?.assessmentPeriod?.id || current.termId,
      examId: sessionId
    }));
    setPreview(null);
    showMessage(`${session?.title || 'شقه'} برای پیش‌نمایش انتخاب شد.`);
  };

  const openSessionEditor = async (session) => {
    if (!session?.id) return;
    try {
      setBusyAction(`manage-session:${session.id}`);
      const data = await fetchJson(`/api/exams/sessions/${session.id}/management-state`);
      const item = data.item || session;
      const components = item.defaultMark?.scoreComponents || {};
      setEditingSession(item);
      setEditingManagement(data);
      setEditScoreTouched(false);
      setSessionEdit({
        ...EMPTY_SESSION_EDIT,
        id: item.id,
        status: item.status,
        academicYearId: item.academicYear?.id || '',
        assessmentPeriodId: item.assessmentPeriod?.id || '',
        teacherId: item.teacherAssignment?.teacher?.id || '',
        teacherAssignmentId: item.teacherAssignment?.id || '',
        classId: item.schoolClass?.id || '',
        subjectId: item.subject?.id || '',
        examTypeId: item.examType?.id || '',
        sheetTemplateId: item.sheetTemplateId || item.sheetTemplate?.id || selectedTemplateId || '',
        reviewerUserId: item.reviewerUserId || item.reviewer?.id || '',
        heldAt: item.heldAt || '',
        monthLabel: item.monthLabel || '',
        note: item.note || '',
        attendanceMax: Number(components.attendanceMax || 0),
        writtenMax: Number(components.writtenMax || 0),
        oralMax: Number(components.oralMax || 0),
        classActivityMax: Number(components.classActivityMax || 0),
        homeworkMax: Number(components.homeworkMax || 0)
      });
    } catch (error) {
      showMessage(errorMessage(error, 'دریافت معلومات ویرایش شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const closeSessionEditor = () => {
    setEditingSession(null);
    setEditingManagement(null);
    setSessionEdit(EMPTY_SESSION_EDIT);
    setEditScoreTouched(false);
  };

  const updateSessionEdit = (event) => {
    const { name, value } = event.target;
    if (SCORE_COMPONENTS.some((component) => component.key === name)) {
      setEditScoreTouched(true);
    }
    setSessionEdit((current) => {
      const next = { ...current, [name]: value };
      if (name === 'academicYearId') {
        const nextTerm = academicTerms.find((item) => item.isActive && String(getAcademicYearRefId(item)) === String(value))
          || academicTerms.find((item) => String(getAcademicYearRefId(item)) === String(value))
          || null;
        next.assessmentPeriodId = nextTerm?.id || '';
        next.teacherId = '';
        next.classId = '';
        next.subjectId = '';
      }
      if (name === 'teacherId' && editingManagement?.permissions?.canEditStructure) {
        next.classId = '';
        next.subjectId = '';
      }
      if (name === 'classId') next.subjectId = '';
      if (name === 'examTypeId' && !editScoreTouched) {
        Object.assign(next, getExamScoringPreset(examTypes.find((item) => String(item.id) === String(value))));
      }
      return next;
    });
  };

  const saveSessionEdit = async () => {
    if (!sessionEdit.id || !editingManagement?.permissions?.canEditMetadata) return;
    const missingFields = getMissingAssignmentFields(sessionEdit);
    if (missingFields.length) {
      showMessage(`این موارد هنوز تکمیل نشده‌اند: ${missingFields.map((field) => field.label).join('، ')}.`, 'error');
      return;
    }
    if (!selectedEditAssignment?.id) {
      showMessage('برای ترکیب انتخاب‌شده تخصیص فعالی در بخش «معرفی صنف به استاد» پیدا نشد.', 'error');
      return;
    }
    if (editingManagement?.permissions?.canEditStructure && editScoreTotal !== expectedEditScoreTotal) {
      showMessage(`مجموع اجزای نمره باید دقیقاً ${formatNumber(expectedEditScoreTotal)} باشد؛ مجموع فعلی ${formatNumber(editScoreTotal)} است.`, 'error');
      return;
    }

    try {
      setBusyAction('update-session');
      const payload = {
        teacherAssignmentId: selectedEditAssignment.id,
        sheetTemplateId: sessionEdit.sheetTemplateId || selectedTemplateId,
        reviewerUserId: sessionEdit.reviewerUserId || null,
        heldAt: sessionEdit.heldAt,
        monthLabel: sessionEdit.monthLabel,
        note: sessionEdit.note
      };
      if (editingManagement?.permissions?.canEditStructure) {
        Object.assign(payload, {
          academicYearId: sessionEdit.academicYearId,
          assessmentPeriodId: sessionEdit.assessmentPeriodId,
          classId: sessionEdit.classId,
          subjectId: sessionEdit.subjectId,
          examTypeId: sessionEdit.examTypeId,
          scoreComponents: buildExamScoreComponents(sessionEdit, { preserveAttendance: true })
        });
      }
      const data = await fetchJson(`/api/exams/sessions/${sessionEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setExamSessions((current) => current.map((item) => (
        String(item.id) === String(sessionEdit.id) ? data.item : item
      )));
      closeSessionEditor();
      showMessage('تخصیص و مشخصات شقه با موفقیت ویرایش شد. این تغییر همان تخصیص موجود «معرفی صنف به استاد» را استفاده می‌کند.');
    } catch (error) {
      showMessage(errorMessage(error, 'ویرایش شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const deleteAssignedSession = async (session) => {
    if (!session?.id) return;
    try {
      setBusyAction(`delete-session:${session.id}`);
      const state = await fetchJson(`/api/exams/sessions/${session.id}/management-state`);
      if (!state.permissions?.canHardDelete) {
        showMessage('این شقه نمره یا وابستگی رسمی دارد و حذف کامل نمی‌شود؛ از آرشیف یا نسخهٔ اصلاحی استفاده کنید.', 'error');
        return;
      }
      const confirmed = window.confirm(`شقه «${session.subject?.name || session.title}» و ردیف‌های موقت آن حذف شود؟ این عمل قابل برگشت نیست.`);
      if (!confirmed) return;
      await fetchJson(`/api/exams/sessions/${session.id}`, { method: 'DELETE' });
      setExamSessions((current) => current.filter((item) => String(item.id) !== String(session.id)));
      setFilters((current) => String(current.examId) === String(session.id) ? { ...current, examId: '' } : current);
      setPreview(null);
      showMessage('پیش‌نویس شقه و ردیف‌های موقت آن حذف شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'حذف شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const archiveAssignedSession = async (session) => {
    if (!session?.id) return;
    const reason = window.prompt('دلیل آرشیف این شقه را بنویسید:');
    if (reason == null) return;
    if (!String(reason).trim()) {
      showMessage('برای آرشیف شقه، نوشتن دلیل الزامی است.', 'error');
      return;
    }
    try {
      setBusyAction(`archive-session:${session.id}`);
      const data = await postJson(`/api/exams/sessions/${session.id}/status`, { status: 'archived', note: String(reason).trim() });
      setExamSessions((current) => current.map((item) => String(item.id) === String(session.id) ? data.item : item));
      showMessage('شقه آرشیف شد و در محاسبات جاری استفاده نمی‌شود.');
    } catch (error) {
      showMessage(errorMessage(error, 'آرشیف شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const returnAssignedSessionForCorrection = async (session) => {
    if (!session?.id || !window.confirm('این شقه برای اصلاح به حالت فعال برگردد؟')) return;
    try {
      setBusyAction(`return-session:${session.id}`);
      const data = await postJson(`/api/exams/sessions/${session.id}/status`, { status: 'active', note: 'برگشت برای اصلاح توسط مدیریت' });
      setExamSessions((current) => current.map((item) => String(item.id) === String(session.id) ? data.item : item));
      showMessage('شقه برای اصلاح به حالت فعال برگشت.');
    } catch (error) {
      showMessage(errorMessage(error, 'برگشت شقه برای اصلاح ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const createAssignedSessionRevision = async (session) => {
    if (!session?.id) return;
    const reason = window.prompt('دلیل ساخت نسخهٔ اصلاحی را بنویسید:');
    if (reason == null) return;
    if (!String(reason).trim()) {
      showMessage('دلیل ساخت نسخهٔ اصلاحی الزامی است.', 'error');
      return;
    }
    try {
      setBusyAction(`revise-session:${session.id}`);
      const data = await postJson(`/api/exams/sessions/${session.id}/revisions`, { reason: String(reason).trim() });
      await loadReference();
      if (data.item?.id) selectAssignedSession(data.item);
      showMessage(`نسخهٔ اصلاحی ${formatNumber(data.summary?.version || data.item?.version || 2)} ساخته شد.`);
    } catch (error) {
      showMessage(errorMessage(error, 'ساخت نسخهٔ اصلاحی ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const syncAssignedSessionRoster = async (session) => {
    if (!session?.id) return;
    if (!['draft', 'active'].includes(String(session.status || ''))) {
      showMessage('فهرست شاگردان شقهٔ نهایی‌شده قابل همگام‌سازی مستقیم نیست؛ نخست نسخهٔ اصلاحی بسازید.', 'error');
      return;
    }
    try {
      setBusyAction(`sync-roster:${session.id}`);
      const data = await postJson(`/api/exams/sessions/${session.id}/sync-roster`, {});
      if (data.session?.id) {
        setExamSessions((current) => current.map((item) => (
          String(item.id) === String(session.id) ? { ...item, ...data.session } : item
        )));
      }
      setPreview(null);
      const added = Number(data.summary?.createdMarks || 0);
      if (added > 0) {
        showMessage(`${formatNumber(added)} شاگرد جدید به شقه اضافه شد؛ نمرات و ردیف‌های قبلی تغییر نکرد.`);
      } else {
        showMessage('فهرست شقه به‌روز است و شاگرد جدیدی برای افزودن پیدا نشد.');
      }
    } catch (error) {
      showMessage(errorMessage(error, 'همگام‌سازی شاگردان شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const createAssignedExamSheet = async () => {
    if (!selectedTemplate || selectedTemplate.type !== 'exam') {
      showMessage('برای تخصیص به استاد، نخست فارمت شقهٔ امتحان را انتخاب کنید.', 'error');
      return;
    }
    const missingFields = getMissingAssignmentFields(assignment);
    if (missingFields.length) {
      showMessage(`این موارد هنوز تکمیل نشده‌اند: ${missingFields.map((field) => field.label).join('، ')}.`, 'error');
      return;
    }
    const selectedPeriod = academicTerms.find((item) => String(getOptionId(item)) === String(assignment.assessmentPeriodId)) || null;
    if (!selectedPeriod) {
      showMessage('دورهٔ انتخاب‌شده در مرکز آموزش پیدا نشد؛ فهرست دوره‌ها را بروزرسانی کنید.', 'error');
      return;
    }
    if (String(getAcademicYearRefId(selectedPeriod)) !== String(assignment.academicYearId)) {
      showMessage('دورهٔ انتخاب‌شده مربوط به این سال تعلیمی نیست؛ دورهٔ همان سال را انتخاب کنید.', 'error');
      setAssignment((current) => ({ ...current, assessmentPeriodId: '' }));
      return;
    }
    if (!selectedAssignmentRecord?.id) {
      showMessage('برای استاد، صنف و مضمون انتخاب‌شده تخصیص فعال پیدا نشد.', 'error');
      return;
    }
    if (assignmentScoreTotal !== expectedScoreTotal) {
      showMessage(`مجموع اجزای نمره باید دقیقاً ${formatNumber(expectedScoreTotal)} باشد؛ مجموع فعلی ${formatNumber(assignmentScoreTotal)} است.`, 'error');
      return;
    }

    const payload = {
      sessionKind: 'subject_sheet',
      academicYearId: assignment.academicYearId,
      assessmentPeriodId: assignment.assessmentPeriodId,
      teacherAssignmentId: selectedAssignmentRecord.id,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      examTypeId: assignment.examTypeId,
      sheetTemplateId: selectedTemplateId,
      reviewerUserId: assignment.reviewerUserId || undefined,
      heldAt: assignment.heldAt,
      monthLabel: assignment.monthLabel,
      status: 'draft',
      initializeRoster: true,
      scoreComponents: buildExamScoreComponents(assignment)
    };

    try {
      setBusyAction('assign-exam');
      const previewData = await postJson('/api/exams/sessions/bootstrap-preview', payload);
      if (previewData.existingSession?.id) {
        selectAssignedSession(previewData.existingSession);
        showMessage('این شقه قبلاً ساخته شده بود؛ همان شقه برای مدیریت باز شد.');
        return;
      }
      const data = await postJson('/api/exams/sessions/bootstrap', payload);
      const session = data.session || null;
      await loadReference();
      if (session?.id) selectAssignedSession(session);
      showMessage('شقه به استاد تخصیص شد و در حساب استاد قابل مشاهده است.');
    } catch (error) {
      showMessage(errorMessage(error, 'ایجاد و تخصیص شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const selectTemplate = (template) => {
    setSelectedTemplateId(template?.id || '');
    setPreview(null);
    showMessage(`${template?.title || 'شقه'} انتخاب شد.`);
  };

  const buildPreviewFilters = () => compactFilters(filters);

  const runPreview = async () => {
    if (!selectedTemplateId) return;
    try {
      setBusyAction('preview');
      const data = await postJson(`/api/sheet-templates/${selectedTemplateId}/preview`, {
        filters: buildPreviewFilters()
      });
      setPreview(data.preview || null);
      showMessage('پیش‌نمایش آماده شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'پیش‌نمایش شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const exportFromTemplate = async (kind = 'csv', { blank = false } = {}) => {
    if (!selectedTemplateId) return;
    // شقه سفید: برای گرفتن امتحان حضوری — بدون نمره و بدون جزئیات متن پایین.
    try {
      setBusyAction(`export:${kind}${blank ? ':blank' : ''}`);
      if (kind === 'print') {
        const { text, filename, contentType } = await fetchText(`/api/sheet-templates/${selectedTemplateId}/export.print`, {
          filters: buildPreviewFilters(),
          blank
        });
        const opened = openHtmlDocument(text, filename);
        if (!opened) {
          downloadBlob(new Blob([text], { type: contentType }), filename);
        }
      } else {
        const endpoint = kind === 'xlsx'
          ? `/api/sheet-templates/${selectedTemplateId}/export.xlsx`
          : kind === 'pdf'
            ? `/api/sheet-templates/${selectedTemplateId}/export.pdf`
            : `/api/sheet-templates/${selectedTemplateId}/export.csv`;
        const { blob, filename } = await fetchBlob(endpoint, {
          filters: buildPreviewFilters(),
          blank
        });
        downloadBlob(blob, filename);
      }
      showMessage(blank ? 'شقهٔ سفید آماده شد.' : 'خروجی شقه دریافت شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'گرفتن خروجی شقه ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPreview(null);
    showMessage('فیلترها پاک شد.');
  };

  const updateColumn = (index, patch) => {
    setDraftColumns((current) => current.map((column, columnIndex) => (
      columnIndex === index ? { ...column, ...patch } : column
    )));
  };

  const moveColumn = (index, direction) => {
    setDraftColumns((current) => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      return next.map((column, order) => ({ ...column, order }));
    });
  };

  const removeColumn = (index) => {
    const removedColumn = draftColumns[index];
    setDraftColumns((current) => current
      .filter((_, columnIndex) => columnIndex !== index)
      .map((column, order) => ({ ...column, order })));
    showMessage(`ستون «${removedColumn?.label || removedColumn?.key || ''}» حذف شد؛ برای ثبت دایمی، «ذخیره قالب» را بزنید.`);
  };

  const addColumn = () => {
    setDraftColumns((current) => {
      const existingKeys = new Set(current.map((column) => String(column?.key || '')));
      let sequence = 1;
      while (existingKeys.has(`custom_${sequence}`)) sequence += 1;
      const nextColumn = {
        key: `custom_${sequence}`,
        label: `ستون جدید ${formatNumber(sequence)}`,
        group: '',
        width: 12,
        visible: true,
        order: current.length
      };
      return [...current, nextColumn];
    });
    showMessage('ستون سفارشی اضافه شد؛ عنوان آن را تعیین و سپس «ذخیره قالب» را بزنید. این ستون در خروجی چاپی خالی است.');
  };

  const restoreColumn = () => {
    const candidate = restorableColumns.find((column) => column.key === restoreColumnKey);
    if (!candidate) {
      showMessage('ستون حذف‌شده‌ای برای بازگرداندن وجود ندارد.');
      return;
    }
    setDraftColumns((current) => [...current, { ...candidate, order: current.length }]);
    showMessage(`ستون «${candidate.label}» بازگردانده شد؛ برای ثبت دایمی، «ذخیره قالب» را بزنید.`);
  };

  const updateLayout = (event) => {
    const { name, value, type, checked } = event.target;
    setDraftLayout((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetTemplateDraft = () => {
    setDraftColumns(getTemplateColumns(selectedTemplate));
    setDraftLayout(getTemplateLayout(selectedTemplate));
    showMessage('تنظیمات قالب به آخرین حالت ذخیره‌شده برگشت.');
  };

  const saveTemplateSettings = async () => {
    if (!selectedTemplateId) return;
    try {
      setBusyAction('save-template');
      const columns = draftColumns
        .map((column, order) => ({
          key: String(column.key || '').trim(),
          label: String(column.label || '').trim(),
          group: String(column.group || '').trim(),
          width: Number(column.width || 16),
          visible: column.visible !== false,
          order
        }))
        .filter((column) => column.key);
      const data = await fetchJson(`/api/sheet-templates/${selectedTemplateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns,
          layout: {
            fontFamily: draftLayout.font,
            fontSize: Number(draftLayout.fontSize || 12),
            orientation: draftLayout.orientation,
            showHeader: Boolean(draftLayout.showHeader),
            showFooter: Boolean(draftLayout.showFooter),
            showLogo: Boolean(draftLayout.showLogo),
            headerText: String(draftLayout.headerText || '').trim(),
            footerText: String(draftLayout.footerText || '').trim(),
            margins: { ...DEFAULT_LAYOUT.margins, ...(draftLayout.margins || {}) }
          }
        })
      });
      setItems((current) => current.map((item) => (
        String(item.id) === String(selectedTemplateId) ? data.item : item
      )));
      setPreview(null);
      showMessage('تنظیمات قالب ذخیره شد.');
    } catch (error) {
      showMessage(errorMessage(error, 'ذخیره تنظیمات قالب ناموفق بود.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <main className="admin-workspace-page admin-sheet-template-center" dir="rtl">
      <div className="admin-workspace-shell">
        <section className="admin-workspace-hero">
          <h1>مرکز مدیریت شقه‌ها</h1>
          <p>
            فارمت رسمی را تنظیم کنید، شقه را به استاد تخصیص دهید و پس از تکمیل نمرات، آن را برای تأیید و نتایج مدیریت نمایید.
          </p>
          <div className="admin-workspace-actions admin-sheet-hero-actions">
            <button type="button" className="admin-workspace-button-ghost" onClick={loadAll} disabled={busyAction === 'load'}>
              بروزرسانی
            </button>
            <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || !selectedTemplateId}>
              پیش‌نمایش
            </button>
          </div>
        </section>

        {message ? <div className={`admin-workspace-message ${messageTone === 'error' ? 'error' : ''}`}>{message}</div> : null}

        <section className="admin-workspace-grid">
          <article className="admin-workspace-card" data-span="12">
            <h2>۱. انتخاب فارمت رسمی</h2>
            <p className="admin-workspace-subtitle">فارمت‌ها به شکل افقی نمایش داده می‌شوند؛ یک فارمت را برای تنظیم یا تخصیص انتخاب نمایید.</p>

            <div className="admin-workspace-form">
              <div className="admin-workspace-field">
                <label htmlFor="sheet-type-filter">نوع شقه</label>
                <select id="sheet-type-filter" name="type" value={filters.type} onChange={updateFilter}>
                  {templateTypes.map((item) => (
                    <option key={item.id || 'all'} value={item.id}>{item.uiLabel}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-template-list">
                {filteredTemplates.length ? filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`admin-workspace-template-item ${String(selectedTemplateId) === String(template.id) ? 'active' : ''}`}
                    onClick={() => selectTemplate(template)}
                  >
                    <strong>{template.title}</strong>
                    <span>{getTypeLabel(template.type)}</span>
                    <em>{template.note || template.code}</em>
                  </button>
                )) : (
                  <div className="admin-workspace-empty">برای این نوع، شقه آماده پیدا نشد.</div>
                )}
              </div>
            </div>
          </article>

          {selectedTemplate?.type === 'exam' ? (
            <article className="admin-workspace-card admin-sheet-assignment-card" data-span="12">
              <div className="admin-education-card-head">
                <div>
                <h2>۲. ساخت و تخصیص شقه امتحان به استاد</h2>
                  <p className="admin-workspace-subtitle">مدیریت شقه را می‌سازد؛ استاد آن را در حساب خود تکمیل و برای تأیید می‌فرستد.</p>
                </div>
                <div className={`admin-workspace-badge ${assignmentScoreTotal === expectedScoreTotal ? 'good' : 'warning'}`}>
                  مجموع نمره: {formatNumber(assignmentScoreTotal)} از {formatNumber(expectedScoreTotal)}
                </div>
              </div>

              <div className="admin-sheet-assignment-grid">
                <label className="admin-workspace-field">
                  <span>سال تعلیمی</span>
                  <select name="academicYearId" value={assignment.academicYearId} onChange={updateAssignment} required>
                    <option value="">انتخاب سال</option>
                    {academicYears.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>دورهٔ تعلیمی</span>
                  <select name="assessmentPeriodId" value={assignment.assessmentPeriodId} onChange={updateAssignment} required>
                    <option value="">{assignmentTerms.length ? 'انتخاب دوره' : 'برای این سال دوره‌ای تعریف نشده است'}</option>
                    {assignmentTerms.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>استاد</span>
                  <select name="teacherId" value={assignment.teacherId} onChange={updateAssignment} required>
                    <option value="">انتخاب استاد</option>
                    {assignmentTeachers.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>صنف</span>
                  <select name="classId" value={assignment.classId} onChange={updateAssignment} required>
                    <option value="">انتخاب صنف</option>
                    {assignmentClasses.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>مضمون</span>
                  <select name="subjectId" value={assignment.subjectId} onChange={updateAssignment} required>
                    <option value="">انتخاب مضمون</option>
                    {assignmentSubjects.map((item) => <option key={item.id} value={item.id}>{item.name || item.title}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>نوع امتحان</span>
                  <select name="examTypeId" value={assignment.examTypeId} onChange={updateAssignment} required>
                    <option value="">انتخاب نوع امتحان</option>
                    {examTypes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>استاد ممیز</span>
                  <select name="reviewerUserId" value={assignment.reviewerUserId} onChange={updateAssignment}>
                    <option value="">هنگام تأیید تعیین شود</option>
                    {reviewers.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}
                  </select>
                </label>
                <label className="admin-workspace-field">
                  <span>ماه</span>
                  <input name="monthLabel" value={assignment.monthLabel} onChange={updateAssignment} placeholder="مثلاً سرطان" />
                </label>
                <label className="admin-workspace-field admin-sheet-date-field">
                  <span>تاریخ امتحان</span>
                  <AfghanDateInput name="heldAt" value={assignment.heldAt} onChange={(value) => setAssignment((current) => ({ ...current, heldAt: value }))} required showGregorianEquivalent />
                </label>
              </div>

              <div className="admin-sheet-score-strip">
                {SCORE_COMPONENTS.map((component) => (
                  <label key={component.key} className="admin-sheet-score-card">
                    <span>{component.label}</span>
                    <input type="number" min="0" name={component.key} value={assignment[component.key]} onChange={updateAssignment} />
                  </label>
                ))}
              </div>
              <p className="admin-workspace-hint">
                {assignmentScoreHint || 'صفر گذاشتن یک جزء نمره (مثلاً تقریری) کاملاً مجاز است؛ فقط لازم است مجموع چهار جزء دقیقاً برابر عدد بالا باشد. هر مضمون می‌تواند ترکیب متفاوتی داشته باشد.'}
              </p>

              <div className="admin-workspace-actions admin-workspace-section-actions">
                <button type="button" className="admin-workspace-button" onClick={createAssignedExamSheet} disabled={busyAction === 'assign-exam' || assignmentScoreTotal !== expectedScoreTotal}>
                  {busyAction === 'assign-exam' ? 'در حال ساخت...' : 'ایجاد و تخصیص به استاد'}
                </button>
              </div>

              <section className="admin-sheet-session-manager" aria-labelledby="assigned-sheets-heading">
                <div className="admin-sheet-session-manager-head">
                  <div>
                    <h3 id="assigned-sheets-heading">شقه‌های تخصیص‌شده</h3>
                    <p>
                      {filteredAssignedSessions.length
                        ? `نمایش ${formatNumber(assignedSessionRangeStart)} تا ${formatNumber(assignedSessionRangeEnd)} از ${formatNumber(filteredAssignedSessions.length)} شقه`
                        : 'هیچ شقه‌ای برای نمایش وجود ندارد.'}
                    </p>
                    <div className="admin-sheet-assignment-source-note">
                      <span>اینجا تخصیص تازهٔ صنف ساخته نمی‌شود؛ هر شقه به تخصیص فعال موجود در بخش «معرفی صنف به استاد» وصل است.</span>
                      <a href="/timetable/teacher-timetable-configurations">بازکردن معرفی صنف به استاد</a>
                    </div>
                  </div>
                  <div className="admin-sheet-session-tools">
                    <label>
                      <span>جست‌وجو</span>
                      <input
                        type="search"
                        value={assignedSessionQuery}
                        onChange={(event) => setAssignedSessionQuery(event.target.value)}
                        placeholder="استاد، مضمون یا صنف"
                        aria-label="جست‌وجوی شقه‌های تخصیص‌شده"
                      />
                    </label>
                    <label>
                      <span>وضعیت</span>
                      <select
                        value={assignedSessionStatus}
                        onChange={(event) => setAssignedSessionStatus(event.target.value)}
                        aria-label="فیلتر وضعیت شقه"
                      >
                        {SESSION_STATUS_OPTIONS.map((option) => (
                          <option key={option.id || 'all'} value={option.id}>{option.title}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {pagedAssignedSessions.length ? (
                  <div className="admin-sheet-session-strip" aria-label="شقه‌های تخصیص‌شده">
                    {pagedAssignedSessions.map((session) => (
                      <article key={session.id} className="admin-sheet-session-card" data-status={session.status || 'draft'}>
                        <button type="button" className="admin-sheet-session-card__main" onClick={() => selectAssignedSession(session)}>
                          <strong>{session.subject?.name || session.title}</strong>
                          <span>{session.teacherAssignment?.teacher?.name || 'استاد تعیین نشده'}</span>
                          <em>{session.schoolClass?.title || '---'} · {session.examType?.title || '---'} · {getSessionStatusLabel(session.status)}</em>
                        </button>
                        <div className="admin-sheet-session-card__actions">
                          <button
                            type="button"
                            className="admin-sheet-session-action"
                            onClick={() => syncAssignedSessionRoster(session)}
                            disabled={busyAction === `sync-roster:${session.id}` || !['draft', 'active'].includes(String(session.status || ''))}
                            title={['draft', 'active'].includes(String(session.status || '')) ? 'افزودن شاگردان جدید صنف بدون تغییر نمرات قبلی' : 'برای شقهٔ نهایی‌شده نخست نسخهٔ اصلاحی بسازید'}
                          >
                            {busyAction === `sync-roster:${session.id}` ? 'در حال همگام‌سازی…' : 'همگام‌سازی شاگردان'}
                          </button>
                          {['draft', 'active'].includes(String(session.status || '')) ? (
                            <button
                              type="button"
                              className="admin-sheet-session-action"
                              onClick={() => openSessionEditor(session)}
                              disabled={busyAction === `manage-session:${session.id}`}
                            >
                              {busyAction === `manage-session:${session.id}` ? 'در حال بازکردن…' : 'ویرایش'}
                            </button>
                          ) : null}
                          {String(session.status || '') === 'submitted' ? (
                            <button
                              type="button"
                              className="admin-sheet-session-action"
                              onClick={() => { window.location.href = `/grade-manager?status=submitted&session=${encodeURIComponent(session.id)}`; }}
                            >
                              بررسی و تأیید
                            </button>
                          ) : null}
                          <details className="admin-sheet-session-more">
                            <summary>بیشتر</summary>
                            <div className="admin-sheet-session-more__menu">
                              {String(session.status || '') === 'draft' ? (
                                <button type="button" onClick={() => deleteAssignedSession(session)} disabled={busyAction === `delete-session:${session.id}`}>حذف پیش‌نویس</button>
                              ) : null}
                              {String(session.status || '') === 'submitted' ? (
                                <button type="button" onClick={() => returnAssignedSessionForCorrection(session)} disabled={busyAction === `return-session:${session.id}`}>برگشت برای اصلاح</button>
                              ) : null}
                              {['approved', 'published', 'closed'].includes(String(session.status || '')) ? (
                                <button type="button" onClick={() => createAssignedSessionRevision(session)} disabled={busyAction === `revise-session:${session.id}`}>ساخت نسخهٔ اصلاحی</button>
                              ) : null}
                              {String(session.status || '') !== 'archived' ? (
                                <button type="button" onClick={() => archiveAssignedSession(session)} disabled={busyAction === `archive-session:${session.id}`}>آرشیف با دلیل</button>
                              ) : null}
                              {String(session.status || '') === 'archived' ? <span>این شقه آرشیف شده است.</span> : null}
                            </div>
                          </details>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="admin-workspace-empty">
                    {examSessions.length ? 'شقه‌ای مطابق جست‌وجو یا وضعیت انتخاب‌شده پیدا نشد.' : 'هنوز شقه‌ای تخصیص نشده است.'}
                  </div>
                )}

                {filteredAssignedSessions.length > ASSIGNED_SESSION_PAGE_SIZE ? (
                  <div className="admin-workspace-actions admin-education-pagination">
                    <button
                      type="button"
                      className="admin-workspace-button-ghost"
                      onClick={() => setAssignedSessionPage((current) => Math.max(1, current - 1))}
                      disabled={assignedSessionPage <= 1}
                    >
                      صفحه قبلی
                    </button>
                    <span className="admin-workspace-badge info">
                      صفحه {formatNumber(assignedSessionPage)} از {formatNumber(assignedSessionPageCount)}
                    </span>
                    <button
                      type="button"
                      className="admin-workspace-button-ghost"
                      onClick={() => setAssignedSessionPage((current) => Math.min(assignedSessionPageCount, current + 1))}
                      disabled={assignedSessionPage >= assignedSessionPageCount}
                    >
                      صفحه بعدی
                    </button>
                  </div>
                ) : null}
              </section>
            </article>
          ) : null}

          <article className="admin-workspace-card" data-span="12">
            <div className="admin-education-card-head">
              <div>
                <h2>{selectedTemplate?.type === 'exam' ? '۳. تنظیم ظاهر و ستون‌های شقه' : selectedTemplate?.title || 'شقه انتخاب نشده'}</h2>
                <p className="admin-workspace-subtitle">{getTemplateHint(selectedTemplate)}</p>
              </div>
              {selectedTemplate ? (
                <div className="admin-workspace-badges">
                  <span className="admin-workspace-badge good">آماده</span>
                  <span className="admin-workspace-badge info">{getTypeLabel(selectedTemplate.type)}</span>
                </div>
              ) : null}
            </div>

            <div className="admin-workspace-form-grid">
              <div className="admin-workspace-field">
                <label htmlFor="sheet-academic-year">سال تعلیمی</label>
                <select id="sheet-academic-year" name="academicYearId" value={filters.academicYearId} onChange={updateFilter}>
                  <option value="">همه سال‌ها</option>
                  {yearOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-class">صنف</label>
                <select id="sheet-class" name="classId" value={filters.classId} onChange={updateFilter}>
                  <option value="">همه صنف‌ها</option>
                  {classOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-term">دوره / ترم</label>
                <select id="sheet-term" name="termId" value={filters.termId} onChange={updateFilter}>
                  <option value="">همه دوره‌ها</option>
                  {termOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-exam">جلسه امتحان</label>
                <select id="sheet-exam" name="examId" value={filters.examId} onChange={updateFilter}>
                  <option value="">انتخاب نشده</option>
                  {filteredExamSessionOptions.map((item) => (
                    <option key={getOptionId(item)} value={getOptionId(item)}>{getOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-month">ماه</label>
                <input id="sheet-month" name="month" value={filters.month} onChange={updateFilter} placeholder="مثلا حمل یا 1403-01" />
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-date-from">از تاریخ</label>
                <AfghanDateInput id="sheet-date-from" name="dateFrom" value={filters.dateFrom} onChange={(value) => setFilters((current) => ({ ...current, dateFrom: value }))} />
              </div>

              <div className="admin-workspace-field">
                <label htmlFor="sheet-date-to">تا تاریخ</label>
                <AfghanDateInput id="sheet-date-to" name="dateTo" value={filters.dateTo} onChange={(value) => setFilters((current) => ({ ...current, dateTo: value }))} />
              </div>
            </div>

            <div className="admin-workspace-form-grid">
              <div className="admin-workspace-field">
                <label htmlFor="sheet-layout-font">فونت</label>
                <select id="sheet-layout-font" name="font" value={draftLayout.font} onChange={updateLayout} disabled={!selectedTemplate}>
                  <option value="B Zar">B Zar</option>
                  <option value="B Mitra">B Mitra</option>
                  <option value="Tahoma">Tahoma</option>
                  <option value="Arial">Arial</option>
                </select>
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="sheet-layout-font-size">سایز فونت</label>
                <input id="sheet-layout-font-size" name="fontSize" type="number" min="8" max="32" value={draftLayout.fontSize} onChange={updateLayout} disabled={!selectedTemplate} />
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="sheet-layout-orientation">جهت صفحه</label>
                <select id="sheet-layout-orientation" name="orientation" value={draftLayout.orientation} onChange={updateLayout} disabled={!selectedTemplate}>
                  <option value="portrait">A4 عمودی</option>
                  <option value="landscape">A4 افقی</option>
                </select>
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="sheet-layout-header-text">عنوان بالای شقه</label>
                <input id="sheet-layout-header-text" name="headerText" value={draftLayout.headerText || ''} onChange={updateLayout} disabled={!selectedTemplate} placeholder="نام مکتب یا عنوان رسمی" />
              </div>
              <div className="admin-workspace-field">
                <label htmlFor="sheet-layout-footer-text">متن پایین شقه</label>
                <input id="sheet-layout-footer-text" name="footerText" value={draftLayout.footerText || ''} onChange={updateLayout} disabled={!selectedTemplate} placeholder="آدرس یا یادداشت رسمی" />
              </div>
              <div className="admin-sheet-layout-toggle-strip">
                <label className="admin-sheet-layout-toggle">
                  <input name="showHeader" type="checkbox" checked={Boolean(draftLayout.showHeader)} onChange={updateLayout} disabled={!selectedTemplate} />
                  <span><strong>نمایش عنوان بالای شقه</strong><small>عنوان و مشخصات رسمی در بالای صفحه چاپ شود.</small></span>
                </label>
                <label className="admin-sheet-layout-toggle">
                  <input name="showFooter" type="checkbox" checked={Boolean(draftLayout.showFooter)} onChange={updateLayout} disabled={!selectedTemplate} />
                  <span><strong>نمایش متن پایین شقه</strong><small>متن فوتر در پایین نسخهٔ چاپی نشان داده شود.</small></span>
                </label>
                <label className="admin-sheet-layout-toggle">
                  <input name="showLogo" type="checkbox" checked={Boolean(draftLayout.showLogo)} onChange={updateLayout} disabled={!selectedTemplate} />
                  <span><strong>نمایش لوگوی مکتب</strong><small>لوگوی ثبت‌شدهٔ مکتب در سربرگ چاپ شود.</small></span>
                </label>
              </div>
            </div>

            <div className="admin-sheet-column-strip" aria-label="ستون‌های شقه">
              {draftColumns.map((column, index) => (
                <article className={`admin-sheet-column-card ${column.visible === false ? 'is-hidden' : ''}`} key={`${column.key}-${index}`}>
                  <div className="admin-sheet-column-card__head">
                    <strong>{index + 1}. {column.label || column.key}</strong>
                    <label><input type="checkbox" checked={column.visible !== false} onChange={(event) => updateColumn(index, { visible: event.target.checked })} disabled={!selectedTemplate} /> نمایش</label>
                  </div>
                  <label><span>کلید معلومات</span><input value={column.key} readOnly /></label>
                  <label><span>عنوان ستون</span><input value={column.label} onChange={(event) => updateColumn(index, { label: event.target.value })} disabled={!selectedTemplate} /></label>
                  <label><span>عنوان گروه</span><input value={column.group || ''} onChange={(event) => updateColumn(index, { group: event.target.value })} disabled={!selectedTemplate} /></label>
                  <label><span>عرض ستون</span><input type="number" min="4" max="80" value={column.width} onChange={(event) => updateColumn(index, { width: event.target.value })} disabled={!selectedTemplate} /></label>
                  <div className="admin-workspace-actions">
                    <button type="button" className="admin-workspace-button-ghost" onClick={() => moveColumn(index, 'up')} disabled={!selectedTemplate || index === 0}>قبلی</button>
                    <button type="button" className="admin-workspace-button-ghost" onClick={() => moveColumn(index, 'down')} disabled={!selectedTemplate || index === draftColumns.length - 1}>بعدی</button>
                    <button type="button" className="admin-workspace-button-ghost" onClick={() => removeColumn(index)} disabled={!selectedTemplate || draftColumns.length <= 1}>حذف</button>
                  </div>
                </article>
              ))}
            </div>

            <div className="admin-sheet-command-bar" role="toolbar" aria-label="عملیات قالب و خروجی شقه">
              <div className="admin-sheet-command-group" aria-label="مدیریت ستون‌ها">
                <button type="button" className="admin-workspace-button-secondary" onClick={addColumn} disabled={!selectedTemplate} data-testid="sheet-add-column">
                  افزودن ستون سفارشی
                </button>
                <select
                  className="admin-sheet-restore-select"
                  value={restoreColumnKey}
                  onChange={(event) => setRestoreColumnKey(event.target.value)}
                  disabled={!selectedTemplate || !restorableColumns.length}
                  aria-label="ستون حذف‌شده برای بازگرداندن"
                >
                  <option value="">{restorableColumns.length ? 'انتخاب ستون' : 'ستونی حذف نشده است'}</option>
                  {restorableColumns.map((column) => <option key={column.key} value={column.key}>{column.label}</option>)}
                </select>
                <button type="button" className="admin-workspace-button-secondary" onClick={restoreColumn} disabled={!selectedTemplate || !restoreColumnKey} data-testid="sheet-restore-column">
                  بازگرداندن ستون
                </button>
              </div>

              <div className="admin-sheet-command-group" aria-label="تنظیمات قالب">
                <button type="button" className="admin-workspace-button" onClick={saveTemplateSettings} disabled={busyAction === 'save-template' || !selectedTemplateId} data-testid="sheet-save-template">
                  {busyAction === 'save-template' ? 'در حال ذخیره…' : 'ذخیره قالب'}
                </button>
                <button type="button" className="admin-workspace-button-ghost" onClick={resetTemplateDraft} disabled={!selectedTemplate} data-testid="sheet-reset-template">
                  برگشت تنظیمات
                </button>
              </div>

              <div className="admin-sheet-command-group" aria-label="پیش‌نمایش و خروجی‌ها">
                <button type="button" className="admin-workspace-button" onClick={runPreview} disabled={busyAction === 'preview' || !selectedTemplateId} data-testid="sheet-preview">
                  {busyAction === 'preview' ? 'در حال نمایش…' : 'پیش‌نمایش'}
                </button>
                <button type="button" className="admin-workspace-button-secondary" onClick={() => exportFromTemplate('pdf')} disabled={busyAction === 'export:pdf' || !selectedTemplateId} data-testid="sheet-export-pdf">
                  PDF
                </button>
                <button type="button" className="admin-workspace-button-secondary" onClick={() => exportFromTemplate('xlsx')} disabled={busyAction === 'export:xlsx' || !selectedTemplateId} data-testid="sheet-export-xlsx">
                  Excel
                </button>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => exportFromTemplate('csv')} disabled={busyAction === 'export:csv' || !selectedTemplateId} data-testid="sheet-export-csv">
                  CSV
                </button>
                <button type="button" className="admin-workspace-button-ghost" onClick={() => exportFromTemplate('print')} disabled={busyAction === 'export:print' || !selectedTemplateId} data-testid="sheet-export-print">
                  چاپ
                </button>
              </div>

              {selectedTemplate?.type === 'exam' && (
                <div className="admin-sheet-command-group" aria-label="شقهٔ سفید برای امتحان حضوری">
                  <button
                    type="button"
                    className="admin-workspace-button-ghost"
                    onClick={() => exportFromTemplate('print', { blank: true })}
                    disabled={busyAction === 'export:print:blank' || !selectedTemplateId || !filters.examId}
                    title={filters.examId ? 'چاپ شقهٔ سفید برای گرفتن امتحان حضوری' : 'اول جلسهٔ امتحان را از فیلترها انتخاب کنید'}
                    data-testid="sheet-export-print-blank"
                  >
                    چاپ شقهٔ سفید
                  </button>
                  <button
                    type="button"
                    className="admin-workspace-button-secondary"
                    onClick={() => exportFromTemplate('pdf', { blank: true })}
                    disabled={busyAction === 'export:pdf:blank' || !selectedTemplateId || !filters.examId}
                    title={filters.examId ? 'دانلود PDF شقهٔ سفید برای گرفتن امتحان حضوری' : 'اول جلسهٔ امتحان را از فیلترها انتخاب کنید'}
                    data-testid="sheet-export-pdf-blank"
                  >
                    PDF شقهٔ سفید
                  </button>
                </div>
              )}

              <div className="admin-sheet-command-group" aria-label="عملیات فیلتر">
                <button type="button" className="admin-workspace-button-ghost" onClick={resetFilters} data-testid="sheet-reset-filters">
                  پاک کردن فیلتر
                </button>
              </div>
            </div>
          </article>

          <article className="admin-workspace-card">
            <div className="admin-education-card-head">
              <div>
                <h2>پیش‌نمایش شقه</h2>
                <p className="admin-workspace-subtitle">
                  {preview?.generatedAt ? `تولید شده در ${toLocaleDateTime(preview.generatedAt)}` : getPreviewMessage(preview)}
                </p>
              </div>
              <div className="admin-workspace-chip-row">
                <span className="admin-workspace-chip">{selectedTemplate?.code || 'بدون کد'}</span>
                <span className="admin-workspace-chip">{previewRows.length ? `${formatNumber(previewRows.length)} ردیف` : 'بدون ردیف'}</span>
              </div>
            </div>

            {preview ? (
              <>
                <div className="admin-workspace-summary admin-workspace-preview-summary">
                  {summaryEntries.map((item) => (
                    <div className="admin-workspace-stat" key={`${item.label}-${item.value}`}>
                      <strong>{item.value}</strong>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                {previewRows.length && previewColumns.length ? (
                  <div className="admin-workspace-table-wrap">
                    <table className="admin-workspace-table">
                      <thead>
                        <tr>
                          {previewColumns.map((column) => (
                            <th key={column.key}>{column.label || column.key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, rowIndex) => (
                          <tr key={`preview-row-${rowIndex}`}>
                            {previewColumns.map((column) => (
                              <td key={`${rowIndex}-${column.key}`}>{row?.[column.key] ?? ''}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="admin-workspace-empty">{getPreviewMessage(preview)}</div>
                )}
              </>
            ) : (
              <div className="admin-workspace-empty">هنوز پیش‌نمایش تولید نشده است.</div>
            )}
          </article>
        </section>

        {editingSession ? (
          <div className="admin-sheet-session-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeSessionEditor()}>
            <section className="admin-sheet-session-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-exam-session-heading">
              <div className="admin-sheet-session-dialog__head">
                <div>
                  <h2 id="edit-exam-session-heading">ویرایش تخصیص شقه</h2>
                  <p>{editingSession.subject?.name || editingSession.title} · {getSessionStatusLabel(editingSession.status)}</p>
                </div>
                <button type="button" className="admin-workspace-button-ghost" onClick={closeSessionEditor}>بستن</button>
              </div>

              <div className="admin-sheet-session-policy-note">
                <strong>ارتباط با معرفی صنف به استاد</strong>
                <span>این فورم تخصیص تازه نمی‌سازد؛ فقط یکی از تخصیص‌های فعال موجود در بخش «معرفی صنف به استاد» را به شقه وصل می‌کند.</span>
              </div>

              {!editingManagement?.permissions?.canEditStructure ? (
                <div className="admin-sheet-session-lock-note">
                  نمره یا سند وابسته موجود است؛ سال، صنف، مضمون، نوع امتحان و اجزای نمره قفل‌اند. استاد، ممیز، تاریخ، ماه و یادداشت هنوز قابل ویرایش است.
                </div>
              ) : null}

              <div className="admin-sheet-session-edit-grid">
                <label><span>سال تعلیمی</span><select name="academicYearId" value={sessionEdit.academicYearId} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure}><option value="">انتخاب سال</option>{academicYears.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}</select></label>
                <label><span>دوره</span><select name="assessmentPeriodId" value={sessionEdit.assessmentPeriodId} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure}><option value="">انتخاب دوره</option>{editTerms.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}</select></label>
                <label><span>استاد</span><select name="teacherId" value={sessionEdit.teacherId} onChange={updateSessionEdit}><option value="">انتخاب استاد</option>{editTeachers.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select></label>
                <label><span>صنف</span><select name="classId" value={sessionEdit.classId} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure}><option value="">انتخاب صنف</option>{editClasses.map((item) => <option key={item.id} value={item.id}>{item.title || item.code}</option>)}</select></label>
                <label><span>مضمون</span><select name="subjectId" value={sessionEdit.subjectId} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure}><option value="">انتخاب مضمون</option>{editSubjects.map((item) => <option key={item.id} value={item.id}>{item.name || item.title}</option>)}</select></label>
                <label><span>نوع امتحان</span><select name="examTypeId" value={sessionEdit.examTypeId} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure}><option value="">انتخاب نوع امتحان</option>{examTypes.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                <label><span>فارمت شقه</span><select name="sheetTemplateId" value={sessionEdit.sheetTemplateId} onChange={updateSessionEdit}><option value="">فارمت پیش‌فرض</option>{items.filter((item) => item.type === 'exam' && item.isActive !== false).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
                <label><span>استاد ممیز</span><select name="reviewerUserId" value={sessionEdit.reviewerUserId} onChange={updateSessionEdit}><option value="">هنگام تأیید تعیین شود</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select></label>
                <label><span>ماه</span><input name="monthLabel" value={sessionEdit.monthLabel} onChange={updateSessionEdit} placeholder="مثلاً سرطان" /></label>
                <label className="admin-sheet-session-edit-date"><span>تاریخ امتحان</span><AfghanDateInput name="heldAt" value={sessionEdit.heldAt} onChange={(value) => setSessionEdit((current) => ({ ...current, heldAt: value }))} /></label>
                <label className="admin-sheet-session-edit-note"><span>یادداشت</span><input name="note" value={sessionEdit.note} onChange={updateSessionEdit} placeholder="یادداشت مدیریتی" /></label>
              </div>

              <div className="admin-sheet-score-strip admin-sheet-session-edit-scores">
                {SCORE_COMPONENTS.map((component) => (
                  <label key={component.key} className="admin-sheet-score-card">
                    <span>{component.label}</span>
                    <input type="number" min="0" name={component.key} value={sessionEdit[component.key]} onChange={updateSessionEdit} disabled={!editingManagement?.permissions?.canEditStructure} />
                  </label>
                ))}
              </div>

              <div className={`admin-sheet-session-score-total ${editScoreTotal === expectedEditScoreTotal ? 'is-valid' : 'is-invalid'}`}>
                مجموع نمره: {formatNumber(editScoreTotal)} از {formatNumber(expectedEditScoreTotal)}
              </div>
              {editingManagement?.permissions?.canEditStructure && (
                <p className="admin-workspace-hint">
                  صفر گذاشتن یک جزء نمره کاملاً مجاز است؛ فقط لازم است مجموع چهار جزء دقیقاً برابر عدد بالا باشد.
                </p>
              )}

              <div className="admin-sheet-session-dialog__actions">
                <button type="button" className="admin-workspace-button" onClick={saveSessionEdit} disabled={busyAction === 'update-session' || (editingManagement?.permissions?.canEditStructure && editScoreTotal !== expectedEditScoreTotal) || !selectedEditAssignment?.id}>
                  {busyAction === 'update-session' ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
                </button>
                <button type="button" className="admin-workspace-button-ghost" onClick={closeSessionEditor}>انصراف</button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
