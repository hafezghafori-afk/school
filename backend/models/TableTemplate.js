const mongoose = require('mongoose');

const tableTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  templateType: {
    type: String,
    enum: ['results', 'temporary', 'distinction', 'conditional', 'placement', 'summary', 'index', 'cover'],
    default: 'results',
    index: true
  },
  rowMode: {
    type: String,
    enum: ['full_results', 'status_filtered', 'summary', 'generated_index', 'cover'],
    default: 'full_results'
  },
  statusFilters: {
    type: [{
      type: String,
      enum: ['passed', 'failed', 'conditional', 'distinction', 'temporary', 'placement', 'excused', 'absent', 'pending']
    }],
    default: []
  },
  visibleColumns: { type: [String], default: [] },
  sortMode: {
    type: String,
    enum: ['rank', 'name', 'percentage', 'status', 'custom'],
    default: 'rank'
  },
  defaultOrientation: {
    type: String,
    enum: ['portrait', 'landscape'],
    default: 'landscape'
  },
  supportsRows: { type: Boolean, default: true },
  supportsSummary: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

tableTemplateSchema.pre('validate', function syncTableTemplateState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.title && this.code) {
    this.title = this.code;
  }
  this.visibleColumns = Array.isArray(this.visibleColumns)
    ? this.visibleColumns.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  this.statusFilters = Array.isArray(this.statusFilters)
    ? this.statusFilters.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (this.rowMode === 'cover') this.supportsRows = false;
});

tableTemplateSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('TableTemplate', tableTemplateSchema);
