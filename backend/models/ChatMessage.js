const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  thread: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatThread', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '', maxlength: 8000 },
  file: { type: String, default: '' },
  seenBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

chatMessageSchema.index({ thread: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
