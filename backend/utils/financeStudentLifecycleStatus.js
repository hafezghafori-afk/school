// Bridges the academic lifecycle status (set by the academic manager via
// studentLifecycleService, stored on StudentMembership.status) into the
// finance module so that debtor lists, bill lists, and payment lists can
// show whether a student is still enrolled instead of looking identical to
// an active student. See studentLifecycleService.SUPPORTED_ACTIONS for the
// actions that drive these statuses.
const mongoose = require('mongoose');
const StudentMembership = require('../models/StudentMembership');

// tone keys map to CSS classes added in AdminFinance.css
// (.finance-status-badge.<tone>)
const STUDENT_STATUS_BADGES = Object.freeze({
  active: { label: 'فعال', tone: 'active' },
  transferred_in: { label: 'فعال (تبدیلی ورودی)', tone: 'active' },
  pending: { label: 'در انتظار تایید', tone: 'pending' },
  suspended: { label: 'معلق', tone: 'suspended' },
  transferred: { label: 'تبدیل‌شده', tone: 'transferred' },
  transferred_out: { label: 'تبدیل‌شده', tone: 'transferred' },
  dropped: { label: 'منفک‌شده', tone: 'dropped' },
  expelled: { label: 'محروم‌شده', tone: 'expelled' },
  graduated: { label: 'فارغ‌التحصیل', tone: 'graduated' },
  inactive: { label: 'غیرفعال', tone: 'inactive' },
  rejected: { label: 'ردشده', tone: 'inactive' }
});

const DEFAULT_STUDENT_STATUS_BADGE = Object.freeze({ label: '', tone: 'unknown' });

function getStudentStatusBadge(status) {
  const key = String(status || '').trim().toLowerCase();
  return STUDENT_STATUS_BADGES[key] || DEFAULT_STUDENT_STATUS_BADGE;
}

// A membership status counts as "left" when it's not one of the statuses a
// currently-enrolled student can be in (mirrors CURRENT_STUDENT_MEMBERSHIP_STATUSES
// in studentMembershipStatus.js, duplicated narrowly here to avoid a second
// active/ended split just for badge coloring).
const CURRENT_STATUS_KEYS = new Set(['active', 'transferred_in', 'pending', 'suspended']);

function hasStudentLeft(status) {
  const key = String(status || '').trim().toLowerCase();
  return Boolean(key) && !CURRENT_STATUS_KEYS.has(key);
}

/**
 * Batch-loads each student's most authoritative membership status, keyed by
 * their User id (the `student` field shared by
 * FeeOrder/FinanceBill/FeePayment/StudentMembership).
 *
 * Important: a membership that has ENDED (dropout/expulsion/transfer_out/...)
 * has isCurrent forced to false by StudentMembership's pre-save hook - that's
 * correct for "is this student in an active class roster" but it means a
 * naive `isCurrent: true` filter finds nothing for a departed student and
 * silently reports them as "unknown" instead of "dropped"/"transferred"/etc.
 * So for each student we take their isCurrent:true row if one exists,
 * otherwise fall back to their most recently ended row.
 *
 * @param {Array} studentUserIds - raw ids or populated {_id} objects
 * @returns {Promise<Map<string, string>>} studentUserId -> membership status
 */
async function loadCurrentMembershipStatusMap(studentUserIds = []) {
  const ids = Array.from(new Set(
    (Array.isArray(studentUserIds) ? studentUserIds : [])
      .map((id) => String(id?._id || id || '').trim())
      .filter((id) => mongoose.isValidObjectId(id))
  ));
  if (!ids.length) return new Map();

  const rows = await StudentMembership.aggregate([
    { $match: { student: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
    { $sort: { isCurrent: -1, endedAt: -1, updatedAt: -1 } },
    { $group: { _id: '$student', status: { $first: '$status' } } }
  ]);

  const map = new Map();
  rows.forEach((item) => {
    const key = String(item._id || '').trim();
    if (key) map.set(key, item.status);
  });
  return map;
}

/**
 * Spreads lifecycleStatus/lifecycleStatusLabel/lifecycleStatusTone onto a
 * plain row object, looked up from a Map built by loadCurrentMembershipStatusMap.
 * studentUserId may be a raw id or a populated { _id, ... } object.
 */
function attachLifecycleBadge(row, studentUserId, statusMap) {
  const key = String(studentUserId?._id || studentUserId || '').trim();
  const status = statusMap ? statusMap.get(key) : undefined;
  const badge = getStudentStatusBadge(status);
  return {
    ...row,
    lifecycleStatus: status || '',
    lifecycleStatusLabel: badge.label,
    lifecycleStatusTone: badge.tone
  };
}

module.exports = {
  STUDENT_STATUS_BADGES,
  DEFAULT_STUDENT_STATUS_BADGE,
  getStudentStatusBadge,
  hasStudentLeft,
  loadCurrentMembershipStatusMap,
  attachLifecycleBadge
};
