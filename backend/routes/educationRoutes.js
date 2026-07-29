const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Course = require('../models/Course');
const CourseJoinRequest = require('../models/CourseJoinRequest');
const Schedule = require('../models/Schedule');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const Enrollment = require('../models/Enrollment');
const AfghanStudent = require('../models/AfghanStudent');
const Subject = require('../models/Subject');
const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const Shift = require('../models/Shift');
const InstructorSubject = require('../models/InstructorSubject');
const TeacherAssignment = require('../models/TeacherAssignment');
const { ensureTeacherAssignmentsFromLegacyMappings } = require('../services/timetableService');
const UserNotification = require('../models/UserNotification');
const { buildConcurrentCurrentMembershipFilter } = require('../utils/studentMembershipIntegrity');
const { ENDED_STUDENT_MEMBERSHIP_STATUSES } = require('../utils/studentMembershipStatus');
const { findAccessibleCourses } = require('../utils/courseAccess');
const { ensureAfghanStudentProfile } = require('../services/afghanStudentProfileService');
const {
  SUPPORTED_ACTIONS: SUPPORTED_STUDENT_LIFECYCLE_ACTIONS,
  executeStudentLifecycleAction,
  getStudentLifecycleHistory
} = require('../services/studentLifecycleService');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();
const DEFAULT_SINGLE_SCHOOL_ID = '000000000000000000000001';

const membershipAccessOptions = Object.freeze({});
const CURRENT_STUDENT_MEMBERSHIP_STATUSES = Object.freeze(['active', 'pending', 'suspended', 'transferred_in']);
const ALL_STUDENT_MEMBERSHIP_STATUSES = Object.freeze([
  ...CURRENT_STUDENT_MEMBERSHIP_STATUSES,
  ...ENDED_STUDENT_MEMBERSHIP_STATUSES
]);
const LIFECYCLE_ONLY_MEMBERSHIP_STATUSES = Object.freeze(['transferred_in', 'transferred_out', 'dropped', 'expelled', 'suspended', 'graduated']);
const STUDENT_LIFECYCLE_MANAGE_PERMISSIONS = Object.freeze(['students.lifecycle.manage', 'students.transfers.manage', 'manage_memberships', 'manage_users']);

const mustObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const asObjectIdOrNull = (value) => (mustObjectId(value) ? value : null);
const normalizeText = (value) => String(value || '').trim();
const toNullableObjectId = (value) => (mustObjectId(value) ? String(value) : '');

const SECTION_ALIASES = Object.freeze({
  a: 'الف',
  b: 'ب',
  c: 'ج',
  d: 'د',
  e: 'ه',
  f: 'و',
  g: 'ز',
  h: 'ح',
  i: 'ط',
  'الف': 'الف',
  'ب': 'ب',
  'ج': 'ج',
  'د': 'د',
  'ه': 'ه',
  'و': 'و',
  'ز': 'ز',
  'ح': 'ح',
  'ط': 'ط'
});

const SHIFT_DEFAULTS = Object.freeze({
  morning: { name: 'morning', nameDari: 'صبح', namePashto: 'سهار', startTime: '07:00', endTime: '12:00' },
  afternoon: { name: 'afternoon', nameDari: 'بعد از ظهر', namePashto: 'مازیګر', startTime: '12:30', endTime: '16:30' },
  evening: { name: 'evening', nameDari: 'عصر', namePashto: 'ماښام', startTime: '16:30', endTime: '20:00' }
});

const toAsciiDigits = (value) => String(value || '')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

const normalizeGradeLevel = (...candidates) => {
  for (const candidate of candidates) {
    const normalized = toAsciiDigits(candidate).trim();
    if (!normalized) continue;
    const direct = Number(normalized);
    if (Number.isFinite(direct) && direct >= 1 && direct <= 12) return direct;
    const match = normalized.match(/\b(1[0-2]|[1-9])\b/);
    if (match) return Number(match[1]);
  }
  return null;
};

const normalizeClassSection = (...candidates) => {
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate);
    if (!normalized) continue;
    const compact = normalized.toLowerCase();
    if (SECTION_ALIASES[compact]) return SECTION_ALIASES[compact];
    const latinMatch = compact.match(/([a-i])$/i);
    if (latinMatch && SECTION_ALIASES[latinMatch[1].toLowerCase()]) {
      return SECTION_ALIASES[latinMatch[1].toLowerCase()];
    }
  }
  return '';
};

const normalizeGenderType = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'male' || normalized === 'female' || normalized === 'mixed') return normalized;
  return 'mixed';
};

const normalizeCapacity = (value, fallback = 30) => {
  const normalized = Number(toAsciiDigits(value));
  if (Number.isFinite(normalized) && normalized >= 1 && normalized <= 100) return normalized;
  return fallback;
};

const normalizeShiftName = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (SHIFT_DEFAULTS[normalized]) return normalized;
  return 'morning';
};

const buildSchoolClassTitles = ({ title = '', gradeLevel = null, section = '' } = {}) => {
  const normalizedTitle = normalizeText(title) || (gradeLevel && section ? `صنف ${gradeLevel} ${section}` : 'صنف');
  return {
    title: normalizedTitle,
    titleDari: gradeLevel && section ? `صنف ${gradeLevel} ${section}` : normalizedTitle,
    titlePashto: gradeLevel && section ? `درجه ${gradeLevel} ${section}` : normalizedTitle
  };
};

const ensureShiftIdForSchoolClass = async ({ schoolId = '', shiftName = 'morning' } = {}) => {
  const normalizedSchoolId = toNullableObjectId(schoolId);
  if (!normalizedSchoolId) return '';
  const normalizedShiftName = normalizeShiftName(shiftName);
  const existingShift = await Shift.findOne({ schoolId: normalizedSchoolId, name: normalizedShiftName }).select('_id');
  if (existingShift?._id) return String(existingShift._id);

  const defaults = SHIFT_DEFAULTS[normalizedShiftName] || SHIFT_DEFAULTS.morning;
  try {
    const createdShift = await Shift.create({
      schoolId: normalizedSchoolId,
      name: defaults.name,
      nameDari: defaults.nameDari,
      namePashto: defaults.namePashto,
      code: `${String(normalizedSchoolId).slice(-6)}-${defaults.name}`,
      startTime: defaults.startTime,
      endTime: defaults.endTime,
      isActive: true,
      description: `شیفت پیش‌فرض ${defaults.nameDari}`
    });
    return String(createdShift._id);
  } catch (error) {
    const fallbackShift = await Shift.findOne({ schoolId: normalizedSchoolId, name: normalizedShiftName }).select('_id');
    if (fallbackShift?._id) return String(fallbackShift._id);
    throw error;
  }
};

const inferEducationSchoolId = async ({ academicYearId = '', currentSchoolId = '' } = {}) => {
  const preferredSchoolId = toNullableObjectId(currentSchoolId);
  if (preferredSchoolId) return preferredSchoolId;

  const normalizedAcademicYearId = toNullableObjectId(academicYearId);
  if (normalizedAcademicYearId) {
    const linkedAcademicYear = await AcademicYear.findById(normalizedAcademicYearId).select('schoolId');
    if (linkedAcademicYear?.schoolId) return String(linkedAcademicYear.schoolId);

    const linkedSchoolClass = await SchoolClass.findOne({
      academicYearId: normalizedAcademicYearId,
      schoolId: { $exists: true, $ne: null }
    }).select('schoolId');
    if (linkedSchoolClass?.schoolId) return String(linkedSchoolClass.schoolId);
  }

  const academicYearSchoolIds = (await AcademicYear.find({
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId')).map((item) => String(item.schoolId || '')).filter(Boolean);
  const uniqueAcademicYearSchoolIds = [...new Set(academicYearSchoolIds)];
  if (uniqueAcademicYearSchoolIds.length === 1) return uniqueAcademicYearSchoolIds[0];

  const classSchoolIds = (await SchoolClass.find({
    schoolId: { $exists: true, $ne: null }
  }).select('schoolId')).map((item) => String(item.schoolId || '')).filter(Boolean);
  const uniqueClassSchoolIds = [...new Set(classSchoolIds)];
  if (uniqueClassSchoolIds.length === 1) return uniqueClassSchoolIds[0];

  return DEFAULT_SINGLE_SCHOOL_ID;
};

const populateSchoolClasses = (query) => query
  .populate('academicYearId', 'title isActive')
  .populate('legacyCourseId', 'title category academicYearRef description level tags')
  .populate('homeroomTeacherUserId', 'name email');

const serializeSchoolClass = (item) => ({
  _id: item._id,
  id: item._id,
  title: item.title || '',
  code: item.code || '',
  gradeLevel: item.gradeLevel || '',
  section: item.section || '',
  shift: item.shift || '',
  shiftId: item.shiftId || null,
  room: item.room || '',
  status: item.status || 'active',
  note: item.note || '',
  academicYearId: item.academicYearId?._id || item.academicYearId || null,
  academicYear: item.academicYearId ? {
    _id: item.academicYearId._id || item.academicYearId,
    title: item.academicYearId.title || '',
    isActive: !!item.academicYearId.isActive
  } : null,
  legacyCourseId: item.legacyCourseId?._id || item.legacyCourseId || null,
  legacyCourse: item.legacyCourseId ? {
    _id: item.legacyCourseId._id || item.legacyCourseId,
    title: item.legacyCourseId.title || ''
  } : null,
  homeroomTeacherUserId: item.homeroomTeacherUserId?._id || item.homeroomTeacherUserId || null,
  homeroomTeacher: item.homeroomTeacherUserId ? {
    _id: item.homeroomTeacherUserId._id || item.homeroomTeacherUserId,
    name: item.homeroomTeacherUserId.name || '',
    email: item.homeroomTeacherUserId.email || ''
  } : null
});

const serializePublicSchoolClassCatalogItem = (item, legacyCourse = null) => {
  const schoolClass = serializeSchoolClass(item);
  const compatCourseId = legacyCourse?._id || schoolClass.legacyCourseId || null;
  const tags = [...new Set([
    ...(Array.isArray(legacyCourse?.tags) ? legacyCourse.tags : []),
    schoolClass.code || '',
    schoolClass.section || ''
  ].filter(Boolean))];

  return {
    _id: compatCourseId || schoolClass.id,
    id: schoolClass.id,
    classId: schoolClass.id,
    courseId: compatCourseId || null,
    legacyCourseId: compatCourseId || null,
    title: schoolClass.title,
    description: legacyCourse?.description || schoolClass.note || '',
    price: Number(legacyCourse?.price || 0),
    category: schoolClass.gradeLevel || legacyCourse?.category || '',
    level: schoolClass.shift || legacyCourse?.level || '',
    kind: legacyCourse?.kind || 'academic_class',
    tags,
    videoUrl: legacyCourse?.videoUrl || '',
    pdfUrl: legacyCourse?.pdfUrl || '',
    schoolClassRef: schoolClass.id,
    schoolClass
  };
};

const normalizeSubjectGradeLevels = (...values) => {
  const collected = [];
  values.forEach((value) => {
    const normalized = toAsciiDigits(normalizeText(value));
    if (!normalized) return;
    normalized
      .split(/[\s,|/\\-]+/)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 1 && item <= 12)
      .forEach((item) => {
        if (!collected.includes(item)) collected.push(item);
      });
  });
  return collected;
};

const resolvePublicSchoolClassCatalogItem = async (identifier = '') => {
  const normalizedIdentifier = normalizeText(identifier);
  if (!mustObjectId(normalizedIdentifier)) {
    return { error: 'Class was not found.' };
  }

  let schoolClass = await populateSchoolClasses(SchoolClass.findById(normalizedIdentifier));
  if (!schoolClass) {
    const linkedCourse = await Course.findById(normalizedIdentifier).select('_id schoolClassRef');
    if (!linkedCourse) {
      return { error: 'Class was not found.' };
    }
    if (linkedCourse.schoolClassRef) {
      schoolClass = await populateSchoolClasses(SchoolClass.findById(linkedCourse.schoolClassRef));
    }
    if (!schoolClass) {
      schoolClass = await populateSchoolClasses(SchoolClass.findOne({ legacyCourseId: linkedCourse._id }));
    }
  }

  if (!schoolClass || schoolClass.status !== 'active') {
    return { error: 'Class was not found.' };
  }

  const legacyCourse = schoolClass.legacyCourseId?._id
    ? schoolClass.legacyCourseId
    : await syncLegacyCourseForSchoolClass(schoolClass);

  return {
    schoolClass,
    legacyCourse,
    item: serializePublicSchoolClassCatalogItem(schoolClass, legacyCourse)
  };
};

const syncLegacyCourseForSchoolClass = async (schoolClass) => {
  if (!schoolClass?._id) return null;
  let legacyCourse = null;
  if (schoolClass.legacyCourseId) {
    legacyCourse = await Course.findById(schoolClass.legacyCourseId);
  }
  if (!legacyCourse) {
    legacyCourse = await Course.findOne({ schoolClassRef: schoolClass._id, kind: 'academic_class' }).sort({ createdAt: -1 });
  }

  const payload = {
    title: schoolClass.title,
    description: schoolClass.note || '',
    category: schoolClass.gradeLevel || '',
    kind: 'academic_class',
    academicYearRef: schoolClass.academicYearId || null,
    schoolClassRef: schoolClass._id,
    gradeLevel: schoolClass.gradeLevel || '',
    section: schoolClass.section || '',
    homeroomInstructor: schoolClass.homeroomTeacherUserId || null,
    isActive: schoolClass.status !== 'archived',
    tags: [schoolClass.code || '', schoolClass.section || ''].filter(Boolean)
  };

  if (!legacyCourse) {
    legacyCourse = await Course.create({ ...payload, price: 0, level: schoolClass.shift || '' });
  } else {
    legacyCourse.title = payload.title;
    legacyCourse.description = payload.description;
    legacyCourse.category = payload.category;
    legacyCourse.kind = payload.kind;
    legacyCourse.academicYearRef = payload.academicYearRef;
    legacyCourse.schoolClassRef = payload.schoolClassRef;
    legacyCourse.gradeLevel = payload.gradeLevel;
    legacyCourse.section = payload.section;
    legacyCourse.homeroomInstructor = payload.homeroomInstructor;
    legacyCourse.isActive = payload.isActive;
    legacyCourse.tags = payload.tags;
    legacyCourse.level = schoolClass.shift || legacyCourse.level || '';
    await legacyCourse.save();
  }

  if (String(schoolClass.legacyCourseId || '') !== String(legacyCourse._id || '')) {
    schoolClass.legacyCourseId = legacyCourse._id;
    await schoolClass.save();
  }

  return legacyCourse;
};

const loadSerializedSchoolClassById = async (schoolClassId) => {
  if (!mustObjectId(schoolClassId)) return null;
  const item = await populateSchoolClasses(SchoolClass.findById(schoolClassId));
  return item ? serializeSchoolClass(item) : null;
};

const resolveClassReference = async ({ classId = '', courseId = '', syncLegacy = true } = {}) => {
  const normalizedClassId = toNullableObjectId(classId);
  const normalizedCourseId = toNullableObjectId(courseId);
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId);
    if (!schoolClass) return { error: 'Class is invalid' };
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('_id academicYearRef schoolClassRef title category');
    }
    if (!course && syncLegacy) {
      course = await syncLegacyCourseForSchoolClass(schoolClass);
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('_id academicYearRef schoolClassRef title category');
    if (!linkedCourse) return { error: 'Class is invalid' };
    if (!course) course = linkedCourse;
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match' };
    }
    if (!schoolClass) {
      const schoolClassQuery = linkedCourse.schoolClassRef
        ? SchoolClass.findById(linkedCourse.schoolClassRef)
        : SchoolClass.findOne({ legacyCourseId: linkedCourse._id });
      schoolClass = await schoolClassQuery;
    }
  }

  if (schoolClass && !course && syncLegacy) {
    course = await syncLegacyCourseForSchoolClass(schoolClass);
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
};

const buildSchoolClassLookups = async ({ classIds = [], courseIds = [] } = {}) => {
  const normalizedClassIds = [...new Set(classIds.map((item) => String(item || '')).filter(mustObjectId))];
  const normalizedCourseIds = [...new Set(courseIds.map((item) => String(item || '')).filter(mustObjectId))];
  if (!normalizedClassIds.length && !normalizedCourseIds.length) {
    return { byId: new Map(), byCourseId: new Map() };
  }

  const clauses = [];
  if (normalizedClassIds.length) clauses.push({ _id: { $in: normalizedClassIds } });
  if (normalizedCourseIds.length) clauses.push({ legacyCourseId: { $in: normalizedCourseIds } });
  const filter = clauses.length === 1 ? clauses[0] : { $or: clauses };
  const items = await populateSchoolClasses(SchoolClass.find(filter));
  const serialized = items.map(serializeSchoolClass);
  const byId = new Map();
  const byCourseId = new Map();
  serialized.forEach((item) => {
    const itemId = item.id || item._id;
    if (itemId) byId.set(String(itemId), item);
    if (item.legacyCourseId) byCourseId.set(String(item.legacyCourseId), item);
  });
  return { byId, byCourseId };
};

const findSchoolClassForItem = (item, lookups = { byId: new Map(), byCourseId: new Map() }) => {
  const classId = item?.classId?._id || item?.classId || '';
  const courseId = item?.course?._id || item?.course || '';
  const direct = lookups.byId.get(String(classId)) || lookups.byCourseId.get(String(courseId));
  if (direct) return direct;
  if (item?.classId && typeof item.classId === 'object' && (item.classId.title || item.classId.code)) {
    return serializeSchoolClass(item.classId);
  }
  return null;
};

const normalizeStudentGrade = (value = '') => {
  const normalized = normalizeText(value);
  if (!normalized) return '';
  const ascii = toAsciiDigits(normalized).toLowerCase();
  const match = ascii.match(/(1[0-2]|[1-9])/);
  return match ? String(Number(match[1])) : normalized;
};

const isValidEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const normalizeCandidateValue = (sourceType = '', sourceId = '') => {
  if (!sourceId) return '';
  return sourceType === 'user' ? String(sourceId) : `${sourceType}:${sourceId}`;
};

const buildPlaceholderStudentEmail = async ({ sourceType = 'candidate', sourceId = '' } = {}) => {
  const seed = `${sourceType}.${String(sourceId || '').toLowerCase().replace(/[^a-z0-9]/g, '') || Date.now()}`;
  let attempt = 0;
  while (attempt < 10) {
    const suffix = attempt ? `.${attempt}` : '';
    const email = `${seed}${suffix}@students.local`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.findOne({ email }).select('_id');
    if (!exists?._id) return email;
    attempt += 1;
  }
  return `${seed}.${Date.now()}@students.local`;
};

const buildStudentCandidateFromUser = (item) => ({
  _id: item?._id || null,
  id: item?._id || null,
  value: item?._id ? String(item._id) : '',
  name: item?.name || '',
  email: item?.email || '',
  phone: '',
  grade: normalizeStudentGrade(item?.grade),
  sourceType: 'user',
  sourceLabel: 'ثبت‌شده در سیستم',
  status: 'ready',
  canonicalUserId: item?._id || null
});

const buildStudentCandidateFromEnrollment = (item) => ({
  _id: item?._id || null,
  id: item?._id || null,
  value: normalizeCandidateValue('enrollment', item?._id),
  name: item?.studentName || '',
  email: item?.email || '',
  phone: item?.phone || '',
  grade: normalizeStudentGrade(item?.grade),
  fatherName: item?.fatherName || '',
  note: item?.notes || '',
  previousSchool: item?.previousSchool || '',
  previousGrade: '',
  isTransferCandidate: Boolean(normalizeText(item?.previousSchool)),
  sourceType: 'enrollment',
  sourceLabel: 'ثبت‌نام آنلاین',
  status: item?.status || 'pending',
  canonicalUserId: item?.linkedUserId || null,
  createdAt: item?.createdAt || null
});

const buildStudentCandidateFromAfghanStudent = (item) => {
  const firstName = item?.personalInfo?.firstNameDari || item?.personalInfo?.firstName || '';
  const lastName = item?.personalInfo?.lastNameDari || item?.personalInfo?.lastName || '';
  return {
    _id: item?._id || null,
    id: item?._id || null,
    value: normalizeCandidateValue('afghan', item?._id),
    name: [firstName, lastName].filter(Boolean).join(' ').trim(),
    email: item?.contactInfo?.email || '',
    phone: item?.contactInfo?.mobile || item?.contactInfo?.phone || item?.familyInfo?.fatherPhone || '',
    grade: normalizeStudentGrade(item?.academicInfo?.currentGrade),
    fatherName: item?.personalInfo?.fatherName || '',
    note: item?.notes || '',
    previousSchool: item?.academicInfo?.previousSchool?.name || '',
    previousGrade: item?.academicInfo?.previousSchool?.lastGrade || '',
    isTransferCandidate: Boolean(normalizeText(item?.academicInfo?.previousSchool?.name || item?.academicInfo?.previousSchool?.lastGrade)),
    sourceType: 'afghan',
    sourceLabel: 'ثبت‌نام دستی',
    status: item?.status || 'active',
    canonicalUserId: item?.linkedUserId || null,
    createdAt: item?.createdAt || null
  };
};

const buildOnlineQueueItem = (item) => ({
  _id: item?._id || null,
  id: item?._id || null,
  sourceRef: normalizeCandidateValue('enrollment', item?._id),
  name: item?.studentName || '',
  fatherName: item?.fatherName || '',
  grade: normalizeStudentGrade(item?.grade),
  phone: item?.phone || '',
  email: item?.email || '',
  status: item?.status || 'pending',
  note: item?.notes || '',
  createdAt: item?.createdAt || null,
  approvedAt: item?.approvedAt || null,
  rejectionReason: item?.rejectionReason || '',
  canonicalUserId: item?.linkedUserId || null,
  sourceLabel: 'ثبت‌نام آنلاین'
});

const loadEducationStudentCatalog = async () => {
  const [canonicalStudents, afghanStudents, onlineRegistrations, currentMemberships] = await Promise.all([
    User.find({ role: 'student' }).select('name email grade').sort({ name: 1 }),
    AfghanStudent.find({ status: { $ne: 'deleted' } })
      .select('personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherName contactInfo.email contactInfo.mobile contactInfo.phone familyInfo.fatherPhone academicInfo.currentGrade academicInfo.previousSchool notes status linkedUserId createdAt')
      .sort({ createdAt: -1 }),
    Enrollment.find({
      registrationSource: 'online',
      status: { $in: ['pending', 'approved'] }
    })
      .select('studentName fatherName grade phone email previousSchool notes status linkedUserId createdAt approvedAt rejectionReason')
      .sort({ createdAt: -1 }),
    StudentMembership.find({
      isCurrent: true,
      status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
    }).select('student')
  ]);

  const memberUserIds = new Set(
    currentMemberships
      .map((item) => String(item?.student || '').trim())
      .filter(Boolean)
  );
  const canonicalUserIdByEmail = new Map();
  canonicalStudents.forEach((item) => {
    const email = normalizeText(item?.email).toLowerCase();
    if (email && item?._id) canonicalUserIdByEmail.set(email, String(item._id));
  });
  const candidateHasCurrentMembership = (item = {}) => {
    const linkedId = String(item?.linkedUserId || item?.canonicalUserId || '').trim();
    if (linkedId && memberUserIds.has(linkedId)) return true;
    const email = normalizeText(item?.email || item?.contactInfo?.email).toLowerCase();
    const matchedUserId = email ? canonicalUserIdByEmail.get(email) : '';
    return Boolean(matchedUserId && memberUserIds.has(matchedUserId));
  };

  const byCanonicalUser = new Map();
  canonicalStudents.forEach((item) => {
    if (memberUserIds.has(String(item?._id || ''))) return;
    const candidate = buildStudentCandidateFromUser(item);
    if (candidate.value) byCanonicalUser.set(String(candidate.value), candidate);
  });

  const studentCandidates = [...byCanonicalUser.values()];

  afghanStudents.forEach((item) => {
    const linkedId = item?.linkedUserId ? String(item.linkedUserId) : '';
    if (candidateHasCurrentMembership(item)) return;
    if (linkedId && byCanonicalUser.has(linkedId)) return;
    studentCandidates.push(buildStudentCandidateFromAfghanStudent(item));
  });

  onlineRegistrations.forEach((item) => {
    const linkedId = item?.linkedUserId ? String(item.linkedUserId) : '';
    if (candidateHasCurrentMembership(item)) return;
    if (linkedId && byCanonicalUser.has(linkedId)) return;
    studentCandidates.push(buildStudentCandidateFromEnrollment(item));
  });

  return {
    students: canonicalStudents,
    studentCandidates,
    onlineRegistrationQueue: onlineRegistrations
      .filter((item) => !candidateHasCurrentMembership(item))
      .map(buildOnlineQueueItem)
  };
};

const createCanonicalStudentUser = async ({
  sourceType = 'candidate',
  sourceId = '',
  name = '',
  email = '',
  grade = ''
} = {}) => {
  const normalizedName = normalizeText(name) || 'متعلم جدید';
  const normalizedGrade = normalizeStudentGrade(grade);
  let candidateEmail = normalizeText(email).toLowerCase();

  if (candidateEmail) {
    const existingByEmail = await User.findOne({ email: candidateEmail }).select('_id role');
    if (existingByEmail?._id && existingByEmail.role === 'student') {
      return existingByEmail;
    }
    if (existingByEmail?._id) {
      candidateEmail = '';
    }
  }

  const finalEmail = candidateEmail && isValidEmail(candidateEmail)
    ? candidateEmail
    : await buildPlaceholderStudentEmail({ sourceType, sourceId });
  const placeholderPassword = crypto.randomBytes(16).toString('hex');
  const password = await bcrypt.hash(placeholderPassword, 10);

  return User.create({
    name: normalizedName,
    email: finalEmail,
    password,
    role: 'student',
    grade: normalizedGrade
  });
};

const resolveCanonicalStudentUser = async (studentRef = '') => {
  const normalized = normalizeText(studentRef);
  if (!normalized) {
    return { error: 'انتخاب متعلم الزامی است.' };
  }

  if (mustObjectId(normalized)) {
    const user = await User.findById(normalized).select('_id role name email grade');
    if (!user || user.role !== 'student') {
      return { error: 'متعلم معتبر نیست.' };
    }
    return { user, studentId: String(user._id), sourceType: 'user' };
  }

  const [sourceType, rawSourceId] = normalized.split(':');
  const sourceId = normalizeText(rawSourceId);
  if (!mustObjectId(sourceId)) {
    return { error: 'متعلم معتبر نیست.' };
  }

  if (sourceType === 'user') {
    const user = await User.findById(sourceId).select('_id role name email grade');
    if (!user || user.role !== 'student') {
      return { error: 'متعلم معتبر نیست.' };
    }
    return { user, studentId: String(user._id), sourceType: 'user' };
  }

  if (sourceType === 'enrollment') {
    const sourceItem = await Enrollment.findById(sourceId);
    if (!sourceItem) return { error: 'درخواست ثبت‌نام آنلاین پیدا نشد.' };

    let user = null;
    if (sourceItem.linkedUserId) {
      user = await User.findById(sourceItem.linkedUserId).select('_id role name email grade');
    }

    if (!user && isValidEmail(sourceItem.email)) {
      user = await User.findOne({ email: sourceItem.email.toLowerCase(), role: 'student' }).select('_id role name email grade');
    }

    if (!user) {
      user = await createCanonicalStudentUser({
        sourceType,
        sourceId,
        name: sourceItem.studentName,
        email: sourceItem.email,
        grade: sourceItem.grade
      });
    }

    if (!sourceItem.linkedUserId || String(sourceItem.linkedUserId) !== String(user._id)) {
      sourceItem.linkedUserId = user._id;
      await sourceItem.save();
    }

    return { user, studentId: String(user._id), sourceType, sourceItem };
  }

  if (sourceType === 'afghan') {
    const sourceItem = await AfghanStudent.findById(sourceId);
    if (!sourceItem) return { error: 'متعلم ثبت‌شده پیدا نشد.' };

    let user = null;
    if (sourceItem.linkedUserId) {
      user = await User.findById(sourceItem.linkedUserId).select('_id role name email grade');
    }

    const contactEmail = normalizeText(sourceItem?.contactInfo?.email).toLowerCase();
    if (!user && isValidEmail(contactEmail)) {
      user = await User.findOne({ email: contactEmail, role: 'student' }).select('_id role name email grade');
    }

    if (!user) {
      const fullName = [
        sourceItem?.personalInfo?.firstNameDari || sourceItem?.personalInfo?.firstName || '',
        sourceItem?.personalInfo?.lastNameDari || sourceItem?.personalInfo?.lastName || ''
      ].filter(Boolean).join(' ').trim();

      user = await createCanonicalStudentUser({
        sourceType,
        sourceId,
        name: fullName,
        email: contactEmail,
        grade: sourceItem?.academicInfo?.currentGrade
      });
    }

    if (!sourceItem.linkedUserId || String(sourceItem.linkedUserId) !== String(user._id)) {
      sourceItem.linkedUserId = user._id;
      await sourceItem.save();
    }

    return { user, studentId: String(user._id), sourceType, sourceItem };
  }

  return { error: 'متعلم معتبر نیست.' };
};

const serializeInstructorSubjectMapping = (item, schoolClass = null) => {
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  return {
    ...plain,
    classId: schoolClass?.id || schoolClass?._id || plain.classId?._id || plain.classId || null,
    courseId: plain.course?._id || plain.course || null,
    schoolClass: schoolClass || null
  };
};

const populateInstructorSubjectMappings = (query) => query
  .populate('instructor', 'name email role')
  .populate('subject', 'name code grade')
  .populate('academicYear', 'title isActive')
  .populate('classId', 'title code gradeLevel section academicYearId legacyCourseId')
  .populate('course', 'title category');

const populateCanonicalTeacherMaps = (query) => query
  .populate('teacherUserId', 'name email role')
  .populate('subjectId', 'name code grade')
  .populate('academicYearId', 'title isActive status')
  .populate({
    path: 'classId',
    select: 'title code gradeLevel section academicYearId legacyCourseId schoolId',
    populate: { path: 'academicYearId', select: 'title isActive status' }
  });

const serializeCanonicalTeacherMap = (item) => {
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  const populatedClass = plain.classId && typeof plain.classId === 'object' ? plain.classId : null;
  const schoolClass = populatedClass ? {
    ...populatedClass,
    id: populatedClass._id || null,
    academicYear: populatedClass.academicYearId && typeof populatedClass.academicYearId === 'object'
      ? populatedClass.academicYearId
      : null
  } : null;
  return {
    ...plain,
    instructor: plain.teacherUserId || null,
    subject: plain.subjectId || null,
    academicYear: plain.academicYearId || schoolClass?.academicYear || null,
    classId: populatedClass?._id || plain.classId || null,
    courseId: plain.legacyCourseId || null,
    course: null,
    schoolClass,
    isPrimary: Boolean(plain.isPrimary),
    weeklyPeriods: Number(plain.weeklyPeriods || 1)
  };
};

const resolveCanonicalTeacherMapInput = async (payload = {}, current = null) => {
  const instructorId = normalizeText(payload.instructorId ?? current?.teacherUserId);
  const subjectId = normalizeText(payload.subjectId ?? current?.subjectId);
  const academicYearId = normalizeText(payload.academicYearId ?? current?.academicYearId);
  const classId = normalizeText(payload.classId ?? current?.classId);

  if (![instructorId, subjectId, academicYearId, classId].every(mustObjectId)) {
    return { error: 'استاد، مضمون، سال تعلیمی و صنف معتبر الزامی است.' };
  }

  const classRef = await resolveClassReference({ classId, syncLegacy: false });
  if (classRef.error || !classRef.schoolClass) {
    return { error: 'صنف معتبر نیست.' };
  }

  const [instructor, subject, academicYear] = await Promise.all([
    User.findById(instructorId).select('role status'),
    Subject.findById(subjectId).select('_id isActive'),
    AcademicYear.findById(academicYearId).select('_id schoolId')
  ]);

  if (!instructor || !['instructor', 'admin'].includes(instructor.role) || instructor.status === 'inactive') {
    return { error: 'استاد معتبر نیست.' };
  }
  if (!subject) return { error: 'مضمون معتبر نیست.' };
  if (!academicYear) return { error: 'سال تعلیمی معتبر نیست.' };

  const classYearId = String(classRef.schoolClass.academicYearId?._id || classRef.schoolClass.academicYearId || '');
  const classSchoolId = String(classRef.schoolClass.schoolId || '');
  if (classYearId !== String(academicYear._id)) {
    return { error: 'صنف مربوط به سال تعلیمی انتخاب‌شده نیست.' };
  }
  if (!classSchoolId || classSchoolId !== String(academicYear.schoolId || '')) {
    return { error: 'صنف و سال تعلیمی مربوط به یک مکتب نیستند.' };
  }

  const requestedWeeklyPeriods = Number(payload.weeklyPeriods ?? current?.weeklyPeriods ?? 1);
  const weeklyPeriods = Number.isFinite(requestedWeeklyPeriods)
    ? Math.max(1, Math.min(30, Math.round(requestedWeeklyPeriods)))
    : 1;

  return {
    data: {
      schoolId: classRef.schoolClass.schoolId,
      teacherUserId: instructor._id,
      academicYearId: academicYear._id,
      classId: classRef.schoolClass._id,
      subjectId: subject._id,
      weeklyPeriods,
      isPrimary: parseBool(payload.isPrimary ?? current?.isPrimary, false),
      note: normalizeText(payload.note ?? current?.note),
      assignmentType: current?.assignmentType || 'subject',
      status: 'active',
      source: current?.source || 'manual',
      legacyCourseId: current?.legacyCourseId || classRef.schoolClass.legacyCourseId || null
    }
  };
};

const findCanonicalTeacherMapDuplicate = (data = {}, excludeId = '') => {
  const filter = {
    schoolId: data.schoolId,
    teacherUserId: data.teacherUserId,
    academicYearId: data.academicYearId,
    classId: data.classId,
    subjectId: data.subjectId,
    status: { $in: ['planned', 'active', 'pending'] }
  };
  if (mustObjectId(excludeId)) filter._id = { $ne: excludeId };
  return TeacherAssignment.findOne(filter);
};

const buildLegacyCompatibleClassFilter = ({ classId = '', courseId = '' } = {}) => {
  const normalizedClassId = toNullableObjectId(classId);
  const normalizedCourseId = toNullableObjectId(courseId);
  if (normalizedClassId && normalizedCourseId) {
    return {
      $or: [
        { classId: normalizedClassId },
        { classId: null, course: normalizedCourseId }
      ]
    };
  }
  if (normalizedClassId) return { classId: normalizedClassId };
  if (normalizedCourseId) return { course: normalizedCourseId };
  return {};
};

const findInstructorSubjectDuplicate = ({ excludeId = '', instructorId = '', subjectId = '', academicYearId = '', classId = '', courseId = '' } = {}) => {
  const filter = {
    instructor: instructorId,
    subject: subjectId,
    academicYear: academicYearId || null,
    ...buildLegacyCompatibleClassFilter({ classId, courseId })
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return InstructorSubject.findOne(filter);
};

const enrollmentStatusToMembershipStatus = (value = '') => ({
  approved: 'active',
  active: 'active',
  transferred_in: 'transferred_in',
  transfer_in: 'transferred_in',
  pending: 'pending',
  rejected: 'rejected',
  dropped: 'dropped',
  dropout: 'dropped',
  transferred: 'transferred',
  transferred_out: 'transferred_out',
  transfer_out: 'transferred_out',
  graduated: 'graduated',
  suspended: 'suspended',
  expelled: 'expelled',
  inactive: 'inactive'
}[String(value || '').trim().toLowerCase()] || '');

const membershipStatusToEnrollmentStatus = (value = '') => ({
  active: 'approved',
  transferred_in: 'transferred_in',
  pending: 'pending',
  rejected: 'rejected',
  dropped: 'dropped',
  transferred: 'transferred',
  transferred_out: 'transferred_out',
  graduated: 'graduated',
  suspended: 'suspended',
  expelled: 'expelled',
  inactive: 'inactive'
}[String(value || '').trim().toLowerCase()] || 'approved');

const normalizeEnrollmentStatus = (value, fallback = 'approved') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return enrollmentStatusToMembershipStatus(normalized) ? normalized : '';
};

const populateStudentEnrollments = (query) => query
  .populate('student', 'name email grade')
  .populate('course', 'title category academicYearRef')
  .populate('classId', 'title code gradeLevel section academicYearId legacyCourseId')
  .populate('academicYear', 'title isActive')
  .populate('academicYearId', 'title isActive');

const serializeStudentEnrollment = (item, schoolClass = null) => ({
  _id: item._id,
  user: item.student || null,
  afghanStudentId: item.afghanStudentId || null,
  course: item.course || null,
  courseId: item.course?._id || item.course || null,
  classId: schoolClass?.id || schoolClass?._id || item.classId?._id || item.classId || null,
  schoolClass: schoolClass || null,
  academicYear: schoolClass?.academicYear || item.academicYear || item.academicYearId || null,
  status: membershipStatusToEnrollmentStatus(item.status),
  note: item.note || '',
  rejectedReason: item.rejectedReason || '',
  source: item.source || 'system',
  isCurrent: !!item.isCurrent,
  enrolledAt: item.enrolledAt || item.joinedAt || null,
  joinedAt: item.joinedAt || null,
  endedAt: item.endedAt || item.leftAt || null,
  leftAt: item.leftAt || null,
  endedReason: item.endedReason || '',
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
  legacyOrder: item.legacyOrder || null,
  previousMembershipId: item.previousMembershipId || null,
  admissionType: item.admissionType || 'regular',
  changeVersion: Number(item.changeVersion || 0)
});

const withManageContent = [
  requireAuth,
  requireRole(['admin']),
  requirePermission('manage_content')
];

const withEducationReferenceRead = [
  requireAuth,
  requireRole(['admin']),
  requireAnyPermission(['manage_content', 'manage_memberships', 'manage_users'])
];

const withManageMemberships = [
  requireAuth,
  requireRole(['admin']),
  requireAnyPermission(STUDENT_LIFECYCLE_MANAGE_PERMISSIONS)
];

const withManageStudentLifecycle = [
  requireAuth,
  requireRole(['admin']),
  requireAnyPermission(STUDENT_LIFECYCLE_MANAGE_PERMISSIONS)
];

const withInstructorManageContent = [
  requireAuth,
  requireRole(['admin', 'instructor']),
  requirePermission('manage_content')
];

const populateInstructorMemberships = (query) => query
  .populate('student', 'name email grade subject')
  .populate('course', 'title category academicYearRef')
  .populate('classId', 'title code gradeLevel section academicYearId legacyCourseId')
  .populate('academicYear', 'title isActive')
  .populate('academicYearId', 'title isActive');

const populateJoinRequests = (query) => query
  .populate('student', 'name email grade subject')
  .populate('course', 'title category academicYearRef');

const serializeJoinRequest = (item, schoolClass = null) => ({
  _id: item._id,
  user: item.student || null,
  course: item.course || null,
  courseId: item.course?._id || item.course || null,
  classId: schoolClass?.id || schoolClass?._id || null,
  schoolClass: schoolClass || null,
  academicYear: schoolClass?.academicYear || item.academicYear || item.course?.academicYearRef || null,
  status: item.status || 'pending',
  note: item.note || '',
  rejectedReason: item.rejectedReason || '',
  source: item.source || 'student',
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
  reviewedAt: item.reviewedAt || null,
  legacyOrder: item.legacyOrder || null
});

const serializeCourseAccessItem = (item, schoolClass = null) => {
  const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
  return {
    ...plain,
    courseId: plain._id || null,
    classId: schoolClass?.id || schoolClass?._id || plain.schoolClassRef?._id || plain.schoolClassRef || null,
    schoolClass: schoolClass || null
  };
};

const resolveClassReferenceFromIdentifier = async (identifier = '') => {
  const normalized = normalizeText(identifier);
  if (!mustObjectId(normalized)) {
    return { error: 'صنف معتبر الزامی است.' };
  }
  const byClass = await resolveClassReference({ classId: normalized });
  if (!byClass.error && (byClass.classId || byClass.courseId)) {
    return byClass;
  }
  return resolveClassReference({ courseId: normalized });
};

const getInstructorCourseIds = async (user) => {
  if (!user?.id) return [];
  if (user.role === 'admin') return null;
  if (user.role !== 'instructor') return [];
  const scheduleCourseIds = await Schedule.distinct('course', { instructor: user.id });
  let assignmentRows = [];
  try {
    assignmentRows = await TeacherAssignment.find({
      teacherUserId: user.id,
      status: { $in: ['active', 'planned', 'pending'] }
    }).select('legacyCourseId classId');
  } catch {
    assignmentRows = [];
  }

  const assignmentLegacyCourseIds = assignmentRows
    .map((item) => item?.legacyCourseId)
    .filter(Boolean);

  const classIds = assignmentRows
    .map((item) => item?.classId)
    .filter(Boolean);

  let classLinkedCourses = [];
  try {
    classLinkedCourses = classIds.length
      ? await Course.find({ schoolClassRef: { $in: classIds } }).select('_id')
      : [];
  } catch {
    classLinkedCourses = [];
  }
  const classCourseIds = classLinkedCourses.map((item) => item?._id).filter(Boolean);

  return Array.from(new Set(
    [...scheduleCourseIds, ...assignmentLegacyCourseIds, ...classCourseIds]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ));
};

const isCourseAllowedForInstructor = async (user, courseId) => {
  if (!courseId) return false;
  if (user?.role === 'admin') return true;
  const ids = await getInstructorCourseIds(user);
  return Array.isArray(ids) && ids.some((id) => String(id) === String(courseId));
};

const findActiveMembership = (studentId, courseId) => StudentMembership.findOne({
  student: studentId,
  course: courseId,
  status: { $in: ['active', 'transferred_in'] },
  isCurrent: true
});

const findOtherCurrentClassMembership = ({ schoolId = '', studentId, courseId, academicYearId = '' } = {}) => (
  StudentMembership.findOne(buildConcurrentCurrentMembershipFilter({
    schoolId,
    studentId,
    academicYearId,
    excludeCourseId: courseId
  })).sort({ updatedAt: -1, createdAt: -1 })
);

const activateInstructorMembership = async ({
  studentId,
  courseId,
  actorId = null,
  note = '',
  source = 'admin',
  legacyOrderId = null,
  joinedAt = null
} = {}) => {
  const classRef = await resolveClassReference({ courseId });
  if (classRef.error || !classRef.course) return null;
  const academicYearId = classRef.schoolClass?.academicYearId?._id
    || classRef.schoolClass?.academicYearId
    || classRef.course.academicYearRef
    || null;

  const conflictingMembership = await findOtherCurrentClassMembership({
    schoolId: classRef.schoolClass?.schoolId,
    studentId,
    courseId,
    academicYearId
  });
  if (conflictingMembership) {
    const error = new Error('این شاگرد در همین سال تعلیمی عضویت فعال صنف دیگری دارد.');
    error.code = 'CONCURRENT_CLASS_MEMBERSHIP';
    error.status = 409;
    throw error;
  }

  let item = await StudentMembership.findOne({ student: studentId, course: courseId, isCurrent: true })
    .sort({ updatedAt: -1, createdAt: -1 });

  if (!item) {
    const latest = await StudentMembership.findOne({ student: studentId, course: courseId })
      .sort({ updatedAt: -1, createdAt: -1 });
    item = latest || new StudentMembership({
      student: studentId,
      course: courseId,
      classId: classRef.classId || null,
      joinedAt: joinedAt || new Date()
    });
  }

  if (!item.isCurrent) {
    item.joinedAt = joinedAt || new Date();
  }

  item.student = studentId;
  item.course = courseId;
  item.classId = classRef.classId || null;
  item.academicYear = academicYearId || null;
  item.academicYearId = academicYearId || null;
  item.status = 'active';
  item.source = source;
  item.note = normalizeText(note);
  item.rejectedReason = '';
  item.legacyOrder = legacyOrderId || item.legacyOrder || null;
  if (actorId) item.createdBy = actorId;

  await item.save();
  return item;
};

const parseBool = (value, fallback = undefined) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (text === 'true' || text === '1' || text === 'yes') return true;
  if (text === 'false' || text === '0' || text === 'no') return false;
  return fallback;
};

const duplicateError = (res, message) => {
  return res.status(400).json({ success: false, message });
};

const academicYearDuplicateMessage = (error) => {
  const duplicateKeys = Object.keys(error?.keyPattern || {});
  const duplicateMessage = String(error?.errmsg || error?.message || '');

  if (duplicateKeys.includes('title') || duplicateMessage.includes('schoolId_1_title_1')) {
    return 'سال تعلیمی با همین عنوان از قبل ثبت شده است.';
  }
  if (duplicateKeys.includes('code') || duplicateMessage.includes('schoolId_1_code_1')) {
    return 'کد سال تعلیمی از قبل ثبت شده است.';
  }
  if (duplicateKeys.includes('isCurrent') || duplicateMessage.includes('schoolId_1_isCurrent_1')) {
    return 'در هر مکتب فقط یک سال تعلیمی می‌تواند فعال باشد.';
  }
  return 'ثبت سال تعلیمی با مقدار تکراری ناموفق بود.';
};

router.get('/meta', ...withEducationReferenceRead, async (req, res) => {
  try {
    const [courses, schoolClasses, instructors, studentCatalog, subjects, academicYears] = await Promise.all([
      Course.find().select('title category tags schoolClassRef').sort({ title: 1 }),
      populateSchoolClasses(SchoolClass.find({})).sort({ title: 1, createdAt: -1 }),
      User.find({ role: { $in: ['instructor', 'admin'] } }).select('name email role subject').sort({ name: 1 }),
      loadEducationStudentCatalog(),
      Subject.find().sort({ name: 1 }),
      AcademicYear.find().sort({ createdAt: -1 })
    ]);
    res.json({
      success: true,
      courses,
      schoolClasses: schoolClasses.map(serializeSchoolClass),
      instructors,
      students: studentCatalog.students || [],
      studentCandidates: studentCatalog.studentCandidates || [],
      onlineRegistrationQueue: studentCatalog.onlineRegistrationQueue || [],
      subjects,
      academicYears
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت داده‌های مرجع آموزش ناموفق بود.' });
  }
});

router.get('/school-classes', ...withEducationReferenceRead, async (req, res) => {
  try {
    const { academicYearId = '', schoolId = '', status = '', q = '' } = req.query || {};
    const filter = {};
    if (mustObjectId(schoolId)) filter.schoolId = schoolId;
    if (mustObjectId(academicYearId)) filter.academicYearId = academicYearId;
    if (status) filter.status = normalizeText(status);
    if (q) {
      const rx = new RegExp(normalizeText(q), 'i');
      filter.$or = [{ title: rx }, { code: rx }, { gradeLevel: rx }, { section: rx }, { room: rx }];
    }
    const items = await populateSchoolClasses(SchoolClass.find(filter)).sort({ title: 1, createdAt: -1 });
    res.json({ success: true, items: items.map(serializeSchoolClass) });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت صنف‌ها ناموفق بود.' });
  }
});

router.get('/public-school-classes', async (req, res) => {
  try {
    const {
      academicYearId = '',
      category = '',
      gradeLevel = '',
      section = '',
      q = '',
      page = 1,
      limit = 12,
      sort = 'newest'
    } = req.query || {};

    const filter = { status: 'active' };
    const effectiveGradeLevel = normalizeText(gradeLevel || category);
    if (mustObjectId(academicYearId)) filter.academicYearId = academicYearId;
    if (effectiveGradeLevel) filter.gradeLevel = effectiveGradeLevel;
    if (section) filter.section = normalizeText(section);
    if (q) {
      const rx = new RegExp(normalizeText(q), 'i');
      filter.$or = [{ title: rx }, { code: rx }, { gradeLevel: rx }, { section: rx }, { room: rx }];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
    const skip = (pageNum - 1) * limitNum;
    const sortMap = {
      newest: { createdAt: -1, title: 1 },
      title: { title: 1, createdAt: -1 },
      grade: { gradeLevel: 1, title: 1, createdAt: -1 }
    };

    const [rows, total] = await Promise.all([
      populateSchoolClasses(SchoolClass.find(filter)).sort(sortMap[sort] || sortMap.newest).skip(skip).limit(limitNum),
      SchoolClass.countDocuments(filter)
    ]);

    const items = [];
    for (const row of rows) {
      const legacyCourse = row.legacyCourseId?._id
        ? row.legacyCourseId
        : await syncLegacyCourseForSchoolClass(row);
      items.push(serializePublicSchoolClassCatalogItem(row, legacyCourse));
    }

    res.json({
      success: true,
      items,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch {
    res.status(500).json({ success: false, message: 'دریافت صنف‌های عمومی ناموفق بود.' });
  }
});

router.get('/public-school-classes/:identifier', async (req, res) => {
  try {
    const resolved = await resolvePublicSchoolClassCatalogItem(req.params.identifier);
    if (resolved.error) {
      return res.status(404).json({ success: false, message: resolved.error });
    }

    return res.json({
      success: true,
      item: resolved.item
    });
  } catch {
    return res.status(500).json({ success: false, message: 'دریافت جزئیات صنف عمومی ناموفق بود.' });
  }
});

router.post('/school-classes', ...withManageContent, async (req, res) => {
  try {
    const academicYearId = toNullableObjectId(req.body?.academicYearId);
    const homeroomTeacherUserId = toNullableObjectId(req.body?.homeroomTeacherUserId);
    const schoolId = await inferEducationSchoolId({ academicYearId, currentSchoolId: req.body?.schoolId });
    const normalizedCode = normalizeText(req.body?.code);
    const gradeLevel = normalizeGradeLevel(req.body?.gradeLevel, normalizedCode, req.body?.title);
    const section = normalizeClassSection(req.body?.section, normalizedCode, req.body?.title);
    const shift = normalizeShiftName(req.body?.shift);

    if (academicYearId) {
      const academicYear = await AcademicYear.findById(academicYearId).select('_id schoolId');
      if (!academicYear) return res.status(400).json({ success: false, message: 'سال تعلیمی انتخاب‌شده معتبر نیست.' });
    }
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'برای ساخت صنف، ابتدا یک سال تعلیمی یا مکتب معتبر با شناسه مکتب ثبت‌شده لازم است.' });
    }
    if (!gradeLevel) {
      return res.status(400).json({ success: false, message: 'پایه صنف را مشخص کنید یا در کد صنف به‌صورت درست وارد نمایید.' });
    }
    if (!section) {
      return res.status(400).json({ success: false, message: 'بخش صنف را مشخص کنید. نمونه‌های معتبر: الف، ب، ج.' });
    }
    if (homeroomTeacherUserId) {
      const teacher = await User.findById(homeroomTeacherUserId).select('role');
      if (!teacher || !['admin', 'instructor'].includes(teacher.role)) {
        return res.status(400).json({ success: false, message: 'استاد صنف معتبر نیست.' });
      }
    }

    const shiftId = await ensureShiftIdForSchoolClass({ schoolId, shiftName: shift });
    const titles = buildSchoolClassTitles({
      title: req.body?.title,
      gradeLevel,
      section
    });

    const item = await SchoolClass.create({
      schoolId,
      title: titles.title,
      titleDari: titles.titleDari,
      titlePashto: titles.titlePashto,
      code: normalizedCode,
      gradeLevel,
      section,
      academicYearId: academicYearId || null,
      shift,
      shiftId,
      genderType: normalizeGenderType(req.body?.genderType),
      capacity: normalizeCapacity(req.body?.capacity, 30),
      room: normalizeText(req.body?.room),
      classroomNumber: normalizeText(req.body?.classroomNumber || req.body?.room),
      status: normalizeText(req.body?.status) || 'active',
      homeroomTeacherUserId: homeroomTeacherUserId || null,
      note: normalizeText(req.body?.note)
    });

    await syncLegacyCourseForSchoolClass(item);
    const populated = await populateSchoolClasses(SchoolClass.findById(item._id));
    await logActivity({ req, action: 'create_school_class', targetType: 'SchoolClass', targetId: item._id.toString(), meta: { title: item.title } });
    res.status(201).json({ success: true, item: serializeSchoolClass(populated) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'صنفی با همین ترکیب سال تعلیمی، پایه و بخش از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ایجاد صنف ناموفق بود.' });
  }
});

router.put('/school-classes/:id', ...withManageContent, async (req, res) => {
  try {
    const item = await SchoolClass.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'صنف پیدا نشد.' });
    const academicYearId = req.body?.academicYearId !== undefined ? toNullableObjectId(req.body?.academicYearId) : (item.academicYearId ? String(item.academicYearId) : '');
    const homeroomTeacherUserId = req.body?.homeroomTeacherUserId !== undefined ? toNullableObjectId(req.body?.homeroomTeacherUserId) : (item.homeroomTeacherUserId ? String(item.homeroomTeacherUserId) : '');
    const schoolId = await inferEducationSchoolId({ academicYearId, currentSchoolId: req.body?.schoolId || item.schoolId });
    const nextCode = req.body?.code !== undefined ? normalizeText(req.body?.code) : normalizeText(item.code);
    const nextTitle = req.body?.title !== undefined ? normalizeText(req.body?.title) : normalizeText(item.title);
    const gradeLevel = normalizeGradeLevel(req.body?.gradeLevel, nextCode, nextTitle, item.gradeLevel);
    const section = normalizeClassSection(req.body?.section, nextCode, nextTitle, item.section, item.code, item.title);
    const shift = normalizeShiftName(req.body?.shift !== undefined ? req.body?.shift : item.shift);

    if (academicYearId) {
      const academicYear = await AcademicYear.findById(academicYearId).select('_id schoolId');
      if (!academicYear) return res.status(400).json({ success: false, message: 'سال تعلیمی انتخاب‌شده معتبر نیست.' });
    }
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'برای ویرایش صنف، مکتب معتبر قابل تشخیص نیست.' });
    }
    if (!gradeLevel) {
      return res.status(400).json({ success: false, message: 'پایه صنف معتبر نیست.' });
    }
    if (!section) {
      return res.status(400).json({ success: false, message: 'بخش صنف معتبر نیست.' });
    }
    if (homeroomTeacherUserId) {
      const teacher = await User.findById(homeroomTeacherUserId).select('role');
      if (!teacher || !['admin', 'instructor'].includes(teacher.role)) {
        return res.status(400).json({ success: false, message: 'استاد صنف معتبر نیست.' });
      }
    }

    const shiftId = await ensureShiftIdForSchoolClass({ schoolId, shiftName: shift });
    const titles = buildSchoolClassTitles({
      title: nextTitle,
      gradeLevel,
      section
    });

    item.schoolId = schoolId;
    item.title = titles.title;
    item.titleDari = titles.titleDari;
    item.titlePashto = titles.titlePashto;
    item.code = nextCode;
    item.gradeLevel = gradeLevel;
    item.section = section;
    if (req.body?.academicYearId !== undefined) item.academicYearId = academicYearId || null;
    item.shift = shift;
    item.shiftId = shiftId;
    item.genderType = normalizeGenderType(req.body?.genderType !== undefined ? req.body?.genderType : item.genderType);
    item.capacity = normalizeCapacity(req.body?.capacity !== undefined ? req.body?.capacity : item.capacity, item.capacity || 30);
    if (req.body?.room !== undefined) item.room = normalizeText(req.body?.room);
    if (req.body?.classroomNumber !== undefined || req.body?.room !== undefined) {
      item.classroomNumber = normalizeText(req.body?.classroomNumber || req.body?.room || item.classroomNumber);
    }
    if (req.body?.status !== undefined) item.status = normalizeText(req.body?.status) || item.status;
    if (req.body?.homeroomTeacherUserId !== undefined) item.homeroomTeacherUserId = homeroomTeacherUserId || null;
    if (req.body?.note !== undefined) item.note = normalizeText(req.body?.note);
    await item.save();

    await syncLegacyCourseForSchoolClass(item);
    const populated = await populateSchoolClasses(SchoolClass.findById(item._id));
    await logActivity({ req, action: 'update_school_class', targetType: 'SchoolClass', targetId: item._id.toString(), meta: { title: item.title } });
    res.json({ success: true, item: serializeSchoolClass(populated) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'صنفی با همین ترکیب سال تعلیمی، پایه و بخش از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ویرایش صنف ناموفق بود.' });
  }
});

router.delete('/school-classes/:id', ...withManageContent, async (req, res) => {
  try {
    const item = await SchoolClass.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'صنف پیدا نشد.' });
    const [activeMemberships, activeAssignments, linkedMappings] = await Promise.all([
      StudentMembership.countDocuments({ classId: item._id, isCurrent: true, status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] } }),
      TeacherAssignment.countDocuments({ classId: item._id, status: { $in: ['planned', 'active'] } }),
      InstructorSubject.countDocuments(item.legacyCourseId ? { $or: [{ classId: item._id }, { classId: null, course: item.legacyCourseId }] } : { classId: item._id })
    ]);
    if (activeMemberships || activeAssignments || linkedMappings) {
      return res.status(400).json({ success: false, message: 'این صنف به ثبت‌نام‌ها یا تقسیم‌ها وصل است. به‌جای حذف، آن را آرشیف کنید.' });
    }
    if (item.legacyCourseId) {
      await Course.findByIdAndUpdate(item.legacyCourseId, { $set: { isActive: false } });
    }
    await item.deleteOne();
    await logActivity({ req, action: 'delete_school_class', targetType: 'SchoolClass', targetId: req.params.id, meta: { legacyCourseId: String(item.legacyCourseId || '') } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, message: 'حذف صنف ناموفق بود.' });
  }
});
router.get('/subjects', ...withEducationReferenceRead, async (req, res) => {
  try {
    const { q = '', isActive = '' } = req.query || {};
    const filter = {};
    if (q) {
      const rx = new RegExp(String(q).trim(), 'i');
      filter.$or = [{ name: rx }, { code: rx }, { grade: rx }, { note: rx }];
    }
    const activeFilter = parseBool(isActive, undefined);
    if (activeFilter !== undefined) filter.isActive = activeFilter;
    const items = await Subject.find(filter).sort({ name: 1, grade: 1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت مضمون‌ها ناموفق بود.' });
  }
});

router.post('/subjects', ...withManageContent, async (req, res) => {
  try {
    const name = normalizeText(req.body?.name);
    if (!name) return res.status(400).json({ success: false, message: 'نام مضمون الزامی است.' });
    const code = normalizeText(req.body?.code).toUpperCase();
    if (!code) return res.status(400).json({ success: false, message: 'کد مضمون الزامی است.' });
    const schoolId = await inferEducationSchoolId({ currentSchoolId: req.body?.schoolId });
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'برای ساخت مضمون، ابتدا یک مکتب یا سال تعلیمی معتبر لازم است.' });
    }
    const grade = normalizeText(req.body?.grade);
    const gradeLevels = normalizeSubjectGradeLevels(req.body?.gradeLevels, grade);

    const payload = {
      schoolId,
      name,
      nameDari: normalizeText(req.body?.nameDari) || name,
      namePashto: normalizeText(req.body?.namePashto) || name,
      code,
      grade,
      gradeLevels,
      category: normalizeText(req.body?.category) || 'core',
      subjectType: normalizeText(req.body?.subjectType) || 'theoretical',
      note: normalizeText(req.body?.note),
      isActive: parseBool(req.body?.isActive, true),
      status: parseBool(req.body?.isActive, true) ? 'active' : 'inactive'
    };

    const item = await Subject.create(payload);
    await logActivity({
      req,
      action: 'create_subject',
      targetType: 'Subject',
      targetId: item._id.toString(),
      meta: { name: item.name, code: item.code }
    });
    res.status(201).json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'مضمونی با همین نام یا کد از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ایجاد مضمون ناموفق بود.' });
  }
});

router.put('/subjects/:id', ...withManageContent, async (req, res) => {
  try {
    const current = await Subject.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'مضمون پیدا نشد.' });

    const payload = {};
    if (req.body?.name !== undefined) {
      const name = normalizeText(req.body?.name);
      if (!name) return res.status(400).json({ success: false, message: 'نام مضمون الزامی است.' });
      payload.name = name;
      payload.nameDari = normalizeText(req.body?.nameDari) || name;
      payload.namePashto = normalizeText(req.body?.namePashto) || name;
    }
    if (req.body?.code !== undefined) {
      const code = normalizeText(req.body?.code).toUpperCase();
      if (!code) return res.status(400).json({ success: false, message: 'کد مضمون الزامی است.' });
      payload.code = code;
    }
    if (req.body?.grade !== undefined) {
      payload.grade = normalizeText(req.body?.grade);
      payload.gradeLevels = normalizeSubjectGradeLevels(req.body?.gradeLevels, req.body?.grade);
    } else if (req.body?.gradeLevels !== undefined) {
      payload.gradeLevels = normalizeSubjectGradeLevels(req.body?.gradeLevels, current.grade);
    }
    if (req.body?.note !== undefined) payload.note = normalizeText(req.body?.note);
    if (req.body?.category !== undefined) payload.category = normalizeText(req.body?.category) || current.category || 'core';
    if (req.body?.subjectType !== undefined) payload.subjectType = normalizeText(req.body?.subjectType) || current.subjectType || 'theoretical';
    if (req.body?.isActive !== undefined) {
      payload.isActive = parseBool(req.body?.isActive, true);
      payload.status = payload.isActive ? 'active' : 'inactive';
    }

    const item = await Subject.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true, runValidators: true });

    await logActivity({
      req,
      action: 'update_subject',
      targetType: 'Subject',
      targetId: item._id.toString(),
      meta: { name: item.name, code: item.code }
    });
    res.json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'مضمونی با همین نام یا کد از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ویرایش مضمون ناموفق بود.' });
  }
});

router.delete('/subjects/:id', ...withManageContent, async (req, res) => {
  try {
    const linked = await InstructorSubject.countDocuments({ subject: req.params.id });
    if (linked > 0) {
      return res.status(400).json({
        success: false,
        message: 'این مضمون به تقسیم‌های استاد وصل است. ابتدا تقسیم‌ها را حذف کنید.'
      });
    }
    const item = await Subject.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'مضمون پیدا نشد.' });

    await logActivity({
      req,
      action: 'delete_subject',
      targetType: 'Subject',
      targetId: item._id.toString(),
      meta: { name: item.name, code: item.code }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حذف مضمون ناموفق بود.' });
  }
});

router.get('/academic-years', ...withEducationReferenceRead, async (req, res) => {
  try {
    const items = await AcademicYear.find().sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت سال‌های تعلیمی ناموفق بود.' });
  }
});

router.post('/academic-years', ...withManageContent, async (req, res) => {
  try {
    const title = normalizeText(req.body?.title);
    const code = normalizeText(req.body?.code);
    const effectiveCode = code || title;
    if (!title) return res.status(400).json({ success: false, message: 'عنوان سال تعلیمی الزامی است.' });
    const schoolId = await inferEducationSchoolId({ currentSchoolId: req.body?.schoolId });
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'برای ساخت سال تعلیمی ابتدا یک مکتب معتبر یا صنف دارای مکتب ثبت‌شده لازم است.' });
    }

    const existingYear = await AcademicYear.findOne({ schoolId, title });
    if (existingYear) {
      return res.status(409).json({
        success: false,
        message: 'سال تعلیمی با همین عنوان از قبل ثبت شده است.',
        existingItem: existingYear
      });
    }
    if (effectiveCode) {
      const existingCodeYear = await AcademicYear.findOne({ schoolId, code: effectiveCode });
      if (existingCodeYear) {
        if (existingCodeYear.title === title) {
          return res.status(409).json({
            success: false,
            message: 'سال تعلیمی با همین عنوان از قبل ثبت شده است.',
            existingItem: existingCodeYear
          });
        }
        return res.status(409).json({
          success: false,
          message: 'کد سال تعلیمی از قبل ثبت شده است.',
          existingItem: existingCodeYear
        });
      }
    }

    const isActive = parseBool(req.body?.isActive, false);
    if (isActive) {
      await AcademicYear.updateMany({ schoolId }, { $set: { isActive: false, isCurrent: false } });
    }

    const item = await AcademicYear.create({
      schoolId,
      code: effectiveCode || undefined,
      title,
      startDate: normalizeText(req.body?.startDate),
      endDate: normalizeText(req.body?.endDate),
      note: normalizeText(req.body?.note),
      isActive,
      isCurrent: isActive
    });

    await logActivity({
      req,
      action: 'create_academic_year',
      targetType: 'AcademicYear',
      targetId: item._id.toString(),
      meta: { title: item.title, isActive: item.isActive }
    });

    res.status(201).json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) {
      const title = normalizeText(req.body?.title);
      const code = normalizeText(req.body?.code);
      const effectiveCode = code || title;
      const schoolId = await inferEducationSchoolId({ currentSchoolId: req.body?.schoolId });
      const existingYear = title && schoolId
        ? await AcademicYear.findOne({ schoolId, title })
        : effectiveCode && schoolId
          ? await AcademicYear.findOne({ schoolId, code: effectiveCode })
          : null;
      return res.status(409).json({
        success: false,
        message: academicYearDuplicateMessage(error),
        ...(existingYear ? { existingItem: existingYear } : {})
      });
    }
    res.status(500).json({ success: false, message: 'ایجاد سال تعلیمی ناموفق بود.' });
  }
});

router.put('/academic-years/:id', ...withManageContent, async (req, res) => {
  try {
    const existingYear = await AcademicYear.findById(req.params.id);
    if (!existingYear) return res.status(404).json({ success: false, message: 'سال تعلیمی پیدا نشد.' });
    const schoolId = await inferEducationSchoolId({ currentSchoolId: req.body?.schoolId || existingYear.schoolId });
    if (!schoolId) {
      return res.status(400).json({ success: false, message: 'برای ویرایش سال تعلیمی، مکتب معتبر قابل تشخیص نیست.' });
    }
    const payload = {};
    if (req.body?.code !== undefined) {
      const code = normalizeText(req.body?.code);
      if (code) {
        const duplicateCodeYear = await AcademicYear.findOne({
          schoolId,
          code,
          _id: { $ne: existingYear._id }
        });
        if (duplicateCodeYear) {
          return res.status(409).json({
            success: false,
            message: 'کد سال تعلیمی از قبل ثبت شده است.',
            existingItem: duplicateCodeYear
          });
        }
      }
      payload.code = code || undefined;
    }
    if (req.body?.title !== undefined) {
      const title = normalizeText(req.body?.title);
      if (!title) return res.status(400).json({ success: false, message: 'عنوان سال تعلیمی الزامی است.' });
      const duplicateYear = await AcademicYear.findOne({
        schoolId,
        title,
        _id: { $ne: existingYear._id }
      });
      if (duplicateYear) {
        return res.status(409).json({
          success: false,
          message: 'سال تعلیمی با همین عنوان از قبل ثبت شده است.',
          existingItem: duplicateYear
        });
      }
      payload.title = title;
    }
    if (req.body?.startDate !== undefined) payload.startDate = normalizeText(req.body?.startDate);
    if (req.body?.endDate !== undefined) payload.endDate = normalizeText(req.body?.endDate);
    if (req.body?.note !== undefined) payload.note = normalizeText(req.body?.note);
    if (req.body?.isActive !== undefined) {
      payload.isActive = parseBool(req.body?.isActive, false);
      payload.isCurrent = payload.isActive;
      if (payload.isActive) {
        await AcademicYear.updateMany({ schoolId, _id: { $ne: req.params.id } }, { $set: { isActive: false, isCurrent: false } });
      }
    }
    payload.schoolId = schoolId;

    const item = await AcademicYear.findByIdAndUpdate(req.params.id, { $set: payload }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'سال تعلیمی پیدا نشد.' });

    await logActivity({
      req,
      action: 'update_academic_year',
      targetType: 'AcademicYear',
      targetId: item._id.toString(),
      meta: { title: item.title, isActive: item.isActive }
    });
    res.json({ success: true, item });
  } catch (error) {
    if (error?.code === 11000) {
      const title = normalizeText(req.body?.title);
      const code = normalizeText(req.body?.code);
      const schoolId = await inferEducationSchoolId({ currentSchoolId: req.body?.schoolId });
      const duplicateYear = title && schoolId
        ? await AcademicYear.findOne({ schoolId, title, _id: { $ne: req.params.id } })
        : code && schoolId
          ? await AcademicYear.findOne({ schoolId, code, _id: { $ne: req.params.id } })
          : null;
      return res.status(409).json({
        success: false,
        message: academicYearDuplicateMessage(error),
        ...(duplicateYear ? { existingItem: duplicateYear } : {})
      });
    }
    res.status(500).json({ success: false, message: 'ویرایش سال تعلیمی ناموفق بود.' });
  }
});

router.delete('/academic-years/:id', ...withManageContent, async (req, res) => {
  try {
    const linked = await InstructorSubject.countDocuments({ academicYear: req.params.id });
    if (linked > 0) {
      return res.status(400).json({
        success: false,
        message: 'این سال تعلیمی به تقسیم‌های استاد وصل است. ابتدا تقسیم‌ها را حذف کنید.'
      });
    }

    const item = await AcademicYear.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'سال تعلیمی پیدا نشد.' });

    await logActivity({
      req,
      action: 'delete_academic_year',
      targetType: 'AcademicYear',
      targetId: item._id.toString(),
      meta: { title: item.title }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حذف سال تعلیمی ناموفق بود.' });
  }
});

// Canonical teacher-to-subject/class assignments used by education, timetable,
// attendance and exam sheets. The old instructor-subject routes remain below
// only for compatibility with legacy consumers.
router.get('/teacher-maps', ...withEducationReferenceRead, async (req, res) => {
  try {
    await ensureTeacherAssignmentsFromLegacyMappings();
    const { instructorId = '', subjectId = '', academicYearId = '', classId = '' } = req.query || {};
    const filter = { status: { $in: ['planned', 'active', 'pending'] } };
    if (mustObjectId(instructorId)) filter.teacherUserId = instructorId;
    if (mustObjectId(subjectId)) filter.subjectId = subjectId;
    if (mustObjectId(academicYearId)) filter.academicYearId = academicYearId;
    if (mustObjectId(classId)) filter.classId = classId;

    const items = await populateCanonicalTeacherMaps(TeacherAssignment.find(filter))
      .sort({ isPrimary: -1, createdAt: -1 });
    res.json({ success: true, items: items.map(serializeCanonicalTeacherMap) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت تخصیص‌های استاد ناموفق بود.' });
  }
});

router.post('/teacher-maps', ...withManageContent, async (req, res) => {
  try {
    const resolved = await resolveCanonicalTeacherMapInput(req.body || {});
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });

    const duplicate = await findCanonicalTeacherMapDuplicate(resolved.data);
    if (duplicate) return duplicateError(res, 'این تخصیص از قبل ثبت شده است.');

    const created = await TeacherAssignment.create(resolved.data);
    await logActivity({
      req,
      action: 'create_teacher_assignment_from_education_center',
      targetType: 'TeacherAssignment',
      targetId: String(created._id),
      meta: {
        teacherUserId: String(created.teacherUserId),
        subjectId: String(created.subjectId),
        academicYearId: String(created.academicYearId),
        classId: String(created.classId)
      }
    });

    const item = await populateCanonicalTeacherMaps(TeacherAssignment.findById(created._id));
    res.status(201).json({ success: true, item: serializeCanonicalTeacherMap(item) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'این تخصیص از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ایجاد تخصیص استاد ناموفق بود.' });
  }
});

router.put('/teacher-maps/:id', ...withManageContent, async (req, res) => {
  try {
    const current = await TeacherAssignment.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'تخصیص استاد پیدا نشد.' });

    const resolved = await resolveCanonicalTeacherMapInput(req.body || {}, current);
    if (resolved.error) return res.status(400).json({ success: false, message: resolved.error });
    const duplicate = await findCanonicalTeacherMapDuplicate(resolved.data, req.params.id);
    if (duplicate) return duplicateError(res, 'این تخصیص از قبل ثبت شده است.');

    current.set(resolved.data);
    await current.save();
    await logActivity({
      req,
      action: 'update_teacher_assignment_from_education_center',
      targetType: 'TeacherAssignment',
      targetId: String(current._id),
      meta: {
        teacherUserId: String(current.teacherUserId),
        subjectId: String(current.subjectId),
        academicYearId: String(current.academicYearId),
        classId: String(current.classId)
      }
    });

    const item = await populateCanonicalTeacherMaps(TeacherAssignment.findById(current._id));
    res.json({ success: true, item: serializeCanonicalTeacherMap(item) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'این تخصیص از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ویرایش تخصیص استاد ناموفق بود.' });
  }
});

router.delete('/teacher-maps/:id', ...withManageContent, async (req, res) => {
  try {
    const item = await TeacherAssignment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'تخصیص استاد پیدا نشد.' });

    item.status = 'ended';
    item.endedAt = new Date();
    await item.save();
    await logActivity({
      req,
      action: 'end_teacher_assignment_from_education_center',
      targetType: 'TeacherAssignment',
      targetId: String(item._id),
      meta: { endedAt: item.endedAt }
    });
    res.json({ success: true, message: 'تخصیص استاد ختم شد و سوابق قبلی آن محفوظ ماند.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ختم تخصیص استاد ناموفق بود.' });
  }
});

router.get('/instructor-subjects', ...withEducationReferenceRead, async (req, res) => {
  try {
    const { instructorId = '', subjectId = '', academicYearId = '', classId = '', courseId = '' } = req.query || {};
    const filter = {};
    if (mustObjectId(instructorId)) filter.instructor = instructorId;
    if (mustObjectId(subjectId)) filter.subject = subjectId;
    if (mustObjectId(academicYearId)) filter.academicYear = academicYearId;
    if (classId || courseId) {
      const classRef = await resolveClassReference({ classId, courseId });
      if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
      const classFilter = buildLegacyCompatibleClassFilter({ classId: classRef.classId, courseId: classRef.courseId });
      if (!Object.keys(classFilter).length) return res.json({ success: true, items: [] });
      Object.assign(filter, classFilter);
    }

    const items = await populateInstructorSubjectMappings(InstructorSubject.find(filter)).sort({ createdAt: -1 });

    const lookups = await buildSchoolClassLookups({
      classIds: items.map((item) => item.classId?._id || item.classId || ''),
      courseIds: items.map((item) => item.course?._id || item.course || '')
    });

    res.json({
      success: true,
      items: items.map((item) => serializeInstructorSubjectMapping(item, findSchoolClassForItem(item, lookups)))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'دریافت تقسیم‌های استاد ناموفق بود.' });
  }
});

router.post('/instructor-subjects', ...withManageContent, async (req, res) => {
  try {
    const instructorId = normalizeText(req.body?.instructorId);
    const subjectId = normalizeText(req.body?.subjectId);
    const requestedAcademicYearId = normalizeText(req.body?.academicYearId);
    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);

    if (!mustObjectId(instructorId) || !mustObjectId(subjectId)) {
      return res.status(400).json({ success: false, message: 'استاد و مضمون معتبر الزامی است.' });
    }
    if (requestedAcademicYearId && !mustObjectId(requestedAcademicYearId)) {
      return res.status(400).json({ success: false, message: 'Invalid academic year' });
    }
    if (classId && !mustObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class' });
    }
    if (courseId && !mustObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid class' });
    }

    const classRef = await resolveClassReference({ classId, courseId });
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    const resolvedAcademicYearId = requestedAcademicYearId || String(classRef.schoolClass?.academicYearId?._id || classRef.schoolClass?.academicYearId || '');

    const [instructor, subject, academicYear] = await Promise.all([
      User.findById(instructorId).select('role'),
      Subject.findById(subjectId).select('_id'),
      asObjectIdOrNull(resolvedAcademicYearId) ? AcademicYear.findById(resolvedAcademicYearId).select('_id') : null
    ]);

    if (!instructor || !['instructor', 'admin'].includes(instructor.role)) {
      return res.status(400).json({ success: false, message: 'Instructor is invalid' });
    }
    if (!subject) return res.status(400).json({ success: false, message: 'مضمون معتبر نیست.' });
    if (resolvedAcademicYearId && !academicYear) return res.status(400).json({ success: false, message: 'سال تعلیمی معتبر نیست.' });
    if ((classId || courseId) && (!classRef.classId || !classRef.course)) {
      return res.status(400).json({ success: false, message: 'Class is invalid' });
    }

    const existing = await findInstructorSubjectDuplicate({
      instructorId,
      subjectId,
      academicYearId: academicYear ? String(academicYear._id) : '',
      classId: classRef.classId,
      courseId: classRef.courseId
    });
    if (existing) {
      return duplicateError(res, 'این تقسیم از قبل ثبت شده است.');
    }

    const item = await InstructorSubject.create({
      instructor: instructorId,
      subject: subjectId,
      academicYear: academicYear ? academicYear._id : null,
      classId: classRef.classId || null,
      course: classRef.course ? classRef.course._id : null,
      note: normalizeText(req.body?.note),
      isPrimary: parseBool(req.body?.isPrimary, false)
    });

    await logActivity({
      req,
      action: 'create_instructor_subject',
      targetType: 'InstructorSubject',
      targetId: item._id.toString(),
      meta: {
        instructorId: String(instructorId),
        subjectId: String(subjectId),
        academicYearId: academicYear ? String(academicYear._id) : '',
        classId: classRef.classId || '',
        courseId: classRef.course ? String(classRef.course._id) : ''
      }
    });

    const populated = await populateInstructorSubjectMappings(InstructorSubject.findById(item._id));
    const schoolClass = classRef.classId ? await loadSerializedSchoolClassById(classRef.classId) : null;

    res.status(201).json({ success: true, item: serializeInstructorSubjectMapping(populated, schoolClass) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'این تقسیم از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ایجاد تقسیم مضمون ناموفق بود.' });
  }
});

router.put('/instructor-subjects/:id', ...withManageContent, async (req, res) => {
  try {
    const current = await InstructorSubject.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'Mapping not found' });

    const instructorId = req.body?.instructorId !== undefined ? normalizeText(req.body?.instructorId) : String(current.instructor);
    const subjectId = req.body?.subjectId !== undefined ? normalizeText(req.body?.subjectId) : String(current.subject);
    const requestedAcademicYearId = req.body?.academicYearId !== undefined
      ? normalizeText(req.body?.academicYearId)
      : (current.academicYear ? String(current.academicYear) : '');
    const classIdProvided = req.body?.classId !== undefined;
    const classId = classIdProvided ? normalizeText(req.body?.classId) : (current.classId ? String(current.classId) : '');
    const courseId = req.body?.courseId !== undefined
      ? normalizeText(req.body?.courseId)
      : (classIdProvided ? '' : (current.course ? String(current.course) : ''));

    if (!mustObjectId(instructorId) || !mustObjectId(subjectId)) {
      return res.status(400).json({ success: false, message: 'استاد و مضمون معتبر الزامی است.' });
    }
    if (requestedAcademicYearId && !mustObjectId(requestedAcademicYearId)) {
      return res.status(400).json({ success: false, message: 'Invalid academic year' });
    }
    if (classId && !mustObjectId(classId)) {
      return res.status(400).json({ success: false, message: 'Invalid class' });
    }
    if (courseId && !mustObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Invalid class' });
    }

    const classRef = await resolveClassReference({ classId, courseId });
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    const resolvedAcademicYearId = requestedAcademicYearId || String(classRef.schoolClass?.academicYearId?._id || classRef.schoolClass?.academicYearId || '');

    const [instructor, subject, academicYear] = await Promise.all([
      User.findById(instructorId).select('role'),
      Subject.findById(subjectId).select('_id'),
      resolvedAcademicYearId ? AcademicYear.findById(resolvedAcademicYearId).select('_id') : null
    ]);

    if (!instructor || !['instructor', 'admin'].includes(instructor.role)) {
      return res.status(400).json({ success: false, message: 'Instructor is invalid' });
    }
    if (!subject) return res.status(400).json({ success: false, message: 'مضمون معتبر نیست.' });
    if (resolvedAcademicYearId && !academicYear) return res.status(400).json({ success: false, message: 'سال تعلیمی معتبر نیست.' });
    if ((classId || courseId || current.classId || current.course) && (!classRef.classId || !classRef.course)) {
      return res.status(400).json({ success: false, message: 'Class is invalid' });
    }

    const duplicate = await findInstructorSubjectDuplicate({
      excludeId: req.params.id,
      instructorId,
      subjectId,
      academicYearId: academicYear ? String(academicYear._id) : '',
      classId: classRef.classId,
      courseId: classRef.courseId
    });
    if (duplicate) return duplicateError(res, 'این تقسیم از قبل ثبت شده است.');

    current.instructor = instructorId;
    current.subject = subjectId;
    current.academicYear = academicYear ? academicYear._id : null;
    current.classId = classRef.classId || null;
    current.course = classRef.course ? classRef.course._id : null;
    if (req.body?.note !== undefined) current.note = normalizeText(req.body?.note);
    if (req.body?.isPrimary !== undefined) current.isPrimary = parseBool(req.body?.isPrimary, false);
    await current.save();

    await logActivity({
      req,
      action: 'update_instructor_subject',
      targetType: 'InstructorSubject',
      targetId: current._id.toString(),
      meta: {
        instructorId: String(instructorId),
        subjectId: String(subjectId),
        academicYearId: academicYear ? String(academicYear._id) : '',
        classId: classRef.classId || '',
        courseId: classRef.course ? String(classRef.course._id) : ''
      }
    });

    const item = await populateInstructorSubjectMappings(InstructorSubject.findById(current._id));
    const schoolClass = classRef.classId ? await loadSerializedSchoolClassById(classRef.classId) : null;

    res.json({ success: true, item: serializeInstructorSubjectMapping(item, schoolClass) });
  } catch (error) {
    if (error?.code === 11000) return duplicateError(res, 'این تقسیم از قبل ثبت شده است.');
    res.status(500).json({ success: false, message: 'ویرایش تقسیم مضمون ناموفق بود.' });
  }
});

router.delete('/instructor-subjects/:id', ...withManageContent, async (req, res) => {
  try {
    const item = await InstructorSubject.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Mapping not found' });

    await logActivity({
      req,
      action: 'delete_instructor_subject',
      targetType: 'InstructorSubject',
      targetId: item._id.toString(),
      meta: {
        instructorId: String(item.instructor || ''),
        subjectId: String(item.subject || '')
      }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حذف تقسیم مضمون ناموفق بود.' });
  }
});

router.get('/my-courses', requireAuth, async (req, res) => {
  try {
    const items = await findAccessibleCourses(
      req.user,
      'title category kind gradeLevel section academicYearRef schoolClassRef',
      membershipAccessOptions
    );
    const lookups = await buildSchoolClassLookups({
      classIds: items.map((item) => item.schoolClassRef?._id || item.schoolClassRef || ''),
      courseIds: items.map((item) => item._id || '')
    });
    res.json({
      success: true,
      items: items.map((item) => serializeCourseAccessItem(item, findSchoolClassForItem({
        classId: item.schoolClassRef,
        course: item._id
      }, lookups)))
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load courses' });
  }
});

router.post('/join-requests', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can submit join requests' });
    }

    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);
    const note = normalizeText(req.body?.note);
    if (!mustObjectId(classId) && !mustObjectId(courseId)) {
      return res.status(400).json({ success: false, message: 'Valid class is required' });
    }

    const classRef = await resolveClassReference({ classId, courseId });
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    if (!classRef.course) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const nextCourseId = String(classRef.course._id);
    const activeMembership = await findActiveMembership(req.user.id, nextCourseId);
    if (activeMembership) {
      return res.status(400).json({ success: false, message: 'Student already has an active membership in this class' });
    }

    const pending = await CourseJoinRequest.findOne({ student: req.user.id, course: nextCourseId, status: 'pending' });
    if (pending) {
      return res.status(400).json({ success: false, message: 'A pending join request already exists for this class' });
    }

    const item = await CourseJoinRequest.create({
      student: req.user.id,
      course: nextCourseId,
      academicYear: classRef.course.academicYearRef || classRef.schoolClass?.academicYearId || null,
      status: 'pending',
      source: 'student',
      note,
      createdBy: req.user.id || null
    });

    const instructorIds = await Schedule.distinct('instructor', { course: nextCourseId });
    if (Array.isArray(instructorIds) && instructorIds.length) {
      await UserNotification.insertMany(
        instructorIds
          .filter(Boolean)
          .map((instructorId) => ({
            user: instructorId,
            title: 'New class join request',
            message: 'A student submitted a join request for "' + (classRef.schoolClass?.title || classRef.course.title || 'class') + '".',
            type: 'course_request'
          }))
      );
    }

    await logActivity({
      req,
      action: 'student_join_request',
      targetType: 'CourseJoinRequest',
      targetId: item._id.toString(),
      meta: { classId: classRef.classId || '', courseId: nextCourseId }
    });

    res.status(201).json({ success: true, item: serializeJoinRequest(item, classRef.schoolClass ? serializeSchoolClass(classRef.schoolClass) : null), message: 'Join request submitted' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'A pending join request already exists for this class' });
    }
    res.status(500).json({ success: false, message: 'Failed to submit join request' });
  }
});

router.get('/instructor/courses', ...withInstructorManageContent, async (req, res) => {
  try {
    const courseIds = await getInstructorCourseIds(req.user);
    const filter = Array.isArray(courseIds) ? { _id: { $in: courseIds } } : {};
    const items = await Course.find(filter).select('title category tags schoolClassRef academicYearRef').sort({ title: 1 });
    const lookups = await buildSchoolClassLookups({
      classIds: items.map((item) => item.schoolClassRef?._id || item.schoolClassRef || ''),
      courseIds: items.map((item) => item._id || '')
    });
    res.json({
      success: true,
      items: items.map((item) => serializeCourseAccessItem(item, findSchoolClassForItem({
        classId: item.schoolClassRef,
        course: item._id
      }, lookups)))
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load instructor courses' });
  }
});

router.get('/instructor/join-requests', ...withInstructorManageContent, async (req, res) => {
  try {
    const courseIds = await getInstructorCourseIds(req.user);
    if (Array.isArray(courseIds) && !courseIds.length) {
      return res.json({ success: true, items: [] });
    }

    const filter = { status: 'pending' };
    if (Array.isArray(courseIds)) {
      filter.course = { $in: courseIds };
    }

    const items = await populateJoinRequests(CourseJoinRequest.find(filter)).sort({ createdAt: -1 });
    const lookups = await buildSchoolClassLookups({
      courseIds: items.map((item) => item.course?._id || item.course || '')
    });
    res.json({
      success: true,
      items: items.map((item) => serializeJoinRequest(item, findSchoolClassForItem({ course: item.course }, lookups)))
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load join requests' });
  }
});

router.post('/instructor/join-requests/:id/approve', ...withInstructorManageContent, async (req, res) => {
  try {
    const item = await populateJoinRequests(CourseJoinRequest.findById(req.params.id));
    if (!item) return res.status(404).json({ success: false, message: 'Join request not found' });
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Join request is not pending' });
    }

    const allowed = await isCourseAllowedForInstructor(req.user, item.course?._id || item.course);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Class is not assigned to this instructor' });
    }

    await activateInstructorMembership({
      studentId: item.student?._id || item.student,
      courseId: item.course?._id || item.course,
      actorId: req.user?.id || null,
      note: 'approved_by_instructor',
      source: 'system',
      joinedAt: item.createdAt || new Date()
    });

    item.status = 'approved';
    item.rejectedReason = '';
    item.reviewedBy = req.user?.id || null;
    item.reviewedAt = new Date();
    await item.save();

    await UserNotification.create({
      user: item.student?._id || item.student,
      title: 'Join request approved',
      message: 'Your membership in "' + (item.course?.title || 'class') + '" was approved.',
      type: 'course_request'
    });

    await logActivity({
      req,
      action: 'instructor_approve_join_request',
      targetType: 'CourseJoinRequest',
      targetId: item._id.toString()
    });

    res.json({ success: true, message: 'Join request approved' });
  } catch (error) {
    if (error?.code === 'CONCURRENT_CLASS_MEMBERSHIP') {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to approve join request' });
  }
});

router.post('/instructor/join-requests/:id/reject', ...withInstructorManageContent, async (req, res) => {
  try {
    const item = await populateJoinRequests(CourseJoinRequest.findById(req.params.id));
    if (!item) return res.status(404).json({ success: false, message: 'Join request not found' });
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Join request is not pending' });
    }

    const allowed = await isCourseAllowedForInstructor(req.user, item.course?._id || item.course);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Class is not assigned to this instructor' });
    }

    const reason = normalizeText(req.body?.reason) || 'Rejected by instructor';
    item.status = 'rejected';
    item.rejectedReason = reason;
    item.reviewedBy = req.user?.id || null;
    item.reviewedAt = new Date();
    await item.save();

    await UserNotification.create({
      user: item.student?._id || item.student,
      title: 'Join request rejected',
      message: 'Your join request for "' + (item.course?.title || 'class') + '" was rejected. ' + (reason ? 'Reason: ' + reason : ''),
      type: 'course_request'
    });

    await logActivity({
      req,
      action: 'instructor_reject_join_request',
      targetType: 'CourseJoinRequest',
      targetId: item._id.toString(),
      meta: { reason }
    });

    res.json({ success: true, message: 'Join request rejected' });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to reject join request' });
  }
});

router.get('/instructor/course-students', ...withInstructorManageContent, async (req, res) => {
  try {
    const classId = normalizeText(req.query?.classId);
    const courseId = normalizeText(req.query?.courseId);
    const courseIds = await getInstructorCourseIds(req.user);
    if (Array.isArray(courseIds) && !courseIds.length) {
      return res.json({ success: true, items: [] });
    }

    const filter = { status: { $in: ['active', 'transferred_in'] }, isCurrent: true };
    if (classId || courseId) {
      const classRef = await resolveClassReference({ classId, courseId });
      if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
      if (!classRef.courseId) return res.json({ success: true, items: [] });
      if (Array.isArray(courseIds) && !courseIds.some((id) => String(id) === String(classRef.courseId))) {
        return res.status(403).json({ success: false, message: 'Class is not assigned to this instructor' });
      }
      filter.course = classRef.courseId;
    } else if (Array.isArray(courseIds)) {
      filter.course = { $in: courseIds };
    }

    const items = await populateInstructorMemberships(StudentMembership.find(filter)).sort({ joinedAt: -1, createdAt: -1 });
    const lookups = await buildSchoolClassLookups({
      classIds: items.map((item) => item.classId?._id || item.classId || ''),
      courseIds: items.map((item) => item.course?._id || item.course || '')
    });
    res.json({
      success: true,
      items: items.map((item) => serializeStudentEnrollment(item, findSchoolClassForItem(item, lookups)))
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load course students' });
  }
});

router.post('/instructor/course-students', ...withInstructorManageContent, async (req, res) => {
  try {
    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);
    const studentId = normalizeText(req.body?.studentId);
    if ((!mustObjectId(classId) && !mustObjectId(courseId)) || !mustObjectId(studentId)) {
      return res.status(400).json({ success: false, message: 'Valid class and student are required' });
    }

    const classRef = await resolveClassReference({ classId, courseId });
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    if (!classRef.course) {
      return res.status(400).json({ success: false, message: 'Class is invalid' });
    }

    const allowed = await isCourseAllowedForInstructor(req.user, classRef.courseId);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Class is not assigned to this instructor' });
    }

    const student = await User.findById(studentId).select('name role');
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const existing = await findActiveMembership(studentId, classRef.courseId);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Student already has an active membership in this class' });
    }

    const pendingRequest = await CourseJoinRequest.findOne({ student: studentId, course: classRef.courseId, status: 'pending' }).sort({ createdAt: -1 });

    let item = null;
    if (pendingRequest) {
      item = await activateInstructorMembership({
        studentId,
        courseId: classRef.courseId,
        actorId: req.user?.id || null,
        note: 'added_by_instructor',
        source: 'system',
        joinedAt: pendingRequest.createdAt || new Date()
      });

      pendingRequest.status = 'approved';
      pendingRequest.rejectedReason = '';
      pendingRequest.reviewedBy = req.user?.id || null;
      pendingRequest.reviewedAt = new Date();
      await pendingRequest.save();
    } else {
      item = await activateInstructorMembership({
        studentId,
        courseId: classRef.courseId,
        actorId: req.user?.id || null,
        note: 'added_by_instructor',
        source: 'admin'
      });
    }

    await UserNotification.create({
      user: studentId,
      title: 'Class membership activated',
      message: 'You were added to the class roster by your instructor.',
      type: 'course_request'
    });

    await logActivity({
      req,
      action: 'instructor_add_student_to_course',
      targetType: 'StudentMembership',
      targetId: item?._id ? item._id.toString() : '',
      meta: { studentId: String(studentId), classId: classRef.classId || '', courseId: String(classRef.courseId || '') }
    });

    const populated = item?._id ? await populateInstructorMemberships(StudentMembership.findById(item._id)) : null;
    const schoolClass = classRef.classId ? await loadSerializedSchoolClassById(classRef.classId) : null;
    res.status(201).json({ success: true, item: populated ? serializeStudentEnrollment(populated, schoolClass) : null, message: 'Student added to class' });
  } catch (error) {
    if (error?.code === 'CONCURRENT_CLASS_MEMBERSHIP') {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Failed to add student to class' });
  }
});

router.delete('/instructor/course-students/:id', ...withInstructorManageContent, async (req, res) => {
  try {
    const item = await populateInstructorMemberships(StudentMembership.findById(req.params.id));
    if (!item) {
      return res.status(404).json({ success: false, message: 'Membership not found' });
    }
    if (!item.isCurrent || !['active', 'transferred_in'].includes(item.status)) {
      return res.status(400).json({ success: false, message: 'Only active memberships can be removed' });
    }

    const allowed = await isCourseAllowedForInstructor(req.user, item.course?._id || item.course);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Class is not assigned to this instructor' });
    }

    return res.status(409).json({
      success: false,
      code: 'student_removal_requires_lifecycle_action',
      message: 'ختم ثبت صنفی شاگرد باید توسط مدیریت و از بخش تغییر وضعیت تعلیمی شاگرد ثبت شود.'
    });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to remove student from class' });
  }
});

router.get('/course-access-status/:identifier', requireAuth, async (req, res) => {
  try {
    if (req.user?.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Only students can check course access status' });
    }

    const classRef = await resolveClassReferenceFromIdentifier(req.params?.identifier);
    if (classRef.error) {
      return res.status(400).json({ success: false, message: classRef.error });
    }
    if (!classRef.course) {
      return res.status(404).json({ success: false, message: 'Class not found' });
    }

    const membership = await StudentMembership.findOne({
      student: req.user.id,
      course: classRef.courseId,
      isCurrent: true,
      status: { $in: ['active', 'transferred_in', 'pending', 'suspended'] }
    }).sort({ updatedAt: -1, createdAt: -1 });

    const pendingRequest = membership
      ? null
      : await CourseJoinRequest.findOne({
        student: req.user.id,
        course: classRef.courseId,
        status: 'pending'
      }).sort({ createdAt: -1 });

    const status = membership
      ? membershipStatusToEnrollmentStatus(membership.status)
      : (pendingRequest ? 'pending' : '');
    const schoolClass = classRef.classId ? await loadSerializedSchoolClassById(classRef.classId) : null;

    res.json({
      success: true,
      status,
      classId: classRef.classId || null,
      courseId: classRef.courseId || null,
      schoolClass,
      membershipId: membership?._id || null,
      pendingRequestId: pendingRequest?._id || null,
      hasActiveMembership: status === 'approved',
      hasPendingRequest: status === 'pending'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load course access status' });
  }
});

router.get('/student-enrollments', ...withManageMemberships, async (req, res) => {
  try {
    const { status = '', studentId = '', classId = '', courseId = '' } = req.query || {};
    const filter = {};
    const normalizedStatus = normalizeEnrollmentStatus(status, '');
    if (normalizedStatus) {
      filter.status = enrollmentStatusToMembershipStatus(normalizedStatus);
    } else {
      filter.status = { $in: ALL_STUDENT_MEMBERSHIP_STATUSES };
    }
    if (mustObjectId(studentId)) filter.student = studentId;
    if (classId) {
      const classRef = await resolveClassReference({ classId, courseId });
      if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
      if (!classRef.classId) return res.json({ success: true, items: [] });
      filter.classId = classRef.classId;
    } else if (mustObjectId(courseId)) {
      filter.course = courseId;
    }

    const items = await populateStudentEnrollments(StudentMembership.find(filter))
      .sort({ updatedAt: -1, createdAt: -1 });
    const lookups = await buildSchoolClassLookups({
      classIds: items.map((item) => item.classId?._id || item.classId || ''),
      courseIds: items.map((item) => item.course?._id || item.course || '')
    });

    res.json({
      success: true,
      items: items.map((item) => serializeStudentEnrollment(item, findSchoolClassForItem(item, lookups)))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load enrollments' });
  }
});

router.post('/student-enrollments', ...withManageMemberships, async (req, res) => {
  try {
    const studentIdInput = normalizeText(req.body?.studentId);
    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);
    const normalizedStatus = normalizeEnrollmentStatus(req.body?.status, 'approved');
    const membershipStatus = enrollmentStatusToMembershipStatus(normalizedStatus);
    const note = normalizeText(req.body?.note);
    const rejectedReason = normalizedStatus === 'rejected'
      ? (normalizeText(req.body?.rejectedReason) || 'rejected_by_admin')
      : '';

    if (membershipStatus === 'transferred_in') {
      return res.status(400).json({
        success: false,
        code: 'student_transfer_in_requires_lifecycle_endpoint',
        message: 'تبدیلی آمد باید از بخش تغییر وضعیت تعلیمی شاگرد ثبت شود.'
      });
    }

    if (!studentIdInput || (!mustObjectId(classId) && !mustObjectId(courseId)) || !membershipStatus) {
      return res.status(400).json({ success: false, message: 'متعلم و صنف معتبر الزامی است.' });
    }

    const [resolvedStudent, classRef] = await Promise.all([
      resolveCanonicalStudentUser(studentIdInput),
      resolveClassReference({ classId, courseId })
    ]);
    if (resolvedStudent?.error) {
      return res.status(400).json({ success: false, message: resolvedStudent.error });
    }
    const studentId = resolvedStudent.studentId;
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    if (!classRef.course) return res.status(400).json({ success: false, message: 'صنف معتبر نیست.' });

    const nextCourseId = String(classRef.course._id);
    const nextClassId = classRef.classId || '';
    const nextAcademicYearId = classRef.schoolClass?.academicYearId?._id || classRef.schoolClass?.academicYearId || classRef.course.academicYearRef || null;

    const currentItem = await StudentMembership.findOne({ student: studentId, course: nextCourseId, isCurrent: true })
      .sort({ updatedAt: -1, createdAt: -1 });
    const currentStudentMembership = currentItem || await StudentMembership.findOne({
      student: studentId,
      isCurrent: true,
      status: { $in: CURRENT_STUDENT_MEMBERSHIP_STATUSES }
    }).sort({ updatedAt: -1, createdAt: -1 });
    if (currentStudentMembership && String(currentStudentMembership.course || '') !== String(nextCourseId)) {
      return res.status(409).json({
        success: false,
        message: 'این متعلم قبلاً ممبرشیپ فعال دارد و باید از دفتر ممبرشیپ‌ها مدیریت شود.'
      });
    }
    const latestRejected = !currentItem && membershipStatus === 'rejected'
      ? await StudentMembership.findOne({ student: studentId, course: nextCourseId, status: 'rejected' })
        .sort({ updatedAt: -1, createdAt: -1 })
      : null;

    let item = currentItem || latestRejected;
    const isUpdate = !!item;

    if (!item) {
      item = new StudentMembership({
        student: studentId,
        course: nextCourseId,
        classId: nextClassId || null,
        joinedAt: new Date()
      });
    }

    if ((membershipStatus === 'active' || membershipStatus === 'pending') && !currentItem) {
      item.joinedAt = new Date();
    }

    item.student = studentId;
    item.course = nextCourseId;
    item.classId = nextClassId || null;
    item.academicYear = nextAcademicYearId || null;
    item.academicYearId = nextAcademicYearId || null;
    item.status = membershipStatus;
    item.source = 'admin';
    item.note = note;
    item.rejectedReason = rejectedReason;
    if (req.user?.id) item.createdBy = req.user.id;

    await item.save();
    const admissionBilling = null;

    const profileResult = await ensureAfghanStudentProfile({
      source: 'teaching_enrollment',
      user: resolvedStudent.user,
      enrollment: resolvedStudent.sourceType === 'enrollment' ? resolvedStudent.sourceItem : null,
      schoolId: classRef.schoolClass?.schoolId || null,
      schoolClass: classRef.schoolClass || null,
      academicYearId: nextAcademicYearId,
      actorId: req.user?.id || null,
      defaults: {
        fullName: resolvedStudent.user?.name || '',
        email: resolvedStudent.user?.email || '',
        classId: nextClassId || null,
        academicYearId: nextAcademicYearId || null,
        note: 'ساخته/وصل شده از ثبت تدریسی'
      }
    });
    if (profileResult?.student?._id && String(item.afghanStudentId || '') !== String(profileResult.student._id)) {
      item.afghanStudentId = profileResult.student._id;
      await item.save();
    }

    await logActivity({
      req,
      action: isUpdate ? 'update_student_enrollment' : 'create_student_enrollment',
      targetType: 'StudentMembership',
      targetId: item._id.toString(),
      meta: {
        studentId: String(studentId),
        classId: nextClassId || '',
        courseId: String(nextCourseId),
        status: normalizedStatus
      }
    });

    const populated = await populateStudentEnrollments(StudentMembership.findById(item._id));
    const schoolClass = nextClassId ? await loadSerializedSchoolClassById(nextClassId) : null;
    res.status(isUpdate ? 200 : 201).json({
      success: true,
      admissionBilling: admissionBilling ? {
        created: admissionBilling.created === true,
        reason: admissionBilling.reason || '',
        billId: admissionBilling.bill?._id || null,
        billNumber: admissionBilling.bill?.billNumber || '',
        amount: Number(admissionBilling.bill?.amountOriginal || 0)
      } : null,
      item: serializeStudentEnrollment(populated, schoolClass),
      message: admissionBilling?.created
        ? `ثبت‌نام متعلم ذخیره شد و بل داخله ${admissionBilling.bill?.billNumber || ''} صادر گردید.`
        : 'ثبت‌نام متعلم ذخیره شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ذخیره ثبت‌نام متعلم ناموفق بود.' });
  }
});

router.post('/student-enrollments/lifecycle', ...withManageStudentLifecycle, async (req, res) => {
  try {
    const action = normalizeText(req.body?.action).toLowerCase();
    if (!SUPPORTED_STUDENT_LIFECYCLE_ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, message: 'نوع تغییر وضعیت تعلیمی شاگرد معتبر نیست.' });
    }

    const lifecyclePayload = {
      ...(req.body || {}),
      action,
      effectiveAt: req.body?.effectiveDate || req.body?.effectiveAt || new Date()
    };

    if (action === 'transfer_in') {
      const studentIdInput = normalizeText(req.body?.studentId);
      const classId = normalizeText(req.body?.classId);
      const courseId = normalizeText(req.body?.courseId);
      if (!studentIdInput || (!mustObjectId(classId) && !mustObjectId(courseId))) {
        return res.status(400).json({ success: false, message: 'برای تبدیلی آمد، شاگرد و صنف الزامی است.' });
      }
      const [resolvedStudent, classRef] = await Promise.all([
        resolveCanonicalStudentUser(studentIdInput),
        resolveClassReference({ classId, courseId })
      ]);
      if (resolvedStudent?.error) return res.status(400).json({ success: false, message: resolvedStudent.error });
      if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
      if (!classRef.course || !classRef.classId) {
        return res.status(400).json({ success: false, message: 'صنف معتبر نیست.' });
      }
      lifecyclePayload.studentId = resolvedStudent.studentId;
      lifecyclePayload.courseId = String(classRef.course._id);
      lifecyclePayload.classId = classRef.classId;
      lifecyclePayload.academicYearId = classRef.schoolClass?.academicYearId?._id
        || classRef.schoolClass?.academicYearId
        || classRef.course.academicYearRef
        || null;
      lifecyclePayload.schoolId = classRef.schoolClass?.schoolId || null;
    } else if (!mustObjectId(req.body?.membershipId)) {
      return res.status(400).json({ success: false, message: 'عضویت شاگرد را انتخاب کنید.' });
    }

    const result = await executeStudentLifecycleAction(lifecyclePayload, {
      actor: {
        id: req.user?.id || null,
        role: req.user?.role || '',
        orgRole: req.user?.orgRole || ''
      },
      request: {
        ip: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers?.['user-agent'] || '',
        clientDevice: '',
        httpMethod: req.method,
        route: req.originalUrl || req.url || '',
        reason: req.body?.reason || req.body?.note || ''
      }
    });

    const populated = await populateStudentEnrollments(StudentMembership.findById(result.membership._id));
    const schoolClass = result.membership.classId
      ? await loadSerializedSchoolClassById(result.membership.classId)
      : null;
    return res.json({
      success: true,
      stoppedFutureBills: result.stoppedFutureBills,
      admissionBilling: result.admissionBilling ? {
        created: result.admissionBilling.created === true,
        reason: result.admissionBilling.reason || '',
        billId: result.admissionBilling.bill?._id || null,
        billNumber: result.admissionBilling.bill?.billNumber || '',
        amount: Number(result.admissionBilling.bill?.amountOriginal || 0)
      } : null,
      lifecycleEventId: result.event?._id || null,
      lifecycleDocument: {
        type: result.documentType,
        id: result.document?._id || null
      },
      item: serializeStudentEnrollment(populated, schoolClass),
      message: 'تغییر وضعیت تعلیمی شاگرد به‌شکل یک‌پارچه ثبت شد.'
    });
  } catch (error) {
    const status = Number(error?.status || 0) || (error?.code === 11000 ? 409 : 500);
    return res.status(status).json({
      success: false,
      code: error?.code || '',
      message: error?.message || 'ثبت تغییر وضعیت تعلیمی شاگرد موفق نبود.'
    });
  }
});

router.get('/student-enrollments/:membershipId/lifecycle-history', ...withManageStudentLifecycle, async (req, res) => {
  try {
    const data = await getStudentLifecycleHistory(req.params.membershipId);
    if (!data) return res.status(404).json({ success: false, message: 'عضویت شاگرد پیدا نشد.' });
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(Number(error?.status || 500)).json({
      success: false,
      code: error?.code || '',
      message: error?.message || 'دریافت سوانح تعلیمی شاگرد موفق نبود.'
    });
  }
});

router.put('/student-enrollments/:id', ...withManageMemberships, async (req, res) => {
  try {
    const item = await StudentMembership.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'ثبت‌نام پیدا نشد.' });

    const nextStudentRef = req.body?.studentId !== undefined ? normalizeText(req.body.studentId) : String(item.student || '');
    const nextClassIdProvided = req.body?.classId !== undefined;
    const nextClassIdInput = nextClassIdProvided ? normalizeText(req.body.classId) : String(item.classId || '');
    const nextCourseIdInput = req.body?.courseId !== undefined
      ? normalizeText(req.body.courseId)
      : (nextClassIdProvided ? '' : String(item.course || ''));
    const normalizedStatus = req.body?.status !== undefined
      ? normalizeEnrollmentStatus(req.body.status, '')
      : membershipStatusToEnrollmentStatus(item.status);
    const membershipStatus = enrollmentStatusToMembershipStatus(normalizedStatus);

    if (LIFECYCLE_ONLY_MEMBERSHIP_STATUSES.includes(membershipStatus) && membershipStatus !== item.status) {
      return res.status(400).json({
        success: false,
        code: 'student_status_change_requires_lifecycle_endpoint',
        message: 'این تغییر باید از بخش تغییر وضعیت تعلیمی شاگرد ثبت شود.'
      });
    }

    if (!nextStudentRef || (!mustObjectId(nextClassIdInput) && !mustObjectId(nextCourseIdInput)) || !membershipStatus) {
      return res.status(400).json({ success: false, message: 'متعلم، صنف و وضعیت معتبر الزامی است.' });
    }

    const [resolvedStudent, classRef] = await Promise.all([
      resolveCanonicalStudentUser(nextStudentRef),
      resolveClassReference({ classId: nextClassIdInput, courseId: nextCourseIdInput })
    ]);
    if (resolvedStudent?.error) {
      return res.status(400).json({ success: false, message: resolvedStudent.error });
    }
    const nextStudentId = resolvedStudent.studentId;
    if (classRef.error) return res.status(400).json({ success: false, message: classRef.error });
    if (!classRef.course) return res.status(400).json({ success: false, message: 'صنف معتبر نیست.' });

    const nextCourseId = String(classRef.course._id);
    const nextClassId = classRef.classId || '';
    const nextAcademicYearId = classRef.schoolClass?.academicYearId?._id || classRef.schoolClass?.academicYearId || classRef.course.academicYearRef || null;

    const currentPeer = await StudentMembership.findOne({ student: nextStudentId, course: nextCourseId, isCurrent: true, _id: { $ne: item._id } });
    if (currentPeer && (membershipStatus === 'active' || membershipStatus === 'pending')) {
      return res.status(409).json({
        success: false,
        code: 'student_current_membership_conflict',
        message: 'ثبت صنفی فعال دیگر به‌شکل خودکار ختم نمی‌شود؛ نخست تغییر وضعیت تعلیمی شاگرد را ثبت کنید.'
      });
    }

    const wasCurrent = !!item.isCurrent;
    item.student = nextStudentId;
    item.course = nextCourseId;
    item.classId = nextClassId || null;
    item.academicYear = nextAcademicYearId || null;
    item.academicYearId = nextAcademicYearId || null;
    item.status = membershipStatus;
    if (req.body?.note !== undefined) item.note = normalizeText(req.body.note);
    if (membershipStatus === 'rejected') {
      item.rejectedReason = req.body?.rejectedReason !== undefined
        ? (normalizeText(req.body.rejectedReason) || 'rejected_by_admin')
        : (item.rejectedReason || 'rejected_by_admin');
    } else {
      item.rejectedReason = '';
    }
    if (!wasCurrent && (membershipStatus === 'active' || membershipStatus === 'pending')) {
      item.joinedAt = new Date();
    }
    if (req.user?.id) item.createdBy = req.user.id;

    await item.save();
    const admissionBilling = null;

    await logActivity({
      req,
      action: 'update_student_enrollment',
      targetType: 'StudentMembership',
      targetId: item._id.toString(),
      meta: {
        studentId: String(nextStudentId),
        classId: nextClassId || '',
        courseId: String(nextCourseId),
        status: normalizedStatus
      }
    });

    const populated = await populateStudentEnrollments(StudentMembership.findById(item._id));
    const schoolClass = nextClassId ? await loadSerializedSchoolClassById(nextClassId) : null;
    res.json({
      success: true,
      admissionBilling: admissionBilling ? {
        created: admissionBilling.created === true,
        reason: admissionBilling.reason || '',
        billId: admissionBilling.bill?._id || null,
        billNumber: admissionBilling.bill?.billNumber || '',
        amount: Number(admissionBilling.bill?.amountOriginal || 0)
      } : null,
      item: serializeStudentEnrollment(populated, schoolClass),
      message: admissionBilling?.created
        ? `ثبت‌نام متعلم به‌روزرسانی شد و بل داخله ${admissionBilling.bill?.billNumber || ''} صادر گردید.`
        : 'ثبت‌نام متعلم به‌روزرسانی شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ویرایش ثبت‌نام متعلم ناموفق بود.' });
  }
});

router.delete('/student-enrollments/:id', ...withManageMemberships, async (req, res) => {
  try {
    const item = await StudentMembership.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    return res.status(409).json({
      success: false,
      code: 'student_membership_history_cannot_be_deleted',
      message: item.isCurrent
        ? 'ثبت صنفی فعال حذف نمی‌شود؛ تبدیلی، ترک تحصیل یا منفکی را از بخش تغییر وضعیت تعلیمی شاگرد ثبت کنید.'
        : 'تاریخچهٔ عضویت شاگرد قابل حذف نیست.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete enrollment' });
  }
});

module.exports = router;
