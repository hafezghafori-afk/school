const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academySupplyClassPriceSchema = new mongoose.Schema({
  className: { type: String, required: true, trim: true, unique: true, index: true },
  bookPrice: { type: Number, default: 0, min: 0 },
  uniformPrice: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academySupplyClassPriceSchema.pre('validate', function normalizeAcademySupplyClassPrice() {
  this.className = String(this.className || '').trim();
  this.bookPrice = Math.max(0, Number(this.bookPrice || 0));
  this.uniformPrice = Math.max(0, Number(this.uniformPrice || 0));
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.note = String(this.note || '').trim();
});

module.exports = academyConnection.model('AcademySupplyClassPrice', academySupplyClassPriceSchema);
