const mongoose = require('mongoose');
const { applySchoolOwnership } = require('../utils/schoolOwnership');
const {
  buildConcurrentCurrentMembershipFilter
} = require('../utils/studentMembershipIntegrity');
const {
  CURRENT_STUDENT_MEMBERSHIP_STATUSES,
  ENDED_STUDENT_MEMBERSHIP_STATUSES
} = require('../utils/studentMembershipStatus');

const CURRENT_STATUSES = new Set(CURRENT_STUDENT_MEMBERSHIP_STATUSES);
const ENDED_STATUSES = new Set(ENDED_STUDENT_MEMBERSHIP_STATUSES);

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
  afghanStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanStudent',
    default: null,
    index: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true,
    index: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanSchool',
    default: null,
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
  previousMembershipId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentMembership',
    default: null,
    index: true
  },
  admissionType: {
    type: String,
    enum: ['regular', 'transfer_in', 'class_transfer', 're_enrollment', 'promotion', 'import', 'migration'],
    default: 'regular',
    index: true
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
  },
  changeVersion: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true, optimisticConcurrency: true });

membershipSchema.pre('validate', async function syncMembershipLifecycle() {
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
  if (!this.admissionType) {
    if (this.source === 'promotion') this.admissionType = 'promotion';
    else if (this.source === 'import') this.admissionType = 'import';
    else if (this.source === 'migration') this.admissionType = 'migration';
    else if (this.status === 'transferred_in') this.admissionType = 'transfer_in';
    else this.admissionType = 'regular';
  }
  await applySchoolOwnership(this);
});

membershipSchema.pre('save', function incrementMembershipChangeVersion() {
  if (!this.isNew && this.isModified()) {
    this.changeVersion = Number(this.changeVersion || 0) + 1;
  }
});

membershipSchema.pre('validate', async function preventConcurrentClassMemberships() {
  if (!this.student || this.isCurrent !== true || !CURRENT_STATUSES.has(this.status)) return;

  const conflictQuery = this.constructor.findOne(buildConcurrentCurrentMembershipFilter({
    schoolId: this.schoolId,
    studentId: this.student,
    academicYearId: this.academicYearId || this.academicYear,
    excludeMembershipId: this._id
  })).select('_id classId course academicYear academicYearId');
  if (this.$session()) conflictQuery.session(this.$session());
  const conflict = await conflictQuery.lean();

  if (!conflict) return;
  this.invalidate(
    'isCurrent',
    'این شاگرد در همین سال تعلیمی عضویت فعال دیگری دارد؛ ابتدا تبدیل یا ختم عضویت قبلی را ثبت کنید.'
  );
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
membershipSchema.index({ schoolId: 1, academicYearId: 1, classId: 1, status: 1, isCurrent: 1 });
membershipSchema.index({ studentId: 1, academicYearId: 1, classId: 1, status: 1, isCurrent: 1 });
membershipSchema.index({ classId: 1, academicYearId: 1, status: 1, isCurrent: 1 });

module.exports = mongoose.model('StudentMembership', membershipSchema);
