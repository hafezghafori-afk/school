const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyTeacherSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, index: true },
  phone: { type: String, default: '', trim: true },
  specialty: { type: String, default: '', trim: true },
  paymentType: { type: String, enum: ['salary', 'percent', 'contract'], default: 'salary' },
  paymentAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyTeacherSchema.pre('validate', function normalizeAcademyTeacher() {
  this.fullName = String(this.fullName || '').trim();
  this.phone = String(this.phone || '').trim();
  this.specialty = String(this.specialty || '').trim();
  this.note = String(this.note || '').trim();
  this.paymentAmount = Math.max(0, Number(this.paymentAmount || 0));
});

module.exports = academyConnection.model('AcademyTeacher', academyTeacherSchema);
