const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  studentMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'sick', 'leave', 'late', 'excused'], required: true },
  note: { type: String, default: '' },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

attendanceSchema.index(
  { studentMembershipId: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { studentMembershipId: { $type: 'objectId' } }
  }
);
attendanceSchema.index({ course: 1, date: 1, student: 1 }, { unique: true });
attendanceSchema.index({ student: 1, date: 1, course: 1 });
attendanceSchema.index({ classId: 1, academicYearId: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
