const mongoose = require('mongoose');

const DEFAULT_PROMOTED_STATUSES = ['passed', 'distinction', 'placement'];
const DEFAULT_CONDITIONAL_STATUSES = ['conditional', 'temporary', 'excused'];
const DEFAULT_REPEATED_STATUSES = ['failed', 'absent', 'pending'];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatusList(values = [], fallback = []) {
  const source = Array.isArray(values) && values.length ? values : fallback;
  return Array.from(new Set(source.map((item) => normalizeText(item).toLowerCase()).filter(Boolean)));
}

const promotionRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  scope: {
    type: String,
    enum: ['global', 'academic_year', 'class'],
    default: 'global',
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  targetAcademicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  targetClassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  isTerminalClass: { type: Boolean, default: false },
  conditionalTargetMode: {
    type: String,
    enum: ['same_class', 'next_class', 'no_membership'],
    default: 'same_class'
  },
  promotedMembershipStatus: {
    type: String,
    enum: ['active', 'pending', 'suspended'],
    default: 'pending'
  },
  repeatedMembershipStatus: {
    type: String,
    enum: ['active', 'pending', 'suspended'],
    default: 'pending'
  },
  conditionalMembershipStatus: {
    type: String,
    enum: ['active', 'pending', 'suspended'],
    default: 'pending'
  },
  promotedStatuses: [{ type: String, trim: true }],
  conditionalStatuses: [{ type: String, trim: true }],
  repeatedStatuses: [{ type: String, trim: true }],
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

promotionRuleSchema.pre('validate', function syncPromotionRuleState() {
  if (typeof this.name === 'string') this.name = this.name.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.name && this.code) {
    this.name = this.code;
  }
  this.promotedStatuses = normalizeStatusList(this.promotedStatuses, DEFAULT_PROMOTED_STATUSES);
  this.conditionalStatuses = normalizeStatusList(this.conditionalStatuses, DEFAULT_CONDITIONAL_STATUSES);
  this.repeatedStatuses = normalizeStatusList(this.repeatedStatuses, DEFAULT_REPEATED_STATUSES);

  if (this.scope === 'global') {
    this.academicYearId = null;
    this.classId = null;
  }
  if (this.scope === 'academic_year') {
    this.classId = null;
  }
});

promotionRuleSchema.index({ code: 1 }, { unique: true, sparse: true });
promotionRuleSchema.index({ isDefault: 1 }, {
  unique: true,
  partialFilterExpression: { isDefault: true }
});
promotionRuleSchema.index({ scope: 1, academicYearId: 1, classId: 1, isActive: 1 });

module.exports = mongoose.model('PromotionRule', promotionRuleSchema);
