const mongoose = require('mongoose');

// کارت سوانح متعلم/محصل (فرم رسمی وزارت معارف — فرم A)
// پروندهٔ دائمیِ هویتی/ثبتی/انضباطیِ شاگرد؛ یک کارت به‌ازای هر AfghanStudent.
// بخش‌های هویت (نام دری/انگلیسی، تذکره، تولد، عکس) از AfghanStudent می‌آید و این‌جا تکرار نمی‌شود.

const GRADE = { type: Number, min: 1, max: 12 };

const trimString = (value) => (typeof value === 'string' ? value.trim() : value);

const nameCorrectionSchema = new mongoose.Schema({
  field: { type: String, enum: ['name', 'lastName', 'fatherName', 'grandfatherName'], required: true },
  oldValue: { type: String, default: '', trim: true },
  newValue: { type: String, default: '', trim: true },
  letterNo: { type: String, default: '', trim: true },        // نمبر مکتوب (اجباری در سطح route)
  date: { type: Date, default: null },
  dateLocal: { type: String, default: '', trim: true },        // شمسی "1405-01-01"
  note: { type: String, default: '', trim: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: true, timestamps: true });

const enrollmentHistorySchema = new mongoose.Schema({
  schoolName: { type: String, required: true, trim: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null },
  asasNumber: { type: String, default: '', trim: true },       // نمبر اساس (per-enrollment)
  grade: { ...GRADE, default: null },
  date: { type: Date, default: null },
  dateLocal: { type: String, default: '', trim: true },
  letterNo: { type: String, default: '', trim: true },          // نمبر مکتوب
  kind: { type: String, enum: ['initial', 'transfer_in', 're_admission'], default: 'initial' },
  isManual: { type: Boolean, default: false },                  // ردیف دستیِ سوابق پیش از سیستم
  sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentLifecycleEvent', default: null }
}, { _id: true });

const addressSchema = new mongoose.Schema({
  province: { type: String, default: '', trim: true },
  district: { type: String, default: '', trim: true },          // ولسوالی / ناحیه
  villageOrStreet: { type: String, default: '', trim: true }    // قریه / گذر
}, { _id: false });

const relativeSchema = new mongoose.Schema({
  relation: {
    type: String,
    enum: ['brother', 'paternal_uncle', 'maternal_uncle', 'paternal_cousin', 'maternal_cousin', 'other'],
    required: true
  },
  name: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { _id: true });

const supervisorRemarkSchema = new mongoose.Schema({
  grade: { ...GRADE, required: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  supervisorName: { type: String, default: '', trim: true },
  supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  remark: { type: String, default: '', trim: true },
  healthStatus: {
    type: String,
    enum: ['good', 'needs_followup', 'chronic_condition', ''],
    default: ''
  },
  recordedAt: { type: Date, default: null }
}, { _id: true, timestamps: true });

const studentSawanehCardSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanStudent',
    required: true,
    unique: true,
    index: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanSchool',
    required: true,
    index: true
  },

  // ۴ — اصلاح شهرت (تاریخچه؛ توسط hook تغییر نام AfghanStudent پر می‌شود)
  nameCorrections: { type: [nameCorrectionSchema], default: [] },

  // ۵ — شمولیت / نمبر اساس در مکاتب (تاریخچه)
  enrollmentHistory: { type: [enrollmentHistorySchema], default: [] },

  // ۶ و ۷ — سکونت اصلی / فعلی
  originAddress: { type: addressSchema, default: () => ({}) },
  currentAddress: { type: addressSchema, default: () => ({}) },
  currentSameAsOrigin: { type: Boolean, default: true },

  // ۱۰ — زبان مادری
  motherTongue: { type: String, enum: ['dari', 'pashto', 'other'], default: 'dari' },
  thirdLanguage: { type: String, default: '', trim: true },

  // ۱۴ — وضع صحیِ متعلم (یک ردیفِ کارت، مطابق فرمِ رسمی)
  healthStatus: {
    type: String,
    enum: ['good', 'needs_followup', 'chronic_condition', ''],
    default: ''
  },

  // ۱۱ — منفک شدن (آخرین وضعیت + snapshot رویداد)
  separation: {
    isSeparated: { type: Boolean, default: false },
    date: { type: Date, default: null },
    dateLocal: { type: String, default: '', trim: true },
    letterNo: { type: String, default: '', trim: true },
    grade: { ...GRADE, default: null },
    reason: {
      type: String,
      enum: ['transfer', 'dropout', 'expulsion', 'graduation', 'death', 'other', ''],
      default: ''
    },
    reasonText: { type: String, default: '', trim: true },
    penaltyAmount: { type: Number, default: 0, min: 0 },        // جریمه
    penaltyPaid: { type: Boolean, default: false },
    penaltyReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceReceipt', default: null },
    sourceEventId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentLifecycleEvent', default: null }
  },

  // ۱۲ — اقارب نزدیک
  relatives: { type: [relativeSchema], default: [] },

  // ۱۳ + ۱۴ — نظریات نگران صنف + وضع صحی (حداکثر یک ردیف per grade)
  supervisorRemarks: { type: [supervisorRemarkSchema], default: [] },

  status: { type: String, enum: ['draft', 'active', 'closed'], default: 'draft', index: true },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

studentSawanehCardSchema.pre('validate', function syncSawanehCardState() {
  this.thirdLanguage = trimString(this.thirdLanguage) || '';

  if (this.currentSameAsOrigin && this.originAddress) {
    this.currentAddress = {
      province: this.originAddress.province || '',
      district: this.originAddress.district || '',
      villageOrStreet: this.originAddress.villageOrStreet || ''
    };
  }

  if (this.separation) {
    this.separation.isSeparated = Boolean(
      this.separation.isSeparated || this.separation.date || this.separation.reason
    );
    if (!this.separation.penaltyAmount || this.separation.penaltyAmount < 0) {
      this.separation.penaltyAmount = 0;
    }
    if (this.separation.penaltyAmount === 0) {
      this.separation.penaltyPaid = false;
    }
  }

  // یکتاسازی نظریات نگران بر اساس صنف — آخرین ثبت برای هر صنف می‌ماند
  if (Array.isArray(this.supervisorRemarks) && this.supervisorRemarks.length) {
    const byGrade = new Map();
    this.supervisorRemarks.forEach((entry) => {
      if (entry && entry.grade) byGrade.set(Number(entry.grade), entry);
    });
    this.supervisorRemarks = [...byGrade.values()].sort((a, b) => Number(a.grade) - Number(b.grade));
  }
});

studentSawanehCardSchema.virtual('separationIsSeparated').get(function getSeparationFlag() {
  return Boolean(this.separation && this.separation.isSeparated);
});

// studentId یکتا از طریق `unique: true` روی خودِ فیلد تعریف شده
studentSawanehCardSchema.index({ schoolId: 1, status: 1 });
studentSawanehCardSchema.index({ 'separation.isSeparated': 1, 'separation.penaltyPaid': 1 });

module.exports = mongoose.model('StudentSawanehCard', studentSawanehCardSchema);
