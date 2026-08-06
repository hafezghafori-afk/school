const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academySupplySaleSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademySupplyStudent', required: true, unique: true, index: true },
  studentCode: { type: String, default: '', trim: true, uppercase: true, index: true },
  studentName: { type: String, default: '', trim: true },
  fatherName: { type: String, default: '', trim: true },
  className: { type: String, required: true, trim: true, index: true },
  bookTaken: { type: Boolean, default: false, index: true },
  uniformTaken: { type: Boolean, default: false, index: true },
  bookPrice: { type: Number, default: 0, min: 0 },
  uniformPrice: { type: Number, default: 0, min: 0 },
  bookDiscount: { type: Number, default: 0, min: 0 },
  uniformDiscount: { type: Number, default: 0, min: 0 },
  bookDate: { type: String, default: '', trim: true },
  uniformDate: { type: String, default: '', trim: true },
  uniformSize: { type: String, default: '', trim: true },
  totalAmount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'AFN', trim: true, uppercase: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academySupplySaleSchema.pre('validate', function normalizeAcademySupplySale() {
  this.studentCode = String(this.studentCode || '').trim().toUpperCase();
  this.studentName = String(this.studentName || '').trim();
  this.fatherName = String(this.fatherName || '').trim();
  this.className = String(this.className || '').trim();
  this.bookPrice = this.bookTaken ? Math.max(0, Number(this.bookPrice || 0)) : 0;
  this.uniformPrice = this.uniformTaken ? Math.max(0, Number(this.uniformPrice || 0)) : 0;
  // Discount can never exceed its own item's price (no negative net price),
  // and only applies to an item the student actually took.
  this.bookDiscount = this.bookTaken ? Math.min(this.bookPrice, Math.max(0, Number(this.bookDiscount || 0))) : 0;
  this.uniformDiscount = this.uniformTaken ? Math.min(this.uniformPrice, Math.max(0, Number(this.uniformDiscount || 0))) : 0;
  this.bookDate = this.bookTaken ? String(this.bookDate || '').trim() : '';
  this.uniformDate = this.uniformTaken ? String(this.uniformDate || '').trim() : '';
  this.uniformSize = this.uniformTaken ? String(this.uniformSize || '').trim() : '';
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.note = String(this.note || '').trim();
  this.totalAmount = (this.bookPrice - this.bookDiscount) + (this.uniformPrice - this.uniformDiscount);
});

academySupplySaleSchema.index({ className: 1, bookTaken: 1, uniformTaken: 1 });

module.exports = academyConnection.model('AcademySupplySale', academySupplySaleSchema);
