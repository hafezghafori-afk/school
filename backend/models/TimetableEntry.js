const mongoose = require('mongoose');

// مدل ورودی‌های تقسیم اوقات (خروجی نهایی)
const timetableEntrySchema = new mongoose.Schema({
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
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  periodDefinitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PeriodDefinition',
    required: true,
    index: true
  },
  dayCode: {
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    required: true,
    index: true
  },
  periodIndex: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  startTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  endTime: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
  },
  classroomNumber: {
    type: String,
    default: '',
    trim: true
  },
  building: {
    type: String,
    default: '',
    trim: true
  },
  floor: {
    type: String,
    default: '',
    trim: true
  },
  source: {
    type: String,
    enum: ['auto', 'manual', 'manual_edit', 'manual_move', 'manual_override', 'imported'],
    default: 'auto'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'substituted'],
    default: 'draft'
  },
  isSubstituted: {
    type: Boolean,
    default: false
  },
  originalTeacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  substituteReason: {
    type: String,
    default: '',
    trim: true
  },
  specialNotes: {
    type: String,
    default: '',
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedAt: {
    type: Date,
    default: null
  },
  publishedAt: {
    type: Date,
    default: null
  },
  publishedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

// Compound unique indexes for conflict prevention
timetableEntrySchema.index({ 
  schoolId: 1, 
  academicYearId: 1, 
  shiftId: 1, 
  classId: 1, 
  dayCode: 1, 
  periodIndex: 1 
}, { unique: true });

timetableEntrySchema.index({ 
  schoolId: 1, 
  academicYearId: 1, 
  shiftId: 1, 
  teacherId: 1, 
  dayCode: 1, 
  periodIndex: 1 
}, { unique: true });

// Additional indexes
timetableEntrySchema.index({ schoolId: 1, academicYearId: 1, classId: 1 });
timetableEntrySchema.index({ schoolId: 1, academicYearId: 1, teacherId: 1 });
timetableEntrySchema.index({ schoolId: 1, academicYearId: 1, status: 1 });
timetableEntrySchema.index({ schoolId: 1, dayCode: 1, periodIndex: 1 });

module.exports = mongoose.model('TimetableEntry', timetableEntrySchema);
