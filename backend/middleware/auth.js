const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { resolvePermissions } = require('../utils/permissions');
const { getJwtSecret } = require('../utils/env');

const JWT_SECRET = getJwtSecret();

function applyDemoSchoolScope(req, decoded = {}) {
  const schoolId = String(decoded.schoolId || '').trim();
  if (decoded.isDemo !== true || !schoolId) return;
  req.headers['x-school-id'] = schoolId;
  if (req.query) req.query.schoolId = schoolId;
  if (req.params && Object.prototype.hasOwnProperty.call(req.params, 'schoolId')) req.params.schoolId = schoolId;
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) req.body.schoolId = schoolId;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'احراز هویت لازم است' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    applyDemoSchoolScope(req, decoded);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'توکن نامعتبر است' });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    applyDemoSchoolScope(req, decoded);
  } catch {
    req.user = null;
  }
  return next();
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

module.exports = { applyDemoSchoolScope, requireAuth, optionalAuth, requireRole, requirePermission, requireAnyPermission };
