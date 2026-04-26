const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema({
  questionText: { type: String, default: '' },
  options: [{ type: String, default: '' }],
  correctAnswer: { type: Number, default: 0 }
}, { _id: false });

const QuizSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  subject: { type: String, default: '', trim: true, index: true },
  questions: [quizQuestionSchema]
}, { timestamps: true });

QuizSchema.index({ classId: 1, subject: 1, createdAt: -1 });
QuizSchema.index({ course: 1, subject: 1, createdAt: -1 });

module.exports = mongoose.model('Quiz', QuizSchema);
