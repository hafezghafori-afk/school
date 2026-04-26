const mongoose = require('mongoose');

const resultTableRowSchema = new mongoose.Schema({
  tableId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResultTable', required: true, index: true },
  examResultId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamResult', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  serialNo: { type: Number, default: 0, min: 0 },
  rowType: {
    type: String,
    enum: ['student', 'summary', 'meta'],
    default: 'student',
    index: true
  },
  displayName: { type: String, default: '' },
  resultStatus: { type: String, default: '', trim: true },
  groupLabel: { type: String, default: '', trim: true },
  rank: { type: Number, default: null, min: 1 },
  obtainedMark: { type: Number, default: 0 },
  totalMark: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  averageMark: { type: Number, default: 0 },
  cells: { type: mongoose.Schema.Types.Mixed, default: {} },
  note: { type: String, default: '' }
}, { timestamps: true });

resultTableRowSchema.pre('validate', function syncResultTableRowState() {
  if (typeof this.displayName === 'string') this.displayName = this.displayName.trim();
  if (typeof this.resultStatus === 'string') this.resultStatus = this.resultStatus.trim();
  if (typeof this.groupLabel === 'string') this.groupLabel = this.groupLabel.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.cells || typeof this.cells !== 'object' || Array.isArray(this.cells)) {
    this.cells = {};
  }
  if (this.rowType !== 'student') {
    this.rank = null;
    this.studentMembershipId = null;
    this.studentId = null;
    this.student = null;
  }
});

resultTableRowSchema.index({ tableId: 1, serialNo: 1 }, { unique: true });
resultTableRowSchema.index({ tableId: 1, studentMembershipId: 1 }, { unique: true, partialFilterExpression: { studentMembershipId: { $type: 'objectId' } } });

module.exports = mongoose.model('ResultTableRow', resultTableRowSchema);
