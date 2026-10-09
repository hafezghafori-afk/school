const mongoose = require('mongoose');

// One row per «فراموشی رمز» request. Only the sha256 of the emailed token is
// stored, so a database read never yields a usable reset link.
const passwordResetTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  consumedAt: {
    type: Date,
    default: null
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

// MongoDB purges a row one day after its link expired.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);
