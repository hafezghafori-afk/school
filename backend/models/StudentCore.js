const mongoose = require('mongoose');

function normalizeTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const studentCoreSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    unique: true,
    sparse: true,
    index: true
  },
  admissionNo: { type: String, default: '', trim: true },
  fullName: { type: String, default: '', trim: true, index: true },
  preferredName: { type: String, default: '', trim: true },
  givenName: { type: String, default: '', trim: true },
  familyName: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  gender: {
    type: String,
    enum: ['', 'male', 'female', 'other'],
    default: ''
  },
  dateOfBirth: { type: String, default: '' },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
    index: true
  },
  note: { type: String, default: '' }
}, { timestamps: true });

studentCoreSchema.pre('validate', function syncStudentCoreState() {
  this.admissionNo = normalizeTrimmedString(this.admissionNo);
  if (!this.admissionNo) {
    this.admissionNo = undefined;
  }
  this.fullName = normalizeTrimmedString(this.fullName);
  this.preferredName = normalizeTrimmedString(this.preferredName);
  this.givenName = normalizeTrimmedString(this.givenName);
  this.familyName = normalizeTrimmedString(this.familyName);
  this.email = normalizeTrimmedString(this.email);
  this.phone = normalizeTrimmedString(this.phone);
  this.note = typeof this.note === 'string' ? this.note.trim() : '';

  if (!this.fullName) {
    this.fullName = this.preferredName || [this.givenName, this.familyName].filter(Boolean).join(' ').trim();
  }
  if (!this.preferredName) {
    this.preferredName = this.fullName;
  }
});

studentCoreSchema.index({ admissionNo: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('StudentCore', studentCoreSchema);

