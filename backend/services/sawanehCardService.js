const mongoose = require('mongoose');
const StudentSawanehCard = require('../models/StudentSawanehCard');
const StudentAcademicTranscript = require('../models/StudentAcademicTranscript');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanSchool = require('../models/AfghanSchool');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(String(value)) : null;
};

// 'grade7' | 'grade12' | 7 | '7' → 7  (خارج از ۱..۱۲ → null)
const gradeNumber = (value) => {
  const match = String(value == null ? '' : value).match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return num >= 1 && num <= 12 ? num : null;
};

const dateLocal = (value) => {
  if (!value) return '';
  try {
    return formatAfghanStoredDateLabel(value) || '';
  } catch (err) {
    return '';
  }
};

const addressFromContact = (contactInfo = {}) => ({
  province: String(contactInfo.province || '').trim(),
  district: String(contactInfo.district || '').trim(),
  villageOrStreet: String(contactInfo.village || '').trim()
});

const isEmptyAddress = (address) => !address
  || (!String(address.province || '').trim()
    && !String(address.district || '').trim()
    && !String(address.villageOrStreet || '').trim());

const resolveSchoolName = async (schoolId) => {
  const id = toObjectId(schoolId);
  if (!id) return '';
  const school = await AfghanSchool.findById(id).select('name nameDari').lean();
  return String(school?.nameDari || school?.name || '').trim();
};

// اولین ردیف شمولیت را از دادهٔ ثبت‌نامِ خودِ شاگرد می‌سازد
const buildInitialEnrollmentRow = async (student) => {
  const academic = student.academicInfo || {};
  const schoolId = toObjectId(academic.currentSchool);
  const date = academic.enrollmentDate || student.createdAt || null;
  return {
    schoolName: await resolveSchoolName(schoolId),
    schoolId,
    asasNumber: String(student.asasNumber || '').trim(),
    grade: gradeNumber(academic.currentGrade),
    date,
    dateLocal: dateLocal(date),
    letterNo: '',
    kind: 'initial',
    isManual: false,
    sourceEventId: null
  };
};

/**
 * کارت سوانحِ یک شاگرد را برمی‌گرداند و اگر نبود می‌سازد (idempotent).
 * @param {string|ObjectId} studentId شناسهٔ AfghanStudent
 * @param {{ actorId?: string|ObjectId, session?: object }} [opts]
 * @returns {Promise<import('mongoose').Document>}
 */
const ensureCard = async (studentId, opts = {}) => {
  const id = toObjectId(studentId);
  if (!id) throw new Error('sawaneh_invalid_student_id');

  const existing = await StudentSawanehCard.findOne({ studentId: id });
  if (existing) return existing;

  const student = await AfghanStudent.findById(id)
    .select('asasNumber contactInfo academicInfo createdAt')
    .lean();
  if (!student) throw new Error('sawaneh_student_not_found');

  const schoolId = toObjectId(student.academicInfo?.currentSchool);
  if (!schoolId) throw new Error('sawaneh_student_without_school');

  const originAddress = addressFromContact(student.contactInfo);
  const initialRow = await buildInitialEnrollmentRow(student);

  try {
    const card = await StudentSawanehCard.create({
      studentId: id,
      schoolId,
      originAddress,
      currentAddress: originAddress,
      currentSameAsOrigin: true,
      enrollmentHistory: initialRow.schoolId || initialRow.asasNumber || initialRow.grade ? [initialRow] : [],
      status: 'draft',
      createdBy: toObjectId(opts.actorId),
      lastUpdatedBy: toObjectId(opts.actorId)
    });
    return card;
  } catch (err) {
    // رقابت هم‌زمان (unique studentId) — کارتی که در این فاصله ساخته شد را برگردان
    if (err && err.code === 11000) {
      const raced = await StudentSawanehCard.findOne({ studentId: id });
      if (raced) return raced;
    }
    throw err;
  }
};

/**
 * فیلدهای مشتق‌شده از AfghanStudent را روی کارت تازه می‌کند بدون بازنویسیِ ویرایش‌های دستی.
 * فقط: seed کردن ردیف شمولیتِ اولیه در صورت خالی‌بودن، و پرکردن سکونتِ خالی.
 * @param {string|ObjectId|object} cardOrStudentId کارت یا شناسهٔ شاگرد
 * @param {{ actorId?: string|ObjectId }} [opts]
 * @returns {Promise<import('mongoose').Document>}
 */
const syncFromStudent = async (cardOrStudentId, opts = {}) => {
  let card = cardOrStudentId && cardOrStudentId._id && cardOrStudentId.studentId
    ? cardOrStudentId
    : null;

  const studentId = card ? card.studentId : toObjectId(cardOrStudentId);
  if (!card) {
    card = await ensureCard(studentId, opts);
  }

  const student = await AfghanStudent.findById(card.studentId)
    .select('asasNumber contactInfo academicInfo createdAt')
    .lean();
  if (!student) return card;

  let dirty = false;

  if (isEmptyAddress(card.originAddress)) {
    card.originAddress = addressFromContact(student.contactInfo);
    if (card.currentSameAsOrigin) card.currentAddress = { ...card.originAddress };
    dirty = true;
  }

  if (!Array.isArray(card.enrollmentHistory) || card.enrollmentHistory.length === 0) {
    const initialRow = await buildInitialEnrollmentRow(student);
    if (initialRow.schoolId || initialRow.asasNumber || initialRow.grade) {
      card.enrollmentHistory = [initialRow];
      dirty = true;
    }
  } else {
    // نمبر اساسِ فعلی را روی آخرین ردیفِ سیستمیِ همان مکتب هم‌گام کن
    const currentAsas = String(student.asasNumber || '').trim();
    const last = card.enrollmentHistory[card.enrollmentHistory.length - 1];
    if (currentAsas && last && !last.isManual && !last.asasNumber) {
      last.asasNumber = currentAsas;
      dirty = true;
    }
  }

  if (dirty) {
    card.lastUpdatedBy = toObjectId(opts.actorId) || card.lastUpdatedBy;
    await card.save();
  }
  return card;
};

/**
 * نظر نگرانِ یک صنف را روی کارت ثبت یا جایگزین می‌کند (حداکثر یک ردیف per صنف).
 * @param {string|ObjectId} studentId شناسهٔ AfghanStudent
 * @param {object} payload { grade, remark, healthStatus, academicYearId?, classId?, supervisorId?, supervisorName? }
 * @param {{ actorId?: string|ObjectId }} [opts]
 * @returns {Promise<import('mongoose').Document>}
 */
const upsertSupervisorRemark = async (studentId, payload = {}, opts = {}) => {
  const grade = gradeNumber(payload.grade);
  if (!grade) throw new Error('sawaneh_invalid_grade');

  const card = await ensureCard(studentId, opts);

  const entry = {
    grade,
    academicYearId: toObjectId(payload.academicYearId),
    classId: toObjectId(payload.classId),
    supervisorId: toObjectId(payload.supervisorId) || toObjectId(opts.actorId),
    supervisorName: String(payload.supervisorName || '').trim(),
    remark: String(payload.remark || '').trim(),
    healthStatus: ['good', 'needs_followup', 'chronic_condition', ''].includes(payload.healthStatus)
      ? payload.healthStatus
      : '',
    recordedAt: new Date()
  };

  card.supervisorRemarks = (card.supervisorRemarks || []).filter(
    (item) => Number(item.grade) !== grade
  );
  card.supervisorRemarks.push(entry);
  card.lastUpdatedBy = toObjectId(opts.actorId) || card.lastUpdatedBy;
  await card.save();
  return card;
};

// نگاشتِ فیلدهای نامِ AfghanStudent → کلیدِ اصلاح شهرت در کارت
const NAME_FIELD_MAP = {
  firstNameDari: 'name',
  firstName: 'name',
  lastNameDari: 'lastName',
  lastName: 'lastName',
  fatherName: 'fatherName',
  fatherNameEnglish: 'fatherName',
  grandfatherName: 'grandfatherName'
};
const TRACKED_NAME_FIELDS = Object.keys(NAME_FIELD_MAP);

/**
 * تفاوتِ فیلدهای نام بین مقادیر قبلی و جدید را برمی‌گرداند (فقط کلیدهایی که در payload آمده‌اند).
 * @returns {Array<{ field:string, sourceField:string, oldValue:string, newValue:string }>}
 */
const diffNameFields = (previousPersonalInfo = {}, incomingPersonalInfo = {}) => {
  const diffs = [];
  TRACKED_NAME_FIELDS.forEach((sourceField) => {
    if (!Object.prototype.hasOwnProperty.call(incomingPersonalInfo, sourceField)) return;
    const before = String(previousPersonalInfo?.[sourceField] || '').trim();
    const after = String(incomingPersonalInfo?.[sourceField] || '').trim();
    if (before !== after) {
      diffs.push({ field: NAME_FIELD_MAP[sourceField], sourceField, oldValue: before, newValue: after });
    }
  });
  return diffs;
};

/**
 * ثبتِ اصلاح شهرت در کارت سوانح (پس از ذخیرهٔ AfghanStudent، با نمبر مکتوبِ اجباری).
 * @param {string|ObjectId} studentId
 * @param {Array<{ field, oldValue, newValue }>} corrections
 * @param {{ letterNo:string, date?:Date, note?:string, actorId?:string }} meta
 */
const recordNameCorrections = async (studentId, corrections = [], meta = {}) => {
  if (!Array.isArray(corrections) || corrections.length === 0) return null;
  const letterNo = String(meta.letterNo || '').trim();
  if (!letterNo) throw new Error('sawaneh_name_correction_letter_required');

  const card = await ensureCard(studentId, { actorId: meta.actorId });
  const when = meta.date ? new Date(meta.date) : new Date();

  // یک ردیف per کلیدِ نگاشت‌شده (اگر دری و انگلیسی هر دو عوض شده باشند، دری اولویت دارد)
  const byField = new Map();
  corrections.forEach((item) => {
    if (!item || !item.field) return;
    if (!byField.has(item.field)) byField.set(item.field, item);
  });

  byField.forEach((item) => {
    card.nameCorrections.push({
      field: item.field,
      oldValue: item.oldValue || '',
      newValue: item.newValue || '',
      letterNo,
      date: when,
      dateLocal: dateLocal(when),
      note: String(meta.note || '').trim(),
      recordedBy: toObjectId(meta.actorId)
    });
  });
  card.lastUpdatedBy = toObjectId(meta.actorId) || card.lastUpdatedBy;
  await card.save();
  return card;
};

const LIFECYCLE_END_REASON = {
  transfer_out: 'transfer',
  dropout: 'dropout',
  expulsion: 'expulsion',
  graduation: 'graduation'
};
const LIFECYCLE_REENTRY_KIND = {
  transfer_in: 'transfer_in',
  re_enrollment: 're_admission'
};

/**
 * هم‌گام‌سازیِ کارت سوانح با یک رویدادِ چرخهٔ حیات (best-effort، پس از commit صدا زده می‌شود).
 * end actions → پرکردنِ بخشِ منفکی + بستنِ کارت + قفلِ ترانسکریپت‌ها.
 * transfer_in / re_enrollment → افزودنِ ردیفِ شمولیت + بازکردنِ کارت.
 * @param {{ afghanStudentId, action, effectiveAt, eventId, membership?, actorId? }} payload
 */
const onLifecycleEvent = async ({ afghanStudentId, action, effectiveAt, eventId, actorId } = {}) => {
  const sid = toObjectId(afghanStudentId);
  if (!sid) return null;
  const endReason = LIFECYCLE_END_REASON[action];
  const reentryKind = LIFECYCLE_REENTRY_KIND[action];
  if (!endReason && !reentryKind) return null;

  const card = await ensureCard(sid, { actorId });
  const student = await AfghanStudent.findById(sid).select('academicInfo asasNumber').lean();
  const when = effectiveAt ? new Date(effectiveAt) : new Date();
  const grade = gradeNumber(student?.academicInfo?.currentGrade);

  if (endReason) {
    const existing = card.separation || {};
    card.separation = {
      isSeparated: true,
      date: when,
      dateLocal: dateLocal(when),
      letterNo: existing.letterNo || '',
      grade: grade || existing.grade || null,
      reason: endReason,
      reasonText: existing.reasonText || '',
      penaltyAmount: existing.penaltyAmount || 0,
      penaltyPaid: existing.penaltyPaid || false,
      penaltyReceiptId: existing.penaltyReceiptId || null,
      sourceEventId: toObjectId(eventId)
    };
    card.status = 'closed';
    card.lastUpdatedBy = toObjectId(actorId) || card.lastUpdatedBy;
    await card.save();

    await StudentAcademicTranscript.updateMany(
      { studentId: sid, state: { $ne: 'locked' } },
      { $set: { state: 'locked', lockedAt: when, lockedBy: toObjectId(actorId) || null, sealApplied: true } }
    );
    return card;
  }

  // reentry
  const eid = toObjectId(eventId);
  const already = eid && (card.enrollmentHistory || []).some((row) => String(row.sourceEventId || '') === String(eid));
  if (!already) {
    const schoolId = toObjectId(student?.academicInfo?.currentSchool);
    card.enrollmentHistory.push({
      schoolName: await resolveSchoolName(schoolId),
      schoolId,
      asasNumber: String(student?.asasNumber || '').trim(),
      grade,
      date: when,
      dateLocal: dateLocal(when),
      letterNo: '',
      kind: reentryKind,
      isManual: false,
      sourceEventId: eid
    });
  }
  if (card.status === 'closed') card.status = 'active';
  // بازگشتِ شاگرد → پاک‌کردنِ کاملِ بخشِ منفکی (بازگشت در enrollmentHistory ثبت شده است)
  if (card.separation && card.separation.isSeparated) {
    card.separation = {
      isSeparated: false,
      date: null, dateLocal: '', letterNo: '', grade: null,
      reason: '', reasonText: '',
      penaltyAmount: 0, penaltyPaid: false, penaltyReceiptId: null,
      sourceEventId: null
    };
  }
  card.lastUpdatedBy = toObjectId(actorId) || card.lastUpdatedBy;
  await card.save();
  return card;
};

/**
 * تکمیلِ دستیِ جزئیاتِ منفکی روی کارت (نمبر مکتوب، جریمه، وضعیت پرداخت).
 */
const updateSeparationDetails = async (studentId, payload = {}, opts = {}) => {
  const card = await ensureCard(studentId, opts);
  const sep = card.separation || {};
  if (typeof payload.letterNo === 'string') sep.letterNo = payload.letterNo.trim();
  if (typeof payload.reasonText === 'string') sep.reasonText = payload.reasonText.trim();
  if (payload.penaltyAmount !== undefined) {
    const amount = Number(payload.penaltyAmount);
    sep.penaltyAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
  }
  if (typeof payload.penaltyPaid === 'boolean') sep.penaltyPaid = payload.penaltyPaid;
  if (payload.penaltyReceiptId !== undefined) sep.penaltyReceiptId = toObjectId(payload.penaltyReceiptId);
  card.separation = sep;
  card.lastUpdatedBy = toObjectId(opts.actorId) || card.lastUpdatedBy;
  await card.save();
  return card;
};

module.exports = {
  ensureCard,
  syncFromStudent,
  upsertSupervisorRemark,
  diffNameFields,
  recordNameCorrections,
  onLifecycleEvent,
  updateSeparationDetails,
  TRACKED_NAME_FIELDS,
  // helperهای داخلی برای تست/استفادهٔ مجدد
  _internals: { gradeNumber, addressFromContact, dateLocal, toObjectId, NAME_FIELD_MAP }
};
