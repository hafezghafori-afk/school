const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyPaymentSchema = new mongoose.Schema({
  paymentNumber: { type: String, required: true, trim: true, unique: true, uppercase: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true, index: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyRegistration', required: true, index: true },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyInvoice', default: null, index: true },
  amount: { type: Number, required: true, min: 1 },
  previousBalance: { type: Number, default: 0, min: 0 },
  remainingBalance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'hawala', 'other'], default: 'cash' },
  paidAt: { type: Date, default: Date.now, index: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  referenceNo: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true }
}, { timestamps: true });

academyPaymentSchema.pre('validate', function normalizeAcademyPayment() {
  this.paymentNumber = String(this.paymentNumber || '').trim().toUpperCase();
  this.amount = Math.max(0, Number(this.amount || 0));
  this.previousBalance = Math.max(0, Number(this.previousBalance || 0));
  this.remainingBalance = Math.max(0, Number(this.remainingBalance || 0));
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.referenceNo = String(this.referenceNo || '').trim();
  this.note = String(this.note || '').trim();
});

module.exports = academyConnection.model('AcademyPayment', academyPaymentSchema);
