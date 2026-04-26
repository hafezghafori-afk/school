const mongoose = require('mongoose');

const virtualRecordingSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
  description: { type: String, default: '', maxlength: 2000 },
  sessionDate: { type: Date, default: Date.now },
  fileUrl: { type: String, required: true, trim: true },
  fileName: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

virtualRecordingSchema.index({ course: 1, sessionDate: -1, createdAt: -1 });
virtualRecordingSchema.index({ classId: 1, sessionDate: -1, createdAt: -1 });

module.exports = mongoose.model('VirtualRecording', virtualRecordingSchema);
