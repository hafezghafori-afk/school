const mongoose = require('mongoose');

const chatThreadSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'group'], required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' }
}, { timestamps: true });

chatThreadSchema.index({ type: 1, participants: 1 });
chatThreadSchema.index(
  { type: 1, course: 1 },
  {
    name: 'chat_group_course_unique',
    unique: true,
    partialFilterExpression: {
      type: 'group',
      course: { $exists: true }
    }
  }
);

module.exports = mongoose.model('ChatThread', chatThreadSchema);
