const express = require('express');
const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
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

const buildFilter = async (query) => {
  const filter = {};
  const reasonQuery = String(query.reason || '').trim();
  const actorQuery = String(query.actor_q || query.actorName || query.actor_name || '').trim();
  if (query.actor) {
    // .find()/.countDocuments() auto-cast a string to ObjectId, but .aggregate() ($match in
    // the /summary route) does not — so this must be cast explicitly or byAction comes back empty.
    const rawActor = String(query.actor).trim();
    filter.actor = mongoose.Types.ObjectId.isValid(rawActor)
      ? new mongoose.Types.ObjectId(rawActor)
      : rawActor;
  }
  if (actorQuery && !query.actor) {
    const safeActorQuery = actorQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      $or: [
        { name: { $regex: safeActorQuery, $options: 'i' } },
        { email: { $regex: safeActorQuery, $options: 'i' } }
      ]
    }).select('_id').limit(100).lean();
    const userIds = users.map((user) => user._id).filter(Boolean);
    filter.actor = userIds.length ? { $in: userIds } : { $in: [] };
  }
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
  const freeText = String(query.q || '').trim();
  if (freeText) {
    const safeText = freeText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const textRegex = new RegExp(safeText, 'i');
    filter.$or = [{ action: textRegex }, { route: textRegex }];
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

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(query.pageSize, 10) || DEFAULT_PAGE_SIZE)
  );
  return { page, pageSize, skip: (page - 1) * pageSize };
}

// Lightweight actor picker for the log/report UI. Deliberately separate from GET /api/admin/users
// (which requires manage_users/users.manage and returns permissions/adminLevel/status) so a
// view_reports-only admin can pick a teacher/admin to inspect without needing user-management access.
router.get('/actors', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const users = await User.find({ role: { $in: ['instructor', 'admin'] } })
      .select('name email role orgRole')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, items: users });
  } catch {
    res.status(500).json({ success: false, message: 'خطا در دریافت فهرست کاربران' });
  }
});

router.get('/', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const filter = await buildFilter(req.query);
    const { page, pageSize, skip } = parsePagination(req.query);
    const [items, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate('actor', 'name email role orgRole')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      ActivityLog.countDocuments(filter)
    ]);
    res.json({ success: true, items, total, page, pageSize });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u0644\u0627\u06af\u200c\u0647\u0627' });
  }
});

router.get('/summary', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const filter = await buildFilter(req.query);
    const sensitiveFilter = await buildFilter({ ...req.query, sensitive: 'true' });
    const [total, sensitiveTotal, byAction] = await Promise.all([
      ActivityLog.countDocuments(filter),
      ActivityLog.countDocuments(sensitiveFilter),
      ActivityLog.aggregate([
        { $match: filter },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ])
    ]);
    res.json({ success: true, total, sensitiveTotal, byAction });
  } catch {
    res.status(500).json({ success: false, message: '\u062e\u0637\u0627 \u062f\u0631 \u062f\u0631\u06cc\u0627\u0641\u062a \u062e\u0644\u0627\u0635\u0647' });
  }
});

router.get('/export.csv', requireAuth, requireRole(['admin']), requirePermission('view_reports'), async (req, res) => {
  try {
    const filter = await buildFilter(req.query);
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
