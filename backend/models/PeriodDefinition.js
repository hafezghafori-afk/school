const mongoose = require('mongoose');

// مدل تعریف ساعات درسی
const periodDefinitionSchema = new mongoose.Schema({
  timetableConfigurationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimetableConfiguration',
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
  type: {
    type: String,
    enum: ['class', 'break', 'lunch', 'prayer'],
    required: true,
    default: 'class'
  },
  title: {
    type: String,
    default: '',
    trim: true
  },
  isBreak: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Compound unique index
periodDefinitionSchema.index({ 
  timetableConfigurationId: 1, 
  dayCode: 1, 
  periodIndex: 1 
}, { unique: true });

// Additional indexes
periodDefinitionSchema.index({ timetableConfigurationId: 1, type: 1 });
periodDefinitionSchema.index({ timetableConfigurationId: 1, dayCode: 1, type: 1 });

module.exports = mongoose.model('PeriodDefinition', periodDefinitionSchema);
