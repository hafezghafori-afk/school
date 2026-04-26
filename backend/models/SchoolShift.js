const mongoose = require('mongoose');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const schoolShiftSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  startTime: {
    type: String,
    required: true,
    trim: true
  },
  endTime: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  maxDailyPeriods: {
    type: Number,
    default: 8
  },
  breakDurationMinutes: {
    type: Number,
    default: 10
  },
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

schoolShiftSchema.pre('validate', function syncSchoolShiftState() {
  this.name = normalizeText(this.name);
  this.code = normalizeText(this.code).toLowerCase();
  this.startTime = normalizeText(this.startTime);
  this.endTime = normalizeText(this.endTime);
  this.description = normalizeText(this.description);

  if (!this.name) {
    this.name = 'Shift';
  }

  if (!this.code && this.name) {
    this.code = this.name.toLowerCase().replace(/\s+/g, '_');
  }

  if (this.sortOrder < 0) this.sortOrder = 0;
  if (this.maxDailyPeriods < 1) this.maxDailyPeriods = 8;
  if (this.breakDurationMinutes < 0) this.breakDurationMinutes = 10;
});

// Validation: startTime must be before endTime
schoolShiftSchema.pre('save', function validateTimeRange() {
  if (this.startTime && this.endTime) {
    const start = this.startTime.split(':');
    const end = this.endTime.split(':');
    
    if (start.length === 2 && end.length === 2) {
      const startMinutes = parseInt(start[0]) * 60 + parseInt(start[1]);
      const endMinutes = parseInt(end[0]) * 60 + parseInt(end[1]);
      
      if (startMinutes >= endMinutes) {
        throw new Error('Start time must be before end time');
      }
    }
  }
});

// Indexes
schoolShiftSchema.index({ schoolId: 1, code: 1 }, { unique: true });
schoolShiftSchema.index({ schoolId: 1, isActive: 1 });
schoolShiftSchema.index({ schoolId: 1, sortOrder: 1 });

module.exports = mongoose.model('SchoolShift', schoolShiftSchema);
