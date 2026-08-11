const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

const shortTermInvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, trim: true, unique: true, uppercase: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermStudent', required: true, index: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermRegistration', required: true, index: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermPayment', default: null, index: true },
  className: { type: String, default: '', trim: true },
  feeAmount: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  paidAmount: { type: Number, default: 0, min: 0 },
  previousBalance: { type: Number, default: 0, min: 0 },
  remainingBalance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true },
  paymentMethod: { type: String, default: 'cash', trim: true },
  referenceNo: { type: String, default: '', trim: true },
  issuedAt: { type: Date, default: Date.now, index: true },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, default: '', trim: true }
}, { timestamps: true });

shortTermInvoiceSchema.pre('validate', function normalizeShortTermInvoice() {
  this.invoiceNumber = String(this.invoiceNumber || '').trim().toUpperCase();
  this.className = String(this.className || '').trim();
  this.feeAmount = Math.max(0, Number(this.feeAmount || 0));
  this.discountAmount = Math.max(0, Number(this.discountAmount || 0));
  this.paidAmount = Math.max(0, Number(this.paidAmount || 0));
  this.previousBalance = Math.max(0, Number(this.previousBalance || 0));
  this.remainingBalance = Math.max(0, Number(this.remainingBalance || 0));
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.paymentMethod = String(this.paymentMethod || 'cash').trim();
  this.referenceNo = String(this.referenceNo || '').trim();
  this.note = String(this.note || '').trim();
});

module.exports = shortTermConnection.model('ShortTermInvoice', shortTermInvoiceSchema);
