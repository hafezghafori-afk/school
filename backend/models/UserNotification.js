const mongoose = require('mongoose');

const userNotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'system' },
  readAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('UserNotification', userNotificationSchema);

