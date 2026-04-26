const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  homework: { type: mongoose.Schema.Types.ObjectId, ref: 'Homework', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 6000 },
  file: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  score: { type: Number, default: null },
  feedback: { type: String, default: '' },
  gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

submissionSchema.index({ homework: 1, student: 1 }, { unique: true });
submissionSchema.index({ classId: 1, student: 1, submittedAt: -1 });

module.exports = mongoose.model('HomeworkSubmission', submissionSchema);
