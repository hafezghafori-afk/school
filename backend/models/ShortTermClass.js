const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

// No separate Course/Teacher model on purpose - this center doesn't need
// them yet. Subject and (optional, free-text) teacher name live directly on
// the class; can be split into their own models later without touching
// Registration/Invoice, which only ever reference classId.
const shortTermClassSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  subject: { type: String, default: '', trim: true },
  teacherName: { type: String, default: '', trim: true },
  defaultFee: { type: Number, default: 0, min: 0 },
  days: { type: [String], default: [] },
  startTime: { type: String, default: '', trim: true },
  endTime: { type: String, default: '', trim: true },
  capacity: { type: Number, default: 0, min: 0 },
  room: { type: String, default: '', trim: true },
  startDate: { type: String, default: '', trim: true },
  endDate: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active', index: true },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermClassSchema.pre('validate', function normalizeShortTermClass() {
  this.name = String(this.name || '').trim();
  this.subject = String(this.subject || '').trim();
  this.teacherName = String(this.teacherName || '').trim();
  this.defaultFee = Math.max(0, Number(this.defaultFee || 0));
  this.days = Array.isArray(this.days) ? this.days.map((item) => String(item || '').trim()).filter(Boolean) : [];
  this.startTime = String(this.startTime || '').trim();
  this.endTime = String(this.endTime || '').trim();
  this.capacity = Math.max(0, Number(this.capacity || 0));
  this.room = String(this.room || '').trim();
  this.startDate = String(this.startDate || '').trim();
  this.endDate = String(this.endDate || '').trim();
  this.note = String(this.note || '').trim();
});

module.exports = shortTermConnection.model('ShortTermClass', shortTermClassSchema);
