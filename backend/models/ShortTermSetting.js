const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

// Single settings document for the whole center. `name` is read live by
// every form, receipt and report instead of being copied/cached anywhere -
// changing it here changes it everywhere at once (see GET /settings usage
// across shortTermRoutes.js).
const shortTermSettingSchema = new mongoose.Schema({
  name: { type: String, default: 'مرکز آموزش کوتاه‌مدت', trim: true },
  logoUrl: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  currency: { type: String, default: 'AFN', trim: true },
  // Three independent numbering series ("تمبر"/آی‌دی) an admin can define
  // from Settings without touching code: student ID, invoice/bill number,
  // and payment-receipt number.
  studentCodePrefix: { type: String, default: 'STC', trim: true, uppercase: true },
  invoicePrefix: { type: String, default: 'STC-INV', trim: true, uppercase: true },
  receiptPrefix: { type: String, default: 'STC-RCP', trim: true, uppercase: true },
  receiptFooter: { type: String, default: 'تشکر از پرداخت شما', trim: true },
  sealText: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermSettingSchema.pre('validate', function normalizeShortTermSetting() {
  this.name = String(this.name || '').trim() || 'مرکز آموزش کوتاه‌مدت';
  this.logoUrl = String(this.logoUrl || '').trim();
  this.address = String(this.address || '').trim();
  this.phone = String(this.phone || '').trim();
  this.email = String(this.email || '').trim();
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.studentCodePrefix = String(this.studentCodePrefix || 'STC').trim().toUpperCase() || 'STC';
  this.invoicePrefix = String(this.invoicePrefix || 'STC-INV').trim().toUpperCase() || 'STC-INV';
  this.receiptPrefix = String(this.receiptPrefix || 'STC-RCP').trim().toUpperCase() || 'STC-RCP';
  this.receiptFooter = String(this.receiptFooter || '').trim();
  this.sealText = String(this.sealText || '').trim();
});

module.exports = shortTermConnection.model('ShortTermSetting', shortTermSettingSchema);
