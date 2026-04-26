const mongoose = require('mongoose');

const galleryItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  tag: { type: String, default: '' },
  imageUrl: { type: String, required: true },
  description: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('GalleryItem', galleryItemSchema);
