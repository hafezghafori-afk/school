const mongoose = require('mongoose');

const financeMaintenanceLockSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AfghanSchool',
    default: null,
    index: true
  },
  active: { type: Boolean, default: false, index: true },
  operation: { type: String, default: '', trim: true },
  reason: { type: String, default: '', trim: true },
  tokenHash: { type: String, default: '', trim: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
  heartbeatAt: { type: Date, default: null },
  meta: { type: Object, default: {} }
}, { timestamps: true });

financeMaintenanceLockSchema.index({ active: 1, schoolId: 1 });

module.exports = mongoose.model('FinanceMaintenanceLock', financeMaintenanceLockSchema);
