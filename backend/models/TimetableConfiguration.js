const mongoose = require('mongoose');

// مدل تنظیمات تقسیم اوقات
const timetableConfigurationSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
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
  workingDays: [{
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    required: true
  }],
  periodsPerDay: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  breakPeriods: [{
    periodIndex: {
      type: Number,
      required: true,
      min: 1
    },
    type: {
      type: String,
      enum: ['break', 'lunch', 'prayer'],
      required: true
    },
    duration: {
      type: Number,
      required: true,
      min: 5
    }
  }],
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft'
  },
  isActive: {
    type: Boolean,
    default: false
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

// Indexes
timetableConfigurationSchema.index({ schoolId: 1, academicYearId: 1, shiftId: 1 }, { unique: true });
timetableConfigurationSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('TimetableConfiguration', timetableConfigurationSchema);
