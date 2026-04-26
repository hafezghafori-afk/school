const mongoose = require('mongoose');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const academicTermSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
    index: true
  },
  name: { type: String, required: true, trim: true }, // "??? ???"
  order: { type: Number, default: 1 },
  type: {
    type: String,
    enum: ['quarter', 'semester', 'exam_period', 'assessment_period', 'term'],
    default: 'quarter'
  },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  startDateLocal: { type: String, default: '', trim: true },
  endDateLocal: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['planned', 'active', 'closed'],
    default: 'planned',
    index: true
  },
  isActive: { type: Boolean, default: false, index: true },
  note: { type: String, default: '' },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

academicTermSchema.pre('validate', function syncAcademicTermState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') this.code = this.code.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.name === 'string') this.name = this.name.trim();
  if (typeof this.startDateLocal === 'string') this.startDateLocal = this.startDateLocal.trim();
  if (typeof this.endDateLocal === 'string') this.endDateLocal = this.endDateLocal.trim();

  if (!this.title && this.code) {
    this.title = this.code;
  }

  if (!this.name && this.title) {
    this.name = this.title;
  }

  if (this.startDate) {
    this.startDateLocal = formatAfghanStoredDateLabel(this.startDate);
  }

  if (this.endDate) {
    this.endDateLocal = formatAfghanStoredDateLabel(this.endDate);
  }

  if (this.isActive) {
    this.status = 'active';
  } else if (this.status === 'active') {
    this.isActive = true;
  }
});

academicTermSchema.index({ academicYearId: 1, type: 1, order: 1 });
academicTermSchema.index({ academicYearId: 1, code: 1 });
academicTermSchema.index({ academicYearId: 1, status: 1 });

module.exports = mongoose.model('AcademicTerm', academicTermSchema);
