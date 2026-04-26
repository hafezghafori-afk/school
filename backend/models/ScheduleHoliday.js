const mongoose = require('mongoose');

const scheduleHolidaySchema = new mongoose.Schema({
  date: { type: String, required: true, trim: true }, // YYYY-MM-DD
  title: { type: String, required: true, trim: true },
  note: { type: String, default: '' },
  isClosed: { type: Boolean, default: true }
}, { timestamps: true });

scheduleHolidaySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.model('ScheduleHoliday', scheduleHolidaySchema);
