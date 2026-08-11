const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

const shortTermStudentSchema = new mongoose.Schema({
  studentCode: { type: String, required: true, trim: true, unique: true, uppercase: true },
  firstName: { type: String, default: '', trim: true },
  lastName: { type: String, default: '', trim: true },
  fullName: { type: String, default: '', trim: true, index: true },
  fatherName: { type: String, default: '', trim: true },
  tazkiraNumber: { type: String, default: '', trim: true, index: true },
  gender: { type: String, enum: ['', 'male', 'female', 'other'], default: '' },
  dateOfBirth: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  guardianPhone: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  photoUrl: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'inactive', 'completed'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermStudentSchema.pre('validate', function normalizeShortTermStudent() {
  this.studentCode = String(this.studentCode || '').trim().toUpperCase();
  this.firstName = String(this.firstName || '').trim();
  this.lastName = String(this.lastName || '').trim();
  this.fullName = String(this.fullName || '').trim() || [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  this.fatherName = String(this.fatherName || '').trim();
  this.tazkiraNumber = String(this.tazkiraNumber || '').trim();
  this.dateOfBirth = String(this.dateOfBirth || '').trim();
  this.phone = String(this.phone || '').trim();
  this.guardianPhone = String(this.guardianPhone || '').trim();
  this.address = String(this.address || '').trim();
  this.photoUrl = String(this.photoUrl || '').trim();
  this.note = String(this.note || '').trim();
});

shortTermStudentSchema.index({ fullName: 'text', fatherName: 'text', phone: 'text', studentCode: 'text' });

module.exports = shortTermConnection.model('ShortTermStudent', shortTermStudentSchema);
