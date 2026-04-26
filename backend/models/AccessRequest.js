const mongoose = require('mongoose');

const accessRequestSchema = new mongoose.Schema({
  requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  permission: { type: String, required: true, index: true },
  route: { type: String, default: '/' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  requestNote: { type: String, default: '' },
  decisionNote: { type: String, default: '' },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('AccessRequest', accessRequestSchema);
