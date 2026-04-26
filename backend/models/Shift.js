const mongoose = require('mongoose');

// مدل نوبت آموزشی (صبح/عصر)
const shiftSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    enum: ['morning', 'afternoon', 'evening'],
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
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
  isActive: {
    type: Boolean,
    default: true
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

// Indexes
shiftSchema.index({ schoolId: 1, name: 1 }, { unique: true });
shiftSchema.index({ schoolId: 1, isActive: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
