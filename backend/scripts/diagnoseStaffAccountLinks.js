/**
 * عیب‌یابیِ هشدارِ «حساب استاد/کارمند بدون پروندهٔ رسمی» در کارهای فوریِ داشبورد.
 *
 * آن هشدار یعنی: حسابی با نقشِ instructor و وضعیتِ فعال وجود دارد که هیچ پروندهٔ
 * کارکنان (AfghanTeacher.linkedUserId) به آن وصل نیست. این اسکریپت برای هر حسابِ
 * بی‌پرونده حدسِ علت را هم می‌زند:
 *
 *   file_same_email  پرونده‌ای با همین ایمیل هست ولی وصل نشده → با بازکردنِ صفحهٔ
 *                    «کاربران و سطوح دسترسی» وصل می‌شود.
 *   file_same_name   پرونده‌ای با همین نام هست ولی ایمیلش فرق دارد → پیوندِ خودکار
 *                    نشناخته و حسابِ دومِ تکراری ساخته است؛ این حساب بی‌پرونده مانده.
 *   file_inactive    پرونده‌ای با همین نام/ایمیل هست ولی وضعیتش فعال نیست.
 *   no_file          هیچ پرونده‌ای پیدا نشد (حسابِ قدیمی/آزمایشی یا کارمندی که
 *                    پرونده‌اش ثبت نشده).
 *
 * فقط می‌خواند؛ هیچ چیزی را تغییر نمی‌دهد. پیش‌فرض روی دیتابیسِ .env است و فقط با
 * --uri صریح به دیتابیسِ دیگر (Atlas) وصل می‌شود.
 *
 *   node backend/scripts/diagnoseStaffAccountLinks.js
 *   node backend/scripts/diagnoseStaffAccountLinks.js --uri="..." --dns=8.8.8.8
 *   node backend/scripts/diagnoseStaffAccountLinks.js --limit=50
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const User = require('../models/User');
const AfghanTeacher = require('../models/AfghanTeacher');

const argv = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return fallback;
};

// Collections that point at a teacher's USER account. Before an account can be
// merged away, we must know which of the two accounts actually carries the work.
const USER_REFERENCES = [
  ['teacherassignments', 'teacherUserId', 'تخصیصِ استاد'],
  ['schedules', 'instructor', 'تقسیم اوقات'],
  ['instructorsubjects', 'instructor', 'مضمونِ استاد'],
  ['employeeattendances', 'linkedUser', 'حاضریِ کارکنان'],
  ['chatthreads', 'participants', 'گفتگو'],
  ['chatmessages', 'sender', 'پیامِ چت'],
  ['adminmessages', 'recipientUserIds', 'پیامِ مدیریت'],
  ['usernotifications', 'user', 'اعلان']
];

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
// Dari and Latin name parts both appear on a file; compare on either spelling.
const nameKeys = (teacher = {}) => {
  const p = teacher.personalInfo || {};
  return [
    `${text(p.firstName)} ${text(p.lastName)}`.trim(),
    `${text(p.firstNameDari)} ${text(p.lastNameDari)}`.trim()
  ].filter(Boolean).map((value) => value.replace(/\s+/g, ' ').toLowerCase());
};

async function run() {
  const uri = readArg('uri') || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const limit = Number(readArg('limit', '100')) || 100;
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  READ-ONLY\n`);

  const [instructorUsers, teachers] = await Promise.all([
    User.find({ role: 'instructor', status: 'active' }).select('name email createdAt orgRole').sort({ createdAt: 1 }).lean(),
    AfghanTeacher.find({})
      .select('personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari contactInfo.email employmentInfo.employeeId employmentInfo.position employmentInfo.currentSchool status linkedUserId')
      .lean()
  ]);

  const linkedUserIds = new Set(teachers.map((item) => text(item.linkedUserId)).filter(Boolean));
  const activeTeachers = teachers.filter((item) => text(item.status) === 'active');
  const fileByEmail = new Map();
  const fileByName = new Map();
  teachers.forEach((item) => {
    const email = lower(item.contactInfo?.email);
    if (email && !fileByEmail.has(email)) fileByEmail.set(email, item);
    nameKeys(item).forEach((key) => {
      if (key && !fileByName.has(key)) fileByName.set(key, item);
    });
  });

  const orphanUsers = instructorUsers.filter((user) => !linkedUserIds.has(text(user._id)));

  const db = mongoose.connection.db;
  const collectionNames = new Set((await db.listCollections().toArray()).map((item) => item.name));
  // "which records would move if this account were merged away"
  const referenceUsage = async (userId) => {
    const usage = {};
    for (const [collection, field, label] of USER_REFERENCES) {
      if (!collectionNames.has(collection)) continue;
      // eslint-disable-next-line no-await-in-loop
      const count = await db.collection(collection).countDocuments({ [field]: new mongoose.Types.ObjectId(userId) });
      if (count) usage[label] = count;
    }
    return usage;
  };
  const usersById = new Map(instructorUsers.map((user) => [text(user._id), user]));
  const fileLabel = (file) => (file
    ? `${nameKeys(file)[0] || '—'} | employeeId=${text(file.employmentInfo?.employeeId) || '—'} | status=${text(file.status)} | linked=${text(file.linkedUserId) || 'none'}`
    : '');

  const reasons = { file_same_email: 0, file_same_name: 0, file_inactive: 0, no_file: 0 };
  const rows = [];
  for (const user of orphanUsers.slice(0, limit)) {
    const email = lower(user.email);
    const byEmail = email ? fileByEmail.get(email) : null;
    const byName = fileByName.get(lower(user.name).replace(/\s+/g, ' ')) || null;
    const file = byEmail || byName || null;
    let reason = 'no_file';
    if (file && text(file.status) !== 'active') reason = 'file_inactive';
    else if (byEmail) reason = 'file_same_email';
    else if (byName) reason = 'file_same_name';
    reasons[reason] += 1;
    // eslint-disable-next-line no-await-in-loop
    const orphanUsage = await referenceUsage(text(user._id));
    const rivalId = file ? text(file.linkedUserId) : '';
    const rival = rivalId ? usersById.get(rivalId) : null;
    // eslint-disable-next-line no-await-in-loop
    const rivalUsage = rivalId ? await referenceUsage(rivalId) : {};
    rows.push({
      account: text(user.name) || '—',
      email: text(user.email),
      orgRole: text(user.orgRole),
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : '',
      syntheticEmail: /^teacher\.[a-f0-9]{24}@/i.test(text(user.email)),
      reason,
      usage: orphanUsage,
      matchedFile: fileLabel(file) || '—',
      fileLinkedTo: rival
        ? `${text(rival.name) || '—'} <${text(rival.email)}> created=${rival.createdAt ? new Date(rival.createdAt).toISOString().slice(0, 10) : ''}${/^teacher\.[a-f0-9]{24}@/i.test(text(rival.email)) ? ' [ایمیلِ ساختگی]' : ''}`
        : (rivalId ? `${rivalId} (حسابِ غیرفعال/ناموجود)` : '—'),
      fileLinkedUsage: rivalUsage
    });
  }

  const unlinkedActiveFiles = activeTeachers
    .filter((item) => !text(item.linkedUserId))
    .slice(0, limit)
    .map((item) => ({
      file: nameKeys(item)[0] || '—',
      employeeId: text(item.employmentInfo?.employeeId) || '—',
      email: text(item.contactInfo?.email) || '(بدون ایمیل)',
      position: text(item.employmentInfo?.position)
    }));

  // A file may legitimately link to an admin account (مدیر مکتب, مدیر مالی …),
  // so the link is checked against the accounts themselves, not just teachers.
  const linkedAccounts = linkedUserIds.size
    ? await User.find({ _id: { $in: [...linkedUserIds] } }).select('_id name email role orgRole status').lean()
    : [];
  const linkedAccountById = new Map(linkedAccounts.map((user) => [text(user._id), user]));
  const filesLinkedToUnknownUser = teachers
    .filter((item) => {
      const account = linkedAccountById.get(text(item.linkedUserId));
      return text(item.linkedUserId) && (!account || text(account.status) !== 'active');
    })
    .slice(0, limit)
    .map((item) => {
      const account = linkedAccountById.get(text(item.linkedUserId));
      return {
        file: nameKeys(item)[0] || '—',
        employeeId: text(item.employmentInfo?.employeeId) || '—',
        status: text(item.status),
        linkedUserId: text(item.linkedUserId),
        linkedAccount: account
          ? `${text(account.name)} <${text(account.email)}> [${text(account.orgRole) || text(account.role)}] status=${text(account.status)}`
          : 'حسابِ ناموجود'
      };
    });

  console.log(JSON.stringify({
    activeInstructorAccounts: instructorUsers.length,
    staffFilesTotal: teachers.length,
    staffFilesActive: activeTeachers.length,
    staffFilesLinked: linkedUserIds.size,
    staffFilesActiveWithoutLink: activeTeachers.filter((item) => !text(item.linkedUserId)).length,
    orphanAccounts: orphanUsers.length,
    dashboardFallbackNumber: Math.max(0, instructorUsers.length - activeTeachers.length),
    orphanReasons: reasons
  }, null, 2));

  console.log('\n— حساب‌های بدون پروندهٔ وصل‌شده —');
  rows.forEach((row) => console.log(JSON.stringify(row)));
  if (!rows.length) console.log('هیچ حسابِ بی‌پرونده‌ای نیست.');

  console.log('\n— پرونده‌های فعالی که هنوز به حساب وصل نشده‌اند —');
  unlinkedActiveFiles.forEach((row) => console.log(JSON.stringify(row)));
  if (!unlinkedActiveFiles.length) console.log('همهٔ پرونده‌های فعال وصل‌اند.');

  if (filesLinkedToUnknownUser.length) {
    console.log('\n— پرونده‌هایی که به حسابِ ناموجود/غیرفعال وصل‌اند —');
    filesLinkedToUnknownUser.forEach((row) => console.log(JSON.stringify(row)));
  }
}

run()
  .catch((error) => {
    console.error(`diagnoseStaffAccountLinks failed: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
