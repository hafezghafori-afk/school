const ACTIVE_STUDENT_MEMBERSHIP_STATUSES = Object.freeze(['active', 'transferred_in']);
const CURRENT_STUDENT_MEMBERSHIP_STATUSES = Object.freeze([
  ...ACTIVE_STUDENT_MEMBERSHIP_STATUSES,
  'pending',
  'suspended'
]);
const ENDED_STUDENT_MEMBERSHIP_STATUSES = Object.freeze([
  'transferred',
  'transferred_out',
  'graduated',
  'dropped',
  'expelled',
  'inactive',
  'rejected'
]);

const normalizeMembershipStatus = (value = '') => String(value || '').trim().toLowerCase();

const isActiveStudentMembershipStatus = (value = '') => (
  ACTIVE_STUDENT_MEMBERSHIP_STATUSES.includes(normalizeMembershipStatus(value))
);

const isCurrentStudentMembershipStatus = (value = '') => (
  CURRENT_STUDENT_MEMBERSHIP_STATUSES.includes(normalizeMembershipStatus(value))
);

const isEndedStudentMembershipStatus = (value = '') => (
  ENDED_STUDENT_MEMBERSHIP_STATUSES.includes(normalizeMembershipStatus(value))
);

module.exports = {
  ACTIVE_STUDENT_MEMBERSHIP_STATUSES,
  CURRENT_STUDENT_MEMBERSHIP_STATUSES,
  ENDED_STUDENT_MEMBERSHIP_STATUSES,
  isActiveStudentMembershipStatus,
  isCurrentStudentMembershipStatus,
  isEndedStudentMembershipStatus,
  normalizeMembershipStatus
};
