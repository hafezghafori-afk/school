const mongoose = require('mongoose');

const COLOR_TONES = ['teal', 'copper', 'slate', 'rose', 'mint', 'sand'];

function slugifyKey(value = '', fallback = 'other') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

const expenseSubCategorySchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  isActive: { type: Boolean, default: true },
  order: { type: Number, default: 0 }
}, { _id: false });

const expenseCategoryDefinitionSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, unique: true, index: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  colorTone: {
    type: String,
    enum: COLOR_TONES,
    default: 'teal'
  },
  isActive: { type: Boolean, default: true, index: true },
  isSystem: { type: Boolean, default: false, index: true },
  order: { type: Number, default: 0 },
  subCategories: {
    type: [expenseSubCategorySchema],
    default: []
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

expenseCategoryDefinitionSchema.pre('validate', function normalizeExpenseCategoryDefinition() {
  this.key = slugifyKey(this.key, this.label || 'other');
  if (typeof this.label === 'string') this.label = this.label.trim();
  if (typeof this.description === 'string') this.description = this.description.trim();
  if (!COLOR_TONES.includes(this.colorTone)) this.colorTone = 'teal';
  this.order = Number.isFinite(Number(this.order)) ? Number(this.order) : 0;

  const seen = new Set();
  this.subCategories = (Array.isArray(this.subCategories) ? this.subCategories : [])
    .map((item, index) => {
      const key = slugifyKey(item?.key || item?.label || `item_${index + 1}`, `item_${index + 1}`);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        key,
        label: String(item?.label || key).trim(),
        description: String(item?.description || '').trim(),
        isActive: item?.isActive !== false,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index
      };
    })
    .filter(Boolean)
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0));
});

expenseCategoryDefinitionSchema.index({ isActive: 1, order: 1, label: 1 });

module.exports = mongoose.model('ExpenseCategoryDefinition', expenseCategoryDefinitionSchema);
