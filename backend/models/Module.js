const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Module', moduleSchema);
