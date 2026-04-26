const mongoose = require('mongoose');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map((entry) => normalizeText(entry)).filter(Boolean);
}

const educationPlanAnnualSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
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
  annualTargetPeriods: { type: Number, default: 0 },
  weeklyTargetPeriods: { type: Number, default: 0 },
  unitCount: { type: Number, default: 0 },
  learningGoals: [{ type: String, default: '' }],
  resourceList: [{ type: String, default: '' }],
  assessmentPolicy: { type: String, default: '' },
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

educationPlanAnnualSchema.pre('validate', function syncAnnualPlanState() {
  this.title = normalizeText(this.title);
  this.code = normalizeText(this.code);
  this.learningGoals = normalizeStringArray(this.learningGoals);
  this.resourceList = normalizeStringArray(this.resourceList);
  this.assessmentPolicy = normalizeText(this.assessmentPolicy);
  this.note = normalizeText(this.note);

  if (!this.title) this.title = 'Annual Plan';
  if (this.annualTargetPeriods < 0) this.annualTargetPeriods = 0;
  if (this.weeklyTargetPeriods < 0) this.weeklyTargetPeriods = 0;
  if (this.unitCount < 0) this.unitCount = 0;
});

educationPlanAnnualSchema.index({ academicYearId: 1, classId: 1, subjectId: 1, teacherAssignmentId: 1, status: 1 });
educationPlanAnnualSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('EducationPlanAnnual', educationPlanAnnualSchema);
