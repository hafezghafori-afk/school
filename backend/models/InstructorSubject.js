const mongoose = require('mongoose');

const instructorSubjectSchema = new mongoose.Schema({
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  academicYear: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  note: { type: String, default: '' },
  isPrimary: { type: Boolean, default: false }
}, { timestamps: true });

instructorSubjectSchema.pre('validate', function syncInstructorSubjectState() {
  if (typeof this.note === 'string') {
    this.note = this.note.trim();
  }
});

instructorSubjectSchema.index({ instructor: 1, subject: 1, academicYear: 1, classId: 1 }, { unique: true });
instructorSubjectSchema.index({ classId: 1, academicYear: 1, instructor: 1, subject: 1 });
instructorSubjectSchema.index({ course: 1, academicYear: 1, instructor: 1 });

module.exports = mongoose.model('InstructorSubject', instructorSubjectSchema);
