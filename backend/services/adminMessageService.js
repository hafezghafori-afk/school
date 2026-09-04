const mongoose = require('mongoose');
const User = require('../models/User');
const AfghanStudent = require('../models/AfghanStudent');
const UserNotification = require('../models/UserNotification');
const { sendMail } = require('../utils/mailer');

// سطوحی که حق دارند اعلانِ همگانی/وظیفه بفرستند — طبقِ تصمیمِ کاربر:
// ریاست عمومی، مدیر مکتب، مدیر تدریسی، مدیر مالی، سر معلم — همیشه در محدودهٔ
// «مکتبِ فعالِ» خودشان، نه سراسرِ سیستم.
const SEND_LEVELS = new Set([
  'general_president',
  'school_manager',
  'academic_manager',
  'finance_manager',
  'head_teacher'
]);

const ROLE_LABELS = {
  student: 'شاگردان',
  parent: 'والدین/سرپرستان',
  instructor: 'استادان',
  finance_manager: 'مدیر مالی',
  finance_lead: 'آمریت مالی',
  school_manager: 'مدیر مکتب',
  academic_manager: 'مدیر تدریسی',
  head_teacher: 'سر معلم',
  general_president: 'ریاست عمومی'
};

function canSend(adminLevel = '') {
  return SEND_LEVELS.has(String(adminLevel || '').trim());
}

const toId = (value) => String(value?._id || value || '').trim();

// دامنهٔ مخاطب را به فهرستِ آی‌دیِ حساب‌های کاربری تبدیل می‌کند — همیشه در
// محدودهٔ همان مکتب (schoolId) که پیام از آن فرستاده می‌شود.
async function resolveAudienceUserIds(schoolId, audience = {}) {
  const scope = String(audience?.scope || '').trim();
  const baseQuery = { schoolId, status: { $ne: 'inactive' } };

  if (scope === 'all') {
    const users = await User.find(baseQuery).select('_id').lean();
    return users.map((u) => String(u._id));
  }

  if (scope === 'role') {
    const roles = Array.isArray(audience?.roles) ? audience.roles.filter(Boolean) : [];
    if (!roles.length) return [];
    const users = await User.find({ ...baseQuery, orgRole: { $in: roles } }).select('_id').lean();
    return users.map((u) => String(u._id));
  }

  if (scope === 'class') {
    const classId = toId(audience?.classId);
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) return [];
    // شاگردانِ همان صنف، از طریقِ حسابِ کاربریِ وصل‌شده (linkedUserId) — پروندهٔ
    // بدونِ حسابِ کاربری قابلِ اطلاع‌رسانی نیست (وارونه‌اش هم صادق است: حسابی
    // که به هیچ شاگردی وصل نباشد در نتیجه نمی‌آید).
    const students = await AfghanStudent.find({
      $or: [{ 'academicInfo.classId': classId }, { 'academicInfo.currentClassId': classId }],
      linkedUserId: { $ne: null }
    }).select('linkedUserId').lean();
    return [...new Set(students.map((s) => String(s.linkedUserId)).filter(Boolean))];
  }

  if (scope === 'user') {
    const userIds = Array.isArray(audience?.userIds) ? audience.userIds.map(toId).filter(Boolean) : [];
    if (!userIds.length) return [];
    const users = await User.find({ _id: { $in: userIds }, schoolId }).select('_id').lean();
    return users.map((u) => String(u._id));
  }

  return [];
}

// اعلان/وظیفه را برای فهرستِ گیرندگان تحویل می‌دهد: زنگوله (UserNotification +
// رویدادِ زندهٔ سوکت) همیشه؛ ایمیل فقط اگر در channels خواسته شده باشد. ایمیل
// به‌صورتِ best-effort و بدونِ مسدودکردنِ پاسخ ارسال می‌شود (همان الگویی که
// contactRoutes.js برای ایمیلِ ورودی استفاده می‌کند).
async function deliverAdminMessage({ req, message, recipientUserIds }) {
  if (!recipientUserIds.length) return { notified: 0, emailQueued: 0 };

  const notifTitle = message.kind === 'task' ? `وظیفهٔ جدید: ${message.title}` : message.title;
  const docs = recipientUserIds.map((userId) => ({
    user: userId,
    title: notifTitle,
    message: message.body,
    type: message.kind === 'task' ? 'task' : 'announcement'
  }));
  const created = await UserNotification.insertMany(docs);

  const io = req?.app?.get?.('io');
  if (io) {
    created.forEach((doc) => io.to(`user:${doc.user}`).emit('notify:new', doc.toObject ? doc.toObject() : doc));
  }

  let emailQueued = 0;
  if (Array.isArray(message.channels) && message.channels.includes('email')) {
    const recipients = await User.find({ _id: { $in: recipientUserIds } }).select('email name').lean();
    const targets = recipients.filter((u) => u.email);
    emailQueued = targets.length;
    // بدونِ await — پاسخِ درخواست منتظرِ ارسالِ ده‌ها/صدها ایمیل نمی‌ماند.
    Promise.allSettled(targets.map((u) => sendMail({
      to: u.email,
      subject: notifTitle,
      text: message.body,
      html: `<p>${String(message.body).replace(/\n/g, '<br/>')}</p>`
    }))).catch(() => {});
  }

  return { notified: created.length, emailQueued };
}

module.exports = {
  SEND_LEVELS,
  ROLE_LABELS,
  canSend,
  resolveAudienceUserIds,
  deliverAdminMessage
};
