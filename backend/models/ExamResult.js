const mongoose = require('mongoose');

const examResultSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', required: true, index: true },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  markStatus: {
    type: String,
    enum: ['recorded', 'absent', 'excused', 'pending'],
    default: 'recorded',
    index: true
  },
  scoreBreakdown: {
    writtenScore: { type: Number, default: null, min: 0 },
    oralScore: { type: Number, default: null, min: 0 },
    classActivityScore: { type: Number, default: null, min: 0 },
    homeworkScore: { type: Number, default: null, min: 0 }
  },
  obtainedMark: { type: Number, default: 0, min: 0 },
  totalMark: { type: Number, default: 100, min: 1 },
  percentage: { type: Number, default: 0, min: 0, max: 100 },
  averageMark: { type: Number, default: 0, min: 0, max: 100 },
  resultStatus: {
    type: String,
    enum: ['passed', 'failed', 'conditional', 'distinction', 'temporary', 'placement', 'excused', 'absent', 'pending'],
    default: 'pending',
    index: true
  },
  groupLabel: { type: String, default: '', trim: true },
  rank: { type: Number, default: null, min: 1 },
  rankingRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RankingRule', default: null },
  computedAt: { type: Date, default: Date.now },
  engineVersion: { type: String, default: 'phase4-v1' },
  note: { type: String, default: '' }
}, { timestamps: true });

examResultSchema.pre('validate', function syncExamResultState() {
  if (typeof this.groupLabel === 'string') this.groupLabel = this.groupLabel.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (this.markStatus !== 'recorded') {
    this.rank = null;
    if (this.scoreBreakdown && typeof this.scoreBreakdown === 'object') {
      this.scoreBreakdown.writtenScore = null;
      this.scoreBreakdown.oralScore = null;
      this.scoreBreakdown.classActivityScore = null;
      this.scoreBreakdown.homeworkScore = null;
    }
  }
});

examResultSchema.index({ sessionId: 1, studentMembershipId: 1 }, { unique: true });
examResultSchema.index({ classId: 1, assessmentPeriodId: 1, resultStatus: 1, rank: 1 });

module.exports = mongoose.model('ExamResult', examResultSchema);
