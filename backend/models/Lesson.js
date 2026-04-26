const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  module: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  title: { type: String, required: true, trim: true },
  type: { type: String, enum: ['video', 'pdf', 'text'], default: 'video' },
  contentUrl: { type: String, default: '' },
  durationMinutes: { type: Number, default: 0 },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Lesson', lessonSchema);
