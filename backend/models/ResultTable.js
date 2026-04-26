const mongoose = require('mongoose');

const resultTableStatsSchema = new mongoose.Schema({
  totalRows: { type: Number, default: 0 },
  passed: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  conditional: { type: Number, default: 0 },
  distinction: { type: Number, default: 0 },
  temporary: { type: Number, default: 0 },
  placement: { type: Number, default: 0 },
  excused: { type: Number, default: 0 },
  absent: { type: Number, default: 0 },
  pending: { type: Number, default: 0 },
  averagePercentage: { type: Number, default: 0 }
}, { _id: false });

const resultTableSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableTemplate', required: true, index: true },
  configId: { type: mongoose.Schema.Types.ObjectId, ref: 'TableConfig', default: null, index: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null, index: true },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
  templateType: { type: String, default: '', trim: true },
  orientation: {
    type: String,
    enum: ['portrait', 'landscape'],
    default: 'landscape'
  },
  status: {
    type: String,
    enum: ['draft', 'generated', 'published', 'archived'],
    default: 'generated',
    index: true
  },
  rowCount: { type: Number, default: 0, min: 0 },
  stats: { type: resultTableStatsSchema, default: () => ({}) },
  headerText: { type: String, default: '' },
  footerText: { type: String, default: '' },
  logoUrl: { type: String, default: '' },
  generatedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date, default: null },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '' }
}, { timestamps: true });

resultTableSchema.pre('validate', function syncResultTableState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.templateType === 'string') this.templateType = this.templateType.trim();
  if (typeof this.headerText === 'string') this.headerText = this.headerText.trim();
  if (typeof this.footerText === 'string') this.footerText = this.footerText.trim();
  if (typeof this.logoUrl === 'string') this.logoUrl = this.logoUrl.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.title && this.code) {
    this.title = this.code;
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

resultTableSchema.index({ code: 1 }, { unique: true, sparse: true });
resultTableSchema.index({ sessionId: 1, templateId: 1, generatedAt: -1 });

module.exports = mongoose.model('ResultTable', resultTableSchema);
