const mongoose = require('mongoose');

const studentReEnrollmentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  previousMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  targetMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, unique: true, index: true },
  sourceStatus: { type: String, default: '', trim: true },
  targetClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', required: true, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  effectiveAt: { type: Date, required: true, index: true },
  reason: { type: String, required: true, trim: true },
  authorityReference: { type: String, default: '', trim: true },
  approvalStatus: { type: String, enum: ['approved'], default: 'approved' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '', trim: true }
}, { timestamps: true });

studentReEnrollmentSchema.index({ student: 1, effectiveAt: -1, createdAt: -1 });

module.exports = mongoose.model('StudentReEnrollment', studentReEnrollmentSchema);
