import React, { useEffect, useMemo, useState } from 'react';
import './GradeManager.css';

import { API_BASE } from '../config/api';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const COMPONENT_FIELDS = [
  { key: 'attendanceScore', maxKey: 'attendanceMax', label: 'حاضری', derived: true },
  { key: 'writtenScore', maxKey: 'writtenMax', label: 'تحریری' },
  { key: 'oralScore', maxKey: 'oralMax', label: 'تقریری' },
  { key: 'classActivityScore', maxKey: 'classActivityMax', label: 'فعالیت صنفی' },
  { key: 'homeworkScore', maxKey: 'homeworkMax', label: 'کارخانگی' }
];

const STATUS_OPTIONS = [
  { value: 'recorded', label: 'ثبت‌شده' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'absent', label: 'غایب' },
  { value: 'excused', label: 'معذور' },
  { value: 'not_applicable', label: 'شامل امتحان نبوده' }
];

const STATUS_LABELS = STATUS_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const SCORE_BLOCKING_STATUSES = new Set(['absent', 'excused', 'not_applicable']);
const SCORE_CLEARING_STATUSES = new Set(['pending', 'absent', 'excused', 'not_applicable']);

const INITIAL_FILTERS = {
  academicYearId: '',
  assessmentPeriodId: '',
  teacherId: '',
  classId: '',
  subjectId: '',
  examTypeId: '',
  monthLabel: '',
  heldAt: '',
  reviewerUserId: '',
  reviewedByName: '',
  attendanceMax: '0',
  writtenMax: '25',
  oralMax: '25',
  classActivityMax: '25',
  homeworkMax: '25'
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const userRole = () => String(localStorage.getItem('role') || '').trim().toLowerCase();
const userId = () => String(localStorage.getItem('userId') || '').trim();

const toFaNumber = (value) => Number(value || 0).toLocaleString('fa-AF-u-ca-persian');

const FA_ONES = ['صفر', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const FA_TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نزده'];
const FA_TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const FA_HUNDREDS = ['', 'یکصد', 'دوصد', 'سه صد', 'چهارصد', 'پنجصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];

const numberToFaWords = (value) => {
  const number = Math.round(toSafeNumber(value));
  if (number === 0) return FA_ONES[0];
  if (number < 0) return `منفی ${numberToFaWords(Math.abs(number))}`;
  if (number < 10) return FA_ONES[number];
  if (number < 20) return FA_TEENS[number - 10];
  if (number < 100) {
    const tens = Math.floor(number / 10);
    const ones = number % 10;
    return ones ? `${FA_TENS[tens]} و ${FA_ONES[ones]}` : FA_TENS[tens];
  }
  if (number < 1000) {
    const hundreds = Math.floor(number / 100);
    const rest = number % 100;
    return rest ? `${FA_HUNDREDS[hundreds]} و ${numberToFaWords(rest)}` : FA_HUNDREDS[hundreds];
  }
  return toFaNumber(number);
};

const toInputDate = (value) => {
  return toGregorianDateInputValue(value);
};

const toDisplayDate = (value) => {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }) || '---';
};

const toSafeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const encodeParams = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
};

const sanitizeExamNote = (value = '') => {
  const note = String(value || '').trim();
  return note === 'initialized_roster' ? '' : note;
};

const isMonthlyExamType = (item = {}) => {
  const code = String(item?.code || '').trim().toUpperCase();
  const title = String(item?.title || '').trim();
  return code === 'MONTHLY' || title.includes('ماهوار');
};

const getOfficialExamDefaults = (item = {}) => {
  const code = String(item?.code || '').trim().toUpperCase();
  if (code === 'FOUR_HALF_MONTH') {
    return { attendanceMax: '0', writtenMax: '20', oralMax: '10', classActivityMax: '5', homeworkMax: '5' };
  }
  if (code === 'ANNUAL') {
    return { attendanceMax: '0', writtenMax: '40', oralMax: '10', classActivityMax: '5', homeworkMax: '5' };
  }
  return null;
};

const buildSessionScopeFilters = (filters = {}, { isInstructorView = false } = {}) => ({
  sessionKind: 'subject_sheet',
  academicYearId: filters.academicYearId,
  assessmentPeriodId: filters.assessmentPeriodId,
  classId: filters.classId,
  mine: isInstructorView ? 'true' : ''
});

const buildRowState = (item = {}) => ({
  studentMembershipId: item?.membership?.id || '',
  rowNumber: item?.row?.rowNumber || 0,
  admissionNo: item?.row?.admissionNo || '',
  studentName: item?.row?.studentName || '',
  fatherName: item?.row?.fatherName || '',
  attendanceScore: item?.row?.attendanceScore == null ? '' : String(item.row.attendanceScore),
  writtenScore: item?.row?.writtenScore == null ? '' : String(item.row.writtenScore),
  oralScore: item?.row?.oralScore == null ? '' : String(item.row.oralScore),
  classActivityScore: item?.row?.classActivityScore == null ? '' : String(item.row.classActivityScore),
  homeworkScore: item?.row?.homeworkScore == null ? '' : String(item.row.homeworkScore),
  totalInWords: item?.row?.totalInWords || '',
  note: sanitizeExamNote(item?.row?.note),
  membershipStatus: item?.row?.membershipStatus || item?.membership?.status || '',
  membershipStatusLabel: item?.row?.membershipStatusLabel || item?.membership?.statusLabel || '',
  markStatus: item?.row?.markStatus || 'pending',
  resultStatus: item?.row?.resultStatus || '',
  rank: item?.row?.rank ?? null
});

const computeRowTotal = (row = {}, fields = COMPONENT_FIELDS) => fields.reduce((sum, field) => sum + toSafeNumber(row[field.key]), 0);

const rowBlocksScoreInput = (status = '') => SCORE_BLOCKING_STATUSES.has(String(status || '').trim());
const rowNeedsScoreReset = (status = '') => SCORE_CLEARING_STATUSES.has(String(status || '').trim());

async function fetchJson(url, options = {}) {
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers || {})
  };
  if (options.body) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const response = await fetch(url, {
    ...options,
    headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success === false) {
    throw new Error(data?.message || 'request_failed');
  }
  return data;
}

async function fetchBinary(url, responseType = 'blob') {
  const response = await fetch(url, { headers: { ...getAuthHeaders() } });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.message || 'request_failed');
  }
  if (responseType === 'text') {
    return response.text();
  }
  return response.blob();
}

export default function GradeManager() {
  const [referenceData, setReferenceData] = useState({
    academicYears: [],
    assessmentPeriods: [],
    classes: [],
    subjects: [],
    examTypes: [],
    teacherAssignments: [],
    reviewers: []
  });
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [rows, setRows] = useState([]);
  const [dirtyIds, setDirtyIds] = useState({});
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('muted');
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [revising, setRevising] = useState(false);

  const isInstructor = userRole() === 'instructor';
  const selectedSession = useMemo(
    () => sessions.find((item) => String(item.id) === String(selectedSessionId)) || null,
    [sessions, selectedSessionId]
  );

  const scopedAssignments = useMemo(() => (
    (referenceData.teacherAssignments || []).filter((item) => (
      !isInstructor || String(item?.teacher?.id || '') === String(userId())
    ))
  ), [referenceData.teacherAssignments, isInstructor]);

  const visibleExamTypes = useMemo(
    () => (referenceData.examTypes || []).filter((item) => !isMonthlyExamType(item)),
    [referenceData.examTypes]
  );

  const teacherOptions = useMemo(() => (
    Array.from(
      new Map(
        scopedAssignments
          .filter((item) => item?.teacher?.id)
          .filter((item) => !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId))
          .map((item) => [String(item.teacher.id), item.teacher])
      ).values()
    ).sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
  ), [scopedAssignments, filters.academicYearId]);

  const filteredClasses = useMemo(() => {
    const fallbackClasses = referenceData.classes.filter((item) => (
      !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId)
    ));
    if (!isInstructor && !filters.teacherId) {
      return [];
    }
    if (!isInstructor && !scopedAssignments.length) {
      return fallbackClasses;
    }
    const sourceAssignments = scopedAssignments.filter((item) => (
      (!filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId))
      && (isInstructor || !filters.teacherId || String(item?.teacher?.id || '') === String(filters.teacherId))
    ));
    if (!sourceAssignments.length) {
      return fallbackClasses;
    }
    return Array.from(
      new Map(
        sourceAssignments
          .filter((item) => item?.schoolClass?.id)
          .map((item) => [String(item.schoolClass.id), item.schoolClass])
      ).values()
    );
  }, [referenceData.classes, scopedAssignments, filters.academicYearId, filters.teacherId, isInstructor]);

  const filteredSubjects = useMemo(() => {
    const fallbackSubjects = referenceData.subjects.filter((item) => {
      if (!filters.classId) return true;
      const selectedClass = referenceData.classes.find((entry) => String(entry.id) === String(filters.classId));
      const gradeLevel = Number(selectedClass?.gradeLevel || selectedClass?.grade || 0);
      if (!gradeLevel || !Array.isArray(item.gradeLevels) || !item.gradeLevels.length) return true;
      return item.gradeLevels.map(Number).includes(gradeLevel);
    });
    if (!isInstructor && !filters.teacherId) {
      return [];
    }
    if (!isInstructor && !scopedAssignments.length) {
      return fallbackSubjects;
    }
    const sourceAssignments = scopedAssignments.filter((item) => {
      const matchesYear = !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId);
      const matchesTeacher = isInstructor || !filters.teacherId || String(item?.teacher?.id || '') === String(filters.teacherId);
      const matchesClass = !filters.classId || String(item?.schoolClass?.id || '') === String(filters.classId);
      return matchesYear && matchesTeacher && matchesClass;
    });
    if (!sourceAssignments.length) {
      return fallbackSubjects;
    }
    return Array.from(
      new Map(
        sourceAssignments
          .filter((item) => item?.subject?.id)
          .map((item) => [String(item.subject.id), item.subject])
      ).values()
    );
  }, [referenceData.subjects, referenceData.classes, scopedAssignments, filters.academicYearId, filters.teacherId, filters.classId, isInstructor]);

  const scoreComponents = useMemo(() => ({
    attendanceMax: toSafeNumber(sheet?.scoreComponents?.attendanceMax ?? filters.attendanceMax),
    writtenMax: toSafeNumber(sheet?.scoreComponents?.writtenMax ?? filters.writtenMax),
    oralMax: toSafeNumber(sheet?.scoreComponents?.oralMax ?? filters.oralMax),
    classActivityMax: toSafeNumber(sheet?.scoreComponents?.classActivityMax ?? filters.classActivityMax),
    homeworkMax: toSafeNumber(sheet?.scoreComponents?.homeworkMax ?? filters.homeworkMax)
  }), [sheet?.scoreComponents, filters.attendanceMax, filters.writtenMax, filters.oralMax, filters.classActivityMax, filters.homeworkMax]);
  const activeComponentFields = useMemo(() => COMPONENT_FIELDS.filter((field) => (
    Number(scoreComponents[field.maxKey] || 0) > 0
  )), [scoreComponents]);

  const dirtyCount = useMemo(
    () => Object.values(dirtyIds).filter(Boolean).length,
    [dirtyIds]
  );
  const policyMismatch = sheet?.session?.scoringPolicy?.compatible === false;
  const sheetLocked = sheet?.isEditable === false || policyMismatch;
  const currentSessionStatus = String(sheet?.session?.status || selectedSession?.status || 'draft');
  const nextWorkflowStatus = (() => {
    if (['draft', 'active'].includes(currentSessionStatus)) return 'submitted';
    if (!isInstructor && currentSessionStatus === 'submitted') return 'approved';
    return '';
  })();
  const workflowActionLabel = {
    submitted: 'ارسال برای تأیید',
    approved: 'تأیید شقه',
    published: 'نشر نهایی'
  }[nextWorkflowStatus] || 'تکمیل شده';

  const applyMessage = (text, tone = 'muted') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const loadReferenceData = async () => {
    setLoadingRefs(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/exams/reference-data`);
      setReferenceData({
        academicYears: data.academicYears || [],
        assessmentPeriods: data.assessmentPeriods || [],
        classes: data.classes || [],
        subjects: data.subjects || [],
        examTypes: data.examTypes || [],
        teacherAssignments: data.teacherAssignments || [],
        reviewers: data.reviewers || []
      });

      const activeYear = (data.academicYears || []).find((item) => item.isActive) || data.academicYears?.[0] || null;
      const activeTerm = (data.assessmentPeriods || []).find((item) => item.isActive && String(item?.academicYear?.id || '') === String(activeYear?.id || ''))
        || (data.assessmentPeriods || []).find((item) => String(item?.academicYear?.id || '') === String(activeYear?.id || ''))
        || data.assessmentPeriods?.[0]
        || null;
      const availableExamTypes = (data.examTypes || []).filter((item) => !isMonthlyExamType(item));
      const defaultExamType = availableExamTypes?.[0]
        || null;
      const officialDefaults = getOfficialExamDefaults(defaultExamType);
      const defaultAssignment = (data.teacherAssignments || []).find((item) => (
        !isInstructor || String(item?.teacher?.id || '') === String(userId())
      )) || null;
      const defaultTeacher = defaultAssignment?.teacher || (!isInstructor
        ? Array.from(
            new Map(
              (data.teacherAssignments || [])
                .filter((item) => item?.teacher?.id)
                .map((item) => [String(item.teacher.id), item.teacher])
            ).values()
          )[0]
        : null);
      const defaultClass = (data.classes || []).find((item) => (
        !activeYear?.id || String(item?.academicYear?.id || '') === String(activeYear.id)
      )) || data.classes?.[0] || null;
      const defaultSubject = defaultAssignment?.subject || null;

      setFilters((prev) => ({
        ...prev,
        academicYearId: prev.academicYearId || defaultAssignment?.academicYear?.id || activeYear?.id || '',
        assessmentPeriodId: prev.assessmentPeriodId || defaultAssignment?.assessmentPeriod?.id || activeTerm?.id || '',
        teacherId: prev.teacherId || defaultTeacher?.id || '',
        classId: prev.classId || defaultAssignment?.schoolClass?.id || (!isInstructor && defaultTeacher ? '' : defaultClass?.id || '') || '',
        subjectId: prev.subjectId || defaultSubject?.id || '',
        examTypeId: prev.examTypeId || defaultExamType?.id || '',
        ...(officialDefaults || {})
      }));
    } catch {
      applyMessage('بارگیری معلومات مرجع امتحانات موفق نشد.', 'error');
    } finally {
      setLoadingRefs(false);
    }
  };

  const loadSessions = async (nextFilters = filters, preferredSessionId = '') => {
    setLoadingSessions(true);
    try {
      const query = encodeParams(buildSessionScopeFilters(nextFilters, { isInstructorView: isInstructor }));
      const data = await fetchJson(`${API_BASE}/api/exams/sessions${query ? `?${query}` : ''}`);
      const nextItems = data.items || [];
      setSessions(nextItems);

      const targetId = preferredSessionId && nextItems.some((item) => String(item.id) === String(preferredSessionId))
        ? preferredSessionId
        : selectedSessionId && nextItems.some((item) => String(item.id) === String(selectedSessionId))
          ? selectedSessionId
          : nextItems[0]?.id || '';
      setSelectedSessionId(targetId);
    } catch {
      applyMessage('بارگیری فهرست شقه‌ها موفق نشد.', 'error');
      setSessions([]);
      setSelectedSessionId('');
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadSheet = async (sessionId) => {
    if (!sessionId) {
      setSheet(null);
      setRows([]);
      setDirtyIds({});
      return;
    }
    setLoadingSheet(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/exams/sessions/${sessionId}/marks`);
      setSheet(data);
      setRows((data.items || []).map(buildRowState));
      setDirtyIds({});
      setFilters((prev) => ({
        ...prev,
        heldAt: toInputDate(data?.session?.heldAt),
        monthLabel: data?.session?.monthLabel || prev.monthLabel,
        reviewerUserId: data?.session?.reviewerUserId ?? '',
        reviewedByName: data?.session?.reviewedByName ?? '',
        attendanceMax: String(data?.scoreComponents?.attendanceMax ?? prev.attendanceMax),
        writtenMax: String(data?.scoreComponents?.writtenMax ?? prev.writtenMax),
        oralMax: String(data?.scoreComponents?.oralMax ?? prev.oralMax),
        classActivityMax: String(data?.scoreComponents?.classActivityMax ?? prev.classActivityMax),
        homeworkMax: String(data?.scoreComponents?.homeworkMax ?? prev.homeworkMax)
      }));
    } catch {
      applyMessage('بارگیری شقه انتخاب‌شده موفق نشد.', 'error');
      setSheet(null);
      setRows([]);
      setDirtyIds({});
    } finally {
      setLoadingSheet(false);
    }
  };

  useEffect(() => {
    loadReferenceData();
  }, []);

  useEffect(() => {
    if (!loadingRefs) {
      loadSessions(filters);
    }
  }, [loadingRefs]);

  useEffect(() => {
    loadSheet(selectedSessionId);
  }, [selectedSessionId]);

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'academicYearId') {
        const nextTerm = referenceData.assessmentPeriods.find((item) => item.isActive && String(item?.academicYear?.id || '') === String(value))
          || referenceData.assessmentPeriods.find((item) => String(item?.academicYear?.id || '') === String(value))
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
      if (name === 'classId') {
        next.subjectId = '';
      }
      if (name === 'examTypeId') {
        const selectedExamType = referenceData.examTypes.find((item) => String(item.id) === String(value));
        Object.assign(next, getOfficialExamDefaults(selectedExamType) || {});
      }
      return next;
    });
  };

  const handleSearch = () => {
    loadSessions(filters);
  };

  const handleRowChange = (studentMembershipId, field, value) => {
    setRows((prev) => prev.map((row) => {
      if (String(row.studentMembershipId) !== String(studentMembershipId)) return row;
      const nextRow = { ...row, [field]: value };
      if (COMPONENT_FIELDS.some((item) => item.key === field)) {
        nextRow.markStatus = 'recorded';
      }
      if (field === 'markStatus' && rowNeedsScoreReset(value)) {
        COMPONENT_FIELDS.forEach((item) => {
          nextRow[item.key] = '';
        });
      }
      return nextRow;
    }));
    setDirtyIds((prev) => ({ ...prev, [studentMembershipId]: true }));
  };

  const handleSaveChanges = async () => {
    if (!selectedSessionId || !dirtyCount) return;
    setSaving(true);
    try {
      const items = rows
        .filter((row) => dirtyIds[row.studentMembershipId])
        .map((row) => ({
          studentMembershipId: row.studentMembershipId,
          markStatus: row.markStatus,
          note: row.note,
          scoreBreakdown: {
            attendanceScore: row.attendanceScore,
            writtenScore: row.writtenScore,
            oralScore: row.oralScore,
            classActivityScore: row.classActivityScore,
            homeworkScore: row.homeworkScore
          }
        }));

      const data = await fetchJson(`${API_BASE}/api/exams/sessions/${selectedSessionId}/marks/batch`, {
        method: 'POST',
        body: JSON.stringify({ items })
      });
      setSheet(data);
      setRows((data.items || []).map(buildRowState));
      setDirtyIds({});
      applyMessage('تغییرات شقه ذخیره شد.', 'success');
      await loadSessions(filters, selectedSessionId);
    } catch {
      applyMessage('ذخیره تغییرات شقه موفق نشد.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedSessionId || !nextWorkflowStatus) return;
    if (dirtyCount) {
      applyMessage('نخست تغییرات ذخیره نشده را ثبت کن، سپس شقه را نشر کن.', 'error');
      return;
    }
    if (['approved', 'published'].includes(nextWorkflowStatus) && !filters.reviewerUserId) {
      applyMessage('برای تأیید یا نشر، استاد ممیز را از فهرست انتخاب کنید.', 'error');
      return;
    }
    setPublishing(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/exams/sessions/${selectedSessionId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: nextWorkflowStatus,
          reviewerUserId: filters.reviewerUserId || undefined,
          monthLabel: filters.monthLabel
        })
      });
      applyMessage(nextWorkflowStatus === 'submitted'
        ? 'شقه برای بررسی و تأیید ارسال شد.'
        : nextWorkflowStatus === 'approved'
          ? 'شقه تأیید شد؛ نمرات اکنون وارد نتایج شده و برای شاگرد قابل مشاهده است.'
          : 'شقه نهایی شد و نتیجه برای شاگردان قابل نمایش است.', 'success');
      await loadSessions(filters, data?.item?.id || selectedSessionId);
      await loadSheet(data?.item?.id || selectedSessionId);
    } catch {
      applyMessage('تغییر مرحلهٔ شقه موفق نشد. نمرات در انتظار، ممیز یا ترتیب تأیید را بررسی کنید.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!selectedSessionId || isInstructor) return;
    setRevising(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/exams/sessions/${selectedSessionId}/revisions`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'اصلاح شقهٔ رسمی' })
      });
      const revisionId = data?.item?.id || '';
      await loadSessions(filters, revisionId);
      if (revisionId) {
        setSelectedSessionId(revisionId);
        await loadSheet(revisionId);
      }
      applyMessage(`نسخهٔ اصلاحی ${data?.summary?.version || ''} ایجاد شد.`, 'success');
    } catch {
      applyMessage('ایجاد نسخهٔ اصلاحی شقه موفق نشد.', 'error');
    } finally {
      setRevising(false);
    }
  };

  const handleExport = async (kind = 'pdf') => {
    if (!selectedSessionId) return;
    try {
      if (kind === 'print') {
        const html = await fetchBinary(`${API_BASE}/api/exams/sessions/${selectedSessionId}/export.print`, 'text');
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const blob = await fetchBinary(`${API_BASE}/api/exams/sessions/${selectedSessionId}/export.pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selectedSession?.code || 'exam-sheet'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      applyMessage(`خروجی ${kind === 'print' ? 'چاپی' : 'PDF'} شقه آماده نشد.`, 'error');
    }
  };

  const renderSessionBadge = (status = '') => {
    if (status === 'published') return 'published';
    if (status === 'active') return 'active';
    if (status === 'closed') return 'closed';
    return 'draft';
  };

  return (
    <div className="grade-manager-page">
      <div className="grade-manager-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <header className="grade-manager-hero">
          <div>
            <h2>شقه مضمون و مدیریت نمرات</h2>
            <p>
              شقه رسمی در مرکز مدیریت ساخته و به استاد تخصیص می‌شود؛ استاد نمرات را اینجا تکمیل و برای تأیید می‌فرستد.
              شقهٔ تأییدشده وارد نتایج عمومی می‌شود و کوییزهای تمرینی در آن محاسبه نمی‌شوند.
            </p>
          </div>
          <div className="grade-manager-actions">
            <button type="button" className="secondary" onClick={handleSearch} disabled={loadingRefs || loadingSessions}>
              {loadingSessions ? 'در حال بارگیری...' : 'جستجوی شقه‌ها'}
            </button>
            {!isInstructor ? (
              <button type="button" onClick={() => { window.location.href = '/admin-sheet-templates'; }}>
                مرکز مدیریت و تخصیص شقه‌ها
              </button>
            ) : null}
          </div>
        </header>

        <section className="grade-manager-filters">
          <div className="grade-flow-note">
            <strong>مسیر رسمی:</strong>
            <span>{isInstructor ? 'شقه‌هایی که مدیریت به شما تخصیص داده است در این صفحه ظاهر می‌شود؛ نمرات را ثبت و برای تأیید بفرستید.' : 'ساخت و تخصیص شقه فقط از مرکز مدیریت شقه‌ها انجام می‌شود؛ در این صفحه می‌توانید شقه‌های موجود را بررسی و تأیید کنید.'}</span>
          </div>

          <label>
            <span>سال تعلیمی</span>
            <select name="academicYearId" value={filters.academicYearId} onChange={handleFilterChange} disabled={loadingRefs}>
              <option value="">انتخاب سال</option>
              {referenceData.academicYears.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>

          <label>
            <span>استاد</span>
            <select name="teacherId" value={filters.teacherId} onChange={handleFilterChange} disabled={loadingRefs || isInstructor}>
              <option value="">انتخاب استاد</option>
              {teacherOptions.map((item) => (
                <option key={item.id} value={item.id}>{item.name || item.email || 'استاد'}</option>
              ))}
            </select>
          </label>

          <label>
            <span>صنف</span>
            <select name="classId" value={filters.classId} onChange={handleFilterChange} disabled={loadingRefs}>
              <option value="">انتخاب صنف</option>
              {filteredClasses.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>

          <label>
            <span>مضمون</span>
            <select name="subjectId" value={filters.subjectId} onChange={handleFilterChange} disabled={loadingRefs}>
              <option value="">انتخاب مضمون</option>
              {filteredSubjects.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <label>
            <span>نوع امتحان</span>
            <select name="examTypeId" value={filters.examTypeId} onChange={handleFilterChange} disabled={loadingRefs}>
              <option value="">انتخاب نوع</option>
              {visibleExamTypes.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </label>

          <label>
            <span>ماه</span>
            <input name="monthLabel" value={filters.monthLabel} onChange={handleFilterChange} placeholder="مثلاً حمل" />
          </label>

          <label>
            <span>تاریخ</span>
            <AfghanDateInput name="heldAt" value={filters.heldAt} onChange={(value) => setFilters((current) => ({ ...current, heldAt: value }))} />
          </label>

          <label>
            <span>ممیز</span>
            <select name="reviewerUserId" value={filters.reviewerUserId} onChange={handleFilterChange} disabled={loadingRefs || isInstructor}>
              <option value="">انتخاب استاد ممیز</option>
              {(referenceData.reviewers || []).map((item) => (
                <option key={item.id} value={item.id}>{item.name || item.email || 'ممیز'}</option>
              ))}
            </select>
          </label>
        </section>

        <section className="grade-manager-component-config">
          {COMPONENT_FIELDS.map((field) => (
            <label key={field.key}>
              <span>{field.label} از</span>
              <input
                type="number"
                min="0"
                name={field.maxKey}
                value={filters[field.maxKey]}
                onChange={handleFilterChange}
                disabled
              />
            </label>
          ))}
        </section>

        {message && <div className={`grade-message ${messageTone}`}>{message}</div>}

        <section className="grade-manager-shell">
          <aside className="grade-session-list">
            <div className="section-head">
              <h3>{isInstructor ? 'شقه‌های تخصیص‌شده به من' : 'شقه‌های ثبت‌شده'}</h3>
              <span>{toFaNumber(sessions.length)} شقه</span>
            </div>
            {!sessions.length && <div className="grade-empty">هنوز شقه‌ای در این بخش ثبت نشده است.</div>}
            {sessions.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`grade-session-card ${String(item.id) === String(selectedSessionId) ? 'active' : ''}`}
                onClick={() => setSelectedSessionId(item.id)}
              >
                <div className="grade-session-card__head">
                  <strong>{item.subject?.name || item.title}</strong>
                  <span className={`status-pill ${renderSessionBadge(item.status)}`}>{item.status || 'draft'}</span>
                </div>
                <div className="grade-session-card__meta">
                  <span>{item.schoolClass?.title || '---'}</span>
                  <span>{item.monthLabel || item.examType?.title || '---'}</span>
                  <span>{toDisplayDate(item.heldAt)}</span>
                </div>
              </button>
            ))}
          </aside>

          <section className="grade-sheet-panel">
            {!selectedSessionId && <div className="grade-empty">برای شروع، یک شقه را از فهرست انتخاب کنید.</div>}

            {selectedSessionId && (
              <>
                <div className="grade-sheet-head">
                  <div>
                    <h3>{sheet?.session?.title || selectedSession?.title || 'شقه مضمون'}</h3>
                    <p>
                      {sheet?.session?.subject?.name || selectedSession?.subject?.name || '---'} |
                      {' '}
                      {sheet?.session?.schoolClass?.title || selectedSession?.schoolClass?.title || '---'} |
                      {' '}
                      {sheet?.session?.monthLabel || selectedSession?.monthLabel || '---'}
                    </p>
                  </div>
                  <div className="grade-sheet-toolbar">
                    {!isInstructor && ['approved', 'published', 'closed'].includes(currentSessionStatus) && (
                      <button type="button" className="secondary" onClick={handleCreateRevision} disabled={revising || loadingSheet}>
                        {revising ? 'در حال ایجاد نسخه...' : 'ایجاد نسخهٔ اصلاحی'}
                      </button>
                    )}
                    <button type="button" className="secondary" onClick={() => handleExport('print')} disabled={!selectedSessionId}>
                      نسخه چاپی
                    </button>
                    <button type="button" className="secondary" onClick={() => handleExport('pdf')} disabled={!selectedSessionId}>
                      PDF
                    </button>
                    <button type="button" className="secondary" onClick={handleSaveChanges} disabled={!dirtyCount || saving || loadingSheet || sheetLocked}>
                      {saving ? 'در حال ذخیره...' : `ذخیره تغییرات${dirtyCount ? ` (${toFaNumber(dirtyCount)})` : ''}`}
                    </button>
                    <button type="button" onClick={handlePublish} disabled={publishing || saving || loadingSheet || !selectedSessionId || !nextWorkflowStatus || Boolean(dirtyCount) || policyMismatch}>
                      {publishing ? 'در حال ثبت مرحله...' : workflowActionLabel}
                    </button>
                  </div>
                </div>

                <div className="grade-sheet-official-meta" aria-label="مشخصات شقه امتحان">
                  <span><strong>مضمون:</strong> {sheet?.session?.subject?.name || selectedSession?.subject?.name || '---'}</span>
                  <span><strong>صنف:</strong> {sheet?.session?.schoolClass?.title || selectedSession?.schoolClass?.title || '---'}</span>
                  <span><strong>ترم:</strong> {sheet?.session?.assessmentPeriod?.title || selectedSession?.assessmentPeriod?.title || '---'}</span>
                  <span><strong>نوع امتحان:</strong> {sheet?.session?.examType?.title || selectedSession?.examType?.title || '---'}</span>
                  <span><strong>ماه:</strong> {sheet?.session?.monthLabel || selectedSession?.monthLabel || '---'}</span>
                  <span><strong>تاریخ:</strong> {toDisplayDate(sheet?.session?.heldAt || selectedSession?.heldAt)}</span>
                  <span><strong>نسخه:</strong> {toFaNumber(sheet?.session?.version || selectedSession?.version || 1)}</span>
                </div>

                {policyMismatch && (
                  <div className="grade-message error">
                    این شقه با فارمت قدیمی ۱۰۰ نمره ثبت شده است. برای جلوگیری از تغییر نادرست نمرات، باید بازبینی و در فارمت رسمی ۴۰/۶۰ دوباره تنظیم شود.
                  </div>
                )}

                <div className="grade-summary-strip">
                  <div>
                    <span>شاگردان</span>
                    <strong>{toFaNumber(sheet?.summary?.eligibleMemberships || 0)}</strong>
                  </div>
                  <div>
                    <span>ثبت‌شده</span>
                    <strong>{toFaNumber(sheet?.summary?.recordedMarks || 0)}</strong>
                  </div>
                  <div>
                    <span>در انتظار</span>
                    <strong>{toFaNumber(sheet?.summary?.pendingMarks || 0)}</strong>
                  </div>
                  <div>
                    <span>حالت</span>
                    <strong>{sheet?.session?.status || selectedSession?.status || 'draft'}</strong>
                  </div>
                </div>

                {loadingSheet && <div className="grade-empty">در حال بارگیری جدول شقه...</div>}

                {!loadingSheet && (
                  <div className="grade-sheet-table-wrap">
                    <table className="grade-sheet-table">
                      <thead>
                        <tr>
                          <th rowSpan="2">شماره</th>
                          <th colSpan="2" className="group-heading">شهرت متعلمین</th>
                          {activeComponentFields.map((field) => (
                            <th key={field.key} rowSpan="2">
                              {field.label}
                              <small>{toFaNumber(scoreComponents[field.maxKey])}</small>
                            </th>
                          ))}
                          <th colSpan="2" className="group-heading">مجموعه نمره</th>
                          <th rowSpan="2">فیصدی</th>
                          <th rowSpan="2">ملاحظات</th>
                        </tr>
                        <tr>
                          <th>نام</th>
                          <th>نام پدر</th>
                          <th>به عدد</th>
                          <th>به حروف</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!rows.length && (
                          <tr>
                            <td colSpan={activeComponentFields.length + 7}>هنوز شاگردی برای این شقه موجود نیست.</td>
                          </tr>
                        )}
                        {rows.map((row) => {
                          const total = computeRowTotal(row, activeComponentFields);
                          const totalInWords = row.markStatus === 'recorded' ? numberToFaWords(total) : '';
                          return (
                            <tr key={row.studentMembershipId}>
                              <td>{toFaNumber(row.rowNumber)}</td>
                              <td className="student-cell">
                                <strong>{row.studentName || '---'}</strong>
                                {row.resultStatus && <span>{row.resultStatus}</span>}
                                {row.membershipStatusLabel && <span>{row.membershipStatusLabel}</span>}
                              </td>
                              <td>{row.fatherName || '---'}</td>
                              {activeComponentFields.map((field) => (
                                <td key={field.key}>
                                  <input
                                    type="number"
                                    min="0"
                                    max={String(scoreComponents[field.maxKey] || 0)}
                                    value={row[field.key]}
                                    disabled={field.derived || rowBlocksScoreInput(row.markStatus) || sheetLocked}
                                    title={field.derived ? 'این نمره هنگام ارسال شقه از حاضری محاسبه می‌شود.' : undefined}
                                    className="score-input"
                                    onChange={(event) => handleRowChange(row.studentMembershipId, field.key, event.target.value)}
                                  />
                                </td>
                              ))}
                              <td className="total-cell">{toFaNumber(total)}</td>
                              <td className="total-words-cell">{totalInWords || '---'}</td>
                              <td className="total-cell">{row.markStatus === 'recorded' && Number(sheet?.session?.defaultMark?.totalMark || 0) > 0 ? `${toFaNumber(Number(((total / Number(sheet.session.defaultMark.totalMark)) * 100).toFixed(2)))}٪` : '---'}</td>
                              <td className="note-cell">
                                <div className="grade-note-control">
                                  <select
                                    value={row.markStatus}
                                    disabled={sheetLocked}
                                    onChange={(event) => handleRowChange(row.studentMembershipId, 'markStatus', event.target.value)}
                                    aria-label={`وضعیت ${row.studentName || 'شاگرد'}`}
                                  >
                                    {STATUS_OPTIONS.map((option) => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={row.note}
                                    disabled={sheetLocked}
                                    onChange={(event) => handleRowChange(row.studentMembershipId, 'note', event.target.value)}
                                    placeholder={row.markStatus === 'recorded' ? 'ملاحظات' : STATUS_LABELS[row.markStatus] || 'ملاحظات'}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      </div>
    </div>
  );
}
