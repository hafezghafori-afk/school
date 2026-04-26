export const DAILY_TIMETABLE_DRAFT_STORAGE_KEY = 'daily_timetable_board_draft_v1';

export const DAILY_TIMETABLE_DAYS = [
  { value: 'saturday', label: 'شنبه' },
  { value: 'sunday', label: 'یکشنبه' },
  { value: 'monday', label: 'دوشنبه' },
  { value: 'tuesday', label: 'سه‌شنبه' },
  { value: 'wednesday', label: 'چهارشنبه' },
  { value: 'thursday', label: 'پنجشنبه' }
];

export const DAILY_TIMETABLE_SLOT_ROWS = [
  { slotNumber: 1, label: 'زنگ 1', startTime: '08:00', endTime: '08:40' },
  { slotNumber: 2, label: 'زنگ 2', startTime: '08:40', endTime: '09:20' },
  { slotNumber: 3, label: 'زنگ 3', startTime: '09:20', endTime: '10:00' },
  { slotNumber: 4, label: 'زنگ 4', startTime: '10:10', endTime: '10:50' },
  { slotNumber: 5, label: 'زنگ 5', startTime: '10:50', endTime: '11:30' },
  { slotNumber: 6, label: 'زنگ 6', startTime: '11:30', endTime: '12:10' }
];

export const DAILY_TIMETABLE_WEEKLY_SLOT_ROWS = [
  { slotNumber: 1, dailyPeriod: 1, label: 'زنگ 1', startTime: '08:00', endTime: '08:40', type: 'class' },
  { slotNumber: 2, dailyPeriod: 2, label: 'زنگ 2', startTime: '08:40', endTime: '09:20', type: 'class' },
  { slotNumber: 3, dailyPeriod: 3, label: 'زنگ 3', startTime: '09:20', endTime: '10:00', type: 'class' },
  { slotNumber: 4, dailyPeriod: 0, label: 'تفریح', startTime: '10:00', endTime: '10:10', type: 'break' },
  { slotNumber: 5, dailyPeriod: 4, label: 'زنگ 4', startTime: '10:10', endTime: '10:50', type: 'class' },
  { slotNumber: 6, dailyPeriod: 5, label: 'زنگ 5', startTime: '10:50', endTime: '11:30', type: 'class' },
  { slotNumber: 7, dailyPeriod: 6, label: 'زنگ 6', startTime: '11:30', endTime: '12:10', type: 'class' }
];

const DAY_LABEL_MAP = DAILY_TIMETABLE_DAYS.reduce((acc, day) => {
  acc[day.value] = day.label;
  return acc;
}, {});

const DAY_SORT_ORDER = DAILY_TIMETABLE_DAYS.reduce((acc, day, index) => {
  acc[day.value] = index;
  return acc;
}, {});

const SLOT_BY_NUMBER = DAILY_TIMETABLE_SLOT_ROWS.reduce((acc, slot) => {
  acc[slot.slotNumber] = slot;
  return acc;
}, {});

const VALID_DAY_SET = new Set(DAILY_TIMETABLE_DAYS.map((day) => day.value));
const WEEKLY_SLOT_BY_DAILY_PERIOD = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 6,
  6: 7
};

const hasStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);
const normalizeText = (value = '') => String(value || '').trim();
const normalizeLookupKey = (value = '') => normalizeText(value).toLowerCase();
const normalizeDailyTimetableStatus = (value = '') => (normalizeLookupKey(value) === 'published' ? 'published' : 'draft');
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const normalizeClockValue = (value = '', fallback = '') => {
  const normalized = normalizeText(value);
  return CLOCK_PATTERN.test(normalized) ? normalized : normalizeText(fallback);
};

const parseClockToMinutes = (value = '') => {
  const normalized = normalizeClockValue(value);
  if (!normalized) return null;

  const [hours = '0', minutes = '0'] = normalized.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) return null;
  return (parsedHours * 60) + parsedMinutes;
};

const serializeSlotRows = (rows = []) => JSON.stringify(
  (Array.isArray(rows) ? rows : []).map((item) => ({
    slotNumber: Number(item?.slotNumber || 0),
    label: normalizeText(item?.label),
    startTime: normalizeClockValue(item?.startTime),
    endTime: normalizeClockValue(item?.endTime)
  }))
);

const resolveEntityId = (value = '') => (
  normalizeText(
    typeof value === 'object' && value !== null
      ? value._id || value.id || ''
      : value
  )
);

export const normalizeDailyTimetableSlotRows = (rows = []) => {
  const rowMap = new Map(
    (Array.isArray(rows) ? rows : []).map((item) => [Number(item?.slotNumber || 0), item])
  );

  return DAILY_TIMETABLE_SLOT_ROWS.map((defaultRow) => {
    const candidate = rowMap.get(defaultRow.slotNumber) || {};
    const startTime = normalizeClockValue(candidate?.startTime, defaultRow.startTime);
    const endTime = normalizeClockValue(candidate?.endTime, defaultRow.endTime);
    const startMinutes = parseClockToMinutes(startTime);
    const endMinutes = parseClockToMinutes(endTime);

    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
      return { ...defaultRow };
    }

    return {
      slotNumber: defaultRow.slotNumber,
      label: normalizeText(candidate?.label) || defaultRow.label,
      startTime,
      endTime
    };
  });
};

export const areDailyTimetableSlotRowsCustomized = (rows = []) => (
  serializeSlotRows(normalizeDailyTimetableSlotRows(rows)) !== serializeSlotRows(DAILY_TIMETABLE_SLOT_ROWS)
);

const buildDailySlotRowMap = (rows = []) => {
  const normalizedRows = normalizeDailyTimetableSlotRows(rows);
  return normalizedRows.reduce((acc, row) => {
    acc[row.slotNumber] = row;
    return acc;
  }, {});
};

export const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(normalizeText(value));

const getTokenClaims = () => {
  if (typeof window === 'undefined') return {};

  const token = window.localStorage.getItem('token');
  if (!token || !token.includes('.')) return {};

  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) || {};
  } catch {
    return {};
  }
};

export const resolveTimetableSchoolId = () => {
  if (typeof window === 'undefined') return 'default-school-id';

  const tokenClaims = getTokenClaims();
  const candidates = [
    window.localStorage.getItem('schoolId'),
    window.localStorage.getItem('school_id'),
    window.localStorage.getItem('selectedSchoolId'),
    tokenClaims.schoolId,
    tokenClaims.school_id,
    tokenClaims.orgSchoolId,
    tokenClaims.school,
    tokenClaims.school?._id
  ];

  return candidates.map(normalizeText).find(isValidObjectId) || 'default-school-id';
};

const normalizeTeacherList = (teachers = []) => {
  if (!Array.isArray(teachers)) return [];

  return teachers.map((teacher, index) => {
    const id = resolveEntityId(teacher?._id || teacher?.id || teacher?.teacherId || teacher);
    const name = normalizeText(teacher?.name || teacher?.teacherName || teacher?.label);
    if (!id && !name) return null;

    return {
      id,
      name: name || `استاد ${index + 1}`
    };
  }).filter(Boolean);
};

const normalizeClassList = (classes = []) => {
  if (!Array.isArray(classes)) return [];

  return classes.map((item) => {
    const id = resolveEntityId(item?._id || item?.id || item?.classId || item);
    const title = normalizeText(item?.title || item?.name || item?.label || item?.classTitle);
    if (!id && !title) return null;

    return {
      id,
      title,
      titleDari: normalizeText(item?.titleDari),
      room: normalizeText(item?.room || item?.classroomNumber),
      shiftId: resolveEntityId(item?.shiftId),
      academicYearId: resolveEntityId(item?.academicYearId)
    };
  }).filter(Boolean);
};

const buildClassLookup = (classes = []) => {
  const lookup = new Map();
  const byId = new Map();

  normalizeClassList(classes).forEach((item) => {
    if (item.id) byId.set(item.id, item);

    [
      item.title,
      item.titleDari,
      item.room
    ].map(normalizeLookupKey).filter(Boolean).forEach((key) => {
      if (!lookup.has(key)) lookup.set(key, item);
    });
  });

  return { lookup, byId };
};

const normalizeDraftItem = (
  item = {},
  {
    teacherNameById = new Map(),
    fallbackClassId = '',
    fallbackClassTitle = ''
  } = {}
) => {
  const classId = resolveEntityId(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || fallbackClassId);
  const classTitle = normalizeText(item?.classTitle || item?.schoolClass?.title || item?.classroom || item?.room || fallbackClassTitle);
  const teacherId = resolveEntityId(item?.teacherId || item?.instructorId || item?.teacher?._id || item?.teacher?.id);
  const teacherName = normalizeText(item?.teacherName || item?.instructorName || item?.teacher?.name);
  const day = normalizeText(item?.day).toLowerCase();
  const period = Number(item?.period);
  const subject = normalizeText(item?.subject || item?.subjectId?.name);

  if (
    (!classId && !classTitle)
    || (!teacherId && !teacherName)
    || !VALID_DAY_SET.has(day)
    || !Number.isInteger(period)
    || period < 1
    || period > 6
    || !subject
  ) {
    return null;
  }

  const subjectId = resolveEntityId(item?.subjectId) || `subject-${classId || classTitle}-${day}-${period}`;
  const resolvedClassTitle = classTitle || fallbackClassTitle;

  return {
    id: normalizeText(item?.id) || `${classId || 'class'}__${day}__${period}`,
    teacherAssignmentId: resolveEntityId(item?.teacherAssignmentId || item?.assignmentId),
    classId,
    classTitle: resolvedClassTitle,
    teacherId,
    teacherName: teacherName || teacherNameById.get(teacherId) || 'استاد',
    day,
    period,
    subjectId,
    subject,
    category: normalizeText(item?.category),
    classroom: normalizeText(item?.classroom || item?.room || resolvedClassTitle)
  };
};

export const normalizeDailyTimetableSnapshot = (payload = null, teachers = []) => {
  if (!payload || typeof payload !== 'object') return null;

  const normalizedTeachers = normalizeTeacherList(
    Array.isArray(teachers) && teachers.length ? teachers : payload.teachers || []
  );
  const teacherNameById = new Map(normalizedTeachers.map((teacher) => [teacher.id, teacher.name]));
  const selectedDay = VALID_DAY_SET.has(normalizeText(payload.selectedDay).toLowerCase())
    ? normalizeText(payload.selectedDay).toLowerCase()
    : DAILY_TIMETABLE_DAYS[0].value;
  const fallbackClassId = normalizeText(payload.activeClassId);
  const fallbackClassTitle = normalizeText(payload.activeClassTitle);
  const items = Array.isArray(payload.items)
    ? payload.items
      .map((item) => normalizeDraftItem(item, {
        teacherNameById,
        fallbackClassId,
        fallbackClassTitle
      }))
      .filter(Boolean)
    : [];
  const slotRows = normalizeDailyTimetableSlotRows(payload.slotRows);
  const activeClassId = normalizeText(payload.activeClassId)
    || normalizeText(items[0]?.classId);
  const activeClassTitle = normalizeText(payload.activeClassTitle)
    || normalizeText(items.find((item) => normalizeText(item.classId) === activeClassId)?.classTitle)
    || normalizeText(items[0]?.classTitle);

  return {
    selectedDay,
    activeClassId,
    activeClassTitle,
    slotRows,
    items,
    isCustomized: payload.isCustomized !== undefined
      ? Boolean(payload.isCustomized) || items.length > 0 || areDailyTimetableSlotRowsCustomized(slotRows)
      : items.length > 0 || areDailyTimetableSlotRowsCustomized(slotRows),
    updatedAt: normalizeText(payload.updatedAt) || normalizeText(payload.publishedAt)
  };
};

export const normalizeDailyTimetableDraft = (payload = null) => {
  if (!payload || typeof payload !== 'object') return null;

  const teachers = normalizeTeacherList(payload.teachers || []);
  const draft = normalizeDailyTimetableSnapshot(payload, teachers);
  const publishedSource = payload.published && typeof payload.published === 'object'
    ? payload.published
    : (
      Array.isArray(payload.publishedItems)
      || payload.publishedSelectedDay
      || payload.publishedActiveClassId
      || payload.publishedActiveClassTitle
      || payload.publishedAt
    )
      ? {
        selectedDay: payload.publishedSelectedDay,
        activeClassId: payload.publishedActiveClassId,
        activeClassTitle: payload.publishedActiveClassTitle,
        slotRows: payload.publishedSlotRows,
        items: payload.publishedItems,
        updatedAt: payload.publishedAt
      }
      : null;
  const published = normalizeDailyTimetableSnapshot(publishedSource, teachers);
  const hasPublishedVersion = Boolean(payload.hasPublishedVersion) || Boolean(published?.items?.length);

  return {
    version: 2,
    schoolId: normalizeText(payload.schoolId),
    selectedDay: draft?.selectedDay || DAILY_TIMETABLE_DAYS[0].value,
    activeClassId: normalizeText(draft?.activeClassId),
    activeClassTitle: normalizeText(draft?.activeClassTitle),
    slotRows: Array.isArray(draft?.slotRows) ? draft.slotRows : normalizeDailyTimetableSlotRows(),
    teachers,
    items: Array.isArray(draft?.items) ? draft.items : [],
    isCustomized: payload.isCustomized !== undefined
      ? Boolean(payload.isCustomized)
      : Boolean(draft?.items?.length) || areDailyTimetableSlotRowsCustomized(draft?.slotRows),
    status: hasPublishedVersion && normalizeDailyTimetableStatus(payload.status) === 'published' ? 'published' : 'draft',
    hasPublishedVersion,
    publishedAt: normalizeText(payload.publishedAt) || normalizeText(published?.updatedAt),
    published: hasPublishedVersion && published
      ? {
        ...published,
        isCustomized: Boolean(published.items?.length)
      }
      : null,
    updatedAt: normalizeText(payload.updatedAt) || normalizeText(draft?.updatedAt) || new Date().toISOString()
  };
};

export const getDailyTimetableDayLabel = (value = '') => DAY_LABEL_MAP[normalizeText(value).toLowerCase()] || 'روز انتخاب‌شده';

export const scheduleMapToDraftItems = (schedule = {}, classes = []) => {
  const { lookup, byId } = buildClassLookup(classes);

  return Object.entries(schedule || {}).map(([key, value]) => {
    const [rawClassId = '', day = '', periodText = ''] = String(key || '').split('__');
    const period = Number(periodText);
    const subject = normalizeText(value?.subject);
    const classId = normalizeText(rawClassId) || resolveEntityId(value?.classId);
    const matchedClass = byId.get(classId) || lookup.get(
      normalizeLookupKey(value?.classTitle || value?.classroom)
    );

    if (!classId || !VALID_DAY_SET.has(day) || !Number.isInteger(period) || period < 1 || period > 6 || !subject) {
      return null;
    }

    return {
      id: `${classId}__${day}__${period}`,
      teacherAssignmentId: normalizeText(value?.teacherAssignmentId),
      classId,
      classTitle: normalizeText(value?.classTitle) || matchedClass?.title || matchedClass?.titleDari || '',
      teacherId: normalizeText(value?.teacherId),
      teacherName: normalizeText(value?.teacherName) || 'استاد',
      day,
      period,
      subjectId: normalizeText(value?.subjectId) || `subject-${classId}-${day}-${period}`,
      subject,
      category: normalizeText(value?.category),
      classroom: normalizeText(value?.classroom) || matchedClass?.room || matchedClass?.title || ''
    };
  }).filter(Boolean);
};

export const draftItemsToScheduleMap = (items = []) => {
  const teacherNameById = new Map();
  return (Array.isArray(items) ? items : []).reduce((acc, item) => {
    const normalized = normalizeDraftItem(item, { teacherNameById });
    if (!normalized?.classId) return acc;

    acc[`${normalized.classId}__${normalized.day}__${normalized.period}`] = {
      teacherAssignmentId: normalized.teacherAssignmentId,
      teacherId: normalized.teacherId,
      teacherName: normalized.teacherName,
      subjectId: normalized.subjectId,
      subject: normalized.subject,
      category: normalized.category,
      classroom: normalized.classroom || normalized.classTitle,
      classId: normalized.classId,
      classTitle: normalized.classTitle
    };
    return acc;
  }, {});
};

export const readDailyTimetableDraft = () => {
  if (!hasStorage()) return null;

  try {
    const raw = window.localStorage.getItem(DAILY_TIMETABLE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeDailyTimetableDraft(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeDailyTimetableDraft = (payload = {}) => {
  if (!hasStorage()) return null;

  const normalized = normalizeDailyTimetableDraft({
    ...payload,
    isCustomized: payload.isCustomized !== undefined ? payload.isCustomized : true,
    updatedAt: payload.updatedAt || new Date().toISOString()
  });

  if (!normalized) return null;
  window.localStorage.setItem(DAILY_TIMETABLE_DRAFT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearDailyTimetableDraft = () => {
  if (!hasStorage()) return;
  window.localStorage.removeItem(DAILY_TIMETABLE_DRAFT_STORAGE_KEY);
};

export const mapDailyTimetablePeriodToWeeklySlot = (period) => WEEKLY_SLOT_BY_DAILY_PERIOD[Number(period)] || 0;

const createPublishedDailyTimetableEntry = (item = {}, index = 0) => {
  const slotNumber = mapDailyTimetablePeriodToWeeklySlot(item.period);
  if (!slotNumber) return null;

  const classTitle = item.classTitle || item.classroom || 'صنف نامشخص';

  return {
    _id: item.id || `published-daily-${index + 1}`,
    id: item.id || `published-daily-${index + 1}`,
    source: 'daily_published',
    day: item.day,
    period: item.period,
    slotNumber,
    subjectId: {
      _id: item.subjectId || '',
      name: item.subject || '---'
    },
    classId: {
      _id: item.classId || '',
      title: classTitle
    },
    teacherId: {
      _id: item.teacherId || '',
      name: item.teacherName || 'استاد'
    },
    room: item.classroom || classTitle,
    category: item.category || '',
    isPublishedDailyBoard: true
  };
};

export const listPublishedDailyTimetableEntries = (payload = null, filterFn = null) => {
  const published = normalizeDailyTimetableSnapshot(payload);
  if (!published?.isCustomized) return [];
  const slotRowMap = buildDailySlotRowMap(published.slotRows);

  return published.items
    .filter((item) => (typeof filterFn === 'function' ? Boolean(filterFn(item)) : true))
    .map((item, index) => {
      const entry = createPublishedDailyTimetableEntry(item, index);
      if (!entry) return null;
      const slotMeta = slotRowMap[item.period] || SLOT_BY_NUMBER[item.period] || {};
      return {
        ...entry,
        startTime: slotMeta.startTime || '',
        endTime: slotMeta.endTime || ''
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDayOrder = DAY_SORT_ORDER[left.day] ?? Number.MAX_SAFE_INTEGER;
      const rightDayOrder = DAY_SORT_ORDER[right.day] ?? Number.MAX_SAFE_INTEGER;
      if (leftDayOrder !== rightDayOrder) return leftDayOrder - rightDayOrder;
      if (left.slotNumber !== right.slotNumber) return left.slotNumber - right.slotNumber;
      if (String(left.classId?._id || '') !== String(right.classId?._id || '')) {
        return String(left.classId?.title || '').localeCompare(String(right.classId?.title || ''));
      }
      return String(left.teacherId?.name || '').localeCompare(String(right.teacherId?.name || ''));
    });
};

export const mergePublishedDailyTimetableIntoWeeklyGrid = (baseTimetable = {}, payload = null, filterFn = null) => {
  const next = Object.entries(baseTimetable || {}).reduce((acc, [day, slots]) => {
    acc[day] = { ...(slots || {}) };
    return acc;
  }, {});

  listPublishedDailyTimetableEntries(payload, filterFn).forEach((entry) => {
    if (!next[entry.day]) next[entry.day] = {};
    next[entry.day][entry.slotNumber] = entry;
  });

  return next;
};

export const buildWeeklySlotRowsFromDailyDraft = (payload = null) => {
  const normalized = normalizeDailyTimetableSnapshot(payload || { slotRows: DAILY_TIMETABLE_SLOT_ROWS });
  const slotRowMap = buildDailySlotRowMap(normalized?.slotRows);
  const defaultBreak = DAILY_TIMETABLE_WEEKLY_SLOT_ROWS.find((item) => item.type === 'break') || DAILY_TIMETABLE_WEEKLY_SLOT_ROWS[3];
  const breakStartTime = slotRowMap[3]?.endTime || defaultBreak.startTime;
  const breakEndTime = slotRowMap[4]?.startTime || defaultBreak.endTime;
  const breakStartMinutes = parseClockToMinutes(breakStartTime);
  const breakEndMinutes = parseClockToMinutes(breakEndTime);
  const resolvedBreak = Number.isFinite(breakStartMinutes) && Number.isFinite(breakEndMinutes) && breakEndMinutes > breakStartMinutes
    ? { startTime: breakStartTime, endTime: breakEndTime }
    : { startTime: defaultBreak.startTime, endTime: defaultBreak.endTime };

  return DAILY_TIMETABLE_WEEKLY_SLOT_ROWS.map((row) => {
    if (row.type === 'break') {
      return {
        ...row,
        startTime: resolvedBreak.startTime,
        endTime: resolvedBreak.endTime
      };
    }

    const slotMeta = slotRowMap[row.dailyPeriod] || SLOT_BY_NUMBER[row.dailyPeriod] || row;
    return {
      ...row,
      label: slotMeta.label || row.label,
      startTime: slotMeta.startTime || row.startTime,
      endTime: slotMeta.endTime || row.endTime
    };
  });
};

export const buildAdminScheduleFromDraft = (payload = null) => {
  const draft = normalizeDailyTimetableDraft(payload);
  const hasDraftItems = Array.isArray(draft?.items) && draft.items.length > 0;
  const hasPublishedItems = Array.isArray(draft?.published?.items) && draft.published.items.length > 0;
  const source = hasDraftItems
    ? draft
    : hasPublishedItems
      ? {
        ...draft.published,
        selectedDay: draft.published.selectedDay,
        activeClassId: draft.published.activeClassId,
        activeClassTitle: draft.published.activeClassTitle
      }
      : null;
  if (!source?.isCustomized) return null;
  const slotRowMap = buildDailySlotRowMap(source.slotRows);

  const items = source.items
    .filter((item) => item.day === source.selectedDay)
    .sort((left, right) => {
      if (left.period !== right.period) return left.period - right.period;
      if (String(left.classTitle || '') !== String(right.classTitle || '')) {
        return String(left.classTitle || '').localeCompare(String(right.classTitle || ''));
      }
      return String(left.teacherName || '').localeCompare(String(right.teacherName || ''));
    })
    .map((item, index) => {
      const slot = slotRowMap[item.period] || SLOT_BY_NUMBER[item.period] || {};
      const classTitle = item.classTitle || source.activeClassTitle || item.classroom || 'صنف نامشخص';
      const roomLabel = item.classroom || classTitle;

      return {
        id: item.id || `draft-${index + 1}`,
        subject: item.subject,
        startTime: slot.startTime || '',
        endTime: slot.endTime || '',
        room: roomLabel,
        visibility: 'published',
        date: '',
        classId: item.classId || '',
        schoolClass: {
          title: classTitle
        },
        instructor: {
          _id: item.teacherId,
          name: item.teacherName || 'استاد'
        }
      };
    });

  return {
    source: hasDraftItems ? 'draft' : 'published',
    schoolId: draft.schoolId,
    day: source.selectedDay,
    dayLabel: getDailyTimetableDayLabel(source.selectedDay),
    updatedAt: source.updatedAt || draft.updatedAt,
    status: draft.status,
    publishedAt: draft.publishedAt,
    items
  };
};
