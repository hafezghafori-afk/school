const express = require('express');
const mongoose = require('mongoose');
const AdminMessage = require('../models/AdminMessage');
const User = require('../models/User');
const { requireAuth, requireAnyPermission } = require('../middleware/auth');
const { resolveActiveSchool } = require('../services/schoolContextService');
const { logActivity } = require('../utils/activity');
const {
  ROLE_LABELS,
  canSend,
  resolveAudienceUserIds,
  deliverAdminMessage
} = require('../services/adminMessageService');

const router = express.Router();

// دیدنِ این بخش برای همان سطوحی باز است که به بخش‌های کاربران/استادان/مالی
// دسترسی دارند؛ فرستادنِ اعلان/وظیفه محدودتر است (فقط ۵ سطحِ نام‌برده‌شده —
// canSend پایین‌تر همان را چک می‌کند).
const viewGuard = [requireAuth, requireAnyPermission(['content.contacts.manage', 'manage_finance', 'manage_users', 'teachers.manage'])];

const AUDIENCE_SCOPES = ['all', 'role', 'class', 'user'];
const ORG_ROLES = ['student', 'parent', 'instructor', 'finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president'];

function normalizeAudience(raw = {}) {
  const scope = AUDIENCE_SCOPES.includes(raw?.scope) ? raw.scope : '';
  const roles = Array.isArray(raw?.roles) ? raw.roles.filter((r) => ORG_ROLES.includes(r)) : [];
  const classId = mongoose.Types.ObjectId.isValid(raw?.classId) ? raw.classId : null;
  const userIds = Array.isArray(raw?.userIds)
    ? raw.userIds.filter((id) => mongoose.Types.ObjectId.isValid(id))
    : [];
  return { scope, roles, classId, userIds };
}

async function resolveSenderSchool(req) {
  const context = await resolveActiveSchool(req, { payload: req.query || req.body || {}, allowSingleFallback: true });
  return context;
}

const serializeMessage = (doc = {}) => {
  const d = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: String(d._id),
    kind: d.kind,
    title: d.title,
    body: d.body,
    channels: d.channels || [],
    audience: d.audience || {},
    senderName: d.senderName || '',
    senderLevel: d.senderLevel || '',
    recipientCount: d.recipientCount || 0,
    emailSentCount: d.emailSentCount || 0,
    dueDate: d.dueDate || null,
    followUp: d.followUp || null,
    status: d.status || 'active',
    createdAt: d.createdAt,
    updatedAt: d.updatedAt
  };
};

// GET /api/admin-messages - فهرستِ اعلان‌ها/وظایفِ همین مکتب
router.get('/', ...viewGuard, async (req, res) => {
  try {
    const { schoolId, requiresSelection } = await resolveSenderSchool(req);
    if (requiresSelection || !schoolId) return res.status(400).json({ success: false, message: 'اول یک مکتب فعال انتخاب کنید.' });

    const { kind, status = 'active', mine } = req.query || {};
    const filter = { schoolId };
    if (kind === 'announcement' || kind === 'task') filter.kind = kind;
    if (status === 'active' || status === 'archived') filter.status = status;
    if (mine === 'sent') filter.senderUserId = req.user.id;
    if (mine === 'assigned') filter['audience.userIds'] = req.user.id;

    const items = await AdminMessage.find(filter).sort({ createdAt: -1 }).limit(300);
    return res.json({ success: true, items: items.map(serializeMessage) });
  } catch (error) {
    console.error('admin-messages list error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'دریافتِ فهرست ناموفق بود.' });
  }
});

// POST /api/admin-messages/audience-preview - پیش‌نمایشِ تعدادِ گیرنده
router.post('/audience-preview', ...viewGuard, async (req, res) => {
  try {
    const { schoolId, requiresSelection } = await resolveSenderSchool(req);
    if (requiresSelection || !schoolId) return res.status(400).json({ success: false, message: 'اول یک مکتب فعال انتخاب کنید.' });
    const audience = normalizeAudience(req.body?.audience);
    if (!audience.scope) return res.status(400).json({ success: false, message: 'دامنهٔ مخاطب نامعتبر است.' });
    const ids = await resolveAudienceUserIds(schoolId, audience);
    return res.json({ success: true, count: ids.length });
  } catch (error) {
    console.error('audience-preview error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'محاسبهٔ تعدادِ گیرنده ناموفق بود.' });
  }
});

// GET /api/admin-messages/user-search?q= - جستجوی کاربر برای «فردِ مشخص» / وظیفه
router.get('/user-search', ...viewGuard, async (req, res) => {
  try {
    const { schoolId, requiresSelection } = await resolveSenderSchool(req);
    if (requiresSelection || !schoolId) return res.status(400).json({ success: false, message: 'اول یک مکتب فعال انتخاب کنید.' });
    const q = String(req.query?.q || '').trim();
    const filter = { schoolId, status: { $ne: 'inactive' } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const users = await User.find(filter).select('name email orgRole').sort({ name: 1 }).limit(30).lean();
    return res.json({
      success: true,
      items: users.map((u) => ({ _id: String(u._id), name: u.name || '', email: u.email || '', orgRole: u.orgRole || '', roleLabel: ROLE_LABELS[u.orgRole] || u.orgRole || '' }))
    });
  } catch (error) {
    console.error('admin-messages user-search error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'جستجوی کاربر ناموفق بود.' });
  }
});

async function createAndSend({ req, res, kind }) {
  if (!canSend(req.user.adminLevel)) {
    return res.status(403).json({ success: false, message: 'سطحِ دسترسیِ شما اجازهٔ ارسال ندارد.' });
  }
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!title || !body) return res.status(400).json({ success: false, message: 'عنوان و متن الزامی است.' });

  const { schoolId, requiresSelection } = await resolveSenderSchool(req);
  if (requiresSelection || !schoolId) return res.status(400).json({ success: false, message: 'اول یک مکتب فعال انتخاب کنید.' });

  const audience = normalizeAudience(req.body?.audience);
  if (!audience.scope) return res.status(400).json({ success: false, message: 'دامنهٔ مخاطب نامعتبر است.' });
  if (audience.scope === 'role' && !audience.roles.length) return res.status(400).json({ success: false, message: 'حداقل یک نقش را انتخاب کنید.' });
  if (audience.scope === 'class' && !audience.classId) return res.status(400).json({ success: false, message: 'یک صنف را انتخاب کنید.' });
  if (audience.scope === 'user' && !audience.userIds.length) return res.status(400).json({ success: false, message: 'حداقل یک نفر را انتخاب کنید.' });

  const channelsRaw = Array.isArray(req.body?.channels) ? req.body.channels : ['bell'];
  const channels = channelsRaw.filter((c) => c === 'bell' || c === 'email');
  if (!channels.length) channels.push('bell');

  const recipientUserIds = await resolveAudienceUserIds(schoolId, audience);
  if (!recipientUserIds.length) return res.status(400).json({ success: false, message: 'با این دامنه هیچ گیرنده‌ای پیدا نشد.' });

  const sender = await User.findById(req.user.id).select('name adminLevel').lean();

  const message = await AdminMessage.create({
    schoolId,
    kind,
    title,
    body,
    channels,
    audience,
    senderUserId: req.user.id,
    senderName: sender?.name || req.user.name || '',
    senderLevel: sender?.adminLevel || req.user.adminLevel || '',
    recipientUserIds,
    recipientCount: recipientUserIds.length,
    dueDate: kind === 'task' && req.body?.dueDate ? new Date(req.body.dueDate) : null,
    followUp: kind === 'task' ? { status: 'new', note: '', updatedBy: null, updatedAt: null, history: [] } : undefined
  });

  const { notified, emailQueued } = await deliverAdminMessage({ req, message, recipientUserIds });
  if (emailQueued) {
    message.emailSentCount = emailQueued;
    await message.save();
  }

  await logActivity({
    req,
    action: `admin_message_${kind}_send`,
    targetType: 'AdminMessage',
    targetId: String(message._id),
    meta: { recipientCount: recipientUserIds.length, audience: audience.scope }
  });

  return res.status(201).json({ success: true, item: serializeMessage(message), notified, emailQueued });
}

// POST /api/admin-messages/announcement - ترکیب و ارسالِ اعلانِ همگانی
router.post('/announcement', ...viewGuard, (req, res) => createAndSend({ req, res, kind: 'announcement' }));

// POST /api/admin-messages/task - تخصیصِ وظیفه به یک یا چند نفرِ مشخص
router.post('/task', ...viewGuard, (req, res) => {
  // وظیفه همیشه به «فردِ مشخص» تعلق دارد، نه نقش/صنف/همه.
  req.body = { ...req.body, audience: { scope: 'user', userIds: req.body?.assigneeIds || req.body?.audience?.userIds || [] } };
  return createAndSend({ req, res, kind: 'task' });
});

// PUT /api/admin-messages/:id/task-status - به‌روزرسانیِ پیشرفتِ وظیفه
// فقط requireAuth — گیرندهٔ وظیفه ممکن است هیچ مجوزِ مدیریتی نداشته باشد (مثلاً
// یک استادِ عادی)؛ اجازهٔ واقعی (گیرنده بودن یا فرستنده/بالاتر بودن) داخلِ خودِ
// روت چک می‌شود، نه در سطحِ میان‌افزار.
router.put('/:id/task-status', requireAuth, async (req, res) => {
  try {
    const item = await AdminMessage.findById(req.params.id);
    if (!item || item.kind !== 'task') return res.status(404).json({ success: false, message: 'وظیفه یافت نشد.' });

    const isAssignee = (item.audience?.userIds || []).some((id) => String(id) === String(req.user.id));
    const isSenderOrAbove = String(item.senderUserId) === String(req.user.id) || canSend(req.user.adminLevel);
    if (!isAssignee && !isSenderOrAbove) {
      return res.status(403).json({ success: false, message: 'دسترسیِ تغییرِ این وظیفه را ندارید.' });
    }

    const status = String(req.body?.status || '').trim();
    if (!['new', 'in_progress', 'on_hold', 'done'].includes(status)) {
      return res.status(400).json({ success: false, message: 'وضعیتِ نامعتبر.' });
    }
    const note = String(req.body?.note || '').trim().slice(0, 400);
    const now = new Date();
    const history = Array.isArray(item.followUp?.history) ? item.followUp.history : [];

    item.followUp = {
      status,
      note,
      updatedBy: req.user.id,
      updatedAt: now,
      history: [...history, { status, note, updatedBy: req.user.id, updatedAt: now }].slice(-40)
    };
    await item.save();

    return res.json({ success: true, item: serializeMessage(item) });
  } catch (error) {
    console.error('task-status update error:', error?.message || error);
    return res.status(500).json({ success: false, message: 'به‌روزرسانیِ وظیفه ناموفق بود.' });
  }
});

// PUT /api/admin-messages/:id/archive - بایگانی (نه حذفِ واقعی)
router.put('/:id/archive', ...viewGuard, async (req, res) => {
  try {
    const item = await AdminMessage.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'موردی یافت نشد.' });
    return res.json({ success: true, item: serializeMessage(item) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'بایگانی ناموفق بود.' });
  }
});

router.put('/:id/unarchive', ...viewGuard, async (req, res) => {
  try {
    const item = await AdminMessage.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'موردی یافت نشد.' });
    return res.json({ success: true, item: serializeMessage(item) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'بازگردانی ناموفق بود.' });
  }
});

module.exports = router;
