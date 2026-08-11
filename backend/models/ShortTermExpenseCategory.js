const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

const shortTermExpenseCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

shortTermExpenseCategorySchema.pre('validate', function normalizeShortTermExpenseCategory() {
  this.name = String(this.name || '').trim();
});

module.exports = shortTermConnection.model('ShortTermExpenseCategory', shortTermExpenseCategorySchema);
