const mongoose = require('mongoose');

const marginSchema = new mongoose.Schema({
  top: { type: Number, default: 24, min: 0 },
  right: { type: Number, default: 24, min: 0 },
  bottom: { type: Number, default: 24, min: 0 },
  left: { type: Number, default: 24, min: 0 }
}, { _id: false });

const tableConfigSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  fontFamily: { type: String, default: 'Tahoma', trim: true },
  fontSize: { type: Number, default: 12, min: 8, max: 32 },
  orientation: {
    type: String,
    enum: ['portrait', 'landscape'],
    default: 'landscape'
  },
  logoMode: {
    type: String,
    enum: ['site', 'custom', 'none'],
    default: 'site'
  },
  logoUrl: { type: String, default: '' },
  headerText: { type: String, default: '' },
  footerText: { type: String, default: '' },
  showHeader: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  showLogo: { type: Boolean, default: true },
  showPageNumber: { type: Boolean, default: true },
  showGeneratedAt: { type: Boolean, default: true },
  margins: { type: marginSchema, default: () => ({}) },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

tableConfigSchema.pre('validate', function syncTableConfigState() {
  if (typeof this.name === 'string') this.name = this.name.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.fontFamily === 'string') this.fontFamily = this.fontFamily.trim();
  if (typeof this.logoUrl === 'string') this.logoUrl = this.logoUrl.trim();
  if (typeof this.headerText === 'string') this.headerText = this.headerText.trim();
  if (typeof this.footerText === 'string') this.footerText = this.footerText.trim();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.name && this.code) {
    this.name = this.code;
  }
  if (this.logoMode === 'none') {
    this.showLogo = false;
  }
});

tableConfigSchema.index({ code: 1 }, { unique: true, sparse: true });
tableConfigSchema.index({ isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

module.exports = mongoose.model('TableConfig', tableConfigSchema);
