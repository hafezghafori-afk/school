const User = require('../models/User');
const mongoose = require('mongoose');
const { resolvePermissions } = require('../utils/permissions');
const { serializeUserIdentity } = require('../utils/userRole');

const LEGACY_ROLE_PERMISSIONS = Object.freeze({
  timetable_manager: 'manage_schedule',
  academic_manager: 'manage_content',
  registration_manager: 'manage_users'
});

const isTeacherRole = (value = '') => ['teacher', 'instructor', 'professor'].includes(String(value || '').trim().toLowerCase());

function checkRole(roles = []) {
  const expected = Array.isArray(roles)
    ? roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
    : [];

  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
      }

      if (!mongoose.isValidObjectId(req.user.id)) {
        return res.status(401).json({ success: false, message: 'نشست کاربر نامعتبر است. لطفاً دوباره وارد شوید.' });
      }

      const user = await User.findById(req.user.id).select('name role orgRole status permissions adminLevel');
      if (!user) {
        return res.status(401).json({ success: false, message: 'کاربر یافت نشد' });
      }

      const identity = serializeUserIdentity(user);
      const permissions = resolvePermissions({
        role: identity.role,
        orgRole: identity.orgRole,
        permissions: user.permissions || [],
        adminLevel: user.adminLevel || ''
      });

      const allowed = expected.some((role) => {
        if (role === 'admin') return identity.role === 'admin';
        if (role === 'principal') return identity.role === 'admin';
        if (role === 'student') return identity.role === 'student';
        if (role === 'parent') return identity.role === 'parent';
        if (isTeacherRole(role)) return identity.role === 'instructor';

        const permission = LEGACY_ROLE_PERMISSIONS[role];
        if (permission) return permissions.includes(permission);

        return identity.orgRole === role || String(user.adminLevel || '').trim().toLowerCase() === role;
      });

      if (!allowed) {
        return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      }

      return next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'خطا در بررسی دسترسی' });
    }
  };
}

module.exports = { checkRole };
