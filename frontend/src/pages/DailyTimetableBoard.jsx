import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  areDailyTimetableSlotRowsCustomized,
  clearDailyTimetableDraft,
  draftItemsToScheduleMap,
  normalizeDailyTimetableSlotRows,
  readDailyTimetableDraft,
  scheduleMapToDraftItems,
  writeDailyTimetableDraft
} from '../utils/dailyTimetableDraft';
import './DailyTimetableBoard.css';

const DAYS = [
  { value: 'saturday', label: 'شنبه' },
  { value: 'sunday', label: 'یکشنبه' },
  { value: 'monday', label: 'دوشنبه' },
  { value: 'tuesday', label: 'سه‌شنبه' },
  { value: 'wednesday', label: 'چهارشنبه' },
  { value: 'thursday', label: 'پنجشنبه' }
];

const PERIODS = [1, 2, 3, 4, 5, 6];
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

const CATEGORY_LABELS = {
  core: 'اصلی',
  elective: 'اختیاری',
  optional: 'اختیاری',
  language: 'زبان',
  science: 'ساینس',
  lab: 'لابراتوار',
  arts: 'هنری',
  religion: 'دینی'
};

const normalizeText = (value = '') => String(value || '').trim();
const resolveEntityId = (value = '') => normalizeText(
  typeof value === 'object' && value !== null
    ? value._id || value.id || ''
    : value
);

const toPersianNumber = (value) =>
  String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] || digit);

const formatPersianDateTime = (value = '') => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const startOfSaturdayWeek = (value = new Date()) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  const distanceFromSaturday = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - distanceFromSaturday);
  return date;
};

const formatPersianDayDate = (value = new Date()) => {
  try {
    return new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
      day: 'numeric',
      month: 'short'
    }).format(new Date(value));
  } catch {
    return '';
  }
};

const parseClockToMinutes = (value = '') => {
  const normalized = String(value || '').trim();
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(normalized)) return null;

  const [hours = '0', minutes = '0'] = normalized.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return null;
  return (parsedHours * 60) + parsedMinutes;
};

const makeCellKey = (classId, day, period) => `${classId}__${day}__${period}`;

const resolveTeacherName = (teacher, index) => {
  if (typeof teacher?.name === 'string' && teacher.name.trim()) return teacher.name.trim();

  const fullName = `${teacher?.firstName || ''} ${teacher?.lastName || ''}`.trim();
  if (fullName) return fullName;

  return `استاد ${toPersianNumber(index + 1)}`;
};

const normalizeTeachers = (teachers = []) => {
  if (!Array.isArray(teachers)) return [];

  return teachers.map((teacher, index) => {
    const id = resolveEntityId(teacher?._id || teacher?.id || teacher);
    const name = resolveTeacherName(teacher, index);
    if (!id && !name) return null;

    return {
      id,
      name
    };
  }).filter(Boolean);
};

const normalizeSubjects = (subjects = []) => {
  if (!Array.isArray(subjects)) return [];

  const deduped = new Map();

  subjects.forEach((subject, index) => {
    const id = resolveEntityId(subject?._id || subject?.id || subject);
    const label = normalizeText(subject?.nameDari || subject?.name || subject?.title || subject?.label);
    if (!id && !label) return;

    const key = id || `subject-${index + 1}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        id: key,
        label,
        category: normalizeText(subject?.category)
      });
    }
  });

  return Array.from(deduped.values());
};

const normalizeClasses = (classes = []) => {
  if (!Array.isArray(classes)) return [];

  return classes.map((classItem, index) => {
    const id = resolveEntityId(classItem?._id || classItem?.id || classItem);
    const title = normalizeText(classItem?.title || classItem?.name || classItem?.label || classItem?.classTitle);
    if (!id && !title) return null;

    return {
      id: id || `class-${index + 1}`,
      title: title || `صنف ${toPersianNumber(index + 1)}`,
      room: normalizeText(classItem?.room || classItem?.classroomNumber),
      shiftId: resolveEntityId(classItem?.shiftId),
      academicYearId: resolveEntityId(classItem?.academicYearId),
      gradeLevel: normalizeText(classItem?.gradeLevel),
      section: normalizeText(classItem?.section)
    };
  }).filter(Boolean);
};

const normalizeAssignments = ({
  assignments = [],
  teachers = [],
  subjects = [],
  classes = []
} = {}) => {
  if (!Array.isArray(assignments)) return [];

  const teacherMap = new Map(normalizeTeachers(teachers).map((teacher) => [teacher.id, teacher]));
  const subjectMap = new Map(normalizeSubjects(subjects).map((subject) => [subject.id, subject]));
  const classMap = new Map(normalizeClasses(classes).map((item) => [item.id, item]));
  const deduped = new Map();

  assignments.forEach((assignment, index) => {
    const status = normalizeText(assignment?.status).toLowerCase();
    if (status && !['active', 'planned', 'pending'].includes(status)) return;

    const classId = resolveEntityId(assignment?.classId?._id || assignment?.classId);
    const subjectId = resolveEntityId(assignment?.subjectId?._id || assignment?.subjectId);
    const teacherId = resolveEntityId(assignment?.teacherUserId?._id || assignment?.teacherUserId);
    if (!classId || !subjectId || !teacherId) return;

    const subjectMeta = subjectMap.get(subjectId) || {
      id: subjectId,
      label: normalizeText(assignment?.subjectId?.nameDari || assignment?.subjectId?.name || assignment?.subjectId?.title),
      category: normalizeText(assignment?.subjectId?.category)
    };
    const teacherMeta = teacherMap.get(teacherId) || {
      id: teacherId,
      name: normalizeText(assignment?.teacherUserId?.name)
    };
    const classMeta = classMap.get(classId) || {
      id: classId,
      title: normalizeText(assignment?.classId?.title),
      room: normalizeText(assignment?.classId?.room || assignment?.classId?.classroomNumber),
      shiftId: resolveEntityId(assignment?.classId?.shiftId),
      academicYearId: resolveEntityId(assignment?.academicYearId?._id || assignment?.academicYearId || assignment?.classId?.academicYearId)
    };

    const dedupeKey = `${classId}__${subjectId}__${teacherId}`;
    if (deduped.has(dedupeKey)) return;

    deduped.set(dedupeKey, {
      id: resolveEntityId(assignment?._id || assignment?.id || `assignment-${index + 1}`),
      classId,
      classTitle: classMeta.title || 'صنف',
      classRoom: classMeta.room || classMeta.title || '',
      shiftId: classMeta.shiftId || '',
      academicYearId: classMeta.academicYearId || '',
      subjectId,
      subjectLabel: subjectMeta.label || 'مضمون',
      category: subjectMeta.category || '',
      teacherId,
      teacherName: teacherMeta.name || 'استاد',
      priority: Number(assignment?.priority || 1)
    });
  });

  return Array.from(deduped.values()).sort((left, right) => {
    if (left.classTitle !== right.classTitle) return left.classTitle.localeCompare(right.classTitle);
    if (left.subjectLabel !== right.subjectLabel) return left.subjectLabel.localeCompare(right.subjectLabel);
    if (left.priority !== right.priority) return left.priority - right.priority;
    return left.teacherName.localeCompare(right.teacherName);
  });
};

const translateCategory = (category = '') => {
  const normalized = String(category).trim().toLowerCase();
  return CATEGORY_LABELS[normalized] || '';
};

const getSubjectTone = (subjectLabel = '', category = '') => {
  const subjectValue = String(subjectLabel).trim().toLowerCase();
  const categoryValue = String(category).trim().toLowerCase();

  if (!subjectValue && !categoryValue) return 'empty';
  if (subjectValue.includes('ریاضی') || subjectValue.includes('math')) return 'math';
  if (subjectValue.includes('فیزیک') || subjectValue.includes('physics')) return 'physics';
  if (subjectValue.includes('کیمیا') || subjectValue.includes('chem')) return 'chemistry';
  if (
    subjectValue.includes('زیست') ||
    subjectValue.includes('biology') ||
    categoryValue === 'science' ||
    categoryValue === 'lab'
  ) {
    return 'biology';
  }
  if (
    subjectValue.includes('دری') ||
    subjectValue.includes('پشتو') ||
    subjectValue.includes('انگلیسی') ||
    subjectValue.includes('ادبیات') ||
    categoryValue === 'language'
  ) {
    return 'language';
  }

  return 'default';
};

const buildPublishSummary = (draftMeta) => {
  const hasPublishedVersion = Boolean(draftMeta?.hasPublishedVersion && draftMeta?.published?.isCustomized);
  if (!hasPublishedVersion) {
    return {
      hasPublishedVersion: false,
      label: 'هنوز نسخه‌ای نشر نشده است',
      buttonLabel: 'نشر برنامه'
    };
  }

  if (!draftMeta?.isCustomized || !Array.isArray(draftMeta?.items) || draftMeta.items.length === 0) {
    return {
      hasPublishedVersion: true,
      label: 'نسخه‌ی نشرشده هنوز فعال است',
      buttonLabel: 'نشر برنامه'
    };
  }

  if (draftMeta?.status === 'published') {
    return {
      hasPublishedVersion: true,
      label: 'نسخه‌ی جاری نشر شده است',
      buttonLabel: 'بازنشر برنامه'
    };
  }

  return {
    hasPublishedVersion: true,
    label: 'نسخه‌ی نشرشده فعال است و تغییرات تازه هنوز در درفت‌اند',
    buttonLabel: 'نشر تغییرات'
  };
};

const resolvePreferredActiveClassId = (draftMeta, classes = [], fallbackClassId = '') => {
  const classIds = new Set((classes || []).map((item) => item.id));
  const candidates = [
    normalizeText(draftMeta?.activeClassId),
    ...((draftMeta?.items || []).map((item) => normalizeText(item.classId))),
    normalizeText(fallbackClassId),
    normalizeText(classes[0]?.id)
  ].filter(Boolean);

  return candidates.find((candidate) => classIds.has(candidate)) || candidates[0] || '';
};

const pickAssignmentForSubject = (assignments = [], preferredTeacherId = '') => {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;

  if (preferredTeacherId) {
    const matched = assignments.find((item) => String(item.teacherId || '') === String(preferredTeacherId || ''));
    if (matched) return matched;
  }

  return assignments.length === 1 ? assignments[0] : null;
};

const createCellValue = (assignment, classMeta) => ({
  teacherAssignmentId: assignment.id,
  teacherId: assignment.teacherId,
  teacherName: assignment.teacherName,
  subjectId: assignment.subjectId,
  subject: assignment.subjectLabel,
  category: assignment.category,
  classroom: classMeta.room || classMeta.title || '',
  classId: classMeta.id,
  classTitle: classMeta.title
});

const DailyTimetableBoard = ({
  teachers = [],
  subjects = [],
  classes = [],
  teacherAssignments = [],
  defaultActiveClassId = '',
  persistedDraft = null,
  onPersistDraft = null,
  onPublishDraft = null,
  onClearDraft = null,
  editable = true
}) => {
  const resolvedTeachers = useMemo(() => normalizeTeachers(teachers), [teachers]);
  const resolvedSubjects = useMemo(() => normalizeSubjects(subjects), [subjects]);
  const resolvedClasses = useMemo(() => normalizeClasses(classes), [classes]);
  const resolvedAssignments = useMemo(() => normalizeAssignments({
    assignments: teacherAssignments,
    teachers: resolvedTeachers,
    subjects: resolvedSubjects,
    classes: resolvedClasses
  }), [teacherAssignments, resolvedTeachers, resolvedSubjects, resolvedClasses]);
  const assignmentsByClassId = useMemo(() => resolvedAssignments.reduce((acc, item) => {
    if (!acc.has(item.classId)) acc.set(item.classId, []);
    acc.get(item.classId).push(item);
    return acc;
  }, new Map()), [resolvedAssignments]);

  const [draftMeta, setDraftMeta] = useState(() => persistedDraft || readDailyTimetableDraft());
  const [selectedDay, setSelectedDay] = useState(() => draftMeta?.selectedDay || DAYS[0].value);
  const [activeClassId, setActiveClassId] = useState(() => resolvePreferredActiveClassId(
    draftMeta,
    resolvedClasses,
    defaultActiveClassId
  ));
  const [schedule, setSchedule] = useState(() => draftItemsToScheduleMap(draftMeta?.items || []));
  const [slotRows, setSlotRows] = useState(() => normalizeDailyTimetableSlotRows(draftMeta?.slotRows));
  const [editingCell, setEditingCell] = useState(null);
  const [cellEditorError, setCellEditorError] = useState('');
  const [editingSlot, setEditingSlot] = useState(null);
  const [slotEditorError, setSlotEditorError] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const skipFirstPersistRef = useRef(true);
  const skipNextAutoPersistRef = useRef(false);
  const draftMetaRef = useRef(draftMeta);
  const userSelectedClassRef = useRef(false);

  const activeClass = useMemo(
    () => resolvedClasses.find((item) => item.id === activeClassId) || null,
    [resolvedClasses, activeClassId]
  );
  const activeClassAssignments = useMemo(
    () => assignmentsByClassId.get(activeClassId) || [],
    [assignmentsByClassId, activeClassId]
  );
  const classSubjectOptions = useMemo(() => {
    const subjectMap = new Map();

    activeClassAssignments.forEach((assignment) => {
      const current = subjectMap.get(assignment.subjectId);
      if (!current) {
        subjectMap.set(assignment.subjectId, {
          id: assignment.subjectId,
          label: assignment.subjectLabel,
          category: assignment.category,
          teachers: new Set([assignment.teacherId])
        });
        return;
      }

      current.teachers.add(assignment.teacherId);
    });

    return Array.from(subjectMap.values())
      .map((item) => ({
        id: item.id,
        label: item.label,
        category: item.category,
        teacherCount: item.teachers.size
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [activeClassAssignments]);
  const assignmentOptionsBySubject = useMemo(() => activeClassAssignments.reduce((acc, item) => {
    if (!acc.has(item.subjectId)) acc.set(item.subjectId, []);
    acc.get(item.subjectId).push(item);
    return acc;
  }, new Map()), [activeClassAssignments]);
  const slotRowByPeriod = useMemo(
    () => slotRows.reduce((acc, row) => {
      acc[row.slotNumber] = row;
      return acc;
    }, {}),
    [slotRows]
  );
  const hasRegisteredSubjects = resolvedSubjects.length > 0;
  const hasAssignableSubjects = classSubjectOptions.length > 0;
  const isEditingEnabled = editable && Boolean(activeClass) && hasAssignableSubjects;
  const hasScheduledCells = Object.keys(schedule || {}).length > 0;
  const hasCustomSlotRows = useMemo(() => areDailyTimetableSlotRowsCustomized(slotRows), [slotRows]);
  const isCustomized = hasScheduledCells || hasCustomSlotRows;
  const filledCellsForDay = useMemo(
    () => (
      activeClass
        ? PERIODS.filter((period) => schedule[makeCellKey(activeClass.id, selectedDay, period)]).length
        : 0
    ),
    [activeClass, schedule, selectedDay]
  );
  const scheduledClassCount = useMemo(
    () => new Set(Object.keys(schedule || {}).map((key) => key.split('__')[0]).filter(Boolean)).size,
    [schedule]
  );
  const activeTeacherCount = useMemo(
    () => new Set(activeClassAssignments.map((item) => item.teacherId)).size,
    [activeClassAssignments]
  );
  const publishState = buildPublishSummary(draftMeta);
  const publishedAtLabel = formatPersianDateTime(draftMeta?.publishedAt);
  const canPublish = editable && hasScheduledCells;
  const currentDayLabel = DAYS.find((day) => day.value === selectedDay)?.label || 'شنبه';
  const dayDateMap = useMemo(() => {
    const weekStart = startOfSaturdayWeek(new Date());

    return DAYS.reduce((acc, day, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      acc[day.value] = formatPersianDayDate(date);
      return acc;
    }, {});
  }, []);
  const currentTeacherOptions = useMemo(
    () => (editingCell?.subjectId ? assignmentOptionsBySubject.get(editingCell.subjectId) || [] : []),
    [assignmentOptionsBySubject, editingCell]
  );

  useEffect(() => {
    const nextDraft = persistedDraft || null;
    skipNextAutoPersistRef.current = true;
    setDraftMeta(nextDraft);
    setSelectedDay(nextDraft?.selectedDay || DAYS[0].value);
    setSchedule(draftItemsToScheduleMap(nextDraft?.items || []));
    setSlotRows(normalizeDailyTimetableSlotRows(nextDraft?.slotRows));
    setActiveClassId((current) => {
      const hasCurrentSelection = resolvedClasses.some((item) => item.id === current);
      if (userSelectedClassRef.current && hasCurrentSelection) {
        return current;
      }

      return resolvePreferredActiveClassId(nextDraft, resolvedClasses, defaultActiveClassId);
    });
    setCellEditorError('');
    setSlotEditorError('');
  }, [persistedDraft, resolvedClasses, defaultActiveClassId]);

  useEffect(() => {
    draftMetaRef.current = draftMeta;
  }, [draftMeta]);

  const persistBoardState = ({
    nextSchedule = schedule,
    nextSlotRows = slotRows,
    nextSelectedDay = selectedDay,
    nextActiveClass = activeClass,
    nextActiveClassId = activeClassId
  } = {}) => {
    const nextHasScheduledCells = Object.keys(nextSchedule || {}).length > 0;
    const nextHasCustomSlotRows = areDailyTimetableSlotRowsCustomized(nextSlotRows);
    const nextIsCustomized = nextHasScheduledCells || nextHasCustomSlotRows;

    if (!nextIsCustomized) {
      clearDailyTimetableDraft();
      if (typeof onClearDraft === 'function') {
        onClearDraft();
      }
      return null;
    }

    const currentDraftMeta = draftMetaRef.current;
    const payload = {
      ...currentDraftMeta,
      selectedDay: nextSelectedDay,
      activeClassId: nextActiveClassId,
      activeClassTitle: nextActiveClass?.title || '',
      slotRows: nextSlotRows,
      classes: resolvedClasses,
      items: scheduleMapToDraftItems(nextSchedule, resolvedClasses),
      status: currentDraftMeta?.hasPublishedVersion ? 'draft' : currentDraftMeta?.status,
      isCustomized: nextIsCustomized
    };
    const nextDraft = writeDailyTimetableDraft(payload);

    if (nextDraft) {
      setDraftMeta(nextDraft);
    }

    if (typeof onPersistDraft === 'function') {
      onPersistDraft(nextDraft || payload);
    }

    return nextDraft;
  };

  useEffect(() => {
    setEditingCell(null);
    setCellEditorError('');
  }, [activeClassId, selectedDay]);

  useEffect(() => {
    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }

    if (skipNextAutoPersistRef.current) {
      skipNextAutoPersistRef.current = false;
      return;
    }

    if (!isCustomized) {
      clearDailyTimetableDraft();
      if (typeof onClearDraft === 'function') {
        onClearDraft();
      }
      return;
    }

    const currentDraftMeta = draftMetaRef.current;
    const payload = {
      ...currentDraftMeta,
      selectedDay,
      activeClassId,
      activeClassTitle: activeClass?.title || '',
      slotRows,
      classes: resolvedClasses,
      items: scheduleMapToDraftItems(schedule, resolvedClasses),
      status: currentDraftMeta?.hasPublishedVersion ? 'draft' : currentDraftMeta?.status,
      isCustomized
    };
    const nextDraft = writeDailyTimetableDraft(payload);

    if (nextDraft) {
      setDraftMeta(nextDraft);
    }

    if (typeof onPersistDraft === 'function') {
      onPersistDraft(nextDraft || payload);
    }
  }, [activeClass, activeClassId, isCustomized, onClearDraft, onPersistDraft, resolvedClasses, schedule, selectedDay, slotRows]);

  const openEditor = (period) => {
    if (!activeClass) return;

    const key = makeCellKey(activeClass.id, selectedDay, period);
    const cell = schedule[key];
    if (!editable || (!hasAssignableSubjects && !cell)) return;
    const subjectOptions = cell?.subjectId ? assignmentOptionsBySubject.get(cell.subjectId) || [] : [];
    const selectedAssignment = pickAssignmentForSubject(subjectOptions, cell?.teacherId);

    setEditingCell({
      classId: activeClass.id,
      classTitle: activeClass.title,
      day: selectedDay,
      period,
      subjectId: cell?.subjectId || '',
      teacherId: selectedAssignment?.teacherId || cell?.teacherId || '',
      teacherName: selectedAssignment?.teacherName || cell?.teacherName || '',
      teacherAssignmentId: selectedAssignment?.id || cell?.teacherAssignmentId || ''
    });
    setCellEditorError('');
  };

  const closeEditor = () => {
    setEditingCell(null);
    setCellEditorError('');
  };

  const closeSlotEditor = () => {
    setEditingSlot(null);
    setSlotEditorError('');
  };

  const handleSubjectChange = (subjectId) => {
    setEditingCell((current) => {
      if (!current) return current;

      const options = assignmentOptionsBySubject.get(subjectId) || [];
      const matchedAssignment = pickAssignmentForSubject(options, current.teacherId);

      return {
        ...current,
        subjectId,
        teacherId: matchedAssignment?.teacherId || '',
        teacherName: matchedAssignment?.teacherName || '',
        teacherAssignmentId: matchedAssignment?.id || ''
      };
    });
    setCellEditorError('');
  };

  const handleTeacherChange = (teacherId) => {
    setEditingCell((current) => {
      if (!current) return current;

      const options = assignmentOptionsBySubject.get(current.subjectId) || [];
      const matchedAssignment = options.find((item) => item.teacherId === teacherId) || null;

      return {
        ...current,
        teacherId: matchedAssignment?.teacherId || '',
        teacherName: matchedAssignment?.teacherName || '',
        teacherAssignmentId: matchedAssignment?.id || ''
      };
    });
    setCellEditorError('');
  };

  const saveCell = () => {
    if (!editingCell?.subjectId) {
      setCellEditorError('ابتدا مضمون را انتخاب کنید.');
      return;
    }

    if (!editingCell.teacherId || !editingCell.teacherAssignmentId) {
      setCellEditorError('برای این مضمون باید استاد مشخص شود.');
      return;
    }

    if (!activeClass) {
      setCellEditorError('صنف فعال پیدا نشد.');
      return;
    }

    const options = assignmentOptionsBySubject.get(editingCell.subjectId) || [];
    const selectedAssignment = options.find((item) => item.id === editingCell.teacherAssignmentId)
      || options.find((item) => item.teacherId === editingCell.teacherId)
      || null;

    if (!selectedAssignment) {
      setCellEditorError('تخصیص معتبر استاد برای این مضمون پیدا نشد.');
      return;
    }

    const key = makeCellKey(editingCell.classId, editingCell.day, editingCell.period);
    const nextSchedule = {
      ...schedule,
      [key]: createCellValue(selectedAssignment, activeClass)
    };

    skipNextAutoPersistRef.current = true;
    setSchedule(nextSchedule);
    persistBoardState({ nextSchedule });
    closeEditor();
  };

  const clearCell = () => {
    if (!editingCell) return;

    const key = makeCellKey(editingCell.classId, editingCell.day, editingCell.period);
    const nextSchedule = { ...schedule };
    delete nextSchedule[key];
    setSchedule(nextSchedule);
    closeEditor();
  };

  const resetBoard = () => {
    if (!activeClass) return;

    const classKeyPrefix = `${activeClass.id}__`;
    setSchedule((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(classKeyPrefix))
    ));
    closeEditor();
    closeSlotEditor();
  };

  const openSlotEditor = (period) => {
    if (!editable) return;

    const slotMeta = slotRowByPeriod[period] || normalizeDailyTimetableSlotRows()[period - 1];
    if (!slotMeta) return;

    setEditingSlot({
      slotNumber: slotMeta.slotNumber,
      label: slotMeta.label,
      startTime: slotMeta.startTime,
      endTime: slotMeta.endTime
    });
    setSlotEditorError('');
  };

  const saveSlotEditor = () => {
    if (!editingSlot) return;

    const startMinutes = parseClockToMinutes(editingSlot.startTime);
    const endMinutes = parseClockToMinutes(editingSlot.endTime);

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
      setSlotEditorError('ساعت شروع و ختم باید معتبر باشد.');
      return;
    }

    if (endMinutes <= startMinutes) {
      setSlotEditorError('ساعت ختم باید بعد از ساعت شروع باشد.');
      return;
    }

    setSlotRows((current) => normalizeDailyTimetableSlotRows(
      current.map((slot) => (
        slot.slotNumber === editingSlot.slotNumber
          ? {
            ...slot,
            startTime: editingSlot.startTime,
            endTime: editingSlot.endTime
          }
          : slot
      ))
    ));
    closeSlotEditor();
  };

  const publishBoard = async () => {
    if (typeof onPublishDraft !== 'function' || isPublishing) return;

    const payload = writeDailyTimetableDraft({
      ...(draftMetaRef.current || draftMeta),
      selectedDay,
      activeClassId,
      activeClassTitle: activeClass?.title || '',
      slotRows,
      classes: resolvedClasses,
      items: scheduleMapToDraftItems(schedule, resolvedClasses),
      isCustomized
    }) || {
      ...(draftMetaRef.current || draftMeta),
      selectedDay,
      activeClassId,
      activeClassTitle: activeClass?.title || '',
      slotRows,
      classes: resolvedClasses,
      items: scheduleMapToDraftItems(schedule, resolvedClasses),
      isCustomized
    };

    try {
      setIsPublishing(true);
      const publishedDraft = await onPublishDraft(payload);
      if (publishedDraft) {
        setDraftMeta(publishedDraft);
      }
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <section className="daily-tt-shell">
      <div className="daily-tt-glow daily-tt-glow--blue" />
      <div className="daily-tt-glow daily-tt-glow--amber" />
      <div className="daily-tt-glow daily-tt-glow--mint" />

      <div className="daily-tt-board">
        <div className="daily-tt-board-noise" aria-hidden="true" />

        <div className="daily-tt-hero">
          <div className="daily-tt-hero-main">
            <Badge variant="outline" className="daily-tt-chip">
              تنظیم صنف‌محور تقسیم اوقات
            </Badge>

            <h2 className="daily-tt-title">جدول روزانه‌ی صنف‌ها</h2>

            <p className="daily-tt-subtitle">
              در این صفحه برای هر صنف، هر روز و هر زنگ فقط یک خانه داریم. مضمون از روی تخصیص‌های ثبت‌شده‌ی استادان
              خوانده می‌شود و اگر یک مضمون چند استاد داشته باشد، همان‌جا استاد را انتخاب می‌کنید.
            </p>

            <div className="daily-tt-inline-meta">
              <span className="daily-tt-inline-pill">
                مضامین ثبت‌شده در سیستم: {toPersianNumber(resolvedSubjects.length)}
              </span>
              {activeClass ? (
                <span className="daily-tt-inline-pill">
                  صنف فعال: {activeClass.title}
                </span>
              ) : null}
              <span className="daily-tt-inline-pill">
                {publishState.label}
              </span>
              {publishedAtLabel ? (
                <span className="daily-tt-inline-pill">
                  آخرین نشر: {publishedAtLabel}
                </span>
              ) : null}
            </div>

            <div className="daily-tt-class-picker">
              <label className="daily-tt-field daily-tt-class-field">
                <span>صنف فعال</span>
                <select
                  value={activeClassId}
                  onChange={(event) => {
                    userSelectedClassRef.current = true;
                    setActiveClassId(event.target.value);
                  }}
                  disabled={resolvedClasses.length === 0}
                >
                  {resolvedClasses.length === 0 ? <option value="">هنوز صنفی ثبت نشده است</option> : null}
                  {resolvedClasses.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.title}
                    </option>
                  ))}
                </select>
              </label>

              {activeClass ? (
                <div className="daily-tt-class-summary">
                  <strong>{activeClass.title}</strong>
                  <span>
                    {activeClass.room ? `اتاق: ${activeClass.room}` : 'اتاق مشخص نشده'}
                    {activeClass.section ? ` • بخش: ${activeClass.section}` : ''}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="daily-tt-subject-panel">
            <div className="daily-tt-panel-head">
              <div>
                <h3 className="daily-tt-panel-title">مضامین صنف فعال</h3>
                <p className="daily-tt-panel-caption">
                  فقط مضامینی نشان داده می‌شوند که برای همین صنف در بخش تخصیص استاد، استاد گرفته باشند.
                </p>
              </div>
              <span className="daily-tt-panel-count">{toPersianNumber(classSubjectOptions.length)}</span>
            </div>

            {classSubjectOptions.length > 0 ? (
              <div className="daily-tt-subject-cloud">
                {classSubjectOptions.slice(0, 12).map((subject) => (
                  <span
                    key={subject.id}
                    className={`daily-tt-subject-chip daily-tt-subject-chip--${getSubjectTone(subject.label, subject.category)}`}
                  >
                    <strong>{subject.label}</strong>
                    <small>
                      {translateCategory(subject.category) || 'مضمون ثبت‌شده'}
                      {subject.teacherCount > 1 ? ` • ${toPersianNumber(subject.teacherCount)} استاد` : ''}
                    </small>
                  </span>
                ))}
              </div>
            ) : (
              <div className="daily-tt-subject-empty">
                {activeClass
                  ? 'برای صنف فعال هنوز تخصیص مضمون و استاد ثبت نشده است. ابتدا در بخش تخصیص استاد، مضمون را به همین صنف وصل کنید.'
                  : 'ابتدا یک صنف انتخاب کنید تا مضامین قابل استفاده نشان داده شود.'}
              </div>
            )}
          </aside>
        </div>

        <div className="daily-tt-stats">
          <div className="daily-tt-stat">
            <span className="daily-tt-stat-value">{toPersianNumber(resolvedClasses.length)}</span>
            <span className="daily-tt-stat-label">صنف ثبت‌شده</span>
          </div>
          <div className="daily-tt-stat">
            <span className="daily-tt-stat-value">{toPersianNumber(activeTeacherCount)}</span>
            <span className="daily-tt-stat-label">استادان صنف فعال</span>
          </div>
          <div className="daily-tt-stat">
            <span className="daily-tt-stat-value">{currentDayLabel}</span>
            <span className="daily-tt-stat-label">روز انتخاب‌شده</span>
          </div>
          <div className="daily-tt-stat">
            <span className="daily-tt-stat-value">{toPersianNumber(filledCellsForDay)}</span>
            <span className="daily-tt-stat-label">زنگ‌های پُر شده</span>
          </div>
        </div>

        <div className="daily-tt-toolbar">
          <div className="daily-tt-days" role="tablist" aria-label="روزهای هفته">
            {DAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`daily-tt-day ${selectedDay === day.value ? 'is-active' : ''}`}
                onClick={() => setSelectedDay(day.value)}
              >
                <span className="daily-tt-day-dot" />
                <span className="daily-tt-day-copy">
                  <span className="daily-tt-day-label">{day.label}</span>
                  <small className="daily-tt-day-date">{dayDateMap[day.value] || ''}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="daily-tt-meta">
            <Badge variant="outline" className="daily-tt-meta-badge">
              {isEditingEnabled
                ? draftMeta?.status === 'published'
                  ? 'نشر همگام'
                  : publishState.hasPublishedVersion
                    ? 'درفت تازه'
                    : 'ویرایش فعال'
                : resolvedClasses.length === 0
                  ? 'در انتظار صنف'
                  : 'در انتظار تخصیص'}
            </Badge>
            <Badge variant="outline" className="daily-tt-meta-badge">
              صنف‌های دارای چیدمان: {toPersianNumber(scheduledClassCount)}
            </Badge>
            <Button size="sm" onClick={publishBoard} disabled={!canPublish || isPublishing}>
              {isPublishing ? 'در حال نشر...' : publishState.buttonLabel}
            </Button>
            <Button variant="outline" size="sm" onClick={resetBoard} disabled={!activeClass}>
              پاک‌سازی صنف فعال
            </Button>
          </div>
        </div>

        {!resolvedClasses.length ? (
          <div className="daily-tt-alert">
            برای ساخت تقسیم اوقات، ابتدا حداقل یک صنف در بخش آموزش ثبت کنید.
          </div>
        ) : null}

        {resolvedClasses.length > 0 && !hasRegisteredSubjects ? (
          <div className="daily-tt-alert">
            هنوز مضمون ثبت نشده است. ابتدا در بخش <strong>مضامین</strong> حداقل یک مضمون بسازید.
          </div>
        ) : null}

        {resolvedClasses.length > 0 && hasRegisteredSubjects && !hasAssignableSubjects ? (
          <div className="daily-tt-alert">
            برای صنف فعال هنوز تخصیص مضمون و استاد ساخته نشده است. لطفاً اول در بخش تخصیص استاد، استادان را به
            مضامین همین صنف وصل کنید.
          </div>
        ) : null}

        <div className="daily-tt-table-shell">
          <div className="daily-tt-table-wrap">
            <table className="daily-tt-table">
              <thead>
                <tr>
                  <th className="daily-tt-heading daily-tt-heading--teacher">صنف</th>
                  {PERIODS.map((period) => {
                    const slotMeta = slotRowByPeriod[period] || {};
                    return (
                      <th key={period} className="daily-tt-heading">
                        <div className="daily-tt-heading-copy">
                          <span className="daily-tt-heading-title">زنگ {toPersianNumber(period)}</span>
                          <span className="daily-tt-heading-time">
                            {slotMeta.startTime || '--:--'} - {slotMeta.endTime || '--:--'}
                          </span>
                          {editable ? (
                            <button
                              type="button"
                              className="daily-tt-heading-edit"
                              onClick={(event) => {
                                event.stopPropagation();
                                openSlotEditor(period);
                              }}
                            >
                              ویرایش ساعت
                            </button>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="daily-tt-teacher" scope="row">
                    <span className="daily-tt-teacher-name">{activeClass?.title || 'صنف را انتخاب کنید'}</span>
                    <span className="daily-tt-teacher-day">{currentDayLabel}</span>
                  </th>

                  {PERIODS.map((period) => {
                    const cell = activeClass ? schedule[makeCellKey(activeClass.id, selectedDay, period)] : null;
                    const cellCanOpen = Boolean(activeClass) && (isEditingEnabled || Boolean(cell));
                    const tone = getSubjectTone(cell?.subject, cell?.category);
                    const categoryLabel = translateCategory(cell?.category);

                    return (
                      <td key={`${activeClassId || 'class'}-${selectedDay}-${period}`} className="daily-tt-slot">
                        <button
                          type="button"
                          className={`daily-tt-cell daily-tt-cell--${tone} ${
                            cellCanOpen ? 'is-editable' : 'is-readonly'
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditor(period);
                          }}
                          disabled={!cellCanOpen}
                        >
                          {cell ? (
                            <>
                              {categoryLabel ? <span className="daily-tt-cell-badge">{categoryLabel}</span> : null}
                              <span className="daily-tt-cell-subject">{cell.subject}</span>
                              <span className="daily-tt-cell-teacher">{cell.teacherName || 'استاد'}</span>
                            </>
                          ) : (
                            <span className="daily-tt-cell-empty">
                              {isEditingEnabled
                                ? 'برای ثبت مضمون کلیک کنید'
                                : activeClass
                                  ? 'برای این صنف هنوز تخصیص آماده نیست'
                                  : 'ابتدا صنف را انتخاب کنید'}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editingCell ? (
        <div className="daily-tt-modal-backdrop" onClick={closeEditor}>
          <div className="daily-tt-modal" onClick={(event) => event.stopPropagation()}>
            <div className="daily-tt-modal-head">
              <div>
                <h3 className="daily-tt-modal-title">ویرایش خانه‌ی تقسیم اوقات</h3>
                <p className="daily-tt-modal-note">
                  {editingCell.classTitle} • {currentDayLabel} • زنگ {toPersianNumber(editingCell.period)}
                </p>
              </div>
              <button type="button" className="daily-tt-close" onClick={closeEditor}>
                ×
              </button>
            </div>

            <div className="daily-tt-form">
              <label className="daily-tt-field">
                <span>مضمون</span>
                <select
                  value={editingCell.subjectId}
                  onChange={(event) => handleSubjectChange(event.target.value)}
                >
                  <option value="">مضمون را انتخاب کنید</option>
                  {classSubjectOptions.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.label}
                      {translateCategory(subject.category) ? ` • ${translateCategory(subject.category)}` : ''}
                      {subject.teacherCount > 1 ? ` • ${toPersianNumber(subject.teacherCount)} استاد` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {editingCell.subjectId ? (
                currentTeacherOptions.length > 1 ? (
                  <label className="daily-tt-field">
                    <span>استاد</span>
                    <select
                      value={editingCell.teacherId}
                      onChange={(event) => handleTeacherChange(event.target.value)}
                    >
                      <option value="">استاد را انتخاب کنید</option>
                      {currentTeacherOptions.map((assignment) => (
                        <option key={assignment.id} value={assignment.teacherId}>
                          {assignment.teacherName}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : currentTeacherOptions.length === 1 ? (
                  <div className="daily-tt-assigned-teacher">
                    <span className="daily-tt-assigned-teacher-label">استاد این مضمون</span>
                    <strong>{currentTeacherOptions[0].teacherName}</strong>
                  </div>
                ) : (
                  <div className="daily-tt-field-error">
                    برای این مضمون هنوز استاد معتبر پیدا نشد.
                  </div>
                )
              ) : null}
            </div>

            {cellEditorError ? (
              <div className="daily-tt-field-error">{cellEditorError}</div>
            ) : null}

            <div className="daily-tt-modal-actions">
              <Button onClick={saveCell} disabled={!editingCell.subjectId}>
                ذخیره
              </Button>
              <Button variant="outline" onClick={clearCell}>
                حذف خانه
              </Button>
              <Button variant="outline" onClick={closeEditor}>
                بستن
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingSlot ? (
        <div className="daily-tt-modal-backdrop" onClick={closeSlotEditor}>
          <div className="daily-tt-modal daily-tt-modal--compact" onClick={(event) => event.stopPropagation()}>
            <div className="daily-tt-modal-head">
              <div>
                <h3 className="daily-tt-modal-title">ویرایش ساعت زنگ</h3>
                <p className="daily-tt-modal-note">
                  {editingSlot.label} را با ساعت شروع و ختم دلخواه تنظیم کنید.
                </p>
              </div>
              <button type="button" className="daily-tt-close" onClick={closeSlotEditor}>
                ×
              </button>
            </div>

            <div className="daily-tt-time-grid">
              <label className="daily-tt-field">
                <span>شروع زنگ</span>
                <input
                  type="time"
                  value={editingSlot.startTime}
                  onChange={(event) => {
                    setEditingSlot((current) => ({
                      ...current,
                      startTime: event.target.value
                    }));
                    setSlotEditorError('');
                  }}
                />
              </label>

              <label className="daily-tt-field">
                <span>ختم زنگ</span>
                <input
                  type="time"
                  value={editingSlot.endTime}
                  onChange={(event) => {
                    setEditingSlot((current) => ({
                      ...current,
                      endTime: event.target.value
                    }));
                    setSlotEditorError('');
                  }}
                />
              </label>
            </div>

            {slotEditorError ? (
              <div className="daily-tt-field-error">{slotEditorError}</div>
            ) : null}

            <div className="daily-tt-modal-actions">
              <Button onClick={saveSlotEditor}>
                ذخیره ساعت
              </Button>
              <Button variant="outline" onClick={closeSlotEditor}>
                بستن
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default DailyTimetableBoard;
