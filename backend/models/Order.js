const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approvalStage: {
    type: String,
    enum: ['finance_manager_review', 'finance_lead_review', 'general_president_review', 'completed', 'rejected', ''],
    default: ''
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNote: { type: String, default: '' },
  approvalTrail: {
    type: [{
      level: { type: String, enum: ['finance_manager', 'finance_lead', 'general_president'], required: true },
      action: { type: String, enum: ['approve', 'reject'], required: true },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      at: { type: Date, default: Date.now },
      note: { type: String, default: '' },
      reason: { type: String, default: '' }
    }],
    default: []
  },
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
  },
  receiptImage: String,
  score: { type: Number, default: null },
  amount: { type: Number, default: 0 },
  paymentMethod: { type: String, default: 'manual' },
  note: { type: String, default: '' },
  rejectedReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);
