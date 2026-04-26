const mongoose = require('mongoose');

const virtualClassSessionSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  title: { type: String, required: true, trim: true, minlength: 2, maxlength: 180 },
  description: { type: String, default: '', maxlength: 2000 },
  provider: {
    type: String,
    enum: ['manual', 'google_meet', 'zoom', 'jitsi', 'teams', 'other'],
    default: 'manual'
  },
  meetingUrl: { type: String, required: true, trim: true, maxlength: 1200 },
  accessCode: { type: String, default: '', trim: true, maxlength: 120 },
  scheduledAt: { type: Date, required: true, default: Date.now },
  status: { type: String, enum: ['scheduled', 'live', 'ended'], default: 'scheduled' },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

virtualClassSessionSchema.index({ course: 1, scheduledAt: -1, createdAt: -1 });
virtualClassSessionSchema.index({ status: 1, scheduledAt: 1 });

module.exports = mongoose.model('VirtualClassSession', virtualClassSessionSchema);
