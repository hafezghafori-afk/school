const mongoose = require('mongoose');
const StudentSawanehCard = require('../models/StudentSawanehCard');
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

module.exports = {
  ensureCard,
  syncFromStudent,
  // helperهای داخلی برای تست/استفادهٔ مجدد
  _internals: { gradeNumber, addressFromContact, dateLocal }
};
