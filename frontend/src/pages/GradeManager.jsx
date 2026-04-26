import React, { useEffect, useMemo, useState } from 'react';
import './GradeManager.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate, toGregorianDateInputValue } from '../utils/afghanDate';

const COMPONENT_FIELDS = [
  { key: 'writtenScore', maxKey: 'writtenMax', label: 'تحریری' },
  { key: 'oralScore', maxKey: 'oralMax', label: 'تقریری' },
  { key: 'classActivityScore', maxKey: 'classActivityMax', label: 'فعالیت صنفی' },
  { key: 'homeworkScore', maxKey: 'homeworkMax', label: 'کارخانگی' }
];

const STATUS_OPTIONS = [
  { value: 'recorded', label: 'ثبت‌شده' },
  { value: 'pending', label: 'در انتظار' },
  { value: 'absent', label: 'غایب' },
  { value: 'excused', label: 'معذور' }
];

const STATUS_LABELS = STATUS_OPTIONS.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

const SCORE_BLOCKING_STATUSES = new Set(['absent', 'excused']);
const SCORE_CLEARING_STATUSES = new Set(['pending', 'absent', 'excused']);

const INITIAL_FILTERS = {
  academicYearId: '',
  assessmentPeriodId: '',
  classId: '',
  subjectId: '',
  examTypeId: '',
  monthLabel: '',
  heldAt: '',
  reviewedByName: '',
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
  writtenScore: item?.row?.writtenScore == null ? '' : String(item.row.writtenScore),
  oralScore: item?.row?.oralScore == null ? '' : String(item.row.oralScore),
  classActivityScore: item?.row?.classActivityScore == null ? '' : String(item.row.classActivityScore),
  homeworkScore: item?.row?.homeworkScore == null ? '' : String(item.row.homeworkScore),
  totalInWords: item?.row?.totalInWords || '',
  note: sanitizeExamNote(item?.row?.note),
  markStatus: item?.row?.markStatus || 'pending',
  resultStatus: item?.row?.resultStatus || '',
  rank: item?.row?.rank ?? null
});

const computeRowTotal = (row = {}) => COMPONENT_FIELDS.reduce((sum, field) => sum + toSafeNumber(row[field.key]), 0);

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
    teacherAssignments: []
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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

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

  const filteredTerms = useMemo(() => (
    referenceData.assessmentPeriods.filter((item) => (
      !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId)
    ))
  ), [referenceData.assessmentPeriods, filters.academicYearId]);

  const filteredClasses = useMemo(() => {
    const fallbackClasses = referenceData.classes.filter((item) => (
      !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId)
    ));
    const sourceAssignments = scopedAssignments.filter((item) => (
      !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId)
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
  }, [referenceData.classes, scopedAssignments, filters.academicYearId]);

  const filteredSubjects = useMemo(() => {
    const sourceAssignments = scopedAssignments.filter((item) => {
      const matchesYear = !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId);
      const matchesTerm = !filters.assessmentPeriodId || !item?.assessmentPeriod?.id || String(item?.assessmentPeriod?.id || '') === String(filters.assessmentPeriodId);
      const matchesClass = !filters.classId || String(item?.schoolClass?.id || '') === String(filters.classId);
      return matchesYear && matchesTerm && matchesClass;
    });
    if (!sourceAssignments.length) {
      return referenceData.subjects;
    }
    return Array.from(
      new Map(
        sourceAssignments
          .filter((item) => item?.subject?.id)
          .map((item) => [String(item.subject.id), item.subject])
      ).values()
    );
  }, [referenceData.subjects, scopedAssignments, filters.academicYearId, filters.assessmentPeriodId, filters.classId]);

  const scoreComponents = useMemo(() => ({
    writtenMax: toSafeNumber(sheet?.scoreComponents?.writtenMax || filters.writtenMax),
    oralMax: toSafeNumber(sheet?.scoreComponents?.oralMax || filters.oralMax),
    classActivityMax: toSafeNumber(sheet?.scoreComponents?.classActivityMax || filters.classActivityMax),
    homeworkMax: toSafeNumber(sheet?.scoreComponents?.homeworkMax || filters.homeworkMax)
  }), [sheet?.scoreComponents, filters.writtenMax, filters.oralMax, filters.classActivityMax, filters.homeworkMax]);

  const dirtyCount = useMemo(
    () => Object.values(dirtyIds).filter(Boolean).length,
    [dirtyIds]
  );
  const sheetLocked = sheet?.isEditable === false;

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
        teacherAssignments: data.teacherAssignments || []
      });

      const activeYear = (data.academicYears || []).find((item) => item.isActive) || data.academicYears?.[0] || null;
      const activeTerm = (data.assessmentPeriods || []).find((item) => item.isActive && String(item?.academicYear?.id || '') === String(activeYear?.id || ''))
        || (data.assessmentPeriods || []).find((item) => String(item?.academicYear?.id || '') === String(activeYear?.id || ''))
        || data.assessmentPeriods?.[0]
        || null;
      const monthlyExam = (data.examTypes || []).find((item) => String(item.code || '').toUpperCase() === 'MONTHLY')
        || data.examTypes?.[0]
        || null;
      const defaultAssignment = (data.teacherAssignments || []).find((item) => (
        !isInstructor || String(item?.teacher?.id || '') === String(userId())
      )) || null;

      setFilters((prev) => ({
        ...prev,
        academicYearId: prev.academicYearId || defaultAssignment?.academicYear?.id || activeYear?.id || '',
        assessmentPeriodId: prev.assessmentPeriodId || defaultAssignment?.assessmentPeriod?.id || activeTerm?.id || '',
        classId: prev.classId || defaultAssignment?.schoolClass?.id || '',
        subjectId: prev.subjectId || defaultAssignment?.subject?.id || '',
        examTypeId: prev.examTypeId || monthlyExam?.id || ''
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
        reviewedByName: data?.session?.reviewedByName || prev.reviewedByName,
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

  const findTeacherAssignmentId = () => {
    const matches = scopedAssignments.filter((item) => {
      const matchesYear = !filters.academicYearId || String(item?.academicYear?.id || '') === String(filters.academicYearId);
      const matchesTerm = !filters.assessmentPeriodId || !item?.assessmentPeriod?.id || String(item?.assessmentPeriod?.id || '') === String(filters.assessmentPeriodId);
      const matchesClass = !filters.classId || String(item?.schoolClass?.id || '') === String(filters.classId);
      const matchesSubject = !filters.subjectId || String(item?.subject?.id || '') === String(filters.subjectId);
      return matchesYear && matchesTerm && matchesClass && matchesSubject;
    });
    return matches[0]?.id || '';
  };

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSearch = () => {
    loadSessions(filters);
  };

  const handleOpenSheet = async () => {
    if (!filters.academicYearId || !filters.assessmentPeriodId || !filters.classId || !filters.subjectId || !filters.examTypeId) {
      applyMessage('برای باز کردن شقه، سال تعلیمی، ترم، صنف، مضمون و نوع امتحان را تعیین کنید.', 'error');
      return;
    }

    const teacherAssignmentId = findTeacherAssignmentId();
    if (!teacherAssignmentId) {
      applyMessage('برای این صنف و مضمون، استاد مسئول فعال ثبت نشده است.', 'error');
      return;
    }

    const payload = {
      sessionKind: 'subject_sheet',
      academicYearId: filters.academicYearId,
      assessmentPeriodId: filters.assessmentPeriodId,
      classId: filters.classId,
      subjectId: filters.subjectId,
      examTypeId: filters.examTypeId,
      teacherAssignmentId,
      monthLabel: filters.monthLabel,
      reviewedByName: filters.reviewedByName,
      heldAt: filters.heldAt || undefined,
      status: 'active',
      initializeRoster: true,
      scoreComponents: {
        writtenMax: toSafeNumber(filters.writtenMax),
        oralMax: toSafeNumber(filters.oralMax),
        classActivityMax: toSafeNumber(filters.classActivityMax),
        homeworkMax: toSafeNumber(filters.homeworkMax)
      }
    };

    setCreating(true);
    try {
      const preview = await fetchJson(`${API_BASE}/api/exams/sessions/bootstrap-preview`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (preview.existingSession?.id) {
        setSelectedSessionId(preview.existingSession.id);
        applyMessage('شقه موجود بود و بارگیری شد.', 'success');
        await loadSessions(filters, preview.existingSession.id);
        return;
      }

      const data = await fetchJson(`${API_BASE}/api/exams/sessions/bootstrap`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const nextSessionId = data?.session?.id || '';
      applyMessage('شقه مضمون ایجاد شد و roster شاگردان آماده گردید.', 'success');
      await loadSessions(filters, nextSessionId);
      if (nextSessionId) {
        setSelectedSessionId(nextSessionId);
      }
    } catch (error) {
      applyMessage('ایجاد یا بارگیری شقه موفق نشد.', 'error');
    } finally {
      setCreating(false);
    }
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
    if (!selectedSessionId) return;
    if (dirtyCount) {
      applyMessage('نخست تغییرات ذخیره نشده را ثبت کن، سپس شقه را نشر کن.', 'error');
      return;
    }
    setPublishing(true);
    try {
      const data = await fetchJson(`${API_BASE}/api/exams/sessions/${selectedSessionId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'published',
          reviewedByName: filters.reviewedByName,
          monthLabel: filters.monthLabel
        })
      });
      applyMessage('شقه نهایی شد و نتیجه برای شاگردان قابل نمایش است.', 'success');
      await loadSessions(filters, data?.item?.id || selectedSessionId);
      await loadSheet(data?.item?.id || selectedSessionId);
    } catch {
      applyMessage('نشر شقه موفق نشد. احتمالاً هنوز بعضی نمرات در انتظار هستند.', 'error');
    } finally {
      setPublishing(false);
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
              این بخش شقه واقعی مضمون را از سیستم امتحانات باز می‌کند. برای هر صنف و هر مضمون، استاد مربوطه
              نمرات شاگردان را داخل همین جدول ثبت می‌کند و پس از نشر، نتیجه از همین منبع به شاگرد می‌رسد.
            </p>
          </div>
          <div className="grade-manager-actions">
            <button type="button" className="secondary" onClick={handleSearch} disabled={loadingRefs || loadingSessions}>
              {loadingSessions ? 'در حال بارگیری...' : 'جستجوی شقه‌ها'}
            </button>
            <button type="button" onClick={handleOpenSheet} disabled={creating || loadingRefs}>
              {creating ? 'در حال آماده‌سازی...' : 'ایجاد یا بازکردن شقه'}
            </button>
          </div>
        </header>

        <section className="grade-manager-filters">
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
            <span>ترم</span>
            <select name="assessmentPeriodId" value={filters.assessmentPeriodId} onChange={handleFilterChange} disabled={loadingRefs}>
              <option value="">انتخاب ترم</option>
              {filteredTerms.map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
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
              {referenceData.examTypes.map((item) => (
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
            <input type="date" name="heldAt" value={filters.heldAt} onChange={handleFilterChange} />
          </label>

          <label>
            <span>ممیز</span>
            <input name="reviewedByName" value={filters.reviewedByName} onChange={handleFilterChange} placeholder="نام ممیز" />
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
              />
            </label>
          ))}
        </section>

        {message && <div className={`grade-message ${messageTone}`}>{message}</div>}

        <section className="grade-manager-shell">
          <aside className="grade-session-list">
            <div className="section-head">
              <h3>شقه‌های ثبت‌شده</h3>
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
            {!selectedSessionId && <div className="grade-empty">برای شروع، یک شقه را از فهرست انتخاب کن یا شقه جدید بساز.</div>}

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
                    <button type="button" className="secondary" onClick={() => handleExport('print')} disabled={!selectedSessionId}>
                      نسخه چاپی
                    </button>
                    <button type="button" className="secondary" onClick={() => handleExport('pdf')} disabled={!selectedSessionId}>
                      PDF
                    </button>
                    <button type="button" className="secondary" onClick={handleSaveChanges} disabled={!dirtyCount || saving || loadingSheet || sheetLocked}>
                      {saving ? 'در حال ذخیره...' : `ذخیره تغییرات${dirtyCount ? ` (${toFaNumber(dirtyCount)})` : ''}`}
                    </button>
                    <button type="button" onClick={handlePublish} disabled={publishing || saving || loadingSheet || !selectedSessionId || sheetLocked}>
                      {publishing ? 'در حال نشر...' : 'نشر نهایی'}
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
                </div>

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
                          {COMPONENT_FIELDS.map((field) => (
                            <th key={field.key} rowSpan="2">
                              {field.label}
                              <small>{toFaNumber(scoreComponents[field.maxKey])}</small>
                            </th>
                          ))}
                          <th colSpan="2" className="group-heading">مجموعه نمره</th>
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
                            <td colSpan={10}>هنوز شاگردی برای این شقه موجود نیست.</td>
                          </tr>
                        )}
                        {rows.map((row) => {
                          const total = computeRowTotal(row);
                          const totalInWords = row.markStatus === 'recorded' ? numberToFaWords(total) : '';
                          return (
                            <tr key={row.studentMembershipId}>
                              <td>{toFaNumber(row.rowNumber)}</td>
                              <td className="student-cell">
                                <strong>{row.studentName || '---'}</strong>
                                {row.resultStatus && <span>{row.resultStatus}</span>}
                              </td>
                              <td>{row.fatherName || '---'}</td>
                              {COMPONENT_FIELDS.map((field) => (
                                <td key={field.key}>
                                  <input
                                    type="number"
                                    min="0"
                                    max={String(scoreComponents[field.maxKey] || 0)}
                                    value={row[field.key]}
                                    disabled={rowBlocksScoreInput(row.markStatus) || sheetLocked}
                                    className="score-input"
                                    onChange={(event) => handleRowChange(row.studentMembershipId, field.key, event.target.value)}
                                  />
                                </td>
                              ))}
                              <td className="total-cell">{toFaNumber(total)}</td>
                              <td className="total-words-cell">{totalInWords || '---'}</td>
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
