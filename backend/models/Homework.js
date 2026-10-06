const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 4000 },
  dueDate: { type: Date, default: null },
  // Set by whoever assigns the homework (10, 20, 100, ...); capped only so a
  // typo like 10000 cannot slip through.
  maxScore: { type: Number, default: 100, min: 1, max: 1000 },
  attachment: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  copiedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Homework', default: null }
}, { timestamps: true });

homeworkSchema.index({ course: 1, createdAt: -1 });
homeworkSchema.index({ classId: 1, createdAt: -1 });

module.exports = mongoose.model('Homework', homeworkSchema);
