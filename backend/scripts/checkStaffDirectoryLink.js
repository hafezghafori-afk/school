const assert = require('assert');

// A personnel file must link to the instructor account the person already uses.
// Before the name bridge, a file whose email differed from that account got a
// synthetic account of its own and the real account stayed «بدون پروندهٔ رسمی».

const {
  canAutoCreateAccountForPosition,
  isLinkableStaffAccount,
  isSyntheticTeacherEmail,
  normalizeName,
  pickAccountForTeacherFile,
  teacherFileNameKeys
} = require('../services/staffDirectoryLinkService');

const file = (overrides = {}) => ({
  personalInfo: { firstName: '', lastName: '', firstNameDari: 'حسینه', lastNameDari: 'حمدی' },
  contactInfo: { email: '' },
  ...overrides
});

const realAccount = { _id: 'user-real', name: 'حسینه حمدی', email: 'hasinahamdi76@gmail.com', role: 'instructor', status: 'active' };
const syntheticAccount = { _id: 'user-synthetic', name: 'حسینه حمدی', email: 'teacher.6aa29440435da82ba5d3e75d@imangirlsschool.local', role: 'instructor', status: 'active' };
const otherAccount = { _id: 'user-other', name: 'صبرینه نادری', email: 'sabrina.nadiry33@gmail.com', role: 'instructor', status: 'active' };

// 1. Email wins when it matches.
assert.deepStrictEqual(
  pickAccountForTeacherFile({
    file: file({ contactInfo: { email: ' Hasinahamdi76@Gmail.com ' } }),
    accounts: [otherAccount, realAccount]
  }),
  { userId: 'user-real', via: 'email', candidates: [] }
);

// 2. No email on the file → the name finds the real account (the prod case).
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: file(), accounts: [otherAccount, realAccount] }),
  { userId: 'user-real', via: 'name', candidates: [] }
);

// 3. A different email on the file must not create a new account when the name
//    identifies exactly one unlinked account.
assert.deepStrictEqual(
  pickAccountForTeacherFile({
    file: file({ contactInfo: { email: 'typo@gmail.com' } }),
    accounts: [realAccount]
  }),
  { userId: 'user-real', via: 'name', candidates: [] }
);

// 4. The Latin spelling matches too, and ZWNJ / double spaces are ignored.
assert.deepStrictEqual(
  pickAccountForTeacherFile({
    file: file({ personalInfo: { firstName: 'Lamia', lastName: 'Ghafori', firstNameDari: 'لامعه', lastNameDari: 'غفوری' } }),
    accounts: [{ _id: 'user-latin', name: '  lamia   ghafori ', email: 'lamiaghafori@gmail.com', role: 'instructor', status: 'active' }]
  }),
  { userId: 'user-latin', via: 'name', candidates: [] }
);

// 4b. مدیر مکتب holds an `admin` account — her file must link to it instead of
//     getting a teacher account of its own.
const principalFile = file({
  personalInfo: { firstName: '', lastName: '', firstNameDari: 'فیروزه', lastNameDari: 'غفوری' },
  employmentInfo: { position: 'principal', employeeId: 'AF-IGS-KBL-0001' }
});
const principalAccount = { _id: 'user-principal', name: 'فیروزه غفوری', email: 'firoza@gmail.com', role: 'admin', orgRole: 'school_manager', status: 'active' };
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: principalFile, accounts: [principalAccount, realAccount] }),
  { userId: 'user-principal', via: 'name', candidates: [] }
);
assert.ok(isLinkableStaffAccount(principalAccount));
assert.ok(!isLinkableStaffAccount({ ...principalAccount, role: 'student' }), 'a student account is never a staff account');
assert.ok(!isLinkableStaffAccount({ ...principalAccount, status: 'inactive' }), 'an inactive account is not a link target');
// Only a teacher may get an account created automatically; a managerial post
// gets one from a human together with its access level.
assert.ok(canAutoCreateAccountForPosition('teacher'));
['principal', 'vice_principal', 'admin_staff', 'support_staff', ''].forEach((position) => {
  assert.ok(!canAutoCreateAccountForPosition(position), `position «${position}» must not auto-create an account`);
});
assert.strictEqual(normalizeName('لامعه‌غفوری  '), 'لامعه غفوری');

// 5. Accounts already claimed by another file are not stolen.
assert.deepStrictEqual(
  pickAccountForTeacherFile({
    file: file(),
    accounts: [realAccount],
    linkedUserIds: new Set(['user-real'])
  }),
  { userId: '', via: 'none', candidates: [] }
);

// 6. A previously invented synthetic account is never matched by name — merging
//    those away is the repair script's job, not the linker's.
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: file(), accounts: [syntheticAccount] }),
  { userId: '', via: 'none', candidates: [] }
);

// 7. Two unlinked accounts with the same name → no guess.
const ambiguous = pickAccountForTeacherFile({
  file: file(),
  accounts: [realAccount, { _id: 'user-twin', name: 'حسینه حمدی', email: 'hasina.twin@gmail.com', role: 'instructor', status: 'active' }]
});
assert.strictEqual(ambiguous.userId, '');
assert.strictEqual(ambiguous.via, 'ambiguous_name');
assert.deepStrictEqual(ambiguous.candidates.sort(), ['user-real', 'user-twin']);

// 7b. One person, two jobs, two accounts (a real prod case: لامعه غفوری is both
//     a teacher and مدیر مالی). The file's «سمت» decides which account it is.
const teachingAccount = { _id: 'user-teaching', name: 'لامعه غفوری', email: 'lamiaghafori@gmail.com', role: 'instructor', orgRole: 'instructor', status: 'active' };
const financeAccount = { _id: 'user-finance', name: 'لامعه غفوری', email: 'lamiaghafori7@gmail.com', role: 'admin', orgRole: 'finance_manager', status: 'active' };
const twoJobFile = (position) => file({
  personalInfo: { firstName: '', lastName: '', firstNameDari: 'لامعه', lastNameDari: 'غفوری' },
  employmentInfo: { position, employeeId: 'AF-IGS-KBL-0004' }
});
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: twoJobFile('teacher'), accounts: [financeAccount, teachingAccount] }),
  { userId: 'user-teaching', via: 'name_position', candidates: [] }
);
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: twoJobFile('admin_staff'), accounts: [financeAccount, teachingAccount] }),
  { userId: 'user-finance', via: 'name_position', candidates: [] }
);
// Without a position hint, two same-name accounts stay ambiguous.
assert.strictEqual(
  pickAccountForTeacherFile({ file: twoJobFile('support_staff'), accounts: [financeAccount, teachingAccount] }).via,
  'ambiguous_name'
);
// One account only: the position hint must not filter it away.
assert.deepStrictEqual(
  pickAccountForTeacherFile({ file: twoJobFile('teacher'), accounts: [financeAccount] }),
  { userId: 'user-finance', via: 'name', candidates: [] }
);

// 8. A file with no usable name at all cannot be matched by name.
assert.deepStrictEqual(
  pickAccountForTeacherFile({
    file: { personalInfo: {}, contactInfo: {} },
    accounts: [realAccount]
  }),
  { userId: '', via: 'none', candidates: [] }
);

assert.deepStrictEqual(teacherFileNameKeys(file()), ['حسینه حمدی']);
assert.ok(isSyntheticTeacherEmail('teacher.6aa29440435da82ba5d3e75d@imangirlsschool.local'));
assert.ok(!isSyntheticTeacherEmail('hasinahamdi76@gmail.com'));

console.log('[check:staff-directory-link] ok');
