const mongoose = require('mongoose');

const TREASURY_ACCOUNT_TYPES = [
  'cashbox',
  'bank',
  'hawala',
  'mobile_money',
  'other'
];

const financeTreasuryAccountSchema = new mongoose.Schema({
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
  code: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  accountType: {
    type: String,
    enum: TREASURY_ACCOUNT_TYPES,
    default: 'cashbox',
    index: true
  },
  currency: {
    type: String,
    default: 'AFN',
    trim: true
  },
  openingBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  providerName: {
    type: String,
    default: '',
    trim: true
  },
  branchName: {
    type: String,
    default: '',
    trim: true
  },
  accountNo: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastReconciledAt: {
    type: Date,
    default: null
  },
  lastReconciledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastStatementBalance: {
    type: Number,
    default: 0,
    min: 0
  },
  lastReconciliationVariance: {
    type: Number,
    default: 0
  },
  note: {
    type: String,
    default: '',
    trim: true
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

financeTreasuryAccountSchema.pre('validate', function syncFinanceTreasuryAccountState() {
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.currency === 'string') this.currency = this.currency.trim().toUpperCase() || 'AFN';
  if (typeof this.providerName === 'string') this.providerName = this.providerName.trim();
  if (typeof this.branchName === 'string') this.branchName = this.branchName.trim();
  if (typeof this.accountNo === 'string') this.accountNo = this.accountNo.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  this.openingBalance = Math.max(0, Number(this.openingBalance) || 0);
  this.lastStatementBalance = Math.max(0, Number(this.lastStatementBalance) || 0);
  this.lastReconciliationVariance = Number(this.lastReconciliationVariance || 0);
});

financeTreasuryAccountSchema.index({ schoolId: 1, financialYearId: 1, code: 1 }, { unique: true });
financeTreasuryAccountSchema.index({ schoolId: 1, financialYearId: 1, accountType: 1, isActive: 1 });

module.exports = mongoose.model('FinanceTreasuryAccount', financeTreasuryAccountSchema);
