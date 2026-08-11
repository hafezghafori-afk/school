const mongoose = require('mongoose');
const shortTermConnection = require('./shortTermConnection');

const shortTermAttendanceStudentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermStudent', required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'leave'], default: 'present' },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const shortTermAttendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShortTermClass', required: true, index: true },
  attendanceDate: { type: String, required: true, trim: true, index: true },
  students: { type: [shortTermAttendanceStudentSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

shortTermAttendanceSchema.index({ classId: 1, attendanceDate: 1 }, { unique: true });

module.exports = shortTermConnection.model('ShortTermAttendance', shortTermAttendanceSchema);
