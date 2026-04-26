const mongoose = require('mongoose');

// مدل مضمون درسی با ساختار افغانستان
const subjectSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  nameDari: {
    type: String,
    required: true,
    trim: true
  },
  namePashto: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['core', 'elective', 'practical', 'religious', 'language'],
    default: 'core'
  },
  subjectType: {
    type: String,
    required: true,
    enum: ['theoretical', 'practical', 'theoretical_practical'],
    default: 'theoretical'
  },
  ministryCode: {
    type: String,
    default: '',
    trim: true
  },
  gradeLevels: [{
    type: Number,
    min: 1,
    max: 12
  }],
  weeklyHours: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  credits: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isPractical: {
    type: Boolean,
    default: false
  },
  requiresLab: {
    type: Boolean,
    default: false
  },
  requiresComputer: {
    type: Boolean,
    default: false
  },
  grade: { type: String, default: '', trim: true }, // Legacy field
  note: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  description: {
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

// Virtual for display name
subjectSchema.virtual('displayName').get(function() {
  return `${this.name} (${this.code})`;
});

// Indexes
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
subjectSchema.index({ schoolId: 1, category: 1 });
subjectSchema.index({ schoolId: 1, status: 1 });
subjectSchema.index({ gradeLevels: 1 });
subjectSchema.index({ name: 1, grade: 1 }, { unique: true, sparse: true });
subjectSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Subject', subjectSchema);
