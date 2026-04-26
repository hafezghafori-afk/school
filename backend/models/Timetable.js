const mongoose = require('mongoose');

const DAY_VALUES = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const timetableSchema = new mongoose.Schema({
  configId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TimetableConfig',
    default: null,
    index: true
  },
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
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
    index: true
  },
  teacherAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeacherAssignment',
    required: true,
    index: true
  },
  dayOfWeek: {
    type: String,
    enum: DAY_VALUES,
    required: true,
    index: true
  },
  occurrenceDate: { type: String, default: '', trim: true, index: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  slotIndex: { type: Number, default: 0 },
  room: { type: String, default: '', trim: true },
  shift: {
    type: String,
    enum: ['', 'morning', 'afternoon', 'evening'],
    default: ''
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'published', 'archived'],
    default: 'active',
    index: true
  },
  source: {
    type: String,
    enum: ['manual', 'legacy_schedule', 'system'],
    default: 'manual'
  },
  legacyScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    default: undefined,
    unique: true,
    sparse: true
  },
  note: { type: String, default: '' }
}, { timestamps: true });

timetableSchema.pre('validate', function syncTimetableState() {
  this.dayOfWeek = normalizeText(this.dayOfWeek).toLowerCase();
  this.occurrenceDate = normalizeText(this.occurrenceDate);
  this.startTime = normalizeText(this.startTime);
  this.endTime = normalizeText(this.endTime);
  this.room = normalizeText(this.room);
  this.note = normalizeText(this.note);

  if (!DAY_VALUES.includes(this.dayOfWeek)) {
    this.dayOfWeek = 'monday';
  }
  if (this.slotIndex < 0) this.slotIndex = 0;
});

timetableSchema.index({ classId: 1, termId: 1, dayOfWeek: 1, startTime: 1, endTime: 1, status: 1 });
timetableSchema.index({ teacherAssignmentId: 1, dayOfWeek: 1, startTime: 1, endTime: 1, status: 1 });
timetableSchema.index({ occurrenceDate: 1, classId: 1, startTime: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);
