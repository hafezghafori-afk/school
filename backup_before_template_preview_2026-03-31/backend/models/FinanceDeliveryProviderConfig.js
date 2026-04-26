const mongoose = require('mongoose');

const financeDeliveryProviderAuditEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['created', 'config_saved', 'credentials_rotated', 'secrets_cleared'],
    required: true,
    trim: true
  },
  by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  byLabel: {
    type: String,
    default: '',
    trim: true
  },
  at: {
    type: Date,
    default: Date.now
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  changedFields: {
    type: [String],
    default: []
  },
  rotatedFields: {
    type: [String],
    default: []
  },
  credentialVersion: {
    type: Number,
    default: 1,
    min: 1
  }
}, { _id: false });

const financeDeliveryProviderConfigSchema = new mongoose.Schema({
  channel: {
    type: String,
    enum: ['sms', 'whatsapp'],
    required: true,
    trim: true,
    unique: true,
    index: true
  },
  mode: {
    type: String,
    enum: ['mock', 'webhook', 'twilio', 'meta'],
    default: 'webhook',
    trim: true
  },
  provider: {
    type: String,
    default: '',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  webhookUrl: {
    type: String,
    default: '',
    trim: true
  },
  statusWebhookUrl: {
    type: String,
    default: '',
    trim: true
  },
  fromHandle: {
    type: String,
    default: '',
    trim: true
  },
  apiBaseUrl: {
    type: String,
    default: '',
    trim: true
  },
  accountSid: {
    type: String,
    default: '',
    trim: true
  },
  authToken: {
    type: String,
    default: '',
    trim: true
  },
  accessToken: {
    type: String,
    default: '',
    trim: true
  },
  phoneNumberId: {
    type: String,
    default: '',
    trim: true
  },
  webhookToken: {
    type: String,
    default: '',
    trim: true
  },
  note: {
    type: String,
    default: '',
    trim: true
  },
  credentialVersion: {
    type: Number,
    default: 1,
    min: 1
  },
  lastRotatedAt: {
    type: Date,
    default: null
  },
  lastRotatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastRotatedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedByLabel: {
    type: String,
    default: '',
    trim: true
  },
  auditTrail: {
    type: [financeDeliveryProviderAuditEntrySchema],
    default: []
  }
}, { timestamps: true });

module.exports = mongoose.models.FinanceDeliveryProviderConfig || mongoose.model('FinanceDeliveryProviderConfig', financeDeliveryProviderConfigSchema);
