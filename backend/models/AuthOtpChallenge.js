const mongoose = require('mongoose');

const authOtpChallengeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  purpose: {
    type: String,
    enum: ['login_2fa'],
    default: 'login_2fa',
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  codeHash: {
    type: String,
    required: true
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
  },
  codeExpiresAt: {
    type: Date,
    required: true,
    index: true
  },
  challengeExpiresAt: {
    type: Date,
    required: true,
    index: true
  },
  lastSentAt: {
    type: Date,
    default: Date.now
  },
  consumedAt: {
    type: Date,
    default: null,
    index: true
  },
  ip: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
}, { timestamps: true });

authOtpChallengeSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

module.exports = mongoose.model('AuthOtpChallenge', authOtpChallengeSchema);
