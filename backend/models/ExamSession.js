const mongoose = require('mongoose');

const examSessionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  sessionKind: {
    type: String,
    enum: ['standard', 'subject_sheet'],
    default: 'standard',
    index: true
  },
  examTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamType', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', required: true, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null, index: true },
  teacherAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeacherAssignment', default: null, index: true },
  sheetTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SheetTemplate', default: null, index: true },
  sheetTemplateVersion: { type: Number, default: 1, min: 1 },
  sheetTemplateSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  defaultMarkId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamDefaultMark', default: null },
  rankingRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'RankingRule', default: null },
  version: { type: Number, default: 1, min: 1 },
  revisionRootSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null, index: true },
  supersedesSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null, index: true },
  replacedBySessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null },
  status: {
    type: String,
    enum: ['draft', 'active', 'submitted', 'approved', 'closed', 'published', 'archived'],
    default: 'draft',
    index: true
  },
  heldAt: { type: Date, default: null },
  rosterFrozenAt: { type: Date, default: null },
  rosterFrozenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  publishedAt: { type: Date, default: null },
  monthLabel: { type: String, default: '' },
  reviewedByName: { type: String, default: '' },
  reviewerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '' }
}, { timestamps: true });

examSessionSchema.pre('validate', function syncExamSessionState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.monthLabel === 'string') this.monthLabel = this.monthLabel.trim();
  if (typeof this.reviewedByName === 'string') this.reviewedByName = this.reviewedByName.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.title && this.code) {
    this.title = this.code;
  }
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
});

examSessionSchema.index({ code: 1 }, { unique: true, sparse: true });
examSessionSchema.index({ academicYearId: 1, assessmentPeriodId: 1, classId: 1, subjectId: 1, examTypeId: 1, status: 1 });
examSessionSchema.index(
  { revisionRootSessionId: 1, version: 1 },
  { unique: true, partialFilterExpression: { revisionRootSessionId: { $type: 'objectId' } } }
);

module.exports = mongoose.model('ExamSession', examSessionSchema);
