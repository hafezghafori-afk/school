require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/TeacherAssignment');
require('../models/TimetableConfig');
require('../models/Timetable');
require('../models/Schedule');

const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const TimetableConfig = require('../models/TimetableConfig');
const Timetable = require('../models/Timetable');
const Schedule = require('../models/Schedule');

const DAY_VALUES = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DEFAULT_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ virtuals: false });
  return { ...doc };
}

function parseTimeToMinutes(value) {
  const text = normalizeText(value);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function deriveDayOfWeek(dateKey) {
  const text = normalizeText(dateKey);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return 'monday';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][jsDay] || 'monday';
}

function hasOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function buildConfigCode(classDoc) {
  const item = toPlain(classDoc);
  const codeBase = normalizeText(item?.code || item?.gradeLevel || item?.title || 'CLASS').replace(/\s+/g, '-').toUpperCase();
  return `TT-${codeBase}`.slice(0, 64);
}

function buildAnnualPlanCode(assignmentDoc, subjectDoc, classDoc) {
  const subjectCode = normalizeText(subjectDoc?.code || subjectDoc?.name || 'SUBJECT').replace(/\s+/g, '-').toUpperCase();
  const classCode = normalizeText(classDoc?.code || classDoc?.gradeLevel || classDoc?.title || 'CLASS').replace(/\s+/g, '-').toUpperCase();
  const assignmentId = String(assignmentDoc?._id || '').slice(-6) || 'AUTO';
  return `PLAN-${classCode}-${subjectCode}-${assignmentId}`.slice(0, 80);
}

async function ensureSubjectForSchedule(scheduleDoc, classDoc, { dryRun = false } = {}) {
  const schedule = toPlain(scheduleDoc);
  if (schedule?.subjectRef) {
    const existing = await Subject.findById(schedule.subjectRef);
    if (existing) return { subject: existing, created: false };
  }

  const subjectName = normalizeText(schedule?.subject);
  if (!subjectName) return { subject: null, created: false };

  const gradeLevel = normalizeText(classDoc?.gradeLevel);
  let subject = await Subject.findOne({ name: subjectName, ...(gradeLevel ? { grade: gradeLevel } : {}) });
  if (subject) return { subject, created: false };

  subject = new Subject({ name: subjectName, grade: gradeLevel, code: '' });
  if (!dryRun) await subject.save();
  return { subject, created: true };
}

async function ensureTeacherAssignmentForSchedule(scheduleDoc, classDoc, subjectDoc, { dryRun = false } = {}) {
  const schedule = toPlain(scheduleDoc);
  const classId = classDoc?._id || null;
  const academicYearId = classDoc?.academicYearId || null;
  const subjectId = subjectDoc?._id || null;

  if (!classId || !subjectId || !schedule?.instructor) {
    return { assignment: null, created: false };
  }

  let assignment = await TeacherAssignment.findOne({
    teacherUserId: schedule.instructor,
    classId,
    subjectId,
    academicYearId: academicYearId || null,
    assignmentType: 'subject',
    status: 'active'
  }).sort({ isPrimary: -1, createdAt: 1 });

  if (assignment) return { assignment, created: false };

  assignment = new TeacherAssignment({
    teacherUserId: schedule.instructor,
    academicYearId: academicYearId || null,
    classId,
    subjectId,
    assignmentType: 'subject',
    status: 'active',
    startedAt: schedule.date ? new Date(`${schedule.date}T00:00:00.000Z`) : new Date(),
    source: 'schedule_backfill',
    legacyCourseId: schedule.course || null,
    isPrimary: true,
    note: 'auto_created_from_schedule'
  });
  if (!dryRun) await assignment.save();
  return { assignment, created: true };
}

async function ensureConfigForClass(classDoc, scheduleDoc = null, { dryRun = false } = {}) {
  const schoolClass = toPlain(classDoc);
  if (!schoolClass?._id) return { config: null, created: false };

  let config = await TimetableConfig.findOne({
    classId: schoolClass._id,
    academicYearId: schoolClass.academicYearId || null,
    isActive: true
  }).sort({ isDefault: -1, createdAt: 1 });

  if (config) return { config, created: false };

  const earliestStart = normalizeText(scheduleDoc?.startTime) || normalizeText(schoolClass.shift ? '07:00' : '');
  const latestEnd = normalizeText(scheduleDoc?.endTime) || '15:00';
  config = new TimetableConfig({
    name: `${normalizeText(schoolClass.title || schoolClass.code || 'Class')} Default Timetable`,
    code: buildConfigCode(schoolClass),
    academicYearId: schoolClass.academicYearId || null,
    classId: schoolClass._id,
    daysOfWeek: DEFAULT_DAYS,
    dayStartTime: earliestStart,
    dayEndTime: latestEnd,
    slotDurationMinutes: 45,
    breakDurationMinutes: 10,
    maxDailyPeriods: 8,
    defaultShift: normalizeText(scheduleDoc?.shift || schoolClass.shift),
    isDefault: true,
    isActive: true,
    source: scheduleDoc ? 'legacy_schedule' : 'system',
    note: scheduleDoc ? 'auto_created_from_legacy_schedule' : 'auto_created_for_school_class'
  });
  if (!dryRun) await config.save();
  return { config, created: true };
}

async function syncTimetableFromLegacySchedule(scheduleId, { dryRun = false } = {}) {
  const schedule = await Schedule.findById(scheduleId).lean();
  if (!schedule) {
    return { created: false, updated: false, removed: false, warnings: ['schedule_not_found'] };
  }

  const schoolClass = await SchoolClass.findOne({ legacyCourseId: schedule.course });
  if (!schoolClass) {
    return { created: false, updated: false, removed: false, warnings: ['school_class_not_found'] };
  }

  const subjectResult = await ensureSubjectForSchedule(schedule, schoolClass, { dryRun });
  if (!subjectResult.subject) {
    return { created: false, updated: false, removed: false, warnings: ['subject_not_resolved'] };
  }

  const assignmentResult = await ensureTeacherAssignmentForSchedule(schedule, schoolClass, subjectResult.subject, { dryRun });
  if (!assignmentResult.assignment) {
    return { created: false, updated: false, removed: false, warnings: ['teacher_assignment_not_resolved'], subjectCreated: subjectResult.created };
  }

  const configResult = await ensureConfigForClass(schoolClass, schedule, { dryRun });
  const dayOfWeek = deriveDayOfWeek(schedule.date);
  const payload = {
    configId: configResult.config?._id || null,
    academicYearId: schoolClass.academicYearId || null,
    termId: assignmentResult.assignment?.termId || null,
    classId: schoolClass._id,
    subjectId: subjectResult.subject._id,
    teacherAssignmentId: assignmentResult.assignment._id,
    dayOfWeek,
    occurrenceDate: normalizeText(schedule.date),
    startTime: normalizeText(schedule.startTime),
    endTime: normalizeText(schedule.endTime),
    room: normalizeText(schedule.room),
    shift: normalizeText(schedule.shift),
    status: schedule.visibility === 'published' ? 'published' : 'draft',
    source: 'legacy_schedule',
    legacyScheduleId: schedule._id,
    note: normalizeText(schedule.note)
  };

  const startMinutes = parseTimeToMinutes(payload.startTime);
  const configStartMinutes = parseTimeToMinutes(configResult.config?.dayStartTime);
  if (startMinutes != null && configStartMinutes != null && configResult.config?.slotDurationMinutes) {
    payload.slotIndex = Math.max(1, Math.floor((startMinutes - configStartMinutes) / configResult.config.slotDurationMinutes) + 1);
  } else {
    payload.slotIndex = 0;
  }

  const existing = await Timetable.findOne({ legacyScheduleId: schedule._id });
  if (!existing) {
    if (!dryRun) await Timetable.create(payload);
    return {
      created: true,
      updated: false,
      removed: false,
      warnings: [],
      configCreated: configResult.created,
      subjectCreated: subjectResult.created,
      teacherAssignmentCreated: assignmentResult.created
    };
  }

  const nextPayload = { ...payload };
  let changed = false;
  for (const [key, value] of Object.entries(nextPayload)) {
    const current = existing[key];
    if (String(current || '') !== String(value || '')) {
      existing[key] = value;
      changed = true;
    }
  }

  if (changed && !dryRun) await existing.save();
  return {
    created: false,
    updated: changed,
    removed: false,
    warnings: [],
    configCreated: configResult.created,
    subjectCreated: subjectResult.created,
    teacherAssignmentCreated: assignmentResult.created
  };
}

async function removeTimetableByLegacySchedule(scheduleId, { dryRun = false } = {}) {
  const existing = await Timetable.findOne({ legacyScheduleId: scheduleId });
  if (!existing) return { removed: false };
  if (!dryRun) await existing.deleteOne();
  return { removed: true };
}

module.exports = {
  DAY_VALUES,
  DEFAULT_DAYS,
  buildAnnualPlanCode,
  deriveDayOfWeek,
  ensureConfigForClass,
  ensureTeacherAssignmentForSchedule,
  hasOverlap,
  parseTimeToMinutes,
  removeTimetableByLegacySchedule,
  syncTimetableFromLegacySchedule
};
