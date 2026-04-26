const mongoose = require('mongoose');

const newsItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  category: { type: String, enum: ['news', 'announcement', 'event'], default: 'news' },
  summary: { type: String, default: '' },
  content: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  publishedAt: { type: Date, default: Date.now },
  enabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('NewsItem', newsItemSchema);
