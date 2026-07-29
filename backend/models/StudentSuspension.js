const mongoose = require('mongoose');

const studentSuspensionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, default: null, index: true },
  liftedAt: { type: Date, default: null },
  reason: { type: String, required: true, trim: true },
  note: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'lifted', 'completed', 'cancelled'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  liftedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, optimisticConcurrency: true });

studentSuspensionSchema.index({ membershipId: 1, startsAt: 1, endsAt: 1 });
studentSuspensionSchema.index(
  { membershipId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('StudentSuspension', studentSuspensionSchema);
