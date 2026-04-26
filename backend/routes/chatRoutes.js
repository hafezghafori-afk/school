const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ChatThread = require('../models/ChatThread');
const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { canAccessCourse, findAccessibleCourses, findCourseStudentIds, instructorRoles } = require('../utils/courseAccess');

const router = express.Router();

const membershipAccessOptions = Object.freeze({});

const chatDir = path.join(__dirname, '..', 'uploads', 'chats');
if (!fs.existsSync(chatDir)) fs.mkdirSync(chatDir, { recursive: true });

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, chatDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }
});

const canDirectChat = (actorRole, targetRole) => {
  if (actorRole === 'admin') return true;
  if (instructorRoles.includes(actorRole) && (instructorRoles.includes(targetRole) || targetRole === 'student')) return true;
  if (actorRole === 'student' && instructorRoles.includes(targetRole)) return true;
  return false;
};

const canAccessThread = async (user, thread) => {
  if (!thread) return false;

  if (thread.type === 'direct') {
    return thread.participants.some((participantId) => String(participantId) === String(user?.id));
  }

  if (thread.type === 'group') {
    return canAccessCourse(user, thread.course, membershipAccessOptions);
  }

  return false;
};

router.get('/threads/direct', requireAuth, async (req, res) => {
  try {
    const threads = await ChatThread.find({
      type: 'direct',
      participants: req.user.id
    }).populate('participants', 'name role');

    const items = threads.map((thread) => {
      const other = thread.participants.find((participant) => String(participant._id) !== String(req.user.id));
      return {
        _id: thread._id,
        type: 'direct',
        otherUser: other ? { _id: other._id, name: other.name, role: other.role } : null,
        updatedAt: thread.updatedAt
      };
    });

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت چت‌ها' });
  }
});

router.get('/threads/group', requireAuth, async (req, res) => {
  try {
    const courses = await findAccessibleCourses(req.user, 'title category', membershipAccessOptions);
    const items = [];

    for (const course of courses || []) {
      const thread = await ChatThread.findOneAndUpdate(
        { type: 'group', course: course._id },
        { type: 'group', course: course._id },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      items.push({
        _id: thread._id,
        type: 'group',
        course: { _id: course._id, title: course.title, category: course.category },
        updatedAt: thread.updatedAt
      });
    }

    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت گروه‌ها' });
  }
});

router.get('/group/members/:courseId', requireAuth, async (req, res) => {
  try {
    const { courseId } = req.params;
    const allowed = await canAccessCourse(req.user, courseId, membershipAccessOptions);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const instructorIds = await Schedule.distinct('instructor', { course: courseId });
    const [admins, studentIds] = await Promise.all([
      User.find({ role: 'admin' }).select('_id'),
      findCourseStudentIds(courseId, membershipAccessOptions)
    ]);

    const memberIds = new Set();
    admins.forEach((user) => memberIds.add(String(user._id)));
    instructorIds.filter(Boolean).forEach((id) => memberIds.add(String(id)));
    studentIds.forEach((id) => memberIds.add(String(id)));

    res.json({ success: true, items: Array.from(memberIds) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت اعضا' });
  }
});

router.post('/direct', requireAuth, async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, message: 'شناسه کاربر الزامی است' });
    }
    if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(req.user.id)) {
      return res.status(400).json({ success: false, message: 'شناسه کاربر معتبر نیست' });
    }
    if (String(userId) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'امکان چت با خود وجود ندارد' });
    }

    const target = await User.findById(userId).select('role name');
    if (!target) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }
    if (!canDirectChat(req.user.role, target.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const actorId = new mongoose.Types.ObjectId(req.user.id);
    const targetId = new mongoose.Types.ObjectId(userId);

    let thread = await ChatThread.findOne({
      type: 'direct',
      participants: { $all: [actorId, targetId] }
    });
    const created = !thread;

    if (!thread) {
      thread = await ChatThread.create({
        type: 'direct',
        participants: [actorId, targetId]
      });
    }

    await logActivity({
      req,
      action: created ? 'chat_direct_thread_create' : 'chat_direct_thread_open',
      targetType: 'ChatThread',
      targetId: String(thread._id || ''),
      targetUser: String(userId || ''),
      meta: {
        threadType: 'direct',
        created,
        participantIds: [String(req.user.id || ''), String(userId || '')]
      }
    });

    res.json({ success: true, threadId: thread._id });
  } catch (error) {
    console.error('Chat direct error:', error);
    res.status(500).json({
      success: false,
      message: `خطا در ایجاد چت: ${error.message}`,
      code: error.code || '',
      name: error.name || ''
    });
  }
});

router.get('/messages/:threadId', requireAuth, async (req, res) => {
  try {
    const thread = await ChatThread.findById(req.params.threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'گفت‌وگو یافت نشد' });
    }

    const allowed = await canAccessThread(req.user, thread);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const items = await ChatMessage.find({ thread: thread._id })
      .populate('sender', 'name role')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, items: items.reverse() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
  }
});

router.post('/messages/:threadId', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const thread = await ChatThread.findById(req.params.threadId);
    if (!thread) {
      return res.status(404).json({ success: false, message: 'گفت‌وگو یافت نشد' });
    }

    const allowed = await canAccessThread(req.user, thread);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const text = (req.body.text || '').trim();
    const file = req.file ? `uploads/chats/${req.file.filename}` : '';
    if (!text && !file) {
      return res.status(400).json({ success: false, message: 'متن یا فایل الزامی است' });
    }

    const message = await ChatMessage.create({
      thread: thread._id,
      sender: req.user.id,
      text,
      file,
      seenBy: [req.user.id]
    });

    await ChatThread.findByIdAndUpdate(thread._id, { updatedAt: new Date() });

    const populated = await message.populate('sender', 'name role');
    const io = req.app.get('io');
    if (io) {
      io.to(`thread:${thread._id}`).emit('chat:new', populated);
    }

    await logActivity({
      req,
      action: 'chat_message_send',
      targetType: 'ChatMessage',
      targetId: String(message._id || ''),
      meta: {
        threadId: String(thread._id || ''),
        threadType: thread.type || '',
        courseId: thread.course ? String(thread.course) : '',
        hasFile: Boolean(file),
        textLength: text.length
      }
    });

    res.json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ارسال پیام' });
  }
});

module.exports = router;
