const mongoose = require('mongoose');

const TREASURY_TRANSACTION_TYPES = [
  'deposit',
  'withdrawal',
  'adjustment_in',
  'adjustment_out',
  'transfer_in',
  'transfer_out',
  'reconciliation_adjustment'
];

const financeTreasuryTransactionSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    required: true,
    index: true
  },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    required: true,
    index: true
  },
  counterAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinanceTreasuryAccount',
    default: null,
    index: true
  },
  transactionGroupKey: {
    type: String,
    default: '',
    trim: true,
    index: true
  },
  transactionType: {
    type: String,
    enum: TREASURY_TRANSACTION_TYPES,
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['in', 'out'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'AFN',
    trim: true
  },
  transactionDate: {
    type: Date,
    required: true,
    index: true
  },
  sourceType: {
    type: String,
    enum: ['manual', 'transfer', 'reconciliation', 'procurement_settlement'],
    default: 'manual',
    index: true
  },
  referenceNo: {
    type: String,
    default: '',
    trim: true
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['posted', 'void'],
    default: 'posted',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

financeTreasuryTransactionSchema.pre('validate', function syncFinanceTreasuryTransactionState() {
  if (typeof this.transactionGroupKey === 'string') this.transactionGroupKey = this.transactionGroupKey.trim();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.referenceNo === 'string') this.referenceNo = this.referenceNo.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  this.amount = Math.max(0, Number(this.amount) || 0);
});

financeTreasuryTransactionSchema.index({ financialYearId: 1, status: 1, transactionDate: -1 });
financeTreasuryTransactionSchema.index({ accountId: 1, status: 1, transactionDate: -1 });
financeTreasuryTransactionSchema.index({ transactionGroupKey: 1, transactionType: 1 });

module.exports = mongoose.model('FinanceTreasuryTransaction', financeTreasuryTransactionSchema);
