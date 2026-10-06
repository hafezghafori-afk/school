// Who is expected to hand in a class's homework, and how to tell them about
// it. Kept out of homeworkRoutes so the route smoke check can stub it.

const StudentMembership = require('../models/StudentMembership');
const UserNotification = require('../models/UserNotification');
const { ACTIVE_STUDENT_MEMBERSHIP_STATUSES } = require('./studentMembershipStatus');
const { resolveAsasNumbersByUserIds } = require('./studentAdmissionNumber');

const idOf = (value) => String(value?._id || value || '').trim();

/**
 * Current, active students of a class, sorted by name.
 * @returns {Promise<Array<{ userId: string, name: string, email: string, admissionNo: string }>>}
 */
async function loadClassRoster(classId) {
  if (!classId) return [];
  const memberships = await StudentMembership.find({
    classId,
    isCurrent: true,
    status: { $in: ACTIVE_STUDENT_MEMBERSHIP_STATUSES }
  })
    .populate('student', 'name email')
    .populate('studentId', 'admissionNo fullName')
    .lean();

  const asasNumbers = await resolveAsasNumbersByUserIds(memberships.map((item) => item.student));
  const seen = new Set();
  const roster = [];
  memberships.forEach((membership) => {
    const userId = idOf(membership.student);
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    roster.push({
      userId,
      name: membership.student?.name || membership.studentId?.fullName || '',
      email: membership.student?.email || '',
      admissionNo: String(membership.studentId?.admissionNo || '').trim() || asasNumbers.get(userId) || ''
    });
  });
  return roster.sort((left, right) => left.name.localeCompare(right.name, 'fa'));
}

/** Admission numbers for students who are no longer on the roster. */
async function resolveAdmissionNumbers(userIds = []) {
  return resolveAsasNumbersByUserIds(userIds);
}

async function notifyStudents(userIds = [], { title, message } = {}) {
  const ids = [...new Set(userIds.map(idOf).filter(Boolean))];
  if (!ids.length || !title || !message) return 0;
  await UserNotification.insertMany(ids.map((user) => ({ user, title, message, type: 'homework' })));
  return ids.length;
}

module.exports = { loadClassRoster, resolveAdmissionNumbers, notifyStudents };
