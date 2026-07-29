const mongoose = require('mongoose');

const studentDropoutSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  effectiveAt: { type: Date, required: true, index: true },
  reason: { type: String, required: true, trim: true },
  returnPossibility: { type: String, enum: ['', 'possible', 'unlikely', 'unknown'], default: '' },
  financialStatus: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  status: { type: String, enum: ['applied', 'cancelled'], default: 'applied', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

studentDropoutSchema.index({ student: 1, effectiveAt: -1 });
studentDropoutSchema.index({ membershipId: 1, effectiveAt: 1, status: 1 });

module.exports = mongoose.model('StudentDropout', studentDropoutSchema);
