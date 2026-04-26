const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  message: { type: String, required: true },
  status: { type: String, enum: ['new', 'read'], default: 'new' },
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

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
