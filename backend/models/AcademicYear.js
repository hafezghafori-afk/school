const mongoose = require('mongoose');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const academicYearSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  code: { type: String, default: undefined, trim: true },
  title: { type: String, required: true, trim: true },
  calendarType: {
    type: String,
    enum: ['solar_hijri', 'gregorian', 'lunar_hijri'],
    default: 'solar_hijri'
  },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  startDateLocal: { type: String, default: '', trim: true }, // "1405-01-01"
  endDateLocal: { type: String, default: '', trim: true }, // "1405-12-29"
  regionType: {
    type: String,
    enum: ['cold', 'warm', 'custom'],
    default: 'custom'
  },
  sequence: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['planning', 'active', 'closed', 'archived'],
    default: 'planning',
    index: true
  },
  isActive: { type: Boolean, default: false },
  isCurrent: { type: Boolean, default: false, index: true },
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

academicYearSchema.pre('validate', function syncAcademicYearState() {
  if (typeof this.code === 'string') this.code = this.code.trim();
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (typeof this.startDateLocal === 'string') this.startDateLocal = this.startDateLocal.trim();
  if (typeof this.endDateLocal === 'string') this.endDateLocal = this.endDateLocal.trim();

  if (!this.code) {
    this.code = undefined;
  }

  if (!this.title && this.code) {
    this.title = this.code;
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

  if (this.isCurrent) {
    this.isActive = true;
    this.status = 'active';
  }
});

academicYearSchema.index({ schoolId: 1, title: 1 }, { unique: true });
academicYearSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });
academicYearSchema.index({ schoolId: 1, isCurrent: 1 }, {
  unique: true,
  partialFilterExpression: { isCurrent: true }
});
academicYearSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('AcademicYear', academicYearSchema);
