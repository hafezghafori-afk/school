// A homework's due date is picked as a calendar day ("YYYY-MM-DD" from the
// date input) and stored as that day's UTC midnight. A submission counts as
// late only once that whole day has passed in Kabul (UTC+4:30, no DST), so a
// student handing in at 11pm on the due day is still on time.

const DAY_MS = 24 * 60 * 60 * 1000;
const KABUL_OFFSET_MS = 4.5 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getHomeworkDeadline(dueDate) {
  const due = toDate(dueDate);
  if (!due) return null;
  const dayStartUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return new Date(dayStartUtc + DAY_MS - KABUL_OFFSET_MS);
}

function describeLateness(submittedAt, dueDate) {
  const deadline = getHomeworkDeadline(dueDate);
  const submitted = toDate(submittedAt);
  if (!deadline || !submitted || submitted.getTime() <= deadline.getTime()) {
    return { isLate: false, lateDays: 0 };
  }
  return { isLate: true, lateDays: Math.ceil((submitted.getTime() - deadline.getTime()) / DAY_MS) };
}

function isHomeworkOverdue(dueDate, now = new Date()) {
  const deadline = getHomeworkDeadline(dueDate);
  return Boolean(deadline && now.getTime() > deadline.getTime());
}

// Rows written before `status` existed carry only a score, and mongoose fills
// the missing field with its 'submitted' default on read - so a scored
// 'submitted' row is a legacy graded one. (Resubmitting clears the score.)
function resolveSubmissionStatus(submission = {}) {
  const status = String(submission?.status || '').trim();
  if (status === 'revision_requested') return status;
  if (status === 'graded' || typeof submission?.score === 'number') return 'graded';
  return 'submitted';
}

module.exports = {
  getHomeworkDeadline,
  describeLateness,
  isHomeworkOverdue,
  resolveSubmissionStatus
};
