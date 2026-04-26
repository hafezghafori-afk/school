const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const AfghanStudent = require('../models/AfghanStudent');
const Course = require('../models/Course');
const ActivityLog = require('../models/ActivityLog');
const ContactMessage = require('../models/ContactMessage');
const NewsItem = require('../models/NewsItem');
const Enrollment = require('../models/Enrollment');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Schedule = require('../models/Schedule');
const Homework = require('../models/Homework');
const Grade = require('../models/Grade');
const Subject = require('../models/Subject');
const SiteSettings = require('../models/SiteSettings');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../utils/activity');
const Result = require('../models/Result');
const ProfileUpdateRequest = require('../models/ProfileUpdateRequest');
const AccessRequest = require('../models/AccessRequest');
const UserNotification = require('../models/UserNotification');
const { sendMail } = require('../utils/mailer');
const { resolvePermissions, normalizeAdminLevel } = require('../utils/permissions');
const {
  buildUserRoleState,
  serializeUserIdentity,
  resolveAdminOrgRole,
  isKnownOrgRole,
  isKnownUserStatus,
  isKnownCompatibilityRole,
  normalizeUserStatus
} = require('../utils/userRole');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { runSlaEscalationSweep, LEVEL_TIMEOUT_MINUTES } = require('../services/slaAutomation');

const router = express.Router();
const CLIENT_ACTIVITY_ACTIONS = new Set([
  'admin_access_matrix_export_csv',
  'admin_access_matrix_print',
  'admin_users_access_matrix_export_csv',
  'admin_users_access_matrix_print'
]);
const CLIENT_ACTIVITY_ACTION_PERMISSIONS = Object.freeze({
  admin_access_matrix_export_csv: 'view_reports',
  admin_access_matrix_print: 'view_reports',
  admin_users_access_matrix_export_csv: 'manage_users',
  admin_users_access_matrix_print: 'manage_users'
});
const FOLLOW_UP_LEVELS = ['finance_manager', 'finance_lead', 'general_president'];
const FOLLOW_UP_STATUSES = ['new', 'in_progress', 'on_hold', 'escalated', 'resolved'];
const ALERT_LEVEL_ORDER = {
  high: 0,
  medium: 1,
  low: 2
};

const ALERT_KEY_ORDER = {
  finance_receipts: 0,
  finance_overdue: 1,
  schedule_drafts: 2,
  profile: 3,
  access: 4,
  contacts: 5
};

const ALERT_META_CONFIG = Object.freeze({
  finance_receipts: {
    title: 'رسیدهای مالی در انتظار تایید',
    domain: 'finance',
    owner: 'تیم مالی',
    thresholdMedium: 5,
    thresholdHigh: 12,
    slaMinutes: 12 * 60
  },
  finance_overdue: {
    title: 'بل‌های مالی معوق',
    domain: 'finance',
    owner: 'تیم مالی',
    thresholdMedium: 1,
    thresholdHigh: 4,
    slaMinutes: 24 * 60
  },
  schedule_drafts: {
    title: 'برنامه‌های پیش‌نویس منتشرنشده',
    domain: 'education',
    owner: 'تیم آموزشی',
    thresholdMedium: 4,
    thresholdHigh: 10,
    slaMinutes: 24 * 60
  },
  profile: {
    title: 'درخواست‌های تغییر مشخصات',
    domain: 'users',
    owner: 'تیم کاربران',
    thresholdMedium: 6,
    thresholdHigh: 15,
    slaMinutes: 8 * 60
  },
  access: {
    title: 'درخواست‌های دسترسی',
    domain: 'users',
    owner: 'تیم کاربران',
    thresholdMedium: 5,
    thresholdHigh: 12,
    slaMinutes: 8 * 60
  },
  contacts: {
    title: 'پیام‌های خوانده‌نشده پشتیبانی',
    domain: 'support',
    owner: 'تیم پشتیبانی',
    thresholdMedium: 10,
    thresholdHigh: 25,
    slaMinutes: 12 * 60
  }
});

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const countInCreatedWindow = (Model, filter = {}, fromDate = null, toDate = null) => {
  const createdAt = {};
  if (fromDate) createdAt.$gte = fromDate;
  if (toDate) createdAt.$lt = toDate;
  const query = Object.keys(createdAt).length
    ? { ...filter, createdAt }
    : { ...filter };
  return Model.countDocuments(query);
};

const resolveOldestTimestamp = async (Model, filter = {}, sort = { createdAt: 1 }, fields = 'createdAt updatedAt date') => {
  const item = await Model.findOne(filter).sort(sort).select(fields).lean();
  if (!item) return null;
  return item.createdAt || item.updatedAt || item.date || null;
};

const toAgeMinutes = (value) => {
  const date = toValidDate(value);
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.round(diff / 60000);
};

const resolveTrend = (current = 0, previous = 0) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  const diff = currentValue - previousValue;
  const direction = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'steady');
  if (!previousValue) {
    return {
      direction,
      diff,
      percent: currentValue > 0 ? 100 : 0
    };
  }
  return {
    direction,
    diff,
    percent: Math.round((diff / previousValue) * 100)
  };
};

const resolveAlertLevel = (count = 0, config = {}, overSla = false) => {
  const total = Number(count || 0);
  if (overSla) return 'high';
  if (total >= Number(config.thresholdHigh || 0)) return 'high';
  if (total >= Number(config.thresholdMedium || 0)) return 'medium';
  return 'low';
};

const membershipStatusToCompatibilityStatus = (value = '') => ({
  active: 'approved',
  pending: 'pending',
  rejected: 'rejected',
  dropped: 'rejected',
  transferred: 'rejected',
  graduated: 'rejected'
}[String(value || '').trim().toLowerCase()] || 'approved');

const serializeMembershipAccessRecord = (item = {}) => ({
  _id: item._id || null,
  user: item.student || null,
  student: item.student || null,
  course: item.course || null,
  status: membershipStatusToCompatibilityStatus(item.status),
  membershipStatus: item.status || '',
  note: item.note || '',
  rejectedReason: item.rejectedReason || '',
  source: item.source || 'system',
  isCurrent: !!item.isCurrent,
  joinedAt: item.joinedAt || null,
  leftAt: item.leftAt || null,
  legacyOrder: item.legacyOrder || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null
});
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

const notifyAssignedAdmins = async (req, level = '', title = '', message = '') => {
  const admins = await findAdminsByLevel(level, req.user?.id || '');
  if (!admins.length) return;
  const items = await UserNotification.insertMany(
    admins.map((admin) => ({
      user: admin._id,
      title,
      message,
      type: 'workflow'
    }))
  );
  const io = req?.app?.get?.('io');
  if (io) {
    items.forEach((item) => io.to(`user:${item.user}`).emit('notify:new', item.toObject()));
  }
};

const notifyUser = async (req, userId, payload = {}) => {
  if (!userId) return null;
  const item = await UserNotification.create({
    user: userId,
    title: payload.title || 'اعلان جدید',
    message: payload.message || '',
    type: payload.type || 'system'
  });
  const io = req?.app?.get?.('io');
  if (io) {
    io.to(`user:${item.user}`).emit('notify:new', item.toObject());
  }
  return item;
};

const toManagedUserPayload = (user) => {
  if (!user) return null;
  const payload = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    ...payload,
    ...serializeUserIdentity(payload)
  };
};

const MANAGED_USER_SELECT = 'name email role orgRole status adminLevel grade subject permissions createdAt updatedAt';
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeSchoolMailLabel = (value = '') => {
  const ascii = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'school';
};

const resolveSchoolMailLabel = async () => {
  const settings = await SiteSettings.findOne().select('brandName').lean();
  return normalizeSchoolMailLabel(settings?.brandName || 'school');
};

const normalizeStudentEmail = (value = '') => String(value || '').trim().toLowerCase();

const getStudentDisplayName = (student = {}) => {
  const firstName = String(student?.personalInfo?.firstName || '').trim();
  const lastName = String(student?.personalInfo?.lastName || '').trim();
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || String(student?.registrationId || student?._id || '').trim() || 'شاگرد';
};

const getStudentGrade = (student = {}) => String(student?.academicInfo?.currentGrade || '').trim();

const buildStudentFallbackEmail = (student = {}, source = 'student', schoolLabel = 'school') => {
  const idPart = String(student?._id || '').trim() || Date.now().toString(36);
  const tag = String(source || 'student').trim().toLowerCase();
  return `${tag}.${idPart}@${schoolLabel}.local`;
};

const ensureRegisteredStudentsInUserDirectory = async () => {
  const schoolLabel = await resolveSchoolMailLabel();

  const students = await AfghanStudent.find({
    verificationStatus: 'verified',
    status: 'active',
    $or: [
      { linkedUserId: null },
      { linkedUserId: { $exists: false } }
    ]
  })
    .select('_id personalInfo.firstName personalInfo.lastName contactInfo.email academicInfo.currentGrade linkedUserId')
    .lean();

  const approvedOnlineEnrollments = await Enrollment.find({
    status: 'approved',
    $or: [
      { linkedUserId: null },
      { linkedUserId: { $exists: false } }
    ]
  })
    .select('_id studentName email grade linkedUserId approvedAt')
    .lean();

  if (!students.length && !approvedOnlineEnrollments.length) return;

  for (const student of students) {
    const desiredName = getStudentDisplayName(student);
    const desiredGrade = getStudentGrade(student);
    const rawEmail = normalizeStudentEmail(student?.contactInfo?.email || '');
    let nextEmail = EMAIL_RX.test(rawEmail) ? rawEmail : buildStudentFallbackEmail(student, 'afghan', schoolLabel);
    let targetUserId = null;

    const existingByEmail = await User.findOne({ email: nextEmail }).select('_id orgRole').lean();
    if (existingByEmail?._id) {
      if (String(existingByEmail.orgRole || '') === 'student') {
        targetUserId = existingByEmail._id;
      } else {
        nextEmail = buildStudentFallbackEmail(student, 'afghan', schoolLabel);
      }
    }

    if (!targetUserId) {
      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const createdUser = await User.create({
        name: desiredName,
        email: nextEmail,
        password: hashedPassword,
        orgRole: 'student',
        role: 'student',
        status: 'active',
        grade: desiredGrade
      });
      targetUserId = createdUser._id;
    } else {
      await User.findByIdAndUpdate(targetUserId, {
        name: desiredName,
        grade: desiredGrade,
        status: 'active'
      });
    }

    await AfghanStudent.updateOne(
      { _id: student._id },
      {
        $set: {
          linkedUserId: targetUserId,
          updatedAt: new Date()
        }
      }
    );
  }

  for (const item of approvedOnlineEnrollments) {
    const desiredName = String(item?.studentName || '').trim() || 'شاگرد';
    const desiredGrade = String(item?.grade || '').trim();
    const rawEmail = normalizeStudentEmail(item?.email || '');
    let nextEmail = EMAIL_RX.test(rawEmail) ? rawEmail : buildStudentFallbackEmail(item, 'enrollment', schoolLabel);
    let targetUserId = null;

    const existingByEmail = await User.findOne({ email: nextEmail }).select('_id orgRole').lean();
    if (existingByEmail?._id) {
      if (String(existingByEmail.orgRole || '') === 'student') {
        targetUserId = existingByEmail._id;
      } else {
        nextEmail = buildStudentFallbackEmail(item, 'enrollment', schoolLabel);
      }
    }

    if (!targetUserId) {
      const tempPassword = crypto.randomBytes(12).toString('base64url');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      const createdUser = await User.create({
        name: desiredName,
        email: nextEmail,
        password: hashedPassword,
        orgRole: 'student',
        role: 'student',
        status: 'active',
        grade: desiredGrade
      });
      targetUserId = createdUser._id;
    } else {
      await User.findByIdAndUpdate(targetUserId, {
        name: desiredName,
        grade: desiredGrade,
        status: 'active'
      });
    }

    await Enrollment.updateOne(
      { _id: item._id },
      {
        $set: {
          linkedUserId: targetUserId,
          approvedAt: item?.approvedAt || new Date(),
          updatedAt: new Date()
        }
      }
    );
  }
};

const resolveRequestedOrgRole = (payload = {}) => {
  const explicitOrgRole = String(payload?.orgRole || '').trim().toLowerCase();
  if (isKnownOrgRole(explicitOrgRole)) return explicitOrgRole;

  const compatibilityRole = String(payload?.role || '').trim().toLowerCase();
  if (isKnownCompatibilityRole(compatibilityRole)) {
    return buildUserRoleState({
      role: compatibilityRole,
      adminLevel: normalizeAdminLevel(payload?.adminLevel || '', 'finance_manager')
    }).orgRole;
  }

  return 'student';
};

const sanitizeManagedPermissions = (orgRole = 'student', permissions = []) => {
  const normalizedOrgRole = resolveRequestedOrgRole({ orgRole });
  if (normalizedOrgRole === 'finance_manager' || normalizedOrgRole === 'finance_lead') return [];

  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(
    permissions
      .map((item) => String(item || '').trim())
      .filter((item) => ACCESS_PERMISSION_KEYS.has(item))
  ));
};

router.get('/users', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    await ensureRegisteredStudentsInUserDirectory();

    const items = await User.find({})
      .select(MANAGED_USER_SELECT)
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      items: items.map((item) => toManagedUserPayload(item))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت کاربران' });
  }
});

router.post('/users', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();
    const status = normalizeUserStatus(req.body?.status || '', 'active');
    const orgRole = resolveRequestedOrgRole(req.body || {});
    const grade = String(req.body?.grade || '').trim();
    const subject = String(req.body?.subject || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'نام، ایمیل و رمز عبور الزامی است.' });
    }
    if (!EMAIL_RX.test(email)) {
      return res.status(400).json({ success: false, message: 'ایمیل معتبر نیست.' });
    }

    const exists = await User.findOne({ email }).select('_id');
    if (exists) {
      return res.status(409).json({ success: false, message: 'این ایمیل از قبل ثبت شده است.' });
    }

    const identity = buildUserRoleState({ orgRole });
    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await User.create({
      name,
      email,
      password: hashedPassword,
      role: identity.role,
      orgRole: identity.orgRole,
      adminLevel: identity.adminLevel,
      status,
      grade,
      subject,
      permissions: sanitizeManagedPermissions(identity.orgRole, req.body?.permissions || [])
    });

    const item = await User.findById(created._id).select(MANAGED_USER_SELECT);

    await logActivity({
      req,
      action: 'admin_create_user',
      targetUser: created._id,
      targetType: 'User',
      targetId: String(created._id),
      meta: { orgRole: identity.orgRole }
    });

    res.status(201).json({
      success: true,
      item: toManagedUserPayload(item),
      message: 'کاربر جدید ایجاد شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ایجاد کاربر' });
  }
});

router.put('/users/:id/role', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const current = await User.findById(userId).select('_id permissions');
    if (!current) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    const orgRole = resolveRequestedOrgRole(req.body || {});
    const identity = buildUserRoleState({ orgRole });
    const updated = await User.findByIdAndUpdate(
      userId,
      {
        role: identity.role,
        orgRole: identity.orgRole,
        adminLevel: identity.adminLevel,
        permissions: sanitizeManagedPermissions(identity.orgRole, current.permissions || [])
      },
      { new: true, runValidators: true }
    ).select(MANAGED_USER_SELECT);

    await logActivity({
      req,
      action: 'admin_update_user_role',
      targetUser: userId,
      targetType: 'User',
      targetId: userId,
      meta: { orgRole: identity.orgRole }
    });

    res.json({
      success: true,
      item: toManagedUserPayload(updated),
      message: 'نقش کاربر به‌روزرسانی شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی نقش کاربر' });
  }
});

router.put('/users/:id/permissions', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const current = await User.findById(userId).select('_id orgRole');
    if (!current) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      { permissions: sanitizeManagedPermissions(current.orgRole || 'student', req.body?.permissions || []) },
      { new: true, runValidators: true }
    ).select(MANAGED_USER_SELECT);

    await logActivity({
      req,
      action: 'admin_update_user_permissions',
      targetUser: userId,
      targetType: 'User',
      targetId: userId
    });

    res.json({
      success: true,
      item: toManagedUserPayload(updated),
      message: 'دسترسی‌های کاربر به‌روزرسانی شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی دسترسی‌های کاربر' });
  }
});

router.put('/users/:id/status', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const status = normalizeUserStatus(req.body?.status || '', 'active');

    const updated = await User.findByIdAndUpdate(
      userId,
      { status },
      { new: true, runValidators: true }
    ).select(MANAGED_USER_SELECT);

    if (!updated) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    await logActivity({
      req,
      action: 'admin_update_user_status',
      targetUser: userId,
      targetType: 'User',
      targetId: userId,
      meta: { status }
    });

    res.json({
      success: true,
      item: toManagedUserPayload(updated),
      message: 'وضعیت کاربر به‌روزرسانی شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی وضعیت کاربر' });
  }
});

router.put('/users/:id', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const current = await User.findById(userId).select('_id email orgRole status');
    if (!current) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });
    }

    const name = String(req.body?.name || '').trim();
    let email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();
    const grade = String(req.body?.grade || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const status = normalizeUserStatus(req.body?.status || current.status || '', 'active');
    const orgRole = resolveRequestedOrgRole({
      orgRole: req.body?.orgRole || current.orgRole
    });
    const identity = buildUserRoleState({ orgRole });
    const isStudent = identity.orgRole === 'student';
    const schoolLabel = await resolveSchoolMailLabel();

    if (!name) {
      return res.status(400).json({ success: false, message: 'نام کاربر الزامی است.' });
    }

    if (!email && isStudent) {
      const currentEmail = String(current.email || '').trim().toLowerCase();
      email = EMAIL_RX.test(currentEmail) ? currentEmail : `${userId}@${schoolLabel}.local`;
    }

    if (isStudent && email && !EMAIL_RX.test(email)) {
      email = `${userId}@${schoolLabel}.local`;
    }

    if (!email) {
      return res.status(400).json({ success: false, message: 'ایمیل برای این نقش الزامی است.' });
    }

    if (!EMAIL_RX.test(email)) {
      return res.status(400).json({ success: false, message: 'ایمیل معتبر نیست.' });
    }
    if (password && password.length < 6) {
      return res.status(400).json({ success: false, message: 'رمز جدید باید حداقل ۶ کرکتر باشد.' });
    }

    const emailOwner = await User.findOne({ email, _id: { $ne: userId } }).select('_id');
    if (emailOwner) {
      return res.status(409).json({ success: false, message: 'این ایمیل از قبل برای کاربر دیگری ثبت شده است.' });
    }

    const update = {
      name,
      email,
      grade,
      subject,
      role: identity.role,
      orgRole: identity.orgRole,
      adminLevel: identity.adminLevel,
      status,
      permissions: sanitizeManagedPermissions(identity.orgRole, req.body?.permissions || [])
    };

    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }

    const updated = await User.findByIdAndUpdate(
      userId,
      update,
      { new: true, runValidators: true }
    ).select(MANAGED_USER_SELECT);

    await logActivity({
      req,
      action: 'admin_update_user_profile',
      targetUser: userId,
      targetType: 'User',
      targetId: userId,
      meta: {
        orgRole: identity.orgRole,
        passwordUpdated: Boolean(password)
      }
    });

    res.json({
      success: true,
      item: toManagedUserPayload(updated),
      message: 'مشخصات کاربر به‌روزرسانی شد.'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی مشخصات کاربر' });
  }
});

const DEACTIVATABLE_ORG_ROLES = new Set([
  'student',
  'instructor',
  'finance_manager',
  'finance_lead',
  'school_manager',
  'academic_manager',
  'head_teacher'
]);

const deactivateManagedUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const note = String(req.body?.note || 'غیرفعال‌سازی کاربر توسط ادمین').trim();

    if (!userId) {
      return res.status(400).json({ success: false, message: 'شناسه کاربر معتبر نیست.' });
    }

    const user = await User.findById(userId).select('_id name orgRole status');
    if (!user) {
      return res.status(404).json({ success: false, message: 'کاربر یافت نشد.' });
    }

    const userOrgRole = String(user.orgRole || '').trim().toLowerCase();
    if (!DEACTIVATABLE_ORG_ROLES.has(userOrgRole)) {
      return res.status(400).json({ success: false, message: 'غیرفعال‌سازی برای این نقش مجاز نیست.' });
    }

    user.status = 'inactive';
    await user.save();

    let deactivatedMemberships = 0;
    if (userOrgRole === 'student') {
      const memberships = await StudentMembership.find({
        student: user._id,
        isCurrent: true
      });

      for (const item of memberships) {
        item.status = 'inactive';
        item.isCurrent = false;
        item.leftAt = new Date();
        item.endedAt = item.leftAt;
        item.endedReason = 'student_deactivated_by_admin';
        item.note = String(item.note || '').trim()
          ? `${String(item.note || '').trim()}\n[${note}]`
          : `[${note}]`;
        await item.save();
        deactivatedMemberships += 1;
      }

      await AfghanStudent.updateMany(
        { linkedUserId: user._id, status: { $ne: 'deleted' } },
        {
          $set: {
            status: 'inactive',
            updatedAt: new Date(),
            lastUpdatedBy: req.user?.id || null
          }
        }
      );
    }

    await logActivity({
      req,
      action: 'admin_deactivate_user',
      targetUser: userId,
      targetType: 'User',
      targetId: userId,
      meta: {
        orgRole: userOrgRole,
        membershipsDeactivated: deactivatedMemberships,
        note
      }
    });

    const isStudent = userOrgRole === 'student';
    return res.json({
      success: true,
      message: isStudent
        ? 'شاگرد غیرفعال شد و اثر آن در بخش‌های ادمین و مالی اعمال گردید.'
        : 'کاربر غیرفعال شد و اثر آن در بخش ادمین اعمال گردید.',
      summary: {
        membershipsDeactivated: deactivatedMemberships
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در غیرفعال‌سازی کاربر' });
  }
};

router.put('/users/:id/deactivate', requireAuth, requireRole(['admin']), requirePermission('manage_users'), deactivateManagedUser);
router.put('/users/:id/student-deactivate', requireAuth, requireRole(['admin']), requirePermission('manage_users'), deactivateManagedUser);

const sortAlertsByPriority = (items = []) => [...items].sort((a, b) => {
  const levelA = Object.prototype.hasOwnProperty.call(ALERT_LEVEL_ORDER, a?.level || '')
    ? ALERT_LEVEL_ORDER[a.level]
    : Number.MAX_SAFE_INTEGER;
  const levelB = Object.prototype.hasOwnProperty.call(ALERT_LEVEL_ORDER, b?.level || '')
    ? ALERT_LEVEL_ORDER[b.level]
    : Number.MAX_SAFE_INTEGER;
  if (levelA !== levelB) return levelA - levelB;
  const countDiff = Number(b?.count || 0) - Number(a?.count || 0);
  if (countDiff !== 0) return countDiff;
  const keyA = Object.prototype.hasOwnProperty.call(ALERT_KEY_ORDER, a?.key || '')
    ? ALERT_KEY_ORDER[a.key]
    : Number.MAX_SAFE_INTEGER;
  const keyB = Object.prototype.hasOwnProperty.call(ALERT_KEY_ORDER, b?.key || '')
    ? ALERT_KEY_ORDER[b.key]
    : Number.MAX_SAFE_INTEGER;
  if (keyA !== keyB) return keyA - keyB;
  return String(a?.title || '').localeCompare(String(b?.title || ''));
});

const serializeFinanceSearchOrder = (item = {}) => ({
  _id: item?._id || null,
  billNumber: item?.orderNumber || item?.title || '',
  student: item?.student || null,
  course: item?.course || null,
  schoolClass: item?.classId || null,
  status: item?.status || '',
  academicYearId: item?.academicYearId || null,
  periodType: item?.periodType || '',
  periodLabel: item?.periodLabel || '',
  currency: item?.currency || 'AFN',
  amountOriginal: Number(item?.amountOriginal || 0),
  amountDue: Number(item?.amountDue || 0),
  amountPaid: Number(item?.amountPaid || 0),
  note: item?.note || '',
  sourceBillId: item?.sourceBillId || null
});

const serializeFinanceSearchPayment = (item = {}) => ({
  _id: item?._id || null,
  bill: item?.feeOrderId
    ? {
        _id: item.feeOrderId._id || item.feeOrderId,
        billNumber: item.feeOrderId.orderNumber || ''
      }
    : null,
  student: item?.student || null,
  course: item?.feeOrderId?.course || null,
  schoolClass: item?.classId || item?.feeOrderId?.classId || null,
  amount: Number(item?.amount || 0),
  status: item?.status || '',
  approvalStage: item?.approvalStage || '',
  paymentMethod: item?.paymentMethod || '',
  referenceNo: item?.referenceNo || '',
  note: item?.note || '',
  reviewNote: item?.reviewNote || '',
  rejectReason: item?.rejectReason || '',
  sourceReceiptId: item?.sourceReceiptId || null,
  followUp: item?.followUp || null
});

router.get('/stats', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const period = String(req.query.period || 'daily').toLowerCase();
    let startDate = new Date();
    if (period === 'weekly') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'monthly') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      startDate.setHours(0, 0, 0, 0); // daily
    }

    const [users, activeUsers, courses, totalReceipts, pendingReceipts, approvedReceipts, periodApprovedReceipts] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      Course.countDocuments(),
      FeePayment.countDocuments(),
      FeePayment.countDocuments({ status: 'pending' }),
      FeePayment.countDocuments({ status: 'approved' }),
      FeePayment.countDocuments({ status: 'approved', paidAt: { $gte: startDate } })
    ]);

    res.json({
      success: true,
      period,
      users,
      activeUsers,
      courses,
      receipts: totalReceipts,
      pendingReceipts,
      approvedReceipts,
      orders: totalReceipts,
      pendingOrders: pendingReceipts,
      approvedOrders: approvedReceipts,
      periodPayments: periodApprovedReceipts,
      finance: {
        pendingReceipts,
        approvedPeriodReceipts: periodApprovedReceipts
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت داشبورد ادمین' });
  }
});

router.get('/students/:id/activity', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const studentId = req.params.id;
    const [memberships, results, logs] = await Promise.all([
      StudentMembership.find({ student: studentId })
        .populate('student', 'name email grade role')
        .populate('course', 'title category level')
        .sort({ createdAt: -1 }),
      Result.find({ user: studentId }).populate('course'),
      ActivityLog.find({ targetUser: studentId }).sort({ createdAt: -1 })
    ]);
    const membershipItems = memberships.map((item) => serializeMembershipAccessRecord(item));
    res.json({ success: true, memberships: membershipItems, orders: membershipItems, results, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت فعالیت متعلم' });
  }
});

router.get('/profile-update-requests', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const status = String(req.query.status || 'pending');
    const filter = ['pending', 'approved', 'rejected'].includes(status) ? { status } : {};
    const items = await ProfileUpdateRequest.find(filter)
      .populate('user', 'name email role')
      .populate('reviewer', 'name')
      .populate('followUp.updatedBy', 'name orgRole adminLevel')
      .populate('followUp.history.updatedBy', 'name orgRole adminLevel')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ success: true, items });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت درخواست‌های تغییر مشخصات' });
  }
});

router.post('/profile-update-requests/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await ProfileUpdateRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'این درخواست قبلا بررسی شده است' });
    }

    const email = String(item.requestedData?.email || '').trim().toLowerCase();
    if (email) {
      const exists = await User.findOne({ email, _id: { $ne: item.user } });
      if (exists) {
        return res.status(400).json({ success: false, message: 'ایمیل درخواستی قبلا ثبت شده است' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      item.user,
      {
        name: String(item.requestedData?.name || '').trim(),
        email,
        grade: String(item.requestedData?.grade || '').trim(),
        subject: String(item.requestedData?.subject || '').trim(),
        bio: String(item.requestedData?.bio || '').trim().slice(0, 1000)
      },
      { new: true }
    );
    if (!updatedUser) return res.status(404).json({ success: false, message: 'کاربر یافت نشد' });

    item.status = 'approved';
    item.reviewer = req.user.id;
    item.reviewedAt = new Date();
    item.rejectionReason = '';
    await item.save();

    await UserNotification.create({
      user: updatedUser._id,
      title: 'تایید تغییر مشخصات',
      message: 'درخواست تغییر مشخصات شما توسط ادمین تایید شد.',
      type: 'profile_update'
    });

    await sendMail({
      to: updatedUser.email,
      subject: 'تایید تغییر مشخصات',
      text: 'درخواست تغییر مشخصات شما تایید شد.',
      html: '<p>درخواست تغییر مشخصات شما توسط ادمین تایید شد.</p>'
    });

    await logActivity({
      req,
      action: 'approve_profile_update_request',
      targetUser: updatedUser._id,
      targetType: 'ProfileUpdateRequest',
      targetId: item._id.toString()
    });

    res.json({ success: true, message: 'درخواست تایید شد و مشخصات شاگرد بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در تایید درخواست' });
  }
});

router.post('/profile-update-requests/:id/reject', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    const item = await ProfileUpdateRequest.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'این درخواست قبلا بررسی شده است' });
    }

    item.status = 'rejected';
    item.reviewer = req.user.id;
    item.reviewedAt = new Date();
    item.rejectionReason = reason;
    await item.save();

    const targetUser = await User.findById(item.user).select('email');
    await UserNotification.create({
      user: item.user,
      title: 'رد تغییر مشخصات',
      message: reason ? `درخواست تغییر مشخصات رد شد. دلیل: ${reason}` : 'درخواست تغییر مشخصات شما رد شد.',
      type: 'profile_update'
    });
    if (targetUser?.email) {
      await sendMail({
        to: targetUser.email,
        subject: 'رد تغییر مشخصات',
        text: reason ? `درخواست تغییر مشخصات رد شد. دلیل: ${reason}` : 'درخواست تغییر مشخصات رد شد.',
        html: `<p>${reason ? `درخواست تغییر مشخصات رد شد. دلیل: ${reason}` : 'درخواست تغییر مشخصات شما رد شد.'}</p>`
      });
    }

    await logActivity({
      req,
      action: 'reject_profile_update_request',
      targetUser: item.user,
      targetType: 'ProfileUpdateRequest',
      targetId: item._id.toString(),
      meta: { reason }
    });

    res.json({ success: true, message: 'درخواست رد شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در رد درخواست' });
  }
});

router.post('/profile-update-requests/:id/follow-up', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const item = await ProfileUpdateRequest.findById(req.params.id).populate('user', 'name');
    if (!item) return res.status(404).json({ success: false, message: 'درخواست یافت نشد' });

    const assignedLevel = normalizeFollowUpLevel(
      req.body?.assignedLevel || item.followUp?.assignedLevel || 'finance_manager'
    );
    const fallbackStatus = item.status === 'pending' ? 'new' : 'resolved';
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

    await notifyAssignedAdmins(
      req,
      assignedLevel,
      'ارجاع درخواست تغییر مشخصات',
      `یک مورد تغییر مشخصات برای پیگیری در سطح ${assignedLevel} ارجاع شد.`
    );

    await logActivity({
      req,
      action: 'profile_request_follow_up_update',
      targetUser: item.user?._id || item.user,
      targetType: 'ProfileUpdateRequest',
      targetId: item._id.toString(),
      meta: { assignedLevel, status }
    });

    res.json({ success: true, followUp: item.followUp, message: 'پیگیری درخواست بروزرسانی شد' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در بروزرسانی پیگیری درخواست' });
  }
});

router.get('/access-requests', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const statusRaw = String(req.query?.status || 'pending').trim().toLowerCase();
    const status = ['pending', 'approved', 'rejected', 'all'].includes(statusRaw) ? statusRaw : 'pending';
    const permission = String(req.query?.permission || '').trim();
    const filter = status === 'all' ? {} : { status };
    if (permission && ACCESS_PERMISSION_KEYS.has(permission)) {
      filter.permission = permission;
    }

    const items = await AccessRequest.find(filter)
      .populate('requester', 'name email role orgRole adminLevel permissions')
      .populate('reviewer', 'name role')
      .sort({ createdAt: -1 })
      .limit(300);

    res.json({ success: true, status, items });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627\u06cc \u062f\u0633\u062a\u0631\u0633\u06cc'
    });
  }
});

router.post('/access-requests/bulk', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => String(id || '').trim()).filter(Boolean) : [];
    const note = String(req.body?.note || '').trim().slice(0, 400);

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: '\u0646\u0648\u0639 \u0627\u0642\u062f\u0627\u0645 \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a' });
    }
    if (!ids.length) {
      return res.status(400).json({ success: false, message: '\u062d\u062f\u0627\u0642\u0644 \u06cc\u06a9 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0628\u0627\u06cc\u062f \u0627\u0646\u062a\u062e\u0627\u0628 \u0634\u0648\u062f' });
    }
    if (ids.length > 100) {
      return res.status(400).json({ success: false, message: '\u062d\u062f\u0627\u06a9\u062b\u0631 100 \u0645\u0648\u0631\u062f \u062f\u0631 \u0647\u0631 \u0628\u0627\u0631 \u0642\u0627\u0628\u0644 \u067e\u0631\u062f\u0627\u0632\u0634 \u0627\u0633\u062a' });
    }
    if (action === 'reject' && !note) {
      return res.status(400).json({ success: false, message: '\u0628\u0631\u0627\u06cc \u0631\u062f \u06af\u0631\u0648\u0647\u06cc\u060c \u0630\u06a9\u0631 \u062f\u0644\u06cc\u0644 \u0627\u0644\u0632\u0627\u0645\u06cc \u0627\u0633\u062a' });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const invalidIdCount = ids.length - validIds.length;
    if (!validIds.length) {
      return res.status(400).json({ success: false, message: '\u0634\u0646\u0627\u0633\u0647 \u0645\u0639\u062a\u0628\u0631\u06cc \u0627\u0631\u0633\u0627\u0644 \u0646\u0634\u062f' });
    }

    const items = await AccessRequest.find({ _id: { $in: validIds } });
    const requestedMap = new Map(items.map((item) => [String(item._id), item]));
    const orderedItems = ids.map((id) => requestedMap.get(id)).filter(Boolean);

    let approvedCount = 0;
    let rejectedCount = 0;
    let changedPermissionsCount = 0;
    let skippedCount = invalidIdCount;
    const skipped = [];

    if (invalidIdCount > 0) {
      skipped.push({ id: '', reason: `invalid_ids:${invalidIdCount}` });
    }

    for (const item of orderedItems) {
      if (!item || item.status !== 'pending') {
        skippedCount += 1;
        skipped.push({ id: String(item?._id || ''), reason: 'not_pending' });
        continue;
      }
      if (!ACCESS_PERMISSION_KEYS.has(item.permission)) {
        skippedCount += 1;
        skipped.push({ id: String(item._id), reason: 'invalid_permission' });
        continue;
      }

      const targetUser = await User.findById(item.requester).select('name email role orgRole adminLevel permissions');
      if (!targetUser) {
        skippedCount += 1;
        skipped.push({ id: String(item._id), reason: 'user_not_found' });
        continue;
      }

      if (action === 'approve') {
        const targetIdentity = serializeUserIdentity(targetUser);
        const normalizedLevel = targetIdentity.role === 'admin'
          ? normalizeAdminLevel(targetIdentity.adminLevel || targetIdentity.orgRole || '', 'finance_manager')
          : '';
        const effectivePermissions = resolvePermissions({
          role: targetIdentity.role,
          orgRole: targetIdentity.orgRole,
          permissions: targetUser.permissions || [],
          adminLevel: normalizedLevel
        });
        if (targetIdentity.role === 'admin' && targetIdentity.orgRole !== 'general_president' && !effectivePermissions.includes(item.permission)) {
          skippedCount += 1;
          skipped.push({ id: String(item._id), reason: 'admin_level_restriction' });
          continue;
        }

        if (!effectivePermissions.includes(item.permission)) {
          const nextPermissions = new Set(Array.isArray(targetUser.permissions) ? targetUser.permissions : []);
          nextPermissions.add(item.permission);
          targetUser.permissions = Array.from(nextPermissions);
          await targetUser.save();
          changedPermissionsCount += 1;
        }

        item.status = 'approved';
        item.reviewer = req.user.id;
        item.reviewedAt = new Date();
        item.decisionNote = note;
        await item.save();
        approvedCount += 1;

        await notifyUser(req, targetUser._id, {
          title: '\u062a\u0627\u06cc\u06cc\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc',
          message: `\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc ${item.permission} \u062a\u0627\u06cc\u06cc\u062f \u0634\u062f.`,
          type: 'access_request'
        });
      } else {
        item.status = 'rejected';
        item.reviewer = req.user.id;
        item.reviewedAt = new Date();
        item.decisionNote = note;
        await item.save();
        rejectedCount += 1;

        await notifyUser(req, targetUser._id, {
          title: '\u0631\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc',
          message: `\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc ${item.permission} \u0631\u062f \u0634\u062f. ${note ? `\u062f\u0644\u06cc\u0644: ${note}` : ''}`.trim(),
          type: 'access_request'
        });
      }
    }

    await logActivity({
      req,
      action: action === 'approve' ? 'bulk_approve_access_requests' : 'bulk_reject_access_requests',
      targetUser: req.user.id,
      targetType: 'AccessRequest',
      targetId: ids.join(','),
      meta: {
        totalRequested: ids.length,
        approvedCount,
        rejectedCount,
        changedPermissionsCount,
        skippedCount
      }
    });

    return res.json({
      success: true,
      summary: {
        totalRequested: ids.length,
        approvedCount,
        rejectedCount,
        changedPermissionsCount,
        skippedCount
      },
      skipped: skipped.slice(0, 20),
      message: action === 'approve'
        ? '\u062a\u0627\u06cc\u06cc\u062f \u06af\u0631\u0648\u0647\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627 \u0627\u0646\u062c\u0627\u0645 \u0634\u062f'
        : '\u0631\u062f \u06af\u0631\u0648\u0647\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627 \u0627\u0646\u062c\u0627\u0645 \u0634\u062f'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: '\u062e\u0637\u0627 \u062f\u0631 \u067e\u0631\u062f\u0627\u0632\u0634 \u06af\u0631\u0648\u0647\u06cc \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u0647\u0627\u06cc \u062f\u0633\u062a\u0631\u0633\u06cc'
    });
  }
});

router.post('/access-requests/:id/approve', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const decisionNote = String(req.body?.note || '').trim().slice(0, 400);
    const item = await AccessRequest.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    }
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: '\u0627\u06cc\u0646 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0642\u0628\u0644\u0627 \u0628\u0631\u0631\u0633\u06cc \u0634\u062f\u0647 \u0627\u0633\u062a' });
    }
    if (!ACCESS_PERMISSION_KEYS.has(item.permission)) {
      return res.status(400).json({ success: false, message: '\u0646\u0648\u0639 \u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u0639\u062a\u0628\u0631 \u0646\u06cc\u0633\u062a' });
    }

    const targetUser = await User.findById(item.requester).select('name email role orgRole adminLevel permissions');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: '\u06a9\u0627\u0631\u0628\u0631 \u062f\u0631\u062e\u0648\u0627\u0633\u062a\u200c\u062f\u0647\u0646\u062f\u0647 \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    }

    const targetIdentity = serializeUserIdentity(targetUser);
    const normalizedLevel = targetIdentity.role === 'admin'
      ? normalizeAdminLevel(targetIdentity.adminLevel || targetIdentity.orgRole || '', 'finance_manager')
      : '';
    const effectivePermissions = resolvePermissions({
      role: targetIdentity.role,
      orgRole: targetIdentity.orgRole,
      permissions: targetUser.permissions || [],
      adminLevel: normalizedLevel
    });
    let changed = false;

    if (targetIdentity.role === 'admin' && targetIdentity.orgRole !== 'general_president' && !effectivePermissions.includes(item.permission)) {
      return res.status(400).json({
        success: false,
        message: '\u0628\u0631\u0627\u06cc \u0627\u062f\u0645\u06cc\u0646 \u0628\u0627 \u0627\u06cc\u0646 \u0633\u0637\u062d \u0627\u062f\u0627\u0631\u06cc \u0627\u0645\u06a9\u0627\u0646 \u062a\u062e\u0635\u06cc\u0635 \u0627\u06cc\u0646 \u062f\u0633\u062a\u0631\u0633\u06cc \u0648\u062c\u0648\u062f \u0646\u062f\u0627\u0631\u062f'
      });
    }

    if (!effectivePermissions.includes(item.permission)) {
      const nextPermissions = new Set(Array.isArray(targetUser.permissions) ? targetUser.permissions : []);
      nextPermissions.add(item.permission);
      targetUser.permissions = Array.from(nextPermissions);
      await targetUser.save();
      changed = true;
    }

    item.status = 'approved';
    item.reviewer = req.user.id;
    item.reviewedAt = new Date();
    item.decisionNote = decisionNote;
    await item.save();

    const permissionText = item.permission;
    await notifyUser(req, targetUser._id, {
      title: '\u062a\u0627\u06cc\u06cc\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc',
      message: `\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc ${permissionText} \u062a\u0627\u06cc\u06cc\u062f \u0634\u062f.`,
      type: 'access_request'
    });

    await logActivity({
      req,
      action: 'approve_access_request',
      targetUser: targetUser._id,
      targetType: 'AccessRequest',
      targetId: item._id.toString(),
      meta: {
        permission: item.permission,
        route: item.route,
        changed
      }
    });

    res.json({
      success: true,
      item,
      changed,
      message: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc \u062a\u0627\u06cc\u06cc\u062f \u0634\u062f'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '\u062e\u0637\u0627 \u062f\u0631 \u062a\u0627\u06cc\u06cc\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc'
    });
  }
});

router.post('/access-requests/:id/reject', requireAuth, requireRole(['admin']), requirePermission('manage_users'), async (req, res) => {
  try {
    const decisionNote = String(req.body?.note || '').trim().slice(0, 400);
    const item = await AccessRequest.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u06cc\u0627\u0641\u062a \u0646\u0634\u062f' });
    }
    if (item.status !== 'pending') {
      return res.status(400).json({ success: false, message: '\u0627\u06cc\u0646 \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0642\u0628\u0644\u0627 \u0628\u0631\u0631\u0633\u06cc \u0634\u062f\u0647 \u0627\u0633\u062a' });
    }

    item.status = 'rejected';
    item.reviewer = req.user.id;
    item.reviewedAt = new Date();
    item.decisionNote = decisionNote;
    await item.save();

    const targetUser = await User.findById(item.requester).select('name email');
    if (targetUser) {
      await notifyUser(req, targetUser._id, {
        title: '\u0631\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc',
        message: decisionNote
          ? `\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc ${item.permission} \u0631\u062f \u0634\u062f. \u062f\u0644\u06cc\u0644: ${decisionNote}`
          : `\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc ${item.permission} \u0631\u062f \u0634\u062f.`,
        type: 'access_request'
      });
    }

    await logActivity({
      req,
      action: 'reject_access_request',
      targetUser: targetUser?._id || item.requester,
      targetType: 'AccessRequest',
      targetId: item._id.toString(),
      meta: {
        permission: item.permission,
        route: item.route,
        reason: decisionNote
      }
    });

    res.json({
      success: true,
      item,
      message: '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc \u0631\u062f \u0634\u062f'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: '\u062e\u0637\u0627 \u062f\u0631 \u0631\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062f\u0633\u062a\u0631\u0633\u06cc'
    });
  }
});

router.get('/workflow-report', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const levels = [...FOLLOW_UP_LEVELS];
    const workflowTypes = ['receipt', 'profile', 'support'];
    const requestedType = String(req.query?.type || 'all').trim().toLowerCase();
    const normalizedType = requestedType === 'all' || workflowTypes.includes(requestedType) ? requestedType : 'all';
    const selectedTypes = normalizedType === 'all' ? workflowTypes : [normalizedType];

    const summary = levels.reduce((acc, level) => {
      acc[level] = { assigned: 0, open: 0, resolved: 0 };
      return acc;
    }, {});

    const byType = selectedTypes.reduce((acc, type) => {
      acc[type] = levels.reduce((levelAcc, level) => {
        levelAcc[level] = { assigned: 0, open: 0, resolved: 0 };
        return levelAcc;
      }, {});
      return acc;
    }, {});

    const breakdownMap = new Map();
    const typeConfigs = {
      receipt: { model: FeePayment, baseMatch: {} },
      profile: { model: ProfileUpdateRequest, baseMatch: {} },
      support: { model: ContactMessage, baseMatch: {} }
    };

    const pushBreakdown = (type = '', level = '', status = '', count = 0) => {
      if (!workflowTypes.includes(type)) return;
      if (!levels.includes(level)) return;
      const normalizedStatus = String(status || '').trim().toLowerCase() || 'new';
      const key = `${type}__${level}__${normalizedStatus}`;
      const next = Number(count || 0);
      if (!next) return;
      const prev = breakdownMap.get(key) || { type, level, status: normalizedStatus, count: 0 };
      prev.count += next;
      breakdownMap.set(key, prev);
    };

    for (const type of selectedTypes) {
      const config = typeConfigs[type];
      if (!config) continue;

      const [assignedRows, currentRows] = await Promise.all([
        config.model.aggregate([
          { $match: { ...config.baseMatch, 'followUp.history.0': { $exists: true } } },
          { $unwind: '$followUp.history' },
          { $group: { _id: '$followUp.history.assignedLevel', count: { $sum: 1 } } }
        ]),
        config.model.aggregate([
          { $match: { ...config.baseMatch, 'followUp.assignedLevel': { $in: levels } } },
          { $group: { _id: { level: '$followUp.assignedLevel', status: '$followUp.status' }, count: { $sum: 1 } } }
        ])
      ]);

      assignedRows.forEach((row) => {
        const level = String(row?._id || '');
        const count = Number(row?.count || 0);
        if (!byType[type]?.[level] || !count) return;
        byType[type][level].assigned += count;
        summary[level].assigned += count;
      });

      currentRows.forEach((row) => {
        const level = String(row?._id?.level || '');
        const status = String(row?._id?.status || '').trim().toLowerCase();
        const count = Number(row?.count || 0);
        if (!byType[type]?.[level] || !count) return;

        if (status === 'resolved') {
          byType[type][level].resolved += count;
          summary[level].resolved += count;
        } else {
          byType[type][level].open += count;
          summary[level].open += count;
        }

        pushBreakdown(type, level, status, count);
      });
    }

    const totals = Object.values(summary).reduce((acc, item) => ({
      assigned: acc.assigned + Number(item.assigned || 0),
      open: acc.open + Number(item.open || 0),
      resolved: acc.resolved + Number(item.resolved || 0)
    }), { assigned: 0, open: 0, resolved: 0 });

    const typeTotals = Object.entries(byType).reduce((acc, [type, levelRows]) => {
      acc[type] = Object.values(levelRows).reduce((sum, row) => ({
        assigned: sum.assigned + Number(row.assigned || 0),
        open: sum.open + Number(row.open || 0),
        resolved: sum.resolved + Number(row.resolved || 0)
      }), { assigned: 0, open: 0, resolved: 0 });
      return acc;
    }, {});

    const statusOrder = FOLLOW_UP_STATUSES.reduce((acc, status, index) => {
      acc[status] = index;
      return acc;
    }, {});

    const breakdown = Array.from(breakdownMap.values()).sort((a, b) => {
      const typeDiff = workflowTypes.indexOf(a.type) - workflowTypes.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;
      const levelDiff = levels.indexOf(a.level) - levels.indexOf(b.level);
      if (levelDiff !== 0) return levelDiff;
      const statusA = Object.prototype.hasOwnProperty.call(statusOrder, a.status)
        ? statusOrder[a.status]
        : Number.MAX_SAFE_INTEGER;
      const statusB = Object.prototype.hasOwnProperty.call(statusOrder, b.status)
        ? statusOrder[b.status]
        : Number.MAX_SAFE_INTEGER;
      if (statusA !== statusB) return statusA - statusB;
      return String(a.status).localeCompare(String(b.status));
    });

    res.json({
      success: true,
      type: normalizedType,
      availableTypes: workflowTypes,
      levels: summary,
      byType,
      breakdown,
      totals,
      typeTotals
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u06af\u0632\u0627\u0631\u0634 \u0639\u0645\u0644\u06a9\u0631\u062f \u0633\u0637\u0648\u062d \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc' });
  }
});

router.get('/alerts', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const todayKey = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const previous24hStart = new Date(now - (48 * 60 * 60000));
    const current24hStart = new Date(now - (24 * 60 * 60000));

    const [pendingFinanceReceipts, overdueBills, draftSchedules, pendingProfile, pendingAccessRequests, unreadContacts, latestLogs] = await Promise.all([
      FeePayment.countDocuments({ status: 'pending' }),
      FeeOrder.countDocuments({ status: 'overdue' }),
      Schedule.countDocuments({ visibility: 'draft', date: { $gte: todayKey } }),
      ProfileUpdateRequest.countDocuments({ status: 'pending' }),
      AccessRequest.countDocuments({ status: 'pending' }),
      ContactMessage.countDocuments({ status: 'new' }),
      ActivityLog.find().sort({ createdAt: -1 }).limit(6)
    ]);

    const [
      financeReceiptsOldest,
      overdueBillsOldest,
      draftSchedulesOldest,
      profileOldest,
      accessOldest,
      contactOldest,
      financeReceiptsCurrent24h,
      financeReceiptsPrevious24h,
      overdueBillsCurrent24h,
      overdueBillsPrevious24h,
      draftSchedulesCurrent24h,
      draftSchedulesPrevious24h,
      profileCurrent24h,
      profilePrevious24h,
      accessCurrent24h,
      accessPrevious24h,
      contactsCurrent24h,
      contactsPrevious24h
    ] = await Promise.all([
      resolveOldestTimestamp(FeePayment, { status: 'pending' }, { createdAt: 1 }),
      resolveOldestTimestamp(FeeOrder, { status: 'overdue' }, { createdAt: 1 }),
      resolveOldestTimestamp(Schedule, { visibility: 'draft', date: { $gte: todayKey } }, { date: 1, createdAt: 1 }),
      resolveOldestTimestamp(ProfileUpdateRequest, { status: 'pending' }, { createdAt: 1 }),
      resolveOldestTimestamp(AccessRequest, { status: 'pending' }, { createdAt: 1 }),
      resolveOldestTimestamp(ContactMessage, { status: 'new' }, { createdAt: 1 }),
      countInCreatedWindow(FeePayment, { status: 'pending' }, current24hStart, null),
      countInCreatedWindow(FeePayment, { status: 'pending' }, previous24hStart, current24hStart),
      countInCreatedWindow(FeeOrder, { status: 'overdue' }, current24hStart, null),
      countInCreatedWindow(FeeOrder, { status: 'overdue' }, previous24hStart, current24hStart),
      countInCreatedWindow(Schedule, { visibility: 'draft', date: { $gte: todayKey } }, current24hStart, null),
      countInCreatedWindow(Schedule, { visibility: 'draft', date: { $gte: todayKey } }, previous24hStart, current24hStart),
      countInCreatedWindow(ProfileUpdateRequest, { status: 'pending' }, current24hStart, null),
      countInCreatedWindow(ProfileUpdateRequest, { status: 'pending' }, previous24hStart, current24hStart),
      countInCreatedWindow(AccessRequest, { status: 'pending' }, current24hStart, null),
      countInCreatedWindow(AccessRequest, { status: 'pending' }, previous24hStart, current24hStart),
      countInCreatedWindow(ContactMessage, { status: 'new' }, current24hStart, null),
      countInCreatedWindow(ContactMessage, { status: 'new' }, previous24hStart, current24hStart)
    ]);

    const rawAlerts = [
      {
        key: 'finance_receipts',
        count: pendingFinanceReceipts,
        oldestAt: financeReceiptsOldest,
        newItems24h: financeReceiptsCurrent24h,
        previousItems24h: financeReceiptsPrevious24h
      },
      {
        key: 'finance_overdue',
        count: overdueBills,
        oldestAt: overdueBillsOldest,
        newItems24h: overdueBillsCurrent24h,
        previousItems24h: overdueBillsPrevious24h
      },
      {
        key: 'schedule_drafts',
        count: draftSchedules,
        oldestAt: draftSchedulesOldest,
        newItems24h: draftSchedulesCurrent24h,
        previousItems24h: draftSchedulesPrevious24h
      },
      {
        key: 'profile',
        count: pendingProfile,
        oldestAt: profileOldest,
        newItems24h: profileCurrent24h,
        previousItems24h: profilePrevious24h
      },
      {
        key: 'access',
        count: pendingAccessRequests,
        oldestAt: accessOldest,
        newItems24h: accessCurrent24h,
        previousItems24h: accessPrevious24h
      },
      {
        key: 'contacts',
        count: unreadContacts,
        oldestAt: contactOldest,
        newItems24h: contactsCurrent24h,
        previousItems24h: contactsPrevious24h
      }
    ];

    const alerts = rawAlerts
      .filter((item) => Number(item.count || 0) > 0)
      .map((item) => {
        const config = ALERT_META_CONFIG[item.key] || {};
        const oldestPendingMinutes = toAgeMinutes(item.oldestAt);
        const overSla = Number(oldestPendingMinutes || 0) >= Number(config.slaMinutes || 0) && Number(config.slaMinutes || 0) > 0;
        const level = resolveAlertLevel(item.count, config, overSla);
        const trend = resolveTrend(item.newItems24h, item.previousItems24h);
        return {
          key: item.key,
          title: config.title || item.key,
          domain: config.domain || 'general',
          owner: config.owner || 'تیم مدیریت',
          level,
          count: Number(item.count || 0),
          oldestPendingAt: item.oldestAt || null,
          oldestPendingMinutes,
          slaMinutes: Number(config.slaMinutes || 0),
          overSla,
          requiresImmediateAction: level === 'high' || overSla,
          newItems24h: Number(item.newItems24h || 0),
          previousItems24h: Number(item.previousItems24h || 0),
          trendDirection: trend.direction,
          trendPercent: trend.percent,
          trendDiff: trend.diff
        };
      });

    const sortedAlerts = sortAlertsByPriority(alerts);
    const urgentAlerts = sortedAlerts.filter((item) => item.requiresImmediateAction);

    res.json({
      success: true,
      summary: {
        pendingFinanceReceipts,
        overdueBills,
        draftSchedules,
        pendingProfile,
        pendingAccessRequests,
        unreadContacts
      },
      alerts: sortedAlerts,
      urgentAlerts,
      recent: latestLogs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت هشدارهای مدیریتی' });
  }
});

router.get('/search', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      return res.json({
        success: true,
        q: '',
        users: [],
        memberships: [],
        orders: [],
        financeBills: [],
        financeReceipts: [],
        courses: [],
        schedules: [],
        homework: [],
        grades: [],
        subjects: [],
        requests: [],
        accessRequests: [],
        contacts: [],
        news: [],
        logs: [],
        enrollments: [],
        settings: []
      });
    }

    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escapedQuery, 'i');
    const numericQuery = Number(q);
    const exactNumber = Number.isFinite(numericQuery) ? numericQuery : null;

    const [users, courses, subjects] = await Promise.all([
      User.find({ $or: [{ name: rx }, { email: rx }] }).select('name email role orgRole status adminLevel').limit(20),
      Course.find({ $or: [{ title: rx }, { description: rx }, { category: rx }, { tags: rx }] })
        .select('title category level tags schoolClassRef')
        .sort({ createdAt: -1 })
        .limit(20),
      Subject.find({ $or: [{ name: rx }, { code: rx }, { grade: rx }] })
        .select('name code grade')
        .sort({ name: 1 })
        .limit(20)
    ]);

    const matchedUserIds = users.map((item) => item._id);
    const matchedCourseIds = courses.map((item) => item._id);

    const feeOrders = await FeeOrder.find({
      $or: [
        { orderNumber: rx },
        { title: rx },
        { periodLabel: rx },
        { note: rx },
        { status: rx },
        { currency: rx },
        { voidReason: rx },
        ...(matchedUserIds.length ? [{ student: { $in: matchedUserIds } }] : []),
        ...(matchedCourseIds.length ? [{ course: { $in: matchedCourseIds } }] : []),
        ...(exactNumber == null ? [] : [{ amountOriginal: exactNumber }, { amountDue: exactNumber }, { amountPaid: exactNumber }])
      ]
    })
      .populate('student', 'name email')
      .populate('course', 'title')
      .populate('classId', 'title code gradeLevel section')
      .sort({ createdAt: -1 })
      .limit(20);

    const matchedFeeOrderIds = feeOrders.map((item) => item._id);

    const [memberships, feePayments, requests, accessRequests, contacts, news, logs, enrollments, schedules, homework, grades, settingsDoc] = await Promise.all([
      StudentMembership.find({
        $or: [
          { status: rx },
          { source: rx },
          { note: rx },
          { rejectedReason: rx },
          ...(matchedUserIds.length ? [{ student: { $in: matchedUserIds } }] : []),
          ...(matchedCourseIds.length ? [{ course: { $in: matchedCourseIds } }] : [])
        ]
      }).populate('student', 'name email').populate('course', 'title').sort({ createdAt: -1 }).limit(20),
      FeePayment.find({
        $or: [
          { referenceNo: rx },
          { note: rx },
          { reviewNote: rx },
          { rejectReason: rx },
          { status: rx },
          { approvalStage: rx },
          { paymentMethod: rx },
          ...(matchedUserIds.length ? [{ student: { $in: matchedUserIds } }] : []),
          ...(matchedFeeOrderIds.length ? [{ feeOrderId: { $in: matchedFeeOrderIds } }] : []),
          ...(exactNumber == null ? [] : [{ amount: exactNumber }])
        ]
      })
        .populate('student', 'name email')
        .populate({
          path: 'feeOrderId',
          select: 'orderNumber course classId',
          populate: [
            { path: 'course', select: 'title' },
            { path: 'classId', select: 'title code gradeLevel section' }
          ]
        })
        .populate('classId', 'title code gradeLevel section')
        .sort({ createdAt: -1 })
        .limit(20),
      ProfileUpdateRequest.find({
        $or: [
          { 'requestedData.name': rx },
          { 'requestedData.email': rx },
          { 'followUp.note': rx },
          { 'followUp.status': rx },
          { 'followUp.assignedLevel': rx }
        ]
      }).populate('user', 'name email').sort({ createdAt: -1 }).limit(20),
      AccessRequest.find({
        $or: [
          { permission: rx },
          { route: rx },
          { requestNote: rx },
          { decisionNote: rx }
        ]
      }).populate('requester', 'name email').sort({ createdAt: -1 }).limit(20),
      ContactMessage.find({
        $or: [
          { name: rx },
          { email: rx },
          { message: rx },
          { 'followUp.note': rx },
          { 'followUp.status': rx },
          { 'followUp.assignedLevel': rx }
        ]
      }).sort({ createdAt: -1 }).limit(20),
      NewsItem.find({ $or: [{ title: rx }, { content: rx }] }).sort({ createdAt: -1 }).limit(20),
      ActivityLog.find({
        $or: [
          { action: rx },
          { actorRole: rx },
          { actorOrgRole: rx },
          { targetType: rx },
          { reason: rx },
          { route: rx },
          { ip: rx }
        ]
      }).sort({ createdAt: -1 }).limit(20),
      Enrollment.find({ $or: [{ studentName: rx }, { fatherName: rx }, { phone: rx }, { email: rx }] }).sort({ createdAt: -1 }).limit(20),
      Schedule.find({
        $or: [
          { subject: rx },
          { note: rx },
          { room: rx },
          { shift: rx },
          { visibility: rx },
          { date: rx },
          { startTime: rx },
          { endTime: rx },
          ...(matchedCourseIds.length ? [{ course: { $in: matchedCourseIds } }] : []),
          ...(matchedUserIds.length ? [{ instructor: { $in: matchedUserIds } }] : [])
        ]
      }).populate('course', 'title').populate('instructor', 'name email').sort({ date: -1, startTime: 1 }).limit(20),
      Homework.find({
        $or: [
          { title: rx },
          { description: rx },
          { attachment: rx },
          ...(matchedCourseIds.length ? [{ course: { $in: matchedCourseIds } }] : []),
          ...(matchedUserIds.length ? [{ createdBy: { $in: matchedUserIds } }] : [])
        ]
      }).populate('course', 'title').populate('createdBy', 'name').sort({ createdAt: -1 }).limit(20),
      Grade.find({
        $or: [
          { attachmentOriginalName: rx },
          ...(matchedCourseIds.length ? [{ course: { $in: matchedCourseIds } }] : []),
          ...(matchedUserIds.length ? [{ student: { $in: matchedUserIds } }] : []),
          ...(exactNumber == null ? [] : [{ totalScore: exactNumber }, { finalExamScore: exactNumber }, { term1Score: exactNumber }, { term2Score: exactNumber }])
        ]
      }).populate('student', 'name email').populate('course', 'title').sort({ updatedAt: -1 }).limit(20),
      SiteSettings.findOne({
        $or: [
          { brandName: rx },
          { brandSubtitle: rx },
          { contactLabel: rx },
          { contactPhone: rx },
          { contactEmail: rx },
          { contactAddress: rx },
          { topSearchPlaceholder: rx },
          { 'mainMenu.title': rx },
          { 'mainMenu.href': rx },
          { 'mainMenu.children.title': rx },
          { 'mainMenu.children.href': rx },
          { 'adminQuickLinks.title': rx },
          { 'adminQuickLinks.href': rx },
          { 'footerLinks.title': rx },
          { 'footerLinks.href': rx },
          { 'socialLinks.title': rx },
          { 'socialLinks.href': rx }
        ]
      }).select('brandName brandSubtitle contactLabel contactPhone contactEmail contactAddress')
    ]);

    const settings = settingsDoc ? [{
      _id: settingsDoc._id,
      brandName: settingsDoc.brandName || '',
      brandSubtitle: settingsDoc.brandSubtitle || '',
      contactLabel: settingsDoc.contactLabel || '',
      contactPhone: settingsDoc.contactPhone || '',
      contactEmail: settingsDoc.contactEmail || '',
      contactAddress: settingsDoc.contactAddress || ''
    }] : [];
    const membershipItems = memberships.map((item) => serializeMembershipAccessRecord(item));
    const financeBills = feeOrders.map((item) => serializeFinanceSearchOrder(item?.toObject ? item.toObject() : item));
    const financeReceipts = feePayments.map((item) => serializeFinanceSearchPayment(item?.toObject ? item.toObject() : item));

    res.json({
      success: true,
      q,
      users: users.map((item) => toManagedUserPayload(item)),
      memberships: membershipItems,
      orders: membershipItems,
      financeBills,
      financeReceipts,
      courses: courses.map((item) => {
        const plain = item?.toObject ? item.toObject() : { ...(item || {}) };
        return {
          ...plain,
          classId: plain.schoolClassRef ? String(plain.schoolClassRef) : '',
          courseId: String(plain._id || '')
        };
      }),
      schedules,
      homework,
      grades,
      subjects,
      requests,
      accessRequests,
      contacts,
      news,
      logs,
      enrollments,
      settings
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در دریافت جستجوی سراسری' });
  }
});

router.post('/client-activity', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim();
    const context = String(req.body?.context || '').trim();
    if (!CLIENT_ACTIVITY_ACTIONS.has(action)) {
      return res.status(400).json({ success: false, message: 'اقدام نامعتبر است' });
    }

    const actor = await User.findById(req.user?.id || '').select('role orgRole permissions adminLevel');
    const actorIdentity = actor ? serializeUserIdentity(actor) : null;
    if (!actor || actorIdentity?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    const effectivePermissions = resolvePermissions({
      role: actorIdentity.role,
      orgRole: actorIdentity.orgRole,
      permissions: actor.permissions || [],
      adminLevel: actorIdentity.adminLevel || actor.adminLevel || ''
    });
    const requiredPermission = CLIENT_ACTIVITY_ACTION_PERMISSIONS[action] || '';
    if (requiredPermission && !effectivePermissions.includes(requiredPermission)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }

    await logActivity({
      req,
      action,
      targetUser: req.user?.id || null,
      targetType: 'AdminClientActivity',
      targetId: context || 'admin',
      meta: {
        context,
        requiredPermission,
        source: 'frontend'
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'خطا در ثبت لاگ فعالیت' });
  }
});

router.get('/sla/config', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  res.json({
    success: true,
    timeouts: LEVEL_TIMEOUT_MINUTES
  });
});

router.post('/sla/run', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const result = await runSlaEscalationSweep(req.app, { force: true });
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'خطا در اجرای اتوماسیون SLA' });
  }
});

module.exports = router;
