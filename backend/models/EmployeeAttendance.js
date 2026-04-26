const mongoose = require('mongoose');

const employeeAttendanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanTeacher', required: true, index: true },
  linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  date: { type: Date, required: true, index: true },
  status: { type: String, enum: ['present', 'absent', 'sick', 'leave', 'late', 'excused'], required: true },
  note: { type: String, default: '' },
  employeeCode: { type: String, default: '' },
  position: { type: String, default: '' },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

employeeAttendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
employeeAttendanceSchema.index({ date: 1, status: 1 });
employeeAttendanceSchema.index({ linkedUser: 1, date: 1 });

module.exports = mongoose.model('EmployeeAttendance', employeeAttendanceSchema);
