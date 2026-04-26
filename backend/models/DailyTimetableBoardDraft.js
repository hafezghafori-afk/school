const mongoose = require('mongoose');

const DAILY_DRAFT_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const DAILY_DRAFT_SLOT_ROWS = [
  { slotNumber: 1, label: 'زنگ 1', startTime: '08:00', endTime: '08:40' },
  { slotNumber: 2, label: 'زنگ 2', startTime: '08:40', endTime: '09:20' },
  { slotNumber: 3, label: 'زنگ 3', startTime: '09:20', endTime: '10:00' },
  { slotNumber: 4, label: 'زنگ 4', startTime: '10:10', endTime: '10:50' },
  { slotNumber: 5, label: 'زنگ 5', startTime: '10:50', endTime: '11:30' },
  { slotNumber: 6, label: 'زنگ 6', startTime: '11:30', endTime: '12:10' }
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createDefaultSlotRows() {
  return DAILY_DRAFT_SLOT_ROWS.map((item) => ({ ...item }));
}

const dailyTimetableBoardDraftItemSchema = new mongoose.Schema({
  teacherAssignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeacherAssignment',
    default: null
  },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  teacherName: {
    type: String,
    required: true,
    trim: true
  },
  day: {
    type: String,
    enum: DAILY_DRAFT_DAYS,
    required: true
  },
  period: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: '',
    trim: true
  },
  classroom: {
    type: String,
    default: '',
    trim: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null
  },
  classTitle: {
    type: String,
    default: '',
    trim: true
  }
}, { _id: false });

dailyTimetableBoardDraftItemSchema.pre('validate', function syncDraftItemState() {
  this.teacherName = normalizeText(this.teacherName);
  this.day = normalizeText(this.day).toLowerCase();
  this.subject = normalizeText(this.subject);
  this.category = normalizeText(this.category);
  this.classroom = normalizeText(this.classroom);
  this.classTitle = normalizeText(this.classTitle);
});

const dailyTimetableBoardSlotSchema = new mongoose.Schema({
  slotNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 6
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  startTime: {
    type: String,
    required: true,
    trim: true
  },
  endTime: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

dailyTimetableBoardSlotSchema.pre('validate', function syncDraftSlotState() {
  this.label = normalizeText(this.label);
  this.startTime = normalizeText(this.startTime);
  this.endTime = normalizeText(this.endTime);
});

const dailyTimetableBoardDraftSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    unique: true,
    index: true
  },
  selectedDay: {
    type: String,
    enum: DAILY_DRAFT_DAYS,
    default: 'saturday',
    required: true
  },
  activeClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null
  },
  activeClassTitle: {
    type: String,
    default: '',
    trim: true
  },
  slotRows: {
    type: [dailyTimetableBoardSlotSchema],
    default: createDefaultSlotRows
  },
  items: {
    type: [dailyTimetableBoardDraftItemSchema],
    default: []
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  publishedSelectedDay: {
    type: String,
    enum: DAILY_DRAFT_DAYS,
    default: 'saturday'
  },
  publishedActiveClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null
  },
  publishedActiveClassTitle: {
    type: String,
    default: '',
    trim: true
  },
  publishedSlotRows: {
    type: [dailyTimetableBoardSlotSchema],
    default: createDefaultSlotRows
  },
  publishedItems: {
    type: [dailyTimetableBoardDraftItemSchema],
    default: []
  },
  publishedAt: {
    type: Date,
    default: null
  },
  publishedBy: {
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

dailyTimetableBoardDraftSchema.pre('validate', function syncDraftState() {
  this.selectedDay = normalizeText(this.selectedDay).toLowerCase() || 'saturday';
  this.activeClassTitle = normalizeText(this.activeClassTitle);
  this.status = normalizeText(this.status).toLowerCase() === 'published' ? 'published' : 'draft';
  this.publishedSelectedDay = normalizeText(this.publishedSelectedDay).toLowerCase() || 'saturday';
  this.publishedActiveClassTitle = normalizeText(this.publishedActiveClassTitle);
});

module.exports = mongoose.model('DailyTimetableBoardDraft', dailyTimetableBoardDraftSchema);
