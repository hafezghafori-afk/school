const mongoose = require('mongoose');

// مدل حضور و محدودیت‌های استاد
const teacherAvailabilitySchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
    index: true
  },
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true,
    index: true
  },
  availableDays: [{
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    required: true
  }],
  availablePeriods: [{
    dayCode: {
      type: String,
      enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      required: true
    },
    periodIndexes: [Number]
  }],
  unavailablePeriods: [{
    dayCode: {
      type: String,
      enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      required: true
    },
    periodIndexes: [Number],
    reason: {
      type: String,
      default: '',
      trim: true
    }
  }],
  preferredOffPeriods: [{
    dayCode: {
      type: String,
      enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      required: true
    },
    periodIndexes: [Number],
    reason: {
      type: String,
      default: '',
      trim: true
    }
  }],
  maxPeriodsPerDay: {
    type: Number,
    default: 6,
    min: 1,
    max: 8
  },
  maxPeriodsPerWeek: {
    type: Number,
    default: 24,
    min: 1,
    max: 40
  },
  prefersConsecutivePeriods: {
    type: Boolean,
    default: false
  },
  avoidFirstPeriod: {
    type: Boolean,
    default: false
  },
  avoidLastPeriod: {
    type: Boolean,
    default: false
  },
  minGapBetweenPeriods: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  specialConstraints: {
    onlyMorningShift: { type: Boolean, default: false },
    onlyAfternoonShift: { type: Boolean, default: false },
    noBackToBackClasses: { type: Boolean, default: false },
    prefersSameClassroom: { type: Boolean, default: false }
  },
  temporaryRestrictions: [{
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    restrictionType: {
      type: String,
      enum: ['unavailable', 'limited_hours', 'specific_periods'],
      required: true
    },
    details: { type: String, default: '' }
  }],
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave', 'suspended'],
    default: 'active'
  },
  notes: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Compound unique index
teacherAvailabilitySchema.index({ 
  schoolId: 1, 
  teacherId: 1, 
  academicYearId: 1, 
  shiftId: 1 
}, { unique: true });

// Additional indexes
teacherAvailabilitySchema.index({ schoolId: 1, academicYearId: 1, teacherId: 1 });
teacherAvailabilitySchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('TeacherAvailability', teacherAvailabilitySchema);
