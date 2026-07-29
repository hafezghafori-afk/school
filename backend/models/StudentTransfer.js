const mongoose = require('mongoose');

const studentTransferSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  direction: { type: String, enum: ['in', 'out', 'internal'], required: true, index: true },
  sourceMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  targetMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null, index: true },
  sourceClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  targetClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  previousSchool: { type: String, default: '', trim: true },
  previousGrade: { type: String, default: '', trim: true },
  destinationSchool: { type: String, default: '', trim: true },
  financialStatus: { type: String, default: '', trim: true },
  effectiveAt: { type: Date, required: true, index: true },
  reason: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  status: { type: String, enum: ['applied', 'cancelled'], default: 'applied', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

studentTransferSchema.index({ student: 1, effectiveAt: -1 });
studentTransferSchema.index({ sourceMembershipId: 1, targetMembershipId: 1, direction: 1, effectiveAt: 1 });

module.exports = mongoose.model('StudentTransfer', studentTransferSchema);
