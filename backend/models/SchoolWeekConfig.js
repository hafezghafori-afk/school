const mongoose = require('mongoose');

const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7]; // 1=شنبه, 7=جمعه

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const schoolWeekConfigSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  workingDays: [{
    type: Number,
    enum: DAY_VALUES,
    required: true
  }],
  weekendDays: [{
    type: Number,
    enum: DAY_VALUES,
    required: true
  }],
  dayLabels: {
    type: Map,
    of: String,
    default: new Map([
      [1, 'شنبه'],
      [2, 'یکشنبه'],
      [3, 'دوشنبه'],
      [4, 'سه‌شنبه'],
      [5, 'چهارشنبه'],
      [6, 'پنجشنبه'],
      [7, 'جمعه']
    ])
  },
  weekStartDay: {
    type: Number,
    enum: DAY_VALUES,
    default: 1 // شنبه
  },
  hasHalfDayThursday: {
    type: Boolean,
    default: false
  },
  thursdayEndTime: {
    type: String,
    default: '12:00',
    trim: true
  },
  instructionalDaysPerWeek: {
    type: Number,
    default: 6
  },
  maxInstructionalDaysPerWeek: {
    type: Number,
    default: 6
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  notes: {
    type: String,
    default: '',
    trim: true
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

schoolWeekConfigSchema.pre('validate', function syncSchoolWeekConfigState() {
  this.notes = normalizeText(this.notes);
  this.thursdayEndTime = normalizeText(this.thursdayEndTime);

  // Ensure workingDays and weekendDays are arrays
  if (!Array.isArray(this.workingDays)) {
    this.workingDays = [];
  }
  if (!Array.isArray(this.weekendDays)) {
    this.weekendDays = [];
  }

  // Remove duplicates and ensure valid values
  this.workingDays = Array.from(new Set(this.workingDays.filter(day => DAY_VALUES.includes(day))));
  this.weekendDays = Array.from(new Set(this.weekendDays.filter(day => DAY_VALUES.includes(day))));

  // Ensure no overlap between working and weekend days
  const overlap = this.workingDays.filter(day => this.weekendDays.includes(day));
  if (overlap.length > 0) {
    // Remove overlapping days from working days
    this.workingDays = this.workingDays.filter(day => !this.weekendDays.includes(day));
  }

  // Calculate instructional days
  this.instructionalDaysPerWeek = this.workingDays.length;
  if (this.hasHalfDayThursday && this.workingDays.includes(6)) {
    // Count Thursday as half day
    this.instructionalDaysPerWeek = this.workingDays.length - 0.5;
  }

  // Validate time format for Thursday end time
  if (this.thursdayEndTime && !this.thursdayEndTime.match(/^\d{2}:\d{2}$/)) {
    this.thursdayEndTime = '12:00';
  }

  // Set reasonable limits
  if (this.instructionalDaysPerWeek < 0) this.instructionalDaysPerWeek = 0;
  if (this.instructionalDaysPerWeek > 7) this.instructionalDaysPerWeek = 7;
  if (this.maxInstructionalDaysPerWeek < 1) this.maxInstructionalDaysPerWeek = 6;
  if (this.maxInstructionalDaysPerWeek > 7) this.maxInstructionalDaysPerWeek = 7;
});

// Validation: Ensure at least one working day
schoolWeekConfigSchema.pre('save', function validateWorkingDays(next) {
  if (this.workingDays.length === 0) {
    return next(new Error('At least one working day is required'));
  }
  next();
});

// Static method to get default Afghan school week configuration
schoolWeekConfigSchema.statics.getDefaultAfghanConfig = function() {
  return {
    workingDays: [1, 2, 3, 4, 5, 6], // شنبه تا پنجشنبه
    weekendDays: [7], // جمعه
    dayLabels: new Map([
      [1, 'شنبه'],
      [2, 'یکشنبه'],
      [3, 'دوشنبه'],
      [4, 'سه‌شنبه'],
      [5, 'چهارشنبه'],
      [6, 'پنجشنبه'],
      [7, 'جمعه']
    ]),
    weekStartDay: 1,
    hasHalfDayThursday: false,
    thursdayEndTime: '12:00',
    instructionalDaysPerWeek: 6,
    maxInstructionalDaysPerWeek: 6
  };
};

// Instance method to check if a day is working day
schoolWeekConfigSchema.methods.isWorkingDay = function(dayNumber) {
  return this.workingDays.includes(dayNumber);
};

// Instance method to check if a day is weekend
schoolWeekConfigSchema.methods.isWeekend = function(dayNumber) {
  return this.weekendDays.includes(dayNumber);
};

// Instance method to get day label
schoolWeekConfigSchema.methods.getDayLabel = function(dayNumber) {
  return this.dayLabels.get(dayNumber) || `Day ${dayNumber}`;
};

// Instance method to get next working day
schoolWeekConfigSchema.methods.getNextWorkingDay = function(currentDay) {
  const sortedWorkingDays = [...this.workingDays].sort((a, b) => a - b);
  const currentIndex = sortedWorkingDays.indexOf(currentDay);
  
  if (currentIndex === -1 || currentIndex === sortedWorkingDays.length - 1) {
    return sortedWorkingDays[0]; // Return first working day if current is not working or is last
  }
  
  return sortedWorkingDays[currentIndex + 1];
};

// Indexes
schoolWeekConfigSchema.index({ schoolId: 1 }, { unique: true });
module.exports = mongoose.model('SchoolWeekConfig', schoolWeekConfigSchema);
