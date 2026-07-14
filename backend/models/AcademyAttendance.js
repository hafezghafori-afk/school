const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyAttendanceStudentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyStudent', required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'leave'], default: 'present' },
  note: { type: String, default: '', trim: true }
}, { _id: false });

const academyAttendanceSchema = new mongoose.Schema({
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademyClass', required: true, index: true },
  attendanceDate: { type: String, required: true, trim: true, index: true },
  students: { type: [academyAttendanceStudentSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyAttendanceSchema.index({ classId: 1, attendanceDate: 1 }, { unique: true });

module.exports = academyConnection.model('AcademyAttendance', academyAttendanceSchema);
