const mongoose = require('mongoose');

// سوانح تعلیمی متعلم (فرم رسمی وزارت معارف — فرم B / نتیجه امتحانات متعلم)
// یک ردیف به‌ازای هر (شاگرد × صنف × سال تحصیلی)، بازتولیدشونده از ExamResult.
// امتحانات: سویه (نمایشی، خارج از محاسبه) · چهارونیم‌ماهه (۰–۴۰) · سالانه (۰–۶۰)
// مجموع مضمون = چهارونیم‌ماهه + سالانه (۰–۱۰۰) · کامیابی مضمون ≥ ۵۵

const rowSchema = new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
  subjectKey: { type: String, required: true },   // کلید کانونیک (sawanehSubjects) یا 'other'
  subjectLabel: { type: String, required: true }, // برچسب دری برای چاپ
  order: { type: Number, default: 0 },            // ترتیب نمایش (از Subject.resultOrder یا کانونیک)
  category: { type: String, enum: ['religious', 'general', ''], default: '' },

  sawiyaMark: { type: Number, default: null, min: 0 },   // امتحان سویه (۰–۱۰۰)
  midYearMark: { type: Number, default: null, min: 0 },  // چهارونیم‌ماهه (۰–۴۰)
  finalMark: { type: Number, default: null, min: 0 },    // سالانه (۰–۶۰)
  annualMark: { type: Number, default: null, min: 0 },   // = midYearMark + finalMark
  maxMark: { type: Number, default: 100 },
  subjectPassed: { type: Boolean, default: null },

  isManual: { type: Boolean, default: false },           // نمرهٔ دستیِ ویرایش‌شده
  sourceResultIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExamResult' }]
}, { _id: false });

const TIER_ENUM = ['aali', 'ali', 'motawaset', 'nakam', 'pending'];
const PROMOTION_ENUM = ['kamyab', 'kamyab_makeup', 'mashroot', 'nakam_senf', 'pending'];

const studentAcademicTranscriptSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanStudent', required: true, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  yearLabel: { type: String, default: '', trim: true },
  grade: { type: Number, min: 1, max: 12, required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  schoolNameSnapshot: { type: String, default: '', trim: true },

  rows: { type: [rowSchema], default: [] },

  // جمع‌بندی
  totalObtained: { type: Number, default: 0 },      // مجموعه = Σ annualMark
  subjectCount: { type: Number, default: 0 },       // مضامینِ دارای نمرهٔ سالانه
  average: { type: Number, default: 0 },            // اوسط نمرات (۰–۱۰۰)
  failedSubjectCount: { type: Number, default: 0 }, // مضامین با annualMark < 55
  resultTier: { type: String, enum: TIER_ENUM, default: 'pending' },       // درجه‌بندی کیفی
  promotionStatus: { type: String, enum: PROMOTION_ENUM, default: 'pending' }, // نتیجهٔ ارتقاء
  rank: { type: Number, default: null, min: 1 },    // درجه (رتبه در صنف)
  classSize: { type: Number, default: null, min: 1 },
  rankProvisional: { type: Boolean, default: true },

  // حاضری سالانه (نگاشت Attendance.status)
  attendance: {
    schoolDays: { type: Number, default: 0 },  // ایام سال تعلیمی
    present: { type: Number, default: 0 },      // present + late
    absent: { type: Number, default: 0 },       // absent + suspended
    sick: { type: Number, default: 0 },         // مریض
    leave: { type: Number, default: 0 },        // leave + excused
    late: { type: Number, default: 0 }          // شمارندهٔ جدا (داخل present هم هست)
  },

  examNotes: { type: String, default: '', trim: true },
  supervisorSignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  teacherSignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  sealApplied: { type: Boolean, default: false },

  state: { type: String, enum: ['draft', 'finalized', 'locked'], default: 'draft', index: true },
  generatedAt: { type: Date, default: null },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lockedAt: { type: Date, default: null },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

studentAcademicTranscriptSchema.index(
  { studentId: 1, academicYearId: 1, grade: 1 },
  { unique: true }
);
studentAcademicTranscriptSchema.index({ schoolId: 1, academicYearId: 1, grade: 1, rank: 1 });
studentAcademicTranscriptSchema.index({ classId: 1, academicYearId: 1, state: 1 });

module.exports = mongoose.model('StudentAcademicTranscript', studentAcademicTranscriptSchema);
module.exports.TIER_ENUM = TIER_ENUM;
module.exports.PROMOTION_ENUM = PROMOTION_ENUM;
