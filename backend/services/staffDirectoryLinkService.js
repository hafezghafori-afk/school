// Matching a personnel file (AfghanTeacher) to the instructor account that
// belongs to the same person.
//
// The account is the identity a teacher logs in with and that class/subject
// assignments, the timetable and chats point at; the file is the official
// record. They are tied together by AfghanTeacher.linkedUserId.
//
// Email used to be the only bridge, so a file whose contactInfo.email differed
// from the person's account (or was empty) produced a brand-new synthetic
// account — leaving the real account with no file, which is what the dashboard
// reports as «حساب استاد/کارمند بدون پروندهٔ رسمی». Names are therefore a
// second bridge, but only when exactly one unlinked account matches; anything
// ambiguous is left for a human instead of guessing.

// Collections that point at a teacher's USER account. Whoever merges two
// accounts must move or check these first.
const TEACHER_USER_REFERENCES = Object.freeze([
  ['teacherassignments', 'teacherUserId', 'تخصیصِ استاد'],
  ['schedules', 'instructor', 'تقسیم اوقات'],
  ['instructorsubjects', 'instructor', 'مضمونِ استاد'],
  ['employeeattendances', 'linkedUser', 'حاضریِ کارکنان'],
  ['chatthreads', 'participants', 'گفتگو'],
  ['chatmessages', 'sender', 'پیامِ چت'],
  ['adminmessages', 'recipientUserIds', 'پیامِ مدیریت'],
  ['usernotifications', 'user', 'اعلان']
]);

// `teacher.<24-hex>@<school>.local` — the address the auto-link invents when it
// cannot find the person's real account.
const SYNTHETIC_TEACHER_EMAIL_RX = /^teacher\.[0-9a-f]{24}@/i;

// A personnel file may belong to someone whose account is not a teacher account:
// مدیر مکتب, معاون, سرمعلم and the finance posts all hold `role: 'admin'`
// accounts. Only students and parents can never own a staff file.
const LINKABLE_ACCOUNT_ROLES = Object.freeze(['instructor', 'admin']);

// Positions that may get an account created for them automatically. A teacher
// needs one for classes and the timetable; a principal / admin / support post
// gets an account from a human who also picks its access level, so inventing an
// instructor account for them only creates a duplicate.
const AUTO_ACCOUNT_POSITIONS = Object.freeze(['teacher']);

// One person can hold two accounts for two jobs — a teacher account and, say, a
// مدیر مالی account (a real case on prod). When two accounts carry the same
// name, the file's «سمت» says which one the file belongs to: a teacher file
// belongs to the teaching account, a managerial file to the admin account.
const EXPECTED_ACCOUNT_ROLE_BY_POSITION = Object.freeze({
  teacher: 'instructor',
  principal: 'admin',
  vice_principal: 'admin',
  admin_staff: 'admin'
});

const normalizeEmail = (value = '') => String(value ?? '').trim().toLowerCase();

// ZWNJ and double spaces are typing noise in Dari names, not identity.
const normalizeName = (value = '') => String(value ?? '')
  .replace(/[‌‏‎]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

function teacherFileNameKeys(file = {}) {
  const person = file.personalInfo || {};
  return [...new Set([
    normalizeName(`${person.firstName || ''} ${person.lastName || ''}`),
    normalizeName(`${person.firstNameDari || ''} ${person.lastNameDari || ''}`)
  ])].filter(Boolean);
}

function isSyntheticTeacherEmail(value = '') {
  return SYNTHETIC_TEACHER_EMAIL_RX.test(normalizeEmail(value));
}

function isLinkableStaffAccount(account = {}) {
  return LINKABLE_ACCOUNT_ROLES.includes(String(account?.role || '').trim().toLowerCase())
    && String(account?.status || 'active').trim().toLowerCase() === 'active'
    && !isSyntheticTeacherEmail(account?.email);
}

function canAutoCreateAccountForPosition(position = '') {
  return AUTO_ACCOUNT_POSITIONS.includes(String(position || '').trim().toLowerCase());
}

/**
 * Picks the account a personnel file should link to.
 * @param {object} file AfghanTeacher document (lean)
 * @param {Array} accounts candidate accounts: { _id, name, email, role, status }
 * @param {Set<string>} linkedUserIds ids already claimed by another file
 * @returns {{ userId: string, via: 'email'|'name'|'ambiguous_name'|'none', candidates: string[] }}
 */
function pickAccountForTeacherFile({ file = {}, accounts = [], linkedUserIds = new Set() } = {}) {
  const pool = accounts.filter((account) => isLinkableStaffAccount(account));
  const email = normalizeEmail(file?.contactInfo?.email);
  if (email) {
    const byEmail = pool.find((account) => normalizeEmail(account?.email) === email);
    if (byEmail) return { userId: String(byEmail._id), via: 'email', candidates: [] };
  }

  const keys = teacherFileNameKeys(file);
  if (!keys.length) return { userId: '', via: 'none', candidates: [] };
  const candidates = pool.filter((account) => (
    !linkedUserIds.has(String(account?._id))
    && keys.includes(normalizeName(account?.name))
  ));
  if (candidates.length === 1) return { userId: String(candidates[0]._id), via: 'name', candidates: [] };
  if (candidates.length > 1) {
    const expectedRole = EXPECTED_ACCOUNT_ROLE_BY_POSITION[String(file?.employmentInfo?.position || '').trim().toLowerCase()] || '';
    const byRole = expectedRole
      ? candidates.filter((account) => String(account?.role || '').trim().toLowerCase() === expectedRole)
      : [];
    if (byRole.length === 1) return { userId: String(byRole[0]._id), via: 'name_position', candidates: [] };
    return { userId: '', via: 'ambiguous_name', candidates: candidates.map((account) => String(account._id)) };
  }
  return { userId: '', via: 'none', candidates: [] };
}

module.exports = {
  AUTO_ACCOUNT_POSITIONS,
  EXPECTED_ACCOUNT_ROLE_BY_POSITION,
  LINKABLE_ACCOUNT_ROLES,
  SYNTHETIC_TEACHER_EMAIL_RX,
  TEACHER_USER_REFERENCES,
  canAutoCreateAccountForPosition,
  isLinkableStaffAccount,
  isSyntheticTeacherEmail,
  normalizeEmail,
  normalizeName,
  pickAccountForTeacherFile,
  teacherFileNameKeys
};
