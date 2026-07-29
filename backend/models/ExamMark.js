const mongoose = require('mongoose');

const examMarkSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true, index: true },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  membershipSnapshot: {
    status: { type: String, default: '', trim: true },
    statusLabel: { type: String, default: '', trim: true },
    admissionType: { type: String, default: '', trim: true },
    isCurrent: { type: Boolean, default: false },
    enrolledAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    endedReason: { type: String, default: '', trim: true },
    capturedAt: { type: Date, default: null },
    effectiveAt: { type: Date, default: null }
  },
  markStatus: {
    type: String,
    enum: ['recorded', 'absent', 'excused', 'pending', 'not_applicable'],
    default: 'recorded',
    index: true
  },
  scoreBreakdown: {
    attendanceScore: { type: Number, default: null, min: 0 },
    writtenScore: { type: Number, default: null, min: 0 },
    oralScore: { type: Number, default: null, min: 0 },
    classActivityScore: { type: Number, default: null, min: 0 },
    homeworkScore: { type: Number, default: null, min: 0 }
  },
  attendanceSnapshot: {
    presentRecords: { type: Number, default: 0, min: 0 },
    totalRecords: { type: Number, default: 0, min: 0 },
    attendanceRate: { type: Number, default: null, min: 0, max: 100 },
    dateFrom: { type: Date, default: null },
    dateTo: { type: Date, default: null },
    computedAt: { type: Date, default: null }
  },
  obtainedMark: { type: Number, default: 0, min: 0 },
  totalMark: { type: Number, default: 100, min: 1 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  note: { type: String, default: '' },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  enteredAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

examMarkSchema.pre('validate', function syncExamMarkState() {
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (this.membershipSnapshot && !this.membershipSnapshot.capturedAt) {
    this.membershipSnapshot.capturedAt = new Date();
  }
  const scoreBreakdown = this.scoreBreakdown || {};
  const breakdownKeys = ['attendanceScore', 'writtenScore', 'oralScore', 'classActivityScore', 'homeworkScore'];
  const hasBreakdown = breakdownKeys.some((key) => scoreBreakdown[key] !== null && scoreBreakdown[key] !== undefined && scoreBreakdown[key] !== '');
  if (hasBreakdown) {
    this.obtainedMark = breakdownKeys.reduce((sum, key) => {
      const value = Number(scoreBreakdown[key]);
      return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
    }, 0);
  }
  if (this.obtainedMark > this.totalMark) {
    this.obtainedMark = this.totalMark;
  }
  if (this.markStatus !== 'recorded') {
    this.obtainedMark = 0;
    breakdownKeys.forEach((key) => {
      scoreBreakdown[key] = null;
    });
  }
  this.percentage = this.totalMark > 0
    ? Number(((Number(this.obtainedMark || 0) / Number(this.totalMark || 1)) * 100).toFixed(2))
    : 0;
});

examMarkSchema.index({ sessionId: 1, studentMembershipId: 1 }, { unique: true });
examMarkSchema.index({ classId: 1, assessmentPeriodId: 1, sessionId: 1 });

module.exports = mongoose.model('ExamMark', examMarkSchema);
