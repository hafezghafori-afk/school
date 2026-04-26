const express = require('express');
const User = require('../models/User');
const { requireAuth, requireRole, requirePermission, requireAnyPermission } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../utils/activity');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ActivityLog = require('../models/ActivityLog');
const ProfileUpdateRequest = require('../models/ProfileUpdateRequest');
const AccessRequest = require('../models/AccessRequest');
const UserNotification = require('../models/UserNotification');
const { resolvePermissions } = require('../utils/permissions');
const { normalizeAdminLevel } = require('../utils/permissions');
const { serializeUserIdentity } = require('../utils/userRole');

const router = express.Router();
const ACCESS_PERMISSION_KEYS = new Set([
  'manage_users',
  'manage_enrollments',
  'manage_memberships',
  'manage_finance',
  'manage_content',
  'view_reports',
  'view_schedule',
  'manage_schedule',
  'access_school_manager',
  'access_head_teacher'
]);

const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) {
  fs.mkdirSync(avatarDir, { recursive: true });
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${safeName(file.originalname)}`)
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!ok) return cb(new Error('\u0641\u0631\u0645\u062a \u0639\u06a9\u0633 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a'), false);
    cb(null, true);
  }
});

const withCanonicalIdentity = (user) => {
  if (!user) return null;
  const payload = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    ...payload,
    ...serializeUserIdentity(payload)
  };
};

router.get('/school/:schoolId', requireAuth, async (req, res) => {
  try {
    const requestedRole = String(req.query?.role || '').trim().toLowerCase();
    const filter = {};

    if (requestedRole === 'teacher' || requestedRole === 'instructor') {
      filter.role = { $in: ['instructor', 'teacher', 'professor'] };
    } else if (requestedRole) {
      filter.role = requestedRole;
    }

    const items = await User.find(filter)
      .select('name email role orgRole status adminLevel subject permissions')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: items.map((item) => withCanonicalIdentity(item))
    });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت کاربران مکتب' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name email role orgRole status adminLevel avatarUrl lastLoginAt grade subject bio permissions');
    if (!user) return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    const payload = withCanonicalIdentity(user);
    payload.adminLevel = payload.role === 'admin' ? normalizeAdminLevel(payload.adminLevel || '') : '';
    payload.effectivePermissions = resolvePermissions({
      role: payload.role,
      orgRole: payload.orgRole,
      permissions: payload.permissions || [],
      adminLevel: payload.adminLevel || ''
    });
    res.json({ success: true, user: payload });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u067e\u0631\u0648\u0641\u0627\u06cc\u0644' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'student') {
      filter = { role: { $in: ['instructor', 'admin'] } };
    }
    const items = await User.find(filter).select('name role orgRole status').sort({ createdAt: -1 });
    res.json({ success: true, items: items.map((item) => withCanonicalIdentity(item)) });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u06a9\u0627\u0631\u0628\u0631\u0627\u0646' });
  }
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, email, grade, subject, bio } = req.body || {};
    const requestedData = {
      name: String(name || '').trim(),
      email: String(email || '').trim().toLowerCase(),
      grade: String(grade || '').trim(),
      subject: String(subject || '').trim(),
      bio: String(bio || '').trim().slice(0, 1000)
    };

    if (requestedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedData.email)) {
      return res.status(400).json({ success: false, message: '\u0627\u06cc\u0645\u06cc\u0644 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a' });
    }

    const user = await User.findById(req.user.id).select('name email role orgRole status adminLevel avatarUrl lastLoginAt grade subject bio permissions');
    if (!user) return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });

    if (req.user.role === 'student') {
      const emailOwner = await User.findOne({ email: requestedData.email });
      if (emailOwner && String(emailOwner._id) !== String(user._id)) {
        return res.status(400).json({ success: false, message: '\u0627\u06cc\u0646 \u0627\u06cc\u0645\u06cc\u0644 \u0642\u0628\u0644\u0627 \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a' });
      }

      const request = await ProfileUpdateRequest.findOneAndUpdate(
        { user: req.user.id, status: 'pending' },
        { $set: { requestedData } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      await logActivity({
        req,
        action: 'student_profile_update_request',
        targetUser: user._id,
        targetType: 'ProfileUpdateRequest',
        targetId: request._id.toString()
      });

      return res.json({
        success: true,
        requiresApproval: true,
        request,
        message: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062a\u063a\u06cc\u06cc\u0631 \u0645\u0634\u062e\u0635\u0627\u062a \u062b\u0628\u062a \u0634\u062f \u0648 \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631 \u062a\u0627\u06cc\u06cc\u062f \u0627\u062f\u0645\u06cc\u0646 \u0627\u0633\u062a'
      });
    }

    const update = {};
    if (requestedData.name) update.name = requestedData.name;
    if (requestedData.email) update.email = requestedData.email;
    if (grade !== undefined) update.grade = requestedData.grade;
    if (subject !== undefined) update.subject = requestedData.subject;
    if (bio !== undefined) update.bio = requestedData.bio;

    const updated = await User.findByIdAndUpdate(req.user.id, update, { new: true })
      .select('name email role orgRole status adminLevel avatarUrl lastLoginAt grade subject bio permissions');
    res.json({ success: true, user: withCanonicalIdentity(updated), message: '\u067e\u0631\u0648\u0641\u0627\u06cc\u0644 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f' });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u067e\u0631\u0648\u0641\u0627\u06cc\u0644' });
  }
});

router.get('/me/profile-update-request', requireAuth, async (req, res) => {
  try {
    const item = await ProfileUpdateRequest.findOne({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0648\u0636\u0639\u06cc\u062a \u062f\u0631\u062e\u0648\u0627\u0633\u062a' });
  }
});

router.post('/me/access-request', requireAuth, async (req, res) => {
  try {
    const permission = String(req.body?.permission || '').trim().slice(0, 80);
    const routePath = String(req.body?.route || '').trim().slice(0, 180);
    const note = String(req.body?.note || '').trim().slice(0, 300);

    if (!permission) {
      return res.status(400).json({
        success: false,
        message: '\u0646\u0648\u0639 \u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u0634\u062e\u0635 \u0646\u06cc\u0633\u062a'
      });
    }
    if (!ACCESS_PERMISSION_KEYS.has(permission)) {
      return res.status(400).json({
        success: false,
        message: '\u062f\u0633\u062a\u0631\u0633\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u06cc \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a'
      });
    }

    const actor = await User.findById(req.user.id).select('name role');
    if (!actor) {
      return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    }

    const adminUsers = await User.find({ role: 'admin' }).select('_id');
    if (!adminUsers.length) {
      return res.status(400).json({
        success: false,
        message: '\u0627\u062f\u0645\u06cc\u0646\u06cc \u0628\u0631\u0627\u06cc \u062f\u0631\u06cc\u0627\u0641\u062a \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u06cc\u0627\u0641\u062a \u0646\u0634\u062f'
      });
    }

    const roleText = actor.role === 'admin'
      ? '\u0627\u062f\u0645\u06cc\u0646'
      : actor.role === 'instructor'
        ? '\u0627\u0633\u062a\u0627\u062f'
        : '\u0634\u0627\u06af\u0631\u062f';
    const routeText = routePath || '/';
    const existingPending = await AccessRequest.findOne({
      requester: actor._id,
      permission,
      status: 'pending'
    });

    let accessRequest;
    if (existingPending) {
      existingPending.route = routeText;
      if (note) existingPending.requestNote = note;
      accessRequest = await existingPending.save();
    } else {
      accessRequest = await AccessRequest.create({
        requester: actor._id,
        permission,
        route: routeText,
        requestNote: note,
        status: 'pending'
      });
    }

    const message = `${actor.name || '\u06a9\u0627\u0631\u0628\u0631'} (${roleText}) \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0641\u0639\u0627\u0644\u200c\u0633\u0627\u0632\u06cc \u062f\u0633\u062a\u0631\u0633\u06cc ${permission} \u0631\u0627 \u0628\u0631\u0627\u06cc \u0645\u0633\u06cc\u0631 ${routeText} \u062b\u0628\u062a \u06a9\u0631\u062f.`;

    if (!existingPending) {
      const notifications = await UserNotification.insertMany(
        adminUsers.map((admin) => ({
          user: admin._id,
          title: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc \u062c\u062f\u06cc\u062f',
          message,
          type: 'access_request'
        }))
      );

      const io = req.app.get('io');
      if (io) {
        notifications.forEach((item) => {
          io.to(`user:${item.user}`).emit('notify:new', item.toObject());
        });
      }
    }

    await logActivity({
      req,
      action: 'request_permission_access',
      targetUser: actor._id,
      targetType: 'AccessRequest',
      targetId: accessRequest._id.toString(),
      meta: { permission, route: routeText }
    });

    res.json({
      success: true,
      request: accessRequest,
      message: existingPending
        ? '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u0642\u0628\u0644\u0627 \u062b\u0628\u062a \u0634\u062f\u0647 \u0628\u0648\u062f \u0648 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f'
        : '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u0628\u0631\u0627\u06cc \u0627\u062f\u0645\u06cc\u0646 \u0627\u0631\u0633\u0627\u0644 \u0634\u062f'
    });
  } catch {
    res.status(500).json({
      success: false,
      message: '\u062e\u0637\u0627 \u062f\u0631 \u062b\u0628\u062a \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc'
    });
  }
});

router.put('/me/email', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'student') {
      return res.status(403).json({
        success: false,
        message: '\u0634\u0627\u06af\u0631\u062f \u0641\u0642\u0637 \u0627\u0632 \u0637\u0631\u06cc\u0642 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062a\u063a\u06cc\u06cc\u0631 \u0645\u0634\u062e\u0635\u0627\u062a \u0648 \u062a\u0627\u06cc\u06cc\u062f \u0627\u062f\u0645\u06cc\u0646 \u0645\u06cc\u200c\u062a\u0648\u0627\u0646\u062f \u0627\u06cc\u0645\u06cc\u0644 \u0631\u0627 \u062a\u063a\u06cc\u06cc\u0631 \u062f\u0647\u062f'
      });
    }

    const { currentPassword, newEmail } = req.body || {};
    if (!currentPassword || !newEmail) {
      return res.status(400).json({ success: false, message: '\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0646\u0627\u0642\u0635 \u0627\u0633\u062a' });
    }

    const email = String(newEmail).trim().toLowerCase();
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: '\u0627\u06cc\u0645\u06cc\u0644 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: '\u0631\u0645\u0632 \u0641\u0639\u0644\u06cc \u0627\u0634\u062a\u0628\u0627\u0647 \u0627\u0633\u062a' });
    }

    const exists = await User.findOne({ email });
    if (exists && exists._id.toString() !== user._id.toString()) {
      return res.status(400).json({ success: false, message: '\u0627\u06cc\u0646 \u0627\u06cc\u0645\u06cc\u0644 \u0642\u0628\u0644\u0627 \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a' });
    }

    user.email = email;
    await user.save();
    await logActivity({
      req,
      action: 'change_email',
      targetUser: user._id,
      targetType: 'User',
      targetId: user._id.toString()
    });

    res.json({
      success: true,
      user: withCanonicalIdentity({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgRole: user.orgRole,
        status: user.status,
        adminLevel: user.adminLevel,
        avatarUrl: user.avatarUrl,
        lastLoginAt: user.lastLoginAt
      }),
      message: '\u0627\u06cc\u0645\u06cc\u0644 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f'
    });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062a\u063a\u06cc\u06cc\u0631 \u0627\u06cc\u0645\u06cc\u0644' });
  }
});

router.put('/me/avatar', requireAuth, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: '\u0639\u06a9\u0633 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a' });
    }

    const avatarUrl = `uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarUrl },
      { new: true }
    ).select('name email role orgRole status adminLevel avatarUrl');

    await logActivity({
      req,
      action: 'update_avatar',
      targetUser: user._id,
      targetType: 'User',
      targetId: user._id.toString()
    });

    res.json({ success: true, user: withCanonicalIdentity(user), message: '\u0639\u06a9\u0633 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f' });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0622\u067e\u0644\u0648\u062f \u0639\u06a9\u0633' });
  }
});

router.delete('/me/avatar', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });

    const old = user.avatarUrl || '';
    user.avatarUrl = '';
    await user.save();

    if (old.startsWith('uploads/avatars/')) {
      const filePath = path.join(__dirname, '..', old);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await logActivity({
      req,
      action: 'remove_avatar',
      targetUser: user._id,
      targetType: 'User',
      targetId: user._id.toString()
    });

    res.json({ success: true, message: '\u0639\u06a9\u0633 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644 \u062d\u0630\u0641 \u0634\u062f' });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062d\u0630\u0641 \u0639\u06a9\u0633 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644' });
  }
});

router.get('/me/activity', requireAuth, async (req, res) => {
  try {
    const items = await ActivityLog.find({
      $or: [{ actor: req.user.id }, { targetUser: req.user.id }]
    }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0641\u0639\u0627\u0644\u06cc\u062a\u200c\u0647\u0627' });
  }
});

const NOTIFICATION_LEVELS = new Set(['critical', 'warning', 'info']);
const NOTIFICATION_EVENTS = new Set(['reminder', 'workflow', 'receipt', 'payment', 'submission', 'approval', 'rejection', 'relief', 'system']);
const NOTIFICATION_FILTER_DEFAULTS = Object.freeze({
  category: 'all',
  status: 'all',
  level: 'all',
  event: 'all',
  q: '',
  type: 'all'
});

const asPlainNotification = (item) => (
  item && typeof item.toObject === 'function' ? item.toObject() : { ...(item || {}) }
);

const buildNotificationSearchText = (item = {}) => (
  [
    item.title,
    item.message,
    item.type,
    item.category,
    item.eventKey,
    item.level,
    item.sourceModule
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
);

const inferNotificationCategory = (item = {}) => {
  const explicit = String(item.category || '').trim().toLowerCase();
  if (explicit) return explicit;

  const type = String(item.type || '').trim().toLowerCase();
  const haystack = buildNotificationSearchText(item);
  if (type.includes('finance') || haystack.includes('receipt') || haystack.includes('payment') || haystack.includes('\u0645\u0627\u0644\u06cc')) return 'finance';
  if (type.includes('workflow') || type.includes('access') || haystack.includes('\u067e\u06cc\u06af\u06cc\u0631\u06cc') || haystack.includes('\u0627\u0631\u062c\u0627\u0639')) return 'workflow';
  if (type.includes('schedule') || haystack.includes('\u0628\u0631\u0646\u0627\u0645\u0647')) return 'schedule';
  if (type.includes('profile') || haystack.includes('\u067e\u0631\u0648\u0641\u0627\u06cc\u0644')) return 'profile';
  return 'general';
};

const inferNotificationEventKey = (item = {}) => {
  const explicit = String(item.eventKey || '').trim().toLowerCase();
  if (NOTIFICATION_EVENTS.has(explicit)) return explicit;

  const haystack = buildNotificationSearchText(item);
  if (
    haystack.includes('reminder')
    || haystack.includes('overdue')
    || haystack.includes('due')
    || haystack.includes('\u06cc\u0627\u062f\u0622\u0648\u0631\u06cc')
    || haystack.includes('\u0645\u0639\u0648\u0642')
    || haystack.includes('\u0633\u0631\u0631\u0633\u06cc\u062f')
  ) return 'reminder';
  if (
    haystack.includes('relief')
    || haystack.includes('scholarship')
    || haystack.includes('discount')
    || haystack.includes('waiver')
    || haystack.includes('\u0628\u0648\u0631\u0633\u06cc\u0647')
    || haystack.includes('\u062a\u062e\u0641\u06cc\u0641')
    || haystack.includes('\u0645\u0639\u0627\u0641\u06cc\u062a')
    || haystack.includes('\u062a\u0633\u0647\u06cc\u0644\u0627\u062a')
  ) return 'relief';
  if (
    haystack.includes('reject')
    || haystack.includes('rejected')
    || haystack.includes('\u0631\u062f')
  ) return 'rejection';
  if (
    haystack.includes('approve')
    || haystack.includes('approved')
    || haystack.includes('\u062a\u0627\u06cc\u06cc\u062f')
    || haystack.includes('\u062a\u0623\u06cc\u06cc\u062f')
  ) return 'approval';
  if (
    haystack.includes('follow-up')
    || haystack.includes('follow up')
    || haystack.includes('review')
    || haystack.includes('stage')
    || haystack.includes('workflow')
    || haystack.includes('escalat')
    || haystack.includes('\u067e\u06cc\u06af\u06cc\u0631\u06cc')
    || haystack.includes('\u0627\u0631\u062c\u0627\u0639')
    || haystack.includes('\u0628\u0631\u0631\u0633\u06cc')
    || haystack.includes('\u0645\u0631\u062d\u0644\u0647')
  ) return 'workflow';
  if (
    haystack.includes('upload')
    || haystack.includes('submission')
    || haystack.includes('submitted')
    || haystack.includes('\u0627\u0631\u0633\u0627\u0644')
    || haystack.includes('\u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc')
  ) return 'submission';
  if (
    haystack.includes('receipt')
    || haystack.includes('\u0631\u0633\u06cc\u062f')
  ) return 'receipt';
  if (
    haystack.includes('payment')
    || haystack.includes('bill')
    || haystack.includes('\u067e\u0631\u062f\u0627\u062e\u062a')
    || haystack.includes('\u0628\u0644')
  ) return 'payment';
  return 'system';
};

const inferNotificationLevel = (item = {}, eventKey = 'system') => {
  const explicit = String(item.level || '').trim().toLowerCase();
  if (NOTIFICATION_LEVELS.has(explicit)) return explicit;

  const haystack = buildNotificationSearchText(item);
  if (
    haystack.includes('critical')
    || haystack.includes('urgent')
    || haystack.includes('reject')
    || haystack.includes('rejected')
    || haystack.includes('overdue')
    || haystack.includes('\u0645\u0639\u0648\u0642')
    || haystack.includes('\u0641\u0648\u0631\u06cc')
    || haystack.includes('\u0631\u062f')
  ) return 'critical';
  if (
    eventKey === 'reminder'
    || eventKey === 'workflow'
    || eventKey === 'submission'
    || haystack.includes('pending')
    || haystack.includes('follow')
    || haystack.includes('review')
    || haystack.includes('\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631')
    || haystack.includes('\u067e\u06cc\u06af\u06cc\u0631\u06cc')
    || haystack.includes('\u0628\u0631\u0631\u0633\u06cc')
  ) return 'warning';
  return 'info';
};

const inferNotificationActionUrl = (item = {}, category = 'general', eventKey = 'system') => {
  const explicit = String(item.actionUrl || '').trim();
  if (explicit) return explicit;

  if (category === 'finance') {
    if (['workflow', 'receipt', 'submission', 'approval', 'rejection'].includes(eventKey)) return '/admin-finance#pending-receipts';
    return '/admin-finance';
  }
  if (category === 'workflow') return '/admin';
  if (category === 'schedule') return '/admin-schedule';
  if (category === 'profile') return '/profile';
  return '';
};

const inferNotificationNeedsAction = (item = {}, eventKey = 'system', level = 'info') => {
  if (typeof item.needsAction === 'boolean') return item.needsAction;
  if (item.readAt) return false;
  return level !== 'info' || ['workflow', 'submission', 'rejection', 'reminder'].includes(eventKey);
};

const serializeNotificationItem = (item = {}) => {
  const plain = asPlainNotification(item);
  const category = inferNotificationCategory(plain);
  const eventKey = inferNotificationEventKey({ ...plain, category });
  const level = inferNotificationLevel({ ...plain, category, eventKey }, eventKey);
  const sourceModule = String(plain.sourceModule || '').trim().toLowerCase() || category;
  return {
    ...plain,
    category,
    eventKey,
    level,
    sourceModule,
    actionUrl: inferNotificationActionUrl({ ...plain, category, eventKey }, category, eventKey),
    needsAction: inferNotificationNeedsAction(plain, eventKey, level)
  };
};

const normalizeNotificationFilters = (source = {}) => {
  const category = String(source.category || source.module || NOTIFICATION_FILTER_DEFAULTS.category).trim().toLowerCase() || 'all';
  const status = String(source.status || NOTIFICATION_FILTER_DEFAULTS.status).trim().toLowerCase() || 'all';
  const level = String(source.level || NOTIFICATION_FILTER_DEFAULTS.level).trim().toLowerCase() || 'all';
  const event = String(source.event || NOTIFICATION_FILTER_DEFAULTS.event).trim().toLowerCase() || 'all';
  const q = String(source.q || source.search || NOTIFICATION_FILTER_DEFAULTS.q).trim().toLowerCase();
  const type = String(source.type || NOTIFICATION_FILTER_DEFAULTS.type).trim().toLowerCase() || 'all';
  return { category, status, level, event, q, type };
};

const filterNotificationItems = (items = [], filters = {}) => {
  const normalized = normalizeNotificationFilters(filters);
  return items.filter((item) => {
    const category = String(item.category || '').trim().toLowerCase();
    const level = String(item.level || '').trim().toLowerCase();
    const eventKey = String(item.eventKey || '').trim().toLowerCase();
    const type = String(item.type || '').trim().toLowerCase();
    const matchesStatus = normalized.status === 'all'
      ? true
      : normalized.status === 'read'
        ? Boolean(item.readAt)
        : !item.readAt;
    const matchesQuery = !normalized.q || buildNotificationSearchText(item).includes(normalized.q);

    return (
      (normalized.category === 'all' || category === normalized.category)
      && (normalized.level === 'all' || level === normalized.level)
      && (normalized.event === 'all' || eventKey === normalized.event)
      && (normalized.type === 'all' || type === normalized.type)
      && matchesStatus
      && matchesQuery
    );
  });
};

const buildNotificationSummary = (items = []) => {
  const summary = {
    total: items.length,
    unread: 0,
    read: 0,
    needsAction: 0,
    byLevel: {
      critical: 0,
      warning: 0,
      info: 0
    },
    byEvent: {},
    byCategory: {}
  };

  items.forEach((item) => {
    if (item.readAt) summary.read += 1;
    else summary.unread += 1;
    if (item.needsAction) summary.needsAction += 1;
    if (summary.byLevel[item.level] !== undefined) summary.byLevel[item.level] += 1;
    summary.byEvent[item.eventKey] = Number(summary.byEvent[item.eventKey] || 0) + 1;
    summary.byCategory[item.category] = Number(summary.byCategory[item.category] || 0) + 1;
  });

  return summary;
};

router.get('/me/notifications', requireAuth, async (req, res) => {
  try {
    const filters = normalizeNotificationFilters(req.query || {});
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(200, Math.max(1, Math.round(requestedLimit)))
      : 50;
    const rawItems = await UserNotification.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(limit);
    const items = rawItems.map((item) => serializeNotificationItem(item));
    const filtered = filterNotificationItems(items, filters);
    const summary = buildNotificationSummary(filterNotificationItems(items, {
      category: filters.category,
      type: filters.type
    }));
    res.json({
      success: true,
      items: filtered,
      unread: summary.unread,
      total: summary.total,
      filteredTotal: filtered.length,
      summary,
      appliedFilters: filters
    });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0627\u0639\u0644\u0627\u0646\u200c\u0647\u0627' });
  }
});

router.post('/me/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const item = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { readAt: new Date() },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: '\u0627\u0639\u0644\u0627\u0646 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    res.json({ success: true, item: serializeNotificationItem(item) });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0627\u0639\u0644\u0627\u0646' });
  }
});

router.post('/me/notifications/:id/unread', requireAuth, async (req, res) => {
  try {
    const item = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { readAt: null },
      { new: true }
    );
    if (!item) return res.status(404).json({ success: false, message: '\u0627\u0639\u0644\u0627\u0646 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    res.json({ success: true, item: serializeNotificationItem(item) });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0627\u0639\u0644\u0627\u0646' });
  }
});

router.post('/me/notifications/read-all', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const filters = normalizeNotificationFilters(req.body || {});
    const rawUnreadItems = await UserNotification.find({ user: req.user.id, readAt: null }).sort({ createdAt: -1 }).limit(200);
    const unreadItems = rawUnreadItems.map((item) => serializeNotificationItem(item));
    const targetIds = filterNotificationItems(unreadItems, filters).map((item) => item._id);
    if (!targetIds.length) {
      return res.json({ success: true, count: 0 });
    }
    const result = await UserNotification.updateMany(
      { user: req.user.id, readAt: null, _id: { $in: targetIds } },
      { $set: { readAt: now } }
    );
    const count = Number(result?.modifiedCount || result?.nModified || 0);
    res.json({ success: true, count });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0627\u0639\u0644\u0627\u0646\u200c\u0647\u0627' });
  }
});

router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: '\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0646\u0627\u0642\u0635 \u0627\u0633\u062a' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: '\u0631\u0645\u0632 \u062c\u062f\u06cc\u062f \u0628\u0627\u06cc\u062f \u062d\u062f\u0627\u0642\u0644 \u06f6 \u06a9\u0627\u0631\u0627\u06a9\u062a\u0631 \u0628\u0627\u0634\u062f' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(400).json({ success: false, message: '\u0631\u0645\u0632 \u0641\u0639\u0644\u06cc \u0627\u0634\u062a\u0628\u0627\u0647 \u0627\u0633\u062a' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await logActivity({
      req,
      action: 'change_password',
      targetUser: user._id,
      targetType: 'User',
      targetId: user._id.toString()
    });

    res.json({ success: true, message: '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0634\u062f' });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632' });
  }
});

router.post('/create-student', requireAuth, requireRole(['admin', 'instructor']), requireAnyPermission(['manage_users', 'manage_enrollments']), async (req, res) => {
  try {
    const { name, email, password, grade, subject } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: '\u0627\u0637\u0644\u0627\u0639\u0627\u062a \u0646\u0627\u0642\u0635 \u0627\u0633\u062a' });
    }

    const exists = await User.findOne({ email: email.trim().toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: '\u0627\u06cc\u0645\u06cc\u0644 \u0642\u0628\u0644\u0627 \u062b\u0628\u062a \u0634\u062f\u0647 \u0627\u0633\u062a' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: 'student',
      orgRole: 'student',
      status: 'active',
      grade: grade || '',
      subject: subject || ''
    });

    await logActivity({
      req,
      action: 'instructor_create_student',
      targetUser: user._id,
      targetType: 'User',
      targetId: user._id.toString()
    });

    res.status(201).json({ success: true, userId: user._id, message: '\u062f\u0627\u0646\u0634\u200c\u0622\u0645\u0648\u0632 \u0627\u06cc\u062c\u0627\u062f \u0634\u062f' });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u0627\u06cc\u062c\u0627\u062f \u062f\u0627\u0646\u0634\u200c\u0622\u0645\u0648\u0632' });
  }
});

module.exports = router;
