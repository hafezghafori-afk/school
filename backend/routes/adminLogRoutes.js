const express = require('express');
const ActivityLog = require('../models/ActivityLog');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

const escapeCsv = (value) => {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const buildFilter = (query) => {
  const filter = {};
  const reasonQuery = String(query.reason || '').trim();
  if (query.actor) filter.actor = query.actor;
  if (query.role) filter.actorRole = query.role;
  if (query.orgRole || query.org_role) filter.actorOrgRole = String(query.orgRole || query.org_role || '').trim();
  if (query.ip) filter.ip = query.ip;
  if (query.device) filter.clientDevice = query.device;
  if (query.route) filter.route = new RegExp(String(query.route).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (query.action) {
    filter.action = query.action;
  } else if (query.action_in) {
    const values = String(query.action_in || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (values.length) filter.action = { $in: values };
  }
  const sensitiveOnly = String(query.sensitive || '').trim() === 'true';
  if (reasonQuery && sensitiveOnly) {
    filter.reason = {
      $regex: reasonQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
      $ne: ''
    };
  } else if (reasonQuery) {
    filter.reason = {
      $regex: reasonQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i'
    };
  } else if (sensitiveOnly) {
    filter.reason = { $ne: '' };
  }
  if (query.date_from || query.date_to) {
    const dateFrom = parseDateOrNull(query.date_from);
    const dateTo = parseDateOrNull(query.date_to);
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = dateFrom;
      if (dateTo) filter.createdAt.$lte = dateTo;
    }
  }
  return filter;
};

router.get('/', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const items = await ActivityLog.find(filter)
      .populate('actor', 'name email role orgRole')
      .sort({ createdAt: -1 })
      .limit(500);
    res.json({ success: true, items });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0644\u0627\u06af\u200c\u0647\u0627' });
  }
});

router.get('/export.csv', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const items = await ActivityLog.find(filter)
      .populate('actor', 'name email role orgRole')
      .sort({ createdAt: -1 })
      .limit(5000);

    const header = [
      'createdAt',
      'actor',
      'actorName',
      'actorEmail',
      'actorRole',
      'actorOrgRole',
      'action',
      'targetType',
      'targetId',
      'ip',
      'device',
      'httpMethod',
      'route',
      'reason',
      'context',
      'source'
    ];
    const rows = [header.join(',')];

    for (const item of items) {
      rows.push([
        escapeCsv(item.createdAt ? item.createdAt.toISOString() : ''),
        escapeCsv(item.actor?._id || item.actor || ''),
        escapeCsv(item.actor?.name || ''),
        escapeCsv(item.actor?.email || ''),
        escapeCsv(item.actorRole || ''),
        escapeCsv(item.actorOrgRole || ''),
        escapeCsv(item.action || ''),
        escapeCsv(item.targetType || ''),
        escapeCsv(item.targetId || ''),
        escapeCsv(item.ip || ''),
        escapeCsv(item.clientDevice || ''),
        escapeCsv(item.httpMethod || ''),
        escapeCsv(item.route || ''),
        escapeCsv(item.reason || ''),
        escapeCsv(item.meta?.context || ''),
        escapeCsv(item.meta?.source || '')
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin-activity-logs.csv"');
    res.status(200).send(`\uFEFF${rows.join('\n')}`);
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062e\u0631\u0648\u062c\u06cc CSV \u0644\u0627\u06af\u200c\u0647\u0627' });
  }
});

module.exports = router;
