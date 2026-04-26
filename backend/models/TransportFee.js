const mongoose = require('mongoose');

const transportFeeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  assessmentPeriodId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null, index: true },
  frequency: { type: String, enum: ['monthly', 'term', 'custom'], default: 'monthly' },
  amount: { type: Number, default: 0, min: 0 },
  dueDay: { type: Number, default: 10, min: 1, max: 28 },
  currency: { type: String, default: 'AFN', trim: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  source: { type: String, enum: ['manual', 'migration', 'system'], default: 'manual' },
  note: { type: String, default: '' }
}, { timestamps: true });

transportFeeSchema.pre('validate', function syncTransportFeeState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.note === 'string') this.note = this.note.trim();
  this.amount = Math.max(0, Number(this.amount) || 0);
});

transportFeeSchema.index({ studentMembershipId: 1, academicYearId: 1, assessmentPeriodId: 1, status: 1 });

module.exports = mongoose.model('TransportFee', transportFeeSchema);
