require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/TeacherAssignment');
require('../models/InstructorSubject');
require('../models/TimetableConfig');
require('../models/Timetable');
require('../models/EducationPlanAnnual');
require('../models/EducationPlanWeekly');
require('../models/ScheduleHoliday');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const InstructorSubject = require('../models/InstructorSubject');
const TimetableConfig = require('../models/TimetableConfig');
const Timetable = require('../models/Timetable');
const EducationPlanAnnual = require('../models/EducationPlanAnnual');
const EducationPlanWeekly = require('../models/EducationPlanWeekly');
const ScheduleHoliday = require('../models/ScheduleHoliday');
const Schedule = require('../models/Schedule');
const {
  DEFAULT_DAYS,
  buildAnnualPlanCode,
  deriveDayOfWeek,
  ensureConfigForClass,
  hasOverlap,
  parseTimeToMinutes,
  syncTimetableFromLegacySchedule
} = require('../utils/timetableSync');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ virtuals: false });
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((entry) => normalizeText(entry)).filter(Boolean);
}

function normalizeNullableId(value) {
  if (value == null) return null;
  if (typeof value === 'object' && value._id) {
    const text = String(value._id || '').trim();
    return text || null;
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text : null;
  }
  const text = normalizeText(value);
  return text || null;
}

function addDays(dateKey, offset) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeText(dateKey));
  if (!match) return normalizeText(dateKey);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

function buildIsoWeekRange(dateKey) {
  const text = normalizeText(dateKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return { weekStartDate: text, weekEndDate: text };
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const jsDay = date.getUTCDay();
  const mondayOffset = jsDay === 0 ? -6 : (1 - jsDay);
  const start = addDays(text, mondayOffset);
  return { weekStartDate: start, weekEndDate: addDays(start, 6) };
}

function formatMinutesToTime(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function buildOccurrenceDateFilter(occurrenceDate) {
  return occurrenceDate
    ? { $or: [{ occurrenceDate }, { occurrenceDate: '' }, { occurrenceDate: null }] }
    : { $or: [{ occurrenceDate: '' }, { occurrenceDate: null }] };
}

function formatAcademicYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), title: normalizeText(item.title), code: normalizeText(item.code), isActive: Boolean(item.isActive) };
}

function formatAcademicTerm(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    termType: normalizeText(item.termType),
    sequence: Number(item.sequence || 0),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatClass(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    gradeLevel: normalizeText(item.gradeLevel),
    section: normalizeText(item.section),
    shift: normalizeText(item.shift),
    room: normalizeText(item.room),
    status: normalizeText(item.status),
    academicYear: formatAcademicYear(item.academicYearId)
  };
}

function formatSubject(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), name: normalizeText(item.name), code: normalizeText(item.code), grade: normalizeText(item.grade), isActive: Boolean(item.isActive) };
}

function formatTeacherAssignment(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    assignmentType: normalizeText(item.assignmentType),
    status: normalizeText(item.status),
    isPrimary: Boolean(item.isPrimary),
    source: normalizeText(item.source),
    teacher: item.teacherUserId ? { id: String(item.teacherUserId._id || item.teacherUserId), name: normalizeText(item.teacherUserId.name), email: normalizeText(item.teacherUserId.email) } : null,
    academicYear: formatAcademicYear(item.academicYearId),
    term: formatAcademicTerm(item.termId),
    schoolClass: formatClass(item.classId),
    subject: formatSubject(item.subjectId),
    note: normalizeText(item.note)
  };
}
function formatTimetableConfig(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    name: normalizeText(item.name),
    code: normalizeText(item.code),
    daysOfWeek: Array.isArray(item.daysOfWeek) ? item.daysOfWeek.map((entry) => normalizeText(entry)).filter(Boolean) : [],
    dayStartTime: normalizeText(item.dayStartTime),
    dayEndTime: normalizeText(item.dayEndTime),
    slotDurationMinutes: Number(item.slotDurationMinutes || 0),
    breakDurationMinutes: Number(item.breakDurationMinutes || 0),
    maxDailyPeriods: Number(item.maxDailyPeriods || 0),
    defaultShift: normalizeText(item.defaultShift),
    roomPolicy: normalizeText(item.roomPolicy),
    isDefault: Boolean(item.isDefault),
    isActive: Boolean(item.isActive),
    source: normalizeText(item.source),
    note: normalizeText(item.note),
    academicYear: formatAcademicYear(item.academicYearId),
    term: formatAcademicTerm(item.termId),
    schoolClass: formatClass(item.classId)
  };
}

function formatTimetable(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    dayOfWeek: normalizeText(item.dayOfWeek),
    occurrenceDate: normalizeText(item.occurrenceDate),
    startTime: normalizeText(item.startTime),
    endTime: normalizeText(item.endTime),
    slotIndex: Number(item.slotIndex || 0),
    room: normalizeText(item.room),
    shift: normalizeText(item.shift),
    status: normalizeText(item.status),
    source: normalizeText(item.source),
    note: normalizeText(item.note),
    config: formatTimetableConfig(item.configId),
    academicYear: formatAcademicYear(item.academicYearId),
    term: formatAcademicTerm(item.termId),
    schoolClass: formatClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacherAssignment: formatTeacherAssignment(item.teacherAssignmentId)
  };
}

function formatAnnualPlan(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    annualTargetPeriods: Number(item.annualTargetPeriods || 0),
    weeklyTargetPeriods: Number(item.weeklyTargetPeriods || 0),
    unitCount: Number(item.unitCount || 0),
    learningGoals: normalizeStringArray(item.learningGoals),
    resourceList: normalizeStringArray(item.resourceList),
    assessmentPolicy: normalizeText(item.assessmentPolicy),
    status: normalizeText(item.status),
    source: normalizeText(item.source),
    note: normalizeText(item.note),
    academicYear: formatAcademicYear(item.academicYearId),
    term: formatAcademicTerm(item.termId),
    schoolClass: formatClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacherAssignment: formatTeacherAssignment(item.teacherAssignmentId)
  };
}

function formatWeeklyPlan(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    weekStartDate: normalizeText(item.weekStartDate),
    weekEndDate: normalizeText(item.weekEndDate),
    lessonTitle: normalizeText(item.lessonTitle),
    lessonNumber: Number(item.lessonNumber || 0),
    objectives: normalizeStringArray(item.objectives),
    topics: normalizeStringArray(item.topics),
    activities: normalizeStringArray(item.activities),
    resourceList: normalizeStringArray(item.resourceList),
    homework: normalizeText(item.homework),
    status: normalizeText(item.status),
    source: normalizeText(item.source),
    note: normalizeText(item.note),
    annualPlan: formatAnnualPlan(item.annualPlanId),
    academicYear: formatAcademicYear(item.academicYearId),
    term: formatAcademicTerm(item.termId),
    schoolClass: formatClass(item.classId),
    subject: formatSubject(item.subjectId),
    teacherAssignment: formatTeacherAssignment(item.teacherAssignmentId)
  };
}

async function ensureTeacherAssignmentsFromLegacyMappings() {
  const mappings = await InstructorSubject.find({})
    .populate('instructor', 'name email')
    .populate('academicYear')
    .populate('classId')
    .populate('subject')
    .sort({ createdAt: -1 });

  if (!mappings.length) return;

  const legacyCourseIds = [...new Set(
    mappings
      .map((item) => String(item?.course || '').trim())
      .filter(Boolean)
  )];

  const legacyClasses = legacyCourseIds.length
    ? await SchoolClass.find({ legacyCourseId: { $in: legacyCourseIds } }).populate('academicYearId')
    : [];
  const classByLegacyCourse = new Map(
    legacyClasses.map((item) => [String(item.legacyCourseId || ''), item])
  );

  for (const mapping of mappings) {
    const resolvedClass = mapping.classId || classByLegacyCourse.get(String(mapping.course || '')) || null;
    const resolvedClassId = resolvedClass?._id || null;
    const resolvedTeacherId = mapping.instructor?._id || mapping.instructor || null;
    const resolvedSubjectId = mapping.subject?._id || mapping.subject || null;
    const resolvedAcademicYearId = mapping.academicYear?._id
      || resolvedClass?.academicYearId?._id
      || resolvedClass?.academicYearId
      || null;
    const resolvedSchoolId = resolvedClass?.schoolId || null;

    if (!resolvedClassId || !resolvedTeacherId || !resolvedSubjectId || !resolvedSchoolId) continue;

    const existing = await TeacherAssignment.findOne({
      $or: [
        { legacyInstructorSubjectId: mapping._id },
        {
          teacherUserId: resolvedTeacherId,
          academicYearId: resolvedAcademicYearId || null,
          classId: resolvedClassId,
          subjectId: resolvedSubjectId,
          assignmentType: 'subject',
          status: { $in: ['planned', 'active'] }
        }
      ]
    }).sort({ isPrimary: -1, createdAt: 1 });

    if (existing) {
      if (!existing.legacyInstructorSubjectId) {
        existing.legacyInstructorSubjectId = mapping._id;
        if (!existing.legacyCourseId && mapping.course) existing.legacyCourseId = mapping.course;
        if (!existing.note && mapping.note) existing.note = normalizeText(mapping.note);
        await existing.save();
      }
      continue;
    }

    await TeacherAssignment.create({
      schoolId: resolvedSchoolId,
      teacherUserId: resolvedTeacherId,
      academicYearId: resolvedAcademicYearId || null,
      classId: resolvedClassId,
      subjectId: resolvedSubjectId,
      termId: null,
      weeklyPeriods: 1,
      priority: 1,
      assignmentType: 'subject',
      status: 'active',
      source: 'legacy_instructor_subject',
      legacyInstructorSubjectId: mapping._id,
      legacyCourseId: mapping.course || resolvedClass?.legacyCourseId || null,
      isPrimary: Boolean(mapping.isPrimary),
      note: normalizeText(mapping.note) || 'auto_created_from_legacy_instructor_subject'
    });
  }
}

async function listTimetableReferenceData() {
  await ensureTeacherAssignmentsFromLegacyMappings();
  const [academicYears, terms, classes, subjects, assignments, configs, holidays, activeYear] = await Promise.all([
    AcademicYear.find({}).sort({ createdAt: -1 }),
    AcademicTerm.find({}).populate('academicYearId').sort({ academicYearId: 1, sequence: 1, title: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).populate('academicYearId').sort({ gradeLevel: 1, section: 1, title: 1 }),
    Subject.find({ isActive: true }).sort({ grade: 1, name: 1 }),
    TeacherAssignment.find({ status: { $in: ['planned', 'active'] } }).populate('teacherUserId', 'name email').populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').sort({ isPrimary: -1, priority: 1, createdAt: -1 }),
    TimetableConfig.find({ isActive: true }).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).sort({ isDefault: -1, createdAt: -1 }),
    ScheduleHoliday.find({}).sort({ date: 1 }),
    AcademicYear.findOne({ isActive: true }).sort({ createdAt: -1 })
  ]);

  return {
    activeYear: formatAcademicYear(activeYear),
    academicYears: academicYears.map(formatAcademicYear),
    academicTerms: terms.map(formatAcademicTerm),
    classes: classes.map(formatClass),
    subjects: subjects.map(formatSubject),
    teacherAssignments: assignments.map(formatTeacherAssignment),
    configs: configs.map(formatTimetableConfig),
    holidays: holidays.map((item) => ({ id: String(item._id), date: normalizeText(item.date), title: normalizeText(item.title), note: normalizeText(item.note), isClosed: Boolean(item.isClosed) }))
  };
}

async function resolveBaseRefs(payload = {}, currentDoc = null, options = {}) {
  const next = {
    academicYearId: normalizeNullableId(payload.academicYearId !== undefined ? payload.academicYearId : currentDoc?.academicYearId),
    termId: normalizeNullableId(payload.termId !== undefined ? payload.termId : currentDoc?.termId),
    classId: normalizeNullableId(payload.classId !== undefined ? payload.classId : currentDoc?.classId),
    subjectId: normalizeNullableId(payload.subjectId !== undefined ? payload.subjectId : currentDoc?.subjectId),
    teacherAssignmentId: normalizeNullableId(payload.teacherAssignmentId !== undefined ? payload.teacherAssignmentId : currentDoc?.teacherAssignmentId),
    configId: normalizeNullableId(payload.configId !== undefined ? payload.configId : currentDoc?.configId)
  };

  const teacherAssignment = next.teacherAssignmentId
    ? await TeacherAssignment.findById(next.teacherAssignmentId)
      .populate('teacherUserId', 'name email')
      .populate('academicYearId')
      .populate({ path: 'termId', populate: { path: 'academicYearId' } })
      .populate({ path: 'classId', populate: { path: 'academicYearId' } })
      .populate('subjectId')
    : null;

  if (next.teacherAssignmentId && !teacherAssignment) throw new Error('timetable_invalid_teacher_assignment');

  if (options.assignmentAuthority && teacherAssignment) {
    next.academicYearId = normalizeNullableId(teacherAssignment.academicYearId) || next.academicYearId;
    next.termId = normalizeNullableId(teacherAssignment.termId) || next.termId;
    next.classId = normalizeNullableId(teacherAssignment.classId) || next.classId;
    next.subjectId = normalizeNullableId(teacherAssignment.subjectId) || next.subjectId;
  }

  const [academicYear, term, schoolClass, subject, config] = await Promise.all([
    next.academicYearId ? AcademicYear.findById(next.academicYearId) : null,
    next.termId ? AcademicTerm.findById(next.termId).populate('academicYearId') : null,
    next.classId ? SchoolClass.findById(next.classId).populate('academicYearId') : null,
    next.subjectId ? Subject.findById(next.subjectId) : null,
    next.configId ? TimetableConfig.findById(next.configId).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }) : null
  ]);

  if (next.academicYearId && !academicYear) throw new Error('timetable_invalid_academic_year');
  if (next.termId && !term) throw new Error('timetable_invalid_term');
  if (next.classId && !schoolClass) throw new Error('timetable_invalid_class');
  if (next.subjectId && !subject) throw new Error('timetable_invalid_subject');
  if (next.configId && !config) throw new Error('timetable_invalid_config');

  const resolvedAcademicYear = academicYear || schoolClass?.academicYearId || teacherAssignment?.academicYearId || term?.academicYearId || config?.academicYearId || null;
  if (academicYear && schoolClass?.academicYearId && String(academicYear._id) !== String(schoolClass.academicYearId._id || schoolClass.academicYearId)) throw new Error('timetable_year_class_mismatch');
  if (academicYear && term?.academicYearId && String(academicYear._id) !== String(term.academicYearId._id || term.academicYearId)) throw new Error('timetable_year_term_mismatch');
  if (teacherAssignment && schoolClass && teacherAssignment.classId && String(teacherAssignment.classId._id || teacherAssignment.classId) !== String(schoolClass._id)) throw new Error('timetable_assignment_class_mismatch');
  if (teacherAssignment && subject && teacherAssignment.subjectId && String(teacherAssignment.subjectId._id || teacherAssignment.subjectId) !== String(subject._id)) throw new Error('timetable_assignment_subject_mismatch');
  if (teacherAssignment && resolvedAcademicYear && teacherAssignment.academicYearId && String(teacherAssignment.academicYearId._id || teacherAssignment.academicYearId) !== String(resolvedAcademicYear._id || resolvedAcademicYear)) throw new Error('timetable_assignment_year_mismatch');
  if (config && schoolClass && String(config.classId._id || config.classId) !== String(schoolClass._id)) throw new Error('timetable_config_class_mismatch');

  return { academicYear: resolvedAcademicYear, term, schoolClass, subject: subject || teacherAssignment?.subjectId || null, teacherAssignment, config };
}

async function createTimetableConfig(payload = {}) {
  const refs = await resolveBaseRefs(payload);
  if (!refs.schoolClass) throw new Error('timetable_class_required');

  const item = new TimetableConfig({
    name: normalizeText(payload.name) || `${normalizeText(refs.schoolClass.title || refs.schoolClass.code || 'Class')} Timetable`,
    code: normalizeText(payload.code),
    academicYearId: refs.academicYear?._id || refs.schoolClass.academicYearId?._id || refs.schoolClass.academicYearId || null,
    termId: refs.term?._id || null,
    classId: refs.schoolClass._id,
    daysOfWeek: Array.isArray(payload.daysOfWeek) && payload.daysOfWeek.length ? payload.daysOfWeek : DEFAULT_DAYS,
    dayStartTime: normalizeText(payload.dayStartTime),
    dayEndTime: normalizeText(payload.dayEndTime),
    slotDurationMinutes: Number(payload.slotDurationMinutes || 45),
    breakDurationMinutes: Number(payload.breakDurationMinutes || 10),
    maxDailyPeriods: Number(payload.maxDailyPeriods || 8),
    defaultShift: normalizeText(payload.defaultShift || refs.schoolClass.shift),
    roomPolicy: normalizeText(payload.roomPolicy) || 'classroom',
    isDefault: Boolean(payload.isDefault),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    source: normalizeText(payload.source) || 'manual',
    note: normalizeText(payload.note)
  });

  if (item.isDefault) await TimetableConfig.updateMany({ classId: item.classId, _id: { $ne: item._id } }, { $set: { isDefault: false } });
  await item.save();

  const populated = await TimetableConfig.findById(item._id).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } });
  return formatTimetableConfig(populated);
}
async function listTimetableConfigs(query = {}) {
  const filter = {};
  if (normalizeNullableId(query.academicYearId)) filter.academicYearId = query.academicYearId;
  if (normalizeNullableId(query.termId)) filter.termId = query.termId;
  if (normalizeNullableId(query.classId)) filter.classId = query.classId;
  if (query.isActive !== undefined && query.isActive !== '') filter.isActive = String(query.isActive) === 'true';
  const items = await TimetableConfig.find(filter).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).sort({ isDefault: -1, createdAt: -1 });
  return items.map(formatTimetableConfig);
}

async function assertNoTimetableConflicts({ entryId = null, classId, teacherAssignmentId, dayOfWeek, occurrenceDate, startTime, endTime }) {
  const nextStart = parseTimeToMinutes(startTime);
  const nextEnd = parseTimeToMinutes(endTime);
  if (nextStart == null || nextEnd == null || nextStart >= nextEnd) throw new Error('timetable_invalid_time_range');

  let teacherAssignmentIds = [];
  if (teacherAssignmentId) {
    const currentAssignment = await TeacherAssignment.findById(teacherAssignmentId).select('teacherUserId');
    if (currentAssignment?.teacherUserId) {
      const teacherAssignments = await TeacherAssignment.find({
        teacherUserId: currentAssignment.teacherUserId,
        status: { $in: ['planned', 'active', 'pending'] }
      }).select('_id');
      teacherAssignmentIds = teacherAssignments.map((item) => item._id);
    }
  }
  if (teacherAssignmentId && !teacherAssignmentIds.length) {
    teacherAssignmentIds = [teacherAssignmentId];
  }

  const baseFilter = { _id: entryId ? { $ne: entryId } : { $exists: true }, dayOfWeek, status: { $in: ['draft', 'active', 'published'] } };
  const dateFilter = buildOccurrenceDateFilter(occurrenceDate);
  const [classPeers, teacherPeers] = await Promise.all([
    Timetable.find({ ...baseFilter, classId, ...dateFilter }).select('startTime endTime'),
    teacherAssignmentIds.length
      ? Timetable.find({ ...baseFilter, teacherAssignmentId: { $in: teacherAssignmentIds }, ...dateFilter }).select('startTime endTime')
      : Promise.resolve([])
  ]);

  for (const peer of classPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart != null && peerEnd != null && hasOverlap(nextStart, nextEnd, peerStart, peerEnd)) throw new Error('timetable_class_conflict');
  }
  for (const peer of teacherPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart != null && peerEnd != null && hasOverlap(nextStart, nextEnd, peerStart, peerEnd)) throw new Error('timetable_teacher_conflict');
  }
}

async function previewTimetableEntryConflict(payload = {}) {
  const refs = await resolveBaseRefs(payload, null, { assignmentAuthority: true });
  if (!refs.schoolClass) throw new Error('timetable_class_required');
  if (!refs.teacherAssignment) throw new Error('timetable_teacher_assignment_required');

  let dayOfWeek = normalizeText(payload.dayOfWeek).toLowerCase();
  const occurrenceDate = normalizeText(payload.occurrenceDate);
  if (!dayOfWeek) dayOfWeek = deriveDayOfWeek(occurrenceDate);

  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null || startMinutes >= endMinutes) {
    throw new Error('timetable_invalid_time_range');
  }

  const entryId = normalizeNullableId(payload.entryId);
  const baseFilter = {
    _id: entryId ? { $ne: entryId } : { $exists: true },
    dayOfWeek,
    status: { $in: ['draft', 'active', 'published'] }
  };
  const dateFilter = buildOccurrenceDateFilter(occurrenceDate);

  let teacherAssignmentIds = [];
  if (refs.teacherAssignment?.teacherUserId) {
    const teacherAssignments = await TeacherAssignment.find({
      teacherUserId: refs.teacherAssignment.teacherUserId,
      status: { $in: ['planned', 'active', 'pending'] }
    }).select('_id');
    teacherAssignmentIds = teacherAssignments.map((item) => item._id);
  }
  if (!teacherAssignmentIds.length && refs.teacherAssignment?._id) {
    teacherAssignmentIds = [refs.teacherAssignment._id];
  }

  const [classPeers, teacherPeers] = await Promise.all([
    Timetable.find({ ...baseFilter, classId: refs.schoolClass._id, ...dateFilter })
      .populate({ path: 'teacherAssignmentId', populate: { path: 'teacherUserId', select: 'name' } })
      .populate('subjectId', 'name')
      .select('startTime endTime dayOfWeek occurrenceDate teacherAssignmentId subjectId')
      .sort({ startTime: 1 }),
    teacherAssignmentIds.length
      ? Timetable.find({ ...baseFilter, teacherAssignmentId: { $in: teacherAssignmentIds }, ...dateFilter })
        .populate('classId', 'title')
        .populate('subjectId', 'name')
        .select('startTime endTime dayOfWeek occurrenceDate classId subjectId')
        .sort({ startTime: 1 })
      : Promise.resolve([])
  ]);

  const classConflicts = [];
  for (const peer of classPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart == null || peerEnd == null) continue;
    if (!hasOverlap(startMinutes, endMinutes, peerStart, peerEnd)) continue;
    classConflicts.push({
      type: 'class',
      startTime: peer.startTime,
      endTime: peer.endTime,
      dayOfWeek: normalizeText(peer.dayOfWeek),
      occurrenceDate: normalizeText(peer.occurrenceDate),
      subjectName: normalizeText(peer.subjectId?.name),
      teacherName: normalizeText(peer.teacherAssignmentId?.teacherUserId?.name)
    });
  }

  const teacherConflicts = [];
  for (const peer of teacherPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart == null || peerEnd == null) continue;
    if (!hasOverlap(startMinutes, endMinutes, peerStart, peerEnd)) continue;
    teacherConflicts.push({
      type: 'teacher',
      startTime: peer.startTime,
      endTime: peer.endTime,
      dayOfWeek: normalizeText(peer.dayOfWeek),
      occurrenceDate: normalizeText(peer.occurrenceDate),
      classTitle: normalizeText(peer.classId?.title),
      subjectName: normalizeText(peer.subjectId?.name)
    });
  }

  const conflicts = [...classConflicts, ...teacherConflicts];

  const config = refs.config || await TimetableConfig.findOne({ classId: refs.schoolClass._id, isActive: true }).sort({ isDefault: -1, createdAt: -1 });
  const slotStep = Number(config?.slotDurationMinutes || 15);
  const duration = endMinutes - startMinutes;
  const windowStart = parseTimeToMinutes(config?.dayStartTime) ?? 7 * 60;
  const windowEnd = parseTimeToMinutes(config?.dayEndTime) ?? 14 * 60;

  const occupiedRanges = [];
  for (const peer of classPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart != null && peerEnd != null) occupiedRanges.push([peerStart, peerEnd]);
  }
  for (const peer of teacherPeers) {
    const peerStart = parseTimeToMinutes(peer.startTime);
    const peerEnd = parseTimeToMinutes(peer.endTime);
    if (peerStart != null && peerEnd != null) occupiedRanges.push([peerStart, peerEnd]);
  }

  const suggestions = [];
  const minCandidate = Math.max(windowStart, startMinutes - slotStep * 2);
  const maxCandidate = Math.min(windowEnd - duration, startMinutes + slotStep * 8);

  for (let candidateStart = minCandidate; candidateStart <= maxCandidate; candidateStart += slotStep) {
    const candidateEnd = candidateStart + duration;
    if (candidateStart === startMinutes && candidateEnd === endMinutes) continue;
    if (candidateEnd > windowEnd) continue;

    const intersects = occupiedRanges.some(([peerStart, peerEnd]) => hasOverlap(candidateStart, candidateEnd, peerStart, peerEnd));
    if (intersects) continue;

    suggestions.push({
      dayOfWeek,
      occurrenceDate,
      startTime: formatMinutesToTime(candidateStart),
      endTime: formatMinutesToTime(candidateEnd)
    });
    if (suggestions.length >= 5) break;
  }

  return {
    hasConflict: conflicts.length > 0,
    requested: {
      dayOfWeek,
      occurrenceDate,
      startTime,
      endTime
    },
    conflicts,
    suggestions
  };
}

async function createTimetableEntry(payload = {}) {
  const refs = await resolveBaseRefs(payload, null, { assignmentAuthority: true });
  if (!refs.schoolClass) throw new Error('timetable_class_required');
  if (!refs.subject) throw new Error('timetable_subject_required');
  if (!refs.teacherAssignment) throw new Error('timetable_teacher_assignment_required');

  let dayOfWeek = normalizeText(payload.dayOfWeek).toLowerCase();
  const occurrenceDate = normalizeText(payload.occurrenceDate);
  if (!dayOfWeek) dayOfWeek = deriveDayOfWeek(occurrenceDate);
  if (refs.config?.daysOfWeek?.length && !refs.config.daysOfWeek.includes(dayOfWeek)) throw new Error('timetable_day_not_allowed');

  const startTime = normalizeText(payload.startTime);
  const endTime = normalizeText(payload.endTime);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const configStart = parseTimeToMinutes(refs.config?.dayStartTime);
  const configEnd = parseTimeToMinutes(refs.config?.dayEndTime);
  if (configStart != null && startMinutes != null && startMinutes < configStart) throw new Error('timetable_before_config_window');
  if (configEnd != null && endMinutes != null && endMinutes > configEnd) throw new Error('timetable_after_config_window');

  await assertNoTimetableConflicts({ classId: refs.schoolClass._id, teacherAssignmentId: refs.teacherAssignment._id, dayOfWeek, occurrenceDate, startTime, endTime });

  const slotIndex = refs.config?.slotDurationMinutes && configStart != null && startMinutes != null ? Math.max(1, Math.floor((startMinutes - configStart) / refs.config.slotDurationMinutes) + 1) : Number(payload.slotIndex || 0);
  const item = await Timetable.create({
    configId: refs.config?._id || null,
    academicYearId: refs.academicYear?._id || refs.schoolClass.academicYearId?._id || refs.schoolClass.academicYearId || null,
    termId: refs.term?._id || refs.teacherAssignment.termId?._id || refs.teacherAssignment.termId || null,
    classId: refs.schoolClass._id,
    subjectId: refs.subject._id,
    teacherAssignmentId: refs.teacherAssignment._id,
    dayOfWeek,
    occurrenceDate,
    startTime,
    endTime,
    slotIndex,
    room: normalizeText(payload.room || refs.schoolClass.room),
    shift: normalizeText(payload.shift || refs.config?.defaultShift || refs.schoolClass.shift),
    status: normalizeText(payload.status) || 'active',
    source: normalizeText(payload.source) || 'manual',
    note: normalizeText(payload.note)
  });

  const populated = await Timetable.findById(item._id).populate('configId').populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
  return formatTimetable(populated);
}

async function updateTimetableEntry(entryId, payload = {}) {
  const current = await Timetable.findById(entryId);
  if (!current) throw new Error('timetable_not_found');
  const refs = await resolveBaseRefs(payload, current, { assignmentAuthority: true });
  if (!refs.schoolClass) throw new Error('timetable_class_required');
  if (!refs.subject) throw new Error('timetable_subject_required');
  if (!refs.teacherAssignment) throw new Error('timetable_teacher_assignment_required');

  let dayOfWeek = normalizeText(payload.dayOfWeek !== undefined ? payload.dayOfWeek : current.dayOfWeek).toLowerCase();
  const occurrenceDate = normalizeText(payload.occurrenceDate !== undefined ? payload.occurrenceDate : current.occurrenceDate);
  if (!dayOfWeek) dayOfWeek = deriveDayOfWeek(occurrenceDate);
  if (refs.config?.daysOfWeek?.length && !refs.config.daysOfWeek.includes(dayOfWeek)) throw new Error('timetable_day_not_allowed');

  const startTime = normalizeText(payload.startTime !== undefined ? payload.startTime : current.startTime);
  const endTime = normalizeText(payload.endTime !== undefined ? payload.endTime : current.endTime);
  const startMinutes = parseTimeToMinutes(startTime);
  const configStart = parseTimeToMinutes(refs.config?.dayStartTime);
  const slotIndex = refs.config?.slotDurationMinutes && configStart != null && startMinutes != null ? Math.max(1, Math.floor((startMinutes - configStart) / refs.config.slotDurationMinutes) + 1) : Number(payload.slotIndex !== undefined ? payload.slotIndex : current.slotIndex || 0);

  await assertNoTimetableConflicts({ entryId, classId: refs.schoolClass._id, teacherAssignmentId: refs.teacherAssignment._id, dayOfWeek, occurrenceDate, startTime, endTime });

  current.configId = refs.config?._id || null;
  current.academicYearId = refs.academicYear?._id || refs.schoolClass.academicYearId?._id || refs.schoolClass.academicYearId || null;
  current.termId = refs.term?._id || refs.teacherAssignment.termId?._id || refs.teacherAssignment.termId || null;
  current.classId = refs.schoolClass._id;
  current.subjectId = refs.subject._id;
  current.teacherAssignmentId = refs.teacherAssignment._id;
  current.dayOfWeek = dayOfWeek;
  current.occurrenceDate = occurrenceDate;
  current.startTime = startTime;
  current.endTime = endTime;
  current.slotIndex = slotIndex;
  current.room = normalizeText(payload.room !== undefined ? payload.room : current.room);
  current.shift = normalizeText(payload.shift !== undefined ? payload.shift : current.shift);
  current.status = normalizeText(payload.status !== undefined ? payload.status : current.status) || current.status;
  current.note = normalizeText(payload.note !== undefined ? payload.note : current.note);
  await current.save();

  const populated = await Timetable.findById(current._id).populate('configId').populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
  return formatTimetable(populated);
}

async function listTimetableEntries(query = {}) {
  const filter = {};
  if (normalizeNullableId(query.academicYearId)) filter.academicYearId = query.academicYearId;
  if (normalizeNullableId(query.termId)) filter.termId = query.termId;
  if (normalizeNullableId(query.classId)) filter.classId = query.classId;
  if (normalizeNullableId(query.subjectId)) filter.subjectId = query.subjectId;
  if (normalizeNullableId(query.teacherAssignmentId)) filter.teacherAssignmentId = query.teacherAssignmentId;
  if (normalizeNullableId(query.configId)) filter.configId = query.configId;
  if (normalizeText(query.dayOfWeek)) filter.dayOfWeek = normalizeText(query.dayOfWeek).toLowerCase();
  if (normalizeText(query.status)) filter.status = normalizeText(query.status);

  const items = await Timetable.find(filter).populate('configId').populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] }).sort({ dayOfWeek: 1, occurrenceDate: 1, startTime: 1 });
  return items.map(formatTimetable);
}
async function createAnnualPlan(payload = {}) {
  const refs = await resolveBaseRefs(payload, null, { assignmentAuthority: true });
  if (!refs.schoolClass) throw new Error('education_plan_class_required');
  if (!refs.subject) throw new Error('education_plan_subject_required');

  const item = await EducationPlanAnnual.create({
    title: normalizeText(payload.title) || `Annual Plan - ${normalizeText(refs.subject.name)} - ${normalizeText(refs.schoolClass.title)}`,
    code: normalizeText(payload.code),
    academicYearId: refs.academicYear?._id || refs.schoolClass.academicYearId?._id || refs.schoolClass.academicYearId,
    termId: refs.term?._id || refs.teacherAssignment?.termId?._id || refs.teacherAssignment?.termId || null,
    classId: refs.schoolClass._id,
    subjectId: refs.subject._id,
    teacherAssignmentId: refs.teacherAssignment?._id || null,
    annualTargetPeriods: Number(payload.annualTargetPeriods || 0),
    weeklyTargetPeriods: Number(payload.weeklyTargetPeriods || 0),
    unitCount: Number(payload.unitCount || 0),
    learningGoals: normalizeStringArray(payload.learningGoals),
    resourceList: normalizeStringArray(payload.resourceList),
    assessmentPolicy: normalizeText(payload.assessmentPolicy),
    status: normalizeText(payload.status) || 'draft',
    source: normalizeText(payload.source) || 'manual',
    note: normalizeText(payload.note)
  });

  const populated = await EducationPlanAnnual.findById(item._id).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
  return formatAnnualPlan(populated);
}

async function listAnnualPlans(query = {}) {
  const filter = {};
  if (normalizeNullableId(query.academicYearId)) filter.academicYearId = query.academicYearId;
  if (normalizeNullableId(query.termId)) filter.termId = query.termId;
  if (normalizeNullableId(query.classId)) filter.classId = query.classId;
  if (normalizeNullableId(query.subjectId)) filter.subjectId = query.subjectId;
  if (normalizeNullableId(query.teacherAssignmentId)) filter.teacherAssignmentId = query.teacherAssignmentId;
  if (normalizeText(query.status)) filter.status = normalizeText(query.status);
  const items = await EducationPlanAnnual.find(filter).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] }).sort({ createdAt: -1 });
  return items.map(formatAnnualPlan);
}

async function createWeeklyPlan(payload = {}) {
  const annualPlanId = normalizeNullableId(payload.annualPlanId);
  if (!annualPlanId) throw new Error('education_plan_annual_required');

  const annualPlan = await EducationPlanAnnual.findById(annualPlanId).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
  if (!annualPlan) throw new Error('education_plan_invalid_annual');

  const weekStartDate = normalizeText(payload.weekStartDate);
  const weekEndDate = normalizeText(payload.weekEndDate) || weekStartDate;
  if (!weekStartDate) throw new Error('education_plan_week_start_required');
  if (!normalizeText(payload.lessonTitle)) throw new Error('education_plan_lesson_title_required');

  const item = await EducationPlanWeekly.create({
    annualPlanId: annualPlan._id,
    academicYearId: annualPlan.academicYearId?._id || annualPlan.academicYearId,
    termId: annualPlan.termId?._id || annualPlan.termId || null,
    classId: annualPlan.classId?._id || annualPlan.classId,
    subjectId: annualPlan.subjectId?._id || annualPlan.subjectId,
    teacherAssignmentId: annualPlan.teacherAssignmentId?._id || annualPlan.teacherAssignmentId || null,
    weekStartDate,
    weekEndDate,
    lessonTitle: normalizeText(payload.lessonTitle),
    lessonNumber: Number(payload.lessonNumber || 1),
    objectives: normalizeStringArray(payload.objectives),
    topics: normalizeStringArray(payload.topics),
    activities: normalizeStringArray(payload.activities),
    resourceList: normalizeStringArray(payload.resourceList),
    homework: normalizeText(payload.homework),
    status: normalizeText(payload.status) || 'draft',
    source: normalizeText(payload.source) || 'manual',
    note: normalizeText(payload.note)
  });

  const populated = await EducationPlanWeekly.findById(item._id).populate({ path: 'annualPlanId', populate: ['academicYearId', { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, 'subjectId', { path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] }] }).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] });
  return formatWeeklyPlan(populated);
}

async function listWeeklyPlans(query = {}) {
  const filter = {};
  if (normalizeNullableId(query.annualPlanId)) filter.annualPlanId = query.annualPlanId;
  if (normalizeNullableId(query.academicYearId)) filter.academicYearId = query.academicYearId;
  if (normalizeNullableId(query.termId)) filter.termId = query.termId;
  if (normalizeNullableId(query.classId)) filter.classId = query.classId;
  if (normalizeNullableId(query.subjectId)) filter.subjectId = query.subjectId;
  if (normalizeText(query.status)) filter.status = normalizeText(query.status);
  const items = await EducationPlanWeekly.find(filter).populate({ path: 'annualPlanId', populate: ['academicYearId', { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, 'subjectId', { path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] }] }).populate('academicYearId').populate({ path: 'termId', populate: { path: 'academicYearId' } }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }, { path: 'academicYearId' }, { path: 'termId', populate: { path: 'academicYearId' } }, { path: 'classId', populate: { path: 'academicYearId' } }, { path: 'subjectId' }] }).sort({ weekStartDate: -1, lessonNumber: 1 });
  return items.map(formatWeeklyPlan);
}

async function backfillPhase8TimetablePlanning({ dryRun = false } = {}) {
  const summary = { configsCreated: 0, timetableCreated: 0, timetableUpdated: 0, annualPlansCreated: 0, weeklyPlansCreated: 0, warnings: [] };
  const activeYear = await AcademicYear.findOne({ isActive: true }).sort({ createdAt: -1 });
  const classes = await SchoolClass.find({ status: { $ne: 'archived' } }).sort({ createdAt: 1 });
  for (const schoolClass of classes) {
    const configResult = await ensureConfigForClass(schoolClass, null, { dryRun });
    if (configResult.created) summary.configsCreated += 1;
    if (!schoolClass.academicYearId && activeYear && !dryRun) {
      schoolClass.academicYearId = activeYear._id;
      await schoolClass.save();
    }
  }

  const schedules = await Schedule.find({}).sort({ date: 1, startTime: 1 });
  for (const schedule of schedules) {
    const result = await syncTimetableFromLegacySchedule(schedule._id, { dryRun });
    if (result.created) summary.timetableCreated += 1;
    if (result.updated) summary.timetableUpdated += 1;
    if (Array.isArray(result.warnings) && result.warnings.length) summary.warnings.push({ scheduleId: String(schedule._id), warnings: result.warnings });
  }

  const assignments = await TeacherAssignment.find({ status: 'active' }).populate({ path: 'classId', populate: { path: 'academicYearId' } }).populate('subjectId').populate('academicYearId');
  for (const assignment of assignments) {
    const classId = assignment.classId?._id || assignment.classId;
    const subjectId = assignment.subjectId?._id || assignment.subjectId;
    const academicYearId = assignment.academicYearId?._id || assignment.academicYearId || assignment.classId?.academicYearId?._id || assignment.classId?.academicYearId || activeYear?._id || null;
    if (!classId || !subjectId || !academicYearId) {
      summary.warnings.push({ assignmentId: String(assignment._id), warnings: ['annual_plan_skipped_missing_refs'] });
      continue;
    }

    let annualPlan = await EducationPlanAnnual.findOne({ academicYearId, classId, subjectId, teacherAssignmentId: assignment._id, status: { $in: ['draft', 'active'] } });
    if (!annualPlan) {
      summary.annualPlansCreated += 1;
      if (!dryRun) {
        annualPlan = await EducationPlanAnnual.create({
          title: `Annual Plan - ${normalizeText(assignment.subjectId?.name || 'Subject')} - ${normalizeText(assignment.classId?.title || 'Class')}`,
          code: buildAnnualPlanCode(assignment, assignment.subjectId, assignment.classId),
          academicYearId,
          termId: assignment.termId || null,
          classId,
          subjectId,
          teacherAssignmentId: assignment._id,
          annualTargetPeriods: 32,
          weeklyTargetPeriods: 4,
          unitCount: 0,
          learningGoals: [],
          resourceList: [],
          assessmentPolicy: '',
          status: 'draft',
          source: 'system',
          note: 'auto_created_from_teacher_assignment'
        });
      }
    }

    const relatedTimetable = !dryRun ? await Timetable.findOne({ teacherAssignmentId: assignment._id }).sort({ occurrenceDate: 1, dayOfWeek: 1, startTime: 1 }) : null;
    if (annualPlan && relatedTimetable?.occurrenceDate) {
      const weekRange = buildIsoWeekRange(relatedTimetable.occurrenceDate);
      const existingWeekly = await EducationPlanWeekly.findOne({ annualPlanId: annualPlan._id, weekStartDate: weekRange.weekStartDate, lessonTitle: normalizeText(assignment.subjectId?.name || 'Lesson') });
      if (!existingWeekly) {
        summary.weeklyPlansCreated += 1;
        if (!dryRun) {
          await EducationPlanWeekly.create({
            annualPlanId: annualPlan._id,
            academicYearId,
            termId: assignment.termId || null,
            classId,
            subjectId,
            teacherAssignmentId: assignment._id,
            weekStartDate: weekRange.weekStartDate,
            weekEndDate: weekRange.weekEndDate,
            lessonTitle: normalizeText(assignment.subjectId?.name || 'Lesson'),
            lessonNumber: 1,
            objectives: [],
            topics: [normalizeText(assignment.subjectId?.name || 'Lesson')],
            activities: ['legacy_schedule_backfill'],
            resourceList: [],
            homework: '',
            status: 'draft',
            source: 'legacy_schedule',
            note: 'auto_created_from_legacy_schedule'
          });
        }
      }
    }
  }

  return summary;
}

module.exports = {
  backfillPhase8TimetablePlanning,
  createAnnualPlan,
  createTimetableConfig,
  createTimetableEntry,
  createWeeklyPlan,
  ensureTeacherAssignmentsFromLegacyMappings,
  listAnnualPlans,
  listTimetableConfigs,
  listTimetableEntries,
  listTimetableReferenceData,
  listWeeklyPlans,
  previewTimetableEntryConflict,
  resolveBaseRefs,
  updateTimetableEntry
};
