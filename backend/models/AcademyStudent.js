const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyStudentSchema = new mongoose.Schema({
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

academyStudentSchema.pre('validate', function normalizeAcademyStudent() {
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

// Note: tazkiraNumber is intentionally not added to this text index. It is
// never actually queried with $text anywhere in academyRoutes.js - all
// student search in this module runs client-side via studentMatchesSearch
// (see AcademyManagement.jsx), which already picks up every primitive field
// including tazkiraNumber automatically. Changing an existing text index's
// field list requires MongoDB to drop and recreate it (only one text index
// per collection is allowed), which is not worth the migration risk for an
// index nothing reads from.
academyStudentSchema.index({ fullName: 'text', fatherName: 'text', phone: 'text', studentCode: 'text' });

module.exports = academyConnection.model('AcademyStudent', academyStudentSchema);
