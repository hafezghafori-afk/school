const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyClassSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyCourse', required: true, index: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyTeacher', default: null, index: true },
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

academyClassSchema.pre('validate', function normalizeAcademyClass() {
  this.name = String(this.name || '').trim();
  this.days = Array.isArray(this.days) ? this.days.map((item) => String(item || '').trim()).filter(Boolean) : [];
  this.startTime = String(this.startTime || '').trim();
  this.endTime = String(this.endTime || '').trim();
  this.capacity = Math.max(0, Number(this.capacity || 0));
  this.room = String(this.room || '').trim();
  this.startDate = String(this.startDate || '').trim();
  this.endDate = String(this.endDate || '').trim();
  this.note = String(this.note || '').trim();
});

module.exports = academyConnection.model('AcademyClass', academyClassSchema);
