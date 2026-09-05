const mongoose = require('mongoose');

// «مرکز ارتباطات» — بخشِ صادره: اعلانِ همگانی و وظیفهٔ تعیین‌شده. پیام‌های واردیِ
// سایت همچنان در ContactMessage می‌مانند (بدون مهاجرت)؛ این مدل فقط چیزهایی را
// نگه می‌دارد که از داخلِ ادمین به کاربران فرستاده می‌شود.

const audienceSchema = new mongoose.Schema({
  scope: {
    type: String,
    enum: ['all', 'role', 'class', 'user'],
    required: true
  },
  roles: { type: [String], default: [] },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  userIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] }
}, { _id: false });

const followUpHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  note: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const adminMessageSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', required: true, index: true },
  kind: { type: String, enum: ['announcement', 'task'], required: true, index: true },

  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },

  channels: { type: [String], enum: ['bell', 'email'], default: ['bell'] },
  audience: { type: audienceSchema, required: true },

  senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName: { type: String, default: '' },
  senderLevel: { type: String, default: '' },

  recipientUserIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },
  recipientCount: { type: Number, default: 0 },
  emailSentCount: { type: Number, default: 0 },

  // فقط برای kind='task' معنی دارد — پیشرفتِ همان وظیفه.
  dueDate: { type: Date, default: null },
  followUp: {
    status: { type: String, enum: ['new', 'in_progress', 'on_hold', 'done'], default: 'new' },
    note: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
    history: { type: [followUpHistorySchema], default: [] }
  },

  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true }
}, { timestamps: true });

adminMessageSchema.index({ schoolId: 1, kind: 1, status: 1, createdAt: -1 });
adminMessageSchema.index({ senderUserId: 1, createdAt: -1 });
adminMessageSchema.index({ 'audience.userIds': 1 });

module.exports = mongoose.model('AdminMessage', adminMessageSchema);
