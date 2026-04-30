const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  studentName: { type: String, required: true },
  fatherName: { type: String, default: '' },
  motherName: { type: String, default: '' },
  gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
  birthDate: { type: String, default: '' },
  grade: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  previousSchool: { type: String, default: '' },
  emergencyPhone: { type: String, default: '' },
  notes: { type: String, default: '' },
  documents: {
    idCardUrl: { type: String, default: '' },
    birthCertUrl: { type: String, default: '' },
    reportCardUrl: { type: String, default: '' },
    photoUrl: { type: String, default: '' }
  },
  registrationId: { type: String, default: '' },
  asasNumber: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  linkedStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanStudent',
    default: null
  },
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: { type: Date, default: null },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' }
}, { timestamps: true });

enrollmentSchema.index({ linkedStudentId: 1 }, { sparse: true });
enrollmentSchema.index({ linkedUserId: 1 }, { sparse: true });
enrollmentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
