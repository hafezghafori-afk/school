const mongoose = require('mongoose');

const examDefaultMarkSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
  totalMark: { type: Number, default: 100, min: 1 },
  scoreComponents: {
    writtenMax: { type: Number, default: 0, min: 0 },
    oralMax: { type: Number, default: 0, min: 0 },
    classActivityMax: { type: Number, default: 0, min: 0 },
    homeworkMax: { type: Number, default: 0, min: 0 }
  },
  passMark: { type: Number, default: 50, min: 0 },
  conditionalMark: { type: Number, default: 40, min: 0 },
  weight: { type: Number, default: 1, min: 0 },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

examDefaultMarkSchema.pre('validate', function syncExamDefaultMarkState() {
  if (typeof this.note === 'string') this.note = this.note.trim();
  const scoreComponents = this.scoreComponents || {};
  const componentTotal = ['writtenMax', 'oralMax', 'classActivityMax', 'homeworkMax']
    .reduce((sum, key) => sum + Math.max(0, Number(scoreComponents[key] || 0)), 0);
  if (componentTotal > 0) {
    this.totalMark = componentTotal;
  }
  if (this.conditionalMark > this.passMark) {
    this.conditionalMark = this.passMark;
  }
});

examDefaultMarkSchema.index({ sessionId: 1 }, { unique: true, sparse: true });
examDefaultMarkSchema.index({ academicYearId: 1, assessmentPeriodId: 1, classId: 1, subjectId: 1, examTypeId: 1, status: 1 });

module.exports = mongoose.model('ExamDefaultMark', examDefaultMarkSchema);
