const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  score: { type: Number, required: true },
  totalQuestions: { type: Number, default: null },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);
