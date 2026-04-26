const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { serializeUserIdentity } = require('./userRole');

const MAX_UA_LENGTH = 320;
const MAX_REASON_LENGTH = 280;

function getClientIp(req) {
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return forwarded[0] || req?.ip || req?.connection?.remoteAddress || '';
}

function detectDevice(userAgent = '') {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/\b(bot|spider|crawler|curl|wget)\b/.test(ua)) return 'bot';
  if (/\b(android|iphone|ipad|mobile)\b/.test(ua)) return 'mobile';
  if (/\btablet\b/.test(ua)) return 'tablet';
  return 'desktop';
}

function normalizeReason(value = '') {
  return String(value || '').trim().slice(0, MAX_REASON_LENGTH);
}

function reasonFromRequestBody(req) {
  const body = req?.body || {};
  const candidates = [body.reason, body.note, body.decisionNote, body.requestNote, body.reviewNote];
  for (const item of candidates) {
    const normalized = normalizeReason(item);
    if (normalized) return normalized;
  }
  return '';
}

function actionFallbackReason(action = '') {
  const normalized = String(action || '').toLowerCase();
  if (normalized.includes('reject')) return 'rejected_by_reviewer';
  if (normalized.includes('approve')) return 'approved_by_reviewer';
  if (normalized.includes('delete') || normalized.includes('remove') || normalized.includes('void')) return 'destructive_operation';
  if (normalized.includes('change_role') || normalized.includes('permissions') || normalized.includes('admin_level')) return 'access_control_change';
  return '';
}

async function resolveActorIdentity(req) {
  const requestUser = req?.user || null;
  if (!requestUser) {
    return { role: '', orgRole: '', adminLevel: '', status: 'active' };
  }

  if (requestUser.orgRole || requestUser.adminLevel) {
    return serializeUserIdentity(requestUser);
  }

  if (!requestUser.id) {
    return serializeUserIdentity(requestUser);
  }

  try {
    const actor = await User.findById(requestUser.id).select('role orgRole adminLevel status');
    if (actor) return serializeUserIdentity(actor);
  } catch (error) {
    // fall through to token-derived identity
  }

  return serializeUserIdentity(requestUser);
}

async function logActivity({ req, action, targetUser, targetType, targetId, meta, reason }) {
  try {
    const requestMeta = meta && typeof meta === 'object' ? { ...meta } : {};
    const userAgent = String(req?.headers?.['user-agent'] || '').slice(0, MAX_UA_LENGTH);
    const actorIdentity = await resolveActorIdentity(req);
    const resolvedReason = normalizeReason(reason)
      || normalizeReason(requestMeta.reason)
      || reasonFromRequestBody(req)
      || actionFallbackReason(action);

    const payload = {
      actor: req?.user?.id || null,
      actorRole: actorIdentity.role || req?.user?.role || '',
      actorOrgRole: actorIdentity.orgRole || '',
      action,
      targetUser: targetUser || null,
      targetType: targetType || '',
      targetId: targetId || '',
      ip: getClientIp(req),
      userAgent,
      clientDevice: detectDevice(userAgent),
      httpMethod: String(req?.method || '').toUpperCase(),
      route: req?.originalUrl || req?.url || '',
      reason: resolvedReason,
      meta: {
        ...requestMeta,
        actorAdminLevel: requestMeta.actorAdminLevel || actorIdentity.adminLevel || undefined,
        requestId: String(req?.headers?.['x-request-id'] || '').trim() || undefined,
        source: requestMeta.source || 'backend'
      }
    };

    await ActivityLog.create(payload);
  } catch (err) {
    // silent fail
  }
}

module.exports = { logActivity, getClientIp, detectDevice };
