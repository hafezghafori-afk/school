const mongoose = require('mongoose');

const assessment40Schema = new mongoose.Schema({
  assessment1Score: { type: Number, default: 0, min: 0, max: 10 },
  assessment2Score: { type: Number, default: 0, min: 0, max: 10 },
  assessment3Score: { type: Number, default: 0, min: 0, max: 10 },
  assessment4Score: { type: Number, default: 0, min: 0, max: 10 },
  total: { type: Number, default: 0, min: 0, max: 40 }
}, { _id: false });

const gradeSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  assessment40: { type: assessment40Schema, default: () => ({}) },
  finalExamScore: { type: Number, default: 0, min: 0, max: 60 },
  term1Score: { type: Number, default: 0, min: 0, max: 40 },
  term2Score: { type: Number, default: 0, min: 0, max: 60 },
  totalScore: { type: Number, default: 0, min: 0, max: 100 },
  attachment: { type: String, default: '' },
  attachmentOriginalName: { type: String, default: '' },
  attachmentUploadedAt: { type: Date, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

gradeSchema.index(
  { studentMembershipId: 1 },
  {
    unique: true,
    partialFilterExpression: { studentMembershipId: { $type: 'objectId' } }
  }
);
gradeSchema.index({ student: 1, course: 1 });
gradeSchema.index({ classId: 1, academicYearId: 1, course: 1 });

module.exports = mongoose.model('Grade', gradeSchema);
