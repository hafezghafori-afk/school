const mongoose = require('mongoose');

const DAY_VALUES = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const timetableConfigSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  termId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicTerm',
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    required: true,
    index: true
  },
  daysOfWeek: [{ type: String, enum: DAY_VALUES }],
  dayStartTime: { type: String, default: '' },
  dayEndTime: { type: String, default: '' },
  slotDurationMinutes: { type: Number, default: 45 },
  breakDurationMinutes: { type: Number, default: 10 },
  maxDailyPeriods: { type: Number, default: 8 },
  defaultShift: {
    type: String,
    enum: ['', 'morning', 'afternoon', 'evening'],
    default: ''
  },
  roomPolicy: {
    type: String,
    enum: ['classroom', 'flexible', 'lab'],
    default: 'classroom'
  },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  source: {
    type: String,
    enum: ['manual', 'legacy_schedule', 'system'],
    default: 'manual'
  },
  note: { type: String, default: '' }
}, { timestamps: true });

timetableConfigSchema.pre('validate', function syncTimetableConfigState() {
  this.name = normalizeText(this.name);
  this.code = normalizeText(this.code);
  this.dayStartTime = normalizeText(this.dayStartTime);
  this.dayEndTime = normalizeText(this.dayEndTime);
  this.note = normalizeText(this.note);

  const rawDays = Array.isArray(this.daysOfWeek) ? this.daysOfWeek : [];
  this.daysOfWeek = Array.from(new Set(rawDays.map((entry) => normalizeText(entry).toLowerCase()).filter((entry) => DAY_VALUES.includes(entry))));

  if (!this.name) {
    this.name = 'Timetable Config';
  }
  if (this.slotDurationMinutes < 1) this.slotDurationMinutes = 45;
  if (this.breakDurationMinutes < 0) this.breakDurationMinutes = 0;
  if (this.maxDailyPeriods < 1) this.maxDailyPeriods = 8;
});

timetableConfigSchema.index({ classId: 1, academicYearId: 1, termId: 1, isActive: 1 });
timetableConfigSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('TimetableConfig', timetableConfigSchema);
