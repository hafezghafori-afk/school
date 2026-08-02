const mongoose = require('mongoose');

const studentLifecycleEventSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentCore', default: null, index: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', default: null, index: true },
  membershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', required: true, index: true },
  previousMembershipId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentMembership', default: null },
  eventType: {
    type: String,
    enum: ['transfer_in', 'transfer_out', 'class_transfer', 'dropout', 'expulsion', 'suspension', 'suspension_lifted', 'graduation', 're_enrollment'],
    required: true,
    index: true
  },
  effectiveAt: { type: Date, required: true, index: true },
  beforeState: { type: mongoose.Schema.Types.Mixed, default: {} },
  afterState: { type: mongoose.Schema.Types.Mixed, default: {} },
  documentType: { type: String, default: '', trim: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  financialEffects: { type: mongoose.Schema.Types.Mixed, default: {} },
  membershipChangeVersion: { type: Number, default: 0, min: 0 },
  note: { type: String, default: '', trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true, immutable: true });

studentLifecycleEventSchema.index({ membershipId: 1, effectiveAt: 1, createdAt: 1 });
studentLifecycleEventSchema.index({ student: 1, effectiveAt: -1, createdAt: -1 });

studentLifecycleEventSchema.pre('save', function preventLifecycleEventMutation() {
  if (!this.isNew) {
    throw new Error('student_lifecycle_event_immutable');
  }
});

studentLifecycleEventSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function preventLifecycleEventQueryMutation() {
    throw new Error('student_lifecycle_event_immutable');
  }
);

module.exports = mongoose.model('StudentLifecycleEvent', studentLifecycleEventSchema);
