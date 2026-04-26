const mongoose = require('mongoose');

// مدل نصاب آموزشی (Curriculum Rule)
const curriculumRuleSchema = new mongoose.Schema({
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
  weeklyPeriods: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  isMandatory: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  consecutivePeriods: {
    type: Boolean,
    default: false
  },
  preferredTimeSlots: [{
    dayCode: {
      type: String,
      enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    periodIndexes: [Number]
  }],
  avoidTimeSlots: [{
    dayCode: {
      type: String,
      enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    periodIndexes: [Number]
  }],
  specialRequirements: {
    needsLab: { type: Boolean, default: false },
    needsComputer: { type: Boolean, default: false },
    needsPlayground: { type: Boolean, default: false },
    needsLibrary: { type: Boolean, default: false }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
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
curriculumRuleSchema.index({ 
  schoolId: 1, 
  academicYearId: 1, 
  classId: 1, 
  subjectId: 1 
}, { unique: true });

// Additional indexes
curriculumRuleSchema.index({ schoolId: 1, academicYearId: 1, classId: 1 });
curriculumRuleSchema.index({ schoolId: 1, academicYearId: 1, subjectId: 1 });
curriculumRuleSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('CurriculumRule', curriculumRuleSchema);
