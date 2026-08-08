const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

// Custom expense categories the academy defines themselves, on top of the
// built-in ones (معاش استادان، کرایه، ...) that ship hardcoded in the
// frontend's expenseCategoryLabels map. AcademyExpense.category stores
// whichever name was picked - built-in enum key or one of these - as a
// plain string, so no join is needed to read an expense back.
const academyExpenseCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

academyExpenseCategorySchema.pre('validate', function normalizeAcademyExpenseCategory() {
  this.name = String(this.name || '').trim();
});

module.exports = academyConnection.model('AcademyExpenseCategory', academyExpenseCategorySchema);
