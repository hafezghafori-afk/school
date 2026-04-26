const mongoose = require('mongoose');

function normalizeTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  price: { type: Number, default: 0, min: 0 },
  category: { type: String, default: '', trim: true },
  level: { type: String, default: '', trim: true },
  tags: [{ type: String, trim: true }],
  kind: {
    type: String,
    enum: ['academic_class', 'public_course'],
    default: 'academic_class',
    index: true
  },
  academicYearRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  schoolClassRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  gradeLevel: { type: String, default: '', trim: true },
  section: { type: String, default: '', trim: true },
  homeroomInstructor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  isActive: { type: Boolean, default: true, index: true },
  videoUrl: { type: String, default: '' },
  pdfUrl: { type: String, default: '' },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }]
}, { timestamps: true });

courseSchema.pre('validate', function syncCourseAcademicState() {
  this.category = normalizeTrimmedString(this.category);
  this.gradeLevel = normalizeTrimmedString(this.gradeLevel);
  this.section = normalizeTrimmedString(this.section);
  this.level = normalizeTrimmedString(this.level);

  if (!this.gradeLevel && this.category) {
    this.gradeLevel = this.category;
  }
  if (!this.category && this.gradeLevel) {
    this.category = this.gradeLevel;
  }

  if (!Array.isArray(this.tags)) {
    this.tags = [];
  }
  this.tags = this.tags
    .map((tag) => normalizeTrimmedString(tag))
    .filter(Boolean);

  if (!this.kind) {
    this.kind = this.gradeLevel || this.academicYearRef || this.section || this.homeroomInstructor
      ? 'academic_class'
      : 'public_course';
  }
});

courseSchema.index({ title: 'text', description: 'text', tags: 'text' });
courseSchema.index({ category: 1, level: 1, price: 1, createdAt: -1 });
courseSchema.index({ kind: 1, academicYearRef: 1, gradeLevel: 1, section: 1, isActive: 1 });
courseSchema.index({ homeroomInstructor: 1, academicYearRef: 1, isActive: 1 });
courseSchema.index({ schoolClassRef: 1, kind: 1 });

module.exports = mongoose.model('Course', courseSchema);
