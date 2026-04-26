const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { resolvePermissions } = require('../utils/permissions');
const { getJwtSecret } = require('../utils/env');

const JWT_SECRET = getJwtSecret();

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'توکن نامعتبر است' });
  }
}

function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    }
    next();
  };
}

async function resolveUserPermissions(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('role orgRole permissions adminLevel');
  if (!user) return null;
  return resolvePermissions({
    role: user.role,
    orgRole: user.orgRole,
    permissions: user.permissions || [],
    adminLevel: user.adminLevel || ''
  });
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
      }
      const permissions = await resolveUserPermissions(req.user.id);
      if (!permissions) {
        return res.status(401).json({ success: false, message: 'کاربر یافت نشد' });
      }
      if (!permissions.includes(permission)) {
        return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
      }
      next();
    } catch (error) {
      return res.status(500).json({ success: false, message: 'خطا در بررسی دسترسی' });
    }
  };
}

function requireAnyPermission(permissionList = []) {
  const expected = Array.isArray(permissionList) ? permissionList.map((item) => String(item || '').trim()).filter(Boolean) : [];
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
      }
      const permissions = await resolveUserPermissions(req.user.id);
      if (!permissions) {
        return res.status(401).json({ success: false, message: 'کاربر یافت نشد' });
      }
      if (!expected.length || expected.some((item) => permissions.includes(item))) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'خطا در بررسی دسترسی' });
    }
  };
}

module.exports = { requireAuth, requireRole, requirePermission, requireAnyPermission };
