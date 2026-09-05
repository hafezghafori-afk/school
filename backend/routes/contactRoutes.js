const express = require('express');
const ContactMessage = require('../models/ContactMessage');
const SiteSettings = require('../models/SiteSettings');
const User = require('../models/User');
const UserNotification = require('../models/UserNotification');
const { normalizeAdminLevel } = require('../utils/permissions');
const { resolveAdminOrgRole } = require('../utils/userRole');
const { logActivity } = require('../utils/activity');
const { sendMail } = require('../utils/mailer');
const { requireAuth, requireRole, requireAnyPermission } = require('../middleware/auth');

const router = express.Router();
const FOLLOW_UP_LEVELS = ['finance_manager', 'finance_lead', 'general_president'];
const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'];

// مرکزِ ارتباطات برای همان سطوحی باز است که به کاربران/استادان/مالی دسترسی
// دارند — نه فقط general_president (که قبلاً تنها دارندهٔ manage_platform_requests بود).
const commsGuard = [requireAuth, requireRole(['admin']), requireAnyPermission(['content.contacts.manage', 'manage_platform_requests', 'manage_finance', 'manage_users', 'teachers.manage'])];

const normalizeFollowUpLevel = (value = '', fallback = 'finance_manager') => {
  const normalized = normalizeAdminLevel(value || fallback);
  return FOLLOW_UP_LEVELS.includes(normalized) ? normalized : 'finance_manager';
};

const normalizeFollowUpStatus = (value = '', fallback = 'new') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (FOLLOW_UP_STATUSES.includes(normalized)) return normalized;
  return FOLLOW_UP_STATUSES.includes(fallback) ? fallback : 'new';
};

const REQUEST_TYPES = ['contact', 'demo', 'suggestion', 'complaint'];
const TYPE_LABELS = {
  contact: 'پیام تماس',
  demo: 'درخواست دمو',
  suggestion: 'پیشنهاد',
  complaint: 'انتقاد / شکایت'
};

const normalizeRequestType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return REQUEST_TYPES.includes(normalized) ? normalized : 'contact';
};

const shouldNotifyType = (settings, type) => {
  const inbox = settings?.platformInboxEmails || {};
  const map = {
    demo: 'sendDemo',
    contact: 'sendContact',
    suggestion: 'sendSuggestion',
    complaint: 'sendComplaint'
  };
  const key = map[type] || 'sendContact';
  return inbox[key] !== false;
};

const getInboxRecipients = (settings, type) => {
  if (!shouldNotifyType(settings, type)) return [];
  const inbox = settings?.platformInboxEmails || {};
  return Array.from(new Set([
    inbox.official,
    inbox.personal,
    settings?.contactEmail,
    process.env.CONTACT_EMAIL
  ].map((item) => String(item || '').trim()).filter(Boolean)));
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
    const { name, phone, email, message, type, demoDetails } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, message: 'متن پیام الزامی است' });
    }
    const normalizedType = normalizeRequestType(type);
    const cleanDemoDetails = normalizedType === 'demo' ? {
      schoolName: String(demoDetails?.schoolName || '').trim(),
      responsibleName: String(demoDetails?.responsibleName || name || '').trim(),
      province: String(demoDetails?.province || '').trim(),
      city: String(demoDetails?.city || '').trim(),
      studentCount: String(demoDetails?.studentCount || '').trim(),
      centerType: String(demoDetails?.centerType || '').trim(),
      neededModules: Array.isArray(demoDetails?.neededModules)
        ? demoDetails.neededModules.map((item) => String(item || '').trim()).filter(Boolean)
        : []
    } : undefined;

    const item = await ContactMessage.create({
      name: name || '',
      phone: phone || '',
      email: email || '',
      message: message || '',
      type: normalizedType,
      ...(cleanDemoDetails ? { demoDetails: cleanDemoDetails } : {})
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
      const inboxRecipients = getInboxRecipients(settings, normalizedType);
      if (inboxRecipients.length) {
        const demoText = cleanDemoDetails
          ? `\nنام مکتب: ${cleanDemoDetails.schoolName || '-'}\nمسئول: ${cleanDemoDetails.responsibleName || '-'}\nولایت/شهر: ${cleanDemoDetails.province || '-'} / ${cleanDemoDetails.city || '-'}\nتعداد شاگردان: ${cleanDemoDetails.studentCount || '-'}\nنوع مرکز: ${cleanDemoDetails.centerType || '-'}\nبخش‌های مورد نیاز: ${(cleanDemoDetails.neededModules || []).join(', ') || '-'}`
          : '';
        const subject = `${TYPE_LABELS[normalizedType] || 'پیام'} جدید از ${cleanDemoDetails?.schoolName || name || 'بدون نام'}`;
        const text = `نوع: ${TYPE_LABELS[normalizedType] || normalizedType}\nنام: ${name || '-'}\nایمیل: ${email || '-'}\nشماره: ${phone || '-'}${demoText}\nپیام: ${message}`;
        await sendMail({ to: inboxRecipients.join(','), subject, text, html: `<p>${text.replace(/\n/g, '<br/>')}</p>` });
      }
    } catch {
      // ignore email errors
    }

    res.json({
      success: true,
      item,
      message: normalizedType === 'demo'
        ? 'درخواست شما ثبت شد. تیم سیما برای معرفی سیستم، قیمت و راه‌اندازی با شما تماس می‌گیرد.'
        : 'پیام شما ثبت شد'
    });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در ثبت پیام' });
  }
});

router.get('/admin', ...commsGuard, async (req, res) => {
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

router.put('/:id/read', ...commsGuard, async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndUpdate(req.params.id, { status: 'read' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی پیام' });
  }
});

// بایگانی — جایگزینِ حذفِ واقعی برای استفادهٔ روزمره؛ چیزی پاک نمی‌شود.
router.put('/:id/archive', ...commsGuard, async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    await logActivity({ req, action: 'contact_archive', targetType: 'ContactMessage', targetId: item._id.toString() });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بایگانیِ پیام' });
  }
});

router.put('/:id/unarchive', ...commsGuard, async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndUpdate(req.params.id, { status: 'read' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    res.json({ success: true, item });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در بازگردانیِ پیام' });
  }
});

// پاسخ به فرستنده — ایمیلِ خروجی، در پروندهٔ همان پیام هم ثبت می‌شود.
router.post('/:id/reply', ...commsGuard, async (req, res) => {
  try {
    const item = await ContactMessage.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    if (!item.email) return res.status(400).json({ success: false, message: 'این پیام ایمیلی برای پاسخ ندارد.' });

    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ success: false, message: 'متنِ پاسخ الزامی است.' });
    const subject = String(req.body?.subject || '').trim() || 'پاسخ به پیامِ شما';

    const result = await sendMail({ to: item.email, subject, text: body, html: `<p>${body.replace(/\n/g, '<br/>')}</p>` });
    if (!result?.ok) return res.status(502).json({ success: false, message: result?.message || 'ارسالِ ایمیل ناموفق بود.' });

    item.replies = [...(item.replies || []), { subject, body, sentBy: req.user.id, sentAt: new Date() }];
    if (item.status === 'new') item.status = 'read';
    await item.save();

    await logActivity({ req, action: 'contact_reply', targetType: 'ContactMessage', targetId: item._id.toString() });
    res.json({ success: true, item });
  } catch (error) {
    console.error('contact reply error:', error?.message || error);
    res.status(500).json({ success: false, message: 'ارسالِ پاسخ ناموفق بود.' });
  }
});

router.put('/:id/follow-up', ...commsGuard, async (req, res) => {
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

router.delete('/:id', ...commsGuard, async (req, res) => {
  try {
    const item = await ContactMessage.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'پیام یافت نشد' });
    res.json({ success: true, message: 'پیام حذف شد' });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در حذف پیام' });
  }
});

module.exports = router;
