const express = require('express');
const ContactMessage = require('../models/ContactMessage');
const SiteSettings = require('../models/SiteSettings');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveAdminOrgRole } = require('../utils/userRole');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();
const FOLLOW_UP_LEVELS = ['finance_manager', 'finance_lead', 'general_president'];
const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'];

const normalizeFollowUpLevel = (value = '', fallback = 'finance_manager') => {
  const normalized = normalizeAdminLevel(value || fallback);
  return FOLLOW_UP_LEVELS.includes(normalized) ? normalized : 'finance_manager';
};

const normalizeFollowUpStatus = (value = '', fallback = 'new') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (FOLLOW_UP_STATUSES.includes(normalized)) return normalized;
  return FOLLOW_UP_STATUSES.includes(fallback) ? fallback : 'new';
};

const findAdminsByLevel = async (level = '', excludeUserId = '') => {
  const normalizedLevel = normalizeFollowUpLevel(level);
  const admins = await User.find({ role: 'admin' }).select('_id role orgRole adminLevel');
  return admins.filter((item) => {
    if (!item?._id) return false;
    if (excludeUserId && String(item._id) === String(excludeUserId)) return false;
    return resolveAdminOrgRole(item) === normalizedLevel;
  });
};

router.post('/', async (req, res) => {
  try {
    const { name, phone, email, message } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, message: 'متن پیام الزامی است' });
    }
    const item = await ContactMessage.create({
      name: name || '',
      phone: phone || '',
      email: email || '',
      message: message || ''
    });

    try {
      const settings = await SiteSettings.findOne();
      const to = settings?.contactEmail || process.env.CONTACT_EMAIL || '';
      if (to) {
        const subject = `پیام تماس جدید از ${name || 'بدون نام'}`;
        const text = `نام: ${name || '-'}\nایمیل: ${email || '-'}\nشماره: ${phone || '-'}\nپیام: ${message}`;
        await sendMail({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` });
      }
      if (email) {
        const subject = 'پیام شما دریافت شد';
        const text = 'پیام شما با موفقیت ثبت شد. تیم پشتیبانی به زودی پاسخ می‌دهد.';
        await sendMail({ to: email, subject, text, html: `<p>${text}</p>` });
      }
    } catch {
      // ignore email errors
    }

    res.json({ success: true, item, message: 'پیام شما ثبت شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در ثبت پیام' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const items = await ContactMessage.find()
      .populate('followUp.updatedBy', 'name orgRole adminLevel')
      .populate('followUp.history.updatedBy', 'name orgRole adminLevel')
      .sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت پیام‌ها' });
  }
});

router.put('/:id/read', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndUpdate(req.params.id, { status: 'read' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی پیام' });
  }
});

router.put('/:id/follow-up', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await ContactMessage.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });

    const assignedLevel = normalizeFollowUpLevel(req.body?.assignedLevel || item.followUp?.assignedLevel || 'finance_manager');
    const fallbackStatus = item.status === 'read' ? 'resolved' : 'new';
    const status = normalizeFollowUpStatus(req.body?.status || item.followUp?.status || fallbackStatus, fallbackStatus);
    const note = String(req.body?.note || '').trim().slice(0, 400);
    const now = new Date();
    const history = Array.isArray(item.followUp?.history) ? item.followUp.history : [];

    item.followUp = {
      assignedLevel,
      status,
      note,
      updatedBy: req.user.id,
      updatedAt: now,
      history: [...history, {
        assignedLevel,
        status,
        note,
        updatedBy: req.user.id,
        updatedAt: now
      }].slice(-40)
    };
    await item.save();

    const admins = await findAdminsByLevel(assignedLevel, req.user.id);
    if (admins.length) {
      const notifications = await UserNotification.insertMany(
        admins.map((admin) => ({
          user: admin._id,
          title: 'ارجاع پیام پشتیبانی',
          message: 'یک پیام پشتیبانی برای پیگیری به سطح شما ارجاع شد.',
          type: 'workflow'
        }))
      );
      const io = req?.app?.get?.('io');
      if (io) {
        notifications.forEach((noti) => io.to(`user:${noti.user}`).emit('notify:new', noti.toObject()));
      }
    }

    await logActivity({
      req,
      action: 'contact_follow_up_update',
      targetType: 'ContactMessage',
      targetId: item._id.toString(),
      meta: { assignedLevel, status }
    });

    res.json({ success: true, followUp: item.followUp, message: 'پیگیری پیام بروزرسانی شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی پیگیری پیام' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    res.json({ success: true, message: 'پیام حذف شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در حذف پیام' });
  }
});

module.exports = router;
