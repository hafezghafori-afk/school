const mongoose = require('mongoose');

const teacherAssignmentSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  teacherUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  classId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SchoolClass',
    default: null,
    index: true
  },
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    default: null,
    index: true
  },
  termId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicTerm',
    default: null,
    index: true
  },
  weeklyPeriods: {
    type: Number,
    required: true,
    min: 1,
    max: 30
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  isMainTeacher: {
    type: Boolean,
    default: false
  },
  consecutivePeriods: {
    type: Boolean,
    default: false
  },
  preferredDays: [{
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  }],
  preferredPeriods: [Number],
  avoidDays: [{
    type: String,
    enum: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  }],
  avoidPeriods: [Number],
  maxPeriodsPerDay: {
    type: Number,
    default: 6,
    min: 1,
    max: 8
  },
  maxPeriodsPerWeek: {
    type: Number,
    default: 24,
    min: 1,
    max: 40
  },
  specialRequirements: {
    needsLab: { type: Boolean, default: false },
    needsComputer: { type: Boolean, default: false },
    needsPlayground: { type: Boolean, default: false },
    needsLibrary: { type: Boolean, default: false }
  },
  assignmentType: {
    type: String,
    enum: ['subject', 'homeroom', 'assistant', 'substitute', 'permanent', 'temporary'],
    default: 'subject'
  },
  status: {
    type: String,
    enum: ['planned', 'active', 'ended', 'inactive', 'pending', 'cancelled'],
    default: 'active',
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: {
    type: Date,
    default: null
  },
  effectiveDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    default: null
  },
  source: {
    type: String,
    enum: ['manual', 'legacy_instructor_subject', 'course_homeroom', 'schedule_backfill', 'system'],
    default: 'manual'
  },
  legacyInstructorSubjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InstructorSubject',
    default: undefined
  },
  legacyCourseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null,
    index: true
  },
  isPrimary: {
    type: Boolean,
    default: false
  },
  note: {
    type: String,
    default: ''
  }
}, { timestamps: true });

teacherAssignmentSchema.pre('validate', function syncTeacherAssignmentState() {
  if (typeof this.note === 'string') {
    this.note = this.note.trim();
  }

  if (!this.legacyInstructorSubjectId) {
    this.legacyInstructorSubjectId = undefined;
  }

  if (this.status === 'ended' && !this.endedAt) {
    this.endedAt = new Date();
  }
  if (this.status !== 'ended') {
    this.endedAt = null;
  }
});

teacherAssignmentSchema.index({
  teacherUserId: 1,
  academicYearId: 1,
  classId: 1,
  subjectId: 1,
  termId: 1,
  assignmentType: 1,
  status: 1
});

const TeacherAssignment = mongoose.model('TeacherAssignment', teacherAssignmentSchema);

const LEGACY_INSTRUCTOR_INDEX_NAME = 'legacyInstructorSubjectId_1';

TeacherAssignment.ensureTeacherAssignmentLegacyIndex = async function ensureTeacherAssignmentLegacyIndex() {
  const db = mongoose.connection?.db;
  if (!db) return;

  const collection = db.collection('teacherassignments');

  // Remove null placeholder values so unique index never conflicts on null.
  await collection.updateMany(
    { legacyInstructorSubjectId: null },
    { $unset: { legacyInstructorSubjectId: '' } }
  );

  const indexes = await collection.indexes();
  const hasLegacyIndex = indexes.some((item) => item.name === LEGACY_INSTRUCTOR_INDEX_NAME);
  if (hasLegacyIndex) {
    try {
      await collection.dropIndex(LEGACY_INSTRUCTOR_INDEX_NAME);
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('index not found')) {
        // eslint-disable-next-line no-console
        console.warn('Failed dropping teacher assignment legacy index:', message);
      }
    }
  }

  await collection.createIndex(
    { legacyInstructorSubjectId: 1 },
    {
      name: LEGACY_INSTRUCTOR_INDEX_NAME,
      unique: true,
      partialFilterExpression: { legacyInstructorSubjectId: { $type: 'objectId' } },
      background: true
    }
  );
};
module.exports = TeacherAssignment;
