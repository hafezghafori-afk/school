const mongoose = require('mongoose');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((entry) => normalizeText(entry)).filter(Boolean);
}

const educationPlanWeeklySchema = new mongoose.Schema({
  annualPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EducationPlanAnnual',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
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
    default: null,
    index: true
  },
  weekStartDate: { type: String, required: true, trim: true },
  weekEndDate: { type: String, default: '', trim: true },
  lessonTitle: { type: String, required: true, trim: true },
  lessonNumber: { type: Number, default: 1 },
  objectives: [{ type: String, default: '' }],
  topics: [{ type: String, default: '' }],
  activities: [{ type: String, default: '' }],
  resourceList: [{ type: String, default: '' }],
  homework: { type: String, default: '' },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'draft',
    index: true
  },
  source: {
    type: String,
    enum: ['manual', 'system', 'legacy_schedule'],
    default: 'manual'
  },
  note: { type: String, default: '' }
}, { timestamps: true });

educationPlanWeeklySchema.pre('validate', function syncWeeklyPlanState() {
  this.weekStartDate = normalizeText(this.weekStartDate);
  this.weekEndDate = normalizeText(this.weekEndDate);
  this.lessonTitle = normalizeText(this.lessonTitle);
  this.objectives = normalizeStringArray(this.objectives);
  this.topics = normalizeStringArray(this.topics);
  this.activities = normalizeStringArray(this.activities);
  this.resourceList = normalizeStringArray(this.resourceList);
  this.homework = normalizeText(this.homework);
  this.note = normalizeText(this.note);

  if (!this.weekEndDate) this.weekEndDate = this.weekStartDate;
  if (!this.lessonTitle) this.lessonTitle = 'Weekly Lesson';
  if (this.lessonNumber < 1) this.lessonNumber = 1;
});

educationPlanWeeklySchema.index({ annualPlanId: 1, weekStartDate: 1, lessonNumber: 1 });
educationPlanWeeklySchema.index({ classId: 1, termId: 1, weekStartDate: 1, status: 1 });

module.exports = mongoose.model('EducationPlanWeekly', educationPlanWeeklySchema);
