const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyExpenseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  // No enum here on purpose: the academy can define its own categories
  // (see AcademyExpenseCategory) on top of the built-in ones the frontend
  // hardcodes labels for, so this just stores whichever name was chosen.
  category: {
    type: String,
    default: 'other',
    trim: true,
    index: true
  },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'AFN', trim: true },
  expenseDate: { type: String, default: '', trim: true, index: true },
  paymentMethod: { type: String, enum: ['cash', 'card', 'bank_transfer', 'hawala', 'other'], default: 'cash' },
  paidTo: { type: String, default: '', trim: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyExpenseSchema.pre('validate', function normalizeAcademyExpense() {
  this.title = String(this.title || '').trim();
  this.amount = Math.max(0, Number(this.amount || 0));
  this.currency = String(this.currency || 'AFN').trim().toUpperCase() || 'AFN';
  this.expenseDate = String(this.expenseDate || '').trim() || new Date().toISOString().slice(0, 10);
  this.paidTo = String(this.paidTo || '').trim();
  this.note = String(this.note || '').trim();
});

module.exports = academyConnection.model('AcademyExpense', academyExpenseSchema);
