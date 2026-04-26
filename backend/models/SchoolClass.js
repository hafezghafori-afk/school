const mongoose = require('mongoose');

function normalizeTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const schoolClassSchema = new mongoose.Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true,
    index: true
  },
  title: { type: String, required: true, trim: true },
  titleDari: { type: String, required: true, trim: true },
  titlePashto: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  academicYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AcademicYear',
    default: null,
    index: true
  },
  shiftId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true,
    index: true
  },
  legacyCourseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  gradeLevel: { type: Number, required: true, min: 1, max: 12, index: true },
  section: { 
    type: String, 
    required: true,
    enum: ['الف', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط'],
    default: '',
    trim: true 
  },
  genderType: {
    type: String,
    required: true,
    enum: ['male', 'female', 'mixed'],
    default: 'mixed'
  },
  shift: {
    type: String,
    enum: ['', 'morning', 'afternoon', 'evening'],
    default: ''
  },
  room: { type: String, default: '', trim: true },
  capacity: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  currentStudents: {
    type: Number,
    default: 0,
    min: 0
  },
  classroomNumber: {
    type: String,
    default: '',
    trim: true
  },
  floor: {
    type: String,
    default: '',
    trim: true
  },
  classTeacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher'
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'archived'],
    default: 'active',
    index: true
  },
  homeroomTeacherUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  note: { type: String, default: '' }
}, { timestamps: true });

schoolClassSchema.pre('validate', function syncSchoolClassState() {
  this.title = normalizeTrimmedString(this.title);
  this.titleDari = normalizeTrimmedString(this.titleDari);
  this.titlePashto = normalizeTrimmedString(this.titlePashto);
  this.code = normalizeTrimmedString(this.code);
  this.section = normalizeTrimmedString(this.section);
  this.room = normalizeTrimmedString(this.room);
  this.classroomNumber = normalizeTrimmedString(this.classroomNumber);
  this.floor = normalizeTrimmedString(this.floor);
  this.note = typeof this.note === 'string' ? this.note.trim() : '';

  if (!this.title) {
    const sectionPart = this.section ? (' - ' + this.section) : '';
    const gradePart = this.gradeLevel || this.code || 'Class';
    this.title = (gradePart + sectionPart).trim();
  }
});

// Virtual for full class name
schoolClassSchema.virtual('fullName').get(function() {
  return `${this.gradeLevel} - ${this.section} - ${this.genderType}`;
});

// Virtual for display name in Dari
schoolClassSchema.virtual('displayNameDari').get(function() {
  return `صنف ${this.gradeLevel} ${this.section}`;
});

// Virtual for display name in Pashto
schoolClassSchema.virtual('displayNamePashto').get(function() {
  return `درجه ${this.gradeLevel} ${this.section}`;
});

schoolClassSchema.index({ legacyCourseId: 1 }, { unique: true, sparse: true });
schoolClassSchema.index({ academicYearId: 1, gradeLevel: 1, section: 1, status: 1 });
schoolClassSchema.index({ 
  schoolId: 1, 
  academicYearId: 1, 
  gradeLevel: 1, 
  section: 1, 
  genderType: 1,
  shiftId: 1
}, { unique: true });
schoolClassSchema.index({ schoolId: 1, academicYearId: 1, shiftId: 1 });
schoolClassSchema.index({ schoolId: 1, status: 1 });
schoolClassSchema.index({ academicYearId: 1, shiftId: 1 });

const SchoolClass = mongoose.model('SchoolClass', schoolClassSchema);

const OLD_UNIQUE_INDEX_NAME = 'schoolId_1_academicYearId_1_gradeLevel_1_section_1_genderType_1';
const NEW_UNIQUE_INDEX_NAME = 'schoolId_1_academicYearId_1_gradeLevel_1_section_1_genderType_1_shiftId_1';
const NEW_UNIQUE_INDEX_KEY = {
  schoolId: 1,
  academicYearId: 1,
  gradeLevel: 1,
  section: 1,
  genderType: 1,
  shiftId: 1
};

const hasIndexKey = (index = {}, expected = {}) => {
  const actualEntries = Object.entries(index?.key || {});
  const expectedEntries = Object.entries(expected);
  if (actualEntries.length !== expectedEntries.length) return false;
  return expectedEntries.every(([field, direction]) => index.key?.[field] === direction);
};

async function ensureSchoolClassShiftUniqueIndex() {
  const db = mongoose.connection?.db;
  if (!db) return;

  const collection = db.collection('schoolclasses');
  const indexes = await collection.indexes();

  const oldIndex = indexes.find((item) => item.name === OLD_UNIQUE_INDEX_NAME);
  if (oldIndex) {
    try {
      await collection.dropIndex(OLD_UNIQUE_INDEX_NAME);
      // eslint-disable-next-line no-console
      console.log('Dropped old school class unique index without shiftId');
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('index not found')) {
        // eslint-disable-next-line no-console
        console.warn('Failed dropping old school class index:', message);
      }
    }
  }

  const hasNewUniqueIndex = indexes.some((item) => (
    item.unique === true && (item.name === NEW_UNIQUE_INDEX_NAME || hasIndexKey(item, NEW_UNIQUE_INDEX_KEY))
  ));

  if (!hasNewUniqueIndex) {
    await collection.createIndex(NEW_UNIQUE_INDEX_KEY, {
      name: NEW_UNIQUE_INDEX_NAME,
      unique: true,
      background: true
    });
    // eslint-disable-next-line no-console
    console.log('Created school class unique index with shiftId');
  }
}

module.exports = SchoolClass;
module.exports.ensureSchoolClassShiftUniqueIndex = ensureSchoolClassShiftUniqueIndex;


