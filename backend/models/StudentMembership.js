const mongoose = require('mongoose');

const CURRENT_STATUSES = new Set(['active', 'pending', 'suspended', 'transferred_in']);
const ENDED_STATUSES = new Set([
  'transferred',
  'transferred_out',
  'graduated',
  'dropped',
  'expelled',
  'inactive',
  'rejected'
]);

const membershipSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentCore',
    default: null,
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  academicYear: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: [
      'active',
      'pending',
      'transferred',
      'transferred_in',
      'transferred_out',
      'graduated',
      'dropped',
      'expelled',
      'suspended',
      'inactive',
      'rejected'
    ],
    default: 'active'
  },
  source: {
    type: String,
    enum: ['order', 'admin', 'import', 'system', 'migration', 'promotion'],
    default: 'system'
  },
  enrolledAt: {
    type: Date,
    default: null
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  leftAt: {
    type: Date,
    default: null
  },
  endedReason: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  note: {
    type: String,
    default: ''
  },
  rejectedReason: {
    type: String,
    default: ''
  },
  isCurrent: {
    type: Boolean,
    default: true,
    index: true
  },
  legacyOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },
  promotedFromMembershipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMembership',
    default: null,
    index: true
  }
}, { timestamps: true });

membershipSchema.pre('validate', function syncMembershipLifecycle() {
  if (!this.enrolledAt) {
    this.enrolledAt = this.joinedAt || new Date();
  }
  if (!this.joinedAt) {
    this.joinedAt = this.enrolledAt || new Date();
  }

  if (!this.academicYearId && this.academicYear) {
    this.academicYearId = this.academicYear;
  }
  if (!this.academicYear && this.academicYearId) {
    this.academicYear = this.academicYearId;
  }

  if (!this.endedAt && this.leftAt) {
    this.endedAt = this.leftAt;
  }
  if (!this.leftAt && this.endedAt) {
    this.leftAt = this.endedAt;
  }

  if (CURRENT_STATUSES.has(this.status)) {
    this.isCurrent = true;
    this.leftAt = null;
    this.endedAt = null;
  }

  if (ENDED_STATUSES.has(this.status)) {
    this.isCurrent = false;
    if (!this.leftAt) {
      this.leftAt = new Date();
    }
    if (!this.endedAt) {
      this.endedAt = this.leftAt;
    }
    if (!this.endedReason) {
      this.endedReason = this.status;
    }
  }

  if (this.leftAt && this.joinedAt && this.leftAt < this.joinedAt) {
    this.leftAt = this.joinedAt;
  }
  if (this.endedAt && this.enrolledAt && this.endedAt < this.enrolledAt) {
    this.endedAt = this.enrolledAt;
  }

  if (typeof this.note === 'string') {
    this.note = this.note.trim();
  }
  if (typeof this.endedReason === 'string') {
    this.endedReason = this.endedReason.trim();
  }
  if (typeof this.rejectedReason === 'string') {
    this.rejectedReason = this.rejectedReason.trim();
  }

  if (this.status !== 'rejected') {
    this.rejectedReason = '';
  }
  if (!ENDED_STATUSES.has(this.status)) {
    this.endedReason = '';
  }
});

membershipSchema.index(
  { student: 1, course: 1, academicYear: 1, isCurrent: 1 },
  {
    unique: true,
    partialFilterExpression: { isCurrent: true }
  }
);
membershipSchema.index({ course: 1, status: 1, isCurrent: 1 });
membershipSchema.index({ student: 1, academicYear: 1, status: 1, isCurrent: 1 });
membershipSchema.index({ studentId: 1, academicYearId: 1, classId: 1, status: 1, isCurrent: 1 });
membershipSchema.index({ classId: 1, academicYearId: 1, status: 1, isCurrent: 1 });

module.exports = mongoose.model('StudentMembership', membershipSchema);
