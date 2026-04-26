const mongoose = require('mongoose');

const profileUpdateRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  requestedData: {
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    grade: { type: String, default: '' },
    subject: { type: String, default: '' },
    bio: { type: String, default: '' }
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  followUp: {
    assignedLevel: {
      type: String,
      enum: ['finance_manager', 'finance_lead', 'general_president'],
      default: 'finance_manager'
    },
    status: {
      type: String,
      enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'],
      default: 'new'
    },
    note: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
    history: {
      type: [{
        assignedLevel: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
        status: { type: String, enum: ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'], required: true },
        note: { type: String, default: '' },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        updatedAt: { type: Date, default: Date.now }
      }],
      default: []
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('ProfileUpdateRequest', profileUpdateRequestSchema);
