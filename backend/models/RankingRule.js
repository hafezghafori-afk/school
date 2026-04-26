const mongoose = require('mongoose');

const rankingBoundarySchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  minPercentage: { type: Number, required: true, min: 0, max: 100 }
}, { _id: false });

const rankingRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  scope: {
    type: String,
    enum: ['global', 'academic_year', 'class', 'session_template'],
    default: 'global',
    index: true
  },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', default: null, index: true },
  passMark: { type: Number, default: 50, min: 0, max: 100 },
  conditionalMark: { type: Number, default: 40, min: 0, max: 100 },
  distinctionMark: { type: Number, default: 90, min: 0, max: 100 },
  groupBoundaries: {
    type: [rankingBoundarySchema],
    default: () => ([
      { label: 'A', minPercentage: 90 },
      { label: 'B', minPercentage: 75 },
      { label: 'C', minPercentage: 60 },
      { label: 'D', minPercentage: 50 },
      { label: 'E', minPercentage: 40 },
      { label: 'F', minPercentage: 0 }
    ])
  },
  isDefault: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

rankingRuleSchema.pre('validate', function syncRankingRuleState() {
  if (typeof this.name === 'string') this.name = this.name.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.name && this.code) {
    this.name = this.code;
  }
  if (this.conditionalMark > this.passMark) {
    this.conditionalMark = this.passMark;
  }
  if (this.passMark > this.distinctionMark) {
    this.distinctionMark = this.passMark;
  }
  this.groupBoundaries = (this.groupBoundaries || [])
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label.trim() : '',
      minPercentage: Number(item.minPercentage || 0)
    }))
    .filter((item) => item.label)
    .sort((left, right) => right.minPercentage - left.minPercentage);
});

rankingRuleSchema.index({ code: 1 }, { unique: true, sparse: true });
rankingRuleSchema.index({ scope: 1, academicYearId: 1, assessmentPeriodId: 1, classId: 1, examTypeId: 1, isActive: 1 });

module.exports = mongoose.model('RankingRule', rankingRuleSchema);
