const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  subject: { type: String, required: true },
  subjectRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
  instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startTime: { type: String, required: true }, // HH:MM
  endTime: { type: String, required: true }, // HH:MM
  note: { type: String, default: '' },
  room: { type: String, default: '', trim: true },
  shift: { type: String, enum: ['', 'morning', 'afternoon', 'evening'], default: '' },
  visibility: { type: String, enum: ['draft', 'published'], default: 'draft' }
}, { timestamps: true });

scheduleSchema.index({ date: 1, course: 1, instructor: 1 });
scheduleSchema.index({ date: 1, room: 1, startTime: 1, endTime: 1 });
scheduleSchema.index({ visibility: 1, date: 1 });

scheduleSchema.post('save', function syncTimetableAfterSave(doc) {
  const { syncTimetableFromLegacySchedule } = require('../utils/timetableSync');
  syncTimetableFromLegacySchedule(doc._id).catch(() => {});
});

scheduleSchema.post('findOneAndUpdate', function syncTimetableAfterUpdate(doc) {
  if (!doc?._id) return;
  const { syncTimetableFromLegacySchedule } = require('../utils/timetableSync');
  syncTimetableFromLegacySchedule(doc._id).catch(() => {});
});

scheduleSchema.post('findOneAndDelete', function removeTimetableAfterDelete(doc) {
  if (!doc?._id) return;
  const { removeTimetableByLegacySchedule } = require('../utils/timetableSync');
  removeTimetableByLegacySchedule(doc._id).catch(() => {});
});

module.exports = mongoose.model('Schedule', scheduleSchema);
