const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, default: '' },
  actorOrgRole: { type: String, default: '' },
  action: { type: String, required: true },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  targetType: { type: String, default: '' },
  targetId: { type: String, default: '' },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  clientDevice: { type: String, default: '' },
  httpMethod: { type: String, default: '' },
  route: { type: String, default: '' },
  reason: { type: String, default: '' },
  meta: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ actorRole: 1, createdAt: -1 });
activityLogSchema.index({ actorOrgRole: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
