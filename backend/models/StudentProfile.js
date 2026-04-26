const mongoose = require('mongoose');

const studentRemarkSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['general', 'medical', 'discipline', 'administrative', 'family'],
    default: 'general'
  },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  visibility: {
    type: String,
    enum: ['admin', 'staff'],
    default: 'admin'
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const studentTransferSchema = new mongoose.Schema({
  direction: {
    type: String,
    enum: ['in', 'out', 'internal'],
    default: 'internal'
  },
  fromLabel: { type: String, default: '' },
  toLabel: { type: String, default: '' },
  fromClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  toClassId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null },
  transferredAt: { type: Date, default: Date.now },
  note: { type: String, default: '' }
}, { _id: true });

const studentDocumentSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: ['id_card', 'birth_certificate', 'report_card', 'photo', 'other'],
    default: 'other'
  },
  title: { type: String, default: '' },
  fileUrl: { type: String, default: '' },
  note: { type: String, default: '' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  uploadedAt: { type: Date, default: Date.now }
}, { _id: true });

const studentGuardianSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: { type: String, default: '' },
  relation: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  isPrimary: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  linkedAt: { type: Date, default: Date.now },
  note: { type: String, default: '' }
}, { _id: true });

const studentProfileSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StudentCore',
    required: true,
    unique: true,
    index: true
  },
  family: {
    fatherName: { type: String, default: '' },
    motherName: { type: String, default: '' },
    guardianName: { type: String, default: '' },
    guardianRelation: { type: String, default: '' }
  },
  contact: {
    primaryPhone: { type: String, default: '' },
    alternatePhone: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' }
  },
  background: {
    previousSchool: { type: String, default: '' },
    emergencyPhone: { type: String, default: '' }
  },
  notes: {
    medical: { type: String, default: '' },
    administrative: { type: String, default: '' }
  },
  guardians: {
    type: [studentGuardianSchema],
    default: []
  },
  remarks: {
    type: [studentRemarkSchema],
    default: []
  },
  transfers: {
    type: [studentTransferSchema],
    default: []
  },
  documents: {
    type: [studentDocumentSchema],
    default: []
  }
}, { timestamps: true });

function trimNestedStrings(node) {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((item) => trimNestedStrings(item));
    return;
  }
  if (typeof node !== 'object') return;

  Object.keys(node).forEach((key) => {
    if (typeof node[key] === 'string') {
      node[key] = node[key].trim();
      return;
    }
    trimNestedStrings(node[key]);
  });
}

studentProfileSchema.pre('validate', function syncStudentProfileState() {
  trimNestedStrings(this.family || {});
  trimNestedStrings(this.contact || {});
  trimNestedStrings(this.background || {});
  trimNestedStrings(this.notes || {});
  trimNestedStrings(this.guardians || []);
  trimNestedStrings(this.remarks || []);
  trimNestedStrings(this.transfers || []);
  trimNestedStrings(this.documents || []);
});

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
