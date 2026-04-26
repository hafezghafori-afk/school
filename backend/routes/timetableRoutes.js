const express = require('express');

const { requireAuth, requireRole, requireAnyPermission } = require('../middleware/auth');
const DailyTimetableBoardDraft = require('../models/DailyTimetableBoardDraft');
const SchoolClass = require('../models/SchoolClass');
const TeacherAssignment = require('../models/TeacherAssignment');
const TeacherAvailability = require('../models/TeacherAvailability');
const TimetableEntry = require('../models/TimetableEntry');
const TimetableConfiguration = require('../models/TimetableConfiguration');
const PeriodDefinition = require('../models/PeriodDefinition');
const { logActivity } = require('../utils/activity');
const {
  createAnnualPlan,
  createTimetableConfig,
  createTimetableEntry,
  createWeeklyPlan,
  listAnnualPlans,
  listTimetableConfigs,
  listTimetableEntries,
  listTimetableReferenceData,
  listWeeklyPlans,
  previewTimetableEntryConflict,
  updateTimetableEntry
} = require('../services/timetableService');

const router = express.Router();
const timetableReadPermission = requireAnyPermission(['view_schedule', 'manage_schedule', 'manage_content']);
const timetableWritePermission = requireAnyPermission(['manage_schedule']);
const readAccess = [requireAuth, requireRole(['admin', 'instructor']), timetableReadPermission];
const writeAccess = [requireAuth, requireRole(['admin', 'instructor']), timetableWritePermission];
const publicReadAccess = [requireAuth, requireRole(['admin', 'instructor', 'student'])];
const DAILY_BOARD_DAY_VALUES = new Set(['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday']);
const DAILY_BOARD_DAY_LIST = Array.from(DAILY_BOARD_DAY_VALUES);
const DAILY_BOARD_SLOT_ROWS = [
  { slotNumber: 1, label: 'زنگ 1', startTime: '08:00', endTime: '08:40' },
  { slotNumber: 2, label: 'زنگ 2', startTime: '08:40', endTime: '09:20' },
  { slotNumber: 3, label: 'زنگ 3', startTime: '09:20', endTime: '10:00' },
  { slotNumber: 4, label: 'زنگ 4', startTime: '10:10', endTime: '10:50' },
  { slotNumber: 5, label: 'زنگ 5', startTime: '10:50', endTime: '11:30' },
  { slotNumber: 6, label: 'زنگ 6', startTime: '11:30', endTime: '12:10' }
];
const DAILY_BOARD_PERIOD_TO_OFFICIAL_INDEX = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 6,
  6: 7
};
const DAILY_BOARD_PUBLISH_NOTE = 'daily_board_publish';
const ACTIVE_ASSIGNMENT_STATUSES = ['active', 'planned', 'pending'];

const normalizeText = (value = '') => String(value || '').trim();
const isValidObjectId = (value = '') => /^[a-f\d]{24}$/i.test(normalizeText(value));
const normalizeDailyBoardId = (value = '') => (isValidObjectId(value) ? normalizeText(value) : null);
const normalizeDailyBoardStatus = (value = '') => (normalizeText(value).toLowerCase() === 'published' ? 'published' : 'draft');
const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const normalizeIsoDate = (value = '') => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};
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
const hasExplicitAvailablePeriods = (availablePeriods = []) => (
  Array.isArray(availablePeriods)
  && availablePeriods.some((slot) => Array.isArray(slot?.periodIndexes) && slot.periodIndexes.length > 0)
);
const isPeriodExplicitlyAvailable = (availability, dayCode, periodIndex) => {
  const periods = Array.isArray(availability?.availablePeriods) ? availability.availablePeriods : [];
  if (!hasExplicitAvailablePeriods(periods)) return true;

  const daySlot = periods.find((slot) => slot?.dayCode === dayCode);
  const indexes = Array.isArray(daySlot?.periodIndexes) ? daySlot.periodIndexes : [];
  return indexes.includes(periodIndex);
};
const buildDailyBoardManagedSlotKey = ({ academicYearId, shiftId, classId, dayCode, periodIndex }) => (
  [
    normalizeText(academicYearId),
    normalizeText(shiftId),
    normalizeText(classId),
    normalizeText(dayCode).toLowerCase(),
    Number(periodIndex || 0)
  ].join('__')
);
const buildDailyBoardTeacherSlotKey = ({ academicYearId, shiftId, teacherId, dayCode, periodIndex }) => (
  [
    normalizeText(academicYearId),
    normalizeText(shiftId),
    normalizeText(teacherId),
    normalizeText(dayCode).toLowerCase(),
    Number(periodIndex || 0)
  ].join('__')
);
const mapDailyBoardPeriodToOfficialIndex = (periodIndex = 0) => DAILY_BOARD_PERIOD_TO_OFFICIAL_INDEX[Number(periodIndex)] || 0;

const normalizeDailyBoardSlotRows = (rows = []) => {
  const rowMap = new Map(
    (Array.isArray(rows) ? rows : []).map((item) => [Number(item?.slotNumber || 0), item])
  );

  return DAILY_BOARD_SLOT_ROWS.map((defaultRow) => {
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
const areDailyBoardSlotRowsCustomized = (rows = []) => JSON.stringify(normalizeDailyBoardSlotRows(rows))
  !== JSON.stringify(DAILY_BOARD_SLOT_ROWS);

const formatDailyBoardItems = (items = []) => (
  Array.isArray(items)
    ? items.map((entry, index) => ({
      id: `${normalizeText(entry.classId)}__${normalizeText(entry.day).toLowerCase()}__${Number(entry.period || index + 1)}`,
      teacherAssignmentId: entry.teacherAssignmentId ? String(entry.teacherAssignmentId) : '',
      teacherId: entry.teacherId ? String(entry.teacherId) : '',
      teacherName: normalizeText(entry.teacherName) || 'استاد',
      day: normalizeText(entry.day).toLowerCase(),
      period: Number(entry.period || 0),
      subjectId: entry.subjectId ? String(entry.subjectId) : '',
      subject: normalizeText(entry.subject),
      category: normalizeText(entry.category),
      classroom: normalizeText(entry.classroom),
      classId: entry.classId ? String(entry.classId) : '',
      classTitle: normalizeText(entry.classTitle)
    }))
    : []
);

const formatDailyBoardSnapshot = ({
  selectedDay = '',
  activeClassId = '',
  activeClassTitle = '',
  slotRows = [],
  items = [],
  updatedAt = ''
} = {}) => {
  const normalizedItems = formatDailyBoardItems(items);
  const normalizedSlotRows = normalizeDailyBoardSlotRows(slotRows);

  return {
    selectedDay: DAILY_BOARD_DAY_VALUES.has(normalizeText(selectedDay).toLowerCase())
      ? normalizeText(selectedDay).toLowerCase()
      : 'saturday',
    activeClassId: normalizeText(activeClassId),
    activeClassTitle: normalizeText(activeClassTitle),
    slotRows: normalizedSlotRows,
    isCustomized: normalizedItems.length > 0 || areDailyBoardSlotRowsCustomized(normalizedSlotRows),
    updatedAt: normalizeIsoDate(updatedAt),
    items: normalizedItems
  };
};

const getPublishedDailyBoardSnapshot = (doc = {}) => formatDailyBoardSnapshot({
  selectedDay: doc?.publishedSelectedDay,
  activeClassId: doc?.publishedActiveClassId,
  activeClassTitle: doc?.publishedActiveClassTitle,
  slotRows: doc?.publishedSlotRows,
  items: doc?.publishedItems,
  updatedAt: doc?.publishedAt
});

const hasDailyBoardItems = (snapshot = null) => Array.isArray(snapshot?.items) && snapshot.items.length > 0;

const serializeDailyBoardSnapshot = (snapshot = null) => {
  const normalized = formatDailyBoardSnapshot(snapshot || {});
  const comparableSlotRows = normalizeDailyBoardSlotRows(normalized.slotRows)
    .map((entry) => ({
      slotNumber: Number(entry.slotNumber || 0),
      label: normalizeText(entry.label),
      startTime: normalizeClockValue(entry.startTime),
      endTime: normalizeClockValue(entry.endTime)
    }));
  const comparableItems = normalized.items
    .map((entry) => ({
      teacherAssignmentId: normalizeText(entry.teacherAssignmentId),
      teacherId: normalizeText(entry.teacherId),
      teacherName: normalizeText(entry.teacherName),
      day: normalizeText(entry.day).toLowerCase(),
      period: Number(entry.period || 0),
      subjectId: normalizeText(entry.subjectId),
      subject: normalizeText(entry.subject),
      category: normalizeText(entry.category),
      classroom: normalizeText(entry.classroom),
      classId: normalizeText(entry.classId),
      classTitle: normalizeText(entry.classTitle)
    }))
    .sort((left, right) => {
      if (left.classId !== right.classId) return left.classId.localeCompare(right.classId);
      if (left.day !== right.day) return left.day.localeCompare(right.day);
      if (left.period !== right.period) return left.period - right.period;
      if (left.subject !== right.subject) return left.subject.localeCompare(right.subject);
      return left.teacherId.localeCompare(right.teacherId);
    });

  return JSON.stringify({
    selectedDay: normalized.selectedDay,
    slotRows: comparableSlotRows,
    items: comparableItems
  });
};

const areDailyBoardSnapshotsEqual = (left = null, right = null) => (
  serializeDailyBoardSnapshot(left) === serializeDailyBoardSnapshot(right)
);

const formatDailyBoardDraft = (doc) => {
  if (!doc) return null;
  const item = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const draft = formatDailyBoardSnapshot({
    selectedDay: item.selectedDay,
    activeClassId: item.activeClassId,
    activeClassTitle: item.activeClassTitle,
    slotRows: item.slotRows,
    items: item.items,
    updatedAt: item.updatedAt
  });
  const published = getPublishedDailyBoardSnapshot(item);
  const hasPublishedVersion = hasDailyBoardItems(published);

  return {
    id: String(item._id || ''),
    schoolId: String(item.schoolId || ''),
    ...draft,
    status: hasPublishedVersion && normalizeDailyBoardStatus(item.status) === 'published' ? 'published' : 'draft',
    hasPublishedVersion,
    publishedAt: normalizeIsoDate(item.publishedAt),
    published: hasPublishedVersion ? published : null
  };
};

const formatPublishedDailyBoard = (doc) => {
  if (!doc) return null;
  const item = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const published = getPublishedDailyBoardSnapshot(item);
  if (!hasDailyBoardItems(published)) return null;

  return {
    schoolId: String(item.schoolId || ''),
    ...published,
    publishedAt: normalizeIsoDate(item.publishedAt),
    status: 'published'
  };
};

const normalizeDailyBoardItem = (item = {}) => {
  const classId = normalizeDailyBoardId(item.classId || item.schoolClass?._id || item.schoolClass?.id);
  const classTitle = normalizeText(item.classTitle || item.schoolClass?.title || item.classroom || item.room);
  const teacherAssignmentId = normalizeDailyBoardId(item.teacherAssignmentId || item.assignmentId);
  const teacherId = normalizeDailyBoardId(item.teacherId || item.instructorId);
  const teacherName = normalizeText(item.teacherName || item.instructorName);
  const day = normalizeText(item.day).toLowerCase();
  const period = Number(item.period);
  const subject = normalizeText(item.subject || item.subjectId?.name);
  const classroom = normalizeText(item.classroom || item.room || classTitle);

  if (
    (!classId && !classTitle)
    || (!teacherId && !teacherName)
    || !subject
    || !DAILY_BOARD_DAY_VALUES.has(day)
    || !Number.isInteger(period)
    || period < 1
    || period > 6
  ) {
    return null;
  }

  return {
    teacherAssignmentId,
    classId,
    classTitle,
    teacherId,
    teacherName: teacherName || 'استاد',
    day,
    period,
    subjectId: normalizeDailyBoardId(item.subjectId),
    subject,
    category: normalizeText(item.category),
    classroom
  };
};

async function resolveDailyBoardSchoolId(payload = {}, query = {}) {
  const directSchoolId = normalizeDailyBoardId(payload.schoolId || query.schoolId);
  if (directSchoolId) return directSchoolId;

  const classIdCandidates = [
    payload.classId,
    payload.activeClassId,
    query.activeClassId,
    ...(Array.isArray(payload.items) ? payload.items.map((item) => item?.classId) : [])
  ].map(normalizeDailyBoardId).filter(Boolean);

  if (!classIdCandidates.length) return null;
  const schoolClass = await SchoolClass.findById(classIdCandidates[0]).select('schoolId');
  return schoolClass?.schoolId ? String(schoolClass.schoolId) : null;
}

async function resolveDailyBoardClassMap(classIds = []) {
  const uniqueClassIds = Array.from(new Set((Array.isArray(classIds) ? classIds : []).map(normalizeDailyBoardId).filter(Boolean)));
  if (!uniqueClassIds.length) return new Map();

  const classes = await SchoolClass.find({ _id: { $in: uniqueClassIds } })
    .select('title room classroomNumber floor shiftId academicYearId schoolId');

  return new Map(classes.map((item) => [String(item._id), item]));
}

async function resolveDailyBoardActiveClassState({
  activeClassId = '',
  activeClassTitle = '',
  items = []
} = {}) {
  const normalizedActiveClassId = normalizeDailyBoardId(activeClassId);
  const classIds = [
    normalizedActiveClassId,
    ...((Array.isArray(items) ? items : []).map((item) => item?.classId))
  ];
  const classMap = await resolveDailyBoardClassMap(classIds);
  const firstItem = Array.isArray(items) && items.length ? items[0] : null;
  const resolvedId = normalizedActiveClassId
    || normalizeDailyBoardId(firstItem?.classId)
    || '';
  const resolvedClass = classMap.get(resolvedId) || null;

  return {
    activeClassId: resolvedId,
    activeClassTitle: normalizeText(activeClassTitle) || normalizeText(resolvedClass?.title) || normalizeText(firstItem?.classTitle),
    classMap
  };
}

async function ensureDailyBoardTimetableConfiguration({
  schoolId,
  academicYearId,
  shiftId,
  userId
} = {}) {
  const officialPeriodsPerDay = Math.max(
    4,
    ...Object.values(DAILY_BOARD_PERIOD_TO_OFFICIAL_INDEX).map((value) => Number(value) || 0)
  );
  let config = await TimetableConfiguration.findOne({
    schoolId,
    academicYearId,
    shiftId
  });

  if (!config) {
    try {
      config = await TimetableConfiguration.create({
        schoolId,
        academicYearId,
        shiftId,
        workingDays: DAILY_BOARD_DAY_LIST,
        periodsPerDay: officialPeriodsPerDay,
        breakPeriods: [],
        status: 'active',
        isActive: true,
        createdBy: userId || null,
        updatedBy: userId || null
      });
    } catch (error) {
      if (error?.code === 11000) {
        config = await TimetableConfiguration.findOne({
          schoolId,
          academicYearId,
          shiftId
        });
      } else {
        throw error;
      }
    }
  }

  if (config) {
    const normalizedWorkingDays = Array.isArray(config.workingDays)
      ? config.workingDays.map((value) => normalizeText(value)).filter(Boolean)
      : [];
    const hasExpectedWorkingDays = DAILY_BOARD_DAY_LIST.every((dayCode) => normalizedWorkingDays.includes(dayCode));
    const needsConfigRefresh = !config.isActive
      || String(config.status || '').trim().toLowerCase() !== 'active'
      || Number(config.periodsPerDay || 0) !== officialPeriodsPerDay
      || !hasExpectedWorkingDays;

    if (needsConfigRefresh) {
      config.isActive = true;
      config.status = 'active';
      config.periodsPerDay = officialPeriodsPerDay;
      config.workingDays = DAILY_BOARD_DAY_LIST;
      config.updatedBy = userId || null;
      await config.save();
    }
  }

  return config;
}

async function ensureDailyBoardPeriodDefinitions({
  config,
  slotRows = []
} = {}) {
  const normalizedSlotRows = normalizeDailyBoardSlotRows(slotRows);
  const defaultBreak = {
    startTime: normalizedSlotRows[2]?.endTime || '10:00',
    endTime: normalizedSlotRows[3]?.startTime || '10:10'
  };
  const existingRows = await PeriodDefinition.find({
    timetableConfigurationId: config._id,
    dayCode: { $in: DAILY_BOARD_DAY_LIST },
    periodIndex: { $in: [1, 2, 3, 4, 5, 6, 7] }
  });
  const existingMap = new Map(
    existingRows.map((item) => [`${item.dayCode}__${Number(item.periodIndex || 0)}`, item])
  );
  const definitionMap = new Map();

  const definitionBlueprints = [
    ...normalizedSlotRows.map((slot) => ({
      periodIndex: mapDailyBoardPeriodToOfficialIndex(slot.slotNumber),
      startTime: slot.startTime,
      endTime: slot.endTime,
      type: 'class',
      title: normalizeText(slot.label) || `زنگ ${slot.slotNumber}`,
      isBreak: false,
      order: mapDailyBoardPeriodToOfficialIndex(slot.slotNumber)
    })),
    {
      periodIndex: 4,
      startTime: defaultBreak.startTime,
      endTime: defaultBreak.endTime,
      type: 'break',
      title: 'تفریح',
      isBreak: true,
      order: 4
    }
  ];

  for (const dayCode of DAILY_BOARD_DAY_LIST) {
    for (const blueprint of definitionBlueprints) {
      const key = `${dayCode}__${blueprint.periodIndex}`;
      const current = existingMap.get(key);

      if (current) {
        const hasChanges = (
          normalizeText(current.startTime) !== blueprint.startTime
          || normalizeText(current.endTime) !== blueprint.endTime
          || normalizeText(current.title) !== blueprint.title
          || normalizeText(current.type) !== blueprint.type
          || current.isBreak !== blueprint.isBreak
          || Number(current.order || 0) !== blueprint.order
        );

        if (hasChanges) {
          current.startTime = blueprint.startTime;
          current.endTime = blueprint.endTime;
          current.title = blueprint.title;
          current.type = blueprint.type;
          current.isBreak = blueprint.isBreak;
          current.order = blueprint.order;
          await current.save();
        }

        definitionMap.set(key, current);
        continue;
      }

      const created = await PeriodDefinition.create({
        timetableConfigurationId: config._id,
        dayCode,
        periodIndex: blueprint.periodIndex,
        startTime: blueprint.startTime,
        endTime: blueprint.endTime,
        type: blueprint.type,
        title: blueprint.title,
        isBreak: blueprint.isBreak,
        order: blueprint.order
      });
      definitionMap.set(key, created);
    }
  }

  return definitionMap;
}

async function buildDailyBoardPeriodDefinitionLookup({
  groups = [],
  slotRows = [],
  userId
} = {}) {
  const normalizedGroups = Array.from(new Set(
    (Array.isArray(groups) ? groups : [])
      .map((group) => `${normalizeText(group?.schoolId)}__${normalizeText(group?.academicYearId)}__${normalizeText(group?.shiftId)}`)
      .filter((value) => value && !value.startsWith('__'))
  ));

  const lookup = new Map();

  for (const groupKey of normalizedGroups) {
    const [schoolId = '', academicYearId = '', shiftId = ''] = groupKey.split('__');
    if (!schoolId || !academicYearId || !shiftId) continue;

    const config = await ensureDailyBoardTimetableConfiguration({
      schoolId,
      academicYearId,
      shiftId,
      userId
    });
    const definitions = await ensureDailyBoardPeriodDefinitions({
      config,
      slotRows
    });

    definitions.forEach((value, key) => {
      lookup.set(`${academicYearId}__${shiftId}__${key}`, value);
    });
  }

  return lookup;
}

router.get('/daily-draft', ...readAccess, async (req, res) => {
  try {
    const schoolId = await resolveDailyBoardSchoolId({}, req.query || {});
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId is required.' });
    }

    const item = await DailyTimetableBoardDraft.findOne({ schoolId });
    res.json({ success: true, item: formatDailyBoardDraft(item) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load daily timetable draft.' });
  }
});

router.get('/daily-published', ...publicReadAccess, async (req, res) => {
  try {
    const schoolId = await resolveDailyBoardSchoolId({}, req.query || {});
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId is required.' });
    }

    const item = await DailyTimetableBoardDraft.findOne({ schoolId });
    res.json({ success: true, item: formatPublishedDailyBoard(item) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load published daily timetable.' });
  }
});

router.put('/daily-draft', ...writeAccess, async (req, res) => {
  try {
    const schoolId = await resolveDailyBoardSchoolId(req.body || {}, req.query || {});
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId is required.' });
    }

    const selectedDay = DAILY_BOARD_DAY_VALUES.has(normalizeText(req.body?.selectedDay).toLowerCase())
      ? normalizeText(req.body.selectedDay).toLowerCase()
      : 'saturday';
    const slotRows = normalizeDailyBoardSlotRows(req.body?.slotRows);
    const items = Array.isArray(req.body?.items)
      ? req.body.items.map(normalizeDailyBoardItem).filter(Boolean)
      : [];
    const activeClassState = await resolveDailyBoardActiveClassState({
      activeClassId: req.body?.activeClassId,
      activeClassTitle: req.body?.activeClassTitle,
      items
    });
    const existing = await DailyTimetableBoardDraft.findOne({ schoolId });
    const publishedSnapshot = getPublishedDailyBoardSnapshot(existing);
    const nextDraftSnapshot = {
      selectedDay,
      activeClassId: activeClassState.activeClassId,
      activeClassTitle: activeClassState.activeClassTitle,
      slotRows,
      items
    };
    const nextStatus = hasDailyBoardItems(publishedSnapshot) && areDailyBoardSnapshotsEqual(nextDraftSnapshot, publishedSnapshot)
      ? 'published'
      : 'draft';

    const item = await DailyTimetableBoardDraft.findOneAndUpdate(
      { schoolId },
      {
        $set: {
          selectedDay,
          activeClassId: activeClassState.activeClassId || null,
          activeClassTitle: activeClassState.activeClassTitle,
          slotRows,
          items,
          status: nextStatus,
          updatedBy: req.user?.id || null
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    await logActivity({
      req,
      action: 'save_daily_timetable_draft',
      targetType: 'DailyTimetableBoardDraft',
      targetId: String(item?._id || ''),
      meta: {
        schoolId,
        selectedDay,
        slotRowCount: slotRows.length,
        itemCount: items.length
      }
    });

    res.json({ success: true, item: formatDailyBoardDraft(item) });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to save daily timetable draft.' });
  }
});

router.post('/daily-draft/publish', ...writeAccess, async (req, res) => {
  try {
    const schoolId = await resolveDailyBoardSchoolId(req.body || {}, req.query || {});
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId is required.' });
    }

    const item = await DailyTimetableBoardDraft.findOne({ schoolId });
    if (!item || !Array.isArray(item.items) || !item.items.length) {
      return res.status(400).json({ success: false, message: 'No daily timetable draft is ready to publish.' });
    }

    const normalizedSlotRows = normalizeDailyBoardSlotRows(item.slotRows);
    const slotRowMap = new Map(normalizedSlotRows.map((row) => [row.slotNumber, row]));
    const draftItems = item.items
      .map((entry) => (
        typeof entry?.toObject === 'function'
          ? entry.toObject()
          : { ...entry }
      ))
      .map(normalizeDailyBoardItem)
      .filter(Boolean);

    if (!draftItems.length) {
      return res.status(400).json({ success: false, message: 'No daily timetable draft is ready to publish.' });
    }

    const activeClassState = await resolveDailyBoardActiveClassState({
      activeClassId: item.activeClassId,
      activeClassTitle: item.activeClassTitle,
      items: draftItems
    });
    const classMap = activeClassState.classMap.size
      ? activeClassState.classMap
      : await resolveDailyBoardClassMap(draftItems.map((entry) => entry.classId));
    const classIds = Array.from(new Set(draftItems.map((entry) => normalizeDailyBoardId(entry.classId)).filter(Boolean)));
    const teacherIds = Array.from(new Set(draftItems.map((entry) => normalizeDailyBoardId(entry.teacherId)).filter(Boolean)));
    const managedEntries = await TimetableEntry.find({
      schoolId,
      source: 'manual_override',
      specialNotes: DAILY_BOARD_PUBLISH_NOTE
    });
    const managedEntryIds = managedEntries.map((entry) => entry._id);

    const assignmentRows = await TeacherAssignment.find({
      schoolId,
      classId: { $in: classIds },
      status: { $in: ACTIVE_ASSIGNMENT_STATUSES }
    }).select('_id classId subjectId teacherUserId academicYearId');
    const assignmentById = new Map(
      assignmentRows.map((entry) => [String(entry._id), entry])
    );
    const assignmentByKey = new Map(
      assignmentRows.map((entry) => ([
        [
          String(entry.classId || ''),
          String(entry.subjectId || ''),
          String(entry.teacherUserId || '')
        ].join('__'),
        entry
      ]))
    );

    const groupList = [];
    const seenGroupKeys = new Set();
    classMap.forEach((classItem) => {
      const groupKey = [
        String(classItem.schoolId || ''),
        String(classItem.academicYearId || ''),
        String(classItem.shiftId || '')
      ].join('__');
      if (!seenGroupKeys.has(groupKey) && !groupKey.startsWith('__')) {
        seenGroupKeys.add(groupKey);
        groupList.push({
          schoolId: String(classItem.schoolId || ''),
          academicYearId: String(classItem.academicYearId || ''),
          shiftId: String(classItem.shiftId || '')
        });
      }
    });

    const periodDefinitionLookup = await buildDailyBoardPeriodDefinitionLookup({
      groups: groupList,
      slotRows: normalizedSlotRows,
      userId: req.user?.id || null
    });

    const uniqueAcademicYearIds = Array.from(new Set(
      groupList.map((item) => normalizeText(item.academicYearId)).filter(Boolean)
    ));
    const uniqueShiftIds = Array.from(new Set(
      groupList.map((item) => normalizeText(item.shiftId)).filter(Boolean)
    ));
    const availabilityRows = teacherIds.length && uniqueAcademicYearIds.length && uniqueShiftIds.length
      ? await TeacherAvailability.find({
        schoolId,
        teacherId: { $in: teacherIds },
        academicYearId: { $in: uniqueAcademicYearIds },
        shiftId: { $in: uniqueShiftIds },
        status: 'active'
      }).select('teacherId academicYearId shiftId availableDays availablePeriods unavailablePeriods')
      : [];
    const availabilityByKey = new Map(
      availabilityRows.map((entry) => ([
        [
          String(entry.teacherId || ''),
          String(entry.academicYearId || ''),
          String(entry.shiftId || '')
        ].join('__'),
        entry
      ]))
    );

    const classSlotRegistry = new Map();
    const teacherSlotRegistry = new Map();
    const preparedEntries = [];

    for (const draftEntry of draftItems) {
      const classId = String(draftEntry.classId || '');
      const classMeta = classMap.get(classId) || null;
      if (!classMeta) {
        return res.status(400).json({
          success: false,
          message: `صنف مربوط به این خانه پیدا نشد و نشر متوقف شد.`
        });
      }

      if (String(classMeta.schoolId || '') !== String(schoolId)) {
        return res.status(400).json({
          success: false,
          message: `یکی از صنف‌های انتخاب‌شده مربوط به این مکتب نیست.`
        });
      }

      const academicYearId = String(classMeta.academicYearId || '').trim();
      const shiftId = String(classMeta.shiftId || '').trim();
      const teacherId = String(draftEntry.teacherId || '').trim();
      const subjectId = String(draftEntry.subjectId || '').trim();
      const dayCode = normalizeText(draftEntry.day).toLowerCase();
      const dailyPeriodIndex = Number(draftEntry.period || 0);
      const periodIndex = mapDailyBoardPeriodToOfficialIndex(dailyPeriodIndex);

      if (!academicYearId || !shiftId || !teacherId || !subjectId || !DAILY_BOARD_DAY_VALUES.has(dayCode) || !Number.isInteger(dailyPeriodIndex) || !periodIndex) {
        return res.status(400).json({
          success: false,
          message: `اطلاعات یکی از زنگ‌ها ناقص است و قابل نشر نیست.`
        });
      }

      const assignment = (
        normalizeDailyBoardId(draftEntry.teacherAssignmentId)
          ? assignmentById.get(String(draftEntry.teacherAssignmentId))
          : null
      ) || assignmentByKey.get([classId, subjectId, teacherId].join('__'));

      if (!assignment) {
        return res.status(400).json({
          success: false,
          message: `برای ${normalizeText(classMeta.title) || 'این صنف'}، تخصیص معتبر استاد و مضمون پیدا نشد.`
        });
      }

      const classSlotKey = buildDailyBoardManagedSlotKey({
        academicYearId,
        shiftId,
        classId,
        dayCode,
        periodIndex
      });
      const teacherSlotKey = buildDailyBoardTeacherSlotKey({
        academicYearId,
        shiftId,
        teacherId,
        dayCode,
        periodIndex
      });

      if (classSlotRegistry.has(classSlotKey)) {
        return res.status(400).json({
          success: false,
          message: `در همین نشر، یک صنف در یک روز و زنگ دوبار ثبت شده است.`
        });
      }
      if (teacherSlotRegistry.has(teacherSlotKey)) {
        return res.status(400).json({
          success: false,
          message: `در همین نشر، یک استاد در یک روز و زنگ دوبار ثبت شده است.`
        });
      }

      classSlotRegistry.set(classSlotKey, draftEntry);
      teacherSlotRegistry.set(teacherSlotKey, draftEntry);

      const teacherAvailability = availabilityByKey.get([teacherId, academicYearId, shiftId].join('__'));
      if (teacherAvailability) {
        if (Array.isArray(teacherAvailability.availableDays) && teacherAvailability.availableDays.length > 0 && !teacherAvailability.availableDays.includes(dayCode)) {
          return res.status(400).json({
            success: false,
            message: `استاد ${normalizeText(draftEntry.teacherName) || 'انتخاب‌شده'} در ${dayCode} موجود نیست.`
          });
        }

        if (!isPeriodExplicitlyAvailable(teacherAvailability, dayCode, periodIndex)) {
          return res.status(400).json({
            success: false,
            message: `استاد ${normalizeText(draftEntry.teacherName) || 'انتخاب‌شده'} در این زنگ موجود نیست.`
          });
        }

        const unavailablePeriod = Array.isArray(teacherAvailability.unavailablePeriods)
          ? teacherAvailability.unavailablePeriods.find(
            (period) => period?.dayCode === dayCode && Array.isArray(period?.periodIndexes) && period.periodIndexes.includes(periodIndex)
          )
          : null;

        if (unavailablePeriod) {
          return res.status(400).json({
            success: false,
            message: `استاد ${normalizeText(draftEntry.teacherName) || 'انتخاب‌شده'} در این زنگ غیرموجود علامت‌گذاری شده است.`
          });
        }
      }

      const periodDefinition = periodDefinitionLookup.get(`${academicYearId}__${shiftId}__${dayCode}__${periodIndex}`);
      const slotMeta = slotRowMap.get(dailyPeriodIndex);
      if (!periodDefinition || !slotMeta) {
        return res.status(400).json({
          success: false,
          message: 'تعریف رسمی زنگ‌ها برای نشر ساخته نشد.'
        });
      }

      const conflictFilterBase = {
        schoolId,
        academicYearId,
        shiftId,
        dayCode,
        periodIndex,
        status: { $ne: 'cancelled' },
        ...(managedEntryIds.length ? { _id: { $nin: managedEntryIds } } : {})
      };

      const [classConflict, teacherConflict] = await Promise.all([
        TimetableEntry.findOne({
          ...conflictFilterBase,
          classId
        }).select('_id classId teacherId'),
        TimetableEntry.findOne({
          ...conflictFilterBase,
          teacherId
        }).select('_id classId teacherId')
      ]);

      if (classConflict) {
        return res.status(400).json({
          success: false,
          message: `برای ${normalizeText(classMeta.title) || 'این صنف'} در این روز و زنگ قبلاً برنامه رسمی ثبت شده است.`
        });
      }

      if (teacherConflict) {
        return res.status(400).json({
          success: false,
          message: `استاد ${normalizeText(draftEntry.teacherName) || 'انتخاب‌شده'} در این روز و زنگ قبلاً برنامه رسمی دارد.`
        });
      }

      preparedEntries.push({
        slotKey: classSlotKey,
        schoolId,
        academicYearId,
        shiftId,
        classId,
        subjectId,
        teacherId,
        teacherAssignmentId: String(assignment._id || ''),
        dayCode,
        periodIndex,
        periodDefinitionId: periodDefinition._id,
        startTime: slotMeta.startTime,
        endTime: slotMeta.endTime,
        classroomNumber: normalizeText(draftEntry.classroom || classMeta.room || classMeta.classroomNumber || classMeta.title),
        floor: normalizeText(classMeta.floor),
        teacherName: normalizeText(draftEntry.teacherName),
        classTitle: normalizeText(classMeta.title),
        subject: normalizeText(draftEntry.subject),
        dailyPeriodIndex
      });
    }

    const managedEntryBySlotKey = new Map(
      managedEntries.map((entry) => ([
        buildDailyBoardManagedSlotKey({
          academicYearId: entry.academicYearId,
          shiftId: entry.shiftId,
          classId: entry.classId,
          dayCode: entry.dayCode,
          periodIndex: entry.periodIndex
        }),
        entry
      ]))
    );
    const publishTimestamp = new Date();
    let createdCount = 0;
    let updatedCount = 0;

    for (const preparedEntry of preparedEntries) {
      const existingManagedEntry = managedEntryBySlotKey.get(preparedEntry.slotKey) || null;

      if (existingManagedEntry) {
        existingManagedEntry.subjectId = preparedEntry.subjectId;
        existingManagedEntry.teacherId = preparedEntry.teacherId;
        existingManagedEntry.periodDefinitionId = preparedEntry.periodDefinitionId;
        existingManagedEntry.startTime = preparedEntry.startTime;
        existingManagedEntry.endTime = preparedEntry.endTime;
        existingManagedEntry.classroomNumber = preparedEntry.classroomNumber;
        existingManagedEntry.floor = preparedEntry.floor || '';
        existingManagedEntry.source = 'manual_override';
        existingManagedEntry.status = 'published';
        existingManagedEntry.specialNotes = DAILY_BOARD_PUBLISH_NOTE;
        existingManagedEntry.publishedAt = publishTimestamp;
        existingManagedEntry.publishedBy = req.user?.id || null;
        existingManagedEntry.lastModifiedBy = req.user?.id || null;
        existingManagedEntry.lastModifiedAt = publishTimestamp;
        await existingManagedEntry.save();
        updatedCount += 1;
        continue;
      }

      const createdEntry = new TimetableEntry({
        schoolId: preparedEntry.schoolId,
        academicYearId: preparedEntry.academicYearId,
        shiftId: preparedEntry.shiftId,
        classId: preparedEntry.classId,
        subjectId: preparedEntry.subjectId,
        teacherId: preparedEntry.teacherId,
        periodDefinitionId: preparedEntry.periodDefinitionId,
        dayCode: preparedEntry.dayCode,
        periodIndex: preparedEntry.periodIndex,
        startTime: preparedEntry.startTime,
        endTime: preparedEntry.endTime,
        classroomNumber: preparedEntry.classroomNumber,
        floor: preparedEntry.floor || '',
        source: 'manual_override',
        status: 'published',
        specialNotes: DAILY_BOARD_PUBLISH_NOTE,
        createdBy: req.user?.id || null,
        lastModifiedBy: req.user?.id || null,
        lastModifiedAt: publishTimestamp,
        publishedAt: publishTimestamp,
        publishedBy: req.user?.id || null
      });
      await createdEntry.save();
      createdCount += 1;
    }

    const nextManagedSlotKeys = new Set(preparedEntries.map((entry) => entry.slotKey));
    const staleManagedEntryIds = managedEntries
      .filter((entry) => !nextManagedSlotKeys.has(
        buildDailyBoardManagedSlotKey({
          academicYearId: entry.academicYearId,
          shiftId: entry.shiftId,
          classId: entry.classId,
          dayCode: entry.dayCode,
          periodIndex: entry.periodIndex
        })
      ))
      .map((entry) => entry._id);

    if (staleManagedEntryIds.length) {
      await TimetableEntry.deleteMany({ _id: { $in: staleManagedEntryIds } });
    }

    item.publishedSelectedDay = item.selectedDay || 'saturday';
    item.publishedActiveClassId = activeClassState.activeClassId || null;
    item.publishedActiveClassTitle = activeClassState.activeClassTitle;
    item.publishedSlotRows = normalizedSlotRows;
    item.publishedItems = draftItems;
    item.publishedAt = publishTimestamp;
    item.publishedBy = req.user?.id || null;
    item.status = 'published';
    await item.save();

    await logActivity({
      req,
      action: 'publish_daily_timetable_draft',
      targetType: 'DailyTimetableBoardDraft',
      targetId: String(item?._id || ''),
      meta: {
        schoolId,
        selectedDay: item.selectedDay,
        slotRowCount: Array.isArray(item.slotRows) ? item.slotRows.length : 0,
        itemCount: Array.isArray(item.items) ? item.items.length : 0,
        createdCount,
        updatedCount,
        removedCount: staleManagedEntryIds.length
      }
    });

    res.json({ success: true, item: formatDailyBoardDraft(item) });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to publish daily timetable draft.' });
  }
});

router.delete('/daily-draft', ...writeAccess, async (req, res) => {
  try {
    const schoolId = await resolveDailyBoardSchoolId(req.body || {}, req.query || {});
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'schoolId is required.' });
    }

    const existing = await DailyTimetableBoardDraft.findOne({ schoolId });
    if (!existing) {
      return res.json({ success: true, item: null });
    }

    const publishedSnapshot = getPublishedDailyBoardSnapshot(existing);
    if (!hasDailyBoardItems(publishedSnapshot)) {
      const removed = await DailyTimetableBoardDraft.findOneAndDelete({ schoolId });
      await logActivity({
        req,
        action: 'delete_daily_timetable_draft',
        targetType: 'DailyTimetableBoardDraft',
        targetId: String(removed?._id || ''),
        meta: { schoolId }
      });

      return res.json({ success: true, item: null });
    }

    existing.selectedDay = 'saturday';
    existing.activeClassId = null;
    existing.activeClassTitle = '';
    existing.slotRows = normalizeDailyBoardSlotRows();
    existing.items = [];
    existing.updatedBy = req.user?.id || null;
    existing.status = 'draft';
    await existing.save();

    await logActivity({
      req,
      action: 'clear_daily_timetable_draft',
      targetType: 'DailyTimetableBoardDraft',
      targetId: String(existing?._id || ''),
      meta: {
        schoolId,
        preservedPublished: true
      }
    });

    res.json({ success: true, item: formatDailyBoardDraft(existing) });
  } catch (error) {
    res.status(500).json({ success: false, message: error?.message || 'Failed to delete daily timetable draft.' });
  }
});

router.get('/reference-data', ...readAccess, async (req, res) => {
  try {
    const data = await listTimetableReferenceData();
    res.json({ success: true, ...data });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load timetable reference data.' });
  }
});

router.get('/configs', ...readAccess, async (req, res) => {
  try {
    const items = await listTimetableConfigs(req.query || {});
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load timetable configs.' });
  }
});

router.post('/configs', ...writeAccess, async (req, res) => {
  try {
    const item = await createTimetableConfig(req.body || {});
    await logActivity({
      req,
      action: 'create_timetable_config',
      targetType: 'TimetableConfig',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        name: String(item?.name || req.body?.name || '').trim()
      }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to create timetable config.' });
  }
});

router.get('/entries', ...readAccess, async (req, res) => {
  try {
    const items = await listTimetableEntries(req.query || {});
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load timetable entries.' });
  }
});

router.post('/entries', ...writeAccess, async (req, res) => {
  try {
    const item = await createTimetableEntry(req.body || {});
    await logActivity({
      req,
      action: 'create_timetable_entry',
      targetType: 'TimetableEntry',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        dayOfWeek: String(item?.dayOfWeek || req.body?.dayOfWeek || '').trim(),
        classId: String(item?.classId || req.body?.classId || ''),
        teacherAssignmentId: String(item?.teacherAssignmentId || req.body?.teacherAssignmentId || '')
      }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to create timetable entry.' });
  }
});

router.get('/entries/conflict-preview', ...readAccess, async (req, res) => {
  try {
    const result = await previewTimetableEntryConflict(req.query || {});
    res.json({ success: true, result });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to preview timetable conflicts.' });
  }
});

router.put('/entries/:entryId', ...writeAccess, async (req, res) => {
  try {
    const item = await updateTimetableEntry(req.params.entryId, req.body || {});
    await logActivity({
      req,
      action: 'update_timetable_entry',
      targetType: 'TimetableEntry',
      targetId: String(item?.id || item?._id || req.params.entryId || ''),
      meta: {
        status: String(item?.status || req.body?.status || '').trim(),
        dayOfWeek: String(item?.dayOfWeek || req.body?.dayOfWeek || '').trim()
      }
    });
    res.json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to update timetable entry.' });
  }
});

router.get('/annual-plans', ...readAccess, async (req, res) => {
  try {
    const items = await listAnnualPlans(req.query || {});
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load annual plans.' });
  }
});

router.post('/annual-plans', ...writeAccess, async (req, res) => {
  try {
    const item = await createAnnualPlan(req.body || {});
    await logActivity({
      req,
      action: 'create_annual_plan',
      targetType: 'EducationPlanAnnual',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        title: String(item?.title || req.body?.title || '').trim(),
        classId: String(item?.classId || req.body?.classId || '')
      }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('education_plan_') || code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to create annual plan.' });
  }
});

router.get('/weekly-plans', ...readAccess, async (req, res) => {
  try {
    const items = await listWeeklyPlans(req.query || {});
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load weekly plans.' });
  }
});

router.post('/weekly-plans', ...writeAccess, async (req, res) => {
  try {
    const item = await createWeeklyPlan(req.body || {});
    await logActivity({
      req,
      action: 'create_weekly_plan',
      targetType: 'EducationPlanWeekly',
      targetId: String(item?.id || item?._id || ''),
      meta: {
        lessonTitle: String(item?.lessonTitle || req.body?.lessonTitle || '').trim(),
        annualPlanId: String(item?.annualPlanId || req.body?.annualPlanId || ''),
        classId: String(item?.classId || req.body?.classId || '')
      }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    const code = String(error?.message || '');
    res.status(code.startsWith('education_plan_') || code.startsWith('timetable_') ? 400 : 500).json({ success: false, message: code || 'Failed to create weekly plan.' });
  }
});

module.exports = router;
