const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academySupplyStudentSchema = new mongoose.Schema({
  studentCode: { type: String, required: true, trim: true, unique: true, uppercase: true },
  fullName: { type: String, required: true, trim: true, index: true },
  fatherName: { type: String, default: '', trim: true, index: true },
  className: { type: String, required: true, trim: true, index: true },
  phone: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academySupplyStudentSchema.pre('validate', function normalizeAcademySupplyStudent() {
  this.studentCode = String(this.studentCode || '').trim().toUpperCase();
  this.fullName = String(this.fullName || '').trim();
  this.fatherName = String(this.fatherName || '').trim();
  this.className = String(this.className || '').trim();
  this.phone = String(this.phone || '').trim();
  this.note = String(this.note || '').trim();
});

academySupplyStudentSchema.index({ studentCode: 'text', fullName: 'text', fatherName: 'text', className: 'text' });

module.exports = academyConnection.model('AcademySupplyStudent', academySupplyStudentSchema);
