const mongoose = require('mongoose');

const homeworkSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  lesson: { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson', default: null },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 4000 },
  dueDate: { type: Date, default: null },
  maxScore: { type: Number, default: 100, min: 0, max: 100 },
  attachment: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

homeworkSchema.index({ course: 1, createdAt: -1 });
homeworkSchema.index({ classId: 1, createdAt: -1 });

module.exports = mongoose.model('Homework', homeworkSchema);
