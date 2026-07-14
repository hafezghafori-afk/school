const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academySettingSchema = new mongoose.Schema({
  name: { type: String, default: 'آموزشگاه', trim: true },
  logoUrl: { type: String, default: '', trim: true },
  address: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  currency: { type: String, default: 'AFN', trim: true },
  invoicePrefix: { type: String, default: 'ACD', trim: true, uppercase: true },
  invoiceFooter: { type: String, default: 'تشکر از پرداخت شما', trim: true },
  receiptSize: { type: String, enum: ['a4', 'half', 'small'], default: 'half' },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academySettingSchema.pre('validate', function normalizeAcademySetting() {
  this.name = String(this.name || '').trim() || 'آموزشگاه';
  this.logoUrl = String(this.logoUrl || '').trim();
  this.address = String(this.address || '').trim();
  this.phone = String(this.phone || '').trim();
  this.email = String(this.email || '').trim();
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.invoicePrefix = String(this.invoicePrefix || 'ACD').trim().toUpperCase() || 'ACD';
  this.invoiceFooter = String(this.invoiceFooter || '').trim();
});

module.exports = academyConnection.model('AcademySetting', academySettingSchema);
