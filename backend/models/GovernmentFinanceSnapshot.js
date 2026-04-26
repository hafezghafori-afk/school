const mongoose = require('mongoose');

const governmentFinanceSnapshotSchema = new mongoose.Schema({
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
  reportType: {
    type: String,
    enum: ['quarterly', 'annual'],
    required: true,
    index: true
  },
  quarter: {
    type: Number,
    min: 1,
    max: 4,
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  reportKey: { type: String, default: '', trim: true, index: true },
  title: { type: String, default: '', trim: true },
  filters: { type: Object, default: {} },
  columns: { type: [Object], default: [] },
  summary: { type: Object, default: {} },
  rows: { type: [Object], default: [] },
  pack: { type: Object, default: null },
  sourceDigest: { type: String, default: '', trim: true },
  version: { type: Number, default: 1 },
  isOfficial: { type: Boolean, default: false, index: true },
  generatedAt: { type: Date, default: Date.now, index: true },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true });

governmentFinanceSnapshotSchema.index({ financialYearId: 1, reportType: 1, quarter: 1, classId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('GovernmentFinanceSnapshot', governmentFinanceSnapshotSchema);
